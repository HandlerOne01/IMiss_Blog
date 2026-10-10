// B-13 image audit: sweep EVERY post (not just the ones with diffs) and report
// what external image references remain, cross-checked against the recorded
// download failures and against what actually shipped in dist/.
//
// Exits 0 only when every surviving third-party image reference has a matching
// entry in reports/_b13-mapping.json's failure list — i.e. it is a reference we
// tried and failed to bring in-house, never one we simply forgot.
import fs from "node:fs";
import path from "node:path";

// Badge/CI chrome from the upstream README, not post-body illustration.
const SKIP_HOSTS = new Set(["img.shields.io", "travis-ci.org"]);
const ALT = String.raw`(?:[^\[\]]|\[[^\]]*\])*`;
const MD_RE = new RegExp(
	String.raw`!\[${ALT}\]\(\s*(<?)(https?:\/\/[^\s)>"']+)\1`,
	"g",
);
const HTML_RE = /<img\b[^>]*?\bsrc\s*=\s*("([^"]*)"|'([^']*)')/gi;
const BARE_RE =
	/^\s*<?(https?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg|bmp|avif))>?\s*$/gim;

function walk(dir) {
	const out = [];
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) out.push(...walk(p));
		else if (/\.mdx?$/i.test(e.name)) out.push(p);
	}
	return out;
}

function refs(text) {
	const out = [];
	const push = (url, index) => {
		if (url && /^https?:\/\//i.test(url)) out.push({ url, index });
	};
	for (const m of text.matchAll(MD_RE)) push(m[2], m.index);
	for (const m of text.matchAll(HTML_RE)) push(m[2] ?? m[3], m.index);
	for (const m of text.matchAll(BARE_RE)) push(m[1], m.index);
	return out;
}

const files = walk("src/content/posts");
const mapping = JSON.parse(
	fs.readFileSync("reports/_b13-mapping.json", "utf8"),
);
const failUrls = new Set(mapping.failures.map((f) => f.url));

let totalExternal = 0;
const remaining = [];
const byHost = {};
for (const abs of files) {
	const text = fs.readFileSync(abs, "utf8");
	const slug = path.basename(abs).replace(/\.mdx?$/i, "");
	for (const r of refs(text)) {
		let host = "<bad>";
		try {
			host = new URL(r.url).host;
		} catch {}
		totalExternal++;
		byHost[host] = (byHost[host] || 0) + 1;
		remaining.push({
			slug,
			url: r.url,
			host,
			badge: SKIP_HOSTS.has(host),
			explained: failUrls.has(r.url),
		});
	}
}

const contentRemaining = remaining.filter((r) => !r.badge);
console.log("=== B-13 final audit (all 138 posts) ===");
console.log(`posts scanned                    : ${files.length}`);
console.log(`external image refs remaining    : ${totalExternal}`);
console.log(
	`  of which badge/CI chrome       : ${remaining.length - contentRemaining.length}`,
);
console.log(`  of which post-body images      : ${contentRemaining.length}`);
console.log(
	`  explained by a recorded failure: ${contentRemaining.filter((r) => r.explained).length}`,
);
console.log(
	`  UNEXPLAINED                    : ${contentRemaining.filter((r) => !r.explained).length}`,
);
console.log(`migrated images recorded         : ${mapping.mapping.length}`);

console.log("\n-- remaining post-body refs, by host --");
const ch = {};
for (const r of contentRemaining) ch[r.host] = (ch[r.host] || 0) + 1;
for (const [h, c] of Object.entries(ch).sort((a, b) => b[1] - a[1]))
	console.log(String(c).padStart(4), h);

console.log("\n-- remaining post-body refs, detail --");
for (const r of contentRemaining)
	console.log(
		`  ${r.explained ? "explained" : "UNEXPLAINED"}  ${r.slug}  ${r.url}`,
	);

// dist side: every recorded local path must exist with matching bytes.
let distMissing = 0;
let distMismatch = 0;
for (const m of mapping.mapping) {
	const f = path.join("dist", m.localPath.replace(/^\//, ""));
	if (!fs.existsSync(f)) {
		distMissing++;
		continue;
	}
	if (fs.statSync(f).size !== m.bytes) distMismatch++;
}
console.log(`\ndist files missing               : ${distMissing}`);
console.log(`dist byte mismatches             : ${distMismatch}`);

// The referenced local path must literally appear in its post body.
let refMissing = 0;
for (const m of mapping.mapping) {
	const body = fs.readFileSync(
		path.join("src/content/posts/interview", `${m.post}.md`),
		"utf8",
	);
	if (!body.includes(m.localPath)) {
		refMissing++;
		console.log(`  !! ${m.post} does not reference ${m.localPath}`);
	}
}
console.log(`local paths not referenced       : ${refMissing}`);

const bad =
	contentRemaining.filter((r) => !r.explained).length +
	distMissing +
	distMismatch +
	refMissing;
console.log(
	bad === 0
		? "\nAUDIT OK: every remaining hotlink is an explained download failure"
		: `\nAUDIT FAILED: ${bad} problem(s)`,
);
process.exit(bad === 0 ? 0 : 1);
