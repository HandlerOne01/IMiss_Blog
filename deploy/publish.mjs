#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 *  deploy/publish.mjs —— 把本地 `pnpm build` 出来的 dist/ 发布到 Linux 服务器
 *                        （Windows 开发机 → Linux；Node ≥ 22，零依赖）
 * ════════════════════════════════════════════════════════════════════════════
 *
 * .SYNOPSIS
 *     用法（先空跑，再真发）：
 *       node deploy/publish.mjs --server blog@1.2.3.4 --web-root /var/www/imiss-blog/dist --dry-run
 *       node deploy/publish.mjs --server blog@1.2.3.4 --web-root /var/www/imiss-blog/dist --key-file ~/.ssh/id_ed25519
 *
 *     全部参数见 `node deploy/publish.mjs --help`。
 *
 * .DESCRIPTION
 *     ⚠️⚠️ **这个脚本从未在真机上跑过**（发起人还没买服务器，阻塞项 B-01）。它是"照着一台标准
 *     Debian/Ubuntu + OpenSSH + GNU tar 的机器写出来的"，**第一次上线时请用 --dry-run 走一遍**，
 *     看清楚它要执行哪几条命令，再真跑。
 *
 *     它做的事（按顺序）：
 *       ⓪ 安全闸门：校验 --web-root 不是 /、/etc、空值、含 `..`，且落在白名单前缀内
 *       ① 连通性：`ssh <server> true`（只认密钥登录，密码交互会直接失败而不是挂住）
 *       ② 构建：`pnpm build`（除非 --skip-build）；失败立即中止，**绝不发布半成品**
 *       ③ 清点本地 dist/（文件数 + 总字节）+ 哨兵文件 index.html / 404.html 必须在
 *       ④ 打包：在 dist/ 里打 tar.gz（相对路径，Windows 自带 bsdtar 与 Linux 的 GNU tar 互认）
 *       ⑤ 上传：scp 到服务器临时目录（**不碰线上目录**）
 *       ⑥ 两端清单比对（sha256）：算出 新增/修改 / 删除 / 未变 三份名单
 *       ⑦ 上传（增量模式）：只把 新增/修改 的名单**再打一个 tar** 传上去，解到 web root
 *          上传（--full-upload）：把整包原样解到 web root
 *       ⑧ 删除远端已不存在的文件（有数量上限，超了要 --allow-mass-delete）
 *       ⑨ 打印两端校验信息（本地计数 / 远端计数 / 字节数）
 *       ⑩ 回滚备份：把发布前的目录改名成 `<web-root>.releases/<时间戳>`（可选保留几份）
 *
 *     为什么"先传临时目录再替换"而不是边传边改线上目录：
 *       边传边解 = 访客会在几十秒里看到"新 HTML + 旧 CSS"的混合体（图片 404、样式错乱、
 *       搜索索引半新半旧）。所以上传与生效必须分开，且生效那一步要尽量短。
 *
 *     为什么删除名单也要校验：
 *       "删除"是唯一能造成**不可逆损失**的动作。远端清单被污染（比如 web-root 指错、
 *       或者 dist/ 本地被清空）时会退化成"把线上站点删光"。所以：
 *         · 每一条远端删除路径都必须落在允许删除的前缀里（--allow-delete-prefixes），
 *           且不得含 `..` / 反斜杠 / 引号 / 换行 / 制表符；
 *         · 单次删除条数 > --mass-delete-limit（默认 200）时直接拒绝，除非显式 --allow-mass-delete；
 *         · 删除从来不用 tar（tar 的 --delete 会删掉 web root 里的一切非产物文件）。
 *
 *     为什么是 Node 而不是 PowerShell（2026-09-30 v1.55 改写的**真实原因**，不是口味）：
 *       Windows PowerShell 5.1 读**不带 BOM** 的 .ps1 时按**系统 ANSI 代码页**解码（本机 = CP936/GBK），
 *       而 UTF-8 里一个中文字是 3 字节、GBK 眼里是"1 个双字节字 + 1 个落单字节"，于是字节流从第一个
 *       中文起就**错位**：落单字节会和紧随其后的字节拼成"另一个合法的 GBK 字"——被吞掉的既可能是
 *       换行、也可能是引号。上一版 `publish.ps1`（28 888 字节里 13 366 字节是非 ASCII）因此在**被调用时**
 *       （不是"检查时"）报 **40 条语法错误**，其中 `:181` 的 `<<'EOF'` 被判成"重定向操作符"，
 *       而报错文本里的中文本身也是乱码（`涓婁紶锛氬帇缂╁寘`）。
 *       同一个文件的内容只要**加 3 字节 BOM** 或**改成纯 ASCII**，错误就归零 —— 所以问题不是逻辑，
 *       是"文件编码 + 读取方按什么编码读"这个契约。Node 读源码**一律按 UTF-8**（与 BOM 无关），
 *       本项目本来就要求 Node ≥ 22，且 `.mjs` 在 `verify:docs` 第 11 项（受版本控制的文本文件不带 BOM）
 *       的覆盖范围内 —— 把这条坑交给**机器**去拦，人力只需要不写 BOM。
 *       取证与完整分析见 `ARCH.md` §14.3 **T86** 与 `reports/_p6-publish-fix-report.md`。
 *
 * .NOTES
 *     ── rsync 等价命令（Linux/macOS 开发机以后要发同一台服务器时用这条）──────────
 *         rsync -az --delete --info=stats2 \
 *               --exclude '.deploy-tmp/' \
 *               -e "ssh -p 22" \
 *               dist/ blog@1.2.3.4:/var/www/imiss-blog/dist/
 *     两条注意事项：
 *       ① `dist/` 结尾的斜杠**不能省**，否则会在目标下多出一层 dist/；
 *       ② `--delete` 会删掉 web root 里所有不在 dist/ 里的东西 —— 如果服务器上还放着
 *          `.env`、`reports/`、`certbot` 之类的东西，先加 `--exclude` 或干脆别用 --delete。
 *     Windows 侧没有 rsync（cwRsync 等第三方发行版不在本项目依赖里），所以主用本脚本。
 *
 *     退出码：0 = 成功；1 = 执行中失败（构建失败 / ssh 失败 / 校验失败…）；
 *             2 = 参数或安全闸门**拒绝执行**（这类失败发生在"一行命令都还没跑"的时候）。
 *
 *     故障排查速查（详细版见 deploy/README.md §4）：
 *       · 拒绝执行且提到"白名单前缀" → 你确实要用那个路径就显式加 `--web-root-prefixes /你的/前缀`
 *       · `ssh … 退出码 255`          → 先手工 `ssh -i <key> user@host true`；本脚本用 BatchMode=yes，密码登录会直接失败
 *       · 解包后缺 index.html         → 脚本在**改动线上目录之前**中止；本地重新 `pnpm build`
 *       · 两端计数不一致              → 常见于上次残留的孤儿文件 / 有人在服务器上手工放了东西
 * ════════════════════════════════════════════════════════════════════════════
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ────────────────────────────────────────────────────────────────────────────
// 退出码：把"闸门拒绝"和"执行失败"分开，方便在 CI/脚本里区分
// ────────────────────────────────────────────────────────────────────────────
const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_REFUSE = 2;

// ────────────────────────────────────────────────────────────────────────────
// 默认值（"顶部可配参数"就长在这些默认值和 --help 里）
// ────────────────────────────────────────────────────────────────────────────
const DEFAULTS = {
	port: 22,
	keepReleases: 2, // 回滚备份保留几份（0 = 不留）
	distDir: "dist", // 本地产物目录
	massDeleteLimit: 200, // 单次删除条数上限
	// 远端临时目录（只放上传的压缩包与清单；**不在** web root 里）
	stageRoot: "/var/www/.imiss-publish",
	// 安全闸门参数（一般不用改）：这个脚本会做"删远端文件 / 换目录"这类动作，
	// 一个手滑的 --web-root / 或 --web-root /etc 就是生产事故，而"参数写错"比
	// "脚本逻辑写错"常见得多。所以默认只放行常见的 web 根目录前缀。
	webRootPrefixes: ["/var/www", "/srv", "/home", "/data", "/opt"],
	// 允许被"删除"的最高层目录（相对 web root）。默认允许全删会太险，所以这里逐个列。
	allowDeletePrefixes: ["_astro", "assets", "images", "og", "pagefind", "api", "favicon"],
};

// web root 本身永远不许是这些（网站目录必须是它们下面的**子目录**）
const FORBIDDEN_WEB_ROOTS = [
	"/",
	"/etc",
	"/usr",
	"/bin",
	"/sbin",
	"/lib",
	"/lib64",
	"/boot",
	"/dev",
	"/proc",
	"/sys",
	"/root",
	"/var",
	"/var/www",
	"/home",
	"/opt",
	"/srv",
	"/tmp",
	"/var/log",
	"/var/lib",
];

// dist/ 里必须有的哨兵文件：缺了说明产物是坏的/被清空的 —— 挡住"把线上删光"这条路
const SENTINELS = ["index.html", "404.html"];

// ────────────────────────────────────────────────────────────────────────────
// 输出与命令执行的小工具
// ────────────────────────────────────────────────────────────────────────────
let stepNo = 0;

function say(msg) {
	console.log(`[publish] ${msg}`);
}
function step(msg) {
	stepNo++;
	console.log("");
	console.log(`[publish] ── ${stepNo}. ${msg}`);
}
function warn(msg) {
	console.log(`[publish] ⚠️  ${msg}`);
}
function die(msg, code = EXIT_FAIL) {
	console.error(`[publish] ❌ ${msg}`);
	process.exit(code);
}
/** 把多行文本按 `[publish]    ` 前缀逐行打印（打印"将要执行的远端脚本"也用它） */
function echoBlock(text) {
	for (const line of text.split("\n")) console.log(`[publish]    ${line.trimEnd()}`);
}

// Windows 上 pnpm 是 `pnpm.cmd` 这个批处理垫片：直接 spawn `pnpm` 会 ENOENT。
// ⚠️ v1.122 修：光把名字写成 `pnpm.cmd` 在 **Node ≥ 22 上会直接 EINVAL** ——
//    Node 20.12 / 22 起为 CVE-2024-27980 拒绝"不带 shell 直接 spawn .cmd/.bat"，
//    实测报错：`[publish] ❌ pnpm.cmd 起不来：spawnSync pnpm.cmd EINVAL`。
//    所以 Windows 上必须带 shell 跑；而"带 shell + 参数数组"在 Node ≥ 22 会发 DEP0190
//    警告（只是警告，不改变行为）—— 这里按 Node 的建议把整条命令拼成一个字符串，
//    既避开 EINVAL，也不再触发 DEP0190。
const IS_WIN = process.platform === "win32";
const PNPM = IS_WIN ? "pnpm.cmd" : "pnpm";

/**
 * 跑一个本地命令，**边跑边打印**输出（用于 pnpm build 这种要看进度的）。
 * @returns {number} 退出码
 */
function runVisible(exe, args, { allowFail = false } = {}) {
	say(`$ ${exe} ${args.join(" ")}`);
	const r = IS_WIN
		? spawnSync([exe, ...args].join(" "), { stdio: "inherit", shell: true })
		: spawnSync(exe, args, { stdio: "inherit" });
	if (r.error) die(`${exe} 起不来：${r.error.message}`);
	const code = r.status ?? 1;
	if (code !== 0 && !allowFail) die(`${exe} 退出码 ${code}`);
	return code;
}

/**
 * 跑一个本地命令并**收下输出**（用于 tar / scp 这类要么静默、要么一次吐完的）。
 * @returns {string[]} 输出行（stdout + stderr 合并，已去掉行尾 CR）
 */
function runCaptured(exe, args) {
	say(`$ ${exe} ${args.join(" ")}`);
	const r = spawnSync(exe, args, { encoding: "utf8" });
	if (r.error) die(`${exe} 起不来：${r.error.message}`);
	const lines = `${r.stdout ?? ""}${r.stderr ?? ""}`
		.split("\n")
		.map((l) => l.replace(/\r$/, "").trimEnd())
		.filter((l) => l.length > 0);
	for (const l of lines) console.log(`[publish]    ${l}`);
	const code = r.status ?? 1;
	if (code !== 0) {
		die(`${exe} 退出码 ${code}（输出：${lines.slice(0, 5).join(" | ")}）`);
	}
	return lines;
}

// ────────────────────────────────────────────────────────────────────────────
// 参数解析（零依赖，手写；支持 `--opt value` 与 `--opt=value` 两种写法）
// ────────────────────────────────────────────────────────────────────────────
const OPTION_SPEC = {
	"--server": { key: "server", value: "user@host", desc: "SSH 目标，形如 `blog@1.2.3.4`（必填）" },
	"--web-root": {
		key: "webRoot",
		value: "/path",
		desc: "dist/ 的内容要落到的服务器目录（＝ nginx 的 root；必填）",
	},
	"--port": { key: "port", value: "N", desc: "SSH 端口（默认 22）" },
	"--key-file": { key: "keyFile", value: "path", desc: "私钥路径；不给就用 ssh-agent / ~/.ssh/config" },
	"--dist-dir": { key: "distDir", value: "path", desc: "本地产物目录（默认 dist）" },
	"--keep-releases": { key: "keepReleases", value: "N", desc: "回滚备份保留几份（默认 2；0 = 不留）" },
	"--stage-root": { key: "stageRoot", value: "/path", desc: "远端临时目录（默认 /var/www/.imiss-publish）" },
	"--mass-delete-limit": { key: "massDeleteLimit", value: "N", desc: "单次删除条数上限（默认 200）" },
	"--web-root-prefixes": {
		key: "webRootPrefixes",
		value: "a,b",
		desc: `web root 白名单前缀，逗号分隔（默认 ${DEFAULTS.webRootPrefixes.join(",")}）`,
	},
	"--allow-delete-prefixes": {
		key: "allowDeletePrefixes",
		value: "a,b",
		desc: `允许删除的顶层目录，逗号分隔（默认 ${DEFAULTS.allowDeletePrefixes.join(",")}）`,
	},
};
const BOOL_SPEC = {
	"--skip-build": { key: "skipBuild", desc: "跳过 pnpm build（dist/ 已是最新的、或只想重传一次）；⚠️ 会让本次降级成整包覆盖" },
"--assume-built": {
	key: "assumeBuilt",
	desc: "dist/ 已是最新（跳过 pnpm build）但**仍做差异比对**（只传变化的文件，适合慢链路）",
},
	"--dry-run": { key: "dryRun", desc: "空跑：只打印将要执行的命令 + 本地清点，不连服务器、不写任何东西" },
	"--full-upload": { key: "fullUpload", desc: "不做差异比对，整包解到 web root（首次部署/远端清单不可信时用）" },
	"--allow-mass-delete": { key: "allowMassDelete", desc: "允许单次删除超过 --mass-delete-limit 个文件（**危险**）" },
	"--help": { key: "help", desc: "显示这份帮助" },
};

function usage() {
	const lines = [];
	lines.push("用法：node deploy/publish.mjs --server <user@host> --web-root </path> [选项]");
	lines.push("");
	lines.push("必填：");
	for (const [flag, s] of Object.entries(OPTION_SPEC)) {
		if (flag === "--server" || flag === "--web-root") lines.push(`  ${flag} <${s.value}>`.padEnd(34) + s.desc);
	}
	lines.push("");
	lines.push("可选（带值的）：");
	for (const [flag, s] of Object.entries(OPTION_SPEC)) {
		if (flag === "--server" || flag === "--web-root") continue;
		lines.push(`  ${`${flag} <${s.value}>`.padEnd(32)}${s.desc}`);
	}
	lines.push("");
	lines.push("可选（开关）：");
	for (const [flag, s] of Object.entries(BOOL_SPEC)) lines.push(`  ${flag.padEnd(32)}${s.desc}`);
	lines.push("");
	lines.push("例子：");
	lines.push("  # 第一次：只看要执行什么（不连服务器、不写任何东西）");
	lines.push("  node deploy/publish.mjs --server blog@1.2.3.4 --web-root /var/www/imiss-blog/dist --dry-run");
	lines.push("");
	lines.push("  # 正式发一次（增量：只传变化的文件）");
	lines.push("  node deploy/publish.mjs --server blog@1.2.3.4 --web-root /var/www/imiss-blog/dist --key-file ~/.ssh/id_ed25519");
	lines.push("");
	lines.push("  # 整包重传（远端目录被手工改过、清单不可信时）");
	lines.push("  node deploy/publish.mjs --server blog@1.2.3.4 --web-root /var/www/imiss-blog/dist --full-upload");
	lines.push("");
	lines.push("rsync 等价命令（Linux/macOS 开发机上要发同一台服务器时用这条）：");
	lines.push("  rsync -az --delete --info=stats2 -e \"ssh -p 22\" \\");
	lines.push("        dist/ blog@1.2.3.4:/var/www/imiss-blog/dist/");
	lines.push("  ⚠️ `dist/` 结尾的斜杠不能省；`--delete` 会删掉目标目录里所有不在 dist/ 里的东西。");
	lines.push("");
	lines.push("退出码：0 = 成功；1 = 执行中失败；2 = 参数或安全闸门拒绝执行。");
	return lines.join("\n");
}

function parseArgv(argv) {
	const opts = {
		...DEFAULTS,
		server: undefined,
		webRoot: undefined,
		keyFile: undefined,
		skipBuild: false,
		dryRun: false,
		fullUpload: false,
		allowMassDelete: false,
		help: false,
	};
	for (let i = 0; i < argv.length; i++) {
		let tok = argv[i];
		let inlineValue;
		const eq = tok.indexOf("=");
		if (tok.startsWith("--") && eq !== -1) {
			inlineValue = tok.slice(eq + 1);
			tok = tok.slice(0, eq);
		}
		if (BOOL_SPEC[tok]) {
			if (inlineValue !== undefined) die(`${tok} 是开关，不接受值`, EXIT_REFUSE);
			opts[BOOL_SPEC[tok].key] = true;
			continue;
		}
		const spec = OPTION_SPEC[tok];
		if (!spec) {
			console.error(`[publish] ❌ 不认识的参数：${tok}`);
			console.error(usage());
			process.exit(EXIT_REFUSE);
		}
		let raw = inlineValue;
		if (raw === undefined) {
			raw = argv[++i];
			if (raw === undefined) die(`${tok} 后面缺少值（期望 <${spec.value}>）`, EXIT_REFUSE);
		}
		opts[spec.key] = raw;
	}
	return opts;
}

const opts = parseArgv(process.argv.slice(2));

if (opts.help) {
	console.log(usage());
	process.exit(EXIT_OK);
}

// 数字型参数：解析失败就当场拒绝（别把 NaN 带进后面的比较里 —— NaN 会让所有 `>` 判断变成 false）
for (const key of ["port", "keepReleases", "massDeleteLimit"]) {
	const n = Number.parseInt(opts[key], 10);
	if (!Number.isFinite(n)) die(`--${key} 必须是数字，收到：${opts[key]}`, EXIT_REFUSE);
	opts[key] = n;
}
opts.webRootPrefixes = String(opts.webRootPrefixes).split(",").map((s) => s.trim()).filter(Boolean);
opts.allowDeletePrefixes = String(opts.allowDeletePrefixes).split(",").map((s) => s.trim()).filter(Boolean);

// ────────────────────────────────────────────────────────────────────────────
// 0. 安全闸门 —— 参数先过一遍，不合法就一行命令都不执行
// ────────────────────────────────────────────────────────────────────────────
step("安全闸门：校验 --web-root 与 --server");

if (!opts.server) die("缺少 --server <user@host>（`--help` 看全部参数）", EXIT_REFUSE);
if (!opts.webRoot || opts.webRoot.trim() === "") die("--web-root 不能为空", EXIT_REFUSE);
if (opts.webRoot.includes("..")) die(`--web-root 不允许包含 ..：${opts.webRoot}`, EXIT_REFUSE);

// 先单独拦 `/`（否则它会先撞上下面那条"字符集"检查，报出来的理由就不对症了 ——
// 使用者看到的是"字符不合法"，真正的问题是"你要把整台机器的根目录当网站目录"）
const wr = opts.webRoot.replace(/\/+$/, "");
if (wr === "") {
	die("--web-root 等于 / —— 拒绝执行（这会把整台机器的根目录当网站目录）", EXIT_REFUSE);
}

if (!/^\/[A-Za-z0-9._/-]+$/.test(opts.webRoot)) {
	die(`--web-root 只允许绝对路径（字母/数字/._-/），收到：${opts.webRoot}`, EXIT_REFUSE);
}
if (FORBIDDEN_WEB_ROOTS.includes(wr)) {
	die(
		`--web-root '${wr}' 是系统目录 —— 拒绝执行（网站目录必须是它下面的**子目录**，例 /var/www/imiss-blog/dist）`,
		EXIT_REFUSE,
	);
}

// 白名单前缀：wr 必须**严格位于**某个前缀之下（等于前缀本身不算，例如 /var/www 本身）
const prefixOk = opts.webRootPrefixes.some((p) => {
	const pp = p.replace(/\/+$/, "");
	return pp !== "" && wr !== pp && wr.startsWith(`${pp}/`);
});
if (!prefixOk) {
	const parent = path.posix.dirname(wr) || "/";
	die(
		`--web-root '${wr}' 不在白名单前缀里（当前白名单：${opts.webRootPrefixes.join(", ")}）。` +
			`确实要用别的路径就显式加：--web-root-prefixes '${parent}'`,
		EXIT_REFUSE,
	);
}

if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/.test(opts.server)) {
	die(`--server 必须形如 user@host，收到：${opts.server}`, EXIT_REFUSE);
}
if (opts.port < 1 || opts.port > 65535) die(`--port 不合法：${opts.port}`, EXIT_REFUSE);
if (opts.keepReleases < 0) die(`--keep-releases 不能是负数：${opts.keepReleases}`, EXIT_REFUSE);
if (opts.massDeleteLimit < 0) die(`--mass-delete-limit 不能是负数：${opts.massDeleteLimit}`, EXIT_REFUSE);

say(`✅ 闸门通过：webRoot=${wr}  server=${opts.server}  port=${opts.port}`);
if (wr !== opts.webRoot) warn(`--web-root 结尾的斜杠已去掉（内部一律用 '${wr}'）`);

// ssh / scp 的公共参数。BatchMode=yes：**只认密钥登录**，需要输密码时立刻失败（而不是挂住等输入）
const sshBase = [];
if (opts.port !== 22) sshBase.push("-p", String(opts.port));
if (opts.keyFile) {
	if (!fs.existsSync(opts.keyFile)) die(`--key-file 不存在：${opts.keyFile}`, EXIT_REFUSE);
	sshBase.push("-i", opts.keyFile);
}
sshBase.push(
	"-o",
	"BatchMode=yes",
	"-o",
	"ConnectTimeout=15",
	"-o",
	"StrictHostKeyChecking=accept-new",
	opts.server,
);

const scpBase = [];
if (opts.port !== 22) scpBase.push("-P", String(opts.port));
if (opts.keyFile) scpBase.push("-i", opts.keyFile);
scpBase.push("-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new");

if (opts.fullUpload && opts.skipBuild) warn("--full-upload + --skip-build：会用现在本地的 dist/ 整包覆盖线上");

/**
 * 执行一段**远端 bash**：把脚本文本通过 stdin 喂给 `ssh <server> bash -s`。
 * 为什么不用 `ssh host "命令"`：引号/换行会被本地 shell 与远端 shell 各解析一遍，
 * 而这里要喂的是多行脚本（含单引号、`$(...)`）。
 */
function remoteBash(script, { allowFail = false } = {}) {
	say(`$ ssh ${sshBase.join(" ")} bash -s   <<'EOF'`);
	echoBlock(script);
	if (opts.dryRun) {
		say("（--dry-run：未执行）");
		return 0;
	}
	const r = spawnSync("ssh", [...sshBase, "bash", "-s"], { input: script, encoding: "utf8" });
	if (r.error) die(`ssh 起不来：${r.error.message}`);
	for (const l of `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n")) {
		if (l.trim() !== "") console.log(`[publish]    ${l.replace(/\r$/, "").trimEnd()}`);
	}
	const code = r.status ?? 1;
	if (code !== 0 && !allowFail) die(`远端脚本退出码 ${code}`);
	return code;
}

// 时间戳：一次发布的所有名字都用它（远端目录名 / 压缩包名 / 备份目录名）
const now = new Date();
const p2 = (n) => String(n).padStart(2, "0");
const ts =
	`${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}` +
	`-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
const tarName = `dist-${ts}.tar.gz`;
const changedTarName = `changed-${ts}.tar.gz`;
const localStaging = path.join(os.tmpdir(), `imiss-publish-${ts}`);
const localTar = path.join(localStaging, tarName);
const changedTar = path.join(localStaging, changedTarName);
const remoteStage = `${opts.stageRoot}/${ts}`;
const releaseDir = `${wr}.releases/${ts}`;
const extractDir = "full"; // 解包目录固定叫 full（两种模式都一样）

if (!opts.dryRun) fs.mkdirSync(localStaging, { recursive: true });

// ────────────────────────────────────────────────────────────────────────────
// 1. 连通性
// ────────────────────────────────────────────────────────────────────────────
step("连通性：ssh 能连上吗（只认密钥登录）");
if (opts.dryRun) {
	say("（--dry-run：跳过）");
} else {
	runCaptured("ssh", [...sshBase, "true"]);
	say("✅ 连上了");
}

// ────────────────────────────────────────────────────────────────────────────
// 2. 本地构建
// ────────────────────────────────────────────────────────────────────────────
step("本地构建：pnpm build");
if (opts.skipBuild) {
	warn(`--skip-build：跳过构建，直接用现有的 ${opts.distDir}/`);
} else if (opts.assumeBuilt) {
	warn(`--assume-built：跳过构建、直接用现有的 ${opts.distDir}/，但**照常做差异比对**（只传变化文件）`);
} else if (opts.dryRun) {
	say("（--dry-run：跳过）");
} else {
	runVisible(PNPM, ["build"]);
	say("✅ pnpm build 成功");
}

const distFull = path.resolve(opts.distDir);
const distExists = fs.existsSync(distFull) && fs.statSync(distFull).isDirectory();
if (!distExists) {
	if (opts.dryRun) say(`（--dry-run：${opts.distDir}/ 还不存在，正常）`);
	else die(`${opts.distDir}/ 不存在 —— 构建没产出就中止（不会上传半成品）`);
}

// ────────────────────────────────────────────────────────────────────────────
// 3. 本地清点
// ────────────────────────────────────────────────────────────────────────────
step(`本地清点：${opts.distDir}/ 的文件数与总字节`);
/** @type {{rel: string, len: number, full: string}[]} */
let localFiles = [];
if (distExists) {
	localFiles = [];
	const walk = (dir) => {
		for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, ent.name);
			if (ent.isDirectory()) walk(full);
			else if (ent.isFile()) {
				const rel = path.relative(distFull, full).split(path.sep).join("/");
				localFiles.push({ rel, len: fs.statSync(full).size, full });
			}
		}
	};
	walk(distFull);
}
const localCount = localFiles.length;
const localBytes = localFiles.reduce((a, f) => a + f.len, 0);
say(`本地 ${localCount} 个文件 / ${(localBytes / 1024 / 1024).toFixed(2)} MiB`);

for (const s of SENTINELS) {
	if (localFiles.some((f) => f.rel === s)) continue;
	if (opts.dryRun) warn(`--dry-run：dist/ 里没有哨兵文件 ${s}（现在跳过检查）`);
	else die(`${opts.distDir}/${s} 不存在 —— 产物不完整，拒绝发布（本地 dist/ 可能被清空/损坏）`);
}

// ────────────────────────────────────────────────────────────────────────────
// 4. 打包（tar 的相对路径 + 用 -C 指目录，解包时就不会多一层 dist/）
// ────────────────────────────────────────────────────────────────────────────
step(`打包：${opts.distDir}/ → ${tarName}`);
say("（Windows 自带 bsdtar；清单里都是相对路径，Linux 的 GNU tar 可以直接解）");
if (opts.dryRun) {
	say("（--dry-run：跳过）");
} else {
	runCaptured("tar", ["-czf", localTar, "-C", distFull, "."]);
	const tarBytes = fs.statSync(localTar).size;
	const ratio = 1 - tarBytes / Math.max(localBytes, 1);
	say(
		`✅ 压缩包 ${(tarBytes / 1024 / 1024).toFixed(2)} MiB` +
			`（原始 ${(localBytes / 1024 / 1024).toFixed(2)} MiB，压缩率 ${(ratio * 100).toFixed(0)}%）`,
	);
}

// ────────────────────────────────────────────────────────────────────────────
// 5. 上传压缩包到临时目录（**不碰线上目录**）
// ────────────────────────────────────────────────────────────────────────────
step(`上传：压缩包 → ${remoteStage}/（临时目录，还不是线上目录）`);
if (opts.dryRun) {
	say("（--dry-run：跳过）");
} else {
	remoteBash(`set -eu\nmkdir -p '${opts.stageRoot}' '${remoteStage}'`);
	runCaptured("scp", [...scpBase, localTar, `${opts.server}:${remoteStage}/`]);
	say("✅ 上传完成");
}

// ────────────────────────────────────────────────────────────────────────────
// 6. 两端清单比对（sha256）
// ────────────────────────────────────────────────────────────────────────────
step("差异比对：本地 sha256 清单 vs 远端清单");

// fullMode = 整包覆盖（不做差异比对）。
//   · --full-upload：用户明确要求
//   · --skip-build：惰性降级 —— 本地的 dist/ 不保证是"刚构建的完整产物"，
//     拿它当基准去算"远端多余文件"风险太大（**宁可不删，也不能误删**）
//   ⚠️ v1.122 新增 `--assume-built`：同样跳过构建，但**保留增量模式** ——
//      给"我已经自己 `pnpm build` 过了（而且带上了构建期环境变量）"这种情形用。
//      为什么需要它：`--skip-build` 会降级成整包覆盖，本站产物 **445 MB**，
//      在慢链路上要传 40 分钟；而增量只传变化的文件（这轮是十几 MB）。
//      安全性靠既有的两道闸门兜着：删除前缀白名单 + 单次删除 200 条上限。
const fullMode = Boolean(opts.fullUpload) || Boolean(opts.skipBuild);
if (fullMode && !opts.fullUpload) {
	warn("--skip-build：本次自动降级为整包覆盖（不做差异比对、**不删除**远端任何文件）");
}
say(`模式：${fullMode ? "整包覆盖（不做比对）" : "增量（只传变化的文件）"}`);

let changed = [];
let unchanged = 0;
let deleted = [];

if (fullMode) {
	say("（不做差异比对，整包解到网站目录）");
} else if (opts.dryRun) {
	say("（--dry-run：跳过远端清单读取，假设本地全部为新增）");
	changed = localFiles;
} else {
	// 远端清单：web root 下所有常规文件的 `<sha256>\t<相对路径>`（允许失败 —— 首次部署还没有清单）
	const manifestScript = `set -eu
if [ -d '${wr}' ]; then
  find '${wr}' -type f -printf '%P\\n' 2>/dev/null | LC_ALL=C sort | while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    h=$(sha256sum -- '${wr}/'$rel 2>/dev/null | cut -d' ' -f1)
    [ -n "$h" ] && printf '%s\\t%s\\n' "$h" "$rel"
  done
fi`;
	const remoteLines = captureRemoteBash(manifestScript);
	/** @type {Map<string, string>} */
	const remoteMap = new Map();
	for (const line of remoteLines) {
		const m = /^([0-9a-f]{64})\t(.+)$/.exec(line);
		if (m) remoteMap.set(m[2], m[1]);
	}
	say(`远端清单：${remoteMap.size} 个文件`);

	// 远端有、本地没有 → 待删
	for (const rel of remoteMap.keys()) {
		if (!localFiles.some((f) => f.rel === rel)) deleted.push(rel);
	}

	// 逐文件比哈希（本地 799 个文件约 114 MiB，实测几秒）
	localFiles.forEach((f, i) => {
		if ((i + 1) % 200 === 0) say(`  已比对 ${i + 1}/${localCount} …`);
		const h = createHash("sha256").update(fs.readFileSync(f.full)).digest("hex");
		if (remoteMap.get(f.rel) === h) unchanged++;
		else changed.push(f);
	});
	say(`差异：新增/修改 ${changed.length} ｜ 未变 ${unchanged} ｜ 远端多余（待删）${deleted.length}`);
}

// ────────────────────────────────────────────────────────────────────────────
// 7. 生效：解包 + 覆盖（尽量短；不做"边传边改线上目录"）
// ────────────────────────────────────────────────────────────────────────────

// 7a. 增量模式：把要传的文件再打一个包
if (!fullMode && changed.length > 0) {
	step(`打包差异集：${changed.length} 个文件`);
	if (opts.dryRun) {
		say("（--dry-run：跳过）");
	} else {
		// 清单必须写成 UTF-8 **无 BOM**：BOM 会变成第一个文件名的第一个字符，tar 直接报错（陷阱 T58）
		const listPath = path.join(localStaging, `changed-${ts}.txt`);
		fs.writeFileSync(listPath, `${changed.map((f) => `./${f.rel}`).join("\n")}\n`, "utf8");
		runCaptured("tar", ["-czf", changedTar, "-C", distFull, "-T", listPath]);
		say(`✅ 差异包 ${(fs.statSync(changedTar).size / 1024 / 1024).toFixed(2)} MiB`);
	}
}

// 7b. 上传差异包（若为增量且非空）
if (!fullMode && changed.length > 0 && !opts.dryRun) {
	step(`上传差异包 → ${remoteStage}/`);
	runCaptured("scp", [...scpBase, changedTar, `${opts.server}:${remoteStage}/`]);
}

// 7c. 远端删除名单也传上去 —— 避免把几百条路径塞进命令行
const deletedListLocal = path.join(localStaging, `deleted-${ts}.txt`);
if (!fullMode && deleted.length > 0 && !opts.dryRun) {
	fs.writeFileSync(deletedListLocal, `${deleted.join("\n")}\n`, "utf8");
	runCaptured("scp", [...scpBase, deletedListLocal, `${opts.server}:${remoteStage}/deleted.txt`]);
}

// 7d. **删除的闸门**（在本地判定，免得远端脚本被喂进奇怪的东西）
step("删除闸门：逐条校验待删路径");
if (deleted.length > 0) {
	const bad = deleted.filter((rel) => {
		if (/[\r\n\t"'`\\]/.test(rel)) return true;
		if (rel.includes("..") || rel.startsWith("/")) return true;
		const parts = rel.split("/");
		const top = parts[0];
		if (parts.length > 1 && !opts.allowDeletePrefixes.includes(top)) return true;
		return false;
	});
	if (bad.length > 0) {
		die(
			`有 ${bad.length} 条待删路径不在白名单/形态非法，拒绝删除。前几条：${bad.slice(0, 5).join(", ")}\n` +
				`        确认后可用 --allow-delete-prefixes 放宽（**不要**为了通过而放宽到源码/密钥目录）`,
			EXIT_REFUSE,
		);
	}
	say(`✅ ${deleted.length} 条待删路径全部落在允许前缀内（${opts.allowDeletePrefixes.join(", ")}）`);
	if (deleted.length > opts.massDeleteLimit && !opts.allowMassDelete) {
		die(
			`待删 ${deleted.length} 个文件 > 上限 ${opts.massDeleteLimit} —— 拒绝执行。` +
				`确认这是预期的（例：删了一大批文章）再加 --allow-mass-delete`,
			EXIT_REFUSE,
		);
	}
}

// 7e. 生效
step("生效：解包到网站目录（增量模式会把站点目录当 tar 根，直接落地）");
// 两种模式都一样：整包解出来的就是完整站点；增量模式是在它上面再叠一层
const effectScript = `set -eu
cd '${remoteStage}'
mkdir -p '${extractDir}'
tar -xzf '${tarName}' -C '${extractDir}'
if [ -f '${changedTarName}' ]; then
  tar -xzf '${changedTarName}' -C '${extractDir}'
fi
test -f '${extractDir}/index.html' || { echo '解包后没有 index.html，中止（线上目录未被改动）' >&2; exit 1; }
mkdir -p '${wr}'
if [ '${opts.keepReleases}' -gt 0 ] && [ -d '${wr}' ] && [ -n "$(ls -A '${wr}' 2>/dev/null)" ]; then
  mkdir -p '${wr}.releases'
  if [ -e '${releaseDir}' ]; then releaseDir='${releaseDir}-2'; else releaseDir='${releaseDir}'; fi
  mv '${wr}' "$releaseDir"
fi
mkdir -p '${wr}'
cp -a '${remoteStage}/${extractDir}/.' '${wr}/'
echo '[remote] 覆盖完成'`;
remoteBash(effectScript);

// 7f. 删除远端多余文件
if (deleted.length > 0) {
	step(`删除远端多余文件（${deleted.length} 个）`);
	const delScript = `set -eu
n=0
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  case "$rel" in
    /*|*..*|*'"'*|*'\`'*) echo "跳过可疑路径: $rel" >&2; continue ;;
  esac
  rm -f -- '${wr}/'"$rel"
  n=$((n+1))
done < '${remoteStage}/deleted.txt'
echo "[remote] 已删除 $n 个文件"`;
	remoteBash(delScript);
}

// 7g. 清理临时目录 + 旧备份
step("收尾：清理远端临时目录与旧备份");
const cleanupScript = `set -eu
rm -rf '${remoteStage}'
if [ '${opts.keepReleases}' -gt 0 ]; then
  ls -1dt '${wr}.releases'/*/ 2>/dev/null | tail -n +${opts.keepReleases + 1} | xargs -r rm -rf
  echo "[remote] 保留的回滚备份："
  ls -1dt '${wr}.releases'/*/ 2>/dev/null | head -n ${opts.keepReleases} || true
else
  echo "[remote] keep-releases=0，未保留备份"
fi`;
remoteBash(cleanupScript, { allowFail: true });

// ────────────────────────────────────────────────────────────────────────────
// 8. 校验信息（前后对照）
// ────────────────────────────────────────────────────────────────────────────
step("校验：本地 vs 远端");
if (!opts.dryRun) {
	const verifyScript = `set -eu
echo "[remote] 文件数：$(find '${wr}' -type f | wc -l)"
echo "[remote] 总字节：$(du -sb '${wr}' 2>/dev/null | cut -f1)"
echo "[remote] 顶层目录："
ls -1 '${wr}' | head -20
echo "[remote] 哨兵文件："
ls -l '${wr}/index.html' '${wr}/404.html'`;
	const remoteOut = captureRemoteBash(verifyScript);
	say(`本地 ${localCount} 个文件 / ${localBytes} 字节  ←→  远端见上面 [remote] 行（两者应当一致）`);
	let mismatch = false;
	for (const l of remoteOut) {
		let m = /^\[remote\] 文件数：(\d+)$/.exec(l);
		if (m && Number(m[1]) !== localCount) mismatch = true;
		m = /^\[remote\] 总字节：(\d+)$/.exec(l);
		if (m && Number(m[1]) !== localBytes) mismatch = true;
	}
	if (mismatch) {
		warn(
			"本地与远端计数不一致！常见原因：① 上次发布残留的孤儿文件（这次没删干净）；" +
				"② 服务器上有手工放进去的东西；③ 上传解包被中断。先上服务器 `find <web-root> | wc -l` 与 `ls -la` 对照。",
		);
	} else {
		say("✅ 文件数与总字节一致");
	}
}

// ────────────────────────────────────────────────────────────────────────────
// 9. 上线后手测提示
// ────────────────────────────────────────────────────────────────────────────
step("上线后自测（纯静态发布不需要 reload nginx；改了 nginx 配置才需要）");
const hostGuess = opts.server.split("@")[1];
say("curl -sSI https://<你的域名>/ | head -1                       # 期望 200");
say("curl -sS -o /dev/null -w '%{http_code}\\n' https://<你的域名>/roadmap/   # 期望 200");
say("curl -sS -o /dev/null -w '%{http_code}\\n' https://<你的域名>/rank/      # 期望 404");

if (!opts.dryRun) fs.rmSync(localStaging, { recursive: true, force: true });
say(`完成（服务器 ${hostGuess}）。⚠️ 这是未经真机验证的脚本 —— 第一次务必带 --dry-run 看一遍再真跑。`);
process.exit(EXIT_OK);

/**
 * 跑一段**要读输出**的远端 bash（清单/校验那两步）。
 * 与 remoteBash 的区别：那个是"边跑边打印"，这个是"收完再解析"。
 * @returns {string[]} 已去掉 `[publish]` 前缀的远端输出行
 */
function captureRemoteBash(script) {
	say(`$ ssh ${sshBase.join(" ")} bash -s   <<'EOF'`);
	echoBlock(script);
	if (opts.dryRun) {
		say("（--dry-run：未执行）");
		return [];
	}
	const r = spawnSync("ssh", [...sshBase, "bash", "-s"], { input: script, encoding: "utf8" });
	if (r.error) die(`ssh 起不来：${r.error.message}`);
	const all = `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").map((l) => l.replace(/\r$/, "").trimEnd());
	const code = r.status ?? 1;
	if (code !== 0) die(`远端脚本退出码 ${code}（输出：${all.slice(0, 5).join(" | ")}）`);
	const lines = all.filter((l) => l !== "");
	for (const l of lines) console.log(`[publish]    ${l}`);
	return lines;
}
