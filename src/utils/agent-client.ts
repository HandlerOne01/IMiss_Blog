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
/**
 * **第三层兜底（`GET /threads/{id}/state`）的独立超时**。
 * ⚠️ 这个 **1800ms** 是 P5 独立复核 D-4 的修复点：以前这一路复用 `agentConfig.timeoutMs`
 * （整轮口径 = 60 秒），而它挂在**已经拿到答复之后**的关键路径上 —— `/state` 一旦挂住，
 * 用户要等满 60 秒才看到那句早就到手的答复（复核实测 **60079ms**）。
 * 现在的口径：① 只在"前两层都没有 `interrupt` 信号**且**本轮答复为空"时才调（正常轮次
 * 一次都不多打，复核的请求账从 8 个降到 6 个）；② 它自己的超时与 `/ok` 探测同级。
 */
const STATE_TIMEOUT_MS = 1800;
/**
 * **单个 SSE 事件的大小上限**（复核 D-16）。
 * 实测一个恶意/失控的 `values` 能塞 30 万字 → 气泡被撑成 **357,463px** 高的块。
 * 64KB 的依据：真实答复实测最坏 496 字（≈1.5KB 的 JSON）、整条 `values` 快照也远小于它，
 * 而 64KB 足够容纳 2 万字答复 —— 超了就是上游失控，按契约不符降级，不进渲染层。
 */
const MAX_EVENT_BYTES = 64 * 1024;
/**
 * **单条答复进渲染层的字数上限**（复核 D-16 的第二道闸）。
 * 64KB 的闸门之后仍可能有"合法但荒谬"的长答复（例如 5 万字）：那种长度按 D-7 的气泡
 * `max-height` 能滚，但滚动条长到没有意义。所以再加一道"可读性截断"：超了截断并**明说**。
 * 口径：这是**上游失控的兜底**，真实答复（实测 439~496 字）永远碰不到它。
 */
const MAX_RENDER_CHARS = 4000;
/** 截断时补的一句"我说到这儿"，保证用户知道后面还有（不是静默丢内容） */
const TRUNCATED_HINT = "……（这条太长了，我先说到这儿。）";

/**
 * **禁词表（唯一真相源，§8.9.6 第 3 条 + 复核 D-6）**。
 * 这五个词是**数据库内部输出**：实测检索轮的消息流里混着 `可用的表:blog, blog_content`
 * （纯 `ai` 消息！）与 `CREATE TABLE blog (…)`（`tool` 消息）。契约只允许渲染"最后一条
 * content 非空的 ai 消息"，但复核证明了最后一条 ai **也可能**就是 schema 行（工具输出
 * 落到最后）→ 所以取答之后还必须有这一道闸门，命中就当"取不到答复"（降级），
 * 而不是把 DB 内部信息端给访客。
 * ⚠️ `scripts/verify-agent.mjs` 的 `leakMarkers` 与这里是**同一张表**，该脚本会读本文件的
 * 字面量核对（脚本不许 import 业务代码）；改这里就要连带改 §8.9 与那份脚本。
 */
export const LEAK_MARKERS: readonly string[] = [
	"可用的表",
	"CREATE TABLE",
	"word_count_min",
	"user_preferences",
	"user_intent",
];

/** 命中了禁词表里的哪个词（没命中回 `null`）——**给日志/断言看，绝不许进气泡** */
export function leakMarkerIn(text: string): string | null {
	return LEAK_MARKERS.find((m) => text.includes(m)) ?? null;
}

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
/** `GET /ok` 的结果缓存（长时间不可用时不至于每次问都先等满探测超时；**按 baseUrl 记**，见 D-13） */
let probeCache: { at: number; ok: boolean; base: string } | null = null;

/** 测试 / 排障用：清空会话状态（下次调用会重新探活、重新建线程） */
export function resetSession(): void {
	threadId = null;
	assistantId = null;
	confirmedBase = "";
	threadAttemptAt = 0;
	probeCache = null;
}

/**
 * 测试 / 排障用：**只读**看一眼会话状态（`verify-agent-robust.mjs` 拿它证明
 * "失效之后缓存真的被清了、新 id 真的换上了"）。
 * ⚠️ 只回布尔与时间差，**不回 id 本身** —— 这条路径将来可能被 console 打出来，
 * 契约 §8.10 第 1 条要求 `assistant_id` / `thread_id` 不进任何用户可见面。
 */
export function sessionSnapshot(): {
	hasThread: boolean;
	hasAssistant: boolean;
	confirmedBase: string;
	threadAttemptAgeMs: number;
} {
	return {
		hasThread: Boolean(threadId),
		hasAssistant: Boolean(assistantId),
		confirmedBase,
		threadAttemptAgeMs: threadAttemptAt ? Date.now() - threadAttemptAt : -1,
	};
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
	/**
	 * **这一问该怎么答**（v1.91 新增）—— 见 `classifyAsk()`：
	 *   · `"resume-word"`：三个约定词就能答（推荐链路的「要不要收进本子 / 篇幅多少字」）；
	 *   · `"choice"`：**要的是序号或篇名本身**（`introduce.py` 的 `_ask_which`），约定词答不了，
	 *     而且**绝不能由前端替用户答** —— 实测替答两次之后后端会输出
	 *     「我这边没定位到你说的那篇文章」，可它刚刚明明找到了两篇。
	 */
	kind: "resume-word" | "choice";
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

/** 解析器放弃继续解析的原因（`buffer-overflow` = 单事件超上限，见 `MAX_EVENT_BYTES`） */
export type SSEOverflowReason = "buffer-overflow";

/**
 * 增量式 SSE 解析器：喂 chunk，吐完整事件（跨 chunk 的半截事件留在缓冲里）。
 * 三个 `export` 出来是为了能在**不依赖真后端**的回归脚本（`verify-agent-robust.mjs`）里
 * 直接喂畸形字节 —— 复核 D-17/D-18 的反例就是这么变成断言的。
 */
export class SSEParser {
	private buf = "";
	private name = "";
	private data: string[] = [];

	constructor(
		private readonly onEvent: SSEHandler,
		private readonly onOverflow?: (reason: SSEOverflowReason) => void,
	) {}

	push(chunk: string): void {
		// ⚠️ **不要把结尾那个孤立的 `\r` 立刻归一化**（复核 D-17）：
		// 旧写法对整个缓冲做 `.replace(/\r/g,"\n")`，于是"chunk 以 `\r` 结尾、下一个 chunk
		// 以 `\n` 开头"时会被提前消费掉，多行 `data:` 的 JSON 就被劈成两个半截事件（都丢弃）。
		// 真后端的响应头是 `text/event-stream` + **实测用 `\r\n`**，所以这不是纸上谈兵。
		// 现在的口径：只处理"确定完整"的换行 —— `\r\n`、或者**不在缓冲末尾**的孤立 `\r`；
		// 末尾那个 `\r` 留在缓冲里等下一个 chunk（真的是行尾的话，下一轮就会处理）。
		this.buf += chunk;
		this.buf = normalizeNewlines(this.buf);
		for (;;) {
			// 单事件超上限：缓冲里已经攒了这么多字节还没换行 → 上游失控，别再喂了
			if (this.buf.length > MAX_EVENT_BYTES) {
				this.buf = "";
				this.name = "";
				this.data = [];
				this.onOverflow?.("buffer-overflow");
				return;
			}
			const idx = this.buf.indexOf("\n");
			if (idx < 0) return;
			const line = this.buf.slice(0, idx);
			this.buf = this.buf.slice(idx + 1);
			this.line(line);
		}
	}

	/**
	 * **流结束时的收口**（复核 D-18）：SSE 规范要求"EOF 时把还没派发的事件派发掉"，
	 * 旧实现 `if (chunk.done) break;` 之后什么都没有 → "事件没以空行结尾就断流"的那一轮
	 * 会丢掉已经完整到手的那条 `values`，用户看到的是假降级。
	 * 这里把余下缓冲当"最后一行 + 一个隐式空行"处理。
	 */
	flush(): void {
		if (this.buf) {
			this.line(this.buf);
			this.buf = "";
		}
		// 隐式空行：有 event 名且有 data 就派发
		if (this.name && this.data.length) {
			this.onEvent({ name: this.name, data: this.data.join("\n") });
		}
		this.name = "";
		this.data = [];
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

/**
 * 把 `\r\n` 与"不在末尾的孤立 `\r`"归一成 `\n`，**末尾的 `\r` 原样留下**。
 * 单独抽出来是为了能被回归脚本直接测（D-17 的病灶就在这一行）。
 */
export function normalizeNewlines(s: string): string {
	// 先合 CRLF：末尾是 `\r` 时要留住它（它可能是 CRLF 的前半个，也可能是孤立 CR）
	const body = s.endsWith("\r") ? s.slice(0, -1) : s;
	return `${body.replace(/\r\n/g, "\n").replace(/\r/g, "\n")}${s.endsWith("\r") ? "\r" : ""}`;
}

/* ── 契约里的取法（§8.9.3 / §8.9.5）──────────────────────────────────────── */

interface WireMessage {
	type?: unknown;
	/** LangGraph 给每条消息一个 `id`；v1.37 起用它区分"同一条消息的流式增量"与"换了一条新消息" */
	id?: unknown;
	content?: unknown;
}

/**
 * 过滤成"像消息"的元素。**必须只有这一个入口**：`lastHumanIndex()` 与 `lastAiMessage()`
 * 的下标要能互相对齐，各自 `filter` 一遍就成了两套下标。
 */
function wireMessages(messages: unknown): WireMessage[] {
	if (!Array.isArray(messages)) return [];
	return messages.filter((m): m is WireMessage => Boolean(m) && typeof m === "object");
}

/**
 * **最终答复的唯一正确取法**：最后一条 `content` 非空的 `ai` 消息（§8.9.3）。
 * ⚠️ **再补一道禁词闸门**（复核 D-6）：实测工具输出（`可用的表:blog, blog_content`）本身
 * 就是一条 `ai` 消息，只是"今天恰好不是最后一条"。取法全押在"后端消息顺序"上太薄 ——
 * 异常路径（工具输出落到最后）就会把 DB 内部信息端给访客。命中禁词 → 当"取不到答复"。
 *
 * ⚠️ **v1.37 追加 `afterIndex`：只看"这一轮提问之后"的消息**（发起人 2026-09-27 图证的根因）
 * ─────────────────────────────────────────────────────────────────────────────
 * LangGraph 的 `values` 发的是**整份 state**，所以多步图（先路由、再出话）的**首个 `values`
 * 快照里就带着上一轮的答复**。旧实现把它当成本轮答复先收下（`sentText` 被写成上一轮的长度），
 * 于是本轮的真答复只要**更短**，就会被下面"变长才推"的判据静默丢掉 →
 * 用户看到的是"连着问两句，气泡一直是第一句的答复"。
 * 锚点取"最后一条 human 消息的下标"：本轮自己的提问一定排在最后，历史里的答复**根本取不到**；
 * 而"提问与答复在同一个快照里"那种单 `values` 路径（`extend_graph` 之外的直接答复）
 * 照样取得到 —— 两种真实形态都覆盖。
 */
function lastAiMessage(
	messages: unknown,
	afterIndex = -1,
): { text: string; blocked: string | null; id: string | null } {
	const list = wireMessages(messages);
	const from = afterIndex < 0 ? 0 : Math.min(afterIndex + 1, list.length);
	for (let i = list.length - 1; i >= from; i--) {
		const m = list[i];
		if (m.type !== "ai" || typeof m.content !== "string" || !m.content.trim()) continue;
		const hit = leakMarkerIn(m.content);
		if (hit) return { text: "", blocked: hit, id: null };
		return { text: m.content, blocked: null, id: typeof m.id === "string" ? m.id : null };
	}
	return { text: "", blocked: null, id: null };
}

/** 最后一条 human（或 user）消息的下标；没有就 -1 —— 给 `lastAiMessage` 当锚点用 */
function lastHumanIndex(messages: unknown): number {
	const list = wireMessages(messages);
	for (let i = list.length - 1; i >= 0; i--) {
		const t = list[i].type;
		if (t === "human" || t === "user") return i;
	}
	return -1;
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
	/** 取到的答复命中了禁词表（值就是命中的那个词）→ 当"取不到答复"处理（D-6） */
	blockedAnswer?: string;
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

	// ⚠️ 去重**只在本轮内生效**（复核 D-5）：以前这个"已推送文本"的初值来自调用方
	// （`opts.lastReply`，而组件把**用户那句话**塞了进去）→ 用户回一句长话、后端只回 4 个字时，
	// `text.length >= lastSent.text.length` 不成立 → 真答复被判成"空答复"→ 假降级。
	// 现在初值是空串：本轮第一个非空答复一定上屏，之后的流式增量只有变长才再推。
	// ⚠️ **v1.37 再补一条**：`sentText` 必须只统计**本轮**的答复（配合下面的锚点），
	//    并且"换了一条消息"时**无条件接受**（哪怕更短）—— 见 `lastAiMessage` 的注释。
	let sentText = "";
	let sentId: string | null = null;
	const absorb = (e: SSEEvent): void => {
		// 已经判出契约不符/上游 error 了：这一轮作废，同一个 chunk 里后面的事件一律不再看
		if (round.error) return;
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
					round.interrupt = makeInterrupt(ask, "values");
				// ⚠️ 锚点 = 最后一条 human 消息（本轮自己的提问）：多步图首快照里带的
				//    **上一轮答复**因此取不到（v1.37 修"气泡停在旧文本"）
				const { text, blocked, id } = lastAiMessage(
					state.messages,
					lastHumanIndex(state.messages),
				);
				// 命中禁词 = 取到的"答复"是 DB 内部输出 → 记下原因，**一个字都不上屏**（D-6）
				if (blocked) round.blockedAnswer = blocked;
				else if (text) {
					// 判据（v1.37）：
					//   · **换了一条消息**（两边 id 都有且不同）→ 无条件接受，哪怕它更短
					//     （"新答复更短就被静默丢掉、气泡停在旧文本"就是这条修掉的）；
					//   · 同一条消息 / id 拿不到 → 退回旧判据"变长才推"（流式增量语义）。
					const isNewMessage = sentId !== null && id !== null && id !== sentId;
					if (isNewMessage || text.length >= sentText.length) {
						sentText = text;
						sentId = id;
						round.answer = text;
						ev.onReply?.(text);
					}
				}
			}
		} else if (e.name === "updates" && !round.interrupt) {
			// `updates` 是 `interrupt` 的第二来源；**不用它渲染任何东西**
			const o = parseJSON(e.data) as Record<string, unknown> | null;
			const ask = interruptValue(o?.__interrupt__);
			if (ask)
				round.interrupt = makeInterrupt(ask, "updates");
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
		// ⚠️ **判出契约不符就立刻收手**（复核 D-9）：旧实现只 `finish(...)` 记一笔，
		// 然后**继续读流**到 60 秒看门狗才收口 —— 而这一轮其实已经废了，继续读既让用户白等，
		// 又让"期间再问一句"被静默吞掉。现在 `absorb` 一旦判出错误，这里马上 cancel。
		const parser = new SSEParser(absorb, (reason) =>
			finish(`单个事件超上限（${reason}）`),
		);
		const stopNow = (): void => {
			if (round.error) void reader.cancel().catch(() => {});
		};
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
			stopNow();
		}
		// ⚠️ 多余的尾字节（多字节字符被劈开）先吐出来，再 flush（复核 D-18）
		parser.push(dec.decode());
		parser.flush();
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

/**
 * 第三层兜底（§8.9.5 层③）：`GET /threads/{id}/state` 的 `tasks[].interrupts[]`。
 * ⚠️ 两处口径是 P5 复核改的，别再改回去：
 *   ① **超时独立**（`STATE_TIMEOUT_MS`，1.8 秒）—— 以前复用 `agentConfig.timeoutMs`（60 秒），
 *      `/state` 一挂就把**已经到手的答复**压 60 秒（复核实测 60079ms）。
 *   ② **`tasks[]` 为空时不再回退到 `interrupts[]`**（复核 D-15）：`interrupts[]` 是线程级字段，
 *      会把"上一轮那句反问"贴到本轮答复后面（假后端可稳定造出）。
 *      宁可漏判一次（前端还有"下一轮再判"的机会），也不要把旧问题当新问题。
 */
async function interruptFromState(
	baseUrl: string,
	thread: string,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<string | null> {
	// 超时预算取小值；调用方传进来的整轮口径不采纳（见上面 ①）
	const budget = Math.min(timeoutMs, STATE_TIMEOUT_MS);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const res = await Promise.race([
			requestOnce(`${baseUrl}/threads/${thread}/state`, jsonInit("GET"), budget, signal),
			new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), budget);
			}),
		]);
		if (!res?.ok) return null;
		const st = (await res.json()) as { tasks?: { interrupts?: unknown }[] };
		for (const task of Array.isArray(st.tasks) ? st.tasks : []) {
			const v = interruptValue(task?.interrupts);
			if (v) return v;
		}
		return null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/* ── 约定词（§8.9.5 的暗号表）────────────────────────────────────────────── */

/**
 * **后端这一问属于哪一类**（v1.91）—— 决定"前端能不能替用户答"。
 *
 * 起因（发起人 2026-10-09 的图证 + 三个只读复现探针）：他在桌宠里问
 * 「介绍一下Boost搜索引擎这个文章」，气泡回的是
 * 「我这边没定位到你说的那篇文章。换个说法？…」，可 LangSmith 里那篇明明被找到了。
 * 复现结论（`reports/_agent-repro-boost{,2,3}.mjs`，打的真后端）：
 *   · 后端 `find_by_title("Boost搜索引擎")` 命中 **2** 篇 → `interrupt` 反问
 *     「「Boost搜索引擎」对上好几篇，你说的是哪一篇？回我序号就行：1…2…」；
 *   · **答「1」→ 一篇完整的介绍**（含真实站内链接）；**答「不提供」两次 → 后端放弃，
 *     `compose_intro` 输出「我这边没定位到你说的那篇文章」**（它其实刚找到两篇）；
 *   · 而前端 `replyForAsk()` 对这种问句落到默认词「不提供」，`runRound()` 又在
 *     "只有反问、没有答复"的形态下**自动续跑** → 那句反问从来没见过访客，
 *     访客只看到最后那句假话（浏览器端复现：`reports/_choice-ask-probe.mjs`，
 *     实测自动发了 `["不提供","不提供"]`，用户随后回「1」也被翻成「不提供」）。
 *
 * 所以这里把问句分成两类，`choice` 那一类**只上屏、不替答**，用户回什么就原样回传什么。
 * ⚠️ 判据仍是"靠问句形态"（后端 `interrupt` 里还没有结构化载荷 —— 见 §8.9.5 已知脆弱点、
 *    §8.9.7 未决项 #9）；认出 `_ask_which` 的三句问法：首次反问、两次尝试之间的重问。
 */
export function classifyAsk(ask: string): "choice" | "resume-word" {
	if (/回我序号|对上好几篇|你说的是哪一篇|没认出你回的是哪篇/.test(ask)) return "choice";
	return "resume-word";
}

/**
 * 挑该回给后端哪个约定词。**只在"问句本身明确在问什么"时才推词**（复核 D-8）。
 * ⚠️ 旧实现有一条 `/要不要|需要我|要我/ → provide（需要）`，它把「要不要我按站里的常用范围
 * 替你挑几篇？」这类**宽松提问**也翻成了 `需要` —— 而契约里 `需要` 的含义是"用户明确给了
 * 字数/时长"，前端等于替用户表了态；后端人设又写着"回别的话我就当你没说"，猜错不报错、只跑偏。
 * 现在的口径：
 *   · 问句里明确出现**字数/篇幅/时长**类词，或明确问"要不要收进本子" → `provide`（收下这个活儿）；
 *   · 其余（含"不提供/不想说"这类宽松提问）→ **默认词 `不提供`**；
 *   · 推不出来一律默认，**不猜用户意图**。
 * ⚠️ **只对 `classifyAsk() === "resume-word"` 的问句调用**：`choice` 那类（问你要哪一篇）
 *    拿约定词去答是答非所问（见 `classifyAsk` 的注释与三个复现探针）。
 */
function replyForAsk(ask: string): string {
	// 后端反问"要不要收进本子"= 它准备把结果落盘，这时回 `需要` 是明确的"收下"
	if (/收进本子|收进本|存下来|记下来/.test(ask)) return agentConfig.resumeWords.provide;
	if (/多少字|字数|篇幅|多长|时长|看多久/.test(ask)) return agentConfig.resumeWords.provide;
	return agentConfig.resumeWords.default;
}

/** 造一个 `AgentInterrupt`（三个来源共用，免得漏填 `kind`） */
function makeInterrupt(ask: string, via: AgentInterrupt["via"]): AgentInterrupt {
	const kind = classifyAsk(ask);
	return { ask, via, kind, reply: replyForAsk(ask) };
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
 * 降级台词的**起头池**（必须一眼看出"这句不是模型答的"）。
 *
 * ⚠️ **v1.37 改口径（发起人 2026-09-27 的图证）**：改前降级台词与真答复**长得一模一样**
 * （都是干净的人设短句，比如「嗯，我听着呢。……你再多说一句。」），访客根本分不出
 * "她在回答"还是"她压根没接上"—— 观感就是"固定模板直接糊上来"。
 * 现在**每一句降级都先说"我这边接不上"**，再按情境补半句人设口吻的话。
 * 它仍然是人设口吻（不报错、不提服务/端口/模型/线程/错误码），但**结构上认得出**。
 */
export const FALLBACK_LEADS: string[] = [
	"我这边一时接不上话，你先说，我听着。",
	"……我这边断了，后半句没接着。你再说一遍？",
	"等一下，我这边没声了。……你刚说什么？",
];

/** 轮换游标：**保证连着两次降级不会给出一模一样的句子**（固定模板最容易被看见的地方） */
let fallbackCursor = 0;

/** 取下一个起头（按游标推进；池子只要 ≥2 条，相邻两次就一定不同） */
function nextFallbackLead(): string {
	const lead = FALLBACK_LEADS[fallbackCursor % FALLBACK_LEADS.length];
	fallbackCursor = (fallbackCursor + 1) % FALLBACK_LEADS.length;
	return lead;
}

/**
 * mock 台词（**只在降级 / 关闭时用**）：口径取自 `agent/persona-aemeath-v7.txt`
 * （第八节「安全红线」的「被要求做不该做的事」：拒绝要短、然后马上给出口）。
 * 结构 = `FALLBACK_LEADS` 里的一条起头（轮换） + 按情境挑的半句。
 * ⚠️ 这里**一个运维字样都不许有**：不提服务、端口、连接、模型、图、线程、错误码。
 * ⚠️ 也**不许出现自称词**（AI / 程序 / 模型 / 机器人 / 大脑）—— `verify:ui` 的 R-PET-11 有专门扫描。
 */
export function fallbackReply(message: string): string {
	const text = message.trim();
	let tail = "你刚才那句我先收着。";
	if (/^(在吗|在不在|在么|hi|hello|你好|嗨|喂)[?？!！。~，,]*$/i.test(text)) tail = "我在的。";
	else if (/谢谢|多谢|辛苦/.test(text)) tail = "谢什么，这不就是我的活儿嘛。";
	// 找东西 / 要推荐：给"我真的在翻"的在场感，别装傻
	else if (/推荐|找几篇|有没有|搜一下|搜下|找找|来几篇|看看.*(文章|博客)/.test(text))
		tail = "文章还没翻到手，等接上了就给你找。";
	return `${nextFallbackLead()}${tail}`;
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
 *
 * ⚠️ **探测缓存必须按 `baseUrl` 记，不能借 `confirmedBase` 当钥匙**（复核 D-13）：
 * 旧写法是 `const cachedProbe = confirmedBase === baseUrl ? probeCache : null`，而
 * `confirmedBase` **只在"成功拿到 assistant"时才会等于 `baseUrl`** —— 于是：
 *   · 成功路径：`assistantId` 缓存先在 806 行命中、直接 return，**根本走不到探测缓存**；
 *   · 失败路径：`confirmedBase` 还是旧值（空串），`cachedProbe` 永远是 `null` → **每次都真探测**。
 * 两头都够不着 = `probeCache` 是死代码，而它的代价是"服务端口开着但不响应"时，
 * **每问一句都要先白等满 2 秒探测超时**。现在按 `probeCache.base` 记，两条路径都能命中。
 */
async function ensureAssistant(
	baseUrl: string,
	timeoutMs: number,
	now: number,
): Promise<string | null> {
	if (assistantId && confirmedBase === baseUrl) return assistantId;
	const cachedProbe = probeCache?.base === baseUrl ? probeCache : null;
	const fresh = Boolean(cachedProbe && now - cachedProbe.at < PROBE_CACHE_MS);
	const reachable = fresh ? Boolean(cachedProbe?.ok) : await probe(baseUrl);
	if (!fresh) probeCache = { at: now, ok: reachable, base: baseUrl };
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
	// 只把"连接/首字节"这一档传下去；**整轮不再有固定超时**（长答复要允许继续流式收，
	// 由 `runRound` 里的"流中途卡死 60 秒"与"硬上限 300 秒"两道闸门兜底）。
	const connectTimeout = cfg.timeoutMs;
	const events: AgentStreamEvents = { onReply: opts.events?.onReply };
	// `opts.lastReply` 只用来判一件事：**用户这句是不是在回答上一轮的反问**（§8.9.5）。
	// ⚠️ 它**不再**参与"答复去重"（复核 D-5：组件把用户那句话塞进来当基线，导致
	// "答复比用户那句短"时真答复被丢、假降级）。
	// ⚠️ 判据是"上一轮反问过 **且** 这句能算作回答"——
	//   · 问的是「要不要收进本子 / 篇幅多少字」→ 三个约定词之一（`isResumeWord` 子串匹配）；
	//   · **问的是「你说的是哪一篇？（回我序号）」→ 用户这句就原样回传**（v1.91）。
	//     为什么必须原样：那一问要的是**序号或篇名**，约定词答不了；实测拿「不提供」去答两次，
	//     后端会输出「我这边没定位到你说的那篇文章」（它刚找到两篇）—— 访客看到的是一句假话。
	//     详见 `classifyAsk()` 与 `reports/_agent-repro-boost{,2,3}.mjs`。
	// 副作用（已知、可接受）：用户在"哪一篇"这一问之后改问别的，那句会被当成对它的回答发出去，
	// 后端认不出会**再问一次**（它的 `_ask_which` 本来就是两次尝试）—— 比替用户编一个词诚实。
	const lastWasChoiceAsk = Boolean(
		opts.lastReply && classifyAsk(opts.lastReply) === "choice",
	);
	const answeringInterrupt = Boolean(
		opts.lastReply &&
			(lastWasChoiceAsk ||
				isResumeWord(message, Object.values(agentConfig.resumeWords))),
	);

	let assistant: string | null = null;
	/** 失效自愈只做一次（复核 D-3），别把"服务真挂了"变成无限重试 */
	let selfHealed = false;
	/**
	 * 拿到"可用的 assistant + 一个线程"，拿不到就返回一个哨兵字符串说明为什么。
	 * ⚠️ `force` 是**自愈路径专用**：`threadAttemptAt` 那道 5 秒短缓存的本意是"建线程失败后
	 * 别连续撞"，但自愈时我们已经判出"旧线程失效、必须新建"，被那道缓存挡住就会变成
	 * "清了缓存却建不出新线程" —— 自愈等于没做（本脚本回归实测踩到）。
	 */
	const acquire = async (force = false): Promise<string | null> => {
		assistant = await ensureAssistant(base, cfg.timeoutMs, Date.now()).catch(
			() => null,
		);
		debugLog("availability", {
			base,
			graph: agentConfig.graphId,
			hasAssistant: Boolean(assistant),
		});
		if (!assistant) return null;
		// 建线程（首次）——失败也算"Agent 不可用"，按契约降级。
		// ⚠️ **必须写回模块级的 `threadId`**（P5 复核的连带发现，本脚本回归钉住）：
		// 旧实现只往一个**函数内局部**变量里放线程 id，模块级的 `threadId` 除了 `resetSession()`
		// 之外**一个赋值都没有** → 每问一句都 `POST /threads` 建一个新线程，
		// 会话上下文根本没接上（契约 §8.9.1 要求"一个会话一个线程、由前端持有"）。
		// 这个 bug 以前被 D-3 的"永久降级"挡住看不出来，修完自愈才显形。
		if (!threadId) {
			// 建线程失败后 5 秒内不再重试：探活已经说了"不可用"，连续几个问题都去撞一遍没意义
			// （用户下一次提问仍会重新探活，§8.9.6 第 4 条要求"能连续降级、能重试"）。
			if (!force && Date.now() - threadAttemptAt < PROBE_CACHE_MS)
				return "__no-thread__";
			threadAttemptAt = Date.now();
			try {
				threadId = await createThread(base, cfg.timeoutMs);
			} catch (err) {
				return `__thread-error__:${err instanceof Error ? err.message : "未知"}`;
			}
			// ⚠️ **建成功要把时间戳清掉**（复核 D-3 的连带 bug，本脚本回归实测踩到）：
			// 旧写法只记"什么时候尝试过"，于是一次成功建线程之后 5 秒内，任何"线程失效要新建"
			// 的路径都会被这道缓存挡住 → 清了缓存却建不出新线程，**自愈等于没做**。
			// 这道缓存的本意只是"**失败**之后别连续撞"，所以只该在失败分支里留着。
			threadAttemptAt = 0;
		}
		return assistant;
	};
	{
		const got = await acquire();
		// 调用方主动取消（关聊天框 / 切页）：不降级、不报错，交给调用方丢掉这个结果
		if (signal?.aborted)
			return done({
				text: "",
				status: "fallback",
				fromMock: false,
				reason: "aborted",
			});
		if (!got) return mock("Agent 不可达，或没有配置的图");
		if (got === "__no-thread__") return mock("建线程失败（短缓存内不重试）");
		if (got.startsWith("__thread-error__"))
			return mock(`建线程失败：${got.slice("__thread-error__:".length)}`);
	}

	// ⚠️ **首轮就要判"这句是不是在回答 `interrupt`"**（复核 D-2）：是的话，按 §8.9.5
	// 「**用 `command` 而不是 `input`**（两者互斥）」发 `command.resume` —— 而不是把用户那句
	// 当新消息用 `input` 发出去。旧实现只在**同一轮内**拿到过"无答复的 interrupt"时才会走
	// `command`，而 `blog_agent` 的形态 A（先答复再反问）是**跨轮**的：用户隔一轮回答时，
	// 那句被当成新 `input` 发出。真后端今天容忍这种写法（复核实测 200 + interrupt 被消费），
	// 但那是**没写进契约的宽容行为**，后端一收紧这条链路就静默失效 —— 所以照契约发。
	// ⚠️ `choice` 那一问（"你说的是哪一篇"）回传**用户原话**，其余按暗号表翻成约定词
	const firstRoundResume = answeringInterrupt
		? lastWasChoiceAsk
			? message.trim()
			: resumeWordFor(message)
		: null;
	let payload: Record<string, unknown> = firstRoundResume
		? { command: { resume: firstRoundResume } }
		: { input: { messages: [{ type: "human", content: message }] } };

	for (let round = 0; round <= MAX_RESUME_ROUNDS; round++) {
		// 每轮都现取一次"当前有效的 thread/assistant"：自愈之后这两个缓存已经换过值了，
		// 拿闭包外的旧快照重试等于用失效的 id 再撞一次（本脚本回归实测踩到过）。
		const liveThread = threadId;
		const liveAssistant = assistant;
		if (!liveThread || !liveAssistant) return mock("会话状态不完整");
		const r = await runRound(
			base,
			liveThread,
			payload,
			liveAssistant,
			connectTimeout,
			signal,
			events,
		);
		debugLog("round", {
			round,
			status: r.status,
			error: r.error,
			interruptVia: r.interrupt?.via,
			answerChars: r.answer.length,
			blockedAnswer: r.blockedAnswer,
		});
		if (signal?.aborted || r.error === "aborted") {
			return done({
				text: "",
				status: "fallback",
				fromMock: false,
				reason: "aborted",
			});
		}
		// ③ **失效即自愈**（复核 D-3 + §8.9.7 未决项 #5「失效即降级/新建」）：
		//   `thread_id` / `assistant_id` 都是**缓存**，而后端一重启两者就都失效（实测都回 404）。
		//   旧实现遇到 4xx 直接降级，于是**永久降级到用户刷新页面为止**（`resetSession()` 没有调用方）。
		//   现在的口径：4xx（尤其 404）→ 清缓存 → 重新探活/建线程 → **重试一次**；仍失败才降级。
		if (r.status >= 400 && !selfHealed) {
			selfHealed = true;
			resetSession();
			debugLog("self-heal", { status: r.status, reason: r.error });
			// `force=true`：自愈要的是"重新建一个线程"，**不能被建线程失败那道 5 秒短缓存挡住**
			const got = await acquire(true);
			if (signal?.aborted)
				return done({
					text: "",
					status: "fallback",
					fromMock: false,
					reason: "aborted",
				});
			if (!got) return mock("Agent 不可达，或没有配置的图");
			if (got === "__no-thread__") return mock("建线程失败（短缓存内不重试）");
			if (got.startsWith("__thread-error__"))
				return mock(`建线程失败：${got.slice("__thread-error__:".length)}`);
			// 重试一次**同一个 payload**：上一轮根本没跑起来（4xx），谈不上"重放半截答复"；
			// `round--` 让这一轮不占用续跑配额（`MAX_RESUME_ROUNDS` 是给 interrupt 用的）
			round--;
			continue;
		}
		if (r.status === 0 || r.status >= 500)
			return mock(`请求失败：${r.error ?? r.status}`);
		if (r.status >= 400) return mock(`契约不符：${r.error ?? r.status}`);
		if (r.error) return mock(`契约不符：${r.error}`);
		// 取到的"答复"命中了禁词表（DB 内部输出）→ 一个字都不上屏，按降级处理（D-6）
		if (r.blockedAnswer)
			return mock(`答复命中禁词闸门：${r.blockedAnswer}`);

		// ③ 三层检测的第三层：**只在"前两层没有信号、且本轮答复为空"时才问一次
		//    `GET .../state`**（复核 D-4）。为什么不能在正常轮次里无条件多打一次：
		//    它是纯开销（正常一轮 7 个请求里有它一个），而且它挂在关键路径上 —— 一旦挂住，
		//    用户要等满它的超时才能看到那句**早就到手**的答复（实测 60079ms）。
		//    有答复的轮次根本不需要判 interrupt（形态 A 的答复+反问都从 `values` 里拿）。
		if (!r.interrupt && !r.answer.trim()) {
			const ask = await interruptFromState(base, liveThread, cfg.timeoutMs, signal);
			if (ask) r.interrupt = makeInterrupt(ask, "state");
		}
		// ④ 命中 `interrupt`，分两种形态（§8.9.5 描述了前一种，第二种是 P5-1 接线时实测到的，
		//    P5 复核又独立复现了一次；两种形态都真实存在，别只按文档写的那种实现）：
		if (r.interrupt) {
			// 形态 A（**先给答案再反问**，`blog_agent` 的检索链路）：最后一个 `values` 里同时有
			//   482~522 字的文章列表与 `__interrupt__`「要不要我收进本子？」。这时**这一轮已经有答复了**，
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
			//   ⚠️ **例外：`choice` 那一问（"你说的是哪一篇"）绝不自动续跑**（v1.91）——
			//   它要的是序号/篇名，前端编不出正确答案；替答两次的实测后果是后端输出
			//   「我这边没定位到你说的那篇文章」（而它刚找到两篇），访客永远看不到那句反问。
			//   所以这里直接把反问交出去，用户答什么下一轮原样回传。
			if (r.interrupt.kind === "choice" || round === MAX_RESUME_ROUNDS) {
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
		return done({
			// 上游失控的长答复：截断到可读长度并**明说**（D-16 的第二道闸；真实答复碰不到它）
			text:
				r.answer.length > MAX_RENDER_CHARS
					? `${r.answer.slice(0, MAX_RENDER_CHARS)}\n${TRUNCATED_HINT}`
					: r.answer,
			status: "answer",
			fromMock: false,
		});
	}
	// 理论到不了这里（循环里每轮都有 return / continue），保险起见仍按降级处理
	return mock("续跑次数用尽");
}
