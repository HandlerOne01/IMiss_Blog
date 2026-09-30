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
 *   4. 模块路由清单（**v1.40 起"模块无关"**）：`src/pages/rank/*.astro` 还在 → 每个路由文件都要在 ARCH 里登记；
 *      已删（P2R 之后就是这一态）→ prd §2 站点地图不许再留 `/rank/` 条目、ARCH 必须登记替代它的 `src/pages/roadmap.astro`
 *   5. 导航子项（**v1.41 起两态**）：「排行」组还在 → prd R-NAV-02 列的 `/rank/xxx/` == `navBarConfig.ts` 里
 *      「排行」的 children 且都有路由文件；「排行」组已删（现在就是这一态）→ `navBarConfig.ts` 必须有
 *      「学习路线」→ `/roadmap/`（**不带 children**、全文件无「排行」组），且 prd 的 R-NAV-02 行仍存在、不再列任何 `/rank/…`
 *   6. 需求编号闭环：ARCH / PROJECT_STATUS / README 引用的 R-xxx-nn 都能在 prd.md 找到定义
 *   7. 阻塞项：`阻塞项 N 条` == B-xx 行数，且编号连续
 *   8. 阶段状态：§2 标了 ✅ 的阶段，§3 的小节标题也必须带 ✅（反之亦然）
 *   9. "最后更新"日期三份一致
 *  10. 配置事实：`displaySettingsConfig.enable` ↔ 文档说法
 *      （原 10b `rankConfig.dataStatus` 与 10c"4 组数据是否漏了二游那第 5 份"两条随排行模块一并删除，见 P2R-8）
 *  11. 文件编码：受版本控制的文本文件不带 UTF-8 BOM（PowerShell 会偷偷加）
 *      **v1.56 起按内容判文本**（读前 8KB，含 NUL 即跳过），不再用扩展名白名单 ——
 *      白名单漏掉了 `.sh/.ps1/.conf/.service/.toml/.xml/.svg/.env` 与全部无扩展名文件
 *
 * 用法：`pnpm verify:docs`（先跑过 `pnpm verify:ui` 才有最新的 reports 日志做基准；
 * 没有基准日志时**第 2 项判 FAIL**（v1.41 起：那条"跳过比对"的 INFO 让闸门静默失效过，见 T77），其余检查照做）。
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
		// ⚠️ v1.41（Task 6 / 陷阱 T77）：候选过滤**同时接受 `_verify*.log`**。某一轮把实测落成了
		//    `reports/_verify-task2-green.log`（下划线开头，旧过滤 `^verify.*\.log$` 不匹配）→
		//    闸门回退去读**停更的旧日志** → "257 == 257" 报 ✅，而真实值已经是 263。
		//    **文件名不匹配 = 读旧日志 = 计数闸门静默失效**；另一半防御见下面的 else 分支。
		const files = (await fs.readdir(dir)).filter((f) => /^_?verify.*\.log$/.test(f));
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
	push("PROJECT_STATUS.md", "§1 当前口径行", /当前口径[^\n]*?\*\*(\d+)\s*项断言\*\*/);

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
		// ⚠️ v1.41（Task 6 / 陷阱 T77 的防御）：**找不到基准日志必须响亮报错**。
		//    旧写法是一条 `record("INFO", …, true, …)` —— "闸门没读到基准"与"一切正常"长得
		//    一模一样（T77 那轮就是这么静默失效的）。现在按 FAIL 记（名册与区域名不变，
		//    所以检查项数仍是 15 项），并在 detail 里给出补救命令。
		record(
			"断言条数",
			"与最近一次实测一致（reports/ 下没有可用的基准日志）",
			false,
			"reports/ 里找不到任何含「功能断言 N 项」的日志（找过 `verify*.log` 与 `_verify*.log`）→ **计数闸门无从判定，按失败处理**。先跑 `pnpm verify:ui:log --base http://localhost:4323`（它写 UTF-8 的 reports/verify-ui.log），再跑本脚本",
		);
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
	claimShot("PROJECT_STATUS.md", "§1 当前口径行", /当前口径[^\n]*?截图\s*\*\*(\d+)\s*张\*\*/);
	const shotUniq = [...new Set(shotClaims.map((c) => c.n))];
	record(
		"截图张数",
		`与 reports/screenshots 实际张数一致（应有 3 处口径 / 实际 ${shots} 张）`,
		shotUniq.length === 1 && shotClaims.length === 3 && shotUniq[0] === shots,
		shotClaims.map((c) => `${c.doc}·${c.label}=${c.n}`).join("  ") || "一处都没匹配到",
	);
}

// ── 4. 模块路由清单：实际路由文件 ↔ 文档 ────────────────────
// ⚠️ **v1.40 起这一节是"模块无关"的**：P2R 用「学习路线」替换掉「排行」，同一份文档在两个状态下都得自洽。
//    所以判据按"路由文件到底还在不在"分叉，而不是写死 `/rank/`：
//      · `src/pages/rank/` 还在  → 每个路由文件都必须在 ARCH 里有登记（§5 或 §14.4 恢复路径表）
//      · `src/pages/rank/` 已删  → 一个都不许剩，且 ARCH 必须提到替代它的 `src/pages/roadmap.astro`
//    这样"删模块"这件事**要么被登记、要么被断言**，不会出现"代码删了、文档还写着有"或者反过来的静默漂移。
{
	let rankFiles = [];
	let rankGone = false;
	try {
		rankFiles = (await fs.readdir(path.resolve(root, "src/pages/rank"))).filter((f) =>
			f.endsWith(".astro"),
		);
	} catch {
		rankGone = true;
	}
	// prd 站点地图（§2）里列出的排行页
	const prdPages = [...prd.matchAll(/\|\s*\*\*([^*]+排行)\*\*\s*\|\s*`(\/rank\/[^`]+)`/g)]
		.map((m) => m[2])
		.sort();
	const actualPages = rankFiles
		.filter((f) => f !== "index.astro")
		.map((f) => `/rank/${f.replace(/\.astro$/, "")}/`)
		.sort();

	record(
		"模块路由清单",
		rankGone
			? "排行已删除：prd §2 站点地图里不许再留 `/rank/` 条目"
			: "prd §2 站点地图 == src/pages/rank 实际路由",
		rankGone ? prdPages.length === 0 : JSON.stringify(actualPages) === JSON.stringify(prdPages),
		rankGone
			? `src/pages/rank/ 已不存在；prd 残留 ${prdPages.join(",") || "无"}`
			: `实际 ${actualPages.join(",")} ｜ prd ${prdPages.join(",")}`,
	);
	// 删除前：每个路由文件都要在 ARCH 里被登记（§5 或 §14.4）；删除后：ARCH 必须提到替代模块的页面文件
	const unregistered = rankFiles.filter((f) => !arch.includes(`src/pages/rank/${f}`));
	record(
		"模块路由清单",
		rankGone
			? "排行已删除：ARCH 必须提到替代模块的页面（`src/pages/roadmap.astro`）"
			: "ARCH 里能找到每一个排行路由文件（删之前必须有登记）",
		rankGone ? arch.includes("src/pages/roadmap.astro") : unregistered.length === 0,
		rankGone ? `ARCH 提到 roadmap.astro = ${arch.includes("src/pages/roadmap.astro")}` : `未登记：${unregistered.join(",") || "无"}`,
	);
}

// ── 5. 导航子项 ↔ navBarConfig.ts ────────────────────────
// ⚠️ **v1.41 起这一节也是"两态"的**（写法照第 4 节）：P2R 把导航第 3 格从「排行」下拉换成
//    「学习路线」单链接，而**只改其中一处**的漂移在这条检查里最不容易看出来 ——
//    所以判据按"「排行」那一组到底还在不在"分叉，两条断言的名额和记录区名「导航子项」都不动：
//      · 「排行」组还在  → 老判据：prd R-NAV-02 列的 `/rank/…` == `LinkPresets.Rank*` 的实际 url，
//                          且每个子项都有对应路由文件（不是死链）
//      · 「排行」组已删  → 新判据：`navBarConfig.ts` 必须有「学习路线」→ `/roadmap/` 且**不带 children**，
//                          同时全文件不许再出现「排行」组；prd 的 R-NAV-02 行也不许再列 `/rank/…`
{
	const navSrc = await readAny("src/config/navBarConfig.ts");
	const groupGone = !/name:\s*"排行"/.test(navSrc);
	// prd R-NAV-02 行里列的 /rank/... 路径
	// ⚠️ 必须用行首锚点：文档里还有一行以 `| R-NAV-02 |` 结尾的表格行（"无「排行」"那行），
	//    不锚定行首就会匹配到它、抓出空清单（第一版就这么错了）
	const navLine = prd.match(/^\|\s*R-NAV-02\s*\|.*$/m)?.[0] ?? "";
	const prdUrls = [...new Set([...navLine.matchAll(/`(\/rank\/[^`]+)`/g)].map((m) => m[1]))].sort();

	if (groupGone) {
		// 「学习路线」那一项：从 `name: "学习路线"` 到对象收尾的 `}` 之间取 url 与 children
		const rmMatch = navSrc.match(/name:\s*"学习路线"[\s\S]*?\n\t\}/);
		const rmBlock = rmMatch?.[0] ?? "";
		const rmUrl = rmBlock.match(/url:\s*"([^"]+)"/)?.[1] ?? null;
		record(
			"导航子项",
			"「排行」已改「学习路线」：navBarConfig 里是指向 /roadmap/ 的单链接、再无排行组",
			rmUrl === "/roadmap/" && !/children\s*:/.test(rmBlock) && !/name:\s*"排行"/.test(navSrc),
			rmMatch
				? `学习路线 url=${rmUrl} ｜ 块内 children=${/children\s*:/.test(rmBlock)} ｜ navBarConfig 残留「排行」组=${/name:\s*"排行"/.test(navSrc)}`
				: "navBarConfig.ts 里找不到「学习路线」项",
		);
		// prd 侧：R-NAV-02 行不许再挂 `/rank/…`（挂了就是"代码换了、文档没换"）
		// ⚠️ **必须带 `navLine !== ""` 前置条件**（Task 3 审查修复）：光看 `prdUrls.length === 0`
		//    在**整行被删掉**时也会为真（没有行 → 抓不到路径 → "0 条残留"），那是最典型的"判据空过"。
		//    旧分支有 `urls.length > 0` 兜底，新分支不加就比旧的弱 —— 行不存在 = 文档没登记这件事，判红。
		record(
			"导航子项",
			"prd R-NAV-02 行仍存在、且不再列任何 /rank/… 路径",
			navLine !== "" && prdUrls.length === 0,
			navLine === ""
				? "prd 里找不到 `| R-NAV-02 |` 那一行（需求行被删了？）"
				: prdUrls.length
					? `prd 仍列 ${prdUrls.join(",")}`
					: "R-NAV-02 行残留 /rank/ 路径 0 条",
		);
	} else {
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
	// ⚠️ v1.41（P2R）：这里原有两条排行专属检查，随排行模块一起删除（P2R-8）——
	//    10b `rankConfig.dataStatus` ↔ 文档"占位数据"说法（配置文件已不存在，读它只会把脚本整个抛错）；
	//    10c 出现"4 组/四组（数据|榜单）"的行是否都提到二游那第 5 份（榜单只剩 0 份，"第 5 份"无从谈起）。
}

// ── 11. 受版本控制的文本文件不带 UTF-8 BOM ────────────────
// 为什么要查：PowerShell 的 `Set-Content -Encoding UTF8` 在某些版本下会加 BOM，
// 混进源码/文档后 `git diff` 里只表现为首行一个不可见字符，很难发现（本轮真发生过）。
//
// ⚠️ v1.56 判据变更：**从"扩展名白名单"改成"按内容判文本"**。
// 旧口径逐字是 `/\.(ts|tsx|js|mjs|astro|svelte|css|json|md|yml|yaml|txt|styl)$/i`，
// 于是 `.sh/.ps1/.conf/.service/.toml/.xml/.svg/.env` 与**无扩展名**文件
// （`LICENSE` / `.gitignore` / `.gitattributes` / `.npmrc` / `.gitkeep`）**全都不在扫描面内** ——
// v1.55 实测给 `deploy/publish.ps1` 加 BOM 后本门**仍 15/15 全绿**（陷阱 T86 的"路径上没有机器闸门"）。
// 白名单是**开放集合**（永远能再冒出一种没登记的扩展名），所以改成**封闭判据**：
//   `git ls-files` 全量 → 逐个读前 8KB → **含 NUL 字节即视为二进制跳过**（与 `reports/_p48-census.mjs`
//   同一口径）→ 其余一律必须无 BOM。实测本仓库 734 个受版本控制文件里 568 个判为文本、166 个判为二进制
//   （全部是 png/jpg/woff2/webp/otf，**没有一个二进制以 EF BB BF 开头**，故此判据不会误报）。
// 两条"不许静默"的规矩（同 T77 的病因）：
//   ① 某个文件读不出来 → **判红**并把文件与 errno 打进详情，不 `continue` 放过；
//   ② `git ls-files` 本身跑不起来 → **判红**（原来是记一条 `pass=true` 的 INFO，等于闸门静默失效）。
{
	const PROBE = 8192; // 只读前 8KB：够判 NUL，也不去全量读大文件
	const bomHits = [];
	const readErrors = [];
	let tracked = null;
	try {
		tracked = execFileSync("git", ["ls-files", "-z"], {
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
		})
			.split("\0")
			.filter(Boolean)
			.filter((f) => !f.startsWith(".git/"));
	} catch (err) {
		record(
			"文件编码",
			"受版本控制的文本文件不带 UTF-8 BOM",
			false,
			`git ls-files 跑不起来，本项无法执行（不静默放过）：${err.message}`,
		);
	}
	if (tracked) {
		let textFiles = 0;
		let binaryFiles = 0;
		for (const f of tracked) {
			let buf;
			try {
				const fd = await fs.open(path.resolve(root, f), "r");
				try {
					const b = Buffer.allocUnsafe(PROBE);
					const { bytesRead } = await fd.read(b, 0, PROBE, 0);
					buf = b.subarray(0, bytesRead);
				} finally {
					await fd.close();
				}
			} catch (err) {
				readErrors.push(`${f}(${err.code ?? err.message})`);
				continue;
			}
			if (buf.includes(0)) {
				binaryFiles++; // 二进制：跳过（NUL 口径）
				continue;
			}
			textFiles++;
			if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) bomHits.push(f);
		}
		const parts = [`扫描 ${tracked.length} 个受版本控制文件（文本 ${textFiles} / 二进制跳过 ${binaryFiles}）`];
		if (bomHits.length) parts.push(`命中 BOM ${bomHits.length} 个：${bomHits.join(",")}`);
		else parts.push("命中 BOM 0 个");
		if (readErrors.length) parts.push(`读失败 ${readErrors.length} 个（判红，不静默跳过）：${readErrors.join(",")}`);
		record(
			"文件编码",
			"受版本控制的文本文件不带 UTF-8 BOM（按内容判文本，含无扩展名文件）",
			bomHits.length === 0 && readErrors.length === 0,
			parts.join("；"),
		);
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
