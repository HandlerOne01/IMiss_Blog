/**
 * 壁纸素材入库（R-BG-01）
 * ============================================================================
 * ⚠️ 这个脚本**只做复制改名，不做任何重编码**。
 *
 * 为什么改掉原来的"转 webp"做法（P3 实测教训）：
 *   原图已经是 JPG（有损），我再用 webp q82 转一道，Astro 构建时又按 siteConfig.imageQuality
 *   压一道 —— 两代有损压缩叠在一起，细看明显发糊（原图 201KB → 我的 webp 143KB，尺寸一模一样，
 *   体积差就是被压掉的细节）。所以现在直接把原图放进 `src/assets`，**压缩只交给 Astro 做一次**。
 *
 * 输出：
 *   · `src/assets/images/DesktopWallpaper/imiss-d1..4.jpg` —— 原图原样（不改尺寸、不转码）
 *   · 移动端复用同一批文件（Astro 会按 ImageWrapper 传的 widths 出小尺寸变体，
 *     不需要再存一份 1600 宽的中间产物）
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
const PREFIX = "imiss-d";

const files = (await fs.readdir(SRC_DIR))
	.filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f))
	.sort();

if (!files.length) {
	console.error(`[壁纸] 源目录里没有图片：${SRC_DIR}`);
	process.exit(1);
}

if (!dry) await fs.mkdir(DESKTOP_DIR, { recursive: true });

const rows = [];
for (let i = 0; i < files.length; i++) {
	const from = path.join(SRC_DIR, files[i]);
	const ext = path.extname(files[i]).toLowerCase();
	const out = path.join(DESKTOP_DIR, `${PREFIX}${i + 1}${ext}`);
	const meta = await sharp(from).metadata();
	const sizeKB = Math.round((await fs.stat(from)).size / 1024);

	if (dry) {
		rows.push([files[i], out, `${meta.width}×${meta.height}`, `${sizeKB}KB`, "（dry-run）"]);
		continue;
	}
	// 原样复制：一个像素、一个字节都不动
	await fs.copyFile(from, out);
	const outSize = Math.round((await fs.stat(out)).size / 1024);
	rows.push([files[i], out, `${meta.width}×${meta.height}`, `${sizeKB}KB`, `原样复制 ${outSize}KB`]);
}

console.log(`源目录：${SRC_DIR}\n共 ${files.length} 张（不重编码，直接入库）\n`);
for (const [a, b, c, d, e] of rows) console.log(`${a}\n  → ${b}   ${c} ${d} → ${e}`);
if (dry) console.log("\n（--dry 只打印不写文件）");
