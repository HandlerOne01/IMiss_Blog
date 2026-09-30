import {
	type NavBarConfig,
	type NavBarLink,
	type NavBarSearchConfig,
	NavBarSearchMethod,
} from "../types/navBarConfig";

// ============================================================================
// 导航栏配置 - 根据顺序动态生成导航栏链接
// NavBar Configuration - Dynamically generate navigation bar links based on order
//
// IMiss Blog 的最终导航结构（需求见 prd.md 第 2 章，落点见 ARCH.md §4.1）：
//   主页 / 文章(归档·分类·标签·系列) / 学习路线
//        / 我的(动态·项目·相册·书签导航·轻小说·番剧·关于我) / 链接 / 留言
//
// 相对上游模板的改动：
//   · R-NAV-01：删除「社交」父项，「留言」提升为顶层项并放在最后（「链接」之后）
//   · R-NAV-02：在「文章」与「我的」之间新增顶层项 —— **v1.40 起是「学习路线」`/roadmap/`（单链接、
//               无子项）**，取代原先的「排行」及其三个子菜单（原项随 P2R 排行模块一起退场）
//   · R-NAV-03：「我的」里删掉「哔哩哔哩」「番组计划」；VNDB→「轻小说」、AnimeList→「番剧」
//               （都只改名，URL 与功能不变）；「关于我」移到最后一项
//   · R-NAV-04：删除顶层「关于」父项（「打赏」随之彻底移除，「关于我」并入「我的」）
//
// ⚠️ 两条容易踩的规则（上游 utils/nav-menu-utils.ts）：
//   1) 带 pageKey 的项会对照 siteConfig.pages 自动隐藏；子项全被关掉时整组消失，
//      只剩 1 个可用子项时整组会塌缩成单项
//   2) utils/navbar-i18n.ts 用**中文名字面量**做多语言映射，改 name 等于换掉该菜单的翻译键
//      （本站只用 zh_CN，改了不影响显示）
// ============================================================================
const getDynamicNavBarConfig = (): NavBarConfig => {
	// 基础导航栏链接
	const links: NavBarLink[] = [];

	// 主页
	links.push(LinkPresets.Home);

	// 文章及其子菜单
	links.push({
		name: "文章",
		url: "#",
		icon: "material-symbols:article",
		children: [
			// 归档
			LinkPresets.Archive,

			// 分类
			LinkPresets.Categories,

			// 标签
			LinkPresets.Tags,

			// 系列
			LinkPresets.Series,
		],
	});

	// 学习路线（R-PATH-01：本站新增页面，不属于 siteConfig.pages 的开关体系，所以**不带 pageKey**；
	// 8 条主线用页内锚点，导航**不挂子项** —— 挂 8 个子项在手机上会爆）
	// 位置固定为「文章」与「我的」之间（原「排行」占的那一格，v1.41 换成本页）
	// ⚠️ 顺手记下一条容易搞反的规则：nav-menu-utils 的判据是 `pages[key] !== false`，
	//    所以随便写一个不存在的 pageKey 其实**不会**隐藏，而是照常显示——别指望用它来"先藏起来"。
	links.push({
		name: "学习路线",
		url: "/roadmap/",
		icon: "material-symbols:route",
	});

	// 我的及其子菜单
	links.push({
		name: "我的",
		url: "#",
		icon: "material-symbols:person",
		children: [
			// 动态
			LinkPresets.Dynamic,

			// 项目
			LinkPresets.Projects,

			// 相册
			LinkPresets.Gallery,

			// 书签导航
			LinkPresets.Booknav,

			// 轻小说（原 VNDB，仅改名）
			LinkPresets.VNDB,

			// 番剧（原 AnimeList，仅改名）
			LinkPresets.MAL,

			// 关于我（从被删除的「关于」父项移到这里，必须是**最后一项**）
			LinkPresets.About,
		],
	});

	// 自定义导航栏链接
	// P4-8（v1.47）：这里原来有一整块 `links.push({ name: "链接", ... })`，内含两条对上游主题的
	// 署名外链（「上游主题」→ 模板作者仓库、「上游文档」→ 模板作者的文档站）。
	// 发起人要求站上不再出现任何上游字样，故**整块删除**。
	// 不需要额外的"空组处理"：`src/utils/nav-menu-utils.ts:19-21` 在 children 过滤后为 0 时 `return null`，
	// 整组会从导航里自然消失，不会留下一个点不开的空「链接」下拉。
	// ⚠️ 发起人以后要放自己的外链，是**阻塞项 B-10**（尚未拍板），照下面的格式加回来即可。

	// 留言（原「社交」父项已删除，本项提升为顶层并置于最后，见 R-NAV-01）
	links.push(LinkPresets.Guestbook);

	return { links } as NavBarConfig;
};

// 导航搜索配置
export const navBarSearchConfig: NavBarSearchConfig = {
	method: NavBarSearchMethod.PageFind,
};

// ============================================================================
// 链接预设 - 可自由自定义导航栏链接的名称、图标和URL
// Link Presets - Allows free customization of the name, icon, and URL of navigation bar links
//
// ⚠️ 未使用的预设（上游的 Friends / Bilibili / Bangumi / Sponsor）已按 R-NAV-03 / R-NAV-04
//    从这张表里删除，避免以后被误引用。
//    P4-8（v1.47）更正：这里原来写"对应的页面文件仍然保留，只是被 siteConfig.pages 关掉"——
//    现在 Friends / Sponsor 两个**页面文件也已删除**（`/friends/`、`/sponsor/` 是真 404，
//    不再是 noindex 存根），Bilibili / Bangumi 两个页面文件仍在、仍由 siteConfig.pages 关闭。
// ============================================================================
export const LinkPresets: Record<string, NavBarLink> = {
	Home: {
		name: "主页",
		url: "/",
		icon: "material-symbols:home",
	},
	Archive: {
		name: "归档",
		url: "/archive/",
		icon: "material-symbols:archive",
	},
	Categories: {
		name: "分类",
		url: "/categories/",
		icon: "material-symbols:folder-open-rounded",
	},
	Tags: {
		name: "标签",
		url: "/tags/",
		icon: "material-symbols:tag-rounded",
	},
	Series: {
		name: "系列",
		url: "/series/",
		icon: "material-symbols:layers",
	},
	// ─── 留言（原「社交」的子项，现提升为顶层最后一项）──────
	Guestbook: {
		name: "留言",
		url: "/guestbook/",
		icon: "material-symbols:chat",
		pageKey: "guestbook",
	},
	// ─── 我的 ──────────────────────────────────────────────
	Dynamic: {
		name: "动态",
		url: "/dynamic/",
		icon: "material-symbols:forum-rounded",
		pageKey: "dynamic",
	},
	Projects: {
		name: "项目",
		url: "/projects/",
		icon: "material-symbols:rocket-launch",
		pageKey: "projects",
	},
	Gallery: {
		name: "相册",
		url: "/gallery/",
		icon: "material-symbols:photo-library",
		pageKey: "gallery",
	},
	Booknav: {
		name: "书签导航",
		url: "/booknav/",
		icon: "material-symbols:bookmarks",
		pageKey: "booknav",
	},
	// 原 VNDB：仅改中文名，URL / pageKey / 功能都不变
	VNDB: {
		name: "轻小说",
		url: "/vndb/",
		icon: "material-symbols:auto-stories",
		pageKey: "vndb",
	},
	// 原 AnimeList（MyAnimeList）：仅改中文名，URL / pageKey / 功能都不变
	MAL: {
		name: "番剧",
		url: "/myanimelist/",
		icon: "material-symbols:menu-book",
		pageKey: "mal",
	},
	// 关于我：从被删除的「关于」父项移入「我的」，且必须是「我的」的最后一项
	About: {
		name: "关于我",
		url: "/about/",
		icon: "material-symbols:person",
	},
};

export const navBarConfig: NavBarConfig = getDynamicNavBarConfig();
