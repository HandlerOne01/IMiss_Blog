/**
 * 书签导航本地 favicon 资产生成器（一次性准备阶段脚本，不参与 `pnpm build`）
 * ============================================================================
 * 产物：`public/booknav-icons/<slug>.png`（128×128 PNG，透明底，体积尽量 < 20 KB）
 *       + `public/booknav-icons/README.md`（来源表，逐条列出官方 URL 与体积）
 * 口径来源：v1.58 轮 —— 书签页 11 张没有品牌矢量图标的卡改用**各站官方 favicon**，
 * 抓回本地存放，**运行期零第三方请求**（不许写网络图片 URL）。
 *
 * 取图顺序（每条都按这个顺序，失败才降级，降级原因逐条记录）：
 *   ① `https://<域名>/favicon.ico`
 *   ② 首页 HTML 里 `<link rel="icon" …>` 的 href（相对路径按首页 resolve）
 *   ③ 一次性兜底 `https://www.google.com/s2/favicons?domain=<域名>&sz=128`
 *      ⚠️ 只在本脚本（构建前准备阶段）出现；产物里不许出现该服务。
 *      ⚠️ 兜底结果还要过 **占位图守卫**：Google 对取不到的站点会返回**通用地球图标**，
 *         那不是品牌图标。已按像素哈希识别（见 PLACEHOLDER_SHA256）并**丢弃**，
 *         该条退回"带品牌色的字母块"（任务书允许的例外）。
 *
 * 用法：`node scripts/fetch-booknav-icons.mjs`
 * 输出：`public/booknav-icons/*.png` + `public/booknav-icons/README.md`
 *       + 控制台逐条取证 + `reports/_bni-fetch.json`
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { BOOKNAV_BRAND_COLORS } from "../src/constants/booknav-brand-colors.ts";

const OUT_DIR = "public/booknav-icons";
const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const SITES = [
	{ slug: "tencent-cloud", domain: "cloud.tencent.com", home: "https://cloud.tencent.com/" },
	{ slug: "chaoxing", domain: "i.chaoxing.com", home: "https://i.chaoxing.com/" },
	{ slug: "neea", domain: "www.neea.edu.cn", home: "https://www.neea.edu.cn/" },
	{ slug: "53ai", domain: "www.53ai.com", home: "https://www.53ai.com/" },
	{ slug: "ccswitch", domain: "www.ccswitch.io", home: "https://www.ccswitch.io/" },
	{ slug: "tavily", domain: "tavily.com", home: "https://tavily.com/" },
	{ slug: "micuapi", domain: "www.micuapi.ai", home: "https://www.micuapi.ai/" },
	{ slug: "siliconflow", domain: "www.siliconflow.cn", home: "https://www.siliconflow.cn/" },
	{ slug: "lanqiao", domain: "dasai.lanqiao.cn", home: "https://dasai.lanqiao.cn/" },
	{ slug: "bigmodel", domain: "bigmodel.cn", home: "https://bigmodel.cn/" },
	{ slug: "priceai", domain: "priceai.cc", home: "https://priceai.cc/" },
	{ slug: "bigmess", domain: "happy.bigmess.org", home: "https://happy.bigmess.org/" },
];

/** 按魔数判内容类型 —— 不能信 Content-Type（53ai 的 .ico 其实是 PNG，腾讯云的 ico 是真 ico） */
function sniff(buf) {
	if (!buf || buf.length < 4) return "empty";
	if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
	if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return "ico";
	if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
	if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
	if (buf.slice(0, 4).toString("latin1") === "RIFF") return "webp";
	const head = buf.slice(0, 400).toString("utf8").trimStart();
	if (head.startsWith("<?xml") || head.startsWith("<svg")) return "svg";
	if (/^<(!doctype|html)/i.test(head)) return "html";
	return "unknown";
}
const IMAGE_KINDS = new Set(["png", "ico", "jpeg", "gif", "webp", "svg"]);

/**
 * **通用占位图黑名单**（按"归一化之后"的 PNG 像素哈希认，不按来源 URL 认）。
 *
 * 为什么必须有：Google 的 s2 接口对**取不到 favicon 的站点**不会报错，而是返回一张
 * 通用地球图标。happy.bigmess.org 整站 503，兜底拿回来的就是这张 —— 如果直接落盘，
 * 书签页上会出现一个"看起来有图标、其实是地球"的假绿，而且断言（"必须是真图标"）
 * 会因为它是 `<img>` 而**通过**。这就是典型的"判据被兜底实现骗过"。
 * 这里把它硬编码成黑名单，命中即**丢弃该候选**，该条退回带品牌色的字母块。
 */
const PLACEHOLDER_SHA256 = new Set([
	// Google s2 对不可达站点返回的通用地球（128×128）
	"5dbb9fd491b1b1238bf6975bcef65444a6a84ff94f7282ea03adc9aeb886ac0a",
]);
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/**
 * 把 .ico 解成 PNG Buffer（sharp 自己**读不了** ico，实测三个站点全报
 * "Input buffer contains unsupported image format"）。
 *
 * ICO 容器里每个条目可能是两种东西，两种都得认：
 *   · 内嵌 PNG（Vista 之后常见）→ 直接整段丢给 sharp
 *   · 传统 DIB/BITMAPINFOHEADER（32bpp BGRA + 1bpp AND 掩码，**自底向上**存）
 *     → 自己拆 BGRA 像素交给 sharp 的 raw 通道；高度字段是"颜色高 + 掩码高"，
 *       所以真实高度 = biHeight / 2（这是最容易写错的一处）
 * 多条目时挑面积最大的那个。
 */
function decodeIco(buf) {
	if (!(buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0)) return null;
	const count = buf.readUInt16LE(4);
	const entries = [];
	for (let i = 0; i < count; i++) {
		const off = 6 + i * 16;
		if (off + 16 > buf.length) break;
		const w = buf[off] === 0 ? 256 : buf[off];
		const h = buf[off + 1] === 0 ? 256 : buf[off + 1];
		const size = buf.readUInt32LE(off + 8);
		const dataOff = buf.readUInt32LE(off + 12);
		if (dataOff + size > buf.length) continue;
		entries.push({ w, h, size, dataOff });
	}
	entries.sort((a, b) => b.w * b.h - a.w * a.h);
	for (const e of entries) {
		const seg = buf.subarray(e.dataOff, e.dataOff + e.size);
		if (seg[0] === 0x89 && seg[1] === 0x50) return { buf: seg, kind: "ico/png" };
		const biSize = seg.readUInt32LE(0);
		const bpp = seg.readUInt16LE(14);
		const hRaw = seg.readInt32LE(8);
		const wDib = seg.readInt32LE(4);
		const hDib = hRaw / 2;
		// 不支持 >32bpp / 负高度（自顶向下）的变体 —— 实测这三个站点都是 32bpp 自底向上
		if (biSize < 40 || bpp !== 32 || hDib <= 0 || wDib <= 0 || hRaw !== hDib * 2) continue;
		const px = seg.subarray(biSize, biSize + wDib * hDib * 4);
		if (px.length < wDib * hDib * 4) continue;
		const out = Buffer.allocUnsafe(wDib * hDib * 4);
		for (let y = 0; y < hDib; y++) {
			const src = (hDib - 1 - y) * wDib * 4; // DIB 自底向上 → 翻成自顶向下
			for (let x = 0; x < wDib; x++) {
				const s = src + x * 4;
				const d = (y * wDib + x) * 4;
				out[d] = px[s + 2]; // R <- B
				out[d + 1] = px[s + 1]; // G
				out[d + 2] = px[s]; // B <- R
				out[d + 3] = px[s + 3]; // A
			}
		}
		return { buf: out, kind: "ico/dib", raw: { width: wDib, height: hDib } };
	}
	return null;
}

/** 把任意候选 Buffer 变成 sharp 可读的输入（ico 先自己解） */
function toSharpInput(cand) {
	if (cand.kind !== "ico") return { input: cand.buf, tag: cand.kind };
	const dec = decodeIco(cand.buf);
	if (!dec) return null;
	if (dec.raw) {
		return {
			input: dec.buf,
			tag: dec.kind,
			rawOpts: { width: dec.raw.width, height: dec.raw.height, channels: 4 },
		};
	}
	return { input: dec.buf, tag: dec.kind };
}

async function get(url, { accept } = {}) {
	try {
		const r = await fetch(url, {
			headers: { "user-agent": UA, ...(accept ? { accept } : {}) },
			redirect: "follow",
			signal: AbortSignal.timeout(25000),
		});
		const buf = Buffer.from(await r.arrayBuffer());
		return { url, final: r.url, status: r.status, ct: r.headers.get("content-type"), buf, kind: sniff(buf) };
	} catch (e) {
		return { url, status: 0, buf: Buffer.alloc(0), kind: "error", err: String(e?.message ?? e) };
	}
}

/** 抓首页并解析所有 `rel~=icon` 的 href，按声明顺序返回绝对 URL */
async function iconLinks(home, html) {
	const abs = [];
	for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
		const tag = m[0];
		if (!/rel\s*=\s*["']?[^"'>]*icon/i.test(tag)) continue;
		const href = (tag.match(/href\s*=\s*["']([^"']+)["']/i) ?? [])[1];
		if (!href) continue;
		try {
			abs.push(new URL(href, home).href);
		} catch {}
	}
	return abs;
}

const report = [];
await fs.mkdir(OUT_DIR, { recursive: true });

for (const site of SITES) {
	const rec = { ...site, attempts: [], chosen: null, out: null };
	const candidates = [];

	// ① 根 favicon.ico
	const root = await get(`https://${site.domain}/favicon.ico`, { accept: "image/*,*/*;q=0.8" });
	rec.attempts.push({ step: "root-favicon.ico", url: root.url, status: root.status, kind: root.kind, bytes: root.buf.length, ct: root.ct ?? null });
	if (IMAGE_KINDS.has(root.kind)) candidates.push(root);

	// ② 页面里的 <link rel="icon">
	const page = await get(site.home, { accept: "text/html,application/xhtml+xml" });
	const links = page.kind === "html" || page.status === 200 ? await iconLinks(site.home, page.buf.toString("utf8")) : [];
	rec.attempts.push({ step: "home-page", url: site.home, status: page.status, kind: page.kind, bytes: page.buf.length, iconLinks: links });
	for (const href of links) {
		const r = await get(href, { accept: "image/*,*/*;q=0.8" });
		rec.attempts.push({ step: "link-icon", url: href, status: r.status, kind: r.kind, bytes: r.buf.length, ct: r.ct ?? null });
		if (IMAGE_KINDS.has(r.kind)) candidates.push(r);
	}

	// ③ Google s2 一次性兜底（仅当 ① ② 都没拿到真图片）
	if (!candidates.length) {
		const s2 = await get(`https://www.google.com/s2/favicons?domain=${site.domain}&sz=128`, {
			accept: "image/*,*/*;q=0.8",
		});
		rec.attempts.push({ step: "google-s2-fallback", url: s2.url, status: s2.status, kind: s2.kind, bytes: s2.buf.length, ct: s2.ct ?? null });
		if (IMAGE_KINDS.has(s2.kind)) candidates.push(s2);
	}

	if (!candidates.length) {
		rec.rejected = "no-image-candidate";
		report.push(rec);
		console.log(`❌ ${site.slug.padEnd(14)} 取不到 → 退回**带品牌色的字母块**（任务书允许的例外）`);
		continue;
	}

	// 选优：优先矢量/无损且体积不是极小占位，简单按 ① ② ③ 的先后取第一个能解码的
	let saved = null;
	let lastErr = null;
	for (const c of candidates) {
		try {
			const converted = toSharpInput(c);
			if (!converted) {
				lastErr = `${c.url} -> ICO 里没有可解码的条目`;
				continue;
			}
			// sharp 归一化：128×128，contain 保留完整图形，透明底（不把 logo 压扁）
			// ⚠️ raw 输入的形状是 `{ raw: {...} }`，**不是** `{ raw: { raw: {...} } }` ——
			//    第一版写错了一层，sharp 静默忽略该选项、把裸像素当 PNG 解析，
			//    于是 neea 明明有可用的官方 32×32 ico 却被判"解不开"、降级去了 Google 兜底。
			//    这类"参数写错不报错、只是行为悄悄变差"的坑和 record() 丢第 5 个参数同类。
			const png = await sharp(
				converted.input,
				converted.rawOpts ? { raw: converted.rawOpts } : { density: 384 },
			)
				.resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
				// 调色板量化（256 色 + 抖动）：favicon 本来多是平色图形，
				// 量化后体积掉一大截且肉眼无差，目标是"体积尽量 < 20 KB"
				.png({ compressionLevel: 9, palette: true, colours: 256, dither: 1 })
				.toBuffer();

			// ── 占位图守卫：兜底接口对"取不到"的站点会给通用地球，那不是品牌图标 ──
			const digest = sha256(png);
			if (PLACEHOLDER_SHA256.has(digest)) {
				lastErr = `${c.url} -> 通用占位图（sha256 ${digest.slice(0, 16)}…），已丢弃`;
				rec.rejected = "placeholder-image";
				continue;
			}

			const out = path.join(OUT_DIR, `${site.slug}.png`);
			await fs.writeFile(out, png);
			const meta = await sharp(png).metadata();
			saved = {
				source: c.final ?? c.url,
				step: rec.attempts.find((a) => a.url === c.url)?.step ?? "root-favicon.ico",
				sourceKind: c.kind,
				sourceBytes: c.buf.length,
				decodedAs: converted.tag,
				out,
				outBytes: png.length,
				outSize: `${meta.width}x${meta.height}`,
				sha256: digest,
			};
			break;
		} catch (e) {
			lastErr = `${c.url} -> ${String(e?.message ?? e)}`;
		}
	}

	if (saved) {
		rec.chosen = saved;
		rec.out = `/${path.basename(OUT_DIR)}/${site.slug}.png`;
		console.log(
			`✅ ${site.slug.padEnd(14)} ${String(saved.outBytes).padStart(6)}B  ${saved.outSize}  ← ${saved.step} ${saved.source} (${saved.sourceKind} ${saved.sourceBytes}B, 解码为 ${saved.decodedAs})`,
		);
	} else {
		rec.rejected = rec.rejected ?? "undecodable";
		console.log(`❌ ${site.slug.padEnd(14)} 候选都不可用 → 退回**带品牌色的字母块**：${lastErr}`);
	}
	report.push(rec);
}

// ── README.md（资产来源表；每次重跑本脚本都会重写）─────────────────────────
{
	const ok = report.filter((r) => r.chosen);
	const lines = [
		"# `public/booknav-icons/` —— 书签导航本地站点图标",
		"",
		"> 本目录的 PNG **不是**本站原创素材，是各站**官方 favicon** 的本地副本，",
		"> 用途只有一个：IMiss Blog 的「书签导航」页（`/booknav/`）每张卡片左侧的图标位。",
		"> 图标版权归各站点所有，本站仅作导航标识使用。",
		"",
		"## 为什么放本地",
		"",
		"运行期**零第三方请求**：图标全部随站点一起发布，访客打开书签页不会把",
		"常用站点清单交给任何 favicon 聚合服务（这是上一轮已经定下的口径，",
		"`src/config/booknavConfig.ts` 里 `favicon.enabled` 至今为 `false`）。",
		"所以配置里写的是 `/booknav-icons/<slug>.png`，**不是**网络图片 URL。",
		"",
		"## 重新获取",
		"",
		"```bash",
		"# ⚠️ 用 tsx 而不是裸 node：本脚本 `import` 了 TS 模块",
		"#    `src/constants/booknav-brand-colors.ts`（品牌色同源），裸 node 读不了 .ts",
		"npx tsx scripts/fetch-booknav-icons.mjs",
		"```",
		"",
		"脚本会重跑一遍取图（官网 `favicon.ico` → 页面 `<link rel=\"icon\">` → 一次性兜底）、",
		"用 sharp 归一化成 128×128 PNG 覆盖写回本目录，并重写这份 README 的来源表。",
		"品牌色表在 `src/constants/booknav-brand-colors.ts`（脚本与页面配置同源）。",
		"每次跑完记得 `pnpm build` 再 `pnpm verify:ui`（`scripts/verify-ui.mjs` 的 R-BOOKNAV-05~08 就是这个目录的契约）。",
		"",
		"## 当前文件与来源",
		"",
		"| 文件 | 字节 | 尺寸 | 来源 URL |",
		"|---|---:|---|---|",
	];
	for (const r of ok.sort((a, b) => a.slug.localeCompare(b.slug))) {
		lines.push(
			`| \`${path.basename(r.chosen.out)}\` | ${r.chosen.outBytes} | ${r.chosen.outSize} | ${r.chosen.step === "google-s2-fallback" ? "（Google s2 一次性兜底）" : ""}${r.chosen.source} |`,
		);
	}
	const failed = report.filter((r) => !r.chosen);
	if (failed.length) {
		lines.push("", "## 取不到、退回字母块的条目", "");
		for (const r of failed) {
			lines.push(
				`- \`${r.domain}\`（${r.slug}）—— ${r.rejected === "placeholder-image" ? "兜底返回的是通用占位图，已丢弃" : "无可用的图片候选"}；该卡片用**带品牌色的字母块**兜底。`,
			);
		}
	}
	lines.push("");
	await fs.writeFile(path.join(OUT_DIR, "README.md"), lines.join("\n"), "utf8");
	console.log(`\n-> ${OUT_DIR}/README.md（${ok.length} 条来源记录）`);
}

await fs.writeFile("reports/_bni-fetch.json", JSON.stringify(report, null, 2), "utf8");
console.log("-> reports/_bni-fetch.json");
console.log(`\n品牌色表条目数：${Object.keys(BOOKNAV_BRAND_COLORS).length}`);
