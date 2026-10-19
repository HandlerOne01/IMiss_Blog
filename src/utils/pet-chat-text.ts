/**
 * 聊天框的**文本兜底清洗**（R-PET-11）
 * ============================================================================
 * 发起人 2026-09-27 第五轮反馈的图证里，气泡原样显示了 `**规范驱动开发**` 的星号。
 * 人设（`agent/persona-aemeath-v*.txt`）本来就**禁止**加粗 / 表格 / 标题，但那是"后端
 * 该守的规矩"——前端不能假设它永远守得住：模型换版本、提示词被人改、工具节点把
 * 检索结果的 Markdown 原样塞进 `ai` 消息，任何一种都会让裸符号漏到访客眼前。
 *
 * 所以这一层是**前端兜底**，不是"再实现一遍 Markdown 渲染"（本站不打算在气泡里渲染
 * 富文本：气泡只有 340px 宽，表格与标题只会更难读）。规则（顺序敏感，见 `cleanMarkdown`）：
 *   ① 块级：围栏代码块标记 / 标题 `#` / 引用 `>` / 分隔线 `---` / 表格（分隔行整行丢、
 *      内容行的 `|` 换成 ` · `）/ **无序**列表符号换成 `· `，**有序列表保留序号**
 *      （v1.114：后端会问「回序号就行」并按 `1. 《标题》 · 分类 · 约 N 字` 排版，
 *       原来把 `1. ` 也压成 `· ` —— 序号没了，访客没法照着回，实测被发起人抓到）
 *   ② 行内：`**粗**`·`__粗__` → 文字；`*斜*` → 文字；`![alt](url)` → `alt`；
 *      `[文字](url)` → `文字`（顺带满足人设的"不出现完整域名"）
 *   ③ 空白：行尾空格、三连以上空行压成一个空行、首尾空行去掉
 *
 * ⚠️ **不许碰 `_`**：`word_count_min` 这类标识符里的下划线被拆掉会变成另一种泄漏
 *    （禁词表里就有它）；下划线强调只处理 `__成对__` 这一种形态。
 * ⚠️ 这个文件**不碰 DOM、不读配置**：纯函数，方便 `verify:ui` 之外的地方单独复用它
 *    （例如以后把答案落到剪贴板、或做纯 Node 的回归）。
 */

/** 单个气泡里最多渲染多少字（防 30 万字的畸形事件把 DOM 撑爆；截断处留一句可读的尾巴） */
export const CHAT_TEXT_MAX = 8000;

/** 截断后补的尾巴：**不是**报错文案，只说"后面还有" */
const TRUNCATED_TAIL = "\n\n……后面还有一大段，我先收在这儿。";

/** 行内强调：`**x**` / `__x__`（成对才动，且不跨行） */
const BOLD_RE = /\*\*([^\n]+?)\*\*|__([^\n]+?)__/g;
/** 行内斜体：`*x*`（**不处理单个下划线**，理由见文件头；开头的 `*` 后面必须紧跟非空白，
 *  否则 `2 * 3 * 4` 这种算式会被误伤） */
const ITALIC_RE = /\*(\S[^\n*]*?)\*/g;
/** 图片 → 只留 alt（URL 里常有完整域名，人设禁止） */
const IMAGE_RE = /!\[([^\]\n]*)\]\(([^)\n]*)\)/g;
/** 链接 → 只留文字（同样为了不泄漏完整域名） */
const LINK_RE = /\[([^\]\n]+)\]\(([^)\n]*)\)/g;
/** 标题：行首 1~6 个 `#` + 空格 */
const HEADING_RE = /^[ \t]{0,3}#{1,6}[ \t]+/;
/** 引用：行首 `>`（可带空格） */
const QUOTE_RE = /^[ \t]{0,3}>[ \t]?/;
/** 分隔线：`---` / `***` / `___`（≥3 个同样的符号，允许中间有空格） */
const HR_RE = /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
/** 表格分隔行：`| --- | :---: |` 这种（只有 `-` `:` `|` 与空格） */
const TABLE_SEP_RE = /^[ \t]*\|?[ \t:|-]*-[ \t:|-]*\|[ \t:|-]*$/;
/** 列表项：`- ` / `* ` / `+ ` / `1. `（捕获"缩进 + 记号"两段，见下面取代逻辑） */
const LIST_RE = /^([ \t]*)([-*+]|\d{1,3}[.)])[ \t]+/;
/** 围栏代码块标记（``` 或 ~~~ 开头的一整行） */
const FENCE_RE = /^[ \t]{0,3}(?:`{3,}|~{3,})[^\n]*$/;

/**
 * 一行是不是"表格行"（含 `|` 且去掉 `|` 之后还有内容）。
 * 只用来决定要不要把 `|` 换成 ` · `——普通正文里出现一个竖线（例如"a | b"）
 * 也算表格行，但把竖线换成间隔点**不会**破坏可读性，反而更稳（不会漏给访客）。
 */
function isTableRow(line: string): boolean {
	if (!line.includes("|")) return false;
	return line.replace(/\|/g, "").trim().length > 0;
}

/**
 * 把一段可能带 Markdown 的答复洗成**纯文本**（R-PET-11）。
 *
 * 幂等（洗过一遍的文本再洗一遍不变），且**不会**引入任何裸符号：
 * 结果里不含 `**` / 行首 `#` / `|` / 行首 `>`。
 */
export function cleanMarkdown(raw: string): string {
	if (!raw) return "";
	let text = raw.replace(/\r\n?/g, "\n");

	// ① 块级（逐行）
	const lines: string[] = [];
	for (const line of text.split("\n")) {
		if (FENCE_RE.test(line)) continue; // 围栏标记整行丢，代码正文保留
		if (HR_RE.test(line)) {
			lines.push("");
			continue;
		}
		if (TABLE_SEP_RE.test(line) && line.includes("|") && line.includes("-"))
			continue; // 表格分隔行整行丢
		let out = line.replace(HEADING_RE, "").replace(QUOTE_RE, "");
		if (isTableRow(out)) {
			out = out
				.replace(/^[ \t]*\|/, "")
				.replace(/\|[ \t]*$/, "")
				.split("|")
				.map((cell) => cell.trim())
				.filter(Boolean)
				.join(" · ");
		}
		// v1.114：**有序列表保留序号**（`1.` / `2.`，把 `1)` 统一成 `1.`），无序的才换成 `· `
		// —— 后端那句「回序号就行」要求访客能看见序号。这个取代是幂等的：
		//    再洗一遍时 `1. ` 仍匹配 LIST_RE，输出还是 `1. `。
		out = out.replace(LIST_RE, (_m, indent: string, marker: string) =>
			/^\d/.test(marker)
				? `${indent}${marker.replace(/\)$/, ".")} `
				: `${indent}· `,
		);
		lines.push(out);
	}
	text = lines.join("\n");

	// ② 行内
	text = text
		.replace(IMAGE_RE, "$1")
		.replace(LINK_RE, "$1")
		.replace(BOLD_RE, (_m, a: string, b: string) => a ?? b ?? "")
		.replace(ITALIC_RE, "$1")
		.replace(/`{1,3}([^`\n]*)`{1,3}/g, "$1"); // 行内 code 的反引号也去掉（符号不漏给访客）

	// ③ 空白
	text = text
		.split("\n")
		.map((l) => l.replace(/[ \t]+$/, ""))
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/^\n+/, "")
		.replace(/\n+$/, "");

	// ④ 极长文本兜底截断（畸形事件 / 长回答）
	if (text.length > CHAT_TEXT_MAX)
		text = text.slice(0, CHAT_TEXT_MAX).trimEnd() + TRUNCATED_TAIL;
	return text;
}

/**
 * 用户自己那句话的清洗：**只做"不炸布局"的最低限度处理**。
 * 为什么要区别对待：用户输入是他自己写的，把 `**` 吃掉会让他觉得"我打的东西没了"；
 * 但换行 / 超长同样会把气泡撑坏，所以只压空白与长度。
 */
export function cleanUserText(raw: string, maxLength: number): string {
	const t = raw.replace(/\s+/g, " ").trim();
	return t.length > maxLength ? t.slice(0, maxLength) : t;
}

/** 这条答复要不要折叠（超过配置阈值才折，见 `PetChatConfig.collapseChars` 的注释） */
export function shouldCollapse(text: string, collapseChars: number): boolean {
	return text.length > collapseChars;
}

/**
 * 站内路径（v1.114 新增）：爱弥斯经常把文章地址原样报出来（`/posts/cpp/cpp-jichuyufa/`），
 * 以前它在气泡里只是**纯文本、点了没反应** —— 发起人：「链接好像点不了，链接可以支持点击后跳转吗」。
 * 这里只做**切段**（纯函数，方便单测），渲染交给组件；规则：
 *   · 只认本站的一级段（posts / projects / gallery / …）+ URL 安全字符，**不认完整域名**
 *     （人设禁止出现完整域名，所以 `https://imissblog.cn/posts/x/` 里的 `/posts/x/` 也**不**变成链接）
 *   · 前面紧跟字母/数字/`.`/`:` 的不算（那是别的 URL 的一部分，不是独立站内路径）
 */
const SITE_PATH_RE =
	/(?<![A-Za-z0-9.:])\/(?:posts|projects|gallery|dynamic|booknav|archive|about-site|about|roadmap|vndb|myanimelist|bangumi|bilibili)(?:\/[A-Za-z0-9._~%+-]*)*\/?/g;

export type ChatTextSegment = { kind: "text" | "link"; value: string };

/** 把一段气泡文本切成「普通文本」与「站内链接」两种段（顺序保留、拼接回来与原串逐字相同） */
export function splitChatLinks(text: string): ChatTextSegment[] {
	const out: ChatTextSegment[] = [];
	let last = 0;
	for (const m of text.matchAll(SITE_PATH_RE)) {
		const idx = m.index ?? 0;
		const value = m[0];
		// 只要「/」结尾的裸一级段（`/posts/`）也算链接；长度 1 的空段直接跳过
		if (idx > last) out.push({ kind: "text", value: text.slice(last, idx) });
		if (value.length > 1) out.push({ kind: "link", value });
		last = idx + value.length;
	}
	if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
	return out;
}

/** 时间戳（`21:04`）——历史区每行都挂一个，方便回溯多轮 */
export function formatClock(at: number): string {
	const d = new Date(at);
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	return `${hh}:${mm}`;
}
