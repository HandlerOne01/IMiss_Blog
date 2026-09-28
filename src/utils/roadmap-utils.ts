// src/utils/roadmap-utils.ts
import type { RoadmapConfig, RoadmapLevel } from "../types/roadmapConfig";

/** 页面侧传进来的最小文章信息（由 `getCollection` + `render` 组装） */
export interface PostLite {
	/** 分类**目录名**（`entry.id` 的第一段，如 `linux-net`）—— **只用来定位文章**，不上屏 */
	category: string;
	/** 分类**显示名**（`entry.data.category`，如 `Linux 网络`）—— 上屏用这个（终审 I3） */
	categoryLabel: string;
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
	level: RoadmapLevel;
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
 * 一条主线在页面上显示的小时数。**页顶总时长必须用同一个口径累加**（终审 M4）：
 * 原来 `PathLine` 逐线取整、`roadmap.astro` 对总数取整，于是 8 条线的小时数加起来 69
 * 而页顶写「约 68 小时」—— 页面自己跟自己打架。
 * `Math.max(1, …)`：语料缩水时也不许渲染出「约 0 小时」（终审 M7）。
 */
export function lineHours(minutes: number): number {
	return Math.max(1, Math.round(minutes / 60));
}

/** 页顶总时长（小时）= **逐线 `lineHours` 求和**（与每条线的表头逐字自洽），再兜底 ≥ 1 小时 */
export function roadmapHours(lines: ResolvedLine[]): number {
	return Math.max(
		1,
		lines.reduce((n, line) => n + lineHours(line.minutes), 0),
	);
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
	/**
	 * 阶段级 warning **先攒着**，等"缺 slug 就抛错"那个决定做完再打（终审 M13）：
	 * 直接 `console.warn` 的话，一个写错的 slug 会先冒一行「某阶段一篇都没有」——
	 * 把人往"数据文件里那个阶段空了"引，而真正的原因是 slug 拼错了。
	 */
	const warnings: string[] = [];

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
					warnings.push(
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
	// 抛错的决定做完了，现在才把阶段级 warning 放出来（M13）
	for (const w of warnings) console.warn(w);
	/**
	 * **ARCH §5.6 承诺的构建期对账**（终审 I1）：篇目并集 ≠ 站内篇数 → 构建日志 warning。
	 * 原来的构建期只有"slug 找不到就抛错"，漏一篇 / 多一篇**一个日志都没有**；
	 * 真正的把关交给 `verify:ui` 的 R-PATH-04（它拿 `dist/api/allPostMeta.json` 当站点真值对账）。
	 */
	if (seen.size !== posts.length) {
		console.warn(
			`[roadmap] 篇目并集 ${seen.size} ≠ 站内 ${posts.length} 篇（漏篇或多篇）`,
		);
	}
	// 空线直接丢掉（ARCH §5.6），并留下构建日志
	const kept = lines.filter((line) => {
		const ok = line.stopCount > 0;
		if (!ok) console.warn(`[roadmap] 主线「${line.name}」一篇都没有，已跳过`);
		return ok;
	});
	return { lines: kept, stops, unique: seen.size, totalMinutes, crossCount };
}
