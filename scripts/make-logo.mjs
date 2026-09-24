/**
 * 把站点标识（SVG）栅格化成导航栏 Logo 与 favicon
 *
 * 设计源文件：`src/assets/images/logo/imiss-logo.svg`（手写矢量，是唯一的设计来源）
 * 改设计只需改那个 SVG，然后跑一次：
 *     pnpm make:logo
 *
 * 为什么必须栅格化（而不是直接用 SVG）：
 *   · favicon 与 OpenGraph 流程都要求 PNG（`siteConfig.favicon` 的注释里写明了）；
 *   · 导航栏 Logo 走的是 Astro 的图片管线（`<Picture>` + 图片优化），只对位图生效；
 *   · 于是把 SVG 作为"源"，生成 webp（导航栏）与 PNG（favicon）两套产物。
 *
 * 产物：
 *   src/assets/images/logo/imiss-light.webp   256×256  亮色导航栏
 *   src/assets/images/logo/imiss-dark.webp    256×256  暗色导航栏（同图，略提亮）
 *   public/favicon/imiss-{32,128,180,192}.png           浏览器标签页 / iOS / Android
 *
 * ⚠️ 历史：这个脚本原来是从桌宠像素图集里裁头像。现在已经不需要了——
 *    桌宠图集仍留在 `src/assets/images/pet/pet-aemeath.webp`，P3 做桌宠时会用到。
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC = "src/assets/images/logo/imiss-logo.svg";
const LOGO_SIZE = 256; // 导航栏显示 28~40px，按 6~9 倍导出，缩放时更细腻
const FAVICON_SIZES = [32, 128, 180, 192]; // 180 = apple-touch-icon，192 = Android
const LOGO_LIGHT = "src/assets/images/logo/imiss-light.webp";
const LOGO_DARK = "src/assets/images/logo/imiss-dark.webp";
const FAVICON_DIR = "public/favicon";

async function main() {
	await fs.access(SRC).catch(() => {
		throw new Error(`找不到设计源文件：${SRC}`);
	});

	const svg = await fs.readFile(SRC);

	// 亮色导航栏：原样导出（图标自带深色底，深浅主题下都成立）
	await sharp(svg, { density: 384 })
		.resize(LOGO_SIZE, LOGO_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.webp({ quality: 95, effort: 6 })
		.toFile(LOGO_LIGHT);

	// 暗色导航栏：同图，轻微提亮，避免在深色背景上显得比周围暗一档
	await sharp(svg, { density: 384 })
		.resize(LOGO_SIZE, LOGO_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.modulate({ brightness: 1.08 })
		.webp({ quality: 95, effort: 6 })
		.toFile(LOGO_DARK);

	await fs.mkdir(FAVICON_DIR, { recursive: true });
	const favicons = [];
	for (const size of FAVICON_SIZES) {
		const out = path.join(FAVICON_DIR, `imiss-${size}.png`);
		await sharp(svg, { density: 384 })
			.resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
			.png({ compressionLevel: 9 })
			.toFile(out);
		favicons.push(out);
	}

	console.log("站点标识生成完成（源：%s）", SRC);
	for (const f of [LOGO_LIGHT, LOGO_DARK, ...favicons]) {
		const { size } = await fs.stat(f);
		console.log(`  ${f.padEnd(46)} ${(size / 1024).toFixed(1)} KB`);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
