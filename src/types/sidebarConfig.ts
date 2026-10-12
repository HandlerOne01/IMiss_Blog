// 组件配置类型定义
export type WidgetComponentType =
	| "profile"
	| "announcement"
	| "categories"
	| "tags"
	| "sidebarToc"
	| "advertisement"
	| "stats"
	| "calendar"
	| "music"
	| "siteInfo"
	| "dynamic";

export type WidgetComponentConfig = {
	type: WidgetComponentType; // 组件类型
	enable: boolean; // 是否启用该组件
	showTitle?: boolean; // 是否显示该组件标题，默认true
	position: "top" | "sticky"; // 组件位置：top=固定在顶部，sticky=粘性定位（可滚动）
	showOnPostPage?: boolean; // 是否在文章详情页显示
	hideOnNonPostPage?: boolean; // 是否在非文章详情页隐藏
	specificConfig?: WidgetSpecificConfig;
	customProps?: Record<string, unknown>; // 自定义属性，用于扩展组件功能
};

export type MobileBottomComponentConfig = {
	type: WidgetComponentType; // 组件类型
	enable: boolean; // 是否启用该组件
	showTitle?: boolean; // 是否显示该组件标题，默认true
	showOnPostPage?: boolean; // 是否在文章详情页显示
	hideOnNonPostPage?: boolean; // 是否在非文章详情页隐藏
	specificConfig?: WidgetSpecificConfig;
	customProps?: Record<string, unknown>; // 自定义属性，用于扩展组件功能
};

// 组件通用专属配置
export type WidgetSpecificConfig = {
	collapseThreshold?: number; // 折叠阈值
	calendar?: CalendarConfig; // 日历组件专用配置
	ad?: AdConfig; // 广告组件专用配置
	siteInfo?: SiteInfoConfig; // 站点信息组件专用配置
	dynamic?: DynamicWidgetConfig; // 最新动态组件专用配置
};

export type DynamicWidgetConfig = {
	limit?: number; // 显示的最新动态数量，默认 3
};

// 站点信息组件专用配置
export type SiteInfoConfig = {
	unknownBuildPlatform?: string; // 未识别的构建平台显示文本，默认 "Unknown CI"
	/**
	 * IMiss Blog 新增（v1.117 / P6-6）：部署平台与运行环境的**显式值**。
	 * 本站是自建部署（本地构建 → SSH 上传到腾讯云 Nginx），既不在 Vercel 也不在任何 CI，
	 * 自动识别只会得到 "Local"，对访客没有意义 —— 所以这两格由配置直接给真名。
	 * 留空则回落到自动识别（`detectBuildPlatform()` / `process.platform`）。
	 */
	buildPlatform?: string;
	systemInfo?: string;
	/**
	 * IMiss Blog 新增（R-WDG-03）：占位模式。
	 * 站点还没部署，构建平台 / 系统架构 / 构建时间这些值都是本机的临时信息，
	 * 开着它时这些字段统一显示 "—"，并在卡片底部提示"部署后自动填充"；
	 * 本地配置项（文章许可）照常显示。部署后把 sidebarConfig 的这两处开关改成 false 即可回填真实值。
	 * ⚠️ v1.117（P6-6）：2026-10-12 站点已上线，两处都已改成 false —— 留着这个开关是为了
	 * 将来换域名/换机器时还能一键退回占位（那时若显示本机信息会让人误以为站点还没上线）。
	 */
	placeholder?: boolean;
};

// 日历组件专用配置
export type CalendarConfig = {
	// 是否显示年度文章热力图
	showHeatmap: boolean;
};

// 广告栏配置
export type AdConfig = {
	title?: string; // 广告栏标题
	content?: string; // 广告栏文本内容
	image?: { src: string; alt?: string; link?: string; external?: boolean }; // 广告图片
	link?: { text: string; url: string; external?: boolean }; // 广告链接按钮
	padding?: {
		top?: string;
		right?: string;
		bottom?: string;
		left?: string;
		all?: string;
	}; // 内边距
	closable?: boolean; // 是否可关闭
	displayCount?: number; // 显示次数限制，-1为无限制
	expireDate?: string; // 过期时间 (ISO 8601 格式)
};

export type SidebarLayoutConfig = {
	enable: boolean; // 是否启用侧边栏
	position: "left" | "right" | "both"; // 侧边栏位置：左侧、右侧或双侧
	tabletSidebar?: "left" | "right"; // 平板端(769-1279px)显示哪侧侧边栏，仅position为both时生效，默认left
	hideSidebarOnPostPage?: boolean; // 文章详情页隐藏侧边栏，设为 true 则只在首页等非文章页显示，默认 false
	noSidebarContentWidth?: number; // 本页没有侧栏列时内容栏占包裹层总宽的比例（0–1），不设置则铺满
	leftComponents: WidgetComponentConfig[]; // 左侧边栏组件配置列表
	rightComponents: WidgetComponentConfig[]; // 右侧边栏组件配置列表
	mobileBottomComponents: MobileBottomComponentConfig[]; // 移动端底部组件配置列表（<768px显示）
};
