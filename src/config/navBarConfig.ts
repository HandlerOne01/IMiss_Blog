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
//   · B-10（v1.57 关闭）：「链接」顶层下拉用发起人自己的外链重建（v1.47 曾整组删除），
//               位置**固定**在「我的」与「留言」之间 → 顶层为 主页/文章/学习路线/我的/链接/留言
//               （v1.57 是 8 条，**v1.61 整批换成发起人的 6 条**，见下面那一块的注释）
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

	// 自定义导航栏链接 —— 「链接」（阻塞项 B-10，v1.57 关闭；**v1.61 整批换成新清单**）
	// 历史：P4-8（v1.47）把这一整块删掉过 —— 当时里面只有两条对上游主题的署名外链
	// （「上游主题」→ 模板作者仓库、「上游文档」→ 模板作者的文档站），发起人要求站上
	// 不留任何上游字样。删块之后导航第 5 格自然消失：`src/utils/nav-menu-utils.ts:19-21`
	// 在 children 过滤后为 0 时 `return null`，不会留下一个点不开的空下拉。
	// ⚠️ 那条"空组自然消失"的规则**现在仍然成立、也仍然重要**：下面这 6 条**都没有
	//    `pageKey`**（全是外链，不对应站内页面开关），所以谁也不会把它们过滤掉；
	//    但将来若给它们加上会失效的 `pageKey`，整组就会一声不响地消失。
	// v1.57：发起人给出第一版清单，照 v1.47 被删那块的原结构（name / url / icon /
	//    `external: true` / children）**原样重建**，子项名字取短名，顺序即他给的顺序。
	// v1.61：发起人原话「**把下拉链接换成接下来我给你的链接**」→ **整批换成下面这 6 条**，
	//    顺序就是他给的顺序：Gitee → GitHub → CSDN → 洛谷 → Boost 搜索引擎 → HTTP 服务器。
	//    上一版那 8 条（DeepSeek / ChatGPT / Claude / GitHub / 洛谷 / 力扣 / CSDN /
	//    Hugging Face）里只有 **GitHub / 洛谷 / CSDN** 三个名字留下（URL 全换），另 5 条退场。
	//    两条照办的细节：① **CSDN 去掉跟踪参数**（他给的原始 URL 尾巴是
	//    `?spm=1000.2115.3001.10640`，按书签页那轮"URL 一律换成干净地址"的同一口径只留干净地址）；
	//    ② **「Boost 搜索引擎」是裸 IP + 非标准端口 + HTTP，照原样收录**（他的站、他的选择），
	//    代价与后续建议写在那一条自己的注释里 —— **不许擅自改 URL、也不许删这一条**。
	//    6 条一律 `external: true`；图标两条没有品牌 → 用含义图标（放大镜 / 服务器机柜）。
	// ⚠️ 这一格插在「我的」与「留言」之间 → 顶层项集合与顺序都变了，
	//    `scripts/verify-ui.mjs` 的 `EXPECT_TOP_NAV` 必须同步（已同步，并在本轮做过注入验证）。
	links.push({
		name: "链接",
		url: "#",
		icon: "material-symbols:link",
		// 子菜单
		children: [
			{
				name: "Gitee",
				url: "https://gitee.com/a2186988646",
				external: true,
				icon: "simple-icons:gitee",
			},
			{
				name: "GitHub",
				url: "https://github.com/a13824367931-alt",
				external: true,
				icon: "simple-icons:github",
			},
			{
				// ⚠️ 发起人给的原始地址是 `https://blog.csdn.net/is_ko_nois_ko?spm=1000.2115.3001.10640`，
				// 尾巴上的 `?spm=` 是 CSDN 的来源跟踪参数。按书签页那一轮的同一口径**只留干净地址** ——
				// 上面这行注释里留着它，是为了让下一个人知道"去掉的是哪一个参数"，**不是**待补的 TODO。
				name: "CSDN",
				url: "https://blog.csdn.net/is_ko_nois_ko",
				external: true,
				icon: "simple-icons:csdn",
			},
			{
				name: "洛谷",
				url: "https://www.luogu.com.cn/user/1726221",
				external: true,
				icon: "simple-icons:luogu",
			},
			{
				// ⚠️ **裸 IP + 非标准端口 + HTTP —— 这是发起人给的地址，照原样收录**（2026-10-04，不是笔误）。
				// 代价写在明处：① `106.52.158.48` 同时是**本站后端数据库所在的那台机器** ——
				//    把这条挂在导航上，等于把本站服务器地址公开给每一个访客（爬虫也能读到）；
				// ② `http://` 没有 TLS，浏览器地址栏会标「不安全」（Chrome 对非标准端口还会先给一次警告）。
				// **建议（有域名之后）**：换成 `https://<域名>/` —— 只改这一个字符串，其余 5 条纹丝不动。
				// 在他给新地址之前**不许**自作主张删掉或改写这一条。
				// 无品牌图标 → 用含义图标：放大镜 = 搜索，`material-symbols:search-rounded`。
				name: "Boost 搜索引擎",
				url: "http://106.52.158.48:8081/",
				external: true,
				icon: "material-symbols:search-rounded",
			},
			{
				// 发起人自己那台 HTTP 服务器的源码/说明仓库（Gitee 上的 `my_server`）。
				// 无品牌图标 → 用含义图标：机柜 = 服务器，`material-symbols:dns-rounded`。
				name: "HTTP 服务器",
				url: "https://gitee.com/a2186988646/my_server",
				external: true,
				icon: "material-symbols:dns-rounded",
			},
		],
	});

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
