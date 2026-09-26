import type { AgentConfig } from "@/types/agentConfig";

/**
 * 「博客前端 ↔ Agent 服务」接口契约配置（P5-0 冻结，需求 R-AGT-02 / R-AGT-07）
 * ============================================================================
 * 契约正文（端点、SSE 事件、最终答复取法、interrupt 约定、降级规则）在
 * **`ARCH.md` §8.9「Agent 接口契约（P5-0 冻结）」**——这个文件只放"能被改的值"，
 * 不放任何判断逻辑。改契约口径请连带改那节与 `scripts/verify-agent.mjs`。
 *
 * ⚠️ 本文件在 P5-0 阶段**不参与运行时**：`enable` 保持 false，桌宠仍走
 *    `petConfig.mockReplies`。真正的接线（`src/utils/pet-agent-client.ts`）是 P5-1 起的事。
 *
 * 怎么改（每个字段都在下面单独标了）：
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
	 * P5-0 阶段保持 **false**：桌宠不发任何请求，走 `petConfig.mockReplies`。
	 * P5-1 接线完成后才改成 true——**改成 true 之前先确认 `pnpm verify:agent` 是全绿或明确 SKIP**，
	 * 否则前端会拿到"服务没起"的失败路径（虽然会降级，但没必要）。
	 */
	enable: false,

	/**
	 * Agent 服务地址。
	 * 本地开发 = `langgraph dev` 的默认地址（**不要加尾斜杠**，也不带 `/api` 前缀）。
	 * 上线后改这里——候选见 `ARCH.md` §8.9「未决项」：现在是直连 127.0.0.1:2024，
	 * 而 prd R-AGT-02 原本写的是"只暴露一个网关"。两条路线的取舍还没定，先按直连冻结。
	 */
	baseUrl: "http://127.0.0.1:2024",

	/**
	 * 默认用哪张图。
	 * 取值必须是 `agent_-for_-blog/langgraph.json` 的 `graphs` 键之一（见 `knownGraphs`）。
	 * 为什么默认 `blog_agent`：它是唯一会按意图自己路由的主图（闲聊/检索/排行/推荐都走它），
	 * 前端只需要一个入口；等 P5 要做"只推荐"的独立入口时再显式传别的图。
	 * ⚠️ 改图**必须重启 `langgraph dev`**才生效（新增/删除图也是）——契约陷阱之一。
	 */
	graphId: "blog_agent",

	/**
	 * 单次请求超时（毫秒）。
	 * 覆盖"建线程"与"至少收到首字节"；推荐链路会发两轮，**每轮各计一次**。
	 * 60 秒的依据：本机实测闲聊轮约 3~8 秒、推荐两轮合计 40~90 秒（要跑检索 + 多轮 LLM），
	 * 所以单轮 60 秒是"够宽但不至于永远挂着"的值。嫌慢就调小，但别小于 15 秒。
	 */
	timeoutMs: 60000,

	/**
	 * 已知存在的 4 张图（2026-09-26 实测 `POST /assistants/search` 的 `graph_id` 去重结果）。
	 * 契约测试会断言这 4 张都能在服务上找到；契约文档 §8.9 引用同一份清单。
	 * 后端加/删图时改这里（**同时重启服务**）。
	 */
	knownGraphs: ["blog_agent", "recommended_agent", "collect_agent", "extend_agent"],

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
