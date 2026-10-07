import type { MusicPlayerConfig } from "../types/musicConfig";

// 音乐播放器配置
//
// ── v1.63（2026-10-07）：播放器恢复上线 + 发起人的第一首歌 ────────────────────
// 组件与接线**一直都在**（`MusicManager.astro` / `MusicPlayer.astro` / `MusicPlayerView.astro`，
// `Layout.astro` 仍在渲染 `<MusicManager />`）；v1.47 / v1.48 做的只是
// **删掉上游示例曲 + 清空歌单 + 关掉下面两个入口开关**（各处的历史注释原样保留在下面）。
// 本轮把发起人自己的曲子放回来，两个入口一并打开。
//
// 曲目来源（《别难过》— JEReka）与它的**硬要求**：
//   · 源文件 `D:\HuaweiMoveData\Users\HUAWEI\Desktop\音乐\JEReka - 别难过.mp3`
//     → **原样字节复制**成 `public/assets/music/JEReka - 别难过.mp3`（保留原文件名）。
//     9,599,149 字节（9.15 MiB），sha256 `4d1af1c0be3f94ab1e57f8b95be26601ed57367f1b51638a63bd7e55308ef547`，
//     与源文件**逐字节相同**（复制后核对过字节数 + sha256 + Buffer.equals）。
//   · 封面是从**该 mp3 自己的 ID3v2.3 `APIC` 帧**里原样抽出来的 `image/jpeg`
//     （141,956 字节）→ `public/assets/music/cover/JEReka-bie-nanguo.jpg`。
//     没有转码、没有缩放、没有重画；抽出来什么样就是什么样。
//   · ⛔ **不许转码**（发起人 2026-10-07 的硬要求，也是本文件里最该被遵守的一条）：
//     不重采样、不改码率、不改格式、不"顺手压一下"、不跑 ffmpeg。
//     将来要换歌就**换源文件本身**（或者先征得他同意再谈转码），**不要**在仓库里偷偷压一遍。
//   · 他的 ID3 标签编码是乱的（专辑/标题是 GBK、艺术家是 UTF-16 无 BOM，直接读会乱码），
//     所以下面的 `name` / `artist` **按文件名取**，不从标签里读。
//   · 这一首**没有歌词文件**（源目录里没有 `.lrc`，已确认）→ `lrc: ""`，
//     歌词抽屉点了会走 `fm:lyrics` 的 `none` 分支，显示 i18n 的「暂无歌词」，不是报错。
//
// ⚠️ 体积影响（照实写，不粉饰）：
//   · `public/` 里这一份**是要提交进仓库的**（`dist/` 本身 gitignore，但 `public/` 不是），
//     所以仓库**永久大了约 9.15 MB**（在此之前音乐目录是 0 字节）。这是本轮唯一一处
//     "体积换功能"的取舍，发起人知情（"别压缩音质"是他自己提的）。
//   · 首屏：`MusicManager` 建的 `<audio>` 是 `preload='none'` 且 `autoplay` 从来没有过，
//     所以**首屏不会下载这 9.15 MB**（不会自动播、也不会预加载）；只有用户真的点了
//     播放按钮 / 某条曲目，`loadTrack()` 才会把 `audio.src` 指过去、开始拉整首歌。
//   · 但**点播放那一刻**要吃掉 9.15 MB 的下载量：弱网下会有可感延迟（进度条与时长要等
//     `loadedmetadata`），移动流量用户点一下就是 9 MB。静态托管（Vercel / CF Workers）
//     一般会带 `Content-Length` 与 gzip/brotli 跳过 mp3（已压缩格式），**不会**有服务端转码。
//   · 若将来嫌大：正确做法是**换一个更小的源文件**（或按上面那条要求先谈），
//     ⛔ 不是在本仓库里偷偷压一遍。
export const musicPlayerConfig: MusicPlayerConfig = {
	// 是否在导航栏显示音乐播放器入口
	// P4-8（v1.47）：原本为 true。本地歌单唯一一首是上游示例曲（《崩坏：星穹铁道》的
	// 「使一颗心免于哀伤-哼唱」，与本站《鸣潮》爱弥斯主题不符），已按发起人决定删除，
	// 歌单随之清空。歌单为空时若仍开启入口，导航栏/侧栏会留一个点开没内容的空播放器
	// （可见回归），故两个入口一并关闭。发起人加回自己的歌之后再打开。
	// → v1.63：**改回 true** —— 发起人的《别难过》已就位（歌单 1 条），
	//   v1.47 关闭它的前提（"点开没内容的空播放器"）已经不存在了。
	//   （渲染事实由 `scripts/verify-ui.mjs` 的 R-ID-06 两格钉住：导航按钮 + 导航面板里的 widget。）
	showInNavbar: true,

	// 是否在侧边栏显示音乐播放器组件
	// P4-8（v1.47）：原本为 true，与上面同一个理由（空歌单）一并关闭。
	// → v1.63：**改回 true**（发起人 2026-10-07 选"两个都开"）。
	//   侧栏那一格由 `src/config/sidebarConfig.ts` 的 `leftComponents` 里 `type: "music"`
	//   （`position: "top"`，enable 一直是 true）决定位置，本开关只决定渲不渲染。
	showInSidebar: true,

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
		// → v1.63 **不动这一项**：仍然是 ""，本轮恢复的是 `local` 模式下的本地曲目，
		//   与 meting 无关（所以"上游歌单 ID 已清空"那条断言继续有效、继续钉着）。
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
		// → v1.63：按上面那句话做了 —— 歌单 1 条，`url`/`cover` 指向本轮落地的两个文件
		//   （mp3 原样字节复制、封面从它的 APIC 帧原样抽出，**都没有转码**）。
		// ⚠️ `lrc` 必须留成空串（这一首没有歌词文件）；填一个不存在的路径会让用户在歌词抽屉里
		//    看到一次 404 + 「歌词加载失败」，比"暂无歌词"更糟。
		playlist: [
			{
				name: "别难过",
				artist: "JEReka",
				url: "/assets/music/JEReka - 别难过.mp3",
				cover: "/assets/music/cover/JEReka-bie-nanguo.jpg",
				lrc: "",
			},
		],
	},
};
