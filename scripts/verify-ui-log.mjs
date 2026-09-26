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

const args = process.argv.slice(2);
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
