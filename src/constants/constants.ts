export const PAGE_SIZE = 8;

export const LIGHT_MODE = "light",
	DARK_MODE = "dark",
	SYSTEM_MODE = "system";
export const DEFAULT_THEME: typeof LIGHT_MODE = LIGHT_MODE; // 仅作为向后兼容的默认值，实际使用 siteConfig.themeColor.defaultMode

// Wallpaper modes
export const WALLPAPER_BANNER = "banner",
	WALLPAPER_FULLSCREEN = "fullscreen",
	WALLPAPER_OVERLAY = "overlay",
	WALLPAPER_NONE = "none";

// Banner height unit: vh
// ⚠️ IMiss Blog（R-BG-01）：上游是 35 + 30 = 65vh。发起人反馈"壁纸有些地方看不见"——
//    实测 1918×966 的窗口下：原图 1916×821（2.33:1）被塞进 1918×628（3.05:1）的框，
//    `object-fit: cover` 只能保留 76% 的高度（上下各裁一截）。改成 80vh 后同一窗口下
//    框高 773，能保留 **94%** 的高度，画面基本完整。
//    注意：这个值同时驱动 `--banner-height-home`（内容起始位置）、水波纹位置与滚动视差
//    （src/utils/scroll-utils.ts 直接用这个常量），所以**必须改这里**而不是只在 CSS 里覆盖。
export const BANNER_HEIGHT = 45;
export const BANNER_HEIGHT_EXTEND = 35;
export const BANNER_HEIGHT_HOME: number = BANNER_HEIGHT + BANNER_HEIGHT_EXTEND;

// The height the main panel overlaps the banner, unit: rem
export const MAIN_PANEL_OVERLAPS_BANNER_HEIGHT = 3.5;

// Non-home banner height (unit: vh) — banner mode, desktop only.
// Lift = BANNER_HEIGHT_HOME(80) - BANNER_HEIGHT_NON_HOME: 45=35vh, 50=30vh, 35=fuwari 45vh.
// IMiss Blog（R-BG-01）：跟着首页一起加高（45 → 55），非首页的壁纸同样不该被裁掉太多。
export const BANNER_HEIGHT_NON_HOME = 55;
// Pixel floor for the non-home banner (unit: px) — cushions short (laptop) screens,
// so the vh value resolving to too few absolute pixels doesn't cramp the title/description.
// Combined as `max(...vh, ...px)` in Layout.astro.
export const BANNER_HEIGHT_NON_HOME_MIN = 380;

// 横幅在**窄屏**（≤1023px）下的高度（vh）—— v1.71 新增，把原来散在 CSS 里的 65vh 收成单一事实来源
//
// 为什么需要它：layout-styles.css 一直在四处写死 height: 65vh !important 把手机横幅压矮，
// 而 --banner-height-home（内容定位用的那个变量）仍是 80vh —— 于是「内容重叠横幅 3.5rem」
// 这个设计在手机上从来没生效过，横幅下面留了 80vh−65vh−3.5rem ≈ 70px 的**纯页面底色空档**
// （暗色主题下就是一块黑板，发起人 2026-10-09 指着截图问「水波那里那么大块黑色区域」）。
// 现在两个地方都读这一个值，改一处即可同时改掉「横幅多高」与「内容从哪开始」。
export const BANNER_HEIGHT_MOBILE = 65;

// Page width: rem
export const PAGE_WIDTH = 100;

// Category constants
export const UNCATEGORIZED = "uncategorized";
