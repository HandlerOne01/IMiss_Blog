/**
 * 桌宠 Agent 网关自检（`pnpm verify:gateway`）
 * ============================================================================
 * 为什么需要它：P5-5 的网关（`server/pet-gateway.mjs`）是**上线前唯一挡住
 * "访客拿本站当跳板直连 Agent"的那一层**，而它拦的东西（限流、长度、来源白名单、
 * 不缓冲的 SSE、超时收口）**全都不可能靠"读一遍代码"验掉**：
 *   · 缓冲这件事只在"上游分两次、中间隔 1.5 秒"时才看得出来；
 *   · 上游不可达 / 永不响应这两条真后端**造不出来**（它要么活着、要么立刻 ECONNREFUSED）；
 *   · "日志不泄漏"最坏的错误是**假绿**（探针猜错载荷形状 → 报"没泄漏"）。
 * 所以这个脚本**自己起网关实例**（`spawn(process.execPath, [...])` + 环境变量覆盖，
 * stdout/stderr 落到 `reports/gateway-<name>.log`），上游用一个**脚本内自带的 stub**
 * —— 只有 stub 才能稳定造出"分两次写、中间挂 1.5 秒""一个字节都不写""写完一块就挂着"。
 *
 * 与 `verify-agent.mjs` 的关系（两条**独立**的闸门，别混）：
 *   · `verify:agent` 验的是**契约**（事件名 / 取答 / interrupt / 降级）——直连 2024；
 *   · `verify:gateway` 验的是**网关这一层**（路由白名单 / 来源 / 限流 / 闸门 / SSE 不缓冲 /
 *     超时收口 / 日志不泄漏）——打的是 8787 上的网关，其中最后一段再对真后端跑一遍
 *     同样的调用序列（证明"透传之后契约仍然成立"）。
 *
 * ⚠️ 这个项目在这类脚本上踩过的两个坑，本脚本按它们写了：
 *   ① **假绿**：只断言"没找到禁词"是不够的 —— 探针自己读错文件/猜错形状时会**恒真**。
 *      所以「日志不泄漏」是**双向**的：既断言金丝雀与假密钥**不在**日志里，
 *      也断言 thread id **在**日志行上，并断言 stub 确实收到过金丝雀（负数断言不空过）。
 *   ② **SKIP ≠ 通过**：真后端那 4 项连不上就 ⏭ 跳过（**不计入通过**、原因单独一行打印），
 *      且退出码只由"stub 那部分有没有失败"决定 —— 环境没起不许把 CI 变红。
 *
 * 零依赖：只用 Node 原生 `node:http` / `node:net` / `node:child_process` / `node:fs`。
 * 用法：`pnpm verify:gateway`
 * 产物：`reports/verify-gateway.log`（UTF-8 全文）、`reports/verify-gateway.json`、
 *       `reports/gateway-<name>.log`（每个被 spawn 的网关实例的原始输出）
 * 退出码：任一断言失败 → 1；否则 0（含"真后端没起、那 4 项跳过"）。
 */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";

const root = process.cwd();
const GATEWAY = path.resolve(root, "server/pet-gateway.mjs");
const REPORTS = path.resolve(root, "reports");

/* ── 契约常量：**与 `server/pet-gateway.mjs` 的 DEFAULTS 对齐** ────────────────
   ⚠️ 这里抄一份数字是**故意的**：脚本要能对着"文档/代码里声称的生产口径"断言，
   自己 import 网关的 DEFAULTS 就成了"拿自己和自己比"（永远绿）。
   生效值的**唯一**权威来源是纯默认实例的 `GET /__gw/health`（下面 L2/L3 会逐个比）。 */
const CONTRACT = {
	port: 8787,
	prefix: "/api/agent",
	upstream: "http://127.0.0.1:2024",
	allowedOrigins: ["http://localhost:4321", "http://localhost:4323"],
	rateLimitPerMin: 20,
	rateWindowMs: 60000,
	maxBodyBytes: 8192,
	maxChars: 1000,
	roundTimeoutMs: 300000,
	trustProxy: false,
	deadUpstreamTimeoutMs: 1800,
	realStreamTimeoutMs: 90000,
	/** 真后端这一段用哪张图（与 `verify-agent.mjs` 的 `graphId` 同一个） */
	graphId: "blog_agent",
	realProbeMessage: "在吗",
};
const START_CMD = "cd ..\\agent_-for_-blog; langgraph dev";

/** 探针哨兵：既证明"请求真的带过它"，也用来断言它**没**出现在网关日志里 */
const CANARY = "PET_GATEWAY_CANARY_7f3a1c";
const FAKE_SECRET = "sk-canary-should-not-appear";

const results = [];
const record = (area, desc, pass, detail = "", skipped = false) =>
	results.push({ area, desc, pass, skipped, detail });

/* ── 输出 ─────────────────────────────────────────────────────────────────── */
const lines = [];
const say = (s = "") => {
	lines.push(s);
	console.log(s);
};

/* ── 极小的 HTTP 客户端（零依赖；SSE 要按 chunk 计时，所以不用 fetch）────────── */
function rawRequest(target, opts = {}) {
	const { method = "GET", headers = {}, body = null, timeoutMs = 15000, onChunk } = opts;
	return new Promise((resolve) => {
		const u = new URL(target);
		const t0 = Date.now();
		const out = {
			target,
			method,
			status: 0,
			headers: {},
			text: "",
			chunks: [],
			firstChunkMs: null,
			totalMs: null,
			timedOut: false,
			error: null,
		};
		let settled = false;
		let timer = null;
		const finish = () => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			resolve(out);
		};
		const req = http.request(
			{ hostname: u.hostname, port: u.port, path: `${u.pathname}${u.search}`, method, headers },
			(res) => {
				out.status = res.statusCode ?? 0;
				out.headers = res.headers;
				const bufs = [];
				res.on("data", (c) => {
					if (out.firstChunkMs === null) out.firstChunkMs = Date.now() - t0;
					const s = Buffer.isBuffer(c) ? c.toString("utf8") : String(c);
					out.chunks.push(s);
					bufs.push(Buffer.isBuffer(c) ? c : Buffer.from(s, "utf8"));
					if (onChunk) onChunk(s, out);
				});
				res.on("end", () => {
					out.text = Buffer.concat(bufs).toString("utf8");
					out.totalMs = Date.now() - t0;
					finish();
				});
				res.on("error", (err) => {
					out.error = err;
					out.totalMs = Date.now() - t0;
					finish();
				});
			},
		);
		req.on("error", (err) => {
			out.error = err;
			out.totalMs = Date.now() - t0;
			finish();
		});
		timer = setTimeout(() => {
			out.timedOut = true;
			out.totalMs = Date.now() - t0;
			req.destroy();
			finish();
		}, timeoutMs);
		if (body !== null && body !== undefined) req.write(body);
		req.end();
	});
}

const jparse = (text) => {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── stub 上游（脚本自带：只有它能稳定造出"缓冲 / 永不响应 / 写一半挂着"）───── */
function startStub() {
	const log = [];
	const sockets = new Set();
	const server = http.createServer((req, res) => {
		const bufs = [];
		req.on("data", (c) => bufs.push(c));
		req.on("end", () => {
			const body = Buffer.concat(bufs).toString("utf8");
			log.push({ method: req.method, url: req.url, headers: req.headers, body });
			handle(req, res, body);
		});
	});
	server.on("connection", (s) => {
		sockets.add(s);
		s.on("close", () => sockets.delete(s));
	});

	const json = (res, status, payload, extra = {}) => {
		const b = Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
		res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": String(b.length), ...extra });
		res.end(b);
	};
	const sse = (res, extra = {}) => {
		res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", ...extra });
		res.flushHeaders?.();
	};

	function handle(req, res, body) {
		const url = req.url ?? "/";
		const parsed = new URL(url, "http://stub.invalid");
		const pathname = parsed.pathname;
		const m = /^\/threads\/([A-Za-z0-9_-]+)\/runs\/stream$/.exec(pathname);
		if (pathname === "/ok") {
			if (parsed.searchParams.get("hang") === "1") return; // 一个字节都不回（测 504）
			return json(res, 200, { ok: true });
		}
		if (pathname === "/assistants/search") {
			return json(res, 200, [{ graph_id: CONTRACT.graphId, assistant_id: "stub-assistant-1" }]);
		}
		if (pathname === "/threads") return json(res, 200, { thread_id: "stub-thread-1" });
		if (m) {
			const id = m[1];
			if (id === "sse404") return json(res, 404, { detail: "stub says no" });
			if (id === "sseslow") {
				sse(res);
				res.write('data: {"a":1}\n\n');
				setTimeout(() => {
					res.write('data: {"b":2}\n\n');
					res.end();
				}, 1500);
				return;
			}
			if (id === "ssehang") {
				sse(res);
				res.write('data: {"a":1}\n\n');
				return; // 写完一块就挂着（测"流已开始时的单轮硬上限"）
			}
			if (id === "sseecho") {
				const parsed = jparse(body);
				const msgs = parsed?.input?.messages ?? [];
				const lastUser = [...msgs].reverse().find((x) => x.role === "user" || x.type === "human");
				const content = typeof lastUser?.content === "string" ? lastUser.content : "";
				sse(res, { "x-stub-secret": FAKE_SECRET });
				res.write(`data: {"echo":${JSON.stringify(content)},"secret":${JSON.stringify(FAKE_SECRET)}}\n\n`);
				res.end();
				return;
			}
			sse(res);
			res.write('data: {"values":{"messages":[]}}\n\n');
			res.end();
			return;
		}
		const stateM = /^\/threads\/([A-Za-z0-9_-]+)\/state$/.exec(pathname);
		if (stateM) return json(res, 200, { values: { messages: [] } });
		return json(res, 404, { error: "stub_not_found", url });
	}

	return {
		log,
		listen: () =>
			new Promise((resolve) => {
				server.listen(0, "127.0.0.1", () => resolve(server.address().port));
			}),
		close: () =>
			new Promise((resolve) => {
				for (const s of sockets) s.destroy();
				server.close(() => resolve());
			}),
		base: () => `http://127.0.0.1:${server.address().port}`,
	};
}

/** 借一个端口再立刻放掉 —— 用来造"确定没人监听"的死上游端口 */
function reserveClosedPort() {
	return new Promise((resolve) => {
		const s = net.createServer();
		s.listen(0, "127.0.0.1", () => {
			const { port } = s.address();
			s.close(() => resolve(port));
		});
	});
}

function freePort() {
	return reserveClosedPort();
}

/* ── 起 / 收网关实例 ─────────────────────────────────────────────────────── */
const spawned = [];

/**
 * 起一个网关实例。`env` 里给的是**覆盖项**；其余 PET_* 一律从环境里**剔除**
 * （否则跑脚本的人 shell 里 export 过的 PET_ALLOWED_ORIGINS 会静默改变结果，
 *  "纯默认实例"也就不纯了 —— 那正是本脚本 L2/L3 要钉的东西）。
 */
async function startGateway(name, env = {}) {
	const port = await freePort();
	const inherited = {};
	for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("PET_")) inherited[k] = v;
	const logFile = path.join(REPORTS, `gateway-${name}.log`);
	const fd = fsSync.openSync(logFile, "w");
	const child = spawn(process.execPath, [GATEWAY], {
		env: { ...inherited, PET_GATEWAY_PORT: String(port), ...env },
		stdio: ["ignore", fd, fd],
		windowsHide: true,
	});
	fsSync.closeSync(fd);
	const rec = { name, port, pid: child.pid, child, logFile, base: `http://127.0.0.1:${port}` };
	spawned.push(rec);
	// 就绪判据 = 日志里出现 "listening on"（**不**打 HTTP 探针：探针会吃掉限流的令牌）
	const deadline = Date.now() + 8000;
	for (;;) {
		await sleep(60);
		let text = "";
		try {
			text = await fs.readFile(logFile, "utf8");
		} catch {
			text = "";
		}
		if (/listening on http/.test(text)) break;
		if (Date.now() > deadline) throw new Error(`网关实例 ${name} 8 秒内没起来（看 ${logFile}）`);
	}
	return rec;
}

async function stopAll() {
	for (const rec of spawned) {
		try {
			if (rec.child.exitCode === null && !rec.child.killed) rec.child.kill();
		} catch {
			/* 已经没了 */
		}
	}
	spawned.length = 0;
}

/* ── 主流程 ───────────────────────────────────────────────────────────────── */
async function main() {
	const startedAt = new Date();
	say("桌宠 Agent 网关自检（pnpm verify:gateway）");
	say(`被测：server/pet-gateway.mjs ｜ 契约：ARCH.md §8.4 / §8.5 ｜ 生产上游默认：${CONTRACT.upstream}`);
	say("");

	await fs.mkdir(REPORTS, { recursive: true });

	/* ── 零、预检（静态：文件 / 零依赖 / 注册 / --help）────────────────────── */
	{
		let ok = true;
		let detail = "";
		try {
			execFileSync(process.execPath, ["--check", GATEWAY], { stdio: "pipe" });
			detail = "node --check 通过";
		} catch (err) {
			ok = false;
			detail = `node --check 失败：${String(err.stderr ?? err.message).slice(0, 300)}`;
		}
		record("预检", "server/pet-gateway.mjs 存在且语法通过（node --check）", ok, detail);

		let src = "";
		try {
			src = await fs.readFile(GATEWAY, "utf8");
		} catch (err) {
			record("预检", "能读到网关源码", false, err.message);
		}
		if (src) {
			// 零依赖：所有 import 的模块都必须是 node: 内建（不引第三方、不 shell out）
			const specs = [...src.matchAll(/(?:^|\n)\s*import\s[^"']*["']([^"']+)["']/g)].map((m) => m[1]);
			const bad = specs.filter((s) => !s.startsWith("node:"));
			record(
				"预检",
				`零依赖：网关只 import node: 内建模块（实测 ${specs.length} 条 import）`,
				specs.length > 0 && bad.length === 0,
				bad.length ? `非内建：${bad.join(", ")}` : specs.join(", "),
			);
			const noChild = !/child_process|execSync|spawn\(/.test(src);
			record("预检", "网关不 shell out（无 child_process / spawn）", noChild, noChild ? "未出现" : "源码里出现 child_process/spawn");
		}

		const pkg = jparse(await fs.readFile(path.resolve(root, "package.json"), "utf8"));
		const script = pkg?.scripts?.["verify:gateway"] ?? "";
		record(
			"预检",
			'package.json 里注册了 "verify:gateway" → node scripts/verify-gateway.mjs',
			script === "node scripts/verify-gateway.mjs",
			`实测 ${JSON.stringify(script)}`,
		);

		let help = "";
		let code = 0;
		try {
			help = execFileSync(process.execPath, [GATEWAY, "--help"], { encoding: "utf8" });
		} catch (err) {
			code = err.status ?? 1;
		}
		record(
			"预检",
			"--help 退出码 0 且写明用法 / 环境变量 / 路由白名单",
			code === 0 && /PET_GATEWAY_UPSTREAM/.test(help) && /verify:gateway/.test(help) && /\/__gw\/health/.test(help),
			`退出码 ${code} ｜ ${help.split("\n").filter(Boolean).length} 行`,
		);
	}

	/* ── stub 上游 + 主实例 ────────────────────────────────────────────────── */
	stubRef = startStub();
	const stub = stubRef;
	const stubPort = await stub.listen();
	const stubBase = `http://127.0.0.1:${stubPort}`;
	// 主实例：只把限流放宽（免得跨用例把桶打空），**其余全默认** → 长度/体积闸门测的就是出厂值
	const mainGw = await startGateway("main", { PET_GATEWAY_UPSTREAM: stubBase, PET_GATEWAY_RATE_LIMIT: "100" });
	const reqCount = () => stub.log.length;

	/* ── 一、路由白名单 + 前缀剥离 ─────────────────────────────────────────── */
	{
		const before = reqCount();
		const r = await rawRequest(`${mainGw.base}/api/agent/ok`);
		const got = stub.log.slice(before).map((x) => `${x.method} ${x.url}`);
		const body = jparse(r.text);
		record(
			"路由白名单 · 前缀剥离",
			"GET /api/agent/ok → 200，且上游收到的是剥掉前缀的 GET /ok",
			r.status === 200 && body?.ok === true && got.includes("GET /ok"),
			`网关 ${r.status} ${JSON.stringify(body)} ｜ 上游收到 [${got.join(", ")}]`,
		);
	}
	{
		const before = reqCount();
		const r = await rawRequest(`${mainGw.base}/ok`);
		const got = stub.log.slice(before).map((x) => `${x.method} ${x.url}`);
		record(
			"路由白名单 · 前缀剥离",
			"bare GET /ok 也放行（本地开发便利），上游同样收到 /ok",
			r.status === 200 && got.includes("GET /ok"),
			`网关 ${r.status} ｜ 上游收到 [${got.join(", ")}]`,
		);
	}
	{
		const before = reqCount();
		const r = await rawRequest(`${mainGw.base}/api/agent/ok?x=1`);
		const got = stub.log.slice(before).map((x) => x.url);
		record(
			"路由白名单 · 前缀剥离",
			"查询串原样转发（/ok?x=1，前缀剥掉但 query 不动）",
			r.status === 200 && got.includes("/ok?x=1"),
			`网关 ${r.status} ｜ 上游收到 [${got.join(", ")}]`,
		);
	}
	{
		const before = reqCount();
		const r = await rawRequest(`${mainGw.base}/api/agent/assistants/abc`);
		const body = jparse(r.text);
		record(
			"路由白名单",
			"不在白名单的 GET /assistants/abc → 404，且上游一个请求都没收到",
			r.status === 404 && body?.error === "not_found" && reqCount() === before,
			`网关 ${r.status} ${JSON.stringify(body)} ｜ 期间上游请求数 ${reqCount() - before}`,
		);
	}
	{
		const before = reqCount();
		const r = await rawRequest(`${mainGw.base}/api/agent/docs`);
		record(
			"路由白名单",
			"上游自带面 /docs 不可达（拿本站当跳板这条路被堵死）→ 404 且不打上游",
			r.status === 404 && reqCount() === before,
			`网关 ${r.status} ｜ 期间上游请求数 ${reqCount() - before}`,
		);
	}
	{
		const before = reqCount();
		const r = await rawRequest(`${mainGw.base}/api/agent/threads/%2e%2e%2fok`);
		record(
			"路由白名单 · 编码穿越",
			"GET /api/agent/threads/%2e%2e%2fok → 404 且不打上游（%2f 与 .. 两层都判）",
			r.status === 404 && reqCount() === before,
			`网关 ${r.status} ｜ 期间上游请求数 ${reqCount() - before}`,
		);
	}
	{
		const r = await rawRequest(`${mainGw.base}/api/agent/threads`, { method: "DELETE" });
		record(
			"路由白名单 · 方法",
			"DELETE /threads → 405（路径在、方法不在），并给出 allow 头",
			r.status === 405 && /\bPOST\b/.test(String(r.headers.allow ?? "")) && jparse(r.text)?.error === "method_not_allowed",
			`网关 ${r.status} ｜ allow=${r.headers.allow ?? "(无)"} ｜ ${r.text.trim()}`,
		);
	}
	{
		const r = await rawRequest(`${mainGw.base}/api/agent/threads`, { method: "GET" });
		record(
			"路由白名单 · 方法",
			"GET /threads → 405（POST 专有路由不许被 GET 顶替）",
			r.status === 405,
			`网关 ${r.status} ｜ ${r.text.trim()}`,
		);
	}

	/* ── 二、来源白名单（Origin / Referer）─────────────────────────────────── */
	const ALLOWED = CONTRACT.allowedOrigins[1]; // http://localhost:4323（preview 那个）
	{
		const before = reqCount();
		const r = await rawRequest(`${mainGw.base}/api/agent/ok`, { headers: { origin: "http://evil.example" } });
		const body = jparse(r.text);
		record(
			"来源白名单",
			"Origin: http://evil.example → 403 origin_not_allowed，且上游一个请求都没收到",
			r.status === 403 && body?.error === "origin_not_allowed" && reqCount() === before,
			`网关 ${r.status} ${JSON.stringify(body)} ｜ 期间上游请求数 ${reqCount() - before}`,
		);
	}
	{
		const r = await rawRequest(`${mainGw.base}/api/agent/ok`, { headers: { origin: ALLOWED } });
		const acao = String(r.headers["access-control-allow-origin"] ?? "");
		record(
			"来源白名单 · 实际响应",
			`白名单来源的实际响应带 ACAO=${ALLOWED}（且**不是** *）`,
			r.status === 200 && acao === ALLOWED && !acao.includes("*") && String(r.headers.vary ?? "").includes("origin"),
			`网关 ${r.status} ｜ ACAO=${acao || "(无)"} ｜ vary=${r.headers.vary ?? "(无)"}`,
		);
	}
	{
		const r = await rawRequest(`${mainGw.base}/api/agent/threads`, {
			method: "OPTIONS",
			headers: { origin: ALLOWED, "access-control-request-method": "POST" },
		});
		const acao = String(r.headers["access-control-allow-origin"] ?? "");
		const acam = String(r.headers["access-control-allow-methods"] ?? "");
		const acah = String(r.headers["access-control-allow-headers"] ?? "");
		record(
			"来源白名单 · 预检",
			"白名单来源的 OPTIONS 预检 → 204 + 三个 CORS 头 + vary（值里**永不**出现 *）",
			r.status === 204 &&
				acao === ALLOWED &&
				acam === "GET,POST,OPTIONS" &&
				acah === "content-type" &&
				String(r.headers.vary ?? "").includes("origin") &&
				!(acao + acam + acah).includes("*"),
			`网关 ${r.status} ｜ ACAO=${acao || "(无)"} ｜ ACAM=${acam || "(无)"} ｜ ACAH=${acah || "(无)"}`,
		);
	}
	{
		const r = await rawRequest(`${mainGw.base}/api/agent/threads`, {
			method: "OPTIONS",
			headers: { origin: "http://evil.example", "access-control-request-method": "POST" },
		});
		record(
			"来源白名单 · 预检",
			"非白名单来源的预检同样 403（预检不是后门）",
			r.status === 403,
			`网关 ${r.status} ｜ ${r.text.trim()}`,
		);
	}
	{
		const r = await rawRequest(`${mainGw.base}/api/agent/ok`);
		record(
			"来源白名单 · 无来源",
			"既无 Origin 也无 Referer（curl / 同源非 CORS / 服务间调用）→ 放行",
			r.status === 200,
			`网关 ${r.status}`,
		);
	}
	{
		const okRef = await rawRequest(`${mainGw.base}/api/agent/ok`, { headers: { referer: `${ALLOWED}/some/page/` } });
		const badRef = await rawRequest(`${mainGw.base}/api/agent/ok`, { headers: { referer: "http://evil.example/page/" } });
		record(
			"来源白名单 · Referer 回落",
			"没有 Origin 时按 Referer 的来源判：白名单通过 / 站外 403",
			okRef.status === 200 && badRef.status === 403,
			`白名单 Referer → ${okRef.status} ｜ 站外 Referer → ${badRef.status}`,
		);
	}
	{
		const before = reqCount();
		await rawRequest(`${mainGw.base}/api/agent/ok`, {
			headers: { origin: ALLOWED, referer: `${ALLOWED}/x/`, cookie: "session=should-not-forward" },
		});
		const seen = stub.log.slice(before)[0]?.headers ?? {};
		const forwarded = Object.keys(seen).filter((h) => ["origin", "referer", "cookie"].includes(h));
		record(
			"来源白名单 · 不转发",
			"客户端的 origin / referer / cookie **一个都不转发**上游",
			forwarded.length === 0,
			forwarded.length ? `上游收到了：${forwarded.join(", ")}` : `上游收到的头：${Object.keys(seen).sort().join(", ")}`,
		);
	}

	/* ── 三、体积与长度闸门 ───────────────────────────────────────────────── */
	{
		const before = reqCount();
		const big = `{"input":{"messages":[{"role":"user","content":"${"a".repeat(9000)}"}]}}`;
		const r = await rawRequest(`${mainGw.base}/api/agent/threads/t1/runs/stream`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: big,
		});
		const body = jparse(r.text);
		record(
			"体积闸门",
			`请求体 ${Buffer.byteLength(big)} 字节 > 上限 ${CONTRACT.maxBodyBytes} → 413 body_too_large，且不打上游`,
			r.status === 413 && body?.error === "body_too_large" && reqCount() === before,
			`网关 ${r.status} ${JSON.stringify(body)} ｜ 期间上游请求数 ${reqCount() - before}`,
		);
	}
	{
		const r = await rawRequest(`${mainGw.base}/api/agent/threads/t1/runs/stream`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: '{"input":{"messages":[{"role":"user","content":',
		});
		const body = jparse(r.text);
		record(
			"长度闸门",
			"坏 JSON → 400 invalid_json（不是 500，也不是硬着头皮转发）",
			r.status === 400 && body?.error === "invalid_json",
			`网关 ${r.status} ${JSON.stringify(body)}`,
		);
	}
	{
		// ⚠️ 用 emoji 当探针：`"🙂".repeat(1001)` 的码点是 1001、UTF-16 长度是 2002、
		//    字节是 4004 —— 只有**真按码点**数的实现才会给出 actual=1001。
		const text = "🙂".repeat(CONTRACT.maxChars + 1);
		const before = reqCount();
		const r = await rawRequest(`${mainGw.base}/api/agent/threads/t2/runs/stream`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ input: { messages: [{ role: "user", content: text }] } }),
		});
		const body = jparse(r.text);
		record(
			"长度闸门",
			`超长（${CONTRACT.maxChars + 1} 码点）→ 400 message_too_long，且 actual 按**码点**数 = ${CONTRACT.maxChars + 1}`,
			r.status === 400 &&
				body?.error === "message_too_long" &&
				body?.maxChars === CONTRACT.maxChars &&
				body?.actual === CONTRACT.maxChars + 1 &&
				reqCount() === before,
			`网关 ${r.status} ${JSON.stringify(body)} ｜ 该串 UTF-16 长度 ${text.length}、字节 ${Buffer.byteLength(text)} ｜ 期间上游请求数 ${reqCount() - before}`,
		);
	}
	{
		const text = "🙂".repeat(CONTRACT.maxChars);
		const before = reqCount();
		const r = await rawRequest(`${mainGw.base}/api/agent/threads/t3/runs/stream`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ input: { messages: [{ role: "user", content: text }] } }),
		});
		const seen = stub.log.slice(before)[0];
		record(
			"长度闸门 · 边界另一侧",
			`恰好 ${CONTRACT.maxChars} 码点 → **放行**（200），且上游确实收到了它`,
			r.status === 200 && Boolean(seen) && seen.body.includes(text),
			`网关 ${r.status} ｜ 上游收到 ${seen ? `${seen.method} ${seen.url}（${seen.body.length} 字节）` : "(无)"}`,
		);
	}
	{
		// 真前端发的是 `{type:"human"}`（§8.9.2），不是 `{role:"user"}` —— 只认后者的话
		// 这条闸门**永远碰不到真实流量**（§14.3 T80）。这一项就是钉住这一点。
		const text = "b".repeat(CONTRACT.maxChars + 1);
		const before = reqCount();
		const r = await rawRequest(`${mainGw.base}/api/agent/threads/t4/runs/stream`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ input: { messages: [{ type: "human", content: text }] } }),
		});
		const body = jparse(r.text);
		record(
			"长度闸门 · 形状覆盖",
			'前端的真实形状（type:"human"，§8.9.2）同样受闸门约束 → 400',
			r.status === 400 && body?.error === "message_too_long" && body?.actual === CONTRACT.maxChars + 1 && reqCount() === before,
			`网关 ${r.status} ${JSON.stringify(body)}`,
		);
	}
	{
		// content 分片形态：`[{type:"text",text}]` 必须也能数出长度（否则换个形状就绕过）
		const r = await rawRequest(`${mainGw.base}/api/agent/threads/t5/runs/stream`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				input: { messages: [{ role: "user", content: [{ type: "text", text: "c".repeat(CONTRACT.maxChars + 5) }] }] },
			}),
		});
		const body = jparse(r.text);
		record(
			"长度闸门 · 形状覆盖",
			'content 为分片数组（[{type:"text",text}]）时同样数得出来 → 400',
			r.status === 400 && body?.error === "message_too_long" && body?.actual === CONTRACT.maxChars + 5,
			`网关 ${r.status} ${JSON.stringify(body)}`,
		);
	}
	{
		// 只有人类消息才算长度：`command.resume` 续跑轮没有 input.messages，不该被误杀
		const r = await rawRequest(`${mainGw.base}/api/agent/threads/t6/runs/stream`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ command: { resume: "不提供" }, assistant_id: "stub-assistant-1" }),
		});
		record(
			"长度闸门 · 不误杀续跑",
			"续跑轮（command.resume，没有 input.messages）→ 放行",
			r.status === 200,
			`网关 ${r.status}`,
		);
	}

	/* ── 四、SSE 直通（不缓冲 / 状态码 / 帧完整）──────────────────────────── */
	{
		const r = await rawRequest(`${mainGw.base}/api/agent/threads/t7/runs/stream`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ input: { messages: [{ role: "user", content: "hi" }] } }),
		});
		const ct = String(r.headers["content-type"] ?? "");
		const cc = String(r.headers["cache-control"] ?? "");
		record(
			"SSE 直通 · 响应头",
			"content-type=text/event-stream; charset=utf-8 ｜ cache-control 含 no-transform ｜ x-accel-buffering: no",
			r.status === 200 &&
				ct === "text/event-stream; charset=utf-8" &&
				cc.includes("no-transform") &&
				String(r.headers["x-accel-buffering"] ?? "") === "no",
			`网关 ${r.status} ｜ content-type=${ct || "(无)"} ｜ cache-control=${cc || "(无)"} ｜ x-accel-buffering=${r.headers["x-accel-buffering"] ?? "(无)"}`,
		);
	}
	{
		// ★ 这一项是整套里最重要的：stub 先写一块、隔 1500ms 再写第二块。
		//   网关若"等上游结束再一次性吐"，两块会在 1500ms 附近**一起**到 —— 那一侧必红。
		const r = await rawRequest(`${mainGw.base}/api/agent/threads/sseslow/runs/stream`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ input: { messages: [{ role: "user", content: "hi" }] } }),
			timeoutMs: 8000,
		});
		const gap = r.firstChunkMs === null ? null : r.totalMs - r.firstChunkMs;
		record(
			"SSE 直通 · 不缓冲",
			"上游分两块、中间隔 1500ms：第一块 <1000ms 到，第二块 ≥1400ms 后才到（说明网关没等上游结束）",
			r.status === 200 && r.firstChunkMs !== null && r.firstChunkMs < 1000 && gap !== null && gap >= 1400,
			`首块 ${r.firstChunkMs}ms ｜ 末块-首块 ${gap}ms ｜ 共 ${r.totalMs}ms ｜ 块数 ${r.chunks.length}`,
		);
		record(
			"SSE 直通 · 帧完整",
			"两块内容都原样到达（data: {\"a\":1} 与 data: {\"b\":2}）",
			r.text.includes('data: {"a":1}') && r.text.includes('data: {"b":2}'),
			`收到 ${JSON.stringify(r.text.slice(0, 80))}…`,
		);
	}
	{
		const r = await rawRequest(`${mainGw.base}/api/agent/threads/sse404/runs/stream`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ input: { messages: [{ role: "user", content: "hi" }] } }),
		});
		record(
			"SSE 直通 · 状态码",
			"上游非 200（404）在流式路由上原样透传（不吞成 200）",
			r.status === 404,
			`网关 ${r.status} ｜ ${r.text.trim().slice(0, 80)}`,
		);
	}

	/* ── 五、日志不泄漏（双向；含正向对照）────────────────────────────────── */
	// 线程 id 用 `sseecho`：stub 见到这个 id 会把用户消息与假密钥**原样回吐** ——
	// 这样"金丝雀真的流过了网关"就不是推测，而是同一次请求里可断言的事实。
	const echoThread = "sseecho";
	{
		const r = await rawRequest(`${mainGw.base}/api/agent/threads/${echoThread}/runs/stream`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ input: { messages: [{ role: "user", content: `${CANARY} 这句话不许进日志` }] } }),
		});
		const seen = stub.log.find((x) => x.url === `/threads/${echoThread}/runs/stream`);
		// 等日志落盘（日志在响应 finish 时写；先轮询出现流式那一行，再读全文）
		const logPath = mainGw.logFile;
		let log = "";
		const deadline = Date.now() + 3000;
		for (;;) {
			log = await fs.readFile(logPath, "utf8");
			if (new RegExp(`thread=${echoThread}\\b`).test(log) || Date.now() > deadline) break;
			await sleep(80);
		}

		// 正向对照（**先证明数据真的流过**，否则下面两条"没找到"就是空过）
		const upstreamGotCanary = Boolean(seen) && seen.body.includes(CANARY);
		const clientGotSecret = r.text.includes(FAKE_SECRET) && r.text.includes(CANARY);
		record(
			"日志不泄漏 · 前提",
			"金丝雀确实到过上游、假密钥确实随 SSE 回到过客户端（负数断言不空过）",
			upstreamGotCanary && clientGotSecret,
			`上游收到金丝雀=${upstreamGotCanary} ｜ 客户端收到 [金丝雀+假密钥]=${clientGotSecret} ｜ 客户端 ${r.text.trim().slice(0, 90)}`,
		);
		record(
			"日志不泄漏 · 负面①",
			"用户消息原文（金丝雀）**不在**网关日志里",
			!log.includes(CANARY),
			log.includes(CANARY) ? "日志里出现了金丝雀" : `日志 ${log.length} 字节，未出现金丝雀`,
		);
		record(
			"日志不泄漏 · 负面②",
			"上游响应体里的假密钥 / SSE 正文**不在**网关日志里",
			!log.includes(FAKE_SECRET) && !log.includes("data: {"),
			log.includes(FAKE_SECRET) ? "日志里出现了假密钥" : `未出现 ${FAKE_SECRET} 与 SSE 正文`,
		);
		record(
			"日志不泄漏 · 正面",
			`流式那一行**带 thread id**（thread=${echoThread}）且格式可 grep`,
			new RegExp(`\\[gw\\] \\S+ POST /threads/${echoThread}/runs/stream \\d+ \\d+ms ip=\\S+ thread=${echoThread}`).test(log),
			(log.split("\n").find((l) => l.includes(`thread=${echoThread}`)) ?? "(没找到那一行)").slice(0, 200),
		);
	}

	/* ── 六、限流（独立实例：PET_GATEWAY_RATE_LIMIT=3）────────────────────── */
	{
		const gw = await startGateway("ratelimit", { PET_GATEWAY_UPSTREAM: stubBase, PET_GATEWAY_RATE_LIMIT: "3" });
		const statuses = [];
		for (let i = 0; i < 3; i++) {
			const r = await rawRequest(`${gw.base}/api/agent/ok`);
			statuses.push(r.status);
		}
		const fourth = await rawRequest(`${gw.base}/api/agent/ok`);
		const body = jparse(fourth.text);
		const retryAfter = Number(fourth.headers["retry-after"] ?? 0);
		record(
			"限流",
			"PET_GATEWAY_RATE_LIMIT=3：前 3 个 200，第 4 个 429 + retry-after 头 + retryAfterSeconds",
			statuses.every((s) => s === 200) &&
				fourth.status === 429 &&
				body?.error === "rate_limited" &&
				Number.isFinite(body?.retryAfterSeconds) &&
				body.retryAfterSeconds >= 1 &&
				retryAfter >= 1,
			`前三个 ${statuses.join("/")} ｜ 第四个 ${fourth.status} ${JSON.stringify(body)} ｜ retry-after=${fourth.headers["retry-after"] ?? "(无)"}`,
		);
		record(
			"限流 · 只掐超额的那一侧",
			"限流实例的非超额请求仍然正常透传（不是整段打死）",
			statuses[0] === 200,
			`第一个请求 ${statuses[0]}`,
		);
	}
	{
		// ★ 客户端 IP 这条闸门有两半：**信 XFF 时要真按 XFF 分桶**，**不信时要完全无视它**。
		//   只测一半的话，"开了 trust proxy 但代码里没读 XFF"与"没开却读了 XFF（可伪造）"
		//   这两种坏法都不会显形 —— 所以两个方向各起一个实例。
		const spoofA = "203.0.113.7";
		const spoofB = "198.51.100.9";

		const trusted = await startGateway("xff-trust", {
			PET_GATEWAY_UPSTREAM: stubBase,
			PET_GATEWAY_RATE_LIMIT: "2",
			PET_GATEWAY_TRUST_PROXY: "1",
		});
		const tA1 = await rawRequest(`${trusted.base}/api/agent/ok`, { headers: { "x-forwarded-for": spoofA } });
		const tA2 = await rawRequest(`${trusted.base}/api/agent/ok`, { headers: { "x-forwarded-for": `${spoofA}, 10.0.0.1` } });
		const tA3 = await rawRequest(`${trusted.base}/api/agent/ok`, { headers: { "x-forwarded-for": spoofA } });
		const tB1 = await rawRequest(`${trusted.base}/api/agent/ok`, { headers: { "x-forwarded-for": spoofB } });
		record(
			"客户端 IP · trust proxy 打开时",
			`PET_GATEWAY_TRUST_PROXY=1：按 X-Forwarded-For **最左项**分桶（${spoofA} 打满 2 次后第 3 次 429，换 ${spoofB} 立刻可用）`,
			tA1.status === 200 && tA2.status === 200 && tA3.status === 429 && tB1.status === 200,
			`${spoofA}: ${tA1.status}/${tA2.status}/${tA3.status} ｜ ${spoofB}: ${tB1.status}`,
		);

		const ignoring = await startGateway("xff-ignore", {
			PET_GATEWAY_UPSTREAM: stubBase,
			PET_GATEWAY_RATE_LIMIT: "2",
		});
		const iA1 = await rawRequest(`${ignoring.base}/api/agent/ok`, { headers: { "x-forwarded-for": spoofA } });
		const iA2 = await rawRequest(`${ignoring.base}/api/agent/ok`, { headers: { "x-forwarded-for": spoofA } });
		const iB1 = await rawRequest(`${ignoring.base}/api/agent/ok`, { headers: { "x-forwarded-for": spoofB } });
		record(
			"客户端 IP · 默认（无反代）",
			"默认不认 X-Forwarded-For：换个伪造 IP **换不到新桶**（同一个 socket 第 3 次仍然 429）",
			iA1.status === 200 && iA2.status === 200 && iB1.status === 429,
			`伪造 ${spoofA}: ${iA1.status}/${iA2.status} ｜ 改伪造 ${spoofB}: ${iB1.status}（仍是同一个桶）`,
		);
	}

	/* ── 七、纯默认实例：把**出厂口径**逐个读回来（生产值 pin）────────────── */
	{
		const gw = await startGateway("defaults", {});
		const r = await rawRequest(`${gw.base}/__gw/health`);
		const h = jparse(r.text);
		const L = h?.limits ?? {};
		record(
			"出厂口径",
			`纯默认实例（零 PET_* 覆盖）的 health 可读且 ok:true`,
			r.status === 200 && h?.ok === true,
			`网关 ${r.status} ｜ ${r.text.trim().slice(0, 160)}`,
		);
		record(
			"出厂口径 · 限额",
			`rateLimitPerMin=${CONTRACT.rateLimitPerMin} ｜ rateWindowMs=${CONTRACT.rateWindowMs} ｜ maxBodyBytes=${CONTRACT.maxBodyBytes} ｜ maxChars=${CONTRACT.maxChars} ｜ roundTimeoutMs=${CONTRACT.roundTimeoutMs} ｜ trustProxy=${CONTRACT.trustProxy}`,
			L.rateLimitPerMin === CONTRACT.rateLimitPerMin &&
				L.rateWindowMs === CONTRACT.rateWindowMs &&
				L.maxBodyBytes === CONTRACT.maxBodyBytes &&
				L.maxChars === CONTRACT.maxChars &&
				L.roundTimeoutMs === CONTRACT.roundTimeoutMs &&
				L.trustProxy === CONTRACT.trustProxy,
			`实测 ${JSON.stringify(L)}`,
		);
		record(
			"出厂口径 · 来源与上游",
			`prefix=${CONTRACT.prefix} ｜ allowedOrigins=${CONTRACT.allowedOrigins.join(" + ")} ｜ upstream=${CONTRACT.upstream}`,
			h?.prefix === CONTRACT.prefix &&
				JSON.stringify(h?.allowedOrigins) === JSON.stringify(CONTRACT.allowedOrigins) &&
				h?.upstream === CONTRACT.upstream,
			`实测 prefix=${h?.prefix} ｜ allowedOrigins=${JSON.stringify(h?.allowedOrigins)} ｜ upstream=${h?.upstream}`,
		);
		record(
			"出厂口径 · 路由白名单",
			"health 自报的白名单 == §8.9 的 5 个端点 + /__gw/health（多一条少一条都要红）",
			JSON.stringify(h?.routes) ===
				JSON.stringify([
					"GET /ok",
					"POST /assistants/search",
					"POST /threads",
					"POST /threads/<id>/runs/stream",
					"GET /threads/<id>/state",
					"GET /__gw/health",
				]),
			`实测 ${JSON.stringify(h?.routes)}`,
		);
	}

	/* ── 八、失败模式（死上游 / 永不响应 / 写一半挂着）──────────────────────── */
	{
		const deadPort = await reserveClosedPort();
		const gw = await startGateway("dead", { PET_GATEWAY_UPSTREAM: `http://127.0.0.1:${deadPort}` });
		const r = await rawRequest(`${gw.base}/api/agent/ok`, { timeoutMs: 4000 });
		const body = jparse(r.text);
		const leaky = /ECONNREFUSED|Error:|at\s+\w+\s+\(|node:internal|stack/i.test(r.text);
		record(
			"失败模式 · 上游不可达",
			`死端口 ${deadPort} → 502 upstream_unreachable，且响应体里没有 ECONNREFUSED / 栈 / 内部路径`,
			r.status === 502 && body?.error === "upstream_unreachable" && !leaky,
			`网关 ${r.status} ${JSON.stringify(body)} ｜ 含技术细节=${leaky}`,
		);
		const h = await rawRequest(`${gw.base}/__gw/health`);
		record(
			"失败模式 · 上游不可达",
			"上游死了 health 仍然可用（health 不依赖上游）",
			h.status === 200 && jparse(h.text)?.ok === true,
			`health ${h.status}`,
		);
	}
	{
		const gw = await startGateway("timeout", { PET_GATEWAY_UPSTREAM: stubBase, PET_GATEWAY_ROUND_TIMEOUT_MS: "500" });
		const r = await rawRequest(`${gw.base}/api/agent/ok?hang=1`, { timeoutMs: 5000 });
		const body = jparse(r.text);
		record(
			"失败模式 · 单轮硬上限（流未开始）",
			"PET_GATEWAY_ROUND_TIMEOUT_MS=500 且上游一个字节都不回 → 504 upstream_timeout",
			r.status === 504 && body?.error === "upstream_timeout" && typeof r.totalMs === "number" && r.totalMs < 3000,
			`网关 ${r.status} ${JSON.stringify(body)} ｜ 耗时 ${r.totalMs}ms`,
		);
		const s = await rawRequest(`${gw.base}/api/agent/threads/ssehang/runs/stream`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ input: { messages: [{ role: "user", content: "hi" }] } }),
			timeoutMs: 5000,
		});
		const cleanEnd = !s.timedOut && s.error === null && s.totalMs !== null && s.totalMs < 3000;
		record(
			"失败模式 · 单轮硬上限（流已开始）",
			"上游写完一块就挂着：网关在 500ms 上限处**干净收尾**（收到那一块 + 响应正常 end，不是挂死也不是报错）",
			s.status === 200 && s.text.includes('data: {"a":1}') && cleanEnd,
			`网关 ${s.status} ｜ 收到 ${JSON.stringify(s.text.trim())} ｜ 耗时 ${s.totalMs}ms ｜ 客户端超时=${s.timedOut} ｜ error=${s.error?.message ?? "无"}`,
		);
	}

	/* ── 九、真后端：同一套调用序列透传之后契约仍然成立（连不上 → SKIP）────── */
	{
		const probe = await rawRequest(`${CONTRACT.upstream}/ok`, { timeoutMs: CONTRACT.deadUpstreamTimeoutMs });
		const alive = probe.status === 200 && jparse(probe.text)?.ok === true;
		if (!alive) {
			const reason = `真后端没在跑（GET ${CONTRACT.upstream}/ok → ${probe.status || "连接失败"}）→ 本段 4 项全部跳过，退出码不受影响。启动命令：${START_CMD}`;
			record("真后端 · 透传", "GET /ok 经网关 → 200 {ok:true}", false, reason, true);
			record("真后端 · 透传", "POST /assistants/search 经网关能列出配置的图", false, reason, true);
			record("真后端 · 透传", "POST /threads 经网关能建线程", false, reason, true);
			record("真后端 · 透传", "POST /threads/{id}/runs/stream 经网关拿到契约 SSE 信封", false, reason, true);
		} else {
			const gw = await startGateway("real", { PET_GATEWAY_UPSTREAM: CONTRACT.upstream });
			const j = { threadId: null, assistantId: null };
			{
				const r = await rawRequest(`${gw.base}/api/agent/ok`, { timeoutMs: 10000 });
				const body = jparse(r.text);
				record(
					"真后端 · 透传",
					"GET /ok 经网关 → 200 {ok:true}",
					r.status === 200 && body?.ok === true,
					`网关 ${r.status} ${r.text.trim()}`,
				);
			}
			{
				let ok = false;
				let detail = "";
				try {
					const r = await rawRequest(`${gw.base}/api/agent/assistants/search`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ limit: 50 }),
						timeoutMs: 15000,
					});
					const list = jparse(r.text);
					if (r.status !== 200) detail = `HTTP ${r.status} ｜ ${r.text.slice(0, 120)}`;
					else if (!Array.isArray(list)) detail = `返回不是数组：${r.text.slice(0, 120)}`;
					else {
						const hit = list.find((a) => a?.graph_id === CONTRACT.graphId);
						j.assistantId = hit?.assistant_id ?? null;
						ok = Boolean(j.assistantId);
						detail = `HTTP 200 ｜ ${list.length} 个 assistant ｜ ${CONTRACT.graphId} → ${j.assistantId ?? "没找到"}`;
					}
				} catch (err) {
					detail = `${err.name}: ${err.message}`;
				}
				record("真后端 · 透传", `POST /assistants/search 经网关能查到图 ${CONTRACT.graphId}`, ok, detail);
			}
			{
				let ok = false;
				let detail = "";
				try {
					const r = await rawRequest(`${gw.base}/api/agent/threads`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: "{}",
						timeoutMs: 15000,
					});
					const body = jparse(r.text);
					j.threadId = typeof body?.thread_id === "string" ? body.thread_id : null;
					ok = r.status === 200 && Boolean(j.threadId);
					detail = `HTTP ${r.status} ｜ thread_id=${j.threadId ?? "(没有)"}`;
				} catch (err) {
					detail = `${err.name}: ${err.message}`;
				}
				record("真后端 · 透传", "POST /threads 经网关能建线程", ok, detail);
			}
			{
				let ok = false;
				let detail = "";
				if (!j.threadId || !j.assistantId) {
					detail = "前置没拿到 thread_id / assistant_id → 这一项无法执行";
				} else {
					const r = await rawRequest(`${gw.base}/api/agent/threads/${j.threadId}/runs/stream`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							assistant_id: j.assistantId,
							input: { messages: [{ type: "human", content: CONTRACT.realProbeMessage }] },
							stream_mode: ["values"],
						}),
						timeoutMs: CONTRACT.realStreamTimeoutMs,
					});
					// 契约 §8.9.3 的 SSE 信封：至少一行 `data: <JSON>`
					const dataLines = r.text
						.split("\n")
						.map((l) => l.trim())
						.filter((l) => l.startsWith("data:"))
						.map((l) => l.slice(5).trim());
					const parsed = dataLines.filter((d) => jparse(d) !== null);
					ok = r.status === 200 && parsed.length >= 1;
					detail = `HTTP ${r.status} ｜ ${r.totalMs}ms ｜ ${r.chunks.length} 块 ｜ data 行 ${dataLines.length}（可解析 JSON ${parsed.length}）｜ 首行 ${JSON.stringify((dataLines[0] ?? "").slice(0, 70))}`;
				}
				record(
					"真后端 · 透传",
					`POST /threads/{id}/runs/stream 经网关拿到 200 + 至少一行契约 SSE 信封（问「${CONTRACT.realProbeMessage}」）`,
					ok,
					detail,
				);
			}
		}
	}

	await finish(startedAt);
}

/* ── 汇总与落盘 ───────────────────────────────────────────────────────────── */
async function finish(startedAt) {
	const passed = results.filter((r) => r.pass && !r.skipped).length;
	const skipped = results.filter((r) => r.skipped).length;
	const failed = results.filter((r) => !r.pass && !r.skipped).length;
	const total = results.length;

	say("");
	for (const r of results) {
		if (r.skipped) {
			say(`⏭️  [SKIP] [${r.area}] ${r.desc}`);
			say(`      ↳ 跳过原因：${r.detail}`);
		} else if (r.pass) {
			say(`✅ [${r.area}] ${r.desc}`);
			say(`      ${r.detail}`);
		} else {
			say(`❌ [${r.area}] ${r.desc}`);
			say(`      ${r.detail}`);
		}
	}

	say("");
	say(`网关检查 ${total} 项：通过 ${passed} / 失败 ${failed} / 跳过 ${skipped}`);
	if (skipped > 0) {
		say(`⚠️  本轮的 ${skipped} 项**没有执行**（不计入通过，也不影响退出码）：${[...new Set(results.filter((r) => r.skipped).map((r) => r.area))].join("、")}`);
	}
	if (failed > 0) {
		say("❌ 有断言失败 —— 网关这一层的保证不成立，**别把这一轮当成绿**。");
	}

	const exitCode = failed === 0 ? 0 : 1;
	const json = {
		generatedAt: new Date().toISOString(),
		startedAt: startedAt.toISOString(),
		total,
		passed,
		failed,
		skipped,
		skippedIds: results.filter((r) => r.skipped).map((r) => `${r.area}｜${r.desc}`),
		instances: spawned.map((s) => ({ name: s.name, port: s.port, pid: s.pid, log: path.relative(root, s.logFile) })),
		exitCode,
		results,
	};
	const text = `${lines.join("\n")}\n`;
	try {
		await fs.mkdir(REPORTS, { recursive: true });
		await fs.writeFile(path.join(REPORTS, "verify-gateway.log"), text, "utf8");
		await fs.writeFile(path.join(REPORTS, "verify-gateway.json"), `${JSON.stringify(json, null, 2)}\n`, "utf8");
	} catch (err) {
		console.error(`写入 reports/ 失败：${err.message}`);
	}
	console.log(`报告：reports/verify-gateway.log ｜ reports/verify-gateway.json（退出码 ${exitCode}）`);
	return exitCode;
}

/* ── 跑起来 + 兜底清理（**只杀自己 spawn 的 PID**，绝不碰别人的 node）──────── */
let stubRef = null;
let exiting = false;
async function cleanup() {
	if (exiting) return;
	exiting = true;
	await stopAll();
	if (stubRef) await stubRef.close();
}

main()
	.then(async () => {
		// main 内部已经打过汇总；这里只负责清理与退出码
		const failed = results.filter((r) => !r.pass && !r.skipped).length;
		await cleanup();
		process.exit(failed === 0 ? 0 : 1);
	})
	.catch(async (err) => {
		console.error(err);
		record("脚本自身", "verify-gateway.mjs 跑完没有抛异常", false, `${err?.name}: ${err?.message}`);
		const failed = results.filter((r) => !r.pass && !r.skipped).length;
		await finish(new Date());
		await cleanup();
		process.exit(failed === 0 ? 1 : 1);
	});
// 清理路径要拿到 stub 的引用（起在 main 里，收在进程退出/异常路径上）
