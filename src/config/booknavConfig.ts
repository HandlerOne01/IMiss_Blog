import type { BooknavGroup, BooknavPageConfig } from "../types/booknavConfig";

// 书签导航页面配置
export const booknavPageConfig: BooknavPageConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "",

	// 页面描述文本，如果留空则使用 i18n 中的翻译
	description: "",

	// favicon 自动获取配置
	// ── v1.57（B-10 实施轮）：**已关闭**，判据是实测不是口味 ────────────────────
	// 38 张卡里只有 20 张写了手填 icon（iconify 品牌图标，构建期就打包进产物），
	// 剩下 18 张走这里。开着时 `resolveBooknavIcon()` 会给每一张无 icon 的卡生成
	// `https://a.favicon.im/<域名>` —— 那是**第三方**接口，意味着访客打开这一页就会把
	// **18 个域名**（硅基流动 / 智谱 / 火山方舟 / 腾讯位置服务 / 米醋 API / PriceAI …）
	// 交给 favicon.im，等于把发起人的常用站点清单送出去；关掉之后这 18 张退化成
	// 主题自带的**首字母块**（`.booknav-letter`，主题主色 + 12% 主色底），实测结论见下。
	// 实测（`reports/_bn-favicon-off.png` / `_bn-favicon-on.png`，DOM 断言见
	// `scripts/verify-ui.mjs` 的 R-BOOKNAV-03）：关掉后 38 格图标全部有内容
	// （20 个 svg + 18 个首字母块，`<img>` 数量 0、无破图、卡片高度 72px 不变），
	// 效果可接受 → **选择关闭**（口径与 prd.md R-BOOKNAV-02 一致）。
	// 要重新打开只需把 `enabled` 改回 true —— 下面这个 `api` 值一直留着，改一个布尔即可。
	favicon: {
		// 书签未填写 icon 时，是否自动获取目标站点的 favicon 图标
		enabled: false,

		// favicon 接口地址，{domain} 为占位符，会被替换成目标站点域名
		// 更换接口只需保证地址里含有 {domain}，例如：
		//   https://a.favicon.im/{domain}
		//   https://favicon.im/{domain}
		api: "https://a.favicon.im/{domain}",
	},
};

// 书签导航配置
// 每个数组项是一个分类组，分类组内的 items 是该分类下的书签
//
// ── v1.57（B-10 实施轮）整表重写：6 组 / 38 张 ────────────────────────────────
// 发起人 2026-09-30 给出最终选定的站点清单，本表**逐条照它落地**：
//   · 优先级顺序就是 `weight`：AI 工具 100 → AI 平台与模型 90 → 学习与刷题 80
//     → 开发与文档 70 → 云服务与账号 60 → 其他三方服务 50（**其他三方服务必须最后**）
//   · 组内条目按常用度给 weight（10 递减）
//   · **URL 一律用站点首页**：发起人原始清单里带查询串/追踪参数/实例 ID 的那几条
//     （腾讯云轻量实例 ID、Docker 用户名、LangSmith 组织 ID、Google/Gemini 追踪参数、
//     学习通时间戳参数）在这一步**顺带被抹掉**，产物里不许再出现 ——
//     `scripts/verify-ui.mjs` 的隐私守卫（R-BOOKNAV-04）钉住这些串。
//   · 上游模板自带的 10 张示例卡（GitHub / MDN / Astro / Svelte / Tailwind /
//     Iconify / iconfont / TinyPNG / Squoosh / Carbon）与原来的 dev/design/tools
//     三组**整表替换**；GitHub 那张按发起人要求保留，但归到「开发与文档」组。
//   · 同品牌两条（DeepSeek 对话 / DeepSeek 开放平台、LangChain 中文文档 / 官方文档）
//     **按不同用途各留一张**，不合并 —— 发起人逐条比对过，38 条里没有完全重复的条目。
//
// ⚠️ 图标策略：**只在确定 iconify 图标名存在时才写 `icon`**。这里的 20 个写法都对着
//    `node_modules/@iconify-json/{fa7-brands,simple-icons}/icons.json` 逐个核对过；
//    其余 18 张不写 `icon`，走上面的 favicon 开关（现已关闭）→ 首字母块。
//    注意 `simple-icons` 里**没有** volcengine / siliconflow / zhipu / tavily /
//    luogu(有) / chaoxing(无) 等名字，所以火山方舟、硅基流动、智谱 AI、学习通、
//    Tavily、PriceAI 比价、BigME.Pro 这七张都**不写 icon**（宁缺毋滥，写错名字会让
//    astro-icon 在构建期直接报错或被打成一个空 svg）。
export const booknavConfig: BooknavGroup[] = [
	{
		id: "ai-tools",
		name: "AI 工具",
		icon: "material-symbols:robot-2",
		desc: "每天都会点开的对话式 AI",
		weight: 100,
		items: [
			{
				title: "DeepSeek",
				url: "https://chat.deepseek.com/",
				desc: "对话式 AI，日常问答与代码",
				icon: "simple-icons:deepseek",
				weight: 10,
			},
			{
				title: "ChatGPT",
				url: "https://chatgpt.com/",
				desc: "OpenAI 的对话式 AI",
				icon: "simple-icons:openai",
				weight: 9,
			},
			{
				title: "Claude",
				url: "https://claude.ai/",
				desc: "Anthropic 的对话式 AI，长文与代码见长",
				icon: "simple-icons:claude",
				weight: 8,
			},
			{
				title: "Gemini",
				url: "https://gemini.google.com/",
				desc: "Google 的对话式 AI",
				icon: "simple-icons:googlegemini",
				weight: 7,
			},
			{
				title: "Grok",
				url: "https://grok.com/",
				desc: "xAI 的对话式 AI",
				weight: 6,
			},
			{
				title: "即梦 AI",
				url: "https://jimeng.jianying.com/",
				desc: "AI 绘画与视频创作",
				weight: 5,
			},
		],
	},
	{
		id: "ai-platform",
		name: "AI 平台与模型",
		icon: "material-symbols:neurology",
		desc: "模型社区、开放平台与 API 服务",
		weight: 90,
		items: [
			{
				title: "Hugging Face",
				url: "https://huggingface.co/",
				desc: "模型与数据集社区，含大模型性能榜",
				icon: "simple-icons:huggingface",
				weight: 10,
			},
			{
				title: "53AI 知识库",
				url: "https://www.53ai.com/",
				desc: "AI 应用落地案例与资讯",
				weight: 9,
			},
			{
				title: "LangSmith",
				url: "https://smith.langchain.com/",
				desc: "LLM 应用追踪与评测平台",
				icon: "simple-icons:langchain",
				weight: 8,
			},
			{
				title: "CC Switch",
				url: "https://www.ccswitch.io/",
				desc: "AI 编程工具统一管理",
				weight: 7,
			},
			{
				title: "火山方舟",
				url: "https://www.volcengine.com/",
				desc: "字节的模型服务平台",
				weight: 6,
			},
			{
				title: "硅基流动",
				url: "https://www.siliconflow.cn/",
				desc: "模型 API 与推理服务",
				weight: 5,
			},
			{
				title: "智谱 AI",
				url: "https://bigmodel.cn/",
				desc: "GLM 系列模型开放平台",
				weight: 4,
			},
			{
				title: "DeepSeek 开放平台",
				url: "https://platform.deepseek.com/",
				desc: "DeepSeek API 与用量",
				icon: "simple-icons:deepseek",
				weight: 3,
			},
			{
				title: "OpenAI Platform",
				url: "https://platform.openai.com/",
				desc: "OpenAI API 平台",
				icon: "simple-icons:openai",
				weight: 2,
			},
		],
	},
	{
		id: "study",
		name: "学习与刷题",
		icon: "material-symbols:school",
		desc: "题库、课程与考试入口",
		weight: 80,
		items: [
			{
				title: "洛谷",
				url: "https://www.luogu.com.cn/",
				desc: "算法竞赛题库与题解",
				icon: "simple-icons:luogu",
				weight: 10,
			},
			{
				title: "力扣 LeetCode",
				url: "https://leetcode.cn/",
				desc: "面试算法题库",
				icon: "simple-icons:leetcode",
				weight: 9,
			},
			{
				title: "蓝桥杯大赛",
				url: "https://dasai.lanqiao.cn/",
				desc: "蓝桥杯赛事官网",
				weight: 8,
			},
			{
				title: "学习通",
				url: "https://i.chaoxing.com/",
				desc: "课程与作业平台",
				weight: 7,
			},
			{
				title: "中国教育考试网",
				url: "https://www.neea.edu.cn/",
				desc: "考试报名与成绩查询",
				weight: 6,
			},
		],
	},
	{
		id: "dev",
		name: "开发与文档",
		icon: "material-symbols:code-rounded",
		desc: "代码托管、技术社区与文档",
		weight: 70,
		items: [
			{
				title: "GitHub",
				url: "https://github.com/",
				desc: "代码托管与开源社区",
				// icon 字段可以使用 astro-icon 图标库的图标名称
				// 也可以使用图片 URL 和本地图片路径
				// 不填则会通过接口自动获取目标站点的 favicon 图标（需要在上面配置）
				icon: "fa7-brands:github",
				weight: 10,
			},
			{
				title: "Gitee",
				url: "https://gitee.com/",
				desc: "国内代码托管",
				icon: "simple-icons:gitee",
				weight: 9,
			},
			{
				title: "CSDN",
				url: "https://www.csdn.net/",
				desc: "中文技术社区",
				icon: "simple-icons:csdn",
				weight: 8,
			},
			{
				title: "LangChain 中文文档",
				url: "https://langchain-doc.cn/",
				desc: "LangChain 中文教程",
				weight: 7,
			},
			{
				title: "LangChain 官方文档",
				url: "https://docs.langchain.com/",
				desc: "官方文档（含各家模型集成）",
				icon: "simple-icons:langchain",
				weight: 6,
			},
			{
				title: "npm",
				url: "https://www.npmjs.com/",
				desc: "JS 包仓库",
				icon: "simple-icons:npm",
				weight: 5,
			},
			{
				title: "Chat SDK",
				url: "https://chat-sdk.dev/",
				desc: "构建聊天机器人的 SDK",
				weight: 4,
			},
			{
				title: "FreeCAD",
				url: "https://www.freecad.org/",
				desc: "开源参数化三维建模",
				icon: "simple-icons:freecad",
				weight: 3,
			},
			{
				title: "腾讯位置服务 · 开发文档",
				url: "https://lbs.qq.com/",
				desc: "地图与定位开发文档",
				weight: 2,
			},
		],
	},
	{
		id: "cloud",
		name: "云服务与账号",
		icon: "material-symbols:cloud",
		desc: "服务器、容器与在线设计",
		weight: 60,
		items: [
			{
				title: "华为云",
				url: "https://www.huaweicloud.com/",
				desc: "云服务器与云服务控制台",
				icon: "simple-icons:huawei",
				weight: 10,
			},
			{
				title: "腾讯云",
				url: "https://cloud.tencent.com/",
				desc: "云服务器与云产品控制台",
				// ⚠️ simple-icons 里**没有** tencentcloud / qcloud 这个名字（逐个核对过
				// `node_modules/@iconify-json/simple-icons/icons.json`），所以这里**不写 icon**
				// —— 硬凑一个 QQ 企鹅反而指错品牌，宁缺毋滥（见文件头的图标策略）。
				// 关掉自动 favicon 后它显示首字母块「腾」。
				weight: 9,
			},
			{
				title: "Docker",
				url: "https://www.docker.com/",
				desc: "容器镜像与 Docker Hub",
				icon: "simple-icons:docker",
				weight: 8,
			},
			{
				title: "Canva 可画",
				url: "https://www.canva.cn/",
				desc: "在线平面设计",
				icon: "simple-icons:canva",
				weight: 7,
			},
		],
	},
	// ⚠️ 发起人明确要求：**其他三方服务排在最后**（weight 50，是 6 组里最小的一组）。
	//    这一组都是第三方 API / 订阅类站点，含发起人点名要收录的 `happy.bigmess.org`
	//    （BigME.Pro）—— 它**不在**隐私守卫的排除名单里，别顺手加进去。
	{
		id: "thirdparty",
		name: "其他三方服务",
		icon: "material-symbols:widgets",
		desc: "第三方 API 与订阅类服务",
		weight: 50,
		items: [
			{
				title: "米醋 API",
				url: "https://www.micuapi.ai/",
				desc: "模型 API 中转与订阅",
				weight: 10,
			},
			{
				title: "Tavily",
				url: "https://tavily.com/",
				desc: "为 AI 应用准备的搜索 API",
				weight: 9,
			},
			{
				title: "PriceAI 比价",
				url: "https://priceai.cc/",
				desc: "AI 服务价格比对",
				weight: 8,
			},
			{
				title: "BigME.Pro",
				url: "https://happy.bigmess.org/",
				desc: "第三方订阅服务",
				weight: 7,
			},
			{
				title: "Google",
				url: "https://www.google.com/",
				desc: "搜索引擎",
				icon: "simple-icons:google",
				weight: 6,
			},
		],
	},
];
