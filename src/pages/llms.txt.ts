import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { getSortedPosts } from "@utils/content-utils";
import { url } from "@utils/url-utils";
import type { APIRoute } from "astro";
import { siteConfig } from "@/config";

export const prerender = true;

const RECENT_POSTS_COUNT = 20;

type KeyPage = {
	/** i18n 标签（与 label 二选一） */
	labelKey?: I18nKey;
	/** 直接写字面量标签（本站新增的页面没有对应 i18n key 时用） */
	label?: string;
	path: string;
	descKey?: I18nKey;
	desc?: string;
	pageKey?: keyof typeof siteConfig.pages;
};

// 主要页面：首页 / 归档 / 关于始终包含；其余按 siteConfig.pages 开关过滤
const KEY_PAGES: KeyPage[] = [
	{ labelKey: I18nKey.home, path: "/" },
	{ labelKey: I18nKey.archive, path: "/archive/" },
	{ labelKey: I18nKey.about, path: "/about/" },
	// P4-8（v1.47）：`/friends/` 与 `/sponsor/` 两个条目已删除 —— 两个页面的源文件都没了
	// （真 404），留着 `pageKey: "friends" / "sponsor"` 只是引用两个已经不存在的路由。
	// v1.83：`/guestbook/` 同理删除（留言功能整体移除，页面与 spec 内容都已删 → 真 404），
	// 所以这里连 `pageKey: "guestbook"` 一起拿掉，不再对外声明这一页存在。
	{
		labelKey: I18nKey.dynamic,
		path: "/dynamic/",
		descKey: I18nKey.dynamicDescription,
		pageKey: "dynamic",
	},
	{
		labelKey: I18nKey.projects,
		path: "/projects/",
		descKey: I18nKey.projectsDescription,
		pageKey: "projects",
	},
	{
		labelKey: I18nKey.gallery,
		path: "/gallery/",
		descKey: I18nKey.galleryDescription,
		pageKey: "gallery",
	},
	{
		labelKey: I18nKey.booknav,
		path: "/booknav/",
		descKey: I18nKey.booknavDescription,
		pageKey: "booknav",
	},
	{
		labelKey: I18nKey.bilibili,
		path: "/bilibili/",
		descKey: I18nKey.bilibiliSubtitle,
		pageKey: "bilibili",
	},
	{
		labelKey: I18nKey.bangumi,
		path: "/bangumi/",
		descKey: I18nKey.bangumiSubtitle,
		pageKey: "bangumi",
	},
	{
		labelKey: I18nKey.vndb,
		path: "/vndb/",
		descKey: I18nKey.vndbSubtitle,
		pageKey: "vndb",
	},
	{
		labelKey: I18nKey.mal,
		path: "/myanimelist/",
		descKey: I18nKey.malSubtitle,
		pageKey: "mal",
	},
	// P4-8（v1.47）：`/sponsor/` 条目已删除（打赏整条移除，页面文件也没了）。
	// 学习路线（本站新增，没有对应 i18n key）：排行模块随 P2R 删除后，这一页顶上它原来的位置
	// （v1.41：`/rank/{jp,cn,game}/` 与它们的 llms.txt 条目一并移除，`/rank/*` 不做 301）。
	{ label: "学习路线", path: "/roadmap/", desc: "8 条主线把全站笔记串成一条学习路径（数据全部来自站内文章）" },
];

export const GET: APIRoute = async ({ site }) => {
	const base = site ?? new URL(siteConfig.site_url);
	const abs = (path: string) => new URL(url(path), base).href;

	const enabledPages = KEY_PAGES.filter(
		(pageEntry) => !pageEntry.pageKey || siteConfig.pages[pageEntry.pageKey],
	);
	const posts = await getSortedPosts();
	const recentPosts = posts.slice(0, RECENT_POSTS_COUNT);

	const lines: string[] = [
		`# ${siteConfig.title}`,
		`> ${siteConfig.description || siteConfig.subtitle || ""}`,
		"",
		"## Key Pages",
	];
	for (const pageEntry of enabledPages) {
		const label = pageEntry.label ?? (pageEntry.labelKey ? i18n(pageEntry.labelKey) : pageEntry.path);
		const link = abs(pageEntry.path);
		const desc = pageEntry.desc ?? (pageEntry.descKey ? i18n(pageEntry.descKey) : "");
		lines.push(
			desc ? `- [${label}](${link}): ${desc}` : `- [${label}](${link})`,
		);
	}
	lines.push("", "## Recent Posts");
	for (const post of recentPosts) {
		const link = abs(url(`/posts/${post.id}/`));
		const desc = post.data.description || "";
		lines.push(
			desc
				? `- [${post.data.title}](${link}): ${desc}`
				: `- [${post.data.title}](${link})`,
		);
	}

	const body = `${lines.join("\n")}\n`;
	// 前置 UTF-8 BOM：静态托管或 Windows 编辑器对无 BOM 的 .txt 默认按本地编码(ANSI/GBK)解码，
	// BOM 使浏览器与编辑器都能稳定识别为 UTF-8，避免中文乱码。
	return new Response(`﻿${body}`, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
};
