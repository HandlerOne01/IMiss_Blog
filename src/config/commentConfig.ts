import type { CommentConfig } from "../types/commentConfig";

// ── P4-8（v1.49）：五处上游演示端点全部清空 ─────────────────────────────────
// 发起人 2026-09-29 决定：**不指向任何上游仓库 / 上游演示服务**。上游模板把这几个值
// 直接提交在配置里，它们全是"模板作者的演示地址"或"模板作者的仓库"：
//   · `twikoo.envId: "https://twikoo.vercel.app"` —— 模板作者的演示后端
//   · `waline.serverURL: "https://waline.vercel.app"` —— 模板作者的演示后端
//   · `artalk.server: "https://artalk.example.com/"` —— 占位域名（example.com）
//   · `giscus.repo: "<模板作者的仓库>"` + `repoId` + `categoryId` —— **模板作者的仓库**：
//     `type: "none"` 时这几个值不生效，但**哪天把 type 切成 `"giscus"`，访客的评论就会
//     发到模板作者的仓库去**（这是本轮真正要拆的雷，不只是"字样好看不好看"）
//   · `disqus.shortname` —— 模板作者的示例值，不再是本站身份
// 现状 `type: "none"`，所以清空**不影响任何已渲染页面**；将来启用某个系统时，
// 必须自己填：**giscus 必须填自己的 repo / repoId / categoryId**（不再回填模板作者的仓库）。
// 保留未动的是"与上游身份无关"的通用值：twikoo/waline 的公共 CDN 地址、waline 的
// 公共 emoji 包、giscus 的 GitHub 默认分类名 `General`（不是上游标识；你的仓库若用
// 别的分类名，改成自己的）。
export const commentConfig: CommentConfig = {
	// 评论系统类型: none, twikoo, waline, giscus, disqus, artalk，默认为none，即不启用评论系统
	type: "none",

	//twikoo评论系统配置
	twikoo: {
		// ⚠️ 上游演示地址已清空（v1.49）；启用 twikoo 前必须填自己的部署地址
		envId: "",
		// 设置 Twikoo 评论系统语言
		lang: "zh-CN",
		// 是否启用文章访问量统计功能
		visitorCount: true,
		// Twikoo JS 文件地址，支持 CDN 链接
		// 中国推荐1: https://registry.npmmirror.com/twikoo/1.7.14/files/dist/twikoo.min.js
		// 中国推荐2: https://s4.zstatic.net/npm/twikoo@1.7.14/dist/twikoo.min.js
		// 国际推荐: https://cdn.jsdelivr.net/npm/twikoo@1.7.14/dist/twikoo.min.js
		jsUrl: "https://cdn.jsdelivr.net/npm/twikoo@1.7.14/dist/twikoo.min.js",
		// Twikoo 自定义 CSS 文件地址，为空则不加载
		cssUrl: "/assets/css/twikoo-custom.css",
	},

	//waline评论系统配置
	waline: {
		// waline 后端服务地址
		// ⚠️ 上游演示地址已清空（v1.49）；启用 waline 前必须填自己的部署地址
		serverURL: "",
		// 设置 Waline 评论系统语言
		lang: "zh-CN",
		// 设置 Waline 评论系统表情地址
		emoji: [
			"https://unpkg.com/@waline/emojis@1.4.0/weibo",
			"https://unpkg.com/@waline/emojis@1.4.0/bilibili",
			"https://unpkg.com/@waline/emojis@1.4.0/bmoji",
		],
		// 评论登录模式。可选值如下：
		//   'enable'   —— 默认，允许访客匿名评论和用第三方 OAuth 登录评论，兼容性最佳。
		//   'force'    —— 强制必须登录后才能评论，适合严格社区，关闭匿名评论。
		//   'disable'  —— 禁止所有登录和 OAuth，仅允许匿名评论（填写昵称/邮箱），适用于极简留言。
		login: "enable",
		// 是否启用文章访问量统计功能
		visitorCount: true,
	},

	// artalk评论系统配置
	artalk: {
		// artalk后端程序 API 地址
		// ⚠️ 上游占位地址（example.com）已清空（v1.49）；启用 artalk 前必须填自己的部署地址
		server: "",
		// 设置 Artalk 语言
		locale: "zh-CN",
		// 是否启用文章访问量统计功能
		visitorCount: true,
	},

	//giscus评论系统配置
	giscus: {
		// 设置 Giscus 评论系统仓库
		// ⚠️ 原值（模板作者自己的仓库）已在 v1.49 清空，发起人 2026-09-29 决定。
		//    切到 `type: "giscus"` 之前**必须填自己的 repo / repoId / categoryId**。
		//    ⚠️ 绝不要填成模板作者的仓库 —— 那会把访客评论发到别人仓库。
		repo: "",
		// 设置 Giscus 评论系统仓库ID
		repoId: "",
		// 设置 Giscus 评论系统分类（GitHub Discussions 的默认分类名，通用值，非上游标识）
		category: "General",
		// 获取 Giscus 评论系统分类ID
		categoryId: "",
		// 获取 Giscus 评论系统映射方式
		mapping: "title",
		// 获取 Giscus 评论系统严格模式
		strict: "0",
		// 获取 Giscus 评论系统反应功能
		reactionsEnabled: "1",
		// 获取 Giscus 评论系统元数据功能
		emitMetadata: "1",
		// 获取 Giscus 评论系统输入位置
		inputPosition: "top",
		// 获取 Giscus 评论系统语言
		lang: "zh-CN",
		// 获取 Giscus 评论系统加载方式
		loading: "lazy",
	},

	//disqus评论系统配置
	disqus: {
		// 获取 Disqus 评论系统
		// ⚠️ 原值（模板作者的示例 shortname）已清空（v1.49）；启用 disqus 前必须填自己的 shortname
		shortname: "",
	},
};
