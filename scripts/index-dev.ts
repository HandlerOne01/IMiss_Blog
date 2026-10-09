/**
 * `pnpm index:dev` —— 把**生产索引**（`dist/pagefind/`）复制一份给开发模式用
 * ============================================================================
 * 为什么需要它：Pagefind 的索引是在 `astro build` 之后对 `dist/` 扫出来的，
 * 而 `pnpm dev` 是**按需编译**、根本没有 `dist/`；所以模板在 dev 下塞了两条英文
 * 假结果（`Search.svelte` / `AdvancedSearch.svelte` 的 `fakeResult`），
 * 发起人看到的就是那句 "This Is a Fake Search Result"。
 *
 * 现在的口径（v1.95）：**dev 用同一份生产索引**，只是换了个发货方式 ——
 *   · 本脚本把 `dist/pagefind/` 复制到 `.dev/pagefind/`（`.dev/` 在 .gitignore 里）；
 *   · `astro.config.mjs` 里那个 **dev-only** 的 Vite 中间件把它挂在 `/pagefind/*` 上
 *     （与生产**同一个 URL 路径**，所以 Pagefind 自己的 `basePath` 推导、wasm、索引分片
 *      全都原样工作，前端一行路径都不用特判）；
 *   · 于是 dev 与 preview 的搜索行为一致；索引不存在时前端才回落到中文兜底提示。
 *
 * ⚠️ 索引是**快照**：改了文章要重新 `pnpm build`（再跑一次本脚本）。脚本会比一比
 *    `src/content` 与 `dist` 的时间戳，过期就提醒，但**不替你重建**（构建 40 秒起步，
 *    不该在一次"刷新索引"里偷偷跑掉）。
 * 用法：pnpm index:dev
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "dist", "pagefind");
const dest = path.join(root, ".dev", "pagefind");

const die = (msg: string): never => {
	console.error(`\n✗ ${msg}\n`);
	process.exit(1);
};

if (!fs.existsSync(path.join(src, "pagefind.js"))) {
	die(`找不到生产索引：${path.relative(root, src)}\\pagefind.js\n  先跑一次：pnpm build`);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(src, dest, { recursive: true });

const entry = JSON.parse(fs.readFileSync(path.join(dest, "pagefind-entry.json"), "utf8"));
const languages = Object.keys(entry.languages ?? {});
const pages = languages.reduce((n, k) => n + (entry.languages[k].page_count ?? 0), 0);
const files = fs.readdirSync(dest, { recursive: true }).length;
const mb = dirSize(dest) / 1024 / 1024;

function dirSize(dir: string): number {
	let total = 0;
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) total += dirSize(p);
		else total += fs.statSync(p).size;
	}
	return total;
}

console.log(`\n✓ 开发模式搜索索引就绪`);
console.log(`  来源：${path.relative(root, src)}（生产索引，${languages.join("/")}，${entry.version ?? "?"}）`);
console.log(`  去向：${path.relative(root, dest)}（${files} 个文件，${mb.toFixed(1)} MB，${pages} 页）`);
console.log(`  用法：pnpm dev 起来后直接在右上角搜索框里搜（与 pnpm preview 同一份索引）`);

// 新鲜度提醒：内容文件比 dist 新 → 索引可能是旧的（只提醒，不重建）
const newest = (dir: string, exts: string[]): number => {
	let t = 0;
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) t = Math.max(t, newest(p, exts));
		else if (exts.some((x) => p.endsWith(x))) t = Math.max(t, fs.statSync(p).mtimeMs);
	}
	return t;
};
const contentTime = newest(path.join(root, "src", "content"), [".md", ".mdx"]);
const distTime = fs.statSync(path.join(root, "dist", "index.html")).mtimeMs;
if (contentTime > distTime) {
	const mins = Math.round((contentTime - distTime) / 60000);
	console.log(
		`\n⚠️ 文章比 dist 新 ${mins} 分钟 —— 这份索引是旧快照。要搜到新内容：pnpm build && pnpm index:dev`,
	);
}
console.log("");
