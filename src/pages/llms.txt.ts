import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { getSortedPosts } from "@utils/content-utils";
import { url } from "@utils/url-utils";
import type { APIRoute } from "astro";
import { rankConfig, siteConfig } from "@/config";

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
	{
		labelKey: I18nKey.friends,
		path: "/friends/",
		descKey: I18nKey.friendsDescription,
		pageKey: "friends",
	},
	{
		labelKey: I18nKey.guestbook,
		path: "/guestbook/",
		descKey: I18nKey.guestbookDescription,
		pageKey: "guestbook",
	},
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
	{
		labelKey: I18nKey.sponsor,
		path: "/sponsor/",
		descKey: I18nKey.sponsorDescription,
		pageKey: "sponsor",
	},
	// 排行榜（本站新增，没有对应 i18n key）：
	// 直接从 rankConfig 生成，榜单改名/加榜时这里自动跟着变。
	// 站点简介里就写着"定期更新的番剧排行榜"，AI 抓取入口却不提这两个页面说不过去（P2 审查提出）。
	...Object.values(rankConfig.boards).map(
		(board): KeyPage => ({
			label: board.title,
			path: `/rank/${board.id}/`,
			desc: board.description,
		}),
	),
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
