/**
 * 从桌宠精灵图裁出临时站点标识（Logo + favicon）
 *
 * 为什么会有这个脚本：IMiss Blog 的正式 Logo 还没做（PROJECT_STATUS 阻塞项 B-03），
 * 先用桌宠「爱弥斯」的像素图集裁一张临时头像顶上。等正式 Logo 到位后：
 *   1) 把文件直接覆盖 src/assets/images/logo/imiss-*.webp 与 public/favicon/imiss-*.png
 *   2) 本脚本可以留着（换图集时还能再裁），也可以删掉
 *
 * 用法：
 *   node scripts/make-logo.mjs [图集路径]
 *   默认图集路径：src/assets/images/pet/pet-aemeath.webp
 *
 * 图集规格：1152×1404，8 列 × 9 行，单格 144×156（原图 1536×1872 / 单格 192×208 的 0.75 倍）。
 * 第 1 格（row 0 / col 0）是 idle 状态的第一帧，人物正面、留白最多，最适合裁头像。
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ATLAS = process.argv[2] ?? "src/assets/images/pet/pet-aemeath.webp";

// 图集与格子规格
const CELL_W = 144;
const CELL_H = 156;

// 头像裁切框（量自第 1 格）：把水晶头饰与下巴一起框进来，留一点呼吸位
// （第一次试 left28/top22/size92 把下巴切掉了，往下、放大各调一档）
const HEAD = { left: 26, top: 24, size: 104 };

// 输出尺寸
const LOGO_SIZE = 128; // 导航栏 Logo（会按 CSS 缩到 32~40px 显示）
const FAVICON_SIZES = [32, 128, 180, 192]; // 180 = apple-touch-icon，192 = android

const LOGO_LIGHT = "src/assets/images/logo/imiss-light.webp";
const LOGO_DARK = "src/assets/images/logo/imiss-dark.webp";
const FAVICON_DIR = "public/favicon";

async function main() {
	await fs.access(ATLAS).catch(() => {
		throw new Error(
			`找不到图集：${ATLAS}\n请先确认 src/assets/images/pet/pet-aemeath.webp 存在。`,
		);
	});

	const meta = await sharp(ATLAS).metadata();
	if (meta.width !== CELL_W * 8 || meta.height !== CELL_H * 9) {
		console.warn(
			`[warn] 图集尺寸 ${meta.width}×${meta.height} 与预期 ${CELL_W * 8}×${CELL_H * 9} 不一致，裁切结果可能偏移`,
		);
	}

	// 1) 取出 idle 第一帧，再裁头像框
	const cell = await sharp(ATLAS)
		.extract({ left: 0, top: 0, width: CELL_W, height: CELL_H })
		.png()
		.toBuffer();

	const head = sharp(cell).extract({
		left: HEAD.left,
		top: HEAD.top,
		width: HEAD.size,
		height: HEAD.size,
	});

	// 2) Logo：像素画必须用 nearest 放大，否则边缘会被插值糊掉
	await head
		.clone()
		.resize(LOGO_SIZE, LOGO_SIZE, { kernel: "nearest" })
		.webp({ quality: 95, effort: 6 })
		.toFile(LOGO_LIGHT);

	// 暗色版：亮一点，避免深色导航栏上偏灰
	await head
		.clone()
		.resize(LOGO_SIZE, LOGO_SIZE, { kernel: "nearest" })
		.modulate({ brightness: 1.08 })
		.webp({ quality: 95, effort: 6 })
		.toFile(LOGO_DARK);

	// 3) favicon：PNG（OG 图流程要求数组里有 png）
	await fs.mkdir(FAVICON_DIR, { recursive: true });
	const favicons = [];
	for (const size of FAVICON_SIZES) {
		const out = path.join(FAVICON_DIR, `imiss-${size}.png`);
		await head
			.clone()
			.resize(size, size, { kernel: "nearest" })
			.png({ compressionLevel: 9 })
			.toFile(out);
		favicons.push(out);
	}

	console.log("临时 Logo 生成完成：");
	for (const f of [LOGO_LIGHT, LOGO_DARK, ...favicons]) {
		const { size } = await fs.stat(f);
		console.log(`  ${f.padEnd(46)} ${(size / 1024).toFixed(1)} KB`);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
