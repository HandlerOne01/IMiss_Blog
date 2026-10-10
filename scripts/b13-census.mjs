// B-13 census (authoritative): what the post bodies referenced BEFORE the
// migration, read from git HEAD, plus what remains in the working tree now.
//
// Written after the fact on purpose: earlier ad-hoc greps under-counted because
// (a) `![alt](url)` alt text can contain a nested bracket — `![clip_image002[4]](…)`
// is a real form in this corpus — and (b) absolute image URLs also appear as bare
// autolinks. Both forms are covered here.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Alt text: non-bracket runs, plus one level of balanced [..] groups.
const ALT = String.raw`(?:[^\[\]]|\[[^\]]*\])*`;
const MD_RE = new RegExp(
	String.raw`!\[${ALT}\]\(\s*(<?)(https?:\/\/[^\s)>"']+)\1`,
	"g",
);
const HTML_RE = /<img\b[^>]*?\bsrc\s*=\s*("([^"]*)"|'([^']*)')/gi;
const BARE_RE =
	/^\s*<?(https?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg|bmp|avif))>?\s*$/gim;
const IS_IMG = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|$|!)/i;

function refs(text, offsetBase = 0) {
	const out = [];
	const push = (url, index, kind) => {
		if (url && /^https?:\/\//i.test(url))
			out.push({ url, index: offsetBase + index, kind });
	};
	for (const m of text.matchAll(MD_RE)) push(m[2], m.index, "markdown");
	for (const m of text.matchAll(HTML_RE)) push(m[2] ?? m[3], m.index, "html");
	for (const m of text.matchAll(BARE_RE)) push(m[1], m.index, "bare");
	return out;
}

function collect(getText, listFiles) {
	const rows = [];
	for (const f of listFiles) {
		const text = getText(f);
		const slug = path.basename(f).replace(/\.mdx?$/i, "");
		for (const r of refs(text)) {
			let host = "<unparsable>";
			try {
				host = new URL(r.url).host;
			} catch {}
			rows.push({
				file: f.split(path.sep).join("/"),
				slug,
				host,
				kind: r.kind,
				url: r.url,
				hasExt: IS_IMG.test(r.url),
			});
		}
	}
	return rows;
}

const headFiles = execFileSync("git", ["ls-files", "src/content/posts"], {
	encoding: "utf8",
})
	.split("\n")
	.filter(Boolean);
const workFiles = [];
(function walk(dir) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p);
		else if (/\.mdx?$/i.test(e.name))
			workFiles.push(p.split(path.sep).join("/"));
	}
})("src/content/posts");

const atHead = collect(
	(f) =>
		execFileSync("git", ["show", `HEAD:${f}`], {
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
		}),
	headFiles,
);
const now = collect((f) => fs.readFileSync(f, "utf8"), workFiles);

const SKIP = new Set(["img.shields.io", "travis-ci.org"]);
const summarize = (rows) => {
	const content = rows.filter((r) => !SKIP.has(r.host));
	const byHost = {};
	for (const r of content) byHost[r.host] = (byHost[r.host] || 0) + 1;
	const bySlug = {};
	for (const r of content) bySlug[r.slug] = (bySlug[r.slug] || 0) + 1;
	return {
		allRefs: rows.length,
		badgeRefs: rows.length - content.length,
		contentRefs: content.length,
		uniqueContentUrls: new Set(content.map((r) => r.url)).size,
		postsWithContentImages: Object.keys(bySlug).length,
		byHost,
		bySlug,
	};
};

const before = summarize(atHead);
const after = summarize(now);

const out = {
	generatedAt: new Date().toISOString(),
	method:
		"markdown ![alt](url) with one level of nested brackets in alt + <img src> (single or double quoted) + bare-URL image lines; git HEAD = before, working tree = after",
	scope: "src/content/posts (**/*.md, **/*.mdx)",
	excludedHosts: [...SKIP],
	excludedReason:
		"badge/CI chrome from the upstream README, not post-body illustration (B-13 is about 正文插图的图床)",
	before,
	after,
	note: "earlier ad-hoc counts (e.g. 204 URLs / ~260 images) came from partial greps that missed the nested-bracket and bare-link forms and counted some refs twice; these numbers are computed with one total function over both revisions",
};

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync(
	"reports/_b13-census.json",
	`${JSON.stringify(out, null, "\t")}\n`,
	"utf8",
);

console.log("BEFORE (git HEAD)");
console.log("  all image refs          :", before.allRefs);
console.log("  badge/CI chrome         :", before.badgeRefs);
console.log("  post-body image refs    :", before.contentRefs);
console.log("  unique post-body URLs   :", before.uniqueContentUrls);
console.log("  posts with body images  :", before.postsWithContentImages);
console.log("\nAFTER (working tree)");
console.log("  all image refs          :", after.allRefs);
console.log("  badge/CI chrome         :", after.badgeRefs);
console.log("  post-body image refs    :", after.contentRefs);
console.log("  unique post-body URLs   :", after.uniqueContentUrls);
console.log("  posts with body images  :", after.postsWithContentImages);
console.log("\nBEFORE by host:");
for (const [h, c] of Object.entries(before.byHost).sort((a, b) => b[1] - a[1]))
	console.log(String(c).padStart(5), h);
console.log("\nBEFORE by slug:");
for (const [s, c] of Object.entries(before.bySlug).sort())
	console.log(String(c).padStart(5), s);
console.log("\nAFTER by host (should be only the recorded failures):");
for (const [h, c] of Object.entries(after.byHost).sort((a, b) => b[1] - a[1]))
	console.log(String(c).padStart(5), h);
