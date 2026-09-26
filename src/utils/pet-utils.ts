/**
 * 桌宠的状态表与常量（R-PET-01 / R-PET-02）
 * ============================================================================
 * 单独放在 utils 里，是为了让**组件与验收脚本共用同一份事实**：
 * `scripts/verify-ui.mjs` 会读这张表来核对"九个状态都能上、帧数对得上"，
 * 免得验证脚本里再抄一份、两边慢慢走样。
 *
 * 图集：8 列 × 9 行、单格 144×156（`src/assets/images/pet/pet-aemeath.webp`）。
 *
 * ⚠️ 第 2 行（`running-left`）**用不到**：源仓库给这一行标了 `mirrored: true`，
 * 但出货图集里它和第 1 行逐像素相同（非透明像素数、包围盒、逐格偏移三项全同），
 * 就是一份副本。左走用第 1 行 + `scaleX(-1)`，朝向才对。
 *
 * 类型写法说明：状态名与规格分开声明（而不是从表里 `keyof typeof` 反推），
 * 这样 `PET_STATES[name].once` / `.dy` 这类可选字段才不用每处都做类型收窄。
 */

/** 一个状态在图集里的位置与播放参数 */
export interface PetStateSpec {
	/** 图集行号（0 起） */
	row: number;
	/** 该行实际有内容的格子数 */
	frames: number;
	/** 播放帧率 */
	fps: number;
	/** 一次性动画：播完就交还给 decide() */
	once?: boolean;
	/** 素材底边不齐时的补偿（电子幽灵屏幕比小人矮一截） */
	dy?: number;
}

export type PetStateName =
	| "idle"
	| "running-right"
	| "running-left"
	| "waving"
	| "jumping"
	| "failed"
	| "waiting"
	| "running"
	| "review";

/** 行 → 状态 */
export const PET_STATES: Record<PetStateName, PetStateSpec> = {
	idle: { row: 0, frames: 6, fps: 6 },
	"running-right": { row: 1, frames: 8, fps: 14 },
	"running-left": { row: 1, frames: 8, fps: 14 },
	waving: { row: 3, frames: 4, fps: 7, once: true },
	jumping: { row: 4, frames: 5, fps: 13, once: true },
	failed: { row: 5, frames: 8, fps: 7, dy: -3 },
	waiting: { row: 6, frames: 6, fps: 5, dy: -3 },
	running: { row: 7, frames: 6, fps: 12 },
	review: { row: 8, frames: 6, fps: 9, once: true },
};

/** 九个状态的展示名（文档与验收脚本用，别在 UI 里直接显示英文键名） */
export const PET_STATE_LABELS: Record<PetStateName, string> = {
	idle: "待机",
	"running-right": "右走",
	"running-left": "左走",
	waving: "招呼",
	jumping: "跳跃",
	failed: "困惑",
	waiting: "屏幕待机",
	running: "执行任务",
	review: "完成反馈",
};

/** 手感常量（px / px每s / px每s²） */
export const PET_TUNING = {
	gravity: 2600,
	walkSpeed: 58,
	floorGap: 10,
	edge: 12,
	workLinger: 1400,
	safeRight: 24,
	floatSafe: 96,
	/**
	 * 悬浮基准线 = 视口高度 × 这个比例（定位的是**宠物中心**）。
	 * 0.52 让宠物大致落在"首屏视觉中心偏上"的位置，既不压正文第一屏的标题，
	 * 也不至于飘到看不出来（R-PET-06）。
	 */
	hoverLineRatio: 0.52,
	/**
	 * 悬浮 / 飞行时距地面**至少**留的高度（px）——这条是"不贴地"的硬约束：
	 * 目标点、鼠标拖放、窗口缩放都会被它夹回，免得悬浮模式看起来像贴地站着。
	 */
	airMinGap: 48,
	/** 悬浮模式下键盘 / 菜单「跟过来」的位移倍速（飘比走快一点，但仍是缓动位移） */
	glideSpeedFactor: 1.6,
	/** 一次飞行的弧线最高抬升（px）：`arc = 该值 × sin(πt)`，让直线插值看起来像"飘" */
	flyArc: 44,
	/** 飞行途中的姿态：最大倾角（deg）与最大放大比例（1 + 该值） */
	flyTilt: 7,
	flyZoom: 0.06,
} as const;

/** 图集列数（8 列 × 9 行，见文件头） */
export const PET_COLS = 8;
/** 图集行数 */
export const PET_ROWS = 9;
/** 单格尺寸（缩放前的逻辑像素） */
export const PET_CELL = { width: 144, height: 156 } as const;
