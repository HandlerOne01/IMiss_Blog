/**
 * Agent 接口契约配置类型（需求见 prd.md R-AGT-02 / R-AGT-07，契约见 ARCH.md §8.9）
 *
 * 注意：这个文件是**类型真身**，`src/types/config.ts` 只是 re-export barrel
 * （和 `petConfig` / `sidebarConfig` 一样，见 ARCH.md §14.3 T1 —— 改错文件不生效）。
 *
 * ⚠️ P5-0「契约冻结」的边界：**这里只有配置，不含任何业务逻辑**。
 *    对话/接线代码见 P5-1 起的 `src/utils/pet-agent-client.ts`（尚未实现）。
 */

/** 「推荐链路」续跑时的三个约定词（R-AGT-07，对应后端 `interrupt()` 的询问） */
export type AgentResumeWord = "不提供" | "需要" | "不需要";

export interface AgentConfig {
	/** 总开关：false = 一个请求都不发，直接走 mock（P5-0 阶段就是 false） */
	enable: boolean;
	/** Agent 服务地址（LangGraph Server）。默认本地 `langgraph dev`；上线改为网关同源地址 */
	baseUrl: string;
	/** 默认用哪张图。取值必须是 `agent_-for_-blog/langgraph.json` 里 graphs 的键 */
	graphId: string;
	/** 单次请求超时（毫秒）。覆盖建线程与至少首字节；推荐链路两轮各自计时 */
	timeoutMs: number;
	/** 已知存在的 4 张图（契约测试与契约文档共用这一份清单，别在别处硬编码） */
	knownGraphs: string[];
	/** 「推荐链路」续跑时回给 `interrupt()` 的三个约定词（详见 ARCH.md §8.9 的 interrupt 约定） */
	resumeWords: {
		/** 默认答案：让后端按站内常用字数范围自己挑（最省事、最不容易卡住） */
		default: AgentResumeWord;
		/** 用户明确要指定字数区间 */
		provide: AgentResumeWord;
		/** 用户明确不要后端代挑 */
		decline: AgentResumeWord;
	};
	/** 契约不符 / 连不上 / 超时 / 返回空时，是否回落到本地 mock 台词（**必须 true**，R-AGT-03） */
	fallbackToMock: boolean;
	/**
	 * **线程失效重建时，把最近几轮对话重放给后端**（v1.99 新增，决定见 `ARCH.md` §8.9.7 #5/#10）。
	 *
	 * 背景：后端的线程是**内存 checkpoint**，`langgraph dev` 一重启，旧 `thread_id` 就 404；
	 * 前端会"清缓存 + 新建线程 + 重试一次"（D-3 的自愈），但**新线程没有任何上下文** ——
	 * 用户刚说过的话在它眼里不存在（旧口径："接受忘掉，但不许永久降级"）。
	 * 现在改成：重建线程时把**最近 N 轮**（人/AI 交替）与新问题**一起**放进 `input.messages`。
	 *
	 * ⚠️ **只在自愈那条路径上重放**：正常轮次里线程自己就带着上下文，
	 *    每轮都重放会把同一段历史反复追加进线程状态（上下文翻倍、token 白烧）。
	 */
	contextReplay: {
		/** 开关：false = 回到旧口径（重建线程后从零开始） */
		enable: boolean;
		/** 重放**最近几轮**（1 轮 = 1 问 + 1 答；实际消息数最多 = 2 × 这个值） */
		rounds: number;
		/** 每条重放消息的**截断上限**（字符）：长答复（检索轮 480+ 字）没必要整段带上 */
		maxCharsPerMessage: number;
	};
	/** 调试：把每次请求的 URL / 状态码 / 事件名序列打到 console（**上线前关掉**） */
	debug: boolean;
}
