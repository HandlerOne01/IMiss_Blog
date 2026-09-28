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
// 横幅取景锚点：与 src/config/backgroundWallpaper.ts 的 banner.position 保持一致（R-BG-04）
const EXPECT_BANNER_POSITION = "50% 35%";
// 顶层导航顺序与子项顺序（prd.md R-NAV-01~04 / 第 2 章）
// ⚠️ v1.41（P2R）：第 3 格由「排行」下拉换成「学习路线」单链接（R-PATH-01）——
//    原来的 EXPECT_RANK_CHILDREN 常量与它的用法已随排行模块整体删除（Task 4 / R-PATH-06）。
const EXPECT_TOP_NAV = ["主页", "文章", "学习路线", "我的", "链接", "留言"];
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
// P4-8：上游示例文章（`posts/firefly.md`、`guide/*` 等 29 个文件）已按发起人要求删除，
// 所有"文章页"断言改用迁移进来的真实文章（否则断言会指向一个已经不存在的路由）
const SAMPLE_POST = "/posts/linux-net/http-xieyi/";
const EXPECT_HUE = "345";
const EXPECT_STAT_ROWS = 4;
const EXPECT_ABSENT_STAT_TEXT = ["运行时长", "最后活动", "天前"];
const FORBIDDEN_ROUTES = ["/friends/", "/bilibili/", "/bangumi/", "/sponsor/"];
// R-ID-06：订阅功能整体移除后，这 4 条路由**连存根都没有**（文件已删），应该是真 404
const REMOVED_FEED_ROUTES = ["/rss/", "/atom/", "/rss.xml", "/atom.xml"];
// R-PATH-01：v1.41 起 /roadmap/ 顶上导航第 3 格，必须进 ALLOWED_ROUTES 才能被"路由 200"那一趟扫到
// ⚠️ Task 4（P2R-6）已把三条 `/rank/*` 摘掉 —— 排行整条删除（R-PATH-06），它们不再是"保留页面"，
//    改由新断言钉住相反的事实：四个旧地址"返回 404 / 不在 sitemap / llms.txt 里也没有残渣"。
const ALLOWED_ROUTES = ["/", "/about/", "/guestbook/", "/vndb/", "/myanimelist/", "/booknav/", "/dynamic/", "/projects/", "/gallery/", "/archive/", "/roadmap/"];
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
    // href 只有"单链接"顶层项才有（带子菜单的顶层项是 <button data-dropdown-trigger>，没有 href）
    return { name: txt(head), href: head?.getAttribute?.("href") ?? null, children };
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
    //    （⚠️ 这一段的注释里不许出现反引号 —— 它在下面那个模板字符串里，T75 的同类。）
    // ⚠️ **横向溢出必须量 scrollWidth − clientWidth，不能用 scrollWidth − innerWidth**
    //    （v1.41 修复轮 2 从采集器根上改的）：在 mobile:true 的模拟下，内容一横向溢出，
    //    **window.innerWidth 会跟着内容一起涨**（真机实测 390 → 900 / 1200），两个数同向变大
    //    → 旧差法**恒为 0、结构上不可能红**（reports/_task5-overflow-consumers-probe.json、
    //    reports/_task5-overflow-probe2.json）。clientWidth 恒等于布局视口宽（390），不会膨胀。
    //    消费者：R-WDG-04（home-390）—— 排行那两条（rank-jp-390 / rank-game-390）随模块删除。
    // ⚠️ 这一段在 COLLECT 的模板字符串里：注释里不许出现反引号（T75，写这行时踩过一次）。
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
      return {
        src: pick.src,
        loaded: pick.loaded,
        objectPosition: cs?.objectPosition ?? null,
        objectFit: cs?.objectFit ?? null,
        dimExists: !!dim,
        dimOpacity: dimAlpha,
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
      return {
        count: visible.length,
        activeIndex: activeIdx,
        activeSrc: (activeImg?.currentSrc || activeImg?.src || "").split("/").pop() || "",
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
	for (const route of ["/", "/about/", "/guestbook/", SAMPLE_POST]) {
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
	for (const page of pages) {
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

		const shot = await cdp.send("Page.captureScreenshot", {
			format: "png",
			captureBeyondViewport: page.fullPage !== false,
		});
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

		// ② 键盘：← → running-left（宠物默认站在右侧，往右已经贴边、clamp 后走不动）
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
			// 两侧都放不下：390 宽把宠物拖到正中那一小段（宠物 124px + 菜单 132px > 390 − 2×8 − 2×10）
			facts["pet-menu-narrow-both"] = await menuProbe("390 正中(200,760)", 200, 760);
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

		// ⑧ 菜单动作：说句话（保留项）
		await clickMenu("say");
		await sleep(160);
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
			const realMouse = (type, x, y, button) =>
				cdp.send("Input.dispatchMouseEvent", {
					type,
					x: Math.round(x),
					y: Math.round(y),
					button,
					buttons: type === "mousePressed" ? (button === "right" ? 2 : 1) : 0,
					clickCount: 1,
				});
			const realClick = async (x, y, button) => {
				await realMouse("mouseMoved", x, y, "none");
				await realMouse("mousePressed", x, y, button);
				await realMouse("mouseReleased", x, y, button);
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

		// ⑨b R-PET-06 三档运动模式（发起人 2026-09-26 提的"悬浮/固定/下落"）
		// ------------------------------------------------------------------
		// 为什么要调试钩子：飞行间隔最小 20 秒，脚本不可能干等一分钟。
		// `__imissFlyNow()` 调的**就是**组件里决定"该不该飞"的那个 `startFlight()`
		// （与自动飞行同一函数，只有"跳过睡着判断"这一点不同），`__imissSetMode()`
		// 调的也就是 `boot()` 里那次 `setMode()` —— 测的是飞行/切模式函数本身，不是绕过行为。
		// 三档依次真跑一遍：默认 float 悬空 → fixed 一动不动 → ground 松手落地。
		{
			const petCfg = await fs.readFile(path.resolve("src/config/petConfig.ts"), "utf8");
			facts["pet-mode-config"] = {
				mode: /movement:\s*\{[\s\S]{0,240}?mode:\s*"(\w+)"/.exec(petCfg)?.[1] ?? null,
			};

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

			// 切回配置里的默认模式，让后续步骤（Swup/reduced-motion）回到出厂状态
			await cdp.send("Runtime.evaluate", { expression: `window.__imissSetMode("float")`, returnByValue: true });
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
		const reduced1 = await snap("pet-reduced-1");
		await sleep(900);
		await snap("pet-reduced-2");
		// 点击仍要有反应（气泡出来）
		await cdp.send("Runtime.evaluate", {
			expression: `document.querySelector('[data-pet-act="say"]').click(); "say"`,
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
	const top3 = home.navTops[2];
	record("R-NAV-02", "第 3 格「学习路线」是单链接、指向 /roadmap/", top3?.name === "学习路线" && top3?.href === "/roadmap/" && (top3?.children?.length ?? -1) === 0, JSON.stringify(top3));
	const my = home.navTops.find((t) => t.name === "我的");
	record("R-NAV-03", "我的子项顺序与链接", !!my && same(my.children, EXPECT_MY_CHILDREN), JSON.stringify(my?.children));
	record("R-NAV-01~04", "已删除的导航项不再出现", EXPECT_ABSENT_LABELS.every((l) => !home.allLabels.includes(l)), home.allLabels.filter((l) => EXPECT_ABSENT_LABELS.includes(l)).join(",") || "无残留");
	// 移动抽屉与桌面共用同一份 navBarConfig，所以顺序断言对两边都成立（「排行」不再出现在任何一层）
	record("R-NAV-01", "移动端菜单最后一项是「留言」且第 3 格是「学习路线」", mobileHome.mobileTops.at(-1)?.name === "留言" && mobileHome.mobileTops.some((t) => t.name === "学习路线"), JSON.stringify(mobileHome.mobileTops.map((t) => t.name)));
	record("R-ID-01", "站点名 IMiss Blog（标题 + 导航栏品牌）", home.title.includes("IMiss Blog") && (home.brand ?? "").includes("IMiss Blog"), `title=${home.title} brand=${home.brand}`);
	record("R-ID-02", "主题色相 = 345", home.hueComputed === EXPECT_HUE || home.hueInline === EXPECT_HUE, `inline=${home.hueInline} computed=${home.hueComputed}`);
	record("R-ID-04", "favicon 已换成 imiss", home.favicons.some((h) => (h ?? "").includes("imiss-32.png")), JSON.stringify(home.favicons));
	record("R-ID-04", "导航栏 Logo 已换成 imiss", (home.logoSrc ?? "").includes("imiss"), home.logoSrc ?? "（没取到 logo）");
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
		record("R-PATH-04", "篇目并集 == 站内全部 133 篇（命根子）",
			rm?.uniqueHrefs === 133,
			`去重后 ${rm?.uniqueHrefs} 篇（停靠点 ${rm?.stopCount} 个，差值是跨线复用）`);
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
		//    真实数据 `68 × 60 = 4080 >= 136 × 2 = 272` 余量充足；兜底值 `2 × 60 = 120 < 272` 立刻红。
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
		record(
			"R-PET-01",
			"移动端 390 不显示桌宠（hideOnMobile）",
			mobile?.off === true && mobile.hidden === true,
			`petOff=${mobile?.off} display=${mobile?.display}`,
		);

		// 九状态：这里挑"每条触发路径"各验一次（idle/running-right/failed/waiting/running/review/jumping/waving）
		record("R-PET-02", "出场打招呼（waving）", st("pet-boot") === "waving", `state=${st("pet-boot")}`);
		record("R-PET-02", "键盘 Enter → 跳一下（jumping）", st("pet-key-enter") === "jumping", `state=${st("pet-key-enter")}`);
		record(
			"R-PET-02",
			"键盘 ← → 左走（running-left）",
			st("pet-key-left") === "running-left",
			`state=${st("pet-key-left")}`,
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
			"右键菜单项齐全且**已删掉「跟过来」「睡一会儿」**（含「和爱弥斯聊天」）",
			same(facts["pet-menu"].pet.menu.items, ["说句话", "落下去", "飘起来", "和爱弥斯聊天"]) &&
				same(facts["pet-menu"].pet.menu.itemsVisible, ["说句话", "落下去", "和爱弥斯聊天"]) &&
				facts["pet-menu"].pet.menu.hidden === false,
			`DOM 全部项=${JSON.stringify(facts["pet-menu"].pet.menu.items)}（悬浮档实显=${JSON.stringify(facts["pet-menu"].pet.menu.itemsVisible)}）`,
		);
		record(
			"R-PET-02",
			"「说句话」会弹出台词气泡",
			(st("pet-act-say") !== null && (facts["pet-act-say"].pet.bubble.text || "").length > 4) === true,
			`气泡="${facts["pet-act-say"].pet.bubble.text}"`,
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

	// ── R-PET-06 三档运动模式（float 悬浮+飞行 / fixed 固定 / ground 贴地）──
	{
		const floatBefore = facts["pet-float-before"].pet;
		const flight = facts["pet-float-flight"];
		const boot = facts["pet-boot"].pet;
		const floatDrop = facts["pet-float-drop"];
		const fixedStill = facts["pet-fixed-still"];
		const fixedDrop = facts["pet-fixed-drop"];
		const ground = facts["pet-ground"];
		const reduced1 = facts["pet-reduced-1"].pet;
		const reduced2 = facts["pet-reduced-2"].pet;

		// ① 默认模式 = float（配置里写的就是它，运行时 DOM 也要是它）
		record(
			"R-PET-06",
			'默认运动模式是 "float"（配置与运行时 DOM 一致）',
			facts["pet-mode-config"].mode === "float" && boot?.mode === "float",
			`petConfig.movement.mode=${facts["pet-mode-config"].mode}，运行时 data-pet-mode=${boot?.mode}`,
		);

		// ② 悬浮 = 不贴地：底部距视口底明显大于地面模式
		record(
			"R-PET-06",
			"float 悬在半空（底部距视口底 > 120px，且比 ground 高 100px 以上）",
			(boot?.bottomGap ?? 0) > 120 && (boot?.bottomGap ?? 0) - (ground?.landedGap ?? 0) > 100,
			`float 出场 bottomGap=${boot?.bottomGap}px（rect.y=${boot?.rect?.y}）vs ground 落地 bottomGap=${ground?.landedGap}px`,
		);

		// ③ 悬浮会"真的移动"：起飞 → 飞行中带 data-pet-flying → 落位后坐标确实变了
		{
			const moved =
				Math.abs(flight.after.x - flight.before.x) + Math.abs(flight.after.y - flight.before.y);
			record(
				"R-PET-06",
				"float 会真的飞：起飞中被标记 flying，落位后坐标发生变化",
				flight.accepted === true &&
					flight.mid.flying === true &&
					flight.before.flying !== true &&
					moved >= 40,
				`起飞前 (${flight.before.x},${flight.before.y}) → 飞行中 (${flight.mid.x},${flight.mid.y}) flying=${flight.mid.flying} → 落位 (${flight.after.x},${flight.after.y})，位移 ${moved}px`,
			);
		}

		// ④ 飞行不出视口（左/上不越界，右/下不越界）
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

		// ⑤ float：拖动松手不掉落（悬停锚在松手处，只在 ±幅度 内浮动）
		record(
			"R-PET-06",
			"float 拖动松手后不掉落（仍在半空悬停）",
			Math.abs(floatDrop.y2 - floatDrop.y1) <= 14 &&
				floatDrop.bottom1 > 120 &&
				floatDrop.bottom2 > 120,
			`松手后 y=${floatDrop.y1} → 1.2s 后 y=${floatDrop.y2}（离地 ${floatDrop.bottom1}→${floatDrop.bottom2}px，均远高于地面）`,
		);

		// ⑥ fixed：长时间不动（两次采样坐标完全一致）
		record(
			"R-PET-06",
			"fixed 长时间不动（1.6 秒两次采样坐标完全相同）",
			fixedStill.x1 === fixedStill.x2 && fixedStill.y1 === fixedStill.y2,
			`(${fixedStill.x1},${fixedStill.y1}) → 1.6s 后 (${fixedStill.x2},${fixedStill.y2})`,
		);

		// ⑦ fixed：拖动松手不落地（不施加重力）
		record(
			"R-PET-06",
			"fixed 拖动松手后停在原地、不下落",
			fixedDrop.mode === "fixed" && fixedDrop.y1 === fixedDrop.y2 && fixedDrop.bottomGap > 120,
			`松手后 y=${fixedDrop.y1} → 1.4s 后 y=${fixedDrop.y2}，离地仍有 ${fixedDrop.bottomGap}px（模式=${fixedDrop.mode}）`,
		);

		// ⑧ ground：切换即落回地面；拖动松手受重力落地（与 P3 旧行为一致）
		record(
			"R-PET-06",
			"ground 切换与拖动松手都回到地面高度（与旧断言一致）",
			ground.mode === "ground" &&
				ground.modeSwitchGap <= 20 &&
				ground.airGap > 120 &&
				ground.landedGap <= 20,
			`切模式后 bottomGap=${ground.modeSwitchGap}px；拖动松手瞬间 y=${ground.airY}（离地 ${ground.airGap}px）→ 1.4s 后 y=${ground.landedY}（离地 ${ground.landedGap}px）`,
		);

		// ⑨ 三档都不与右下角浮动按钮重叠（displayNodes > 0 保证不是"没按钮可压"的空过）
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

		// ⑩ reduced-motion：float 退化为"静态悬浮"——不浮动、不飞行（两帧 transform 完全相同）
		record(
			"R-PET-06",
			"reduced-motion 下 float 只保留静态悬浮（两帧 transform 相同、不在飞）",
			reduced1.mode === "float" &&
				reduced1.transform === reduced2.transform &&
				reduced1.rect.y === reduced2.rect.y &&
				reduced1.flying === false &&
				reduced2.flying === false &&
				reduced1.bottomGap > 120,
			`mode=${reduced1.mode} transform ${reduced1.transform} → ${reduced2.transform}（900ms 后），y ${reduced1.rect.y} → ${reduced2.rect.y}，离地 ${reduced1.bottomGap}px`,
		);

		// ⑪ 位置记忆仍生效：拖过的位置写进 localStorage（新格式 {x,y,mode}），
		//    刷新后 x 被恢复；而**模式仍以配置为准**（记忆里存的是 ground，重载后仍是配置的 float）
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
			record(
				"R-PET-06",
				"位置记忆仍生效（存 {x,y,mode}、刷新后恢复 x，模式仍以配置为准）",
				afterGround !== null &&
					typeof afterGround.x === "number" &&
					afterGround.mode === "ground" &&
					afterReload !== null &&
					Math.abs(reduced1.rect.x - afterReload.x) <= 2 &&
					reduced1.mode === "float",
				`ground 拖动后存档=${facts["pet-ground-landed"].pet.saved}；重载后 x=${reduced1.rect.x}（存档 x=${afterReload?.x}）、mode=${reduced1.mode}（来自配置，不是存档里的 ${afterReload?.mode}）`,
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
			same(drop?.openItems, ["说句话", "落下去", "和爱弥斯聊天"]) &&
				same(drop?.before?.itemsVisible, ["说句话", "落下去", "和爱弥斯聊天"]) &&
				same(rise?.openItems, ["说句话", "飘起来", "和爱弥斯聊天"]) &&
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
			"两侧都放不下时取空间更大的一侧（390 正中·几何上无解，但四边仍在视口内、菜单仍可见）",
			(narrowBoth?.menu?.side === "left" || narrowBoth?.menu?.side === "right") &&
				narrowBoth?.inside === true &&
				narrowBoth?.hitIsMenu === true &&
				narrowBoth?.roomRight < narrowBoth?.menu?.w &&
				narrowBoth?.roomLeft < narrowBoth?.menu?.w &&
				narrowBoth?.expectSide === narrowBoth?.menu?.side,
			`390 正中（宠物 [${narrowBoth?.pet?.l},${narrowBoth?.pet?.r}]）：右余 ${narrowBoth?.roomRight}px / 左余 ${narrowBoth?.roomLeft}px（菜单宽 ${narrowBoth?.menu?.w}）→ 贴${narrowBoth?.menu?.side}（期望${narrowBoth?.expectSide}），菜单 [${narrowBoth?.menu?.l},${narrowBoth?.menu?.r}]，与宠物重叠 ${narrowBoth?.overlapArea}px²`,
		);
		record(
			"R-PET-08",
			"菜单项字面与发起人反馈一致：已删「跟过来」「睡一会儿」，新增「落下去」「飘起来」",
			same(facts["pet-menu"]?.pet?.menu?.items, ["说句话", "落下去", "飘起来", "和爱弥斯聊天"]),
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
				same(j.mid1.allItems, ["说句话", "落下去", "飘起来", "和爱弥斯聊天"]) &&
				same(j?.mid1?.items, ["说句话", "落下去", "和爱弥斯聊天"]),
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

	// ── P3 壁纸（R-BG-01 / R-BG-04）──
	{
		const wp = facts["home-1440"].wallpaper;
		record(
			"R-BG-01",
			"首页壁纸换成发起人给的 4 张图（不是上游示例）",
			(wp?.src ?? "").includes("imiss-"),
			`当前壁纸=${(wp?.src ?? "").split("/").pop() || "（取不到）"}`,
		);
		record(
			"R-BG-01",
			"壁纸确实加载成功（naturalWidth > 0）",
			(wp?.loaded ?? 0) > 0,
			`naturalWidth=${wp?.loaded}`,
		);
		record(
			"R-BG-04",
			`取景锚点与配置一致（${EXPECT_BANNER_POSITION}）`,
			(wp?.objectPosition ?? "").replace(/\s+/g, " ") === EXPECT_BANNER_POSITION,
			`object-position=${wp?.objectPosition}`,
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
			const llms = await fs.readFile(path.resolve("dist/llms.txt"), "utf8");
			const llmsHasRoadmap = llms.includes("/roadmap/");
			const llmsHasRank = llms.includes("/rank/");
			record(
				"R-PATH-06",
				"llms.txt 登记了 /roadmap/ 且不含任何 /rank/ 残渣",
				llmsHasRoadmap && !llmsHasRank,
				`含 /roadmap/=${llmsHasRoadmap} ｜ 含 /rank/=${llmsHasRank}（共 ${llms.length} 字符）`,
			);
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
			"R-CNT-01",
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

		// 列表页收录（R-CNT-01/02）
		try {
			const arch = await (await fetch(`${BASE}/archive/`)).text();
			const want = ["HTTP 协议", "差分", "My_server框架全流程梳理"];
			const missing = want.filter((t) => !arch.includes(t));
			record(
				"R-CNT-01",
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
			record("R-CNT-01", "/archive/ 与 /categories/ 收录检查", false, err.message);
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
		{
			const probe = await (async () => {
				try {
					const r = await fetch(`${LIVE}/ok`, { signal: AbortSignal.timeout(1500) });
					return r.ok && (await r.json())?.ok === true;
				} catch {
					return false;
				}
			})();
			if (!probe) {
				// 环境未就绪 ≠ 回归（与 `verify:agent` 的退出码规矩一致：Agent 没起不该让 CI 变红）
				record(
					"R-AGT-08",
					"Agent 在跑时：桌宠真机往返一次（跳过：服务没起）",
					true,
					`${LIVE}/ok 不可达 → 本组真往返断言跳过。启动：cd ..\\agent_-for_-blog; langgraph dev`,
					true,
				);
				record(
					"R-AGT-08",
					"interrupt → 约定词续跑（跳过：服务没起）",
					true,
					"同上",
					true,
				);
			} else {
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
					"enable:true —— 真机路径真的发起了往返（计数 > 0）并拿到人设化答复",
					before === 0 &&
						after > 0 &&
						isRealReply(live?.reply, "在吗") &&
						notMock,
					`打到 ${LIVE} 的请求数 ${before} → ${after}（>0 说明真发了）；气泡原文「${(live?.reply ?? "").replace(/\n/g, "⏎")}」（${live?.ms}ms，${live?.reply?.length ?? 0} 字，不是本地 mock=${notMock}）；data-pet-state 序列 ${JSON.stringify(live?.stateSeq)}`,
				);
				record(
					"R-AGT-08",
					"答复符合人设口径：无完整域名 / 无表格 / 无加粗 / 无「您」",
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
						"interrupt 真机走通：后端反问进气泡 → 用组件给出的约定词续跑 → 拿到答复（收口 或 先答复再反问，两种都合规）",
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
						idRounds.push({
							q: one,
							said,
							ms: r?.ms ?? null,
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
						});
					}
					const idShot = await cdp.send("Page.captureScreenshot", { format: "png" });
					await fs.writeFile(
						path.join(OUT_DIR, "pet-agent-identity-1440.png"),
						Buffer.from(idShot.data, "base64"),
					);
					const idHits = idRounds.map((r) => ID_BAN.filter((w) => r.said.includes(w)));
					const idNamed = idRounds.filter((r) => r.said.includes("爱弥斯"));
					const idOverLine = idRounds.filter((r) =>
						/我是真人|我就是真人|我当然是活人|官方那个就是我|我就是官方/.test(r.said),
					);
					facts["agt-identity"] = {
						questions: ID_QS,
						banWords: ID_BAN,
						rounds: idRounds,
						hits: idHits,
						historyLinesBefore: idPre.lines,
					};
					record(
						"R-AGT-09",
						"身份类逼问（同一会话连问 5 条）：自称词 0 命中，且每条都明确「我是爱弥斯」（发起人 2026-09-27 决定）",
						// 起手历史必须是空的：否则读到的可能是残留答复（"测试写错"，必须 FAIL 出声）
						idPre.lines === 0 &&
							idRounds.every((r) => r.answered) &&
							idHits.every((h) => h.length === 0) &&
							idNamed.length === ID_QS.length &&
							idOverLine.length === 0,
						`起手历史 ${idPre.lines} 条（要求 0 —— 不为 0 说明读到的可能是残留答复）；禁词表 [${ID_BAN.join(" / ")}] 命中总数 ${idHits.reduce((n, h) => n + h.length, 0)}；明确自称爱弥斯 ${idNamed.length}/${ID_QS.length} 条；越过底线（自称真人 / 冒充官方）${idOverLine.length} 条；逐字原文见下一行 INFO`,
					);
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
					const agentSrcFb = await fs.readFile(path.join("src", "utils", "agent-client.ts"), "utf8");
					const leadsBlock =
						agentSrcFb.match(/export const FALLBACK_LEADS(?::[^=]+)?=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
					const LEADS = [...leadsBlock.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
					await arm({ enable: true, baseUrl: DEAD, timeoutMs: 3000 });
					const f1 = await askPet("在吗", { timeout: 30000, waitFor: "round" });
					const f2 = await askPet("随便聊聊", { timeout: 30000, waitFor: "round" });
					const t1 = (f1?.reply ?? "").trim();
					const t2 = (f2?.reply ?? "").trim();
					// "真答复"的样本：本次真机拿到的那句 + 人设 v7 的示范句（结构上必须与降级句不同形）
					const REAL_SHAPES = [
						(facts["agt-live"]?.reply ?? "").trim(),
						(facts["agt-identity"]?.rounds ?? []).map((r) => r.said.trim()).join("\n"),
					]
						.filter(Boolean)
						.join("\n");
					const looksMocky = (t) => LEADS.some((l) => l && t.startsWith(l));
					const shotF = await cdp.send("Page.captureScreenshot", { format: "png" });
					await fs.writeFile(
						path.join(OUT_DIR, "pet-agent-fallback-1440.png"),
						Buffer.from(shotF.data, "base64"),
					);
					facts["agt-fallback"] = { leads: LEADS, first: t1, second: t2, source1: f1?.source, source2: f2?.source };
					record(
						"R-AGT-11",
						"降级（后端不可达）必须**一眼可分辨**：面板带 source=fallback + 台词走「接不上话」起头池 + 连续两次不重样 + 不与真答复同形",
						LEADS.length >= 2 &&
							looksMocky(t1) &&
							looksMocky(t2) &&
							f1?.source === "fallback" &&
							f2?.source === "fallback" &&
							t1 !== t2 &&
							!REAL_SHAPES.includes(t1) &&
							!REAL_SHAPES.includes(t2),
						`data-pet-chat-source：第 1 次=${JSON.stringify(f1?.source)}、第 2 次=${JSON.stringify(f2?.source)}（期望都是 fallback）；起头池 ${LEADS.length} 条（源码里的 FALLBACK_LEADS）；第 1 次气泡「${t1.replace(/\n/g, "⏎")}」、第 2 次气泡「${t2.replace(/\n/g, "⏎")}」——两次不同=${t1 !== t2}；与真答复（本次真机那句 + 身份类 5 条）同形=${REAL_SHAPES.includes(t1) || REAL_SHAPES.includes(t2)}；截图 reports/screenshots/pet-agent-fallback-1440.png`,
					);
				}
			}
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
				await cdp.send("Emulation.setDeviceMetricsOverride", { width: 620, height: 700, deviceScaleFactor: 1, mobile: false });
				await sleep(600);
				// 把宠物拖到**正中**：620 宽下两侧各剩 ~230px < 配置的 minWidth(236) → 只能上下摆
				await cdp.send("Runtime.evaluate", {
					expression: `(() => {
						const el = document.getElementById("pet-body");
						const r = el.getBoundingClientRect();
						const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
						const tx = 310, ty = ${Math.round(700 * 0.5)};
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
				await fs.writeFile(path.join(OUT_DIR, "pet-chat-narrow-fallback-620.png"), Buffer.from(shot.data, "base64"));
				const sideRoom = { left: (narrow?.pet?.l ?? 0) - 18, right: (narrow?.viewport?.w ?? 0) - 8 - ((narrow?.pet?.r ?? 0) + 10) };
				record(
					"R-PET-11",
					"窄屏（620×700、宠物居中）两侧都低于 minWidth → 明确兜底到宠物**上方/下方**，四边仍在视口内、不压宠物",
					["above", "below"].includes(narrow?.side) &&
						narrow?.insideViewport === true &&
						narrow?.panel?.w >= 300 &&
						narrow?.panel?.h >= 200 &&
						narrow?.petOverlap === false,
					`620×700 下宠物在 (${narrow?.pet?.l},${narrow?.pet?.t})：左侧可用 ~${sideRoom.left}px、右侧可用 ~${sideRoom.right}px（都 < 配置 minWidth ${cfgNum("minWidth")}）→ 实际 side=**${narrow?.side}**；面板 ${narrow?.panel?.w}×${narrow?.panel?.h} 在 (${narrow?.panel?.l},${narrow?.panel?.t})-(${narrow?.panel?.r},${narrow?.panel?.b})，四边在视口内=${narrow?.insideViewport}、与宠物重叠=${narrow?.petOverlap}（高度按"宠物上方/下方剩多少"压过，所以没盖住宠物）；截图 reports/screenshots/pet-chat-narrow-fallback-620.png`,
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
	// ⚠️ `skipped` 的项**不算失败**（Task 3 修正）：SKIP 的记账约定是"传 pass=false + skipped=true"，
	//    旧实现只滤 `!r.pass`，于是每一条 SKIP 都同时被算进"失败"——汇总行会出现
	//    "跳过 4、失败 3"自相矛盾、退出码也跟著变 1（实测踩到）。`probeResults` 的同类统计
	//    早就写了 `!r.skipped && !r.pass`，这里补齐成一致。原本没有 SKIP 的轮次结果不变。
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
