/**
 * 文档一致性自检（`pnpm verify:docs`）
 * ============================================================================
 * 为什么需要它：P2 加了「二游排行」之后，`B-08` 阻塞项里还写着"4 组数据"、
 * `ARCH.md` 目录树里没有 `game.astro`、`§11` 的断言数还停在 101……
 * 这些都是"改了代码忘了回写文档"的漂移，靠人肉记性一定会漏（发起人就是这么发现的）。
 * 所以把**能机械核对的部分**做成脚本：文档里的数字/清单必须等于仓库里的真实值。
 *
 * 检查项（每项都是"文档声称 vs 仓库事实"）：
 *   1. 三份文档版本号一致
 *   2. 断言条数：文档里"当前口径"的数字 == 最近一次 `reports/verify-*.log` 里的实测值
 *   3. 截图张数：文档里"当前口径"的数字 == `reports/screenshots/*.png` 实际张数
 *   4. 排行页清单：`src/pages/rank/*.astro` == 文档里列出的 `/rank/xxx/`（prd 站点地图 + ARCH §5.2）
 *   5. 导航子项：prd R-NAV-02 里列的 `/rank/xxx/` == `navBarConfig.ts` 里「排行」的 children，且都有路由文件
 *   6. 需求编号闭环：ARCH / PROJECT_STATUS / README 引用的 R-xxx-nn 都能在 prd.md 找到定义
 *   7. 阻塞项：`阻塞项 N 条` == B-xx 行数，且编号连续
 *   8. 阶段状态：§2 标了 ✅ 的阶段，§3 的小节标题也必须带 ✅（反之亦然）
 *   9. "最后更新"日期三份一致
 *  10. 配置事实：`displaySettingsConfig.enable` / `rankConfig.dataStatus` ↔ 文档说法；"4 组数据"是否漏了二游那第 5 份
 *  11. 文件编码：受版本控制的文本文件不带 UTF-8 BOM（PowerShell 会偷偷加）
 *
 * 用法：`pnpm verify:docs`（先跑过 `pnpm verify:ui` 才有最新的 reports 日志做基准；
 * 没有日志时只跳过第 2/3 项的"与实测比对"，仍会检查文档之间是否自相矛盾）。
 * 退出码：有任一 FAIL 即 1。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DOCS = ["prd.md", "ARCH.md", "PROJECT_STATUS.md"];
const README = "README.md";
const root = process.cwd();

const results = [];
const record = (area, desc, pass, detail = "") => {
	results.push({ area, desc, pass, detail });
};


/**
 * 按 BOM 解码文本：PowerShell 的 `*>` 重定向默认把输出写成 **UTF-16LE**，
 * node 直接按 utf8 读会得到夹着 \u0000 的乱码（本脚本第一版就因此"读不到"实测日志）。
 */
const readAny = async (p) => {
	const buf = await fs.readFile(path.resolve(root, p));
	if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString("utf16le");
	if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
	return buf.toString("utf8");
};

const prd = await readAny("prd.md");
const arch = await readAny("ARCH.md");
const status = await readAny("PROJECT_STATUS.md");
const readme = await readAny(README);
const allDocs = { "prd.md": prd, "ARCH.md": arch, "PROJECT_STATUS.md": status, [README]: readme };

// ── 1. 版本号一致 ────────────────────────────────────────
{
	const versions = DOCS.map((doc) => {
		const m = allDocs[doc].match(/\|\s*文档版本\s*\|\s*(v[\d.]+)\s*\|/);
		return { doc, v: m?.[1] ?? null };
	});
	const uniq = [...new Set(versions.map((x) => x.v))];
	record(
		"版本号",
		"三份文档版本号一致",
		uniq.length === 1 && uniq[0] !== null,
		versions.map((x) => `${x.doc}=${x.v ?? "缺失"}`).join("  "),
	);
}

// ── 2/3. 断言条数与截图张数（以最近一次 verify:ui 实测为基准）──
{
	// 基准：reports/ 下**含"功能断言 N 项"的**最新日志（按 mtime）。
	// 注意不能只按文件名筛：`pnpm verify:docs *> reports/verify-docs.log` 也会写出一个
	// verify-*.log，但里面没有界面断言的数字——第一版就因此把基准认成了自己（少跑一项检查）。
	let baseline = null;
	let baselineFile = "";
	try {
		const dir = path.resolve(root, "reports");
		const files = (await fs.readdir(dir)).filter((f) => /^verify.*\.log$/.test(f));
		const withTime = await Promise.all(
			files.map(async (f) => ({ f, t: (await fs.stat(path.join(dir, f))).mtimeMs })),
		);
		withTime.sort((a, b) => b.t - a.t);
		for (const cand of withTime) {
			const log = await readAny(path.join("reports", cand.f));
			const m = [...log.matchAll(/功能断言\s*(\d+)\s*项/gi)].pop();
			if (m) {
				baselineFile = cand.f;
				baseline = Number(m[1]);
				break;
			}
		}
	} catch {
		baseline = null;
	}

	// 文档里的"当前口径"：README 的期望输出行 + PROJECT_STATUS 最近变更 + ARCH §11 表格
	const claimed = [];
	const push = (doc, label, re) => {
		const m = allDocs[doc].match(re);
		if (m) claimed.push({ doc, label, n: Number(m[1]) });
	};
	// 四个来源一个都不能少：少了就说明某处措辞变了、正则悄悄失配 —— 那种"看起来在查、其实没查"
	// 的弱断言正是 P2 审查点名过的问题（第一版这里只要 ≥3 个来源就算过，
	// PROJECT_STATUS 失配时检查静默降级成 3 个来源，照样绿）
	const EXPECTED_SOURCES = 4;
	push(README, "期望输出", /期望输出：`功能断言\s*(\d+)\s*项/);
	push(README, "常用命令表", /`pnpm verify:ui`\s*\|\s*界面验收：(\d+) 项断言/);
	push("ARCH.md", "§11 脚本表", /\*\*(\d+) 项功能断言\*\*/);
	push("PROJECT_STATUS.md", "§1 最近变更", /最近变更\*\*：[\s\S]{0,900}?\*\*(\d+)\s*项断言全绿\*\*/);

	const uniq = [...new Set(claimed.map((c) => c.n))];
	record(
		"断言条数",
		`文档各处的当前口径一致（应有 ${EXPECTED_SOURCES} 处）`,
		uniq.length === 1 && claimed.length === EXPECTED_SOURCES,
		claimed.map((c) => `${c.doc}·${c.label}=${c.n}`).join("  ") || "一处都没匹配到",
	);
	if (baseline !== null) {
		record(
			"断言条数",
			`与最近一次实测一致（${baselineFile}）`,
			uniq.length === 1 && uniq[0] === baseline,
			`实测 ${baseline} 项 vs 文档 ${uniq.join("/")} 项`,
		);
	} else {
		record("INFO", "没有 reports/verify-*.log，跳过与实测比对", true, "先跑 `pnpm verify:ui` 再跑本脚本更严格");
	}

	// 截图张数
	let shots = 0;
	try {
		shots = (await fs.readdir(path.resolve(root, "reports/screenshots"))).filter(
			(f) => f.endsWith(".png") && !f.startsWith("_"),
		).length;
	} catch {
		shots = 0;
	}
	const shotClaims = [];
	const claimShot = (doc, label, re) => {
		const m = allDocs[doc].match(re);
		if (m) shotClaims.push({ doc, label, n: Number(m[1]) });
	};
	claimShot(README, "常用命令表", /界面验收：\d+ 项断言[^|]*?(\d+) 张截图/);
	claimShot("ARCH.md", "§11 说明", /脚本每轮输出\s*(\d+)\s*张截图/);
	claimShot("PROJECT_STATUS.md", "§1 最近变更", /最近变更\*\*：[\s\S]{0,900}?截图[^*\n]{0,24}?\*\*(\d+)\s*张\*\*/);
	const shotUniq = [...new Set(shotClaims.map((c) => c.n))];
	record(
		"截图张数",
		`与 reports/screenshots 实际张数一致（应有 3 处口径 / 实际 ${shots} 张）`,
		shotUniq.length === 1 && shotClaims.length === 3 && shotUniq[0] === shots,
		shotClaims.map((c) => `${c.doc}·${c.label}=${c.n}`).join("  ") || "一处都没匹配到",
	);
}

// ── 4. 排行页清单：实际路由文件 ↔ 文档 ────────────────────
{
	let pages = [];
	try {
		pages = (await fs.readdir(path.resolve(root, "src/pages/rank")))
			.filter((f) => f.endsWith(".astro") && f !== "index.astro")
			.map((f) => `/rank/${f.replace(/\.astro$/, "")}/`)
			.sort();
	} catch {
		pages = [];
	}
	// prd 站点地图（§2）里列出的排行页
	const prdPages = [...prd.matchAll(/\|\s*\*\*([^*]+排行)\*\*\s*\|\s*`(\/rank\/[^`]+)`/g)]
		.map((m) => m[2])
		.sort();
	// ARCH §5.2 文件表里列出的路由文件
	const archFiles = [...arch.matchAll(/`src\/pages\/rank\/([a-z]+)\.astro`/g)].map((m) => `/${m[1]}/`);
	const archPages = [...new Set(archFiles.map((p) => `/rank${p === "/index/" ? "/" : p}`))].sort();

	record(
		"排行页清单",
		"prd §2 站点地图 == src/pages/rank 实际路由",
		pages.length > 0 && JSON.stringify(pages) === JSON.stringify(prdPages),
		`实际 ${pages.join(",")} ｜ prd ${prdPages.join(",")}`,
	);
	record(
		"排行页清单",
		"ARCH §5.2 文件表覆盖全部路由文件",
		pages.every((p) => archPages.includes(p)),
		`ARCH 列出 ${archPages.join(",")}`,
	);
}

// ── 5. 导航子项 ↔ navBarConfig.ts ────────────────────────
{
	const navSrc = await readAny("src/config/navBarConfig.ts");
	// 「排行」那一组的 children：抓 RankXX 预设名，再去预设表里取 url
	const groupMatch = navSrc.match(/name: "排行"[\s\S]*?children: \[([\s\S]*?)\]/);
	const presetNames = groupMatch
		? [...groupMatch[1].matchAll(/LinkPresets\.(\w+)/g)].map((m) => m[1])
		: [];
	const urls = presetNames
		.map((name) => {
			const m = navSrc.match(new RegExp(`${name}:\\s*\\{[^}]*url:\\s*"([^"]+)"`));
			return m?.[1] ?? null;
		})
		.filter(Boolean)
		.sort();
	// prd R-NAV-02 行里列的 /rank/... 路径
	// ⚠️ 必须用行首锚点：文档里还有一行以 `| R-NAV-02 |` 结尾的表格行（"无「排行」"那行），
	//    不锚定行首就会匹配到它、抓出空清单（第一版就这么错了）
	const navLine = prd.match(/^\|\s*R-NAV-02\s*\|.*$/m)?.[0] ?? "";
	const prdUrls = [...new Set([...navLine.matchAll(/`(\/rank\/[^`]+)`/g)].map((m) => m[1]))].sort();

	record(
		"导航子项",
		"prd R-NAV-02 的排行子项 == navBarConfig 实际配置",
		urls.length > 0 && JSON.stringify(urls) === JSON.stringify(prdUrls),
		`配置 ${urls.join(",")} ｜ prd ${prdUrls.join(",")}`,
	);

	// 每个导航子项都要有对应路由文件（否则是死链）
	// Astro 的文件路由：/rank/jp/ → src/pages/rank/jp.astro（不是目录 + index.astro）
	const deadLinks = [];
	for (const u of urls) {
		if (!u.startsWith("/rank/") || u === "/rank/") continue;
		const slug = u.replace(/^\/rank\//, "").replace(/\/$/, "");
		try {
			await fs.access(path.resolve(root, `src/pages/rank/${slug}.astro`));
		} catch {
			deadLinks.push(`${u}（缺 src/pages/rank/${slug}.astro）`);
		}
	}
	record(
		"导航子项",
		"每个排行子项都有实际路由（不是死链）",
		deadLinks.length === 0 && urls.length > 0,
		deadLinks.length ? `缺路由：${deadLinks.join(",")}` : `${urls.length} 个子项都有路由文件`,
	);
}

// ── 6. 需求编号闭环 ─────────────────────────────────────
{
	const defined = new Set([...prd.matchAll(/\|\s*(R-[A-Z]+-\d+)\s*\|/g)].map((m) => m[1]));
	const referenced = new Map();
	for (const [doc, text] of Object.entries(allDocs)) {
		if (doc === "prd.md") continue;
		for (const m of text.matchAll(/\bR-[A-Z]+-\d+\b/g)) {
			if (!referenced.has(m[0])) referenced.set(m[0], new Set());
			referenced.get(m[0]).add(doc);
		}
	}
	const unknown = [...referenced.keys()].filter((id) => !defined.has(id)).sort();
	record(
		"需求编号",
		"文档引用的需求编号都在 prd.md 有定义",
		unknown.length === 0,
		unknown.length ? `无定义：${unknown.join(",")}` : `引用 ${referenced.size} 个编号，全部有定义`,
	);
}

// ── 7. 阻塞项条数与编号连续性 ────────────────────────────
{
	const ids = [...status.matchAll(/\|\s*\*\*(B-\d+)\*\*\s*\|/g)].map((m) => m[1]);
	const claimed = Number(status.match(/阻塞项\s*\|\s*\*\*(\d+)\s*条\*\*/)?.[1] ?? -1);
	const nums = ids.map((x) => Number(x.slice(2))).sort((a, b) => a - b);
	const continuous = nums.every((n, i) => n === i + 1);
	record(
		"阻塞项",
		`条数与表头一致（表头 ${claimed} 条 / 实际 ${ids.length} 条）`,
		claimed === ids.length,
		ids.join(","),
	);
	record("阻塞项", "编号连续（B-01..B-N 无跳号）", continuous, nums.join(","));
}

// ── 8. 阶段状态：§2 阶段表 ↔ §3 小节标题 ─────────────────
{
	const rows = [...status.matchAll(/\|\s*\*\*(P\d)\*\*\s*\|([^\n]*)\n/g)].map((m) => ({
		phase: m[1],
		done: m[2].includes("✅"),
	}));
	const heads = [...status.matchAll(/^###\s*(P\d)\s*([^\n]*)$/gm)].map((m) => ({
		phase: m[1],
		done: m[2].includes("✅"),
	}));
	const mismatched = rows
		.filter((r) => heads.some((h) => h.phase === r.phase && h.done !== r.done))
		.map((r) => {
			const h = heads.find((x) => x.phase === r.phase);
			return `${r.phase}(表=${r.done ? "✅" : "未完成"} / 节=${h.done ? "✅" : "未完成"})`;
		});
	record(
		"阶段状态",
		"§2 阶段表的完成标记与 §3 小节标题一致",
		rows.length > 0 && mismatched.length === 0,
		mismatched.length ? mismatched.join("；") : `${rows.length} 个阶段一致`,
	);
}

// ── 9. 三份文档"最后更新"日期一致 ───────────────────────
{
	const dates = DOCS.map((doc) => ({
		doc,
		d: allDocs[doc].match(/\|\s*最后更新\s*\|\s*\**([\d-]+)\**\s*\|/)?.[1] ?? null,
	}));
	const uniq = [...new Set(dates.map((x) => x.d))];
	record(
		"最后更新",
		"三份文档的最后更新日期一致",
		uniq.length === 1 && uniq[0] !== null,
		dates.map((x) => `${x.doc}=${x.d ?? "缺失"}`).join("  "),
	);
}

// ── 10. 文档声称的"配置当前值" ↔ 真实配置文件 ──────────────
// 这类漂移最隐蔽：文字看着没问题，但配置早就改了（P1 把显示设置面板打开后，
// prd 的 R-ID-07 一开头还写着"默认关闭"）。
{
	// 10a. displaySettingsConfig.enable
	const dsSrc = await readAny("src/config/displaySettingsConfig.ts");
	const dsEnable = /enable:\s*(true|false)/.exec(dsSrc)?.[1] ?? null;
	const prdSaysOn = /R-ID-07[\s\S]{0,900}?现已是\s*`?enable:\s*true/.test(prd);
	record(
		"配置事实",
		`displaySettingsConfig.enable 与 prd R-ID-07 的当前态说法一致（实际 ${dsEnable}）`,
		dsEnable !== null && (dsEnable === "true") === prdSaysOn,
		`配置 enable=${dsEnable}；prd 段落${prdSaysOn ? "有" : "没有"}"现已是 enable: true"`,
	);

	// 10b. rankConfig.dataStatus ↔ 文档是否都说"占位数据"
	const rcSrc = await readAny("src/config/rankConfig.ts");
	const dataStatus = /dataStatus:\s*"(\w+)"/.exec(rcSrc)?.[1] ?? null;
	const placeholderMentions = ["PROJECT_STATUS.md", README].filter((d) =>
		/占位数据/.test(allDocs[d]),
	).length;
	record(
		"配置事实",
		`rankConfig.dataStatus 与文档的"占位/正式"说法一致（实际 ${dataStatus}）`,
		(dataStatus === "placeholder") === placeholderMentions > 0,
		`dataStatus=${dataStatus}；PROJECT_STATUS/README 提到"占位数据"的份数=${placeholderMentions}`,
	);

	// 10c. 出现"4 组数据/4 组榜单"的行，必须同时提到二游（否则就是漏了第 5 份）
	//      —— P2 加二游排行时，B-08 与 README 就是这么停在旧说法的。
	//      注意别把"4 组实测规格"这类说法算进来（那是 R-RANK-03 的四条版式规格），所以要限定后面跟的词。
	const badLines = [];
	for (const [doc, text] of Object.entries(allDocs)) {
		for (const line of text.split("\n")) {
			if (/(4|四)\s*组\s*(数据|榜单)/.test(line) && !/二游/.test(line)) {
				badLines.push(`${doc}: ${line.trim().slice(0, 60)}…`);
			}
		}
	}
	record(
		"配置事实",
		'提到"4 组/四组"排行榜数据的行都同时说明了二游那第 5 份',
		badLines.length === 0,
		badLines.length ? badLines.join(" ｜ ") : "没有漏项",
	);
}

// ── 11. 受版本控制的文本文件不带 UTF-8 BOM ────────────────
// 为什么要查：PowerShell 的 `Set-Content -Encoding UTF8` 在某些版本下会加 BOM，
// 混进源码/文档后 `git diff` 里只表现为首行一个不可见字符，很难发现（本轮真发生过）。
{
	let hits = [];
	try {
		const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
		const isText = /\.(ts|tsx|js|mjs|astro|svelte|css|json|md|yml|yaml|txt|styl)$/i;
		for (const f of tracked) {
			if (!isText.test(f)) continue;
			let buf;
			try {
				buf = await fs.readFile(path.resolve(root, f));
			} catch {
				continue;
			}
			if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) hits.push(f);
		}
	} catch (err) {
		hits = [];
		record("INFO", "读不到 git 文件列表，跳过 BOM 检查", true, err.message);
	}
	if (hits.length || hits.length === 0) {
		record("文件编码", "受版本控制的文本文件不带 UTF-8 BOM", hits.length === 0, hits.join(",") || "干净");
	}
}

// ── 输出 ────────────────────────────────────────────────
let failed = 0;
let passed = 0;
console.log("文档一致性自检（pnpm verify:docs）\n");
for (const r of results) {
	if (r.area === "INFO") {
		console.log(`ℹ️  [INFO] ${r.desc}\n      ${r.detail}`);
		continue;
	}
	if (r.pass) {
		passed++;
		console.log(`✅ [${r.area}] ${r.desc}\n      ${r.detail}`);
	} else {
		failed++;
		console.log(`❌ [${r.area}] ${r.desc}\n      ${r.detail}`);
	}
}
console.log(`\n文档检查 ${passed + failed} 项：通过 ${passed}，失败 ${failed}`);
process.exit(failed === 0 ? 0 : 1);
