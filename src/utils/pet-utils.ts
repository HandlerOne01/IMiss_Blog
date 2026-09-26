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

/**
 * 飞行途中用的姿态（R-PET-07）
 * ============================================================================
 * **九行里没有专门的"飞"行**——逐行裁出来看过（对照图 `reports/pet-atlas-rows.png`）：
 *   row0 站立待机 / row1·row2 走路（互为镜像）/ row3 单手挥 / **row4 双臂平展、双脚离地**
 *   / row5 叉眼困惑 / row6 电子幽灵屏幕 / row7 戴眼罩干活 / row8 生气。
 * 唯一有"悬空"形状的是 **row4（`jumping`）**：双臂张开、身体上抬、没有着地感 ——
 * 所以飞行途中借它当悬浮姿态，并且**循环播放**（`jumping` 本身是 `once` 的一次性动画，
 * 而一次飞行有 4~6 秒，冻在最后一帧会显得很呆）。
 * 复用它而不是新加第 10 个状态，是为了守住"九行 = 九状态"这条对应关系
 * （组件与验收脚本都靠它对齐；真加"飞"行时要连图集一起换）。
 */
export const PET_FLIGHT_POSE = {
	state: "jumping" as PetStateName,
	loop: true,
} as const;

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
	/**
	 * 单次飞行的位移区间（px，R-PET-07）：`[最短, 最长]`，方向随机。
	 * ============================================================================
	 * 发起人 2026-09-26 反馈：「**你飞的太快了**……自然一点就**微微挪动**就好了」。
	 * 改前目标点是**整个视口内任意取点**（`edge + Math.random() × 可用宽/高`），
	 * 于是单次位移实测 414~550px —— 看着像"瞬移"，不像"飘一下"。
	 * 现在改成"从当前位置出发、朝随机方向挪 60~180px"，**位移有上界**；
	 * 方向用随机角 × `flyVerticalRatio` 压扁纵向，观感是"横向漂一点 + 轻轻起伏"。
	 */
	flyDistanceRange: [60, 180],
	/** 纵向位移占横向位移的比例：飘起来像"横向漂移 + 小幅上下"，而不是"上下跳" */
	flyVerticalRatio: 0.55,
	/**
	 * 一次飞行的弧线最高抬升（px）：`arc = 该值 × sin(πt)`，让直线插值看起来像"飘"。
	 * R-PET-07 从 44 降到 12 —— 位移本身只有 60~180px 了，44px 的拱高会盖过位移本身
	 * （看起来像"蹦"而不是"飘"），而且贴近视口顶部时会被 clamp 削掉。
	 */
	flyArc: 12,
	/** 飞行途中的姿态：最大倾角（deg，R-PET-07 从 7° 收到 3°）与最大放大比例（1 + 该值） */
	flyTilt: 3,
	flyZoom: 0.04,
	/**
	 * 右键菜单与宠物之间的间隙、与视口四边的安全边距（px，R-PET-07）。
	 * 菜单摆位见 `AemeathPet.astro` 的 `placeMenu()`：四边都必须夹进视口。
	 */
	menuGap: 10,
	menuMargin: 8,
} as const;

/** 图集列数（8 列 × 9 行，见文件头） */
export const PET_COLS = 8;
/** 图集行数 */
export const PET_ROWS = 9;
/** 单格尺寸（缩放前的逻辑像素） */
export const PET_CELL = { width: 144, height: 156 } as const;
