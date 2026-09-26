/**
 * Agent 接口契约自检（`pnpm verify:agent`）
 * ============================================================================
 * 为什么需要它：P5-0「契约冻结」定下了"博客前端 ↔ Agent 服务"的接口形状
 * （`ARCH.md` §8.9），但这套形状是**靠实测摸出来的**，而且坑很多：
 *   - 4 张图要靠 `POST /assistants/search` 现查，`assistant_id` 不是固定值；
 *   - 同一请求里传 `config.configurable` 和 `context` 会 **HTTP 400**；
 *   - `interrupt` 不是事件名，它藏在 `values`/`updates` 的事件体里；
 *   - 消息流里混着**工具输出**（`可用的表:blog, blog_content`、`CREATE TABLE …`），
 *     前端只许渲染最后一条面向用户的 `ai` 消息 —— 这条如果没锁住，
 *     访客会在爱弥斯的气泡里看到数据库 DDL。
 * 所以把"契约"变成可跑的断言：**契约不符 = 退出码 1**。
 *
 * ⚠️ 与 `verify:ui` / `verify:posts` / `verify:docs` 的**关键差别**：
 *    那三个是"仓库事实 vs 文档"，这个依赖一个**本机后台服务**（`langgraph dev`）。
 *    服务没起是**环境问题、不是回归**，所以：
 *      · 连不上 → 全套打 SKIP、**退出码 0**、并打印启动命令；
 *      · 连上了但形状不对 → **退出码 1**。
 *
 * 零依赖：只用 Node 原生 `fetch` / `node:fs`，不引第三方、不 import 业务代码
 * （配置对齐靠**读 `src/config/agentConfig.ts` 原文**核对，避免 .mjs 去 import .ts）。
 *
 * 用法：`pnpm verify:agent`（需要 Agent 在跑时先 `cd ..\agent_-for_-blog; langgraph dev`）
 * 产物：`reports/verify-agent.log`（UTF-8 全文）、`reports/verify-agent.json`（结构化结果）
 * 退出码：契约不符 1；服务没起 / 全套通过 / 部分跳过 0。
 */
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

// ── 契约常量（与 `src/config/agentConfig.ts` 的默认值对齐；下面有专门一项核对）──
const CONTRACT = {
	baseUrl: "http://127.0.0.1:2024",
	graphId: "blog_agent",
	recommendGraphId: "recommended_agent",
	knownGraphs: ["blog_agent", "recommended_agent", "collect_agent", "extend_agent"],
	timeoutMs: 60000,
	resumeDefault: "不提供",
	// 「检索轮」用的输入：实测这一句**稳定**触发工具链路（RAG 检索 + 列 schema），
	// 从而让「消息流里有工具输出、最终答复里没有」这条契约被真正验到（闲聊句验不到）。
	// ⚠️ 换这句话要重跑一次，确认消息流里仍然出现 leakMarkers 里的词。
	searchProbeMessage: "帮我找几篇讲 C++ 的文章",
	// 检索轮的超时：比闲聊宽 —— 要跑 RAG + 多轮 LLM，本机实测单轮 30~120 秒
	searchTimeoutMs: 180000,
	// 「降级路径」探测用的死端口：本机实测 ECONNREFUSED（用它证明"调不通能被识别为不可用"）
	deadBaseUrl: "http://127.0.0.1:2099",
	deadProbeTimeoutMs: 1800,
	// 契约允许的 SSE 事件名（**白名单**：出现集合外的名字要报警，说明上游改了协议）
	knownEvents: [
		"metadata",
		"values",
		"updates",
		"messages/metadata",
		"messages/partial",
		"messages/complete",
		"error",
		"end",
	],
	// 只许渲染最后一条 ai 消息 → 命中这些词就说明工具输出泄进用户可见层了
	leakMarkers: ["可用的表", "CREATE TABLE", "word_count_min", "user_preferences", "user_intent"],
};

const START_CMD = "cd ..\\agent_-for_-blog; langgraph dev";

const results = [];
const record = (area, desc, pass, detail = "", skipped = false) =>
	results.push({ area, desc, pass, skipped, detail });

// ── SSE 解析：把 `event: X\ndata: Y\n\n` 切成 [{name, data}] ──────────────────
const parseSSE = (raw) => {
	const events = [];
	let cur = null;
	for (const line of raw.split("\n")) {
		if (line.startsWith("event: ")) cur = { name: line.slice(7).trim(), data: [] };
		else if (line.startsWith("data: ") && cur) cur.data.push(line.slice(6));
		else if (line === "" && cur) {
			events.push({ name: cur.name, data: cur.data.join("\n") });
			cur = null;
		}
	}
	if (cur) events.push({ name: cur.name, data: cur.data.join("\n") });
	return events;
};

/** 安全解析事件体（`error` 事件体不一定是 JSON） */
const tryJSON = (s) => {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
};

/** 契约 §8.9「最终答复」：取**最后一条 content 非空的 `ai` 消息** */
const lastAiMessage = (messages) =>
	(messages ?? [])
		.filter((m) => m.type === "ai" && typeof m.content === "string" && m.content.trim())
		.pop() ?? null;

/** 一轮的聚合状态：accumulate values + 收集 interrupt 信号 */
const newRound = () => ({ state: {}, interrupt: null, names: [], status: 0, raw: "" });

const absorb = (round, events) => {
	for (const e of events) {
		round.names.push(e.name);
		if (e.name === "values") {
			const o = tryJSON(e.data);
			if (o && typeof o === "object") {
				round.state = o;
				if (o.__interrupt__) round.interrupt = o.__interrupt__;
			}
		} else if (e.name === "updates") {
			const o = tryJSON(e.data);
			if (o?.__interrupt__) round.interrupt = o.__interrupt__;
		}
	}
};

// ── 最小 HTTP 客户端（契约 §8.9 的调用序列）──────────────────────────────────
const withTimeout = (ms) => AbortSignal.timeout(ms);

/** 探测一个 baseUrl 是否"可用"：能不能在超时内拿到 /ok 的 200（降级路径要用它） */
async function probeAvailability(baseUrl, timeoutMs) {
	try {
		const r = await fetch(`${baseUrl}/ok`, { signal: withTimeout(timeoutMs) });
		if (!r.ok) return { ok: false, reason: `GET /ok → HTTP ${r.status}` };
		const j = await r.json().catch(() => null);
		return { ok: j?.ok === true, reason: j?.ok === true ? "ok" : `GET /ok 返回 ${JSON.stringify(j)}` };
	} catch (err) {
		return { ok: false, reason: `${err.name}: ${err.message}${err.cause?.code ? ` (${err.cause.code})` : ""}` };
	}
}

async function api(baseUrl, method, urlPath, body, timeoutMs) {
	const r = await fetch(`${baseUrl}${urlPath}`, {
		method,
		headers: body === undefined ? undefined : { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: withTimeout(timeoutMs),
	});
	return r;
}

/** 跑一轮：POST /threads/{id}/runs/stream，返回聚合后的 round */
async function runStream(baseUrl, threadId, payload, timeoutMs) {
	const round = newRound();
	const r = await api(baseUrl, "POST", `/threads/${threadId}/runs/stream`, payload, timeoutMs);
	round.status = r.status;
	round.raw = await r.text();
	absorb(round, parseSSE(round.raw));
	return round;
}

// ── 输出 ────────────────────────────────────────────────────────────────────
const lines = [];
const say = (s = "") => {
	lines.push(s);
	console.log(s);
};

async function main() {
	const startedAt = new Date();
	say("Agent 接口契约自检（pnpm verify:agent）");
	say(`契约依据：ARCH.md §8.9 ｜ 服务：${CONTRACT.baseUrl} ｜ 图：${CONTRACT.graphId}`);
	say("");

	// ── 0. 配置对齐（读 .ts 原文，不 import）──────────────────────────────
	{
		let src = "";
		try {
			src = await fs.readFile(path.resolve(root, "src/config/agentConfig.ts"), "utf8");
		} catch (err) {
			record("配置对齐", "src/config/agentConfig.ts 可读", false, err.message);
		}
		if (src) {
			const grab = (field, re) => re.exec(src)?.[1] ?? null;
			const actual = {
				baseUrl: grab("baseUrl", /baseUrl:\s*"([^"]+)"/),
				graphId: grab("graphId", /graphId:\s*"([^"]+)"/),
				timeoutMs: Number(grab("timeoutMs", /timeoutMs:\s*(\d+)/)),
				default: grab("default", /default:\s*"([^"]+)"/),
				provide: grab("provide", /provide:\s*"([^"]+)"/),
				decline: grab("decline", /decline:\s*"([^"]+)"/),
			};
			const graphs = [...src.matchAll(/"(\w+_agent)"/g)].map((m) => m[1]);
			const knownGraphs = [...new Set(graphs)];
			const mismatch = [];
			if (actual.baseUrl !== CONTRACT.baseUrl) mismatch.push(`baseUrl ${actual.baseUrl} ≠ ${CONTRACT.baseUrl}`);
			if (actual.graphId !== CONTRACT.graphId) mismatch.push(`graphId ${actual.graphId} ≠ ${CONTRACT.graphId}`);
			if (actual.timeoutMs !== CONTRACT.timeoutMs)
				mismatch.push(`timeoutMs ${actual.timeoutMs} ≠ ${CONTRACT.timeoutMs}`);
			if (actual.default !== CONTRACT.resumeDefault)
				mismatch.push(`resumeWords.default ${actual.default} ≠ ${CONTRACT.resumeDefault}`);
			for (const g of CONTRACT.knownGraphs) {
				if (!knownGraphs.includes(g)) mismatch.push(`knownGraphs 缺 ${g}`);
			}
			record(
				"配置对齐",
				"agentConfig.ts 的默认值与脚本内置契约常量一致",
				mismatch.length === 0,
				mismatch.length ? mismatch.join("；") : `baseUrl/graphId/timeoutMs/resumeWords/knownGraphs(4) 全部一致`,
			);
		}
	}

	// ── 1. 服务可用性：连不上就整套 SKIP（退出码 0）──────────────────────
	const avail = await probeAvailability(CONTRACT.baseUrl, CONTRACT.deadProbeTimeoutMs);
	if (!avail.ok) {
		record(
			"服务可用性",
			"GET /ok → 200 {ok:true}",
			false,
			`Agent 没在跑（${avail.reason}）→ 本套契约断言全部跳过。启动命令：${START_CMD}`,
			true,
		);
		return finish(startedAt, "skipped", 0);
	}
	record("服务可用性", "GET /ok → 200 {ok:true}", true, "ok");

	// ── 2. 4 张图：POST /assistants/search ───────────────────────────────
	const assistants = [];
	{
		let ok = false;
		let detail = "";
		try {
			const r = await api(CONTRACT.baseUrl, "POST", "/assistants/search", { limit: 50 }, CONTRACT.timeoutMs);
			const list = r.ok ? await r.json() : [];
			if (!r.ok) detail = `HTTP ${r.status}`;
			else if (!Array.isArray(list)) detail = `返回不是数组：${JSON.stringify(list).slice(0, 200)}`;
			else {
				for (const a of list) assistants.push({ graph_id: a.graph_id, assistant_id: a.assistant_id });
				const found = [...new Set(list.map((a) => a.graph_id))];
				const missing = CONTRACT.knownGraphs.filter((g) => !found.includes(g));
				ok = missing.length === 0;
				detail = `找到 ${found.length} 张图（${found.join(", ")}）；共 ${list.length} 个 assistant`;
				if (missing.length) detail += ` ｜ 缺：${missing.join(", ")}`;
			}
		} catch (err) {
			detail = `${err.name}: ${err.message}`;
		}
		record("assistants/search", `能列出契约里的 ${CONTRACT.knownGraphs.length} 张图`, ok, detail);
	}

	const target = assistants.find((a) => a.graph_id === CONTRACT.graphId);
	const recommendTarget = assistants.find((a) => a.graph_id === CONTRACT.recommendGraphId);
	if (!target) {
		record("assistants/search", `配置的 graphId「${CONTRACT.graphId}」有对应 assistant`, false, "找不到 → 后续用例无法执行");
		return finish(startedAt, "failed", 1);
	}
	record(
		"assistants/search",
		`配置的 graphId「${CONTRACT.graphId}」有对应 assistant`,
		true,
		`assistant_id=${target.assistant_id}`,
	);

	// ── 3. 闲聊轮：事件序列 + 最终答复 + 不许泄露工具输出 ─────────────────
	const chat = { threadId: null, names: [], status: 0, answer: "", leakHits: [], msgTypes: "" };
	{
		let ok = true;
		const notes = [];
		try {
			const tr = await api(CONTRACT.baseUrl, "POST", "/threads", {}, CONTRACT.timeoutMs);
			const thread = tr.ok ? await tr.json() : null;
			if (!tr.ok || !thread?.thread_id) {
				ok = false;
				notes.push(`POST /threads → HTTP ${tr.status}；响应：${JSON.stringify(thread).slice(0, 200)}`);
			} else {
				chat.threadId = thread.thread_id;
				const round = await runStream(
					CONTRACT.baseUrl,
					thread.thread_id,
					{
						assistant_id: target.assistant_id,
						input: { messages: [{ type: "human", content: "在吗" }] },
						stream_mode: ["messages", "values", "updates"],
					},
					CONTRACT.timeoutMs,
				);
				chat.status = round.status;
				chat.names = round.names;
				if (round.status !== 200) {
					ok = false;
					notes.push(`runs/stream → HTTP ${round.status}；${round.raw.slice(0, 200)}`);
				} else {
					// 顺序保证。⚠️ 这里刻意**不**断言"事件名序列固定"——实测同一句话
					// 路由不同就会走不同的节点：直接答（只有 values）或经 extend_graph
					// （metadata/messages.metadata/partial/complete）。契约只锁三条硬保证：
					//   ① 事件流非空且事件名都在白名单内（上游改协议要显形）；
					//   ② 最后一个事件必须是 values（前端就靠它拿最终状态）；
					//   ③ metadata 若出现必须在**任何消息事件之前**（它是 run 起手帧）。
					const uniq = [...new Set(round.names)];
					const unknown = uniq.filter((n) => !CONTRACT.knownEvents.includes(n));
					if (round.names.length === 0) {
						ok = false;
						notes.push("事件流是空的");
					}
					const last = round.names[round.names.length - 1];
					if (last !== "values") {
						ok = false;
						notes.push(`末个事件是 ${last}，契约要求 values（最终状态）`);
					}
					const metaIdx = round.names.indexOf("metadata");
					const firstMsgIdx = round.names.findIndex((n) => n.startsWith("messages/"));
					if (metaIdx > -1 && firstMsgIdx > -1 && metaIdx > firstMsgIdx) {
						ok = false;
						notes.push(`metadata 出现在消息事件之后（metadata#${metaIdx} vs messages#${firstMsgIdx}）`);
					}
					if (unknown.length) {
						ok = false;
						notes.push(`出现契约外事件名：${unknown.join(", ")}`);
					}
					// events 拿到了什么 + 与 GET /threads/{id}/state 的最终状态是否一致
					notes.push(`本轮事件名：${uniq.join(", ")}（共 ${round.names.length} 个）`);
					const sr = await api(CONTRACT.baseUrl, "GET", `/threads/${thread.thread_id}/state`, undefined, CONTRACT.timeoutMs);
					const st = sr.ok ? await sr.json() : null;
					const stMsgCount = (st?.values?.messages ?? []).length;
					const evMsgCount = (round.state.messages ?? []).length;
					if (sr.ok && stMsgCount !== evMsgCount) {
						ok = false;
						notes.push(`最后一个 values 的消息数 ${evMsgCount} ≠ GET state 的 ${stMsgCount}（前端拿到的最终状态不可信）`);
					} else if (sr.ok) {
						notes.push(`最后一个 values 与 GET /threads/{id}/state 一致（${evMsgCount} 条消息）`);
					}
					const msgs = round.state.messages ?? [];
					chat.msgTypes = msgs.map((m) => m.type).join(",");
					const ai = lastAiMessage(msgs);
					chat.answer = ai?.content ?? "";
					if (!chat.answer) {
						ok = false;
						notes.push("按契约取不到「最后一条 content 非空的 ai 消息」");
					} else {
						notes.push(`最终答复 ${chat.answer.length} 字：「${chat.answer.replace(/\n/g, " ").slice(0, 60)}…」`);
					}
					// 工具输出不许泄进"最后一条 ai 消息"
					for (const marker of CONTRACT.leakMarkers) {
						if (chat.answer.includes(marker)) chat.leakHits.push(marker);
					}
					// 顺带记录：整条消息流里**确实**混着工具输出（证明"只渲染最后一条"这条规则不是空话）
					const streamLeak = CONTRACT.leakMarkers.filter((m) =>
						msgs.some((x) => String(x.content ?? "").includes(m)),
					);
					notes.push(
						streamLeak.length
							? `消息流里确实含工具输出（${streamLeak.join(", ")}）→ 前端只许渲染最后一条 ai 消息`
							: "本轮消息流没出现工具输出",
					);
				}
			}
		} catch (err) {
			ok = false;
			notes.push(`${err.name}: ${err.message}`);
		}
		record(
			"闲聊轮 · 事件序列",
			"事件名都在契约白名单内 / values 收尾 / metadata 不在消息事件之后 / 与 GET state 一致",
			ok,
			notes.join(" ｜ "),
		);
		record(
			"闲聊轮 · 最终答复",
			"能取到最后一条 content 非空的 ai 消息",
			Boolean(chat.answer),
			chat.answer ? `${chat.answer.length} 字 ｜ 消息类型序列 ${chat.msgTypes}` : "取不到",
		);
		record(
			"闲聊轮 · 无工具输出",
			"最终答复里不含工具 / DB 内部输出",
			chat.leakHits.length === 0,
			chat.leakHits.length
				? `命中禁词：${chat.leakHits.join(", ")}`
				: `未命中 ${CONTRACT.leakMarkers.length} 个禁词（${CONTRACT.leakMarkers.join(", ")}）`,
		);
	}

	// ── 4. 检索轮：证明「消息流里混着工具输出」是常态，而最终答复必须干净 ──
	// 为什么非要有这一轮：闲聊轮走的是"直接答"节点，消息流里**没有**工具输出，
	// 于是"只渲染最后一条 ai"这条规则在闲聊轮里等于没被验证到（碰运气）。
	// 换成检索意图后，实测**稳定**出现 `可用的表:blog, blog_content` 与 `CREATE TABLE blog (…)`
	// —— 这两条是数据库 DDL，一旦有人图省事把整条流渲染出来，访客就会在爱弥斯的气泡里看到它。
	const search = { threadId: null, streamLeak: [], answer: "", msgTypes: "", names: [], status: 0, err: "" };
	{
		const notes = [];
		try {
			const tr = await api(CONTRACT.baseUrl, "POST", "/threads", {}, CONTRACT.timeoutMs);
			const thread = await tr.json();
			search.threadId = thread.thread_id;
			const round = await runStream(
				CONTRACT.baseUrl,
				thread.thread_id,
				{
					assistant_id: target.assistant_id,
					input: { messages: [{ type: "human", content: CONTRACT.searchProbeMessage }] },
					stream_mode: ["messages", "values", "updates"],
				},
				CONTRACT.searchTimeoutMs,
			);
			search.status = round.status;
			search.names = [...new Set(round.names)];
			const msgs = round.state.messages ?? [];
			search.msgTypes = msgs.map((m) => m.type).join(",");
			search.streamLeak = CONTRACT.leakMarkers.filter((m) =>
				msgs.some((x) => String(x.content ?? "").includes(m)),
			);
			search.answer = lastAiMessage(msgs)?.content ?? "";
		} catch (err) {
			search.err = `${err.name}: ${err.message}`;
		}

		const answered = Boolean(search.answer);
		const premiseHolds = search.streamLeak.length > 0;
		// 前提项：不成立时记 SKIP（后端改了 RAG 实现 → 要重新核对契约，但前端行为没坏）
		record(
			"检索轮 · 工具输出前提",
			`检索意图的消息流含工具输出（${CONTRACT.leakMarkers.slice(0, 2).join(", ")}）`,
			premiseHolds,
			search.err
				? search.err
				: premiseHolds
					? `消息类型 ${search.msgTypes} ｜ 命中 ${search.streamLeak.join(", ")} ｜ 事件名 ${search.names.join(", ")}`
					: `本轮消息流没出现工具输出（消息类型 ${search.msgTypes}）→「只渲染最后一条 ai」这条规则**没被真正验证**，请重新核对 ARCH.md §8.9 的前提`,
			!premiseHolds && !search.err,
		);
		// 结论项：这条是 P5-0 契约的核心收益——整条流里有 DDL，最终答复里一个字都没有
		record(
			"检索轮 · 只渲染最后一条",
			"同一条流里：工具输出进了消息流、但没进最终答复",
			premiseHolds && answered && CONTRACT.leakMarkers.every((m) => !search.answer.includes(m)),
			search.err
				? search.err
				: answered
					? `流内有 [${search.streamLeak.join(", ")}] ｜ 答复 ${search.answer.length} 字、命中禁词 0 个（「${search.answer.replace(/\n/g, " ").slice(0, 50)}…」）`
					: `HTTP ${search.status} ｜ 取不到最终答复`,
		);
	}

	// ── 5. 推荐轮：interrupt → resume「不提供」→ 最终答复 ─────────────────
	const rec = { threadId: null, interruptValue: null, detectVia: "", answer: "", resumeStatus: 0 };
	{
		let ok = true;
		const notes = [];
		if (!recommendTarget) {
			ok = false;
			notes.push(`找不到图「${CONTRACT.recommendGraphId}」`);
		} else {
			try {
				// 推荐两轮各自计时：第一轮只到 interrupt（快），第二轮要真去检索 + 组织推荐语（慢）
				const t1Budget = Math.min(CONTRACT.timeoutMs, 60000);
				const t2Budget = Math.min(CONTRACT.timeoutMs, 90000);
				const tr = await api(CONTRACT.baseUrl, "POST", "/threads", {}, CONTRACT.timeoutMs);
				const thread = await tr.json();
				rec.threadId = thread.thread_id;
				const r1 = await runStream(
					CONTRACT.baseUrl,
					thread.thread_id,
					{
						assistant_id: recommendTarget.assistant_id,
						input: { messages: [{ type: "human", content: "推荐几篇讲 C++ 的博客" }] },
						stream_mode: ["messages", "values", "updates"],
					},
					t1Budget,
				);
				// 三层信号里至少一层要命中（契约 §8.9「如何判需要续跑」）
				// ① SSE 事件体：`values` / `updates` 里的 `__interrupt__`
				if (r1.interrupt?.length) rec.detectVia = "SSE 事件体（values/updates 的 __interrupt__）";
				rec.interruptValue = r1.interrupt?.[0]?.value ?? null;
				// ② 兜底信号：GET /threads/{id}/state 的 interrupts[] / next[]
				if (!rec.interruptValue) {
					const sr = await api(CONTRACT.baseUrl, "GET", `/threads/${thread.thread_id}/state`, undefined, t1Budget);
					const st = sr.ok ? await sr.json() : null;
					if (st?.interrupts?.length) {
						rec.detectVia = "GET /threads/{id}/state 的 interrupts[]";
						rec.interruptValue = st.interrupts[0].value;
					}
				}
				if (!rec.interruptValue) {
					ok = false;
					notes.push("第一轮没有检测到 interrupt（SSE 与 state 两层信号都没命中）");
				} else {
					notes.push(`检测方式：${rec.detectVia}`);
					notes.push(`问题原文：「${String(rec.interruptValue).replace(/\n/g, " ").slice(0, 80)}…」`);
					// 第二轮：用约定词 resume
					const r2 = await runStream(
						CONTRACT.baseUrl,
						thread.thread_id,
						{
							assistant_id: recommendTarget.assistant_id,
							command: { resume: CONTRACT.resumeDefault },
							stream_mode: ["messages", "values", "updates"],
						},
						t2Budget,
					);
					rec.resumeStatus = r2.status;
					if (r2.status !== 200) {
						ok = false;
						notes.push(`resume → HTTP ${r2.status}；${r2.raw.slice(0, 200)}`);
					} else {
						const ai = lastAiMessage(r2.state.messages);
						rec.answer = ai?.content ?? "";
						if (!rec.answer) {
							ok = false;
							notes.push("resume 后仍取不到最终答复");
						} else {
							notes.push(`resume 后答复 ${rec.answer.length} 字：「${rec.answer.replace(/\n/g, " ").slice(0, 60)}…」`);
						}
						if (r2.interrupt?.length) {
							ok = false;
							notes.push("resume 之后又出现 interrupt（契约要求一轮收口）");
						}
					}
				}
			} catch (err) {
				ok = false;
				notes.push(`${err.name}: ${err.message}`);
			}
		}
		record(
			"推荐轮 · interrupt",
			`能判出「需要续跑」并取到询问原文（约定词 resume「${CONTRACT.resumeDefault}」）`,
			Boolean(rec.interruptValue),
			notes.slice(0, rec.interruptValue ? 2 : 9).join(" ｜ ") || "—",
		);
		record(
			"推荐轮 · 最终答复",
			`resume「${CONTRACT.resumeDefault}」后能拿到最终答复`,
			ok && Boolean(rec.answer),
			rec.answer ? `${rec.answer.length} 字 ｜ resume HTTP ${rec.resumeStatus}` : notes.join(" ｜ "),
		);
	}

	// ── 5. 400 坑：config.configurable 与 context 不能同时传 ──────────────
	{
		let ok = false;
		let detail = "";
		// 用一个**不可能出现在正常答复里**的哨兵值：如果它泄进用户可见文本，就说明
		// context/configurable 的内容被原样带出来了（也顺带证明"只渲染最后一条 ai"没做错）
		const sentinel = "contract-probe-9f3a";
		try {
			const tr = await api(CONTRACT.baseUrl, "POST", "/threads", {}, CONTRACT.timeoutMs);
			const tid = (await tr.json()).thread_id;
			const r = await api(
				CONTRACT.baseUrl,
				"POST",
				`/threads/${tid}/runs/stream`,
				{
					assistant_id: target.assistant_id,
					input: { messages: [{ type: "human", content: "在吗" }] },
					stream_mode: ["values"],
					config: { configurable: { user_id: sentinel } },
					context: { user_id: sentinel },
				},
				CONTRACT.timeoutMs,
			);
			const body = await r.text();
			ok = r.status === 400 && /both configurable and context/i.test(body);
			detail = `HTTP ${r.status} ｜ ${body.slice(0, 160)}`;
			if (r.status === 200) {
				// 200 说明上游放宽了 → 契约文档里那条"禁止"要重新核对。
				// 这不是"契约不符"（前端两种都不传也不会坏），所以记 SKIP 而不是 FAIL，
				// 但必须显形，否则文档会继续挂一条已经失效的坑。
				record(
					"请求形状 · 400 坑",
					"同时传 configurable + context 会被拒（契约据此禁止同时传）",
					false,
					`上游不再拒绝：${detail} → 请重新核对 ARCH.md §8.9 的"禁止字段"`,
					true,
				);
			} else {
				record(
					"请求形状 · 400 坑",
					"同时传 configurable + context 会被拒（契约据此禁止同时传）",
					ok,
					detail,
				);
			}
		} catch (err) {
			record("请求形状 · 400 坑", "同时传 configurable + context 会被拒（契约据此禁止同时传）", false, `${err.name}: ${err.message}`);
		}
	}

	// ── 6. 降级路径：把 baseUrl 指向死端口，必须被识别为"不可用"────────────
	{
		const probe = await probeAvailability(CONTRACT.deadBaseUrl, CONTRACT.deadProbeTimeoutMs);
		record(
			"降级路径",
			`探测函数对死端口（${CONTRACT.deadBaseUrl}）返回"不可用"`,
			probe.ok === false,
			probe.ok === false
				? `识别为不可用：${probe.reason} → 按契约 fallbackToMock 走 mock 台词`
				: "死端口竟然探活了（端口被别的进程占用？）",
		);
		// 对照：同一个探测函数对**活着的**服务必须返回可用（否则"探测"本身就是坏的）
		const live = await probeAvailability(CONTRACT.baseUrl, CONTRACT.deadProbeTimeoutMs);
		record(
			"降级路径",
			"同一个探测函数对活服务返回可用（对照项，防「恒 false」的假绿）",
			live.ok === true,
			`${CONTRACT.baseUrl} → ${live.reason}`,
		);
	}

	return finish(startedAt, "ran", null);
}

// ── 汇总与落盘 ──────────────────────────────────────────────────────────────
async function finish(startedAt, mode, forceExit) {
	const passed = results.filter((r) => r.pass && !r.skipped).length;
	const skipped = results.filter((r) => r.skipped).length;
	const failed = results.filter((r) => !r.pass && !r.skipped).length;

	say("");
	for (const r of results) {
		if (r.skipped) {
			say(`⏭️  [SKIP][${r.area}] ${r.desc}`);
			say(`      ${r.detail}`);
		} else if (r.pass) {
			say(`✅ [${r.area}] ${r.desc}`);
			say(`      ${r.detail}`);
		} else {
			say(`❌ [${r.area}] ${r.desc}`);
			say(`      ${r.detail}`);
		}
	}

	const total = passed + failed;
	if (mode === "skipped") {
		say("");
		say("⚠️  Agent 服务没在跑 —— 契约断言全部跳过（**这不是失败，是环境未就绪**）。");
		say(`    启动：${START_CMD}`);
		say("    起完再跑一次 `pnpm verify:agent`；不跑也不影响 CI（本脚本退出码 0）。");
	}
	say("");
	say(`Agent 契约检查：通过 ${passed}，失败 ${failed}，跳过 ${skipped}${total ? `（共 ${total} 项可执行）` : ""}`);

	const json = {
		generatedAt: new Date().toISOString(),
		startedAt: startedAt.toISOString(),
		mode,
		baseUrl: CONTRACT.baseUrl,
		graphId: CONTRACT.graphId,
		passed,
		failed,
		skipped,
		exitCode: forceExit ?? (failed === 0 ? 0 : 1),
		results,
	};
	const text = `${lines.join("\n")}\n`;

	try {
		await fs.mkdir(path.resolve(root, "reports"), { recursive: true });
		await fs.writeFile(path.resolve(root, "reports/verify-agent.log"), text, "utf8");
		await fs.writeFile(
			path.resolve(root, "reports/verify-agent.json"),
			`${JSON.stringify(json, null, 2)}\n`,
			"utf8",
		);
	} catch (err) {
		console.error(`写入 reports/ 失败：${err.message}`);
	}

	const code = forceExit ?? (failed === 0 ? 0 : 1);
	console.log(`报告：reports/verify-agent.log ｜ reports/verify-agent.json（退出码 ${code}）`);
	process.exit(code);
}

main().catch(async (err) => {
	console.error(err);
	record("脚本自身", "verify-agent.mjs 跑完没有抛异常", false, `${err.name}: ${err.message}`);
	await finish(new Date(), "failed", 1);
});
