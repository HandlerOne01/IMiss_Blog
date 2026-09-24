/**
 * 排行榜数据类型（需求见 prd.md R-RANK-01 ~ R-RANK-06，版式规格见 ARCH.md §5）
 *
 * 设计取舍：**数组顺序即名次**，条目里不写名次数字。
 * 数据只有一期、由作者手工维护，所以没有任何"期数 / 历史快照"字段。
 * 参考图右侧那一列（得票率 / 名次升降 / 涨幅）按发起人要求**不做**，
 * 因此这里也不存这些字段——真要加时只需扩这个类型与榜单板的一行。
 */

/** 榜单维度：全剧 / 单集 */
export type RankKind = "all" | "ep";

/** 榜单条目 */
export interface RankEntry {
	/** 作品名（必填；显示在剧照上，压在标题位） */
	title: string;
	/** 原名 / 日文名（可选；标题下方那行小字） */
	original?: string;
	/** 一句话短评（可选；右端小胶囊。不填则不占位） */
	note?: string;
	/**
	 * 剧照路径（可选）。两种写法都支持：
	 *  · 不带前导 "/" → 走 `src`，会被 Astro 优化并生成 LQIP 占位色（推荐）
	 *    例：`assets/images/rank/frieren.webp`
	 *  · 带前导 "/" → 走 `public`，原样引用、不优化
	 *    例：`/images/rank/frieren.webp`
	 * 不填则渲染主题色渐变占位——**不会出现裂图**，这是刻意的降级。
	 */
	cover?: string;
}

/** 单个榜单（例如「日漫排行」） */
export interface RankBoardConfig {
	/** 短标识，同时用于路由（`/rank/<id>/`） */
	id: string;
	/** 页面主标题 */
	title: string;
	/** 页面副标题 / 说明（可选） */
	description?: string;
	/** 覆盖全局的维度名称（可选，两个榜单要分别叫别的名字时用） */
	labels?: Partial<Record<RankKind, string>>;
	/**
	 * 榜单数据，有两种形态：
	 *  · `Record<RankKind, RankEntry[]>` —— 有「全剧 / 单集」两个维度（日漫排行、国漫排行）
	 *  · `RankEntry[]`                  —— **单一榜，页面上没有维度切换**（二游排行）
	 * 判据就是 `Array.isArray(data)`，组件里据此决定要不要渲染那对切换按钮。
	 */
	data: Record<RankKind, RankEntry[]> | RankEntry[];
}

export interface RankConfig {
	/** 维度名称（两个榜单共用一套；改这里即可全站改名） */
	kindLabels: Record<RankKind, string>;
	/**
	 * 数据状态：
	 *  · `"placeholder"` → 页面顶部显示一条"当前为占位数据"的提示，提醒你还没填真数据
	 *  · `"final"`       → 提示消失
	 * 换成真实数据后把它改成 `"final"` 即可，不用改组件。
	 */
	dataStatus: "placeholder" | "final";
	/** 榜单集合，key 与每个 board 的 `id` 一致 */
	boards: Record<string, RankBoardConfig>;
}
