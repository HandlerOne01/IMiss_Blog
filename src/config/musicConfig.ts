import type { MusicPlayerConfig } from "../types/musicConfig";

// 音乐播放器配置
export const musicPlayerConfig: MusicPlayerConfig = {
	// 是否在导航栏显示音乐播放器入口
	// P4-8（v1.47）：原本为 true。本地歌单唯一一首是上游示例曲（《崩坏：星穹铁道》的
	// 「使一颗心免于哀伤-哼唱」，与本站《鸣潮》爱弥斯主题不符），已按发起人决定删除，
	// 歌单随之清空。歌单为空时若仍开启入口，导航栏/侧栏会留一个点开没内容的空播放器
	// （可见回归），故两个入口一并关闭。发起人加回自己的歌之后再打开。
	showInNavbar: false,

	// 是否在侧边栏显示音乐播放器组件
	showInSidebar: false,

	// 使用方式："meting" 使用 Meting API，"local" 使用本地音乐列表
	mode: "local",

	// 默认音量 (0-1)
	volume: 0.7,

	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
	playMode: "list",

	// 是否显启用歌词
	showLyrics: false,

	// Meting API 配置
	meting: {
		// Meting API 地址
		// 默认使用官方 API，也可以使用自定义 API
		api: "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
		// 音乐平台：netease=网易云音乐, tencent=QQ音乐, kugou=酷狗音乐, xiami=虾米音乐, baidu=百度音乐
		server: "netease",
		// 类型：song=单曲, playlist=歌单, album=专辑, search=搜索, artist=艺术家
		type: "playlist",
		// 歌单/专辑/单曲 ID 或搜索关键词
		// P4-8 收尾轮（v1.48）：原来是上游示例歌单 ID `10046455237`（发起人 2026-09-29 确认
		// 不是自己的），已清空。**本机模式是 `local`（见上面 `mode`），这一项只在把 `mode`
		// 切成 `meting` 时才生效** —— 留空是发起人 2026-09-29 的决定；将来要用 meting 模式，
		// 先把这里填成自己的歌单/单曲 ID。
		id: "",
		// 认证 token（可选）
		auth: "",
		// 备用 API 配置（当主 API 失败时使用）
		fallbackApis: [
			"https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
		],
	},

	// 本地音乐配置（当 mode 为 'local' 时使用）
	// 1. 支持传入歌词文件的路径
	// lrc: "/assets/music/lrc/使一颗心免于哀伤-哼唱.lrc",
	// 2. 或者直接填入歌词字符串内容
	// lrc: "[00:00.00]歌词内容...",
	local: {
		// P4-8（v1.47）：上游示例曲「使一颗心免于哀伤-哼唱.mp3」（《崩坏：星穹铁道》，知更鸟 /
		// HOYO-MiX / Chevy）与其封面 `cover/109951169585655912.webp` 已随 public/assets/music/ 一并删除，
		// 歌单清空。加回自己的歌时把 url/cover 指到 public/assets/music/ 下的新文件再打开上面两个开关。
		playlist: [],
	},
};
