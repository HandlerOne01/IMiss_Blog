/**
 * 从两张设计源生成站点用到的所有图标产物
 *
 * 设计源（都在仓库根的 `design/`，**按字节原样提交**，不重画不压缩）：
 *   · `design/imiss-logo.png`   —— **纸飞机**（发起人 2026-10-07 给的站点标识）
 *        1254×1254、自带透明底，但飞机本体只占中间一条 1069×793 横带（上下各 230px 空留白）
 *        → 第一步先 `trim()` 到本体，否则塞进方形画布会白白小一圈。
 *        sha256 `0a6a8b451a05cf14…`（= 发起人给的文件本身）
 *   · `design/imiss-avatar.png` —— **爱弥斯人物插画**（发起人 2026-10-07 给的，486×487）
 *        sha256 `ae7554780e80650d…`（= 发起人给的文件本身）
 *
 * **v1.64 的分工（发起人 2026-10-07 定的，参考上游作者站 firefly.cuteleaf.cn）**：
 *   小图标 → 纸飞机；大图标与侧栏头像 → 人物插画
 *   ┌ 导航栏 Logo（显示 28px）        ← 纸飞机（透明底，紧贴本体，无留白）
 *   ├ 浏览器标签 favicon 32px         ← 纸飞机（小图标）
 *   ├ iOS 主屏 / Android / 安装卡图标 ← 人物（180 / 192，Edge 那张"安装应用"卡取最大的那张）
 *   ├ favicon 128px                   ← 人物（同属大图标档，`siteConfig` 里未单独登记，但会随 dist 发出去）
 *   └ 侧栏资料卡头像 + schema.org 头像 ← 人物（`src/assets/images/avatar/imiss-avatar.webp`）
 *
 * 为什么源是位图而不是手写矢量：标识与插画都是发起人给的既有作品，重画成矢量必然有
 * 描摹误差（facet 角度、发丝走向），与其"看起来差不多"，不如保留原图。旧的手写矢量
 * `imiss-logo.svg`（粉心 + 星芒 + 翼片 + 深蓝紫方圆底，P1-14 ~ v1.63）已删除，需要时去 git 历史取。
 *
 * 为什么还要栅格化成这些尺寸：
 *   · favicon 与 OpenGraph 流程要 PNG（`siteConfig.favicon` 的注释写明了）；
 *   · 导航栏 Logo 走 Astro 图片管线（`<Image>` + 图片优化），只对位图生效，且要亮/暗两张；
 *   · schema.org 的 `image` 要一个绝对 URL 能取的方图（用 486 那张，够 OG 与高清屏用）。
 *
 * ⚠️ 为什么设计源放 `design/` 而不是 `src/assets/`：`Navbar.astro` 用 `import.meta.glob`
 *    收 **`src/` 下的全部图片扩展名**（`../../` 起头的通配）→ 实测那张 541 KB 的纸飞机源图
 *    会原样出现在 `dist/_astro/` 里、**零处引用**。设计源不是运行期资产，放在 `src/` 外
 *    既省死重，也让"设计源 vs 生成物"一目了然。
 *    ⚠️ 写这段注释时踩过：正文里直接写那个通配串会**提前闭合块注释**（通配里的星号加斜杠），
 *       脚本当场 `SyntaxError` —— 见 `ARCH.md` §14.3 **T88**。
 *
 * ⚠️ 更早的历史：这个脚本最初是从桌宠像素图集里裁头像。桌宠图集仍在
 *    `src/assets/images/pet/pet-aemeath.webp`，桌宠本体用它。
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const LOGO_SRC = "design/imiss-logo.png"; // 纸飞机
const AVATAR_SRC = "design/imiss-avatar.png"; // 人物插画
const LOGO_SIZE = 256; // 导航栏显示 28px，按 9 倍导出，缩放时更细腻
const AVATAR_SIZE = 486; // 侧栏头像 / schema.org 用：就用源图本尺寸，不放大
const SMALL_ICON_SIZES = [32]; // 小图标档 = 纸飞机（浏览器标签）
const BIG_ICON_SIZES = [128, 180, 192]; // 大图标档 = 人物（180 = Apple 触屏、192 = Android/安装卡）
const LOGO_LIGHT = "src/assets/images/logo/imiss-light.webp";
const LOGO_DARK = "src/assets/images/logo/imiss-dark.webp";
const AVATAR_OUT = "src/assets/images/avatar/imiss-avatar.webp";
const FAVICON_DIR = "public/favicon";
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** 裁掉四周透明留白，只留飞机本体（原图上下各 230px 是空的） */
function planeTrimmed() {
	return sharp(LOGO_SRC).trim({ threshold: 1, background: TRANSPARENT });
}

async function main() {
	for (const src of [LOGO_SRC, AVATAR_SRC]) {
		await fs.access(src).catch(() => {
			throw new Error(`找不到设计源文件：${src}`);
		});
	}

	// ⚠️ `metadata()` 报的是**输入**尺寸（1254×1254），不是 trim 之后的结果 ——
	// 要拿真实尺寸必须把管线跑出来（这里只编码一次，够快）
	const { info } = await planeTrimmed().toBuffer({ resolveWithObject: true });
	console.log(
		`设计源 ${LOGO_SRC} → 裁到本体 ${info.width}×${info.height}（比例 ${(info.width / info.height).toFixed(3)}:1）`,
	);

	// 亮色导航栏：本体满宽导出（图是透明底，深浅主题下看到的都是纸飞机本身）
	await planeTrimmed().resize({ width: LOGO_SIZE }).webp({ quality: 95, effort: 6 }).toFile(LOGO_LIGHT);

	// 暗色导航栏：同图，轻微提亮 —— 飞机尾翼是深紫色，在深色导航栏上本来最弱，
	// 提亮 8% 是为了让它不至于糊成一块（实测数据见 ARCH.md §4.1 R-ID-04 行）
	await planeTrimmed()
		.resize({ width: LOGO_SIZE })
		.modulate({ brightness: 1.08 })
		.webp({ quality: 95, effort: 6 })
		.toFile(LOGO_DARK);

	// 侧栏头像 / schema.org：人物插画，方形（源图 486×487，差 1px 用 cover 抹平）
	await fs.mkdir(path.dirname(AVATAR_OUT), { recursive: true });
	await sharp(AVATAR_SRC)
		.resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" })
		.webp({ quality: 92, effort: 6 })
		.toFile(AVATAR_OUT);

	await fs.mkdir(FAVICON_DIR, { recursive: true });
	const icons = [];
	// 小图标档：纸飞机（透明底 → 方形画布，满宽居中，上下留透明带）
	for (const size of SMALL_ICON_SIZES) {
		const out = path.join(FAVICON_DIR, `imiss-${size}.png`);
		await planeTrimmed()
			.resize(size, size, { fit: "contain", background: TRANSPARENT })
			.png({ compressionLevel: 9 })
			.toFile(out);
		icons.push(out);
	}
	// 大图标档：人物插画（满幅方图，不留白、不透明）
	for (const size of BIG_ICON_SIZES) {
		const out = path.join(FAVICON_DIR, `imiss-${size}.png`);
		await sharp(AVATAR_SRC)
			.resize(size, size, { fit: "cover", position: "centre" })
			.png({ compressionLevel: 9 })
			.toFile(out);
		icons.push(out);
	}

	console.log("图标生成完成");
	for (const f of [LOGO_LIGHT, LOGO_DARK, AVATAR_OUT, ...icons]) {
		const { size } = await fs.stat(f);
		console.log(`  ${f.padEnd(50)} ${(size / 1024).toFixed(1)} KB`);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
