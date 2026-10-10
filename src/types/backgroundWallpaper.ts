export type FullscreenWallpaperLayout = "classic" | "hero";

/**
 * 动态壁纸清单里的一项（R-BG-06 / R-BG-07，v1.70 新增）
 * ============================================================================
 * 发起人 2026-10-09 交来 5 个动态壁纸并要求「**动态壁纸替换所有静态图片**」，
 * 同时明确「之后可能还会添加额外的动态壁纸，和进行**背景时间的壁纸展示顺序排序**，
 * 这个你要心中有数，给后续留有开发空间」——所以这里从一开始就是**清单**，
 * 加壁纸 = 往 `playlist` 里加一项。
 * ⚠️ **v1.105：那句"给后续留空间"兑现了** —— 他 2026-10-10 真的加了第 6 支（`qichuang`）、
 *    换了 1 支（`xingye`），并把六个时段排了出来 → `timeRange` 从"预留不消费"变成**真消费**
 *    （匹配逻辑在 `WallpaperSection.astro` 的 `pickFirst()`，口径见 `order` 的注释）。
 */
export type WallpaperVideoItem = {
	/** `public/` 下的视频路径（**原画**：不转码、不压缩、不裁剪，字节原样） */
	src: string;
	/** 人话名字（只用于文档、调试与 `aria-label`，不上屏） */
	name: string;
	/** 首帧海报（派生资源）：首屏秒出、`prefers-reduced-motion` 下静止显示、全屏留白垫底 */
	poster: string;
	/**
	 * 人物锚点（归一化 0~1）：**裁切时这个点要落在展示框中心**（R-BG-07）。
	 * 取值来自实测——`reports/_wp-seam-v1105.json`（肤色蒙版 + 边缘密度 + 逐帧目视）。
	 * ⚠️ 这不是"原图 object-position"，而是"谁必须在画面里"：脚本按当前框的
	 * 宽高比反算 `object-position`，框变了自己会跟着变（手机端横向裁得最狠）。
	 */
	focus: { x: number; y: number };
	/** 纵向落点（0~1，默认 0.45）：人物锚点落在框高的百分之几处；<0.5 = 脸略高于中心 */
	focusAnchorY?: number;
	/**
	 * 水平落点（0~1，默认 0.5 = 正中）。
	 * 为什么要有它：手机端横幅是竖框（0.71:1）装 2.36:1 的横片，**只横向裁**，
	 * 所以"人物在画面里偏左一点"只能靠这个值调（发起人 2026-10-09 的三条微调里两条都是它）。
	 */
	focusAnchorX?: number;
	/**
	 * 放大系数（默认 1）。
	 * 手机端整幅高度本来就全可见（高度是约束），**垂直方向没有可平移的余量** ——
	 * 想让人物在框里**下沉**只能放大：放大后下缘被裁，人物在框里占的高度 ≈ focus.y × zoom。
	 * 代价是可见宽度同比例变窄（更紧的人像裁切），所以它是个"几个百分点"量级的旋钮。
	 */
	zoom?: number;
	/**
	 * 这一支负责的时段，`["HH:MM", "HH:MM"]`（v1.105 起**真消费**，`order: "time"` 时生效）。
	 * 口径（三条都要记住，`scripts/verify-ui.mjs` 的 R-BG-06 逐条钉住）：
	 *   ① **左闭右开** `[start, end)` —— 边界整点归**后者**（`["03:00","07:00"]` 吃下 03:00 整）；
	 *   ② **`start > end` 表示跨零点**（`["23:00","03:00"]` = 23 点起到次日 3 点止）；
	 *   ③ 时刻一律按**北京时间（UTC+8）**解释，与访客本机时区无关。
	 * 六档必须**无缝铺满 24 小时**（不重不漏），否则会有"没有任何一支命中"的空洞。
	 */
	timeRange?: [string, string];
};

export type BackgroundWallpaperConfig = {
	mode: "banner" | "fullscreen" | "overlay" | "none"; // 壁纸模式：banner横幅模式、fullscreen全屏壁纸、overlay全屏透明覆盖模式或none纯色背景
	playerEnable?: boolean; // 是否启用背景视频播放，默认false
	/**
	 * 动态壁纸（R-BG-06，v1.70 新增）：**壁纸本身就是视频**，不是"按按钮才播的叠加层"。
	 * 与模板自带的 `src.playerUrl` + `playerEnable`（那套是"导航栏按钮切换的覆盖播放器"）
	 * 是**两件事**：那套保持关闭，不再使用；这里是常驻壁纸。
	 */
	video?: WallpaperVideoConfig;
	src:
		| string
		| string[]
		| {
				desktop?: string | string[];
				mobile?: string | string[];
				playerUrl?: string | string[]; // 背景视频播放地址，支持单个视频路径或数组（多视频列表循环）
		  }; // 支持单个图片、图片数组或分别设置桌面端和移动端图片
	// 横幅壁纸和全屏壁纸共享配置
	common?: {
		dimOpacity?: number; // 横幅文字遮罩暗度，0-1之间，值越大越暗，默认0.15
		playerMode?: "order" | "random"; // 多视频播放模式："order" 顺序循环（默认），"random" 随机切换
		homeText?: {
			enable: boolean; // 是否在首页显示自定义文字（全局开关）
			title?: string; // 主标题
			subtitle?: string | string[]; // 副标题，支持单个字符串或字符串数组
			titleSize?: string; // 主标题字体大小，如 "3.5rem"
			subtitleSize?: string; // 副标题字体大小，如 "1.5rem"
			typewriter?: {
				enable: boolean; // 是否启用打字机效果
				speed: number; // 打字速度（毫秒）
				deleteSpeed: number; // 删除速度（毫秒）
				pauseTime: number; // 完整显示后的暂停时间（毫秒）
			};
			// 首页横幅标题下方的链接图标（可选）
			linksEnable?: boolean; // 是否显示标题下方的链接图标（默认 true）
			links?: {
				name: string; // 名称（用于 aria-label / title / 可选 showName 显示）
				url: string; // 链接地址
				icon: string; // Iconify 图标，如 "fa7-brands:github"
				showName?: boolean; // 是否显示文字（默认 false）
			}[];
		};
		// 壁纸轮播配置，横幅壁纸和全屏壁纸共享
		carousel?: {
			enable: boolean; // 是否启用壁纸轮播
			interval?: number; // 轮播间隔时间，单位毫秒
			transitionEffect?: "fade" | "zoom" | "slide" | "kenburns"; // 过渡效果: 'fade' 渐变 | 'zoom' 缩放 | 'slide' 滑动 | 'kenburns' 旋转木马
		};
		// 水波纹动画效果配置，横幅壁纸和全屏壁纸共享，开启会影响页面性能
		waves?: {
			enable:
				| boolean
				| {
						desktop: boolean; // 桌面端是否启用水波纹动画效果
						mobile: boolean; // 移动端是否启用水波纹动画效果
				  }; // 是否启用水波纹动画效果，支持布尔值或分别设置桌面端和移动端
		};
		// 渐变过渡效果配置，当水波纹关闭时自动启用，提供壁纸底部到背景色的平滑过渡
		gradient?: {
			enable:
				| boolean
				| {
						desktop: boolean; // 桌面端是否启用渐变过渡
						mobile: boolean; // 移动端是否启用渐变过渡
				  }; // 是否启用渐变过渡，支持布尔值或分别设置桌面端和移动端，默认true（水波纹关闭时自动生效）
			height?: string; // 渐变高度，默认 "30vh"
		};
	};

	// Banner模式特有配置
	banner?: {
		position?:
			| "top"
			| "center"
			| "bottom"
			| "top left"
			| "top center"
			| "top right"
			| "center left"
			| "center center"
			| "center right"
			| "bottom left"
			| "bottom center"
			| "bottom right"
			| "left top"
			| "left center"
			| "left bottom"
			| "right top"
			| "right center"
			| "right bottom"
			| string; // 壁纸位置，支持CSS object-position的所有值，包括百分比和像素值
		// 文章横幅信息："description" 显示描述，"meta" 显示日期、字数和阅读时长
		postInfo?: {
			mode: "description" | "meta";
		};
		navbar?: {
			transparentMode?: "semi" | "semifull" | "none"; // 导航栏透明模式："semi" 半透明，"semifull" 动态透明，"none" 纯色不透明
			blur?: number; // 毛玻璃模糊度，0 即关闭导航栏毛玻璃
		};
		// 手动换壁纸（R-BG-05，本站新增）：桌面两侧隐藏交互区 + 按住横向拖动换图
		manualSwitch?: {
			enable?: boolean; // 总开关；false 时回到模板原有行为（换图仍然只受轮播开关控制）
			zones?: boolean; // 桌面端（≥1024px）左右两侧的隐藏交互区，hover / Tab 聚焦才淡出箭头
			drag?: boolean; // 按住横向拖动换图（鼠标与触屏共用一套 pointer 手势）
			dragThreshold?: number; // 拖动多远算一次换图（px），默认 60
			/**
			 * 点击换图（v1.74 新增）：在**壁纸空白处**点一下切到下一张。
			 * ⚠️ 只在 fullscreen / overlay 两种模式下生效 —— banner 模式已经有两侧箭头，
			 * 再让"点横幅就换图"抢一次点击容易误触。
			 */
			click?: boolean;
		};
	};
	// 全屏透明覆盖模式特有配置
	overlay?: {
		zIndex?: number; // 层级，确保壁纸在合适的层级显示
		opacity?: number; // 壁纸透明度，0-1之间
		blur?: number; // 背景模糊程度，单位px
		cardOpacity?: number; // 卡片背景透明度，0-1之间
	};
	// 全屏壁纸模式特有配置
	fullscreen?: {
		layout?: FullscreenWallpaperLayout; // 全屏布局：classic 文档流模式，hero 固定全屏首屏模式
		position?: string; // 壁纸位置，支持CSS object-position的所有值
		// 全屏壁纸模式的导航栏配置（仅有半透明/动态透明两种）
		navbar?: {
			transparentMode?: "semi" | "semifull"; // 导航栏透明模式："semi" 半透明，"semifull" 动态透明（仅首页顶部透明）
			blur?: number; // 导航栏毛玻璃模糊度，0 即关闭（玻璃态生效）
		};
		// 首页下滑时壁纸模糊渐变开关（从 0 渐变为 overlay.blur 的最大模糊）
		blurRamp?: {
			enable:
				| boolean
				| {
						desktop: boolean; // 桌面端是否启用模糊渐变
						mobile: boolean; // 移动端是否启用模糊渐变
				  }; // 是否启用模糊渐变，支持布尔值或分别设置桌面端和移动端，默认 true
		};
	};
};

/**
 * 动态壁纸的播放/裁切口径（R-BG-06 / R-BG-07，v1.70 新增）
 * ============================================================================
 * 发起人的三条硬要求逐条落在这里：
 *   ① 「不可压缩我的动态壁纸大小和画质……我要原画」→ 视频文件**字节原样**放 `public/`，
 *      这里只记路径，构建链路上不做任何转码/压缩（`reports/_wallpaper-import-v1105.mjs` 有哈希核对）。
 *   ② 「动态壁纸请注意首尾帧以达到无限循环要求」→ `loop` + 实测首尾帧差（见 `reports/_wp-seam-v1105.json`：
 *      6 个片子的接缝差都过判据「≤ 自己 1 秒的正常运动量 + 1.5」，硬切循环看不出来）。
 *   ③ 「能不裁就不裁；要裁时人物在展示中心，手机端脸必须全露」→ `bannerFit` / `fullscreenFit`
 *      + 每项的 `focus`：脚本按当前框宽高比反算 `object-position`，把人物锚点顶到框中心。
 */
export type WallpaperVideoConfig = {
	/** 总开关：false 时整块回到静态图片那套（`src.desktop/mobile`） */
	enable: boolean;
	/** 有序清单：**数组顺序就是手动翻页顺序**（以后加壁纸往这里加） */
	playlist: WallpaperVideoItem[];
	/**
	 * 这次进站放哪一个：
	 *   · `"first"`    固定第一项
	 *   · `"random"`   随机一项
	 *   · `"sequence"` 按天轮换（`天序号 % playlist.length`）
	 *   · `"time"`     按每项的 `timeRange` 匹配**当前北京时间**落在哪一档（**v1.105 起是当前口径**）。
	 *                  匹配口径：左闭右开 + `start > end` 视为跨零点；判定在**客户端**做
	 *                  （访客进站那一刻的北京时间；静态站没有服务端，构建期注入只能定"构建时"那一刻）。
	 *                  没有任何一项命中时兜底回第一项（正常配置下不该发生 —— 六档铺满 24 小时）。
	 */
	order: "first" | "random" | "sequence" | "time";
	/** 横幅（banner）模式的填充方式：`cover` 裁切（人物居中）| `contain` 完整不裁 */
	bannerFit: "cover" | "contain";
	/** 全屏（fullscreen）模式的填充方式：默认 `contain` —— 发起人「全屏壁纸展示完整的动态壁纸」 */
	fullscreenFit: "cover" | "contain";
	/** `contain` 时留白怎么垫：`blur` = 同一帧的模糊放大版（观感连续）| `solid` = 纯色底 */
	letterbox: "blur" | "solid";
	/**
	 * `prefers-reduced-motion: reduce` 时是否**不播**（只显示 `poster`）。
	 * 与桌宠/樱花同一条无障碍口径：减少动态的用户拿到静止画面。
	 */
	respectReducedMotion: boolean;
	/** 换壁纸时的淡入时长（毫秒），0 = 直接切 */
	fadeMs: number;
};
