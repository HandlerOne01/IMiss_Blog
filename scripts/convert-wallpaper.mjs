/**
 * 壁纸图 → webp（R-BG-01 图片期）
 * ============================================================================
 * 输入：发起人给的 `dosc/photo/*.jpg`（4 张，1915×821 ≈ 2.33:1）
 * 输出：
 *   · `src/assets/images/DesktopWallpaper/imiss-d1..4.webp`（长边上限 2560，不放大）
 *   · `src/assets/images/MobileWallpaper/imiss-m1..4.webp`（长边上限 1600；同一批素材先顶上）
 *
 * 为什么**不预裁**：源图已经比横幅窄得多（2.33:1 vs 横幅常见的 3:1+），横幅的
 * `object-fit: cover` + `object-position` 会在渲染时决定构图；预裁只会白丢像素，
 * 而且换设备宽度就得重裁一次（ARCH.md §6.1 第 1 条）。
 *
 * 源目录默认取同级的 `my_-blog/dosc/photo`；可用 `--src <目录>` 覆盖。
 * 用法：`node scripts/convert-wallpaper.mjs [--src <目录>] [--dry]`
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const srcArgIdx = args.indexOf("--src");
const SRC_DIR =
	srcArgIdx >= 0
		? args[srcArgIdx + 1]
		: "D:/HuaweiMoveData/Users/HUAWEI/Desktop/my_-blog/dosc/photo";

const DESKTOP_DIR = "src/assets/images/DesktopWallpaper";
const MOBILE_DIR = "src/assets/images/MobileWallpaper";
const DESKTOP_MAX = 2560;
const MOBILE_MAX = 1600;
const QUALITY = 82;

const files = (await fs.readdir(SRC_DIR))
	.filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f))
	.sort();

if (!files.length) {
	console.error(`[壁纸] 源目录里没有图片：${SRC_DIR}`);
	process.exit(1);
}

if (!dry) {
	await fs.mkdir(DESKTOP_DIR, { recursive: true });
	await fs.mkdir(MOBILE_DIR, { recursive: true });
}

const rows = [];
for (let i = 0; i < files.length; i++) {
	const n = i + 1;
	const from = path.join(SRC_DIR, files[i]);
	const meta = await sharp(from).metadata();

	for (const [dir, prefix, max] of [
		[DESKTOP_DIR, "imiss-d", DESKTOP_MAX],
		[MOBILE_DIR, "imiss-m", MOBILE_MAX],
	]) {
		const out = path.join(dir, `${prefix}${n}.webp`);
		if (dry) {
			rows.push([files[i], out, `${meta.width}×${meta.height}`, "（dry-run）"]);
			continue;
		}
		const info = await sharp(from)
			.resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
			.webp({ quality: QUALITY, effort: 5 })
			.toFile(out);
		rows.push([files[i], out, `${meta.width}×${meta.height}`, `${info.width}×${info.height} ${Math.round(info.size / 1024)}KB`]);
	}
}

console.log(`源目录：${SRC_DIR}\n共 ${files.length} 张\n`);
for (const [a, b, c, d] of rows) {
	console.log(`${a}\n  → ${b}   ${c} → ${d}`);
}
if (dry) console.log("\n（--dry 只打印不写文件）");
