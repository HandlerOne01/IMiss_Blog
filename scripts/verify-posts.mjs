#!/usr/bin/env node
/**
 * verify-posts.mjs —— 内容与排行数据校验（阻断式），对应 R-CNT-06 / ARCH.md §9.4
 *
 * 用法：
 *   pnpm verify:posts               # 校验并打印结果（有错误时退出码 1）
 *   pnpm verify:posts -- --json     # 另外把结果写到 reports/verify-posts.json
 *   pnpm verify:posts -- --quarantine
 *                                   # 把"有错误"的文章移到 src/content/_quarantine/
 *                                   # （默认只报告不动文件；Astro 不构建 _quarantine）
 *
 * 检查项：
 *   [错误] frontmatter 可解析、title/category 非空、published 可解析、tags 是数组、draft 是布尔
 *   [错误] slug（相对路径去掉扩展名）唯一且 ASCII 小写
 *   [错误] 正文非空
 *   [错误] 正文里的本地图片路径真实存在（含 /images/posts/... 与相对路径）
 *   [错误] frontmatter.image 若非外链则文件存在
 *   [错误] rankConfig 每条榜单条目的 title 非空、cover 文件存在
 *   [警告] 正文没有任何标题（源笔记里确有这种纯列表的短笔记，见下方说明）
 *   [警告] 残留 Obsidian 语法：![[ ]]、[[ ]]、%%注释%%、^blockid
 *   [警告] 站内链接 /posts/... 指向的文章不存在（分批导入期间会出现）
 *   [警告] 标题重复
 *   [信息] draft: true 的篇目
 *
 * 与 ARCH §9.4 的差异：「正文至少有一个标题」从**报错**降级为**警告**。
 * 原因：源笔记 `AI应用/SDD.md` 全篇只有一条编号清单、没有任何标题，这是作者原本的写法，
 * 迁移脚本不该替它编一个标题；把它挡在构建外反而丢内容。
 *
 * 「外链不算本地图」与「先剥代码再找图片引用」这两条沿用模板自带
 * scripts/quarantine-bad-posts.mjs 的做法，规则保持一致。
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import matter from "gray-matter";

const POSTS_DIR = "src/content/posts";
const PUBLIC_DIR = "public";
const QUARANTINE_DIR = "src/content/_quarantine";
const RANK_CONFIG = "src/config/rankConfig.ts";
const REPORT = "reports/verify-posts.json";

const argv = process.argv.slice(2);
const wantJson = argv.includes("--json");
const wantQuarantine = argv.includes("--quarantine");

const errors = [];
const warnings = [];
const info = [];
const err = (file, message, line) => errors.push({ file, message, line });
const warn = (file, message, line) => warnings.push({ file, message, line });

/* ── 复用模板的判断：外链 vs 本地 ── */
const isExternalUrl = (url) => /^(https?:\/\/|\/\/|[\w+.-]+:)/i.test(url);

/** 剥掉代码（围栏 / 行内 / 缩进块），避免把示例代码里的图片语法当真引用 */
function stripCode(md) {
	const out = md
		.replace(/```[\s\S]*?```/g, "")
		.replace(/~~~[\s\S]*?~~~/g, "")
		.replace(/`[^`\n]+`/g, "");
	const lines = out.split("\n");
	const kept = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const indented = /^ {4,}|\t/.test(line);
		const prevBlank = i === 0 || lines[i - 1].trim() === "";
		if (indented && prevBlank) {
			while (i < lines.length && /^ {4,}|\t/.test(lines[i])) i++;
			continue;
		}
		kept.push(line);
		i++;
	}
	return kept.join("\n");
}

function walk(dir) {
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) return walk(p);
		return /\.mdx?$/i.test(e.name) ? [p] : [];
	});
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/* ── 逐篇检查 ── */

const titles = new Map();
const slugs = new Map();
const files = walk(POSTS_DIR);
const checked = [];

for (const file of files) {
	const rel = path.relative(POSTS_DIR, file).replace(/\\/g, "/");
	const slug = rel.replace(/\.mdx?$/i, "");
	checked.push(slug);

	// slug 唯一 + ASCII
	if (!/^[a-z0-9][a-z0-9/_-]*$/.test(slug)) {
		err(rel, `slug 不是 ASCII 小写：${slug}`);
	}
	if (slugs.has(slug)) err(rel, `slug 重复，与 ${slugs.get(slug)} 冲突`);
	else slugs.set(slug, rel);

	// frontmatter
	const raw = fs.readFileSync(file, "utf8");
	let data;
	let content;
	try {
		({ data, content } = matter(raw));
	} catch (e) {
		err(rel, `frontmatter 解析失败：${e.message}`);
		continue;
	}
	// 报行号时对齐到**文件**里的行：正文是从 frontmatter 之后开始的，
	// 直接用正文行号会少掉 frontmatter 那几行，实测对不上。
	// 推导：content 的最后一行就是文件的最后一行 → 文件行 = 正文行 + Δ，
	// 其中 Δ = (raw 行数 - content 行数) + content 开头被 trim 掉的空行数。
	const delta = raw.split("\n").length - content.split("\n").length;
	const lead = content.split("\n").findIndex((l) => l.trim() !== "");
	const bl = (text, index) => lineOf(text, index) + delta + Math.max(lead, 0);

	if (!data.title || typeof data.title !== "string") {
		err(rel, "frontmatter.title 缺失或不是字符串");
	} else {
		// 标题重复只在**同分类内**才算问题：`stl/vector.md` 与 `cpp/vector.md` 是两篇
		// 不同来源、不同语境的笔记，同名是正常的（跨分类比较会制造噪音）
		const key = `${data.category ?? ""}::${data.title}`;
		if (titles.has(key)) warn(rel, `同分类内标题与 ${titles.get(key)} 重复：${data.title}`);
		else titles.set(key, rel);
	}
	if (!data.category || typeof data.category !== "string") {
		err(rel, "frontmatter.category 缺失或不是字符串");
	}
	const published = data.published;
	const publishedOk =
		published instanceof Date
			? !Number.isNaN(published.getTime())
			: Boolean(published) && !Number.isNaN(new Date(published).getTime());
	if (!publishedOk) err(rel, `frontmatter.published 无法解析为日期：${String(published)}`);
	if (data.tags !== undefined && !Array.isArray(data.tags)) {
		err(rel, "frontmatter.tags 不是数组");
	} else if (Array.isArray(data.tags)) {
		if (data.tags.some((t) => typeof t !== "string" || !t.trim())) {
			err(rel, "frontmatter.tags 里有空值");
		}
		if (data.tags.length > 8) warn(rel, `标签数量偏多（${data.tags.length} > 8）`);
	}
	if (data.draft !== undefined && typeof data.draft !== "boolean") {
		err(rel, "frontmatter.draft 不是布尔");
	}
	if (data.draft === true) info.push({ file: rel, message: "draft: true（不上线）" });

	// 正文
	const body = content.trim();
	if (!body) err(rel, "正文为空");
	// 「至少一个标题」只报警告：`AI应用/SDD.md` 全篇是一条编号清单、没有标题，
	// 那是作者原本的写法，不该被挡在构建外（见文件头说明）
	if (!/^#{1,6}\s+\S/m.test(body)) warn(rel, "正文没有任何标题（# ~ ######）");

	// frontmatter.image
	if (
		typeof data.image === "string" &&
		data.image &&
		data.image !== "api" &&
		!isExternalUrl(data.image)
	) {
		const abs = data.image.startsWith("/")
			? path.join(PUBLIC_DIR, data.image)
			: path.resolve(path.dirname(file), data.image);
		if (!fs.existsSync(abs)) err(rel, `frontmatter.image 指向的文件不存在：${data.image}`);
	}

	const code = stripCode(body);

	// 本地图片
	const imageRefs = [];
	for (const m of code.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)/g)) {
		imageRefs.push({ src: m[1], index: m.index });
	}
	for (const m of code.matchAll(/<img\b[^>]*src\s*=\s*["']([^"']+)["']/gi)) {
		imageRefs.push({ src: m[1], index: m.index });
	}
	for (const { src, index } of imageRefs) {
		if (isExternalUrl(src)) continue;
		const abs = src.startsWith("/")
			? path.join(PUBLIC_DIR, decodeURIComponent(src))
			: path.resolve(path.dirname(file), decodeURIComponent(src));
		if (!fs.existsSync(abs)) {
			err(rel, `图片不存在：${src}`, bl(body, index));
		} else if (fs.statSync(abs).size === 0) {
			err(rel, `图片是 0 字节：${src}`, bl(body, index));
		}
	}

	// 站内链接
	for (const m of code.matchAll(/\]\((\/posts\/[^)\s]*)\)/g)) {
		const target = m[1].replace(/^\/posts\//, "").replace(/\/$/, "");
		const cands = [
			path.join(POSTS_DIR, `${target}.md`),
			path.join(POSTS_DIR, `${target}.mdx`),
			path.join(POSTS_DIR, target, "index.md"),
		];
		if (!cands.some((p) => fs.existsSync(p))) {
			warn(rel, `站内链接目标不存在（可能还没导入）：${m[1]}`, bl(body, m.index));
		}
	}

	// 残留 Obsidian 语法
	// 例外：`guide/**` 是上游主题自带的示例页（P4-8 会整体替换），里面本来就
	// 刻意写着 `[[双链]]`、`![[图片]]` 当语法演示，不是迁移残留
	const SKIP_RESIDUE = /^guide\//;
	if (!SKIP_RESIDUE.test(rel)) {
		const residue = [
			[/!\[\[/g, "![[ ]] 图片嵌入"],
			[/(?<!!)\[\[/g, "[[ ]] 双链"],
			[/%%/g, "%% 注释"],
			[/\s\^[0-9a-zA-Z]{4,}\s*$/gm, "^blockid 块引用"],
		];
		for (const [re, label] of residue) {
			for (const m of code.matchAll(re)) {
				warn(
					rel,
					`残留 Obsidian 语法（${label}）：${m[0].trim().slice(0, 40)}`,
					bl(body, m.index),
				);
			}
		}
	}
}

/* ── rankConfig：title 非空 / cover 存在 ── */

if (fs.existsSync(RANK_CONFIG)) {
	// 先剥掉 TS 注释：文件头的用法说明里就写着 `cover: "assets/images/rank/你的图.webp"`
	// 这种示例（实测踩过，会把示例当成真配图报错）
	const src = fs
		.readFileSync(RANK_CONFIG, "utf8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.split("\n")
		.map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"))
		.join("\n");
	const entries = [...src.matchAll(/title:\s*"([^"]*)"/g)];
	const covers = [...src.matchAll(/cover:\s*"([^"]*)"/g)];
	if (entries.length === 0) err(RANK_CONFIG, "没解析到任何 title（rankConfig 结构变了？）");
	for (const m of entries) {
		if (!m[1].trim()) err(RANK_CONFIG, `榜单条目 title 为空（第 ${lineOf(src, m.index)} 行）`);
	}
	for (const m of covers) {
		const value = m[1];
		if (!value || isExternalUrl(value)) continue;
		const abs = value.startsWith("/") ? path.join(PUBLIC_DIR, value) : path.join("src", value);
		if (!fs.existsSync(abs)) {
			err(RANK_CONFIG, `榜单配图不存在：${value}（第 ${lineOf(src, m.index)} 行）`);
		}
	}
} else {
	warn(RANK_CONFIG, "找不到 rankConfig.ts，跳过榜单数据校验");
}

/* ── 隔离（可选） ── */

let quarantined = 0;
if (wantQuarantine) {
	const badFiles = [...new Set(errors.map((e) => e.file))].filter((f) =>
		fs.existsSync(path.join(POSTS_DIR, f)),
	);
	for (const f of badFiles) {
		const target = path.resolve(QUARANTINE_DIR, f);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.renameSync(path.join(POSTS_DIR, f), target);
		console.log(`🚫 已隔离：${f} → ${path.relative(process.cwd(), target)}`);
		quarantined++;
	}
}

/* ── 输出 ── */

const group = (list, title, icon) => {
	if (list.length === 0) return;
	console.log(`\n${icon} ${title}（${list.length}）`);
	for (const x of list) {
		console.log(`  ${x.file}${x.line ? `:${x.line}` : ""}  ${x.message}`);
	}
};

console.log(`verify:posts —— 检查 ${files.length} 篇文章 + 榜单配置`);
group(errors, "错误", "❌");
group(warnings, "警告", "⚠️");
if (info.length) {
	console.log(`\nℹ️ 草稿（${info.length}）`);
	for (const x of info) console.log(`  ${x.file}  ${x.message}`);
}

if (wantJson) {
	fs.mkdirSync(path.dirname(REPORT), { recursive: true });
	fs.writeFileSync(
		REPORT,
		JSON.stringify({ checked: files.length, slugs: checked, errors, warnings, info }, null, "\t"),
		"utf8",
	);
	console.log(`\n报告：${REPORT}`);
}

if (errors.length > 0) {
	console.log(
		`\n❌ verify:posts 失败：${errors.length} 个错误、${warnings.length} 个警告` +
			(wantQuarantine
				? `（已隔离 ${quarantined} 篇）`
				: "（加 --quarantine 可把出错文章移出构建）"),
	);
	process.exit(1);
}
console.log(
	`\n✅ verify:posts 通过：${files.length} 篇 0 错误、${warnings.length} 个警告` +
		(wantQuarantine ? `（隔离 ${quarantined} 篇）` : ""),
);
