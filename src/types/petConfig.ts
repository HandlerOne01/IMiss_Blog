/**
 * 桌宠配置类型（需求见 prd.md R-PET-01 ~ R-PET-05，设计见 ARCH.md §7）
 *
 * 注意：这个文件是**类型真身**，`src/types/config.ts` 只是 re-export barrel
 * （和 `sidebarConfig` 一样，见 ARCH.md §14.3 T1 —— 改错文件不生效）。
 */

/** 宠物与 Agent 的对接参数（R-AGT-03） */
export interface PetAgentConfig {
	/** false = 纯本地 mock，一个请求都不发（P3 阶段就是 false） */
	enable: boolean;
	/** 网关地址；空字符串 = 同源（"/api"），P5 起才有服务端 */
	apiBase: string;
	/** 单次对话超时（毫秒） */
	timeoutMs: number;
	/** 输入框允许的最大字数（与后端上限保持一致） */
	maxLength: number;
}

export interface PetConfig {
	/** 总开关：false 时整个组件不渲染（R-PET-01） */
	enable: boolean;
	/** 移动端是否隐藏（R-PET-01） */
	hideOnMobile: boolean;
	/** 移动端断点（px），与 Tailwind 的 md 对齐 */
	mobileBreakpoint: number;
	/** 精灵缩放，0.6 ~ 1.5（1 = 单格 144×156 的原始像素） */
	scale: number;
	/** 首次出场靠哪一侧（"random" 则随机） */
	startSide: "left" | "right" | "random";
	/** 层级：必须**低于**浮动按钮与弹层（R-PET-05），模板里返回顶部是 100 上下 */
	zIndex: number;
	/** 无操作多久进入「屏幕待机」，单位秒（默认 45） */
	idleSecondsToSleep: number;
	/** 首次出场台词（R-PET-02：切页/首次出场用） */
	greeting: string;
	/** 随机台词池（单击、说句话时用） */
	lines: string[];
	/** 本地 mock 回复（没有后端时的兜底，R-AGT-03） */
	mockReplies: string[];
	agent: PetAgentConfig;
}
