/**
 * 把站点标识（纸飞机）缩成导航栏 Logo 与 favicon
 *
 * 设计源文件：`design/imiss-logo.png`
 *   · 发起人 2026-10-07 给的**正式标识**（v1.64 换掉 P1-14 那张手写矢量"粉色晶体心"）
 *   · 原图 1254×1254、**本身就是透明底**（四角 alpha=0），但飞机本体只占中间一条
 *     1069×793 的横带（上下各 230px 是空留白）—— 所以本脚本第一步先 `trim()` 到本体，
 *     否则塞进方形 favicon 画布会白白小一圈。
 *   · 源文件按**字节原样**提交（与发起人给的文件完全一致，sha256 0a6a8b45…）：
 *     不重画、不压缩、不改一个像素；留白与缩放的活都在这里做。
 *   · ⚠️ 为什么放在仓库根的 `design/` 而不是 `src/assets/`：`Navbar.astro` 用
 *     `import.meta.glob("../../**/*.{png,jpg,…}")` 把 **`src/` 下所有图片**都打进 dist
 *     （实测：源图 541 KB 会原样出现在 `dist/_astro/` 里、**零处引用**）。设计源不是
 *     运行期资产，放在 `src/` 外既省 541 KB 死重，也让"设计源 vs 生成物"一目了然。
 *
 * 为什么源是位图而不是手写 SVG（v1.64 的口径变更）：
 *   标识是发起人给的既有插画。重画成矢量必然有描摹误差（facet 角度、渐变走向），
 *   与其"看起来差不多"，不如保留他的画；代价是 32px 下有重采样软边，实测仍可辨认。
 *   旧的手写矢量 `imiss-logo.svg`（粉心 + 星芒 + 翼片 + 深蓝紫方圆底）已删除，
 *   需要时去 git 历史取。
 *
 * 为什么还要栅格化出两套产物：
 *   · favicon 与 OpenGraph 流程都要求 PNG（`siteConfig.favicon` 的注释里写明了）；
 *   · 导航栏 Logo 走的是 Astro 的图片管线（`<Picture>` + 图片优化），只对位图生效。
 *
 * 产物（v1.64 起：**不带方圆底，只有纸飞机**，即发起人选定的"B 方案"）：
 *   src/assets/images/logo/imiss-light.webp   256×190  亮色导航栏（紧贴本体，无多余留白）
 *   src/assets/images/logo/imiss-dark.webp    256×190  暗色导航栏（同图，略提亮）
 *   public/favicon/imiss-{32,128,180,192}.png          标签页 / iOS / Android
 *                                                      （方形透明画布，飞机满宽居中）
 *
 * ⚠️ 已知代价（如实登记，不粉饰）：透明底在 **iOS 主屏图标**上会被系统渲染成黑底 ——
 *    也就是"飞机浮在黑方块上"。要改的话是给 180 那张单独加底，属于发起人的口味决定。
 *
 * ⚠️ 更早的历史：这个脚本最初是从桌宠像素图集里裁头像。桌宠图集仍在
 *    `src/assets/images/pet/pet-aemeath.webp`，P3 做桌宠时用到。
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC = "design/imiss-logo.png";
const LOGO_SIZE = 256; // 导航栏显示 28~40px，按 6~9 倍导出，缩放时更细腻
const FAVICON_SIZES = [32, 128, 180, 192]; // 180 = apple-touch-icon，192 = Android
const LOGO_LIGHT = "src/assets/images/logo/imiss-light.webp";
const LOGO_DARK = "src/assets/images/logo/imiss-dark.webp";
const FAVICON_DIR = "public/favicon";
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** 裁掉四周透明留白，只留飞机本体（原图上下各 230px 是空的） */
function trimmed() {
	return sharp(SRC).trim({ threshold: 1, background: TRANSPARENT });
}

async function main() {
	await fs.access(SRC).catch(() => {
		throw new Error(`找不到设计源文件：${SRC}`);
	});

	// ⚠️ `metadata()` 报的是**输入**尺寸（1254×1254），不是 trim 之后的结果 ——
	// 要拿真实尺寸必须把管线跑出来（这里只编码一次，够快）
	const { info } = await trimmed().toBuffer({ resolveWithObject: true });
	console.log(
		`设计源 ${SRC} → 裁到本体 ${info.width}×${info.height}（比例 ${(info.width / info.height).toFixed(3)}:1）`,
	);

	// 亮色导航栏：本体满宽导出（图是透明底，深浅主题下看到的都是纸飞机本身）
	await trimmed()
		.resize({ width: LOGO_SIZE })
		.webp({ quality: 95, effort: 6 })
		.toFile(LOGO_LIGHT);

	// 暗色导航栏：同图，轻微提亮 —— 飞机尾翼是深紫色，在深色导航栏上本来最弱，
	// 提亮 8% 是为了让它不至于糊成一块（实测数据见 ARCH.md §4.1 R-ID-04 行）
	await trimmed()
		.resize({ width: LOGO_SIZE })
		.modulate({ brightness: 1.08 })
		.webp({ quality: 95, effort: 6 })
		.toFile(LOGO_DARK);

	await fs.mkdir(FAVICON_DIR, { recursive: true });
	const favicons = [];
	for (const size of FAVICON_SIZES) {
		const out = path.join(FAVICON_DIR, `imiss-${size}.png`);
		// favicon 必须是正方形画布（`siteConfig.favicon` 里每项都写了 sizes），
		// 所以这一步是"满宽 + 上下透明留白"，不是紧贴本体
		await trimmed()
			.resize(size, size, { fit: "contain", background: TRANSPARENT })
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
