#!/usr/bin/env node
/**
 * import-posts.mjs —— P4 内容迁移：把 Obsidian 笔记（dosc/blog）转成站点文章
 *
 * 对应需求 R-CNT-01 / R-CNT-02 / R-CNT-03 / R-CNT-05 / R-CNT-07，见 ARCH.md §9。
 *
 * 与 ARCH §9.2 的差异（依据 2026-09-24 的实测清点，报告见 reports/_p4-census.json）：
 *   1. 图片**不是**"只能顺序映射"。实测 258 条本地引用里，116 条能在本文章的图片
 *      目录里按同名精确命中，4 条能在全库唯一同名命中，只有 2 条（八股那批老图）
 *      是真的没有文件。所以本脚本**只做名字精确匹配，不做顺序猜测**——猜错位置比
 *      缺图更糟（发起人明确要求"图片位置正确"）。
 *   2. `title` 取**文件名**而不是首个 H1：实测 `stL/Stack.md` 的首个 H1 是"核心概念"
 *      （那是小节标题），`基础算法/前缀和.md` 的首个 H1 是"一维前缀和"。H1 只在
 *      与文件名规范化后相同（重复标题）时才从正文里删掉。
 *   3. `tags` 优先用作者自己在文首写的 Obsidian 标签行（如 `#预处理 #前缀 #基础算法`），
 *      不够再补分类名；不再靠关键词白名单硬凑。
 *   4. 源目录里 `图片/linux` 与 `图片/linux系统` 是同一批图（36 个同名文件大小完全一致），
 *      解析时合并成一个池；`图片/linux/POSIX….md` 是误入的散篇，直接忽略。
 *   5. `![[ ]]` 实测全部是图片（0 条笔记嵌入）；`[[ ]]` 双链按标题索引改写成站内链接，
 *      解析不到的原样保留（正文里 `[[1,0]]` 这类数组字面量是假双链，不能乱删）。
 *
 * 用法：
 *   node scripts/import-posts.mjs                      # 全量 dry-run（只出报告）
 *   node scripts/import-posts.mjs --batch 1            # 批次 1 dry-run
 *   node scripts/import-posts.mjs --batch 1 --write    # 批次 1 落盘
 *   node scripts/import-posts.mjs --cat Linux系统 --write
 *   node scripts/import-posts.mjs --only 缓冲区 --write
 * 参数：
 *   --write            落盘（默认只报告）
 *   --batch <n|all>    批次（见 BATCHES；默认 all）
 *   --cat <名字>       只处理某个源分类目录
 *   --only <子串>      只处理路径含该子串的文章（可重复）
 *   --limit <n>        最多处理 n 篇
 *   --src <路径>       源目录（默认 my_-blog 的 dosc/blog）
 *   --quiet            不逐篇打印
 */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pinyin } from "pinyin-pro";

/* ─────────────────────────── 配置 ─────────────────────────── */

const DEFAULT_SRC =
	"D:/HuaweiMoveData/Users/HUAWEI/Desktop/my_-blog/dosc/blog";
const CONTENT_ROOT = "src/content/posts";
const IMAGE_ROOT = "public/images/posts";
const REPORT_PATH = "reports/import-report.json";

/** 源一级目录 → { category: 展示名, dir: 站内目录名 } */
const CATEGORY_MAP = {
	AI应用: { category: "AI 应用", dir: "ai" },
	"C++11": { category: "C++11", dir: "cpp11" },
	"C与C++": { category: "C/C++", dir: "cpp" },
	Linux系统: { category: "Linux 系统", dir: "linux" },
	linux网络: { category: "Linux 网络", dir: "linux-net" },
	MySQL: { category: "MySQL", dir: "mysql" },
	stL: { category: "STL", dir: "stl" },
	八股: { category: "八股文", dir: "interview" },
	基础算法: { category: "算法", dir: "algorithm" },
	项目: { category: "项目实战", dir: "project" },
};

/** 项目类文章的子目录 → series 名（用于「系列」页） */
const SERIES_MAP = {
	"项目/My_Server": "My_Server",
	"项目/搜索引擎": "搜索引擎",
};

/** 源目录里的图片一级目录 → 站内分类的别名（用于挑图片池时优先同分类） */
const IMG_TOP_ALIAS = {
	AI应用: ["ai应用", "ai"],
	"C++11": ["cpp11"],
	"C与C++": ["cpp"],
	Linux系统: ["linux系统", "linux"],
	linux网络: ["linux网络"],
	MySQL: ["mysql"],
	stL: ["stl"],
	八股: ["八股"],
	基础算法: ["算法错题本", "算法"],
	项目: ["项目"],
};

/** 需要合并成一个图片池的一级目录（实测同名文件大小完全一致） */
const MERGED_IMG_TOPS = [["linux系统", "linux"]];

/** 标题覆盖（源文件里只有 README 这种没有信息量的名字） */
const TITLE_OVERRIDES = {
	"八股/README.md": "八股文面试总结 · 写在前面",
};

/** 图片池匹配覆盖（规范化后仍对不上的，写死并留痕） */
const POOL_OVERRIDES = {
	"C++11/右值引用与移动语义.md": "右值引用移动语义",
};

/** 不算 Obsidian 标签的 C 预处理指令 */
const CPP_DIRECTIVES = new Set([
	"include",
	"define",
	"ifdef",
	"ifndef",
	"endif",
	"pragma",
	"undef",
	"elif",
	"error",
	"line",
	"if",
	"else",
	"region",
	"endregion",
]);

/** 批次划分（ARCH §9.3） */
const BATCHES = {
	1: [
		"AI应用/SDD.md",
		"C++11/类的新功能与STL容器变化.md",
		"C++11/可变参数模板与emplace系列.md",
		"C与C++/数据在内存中存储.md",
		"C与C++/红黑树封装实现mymap和myset.md",
		"Linux系统/Git.md",
		"Linux系统/缓冲区.md",
		"linux网络/TCP网络通信流程.md",
		"linux网络/HTTP 协议.md",
		"MySQL/MySQL常用命令.md",
		"MySQL/数据库基础与 MySQL.md",
		"stL/Stack.md",
		"stL/Queue.md",
		"八股/设计模式.md",
		"基础算法/差分.md",
		"基础算法/最小生成树.md",
		"项目/My_Server/HTTP.md",
		"项目/My_Server/My_server框架全流程梳理.md",
	],
	2: { cats: ["C++11", "C与C++", "stL"] },
	3: { cats: ["Linux系统", "linux网络", "MySQL"] },
	4: { cats: ["基础算法", "AI应用"] },
	5: { cats: ["八股", "项目"] },
};

/* ─────────────────────────── 小工具 ─────────────────────────── */

/** 规范化：NFKC + 去掉空格/标点/连接词 + 小写（用于标题、目录名、文件名比对） */
const norm = (s) =>
	s
		.normalize("NFKC")
		.replace(/C\+\+/gi, "cpp")
		.replace(
			/[\s_·・,，。.、:：;；!！?？'"“”‘’()（）[\]【】<>《》+\-—/\\|]/g,
			"",
		)
		.toLowerCase();

/**
 * 图片文件名归一（精确键）：NFKC + 去首尾空白 + 小写。
 * ⚠️ 这里**绝不能**顺手把"空格+数字"都剥掉：源图里有
 * `Pasted image 20260509141005.png`，把数字当 Obsidian 的重名后缀剥掉会让
 * 同一篇的 6 张图全部撞成一个键（实测踩过，6 张只搬了 1 张）。
 * 重名后缀只在精确匹配失败后作为**退路**尝试，见 stripCopySuffix。
 */
const nameKey = (name) => name.normalize("NFKC").trim().toLowerCase();

/** Obsidian 遇到重名会加 " 1" / " 2" 后缀；只吃 1~2 位数字，避免吃掉时间戳 */
const stripCopySuffix = (key) =>
	key.replace(/\s+\d{1,2}(?=\.[a-z0-9]+$)/i, "");

/** 在一篇文章的图片池 + 全库索引里找一张图 */
function lookupImage(pool, global, name) {
	const k = nameKey(name);
	const sk = stripCopySuffix(k);
	if (pool) {
		if (pool.has(k)) return { abs: pool.get(k), how: "目录同名" };
		if (sk !== k && pool.has(sk))
			return { abs: pool.get(sk), how: "目录同名（去重名后缀）" };
	}
	const g1 = global.get(k) ?? [];
	if (g1.length === 1) return { abs: g1[0], how: "全库唯一同名" };
	const g2 = sk !== k ? (global.get(sk) ?? []) : [];
	if (g2.length === 1) return { abs: g2[0], how: "全库唯一同名（去重名后缀）" };
	return null;
}

const isRemote = (src) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(src) || src.startsWith("data:");
const isImageName = (s) => /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(s);

/** 本地时间 → "YYYY-MM-DD HH:mm:ss" */
function fmtDate(d) {
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 标题 → ASCII slug（pinyin-pro；C++ → cpp） */
function slugify(title) {
	const pre = title
		.normalize("NFKC")
		.replace(/C\+\+/gi, "cpp")
		.replace(/C#/gi, "csharp")
		.replace(/\.NET/gi, "dotnet");
	const runs =
		pre.match(/[A-Za-z0-9]+|[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g) ??
		[];
	const parts = [];
	for (const run of runs) {
		if (/^[A-Za-z0-9]+$/.test(run)) {
			parts.push(run.toLowerCase());
			continue;
		}
		const arr = pinyin(run, { toneType: "none", type: "array" });
		const joined = arr
			.join("")
			.normalize("NFKD")
			.replace(/[^A-Za-z0-9]/g, "")
			.toLowerCase();
		if (joined) parts.push(joined);
	}
	let slug = parts
		.join("-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	if (slug.length > 60) slug = slug.slice(0, 60).replace(/-[^-]*$/, "");
	if (!slug) slug = `post-${createHash("sha1").update(title).digest("hex").slice(0, 8)}`;
	return slug;
}

/**
 * 标出代码区域（围栏 + 行内），这些地方不解析图片/双链/标签。
 * 返回 [start, end) 区间数组。
 */
function codeRanges(text) {
	const dead = [];
	const lines = text.split("\n");
	let inFence = null;
	let offset = 0;
	for (const line of lines) {
		// 围栏允许任意缩进：源笔记里大量代码块嵌在列表项里（缩进 4 空格），
		// 按 CommonMark 的 0~3 空格判会漏掉，代码里的 #include / ![] 就会被误判（实测踩过）
		const m = /^\s*(`{3,}|~{3,})/.exec(line);
		if (m) {
			if (!inFence) {
				inFence = { start: offset, marker: m[1][0], len: m[1].length };
			} else if (m[1][0] === inFence.marker && m[1].length >= inFence.len) {
				dead.push([inFence.start, offset + line.length]);
				inFence = null;
			}
		}
		offset += line.length + 1;
	}
	if (inFence) dead.push([inFence.start, text.length]);
	const inDead = (i) => dead.some(([a, b]) => i >= a && i < b);
	for (const m of text.matchAll(/`+[^`\n]*`+/g)) {
		if (!inDead(m.index)) dead.push([m.index, m.index + m[0].length]);
	}
	return dead;
}

const makeIsLive = (ranges) => {
	const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
	return (i) => {
		for (const [a, b] of sorted) {
			if (i < a) return true;
			if (i >= a && i < b) return false;
		}
		return true;
	};
};

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/* ─────────────────────── 源目录读取 ─────────────────────── */

async function listFiles(dir, out = []) {
	let entries;
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) await listFiles(p, out);
		else out.push(p);
	}
	return out;
}

/**
 * 建立图片索引：
 *  - byArticle: 规范化文章目录名 → Map<fileKey, 绝对路径>（linux/linux系统 已合并）
 *  - global:    文件名小写 → 绝对路径数组（跨目录唯一命中用）
 *  - pools:     原始池清单（报告用）
 */
async function buildImageIndex(src) {
	const imgRoot = path.join(src, "图片");
	const byArticle = new Map();
	const global = new Map();
	const pools = [];
	const files = await listFiles(imgRoot);

	// 合并表：一级目录 → 归并后的一级名
	const mergeTo = new Map();
	for (const group of MERGED_IMG_TOPS) {
		for (const top of group) mergeTo.set(top, group[0]);
	}

	for (const abs of files) {
		const rel = path.relative(imgRoot, abs).replace(/\\/g, "/");
		const segs = rel.split("/");
		if (segs.length < 2) continue; // 图片根下的散文件，不属于任何文章
		const [top, ...rest] = segs;
		const name = rest.at(-1);
		const articleRaw = rest.slice(0, -1).join("/");
		// 顶层直接放文件（如 算法错题本/xx.jpg）时，文章名就是目录名
		const article = articleRaw || top;
		const articleNorm = norm(article);
		if (!byArticle.has(articleNorm)) byArticle.set(articleNorm, new Map());
		const pool = byArticle.get(articleNorm);
		// 合并组：同名文件以 mergeTo 指定的那个一级目录为准（优先 linux系统）
		const prio = mergeTo.get(top) === top ? 0 : 1;
		const exist = pool.get(nameKey(name));
		if (!exist || prio < exist.prio) {
			pool.set(nameKey(name), { abs, top, prio, rel: `${top}/${rest.join("/")}` });
		}
		const gk = nameKey(name);
		if (!global.has(gk)) global.set(gk, []);
		global.get(gk).push(abs);
		pools.push({ top, article, rel: `${top}/${rest.join("/")}` });
	}

	// 去掉 prio 字段，统一成 abs
	const clean = new Map();
	for (const [k, pool] of byArticle) {
		const m = new Map();
		for (const [fk, v] of pool) m.set(fk, v.abs);
		clean.set(k, m);
	}
	return { byArticle: clean, global, pools };
}

/* ─────────────────────── 引用解析 ─────────────────────── */

/**
 * 抽出正文里的图片引用（按出现顺序，已排除代码区）。
 * kind: wiki(![[]]) / html(<img>) / md(![]())
 */
function extractImageRefs(text) {
	const live = makeIsLive(codeRanges(text));
	const found = [];

	for (const m of text.matchAll(/!\[\[([^[\]\n]+)\]\]/g)) {
		if (!live(m.index)) continue;
		const [name, alias] = m[1].split("|");
		found.push({
			kind: "wiki",
			start: m.index,
			end: m.index + m[0].length,
			raw: m[1],
			name: name.split("#")[0].trim(),
			alias: alias?.trim() ?? "",
			line: lineOf(text, m.index),
		});
	}

	for (const m of text.matchAll(/<img\b[^>]*>/gi)) {
		if (!live(m.index)) continue;
		const src = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(m[0]);
		if (!src) continue;
		const attrIndex = m.index + src.index + src[0].indexOf(src[2]);
		found.push({
			kind: "html",
			start: m.index,
			end: m.index + m[0].length,
			raw: m[0],
			srcValue: src[2],
			srcStart: attrIndex,
			srcEnd: attrIndex + src[2].length,
			name: decodeURIComponent(src[2]).replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? "",
			alt: /\balt\s*=\s*(["'])(.*?)\1/i.exec(m[0])?.[2] ?? "",
			line: lineOf(text, m.index),
		});
	}

	for (const m of text.matchAll(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g)) {
		if (!live(m.index)) continue;
		found.push({
			kind: "md",
			start: m.index,
			end: m.index + m[0].length,
			raw: m[0],
			srcValue: m[2],
			name: decodeURIComponent(m[2]).replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? "",
			alt: m[1],
			line: lineOf(text, m.index),
		});
	}

	return found.sort((a, b) => a.start - b.start);
}

/** 为一篇文章挑图片池：先同名精确，再包含关系（限定同分类），都不行返回 null */
function pickPool(rel, title, index, cat) {
	const override = POOL_OVERRIDES[rel];
	const keys = [...index.byArticle.keys()];
	const tries = [];
	if (override) tries.push(norm(override));
	const t = norm(title);
	tries.push(t);

	for (const key of tries) {
		if (index.byArticle.has(key)) {
			return { key, how: override ? "指定" : "同名", pool: index.byArticle.get(key) };
		}
	}

	// 包含关系：标题与目录名互为包含（去连接词后），要求同分类别名
	const alias = IMG_TOP_ALIAS[cat] ?? [];
	const scored = [];
	for (const key of keys) {
		if (key.length < 3 || t.length < 3) continue;
		if (!key.includes(t) && !t.includes(key)) continue;
		const pool = index.byArticle.get(key);
		const tops = new Set();
		for (const abs of pool.values())
			tops.add(path.relative(path.join(SRC, "图片"), abs).split(path.sep)[0].toLowerCase());
		const sameCat = [...tops].some((x) => alias.includes(x));
		scored.push({ key, pool, sameCat, delta: Math.abs(key.length - t.length) });
	}
	if (scored.length === 0) return null;
	scored.sort((a, b) => Number(b.sameCat) - Number(a.sameCat) || a.delta - b.delta);
	const best = scored[0];
	return { key: best.key, how: best.sameCat ? "包含(同分类)" : "包含(跨分类)", pool: best.pool };
}

/* ─────────────────────── 正文改写 ─────────────────────── */

/** Obsidian 标签行：#a #b（# 后不跟空格 → CommonMark 里不是标题） */
const TAG_LINE = /^(?:\s*#[^\s#|]+\s*)+$/;

function splitTags(text) {
	const lines = text.split("\n");
	const tags = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (line.trim() === "") {
			i++;
			continue;
		}
		if (!TAG_LINE.test(line)) break;
		const found = [...line.matchAll(/#([^\s#|]+)/g)].map((m) => m[1]);
		// 全是 C 预处理指令时不是标签行（例如正文里孤零零一行 #include）
		if (found.length === 0 || found.every((t) => CPP_DIRECTIVES.has(t.toLowerCase()))) break;
		tags.push(...found);
		i++;
	}
	return { tags, bodyStart: i };
}

/** 正文里（非代码、非标题行、非 URL）的 Obsidian 行内标签（带位置，用于从正文里摘掉） */
function inlineTags(text, dead) {
	const live = makeIsLive(dead);
	const out = [];
	for (const m of text.matchAll(/(^|[\s(（>])#([^\s#|]+)/gu)) {
		const at = m.index + m[1].length;
		if (!live(at)) continue;
		const lineStart = text.lastIndexOf("\n", at) + 1;
		const lineHead = text.slice(lineStart, at);
		if (/^\s{0,3}#{1,6}\s*$/.test(lineHead)) continue; // 标题行
		if (text.slice(Math.max(0, at - 3), at).includes("://")) continue;
		const tag = m[2].replace(/[.,;:!?，。；：！？)）\]]+$/, "");
		if (!tag || /^\d+$/.test(tag)) continue;
		if (CPP_DIRECTIVES.has(tag.toLowerCase())) continue;
		out.push({ tag, start: at, end: at + 1 + tag.length });
	}
	return out;
}

/**
 * ⚠️ 不做 `==高亮==` → `<mark>` 的全局替换（实测踩过）：
 * 本站语料里 `==` 全是 C++ 相等比较（`dist[t]==INF`、`cnt==n-1`），
 * 去掉代码区后全库只有 1 处 `==x==`，而它正是表格行里被两个 `==` 夹住的普通文字。
 * 全局替换会把它连同行尾一起吞成 `<mark>`，把表格改坏。原样保留才是对的。
 */

/* ─────────────────────── frontmatter ─────────────────────── */

/**
 * 空白整理（**必须避开代码块**）：
 *   · 代码块外：去掉行尾空白、把连续空行压成一个
 *   · 代码块内：一字不动
 * 为什么较真：第一版对全文 `[ \t]+$` 直接替换，把 5 篇里 100 处代码行的
 * 行尾空白剥掉了（`"    "` → `""`）——独立复核逐块比对时抓到的。
 * 代码块的语义不受影响，但"迁移"不该改代码，所以改成围栏感知。
 */
function tidyWhitespace(body) {
	const lines = body.split("\n");
	const out = [];
	let inFence = false;
	for (const line of lines) {
		if (/^\s*(?:`{3,}|~{3,})/.test(line)) {
			inFence = !inFence;
			out.push(line);
			continue;
		}
		if (inFence) {
			out.push(line);
			continue;
		}
		const trimmed = line.replace(/[ \t]+$/, "");
		if (trimmed === "" && out.length > 0 && out[out.length - 1] === "") continue;
		out.push(trimmed);
	}
	return out.join("\n");
}

/**
 * 相邻两行都是"独占一行的图片"时补一个空行。
 * 原因：`![](a)` 换行 `![](b)` 在 CommonMark 里是**同一个段落**里的两张行内图，
 * 渲染出来会挤在同一行并排；隔成两个段落才是一行一张（Obsidian 是按块渲染的）。
 * 同样要避开代码块。
 */
function separateAdjacentImages(body) {
	const IMG_LINE = /^\s*(?:!\[[^\]]*\]\([^)\s]+\)|<img\b[^>]*>)\s*$/i;
	const lines = body.split("\n");
	const out = [];
	let inFence = false;
	for (let i = 0; i < lines.length; i++) {
		if (/^\s*(?:`{3,}|~{3,})/.test(lines[i])) inFence = !inFence;
		out.push(lines[i]);
		const next = lines[i + 1];
		if (
			!inFence &&
			next !== undefined &&
			IMG_LINE.test(lines[i]) &&
			IMG_LINE.test(next)
		) {
			out.push("");
		}
	}
	return out.join("\n");
}

/**
 * 摘要：找正文里第一个"像句子"的段落（找不到就退到第一条列表项）。
 * 两处坑（都是实测踩过的）：
 *  1. 必须跟踪围栏代码块。只判断"这一行像不像块级语法"是不够的——
 *     代码块**内部**的行既不像标题也不像列表，会被当成普通段落，摘要就变
 *     `stack st1; // 默认使用deque…`、`mysql -u root -p` 这种代码片段。
 *  2. 必须按**行**扫而不是按空行分段：源笔记里常见 `红黑树\n1. 源码及框架分析`
 *     这种"短标题行 + 列表"的组合，按空行分段会拼成半截摘要。
 */
function firstParagraph(body) {
	const FENCE = /^\s*(?:`{3,}|~{3,})/;
	const isBlockStart = (line) =>
		/^\s{0,3}#{1,6}\s/.test(line) ||
		/^\s*(?:!\[|<img|<\/?figure|<\/?p\b|\||```|~~~|>|<hr|\$\$|\\\[)/i.test(line) ||
		/^\s*@import/i.test(line);

	const lines = [];
	let inFence = false;
	for (const line of body.split("\n")) {
		if (FENCE.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		lines.push(line);
	}

	const LIST_MARK = /^\s*(?:[-*+·•‣▪]\s*|\d+[.)]\s*)/;
	const flatten = (arr) =>
		arr
			.map((s) => s.replace(LIST_MARK, ""))
			.join(" ")
			.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
			.replace(/<[^>]+>/g, "")
			.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replace(/[*_`>#~]/g, "")
			.replace(/\s+/g, " ")
			.trim();

	const collect = (start, allowList) => {
		const para = [lines[start].trim()];
		for (let j = start + 1; j < lines.length; j++) {
			const next = lines[j];
			if (!next.trim() || isBlockStart(next)) break;
			if (!allowList && /^\s*(?:[-*+·•‣▪]\s|\d+[.)]\s?)/.test(next)) break;
			para.push(next.trim());
		}
		return flatten(para);
	};

	const cut = (s) => (s.length > 120 ? `${s.slice(0, 119)}…` : s);

	// 按行顺序扫，**最早**出现的可用文本获胜：作者的笔记大量用列表写，
	// 只认"普通段落"会把列表全跳过去，摘要反而取到文章后半段（实测踩过）。
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim() || isBlockStart(line)) continue;
		const isList = /^\s*(?:[-*+·•‣▪]\s|\d+[.)]\s?)/.test(line);
		const flat = collect(i, isList);
		if (flat.length < 12) continue;
		return cut(flat);
	}
	return "";
}

const yamlString = (s) =>
	`"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;

function frontmatter(fields) {
	const out = ["---"];
	const put = (k, v, raw) => {
		if (v === undefined || v === null || v === "") return;
		out.push(`${k}: ${raw ? v : yamlString(v)}`);
	};
	put("title", fields.title);
	put("published", fields.published, true);
	if (fields.description) put("description", fields.description);
	if (fields.category) put("category", fields.category);
	if (fields.tags?.length) {
		out.push(
			`tags: [${fields.tags.map((t) => yamlString(t)).join(", ")}]`,
		);
	}
	if (fields.series) {
		put("series", fields.series);
		if (fields.seriesOrder !== undefined) out.push(`seriesOrder: ${fields.seriesOrder}`);
	}
	put("lang", fields.lang ?? "zh_CN");
	out.push(`draft: ${fields.draft ? "true" : "false"}`);
	out.push(`comment: ${fields.comment === false ? "false" : "true"}`);
	out.push("---");
	return out.join("\n");
}

/* ─────────────────────── 主流程 ─────────────────────── */

const SRC = (() => {
	const i = process.argv.indexOf("--src");
	return i > -1 ? process.argv[i + 1] : DEFAULT_SRC;
})();

function parseArgs() {
	const argv = process.argv.slice(2);
	const get = (flag, def) => {
		const i = argv.indexOf(flag);
		return i > -1 && argv[i + 1] ? argv[i + 1] : def;
	};
	const all = (flag) => {
		const out = [];
		argv.forEach((a, i) => {
			if (a === flag && argv[i + 1]) out.push(argv[i + 1]);
		});
		return out;
	};
	return {
		write: argv.includes("--write"),
		quiet: argv.includes("--quiet"),
		batch: get("--batch", "all"),
		cat: get("--cat", ""),
		only: all("--only"),
		limit: Number(get("--limit", "0")) || 0,
		report: get("--report", REPORT_PATH),
	};
}

/** 收集源文章（排除 图片/ 资源目录） */
async function collectSource() {
	const imgRoot = path.join(SRC, "图片");
	const files = (await listFiles(SRC)).filter((f) =>
		f.toLowerCase().endsWith(".md"),
	);
	const posts = [];
	const ignored = [];
	for (const abs of files) {
		const rel = path.relative(SRC, abs).replace(/\\/g, "/");
		if (rel.startsWith("图片/")) {
			ignored.push({ rel, reason: "图片目录里的散篇" });
			continue;
		}
		const cat = rel.split("/")[0];
		if (!CATEGORY_MAP[cat]) {
			ignored.push({ rel, reason: `未知分类 ${cat}` });
			continue;
		}
		const buf = await fs.readFile(abs);
		const stat = await fs.stat(abs);
		posts.push({
			abs,
			rel,
			cat,
			sub: rel.split("/").slice(1, -1).join("/"),
			stem: path.basename(abs, ".md"),
			text: buf.toString("utf8"),
			md5: createHash("md5").update(buf).digest("hex"),
			bytes: buf.length,
			mtime: stat.mtime,
		});
	}
	posts.sort((a, b) => a.mtime - b.mtime || a.rel.localeCompare(b.rel));
	return { posts, ignored, imgRoot };
}

/** 去重：MD5 相同的只保留一篇（优先"被双链指向的名字"→ 名字短 → 路径字典序） */
function dedupe(posts, wikiTargets) {
	const byHash = new Map();
	for (const p of posts) {
		if (!byHash.has(p.md5)) byHash.set(p.md5, []);
		byHash.get(p.md5).push(p);
	}
	const skipped = [];
	for (const [, group] of byHash) {
		if (group.length < 2) continue;
		group.sort((a, b) => {
			const la = wikiTargets.has(norm(a.stem)) ? 0 : 1;
			const lb = wikiTargets.has(norm(b.stem)) ? 0 : 1;
			return la - lb || a.stem.length - b.stem.length || a.rel.localeCompare(b.rel);
		});
		for (const loser of group.slice(1)) {
			skipped.push({
				rel: loser.rel,
				reason: `与 ${group[0].rel} 内容完全相同（MD5 一致）`,
			});
		}
	}
	const skipSet = new Set(skipped.map((s) => s.rel));
	return { kept: posts.filter((p) => !skipSet.has(p.rel)), skipped };
}

function selectBatch(posts, args) {
	let list = posts;
	if (args.cat) list = list.filter((p) => p.cat === args.cat);
	if (args.only.length)
		list = list.filter((p) => args.only.some((s) => p.rel.includes(s)));
	if (args.batch !== "all") {
		const b = BATCHES[args.batch];
		if (!b) throw new Error(`未知批次：${args.batch}`);
		list = Array.isArray(b)
			? list.filter((p) => b.includes(p.rel))
			: list.filter((p) => b.cats.includes(p.cat));
	}
	if (args.limit > 0) list = list.slice(0, args.limit);
	return list;
}

async function main() {
	const args = parseArgs();
	const { posts, ignored } = await collectSource();

	// 双链目标（先用全量源文件名建索引，被指向的名字在去重时优先保留）
	const wikiTargets = new Set();
	for (const p of posts) {
		const dead = codeRanges(p.text);
		const live = makeIsLive(dead);
		for (const m of p.text.matchAll(/(?<!!)\[\[([^[\]\n]+)\]\]/g)) {
			if (!live(m.index)) continue;
			wikiTargets.add(norm(m[1].split("|")[0].split("#")[0]));
		}
	}

	const { kept, skipped } = dedupe(posts, wikiTargets);
	const index = await buildImageIndex(SRC);

	// 标题索引（文件名 + 首个 H1 + 覆盖标题 → 文章），供双链改写
	const titleIndex = new Map();
	for (const p of kept) {
		const h1 = /^[ \t]{0,3}#\s+(.+?)\s*$/m.exec(p.text)?.[1] ?? "";
		const title = TITLE_OVERRIDES[p.rel] ?? p.stem;
		p.title = title;
		p.h1 = h1;
		for (const key of [norm(title), norm(p.stem), norm(h1)].filter(Boolean)) {
			if (!titleIndex.has(key)) titleIndex.set(key, p);
		}
	}

	// slug（同分类内重名加序号）
	const usedSlug = new Map();
	for (const p of kept) {
		p.catDir = CATEGORY_MAP[p.cat].dir;
		p.category = CATEGORY_MAP[p.cat].category;
		const slug = slugify(p.title);
		const key = `${p.catDir}/${slug}`;
		const n = (usedSlug.get(key) ?? 0) + 1;
		usedSlug.set(key, n);
		p.slug = n > 1 ? `${slug}-${n}` : slug;
	}

	// 系列序号：同一 series 内按时间排序
	const seriesSeen = new Map();
	for (const p of kept) {
		const series = SERIES_MAP[`${p.cat}/${p.sub}`] ?? "";
		if (!series) continue;
		const n = (seriesSeen.get(series) ?? 0) + 1;
		seriesSeen.set(series, n);
		p.seriesOrder = n;
	}

	const selected = selectBatch(kept, args);
	const report = {
		generatedAt: new Date().toISOString(),
		mode: args.write ? "write" : "dry-run",
		source: SRC,
		selection: {
			batch: args.batch,
			cat: args.cat || null,
			only: args.only,
			limit: args.limit,
			sourcePosts: posts.length,
			afterDedupe: kept.length,
			selected: selected.length,
		},
		skipped: [...skipped, ...ignored],
		summary: {
			written: 0,
			unchanged: 0,
			draft: 0,
			imagesCopied: 0,
			imageMissing: 0,
			wikiLinksResolved: 0,
			wikiLinksUnresolved: 0,
			warnings: 0,
		},
		posts: [],
	};

	for (const p of selected) {
		const entry = await importOne(p, {
			args,
			index,
			titleIndex,
			report,
		});
		report.posts.push(entry);
	}

	report.summary.warnings = report.posts.reduce(
		(s, e) => s + e.warnings.length,
		0,
	);
	await fs.mkdir(path.dirname(args.report), { recursive: true });
	await fs.writeFile(args.report, JSON.stringify(report, null, "\t"), "utf8");

	/* ── 控制台汇总 ── */
	const s = report.summary;
	console.log(
		`\n${args.write ? "【已落盘】" : "【dry-run】"} 选中 ${selected.length} 篇` +
			`（源 ${posts.length} → 去重后 ${kept.length}）`,
	);
	console.log(
		`  落盘 ${s.written} · 未变 ${s.unchanged} · draft ${s.draft} · 复制图片 ${s.imagesCopied} 张 · 缺图 ${s.imageMissing} 处`,
	);
	console.log(
		`  双链改写 ${s.wikiLinksResolved} 条，未解析 ${s.wikiLinksUnresolved} 条；警告 ${s.warnings} 条`,
	);
	const draftList = report.posts.filter((e) => e.draft);
	if (draftList.length) {
		console.log(`\n  待补图（draft: true）：`);
		for (const e of draftList)
			console.log(`    ${e.src}  缺 ${e.images.missing}/${e.images.refs} 张`);
	}
	const warned = report.posts.filter((e) => e.warnings.length);
	if (warned.length) {
		console.log(`\n  有警告的篇目：`);
		for (const e of warned) {
			for (const w of e.warnings)
				console.log(`    [${w.code}] ${e.src}:${w.line ?? "-"} ${w.message}`);
		}
	}
	console.log(`\n  报告：${args.report}`);
}

/** 处理一篇：解析图片 → 改写正文 → 生成 frontmatter → （可选）落盘 */
async function importOne(p, { args, index, titleIndex, report }) {
	const dead = codeRanges(p.text);
	const { tags: headTags, bodyStart } = splitTags(p.text);
	const refs = extractImageRefs(p.text);

	// 图片池
	const pool = pickPool(p.rel, p.title, index, p.cat);
	const warnings = [];
	const missing = [];
	const copied = []; // { srcAbs, publicPath, key }
	const byAbs = new Map();

	for (const ref of refs) {
		if (isRemote(ref.srcValue ?? ref.name)) continue;
		if (!isImageName(ref.name)) {
			warnings.push({
				code: "not-an-image",
				message: `引用不是图片，已原样保留：${ref.name}`,
				line: ref.line,
			});
			continue;
		}
		const hit = lookupImage(pool?.pool ?? null, index.global, ref.name);
		if (!hit) {
			missing.push(ref);
			continue;
		}
		const abs = hit.abs;
		const how = hit.how;
		ref.abs = abs;
		ref.how = how;
		if (!byAbs.has(abs)) {
			const ext = (path.extname(abs) || ".jpg").toLowerCase();
			const nn = String(byAbs.size + 1).padStart(2, "0");
			const publicPath = `/images/posts/${p.slug}/${nn}${ext}`;
			const rec = { srcAbs: abs, publicPath, name: ref.name, how };
			byAbs.set(abs, rec);
			copied.push(rec);
		}
		ref.publicPath = byAbs.get(abs).publicPath;
	}

	// 双链改写
	const wikiOut = { resolved: 0, unresolved: [] };
	const wikiEdits = [];
	{
		const live = makeIsLive(dead);
		for (const m of p.text.matchAll(/(?<!!)\[\[([^[\]\n]+)\]\]/g)) {
			if (!live(m.index)) continue;
			const [targetRaw, alias] = m[1].split("|");
			const target = targetRaw.split("#")[0].trim();
			const targetPost = titleIndex.get(norm(target));
			const display = (alias?.trim() || target || targetRaw).trim();
			if (!targetPost || targetPost === p) {
				wikiOut.unresolved.push({ text: m[1], line: lineOf(p.text, m.index) });
				continue;
			}
			wikiOut.resolved++;
			wikiEdits.push({
				start: m.index,
				end: m.index + m[0].length,
				text: `[${display}](/posts/${targetPost.catDir}/${targetPost.slug}/)`,
			});
		}
	}

	// 从后往前替换，避免位移
	const edits = [];
	for (const ref of refs) {
		if (isRemote(ref.srcValue ?? ref.name)) continue;
		if (!isImageName(ref.name)) continue;
		if (ref.publicPath) {
			if (ref.kind === "wiki") {
				const alt = ref.alias ?? "";
				edits.push({
					start: ref.start,
					end: ref.end,
					text: `![${alt}](${ref.publicPath})`,
				});
			} else if (ref.kind === "md") {
				edits.push({
					start: ref.start,
					end: ref.end,
					text: `![${ref.alt ?? ""}](${ref.publicPath})`,
				});
			} else {
				edits.push({
					start: ref.srcStart,
					end: ref.srcEnd,
					text: ref.publicPath,
				});
			}
		} else {
			edits.push({
				start: ref.start,
				end: ref.end,
				text:
					`\n\n> [!WARNING]\n> 原图缺失：\`${ref.name}\`` +
					`（源导出里没有这个文件，见 PROJECT_STATUS 阻塞项）\n\n`,
			});
			warnings.push({
				code: "image-missing",
				message: `图片缺失：${ref.name}`,
				line: ref.line,
			});
		}
	}
	edits.push(...wikiEdits);

	// 行内 Obsidian 标签（#cpp 之类）：已经进 frontmatter，从正文里摘掉
	const inlineTagHits = inlineTags(p.text, dead);
	for (const hit of inlineTagHits) {
		const before = p.text[hit.start - 1];
		const start =
			hit.start > 0 && (before === " " || before === "\t") ? hit.start - 1 : hit.start;
		edits.push({ start, end: hit.end, text: "" });
	}

	edits.sort((a, b) => b.start - a.start);
	let body = p.text;
	for (const e of edits) body = body.slice(0, e.start) + e.text + body.slice(e.end);

	// 去掉文首标签行，删掉与标题重复的首个 H1
	const lines = body.split("\n");
	lines.splice(0, bodyStart);
	while (lines.length && lines[0].trim() === "") lines.shift();
	if (lines.length && /^[ \t]{0,3}#\s+/.test(lines[0])) {
		const h1 = lines[0].replace(/^[ \t]{0,3}#\s+/, "").trim();
		if (norm(h1) === norm(p.title)) {
			lines.shift();
			while (lines.length && lines[0].trim() === "") lines.shift();
		}
	}
	body = separateAdjacentImages(
		tidyWhitespace(lines.join("\n").replace(/\r\n/g, "\n")).trim(),
	);

	// 标签：作者标签 + 分类 + 子目录，按规范化去重（"Linux系统" 与 "Linux 系统" 算同一个；
	// 作者写的 "八股" 这种分类名的一部分也不再重复出现）
	const authorTags = [...headTags, ...inlineTagHits.map((h) => h.tag)];
	const tagList = [];
	const seenTag = new Set();
	const catNorm = norm(p.category);
	for (const t of [p.category, ...authorTags, p.sub].filter(Boolean)) {
		const v = String(t).trim().replace(/^#/, "");
		if (!v || v.length > 20) continue;
		const k = norm(v);
		if (seenTag.has(k)) continue;
		if (k !== catNorm && catNorm.includes(k)) continue;
		seenTag.add(k);
		tagList.push(v);
	}
	if (tagList.length > 8) tagList.length = 8;

	// 全缺图 → draft
	const localRefs = refs.filter(
		(r) => !isRemote(r.srcValue ?? r.name) && isImageName(r.name),
	);
	const draft = localRefs.length > 0 && copied.length === 0;
	if (draft) {
		body =
			`> [!IMPORTANT]\n> 本篇 ${localRefs.length} 张配图在源导出里全部缺失，` +
			`暂不上线（PROJECT_STATUS 阻塞项 B-06）。补图后把 frontmatter 的 \`draft\` 改成 \`false\` 即可。\n\n${body}`;
		warnings.push({
			code: "all-images-missing",
			message: `${localRefs.length} 张配图全部缺失 → draft: true`,
		});
	}

	const series = SERIES_MAP[`${p.cat}/${p.sub}`] ?? "";
	const fm = frontmatter({
		title: p.title,
		published: fmtDate(p.mtime),
		description: firstParagraph(body),
		category: p.category,
		tags: tagList,
		series,
		seriesOrder: series ? (p.seriesOrder ?? 1) : undefined,
		lang: "zh_CN",
		draft,
		comment: true,
	});
	const outRel = `${p.catDir}/${p.slug}.md`;
	const outAbs = path.join(CONTENT_ROOT, p.catDir, `${p.slug}.md`);
	const content = `${fm}\n\n${body}\n`;

	// 落盘（或比对）
	let action = "plan";
	if (args.write) {
		await fs.mkdir(path.dirname(outAbs), { recursive: true });
		let prev = null;
		try {
			prev = await fs.readFile(outAbs, "utf8");
		} catch {}
		if (prev === content) action = "unchanged";
		else {
			await fs.writeFile(outAbs, content, "utf8");
			action = "written";
		}
		for (const rec of copied) {
			const target = path.join("public", rec.publicPath.replace(/^\//, ""));
			await fs.mkdir(path.dirname(target), { recursive: true });
			let same = false;
			try {
				const [a, b] = await Promise.all([
					fs.stat(rec.srcAbs),
					fs.stat(target),
				]);
				same = a.size === b.size;
			} catch {}
			if (!same) await fs.copyFile(rec.srcAbs, target);
		}
		const mapPath = path.join("reports", `image-mapping-${p.slug}.json`);
		await fs.writeFile(
			mapPath,
			JSON.stringify(
				{
					src: p.rel,
					slug: p.slug,
					pool: pool ? { key: pool.key, how: pool.how } : null,
					images: copied.map((r, i) => ({
						index: String(i + 1).padStart(2, "0"),
						public: r.publicPath,
						source: path.relative(SRC, r.srcAbs).replace(/\\/g, "/"),
					})),
				},
				null,
				"\t",
			),
			"utf8",
		);
	}
	if (action === "written") report.summary.written++;
	else if (action === "unchanged") report.summary.unchanged++;
	if (draft) report.summary.draft++;
	report.summary.imagesCopied += copied.length;
	report.summary.imageMissing += missing.length;
	report.summary.wikiLinksResolved += wikiOut.resolved;
	report.summary.wikiLinksUnresolved += wikiOut.unresolved.length;

	const entry = {
		src: p.rel,
		title: p.title,
		slug: p.slug,
		out: outRel,
		action,
		kb: Math.round(p.bytes / 1024),
		published: fmtDate(p.mtime),
		category: p.category,
		tags: tagList,
		series: series || null,
		draft,
		pool: pool ? { key: pool.key, how: pool.how, size: pool.pool.size } : null,
		images: {
			refs: refs.length,
			local: localRefs.length,
			remote: refs.length - localRefs.length,
			resolved: localRefs.length - missing.length,
			missing: missing.length,
			copied: copied.length,
			files: copied.map((r) => ({
				public: r.publicPath,
				source: path.relative(SRC, r.srcAbs).replace(/\\/g, "/"),
			})),
			missingNames: missing.map((r) => r.name),
		},
		wikiLinks: wikiOut,
		warnings,
	};
	if (!args.quiet) {
		console.log(
			`  ${action === "written" ? "✍" : action === "unchanged" ? "=" : "·"} ${p.rel}` +
				`\n      → ${outRel}  ${entry.kb}KB  图 ${entry.images.resolved}/${entry.images.local} 张（复制 ${copied.length}）` +
				`  标签[${tagList.join(", ")}]${draft ? "  ⚠ draft" : ""}`,
		);
	}
	return entry;
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
