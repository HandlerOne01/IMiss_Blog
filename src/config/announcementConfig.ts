import type { AnnouncementConfig } from "../types/announcementConfig";

export const announcementConfig: AnnouncementConfig = {
	// 公告标题，留空则走i18n默认标题
	title: "",

	// 公告内容
	// ⚠️ 原值是**模板自带的示例文案**「欢迎来到我的博客！这是一则示例公告。」—— 它跟着 `sidebarConfig`
	//    里两处 `type: "announcement"`（左栏 + 移动端底部面板）出现在**每一页**的侧栏公告卡里。
	//    v1.60 发起人看着侧栏截图原话：「这个示例公告是什么鬼？正式一点」，遂换成下面这句正式文案：
	//    句中的数字是**站内已核实的事实**（`pnpm verify:posts` = 137 篇；`roadmapConfig` = 8 条主线 / 140 站），
	//    改写前请先重跑那两项校验，别让公告里的数字先烂掉。
	//    ⚠️ 这一整句同时是 `scripts/verify-ui.mjs` 里「模板示例文案守卫」的**正控**判据（逐字匹配 +
	//       片段 `137 篇技术笔记`）：改这句话必须同步改那条断言，否则守卫会判红（这是故意的）。
	//    ⚠️ v1.85：「项目」那 3 篇也做成文章后，134 → **137** 篇、137 → **140** 站（两处数字与断言一起改）。
	content: "本站已整理 137 篇技术笔记，并按 8 条主线排成学习路线（140 站）；站内搜索与桌宠对话均已上线。",

	// 是否允许用户关闭公告
	closable: true,

	link: {
		// 启用链接
		enable: true,
		// 链接文本
		text: "了解更多",
		// 链接 URL
		// ⚠️ v1.65 起从 `/about/` 改成 `/about-site/`：发起人 2026-10-08 原话
		//    「把公告跳转后的地方放在关于本站那里」——公告讲的是"本站有什么"，
		//    落点自然该是「关于本站」那一页（原来那页的内容也确实讲的是站，已整体搬过去）。
		url: "/about-site/",
		// 内部链接
		external: false,
	},
};
