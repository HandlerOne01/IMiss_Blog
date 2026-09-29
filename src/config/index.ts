// 配置索引文件 - 统一导出所有配置
// 这样组件可以一次性导入多个相关配置，减少重复的导入语句

import type { NavbarMode } from "../types/siteConfig";
import { siteConfig } from "./siteConfig"; // 站点基础配置（用于派生 navbarMode）

/** 解析导航栏模式：navbarMode 优先，否则按旧 stickyNavbar 兼容映射（true→fixed，false→static） */
export function resolveNavbarMode(navbar: {
	navbarMode?: NavbarMode;
	stickyNavbar?: boolean;
}): NavbarMode {
	if (navbar.navbarMode) return navbar.navbarMode;
	return navbar.stickyNavbar === false ? "static" : "fixed";
}

/** 当前导航栏模式（已按 navbarMode / 旧 stickyNavbar 解析），供各消费方统一读取 */
export const navbarMode: NavbarMode = resolveNavbarMode(siteConfig.navbar);

export type { AgentConfig, AgentResumeWord } from "../types/agentConfig"; // Agent 接口契约类型（R-AGT-07，本站新增，P5-0）
// 类型导出
export type {
	AdConfig,
	AnalyticsConfig,
	AnnouncementConfig,
	BackgroundWallpaperConfig,
	BooknavFaviconConfig,
	BooknavGroup,
	BooknavItem,
	BooknavPageConfig,
	CommentConfig,
	CoverImageConfig,
	DisplaySettingsConfig,
	DynamicConfig,
	ExpressiveCodeConfig,
	GalleryAlbum,
	GalleryConfig,
	LicenseConfig,
	MermaidConfig,
	MusicPlayerConfig,
	NavBarConfig,
	PlantUMLConfig,
	ProfileConfig,
	SakuraConfig,
	SidebarLayoutConfig,
	SiteConfig,
	WidgetComponentConfig,
	WidgetComponentType,
	WidgetSpecificConfig,
} from "../types/config";
export type {
	BuiltinFontProvider,
	CustomFontProvider,
	FontDefinition,
	FontSelectionConfig,
} from "../types/fontConfig"; // 字体类型定义
export type {
	RoadmapConfig,
	RoadmapLevel,
	RoadmapLine,
	RoadmapStage,
	RoadmapStop,
} from "../types/roadmapConfig"; // 学习路线类型（R-PATH，本站新增）
export { agentConfig } from "./agentConfig"; // Agent 接口契约配置（R-AGT-02 / R-AGT-07，本站新增，P5-0）
export { analyticsConfig } from "./analyticsConfig"; // 统计分析配置
export { announcementConfig } from "./announcementConfig"; // 公告配置
// 样式配置
export { backgroundWallpaper } from "./backgroundWallpaper"; // 背景壁纸配置
export { booknavConfig, booknavPageConfig } from "./booknavConfig"; // 书签导航配置
// 功能配置
export { commentConfig } from "./commentConfig"; // 评论系统配置
export { coverImageConfig } from "./coverImageConfig"; // 封面图配置
export { displaySettingsConfig } from "./displaySettingsConfig"; // 显示设置面板开关配置
export { dynamicConfig } from "./dynamicConfig"; // 动态页面配置
export { sakuraConfig } from "./effectsConfig"; // 动画特效配置（樱花等）
export { expressiveCodeConfig } from "./expressiveCodeConfig"; // 代码高亮配置
export { fontConfig, fontsList } from "./fontConfig"; // 字体配置
// P4-8（v1.47）：`friendsConfig`（友链，含上游作者身份与邮箱）已整文件删除，不再导出 ——
// 它的唯一消费者 `src/pages/friends.astro` 一并删除（`/friends/` 现在是**真 404**，
// 由 `siteConfig.pages.friends === false` 与页面不存在双重保证）。
export { galleryConfig } from "./galleryConfig"; // 相册配置
export { licenseConfig } from "./licenseConfig"; // 许可证配置
// 组件配置
export { mermaidConfig } from "./mermaidConfig"; // Mermaid 图表配置
export { musicPlayerConfig } from "./musicConfig"; // 音乐播放器配置
export { navBarConfig, navBarSearchConfig } from "./navBarConfig"; // 导航栏配置与搜索配置
export { petConfig } from "./petConfig"; // 桌宠配置（R-PET，本站新增）
export { live2dWidgetConfig, spineModelConfig } from "./pioConfig"; // 看板娘配置
export { plantumlConfig } from "./plantumlConfig"; // PlantUML 图表配置
export { profileConfig } from "./profileConfig"; // 用户资料配置
export { roadmapConfig } from "./roadmapConfig"; // 学习路线数据（R-PATH，本站新增）
// 布局配置
export { sidebarLayoutConfig } from "./sidebarConfig"; // 侧边栏布局配置
// 核心配置
export { siteConfig } from "./siteConfig"; // 站点基础配置
// P4-8（v1.47）：`sponsorConfig`（打赏，含上游作者 ko-fi / 爱发电 / 实名打赏名单）已整文件删除，
// 不再导出 —— 消费者 `src/pages/sponsor.astro` 与 `src/pages/posts/[...slug].astro` 里的
// 打赏按钮均已移除，`/sponsor/` 现在是**真 404**。
// ⚠️ `siteConfig.pages.sponsor`（= false）保留未动（属发起人自己的占位配置，且 siteConfig.ts 本轮禁改）。
