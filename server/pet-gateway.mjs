#!/usr/bin/env node
/**
 * 桌宠 Agent 网关（P5-5 · 需求 R-AGT-02 / R-AGT-05 / R-AGT-07）
 * ============================================================================
 * 是什么：一个**零依赖**（只用 Node 核心模块，不引任何第三方、不 shell out）的
 *   同源反代，站在 `langgraph dev`（默认 `http://127.0.0.1:2024`）前面。前端构建时给
 *   `PUBLIC_AGENT_BASE_URL=/api/agent`，浏览器打的是本站同源路径 `/api/agent/...`，
 *   Nginx（`deploy/nginx.conf` / `ARCH.md` §12.2）把它转到本进程。
 *
 * 为什么是"反代"而不是 R-AGT-02 最初设想的 `POST /api/pet/chat`：
 *   那份设计要一个**协议翻译层**（前端 `{message}` → LangGraph `input.messages`，
 *   再把上游 SSE 转成自己的 `token`/`state`/`meta` 事件），而它只能写在
 *   `agent_-for_-blog` 里 —— 与"⛔ 不改 agent 仓库"的硬约束直接冲突。P5-5 的结论：
 *   **网关只做安全与转发，不翻译协议**。§8.9 契约里那 5 个端点原样透出，
 *   前端只改 `baseUrl` 一个值。
 *
 * 它做什么（每一条都有 `pnpm verify:gateway` 的断言钉着）：
 *   ① **路由白名单**：只有 §8.9 的 5 个端点 + `/__gw/health` 能过，其余一律 404；
 *      路径在、方法不对 → 405。上游自带的 `/docs`、`/assistants/{id}` 等面**不可达**。
 *   ② **Origin / Referer 白名单**：不在名单里的来源 403，且**保证一个上游请求都不发**。
 *      预检 204 只回**具体来源**，永不回 `*`；客户端的 `Origin` **永不转发上游**。
 *   ③ **限流**：内存令牌桶，默认 20 次/分钟/IP，表有上限、按最久未用淘汰。
 *   ④ **体积闸门**：请求体默认 ≤ 8192 字节（超了 413），**边读边判、不先全量缓冲**；
 *      流式端点再按**码点**数用户消息（默认 ≤ 1000），超了 400、**不静默截断**。
 *   ⑤ **SSE 直通**：`text/event-stream` + `no-transform` + `x-accel-buffering: no` +
 *      `flushHeaders()` + 逐 chunk 写，**绝不缓冲整段**；上游状态码原样透传。
 *   ⑥ **单轮硬上限**：默认 300 秒（与前端硬上限、§12.2 的 `proxy_read_timeout` 对齐）；
 *      流已开始 → 干净收尾；还没开始 → 504。
 *   ⑦ **上游不可达** → 502，**不回显上游的错误文本与栈**（只回一个固定 code）。
 *   ⑧ **日志一行一请求**，不含正文 / 消息 / 答复 / 密钥；流式那行带 thread id。
 *
 * ⛔ 日志纪律（改这个文件时照抄本节，别加"顺手打一下 body 好排障"）：
 *   允许打的只有 时间戳 / 方法 / 路径 / 状态码 / 耗时 / 客户端 IP / thread id /
 *   我们自己的 note 码（`origin_not_allowed` 这类**本地常量**）。**不许**打请求体、
 *   用户消息、上游响应体、任何 header 的值（Origin 的**来源**除外）、`PET_*`
 *   环境变量的原文。`verify:gateway` 的「日志不泄漏」那一项是**双向**的：
 *   既断言金丝雀与假密钥**不在**日志里，也断言 thread id **在**日志里
 *   —— 防的是"什么都没读到"被当成"没泄漏"（本项目真的踩过这种假绿）。
 *
 * 环境变量（全部可选；默认值就是生产口径，`GET /__gw/health` 回显生效值）：
 *   PET_GATEWAY_HOST=127.0.0.1            监听地址（**别改 0.0.0.0**：公网入口是 Nginx）
 *   PET_GATEWAY_PORT=8787                 监听端口
 *   PET_GATEWAY_UPSTREAM=http://127.0.0.1:2024  上游（http/https 都认，可带路径前缀）
 *   PET_GATEWAY_PREFIX=/api/agent         要剥掉的本站前缀（剥完再按白名单匹配）
 *   PET_ALLOWED_ORIGINS=http://localhost:4321,http://localhost:4323
 *   PET_GATEWAY_RATE_LIMIT=20             次 / 窗口 / IP
 *   PET_GATEWAY_RATE_WINDOW_MS=60000      窗口长度
 *   PET_GATEWAY_MAX_BODY=8192             请求体上限（字节）
 *   PET_GATEWAY_MAX_CHARS=1000            流式端点用户消息上限（**码点**，不是字节/UTF-16）
 *   PET_GATEWAY_ROUND_TIMEOUT_MS=300000   单轮硬上限
 *   PET_GATEWAY_TRUST_PROXY=0             置 1 才认 `X-Forwarded-For` 最左项
 *                                         ⚠️ **只在真的有反代时开**：没有反代而开它，
 *                                         访客可以伪造 XFF 绕开限流（= 限流形同虚设）
 *   PET_GATEWAY_MAX_BUCKETS=4096          限流表上限（超了淘汰最久未用的那个 IP）
 *
 * 用法：
 *   node server/pet-gateway.mjs            # 起网关（Ctrl+C 停）
 *   node server/pet-gateway.mjs --help     # 看这页
 *
 * 自检：`pnpm verify:gateway` —— 自带 stub 上游（测缓冲 / 超时 / 失败模式）+
 *   真后端一段（真跑 `/ok` → `assistants/search` → `/threads` → `runs/stream`）。
 * 契约：`ARCH.md` §8.4（端点与白名单）、§8.5（安全与限额）、§8.9（接口契约）。
 * ============================================================================
 */
import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";

/* ── 默认值（唯一真相源：文档、verify:gateway 与这里引同一组数）───────────────
   ⚠️ 改这里的数 = 改生产口径：`verify:gateway` 会用**纯默认配置**起一个实例、
   从 `GET /__gw/health` 把下面这组数逐个读回来比对，对不上就判红。 */
export const DEFAULTS = Object.freeze({
	host: "127.0.0.1",
	port: 8787,
	upstream: "http://127.0.0.1:2024",
	prefix: "/api/agent",
	allowedOrigins: Object.freeze(["http://localhost:4321", "http://localhost:4323"]),
	rateLimit: 20,
	rateWindowMs: 60000,
	maxBodyBytes: 8192,
	maxChars: 1000,
	roundTimeoutMs: 300000,
	trustProxy: false,
	maxBuckets: 4096,
});

/** 健康检查路径（**不是**上游的路由，本进程自己答；它存在是为了让验收脚本能钉住生效配置） */
export const HEALTH_PATH = "/__gw/health";

/**
 * 路由白名单（**唯一真相源**）。
 * `pattern` 匹配的是**剥掉前缀之后**的路径（bare `/ok` 与 `/api/agent/ok` 都归到 `/ok`）。
 * `threadGroup` 指向捕获组里那个 `<id>`，用于日志与"哪些路由是流"。
 * ⚠️ `<id>` 的字符集是**收紧**的（`[A-Za-z0-9_-]{1,128}`）：LangGraph 的 thread_id 是
 * UUID（连字符 + 十六进制），收紧之后 `/threads/..%2f..%2fok/state` 这类根本进不来。
 */
export const ROUTES = Object.freeze([
	Object.freeze({ name: "ok", method: "GET", pattern: /^\/ok$/, template: "GET /ok", stream: false }),
	Object.freeze({
		name: "assistants.search",
		method: "POST",
		pattern: /^\/assistants\/search$/,
		template: "POST /assistants/search",
		stream: false,
	}),
	Object.freeze({ name: "threads.create", method: "POST", pattern: /^\/threads$/, template: "POST /threads", stream: false }),
	Object.freeze({
		name: "threads.runs.stream",
		method: "POST",
		pattern: /^\/threads\/([A-Za-z0-9_-]{1,128})\/runs\/stream$/,
		template: "POST /threads/<id>/runs/stream",
		stream: true,
		threadGroup: 1,
	}),
	Object.freeze({
		name: "threads.state",
		method: "GET",
		pattern: /^\/threads\/([A-Za-z0-9_-]{1,128})\/state$/,
		template: "GET /threads/<id>/state",
		stream: false,
		threadGroup: 1,
	}),
]);

/**
 * 转发上游的请求头白名单（**只这两条**）。
 * 为什么不做"原样透传"：
 *   · `origin` / `referer` / `cookie` / `authorization` —— 访客的东西一律不许进后端；
 *   · `accept-encoding` —— 不转发 → 上游回 identity，SSE 不会被压缩层攒成一大块；
 *   · `content-length` —— 我们按自己读到的字节数重写，避免"声明与实体不一致"。
 */
export const FORWARD_HEADERS = Object.freeze(["content-type", "accept"]);

const MAX_PREFIX_DEPTH = 64; // 解码后最多允许 64 段，纯粹防病态输入

/* ── 配置 ─────────────────────────────────────────────────────────────────── */

const asString = (raw, fallback) => {
	if (typeof raw !== "string") return fallback;
	const t = raw.trim();
	return t.length ? t : fallback;
};

const asInt = (raw, fallback) => {
	const n = Number(asString(raw, ""));
	return Number.isFinite(n) && n > 0 && Number.isInteger(n) ? n : fallback;
};

const asBool = (raw, fallback) => {
	const t = asString(raw, "").toLowerCase();
	if (["1", "true", "yes", "on"].includes(t)) return true;
	if (["0", "false", "no", "off"].includes(t)) return false;
	return fallback;
};

/** 前缀归一：前有 `/`、后无 `/`（`api/agent/` → `/api/agent`）；`/` 视为"不剥前缀" */
export function normalizePrefix(raw) {
	const t = asString(raw, DEFAULTS.prefix).replace(/\/+$/, "");
	if (!t || t === "/") return "";
	return t.startsWith("/") ? t : `/${t}`;
}

/** 来源归一：小写、去尾斜杠（`Origin` 的 scheme/host 大小写不敏感，比较前统一） */
export function normalizeOrigin(raw) {
	const t = String(raw ?? "").trim().replace(/\/+$/, "");
	return t.toLowerCase();
}

/**
 * 读一份生效配置。**启动时读一次**，运行期不变（fail fast：配置坏了就别起）。
 * 导出是为了让验收脚本能对着默认值断言，而不是自己抄一份数字。
 */
export function readConfig(env = process.env) {
	const upstreamRaw = asString(env.PET_GATEWAY_UPSTREAM, DEFAULTS.upstream);
	let upstreamUrl;
	try {
		upstreamUrl = new URL(upstreamRaw);
	} catch {
		throw new Error("PET_GATEWAY_UPSTREAM 不是合法 URL");
	}
	if (upstreamUrl.protocol !== "http:" && upstreamUrl.protocol !== "https:") {
		throw new Error("PET_GATEWAY_UPSTREAM 只支持 http / https");
	}
	const allowedOrigins = asString(env.PET_ALLOWED_ORIGINS, DEFAULTS.allowedOrigins.join(","))
		.split(",")
		.map(normalizeOrigin)
		.filter(Boolean);
	const cfg = {
		host: asString(env.PET_GATEWAY_HOST, DEFAULTS.host),
		port: asInt(env.PET_GATEWAY_PORT, DEFAULTS.port),
		upstream: upstreamRaw,
		upstreamUrl,
		prefix: normalizePrefix(env.PET_GATEWAY_PREFIX),
		allowedOrigins: Object.freeze([...new Set(allowedOrigins)]),
		rateLimitPerMin: asInt(env.PET_GATEWAY_RATE_LIMIT, DEFAULTS.rateLimit),
		rateWindowMs: asInt(env.PET_GATEWAY_RATE_WINDOW_MS, DEFAULTS.rateWindowMs),
		maxBodyBytes: asInt(env.PET_GATEWAY_MAX_BODY, DEFAULTS.maxBodyBytes),
		maxChars: asInt(env.PET_GATEWAY_MAX_CHARS, DEFAULTS.maxChars),
		roundTimeoutMs: asInt(env.PET_GATEWAY_ROUND_TIMEOUT_MS, DEFAULTS.roundTimeoutMs),
		trustProxy: asBool(env.PET_GATEWAY_TRUST_PROXY, DEFAULTS.trustProxy),
		maxBuckets: asInt(env.PET_GATEWAY_MAX_BUCKETS, DEFAULTS.maxBuckets),
	};
	cfg.allowedOriginSet = new Set(cfg.allowedOrigins);
	return cfg;
}

/* ── 路径体检 + 前缀剥离 + 白名单 ─────────────────────────────────────────── */

/**
 * 路径体检：解码前先掐掉编码过的分隔符与空字节，解码后再掐 `..` / `\` / NUL。
 * 为什么"解码前"这一步必需：`%2f` 解码后就是 `/`，只在解码后判会先被前缀剥离与
 * 路由正则看到两种不同的路径形态（这就是经典的"解码一次 vs 解码两次"绕过）。
 */
export function inspectPath(rawPath) {
	const raw = String(rawPath ?? "");
	if (/%2f|%5c|%00/i.test(raw)) return { ok: false, reason: "encoded_separator" };
	let decoded;
	try {
		decoded = decodeURIComponent(raw);
	} catch {
		return { ok: false, reason: "bad_encoding" };
	}
	if (decoded.includes("\0")) return { ok: false, reason: "null_byte" };
	if (decoded.includes("\\")) return { ok: false, reason: "backslash" };
	const segs = decoded.split("/");
	if (segs.includes("..")) return { ok: false, reason: "dotdot" };
	if (segs.length > MAX_PREFIX_DEPTH) return { ok: false, reason: "too_deep" };
	return { ok: true, path: decoded };
}

/** 剥掉本站前缀：`/api/agent/ok` → `/ok`；`/ok` 原样返回（本地开发便利） */
export function stripPrefix(pathname, prefix) {
	const p = String(pathname ?? "");
	if (!prefix) return p;
	if (p === prefix) return "/";
	if (p.startsWith(`${prefix}/`)) return p.slice(prefix.length);
	return p;
}

/** 找路由：`state` 三态（ok / method_not_allowed / not_found）——405 与 404 必须分得开 */
export function matchRoute(pathname, method) {
	let pathHit = null;
	for (const route of ROUTES) {
		if (route.pattern.test(pathname)) {
			pathHit = route;
			break;
		}
	}
	if (!pathHit) return { state: "not_found", route: null, allowed: [] };
	if (pathHit.method === method) return { state: "ok", route: pathHit, allowed: [pathHit.method] };
	const allowed = ROUTES.filter((r) => r.pattern.test(pathname)).map((r) => r.method);
	return { state: "method_not_allowed", route: pathHit, allowed };
}

/* ── 客户端 IP ────────────────────────────────────────────────────────────── */

/** `::ffff:127.0.0.1` → `127.0.0.1`（同一台机器不该因为两种写法被记成两个桶） */
export function normalizeIp(raw) {
	const t = String(raw ?? "").trim();
	const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(t);
	return m ? m[1] : t || "unknown";
}

/**
 * 客户端 IP：**默认只用 socket 的对端地址**。
 * `X-Forwarded-For` 只有 `PET_GATEWAY_TRUST_PROXY=1` 时才认最左项 —— 因为 XFF 是
 * **客户端可自带**的头：没有反代在前面而认它，等于把"按 IP 限流"变成"按访客自报的
 * 字符串限流"，伪造一个新值就换一个新桶（限流形同虚设）。
 */
export function clientIp(req, cfg) {
	const sock = normalizeIp(req.socket?.remoteAddress ?? "");
	if (!cfg.trustProxy) return sock;
	const xff = req.headers["x-forwarded-for"];
	if (typeof xff !== "string" || !xff.trim()) return sock;
	const left = normalizeIp(xff.split(",")[0]);
	return left || sock;
}

/* ── 令牌桶限流（单进程内存，键 = IP） ────────────────────────────────────── */

export class RateLimiter {
	constructor(cfg) {
		this.capacity = cfg.rateLimitPerMin;
		this.windowMs = cfg.rateWindowMs;
		this.maxBuckets = cfg.maxBuckets;
		this.buckets = new Map();
	}

	/** 取一个令牌；不够就回 `{ok:false, retryAfterSeconds}`（**不**扣令牌，下同） */
	take(key, now = Date.now()) {
		let b = this.buckets.get(key);
		if (!b) {
			b = { tokens: this.capacity, at: now };
		} else {
			const refill = ((now - b.at) * this.capacity) / this.windowMs;
			b.tokens = Math.min(this.capacity, b.tokens + Math.max(0, refill));
			b.at = now;
			// 重新插入 = 把它挪到 Map 末尾（Map 保持插入序 → 迭代头部就是最久未用的）
			this.buckets.delete(key);
		}
		this.buckets.set(key, b);
		if (this.buckets.size > this.maxBuckets) {
			// 有界：超上限就淘汰最久未用的那个桶（否则 IP 无限多的扫描可以把内存吃干）
			const oldest = this.buckets.keys().next().value;
			if (oldest !== undefined && oldest !== key) this.buckets.delete(oldest);
		}
		if (b.tokens < 1) {
			const need = (1 - b.tokens) * (this.windowMs / this.capacity);
			return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(need / 1000)) };
		}
		b.tokens -= 1;
		return { ok: true, retryAfterSeconds: 0 };
	}

	/** 周期清理：闲置超过一个窗口且令牌已回满的桶直接删（`unref` 掉，别拦住进程退出） */
	startSweeper() {
		const every = Math.max(1000, Math.min(this.windowMs, 60000));
		this.timer = setInterval(() => {
			const now = Date.now();
			for (const [key, b] of this.buckets) {
				if (now - b.at > this.windowMs * 2) this.buckets.delete(key);
			}
		}, every);
		this.timer.unref?.();
		return this;
	}

	stopSweeper() {
		if (this.timer) clearInterval(this.timer);
	}
}

/* ── 消息长度（码点） ─────────────────────────────────────────────────────── */

/** 按**码点**数：`"🙂".length === 2` 但 `[...("🙂")].length === 1`，表情/CJK 都要算一个 */
export function countCodePoints(text) {
	return [...String(text ?? "")].length;
}

/** `content` 可能是字符串，也可能是 `[{type:"text",text}]` 这种分片数组 —— 两种都认 */
function contentText(content) {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		let out = "";
		for (const part of content) {
			if (part && typeof part === "object" && typeof part.text === "string") out += part.text;
		}
		return out;
	}
	return "";
}

/**
 * 取「最后一条用户消息」的文本（没有就回 `""`）。
 * ⚠️ **同时认 `role:"user"` 与 `type:"human"`** —— 这不是随手放宽，是必须的：
 *   LangGraph 的两种写法都收，而前端适配层（`src/utils/agent-client.ts`）发的是
 *   `{type:"human", content}`。只认 `role:"user"` 的话，**真正的客户端请求根本不会
 *   被这条闸门看到** —— 安全边界变成只在测试里生效（§14.3 T80）。
 */
export function lastUserMessageText(body) {
	const messages = body?.input?.messages;
	if (!Array.isArray(messages)) return "";
	let found = "";
	for (const m of messages) {
		if (!m || typeof m !== "object") continue;
		const isUser = m.role === "user" || m.type === "human";
		if (!isUser) continue;
		const text = contentText(m.content);
		if (text) found = text;
	}
	return found;
}

/* ── 日志 ─────────────────────────────────────────────────────────────────── */

const startMs = Date.now();
const uptime = () => Date.now() - startMs;

/** 一行一请求。⚠️ 只许出现下面这些字段（见文件头的日志纪律），加字段前先想清楚 */
function logRequest(fields) {
	const parts = [
		"[gw]",
		new Date().toISOString(),
		fields.method,
		fields.path,
		String(fields.status),
		`${fields.ms}ms`,
		`ip=${fields.ip}`,
	];
	if (fields.thread) parts.push(`thread=${fields.thread}`);
	if (fields.note) parts.push(`note=${fields.note}`);
	process.stdout.write(`${parts.join(" ")}\n`);
}

/** 启动/运维日志（同样不含 PET_* 的原文，只打派生出来的 host:port 与数字） */
function logStartup(cfg, addr) {
	const hostPort = `${addr.address ?? cfg.host}:${addr.port}`;
	const up = cfg.upstreamUrl;
	const rt = up.protocol === "https:" ? 443 : 80;
	process.stdout.write(
		`[gw] ${new Date().toISOString()} listening on http://${hostPort} prefix=${cfg.prefix || "(none)"} ` +
			`upstream=${up.hostname}:${up.port || rt} limits=rateLimitPerMin:${cfg.rateLimitPerMin},` +
			`windowMs:${cfg.rateWindowMs},maxBodyBytes:${cfg.maxBodyBytes},maxChars:${cfg.maxChars},` +
			`roundTimeoutMs:${cfg.roundTimeoutMs},trustProxy:${cfg.trustProxy} pid=${process.pid}\n`,
	);
	const localOnly = cfg.allowedOrigins.every((o) => /localhost|127\.0\.0\.1|\[::1\]/.test(o));
	if (localOnly) {
		process.stdout.write(
			"[gw] warn 允许来源目前只有本机（见 /__gw/health 的 allowedOrigins）→ " +
				"上线时**必须**把站点域名加进 PET_ALLOWED_ORIGINS，否则生产环境带 Origin 的请求会被 403\n",
		);
	}
}

/* ── HTTP 小工具 ──────────────────────────────────────────────────────────── */

const JSON_TYPE = "application/json; charset=utf-8";

function corsHeaders(origin) {
	const out = { vary: "origin" };
	if (!origin) return out;
	out["access-control-allow-origin"] = origin;
	out["access-control-allow-methods"] = "GET,POST,OPTIONS";
	out["access-control-allow-headers"] = "content-type";
	return out;
}

function sendJson(res, status, payload, extraHeaders = {}) {
	if (res.headersSent) {
		res.end();
		return;
	}
	const body = Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
	res.writeHead(status, {
		"content-type": JSON_TYPE,
		"content-length": String(body.length),
		"cache-control": "no-store",
		...extraHeaders,
	});
	res.end(body);
}

/** 从 `Origin`（缺则 `Referer`）判来源；两边都没有 = curl / 同源非 CORS / 服务间调用 → 放行 */
export function resolveOrigin(req, cfg) {
	const rawOrigin = req.headers.origin;
	if (typeof rawOrigin === "string" && rawOrigin.trim()) {
		// 归一之后不一定能当 header 值回写（原样回写以保持大小写/端口一致）
		const normalized = normalizeOrigin(rawOrigin);
		return { present: true, origin: normalized, via: "origin", ok: cfg.allowedOriginSet.has(normalized) };
	}
	const rawRef = req.headers.referer;
	if (typeof rawRef === "string" && rawRef.trim()) {
		let origin = "";
		try {
			origin = normalizeOrigin(new URL(rawRef).origin);
		} catch {
			origin = "";
		}
		// Referer 存在但解析不出 origin（畸形）→ 当作"有来源但不可信"，同样 403
		return { present: true, origin, via: "referer", ok: Boolean(origin) && cfg.allowedOriginSet.has(origin) };
	}
	return { present: false, origin: "", via: "none", ok: true };
}

/**
 * 读请求体，**边读边判**：一旦超过 `cap` 就 **pause()** 并立刻结束这次读取。
 * ⚠️ 为什么不是 `for await (...) { break }`：Node 的 `Readable` 异步迭代器在 `break`
 *   时会把流 **destroy()** 掉 —— 那连同一条 socket，客户端拿到的是 ECONNRESET /
 *   socket hang up，**根本读不到我们要回的 413**（§14.3 T81）。
 *   `pause()` 只停读取、不动 socket，剩下的字节留在内核缓冲里，413 照样发得出去。
 */
export function readBody(req, cap) {
	return new Promise((resolve) => {
		let total = 0;
		const chunks = [];
		let done = false;
		const finish = (r) => {
			if (done) return;
			done = true;
			resolve(r);
		};
		req.on("data", (chunk) => {
			if (done) return;
			total += chunk.length;
			if (total > cap) {
				req.pause();
				finish({ ok: false, reason: "too_large", bytes: total });
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => finish({ ok: true, buf: Buffer.concat(chunks), bytes: total }));
		req.on("error", () => finish({ ok: false, reason: "read_error", bytes: total }));
		req.on("aborted", () => finish({ ok: false, reason: "aborted", bytes: total }));
	});
}

/* ── 上游请求 ─────────────────────────────────────────────────────────────── */

/** 拼上游路径：上游 URL 自带路径前缀时接在它后面（`http://h/base` + `/ok` → `/base/ok`） */
export function upstreamPath(cfg, effPath, search = "") {
	const base = cfg.upstreamUrl.pathname.replace(/\/+$/, "");
	return `${base}${effPath}${search}`;
}

/** 只把白名单里的头转发上游；`content-length` 由我们自己按实际字节数写 */
export function buildUpstreamHeaders(req, bodyBytes) {
	const out = {};
	for (const name of FORWARD_HEADERS) {
		const v = req.headers[name];
		if (typeof v === "string" && v) out[name] = v;
	}
	if (!out["content-type"]) out["content-type"] = "application/json";
	if (bodyBytes !== null) out["content-length"] = String(bodyBytes);
	return out;
}

/** 上游错误只暴露"一个固定 code"，**绝不**把 err.message / 栈带给客户端 */
function safeErrorCode(err) {
	const code = typeof err?.code === "string" ? err.code : "";
	return /^[A-Z0-9_]{2,32}$/.test(code) ? code : "UPSTREAM_ERROR";
}

/* ── 主处理流程 ───────────────────────────────────────────────────────────── */

/**
 * 建网关（导出是为了让验收脚本能 import 起一个实例；命令行直接跑时见文件末尾）。
 */
export function createGateway(cfg) {
	const limiter = new RateLimiter(cfg).startSweeper();
	const stats = { started: Date.now(), requests: 0, rejected: 0, upstreamErrors: 0 };

	/** 等 `drain` 或对端 `close`（谁先到算谁）——不这么写，客户端提前断开会把这里挂死 */
	const waitDrainOrClose = (res) =>
		new Promise((resolve) => {
			let settled = false;
			const fin = () => {
				if (settled) return;
				settled = true;
				res.removeListener("drain", fin);
				res.removeListener("close", fin);
				resolve();
			};
			res.once("drain", fin);
			res.once("close", fin);
		});

	/** 逐 chunk 转发（**不缓冲整段**）：写不动就等 drain，等不到就说明对端走了 */
	async function pipeChunked(src, res) {
		for await (const chunk of src) {
			if (res.writableEnded || res.destroyed) return false;
			if (!res.write(chunk)) {
				await waitDrainOrClose(res);
				if (res.writableEnded || res.destroyed) return false;
			}
		}
		return true;
	}

	function healthPayload() {
		const up = cfg.upstreamUrl;
		// 只回 scheme://host:port（上游 URL 万一带了 user:pass，**不进任何输出面**）
		const rt = up.protocol === "https:" ? "443" : "80";
		const upstream = `${up.protocol}//${up.hostname}:${up.port || rt}${up.pathname.replace(/\/+$/, "")}`;
		return {
			ok: true,
			upstream,
			limits: {
				rateLimitPerMin: cfg.rateLimitPerMin,
				rateWindowMs: cfg.rateWindowMs,
				maxBodyBytes: cfg.maxBodyBytes,
				maxChars: cfg.maxChars,
				roundTimeoutMs: cfg.roundTimeoutMs,
				trustProxy: cfg.trustProxy,
				maxBuckets: cfg.maxBuckets,
			},
			allowedOrigins: [...cfg.allowedOrigins],
			prefix: cfg.prefix,
			routes: [...ROUTES.map((r) => r.template), `GET ${HEALTH_PATH}`],
			uptimeMs: uptime(),
			requests: stats.requests,
			rejected: stats.rejected,
			upstreamErrors: stats.upstreamErrors,
		};
	}

	async function handle(req, res) {
		const startedAt = Date.now();
		req.socket.setNoDelay(true); // SSE 的小包不许被 Nagle 攒着
		const rawUrl = req.url ?? "/";
		const qi = rawUrl.indexOf("?");
		const rawPath = qi === -1 ? rawUrl : rawUrl.slice(0, qi);
		const search = qi === -1 ? "" : rawUrl.slice(qi);
		const method = req.method ?? "GET";
		const ip = clientIp(req, cfg);
		// 日志记**剥掉前缀之后**的路径：prod（`/api/agent/...`）与本地（`/...`）两种形态，
		// 日志长得一模一样，grep 与"thread id 在哪一行"都不会因为部署形态而变。
		const info = { method, path: rawPath, status: 0, ms: 0, ip, thread: null, note: null, logged: false };

		const done = (status, note = null) => {
			info.status = status;
			if (note) info.note = note;
		};
		res.on("finish", () => {
			if (info.logged) return;
			info.logged = true;
			info.ms = Date.now() - startedAt;
			logRequest(info);
		});

		stats.requests += 1;

		// ① 路径体检 → 前缀剥离 → 白名单（都不碰上游）
		const inspected = inspectPath(rawPath);
		const effPath = inspected.ok ? stripPrefix(inspected.path, cfg.prefix) : "";
		if (inspected.ok && effPath) info.path = effPath;
		const isHealthPath = inspected.ok && effPath === HEALTH_PATH;
		const match = inspected.ok ? matchRoute(effPath, method) : { state: "not_found", route: null, allowed: [] };
		// "这个路径在白名单里吗"（**不管方法**）：OPTIONS 预检与 405 都要用它
		const pathAllowed = isHealthPath || ROUTES.some((r) => r.pattern.test(effPath));
		const cors = {};

		// ② 不在白名单 → 404（**这一条就是"访客不能拿它当跳板"的落点**）
		if (!inspected.ok || !pathAllowed) {
			stats.rejected += 1;
			sendJson(res, 404, { error: "not_found" }, corsHeaders(null));
			done(404, inspected.ok ? "route_not_allowed" : `bad_path:${inspected.reason}`);
			return;
		}

		// ③ 来源白名单（路径存在之后才判来源：先回答"这个端点有没有"，再回答"你能不能打"）
		const origin = resolveOrigin(req, cfg);
		if (!origin.ok) {
			stats.rejected += 1;
			// ⚠️ 这里**只**回 error code：不回显收到的来源（它可能是攻击者塞的任意串）
			sendJson(res, 403, { error: "origin_not_allowed" }, corsHeaders(null));
			done(403, "origin_not_allowed");
			return;
		}
		if (origin.present) Object.assign(cors, corsHeaders(origin.origin));

		// ④ 预检：204 + **具体来源**（永不 `*`）。本机应答、不计桶、不碰上游。
		//    必须排在 405 之前：OPTIONS 不在 ROUTES 的方法里，先判 405 会把预检打成 405。
		if (method === "OPTIONS") {
			res.writeHead(204, cors);
			res.end();
			done(204, "preflight");
			return;
		}

		// ⑤ 健康检查：本地 JSON，**不计桶**（运维探针不该吃访客配额），也不碰上游
		if (isHealthPath) {
			if (method !== "GET") {
				stats.rejected += 1;
				sendJson(res, 405, { error: "method_not_allowed" }, { ...cors, allow: "GET, OPTIONS" });
				done(405, "method_not_allowed");
				return;
			}
			sendJson(res, 200, healthPayload(), cors);
			done(200);
			return;
		}
		if (match.state === "method_not_allowed") {
			stats.rejected += 1;
			sendJson(res, 405, { error: "method_not_allowed" }, { ...cors, allow: `${match.allowed.join(", ")}, OPTIONS` });
			done(405, "method_not_allowed");
			return;
		}
		const route = match.route;

		// ⑥ 限流：**所有会被转发的请求**都扣令牌（含本地 4xx/5xx 的那些）
		const verdict = limiter.take(ip);
		if (!verdict.ok) {
			stats.rejected += 1;
			sendJson(
				res,
				429,
				{ error: "rate_limited", retryAfterSeconds: verdict.retryAfterSeconds },
				{ ...cors, "retry-after": String(verdict.retryAfterSeconds) },
			);
			done(429, "rate_limited");
			return;
		}

		// ⑦ 读体（边读边判上限）
		let bodyBuf = Buffer.alloc(0);
		if (method === "POST" || method === "PUT" || method === "PATCH") {
			const read = await readBody(req, cfg.maxBodyBytes);
			if (!read.ok) {
				if (read.reason === "too_large") {
					sendJson(res, 413, { error: "body_too_large", maxBytes: cfg.maxBodyBytes }, { ...cors, connection: "close" });
					done(413, "body_too_large");
				} else {
					// 客户端中途跑了：没有对象可回，也不该记成服务端错误
					done(499, read.reason);
				}
				return;
			}
			bodyBuf = read.buf;
		}

		// ⑥ 流式端点：占位符级别的正文校验（**只在这一条路由上**：其它路由不收用户文本）
		if (route.stream && bodyBuf.length) {
			let parsed = null;
			let badJson = false;
			try {
				parsed = JSON.parse(bodyBuf.toString("utf8"));
			} catch {
				badJson = true;
			}
			if (badJson) {
				sendJson(res, 400, { error: "invalid_json" }, cors);
				done(400, "invalid_json");
				return;
			}
			const text = lastUserMessageText(parsed);
			const chars = countCodePoints(text);
			if (chars > cfg.maxChars) {
				// **不截断**：截断会让"用户看到自己被改了话"变成静默行为，这里是明确拒绝
				sendJson(res, 400, { error: "message_too_long", maxChars: cfg.maxChars, actual: chars }, cors);
				done(400, "message_too_long");
				return;
			}
		}

		if (route.threadGroup) {
			const m = route.pattern.exec(effPath);
			info.thread = m?.[route.threadGroup] ?? null;
		}

		// ⑦ 转发上游（唯一会碰上游的一条路径）
		await proxy(req, res, route, effPath, search, bodyBuf, cors, info, done);
	}

	function proxy(req, res, route, effPath, search, bodyBuf, cors, info, done) {
		return new Promise((resolve) => {
			const lib = cfg.upstreamUrl.protocol === "https:" ? https : http;
			const headers = buildUpstreamHeaders(req, route.stream || bodyBuf.length ? bodyBuf.length : null);
			let settled = false;
			let timedOut = false;
			let timer = null;

			const upstreamReq = lib.request(
				{
					protocol: cfg.upstreamUrl.protocol,
					hostname: cfg.upstreamUrl.hostname,
					port: cfg.upstreamUrl.port || (cfg.upstreamUrl.protocol === "https:" ? 443 : 80),
					method: req.method,
					path: upstreamPath(cfg, effPath, search),
					headers,
				},
				(upstreamRes) => {
					if (timedOut) {
						upstreamRes.destroy();
						return;
					}
					if (route.stream) {
						// SSE：头先落地 + 不缓冲 + 明确告诉中间层别攒（Nginx 认 x-accel-buffering）
						if (!res.headersSent) {
							res.writeHead(upstreamRes.statusCode ?? 502, {
								...cors,
								"content-type": "text/event-stream; charset=utf-8",
								"cache-control": "no-cache, no-transform",
								connection: "keep-alive",
								"x-accel-buffering": "no",
							});
							res.flushHeaders();
						}
					} else if (!res.headersSent) {
						const passthrough = { ...cors };
						const ct = upstreamRes.headers["content-type"];
						if (typeof ct === "string") passthrough["content-type"] = ct;
						const cl = upstreamRes.headers["content-length"];
						if (typeof cl === "string") passthrough["content-length"] = cl;
						else passthrough["transfer-encoding"] = "chunked";
						res.writeHead(upstreamRes.statusCode ?? 502, passthrough);
					}
					done(upstreamRes.statusCode ?? 502);

					const finishUp = () => {
						if (settled) return;
						settled = true;
						clearTimeout(timer);
						// 上游结束后**一定要收口**：SSE 那边 `res.end()` 才是"流结束"的信号，
						// 少了它前端会一直等到 60 秒看门狗（§8.10 的第二档闸门）。
						if (!res.writableEnded) res.end();
						resolve();
					};

					upstreamRes.on("error", (err) => {
						stats.upstreamErrors += 1;
						info.note = info.note ?? `upstream_stream_${safeErrorCode(err)}`;
						finishUp();
					});
					upstreamRes.on("end", finishUp);
					res.on("close", () => {
						if (!res.writableFinished) upstreamRes.destroy();
					});

					pipeChunked(upstreamRes, res)
						.then(finishUp)
						.catch(() => finishUp());
				},
			);

			upstreamReq.on("socket", (s) => s.setNoDelay?.(true));
			timer = setTimeout(() => {
				// 单轮硬上限：**先收口再掐上游**（顺序反了的话 res 收不到 end）
				timedOut = true;
				stats.upstreamErrors += 1;
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					const streamStarted = res.headersSent;
					upstreamReq.destroy();
					if (streamStarted) {
						// 流已经开了：干净收尾（SSE 的"说完了"）——**不许**抛一个半截 JSON 进去
						if (!res.writableEnded) res.end();
						info.note = "upstream_timeout_midstream";
						done(res.statusCode || 200, "upstream_timeout_midstream");
					} else {
						sendJson(res, 504, { error: "upstream_timeout" }, cors);
						done(504, "upstream_timeout");
					}
					resolve();
				}
			}, cfg.roundTimeoutMs);

			upstreamReq.on("error", (err) => {
				if (timedOut || settled) return; // 超时那条路已经收过口了，别用 502 盖掉 504
				settled = true;
				clearTimeout(timer);
				stats.upstreamErrors += 1;
				if (res.headersSent) {
					if (!res.writableEnded) res.end();
					info.note = `upstream_error_${safeErrorCode(err)}`;
					done(res.statusCode || 502, `upstream_error_${safeErrorCode(err)}`);
				} else {
					// ⚠️ **不回显上游的错误文本 / 栈 / code 给客户端**（只在服务端日志里留 code）
					sendJson(res, 502, { error: "upstream_unreachable" }, cors);
					done(502, `upstream_unreachable:${safeErrorCode(err)}`);
				}
				resolve();
			});

			res.on("close", () => {
				if (!res.writableFinished && !settled) {
					settled = true;
					clearTimeout(timer);
					upstreamReq.destroy();
					done(res.statusCode || 499, "client_gone");
					resolve();
				}
			});

			if (bodyBuf.length) upstreamReq.write(bodyBuf);
			upstreamReq.end();
		});
	}

	const server = http.createServer((req, res) => {
		handle(req, res).catch(() => {
			// 兜底：处理链自己炸了也不许把栈吐给客户端
			if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
			else if (!res.writableEnded) res.end();
		});
	});
	// SSE 是长连接：别让 Node 默认的 5 秒头超时/空闲超时把流掐掉
	server.keepAliveTimeout = 65000;
	server.headersTimeout = 70000;
	server.requestTimeout = 0;
	server.timeout = 0;

	return {
		server,
		cfg,
		stats,
		listen: () =>
			new Promise((resolve, reject) => {
				server.once("error", reject);
				server.listen(cfg.port, cfg.host, () => {
					server.removeListener("error", reject);
					resolve(server.address());
				});
			}),
		close: () =>
			new Promise((resolve) => {
				limiter.stopSweeper();
				server.close(() => resolve());
				// 还有活着的连接就主动断开（不然 close() 回调要等 SSE 自己结束）
				server.closeAllConnections?.();
			}),
	};
}

/* ── 命令行入口 ───────────────────────────────────────────────────────────── */

const USAGE = `桌宠 Agent 网关（零依赖 Node 同源反代）

用法：
  node server/pet-gateway.mjs [--help]

环境变量（默认值即生产口径）：
  PET_GATEWAY_HOST=127.0.0.1       监听地址
  PET_GATEWAY_PORT=8787            监听端口
  PET_GATEWAY_UPSTREAM=http://127.0.0.1:2024   上游（http/https）
  PET_GATEWAY_PREFIX=/api/agent    要剥掉的本站前缀
  PET_ALLOWED_ORIGINS=http://localhost:4321,http://localhost:4323
  PET_GATEWAY_RATE_LIMIT=20        次 / 分钟 / IP
  PET_GATEWAY_MAX_BODY=8192        请求体上限（字节）
  PET_GATEWAY_MAX_CHARS=1000       流式端点用户消息上限（码点）
  PET_GATEWAY_ROUND_TIMEOUT_MS=300000  单轮硬上限
  PET_GATEWAY_TRUST_PROXY=0        置 1 才认 X-Forwarded-For（**只在 Nginx 后面开**）

路由白名单：GET /ok、POST /assistants/search、POST /threads、
  POST /threads/<id>/runs/stream、GET /threads/<id>/state、GET /__gw/health

自检：pnpm verify:gateway    ｜  契约：ARCH.md §8.4 / §8.5 / §8.9
`;

function main() {
	const argv = process.argv.slice(2);
	if (argv.includes("--help") || argv.includes("-h")) {
		process.stdout.write(USAGE);
		process.exit(0);
	}
	let cfg;
	try {
		cfg = readConfig();
	} catch (err) {
		process.stderr.write(`[gw] 配置错误：${err.message}\n`);
		process.exit(2);
	}
	const gw = createGateway(cfg);
	gw.listen()
		.then((addr) => logStartup(cfg, addr))
		.catch((err) => {
			process.stderr.write(`[gw] 起不来：${err.code ?? err.message}\n`);
			process.exit(1);
		});
	const bye = () => {
		gw.close().then(() => process.exit(0));
	};
	process.on("SIGINT", bye);
	process.on("SIGTERM", bye);
}

// 只有"直接跑这个文件"才起服务；被 import（验收脚本 / 将来的测试）时不动手
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
