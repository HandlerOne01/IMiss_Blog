/**
 * 站内搜索自检（`pnpm verify:search [--base http://localhost:4321]`）
 * ============================================================================
 * 为什么要单开一个脚本（v1.95）：搜索这条链路此前**一条断言都没有**，
 * 而它的"坏"是**静默**的 —— dev 下模板给的是两条英文假结果（This Is a Fake Search Result），
 * 索引没生成时前端也只是空手而归，谁都不会报错。发起人就是这么撞上的。
 *
 * 查三件事：
 *   ① **索引在不在**：`HEAD {base}/pagefind/pagefind.js`（dev 由 `pnpm index:dev` + astro.config
 *      里的 dev-only 中间件提供；生产就是 build 产物）；
 *   ② **真机能出结果**：开真 Chrome，走**真鼠标 + 真键盘**（点搜索框 → 逐字输入 → 读 `#search-panel`），
 *      中英文各几组查询都要 ≥1 条结果；
 *   ③ **没有假结果**：面板里**不许**出现模板那两条英文占位（`This Is a Fake Search Result` /
 *      `Dev Mode Search Result`），也不许出现中文兜底（那两/一条只在"真没有索引"时才该出现）。
 *
 * 退出码：站点连不上 → 打印启动命令、退 0（环境未就绪，不是回归）；
 *         索引缺失 / 查询无结果 / 出现假结果 → 退 1（**可修的实事**，第一行直接说怎么修）。
 * 用法：pnpm verify:search --base http://localhost:4321（dev）或 http://localhost:4323（preview）
 */
import { spawn } from "node:child_process";
import { accessSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const readArg = (k, d) => {
	const i = args.indexOf(k);
	return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = readArg("--base", "http://localhost:4321").replace(/\/$/, "");

/** 搜索用的查询 → 期望命中的关键词（用来判"结果是不是相关"） */
const CASES = [
	{ q: "红黑树", want: /红黑树|数据结构|算法/ },
	{ q: "倒排索引", want: /搜索引擎|倒排|索引/ },
	{ q: "虚函数", want: /C\+\+|虚函数|多态/ },
	{ q: "Boost", want: /Boost|搜索引擎/ },
];

/** 模板那两条英文假结果 + 中文兜底的标题（出现即判红） */
const FAKE_TITLES = [
	"This Is a Fake Search Result",
	"If You Want to Test the Search",
	"Dev Mode Search Result",
	"现在还没有搜索索引",
	"也可以直接看预览",
	"搜索暂时用不了",
];

const rows = [];
const record = (desc, pass, detail, hard = true) => {
	rows.push({ desc, pass, detail, hard });
	console.log(`${pass ? "✅" : "❌"} ${desc}\n      ${detail}`);
};
const skip = (desc, detail) => {
	rows.push({ desc, pass: true, detail, hard: false, skipped: true });
	console.log(`⏭️  ${desc}\n      ${detail}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── ① 站点与索引在不在 ─────────────────────────────────────────────────────
// ⚠️ dev server 是**按需编译**的：首页第一次访问要现场编译，实测能超过 6 秒 ——
//    所以这里给 25 秒 × 3 次，别拿"dev 编译慢"当成"站点没起"。
let siteUp = false;
let lastErr = "";
for (let attempt = 1; attempt <= 3 && !siteUp; attempt++) {
	try {
		const r = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(25000) });
		siteUp = r.ok;
		if (!siteUp) lastErr = `HTTP ${r.status}`;
	} catch (e) {
		lastErr = e.message;
	}
}
if (!siteUp) {
	console.log(`\n⏭️  站点 ${BASE} 连不上（${lastErr}）\n    先起服务：pnpm dev（4321）或 pnpm preview（4323），再跑本脚本。\n`);
	process.exit(0);
}

let indexStatus = 0;
try {
	const r = await fetch(`${BASE}/pagefind/pagefind.js`, { method: "HEAD", signal: AbortSignal.timeout(8000) });
	indexStatus = r.status;
} catch {
	indexStatus = 0;
}
if (indexStatus !== 200) {
	record(
		"索引文件可达（HEAD /pagefind/pagefind.js）",
		false,
		`HTTP ${indexStatus} —— **不是搜索坏了，是还没有索引**：先 \`pnpm build\`，再 \`pnpm index:dev\`（dev）／确认产物里有 dist/pagefind（preview）。`,
	);
	console.log(`\n搜索自检：通过 ${rows.filter((r) => r.pass && !r.skipped).length}，失败 ${rows.filter((r) => !r.pass).length}\n`);
	process.exit(1);
}
record("索引文件可达（HEAD /pagefind/pagefind.js）", true, `HTTP 200（${BASE}）`);

// ── ② 开真 Chrome，走真鼠标真键盘 ─────────────────────────────────────────
const CHROME = [
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
	path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe"),
].find((p) => {
	try {
		accessSync(p);
		return true;
	} catch {
		return false;
	}
});
if (!CHROME) {
	skip("真机搜索", "本机找不到 Chrome —— 环境未就绪，跳过（不影响退出码）");
	process.exit(0);
}

const profile = await fs.mkdtemp(path.join(os.tmpdir(), "imiss-vsearch-"));
const child = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--force-device-scale-factor=1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
let port = null;
for (let i = 0; i < 80; i++) {
	await sleep(250);
	try {
		port = Number((await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]);
		if (port) break;
	} catch {}
}
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((res) => ws.addEventListener("open", res, { once: true }));
let id = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener("message", (e) => {
	const m = JSON.parse(e.data);
	if (m.id && pending.has(m.id)) {
		pending.get(m.id)(m);
		pending.delete(m.id);
	}
	if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrors.push((m.params.args || []).map((a) => a.value ?? "").join(" ").slice(0, 160));
});
const send = (method, params = {}, timeout = 60000) => {
	const myId = ++id;
	ws.send(JSON.stringify({ id: myId, method, params }));
	return new Promise((resolve, reject) => {
		pending.set(myId, (m) => resolve(m.result ?? m));
		setTimeout(() => pending.delete(myId) && reject(new Error(`${method} 超时`)), timeout);
	});
};
const ev = async (expr, awaitPromise = false) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise })).result?.value;
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: 1 });
const typeText = async (text) => {
	for (const ch of text) {
		await send("Input.dispatchKeyEvent", { type: "keyDown" });
		await send("Input.dispatchKeyEvent", { type: "char", text: ch });
		await send("Input.dispatchKeyEvent", { type: "keyUp" });
		await sleep(15);
	}
};
/**
 * 清空搜索框。⚠️ 用**赋值 + 派发 input 事件**（Svelte 的 `bind:value` 监听的就是它），
 * 而不是"全选 + 退格"—— 后者在焦点不在输入框时会静默失败，于是下一个查询会**粘在旧词后面**
 * （实测踩到：「倒排索引」之后输「虚函数」变成「倒排索引虚函数」→ 0 条命中 → 假红）。
 * 清完还要**回读确认**，把实际值带回去给断言看。
 */
const clearInput = async () => {
	await ev(`(() => {
		const i = document.querySelector("#search-input-desktop");
		if (!i) return null;
		i.focus();
		i.value = "";
		i.dispatchEvent(new Event("input", { bubbles: true }));
		return i.value;
	})()`);
	await sleep(120);
	return await ev(`document.querySelector("#search-input-desktop").value`);
};
const readPanel = () =>
	ev(`(() => {
		const p = document.querySelector("#search-panel");
		return { links: [...p.querySelectorAll("a")].map((a) => a.textContent.replace(/\\s+/g, " ").trim()), text: p.textContent.replace(/\\s+/g, " ").trim() };
	})()`);

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const loaded = send("Page.loadEventFired");
await send("Page.navigate", { url: `${BASE}/` });
await loaded;
await sleep(1600);

const boot = await ev(
	`(async () => { try { await window.__loadPagefind(); } catch (e) {} return { hasLoader: typeof window.__loadPagefind === "function", hasPagefind: !!(window.pagefind && typeof window.pagefind.search === "function") }; })()`,
	true,
);
record(
	"页面里搜索接线就绪（加载器存在 + pagefind.search 可用）",
	boot?.hasLoader === true && boot?.hasPagefind === true,
	`hasLoader=${boot?.hasLoader}｜hasPagefind=${boot?.hasPagefind}（dev 下由 astro.config.mjs 的 dev 中间件提供索引）`,
);

const box = await ev(`(() => { const r = document.querySelector("#search-input-desktop").getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }; })()`);
await mouse("mousePressed", box.x, box.y);
await mouse("mouseReleased", box.x, box.y);
await sleep(400);

for (const { q, want } of CASES) {
	const cleared = await clearInput();
	await typeText(q);
	// ⚠️ **按条件等，不按固定时长等**：dev server 第一次查某个分片要现编译 + wasm 首次实例化，
	//    实测「虚函数」要 ~2 秒才出结果（固定等 2 秒会假红 —— 本脚本第一版就是这么红的）。
	//    这里每 300ms 采一次，等到出结果或 15 秒封顶。
	let p = await readPanel();
	const t0 = Date.now();
	while (p.links.length === 0 && Date.now() - t0 < 15000) {
		await sleep(300);
		p = await readPanel();
	}
	const waited = Date.now() - t0;
	const fake = FAKE_TITLES.filter((t) => p.text.includes(t));
	const ok = cleared === "" && p.links.length >= 1 && fake.length === 0 && want.test(p.links[0] ?? "");
	record(
		`真机搜索「${q}」出结果且相关`,
		ok,
		`清空回读=${JSON.stringify(cleared)}｜结果 ${p.links.length} 条（等了 ${waited}ms）｜首条「${(p.links[0] ?? "").slice(0, 40)}」${fake.length ? `｜⚠️ 命中了假结果/兜底：${fake.join("、")}` : ""}`,
	);
}

record("搜索过程没有控制台报错", consoleErrors.length === 0, consoleErrors.length ? consoleErrors.slice(0, 3).join(" ｜ ") : "0 条");

ws.close();
child.kill();

const failed = rows.filter((r) => !r.pass);
const passed = rows.filter((r) => r.pass && !r.skipped).length;
const skipped = rows.filter((r) => r.skipped).length;
console.log(`\n搜索自检 ${rows.length} 项：通过 ${passed}，失败 ${failed.length}${skipped ? `，跳过 ${skipped}` : ""}（${BASE}）`);
await fs.writeFile("reports/verify-search.log", rows.map((r) => `${r.pass ? "✅" : "❌"} ${r.desc}\n    ${r.detail}`).join("\n") + `\n\n搜索自检 ${rows.length} 项：通过 ${passed}，失败 ${failed.length}（${BASE}）\n`, "utf8");
console.log("日志已写：reports/verify-search.log");
process.exit(failed.length ? 1 : 0);
