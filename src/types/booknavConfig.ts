// 书签导航配置

// 单个书签条目
export type BooknavItem = {
	title: string; // 书签标题
	url: string; // 书签地址
	desc?: string; // 书签描述
	// 图标，留空则自动获取目标站点的 favicon
	// 支持三种写法：
	// 1. 网络图片：https://example.com/logo.png
	// 2. public 目录图片：/assets/images/xxx.png
	// 3. astro-icon 图标名：fa7-brands:github
	icon?: string;
	// 图标的**官方品牌色**（十六进制，如 "#4D6BFE"）。
	// ⚠️ 这里写的是"品牌色"，不是"最终渲染色" —— 页面按主题色感知地使用它：
	//   · 亮色主题：原样使用（卡片图标底是浅灰 zinc-100，品牌色直接可见）
	//   · 深色主题：`color-mix(in oklab, <品牌色> 55%, white)` —— 只抬亮度、保留色相，
	//     避免 #181717 / #1C3C3C / #0052D9 这类深色在深色卡上"看不见"。
	//     个别色在 55% 下仍够不到 3:1（如 GitHub 的 #181717）才单独配深色值，
	//     见 `src/constants/booknav-brand-colors.ts`（品牌色表的单一事实来源）。
	//   · 留空：退回主题的中性色（`text-neutral-700` / `dark:text-neutral-200`），即旧行为
	// 三种图标形态都能吃这个颜色：iconify `<svg>`、以及兜底的 `.booknav-letter` 首字母块。
	// 本地 favicon（`kind === "image"`）自带真彩色，**不用**也不该用这个字段。
	iconColor?: string;
	weight?: number; // 组内权重，数字越大排序越靠前，默认 0
	enabled?: boolean; // 是否启用，默认 true
};

// 书签分组
export type BooknavGroup = {
	id: string; // 分组唯一标识，用作锚点 id，如 "dev"
	name: string; // 分组名称
	icon?: string; // 分组图标，astro-icon 图标名
	desc?: string; // 分组描述
	weight?: number; // 分组权重，数字越大排序越靠前，默认 0
	enabled?: boolean; // 是否启用，默认 true
	items: BooknavItem[]; // 分组内的书签列表
};

// favicon 自动获取配置
export type BooknavFaviconConfig = {
	enabled: boolean; // 是否在未填写 icon 时自动获取 favicon
	// favicon 接口地址，{domain} 会被替换为目标站点域名
	api: string;
};

// 书签导航页面配置
export type BooknavPageConfig = {
	title?: string; // 页面标题，留空则使用 i18n 中的翻译
	description?: string; // 页面描述，留空则使用 i18n 中的翻译
	favicon: BooknavFaviconConfig; // favicon 自动获取配置
};
