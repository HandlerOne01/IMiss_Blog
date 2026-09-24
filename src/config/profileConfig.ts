import type { ProfileConfig } from "../types/profileConfig";

export const profileConfig: ProfileConfig = {
	// 头像
	// 图片路径支持三种格式：
	// 1. public 目录（以 "/" 开头，不优化）："/assets/images/avatar.webp"
	// 2. src 目录（不以 "/" 开头，自动优化但会增加构建时间，推荐）："assets/images/avatar.webp"
	// 3. 远程 URL："https://example.com/avatar.jpg"
	// IMiss Blog：暂用临时 Logo（爱弥斯像素头像，square）当头像，正式头像见阻塞项 B-02
	avatar: "assets/images/logo/imiss-light.webp",

	// 名字
	// ⚠️ 占位值：真实作者名待发起人提供（阻塞项 B-02）。
	// 这里会出现在侧边栏资料卡与页脚版权（"© 年份 <name>. All Rights Reserved."）
	name: "IMiss",

	// 个人签名
	// ⚠️ 占位文案，待发起人确认
	bio: "技术笔记、番剧排行，和一只会聊天的爱弥斯。",

	// 链接配置
	// 已经预装的图标集：fa7-brands，fa7-regular，fa7-solid，material-symbols，simple-icons
	// 访问https://icones.js.org/ 获取图标代码，
	// 如果想使用尚未包含相应的图标集，则需要安装它
	// `pnpm add @iconify-json/<icon-set-name>`
	// showName: true 时显示图标和名称，false 时只显示图标
	// IMiss Blog：上游示例里的 GitHub（CuteLeaf）与邮箱（xiaye@msn.com）已删除——
	// 那是主题作者的信息，不是本站的。要加哪些社交链接等发起人提供（阻塞项 B-02），
	// 现在只保留本站真实可用的订阅入口。
	links: [
		{
			name: "RSS",
			icon: "fa7-solid:rss",
			url: "/rss/",
			showName: false,
		},
		{
			name: "Atom",
			icon: "fa7-solid:atom",
			url: "/atom/",
			showName: false,
		},
	],
};
