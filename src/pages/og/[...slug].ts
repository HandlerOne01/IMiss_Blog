import type { CollectionEntry } from "astro:content";
import { getCollection } from "astro:content";
import * as fs from "node:fs";
import type { APIContext, GetStaticPaths } from "astro";
import type { FontDetails } from "takumi-js";
import { ImageResponse } from "takumi-js/response";
import { profileConfig } from "@/config/profileConfig";
import { siteConfig } from "@/config/siteConfig";
import { removeFileExtension } from "@/utils/url-utils";

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
	if (!siteConfig.post.generateOgImages) {
		return [];
	}

	const allPosts = await getCollection("posts");
	const publishedPosts = allPosts.filter((post) => !post.data.draft);

	return publishedPosts.map((post) => {
		// 将 id 转换为 slug（移除扩展名）以匹配路由参数
		const slug = removeFileExtension(post.id);
		return {
			params: { slug: `${slug}.png` },
			props: { post },
		};
	});
};

// OG 图用的中文字体从 @fontsource 包本地读取，构建期不再请求 Google Fonts。
// 该包把 CJK 按 unicode-range 切成百余个分片，Takumi 用 subsetOf + subsetRank 把它们
// 组织成同一个逻辑家族（font-family: subsetOf 会展开到全部分片）。
const OG_FONT_FAMILY = "Noto Sans SC";
const OG_FONT_DIR = "node_modules/@fontsource-variable/noto-sans-sc";
let ogFonts: FontDetails[] | undefined;

const loadOgFonts = (): FontDetails[] => {
	if (ogFonts) return ogFonts;

	const unicodeRanges: Record<string, string> = JSON.parse(
		fs.readFileSync(`${OG_FONT_DIR}/unicode.json`, "utf-8"),
	);

	const fonts: FontDetails[] = Object.entries(unicodeRanges).map(
		([chunk, range]) => {
			// 键格式不统一：数字分片是 "[4]"，具名子集是裸的 "latin"，而文件名一律不带方括号
			const name = chunk.replace(/^\[|\]$/g, "");
			// rank 取该分片覆盖的最小码位，与 Takumi loadGoogleFonts 内部的取值方式一致
			const starts = range
				.split(",")
				.map((r) => Number.parseInt(r.trim().replace(/^U\+/i, ""), 16))
				.filter((n) => Number.isFinite(n));
			return {
				name,
				data: fs.readFileSync(
					`${OG_FONT_DIR}/files/noto-sans-sc-${name}-wght-normal.woff2`,
				),
				subsetOf: OG_FONT_FAMILY,
				subsetRank: starts.length > 0 ? Math.min(...starts) : 0,
			};
		},
	);

	ogFonts = fonts;
	return fonts;
};

// Detect image format from magic bytes, returns mime type or null if unknown
const detectImageFormat = (buffer: Buffer): string | null => {
	if (buffer.length < 12) return null;

	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if (
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47 &&
		buffer[4] === 0x0d &&
		buffer[5] === 0x0a &&
		buffer[6] === 0x1a &&
		buffer[7] === 0x0a
	)
		return "image/png";

	// JPEG: FF D8 FF
	if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
		return "image/jpeg";

	// GIF: GIF87a or GIF89a
	if (
		buffer[0] === 0x47 &&
		buffer[1] === 0x49 &&
		buffer[2] === 0x46 &&
		buffer[3] === 0x38 &&
		(buffer[4] === 0x37 || buffer[4] === 0x39) &&
		buffer[5] === 0x61
	)
		return "image/gif";

	// WebP: RIFF ???? WEBP
	if (
		buffer[0] === 0x52 &&
		buffer[1] === 0x49 &&
		buffer[2] === 0x46 &&
		buffer[3] === 0x46 &&
		buffer[8] === 0x57 &&
		buffer[9] === 0x45 &&
		buffer[10] === 0x42 &&
		buffer[11] === 0x50
	)
		return "image/webp";

	return null;
};

// Formats natively supported — no conversion needed
const SUPPORTED_FORMATS = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
]);

// 缓存 sharp 模块，避免重复动态导入
let sharpPromise: Promise<typeof import("sharp")["default"]> | null = null;
function getSharp() {
	if (!sharpPromise) {
		sharpPromise = import("sharp").then((m) => m.default);
	}
	return sharpPromise;
}

// Minimal 1×1 transparent PNG, hardcoded — no sharp call needed for fallback,
// so it still works even if sharp itself failed to load.
const TRANSPARENT_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

let transparentPngBuffer: ArrayBuffer | null = null;
function getTransparentPngArrayBuffer(): ArrayBuffer {
	if (!transparentPngBuffer) {
		const buf = Buffer.from(TRANSPARENT_PNG_BASE64, "base64");
		transparentPngBuffer = buf.buffer.slice(
			buf.byteOffset,
			buf.byteOffset + buf.byteLength,
		) as ArrayBuffer;
	}
	return transparentPngBuffer;
}

// Log a warning and fall back to a transparent PNG
const warnAndFallback = (imagePath: string, detail: string): ArrayBuffer => {
	console.warn(
		"\n \x1b[33m[OG Image] Warning \n" +
			` 无法加载或处理图片 "${imagePath}"，可能是文件缺失、网络错误或不被支持的格式。\n` +
			" 已使用透明图片替代。\n" +
			` Failed to load or process image "${imagePath}", possibly missing file, network error, or unsupported format.\n` +
			" A transparent image was used instead.\n" +
			` ${detail}\x1b[0m`,
	);
	return getTransparentPngArrayBuffer();
};

// ── v1.107：远程图降级（发起人：「把 OG 图生成改成『远程图取不到就跳过』的降级，
//    让构建永远不被别人的图床影响」）────────────────────────────────────────────
/**
 * 构建期**真正会拉远程图**的那一步（v1.107 实测查明，不是猜的）：
 *   1. **takumi-js 的 emoji 替换** —— `takumi-js/dist/render-*.mjs` 里
 *      `import { extractEmojis } from "@takumi-rs/helpers/emoji"`，默认 `emoji: "twemoji"`；
 *      `@takumi-rs/helpers` 把正文里的 emoji 换成
 *      `<img src="https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.2/assets/svg/<码位>.svg">`，
 *      渲染时由 takumi **自己 fetch** 这个 URL。
 *      ⚠️ 这就是 v1.102 / v1.103 那两轮 `pnpm build` 挂掉的**真正原因**：站内标题/描述里带 emoji 的
 *      只有 `project/my-server-siweidaotu`（description 以 🎯 开头）与
 *      `project/sousuoyinqingsiweidaotu`，构建日志恰好死在
 *      `/og/project/my-server-siweidaotu.png/`、错误里 `host: 'cdn.jsdelivr.net'`
 *      （本机到 jsdelivr 的 TLS 被重置）—— 见 `reports/_v1102-build.log`；
 *      v1.107 用 `reports/_og-block-v1107.mjs` 拦住同一个 host **当场复现**（退出码 1、栈里就是
 *      `collectImages → prepareImages → fetch`），修好后同一注入**退出码 0**。
 *   2. 本文件自己的 `loadImageAsArrayBuffer` —— 只在 `src` 是 `http(s)://` 时才 fetch
 *      （当前 `profileConfig.avatar` 与 `siteConfig.favicon` 都是站内相对路径，所以正常构建 0 次远程请求）。
 * 降级做法（两层，缺一不可）：
 *   · **第一层（对 takumi 内部那条路）**：给 `images` 传**自定义 `fetch`** —— takumi 会把它透传给
 *     `prepareImages`（`FetchOptions.fetch`）。我们的 `guardedImageFetch` 自己计时（超时即放弃），
 *     **失败/超时/非 2xx 一律返回本地 1×1 透明 PNG**、**永不 reject** —— 于是那一张图被"跳过"，
 *     `ImageResponse` 正常出图。⚠️ 同时把 takumi 自带的 `timeout` 设成 **0**（关掉）：它的超时走
 *     `abort`，而 `prepareImages` 在 fetch 返回后会 `throwIfAborted()` 抛错 —— 那会把"超时"变回"整个构建挂"。
 *   · **第二层（兜底，挡住任何我们控制不到的路径）**：`await response.arrayBuffer()` 把渲染**真正跑在
 *     try/catch 里**（`ImageResponse` 是惰性 ReadableStream，错误是在**读 body 时**才冒出来的，
 *     包构造函数没用 —— v1.102 的报错正是这样冒出来的）。失败 → 去掉 emoji 再渲染一次（emoji 是
 *     唯一会去远程取的文本来源）→ 还失败 → 本地纯色 PNG（sharp 画，不碰网络）。
 * 每次降级都打**一行**可辨识 warning（含 URL 与原因），前缀固定为 `[OG Image] ⚠️`。
 */
const OG_REMOTE_TIMEOUT_MS = 8000;
const OG_RENDER_TIMEOUT_MS = 30000;

/** 把错误变成一行可读的原因（含 undici 的 cause 链，如 ECONNRESET / ERR_TLS_…）。 */
const describeError = (err: unknown): string => {
	const parts: string[] = [];
	let cur: unknown = err;
	for (let depth = 0; depth < 4 && cur; depth++) {
		if (cur instanceof Error) {
			parts.push(cur.message);
			const code = (cur as { code?: unknown }).code;
			if (typeof code === "string") parts.push(code);
			cur = (cur as { cause?: unknown }).cause;
		} else {
			parts.push(String(cur));
			break;
		}
	}
	return [...new Set(parts)].join(" ← ") || "未知错误";
};

/** 本地占位图字节（1×1 透明 PNG），远程图取不到时用它顶上。 */
const getPlaceholderPngBytes = (): ArrayBuffer =>
	getTransparentPngArrayBuffer();

/**
 * 传给 takumi 的自定义 fetch：**永不 reject**。
 * 取不到（超时 / DNS / TLS / 非 2xx / 其它网络错误）→ 打一行 warning + 返回透明 PNG →
 * 那张图在渲染里等于"跳过"，其余照常。
 */
const guardedImageFetch = async (
	input: string,
	init?: RequestInit,
): Promise<Response> => {
	const controller = new AbortController();
	const timer = setTimeout(
		() =>
			controller.abort(new Error(`请求超过 ${OG_REMOTE_TIMEOUT_MS}ms 未完成`)),
		OG_REMOTE_TIMEOUT_MS,
	);
	try {
		const res = await fetch(input, { ...init, signal: controller.signal });
		if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
		return res;
	} catch (err) {
		console.warn(
			`[OG Image] ⚠️ 远程图取不到，已跳过（用本地占位图继续出图）：${input}｜原因：${describeError(err)}`,
		);
		return new Response(getPlaceholderPngBytes(), {
			status: 200,
			headers: { "content-type": "image/png" },
		});
	} finally {
		clearTimeout(timer);
	}
};

/** 超时护栏：渲染卡住时不拖住构建（被放弃的那次渲染会自己跑完，结果丢弃）。 */
const withTimeout = <T>(
	promise: Promise<T>,
	ms: number,
	label: string,
): Promise<T> =>
	new Promise<T>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`${label}：超过 ${ms}ms 仍未完成`)),
			ms,
		);
		promise.then(
			(v) => {
				clearTimeout(timer);
				resolve(v);
			},
			(e) => {
				clearTimeout(timer);
				reject(e);
			},
		);
	});

/**
 * 去掉文本里的 emoji（连同变体选择符 / ZWJ / 肤色修饰 / 区域指示符 / 键帽）。
 * 只在**兜底渲染**里用：emoji 是 OG 文本唯一会让 takumi 去远程取图的东西，去掉它就等于
 * "把取不到的远程图跳过"，标题与描述的文字部分一个不丢。
 */
const stripEmojiText = (text: string): string =>
	text
		.replace(/\p{Extended_Pictographic}/gu, "")
		.replace(/[\uFE00-\uFE0F\u20E3]/gu, "") // 变体选择符 / 键帽
		.replace(/\u200D/gu, "") // 零宽连接符（单独一步，不写进字符类）
		.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "") // 肤色修饰
		.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "") // 区域指示符（国旗）
		.replace(/[ \t]{2,}/g, " ")
		.trim();

/** HSL → 0-255 RGB（纯色兜底图用；sharp 的 background 接受 {r,g,b}）。 */
const hslToRgb = (
	h: number,
	s: number,
	l: number,
): [number, number, number] => {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const hp = (((h % 360) + 360) % 360) / 60;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	const [r1, g1, b1] =
		hp < 1
			? [c, x, 0]
			: hp < 2
				? [x, c, 0]
				: hp < 3
					? [0, c, x]
					: hp < 4
						? [0, x, c]
						: hp < 5
							? [x, 0, c]
							: [c, 0, x];
	const m = l - c / 2;
	return [
		Math.round((r1 + m) * 255),
		Math.round((g1 + m) * 255),
		Math.round((b1 + m) * 255),
	];
};

/** 最后一档兜底：本地纯色 1200×630 PNG（sharp 画，不碰网络）。 */
const buildSolidOgPng = async (hue: number): Promise<Buffer> => {
	const [r, g, b] = hslToRgb(hue, 0.15, 0.12);
	const sharp = await getSharp();
	return sharp({
		create: { width: 1200, height: 630, channels: 3, background: { r, g, b } },
	})
		.png()
		.toBuffer();
};

// Helper to load avatar/favicon with caching
const loadImageAsArrayBuffer = async (
	imagePath: string,
): Promise<ArrayBuffer> => {
	try {
		let buffer: Buffer;

		if (imagePath.startsWith("http")) {
			// v1.107：远程图必须**带超时**——没有超时的话，一个卡住的图床能把构建无限期挂住。
			const res = await fetch(imagePath, {
				signal: AbortSignal.timeout(OG_REMOTE_TIMEOUT_MS),
			});
			if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
			buffer = Buffer.from(await res.arrayBuffer());
		} else {
			const normalized = imagePath.replace(/^\.\//, "");

			// Try resolving the file in order: src/ -> public/ -> path as-is
			const candidatePaths = [`./src/${normalized}`, `./public/${normalized}`];

			const foundPath = candidatePaths.find((p) => fs.existsSync(p));

			if (!foundPath) {
				return warnAndFallback(
					imagePath,
					`Tried paths: ${candidatePaths.join(", ")}`,
				);
			}

			buffer = fs.readFileSync(foundPath);
		}

		const detectedFormat = detectImageFormat(buffer);

		if (!detectedFormat || !SUPPORTED_FORMATS.has(detectedFormat)) {
			const sharp = await getSharp();
			buffer = Buffer.from(
				await sharp(buffer as Buffer)
					.png()
					.toBuffer(),
			);
		}

		return buffer.buffer.slice(
			buffer.byteOffset,
			buffer.byteOffset + buffer.byteLength,
		) as ArrayBuffer;
	} catch (err) {
		return warnAndFallback(
			imagePath,
			`Error: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
};

export async function GET({
	props,
}: APIContext<{ post: CollectionEntry<"posts"> }>): Promise<Response> {
	const { post } = props;

	// Load and get static assets
	let iconPath = "/favicon/favicon-dark-192.png";
	if (siteConfig.favicon.length > 0) {
		const pngFavicon = siteConfig.favicon.find((f) =>
			f.src.toLowerCase().endsWith(".png"),
		);
		iconPath = (pngFavicon ?? siteConfig.favicon[0]).src;
	}

	const hue = siteConfig.themeColor.hue;
	const primaryColor = `hsl(${hue}, 90%, 65%)`;
	const textColor = "hsl(0, 0%, 95%)";
	const subtleTextColor = `hsl(${hue}, 10%, 75%)`;
	const backgroundColor = `hsl(${hue}, 15%, 12%)`;

	const pubDate = post.data.published.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});

	const description = post.data.description;

	// v1.107：整棵元素树收进一个函数，好让兜底那一次能**换一份文本**（去掉 emoji）再渲染。
	const renderOgPng = async (
		titleText: string,
		descriptionText: string | undefined,
	): Promise<Buffer> => {
		const response = new ImageResponse(
			{
				type: "div",
				props: {
					style: {
						height: "100%",
						width: "100%",
						display: "flex",
						flexDirection: "column",
						backgroundColor: backgroundColor,
						fontFamily:
							'"Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
						padding: "60px",
					},
					children: [
						{
							type: "div",
							props: {
								style: {
									width: "100%",
									display: "flex",
									alignItems: "center",
									gap: "20px",
								},
								children: [
									{
										type: "img",
										props: {
											src: "og-icon",
											width: 48,
											height: 48,
											style: {
												borderRadius: "10px",
												width: 48,
												height: 48,
												objectFit: "cover",
											},
										},
									},
									{
										type: "div",
										props: {
											style: {
												fontSize: "36px",
												fontWeight: 600,
												color: subtleTextColor,
											},
											children: siteConfig.title,
										},
									},
								],
							},
						},

						{
							type: "div",
							props: {
								style: {
									display: "flex",
									flexDirection: "column",
									justifyContent: "center",
									flexGrow: 1,
									gap: "20px",
								},
								children: [
									{
										type: "div",
										props: {
											style: {
												display: "flex",
												alignItems: "flex-start",
											},
											children: [
												{
													type: "div",
													props: {
														style: {
															width: "10px",
															height: "68px",
															backgroundColor: primaryColor,
															borderRadius: "6px",
															marginTop: "14px",
															flexShrink: 0,
														},
													},
												},
												{
													type: "div",
													props: {
														style: {
															fontSize: "72px",
															fontWeight: 700,
															color: textColor,
															marginLeft: "25px",
															overflow: "hidden",
															textOverflow: "ellipsis",
															lineClamp: 3,
															WebkitLineClamp: 3,
															WebkitBoxOrient: "vertical",
															"text-fit": "grow per-line-all",
															display: "flex",
															flexDirection: "column",
														},
														children: titleText,
													},
												},
											],
										},
									},
									...(descriptionText
										? [
												{
													type: "div",
													props: {
														style: {
															fontSize: "32px",
															color: subtleTextColor,
															paddingLeft: "35px",
															overflow: "hidden",
															textOverflow: "ellipsis",
															lineClamp: 2,
															WebkitLineClamp: 2,
															WebkitBoxOrient: "vertical",
															"text-fit": "grow per-line-all",
															display: "flex",
															flexDirection: "column",
														},
														children: descriptionText,
													},
												},
											]
										: []),
								],
							},
						},
						{
							type: "div",
							props: {
								style: {
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									width: "100%",
								},
								children: [
									{
										type: "div",
										props: {
											style: {
												display: "flex",
												alignItems: "center",
												gap: "20px",
											},
											children: [
												{
													type: "img",
													props: {
														src: "og-avatar",
														width: 60,
														height: 60,
														style: {
															borderRadius: "50%",
															width: 60,
															height: 60,
															objectFit: "cover",
														},
													},
												},
												{
													type: "div",
													props: {
														style: {
															fontSize: "28px",
															fontWeight: 600,
															color: textColor,
														},
														children: profileConfig.name,
													},
												},
											],
										},
									},
									{
										type: "div",
										props: {
											style: { fontSize: "28px", color: subtleTextColor },
											children: pubDate,
										},
									},
								],
							},
						},
					],
				},
			},
			{
				width: 1200,
				height: 630,
				format: "png",
				images: {
					cache: "auto",
					// ⚠️ 关掉 takumi 自带的超时：它超时走 `abort`，而 `prepareImages` 在 fetch 返回后
					//    会 `throwIfAborted()` 抛错 —— 那又变回"一个图床把整条构建挂掉"。超时由
					//    `guardedImageFetch` 自己做，失败一律降级成透明占位图。
					timeout: 0,
					fetch: guardedImageFetch,
					sources: [
						{
							src: "og-avatar",
							data: () => loadImageAsArrayBuffer(profileConfig.avatar ?? ""),
						},
						{
							src: "og-icon",
							data: () => loadImageAsArrayBuffer(iconPath),
						},
					],
				},
				fonts: loadOgFonts(),
				headers: {
					"Content-Type": "image/png",
					"Cache-Control": "public, max-age=31536000, immutable",
				},
			},
		);
		// ⚠️ 渲染是**惰性**的（`ImageResponse` 的 body 是个 ReadableStream）：错误只有在读 body 时
		//    才冒出来，所以必须在这里 `await`，否则 try/catch 拦不住（v1.102 就是这么挂的）。
		return Buffer.from(await response.arrayBuffer());
	};

	const pngResponse = (png: Buffer): Response =>
		new Response(
			png.buffer.slice(
				png.byteOffset,
				png.byteOffset + png.byteLength,
			) as ArrayBuffer,
			{
				headers: {
					"Content-Type": "image/png",
					"Cache-Control": "public, max-age=31536000, immutable",
				},
			},
		);

	// ── 三级降级：正常渲染 → 去掉 emoji 再渲染 → 本地纯色图 ───────────────
	try {
		return pngResponse(
			await withTimeout(
				renderOgPng(post.data.title, description),
				OG_RENDER_TIMEOUT_MS,
				"OG 渲染",
			),
		);
	} catch (err) {
		console.warn(
			`[OG Image] ⚠️ 渲染失败，已跳过远程图重试（不请求任何远程资源）：${post.id}｜原因：${describeError(err)}`,
		);
	}
	try {
		return pngResponse(
			await withTimeout(
				renderOgPng(
					stripEmojiText(post.data.title),
					description && stripEmojiText(description),
				),
				OG_RENDER_TIMEOUT_MS,
				"OG 兜底渲染",
			),
		);
	} catch (err) {
		console.warn(
			`[OG Image] ⚠️ 兜底渲染也失败，改用本地纯色占位图：${post.id}｜原因：${describeError(err)}`,
		);
	}
	return pngResponse(await buildSolidOgPng(hue));
}
