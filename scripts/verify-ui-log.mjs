/**
 * `pnpm verify:ui:log` —— 跑 `verify-ui.mjs` 并把输出**以 UTF-8** 落到 `reports/verify-ui.log`
 * ============================================================================
 * 为什么需要它：`reports/sync-doc-counts.mjs` 要从日志里读"功能断言 N 项 / 截图 N 张"，
 * 而它按 UTF-8 读文件。用 PowerShell 的 `*>` / `Out-File` 重定向时默认写成 **UTF-16LE**，
 * 同步脚本读出来是乱码 → 报"日志里读不到「功能断言 N 项」"（P5-1 实测踩到，登记为 T58）。
 *
 * 用法：`pnpm verify:ui:log --base http://localhost:4322`（其余参数原样透传给 verify-ui.mjs）
 * 产物：`reports/verify-ui.log`（UTF-8，与 `verify:<阶段>.log` 并存不冲突）
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rawArgs = process.argv.slice(2);
// ⚠️ **`--base` 必须显式转发**（v1.35 修）：`pnpm verify:ui:log` 是从 `reports/` 里同步"断言/截图张数"
// 的唯一 UTF-8 日志来源，而它曾经**丢掉** `--base` —— 于是"对着 4322 跑"的命令实际上打的是
// `verify-ui.mjs` 的默认值 `http://localhost:4321`（开发服务器 / 别人的 dev server）。
// 端口写错时脚本**不会报错**（只要那个端口上有个能返回 200 的东西就会一路跑完），
// 结果是一条"本地 dev 服务器"的日志被当成"交付产物"的证据 —— 这类"参数没透传"是静默失效。
// 现在的口径：**没给 `--base` 就补一个默认的 4322**（`pnpm preview` 的端口，§11 的收尾流程），
// 并把它打进日志头，让"这一轮到底打的是哪个站"永远可查。
const args = rawArgs.some((a) => a === "--base" || a.startsWith("--base="))
	? rawArgs
	: ["--base", process.env.VERIFY_UI_BASE ?? "http://localhost:4322", ...rawArgs];
console.log(`verify-ui-log：转发参数 ${JSON.stringify(args)}`);

const res = spawnSync(process.execPath, ["scripts/verify-ui.mjs", ...args], {
	encoding: "utf8",
	maxBuffer: 1 << 28, // 日志约 100KB 级，留足余量
	stdio: ["ignore", "pipe", "pipe"],
});

const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync(path.resolve("reports/verify-ui.log"), out, "utf8");
process.stdout.write(out);
console.log(`\n日志已写：reports/verify-ui.log（UTF-8，${out.length} 字符）`);
process.exit(res.status ?? 1);
