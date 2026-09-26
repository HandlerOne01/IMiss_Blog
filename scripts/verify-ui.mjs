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
const EXPECT_TOP_NAV = ["主页", "文章", "排行", "我的", "链接", "留言"];
const EXPECT_RANK_CHILDREN = [
	{ name: "日漫排行", href: "/rank/jp/" },
	{ name: "国漫排行", href: "/rank/cn/" },
	{ name: "二游排行", href: "/rank/game/" },
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
// P4-8：上游示例文章（`posts/firefly.md`、`guide/*` 等 29 个文件）已按发起人要求删除，
// 所有"文章页"断言改用迁移进来的真实文章（否则断言会指向一个已经不存在的路由）
const SAMPLE_POST = "/posts/linux-net/http-xieyi/";
const EXPECT_HUE = "345";
const EXPECT_STAT_ROWS = 4;
const EXPECT_ABSENT_STAT_TEXT = ["运行时长", "最后活动", "天前"];
const FORBIDDEN_ROUTES = ["/friends/", "/bilibili/", "/bangumi/", "/sponsor/"];
// R-ID-06：订阅功能整体移除后，这 4 条路由**连存根都没有**（文件已删），应该是真 404
const REMOVED_FEED_ROUTES = ["/rss/", "/atom/", "/rss.xml", "/atom.xml"];
const ALLOWED_ROUTES = ["/", "/about/", "/guestbook/", "/vndb/", "/myanimelist/", "/booknav/", "/dynamic/", "/projects/", "/gallery/", "/archive/", "/rank/jp/", "/rank/cn/", "/rank/game/"];
// P2 之前：/rank/jp/、/rank/cn/ 还不存在，这里是"待建路由"的登记处。
// P2 建好后两条路由已进 ALLOWED_ROUTES（断言 200），登记处随之清空——
// 留着这个常量是为了下个阶段再出现"说好要建但还没建"的路由时有地方记，别再退回"catch 住就算过"的假绿写法。
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
      const rows = [...board.querySelectorAll("[data-rank-panel]:not(.rank-panel--off) .rank-row")];
      return {
        kind: board.dataset.rankKind,
        // R-RANK-07：单一榜（二游排行）标记 —— 没有全剧/单集维度
        single: board.dataset.rankSingle === "true",
        // R-RANK-02：切换维度后 URL 要同步（读 location.search 判断 pushState 是否执行）
        search: window.location.search,
        title: (board.querySelector("h2") || {}).textContent || null,
        hint: !!board.querySelector(".rank-hint"),
        // 面板显隐用 rank-panel--off 这个 class（不是 hidden 属性，原因见 rank.css 与组件注释）
        panels: [...board.querySelectorAll("[data-rank-panel]")].map((p) => ({
          kind: p.dataset.rankPanel,
          off: p.classList.contains("rank-panel--off"),
          display: getComputedStyle(p).display,
          ariaHidden: p.getAttribute("aria-hidden"),
          inert: p.inert === true,
        })),
        tabs: [...board.querySelectorAll("[data-rank-tab]")].map((t) => ({
          kind: t.dataset.rankTab,
          selected: t.getAttribute("aria-selected"),
          tabIndex: t.tabIndex,
        })),
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
            // R-RANK-03：短评胶囊与标题框不能重叠（绝对定位时代实测压了 60px）
            overlap: (() => {
              const note = r.querySelector(".rank-note");
              const textEl = r.querySelector(".rank-text");
              if (!note || !textEl) return null;
              return Math.round(textEl.getBoundingClientRect().right - note.getBoundingClientRect().left);
            })(),
            // 胶囊自己不能被压扁/截断（百分比 max-width 曾把它压成一个小圆点）
            noteWidth: (() => {
              const note = r.querySelector(".rank-note");
              if (!note) return null;
              return { w: Math.round(note.getBoundingClientRect().width), clipped: note.scrollWidth > note.clientWidth + 2 };
            })(),
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
    // R-RANK-01 / SEO：静态产物下 canonical 不该带查询串（两个维度共用一张榜单页）
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null,
    rowsText: (document.querySelector(".rank-rows") || {}).innerText || "",
    // R-RANK-01：导航"当前页高亮"。桌面导航栏上游本来就没有当前页态，
    // 有高亮的是移动端抽屉：NavMenuPanel 的 markActiveNav() 按 pathname 标 data-active
    // 并把所在分组自动展开。收藏这几项就能验"排行子项高亮正确"。
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
		// P2 排行榜
		{ name: "rank-jp-1440", path: "/rank/jp/", width: 1440, height: 1000, mobile: false },
		{ name: "rank-cn-1440", path: "/rank/cn/", width: 1440, height: 1000, mobile: false },
		{ name: "rank-jp-390", path: "/rank/jp/", width: 390, height: 844, mobile: true },
		{ name: "rank-jp-ep-1440", path: "/rank/jp/?kind=ep", width: 1440, height: 1000, mobile: false },
		// 宽屏再量一次比例（"行高 = 内容宽 17.4%"用 cqw 实现，越宽的屏越能暴露用 vw 的写法）
		{ name: "rank-jp-1920", path: "/rank/jp/", width: 1920, height: 1080, mobile: false },
		// R-RANK-07 二游排行：单一榜（没有全剧/单集）
		{ name: "rank-game-1440", path: "/rank/game/", width: 1440, height: 1000, mobile: false },
		{ name: "rank-game-390", path: "/rank/game/", width: 390, height: 844, mobile: true },
		// P3 桌宠：必须用"只有视口、不整页"的截图，否则 position:fixed 的宠物会按初始位置被画到长图里
		{ name: "pet-1440", path: "/", width: 1440, height: 900, mobile: false, fullPage: false },
		{ name: "pet-390", path: "/", width: 390, height: 844, mobile: true, fullPage: false },
		// 亮色主题下的榜单（缺图占位是半透明色罩在卡片底上，亮色下白字最容易糊 → 单独留一张图）
		{ name: "rank-jp-light-1440", path: "/rank/jp/", width: 1440, height: 1000, mobile: false, light: true },
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

		// P4：文章页要等正文图片 decode 完再判"到底加载出来没有"
		if (page.post) {
			const postRes = await cdp.send("Runtime.evaluate", {
				expression: COLLECT_POST,
				returnByValue: true,
				awaitPromise: true,
			});
			facts[`${page.name}-post`] = postRes.result.value;
		}

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

	// ── R-RANK-02：键盘路径（WAI-ARIA tabs 的 ←/→ 切换）──
	// 上面只验了"点一下"和"后退"，键盘可达是 prd.md §6.2 的硬要求，所以真发一次方向键。
	// 注意必须走 Input.dispatchKeyEvent：Runtime.evaluate 里 dispatchEvent 造的合成事件
	// 与真实按键的差别（isTrusted、默认行为）会让这条断言变得没意义。
	{
		await cdp.send("Runtime.evaluate", {
			expression: `document.querySelector('[data-rank-tab="all"]').focus(); "focused"`,
			returnByValue: true,
		});
		for (const type of ["rawKeyDown", "keyUp"]) {
			await cdp.send("Input.dispatchKeyEvent", {
				type,
				key: "ArrowRight",
				code: "ArrowRight",
				windowsVirtualKeyCode: 39,
				nativeVirtualKeyCode: 39,
			});
		}
		await sleep(300);
		const { result: afterKey } = await cdp.send("Runtime.evaluate", {
			expression: `(() => {
				const r = ${COLLECT};
				r.focusedTab = (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.rankTab) || null;
				return r;
			})()`,
			returnByValue: true,
		});
		facts["rank-jp-after-key"] = afterKey.value;
	}

	// ── R-RANK-02 回归：**经 Swup 切页进入排行页**后再切换维度 ──
	// 为什么单列一段：上面那几段都是 Page.navigate 直开，而 D1 缺陷只在 Swup 路径上出现
	// ——@swup/scripts-plugin 会重跑容器内联脚本，initAll() 被调用两次（脚本一次 + astro:page-load 一次），
	// 同一个按钮被绑两个 click → 点一下 pushState 两次 → 按一次后退回不到上一个榜单。
	// 直开路径永远是绿的，所以必须专门造一次"点导航链接进来"的场景。
	{
		const loaded = cdp.once("Page.loadEventFired");
		await cdp.send("Page.navigate", { url: `${BASE}/` });
		await loaded;
		await sleep(700);
		// 点桌面导航里的「日漫排行」链接，让 Swup 接管这次跳转
		const { result: clickedNav } = await cdp.send("Runtime.evaluate", {
			expression: `(() => {
				const a = document.querySelector('a[href="/rank/jp/"]');
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
		facts["rank-via-swup"] = { nav: clickedNav.value, ...afterSwup.value };

		// 进入后只点一次「单集」
		await cdp.send("Runtime.evaluate", {
			expression: `document.querySelector('[data-rank-tab="ep"]').click(); "clicked"`,
			returnByValue: true,
		});
		await sleep(350);
		const { result: swupClick } = await cdp.send("Runtime.evaluate", {
			expression: COLLECT,
			returnByValue: true,
		});
		facts["rank-via-swup-click"] = swupClick.value;

		// 一次后退就应该回到「全剧」——若监听被绑了两遍，这里会仍停在 ep
		await cdp.send("Runtime.evaluate", { expression: `history.back(); "back"`, returnByValue: true });
		await sleep(700);
		const { result: swupBack } = await cdp.send("Runtime.evaluate", {
			expression: COLLECT,
			returnByValue: true,
		});
		facts["rank-via-swup-back"] = swupBack.value;
	}

	// ── R-RANK-02 兜底：打印时两块榜单都要在纸上 ──
	{
		await cdp.send("Emulation.setEmulatedMedia", {
			media: "print",
			features: [{ name: "prefers-color-scheme", value: "dark" }],
		});
		await sleep(150);
		const { result: inPrint } = await cdp.send("Runtime.evaluate", {
			expression: `(() => {
				const panels = [...document.querySelectorAll("[data-rank-panel]")];
				return {
					displays: panels.map((p) => ({ kind: p.dataset.rankPanel, off: p.classList.contains("rank-panel--off"), display: getComputedStyle(p).display })),
					tabsDisplay: getComputedStyle(document.querySelector(".rank-tabs")).display,
					rowOpacity: getComputedStyle(document.querySelector(".rank-row")).opacity,
				};
			})()`,
			returnByValue: true,
		});
		facts["rank-print"] = inPrint.value;
		await cdp.send("Emulation.setEmulatedMedia", {
			media: "",
			features: [{ name: "prefers-color-scheme", value: "dark" }],
		});
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
				jp?.panels.find((p) => p.kind === "all")?.off === false &&
				jp?.panels.find((p) => p.kind === "ep")?.off === true,
			JSON.stringify(jp?.panels),
		);
		record(
			"R-RANK-02",
			"点「单集」后面板切换且 URL 同步",
			clicked?.kind === "ep" &&
				clicked?.panels.find((p) => p.kind === "ep")?.off === false &&
				clicked?.panels.find((p) => p.kind === "all")?.off === true &&
				(clicked?.search ?? "").includes("kind=ep"),
			`kind=${clicked?.kind} search=${clicked?.search}`,
		);
		record("R-RANK-02", "浏览器后退能回到上一个维度", back?.kind === "all", `后退后 kind=${back?.kind}`);

		// D1 回归：经 Swup 切页进来时，按钮监听不能被绑两遍（否则一次点击 = 两次 pushState）
		const swupPage = facts["rank-via-swup"];
		const swupClicked = facts["rank-via-swup-click"]?.rank;
		const swupBack = facts["rank-via-swup-back"]?.rank;
		record(
			"R-RANK-02",
			"经 Swup 点导航进排行页能正常渲染",
			swupPage?.rank?.kind === "all" && (swupPage?.rank?.rows?.length ?? 0) === 10,
			`导航点击=${swupPage?.nav} kind=${swupPage?.rank?.kind} 行数=${swupPage?.rank?.rows?.length}`,
		);
		record(
			"R-RANK-02",
			"Swup 路径：点一次「单集」URL 只前进一档",
			swupClicked?.kind === "ep" && (swupClicked?.search ?? "").includes("kind=ep"),
			`kind=${swupClicked?.kind} search=${swupClicked?.search}`,
		);
		record(
			"R-RANK-02",
			"Swup 路径：按一次后退就回到「全剧」",
			swupBack?.kind === "all",
			`后退后 kind=${swupBack?.kind}${swupBack?.kind === "ep" ? "（监听被绑了两遍的典型症状）" : ""}`,
		);

		// D2：打印时两块榜单都要出现（没点过的「单集」榜不能因为没点过就印不出来）
		const print = facts["rank-print"];
		record(
			"R-RANK-02",
			"打印时两块榜单都摊开且维度按钮不印",
			print?.displays?.length === 2 &&
				print.displays.every((d) => d.display !== "none") &&
				print.tabsDisplay === "none" &&
				print.rowOpacity === "1",
			`${JSON.stringify(print?.displays)} tabs=${print?.tabsDisplay} 行不透明度=${print?.rowOpacity}`,
		);

		const afterKey = facts["rank-jp-after-key"];
		record(
			"R-RANK-02",
			"键盘 → 键能切到单集并把焦点带过去",
			afterKey?.rank?.kind === "ep" && afterKey?.focusedTab === "ep",
			`kind=${afterKey?.rank?.kind} 焦点在 ${afterKey?.focusedTab}`,
		);
		record("R-RANK-02", "带 ?kind=ep 的链接直接打开单集榜", ep?.kind === "ep" && ep?.panels.find((p) => p.kind === "ep")?.off === false, `kind=${ep?.kind}`);
		// tab 语义 + roving tabindex：选中的那个 aria-selected=true 且 tabIndex=0，
		// 其余 false 且 -1（只断言"是 true 或 false"几乎恒真，属于弱断言，这里连 tabindex 一起验）
		{
			const tabs = jp?.tabs ?? [];
			const sel = tabs.find((t) => t.kind === "all");
			const off = tabs.find((t) => t.kind === "ep");
			record(
				"R-RANK-02",
				"维度按钮的 tab 语义与 roving tabindex 正确",
				tabs.length === 2 && sel?.selected === "true" && sel?.tabIndex === 0 && off?.selected === "false" && off?.tabIndex === -1,
				JSON.stringify(tabs),
			);
		}

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

		// D4：名次数字是 40px+ 粗体（算 large text，WCAG AA 阈值 3:1）。
		// 参考图的粉 #EA7B7C 只有 2.76:1，已加深一档到 #E2696B（3.25:1）——这里用算出来的真值兜住。
		{
			const tBg = parseCssColor(top3[0]?.badgeBg ?? "");
			const tFg = parseCssColor(top3[0]?.badgeFg ?? "");
			const rBg = parseCssColor(rest[0]?.badgeBg ?? "");
			const rFg = parseCssColor(rest[0]?.badgeFg ?? "");
			const topRatio = tBg && tFg ? contrast(tFg, tBg) : 0;
			const restRatio = rBg && rFg ? contrast(rFg, rBg) : 0;
			record(
				"R-RANK-03",
				"1~3 名白字对粉底 ≥ 3:1（WCAG AA 大字）",
				topRatio >= 3,
				`实测 ${topRatio.toFixed(2)}:1（${top3[0]?.badgeFg} on ${top3[0]?.badgeBg}）`,
			);
			record(
				"R-RANK-03",
				"4 名以后深色字对橙底 ≥ 4.5:1",
				restRatio >= 4.5,
				`实测 ${restRatio.toFixed(2)}:1（${rest[0]?.badgeFg} on ${rest[0]?.badgeBg}）`,
			);
		}

		// R-RANK-03：页面不出现任何百分比 / 升降箭头（参考图右侧那三列明确不做）
		{
			// 注意 rowsText 是**整页事实**（COLLECT 的顶层字段），不在 rank 子对象里
			const rowsText = facts["rank-jp-1440"].rowsText ?? "";
			const forbidden = ["%", "↑", "↓", "▲", "▼", "△", "▽", "得票", "涨幅", "升降"];
			const hit = forbidden.filter((f) => rowsText.includes(f));
			record(
				"R-RANK-03",
				"榜单里没有百分比/升降箭头/得票率",
				hit.length === 0 && rowsText.length > 50,
				hit.length ? `命中 ${hit.join(" ")}` : `干净（榜单文字 ${rowsText.length} 字）`,
			);
		}

		// R-RANK-03：短评胶囊不得压住标题（绝对定位时代实测压了 60px），
		// 也不得自己被压扁（百分比 max-width 曾把它压成一个小圆点——只测"不重叠"是假绿）
		{
			const withNote = (jp?.rows ?? []).filter((r) => r.overlap !== null && r.overlap !== undefined);
			const notClipped = withNote.filter((r) => r.noteWidth && !r.noteWidth.clipped && r.noteWidth.w >= 60);
			record(
				"R-RANK-03",
				"短评胶囊不覆盖标题、自身也不被压扁",
				withNote.length >= 1 && withNote.every((r) => r.overlap <= 0) && notClipped.length === withNote.length,
				withNote.length
					? `有胶囊 ${withNote.length} 行，最大重叠 ${Math.max(...withNote.map((r) => r.overlap))}px，宽度 ${withNote.map((r) => `${r.noteWidth?.w}px${r.noteWidth?.clipped ? "(截断)" : ""}`).join("/")}`
					: "没有行带胶囊，样本为 0",
			);
		}

		// R-RANK-03：比例在更宽的屏上也要成立（cqw 的理由就是"按板宽取比例"）
		{
			const wide = facts["rank-jp-1920"]?.rank?.rows?.[0];
			const wRatio = wide ? wide.h / wide.w : 0;
			record(
				"R-RANK-03",
				"1920px 下比例仍成立（≈17.4%）",
				wRatio >= 0.14 && wRatio <= 0.21,
				`实测 ${(wRatio * 100).toFixed(1)}%（行高 ${wide?.h}px / 行宽 ${wide?.w}px）`,
			);
		}

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

		// ── R-RANK-07：二游排行（单一榜，没有「全剧 / 单集」）──
		{
			const game = facts["rank-game-1440"]?.rank;
			const gameMobile = facts["rank-game-390"];
			record(
				"R-RANK-07",
				"二游排行渲染出单一榜单板且带 single 标记",
				game?.single === true && game?.title === "二游排行",
				`single=${game?.single} title=${game?.title}`,
			);
			record(
				"R-RANK-07",
				"二游排行**没有**维度切换按钮、只有一块面板",
				(game?.tabs?.length ?? -1) === 0 && (game?.panels?.length ?? -1) === 1 && game?.panels?.[0]?.off === false,
				`按钮 ${game?.tabs?.length} 个 / 面板 ${JSON.stringify(game?.panels)}`,
			);
			record(
				"R-RANK-07",
				"二游排行 10 条且版式规格与另两榜一致",
				game?.rows?.length === 10 &&
					game.rows[0].h / game.rows[0].w >= 0.14 &&
					game.rows[0].h / game.rows[0].w <= 0.21 &&
					game.rows[0].badgeW / game.rows[0].w >= 0.11 &&
					game.rows[0].badgeW / game.rows[0].w <= 0.17 &&
					game.rows[0].badgeBg === jp?.rows?.[0]?.badgeBg &&
					game.rows[3].badgeBg === rest[0]?.badgeBg,
				`${game?.rows?.length} 条，行高比 ${((game?.rows?.[0]?.h / game?.rows?.[0]?.w) * 100).toFixed(1)}%，1 名底色 ${game?.rows?.[0]?.badgeBg}`,
			);
			record(
				"R-RANK-07",
				"二游排行 390px 下无横向溢出",
				(gameMobile?.overflowX ?? 99) <= 2,
				`溢出 ${gameMobile?.overflowX}px`,
			);
			// 单一榜不该被写进 ?kind=：它没有维度，URL 上出现 kind 参数说明渲染走错了分支
			// 注意 search 在 rank 子对象里（不是整页事实）
			record(
				"R-RANK-07",
				"二游排行的 URL 上没有 kind 参数",
				game?.search === "",
				`search="${game?.search}"`,
			);
		}

		// R-RANK-01 / SEO：排行页自己的标题与 canonical（静态产物下 canonical 不带查询串，
		// 两个维度共用同一张榜单页 → 不会产生 ?kind= 的重复内容）
		record(
			"R-RANK-01",
			"排行页标题含榜单名",
			(facts["rank-jp-1440"].title ?? "").includes("日漫排行") && (facts["rank-cn-1440"].title ?? "").includes("国漫排行"),
			`${facts["rank-jp-1440"].title} / ${facts["rank-cn-1440"].title}`,
		);
		{
			const canon = facts["rank-jp-ep-1440"].canonical ?? "";
			record(
				"R-RANK-01",
				"canonical 指向无查询串的榜单页",
				canon.includes("/rank/jp/") && !canon.includes("kind="),
				canon || "（没取到 canonical）",
			);
		}

		// R-RANK-01 的"导航两个子项高亮正确"：桌面导航栏上游没有当前页态，
		// 真正带高亮的是移动端抽屉（按 pathname 标 data-active + 自动展开父级分组）
		const mobExpanded = facts["rank-jp-390"].mobileNavExpanded ?? [];
		record(
			"R-RANK-01",
			"移动端导航把「日漫排行」标成当前页",
			(facts["rank-jp-390"].mobileNavActiveItems ?? []).some((i) => i.href === "/rank/jp/" && i.inSubmenu),
			`当前页项 ${JSON.stringify(facts["rank-jp-390"].mobileNavActiveItems)}`,
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
			const kept = ["/vndb/", "/myanimelist/", "/guestbook/", "/booknav/", "/rank/jp/", "/rank/cn/", "/rank/game/"].filter(
				(r) => sm.includes(r),
			);
			record("R-NAV-07", "sitemap 含保留页面（含三个排行页）", kept.length === 7, kept.join(","));
			// /rank/ 是 noindex 存根，不该出现在 sitemap 里。
			// 注意不能直接 sm.includes("/rank/")——"/rank/jp/" 也含这个子串，必须按 <loc> 整条匹配。
			const rankStubInSitemap = /<loc>[^<]*\/rank\/<\/loc>/.test(sm);
			record(
				"R-RANK-01",
				"sitemap 不含 /rank/ 跳转存根",
				!rankStubInSitemap,
				rankStubInSitemap ? "存根被写进 sitemap 了" : "干净",
			);

			// llms.txt（AI 抓取入口）：两个榜单页应当在 Key Pages 里，且不含 /rank/ 存根
			const llms = await fs.readFile(path.resolve("dist/llms.txt"), "utf8");
			const llmsHasBoth = llms.includes("/rank/jp/") && llms.includes("/rank/cn/");
			record("R-RANK-01", "llms.txt 列出两个榜单页", llmsHasBoth, llmsHasBoth ? "两个都在" : "缺榜单页");
			record(
				"R-RANK-01",
				"llms.txt 不含 /rank/ 存根",
				!/\]\([^)]*\/rank\/\)/.test(llms),
				"按整条 markdown 链接匹配",
			);

			// 无 JS 兜底：面板靠 `rank-panel--off` + html[data-rank-js="1"] 显隐，
			// 所以没有 JS 时两块榜单都看得见（动态验证只能验 print，noscript 要在产物里查）。
			const rankHtml = await fs.readFile(path.resolve("dist/rank/jp/index.html"), "utf8");
			// 页面里不止一个 <noscript>（模板也有），必须挑出含 .rank-tabs 的那一个
			const noscriptBlocks = [...rankHtml.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)].map((m) => m[1]);
			const rankNoscript = noscriptBlocks.find((b) => b.includes(".rank-tabs")) ?? "";
			record(
				"R-RANK-01",
				"无 JS 时 <noscript> 会藏掉维度按钮并给两块榜加小标题",
				rankNoscript.includes(".rank-tabs") && rankNoscript.includes("data-rank-label"),
				rankNoscript ? "noscript 样式在" : `找不到兜底样式（页面共 ${noscriptBlocks.length} 个 noscript）`,
			);
			// 面板上不该再出现 hidden 属性（Tailwind preflight 的 layered !important 盖不住，见 rank.css）
			const panelsWithHiddenAttr = (rankHtml.match(/data-rank-panel="[^"]*"[^>]*\shidden[\s>]/g) ?? []).length;
			const offClassCount = (rankHtml.match(/rank-panel--off/g) ?? []).length;
			record(
				"R-RANK-01",
				"面板用 class 而非 hidden 属性做显隐",
				panelsWithHiddenAttr === 0 && offClassCount >= 1,
				`带 hidden 的面板 ${panelsWithHiddenAttr} 个 / rank-panel--off 出现 ${offClassCount} 次`,
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
