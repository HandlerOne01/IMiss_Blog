/**
 * 书签导航「官方品牌色」单一事实来源
 * ============================================================================
 * 为什么单独放一个模块：这些色值有**两个消费者**，必须同源，否则一定会漂：
 *   ① `src/config/booknavConfig.ts` —— 写进每条书签的 `iconColor`
 *   ② `scripts/fetch-booknav-icons.mjs` —— 抓 favicon 时生成
 *      `public/booknav-icons/README.md` 的来源表
 *
 * ⚠️ **这张表的键 = 一条卡片的品牌标识**，**29 个键**对应被 `iconColor` 引用的 **28 条卡**
 *    （另一条 `腾讯云` 是有意不引用的登记项，见文件末尾）。**键名要逐字等于卡片标题** ——
 *    断言（R-BOOKNAV-06）是按**卡片标题**索引本表做逐张核对的，标题与本表键名对不上的卡
 *    会**静默漏掉核对**（v1.88 第一版把新卡的键写成短名，27 张 svg 只核对了 26 张才发现）。
 *    ⚠️ **v1.88 计数演进**：v1.57~v1.87 是「28 个键 / 被引用 27 条」，v1.88 加了一条卡
 *    「MiniMax 媒体平台」→ **29 个键 / 被引用 28 条**。其中三对是**同品牌两条卡**：
 *    `DeepSeek` / `DeepSeek 开放平台`、`ChatGPT` / `OpenAI Platform`、
 *    `LangChain 中文文档` / `LangChain 官方文档`（`LangSmith` 与它们同色但独立成键）——
 *    色值相同、键各自独立，**这不是重复**：断言（R-BOOKNAV-06）按**卡片标题**索引品牌色
 *    做逐张核对，共用一个键会让另一条卡静默漏掉核对（实测：26 张里只核对了 24 张）。
 *    静态审计脚本 `reports/_bni-audit.mjs` 的 ②/⑦ 两条专门钉这件事。
 *
 * ⚠️ **深色主题**：`#181717`（GitHub）/ `#1C3C3C`（LangChain）这类近黑品牌色放在深色卡上
 *    等于看不见。处理方式是**主题色感知**的，不是"整体提亮到发白"：
 *      · 亮色：原样使用品牌色（`--brand-c` 的初值）
 *      · 深色：`color-mix(in oklab, <品牌色> 55%, white)` —— 保留色相，只抬亮度
 *    55% 是**实测选出来的**：22 个渲染色在深色卡片（zinc-800 #27272A）上全部 ≥ 3:1，
 *    最低是 GitHub 的 3.24:1（它在亮色下是 16.26:1，白底黑 logo 的反面）。
 *    备用的 `dark` 字段（逐色显式深色值）**当前一个都没启用**：它是留给"某个色在
 *    `color-mix` 下仍不够 3:1"时的显式逃生口，够用时就不该用它（少一处特例少一处漂移）。
 *
 * 验算脚本：`reports/_bni-lift.mjs`（离线，同一条 WCAG 公式）；
 * 浏览器实测：`reports/_bni-colorprobe.mjs` 与 `scripts/verify-ui.mjs` 的 R-BOOKNAV-07。
 *
 * ⚠️ 下面这张表的**键**必须与 `booknavConfig.ts` 里 `brandHex("…")` 的实参逐字相同；
 *    改键名时两处一起改，否则 `brandHex()` 会在构建期抛错（这是有意的，别改成静默兜底灰）。
 */

/** 深色主题下把品牌色往白里混的比例（`color-mix(in oklab, brand 55%, white)`） */
export const BRAND_DARK_MIX_PERCENT = 55;

export type BrandColorEntry = {
	/** 官方品牌色（亮色主题直接用这个） */
	light: string;
	/** 深色主题用的色值；留空表示用 `color-mix(in oklab, light 55%, white)` 现算 */
	dark?: string;
	/** 为什么是深色例外（只在 `dark` 存在时写） */
	darkReason?: string;
	/** 这个颜色的来源说明（报告里要能自证） */
	source: string;
};

export const BOOKNAV_BRAND_COLORS: Record<string, BrandColorEntry> = {
	DeepSeek: {
		light: "#4D6BFE",
		source: "DeepSeek 品牌蓝（官方站 / 开放平台同一套）",
	},
	ChatGPT: {
		light: "#10A37F",
		source: "OpenAI 品牌绿（openai.com 主色；ChatGPT 与 Platform 共用）",
	},
	Claude: { light: "#D97757", source: "Anthropic Claude 品牌橙（官方品牌色）" },
	Gemini: { light: "#8E75B2", source: "Google Gemini 品牌紫（渐变中段色）" },
	// ⚠️ Grok 在已装的 5 个图标包里没有独立图标（`grok` 不存在），用 xAI 的 X 标志
	//    （`simple-icons:x`），因此配色也取 X 的官方蓝 —— 图标与颜色必须指同一个品牌。
	Grok: { light: "#1D9BF0", source: "X（xAI）官方蓝" },
	"即梦 AI": {
		light: "#325AB4",
		source: "字节跳动品牌蓝（即梦属字节，取母品牌蓝）",
	},
	火山方舟: { light: "#1664FF", source: "火山引擎（Volcengine）品牌蓝" },
	"Hugging Face": {
		light: "#FFD21E",
		source: "Hugging Face 品牌黄（官方 emoji 底色）",
	},
	// LangChain 三条（LangSmith / 中文文档 / 官方文档）同属一个品牌，共用墨绿
	LangSmith: { light: "#1C3C3C", source: "LangChain 官方墨绿" },
	"LangChain 中文文档": {
		light: "#1C3C3C",
		source: "LangChain 官方墨绿（同品牌）",
	},
	"LangChain 官方文档": {
		light: "#1C3C3C",
		source: "LangChain 官方墨绿（同品牌）",
	},
	// ⚠️ 这两个键是**同品牌另一条卡的别名**，不是新颜色：
	//    `booknavConfig.ts` 里「DeepSeek 开放平台」写的是 `brandHex("DeepSeek 开放平台")`、
	//    「OpenAI Platform」写的是 `brandHex("OpenAI Platform")`（各自的卡名原文），
	//    它们与 DeepSeek / ChatGPT 用的是**同一个色值**。
	//    为什么要留别名而不是让两条卡都写 `brandHex("DeepSeek")`：
	//      · 断言（`scripts/verify-ui.mjs` 的 R-BOOKNAV-06）是按**卡片标题**索引品牌色做逐张核对的；
	//        没有这两个键，「DeepSeek 开放平台」与「OpenAI Platform」两张卡会被**静默跳过核对**
	//        （实测：26 张里只核对了 24 张，总数却照样显示"通过"）。
	//      · 别名键让"这两张卡该用哪个品牌色"在配置里一眼看得出，而不是靠读者去推断同品牌。
	"DeepSeek 开放平台": {
		light: "#4D6BFE",
		source: "DeepSeek 品牌蓝（同 DeepSeek，别名键）",
	},
	"OpenAI Platform": {
		light: "#10A37F",
		source: "OpenAI 品牌绿（同 ChatGPT，别名键）",
	},
	洛谷: { light: "#2F80ED", source: "洛谷官方主色" },
	"力扣 LeetCode": { light: "#FFA116", source: "LeetCode 官方橙" },
	GitHub: { light: "#181717", source: "GitHub 品牌黑" },
	Gitee: { light: "#C71D23", source: "Gitee 官方红" },
	CSDN: { light: "#FC5531", source: "CSDN 官方橙红" },
	// ⚠️ **第 21 条没有"官方品牌色"可查**：chat-sdk.dev 没有公开的品牌规范，
	//    任务书本身也标了"（无品牌）"。这里取 Tailwind indigo-500 作为显式占位，
	//    报告里点名说明 —— 它不是查到的事实。
	"Chat SDK": {
		light: "#6366F1",
		source: "无公开品牌规范 → 取 indigo-500 作为显式占位（报告中已点名）",
	},
	npm: { light: "#CB3837", source: "npm 官方红" },
	FreeCAD: { light: "#418FDE", source: "FreeCAD 官方蓝" },
	"腾讯位置服务 · 开发文档": {
		light: "#0052D9",
		source: "腾讯位置服务（lbs.qq.com）官方蓝",
	},
	华为云: { light: "#CF0A2C", source: "华为 / 华为云官方红" },
	Docker: { light: "#2496ED", source: "Docker 官方蓝" },
	"Canva 可画": { light: "#00C4CC", source: "Canva 官方青" },
	Google: { light: "#4285F4", source: "Google 品牌蓝（四色 logo 中的蓝）" },
	// ⚠️ **字母块例外**：happy.bigmess.org 整站 503（实测 chrome / curl / Googlebot 三种 UA
	//    与 http/https/www/裸域全部 503；`bigmess.org` / `bigme.pro` 裸域 DNS 直接失败），
	//    取不到任何官方图形；Google s2 兜底拿回来的是**通用地球占位图**（不是品牌图标，
	//    已按像素哈希识别并丢弃）。所以这一条按任务书允许的例外走**带品牌色的字母块**。
	//    品牌色取 violet-600 —— 这是"颜色待定"的显式选择，不是查到的事实，报告里点名说明。
	"BigME.Pro": {
		light: "#7C3AED",
		source:
			"站点不可达 → 品牌色不可考，取 violet-600 作为显式占位（报告中已点名）",
	},
	// ⚠️ 这一条是**有意不被配置引用**的（`booknavConfig.ts` 里腾讯云走本地 favicon `<img>`，
	//    自带真彩色，不需要 iconColor）。留着的理由：报告与断言要核对"腾讯云官方蓝"。
	//    所以 `reports/_bni-audit.mjs` 的"没被引用的键"检查里它是**已知白名单**。
	// v1.88：MiniMax 媒体平台（发起人给的 design.minimax.cn 那条卡）。
	// ⚠️ 它的品牌色是**一组渐变**（官网同时用 粉红 #f52c6b / 橙 #ff7045 / 紫 #6f2cf5 / 蓝 #16a9f3），
	//    没有单一官方色值表可抄 → 这里取**两个官网页面上都出现的那支粉红**，来源写在 source 里。
	// ⚠️ **键名必须逐字等于卡片标题**：`verify-ui.mjs` 那条「27 张 iconify 卡的亮色图标色逐张
	//    等于配置里的品牌色」是**按卡片标题**来索引这张表的（`EXPECT_BOOKNAV_BRAND_HEX` 是
	//    `卡片标题 ∩ 本表键名`），键写成短名 `MiniMax` 会让这张卡**静默漏掉核对** ——
	//    第一版就是短名，实测总数停在 26（27 张 svg 只核对了 26 张）才发现。
	"MiniMax 媒体平台": {
		light: "#F52C6B",
		source:
			"MiniMax 官网（minimax.io / minimaxi.com）页面里出现的品牌粉红 #f52c6b（官网是渐变品牌色，无单一官方色值；这一支两个站点都有）",
	},
	腾讯云: {
		light: "#0052D9",
		source:
			"腾讯云官方蓝（本卡片用本地 favicon，仅作登记，不被 iconColor 引用）",
	},
};

/** 允许"登记了但不被任何 `iconColor` 引用"的键（其余键没被引用就是打错名字了） */
export const BOOKNAV_UNREFERENCED_BRAND_KEYS: readonly string[] = ["腾讯云"];

/**
 * 取某条书签的品牌色，未登记时返回 `null`。
 * ⚠️ 返回 `null` 而不是抛错：品牌色是**增强**，没登记不该让构建挂掉。
 * 需要"登记缺失必须响亮报错"的场合用下面的 `brandHex()`。
 */
export function brandColorFor(title: string): BrandColorEntry | null {
	return BOOKNAV_BRAND_COLORS[title] ?? null;
}

/**
 * 配置里写 `iconColor` 用的取值函数：**未登记就抛**。
 *
 * 为什么这里要抛而不是静默返回灰色：`booknavConfig.ts` 里写的是
 * `iconColor: brandHex("DeepSeek")` 这种**键引用**，而键名是人手打的。
 * 一旦打错（或品牌表里那条被删了），静默兜底灰的后果是：那张卡的图标悄悄变回
 * 旧的 `text-neutral-700` 灰色 —— 页面上看不出来是"忘了登记"还是"这条本来就没品牌色"，
 * 正是本项目反复踩的"静默降级"。抛错会在 `pnpm build` / `pnpm check` 当场炸出来。
 *
 * ⚠️ 有一处**复用不算错**：`brandHex("ChatGPT")` 同时被 ChatGPT 与 OpenAI Platform 两条卡
 *    引用、`brandHex("DeepSeek")` 同时被 DeepSeek 与 DeepSeek 开放平台引用 —— 同一个品牌。
 */
export function brandHex(brandKey: string): string {
	const entry = BOOKNAV_BRAND_COLORS[brandKey];
	if (!entry) {
		throw new Error(
			`[booknav] 品牌色表里没有「${brandKey}」：请先在 src/constants/booknav-brand-colors.ts 的 BOOKNAV_BRAND_COLORS 里加一条，并让 booknavConfig.ts 的 brandHex("…") 实参与键名逐字相同`,
		);
	}
	return entry.light;
}
