/**
 * 聊天文本清洗的**纯函数守卫**（v1.114 新增）
 * ============================================================================
 * 为什么要有它：2026-10-12 发起人在线上抓到 —— 爱弥斯问「回序号就行」，而气泡里的列表
 * **序号全没了**（都被前端 `cleanMarkdown()` 换成了 `·`）。根因是 `pet-chat-text.ts` 里那条
 * 「列表符号一律换成 `· `」的兜底规则，把有序列表的 `1. ` 一起吃了。
 *
 * 这个坑**浏览器断言抓不到**：线上那条列表来自真后端，而 `verify:ui` 跑的是假后端 +
 * 固定台词，判据里根本没有"有序列表"这一形态。所以这里做一层**不依赖浏览器、毫秒级**的
 * 纯函数回归 —— 它钉的是"清洗规则本身"，与后端在不在、模型说了什么无关。
 *
 * 用法：`pnpm verify:chat-text`（退出码 0 = 全过）
 */
import { cleanMarkdown } from "../src/utils/pet-chat-text";

type Case = {
	name: string;
	input: string;
	ok: (out: string) => boolean;
	/** 失败时打印什么（成功时也打一行，方便肉眼扫） */
	show: (out: string) => string;
};

const CASES: Case[] = [
	{
		name: "有序列表保留序号（后端「回序号就行」的前提）",
		input:
			"上面这些，要不要我挑一篇给你讲讲？回序号就行，不用就回「不用」：\n" +
			"1. 《vibecoding IMiss_Blog个人博客》 · 项目实战 · 约 1617 字\n" +
			"2. 《本站使用与维护手册》 · 本站维护 · 约 11353 字\n" +
			"3. 《仿 muduo 实现的高并发服务器》 · 项目实战 · 约 5580 字",
		ok: (o) => /^1\. 《vibecoding/m.test(o) && /^2\. 《本站/m.test(o) && /^3\. 《仿/m.test(o),
		show: (o) => o.split("\n").slice(1).join(" ⏎ "),
	},
	{
		name: "无序列表仍然换成 `·`（原来的兜底不许退化）",
		input: "- 甲\n* 乙\n+ 丙",
		ok: (o) => /^· 甲$/m.test(o) && /^· 乙$/m.test(o) && /^· 丙$/m.test(o),
		show: (o) => o.replace(/\n/g, " ⏎ "),
	},
	{
		name: "`1)` 写法统一成 `1.`（两种都算有序）",
		input: "1) 甲\n2) 乙",
		ok: (o) => /^1\. 甲$/m.test(o) && /^2\. 乙$/m.test(o),
		show: (o) => o.replace(/\n/g, " ⏎ "),
	},
	{
		name: "幂等：洗两遍与洗一遍完全一致",
		input: "1. 《甲》 · 项目实战 · 约 100 字\n- 无序一条\n**粗体**与[链接](https://example.com/x)",
		ok: () => true, // 真正的判定在下面单独做
		show: () => "（等价性单独断言）",
	},
	{
		name: "原有兜底没退化：粗体 / 链接 / 标题 / 表格 / 围栏",
		input: "## 标题\n**加粗**\n[文字](https://a.example.com/b)\n| a | b |\n| --- | --- |\n| 1 | 2 |\n```\ncode\n```",
		ok: (o) =>
			!o.includes("**") && !o.includes("https://") && !/^#/m.test(o) && !o.includes("```") && o.includes("加粗") && o.includes("文字"),
		show: (o) => o.replace(/\n/g, " ⏎ "),
	},
];

let failed = 0;
const record = (name: string, pass: boolean, detail: string) => {
	if (!pass) failed++;
	console.log(`${pass ? "✅" : "❌"} ${name}\n     输出：${detail}`);
};

for (const c of CASES) {
	const out = cleanMarkdown(c.input);
	record(c.name, c.ok(out), c.show(out));
}

// 幂等单独验（洗两遍 == 洗一遍）
{
	const once = cleanMarkdown(CASES[3].input);
	const twice = cleanMarkdown(once);
	record("幂等性", once === twice, once === twice ? "两遍一致 ✓" : `一遍=${JSON.stringify(once)} 两遍=${JSON.stringify(twice)}`);
}

console.log(`\n聊天文本清洗 ${CASES.length + 1} 项：通过 ${CASES.length + 1 - failed}，失败 ${failed}`);
process.exit(failed === 0 ? 0 : 1);
