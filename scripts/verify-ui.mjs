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
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
// 顶层导航顺序与子项顺序（prd.md R-NAV-01~04 / 第 2 章）
const EXPECT_TOP_NAV = ["主页", "文章", "排行", "我的", "链接", "留言"];
const EXPECT_RANK_CHILDREN = [
	{ name: "日漫排行", href: "/rank/jp/" },
	{ name: "国漫排行", href: "/rank/cn/" },
];
const EXPECT_MY_CHILDREN = [
	{ name: "动态", href: "/dynamic/" },
	{ name: "项目", href: "/projects/" },
	{ name: "相册", href: "/gallery/" },
	{ name: "书签导航", href: "/booknav/" },
	{ name: "轻小说", href: "/vndb/" },
	{ name: "番剧", href: "/myanimelist/" },
	{ name: "关于我", href: "/about/" },
];
const EXPECT_ABSENT_LABELS = ["社交", "友链", "哔哩哔哩", "番组计划", "打赏", "关于"];
const EXPECT_HUE = "345";
const EXPECT_STAT_ROWS = 4;
const EXPECT_ABSENT_STAT_TEXT = ["运行时长", "最后活动", "天前"];
const FORBIDDEN_ROUTES = ["/friends/", "/bilibili/", "/bangumi/", "/sponsor/"];
// R-ID-06：订阅功能整体移除后，这 4 条路由**连存根都没有**（文件已删），应该是真 404
const REMOVED_FEED_ROUTES = ["/rss/", "/atom/", "/rss.xml", "/atom.xml"];
const ALLOWED_ROUTES = ["/", "/about/", "/guestbook/", "/vndb/", "/myanimelist/", "/booknav/", "/dynamic/", "/projects/", "/gallery/", "/archive/", "/rank/jp/", "/rank/cn/"];
// P1 阶段这两个页面还不存在；P2 建好后改为断言 200（见 ALLOWED_ROUTES）
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
	send(method, params = {}) {
		const id = ++this.id;
		this.ws.send(JSON.stringify({ id, method, params }));
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			setTimeout(() => {
				if (this.pending.delete(id)) reject(new Error(`${method} 超时`));
			}, 30000);
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
    return { name: txt(head), children };
  }) : [];
  const panel = document.getElementById("nav-menu-panel");
  const mobileTops = panel ? [...panel.querySelectorAll(".mobile-menu-list .mobile-menu-item-root")].map((r) => {
    const label = r.querySelector(".mobile-menu-item-label");
    const children = [...r.querySelectorAll(".mobile-submenu .mobile-menu-item-label")].map((s) => txt(s));
    return { name: txt(label), children };
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
    hueInline: document.documentElement.style.getPropertyValue("--hue").trim(),
    hueComputed: getComputedStyle(document.documentElement).getPropertyValue("--hue").trim(),
    navTops: tops,
    mobileTops,
    allLabels,
    statRows: statsRoot ? statsRoot.querySelectorAll("div.justify-between").length : null,
    statText: txt(statsRoot),
    heatmapExists: !!document.getElementById("heatmap-container"),
    // R-RANK-01~06：排行榜的事实采集（几何 / 两档配色 / 面板显隐 / 缺图降级）
    rank: (() => {
      const board = document.querySelector("[data-rank-board]");
      if (!board) return null;
      const rows = [...board.querySelectorAll("[data-rank-panel]:not([hidden]) .rank-row")];
      return {
        kind: board.dataset.rankKind,
        // R-RANK-02：切换维度后 URL 要同步（读 location.search 判断 pushState 是否执行）
        search: window.location.search,
        title: (board.querySelector("h2") || {}).textContent || null,
        hint: !!board.querySelector(".rank-hint"),
        panels: [...board.querySelectorAll("[data-rank-panel]")].map((p) => ({ kind: p.dataset.rankPanel, hidden: p.hidden })),
        tabs: [...board.querySelectorAll("[data-rank-tab]")].map((t) => ({ kind: t.dataset.rankTab, selected: t.getAttribute("aria-selected") })),
        rows: rows.map((r) => {
          const badge = r.querySelector(".rank-badge");
          const rr = r.getBoundingClientRect();
          const bb = badge.getBoundingClientRect();
          const cs = getComputedStyle(badge);
          return {
            rank: Number(r.dataset.rank),
            top: r.dataset.top === "true",
            h: Math.round(rr.height),
            w: Math.round(rr.width),
            badgeW: Math.round(bb.width),
            badgeBg: cs.backgroundColor,
            badgeFg: cs.color,
            hasImg: !!r.querySelector(".rank-cover img"),
            placeholder: !!r.querySelector(".rank-cover--placeholder"),
          };
        }),
        // R-RANK-05：缺图占位的实际配色（底 + 渐变），回 Node 算"白字压在最亮处"的对比度。
        // 取最亮的一档、且不叠加 scrim（scrim 只会更暗）——保守估计。
        placeholderPaint: (() => {
          const visible = board.querySelector("[data-rank-panel]:not([hidden])");
          const ph = visible && visible.querySelector(".rank-cover--placeholder");
          if (!ph) return null;
          const cs = getComputedStyle(ph);
          return { base: cs.backgroundColor, image: cs.backgroundImage };
        })(),
      };
    })(),
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    // R-RANK-01：导航"当前页高亮"。桌面导航栏上游本来就没有当前页态，
    // 有高亮的是移动端抽屉：NavMenuPanel 的 markActiveNav() 按 pathname 标 data-active
    // 并把所在分组自动展开。收藏这几项就能验"排行子项高亮正确"。
    mobileNavActive: [...document.querySelectorAll(".mobile-menu-item[data-active='true']")].map((i) =>
      (i.textContent || "").trim(),
    ),
    mobileNavExpanded: [...document.querySelectorAll("[data-mobile-dropdown][data-expanded='true']")].map((d) =>
      (d.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 24),
    ),
    // R-ID-07：显示设置面板（调色盘 + 界面结构管理）
    settingsBtn: !!document.querySelector('#display-settings-switch'),
    settingsPanel: !!document.querySelector('[data-floating-panel-trigger="display-settings-switch"]'),
    infoText: txt(infoRoot),
    favicons: [...document.querySelectorAll('link[rel*="icon"]')].map((l) => l.getAttribute("href")),
    bodyText: document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 4000),
  };
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
const record = (id, desc, pass, detail = "") => {
	results.push({ id, desc, pass, detail });
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
	for (const route of FORBIDDEN_ROUTES) {
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
	// R-RANK-01：/rank/ 只是一个存根，静态产物下同样表现为 200 + meta refresh（见 T17）。
	// 真实跳转由 host 的 301 规则接管（ARCH.md §12.2），所以这里断言"存根指向 /rank/jp/"。
	// dev 下 Astro.redirect 是真 302，跳过以免误报。
	if (!isDevServer) {
		const res = await fetch(`${BASE}/rank/`, { redirect: "manual" });
		const body = await res.text();
		const stubToJp = res.status === 200 && /http-equiv="refresh"/.test(body) && /url=\/rank\/jp\//.test(body);
		record("R-RANK-01", "/rank/ 存根跳转到 /rank/jp/", stubToJp, `HTTP ${res.status}`);
	}
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
	// 排行页在 P2 才建：只记录状态，不参与"通过/失败"计数（否则"功能没做"会被算成 ✅）
	for (const route of KNOWN_PENDING_ROUTES) {
		const res = await fetch(`${BASE}${route}`);
		record("INFO(P2)", `排行页尚未实现：${route}`, true, `HTTP ${res.status}（P2 建好后这里应变成 200）`);
	}

	// 上游信息泄漏扫描（P1 的核心目标之一：站点身份不该再夹带上游作者的信息）
	// 这是审查时发现的盲区：只断言"导航里没有打赏"是不够的——首页横幅里曾经还挂着
	// Sponsor 链接和上游邮箱（被 rehype-email-protection 编码成 base64 挂到每个页面）。
	// 所以这里直接扫渲染出来的 HTML，命中即失败。
	const UPSTREAM_LEAK_PATTERNS = [
		["xiaye@msn.com", "上游作者邮箱（明文）"],
		["eGlheWVAbXNuLmNvbQ", "上游作者邮箱（base64 编码形态）"],
		["blog.cuteleaf.cn/sponsor", "上游打赏页链接"],
		["38932988", "上游 Bilibili UID"],
		["1143164", "上游 Bangumi userId"],
		["u358128", "上游 VNDB userId"],
		["Lovely firefly", "上游首页主标题"],
		["In Reddened Chrysalis", "上游首页副标题诗"],
		// R-ID-06：订阅功能移除后，这些不该再出现在任何页面里
		["application/rss+xml", "head 里的 RSS alternate 链接"],
		["application/atom+xml", "head 里的 Atom alternate 链接"],
		["rss.xml", "订阅入口（rss.xml）"],
		["atom.xml", "订阅入口（atom.xml）"],
		['href="/rss/"', "订阅页入口"],
		['href="/atom/"', "订阅页入口"],
	];
	for (const route of ["/", "/about/", "/guestbook/", "/posts/firefly/"]) {
		const html = await (await fetch(`${BASE}${route}`)).text();
		const hits = UPSTREAM_LEAK_PATTERNS.filter(([needle]) => html.includes(needle));
		record(
			"R-ID-05/R-NAV-06",
			`渲染结果不含上游作者信息 / 打赏入口：${route}`,
			hits.length === 0,
			hits.length ? hits.map(([n, why]) => `${why}（${n}）`).join("；") : "干净",
		);
	}
	// 文章页不该有打赏按钮（R-NAV-06 的第三项）
	const postHtml = await (await fetch(`${BASE}/posts/firefly/`)).text();
	record(
		"R-NAV-06",
		"文章页没有打赏按钮 / 打赏链接",
		!/\/sponsor\//.test(postHtml) && !postHtml.includes("打赏"),
		"/sponsor/ 与「打赏」均未出现",
	);
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
		// P2 排行榜
		{ name: "rank-jp-1440", path: "/rank/jp/", width: 1440, height: 1000, mobile: false },
		{ name: "rank-cn-1440", path: "/rank/cn/", width: 1440, height: 1000, mobile: false },
		{ name: "rank-jp-390", path: "/rank/jp/", width: 390, height: 844, mobile: true },
		{ name: "rank-jp-ep-1440", path: "/rank/jp/?kind=ep", width: 1440, height: 1000, mobile: false },
		// 亮色主题下的榜单（缺图占位是半透明色罩在卡片底上，亮色下白字最容易糊 → 单独留一张图）
		{ name: "rank-jp-light-1440", path: "/rank/jp/", width: 1440, height: 1000, mobile: false, light: true },
	];

	const facts = {};
	for (const page of pages) {
		await cdp.send("Emulation.setDeviceMetricsOverride", {
			width: page.width,
			height: page.height,
			deviceScaleFactor: 1,
			mobile: page.mobile,
		});
		// 本站主题跟系统（siteConfig.theme.colorScheme = system），所以要真的模拟
		// prefers-color-scheme 媒体特性，Tailwind 的 `dark:` 变体才会跟着切。
		await cdp.send("Emulation.setEmulatedMedia", {
			features: [{ name: "prefers-color-scheme", value: page.light ? "light" : "dark" }],
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

		// 截图前先模拟"用户滚一遍"：排行榜有 IntersectionObserver 的逐行入场动效，
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

		const shot = await cdp.send("Page.captureScreenshot", {
			format: "png",
			captureBeyondViewport: page.fullPage !== false,
		});
		await fs.writeFile(path.join(OUT_DIR, `${page.name}.png`), Buffer.from(shot.data, "base64"));
		console.log(`截图 ${path.join(OUT_DIR, `${page.name}.png`)}  (${page.width}×${page.height})`);
	}

	// ── R-RANK-02：真实点一次「单集」，再按浏览器后退（验证 pushState + popstate）──
	{
		const loaded = cdp.once("Page.loadEventFired");
		await cdp.send("Page.navigate", { url: `${BASE}/rank/jp/` });
		await loaded;
		await sleep(700);
		await cdp.send("Runtime.evaluate", {
			expression: `document.querySelector('[data-rank-tab="ep"]').click(); "clicked"`,
			returnByValue: true,
		});
		await sleep(350);
		const { result: afterClick } = await cdp.send("Runtime.evaluate", {
			expression: COLLECT,
			returnByValue: true,
		});
		facts["rank-jp-after-click"] = afterClick.value;

		await cdp.send("Runtime.evaluate", { expression: `history.back(); "back"`, returnByValue: true });
		await sleep(600);
		const { result: afterBack } = await cdp.send("Runtime.evaluate", {
			expression: COLLECT,
			returnByValue: true,
		});
		facts["rank-jp-after-back"] = afterBack.value;
	}

	// ── 用采集到的事实做判定 ──
	const home = facts["home-1440"];
	const mobileHome = facts["home-390"];

	record("R-NAV-01~04", "顶层导航顺序", same(home.navTops.map((t) => t.name), EXPECT_TOP_NAV), JSON.stringify(home.navTops.map((t) => t.name)));
	const rank = home.navTops.find((t) => t.name === "排行");
	record("R-NAV-02", "排行子项与链接", !!rank && same(rank.children, EXPECT_RANK_CHILDREN), JSON.stringify(rank?.children));
	const my = home.navTops.find((t) => t.name === "我的");
	record("R-NAV-03", "我的子项顺序与链接", !!my && same(my.children, EXPECT_MY_CHILDREN), JSON.stringify(my?.children));
	record("R-NAV-01~04", "已删除的导航项不再出现", EXPECT_ABSENT_LABELS.every((l) => !home.allLabels.includes(l)), home.allLabels.filter((l) => EXPECT_ABSENT_LABELS.includes(l)).join(",") || "无残留");
	record("R-NAV-01", "移动端菜单最后一项是「留言」且含「排行」", mobileHome.mobileTops.at(-1)?.name === "留言" && mobileHome.mobileTops.some((t) => t.name === "排行"), JSON.stringify(mobileHome.mobileTops.map((t) => t.name)));
	record("R-ID-01", "站点名 IMiss Blog（标题 + 导航栏品牌）", home.title.includes("IMiss Blog") && (home.brand ?? "").includes("IMiss Blog"), `title=${home.title} brand=${home.brand}`);
	record("R-ID-02", "主题色相 = 345", home.hueComputed === EXPECT_HUE || home.hueInline === EXPECT_HUE, `inline=${home.hueInline} computed=${home.hueComputed}`);
	record("R-ID-04", "favicon 已换成 imiss", home.favicons.some((h) => (h ?? "").includes("imiss-32.png")), JSON.stringify(home.favicons));
	record("R-ID-04", "导航栏 Logo 已换成 imiss", (home.logoSrc ?? "").includes("imiss"), home.logoSrc ?? "（没取到 logo）");
	record("R-WDG-01", `站点统计只剩 ${EXPECT_STAT_ROWS} 行`, home.statRows === EXPECT_STAT_ROWS, `实际 ${home.statRows} 行`);
	record("R-WDG-01", "站点统计不含已删文案", EXPECT_ABSENT_STAT_TEXT.every((t) => !(home.statText ?? "").includes(t)), "运行时长/最后活动/天前 均未出现");
	record("R-WDG-02", "日历热力图已关闭", home.heatmapExists === false, `#heatmap-container ${home.heatmapExists ? "仍存在" : "不存在"}`);
	record("R-WDG-03", "站点信息占位模式", (home.infoText ?? "").includes("站点尚未部署") && (home.infoText ?? "").includes("—"), (home.infoText ?? "").slice(0, 80));
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
	// R-NAV-04 原来只看 bodyText.length > 100（几乎恒真）。改成检查页面上有真实内容标志：
	// 关于页里有作者资料名（profileConfig.name）或「关于」字样，并且正文文字量合理。
	{
		const aboutText = facts["about-1440"].bodyText ?? "";
		record(
			"R-NAV-04",
			"关于我页可访问且有真实内容",
			aboutText.length > 200 && (aboutText.includes("关于") || aboutText.includes("IMiss")),
			`正文长度 ${aboutText.length}`,
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

	// ── P2 排行榜（R-RANK-01 ~ R-RANK-06）──
	{
		const jp = facts["rank-jp-1440"].rank;
		const cn = facts["rank-cn-1440"].rank;
		const ep = facts["rank-jp-ep-1440"].rank;
		const clicked = facts["rank-jp-after-click"].rank;
		const back = facts["rank-jp-after-back"].rank;

		record("R-RANK-01", "两个榜单页都渲染出榜单板", !!jp && !!cn, `日漫=${jp?.title} 国漫=${cn?.title}`);
		record("R-RANK-01", "榜单标题正确", jp?.title === "日漫排行" && cn?.title === "国漫排行", `${jp?.title} / ${cn?.title}`);
		record("R-RANK-04", "每组榜单都是 10 条", jp?.rows.length === 10 && cn?.rows.length === 10, `日漫 ${jp?.rows.length} 条 / 国漫 ${cn?.rows.length} 条`);
		record("R-RANK-04", "占位数据提示可见（dataStatus=placeholder）", jp?.hint === true, jp?.hint ? "有提示" : "无提示");

		record(
			"R-RANK-02",
			"默认显示「全剧」",
			jp?.kind === "all" &&
				jp?.panels.find((p) => p.kind === "all")?.hidden === false &&
				jp?.panels.find((p) => p.kind === "ep")?.hidden === true,
			JSON.stringify(jp?.panels),
		);
		record(
			"R-RANK-02",
			"点「单集」后面板切换且 URL 同步",
			clicked?.kind === "ep" &&
				clicked?.panels.find((p) => p.kind === "ep")?.hidden === false &&
				clicked?.panels.find((p) => p.kind === "all")?.hidden === true &&
				(clicked?.search ?? "").includes("kind=ep"),
			`kind=${clicked?.kind} search=${clicked?.search}`,
		);
		record("R-RANK-02", "浏览器后退能回到上一个维度", back?.kind === "all", `后退后 kind=${back?.kind}`);
		record("R-RANK-02", "带 ?kind=ep 的链接直接打开单集榜", ep?.kind === "ep" && ep?.panels.find((p) => p.kind === "ep")?.hidden === false, `kind=${ep?.kind}`);
		record(
			"R-RANK-02",
			"维度按钮带正确的 tab 语义",
			jp?.tabs.every((t) => t.selected === "true" || t.selected === "false") && jp?.tabs.find((t) => t.kind === "all")?.selected === "true",
			JSON.stringify(jp?.tabs),
		);

		// 视觉规格：行高 ≈ 内容宽 17.4%、名次列 ≈ 13.7%（ARCH §5.5 的实测值）
		const r0 = jp?.rows[0];
		const hRatio = r0 ? r0.h / r0.w : 0;
		const bRatio = r0 ? r0.badgeW / r0.w : 0;
		record(
			"R-RANK-03",
			"行高比例符合参考图（≈17.4%，容差 14%~21%）",
			hRatio >= 0.14 && hRatio <= 0.21,
			`实测 ${(hRatio * 100).toFixed(1)}%（行高 ${r0?.h}px / 行宽 ${r0?.w}px）`,
		);
		record(
			"R-RANK-03",
			"名次列比例符合参考图（≈13.7%，容差 11%~17%）",
			bRatio >= 0.11 && bRatio <= 0.17,
			`实测 ${(bRatio * 100).toFixed(1)}%（名次列 ${r0?.badgeW}px）`,
		);

		// 两档配色：1~3 名与 4 名以后必须不同；4+ 是橙 #EFA662 + 深色字
		const top3 = jp?.rows.slice(0, 3) ?? [];
		const rest = jp?.rows.slice(3) ?? [];
		const restBg = (rest[0]?.badgeBg ?? "").replace(/\s/g, "");
		record(
			"R-RANK-03",
			"名次色分两档（1~3 名与 4 名以后不同）",
			top3.length === 3 && top3.every((r) => r.badgeBg === top3[0].badgeBg) && new Set(rest.map((r) => r.badgeBg)).size === 1 && top3[0]?.badgeBg !== rest[0]?.badgeBg,
			`1~3 名 ${top3[0]?.badgeBg} / 4+ 名 ${restBg}`,
		);
		record("R-RANK-03", "4 名以后的底色是橙 #EFA662", restBg === "rgb(239,166,98)", restBg);
		record("R-RANK-03", "4 名以后的数字是深色", (rest[0]?.badgeFg ?? "").replace(/\s/g, "") === "rgb(20,16,11)", rest[0]?.badgeFg);
		record("R-RANK-03", "1~3 名的数字是白色", (top3[0]?.badgeFg ?? "").replace(/\s/g, "") === "rgb(255,255,255)", top3[0]?.badgeFg);

		// 缺图降级：有图用 img、没图用渐变占位，两者相加 = 总行数（不出现裂图）
		const withImg = jp?.rows.filter((r) => r.hasImg).length ?? 0;
		const withPh = jp?.rows.filter((r) => r.placeholder).length ?? 0;
		record(
			"R-RANK-05",
			"配图与缺图占位互斥且覆盖全部条目",
			withImg + withPh === (jp?.rows.length ?? -1) && withImg >= 1 && withPh >= 1,
			`有图 ${withImg} 行 / 渐变占位 ${withPh} 行`,
		);

		record("R-RANK-06", "排行榜页在 390px 下无横向溢出", (facts["rank-jp-390"].overflowX ?? 99) <= 2, `溢出 ${facts["rank-jp-390"].overflowX}px`);

		// R-RANK-01 的"导航两个子项高亮正确"：桌面导航栏上游没有当前页态，
		// 真正带高亮的是移动端抽屉（按 pathname 标 data-active + 自动展开父级分组）
		const mobActive = facts["rank-jp-390"].mobileNavActive ?? [];
		const mobExpanded = facts["rank-jp-390"].mobileNavExpanded ?? [];
		record(
			"R-RANK-01",
			"移动端导航把「日漫排行」标成当前页",
			mobActive.includes("日漫排行"),
			`当前页项 ${JSON.stringify(mobActive)}`,
		);
		record(
			"R-RANK-01",
			"含当前页的「排行」分组自动展开",
			mobExpanded.some((t) => t.startsWith("排行")),
			`展开的分组 ${JSON.stringify(mobExpanded)}`,
		);

		// R-RANK-05：缺图行要"够暗"，白字标题才立得住 —— 亮色主题最危险
		// （占位底色若跟着卡片走，白字会糊在浅粉上；P2 亮色截图实测踩到过，已改成不透明深底）
		for (const [themeLabel, pageName] of [
			["暗色", "rank-jp-1440"],
			["亮色", "rank-jp-light-1440"],
		]) {
			const paint = facts[pageName]?.rank?.placeholderPaint;
			const base = parseCssColor(paint?.base ?? "");
			const stops = [...(paint?.image ?? "").matchAll(/rgba?\([^)]*\)/g)]
				.map((m) => parseCssColor(m[0]))
				.filter(Boolean);
			if (!base || !stops.length) {
				record("R-RANK-05", `${themeLabel}：缺图占位配色可解析`, false, `base=${paint?.base} stops=${stops.length}`);
				continue;
			}
			const flats = stops.map((s) => composite(s, base));
			const lightest = flats.reduce((a, b) => (relLuminance(a) > relLuminance(b) ? a : b));
			const ratio = contrast({ r: 255, g: 255, b: 255, a: 1 }, lightest);
			record(
				"R-RANK-05",
				`${themeLabel}主题：缺图占位最亮处对白字仍 ≥ 4.5:1`,
				ratio >= 4.5,
				`最坏 ${ratio.toFixed(2)}:1（底色 ${paint.base}，渐变 ${stops.length} 档）`,
			);
		}
		record("R-WDG-04", "首页在 390px 下无横向溢出", (facts["home-390"].overflowX ?? 99) <= 2, `溢出 ${facts["home-390"].overflowX}px`);
	}

	// sitemap 检查：读的是**磁盘产物**，所以只在静态产物下才有意义。
	// 原来读不到就 catch 记 pass=true——"什么都没验"却计入通过数，属于假绿；现在读不到直接判失败。
	if (isDevServer) {
		record("INFO(dev)", "sitemap 检查已跳过", true, "dev 服务器下磁盘 dist/ 可能是旧产物，改用 pnpm preview");
	} else {
		try {
			const sm = await fs.readFile(path.resolve("dist/sitemap-0.xml"), "utf8");
			const gone = FORBIDDEN_ROUTES.filter((r) => sm.includes(r));
			record("R-NAV-07", "sitemap 不含已关闭页面", gone.length === 0, gone.join(",") || "干净");
			const kept = ["/vndb/", "/myanimelist/", "/guestbook/", "/booknav/", "/rank/jp/", "/rank/cn/"].filter(
				(r) => sm.includes(r),
			);
			record("R-NAV-07", "sitemap 含保留页面（含两个排行页）", kept.length === 6, kept.join(","));
			// /rank/ 是 noindex 存根，不该出现在 sitemap 里。
			// 注意不能直接 sm.includes("/rank/")——"/rank/jp/" 也含这个子串，必须按 <loc> 整条匹配。
			const rankStubInSitemap = /<loc>[^<]*\/rank\/<\/loc>/.test(sm);
			record(
				"R-RANK-01",
				"sitemap 不含 /rank/ 跳转存根",
				!rankStubInSitemap,
				rankStubInSitemap ? "存根被写进 sitemap 了" : "干净",
			);
		} catch (err) {
			record(
				"R-NAV-07",
				"sitemap 检查",
				false,
				`读不到 dist/sitemap-0.xml（${err.code ?? err.message}）：先跑 pnpm build，再用 pnpm preview 起站点`,
			);
		}
	}

	child.kill();
	await fs.rm(profile, { recursive: true, force: true }).catch(() => {});

	// ── 报告 ──
	// INFO 项只是记录（例如"排行页在 P2 才建"、上游主题色本身的对比度），
	// 不参与通过/失败计数，免得"功能没做"被算成 ✅、也免得报告看起来比实际更绿。
	const functional = results.filter((r) => !r.id.startsWith("INFO"));
	const informational = results.filter((r) => r.id.startsWith("INFO"));
	const failed = functional.filter((r) => !r.pass);
	console.log("");
	for (const r of results) {
		console.log(`${r.pass ? "✅" : "❌"} [${r.id}] ${r.desc}${r.detail ? `\n      ${r.detail}` : ""}`);
	}
	console.log(
		`\n功能断言 ${functional.length} 项：通过 ${functional.length - failed.length}，失败 ${failed.length}` +
			`（另有 ${informational.length} 条信息记录不计入）`,
	);
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
