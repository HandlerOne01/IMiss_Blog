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
	/** 调试：把每次请求的 URL / 状态码 / 事件名序列打到 console（**上线前关掉**） */
	debug: boolean;
}
