/**
 * 生成"榜单背景图比例对照图"（`docs/imiss/rank-cover-guide.png`）
 * ============================================================================
 * 给发起人准备素材时看的：他问过"最后传图片比例是多少"，口头说 5.7:1 不直观，
 * 所以直接画出来——16:9 原图裁成 5.7:1 之后，画面上下各有多少被切掉。
 *
 * 为什么要在意：榜单每行是"内容宽 × 17.4%"的宽条（1440 屏下 629×109px = 5.77:1），
 * 图按 `object-fit: cover` 居中铺满，所以 16:9 的图会**保留中间约 31% 的高度**。
 * 人物头在上半部分的构图会被切到，这种情况需要单独指定取景锚点。
 *
 * 用法：`node scripts/make-rank-cover-guide.mjs`
 * 图源：`src/assets/images/DesktopWallpaper/d3.avif`（仓库里现成的 16:9 壁纸）
 * 注：文案只用 ASCII —— librsvg 渲染中文要看系统字体，换台机器就可能变方框。
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC = "src/assets/images/DesktopWallpaper/d3.avif";
const OUT = "docs/imiss/rank-cover-guide.png";

/** 榜单行在 1440 屏下的实测比例（ARCH §5.5：行高 = 内容宽的 17.4% → 1/0.174 = 5.75） */
const ROW_RATIO = 1 / 0.174;

const W = 1400;
const PAD = 40;
const COL = Math.floor((W - PAD * 3) / 2); // 两列等宽
const LEFT = PAD;
const RIGHT = PAD * 2 + COL;

const src = sharp(SRC);
const meta = await src.metadata();
const original = await src.png().toBuffer();

// 左列：原图（缩到列宽）+ 标出会被保留的中间横条
const origH = Math.round(COL / (meta.width / meta.height));
const origThumb = await sharp(original).resize({ width: COL }).png().toBuffer();
const keepH = Math.round(COL / ROW_RATIO); // 保留高度
const keepTop = Math.round((origH - keepH) / 2); // 居中 → 上下各切这么多
const cutPct = Math.round((1 - keepH / origH) * 100);

// 右列：裁成 5.7:1 之后的样子（与 object-fit: cover + object-position: center 等价）
const croppedThumb = await sharp(original)
	.resize({ width: COL })
	.extract({ left: 0, top: keepTop, width: COL, height: keepH })
	.png()
	.toBuffer();

const title = "Rank cover ratio guide";
const subtitle = `row is ${ROW_RATIO.toFixed(2)}:1  (1440px viewport -> 629x109px)`;
const leftCap = `16:9 original  ${meta.width}x${meta.height}`;
const rightCap = `cropped to ${ROW_RATIO.toFixed(2)}:1  (1600x280 recommended)`;
const foot1 = `center-crop keeps only the middle band: top ${keepTop}px + bottom ${keepTop}px cut (~${cutPct}% of height)`;
const foot2 = "if the subject sits near the top, ask for a custom focal point instead of center-crop";
const foot3 = "size &lt;=150KB each (10 rows/page &lt;=1.5MB) | name: jp-all-01.jpg / jp-ep-03.jpg / game-01.jpg";

const HEAD = 132;
const CAP = 44;
const FOOT = 108;
const H = HEAD + origH + CAP + FOOT;
// 右侧那条"裁后"的图，纵向放在与左侧绿框**同一高度**上——
// 眼睛能直接把"绿框里的那条"和右边成品对上（第一版放太靠下，看图的人得自己猜）。
const STRIP_TOP = HEAD + keepTop;

// 分两层 SVG：底图+文字在先，红/绿标记压在原图**之上**（第一版把标记画在底图那层，
// 结果被后合成的原图整个盖住了，图上什么标注都看不到）。
const bgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#15121a"/>
  <text x="${PAD}" y="58" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">${title}</text>
  <text x="${PAD}" y="96" font-family="Segoe UI, Arial, sans-serif" font-size="21" fill="#c9a7d8">${subtitle}</text>

  <text x="${LEFT}" y="${HEAD - 14}" font-family="Segoe UI, Arial, sans-serif" font-size="21" font-weight="600" fill="#ffffff">${leftCap}</text>
  <text x="${RIGHT}" y="${HEAD - 14}" font-family="Segoe UI, Arial, sans-serif" font-size="21" font-weight="600" fill="#7ee0c0">${rightCap}</text>

  <text x="${LEFT}" y="${HEAD + origH + 30}" font-family="Segoe UI, Arial, sans-serif" font-size="19" fill="#e8e2ee">${foot1}</text>

  <text x="${PAD}" y="${H - 62}" font-family="Segoe UI, Arial, sans-serif" font-size="19" fill="#c9a7d8">${foot2}</text>
  <text x="${PAD}" y="${H - 30}" font-family="Segoe UI, Arial, sans-serif" font-size="19" fill="#c9a7d8">${foot3}</text>
</svg>`;

const markSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${LEFT}" y="${HEAD}" width="${COL}" height="${keepTop}" fill="#ff5b6e" fill-opacity="0.6"/>
  <rect x="${LEFT}" y="${HEAD + keepTop + keepH}" width="${COL}" height="${origH - keepTop - keepH}" fill="#ff5b6e" fill-opacity="0.6"/>
  <rect x="${LEFT}" y="${HEAD + keepTop}" width="${COL}" height="${keepH}" fill="none" stroke="#7ee0c0" stroke-width="3"/>
  <text x="${LEFT + 14}" y="${HEAD + Math.max(30, Math.round(keepTop / 2) + 8)}" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">CUT ${keepTop}px</text>
  <text x="${LEFT + 14}" y="${HEAD + origH - Math.max(16, Math.round((origH - keepTop - keepH) / 2) - 8)}" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">CUT ${origH - keepTop - keepH}px</text>

  <rect x="${RIGHT}" y="${STRIP_TOP}" width="${COL}" height="${keepH}" fill="none" stroke="#7ee0c0" stroke-width="3"/>
  <text x="${RIGHT}" y="${STRIP_TOP + keepH + 30}" font-family="Segoe UI, Arial, sans-serif" font-size="19" fill="#7ee0c0">= what one row shows (title white text sits here)</text>
</svg>`;

await fs.mkdir(path.dirname(OUT), { recursive: true });
await sharp({ create: { width: W, height: H, channels: 4, background: "#15121a" } })
	.composite([
		{ input: Buffer.from(bgSvg), top: 0, left: 0 },
		{ input: origThumb, top: HEAD, left: LEFT },
		{ input: Buffer.from(markSvg), top: 0, left: 0 },
		{ input: croppedThumb, top: STRIP_TOP, left: RIGHT },
		{ input: Buffer.from(markSvg), top: 0, left: 0 },
	])
	.png({ compressionLevel: 9 })
	.toFile(OUT);

const { size } = await fs.stat(OUT);
console.log(`已生成 ${OUT}  (${W}×${H}, ${Math.round(size / 1024)}KB)`);
console.log(`原图 ${meta.width}×${meta.height} → 保留中间 ${COL}×${keepH}（切掉上下各 ${keepTop}px，约 ${cutPct}%）`);
