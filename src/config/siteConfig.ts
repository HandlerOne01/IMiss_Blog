import type { SiteConfig } from "@/types/siteConfig";
import { resolvePageToggles } from "../utils/page-toggle-utils";
import { resolveSiteLang } from "../utils/site-config-utils";

// 定义站点语言
// 语言代码，例如：'zh_CN', 'zh_TW', 'en', 'ja', 'ru', 'ko'。
const SITE_LANG = resolveSiteLang("zh_CN");

// 页面开关配置 - 控制特定页面的访问权限，设为false会返回404并自动隐藏对应的导航栏菜单项
const pages = resolvePageToggles({
	// ── 社交 (Social) ──────────────────────────────────

	// 友链页面开关（IMiss Blog：已删除该功能，见 prd.md R-NAV-05）
	friends: false,
	// 留言板页面开关（IMiss Blog：**v1.83 起整个功能删除** —— 发起人原话「然后删掉留言功能」）
	// `src/pages/guestbook.astro` 与 `src/content/spec/guestbook.md` 都已删掉，
	// 所以 `/guestbook/` 现在是**真 404**（与 `/friends/`、`/sponsor/` 同一种处置）。
	// 这个开关留着只是为了 `resolvePageToggles` 的类型完整；打开它也不会让页面回来。
	guestbook: false,

	// ── 我的 (My) ──────────────────────────────────

	// 动态页面开关
	dynamic: true,
	// 项目展示页开关
	projects: true,
	// 相册页面开关
	gallery: true,
	// 书签导航页面开关
	booknav: true,
	// 哔哩哔哩追番页面开关（IMiss Blog：已删除该入口，见 R-NAV-03）
	bilibili: false,
	// 番组计划页面开关（IMiss Blog：已删除该入口，见 R-NAV-03）
	bangumi: false,
	// 轻小说页面开关（原 VNDB，仅改名不改功能）。需要 userId 才能显示数据（阻塞项 B-05），
	// 未配置时页面显示"未配置"卡片，不会报错
	vndb: true,
	// 番剧页面开关（原 AnimeList，仅改名不改功能）。需要 username + clientId（阻塞项 B-05）
	mal: true,

	// ── 关于 (About) ──────────────────────────────────

	// 打赏页面开关（IMiss Blog：彻底移除，见 R-NAV-06。关掉它会连带关掉文章页的打赏按钮）
	sponsor: false,
});

export const siteConfig: SiteConfig = {
	// 站点标题（IMiss Blog：取自《鸣潮》角色「爱弥斯」AiMiSi 的谐音，见 prd.md R-ID-01）
	title: "IMiss Blog",

	// 站点副标题 【假设，可改】—— 正式文案待发起人确认
	subtitle: "爱弥斯的小站",

	// 站点 URL
	// ⚠️ 占位域名：真实域名待提供（阻塞项 B-01）。填真值前，sitemap / RSS / OG 里的绝对地址都是这个占位值
	site_url: "https://imiss.example.com",

	// 站点描述
	// ⚠️ v1.41（P2R）：原文后半句是"外加定期更新的番剧排行榜"——排行模块已整体删除（R-PATH-06），
	// 这句会跟着进 meta description 与 llms.txt，留着就是对访客与 AI 抓取入口说假话，故改写为学习路线。
	description:
		"IMiss Blog —— 以《鸣潮》爱弥斯为主题的个人技术博客：C/C++、Linux、网络、数据库与算法的学习笔记，外加把全站笔记串成一条路径的学习路线，和一只会聊天的爱弥斯桌宠。",

	// 站点关键词
	keywords: [
		"IMiss Blog",
		"爱弥斯",
		"Aemeath",
		"鸣潮",
		"技术博客",
		"C++",
		"Linux",
		"学习笔记",
		"学习路线",
		"ACGN",
	],

	// 主题色
	themeColor: {
		// 主题色的默认色相，范围从 0 到 360。例如：红色：0，青色：200，蓝绿色：250，粉色：345
		// IMiss Blog：345 = 爱弥斯粉（原值 165 是模板默认的青绿），见 prd.md R-ID-02
		hue: 345,
		// 默认模式："light" 亮色，"dark" 暗色，"system" 跟随系统
		defaultMode: "system",
	},

	// 页面整体宽度（单位：rem）
	// 数值越大可以让页面内容区域更宽
	// 在使用单侧栏边栏时，建议调低一些宽度以获得更好的视觉效果。
	pageWidth: 100,

	// 网站Card样式配置
	card: {
		// 是否开启卡片边框和阴影，开启后让网站更有立体感
		border: false,
		// 是否让卡片风格跟随主题色相
		followTheme: false,
	},

	// Favicon 配置
	// 如果启用了OpenGraph图片功能，数组中需要包含png格式的favicon图标
	// IMiss Blog：正式标识（纸飞机）由 scripts/make-logo.mjs 从 `src/assets/images/logo/imiss-logo.png`
	// 生成；改标识只需换那张源图再跑 `pnpm make:logo`（v1.64 起，B-03 已关闭）
	// ⚠️ P6-8：数组**每一项都要写 `sizes`**。Layout.astro 选 apple-touch-icon 时按这里的
	// 尺寸挑（优先 180×180，见该文件 `appleTouchIcon`），schema-image.ts 也按尺寸挑最大的
	// raster 当 publisher logo；不写 sizes 会让它们退化成"猜"，32px 有被挑中的风险。
	favicon: [
		{
			// 图标文件路径
			src: "/favicon/imiss-32.png",
			// 可选，指定主题 'light' | 'dark'
			// theme: "light",
			// 可选，图标大小
			sizes: "32x32",
		},
		// P6-8：下面两张早就由 `pnpm make:logo` 生成，此前**无人引用**（180 是 Apple 触屏图标
		// 的标准边长，192 是 Android/Chrome 主屏图标）。接进来后 apple-touch-icon 才会指向
		// 180px 那张，而不是"数组里第一个 png"（那时是 32px → 主屏图标被放大成糊的）。
		{
			src: "/favicon/imiss-180.png",
			sizes: "180x180",
		},
		{
			src: "/favicon/imiss-192.png",
			sizes: "192x192",
		},
	],

	// 导航栏配置
	navbar: {
		// 导航栏Logo
		// 支持三种类型：
		// 1. Astro图标库: { type: "icon", value: "material-symbols:home-pin-outline" }
		// 2. 本地图片（public目录，不优化）: { type: "image", value: "/assets/images/logo.webp", alt: "Logo" }
		// 3. 本地图片（src目录，自动优化但会增加构建时间）: { type: "image", value: "assets/images/logo.webp", alt: "Logo" }
		// 4. 网络图片: { type: "url", value: "https://example.com/logo.png", alt: "Logo" }
		// image 和 url 类型可额外设置 valueDark，用于暗色模式下显示另一张图片，不设置则亮暗色共用 value
		// 例如: { type: "image", value: "assets/images/logo.png", valueDark: "assets/images/logo-dark.png", alt: "Logo" }
		// 使用 Astro 图标库时不需要设置 valueDark，图标会自动跟随主题亮暗色切换
		logo: {
			type: "image",
			// IMiss Blog：正式 Logo —— 纸飞机（透明底，无方圆底；由 scripts/make-logo.mjs 生成，见 R-ID-04）
			value: "assets/images/logo/imiss-light.webp",
			valueDark: "assets/images/logo/imiss-dark.webp",
			alt: "IMiss Blog",
		},
		// 导航栏标题
		title: "IMiss Blog",
		// 全宽导航栏，导航栏是否占满屏幕宽度
		widthFull: false,
		// 导航菜单对齐方式，left：左对齐，center：居中
		menuAlign: "center",
		// 导航栏图标和标题是否跟随主题色
		followTheme: false,
		// 导航栏模式navbarMode：
		// "static"：不固定，随页面滚动消失
		// "fixed"：固定在顶部常显
		// "dynamic"：固定在顶部，下滑隐藏、轻微上滑显示
		navbarMode: "dynamic",
	},

	// 站点开始日期，用于统计运行天数
	// ⚠️ IMiss Blog：站点统计里的「运行时长」已按需求删除（R-WDG-01），本字段目前**不再被任何代码消费**。
	// 上游示例值 "2025-01-01" 已按 R-ID-05 清空；等站点正式上线后可以填真实起始日期留档。
	siteStartDate: "",

	// 站点时区（IANA 时区字符串），用于格式化bangumi、rss里的构建日期时间等等..
	// 示例："Asia/Shanghai", "UTC", 如果为空，则按照构建服务器的时区进行时区转换
	timezone: "Asia/Shanghai",

	// 页面开关配置 - 控制特定页面的访问权限，设为false会返回404并自动隐藏对应的导航栏菜单项

	// 分类导航栏开关，在首页和归档页顶部显示分类快捷导航
	categoryBar: true,

	// 分类导航栏按钮样式
	// "pill"：胶囊，主题色浅底圆角
	// "rectangle"：矩形，配色同胶囊，仅圆角更小
	categoryStyle: "rectangle",

	// 标签样式，作用于文章列表底部标签、标签页和侧边栏标签
	// "pill"：胶囊，主题色底圆角
	// "pill-gray"：胶囊，中性灰底圆角
	// "rectangle"：矩形，主题色底小圆角
	tagStyle: "pill",

	// 归档页是否折叠非最新年份文章，禁用后默认展开全部年份
	foldArticle: true,

	// ── 文章列表布局配置 ──────────────────────────────────
	postListLayout: {
		// 默认布局模式："list" 列表模式（单列布局），"grid" 网格模式（多列布局）
		defaultMode: "list",
		// 移动端默认布局模式，不设置则跟随 defaultMode
		mobileDefaultMode: "grid",
		// 列表模式下封面图显示在哪一侧："right" 右侧，"left" 左侧
		// 网格模式的封面固定在卡片顶部，不受此项影响
		coverPosition: "right",
		// 文章简介显示行数，设为 0 则不截断
		descriptionLines: 2,
		// 文章卡片底部统计和发布日期是否显示图标
		showStatsIcons: true,
		// 标签显示位置
		// 设置为"meta"：显示在文章标题下的元数据
		// 设置为"bottom"：顶替stats在底部显示
		tagsPosition: "bottom",
		// 底部标签样式，仅在 tagsPosition 为 "bottom" 时生效
		// "chip"：按钮样式，形状跟随上方的 tagStyle 配置
		// "text"：无底色，只有文字
		tagsBottomStyle: "chip",
		// PostMeta 元数据显示控制
		meta: {
			// 是否显示发布日期
			showPublished: true,
			// 是否显示分类
			showCategory: true,
			// 是否显示标签
			showTags: true,
			// 标签数量，设为 0 则不限制
			tagCount: 3,
			// 是否显示字数
			showWords: false,
			// 是否显示阅读时间
			showReadingTime: false,
		},
		// 底部 PostStats 统计信息显示控制
		// 如果tagsPosition设置为"bottom"，则stats将不显示
		stats: {
			// 是否显示发布日期
			showPublished: true,
			// 是否显示字数
			showWords: true,
			// 是否显示阅读时间
			showReadingTime: true,
		},
		// 网格布局配置，仅在 defaultMode 为 "grid" 或允许切换布局时生效
		grid: {
			// 是否开启瀑布流布局，同时有封面图和无封面图的混合文章推荐开启
			masonry: false,
			// 网格模式卡片最小宽度(px)，浏览器根据容器宽度自动计算列数
			columnWidth: 320,
			// 网格模式封面是否撑满卡片贴边
			// true：封面顶到卡片左右和上边缘，只有上面两角是圆角
			// false：封面按卡片内边距内缩，上、左、右留出间距，四角都是圆角
			coverFullWidth: false,
		},
	},

	// 分页配置
	pagination: {
		// 每页显示的文章数量
		postsPerPage: 10,
	},

	// ── 文章内容页配置 ──────────────────────────────────
	post: {
		// 提醒框（Admonitions）配置，修改后需要重启开发服务器才能生效
		// 主题：'github' | 'obsidian' | 'vitepress' | 'docusaurus'，每个主题风格和语法不同，可根据喜好选择
		rehypeCallouts: {
			theme: "github",
			// 是否启用兼容 Python-Markdown 风格的 admonition 语法（!!!和???语法）
			// 注意：只有 theme 配置成 obsidian 主题才能基本支持这些语法，其他主题会有样式问题或不兼容的情况
			enablePythonMarkdownAdmonitions: false,
		},
		// 文章页底部的"上次编辑时间"卡片开关
		showLastModified: true,
		// 文章过期阈值（天数），超过此天数才显示"上次编辑"卡片
		outdatedThreshold: 30,
		// 是否显示文章页的分享按钮（分享块 = 文章分享卡片 + 保存海报（含二维码）+ 复制链接）
		// 发起人 2026-09-24 明确**要保留**（"我要分享块啊，只是后面提醒我添加域名而已"）。
		// ⚠️ 已知临时状态：海报二维码与「复制链接」都取 `Astro.url.href`，而 `site_url` 还是
		// 占位域名 `imiss.example.com`（阻塞项 B-01）→ **域名到位前扫码/复制指向的域名是假的**。
		// 拿到域名后：① `site_url` 填真域名 ② 重建 ③ 把 `verify:ui` 里"站点 URL 用的是本站占位域名"
		// 那条断言翻成真值断言。**执行方必须主动提醒发起人**（PROJECT_STATUS §1 第 6 条 / R-ID-09）。
		share: true,
		// 是否显示上一篇/下一篇文章导航
		postNavigation: true,
		// 是否显示相关文章推荐
		relatedPosts: true,
		// 是否显示随机文章推荐
		randomPosts: true,
		// OpenGraph图片功能，注意开启后要渲染很长时间，不建议本地调试的时候开启
		generateOgImages: true,
		// 沉浸阅读配置：电脑端文章详情页右下角按钮，进入后只留文章卡片+左侧目录
		immersiveReading: {
			// 总开关：false 则不显示按钮
			enable: true,
			// 进入文章页是否默认开启沉浸阅读
			defaultOn: false,
			// 沉浸阅读中是否显示目录栏
			tocEnabled: true,
			// 目录栏位置："left" | "right"
			tocPosition: "left",
		},
	},

	// ── Bilibili配置 ──────────────────────────────────
	bilibili: {
		// 你的 Bilibili 用户 UID
		// IMiss Blog：页面入口已删除；原值 "38932988" 是上游作者的示例值，已清空（R-ID-05）
		uid: "",
	},

	// ── 番组计划bangumi配置 ──────────────────────────────────
	bangumi: {
		// Bangumi用户ID
		// IMiss Blog：页面入口已删除；原值 "1143164" 是上游作者的示例值，已清空（R-ID-05）
		userId: "",
		// 数据模式：static=构建时获取，dynamic=客户端实时获取
		// static 模式在构建时获取数据并静态渲染，部署后数据不更新
		// dynamic 模式在浏览器中实时请求 API，始终显示最新数据
		mode: "dynamic",
		// Bangumi API 地址
		apiUrl: "https://api.bangumi.pro",
		// 详情页地址
		subjectBaseUrl: "https://api.bangumi.pro/subject/",
		// 条目类型排序，数组中的类型将按顺序优先展示
		// 可选值: "anime" | "book" | "music" | "game" | "real" (暂不支持"real"类型)
		// 未列出的类型将按默认顺序排在后面
		categoryOrder: ["anime", "book", "music", "game"],
		// 控制各分类的启用状态（true/false），未指定的分类默认启用
		// categories: {
		// 	game: false, // 禁用游戏分类显示
		// },
		// NSFW 处理："off" 不过滤 | "blur" 仅模糊封面 | "hide" 隐藏条目
		nsfw: "hide",
	},

	// ── VNDB配置（IMiss Blog：页面改名为「轻小说」，功能不变）──────────────────────────────────
	vndb: {
		// VNDB 用户 ID，例如 "u2"
		// IMiss Blog：原值 "u358128" 是上游作者的示例值，已清空（R-ID-05）。
		// 带上你自己的 userId 后「轻小说」页才会有数据（阻塞项 B-05）
		userId: "",
		// 数据模式：static=构建时获取，dynamic=客户端实时获取
		// static 模式在构建时获取数据并静态渲染，部署后数据不更新
		// dynamic 模式在浏览器中实时请求 API，始终显示最新数据
		// IMiss Blog：必须用 **dynamic**。static 会在 `pnpm build` 期间请求 api.vndb.org，
		// 一旦填上 userId（阻塞项 B-05）就会破坏"构建不依赖外网"的硬约束（ARCH.md §2 / R-DEP-04）；
		// 代价是封面下载脚本会跳过（它要求 mode === "static"），而本站 downloadCovers 本来就是 false。
		mode: "dynamic",
		// 构建时下载并压缩封面到 public/vndb-covers，图片由本站服务器提供
		downloadCovers: false,
		// VNDB API 地址
		apiUrl: "https://api.vndb.org/kana",
		// 条目详情页地址，末尾需要带 /
		vnBaseUrl: "https://vndb.org/",
		// 私密列表访问令牌，仅 static 模式下使用；不要把真实令牌提交到公开仓库！
		apiToken: "",
		// NSFW 处理："off" 不过滤 | "blur" 仅模糊封面 | "hide" 隐藏条目
		nsfw: "hide",
	},

	// ── MyAnimeList配置（IMiss Blog：页面改名为「番剧」，功能不变）──────────────────────────────────
	mal: {
		// MyAnimeList 用户名（列表需为公开状态，私密列表无法读取）
		// IMiss Blog：原值是模板作者的示例用户名，已清空（R-ID-05）。
		// username 与 clientId 任一为空，构建期就不会发起任何请求（页面显示"未配置"卡片）
		username: "",
		// MyAnimeList Client ID，在 https://myanimelist.net/apiconfig 注册免费应用后获取
		// IMiss Blog：原值是一串 32 位十六进制、且**带一个前导制表符**的凭据（上游示例），已清空。
		// 注意 utils/mal-utils.ts 会把该值原样写进请求头（不做 trim），填入时不要带空白
		clientId: "",
		// MAL API 地址
		apiUrl: "https://api.myanimelist.net/v2",
		// 动画条目详情页地址，末尾需要带 /
		animeBaseUrl: "https://myanimelist.net/anime/",
		// 漫画条目详情页地址，末尾需要带 /
		mangaBaseUrl: "https://myanimelist.net/manga/",
		// NSFW 处理："off" 不过滤 | "blur" 仅模糊封面 | "hide" 隐藏条目
		nsfw: "hide",
	},

	// ── 图像优化配置 ──────────────────────────────────
	// 图像优化压缩只保留avif或webp
	// 响应式图像是为在不同设备上提高性能而调整的图像。这些图像可以调整大小以适应其容器，并且可以根据访问者的屏幕尺寸和分辨率以不同的大小提供。
	// Astro 仅能对 src 目录下的图像进行优化，src 目录下的图像越多，构建时间会越长
	// Astro 图像文档 https://docs.astro.build/zh-cn/guides/images/
	imageOptimization: {
		// 输出图片格式
		// - "avif": 仅输出 AVIF 格式（最新技术，最小体积，目前兼容性较低，构建时间较长）
		// - "webp": 仅输出 WebP 格式（体积适中，兼容性好，构建时间短）
		// - "both": 同时输出 AVIF 和 WebP（浏览器自动选择最佳格式）
		formats: "webp",
		// 图片压缩质量 (1-100)，值越低体积越小但质量越差，推荐 70-85
		quality: 85,
		// 为特定域名的图片添加 referrerpolicy="no-referrer" 属性
		// 支持通配符 *，例如：["i0.hdslb.com", "*.bilibili.com"]
		// 可解决指定域名图片加载时的 403 问题（如防盗链图片）
		noReferrerDomains: [
			"*.hdslb.com",
			"*.bilibili.com",
			"*.myanimelist.net",
			"*.vndb.org",
		],
	},

	// ── 订阅 (RSS / Atom) 配置 ──────────────────────────────────
	// ⚠️ IMiss Blog（R-ID-06）：订阅功能已整体移除——/rss/ /atom/ /rss.xml /atom.xml 四个路由、
	// 页脚与首页横幅的订阅入口、head 里的 <link rel="alternate">，以及 src/utils/feed-utils.ts 都已删除。
	// 因此下面的 feed 配置**已没有任何消费方**，留着只是为了不动上游的 type 定义。
	// 要恢复订阅：按 ARCH.md §14.4 的清单把文件从上游找回来。
	// feed: {
	// 	// 订阅条目内容模式："full" 全文 / "summary" 仅摘要
	// 	contentMode: "full",
	// },

	// 站点语言，在本配置文件顶部SITE_LANG定义
	lang: SITE_LANG,

	// 页面开关配置，在本配置文件顶部pages定义
	pages,
};
