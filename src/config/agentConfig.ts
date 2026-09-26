import type { AgentConfig } from "@/types/agentConfig";

/**
 * 本机开发默认地址（`langgraph dev`）：环境变量没设时的唯一回落值。
 * 单独抽成常量是为了让"默认值"只有一处，改的时候不会漏（注释、文档、脚本都引它）。
 */
export const DEFAULT_AGENT_BASE_URL = "http://127.0.0.1:2024";

/**
 * 解析 Agent 服务地址：**构建期环境变量优先**，没设才回落到本机。
 * 为什么要有它：Agent 之后是跑在**云服务器**上的（不是访客本机），
 * 上线只该在构建环境里给一个变量，而不是改代码再提交一次。
 * `PUBLIC_` 前缀是 Astro/Vite 的约定：只有它开头的变量会被注入到客户端产物里。
 */
function resolveAgentBaseUrl(): string {
	// ⚠️ 用 `as` 收窄而不是直接点出来：`import.meta.env` 在类型上只有一组内建字段，
	//    自定义变量要走索引访问，否则 `--isolatedDeclarations` 下的类型断言会炸。
	const env = (import.meta as { env?: Record<string, string | undefined> }).env;
	const fromEnv = env?.PUBLIC_AGENT_BASE_URL;
	const url = typeof fromEnv === "string" ? fromEnv.trim() : "";
	return url || DEFAULT_AGENT_BASE_URL;
}

/**
 * 「博客前端 ↔ Agent 服务」接口契约配置（P5-0 冻结，需求 R-AGT-02 / R-AGT-07）
 * ============================================================================
 * 契约正文（端点、SSE 事件、最终答复取法、interrupt 约定、降级规则）在
 * **`ARCH.md` §8.9「Agent 接口契约（P5-0 冻结）」**——这个文件只放"能被改的值"，
 * 不放任何判断逻辑（逻辑在 `src/utils/agent-client.ts`）。改契约口径请连带改那节与
 * `scripts/verify-agent.mjs`。
 *
 * ⚠️ **P5-1 起本文件参与运行时**：桌宠的对话走 `src/utils/agent-client.ts`，
 *    它读的就是这里的值。`enable: true` 时每个会话会现查 `assistant_id`、建一个线程；
 *    `enable: false` 时**一个请求都不发**，直接走本地 mock（`petConfig.mockReplies`）。
 *
 * 怎么改（每个字段都在下面单独标了）：
 *   - 总开关     → `enable`
 *   - 换服务地址 → `baseUrl`
 *   - 换默认图   → `graphId`（可选值见 `knownGraphs`）
 *   - 觉得等太久 → `timeoutMs`
 *   - 换约定词   → `resumeWords`（**改了要同步后端 prompt 与 §8.9**，三个词是对好的暗号）
 *   - 想看请求细节 → `debug: true`（上线前记得改回 false）
 * ============================================================================
 */
export const agentConfig: AgentConfig = {
	/**
	 * 总开关。
	 * **true**（P5-2 起）：桌宠对话走真实 Agent（`langgraph dev` / 上线后的网关），
	 * 连不上 / 超时 / 契约不符时由 `agent-client.ts` 按 §8.9.6 **降级**到 mock，不报错。
	 * **false**：一个网络请求都不发，完全走本地 mock 台词。
	 * 改成 true 之前先确认 `pnpm verify:agent` 是全绿或明确 SKIP。
	 */
	enable: true,

	/**
	 * Agent 服务地址（**构建期可用环境变量覆盖，不要把本机地址写死成唯一来源**）。
	 * ============================================================================
	 * 取值顺序：
	 *   ① `import.meta.env.PUBLIC_AGENT_BASE_URL`（Astro 只把 `PUBLIC_` 前缀的变量注入客户端）；
	 *   ② 没设 → 回落到本机开发地址 `http://127.0.0.1:2024`（`langgraph dev` 的默认端口）。
	 *
	 * 怎么用：
	 *   · **本地开发**：什么都不用设 → 打本机 2024（就是现在的行为）。
	 *   · **上线（推荐：同源反代）**：构建时给 `PUBLIC_AGENT_BASE_URL=/api/agent`
	 *     （Nginx 把 `/api/agent/` 反代到 `127.0.0.1:2024`）。
	 *     为什么推荐同源反代：
	 *       ① **没有 CORS 问题** —— 现在 `langgraph dev` 裸跑的 `ACAO` 是 `*`（见 B-14），
	 *          同源之后浏览器根本不发预检，前端也不必依赖对方改 CORS；
	 *       ② SSE 只要在 Nginx 上 `proxy_buffering off`（`ARCH.md` §12.2 已经写好这段），
	 *          不用给前端加任何东西；
	 *       ③ 后端端口不外露，限流/鉴权将来都落在这一层（B-14 的落点）。
	 *   · **独立域名/网关**：也可以直接给完整 URL（`https://agent.example.com`），
	 *     或者指向 prd R-AGT-02 规划的那个网关 —— 前提是它实现了 §8.9 的端点序列。
	 *
	 * ⚠️ **前端只依赖这一个值**：直连（本机 2024）与反代（同源 `/api/agent`）两种形态
	 *    走的是同一份代码，换形态只需要改这个变量/环境变量，不用改任何别的文件。
	 * ⚠️ 不要加尾斜杠（适配层会兜底去掉，但配置里保持干净）。
	 * ============================================================================
	 */
	baseUrl: resolveAgentBaseUrl(),

	/**
	 * 默认用哪张图。
	 * 取值必须是 `agent_-for_-blog/langgraph.json` 的 `graphs` 键之一（见 `knownGraphs`）。
	 * 为什么默认 `blog_agent`：它是唯一会按意图自己路由的主图（闲聊/检索/排行/推荐都走它），
	 * 前端只需要一个入口；等 P5 要做"只推荐"的独立入口时再显式传别的图。
	 * ⚠️ 改图**必须重启 `langgraph dev`**才生效（新增/删除图也是）——契约陷阱之一。
	 */
	graphId: "blog_agent",

	/**
	 * **连接/首字节**超时（毫秒）——**不是**"整轮超时"，两者在适配层里是分开的。
	 * ============================================================================
	 * 它只管三件事：`GET /ok`（另有一个更短的 2 秒探测超时）、建线程、
	 * **以及一次流式请求"拿到响应头之前"的那段时间**。
	 * 60 秒的依据：本机实测闲聊轮 3~8 秒、检索/推荐轮首字节一般 1~5 秒；
	 * 给到 60 秒是为了兼容"服务在排队/冷启动"，而不是为了掐断答复。
	 *
	 * ⚠️ **长答复不受它管**（P5-1 实测教训）：检索轮总耗时会抖到 30~120 秒，
	 *    如果拿一个 60 秒的绝对超时把整条流掐断，真机上会出现"聊到一半断掉"。
	 *    适配层的实际口径是三个**分开**的闸门（`agent-client.ts` 顶部常量）：
	 *      · 连接/首字节：`min(this, 20s)` —— 拿不到响应头就别耗着；
	 *      · 流中途卡死：60 秒**没有任何新 chunk** 才判失败（LLM 正常几秒一个 chunk）；
	 *      · 硬上限：300 秒（兜底，防"永远挂着"；与 Nginx 的 `proxy_read_timeout` 对齐）。
	 *    所以这个值调大调小都**不会**让答复被截断，只会影响"连不上/不响应"时多等多久。
	 */
	timeoutMs: 60000,

	/**
	 * 已知存在的 4 张图（2026-09-26 实测 `POST /assistants/search` 的 `graph_id` 去重结果）。
	 * 契约测试会断言这 4 张都能在服务上找到；契约文档 §8.9 引用同一份清单。
	 * 后端加/删图时改这里（**同时重启服务**）。
	 */
	knownGraphs: [
		"blog_agent",
		"recommended_agent",
		"collect_agent",
		"extend_agent",
	],

	/**
	 * 「推荐链路」续跑时回给后端 `interrupt()` 的三个约定词。
	 * 后端在 `recommended_agent` 的 `collect_user_info` 节点会 `interrupt()` 问"篇幅大概多少字"，
	 * 前端第二轮用 `command: { resume: <这里的某个词> }` 续跑。
	 * ⚠️ 这是**对好的暗号**：改词必须同时改后端 `agent_-for_-blog` 的 prompt 与 `ARCH.md` §8.9，
	 *    否则后端会把它当普通回答处理（不会报错，但推荐会跑偏）。
	 */
	resumeWords: {
		/** 默认答案：让后端按站内常用字数范围替用户挑（用户没明说字数时用它） */
		default: "不提供",
		/** 用户明确给了字数/时长要求 */
		provide: "需要",
		/** 用户明确表示不需要后端代挑 */
		decline: "不需要",
	},

	/**
	 * 契约不符 / 连不上 / 超时 / 返回空时，是否回落到本地 mock 台词。
	 * **必须保持 true**（prd R-AGT-03 的硬要求：没有后端时不报错、不弹技术错误）。
	 * 只有"正在调试契约、想让失败显形"时才临时改 false。
	 */
	fallbackToMock: true,

	/**
	 * 调试开关：把每次请求的 URL / 状态码 / SSE 事件名序列打到 console。
	 * 默认 false；`verify-agent.mjs` 与本地排查时用。**上线前确认是 false**
	 * （事件序列里会带 thread_id / run_id，不适合给访客看到）。
	 */
	debug: false,
};
