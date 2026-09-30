import { setMaxListeners } from "node:events";
import cloudflare from "@astrojs/cloudflare";
import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";
import swup from "@swup/astro";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";
import expressiveCode from "astro-expressive-code";
import icon from "astro-icon";
import { pluginLanguageLogo } from "ec-lang-logo"; /* Language Logo */
import { pluginCollapsible } from "expressive-code-collapsible"; /* Collapsible */
import { pluginLanguageBadge } from "expressive-code-language-badge"; /* Language Badge */
import katex from "katex";
import "katex/dist/contrib/mhchem.mjs"; // 加载 mhchem 扩展
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeCallouts from "rehype-callouts";
import rehypeCodeGroup from "rehype-code-group"; /* Tab 代码块 */
import rehypeComponents from "rehype-components"; /* Render the custom directive content */
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkAdmonitionToBlockquoteCallout from "remark-admonition-to-blockquote-callout";
import remarkDirective from "remark-directive"; /* Handle directives */
import remarkMath from "remark-math";
import remarkSectionize from "remark-sectionize";
import {
	commentConfig,
	dynamicConfig,
	expressiveCodeConfig,
	fontConfig,
	fontsList,
	mermaidConfig,
	plantumlConfig,
	siteConfig,
} from "./src/config";
import I18nKey from "./src/i18n/i18nKey";
import { i18n } from "./src/i18n/translation";
import { GithubCardComponent } from "./src/plugins/rehype-component-github-card.mjs";
import { rehypeDiagramPanZoom } from "./src/plugins/rehype-diagram-panzoom.mjs";
import rehypeEmailProtection from "./src/plugins/rehype-email-protection.mjs";
import rehypeExternalLinks from "./src/plugins/rehype-external-links.mjs";
import rehypeFigure from "./src/plugins/rehype-figure.mjs";
import rehypeImageReferrerPolicy from "./src/plugins/rehype-image-referrerpolicy.mjs";
import { rehypeMermaid } from "./src/plugins/rehype-mermaid.mjs";
import { rehypePlantuml } from "./src/plugins/rehype-plantuml.mjs";
import { parseDirectiveNode } from "./src/plugins/remark-directive-rehype.js";
import { remarkExcerpt } from "./src/plugins/remark-excerpt.js";
import { remarkImageGrid } from "./src/plugins/remark-image-grid.js";
import { remarkMermaid } from "./src/plugins/remark-mermaid.js";
import { remarkPlantuml } from "./src/plugins/remark-plantuml.js";
import { remarkReadingTime } from "./src/plugins/remark-reading-time.mjs";
import { remarkWikiLink } from "./src/plugins/remark-wiki-link.js";
import { collectUsedFontCssVars } from "./src/utils/fontHelper";

if (process.env.NODE_ENV === "development") {
	setMaxListeners(20);
}

const adapter = process.env.CF_WORKERS
	? cloudflare({
			prerenderEnvironment: "node",
		})
	: undefined;

// https://astro.build/config
export default defineConfig({
	site: siteConfig.site_url,

	base: "/",
	trailingSlash: "always",

	// 字体配置 - 只加载实际使用的字体，跳过未引用的以加快构建
	fonts: (() => {
		// 禁用字体功能时直接返回空数组，跳过 Astro Font API 集成
		if (!fontConfig.enable) return [];

		const used = collectUsedFontCssVars(fontConfig);
		return fontsList
			.filter((f) => used.has(f.cssVariable))
			.map((f) => {
				let provider;
				switch (f.provider) {
					case "google":
						provider = fontProviders.google();
						break;
					case "fontsource":
						provider = fontProviders.fontsource();
						break;
					case "local":
						provider = fontProviders.local();
						break;
					case "bunny":
						provider = fontProviders.bunny();
						break;
					case "fontshare":
						provider = fontProviders.fontshare();
						break;
					case "npm":
						provider = fontProviders.npm();
						break;
					default:
						provider = f.provider;
				}
				return { ...f, provider };
			});
	})(),

	adapter,

	// 图像优化配置
	image: {
		// 组件可自行传入 layout/widths；这里只控制 Markdown 正文图片
		layout: "none",
	},

	integrations: [
		swup({
			theme: false,
			animationClass: "transition-swup-", // see https://swup.js.org/options/#animationselector
			// the default value `transition-` cause transition delay
			// when the Tailwind class `transition-all` is used
			containers: [
				"#banner-overlay-container",
				"#banner-dim-container",
				"#swup-container",
				"#left-sidebar-dynamic",
				"#right-sidebar-dynamic",
				"#floating-toc-wrapper",
			],
			smoothScrolling: false,
			cache: true,
			preload: {
				hover: true,
				visible: true,
			},
			accessibility: true,
			updateHead: true,
			updateBodyClass: false,
			globalInstance: true,
			// 滚动相关配置优化
			// ⚠️ `resolveUrl` / `animateHistoryBrowsing` 与 `skipPopStateHandling` 一样**传不进 Swup 实例**
			//    （见下面 B-16 那段），只是这两个的值恰好与 Swup 4.9.2 的默认值相同，才没有可观察的差异。
			resolveUrl: (url) => url,
			animateHistoryBrowsing: false,
			// ── B-16：页内锚点交给**浏览器原生**处理 ────────────────────────────
			// 症状（修复前，真机实测 reports/_b16-probe.json）：点 TOC / 标题锚点后 URL 确实带上
			// `#hash`、也确实滚到位，但 `history.length` **不变** → 按一次「后退」直接离开该页
			// （文章页退到上一份文档），读者回不到原来的位置。
			// 根因：Swup 4.9.2 `handleLinkClick()` 对"同页锚点"走的是它自己的 `link:anchor` 分支，
			// 里面对 URL 调的是 `updateHistoryRecord()` = **`history.replaceState()`**（不是 push），
			// 所以永远不产生历史记录。这一条在 `astro.config.mjs` 里改不了（没有对应选项），
			// 必须让 Swup **整个别管**这类点击 —— 用 @swup/astro 支持的 `ignore` 入口。
			// 豁免后（同一个探针的 Q1/Q2 段，用运行时补 `data-no-swup` 模拟）：hash + 历史记录 +
			// `scroll-margin-top: 5.5rem` 定位 + `history.scrollRestoration` 原样还原全部回来，
			// 且后退/前进时 Swup 的 `visit:start` 计数**保持 0**（不重渲染整页）。
			// ⚠️ `:not([href="#"])` 不能省：裸 `#` 占位链接（Profile 的邮箱按钮、禁用分页）被豁免后
			//    会变成原生 `#` 跳转（URL 尾巴多个 `#`、白多一条历史记录，实测见探针 Q3）。
			// ⚠️ 数组**只许放一个元素**：@swup/astro 的 `deserialise()` reviver 会把"长度 2 且第 2 项是字符串"
			//    的数组当成 `[:regex:, …]` / `[:function:, …]` 标记拆掉 —— 实测 `['a','b']` 反序列化后
			//    只剩字符串 `"b"`（豁免静默失效）。要加第二条规则请用**函数**形式。
			// ⚠️ 选择器只能匹配元素、不能按 URL 匹配（`ignoreVisit` 里的字符串以 `/` 开头才是 URL 前缀）：
			//    这样 `swup.navigate("/posts/x/#h")`（站内搜索跳锚点）不会被误判成"要豁免"而退化成整页跳转。
			ignore: ['a[href^="#"]:not([href="#"])'],
			// ⚠️ 这里**原来**写着 `skipPopStateHandling: (e) => e.state?.url?.includes("#")`，
			//    注释是「跳过锚点链接的处理，让浏览器原生处理」—— 实测**它从来没生效过**：
			//    @swup/astro 1.8.0 的 `buildInitScript()` 只把 ignoreVisit / animationSelector /
			//    containers / cache / native / plugins 传给 `new Swup()`，其余同名选项全部丢弃
			//    （构建产物 `dist/_astro/page.*.js` 里 `skipPopStateHandling` 出现 **0** 次）。
			//    而且它的判据本身也是反的：它测的是**目标条目**的 state，同文档后退时目标条目
			//    没有 hash，于是返回 false → 真生效的话反而会把同文档后退交给 Swup 去重渲染。
			//    现在**不需要**它：锚点走原生后，前进/后退是同文档遍历，popstate 的目标条目
			//    state 为 `null` → Swup 默认的 `skipPopStateHandling`（`state?.source !== "swup"`）
			//    直接跳过；即使目标条目是 Swup 写的（`source: "swup"`），core 的 `handlePopState()`
			//    也会因为 `getCurrentUrl()`（**不含 hash**）等于 `this.location.url` 而提前 return。
			//    两条路径都不产生 visit（实测 visits 计数 0，见 reports/_b16-report.md）。
		}),
		icon({
			include: {
				"material-symbols": ["*"],
				"fa7-brands": ["*"],
				"fa7-regular": ["*"],
				"fa7-solid": ["*"],
				"simple-icons": ["*"],
				mdi: ["*"],
				mingcute: ["*"],
			},
		}),
		expressiveCode({
			themes: [expressiveCodeConfig.darkTheme, expressiveCodeConfig.lightTheme],
			useDarkModeMediaQuery: false,
			themeCssSelector: (theme) => `[data-theme='${theme.name}']`,
			plugins: [
				// pluginLanguageBadge 配置 - 从expressiveCodeConfig读取设置
				...(expressiveCodeConfig.pluginLanguageBadge?.enable === true
					? [pluginLanguageBadge()]
					: []),
				// pluginLanguageLogo 配置 - 从expressiveCodeConfig读取设置
				...(expressiveCodeConfig.pluginLanguageLogo?.enable === true
					? [
							pluginLanguageLogo({
								color: expressiveCodeConfig.pluginLanguageLogo.color ?? "mono",
								excludedLangs:
									expressiveCodeConfig.pluginLanguageLogo.excludedLangs ?? [],
							}),
						]
					: []),
				pluginCollapsibleSections(),
				pluginLineNumbers(),
				// pluginCollapsible 配置 - 从expressiveCodeConfig读取设置，使用i18n文本
				...(expressiveCodeConfig.pluginCollapsible?.enable === true
					? [
							pluginCollapsible({
								lineThreshold:
									expressiveCodeConfig.pluginCollapsible.lineThreshold || 15,
								previewLines:
									expressiveCodeConfig.pluginCollapsible.previewLines || 8,
								defaultCollapsed:
									expressiveCodeConfig.pluginCollapsible.defaultCollapsed ??
									true,
								expandButtonText: i18n(I18nKey.codeCollapsibleShowMore),
								collapseButtonText: i18n(I18nKey.codeCollapsibleShowLess),
								expandedAnnouncement: i18n(I18nKey.codeCollapsibleExpanded),
								collapsedAnnouncement: i18n(I18nKey.codeCollapsibleCollapsed),
							}),
						]
					: []),
			],
			defaultProps: {
				wrap: false,
				overridesByLang: {
					shellsession: {
						showLineNumbers: false,
					},
				},
			},
			styleOverrides: {
				borderRadius: "0.75rem",
				codeFontSize: "0.875rem",
				codeFontFamily:
					"var(--font-code, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace)",
				codeLineHeight: "1.5rem",
				frames: {},
				textMarkers: {
					delHue: 0,
					insHue: 180,
					markHue: 250,
				},
				languageBadge: {
					fontSize: "0.75rem",
					fontWeight: "bold",
					borderRadius: "0.25rem",
					opacity: "1",
					borderWidth: "0px",
					borderColor: "transparent",
				},
			},
			frames: {
				// 保留原生复制按钮，外观由 src/styles/expressive-code.css 覆盖成主题风格
				showCopyToClipboardButton: true,
			},
		}),
		svelte(),
		sitemap({
			filter: (page) => {
				// 根据页面开关配置过滤sitemap
				const url = new URL(page);
				const pathname = url.pathname;
				if (pathname === "/dynamic/" && !siteConfig.pages.dynamic) {
					return false;
				}
				if (pathname.startsWith("/gallery/") && !siteConfig.pages.gallery) {
					return false;
				}
				if (pathname === "/friends/" && !siteConfig.pages.friends) {
					return false;
				}
				if (pathname === "/guestbook/" && !siteConfig.pages.guestbook) {
					return false;
				}
				if (pathname === "/booknav/" && !siteConfig.pages.booknav) {
					return false;
				}
				if (pathname === "/bilibili/" && !siteConfig.pages.bilibili) {
					return false;
				}
				if (pathname === "/bangumi/" && !siteConfig.pages.bangumi) {
					return false;
				}
				if (pathname === "/vndb/" && !siteConfig.pages.vndb) {
					return false;
				}
				if (pathname === "/myanimelist/" && !siteConfig.pages.mal) {
					return false;
				}
				// /rank/ 只是跳转到 /rank/jp/ 的存根（HTTP 200 + meta refresh + noindex，见 ARCH §14.3 T17）。
				// 把 noindex 页塞进 sitemap 会被 Search Console 判成「已提交但被 noindex 排除」，直接排除。
				if (pathname === "/rank/") {
					return false;
				}
				// 动态页评论嵌入页：评论关闭时重定向到 /404/，不应进 sitemap
				if (
					pathname === "/dynamic/comments/" &&
					(dynamicConfig.showComment === false ||
						!commentConfig.type ||
						commentConfig.type === "none")
				) {
					return false;
				}
				if (pathname === "/sponsor/" && !siteConfig.pages.sponsor) {
					return false;
				}
				return true;
			},
		}),
		mdx(),
	],
	markdown: {
		processor: unified({
			remarkPlugins: [
				...(siteConfig.post.rehypeCallouts.enablePythonMarkdownAdmonitions !==
				false
					? [remarkAdmonitionToBlockquoteCallout]
					: []),
				remarkMath,
				remarkReadingTime,
				remarkWikiLink,
				remarkImageGrid,
				remarkExcerpt,
				remarkDirective,
				remarkSectionize,
				parseDirectiveNode,
				remarkMermaid,
				[remarkPlantuml, plantumlConfig],
			],
			rehypePlugins: [
				[rehypeKatex, { katex }],
				[rehypeCallouts, { theme: siteConfig.post.rehypeCallouts.theme }],
				rehypeSlug,
				rehypeCodeGroup,
				[rehypeMermaid, mermaidConfig],
				rehypePlantuml,
				rehypeDiagramPanZoom,
				rehypeFigure,
				[
					rehypeImageReferrerPolicy,
					{ domains: siteConfig.imageOptimization?.noReferrerDomains || [] },
				],
				[rehypeExternalLinks, { siteUrl: siteConfig.site_url }],
				[rehypeEmailProtection, { method: "base64" }], // 邮箱保护插件，支持 'base64' 或 'rot13'
				[
					rehypeComponents,
					{
						components: {
							github: GithubCardComponent,
						},
					},
				],
				[
					rehypeAutolinkHeadings,
					{
						behavior: "append",
						properties: {
							className: ["anchor"],
						},
						content: {
							type: "element",
							tagName: "span",
							properties: {
								className: ["anchor-icon"],
								"data-pagefind-ignore": true,
							},
							children: [
								{
									type: "text",
									value: "#",
								},
							],
						},
					},
				],
			],
		}),
	},
	vite: {
		plugins: [tailwindcss()],
		server: {
			watch: {
				ignored: ["**/package/**"],
			},
		},
		resolve: {
			alias: {
				"@rehype-callouts-theme": `rehype-callouts/theme/${siteConfig.post.rehypeCallouts.theme}`,
			},
		},
		build: {
			minify: "esbuild",
			esbuildOptions: {
				minify: true,
				// 删除 debugger 语句；console.log / console.debug 无副作用，未使用返回值时会被 dead code elimination 移除，
				// console.warn / console.error 保留，确保生产环境出错时仍有日志可查
				drop: ["debugger"],
				pure: ["console.log", "console.debug"],
			},
			rollupOptions: {
				onwarn(warning, warn) {
					// temporarily suppress this warning
					if (
						warning.message.includes("is dynamically imported by") &&
						warning.message.includes("but also statically imported by")
					) {
						return;
					}
					warn(warning);
				},
			},
			// CSS 优化
			cssCodeSplit: true,
			cssMinify: "esbuild",
			assetsInlineLimit: 4096,
		},
	},
});
