import type { BackgroundWallpaperConfig } from "@/types/backgroundWallpaper";

export const backgroundWallpaper: BackgroundWallpaperConfig = {
	// 壁纸模式："banner" 横幅壁纸，"fullscreen" 全屏壁纸，"overlay" 覆盖透明，"none" 纯色背景无壁纸
	mode: "banner",
	// 是否启用背景视频播放，配置后将在导航栏显示视频播放按钮
	// ⚠️ IMiss Blog：**保持关闭**——这是模板自带的"导航栏按钮切换的覆盖播放器"
	//    （`BackgroundPlayer.astro` + `src.playerUrl`），与 v1.70 新增的**动态壁纸**
	//    （`video.*`，壁纸本身就是视频、进站即播）是两回事。那套要开着的话，导航栏会多一个
	//    播放按钮、点开是覆盖在壁纸上的播放器 —— 发起人没要这个。
	//    （历史：原来视频还没做，所以关着；现在视频有了，但走的是"常驻壁纸"这条路。）
	playerEnable: false,
	/**
	 * 背景图片配置
	 * 图片路径支持三种格式：
	 * 1. public 目录（以 "/" 开头，不优化）："/assets/images/banner.avif"
	 * 2. src 目录（不以 "/" 开头，自动优化但会增加构建时间，推荐）："assets/images/banner.avif"
	 * 3. 远程 URL："https://example.com/banner.jpg"
	 * 注意：远程URL和public目录的图片不会被优化，请确保图片体积足够小以免影响加载速度
	 *
	 * 建议不要替换d1-d6，m1-m6这些默认示例图片，但你可以删除掉节省空间
	 * 因为以后可能会更换示例图片，导致你自定义的图片被覆盖
	 * 所以建议使用自己的图片的时候命名为其他名称，不要使用d1-d6，m1-m6这些名称
	 *
	 * 如果只使用一张图片或者使用随机图API，推荐直接使用字符串格式：
	 * desktop: "https://t.alcy.cc/pc",   // 随机图API
	 * desktop: "assets/images/banner-my.webp", // 单张图片（自己的图片放 src/assets 下）
	 *
	 * mobile: "https://t.alcy.cc/mp", // 随机图API
	 * mobile: "assets/images/banner-my-mobile.webp", // 单张图片
	 *
	 * 支持配置多张图片（数组），每次刷新页面随机显示一张：
	 * desktop: [
	 * "assets/images/banner-my-1.webp",
	 * "assets/images/banner-my-2.webp",
	 * ],
	 *
	 * mobile:[
	 *   "assets/images/banner-my-m1.webp",
	 *   "assets/images/banner-my-m2.webp",
	 * ],
	 *
	 * ⚠️ IMiss Blog（v1.70）：上面这些是**模板自带说明**（路径格式仍然有效），但本站现在两个数组
	 *    都是空的 —— 壁纸走下面的 `video`（动态壁纸）。要把图片壁纸装回来就填这两个数组、
	 *    并把 `video.enable` 关掉。
	 */
	src: {
		/**
		 * ⚠️ **v1.70（R-BG-06）：静态壁纸图片已全部删除，这里故意是空数组。**
		 * 发起人 2026-10-09 交来 5 个动态壁纸并要求「**动态壁纸替换掉原有的静态图片**，
		 * 删掉图1（动态壁纸替换所有静态图片）」——所以壁纸现在是下面 `video.playlist` 里那套视频，
		 * 原来那 4 张 `assets/images/DesktopWallpaper/imiss-d{1..4}.jpg` 已从仓库删掉。
		 *
		 * 留着这两个空数组是为了**模板契约**：`getBackgroundImages()` 仍然读它们，
		 * 组件在 `video.enable === false` 时会退回静态图片那套分支（把视频关掉、图片填回来即可复原）。
		 * 别把它们删掉、也别往里面放回图片 —— 两套壁纸同时开会互相压。
		 */
		desktop: [],
		// 移动端同样走视频（同一份原画，不另存小图：发起人要求不压缩）
		mobile: [],
		// 背景视频播放地址（模板自带的"导航栏按钮切换的覆盖播放器"，见 playerEnable —— 保持关闭不用）
		// playerUrl: "/assets/videos/imiss-hero.mp4",
	},
	/**
	 * 动态壁纸（R-BG-06 / R-BG-07，v1.70 新增）
	 * ============================================================================
	 * 素材：发起人 2026-10-09 给的 `D:\…\Desktop\视频` 下 5 个 mp4（**全部原画**：
	 *   2944×1248 / 2.36:1 超宽 / 10 秒 / 24~31.4fps / 单文件 8~13.5 MB，合计 **51.34 MB**）。
	 *   这些文件**按字节原样**放在 `public/assets/wallpaper/`：不转码、不重封装、不压缩
	 *   （原话：「**不可压缩我的动态壁纸大小和画质，这是原则，不能动，我要原画**」）。
	 *   字节与 sha256 的核对见 `reports/_wallpaper-import.mjs` 与 `reports/_wallpaper-assets.json`。
	 *
	 * 无限循环（发起人：「**请注意首尾帧以达到无限循环要求**」）：
	 *   实测（`reports/_wp-probe.json`，取首帧与末帧的平均绝对差，并与"1 秒正常运动量"对比）：
	 *     chuangbian 2.66 vs 4.18｜xingye 3.07 vs 2.57｜hupan 5.31 vs 9.34
	 *     ｜xishoutai 3.72 vs 9.62｜taluo 4.94 vs 10.55
	 *   5 个片子的**接缝差都 ≤ 它自己 1 秒的正常运动量**（xingye 那支画面本身极静，绝对量 0.19%
	 *   的像素有差异），所以 `loop` 硬切回第一帧**看不出接缝**，不需要交叉淡化。
	 *
	 * 裁切（发起人：「**能不裁就不裁**；要裁时**人物在展示中心**，手机端**脸必须全露**」
	 *   +「全屏壁纸**展示完整**的动态壁纸」+ 参考 firefly.cuteleaf.cn 的取景框）：
	 *   · 横幅用 `cover`（框比 2.36:1 更方，必然要裁）→ 每项的 `focus` 是**人物锚点**，
	 *     页面里的脚本按**当前框的宽高比**反算 `object-position`，把这个点顶到框中心；
	 *   · 全屏用 `contain`（**一个像素都不裁**，完整展示）→ 2.36:1 的片子在 16:9 屏上
	 *     上下会留白，用同帧的模糊放大版垫底（`letterbox: "blur"`）。
	 *   ⚠️ `focus` 的取值是**实测**来的，不是拍的：`reports/_wp-probe.mjs` 用肤色蒙版 +
	 *      12×6 边缘密度网格定位人物，再逐帧目视核对（`reports/_wp-frames/`）。
	 */
	video: {
		enable: true,
		/**
		 * 有序清单 —— **数组顺序就是展示顺序**（以后加壁纸往这里加一项即可）。
		 * `order: "first"` 时进站放第一项；把想先看的挪到第一位即可换默认壁纸。
		 * ⚠️ 为什么第一个是「窗边少女」：他是从「手机端看不到爱弥斯」那轮开始让我改壁纸的，
		 *    原来那张静态图就是"窗边/床边的粉发少女"，这支配色最接近；而且它最小（8.3 MB），
		 *    首访最快。**这只是我的选择，要换顺序改数组即可**（已在他的汇报里写明）。
		 */
		playlist: [
			{
				src: "/assets/wallpaper/chuangbian.mp4",
				name: "窗边少女",
				poster: "/assets/wallpaper/chuangbian-poster.webp",
				// 实测（网格帧读数）：两眼中心 x=50% / y=26% → 脸中心取 50% / 33%
				focus: { x: 0.5, y: 0.33 },
				focusAnchorY: 0.45,
				// 发起人 2026-10-09 第一次：「第三张左移一点」→ 0.45；
				// 第二次看图后改口：「**第一张人物居中**」→ 回到正中 0.50
				focusAnchorX: 0.5,
			},
			{
				src: "/assets/wallpaper/xingye.mp4",
				name: "星夜少女",
				poster: "/assets/wallpaper/xingye-poster.webp",
				// ⚠️ v1.76：这一支**按发起人要求还原**成他上一轮看过的值（他没让改这支）
				focus: { x: 0.37, y: 0.37 },
				focusAnchorY: 0.45,
			},
			{
				src: "/assets/wallpaper/hupan.mp4",
				name: "湖畔少女",
				poster: "/assets/wallpaper/hupan-poster.webp",
				// ⚠️ v1.76：按发起人要求还原（他只让改窗边少女那一支）
				focus: { x: 0.44, y: 0.39 },
				focusAnchorY: 0.45,
				// 发起人 2026-10-09：「第一张左移一点，再下拉一点」
				//   左移 → 落点 44%；下拉 → 手机端没有垂直余量，靠 zoom 1.15 让下缘被裁、人物下沉
				//   （人物在框里的高度占比 ≈ focus.y × zoom = 0.39 × 1.15 ≈ 45%）
				focusAnchorX: 0.44,
				zoom: 1.15,
			},
			{
				src: "/assets/wallpaper/xishoutai.mp4",
				name: "洗手台少女",
				poster: "/assets/wallpaper/xishoutai-poster.webp",
				// 这一支画面里有两个"人"：镜中的正脸（x≈0.30）与镜前本人的背影（x≈0.62）。
				// 锚点取**镜中那张脸** —— 发起人的硬要求是"手机端脸必须全露"，背影不算脸。
				// ⚠️ v1.76：按发起人要求还原。锚点仍是**镜中那张正脸**（约在画面 30% 处；
				//    实测是 18%，但那支他上一轮已经认可，等他点名再改）
				focus: { x: 0.3, y: 0.34 },
				focusAnchorY: 0.45,
				// 发起人 2026-10-09 第一次：「第二张左移一点点，下拉一点点」→ 0.47 / zoom 1.06；
				// 第二次看图后改成：「**第二张人物偏左**」→ 落点进一步挪到 0.38（镜中那张脸落在画面左三分之一）
				focusAnchorX: 0.38,
				zoom: 1.06,
			},
			{
				src: "/assets/wallpaper/taluo.mp4",
				name: "塔罗占卜",
				poster: "/assets/wallpaper/taluo-poster.webp",
				// ⚠️ v1.76：按发起人要求还原（他没让改这支）
				focus: { x: 0.49, y: 0.3 },
				focusAnchorY: 0.45,
				// 预留示例：以后做"按时间排序"时，这一支可以挂夜间档
				// timeRange: ["18:00", "06:00"],
			},
		],
		// 当前口径：固定第一项（验收可复现）。另外三档是给"以后"留的（见类型注释）
		order: "first",
		// 横幅：裁切 + 人物居中（2.36:1 的片子塞进 3.35:1 / 0.71:1 的框，不裁不可能）
		bannerFit: "cover",
		/**
		 * 全屏：**铺满整屏**（cover，该裁就裁，人物由 focus 顶到中心）。
		 *
		 * ⚠️ v1.71 更正：v1.70 我把它设成 `contain`（"完整展示、一个像素都不裁"——
		 * 那是照发起人「全屏壁纸的话就展示完整的动态壁纸」这句话字面理解的），
		 * 结果手机上 390×844 的竖屏装 2.36:1 的横片，画面只占中间一条、上下两大块垫底，
		 * 发起人截图指出「**全屏不是这个意思，和 firefly 一样**」。
		 * 参照对象 firefly.cuteleaf.cn 的壁纸容器就是 `object-fit: cover`（铺满 + 裁切）。
		 * 所以"完整"按"整块屏幕都归壁纸"理解，而不是"图像一个像素都不裁"。
		 * 要退回 v1.70 那种"完整塞进去"的口径，把这里改成 "contain" 即可（代码路径还在）。
		 */
		fullscreenFit: "cover",
		// 完整展示时上下留白 → 用同一帧的模糊放大版垫底（观感连续，不是黑边）
		letterbox: "blur",
		// 减少动态：只显示海报，不播视频（与桌宠/樱花同一条无障碍口径）
		respectReducedMotion: true,
		// 手动换壁纸（两侧箭头 / 拖动）时的淡入时长
		fadeMs: 260,
	},
	// 横幅壁纸和全屏壁纸共享配置
	common: {
		// 壁纸遮罩暗度，让横幅文字显示更清晰，0-1之间，值越大越暗
		dimOpacity: 0.2,
		// 多视频播放模式："order" 顺序循环，"random" 随机切换（仅当 playerUrl 为数组时生效）
		playerMode: "random",
		// 主页横幅文字
		homeText: {
			// 是否启用主页横幅文字
			enable: true,
			// 主页横幅主标题
			// ⚠️ 占位文案（R-BG-03 / 阻塞项 B-10）：先把模板默认标题换成本站名，
			//    正式文案等发起人确认后再改（改这一行即可）
			title: "IMiss Blog",
			// 主页横幅主标题字体大小
			titleSize: "4.5rem",
			/**
			 * 主页横幅副标题（打字机逐条循环）
			 * ============================================================================
			 * ⚠️ v1.77：**换成发起人 2026-10-09 亲自给的 5 句**（原来那三句是模板占位文案）。
			 * 他的原话：「对这些小字文本进行替换，替换文本为下面这些」。**一字未改**照抄，
			 * 包括「旅途愉快~」的波浪号与「一起去拯救世界吧！」的叹号。
			 * 这同时兑现了 prd 的 R-BG-03（横幅文案）与阻塞项 B-10 里"横幅文案"那一半。
			 * ⚠️ 最长一句 20 字（第 5 句），手机上会折成两行；要改口径先看 §6.5 的手机端自检。
			 */
			subtitle: [
				"但愿我会让你感到骄傲，但愿我没有让你失望",
				"旅途愉快~",
				"我会一直在你所走的路上，和你共同前行",
				"一起去拯救世界吧！",
				"希望现在的我，已经成长到能和你并肩而行了",
			],
			// 主页横幅副标题字体大小
			subtitleSize: "1.5rem",
			typewriter: {
				// 是否启用打字机效果
				// 打字机开启 → 循环显示所有副标题
				// 打字机关闭 → 每次刷新随机显示一条副标题
				enable: true,
				// 打字速度（毫秒）
				speed: 100,
				// 删除速度（毫秒）
				deleteSpeed: 50,
				// 完全显示后的暂停时间（毫秒）
				// ⚠️ v1.82：2000 → 4000 → **8000**（**翻了两次**）。
				//   第一次：发起人看着第 5 句「希望现在的我，已经成长到能和你并肩而行了」的横幅截图说
				//   「这个小字文本替换时间长一点点，**等待时长翻倍**把」→ 2000 → 4000；
				//   第二次：「**停顿时间再翻一倍吧**」→ 4000 → 8000。
				//   **只翻这一项**：打字速度 `speed` 与删除速度 `deleteSpeed` 一个字没动 ——
				//   他要的是"停留更久"，不是"打得更慢"。
				//   每句"打完 → 停留 8s → 删掉" ≈ 11s，整轮 5 句 ≈ 55s（改前 ≈25s）。
				//   实测见 `reports/_subtitle-selfcheck.mjs`（采样窗口已拉到 30 秒）。
				pauseTime: 8000,
			},
			// 是否显示标题下方的链接图标
			// IMiss Blog（R-ID-06）：整行关掉——发起人不需要订阅功能，也不想要这行图标
			linksEnable: false,
			// 首页横幅标题下方的链接图标（可选，支持 showName 显示文字）
			// 图标支持 Iconify 格式：fa7-brands:github、fa7-solid:envelope、mdi:rss 等
			//
			// ⚠️ IMiss Blog：这里原来有 4 条，全是模板作者的信息，已按 R-NAV-06 / R-ID-05 清理——
			//    · "GitHub"→ 模板作者的仓库链接
			//    · "Email" → `mailto:` 模板作者的邮箱（会被 rehype-email-protection 写成
			//      base64 的 data-encoded-email 挂到**每一个页面**上）
			//    · "Sponsor" → 模板作者站点上的 **打赏入口**（R-NAV-06 要求彻底移除）
			//    清理后只留了 RSS / Atom，但 R-ID-06 又要求把订阅也去掉，所以现在是空数组 + linksEnable: false。
			//    将来要加自己的链接（B-02 / B-10）：往数组里加，并把 linksEnable 改回 true。
			links: [],
		},
		// 壁纸轮播配置，横幅壁纸和全屏壁纸共享，仅在配置多张图片时生效
		carousel: {
			// 是否启用壁纸轮播；关闭时保持每次刷新随机显示一张
			enable: false,
			// 轮播切换间隔（毫秒）
			interval: 5000,
			// 过渡效果: 'fade' 渐变 | 'zoom' 缩放 | 'slide' 滑动 | 'kenburns' 旋转木马
			transitionEffect: "zoom",
		},
		// 水波纹动画效果配置，开启会影响页面性能，增加内存占用，请根据自己的喜好开启
		waves: {
			enable: {
				// 桌面端是否启用水波纹动画效果
				desktop: true,
				// 移动端是否启用水波纹动画效果
				mobile: true,
			},
		},
		// 渐变过渡效果配置，当水波纹关闭时自动启用，提供壁纸底部到背景色的平滑过渡
		gradient: {
			enable: {
				// 桌面端是否启用渐变过渡
				desktop: true,
				// 移动端是否启用渐变过渡
				mobile: true,
			},
			// 渐变高度
			height: "10%",
		},
	},
	// Banner模式特有配置
	banner: {
		// 图片位置
		// 支持所有CSS object-position值，如: 'top', 'center', 'bottom', 'left top', 'right bottom', '25% 75%', '10px 20px'..
		// 如果不知道怎么配置百分百之类的配置，推荐直接使用：'center'居中，'top'顶部居中，'bottom' 底部居中，'left'左侧居中，'right'右侧居中
		// IMiss Blog（R-BG-01）：原来写的是 "0% 20%" —— x=0% 表示"裁的时候只从右边切"，
		// 在宽屏上会把画面挤到左边、右边切掉一大块。改成 50%（水平居中）不受裁切方向影响；
		// 纵向 35% 略偏上，保住人物面部（原图人物在上半部）。
		position: "50% 35%",
		// 文章横幅信息："description" 显示描述，"meta" 显示日期、字数和阅读时长
		postInfo: {
			mode: "description",
		},
		// 导航栏配置
		navbar: {
			// 导航栏透明模式："semi" 半透明，"semifull" 动态透明，"none" 纯色不透明
			transparentMode: "semi",
			// 毛玻璃模糊度，0 即关闭导航栏的毛玻璃
			// 注意：导航栏子菜单与浮动面板始终保留毛玻璃，模糊度跟随此项但有最小值
			blur: 12,
		},
		// 手动换壁纸（R-BG-05，本站新增）
		//   · 桌面端：左右两侧各一个**隐藏**交互区（平时看不见，鼠标移上去 / Tab 聚焦才淡出箭头）
		//   · 鼠标与触屏都可以按住横向拖动换图（同一套 pointer 手势，阈值见 dragThreshold）
		//   · 手机端不显示两侧交互区（横幅在手机上很矮，点按区域容易误触），只用手势
		// 关掉 enable 即完全回到模板原有行为（那时换图只受「壁纸轮播」开关控制）
		manualSwitch: {
			enable: true,
			zones: true,
			drag: true,
			dragThreshold: 60,
		},
	},
	// 覆盖透明覆盖模式特有配置
	overlay: {
		// 层级，确保壁纸在背景层
		zIndex: -1,
		// 壁纸透明度
		opacity: 0.8,
		// 背景模糊度
		blur: 10,
		// 卡片透明度，0-1之间，值越小越透明
		cardOpacity: 0.6,
	},
	// 全屏壁纸模式特有配置
	// 壁纸模糊度(blur)、卡片透明度(cardOpacity)、层级(zIndex) 复用上方 overlay 模式的配置；
	// 背景透明度(opacity)不适用（全屏壁纸不透明）；导航栏透明模式由 fullscreen.navbar.transparentMode 控制，脱离 banner 的 navbar 配置
	fullscreen: {
		// 布局模式："classic" 经典文档流全屏壁纸，"hero" 固定全屏首屏壁纸
		layout: "classic",
		// 图片位置
		position: "center",
		// 全屏壁纸模式的导航栏配置
		navbar: {
			// 导航栏透明模式："semi" 半透明，"semifull" 动态透明（仅首页顶部透明、下滑玻璃化；非首页均跟卡片半透明）
			transparentMode: "semifull",
			// 导航栏毛玻璃模糊度，0 即关闭（玻璃态生效）
			blur: 12,
		},
		// 首页下滑时壁纸模糊渐变开关（从 0 渐变为 overlay.blur 的最大模糊）
		// 关闭后该设备上全屏壁纸保持清晰（首页与非首页都不模糊），设置面板的模糊度滑块也会隐藏
		blurRamp: {
			enable: {
				// 桌面端是否启用模糊渐变
				desktop: true,
				// 移动端是否启用模糊渐变
				mobile: true,
			},
		},
	},
};
