// src/types/roadmapConfig.ts
/** 难度档：只用于页面上的一个标签，不参与任何逻辑 */
export type RoadmapLevel = "入门" | "进阶" | "实战";

export interface RoadmapStop {
	/** 分类目录名（对应 `src/content/posts/<category>/`）—— **必须与 slug 成对**：
	 *  站内 `cpp` 与 `stl` 下都有 `vector` / `list` / `string`，只按 slug 查会命中错的那篇。 */
	category: string;
	slug: string;
	/** 只覆盖本页显示名（如「vector · 用法」），**不改文章标题、不影响 URL** */
	name?: string;
	/** 跨线复用：同一篇出现在多条线里（全站限 2~3 处） */
	crossLine?: boolean;
}

export interface RoadmapStage {
	/** 阶段标题（页面上是 h3） */
	title: string;
	stops: RoadmapStop[];
}

export interface RoadmapLine {
	/** 锚点用（`#line-<id>`）——**不许用序号当 id**，改顺序时锚点不能失效 */
	id: string;
	name: string;
	/** 一句话说明：这条线在讲什么、读完能干什么 */
	summary: string;
	level: RoadmapLevel;
	stages: RoadmapStage[];
}

export interface RoadmapConfig {
	lines: RoadmapLine[];
}
