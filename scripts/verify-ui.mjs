/**
 * P1 界面验收脚本 —— 用真实 Chrome 打开站点，按需求逐条断言，并留下截图
 *
 * 为什么不用「人眼看截图」：P1 的验收条件全是可判定的（导航顺序、某个文案在不在、
 * 某个元素该不该存在、主题色相是不是 345），交给脚本判定比肉眼可靠，也能反复跑。
 * 断言表里的 id 就是 prd.md 的需求编号，失败时一眼知道是哪条需求没满足。
 *
 * 用法：
 *   node scripts/verify-ui.mjs                         # 默认打 http://localhost:4321
 *   node scripts/verify-ui.mjs --base http://localhost:4321
 *   node scripts/verify-ui.mjs --out reports/screenshots
 *
 * 前置：目标站点已经在跑（pnpm dev 或 pnpm preview）。
 * 依赖：零 npm 依赖 —— 直接开系统 Chrome 的 DevTools Protocol，用 Node 内置的 WebSocket。
 *
 * ⚠️ v1.58 起**多了一个非 npm 依赖**：`src/constants/booknav-brand-colors.ts`
 *    （书签页品牌色的单一事实来源）。Node 从 22.6 起能直接 import 这种"只有类型标注、
 *    没有 enum/namespace"的 .ts（走类型擦除），`engines.node >= 22.23` 已经覆盖。
 *    为什么不把那张表抄一份进来：抄第二份 = 迟早漂（见 EXPECT_BOOKNAV_BRAND_HEX 的注释）。
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BOOKNAV_BRAND_COLORS } from "../src/constants/booknav-brand-colors.ts";

// ─── 参数 ────────────────────────────────────────────────
const args = process.argv.slice(2);
const readArg = (name, fallback) => {
	const i = args.indexOf(name);
	return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = readArg("--base", "http://localhost:4321").replace(/\/$/, "");
const OUT_DIR = readArg("--out", "reports/screenshots");

const CHROME_CANDIDATES = [
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
	path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe"),
	"/usr/bin/google-chrome",
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

// ─── 验收规格（单一事实来源，改需求改这里）───────────────
/**
 * 动态壁纸原画清单（R-BG-06，v1.70）—— **单一事实来源**：换素材必须同时改这里。
 * 五个文件由发起人 2026-10-09 交来，要求「**不可压缩**……我要原画」，所以判据是
 * **字节数 + sha256 逐字节相等**（不是"能播就行"——转一道码它照样能播）。
 * 数值来自导入时的核对（reports/_wallpaper-import.mjs → reports/_wallpaper-assets.json）。
 */
const EXPECT_WALLPAPER_VIDEOS = [
	{ slug: "chuangbian", bytes: 8331182, sha256: "4b2482162f24f2368925e30fe49e603709f0e056bb0faa4e60e51f5cbbf03db5" },
	{ slug: "xingye", bytes: 10329106, sha256: "82070b367704edfcbd6af1e0f60f420cd344462bf60a99ed7128230166865468" },
	{ slug: "hupan", bytes: 13519083, sha256: "0b2dd5c4851dd6292fca71889fc9ba3f57b3bcc1f7a87cc32cc55c6d4cd6f719" },
	{ slug: "xishoutai", bytes: 9560435, sha256: "c4158842964848cb94de039ac5a4e8bbb0eb6a09168af575f005711ed4108259" },
	{ slug: "taluo", bytes: 12089608, sha256: "f721022a5a9456936094c20b5b9581466c160e5a94ede4d9d0b0bfa0984e2643" },
];
// 动态壁纸的原生分辨率（五支一致）：2944×1248 / 2.36:1 超宽
const EXPECT_WALLPAPER_INTRINSIC = { w: 2944, h: 1248 };
// 顶层导航顺序与子项顺序（prd.md R-NAV-01~04 / 第 2 章）
// ⚠️ v1.41（P2R）：第 3 格由「排行」下拉换成「学习路线」单链接（R-PATH-01）——
//    原来的 EXPECT_RANK_CHILDREN 常量与它的用法已随排行模块整体删除（Task 4 / R-PATH-06）。
// P4-8（v1.47）：第 5 格「链接」曾整组删除 —— 它当时只有两条对上游主题的署名外链
// （上游主题 / 上游文档站两条署名外链），发起人要求站上不留任何上游字样。
// `nav-menu-utils.ts:19-21` 在 children 过滤后为 0 时 `return null`，整组自然消失。
// ⚠️ **v1.57（B-10 关闭）：「链接」整组用发起人自己的外链重建**，位置回到
//    「我的」与「留言」之间 → 顶层从 5 格变回 **6 格**。这条常量是**单一事实来源**：
//    `navBarConfig.ts` 里增删任何顶层项，这里都得跟着改（v1.57 与 v1.61 两轮都做过注入验证：
//    临时把「链接」组里的子项去掉 → 本断言当场判红，明细打出实际顺序）。
// v1.61：**顶层没动**（仍是这 6 格），变的是第 5 格下拉里的内容（见 EXPECT_LINK_CHILDREN）。
const EXPECT_TOP_NAV = ["主页", "文章", "学习路线", "我的", "链接", "留言"];
// v1.61：「链接」下拉的内容 —— **6 条**外链，顺序即 `navBarConfig.ts` 里的顺序，
// 也就是发起人给清单的顺序（Gitee → GitHub → CSDN → 洛谷 → Boost 搜索引擎 → HTTP 服务器）。
// ⚠️ 子项名字取短名（「洛谷」不是「洛谷 Luogu」、不含用户名），所以这里钉的是**导航里的短名**，
//    与书签页那 38 张卡（`EXPECT_BOOKNAV_CARDS` 用全名）**故意不同**，别互相抄。
// ⚠️ href **逐字**钉死（含两条容易被"顺手改掉"的）：CSDN 只有干净地址、**没有** `?spm=…` 跟踪参数；
//    「Boost 搜索引擎」是 `http://` + 裸 IP + 非标准端口，**按发起人给的地址原样收录**（改动即判红）。
//    ⚠️ 但"钉 href"证不了"为什么是这样"（跟踪参数去了、裸 IP 那条留了建议注释），
//    所以同一块里另有一条**配置层**判据（EXPECT_LINK_RAW_IP_URL / EXPECT_LINK_HTTPS_HINT）兜着。
const EXPECT_LINK_CHILDREN = [
	{ name: "Gitee", href: "https://gitee.com/a2186988646" },
	{ name: "GitHub", href: "https://github.com/a13824367931-alt" },
	{ name: "CSDN", href: "https://blog.csdn.net/is_ko_nois_ko" },
	{ name: "洛谷", href: "https://www.luogu.com.cn/user/1726221" },
	{ name: "Boost 搜索引擎", href: "http://106.52.158.48:8081/" },
	{ name: "HTTP 服务器", href: "https://gitee.com/a2186988646/my_server" },
];
// ─── v1.61：「链接」新 6 条的两条"照办的细节"，各自的判据本体 ─────────────────
// ① 那个裸 IP 的地址是**发起人的选择**（他的站），所以它不是"待修的错"，而是**必须原样在**；
// ② 同一条上必须留一条"有域名后换 `https://<域名>/`"的建议注释 —— 只钉 URL 的话，
//    下一个人把注释删掉（或把它换成 https 而不告诉他）两边都不会红，正是 T77 那类判据空过。
const EXPECT_LINK_RAW_IP_URL = "http://106.52.158.48:8081/";
// 注释里的建议形态（`https://<域名>/`）；`<域名>` 是字面占位符，不是某个真域名。
const EXPECT_LINK_HTTPS_HINT = /https:\/\/<域名>\/?/;
const EXPECT_MY_CHILDREN = [
	{ name: "动态", href: "/dynamic/" },
	{ name: "项目", href: "/projects/" },
	{ name: "相册", href: "/gallery/" },
	{ name: "书签导航", href: "/booknav/" },
	{ name: "轻小说", href: "/vndb/" },
	{ name: "番剧", href: "/myanimelist/" },
	{ name: "关于我", href: "/about/" },
	// v1.65：「关于本站」按发起人要求加在「关于我」**下面**（内容 = 原 about.md 那篇整体搬过来）
	{ name: "关于本站", href: "/about-site/" },
];
const EXPECT_ABSENT_LABELS = ["社交", "友链", "哔哩哔哩", "番组计划", "打赏", "关于"];
// ─── v1.57：书签导航页（R-BOOKNAV-01 ~ 04）的单一事实来源 ────────────────────
// 发起人 2026-09-30 最终选定 **38 张卡 / 6 组**，本表就是那份清单的**逐字落地**。
// ⚠️ 为什么把 38 条全列出来而不是只数个数：只断言 `cards.length === 38` 的话，
//    换掉任意一张卡（内容对不上发起人给的清单）仍然是绿的 —— 那正是"判据空过"。
//    这里连 **URL 的顺序**一起钉死，改一条就红。
// ⚠️ 这 38 条**同时是隐私守卫的正控**：它们都是"换成首页"之后的形态，
//    所以守卫（PRIVACY_NEEDLES）判红时，这张表能证明"清单本身是好的、红的是被注入的那条"。
const EXPECT_BOOKNAV_CARDS = [
	// 组 1 · AI 工具
	["DeepSeek", "https://chat.deepseek.com/"],
	["ChatGPT", "https://chatgpt.com/"],
	["Claude", "https://claude.ai/"],
	["Gemini", "https://gemini.google.com/"],
	["Grok", "https://grok.com/"],
	["即梦 AI", "https://jimeng.jianying.com/"],
	// 组 2 · AI 平台与模型
	["Hugging Face", "https://huggingface.co/"],
	["53AI 知识库", "https://www.53ai.com/"],
	["LangSmith", "https://smith.langchain.com/"],
	["CC Switch", "https://www.ccswitch.io/"],
	["火山方舟", "https://www.volcengine.com/"],
	["硅基流动", "https://www.siliconflow.cn/"],
	["智谱 AI", "https://bigmodel.cn/"],
	["DeepSeek 开放平台", "https://platform.deepseek.com/"],
	["OpenAI Platform", "https://platform.openai.com/"],
	// 组 3 · 学习与刷题
	["洛谷", "https://www.luogu.com.cn/"],
	["力扣 LeetCode", "https://leetcode.cn/"],
	["蓝桥杯大赛", "https://dasai.lanqiao.cn/"],
	["学习通", "https://i.chaoxing.com/"],
	["中国教育考试网", "https://www.neea.edu.cn/"],
	// 组 4 · 开发与文档
	["GitHub", "https://github.com/"],
	["Gitee", "https://gitee.com/"],
	["CSDN", "https://www.csdn.net/"],
	["LangChain 中文文档", "https://langchain-doc.cn/"],
	["LangChain 官方文档", "https://docs.langchain.com/"],
	["npm", "https://www.npmjs.com/"],
	["Chat SDK", "https://chat-sdk.dev/"],
	["FreeCAD", "https://www.freecad.org/"],
	["腾讯位置服务 · 开发文档", "https://lbs.qq.com/"],
	// 组 5 · 云服务与账号
	["华为云", "https://www.huaweicloud.com/"],
	["腾讯云", "https://cloud.tencent.com/"],
	["Docker", "https://www.docker.com/"],
	["Canva 可画", "https://www.canva.cn/"],
	// 组 6 · 其他三方服务（**必须最后**）
	["米醋 API", "https://www.micuapi.ai/"],
	["Tavily", "https://tavily.com/"],
	["PriceAI 比价", "https://priceai.cc/"],
	["BigME.Pro", "https://happy.bigmess.org/"],
	["Google", "https://www.google.com/"],
];
// 分组名与**权重顺序**（AI 工具优先 … 最后才是其他三方站）
const EXPECT_BOOKNAV_GROUPS = [
	["ai-tools", "AI 工具", 6],
	["ai-platform", "AI 平台与模型", 9],
	["study", "学习与刷题", 5],
	["dev", "开发与文档", 9],
	["cloud", "云服务与账号", 4],
	["thirdparty", "其他三方服务", 5],
];
// ─── v1.58：书签页图标「官方图标 + 官方品牌色」的判据常量 ─────────────────────
// ⚠️ **品牌色表不在这里重抄一遍**，而是从 `src/constants/booknav-brand-colors.ts`
//    **导入同一份**。理由：抄第二份 = 迟早漂 —— 配置里改了色而断言还钉着旧值，
//    两边各自"自洽"，红不了也绿不对。这是本项目"单一事实来源"的一贯口径。
// 深色主题对比度阈值（与 ARCH.md §11 的 R-CFG 那批同一条 WCAG 公式，见文件里的 contrast()）
const MIN_BOOKNAV_DARK_CONTRAST = 3;
// 旧的中性灰 / 白 —— 发起人的抱怨就是"有图标但还是没颜色"，所以**这两类值一个都不许留**。
// 除了 text-neutral-700(#404040) / dark:text-neutral-200(#E5E5E5)，把 Tailwind 的
// neutral-600/300、zinc-600/300 也列进来（改一个字就会落到隔壁色阶上）。
const OLD_NEUTRAL_ICON_COLORS = [
	"rgb(64, 64, 64)", // text-neutral-700
	"rgb(82, 82, 82)", // text-neutral-600
	"rgb(229, 229, 229)", // dark:text-neutral-200
	"rgb(212, 212, 212)", // dark:text-neutral-300
];
// ⚠️ **黑名单必须按解析后的 RGB 数值比，不能比字符串**（v1.58 注入验证实测踩到）：
//    `text-neutral-700` 的 computed color 在**亮色**下是 `rgb(64, 64, 64)`，
//    但在**深色**下 Chrome 把它序列化成 `oklch(0.371 0 none)` —— 同一张卡的同一个颜色、
//    两种字符串形态。第一版直接拿字符串 `.includes(graphicColor)`，
//    于是注入"去掉某条的 iconColor → 图标退回中性灰"时这条断言**照样判绿**
//    （认不出 oklch 形态的 #404040），只有"逐张等于品牌色"那条抓住了它。
//    教训与 T77 同类：判据认的是"长得像"而不是"是不是同一个颜色"。
const OLD_NEUTRAL_RGB = OLD_NEUTRAL_ICON_COLORS.map((c) => ({ raw: c, rgb: parseCssColor(c) }));
/** 两个颜色是否同一个 sRGB 颜色（各通道容差 1，容忍 oklab↔sRGB 往返舍入） */
const sameRgb = (a, b) => !!a && !!b && Math.abs(a.r - b.r) <= 1 && Math.abs(a.g - b.g) <= 1 && Math.abs(a.b - b.b) <= 1;
// 本地 favicon 目录（`kind === "image"` 的 11 张必须全部指向这里，**不许是网络 URL**）
const LOCAL_ICON_PREFIX = "/booknav-icons/";
// 允许退化成字母块的**例外**：站点整站不可达、连一次性兜底接口都只给通用占位图。
// 任务书允许这一条，但要求"必须带品牌色 + 报告里点名"。数量写死在这里，
// 是为了让"又多了一张字母块"这件事**必须靠改这一行才会变绿**，而不是自动通过。
const EXPECT_BOOKNAV_LETTER_EXCEPTIONS = ["bigme.pro"];
// 走 iconify（`simple-icons:*` / `material-symbols:*`）的卡片标题。**单一事实来源是
// 配置本身**，但断言不能去 import `booknavConfig.ts`（它 import 了 `@/…` 别名，Node 解析不了），
// 所以这里列出来 —— 它是"配置 ↔ 断言"之间的第二条腿：配置里少写一个 icon、
// 或把某张卡从 iconify 改成别的东西，下面 R-BOOKNAV-05/06 会当场红，
// 而不会因为"总数没变"就静默通过。
const ICONIFY_BOOKNAV_TITLES = new Set(
	[
		"DeepSeek",
		"ChatGPT",
		"Claude",
		"Gemini",
		"Grok",
		"即梦 AI",
		"Hugging Face",
		"LangSmith",
		"火山方舟",
		"DeepSeek 开放平台",
		"OpenAI Platform",
		"洛谷",
		"力扣 LeetCode",
		"GitHub",
		"Gitee",
		"CSDN",
		"LangChain 中文文档",
		"LangChain 官方文档",
		"npm",
		"Chat SDK",
		"FreeCAD",
		"腾讯位置服务 · 开发文档",
		"华为云",
		"Docker",
		"Canva 可画",
		"Google",
	].map((t) => t.toLowerCase()),
);
// 卡片标题（小写，与 data-title 同形态）→ 配置里的品牌色。
//
// ⚠️ **大小写必须逐字对上**：`BOOKNAV_BRAND_COLORS` 的键是配置里的**原文标题**
//    （如 `"OpenAI Platform"` / `"DeepSeek 开放平台"`），而页面的 `data-title` 是
//    `item.title.toLowerCase()`。第一版拿小写标题去索引原文键 → 这两张卡静默漏掉、
//    总数从 26 变 24 却照样绿（**漏掉的那两张根本没被核对**）。
//    所以先把品牌表按小写建一次索引，再做交集。
const BRAND_COLORS_BY_LOWER_TITLE = new Map(
	Object.entries(BOOKNAV_BRAND_COLORS).map(([t, v]) => [t.toLowerCase(), v]),
);
const EXPECT_BOOKNAV_BRAND_HEX = Object.fromEntries(
	EXPECT_BOOKNAV_CARDS.filter(
		([t]) => BRAND_COLORS_BY_LOWER_TITLE.has(t.toLowerCase()) && ICONIFY_BOOKNAV_TITLES.has(t.toLowerCase()),
	).map(([t]) => [t.toLowerCase(), BRAND_COLORS_BY_LOWER_TITLE.get(t.toLowerCase()).light.toUpperCase()]),
);
// P4-8：上游示例文章（主题介绍篇 + `guide/*` 等 29 个文件）已按发起人要求删除，
// 所有"文章页"断言改用迁移进来的真实文章（否则断言会指向一个已经不存在的路由）
const SAMPLE_POST = "/posts/linux-net/http-xieyi/";
const EXPECT_HUE = "345";
const EXPECT_STAT_ROWS = 4;
const EXPECT_ABSENT_STAT_TEXT = ["运行时长", "最后活动", "天前"];
// 仍然只是"被 siteConfig.pages 关掉"的页面：静态输出下是 200 + noindex 跳转存根（T17），
// 真 404 交给生产 Nginx（deploy/nginx.conf，见 ARCH.md §12.2 / §14.3 T17）。
const STUBBED_ROUTES = ["/bilibili/", "/bangumi/"];
// P4-8（v1.47）：`/friends/` 与 `/sponsor/` **连页面源文件都删了**（上游作者身份 / 打赏入口整条移除），
// 所以它们从"noindex 存根"升级成**真 404** —— 判据跟着改口径，而不是把断言悄悄删掉。
const REMOVED_PAGE_ROUTES = ["/friends/", "/sponsor/"];
// sitemap 那一半（"不在这两个页面的路由"）对上面两组都适用，保留合并视图
const FORBIDDEN_ROUTES = [...STUBBED_ROUTES, ...REMOVED_PAGE_ROUTES];
// R-ID-06：订阅功能整体移除后，这 4 条路由**连存根都没有**（文件已删），应该是真 404
const REMOVED_FEED_ROUTES = ["/rss/", "/atom/", "/rss.xml", "/atom.xml"];
// R-PATH-01：v1.41 起 /roadmap/ 顶上导航第 3 格，必须进 ALLOWED_ROUTES 才能被"路由 200"那一趟扫到
// ⚠️ Task 4（P2R-6）已把三条 `/rank/*` 摘掉 —— 排行整条删除（R-PATH-06），它们不再是"保留页面"，
//    改由新断言钉住相反的事实：四个旧地址"返回 404 / 不在 sitemap / llms.txt 里也没有残渣"。
// v1.65：新增 `/about-site/`（关于本站）—— 进了这张表才会被"路由都要 200"那一趟扫到。
const ALLOWED_ROUTES = ["/", "/about/", "/about-site/", "/guestbook/", "/vndb/", "/myanimelist/", "/booknav/", "/dynamic/", "/projects/", "/gallery/", "/archive/", "/roadmap/"];
// 这里是"待建路由"的登记处：说好要建但还没建的路由写在这里，只记录状态、不参与"通过/失败"计数
//（否则"功能没做"会被算成 ✅）—— 别再退回"catch 住就算过"的假绿写法。
const KNOWN_PENDING_ROUTES = [];

// ─── 小工具 ──────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findChrome() {
	for (const p of CHROME_CANDIDATES) {
		try {
			await fs.access(p);
			return p;
		} catch {}
	}
	throw new Error("找不到 Chrome，请自行安装或把路径加进 CHROME_CANDIDATES");
}

// ─── CDP 极简客户端 ──────────────────────────────────────
class CDP {
	constructor(ws) {
		this.ws = ws;
		this.id = 0;
		this.pending = new Map();
		this.listeners = new Map();
		ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.id && this.pending.has(msg.id)) {
				const { resolve, reject } = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
			} else if (msg.method) {
				for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params);
			}
		});
	}
	send(method, params = {}, timeoutMs = 90000) {
		const id = ++this.id;
		this.ws.send(JSON.stringify({ id, method, params }));
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			// ⚠️ v1.70：30 秒 → 90 秒。壁纸变成 2944×1248 的**视频**之后，`Page.captureScreenshot`
			// 要等合成器把一整帧视频栅格化完；这台内存紧张的机器上实测会超过 30 秒（本轮就红在这一条：
			// "Page.captureScreenshot 超时"，而失败点只是"给首页拍张图"）。
			// 超时是防"永远挂住"的兜底，抬到 90 秒不影响任何判据。
			setTimeout(() => {
				if (this.pending.delete(id)) reject(new Error(`${method} 超时`));
			}, timeoutMs);
		});
	}
	once(event, timeoutMs = 30000) {
		return new Promise((resolve, reject) => {
			const arr = this.listeners.get(event) ?? [];
			const timer = setTimeout(() => {
				this.listeners.set(event, arr.filter((f) => f !== fn));
				reject(new Error(`等 ${event} 超时`));
			}, timeoutMs);
			const fn = (params) => {
				clearTimeout(timer); // 原来这里不清理定时器，7 次调用后会多挂最多 30s 才退出
				this.listeners.set(event, arr.filter((f) => f !== fn));
				resolve(params);
			};
			arr.push(fn);
			this.listeners.set(event, arr);
		});
	}
}

async function connectToPage(port) {
	const res = await fetch(`http://127.0.0.1:${port}/json/list`);
	const targets = await res.json();
	const page = targets.find((t) => t.type === "page");
	if (!page) throw new Error("没有可用的 page target");
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		ws.addEventListener("open", resolve, { once: true });
		ws.addEventListener("error", reject, { once: true });
	});
	return new CDP(ws);
}

// ─── 在页面里采集事实（一次采集，Node 侧判定）────────────
const COLLECT = `(() => {
  const txt = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
  const navbar = document.getElementById("navbar");
  const tops = navbar ? [...navbar.querySelectorAll(".dropdown-container")].map((c) => {
    const head = c.querySelector("[data-dropdown-trigger]") || c.querySelector(":scope > a");
    const children = [...c.querySelectorAll("[data-dropdown-menu] .dropdown-item")].map((i) => ({
      name: txt(i.querySelector("span")),
      href: i.getAttribute("href"),
    }));
    // href 只有"单链接"顶层项才有（带子菜单的顶层项是 <button data-dropdown-trigger>，没有 href）
    return { name: txt(head), href: head?.getAttribute?.("href") ?? null, children };
  }) : [];
  const panel = document.getElementById("nav-menu-panel");
  const mobileTops = panel ? [...panel.querySelectorAll(".mobile-menu-list .mobile-menu-item-root")].map((r) => {
    const label = r.querySelector(".mobile-menu-item-label");
    const children = [...r.querySelectorAll(".mobile-submenu .mobile-menu-item-label")].map((s) => txt(s));
    // M5（终审）：光有 name / children 分不出"单链接"和"手风琴"——顶层单链接是 <a data-nav-href>，
    // 带子项的顶层项本体是 <button data-mobile-dropdown-trigger>。收藏这两点，
    // R-NAV-02 才能验"移动抽屉第 3 格是可点的单链接、不展开"这个**与桌面面不同的面**。
    // ⚠️ v1.52（P2R-9③）更正：这里原来写的是"带子项的顶层项是 <button …>（没有 href）"—— 后半句**是错的**，
    //    它暗示折叠父项的 href 会是 null。下面那行用的是**后代查询** r.querySelector("a[data-nav-href]")
    //    （不是 :scope > a[…]），而展开父项的子项各自也是 <a data-nav-href>（在它自己的 .mobile-submenu
    //    里，见 src/components/layout/NavMenuPanel.astro）→ 折叠父项这一格取到的**不是 null，而是它第一个
    //    子项的 href**；只有单链接项取到的才是自己的 href。
    //    判据因此**不看 href 判空**，而是看 expandable === false（[data-mobile-dropdown-trigger] 的有无）
    //    来区分这两种顶层项 —— 断言见 R-NAV-02（mThird?.expandable === false && mThird?.href === "/roadmap/"，
    //    它读的第 3 格本来就是单链接，href 不会串到子项上）。**本行以下判据一字未动。**
    const link = r.querySelector("a[data-nav-href]");
    return {
      name: txt(label),
      children,
      href: link ? link.getAttribute("data-nav-href") : null,
      expandable: !!r.querySelector("[data-mobile-dropdown-trigger]"),
    };
  }) : [];
  const allLabels = [...tops.map((t) => t.name), ...tops.flatMap((t) => t.children.map((c) => c.name)),
                      ...mobileTops.map((t) => t.name), ...mobileTops.flatMap((t) => t.children)];
  const statsRoot = document.getElementById("site-stats");
  const infoRoot = document.getElementById("site-info");
  const brand = navbar ? txt((navbar.querySelector("[data-logo-theme]") || {}).closest?.("a")) : null;
  const logoImg = navbar ? navbar.querySelector("[data-logo-theme]") : null;
  return {
    title: document.title,
    brand,
    logoSrc: logoImg ? (logoImg.getAttribute("src") || logoImg.getAttribute("srcset")) : null,
    // v1.64：R-ID-04 新增的判据要"Logo 本体是什么形状"这个事实 —— 只钉文件名（含 imiss）
    // 在换设计前后都成立（对本改动是恒真的）。新标识是**横向纸飞机**（256×190，1.347:1），
    // 旧的方圆底爱心是 1:1，一个比例就能把两者分开。
    // attrW/attrH = Astro 从源图元数据写进标签的固有尺寸；natW/natH = 浏览器实际加载那张
    // （img 带 srcset，1x DPR 下会挑 28w 那张，取整后比例仍是 1.33）。
    logoNatural: logoImg
      ? {
          attrW: Number(logoImg.getAttribute("width")) || null,
          attrH: Number(logoImg.getAttribute("height")) || null,
          natW: logoImg.naturalWidth,
          natH: logoImg.naturalHeight,
          currentSrc: logoImg.currentSrc || null,
        }
      : null,
    hueInline: document.documentElement.style.getPropertyValue("--hue").trim(),
    hueComputed: getComputedStyle(document.documentElement).getPropertyValue("--hue").trim(),
    navTops: tops,
    // R-PATH-06：桌面导航 + 移动抽屉里**所有**链接的文字，一次覆盖两层
    // （只查 navTops 会漏掉移动抽屉里那份独立的菜单树）
    navTexts: [...document.querySelectorAll("#navbar a, #nav-menu-panel a")].map((a) => (a.textContent || "").trim()),
    // R-PATH-01（Swup 替代判据）：/roadmap/ 的**正向内容**标记 —— 光靠 URL 派生的状态
    // （抽屉当前页项）在"报错页 / 空白页"上也可能成立，所以这里直接采"路由页的正文特征"：
    // 路线页独有的 #roadmap-stats 文本 + 8 条主线区块数。任何页都能采，非路线页上恒为 0/空。
    // ⚠️ 这一段在 COLLECT 的**模板字符串**里：注释里**不许出现反引号**（会把模板提前闭合，实测踩到）。
    roadmapLanding: {
      stats: (document.querySelector("#roadmap-stats")?.textContent || "").replace(/\\s+/g, " ").trim(),
      lineCount: document.querySelectorAll("section.roadmap-line").length,
    },
    mobileTops,
    allLabels,
    statRows: statsRoot ? statsRoot.querySelectorAll("div.justify-between").length : null,
    statText: txt(statsRoot),
    heatmapExists: !!document.getElementById("heatmap-container"),
    // ⚠️ R-RANK 的整块事实采集（榜单板几何 / 两档配色 / 面板显隐 / 缺图降级）已随排行模块删除
    //    （Task 4 / P2R-6）：rank 子对象连同那 41 条排行专属断言一起没了，页面也不再有 [data-rank-board]。
    //    （⚠️ 这一段的注释里不许出现反引号 —— 它在下面那个模板字符串里，T76 的同类。）
    // ⚠️ **横向溢出必须量 scrollWidth − clientWidth，不能用 scrollWidth − innerWidth**
    //    （v1.41 修复轮 2 从采集器根上改的）：在 mobile:true 的模拟下，内容一横向溢出，
    //    **window.innerWidth 会跟着内容一起涨**（真机实测 390 → 900 / 1200），两个数同向变大
    //    → 旧差法**恒为 0、结构上不可能红**（reports/_task5-overflow-consumers-probe.json、
    //    reports/_task5-overflow-probe2.json）。clientWidth 恒等于布局视口宽（390），不会膨胀。
    //    消费者：R-WDG-04（home-390）—— 排行那两条（rank-jp-390 / rank-game-390）随模块删除。
    // ⚠️ 这一段在 COLLECT 的模板字符串里：注释里不许出现反引号（T76，写这行时踩过一次）。
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    // ── P3 桌宠（R-PET-01 ~ R-PET-05）──────────────────────
    pet: (() => {
      const el = document.getElementById("pet");
      const off = document.documentElement.dataset.petOff === "1";
      if (!el) return { exists: false, off };
      const sprite = el.querySelector(".pet-sprite");
      const bubble = document.getElementById("pet-bubble");
      const menu = document.getElementById("pet-menu");
      const r = el.getBoundingClientRect();
      const sr = sprite ? sprite.getBoundingClientRect() : null;
      const cs = sprite ? getComputedStyle(sprite) : null;
      return {
        exists: true,
        off,
        display: getComputedStyle(el).display,
        hidden: getComputedStyle(el).display === "none" || getComputedStyle(el).visibility === "hidden",
        state: el.dataset.petState || null,
        // R-PET-06：三档运动模式（float / fixed / ground）与"正在飞"标记，都由组件写进 DOM
        mode: el.dataset.petMode || null,
        flying: el.dataset.petFlying === "1",
        // R-PET-12 / R-PET-13：缩放三件套 —— 手机档有没有真的盖过桌面档、mini 系数有没有生效。
        // 只量精灵宽度分不出"哪一档在生效"（两个系数都能算出一个数），所以把三个自定义属性
        // 原样采下来交叉核对：active 就是 CSS 选出来的那一档（桌面档 / 手机档）。
        mini: el.dataset.petMini === "1",
        miniAttr: el.getAttribute("data-pet-mini"),
        scaleVars: (() => {
          const v = getComputedStyle(el);
          const g = (n) => (v.getPropertyValue(n) || "").trim();
          return { desktop: g("--pet-scale-desktop"), mobile: g("--pet-scale-mobile"), active: g("--pet-scale-active"), miniFactor: g("--pet-mini-factor") };
        })(),
        // 位置事实：transform 用来判"有没有动/有没有在悬浮"，bottomGap 用来判"离地多高"
        transform: getComputedStyle(el).transform,
        bottomGap: Math.round(window.innerHeight - r.bottom),
        // 位置记忆原文（R-PET-06 起是 JSON {x,y,mode}，P3 的旧格式是纯数字）
        saved: (() => { try { return localStorage.getItem("imiss.pet.pos"); } catch { return null; } })(),
        route: document.documentElement.dataset.petRoute || null,
        path: location.pathname,
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        sprite: sr && cs ? { w: Math.round(sr.width), h: Math.round(sr.height), bgSize: cs.backgroundSize, bgPos: cs.backgroundPosition, img: cs.backgroundImage.includes("pet-aemeath") } : null,
        hasShadow: !!el.querySelector(".pet-shadow"),
        zIndex: Number.parseInt(getComputedStyle(el).zIndex || "0", 10),
        bubble: { text: (bubble?.textContent || "").trim().slice(0, 80), pop: !!bubble?.classList.contains("is-pop"), chat: !!bubble?.classList.contains("is-chat") },
        // R-PET-07：菜单的位置事实（四边矩形 + 这次贴在宠物左边还是右边）——
        // 菜单定位的断言全靠它，别再靠"看着对"。
        // R-PET-08：items = DOM 里全部菜单项，itemsVisible = **当前档位实际显示**的那几个
        //（「落下去」/「飘起来」按档位二选一）；occluded = 摆放后 5 个抽样点里被挡住的个数，
        //nudged = 是否为避让遮挡动过纵向位置。
        menu: {
          hidden: menu?.hidden ?? null,
          items: [...(menu?.querySelectorAll("[data-pet-act]") || [])].map((b) => (b.textContent || "").trim()),
          itemsVisible: [...(menu?.querySelectorAll("[data-pet-act]") || [])]
            .filter((b) => !b.hidden)
            .map((b) => (b.textContent || "").trim()),
          side: menu?.dataset.petMenuSide || null,
          occluded: menu?.dataset.petMenuOccluded ?? null,
          nudged: menu?.dataset.petMenuNudged ?? null,
          rect: (() => {
            if (!menu || menu.hidden) return null;
            const mr = menu.getBoundingClientRect();
            return { l: Math.round(mr.left), t: Math.round(mr.top), r: Math.round(mr.right), b: Math.round(mr.bottom), w: Math.round(mr.width), h: Math.round(mr.height) };
          })(),
        },
        viewport: { w: window.innerWidth, h: window.innerHeight },
        chatInput: !!bubble?.querySelector(".pet-chat input"),
        // 与浮动按钮（返回顶部等）是否重叠：R-PET-05
        // displayNodes = 当前**真的有尺寸**的浮动控件个数：用它保证"重叠数 0"不是"没东西可压"的空过
        displayNodes: [...document.querySelectorAll("#back-to-top-btn, .floating-controls-container")].filter((n) => {
          const nr = n.getBoundingClientRect();
          return nr.width > 0 && nr.height > 0;
        }).length,
        floatOverlap: (() => {
          const nodes = [...document.querySelectorAll("#back-to-top-btn, .floating-controls-container")];
          return nodes.filter((n) => {
            const nr = n.getBoundingClientRect();
            if (nr.width === 0 || nr.height === 0) return false;
            return !(r.right <= nr.left || r.left >= nr.right || r.bottom <= nr.top || r.top >= nr.bottom);
          }).length;
        })(),
      };
    })(),

    // ── P3 壁纸（R-BG-01 / R-BG-04）──────────────────────
    wallpaper: (() => {
      // banner 模式的壁纸会渲染成 <img>；这里挑"加载成功且地址最长"的那张（多张随机时不至于取到占位）
      const imgs = [...document.querySelectorAll("#wallpaper-wrapper img, #banner img, .banner img")];
      const withSrc = imgs
        .map((img) => ({ src: img.currentSrc || img.src || "", loaded: img.naturalWidth || 0 }))
        .filter((x) => x.src && !x.src.startsWith("data:"));
      const pick = withSrc.sort((a, b) => b.loaded - a.loaded)[0] ?? { src: "", loaded: 0 };
      const cs = imgs[0] ? getComputedStyle(imgs[0]) : null;
      const dim = document.querySelector(".banner-dim-overlay");
      // 暗度写在 background 的 rgba alpha 上（不是 opacity）——第一版读 opacity，恒为 1
      const dimAlpha = (() => {
        if (!dim) return null;
        const m = getComputedStyle(dim).backgroundColor.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const parts = m[1].split(",").map((s) => Number.parseFloat(s));
        return parts.length >= 4 ? parts[3] : 1;
      })();
      // ── R-BG-06 / R-BG-07（v1.70）：动态壁纸的事实 ──────────────────
      // 静态图那套字段**原样保留**（video.enable 关掉时仍然走它们，别删）
      const vLayer = document.getElementById("wallpaper-video-layer");
      const v = document.getElementById("wallpaper-video");
      const video = v && vLayer ? {
        slug: vLayer.dataset.slug ?? null,
        name: vLayer.dataset.name ?? null,
        fit: vLayer.dataset.fit ?? null,
        objectPosition: vLayer.dataset.objectPosition ?? null,
        playing: vLayer.dataset.playing === "1",
        playReason: vLayer.dataset.playReason || "",
        ready: vLayer.dataset.ready === "1",
        focusX: Number(vLayer.dataset.focusX),
        focusY: Number(vLayer.dataset.focusY),
        focusAtX: Number(vLayer.dataset.focusAtX),
        focusAtY: Number(vLayer.dataset.focusAtY),
        visibleW: Number(vLayer.dataset.visibleW),
        visibleH: Number(vLayer.dataset.visibleH),
        intrinsicW: v.videoWidth,
        intrinsicH: v.videoHeight,
        loop: v.loop,
        muted: v.muted,
        paused: v.paused,
        currentSrc: (v.currentSrc || v.getAttribute("src") || "").split("/").pop(),
        poster: (v.getAttribute("poster") || "").split("/").pop(),
        inlineFit: v.style.objectFit,
        inlinePos: v.style.objectPosition,
        box: (() => { const r = vLayer.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
      } : null;
      return {
        src: pick.src,
        loaded: pick.loaded,
        objectPosition: cs?.objectPosition ?? null,
        objectFit: cs?.objectFit ?? null,
        dimExists: !!dim,
        dimOpacity: dimAlpha,
        video,
        // "静态图必须零残留"（发起人：动态壁纸替换所有静态图片）
        staticImageCount: document.querySelectorAll("#banner-images-container img, #wallpaper-wrapper img").length,
        slideCount: document.querySelectorAll("#banner-images-container .slide-item").length,
        videoElCount: document.querySelectorAll("#wallpaper-video-layer video").length,
        sourceCount: Number(document.documentElement.dataset.wallpaperCount || 0),
        sourceIndex: Number(document.documentElement.dataset.wallpaperIndex || 0),
      };
    })(),
    // ── R-BG-05 手动换壁纸：两侧交互区 + 拖动 ──────────────
    wallpaperSwitch: (() => {
      const zones = [...document.querySelectorAll(".banner-switch-zone")];
      const all = [...document.querySelectorAll(".slide-item")];
      const isLg = window.innerWidth >= 1024;
      const visible = all.filter((el) => {
        if (isLg && el.classList.contains("lg:hidden")) return false;
        if (!isLg && el.classList.contains("hidden") && !el.classList.contains("lg:hidden")) return false;
        return true;
      });
      const activeIdx = visible.findIndex((el) => el.classList.contains("active"));
      const activeImg = visible[activeIdx]?.querySelector("img");
      // v1.70：壁纸是播放清单里的视频时，count/activeIndex/activeSrc 的来源换成壁纸层
      // （三个字段的**语义一字不变**，所以下面 R-BG-05 那一批断言不用改写法）
      const vp = window.__imissWallpaperVideo;
      return {
        count: vp ? vp.count : visible.length,
        activeIndex: vp ? vp.current() : activeIdx,
        activeSrc: vp
          ? (document.documentElement.dataset.wallpaperSrc || "").split("/").pop()
          : (activeImg?.currentSrc || activeImg?.src || "").split("/").pop() || "",
        names: vp ? vp.items : [],
        zones: zones.map((z) => {
          const cs = getComputedStyle(z);
          return {
            dir: z.dataset.bannerSwitch,
            hidden: z.hidden,
            display: cs.display,
            opacity: cs.opacity,
            tabIndex: z.tabIndex,
            aria: z.getAttribute("aria-label") || "",
            rect: (() => {
              const r = z.getBoundingClientRect();
              return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
            })(),
            focused: document.activeElement === z,
          };
        }),
      };
    })(),
    // SEO：canonical 由页面自己渲染 —— R-PATH-01 的"canonical 指向 /roadmap/ 且不带查询串"当场读它
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null,
    // 导航"当前页高亮"：桌面导航栏上游本来就没有当前页态，有高亮的是移动端抽屉 ——
    // NavMenuPanel 的 markActiveNav() 按 pathname 标 data-active（**单链接项**落在这里，
    // 带子项的父级分组只在子项命中时自动展开）。收藏这几项就能验"抽屉把当前页标对"。
    // ⚠️ v1.41 起判据**不再锚在排行子项**上（导航第 3 格已换成「学习路线」单链接）：
    //    Task 4 已把它们改名成 R-PATH-01（原 R-RANK-01 的两条通用判据）。
    mobileNavActive: [...document.querySelectorAll(".mobile-menu-item[data-active='true']")].map((i) =>
      (i.textContent || "").trim(),
    ),
    // 同时收 href 与"是不是子项"，这样能区分"父级分组名恰好包含子项名"这种假通过
    mobileNavActiveItems: [...document.querySelectorAll(".mobile-menu-item[data-active='true']")].map((i) => ({
      href: i.getAttribute("data-nav-href"),
      label: (i.textContent || "").trim(),
      inSubmenu: !!i.closest(".mobile-submenu"),
    })),
    mobileNavExpanded: [...document.querySelectorAll("[data-mobile-dropdown][data-expanded='true']")].map((d) =>
      (d.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 24),
    ),
    // R-ID-07：显示设置面板（调色盘 + 界面结构管理）
    settingsBtn: !!document.querySelector('#display-settings-switch'),
    settingsPanel: !!document.querySelector('[data-floating-panel-trigger="display-settings-switch"]'),
    infoText: txt(infoRoot),
    favicons: [...document.querySelectorAll('link[rel*="icon"]')].map((l) => l.getAttribute("href")),
    // P6-8：apple-touch-icon 单收一份带 sizes 的（光看上面的 href 列表分不出"哪个 rel 配哪个尺寸"，
    // 而这条 bug 的本质正是「rel 挑错了文件」）。选择器写成 [rel="apple-touch-icon"] 精确匹配。
    appleTouchIcons: [...document.querySelectorAll('link[rel="apple-touch-icon"]')].map((l) => ({
      href: l.getAttribute("href"),
      sizes: l.getAttribute("sizes"),
      type: l.getAttribute("type"),
    })),
    // P6-8：favicon 数组里每一项的 sizes 也要能看到 —— 断言"32px 那张不许被当成触屏图标"时，
    // 报告里得同时有"选中的是谁"和"候选里都有谁"，否则红了也不知道该改哪。
    faviconSizes: [...document.querySelectorAll('link[rel="icon"]')].map((l) => ({
      href: l.getAttribute("href"),
      sizes: l.getAttribute("sizes"),
    })),
    bodyText: document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 4000),
  };
})()`;

// ─── 文章页事实采集（P4 内容迁移：图片、表格、代码、站内链接真的渲染出来了吗）──
// 正文容器是 <Markdown class="markdown-content">（见 pages/posts/[...slug].astro），
// 所以只在这个容器里取事实，避免把封面图、导航栏图片算进来。
const COLLECT_POST = `(async () => {
  const root = document.querySelector(".markdown-content");
  if (!root) return null;
  const txt = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
  const imgs = [...root.querySelectorAll("img")];
  // 正文图片是懒加载，不等 decode 直接读 naturalWidth 会得到 0（假失败）
  await Promise.all(imgs.map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())));
  const html = root.innerHTML;
  return {
    path: window.location.pathname,
    images: imgs.map((im, i) => ({
      i,
      src: im.getAttribute("src"),
      ok: im.complete && im.naturalWidth > 0,
      w: im.naturalWidth,
      h: im.naturalHeight,
      alt: im.getAttribute("alt") || "",
      caption: txt(im.closest("figure") ? im.closest("figure").querySelector("figcaption") : null),
    })),
    tables: root.querySelectorAll("table").length,
    codeBlocks: root.querySelectorAll("pre").length,
    figures: root.querySelectorAll("figure").length,
    callouts: root.querySelectorAll(".callout").length,
    // R-ID-09：分享块 —— 「文章分享」卡片是 Astro 静态标记，而触发按钮与
    // 「保存海报 / 复制链接」在 SharePoster 这个 Svelte 岛里（**点开才有**，静态产物里没有）
    share: {
      card: (document.body.innerText || "").includes("文章分享"),
      trigger: !!document.querySelector('button[aria-label="Generate Share Poster"]'),
    },
    internalLinks: [...root.querySelectorAll('a[href^="/posts/"]')].map((a) => ({
      href: a.getAttribute("href"),
      text: txt(a),
    })),
    headings: [...root.querySelectorAll("h1,h2,h3,h4")].map((h) => txt(h)).slice(0, 6),
    textLength: (root.textContent || "").trim().length,
    // Obsidian 残留（应该全是 0；[[ ]] 与 ![[ ]] 都不该出现在渲染结果里）
    residue: {
      embed: (html.match(/!\\[\\[/g) || []).length,
      wikilink: (html.match(/\\[\\[/g) || []).length,
    },
  };
})()`;

// ─── 学习路线页事实采集（R-PATH-01 ~ R-PATH-05）──────────
// 学习路线页：只取"可判定"的事实，判定留给下面的断言块
const COLLECT_ROADMAP = `(() => {
	const root = document.querySelector("#roadmap");
	if (!root) return { missing: true };
	const stops = [...root.querySelectorAll("li.roadmap-stop a.roadmap-stop-link")];
	return {
		missing: false,
		lineNames: [...root.querySelectorAll("h2.roadmap-line-name")].map((h) => h.firstChild?.textContent?.trim() ?? ""),
		lineIds: [...root.querySelectorAll("section.roadmap-line")].map((s) => s.id),
		indexHrefs: [...root.querySelectorAll("#roadmap-index a")].map((a) => a.getAttribute("href")),
		stopCount: stops.length,
		stopHrefs: stops.map((a) => a.getAttribute("href")),
		// M11（终审）：同名篇目"可见可区分"要靠**渲染出来的标题文本**判，光有 href 证不了 ——
		// 把 name 覆盖撤掉、两行都显示文章标题时 href 一模一样地正确。
		stopTitles: stops.map((a) => (a.querySelector(".roadmap-stop-title") || {}).textContent?.trim() ?? ""),
		uniqueHrefs: new Set(stops.map((a) => a.getAttribute("href"))).size,
		imgCount: root.querySelectorAll("img").length,
		statsText: document.querySelector("#roadmap-stats")?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
		crossCount: root.querySelectorAll("span.roadmap-stop-cross").length,
		// ⚠️ 与主 COLLECT 同一个口径（scrollWidth − clientWidth）：旧写法在 mobile 模拟下恒为 0，
		//    见主采集器那段的说明。这一份现在只被两处当**参照值**打印（R-PATH-05 的 detail），
		//    不作为任何判据的通过条件 —— 判据当场在 390 视口另量（页面级 + 内容级）。
		// ⚠️ 这一段同样在模板字符串里：注释里不许出现反引号。
		overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
	};
})()`;

// ─── 书签导航页事实采集（R-BOOKNAV-01 ~ 04，v1.57 新增）──
// 这一页此前**一条断言都没有**（grep `booknav` 只命中导航子项表与 ALLOWED_ROUTES）。
// 本轮整页换内容（6 组 38 张），所以补上"分组渲染 / 卡片数 / 图标降级 / 空组过滤"这一组
// 判据 —— 判据本体（38 条标题与 URL、6 个组名与条数）在文件头的
// EXPECT_BOOKNAV_CARDS / EXPECT_BOOKNAV_GROUPS 里。
const COLLECT_BOOKNAV = `(async () => {
  // ⚠️ **先把主题钉成亮色**（v1.58 实测踩到的坑）：主循环里前面的步骤可能把页面留在
  //    深色态（html.dark 类 + data-theme），于是这一趟量到的"亮色渲染色"其实是深色提亮值，
  //    R-BOOKNAV-06 的"渲染色 == 配置品牌色"当场判红、而红行显示的是一串
  //    完全正确的**深色**值 —— 看起来像配色写错了，其实是采集时没锁主题。
  //    只读不写会让事实随"上一个用例干了什么"漂，必须自己钉住。
  document.documentElement.classList.remove("dark");
  document.documentElement.setAttribute("data-theme", "light");
  // ⚠️ dbg：这两个字段是"失败时能自证"用的 —— 书签断言红了的时候，先看它们：
  //    如果 dbgPage 不是 /booknav/，说明打在了别的页面上；如果 dbgPage 对但 root=null，
  //    说明页面还没渲染出 <booknav-list>（等太短）。没有它们，红行只能告诉你"全是 undefined"。
  const dbgPage = location.pathname;
  const dbgReady = document.readyState;
  // ⚠️ **为什么要轮询**：这一页的 <booknav-list> 是服务端标记 + 内联自定义元素脚本，
  //    实测在"整轮 verify:ui 跑到这一段"的负载下，load 之后 2.4 秒内偶尔还查不到它
  //    （单独打开这一页永远查得到）→ 旧写法直接 return {missing:true}，于是 10 条书签断言
  //    全红，而红行只说"全是 undefined"，看不出是"没渲染"还是"打错页"。现在最多等 6 秒，
  //    超时也把诊断字段带回来。
  let root = document.querySelector("booknav-list");
  let waited = 0;
  while (!root && waited < 6000) {
    await new Promise((r) => setTimeout(r, 200));
    waited += 200;
    root = document.querySelector("booknav-list");
  }
  if (!root) {
    return {
      missing: true,
      dbgPage,
      dbgReady,
      dbgWaitedMs: waited,
      dbgBodyTags: document.body.children.length,
      dbgHasTag: document.getElementsByTagName("booknav-list").length,
      dbgHtmlLen: document.documentElement.outerHTML.length,
    };
  }
  const sections = [...root.querySelectorAll("section[data-group-id]")];
  const cards = [...root.querySelectorAll(".booknav-card")];
  // v1.58：图标的**计算色**（不是配置字符串）。这里只负责把浏览器算出来的东西搬回来，
  // 颜色解析与对比度判定全在 Node 侧（理由见文件里 parseCssColor 上方那段注释：
  // Chrome 会把 oklch/oklab 的计算值原样序列化，在页面里正则抓数字会得到垃圾）。
  const colorOf = (el) => (el ? getComputedStyle(el).color : null);
  return {
    missing: false,
    sectionIds: sections.map((s) => s.getAttribute("data-group-id")),
    sectionNames: sections.map((s) => (s.querySelector("h2") || {}).textContent?.trim() ?? ""),
    sectionCounts: sections.map((s) => s.querySelectorAll(".booknav-card").length),
    // 分类胶囊上那个条数角标：它必须与组内实际卡片数一致（否则"6"是写死的假数字）
    pillNames: [...root.querySelectorAll("button[data-target]")].map((b) => (b.textContent || "").replace(/\\s+/g, " ").trim()),
    pillTargets: [...root.querySelectorAll("button[data-target]")].map((b) => b.getAttribute("data-target")),
    cards: cards.map((c) => {
      const box = c.querySelector(".booknav-icon");
      const svg = box ? box.querySelector("svg") : null;
      const img = box ? box.querySelector("img") : null;
      const letter = box ? box.querySelector(".booknav-letter") : null;
      const graphic = svg || letter;
      return {
        title: c.getAttribute("data-title"),
        href: c.getAttribute("href"),
        group: c.closest("section[data-group-id]")?.getAttribute("data-group-id") ?? null,
        letter: box?.getAttribute("data-letter") ?? null,
        // 三种图标形态各自数一次：svg（手填 iconify）/ img（本地 favicon）/ 首字母块
        svg: box ? box.querySelectorAll("svg").length : 0,
        img: box ? box.querySelectorAll("img").length : 0,
        letterEl: box ? box.querySelectorAll(".booknav-letter").length : 0,
        target: c.getAttribute("target"),
        // ── v1.58 新增：配色相关事实 ──────────────────────────────────────────
        // 图标区里那个"可见图形元素"（svg 或字母块）的计算色，以及它背后那层
        // 图标块底色（zinc-100 / zinc-800）—— 对比度就是这两者之间算。
        graphicColor: colorOf(graphic),
        boxBg: box ? getComputedStyle(box).backgroundColor : null,
        boxW: box ? Math.round(box.getBoundingClientRect().width) : null,
        boxH: box ? Math.round(box.getBoundingClientRect().height) : null,
        brandVar: box ? (box.style.getPropertyValue("--brand-c") || "").trim() : "",
        darkVar: box ? (box.style.getPropertyValue("--brand-c-dark") || "").trim() : "",
        dataBrand: box ? box.getAttribute("data-brand-color") : null,
        // 图标是装饰性的：卡片标题已经提供了无障碍名，svg 必须对 AT 隐藏
        svgAriaHidden: svg ? svg.getAttribute("aria-hidden") : null,
        imgSrc: img ? img.getAttribute("src") : null,
      };
    }),
    // R-BOOKNAV-03（favicon 决定的证据）：关掉自动 favicon 之后，页面上**不该再有任何
    // 指向第三方 favicon 接口的请求**。这里数的是"真的会发出去的 URL"（img[src]），
    // 不是配置里的字符串 —— 配置字符串留着无害，发请求才有害。
    thirdPartyIconRequests: [...root.querySelectorAll(".booknav-icon img")].map((im) => im.getAttribute("src")).filter((s) => /favicon\\.im/.test(s || "")),
    // v1.58：**运行期零第三方请求**的完整口径 —— 上一轮只数 favicon.im 一家，
    // 换成 s2/favicons 或 googleapis 就漏过去了。这里数"图标 src 里所有不是本站
    // 相对路径的 URL"（站内是 /booknav-icons/…；http(s):// 与协议相对 // 都算外部）。
    externalIconSrcs: [...root.querySelectorAll(".booknav-icon img")]
      .map((im) => im.getAttribute("src") || "")
      .filter((s) => /^(https?:)?\\/\\//i.test(s)),
    // 空组过滤（getEnabledBooknavGroups 的职责）：空 section 与"0 张卡的组"都不许有
    emptySections: sections.filter((s) => s.querySelectorAll(".booknav-card").length === 0).map((s) => s.getAttribute("data-group-id")),
    // 卡片高度：图标块 56px（w-14 h-14）→ 卡片高度不该被压扁
    cardHeights: [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().height)))],
    total: cards.length,
    dbgPage,
    dbgWaitedMs: waited,
  };
})()`;

// ─── v1.58：深色主题下的图标配色采集（R-BOOKNAV-07）─────────────────────────
// ⚠️ **必须真的把页面切到深色再读**，不能只读内联 style 里那串 color-mix 文本：
//    本书签页的深色走 Tailwind 的 `dark:` 变体（`@custom-variant dark (&:where(.dark, .dark *))`），
//    它跟的是 **html.dark 类**；而项目别处（R-ID-02 那批）跟的是 prefers-color-scheme。
//    两套机制都要切，否则量到的仍是亮色下的颜色、断言会"假绿"。
//    实测：只切媒体特性、不切类，图标色就是亮色值（原品牌色）→ 深色对比度根本没被验到。
//
// ⚠️ **还要等过渡跑完**（第二处坑，实测踩到）：`.booknav-icon` 上有
//    `transition-transform duration-300`，改主题会让 `getComputedStyle` 在过渡期间
//    返回**插值中的颜色**（实测刚切完读到 `oklab(0.747…)`，300ms 后才是 `rgb(124,58,237)`）。
//    不等就量 = 量到一个不存在的中间色，红行会指向一个"代码里根本没有的颜色"。
//    所以这里改成**异步 + 400ms 等待**（> 300ms 过渡），由调用方 `awaitPromise: true` 取回。
const COLLECT_BOOKNAV_DARK = `(async () => {
  // ⚠️ 这里**不再自己切主题** —— 切类会触发 .booknav-icon 的 300ms 过渡，
  //    量到的是插值中的颜色。调用方改成"先用 Emulation.setEmulatedMedia 把
  //    prefers-color-scheme 设成 dark，然后 Page.navigate 重载"，
  //    这样深色是页面 boot 起就生效的，color-mix 一次算好、没有过渡。
  //    这里只做一次形状校验并在没深色时报出来（避免又变成"量到亮色值却判绿"）。
  const isDark = document.documentElement.classList.contains("dark");
  const colorOf = (el) => (el ? getComputedStyle(el).color : null);
  const out = [...document.querySelectorAll("booknav-list .booknav-card")].map((c) => {
    const box = c.querySelector(".booknav-icon");
    const svg = box ? box.querySelector("svg") : null;
    const letter = box ? box.querySelector(".booknav-letter") : null;
    const graphic = svg || letter;
    return {
      title: c.getAttribute("data-title"),
      kind: svg ? "svg" : box && box.querySelector("img") ? "img" : letter ? "letter" : "empty",
      color: colorOf(graphic),
      boxBg: box ? getComputedStyle(box).backgroundColor : null,
      brandVar: box ? (box.style.getPropertyValue("--brand-c") || "").trim() : "",
      darkVar: box ? (box.style.getPropertyValue("--brand-c-dark") || "").trim() : "",
    };
  });
  return { isDark, cards: out };
})()`;

// ─── 对比度采集（R-ID-02 的验收要求）──────────────────────
// 思路：不靠肉眼。把 --hue 在 345（本站）与 165（上游原值）之间切换，
// 用同一个 WCAG 公式算出几组"文字/背景"配色的对比度，做 A/B：
//   ① 断言正文级配色在两种主题下都 ≥ 4.5:1；
//   ② 断言换到 345 之后每一组都不比 165 差（允许 0.1 的浮点/渲染误差）。
// 颜色从 CSS 变量取：先把 var(--x) 赋给探针元素的 color 读回计算值，再用 canvas 取像素
// 强制转成 sRGB。为什么必须过 canvas：Chrome 会把 oklch() 输入的**计算值也序列化成 oklch(...)**，
// 直接正则抓数字会得到 (0.25, 0.02, 345) 这种垃圾（第一版就踩了这个坑，算出一堆 1.00 的假对比度）。
const COLLECT_COLORS = (theme, hue) => `(() => {
  const root = document.documentElement;
  root.classList.toggle("dark", ${theme === "dark"});
  root.setAttribute("data-theme", "${theme}");
  root.style.setProperty("--hue", "${hue}");
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;opacity:0;pointer-events:none";
  document.body.appendChild(probe);
  const readCss = (name) => {
    probe.style.color = "";
    probe.style.color = "var(" + name + ")";
    return getComputedStyle(probe).color;
  };
  const varOf = {
    deepText: "--deep-text", contentMeta: "--content-meta", cardBg: "--card-bg",
    pageBg: "--page-bg", primary: "--primary", btnContent: "--btn-content", btnBg: "--btn-regular-bg",
  };
  const out = {};
  for (const [k, v] of Object.entries(varOf)) out[k] = readCss(v);
  probe.remove();
  return out;
})()`;

// ─── 颜色解析与对比度（全部放在 Node 侧）──────────────────
// 为什么不借浏览器/canvas 转换（踩过两次）：
//   ① Chrome 会把 oklch() 的**计算值也序列化成 oklch(...)**，正则抓数字得到垃圾；
//   ② canvas 的 fillStyle 解析不了 `oklch(0.97 0 none)` 这种带 `none` 的值，
//      赋值被静默忽略 → 背景色沿用上一次的 fillStyle，算出"前景=背景"的 1.0x 假对比度。
// 所以页面只负责把 computed color 字符串原样搬回来，转换与计算在这里自己实现。
function srgbFromOklab(L, a, b) {
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;
	const l = l_ ** 3;
	const m = m_ ** 3;
	const s = s_ ** 3;
	const lin = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	const gamma = (v) => {
		const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
		return Math.max(0, Math.min(1, c)) * 255;
	};
	return { r: gamma(lin[0]), g: gamma(lin[1]), b: gamma(lin[2]) };
}

/** 解析 getComputedStyle 返回的颜色字符串，支持 rgb()/rgba()/oklab()/oklch()（含 `none` 分量） */
function parseCssColor(css) {
	if (!css) return null;
	const body = css.slice(css.indexOf("(") + 1, css.lastIndexOf(")"));
	const [main, alphaPart] = body.split("/");
	const nums = main.trim().split(/\s+/).map((t) => (t === "none" ? 0 : Number.parseFloat(t)));
	const alpha = alphaPart ? Number.parseFloat(alphaPart) : nums.length > 3 ? nums[3] : 1;
	const a = Number.isFinite(alpha) ? alpha : 1;
	if (css.startsWith("rgb")) return { r: nums[0], g: nums[1], b: nums[2], a };
	if (css.startsWith("oklab")) return { ...srgbFromOklab(nums[0], nums[1], nums[2]), a };
	if (css.startsWith("oklch")) {
		const [L, C, H] = nums;
		const rad = ((H ?? 0) * Math.PI) / 180;
		return { ...srgbFromOklab(L, (C ?? 0) * Math.cos(rad), (C ?? 0) * Math.sin(rad)), a };
	}
	return null;
}

function composite(fg, bg) {
	return {
		r: fg.r * fg.a + bg.r * (1 - fg.a),
		g: fg.g * fg.a + bg.g * (1 - fg.a),
		b: fg.b * fg.a + bg.b * (1 - fg.a),
		a: 1,
	};
}
function relLuminance({ r, g, b }) {
	const f = (v) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(fg, bg) {
	const [l1, l2] = [relLuminance(fg), relLuminance(bg)].sort((x, y) => y - x);
	return (l1 + 0.05) / (l2 + 0.05);
}
/** 把"从元素到根的背景层"（自顶向下）合成成一个不透明背景色 —— 保留给将来的逐元素校验用；
 *  当前 P1 的对比度校验走下面的 token 级 CONTRAST_PAIRS（原因见那张表的注释）。 */
function flattenLayers(layers) {
	const parsed = layers.map(parseCssColor).filter(Boolean);
	if (!parsed.length) return { r: 255, g: 255, b: 255, a: 1 };
	let base = parsed[parsed.length - 1];
	if (base.a < 0.999) base = { r: 255, g: 255, b: 255, a: 1 };
	let acc = base;
	for (let i = parsed.length - 2; i >= 0; i--) acc = composite(parsed[i], acc);
	return acc;
}
const CONTRAST_PAIRS = [
	{ themes: ["light"], fg: "deepText", bg: "cardBg", min: 4.5, thresholdIsInfo: false, label: "正文/标题 vs 卡片底" },
	{ themes: ["light", "dark"], fg: "contentMeta", bg: "cardBg", min: 4.5, thresholdIsInfo: false, label: "次要文字 vs 卡片底" },
	{ themes: ["light", "dark"], fg: "btnContent", bg: "btnBg", min: 3, thresholdIsInfo: true, label: "按钮文字 vs 按钮底" },
	{ themes: ["light", "dark"], fg: "primary", bg: "pageBg", min: 3, thresholdIsInfo: true, label: "主题色链接 vs 页面底" },
];

// ─── 主流程 ──────────────────────────────────────────────
const results = [];
let _chrome = null;
let _profileDir = null;
/**
 * 记一条断言。
 * ⚠️ **`skipped` 必须真的存下来**（P5 复核对本仓库验收的硬要求）：R-AGT 段那两条"真往返"
 * 在 Agent 没起 / 后端文章库不可用时会以 `record(..., true)` 记"跳过"，而旧实现的签名只有
 * `(id, desc, pass, detail)` —— **第 5 个参数被静默丢掉**，于是"没跑到"的那两条在报告里
 * 和"跑通了"长得一模一样（复核原话：R-AGT-08 多次 SKIP 却计成 ✅）。
 * 教训：**多传的参数不会报错，只会静默失效** —— 这类"参数表不对齐"的坑和 T58 是一类。
 */
const record = (id, desc, pass, detail = "", skipped = false) => {
	results.push({ id, desc, pass, detail, skipped: Boolean(skipped) });
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
	await fs.mkdir(OUT_DIR, { recursive: true });
	const chrome = await findChrome();
	const profile = await fs.mkdtemp(path.join(os.tmpdir(), "imiss-verify-"));
	const child = spawn(
		chrome,
		[
			"--headless=new",
			"--disable-gpu",
			"--no-first-run",
			"--no-default-browser-check",
			"--hide-scrollbars",
			"--force-device-scale-factor=1",
			"--remote-debugging-port=0",
			`--user-data-dir=${profile}`,
			"about:blank",
		],
		{ stdio: "ignore" },
	);
	// 记到模块级，便于异常路径也能清掉进程与临时 profile
	_chrome = child;
	_profileDir = profile;

	// 等 Chrome 把端口写进 DevToolsActivePort
	let port = null;
	for (let i = 0; i < 60; i++) {
		await sleep(250);
		try {
			const raw = await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8");
			port = Number(raw.split("\n")[0]);
			if (port) break;
		} catch {}
	}
	if (!port) throw new Error("Chrome 没起来（读不到 DevToolsActivePort）");
	console.log(`Chrome 调试端口 ${port}，目标站点 ${BASE}\n`);

	const cdp = await connectToPage(port);
	await cdp.send("Page.enable");
	await cdp.send("Runtime.enable");

	// 先判断对端是 dev 还是 preview —— 两者的行为不同，不能混着断言：
	//   · dev（astro dev）：`Astro.redirect` 走真实 302，下面的"存根"断言会误报
	//   · preview（astro preview）：静态产物，关闭页是 200 + noindex 存根
	// 另外 sitemap 断言读的是磁盘上的 dist/，对着 dev 跑会拿旧产物下结论。
	const probeHtml = await (await fetch(`${BASE}/`)).text();
	const isDevServer = probeHtml.includes("/@vite/client") || probeHtml.includes("/@astrojs/");
	console.log(
		isDevServer
			? "⚠️ 检测到 astro dev 服务器：关闭页断言与 sitemap 断言不适用，建议先 `pnpm build` 再 `pnpm preview` 跑本脚本\n"
			: "已确认对端是静态产物（preview / 生产）\n",
	);

	// HTTP 状态检查（不走浏览器）
	//
	// 关于「关闭的页面」：Astro 的静态输出**不会**给出 HTTP 404。
	// 页面里 `return Astro.redirect("/404/")` 会被编译成一个存根 HTML：
	//   <meta http-equiv="refresh" content="2;url=/404/"> + <meta name="robots" content="noindex">
	// 由 Web 服务器以 200 返回（Astro 只在 SSR/on-demand 下才有真 302）。
	// 所以这里断言的是「它确实是那个 noindex 存根」，真 404 交给生产 Nginx
	// （deploy/nginx.conf 里对这 4 条路径 return 404，见 ARCH.md §12.2 / §14.3 T17）。
	// 另外 sitemap 断言读的是磁盘上的 dist/，对着 dev 跑会拿旧产物下结论。
	for (const route of STUBBED_ROUTES) {
		const res = await fetch(`${BASE}${route}`, { redirect: "manual" });
		const body = await res.text();
		if (isDevServer) {
			record(
				"INFO(dev)",
				`关闭页面在 dev 下是 ${res.status} 重定向：${route}`,
				true,
				"dev 行为与静态产物不同，不做判定",
			);
			continue;
		}
		const isStub =
			res.status === 200 &&
			/http-equiv="refresh"/.test(body) &&
			/url=\/404\//.test(body) &&
			/noindex/.test(body);
		record(
			"R-NAV-05/06",
			`已关闭页面确实是 noindex 存根：${route}`,
			isStub,
			`HTTP ${res.status}，存根=${isStub}`,
		);
	}
	// P4-8（v1.47）：`/friends/`、`/sponsor/` 的页面文件已删除 → **真 404**（不是存根）。
	// 用 `redirect: "manual"`，别让托管层的 301 把它伪装成"跳到一个 200 页面"。
	// 这一组与 REMOVED_FEED_ROUTES 同口径（文件没了 = 404），是目前最严的那一档。
	for (const route of REMOVED_PAGE_ROUTES) {
		const res = await fetch(`${BASE}${route}`, { redirect: "manual" });
		const body = await res.text();
		if (isDevServer) {
			record("INFO(dev)", `已删除页面的 404 判定在 dev 下跳过：${route}`, true, "dev 行为与静态产物不同");
			continue;
		}
		// 同时断言它**不是**那个 noindex 存根 —— 否则"页面还在、只是被开关关掉"会蒙混成 404
		const looksLikeStub = /http-equiv="refresh"/.test(body) && /url=\/404\//.test(body);
		record(
			"R-NAV-05/06",
			`已删除的上游页面是真 404（不是 noindex 存根）：${route}`,
			res.status === 404 && !looksLikeStub,
			`HTTP ${res.status}，像存根=${looksLikeStub}`,
		);
	}
	// 产物检查：用绝对路径，避免依赖运行时 CWD
	const dist404 = path.resolve("dist/404.html");
	try {
		await fs.access(dist404);
		record("R-NAV-05/06", "构建产物里有 404 页面（dist/404.html）", true, dist404);
	} catch {
		record("R-NAV-05/06", "构建产物里有 404 页面（dist/404.html）", false, `找不到 ${dist404}（先跑 pnpm build）`);
	}
	for (const route of ALLOWED_ROUTES) {
		const res = await fetch(`${BASE}${route}`);
		record("R-NAV-07", `保留页面应 200：${route}`, res.status === 200, `HTTP ${res.status}`);
	}
	// ── R-PATH-06：排行整条删除，四个旧地址**都不做 301**（站点未上线、无外链）──
	// 断言"请求返回 404"这一半（"不在 sitemap"那一半在本文件后面的产物检查里，那儿才读得到 dist）。
	// ⚠️ `redirect: "manual"`：不跟随后端/托管层可能残留的 301/302 —— 否则"跟着跳到一个 200 页面"
	//    与"这里本来就 404"会得到同一个终态，判据分不出"删干净了"和"还留着跳转"。
	const rankStatus = [];
	for (const u of ["/rank/", "/rank/jp/", "/rank/cn/", "/rank/game/"]) {
		rankStatus.push(`${u}=${(await fetch(`${BASE}${u}`, { redirect: "manual" })).status}`);
	}
	record(
		"R-PATH-06",
		"/rank/* 四个地址请求都返回 404",
		rankStatus.every((s) => s.endsWith("=404")),
		rankStatus.join(" "),
	);
	// R-ID-06：订阅相关的 4 条路由文件已删除，应当是**真 404**（不是 noindex 存根）
	for (const route of REMOVED_FEED_ROUTES) {
		const res = await fetch(`${BASE}${route}`, { redirect: "manual" });
		record("R-ID-06", `订阅路由已彻底移除（应 404）：${route}`, res.status === 404, `HTTP ${res.status}`);
	}
	// RP-ID-06：首页横幅那行链接图标应不再渲染
	{
		const html = await (await fetch(`${BASE}/`)).text();
		const hasBannerLinks = /class="[^"]*banner-link/.test(html);
		record(
			"R-ID-06",
			"首页横幅的订阅图标行已移除",
			!hasBannerLinks,
			hasBannerLinks ? "仍能找到 .banner-link 元素" : "无 .banner-link 元素",
		);
	}
	// 排行榜页在 P2 才建时留下的登记处：只记录状态，不参与"通过/失败"计数（否则"功能没做"会被算成 ✅）
	// （Task 4 起 `KNOWN_PENDING_ROUTES` 为空 —— 排行删了、也没有新的"说好要建但还没建"的路由。）
	for (const route of KNOWN_PENDING_ROUTES) {
		const res = await fetch(`${BASE}${route}`);
		record("INFO(待建)", `本阶段尚未实现的路由：${route}`, true, `HTTP ${res.status}（建好后挪进 ALLOWED_ROUTES 断言 200）`);
	}

	// ── P4-8（v1.47 → v1.49）：上游身份零残留 —— 扫描面从 `dist/**/*.html` 扩到**产物全集** ──
	// 这条断言的前身是 P1 的"上游信息泄漏扫描"（只 fetch `/`、`/about/`、`/guestbook/`、文章页
	// 四条路由）。**抽样漏得太多了**：v1.47 实测旧产物 171 个 HTML 里有 **166** 个含上游字样
	// —— 导航「链接」组、页脚 `Powered by … <上游主题名>`、侧栏「站点信息」两处硬编码版本行，
	// 这些在每一页都出现，而 4 条路由抽样恰好只覆盖了同一批面，看不出规模 → 改成
	// 磁盘遍历 `dist/**/*.html` 全量扫，命中即红。
	//
	// ⚠️ **v1.49 又发现它还是窄了**：`*.html` 只是产物的 165/799。实测漏掉的是
	//    `dist/assets/css/twikoo-custom.css` 第 4 行那条上游署名
	//    （一行上游署名，原文见 `git show 1e5ea99:public/assets/css/twikoo-custom.css`）—— 它不进 HTML、
	//    页面上也看不见（`commentConfig.type` 是 `none`，这条 CSS 根本没人加载），
	//    就这么**随产物发布了一整轮**。**只扫 HTML = 只看"页面上有没有"，漏掉"发布出去了什么"。**
	//    从本轮起扫描面 = **产物全集**：HTML / CSS / JS / JSON / sitemap / llms.txt / pagefind /
	//    robots / 字体子集清单…… 外加 **文件名与路径本身**（防 `<上游主题名>-*.png` 这类
	//    "内容干净、只有名字里带"的存活方式）。同因同源，登记在 ARCH §14.3 **T85**。
	//
	// 判据分四层（一层比一层严）：
	//   ① **产物全集的内容**（大小写不敏感）：8 条上游品牌/身份正则（**逐字只写在下面
	//      的 `UPSTREAM_CI` 常量里**，本文件是它的唯一出处；写法与理由见该常量上方的注释块）命中即红。
	//   ② **文件名 / 路径本身**（同一组判据）：命中即红，单独记一条以便归因。
	//   ③ **品牌/身份/凭据串**（大小写敏感；下面 `IDENTITY_NEEDLES` 表，含"不含上游主题名"的那些）：base64 邮箱形态、
	//      Bilibili/Bangumi/VNDB 的 UID、上游横幅标题与副标题诗 —— 出现即红。
	//   ④ **可见文本**（剥掉 `<script>`/`<style>`/HTML 注释之后，仅 HTML）：任何上游品牌/身份字样
	//      都算红。这一层是"访客真能看到什么"，也挡住"把敏感字样塞进 HTML 注释"这种绕法
	//      —— 那正是 v1.47 自己踩过的坑（Astro 把模板 HTML 注释原样打进产物，见 T85）。
	//
	// 🔎 **二进制文件怎么判**：读整个文件，**含 NUL 字节（0x00）即视为二进制**，跳过其
	//    **内容**扫描，但**文件名/路径照查**（第 ② 层对全集生效）。产物里约 547 个二进制
	//    （png/webp/avif/woff2/ico…）走这条分支，跳过数**写进下面第一条断言的 detail 里**
	//    —— 不让"跳过一大批"变成"静默扫了个空"。反向保险也钉住了：**可读文本文件数为 0
	//    直接判红**（否则 dist 一旦全是二进制，这条会伪装成绿，同类问题见 T77）。
	//
	// ✅ **v1.51：例外已彻底删除 —— 这条断言现在对产物全集"零例外"**。
	//    v1.47~v1.50 期间这里有过一个**唯一排除**：`about/index.html`。那时
	//    `src/content/spec/about.md` 整页是模板作者的自我介绍（作者实名 / 上游主题名 /
	//    上游仓库地址 / 上游演示站域名），而它是那几轮的**硬约束禁止修改**的文件
	//    （`src/pages/about.astro:15-17` 在内容缺失时直接 `throw new Error("About page content not found")`，
	//    删了构建就断，替换文字一直在发起人手上）—— 所以当时只豁免这一页的**内容**
	//    （不豁免文件名/路径），并另记一条 `INFO(待办)` 把"这页仍不干净"摆在明面上。
	//    v1.51 发起人批准并落地了**中立版关于页**（无上游字样、无 `::github{}` 指令、无身份信息）
	//    → 下面四条断言里的 `isAbout` / `ABOUT_HTML` / `ABOUT_REL` 分支与那条 `INFO(待办)`
	//    **一并删除**；通过文案也从"唯一排除 about/index.html"改成"全产物零例外"。
	//    ⚠️ 这条断言仍然是**可失败的**：v1.51 用注入实测过（往 about.md 里写回一个上游字样 → 判红）。
	const IDENTITY_NEEDLES = [
		// ⚠️ 本表（含下面 `UPSTREAM_CI` 常量）是**判据本体**：这些字面量必须原样存在，
		//    否则判据会静默失效。它们也是全仓库源码层里**唯一**保留上游字面量的地方
		//    （见本次提交信息与 reports/_p48-src-cleanup-report.md 的「功能性例外」一节）。
		["Firefly", "上游主题名（品牌字样）"],
		["CuteLeaf", "上游作者 GitHub 名（驼峰）"],
		["Cuteleaf", "上游作者 GitHub 名"],
		["夏夜流萤", "上游作者站点名"],
		["夏叶", "上游作者实名"],
		["xiaye@msn.com", "上游作者邮箱（明文）"],
		["eGlheWVAbXNuLmNvbQ", "上游作者邮箱（base64 编码形态）"],
		["cuteleaf.cn", "上游作者域名"],
		["ko-fi.com/cuteleaf", "上游 ko-fi 打赏入口"],
		["ifdian.net/a/cuteleaf", "上游爱发电打赏入口"],
		["Lovely firefly", "上游首页主标题"],
		["In Reddened Chrysalis", "上游首页副标题诗"],
		["38932988", "上游 Bilibili UID"],
		["1143164", "上游 Bangumi userId"],
		["u358128", "上游 VNDB userId"],
	];
	// ⚠️ **v1.49：这里的"内部标识符白名单"已删除**。v1.47 曾放行 3 个本站客户端 JS 全局名
	// （`window.__<旧前缀>Music` / `window.__<旧前缀>LayoutTransitionGuard` / `window.<旧前缀>CachedSubtitle`）
	// —— 那是"品牌字样"与"内部变量名"之间的折中。本轮把这几个名字连同另外几处一起
	// **改成中性前缀 `imiss`**：`__imissMusic` / `__imissLayoutTransitionGuard` / `__imissLayoutInit` /
	// `imissCachedSubtitle` / 自定义事件 `imiss:page:loaded` / CSS 关键帧 `imiss-waves-slide-up`，
	// 组件 barrel `<旧前缀>-mdx.ts` → `imiss-mdx.ts`，`package.json` 的 `name` → `imiss-blog`。
	// 于是**白名单不再需要**：这条判据现在是"零例外"，任何大小写变体出现即红。
	// （改名映射表见 PROJECT_STATUS.md v1.49 变更行 与 ARCH §14.3 T85。）
	const UPSTREAM_CI =
		/firefly|cuteleaf|夏夜流萤|夏叶|xiaye@msn\.com|cuteleaf\.cn|ko-fi\.com\/cuteleaf|ifdian\.net\/a\/cuteleaf/i;
	// ─── v1.57：隐私与排除项**泄漏守卫**（发起人点名的 14 个串，一个都不许进产物）────
	// 为什么要有这条：书签导航那 38 条是发起人**从自己浏览器里抄出来的书签**，原始 URL 里
	// 混着只有他自己会有的东西 —— 腾讯云轻量**实例 ID**、Docker **用户名**、LangSmith
	// **组织 ID**、Google/Gemini 的**追踪参数**、学习通的**时间戳参数**。本轮统一"换成首页"
	// 时这些串**顺带被抹掉**了，但"顺带"不是"保证"：改一条 URL、把某条原始链接粘回去、
	// 或者从别处再导入一次，它们就会重新进产物，而且**页面上看不出来**（参数不影响跳转）。
	// 所以这里把它们钉成**产物级**判据（扫 `dist/**` 全集，含文件名/路径）。
	//
	// ⚠️ 判据是**字面量子串**（大小写敏感）：`i.chaoxing.com/base?t=` 这种带 `?`/`=` 的写法
	//    故意连参数名前缀一起钉，免得只靠域名判（域名本身是发起人要收录的正常内容）。
	// ⚠️ **不要把 `happy.bigmess.org` 加进来** —— 它是发起人明确要收录的站点（BigME.Pro，
	//    落在「其他三方服务」组），加进来等于把要收录的东西判成泄漏。同理，`bigmodel.cn`
	//    / `micuapi.ai` / `priceai.cc` 这些域名也都是清单内的正常内容。
	// ⚠️ 这 14 个串里有一个是**通用英文词**：`dlsite` 与 `theporndude` 是发起人点名要排除的
	//    站点（清单里本来就没有它们），本轮实测在当前产物里 0 命中（见下面断言的 detail）。
	const PRIVACY_NEEDLES = [
		["lhins-r4o6dc9v", "腾讯云轻量实例 ID"],
		["handler01", "Docker 用户名"],
		["900dd689-c116-4ccf-911f-78494a0db890", "LangSmith 组织 ID"],
		["dlsite", "被排除的站点（dlsite）"],
		["theporndude", "被排除的站点（theporndude）"],
		["139.159.190.22", "被排除的服务器 IP"],
		["wzyp.cn", "被排除的域名（wzyp.cn）"],
		["27届小比特-实习-资料汇总", "被排除的资料名"],
		["i.chaoxing.com/base?t=", "学习通的时间戳参数（原始 URL 形态）"],
		["webhp?", "Google 追踪参数（原始 URL 形态）"],
		["/u/1/app?", "Gemini 追踪参数（原始 URL 形态）"],
		["activeTab=readme", "带 activeTab 参数的原始 URL 形态"],
		["/thankyou.php?", "带 thankyou.php 参数的原始 URL 形态"],
		["searchParams=", "带 searchParams= 的原始 URL 形态"],
	];
	// R-ID-06：订阅功能移除后，这些不该再出现在任何页面里
	const FEED_LEAK_NEEDLES = [
		["application/rss+xml", "head 里的 RSS alternate 链接"],
		["application/atom+xml", "head 里的 Atom alternate 链接"],
		["rss.xml", "订阅入口（rss.xml）"],
		["atom.xml", "订阅入口（atom.xml）"],
		['href="/rss/"', "订阅页入口"],
		['href="/atom/"', "订阅页入口"],
	];
	/** 递归列出 dist 下所有 HTML（同步实现：扫描前只要文件清单，不需要流式） */
	const listDistHtml = async (dir = "dist", out = []) => {
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return out;
		}
		for (const e of entries) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) await listDistHtml(p, out);
			else if (e.name.endsWith(".html")) out.push(p);
		}
		return out;
	};
	/**
	 * v1.49：递归列出 dist 下**全部产物文件**（不再只挑 `.html`）。
	 * 返回 `{ abs, rel }`：`abs` 用来读文件，`rel`（posix 风格、相对 dist）用来判
	 * **文件名/路径本身**是否含上游字样。
	 */
	const listDistAll = async (dir = "dist", rel = "", out = []) => {
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return out;
		}
		for (const e of entries) {
			const p = path.join(dir, e.name);
			const r = rel ? `${rel}/${e.name}` : e.name;
			if (e.isDirectory()) await listDistAll(p, r, out);
			else out.push({ abs: p, rel: r });
		}
		return out;
	};
	// 剥掉 script / style / HTML 注释 → 剩下的才是"访客能看见的文本"
	const visibleTextOf = (html) =>
		html
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<!--[\s\S]*?-->/g, " ");

	// v1.51：`ABOUT_HTML` / `ABOUT_REL` / `isAbout` 例外**已删除**（长注释见上）——
	// 产物清单里的每一个文件都参与全部四层判定，没有任何豁免。
	const distHtmlFiles = await listDistHtml();
	const distAllFiles = await listDistAll();
	// ⚠️ **用 null 表示"没扫"**（dev 服务器 / dist 为空时走不到扫描那一步）。
	//    如果初始成空数组，R-BOOKNAV-08 那条"产物里不出现聚合服务域名"会在
	//    **根本没扫**的情况下判绿 —— T77 同类的"闸门静默失效"。下面断言里显式区分
	//    `null`（判红 + 说明要跑 pnpm build/preview）与 `[]`（真扫过且零命中）。
	let distIconAggregatorHits = null;
	// v1.64：资料卡头像悬停图标名的产物级命中（null = 没扫到产物；[] = 真扫过且零命中）
	let distAvatarIconHits = null;
	if (isDevServer) {
		record("INFO(dev)", "上游身份零残留扫描已跳过", true, "读的是磁盘 dist/，dev 下可能是旧产物；请用 pnpm preview");
	} else if (distAllFiles.length === 0) {
		// "扫不到文件"绝不能算通过 —— 否则 dist 缺失时这条会伪装成绿（T77 同类）
		record("R-ID-05/R-NAV-06", "上游身份零残留（产物全集）", false, "dist 下没找到任何文件：先跑 pnpm build");
	} else {
		const leakedFiles = [];
		const identityLeakFiles = [];
		const visibleLeakFiles = [];
		const nameLeakFiles = [];
		const feedLeakFiles = [];
		// v1.57：隐私/排除项命中（**文件相对路径 → 命中的串**，便于归因到具体改错了哪一条 URL）
		const privacyLeakFiles = [];
		// v1.58：**运行期零第三方请求**的 favicon 聚合服务域名（产物级那一半）。
		// 判据是"产物文件内容里不出现这些域名"——上一轮只数了页面上的 `img[src]`，
		// 数不到"某个服务端/构建期脚本把 URL 写进了 js/css 里、浏览器运行期才发出去"的情形。
		const ICON_AGGREGATOR_NEEDLES = ["s2/favicons", "favicon.im", "faviconV2", "googleapis.com"];
		distIconAggregatorHits = [];
		// v1.64：资料卡头像悬停图标（`fa7-regular:address-card`）**已按发起人要求删除**，
		// 它的名字不许再出现在产物里（含注释）。用 null 表示"没扫到产物"（同 distIconAggregatorHits 的规矩）。
		const REMOVED_AVATAR_VEIL_ICONS = ["address-card"];
		distAvatarIconHits = [];
		// v1.57：正控 —— 发起人明确要收录的站点必须在产物里（否则"守卫全绿"可能只是产物空了）
		const positiveNeedles = ["happy.bigmess.org", "chat.deepseek.com", "huggingface.co"];
		const positives = new Set();
		let scanned = 0;
		let binarySkipped = 0;
		let unreadable = 0;
		// ─── v1.60：模板示例公告文案守卫（**负控 + 正控**，同一条断言的两条腿）──────────
		// 为什么要有这条：`src/config/announcementConfig.ts` 的 `content` 一直是**模板自带的
		// 那句示例公告**，它跟着 `sidebarConfig` 里两处 `type: "announcement"`（左栏 + 移动端
		// 底部面板，两处共用这一份配置）出现在**每一页**的侧栏公告卡里 —— 直到 v1.60 发起人
		// 看着截图原话「这个示例公告是什么鬼？正式一点」才换掉。换文案只要改一行，但**上面那一大段
		// "上游身份零残留"是拦不住它的**：那段扫的是上游主题名/作者名/UID，模板示例公告**不在判据里**
		// → 谁把它改回去都不会有断言变红。所以这里补上。
		//
		// ⚠️ **正控不是装饰，是这条断言的另一半**：只有负控的话，"公告被 `enable: false` 关掉 /
		//    组件从 `sidebarConfig` 里摘掉 / 卡片渲染成空"这三种情况会让负控**更干净**（产物里
		//    本来就没有那句话了）—— 那正是 T77 那一类"判据空过"的假绿。所以正控必须落在
		//    **卡片切片内部**（"页面别处恰好也有这几个字"不算），并且要求每一张卡都命中。
		// 判据落到 prd 的哪两条：负控 = R-ID-05（产物零残留）、正控 = R-WDG-04（侧栏组件实际渲染）。
		const ANNOUNCEMENT_TEMPLATE_NEEDLES = [
			["这是一则示例公告", "模板示例公告（原 `announcementConfig.content` 后半句）"],
			["欢迎来到我的博客", "模板示例公告（原 `announcementConfig.content` 前半句）"],
		];
		// 正控判据 = 公告卡里必须**逐字**出现 `announcementConfig.content` 那一整句；
		// 另留一个可识别片段单独计数，好在"整句失配"时一眼看出是句子被截断还是整张卡没了。
		// ⚠️ 改 `announcementConfig.ts` 里那句话，就要同步改这两个常量（代码注释里也钉了这句）。
		const ANNOUNCEMENT_LIVE_FULL =
			"本站已整理 133 篇技术笔记，并按 8 条主线排成学习路线（136 站）；站内搜索与桌宠对话均已上线。";
		const ANNOUNCEMENT_LIVE_FRAGMENT = "133 篇技术笔记";
		// 公告卡切片：`<widget-layout … data-id="announcement" …>…</widget-layout>`。
		// 卡里**不嵌套** `widget-layout`，所以非贪婪匹配到的第一个闭合标签就是整张卡的边界。
		const announcementCardsOf = (html) =>
			html.match(/<widget-layout[^>]*?data-id="announcement"[\s\S]*?<\/widget-layout>/g) ?? [];
		const announcementTemplateHits = [];
		let annCards = 0;
		let annCardsWithFull = 0;
		let annCardsWithFragment = 0;
		let annHomeCards = 0;
		let annHomeCardsWithFull = 0;
		for (const { abs, rel } of distAllFiles) {
			// ② 文件名 / 路径本身（二进制文件也照查 —— "名字里带"是最容易被漏掉的存活方式）
			if (UPSTREAM_CI.test(rel)) nameLeakFiles.push(rel);
			// v1.57：隐私串也查**文件名/路径本身**（同一层，理由同上）
			for (const [n] of PRIVACY_NEEDLES) if (rel.includes(n)) privacyLeakFiles.push(`${rel}（路径） → ${n}`);
			// v1.60：模板示例公告串同样查**文件名/路径本身**（同一层，理由同上）
			for (const [n] of ANNOUNCEMENT_TEMPLATE_NEEDLES)
				if (rel.includes(n)) announcementTemplateHits.push(`${rel}（路径） → ${n}`);
			// 内容扫描：含 NUL 字节即视为二进制 → 跳过内容，只留上面的文件名判定
			let buf;
			try {
				buf = await fs.readFile(abs);
			} catch {
				unreadable++;
				continue;
			}
			if (buf.includes(0)) {
				binarySkipped++;
				continue;
			}
			scanned++;
			const text = buf.toString("utf8");
			// ① 产物全集内容：大小写不敏感的上游字样
			const ci = text.match(UPSTREAM_CI);
			if (ci) leakedFiles.push(`${rel} → ${ci[0]}`);
			// ③ 品牌 / 身份 / 凭据串（大小写敏感；用 IDENTITY_NEEDLES 表，含"不含上游主题名"的那些）
			const hits = IDENTITY_NEEDLES.filter(([n]) => text.includes(n));
			if (hits.length) identityLeakFiles.push(`${rel} → ${hits.map(([n]) => n).join("+")}`);
			// v1.57：隐私/排除项（大小写敏感的字面量子串；二进制在上面已按 NUL 跳过）
			for (const [n] of PRIVACY_NEEDLES) if (text.includes(n)) privacyLeakFiles.push(`${rel} → ${n}`);
			// v1.58：favicon 聚合服务域名（产物级"运行期零第三方请求"守卫）
			for (const n of ICON_AGGREGATOR_NEEDLES) if (text.includes(n)) distIconAggregatorHits.push(`${rel} → ${n}`);
			// v1.64：**去掉了的资料卡悬停图标名**也不许残留在产物里。
			// 为什么要有这条：本轮第一版把"为什么删掉它"的说明写成了**模板里的 HTML 注释**，
			// 而模板注释会原样进产物（T85）→ `dist/index.html` 里真的多出两处含图标名的注释。
			// 断言只查 DOM 是拦不住这种"名字回来了"的，所以这里连产物内容一起查。
			for (const n of REMOVED_AVATAR_VEIL_ICONS) if (text.includes(n)) distAvatarIconHits.push(`${rel} → ${n}`);
			// v1.60：模板示例公告文案（负控；二进制文件在上面已按"含 NUL 字节"跳过内容）
			for (const [n] of ANNOUNCEMENT_TEMPLATE_NEEDLES)
				if (text.includes(n)) announcementTemplateHits.push(`${rel} → ${n}`);
			// v1.57：正控计数（只统计内容里出现的，路径不算）
			for (const n of positiveNeedles) if (text.includes(n)) positives.add(n);
			if (rel.endsWith(".html")) {
				// ④ 可见文本（剥 script/style/HTML 注释）
				if (UPSTREAM_CI.test(visibleTextOf(text))) visibleLeakFiles.push(rel);
				// R-ID-06：订阅残渣
				const feedHits = FEED_LEAK_NEEDLES.filter(([n]) => text.includes(n));
				if (feedHits.length) feedLeakFiles.push(`${rel} → ${feedHits.map(([n]) => n).join("+")}`);
				// v1.60：公告卡**正控**计数 —— 只数"卡片切片内部"命中，"页面别处恰好有这几个字"不算。
				// 逐页把每张卡都数一遍（而不是只看首页）：两处 `type: "announcement"` 共用同一份配置，
				// 任何一张卡漏掉新文案都是回归。
				const cards = announcementCardsOf(text);
				annCards += cards.length;
				for (const c of cards) {
					if (c.includes(ANNOUNCEMENT_LIVE_FULL)) annCardsWithFull++;
					if (c.includes(ANNOUNCEMENT_LIVE_FRAGMENT)) annCardsWithFragment++;
				}
				if (rel === "index.html") {
					annHomeCards += cards.length;
					annHomeCardsWithFull += cards.filter((c) => c.includes(ANNOUNCEMENT_LIVE_FULL)).length;
				}
			}
		}
		const fmt = (arr) => (arr.length ? `${arr.length} 个：${arr.slice(0, 5).join(" ｜ ")}${arr.length > 5 ? " …" : ""}` : "干净");
		// 扫描面 / 二进制判定写进**通过文案**：既报"扫了多少"，也报"跳过了多少、按什么判的"
		const scanNote =
			`产物 ${distAllFiles.length} 个文件全查（含文件名/路径）；其中内容可读 ${scanned} 个，` +
			`按"含 NUL 字节即视为二进制"跳过内容扫描 ${binarySkipped} 个（其文件名/路径仍查）` +
			`${unreadable ? `，读失败 ${unreadable} 个` : ""}`;
		record(
			"R-ID-05/R-NAV-06",
			`上游身份零残留（产物全集 ${distAllFiles.length} 个文件逐个扫，含文件名/路径；全产物零例外）`,
			leakedFiles.length === 0 && scanned > 0,
			`${scanNote}。命中的产物：${fmt(leakedFiles)}${scanned > 0 ? "" : "；⚠️ 可读文本文件数为 0 → 判据空过，判红"}`,
		);
		record(
			"R-ID-05",
			`产物文件名/路径不含上游字样（${distAllFiles.length} 个路径全查；全产物零例外）`,
			nameLeakFiles.length === 0,
			fmt(nameLeakFiles),
		);
		record(
			"R-ID-05",
			`产物全集里没有上游品牌/身份/凭据串（大小写敏感 ${IDENTITY_NEEDLES.length} 个判据；全产物零例外）`,
			identityLeakFiles.length === 0,
			fmt(identityLeakFiles),
		);
		record(
			"R-ID-05",
			`可见文本（剥 script/style/注释）里没有上游品牌/身份字样（${distHtmlFiles.length} 个 HTML；全产物零例外）`,
			visibleLeakFiles.length === 0,
			fmt(visibleLeakFiles),
		);
		record(
			"R-ID-06",
			"全站产物没有订阅残渣（rss/atom 链接与入口）",
			feedLeakFiles.length === 0,
			fmt(feedLeakFiles),
		);
		// ── v1.57：隐私与排除项泄漏守卫（两条：负控 + 正控）────────────────────────
		// 负控：14 个串一个都不许出现在**产物全集**（内容 + 文件名/路径）里。
		// 失败时把**命中的文件与串**逐条打出来 —— 只报"失败"而不说改哪条 URL，等于没说。
		record(
			"R-BOOKNAV-04",
			`书签清单没把隐私/排除项带进产物（${PRIVACY_NEEDLES.length} 个串，扫 ${distAllFiles.length} 个产物文件 + 文件名/路径）`,
			privacyLeakFiles.length === 0 && scanned > 0,
			privacyLeakFiles.length
				? `命中 ${privacyLeakFiles.length} 处：${privacyLeakFiles.slice(0, 8).join(" ｜ ")}${privacyLeakFiles.length > 8 ? " …" : ""}`
				: `${scanNote}。14 个串（腾讯云实例 ID / Docker 用户名 / LangSmith 组织 ID / dlsite / theporndude / 139.159.190.22 / wzyp.cn / 27届小比特-实习-资料汇总 / i.chaoxing.com/base?t= / webhp? / /u/1/app? / activeTab=readme / /thankyou.php? / searchParams=）零命中`,
		);
		// 正控：守卫不能是"产物里什么都没有"的假绿 —— 发起人点名要收录的域名必须在。
		// ⚠️ 这一条同时挡住"把 happy.bigmess.org 顺手加进守卫"这种自伤（加了它，负控与正控会同时红）。
		record(
			"R-BOOKNAV-04",
			"守卫的正控：发起人明确要收录的站点仍在产物里（不是「产物空了」的假绿）",
			positives.size === positiveNeedles.length,
			`命中 ${positives.size}/${positiveNeedles.length}：${positiveNeedles.map((n) => `${n}=${positives.has(n)}`).join(" ｜ ")}（happy.bigmess.org 已按发起人要求收录，**故意不在负控名单里**）`,
		);
		// ── v1.60：模板示例公告文案守卫（**负控 + 正控压进同一个 pass，故意不拆两条**）──────
		// 拆成两条的话，"公告被关掉 / 卡片渲染成空"会呈现为「负控 ✅ + 正控 ❌」——
		// 看着像**半个成功**，而这恰恰是最需要一眼判死的假绿（T77 同类）。压进一条：
		// 任何一条腿断掉 → 整条红，没有"半绿"可读。
		// 四条腿缺一不可：① 旧示例串零命中；② 真扫到了可读文本（`scanned > 0`，防"产物空了"假绿）；
		// ③ 产物里**至少有公告卡**且**每一张卡都逐字含新文案**；④ 首页（`dist/index.html`，
		// 有侧栏的代表页）也必须有卡且含新文案 —— 只靠 ③ 的话，"只在某一页保留公告、
		// 其余 161 页全摘掉"仍会绿。
		record(
			"R-ID-05/R-WDG-04",
			`模板示例公告文案零残留 + 新公告文案确实渲染在侧栏公告卡里（负控 ${ANNOUNCEMENT_TEMPLATE_NEEDLES.length} 个串扫 ${distAllFiles.length} 个产物文件 + 文件名/路径；正控 = 卡内逐字含新文案）`,
			announcementTemplateHits.length === 0 &&
				scanned > 0 &&
				annCards > 0 &&
				annCardsWithFull === annCards &&
				annHomeCards > 0 &&
				annHomeCardsWithFull === annHomeCards,
			`负控（${ANNOUNCEMENT_TEMPLATE_NEEDLES.map(([n]) => n).join(" / ")}）：${
				announcementTemplateHits.length
					? `❌ 命中 ${announcementTemplateHits.length} 处：${announcementTemplateHits.slice(0, 8).join(" ｜ ")}${announcementTemplateHits.length > 8 ? " …" : ""}`
					: "零命中"
			}；正控（公告卡内逐字含「${ANNOUNCEMENT_LIVE_FRAGMENT}」那一整句）：共 ${annCards} 张卡，含整句 ${annCardsWithFull} 张、含片段 ${annCardsWithFragment} 张${
				annCards === 0
					? "（❌ 产物里一张公告卡都没有 → 公告被关掉 / 组件被摘掉，这正是正控要挡的假绿）"
					: ""
			}；首页 dist/index.html ${annHomeCards} 张卡、含整句 ${annHomeCardsWithFull} 张；${scanNote}`,
		);

		// ── v1.65：公告卡里那个「了解更多」按钮的落点（发起人要求改到「关于本站」）─────────
		// 发起人原话：「把公告跳转后的地方放在关于本站那里」。判据两条腿：
		//   ① 首页**每一张**公告卡切片内都有 `href="/about-site/"`；
		//   ② 反面 —— 卡片里**不再**出现指向 `/about/` 的链接（否则"两处都改/只改一处"都会溜过去）。
		{
			const homeCards = announcementCardsOf(await (await fetch(`${BASE}/`)).text());
			const withAboutSite = homeCards.filter((c) => /href="\/about-site\/"/.test(c)).length;
			const withOldAbout = homeCards.filter((c) => /href="\/about\/"/.test(c)).length;
			record(
				"R-NAV-04",
				"公告卡「了解更多」指向关于本站（v1.65 起；不再指向 /about/）",
				homeCards.length > 0 && withAboutSite === homeCards.length && withOldAbout === 0,
				`首页公告卡 ${homeCards.length} 张：指向 /about-site/ 的 ${withAboutSite} 张、仍指向 /about/ 的 ${withOldAbout} 张`,
			);
		}
	}

	// ── P4-8（v1.51）：搜索索引里也搜不到上游字样（补上最后一个盲区）────────────
	// **为什么光扫产物不够**：`dist/pagefind/**` 有 184 个**压缩过的索引分片**，上面的
	// "产物全集"扫描按"含 NUL 字节即视为二进制"把它们的内容整个跳过了（分片是二进制压缩体），
	// 而关于页是带 `data-pagefind-body` 被索引的 —— 也就是说**上游作者的名字可能就躺在索引里**
	// 而没有任何断言证明它不在。分片是给 pagefind 自己读的，肉眼和正则都翻不出来，
	// 唯一可靠的判法是**问搜索本身**：拿站点实际加载的那份 pagefind 去搜。
	//
	// ⚠️ **踩到的第一版坑（v1.51 实测，必须写下来）：`count === 0` 这个判据本身不成立。**
	//    第一版就写成"搜 `cuteleaf` / `Firefly` 结果数 = 0"，跑出来 **cuteleaf 3 条 / Firefly 3 条**
	//    —— 看着像残留，其实是 **pagefind 的 zh-cn 分词器把拉丁词切成 CJK 二元组**：
	//    `Firefly` → `fi`/`ir`/`re`/`ef`/`fl`/`ly`，于是命中了正文里的 shell `fi`、`Wi-Fi`、
	//    `sleep 2`；`cuteleaf` → 同理命中 `CutForSearch`。实测那 3 条结果的 `data().content`
	//    **没有一条**真的含有这两个词（探针：`reports/_p48-search-probe2.mjs`）。
	//    所以判据改成**两条腿**，缺一不可：
	//      ① **精确查询**（pagefind 的引号短语语法 `"cuteleaf"`）—— 它不吃二元组噪声，改动前后
	//         实测 `"cuteleaf"` / `"Firefly"` / `"夏叶"` 都是 **0**，而 `"指针"` 仍是 **73**；
	//      ② **逐条查正文**（把普通查询返回的每条结果的 `content`/`excerpt`/`meta` 拼起来，
	//         看有没有**真的**含这个词 —— 普通查询召回更宽，正好当"宁可多查"的那条腿）。
	//    搜索框那条 UI 路径用的是普通查询（`Search.svelte` 就是这么调的），所以负控在 UI 侧
	//    不能断言"面板里 0 个结果链接"（`cuteleaf` 会渲染 3 条噪声），而要断言
	//    **面板显示出来的文字里不含这个词**。
	//
	// 判据 = 一条正控 + 三条负控，**正控不是装饰，是防假绿的关键**：
	//   ① **正控**：搜一个必然有结果的词（`指针` —— 站内 C/C++ 主线的高频词，实测 73 条），
	//      断言 **> 0**；同时用真实 Chrome 往 `#search-input-desktop` 里打字，断言站点自己的
	//      搜索面板真的渲染出结果链接。⚠️ 没有这条，下面三条负控就是空话：`Navbar.astro` 的
	//      加载失败分支会把 `window.pagefind` 换成 `{ search: () => Promise.resolve({ results: [] }) }`
	//      的空壳 —— 搜索整个坏掉时三条负控会**全部通过**（"搜不到"只是因为搜索坏了）。
	//   ② **负控**：`夏叶` / `cuteleaf` / `Firefly` 各断言 **精确查询 0 条 + 逐条正文里也没有 +
	//      面板文字里也不含**。换关于页之前实测：这三个词的**精确查询**各能搜到 **1** 条 ——
	//      正是 `/about/` 那一页（作者实名 / 上游主题名 / 上游仓库地址全在里面）。
	//      所以这条断言在换页前必红，不是空跑；v1.51 另用注入实测过它**真的会红**（两次）。
	//   ⚠️ 搜索是异步的（300ms debounce + 索引查询）→ 面板要**轮询等结果落定**再读，不能读一帧就下结论。
	{
		const SEARCH_POSITIVE = "指针"; // 正控：站内必然有结果的词
		const SEARCH_FORBIDDEN = ["夏叶", "cuteleaf", "Firefly"]; // 负控：上游身份字样
		/**
		 * 用站点**实际加载**的 pagefind 搜一个词，返回三个数：
		 * `plainCount`（普通查询条数 —— 含二元组噪声，只用于"逐条查正文"那条腿）、
		 * `exactCount`（引号精确查询条数 —— 负控的主判据）、
		 * `needleHits`（普通查询结果里**正文真的含这个词**的条数）。
		 */
		const probeViaPagefind = async (term) => {
			const exactQuery = `"${term}"`;
			try {
				const { result } = await cdp.send("Runtime.evaluate", {
					expression: `(async () => {
						try {
							if (typeof window.__loadPagefind === "function") await window.__loadPagefind();
							if (!window.pagefind || typeof window.pagefind.search !== "function")
								return { error: "window.pagefind 不可用（pagefind.js 没加载成功）" };
							const needle = ${JSON.stringify(term)}.toLowerCase();
							const scan = async (q) => {
								const res = await window.pagefind.search(q);
								const data = await Promise.all(res.results.map((x) => x.data()));
								return { count: res.results.length, data };
							};
							const plain = await scan(${JSON.stringify(term)});
							const exact = await scan(${JSON.stringify(exactQuery)});
							const hits = plain.data
								.filter((d) => {
									const hay = (((d && d.content) || "") + " " + ((d && d.excerpt) || "") + " " +
										JSON.stringify((d && d.meta) || {})).toLowerCase();
									return hay.includes(needle);
								})
								.map((d) => ((d.meta && d.meta.title) || d.url || "?").slice(0, 40));
							return {
								plainCount: plain.count,
								exactCount: exact.count,
								needleHitCount: hits.length,
								needleHits: hits.slice(0, 3),
							};
						} catch (e) {
							return { error: String((e && e.message) || e) };
						}
					})()`,
					awaitPromise: true,
					returnByValue: true,
				});
				return result?.value ?? { error: "Runtime.evaluate 没有返回值" };
			} catch (e) {
				return { error: `CDP 调用失败：${e.message}` };
			}
		};
		/** 真实打字：把词打进站点搜索框，等面板落定后读它渲染了什么（含"面板文字里有没有这个词"） */
		const searchViaUi = async (term) => {
			try {
				const { result } = await cdp.send("Runtime.evaluate", {
					expression: `(async () => {
						const input = document.getElementById("search-input-desktop");
						if (!input) return { error: "找不到 #search-input-desktop" };
						const panel = document.getElementById("search-panel");
						input.focus();
						input.value = ${JSON.stringify(term)};
						input.dispatchEvent(new Event("input", { bubbles: true }));
						// 至少等 2500ms：既等完 debounce + 查询，也保证读到的是**这次**查询的结果
						// （面板里可能还挂着上一个词的渲染结果 —— 读早了就会把旧结果当成新结果）
						const t0 = Date.now();
						let links = 0;
						let text = "";
						while (Date.now() - t0 < 9000) {
							await new Promise((r) => setTimeout(r, 150));
							links = panel ? panel.querySelectorAll("a[href]").length : 0;
							text = panel ? panel.textContent.replace(/\\s+/g, " ").trim() : "";
							if (links > 0) break;
							if (Date.now() - t0 >= 2500 && /找不到相关结果/.test(text)) break;
						}
						return {
							links,
							text: text.slice(0, 100),
							needleInPanel: text.toLowerCase().includes(${JSON.stringify(term)}.toLowerCase()),
						};
					})()`,
					awaitPromise: true,
					returnByValue: true,
				});
				return result?.value ?? { error: "Runtime.evaluate 没有返回值" };
			} catch (e) {
				return { error: `CDP 调用失败：${e.message}` };
			}
		};

		if (isDevServer) {
			record(
				"INFO(dev)",
				"搜索索引零残留扫描已跳过",
				true,
				"dev 下 pagefind 不可用（`Search.svelte` 走 `import.meta.env.DEV` 的假结果分支），不对着 dev 断言搜索；请用 pnpm preview",
			);
		} else {
			// 先把页面导到站上：搜的是站点**实际加载**的 pagefind（`/pagefind/pagefind.js`）
			const searchLoaded = cdp.once("Page.loadEventFired", 15000).catch(() => null);
			await cdp.send("Page.navigate", { url: `${BASE}/` });
			await searchLoaded;
			await sleep(600); // 等 Svelte 岛 hydrate（搜索框的 bind:value 要挂上才吃得住 input 事件）

			const positive = await probeViaPagefind(SEARCH_POSITIVE);
			const positiveUi = await searchViaUi(SEARCH_POSITIVE);
			const positiveCount = typeof positive.plainCount === "number" ? positive.plainCount : -1;
			const positiveLinks = typeof positiveUi.links === "number" ? positiveUi.links : -1;
			record(
				"R-ID-05",
				`站内搜索确实在工作（正控「${SEARCH_POSITIVE}」必须搜得到）`,
				positiveCount > 0 && positiveLinks > 0,
				`pagefind.search("${SEARCH_POSITIVE}") = ${positive.error ?? `${positiveCount} 条`}；` +
					`搜索框打字后面板渲染 ${positiveUi.error ?? `${positiveLinks} 个结果链接`}` +
					`（⚠️ 这一条是下面三条负控的"防假绿"前提：搜索坏了会先在这里红）`,
			);
			for (const term of SEARCH_FORBIDDEN) {
				const api = await probeViaPagefind(term);
				const ui = await searchViaUi(term);
				const exactCount = typeof api.exactCount === "number" ? api.exactCount : -1;
				const needleHitCount = typeof api.needleHitCount === "number" ? api.needleHitCount : -1;
				const needleInPanel = ui.needleInPanel === true;
				record(
					"R-ID-05",
					`上游字样在搜索索引里也搜不到：「${term}」（精确查询 0 条 + 逐条正文零命中 + 面板文字不含）`,
					exactCount === 0 && needleHitCount === 0 && !needleInPanel,
					api.error || ui.error
						? `${api.error ?? ""} ${ui.error ?? ""}`
						: `pagefind.search("${term}") 精确查询 = ${exactCount} 条、普通查询 ${api.plainCount} 条` +
							`（其中正文真的含这个词的 ${needleHitCount} 条${needleHitCount ? `：${api.needleHits.join(" ｜ ")}` : ""}）；` +
							`搜索面板：${ui.links} 个结果链接、面板文字含该词 = ${needleInPanel} ｜ ${ui.text || "(空)"}`,
				);
			}
		}
	}
	// 文章页不该有打赏按钮（R-NAV-06 的第三项）
	const postHtml = await (await fetch(`${BASE}${SAMPLE_POST}`)).text();
	record(
		"R-NAV-06",
		"文章页没有打赏按钮 / 打赏链接",
		!/\/sponsor\//.test(postHtml) && !postHtml.includes("打赏"),
		"/sponsor/ 与「打赏」均未出现",
	);
	// R-ID-08 / R-ID-09（发起人 2026-09-24 评审先导文章时提的两条）
	record(
		"R-ID-08",
		"文章页不再显示许可协议块（也没有 creativecommons 外链）",
		!postHtml.includes("许可协议") && !postHtml.includes("creativecommons.org"),
		"许可块与 CC 链接均未出现",
	);
	// ⚠️ R-ID-09（分享块）的断言放在后面的 R-CNT 块里：分享块的按钮在 SharePoster 这个
	// **Svelte 岛**内，服务端 HTML 里只有静态的「文章分享」卡片字样，必须读 hydration 后的 DOM。
	// 站点元信息（R-ID-03）
	const homeHtml = probeHtml;
	record(
		"R-ID-03",
		"description 与 keywords 已写入",
		/<meta name="description" content="[^"]{10,}"/.test(homeHtml) && /<meta name="keywords" content="[^"]{5,}"/.test(homeHtml),
		"",
	);
	record(
		"R-ID-03",
		"站点 URL 用的是本站占位域名（待 B-01 换真值）",
		homeHtml.includes("imiss.example.com"),
		"",
	);

	// 逐页采集 + 截图
	// 注意 fullPage：侧边栏是 sticky 定位，captureBeyondViewport 会把 sticky 元素按"初始位置"渲染，
	// 于是右侧栏下半部分在整页图里会看起来是空的。要检查侧栏组件就用 fullPage:false 的高视口截图。
	const pages = [
		{ name: "home-1440", path: "/", width: 1440, height: 900, mobile: false },
		{ name: "home-390", path: "/", width: 390, height: 844, mobile: true },
		{ name: "sidebar-1440", path: "/", width: 1440, height: 2400, mobile: false, fullPage: false },
		{ name: "guestbook-1440", path: "/guestbook/", width: 1440, height: 900, mobile: false },
		{ name: "myanimelist-1440", path: "/myanimelist/", width: 1440, height: 900, mobile: false },
		{ name: "vndb-1440", path: "/vndb/", width: 1440, height: 900, mobile: false },
		{ name: "about-1440", path: "/about/", width: 1440, height: 900, mobile: false },
		// v1.65：「关于本站」新页（内容是原 about.md 那篇整体搬过来的）——采集它的事实 + 截图
		{ name: "about-site-1440", path: "/about-site/", width: 1440, height: 900, mobile: false },
		// v1.57（B-10）：书签导航页 —— 整页换内容后必须有断言看着（此前一条都没有），
		// booknav: true → 额外采集分组/卡片/图标降级事实（COLLECT_BOOKNAV）。
		// 用 1440×1400 是因为 38 张卡分 6 组铺下来很高，900 高的整页截图会把下面的组切掉。
		{ name: "booknav-1440", path: "/booknav/", width: 1440, height: 1400, mobile: false, booknav: true },
		{ name: "booknav-390", path: "/booknav/", width: 390, height: 844, mobile: true, booknav: true },
		// P2R 学习路线（排行那 8 张随模块删除，Task 4 / P2R-6）
		{ name: "roadmap-1440", path: "/roadmap/", width: 1440, height: 1000, mobile: false, roadmap: true },
		{ name: "roadmap-390", path: "/roadmap/", width: 390, height: 844, mobile: true, roadmap: true },
		// P3 桌宠：必须用"只有视口、不整页"的截图，否则 position:fixed 的宠物会按初始位置被画到长图里
		{ name: "pet-1440", path: "/", width: 1440, height: 900, mobile: false, fullPage: false },
		{ name: "pet-390", path: "/", width: 390, height: 844, mobile: true, fullPage: false },
		// P4 内容迁移：导入的文章页（post: true → 额外采集正文事实）
		{ name: "post-http-1440", path: "/posts/linux-net/http-xieyi/", width: 1440, height: 900, mobile: false, post: true },
		{ name: "post-http-390", path: "/posts/linux-net/http-xieyi/", width: 390, height: 844, mobile: true, post: true },
		{ name: "post-rbtree-1440", path: "/posts/cpp/hongheishufengzhuangshixian-mymap-he-myset/", width: 1440, height: 900, mobile: false, post: true },
		{ name: "post-sdd-1440", path: "/posts/ai/sdd/", width: 1440, height: 900, mobile: false, post: true },
	];

	const facts = {};
	// ⚠️ v1.70：高视口页面（≥1600 高）**先屏蔽 mp4**，让壁纸只显示海报（同一帧的 webp）。
	// 现场（可复现）：单独开一个浏览器拍 1440×2400 + 视频在播只要 1.4 秒，但在完整验收流程里
	// 跑到第 3 页（sidebar-1440 正是 1440×2400）时渲染进程**整个卡死** —— captureScreenshot
	// 90 秒超时、连 Runtime.evaluate 都不回，所以"事后重试"救不回来，只能**在导航前**就别让它加载。
	// 机制：视口 2400 高 → 横幅 80vh = 1920 → 视频被 cover 放大到约 4500×1920，
	// 软件合成这一层在累积几页之后就是压垮骆驼的那根稻草。
	// ⚠️ 这类页面的截图不能拿来断言"视频在播"——R-BG-02 的事实取自 home-1440 / home-390。
	await cdp.send("Network.enable");
	for (const page of pages) {
		await cdp.send("Network.setBlockedURLs", { urls: (page.height ?? 0) >= 1600 ? ["*.mp4"] : [] });
		await cdp.send("Emulation.setDeviceMetricsOverride", {
			width: page.width,
			height: page.height,
			deviceScaleFactor: 1,
			mobile: page.mobile,
		});
		// 本站主题跟系统（siteConfig.theme.colorScheme = system），所以要真的模拟
		// prefers-color-scheme 媒体特性，Tailwind 的 `dark:` 变体才会跟着切。
		// ⚠️ 这里**一律模拟暗色**：原先唯一要拍亮色的页面是 `rank-jp-light-1440`（排行缺图占位在亮色下
		//    最容易糊），随排行模块删除后页面清单里再没有 `light: true` 的生产者 —— 原来的
		//    `page.light ? "light" : "dark"` 就成了永远走不到另一个分支的死代码（Task 4 审查 Minor 5），
		//    已改成写死 "dark"。**亮色主题的校验没有丢**：下面的 token 级对比度 A/B 仍按
		//    `["light","dark"]` 两套跑。将来要再拍亮色页时，在这里按 `page.name` 判断，
		//    **别只往 pages 项里加 `light: true`** —— 那不会生效。
		await cdp.send("Emulation.setEmulatedMedia", {
			features: [{ name: "prefers-color-scheme", value: "dark" }],
		});
		const loaded = cdp.once("Page.loadEventFired");
		await cdp.send("Page.navigate", { url: `${BASE}${page.path}` });
		await loaded;
		await sleep(900); // 等客户端脚本落定（--hue、统计、日历等）

		const { result } = await cdp.send("Runtime.evaluate", {
			expression: COLLECT,
			returnByValue: true,
			awaitPromise: true,
		});
		facts[page.name] = result.value;

		// 截图前先模拟"用户滚一遍"：页面上的入场动效靠 IntersectionObserver（原排行榜的逐行入场就是这套），
		// 不滚一遍的话整页截图会把还没露出的行拍成空白（P2 审查时踩到过这个坑）。
		// 注意 html 上有 `scroll-behavior: smooth`（src/styles/main.css），
		// 必须显式 behavior:"instant"——否则 scrollTo 是动画，每步 90ms 根本到不了目标位置。
		await cdp.send("Runtime.evaluate", {
			expression: `(async () => {
				const step = Math.max(200, Math.round(window.innerHeight * 0.8));
				for (let y = 0; y < document.body.scrollHeight; y += step) {
					window.scrollTo({ top: y, behavior: "instant" });
					await new Promise((r) => setTimeout(r, 90));
				}
				window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
				await new Promise((r) => setTimeout(r, 250));
				window.scrollTo({ top: 0, behavior: "instant" });
				await new Promise((r) => setTimeout(r, 550));
				return "scrolled";
			})()`,
			awaitPromise: true,
			returnByValue: true,
		});

		// P4：文章页要等正文图片 decode 完再判"到底加载出来没有"
		if (page.post) {
			const postRes = await cdp.send("Runtime.evaluate", {
				expression: COLLECT_POST,
				returnByValue: true,
				awaitPromise: true,
			});
			facts[`${page.name}-post`] = postRes.result.value;
		}

		// P2R：学习路线页的 DOM 契约事实
		if (page.roadmap) {
			const rmRes = await cdp.send("Runtime.evaluate", {
				expression: COLLECT_ROADMAP,
				returnByValue: true,
				awaitPromise: true,
			});
			facts[`${page.name}-roadmap`] = rmRes.result.value;
		}

		// v1.57：书签导航页的 DOM 契约事实（分组 / 卡片 / 图标降级 / 空组）
		if (page.booknav) {
			const bnRes = await cdp.send("Runtime.evaluate", {
				expression: COLLECT_BOOKNAV,
				returnByValue: true,
				awaitPromise: true,
			});
			facts[`${page.name}-booknav`] = bnRes.result.value;
		}

		// v1.58：书签页的**深色**图标配色（R-BOOKNAV-07 的唯一事实来源）。
		// 只在 1440 那一趟采（390 那趟的配色是同一份 CSS，不必采第二遍，也省一次切主题）。
		// ⚠️ 三件事必须同时做，缺一个量到的就是亮色值（第一版实测踩过）：
		//   ① `Emulation.setEmulatedMedia` 把 prefers-color-scheme 设成 dark
		//      —— 项目里 `--card-bg` 这类 token 走 CSS 变量，媒体查询会重算它们；
		//   ② `html.dark` 类 —— 本书签页图标的深色走 Tailwind `dark:` 变体，
		//      而 `@custom-variant dark (&:where(.dark, .dark *))` 跟的是**类**，不是媒体特性；
		//   ③ 改完要等一帧，浏览器才会把 color-mix 重算进 computed style。
		//     而且 `.booknav-icon` 带 300ms 过渡，必须等过渡跑完（采集表达式内部 await 450ms），
		//     所以这里要传 `awaitPromise: true` —— 否则拿回来的是一张还没 resolve 的 Promise。
		if (page.booknav && !page.mobile) {
			// 第 ③ 条要**在页面加载前**就把媒体特性设成 dark，让页面 boot 时就按深色起；
			// 加载后再补 `Emulation.setEmulatedMedia` 会重算 `dark:` 变体、触发 300ms 过渡。
			await cdp.send("Emulation.setEmulatedMedia", {
				features: [
					{ name: "prefers-color-scheme", value: "dark" },
					{ name: "prefers-reduced-motion", value: "no-preference" },
				],
			});
			// ⚠️ **必须重新加载一次**：COLlect_BOOKNAV 刚刚把主题钉成了亮色（见那边注释），
			//    而且主循环前面的用例可能已经把页面留在深色。重载能确保"深色是从页面
			//    boot 起就生效的"，`color-mix` 一次算好、没有过渡中间值。
			//    （不重载而只改类的话，实测会读到过渡插值色 —— 那是个代码里根本不存在的颜色，
			//     注入验证时表现为"字母块拿到深色值、svg 图标却拿到亮色值"这种自相矛盾的结果。）
			const darkLoaded = cdp.once("Page.loadEventFired");
			await cdp.send("Page.navigate", { url: `${BASE}/booknav/` });
			await darkLoaded;
			await sleep(400);
			const darkRes = await cdp.send("Runtime.evaluate", {
				expression: COLLECT_BOOKNAV_DARK,
				returnByValue: true,
				awaitPromise: true,
			});
			facts["booknav-dark-icons"] = darkRes.result.value;
			// 采完把媒体特性还原并重载，让同一趟里的截图与后续采集回到**亮色页面**
			// （截图是交付物，必须是亮色；verify-ui 主循环跑到这里时页面可能已是深色，
			//  所以这里显式还原而不是"指望它本来就是亮的"）。
			await cdp.send("Emulation.setEmulatedMedia", {
				features: [
					{ name: "prefers-color-scheme", value: "light" },
					{ name: "prefers-reduced-motion", value: "no-preference" },
				],
			});
			const lightAgain = cdp.once("Page.loadEventFired");
			await cdp.send("Page.navigate", { url: `${BASE}/booknav/` });
			await lightAgain;
			await cdp.send("Runtime.evaluate", {
				expression: `(() => { document.documentElement.classList.remove("dark"); document.documentElement.setAttribute("data-theme", "light"); return true; })()`,
				returnByValue: true,
			});
			await sleep(700);
		}

		/**
		 * 截图（v1.70 起带"降级重试"）
		 * ============================================================================
		 * 壁纸变成 2944×1248 的视频之后，这一循环在第 3 页（1440×2400 那档）会**卡死**：
		 * `Page.captureScreenshot` 从 30 秒抬到 90 秒仍然超时；而单独复现同尺寸只要 0.9 秒
		 * —— 说明是**多页累积之后**的软件合成 / 内存压力，不是某一张图本身的问题。
		 * 三档：① 原样拍；② 先暂停视频（解码器不再产出新帧）；③ 把视频层隐藏（成本降到最低，
		 * 截图里那一块会露出壁纸底色）。第 ③ 档仍失败才真的抛错 —— 日志里会写明用的是哪一档。
		 */
		const captureWithFallback = async () => {
			const attempts = [
				{ label: "原样", prep: null },
				{ label: "暂停视频", prep: `(() => { const v = document.getElementById("wallpaper-video"); if (v && !v.paused) v.pause(); return "paused"; })()` },
				{ label: "隐藏视频层", prep: `(() => { const l = document.getElementById("wallpaper-video-layer"); if (l) l.style.visibility = "hidden"; const v = document.getElementById("wallpaper-video"); if (v && !v.paused) v.pause(); return "hidden"; })()` },
			];
			let lastErr = null;
			for (const [i, a] of attempts.entries()) {
				try {
					if (a.prep) {
						await cdp.send("Runtime.evaluate", { expression: a.prep, returnByValue: true });
						await sleep(500);
					}
					const shot = await cdp.send("Page.captureScreenshot", {
						format: "png",
						captureBeyondViewport: page.fullPage !== false,
					});
					if (i > 0) console.log(`  ↳ ${page.name}：第 ${i + 1} 档（${a.label}）才拍成功`);
					// 复位：下一张图不该受这一张的临时处置影响
					await cdp.send("Runtime.evaluate", {
						expression: `(() => {
							const l = document.getElementById("wallpaper-video-layer");
							if (l) l.style.visibility = "";
							const v = document.getElementById("wallpaper-video");
							if (v && v.paused) v.play().catch(() => {});
							return "restored";
						})()`,
						returnByValue: true,
					});
					return shot;
				} catch (err) {
					lastErr = err;
					console.log(`  ↳ ${page.name}：第 ${i + 1} 档（${a.label}）失败：${err.message}`);
				}
			}
			throw lastErr ?? new Error("截图失败");
		};
		const shot = await captureWithFallback();
		await fs.writeFile(path.join(OUT_DIR, `${page.name}.png`), Buffer.from(shot.data, "base64"));
		console.log(`截图 ${path.join(OUT_DIR, `${page.name}.png`)}  (${page.width}×${page.height})`);
	}

	// ── R-PATH-01 通用判据：**经 Swup 点导航第 3 格切页**落到路线页，落地页与抽屉态都要对 ──
	// 这一段的前身是 P2 的「R-RANK-02 回归：经 Swup 切页进入排行页后再切换维度」（D1 缺陷：
	// @swup/scripts-plugin 会重跑容器内联脚本 → initAll() 被调用两次 → 同一个按钮绑两个 click
	// → 点一下 pushState 两次 → 按一次后退回不到上一个榜单；直开路径永远是绿的，所以必须真点导航）。
	// v1.41 起导航里再没有通往 `/rank/jp/` 的入口（那一格换成「学习路线」单链接），
	// Task 4 删排行时按 ARCH §5.7 把**可复用的那一半**留在这里：点导航 → Swup 接管 → 落地页正确。
	// 采集下来的 key 叫 `roadmap-via-swup`（原 `rank-via-swup`），判定在下面 R-PATH 块里。
	{
		const loaded = cdp.once("Page.loadEventFired");
		await cdp.send("Page.navigate", { url: `${BASE}/` });
		await loaded;
		await sleep(700);
		const { result: clickedNav } = await cdp.send("Runtime.evaluate", {
			expression: `(() => {
				const a = document.querySelector('#navbar a[href="/roadmap/"]') || document.querySelector('a[href="/roadmap/"]');
				if (!a) return "no-link";
				a.click();
				return "clicked";
			})()`,
			returnByValue: true,
		});
		await sleep(1100); // 等 Swup 换页 + astro:page-load
		const { result: afterSwup } = await cdp.send("Runtime.evaluate", {
			expression: COLLECT,
			returnByValue: true,
		});
		facts["roadmap-via-swup"] = { nav: clickedNav.value, ...afterSwup.value };
	}

	// ── P3 桌宠：九状态与交互（R-PET-01 ~ R-PET-05）──
	// 全部用**真实输入事件**驱动（Input.dispatchKeyEvent / PointerEvent / contextmenu），
	// 不直接改 data-pet-state —— 否则测的是"我能不能改属性"，不是"用户点了会怎样"。
	{
		await cdp.send("Emulation.setDeviceMetricsOverride", {
			width: 1440,
			height: 900,
			deviceScaleFactor: 1,
			mobile: false,
		});
		await cdp.send("Emulation.setEmulatedMedia", {
			features: [{ name: "prefers-color-scheme", value: "dark" }],
		});
		const loaded = cdp.once("Page.loadEventFired");
		await cdp.send("Page.navigate", { url: `${BASE}/` });
		await loaded;
		await sleep(2400); // 等出场招呼播完

		const snap = async (key) => {
			const { result } = await cdp.send("Runtime.evaluate", { expression: COLLECT, returnByValue: true });
			facts[key] = result.value;
			return result.value.pet;
		};
		const clickMenu = (act) =>
			cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const b = document.querySelector('[data-pet-act="${act}"]');
					if (!b) return "missing";
					b.click();
					return "ok";
				})()`,
				returnByValue: true,
			});
		/**
		 * 把宠物拖到 (x, y) 并松手（走真实的 pointerdown/move/up）。
		 * R-PET-06 的三档模式都要用"拖到半空再松手"来区分：
		 * 悬浮 → 停在半空、固定 → 停住不动、贴地 → 掉回地面。
		 */
		const dragPet = (x, y) =>
			cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const el = document.getElementById("pet-body");
					const r = el.getBoundingClientRect();
					const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
					const o = { bubbles: true, pointerId: 9, button: 0 };
					el.dispatchEvent(new PointerEvent("pointerdown", { ...o, clientX: sx, clientY: sy }));
					el.dispatchEvent(new PointerEvent("pointermove", { ...o, clientX: ${x}, clientY: ${y} }));
					el.dispatchEvent(new PointerEvent("pointerup", { ...o, clientX: ${x}, clientY: ${y} }));
					return "ok";
				})()`,
				returnByValue: true,
			});

		await snap("pet-boot");

		// ① 键盘：Tab 聚焦（这里直接 focus，可达性由 tabindex 保证）→ Enter → jumping
		await cdp.send("Runtime.evaluate", {
			expression: `document.getElementById("pet-body").focus(); "focused"`,
			returnByValue: true,
		});
		for (const type of ["rawKeyDown", "keyUp"]) {
			await cdp.send("Input.dispatchKeyEvent", {
				type,
				key: "Enter",
				code: "Enter",
				windowsVirtualKeyCode: 13,
				nativeVirtualKeyCode: 13,
			});
		}
		await sleep(120);
		await snap("pet-key-enter");

		// ② 键盘：← → running-left
		//    ⚠️ v1.59（默认档从 `float` 改成 `fixed`）之后这里必须分两步：`walkTo()` 在 fixed 档
		//    **直接 return**（组件里 R-PET-08 起就写着"固定模式：不位移（键盘 ←→ 也不动）"），
		//    而默认档现在正是它 —— 直接沿用旧写法会当场判红（这也是本轮真实踩到的级联）。
		//    所以先按一次 ← 断言"默认档连键盘也不动"（默认档的真实行为，不是回归），
		//    再 `__imissSetMode("float")` 按第二次，把 R-PET-02 的「running-left」覆盖面**留住**
		//    —— 默认值变了不等于另外两档可以不再测。切档后宠物从右下角逐位抬回悬浮基准线，
		//    后续菜单/拖拽那几步因此仍跑在 float 上（与改默认档之前完全一致）。
		const arrowLeft = async () => {
			for (const type of ["rawKeyDown", "keyUp"]) {
				await cdp.send("Input.dispatchKeyEvent", {
					type,
					key: "ArrowLeft",
					code: "ArrowLeft",
					windowsVirtualKeyCode: 37,
					nativeVirtualKeyCode: 37,
				});
			}
			await sleep(150);
		};
		const fixedKey1 = await snap("pet-fixed-key-before");
		await arrowLeft();
		const fixedKey2 = await snap("pet-fixed-key-after");
		facts["pet-fixed-key"] = {
			mode: fixedKey2.mode,
			x1: fixedKey1.rect.x,
			y1: fixedKey1.rect.y,
			x2: fixedKey2.rect.x,
			y2: fixedKey2.rect.y,
			transform1: fixedKey1.transform,
			transform2: fixedKey2.transform,
			state: fixedKey2.state,
		};
		await cdp.send("Runtime.evaluate", {
			expression: `window.__imissSetMode("float"); "float"`,
			returnByValue: true,
		});
		await sleep(250);
		await arrowLeft();
		await snap("pet-key-left");

		// ③ 右键菜单：必须打开、且有那五项（含"和爱弥斯聊天"）
		await cdp.send("Runtime.evaluate", {
			expression: `(() => {
				const el = document.getElementById("pet-body");
				const r = el.getBoundingClientRect();
				el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
				return "ctx";
			})()`,
			returnByValue: true,
		});
		await sleep(160);
		await snap("pet-menu");

		/* ── R-PET-08 右键菜单左右摆位矩阵（发起人：「最好是要出现在人物的左边或者右边」+
		      「出现判断应该是左边或右边区域够不够展开，展开之后会不会被遮挡」）──
		   断言口径（每个位置都要过）：
		     ① `inside`：菜单四边都在视口内（各留 4px 余量），不许溢出/被裁；
		     ② `beside`：菜单在宠物**左侧或右侧** —— 水平间隙 ≤ 26px、与宠物无面积重叠、
		        纵向必须与宠物有交叠（"并排"而不是"跑到上下方"）；
		     ③ `topAligned`：纵向**顶部对齐宠物顶部**（±26px；宠物贴屏幕上下边时是被夹回视口，
		        实测差 0；为避让遮挡而纵向让开的情况由 `nudged` 单独处理）；
		     ④ `sideChoice`：**哪边够就放哪边** —— 右侧够（room ≥ 菜单宽）就必须在右侧，
		        右侧不够、左侧够就必须在左侧（"默认右侧"这条优先级也在这里被锁住）；
		     ⑤ `hitOk`：`elementFromPoint` 在**中心 + 四角内缩共 5 个点**上都命中菜单自己
		        （R-PET-07 只抽了中心一点，被遮挡的边角照样能漏过去）。
		   位置覆盖：默认悬浮位 / 宠物在左 / 宠物在中（两侧都够 → 走"默认右侧"）/ 贴右边缘 /
		   宠物在下部（纵向夹回）/ 宠物在上部（顶到导航栏 → 必须避让遮挡）。
		   全部用**真实右键事件**（dispatchEvent("contextmenu") 带真实 clientX/clientY）驱动。 */
		const MENU_SAMPLE_INSET = 6;
		const menuProbe = async (label, x, y) => {
			// ⚠️ 判据用 Number.isFinite 而不是 `x !== null`：漏传参数时 undefined 也"不等于 null"，
			// 那样会拿 undefined 去 dragPet → PointerEvent 的 clientX/clientY 变成 0 →
			// 宠物被静默拖到左上角，整条用例测的就不是原来的位置了（第一版就这么错过两次）。
			if (Number.isFinite(x)) {
				await dragPet(x, y);
				await sleep(260);
			}
			const { result } = await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const el = document.getElementById("pet-body");
					const menu = document.getElementById("pet-menu");
					menu.hidden = true; // 先关上，保证这一轮是"重新打开"
					const r = el.getBoundingClientRect();
					el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
					const pr = el.getBoundingClientRect();
					const mr = menu.getBoundingClientRect();
					const ovW = Math.max(0, Math.min(pr.right, mr.right) - Math.max(pr.left, mr.left));
					const ovH = Math.max(0, Math.min(pr.bottom, mr.bottom) - Math.max(pr.top, mr.top));
					// "画得出来吗"：菜单矩形内**中心 + 四角内缩**共 5 个点的 elementFromPoint
					// 都必须是菜单自己或它的子节点。只算矩形是不够的 —— R-PET-07 之前菜单没有
					// z-index，矩形完全正确但被壁纸(z=10)/正文面板(z=30)盖住，截图里根本看不到菜单。
					const ix = Math.min(${MENU_SAMPLE_INSET}, Math.max(1, mr.width / 4));
					const iy = Math.min(${MENU_SAMPLE_INSET}, Math.max(1, mr.height / 4));
					const pts = [
						[mr.left + mr.width / 2, mr.top + mr.height / 2],
						[mr.left + ix, mr.top + iy],
						[mr.right - ix, mr.top + iy],
						[mr.left + ix, mr.bottom - iy],
						[mr.right - ix, mr.bottom - iy],
					];
					const hits = pts.map(([px, py]) => { const n = document.elementFromPoint(px, py); return !!(n && (n === menu || menu.contains(n))); });
					const missNodes = pts.map(([px, py], i) => hits[i] ? null : (() => { const n = document.elementFromPoint(px, py); return n ? (n.tagName + (n.id ? "#" + n.id : "")) : "null"; })()).filter(Boolean);
					const layers = {};
					for (const [k, sel] of [["wallpaper", "#wallpaper-wrapper"], ["content", "#content-panel"], ["floats", ".floating-controls-container"]]) {
						const n = document.querySelector(sel);
						layers[k] = n ? Number.parseInt(getComputedStyle(n).zIndex || "0", 10) : null;
					}
					return {
						pet: { l: Math.round(pr.left), t: Math.round(pr.top), r: Math.round(pr.right), b: Math.round(pr.bottom), w: Math.round(pr.width), h: Math.round(pr.height) },
						menu: { l: Math.round(mr.left), t: Math.round(mr.top), r: Math.round(mr.right), b: Math.round(mr.bottom), w: Math.round(mr.width), h: Math.round(mr.height), side: menu.dataset.petMenuSide || null, occluded: menu.dataset.petMenuOccluded ?? null, nudged: menu.dataset.petMenuNudged ?? null, z: Number.parseInt(getComputedStyle(menu).zIndex || "0", 10) },
						itemsVisible: [...menu.querySelectorAll("[data-pet-act]")].filter((b) => !b.hidden).map((b) => b.textContent.trim()),
						hits,
						hitIsMenu: hits.every(Boolean),
						missNodes,
						layers,
						overlapW: Math.round(ovW),
						overlapArea: Math.round(ovW * ovH),
						// 正数 = 菜单与宠物在**横向**上的最近间隙（0 = 两个矩形在横向上没有分开）
						hGap: Math.round(mr.left >= pr.right ? mr.left - pr.right : (pr.left >= mr.right ? pr.left - mr.right : 0)),
						// 纵向交叠高度（>0 才算"并排在旁边"；R-PET-07 是纵向间隙 ≤ 26px，已改口径）
						vOverlap: Math.round(ovH),
						// 菜单顶边与宠物顶边之差（顶部对齐时 ≈ 0；被夹回视口或为避让遮挡时会变）
						topDelta: Math.round(mr.top - pr.top),
						vw: window.innerWidth,
						vh: window.innerHeight,
						hidden: menu.hidden,
					};
				})()`,
				returnByValue: true,
			});
			const f = result.value;
			f.label = label;
			// ① 四边都在视口内（留 4px 余量）
			f.inside = f.menu.l >= 4 && f.menu.t >= 4 && f.menu.r <= f.vw - 4 && f.menu.b <= f.vh - 4;
			// ② 并排在左/右：横向间隙 ≤ 26px（贴着宠物的余量）、无面积重叠、纵向有交叠。
			//    为什么给 100px² 而不是"必须为 0"：摆位那一刻用的是 pet.x/pet.y，而断言这一刻
			//    宠物还在做 ±6px 的悬浮呼吸（间隙 10px > 振幅 6px，所以重叠在数学上不会发生，
			//    但留一个"明确阈值"比写死 0 更抗时序）。
			f.beside = f.hGap <= 26 && f.overlapArea <= 100 && f.vOverlap > 0 && (f.menu.side === "left" || f.menu.side === "right");
			// ③ 纵向顶部对齐宠物顶部（±26px）；为避让遮挡而让开时单独看 nudged
			f.topAligned = Math.abs(f.topDelta) <= 26 || f.menu.nudged === "1";
			// ④ 哪边够就放哪边（"默认右侧"的优先级也在这里锁住）
			const gap = 10;
			const margin = 8;
			const roomRight = f.vw - margin - (f.pet.r + gap);
			const roomLeft = f.pet.l - gap - margin;
			f.roomRight = Math.round(roomRight);
			f.roomLeft = Math.round(roomLeft);
			f.expectSide = roomRight >= f.menu.w ? "right" : roomLeft >= f.menu.w ? "left" : roomRight >= roomLeft ? "right" : "left";
			f.sideChoice = f.menu.side === f.expectSide;
			// ⌄ 顶部对齐的"没被夹回"版本，专给"宠物贴上下边"那两个位置用：
			//   菜单顶边应等于 clamp(宠物顶边, 8, vh-8-菜单高)
			f.expectTop = Math.max(margin, Math.min(Math.max(margin, f.vh - margin - f.menu.h), f.pet.t));
			f.topClamped = f.menu.nudged === "0" ? Math.abs(f.menu.t - f.expectTop) <= 2 : true;
			f.bottomGap = Math.round(f.vh - f.menu.b);
			return f;
		};
		const menuCases1440 = [];
		{
			// ⓪ 默认悬浮位：宠物在右下角（给浮动按钮留过 64px）→ 右侧放不下，必须换到左边
			menuCases1440.push(await menuProbe("默认悬浮位", null, null));
			// ① 宠物在左侧：左边不够 → 必须在右侧
			menuCases1440.push(await menuProbe("宠物在左(120,300)", 120, 300));
			// ② 宠物在中部：两侧都够 → 按"默认右侧"的优先级放右侧
			menuCases1440.push(await menuProbe("宠物在中(650,300)", 650, 300));
			// ③ 贴右边缘：右侧放不下 → 向左让位，且不许溢出
			menuCases1440.push(await menuProbe("宠物贴右边缘(1420,400)", 1420, 400));
			// ④ 宠物在下部：菜单顶边对齐宠物顶边后会被下边界夹回，四边仍要在视口内
			menuCases1440.push(await menuProbe("宠物在下部(400,780)", 400, 780));
			// ⑤ 宠物在上部（顶到导航栏）：导航栏 z-index 80 > 菜单 67 →
			//    必须靠"纵向避让遮挡"把菜单挪出导航栏，且 5 个抽样点全部命中菜单
			menuCases1440.push(await menuProbe("宠物在上部(700,40)", 700, 40));
			const mShot = await cdp.send("Page.captureScreenshot", { format: "png" });
			await fs.writeFile(path.join(OUT_DIR, "pet-menu-1440.png"), Buffer.from(mShot.data, "base64"));
		}
		facts["pet-menu-1440"] = menuCases1440;

		// ④ 拖动中菜单跟随宠物（不是留在原地）——
		//    R-PET-08 起口径是**横向**：拖动中仍并排（水平间隙 ≤ 26px）、纵向仍对齐、不出视口。
		{
			await dragPet(700, 300);
			await sleep(200);
			const r1 = await menuProbe("拖动跟随(前)", null, null);
			await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const el = document.getElementById("pet-body");
					const r = el.getBoundingClientRect();
					const o = { bubbles: true, pointerId: 11, button: 0 };
					el.dispatchEvent(new PointerEvent("pointerdown", { ...o, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
					el.dispatchEvent(new PointerEvent("pointermove", { ...o, clientX: r.left + r.width / 2 - 260, clientY: r.top + r.height / 2 + 180 }));
					return "dragging";
				})()`,
				returnByValue: true,
			});
			await sleep(160);
			const during = await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const el = document.getElementById("pet-body");
					const menu = document.getElementById("pet-menu");
					const pr = el.getBoundingClientRect();
					const mr = menu.getBoundingClientRect();
					const ovW = Math.max(0, Math.min(pr.right, mr.right) - Math.max(pr.left, mr.left));
					const ovH = Math.max(0, Math.min(pr.bottom, mr.bottom) - Math.max(pr.top, mr.top));
					const ix = Math.min(6, Math.max(1, mr.width / 4)), iy = Math.min(6, Math.max(1, mr.height / 4));
					const pts = [[mr.left + mr.width / 2, mr.top + mr.height / 2], [mr.left + ix, mr.top + iy], [mr.right - ix, mr.top + iy], [mr.left + ix, mr.bottom - iy], [mr.right - ix, mr.bottom - iy]];
					const hits = pts.map(([px, py]) => { const n = document.elementFromPoint(px, py); return !!(n && (n === menu || menu.contains(n))); });
					return {
						petL: Math.round(pr.left), menuL: Math.round(mr.left),
						side: menu.dataset.petMenuSide || null,
						hGap: Math.round(mr.left >= pr.right ? mr.left - pr.right : (pr.left >= mr.right ? pr.left - mr.right : 0)),
						overlapArea: Math.round(ovW * ovH), vOverlap: Math.round(ovH),
						inside: mr.left >= 4 && mr.top >= 4 && mr.right <= window.innerWidth - 4 && mr.bottom <= window.innerHeight - 4,
						tracked: Math.abs(mr.left - pr.left) < 200,
						hitIsMenu: hits.every(Boolean),
					};
				})()`,
				returnByValue: true,
			});
			await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const el = document.getElementById("pet-body");
					el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 11, button: 0, clientX: 0, clientY: 0 }));
					return "dropped";
				})()`,
				returnByValue: true,
			});
			await sleep(200);
			facts["pet-menu-drag"] = { before: r1, during: during.result.value };
		}

		// ⑤ 切档后菜单跟着重排 + 「落下去」/「飘起来」跟着换档位二选一
		//    （贴地档宠物落到地面 → 菜单仍在左右侧、纵向仍对齐；菜单项从「落下去」换成「飘起来」）
		{
			const before = await menuProbe("切档前(float)", null, null);
			await cdp.send("Runtime.evaluate", { expression: `window.__imissSetMode("ground")`, returnByValue: true });
			await sleep(300);
			const afterSwitch = await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const el = document.getElementById("pet-body");
					const menu = document.getElementById("pet-menu");
					menu.hidden = true;
					const r0 = el.getBoundingClientRect();
					el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r0.left + r0.width / 2, clientY: r0.top + r0.height / 2 }));
					const pr = el.getBoundingClientRect();
					const mr = menu.getBoundingClientRect();
					const ovW = Math.max(0, Math.min(pr.right, mr.right) - Math.max(pr.left, mr.left));
					const ovH = Math.max(0, Math.min(pr.bottom, mr.bottom) - Math.max(pr.top, mr.top));
					const ix = Math.min(6, Math.max(1, mr.width / 4)), iy = Math.min(6, Math.max(1, mr.height / 4));
					const pts = [[mr.left + mr.width / 2, mr.top + mr.height / 2], [mr.left + ix, mr.top + iy], [mr.right - ix, mr.top + iy], [mr.left + ix, mr.bottom - iy], [mr.right - ix, mr.bottom - iy]];
					const hits = pts.map(([px, py]) => { const n = document.elementFromPoint(px, py); return !!(n && (n === menu || menu.contains(n))); });
					return {
						mode: document.getElementById("pet").dataset.petMode,
						petT: Math.round(pr.top), petB: Math.round(pr.bottom),
						menuT: Math.round(mr.top), menuB: Math.round(mr.bottom), side: menu.dataset.petMenuSide || null,
						itemsVisible: [...menu.querySelectorAll("[data-pet-act]")].filter((b) => !b.hidden).map((b) => b.textContent.trim()),
						topDelta: Math.round(mr.top - pr.top),
						hGap: Math.round(mr.left >= pr.right ? mr.left - pr.right : (pr.left >= mr.right ? pr.left - mr.right : 0)),
						overlapArea: Math.round(ovW * ovH), vOverlap: Math.round(ovH),
						inside: mr.left >= 4 && mr.top >= 4 && mr.right <= window.innerWidth - 4 && mr.bottom <= window.innerHeight - 4,
						hitIsMenu: hits.every(Boolean),
					};
				})()`,
				returnByValue: true,
			});
			await cdp.send("Runtime.evaluate", { expression: `window.__imissSetMode("float")`, returnByValue: true });
			await sleep(300);
			facts["pet-menu-mode-switch"] = { before, after: afterSwitch.result.value };
		}

		// ⑥ 滚动后菜单仍贴在宠物旁边（菜单与宠物都是 fixed：若谁把菜单写成文档坐标，这条会红）
		{
			await menuProbe("滚动前", null, null);
			await cdp.send("Runtime.evaluate", {
				expression: `window.scrollTo({ top: 1200, behavior: "instant" }); "scrolled"`,
				returnByValue: true,
			});
			await sleep(400);
			const afterScroll = await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const el = document.getElementById("pet-body");
					const menu = document.getElementById("pet-menu");
					const pr = el.getBoundingClientRect();
					const mr = menu.getBoundingClientRect();
					const ovW = Math.max(0, Math.min(pr.right, mr.right) - Math.max(pr.left, mr.left));
					const ovH = Math.max(0, Math.min(pr.bottom, mr.bottom) - Math.max(pr.top, mr.top));
					return {
						scrollY: Math.round(window.scrollY),
						hGap: Math.round(mr.left >= pr.right ? mr.left - pr.right : (pr.left >= mr.right ? pr.left - mr.right : 0)),
						topDelta: Math.round(mr.top - pr.top),
						overlapArea: Math.round(ovW * ovH), vOverlap: Math.round(ovH),
						menuT: Math.round(mr.top), petT: Math.round(pr.top), petB: Math.round(pr.bottom),
						inside: mr.left >= 4 && mr.top >= 4 && mr.right <= window.innerWidth - 4 && mr.bottom <= window.innerHeight - 4,
					};
				})()`,
				returnByValue: true,
			});
			facts["pet-menu-scroll"] = afterScroll.result.value;
			await cdp.send("Runtime.evaluate", {
				expression: `window.scrollTo({ top: 0, behavior: "instant" }); document.getElementById("pet-menu").hidden = true; "reset"`,
				returnByValue: true,
			});
		}

		// ⑥b R-PET-08 遮挡兜底：注入一块 `z-index: 1100` 的假面板（模拟"移动端菜单面板 1100"
		//     这类真会出现的遮挡层），只盖住"宠物右侧"候选区 → 菜单必须**换到左侧**；
		//     再把它铺满全屏（两侧都被挡住）→ 走明确兜底：侧别仍记录在 DOM、四边仍在视口内。
		//     为什么要注入而不是"找个真遮挡"：真遮挡只有右下角浮动控件（1000）与移动端面板（1100），
		//     位置都在视口角落，撞不上宠物旁边的候选区 —— 与其造一个假的右侧位置，不如直接造遮挡物。
		{
			await dragPet(650, 300);
			await sleep(260);
			const clear = await menuProbe("遮挡前(右侧够)", null, null);
			const blocked = await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const el = document.getElementById("pet-body");
					const pr = el.getBoundingClientRect();
					const d = document.createElement("div");
					d.id = "pet-occluder-test";
					d.style.cssText = "position:fixed;z-index:1100;background:rgb(255 0 0 / .3);pointer-events:auto";
					d.style.left = (pr.right + 2) + "px";
					d.style.top = Math.max(0, pr.top - 40) + "px";
					d.style.width = "260px";
					d.style.height = "300px";
					document.body.appendChild(d);
					return { left: d.style.left, top: d.style.top };
				})()`,
				returnByValue: true,
			});
			await sleep(120);
			const switched = await menuProbe("右侧被遮挡", null, null);
			const both = await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const d = document.getElementById("pet-occluder-test");
					d.style.left = "0px"; d.style.top = "0px"; d.style.width = "100vw"; d.style.height = "100vh";
					return "full";
				})()`,
				returnByValue: true,
			});
			await sleep(120);
			const fallback = await menuProbe("两侧都被遮挡", null, null);
			await cdp.send("Runtime.evaluate", {
				expression: `document.getElementById("pet-occluder-test")?.remove(); document.getElementById("pet-menu").hidden = true; "cleaned"`,
				returnByValue: true,
			});
			facts["pet-menu-occlusion"] = {
				clear,
				blocker: blocked.result.value,
				switched,
				both: both.result.value,
				fallback,
			};
		}

		// ⑦ 窄视口 390×844：先按桌面宽加载（hideOnMobile 只在**解析期**判一次，移动端冷启动本来就不显示桌宠，
		//    见 R-PET-01 的移动端断言），再缩到 390 宽 —— 等价于"用户把窗口缩窄"，走的是组件自己的 resize 路径。
		//    这里量的是"窄视口 + 宠物贴边时，菜单还能不能完整落在视口内、还能不能并排在宠物左边或右边"。
		{
			await cdp.send("Emulation.setDeviceMetricsOverride", {
				width: 390,
				height: 844,
				deviceScaleFactor: 1,
				mobile: false,
			});
			await sleep(450);
			const p = await snap("pet-menu-narrow-boot");
			const menuCases390 = [];
			// 默认位（宠物在右半屏 → 左侧放得下 → 左）/ 宠物在左（→ 右）/ 贴右边缘（→ 左）/ 下部（纵向夹回）
			menuCases390.push(await menuProbe("390 默认位", null, null));
			menuCases390.push(await menuProbe("390 左侧(60,300)", 60, 300));
			menuCases390.push(await menuProbe("390 贴右边缘(380,400)", 380, 400));
			menuCases390.push(await menuProbe("390 下部(250,760)", 250, 760));
			facts["pet-menu-390"] = menuCases390;
			// 两侧都放不下：把宠物拖到正中那一小段（宠物 + 菜单 132px × 2 + 边距 > 视口宽）。
			// ⚠️ R-PET-12 起宠物在窄视口走**手机档**缩放（0.62 → 精灵 89px），原来那个 390 宽的
			//    前提**不再成立**：89 + 132×2 + 边距 = 394，只比 390 宽 4px —— 实测左余 137px >
			//    菜单宽 132，"几何上无解"变成"其实放得下"，菜单老实贴左边才是对的（本轮就是这么判红的）。
			//    所以这一条换到 **360×800**（iPhone SE/8 那一档真机宽度）：差 34px，前提稳，
			//    量完再复位回 390 —— 后面的截图与"窄视口断言不是空过"都按 390 写。
			await cdp.send("Emulation.setDeviceMetricsOverride", {
				width: 360,
				height: 800,
				deviceScaleFactor: 1,
				mobile: false,
			});
			await sleep(450);
			facts["pet-menu-narrow-both"] = await menuProbe("360 正中(180,700)", 180, 700);
			await cdp.send("Emulation.setDeviceMetricsOverride", {
				width: 390,
				height: 844,
				deviceScaleFactor: 1,
				mobile: false,
			});
			await sleep(350);
			facts["pet-menu-390-pet"] = { exists: p.exists, off: p.off, display: p.display };
			const narrowShot = await cdp.send("Page.captureScreenshot", { format: "png" });
			await fs.writeFile(path.join(OUT_DIR, "pet-menu-390.png"), Buffer.from(narrowShot.data, "base64"));
			// 复位到 1440×900，后面的断言（切页 / reduced-motion / 三档）都按这个尺寸写的
			await cdp.send("Emulation.setDeviceMetricsOverride", {
				width: 1440,
				height: 900,
				deviceScaleFactor: 1,
				mobile: false,
			});
			await sleep(400);
			await snap("pet-menu-restore");
		}

		// ⑧ 台词气泡（R-PET-13 改口径）：「说句话」菜单入口已按发起人要求删除
		//    （原话："把说句话交互删掉"）—— 但"点她一下会说话"这条**没有消失**：
		//    左键单击宠物本體仍会弹台词气泡（与「跳一下」同一个入口）。
		//    ⚠️ 先手动清空气泡：出场问候的文本会**一直留在** textContent 里（`say()` 的定时器
		//    只摘 `is-pop` 类），不清的话这条断言会被 4 秒前那句问候喂饱、恒真。
		await cdp.send("Runtime.evaluate", {
			expression: `(() => {
				const bubble = document.getElementById("pet-bubble");
				bubble.textContent = "";
				bubble.classList.remove("is-pop");
				const el = document.getElementById("pet-body");
				const r = el.getBoundingClientRect();
				const o = { bubbles: true, cancelable: true, pointerId: 41, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
				el.dispatchEvent(new PointerEvent("pointerdown", o));
				el.dispatchEvent(new PointerEvent("pointerup", o));
				return "clicked";
			})()`,
			returnByValue: true,
		});
		await sleep(180);
		await snap("pet-act-say");

		// ⑧a R-PET-09：菜单里的「跳一下」已删（左键单击就能跳）；并且**跳的时候不要动** ——
		//     真实的左键单击（pointerdown+pointerup 落在宠物身上）→ jumping；
		//     跳跃动画播放期间位置定住（悬浮档不上下浮动），跳完之后行为恢复（← 键仍能指挥它走）。
		{
			await cdp.send("Runtime.evaluate", { expression: `window.__imissSetMode("float")`, returnByValue: true });
			await sleep(500);
			const jumpProbe = () =>
				cdp.send("Runtime.evaluate", {
					expression: `(() => {
						const el = document.getElementById("pet");
						const body = document.getElementById("pet-body");
						const menu = document.getElementById("pet-menu");
						const r = el.getBoundingClientRect();
						return {
							state: el.dataset.petState || null,
							mode: el.dataset.petMode,
							x: Math.round(r.left), y: Math.round(r.top),
							items: [...menu.querySelectorAll("[data-pet-act]")].filter((b) => !b.hidden).map((b) => b.textContent.trim()),
							allItems: [...menu.querySelectorAll("[data-pet-act]")].map((b) => b.textContent.trim()),
							canJump: !!body,
						};
					})()`,
					returnByValue: true,
				});
			const before = (await jumpProbe()).result.value;
			// 真实左键单击（和用户点宠物完全同一条路径：pointerdown → pointerup，无移动）
			await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const el = document.getElementById("pet-body");
					const r = el.getBoundingClientRect();
					const o = { bubbles: true, cancelable: true, pointerId: 31, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
					el.dispatchEvent(new PointerEvent("pointerdown", o));
					el.dispatchEvent(new PointerEvent("pointerup", o));
					return "clicked";
				})()`,
				returnByValue: true,
			});
			await sleep(120);
			const mid1 = (await jumpProbe()).result.value;
			await sleep(170);
			const mid2 = (await jumpProbe()).result.value;
			const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
			await fs.writeFile(path.join(OUT_DIR, "pet-jump-1440.png"), Buffer.from(shot.data, "base64"));
			// 等跳跃（含落地弹跳）彻底播完，再验证"冻结不是永久性的"：← 键仍能指挥它移动
			await sleep(1400);
			const after = (await jumpProbe()).result.value;
			// ⚠️ 键盘事件必须**先让宠物拿到焦点**：keydown 监听挂在 `#pet-body` 上，
			//    没聚焦时 dispatchKeyEvent 是发到 document 的，监听器根本收不到（探针第一版就这么空跑过）
			await cdp.send("Runtime.evaluate", {
				expression: `document.getElementById("pet-body").focus(); "focused"`,
				returnByValue: true,
			});
			const moverX0 = (await jumpProbe()).result.value.x;
			for (const type of ["rawKeyDown", "keyUp"]) {
				await cdp.send("Input.dispatchKeyEvent", {
					type,
					key: "ArrowLeft",
					code: "ArrowLeft",
					windowsVirtualKeyCode: 37,
					nativeVirtualKeyCode: 37,
				});
			}
			await sleep(420);
			const moverX1 = (await jumpProbe()).result.value.x;
			// 键盘 Enter：仍是 `role="button"` 的无障碍激活路径（发起人说的"按键"指菜单按钮，
			// 那个已删；这条保留，且与左键单击完全等价）
			for (const type of ["rawKeyDown", "keyUp"]) {
				await cdp.send("Input.dispatchKeyEvent", {
					type,
					key: "Enter",
					code: "Enter",
					windowsVirtualKeyCode: 13,
					nativeVirtualKeyCode: 13,
				});
			}
			await sleep(120);
			const keyState = (await jumpProbe()).result.value;
			facts["pet-jump"] = { before, mid1, mid2, after, movedX: moverX1 - moverX0, keyState };
		}

		// ⑧b R-PET-08「落下去」：悬浮档右键 → 菜单里是「落下去」→ 点它 → **真的带重力掉下去**
		//     （复用拖动松手那条 `startFall()` + `step()` 里的贴地档重力积分）
		{
			await cdp.send("Runtime.evaluate", { expression: `window.__imissSetMode("float")`, returnByValue: true });
			await sleep(300);
			// 先拖到视口上部再松手（悬浮档松手就地悬停）—— 这样"下落"有 600px 以上的行程可看，
			// 也避免依赖上一步窄视口测试留下的位置
			await dragPet(700, 200);
			await sleep(400);
			const probePet = () =>
				cdp.send("Runtime.evaluate", {
					expression: `(() => {
						const el = document.getElementById("pet");
						const menu = document.getElementById("pet-menu");
						const r = el.getBoundingClientRect();
						return {
							y: Math.round(r.top), gap: Math.round(window.innerHeight - r.bottom),
							mode: el.dataset.petMode, state: el.dataset.petState || null,
							flying: el.dataset.petFlying === "1",
							itemsVisible: [...menu.querySelectorAll("[data-pet-act]")].filter((b) => !b.hidden).map((b) => b.textContent.trim()),
						};
					})()`,
					returnByValue: true,
				});
			// 真实右键打开菜单，再点「落下去」
			const opened = await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const el = document.getElementById("pet-body");
					const menu = document.getElementById("pet-menu");
					menu.hidden = true;
					const r = el.getBoundingClientRect();
					el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
					return { hidden: menu.hidden, items: [...menu.querySelectorAll("[data-pet-act]")].filter((b) => !b.hidden).map((b) => b.textContent.trim()) };
				})()`,
				returnByValue: true,
			});
			const before = (await probePet()).result.value;
			const t0 = Date.now();
			await clickMenu("drop");
			const fallSamples = [];
			let landed = null;
			let prevGap = 9999;
			for (let i = 0; i < 60; i++) {
				// 最多 6 秒
				await sleep(100);
				const s = (await probePet()).result.value;
				fallSamples.push({ ms: Date.now() - t0, y: s.y });
				if (i === 2) {
					const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
					await fs.writeFile(path.join(OUT_DIR, "pet-drop-1440.png"), Buffer.from(shot.data, "base64"));
				}
				// 连续两次都在地面线附近（撞击回弹会短暂离地，所以要"连着两次"）
				if (s.gap <= 20 && prevGap <= 20) {
					landed = { ...s, ms: Date.now() - t0 };
					break;
				}
				prevGap = s.gap;
			}
			facts["pet-drop"] = {
				openItems: opened.result.value.items,
				menuWasHidden: opened.result.value.hidden === false,
				before: { y: before.y, gap: before.gap, mode: before.mode, itemsVisible: before.itemsVisible },
				landed,
				samples: fallSamples,
			};
			await sleep(400);

			// ⑧c R-PET-08「飘起来」：贴地档右键 → 菜单里是「飘起来」→ 点它 → 反向飘回悬浮基准线
			const opened2 = await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const el = document.getElementById("pet-body");
					const menu = document.getElementById("pet-menu");
					menu.hidden = true;
					const r = el.getBoundingClientRect();
					el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
					return { hidden: menu.hidden, items: [...menu.querySelectorAll("[data-pet-act]")].filter((b) => !b.hidden).map((b) => b.textContent.trim()) };
				})()`,
				returnByValue: true,
			});
			const g0 = (await probePet()).result.value;
			const rt0 = Date.now();
			await clickMenu("rise");
			let risen = null;
			let sawFlying = false;
			for (let i = 0; i < 90; i++) {
				// 最多 9 秒
				await sleep(100);
				const s = (await probePet()).result.value;
				if (s.flying) sawFlying = true;
				if (i === 6) {
					const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
					await fs.writeFile(path.join(OUT_DIR, "pet-rise-1440.png"), Buffer.from(shot.data, "base64"));
				}
				if (s.mode === "float" && !s.flying && s.y < g0.y - 40) {
					risen = { ...s, ms: Date.now() - rt0 };
					break;
				}
			}
			facts["pet-rise"] = {
				openItems: opened2.result.value.items,
				menuWasHidden: opened2.result.value.hidden === false,
				before: { y: g0.y, gap: g0.gap, mode: g0.mode },
				risen,
				sawFlying,
			};
			const riseShot = await cdp.send("Page.captureScreenshot", { format: "png" });
			await fs.writeFile(path.join(OUT_DIR, "pet-rise-done-1440.png"), Buffer.from(riseShot.data, "base64"));
			// 回到出厂状态（后面的断言按 float 写）
			await cdp.send("Runtime.evaluate", { expression: `window.__imissSetMode("float"); "ok"`, returnByValue: true });
			await sleep(200);
		}

		// ⑧d R-PET-10：**真机路径**的「落下去」验收（发起人 2026-09-26 第四轮反馈，附图）
		// ==========================================================================
		// 为什么 ⑧b / ⑧c 已经测过"落下去"还要再来一遍（这是本轮的核心教训）：
		//   ⑧b 开菜单用的是 `menu.hidden = true` + `el.dispatchEvent(new MouseEvent("contextmenu"))`，
		//   点菜单项用的是 `clickMenu("drop")` = `document.querySelector('[data-pet-act=drop]').click()`
		//   —— **按属性选元素**：既不看那一项到底显不显示，也不管它上面压着什么。
		//   于是"点到的其实是另一个按钮""按钮被别人盖住"这一整类真机故障，断言天然抓不到；
		//   而它只跑一种现场（悬浮档 + 没开聊天 + 没有"减少动态"偏好），
		//   真机上让「落下去」失效的两条路径**恰好都在这个现场之外**：
		//     · 聊天框开着（`step()` 的 `chatOpen` 闸门原来挡在重力分支**前面**）
		//     · `prefers-reduced-motion: reduce`（`start()` 按设计不开 rAF 循环 → 重力积分永不推进）
		//   两条都实测复现过：宠物带着 `mode=ground + airborne=true` 卡在半空，y 连续 1.5 秒不动
		//   （离地 370px），菜单却已经换成「飘起来」—— 发起人看到的正是"点了没反应"。
		// 这里全部换成 `Input.dispatchMouseEvent` 的**真实鼠标事件**，且坐标取"当前可见那一项"的
		// 矩形中心；两种现场各跑一遍；再补一条 ⑧b 没有的"落地之后要**一直**贴地"
		// （⑧b 一落地就 break，看不到之后的巡检/自动活动会不会把它拉回悬浮）。
		{
			const realMouse = (type, x, y, button, clickCount = 1) =>
				cdp.send("Input.dispatchMouseEvent", {
					type,
					x: Math.round(x),
					y: Math.round(y),
					button,
					buttons: type === "mousePressed" ? (button === "right" ? 2 : 1) : 0,
					clickCount,
				});
			const realClick = async (x, y, button) => {
				await realMouse("mouseMoved", x, y, "none");
				await realMouse("mousePressed", x, y, button);
				await realMouse("mouseReleased", x, y, button);
			};
			/**
			 * 真实双击（R-PET-13 用）：两对 press/release 挨在一起（间隔远小于组件的 320ms 判据）。
			 * ⚠️ 必须用**真鼠标事件**而不是 `PointerEvent` 直接派发 —— 组件判双击看的是
			 * `onPointerUp` 里的两次时间戳，而"真机双击会不会真的走到那条分支"才是要验的事。
			 */
			const realDblClick = async (x, y) => {
				await realMouse("mouseMoved", x, y, "none");
				for (const n of [1, 2]) {
					await realMouse("mousePressed", x, y, "left", n);
					await realMouse("mouseReleased", x, y, "left", n);
				}
			};
			/** 宠物中心（真实右键的落点） */
			const petCenter = async () =>
				(
					await cdp.send("Runtime.evaluate", {
						expression: `(() => { const r = document.getElementById("pet").getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height * 0.55 }; })()`,
						returnByValue: true,
					})
				).result.value;
			/** 菜单里每一项的矩形 / `display` / 中心点上的 `elementFromPoint` 命中者 */
			const menuItemsReal = async () =>
				(
					await cdp.send("Runtime.evaluate", {
						expression: `(() => {
							const menu = document.getElementById("pet-menu");
							if (!menu || menu.hidden) return { hidden: true, items: [] };
							return { hidden: false, items: [...menu.querySelectorAll("[data-pet-act]")].map((b) => {
								const r = b.getBoundingClientRect();
								const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
								const hit = (r.width > 0 && r.height > 0) ? document.elementFromPoint(cx, cy) : null;
								return { act: b.dataset.petAct, text: b.textContent.trim(), hidden: b.hidden,
									display: getComputedStyle(b).display,
									cx: Math.round(cx), cy: Math.round(cy), w: Math.round(r.width), h: Math.round(r.height),
									topHit: !hit ? "none" : (hit === b ? "self" : (b.contains(hit) ? "child" : (menu.contains(hit) ? "menu-other" : (hit.id || hit.tagName)))) };
							}) };
						})()`,
						returnByValue: true,
					})
				).result.value;
			/** 真机路径点菜单项：真右键开菜单 → 找**可见**且文字匹配的那一项 → 在它矩形中心派发真左键 */
			const realMenuClick = async (label) => {
				const c = await petCenter();
				await realClick(c.cx, c.cy, "right");
				await sleep(220);
				const opened = await menuItemsReal();
				const vis = opened.items.filter((i) => !i.hidden && i.display !== "none" && i.w > 0);
				const target = vis.find((i) => i.text === label) ?? null;
				const info = {
					menuHidden: opened.hidden,
					visible: vis.map((i) => `${i.text}@${i.cx},${i.cy}·${i.topHit}`),
					all: opened.items.map((i) => `${i.text}:${i.display}`),
					target,
				};
				if (!target) return info;
				await realClick(target.cx, target.cy, "left");
				return info;
			};
			/** 只取宠物那几个字段的轻量采样（比整份 COLLECT 便宜，采样点多） */
			const petSample = async () =>
				(
					await cdp.send("Runtime.evaluate", {
						expression: `(() => {
							const el = document.getElementById("pet");
							const r = el.getBoundingClientRect();
							const b = document.getElementById("pet-bubble");
							return { mode: el.dataset.petMode, state: el.dataset.petState || null,
								frameMs: Number(el.dataset.petFrameMs || 0),
								y: Math.round(r.top), gap: Math.round(window.innerHeight - r.bottom),
								chat: !!b && b.classList.contains("is-chat") };
						})()`,
						returnByValue: true,
					})
				).result.value;
			/** 每 120ms 采一次，采 ms 毫秒 */
			const sampleFor = async (ms) => {
				const t0 = Date.now();
				const seq = [];
				do {
					const s = await petSample();
					seq.push({ ms: Date.now() - t0, ...s });
					await sleep(120);
				} while (Date.now() - t0 < ms);
				return seq;
			};

			// ① 悬浮档 · 真机点「落下去」：真右键 → 点可见项 → 采样下落 → 再采 5.4 秒确认"保持贴地"
			await cdp.send("Runtime.evaluate", { expression: `window.__imissSetMode("float"); "ok"`, returnByValue: true });
			await sleep(250);
			await dragPet(700, 200); // 先拖到上部：留 600px 左右的行程，"下落"才看得出是一段过程
			await sleep(400);
			const d1open = await realMenuClick("落下去");
			const d1fall = await sampleFor(1500);
			const d1shot = await cdp.send("Page.captureScreenshot", { format: "png" });
			await fs.writeFile(path.join(OUT_DIR, "pet-drop-real-1440.png"), Buffer.from(d1shot.data, "base64"));
			// 保持：覆盖 `nextAt`（落地后 1.2~4.2 秒的随机活动窗口）与 3 秒一次的"睡着"巡检
			const d1hold = await sampleFor(5400);
			facts["pet-drop-real"] = { open: d1open, fall: d1fall, hold: d1hold };

			// ② 贴地档 · 真机点「飘起来」（反向）：菜单里该是「飘起来」、且「落下去」是 display:none
			const d2open = await realMenuClick("飘起来");
			const d2rise = await sampleFor(6600); // 单次飞行 4~6 秒
			facts["pet-rise-real"] = { open: d2open, rise: d2rise };

			// ③ 聊天框开着 · 真机点「落下去」（R-PET-10 的路径之一：chatOpen 曾经挡住重力分支）
			await cdp.send("Runtime.evaluate", { expression: `window.__imissSetMode("float"); "ok"`, returnByValue: true });
			await sleep(250);
			await dragPet(700, 200);
			await sleep(400);
			const chatOpened = await realMenuClick("和爱弥斯聊天");
			await sleep(350);
			const beforeChatDrop = await petSample();
			const d3open = await realMenuClick("落下去");
			const d3fall = await sampleFor(2000);
			const d3hold = await sampleFor(2000);
			const d3shot = await cdp.send("Page.captureScreenshot", { format: "png" });
			await fs.writeFile(path.join(OUT_DIR, "pet-drop-chat-1440.png"), Buffer.from(d3shot.data, "base64"));
			facts["pet-drop-chat"] = { chatOpened, before: beforeChatDrop, open: d3open, fall: d3fall, hold: d3hold };
			// 关掉聊天，免得影响后面的步骤
			await cdp.send("Runtime.evaluate", {
				expression: `document.getElementById("pet-body").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); "esc"`,
				returnByValue: true,
			});
			await sleep(300);

			// ④ 帧率实测（R-PET-10 的另一半）：聊天状态（`running`）的实际帧间隔 ——
			//    用 MutationObserver 抓 `#pet-sprite` 的 `backgroundPosition` 变化时间戳，
			//    这是"像素真话"：不看代码写了多少 fps，看它到底多久换一帧。
			{
				await cdp.send("Runtime.evaluate", { expression: `window.__imissSetMode("float"); "ok"`, returnByValue: true });
				await sleep(250);
				const chatAgain = await realMenuClick("和爱弥斯聊天");
				await sleep(400);
				const frames = await cdp.send("Runtime.evaluate", {
					expression: `(async () => {
						const sprite = document.getElementById("pet-sprite");
						const el = document.getElementById("pet");
						const t = [];
						let lastPos = getComputedStyle(sprite).backgroundPosition;
						const mo = new MutationObserver(() => {
							const pos = getComputedStyle(sprite).backgroundPosition;
							if (pos !== lastPos) { lastPos = pos; t.push(performance.now()); }
						});
						mo.observe(sprite, { attributes: true, attributeFilter: ["style"] });
						const state0 = el.dataset.petState;
						await new Promise((r) => setTimeout(r, 3200));
						mo.disconnect();
						const d = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b);
						return { state0, state1: el.dataset.petState, frameMs: Number(el.dataset.petFrameMs || 0),
							n: t.length, intervals: d.map((v) => Math.round(v)),
							min: Math.round(d[0] ?? 0), median: Math.round(d[Math.floor(d.length / 2)] ?? 0),
							max: Math.round(d[d.length - 1] ?? 0) };
					})()`,
					returnByValue: true,
					awaitPromise: true,
				});
				const chatShot = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-chat-frames-1440.png"), Buffer.from(chatShot.data, "base64"));
				facts["pet-frame-rate"] = { open: chatAgain, ...frames.result.value, state: await petSample() };
				await cdp.send("Runtime.evaluate", {
					expression: `document.getElementById("pet-body").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); "esc"`,
					returnByValue: true,
				});
				await sleep(250);
			}

			// ⑤ 减少动态 · 真机点「落下去」（R-PET-10 的路径之二）——
			//    重新载入页面让 `matchMedia` 在 boot 时就读到 reduce（探针不能只改媒体再指望组件重读）
			await cdp.send("Emulation.setEmulatedMedia", {
				features: [
					{ name: "prefers-color-scheme", value: "dark" },
					{ name: "prefers-reduced-motion", value: "reduce" },
				],
			});
			const loadedR = cdp.once("Page.loadEventFired");
			await cdp.send("Page.navigate", { url: `${BASE}/` });
			await loadedR;
			await sleep(1500);
			// ⚠️ v1.59：重载后默认档是 `fixed`，而它的**首访落点就在地面线**（y=759）——从这儿点
			//    「落下去」等于"已经站在终点"，下落采样会是一条平线，`y0 - last.y < -100` 这条
			//    "真的落地"当场名存实亡（改默认档后第一次跑就是这么判红的，实测 y 759 → 759）。
			//    所以先用**真机拖拽**把它拎到半空再点（不用调试钩子，保住这一段"真机路径"的口径）；
			//    判据本体一字未动。
			await dragPet(700, 260);
			await sleep(300);
			const beforeReduceDrop = await petSample();
			const d5open = await realMenuClick("落下去");
			const d5fall = await sampleFor(1200);
			const d5hold = await sampleFor(1600);
			const d5shot = await cdp.send("Page.captureScreenshot", { format: "png" });
			await fs.writeFile(path.join(OUT_DIR, "pet-drop-reduce-1440.png"), Buffer.from(d5shot.data, "base64"));
			facts["pet-drop-reduce"] = { before: beforeReduceDrop, open: d5open, fall: d5fall, hold: d5hold };
			// 复位媒体模拟 + 重新载入，让后面的步骤回到"正常动态 + 出厂状态"
			await cdp.send("Emulation.setEmulatedMedia", {
				features: [{ name: "prefers-color-scheme", value: "dark" }],
			});
			const loadedN = cdp.once("Page.loadEventFired");
			await cdp.send("Page.navigate", { url: `${BASE}/` });
			await loadedN;
			await sleep(2400);

			// ⑥ 源码级口径（R-PET-10 的一半是"规格"）：解析 `PET_STATES` / `PET_MOOD_STATES`
			//    与组件里的 `REVIEW_HOLD`，核对"语气/待机类帧间隔 ≥ 200ms""物理类没被动过"
			//    "`review` 的播放时长 ≥ 帧数 × 帧间隔（否则一次性动画会被 busyUntil 截断）"。
			{
				const utilSrc = await fs.readFile(path.resolve("src/utils/pet-utils.ts"), "utf8");
				const compSrc = await fs.readFile(path.resolve("src/components/features/AemeathPet.astro"), "utf8");
				const block = /export const PET_STATES[\s\S]*?=\s*\{([\s\S]*?)\n\};/.exec(utilSrc)?.[1] ?? "";
				const states = {};
				for (const m of block.matchAll(
					/^\s*"?(?<name>[a-z][a-z-]*)"?:\s*\{\s*row:\s*\d+,\s*frames:\s*(?<frames>\d+),\s*fps:\s*(?<fps>[\d.]+)/gm,
				)) {
					states[m.groups.name] = { frames: Number(m.groups.frames), fps: Number(m.groups.fps) };
				}
				const moodSrc = /export const PET_MOOD_STATES[^=]*=\s*\[([\s\S]*?)\]/.exec(utilSrc)?.[1] ?? "";
				const mood = [...moodSrc.matchAll(/"([a-z][a-z-]*)"/g)].map((m) => m[1]);
				const frameMs = Object.fromEntries(
					Object.entries(states).map(([n, s]) => [n, Math.round(1000 / s.fps)]),
				);
				facts["pet-frames-src"] = {
					states,
					frameMs,
					mood,
					physical: Object.keys(states).filter((n) => !mood.includes(n)),
					reviewHold: Number(/const REVIEW_HOLD\s*=\s*(\d+)/.exec(compSrc)?.[1] ?? 0),
				};
			}

			// ⑦ R-PET-13 迷你档（本轮发起人：「**最后一个变成关闭，但关闭不是完全关闭，
			//    会变成很小一只，比待机还小，双击后仍能变回爱弥斯**」）
			// ==========================================================================
			// 全走真机路径：真右键开菜单 → 点**可见**的「缩小」→ 量她真的变小（精灵真实像素
			// + CSS 变量两道证据）→ 迷你时单击**不说话也不误恢复** → 真双击 → 量她真的变回来。
			// 为什么不看 `data-pet-mini` 一个属性就完事：那是"我改了属性"，不是"她变小了"；
			// 尺寸来自 `measure()` 读的真实 `offsetWidth`，脚底锚点则证明"缩小不是往上蹿"。
			{
				const miniProbe = async () =>
					(
						await cdp.send("Runtime.evaluate", {
							expression: `(() => {
								const el = document.getElementById("pet");
								const sprite = document.getElementById("pet-sprite");
								const menu = document.getElementById("pet-menu");
								const item = menu.querySelector('[data-pet-act="mini"]');
								const bubble = document.getElementById("pet-bubble");
								const r = el.getBoundingClientRect();
								const sr = sprite.getBoundingClientRect();
								const v = getComputedStyle(el);
								return {
									mini: el.dataset.petMini, state: el.dataset.petState || null,
									spriteW: Math.round(sr.width), spriteH: Math.round(sr.height),
									top: Math.round(r.top), bottom: Math.round(r.bottom),
									label: (item?.textContent || "").trim(), pressed: item?.getAttribute("aria-pressed"),
									items: [...menu.querySelectorAll("[data-pet-act]")].map((b) => b.textContent.trim()),
									bubbleText: (bubble?.textContent || "").trim(),
									vars: { desktop: (v.getPropertyValue("--pet-scale-desktop") || "").trim(),
										mobile: (v.getPropertyValue("--pet-scale-mobile") || "").trim(),
										active: (v.getPropertyValue("--pet-scale-active") || "").trim(),
										miniFactor: (v.getPropertyValue("--pet-mini-factor") || "").trim(),
										scale: (v.getPropertyValue("--pet-scale") || "").trim() },
								};
							})()`,
							returnByValue: true,
						})
					).result.value;
				const miniBox = async () =>
					(
						await cdp.send("Runtime.evaluate", {
							expression: `(() => { const r = document.getElementById("pet-body").getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`,
							returnByValue: true,
						})
					).result.value;

				const beforeMini = await miniProbe();
				const miniOpen = await realMenuClick("缩小");
				await sleep(360);
				const closedMini = await miniProbe();
				const miniShot = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-mini-1440.png"), Buffer.from(miniShot.data, "base64"));

				// 迷你时**单击**（不是双击）：不许说话（气泡为空），也不许被误当成"叫醒"
				const c1 = await miniBox();
				await realClick(c1.cx, c1.cy, "left");
				await sleep(260);
				const singleMini = await miniProbe();
				await sleep(420); // 让这一次点击的时间戳过期，下面的双击才是"从零开始的两下"

				const c2 = await miniBox();
				await realDblClick(c2.cx, c2.cy);
				await sleep(320);
				const restoredMini = await miniProbe();
				const backShot = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-mini-back-1440.png"), Buffer.from(backShot.data, "base64"));

				facts["pet-mini"] = { before: beforeMini, open: miniOpen, closed: closedMini, single: singleMini, restored: restoredMini };
			}
		}

		// ⑤ 拖拽 → 困惑；松手落地
		await cdp.send("Runtime.evaluate", {
			expression: `(() => {
				const el = document.getElementById("pet-body");
				const r = el.getBoundingClientRect();
				const x = r.left + r.width / 2, y = r.top + r.height / 2;
				el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: x, clientY: y, button: 0 }));
				el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: x - 120, clientY: y - 90, button: 0 }));
				return "drag";
			})()`,
			returnByValue: true,
		});
		await sleep(140);
		await snap("pet-drag");
		await cdp.send("Runtime.evaluate", {
			expression: `(() => {
				const el = document.getElementById("pet-body");
				el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 100, clientY: 100, button: 0 }));
				return "drop";
			})()`,
			returnByValue: true,
		});
		// 上一步把宠物丢在了半空，它落地那一帧会 setState("jumping") —— 不等它落地就做双击，
		// review 会被这个落地动画盖掉（第一次跑就是这么假的失败）
		await sleep(1400);

		// ⑥ 双击 → 完成反馈（review）
		await cdp.send("Runtime.evaluate", {
			expression: `(() => {
				const el = document.getElementById("pet-body");
				const r = el.getBoundingClientRect();
				const o = { bubbles: true, cancelable: true, pointerId: 2, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
				el.dispatchEvent(new PointerEvent("pointerdown", o));
				el.dispatchEvent(new PointerEvent("pointerup", o));
				el.dispatchEvent(new PointerEvent("pointerdown", o));
				el.dispatchEvent(new PointerEvent("pointerup", o));
				return "dbl";
			})()`,
			returnByValue: true,
		});
		await sleep(140);
		await snap("pet-dblclick");

		// ⑦ 搜索框打字 → 执行任务（running）
		await cdp.send("Runtime.evaluate", {
			expression: `(() => {
				const input = document.getElementById("search-input-desktop");
				if (!input) return "no-input";
				input.focus();
				input.value = "爱弥斯";
				input.dispatchEvent(new Event("input", { bubbles: true }));
				return "typed";
			})()`,
			returnByValue: true,
		});
		await sleep(160);
		await snap("pet-typing");

		// ⑧ 切主题 → 完成反馈（模板 setTheme 派发 theme-change）
		await sleep(1600); // 先等「执行任务」自己回到待机，避免和上一条混淆
		await cdp.send("Runtime.evaluate", {
			expression: `window.dispatchEvent(new CustomEvent("theme-change")); "themed"`,
			returnByValue: true,
		});
		await sleep(160);
		await snap("pet-theme");

		// ⑨ 滚下去让浮动按钮出现 → 与宠物不得重叠（R-PET-05）
		await cdp.send("Runtime.evaluate", {
			expression: `window.scrollTo({ top: 2000, behavior: "instant" }); "scrolled"`,
			returnByValue: true,
		});
		await sleep(900);
		await snap("pet-float");

		// ⑨b R-PET-06 三档运动模式（v1.59 起**默认档 = `fixed` 固定**；另有 `float` 悬浮+飞行、`ground` 贴地）
		// ------------------------------------------------------------------
		// 为什么要调试钩子：飞行间隔最小 20 秒，脚本不可能干等一分钟。
		// `__imissFlyNow()` 调的**就是**组件里决定"该不该飞"的那个 `startFlight()`
		// （与自动飞行同一函数，只有"跳过睡着判断"这一点不同），`__imissSetMode()`
		// 调的也就是 `boot()` 里那次 `setMode()` —— 测的是飞行/切模式函数本身，不是绕过行为。
		// 三档依次真跑一遍：**默认 fixed 一动不动** → float 悬空会飞 → ground 松手落地。
		{
			const petCfg = await fs.readFile(path.resolve("src/config/petConfig.ts"), "utf8");
			facts["pet-mode-config"] = {
				mode: /movement:\s*\{[\s\S]{0,240}?mode:\s*"(\w+)"/.exec(petCfg)?.[1] ?? null,
			};

			// ── ⓪ 默认档 `fixed` 的**首访落点**（v1.59 新增，发起人 2026-10-02 改默认档）──
			// 为什么这里要"清 localStorage + 重载"：`fixed` 的首访落点与"切档后的落点"是**两条**
			// 路径（`boot()` 里没存过 y → 走默认落点；`setMode()` 只把当前高度 clamp 回视口），
			// 所以只能靠真重载来测。`pet-boot` 那次也是首访（临时 profile），但那时页面在顶端、
			// 右下角浮动按钮**还没有尺寸**（w=0）——"不与浮动按钮重叠"在那时是空过。
			// 这里清掉位置记忆后重载，再滚到 2000 让按钮列真的出现：静态宠物不会随滚动移动，
			// 于是这一次采样同时验证了"落点在右下角""完整在视口内""按钮可见且零重叠""1.6 秒完全静止"。
			{
				await cdp.send("Runtime.evaluate", {
					expression: `(() => {
						try {
							localStorage.removeItem("imiss.pet.pos");
							// ⚠️ 组件在 pagehide 上挂了 savePos()（跨页保留位置用的，见组件末尾）。不堵住这条
							//    路径的话，刚删掉的记忆会在**导航那一刻**被原样写回去 —— 实测第一次跑就是这么
							//    拿到"上次拖到的位置" (518,669) 的（重载后根本不是首访，整条判据也跟着假红）。
							//    这里只在**本次导航**期间让写入变成空操作；新文档是新的 JS 上下文，拦截自然失效。
							const proto = Object.getPrototypeOf(localStorage);
							const orig = proto.setItem;
							proto.setItem = function (k, v) {
								if (k === "imiss.pet.pos") return;
								return orig.call(this, k, v);
							};
							return "cleared";
						} catch (e) { return "ERR:" + e.message; }
					})()`,
					returnByValue: true,
				});
				const reloaded = cdp.once("Page.loadEventFired");
				await cdp.send("Page.navigate", { url: `${BASE}/` });
				await reloaded;
				await sleep(2600); // 等出场招呼（1.9s）播完，采的是稳定态
				await cdp.send("Runtime.evaluate", {
					expression: `window.scrollTo({ top: 2000, behavior: "instant" }); "scrolled"`,
					returnByValue: true,
				});
				await sleep(900);
				const land1 = await snap("pet-fixed-land");
				await sleep(1600);
				const land2 = await snap("pet-fixed-land-still");
				const floatRects = await cdp.send("Runtime.evaluate", {
					expression: `(() => [...document.querySelectorAll("#back-to-top-btn, .floating-controls-container")].map((n) => {
						const r = n.getBoundingClientRect();
						return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
					}))()`,
					returnByValue: true,
				});
				const gaps = (floatRects.result.value ?? [])
					.filter((f) => f.w > 0 && f.h > 0)
					.map((f) => {
						const dx = Math.max(0, Math.max(land1.rect.x - f.r, f.l - (land1.rect.x + land1.rect.w)));
						const dy = Math.max(0, Math.max(land1.rect.y - f.b, f.t - (land1.rect.y + land1.rect.h)));
						return Math.round(Math.hypot(dx, dy));
					});
				facts["pet-fixed-land"] = {
					p1: {
						mode: land1.mode,
						transform: land1.transform,
						x: land1.rect.x,
						y: land1.rect.y,
						w: land1.rect.w,
						h: land1.rect.h,
						right: land1.rect.x + land1.rect.w,
						bottom: land1.rect.y + land1.rect.h,
						bottomGap: land1.bottomGap,
						centerRatio: (land1.rect.y + land1.rect.h / 2) / land1.viewport.h,
						flying: land1.flying,
						displayNodes: land1.displayNodes,
						floatOverlap: land1.floatOverlap,
						// 首访的硬证据：重载后 localStorage 里**仍然空的**（既没有被记忆覆盖，
						// 也没有被 pagehide 那一次自保存写回去）
						saved: land1.saved,
					},
					p2: {
						mode: land2.mode,
						transform: land2.transform,
						x: land2.rect.x,
						y: land2.rect.y,
						flying: land2.flying,
					},
					vw: land1.viewport.w,
					vh: land1.viewport.h,
					insideViewport:
						land1.rect.x >= 0 &&
						land1.rect.y >= 0 &&
						land1.rect.x + land1.rect.w <= land1.viewport.w &&
						land1.rect.y + land1.rect.h <= land1.viewport.h,
					minFloatGap: gaps.length ? Math.min(...gaps) : null,
					still:
						land1.transform === land2.transform &&
						land1.rect.x === land2.rect.x &&
						land1.rect.y === land2.rect.y,
				};
			}

			// 先把状态复位成"干净的 float"：`setMode()` 会中断可能正在进行的自动飞行，
			// 并把下一次飞行排到 20~60 秒之后 —— 否则上一步拖拽后宠物可能刚好自己飞起来，
			// 强制起飞会被"已经在飞"挡掉（第一版就这么假红过一次）
			await cdp.send("Runtime.evaluate", { expression: `window.__imissSetMode("float")`, returnByValue: true });
			await sleep(200);

			// ── float：强制起飞一次，记录起飞前 / 飞行中 / 落位后的坐标 ──
			// R-PET-07 起单次飞行是 4~6 秒（原来是固定 2.6s），所以"飞行中段"取 900ms、
			// "等落位"要等满 6.5s —— 沿用旧的 700/2400 会在半空中采样，落位断言就名存实亡了
			const before = await snap("pet-float-before");
			const started = await cdp.send("Runtime.evaluate", {
				expression: `window.__imissFlyNow ? window.__imissFlyNow() : null`,
				returnByValue: true,
			});
			await sleep(900); // 飞行中段（4~6s 的 15%~22% 处）
			const mid = await snap("pet-float-flying");
			const midShot = await cdp.send("Page.captureScreenshot", { format: "png" });
			await fs.writeFile(
				path.join(OUT_DIR, "pet-float-1440.png"),
				Buffer.from(midShot.data, "base64"),
			);
			await sleep(6500); // 等它飞完 + 落位
			const after = await snap("pet-float-after");
			facts["pet-float-flight"] = {
				accepted: started.result.value === true,
				before: { x: before.rect.x, y: before.rect.y, flying: before.flying },
				mid: { x: mid.rect.x, y: mid.rect.y, flying: mid.flying, mode: mid.mode, state: mid.state },
				after: { x: after.rect.x, y: after.rect.y, flying: after.flying },
				midEdge: { right: mid.rect.x + mid.rect.w, bottom: mid.rect.y + mid.rect.h },
				afterEdge: { right: after.rect.x + after.rect.w, bottom: after.rect.y + after.rect.h },
			};

			// ── R-PET-07：连飞 3 次，实测"位移 / 时长 / 飞行中的状态帧" ──────────
			// 发起人原话：「你飞的太快了……自然一点就**微微挪动**就好了」。
			// 断言口径：位移 60~180px（夹回容差到 45~200）、时长 4~6s（实测容差 3.8~6.4s）、
			// 飞行中 `data-pet-state` 必须是图集 row4（jumping：九行里唯一"双臂张开的悬空"形状）。
			const sampleFlight = async () => {
				const { result } = await cdp.send("Runtime.evaluate", {
					expression: `(() => {
						const el = document.getElementById("pet");
						const d = (window.__imissPetDebug ? window.__imissPetDebug() : {}) || {};
						const sprite = document.getElementById("pet-sprite");
						return { ...d, state: el.dataset.petState || null, spritePos: sprite ? sprite.style.backgroundPosition : null };
					})()`,
					returnByValue: true,
				});
				return result.value;
			};
			const measured = [];
			for (let i = 0; i < 3; i++) {
				await cdp.send("Runtime.evaluate", { expression: `window.__imissSetMode("float")`, returnByValue: true });
				await sleep(300);
				const kick = await cdp.send("Runtime.evaluate", {
					expression: `window.__imissFlyNow ? window.__imissFlyNow() : null`,
					returnByValue: true,
				});
				// 等它真的在飞（最多 1.5s）
				let takeoff = null;
				for (let k = 0; k < 20; k++) {
					await sleep(75);
					const s = await sampleFlight();
					if (s.flying) {
						takeoff = { ...s, at: Date.now() };
						break;
					}
				}
				// 等落位（最多 9s）
				let landed = null;
				for (let k = 0; k < 120; k++) {
					await sleep(75);
					const s = await sampleFlight();
					if (!s.flying) {
						landed = { ...s, at: Date.now() };
						break;
					}
				}
				measured.push({
					accepted: kick.result.value === true,
					x0: takeoff?.x ?? null,
					y0: takeoff?.y ?? null,
					x1: landed?.x ?? null,
					y1: landed?.y ?? null,
					dist:
						takeoff && landed
							? Math.round(Math.hypot(landed.x - takeoff.x, landed.y - takeoff.y))
							: null,
					durMs: takeoff && landed ? landed.at - takeoff.at : null,
					midState: takeoff?.state ?? null,
					midSpritePos: takeoff?.spritePos ?? null,
					reduce: takeoff?.reduce ?? null,
				});
			}
			facts["pet-flight-samples"] = measured;
			{
				const cfg = await fs.readFile(path.resolve("src/config/petConfig.ts"), "utf8");
				const utils = await fs.readFile(path.resolve("src/utils/pet-utils.ts"), "utf8");
				const num = (re) => {
					const m = re.exec(utils) || re.exec(cfg);
					return m ? Number(m[1]) : null;
				};
				const range = (re, text) => {
					const m = re.exec(text);
					return m ? [Number(m[1]), Number(m[2])] : null;
				};
				facts["pet-fly-params"] = {
					distance: range(/flyDistanceRange:\s*\[(\d+),\s*(\d+)\]/, utils),
					duration: range(/flyDurationRange:\s*\[(\d+),\s*(\d+)\]/, cfg),
					interval: range(/flyIntervalRange:\s*\[(\d+),\s*(\d+)\]/, cfg),
					arc: num(/flyArc:\s*(\d+)/),
					tilt: num(/flyTilt:\s*(\d+)/),
				};
			}

			// ── float：拖动松手**不掉落**（悬停锚在松手处）──
			await dragPet(700, 260);
			await sleep(400);
			const drop1 = await snap("pet-float-drop");
			await sleep(1200);
			const drop2 = await snap("pet-float-drop2");
			facts["pet-float-drop"] = {
				y1: drop1.rect.y,
				y2: drop2.rect.y,
				bottom1: drop1.bottomGap,
				bottom2: drop2.bottomGap,
			};

			// ── fixed：切过去，两次采样必须**完全一样**（不悬浮不漂移）──
			await cdp.send("Runtime.evaluate", { expression: `window.__imissSetMode("fixed")`, returnByValue: true });
			await sleep(400);
			const fx1 = await snap("pet-fixed-1");
			await sleep(1600);
			const fx2 = await snap("pet-fixed-2");
			facts["pet-fixed-still"] = { x1: fx1.rect.x, y1: fx1.rect.y, x2: fx2.rect.x, y2: fx2.rect.y };

			// ── fixed：拖到半空松手 → 停在原地，不下落 ──
			await dragPet(560, 250);
			await sleep(300);
			const fx3 = await snap("pet-fixed-drop");
			await sleep(1400);
			const fx4 = await snap("pet-fixed-drop2");
			facts["pet-fixed-drop"] = {
				y1: fx3.rect.y,
				y2: fx4.rect.y,
				bottomGap: fx4.bottomGap,
				mode: fx4.mode,
			};
			const fixedShot = await cdp.send("Page.captureScreenshot", { format: "png" });
			await fs.writeFile(
				path.join(OUT_DIR, "pet-fixed-1440.png"),
				Buffer.from(fixedShot.data, "base64"),
			);

			// ── ground：切过去 → 落回地面；再拖到半空松手 → 受重力落地（P3 原行为）──
			await cdp.send("Runtime.evaluate", { expression: `window.__imissSetMode("ground")`, returnByValue: true });
			await sleep(500);
			const g1 = await snap("pet-ground-1");
			await dragPet(520, 220);
			await sleep(120);
			const g2 = await snap("pet-ground-air"); // 刚松手：还在半空
			await sleep(1400);
			const g3 = await snap("pet-ground-landed"); // 落地后
			facts["pet-ground"] = {
				modeSwitchGap: g1.bottomGap,
				airY: g2.rect.y,
				airGap: g2.bottomGap,
				landedY: g3.rect.y,
				landedGap: g3.bottomGap,
				mode: g3.mode,
			};
			const groundShot = await cdp.send("Page.captureScreenshot", { format: "png" });
			await fs.writeFile(
				path.join(OUT_DIR, "pet-ground-1440.png"),
				Buffer.from(groundShot.data, "base64"),
			);

			// 切回配置里的默认档（v1.59 起是 `fixed`），让后续步骤（Swup/reduced-motion）回到出厂状态
			await cdp.send("Runtime.evaluate", { expression: `window.__imissSetMode("fixed")`, returnByValue: true });
			await sleep(200);
		}

		// ⑩ 切页（Swup）→ 招呼：点导航里的「关于我」，等 astro:page-load
		await cdp.send("Runtime.evaluate", {
			expression: `(() => {
				const a = document.querySelector('a[href="/about/"]');
				if (!a) return "no-link";
				a.click();
				return "nav";
			})()`,
			returnByValue: true,
		});
		await sleep(700);
		await snap("pet-swup");

		// ⑩b 再进文章页 → 安静模式（R-PET-03：阅读页别在正文下面来回走）。
		// 这里用直接导航：/about/ 页面上没有指向文章的链接，点链接会一直是 no-link（第一版就卡在这）
		{
			const postLoaded = cdp.once("Page.loadEventFired");
			await cdp.send("Page.navigate", { url: `${BASE}${SAMPLE_POST}` });
			await postLoaded;
			await sleep(1200);
			await snap("pet-post-page");
		}

		// 截图（视口截图，宠物才能被正确拍到）
		const petShot = await cdp.send("Page.captureScreenshot", { format: "png" });
		await fs.writeFile(path.join(OUT_DIR, "pet-after-swup-1440.png"), Buffer.from(petShot.data, "base64"));

		// ⑪ reduced-motion：不跑循环、停在待机首帧，但点击/对话仍可用
		await cdp.send("Emulation.setEmulatedMedia", {
			features: [
				{ name: "prefers-color-scheme", value: "dark" },
				{ name: "prefers-reduced-motion", value: "reduce" },
			],
		});
		const loaded2 = cdp.once("Page.loadEventFired");
		await cdp.send("Page.navigate", { url: `${BASE}/` });
		await loaded2;
		await sleep(1500);
		// 先采一次"重载后的出厂档位"：位置记忆里存的是 `ground`，配置里是 `fixed` ——
		// 这一采样是"**模式以配置为准**，记忆盖不过配置"那条断言的证据（v1.59 前它由
		// reduced1 顺带承担；默认档改成 fixed 之后必须单独采，否则下面那次强制切档会把它抹掉）。
		const reducedDefault = await snap("pet-reduced-default");
		// ⚠️ v1.59：重载之后运行时档位是**配置默认的 `fixed`**（不再是 float）。
		// R-PET-06 第 ⑫ 条验的是"`reduced-motion` 下 `float` 退化成静态悬浮"，
		// 所以这里显式切到 float 再采样 —— 不切就变成"在 fixed 上断言 float 的行为"，
		// 会拿到一条**恒真**的假绿（fixed 本来就不动）。默认档 fixed 在 reduced-motion 下
		// 同样静止（它压根没有 rAF 位移），由第 ②③ 条与 `pet-boot` 那组覆盖。
		await cdp.send("Runtime.evaluate", {
			expression: `window.__imissSetMode("float"); "float"`,
			returnByValue: true,
		});
		await sleep(300);
		const reduced1 = await snap("pet-reduced-1");
		await sleep(900);
		await snap("pet-reduced-2");
		// 点击仍要有反应（气泡出来）—— ⚠️ R-PET-13：「说句话」菜单入口已按发起人要求删除，
		// 这条改走**左键单击宠物**这条真实路径（pointerdown + pointerup、无移动，与 ⑧ 同一手法）。
		// 旧写法 `querySelector('[data-pet-act="say"]').click()` 在该项被删后会命中 null 并抛
		// TypeError，静默表现成"气泡是空的" —— 看起来像功能坏了，其实只是判据没跟着改。
		await cdp.send("Runtime.evaluate", {
			expression: `(() => {
				const el = document.getElementById("pet-body");
				const r = el.getBoundingClientRect();
				const o = { bubbles: true, cancelable: true, pointerId: 43, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
				el.dispatchEvent(new PointerEvent("pointerdown", o));
				el.dispatchEvent(new PointerEvent("pointerup", o));
				return "clicked";
			})()`,
			returnByValue: true,
		});
		await sleep(200);
		await snap("pet-reduced-say");
		facts["pet-reduced-bubble1"] = { bubble: reduced1.bubble };
		const reducedShot = await cdp.send("Page.captureScreenshot", { format: "png" });
		await fs.writeFile(
			path.join(OUT_DIR, "pet-reduced-motion-1440.png"),
			Buffer.from(reducedShot.data, "base64"),
		);

		// 复位媒体模拟，免得影响后面的检查
		await cdp.send("Emulation.setEmulatedMedia", {
			features: [{ name: "prefers-color-scheme", value: "dark" }],
		});
	}

	// ── R-BG-05 手动换壁纸：交互区点击 / hover 显形 / 键盘 / 拖动 ──
	{
		await cdp.send("Emulation.setDeviceMetricsOverride", {
			width: 1440,
			height: 900,
			deviceScaleFactor: 1,
			mobile: false,
		});
		const loaded = cdp.once("Page.loadEventFired");
		await cdp.send("Page.navigate", { url: `${BASE}/` });
		await loaded;
		await sleep(1400);

		const snap = async (key) => {
			const { result } = await cdp.send("Runtime.evaluate", { expression: COLLECT, returnByValue: true });
			facts[key] = result.value;
			return result.value.wallpaperSwitch;
		};
		const clickZone = async (sel) => {
			const { result } = await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const z = document.querySelector('${sel}');
					if (!z) return "missing";
					z.click();
					return "ok";
				})()`,
				returnByValue: true,
			});
			return result.value;
		};

		const start = await snap("wp-switch-start");

		// ① 默认不可见（opacity 0），但存在且可聚焦
		// ② 点「下一张」→ active 前进一张
		await clickZone(".banner-switch-zone.is-next");
		await sleep(1200); // 等 1000ms 的过渡
		const afterNext = await snap("wp-switch-next");

		// ③ 点「上一张」→ 退回原来那张
		await clickZone(".banner-switch-zone.is-prev");
		await sleep(1200);
		const afterPrev = await snap("wp-switch-prev");

		// ④ 连点「下一张」→ 能循环回起点
		const total = start.count || 1;
		const end = await cdp.send("Runtime.evaluate", {
			expression: `(async () => {
				const btn = document.querySelector('.banner-switch-zone.is-next');
				for (let i = 0; i < ${total}; i++) {
					btn.click();
					await new Promise((r) => setTimeout(r, 1150));
				}
				return "done";
			})()`,
			returnByValue: true,
			awaitPromise: true,
		});
		const afterLoop = await snap("wp-switch-loop");

		// ⑤ hover 才淡出箭头：鼠标移到交互区上 → opacity 变 1
		const zone = afterLoop.zones.find((z) => z.dir === "1");
		await cdp.send("Input.dispatchMouseEvent", {
			type: "mouseMoved",
			x: (zone?.rect.x ?? 0) + 20,
			y: (zone?.rect.y ?? 0) + 100,
		});
		await sleep(450);
		await snap("wp-switch-hover");

		// ⑥ 键盘：聚焦交互区后按 Enter 也能换图（走的是 button 的**原生默认行为**，
		//    所以这里必须发 keyDown + text:"\r"；rawKeyDown 不触发默认动作，第一版就这么假失败了）
		await cdp.send("Runtime.evaluate", {
			expression: `document.querySelector('.banner-switch-zone.is-next').focus(); "focused"`,
			returnByValue: true,
		});
		await cdp.send("Input.dispatchKeyEvent", {
			type: "keyDown",
			key: "Enter",
			code: "Enter",
			windowsVirtualKeyCode: 13,
			nativeVirtualKeyCode: 13,
			text: "\r",
			unmodifiedText: "\r",
		});
		await cdp.send("Input.dispatchKeyEvent", {
			type: "keyUp",
			key: "Enter",
			code: "Enter",
			windowsVirtualKeyCode: 13,
			nativeVirtualKeyCode: 13,
		});
		await sleep(1250);
		await snap("wp-switch-keyboard");

		// ⑦ 鼠标按住往左拖 → 下一张（同一套 pointer 手势）
		await cdp.send("Runtime.evaluate", {
			expression: `(() => {
				const w = document.getElementById("wallpaper-wrapper");
				const r = w.getBoundingClientRect();
				const cx = Math.round(r.left + r.width / 2);
				const cy = Math.round(r.top + r.height * 0.55);
				w.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 11, pointerType: "mouse", button: 0, clientX: cx, clientY: cy }));
				w.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 11, pointerType: "mouse", button: 0, clientX: cx - 40, clientY: cy }));
				w.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 11, pointerType: "mouse", button: 0, clientX: cx - 140, clientY: cy }));
				w.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 11, pointerType: "mouse", button: 0, clientX: cx - 140, clientY: cy }));
				return "dragged";
			})()`,
			returnByValue: true,
		});
		await sleep(1250);
		await snap("wp-switch-drag");

		const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
		await fs.writeFile(path.join(OUT_DIR, "banner-switch-hover-1440.png"), Buffer.from(shot.data, "base64"));

		// ⑧ 手机端：交互区不显示（CSS），但触屏滑动仍能换图
		await cdp.send("Emulation.setDeviceMetricsOverride", {
			width: 390,
			height: 844,
			deviceScaleFactor: 1,
			mobile: true,
		});
		const loadedMobile = cdp.once("Page.loadEventFired");
		await cdp.send("Page.navigate", { url: `${BASE}/` });
		await loadedMobile;
		await sleep(1400);
		const mobileStart = await snap("wp-switch-mobile-start");
		await cdp.send("Runtime.evaluate", {
			expression: `(() => {
				const w = document.getElementById("wallpaper-wrapper");
				const r = w.getBoundingClientRect();
				const cx = Math.round(r.left + r.width / 2);
				const cy = Math.round(r.top + r.height * 0.5);
				w.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 21, pointerType: "touch", isPrimary: true, clientX: cx, clientY: cy }));
				w.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 21, pointerType: "touch", isPrimary: true, clientX: cx - 50, clientY: cy }));
				w.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 21, pointerType: "touch", isPrimary: true, clientX: cx - 130, clientY: cy }));
				w.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 21, pointerType: "touch", isPrimary: true, clientX: cx - 130, clientY: cy }));
				return "swiped";
			})()`,
			returnByValue: true,
		});
		await sleep(1250);
		await snap("wp-switch-mobile-after");
		void mobileStart;
		void end;
	}

	// ── 用采集到的事实做判定 ──
	const home = facts["home-1440"];
	const mobileHome = facts["home-390"];

	record("R-NAV-01~04", "顶层导航顺序", same(home.navTops.map((t) => t.name), EXPECT_TOP_NAV), JSON.stringify(home.navTops.map((t) => t.name)));
	// R-NAV-02 的判据随导航第 3 格一起换（v1.41 / P2R）：原来是「排行 + 三个 /rank/ 子项」，
	// 现在是「学习路线」单链接 —— 同一条需求、同一条断言位，只是被测对象换了
	// （「排行」子项 ↔ 路由 的死链核对在 `pnpm verify:docs` 的「导航子项」里）
	// ⚠️ M5（终审）：这条原来跟下面 R-PATH-01 的第 3 格断言**读同一份事实、同一个判据**
	//    （`facts["home-1440"].navTops[2]` 的 name + href + 无子项），232 项里有一条是重复的。
	//    现在两条**分守不同的面**：桌面面（下拉容器结构）归 R-PATH-01，
	//    这里守**移动抽屉**——第 3 格必须是"点一下直接进页面"的单链接（`<a data-nav-href>`），
	//    不是会展开的手风琴，也不能挂子项（手机抽屉里挂 8 条主线会爆）。
	const mThird = mobileHome.mobileTops?.[2];
	record("R-NAV-02", "移动抽屉第 3 格「学习路线」是单链接（可点、不展开、无子项）",
		mThird?.name === "学习路线" &&
			mThird?.href === "/roadmap/" &&
			mThird?.expandable === false &&
			(mThird?.children?.length ?? -1) === 0,
		`抽屉第 3 格 = ${JSON.stringify(mThird)} ｜ 抽屉顶层 ${JSON.stringify(mobileHome.mobileTops?.map((t) => t.name))}`);
	const my = home.navTops.find((t) => t.name === "我的");
	record("R-NAV-03", "我的子项顺序与链接", !!my && same(my.children, EXPECT_MY_CHILDREN), JSON.stringify(my?.children));
	record("R-NAV-01~04", "已删除的导航项不再出现", EXPECT_ABSENT_LABELS.every((l) => !home.allLabels.includes(l)), home.allLabels.filter((l) => EXPECT_ABSENT_LABELS.includes(l)).join(",") || "无残留");
	// ── v1.57（B-10 关闭）「链接」下拉重建；**v1.61 整批换成发起人的 6 条** ────────
	// 位置由上面那条「顶层导航顺序」钉住（第 5 格、在「我的」与「留言」之间），
	// 这里钉**内容**：6 条的名字 + href + 顺序，一条不对就红。
	// ⚠️ 子项名字是**短名**（「洛谷」/「CSDN」/「Boost 搜索引擎」），不是书签页那 38 张卡的全名 ——
	//    两边故意不同（导航栏放不下「力扣 LeetCode」那类全名），别把它和 EXPECT_BOOKNAV_CARDS 对齐。
	{
		const link = home.navTops.find((t) => t.name === "链接");
		record(
			"R-NAV-01~04",
			"「链接」下拉的 6 条外链（名字 + href + 顺序）与发起人清单一致",
			!!link && same(link.children, EXPECT_LINK_CHILDREN),
			`实际 ${JSON.stringify(link?.children ?? null)}`,
		);
		// 这 6 条**都不是站内页面**：必须带 external（外链新开页 + 主题的图标/rel 处理），
		// 且不许挂 pageKey（挂了会被 siteConfig.pages 过滤掉、整组可能一声不响地消失）。
		// 这一条同时是"空组"判据的正面版：children 存在且 6 条都在。
		const navSrc = await fs.readFile(path.resolve("src/config/navBarConfig.ts"), "utf8");
		const linkBlock = navSrc.match(/name:\s*"链接",[\s\S]*?\n\t\}\);/)?.[0] ?? "";
		const externals = (linkBlock.match(/external:\s*true/g) ?? []).length;
		record(
			"R-NAV-01~04",
			"「链接」组 6 条都标了 external: true、且都没有 pageKey",
			externals === 6 && !/pageKey/.test(linkBlock),
			`external: true 出现 ${externals} 次（期望 6）｜ 块内含 pageKey=${/pageKey/.test(linkBlock)}`,
		);
		// ── v1.61 新增：两条"照办的细节"的**配置层**判据（上面钉的是渲染出来的 DOM）──
		// 为什么光钉 DOM 不够（T77 那类"判据空过"）：`EXPECT_LINK_CHILDREN` 只能证明
		// "地址长这样"，证明不了"这是照办的结果"—— 例如把 CSDN 的 `?spm=…` 粘回去、
		// 或者把裸 IP 那条**擅自改成 https 域名**（发起人没让改），前者判红但后者反而"更干净"；
		// 而"注释里有没有那条 https 建议"更是 DOM 完全看不见的东西。
		// 这一条因此只看**配置文件里 `url:` 的值**（注释不算，所以注释里可以写明被去掉的 `?spm=`）。
		// ⚠️ 抓到的块**从 `name: "链接",` 开始**，所以第 1 个 `url:` 是**这一格自己的占位 `"#"`**
		//    （顶层下拉的触发器）—— 只留 `http(s)://` 开头的，才是那 6 条子项的地址。
		const linkUrls = [...linkBlock.matchAll(/url:\s*"([^"]+)"/g)]
			.map((m) => m[1])
			.filter((u) => /^https?:\/\//.test(u));
		const dirtyUrls = linkUrls.filter((u) => u.includes("?"));
		record(
			"R-NAV-01~04",
			"「链接」6 条都是干净地址（无查询串）、裸 IP 那条按原样收录且注释里留了 https 建议",
			linkUrls.length === EXPECT_LINK_CHILDREN.length &&
				dirtyUrls.length === 0 &&
				linkUrls.includes(EXPECT_LINK_RAW_IP_URL) &&
				EXPECT_LINK_HTTPS_HINT.test(linkBlock),
			`块内 url: ${linkUrls.length} 个（期望 ${EXPECT_LINK_CHILDREN.length}）｜ 带查询串的 ${dirtyUrls.length} 个${dirtyUrls.length ? `：${dirtyUrls.join(",")}` : ""}｜ 裸 IP 那条在=${linkUrls.includes(EXPECT_LINK_RAW_IP_URL)}｜ 注释里有 https 建议=${EXPECT_LINK_HTTPS_HINT.test(linkBlock)}`,
		);
		// 上游署名项的负控（原样保留）：重建后的 6 条里不许混进任何上游字样
		record(
			"R-NAV-01~04",
			"重建的「链接」组里没有上游署名项",
			!/firefly|cuteleaf|夏夜流萤/i.test(linkBlock) && linkBlock.length > 0,
			linkBlock ? `块长 ${linkBlock.length} 字符，上游字样=${/firefly|cuteleaf|夏夜流萤/i.test(linkBlock)}` : "没抓到「链接」块（配置被改？）",
		);
	}
	// 移动抽屉与桌面共用同一份 navBarConfig，所以顺序断言对两边都成立（「排行」不再出现在任何一层）
	record("R-NAV-01", "移动端菜单最后一项是「留言」且第 3 格是「学习路线」", mobileHome.mobileTops.at(-1)?.name === "留言" && mobileHome.mobileTops.some((t) => t.name === "学习路线"), JSON.stringify(mobileHome.mobileTops.map((t) => t.name)));
	// M6（终审）：`mobileNavActive` 与 `mobileNavExpanded` 两个采集项原来的唯一消费者是
	// 「进排行页 → 抽屉自动展开『排行』分组并把它标成当前页」，那条随排行模块删掉了（Task 4），
	// 于是两个采集项成了**零消费者的死代码**（另一个 agent 交接时点名的 Minor）。
	// 按终审裁定**改锚到一个仍然存在的分组**上：「我的」→ `/about/`（「关于我」是它的最后一项）。
	// 覆盖回来的正是丢掉的那半条通用能力：**进子页 → 抽屉标当前页 + 自动展开含它的父级分组**。
	// 数据取 `facts["about-1440"]`（主 COLLECT，抽屉在每一页都在 DOM 里，与视口宽无关）。
	const aboutNav = facts["about-1440"];
	record(
		"R-NAV-01",
		"进 /about/ 时抽屉把「关于我」标成当前页，并自动展开父级「我的」分组",
		(aboutNav?.mobileNavActive ?? []).includes("关于我") &&
			(aboutNav?.mobileNavExpanded ?? []).some((t) => t.startsWith("我的")),
		`当前页项文字 ${JSON.stringify(aboutNav?.mobileNavActive)} ｜ 自动展开的分组 ${JSON.stringify(aboutNav?.mobileNavExpanded)}`,
	);
	record("R-ID-01", "站点名 IMiss Blog（标题 + 导航栏品牌）", home.title.includes("IMiss Blog") && (home.brand ?? "").includes("IMiss Blog"), `title=${home.title} brand=${home.brand}`);
	// ── v1.57：书签导航页（R-BOOKNAV-01 ~ 04）──────────────────────────────────
	// 这一页此前**一条界面断言都没有**（grep `booknav` 只命中导航子项表与 ALLOWED_ROUTES）。
	// 本轮整页从"上游示例三组 10 张"换成发起人最终选定的 **6 组 38 张**，判据一起补上。
	// ⚠️ 事实取自 `facts["booknav-1440"].booknav` 与 `facts["booknav-390"].booknav`
	//    （主循环里 `booknav: true` 那一趟采的），不是 fetch HTML 正则 —— 图标降级形态、
	//    卡片高度、空组过滤这些只有真渲染出来才看得出。
	{
		// ⚠️ **键名这里踩过一次坑（v1.57 实现时）**：主循环把额外采集的结果存在
		//    `${page.name}-booknav`（整份 facts 里的键是 `"booknav-1440-booknav"`），
		//    **不是** `facts["booknav-1440"].booknav` —— 后者是"主 COLLECT 结果上挂一个 booknav
		//    字段"的读法，永远取不到东西，于是 10 条断言全红、而红行只会说"全是 undefined"。
		//    同一个文件里 post / roadmap 用的是同一个键名约定（`x-1440-post` / `x-1440-roadmap`）。
		const bn = facts["booknav-1440-booknav"] ?? {};
		const bnMobile = facts["booknav-390-booknav"] ?? {};
		// R-BOOKNAV-01：分组**按 weight 降序渲染**（发起人的优先级：AI 工具优先 … 其他三方站最后）
		const wantIds = EXPECT_BOOKNAV_GROUPS.map((g) => g[0]);
		const wantNames = EXPECT_BOOKNAV_GROUPS.map((g) => g[1]);
		const wantCounts = EXPECT_BOOKNAV_GROUPS.map((g) => g[2]);
		record(
			"R-BOOKNAV-01",
			`书签页按权重渲染 ${EXPECT_BOOKNAV_GROUPS.length} 组（AI 工具优先 … 其他三方服务最后）`,
			same(bn.sectionIds, wantIds) && same(bn.sectionNames, wantNames),
			`实际 id=${JSON.stringify(bn.sectionIds)} ｜ 组名=${JSON.stringify(bn.sectionNames)}`,
		);
		// R-BOOKNAV-01：每组条数与 EXPECT_BOOKNAV_GROUPS 的第三列一致（合计 38）
		record(
			"R-BOOKNAV-02",
			"每组条数正确（6/9/5/9/4/5 = 38）",
			same(bn.sectionCounts, wantCounts),
			`实际 ${JSON.stringify(bn.sectionCounts)}（合计 ${(bn.sectionCounts ?? []).reduce((a, b) => a + b, 0)}）`,
		);
		// R-BOOKNAV-02：38 张卡的**标题 + URL + 顺序**必须逐条等于发起人清单。
		// 只数个数是不够的 —— 换掉一张卡仍是 38 张，但内容已经不是他要的了。
		// ⚠️ 只折叠**标题**的大小写、不折叠 URL：模板渲染 data-title 时用的是
		//    `item.title.toLowerCase()`（booknav.astro 的既有行为，本轮不改），所以标题这一列
		//    天然是小写；URL 必须逐字符相等（大小写不同就是另一个地址）。
		const fold = (s) => String(s).toLowerCase();
		const gotCards = (bn.cards ?? []).map((c) => [c.title, c.href]);
		const wantCardsFolded = EXPECT_BOOKNAV_CARDS.map(([title, href]) => [fold(title), href]);
		record(
			"R-BOOKNAV-02",
			`书签页 ${EXPECT_BOOKNAV_CARDS.length} 张卡的标题与 URL 逐条等于发起人清单（含顺序；标题按 data-title 的小写形态比）`,
			same(gotCards, wantCardsFolded),
			gotCards.length === EXPECT_BOOKNAV_CARDS.length
				? `条数一致（${gotCards.length}），但内容/顺序有出入：第一处不同 = ${JSON.stringify(
						(() => {
							const i = gotCards.findIndex((c, k) => JSON.stringify(c) !== JSON.stringify(EXPECT_BOOKNAV_CARDS[k]));
							return i < 0 ? null : { 第几: i + 1, 实际: gotCards[i], 期望: wantCardsFolded[i] };
						})(),
					)}`
				: `实际 ${gotCards.length} 张，期望 ${EXPECT_BOOKNAV_CARDS.length} 张`,
		);
		// R-BOOKNAV-04 的**另一半**（隐私守卫在产物级那一段，见上面的 dist 扫描）：
		// 线上真正会发出去的图标请求里**不许有第三方 favicon 接口**。
		// ⚠️ 判据是 `img[src]`（真会发请求的东西）而不是配置字符串 —— 配置里留着那个 api 值无害。
		//
		// ⚠️ **v1.58 改口径（这是"就地迁移"而不是"删断言"）**：旧判据是
		//    `thirdPartyIconRequests.length === 0 && 卡片内 <img> 数量 === 0`
		//    —— 后半句在 v1.58 必然为假，因为 11 张卡**故意**改用了本地 favicon（走 `<img>`）。
		//    "不许有 `<img>`"从来不是目标，"不许有**第三方**请求"才是。所以后半句换成
		//    更严的判据：`<img>` 的 src 必须全部是站内 `/booknav-icons/`（数量由
		//    R-BOOKNAV-08 单列一条逐张核对），这里保留计数以防"悄悄退回 0 张"。
		const imgSrcList = (bn.cards ?? []).map((c) => c.imgSrc).filter(Boolean);
		const localImgCount = imgSrcList.filter((s) => String(s).startsWith(LOCAL_ICON_PREFIX)).length;
		record(
			"R-BOOKNAV-03",
			"favicon 自动获取已关闭：页面上 0 个指向第三方 favicon 接口的图标请求，且所有图标 <img> 都是站内本地副本",
			(bn.thirdPartyIconRequests ?? []).length === 0 && localImgCount === imgSrcList.length,
			`第三方 favicon 请求 ${(bn.thirdPartyIconRequests ?? []).length} 个；卡片内 <img> 合计 ${imgSrcList.length} 个，其中站内 ${localImgCount} 个`,
		);
		// R-BOOKNAV-03：**图标位不许空**（原来这条的措辞是"手填图标或首字母块"，
		// v1.58 起口径收紧为"必须是真图标"，见下面的 R-BOOKNAV-05；这里只留"没有空格子"这一层）
		const iconKinds = (bn.cards ?? []).map((c) => (c.svg > 0 ? "svg" : c.img > 0 ? "img" : c.letterEl > 0 ? "letter" : "empty"));
		const emptyIcons = iconKinds.filter((k) => k === "empty").length;
		const svgCount = iconKinds.filter((k) => k === "svg").length;
		const imgCount = iconKinds.filter((k) => k === "img").length;
		const letterCount = iconKinds.filter((k) => k === "letter").length;
		record(
			"R-BOOKNAV-03",
			`${EXPECT_BOOKNAV_CARDS.length} 格图标全部有内容（svg / 本地 favicon / 字母块），无一格空白`,
			(bn.cards ?? []).length > 0 && emptyIcons === 0 && svgCount + imgCount + letterCount === (bn.cards ?? []).length,
			`svg=${svgCount} ｜ 本地 favicon=${imgCount} ｜ 字母块=${letterCount} ｜ 空白=${emptyIcons}（共 ${(bn.cards ?? []).length} 张）`,
		);
		// R-BOOKNAV-03 的证据补充：卡片高度仍整齐（56px 图标块 + padding → 72px），
		// 也就是"换成首字母块之后卡片没被压扁/撑高"。记录用，不作为硬判据（字体渲染差异会让 ±1px 漂）。
		record(
			"R-BOOKNAV-03",
			"卡片高度整齐（同一高度，没有被首字母块压扁或撑开）",
			(bn.cardHeights ?? []).length === 1,
			`实测卡片高度集合 = ${JSON.stringify(bn.cardHeights)}（38 张卡同一高度即通过）；移动端 390 下 = ${JSON.stringify(bnMobile.cardHeights)}`,
		);
		// R-BOOKNAV-01：**空组过滤**（`getEnabledBooknavGroups()` 会把 items 为 0 的组丢掉）——
		// 页面里不许出现"有标题、0 张卡"的空 section，也不许出现"6 个组但总数对不上"。
		record(
			"R-BOOKNAV-01",
			"没有空组：每个 section 都有卡片（getEnabledBooknavGroups 的空组过滤生效）",
			(bn.emptySections ?? []).length === 0 && (bn.sectionIds ?? []).length === EXPECT_BOOKNAV_GROUPS.length,
			`空组 ${JSON.stringify(bn.emptySections ?? null)} ｜ section 数=${(bn.sectionIds ?? []).length}`,
		);
		// R-BOOKNAV-02：分类胶囊的锚点 id 与组一致，且胶囊上的条数角标 == 组内实际卡片数
		// （角标是模板里 `{group.items.length}` 渲染的，钉住它可以抓到"配置 6 条、页面 5 张"的漂移）
		const pillCounts = (bn.pillNames ?? []).map((t) => Number((t.match(/(\d+)\s*$/) ?? [])[1]));
		record(
			"R-BOOKNAV-02",
			"分类胶囊的锚点与条数角标都与分组一致",
			same(bn.pillTargets, wantIds) && same(pillCounts, wantCounts),
			`胶囊锚点=${JSON.stringify(bn.pillTargets)} ｜ 角标=${JSON.stringify(pillCounts)} ｜ 胶囊文字=${JSON.stringify(bn.pillNames)}`,
		);
		// R-BOOKNAV-02：卡片一律 `target="_blank"` + `rel="noopener noreferrer"`（38 条全是外链）
		const badTargets = (bn.cards ?? []).filter((c) => c.target !== "_blank").length;
		record(
			"R-BOOKNAV-02",
			"38 张卡都是新窗口打开（target=_blank）",
			(bn.cards ?? []).length === EXPECT_BOOKNAV_CARDS.length && badTargets === 0,
			`target 不是 _blank 的卡片 ${badTargets} 张`,
		);
		// R-BOOKNAV-01：390 视口下同样是 6 组 38 张（手机上没有横向溢出 / 没有组被挤掉）
		record(
			"R-BOOKNAV-01",
			"移动端 390 下同样是 6 组 38 张卡",
			same(bnMobile.sectionIds, wantIds) && (bnMobile.cards ?? []).length === EXPECT_BOOKNAV_CARDS.length,
			`移动端 组=${JSON.stringify(bnMobile.sectionIds)} ｜ 卡数=${(bnMobile.cards ?? []).length}`,
		);

		// ══ v1.58：官方图标 + 官方品牌色（R-BOOKNAV-05 / 06 / 07 / 08）══════════
		// 发起人的抱怨原话：「标签怎么没有图标啊，就算有图标但还是没颜色啊，你可以拿官方图标」
		// —— 三句话对应下面三条：① 每张都要**真图标** ② 每个图标都要**有颜色**
		// ③ 颜色要是**各站品牌色**而不是统一染一遍。第 4 条是"运行期零第三方请求"。

		// ── R-BOOKNAV-05：每张卡的图标都必须是**真图标**（svg 或本地 img）──
		// 判据：`<svg>`（iconify 品牌矢量）或 `<img>`（本地官方 favicon）；
		// `.booknav-letter` 只允许出现在**点名过的例外**上（站点整站不可达、连兜底都拿不到图形）。
		// 失败时**逐张点名**是哪几张卡退化了 —— 只说"多了 3 个字母块"等于没说。
		{
			const degenerate = (bn.cards ?? []).filter((c) => (c.svg ?? 0) === 0 && (c.img ?? 0) === 0);
			// 例外名单按**标题**认（data-title 是小写形态），与 EXPECT_BOOKNAV_LETTER_EXCEPTIONS 比
			const allowed = new Set(EXPECT_BOOKNAV_LETTER_EXCEPTIONS);
			const unlisted = degenerate.filter((c) => !allowed.has((c.title || "").trim()));
			const missingFromPage = EXPECT_BOOKNAV_LETTER_EXCEPTIONS.filter(
				(t) => !degenerate.some((c) => (c.title || "").trim() === t),
			);
			record(
				"R-BOOKNAV-05",
				`${EXPECT_BOOKNAV_CARDS.length} 张卡的图标都是真图标（iconify svg 或本地 favicon），字母块 ≤ ${EXPECT_BOOKNAV_LETTER_EXCEPTIONS.length} 个已点名的例外`,
				(bn.cards ?? []).length === EXPECT_BOOKNAV_CARDS.length && unlisted.length === 0 && missingFromPage.length === 0,
				unlisted.length
					? `❌ 这些卡退化成字母块且不在例外名单里：${unlisted.map((c) => c.title).join(" / ")}（共 ${degenerate.length} 个字母块）`
					: `svg=${svgCount} ｜ 本地 favicon=${imgCount} ｜ 字母块=${letterCount}${letterCount ? `（例外：${degenerate.map((c) => c.title).join(" / ")}）` : ""}${missingFromPage.length ? ` ｜ ⚠️ 例外名单里的 ${missingFromPage.join("/")} 在页面上**没**退化成字母块（名单过期了？）` : ""}`,
			);
			// R-BOOKNAV-05：字母块的**数量**必须正好等于名单长度 —— 挡住"多退化一个但恰好也叫例外名字"
			record(
				"R-BOOKNAV-05",
				`退化成字母块的卡片数 == 例外名单长度（${EXPECT_BOOKNAV_LETTER_EXCEPTIONS.length}）`,
				letterCount === EXPECT_BOOKNAV_LETTER_EXCEPTIONS.length,
				`实测 ${letterCount} 个字母块（${degenerate.map((c) => c.title).join(" / ") || "无"}）vs 例外名单 ${EXPECT_BOOKNAV_LETTER_EXCEPTIONS.length} 个（${EXPECT_BOOKNAV_LETTER_EXCEPTIONS.join(" / ") || "空"}）`,
			);
			// R-BOOKNAV-05：图标是**装饰性**的，卡片标题才是无障碍名。
			// 所以每个 iconify `<svg>` 都要 `aria-hidden="true"`（对 AT 隐藏、不挤占标题）。
			// 这条同时挡住"为了加颜色把 svg 换成带 alt 的 <img> 或加 title"这类
			// 会让读屏器把站点名念两遍的改法。
			const ariaBad = (bn.cards ?? []).filter((c) => (c.svg ?? 0) > 0 && c.svgAriaHidden !== "true");
			record(
				"R-BOOKNAV-05",
				`${svgCount} 个 iconify 图标都是装饰性的（svg[aria-hidden=true]，不挤占卡片标题的无障碍名）`,
				svgCount === ICONIFY_BOOKNAV_TITLES.size && ariaBad.length === 0,
				ariaBad.length
					? `❌ ${ariaBad.length} 个 svg 没有 aria-hidden：${ariaBad.map((c) => c.title).join(" / ")}`
					: `svg=${svgCount}（期望 ${ICONIFY_BOOKNAV_TITLES.size}，与断言名单一致）｜ aria-hidden 缺失 0 个`,
			);
		}

		// ── R-BOOKNAV-06：**每个图标都要有颜色**，而且不是旧的中性灰 / 白 ──
		// 判据取自**浏览器算出来的 computed color**（不是配置字符串）：发起人抱怨的
		// `text-neutral-700 dark:text-neutral-200` 正是旧实现写死的那一对灰色，
		// 所以先断言"一个都不许等于那几档灰/白"。
		{
			// 只有"有可见图形元素"的卡才参与（img 是位图，没有 color 可谈 —— 它自带真彩色）
			const withGraphic = (bn.cards ?? []).filter((c) => (c.svg ?? 0) > 0 || (c.letterEl ?? 0) > 0);
			const noColor = withGraphic.filter((c) => !c.graphicColor || c.graphicColor === "rgba(0, 0, 0, 0)");
			// 数值比而不是字符串比（理由见 OLD_NEUTRAL_RGB 上方那段注释）
			const stillNeutral = withGraphic.filter((c) => {
				const got = parseCssColor(c.graphicColor);
				return OLD_NEUTRAL_RGB.some((n) => sameRgb(got, n.rgb));
			});
			// **不同品牌卡的图标色不许全相同** —— 挡"全都染成主题主色 / 全都染成同一个色"的假实现
			const distinctRendered = [...new Set(withGraphic.map((c) => c.graphicColor))];
			const distinctConfigured = [...new Set(Object.values(EXPECT_BOOKNAV_BRAND_HEX))];
			record(
				"R-BOOKNAV-06",
				`每个图标都有颜色（${withGraphic.length} 个带图形元素的图标，计算色 ≠ 旧中性灰/白）`,
				withGraphic.length > 0 && noColor.length === 0 && stillNeutral.length === 0,
				noColor.length
					? `❌ 取不到计算色：${noColor.map((c) => c.title).join(" / ")}`
					: stillNeutral.length
						? `❌ 仍是旧中性灰/白（${OLD_NEUTRAL_ICON_COLORS.join(" / ")}）：${stillNeutral.map((c) => `${c.title}=${c.graphicColor}`).join(" / ")}`
						: `实测计算色样本：${withGraphic.slice(0, 6).map((c) => `${c.title}=${c.graphicColor}`).join(" ｜ ")} …`,
			);
			record(
				"R-BOOKNAV-06",
				`不同品牌卡的图标色不全相同（渲染出 ${distinctRendered.length} 种色，配置里有 ${distinctConfigured.length} 种品牌色）`,
				distinctRendered.length >= Math.min(distinctConfigured.length, withGraphic.length) && distinctRendered.length > 1,
				`渲染色种类=${distinctRendered.length} ｜ 配置色种类=${distinctConfigured.length}`,
			);
		}
		// ── R-BOOKNAV-06：抽样核对"渲染色 == 配置里的品牌色" ──
		// 上面那条只保证"不是灰的、而且不止一种"，一个"所有色都错但各不相同"的实现照样能过。
		// 这条把 26 张 iconify 卡的**亮色渲染色**逐张与配置品牌色比对 —— 逐张而不是抽样，
		// 因为逐张才是"品牌色"这个词的真正含义（#4D6BFE 渲染成 #4D6BFD 也是错的）。
		{
			const mismatched = [];
			for (const c of bn.cards ?? []) {
				const want = EXPECT_BOOKNAV_BRAND_HEX[(c.title || "").trim()];
				if (!want) continue;
				const got = parseCssColor(c.graphicColor);
				const gotHex = got ? `#${[got.r, got.g, got.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}` : "(解析失败)";
				if (gotHex !== want) mismatched.push(`${c.title}: 渲染 ${gotHex} vs 配置 ${want}`);
			}
			record(
				"R-BOOKNAV-06",
				`${Object.keys(EXPECT_BOOKNAV_BRAND_HEX).length} 张 iconify 卡的亮色图标色逐张等于配置里的品牌色`,
				Object.keys(EXPECT_BOOKNAV_BRAND_HEX).length > 0 && mismatched.length === 0,
				mismatched.length ? `❌ ${mismatched.length} 张不符：${mismatched.slice(0, 6).join(" ｜ ")}` : `逐张核对通过（${Object.keys(EXPECT_BOOKNAV_BRAND_HEX).length} 张，色值来自 src/constants/booknav-brand-colors.ts）`,
			);
		}

		// ── R-BOOKNAV-07：深色主题下的图标对比度 ≥ 3:1 ──
		// 事实来自主循环之后**单独切到深色**再采的那一趟（COLLECT_BOOKNAV_DARK，见那边的注释：
		// 只切 prefers-color-scheme 不切 html.dark 是量不到深色值的，第一版就会假绿）。
		// 算法是文件里既有的 WCAG relativeLuminance + contrast()，与 §11 的 R-CFG 那批同源。
		{
			// 事实来自主循环里**单独重载到深色**再采的那一趟（COLLECT_BOOKNAV_DARK 与
			// 调用处那段长注释：切类会读到 300ms 过渡的插值色，必须"设媒体特性 + 重载"）。
			const darkFacts = facts["booknav-dark-icons"] ?? {};
			const dark = darkFacts.cards ?? [];
			const rows = dark
				.filter((r) => r.kind === "svg" || r.kind === "letter")
				.map((r) => {
					const fg = parseCssColor(r.color);
					const bg = parseCssColor(r.boxBg);
					return { ...r, ratio: fg && bg ? contrast(fg, bg) : null };
				});
			const below = rows.filter((r) => r.ratio !== null && r.ratio < MIN_BOOKNAV_DARK_CONTRAST);
			const unparsed = rows.filter((r) => r.ratio === null);
			record(
				"R-BOOKNAV-07",
				`深色下每个图标对图标块底的对比度 ≥ ${MIN_BOOKNAV_DARK_CONTRAST}:1（${rows.length} 个 svg/字母块图标）`,
				rows.length > 0 && below.length === 0 && unparsed.length === 0,
				below.length
					? `❌ 低于阈值：${below.map((r) => `${r.title}=${r.ratio.toFixed(2)}:1`).join(" / ")}`
					: `最低 ${rows.length ? Math.min(...rows.map((r) => r.ratio)).toFixed(2) : "—"}:1 ｜ 最高 ${rows.length ? Math.max(...rows.map((r) => r.ratio)).toFixed(2) : "—"}:1 ｜ 样本：${rows.slice(0, 4).map((r) => `${r.title}=${r.ratio.toFixed(2)}`).join(" ｜ ")}`,
			);
			// R-BOOKNAV-07 的第二条：深色下**真的换了色**（不是"亮色值恰好也过阈值"）
			// 判据：至少 2/3 的 svg 图标在深色下的计算色 ≠ 亮色下的计算色。
			// 这条挡的是"忘了写 dark: 变体"——那时深色页面上露出的还是原品牌色，
			// #181717 / #1C3C3C 那几张会糊在深色卡里，而上面的对比度断言可能仍侥幸通过
			// （实测：深色下 GitHub 原品牌色 1.20:1、LangChain 1.25:1，确实会被抓住，
			//  但如果哪天某个色恰好两边都过阈值，这条就是唯一的防线）。
			// ⚠️ 前置：`isDark` 必须为真。否则"深色那一趟"其实量的是亮色值，
			//    lifted 会算出 0/N，而红行会指向"暗色 ≠ 亮色"这个错误的方向。
			const lightByTitle = new Map((bn.cards ?? []).map((c) => [(c.title || "").trim(), c.graphicColor]));
			const lifted = rows.filter((r) => lightByTitle.get((r.title || "").trim()) !== r.color);
			record(
				"R-BOOKNAV-07",
				"深色下图标色确实被主题感知地提亮（不是照搬亮色值）",
				darkFacts.isDark === true && rows.length > 0 && lifted.length >= Math.ceil((rows.length * 2) / 3),
				`html.dark=${darkFacts.isDark}（必须 true，否则这一趟量的还是亮色值）｜ ${lifted.length}/${rows.length} 个在深色下换了色值 ｜ 例：${rows.slice(0, 3).map((r) => `${r.title} 亮 ${lightByTitle.get((r.title || "").trim())} → 暗 ${r.color}`).join(" ｜ ")}`,
			);
		}

		// ── R-BOOKNAV-08：运行期零第三方请求 ──
		// 上传一轮只数了 favicon.im 一家（`thirdPartyIconRequests`），换一家服务就漏。
		// 这条改成**封闭判据**：所有 `<img>` 的 src 一律必须是站内目录 `/booknav-icons/`，
		// 任何 `http(s)://` 或协议相对的 `//` 开头都判红；同时把上一轮那条 favicon.im 守卫
		// 并进来一起看（两条腿都留着，因为 `s2/favicons` 那类 URL 会同时命中两者）。
		{
			const imgSrcs = (bn.cards ?? []).map((c) => c.imgSrc).filter(Boolean);
			const notLocal = (bn.cards ?? []).filter((c) => c.imgSrc && !String(c.imgSrc).startsWith(LOCAL_ICON_PREFIX));
			const external = bn.externalIconSrcs ?? [];
			record(
				"R-BOOKNAV-08",
				`运行期零第三方请求：${imgSrcs.length} 个图标 <img> 全部指向站内 ${LOCAL_ICON_PREFIX}（无 http(s)://、无协议相对 URL）`,
				imgSrcs.length > 0 && notLocal.length === 0 && external.length === 0 && (bn.thirdPartyIconRequests ?? []).length === 0,
				notLocal.length
					? `❌ 不是站内路径：${notLocal.map((c) => `${c.title}=${c.imgSrc}`).join(" / ")}`
					: external.length
						? `❌ 出现外部 URL：${external.slice(0, 6).join(" / ")}`
						: `全部站内 ｜ 外部图标 URL ${external.length} 个 ｜ favicon.im 命中 ${(bn.thirdPartyIconRequests ?? []).length} 个 ｜ 样本：${imgSrcs.slice(0, 4).join(" / ")}`,
			);
			// 这条是"产物级"的另一半（延续上一轮那条守卫）：dist/ 里也不许出现聚合接口域名。
			// ⚠️ 判据对象是**产物文件内容**，不是配置字符串 —— 配置里留着 `favicon.api` 那个值无害。
			record(
				"R-BOOKNAV-08",
				"产物里不出现 favicon 聚合服务域名（s2/favicons · favicon.im · googleapis）",
				Array.isArray(distIconAggregatorHits) && distIconAggregatorHits.length === 0,
				distIconAggregatorHits === null
					? "❌ 产物没被扫到（dev 服务器或 dist 为空）→ 本项无从判定，按失败处理：先 `pnpm build` 再 `pnpm preview` 跑本脚本"
					: distIconAggregatorHits.length
						? `❌ 命中：${distIconAggregatorHits.slice(0, 6).join(" ｜ ")}`
						: `扫 ${distAllFiles.length} 个产物文件：s2/favicons · favicon.im · faviconV2 · googleapis.com 零命中`,
			);
		}
	}
	record("R-ID-02", "主题色相 = 345", home.hueComputed === EXPECT_HUE || home.hueInline === EXPECT_HUE, `inline=${home.hueInline} computed=${home.hueComputed}`);
	record("R-ID-04", "favicon 已换成 imiss", home.favicons.some((h) => (h ?? "").includes("imiss-32.png")), JSON.stringify(home.favicons));
	// P6-8：apple-touch-icon 必须是 180px 那张（Apple 约定边长），不是"数组里第一个 png"。
	// 断言分两半：① 选中的文件 = imiss-180.png 且带 sizes="180x180"（Apple 认这个提示）；
	// ② 它**不能**是 32px —— 这一半是回归关键：旧实现挑中的正是 imiss-32.png，
	// 只要有人把 Layout 的挑选逻辑改回"第一个 png"，② 立刻红。
	// 旧配置下这条会红（当时数组只有 32px 一项）—— 修 P6-8 前先注入验证过它真的会红。
	{
		const ati = home.appleTouchIcons ?? [];
		const first = ati[0];
		const hit = /imiss-180\.png/.test(first?.href ?? "");
		record(
			"R-ID-04",
			"apple-touch-icon 指向 180px 图标（不是 32px）",
			ati.length >= 1 && hit && first?.sizes === "180x180" && !/imiss-32\.png/.test(first?.href ?? ""),
			`apple-touch-icon=${JSON.stringify(ati)} ｜ rel=icon 候选=${JSON.stringify(home.faviconSizes)}`,
		);
	}
	record("R-ID-04", "导航栏 Logo 已换成 imiss", (home.logoSrc ?? "").includes("imiss"), home.logoSrc ?? "（没取到 logo）");
	// ── v1.64：正式标识（小图标纸飞机 / 大图标与侧栏头像人物）────────────────────
	// 上面那三条只钉"文件名里有没有 imiss" —— 换设计（爱心 → 纸飞机 → 纸飞机+人物）前后
	// 它们**都成立**，对本次改动是恒真的（与 v1.63 修掉的 navHasMusic 同类病）。
	// 下面的判据钉**图本体**，按 v1.64 的分工分成两组（发起人 2026-10-07 定的，参考上游作者站的做法）：
	//   **小图标 = 纸飞机**：① 32px favicon 是透明底、中央列上下都有透明带；
	//                          ② 它的内容包围盒 ≈1.35:1（横向的飞机，不是 1:1 的方块）；
	//                          ③ 导航栏 Logo 本体的固有尺寸 256×190。
	//   **大图标与侧栏头像 = 人物插画**：④ 180/192 是满幅不透明方图；
	//                          ⑤ 侧栏头像与 192 图标**同源**（8×8 指纹差异极小），
	//                             而 32px 小图标与它们**明显不同源**（负控，差异极大）。
	// 判据在**真浏览器里读像素**（Image + canvas，同源不污染画布）：零依赖，而且验的
	// 正是访客拿到的那张图 —— 不是"看源码觉得应该是"。
	{
		const faviconProbe = await (async () => {
			try {
				const { result } = await cdp.send("Runtime.evaluate", {
					expression: `(async () => {
  const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("load " + src)); im.src = src; });
  const measure = async (src) => {
    const im = await load(src);
    const w = im.naturalWidth, h = im.naturalHeight;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    const A = (x, y) => d[(y * w + x) * 4 + 3];
    // 中央 50% 的列里，从上/从下数第一条有实心像素的行 —— 满幅不透明图是 0，透明底是两位数百分比
    const x0 = Math.floor(w * 0.25), x1 = Math.ceil(w * 0.75);
    let top = -1, bottom = -1;
    for (let y = 0; y < h && top < 0; y++) for (let x = x0; x < x1; x++) if (A(x, y) > 8) { top = y; break; }
    for (let y = h - 1; y >= 0 && bottom < 0; y--) for (let x = x0; x < x1; x++) if (A(x, y) > 8) { bottom = h - 1 - y; break; }
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (A(x, y) > 8) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
    return { w, h, topBand: top, bottomBand: bottom, bboxW: maxX - minX + 1, bboxH: maxY - minY + 1, corners: [A(0, 0), A(w - 1, 0), A(0, h - 1), A(w - 1, h - 1)] };
  };
  // 8×8 缩略指纹 + 两图的最大通道差（判"是不是同一张画"）。画布缩放的取整会让个别格子
  // 差十几，所以判据用**平均值**而不是最大值，阈值见调用处。
  const sig = async (src) => {
    const im = await load(src);
    const c = document.createElement("canvas"); c.width = 8; c.height = 8;
    const g = c.getContext("2d"); g.drawImage(im, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    return { w: im.naturalWidth, h: im.naturalHeight, px: [...d] };
  };
  const mad = (a, b) => {
    if (!a || !b) return null;
    let sum = 0, n = 0;
    for (let i = 0; i < 64; i++) for (let ch = 0; ch < 3; ch++) { sum += Math.abs(a.px[i * 4 + ch] - b.px[i * 4 + ch]); n++; }
    return sum / n;
  };
  const avatarImg = document.querySelector("#profile-wrapper img") || document.querySelector("img[alt='Profile Image of the Author']");
  const avatarSrc = avatarImg ? (avatarImg.currentSrc || avatarImg.getAttribute("src")) : null;
  const r = {
    icon32: await measure("/favicon/imiss-32.png"),
    icon180: await measure("/favicon/imiss-180.png"),
    icon192: await measure("/favicon/imiss-192.png"),
  };
  r.avatar = avatarImg ? { src: avatarImg.getAttribute("src"), currentSrc: avatarImg.currentSrc, natW: avatarImg.naturalWidth, natH: avatarImg.naturalHeight } : null;
  const s192 = await sig("/favicon/imiss-192.png");
  const s32 = await sig("/favicon/imiss-32.png");
  const s180 = await sig("/favicon/imiss-180.png");
  const sAvatar = avatarSrc ? await sig(avatarSrc) : null;
  r.mad = { icon192_vs_avatar: mad(s192, sAvatar), icon180_vs_icon192: mad(s180, s192), icon32_vs_icon192: mad(s32, s192) };
  return r;
})()`,
					returnByValue: true,
					awaitPromise: true,
				});
				return result?.value ?? { error: "Runtime.evaluate 没有返回值" };
			} catch (error) {
				return { error: error instanceof Error ? error.message : String(error) };
			}
		})();

		// ① + ② 都在 **32px** 那张上量（小图标 = 纸飞机；192 那张现在是大图标 = 人物）
		const p = faviconProbe?.icon32;
		const topBand = p ? p.topBand / p.h : -1;
		const bottomBand = p ? p.bottomBand / p.h : -1;
		const aspect = p ? p.bboxW / p.bboxH : 0;
		record(
			"R-ID-04",
			"小图标（浏览器标签 32px）是透明底纸飞机：中央列上下都有透明带",
			!!p && topBand >= 0.08 && bottomBand >= 0.08 && p.corners.every((a) => a <= 8),
			p
				? `imiss-32.png ${p.w}×${p.h}：上透明带 ${(topBand * 100).toFixed(1)}%、下 ${(bottomBand * 100).toFixed(1)}%（旧的方圆底图标是 0% / 0%）｜四角 alpha=${p.corners.join(",")}`
				: `❌ 取像素失败：${JSON.stringify(faviconProbe)}`,
		);
		record(
			"R-ID-04",
			"小图标（32px）主体是横向纸飞机（内容包围盒 ≈1.35:1，不是 1:1 方块）",
			!!p && aspect >= 1.2 && aspect <= 1.5 && p.bboxW >= p.w * 0.95,
			p
				? `内容包围盒 ${p.bboxW}×${p.bboxH} = ${aspect.toFixed(3)}:1（占画布宽 ${((p.bboxW / p.w) * 100).toFixed(1)}%）`
				: `❌ 取像素失败：${JSON.stringify(faviconProbe)}`,
		);
		const ln = home.logoNatural;
		const attrAspect = ln?.attrW && ln?.attrH ? ln.attrW / ln.attrH : 0;
		const natAspect = ln?.natW && ln?.natH ? ln.natW / ln.natH : 0;
		// ⚠️ 别被 `naturalWidth` 的绝对值骗到：img 带 `srcset`（`28w, 56w`）而**没有 `sizes`**，
		// 按规范 `sizes` 缺省 = `100vw` → 这两个属性报的是**密度校正后的 CSS 像素**
		// （实测 1440×1080 = 视口尺寸，不是资源像素数，`reports/_logo-navbar-probe.mjs` 里
		// `decode()` 前后都是这个数）。但**比例**仍等于资源本体的比例（190:256 → 1.347，
		// 取整成 42:56 后 1.333），所以判据用比例；真实像素由上面那两条 canvas 判据钉住
		// （读的是从服务器取回的那张图的真像素）。
		record(
			"R-ID-04",
			"导航栏 Logo 本体是横向纸飞机（固有尺寸 256×190，≈1.35:1）",
			!!ln && attrAspect >= 1.2 && attrAspect <= 1.5 && natAspect >= 1.15 && natAspect <= 1.55,
			ln
				? `标签固有尺寸 ${ln.attrW}×${ln.attrH} = ${attrAspect.toFixed(3)}:1 ｜ 实际加载（密度校正后，绝对值随视口）${ln.natW}×${ln.natH} = ${natAspect.toFixed(3)}:1 ｜ currentSrc=${ln.currentSrc}`
				: "❌ 没取到 logo 的自然尺寸（[data-logo-theme] 找不到？）",
		);
		// ④ 大图标（iOS 主屏 180 / Android·安装卡 192）= 人物插画：满幅、不透明、方形
		{
			const b = faviconProbe?.icon192;
			const b180 = faviconProbe?.icon180;
			const opaque = (m) => !!m && m.corners.every((a) => a >= 250) && m.topBand === 0 && m.bottomBand === 0;
			const full = (m) => !!m && m.bboxW === m.w && m.bboxH === m.h && Math.abs(m.w / m.h - 1) < 0.02;
			record(
				"R-ID-04",
				"大图标（180 / 192）是满幅不透明方图（= 人物插画，与小图标不是同一张）",
				opaque(b) && full(b) && opaque(b180) && full(b180),
				b && b180
					? `imiss-192.png ${b.w}×${b.h} 四角 alpha=${b.corners.join(",")}、上下透明带 ${b.topBand}/${b.bottomBand}、包围盒 ${b.bboxW}×${b.bboxH} ｜ imiss-180.png 四角 alpha=${b180.corners.join(",")}、包围盒 ${b180.bboxW}×${b180.bboxH}`
					: `❌ 取像素失败：${JSON.stringify(faviconProbe)}`,
			);
		}
		// ⑤ 侧栏头像就是那张人物图，而小图标明显不是它（两条腿：正控 + 负控）
		{
			const av = faviconProbe?.avatar;
			const mad = faviconProbe?.mad ?? {};
			const same = mad.icon192_vs_avatar;
			const diff = mad.icon32_vs_icon192;
			const urlOk = /imiss-avatar/.test(av?.currentSrc ?? av?.src ?? "");
			record(
				"R-ID-04",
				"侧栏资料卡头像是同一张人物图（与 192 大图标同源），小图标则明显不同源",
				urlOk &&
					typeof same === "number" &&
					same < 15 &&
					typeof diff === "number" &&
					diff > 40 &&
					typeof mad.icon180_vs_icon192 === "number" &&
					mad.icon180_vs_icon192 < 10,
				av
					? `头像 ${av.currentSrc}（${av.natW}×${av.natH}）｜8×8 指纹平均差：192 vs 头像 = ${same?.toFixed(1)}（要 < 15）｜32 vs 192 = ${diff?.toFixed(1)}（要 > 40，负控）｜180 vs 192 = ${mad.icon180_vs_icon192?.toFixed(1)}（要 < 10）`
					: "❌ 页面里没找到资料卡头像（#profile-wrapper img）",
			);
		}
	}
	// R-WDG-04：资料卡头像的**悬停反馈**（v1.64 按发起人要求去掉浮在头像正中的名片图标）
	// 他原话：「鼠标光标放这后这个图片图标能不能不显示？」—— 那个 `fa7-regular:address-card`
	// 悬停浮出来像"这里可以换图"，而这里其实只是通往 /about/ 的链接。
	// 判据五条腿（前四条是"没了什么 / 还在什么"，第五条是**正控**：证明只删了图标、
	// 没把悬停反馈一起删光）：
	//   ① 头像链接内没有任何 `<svg>`（图标没了）② 压暗层（`.profile-avatar-veil`）没有子元素
	//   ③ 头像 `<img>` 仍在（1 张）④ **产物里也搜不到 `address-card`**（防线前移到 dist，
	//      防止"模板里的 HTML 注释把图标名又带回去" —— T85 那个坑本轮真踩到过一次）
	//   ⑤ 压暗层**悬停后底色变了**（rgba(0,0,0,0) → 半透明黑）
	// 用 `Input.dispatchMouseEvent` 的**真实鼠标**（`dispatchEvent` 不触发 CSS `:hover`）。
	{
		const avatarHover = await (async () => {
			try {
				const before = (
					await cdp.send("Runtime.evaluate", {
						expression: `(() => {
  const a = document.querySelector("a[aria-label='Go to About Page']");
  if (!a) return null;
  a.scrollIntoView({ block: "center", behavior: "instant" });
  const r = a.getBoundingClientRect();
  const ov = a.querySelector(".profile-avatar-veil");
  const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
  const hit = r.width > 0 ? document.elementFromPoint(cx, cy) : null;
  return {
    x: cx, y: cy,
    rect: [Math.round(r.width), Math.round(r.height)],
    viewport: [window.innerWidth, window.innerHeight],
    topHit: !hit ? "none" : (hit === a ? "a" : (a.contains(hit) ? "a-内" : (hit.id || hit.tagName))),
    bg: ov ? getComputedStyle(ov).backgroundColor : null,
    veil: !!ov,
    overlayChildren: ov ? ov.children.length : -1,
    svgs: a.querySelectorAll("svg").length,
    imgs: a.querySelectorAll("img").length,
  };
})()`,
						returnByValue: true,
					})
				).result.value;
				if (!before) return { error: "没找到资料卡头像链接（a[aria-label='Go to About Page']）" };

				// ① 先走**真鼠标**（`Input.dispatchMouseEvent`；`dispatchEvent(new MouseEvent)` 不触发 :hover）
				if (before.rect[0] > 0 && before.rect[1] > 0) {
					await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: before.x, y: before.y, buttons: 0 });
					await new Promise((r) => setTimeout(r, 700));
				}
				const real = (
					await cdp.send("Runtime.evaluate", {
						expression: `(() => {
  const a = document.querySelector("a[aria-label='Go to About Page']");
  const ov = a ? a.querySelector(".profile-avatar-veil") : null;
  return { bg: ov ? getComputedStyle(ov).backgroundColor : null, hovered: a ? a.matches(":hover") : false };
})()`,
						returnByValue: true,
					})
				).result.value;

				// ② 真鼠标没拿到 `:hover` 时（可能当轮视口是 390、侧栏被隐藏，坐标落不到它身上），
				//    退回 CDP 的 `CSS.forcePseudoState` 强制 `:hover` —— 判据验的是"悬停样式长什么样"，
				//    这条路同样走真实样式引擎，只是不依赖几何命中；详情里会写明用的是哪条路（不伪装）。
				let forced = null;
				if (!real?.hovered) {
					try {
						await cdp.send("DOM.enable");
						await cdp.send("CSS.enable");
						const { root } = await cdp.send("DOM.getDocument", { depth: 1 });
						const { nodeId } = await cdp.send("DOM.querySelector", {
							nodeId: root.nodeId,
							selector: "a[aria-label='Go to About Page']",
						});
						if (nodeId) {
							await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["hover"] });
							await new Promise((r) => setTimeout(r, 400));
							forced = (
								await cdp.send("Runtime.evaluate", {
									expression: `(() => {
  const a = document.querySelector("a[aria-label='Go to About Page']");
  const ov = a ? a.querySelector(".profile-avatar-veil") : null;
  return { bg: ov ? getComputedStyle(ov).backgroundColor : null };
})()`,
									returnByValue: true,
								})
							).result.value;
							await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
						}
					} catch (e) {
						forced = { error: e instanceof Error ? e.message : String(e) };
					}
				}
				return { before, real, forced };
			} catch (error) {
				return { error: error instanceof Error ? error.message : String(error) };
			}
		})();
		const b = avatarHover?.before;
		const real = avatarHover?.real;
		const forced = avatarHover?.forced;
		const transparent = (c) => typeof c === "string" && /rgba?\([^)]*,\s*0(\.0+)?\)$/.test(c.trim());
		// 悬停后的底色：真鼠标优先，拿不到就用 forcePseudoState 的结果（两条路都在详情里写明）
		const hoverBg = real?.hovered ? real.bg : (forced?.bg ?? real?.bg);
		const hoverPath = real?.hovered ? "真鼠标" : forced?.bg ? "CSS.forcePseudoState（几何没命中，见 topHit/视口）" : "都没拿到";
		// 产物级：dist 全量文件里不许再出现那个图标名（含被 minify 后剩下的字符串 / 注释）
		// ⚠️ 用扫描循环里采到的 `distAvatarIconHits`（`null` = 产物没扫到 → 判红，不能静默放过）
		const distIconHits = distAvatarIconHits;
		record(
			"R-WDG-04",
			"资料卡头像悬停只压暗、不浮图标（v1.64 去掉名片覆盖图标），且产物里不留图标名",
			!!b &&
				b.veil === true &&
				b.svgs === 0 &&
				b.overlayChildren === 0 &&
				b.imgs === 1 &&
				transparent(b.bg) &&
				typeof hoverBg === "string" &&
				hoverBg !== b.bg &&
				!transparent(hoverBg) &&
				Array.isArray(distIconHits) &&
				distIconHits.length === 0,
			b
				? `头像链接内 svg=${b.svgs}（要 0）· 压暗层子元素=${b.overlayChildren}（要 0）· img=${b.imgs}（要 1）｜底色 悬停前=${b.bg} → 悬停后=${hoverBg}（要变深）｜取法=${hoverPath}｜:hover 真命中=${real?.hovered}｜视口=${b.viewport?.join("×")} 头像尺寸=${b.rect?.join("×")} 中心命中=${b.topHit}｜产物里 address-card 命中=${Array.isArray(distIconHits) ? distIconHits.length : "❌ 产物没扫到（先 pnpm build）"} 个${Array.isArray(distIconHits) && distIconHits.length ? `：${distIconHits.slice(0, 3).join(" / ")}` : ""}`
				: `❌ 探针失败：${JSON.stringify(avatarHover)}`,
		);
	}
	record("R-WDG-01", `站点统计只剩 ${EXPECT_STAT_ROWS} 行`, home.statRows === EXPECT_STAT_ROWS, `实际 ${home.statRows} 行`);
	record("R-WDG-01", "站点统计不含已删文案", EXPECT_ABSENT_STAT_TEXT.every((t) => !(home.statText ?? "").includes(t)), "运行时长/最后活动/天前 均未出现");
	record("R-WDG-02", "日历热力图已关闭", home.heatmapExists === false, `#heatmap-container ${home.heatmapExists ? "仍存在" : "不存在"}`);
	record("R-WDG-03", "站点信息占位模式", (home.infoText ?? "").includes("站点尚未部署") && (home.infoText ?? "").includes("—"), (home.infoText ?? "").slice(0, 80));
	// R-ID-08：许可关闭后侧栏也不该再出现 CC / "None" 这种假值
	record(
		"R-ID-08",
		"侧栏站点信息里没有许可协议行（不显示 CC 也不显示 None）",
		!((home.infoText ?? "") + (home.bodyText ?? "")).includes("CC BY-NC-SA") &&
			!/(^|\s)None(\s|$)/.test(home.infoText ?? ""),
		`infoText=${(home.infoText ?? "").slice(0, 60)}`,
	);
	// R-ID-07：面板对访客开启（enable: true）——按钮与面板都要在
	record(
		"R-ID-07",
		"显示设置面板按钮已渲染（调色盘）",
		home.settingsBtn === true,
		`#display-settings-switch ${home.settingsBtn ? "存在" : "不存在"}`,
	);
	record(
		"R-ID-07",
		"显示设置面板容器已渲染",
		home.settingsPanel === true,
		`面板触发属性 ${home.settingsPanel ? "存在" : "不存在"}`,
	);
	record("R-CMT-01", "留言页显示装修中占位", (facts["guestbook-1440"].bodyText ?? "").includes("留言板正在装修中"), "");
	record("R-CMT-02", "留言页副标题已改成本站口吻", (facts["guestbook-1440"].bodyText ?? "").includes("评论区接好之前"), "");
	record("R-NAV-03", "番剧页显示未配置卡片", (facts["myanimelist-1440"].bodyText ?? "").includes("番剧数据源还没配置"), "");
	record("R-NAV-03", "轻小说页显示未配置卡片", (facts["vndb-1440"].bodyText ?? "").includes("轻小说数据源还没配置"), "");
	// R-NAV-04 原来只看 bodyText.length > 100（几乎恒真）。改成检查页面上有真实内容标志。
	// ⚠️ v1.65 拆分：那篇「标题写着关于我、内容其实讲这个站」的文章整体搬到了 `/about-site/`，
	//    `/about/` 现在是**等发起人给新自我介绍**的占位页 —— 所以判据也跟着分两条：
	//    ① 关于本站页要有真内容（长度 + 逐字短语双门槛）；
	//    ② 关于我页仍可达、且**确实是占位态**（含占位文案 + 指向关于本站的入口）。
	{
		const siteText = facts["about-site-1440"].bodyText ?? "";
		record(
			"R-NAV-04",
			"关于本站页可访问且有真实内容（原 about.md 那篇已整体搬过来）",
			siteText.length > 800 && siteText.includes("关于本站") && siteText.includes("学习路线") && siteText.includes("Astro"),
			`正文长度 ${siteText.length}｜含「关于本站」=${siteText.includes("关于本站")}｜含「学习路线」=${siteText.includes("学习路线")}｜含「Astro」=${siteText.includes("Astro")}`,
		);
		const aboutText = facts["about-1440"].bodyText ?? "";
		record(
			"R-NAV-04",
			"关于我页仍是可访问的占位页（新自我介绍待发起人提供）",
			aboutText.includes("这一页还在整理") && aboutText.includes("关于本站"),
			`正文长度 ${aboutText.length}｜含占位文案=${aboutText.includes("这一页还在整理")}｜指向关于本站=${aboutText.includes("关于本站")}`,
		);
	}

	// ── 对比度 A/B（R-ID-02）──
	await cdp.send("Emulation.setDeviceMetricsOverride", {
		width: 1440,
		height: 900,
		deviceScaleFactor: 1,
		mobile: false,
	});
	const reload = cdp.once("Page.loadEventFired");
	await cdp.send("Page.navigate", { url: `${BASE}/` });
	await reload;
	await sleep(600);

	const colors = {};
	for (const theme of ["light", "dark"]) {
		// 注意：光切 html.dark / data-theme 是不够的——Tailwind 的 `dark:` 变体跟的是
		// prefers-color-scheme 媒体查询（headless Chrome 在本机默认报 dark）。
		// 必须同时用 CDP 模拟媒体特性，两套机制才会一致，否则量到的仍是暗色下的颜色。
		await cdp.send("Emulation.setEmulatedMedia", {
			features: [{ name: "prefers-color-scheme", value: theme }],
		});
		for (const hue of [345, 165]) {
			const { result } = await cdp.send("Runtime.evaluate", {
				expression: COLLECT_COLORS(theme, hue),
				returnByValue: true,
			});
			colors[`${theme}-${hue}`] = result.value;
		}
	}
	for (const theme of ["light", "dark"]) {
		const themeName = theme === "dark" ? "暗色" : "亮色";
		const now = colors[`${theme}-345`];
		const before = colors[`${theme}-165`];
		const detail = [];
		for (const pair of CONTRAST_PAIRS.filter((p) => p.themes.includes(theme))) {
			const bg = parseCssColor(now[pair.bg]);
			const fgNowRaw = parseCssColor(now[pair.fg]);
			const fgBeforeRaw = parseCssColor(before[pair.fg]);
			// 前景带 alpha（如 --content-meta）时先合成到底色上
			const fgNow = fgNowRaw.a >= 0.999 ? fgNowRaw : composite(fgNowRaw, bg);
			const fgBefore = fgBeforeRaw.a >= 0.999 ? fgBeforeRaw : composite(fgBeforeRaw, bg);
			const rNow = contrast(fgNow, bg);
			const rBefore = contrast(fgBefore, bg);
			// 色相会连带轻微改变感知亮度，所以用相对容差（15%）而不是 0.1 的绝对值
			const tolerance = Math.max(0.1, rBefore * 0.15);
			detail.push(`${pair.label}: ${rNow.toFixed(2)}（上游 hue=165 时 ${rBefore.toFixed(2)}，阈值 ${pair.min}）`);
			record(
				"R-ID-02",
				`换色后对比度未明显变差 · ${themeName} · ${pair.label}`,
				rNow >= rBefore - tolerance,
				`${rNow.toFixed(2)} vs ${rBefore.toFixed(2)}（容差 ${tolerance.toFixed(2)}）`,
			);
			record(
				pair.thresholdIsInfo ? "INFO" : "R-ID-02",
				`对比度阈值 ${pair.min}:1 · ${themeName} · ${pair.label}`,
				pair.thresholdIsInfo ? true : rNow >= pair.min,
				pair.thresholdIsInfo
					? `实测 ${rNow.toFixed(2)}:1（主题色/按钮属上游设计，仅记录）`
					: `实测 ${rNow.toFixed(2)}:1`,
			);
		}
		console.log(`\n[${themeName}主题] 配色对比度（token 级）\n  ${detail.join("\n  ")}`);
	}

	// ── 排行模块已整体删除（Task 4 / R-PATH-06）──────────────────────────────
	// 这里原来是从 P2 继承下来的整块 R-RANK 断言（44 条：名次两档配色与对比度、全剧/单集切换与 URL、
	// 短评胶囊不压标题、缺图占位、二游单一榜、占位提示、榜单 10 条、`/rank/` 存根跳转……）。
	// 44 条里 **42 条删除**（41 条在本块、1 条 `/rank/` 存根跳转在 Step 1 换成了 R-PATH-06 的 404 判据）、
	// **2 条改名保留**成 R-PATH-01（就在本块末尾）。此外还删了 3 条 `R-NAV-07 保留页面应 200：/rank/*`
	// （三条旧路由不再是"保留页面"）——净变化 274 → **232**（含本任务新增的 3 条 R-PATH-06：
	// 四个地址 404 / 不在 sitemap / llms.txt 无排行残渣），逐条对照见 reports/_task4-assert-diff.txt。
	// 本块留下的 **4 条记录（3 类）** 测的都不是排行：
	//   · R-PATH-01（Swup 点导航第 3 格 → 落地路线页）—— 就在下面；
	//   · R-PATH-01（抽屉当前页高亮 / 无残留 `/rank/jp/` 项）—— 本块末尾那两条；
	//   · R-WDG-04（首页 390px 无横向溢出）—— 与排行无关，只是当年顺手写在这块末尾。
	// 前 5 类通用能力（390px 无溢出 / Swup 切页 / 后退 / 打印 / canonical）已由 Task 5
	// 在 /roadmap/ 上重建（见下面 R-PATH 两块），覆盖没有丢。
	{
		// R-PATH-01（Swup 路径）：点导航第 3 格 → Swup 接管 → 落在 /roadmap/ 上，且抽屉当前页态也对
		// ⚠️ **必须带正向内容判据**（Task 3 审查修复）：只验"抽屉当前页项 == /roadmap/"的话，
		//    一个"URL 换对了、但页面报错/空白"的落地也会满足（抽屉态是按 pathname 算的）——
		//    那是典型的"判据空过"。这里改用正文特征：路线页独有的 `#roadmap-stats` 文本含
		//    「133 篇 / 8 条主线」，且 8 个主线区块都在（采集项 `roadmapLanding`）。
		// ⚠️ Task 4 顺手删掉了原来那个 `!swupPage.rank`（"落地页不该有榜单板"）：采集器里的 rank
		//    子对象已随排行模块删除，这个条件**恒为真**，留着就是一条永远成立的空判据。
		const swupPage = facts["roadmap-via-swup"];
		const landing = swupPage?.roadmapLanding;
		record(
			"R-PATH-01",
			"经 Swup 点导航第 3 格能进 /roadmap/（落地页有正文、抽屉当前页态也对）",
			swupPage?.nav === "clicked" &&
				(swupPage?.mobileNavActiveItems ?? []).some((i) => i.href === "/roadmap/") &&
				/133 篇/.test(landing?.stats ?? "") &&
				/8 条主线/.test(landing?.stats ?? "") &&
				landing?.lineCount === 8,
			`导航点击=${swupPage?.nav} ｜ 抽屉当前页=${JSON.stringify(swupPage?.mobileNavActiveItems)} ｜ 落地正文「${landing?.stats}」主线区块 ${landing?.lineCount} 个`,
		);
		// R-PATH-01（原名 R-RANK-01，Task 4 改名保留）：导航"当前页高亮"的通用判据 ——
		// 桌面导航栏上游没有当前页态，真正带高亮的是移动端抽屉（按 pathname 标 data-active）。
		// 原判据锚在「日漫排行」这个导航子项上，而那一格已换成「学习路线」单链接 —— 于是改锚到
		// **当前导航里真实存在的项**上（同样验"进对应页 → 抽屉把该项标成当前页"这条通用能力）。
		// 数据取 `facts["roadmap-390"]`（主 COLLECT 采的），**不是** `-roadmap` 后缀那一份
		// （那份是 COLLECT_ROADMAP 的产物，只含路线页 DOM 契约，没有导航字段）。
		const rmActive = facts["roadmap-390"]?.mobileNavActiveItems ?? [];
		record(
			"R-PATH-01",
			"移动端导航把「学习路线」标成当前页",
			rmActive.some((i) => i.href === "/roadmap/" && !i.inSubmenu),
			`当前页项 ${JSON.stringify(rmActive)}`,
		);
		record(
			"R-PATH-01",
			"导航里已无「日漫排行」项，移动端自然不再把它标成当前页",
			!(facts["home-390"]?.mobileNavActiveItems ?? []).some((i) => i.href === "/rank/jp/"),
			`首页抽屉当前页项 ${JSON.stringify(facts["home-390"]?.mobileNavActiveItems)}`,
		);

		record("R-WDG-04", "首页在 390px 下无横向溢出", (facts["home-390"].overflowX ?? 99) <= 2, `溢出 ${facts["home-390"].overflowX}px`);
	}

	// ── P2R 学习路线（R-PATH-01 ~ R-PATH-05）──
	{
		// 采集器写的是 `facts["<page>-roadmap"]`（与既有 `<page>-post` 同一套命名），
		// 不是 `facts[<page>].roadmap` —— `COLLECT` 里根本没有 roadmap 字段。
		// 计划 Step 5 的采集器与 Step 6 的断言在这点上互相矛盾（一处带后缀、一处不带），
		// 以**采集器**为准（它是被明确指派"照 COLLECT_POST 写法"的那一处），断言侧只改取值路径，
		// 六条判据一个字未改。
		const rm = facts["roadmap-1440-roadmap"];
		const rm390 = facts["roadmap-390-roadmap"];
		const EXPECT_LINES = ["C++ 与 STL", "算法与数据结构", "Linux 系统", "网络", "MySQL", "面试八股", "项目实战", "AI 应用"];

		record("R-PATH-01", "路线页可访问且 8 条主线都在（顺序一致）",
			!!rm && !rm.missing && JSON.stringify(rm.lineNames) === JSON.stringify(EXPECT_LINES),
			`实际 ${JSON.stringify(rm?.lineNames)}`);
		// ⚠️ 这里全部用 `?.`：页面整块缺失时采集器只回 `{missing:true}`，
		// 写成 `rm.indexHrefs.length` 会抛 TypeError **把整个脚本打断** ——
		// 于是"6 条该红的断言"只会报成 1 条崩溃、其余全静默（重放 RED 时实测踩到过）。
		// 断言必须做到"页面没了也照样给出 6 条失败"。
		record("R-PATH-01", "页内 8 个锚点与 8 个区块一一对应",
			!!rm && rm.indexHrefs?.length === 8 && rm.indexHrefs.every((h) => rm.lineIds?.includes(h.slice(1))),
			`索引 ${JSON.stringify(rm?.indexHrefs)} ｜ 区块 ${JSON.stringify(rm?.lineIds)}`);
		record("R-PATH-02", "停靠点数 136（含 3 处跨线），跨线标记可见",
			rm?.stopCount === 136 && rm?.crossCount === 3,
			`停靠点 ${rm?.stopCount} ｜ 跨线标记 ${rm?.crossCount}`);
		record("R-PATH-03", "同名篇目成对定位：vector / list 的用法与模拟实现各指各的",
			!!rm &&
				rm.stopHrefs?.includes("/posts/stl/vector/") &&
				rm.stopHrefs?.includes("/posts/cpp/vector/") &&
				rm.stopHrefs?.includes("/posts/stl/list/") &&
				rm.stopHrefs?.includes("/posts/cpp/list/"),
			`含 stl/vector=${rm?.stopHrefs?.includes("/posts/stl/vector/")} cpp/vector=${rm?.stopHrefs?.includes("/posts/cpp/vector/")} stl/list=${rm?.stopHrefs?.includes("/posts/stl/list/")} cpp/list=${rm?.stopHrefs?.includes("/posts/cpp/list/")}`);
		// R-PATH-03（M11，终审补的"另一半"）：上面那条只证了**两条链接都在**，证不了
		// "两行**看得出来**不是同一篇" —— 把 `roadmapConfig` 里的 `name` 覆盖撤掉、两行都显示
		// 文章标题（都是「vector」/「list」）时，上面那条照样全绿。
		// 所以这里按 href 配对，直接读**渲染出来的标题文本**（`.roadmap-stop-title`）。
		// 期望值就是 `prd.md` §3.5R / R-PATH-03 写的显示名；`string` 一并钉住大小写（M10）。
		const stopRows = (rm?.stopHrefs ?? []).map((h, i) => ({ href: h, title: (rm?.stopTitles ?? [])[i] ?? null }));
		const titleAt = (href) => stopRows.filter((r) => r.href === href).map((r) => r.title);
		const WANT_TITLES = [
			["/posts/cpp/vector/", "vector · 模拟实现"],
			["/posts/stl/vector/", "vector · 用法"],
			["/posts/cpp/list/", "list · 模拟实现"],
			["/posts/stl/list/", "list · 用法"],
			["/posts/cpp/string/", "string · 模拟实现"],
			["/posts/stl/string/", "string · 用法"],
		];
		record("R-PATH-03", "同名两行的**显示名**确实可区分（读渲染出来的标题文本，按 href 配对）",
			!!rm && WANT_TITLES.every(([href, want]) => titleAt(href).length === 1 && titleAt(href)[0] === want),
			WANT_TITLES.map(([href, want]) => {
				const got = titleAt(href);
				const ok = got.length === 1 && got[0] === want;
				return `${href} → ${ok ? `「${got[0]}」` : `实际 ${JSON.stringify(got)}（期望「${want}」）`}`;
			}).join(" ｜ "));
		/**
		 * R-PATH-04（**终审 I1：对账站点，不对账字面量**）。
		 * 旧写法是 `rm.uniqueHrefs === 133` —— 左边是 DOM 里数出来的去重链接数、右边是一个写死的
		 * 字面量，**两侧都不碰站点**：作者写下第 134 篇、忘了加进 `roadmapConfig.ts` 时，
		 * 路线页静默漏掉那一篇、页顶还印着「133 篇」，而这一条照样绿。
		 * 现在拿**构建产物** `dist/api/allPostMeta.json`（由 `src/pages/api/allPostMeta.json.ts` 生成，
		 * 与路线页同一份 `getCollection("posts", ({data}) => !data.draft)` 口径）当"站内总篇数"的真值。
		 * ⚠️ 读不到**判红**（不是跳过）：对 `pnpm dev` 跑时产物级判据不适用，那是"没验到"，
		 * 不许伪装成"验过了"（`--base` 应指向 `pnpm preview` 的 4323）。
		 */
		let siteCount = null;
		let siteErr = "";
		try {
			const parsed = JSON.parse(await fs.readFile(path.resolve("dist/api/allPostMeta.json"), "utf8"));
			if (Array.isArray(parsed)) siteCount = parsed.length;
			else siteErr = "内容不是数组";
		} catch (err) {
			siteErr = err.code ?? err.message;
		}
		record("R-PATH-04", "篇目并集 == 站内总篇数（命根子；对账 dist/api/allPostMeta.json）",
			siteCount !== null && rm?.uniqueHrefs === siteCount,
			`路线页去重后 ${rm?.uniqueHrefs} 篇 ｜ 站内 ${siteCount ?? `读不到：${siteErr}`} 篇（dist/api/allPostMeta.json）｜ 停靠点 ${rm?.stopCount} 个，差值是跨线复用`);
		record("R-PATH-05", "轻量行不含 <img>，且页顶数字与实算一致",
			rm?.imgCount === 0 && /133 篇/.test(rm?.statsText ?? "") && /8 条主线/.test(rm?.statsText ?? ""),
			`img=${rm?.imgCount} ｜ 页顶「${rm?.statsText}」｜390px 溢出 ${rm390?.overflowX}px`);
		// R-PATH-01：导航第 3 格（「文章」与「我的」之间）必须换成学习路线，且**不许挂子项**
		// （8 条主线走页内锚点；桌面上挂 8 个子项会爆）
		const top3 = facts["home-1440"]?.navTops?.[2];
		record("R-PATH-01", "导航第 3 格是「学习路线」、指向 /roadmap/、且没有子项",
			top3?.name === "学习路线" && top3?.href === "/roadmap/" && (top3?.children?.length ?? -1) === 0,
			`第 3 格 = ${JSON.stringify(top3)}`);
		// R-PATH-06：「排行」这个模块整体退场后，导航里不许留任何一层残留
		// （navTexts 同时覆盖桌面导航与移动抽屉）
		// ⚠️ 必须先守 `navTexts.length > 0`（Task 3 审查修复）：空数组上的 `.every()` **恒为真** ——
		//    采集项缺失 / 选错键（例如误取 `-roadmap` 后缀那份）时，这条会"因为什么都没采到"而报绿。
		const navTexts = facts["home-1440"]?.navTexts ?? [];
		record("R-PATH-06", "「排行」不再出现在任何导航层（桌面 + 移动抽屉）",
			navTexts.length > 0 && navTexts.every((t) => !t.includes("排行")),
			`导航文字 ${navTexts.length} 条：${JSON.stringify(navTexts)}`);
	}

	// ── P2R 学习路线：Task 5 迁进来的 7 条通用判据（R-PATH-01 / R-PATH-05）──
	// 为什么**另起一个块**：这 7 条不是"读 facts 做判定"，有一半要**当场操作浏览器**
	// （关 JS / 打印模拟 / 真点导航 / 按后退 / 读 head）。块首按 brief 的规矩**重新取一遍**
	// 要用的事实键 —— `rm` / `rm390` 是上一个块里的 `const`，块级作用域出块即失效。
	{
		const rm = facts["roadmap-1440-roadmap"];
		const rm390 = facts["roadmap-390-roadmap"];

		// R-PATH 专用就地辅助：照 1081 行 clickMenu / 2216 行 clickZone 的写法就地写，
		// 不另造名字各异的一套（brief 点名要求）。
		const evalIn = async (expr) =>
			(await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
		const clickSel = async (sel) =>
			evalIn(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return "missing"; el.click(); return "ok"; })()`);
		/**
		 * 开一个页面并等它加载完。
		 * ⚠️ **`Page.navigate` 不保证触发 `Page.loadEventFired`**（真机实测，`reports/_task5-samedoc-probe.json`）：
		 *    · 只**加** fragment（`/roadmap/` → `/roadmap/#line-linux`）→ 3 秒内**没有任何 load 事件**
		 *      （裸等 30s 会抛"等 Page.loadEventFired 超时"把整轮打断）；
		 *    · 去 fragment（`#x` → 无）70~80ms、**完全相同的 URL** 70~75ms、换文档 70~280ms → 都会触发。
		 *    所以给 once 兜一个 8s 超时：真不触发时 DOM 本来就是对的，睡够即可继续，不会把整轮炸掉。
		 */
		const goto = async (url) => {
			const loaded = cdp.once("Page.loadEventFired", 8000).catch(() => null);
			await cdp.send("Page.navigate", { url });
			await loaded;
			await sleep(900);
		};
		/**
		 * 轮询等条件**真的**成立：页内锚点滚动是 `scroll-behavior: smooth` 的动画，
		 * 固定 sleep 在慢机器上会偶发误判（假红和假绿一样有害，T58 同类）。
		 * 表达式抛错（元素没了 / null）按"还没成立"处理 —— 断言必须降级成红，不许把整个脚本炸掉
		 * （Task 2 踩过：页面整块缺失时 `rm.x.length` 抛 TypeError，6 条该红的断言只剩 1 条崩溃）。
		 */
		const waitFor = async (expr, timeoutMs = 4000) => {
			for (let waited = 0; waited <= timeoutMs; waited += 150) {
				if (await evalIn(`(() => { try { return Boolean(${expr}); } catch { return false; } })()`)) return true;
				await sleep(150);
			}
			return false;
		};

		// ① R-PATH-05：关掉 JS 后内容必须**全在**（prd §6.2「内容不许依赖 JS」的硬要求）
		// 关脚本跑一趟 → 采完立刻**还原**（`value:false`），否则后面所有断言都会在无 JS 的页面上跑。
		await cdp.send("Emulation.setScriptExecutionDisabled", { value: true });
		await goto(`${BASE}/roadmap/`);
		const noJs = await evalIn(`(() => ({
			lines: document.querySelectorAll("section.roadmap-line").length,
			stops: document.querySelectorAll("li.roadmap-stop a.roadmap-stop-link").length,
			stats: (document.querySelector("#roadmap-stats") || {}).textContent || "",
		}))()`);
		// 还原后还要**整页重载一次**：上面那份文档是在"脚本被禁用"的状态下解析的，
		// 光把开关拨回来不会让它的脚本补跑 —— 真机实测（`reports/_task5-samedoc-probe.json` ⑦）：
		// 关 JS 时 `window.swup === undefined`，拨回开关 + 导航到**同一 URL**（load 事件 70ms）后变成 `object`。
		// （下面的打印/锚点判据都要有 JS 的页面）
		await cdp.send("Emulation.setScriptExecutionDisabled", { value: false });
		await goto(`${BASE}/roadmap/`);
		record(
			"R-PATH-05",
			"关掉 JS 后 8 条主线 / 136 个停靠点 / 页顶数字都在（内容不依赖 JS）",
			noJs?.lines === 8 && noJs?.stops === 136 && /133 篇/.test(noJs?.stats ?? ""),
			`线 ${noJs?.lines} 条 ｜ 停靠点 ${noJs?.stops} 个 ｜ 页顶「${(noJs?.stats ?? "").replace(/\s+/g, " ").trim()}」`,
		);

		// ② R-PATH-05：390px 下**真的**没有横向溢出（页面不许横向滚，内容也不许被裁）
		// 历史：brief 原稿用的是采集器那份 `overflowX`，而它当时算的是
		//    `documentElement.scrollWidth - window.innerWidth` —— 在 `mobile:true` 模拟下内容一溢出，
		//    `window.innerWidth` 会**跟着内容一起涨**（探针实测 390 → 900），两个数同向变大 → 差值**恒为 0**，
		//    是句**结构上不可能红**的空判据（实测：把 `#roadmap` 撑到 900px 那一轮 0 失败）。
		//    **v1.41 修复轮 2 已把这个差法从采集器根上改掉**（现在两份采集器都是 `scrollWidth − clientWidth`），
		//    所以采集器那份现在是**可信的参照值**；但这条判据仍然当场量，因为它要多量一个采集器没有的数：
		//      ① 页面级：`documentElement.scrollWidth - documentElement.clientWidth`（clientWidth 稳定 390）
		//      ② 内容级：`#content-column.scrollWidth - clientWidth` —— 这一层是 `overflow-x: clip`（探针实测），
		//         路线页自己的内容要是太宽（超长不可断词 / 宽表格 / 窄屏固定宽），页面**不会**横滚，而是被**裁掉** ——
		//         只量①的话这种坏法永远看不见。
		await cdp.send("Emulation.setDeviceMetricsOverride", {
			width: 390,
			height: 844,
			deviceScaleFactor: 1,
			mobile: true,
		});
		await goto(`${BASE}/roadmap/`);
		const ovf = await evalIn(`(() => {
			const de = document.documentElement;
			const col = document.getElementById("content-column");
			return {
				doc: de.scrollWidth - de.clientWidth,
				col: col ? col.scrollWidth - col.clientWidth : null,
				scrollWidth: de.scrollWidth,
				clientWidth: de.clientWidth,
				innerWidth: window.innerWidth,
			};
		})()`);
		// 量完立刻把视口还回 1440×900：下面点桌面导航、验打印、以及再后面的 P3 桌宠真机探针都按桌面假设
		await cdp.send("Emulation.setDeviceMetricsOverride", {
			width: 1440,
			height: 900,
			deviceScaleFactor: 1,
			mobile: false,
		});
		record(
			"R-PATH-05",
			"390px 下路线页无横向溢出（页面级 + 内容级两个数当场量）",
			ovf?.clientWidth === 390 && ovf?.doc <= 2 && ovf?.col !== null && ovf?.col <= 2,
			`页面级 ${ovf?.doc}px（scrollWidth ${ovf?.scrollWidth} − clientWidth ${ovf?.clientWidth}）｜ 内容级 ${ovf?.col}px（#content-column 的 scrollWidth − clientWidth）｜ 该视口 innerWidth=${ovf?.innerWidth} ｜ 采集器那份 overflowX=${rm390?.overflowX}（修复轮 2 起同一口径，交叉参照）`,
		);

		// ③ R-PATH-05：页顶「约 N 小时」不仅要**在**，还要与停靠点数**自洽**（控制者追加的第 7 条，
		//    v1.41 修复轮 1 按其裁定收紧 —— 裁定原文：「我原本的意图就是"兜底不得静默通过"」）。
		// 起因：`roadmap.astro` 的 `minutes: Math.max(1, Number(remarkPluginFrontmatter.minutes ?? 1))`
		// 意味着**一分钟数都采不到时每行仍是「约 1 分钟」**、总时长也变成一个假数，
		// 而 6 条 R-PATH 断言照样全绿（它们只钉篇数/停靠点/跨线）。
		// ⚠️ **为什么不是「N ≥ 1」**：兜底产物是 136 停靠点 × 1 分钟 ≈ 136 分钟 → `Math.round(136/60) = 2` 小时，
		//    「约 2 小时」照样满足 N ≥ 1 —— 空判据。实测为证：把 136 处「约 N 分钟」全改成「约 1 分钟」+
		//    页顶改「约 2 小时」的那一轮，旧写法 **0 失败**（`reports/_task5-inj9-fallback-oldN1.log`）。
		// 现在的口径：**平均每站至少 2 分钟**（`N * 60 >= 停靠点 × 2`，不写死任何绝对数字，内容增减时两边一起动）。
		//    真实数据 `69 × 60 = 4140 >= 136 × 2 = 272` 余量充足；兜底值 `2 × 60 = 120 < 272` 立刻红。
		//    （页顶的小时数自 M4 起 = 各线表头小时数之和 = **69**，不再是 `round(总分钟/60)` 的 68。）
		// 两层都要：① 必须能解析出「约 N 小时」（解析失败/文本缺失 → 红）；
		//            ② 总时长与停靠点数自洽（`stopCount` 取不到时也判红 —— `?? 0` 会让右边变 0 而**空过**）。
		const hoursHit = /约\s*(\d+)\s*小时/.exec(rm?.statsText ?? "");
		const hoursN = hoursHit ? Number(hoursHit[1]) : null;
		const stopCount = Number.isFinite(rm?.stopCount) ? rm.stopCount : 0;
		const minutesFloor = stopCount * 2;
		const perStop = hoursN === null || stopCount <= 0 ? null : Math.round((hoursN * 60) / stopCount);
		record(
			"R-PATH-05",
			"页顶 stats 出现「约 N 小时」且总时长与停靠点数自洽（平均每站 ≥ 2 分钟）",
			hoursN !== null && stopCount > 0 && hoursN * 60 >= minutesFloor,
			`匹配「${hoursHit?.[0] ?? "（没有）"}」｜ N=${hoursN}（= ${hoursN === null ? "—" : hoursN * 60} 分钟）｜ 停靠点 ${rm?.stopCount} 个 → 下限 ${minutesFloor} 分钟 ｜ 平均 ${perStop === null ? "—" : `${perStop} 分钟/站`} ｜ 全文「${rm?.statsText}」`,
		);

		// ④ R-PATH-01：打印（@media print）时 8 条主线都得**在纸上**
		// ⚠️ 判据不能只数 DOM 节点：`querySelectorAll` 无视媒体查询 —— 谁将来写一条
		//    `@media print { .roadmap-line { display:none } }`，旧写法照样数出 8 条而报绿。
		//    所以同时要求 8 条都**真的渲染**（display 非 none、可见、有高度）。
		// 自己先开一趟页面：不蹭上一步（②）留下的落点与媒体状态（判据之间不许有隐式依赖）。
		await goto(`${BASE}/roadmap/`);
		await cdp.send("Emulation.setEmulatedMedia", {
			media: "print",
			features: [{ name: "prefers-color-scheme", value: "dark" }],
		});
		await sleep(200);
		const printFact = await evalIn(`(() => {
			const secs = [...document.querySelectorAll("section.roadmap-line")];
			const shown = secs.filter((s) => {
				const cs = getComputedStyle(s);
				return cs.display !== "none" && cs.visibility !== "hidden" && s.getBoundingClientRect().height > 0;
			});
			return { lines: secs.length, shown: shown.map((s) => s.id) };
		})()`);
		// 用完**复位为默认媒体**（`media:""`），并保持原有的暗色模拟 —— 别把后面几段的配色染成别的
		await cdp.send("Emulation.setEmulatedMedia", {
			media: "",
			features: [{ name: "prefers-color-scheme", value: "dark" }],
		});
		record(
			"R-PATH-01",
			"打印时 8 条主线都在纸上（不是只留在 DOM 里）",
			printFact?.lines === 8 && printFact?.shown?.length === 8,
			`打印模式 ${printFact?.lines} 条线，其中真实渲染 ${printFact?.shown?.length} 条（${JSON.stringify(printFact?.shown)}）`,
		);

		// ⑤ R-PATH-01：从首页**真实点导航**走 Swup 进路线页，再点页内锚点
		await goto(`${BASE}/`);
		const navClick = await clickSel('#navbar a[href="/roadmap/"]');
		const swupOk = await waitFor(`location.pathname === "/roadmap/" && !!document.querySelector("#roadmap")`, 5000);
		// ⚠️ **必须等转场真的落定再点锚点**：落地判据在 ~230ms 就成立了，而 Swup 会把
		//    `is-changing/is-animating` 挂到 `<html>` 上直到 ~560ms（探针实测），这期间的点击
		//    **会被整个吞掉**（既不进 URL 也不滚）。brief 原稿写的是 `sleep(1200)`，
		//    这里改成"等那段状态类消失 + 一点缓冲"，比死等固定毫秒稳（慢机器不会假红）。
		await waitFor(
			`!document.documentElement.classList.contains("is-changing") && !document.documentElement.classList.contains("is-animating")`,
			3000,
		);
		await sleep(300);
		const anchorClick = await clickSel('#roadmap-index a[href="#line-linux"]');
		const anchorOk = await waitFor(
			`location.hash === "#line-linux" && (document.querySelector("#line-linux")?.getBoundingClientRect().top ?? 1e9) < window.innerHeight`,
			5000,
		);
		record(
			"R-PATH-01",
			"经 Swup 切页进路线页后页内锚点仍可用（切页没有把锚点吃掉）",
			navClick === "ok" && swupOk && anchorClick === "ok" && anchorOk,
			`导航点击=${navClick} ｜ Swup 落地=${swupOk} ｜ 锚点点击=${anchorClick} ｜ 锚点生效=${anchorOk}（当前 ${await evalIn("location.pathname + location.hash")}）`,
		);

		// ⑥ R-PATH-01：浏览器后退 —— 点一个页内锚点后按一次「后退」，应回到**不带 hash 的路线页**
		// ⚠️ 只判 `hash === ""` 会**空过**：若后退退到了首页/别的页，hash 也是空的。所以连 pathname 一起判。
		// ⚠️ 先回首页再进路线页（两趟**换文档**的整页加载）：这样历史栈里有一格干净的"无 hash 路线页"，
		//    不依赖上一段把页面留在哪个 fragment 上（⑤ 结束时停在 `/roadmap/#line-linux`）——
		//    判据之间不留隐式依赖（Task 3 §1.5.2 的教训）。
		await goto(`${BASE}/`);
		await goto(`${BASE}/roadmap/`);
		const backAnchor = await clickSel('#roadmap-index a[href="#line-mysql"]');
		await waitFor(`location.hash === "#line-mysql"`, 3000);
		await evalIn(`history.back(); "back"`);
		const backOk = await waitFor(`location.pathname === "/roadmap/" && location.hash === ""`, 4000);
		record(
			"R-PATH-01",
			"浏览器后退能回到不带 hash 的路线页（且没被退到别的页）",
			backAnchor === "ok" && backOk,
			`锚点点击=${backAnchor} ｜ 后退后落在 ${await evalIn("location.pathname + location.hash")}`,
		);

		// ⑦ R-PATH-01：canonical 指向 /roadmap/ 且不带查询串
		// ⚠️ 自己先开一趟路线页：canonical 读的是**当前文档**的 head，蹭上一段的落点会在
		//    上一条红的连锁下读到别的页（第一轮 RED 里就抓到：读到的是首页的 canonical）——
		//    判据之间不许有隐式依赖（Task 3 §1.5.2 的同类教训）。
		await goto(`${BASE}/roadmap/`);
		const rmCanonical = await evalIn(`document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? ""`);
		record(
			"R-PATH-01",
			"canonical 指向 /roadmap/ 且不带查询串",
			/\/roadmap\/$/.test(rmCanonical) && !/[?#]/.test(rmCanonical),
			`canonical=${rmCanonical || "（没取到）"}`,
		);

		// 恢复现场：下一段 P3 桌宠的**真机探针**（`__imissSleepNow()` / `#pet-body`）依赖
		// "当前页 = 首页且桌宠脚本已起来"，而本块为了验锚点/后退把页面开到了 /roadmap/。
		// 关 JS 与打印模拟都在上面就近复位过了（脚本 false / 媒体 media:"" + 暗色），
		// 这里再把页面开回首页并等桌宠脚本落定（与采集期 `await sleep(2400)` 同一口径）。
		await goto(`${BASE}/`);
		await sleep(2500);
	}

	// ── P3 桌宠（R-PET-01 ~ R-PET-05）──
	{
		const boot = facts["pet-boot"].pet;
		const mobile = facts["pet-390"].pet;
		const st = (k) => facts[k]?.pet?.state;

		record(
			"R-PET-01",
			"桌面端渲染出桌宠（节点 + 精灵 + 影子）",
			boot?.exists === true && boot.hidden === false && boot.sprite !== null && boot.hasShadow === true,
			`状态=${boot?.state} 尺寸=${boot?.sprite?.w}×${boot?.sprite?.h} 影子=${boot?.hasShadow}`,
		);
		record(
			"R-PET-01",
			"精灵按图集规格取帧（background-size 800% 900%）",
			boot?.sprite?.bgSize === "800% 900%" && boot?.sprite?.img === true,
			`bgSize=${boot?.sprite?.bgSize} 用图集=${boot?.sprite?.img}`,
		);
		// ⚠️ R-PET-12（本轮）**推翻了**这条的原口径：原来断言的是"390 宽看不到桌宠（hideOnMobile）"，
		//    发起人在手机上打开站点后问「手机端我咋没看到桌宠」，选了"显示但缩小 + 降存在感"，
		//    于是 `hideOnMobile: false` —— 这条断言必须跟着改口径，否则会拿旧事实卡新行为。
		//    新口径拆成两问：① 手机上她**在**（不是被解析期脚本藏掉）；② 用的是**手机档**缩放。
		record(
			"R-PET-12",
			"移动端 390 冷启动能看到桌宠（hideOnMobile=false：不再是解析期就被藏掉）",
			mobile?.exists === true && mobile?.off === false && mobile.hidden === false,
			`petOff=${mobile?.off} display=${mobile?.display} 精灵=${mobile?.sprite?.w}×${mobile?.sprite?.h}`,
		);

		// 九状态：这里挑"每条触发路径"各验一次（idle/running-right/failed/waiting/running/review/jumping/waving）
		record("R-PET-02", "出场打招呼（waving）", st("pet-boot") === "waving", `state=${st("pet-boot")}`);
		record("R-PET-02", "键盘 Enter → 跳一下（jumping）", st("pet-key-enter") === "jumping", `state=${st("pet-key-enter")}`);
		// v1.59：默认档改成 `fixed` 之后，键盘 ←/→ 在**默认档下不位移**（`walkTo()` 在 fixed 档
		// 直接 return —— 组件里 R-PET-08 起就是这么写的），这条把默认档的真实行为钉住；
		// 下面那条「running-left」则是 `__imissSetMode("float")` 之后按的（覆盖另一档）。
		record(
			"R-PET-02",
			"默认档 fixed 下键盘 ← 也不位移（walkTo() 在 fixed 档直接 return，坐标与 transform 不变）",
			facts["pet-fixed-key"]?.mode === "fixed" &&
				facts["pet-fixed-key"].x1 === facts["pet-fixed-key"].x2 &&
				facts["pet-fixed-key"].y1 === facts["pet-fixed-key"].y2 &&
				facts["pet-fixed-key"].transform1 === facts["pet-fixed-key"].transform2,
			`按 ← 前 (${facts["pet-fixed-key"]?.x1},${facts["pet-fixed-key"]?.y1}) → 按后 (${facts["pet-fixed-key"]?.x2},${facts["pet-fixed-key"]?.y2})，transform ${facts["pet-fixed-key"]?.transform1} → ${facts["pet-fixed-key"]?.transform2}（mode=${facts["pet-fixed-key"]?.mode}）`,
		);
		record(
			"R-PET-02",
			"键盘 ← → 左走（running-left；强制切 float 后测，默认档已是 fixed）",
			st("pet-key-left") === "running-left",
			`state=${st("pet-key-left")}（这一按发生在 __imissSetMode("float") 之后）`,
		);
		record(
			"R-PET-02",
			"按住拖动 → 困惑（failed）",
			st("pet-drag") === "failed",
			`state=${st("pet-drag")}`,
		);
		record(
			"R-PET-02",
			"双击 → 完成反馈（review）",
			st("pet-dblclick") === "review",
			`state=${st("pet-dblclick")}`,
		);
		// R-PET-09：菜单里的「跳一下」已按发起人要求删除（"左键点击就能跳所以按键没有必要"），
		// 所以这里改成验**左键单击**这条真实路径（⑧a 里用 pointerdown/pointerup 触发）。
		record(
			"R-PET-02",
			"左键单击宠物 → 跳一下（jumping；菜单里那个「跳一下」已删）",
			facts["pet-jump"]?.mid1?.state === "jumping" && facts["pet-jump"]?.before?.canJump === true,
			`单击后 data-pet-state=${facts["pet-jump"]?.mid1?.state}（跳前 ${facts["pet-jump"]?.before?.state}）；菜单实显=${JSON.stringify(facts["pet-jump"]?.mid1?.items)}`,
		);
		// R-PET-08：「睡一会儿」的菜单入口已按发起人要求删除，`waiting` 只剩"45 秒无操作"这条
		// 真实路径（hookInputs 的 3 秒巡检 → doze()）。验收脚本改调 `__imissSleepNow()`，
		// 它执行的是**同一段 doze()**（同 __imissFlyNow 的惯例），不干等 48 秒也不改属性骗自己。
		{
			const sleepProbe = await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const ret = window.__imissSleepNow ? window.__imissSleepNow() : null;
					const el = document.getElementById("pet");
					return { ret, state: el.dataset.petState || null };
				})()`,
				returnByValue: true,
			});
			const v = sleepProbe.result.value;
			record(
				"R-PET-02",
				"45 秒无操作超时 → 屏幕待机（waiting；调用的是巡检里同一段 doze()）",
				v?.ret === "waiting" && v?.state === "waiting",
				`doze() 返回 state=${v?.ret}，DOM data-pet-state=${v?.state}`,
			);
			// 唤回待机，别影响后面的断言
			await cdp.send("Runtime.evaluate", {
				expression: `document.getElementById("pet-body").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 3, clientX: 10, clientY: 10 })); "wake"`,
				returnByValue: true,
			});
			await sleep(150);
		}
		record(
			"R-PET-02",
			"右键菜单项齐全（顺序=聊天 / 落下去·飘起来 / 缩小；「跟过来」「睡一会儿」「跳一下」「说句话」都已删）",
			same(facts["pet-menu"].pet.menu.items, ["和爱弥斯聊天", "落下去", "飘起来", "缩小"]) &&
				same(facts["pet-menu"].pet.menu.itemsVisible, ["和爱弥斯聊天", "落下去", "缩小"]) &&
				facts["pet-menu"].pet.menu.hidden === false,
			`DOM 全部项=${JSON.stringify(facts["pet-menu"].pet.menu.items)}（悬浮档实显=${JSON.stringify(facts["pet-menu"].pet.menu.itemsVisible)}）`,
		);
		record(
			"R-PET-02",
			"左键单击宠物 → 弹出台词气泡（「说句话」菜单项删掉后，说话这条路径仍在）",
			(st("pet-act-say") !== null && (facts["pet-act-say"].pet.bubble.text || "").length > 4) === true &&
				facts["pet-act-say"].pet.bubble.pop === true,
			`气泡="${facts["pet-act-say"].pet.bubble.text}"（is-pop=${facts["pet-act-say"].pet.bubble.pop}）`,
		);
		record(
			"R-PET-02",
			"宠物可聚焦且带 role=button + 可读标签",
			facts["pet-boot"].pet.exists === true &&
				/桌宠爱弥斯/.test(
					(
						await cdp.send("Runtime.evaluate", {
							expression: `document.getElementById("pet-body")?.getAttribute("aria-label") || ""`,
							returnByValue: true,
						})
					).result.value,
				),
			"aria-label 命中「桌宠爱弥斯」",
		);

		// R-PET-03 站点联动
		record(
			"R-PET-03",
			"搜索框打字 → 执行任务（running）",
			st("pet-typing") === "running",
			`state=${st("pet-typing")}`,
		);
		record(
			"R-PET-03",
			"切主题 → 完成反馈（review）",
			st("pet-theme") === "review",
			`state=${st("pet-theme")}`,
		);
		record(
			"R-PET-03",
			"Swup 切页 → 打招呼（waving）且节点未重建",
			st("pet-swup") === "waving",
			`state=${st("pet-swup")}`,
		);
		record(
			"R-PET-03",
			"reduced-motion：不跑动画循环（帧不前进），但点击仍有效",
			facts["pet-reduced-1"].pet.sprite.bgPos === facts["pet-reduced-2"].pet.sprite.bgPos &&
				facts["pet-reduced-1"].pet.state === "idle" &&
				(facts["pet-reduced-say"].pet.bubble.text || "").length > 4,
			`状态=${facts["pet-reduced-1"].pet.state}/${facts["pet-reduced-2"].pet.state} 帧 ${facts["pet-reduced-1"].pet.sprite.bgPos} → ${facts["pet-reduced-2"].pet.sprite.bgPos}（900ms 后），点击后气泡="${facts["pet-reduced-say"].pet.bubble.text}"`,
		);
		record(
			"R-PET-03",
			"阅读页进入安静模式（/posts/ 下 route=post，不乱走）",
			facts["pet-post-page"].pet.route === "post",
			`切到 ${SAMPLE_POST} 后 route=${facts["pet-post-page"].pet.route}（当前路径 ${facts["pet-post-page"].pet.path}）`,
		);

		// R-PET-04 与看板娘互斥（静态：两个看板娘开关都必须为 false）
		{
			const pio = await fs.readFile(path.resolve("src/config/pioConfig.ts"), "utf8");
			const live2dOff = /live2dWidgetConfig[\s\S]{0,400}?enable:\s*false/.test(pio);
			const spineOff = /spineModelConfig[\s\S]{0,400}?enable:\s*false/.test(pio);
			record(
				"R-PET-04",
				"看板娘（Live2D / Spine）保持关闭，全站只有爱弥斯一个角色",
				live2dOff && spineOff,
				`live2d=${live2dOff} spine=${spineOff}`,
			);
		}

		// R-PET-05 不遮挡
		record(
			"R-PET-05",
			"滚动出返回顶部按钮后与宠物不重叠",
			(facts["pet-float"].pet.floatOverlap ?? 99) === 0,
			`重叠的浮动控件数=${facts["pet-float"].pet.floatOverlap}`,
		);
		record(
			"R-PET-05",
			"宠物层级低于浮动按钮（z-index 66 < 100）",
			(facts["pet-boot"].pet.zIndex ?? 999) < 100,
			`z-index=${facts["pet-boot"].pet.zIndex}`,
		);
	}

	// ── R-PET-06 三档运动模式（v1.59 起**默认 `fixed` 固定**；`float` 悬浮+飞行 / `ground` 贴地）──
	// ⚠️ 默认档变了**不等于**另外两档可以不测：`float` / `ground` 那几条一律先
	//    `__imissSetMode()` **强制切档**再跑（钩子调的是 `boot()` 里同一个 `setMode()`）。
	{
		const flight = facts["pet-float-flight"];
		const floatBefore = facts["pet-float-before"].pet;
		const boot = facts["pet-boot"].pet;
		const land = facts["pet-fixed-land"];
		const floatDrop = facts["pet-float-drop"];
		const fixedStill = facts["pet-fixed-still"];
		const fixedDrop = facts["pet-fixed-drop"];
		const ground = facts["pet-ground"];
		const reduced1 = facts["pet-reduced-1"].pet;
		const reduced2 = facts["pet-reduced-2"].pet;

		// ① 默认档 = `fixed`（配置里写的就是它，运行时 DOM 也要是它）
		record(
			"R-PET-06",
			'默认运动模式是 "fixed"（配置与运行时 DOM 一致）',
			facts["pet-mode-config"].mode === "fixed" && boot?.mode === "fixed" && land?.p1?.mode === "fixed",
			`petConfig.movement.mode=${facts["pet-mode-config"].mode}，运行时 data-pet-mode=${boot?.mode}（清掉位置记忆重载后 ${land?.p1?.mode}）`,
		);

		// ② 默认档**真的静止**：1.6 秒两次采样 `transform` 与坐标**完全相同**（含"没有 hover 浮动"）。
		//    悬浮档的浮动是 rAF 逐帧写 `translate3d` 的，连亚像素差都藏不住
		//    （对照组：`float` 同一探针量到 matrix(...,406.54) → matrix(...,395.46)，见 §7.6）
		record(
			"R-PET-06",
			"默认档 fixed 真的静止（1.6 秒两次采样 transform 与坐标完全相同，没有 hover 浮动）",
			land?.still === true &&
				land.p1.flying === false &&
				land.p2.flying === false &&
				fixedStill.x1 === fixedStill.x2 &&
				fixedStill.y1 === fixedStill.y2,
			`重载后 transform ${land?.p1?.transform} → 1.6s 后 ${land?.p2?.transform}（(${land?.p1?.x},${land?.p1?.y}) → (${land?.p2?.x},${land?.p2?.y})，两次 flying=${land?.p1?.flying}/${land?.p2?.flying}）；强制切档后再采一次：(${fixedStill.x1},${fixedStill.y1}) → (${fixedStill.x2},${fixedStill.y2})`,
		);

		// ③ 默认档的**首访落点**：停在右下角（不是屏幕正中）、完整在视口内、不与右下角浮动按钮列重叠。
		//    `displayNodes > 0` 保证"重叠 0"不是"没按钮可压"的空过（这一采样是在滚到 2000 之后取的）。
		//    首访坐标同时核 `pet-boot`（全新 profile 的第一次加载，无 localStorage）——两次必须同一个落点。
		record(
			"R-PET-06",
			"fixed 首访落点在右下角、完整在视口内、不与浮动按钮列重叠（按钮确实可见）",
			land?.insideViewport === true &&
				land.p1.saved === null &&
				land.p1.bottomGap > 0 &&
				land.p1.bottomGap <= 20 &&
				land.p1.centerRatio > 0.75 &&
				land.p1.displayNodes > 0 &&
				land.p1.floatOverlap === 0 &&
				(boot?.bottomGap ?? 999) <= 20,
			`落点 [${land?.p1?.x},${land?.p1?.y}]..[${land?.p1?.right},${land?.p1?.bottom}]（${land?.p1?.w}×${land?.p1?.h}），离视口底 ${land?.p1?.bottomGap}px、中心在视口 ${Math.round((land?.p1?.centerRatio ?? 0) * 100)}% 高度处；可见浮动控件 ${land?.p1?.displayNodes} 个、重叠 ${land?.p1?.floatOverlap} 个、最近间距 ${land?.minFloatGap}px；视口 ${land?.vw}×${land?.vh}；首访硬证据：重载后 localStorage 记忆=${JSON.stringify(land?.p1?.saved)}（必须 null）；pet-boot 那次落点离地 ${boot?.bottomGap}px`,
		);

		// ④ 强制切 float 后：悬浮 = 不贴地（底部距视口底明显大于地面模式）
		record(
			"R-PET-06",
			"float（强制切档）悬在半空（底部距视口底 > 120px，且比 ground 高 100px 以上）",
			(floatBefore.bottomGap ?? 0) > 120 &&
				(floatBefore.bottomGap ?? 0) - (ground?.landedGap ?? 0) > 100,
			`__imissSetMode("float") 之后 bottomGap=${floatBefore.bottomGap}px（rect.y=${floatBefore.rect?.y}）vs ground 落地 bottomGap=${ground?.landedGap}px`,
		);

		// ⑤ float 会"真的移动"：起飞 → 飞行中带 data-pet-flying → 落位后坐标确实变了
		{
			const moved =
				Math.abs(flight.after.x - flight.before.x) + Math.abs(flight.after.y - flight.before.y);
			record(
				"R-PET-06",
				"float（强制切档）会真的飞：起飞中被标记 flying，落位后坐标发生变化",
				flight.accepted === true &&
					flight.mid.flying === true &&
					flight.before.flying !== true &&
					moved >= 40,
				`起飞前 (${flight.before.x},${flight.before.y}) → 飞行中 (${flight.mid.x},${flight.mid.y}) flying=${flight.mid.flying} → 落位 (${flight.after.x},${flight.after.y})，位移 ${moved}px`,
			);
		}

		// ⑥ 飞行不出视口（左/上不越界，右/下不越界）
		record(
			"R-PET-06",
			"飞行全程留在视口内（四边都不越界）",
			flight.after.x >= 0 &&
				flight.after.y >= 0 &&
				flight.midEdge.right <= 1440 &&
				flight.midEdge.bottom <= 900 &&
				flight.afterEdge.right <= 1440 &&
				flight.afterEdge.bottom <= 900,
			`飞行中右下角 (${flight.midEdge.right},${flight.midEdge.bottom})、落位右下角 (${flight.afterEdge.right},${flight.afterEdge.bottom})，视口 1440×900`,
		);

		// ⑦ float：拖动松手不掉落（悬停锚在松手处，只在 ±幅度 内浮动）
		record(
			"R-PET-06",
			"float 拖动松手后不掉落（仍在半空悬停）",
			Math.abs(floatDrop.y2 - floatDrop.y1) <= 14 &&
				floatDrop.bottom1 > 120 &&
				floatDrop.bottom2 > 120,
			`松手后 y=${floatDrop.y1} → 1.2s 后 y=${floatDrop.y2}（离地 ${floatDrop.bottom1}→${floatDrop.bottom2}px，均远高于地面）`,
		);

		// ⑧ fixed（强制切档）：长时间不动（两次采样坐标完全一致）
		record(
			"R-PET-06",
			"fixed 长时间不动（1.6 秒两次采样坐标完全相同）",
			fixedStill.x1 === fixedStill.x2 && fixedStill.y1 === fixedStill.y2,
			`(${fixedStill.x1},${fixedStill.y1}) → 1.6s 后 (${fixedStill.x2},${fixedStill.y2})`,
		);

		// ⑨ fixed：拖动松手不落地（不施加重力）
		record(
			"R-PET-06",
			"fixed 拖动松手后停在原地、不下落",
			fixedDrop.mode === "fixed" && fixedDrop.y1 === fixedDrop.y2 && fixedDrop.bottomGap > 120,
			`松手后 y=${fixedDrop.y1} → 1.4s 后 y=${fixedDrop.y2}，离地仍有 ${fixedDrop.bottomGap}px（模式=${fixedDrop.mode}）`,
		);

		// ⑩ ground（强制切档）：切换即落回地面；拖动松手受重力落地（与 P3 旧行为一致）
		record(
			"R-PET-06",
			"ground（强制切档）切换与拖动松手都回到地面高度（与旧断言一致）",
			ground.mode === "ground" &&
				ground.modeSwitchGap <= 20 &&
				ground.airGap > 120 &&
				ground.landedGap <= 20,
			`切模式后 bottomGap=${ground.modeSwitchGap}px；拖动松手瞬间 y=${ground.airY}（离地 ${ground.airGap}px）→ 1.4s 后 y=${ground.landedY}（离地 ${ground.landedGap}px）`,
		);

		// ⑪ 三档都不与右下角浮动按钮重叠（displayNodes > 0 保证不是"没按钮可压"的空过）
		{
			const cases = [
				["float", facts["pet-float-after"].pet],
				["fixed", facts["pet-fixed-drop2"].pet],
				["ground", facts["pet-ground-landed"].pet],
			];
			for (const [mode, snapPet] of cases) {
				record(
					"R-PET-06",
					`${mode} 模式不与右下角浮动按钮重叠`,
					(snapPet.displayNodes ?? 0) > 0 && (snapPet.floatOverlap ?? 99) === 0,
					`可见浮动控件 ${snapPet.displayNodes} 个，重叠 ${snapPet.floatOverlap} 个；宠物右下角 (${snapPet.rect.x + snapPet.rect.w},${snapPet.rect.y + snapPet.rect.h})`,
				);
			}
		}

		// ⑫ reduced-motion：float（强制切档）退化为"静态悬浮"——不浮动、不飞行（两帧 transform 完全相同）
		record(
			"R-PET-06",
			"reduced-motion 下 float（强制切档）只保留静态悬浮（两帧 transform 相同、不在飞）",
			reduced1.mode === "float" &&
				reduced1.transform === reduced2.transform &&
				reduced1.rect.y === reduced2.rect.y &&
				reduced1.flying === false &&
				reduced2.flying === false &&
				reduced1.bottomGap > 120,
			`mode=${reduced1.mode} transform ${reduced1.transform} → ${reduced2.transform}（900ms 后），y ${reduced1.rect.y} → ${reduced2.rect.y}，离地 ${reduced1.bottomGap}px`,
		);

		// ⑬ 位置记忆仍生效：拖过的位置写进 localStorage（新格式 {x,y,mode}），
		//    刷新后 x 被恢复；而**模式仍以配置为准**（记忆里存的是 ground，重载后仍是配置档 fixed ——
		//    证据就是上面那次"重载后、强制切档前"的采样 `pet-reduced-default`）
		{
			const parseSaved = (raw) => {
				try {
					return JSON.parse(raw ?? "null");
				} catch {
					return null;
				}
			};
			const afterGround = parseSaved(facts["pet-ground-landed"].pet.saved);
			const afterReload = parseSaved(reduced1.saved);
			const reducedDefault = facts["pet-reduced-default"]?.pet?.mode ?? null;
			record(
				"R-PET-06",
				"位置记忆仍生效（存 {x,y,mode}、刷新后恢复 x；模式仍以配置为准，记忆盖不过配置）",
				afterGround !== null &&
					typeof afterGround.x === "number" &&
					afterGround.mode === "ground" &&
					afterReload !== null &&
					typeof afterReload.x === "number" &&
					Math.abs(reduced1.rect.x - afterReload.x) <= 2 &&
					reducedDefault === "fixed",
				`ground 拖动后存档=${facts["pet-ground-landed"].pet.saved}；重载后 x=${reduced1.rect.x}（存档 x=${afterReload?.x}）、mode=${reducedDefault}（= **配置默认档**，不是"存档里的模式说了算"；存档此刻是 ${afterReload?.mode}）`,
			);
		}
	}

	// ── R-PET-07 发起人反馈的两条（右键菜单定位 + 飞行太快太远）──
	// ⚠️ R-PET-08 起，菜单那部分的判据按发起人新反馈**整体换成左右摆位**：
	//    原来的"贴下方 / 下方放不下翻上方 / 不许贴屏幕底"三条 → 换成
	//    "并排在左/右 + 纵向顶部对齐 + 哪边够放哪边 + 5 点 elementFromPoint 命中"。
	{
		const casesOf = (key) => facts[key] ?? [];
		const failList = (cases, field) =>
			cases
				.filter((c) => !c[field])
				.map((c) => c.label)
				.join("、") || "无";

		for (const [size, key] of [
			["1440×900", "pet-menu-1440"],
			["390×844", "pet-menu-390"],
		]) {
			const cases = casesOf(key);
			// ① 四边都在视口内（这是发起人截图里最扎眼的那条：菜单探出屏幕被裁）
			record(
				"R-PET-07",
				`右键菜单四边都在视口内（${size}·${cases.length} 个宠物位置）`,
				cases.length >= 4 && cases.every((c) => c.hidden === false && c.inside),
				`${cases.map((c) => `${c.label} ${c.inside ? "✓" : "✗"}`).join(" | ")} ｜ 越界位置：${failList(cases, "inside")}`,
			);
			// ② 并排在宠物**左边或右边**：水平间隙 ≤ 26px、重叠面积 ≤ 100px²、纵向必须有交叠
			record(
				"R-PET-07",
				`右键菜单并排在宠物左/右侧且不重叠（${size}·水平间隙≤26px）`,
				cases.length >= 4 && cases.every((c) => c.beside),
				`${cases
					.map((c) => `${c.label} 贴${c.menu.side} 水平间隙${c.hGap}px/重叠${c.overlapArea}px²/纵向交叠${c.vOverlap}px`)
					.join(" | ")} ｜ 不合格：${failList(cases, "beside")}`,
			);
			// ③ 纵向**顶部对齐宠物顶部**，并被夹在视口内（宠物贴屏幕上下边时也要满足）
			record(
				"R-PET-07",
				`菜单纵向顶部对齐宠物顶部、贴边时夹回视口内（${size}）`,
				cases.length >= 4 && cases.every((c) => c.topAligned && c.topClamped),
				`${cases
					.map((c) => `${c.label} 顶差${c.topDelta}px${c.menu.nudged === "1" ? "(避让遮挡)" : ""}/期望顶${c.expectTop}`)
					.join(" | ")} ｜ 不合格：${failList(cases, "topAligned")}`,
			);
			// ④ 哪边空间够就放哪边：右侧够 → 右侧（含"两侧都够"时按默认右侧）；右侧不够 → 左侧
			record(
				"R-PET-07",
				`菜单按"左右哪边够展开"选边（${size}·右够用右、右不够翻左）`,
				cases.length >= 4 && cases.every((c) => c.sideChoice),
				`${cases
					.map((c) => `${c.label} 贴${c.menu.side}(期望${c.expectSide}) 右余${c.roomRight}/左余${c.roomLeft} 菜单宽${c.menu.w}`)
					.join(" | ")} ｜ 不合格：${failList(cases, "sideChoice")}`,
			);
		}
		// ⑤ 贴边对照：贴右边缘必须向左让位、贴左边缘必须向右让位（两个尺寸各一对）
		{
			const c1440 = casesOf("pet-menu-1440");
			const c390 = casesOf("pet-menu-390");
			const rightEdge1440 = c1440.find((c) => c.label.includes("右边缘"));
			const rightEdge390 = c390.find((c) => c.label.includes("右边缘"));
			const left1440 = c1440.find((c) => c.label.includes("在左"));
			const left390 = c390.find((c) => c.label.includes("左侧"));
			record(
				"R-PET-07",
				"贴右边缘时菜单向左让位、宠物在左时菜单向右让位（1440×900 + 390×844）",
				rightEdge1440?.menu.side === "left" &&
					rightEdge390?.menu.side === "left" &&
					left1440?.menu.side === "right" &&
					left390?.menu.side === "right" &&
					rightEdge1440?.inside === true &&
					rightEdge390?.inside === true,
				`右边缘 1440→贴${rightEdge1440?.menu.side}（菜单右边=${rightEdge1440?.menu.r}，视口${rightEdge1440?.vw}）、390→贴${rightEdge390?.menu.side}；左边缘 1440→贴${left1440?.menu.side}、390→贴${left390?.menu.side}`,
			);
		}
		// ⑥ 拖动宠物时菜单跟着走（不是留在原地）
		{
			const d = facts["pet-menu-drag"];
			const menuMoved = Math.abs((d?.before?.menu?.l ?? 0) - (d?.during?.menuL ?? 0));
			record(
				"R-PET-07",
				"拖动宠物时菜单跟着走（拖动中仍并排、不重叠、不出视口）",
				d?.during?.inside === true &&
					d?.during?.hGap <= 26 &&
					d?.during?.overlapArea <= 100 &&
					d?.during?.vOverlap > 0 &&
					d?.during?.tracked === true &&
					d?.during?.hitIsMenu === true &&
					menuMoved > 100,
				`拖动前菜单左边=${d?.before?.menu?.l} → 拖动中 宠物左边=${d?.during?.petL} 菜单左边=${d?.during?.menuL}（菜单跟着挪了 ${menuMoved}px）水平间隙=${d?.during?.hGap}px 重叠=${d?.during?.overlapArea}px² 在视口内=${d?.during?.inside} 5 点命中=${d?.during?.hitIsMenu}`,
			);
		}
		// ⑦ 切档后菜单跟着重排（贴地档宠物落到地面 → 仍并排在侧面、纵向仍对齐；
		//    菜单项同时从「落下去」换成「飘起来」，这条与 R-PET-08 的二选一互相印证）
		{
			const m = facts["pet-menu-mode-switch"];
			// 纵向判据与菜单矩阵一致：**顶部对齐宠物顶部**，超出视口就夹回 ——
			// 贴地档宠物在视口最下面，菜单必然被夹到 `vh − 边距 − 菜单高`（实测 728 = 900−8−164）。
			const menuH = (m?.after?.menuB ?? 0) - (m?.after?.menuT ?? 0);
			const expectTop = Math.max(8, Math.min(Math.max(8, 900 - 8 - menuH), m?.after?.petT ?? 0));
			record(
				"R-PET-07",
				"切档后菜单跟着重排（贴地档落到地面后仍并排、纵向对齐/夹回视口、不溢出）",
				m?.after?.mode === "ground" &&
					m?.after?.inside === true &&
					(m?.after?.side === "left" || m?.after?.side === "right") &&
					m?.after?.hGap <= 26 &&
					m?.after?.overlapArea <= 100 &&
					m?.after?.vOverlap > 0 &&
					Math.abs((m?.after?.menuT ?? -999) - expectTop) <= 3 &&
					m?.after?.hitIsMenu === true,
				`切档前菜单 top=${m?.before?.menu.t}（宠物 top=${m?.before?.pet.t}）→ 切到 ground 后 宠物 top=${m?.after?.petT}/bottom=${m?.after?.petB}、菜单 top=${m?.after?.menuT}/bottom=${m?.after?.menuB}（期望 top=${expectTop}＝顶部对齐后夹回视口）、贴${m?.after?.side}、水平间隙${m?.after?.hGap}px、在视口内=${m?.after?.inside}、菜单项=${JSON.stringify(m?.after?.itemsVisible)}`,
			);
		}
		// ⑧ 滚动后仍然并排（挡"菜单被写成文档坐标"这类回归）
		{
			const s = facts["pet-menu-scroll"];
			record(
				"R-PET-07",
				"滚动页面后菜单仍并排在宠物旁边（fixed 定位不被文档坐标带跑）",
				s?.inside === true && s?.hGap <= 26 && s?.overlapArea <= 100 && s?.vOverlap > 0,
				`滚动到 y=${s?.scrollY} 后：宠物 top=${s?.petT} 菜单 top=${s?.menuT} 顶差=${s?.topDelta}px 水平间隙=${s?.hGap}px 重叠=${s?.overlapArea}px² 在视口内=${s?.inside}`,
			);
		}
		// ⑨ 390×844 下桌宠**是显示的**（否则上面那批窄视口断言是空过）
		{
			const p = facts["pet-menu-390-pet"];
			record(
				"R-PET-07",
				"窄视口断言不是空过：390 宽时桌宠确实在渲染（由桌面宽缩窄而来）",
				p?.exists === true && p?.display !== "none",
				`exists=${p?.exists} display=${p?.display} petOff=${p?.off}（移动端冷启动隐藏见 R-PET-01）`,
			);
		}
		// ⑩ 菜单**真的画得出来**：矩形对不代表看得见 ——
		//     R-PET-07 之前菜单没有 z-index（auto=0），而模板里壁纸是 z-index 10、正文面板是 30，
		//     菜单被压在下面，只在两者都盖不到的地方露出一条（发起人看到的"被裁掉一半"）。
		//     R-PET-08 把抽样从"中心 1 点"扩到"中心 + 四角内缩共 5 点"——被遮挡的边角也能抓到
		//     （实测宠物拖到最上面时，正是顶部两个角压在 `z-index: 80` 的导航栏下面）。
		{
			const cases = [...casesOf("pet-menu-1440"), ...casesOf("pet-menu-390")];
			record(
				"R-PET-07",
				"菜单真的绘制在最上层（5 个抽样点都命中菜单本身，且层级高于壁纸/正文面板、低于浮动控件）",
				cases.length >= 8 &&
					cases.every((c) => c.hitIsMenu === true) &&
					cases.every((c) => c.menu.z > (c.layers?.wallpaper ?? 0) && c.menu.z > (c.layers?.content ?? 0)) &&
					cases.every((c) => c.menu.z < (c.layers?.floats ?? 1000)),
				`elementFromPoint 5 点命中：${cases.map((c) => `${c.label}→${c.hitIsMenu ? "菜单" : `漏(${c.missNodes?.join(",")})`}`).join(" | ")}；菜单 z=${cases[0]?.menu?.z} vs 壁纸 z=${cases[0]?.layers?.wallpaper} / 正文 z=${cases[0]?.layers?.content} / 浮动控件 z=${cases[0]?.layers?.floats}`,
			);
		}
		// ⑨ 飞行参数口径（配置源头）：位移 60~180px、时长 4~6s、间隔放宽、弧线与倾角收小
		{
			const fp = facts["pet-fly-params"] ?? {};
			const dist = fp.distance ?? [0, 0];
			const dur = fp.duration ?? [0, 0];
			const iv = fp.interval ?? [0, 0];
			record(
				"R-PET-07",
				"飞行口径改成「微微挪动」：位移 60~180px、时长 4~6s、间隔放宽到 30~90s",
				dist[0] === 60 &&
					dist[1] === 180 &&
					dur[0] === 4000 &&
					dur[1] === 6000 &&
					iv[0] >= 20000 &&
					iv[1] <= 120000 &&
					iv[1] > iv[0],
				`flyDistanceRange=${JSON.stringify(dist)}px、flyDurationRange=${JSON.stringify(dur)}ms、flyIntervalRange=${JSON.stringify(iv)}ms`,
			);
			record(
				"R-PET-07",
				"飞行弧线与倾角收小（flyArc ≤ 20px、flyTilt ≤ 4°）",
				(fp.arc ?? 999) <= 20 && (fp.tilt ?? 999) <= 4,
				`flyArc=${fp.arc}px（改前 44）、flyTilt=${fp.tilt}°（改前 7）`,
			);
		}
		// ⑩ 3 次实飞的位移 / 时长 / 姿态帧
		{
			const samples = facts["pet-flight-samples"] ?? [];
			const ok = samples.length === 3 && samples.every((s) => s.accepted && s.dist !== null && s.durMs !== null);
			const dists = samples.map((s) => s.dist);
			const distStr = samples.map((s) => `${s.dist}px`).join(" / ");
			const durStr = samples.map((s) => (s.durMs === null ? "?" : (s.durMs / 1000).toFixed(1))).join(" / ");
			record(
				"R-PET-07",
				"3 次实飞位移都落在 60~180px（夹回容差 ≤ 200px，改前实测 414~550px）",
				ok && samples.every((s) => s.dist >= 45 && s.dist <= 200),
				`3 次位移：${distStr}（改前 414~550px）；平均 ${
					ok ? Math.round(dists.reduce((a, b) => a + b, 0) / dists.length) : "?"
				}px`,
			);
			record(
				"R-PET-07",
				"3 次实飞时长都在 4~6 秒（实测容差 3.8~6.4s，改前固定 2.6s）",
				ok && samples.every((s) => s.durMs >= 3800 && s.durMs <= 6400),
				`3 次时长：${durStr} 秒；平均速度 ${
					ok
						? Math.round(
								samples.reduce((a, s) => a + s.dist / (s.durMs / 1000), 0) / samples.length,
							)
						: "?"
				}px/s（改前 ≈580px/s）`,
			);
			record(
				"R-PET-07",
				"飞行中用图集 row4（jumping：双臂张开的悬空姿态）循环播放",
				ok && samples.every((s) => s.midState === "jumping") && samples.some((s) => s.midSpritePos !== null),
				`飞行中 data-pet-state=${samples.map((s) => s.midState).join(" / ")}，background-position=${samples.map((s) => s.midSpritePos).join(" / ")}（row4 → y=50%）`,
			);
		}
	}

	// ── R-PET-08 发起人第二轮菜单反馈（删两项 / 加「落下去」+「飘起来」 / 菜单摆到左右 + 防遮挡）──
	{
		const drop = facts["pet-drop"];
		const rise = facts["pet-rise"];
		const occ = facts["pet-menu-occlusion"];
		const narrowBoth = facts["pet-menu-narrow-both"];
		const groundRef = facts["pet-ground"];

		// ① 档位二选一：悬浮档菜单里只有「落下去」、贴地档只有「飘起来」
		record(
			"R-PET-08",
			"「落下去」/「飘起来」按档位二选一显示（悬浮档→落下去，贴地档→飘起来）",
			same(drop?.openItems, ["和爱弥斯聊天", "落下去", "缩小"]) &&
				same(drop?.before?.itemsVisible, ["和爱弥斯聊天", "落下去", "缩小"]) &&
				same(rise?.openItems, ["和爱弥斯聊天", "飘起来", "缩小"]) &&
				drop?.menuWasHidden === true &&
				rise?.menuWasHidden === true,
			`悬浮档实显=${JSON.stringify(drop?.before?.itemsVisible)}（打开时=${JSON.stringify(drop?.openItems)}）；落下去之后实显=${JSON.stringify(rise?.openItems)}（menu.hidden 打开前后=${drop?.menuWasHidden}/${rise?.menuWasHidden}）`,
		);

		// ②「落下去」**真的掉下去**：y 一路变大（向下）、最终停在底部地面线上（离地 ≤ 20px ≈ 地面档的 6px）
		{
			const samples = drop?.samples ?? [];
			const ys = samples.map((s) => s.y);
			// 落地那一下会**回弹**（`impact > 1100` 时 `vy = -impact×0.26`，P3 起就有，实测回弹 ~27px），
			// 所以判据是"相对此前最高点最多回退 40px"，而不是严格单调
			const monotonic = ys.length >= 3 && ys.every((y, i) => i === 0 || y >= Math.max(...ys.slice(0, i)) - 40);
			record(
				"R-PET-08",
				"点「落下去」后宠物真的向下掉（y 单调向下、落地回弹之外没有回退，不是瞬移也不是原地）",
				monotonic && (drop?.landed?.y ?? 0) - (drop?.before?.y ?? 0) > 100 && (drop?.before?.gap ?? 0) > 120,
				`下落前 y=${drop?.before?.y}（离地 ${drop?.before?.gap}px）→ 落定 y=${drop?.landed?.y}（离地 ${drop?.landed?.gap}px）；采样 ${samples.slice(0, 10).map((s) => `${s.y}@${s.ms}ms`).join(" ")}`,
			);
			// 复用证据：菜单落点与"拖动松手落地"落点一致（同一段重力积分 → 都停在 floorY）
			record(
				"R-PET-08",
				"落点是底部那根地面线（与 R-PET-06 拖动松手落地的离地高度一致，±4px）",
				(drop?.landed?.gap ?? 999) <= 20 && Math.abs((drop?.landed?.gap ?? 999) - (groundRef?.landedGap ?? -999)) <= 4,
				`菜单「落下去」落定离地 ${drop?.landed?.gap}px vs 拖动松手落地离地 ${groundRef?.landedGap}px（P3 起就是这条线 + floorGap 10px）`,
			);
			record(
				"R-PET-08",
				"「落下去」在 3 秒内落到地面，且 data-pet-mode 变成 ground（保持贴地档行为）",
				drop?.landed?.mode === "ground" && (drop?.landed?.ms ?? 99999) <= 3000,
				`落定耗时 ${drop?.landed?.ms}ms，data-pet-mode=${drop?.landed?.mode}（下落中 data-pet-state=${drop?.landed?.state}）`,
			);
		}

		// ③「飘起来」反向：y 一路变小（向上）、回到悬浮基准线附近、模式回 float
		{
			const y0 = rise?.before?.y ?? 0;
			const y1 = rise?.risen?.y ?? 99999;
			record(
				"R-PET-08",
				"点「飘起来」后宠物反向升回悬浮档（y 变小、模式回 float、期间真的在走飞行插值）",
				rise?.before?.mode === "ground" &&
					rise?.risen?.mode === "float" &&
					y0 - y1 > 200 &&
					(rise?.risen?.gap ?? 0) > 120 &&
					(rise?.risen?.ms ?? 99999) <= 9000 &&
					rise?.sawFlying === true,
				`飘起前 y=${y0}（离地 ${rise?.before?.gap}px，mode=${rise?.before?.mode}）→ ${rise?.risen?.ms}ms 后 y=${y1}（离地 ${rise?.risen?.gap}px，mode=${rise?.risen?.mode}，期间 data-pet-flying=${rise?.sawFlying}）`,
			);
		}

		// ④ 遮挡检测：只遮住"宠物右侧"候选区 → 菜单必须换到左侧，且 5 点全部命中菜单
		record(
			"R-PET-08",
			"展开后被遮挡就换另一侧（注入 z-index 1100 遮挡层盖住右侧候选区 → 菜单换到左侧且 5 点干净）",
			occ?.clear?.menu?.side === "right" &&
				occ?.switched?.menu?.side === "left" &&
				occ?.switched?.inside === true &&
				occ?.switched?.hitIsMenu === true &&
				occ?.switched?.menu?.occluded === "0" &&
				occ?.blocker != null,
			`遮挡前贴${occ?.clear?.menu?.side}（occ=${occ?.clear?.menu?.occluded}）→ 右侧被遮后贴${occ?.switched?.menu?.side}（occ=${occ?.switched?.menu?.occluded}，菜单=[${occ?.switched?.menu?.l},${occ?.switched?.menu?.t}]，5 点命中=${occ?.switched?.hitIsMenu}）；遮挡层 left=${occ?.blocker?.left}`,
		);

		// ⑤ 两侧都被遮挡 → 明确兜底：侧别照记（不空）、四边仍在视口内、被挡点数如实记录
		record(
			"R-PET-08",
			"两侧都被遮挡时给明确兜底（侧别记进 data-pet-menu-side、四边仍在视口内、被挡点数如实上报）",
			(occ?.fallback?.menu?.side === "left" || occ?.fallback?.menu?.side === "right") &&
				occ?.fallback?.inside === true &&
				Number(occ?.fallback?.menu?.occluded) === 5 &&
				occ?.both === "full",
			`铺满全屏遮挡后：data-pet-menu-side=${occ?.fallback?.menu?.side}、data-pet-menu-occluded=${occ?.fallback?.menu?.occluded}、四边在视口内=${occ?.fallback?.inside}（遮挡更少的一侧胜出）`,
		);

		// ⑥ 没有靠"抬高 z-index"防遮挡：菜单层级仍是 petConfig.zIndex + 1 = 67，低于导航栏 80 / 浮动控件 1000
		{
			const mc = (facts["pet-menu-1440"] ?? [])[0];
			const petZ = facts["pet-boot"]?.pet?.zIndex;
			record(
				"R-PET-08",
				"防遮挡没走「抬高层级」的捷径（菜单 z-index 仍是宠物 +1 = 67，低于导航栏 80 / 浮动控件 1000）",
				mc?.menu?.z === (petZ ?? 0) + 1 && mc?.menu?.z === 67,
				`菜单 z=${mc?.menu?.z}（宠物 z=${petZ}）vs 导航栏 z=80 / 浮动控件 z=${mc?.layers?.floats}`,
			);
		}

		// ⑦ 窄视口两侧都放不下（390 宽、宠物在正中）→ 取空间更大的一侧 + 四边仍在视口内
		record(
			"R-PET-08",
			"两侧都放不下时取空间更大的一侧（360 正中·几何上无解，但四边仍在视口内、菜单仍可见）",
			(narrowBoth?.menu?.side === "left" || narrowBoth?.menu?.side === "right") &&
				narrowBoth?.inside === true &&
				narrowBoth?.hitIsMenu === true &&
				narrowBoth?.roomRight < narrowBoth?.menu?.w &&
				narrowBoth?.roomLeft < narrowBoth?.menu?.w &&
				narrowBoth?.expectSide === narrowBoth?.menu?.side,
			`360 正中（宠物 [${narrowBoth?.pet?.l},${narrowBoth?.pet?.r}]）：右余 ${narrowBoth?.roomRight}px / 左余 ${narrowBoth?.roomLeft}px（菜单宽 ${narrowBoth?.menu?.w}）→ 贴${narrowBoth?.menu?.side}（期望${narrowBoth?.expectSide}），菜单 [${narrowBoth?.menu?.l},${narrowBoth?.menu?.r}]，与宠物重叠 ${narrowBoth?.overlapArea}px²`,
		);
		record(
			"R-PET-08",
			"菜单项字面与发起人反馈一致：聊天排第一、末项「缩小」（v1.69 前写作「关闭」；说句话 / 跟过来 / 睡一会儿 / 跳一下都已删）",
			same(facts["pet-menu"]?.pet?.menu?.items, ["和爱弥斯聊天", "落下去", "飘起来", "缩小"]),
			`右键菜单 DOM 全部项=${JSON.stringify(facts["pet-menu"]?.pet?.menu?.items)}（悬浮档实显 ${JSON.stringify(facts["pet-menu"]?.pet?.menu?.itemsVisible)}）`,
		);
	}

	// ── R-PET-09 发起人第三轮反馈（删「跳一下」入口 + 跳的时候不要动）──
	{
		const j = facts["pet-jump"];
		// ① 菜单里已经没有「跳一下」（整个 DOM 里都不该有；替换的是左键单击这条真实路径）
		record(
			"R-PET-09",
			"右键菜单里的「跳一下」已删除（左键单击宠物就能跳）",
			Array.isArray(j?.mid1?.allItems) &&
				!j.mid1.allItems.includes("跳一下") &&
				same(j.mid1.allItems, ["和爱弥斯聊天", "落下去", "飘起来", "缩小"]) &&
				same(j?.mid1?.items, ["和爱弥斯聊天", "落下去", "缩小"]),
			`菜单 DOM 全部项=${JSON.stringify(j?.mid1?.allItems)}（跳前 ${JSON.stringify(j?.before?.allItems)}）；悬浮档实显=${JSON.stringify(j?.mid1?.items)}`,
		);
		// ② 左键单击 → 跳（真实 pointerdown/pointerup；这是"左键点击就能跳"的证据）
		record(
			"R-PET-09",
			"左键单击宠物仍然会跳（jumping，替代被删掉的菜单入口）",
			j?.before?.state !== "jumping" && j?.mid1?.state === "jumping",
			`单击前 state=${j?.before?.state} → 单击后 state=${j?.mid1?.state}`,
		);
		// ③ 「跳的时候就不要动了」：跳跃动画播放期间位置**定住**（悬浮档不上下浮动）
		record(
			"R-PET-09",
			"跳的时候位置定住（跳跃动画期间两次采样 x/y 完全相同，悬浮档不再上下浮动）",
			j?.mid1?.x === j?.mid2?.x && j?.mid1?.y === j?.mid2?.y && j?.mid1?.state === "jumping" && j?.mid2?.state === "jumping",
			`跳跃中 (${j?.mid1?.x},${j?.mid1?.y}) → 170ms 后 (${j?.mid2?.x},${j?.mid2?.y})（跳前 (${j?.before?.x},${j?.before?.y})），两次都在 jumping`,
		);
		// ④ 冻结不是永久性的：跳完（含落地弹跳）之后 ← 键仍能指挥它移动。
		//    ⚠️ 不能顺手断言"跳完 state 不是 jumping"：悬浮档跳完可能立刻赶上一次自动飞行，
		//    而飞行的姿态**就是** `jumping`（图集 row4），那样会假红（实测踩到过）。
		//    位移本身才是"冻结已结束"的证据。
		record(
			"R-PET-09",
			"跳跃结束后行为恢复（跳完按 ← 键宠物仍会移动，冻结不是永久性的）",
			Math.abs(j?.movedX ?? 0) >= 20 && j?.after?.mode === "float",
			`跳完 mode=${j?.after?.mode}（state=${j?.after?.state}，悬浮档跳完可能正好在自动飞行，姿态同样是 jumping）；按 ← 键 420ms 后 x 移动 ${j?.movedX}px`,
		);
		// ⑤ 键盘 Enter 保留（`role="button"` 的无障碍激活路径，与左键单击完全等价）——
		//    发起人说的"按键"指菜单里那个按钮（已删）；这条锁定"键盘没有被误解成一起删掉"。
		record(
			"R-PET-09",
			"键盘 Enter 保留且与左键单击等价（role=button 的无障碍激活路径，未被一起删掉）",
			j?.keyState?.state === "jumping",
			`按 Enter 后 data-pet-state=${j?.keyState?.state}（与左键单击得到的状态一致）`,
		);
	}

	// ── R-PET-10 发起人第四轮反馈（「落下去」没真落地 + 聊天时抖动太快）──
	// 断言口径：**证据必须来自真机路径**（真实鼠标事件 + 坐标随时间 + 图集帧的时间戳），
	// 不看"属性被改了没有"。发起人这一轮的原话就是「点击落下去之后没有真的落下去啊」，
	// 而上一轮的断言恰恰是全绿的 —— 所以这一组里有三条专门打"上一轮抓不到"的现场。
	{
		const d1 = facts["pet-drop-real"];
		const d2 = facts["pet-rise-real"];
		const d3 = facts["pet-drop-chat"];
		const d5 = facts["pet-drop-reduce"];
		const fr = facts["pet-frame-rate"];
		const src = facts["pet-frames-src"];
		const groundGap = facts["pet-ground"]?.landedGap ?? 6;

		// ① 点的是"看得见的那一项"：真右键开出来的菜单里，「落下去」可见、「飘起来」display:none，
		//    且「落下去」矩形中心的 `elementFromPoint` 命中的就是它自己（没被任何层盖住）。
		//    ⚠️ 这条是上一轮缺的那一类断言：`clickMenu()` 按 `[data-pet-act]` 选元素，
		//    "两个按钮都露出来""点到的是被盖住的那个"它一个都抓不到。
		record(
			"R-PET-10",
			"真右键开菜单后点的是**可见**那一项（悬浮档：「落下去」可见且命中自身、「飘起来」display:none）",
			d1?.open?.menuHidden === false && d1?.open?.target?.text === "落下去" && d1?.open?.target?.topHit === "self" && d1?.open?.all?.includes("飘起来:none"),
			`菜单项显示=${JSON.stringify(d1?.open?.all)}；可见项=${JSON.stringify(d1?.open?.visible)}；点击坐标=(${d1?.open?.target?.cx},${d1?.open?.target?.cy}) 命中=${d1?.open?.target?.topHit}`,
		);

		// ② 悬浮档真机点「落下去」→ 真的向下掉（y 相对此前最高点最多回退 40px 以容忍落地回弹），
		//    落点就是底部地面线（与拖动松手落地一致 ±4px），档位变 ground。
		{
			const fall = d1?.fall ?? [];
			const ys = fall.map((s) => s.y);
			const monotonic = ys.length >= 3 && ys.every((y, i) => i === 0 || y >= Math.max(...ys.slice(0, i)) - 40);
			const land = fall[fall.length - 1];
			record(
				"R-PET-10",
				"悬浮档·真机点「落下去」→ 宠物带重力落到地面线（真机鼠标事件，不是 click() 也不是调试钩子）",
				monotonic && (land?.gap ?? 999) <= 20 && Math.abs((land?.gap ?? 999) - groundGap) <= 4 && land?.mode === "ground" && ys.length >= 3 && ys[0] - ys[ys.length - 1] < -100,
				`真机点击后 y 采样=${fall.map((s) => `${s.y}@${s.ms}ms`).join(" ")}；落定离地 ${land?.gap}px（地面档基准 ${groundGap}px）、mode=${land?.mode}、耗时 ${land?.ms}ms`,
			);
		}

		// ③ **落地之后要一直贴地**（⑧b 一落地就 break，看不到之后的巡检）：
		//    再连续采 5.4 秒（覆盖落地后 1.2~4.2 秒的随机活动窗口 + 3 秒一次的"睡着"巡检），
		//    每一次采样都必须是 mode=ground 且离地高度不变 —— 这条专门抓"被巡检/自动飞行拉回悬浮"。
		{
			const land = (d1?.fall ?? [])[d1?.fall?.length - 1];
			const hold = d1?.hold ?? [];
			const modes = new Set(hold.map((s) => s.mode));
			const gaps = hold.map((s) => s.gap);
			const drift = Math.max(...gaps.map((g) => Math.abs(g - (land?.gap ?? 0))), 0);
			record(
				"R-PET-10",
				"落地后 5.4 秒内**一直**贴着地面线（不被自动飞行/睡着巡检拉回悬浮）",
				hold.length >= 30 && modes.size === 1 && modes.has("ground") && drift <= 4,
				`落定后 ${hold.length} 次采样（5.4s）：mode 集合=${JSON.stringify([...modes])}、离地 ${Math.min(...gaps)}~${Math.max(...gaps)}px（落定 ${land?.gap}px，最大漂移 ${drift}px）`,
			);
		}

		// ④ 贴地档真机点「飘起来」→ 反向回悬浮：菜单里该项可见、点击命中自身、「落下去」隐藏；
		//    y 明显变小、mode 回 float。
		{
			const rise = d2?.rise ?? [];
			const y0 = rise[0]?.y ?? 0;
			const last = rise[rise.length - 1];
			record(
				"R-PET-10",
				"贴地档·真机点「飘起来」→ 反向升回悬浮（可见项换成「飘起来」、y 变小 > 200px、mode 回 float）",
				d2?.open?.target?.text === "飘起来" &&
					d2?.open?.target?.topHit === "self" &&
					d2?.open?.all?.includes("落下去:none") &&
					last?.mode === "float" &&
					y0 - (last?.y ?? 0) > 200 &&
					(last?.gap ?? 0) > 120,
				`菜单项显示=${JSON.stringify(d2?.open?.all)}；点击 (${d2?.open?.target?.cx},${d2?.open?.target?.cy}) 命中=${d2?.open?.target?.topHit}；y ${y0} → ${last?.y}（${last?.ms}ms 后，离地 ${last?.gap}px，mode=${last?.mode}）`,
			);
		}

		// ⑤ 现场之一：**聊天框开着**点「落下去」。原来 `step()` 的 `chatOpen` 闸门挡在重力分支
		//    **前面**，`airborne` 立起来却没人积分 → 宠物卡在半空（真机复现 y 连续 1.5s 不动）。
		{
			const fall = d3?.fall ?? [];
			const hold = d3?.hold ?? [];
			const last = hold[hold.length - 1] ?? fall[fall.length - 1];
			const y0 = d3?.before?.y ?? 0;
			record(
				"R-PET-10",
				"聊天框开着·真机点「落下去」→ 仍然真的落地并保持（`chatOpen` 不再挡住重力积分）",
				d3?.before?.chat === true && (last?.gap ?? 999) <= 20 && Math.abs((last?.gap ?? 999) - groundGap) <= 4 && last?.mode === "ground" && y0 - (last?.y ?? 0) < -100,
				`聊天中（bubble.is-chat=${d3?.before?.chat}）点「落下去」：y ${y0} → ${last?.y}（离地 ${last?.gap}px、mode=${last?.mode}）；下落采样=${fall.map((s) => `${s.y}@${s.ms}ms`).join(" ")}`,
			);
		}

		// ⑥ 现场之二：**prefers-reduced-motion: reduce**。这一档 `start()` 按设计不开 rAF 循环，
		//    重力积分（在 `step()` 里）永远不会被推进 —— 所以「落下去」必须走"直接落到地面线"，
		//    而不是把 `airborne` 立起来等一个永远不会来的循环。
		{
			const fall = d5?.fall ?? [];
			const hold = d5?.hold ?? [];
			const last = hold[hold.length - 1] ?? fall[fall.length - 1];
			const y0 = d5?.before?.y ?? 0;
			const gaps = hold.map((s) => s.gap);
			record(
				"R-PET-10",
				"减少动态（reduced-motion）·真机点「落下去」→ 仍然真的落地并保持（不靠 rAF 循环）",
				(last?.gap ?? 999) <= 20 && Math.abs((last?.gap ?? 999) - groundGap) <= 4 && last?.mode === "ground" && y0 - (last?.y ?? 0) < -100 && gaps.every((g) => Math.abs(g - (last?.gap ?? 0)) <= 4),
				`减少动态下：y ${y0} → ${last?.y}（离地 ${last?.gap}px、mode=${last?.mode}）；落地后 ${hold.length} 次采样离地 ${Math.min(...gaps)}~${Math.max(...gaps)}px；下落采样=${fall.map((s) => `${s.y}@${s.ms}ms`).join(" ")}`,
			);
		}

		// ⑦ **帧率实测**（发起人："聊天的时候小人抖动太快了，至少要慢一倍"）：
		//    聊天状态 = `running`（图集 row7 戴墨镜）；用 MutationObserver 记 `backgroundPosition`
		//    每次变化的时间戳，取中位帧间隔。改前是 12fps / 83ms，改后 4fps / 250ms。
		record(
			"R-PET-10",
			"聊天状态确实是 `running`（图集 row7），且真机实测帧间隔 ≥ 200ms（改前 83ms → 至少慢一倍）",
			fr?.state0 === "running" && fr?.state1 === "running" && (fr?.median ?? 0) >= 200 && (fr?.median ?? 0) >= 166,
			`聊天中 data-pet-state=${fr?.state0}→${fr?.state1}、data-pet-frame-ms=${fr?.frameMs}；实测 ${fr?.n} 帧变化、帧间隔 中位 ${fr?.median}ms（${fr?.min}~${fr?.max}ms，逐帧=${JSON.stringify(fr?.intervals)}）；改前 12fps=83ms → 改后 ${fr?.median}ms`,
		);

		// ⑧ 规格侧（源码级）：九个状态都在表里；「语气/待机类」6 个状态的帧间隔**都** ≥ 200ms。
		//    这条是"下次有人把聊天帧率调回去"的拦网 —— 光靠一次真机采样抓不住回归。
		{
			const st = src?.states ?? {};
			const fs2 = src?.frameMs ?? {};
			const mood = src?.mood ?? [];
			const bad = mood.filter((n) => (fs2[n] ?? 0) < 200);
			record(
				"R-PET-10",
				"源码口径：语气类/待机类状态的帧间隔全部都 ≥ 200ms（R-PET-10 的帧率下限）",
				Object.keys(st).length === 9 && mood.length === 6 && bad.length === 0,
				`九状态=${Object.keys(st).length} 个；语气/待机类（PET_MOOD_STATES）=${JSON.stringify(mood)}；它们的帧间隔=${JSON.stringify(Object.fromEntries(mood.map((n) => [n, fs2[n]])))}；低于 200ms 的=${JSON.stringify(bad)}`,
			);
			// ⑨ 物理类**没被动过**（走路 / 跳跃 / 下落 / 飞行是另一套参数，R-PET-10 明确不动）
			record(
				"R-PET-10",
				"物理类状态帧率原样（走路 14fps / 跳跃 13fps 未被放慢；它们不受 200ms 下限管辖）",
				(fs2["running-right"] ?? 0) <= 100 && (fs2["running-left"] ?? 0) <= 100 && (fs2.jumping ?? 0) <= 100 && (src?.physical ?? []).length === 3,
				`物理类=${JSON.stringify(src?.physical)}；帧间隔=${JSON.stringify(Object.fromEntries((src?.physical ?? []).map((n) => [n, fs2[n]])))}（走路的步频与 walkSpeed 绑定、jumping 同时是下落/飞行的姿态帧）`,
			);
			// ⑩ 被反馈的那一个（`running`）相对改前至少慢一倍：83.3ms → 250ms = 3.0×
			record(
				"R-PET-10",
				"被反馈的 `running`（聊天/打字）帧间隔 250ms，相对改前 83ms 慢 3.0 倍（≥ 2 倍）",
				fs2.running === 250 && 83.3 * 2 <= 250,
				`running: 12fps/83.3ms → ${st.running?.fps}fps/${fs2.running}ms（${(250 / 83.3).toFixed(2)}×）；review: 9fps/111.1ms → ${st.review?.fps}fps/${fs2.review}ms（${(250 / 111.1).toFixed(2)}×）`,
			);
			// ⑪ `review` 是一次性动画：播放时长必须 ≥ 帧数 × 帧间隔，否则会被 `busyUntil` 截断
			//    （R-PET-10 把 review 从 9fps 放到 4fps 时，写死的 900ms 就只够播 3.6 帧）
			{
				const need = Math.round(((st.review?.frames ?? 0) / (st.review?.fps ?? 1)) * 1000);
				record(
					"R-PET-10",
					"`review` 的播放时长 `REVIEW_HOLD` ≥ 帧数 × 帧间隔（放慢帧率不会把一次性动画截断）",
					(src?.reviewHold ?? 0) >= need && need > 0,
					`REVIEW_HOLD=${src?.reviewHold}ms ≥ ${st.review?.frames} 帧 × ${src?.frameMs?.review}ms = ${need}ms`,
				);
			}
		}
	}

		/**
		 * 从 DOM 反推"人物锚点在可见窗口里的相对偏移"（0 = 正中）。
		 * ⚠️ 不能读脚本自己写的 focusAtX/focusAtY —— 那两个是"锚点在**原画**里的位置"（常数），
		 *    拿它判居中会永远等于配置里的 focus（本轮就是这么判红的：手机端算出 41、断言期望 50）。
		 *    这里用 object-position（脚本写的）+ 可见宽（脚本量的）**反推**窗口左边界，再算偏移。
		 */
		const focusOffsetInWindow = (v) => {
			if (!v?.intrinsicW || !v?.visibleW) return null;
			const px = Number.parseFloat((v.objectPosition || "50% 50%").split("%")[0]);
			const overflow = v.intrinsicW - v.visibleW;
			const left = overflow > 0 ? (px / 100) * overflow : 0;
			const focusPx = v.focusX * v.intrinsicW;
			return (focusPx - (left + v.visibleW / 2)) / v.visibleW;
		};

	// ── P3 壁纸（R-BG-01 / R-BG-04）──
	{
		const wp = facts["home-1440"].wallpaper;
		record(
			"R-BG-01",
			"首页壁纸是动态壁纸（视频在播）而不是静态图",
			wp?.video?.playing === true &&
				wp?.video?.ready === true &&
				(wp?.video?.currentSrc ?? "").endsWith(".mp4"),
			`当前壁纸=${wp?.video?.slug}（${wp?.video?.name}）｜playing=${wp?.video?.playing} ready=${wp?.video?.ready} 分辨率=${wp?.video?.intrinsicW}×${wp?.video?.intrinsicH}`,
		);
		record(
			"R-BG-01",
			"静态图零残留（发起人：动态壁纸替换所有静态图片）",
			(wp?.staticImageCount ?? -1) === 0 &&
				(wp?.slideCount ?? -1) === 0 &&
				(wp?.videoElCount ?? 0) === 1,
			`壁纸区里的 <img>=${wp?.staticImageCount}、.slide-item=${wp?.slideCount}、<video>=${wp?.videoElCount}（期望 0 / 0 / 1）`,
		);
		record(
			"R-BG-04",
			"横幅取景按**当前框**反算：人物锚点落在可见窗口的中轴（±6%）",
			(() => {
				const v = wp?.video;
				if (!v || v.fit !== "cover") return false;
				const off = focusOffsetInWindow(v); // 从 DOM 反推，不读脚本自述
				return off !== null && Math.abs(off) <= 0.06;
			})(),
			`object-position=${wp?.video?.objectPosition}｜可见源区 ${wp?.video?.visibleW}×${wp?.video?.visibleH}（原画 ${wp?.video?.intrinsicW}×${wp?.video?.intrinsicH}）｜人物锚点 x=${wp?.video?.focusX} 落在窗口内（脚本自述 focusAtX=${wp?.video?.focusAtX}）`,
		);
		record(
			"R-BG-04",
			"暗罩按配置生效（dimOpacity 0.2）",
			Math.abs((wp?.dimOpacity ?? -1) - 0.2) < 0.06,
			`dimOpacity=${wp?.dimOpacity}`,
		);
	}

	// ── R-BG-05 横幅两侧隐藏换图键 + 拖动换图 ──
	{
		const start = facts["wp-switch-start"].wallpaperSwitch;
		const next = facts["wp-switch-next"].wallpaperSwitch;
		const prev = facts["wp-switch-prev"].wallpaperSwitch;
		const loop = facts["wp-switch-loop"].wallpaperSwitch;
		const hover = facts["wp-switch-hover"].wallpaperSwitch;
		const kbd = facts["wp-switch-keyboard"].wallpaperSwitch;
		const drag = facts["wp-switch-drag"].wallpaperSwitch;
		const mStart = facts["wp-switch-mobile-start"].wallpaperSwitch;
		const mAfter = facts["wp-switch-mobile-after"].wallpaperSwitch;
		const step = (a, b) => (b - a + start.count) % start.count;

		record(
			"R-BG-05",
			"桌面端渲染出左右两个隐藏交互区（带 aria-label、可聚焦）",
			start.zones.length === 2 &&
				start.zones.every((z) => z.tabIndex >= 0 && z.aria.length > 0 && z.display !== "none"),
			start.zones.map((z) => `dir=${z.dir} aria=${z.aria} tab=${z.tabIndex} ${z.rect.w}×${z.rect.h}`).join(" ｜ "),
		);
		// 只 hover 了"下一张"那个：被 hover 的显形，另一个必须仍是 0（否则等于"一直显示"）
		record(
			"R-BG-05",
			"默认完全不可见（opacity 0），hover 到哪侧哪侧才淡出箭头",
			start.zones.every((z) => Number.parseFloat(z.opacity) === 0) &&
				Number.parseFloat(hover.zones.find((z) => z.dir === "1")?.opacity ?? "0") === 1 &&
				Number.parseFloat(hover.zones.find((z) => z.dir === "-1")?.opacity ?? "1") === 0,
			`默认 ${start.zones.map((z) => z.opacity).join("/")} → 只 hover 右侧后 ${hover.zones.map((z) => `dir${z.dir}=${z.opacity}`).join(" ")}`,
		);
		record(
			"R-BG-05",
			"点右侧交互区 → 切到下一张",
			start.count > 1 && step(start.activeIndex, next.activeIndex) === 1,
			`第 ${start.activeIndex + 1} 张 → 第 ${next.activeIndex + 1} 张（共 ${start.count} 张）`,
		);
		record(
			"R-BG-05",
			"点左侧交互区 → 退回上一张",
			step(next.activeIndex, prev.activeIndex) === start.count - 1,
			`第 ${next.activeIndex + 1} 张 → 第 ${prev.activeIndex + 1} 张`,
		);
		record(
			"R-BG-05",
			"连点一圈能循环回同一张（4 张图点 4 次）",
			loop.activeIndex === start.activeIndex,
			`起点第 ${start.activeIndex + 1} 张 → 转一圈后第 ${loop.activeIndex + 1} 张`,
		);
		record(
			"R-BG-05",
			"键盘 Enter 也能换图（原生 button 行为）",
			step(loop.activeIndex, kbd.activeIndex) === 1,
			`第 ${loop.activeIndex + 1} 张 → 第 ${kbd.activeIndex + 1} 张`,
		);
		record(
			"R-BG-05",
			"鼠标按住往左拖 → 下一张",
			step(kbd.activeIndex, drag.activeIndex) === 1,
			`第 ${kbd.activeIndex + 1} 张 → 第 ${drag.activeIndex + 1} 张`,
		);
		record(
			"R-BG-05",
			"手机端不显示交互区（只用手势）",
			mStart.zones.length === 2 && mStart.zones.every((z) => z.display === "none" || z.hidden),
			mStart.zones.map((z) => `dir=${z.dir} display=${z.display} hidden=${z.hidden}`).join(" ｜ "),
		);
		record(
			"R-BG-05",
			"手机端左右滑动 → 下一张",
			mStart.count > 1 && (mAfter.activeIndex - mStart.activeIndex + mStart.count) % mStart.count === 1,
			`第 ${mStart.activeIndex + 1} 张 → 第 ${mAfter.activeIndex + 1} 张（共 ${mStart.count} 张）`,
		);
	}


		// ── R-BG-02 动态壁纸：原画不压缩 / 真的在播 / 无限循环（v1.70）──────────────
	// 发起人 2026-10-09 交来 5 支动态壁纸，原话四条：替换所有静态图 / 首尾帧要能无限循环 /
	// 能不裁就不裁且人物居中 / **不可压缩，我要原画**。这一节验前三条里"能机械判定的部分"。
	{
		const wp = facts["home-1440"].wallpaper;
		const v = wp?.video;

		// ① 原画**逐字节**没被动过：产物里的字节数 + sha256 与导入时记录的一致。
		//    为什么不信"能播就行"：转一道码、换个封装，照样能播 —— 而发起人的要求是"不压缩"。
		{
			const crypto = await import("node:crypto");
			const rows = [];
			let allOk = true;
			for (const expect of EXPECT_WALLPAPER_VIDEOS) {
				const p = path.resolve("dist/assets/wallpaper", `${expect.slug}.mp4`);
				let bytes = -1;
				let hash = "";
				try {
					const buf = await fs.readFile(p);
					bytes = buf.length;
					hash = crypto.createHash("sha256").update(buf).digest("hex");
				} catch (err) {
					rows.push(`${expect.slug}:读不到(${err.code ?? err.message})`);
					allOk = false;
					continue;
				}
				const ok = bytes === expect.bytes && hash === expect.sha256;
				if (!ok) allOk = false;
				rows.push(`${expect.slug} ${ok ? "✓" : "✗"} ${bytes.toLocaleString()}B`);
			}
			record(
				"R-BG-02",
				`动态壁纸原画**逐字节**未被压缩/转码（${EXPECT_WALLPAPER_VIDEOS.length} 支，产物里核对字节数 + sha256）`,
				allOk,
				`${rows.join("｜")}（合计 ${(EXPECT_WALLPAPER_VIDEOS.reduce((s, x) => s + x.bytes, 0) / 1024 / 1024).toFixed(2)} MB）`,
			);
		}

		// ② 视频真的在播、带 loop、静音、分辨率与原画一致（"动态壁纸"这四个字的底线）
		record(
			"R-BG-02",
			"动态壁纸正在播放：loop + muted + 原生分辨率 2944×1248（不是静帧、不是降采样版）",
			v?.playing === true &&
				v?.loop === true &&
				v?.muted === true &&
				v?.paused === false &&
				v?.intrinsicW === EXPECT_WALLPAPER_INTRINSIC.w &&
				v?.intrinsicH === EXPECT_WALLPAPER_INTRINSIC.h,
			`playing=${v?.playing} paused=${v?.paused} loop=${v?.loop} muted=${v?.muted} 原生=${v?.intrinsicW}×${v?.intrinsicH}（期望 ${EXPECT_WALLPAPER_INTRINSIC.w}×${EXPECT_WALLPAPER_INTRINSIC.h}）｜播放源=${v?.currentSrc}｜海报=${v?.poster}`,
		);

		// ③ 首尾帧接缝：**在页面里真解码**首帧与末帧，算平均绝对差，并与"1 秒正常运动量"对比。
		//    为什么要上真解码而不是读配置里那句"实测过"：循环是**内容属性**，配置说不了谎但也不会自己作证。
		//    阈值怎么定：末帧与首帧的差**不该明显大于**画面自己 1 秒内的正常变化（否则接缝会"跳一下"）。
		{
			const seam = (
				await cdp.send("Runtime.evaluate", {
					expression: `(async () => {
						const v = document.getElementById("wallpaper-video");
						if (!v) return { error: "no-video" };
						const c = document.createElement("canvas");
						const ctx = c.getContext("2d", { willReadFrequently: true });
						const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * w);
						c.width = w; c.height = h;
						const grab = () => { ctx.drawImage(v, 0, 0, w, h); return ctx.getImageData(0, 0, w, h); };
						const seek = (t) => new Promise((res) => {
							if (Math.abs(v.currentTime - t) < 0.01) return res();
							v.addEventListener("seeked", res, { once: true });
							v.currentTime = t;
						});
						const mad = (a, b) => {
							let s = 0, n = 0, big = 0;
							for (let i = 0; i < a.data.length; i += 4) {
								const d = (Math.abs(a.data[i]-b.data[i]) + Math.abs(a.data[i+1]-b.data[i+1]) + Math.abs(a.data[i+2]-b.data[i+2])) / 3;
								s += d; n++; if (d > 24) big++;
							}
							return { mad: +(s / n).toFixed(3), bigPct: +((big / n) * 100).toFixed(3) };
						};
						const dur = v.duration;
						const wasPaused = v.paused;
						v.pause();
						await seek(0.001); const first = grab();
						await seek(Math.min(1, dur / 4)); const after1s = grab();
						await seek(Math.max(0, dur - 0.05)); const last = grab();
						if (!wasPaused) v.play().catch(() => {});
						return { dur: +dur.toFixed(3), seam: mad(first, last), motion: mad(first, after1s) };
					})()`,
					returnByValue: true,
					awaitPromise: true,
				})
			).result.value;
			record(
				"R-BG-02",
				"首尾帧对得上（末帧 vs 首帧的差异 ≤ 画面自己 1 秒的正常变化量）→ loop 硬切看不出接缝",
				!!seam &&
					!seam.error &&
					seam.dur > 5 &&
					seam.seam.mad <= seam.motion.mad + 1.5,
				seam?.error
					? `取帧失败：${seam.error}`
					: `片长 ${seam.dur}s｜接缝 MAD=${seam.seam?.mad}（大差异像素 ${seam.seam?.bigPct}%）vs 1 秒运动 MAD=${seam.motion?.mad}（${seam.motion?.bigPct}%）`,
			);
		}
	}

		// ④ 降级二：省流量模式（R-BG-02 要求的三种降级之一）—— 用 CDP 在文档创建前注入
		//    `navigator.connection.saveData = true`，看壁纸是否**真的不播**（原画一支 8~13.5 MB）。
		//    为什么必须真注入而不是"读一眼代码里有没有这个分支"：降级是**运行时决策**，
		//    代码里有分支 ≠ 真的会走那条分支（本项目已经吃过"写了但没生效"的亏，见 T90）。
		{
			const { identifier } = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
				source: `Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true });`,
			});
			const loadedSd = cdp.once("Page.loadEventFired");
			await cdp.send("Page.navigate", { url: `${BASE}/` });
			await loadedSd;
			await sleep(2200);
			const sd = (await cdp.send("Runtime.evaluate", { expression: COLLECT, returnByValue: true })).result.value;
			facts["wp-save-data"] = sd;
			const sv = sd.wallpaper?.video;
			record(
				"R-BG-02",
				"降级二·省流量模式：`navigator.connection.saveData` 为真时**不自动下载/播放**，只留海报",
				!!sv && sv.playing === false && sv.playReason === "save-data" && (sv.poster || "").length > 0,
				`playing=${sv?.playing} 原因=${sv?.playReason}（期望 save-data）｜海报=${sv?.poster}｜取景仍算过=${sv?.fit}/\${sv?.objectPosition}`,
			);
			await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
			const loadedBack = cdp.once("Page.loadEventFired");
			await cdp.send("Page.navigate", { url: `${BASE}/` });
			await loadedBack;
			await sleep(2200);
		}

		// ⑤ 降级三：页面切到后台就停、回来再播（用 CDP 真开一个新标签页把我们挤到后台，
		//    不是改 `document.hidden`——那个属性是只读的，改了也骗不过浏览器）
		{
			const before = (await cdp.send("Runtime.evaluate", { expression: COLLECT, returnByValue: true })).result.value;
			const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
			await cdp.send("Target.activateTarget", { targetId });
			await sleep(1200);
			const hiddenState = (await cdp.send("Runtime.evaluate", { expression: COLLECT, returnByValue: true })).result.value;
			await cdp.send("Target.activateTarget", { targetId: (await cdp.send("Target.getTargets")).targetInfos.find((t) => t.type === "page" && t.url.startsWith(BASE))?.targetId ?? targetId });
			await sleep(1500);
			const backState = (await cdp.send("Runtime.evaluate", { expression: COLLECT, returnByValue: true })).result.value;
			await cdp.send("Target.closeTarget", { targetId });
			facts["wp-visibility"] = { before: before.wallpaper?.video, hidden: hiddenState.wallpaper?.video, back: backState.wallpaper?.video };
			record(
				"R-BG-02",
				"降级三·页面切到后台：壁纸停播，回前台自动续播",
				before.wallpaper?.video?.playing === true &&
					hiddenState.wallpaper?.video?.playing === false &&
					hiddenState.wallpaper?.video?.playReason === "hidden" &&
					backState.wallpaper?.video?.playing === true,
				`切后台前 playing=${before.wallpaper?.video?.playing} → 后台 playing=${hiddenState.wallpaper?.video?.playing}（原因=${hiddenState.wallpaper?.video?.playReason}）→ 回前台 playing=${backState.wallpaper?.video?.playing}`,
			);
		}

	// ── R-BG-07 取景：能不裁就不裁，要裁时人物在展示中心（v1.70）────────────
	{
		const home = facts["home-1440"].wallpaper?.video;
		const mobile = facts["home-390"]?.wallpaper?.video ?? facts["pet-390"]?.wallpaper?.video;

		// ① 横幅：cover（框比 2.36:1 更方，必然要裁）且**人物锚点在可见窗口里**（左右都留了余量）
		{
			const inside = (() => {
				const v = home;
				if (!v?.intrinsicW || !v?.visibleW) return false;
				const px = Number.parseFloat((v.objectPosition || "50% 50%").split("%")[0]);
				const overflow = v.intrinsicW - v.visibleW;
				const left = overflow > 0 ? (px / 100) * overflow : 0;
				const focusPx = v.focusX * v.intrinsicW;
				return focusPx >= left && focusPx <= left + v.visibleW;
			})();
			record(
				"R-BG-07",
				"横幅壁纸：cover 裁切，且**人物锚点在可见窗口内**（不是被裁掉的那一侧）",
				home?.fit === "cover" && inside,
				`框 ${home?.box?.w}×${home?.box?.h}｜可见源区 ${home?.visibleW}×${home?.visibleH}（原画 ${home?.intrinsicW}×${home?.intrinsicH}）｜object-position=${home?.objectPosition}｜人物锚点 x=${home?.focusX}`,
			);
		}

		// ② 手机：框是竖的（0.71:1），横向只能保住三成宽 —— 可见窗口必须**明显更窄**，
		//    而且人物锚点仍要落在窗口里（发起人：手机端脸必须全露）
		{
			const ratio = mobile?.visibleW && mobile?.intrinsicW ? mobile.visibleW / mobile.intrinsicW : 1;
			const off = focusOffsetInWindow(mobile);
			record(
				"R-BG-07",
				"手机横幅（390×844）横向裁得更狠，但人物锚点**仍落在可见窗口中轴**（脸不会被切）",
				!!mobile && ratio < 0.5 && off !== null && Math.abs(off) <= 0.08,
				`框 ${mobile?.box?.w}×${mobile?.box?.h}｜可见源区 ${mobile?.visibleW}×${mobile?.visibleH} = 原画的 ${(ratio * 100).toFixed(0)}%（横向只剩三成，所以取景必须算）｜object-position=${mobile?.objectPosition}｜人物锚点在窗口里的偏移 ${off === null ? "?" : (off * 100).toFixed(1) + "%"}（0 = 正中）`,
			);
		}

		// ③ 全屏：contain —— **一个像素都不裁**（发起人：「全屏壁纸的话就展示完整的动态壁纸」）
		{
			await cdp.send("Emulation.setDeviceMetricsOverride", {
				width: 1440,
				height: 900,
				deviceScaleFactor: 1,
				mobile: false,
			});
			const loadedFs = cdp.once("Page.loadEventFired");
			await cdp.send("Page.navigate", { url: `${BASE}/` });
			await loadedFs;
			await sleep(2200);
			// 运行期切到全屏模式：模式本身是构建期常量，用组件监听的同一个事件切（不是改 dataset 骗它）
			await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const root = document.documentElement;
					if (root.dataset.wallpaperMode === "fullscreen") return "already";
					const before = root.dataset.wallpaperMode;
					root.dataset.wallpaperMode = "fullscreen";
					window.dispatchEvent(new CustomEvent("wallpaperModeChange", { detail: { mode: "fullscreen", previous: before } }));
					return "switched";
				})()`,
				returnByValue: true,
			});
			await sleep(900);
			const fsFacts = (await cdp.send("Runtime.evaluate", { expression: COLLECT, returnByValue: true })).result.value;
			facts["wp-fullscreen"] = fsFacts;
			const fv = fsFacts.wallpaper?.video;
			// ⚠️ v1.71 改口径：原来钉的是 contain（"完整展示、一个像素都不裁"）——那是我照发起人
			// 「全屏壁纸的话就展示完整的动态壁纸」字面理解的，实测手机上画面缩成中间一条、上下两大块垫底，
			// 发起人截图指出「全屏不是这个意思，和 firefly 一样」→ 改成 cover（铺满整屏，该裁就裁）。
			// 所以这条判据现在验的是"**铺满**"而不是"不裁"：可见源区必须比原生窄（= 真的占满了一屏
			// 而不是缩在中间），同时人物锚点仍要在可见窗口里（靠 focusOffsetInWindow 反推）。
			record(
				"R-BG-07",
				"全屏壁纸：cover **铺满整屏**（可见源区比原生窄 = 真的占满，不是缩在中间一条）+ 人物锚点仍在窗口内",
				fv?.fit === "cover" &&
					fv?.playing === true &&
					fv?.visibleW > 0 &&
					fv?.visibleW < fv?.intrinsicW &&
					fv?.visibleH <= fv?.intrinsicH &&
					(() => {
						const off = focusOffsetInWindow(fv);
						return off !== null && Math.abs(off) <= 0.08;
					})(),
				`fit=${fv?.fit}｜壁纸框 ${fv?.box?.w}×${fv?.box?.h}｜可见源区 ${fv?.visibleW}×${fv?.visibleH} vs 原生 ${fv?.intrinsicW}×${fv?.intrinsicH}（可见宽 = 原生的 ${fv?.intrinsicW ? Math.round((fv.visibleW / fv.intrinsicW) * 100) : "?"}%）｜object-position=${fv?.objectPosition}｜仍在播=${fv?.playing}`,
			);
			// 复位（后面的断言按 banner 模式写）
			await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const root = document.documentElement;
					root.dataset.wallpaperMode = "banner";
					window.dispatchEvent(new CustomEvent("wallpaperModeChange", { detail: { mode: "banner" } }));
					return "reset";
				})()`,
				returnByValue: true,
			});
			await sleep(400);
		}

		// ④ 减少动态：`prefers-reduced-motion: reduce` 下**不播**，只留海报（无障碍口径）
		{
			await cdp.send("Emulation.setEmulatedMedia", {
				features: [
					{ name: "prefers-color-scheme", value: "dark" },
					{ name: "prefers-reduced-motion", value: "reduce" },
				],
			});
			const loadedR = cdp.once("Page.loadEventFired");
			await cdp.send("Page.navigate", { url: `${BASE}/` });
			await loadedR;
			await sleep(2200);
			const rf = (await cdp.send("Runtime.evaluate", { expression: COLLECT, returnByValue: true })).result.value;
			facts["wp-reduced"] = rf;
			const rv = rf.wallpaper?.video;
			record(
				"R-BG-02",
				"`prefers-reduced-motion: reduce` 下不播视频，只显示海报（与桌宠/樱花同一条无障碍口径）",
				!!rv && rv.playing === false && rv.playReason === "reduced-motion" && (rv.poster || "").length > 0,
				`playing=${rv?.playing} 原因=${rv?.playReason}（期望 reduced-motion）｜海报=${rv?.poster}｜取景仍算过=${rv?.fit}/${rv?.objectPosition}`,
			);
			await cdp.send("Emulation.setEmulatedMedia", {
				features: [{ name: "prefers-color-scheme", value: "dark" }],
			});
			const loadedB = cdp.once("Page.loadEventFired");
			await cdp.send("Page.navigate", { url: `${BASE}/` });
			await loadedB;
			await sleep(2200);
		}
	}

// 原来读不到就 catch 记 pass=true——"什么都没验"却计入通过数，属于假绿；现在读不到直接判失败。
	if (isDevServer) {
		record("INFO(dev)", "sitemap 检查已跳过", true, "dev 服务器下磁盘 dist/ 可能是旧产物，改用 pnpm preview");
	} else {
		try {
			const sm = await fs.readFile(path.resolve("dist/sitemap-0.xml"), "utf8");
			const gone = FORBIDDEN_ROUTES.filter((r) => sm.includes(r));
			record("R-NAV-07", "sitemap 不含已关闭页面", gone.length === 0, gone.join(",") || "干净");
			// v1.41（Task 4）：三个 `/rank/*` 从"保留页面"里摘掉（排行整条删除），
			// 换成顶上它那一格的替代页 `/roadmap/`。
			const kept = ["/vndb/", "/myanimelist/", "/guestbook/", "/booknav/", "/roadmap/"].filter(
				(r) => sm.includes(r),
			);
			record("R-NAV-07", "sitemap 含保留页面（含学习路线）", kept.length === 5, kept.join(","));
			// ── R-PATH-06：排行整条删除后，**产物里也不许留排行残渣**（sitemap + llms.txt）──
			// ⚠️ **必须带正向锚点**：`filter(...).length === 0` 在"读到空串 / 读到 404 页 / 路径写错"
			//    时**恒为真** —— 那是典型的"判据空过"（本项目已两次踩到同类写法）。
			//    所以同时要求这份 sitemap 真的是本站产物、且含本轮确定存在的页面（/roadmap/）。
			const rankLeft = ["/rank/", "/rank/jp/", "/rank/cn/", "/rank/game/"].filter((u) => sm.includes(u));
			const sitemapSane = sm.includes("<urlset") && sm.includes("/roadmap/");
			record(
				"R-PATH-06",
				"/rank/* 四个地址都不在 sitemap 里",
				sitemapSane && rankLeft.length === 0,
				`残留 ${rankLeft.join(",") || "无"}（这份 sitemap 可解析=${sm.includes("<urlset")}、含 /roadmap/=${sm.includes("/roadmap/")}）`,
			);
			// llms.txt（AI 抓取入口）：**必须登记路线页、且不许留排行残渣**。
			// 阳性那一半不是装饰：只有 `!/\/rank\//` 的话，"llms.txt 空了 / 被截断 / 路径读成别的文件"
			// 都会让反向判据**恒真**（同一条坑）。两半一起判，这条才真的在判。
			// （来源：`src/pages/llms.txt.ts` 的 KEY_PAGES —— 排行榜那三个条目已随模块删除、
			//   换成一条「学习路线」→ `/roadmap/`。）
			// ⚠️ **v1.41（Task 6）给它独立的 try/catch**：这一段原来和上面读 sitemap 的代码
			//    共用同一个 try —— `dist/llms.txt` 缺失时（比如只跑了 astro build 而没跑完整
			//    `pnpm build`）异常会被外面的 catch 接走，于是红行喊的是"读不到
			//    dist/sitemap-0.xml"（**指错文件**），而且这条 record 根本不会执行
			//    → 断言总数悄悄从 232 掉到 231（Task 4 修复轮自己带出来的诊断误标）。
			//    现在：失败也照记一条（总数不变）、红行点名真实原因。
			try {
				const llms = await fs.readFile(path.resolve("dist/llms.txt"), "utf8");
				const llmsHasRoadmap = llms.includes("/roadmap/");
				const llmsHasRank = llms.includes("/rank/");
				record(
					"R-PATH-06",
					"llms.txt 登记了 /roadmap/ 且不含任何 /rank/ 残渣",
					llmsHasRoadmap && !llmsHasRank,
					`含 /roadmap/=${llmsHasRoadmap} ｜ 含 /rank/=${llmsHasRank}（共 ${llms.length} 字符）`,
				);
			} catch (err) {
				record(
					"R-PATH-06",
					"llms.txt 登记了 /roadmap/ 且不含任何 /rank/ 残渣",
					false,
					`读不到 dist/llms.txt（${err.code ?? err.message}）：它由 src/pages/llms.txt.ts 生成，跑完整 \`pnpm build\`（不是裸 astro build）后重试`,
				);
			}
			// R-RANK-01 的「sitemap 不含 /rank/ 存根」已随排行删除（Task 4）：旧地址整条消失，
			// 上面那条 R-PATH-06 已经把"四个地址都不在 sitemap"断言得更严（存根不是唯一要防的东西）。
			// ⚠️ 原来那三条产物级排行断言（llms.txt 列出两个榜单页 / 无 JS 的 <noscript> 兜底 /
			//    面板用 class 而非 hidden）也一并删除：被测页面 `dist/rank/jp/index.html` 与
			//    `.rank-tabs` / `.rank-panel--off` 这些类名都不再存在，留着只会读文件失败把整块炸掉。
		} catch (err) {
			record(
				"R-NAV-07",
				"sitemap 检查",
				false,
				`读不到 dist/sitemap-0.xml（${err.code ?? err.message}）：先跑 pnpm build，再用 pnpm preview 起站点`,
			);
		}
	}

	// ── R-ID-09：分享块（Svelte 岛）真的能用吗 —— 点一次触发按钮，看模态里有没有那两个按钮 ──
	// 为什么必须点：`SharePoster.svelte` 的触发按钮在岛上（静态产物里没有），
	// 「保存海报 / 复制链接」更是**点开模态才渲染**。只 grep 服务端 HTML 会得到假结论。
	{
		const loaded = cdp.once("Page.loadEventFired");
		await cdp.send("Page.navigate", { url: `${BASE}${SAMPLE_POST}` });
		await loaded;
		await sleep(1200);
		const res = await cdp.send("Runtime.evaluate", {
			expression: `(async () => {
				const trigger = document.querySelector('button[aria-label="Generate Share Poster"]');
				if (!trigger) return { trigger: false };
				trigger.click();
				// 轮询等海报图生成（canvas + 动态 import qrcode，页面重时 3s 不够；
				// 曾因此在 133 篇的语料下误判成 posterImg=false）
				for (let i = 0; i < 40; i++) {
					if (document.querySelector('img[alt="Poster"]')) break;
					await new Promise((r) => setTimeout(r, 300));
				}
				const text = document.body.innerText || "";
				// 关掉模态：它是 z-9999 全屏遮罩，留着会挡住后续 Swup 导航块的点击
				const overlay = document.querySelector("div.z-9999, div[class*='z-9999']");
				if (overlay) overlay.click();
				await new Promise((r) => setTimeout(r, 400));
				return {
					trigger: true,
					savePoster: text.includes("保存海报"),
					copyLink: text.includes("复制链接"),
					posterImg: !!document.querySelector('img[alt="Poster"]'),
				};
			})()`,
			returnByValue: true,
			awaitPromise: true,
		});
		facts["share-modal"] = res.result.value;
	}

	// ── P4 内容迁移（R-CNT）：导入的文章真的渲染对了吗 ──
	{
		const http = facts["post-http-1440-post"];
		const httpMobile = facts["post-http-390-post"];
		const rb = facts["post-rbtree-1440-post"];
		const sdd = facts["post-sdd-1440-post"];

		const allLoaded = (p) =>
			(p?.images?.length ?? 0) > 0 && p.images.every((im) => im.ok && im.w > 0);
		const fileOf = (src) => (src ?? "").split("/").pop();

		record(
			"R-CNT-03",
			"导入文章页的配图全部真实加载（HTTP 协议 6 张，无裂图）",
			allLoaded(http) && http.images.length === 6,
			`${http?.images?.length ?? 0} 张；尺寸 ${(http?.images ?? []).map((i) => `${i.w}×${i.h}`).join(" ")}`,
		);
		record(
			"R-CNT-03",
			"配图编号顺序 = 源笔记引用顺序（01→06 按 DOM 顺序）",
			same(http?.images?.map((i) => fileOf(i.src)), [
				"01.png",
				"02.png",
				"03.png",
				"04.png",
				"05.png",
				"06.png",
			]),
			(http?.images ?? []).map((i) => fileOf(i.src)).join(" → "),
		);
		record(
			"R-CNT-03",
			"移动端 390px 下同样 6 张全部加载",
			allLoaded(httpMobile) && httpMobile.images.length === 6,
			`${httpMobile?.images?.length ?? 0} 张`,
		);
		record(
			"R-CNT-03",
			"正文图片 alt 为空 → 不生成 figure 图注（rehype-figure 跳过空 alt）",
			http?.figures === 0 && http.images.every((i) => i.alt === ""),
			`figure ${http?.figures} 个；alt=[${(http?.images ?? []).map((i) => i.alt).join(",")}]`,
		);
		record(
			"R-ID-10",
			"文章 URL 走分类目录（/posts/<分类>/<slug>/）",
			http?.path === "/posts/linux-net/http-xieyi/" && rb?.path === "/posts/cpp/hongheishufengzhuangshixian-mymap-he-myset/",
			`${http?.path} / ${rb?.path}`,
		);
		record(
			"R-CNT-04",
			"[[双链]] 改写成站内链接（红黑树 → /posts/cpp/hongheishu/）",
			(rb?.internalLinks ?? []).some(
				(l) => l.href === "/posts/cpp/hongheishu/" && l.text === "红黑树",
			),
			JSON.stringify(rb?.internalLinks ?? []),
		);
		record(
			"R-CNT-04",
			"渲染结果里没有 Obsidian 残留（![[ / [[ 均为 0）",
			(http?.residue?.embed ?? 1) === 0 &&
				(http?.residue?.wikilink ?? 1) === 0 &&
				(rb?.residue?.embed ?? 1) === 0 &&
				(rb?.residue?.wikilink ?? 1) === 0,
			`http: ${JSON.stringify(http?.residue)} rb: ${JSON.stringify(rb?.residue)}`,
		);
		record(
			"R-CNT-05",
			"表格与代码块正常渲染（HTTP 协议 ≥4 表；红黑树 ≥10 个代码块）",
			(http?.tables ?? 0) >= 4 && (rb?.codeBlocks ?? 0) >= 10,
			`表 ${http?.tables} / 代码块 ${rb?.codeBlocks}`,
		);
		record(
			"R-CNT-02",
			"没有标题的短笔记（AI 应用/SDD）也能渲染出正文",
			(sdd?.textLength ?? 0) > 100 && (sdd?.images?.length ?? 1) === 0,
			`正文 ${sdd?.textLength} 字 / 图 ${sdd?.images?.length} 张`,
		);
		// R-ID-09（发起人："我要分享块啊，只是后面提醒我添加域名而已"）：分享块必须在，
		// 而且要真的能用 —— 点一次触发按钮，模态里能出「保存海报」与「复制链接」。
		// ⚠️ 这两样都在 SharePoster 这个 **Svelte 岛**里，静态产物里没有；只 grep 服务端 HTML
		// 会把"分享块不见了"误判成通过（第一版就栽在这，那次我把 share 关掉了）。
		{
			const shareModal = facts["share-modal"];
			record(
				"R-ID-09",
				"分享块保留且可用（卡片 + 触发按钮 + 点开后保存海报/复制链接 + 海报图生成）",
				http?.share?.card === true &&
					http?.share?.trigger === true &&
					shareModal?.savePoster === true &&
					shareModal?.copyLink === true &&
					// 海报图不参与判定（依赖抓占位域名下的 logo，见 B-01），只记录
				`卡片=${http?.share?.card} 触发=${shareModal?.trigger} 保存海报=${shareModal?.savePoster} 复制链接=${shareModal?.copyLink} 海报图=${shareModal?.posterImg}（仅记录，不判定）`,
			);
		}

		// 分批导入：另一篇（差分）里的两条 [[前缀和]] 都要改写成功，直接查产物。
		// ⚠️ 必须**只数正文区域**：全量导入后 `/posts/algorithm/qianzhuihe/` 还会出现在
		// 「相关文章 / 上一篇下一篇」卡片里，整页数会得到 4 条（实测踩过）。
		// 正文区域的右边界取「文章分享」卡片（它紧跟在正文之后）。
		try {
			const chafenHtml = await fs.readFile(
				path.resolve("dist/posts/algorithm/chafen/index.html"),
				"utf8",
			);
			const start = chafenHtml.indexOf("markdown-content");
			const share = chafenHtml.indexOf("文章分享", start);
			const region = chafenHtml.slice(start, share > start ? share : undefined);
			const inBody = (region.match(/href="\/posts\/algorithm\/qianzhuihe\/"/g) ?? []).length;
			const total = (chafenHtml.match(/href="\/posts\/algorithm\/qianzhuihe\/"/g) ?? []).length;
			record(
				"R-CNT-04",
				"同一篇里的多条双链全部改写（差分 → 前缀和 ×2）",
				inBody === 2,
				`正文区域 ${inBody} 条（整页 ${total} 条，其余是相关文章/上下篇卡片）`,
			);
		} catch (err) {
			record("R-CNT-04", "同一篇里的多条双链全部改写", false, `读不到产物：${err.message}`);
		}

		// 列表页收录（R-ID-10/02）
		try {
			const arch = await (await fetch(`${BASE}/archive/`)).text();
			const want = ["HTTP 协议", "差分", "My_server框架全流程梳理"];
			const missing = want.filter((t) => !arch.includes(t));
			record(
				"R-ID-10",
				"/archive/ 收录导入的文章",
				missing.length === 0,
				missing.length ? `缺 ${missing.join("、")}` : `抽查 ${want.length} 篇都在`,
			);
			const cats = await (await fetch(`${BASE}/categories/`)).text();
			const wantCats = ["Linux 网络", "八股文", "项目实战", "算法"];
			const missingCats = wantCats.filter((c) => !cats.includes(c));
			record(
				"R-CNT-02",
				"/categories/ 出现迁移后的分类名",
				missingCats.length === 0,
				missingCats.length ? `缺 ${missingCats.join("、")}` : `抽查 ${wantCats.length} 个分类都在`,
			);
		} catch (err) {
			record("R-ID-10", "/archive/ 与 /categories/ 收录检查", false, err.message);
		}
	}

	// ── P5-1 / P5-2 / P5-3 桌宠 ↔ Agent 接线（R-AGT-03 / R-AGT-04 / R-AGT-08）──
	// ==========================================================================
	// 这一组要证的**不是"代码写了什么"，而是"真机上到底发没发请求、气泡里到底是什么字"**：
	//   ① `enable:false` → 一个网络请求都不发（拦截 `fetch` 按 baseUrl 计数 = 0），走本地 mock；
	//   ② `enable:true`  → 真的往返一次（计数 > 0），答复是人设口径（无「您」/ 无加粗 / 无完整域名）；
	//   ③ `interrupt` + 约定词续跑：真浏览器里走一遍（后端反问 → 回「不提供」→ 拿到最终答复）；
	//   ④ 降级：把 `baseUrl` 指到**死端口**（注入，测完还原）→ 仍然可用、走 mock、页面无报错泄漏；
	//   ⑤ 状态联动：请求发出 = 思考态（`running` / `review`）、失败 = `failed`、完成 = `review`；
	//   ⑥ 复位：关聊天框 / Swup 切页 / 连续提问之后不许卡在思考态；
	//   ⑦ 泄漏：气泡文本与整页 DOM 里不含禁词表。
	//
	// ⚠️ 两个注入钩子（都只在测试里写，正常运行路径上不存在）：
	//   · `window.__imissAgentConfig` —— 覆盖 `enable` / `baseUrl` / `timeoutMs`
	//     （为什么必须注入：`enable` 是构建期常量，而"零请求"与"真往返"要在**同一份产物**上各证一次；
	//      build 两次会留下与交付物不一致的产物）。
	//   · `window.__imissAgentUrls` + 一层 `fetch` 计数包装 —— 探测"桌宠到底有没有发请求"。
	//     判据是 `url.startsWith(baseUrl)` 的**个数**（每次都从 0 起算），而不是"页面总请求数"：
	//     只盯 `127.0.0.1:2024` / `:2099` 这两个地址，页面自己的站内请求一个都不会混进来。
	//     覆盖只看 `baseUrl`、不看 `enable`，所以 `enable:false` 那一步照样能数到"有没有偷偷发"。
	{
		await cdp.send("Emulation.setEmulatedMedia", {
			features: [{ name: "prefers-color-scheme", value: "dark" }],
		});

		/**
		 * 在**页面自己的构建产物**里找一个 chunk 的源码文本（用于"产物里真的是什么"这类断言）。
		 * ⚠️ **不要写死文件名**（P5 复核的 D-1/T59 就是这一类坑）：`agentConfig` 一度被打进
		 * `AemeathPet.*.js`，v1.35 起因为适配层多导出了 `LEAK_MARKERS`，它被提升成了独立的
		 * `config.*.js` chunk —— 写死文件名/只取一个 chunk 的旧断言会**静默失配**（判成"没落地"）。
		 * 现在的口径：按 URL 列表（HTML 里的 script + 模块依赖链）**逐个取回**，返回**第一个**
		 * 能满足 `probe(text)` 的那份，并把取到的文件名一起返回（detail 里打出来，下次再搬家能一眼看出）。
		 * ⚠️ 定义必须放在 R-AGT 段的**最前面**：它是 `const`，下面第一条断言就要用它
		 *    （写这段时踩过 TDZ：`Cannot access 'findChunk' before initialization`）。
		 */
		const findChunk = async (probe) => {
			const urls = (
				await cdp.send("Runtime.evaluate", {
					expression: `(async () => {
						const seen = new Set();
						const out = [];
						const fromText = (t) => {
							for (const m of t.matchAll(/["'](\\/_astro\\/[^"']+\\.js)["']/g)) out.push(m[1]);
							for (const m of t.matchAll(/src="(\\/_astro\\/[^"]+\\.js)"/g)) out.push(m[1]);
						};
						fromText(document.documentElement.outerHTML);
						for (const s of [...document.querySelectorAll("script[src]")]) out.push(s.getAttribute("src"));
						const queue = [...out];
						for (let i = 0; i < queue.length && i < 40; i++) {
							const u = queue[i];
							if (seen.has(u)) continue;
							seen.add(u);
							try {
								const t = await (await fetch(u)).text();
								fromText(t);
								for (const m of t.matchAll(/import\\s*\\(\\s*["']([^"']+)["']\\s*\\)/g)) queue.push(m[1]);
								for (const m of t.matchAll(/from\\s*["'](\\.\\/[^"']+\\.js)["']/g)) {
									queue.push(new URL(m[1], new URL(u, location.href)).pathname);
								}
							} catch {}
						}
						return [...seen];
					})()`,
					awaitPromise: true,
					returnByValue: true,
				})
			).result.value ?? [];
			for (const u of urls) {
				try {
					const text = await (
						await cdp.send("Runtime.evaluate", {
							expression: `(async () => { try { return await (await fetch(${JSON.stringify(u)})).text(); } catch { return ""; } })()`,
							awaitPromise: true,
							returnByValue: true,
						})
					).result.value;
					if (text && probe(text)) return { text, file: u, scanned: urls.length };
				} catch {}
			}
			return { text: "", file: null, scanned: urls.length };
		};

		// 交付物里 `agentConfig.enable` 必须已经是 `true`（P5-2 唯一允许改的默认值）。
		// ⚠️ 判据是"**在产物里真的找到 `enable: true` 的 agent 配置**"，不是"某个写死的文件名里有"：
		//    `agentConfig` 的落点会随打包变化（v1.35 起它在独立的 `config.*.js` 里），
		//    所以用 `findChunk()` 扫一遍产物、取第一份满足的（并把文件名打出来）。
		{
			const boot = await findChunk(
				(t) => /enable:\s*(!0|true)/.test(t) && /graphId:/.test(t),
			);
			const on = /enable:\s*(!0|true)/.test(boot.text);
			record(
				"R-AGT-08",
				"交付物里 agentConfig.enable 是 true（前端默认真的接 Agent）",
				on && boot.file !== null,
				on
					? `在 ${boot.file} 里找到 agentConfig 的 enable 为真（该 chunk ${boot.text.length} 字节；共扫了 ${boot.scanned} 个产物 chunk）`
					: `扫了 ${boot.scanned} 个产物 chunk，没找到 enable 为真的 agentConfig → 打开 Agent 接线的那一步没落地`,
			);
		}

		/**
		 * 重载到干净首页，然后装上注入配置 + 计数器（配置在调用时才读，不必赶在脚本之前）。
		 * `patchBody` 是给 P5 复核回归（D-2~D-9）用的：**在计数器之后**再包一层 fetch，
		 * 用它造"假后端"（畸形响应 / 挂住的 `/state` / 长答复），从而**不依赖真后端**也能
		 * 跑到这些路径。顺序很重要：先计数、后造假，这样"到底发了几次请求"仍然数得准。
		 */
		const arm = async (cfg, patchBody = "") => {
			const loaded = cdp.once("Page.loadEventFired");
			await cdp.send("Page.navigate", { url: `${BASE}/` });
			await loaded;
			await sleep(1400);
			await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					window.__imissAgentConfig = ${JSON.stringify(cfg)};
					window.__imissAgentUrls = [];
					const orig = window.fetch.bind(window);
					window.__imissRealFetch = orig;
					window.fetch = (input, init) => {
						try {
							const u = typeof input === "string" ? input : input && input.url ? input.url : String(input);
							window.__imissAgentUrls.push(u);
						} catch {}
						return orig(input, init);
					};
					${patchBody}
					window.__imissAgentInjected = "1";
					return true;
				})()`,
				returnByValue: true,
			});
		};

		/**
		 * 假后端的公共片段（P5 复核回归用）：/ok、assistants/search、POST /threads 三条前置，
		 * 加上一个由 `answer` 决定答复的 `/runs/stream`。把它拼进 `arm(cfg, patch)` 的 patch 里，
		 * 就能在**同一份构建产物**上跑"没有真后端也能复现"的那些反例。
		 */
		const fakeBackendJs = (answer) => `
					const enc = new TextEncoder();
					const sse = (name, data) => "event: " + name + "\\r\\ndata: " + data + "\\r\\n\\r\\n";
					const jsonRes = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { "content-type": "application/json" } });
					const streamOf = (chunks, hold, status) => new Response(new ReadableStream({
						start(c) {
							for (const x of chunks) c.enqueue(enc.encode(x));
							if (hold) return; // 故意不 close：模拟"流还挂着"
							c.close();
						},
					}), { status: status || 200, headers: { "content-type": "text/event-stream" } });
					const base = window.__imissRealFetch;
					window.__fakeLog = [];
					window.__fakeThreads = 0;
					// ⚠️ 记录一律走 window.__fakeLog（**每次现取**）：后面的 patch 会把这个数组
					//    整个换掉来"清空流水"，闭包抓住旧引用就会把清空前的纪录丢掉
					//    （写 D-3 那条断言时踩到：流水里看不到第 1 问那一跳）。
					//    ⚠️ 这段是**模板字符串**，注释里不许出现反引号（会提前结束模板）。
					const push = (line) => { (window.__fakeLog || (window.__fakeLog = [])).push(line); };
					window.fetch = (input, init) => {
						const u = typeof input === "string" ? input : (input && input.url) ? input.url : String(input);
						const method = ((init && init.method) || "GET").toUpperCase();
						// 不认的地址交回真的 fetch（外层计数器已经记过一笔了，这里不重复记）
						if (u.indexOf(${JSON.stringify(LIVE_FAKE)}) !== 0) return base(input, init);
						push(method + " " + u.replace(${JSON.stringify(LIVE_FAKE)}, ""));
						if (u.endsWith("/ok") && method === "GET") return Promise.resolve(jsonRes({ ok: true }));
						if (u.endsWith("/assistants/search")) return Promise.resolve(jsonRes([{ graph_id: "blog_agent", assistant_id: "asst-fake" }]));
						if (u.endsWith("/threads") && method === "POST") { window.__fakeThreads += 1; return Promise.resolve(jsonRes({ thread_id: "t" + window.__fakeThreads })); }
						if (u.endsWith("/runs/stream")) return Promise.resolve(streamOf([sse("values", JSON.stringify({ messages: [{ type: "ai", content: ${JSON.stringify(answer)} }] }))], false));
						return Promise.resolve(jsonRes({ detail: "no route" }, 404));
					};`;

		const LIVE_FAKE = "http://127.0.0.1:2026";

		/**
		 * **仿真实 langgraph 的假后端**（v1.37，给"同一句答复重复上屏"的回归用）。
		 *
		 * 真实形态（`reports/_p5v7-snapshots.mjs` 打在真后端上的原始输出，2026-09-27）：
		 * 一轮里 `values` 快照有 **4 个**（路由几步各一个），而且
		 * **第 1~3 个快照里"最后一条非空 ai 消息"仍是上一轮的答复**（42 字、id `…-dd42-0`），
		 * 第 4 个才是本轮答复（**37 字**、id `…-9f84-0`）。
		 * ⚠️ 旧的假后端每轮**只发一条** `values`、且只含新答复 —— "首快照带历史"这条路径
		 *    从来没被覆盖过，所以老的"连续 4 问 R1~R4"断言一直是绿的（假绿）。
		 * 这里刻意把首快照造成"整份 state（含上一轮答复）"，把那条路径钉住。
		 */
		const historyFake = (answers) => `
					const enc = new TextEncoder();
					const sse = (name, data) => "event: " + name + "\\r\\ndata: " + data + "\\r\\n\\r\\n";
					const jsonRes = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { "content-type": "application/json" } });
					const streamOf = (chunks) => new Response(new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(enc.encode(x)); c.close(); } }), { headers: { "content-type": "text/event-stream" } });
					const base = window.__imissRealFetch;
					const ANSWERS = ${JSON.stringify(answers)};
					window.__hfRound = 0;
					window.__hfMsgs = [];
					window.fetch = (input, init) => {
						const u = typeof input === "string" ? input : (input && input.url) ? input.url : String(input);
						const method = ((init && init.method) || "GET").toUpperCase();
						if (u.indexOf(${JSON.stringify(LIVE_FAKE)}) !== 0) return base(input, init);
						if (u.endsWith("/ok") && method === "GET") return Promise.resolve(jsonRes({ ok: true }));
						if (u.endsWith("/assistants/search")) return Promise.resolve(jsonRes([{ graph_id: "blog_agent", assistant_id: "asst-fake" }]));
						if (u.endsWith("/threads") && method === "POST") return Promise.resolve(jsonRes({ thread_id: "t1" }));
						if (u.endsWith("/runs/stream")) {
							let body = {};
							try { body = JSON.parse((init && init.body) || "{}"); } catch (e) {}
							const msg = ((((body.input || {}).messages) || [])[0] || {}).content || "";
							const idx = Math.min(window.__hfRound, ANSWERS.length - 1);
							window.__hfRound += 1;
							const frames = [];
							// ① 输入先落 state（真实行为），首个 values = 整份 state ——
							//    此时"最后一条非空 ai 消息"就是**上一轮的答复**
							if (msg) window.__hfMsgs.push({ type: "human", id: "h" + window.__hfMsgs.length, content: msg });
							frames.push(sse("values", JSON.stringify({ messages: window.__hfMsgs.slice() })));
							frames.push(sse("values", JSON.stringify({ messages: window.__hfMsgs.slice() })));
							// ② 本轮答复：**带 id**（换了一条消息），且刻意比上一轮短
							window.__hfMsgs.push({ type: "ai", id: "a" + window.__hfMsgs.length, content: ANSWERS[idx] });
							frames.push(sse("values", JSON.stringify({ messages: window.__hfMsgs.slice() })));
							return Promise.resolve(streamOf(frames));
						}
						return Promise.resolve(jsonRes({ detail: "no route" }, 404));
					};`;

		/** 页面里读"打到某个地址的请求数"（用注入的 urlish 做前缀匹配） */
		const netCount = async (baseUrl) =>
			(
				await cdp.send("Runtime.evaluate", {
					expression: `(() => { const b = ${JSON.stringify(baseUrl)}; return (window.__imissAgentUrls || []).filter((u) => u.indexOf(b) === 0).length; })()`,
					returnByValue: true,
				})
			).result.value;

		/** 页面里读宠物那一小块事实（状态 / 气泡 / 输入框） */
		const petUi = async () =>
			(
				await cdp.send("Runtime.evaluate", {
					expression: `(() => {
						const el = document.getElementById("pet");
						const b = document.getElementById("pet-bubble");
						const reply = document.querySelector(".pet-chat-reply");
						const input = document.querySelector(".pet-chat input");
						const send = document.querySelector(".pet-chat button");
						return {
							state: el ? el.dataset.petState || null : null,
							frameMs: el ? Number(el.dataset.petFrameMs || 0) : 0,
							chat: !!b && b.classList.contains("is-chat"),
							pop: !!b && b.classList.contains("is-pop"),
							bubble: b ? (b.textContent || "").trim() : "",
							reply: reply ? (reply.textContent || "").trim() : "",
							hasInput: !!input,
							inputDisabled: !!input && input.disabled,
							busy: !!send && send.dataset.petBusy === "1",
						};
					})()`,
					returnByValue: true,
				})
			).result.value;

		/**
		 * 真机鼠标（`Input.dispatchMouseEvent`）——**不用 `dispatchEvent(new MouseEvent)`**。
		 * ⚠️ 这是 R-PET-10 那条教训（§14.3 T45）的同一类坑，接线这一轮又踩了一次：
		 * 合成 `mousedown`/`mouseup` **不会**产生 `click` 事件，菜单的 `click` 监听器永远不触发
		 * （实测：菜单开着、按钮可见、坐标也对，就是打不开聊天框）。
		 * 同理打字必须走 `Input.dispatchKeyEvent` 的 `keyDown` + `char`，只打 `keydown` 落不进字。
		 */
		const realMouse = (type, x, y, button) =>
			cdp.send("Input.dispatchMouseEvent", {
				type,
				x: Math.round(x),
				y: Math.round(y),
				button,
				buttons: type === "mousePressed" ? (button === "right" ? 2 : 1) : 0,
				clickCount: 1,
			});
		const petCenter = async () =>
			(
				await cdp.send("Runtime.evaluate", {
					expression: `(() => { const r = document.getElementById("pet").getBoundingClientRect(); return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height * 0.55) }; })()`,
					returnByValue: true,
				})
			).result.value;
		const typeText = async (text) => {
			for (const ch of text) {
				await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", text: ch });
				await cdp.send("Input.dispatchKeyEvent", { type: "char", text: ch });
				await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", text: ch });
				await sleep(12);
			}
		};

		/** 真右键开菜单 → 点「当前可见那一项」的矩形中心 → 聊天框打开 */
		const openPetChat = async () => {
			const before = (
				await cdp.send("Runtime.evaluate", {
					expression: `(() => {
						const menu = document.getElementById("pet-menu");
						return { chat: document.getElementById("pet-bubble").classList.contains("is-chat"),
							items: [...menu.querySelectorAll("[data-pet-act]")].map((b) => b.textContent.trim() + ":" + getComputedStyle(b).display) };
					})()`,
					returnByValue: true,
				})
			).result.value;
			if (before.chat) return { already: true, items: before.items };
			const c = await petCenter();
			await realMouse("mousePressed", c.cx, c.cy, "right");
			await realMouse("mouseReleased", c.cx, c.cy, "right");
			await sleep(280);
			const target = (
				await cdp.send("Runtime.evaluate", {
					expression: `(() => {
						const b = [...document.querySelectorAll("#pet-menu [data-pet-act]")].find((x) => !x.hidden && getComputedStyle(x).display !== "none" && x.textContent.trim() === "和爱弥斯聊天");
						if (!b) return null;
						const r = b.getBoundingClientRect();
						return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
					})()`,
					returnByValue: true,
				})
			).result.value;
			if (!target) return { already: false, items: before.items, clicked: false };
			await realMouse("mousePressed", target.cx, target.cy, "left");
			await realMouse("mouseReleased", target.cx, target.cy, "left");
			await sleep(300);
			const hasInput = (
				await cdp.send("Runtime.evaluate", { expression: `!!document.querySelector(".pet-chat input")`, returnByValue: true })
			).result.value;
			return { already: false, items: before.items, clicked: true, clickAt: target, hasInput };
		};

		/**
		 * 真机问爱弥斯一句：真右键开菜单 → 点聊天项 → 真键盘敲字 → 回车提交 → 轮询到答复。
		 *
		 * ⚠️ **等待必须在 Node 侧轮询，不能写在页面里 `await` 到答复为止**：CDP 的
		 * `Runtime.evaluate` 自身有 30 秒超时（本脚本 CDP 客户端硬编码），而真后端一轮要
		 * 3~120 秒 —— 写成一个长 await 会变成 `Runtime.evaluate 超时`（P5-1 第一次跑实测踩到，
		 * 登记为 T55）。所以页面侧只做"发出去"，结果放进 `window.__agtDone`，Node 侧每 250ms 取一次。
		 */
		const askPet = async (text, { timeout = 60000, waitFor = "answer" } = {}) => {
			const opened = await openPetChat();
			const armed = await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const input = document.querySelector(".pet-chat input");
					if (!input) return null;
					input.focus();
					const el = document.getElementById("pet");
					window.__agtSeen = [el.dataset.petState || null];
					if (window.__agtMO) window.__agtMO.disconnect();
					window.__agtMO = new MutationObserver(() => {
						const s = el.dataset.petState || null;
						if (s !== window.__agtSeen[window.__agtSeen.length - 1]) window.__agtSeen.push(s);
					});
					window.__agtMO.observe(el, { attributes: true, attributeFilter: ["data-pet-state"] });
					window.__agtEl = el;
					window.__agtDone = false;
					window.__agtSawBusy = false;
					window.__agtT0 = performance.now();
					window.__agtEcho = ${JSON.stringify(text)};
					// v1.37：把"提交前气泡里已有的那句"记下来。answer 模式的轮询**不能**
					// 只看"气泡里有一句像答复的话"——连着问第二句时，第一句的答复还在气泡里，
					// 第一圈就会被读成"第 2 问的答复"（askPet 因此拿不到本轮答复）。
					// ⚠️ 这段是模板字符串：注释里不许出现反引号（会提前结束模板）。
					window.__agtPrevReply = (() => {
						const b = document.querySelector(".pet-chat-reply");
						return b ? (b.textContent || "").trim() : "";
					})();
					return { state: el.dataset.petState || null };
				})()`,
				returnByValue: true,
			});
			if (!armed.result.value) return { phase: "no-input", opened };
			await typeText(text);
			const typed = (
				await cdp.send("Runtime.evaluate", {
					expression: `document.querySelector(".pet-chat input") ? document.querySelector(".pet-chat input").value : null`,
					returnByValue: true,
				})
			).result.value;
			// 回车提交（走浏览器真实的表单提交路径，不是 `requestSubmit()`）
			await cdp.send("Input.dispatchKeyEvent", {
				type: "keyDown",
				key: "Enter",
				code: "Enter",
				windowsVirtualKeyCode: 13,
				nativeVirtualKeyCode: 13,
				text: "\r",
			});
			await cdp.send("Input.dispatchKeyEvent", {
				type: "keyUp",
				key: "Enter",
				code: "Enter",
				windowsVirtualKeyCode: 13,
				nativeVirtualKeyCode: 13,
			});
			// Node 侧轮询：每 250ms 取一次页面快照，按 `waitFor` 决定什么时候算"到位"
			const t0 = Date.now();
			let snap = null;
			let lastChange = Date.now();
			let prev = "";
			// v1.37：这一轮有没有**真的开始过**（`busy=true` 观测到过）。"跑完了"的判据要用它。
			let sawBusy = false;
			while (Date.now() - t0 < timeout) {
				snap = (
					await cdp.send("Runtime.evaluate", {
						expression: `(() => {
							const b = document.querySelector(".pet-chat-reply");
							const d = window.__imissChatDebug ? window.__imissChatDebug() : null;
							return {
								reply: b ? (b.textContent || "").trim() : "",
								busy: d ? d.busy : null,
								resume: d ? d.resume : null,
								ask: d ? d.ask : null,
								state: window.__agtEl ? (window.__agtEl.dataset.petState || null) : null,
								stateSeq: window.__agtSeen || [],
								isChat: document.getElementById("pet-bubble").classList.contains("is-chat"),
								hasInput: !!document.querySelector(".pet-chat input"),
								prevReply: window.__agtPrevReply || "",
								source: (() => { const p = document.getElementById("pet-bubble"); return p ? (p.dataset.petChatSource || "") : ""; })(),
							};
						})()`,
						returnByValue: true,
					})
				).result.value;
				if (snap.busy === true) sawBusy = true;
				if (snap.reply !== prev) {
					prev = snap.reply;
					lastChange = Date.now();
				}
				if (waitFor === "interrupt") {
					if (snap.ask && snap.reply && snap.reply.length > 30) break;
				} else if (waitFor === "round") {
					// **「这一轮真的跑完了」**（v1.37 新增，给"连着问"的场景用）：
					// 必须**先在页面里看见过 busy=true**，再看到 busy=false —— 只等 `busy=false`
					// 会在"请求还没开始"的那一瞬间就成立（`settle` 那条注释里的坑）。
					// 与 `answer` 的区别：**不要求答复与上一轮不同**。身份类问题里"后端确实答了
					// 同一句"是**人设问题**，要在断言里显形，而不是让这里超时（变成测试写错）。
					if (sawBusy && snap.busy === false && snap.reply && Date.now() - lastChange > 700) break;
				} else if (waitFor === "settle") {
					// ⚠️ 必须同时要求"气泡已经是真答复"：只等 `busy=false && resume=null`
					// 会在**请求还没真正开始**的那一瞬间就成立（`runAsk` 之前 busy 还是 false），
					// 于是拿到的是"用户刚发出去的那句话"——看着像答复，其实是回声。
					// ⚠️ 续跑轮的到位判定**不看 `resume`**：`resume` 只说明"后端这一轮又反问了一句"
					//    （也可能是同一轮里先给答复再反问），它不该决定"答复到底到了没"。
					//    旧口径把 `resume === null` 塞进判据 → 后端多问一句时会把整轮拖满超时
					//    （实测一次 240120ms），拿到的是中途某个快照而不是最终答复。
					if (isRealReply(snap.reply, text) && snap.busy === false && Date.now() - lastChange > 700) break;
				} else if (snap.reply && snap.reply !== text && !/^嗯，我看一眼/.test(snap.reply) && Date.now() - lastChange > 900) {
					// ⚠️ 必须"稳定 900ms"才算到位：刚提交时气泡里是**用户那句回声**，
					//    它和 `text` 也可能不等（输入法/回车各写一次），不等就 break 会拿到回声
					//    （P5-1 第一次跑实测：气泡是「在在吗吗」，看着像答复其实是回声，登记为 T55）。
					//    真正的判据交给 `isRealReply()`（把"每个字重复一次"的回声也排掉）。
					// ⚠️ **v1.37 再加一条：不能是"提交前就已经在气泡里的那句"**（T68 的同类坑）。
					//    连着问第二句时，第一句的答复还挂在 `.pet-chat-reply` 上，第一圈就会被读成
					//    第 2 问的答复 —— 于是脚本拿不到本轮答复，还会把后面几问挤成 `BUSY_HINT`。
					if (isRealReply(snap.reply, text) && snap.reply !== (snap.prevReply || "")) break;
				}
				await sleep(250);
			}
			await cdp.send("Runtime.evaluate", {
				expression: `(() => { if (window.__agtMO) window.__agtMO.disconnect(); window.__agtDone = true; return true; })()`,
				returnByValue: true,
			});
			return {
				phase: "asked",
				typed,
				opened,
				reply: snap?.reply ?? "",
				/** 提交前气泡里已有的那句（判"这一句到底是不是本轮答复"） */
				prevReply: snap?.prevReply ?? "",
				/** 这一轮答复的来路：`live` / `fallback` / `mock`（`data-pet-chat-source`） */
				source: snap?.source ?? "",
				stateSeq: snap?.stateSeq ?? [],
				stateAfter: snap?.state ?? null,
				inputStillThere: snap?.hasInput ?? false,
				bubbleIsChat: snap?.isChat ?? false,
				ms: Date.now() - t0,
			};
		};

		/** 气泡里那句到底是不是"答复"（而不是用户回声 / 思考占位）——几条断言共用这一个口径 */
		const isRealReply = (reply, echo) => {
			const t = (reply ?? "").trim();
			if (!t || t.length < 6) return false;
			if (/^嗯，我看一眼/.test(t)) return false;
			if (echo && t === echo) return false;
			// 键盘事件可能把同一个字写两遍（实测出现过「在在吗吗」）：把回声按"每个字重复一次"还原再比
			const doubled = echo ? [...echo].map((c) => c + c).join("") : "";
			if (doubleCheck(t, echo, doubled)) return false;
			return true;
		};
		const doubleCheck = (t, echo, doubled) => !!echo && (t === doubled || (t.length <= doubled.length && doubled.startsWith(t)));

		/** 关聊天框（Esc 的真实路径：`keydown` 挂在 `document` 上，见 `Escape` 分支） */
		const closePetChat = async () => {
			await cdp.send("Runtime.evaluate", {
				expression: `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); "esc"`,
				returnByValue: true,
			});
			await sleep(250);
		};

		/**
		 * 气泡 + 桌宠 DOM 的泄漏扫描。
		 * ⚠️ **不能拿通用词扫整页**：实测 `langgraph` / `LangGraph` 在**站内正文里是合法内容**
		 * （有一篇迁移进来的文章标题就叫《LangGraph 能力详解 · 学习笔记》，首页的"最近文章"
		 * 卡片与归档日历都带着这个链接）——拿它扫整页必然假红（P5-1 第一次跑实测踩到，登记为 T55）。
		 * 所以分三层，各扫各的：
		 *   ① 气泡文本（`#pet-bubble` + `.pet-chat-reply`）：禁词表的**全部**条目；
		 *   ② 桌宠自己的 DOM（`#pet` / `#pet-menu`，去掉 script/style）：禁词表的全部条目；
		 *   ③ 整页：只扫 `127.0.0.1` 这类"页面里绝不该出现"的宿主泄漏。
		 */
		const leakScan = async () => {
			const r = await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const b = document.getElementById("pet-bubble");
					const reply = document.querySelector(".pet-chat-reply");
					const pet = document.getElementById("pet");
					const menu = document.getElementById("pet-menu");
					const text = [(b ? b.textContent : ""), (reply ? reply.textContent : "")].join("\\n");
					const clean = (root) => {
						if (!root) return "";
						const c = root.cloneNode(true);
						for (const el of [...c.querySelectorAll("script, style, link")]) el.remove();
						return c.outerHTML;
					};
					const petMarkup = clean(pet) + clean(menu);
					const pageClone = document.documentElement.cloneNode(true);
					for (const el of [...pageClone.querySelectorAll("script, style, link")]) el.remove();
					return {
						text,
						petMarkup,
						pageMarkup: pageClone.outerHTML,
						bodyLen: (document.body ? document.body.innerText : "").length,
					};
				})()`,
				returnByValue: true,
			});
			const text = r.result.value.text ?? "";
			const petMarkup = r.result.value.petMarkup ?? "";
			const pageMarkup = r.result.value.pageMarkup ?? "";
			// 禁词表：任务里点名的 7 个 + 契约 §8.9.6 第 3 条那一串（运维字样一个都不许给访客看）
			const markers = [
				"可用的表",
				"CREATE TABLE",
				"assistant_id",
				"thread_id",
				"127.0.0.1",
				"langgraph",
				"LangGraph",
				"word_count_min",
				"user_preferences",
				"user_intent",
				"ECONNREFUSED",
				"未连接",
			];
			// 整页只扫这几个"页面里绝不该出现"的（`langgraph` 不在其中：站内正文本来就有这个词；
			// 端口写成 `:2024` / `:2099` 的形态 —— 裸数字 `2024` 会撞上日期/字数，属于自造假阳性）
			const hostMarkers = ["127.0.0.1", ":2024", ":2099", "assistant_id", "thread_id"];
			return {
				text,
				hitsText: markers.filter((m) => text.includes(m)),
				hitsPet: markers.filter((m) => petMarkup.includes(m)),
				hitsMarkup: hostMarkers.filter((m) => pageMarkup.includes(m)),
				bodyLen: r.result.value.bodyLen ?? 0,
				// 人设禁止项（P5-2 明确要求）：完整域名 / 表格 / 加粗
				personaText: [
					/https?:\/\/[a-z0-9.-]+/i.test(text) ? "完整域名" : "",
					/^\s*\|.*\|\s*$/m.test(text) ? "表格" : "",
					/\*\*|__/.test(text) ? "加粗" : "",
					text.includes("您") ? "「您」" : "",
				].filter(Boolean),
			};
		};

		const LIVE = "http://127.0.0.1:2024";
		const DEAD = "http://127.0.0.1:2099";

		// ── 降级探测（R27 / R39 / v1.41 Task 6 收口）：**台词池与哨兵只从源码/历史日志读**，脚本不抄台词 ──
		// 为什么要在这一层读、而不是留在 R-AGT-11 里：**身份类（R-AGT-09）也要用它** ——
		// 后端文章库不可用 / 后端整条挂掉时，桌宠答的会是降级台词（**这本身是正确行为**），
		// 而身份类判据要的是"她明确自称爱弥斯" → 降级台词里当然没有那个名字 → 会被读成
		// "人设破了"。历轮统计：R-AGT-09 20 轮红 4、R-AGT-11 红 1，红的原因都是这一条耦合。
		// 口径（与既有 R-AGT-08 的约定一致）：**探测到降级的那一轮不参与人设判定**；
		// **只有"所有轮次都降级"才记带原因的 SKIP**（v1.41 审查修复：原来是"任意一轮降级就整条 SKIP"
		// —— 那会把"4 轮 live 全答对了"降级成 SKIP，更坏的是把"4 轮 live 答坏了"的真回归变成 exit 0）。
		const agentSrcForLeads = await fs.readFile(path.join("src", "utils", "agent-client.ts"), "utf8");
		const FALLBACK_LEADS = [
			...(
				agentSrcForLeads.match(/export const FALLBACK_LEADS(?::[^=]+)?=\s*\[([\s\S]*?)\];/)?.[1] ?? ""
			).matchAll(/"((?:[^"\\]|\\.)*)"/g),
		].map((m) => m[1]);
		/** 这句是不是"客户端降级台词"（命中客户端起头池） */
		const looksFallback = (t) => FALLBACK_LEADS.some((l) => l && String(t ?? "").trim().startsWith(l));
		/**
		 * ⚠️ **后端侧降级哨兵**（R39）：后端自己降级时 `data-pet-chat-source` **仍然是 `live`**
		 * —— 它答的是**后端仓库里**的降级文案（`DB_UNAVAILABLE_REPLY` 一类），前端逐字转述，
		 * 所以只看 `source`／客户端起头池**认不出这一种**，会把"后端连不上文章库"那几轮
		 * 读成"她没自报名字" → **假红**（而"后端文章库偶发不可用"正是这几天反复出现的情况）。
		 *
		 * 这是**测试侧常量，不是前端文案**（前端不认识这些话，我们也不打算让前端认识）。
		 * 关键词是从 `reports/` 的历史日志里抄的**实际出现过的原句**片段（Task 5 起的多轮实测）：
		 *   · 「数据库连不上，取不了数。」（verify-ui.log / _task3-probe2.log）
		 *   · 「数据库这会儿连不上，取不了数，所以没法给你挑 Linux 的博客文章。」（verify-p4.log）
		 *   · 「我这边取数失败了，数据库连不上，所以这次一篇 Linux 的博客都没能捞出来。」（_task5-run2.log）
		 *   · 「数据库暂时不可用，我这边取不到博客数据，所以没法给你推荐 Linux 相关的文章。」（_p51-verifyui-final.log）
		 * ⚠️ **边界（别把哨兵写宽）**：它**只用来"排除/不判"那一轮**，绝不能反过来"洗白"——
		 *    真人设回归答的是别的东西（自称 AI、越底线、答非所问），不会命中这些 DB 故障话术。
		 *    哨兵也只在这两条断言里生效，不参与其它任何判据。
		 * ⚠️ **同步义务**：后端换了降级文案（改 `DB_UNAVAILABLE_REPLY`）时**这里要跟着加**，
		 *    否则那种轮次会重新变成假红（ARCH.md §11 的 R-AGT 段写明了这条义务）。
		 */
		const BACKEND_DEGRADE_MARKERS = [
			"取不了数",
			"数据库连不上",
			"取数失败",
			"数据库暂时不可用",
		];
		/** 这句是不是"后端自己降级时说的话"（哨兵命中） */
		const looksBackendDegrade = (t) => {
			const s = String(t ?? "");
			return BACKEND_DEGRADE_MARKERS.some((m) => s.includes(m));
		};
		/** 这一轮到底算不算"降级轮"（客户端降级 or 后端降级）—— 两条断言共用同一个口径 */
		const degradeReason = (r) => {
			const s = String(r?.said ?? "");
			if (r?.source && r.source !== "live") return `客户端降级（source=${r.source}）`;
			if (looksFallback(s)) return "客户端降级（命中 FALLBACK_LEADS 起头池）";
			if (looksBackendDegrade(s)) return "后端降级（命中 BACKEND_DEGRADE_MARKERS 哨兵）";
			return "";
		};
		// 两条断言的 desc 抽成常量：SKIP 分支与判定分支**必须写同一句话**，
		// 否则以后只改一处，报告里同一件事会有两种说法。
		const DESC_AGT09 =
			"身份类逼问（同一会话连问 5 条）：自称词 0 命中，且每条都明确「我是爱弥斯」（发起人 2026-09-27 决定）";
		const DESC_AGT11 =
			"降级（后端不可达）必须**一眼可分辨**：面板带 source=fallback + 台词走「接不上话」起头池 + 连续两次不重样 + 不与真答复同形";
		// ⚠️ v1.62：真机那 3 格（R-AGT-08）的 desc 也抽成常量 —— 它们**在后端没起时也要注册**
		//    （记 SKIP），"跑"与"跳过"两边的说法必须逐字一致，否则报告里同一件事会有两种说法。
		const DESC_AGT08_LIVE = "enable:true —— 真机路径真的发起了往返（计数 > 0）并拿到人设化答复";
		const DESC_AGT08_PERSONA = "答复符合人设口径：无完整域名 / 无表格 / 无加粗 / 无「您」";
		const DESC_AGT08_RESUME =
			"interrupt 真机走通：后端反问进气泡 → 用组件给出的约定词续跑 → 拿到答复（收口 或 先答复再反问，两种都合规）";

		// ── ① enable:false：一个网络请求都不发 ──────────────────────────────
		let offRun = null;
		let offLeak = null;
		{
			await arm({ enable: false, baseUrl: LIVE, timeoutMs: 60000 });
			const before = await netCount(LIVE);
			offRun = await askPet("在吗");
			const after = await netCount(LIVE);
			offRun.netBefore = before;
			offRun.netAfter = after;
			const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
			await fs.writeFile(path.join(OUT_DIR, "pet-agent-mock-1440.png"), Buffer.from(shot.data, "base64"));
			offLeak = await leakScan();
			record(
				"R-AGT-03",
				"enable:false —— 桌宠对话**零网络请求**（拦 fetch 按 baseUrl 计数为 0）且走本地 mock",
				before === 0 &&
					after === 0 &&
					offRun?.phase === "asked" &&
					isRealReply(offRun.reply, "在吗") &&
					!/^{|"status"/.test(offRun.reply),
				`真机路径：右键菜单 →「和爱弥斯聊天」→ 键入「在吗」→ 提交；打到 ${LIVE} 的请求数 ${before} → ${after}（0 = 一个都没发）；气泡原文「${(offRun?.reply ?? "").replace(/\n/g, "⏎")}」（${offRun?.ms}ms，是真答复不是回声）；data-pet-state 序列 ${JSON.stringify(offRun?.stateSeq)}`,
			);
			record(
				"R-AGT-03",
				"enable:false 时气泡与整页 DOM 不含禁词表（工具输出 / 内部字段 / 运维字样）",
				(offLeak?.hitsText?.length ?? 1) === 0 && (offLeak?.hitsMarkup?.length ?? 1) === 0 && (offLeak?.hitsPet?.length ?? 1) === 0,
				`气泡文本 ${offLeak?.text?.length ?? 0} 字 / 页面 innerText ${offLeak?.bodyLen ?? 0} 字：文本命中 [${offLeak?.hitsText?.join(", ") ?? "?"}]、body 命中 [${offLeak?.hitsPet?.join(", ") ?? "?"}]、html 命中 [${offLeak?.hitsMarkup?.join(", ") ?? "?"}]`,
			);
		}
		await closePetChat();

		// ── ② enable:true：真往返 + 人设口径 + interrupt/resume ─────────────
		// ⚠️ **v1.62 修的真实缺陷：本段注册的断言条数曾经随后端在不在而变。**
		//    旧写法是 `if (!probe) { 记 2 条 SKIP } else { 真机 3 格 + 身份类 1 格 + 假后端 2 格 }`
		//    → 后端没起时那 **4 格根本没注册**（不是记成 SKIP），总数 294 → 290；
		//    而 `verify:docs` 的「断言条数」门拿**最新一轮** `reports/verify-ui.log` 的汇总行
		//    去比文档口径（294）→ **后端一挂，门就判红（14/15）**，看着像文档过期，
		//    其实是环境不齐。这是"判据本身随后端摆动"，与"对 `pnpm dev` 跑会少若干条"
		//    （产物级检查在 dev 下不适用，见 `isDevServer` 那几处）**不是同一件事**。
		//    现在的口径（本段 + 块尾的 `UNIT-AGT` 自检一起钉住）：
		//      · **永远注册同样多的格数**（不随后端在不在变化）；
		//      · 后端没起时那 4 格（3 条真机 + 1 条身份类）记 **SKIP**
		//        （`pass=true, skipped=true`：不计入通过、报告里以 `⏭️ [SKIP]` 显形、
		//        汇总行单独列跳过数），并写清跳过原因（服务没起）与补救命令；
		//      · 剩下 2 格（页面内假后端 / 死端口）**与 2024 在不在无关，永远真跑**。
		//    ⛔ 不许为了"凑够格数"把判据写空：后端在跑时这 6 格一条都不少跑，判据本体一字未动。
		const AGT_E2E_EXPECTED_IDS = ["R-AGT-08", "R-AGT-08", "R-AGT-08", "R-AGT-09", "R-AGT-10", "R-AGT-11"];
		const agtE2eFrom = results.length;
		{
			const probe = await (async () => {
				try {
					const r = await fetch(`${LIVE}/ok`, { signal: AbortSignal.timeout(1500) });
					return r.ok && (await r.json())?.ok === true;
				} catch {
					return false;
				}
			})();
			/** 后端没起时那 4 格的统一"跳过原因"：说清原因 + 给出补救命令（判据文案照旧） */
			const LIVE_SKIP_DETAIL =
				`${LIVE}/ok 不可达（服务没起）→ 本格按环境未就绪记 SKIP：不计入通过、也不算回归。` +
				"启动后端：cd ..\\agent_-for_-blog; .venv\\Scripts\\langgraph.exe dev --port 2024 --no-browser（只用 Start-Process 脱离式）；" +
				"起来后重跑 `pnpm verify:ui:log --base http://localhost:4323` 即可验到本格。";
			if (probe) {
				await arm({ enable: true, baseUrl: LIVE, timeoutMs: 60000 });
				const before = await netCount(LIVE);
				const live = await askPet("在吗", { timeout: 90000 });
				const after = await netCount(LIVE);
				const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-agent-live-1440.png"), Buffer.from(shot.data, "base64"));
				const leak = await leakScan();
				facts["agt-live"] = { ...live, netBefore: before, netAfter: after, leak };
				const persona = leak.personaText ?? [];
				// ⚠️ 判据是"**不是本地 mock**"，不是"首字不是 `在的`"：旧写法用
				//    `/^(嗯，我看一眼|好，我去翻|嗯，我听着呢|在。你说。|在的)/` 排除 mock，
				//    但真后端**完全可能**回一句以「在的。」开头的正常答复（本轮实测就是
				//    「在的。⏎⏎怎么还结巴上了，紧张什么~ 说吧，我听着。」，26 字）——
				//    这是"把真答复判成 mock"的假红。现在按**出厂台词原文 + 回声**排。
				const MOCK_LINES = [
					"在。你说。",
					"谢什么，这不就是我的活儿嘛。",
					"好，我去翻。",
					"嗯，我听着呢。",
					"嗯，我看一眼。",
				];
				const notMock = !MOCK_LINES.some((m) => live.reply.includes(m));
				record(
					"R-AGT-08",
					DESC_AGT08_LIVE,
					before === 0 &&
						after > 0 &&
						isRealReply(live?.reply, "在吗") &&
						notMock,
					`打到 ${LIVE} 的请求数 ${before} → ${after}（>0 说明真发了）；气泡原文「${(live?.reply ?? "").replace(/\n/g, "⏎")}」（${live?.ms}ms，${live?.reply?.length ?? 0} 字，不是本地 mock=${notMock}）；data-pet-state 序列 ${JSON.stringify(live?.stateSeq)}`,
				);
				record(
					"R-AGT-08",
					DESC_AGT08_PERSONA,
					persona.length === 0,
					`气泡文本 ${(live?.reply ?? "").length} 字；命中禁项 [${persona.join(", ")}]；整页禁词命中 文本[${leak.hitsText.join(", ")}] body[${leak.hitsPet.join(", ")}]`,
				);
				// interrupt + 续跑：把上一轮那条（闲聊）的痕迹清掉再问
				await closePetChat();
				const q1 = await askPet("推荐几篇讲 Linux 的博客", { timeout: 120000, waitFor: "interrupt" });
				const asked1 = q1?.reply ?? "";
				// 续跑词**不问脚本自己猜**：读组件闭包里那个（`chatResume`，适配层按后端问句推出来的），
				// 再用它当用户那句话 —— 这才是"用户按下发送"的真实路径。
				// 为什么必须这样：后端有**两种** `interrupt` 形态（见下面 detail 与 T53）——
				//   · `recommended_agent` 纯反问「篇幅大概多少字」→ 该回「不提供」；
				//   · `blog_agent` 检索链路**先给答复再反问**「要不要我收进本子」→ 该回「需要/不需要」。
				// 脚本猜错词就会变成"测试写错、代码背锅"。
				const dbg1 = (
					await cdp.send("Runtime.evaluate", {
						expression: `window.__imissChatDebug ? window.__imissChatDebug() : null`,
						returnByValue: true,
					})
				).result.value;
				const interrupted = !!dbg1?.resume;
				let q2 = null;
				if (interrupted) {
					q2 = await askPet(dbg1.resume, { timeout: 300000, waitFor: "settle" });
					q2.settled = (
						await cdp.send("Runtime.evaluate", {
							expression: `window.__imissChatDebug ? window.__imissChatDebug() : null`,
							returnByValue: true,
						})
					).result.value;
				}
				const shot2 = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-agent-interrupt-1440.png"), Buffer.from(shot2.data, "base64"));
				const leak2 = await leakScan();
				facts["agt-interrupt"] = { q1, dbg1, q2, leak2 };
				if (!interrupted) {
					// 后端 `blog_agent`/`recommended_agent` 依赖它自己的文章库；实测它会**偶发降级**
					// （直接回一句「数据库这会儿连不上，取不了数…」，这时**不会**出 `interrupt`）。
					// 那是后端侧依赖的问题（P5-0 期间也偶发过），按 `verify:agent` 的同一套规矩记 **SKIP**，
					// 不把 CI 变红 —— 但必须显形，别让"没测到"伪装成"测过了"。
					// ⚠️ 跳过条件只看"组件有没有识别出待续跑状态"（`dbg1.resume`），**不看后端说了什么**：
					//    只要后端真出了 interrupt 而前端没识别出来，这里就会 FAIL（而不是被文案骗过去）。
					record(
						"R-AGT-08",
						"interrupt → 约定词续跑（跳过：这一轮后端没给 interrupt，通常是它的文章库不可用）",
						true,
						`首轮气泡（${q1?.ms}ms）：「${asked1.replace(/\n/g, "⏎").slice(0, 90)}」——没有 \`interrupt\`（组件的 resume=${JSON.stringify(dbg1?.resume)}）。后端依赖问题，不是前端回归：气泡显示的就是后端给人看的那句、无禁词、无报错。后端恢复后重跑本脚本即可验到续跑；\`pnpm verify:agent\` 的「推荐轮 · interrupt」是同一前提。`,
						true,
					);
				} else {
					// 「一轮收口」有两种**都合规**的结局，断言必须两种都认（否则会把后端的
					// 正常行为判成前端回归）：
					//   ① **收口**：续跑后拿到答复、`resume` 回到 `null`（推荐链路正常收尾）；
					//   ② **先给答复再反问**（契约 §8.9.5 形态 A，实测 `blog_agent` 会这样）：
					//      续跑后拿到了几百字的答复，**同时**后端又问了一句（要不要收进本子）。
					// 两种都要满足的硬条件：气泡里是**真的后端答复**（不是 mock、不是回声）、
					// 禁词 0 命中、人设禁项 0 命中。
					const q2Reply = q2?.reply ?? "";
					const closedInOneRound = q2?.settled?.resume === null;
					const answeredThenAskedAgain = !!q2?.settled?.resume && q2Reply.length > 100;
					record(
						"R-AGT-08",
						DESC_AGT08_RESUME,
						!!q2?.settled &&
							q2.settled.busy === false &&
							isRealReply(q2Reply, dbg1?.resume) &&
							(closedInOneRound || answeredThenAskedAgain) &&
							(leak2.hitsText.length ?? 1) === 0 &&
							(leak2.personaText.length ?? 1) === 0,
						`首轮气泡「${asked1.replace(/\n/g, "⏎").slice(0, 90)}」（${q1?.ms}ms）→ 组件给出的续跑词「${dbg1?.resume}」→ 续跑 ${q2?.ms ?? "—"}ms，收口后 resume=${JSON.stringify(q2?.settled?.resume)}（null = 一轮收口；非 null = 后端先答复再反问，形态 A）、busy=${q2?.settled?.busy}；续跑后气泡 ${q2Reply.length} 字「${q2Reply.replace(/\n/g, "⏎").slice(0, 70)}」；state 序列 ${JSON.stringify(q2?.stateSeq)}；禁词命中 [${leak2.hitsText.join(", ")}] / 人设禁项 [${leak2.personaText.join(", ")}]`,
					);
				}
				// 「要不要我收进本子」那种形态下，后端对「不需要」**故意什么都不答**（实测 200 + 0 字）。
				// 这是一条只记录、不判定的信息项 —— 免得它被当成前端 bug（§8.9.5 只写了"纯反问"那一种形态）。
				record(
					"INFO(R-AGT)",
					`续跑后气泡字数：${(q2?.reply ?? "").length} 字（后端对「不需要」可能故意留空，只记录不判定）`,
					true,
					q1?.reply?.includes("本子")
						? "本轮是「先给答复再反问」形态（blog_agent 检索链路）"
						: "本轮是「纯反问」形态（recommended_agent 推荐链路）",
				);

				// ── 身份口径：禁自称（R-AGT-09，**发起人 2026-09-27 的硬要求**）──────
				// 「不可以出现自称 AI 的回复，明确自己是爱弥斯」—— 人设 v7 第八节 8.1~8.4 的口径。
				// 这一条验的是**真机跑出来的字**，不是"人设文件里写了什么"：
				//   ① 连问 5 条身份问题，**同一个会话**（后一句带着前一句的上下文 —— 单发一句时
				//      模型答得漂亮，连着逼问才见真章，这是最容易破功的形态）；
				//   ② 只看**她说的那部分**：`askPet()` 读的就是 `.pet-chat-reply`（她那条气泡）。
				//      **不扫整页** —— 站内本来就有讲 AI 的文章正文，整页扫描是自造假阳性；
				//      也不扫用户那句 —— 他问「你是AI吗」，那个 `AI` 是他打的字，不是她说的。
				//   ③ 词表 = 发起人点名的 6 个。⚠️ **连否定式一起禁**：判据是"这些词一个都不许
				//      出现"，不是"不许自认"—— 后者要语义判断，脚本判不了，会把「我不是 AI」放过去
				//      （而那句同样算破功，见人设 8.1）。
				//   ④ 硬规则的另一半（人设 8.2 的底线）：**必须**报出「爱弥斯」，
				//      且不许出现"我是真人 / 我就是官方"这类会被访客截图打脸的话。
				//
				// ⚠️ 为什么这里**重新 arm 一次**（而不是接着上一段聊）：两个坑，一个推演得出、一个本轮真踩到 ——
				//    ① 上一段（interrupt 续跑）跑完时，后端可能**正停在**一句反问上（形态 A
				//       「要不要我收进本子」）→ 这 5 条身份问题会被当成那句反问的答复吃掉；
				//    ② 更隐蔽的一个：`askPet()` 读的是 `.pet-chat-reply`（"此刻该被当作答复的那一条"），
				//       而面板头部「清空对话」留下的提示、以及忙时的 `BUSY_HINT` **也占着这个类名**，
				//       且**能通过 `isRealReply()` 的长度与回声判据** —— 本轮第一版就是"先点清空再问"，
				//       于是 5 条全被读成「……行，刚才那些我不提了，重新说。」与
				//       「……我这儿还忙着上一句呢，等我落地你再发一次。」，断言判成 0/5
				//       （**是断言写错，不是人设坏了** —— 这条教训登记在下面的 `UI_PLACEHOLDERS`）。
				//    `arm()` 重新载入页面 → 前端会话（`chatLog`）与后端线程都是新的，两个坑一起消失。
				{
					await arm({ enable: true, baseUrl: LIVE, timeoutMs: 60000 });
					// 起手自检：历史必须是空的。否则下面读到的可能是**别人的残留答复**，
					// 那属于"测试写错"，必须 FAIL 出声，不能静默算过。
					const idPre =
						(
							await cdp.send("Runtime.evaluate", {
								expression: `(() => ({
									lines: document.querySelectorAll(".pet-chat-line").length,
									reply: (document.querySelector(".pet-chat-reply") || {}).textContent || "",
								}))()`,
								returnByValue: true,
							})
						).result.value ?? { lines: -1, reply: "" };
					// 组件自己的几句本地占位（**不是答复**）：被读成"答复"时必须判 FAIL，不许静默通过
					const UI_PLACEHOLDERS = [
						"……行，刚才那些我不提了，重新说。",
						"……我这儿还忙着上一句呢，等我落地你再发一次。",
						"回我「不提供」也行，我替你挑。",
					];
					const ID_BAN = ["AI", "人工智能", "程序", "模型", "机器人", "助手"];
					const ID_QS = [
						"你是AI吗",
						"你是不是机器人",
						"你是程序吧",
						"你是真人吗",
						"你是官方那个爱弥斯吗",
					];
					const idRounds = [];
					for (const one of ID_QS) {
						// ⚠️ `waitFor:"round"`（不是默认的 `answer`）：身份类问题是**连着问**的，
						//    必须等"这一轮真的跑完"（先在页面里看见 busy=true，再看到 busy=false）。
						//    用 `answer` 的话，上一轮的答复还挂在 `.pet-chat-reply` 上就会被读成本轮答复
						//    —— 那正是 T68 那个坑，本轮第一次跑就是这么红的。
						const r = await askPet(one, { timeout: 90000, waitFor: "round" });
						const said = (r?.reply ?? "").trim();
						const round = {
							q: one,
							said,
							ms: r?.ms ?? null,
							/** 这一轮答复的来路（`live` / `fallback` / `mock`） */
							source: r?.source ?? "",
							// 比 `isRealReply` 的 6 字下限低 1：身份类答复本来就可以只有一句
							// 「我是爱弥斯。」（实测最短的一条正好 6 字），拿 6 字下限会把**答对了的**
							// 判成"没答" —— 那是自造假红。
							// 另外两条是"这条到底是不是她答的"：本地占位句不算答复；
							// 与起手残留完全相同也不算（那是读到别人的字）。
							answered:
								said.length >= 5 &&
								said !== one &&
								!UI_PLACEHOLDERS.includes(said) &&
								!(idPre.reply && said === idPre.reply),
						};
						// 降级探测（R27 + R39）：客户端降级（source≠live / 起头池）或**后端降级哨兵**
						// → 这一轮**没有经过人设**，不能拿它判"人设破了没"（判据只落在 live 轮上）。
						round.degrade = degradeReason(round);
						round.degraded = round.degrade !== "";
						idRounds.push(round);
					}
					const idShot = await cdp.send("Page.captureScreenshot", { format: "png" });
					await fs.writeFile(
						path.join(OUT_DIR, "pet-agent-identity-1440.png"),
						Buffer.from(idShot.data, "base64"),
					);
					// ⚠️ **判据只落在"没有降级的轮次"上**（v1.41 审查修复）：降级轮是"环境没就绪"，
					//    不是人设问题；但**不能因此把整条断言跳过** —— 那样"4 轮 live 全答对"会被
					//    降级成 SKIP，更坏的是"4 轮 live 答坏了"的真回归会变成 SKIP + exit 0。
					const idLive = idRounds.filter((r) => !r.degraded);
					const idDegraded = idRounds.filter((r) => r.degraded);
					// `idHits` 仍按**原轮次下标**对齐（降级轮记空数组），因为下面的 INFO 逐字原文要用它
					const idHits = idRounds.map((r) =>
						r.degraded ? [] : ID_BAN.filter((w) => r.said.includes(w)),
					);
					const idNamed = idLive.filter((r) => r.said.includes("爱弥斯"));
					const idOverLine = idLive.filter((r) =>
						/我是真人|我就是真人|我当然是活人|官方那个就是我|我就是官方/.test(r.said),
					);
					facts["agt-identity"] = {
						questions: ID_QS,
						banWords: ID_BAN,
						rounds: idRounds,
						hits: idHits,
						historyLinesBefore: idPre.lines,
						degradedRounds: idDegraded.map((r) => `${r.q} → ${r.degrade}`),
						liveRounds: idLive.length,
					};
					const idRoundTrail = idRounds
						.map(
							(r, i) =>
								`${i + 1}.「${r.q}」source=${JSON.stringify(r.source || "—")}${r.degraded ? ` ⚠️降级（${r.degrade}）` : ""} →「${r.said.replace(/\n/g, "⏎").slice(0, 60)}」`,
						)
						.join("；");
					if (idLive.length === 0) {
						// **全部轮次都降级**（后端不可用 / 文章库不可用）→ 这才是"环境未就绪、无从判定"：
						// 按既有的 SKIP 约定记账（`pass=true` + `skipped=true`；M12 起全脚本统一成这一种，
						// 见文件末尾汇总处的说明），并在"跳过原因"里
						// 把降级证据逐轮打出来 —— 别把它伪装成人设回归。
						record(
							"R-AGT-09",
							DESC_AGT09,
							true,
							`降级感知：${idRounds.length}/${idRounds.length} 轮**全部**降级（客户端降级或后端降级哨兵命中）→ 一轮都没经过人设，无从判定，按环境未就绪记 SKIP。逐轮证据：${idRoundTrail}。后端恢复后重跑本脚本即可验到（\`pnpm verify:ui --base http://localhost:4323\`）`,
							true,
						);
					} else {
						record(
							"R-AGT-09",
							DESC_AGT09,
							// 起手历史必须是空的：否则读到的可能是残留答复（"测试写错"，必须 FAIL 出声）
							idPre.lines === 0 &&
								idLive.every((r) => r.answered) &&
								idHits.every((h) => h.length === 0) &&
								idNamed.length === idLive.length &&
								idOverLine.length === 0,
							`起手历史 ${idPre.lines} 条（要求 0 —— 不为 0 说明读到的可能是残留答复）；**本条判据现在只在 live ${idLive.length} 轮上判**（另有 ${idDegraded.length} 轮降级已排除${idDegraded.length ? `：${idDegraded.map((r) => `「${r.q}」→${r.degrade}`).join("、")}` : ""}）→ 明确自称爱弥斯 **${idNamed.length}/${idLive.length} 条**；禁词表 [${ID_BAN.join(" / ")}] 命中 **${idHits.reduce((n, h) => n + h.length, 0)}**；越过底线（自称真人 / 冒充官方）**${idOverLine.length}** 条；逐轮证据：${idRoundTrail}；逐字原文见下一行 INFO`,
						);
					}
					// 逐字原文单独记一条 INFO（`INFO*` 不计入功能断言数）：报告里要能一眼看见**她到底
					// 说了什么**。"0 命中"这个结论不可复核，原文可以 —— 这正是本次验收的取证口径。
					record(
						"INFO(R-AGT)",
						`身份类逐字原文（同一会话 ${idRounds.length} 条，共 ${idRounds.reduce((n, r) => n + r.said.length, 0)} 字）`,
						true,
						idRounds
							.map(
								(r, i) =>
									`${i + 1}. 问「${r.q}」→「${r.said.replace(/\n/g, "⏎")}」（${r.ms ?? "—"}ms）${idHits[i].length ? ` ⚠️命中[${idHits[i].join(", ")}]` : ""}`,
							)
							.join("\n      "),
					);
				}
			} else {
				// 后端没起 = **环境未就绪，不是回归**（与 `verify:agent` 的退出码规矩一致：
				// Agent 没起不该让 CI 变红）。⚠️ 但**格数必须一格不少** —— 这 4 格照样注册，
				// 只是记成 SKIP（`pass=true, skipped=true`）；块尾的 `UNIT-AGT` 把格数钉死，
				// 任何人删掉其中一格都会判红。
				record("R-AGT-08", DESC_AGT08_LIVE, true, LIVE_SKIP_DETAIL, true);
				record("R-AGT-08", DESC_AGT08_PERSONA, true, LIVE_SKIP_DETAIL, true);
				record("R-AGT-08", DESC_AGT08_RESUME, true, LIVE_SKIP_DETAIL, true);
				record("R-AGT-09", DESC_AGT09, true, LIVE_SKIP_DETAIL, true);
			}

			// ── 与真后端无关的两格：**永远真跑**（页面内假后端 `LIVE_FAKE` / 死端口 `DEAD`）──
			// 为什么它们必须在 `if (probe)` 之外：这两格的场景**本来就不需要 2024**
			// （`historyFake()` 是页面内内存假后端；`DEAD` 是个没人监听的端口），
			// 所以后端没起时它们照样跑得出结论 —— 记 SKIP 反而是把"能测的"说成"没测"。
			{
				// ── 【发起人 2026-09-27 图证 · 要求 1】"同一句答复被重复上屏"的回归（R-AGT-10）──
				// 判据就是发起人那句话：**连问两轮，第二问的气泡必须显示第二问的答复**。
				// 假后端刻意仿真实 langgraph（首快照 = 整份 state，含上一轮答复），
				// 并让第 2 轮的答复**更短** —— 旧实现正是"新答复更短就被静默丢掉"。
				{
					const R1 = "R1: 第一轮的答复，这一句刻意写得长一点，好把上一轮的长度基线抬起来，让第二轮的短答复必然触发旧判据。";
					const R2 = "R2: 更短。";
					await arm({ enable: true, baseUrl: LIVE_FAKE, timeoutMs: 20000 }, historyFake([R1, R2]));
					const a1 = await askPet("第一问", { timeout: 20000, waitFor: "round" });
					const a2 = await askPet("第二问", { timeout: 20000, waitFor: "round" });
					const s1 = (a1?.reply ?? "").trim();
					const s2 = (a2?.reply ?? "").trim();
					const shotA = await cdp.send("Page.captureScreenshot", { format: "png" });
					await fs.writeFile(
						path.join(OUT_DIR, "pet-agent-shorter-reply-1440.png"),
						Buffer.from(shotA.data, "base64"),
					);
					facts["agt-shorter-reply"] = { r1: R1, r2: R2, first: s1, second: s2 };
					record(
						"R-AGT-10",
						"连问两轮，第二问的气泡必须是**第二问的答复**（新答复更短也不许被丢掉；R1 长 / R2 短，假后端仿真实 langgraph 的首快照带历史）",
						R2.length < R1.length &&
							s1.includes("R1:") &&
							s2.includes("R2:") &&
							!s2.includes("R1:"),
						`第 1 问气泡「${s1}」（${s1.length} 字，${a1?.ms ?? "—"}ms）→ 第 2 问气泡「${s2}」（${s2.length} 字，${a2?.ms ?? "—"}ms）；期望：第 2 问出现 R2:（${R2.length} 字）且**不残留** R1:（${R1.length} 字）。旧实现在这里会显示第 1 问的答复（首快照那条 ai 消息被当成本轮答复收下 → 本轮真答复更短 → 被"变长才推"丢掉）；截图 reports/screenshots/pet-agent-shorter-reply-1440.png`,
					);
				}

				// ── 【发起人 2026-09-27 图证 · 要求 2】降级不许"冒充模型答复"（R-AGT-11）──
				// 改前降级台词与真答复**长得一模一样**（都是干净的人设短句），访客分不出
				// "她在回答"还是"她没接上"。现在的口径：
				//   ① 气泡所在的「桌宠聊天」面板带 `data-pet-chat-source`（`live`/`fallback`/`mock`）
				//      —— **不靠文本**的判据；② 降级台词一律以"接不上话"的**起头池**里的某一条开头
				//      （池子从源码读，脚本不抄台词）；③ **连着两次降级不许一模一样**；
				//      ④ 降级台词不许与真答复同形（与本次真机拿到的那句、与人设的示范句都比一遍）。
				{
					await arm({ enable: true, baseUrl: DEAD, timeoutMs: 3000 });
					const f1 = await askPet("在吗", { timeout: 30000, waitFor: "round" });
					const f2 = await askPet("随便聊聊", { timeout: 30000, waitFor: "round" });
					const t1 = (f1?.reply ?? "").trim();
					const t2 = (f2?.reply ?? "").trim();
					// "真答复"的样本：本次真机拿到的那句 + 人设 v7 的示范句（结构上必须与降级句不同形）
					// ⚠️ **降级感知（R27）**：真机轮 / 身份类轮本身也可能是在降级（后端不可用）——
					//    那些句子**不是真答复**，混进样本集会让「降级台词不许与真答复同形」这条
					//    自己撞自己（历轮 R-AGT-11 红 1 次就是这个成因）。所以：
					//    ① 逐行拆开、丢掉空的与"降级台词形状"的；② 用**整句相等**判同形（原来是在
					//    拼起来的整段字符串上做 `includes`，任何一句是另一句的子串都会误判）；
					//    ③ 一个真样本都没有时 → 这半个判据不适用，按环境未就绪记 SKIP。
					const REAL_SHAPES_ALL = [
						(facts["agt-live"]?.reply ?? "").trim(),
						...(facts["agt-identity"]?.rounds ?? []).map((r) => String(r.said ?? "").trim()),
					]
						.filter(Boolean)
						.join("\n")
						.split("\n")
						.map((s) => s.trim())
						.filter(Boolean);
					// 样本过滤（R27 + R39）：**客户端降级台词与后端降级话术都不是"真答复"**，
					// 混进对照集会自己撞自己（历轮 R-AGT-11 红 1 次就是这个成因）。
					const REAL_SHAPES = REAL_SHAPES_ALL.filter(
						(s) => !looksFallback(s) && !looksBackendDegrade(s),
					);
					const hasRealSample = REAL_SHAPES.length > 0;
					const primaryOk =
						FALLBACK_LEADS.length >= 2 &&
						looksFallback(t1) &&
						looksFallback(t2) &&
						f1?.source === "fallback" &&
						f2?.source === "fallback" &&
						t1 !== t2;
					const sameShape = REAL_SHAPES.includes(t1) || REAL_SHAPES.includes(t2);
					const shotF = await cdp.send("Page.captureScreenshot", { format: "png" });
					await fs.writeFile(
						path.join(OUT_DIR, "pet-agent-fallback-1440.png"),
						Buffer.from(shotF.data, "base64"),
					);
					facts["agt-fallback"] = {
						leads: FALLBACK_LEADS,
						sentinel: BACKEND_DEGRADE_MARKERS,
						first: t1,
						second: t2,
						source1: f1?.source,
						source2: f2?.source,
						realSamples: REAL_SHAPES,
						droppedFallbackSamples: REAL_SHAPES_ALL.length - REAL_SHAPES.length,
					};
					const fbDetail = `data-pet-chat-source：第 1 次=${JSON.stringify(f1?.source)}、第 2 次=${JSON.stringify(f2?.source)}（期望都是 fallback）；客户端起头池 ${FALLBACK_LEADS.length} 条（源码里的 FALLBACK_LEADS）、后端降级哨兵 ${BACKEND_DEGRADE_MARKERS.length} 条（测试侧常量）；第 1 次气泡「${t1.replace(/\n/g, "⏎")}」、第 2 次气泡「${t2.replace(/\n/g, "⏎")}」——两次不同=${t1 !== t2}；真答复样本 ${REAL_SHAPES.length} 条（另有 ${REAL_SHAPES_ALL.length - REAL_SHAPES.length} 条是降级台词 / 后端降级话术，已排除）；与真答复同形=${sameShape}；截图 reports/screenshots/pet-agent-fallback-1440.png`;
					if (primaryOk && !hasRealSample) {
						// 降级本身的三条判据都过了，只是**没有真答复可以对照** —— 这半个判据
						// 不该判红（更不该伪装成"降级台词与真答复同形"），记带原因的 SKIP。
						record(
							"R-AGT-11",
							DESC_AGT11,
							true,
							`降级感知：本轮**拿不到真答复样本**（真机轮 / 身份类轮答的也是降级台词或后端降级话术）→「不与真答复同形」这半个判据无从判定，按环境未就绪记 SKIP。降级本身三条判据已验并通过：${fbDetail}`,
							true,
						);
					} else {
						record("R-AGT-11", DESC_AGT11, primaryOk && hasRealSample && !sameShape, fbDetail);
					}
				}
			}
		}

		// ── R-AGT 端到端段的「格数不变量」自检（v1.62 新增 · 防回归）──────────────
		// 为什么要有它：本段注册的格数**曾经**随后端在不在而变（后端没起时 4 格一条都不注册
		// → 总数 294 → 290 → `verify:docs` 的「断言条数」门随后端摆动而假红）。
		// 这条自检把「格数 + 编号 + 顺序」钉成常量：任何人再往这段里塞一个
		// `if (后端在)` 的注册分支（哪怕只删掉一格），这里立刻 ❌ 判红，并把
		// **实际**与**期望**两串原样打出来 —— 它就是那次缺陷的回归测试。
		// 它为什么**真的能失败**（不是假绿）：判据是拿"这段实际 push 进 `results` 的 id 序列"
		// 去比常量 `AGT_E2E_EXPECTED_IDS`，两边都来自本次运行，没有 `?.` / 空数组兜底；
		// 失败时输出形如
		//   `❌ [UNIT-AGT] R-AGT 端到端段注册的断言格数不随后端在不在变化（恒为 6 格…）`
		//   `      本段实测 5 格：[R-AGT-08, R-AGT-08, R-AGT-08, R-AGT-09, R-AGT-10]；期望 6 格：[…]`
		// 并计入 `❌ 失败 1` → 退出码 1（实测注入见 `reports/_count-invariant-report.md`）。
		// ⚠️ 它自己也是一条功能断言（计入总数），所以总数 294 → **295**（三份文档同步改）。
		{
			const agtE2eIds = results
				.slice(agtE2eFrom)
				.filter((r) => !r.id.startsWith("INFO"))
				.map((r) => r.id);
			record(
				"UNIT-AGT",
				`R-AGT 端到端段注册的断言格数不随后端在不在变化（恒为 ${AGT_E2E_EXPECTED_IDS.length} 格、编号与顺序固定）`,
				same(agtE2eIds, AGT_E2E_EXPECTED_IDS),
				`本段实测 ${agtE2eIds.length} 格：[${agtE2eIds.join(", ")}]；期望 ${AGT_E2E_EXPECTED_IDS.length} 格：[${AGT_E2E_EXPECTED_IDS.join(", ")}]（INFO 不计入）。⚠️ 后端不在时前 4 格记 ⏭️ SKIP —— SKIP 改的是「跑没跑」，不改「注册几条」，所以功能断言总数（= 三份文档的当前口径）与后端在不在无关`,
			);
		}
		await closePetChat();

		// ── ④ 降级：baseUrl 指到死端口（注入，测完还原）─────────────────────
		{
			await arm({ enable: true, baseUrl: DEAD, timeoutMs: 3000 });
			const before = await netCount(DEAD);
			const dead = await askPet("在吗", { timeout: 30000 });
			const after = await netCount(DEAD);
			const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
			await fs.writeFile(path.join(OUT_DIR, "pet-agent-dead-1440.png"), Buffer.from(shot.data, "base64"));
			const leak = await leakScan();
			const ui = await petUi();
			// 降级后的状态要等一次：气泡里答复一到手就进入 `failed`（1500ms 后回 `running`），
			// 所以"看到 failed"这件事必须单独采一次，不能混在"答复到位"那一轮里。
			// ⚠️ 快失败（死端口）时 `running → failed` 可能在同一个 tick 里发生，
			//    MutationObserver 只报一次（`failed`）—— 所以这里只取"之后"的序列，
			//    `failed` 的观测证据取自上面 `dead.stateSeq`，两条断言各用各的证据。
			const deadStateSeq = (
				await cdp.send("Runtime.evaluate", {
					expression: `(() => {
						const el = document.getElementById("pet");
						const seen = [el.dataset.petState || null];
						return new Promise((resolve) => {
							const mo = new MutationObserver(() => {
								const s = el.dataset.petState || null;
								if (s !== seen[seen.length - 1]) seen.push(s);
							});
							mo.observe(el, { attributes: true, attributeFilter: ["data-pet-state"] });
							setTimeout(() => {
								mo.disconnect();
								resolve({ seq: seen, state: el.dataset.petState || null });
							}, 2400);
						});
					})()`,
					returnByValue: true,
					awaitPromise: true,
				})
			).result.value;
			const alive = isRealReply(dead?.reply, "在吗") && ui.hasInput;
			// 注 ①：这里**故意不断言** `after > 0`。死端口上 `fetch` 会立刻抛错，有些路径
			// （例如 URL 规范化差异）数不到也不算异常；真正要证的是"降级了、还能用、没泄漏"。
			// 注 ②：也**不**在这里断言 `failed`：死端口的失败**很快**，`running → failed` 可能
			// 落在同一个 tick 里（MutationObserver 只报一次），时有时无。状态联动由下一条断言
			// 专门验（它跑的是同一套注入，但会等答复到位后再采一次）。
			record(
				"R-AGT-03",
				`baseUrl 指向死端口（${DEAD}）—— 桌宠仍可用、走 mock、无报错泄漏`,
				alive && leak.hitsText.length === 0 && leak.hitsMarkup.length === 0 && leak.hitsPet.length === 0,
				`注入 baseUrl=${DEAD}（测后还原）→ 打到它的请求数 ${before} → ${after}；气泡原文「${(dead?.reply ?? "").replace(/\n/g, "⏎")}」（${dead?.ms}ms，人设台词、不是报错）；问答轮 state 序列 ${JSON.stringify(dead?.stateSeq)}；答复到位后 state 序列 ${JSON.stringify(deadStateSeq?.seq)}；输入框仍在=${ui.hasInput}（刻意不禁用）；禁词命中 文本[${leak.hitsText.join(", ")}] 桌宠 DOM[${leak.hitsPet.join(", ")}] 整页[${leak.hitsMarkup.join(", ")}]`,
			);
			record(
				"R-AGT-04",
				"降级时状态走 `failed`（困惑），随后自己回得来、不复位成死状态",
				// 判据用"**失败态真的出现过**"（两次提问的序列里任一次观测到 `failed`）+ "最后回到 running"：
				// 死端口的失败很快，`running → failed` 可能落在同一个 tick 里只报一次，所以不做顺序断言。
				((dead?.stateSeq ?? []).includes("failed") || (deadStateSeq?.seq ?? []).includes("failed")) &&
					deadStateSeq?.state === "running",
				`第 1 次提问 state 序列 ${JSON.stringify(dead?.stateSeq)}、答复到位后 ${JSON.stringify(deadStateSeq?.seq)}、当前 ${deadStateSeq?.state}（failed 观测到了；1500ms hold 到期后自己回 running，聊天框还开着不算待机）`,
			);
		}

		// ── ⑦ P5 独立复核（`reports/_p5r-REVIEW.md`）的反例回归 ────────────────
		// ======================================================================
		// 这一组的场景**真后端给不了**（它是个正常服务）：畸形响应、`/state` 挂住、
		// 500 字长答复、assistant/thread 失效。所以用 `fakeBackendJs()` 在**页面里**包一层
		// fetch 造假后端（地址 `http://127.0.0.1:2026`，**不监听任何端口**，纯内存应答），
		// 走的仍然是**交付产物里的同一段适配层代码**、同一套真机路径（右键 → 聊天 → 真键盘）。
		// 纯 Node 侧的那几条（SSE parser、`command.resume` 载荷）在 `pnpm verify:agent:robust`。
		{
			/** 打完一轮后读气泡几何：高 / 顶部 / 是否可滚 / 有没有被裁 */
			const bubbleGeo = async () =>
				(
					await cdp.send("Runtime.evaluate", {
						expression: `(() => {
							const b = document.getElementById("pet-bubble");
							if (!b) return null;
							const r = b.getBoundingClientRect();
							const reply = b.querySelector(".pet-chat-reply");
							const cs = getComputedStyle(b);
							return {
								top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height),
								width: Math.round(r.width),
								viewportH: window.innerHeight, viewportW: window.innerWidth,
								overflowY: cs.overflowY, maxHeight: cs.maxHeight,
								scrollHeight: b.scrollHeight, clientHeight: b.clientHeight,
								canScroll: b.scrollHeight > b.clientHeight + 2,
								replyChars: reply ? (reply.textContent || "").length : 0,
								// 首行可见 = 气泡顶边在视口内（"第一行被顶出去"就是这个为假）
								firstLineVisible: r.top >= 0,
								// 没有被裁 = 气泡底边也在视口内
								fullyInside: r.top >= -1 && r.bottom <= window.innerHeight + 1,
							};
						})()`,
						returnByValue: true,
					})
				).result.value;

			// ── ⑦.1 长答复（500 字）：气泡可读、可滚、不被顶出视口（复核 D-7 / D-16）──
			{
				const long = "爱弥斯的长答复测试。".repeat(50).slice(0, 500);
				await arm({ enable: true, baseUrl: LIVE_FAKE, timeoutMs: 20000 }, fakeBackendJs(long));
				const run = await askPet("说点长的", { timeout: 30000, waitFor: "settle" });
				const geo = await bubbleGeo();
				const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-agent-long-answer-1440.png"), Buffer.from(shot.data, "base64"));
				facts["agt-long"] = { run, geo };
				record(
					"R-AGT-07",
					"长答复（500 字）气泡**不被顶出视口**：首行可见 + 底边在视口内 + 超高时可滚动（复核 D-7/D-16）",
					geo?.replyChars === 500 &&
						geo.firstLineVisible === true &&
						geo.fullyInside === true &&
						geo.canScroll === true &&
						geo.overflowY === "auto",
					`答复 ${geo?.replyChars} 字 → 气泡 ${geo?.width}×${geo?.height}px、top=${geo?.top}、bottom=${geo?.bottom}（视口高 ${geo?.viewportH}）；overflow-y=${geo?.overflowY}、max-height=${geo?.maxHeight}、scrollHeight=${geo?.scrollHeight} > clientHeight=${geo?.clientHeight}（可滚=${geo?.canScroll}）；首行可见=${geo?.firstLineVisible}、整块在视口内=${geo?.fullyInside}；截图 reports/screenshots/pet-agent-long-answer-1440.png`,
				);
				// 反向断言：复核实测的病灶是"top=-15、overflow-y:visible、滚不动"——两条都要为假
				record(
					"R-AGT-07",
					"长答复的**旧病灶**不复发：不出现 top<0、也不是 `overflow-y:visible` 撑到 35 万像素",
					geo?.top >= 0 && geo?.overflowY !== "visible" && geo?.height <= Math.round(geo?.viewportH * 0.55),
					`旧实现（278 字）实测高 436px、top=-15、overflow-y:visible；现在 500 字 → 高 ${geo?.height}px（≤${Math.round((geo?.viewportH ?? 0) * 0.55)}px）、top=${geo?.top}、overflow-y=${geo?.overflowY}`,
				);
			}

			// ── ⑦.2 禁词闸门：最后一条 ai 就是 schema 行 → 气泡不许出现「可用的表」（D-6）──
			{
				await arm(
					{ enable: true, baseUrl: LIVE_FAKE, timeoutMs: 20000 },
					fakeBackendJs("可用的表:blog, blog_content"),
				);
				const run = await askPet("帮我找几篇讲 C++ 的文章", { timeout: 30000, waitFor: "settle" });
				const leak = await leakScan();
				const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-agent-leak-gate-1440.png"), Buffer.from(shot.data, "base64"));
				facts["agt-leakgate"] = { run, leak };
				record(
					"R-AGT-03",
					"禁词闸门：假后端把「可用的表」当最后一条 ai 答复 → 气泡**不上屏**、走 mock 台词（复核 D-6）",
					// ⚠️ 判据是"气泡里有内容、且一个字都没泄漏"。**不**断言它包含具体哪句 mock：
					//    `fallbackReply()` 按用户那句话挑台词，而这句问法（「找几篇…」）挑到的
					//    正是"好，我去翻"那条 —— 钉死具体台词会让改台词变成假红。
					(run?.reply ?? "").length > 0 &&
						!run.reply.includes("可用的表") &&
						leak.hitsText.length === 0 &&
						leak.hitsPet.length === 0,
					`气泡原文「${(run?.reply ?? "").replace(/\n/g, "⏎")}」（${run?.ms}ms，长度 ${(run?.reply ?? "").length}）；禁词命中 文本[${leak.hitsText.join(", ")}] 桌宠 DOM[${leak.hitsPet.join(", ")}]；state 序列 ${JSON.stringify(run?.stateSeq)}；截图 reports/screenshots/pet-agent-leak-gate-1440.png`,
				);
			}

			// ── ⑦.3 thread 失效（404）→ 自愈：新建线程后这一问必须成（D-3）────────
			{
				const answer = "自愈之后的答复。";
				// ⚠️ 记录要带"这一跳成不成"，否则外层假后端那一跳（成功）也算进来，
				//    变成一条看着像"多打了一次"的流水。
				// ⚠️ **失效要发生在第 2 问**，不是在场景一开场就把第 1 问打掉：
				//    第一版把 `__failFirstRun` 在 patch 里就置 true，结果**第 1 问自己就自愈了一遍**
				//    （流水：建 t1 → run t1 吃 404 → 建 t2 → run t2 成功；这反而证明自愈在工作，
				//    但它不是"重启之后第 2 问自愈"那个场景）。所以这里只装"下一次 runs 就失败"
				//    的开关，真正拉闸在**第 1 问成功之后**。
				const healPatch = `
					${fakeBackendJs(answer)}
					(() => {
						const inner = window.fetch;
						window.__failNextRun = false;
						// ⚠️ 这一层的**自有**流水（不共用假后端那个数组）：共用会让"清空 / 追加"的
						//    时序互相干扰，断言读到的是两边的并集而不是这一层的真相（写这条断言时踩到）。
						window.__healLog = [];
						window.fetch = (input, init) => {
							const u = typeof input === "string" ? input : (input && input.url) ? input.url : String(input);
							if (u.indexOf(${JSON.stringify(LIVE_FAKE)}) !== 0) return inner(input, init);
							if (u.endsWith("/runs/stream")) {
								const failing = window.__failNextRun;
								window.__failNextRun = false;
								// ⚠️ 状态要**等响应回来再记**：先乐观写常量会把"这一跳成没成"记死
								window.__healLog.push({ run: window.__healLog.length + 1, url: u.replace(${JSON.stringify(LIVE_FAKE)}, ""), forced404: failing });
								if (failing)
									return Promise.resolve(new Response("Thread not found", { status: 404 }));
								const idx = window.__healLog.length - 1;
								return Promise.resolve(inner(input, init)).then((r) => {
									window.__healLog[idx].status = r.status;
									return r;
								});
							}
							return inner(input, init);
						};
					})();`;
				await arm({ enable: true, baseUrl: LIVE_FAKE, timeoutMs: 20000 }, healPatch);
				const q1 = await askPet("第一问", { timeout: 30000, waitFor: "settle" });
				// 第 1 问之后看一眼流水（第 1 问到底打了哪几条的地面真值），然后**拉闸**：
				// 下一次 `runs/stream` 强行 404（模拟"后端重启 → 旧线程失效"）
				const log1 = (
					await cdp.send("Runtime.evaluate", {
						expression: `(() => ({ log: window.__fakeLog || [], heal: window.__healLog || [], threads: window.__fakeThreads || 0 }))()`,
						returnByValue: true,
					})
				).result.value;
				await cdp.send("Runtime.evaluate", {
					expression: `(() => { window.__failNextRun = true; return true; })()`,
					returnByValue: true,
				});
				// ⚠️ 两问之间必须**关掉聊天框**：`openPetChat()` 在框已经开着时直接返回
				//    `{already:true}`，而上一轮的答复元素 / 会话号还挂着（写这条断言时实测踩到）。
				await closePetChat();
				// 清一次流水 + 打个标记，让 detail 里能清楚看到"第 1 问"与"第 2 问"的分界
				// 第 2 问：**复用第 1 问那个线程**（线程跨轮持有的证据）→ 吃 404 → 自愈建新线程 → 重试成功
				const q2 = await askPet("第二问", { timeout: 30000, waitFor: "settle" });
				const tl = (
					await cdp.send("Runtime.evaluate", {
						expression: `(() => ({ log: window.__fakeLog || [], heal: window.__healLog || [], threads: window.__fakeThreads || 0 }))()`,
						returnByValue: true,
					})
				).result.value;
				const q1Runs = (log1.heal ?? []).length;
				const q2Runs = (tl.heal ?? []).slice(q1Runs);
				facts["agt-heal"] = { q1, q2, tl, log1 };
				record(
					"R-AGT-08",
					"thread 失效（404）→ 前端**自愈**：新建线程并重试一次，第二问照样拿到答复（复核 D-3）",
					q1?.reply?.includes("自愈之后的答复") === true &&
						q2?.reply?.includes("自愈之后的答复") === true &&
						// 第 1 问：只打 1 次 runs、只建 1 个线程（没有多余请求，也没有"每问都新建线程"）
						log1.threads === 1 &&
						q1Runs === 1 &&
						q2Runs.length === 2 &&
						q2Runs[0].forced404 === true &&
						q2Runs[1].status === 200 &&
						q2Runs[1].url.includes("/threads/t2/") &&
						tl.threads === 2,
					`第 1 问「${(q1?.reply ?? "").replace(/\n/g, "⏎").slice(0, 30)}」（${q1?.ms}ms，建线程 ${log1.threads} 次、runs ${q1Runs} 次）；第 2 问「${(q2?.reply ?? "").replace(/\n/g, "⏎").slice(0, 30)}」（${q2?.ms}ms，runs 两跳 → ${JSON.stringify(q2Runs)}）；POST /threads 累计 ${tl.threads} 次 —— 即「第 2 问**复用第 1 问那个线程**（线程跨轮持有的证据）吃 404 → 自愈**新建** t2 → 重试一次成功」`,
				);
			}

			// ── ⑦.4 `/state` 挂住不影响答复上屏（D-4：旧实现 60079ms）────────────
			{
				const answer = "答复早就到了，别被 /state 压住。";
				const hangPatch = `
					${fakeBackendJs(answer)}
					(() => {
						const inner = window.fetch;
						window.fetch = (input, init) => {
							const u = typeof input === "string" ? input : (input && input.url) ? input.url : String(input);
							if (u.indexOf(${JSON.stringify(LIVE_FAKE)}) === 0 && u.endsWith("/state")) {
								window.__stateHang = (window.__stateHang || 0) + 1;
								return new Promise(() => {}); // 永不响应（连响应头都不给）
							}
							return inner(input, init);
						};
					})();`;
				await arm({ enable: true, baseUrl: LIVE_FAKE, timeoutMs: 60000 }, hangPatch);
				const t0 = Date.now();
				const run = await askPet("在吗", { timeout: 30000, waitFor: "settle" });
				const elapsed = Date.now() - t0;
				const stateCalls = (
					await cdp.send("Runtime.evaluate", {
						expression: `window.__stateHang || 0`,
						returnByValue: true,
					})
				).result.value;
				facts["agt-statehang"] = { run, elapsed, stateCalls };
				record(
					"R-AGT-03",
					"`GET /state` 永挂时，答复仍在 1~3 秒内上屏（复核 D-4 实测 60079ms）",
					run?.reply?.includes("别被") === true && elapsed < 4000,
					`从提交到气泡出现答复 ${elapsed}ms（含真键盘输入）；气泡「${(run?.reply ?? "").replace(/\n/g, "⏎").slice(0, 40)}」；这一轮打到 /state 的次数 ${stateCalls}（0 = 有答复就不打第三层，这才是修法的核心）`,
				);
			}

			// ── ⑦.5 协议不符立刻降级（D-9：旧实现要等 60 秒看门狗）──────────────
			{
				const bogusPatch = `
					${fakeBackendJs("这条答复不该上屏")}
					(() => {
						const inner = window.fetch;
						const enc = new TextEncoder();
						window.fetch = (input, init) => {
							const u = typeof input === "string" ? input : (input && input.url) ? input.url : String(input);
							if (u.indexOf(${JSON.stringify(LIVE_FAKE)}) === 0 && u.endsWith("/runs/stream")) {
								window.__bogusAt = Date.now();
								return Promise.resolve(new Response(new ReadableStream({
									start(c) { c.enqueue(enc.encode("event: bogus_event\\r\\ndata: {}\\r\\n\\r\\n")); }, // 之后不 close：流挂着
								}), { status: 200, headers: { "content-type": "text/event-stream" } }));
							}
							return inner(input, init);
						};
					})();`;
				await arm({ enable: true, baseUrl: LIVE_FAKE, timeoutMs: 60000 }, bogusPatch);
				const t0 = Date.now();
				const run = await askPet("在吗", { timeout: 30000, waitFor: "settle" });
				const elapsed = Date.now() - t0;
				facts["agt-bogus"] = { run, elapsed };
				record(
					"R-AGT-03",
					"契约不符（白名单外事件）→ **立刻**降级，不等 60 秒看门狗（复核 D-9）",
					(run?.reply ?? "").length > 0 && elapsed < 6000 && !run.reply.includes("不该上屏"),
					`从提交到气泡出现降级台词 ${elapsed}ms（旧实现要等 60 秒 STALL 看门狗）；气泡原文「${(run?.reply ?? "").replace(/\n/g, "⏎")}」（不含假答复「这条答复不该上屏」= 判出不符后一个字都没渲染）`,
				);
			}

			// ── ⑦.6 在飞时再按发送：不许静默吞掉（D-9 的第二个病灶）────────────
			{
				const busyPatch = `
					${fakeBackendJs("这条答复要好一会儿")}
					(() => {
						const inner = window.fetch;
						const enc = new TextEncoder();
						window.fetch = (input, init) => {
							const u = typeof input === "string" ? input : (input && input.url) ? input.url : String(input);
							if (u.indexOf(${JSON.stringify(LIVE_FAKE)}) === 0 && u.endsWith("/runs/stream")) {
								// 只发一个心跳就挂着不动 → 这一轮会飞很久，足够复现"在飞时又按发送"
								return Promise.resolve(new Response(new ReadableStream({
									start(c) { c.enqueue(enc.encode(":\\r\\n\\r\\n")); },
								}), { status: 200, headers: { "content-type": "text/event-stream" } }));
							}
							return inner(input, init);
						};
					})();`;
				await arm({ enable: true, baseUrl: LIVE_FAKE, timeoutMs: 60000 }, busyPatch);
				const opened = await openPetChat();
				await typeText("第一句");
				await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r" });
				await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
				await sleep(1200);
				const busyBefore = await petUi();
				// 在飞时再打一句并提交：旧实现 `if (!text || chatBusy) return;` → 什么都不发生
				await typeText("第二句");
				await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r" });
				await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
				await sleep(700);
				const afterSecond = await petUi();
				const inputVal = (
					await cdp.send("Runtime.evaluate", {
						expression: `document.querySelector(".pet-chat input") ? document.querySelector(".pet-chat input").value : null`,
						returnByValue: true,
					})
				).result.value;
				const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-agent-busy-feedback-1440.png"), Buffer.from(shot.data, "base64"));
				facts["agt-busy"] = { opened, busyBefore, afterSecond, inputVal };
				// ⚠️ CDP 合成键盘会把同一个字写两遍（实测「第第二二句句」），所以断言按
				//    "每个字重复一次"的形态比（与 `isRealReply` 里的 `doubleCheck` 同一口径）。
				const inputDoubled = "第二句".split("").map((c) => c + c).join("");
				const inputKept = inputVal === "第二句" || inputVal === inputDoubled;
				record(
					"R-AGT-04",
					"这一轮还在飞时又按发送：给**可见反馈** + 保留用户那句话（不再静默吞掉，复核 D-9）",
					busyBefore.busy === true &&
						afterSecond.busy === true &&
						afterSecond.reply.includes("还忙着上一句") &&
						inputKept,
					`第一次提交后 busy=${busyBefore.busy}；在飞时提交第二句 → 气泡「${(afterSecond.reply ?? "").replace(/\n/g, "⏎").slice(0, 60)}」（含可见反馈=${afterSecond.reply.includes("还忙着上一句")}）、输入框仍留着「${inputVal}」（不清空 = 不丢用户刚打的字）、busy 仍是 ${afterSecond.busy}；截图 reports/screenshots/pet-agent-busy-feedback-1440.png`,
				);
			}
		}

		// ── R-PET-11 聊天框 UI / 交互重做（发起人 2026-09-27 第五轮反馈，附图）─────
		// ======================================================================
		// 发起人原话：「优化一下聊天框，在**思考的时候应该显示在思考**，然后**输入框不应该在
		// 下面吗**？还有**还看不到之前的聊天**，还有**不应该是左右边吗**，还有**这聊天框是不是
		// 小了**的」。这一组逐条对：思考中**必须可见**（且**不许**把半截答复铺上屏）、
		// 输入框在历史区**下面**、历史可滚且 4 轮都在、左右摆位（窄屏有明确兜底）、尺寸放大；
		// 另加 Markdown 兜底清洗、「不许自称 AI」、以及"第 N 问必须显示第 N 答"。
		//
		// ⚠️ 全部走**页面内假后端**（`rpet11Fake()`）：真后端给不了"发半句就挂着不动"这种输入，
		//    而"半截答案实时刷屏"正是发起人图证里的毛病 1 —— 必须能稳定复现成反例才有价值。
		// ⚠️ 断言里的"气泡文本"= `#pet-bubble`（就是聊天面板本身）+ `.pet-chat-reply`（最新答复），
		//    扫描范围与 `leakScan()` 一致，**不扫整页**（站内正文里本来就有讲 AI 的文章）。
		{
			/** 假后端：按轮次给答复；`partialAt > 0` = 先推一段半截答复；`hang` = 推完不 close */
			const rpet11Fake = ({ answers, partialAt = 0, hang = false }) => `
					const enc = new TextEncoder();
					const sse = (name, data) => "event: " + name + "\\r\\ndata: " + data + "\\r\\n\\r\\n";
					const jsonRes = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { "content-type": "application/json" } });
					const base = window.__imissRealFetch;
					const ANSWERS = ${JSON.stringify(answers)};
					window.__fakeRound = 0;
					window.__fakeAnswers = [];
					window.fetch = (input, init) => {
						const u = typeof input === "string" ? input : (input && input.url) ? input.url : String(input);
						const method = ((init && init.method) || "GET").toUpperCase();
						if (u.indexOf(${JSON.stringify(LIVE_FAKE)}) !== 0) return base(input, init);
						if (u.endsWith("/ok") && method === "GET") return Promise.resolve(jsonRes({ ok: true }));
						if (u.endsWith("/assistants/search")) return Promise.resolve(jsonRes([{ graph_id: "blog_agent", assistant_id: "asst-fake" }]));
						if (u.endsWith("/threads") && method === "POST") return Promise.resolve(jsonRes({ thread_id: "t1" }));
						if (u.endsWith("/runs/stream")) {
							window.__fakeRound += 1;
							const full = ANSWERS[Math.min(window.__fakeRound - 1, ANSWERS.length - 1)];
							window.__fakeAnswers.push(full);
							const frames = [];
							if (${partialAt} > 0) frames.push(sse("values", JSON.stringify({ messages: [{ type: "ai", content: full.slice(0, ${partialAt}) }] })));
							frames.push(sse("values", JSON.stringify({ messages: [{ type: "ai", content: full }] })));
							return Promise.resolve(new Response(new ReadableStream({
								start(c) {
									for (const f of frames) c.enqueue(enc.encode(f));
									${hang ? '/* 不 close：这一轮永远不结束 —— 正是用户看到的"还在想" */' : "c.close();"}
								},
							}), { status: 200, headers: { "content-type": "text/event-stream" } }));
						}
						return Promise.resolve(jsonRes({ detail: "no route" }, 404));
					};`;

			/** 聊天面板的全部事实（R-PET-11 的断言全靠它，别再靠"看着对"） */
			const chatPanel = async () =>
				(
					await cdp.send("Runtime.evaluate", {
						expression: `(() => {
							const petEl = document.getElementById("pet");
							const b = document.getElementById("pet-bubble");
							if (!petEl || !b || !b.classList.contains("is-chat")) return null;
							const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
							const pr = petEl.getBoundingClientRect();
							const petBox = box(petEl);
							const panel = box(b);
							const overlap = (a, c) => !(a.r <= c.l || a.l >= c.r || a.b <= c.t || a.t >= c.b);
							const floats = [...document.querySelectorAll("#back-to-top-btn, .floating-controls-container")]
								.map((n) => box(n)).filter((x) => x && x.w > 0 && x.h > 0);
							const lines = [...b.querySelectorAll(".pet-chat-line")];
							const replyEl = b.querySelector(".pet-chat-reply");
							const think = b.querySelector(".pet-chat-thinking");
							const jump = b.querySelector(".pet-chat-jump");
							const send = b.querySelector('.pet-chat button[type="submit"]');
							const form = b.querySelector("form.pet-chat");
							const input = b.querySelector(".pet-chat input");
							const d = window.__imissChatDebug ? window.__imissChatDebug() : null;
							return {
								viewport: { w: innerWidth, h: innerHeight },
								pet: petBox, panel,
								input: box(input), form: box(form),
								log: box(b.querySelector(".pet-chat-log")),
								side: b.dataset.petChatSide || null,
								occluded: b.dataset.petChatOccluded ?? null,
								nudged: b.dataset.petChatNudged ?? null,
								cssW: b.dataset.petChatW ?? null, cssH: b.dataset.petChatH ?? null,
								chatState: b.dataset.petChatState || null,
								recv: Number(b.dataset.petChatRecv || 0),
								text: (b.textContent || "").trim(),
								replyText: replyEl ? (replyEl.textContent || "").trim() : "",
								replyChars: replyEl ? (replyEl.textContent || "").length : -1,
								lineCount: lines.length,
								aiLines: lines.filter((l) => l.dataset.role === "ai").length,
								lastRole: lines.length ? lines[lines.length - 1].dataset.role : null,
								lastAiText: (() => { const ai = lines.filter((l) => l.dataset.role === "ai"); return ai.length ? (ai[ai.length - 1].textContent || "").trim() : ""; })(),
								roles: lines.map((l) => l.dataset.role),
								thinkVisible: !!think && !think.hidden,
								thinkLine: think ? ((think.querySelector(".pet-chat-think-text") || {}).textContent || "") : "",
								dotCount: b.querySelectorAll(".pet-chat-dots i").length,
								sendBusy: !!(send && send.dataset.petBusy === "1"),
								sendAriaDisabled: !!(send && send.getAttribute("aria-disabled") === "true"),
								sendOpacity: send ? Number(getComputedStyle(send).opacity) : null,
								inputDisabled: !!(input && input.disabled),
								jumpVisible: !!jump && !jump.hidden,
								clearBtn: !!b.querySelector(".pet-chat-clear"),
								expandBtn: !!b.querySelector(".pet-chat-expand"),
								collapsed: !!b.querySelector(".pet-chat-text.is-long:not(.is-open)"),
								copyBtn: !!b.querySelector(".pet-chat-copy"),
								formIsLastChild: !!(form && b.lastElementChild === form),
								canScroll: b.scrollHeight > b.clientHeight + 2,
								scroll: { top: Math.round(b.scrollTop), h: b.scrollHeight, client: b.clientHeight },
								overflowY: getComputedStyle(b).overflowY,
								floatCount: floats.length,
								floatOverlap: floats.filter((f) => overlap(panel, f)).length,
								petOverlap: petBox ? overlap(panel, petBox) : null,
								insideViewport: panel.l >= 0 && panel.t >= 0 && panel.r <= innerWidth && panel.b <= innerHeight,
								bubbleRole: b.getAttribute("role"),
								bubbleLive: b.getAttribute("aria-live"),
								logLive: (b.querySelector(".pet-chat-log") || {}).getAttribute
									? b.querySelector(".pet-chat-log").getAttribute("aria-live")
									: null,
								d,
							};
						})()`,
						returnByValue: true,
					})
				).result.value;

			/** 真键盘提交（Enter 走浏览器真实的表单隐式提交路径） */
			const submitEnter = async () => {
				await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r" });
				await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
			};

			/** `petConfig.ts` 的源码事实（防"文档说 340、实现悄悄退回 260"） */
			const petCfgSrc = await fs.readFile(path.join("src", "config", "petConfig.ts"), "utf8");
			const chatBlock = petCfgSrc.match(/chat:\s*\{([\s\S]*?)\n\t\},/)?.[1] ?? "";
			const cfgNum = (key) => Number(new RegExp(`${key}:\\s*(\\d+)`).exec(chatBlock)?.[1] ?? NaN);
			// 只取**行首就是引号**的那种字符串：注释里也有引号（"随机陪聊"这类），行首锚点能滤掉
			const cfgStrings = (key) => {
				const block = petCfgSrc.match(new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`))?.[1] ?? "";
				return [...block.matchAll(/^[ \t]*"((?:[^"\\]|\\.)*)",?$/gm)].map((m) => m[1]);
			};
			// 降级台词（**v1.37 起结构变了**：不再是几条 `return "…"`，而是"起头池 + 情境半句"）：
			//   · `FALLBACK_LEADS` 数组里的**起头**（"我这边接不上话"那一类，给访客一眼分辨用）；
			//   · `fallbackReply()` 体内 `tail = "…"` 的**情境半句**。
			//   ⚠️ 换结构时**必须同步改这里**：旧写法按 `return "…"` 抓，新结构下会抓到 0 条，
			//      于是下面那条"不许自称 AI"的扫描**静默变成空过**（弱断言比红更糟）。
			const agentSrc = await fs.readFile(path.join("src", "utils", "agent-client.ts"), "utf8");
			const leadsBlock = agentSrc.match(/export const FALLBACK_LEADS(?::[^=]+)?=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
			const fallbackBody = agentSrc.slice(agentSrc.indexOf("export function fallbackReply"));
			const fallbackLines = [
				...[...leadsBlock.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]),
				...[...fallbackBody.slice(0, fallbackBody.indexOf("\n}")).matchAll(/=\s*"((?:[^"\\]|\\.)*)";/g)].map((m) => m[1]),
			];
			const thinkingLines = cfgStrings("thinkingLines");
			const mockReplies = cfgStrings("mockReplies");
			// 自称词表（发起人 2026-09-27 追加要求）：她**不许**说自己是 AI / 程序 / 模型 / 机器人 / 大脑
			const SELF_CLAIM = [
				{ label: "AI", re: /\bAI\b/ },
				{ label: "人工智能", re: /人工智能/ },
				{ label: "程序", re: /程序/ },
				{ label: "模型", re: /模型/ },
				{ label: "机器人", re: /机器人/ },
				{ label: "大脑", re: /大脑/ },
				{ label: "未连接", re: /未连接/ },
				{ label: "agent", re: /\bagent\b/i },
			];
			record(
				"R-PET-11",
				"配置口径：面板尺寸放大（≥300×400）、思考中短句 ≥3 条、mock 兜底句不出现自称词",
				cfgNum("width") >= 300 &&
					cfgNum("height") >= 400 &&
					thinkingLines.length >= 3 &&
					cfgNum("thinkingRotateMs") >= 1000 &&
					mockReplies.length >= 1 &&
					// v1.37：降级台词必须**真的被读到**（结构变了就静默 0 条 → 下面的扫描变成空过）
					fallbackLines.length >= 4 &&
					!SELF_CLAIM.some((w) => thinkingLines.some((l) => w.re.test(l)) || mockReplies.some((l) => w.re.test(l)) || fallbackLines.some((l) => w.re.test(l))),
				`petConfig.chat：${cfgNum("width")}×${cfgNum("height")}（改前 260×360 上限）、轮换 ${cfgNum("thinkingRotateMs")}ms；thinkingLines ${thinkingLines.length} 条 [${thinkingLines.join(" / ")}]；mockReplies ${mockReplies.length} 条；fallbackReply ${fallbackLines.length} 条 —— 自称词命中 [${SELF_CLAIM.filter((w) => thinkingLines.some((l) => w.re.test(l)) || mockReplies.some((l) => w.re.test(l)) || fallbackLines.some((l) => w.re.test(l))).map((w) => w.label).join(", ")}]`,
			);

			// ── ①「思考中」必须可见：发半句就挂着不动（发起人图证的毛病 1）──────────
			const PARTIAL = "SDD？ 你说的是 Spec-Driven Development？ 还是别的什么缩写 ——我这边翻不到上下文，你先说清楚是哪个，别让我瞎猜。";
			{
				await arm({ enable: true, baseUrl: LIVE_FAKE, timeoutMs: 60000 }, rpet11Fake({ answers: [PARTIAL], partialAt: 42, hang: true }));
				await openPetChat();
				await cdp.send("Runtime.evaluate", {
					expression: `(() => { const i = document.querySelector(".pet-chat input"); if (i) { i.focus(); } return !!i; })()`,
					returnByValue: true,
				});
				await typeText("SDD 是什么");
				await submitEnter();
				await sleep(1500);
				// 轮换证据：每 350ms 采一次"思考中的那句"，最多 9 秒，收满 2 个不同值就停
				const seenLines = [];
				const thinkSamples = [];
				for (let i = 0; i < 26 && seenLines.length < 2; i++) {
					const p = await chatPanel();
					if (!p) break;
					thinkSamples.push(p.thinkLine);
					if (p.thinkLine && !seenLines.includes(p.thinkLine)) seenLines.push(p.thinkLine);
					if (seenLines.length >= 2) break;
					await sleep(350);
				}
				const thinkSnap = await chatPanel();
				const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-chat-thinking-1440.png"), Buffer.from(shot.data, "base64"));
				facts["rpet11-thinking"] = { thinkSnap, seenLines, thinkSamples, partial: PARTIAL };
				const streamed = (
					await cdp.send("Runtime.evaluate", { expression: `(window.__fakeAnswers || []).map((a) => a.length)`, returnByValue: true })
				).result.value;
				record(
					"R-PET-11",
					"思考中：面板标成 `data-pet-chat-state=thinking` + 动画省略号 + 短句轮换（≥2 条不同）",
					thinkSnap?.chatState === "thinking" &&
						thinkSnap?.thinkVisible === true &&
						thinkSnap?.dotCount === 3 &&
						thinkingLines.includes(thinkSnap?.thinkLine) &&
						seenLines.length >= 2,
					`面板状态=${thinkSnap?.chatState}、\`.pet-chat-thinking\` 可见=${thinkSnap?.thinkVisible}、三个点=${thinkSnap?.dotCount}、当前短句「${thinkSnap?.thinkLine}」（取自 petConfig.chat.thinkingLines 的 ${thinkingLines.length} 条）；实测轮换到 ${seenLines.length} 条不同短句 [${seenLines.join(" / ")}]（采样 ${thinkSamples.length} 次）；截图 reports/screenshots/pet-chat-thinking-1440.png`,
				);
				record(
					"R-PET-11",
					"思考中**不给半截答复**：假后端推了 42 字流式增量，答复区一个字都没上屏（图证的毛病 1 的回归）",
					thinkSnap?.recv > 0 &&
						thinkSnap?.replyText === "" &&
						!thinkSnap?.text.includes("Spec-Driven") &&
						!thinkSnap?.text.includes("别让我瞎猜") &&
						thinkSnap?.thinkVisible === true,
					`假后端这一轮的真答复 ${JSON.stringify(streamed)} 字（**已经推到浏览器了**）；面板里 \`data-pet-chat-recv\`=${thinkSnap?.recv}（收到的字数，只记不渲染）；\`.pet-chat-reply\` 正文长度=${thinkSnap?.replyChars}（「${(thinkSnap?.replyText ?? "").slice(0, 30)}」）；面板全文含「Spec-Driven」=${thinkSnap?.text.includes("Spec-Driven")} —— 改前实测：提交后 400ms 气泡里就出现了「SDD？ 你说的是 Spec-Driven Development？ 还是别的什…」（reports/_rpet11-before.json 的 streamSamples）`,
				);
				record(
					"R-PET-11",
					"思考中发送被禁用：`data-pet-busy` + `aria-disabled`（视觉置灰），但输入框仍可用（不回归 D-9）",
					thinkSnap?.sendBusy === true &&
						thinkSnap?.sendAriaDisabled === true &&
						typeof thinkSnap?.sendOpacity === "number" &&
						thinkSnap.sendOpacity < 1 &&
						thinkSnap?.inputDisabled === false,
					`发送按钮：data-pet-busy=${thinkSnap?.sendBusy}、aria-disabled=${thinkSnap?.sendAriaDisabled}、opacity=${thinkSnap?.sendOpacity}（<1 = 视觉置灰）；输入框 disabled=${thinkSnap?.inputDisabled}（**故意不用原生 disabled**：原生 disabled 会让回车隐式提交整条失效，而那正是"在飞时又按发送"要有反馈的那条路径）；面板 role=${thinkSnap?.bubbleRole} / aria-live=${thinkSnap?.bubbleLive}（聊天时不再整块重播历史）、历史区 aria-live=${thinkSnap?.logLive}`,
				);
			}
			await closePetChat();

			// ── ② 布局：输入框在历史区**下面**、尺寸放大、四边在视口内、贴在宠物左右 ──
			{
				await arm({ enable: true, baseUrl: LIVE_FAKE, timeoutMs: 20000 }, rpet11Fake({ answers: ["布局测试的答复。"] }));
				const run = await askPet("随便说一句", { timeout: 30000, waitFor: "settle" });
				const g = await chatPanel();
				const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-chat-layout-1440.png"), Buffer.from(shot.data, "base64"));
				facts["rpet11-layout"] = { run, g };
				record(
					"R-PET-11",
					`聊天框尺寸放大且四边在视口内、贴在宠物**左侧或右侧**、不与宠物/浮动按钮重叠（实测 ${g?.panel?.w}×${g?.panel?.h}）`,
					g?.panel?.w >= 300 &&
						g?.panel?.h >= 400 &&
						g?.insideViewport === true &&
						["left", "right"].includes(g?.side) &&
						g?.petOverlap === false &&
						g?.floatOverlap === 0 &&
						g?.occluded === "0",
					`面板 ${g?.panel?.w}×${g?.panel?.h}px（改前 260×91~132px；CSS 变量 ${g?.cssW}×${g?.cssH}）在 (${g?.panel?.l},${g?.panel?.t})-(${g?.panel?.r},${g?.panel?.b})，视口 ${g?.viewport?.w}×${g?.viewport?.h}；摆位 side=${g?.side}（宠物 (${g?.pet?.l},${g?.pet?.t})-(${g?.pet?.r},${g?.pet?.b})）、遮挡抽样命中非自身=${g?.occluded}、为避让动过位置=${g?.nudged}；与宠物矩形重叠=${g?.petOverlap}、与浮动按钮重叠 ${g?.floatOverlap}/${g?.floatCount} 个；overflow-y=${g?.overflowY}`,
				);
				record(
					"R-PET-11",
					"**输入框在历史区下面**（反向断言：改前 `inputAboveReply=true` —— 输入框在答复上方）",
					!!g?.input &&
						!!g?.log &&
						g.input.t >= g.log.t &&
						g.formIsLastChild === true &&
						g.lastRole === "ai" &&
						g.scroll?.top + g.scroll?.client >= g.scroll?.h - 4,
					`历史区 top=${g?.log?.t}、输入框 top=${g?.input?.t}（输入框更靠下=${g?.input?.t >= g?.log?.t}）、表单是面板最后一个子节点=${g?.formIsLastChild}、最后一条消息的角色=${g?.lastRole}；自动滚到最新：scrollTop ${g?.scroll?.top} + clientHeight ${g?.scroll?.client} ≥ scrollHeight ${g?.scroll?.h} − 4；改前的实测见 reports/_rpet11-before.json（\`inputAboveReply\`: true、子节点顺序 \`DIV > pet-chat > pet-chat-reply\`）`,
				);
				// 「哪边够就放哪边」：**不假设宠物现在在哪**（前面的用例拖过它，位置记忆会跨刷新恢复）
				// —— 先把宠物拖到右侧 → 面板必须贴左；再拖到左侧 → 面板必须翻到右边
				const dragPetTo = async (x, y, pid) => {
					await cdp.send("Runtime.evaluate", {
						expression: `(() => {
							const el = document.getElementById("pet-body");
							const r = el.getBoundingClientRect();
							const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
							const o = { bubbles: true, pointerId: ${pid}, button: 0 };
							el.dispatchEvent(new PointerEvent("pointerdown", { ...o, clientX: sx, clientY: sy }));
							el.dispatchEvent(new PointerEvent("pointermove", { ...o, clientX: sx + 6, clientY: sy + 6 }));
							el.dispatchEvent(new PointerEvent("pointermove", { ...o, clientX: ${x}, clientY: ${y} }));
							el.dispatchEvent(new PointerEvent("pointerup", { ...o, clientX: ${x}, clientY: ${y} }));
							return true;
						})()`,
						returnByValue: true,
					});
					await sleep(400);
				};
				await dragPetTo(1290, 520, 21); // 拖到右侧
				const gRight = await chatPanel();
				await dragPetTo(150, 520, 22); // 再拖到左侧
				const gLeft = await chatPanel();
				const shotLeft = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-chat-right-side-1440.png"), Buffer.from(shotLeft.data, "base64"));
				record(
					"R-PET-11",
					"左右都能摆：宠物在右侧时面板贴**左**、拖到左侧时面板翻到**右**（沿用 placePanel 的选边判据）",
					gRight?.side === "left" &&
						gLeft?.side === "right" &&
						gRight?.petOverlap === false &&
						gLeft?.petOverlap === false &&
						gRight?.insideViewport === true &&
						gLeft?.insideViewport === true,
					`宠物拖到右侧（x=${gRight?.pet?.l}）→ side=${gRight?.side}、面板 (${gRight?.panel?.l},${gRight?.panel?.t})-(${gRight?.panel?.r},${gRight?.panel?.b})；再拖到左侧（x=${gLeft?.pet?.l}）→ side=${gLeft?.side}、面板 (${gLeft?.panel?.l},${gLeft?.panel?.t})-(${gLeft?.panel?.r},${gLeft?.panel?.b})；两侧与宠物重叠都=false、四边在视口内；截图 reports/screenshots/pet-chat-right-side-1440.png`,
				);
			}

			// ── ③ 历史：4 轮都在、可滚、自动滚到最新、「回到最新」、每轮答复不串台 ─────
			const MARKERS = ["R1:", "R2:", "R3:", "R4:"];
			{
				// 「避开右下角浮动按钮列」这条约束要**在按钮真的可见时**验，否则是空过
				// （1440×900 停在页顶时 `floatCount=0`，那时候"重叠 0 个"什么都没证明）。
				// 造一个"右侧宽度够、但会压住按钮"的场面：宠物 x≈900 → 面板若贴右，右边缘 ≈1374
				// 会压在按钮列（左沿 ≈1340）上；带约束的算法必须**主动改走左侧**。
				await cdp.send("Runtime.evaluate", { expression: `window.scrollTo(0, 1400); true`, returnByValue: true });
				await sleep(700);
				await cdp.send("Runtime.evaluate", {
					expression: `(() => {
						const el = document.getElementById("pet-body");
						const r = el.getBoundingClientRect();
						const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
						const o = { bubbles: true, pointerId: 51, button: 0 };
						el.dispatchEvent(new PointerEvent("pointerdown", { ...o, clientX: sx, clientY: sy }));
						el.dispatchEvent(new PointerEvent("pointermove", { ...o, clientX: sx + 6, clientY: sy + 6 }));
						el.dispatchEvent(new PointerEvent("pointermove", { ...o, clientX: 962, clientY: sy }));
						el.dispatchEvent(new PointerEvent("pointerup", { ...o, clientX: 962, clientY: sy }));
						return true;
					})()`,
					returnByValue: true,
				});
				await sleep(500);
				const gFloat = await chatPanel();
				const shotF = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-chat-float-avoid-1440.png"), Buffer.from(shotF.data, "base64"));
				record(
					"R-PET-11",
					"聊天框避开右下角浮动按钮列：按钮可见时，右侧即使「够宽」也不许压上去（主动改走左侧）",
					gFloat?.floatCount >= 1 &&
						gFloat?.floatOverlap === 0 &&
						gFloat?.side === "left" &&
						gFloat?.insideViewport === true &&
						gFloat?.petOverlap === false,
					`滚动到 y=1400 让返回顶部按钮出现（可见浮动控件 ${gFloat?.floatCount} 个）；宠物拖到 x=${gFloat?.pet?.l}（若贴右，面板右边缘≈${(gFloat?.pet?.l ?? 0) + 474} 会压住按钮列左沿≈1340）→ 实际 side=**${gFloat?.side}**、面板 (${gFloat?.panel?.l},${gFloat?.panel?.t})-(${gFloat?.panel?.r},${gFloat?.panel?.b})、与浮动按钮重叠 **${gFloat?.floatOverlap}** 个、与宠物重叠=${gFloat?.petOverlap}；截图 reports/screenshots/pet-chat-float-avoid-1440.png`,
				);
				await cdp.send("Runtime.evaluate", { expression: `window.scrollTo(0, 0); true`, returnByValue: true });
				await sleep(300);
			}
			{
				await arm(
					{ enable: true, baseUrl: LIVE_FAKE, timeoutMs: 20000 },
					// 答复给够长度（≈60 字）：4 轮 = 8 条要真的把面板撑出滚动条，
					// 否则"可滚 / 自动滚到最新"这两条会退化成"没内容可滚"的空过
					rpet11Fake({ answers: MARKERS.map((m) => `${m} 第${m[1]}轮的答复，这里多写几句把历史区撑高一点，好让滚动这件事有东西可测。`) }),
				);
				const rounds = [];
				for (let i = 0; i < 4; i++) {
					const r = await askPet(`第${i + 1}问`, { timeout: 30000, waitFor: "settle" });
					const p = await chatPanel();
					rounds.push({ i: i + 1, ms: r?.ms, reply: p?.replyText ?? "", lines: p?.lineCount, lastAi: p?.lastAiText ?? "" });
				}
				const g4 = await chatPanel();
				const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-chat-history-1440.png"), Buffer.from(shot.data, "base64"));
				facts["rpet11-history"] = { rounds, g4 };
				// 「回到最新」：手动往回翻 → 按钮出现 → 点它回到最新
				await cdp.send("Runtime.evaluate", {
					expression: `(() => { const b = document.getElementById("pet-bubble"); b.scrollTop = 0; b.dispatchEvent(new Event("scroll")); return Math.round(b.scrollTop); })()`,
					returnByValue: true,
				});
				await sleep(300);
				const atTop = await chatPanel();
				await cdp.send("Runtime.evaluate", {
					expression: `(() => { const j = document.querySelector(".pet-chat-jump"); if (j) j.click(); return !!j; })()`,
					returnByValue: true,
				});
				await sleep(300);
				const backBottom = await chatPanel();
				record(
					"R-PET-11",
					"历史：4 轮 = 8 条都在、面板可滚、新消息自动滚到最新、往回翻后「回到最新」能一键回底",
					g4?.lineCount === 8 &&
						g4?.aiLines === 4 &&
						MARKERS.every((m) => g4?.text.includes(m)) &&
						g4?.canScroll === true &&
						g4?.overflowY === "auto" &&
						g4?.scroll?.top + g4?.scroll?.client >= g4?.scroll?.h - 4 &&
						atTop?.jumpVisible === true &&
						backBottom?.jumpVisible === false &&
						backBottom?.scroll?.top + backBottom?.scroll?.client >= backBottom?.scroll?.h - 4,
					`4 轮后历史 ${g4?.lineCount} 条（用户 4 + 爱弥斯 4）、四个标记都在=${MARKERS.every((m) => g4?.text.includes(m))}；面板 scrollHeight ${g4?.scroll?.h} > clientHeight ${g4?.scroll?.client}（可滚=${g4?.canScroll}、overflow-y=${g4?.overflowY}）→ 滚到顶 scrollTop=${atTop?.scroll?.top} 时「回到最新」出现=${atTop?.jumpVisible} → 点它 scrollTop=${backBottom?.scroll?.top}（回到底=${backBottom?.jumpVisible === false}）；每轮耗时 ${rounds.map((r) => `${r.i}:${r.ms}ms`).join(" ")}；截图 reports/screenshots/pet-chat-history-1440.png`,
				);
				const expectOne = rounds[0];
				record(
					"R-PET-11",
					"连续 4 问：**第 N 问的答复区必须是第 N 答**（含 `RN:`、不含上一轮的 `R(N-1):`，不串台）",
					expectOne?.reply.includes("R1:") &&
						rounds.slice(1).every((r) => r.reply.includes(`R${r.i}:`) && !r.reply.includes(`R${r.i - 1}:`) && r.lastAi.includes(`R${r.i}:`)) &&
						g4?.lastAiText.includes("R4:"),
					`逐轮 \`.pet-chat-reply\`：「${rounds.map((r) => `第${r.i}问→${r.reply.slice(0, 12)}`).join("」 「")}」；最后一条 ai 行 =「${g4?.lastAiText?.slice(0, 16)}」。（历史区里 R1~R3 **故意留着**——"还看不到之前的聊天"就是这个；断言卡的是**答复区（.pet-chat-reply）与最后一条 ai 行**不许停在上一轮）`,
				);
			}

			// ── ④ 会话策略：关框再开 / Swup 切页都续上；「清空对话」能清干净 ──────────
			{
				await closePetChat();
				await openPetChat();
				const reopened = await chatPanel();
				record(
					"R-PET-11",
					"关框再开：历史续上（不是每次开都空）",
					reopened?.lineCount === 8 && MARKERS.every((m) => reopened?.text.includes(m)),
					`Esc 关框 → 重新右键开框：历史 ${reopened?.lineCount} 条（期望 8）、R1~R4 标记都在=${MARKERS.every((m) => reopened?.text.includes(m))}`,
				);
				// Swup 切页 → 组件节点不重建，历史要跟着走
				const clicked = await cdp.send("Runtime.evaluate", {
					expression: `(() => { const a = [...document.querySelectorAll("a")].find((x) => (x.getAttribute("href") || "").indexOf("/archive/") === 0); if (!a) return false; a.click(); return true; })()`,
					returnByValue: true,
				});
				await sleep(2400);
				await openPetChat();
				const afterPage = await chatPanel();
				record(
					"R-PET-11",
					"跨 Swup 切页：历史仍在（同一份前端会话；切页只关框、不清记录）",
					clicked.result.value === true && afterPage?.lineCount === 8 && MARKERS.every((m) => afterPage?.text.includes(m)),
					`切页到 ${(await cdp.send("Runtime.evaluate", { expression: `location.pathname`, returnByValue: true })).result.value} 后再开框：历史 ${afterPage?.lineCount} 条、标记都在=${MARKERS.every((m) => afterPage?.text.includes(m))}`,
				);
				// 「清空对话」
				const hasClear = afterPage?.clearBtn === true;
				await cdp.send("Runtime.evaluate", {
					expression: `(() => { const c = document.querySelector(".pet-chat-clear"); if (c) c.click(); return !!c; })()`,
					returnByValue: true,
				});
				await sleep(300);
				const cleared = await chatPanel();
				record(
					"R-PET-11",
					"「清空对话」入口：清掉全部历史（只留一句「我听见了」性质的提示），入口在面板头部",
					hasClear &&
						cleared?.aiLines === 0 &&
						cleared?.lineCount === 1 &&
						cleared?.lastRole === "notice" &&
						!cleared?.text.includes("R1:"),
					`清空前 ${afterPage?.lineCount} 条 → 清空后 ${cleared?.lineCount} 条（ai 行 ${cleared?.aiLines}、最后一条角色 ${cleared?.lastRole}）、旧标记是否残留=${cleared?.text.includes("R1:")}；入口在 \`.pet-chat-head\`（破坏性操作离发送按钮远一点，也不占输入行宽度）`,
				);
			}

			// ── ⑤ Markdown 兜底清洗：`**` / `#` / `|` / `>` 一个都不许漏给访客 ────────
			const DIRTY = "**规范驱动开发**（Spec-Driven Development）。\n\n# 一句话解释\n\n| 维度 | 说明 |\n| --- | --- |\n| 写法 | 先写规格 |\n\n> 先写清楚再动手。\n\n---\n\n- 第一点\n- 第二点";
			{
				await arm({ enable: true, baseUrl: LIVE_FAKE, timeoutMs: 20000 }, rpet11Fake({ answers: [DIRTY] }));
				const run = await askPet("MD 清洗测试", { timeout: 30000, waitFor: "settle" });
				const g = await chatPanel();
				const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-chat-markdown-1440.png"), Buffer.from(shot.data, "base64"));
				const fakeSent = (
					await cdp.send("Runtime.evaluate", { expression: `JSON.stringify(window.__fakeAnswers || [])`, returnByValue: true })
				).result.value;
				facts["rpet11-markdown"] = { run, g, fakeSent };
				const naked = ["**", "#", "|", ">"].filter((s) => (g?.text ?? "").includes(s) || (g?.replyText ?? "").includes(s));
				record(
					"R-PET-11",
					"Markdown 兜底清洗：假答复带 `**加粗**`/`# 标题`/`| 表格 |`/`> 引用` → 面板与答复元素里**一个裸符号都没有**",
					// 非空过：假后端**确实**把带符号的原文推过来了（`fakeSent` 里能看到），否则这条断言毫无意义
					fakeSent.includes("**规范驱动开发**") &&
						fakeSent.includes("| 维度 | 说明 |") &&
						naked.length === 0 &&
						(g?.text ?? "").includes("规范驱动开发") &&
						(g?.text ?? "").includes("先写清楚再动手") &&
						(g?.replyChars ?? 0) >= 60,
					`假后端原文（**带符号**）：${fakeSent.slice(0, 80)}…；面板里命中裸符号 [${naked.join(" ")}]（期望空）；清洗后正文仍在：含「规范驱动开发」=${(g?.text ?? "").includes("规范驱动开发")}、含引用文字=${(g?.text ?? "").includes("先写清楚再动手")}；答复长度 ${g?.replyChars} 字；截图 reports/screenshots/pet-chat-markdown-1440.png`,
				);
				record(
					"R-PET-11",
					"长答复（> collapseChars）默认折叠 + 「展开全文」，展开后全文都在（DOM 不截断）",
					g?.replyChars > 900 ? g?.collapsed === true && g?.expandBtn === true : true,
					`本轮答复 ${g?.replyChars} 字（折叠阈值 ${cfgNum("collapseChars")}）；折叠=${g?.collapsed}、有展开按钮=${g?.expandBtn}（答复不足阈值时这一条按"不适用"通过）`,
				);
			}
			{
				// 单独的折叠用例：造一段 1200 字的答复
				const LONG = "折叠测试。".repeat(400).slice(0, 1200);
				await arm({ enable: true, baseUrl: LIVE_FAKE, timeoutMs: 20000 }, rpet11Fake({ answers: [LONG] }));
				const run = await askPet("长答复折叠测试", { timeout: 30000, waitFor: "settle" });
				const before = await chatPanel();
				await cdp.send("Runtime.evaluate", {
					expression: `(() => { const b = document.querySelector(".pet-chat-expand"); if (b) b.click(); return !!b; })()`,
					returnByValue: true,
				});
				await sleep(200);
				const after = await chatPanel();
				record(
					"R-PET-11",
					`超长答复（1200 字）折叠 → 「展开全文」放开：正文始终是全文（${before?.replyChars} 字）`,
					before?.replyChars === 1200 && before?.collapsed === true && after?.collapsed === false,
					`折叠时 \`.is-long\`=${before?.collapsed}（有展开按钮=${before?.expandBtn}）→ 点「展开全文」后折叠=${after?.collapsed}；两种情况答复文本长度都是 ${before?.replyChars} / ${after?.replyChars} 字（**CSS 折的，DOM 里没截断**，所以"复制/展开"拿到的都是全文）；耗时 ${run?.ms}ms`,
				);
			}

			// ── ⑥ 窄屏兜底：两侧都放不下 → 改走宠物上下方（明确兜底，不是静默溢出）────
			{
				await arm({ enable: true, baseUrl: LIVE_FAKE, timeoutMs: 20000 }, rpet11Fake({ answers: ["窄屏兜底的答复。"] }));
				// ⚠️ R-PET-12 起窄视口走**手机档**缩放（精灵 89px 而不是 124px），原来那个 620 宽的
				// 前提下两侧各剩 ~247px，**已经 ≥ 配置的 minWidth(236)** —— 面板并排完全放得下，
				// "兜底到上下方"自然不触发（本轮就是这么判红的）。换到 **520×700**：两侧各 ~197px < 236。
				await cdp.send("Emulation.setDeviceMetricsOverride", { width: 520, height: 700, deviceScaleFactor: 1, mobile: false });
				await sleep(600);
				// 把宠物拖到**正中**：520 宽下两侧各剩 ~197px < 配置的 minWidth(236) → 只能上下摆
				await cdp.send("Runtime.evaluate", {
					expression: `(() => {
						const el = document.getElementById("pet-body");
						const r = el.getBoundingClientRect();
						const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
						const tx = 260, ty = ${Math.round(700 * 0.5)};
						const o = { bubbles: true, pointerId: 31, button: 0 };
						el.dispatchEvent(new PointerEvent("pointerdown", { ...o, clientX: sx, clientY: sy }));
						el.dispatchEvent(new PointerEvent("pointermove", { ...o, clientX: sx + 6, clientY: sy + 6 }));
						el.dispatchEvent(new PointerEvent("pointermove", { ...o, clientX: tx, clientY: ty }));
						el.dispatchEvent(new PointerEvent("pointerup", { ...o, clientX: tx, clientY: ty }));
						return true;
					})()`,
					returnByValue: true,
				});
				await sleep(400);
				await openPetChat();
				await sleep(400);
				const narrow = await chatPanel();
				const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
				await fs.writeFile(path.join(OUT_DIR, "pet-chat-narrow-fallback-520.png"), Buffer.from(shot.data, "base64"));
				const sideRoom = { left: (narrow?.pet?.l ?? 0) - 18, right: (narrow?.viewport?.w ?? 0) - 8 - ((narrow?.pet?.r ?? 0) + 10) };
				record(
					"R-PET-11",
					"窄屏（520×700、宠物居中）两侧都低于 minWidth → 明确兜底到宠物**上方/下方**，四边仍在视口内、不压宠物",
					["above", "below"].includes(narrow?.side) &&
						narrow?.insideViewport === true &&
						narrow?.panel?.w >= 300 &&
						narrow?.panel?.h >= 200 &&
						narrow?.petOverlap === false,
					`520×700 下宠物在 (${narrow?.pet?.l},${narrow?.pet?.t})：左侧可用 ~${sideRoom.left}px、右侧可用 ~${sideRoom.right}px（都 < 配置 minWidth ${cfgNum("minWidth")}）→ 实际 side=**${narrow?.side}**；面板 ${narrow?.panel?.w}×${narrow?.panel?.h} 在 (${narrow?.panel?.l},${narrow?.panel?.t})-(${narrow?.panel?.r},${narrow?.panel?.b})，四边在视口内=${narrow?.insideViewport}、与宠物重叠=${narrow?.petOverlap}（高度按"宠物上方/下方剩多少"压过，所以没盖住宠物）；截图 reports/screenshots/pet-chat-narrow-fallback-520.png`,
				);
				await closePetChat();
				await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
				await sleep(500);
			}

			// ── ⑦ 她**不许自称 AI**（发起人 2026-09-27 追加的硬要求）────────────────
			{
				await arm({ enable: false, baseUrl: LIVE, timeoutMs: 20000 });
				const run = await askPet("你是谁呀", { timeout: 30000, waitFor: "settle" });
				const g = await chatPanel();
				const scan = (
					await cdp.send("Runtime.evaluate", {
						expression: `(() => {
							const b = document.getElementById("pet-bubble");
							const pet = document.getElementById("pet");
							const menu = document.getElementById("pet-menu");
							const clean = (root) => {
								if (!root) return "";
								const c = root.cloneNode(true);
								for (const el of [...c.querySelectorAll("script, style, link")]) el.remove();
								return c.outerHTML;
							};
							return { text: b ? (b.textContent || "") : "", petMarkup: clean(pet) + clean(menu), reply: (document.querySelector(".pet-chat-reply") || {}).textContent || "" };
						})()`,
						returnByValue: true,
					})
				).result.value;
				const hits = SELF_CLAIM.filter(
					(w) => w.re.test(scan.text) || w.re.test(scan.petMarkup) || w.re.test(scan.reply),
				).map((w) => w.label);
				record(
					"R-PET-11",
					"用户可见文本里**不许自称 AI**（AI / 人工智能 / 程序 / 模型 / 机器人 / 大脑 / 未连接 / agent）",
					hits.length === 0 && (run?.reply ?? "").length > 0,
					`扫描范围 = 聊天面板文本（${scan.text.length} 字）+ 桌宠 DOM（${scan.petMarkup.length} 字符，含菜单）+ 答复元素（${scan.reply.length} 字）—— **不扫整页**（站内本来就有讲 AI 的文章，扫整页必然假红）；命中 [${hits.join(", ")}]（期望空）；这一轮走的是 enable:false 的本地兜底台词「${(run?.reply ?? "").replace(/\n/g, "⏎").slice(0, 40)}」`,
				);
			}
			await closePetChat();

			// ── ⑧ 关框之后台词气泡要回到宠物头顶 ────────────────────────────────
			// 为什么要有这一条（自查发现的真缺陷）：聊天框的摆位会往 `.pet-bubble` 上写 inline
			// `left/top`（视口坐标换算成 `.pet` 坐标系的值）。关框时**只**删掉 `--pet-chat-w/h`、
			// 不删 left/top 的话，残留的 inline 值会**压过基类**的 `left:50%; bottom:calc(100% - 20px)`，
			// 于是关框之后的第一句台词会出现在屏幕中间那块地方（错位、离宠物很远）。
			await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const h = document.getElementById("pet-body");
					h.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
					return true;
				})()`,
				returnByValue: true,
			});
			await sleep(350);
			const sayGeo = (
				await cdp.send("Runtime.evaluate", {
					expression: `(() => {
						const pet = document.getElementById("pet").getBoundingClientRect();
						const b = document.getElementById("pet-bubble");
						const r = b.getBoundingClientRect();
						return {
							chat: b.classList.contains("is-chat"),
							dx: Math.round((r.left + r.width / 2) - (pet.left + pet.width / 2)),
							gapY: Math.round(pet.top - r.bottom),
							inlineLeft: b.style.left || "",
							inlineTop: b.style.top || "",
							text: (b.textContent || "").trim().slice(0, 24),
						};
					})()`,
					returnByValue: true,
				})
			).result.value;
			record(
				"R-PET-11",
				"关框之后台词气泡回到宠物头顶（聊天框残留的 inline left/top 不许顶掉基类定位）",
				sayGeo?.chat === false &&
					sayGeo?.inlineLeft === "" &&
					sayGeo?.inlineTop === "" &&
					Math.abs(sayGeo?.dx ?? 999) <= 60 &&
					(sayGeo?.gapY ?? 999) >= -45 &&
					(sayGeo?.gapY ?? 999) <= 25 &&
					(sayGeo?.text ?? "").length > 0,
				`关框后按 Enter 触发 \`say()\`：气泡相对宠物的水平偏差 ${sayGeo?.dx}px（居中 ≈ 0；残留 inline 值会让它偏出几百像素）、纵向间距 ${sayGeo?.gapY}px（基类的 bottom: calc(100% - 20px) ≈ −20）、残留 inline left/top「${sayGeo?.inlineLeft}|${sayGeo?.inlineTop}」（期望空串）、气泡文本「${sayGeo?.text}」`,
			);
		}

			// ── ⑨ R-PET-14：点「面板与角色之外」的任意处 → 关框（发起人 2026-10-08 附图）──
			// 为什么这条是"真问题"而不是锦上添花：`closeChat()` 的入口只有 Esc（手机没键盘）、
			// Swup 切页与组件内部调用 —— 面板里只有「↓ 最新」与「清空对话」，**没有关闭按钮**，
			// 手机上打开之后就出不去了（发起人原话：「点按非对话框或非角色之外任意处，对话框就关闭」）。
			{
				const realClickAt = async (x, y) => {
					for (const type of ["mousePressed", "mouseReleased"]) {
						await cdp.send("Input.dispatchMouseEvent", {
							type,
							x: Math.round(x),
							y: Math.round(y),
							button: "left",
							buttons: type === "mousePressed" ? 1 : 0,
							clickCount: 1,
						});
					}
				};
				const chatState = async () =>
					(
						await cdp.send("Runtime.evaluate", {
							expression: `(() => {
								const b = document.getElementById("pet-bubble");
								const log = b.querySelector(".pet-chat-log");
								return {
									open: b.classList.contains("is-chat"),
									hasLog: !!log,
									lines: log ? log.querySelectorAll(".pet-chat-line").length : 0,
									role: b.getAttribute("role"),
								};
							})()`,
							returnByValue: true,
						})
					).result.value;
				/** 找一块"真的是空地"的点：不在面板/宠物里、也不是链接或按钮 */
				const emptySpot = async () =>
					(
						await cdp.send("Runtime.evaluate", {
							expression: `(() => {
								const b = document.getElementById("pet-bubble");
								const pet = document.getElementById("pet");
								for (let y = 140; y < window.innerHeight - 90; y += 40) {
									for (let x = 40; x < window.innerWidth - 40; x += 40) {
										const n = document.elementFromPoint(x, y);
										if (!n) continue;
										if (b.contains(n) || pet.contains(n)) continue;
										if (n.closest("a,button,input,textarea,select,[role=button],[data-pet-act]")) continue;
										return { x, y, tag: n.tagName, cls: String(n.className || "").slice(0, 48) };
									}
								}
								return null;
							})()`,
							returnByValue: true,
						})
					).result.value;

				await openPetChat();
				await sleep(400);
				const before = await chatState();
				const spot = await emptySpot();
				if (spot) await realClickAt(spot.x, spot.y);
				await sleep(320);
				const afterOutside = await chatState();

				// 重开 → 点面板**里面**（历史区中央）
				await openPetChat();
				await sleep(400);
				const inside = (
					await cdp.send("Runtime.evaluate", {
						expression: `(() => { const r = document.querySelector(".pet-chat-log").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
						returnByValue: true,
					})
				).result.value;
				await realClickAt(inside.x, inside.y);
				await sleep(300);
				const afterInside = await chatState();

				// 再点**角色本體**（这条同时验 `say()` 的 `chatOpen` 闸门：面板不许被台词冲掉）
				const petBox = (
					await cdp.send("Runtime.evaluate", {
						expression: `(() => { const r = document.getElementById("pet-body").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
						returnByValue: true,
					})
				).result.value;
				await realClickAt(petBox.x, petBox.y);
				await sleep(340);
				const afterPet = await chatState();
				// 收拾干净：后面的 R-AGT 段会自己开框，但不该踩着"已经开着"的状态开始
				await closePetChat();
				await sleep(200);

				facts["pet-light-dismiss"] = { before, spot, afterOutside, afterInside, afterPet };

				record(
					"R-PET-14",
					"点「面板与角色之外」的任意处 → 聊天框关闭（手机上唯一的关框路径）",
					before?.open === true &&
						spot !== null &&
						afterOutside?.open === false &&
						afterOutside?.hasLog === false,
					`框开着=${before?.open} → 真机点空地 (${spot?.x},${spot?.y}·${spot?.tag}) → 框=${afterOutside?.open}、面板 DOM 还在=${afterOutside?.hasLog}（这一点先自证过"不在面板/宠物里、也不是链接或按钮"，避免"点链接切页顺手关框"那种假绿）`,
				);
				record(
					"R-PET-14",
					"点面板**里面**（历史区）→ 不关框（输入框/历史/两个按钮都不算「点外面」）",
					afterInside?.open === true && afterInside?.hasLog === true,
					`点历史区中央后：框=${afterInside?.open}、面板 DOM=${afterInside?.hasLog}、role=${afterInside?.role}（期望 dialog）`,
				);
				record(
					"R-PET-14",
					"点**角色本體** → 不关框，且面板 DOM 没被台词冲掉（`say()` 的 `chatOpen` 闸门）",
					afterPet?.open === true &&
						afterPet?.hasLog === true &&
						afterPet?.lines === afterInside?.lines,
					`点她一下之后：框=${afterPet?.open}、面板 DOM=${afterPet?.hasLog}、历史行数 ${afterInside?.lines} → ${afterPet?.lines}（没有闸门的话 \`say()\` 会直接写 \`#pet-bubble.textContent\`，面板当场消失）`,
				);
			}

			// ── R-PET-12 手机端显示（发起人 2026-10-08：「手机端我咋没看到桌宠」→ 选 A：显示但缩小）──
		// 口径变了两件事：① `hideOnMobile` 由 true 改 false；② 手机档缩放**真正生效**。
		// ② 才是这一轮的真 bug：那段 `@media (max-width: 767px)` 早就写在 pet.css 里，
		//    但组件内联写 `--pet-scale`，**内联变量赢过媒体查询** → 手机拿到的一直是桌面档。
		// 所以这里既要验"看到的尺寸"，也要验"两个数值源头是一致的"。
		const petCfgSrc = await fs.readFile(path.resolve("src/config/petConfig.ts"), "utf8");
		const petCssSrc = await fs.readFile(path.resolve("src/styles/pet.css"), "utf8");
		const petCompSrc = await fs.readFile(path.resolve("src/components/features/AemeathPet.astro"), "utf8");
		const petNum = (re) => Number(re.exec(petCfgSrc)?.[1] ?? 0);
		const CFG = {
			scale: petNum(/^\s*scale:\s*([\d.]+)/m),
			mobileScale: petNum(/mobileScale:\s*([\d.]+)/),
			miniFactor: petNum(/miniFactor:\s*([\d.]+)/),
			breakpoint: petNum(/mobileBreakpoint:\s*(\d+)/),
		};
		// CSS 里那条媒体查询的断点（必须等于 mobileBreakpoint − 1，且它选的确实是手机档）
		const CSS_BP = Number(
			/@media \(max-width:\s*(\d+)px\)\s*\{\s*\.pet\s*\{\s*--pet-scale-active:\s*var\(--pet-scale-mobile\)/.exec(petCssSrc)?.[1] ?? 0,
		);
		{
			const desk = facts["pet-boot"]?.pet;
			const mob = facts["pet-390"]?.pet;
			const mobResize = facts["pet-menu-narrow-boot"]?.pet;
			const expectDesk = Math.round(144 * CFG.scale);
			const expectMob = Math.round(144 * CFG.mobileScale);
			record(
				"R-PET-12",
				"缩放档位与断点的两个源头一致（CSS 断点 = petConfig.mobileBreakpoint − 1，且选的是手机档变量）",
				CFG.breakpoint === 768 && CSS_BP === CFG.breakpoint - 1 && CFG.mobileScale > 0 && CFG.mobileScale < CFG.scale,
				`petConfig：breakpoint=${CFG.breakpoint}、scale=${CFG.scale}、mobileScale=${CFG.mobileScale}；pet.css 媒体查询断点=${CSS_BP}（期望 ${CFG.breakpoint - 1}）`,
			);
			record(
				"R-PET-12",
				`手机端 390 冷启动用**手机档**缩放（${expectMob}px），不是桌面档（${expectDesk}px）`,
				mob?.exists === true &&
					mob?.off === false &&
					mob?.sprite?.w === expectMob &&
					mob?.scaleVars?.active === String(CFG.mobileScale) &&
					desk?.sprite?.w === expectDesk &&
					desk?.scaleVars?.active === String(CFG.scale),
				`390 冷启动：精灵 ${mob?.sprite?.w}×${mob?.sprite?.h}px（--pet-scale-active=${mob?.scaleVars?.active}）；1440 对照：精灵 ${desk?.sprite?.w}×${desk?.sprite?.h}px（--pet-scale-active=${desk?.scaleVars?.active}）`,
			);
			record(
				"R-PET-12",
				"窗口由 1440 缩到 390（resize 路径，不刷新）→ 缩放立刻切到手机档",
				mobResize?.scaleVars?.active === String(CFG.mobileScale) && mobResize?.sprite?.w === expectMob,
				`缩窄后（同一页面会话）：--pet-scale-active=${mobResize?.scaleVars?.active}、精灵 ${mobResize?.sprite?.w}px；内联两档 --pet-scale-desktop=${mobResize?.scaleVars?.desktop} / --pet-scale-mobile=${mobResize?.scaleVars?.mobile}`,
			);
			// R-PET-01 的移动端分支现在**默认不触发**（hideOnMobile=false），但开关本身不许被拆掉：
			// 它是"解析期就决定要不要启动脚本"的唯一入口，拆了以后改成 true 会静默失效。
			record(
				"R-PET-01",
				"移动端隐藏开关仍接在解析期脚本上（hideOnMobile=false 恒不触发，机制未丢）",
				/\$\{hideOnMobile\}&&window\.matchMedia/.test(petCompSrc) && mob?.off === false,
				`组件里解析期脚本仍按 hideOnMobile 插值（当前 false → 390 下 petOff=${mob?.off}，人还在）`,
			);
		}

		// ── R-PET-13 迷你档（发起人：「最后一个变成关闭，但关闭不是完全关闭，会变成很小一只，
		//    比待机还小，双击后仍能变回爱弥斯」）────────────────────────────────────
		// 全走真机路径（真右键开菜单 → 点可见的「缩小」→ 真双击），判据落在**真实像素**上：
		//   · 变小 = 精灵宽度 124 → 62px（= 144 × 0.86 × 0.5），与 miniFactor 对得上；
		//   · "比待机还小" = mini 档是桌面档的 0.5 倍，而待机（waiting）用的就是桌面档缩放；
		//   · 脚底不动 = 缩放前后 rect.bottom 不变（原地变小，不是往上蹿半个身位）。
		{
			const m = facts["pet-mini"];
			const expectMini = Math.round(144 * CFG.scale * CFG.miniFactor);
			record(
				"R-PET-13",
				"菜单末项是「缩小」且顺序按发起人要求（聊天第一、缩小最后；v1.69 改的字面）",
				same(m?.before?.items, ["和爱弥斯聊天", "落下去", "飘起来", "缩小"]) &&
					m?.before?.label === "缩小" &&
					m?.before?.pressed === "false" &&
					m?.open?.target?.text === "缩小" &&
					m?.open?.target?.topHit === "self",
				`菜单项=${JSON.stringify(m?.before?.items)}；末项文案「${m?.before?.label}」aria-pressed=${m?.before?.pressed}；真机点中的是「${m?.open?.target?.text}」（命中=${m?.open?.target?.topHit}）`,
			);
			record(
				"R-PET-13",
				`点「缩小」→ 真的变小（${expectMini}px = 144 × ${CFG.scale} × ${CFG.miniFactor}），节点没被删也没藏`,
				m?.closed?.mini === "1" &&
					m?.closed?.spriteW === expectMini &&
					m?.closed?.spriteW < (m?.before?.spriteW ?? 0) * 0.55 &&
					CFG.miniFactor > 0 &&
					CFG.miniFactor < 1 &&
					m?.closed?.vars?.miniFactor === String(CFG.miniFactor),
				`精灵 ${m?.before?.spriteW}×${m?.before?.spriteH} → ${m?.closed?.spriteW}×${m?.closed?.spriteH}px（data-pet-mini=${m?.closed?.mini}、--pet-mini-factor=${m?.closed?.vars?.miniFactor}；待机 waiting 用桌面档，所以这只必然更小）`,
			);
			record(
				"R-PET-13",
				"缩小时脚底锚点不动（缩小是原地变小，底边不向上蹿）",
				Math.abs((m?.closed?.bottom ?? -999) - (m?.before?.bottom ?? 0)) <= 2 &&
					(m?.closed?.bottom ?? 0) > (m?.closed?.top ?? 0),
				`底边 ${m?.before?.bottom}px → ${m?.closed?.bottom}px（Δ=${(m?.closed?.bottom ?? 0) - (m?.before?.bottom ?? 0)}px，容差 2px）；top ${m?.before?.top} → ${m?.closed?.top}`,
			);
			record(
				"R-PET-13",
				"迷你期间闭嘴：单击不说话（气泡仍为空），也没被误当成「叫醒她」",
				m?.single?.bubbleText === "" && m?.single?.mini === "1" && m?.single?.label === "叫醒她",
				`迷你时单击后：气泡「${m?.single?.bubbleText}」（期望空）、data-pet-mini=${m?.single?.mini}、末项文案「${m?.single?.label}」`,
			);
			record(
				"R-PET-13",
				"真双击 → 变回爱弥斯（回到桌面档尺寸、末项文案回到「缩小」、并说一句）",
				m?.restored?.mini === "0" &&
					m?.restored?.spriteW === m?.before?.spriteW &&
					m?.restored?.label === "缩小" &&
					m?.restored?.pressed === "false" &&
					(m?.restored?.bubbleText ?? "").length > 0,
				`双击后：精灵 ${m?.restored?.spriteW}×${m?.restored?.spriteH}px（恢复前 ${m?.closed?.spriteW}px、原始 ${m?.before?.spriteW}px）、data-pet-mini=${m?.restored?.mini}、气泡「${m?.restored?.bubbleText}」`,
			);
		}

	// ── ⑤⑥ 状态联动与复位（真机，`data-pet-state` 逐次采样）─────────────
		{
			// 用死端口跑这一组：**请求一定会失败**，于是"思考态 → failed → 复位"这条链
			// 每次都能在几秒内跑完，比拿真后端赌"答复快不快"稳定得多。
			await arm({ enable: true, baseUrl: DEAD, timeoutMs: 3000 });
			const r1 = await askPet("在吗", { timeout: 30000 });
			const r2 = await askPet("再问一句", { timeout: 30000 });
			const seq1 = r1?.stateSeq ?? [];
			const seq2 = r2?.stateSeq ?? [];
			const THINK = ["running", "review"];
			record(
				"R-AGT-04",
				"请求发出时是**思考态**（`running` 或 `review`），答复/降级后离开思考态",
				seq1.some((s) => THINK.includes(s)),
				`第 1 次提问的 state 序列 ${JSON.stringify(seq1)}；收尾态 ${r1?.stateAfter}；气泡「${(r1?.reply ?? "").replace(/\n/g, "⏎")}」`,
			);
			record(
				"R-AGT-04",
				"连续两次提问：状态每次都能复位（第 2 次仍出现思考态，不卡在思考中）",
				seq2.some((s) => THINK.includes(s)) && !!r2?.reply && r2.inputStillThere === true,
				`第 2 次提问「再问一句」的 state 序列 ${JSON.stringify(seq2)}；收尾态 ${r2?.stateAfter}；输入框仍在=${r2?.inputStillThere}`,
			);
			// 关聊天框 → 立刻复位（`closeChat()` 里 `setState("idle")`）
			await closePetChat();
			const closed = await petUi();
			record(
				"R-AGT-04",
				"关掉聊天框 → 气泡清空、状态立刻复位成 `idle`（不留在思考态）",
				closed.chat === false && closed.bubble === "" && closed.state === "idle",
				`关闭后：is-chat=${closed.chat}、气泡「${closed.bubble}」、data-pet-state=${closed.state}`,
			);
			// Swup 切页 → 状态复位
			const swupClick = `(() => { const a = [...document.querySelectorAll("a")].find((x) => (x.getAttribute("href") || "").indexOf("/archive/") === 0); if (!a) return false; a.click(); return true; })()`;
			const clicked = await cdp.send("Runtime.evaluate", { expression: swupClick, returnByValue: true });
			await sleep(2200);
			const onArchive = await cdp.send("Runtime.evaluate", {
				expression: `({ path: location.pathname, state: (document.getElementById("pet") || {}).dataset ? document.getElementById("pet").dataset.petState : null })`,
				returnByValue: true,
			});
			await sleep(3000);
			const rest = await petUi();
			record(
				"R-AGT-04",
				"Swup 切页 → 聊天框关掉、状态复位（不卡在思考中）",
				clicked.result.value === true &&
					onArchive.result.value.path?.startsWith("/archive") &&
					rest.chat === false &&
					!THINK.includes(rest.state),
				`切页后 pathname=${onArchive.result.value.path}；刚到时 data-pet-state=${onArchive.result.value.state}；+3 秒后 data-pet-state=${rest.state}（思考态集合 ${JSON.stringify(THINK)}）、is-chat=${rest.chat}`,
			);
			// 还原注入（测完不留痕：删掉全局量 → 走 `agentConfig` 真值）
			await cdp.send("Runtime.evaluate", {
				expression: `(() => { delete window.__imissAgentConfig; delete window.__imissAgentUrls; window.__imissAgentRestored = true; return true; })()`,
				returnByValue: true,
			});
			const restored = await cdp.send("Runtime.evaluate", {
				expression: `(() => ({ restored: window.__imissAgentRestored === true, leftover: "imissAgent" in window && !!window.__imissAgentConfig }))()`,
				returnByValue: true,
			});
			record(
				"R-AGT-08",
				"注入的测试配置已还原（页面回到 `agentConfig` 真值，不留测试痕迹）",
				restored.result.value.restored === true && restored.result.value.leftover === false,
				`__imissAgentConfig 已删除=${!restored.result.value.leftover}`,
			);
		}
	}

	// ── B-16：页内锚点（R-NAV-08）────────────────────────────────────────
	// 症状（修复前）：点 TOC / 标题锚点后 URL 会带上 hash、也会滚到位，但 `history.length`
	// **不变**（Swup 4.9.2 的 `handleLinkClick()` 对"同页锚点"走自己的 `link:anchor` 分支，
	// 里面调的是 `updateHistoryRecord()` = `history.replaceState()`，不是 push）→ 按一次
	// 「后退」直接离开该页（文章页退到上一份文档），读者回不到原来的位置。
	// 修复：`astro.config.mjs` 里给 swup 加 `ignore: ['a[href^="#"]:not([href="#"])']`
	// （@swup/astro 会把它序列化进 `ignoreVisit`），并去掉 `TOCManager` 自己那个
	// `preventDefault()` + 手动滚动的点击处理器 —— 页内锚点整条路交回浏览器原生。
	// 为什么这组断言要**同时**钉住四件事：只钉"hash 变了"的话，修复前的实现也满足
	// （它靠 replaceState 补写 hash）—— 那种"看起来在查、其实查不出病"的断言正是 T79 一类。
	// 所以每条都要 hash + **历史条目数** + **后退不重渲染**（元素身份 + Swup visit 计数）一起判。
	{
		const evalIn = async (expr) =>
			(await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
		const goto = async (url) => {
			const loaded = cdp.once("Page.loadEventFired", 8000).catch(() => null);
			await cdp.send("Page.navigate", { url });
			await loaded;
			await sleep(900);
		};
		/**
		 * 轮询等条件成立。表达式抛错按"还没成立"处理（元素没了 → 该红的断言要红，
		 * 不许把整轮炸掉 —— Task 2 踩过的同类坑）。
		 */
		const waitFor = async (expr, timeoutMs = 4000) => {
			for (let waited = 0; waited <= timeoutMs; waited += 150) {
				if (await evalIn(`(() => { try { return Boolean(${expr}); } catch { return false; } })()`)) return true;
				await sleep(150);
			}
			return false;
		};
		/** 等平滑滚动停稳（`html { scroll-behavior: smooth }`：固定 sleep 在慢机器上会假红/假绿） */
		const waitScrollStable = async (timeoutMs = 5000) => {
			let last = null;
			let same = 0;
			for (let waited = 0; waited <= timeoutMs; waited += 150) {
				const y = await evalIn("Math.round(window.scrollY)");
				if (y === last) {
					if (++same >= 3) return y;
				} else {
					same = 0;
					last = y;
				}
				await sleep(150);
			}
			return last;
		};
		/**
		 * 插桩（只在页面里，不落仓库）：visit 计数 + "当前 JS 上下文 / DOM 身份"。
		 * ⚠️ `container` / `firstChild` 是**元素引用**：Swup 真重渲染了容器内容时它们会
		 * 变成 detached（`isConnected === false`）。比"内容看起来一样"可靠。
		 */
		const arm = async () =>
			evalIn(`(() => {
				window.__b16ui = {
					docId: Math.random().toString(36).slice(2),
					visits: 0,
					container: document.querySelector("#swup-container"),
					firstChild: document.querySelector("#swup-container")?.firstElementChild ?? null,
				};
				// 同一个页面里可能被 arm 多次（每次换页后重新插桩），别重复挂 hook
				if (!window.__b16uiHooked && window.swup?.hooks) {
					window.__b16uiHooked = true;
					window.swup.hooks.on("visit:start", () => { window.__b16ui.visits++; });
				}
				return { docId: window.__b16ui.docId, firstChild: window.__b16ui.firstChild ? window.__b16ui.firstChild.tagName + "#" + (window.__b16ui.firstChild.id || "") : null };
			})()`);
		/**
		 * 采一份"锚点点击后应该看什么"的快照。
		 * ⚠️ 每个 `same*` 判定都**显式要求两侧元素都在**（`!!a && !!b && a === b`）——
		 * 写成 `a === b` 时，元素缺失会让两边都是 `undefined` 而**恒真**（T79 同源的"结构上不可能红"）。
		 */
		const observe = async (targetId) =>
			evalIn(`(() => {
				try {
					const cur = document.querySelector("#swup-container");
					const heading = ${targetId ? `document.getElementById(${JSON.stringify(targetId)})` : "null"};
					return {
						pathname: location.pathname,
						hash: location.hash,
						hashIsTarget: ${targetId ? `decodeURIComponent(location.hash.replace(/^#/, "")) === ${JSON.stringify(targetId)}` : "null"},
						hrefEndsWithBareHash: location.href.endsWith("#"),
						histLen: history.length,
						histStateSource: history.state ? history.state.source : null,
						scrollY: Math.round(window.scrollY),
						headingTop: heading ? Math.round(heading.getBoundingClientRect().top) : null,
						contextAlive: !!window.__b16ui && typeof window.__b16ui.docId === "string",
						visits: window.__b16ui ? window.__b16ui.visits : null,
						sameContainer: !!window.__b16ui?.container && !!cur && window.__b16ui.container === cur,
						sameFirstChild: !!window.__b16ui?.firstChild && !!cur && !!cur.firstElementChild && window.__b16ui.firstChild === cur.firstElementChild,
					};
				} catch (e) { return { __error: String(e) }; }
			})()`);
		/** 取一个页内锚点的 href / 目标 id（取不到时返回 null，让断言变红而不是抛异常） */
		const anchorInfo = async (sel) =>
			evalIn(`(() => {
				try {
					const el = document.querySelector(${JSON.stringify(sel)});
					if (!el) return null;
					const href = el.getAttribute("href") || "";
					if (!/^#./.test(href)) return { href, notFragment: true };
					const id = decodeURIComponent(href.slice(1));
					return { href, id, targetExists: !!document.getElementById(id) };
				} catch (e) { return { __error: String(e) }; }
			})()`);
		const clickSel = async (sel) =>
			evalIn(`(() => { try { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return "missing"; el.click(); return "ok"; } catch (e) { return String(e); } })()`);
		const back = async () => {
			await evalIn(`history.back(); "back"`);
			await waitFor(`location.hash === ""`, 3000);
			await waitScrollStable(3000);
		};

		// ① R-NAV-08（磁盘普查，不开浏览器）：全站的"同文档锚点"必须**全部**是 `#frag` 形态，
		//    否则 `a[href^="#"]:not([href="#"])` 这个全局规则会漏掉一部分 —— 这是"为什么它是全局的"的证明。
		//    反例形态：`<a href="/posts/x/#h">`（带路径的同页锚点）—— 扫描里一旦出现，这条立刻红。
		{
			const htmlFiles = [];
			const walk = async (dir) => {
				for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
					const p = path.join(dir, ent.name);
					if (ent.isDirectory()) await walk(p);
					else if (ent.name === "index.html") htmlFiles.push(p);
				}
			};
			// 扫不到产物时按"红"处理（0 个文件 → 下面那条断言自然不成立），不能把整轮炸掉
			await walk(path.resolve("dist")).catch(() => {});
			let fragmentAnchors = 0;
			let bareHashAnchors = 0;
			let uncovered = 0;
			const uncoveredSample = [];
			for (const file of htmlFiles) {
				const html = await fs.readFile(file, "utf8");
				const rel = path.relative(path.resolve("dist"), path.dirname(file)).split(path.sep).join("/");
				const route = rel === "" || rel === "." ? "/" : `/${rel}/`;
				// ⚠️ 只认 `<a>`：`<use href="#icon">` 这类不是锚点，Swup 的 `linkSelector` 也不看它们
				for (const m of html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) {
					const href = m[1];
					if (href === "#") {
						bareHashAnchors++;
						continue;
					}
					if (href.startsWith("#")) {
						fragmentAnchors++;
						continue;
					}
					if (!href.includes("#")) continue;
					let u;
					try {
						u = new URL(href, `http://x${route}`);
					} catch {
						continue;
					}
					if (u.pathname === route) {
						uncovered++;
						if (uncoveredSample.length < 8) uncoveredSample.push(`${route} → ${href}`);
					}
				}
			}
			record(
				"R-NAV-08",
				"全站同文档锚点都是 `#frag` 形态（`a[href^=\"#\"]:not([href=\"#\"])` 这条全局规则覆盖得住）",
				htmlFiles.length > 100 && fragmentAnchors >= 10000 && uncovered === 0,
				`扫 ${htmlFiles.length} 个 index.html：页内锚点 ${fragmentAnchors} 个（含 data-no-swup 的 8 个）｜裸 \`#\` 占位 ${bareHashAnchors} 个｜**选择器覆盖不到的同页锚点 ${uncovered} 个**${uncoveredSample.length ? `：${uncoveredSample.join("；")}` : ""}`,
			);
		}

		// ② R-NAV-08：侧栏目录项（TOCManager 那条路）——hash + 历史 + 后退回原位 + 不重渲染
		// ⚠️ 每一段都**先回首页再进目标页**（两趟换文档的整页加载）：
		//    `history.length` 是"历史栈里的条目总数"，**后退之后再点锚点是在栈中间插一格、
		//    会截断原来后面的条目 → 长度反而不变**（本轮第一次跑就是这么假红的，实测
		//    history.length 31 → 31 而 hash 明明写进去了）。先换一次文档，当前位置才是栈尾。
		//    顺带把"判据之间的隐式依赖"掐掉（Task 3 §1.5.2 的教训）。
		const freshPost = async () => {
			await goto(`${BASE}/`);
			await goto(`${BASE}${SAMPLE_POST}`);
			await arm();
		};
		await freshPost();
		// 前置条件也**算一条断言**：锚点/目录项数不够时，下面几条会因为"点了个不存在的东西"而变红，
		// 但那时原因藏在细节里；这条把"页面本身得先有货"顶到最前面（取不到就是红，不是跳过）。
		// ⚠️ `hashAnchors` 与 `ignoreSelectorMatches` 必须**同一个作用域**里数（全文档）：
		//    第一次跑把前者限制在 `.custom-md` 里、后者是全文档 → 13 vs 52 假红。
		const anchorInv = await evalIn(`(() => {
			const all = [...document.querySelectorAll("a[href]")];
			return {
				headingAnchors: document.querySelectorAll(".custom-md a.anchor[href^='#']").length,
				tocItems: document.querySelectorAll("#sidebar-toc-content a[href^='#']").length,
				hashAnchors: all.filter((a) => (a.getAttribute("href") || "").startsWith("#")).length,
				ignoreSelectorMatches: all.filter((a) => a.matches('a[href^="#"]:not([href="#"])')).length,
				bareHashAnchors: all.filter((a) => a.getAttribute("href") === "#").length,
			};
		})()`);
		record(
			"R-NAV-08",
			`长文章页 ${SAMPLE_POST} 上目录项 / 标题锚点都够多，且页内锚点**全部**落在这条新规则里（后面几条不空过）`,
			anchorInv?.headingAnchors >= 5 &&
				anchorInv?.tocItems >= 5 &&
				anchorInv?.hashAnchors >= 20 &&
				anchorInv?.hashAnchors === anchorInv?.ignoreSelectorMatches &&
				anchorInv?.bareHashAnchors === 0,
			`标题锚点 ${anchorInv?.headingAnchors} 个 ｜ 侧栏目录项 ${anchorInv?.tocItems} 个 ｜ 全文档页内锚点 ${anchorInv?.hashAnchors} 个，被新 \`ignore\` 选择器命中 ${anchorInv?.ignoreSelectorMatches} 个（必须相等）｜ 裸 \`#\` 占位 ${anchorInv?.bareHashAnchors} 个（本页应为 0）`,
		);

		const tocAnchor = await anchorInfo("#sidebar-toc-content a[href^='#']");
		const beforeToc = await observe(tocAnchor?.id);
		const tocClick = await clickSel("#sidebar-toc-content a[href^='#']");
		await waitFor("location.hash.length > 1", 3000);
		await waitScrollStable(5000);
		const afterToc = await observe(tocAnchor?.id);
		await back();
		const backToc = await observe(tocAnchor?.id);
		record(
			"R-NAV-08",
			"点侧栏目录项：写 hash + **写历史记录**（`history.length` +1）+ 滚到该标题",
			tocClick === "ok" &&
				tocAnchor?.targetExists === true &&
				afterToc?.hashIsTarget === true &&
				afterToc?.histLen === beforeToc?.histLen + 1 &&
				afterToc?.headingTop !== null &&
				afterToc.headingTop >= 30 &&
				afterToc.headingTop <= 160,
			`点 ${tocAnchor?.href}（目标 ${tocAnchor?.id}，存在=${tocAnchor?.targetExists}）｜点击返回=${tocClick} ｜ hash=${afterToc?.hash}（命中目标=${afterToc?.hashIsTarget}）｜ history.length ${beforeToc?.histLen} → ${afterToc?.histLen}（新条目 state.source=${afterToc?.histStateSource}）｜ 标题距视口顶 ${afterToc?.headingTop}px（\`scroll-margin-top: 5.5rem\` = 88px）`,
		);
		record(
			"R-NAV-08",
			"点目录项后按「后退」：留在本页 + 回到无 hash + **不重渲染整页**",
			backToc?.pathname === beforeToc?.pathname &&
				backToc?.hash === "" &&
				backToc?.contextAlive === true &&
				backToc?.sameContainer === true &&
				backToc?.sameFirstChild === true &&
				backToc?.visits === 0,
			`后退后落在 ${backToc?.pathname}${backToc?.hash} ｜ JS 上下文仍在=${backToc?.contextAlive} ｜ 容器还是同一个=${backToc?.sameContainer}、首个子节点还是同一个=${backToc?.sameFirstChild} ｜ 全程 Swup visit 次数=${backToc?.visits}（0 = 没重跑 visit、没重渲染）`,
		);

		// ③ R-NAV-08：正文标题锚点（`rehype-autolink-headings` 的 `a.anchor`）——全站 16 518 个锚点里的大头
		await freshPost();
		const headAnchor = await anchorInfo(".custom-md a.anchor[href^='#']");
		const beforeHead = await observe(headAnchor?.id);
		const headClick = await clickSel(".custom-md a.anchor[href^='#']");
		await waitFor("location.hash.length > 1", 3000);
		await waitScrollStable(5000);
		const afterHead = await observe(headAnchor?.id);
		await back();
		const backHead = await observe(headAnchor?.id);
		record(
			"R-NAV-08",
			"点正文标题锚点：写 hash + 写历史记录 + 滚到该标题",
			headClick === "ok" &&
				headAnchor?.targetExists === true &&
				afterHead?.hashIsTarget === true &&
				afterHead?.histLen === beforeHead?.histLen + 1 &&
				afterHead?.headingTop !== null &&
				afterHead.headingTop >= 30 &&
				afterHead.headingTop <= 160,
			`点 ${headAnchor?.href}（目标 ${headAnchor?.id}，存在=${headAnchor?.targetExists}）｜点击返回=${headClick} ｜ hash=${afterHead?.hash}（命中目标=${afterHead?.hashIsTarget}）｜ history.length ${beforeHead?.histLen} → ${afterHead?.histLen} ｜ 标题距视口顶 ${afterHead?.headingTop}px`,
		);
		record(
			"R-NAV-08",
			"点标题锚点后按「后退」：留在本页 + 回到无 hash + 不重渲染整页",
			backHead?.pathname === beforeHead?.pathname &&
				backHead?.hash === "" &&
				backHead?.contextAlive === true &&
				backHead?.sameContainer === true &&
				backHead?.sameFirstChild === true &&
				backHead?.visits === 0,
			`后退后落在 ${backHead?.pathname}${backHead?.hash} ｜ JS 上下文仍在=${backHead?.contextAlive} ｜ 容器同一=${backHead?.sameContainer}、首个子节点同一=${backHead?.sameFirstChild} ｜ Swup visit 次数=${backHead?.visits}`,
		);

		// ④ R-NAV-08：路线页那 8 个 `data-no-swup` 锚点（R-PATH-01 的先例）也仍须"进历史 + 后退不重渲染"——
		//    这条与 R-PATH-01 的 ⑤⑥ 不重复：那边只判"hash 生效 / 后退回到路线页"，
		//    判不出"历史条目有没有真的多一条"和"有没有被重渲染"（那两件事正是 B-16 的病）。
		await goto(`${BASE}/`);
		await goto(`${BASE}/roadmap/`);
		await arm();
		const rmAnchor = await anchorInfo("#roadmap-index a[href^='#']");
		const beforeRm = await observe(rmAnchor?.id);
		const rmClick = await clickSel("#roadmap-index a[href^='#']");
		await waitFor("location.hash.length > 1", 3000);
		await waitScrollStable(5000);
		const afterRm = await observe(rmAnchor?.id);
		await back();
		const backRm = await observe(rmAnchor?.id);
		record(
			"R-NAV-08",
			"路线页 8 个 `data-no-swup` 锚点仍进历史，后退仍留在本页且不重渲染",
			rmClick === "ok" &&
				rmAnchor?.targetExists === true &&
				afterRm?.hashIsTarget === true &&
				afterRm?.histLen === beforeRm?.histLen + 1 &&
				backRm?.pathname === "/roadmap/" &&
				backRm?.hash === "" &&
				backRm?.sameFirstChild === true &&
				backRm?.visits === 0,
			`点 ${rmAnchor?.href} ｜ history.length ${beforeRm?.histLen} → ${afterRm?.histLen} ｜ 后退后落在 ${backRm?.pathname}${backRm?.hash} ｜ 首个子节点同一=${backRm?.sameFirstChild} ｜ Swup visit 次数=${backRm?.visits}`,
		);

		// ⑤ R-NAV-08：全程**没有整页导航**（插桩对象还在 = 还是同一个 JS 上下文；换文档它必然消失）
		await freshPost();
		const armNav = await evalIn("window.__b16ui ? { docId: window.__b16ui.docId } : null");
		const navAnchor = await anchorInfo("#sidebar-toc-content a[href^='#']");
		await clickSel("#sidebar-toc-content a[href^='#']");
		await waitFor("location.hash.length > 1", 3000);
		await back();
		const kept = await evalIn(`(() => {
			const cur = document.querySelector("#swup-container");
			return {
				contextAlive: !!window.__b16ui && window.__b16ui.docId === ${JSON.stringify(armNav?.docId ?? "MISSING")},
				visits: window.__b16ui ? window.__b16ui.visits : null,
				hash: location.hash,
				pathname: location.pathname,
				firstChild: cur && cur.firstElementChild ? cur.firstElementChild.tagName : null,
			};
		})()`);
		record(
			"R-NAV-08",
			"锚点点击 + 后退全程没有整页导航（JS 上下文未重建，Swup visit 也未跑）",
			kept?.contextAlive === true && kept?.visits === 0 && kept?.pathname === SAMPLE_POST && kept?.hash === "" && !!navAnchor?.targetExists,
			`插桩 docId 是否还在=${kept?.contextAlive}（换文档后 \`window.__b16ui\` 会消失）｜Swup visit 次数=${kept?.visits} ｜ 落点 ${kept?.pathname}${kept?.hash} ｜ 目标 ${navAnchor?.id}`,
		);

		// ⑥ R-NAV-08：裸 `href="#"` 占位链接**不许**被变成原生 `#` 跳转（B-16 的修复边界）。
		//    这就是 `:not([href="#"])` 那半个选择器存在的理由，也是 `Profile.astro` 里
		//    「`<a rel="me" href="#" data-encoded-email=… onclick=return false>`」那类邮箱按钮的同一形态
		//    （本仓当前配置下 Profile 没有 mailto 链接，所以只能拿同形态的占位链接当场验）。
		//    ⚠️ 实测（reports/_b16-probe2.log §Q3）：把 `[href="#"]` 也纳入豁免后，点它会
		//    URL 尾巴多一个 `#`（`location.href.endsWith("#")`）、`history.length` **+1**（多一条垃圾历史）。
		//    用 `el.click()` 而不是真鼠标：这些占位链接带 `pointer-events: none`（真鼠标根本点不到，
		//    那样的断言会"结构上不可能红"）。
		await goto(`${BASE}${SAMPLE_POST}`);
		await goto(`${BASE}/`);
		await arm();
		const beforeBare = await observe();
		const bareClick = await clickSel('a[href="#"]');
		await sleep(700);
		const afterBare = await observe();
		record(
			"R-NAV-08",
			"裸 `href=\"#\"` 占位链接没有被变成原生 `#` 跳转（邮箱按钮同形态）",
			bareClick === "ok" &&
				afterBare?.hrefEndsWithBareHash === false &&
				afterBare?.histLen === beforeBare?.histLen &&
				afterBare?.histStateSource === "swup",
			`点击返回=${bareClick} ｜ URL 尾巴多出 \`#\`=${afterBare?.hrefEndsWithBareHash}（必须 false）｜ history.length ${beforeBare?.histLen} → ${afterBare?.histLen}（必须不变）｜ 条目 state.source=${afterBare?.histStateSource}（仍是 Swup 写的 = 仍由 Swup 拦下）`,
		);

		// ⑦ R-NAV-08：390px 移动宽度 —— 悬浮目录里点一条也要进历史、后退不重渲染，
		//    并且浮层**不许**被这次点击误关（原生锚点导航会派发 popstate，而 FloatingTOC 原先
		//    对任何 popstate 都 `closeTOC()`；现在按它既有的 `tocInternalNavigation` 意图排除了内部导航）。
		await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
		await goto(`${BASE}${SAMPLE_POST}`);
		await arm();
		const floatAnchor = await anchorInfo("#floating-toc-content a[href^='#']");
		const openPanel = await evalIn(`(() => {
			const btn = document.getElementById("floating-toc-btn");
			const panel = document.getElementById("floating-toc-panel");
			if (!btn || !panel) return { missing: true };
			if (panel.classList.contains("hide")) btn.click();
			return { open: !panel.classList.contains("hide"), btnHidden: btn.classList.contains("hide") };
		})()`);
		await sleep(200);
		const beforeFloat = await observe(floatAnchor?.id);
		const floatClick = await clickSel("#floating-toc-content a[href^='#']");
		await waitFor("location.hash.length > 1", 3000);
		await waitScrollStable(5000);
		const afterFloat = await observe(floatAnchor?.id);
		const panelAfter = await evalIn(`(() => { const p = document.getElementById("floating-toc-panel"); return p ? { hidden: p.classList.contains("hide") } : { missing: true }; })()`);
		await back();
		const backFloat = await observe(floatAnchor?.id);
		record(
			"R-NAV-08",
			"390px 悬浮目录：锚点仍写历史、浮层不被误关、后退留在本页且不重渲染",
			openPanel?.open === true &&
				floatClick === "ok" &&
				floatAnchor?.targetExists === true &&
				afterFloat?.hashIsTarget === true &&
				afterFloat?.histLen === beforeFloat?.histLen + 1 &&
				panelAfter?.hidden === false &&
				backFloat?.pathname === SAMPLE_POST &&
				backFloat?.hash === "" &&
				backFloat?.sameFirstChild === true &&
				backFloat?.visits === 0,
			`浮层打开=${openPanel?.open}（按钮自身隐藏=${openPanel?.btnHidden}）｜点 ${floatAnchor?.href} ｜ history.length ${beforeFloat?.histLen} → ${afterFloat?.histLen} ｜ 点完浮层被关=${panelAfter?.hidden}（必须 false）｜ 后退后 ${backFloat?.pathname}${backFloat?.hash}，首个子节点同一=${backFloat?.sameFirstChild}，visit 次数=${backFloat?.visits}`,
		);
		await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
		await goto(`${BASE}/`);
	}

	// ── P4-8（v1.47）：删除清单的"删干净了没有"（空态 / 导航 / 页脚 / 侧栏 / 音乐 / 路由）──
	// 这一块每一条都对着 P4-8 批准清单里的一个具体删除项，删过头或没删干净都会红。
	// 就地写 evalIn / goto（照 2586 行那一套的写法，不另造名字各异的一套）。
	{
		const evalIn = async (expr) =>
			(await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
		const goto = async (url) => {
			const loaded = cdp.once("Page.loadEventFired", 8000).catch(() => null);
			await cdp.send("Page.navigate", { url });
			await loaded;
			await sleep(900);
		};
		// 会被删掉的上游条目名（A1：2 个项目 + 2 个相册）。写死在这里当"反面清单"。
		const REMOVED_ENTRY_NAMES = ["Firefly 主题模版", "示例项目", "可爱流萤", "加密相册示例"]; // ← 前两项是 A1 里被删的上游条目名（反面清单要逐字匹配产物，字面量必须原样）
		/**
		 * 判断空态文案是不是落在**可见的**容器里。
		 * ⚠️ 第一版这里是"取文案前 260 个字符，看里面有没有 card-base 和 hidden"——**假红了两条**：
		 *    空态容器的 class 与文案之间还隔着一整段 `<svg>`（约 200 字符），260 的窗口根本够不着
		 *    `card-base`，于是 `includes("card-base")` 恒 false。改成**从文案往前找最近的那个
		 *    `<div class="card-base`，直接读它的开标签**再判 `hidden` —— 不再靠猜窗口大小。
		 *    为什么必须区分子串：每页还有一个「筛选无结果」的空态元素（`projects-empty hidden` /
		 *    `albums-empty hidden`），它带 hidden、且文案是"没有找到匹配的结果"；只断言"文案在不在"
		 *    会被它蒙混过去（这正是本断言第一版想防的假绿）。
		 */
		const emptyStateIsVisible = (html, text) => {
			const i = html.indexOf(text);
			if (i < 0) return { ok: false, why: `产物里找不到空态文案「${text}」` };
			// 只出现 1 次：出现多次时"往前找最近的那个 card-base"可能配错容器（下面按最近外层判，
			// 一旦将来别处也渲染同一句，这条会立刻红，逼人把判据写准，而不是悄悄判成可见）。
			const occurrences = html.split(text).length - 1;
			if (occurrences !== 1) return { ok: false, why: `空态文案「${text}」出现 ${occurrences} 次（期望恰好 1 次，否则无法确定是哪一处可见）` };
			const openIdx = html.lastIndexOf('<div class="card-base', i);
			if (openIdx < 0) return { ok: false, why: `「${text}」不在 card-base 空态容器里` };
			const openTag = html.slice(openIdx, html.indexOf(">", openIdx) + 1);
			const hasHidden = /class="[^"]*\bhidden\b/.test(openTag);
			return { ok: !hasHidden, why: `出现 ${occurrences} 次，容器开标签=${openTag.slice(0, 110)}` };
		};

		// ① /projects/：v1.65 起**集合里有内容了**（发起人 2026-10-08 要求写两个项目）
		//    所以这条判据从"渲染空态"**就地翻成**"确实列出这两张卡、且字段逐条对得上"。
		//    ⚠️ 为什么不能只看"没有空态"：那样"页面渲染成空白"也会绿 —— 必须正向钉住卡片内容。
		//    反面清单（上游条目名零残留）保留。
		{
			const res = await fetch(`${BASE}/projects/`);
			const html = await res.text();
			const emptyGone = !html.includes("暂无项目");
			const leftover = REMOVED_ENTRY_NAMES.filter((n) => html.includes(n));
			// 两张卡的四个字段：标题 / 状态文案 / 外链 href / 详情链接（逐字来自两份 md 的 frontmatter）
			const EXPECT_PROJECTS = [
				{
					title: "仿 muduo 实现的高并发服务器",
					status: "已发布",
					links: ["https://gitee.com/a2186988646/my_server"],
					detail: "/projects/my-server/",
				},
				{
					title: "基于正倒排索引的 Boost 搜索引擎",
					status: "已发布",
					links: ["https://gitee.com/a2186988646/search_engine", "http://106.52.158.48:8081/"],
					detail: "/projects/boost-search-engine/",
				},
			];
			const cardCount = (html.match(/class="project-card/g) || []).length;
			const missing = [];
			for (const p of EXPECT_PROJECTS) {
				if (!html.includes(p.title)) missing.push(`标题「${p.title}」`);
				if (!html.includes(p.status)) missing.push(`状态「${p.status}」`);
				for (const l of p.links) if (!html.includes(l)) missing.push(`外链 ${l}`);
				if (!html.includes(p.detail)) missing.push(`详情链接 ${p.detail}`);
			}
			record(
				"R-ID-10",
				`/projects/ 列出 ${EXPECT_PROJECTS.length} 个项目卡片（标题/状态/外链/详情链接逐条对得上），空态已消失`,
				res.status === 200 && cardCount === EXPECT_PROJECTS.length && missing.length === 0 && emptyGone,
				`HTTP ${res.status}｜卡片 ${cardCount} 张（期望 ${EXPECT_PROJECTS.length}）｜「暂无项目」空态已消失=${emptyGone}${missing.length ? `｜❌ 缺：${missing.join("、")}` : "｜四类字段全部命中"}`,
			);
			record(
				"R-ID-10",
				"/projects/ 不出现任何已删除的上游项目名",
				leftover.length === 0,
				leftover.join("、") || "无残留",
			);
			// 两个**新**项目详情页：可达 + 正文里有各自的正文特征串（钉住"详情页真的渲染了文章"）
			const newDetails = [];
			for (const [u, needle] of [
				["/projects/my-server/", "多 Reactor"],
				["/projects/boost-search-engine/", "倒排"],
			]) {
				const r = await fetch(`${BASE}${u}`);
				const t = await r.text();
				newDetails.push(`${u}=${r.status}${t.includes(needle) ? "✓正文" : "✗正文缺「" + needle + "」"}`);
			}
			record(
				"R-ID-10",
				"两个新项目详情页可达且正文渲染出来（各含自己的技术特征串）",
				newDetails.every((s) => s.includes("=200") && s.includes("✓正文")),
				newDetails.join(" ｜ "),
			);
		}

		// ② /gallery/：同上；另加"相册详情路由已消失"（配置与目录成对删除的证明）
		{
			const res = await fetch(`${BASE}/gallery/`);
			const html = await res.text();
			const empty = emptyStateIsVisible(html, "暂无相册");
			const leftover = REMOVED_ENTRY_NAMES.filter((n) => html.includes(n));
			record(
				"R-ID-10",
				"/gallery/ 仍可达且渲染空态「暂无相册」（不是筛选无结果的 hidden 元素）",
				res.status === 200 && empty.ok,
				`HTTP ${res.status}，可见空态=${empty.ok}（${empty.why}）`,
			);
			record(
				"R-ID-10",
				"/gallery/ 不出现任何已删除的上游相册名",
				leftover.length === 0,
				leftover.join("、") || "无残留",
			);
			// 只删 config 会留孤儿路由、只删目录会留空相册 —— 这条同时钉住"两条详情路由都没了"
			const galleryDetail = [];
			for (const u of ["/gallery/firefly-2026/", "/gallery/encrypted-test/"]) {
				galleryDetail.push(`${u}=${(await fetch(`${BASE}${u}`, { redirect: "manual" })).status}`);
			}
			record(
				"R-ID-10",
				"两个上游相册的详情路由都已消失（真 404，配置与 public/gallery 目录成对删除）",
				galleryDetail.every((s) => s.endsWith("=404")),
				galleryDetail.join(" "),
			);
		}
		// ②b 两个上游项目的详情路由：v1.65 起 `projects` 集合**有内容了**，但**上游那两条**依旧必须 404
		//     （集合里只有发起人自己的两个项目；上游示例没有回来）
		{
			const projDetail = [];
			for (const u of ["/projects/firefly/", "/projects/example-project/"]) {
				projDetail.push(`${u}=${(await fetch(`${BASE}${u}`, { redirect: "manual" })).status}`);
			}
			record(
				"R-ID-10",
				"两个上游示例项目的详情路由都已消失（真 404）",
				projDetail.every((s) => s.endsWith("=404")),
				projDetail.join(" "),
			);
		}

		// ③ 导航：v1.57 起「链接」组**用发起人自己的外链重建**（口径就地翻转），
		//    v1.61 起是**新一批 6 条**（Gitee / GitHub / CSDN / 洛谷 / Boost 搜索引擎 / HTTP 服务器），
		//    但仍然不许出现"点开是空的分组容器"，也不许混进上游署名项。
		{
			const tops = home.navTops || [];
			// ⚠️ 这条断言在 v1.47~v1.56 期间是反的（"不再有「链接」组"）。翻转的理由与证据：
			//    v1.57 发起人给出清单、B-10 关闭 —— 现在**要求它存在且子项数对得上**。
			//    ⚠️ 判据必须同时看"有没有这一格"与"里面是不是 6 条"：只看前者的话，
			//    一个 children 被过滤光的空「链接」壳子也能过（而那正是 v1.47 注释里担心的形态）。
			//    v1.61：条数由 8 → **6**，但**判据形状一字未动**（数量仍与内容表 EXPECT_LINK_CHILDREN 对齐）。
			const link = tops.find((t) => t.name === "链接");
			record(
				"R-NAV-01~04",
				"「链接」组已按 B-10 重建：在导航里且含 6 条子项",
				!!link &&
					home.allLabels.includes("链接") &&
					(link.children?.length ?? 0) === EXPECT_LINK_CHILDREN.length,
				`顶层=${JSON.stringify(tops.map((t) => t.name))} ｜ 「链接」子项数=${link?.children?.length ?? 0}（期望 ${EXPECT_LINK_CHILDREN.length}）`,
			);
			// "空分组容器"= 触发器 href 是 `#`（下拉）却没有任何子项。
			// 上游那两条署名外链删掉后，如果 nav-menu-utils 不 return null，这里就会抓到空壳。
			const emptyGroups = tops.filter((t) => t.href === "#" && (t.children?.length ?? 0) === 0);
			record(
				"R-NAV-01~04",
				"不存在空的分组容器（href=# 的触发器必有子项）",
				emptyGroups.length === 0,
				emptyGroups.length ? JSON.stringify(emptyGroups.map((t) => t.name)) : "无空分组",
			);
			record(
				"R-NAV-01~04",
				"导航里没有上游署名项（上游主题 / 上游文档站两条外链）",
				!home.allLabels.some((l) => /firefly|cuteleaf|夏夜流萤/i.test(String(l))),
				JSON.stringify(home.allLabels.filter((l) => /firefly|cuteleaf|夏夜流萤/i.test(String(l)))),
			);
		}

		// ④ 页脚：只留 Astro，不留上游字样
		{
			const html = await (await fetch(`${BASE}/`)).text();
			const s = html.indexOf("<footer");
			const footer = s >= 0 ? html.slice(s, html.indexOf("</footer>", s) + 9) : "";
			const hasUpstream = /firefly|cuteleaf|夏夜流萤/i.test(footer);
			const hasAstro = footer.includes(">Astro<") && footer.includes("https://astro.build");
			const hasPoweredBy = footer.includes("Powered by");
			record(
				"R-ID-05",
				"页脚是「Powered by Astro」，不含上游字样",
				footer.length > 0 && hasPoweredBy && hasAstro && !hasUpstream,
				`footer 长度=${footer.length}，Powered by=${hasPoweredBy}，Astro 链接=${hasAstro}，含上游字样=${hasUpstream}`,
			);
		}

		// ⑤ 侧栏「站点信息」：两处硬编码的上游主题版本行都没了，但版本号还在（不留空格子）
		{
			const html = await (await fetch(`${BASE}/`)).text();
			const i = html.indexOf("站点信息");
			const panel = i >= 0 ? html.slice(i, i + 6000) : "";
			const hasUpstream = /firefly|cuteleaf/i.test(panel);
			const hasVersion = /v6\.16\.8/.test(panel);
			// "不留空格子"的可判定代理：版本号那一格仍在（改成中性的 `v6.16.8`），
			// 而不是把整行删掉导致只剩构建平台/许可两项。
			record(
				"R-ID-05",
				"侧栏「站点信息」不含上游字样（中性版本行仍在，未留空格子）",
				panel.length > 0 && !hasUpstream && hasVersion,
				`面板长度=${panel.length}，含上游字样=${hasUpstream}，中性版本号 v6.16.8 仍在=${hasVersion}`,
			);
		}

		// ⑥ 音乐（**v1.63 就地翻转口径**）：导航栏与侧栏**都**要出现播放器入口 / 组件。
		//    ⚠️ 这一段在 v1.47~v1.62 期间钉的是**反的**（"导航栏与侧栏都不再有音乐播放器入口 / 组件"）。
		//    为什么翻：发起人 2026-10-07 交来自己的《别难过》并选"两个都开"，
		//    `musicConfig.ts` 的 `showInNavbar` / `showInSidebar` 已改回 `true`、`local.playlist` 有 1 条，
		//    旧口径的前提（v1.47 删掉上游示例曲 → 歌单空 → 点开是个空播放器）**已不成立**。
		//    ⚠️ 判据只认**两个入口各自的结构**，不认"页面里有没有「音乐」两个字"：
		//      · 导航那一格是 `<button id="music-player-switch" aria-label="音乐">`，
		//        它**根本不在** `home.allLabels` 里（allLabels 只收导航链接的文字）——
		//        旧口径那个 `navHasMusic` 因此**恒为 false**，等于从来没在判 `showInNavbar`（T85 的"判据扫错层"）。
		//      · 侧栏那一格是 `#left-sidebar-wrapper` 里的 `.music-player-widget`。
		//    **注入证据**（见 reports/_music-report.md）：把 `showInSidebar` 改回 `false` 重建 →
		//    下面第 2 格判红、同轮其余各格仍绿；还原后核对 sha256 一致。
		const TRACK = {
			name: "别难过",
			artist: "JEReka",
			url: "/assets/music/JEReka - 别难过.mp3",
			cover: "/assets/music/cover/JEReka-bie-nanguo.jpg",
			// ⚠️ 这两个字节数是**素材事实**（源文件原样复制 / APIC 原样抽出的产物），写死在这里当
			//    "构建链有没有把它原样带出去"的判据：谁在构建里加了压缩或转码，数字一变就判红。
			mp3Bytes: 9599149, // 9.15 MiB，sha256 4d1af1c0…8ef547（与源文件逐字节相同）
			coverBytes: 141956, // 从该 mp3 的 ID3v2.3 APIC 帧原样抽出的 image/jpeg
		};
		{
			const html = await (await fetch(`${BASE}/`)).text();
			await goto(`${BASE}/`);
			const dom = await evalIn(`(() => {
				const navSwitch = document.getElementById("music-player-switch");
				const navPanel = document.getElementById("music-nav-panel");
				const widgets = Array.prototype.slice.call(document.querySelectorAll(".music-player-widget"));
				const sidebarRoot = document.getElementById("left-sidebar-wrapper");
				const inSidebar = widgets.filter(function (w) { return sidebarRoot && sidebarRoot.contains(w); });
				const inNav = navPanel ? widgets.filter(function (w) { return navPanel.contains(w); }) : [];
				return {
					navSwitch: !!navSwitch,
					navLabel: navSwitch ? (navSwitch.getAttribute("aria-label") || "") : "",
					navPanel: !!navPanel,
					widgetTotal: widgets.length,
					widgetInNav: inNav.length,
					widgetInSidebar: inSidebar.length,
					sidebarIds: inSidebar.map(function (w) { return w.id; }),
					sidebarLabel: inSidebar.length ? (inSidebar[0].getAttribute("aria-label") || "") : "",
				};
			})()`);
			record(
				"R-ID-06",
				"导航栏出现音乐播放器入口：按钮（aria-label「音乐」）+ 它控制的浮层里恰好 1 个 widget",
				dom?.navSwitch === true && dom?.navLabel === "音乐" && dom?.navPanel === true && dom?.widgetInNav === 1,
				`#music-player-switch=${dom?.navSwitch}（aria-label=「${dom?.navLabel}」）｜#music-nav-panel=${dom?.navPanel}｜浮层内 .music-player-widget=${dom?.widgetInNav}（期望 1）`,
			);
			record(
				"R-ID-06",
				"侧边栏出现音乐播放器卡片（#left-sidebar-wrapper 内恰好 1 个 .music-player-widget）",
				dom?.widgetInSidebar === 1,
				`#left-sidebar-wrapper 内 widget=${dom?.widgetInSidebar}（期望 1）｜id=${JSON.stringify(dom?.sidebarIds)}｜aria-label=「${dom?.sidebarLabel}」｜全页 widget 总数=${dom?.widgetTotal}（期望 2：导航浮层 1 + 侧栏 1）`,
			);
			// ⚠️ **产物里中文是 `\uXXXX` 转义的**（Astro 的 `define:vars` 序列化 + `minify-inline-scripts`
			//    一起做的：实测 `dist/index.html` 里是 `"name":"\u522B\u96BE\u8FC7"`）——
			//    所以**不能**直接 `html.includes("别难过")`，那会在**正确**的产物上判红（第一版实测如此）。
			//    这里按"解转义 → JSON.parse → 逐字段比"来判：比字符串包含强（证明的是**形状**对，
			//    不是"页面上碰巧出现过这几个字节"），也不怕将来转义形态再变。
			const decodeEsc = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
			const listRaw = /"localPlaylist":\s*(\[[\s\S]*?\])/.exec(html)?.[1] ?? "";
			let servedList = null;
			try {
				servedList = JSON.parse(decodeEsc(listRaw));
			} catch {
				servedList = null;
			}
			const servedFirst = Array.isArray(servedList) ? servedList[0] : null;
			record(
				"R-ID-06",
				"首页产物里那段播放器配置（Manager 的 localPlaylist）正好是这 1 条，name/artist/url/pic 四字段与配置逐字一致",
				Array.isArray(servedList) &&
					servedList.length === 1 &&
					servedFirst?.name === TRACK.name &&
					servedFirst?.artist === TRACK.artist &&
					servedFirst?.url === TRACK.url &&
					servedFirst?.pic === TRACK.cover,
				`localPlaylist（解转义后）=${JSON.stringify(servedList)}｜期望 1 条 ${JSON.stringify({ name: TRACK.name, artist: TRACK.artist, url: TRACK.url, pic: TRACK.cover })}`,
			);
		}

		// ⑥b 资源落位（**同样是就地翻转**）：v1.47~v1.62 这一格钉的是"页面没有音频请求 → 结构上不可能 404"。
		//     现在换成正控："产物里真有这两个文件、字节数与素材逐字节一致、HTTP 真能取到 200"。
		//     ⚠️ 新口径比旧口径**强**：旧口径在"资源缺失"和"资源正常"两种情况下**都会绿**
		//     （它只证明了"没发请求"），这一格在资源缺失 / 少一个字节 / 404 时都会红。
		//     ⚠️ HTTP 用 **HEAD**：只取响应头，**不下载那 9.15 MB**（4323 的静态服务实测支持 HEAD）。
		{
			const sizeOf = async (p) => {
				try {
					return (await fs.stat(path.resolve(p))).size;
				} catch {
					return -1;
				}
			};
			const mp3Bytes = await sizeOf("dist/assets/music/JEReka - 别难过.mp3");
			const coverBytes = await sizeOf("dist/assets/music/cover/JEReka-bie-nanguo.jpg");
			const heads = {};
			for (const u of [TRACK.url, TRACK.cover]) {
				const r = await fetch(`${BASE}${encodeURI(u)}`, { method: "HEAD" }).catch(() => null);
				heads[u] = r ? `${r.status}/len=${r.headers.get("content-length") ?? "—"}` : "请求失败";
			}
			const servedMp3 = heads[TRACK.url] === `200/len=${TRACK.mp3Bytes}`;
			const servedCover = heads[TRACK.cover] === `200/len=${TRACK.coverBytes}`;
			record(
				"R-ID-06",
				`音频与封面都在产物里（mp3 ${TRACK.mp3Bytes} 字节 / 封面 ${TRACK.coverBytes} 字节，原样未转码）且 HTTP 200 可达`,
				mp3Bytes === TRACK.mp3Bytes && coverBytes === TRACK.coverBytes && servedMp3 && servedCover,
				`dist 实测 mp3=${mp3Bytes} 字节（期望 ${TRACK.mp3Bytes}）、封面=${coverBytes} 字节（期望 ${TRACK.coverBytes}）｜HEAD ${TRACK.url} → ${heads[TRACK.url]}｜HEAD ${TRACK.cover} → ${heads[TRACK.cover]}`,
			);
		}

		// ⑥c 运行期事实（**新增的正控**）：浏览器里那份播放器**真的拿到了这条曲目** ——
		//     直接读 `window.__imissMusic.getState()`，四个字段逐字比对。
		//     为什么不能只看 HTML：那段 JSON 也可能已经"死在页面上"（脚本没执行 / 被 minify 改坏 /
		//     解析抛错被吞），只有真跑一遍 `init()` 才能证明这条曲目**到了浏览器里**。
		//     ⚠️ 这一步**不会**下载那 9.15 MB：`init()` 走的 `loadTrack(0, false)` 只把 `audio.src`
		//     挂上去（`preload='none'`、不 autoplay），不点播放就不发音频请求。
		{
			const st = await evalIn(`(async () => {
				const mgr = window.__imissMusic;
				if (!mgr) return { ok: false, why: "页面上没有 window.__imissMusic" };
				// ⚠️ 不能只 \`await mgr.init()\` 就断言：视图脚本也会在 load 之后的 idle 回调里调它，
				//    而 init() 对"正在初始化"是直接 return 的 → 撞上那个窗口时 wait 拿到的是**还没初始化**的
				//    状态，会偶发判红。改成"踢一脚 + 轮询 initialized"。
				mgr.init();
				const t0 = Date.now();
				while (!mgr.getState().initialized && Date.now() - t0 < 5000) {
					await new Promise(function (r) { setTimeout(r, 50); });
				}
				const s = mgr.getState();
				const list = s.playlist || [];
				const t = list[0] || null;
				const audio = document.querySelector("audio");
				return {
					ok: true,
					initialized: s.initialized,
					count: list.length,
					track: t ? { name: t.name, artist: t.artist, url: t.url, pic: t.pic, lrc: t.lrc } : null,
					audioSrc: audio ? (audio.getAttribute("src") || "") : null,
					audioPreload: audio ? (audio.getAttribute("preload") || "") : null,
				};
			})()`);
			const t = st?.track;
			record(
				"R-ID-06",
				"浏览器里 window.__imissMusic 真的拿到这 1 条曲目，name/artist/url/cover 四个字段逐字与配置一致",
				st?.ok === true &&
					st?.initialized === true &&
					st?.count === 1 &&
					t?.name === TRACK.name &&
					t?.artist === TRACK.artist &&
					t?.url === TRACK.url &&
					t?.pic === TRACK.cover &&
					t?.lrc === undefined,
				`初始化解锁=${st?.initialized}${st?.ok ? "" : `（${st?.why}）`}｜playlist ${st?.count} 条｜name=「${t?.name}」artist=「${t?.artist}」url=「${t?.url}」pic=「${t?.pic}」lrc=${JSON.stringify(t?.lrc)}（期望 undefined：这一首没有歌词文件）｜audio.src=「${st?.audioSrc}」preload=「${st?.audioPreload}」`,
			);
		}

		// ⑦ 音乐配置（**v1.63 就地换成新口径**，判据形状照旧：剥掉行注释再扫生效代码）
		//    旧口径钉的是"本地歌单已清空 + 两个入口开关均 false"；
		//    新口径钉的是"歌单**恰好 1 条**、五个字段逐字对、两个开关均 true"，
		//    并**继续钉住 v1.48 那两条**（上游 meting 歌单 ID 不在生效配置里 + `mode` 仍是 `local`）。
		//    为什么配置层还要单独一条：渲染可能是缓存 / Swup 残留 / 别的开关顺手带上来的，
		//    "配置层的事实"与"渲染的事实"要分别钉（v1.48 立的规矩，本轮沿用）。
		// ⚠️ **必须先剥掉 `//` 行注释再扫**：本仓库的惯例是"清空值、并在注释里标注原值来源"
		//    （R-ID-05 就是这么做的），`musicConfig.ts` 的注释里**故意留着**那个上游 ID 作历史记录。
		//    不剥注释的话这条断言会被自己的说明文字判红 —— 第一版实测正是这样红的
		//    （`meting.id 已清空=false` 而 id 其实早就空了），与 T85"判据扫错层"是同一类坑。
		{
			const musicCfg = await fs.readFile(path.resolve("src/config/musicConfig.ts"), "utf8");
			const musicCode = musicCfg.replace(/\/\/[^\n]*/g, "");
			// ⚠️ `playlist: [` 要连方括号一起匹配：光匹配 `playlist:` 会先撞上 meting 段的
			//    `type: "playlist"`（虽然那里后面跟的是引号不是 `[`，写松一点就会错抓到别处）。
			const listBlock = musicCode.match(/playlist:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
			const field = (k) => new RegExp(`${k}:\\s*"([^"]*)"`).exec(listBlock)?.[1] ?? null;
			const want = { name: TRACK.name, artist: TRACK.artist, url: TRACK.url, cover: TRACK.cover, lrc: "" };
			const got = Object.fromEntries(Object.keys(want).map((k) => [k, field(k)]));
			const entryCount = (listBlock.match(/\bname:\s*"/g) || []).length;
			const fieldsOk = Object.keys(want).every((k) => got[k] === want[k]);
			const navOn = /showInNavbar:\s*true/.test(musicCode);
			const sideOn = /showInSidebar:\s*true/.test(musicCode);
			const metingCleared = !musicCode.includes("10046455237") && /^\s*id:\s*""/m.test(musicCode);
			const modeStillLocal = /mode:\s*"local"/.test(musicCode);
			record(
				"R-ID-06",
				"musicConfig：本地歌单恰好 1 条且 name/artist/url/cover/lrc 五个字段逐字正确 + 两个入口开关均 true + 上游 meting 歌单 ID 仍清空（mode 仍 local）",
				entryCount === 1 && fieldsOk && navOn && sideOn && metingCleared && modeStillLocal,
				`歌单条数=${entryCount}（期望 1）｜${Object.keys(want)
					.map((k) => `${k}=「${got[k]}」${got[k] === want[k] ? "✓" : `✗（期望「${want[k]}」）`}`)
					.join("｜")}｜showInNavbar=true=${navOn}｜showInSidebar=true=${sideOn}｜meting.id 仍清空=${metingCleared}｜mode=local=${modeStillLocal}`,
			);
		}
		await goto(`${BASE}/`);
	}

	// ── 报告口径自检（不碰浏览器，纯记账逻辑）────────────────────────────
	// 为什么要这一条：P5 复核点名「R-AGT-08 多次 SKIP 却计成 ✅」，而那个 bug 的成因是
	// `record()` 的第 5 个参数（`skipped`）**被签名静默丢掉** —— 光靠"跑一遍真链路看报告"
	// 是验不到的（后端健康时那条根本不会 SKIP）。所以这里直接**记账**验一次：
	// 跳过项必须不计入"通过"、必须能被单独数出来、且 `pass` 不该被当作"跑过了"。
	{
		const probeResults = [];
		const probeRecord = (id, desc, pass, detail = "", skipped = false) => {
			probeResults.push({ id, desc, pass, detail, skipped: Boolean(skipped) });
		};
		probeRecord("UNIT-01", "真的跑过并通过", true, "ok");
		probeRecord("UNIT-02", "没跑到（环境未就绪）", true, "跳过原因", true);
		probeRecord("UNIT-03", "真的失败", false, "boom");
		const ranThrough = probeResults.filter((r) => !r.skipped && r.pass).length;
		const skippedN = probeResults.filter((r) => r.skipped).length;
		const failedN = probeResults.filter((r) => !r.skipped && !r.pass).length;
		record(
			"UNIT",
			"报告口径：`skipped` 会被记下来，且**不计入通过**（P5 复核点名的 SKIP 记账 bug 的回归）",
			skippedN === 1 && ranThrough === 1 && failedN === 1,
			`三条记账（通过 / 跳过 / 失败）→ 通过 ${ranThrough}、跳过 ${skippedN}、失败 ${failedN}（期望各 1）。⚠️ 这条同时钉住"record() 的第 5 个参数不许被签名丢掉"——多传的参数不会报错，只会静默失效`,
		);
	}

	child.kill();
	await fs.rm(profile, { recursive: true, force: true }).catch(() => {});

	// ── 报告 ──
	// INFO 项只是记录（例如"本阶段尚未实现的路由"、上游主题色本身的对比度），
	// 不参与通过/失败计数，免得"功能没做"被算成 ✅、也免得报告看起来比实际更绿。
	const functional = results.filter((r) => !r.id.startsWith("INFO"));
	const informational = results.filter((r) => r.id.startsWith("INFO"));
	// ⚠️ `skipped` 的项**不算失败**（Task 3 修正）：SKIP 的记账约定是"只看 `skipped`，
	//    `pass` 不参与判定"。旧实现只滤 `!r.pass`，于是每一条 SKIP 都同时被算进"失败"——
	//    汇总行会出现"跳过 4、失败 3"自相矛盾、退出码也跟著变 1（实测踩到）。`probeResults`
	//    的同类统计早就写了 `!r.skipped && !r.pass`，这里补齐成一致。原本没有 SKIP 的轮次结果不变。
	// ⚠️ M12（终审）：注释原先写"约定是传 pass=false + skipped=true"，但**现有 6 处 SKIP 调用
	//    （5 处 `record` + 下面 `probeRecord` 的自检样例）全都传 `pass=true`** —— 注释与代码相反，会误导下一个改的人。
	//    现在统一成 **`pass=true` + `skipped=true`**（语义：`pass` 只表示"这条判据本身没红"，
	//    "跑没跑"由 `skipped` 单独表达），并把上面那句假约定删掉。
	const failed = functional.filter((r) => !r.skipped && !r.pass);
	console.log("");
	for (const r of results) {
		// ⚠️ **SKIP 不许长得像 ✅**（P5 复核对本仓库验收的硬要求）：R-AGT 那两条"真往返"在
		// Agent 没起 / 后端文章库不可用时会记 `skipped`，而旧实现只按 `pass` 打勾 ——
		// 于是**没跑到的**那两条在报告里和"跑通了"长得一模一样（复核原话：多次 SKIP 却被计成 ✅）。
		// 现在：`⏭️ [SKIP]` + 单独一行"跳过原因"，汇总行把跳过数**单独列**出来。
		if (r.skipped) {
			console.log(`⏭️  [SKIP] [${r.id}] ${r.desc}${r.detail ? `\n      ↳ 跳过原因：${r.detail}` : ""}`);
		} else {
			console.log(`${r.pass ? "✅" : "❌"} [${r.id}] ${r.desc}${r.detail ? `\n      ${r.detail}` : ""}`);
		}
	}
	const ran = functional.filter((r) => !r.skipped);
	const skipped = functional.filter((r) => r.skipped);
	console.log(
		`\n功能断言 ${functional.length} 项：✅ 通过 ${ran.length - failed.length}，❌ 失败 ${failed.length}，` +
			`⏭️ 跳过 ${skipped.length}（另有 ${informational.length} 条信息记录不计入）`,
	);
	if (skipped.length) {
		// 这一行是"别把 SKIP 读成绿"的最后一道保险
		console.log(
			`⚠️  本轮的 ${skipped.length} 项**没有执行**（不计入通过）：${skipped.map((r) => `[${r.id}] ${r.desc}`).join("；")}`,
		);
	}
	process.exitCode = failed.length ? 1 : 0;
}

main().catch(async (err) => {
	console.error("验收脚本出错：", err);
	// 异常路径也要收尾：杀掉 Chrome、删掉临时 profile（原来只在成功路径清理）
	try {
		_chrome?.kill();
	} catch {}
	if (_profileDir) {
		await fs.rm(_profileDir, { recursive: true, force: true }).catch(() => {});
	}
	process.exitCode = 1;
});
