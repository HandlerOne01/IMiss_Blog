import type { PetConfig } from "@/types/petConfig";

/**
 * 桌宠「爱弥斯」配置（R-PET-01 ~ R-PET-05）
 * ============================================================================
 * 素材：`src/assets/images/pet/pet-aemeath.webp`
 *   Codex 自定义宠物图集（MIT，来源 https://github.com/cuNuo/aemeath-mini-codex-pet），
 *   8 列 × 9 行、单格 144×156（原图 1536×1872 等比缩到 0.75）。
 *   九行 = 九个状态，行→状态映射写在 `AemeathPet.astro` 的 STATES 表里。
 *
 * ⚠️ 与看板娘互斥（R-PET-04）：**同一时间只允许一个角色组件**。
 *    `pioConfig.ts` 里的 `live2dWidgetConfig.enable` 与 `spineModelConfig.enable`
 *    必须保持 false；将来真要开看板娘，先把这里的 `enable` 关掉。
 *
 * ⚠️ 与樱花特效互不依赖（R-PET-03）：两者各有各的开关，关掉樱花不影响桌宠。
 *
 * 改文案只改这个文件；改行为改 `src/components/features/AemeathPet.astro`
 * （DOM + 样式在 `src/styles/pet.css`）。
 * ============================================================================
 */
export const petConfig: PetConfig = {
	// 总开关：关掉后页面里不会渲染宠物节点（连脚本都不执行）
	enable: true,
	// 移动端隐藏：屏幕小、手指拖拽容易和滚动打架，默认隐藏
	hideOnMobile: true,
	mobileBreakpoint: 768,
	// 精灵缩放：1 = 单格 144×156 原始像素；0.86 在桌面上约 124×134
	scale: 0.86,
	// 首次出场靠哪边（还没存过位置时生效）
	startSide: "right",
	// 层级：低于模板的浮动控件（返回顶部等），避免挡住按钮（R-PET-05）
	zIndex: 66,
	// 45 秒没动静就进入「屏幕待机」（waiting：电子幽灵待机画面）
	idleSecondsToSleep: 45,
	greeting: "我是爱弥斯，住在这页纸的角落。",
	lines: [
		"欢迎回来，要看看最近写的东西吗？",
		"「先把东西做出来，再谈优雅。」",
		"搜文章的话，右上角那个放大镜就够用。",
		"写不动的时候，就起来走两步。",
		"这篇我改到第四遍才敢发出来……",
		"深夜的键盘声，听起来像下雨。",
		"你已经待了一会儿了，谢谢你。",
		"别熬了，那个 1px 的偏移明天再调。",
		"拖着我走也可以，我不晕。",
		"光标停在哪，我就看向哪。",
		"排行榜那三张榜，我可是很认真排的。",
	],
	// 没有后端时的本地兜底回复（R-AGT-03）：P5 接上 Agent 后这些只在断连时用
	mockReplies: [
		"我还没连上大脑（Agent 服务还没起），先陪你聊两句吧。",
		"这个问题等我的后端上线了再认真回答你——现在只能说：我在听。",
		"（挠头）我现在的记忆只有这个页面，等我连上博客的检索能力再答你。",
	],
	agent: {
		// ⚠️ P3 阶段保持 false：不发任何请求，走 mockReplies
		enable: false,
		// 空字符串 = 同源（最终由 Nginx 把 /api/ 反代到 Python 网关，见 ARCH.md §12.2）
		apiBase: "",
		timeoutMs: 60000,
		maxLength: 500,
	},
};
