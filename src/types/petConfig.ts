/**
 * 桌宠配置类型（需求见 prd.md R-PET-01 ~ R-PET-06，设计见 ARCH.md §7）
 *
 * 注意：这个文件是**类型真身**，`src/types/config.ts` 只是 re-export barrel
 * （和 `sidebarConfig` 一样，见 ARCH.md §14.3 T1 —— 改错文件不生效）。
 */

/** 桌宠的运动模式（R-PET-06） */
export type PetMovementMode = "float" | "fixed" | "ground";

/** 运动模式与手感参数（R-PET-06；改 `petConfig.movement.mode` 即可切换，不用改代码） */
export interface PetMovementConfig {
	/**
	 * 三档运动模式（默认 `"float"`）：
	 * - `"float"`：悬浮 + 偶尔飞到视口内的随机位置（发起人要的默认形态）
	 * - `"fixed"`：固定——不悬浮、不飞行、拖动松手也不落地
	 * - `"ground"`：贴地——在地面行走、松手受重力落地（P3 的原始行为）
	 */
	mode: PetMovementMode;
	/** 悬浮上下浮动幅度（px），围绕悬浮基准线正弦摆动 */
	hoverAmplitude: number;
	/** 悬浮浮动周期（毫秒） */
	hoverPeriodMs: number;
	/** 两次飞行之间的随机间隔（毫秒），`[最小, 最大]` */
	flyIntervalRange: [number, number];
	/**
	 * 单次飞行时长（毫秒），`[最短, 最长]`（R-PET-07 起改成区间）
	 *
	 * ⚠️ 原来是单值 `flyDurationMs: 2600` —— "一次飞 2.6 秒、位移却有好几百像素"，
	 * 发起人反馈"飞得太快太远"。现在时长与位移都成对收紧（见 `PET_TUNING.flyDistanceRange`）。
	 */
	flyDurationRange: [number, number];
	/** `prefers-reduced-motion: reduce` 时是否也禁止飞行（默认 true = 静止悬浮） */
	flyRespectReducedMotion: boolean;
}

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

/**
 * 聊天框的几何、历史与「思考中」口径（R-PET-11）
 * ============================================================================
 * 发起人 2026-09-27 第五轮反馈（附图）：「输入框不应该在下面吗」「还看不到之前的聊天」
 * 「不应该是左右边吗」「这聊天框是不是小了的」→ 全部落成这里可改的值，
 * 组件（`AemeathPet.astro`）与验收脚本（`scripts/verify-ui.mjs` 的 R-PET-11 段）
 * 读同一份事实，免得"文档说 340、实现是 260"这种漂移。
 */
export interface PetChatConfig {
	/** 面板宽度（px）。窄屏按可用空间收窄，但不会小于 `minWidth` */
	width: number;
	/** 面板高度（px）。视口更矮时会被夹到 `vh - 2 × 安全边距` */
	height: number;
	/**
	 * 收窄下限（px）：两侧可用宽度都低于它时不再硬塞在左右，
	 * 改走"宠物上方/下方"的兜底摆位（明确兜底，不是静默溢出）。
	 */
	minWidth: number;
	/** 高度下限（px）：视口极矮时的兜底高度（内部仍可滚） */
	minHeight: number;
	/** 历史区最多保留多少条（超出丢最旧的，防长聊把 DOM 撑爆） */
	historyLimit: number;
	/**
	 * 超过这个字数才折叠 + 给「展开全文」。
	 * ⚠️ 不能定小：实测真后端长答复 439~496 字，而 `verify:ui` 的 R-AGT-07 用
	 * **500 字**答复断言"气泡可滚、首行可见"——阈值一旦低于 500，那条断言会因为
	 * "被折叠所以滚不动"而变红（折叠与滚动是**互相抵消**的两种长答复策略）。
	 */
	collapseChars: number;
	/** 「思考中」轮换的短句（**至少 3 条**：写死一句会让长回合看起来像卡住） */
	thinkingLines: string[];
	/** 思考中短句的轮换间隔（毫秒） */
	thinkingRotateMs: number;
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
	/**
	 * 手机档缩放（视口 ≤ `mobileBreakpoint - 1` 时生效），0.4 ~ 1.5
	 *
	 * ⚠️ 与 `scale` 是**两档并存**，不是二选一：组件把两个值都写成 CSS 变量
	 * （`--pet-scale-desktop` / `--pet-scale-mobile`），由 `pet.css` 的媒体查询
	 * 决定哪一档盖到 `--pet-scale-active`。以前组件只写一个内联 `--pet-scale`，
	 * 内联变量赢过媒体查询，于是 `pet.css` 里那段手机档规则一直不生效。
	 */
	mobileScale: number;
	/**
	 * 「关闭」档的比例系数（0 < x < 1，默认 0.5）
	 *
	 * 菜单最后一项（文案：「缩小」）**不是真的关闭**，而是把当前档位再乘上这个系数
	 * （比待机还小一只），双击她本體恢复原档位。见 prd.md R-PET-12。
	 */
	miniFactor: number;
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
	/** 运动模式与手感参数（R-PET-06，默认悬浮 + 偶尔飞行） */
	movement: PetMovementConfig;
	/** 聊天框的几何 / 历史 / 思考中口径（R-PET-11） */
	chat: PetChatConfig;
	agent: PetAgentConfig;
}
