/**
 * 适配层**健壮性回归**（`pnpm verify:agent:robust`）
 * ============================================================================
 * 为什么单独有这个脚本：P5 的独立对抗性复核（`reports/_p5r-REVIEW.md`）用**假后端**造了
 * 32 个畸形场景，抓出一批"只有畸形输入才暴露"的缺陷（D-2/D-3/D-4/D-5/D-6/D-8/D-9/
 * D-16/D-17/D-18）。那些场景**不适合塞进 `verify:ui`**：
 *   · 它们依赖"后端什么时候回什么字节"，真后端给不了（`langgraph dev` 是正常服务）；
 *   · `verify:ui` 要起 Chrome + preview 才能跑，而这一组是**纯逻辑**，该在 CI 里几秒跑完。
 *
 * 做法（**不依赖真后端、不起浏览器、不起服务**）：
 *   ① 用 esbuild（Astro 自己的依赖）把 `src/utils/agent-client.ts` 打成一份临时 ESM，
 *      放进 `reports/`（已 gitignore）再 `import()` —— 这样测的是**真源码**，
 *      不是副本；改一处代码，这里立刻跟着变；
 *   ② 用 `globalThis.fetch` 的**假后端**返回手工拼的畸形 SSE（含分块/半截/不闭合/超长）；
 *   ③ 用现成的测试注入钩子 `globalThis.__imissAgentConfig`（白名单字段）改 `baseUrl`。
 *
 * ⚠️ 这个脚本**只断言适配层**（`agent-client.ts`）。凡是要"看到气泡长什么样"的
 * （长答复可读、禁词上屏、输入框反馈）留 `verify:ui` 的 R-AGT 段，那边才有真 DOM 与截图。
 *
 * 用法：`pnpm verify:agent:robust`（零外部依赖，退出码：有失败 = 1）
 * 产物：`reports/verify-agent-robust.log`（UTF-8 全文）、`reports/verify-agent-robust.json`
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const root = process.cwd();
const OUT_DIR = path.resolve(root, "reports");
const BUNDLE = path.join(OUT_DIR, "_agent-client.bundle.mjs");

const results = [];
const record = (id, desc, pass, detail = "") =>
	results.push({ id, desc, pass: Boolean(pass), detail });

/* ── SSE 造假工具 ────────────────────────────────────────────────────────── */

/** 拼一个 `event:` / 多行 `data:` / 空行结尾的事件（默认用 CRLF，与真后端一致） */
const sse = (name, data, { crlf = true, blank = true } = {}) => {
	const eol = crlf ? "\r\n" : "\n";
	const dataLines = String(data)
		.split("\n")
		.map((l) => `data: ${l}`)
		.join(eol);
	return `event: ${name}${eol}${dataLines}${eol}${blank ? eol : ""}`;
};
const jsonSSE = (name, obj, opts) => sse(name, JSON.stringify(obj), opts);
/** 心跳（注释行） */
const hb = () => ":\r\n\r\n";
/** 一个 `values` 事件体：`messages` 里塞一条 ai 答复 */
const valuesWith = (text, extra = {}) =>
	jsonSSE("values", { messages: [{ type: "ai", content: text }], ...extra });

/** 把一个字符串按 chunk 边界切片，做成 `Response.body`（模拟真实网络分块） */
function streamResponse(chunks, { status = 200, delayMs = 0, hangMs = 0 } = {}) {
	const enc = new TextEncoder();
	return new Response(
		new ReadableStream({
			start(controller) {
				let i = 0;
				const step = () => {
					if (i >= chunks.length) {
						if (hangMs > 0) {
							// 模拟"流还开着但不再发字节"（`/state` 挂住那一类）
							setTimeout(() => {
								try {
									controller.close();
								} catch {}
							}, hangMs);
							return;
						}
						try {
							controller.close();
						} catch {}
						return;
					}
					controller.enqueue(enc.encode(chunks[i++]));
					setTimeout(step, delayMs);
				};
				step();
			},
		}),
		{ status, headers: { "content-type": "text/event-stream" } },
	);
}

/**
 * 假后端：按 URL 后缀 + 可编程的应答表作答，并把**收到的请求**记进 `log`。
 * 判据全部落在"前端到底发了什么"上（与复核的 `/__log` 同一思路）。
 */
function makeBackend(routes) {
	const log = [];
	const fetchImpl = async (url, init = {}) => {
		const u = String(url);
		const method = (init.method ?? "GET").toUpperCase();
		const body = init.body ? JSON.parse(String(init.body)) : null;
		log.push({ url: u, method, body, at: Date.now() });
		for (const r of routes) {
			if (!r.match(u, method)) continue;
			const out = await r.handle({ url: u, method, body, log });
			if (out !== undefined) return out;
		}
		return new Response(JSON.stringify({ detail: "no route" }), {
			status: 404,
			headers: { "content-type": "application/json" },
		});
	};
	return { log, fetchImpl };
}

const okJSON = (obj) =>
	new Response(JSON.stringify(obj), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
const statusOnly = (status, text = "") =>
	new Response(text || `HTTP ${status}`, { status });
/** 常用的"/ok + /assistants/search + POST /threads"三条前置路由 */
const preambleRoutes = () => [
	{ match: (u, m) => u.endsWith("/ok") && m === "GET", handle: () => okJSON({ ok: true }) },
	{
		match: (u, m) => u.endsWith("/assistants/search") && m === "POST",
		handle: () => okJSON([{ graph_id: "blog_agent", assistant_id: "asst-1" }]),
	},
];

/* ── 主流程 ──────────────────────────────────────────────────────────────── */

const lines = [];
const say = (s = "") => {
	lines.push(s);
	console.log(s);
};

async function main() {
	const startedAt = new Date();
	say("适配层健壮性回归（pnpm verify:agent:robust）");
	say("契约依据：ARCH.md §8.9 ｜ 反例来源：reports/_p5r-REVIEW.md（D-2~D-18）");
	say("");

	/* ── 0. 把真源码打进来（esbuild，Astro 自带依赖）────────────────────── */
	await fs.mkdir(OUT_DIR, { recursive: true });
	await esbuild.build({
		entryPoints: [path.resolve(root, "src/utils/agent-client.ts")],
		bundle: true,
		format: "esm",
		platform: "neutral",
		write: true,
		outfile: BUNDLE,
		tsconfig: path.resolve(root, "tsconfig.json"),
		logLevel: "silent",
	});
	const mod = await import(`${pathToFileURL(BUNDLE).href}?t=${Date.now()}`);
	say(`已把 src/utils/agent-client.ts 打成临时模块（${(await fs.stat(BUNDLE)).size} 字节）`);
	say("");

	const need = [
		"askAemeath",
		"resetSession",
		"sessionSnapshot",
		"pickLiveConfig",
		"SSEParser",
		"normalizeNewlines",
		"leakMarkerIn",
		"LEAK_MARKERS",
	];
	const missing = need.filter((k) => mod[k] === undefined);
	record(
		"BUNDLE",
		"适配层能被打包成可测模块（改了源码这里就跟着变）",
		missing.length === 0,
		missing.length ? `缺导出：${missing.join(", ")}` : `导出齐全（${need.join(", ")}）`,
	);
	if (missing.length) return finish(startedAt);

	/* ── 1. SSE 解析器：三个纯函数级反例（D-17 / D-18 / D-16 的第一道闸）── */
	{
		// ① D-17：多行 `data:` 的 JSON 被"跨 chunk 的 CRLF"劈开 → 必须还是一个完整事件
		const payload = { messages: [{ type: "ai", content: "被劈开的答复" }] };
		const full = jsonSSE("values", payload);
		// 切点落在 `\r` 与 `\n` 之间（复核 `split-crlf-multiline` 的同一手法）
		const cut = full.indexOf("\r\n", full.indexOf("data: ") + 40) + 1;
		const events = [];
		const p1 = new mod.SSEParser((ev) => events.push(ev));
		p1.push(full.slice(0, cut));
		p1.push(full.slice(cut));
		p1.flush();
		let parsed = null;
		try {
			parsed = JSON.parse(events[0]?.data ?? "");
		} catch {}
		record(
			"SSE",
			"[D-17] 多行 data 事件被跨 chunk 的 `\\r` 劈开时仍解析成一个完整事件",
			events.length === 1 && parsed?.messages?.[0]?.content === "被劈开的答复",
			`切成 2 个 chunk（切点在 \\r 与 \\n 之间）→ 解析出 ${events.length} 个事件${events.length ? `、name=${events[0].name}` : ""}；内容 ${JSON.stringify(parsed?.messages?.[0]?.content ?? null)}`,
		);

		// 单行 data 的 CRLF 切断（复核说这种无害，这里把它钉成"必须继续无害"）
		const one = valuesWith("单行 CRLF 切断");
		const cut2 = one.indexOf("\r\n") + 1;
		const ev2 = [];
		const p2 = new mod.SSEParser((ev) => ev2.push(ev));
		p2.push(one.slice(0, cut2));
		p2.push(one.slice(cut2));
		p2.flush();
		record(
			"SSE",
			"[D-17 对照] 单行 data 的 CRLF 切断照常解析",
			ev2.length === 1 && JSON.parse(ev2[0].data).messages[0].content === "单行 CRLF 切断",
			`解析出 ${ev2.length} 个事件`,
		);

		// ② D-18：事件没有以空行结尾就 EOF → 规范要求派发。
		// ⚠️ 构造要精确：`event:` 行后接**裸 `\n`**（不是 `\r\n`），否则末行的 `\r\n` 会被
		//    解析器按普通行尾消费掉，测的就不是"EOF 未闭合"这条了（写这个脚本时踩过）。
		const noBlank = `event: values\r\ndata: ${JSON.stringify({
			messages: [{ type: "ai", content: "没有空行结尾" }],
		})}`;
		const ev3 = [];
		const p3 = new mod.SSEParser((ev) => ev3.push(ev));
		p3.push(noBlank);
		const beforeFlush = ev3.length;
		p3.flush();
		record(
			"SSE",
			"[D-18] 事件没以空行结尾就 EOF：flush 之后仍能派发（SSE 规范）",
			beforeFlush === 0 && ev3.length === 1,
			`flush 前 ${beforeFlush} 个、flush 后 ${ev3.length} 个（若不 flush 就丢事件 → 气泡假降级）`,
		);

		// ③ D-16 第一道闸：单事件超过 64KB → 触发 overflow 回调，且不再往下吐
		let overflow = null;
		const ev4 = [];
		const p4 = new mod.SSEParser(
			(ev) => ev4.push(ev),
			(reason) => {
				overflow = reason;
			},
		);
		const huge = `event: values\r\ndata: ${"x".repeat(70 * 1024)}`;
		p4.push(huge);
		record(
			"SSE",
			"[D-16] 单事件超过 64KB 上限 → 报 overflow、事件不进解析结果",
			overflow === "buffer-overflow" && ev4.length === 0,
			`收到 ${(70 * 1024).toLocaleString()} 字节单事件（无换行）→ overflow=${JSON.stringify(overflow)}、已吐事件 ${ev4.length} 个`,
		);

		// ④ 心跳与同 chunk 多事件（复核 `multi-per-chunk`：必须继续正常）
		const ev5 = [];
		const p5 = new mod.SSEParser((ev) => ev5.push(ev));
		p5.push(hb() + valuesWith("同块第一个") + hb() + valuesWith("同块第二个"));
		p5.flush();
		record(
			"SSE",
			"[对照] 一个 chunk 里多个事件 + 心跳：心跳被跳过、两个事件都到",
			ev5.length === 2 &&
				JSON.parse(ev5[0].data).messages[0].content === "同块第一个" &&
				JSON.parse(ev5[1].data).messages[0].content === "同块第二个",
			`解析出 ${ev5.length} 个事件、心跳 0 影响`,
		);
	}

	/* ── 2. 禁词闸门（D-6）──────────────────────────────────────────────── */
	{
		const markers = mod.LEAK_MARKERS ?? [];
		const schemaLine = "可用的表:blog, blog_content";
		record(
			"GATE",
			"[D-6] 禁词闸门对 schema 行判定为「命中」",
			mod.leakMarkerIn(schemaLine) === "可用的表" &&
				mod.leakMarkerIn("CREATE TABLE blog ( id BIGINT … )") === "CREATE TABLE" &&
				mod.leakMarkerIn("爱弥斯正常的一句话") === null,
			`禁词表 ${JSON.stringify(markers)}；「${schemaLine}」→ ${JSON.stringify(mod.leakMarkerIn(schemaLine))}；正常答复 → ${JSON.stringify(mod.leakMarkerIn("爱弥斯正常的一句话"))}`,
		);

		// 端到端：把"最后一条 ai 就是 schema 行"喂给适配层 → 必须降级、且**一个字都不许回**
		const backend = makeBackend([
			...preambleRoutes(),
			{ match: (u, m) => u.endsWith("/threads") && m === "POST", handle: () => okJSON({ thread_id: "t1" }) },
			{
				match: (u, m) => u.endsWith("/runs/stream") && m === "POST",
				handle: () =>
					streamResponse([jsonSSE("values", { messages: [{ type: "ai", content: schemaLine }] })]),
			},
		]);
		await withFakeBackend(mod, backend, async () => {
			const turn = await mod.askAemeath("帮我找几篇讲 C++ 的文章");
			record(
				"GATE",
				"[D-6] 端到端：最后一条 ai 是 schema 行 → 不上屏、走 mock 台词",
				turn.fromMock === true &&
					turn.status === "fallback" &&
					!turn.text.includes("可用的表") &&
					!/CREATE TABLE/.test(turn.text) &&
					(turn.reason ?? "").includes("禁词"),
				`status=${turn.status}、fromMock=${turn.fromMock}、reason=${JSON.stringify(turn.reason)}、气泡文本「${turn.text.replace(/\n/g, "⏎")}」`,
			);
		});
	}

	/* ── 3. 答复去重闸门（D-5）────────────────────────────────────────── */
	{
		const backend = makeBackend([
			...preambleRoutes(),
			{ match: (u, m) => u.endsWith("/threads") && m === "POST", handle: () => okJSON({ thread_id: "t1" }) },
			{
				match: (u, m) => u.endsWith("/runs/stream") && m === "POST",
				handle: () =>
					streamResponse([valuesWith("收好了。", { __interrupt__: [] })]),
			},
		]);
		await withFakeBackend(mod, backend, async () => {
			// 用户那句 40 字 > 后端答复 4 字：旧实现拿用户那句当去重基线 → 真答复被丢、假降级
			const longUser = "这是用户很长很长的一句话用来复现那个去重闸门的问题请回我";
			const turn = await mod.askAemeath(longUser, {
				lastReply: "上一轮的反问原文",
			});
			record(
				"ASK",
				"[D-5] 答复（4 字）比用户输入（40 字）短时**不得**判成空答复",
				turn.text.includes("收好了") && turn.fromMock === false && turn.status === "answer",
				`用户 ${longUser.length} 字 / 答复「收好了。」4 字 → status=${turn.status}、fromMock=${turn.fromMock}、气泡「${turn.text.replace(/\n/g, "⏎")}」`,
			);
		});
	}

	/* ── 4. 失效自愈（D-3）────────────────────────────────────────────── */
	{
		let threadsCreated = 0;
		let runs = 0;
		const backend = makeBackend([
			...preambleRoutes(),
			{
				match: (u, m) => u.endsWith("/threads") && m === "POST",
				handle: () => {
					threadsCreated++;
					return okJSON({ thread_id: `t${threadsCreated}` });
				},
			},
			{
				match: (u, m) => u.endsWith("/runs/stream") && m === "POST",
				handle: ({ url }) => {
					runs++;
					// 第 1 次跑在 t1 上成功；之后 t1 一律 404（模拟后端重启 → 旧 thread 失效）
					if (runs === 1) return streamResponse([valuesWith("第一轮的答复")]);
					if (url.includes("/threads/t1/")) return statusOnly(404, "Thread not found");
					return streamResponse([valuesWith("重启之后也能答")]);
				},
			},
		]);
		await withFakeBackend(mod, backend, async () => {
			const a = await mod.askAemeath("第一问");
			// ⚠️ 快照必须在"这一轮的假后端注入还开着"时取：`withFakeBackend` 收尾会
			//    `resetSession()`（清空状态），拿到那边去比就永远是 false（写这个断言时踩到）。
			const snap1 = mod.sessionSnapshot();
			const b = await mod.askAemeath("第二问");
			const snap2 = mod.sessionSnapshot();
			const runsUrls = backend.log.filter((x) => x.url.endsWith("/runs/stream")).map((x) => x.url);
			record(
				"HEAL",
				"[D-3] thread 失效（404）→ 清缓存、重新建线程、**重试一次**并成功",
				a.text.includes("第一轮的答复") &&
					b.text.includes("重启之后也能答") &&
					threadsCreated >= 2 &&
					snap1.hasThread === true &&
					snap2.hasThread === true,
				`第 1 问「${a.text}」、第 2 问「${b.text}」（status=${b.status}、fromMock=${b.fromMock}）；POST /threads 共 ${threadsCreated} 次；runs 序列 ${JSON.stringify(runsUrls.map((u) => u.replace(/^.*\/threads\//, "")))}；hasThread ${snap1.hasThread} → ${snap2.hasThread}；判定 ${JSON.stringify({ a: a.text.includes("第一轮的答复"), b: b.text.includes("重启之后也能答"), threads: threadsCreated >= 2, s1: snap1.hasThread, s2: snap2.hasThread })}`,
			);
			// 自愈的关键副作用：**建线程那道 5 秒短缓存不许挡住"新建"**（写这个脚本时实测到
			// "清了缓存却建不出新线程"的二次 bug：时间戳连成功也记，导致自愈被缓存吃掉）
			record(
				"HEAL",
				"[D-3] 自愈不被「建线程短缓存」挡住（成功建线程后时间戳归零）",
				snap2.threadAttemptAgeMs === -1,
				`第二问之后 threadAttemptAgeMs=${snap2.threadAttemptAgeMs}（-1 表示"没有待冷却的失败"）`,
			);
			record(
				"HEAL",
				"[D-3] 自愈只做一次（不会把「服务真挂了」变成无限重试）",
				runs === 3 && runsUrls[1]?.includes("/threads/t1/") && runsUrls[2]?.includes("/threads/t2/"),
				`第 2 问先在失效的 t1 上撞一次（404）→ 自愈建 t2 → 重试一次成功；runs/stream 共 ${runs} 次：${JSON.stringify(runsUrls.map((u) => u.replace(/^.*\/threads\//, "")))}`,
			);
			// 顺带钉住一个以前被 D-3 掩盖的 bug：**会话线程必须跨轮复用**
			// （契约 §8.9.1「一个会话一个线程，`thread_id` 由前端持有」）。
			// 旧实现从来没往模块级 `threadId` 写值 → 每问一句都建新线程，上下文完全没接上。
			record(
				"HEAL",
				"[§8.9.1] 线程跨轮复用：第 2 问先打在**同一个** thread 上（不是每问都新建）",
				runsUrls[1]?.includes("/threads/t1/") === true && threadsCreated === 2,
				`第 1 问建 t1；第 2 问仍先打 t1（失效 404）→ 自愈才建 t2。POST /threads 共 ${threadsCreated} 次（不是每问一次）`,
			);
		});

		// assistant_id 失效：`runs/stream` 也回 404 → 自愈时必须**重新查 assistant**
		let searches = 0;
		let threads2 = 0;
		let runs2 = 0;
		const backend2 = makeBackend([
			{ match: (u, m) => u.endsWith("/ok") && m === "GET", handle: () => okJSON({ ok: true }) },
			{
				match: (u, m) => u.endsWith("/assistants/search") && m === "POST",
				handle: () => {
					searches++;
					return okJSON([
						{ graph_id: "blog_agent", assistant_id: searches === 1 ? "asst-dead" : "asst-live" },
					]);
				},
			},
			{
				match: (u, m) => u.endsWith("/threads") && m === "POST",
				handle: () => {
					threads2++;
					return okJSON({ thread_id: `t${threads2}` });
				},
			},
			{
				match: (u, m) => u.endsWith("/runs/stream") && m === "POST",
				handle: ({ body }) => {
					runs2++;
					if (body?.assistant_id === "asst-dead") return statusOnly(404, "Assistant not found");
					return streamResponse([valuesWith("换了 assistant 之后答上了")]);
				},
			},
		]);
		await withFakeBackend(mod, backend2, async () => {
			const a = await mod.askAemeath("问一句");
			record(
				"HEAL",
				"[D-3] assistant_id 失效（404）→ 重新 `assistants/search` 拿新 id 并成功",
				a.text.includes("换了 assistant 之后答上了") &&
					searches >= 2 &&
					runs2 === 2,
				`assistants/search ${searches} 次（asst-dead → asst-live）、runs/stream ${runs2} 次、气泡「${a.text}」`,
			);
		});
	}

	/* ── 5. `/state` 不许压在关键路径上（D-4）──────────────────────────── */
	{
		// ① 有答复的正常轮：**一次 `/state` 都不该打**
		const normal = makeBackend([
			...preambleRoutes(),
			{ match: (u, m) => u.endsWith("/threads") && m === "POST", handle: () => okJSON({ thread_id: "t1" }) },
			{ match: (u, m) => u.endsWith("/runs/stream") && m === "POST", handle: () => streamResponse([valuesWith("正常答复，不需要 /state")]) },
			{ match: (u) => u.endsWith("/state"), handle: () => okJSON({ tasks: [] }) },
		]);
		await withFakeBackend(mod, normal, async () => {
			const t0 = Date.now();
			const turn = await mod.askAemeath("在吗");
			const stateCalls = normal.log.filter((x) => x.url.endsWith("/state")).length;
			record(
				"STATE",
				"[D-4] 正常轮（有答复）不打 `GET /state`（不再平白多一次请求）",
				stateCalls === 0 && turn.text.includes("正常答复"),
				`请求账：${normal.log.map((x) => `${x.method} ${x.url.replace(/^.*:9\d\d\d/, "")}`).join(" → ")}；用时 ${Date.now() - t0}ms`,
			);
		});

		// ② `/state` 永挂：答复必须在 1~2 秒内到手（旧实现 60079ms）
		const hang = makeBackend([
			...preambleRoutes(),
			{ match: (u, m) => u.endsWith("/threads") && m === "POST", handle: () => okJSON({ thread_id: "t1" }) },
			{
				match: (u, m) => u.endsWith("/runs/stream") && m === "POST",
				// 有 `__interrupt__` 但**答复为空** → 才会走到第三层 `/state` 兜底
				handle: () => streamResponse([jsonSSE("values", { messages: [], __interrupt__: [] })]),
			},
			{
				match: (u) => u.endsWith("/state"),
				// 永不响应（连响应头都不给）—— 复核实测这一路会把答复压 60 秒
				handle: () => new Promise(() => {}),
			},
		]);
		await withFakeBackend(mod, hang, async () => {
			const t0 = Date.now();
			const turn = await mod.askAemeath("在吗", { timeoutMs: 60000 });
			const ms = Date.now() - t0;
			record(
				"STATE",
				"[D-4] `/state` 永挂时，这一轮仍在 1~3 秒内收口（不复核的 60079ms）",
				ms < 3000,
				`用时 ${ms}ms（旧实现 60079ms）；status=${turn.status}、气泡「${turn.text.replace(/\n/g, "⏎").slice(0, 40)}」`,
			);
		});

		// ③ 第三层仍要能兜住"前两层没信号"的那种轮次（别把兜底修坏了）
		const fallback = makeBackend([
			...preambleRoutes(),
			{ match: (u, m) => u.endsWith("/threads") && m === "POST", handle: () => okJSON({ thread_id: "t1" }) },
			{
				match: (u, m) => u.endsWith("/runs/stream") && m === "POST",
				handle: () => streamResponse([jsonSSE("values", { messages: [] })]),
			},
			{
				match: (u) => u.endsWith("/state"),
				handle: () => okJSON({ tasks: [{ interrupts: [{ value: "到底要不要收进本子？" }] }] }),
			},
		]);
		await withFakeBackend(mod, fallback, async () => {
			const turn = await mod.askAemeath("推荐几篇");
			record(
				"STATE",
				"[D-4 对照] 前两层无信号 + 答复为空时，第三层 `/state` 仍能判出 interrupt",
				turn.status === "interrupt" && turn.interrupt?.via === "state",
				`status=${turn.status}、via=${turn.interrupt?.via}、ask「${turn.interrupt?.ask ?? "—"}」`,
			);
		});

		// ④ D-15：`tasks[]` 为空时**不许**回退到线程级 `interrupts[]`（旧反问贴新答复）
		const stale = makeBackend([
			...preambleRoutes(),
			{ match: (u, m) => u.endsWith("/threads") && m === "POST", handle: () => okJSON({ thread_id: "t1" }) },
			{
				match: (u, m) => u.endsWith("/runs/stream") && m === "POST",
				handle: () => streamResponse([jsonSSE("values", { messages: [] })]),
			},
			{
				match: (u) => u.endsWith("/state"),
				handle: () =>
					okJSON({
						tasks: [{ interrupts: [] }],
						interrupts: [{ value: "（旧问题）你还没说清：篇幅大概多少字？" }],
					}),
			},
		]);
		await withFakeBackend(mod, stale, async () => {
			const turn = await mod.askAemeath("在吗");
			record(
				"STATE",
				"[D-15] `tasks[].interrupts` 为空时**不**回退到线程级 `interrupts[]`（不贴旧反问）",
				!turn.text.includes("旧问题") && turn.status !== "interrupt",
				`status=${turn.status}、气泡「${turn.text.replace(/\n/g, "⏎").slice(0, 50)}」`,
			);
		});
	}

	/* ── 6. 协议不符立刻降级（D-9）+ 去重词表（D-8）────────────────────── */
	{
		// 白名单外事件 → 立刻 cancel 流（不等 60 秒看门狗），且不再读后面的字节
		let bytesAfterFail = 0;
		const enc = new TextEncoder();
		const bad = makeBackend([
			...preambleRoutes(),
			{ match: (u, m) => u.endsWith("/threads") && m === "POST", handle: () => okJSON({ thread_id: "t1" }) },
			{
				match: (u, m) => u.endsWith("/runs/stream") && m === "POST",
				handle: () =>
					new Response(
						new ReadableStream({
							start(controller) {
								controller.enqueue(enc.encode(sse("bogus_event", "{}")));
								// 判出契约不符之后，前端应当已经 cancel；下面这些字节**不该**被消费
								const t = setInterval(() => {
									bytesAfterFail += 8;
									try {
										controller.enqueue(enc.encode(hb()));
									} catch {
										clearInterval(t);
									}
									if (bytesAfterFail > 800) clearInterval(t);
								}, 40);
							},
						}),
						{ status: 200, headers: { "content-type": "text/event-stream" } },
					),
			},
		]);
		await withFakeBackend(mod, bad, async () => {
			const t0 = Date.now();
			const turn = await mod.askAemeath("在吗");
			const ms = Date.now() - t0;
			record(
				"FAILFAST",
				"[D-9] 白名单外事件 → 立刻收口降级（不等 60 秒看门狗）",
				ms < 3000 && turn.fromMock === true && (turn.reason ?? "").includes("白名单外"),
				`用时 ${ms}ms、reason=${JSON.stringify(turn.reason)}、气泡「${turn.text.replace(/\n/g, "⏎")}」`,
			);
			record(
				"FAILFAST",
				"[D-9] 判出不符后 `reader.cancel()` 真的掐了流（后面的字节不再被消费）",
				bytesAfterFail < 800,
				`前端 cancel 后服务端只来得及写出 ${bytesAfterFail} 字节（阈值 800：没掐断会一路写满）`,
			);
		});

		// D-8：约定词只在「问句明确在问什么」时才推，宽松提问一律默认词。
		// ⚠️ 三条问句都是**真后端的原文**（`reports/_p5r-backend2/5.json` 与
		//     `verify-agent.log`），不是编的：
		//   ① `recommended_agent` 的询问**明确在问篇幅** → `需要`（用户其实什么都没说，
		//      但这是契约定义的那个"给了字数"动作；真正的用户确认由下一轮 `command.resume` 表达）；
		//   ② 复核的反例：宽松的「要不要我按站里的常用范围替你挑几篇？」→ 旧实现错回 `需要`，
		//      现在必须回默认词 `不提供`；
		//   ③ `blog_agent` 形态 A 的「要不要我收进本子？」→ `需要`（明确在问"要不要落盘"）。
		const askCases = [
			["行，我去翻。不过你还没说清：篇幅（大概多少字、能看多久）。不想说也行，回我「不提供」", "需要"],
			["要不要我按站里的常用范围替你挑几篇？", "不提供"],
			["要不要我收进本子？", "需要"],
			["这几篇你打算什么时候看？", "不提供"],
		];
		const wrong = [];
		for (const [ask, want] of askCases) {
			const be = makeBackend([
				...preambleRoutes(),
				{ match: (u, m) => u.endsWith("/threads") && m === "POST", handle: () => okJSON({ thread_id: "t1" }) },
				{
					match: (u, m) => u.endsWith("/runs/stream") && m === "POST",
					handle: ({ body }) =>
						body?.command
							? streamResponse([valuesWith("续跑后的答复")])
							: streamResponse([jsonSSE("values", { messages: [], __interrupt__: [{ value: ask }] })]),
				},
			]);
			const got = await withFakeBackend(mod, be, async () => {
				await mod.askAemeath("在吗");
				const resumeReq = be.log.find((x) => x.body?.command);
				return resumeReq?.body?.command?.resume ?? null;
			});
			if (got !== want) wrong.push(`「${ask.slice(0, 18)}…」→ ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
		}
		record(
			"WORDS",
			"[D-8] 约定词只按「问句是否明确在问」推：宽松提问 → 默认词 `不提供`",
			wrong.length === 0,
			wrong.length
				? wrong.join("；")
				: `3 种问句 3 个词全部符合：字数类→不提供、宽松「要不要」→不提供（旧实现错回「需要」）、「收进本子」→需要`,
		);
	}

	/* ── 7. 续跑用 `command.resume` 而不是 `input`（D-2）────────────────── */
	{
		const be = makeBackend([
			...preambleRoutes(),
			{ match: (u, m) => u.endsWith("/threads") && m === "POST", handle: () => okJSON({ thread_id: "t1" }) },
			{
				match: (u, m) => u.endsWith("/runs/stream") && m === "POST",
				handle: () => streamResponse([valuesWith("收进本子了。")]),
			},
		]);
		await withFakeBackend(mod, be, async () => {
			// 形态 A 的真实路径：上一轮气泡里有"要不要我收进本子？"（组件把它作为 lastReply 传下来），
			// 用户回「需要」→ 契约要求发 `command.resume`，不是 `input`
			await mod.askAemeath("需要", { lastReply: "……要不要我收进本子？" });
			const first = be.log.find((x) => x.url.endsWith("/runs/stream"));
			const usedCommand = Boolean(first?.body?.command);
			record(
				"RESUME",
				"[D-2] 用户隔一轮回答 `interrupt` 时发的是 `command.resume`（不是 `input`）",
				usedCommand && first?.body?.command?.resume === "需要" && first?.body?.input === undefined,
				`首轮 payload=${JSON.stringify(first?.body)}`,
			);
		});

		// 对照：**不是**回答 interrupt 的普通消息仍必须走 `input`（别把新话题当续跑）
		const be2 = makeBackend([
			...preambleRoutes(),
			{ match: (u, m) => u.endsWith("/threads") && m === "POST", handle: () => okJSON({ thread_id: "t1" }) },
			{ match: (u, m) => u.endsWith("/runs/stream") && m === "POST", handle: () => streamResponse([valuesWith("好的。")]) },
		]);
		await withFakeBackend(mod, be2, async () => {
			await mod.askAemeath("在吗", { lastReply: "……要不要我收进本子？" });
			const first = be2.log.find((x) => x.url.endsWith("/runs/stream"));
			record(
				"RESUME",
				"[D-2 对照] 不匹配约定词的普通消息仍走 `input`（新话题不许被当续跑）",
				Boolean(first?.body?.input) && first?.body?.command === undefined,
				`首轮 payload=${JSON.stringify(first?.body)}`,
			);
		});
	}

	/* ── 8. 上游失控的长答复：截断并明说（D-16 第二道闸）───────────────── */
	{
		const be = makeBackend([
			...preambleRoutes(),
			{ match: (u, m) => u.endsWith("/threads") && m === "POST", handle: () => okJSON({ thread_id: "t1" }) },
			{
				match: (u, m) => u.endsWith("/runs/stream") && m === "POST",
				handle: () => streamResponse([valuesWith("啊".repeat(50000))]),
			},
		]);
		await withFakeBackend(mod, be, async () => {
			const turn = await mod.askAemeath("在吗");
			record(
				"HUGE",
				"[D-16] 5 万字单条答复被截到可读长度并明说（不会撑成 35 万像素的块）",
				turn.text.length < 4200 && turn.text.includes("我先说到这儿"),
				`答复 ${turn.text.length} 字（原 50000 字）→ 尾部提示「${turn.text.slice(-14)}」`,
			);
		});
		// 真实长度（496 字）**一个字节都不许截**
		const be2 = makeBackend([
			...preambleRoutes(),
			{ match: (u, m) => u.endsWith("/threads") && m === "POST", handle: () => okJSON({ thread_id: "t1" }) },
			{ match: (u, m) => u.endsWith("/runs/stream") && m === "POST", handle: () => streamResponse([valuesWith("文".repeat(496))]) },
		]);
		await withFakeBackend(mod, be2, async () => {
			const turn = await mod.askAemeath("在吗");
			record(
				"HUGE",
				"[D-16 对照] 真后端量级（496 字）不被截断",
				turn.text.length === 496,
				`答复 ${turn.text.length} 字（期望 496）`,
			);
		});
	}

	/* ── 8. 探测缓存真的生效（D-13：`probeCache` 曾是死代码）──────────────── */
	{
		// 「服务端口开着但不响应」的模拟：`/ok` 挂 600ms 才回。没有缓存时**每问一句**都要白等它。
		const okTimes = [];
		const be = makeBackend([
			{
				match: (u, m) => u.endsWith("/ok") && m === "GET",
				handle: async () => {
					okTimes.push(Date.now());
					await new Promise((r) => setTimeout(r, 600));
					return okJSON({ ok: true });
				},
			},
			{
				match: (u, m) => u.endsWith("/assistants/search") && m === "POST",
				handle: () => okJSON([{ graph_id: "blog_agent", assistant_id: "a1" }]),
			},
			{
				match: (u, m) => u.endsWith("/threads") && m === "POST",
				handle: () => okJSON({ thread_id: "t1" }),
			},
			{
				match: (u, m) => u.endsWith("/runs/stream") && m === "POST",
				handle: () => streamResponse([valuesWith("答复到了")]),
			},
		]);
		await withFakeBackend(mod, be, async () => {
			const t0 = Date.now();
			await mod.askAemeath("第一问");
			const first = Date.now() - t0;
			const t1 = Date.now();
			await mod.askAemeath("第二问");
			const second = Date.now() - t1;
			record(
				"PROBE",
				"[D-13] 探测结果被缓存：`/ok` 慢 600ms 时，**第一问之后**的第二问不再白等它",
				okTimes.length === 1 && second < 300,
				`三次提问里 /ok 实际只打了 ${okTimes.length} 次（期望 1：缓存命中）；第一问 ${first}ms（含 600ms 探测）、第二问 ${second}ms（<300 说明没有重新探测）。旧实现的缓存判定借 confirmedBase 当钥匙 → 两条路径都够不着，每问都白等一整轮探测超时`,
			);
		});
	}

	return finish(startedAt);
}

/* ── 注入假的 fetch 与配置，跑完一定还原 ─────────────────────────────────── */

let savedFetch = null;
async function withFakeBackend(mod, backend, fn) {
	if (savedFetch === null) savedFetch = globalThis.fetch;
	globalThis.fetch = backend.fetchImpl;
	globalThis.__imissAgentConfig = { enable: true, baseUrl: "http://127.0.0.1:2024" };
	mod.resetSession();
	try {
		return await fn();
	} finally {
		globalThis.fetch = savedFetch;
		delete globalThis.__imissAgentConfig;
		mod.resetSession();
	}
}

/* ── 汇总与落盘 ──────────────────────────────────────────────────────────── */
async function finish(startedAt) {
	const passed = results.filter((r) => r.pass).length;
	const failed = results.filter((r) => !r.pass);
	say("");
	for (const r of results) {
		say(`${r.pass ? "✅" : "❌"} [${r.id}] ${r.desc}`);
		if (r.detail) say(`      ${r.detail}`);
	}
	say("");
	say(`适配层健壮性回归：通过 ${passed}，失败 ${failed.length}（共 ${results.length} 项）`);
	const code = failed.length ? 1 : 0;
	const json = {
		generatedAt: new Date().toISOString(),
		startedAt: startedAt.toISOString(),
		passed,
		failed: failed.length,
		exitCode: code,
		results,
	};
	try {
		await fs.mkdir(OUT_DIR, { recursive: true });
		await fs.writeFile(path.join(OUT_DIR, "verify-agent-robust.log"), `${lines.join("\n")}\n`, "utf8");
		await fs.writeFile(
			path.join(OUT_DIR, "verify-agent-robust.json"),
			`${JSON.stringify(json, null, 2)}\n`,
			"utf8",
		);
	} catch (err) {
		console.error(`写入 reports/ 失败：${err.message}`);
	}
	console.log(`报告：reports/verify-agent-robust.log ｜ reports/verify-agent-robust.json（退出码 ${code}）`);
	process.exit(code);
}

main().catch(async (err) => {
	console.error(err);
	record("SCRIPT", "verify-agent-robust.mjs 跑完没有抛异常", false, `${err.name}: ${err.message}`);
	await finish(new Date());
});
