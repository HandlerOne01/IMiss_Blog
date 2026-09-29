import I18nKey from "@/i18n/i18nKey";
import { i18n } from "@/i18n/translation";
import type { NavBarLink } from "@/types/navBarConfig";

// 导航栏菜单名称的 i18n 解析
// 思路：把「默认菜单名」映射到对应的 i18n key。
// 渲染时若 name 未被用户修改（仍等于默认值），就用 i18n 翻译；
// 若用户改了 name（不再是默认值），映射不命中，保留自定义名称。
// VNDB / AnimeList 等品牌名各语言一致，不放入映射，保持原名。
//
// P4-8 收尾轮（v1.48）：`友链` / `打赏` 两条映射已删除 —— 它们的消费者（导航项与页面）
// 在 v1.47 已整条移除，映射不再可达（删前全仓库 grep 确认零引用；i18n key 本身仍留在
// `src/i18n/**` 里未动）。这里只删"名字 → key"的查表项，不动任何语言的文案。

const NAVBAR_DEFAULT_NAMES: Record<string, I18nKey> = {
	// 分组
	文章: I18nKey.navArticles,
	社交: I18nKey.navSocial,
	我的: I18nKey.navMine,
	关于: I18nKey.navAbout,
	链接: I18nKey.navLinks,
	// 页面
	主页: I18nKey.home,
	归档: I18nKey.archive,
	分类: I18nKey.categories,
	标签: I18nKey.tags,
	系列: I18nKey.series,
	留言: I18nKey.guestbook,
	动态: I18nKey.dynamic,
	项目: I18nKey.projects,
	相册: I18nKey.gallery,
	书签导航: I18nKey.booknav,
	哔哩哔哩: I18nKey.bilibili,
	番组计划: I18nKey.bangumi,
	关于我: I18nKey.about,
};

export function resolveNavbarName(name: string): string {
	const key = NAVBAR_DEFAULT_NAMES[name];
	return key ? i18n(key) : name;
}

export function resolveNavbarLinks(links: NavBarLink[]): NavBarLink[] {
	return links.map((link) => {
		const resolved: NavBarLink = {
			...link,
			name: resolveNavbarName(link.name),
		};
		if (link.children) {
			resolved.children = resolveNavbarLinks(link.children);
		}
		return resolved;
	});
}
