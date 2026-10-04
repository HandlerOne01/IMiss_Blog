import type { AnnouncementConfig } from "../types/announcementConfig";

export const announcementConfig: AnnouncementConfig = {
	// 公告标题，留空则走i18n默认标题
	title: "",

	// 公告内容
	// ⚠️ 原值是**模板自带的示例文案**「欢迎来到我的博客！这是一则示例公告。」—— 它跟着 `sidebarConfig`
	//    里两处 `type: "announcement"`（左栏 + 移动端底部面板）出现在**每一页**的侧栏公告卡里。
	//    v1.60 发起人看着侧栏截图原话：「这个示例公告是什么鬼？正式一点」，遂换成下面这句正式文案：
	//    句中的数字是**站内已核实的事实**（`pnpm verify:posts` = 133 篇；`roadmapConfig` = 8 条主线 / 136 站），
	//    改写前请先重跑那两项校验，别让公告里的数字先烂掉。
	//    ⚠️ 这一整句同时是 `scripts/verify-ui.mjs` 里「模板示例文案守卫」的**正控**判据（逐字匹配 +
	//       片段 `133 篇技术笔记`）：改这句话必须同步改那条断言，否则守卫会判红（这是故意的）。
	content: "本站已整理 133 篇技术笔记，并按 8 条主线排成学习路线（136 站）；站内搜索与桌宠对话均已上线。",

	// 是否允许用户关闭公告
	closable: true,

	link: {
		// 启用链接
		enable: true,
		// 链接文本
		text: "了解更多",
		// 链接 URL
		url: "/about/",
		// 内部链接
		external: false,
	},
};
