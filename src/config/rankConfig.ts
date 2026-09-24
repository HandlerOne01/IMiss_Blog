/**
 * 排行榜数据（**这是你唯一需要手工维护的文件**）
 * ============================================================================
 * 需求：prd.md R-RANK-01 ~ R-RANK-06 ｜ 版式规格：ARCH.md §5 ｜ 页面：/rank/jp/、/rank/cn/
 *
 * 怎么用：
 *   1) 改名字 / 排名 → 直接改下面的数组。**数组顺序就是名次**，第一条是第 1 名。
 *      只排 3 条也不会报错；条数不限（建议 10~30 条，不做分页）。
 *   2) 换剧照 → 把图片放进 `src/assets/images/rank/`，在条目里写
 *      `cover: "assets/images/rank/你的图.webp"`；不写 cover 就用主题色渐变占位（不会裂图）。
 *   3) 填完之后把下面 `dataStatus` 改成 `"final"`，页面顶部那条"占位数据"提示就会消失。
 *
 * 视觉规格（量自发起人给的参考图；要改样式见 src/styles/pages/rank.css）：
 *   · 名次底色只有两档：1~3 名粉 `#EA7B7C`（白字）、4 名以后橙 `#EFA662`（深色字）
 *   · 行高 ≈ 内容宽的 1/5.7；名次列 ≈ 内容宽的 13.7%
 *   · **不做**右侧的得票率 / 名次升降 / 涨幅（发起人明确不要）
 * ============================================================================
 */
import type { RankConfig, RankEntry } from "@/types/rankConfig";

/** 两组演示剧照：只用来验证"配图通路 + 版式观感"，正式图请替换（可删） */
const DEMO_COVER_1 = "assets/images/rank/_demo-01.webp";
const DEMO_COVER_2 = "assets/images/rank/_demo-02.webp";

export const rankConfig: RankConfig = {
	// 维度名称：右上角切换按钮上的文字
	kindLabels: {
		all: "全剧",
		ep: "单集",
	},

	// ⚠️ 现在还是占位数据 —— 填完真数据记得改成 "final"
	dataStatus: "placeholder",

	boards: {
		// ── 日漫排行 ────────────────────────────────────────────
		jp: {
			id: "jp",
			title: "日漫排行",
			description: "我个人口味的一期排名，从 1 到 10。没有投票数据，纯主观。",
			data: {
				// 「全剧」榜：以整部作品为单位排名
				all: [
					{ title: "示例作品 01", original: "作品原名 01", note: "示例短评", cover: DEMO_COVER_1 },
					{ title: "示例作品 02", original: "作品原名 02", cover: DEMO_COVER_2 },
					{ title: "示例作品 03", original: "作品原名 03" },
					{ title: "示例作品 04", original: "作品原名 04" },
					{ title: "示例作品 05", original: "作品原名 05" },
					{ title: "示例作品 06" },
					{ title: "示例作品 07" },
					{ title: "示例作品 08" },
					{ title: "示例作品 09" },
					{ title: "示例作品 10" },
				] satisfies RankEntry[],
				// 「单集」榜：以单集为单位排名
				ep: [
					{ title: "示例单集 01", original: "第 1 集", cover: DEMO_COVER_2 },
					{ title: "示例单集 02", original: "第 2 集" },
					{ title: "示例单集 03" },
					{ title: "示例单集 04" },
					{ title: "示例单集 05" },
					{ title: "示例单集 06" },
					{ title: "示例单集 07" },
					{ title: "示例单集 08" },
					{ title: "示例单集 09" },
					{ title: "示例单集 10" },
				] satisfies RankEntry[],
			},
		},

		// ── 国漫排行 ────────────────────────────────────────────
		cn: {
			id: "cn",
			title: "国漫排行",
			description: "同样是主观排名，只有一期。",
			data: {
				all: [
					{ title: "示例作品 01", cover: DEMO_COVER_2 },
					{ title: "示例作品 02", cover: DEMO_COVER_1 },
					{ title: "示例作品 03" },
					{ title: "示例作品 04" },
					{ title: "示例作品 05" },
					{ title: "示例作品 06" },
					{ title: "示例作品 07" },
					{ title: "示例作品 08" },
					{ title: "示例作品 09" },
					{ title: "示例作品 10" },
				] satisfies RankEntry[],
				ep: [
					{ title: "示例单集 01" },
					{ title: "示例单集 02" },
					{ title: "示例单集 03" },
					{ title: "示例单集 04" },
					{ title: "示例单集 05" },
					{ title: "示例单集 06" },
					{ title: "示例单集 07" },
					{ title: "示例单集 08" },
					{ title: "示例单集 09" },
					{ title: "示例单集 10" },
				] satisfies RankEntry[],
			},
		},
	},
};
