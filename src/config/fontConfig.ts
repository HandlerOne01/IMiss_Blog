/**
 * 字体配置（统一入口）
 *
 * 所有字体相关配置都在此文件中定义：
 *   详细用法请参考 Astro 官方文档：https://docs.astro.build/en/guides/fonts
 * - fonts：Astro Font API 字体定义（自动下载、缓存、优化加载）
 * - fontConfig：字体选择与区域覆盖
 *
 * 添加新字体只需编辑本文件：
 * 1. 在下方 fonts 数组中添加字体定义
 * 2. 在 fontConfig.selected 或区域字段中引用对应的 cssVariable
 *
 * 支持的 provider：https://docs.astro.build/en/reference/font-provider-reference/#built-in-providers
 *   "google"     - Google Fonts
 *   "fontsource" - Fontsource
 *   "local"      - 本地字体文件
 *   "bunny"      - Bunny Fonts
 *   "fontshare"  - Fontshare
 *   "npm"        - NPM 包（如 @fontsource/*）
 *
 * 本地字体子集化：在 fontConfig.subsetFonts 中添加对应 cssVariable 的配置，
 * 构建时脚本会自动扫描页面字符并生成轻量 woff2 子集。
 */
import type { FontDefinition, FontSelectionConfig } from "@/types/fontConfig";

// ─── Astro Font API 字体定义 ───────────────────────────────
//
// ⚠️ 这里**只用 `local` provider**，三个字体的 woff2 随仓库提交在 `src/assets/fonts/`。
//
//    ① 为什么不用远端 provider（P0 实测）：
//       google / fontsource / bunny / fontshare / **npm** 这些 provider 统统会在
//       `pnpm build` 期间访问 cdn.jsdelivr.net 下载字体文件 —— 连 `npm` provider 也是去
//       `cdn.jsdelivr.net/npm/@fontsource/<family>@<ver>/files/…` 取，而不是读本地 node_modules。
//       网络不可达时直接构建失败（报错 `CannotFetchFontFile`），而 jsdelivr 在国内并不可靠。
//       本站要求「构建不依赖外网」（ARCH.md §2 硬约束、R-DEP-04），所以字体一律用本地文件。
//
//    ② 为什么放 `src/assets/fonts/` 而不是 `public/assets/fonts/`（上游示例的位置）：
//       `public/` 下的文件会被原样拷进 `dist/`，而 local provider 又会在 `dist/_astro/fonts/`
//       生成一份带哈希的副本 —— 放 public 等于每个字体在产物里存两份（实测多占 205KB）。
//       注意 `scripts/subset-fonts.ts` 的 `toPublicPath()` 只认 `public/` 前缀，
//       所以这 3 个字体**不要**再登记进 `fontConfig.subsetFonts`（要子集化就得搬回 public 或扩展该函数）。
//
//    ③ 字体来源与再生成：woff2 复制自 npm 包 `@fontsource/zen-maru-gothic` /
//       `@fontsource/inter` / `@fontsource/jetbrains-mono`（三者已列入 devDependencies），
//       只取 **latin** 子集（本站没有西里尔文内容）。要补字重或子集时：
//         1) 在 `node_modules/@fontsource/<family>/files/` 找到目标 woff2
//         2) 复制到 `src/assets/fonts/`
//         3) 在下方对应字体的 `variants` 里补一条（`weight` 必填）
//
//    ④ Zen Maru Gothic 的 latin 子集不含日文假名与汉字（日文子集被拆成上千个分片文件，
//       不适合随仓库分发），所以横幅标题里的中日文字符会按 font-family 逐字回退到系统字体。
export const fontsList: FontDefinition[] = [
	{
		name: "Zen Maru Gothic",
		cssVariable: "--font-zen-maru-gothic",
		provider: "local",
		options: {
			variants: [
				{
					src: ["./src/assets/fonts/zen-maru-gothic-latin-300-normal.woff2"],
					weight: "300",
					style: "normal",
				},
				{
					src: ["./src/assets/fonts/zen-maru-gothic-latin-400-normal.woff2"],
					weight: "400",
					style: "normal",
				},
				{
					src: ["./src/assets/fonts/zen-maru-gothic-latin-500-normal.woff2"],
					weight: "500",
					style: "normal",
				},
				{
					src: ["./src/assets/fonts/zen-maru-gothic-latin-700-normal.woff2"],
					weight: "700",
					style: "normal",
				},
			],
		},
		fallbacks: ["sans-serif"],
	},
	{
		name: "Inter",
		cssVariable: "--font-inter",
		provider: "local",
		options: {
			variants: [
				{
					src: ["./src/assets/fonts/inter-latin-300-normal.woff2"],
					weight: "300",
					style: "normal",
				},
				{
					src: ["./src/assets/fonts/inter-latin-400-normal.woff2"],
					weight: "400",
					style: "normal",
				},
				{
					src: ["./src/assets/fonts/inter-latin-500-normal.woff2"],
					weight: "500",
					style: "normal",
				},
				{
					src: ["./src/assets/fonts/inter-latin-600-normal.woff2"],
					weight: "600",
					style: "normal",
				},
				{
					src: ["./src/assets/fonts/inter-latin-700-normal.woff2"],
					weight: "700",
					style: "normal",
				},
			],
		},
		fallbacks: ["sans-serif"],
	},
	{
		name: "JetBrains Mono",
		cssVariable: "--font-jetbrains-mono",
		provider: "local",
		options: {
			variants: [
				{
					src: ["./src/assets/fonts/jetbrains-mono-latin-400-normal.woff2"],
					weight: "400",
					style: "normal",
				},
				{
					src: ["./src/assets/fonts/jetbrains-mono-latin-700-normal.woff2"],
					weight: "700",
					style: "normal",
				},
			],
		},
		fallbacks: [
			"ui-monospace",
			"SFMono-Regular",
			"Menlo",
			"Monaco",
			"Consolas",
			"Liberation Mono",
			"Courier New",
			"monospace",
		],
	},
	// ─── 本地字体示例 ───
	// 使用步骤：
	// 1. 将 TTF/OTF/WOFF2 字体文件放在 public/assets/fonts/ 目录下
	// 2. 参考下方配置填写正确的字体信息
	// 3. 在 fontConfig.selected 或区域字段中引用 cssVariable
	{
		name: "GreatVibes Regular 2",
		cssVariable: "--font-greatvibes",
		provider: "local",
		options: {
			variants: [
				{
					src: ["./public/assets/fonts/GreatVibes-Regular-2.otf"],
				},
			],
		},
		fallbacks: ["sans-serif"],
	},
];

// ─── 字体选择与区域覆盖 ─────────────────────────────────────
export const fontConfig: FontSelectionConfig = {
	// 是否启用自定义字体功能
	enable: true,
	// 当前选择的字体 CSS 变量名（对应上方 fonts 中的 cssVariable）
	// 使用 "system" 表示系统字体（不加载任何自定义字体）
	selected: ["system"],

	// 各区域独立字体设置（填写上方 fonts 中的 cssVariable，留空则使用全局 selected 字体）
	// 例如：bannerTitleFont: "--font-inter", 表示主页横幅主标题使用 Inter 字体
	// 主页横幅主标题字体
	bannerTitleFont: "--font-zen-maru-gothic",
	// 主页横幅副标题字体
	bannerSubtitleFont: "--font-inter",
	// 导航栏标题字体
	navbarTitleFont: "",
	// 代码块字体（用于代码高亮和等宽字体场景）
	codeFont: "--font-jetbrains-mono",

	// 本地字体子集化配置（构建时由 scripts/subset-fonts.ts 处理）
	// key 为 fonts 数组中对应的 cssVariable，value 为子集化选项
	subsetFonts: {
		"--font-greatvibes": {
			// 额外包含的字符
			extraChars: "",
		},
	},
};
