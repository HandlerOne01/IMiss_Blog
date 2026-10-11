#!/usr/bin/env node
/**
 * `pnpm dev` 的自愈包装（v1.110）
 * ============================================================================
 * 为什么需要它（这不是我们的 bug，但我们挨了它）
 * ----------------------------------------------------------------------------
 * 症状：`pnpm dev` 偶尔这样死掉，而且**再起一次还是死**：
 *
 *   [vite] connected.
 *   transport invoke timed out after 60000ms (data: {"type":"custom","event":"vite:invoke",
 *     "data":{"name":"fetchModule", ...}})
 *   [ELIFECYCLE] Command failed with exit code 1.
 *
 * 根因（上游已定性，两条 issue 都在）：
 *   · Vite 的 SSR module runner 给 `fetchModule` 这个 invoke 写死了 **60 秒**超时
 *     （`transport.timeout ?? 6e4`，`vite/dist/node/module-runner.js`），**没有对外开关**。
 *   · 一旦某次冷编译超过 60 秒，Vite 会把这个**超时错误当成模块结果缓存下来**
 *     （`cachedRequest` 保留被 reject 的 promise、`evaluated = true`）——
 *     于是这个 dev server 进程**再也恢复不了**，哪怕服务端那份 transform 随后就跑完了。
 *     → vitejs/vite#23131（open）与修复 PR #23132（**尚未合并**）；
 *       Astro 那边同一现象记在 withastro/astro#15101（已按 upstream 关闭）。
 *
 * 我们这台机器为什么总踩到：本仓库 `astro.config.mjs` 的依赖图很大（katex + mhchem +
 * expressive-code 三件套 + 8 个 remark + 12 个 rehype + 8 个 integration 全在启动路径上），
 * 启动本身就是几十秒级的活。2026-10-11 在这台机器上实测（空载）：
 *   · **热启动 5.2~5.8 秒**（`.astro/` 与 `node_modules/.vite/` 都在）
 *   · **冷启动 37.0 秒**（删掉这两份缓存后；其中 `[content] Syncing content` 一项就占 32 秒）
 * 空载 37 秒 = 已经用掉 60 秒额度的 62%：此刻只要 PyCharm 在索引、Defender 在扫新落盘的
 * 大文件、或者旁边在跑 `pnpm build` / 断言脚本，单次 invoke 就会翻过 60 秒 → 报错。
 * 更糟的是：**失败那次会把 `.astro/` 留在半冷状态**，下一次启动又要重付那 32 秒的内容同步
 * —— 这就是"每次再起还是失败"的由来。
 *
 * 这个包装做什么（**只做两件事，不碰仓库里任何源码**）
 *   1. 原样转发参数跑 `astro dev`（`pnpm dev --port 4322` 照旧可用）。
 *   2. 如果输出里出现那句 `transport invoke timed out after 60000ms`：
 *      把 **`.astro/` 与 `node_modules/.vite/`**（两份都是可再生的缓存，且都在 gitignore 里）
 *      删掉，打印一行原因，然后**再起一次**。第二次还撞墙就如实报错退出，并打印手工兜底步骤。
 *
 * ⛔ 不做的：不改 Vite / 不 patch node_modules / 不动 60 秒超时 / 不放宽任何断言。
 *    上游把 #23132 合并且落到我们用的版本之后，这一层就可以退役（见 ARCH.md T93）。
 *
 * 用法：
 *   pnpm dev                 # 平时就用这个（= 本脚本）
 *   pnpm dev --port 4322     # 参数原样透传
 *   pnpm dev:raw             # 逃生口：原样的 `astro dev`（排查包装本身的问题时用）
 *   IMISS_DEV_SIMULATE_TIMEOUT=1 pnpm dev   # **自测钩子**：假装第一次撞了 60 秒墙，
 *                                           # 用来验证"清缓存 + 重试"这条分支真的会走
 *
 * ⚠️ 在**自己的终端里按 Ctrl+C** 是干净的（终端把 CTRL_C 发给整个前台进程组，包装会把
 *    SIGINT 转发给 astro 子进程）。但**强杀这个包装进程**（`taskkill /F`、任务管理器结束进程树
 *    却只杀了外层）可能把 astro 子进程留成**孤儿** —— 它会继续占着 4321 并吃掉几百 MB。
 *    自查：`Get-NetTCPConnection -LocalPort 4321 -State Listen` 看 Owner PID；
 *    不要了就精确 `Stop-Process -Id <pid>`（别按名字杀 node，会把编辑器/别的工具一起带走）。
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const TIMEOUT_SIGNATURE = "transport invoke timed out after 60000ms";
const MAX_ATTEMPTS = 2; // 第一次 + 清缓存后的一次
const CACHE_TARGETS = [".astro", path.join("node_modules", ".vite")];
const SIMULATE = process.env.IMISS_DEV_SIMULATE_TIMEOUT === "1";

const require = createRequire(import.meta.url);
const astroPkg = require.resolve("astro/package.json"); // pnpm 布局下会解析到 .pnpm 里的真身
const astroBin = path.join(path.dirname(astroPkg), "bin", "astro.mjs");
if (!existsSync(astroBin)) {
	console.error(`✗ 找不到 astro CLI：${astroBin}`);
	process.exit(1);
}

const args = process.argv.slice(2);
const log = (msg) => console.log(msg);

/** 量一下要删的目录有多大（给个"确实清掉了东西"的凭据） */
function dirSize(dir) {
	let files = 0;
	let bytes = 0;
	const walk = (d) => {
		for (const e of readdirSync(d, { withFileTypes: true })) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else {
				files++;
				try {
					bytes += statSync(p).size;
				} catch {}
			}
		}
	};
	try {
		walk(dir);
	} catch {}
	return { files, bytes };
}

function clearCaches() {
	const removed = [];
	for (const target of CACHE_TARGETS) {
		const abs = path.resolve(target);
		if (!existsSync(abs)) {
			removed.push(`${target}（本来就不存在）`);
			continue;
		}
		const { files, bytes } = dirSize(abs);
		rmSync(abs, { recursive: true, force: true });
		removed.push(`${target}（${files} 个文件 / ${(bytes / 1048576).toFixed(1)} MB）`);
	}
	return removed;
}

/** 跑一次 astro dev：stdout/stderr 边转发边扫那句超时签名 */
function runAstroDev() {
	return new Promise((resolve) => {
		const child = spawn(process.execPath, [astroBin, "dev", ...args], {
			stdio: ["inherit", "pipe", "pipe"],
			env: process.env,
			cwd: process.cwd(),
		});
		log(`   （astro dev pid=${child.pid}，参数：${args.length ? args.join(" ") : "（无）"}）`);
		let sawTimeout = false;
		const tee = (stream, out) => {
			stream.on("data", (buf) => {
				if (buf.includes(TIMEOUT_SIGNATURE)) sawTimeout = true;
				out.write(buf);
			});
		};
		tee(child.stdout, process.stdout);
		tee(child.stderr, process.stderr);
		// 包装被 Ctrl+C / 被杀时，别把子进程留成孤儿（否则 4321 会被一直占着）
		const forward = (sig) => () => {
			try {
				child.kill(sig);
			} catch {}
		};
		process.on("SIGINT", forward("SIGINT"));
		process.on("SIGTERM", forward("SIGTERM"));
		child.on("exit", (code, signal) => resolve({ code: code ?? (signal ? 1 : 0), signal, sawTimeout }));
	});
}

log(`▶ pnpm dev（自愈包装；原样入口是 pnpm dev:raw）`);

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
	const result = SIMULATE && attempt === 1
		? (log(`   ⚠️ 自测钩子 IMISS_DEV_SIMULATE_TIMEOUT=1：假装第一次撞墙`),
			log(`   ${TIMEOUT_SIGNATURE} (data: {"type":"custom","event":"vite:invoke","data":{"name":"fetchModule"}})`),
			{ code: 1, sawTimeout: true })
		: await runAstroDev();

	if (!result.sawTimeout) process.exit(result.code);

	if (attempt === MAX_ATTEMPTS) {
		log("");
		log(`✗ 连着 ${MAX_ATTEMPTS} 次都撞上 Vite 的 60 秒 fetchModule 超时（exit=${result.code}）。`);
		log(`  这是上游的坑，不是站点代码的问题：vitejs/vite#23131（修复 PR #23132 尚未合并）。`);
		log(`  手工兜底（按重到轻，做完一步再试一次 pnpm dev）：`);
		log(`    1) 关掉占着 CPU / 磁盘的东西（PyCharm 索引、Defender 全盘扫描、并行的 pnpm build / verify:ui）`);
		log(`    2) 把项目从"被实时扫描的大目录"里排除，或换到更快的盘上（本仓库在 D:\\HuaweiMoveData\\…）`);
		log(`    3) pnpm install（社区同症状报告里，这一步配合清缓存是有效的）`);
		log(`  排查记录与实测数字见 PROJECT_STATUS.md 的 v1.110 段与 ARCH.md §14.3 T93。`);
		process.exit(result.code);
	}

	log("");
	log(`⚠️ 检测到 Vite 的 60 秒 fetchModule 超时（第 ${attempt} 次尝试）。`);
	log(`  这不是站点代码的问题，是上游 Vite 的已知缺陷（vitejs/vite#23131 / withastro/astro#15101）：`);
	log(`  该 invoke 的超时写死 60 秒，且超时会被当成模块结果缓存住，进程内再也恢复不了。`);
	const removed = clearCaches();
	log(`  已清掉可再生的缓存：${removed.join(" ｜ ")}`);
	log(`  本机实测：冷启动 37.0s（含 32s 内容同步）/ 热启动 5.2s —— 清掉后这次等于重新冷启动，请耐心等。`);
	log(`  现在重试一次……`);
	log("");
}
