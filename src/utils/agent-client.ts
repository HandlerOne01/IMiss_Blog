/**
 * 「桌宠 ↔ Agent 服务」前端适配层（R-AGT-03 / R-AGT-04 / R-AGT-07，P5-1 起接线）
 * ============================================================================
 * 契约依据：**`ARCH.md` §8.9「Agent 接口契约（P5-0 冻结）」**。这个文件是那份契约在
 * 前端的**唯一落点**——组件（`AemeathPet.astro`）不许自己写 `fetch`，也不许自己解析 SSE。
 *
 * 三层职责，别越界：
 *   ① 本文件（适配层）：HTTP + SSE + `interrupt` 判定 + 降级到 mock。**只依赖 `agentConfig`**。
 *   ② 组件：气泡 DOM、九状态联动、把用户那句话交给 `askAemeath()`。
 *   ③ 后端（`agent_-for_-blog`，只读）：图、节点、人设、prompt。
 *
 * 契约里最容易写错的四件事，逐条在这里落死（每条旁边都标了 §8.9 的出处）：
 *   1. **`assistant_id` 必须现查**（§8.9.1 #1）：`POST /assistants/search` → 按 `graph_id`
 *      **去重**后取 `agentConfig.graphId` 对应的那一个。**绝不硬编码**——它是部署时生成的。
 *   2. **最终答复 = 最后一个 `values` 事件里、最后一条 `content` 非空的 `ai` 消息**（§8.9.3）。
 *      `tool` 消息、`messages/partial`、`messages/metadata` **一律不进 UI**：实测检索轮的消息流里
 *      混着 `可用的表:blog, blog_content`（纯 `ai` 消息！）与 `CREATE TABLE blog (…)`（`tool` 消息）
 *      —— 一旦"整条流都渲染"，访客会在爱弥斯的气泡里看到数据库 DDL。取法只有上面这一种写法是对的。
 *   3. **`interrupt` 不是事件名**（§8.9.5）：三层检测（`values.__interrupt__` → `updates.__interrupt__`
 *      → `GET /threads/{id}/state` 兜底），命中就说明"这一轮没有最终答复，必须续跑"。
 *      `__interrupt__[0].value` **直接就是可以进气泡的用户可读文本**（人设已经写好了），不要另编。
 *   4. **降级是硬要求，不是兜底彩蛋**（§8.9.6，R-AGT-03）：连不上 / 超时 / 契约不符 / 答复为空，
 *      **一律走 mock 台词，不抛异常、不弹技术报错**，而且**任何内部信息都不许进用户可见文本**
 *      （图名、线程号、端口、错误码、栈、模型名、节点名、表名，连"Agent 未连接"这种运维字样都不给）。
 *
 * ⚠️ **不 import `petConfig`**：`fallbackReply()` 是**契约 §8.9.6 第 2 条**那套"短、平、然后给出口"
 *    的口径，与 `petConfig.mockReplies` 是同一套说法的两个落点：配置里那几句是"出厂台词"，
 *    这里负责"按用户这句话挑一句合适的"。两边都不许出现运维字样。
 *
 * ⚠️ **测试注入钩子**（`window.__imissAgentConfig`）：`verify:ui` 要在**同一份构建产物**上验
 *    "`enable:false` 零请求"与"`enable:true` 真往返"两种配置，而 `enable` 是构建期常量，
 *    build 两次会留下与交付物不一致的产物。所以这里允许**测试注入**覆盖 `enable` / `baseUrl`
 *    / `timeoutMs`（见 `pickLiveConfig()`，白名单字段，**不碰 `resumeWords`**）。
 *    它只在 `verify-ui.mjs` 的 R-AGT 段里被写入；正常运行路径上这个全局量不存在 → 走真配置。
 * ============================================================================
 */
import { agentConfig } from "@/config";
import type { AgentConfig, AgentResumeWord } from "@/types/agentConfig";

/* ── 契约常量（与 §8.9 逐条对应）────────────────────────────────────────────
   ⚠️ 这些值**故意不放进 `agentConfig`**：它们属于"契约"而不是"能被改的配置" ——
      改它们等于改契约，必须连带改 `ARCH.md` §8.9 与 `scripts/verify-agent.mjs`。 */
/** `stream_mode` 必须**同时含这三个**（§8.9.2）：少一个就取不到最终状态或 `interrupt` */
const STREAM_MODES = ["messages", "values", "updates"] as const;
/** 可用性探测超时（§8.9.1）：本机 `ECONNREFUSED` 是立刻返回的，2 秒是为了兼容"端口开着但不响应" */
const PROBE_TIMEOUT_MS = 2000;
/**
 * **连接 / 首字节**超时（§8.9.1）：只覆盖"发出请求 → 拿到响应头"这一段。
 * 实测首字节 1~5 秒就来了；给到 `agentConfig.timeoutMs` 与 20 秒里的小值，
 * 是为了"服务在排队"时不至于一直等，同时**不拿它去掐整条流**。
 */
const CONNECT_TIMEOUT_MS = 20000;
/**
 * **流中途卡死**判定：多久没有新 chunk 才算这轮流不动了。
 * 为什么需要它：检索轮总耗时实测 30~120 秒（§8.9.7 未决项 #7），
 * 拿一个固定总时长掐流会出现"聊到一半断掉"（发起人 2026-09-26 明确提醒过这一点）。
 * LLM 正常几秒就吐一个 chunk，60 秒没有任何增量 = 真的卡住。
 */
const STREAM_STALL_MS = 60000;
/**
 * **硬上限**：一轮的最长寿命（兜底，防"永远挂着"）。
 * 300 秒的依据：检索/推荐轮实测最坏 120 秒，两轮续跑留出余量；
 * 同时与 `ARCH.md` §12.2 里 Nginx 的 `proxy_read_timeout 300s` 对齐 —— 前端比反代
 * 稍早收手，用户看到的是"降级台词"而不是反代那侧的 504。
 */
const ROUND_HARD_LIMIT_MS = 300000;
/** 连接层错误 / 5xx 的重试间隔（§8.9.1：重试 1 次，`4xx` 不重试） */
const RETRY_GAP_MS = 500;
/** 一轮里最多续跑几次（§8.9.5：契约要求一轮收口，这里给一次容错，防死循环） */
const MAX_RESUME_ROUNDS = 2;
/** `/ok` 探测结果的短缓存（§8.9.1：连接层错误只重试 1 次；这里再加 5 秒缓存，免得连问三句都先等超时） */
const PROBE_CACHE_MS = 5000;

/** SSE 事件名白名单（§8.9.3）：出现名单外的名字 = 上游改了协议 → 当契约不符处理（降级） */
const KNOWN_EVENTS = new Set([
	"metadata",
	"values",
	"updates",
	"messages/metadata",
	"messages/partial",
	"messages/complete",
	"error",
	"end",
]);

/** 当前生效的配置类型（注入钩子只允许改这三个字段） */
export type LiveAgentConfig = Pick<
	AgentConfig,
	"enable" | "baseUrl" | "timeoutMs"
>;

/** 注入钩子在白名单里挑字段；缺字段 / 类型不对就回落到 `agentConfig` 的真值 */
export function pickLiveConfig(
	raw: unknown,
	base: LiveAgentConfig = agentConfig,
): LiveAgentConfig {
	if (!raw || typeof raw !== "object") return base;
	const o = raw as Record<string, unknown>;
	const pick = <K extends keyof LiveAgentConfig>(k: K): LiveAgentConfig[K] => {
		const v = o[k as string];
		return (typeof v === typeof base[k] ? v : base[k]) as LiveAgentConfig[K];
	};
	return {
		enable: pick("enable"),
		baseUrl: pick("baseUrl"),
		timeoutMs: pick("timeoutMs"),
	};
}

/** 读当前生效配置：测试注入优先，否则就是 `agentConfig` 的真值 */
function liveConfig(): LiveAgentConfig {
	return pickLiveConfig(
		(globalThis as { __imissAgentConfig?: unknown }).__imissAgentConfig,
	);
}

/**
 * 排障日志（`agentConfig.debug`）。
 * ⚠️ 只打**形状**（HTTP 状态、事件名、耗时、判定结果），**不打**用户消息与答复正文——
 * 气泡里的内容属于访客，不该出现在 console；同理不打 key。
 */
function debugLog(label: string, detail: Record<string, unknown>): void {
	if (!agentConfig.debug) return;
	console.debug(`[agent] ${label}`, detail);
}

/* ── 会话状态 ─────────────────────────────────────────────────────────────
   线程跟着"这个页面活着"的这段会话走（§8.9.1 的生命周期），所以放模块级：
   不写 `localStorage` —— 服务端是内存 checkpoint，重启即清空，存了也要处理失效。 */
let threadId: string | null = null;
let assistantId: string | null = null;
/** 这个会话里已经确认过的服务地址（换了 `baseUrl` 就要重新确认） */
let confirmedBase = "";
/** `/threads` 建不出来时的短缓存（避免连续几问都卡在建线程上） */
let threadAttemptAt = 0;
/** `GET /ok` 的结果缓存（长时间不可用时不至于每次问都先等满探测超时） */
let probeCache: { at: number; ok: boolean } | null = null;

/** 测试 / 排障用：清空会话状态（下次调用会重新探活、重新建线程） */
export function resetSession(): void {
	threadId = null;
	assistantId = null;
	confirmedBase = "";
	threadAttemptAt = 0;
	probeCache = null;
}

/* ── 对外类型（组件只认这几个）────────────────────────────────────────────── */

/** 一轮里后端反问了"需要用户再答一句"（§8.9.5） */
export interface AgentInterrupt {
	/** **可直接进气泡的询问文本**（`__interrupt__[0].value`，人设已写好，别另编） */
	ask: string;
	/** 续跑时该回给后端的约定词（`agentConfig.resumeWords` 之一，来自 §8.9.5 的暗号表） */
	reply: string;
	/** 怎么判出来的（只给日志 / 断言看，**不许**进气泡） */
	via: "values" | "updates" | "state";
}

/** 最终状态：只有这四种，组件按它做九状态联动（R-AGT-04） */
export type AgentTurnStatus = "answer" | "interrupt" | "fallback" | "disabled";

export interface AgentTurn {
	/** 进气泡的文本（可能为空串：续跑途中被调用方取消） */
	text: string;
	status: AgentTurnStatus;
	/** 走了 mock（降级或开关关掉）时为 true */
	fromMock: boolean;
	/** 失败原因，**只给日志 / 断言看，绝不许进气泡** */
	reason?: string;
	/** 有 `interrupt` 时才有 */
	interrupt?: AgentInterrupt;
	/** 这一轮实际耗时（毫秒） */
	elapsedMs: number;
}

/** 一轮内的增量事件：只暴露"给人看的文本"，内部字段一律不出这个文件 */
export interface AgentStreamEvents {
	/** 拿到更好版本的答复文本时回调（流式增量与收尾各来一次；实现里做了去重） */
	onReply?: (text: string) => void;
}

/* ── 极小的 HTTP 工具 ─────────────────────────────────────────────────────── */

/** 把可选的外部信号与内部超时合起来：任何一个触发，这次请求就结束 */
function mergeSignal(round: AbortController, extra?: AbortSignal): AbortSignal {
	if (!extra) return round.signal;
	if (extra.aborted) round.abort();
	else extra.addEventListener("abort", () => round.abort(), { once: true });
	return round.signal;
}

/** **只认"连不上 / 网线断了"这类连接层错误**（§8.9.1：只重试这一类 + `5xx`） */
function isConnectionError(err: unknown): boolean {
	return err instanceof TypeError;
}

const sleep = (ms: number): Promise<void> =>
	new Promise((r) => setTimeout(r, ms));

/**
 * 一次请求 + 一次重试（§8.9.1 的重试规矩）。
 * ⚠️ `fetch` 只有在"拿到响应头之前"失败才是连接层错误（`TypeError`）；流已经开始之后
 * 中途断掉是 `reader.read()` 抛异常，**那一轮不重试**（重试会把半截答复重放一遍）。
 */
async function requestOnce(
	url: string,
	init: RequestInit,
	timeoutMs: number,
	signal?: AbortSignal,
	retryOn5xx = true,
): Promise<Response> {
	let lastErr: unknown = null;
	for (let attempt = 0; attempt < 2; attempt++) {
		const round = new AbortController();
		const timer = setTimeout(() => round.abort(), timeoutMs);
		try {
			const res = await fetch(url, {
				...init,
				signal: mergeSignal(round, signal),
			});
			if (retryOn5xx && res.status >= 500 && attempt === 0) {
				await sleep(RETRY_GAP_MS);
				continue;
			}
			return res;
		} catch (err) {
			lastErr = err;
			// `4xx` 走不到这里；`fetch` 抛错只有连接层 / abort 两类，abort 不该重试
			if (
				signal?.aborted ||
				round.signal.aborted ||
				!isConnectionError(err) ||
				attempt === 1
			)
				throw err;
			await sleep(RETRY_GAP_MS);
		} finally {
			clearTimeout(timer);
		}
	}
	throw lastErr ?? new Error("请求失败");
}

const jsonInit = (method: string, body?: unknown): RequestInit =>
	body === undefined
		? { method }
		: {
				method,
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			};

/* ── SSE 解析（§8.9.3）─────────────────────────────────────────────────────
   自己写而不是引库：形状只有 `event: X` / `data: Y` / 空行分隔三种，约 30 行够了，
   而且**必须**能容忍 `\r\n` 与没有空格前缀的 `data:`（中间有代理时会改写）。 */

interface SSEEvent {
	name: string;
	data: string;
}

type SSEHandler = (ev: SSEEvent) => void;

/** 增量式 SSE 解析器：喂 chunk，吐完整事件（跨 chunk 的半截事件留在缓冲里） */
class SSEParser {
	private buf = "";
	private name = "";
	private data: string[] = [];

	constructor(private readonly onEvent: SSEHandler) {}

	push(chunk: string): void {
		this.buf += chunk;
		// 统一换行，省得后面每处都处理 \r
		this.buf = this.buf.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
		let idx = this.buf.indexOf("\n");
		while (idx >= 0) {
			const line = this.buf.slice(0, idx);
			this.buf = this.buf.slice(idx + 1);
			this.line(line);
			idx = this.buf.indexOf("\n");
		}
	}

	private line(line: string): void {
		if (line === "") {
			// 空行 = 一个事件结束
			if (this.name && this.data.length)
				this.onEvent({ name: this.name, data: this.data.join("\n") });
			this.name = "";
			this.data = [];
			return;
		}
		if (line.startsWith(":")) return; // 注释 / 心跳
		const m = /^(event|data):\s?(.*)$/.exec(line);
		if (!m) return;
		if (m[1] === "event") this.name = m[2].trim();
		else this.data.push(m[2]);
	}
}

/* ── 契约里的取法（§8.9.3 / §8.9.5）──────────────────────────────────────── */

interface WireMessage {
	type?: unknown;
	content?: unknown;
}

/** **最终答复的唯一正确取法**：最后一条 `content` 非空的 `ai` 消息 */
function lastAiMessage(messages: unknown): string {
	if (!Array.isArray(messages)) return "";
	const list = messages.filter(
		(m): m is WireMessage => Boolean(m) && typeof m === "object",
	);
	for (let i = list.length - 1; i >= 0; i--) {
		const m = list[i];
		if (m.type === "ai" && typeof m.content === "string" && m.content.trim())
			return m.content;
	}
	return "";
}

/** `__interrupt__` 的 value 可能是字符串，也可能是 `{value: …}` 形态，两种都认 */
function interruptValue(list: unknown): string | null {
	if (!Array.isArray(list) || !list.length) return null;
	const first = list[0] as { value?: unknown };
	const v = typeof first === "string" ? first : first?.value;
	return typeof v === "string" && v.trim() ? v : null;
}

function parseJSON(s: string): unknown {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

/** 一轮流式调用的聚合结果（内部结构，不出这个文件） */
interface Round {
	status: number;
	state: Record<string, unknown>;
	interrupt?: AgentInterrupt;
	answer: string;
	error?: string;
}

/**
 * 跑一轮 `runs/stream`（§8.9.2 的请求形状 + §8.9.3 的解析规矩）。
 * `payload` 要么是首轮的 `{input}`，要么是续跑轮的 `{command}`（**两者互斥**）。
 * `config` / `context` **一个都不传**：同时传会 HTTP 400，而本机没有鉴权，传了也没用。
 */
async function runRound(
	baseUrl: string,
	thread: string,
	payload: Record<string, unknown>,
	assistant: string,
	connectTimeoutMs: number,
	signal: AbortSignal | undefined,
	ev: AgentStreamEvents,
	lastSent: { text: string },
): Promise<Round> {
	const round: Round = { status: 0, state: {}, answer: "" };
	// ── 三个**分开**的闸门（这是发起人 2026-09-26 明确提醒的那一点：别拿一个总时长把流掐断）──
	//   ① 连接/首字节：`min(agentConfig.timeoutMs, 20s)`，只管"发出请求 → 拿到响应头"；
	//   ② 流中途卡死：60 秒**没有任何新 chunk** 才算失败；
	//   ③ 硬上限：300 秒（兜底，防永远挂着；与 Nginx 的 proxy_read_timeout 对齐）。
	// 为什么必须分开：检索轮总耗时实测 30~120 秒且抖动很大（§8.9.7 未决项 #7），
	// 一刀切的总时长会让真机出现"聊到一半断掉"。
	const connect = new AbortController();
	const connectMs = Math.min(CONNECT_TIMEOUT_MS, connectTimeoutMs);
	const connectTimer = setTimeout(() => connect.abort(), connectMs);
	const hard = new AbortController();
	const hardTimer = setTimeout(() => hard.abort(), ROUND_HARD_LIMIT_MS);
	// ⚠️ 三路取消都要接上：调用方（关聊天框/切页）、连接超时、硬上限。
	// 拿到响应头之后要把"连接"那一路摘掉 —— 否则报头一到就开始计时"首字节"，读到一半会被误杀。
	const mid = new AbortController();
	const onCallerAbort = (): void => mid.abort();
	const onConnectAbort = (): void => mid.abort();
	const onHardAbort = (): void => mid.abort();
	if (signal?.aborted) mid.abort();
	else signal?.addEventListener("abort", onCallerAbort, { once: true });
	connect.signal.addEventListener("abort", onConnectAbort, { once: true });
	hard.signal.addEventListener("abort", onHardAbort, { once: true });
	const finish = (error: string): void => {
		if (!round.error) round.error = error;
	};

	const absorb = (e: SSEEvent): void => {
		if (!KNOWN_EVENTS.has(e.name)) {
			// 白名单外的事件名 = 上游改了协议（§8.9.6 条件 4）→ 显形并降级，**不往下渲染**
			finish(`白名单外的事件名：${e.name}`);
			return;
		}
		if (e.name === "error") {
			finish("上游 error 事件");
			return;
		}
		if (e.name === "values") {
			const o = parseJSON(e.data);
			if (o && typeof o === "object") {
				const state = o as Record<string, unknown>;
				round.state = state;
				const ask = interruptValue(state.__interrupt__);
				if (ask && !round.interrupt)
					round.interrupt = { ask, reply: replyForAsk(ask), via: "values" };
				const text = lastAiMessage(state.messages);
				if (text && text.length >= lastSent.text.length) {
					lastSent.text = text;
					round.answer = text;
					ev.onReply?.(text);
				}
			}
		} else if (e.name === "updates" && !round.interrupt) {
			// `updates` 是 `interrupt` 的第二来源；**不用它渲染任何东西**
			const o = parseJSON(e.data) as Record<string, unknown> | null;
			const ask = interruptValue(o?.__interrupt__);
			if (ask)
				round.interrupt = { ask, reply: replyForAsk(ask), via: "updates" };
		}
		// `messages/*` 一律不碰：`messages/metadata` 是模型名 / 节点名（内部信息），
		// `messages/partial` 是半成品 tool_calls，`messages/complete` 与 `values` 重复。
	};

	try {
		const res = await requestOnce(
			`${baseUrl}/threads/${thread}/runs/stream`,
			jsonInit("POST", {
				...payload,
				assistant_id: assistant,
				stream_mode: STREAM_MODES,
			}),
			// ⚠️ 这里的数只是 `requestOnce` 内部的保险丝（两次尝试各一份）；真正的
			// "连接/首字节"闸门是上面那个 `connect` 信号（它到点就 abort，重试也跑不掉）。
			connectMs * 2 + RETRY_GAP_MS + 5000,
			mid.signal,
		);
		round.status = res.status;
		if (!res.ok) {
			finish(`HTTP ${res.status}`);
			return round;
		}
		if (!res.body) {
			finish("响应没有 body");
			return round;
		}
		// 响应头已到 —— "连接/首字节"这一路到此为止，后面读到一半不该被它掐断
		clearTimeout(connectTimer);
		connect.signal.removeEventListener("abort", onConnectAbort);
		const reader = res.body.getReader();
		const dec = new TextDecoder();
		const parser = new SSEParser(absorb);
		for (;;) {
			// ② 流中途卡死判定：每读一次重置看门狗（`reader.cancel()` 让 `read()` 立刻返回）
			let stallTimer: ReturnType<typeof setTimeout> | undefined;
			const stalled = new Promise<"stall">((resolve) => {
				stallTimer = setTimeout(() => {
					finish("流中途卡死");
					void reader.cancel().catch(() => {});
					resolve("stall");
				}, STREAM_STALL_MS);
			});
			const chunk = await Promise.race([reader.read(), stalled]);
			clearTimeout(stallTimer);
			if (chunk === "stall") return round;
			if (chunk.done) break;
			parser.push(dec.decode(chunk.value, { stream: true }));
		}
		return round;
	} catch (err) {
		if (signal?.aborted) finish("aborted");
		else if (hard.signal.aborted) finish("超过单轮硬上限");
		else if (connect.signal.aborted) finish("连接/首字节超时");
		else if (isConnectionError(err)) finish("连接层错误");
		else finish(err instanceof Error ? err.name : "未知错误");
		return round;
	} finally {
		clearTimeout(connectTimer);
		clearTimeout(hardTimer);
		signal?.removeEventListener("abort", onCallerAbort);
	}
}

/** 第三层兜底（§8.9.5 层③）：`GET /threads/{id}/state` 的 `interrupts[]` / `tasks[].interrupts[]` */
async function interruptFromState(
	baseUrl: string,
	thread: string,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<string | null> {
	try {
		const res = await requestOnce(
			`${baseUrl}/threads/${thread}/state`,
			jsonInit("GET"),
			timeoutMs,
			signal,
		);
		if (!res.ok) return null;
		const st = (await res.json()) as {
			interrupts?: unknown;
			tasks?: { interrupts?: unknown }[];
		};
		// 同时有 `interrupts[]` 与 `tasks[].interrupts[]` 时**优先 tasks**：前者是历史累计
		// （跑过几轮就有几条，会把"上一轮的旧问题"混进来），后者才是当前活跃任务。
		for (const task of Array.isArray(st.tasks) ? st.tasks : []) {
			const v = interruptValue(task?.interrupts);
			if (v) return v;
		}
		return interruptValue(st.interrupts);
	} catch {
		return null;
	}
}

/* ── 约定词（§8.9.5 的暗号表）────────────────────────────────────────────── */

/**
 * 挑该回给后端哪个约定词。
 * 实测的询问原文是「…篇幅（大概多少字、能看多久）。不想说也行，回我「不提供」——我按站里的
 * 常用范围替你挑…」，用户没明说字数时**默认回 `不提供`**（契约里标了它是默认值）。
 */
function replyForAsk(ask: string): string {
	if (/不提供|不想说|懒得说|不用挑/.test(ask))
		return agentConfig.resumeWords.default;
	if (/多少字|字数|篇幅|多长|时长|看多久/.test(ask))
		return agentConfig.resumeWords.default;
	if (/要不要|需要我|要我/.test(ask)) return agentConfig.resumeWords.provide;
	return agentConfig.resumeWords.default;
}

/** 这句话里有没有出现约定词（判"用户这句是不是在回答 `interrupt`"） */
function isResumeWord(text: string, words: string[]): boolean {
	const t = text.replace(/\s+/g, "");
	return words.some((w) => w.length > 0 && t.includes(w));
}

/** 把"要不要续跑"翻译成该回哪个约定词（§8.9.5 的暗号表；`decline` 优先于 `provide`） */
function resumeWordFor(message: string): AgentResumeWord {
	const w = agentConfig.resumeWords;
	if (isResumeWord(message, [w.decline])) return w.decline;
	if (isResumeWord(message, [w.provide])) return w.provide;
	return w.default;
}

/* ── 降级（§8.9.6，R-AGT-03）─────────────────────────────────────────────── */

/**
 * mock 台词：口径取自 `agent/persona-aemeath-v5.txt` 的红线段落
 * （第七节「红线：拒绝要短，然后马上换路」+ 第十节「宁可说"我这边断了"，也不要说"星轨紊乱了"」）。
 * 模板 = `不行。` + 换行 + `……<原因，一句话>。` + `<换点别的 / 换个说法>`。
 * ⚠️ 这里**一个运维字样都不许有**：不提服务、端口、连接、模型、图、线程、错误码。
 */
export function fallbackReply(message: string): string {
	const text = message.trim();
	// 打招呼 / 只有寒暄：接住就行，别过度反应
	if (/^(在吗|在不在|在么|hi|hello|你好|嗨|喂)[?？!！。~，,]*$/i.test(text))
		return "在。你说。";
	if (/谢谢|多谢|辛苦/.test(text)) return "谢什么，这不就是我的活儿嘛。";
	// 找东西 / 要推荐：给"我真的在翻"的在场感，别装傻
	if (/推荐|找几篇|有没有|搜一下|搜下|找找|来几篇|看看.*(文章|博客)/.test(text))
		return "好，我去翻。\n……等我一下。";
	// 兜底：短、平，然后把话头递回去（人设第三节："先接住人，再给信息"）
	return "嗯，我听着呢。\n……你再多说一句。";
}

/** `GET /ok`（§8.9.1 #0）：**降级判定的唯一入口**。失败不抛异常，只回 false */
export async function probe(
	baseUrl: string,
	timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<boolean> {
	try {
		const res = await requestOnce(
			`${baseUrl}/ok`,
			jsonInit("GET"),
			timeoutMs,
			undefined,
			false,
		);
		if (!res.ok) return false;
		const j = (await res.json()) as { ok?: unknown };
		return j?.ok === true;
	} catch {
		return false;
	}
}

/** `POST /assistants/search` → **按 `graph_id` 去重**后列出可用的图（§8.9.1 #1） */
export async function listAssistants(
	baseUrl: string,
	timeoutMs: number,
): Promise<{ graphId: string; assistantId: string }[]> {
	const res = await requestOnce(
		`${baseUrl}/assistants/search`,
		jsonInit("POST", { limit: 50 }),
		timeoutMs,
	);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const list = (await res.json()) as {
		graph_id?: unknown;
		assistant_id?: unknown;
	}[];
	if (!Array.isArray(list)) throw new Error("返回不是数组");
	const byGraph = new Map<string, string>();
	for (const a of list) {
		const g = typeof a?.graph_id === "string" ? a.graph_id : "";
		const id = typeof a?.assistant_id === "string" ? a.assistant_id : "";
		// 同一个 `graph_id` 可能有多个 assistant（实测 `blog_agent` 两个实例）→ 去重，取第一个
		if (g && id && !byGraph.has(g)) byGraph.set(g, id);
	}
	return [...byGraph].map(([graphId, assistantId]) => ({
		graphId,
		assistantId,
	}));
}

/** `POST /threads`（§8.9.1 #2）：一个会话一个线程，`thread_id` 由前端持有 */
export async function createThread(
	baseUrl: string,
	timeoutMs: number,
): Promise<string> {
	const res = await requestOnce(
		`${baseUrl}/threads`,
		jsonInit("POST", {}),
		timeoutMs,
	);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const j = (await res.json()) as { thread_id?: unknown };
	if (typeof j?.thread_id !== "string" || !j.thread_id)
		throw new Error("拿不到 thread_id");
	return j.thread_id;
}

/**
 * 确认"服务可用 **且** 配置的图存在"，返回 `assistant_id`；不可用回 `null`。
 * 三级缓存都是**短**的（`PROBE_CACHE_MS`）：降级后 5 秒就会重新探活，用户再问一句就能恢复。
 */
async function ensureAssistant(
	baseUrl: string,
	timeoutMs: number,
	now: number,
): Promise<string | null> {
	if (assistantId && confirmedBase === baseUrl) return assistantId;
	const cachedProbe = confirmedBase === baseUrl ? probeCache : null;
	const fresh = Boolean(
		cachedProbe && now - (cachedProbe?.at ?? 0) < PROBE_CACHE_MS,
	);
	const reachable = fresh ? Boolean(cachedProbe?.ok) : await probe(baseUrl);
	if (!fresh) probeCache = { at: now, ok: reachable };
	if (!reachable) return null;
	const list = await listAssistants(baseUrl, timeoutMs);
	const hit = list.find((a) => a.graphId === agentConfig.graphId);
	if (!hit) return null;
	assistantId = hit.assistantId;
	confirmedBase = baseUrl;
	return assistantId;
}

/* ── 主入口 ───────────────────────────────────────────────────────────────── */

/**
 * 一轮完整问答（含 `interrupt` 续跑），**永不抛异常**。
 *
 * 调用方只需要看 `status`：
 *   · `disabled` —— 开关关掉（`enable:false`）：**一个网络请求都没发**，`text` 是 mock 台词。
 *   · `answer`   —— 拿到了人设化的最终答复。
 *   · `interrupt`—— 后端反问了一句（`text` 就是那句询问原文），`interrupt.reply` 是下次该回的话。
 *   · `fallback` —— 连不上 / 超时 / 契约不符 / 答复为空：走 mock 台词（`reason` 只给日志）。
 *
 * `opts.lastReply` 传"上一轮气泡里那句话"：用户回「不提供」时，适配层据此判出这是**续跑**
 * 而不是新话题（§8.9.5 的约定词匹配）；**不匹配也不报错**，当普通消息发出去。
 */
export async function askAemeath(
	message: string,
	opts: {
		signal?: AbortSignal;
		events?: AgentStreamEvents;
		lastReply?: string;
	} = {},
): Promise<AgentTurn> {
	const t0 = Date.now();
	const cfg = liveConfig();
	const done = (t: Omit<AgentTurn, "elapsedMs">): AgentTurn => ({
		...t,
		elapsedMs: Date.now() - t0,
	});
	const mock = (
		reason: string,
		status: AgentTurnStatus = "fallback",
	): AgentTurn =>
		done({ text: fallbackReply(message), status, fromMock: true, reason });

	// ① 开关关掉：**一个请求都不发**（§8.9.6 条件 1）
	if (!cfg.enable) return mock("enable:false", "disabled");
	const base = cfg.baseUrl.replace(/\/+$/, "");
	if (!base) return mock("baseUrl 为空");

	const signal = opts.signal;
	const assistant = await ensureAssistant(
		base,
		cfg.timeoutMs,
		Date.now(),
	).catch(() => null);
	debugLog("availability", {
		base,
		graph: agentConfig.graphId,
		hasAssistant: Boolean(assistant),
	});
	// 调用方主动取消（关聊天框 / 切页）：不降级、不报错，交给调用方丢掉这个结果
	if (signal?.aborted)
		return done({
			text: "",
			status: "fallback",
			fromMock: false,
			reason: "aborted",
		});
	if (!assistant) return mock("Agent 不可达，或没有配置的图");

	// ② 建线程（首次）——失败也算"Agent 不可用"，按契约降级
	if (!threadId) {
		// 建线程失败后 5 秒内不再重试：探活已经说了"不可用"，连续几个问题都去撞一遍没意义
		// （用户下一次提问仍会重新探活，§8.9.6 第 4 条要求"能连续降级、能重试"）。
		if (Date.now() - threadAttemptAt < PROBE_CACHE_MS)
			return mock("建线程失败（短缓存内不重试）");
		threadAttemptAt = Date.now();
		try {
			threadId = await createThread(base, cfg.timeoutMs);
		} catch (err) {
			return mock(`建线程失败：${err instanceof Error ? err.message : "未知"}`);
		}
	}
	const thread = threadId;
	// 只把"连接/首字节"这一档传下去；**整轮不再有固定超时**（长答复要允许继续流式收，
	// 由 `runRound` 里的"流中途卡死 60 秒"与"硬上限 300 秒"两道闸门兜底）。
	const connectTimeout = cfg.timeoutMs;
	// 去重：流式增量会让同一个答复出现好几次，只有真的变长了才再推给气泡
	const lastSent = { text: opts.lastReply ?? "" };
	const events: AgentStreamEvents = { onReply: opts.events?.onReply };
	const answeringInterrupt = Boolean(
		opts.lastReply &&
			isResumeWord(message, Object.values(agentConfig.resumeWords)),
	);

	let payload: Record<string, unknown> = {
		input: { messages: [{ type: "human", content: message }] },
	};

	for (let round = 0; round <= MAX_RESUME_ROUNDS; round++) {
		const r = await runRound(
			base,
			thread,
			payload,
			assistant,
			connectTimeout,
			signal,
			events,
			lastSent,
		);
		debugLog("round", {
			round,
			status: r.status,
			error: r.error,
			interruptVia: r.interrupt?.via,
			answerChars: r.answer.length,
		});
		if (signal?.aborted || r.error === "aborted") {
			return done({
				text: "",
				status: "fallback",
				fromMock: false,
				reason: "aborted",
			});
		}
		if (r.status === 0 || r.status >= 500)
			return mock(`请求失败：${r.error ?? r.status}`);
		if (r.status >= 400) return mock(`契约不符：${r.error ?? r.status}`);
		if (r.error) return mock(`契约不符：${r.error}`);

		// ③ 三层检测的第三层：`values` / `updates` 都没给信号时，问一次 `GET .../state`（最可靠）
		if (!r.interrupt) {
			const ask = await interruptFromState(base, thread, cfg.timeoutMs, signal);
			if (ask) r.interrupt = { ask, reply: replyForAsk(ask), via: "state" };
		}
		// ④ 命中 `interrupt`，分两种形态（§8.9.5 只描述了第一种，第二种是 P5-1 接线时实测到的）：
		if (r.interrupt) {
			// 形态 A（**先给答案再反问**，`blog_agent` 的检索链路）：最后一个 `values` 里同时有
			//   522 字的文章列表与 `__interrupt__`「要不要我收进本子？」。这时**这一轮已经有答复了**，
			//   再自动续跑一轮等于替访客做了决定（契约要求"必须续跑"针对的是**没有答复**的那种）。
			//   → 直接把答复 + 反问一起交出去，用户回「需要 / 不需要」由下一轮走 `command.resume`。
			if (r.answer.trim()) {
				return done({
					text: `${r.answer}\n\n${r.interrupt.ask}`,
					status: "interrupt",
					fromMock: false,
					interrupt: r.interrupt,
				});
			}
			// 形态 B（**纯反问、没有答复**，`recommended_agent` 问篇幅）：这一轮确实没有答复，
			//   必须续跑（§8.9.5 的判定规则）；用户这句话本身是约定词时用他说的那个，否则用默认词。
			if (round === MAX_RESUME_ROUNDS) {
				return done({
					text: r.interrupt.ask,
					status: "interrupt",
					fromMock: false,
					interrupt: r.interrupt,
				});
			}
			const resume: string = answeringInterrupt
				? resumeWordFor(message)
				: r.interrupt.reply;
			payload = { command: { resume } };
			continue;
		}
		// ⑤ 没有 `interrupt`：`values` 里最后一条非空 `ai` 消息就是最终答复
		if (!r.answer.trim()) return mock("最终答复为空");
		return done({ text: r.answer, status: "answer", fromMock: false });
	}
	// 理论到不了这里（循环里每轮都有 return / continue），保险起见仍按降级处理
	return mock("续跑次数用尽");
}
