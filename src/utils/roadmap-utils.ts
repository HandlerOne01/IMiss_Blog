// src/utils/roadmap-utils.ts
import type { RoadmapConfig } from "../types/roadmapConfig";

/** 页面侧传进来的最小文章信息（由 `getCollection` + `render` 组装） */
export interface PostLite {
	category: string;
	slug: string;
	title: string;
	minutes: number;
}

export interface ResolvedStop extends PostLite {
	/** 显示名：`name` 覆盖优先，否则用文章标题 */
	display: string;
	href: string;
	crossLine: boolean;
}
export interface ResolvedStage {
	title: string;
	stops: ResolvedStop[];
}
export interface ResolvedLine {
	id: string;
	name: string;
	summary: string;
	level: string;
	stages: ResolvedStage[];
	/** 本线停靠点数（含跨线站） */
	stopCount: number;
	/** 本线总时长（分钟，含跨线站） */
	minutes: number;
}
export interface ResolvedRoadmap {
	lines: ResolvedLine[];
	/** 停靠点总数（含跨线，重复计数） */
	stops: number;
	/** 并集篇数 —— **必须等于站内文章数**（R-PATH-04 的命根子） */
	unique: number;
	totalMinutes: number;
	crossCount: number;
}

/**
 * 把配置解析成可渲染结构。**找不到文章就抛错**（R-PATH-04）：
 * 构建期失败远好过渲染出一条死链 —— 这是"改了文章 slug 之后路线页必须报错"的实现基础。
 * 纯函数：不碰 astro:content、不读文件，所以能在 `npx tsx` 里直接测（见 reports/_roadmap-check.mts）。
 */
export function resolveRoadmap(
	cfg: RoadmapConfig,
	posts: PostLite[],
): ResolvedRoadmap {
	const byKey = new Map<string, PostLite>();
	for (const p of posts) byKey.set(`${p.category}/${p.slug}`, p);

	const missing: string[] = [];
	const seen = new Set<string>();
	let stops = 0;
	let totalMinutes = 0;
	let crossCount = 0;

	const lines: ResolvedLine[] = cfg.lines.map((line) => {
		const stages: ResolvedStage[] = line.stages
			.map((stage) => {
				const resolved: ResolvedStop[] = [];
				for (const stop of stage.stops) {
					const key = `${stop.category}/${stop.slug}`;
					const post = byKey.get(key);
					if (!post) {
						missing.push(key);
						continue;
					}
					seen.add(key);
					stops += 1;
					totalMinutes += post.minutes;
					if (stop.crossLine) crossCount += 1;
					resolved.push({
						...post,
						display: stop.name ?? post.title,
						href: `/posts/${post.category}/${post.slug}/`,
						crossLine: Boolean(stop.crossLine),
					});
				}
				if (resolved.length === 0)
					console.warn(
						`[roadmap] 「${line.name} / ${stage.title}」阶段里一篇都没有，已跳过`,
					);
				return { title: stage.title, stops: resolved };
			})
			.filter((stage) => stage.stops.length > 0); // 空阶段不渲染（ARCH §5.6）
		return {
			id: line.id,
			name: line.name,
			summary: line.summary,
			level: line.level,
			stages,
			stopCount: stages.reduce((n, st) => n + st.stops.length, 0),
			minutes: stages.reduce(
				(n, st) => n + st.stops.reduce((m, s) => m + s.minutes, 0),
				0,
			),
		};
	});

	if (missing.length > 0) {
		throw new Error(
			`[roadmap] 有 ${missing.length} 个篇目在站内找不到（category/slug 必须成对且真实存在）：${missing.join(", ")}`,
		);
	}
	// 空线 / 空阶段直接丢掉（ARCH §5.6），并留下构建日志
	const kept = lines.filter((line) => {
		const ok = line.stopCount > 0;
		if (!ok) console.warn(`[roadmap] 主线「${line.name}」一篇都没有，已跳过`);
		return ok;
	});
	return { lines: kept, stops, unique: seen.size, totalMinutes, crossCount };
}
