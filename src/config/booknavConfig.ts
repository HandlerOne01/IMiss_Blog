import { brandHex } from "../constants/booknav-brand-colors";
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
// ⚠️ 图标策略（**v1.58 重写**）：38 张卡**每一张都要有官方图标 + 官方品牌色**，
//    分三类，判据都在 `scripts/verify-ui.mjs` 的 R-BOOKNAV-05 ~ 08：
//      ① **iconify 品牌矢量图标**（26 张）：写 `icon: "simple-icons:xxx"` + `iconColor`。
//         图标名逐个对过 `node_modules/@iconify-json/simple-icons/icons.json`。
//         同品牌两条（DeepSeek 对话 / 开放平台、LangChain 中文 / 官方文档）用同一个图标与色，
//         这是**有意的**：它们确实是同一个品牌，只是入口不同。
//      ② **各站官方 favicon 的本地副本**（11 张）：写 `icon: "/booknav-icons/<slug>.png"`。
//         走 `<img>` 分支，**自带真彩色**，所以**不写** `iconColor`。
//         素材由 `scripts/fetch-booknav-icons.mjs` 抓取 + sharp 归一化（128×128 PNG），
//         来源表见 `public/booknav-icons/README.md`。
//         ⚠️ 这一条**替代**了老做法里"缺图标就退化成首字母块"：能拿到官方图形的都拿到了。
//      ③ **字母块例外**（1 张）：`BigME.Pro`（happy.bigmess.org）**整站 503**
//         （chrome / curl / Googlebot 三种 UA + http/https + www/裸域全部 503；
//         `bigmess.org` / `bigme.pro` 裸域 DNS 直接失败），取不到任何官方图形；
//         一次性兜底接口拿回来的是**通用地球占位图**（已按像素哈希识别并丢弃，
//         见 fetch 脚本的 PLACEHOLDER_SHA256）。按任务书允许的例外走**带品牌色的字母块**，
//         它的 `iconColor` 是"颜色待定"的显式占位，**不是**查到的事实。
//    旧策略里"simple-icons 没有 volcengine/siliconflow/zhipu/tavily 等名字，所以这七张不写 icon"
//    的说法**已作废**：那七张现在全部改走 ②（本地官方 favicon）。
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
				iconColor: brandHex("DeepSeek"),
				weight: 10,
			},
			{
				title: "ChatGPT",
				url: "https://chatgpt.com/",
				desc: "OpenAI 的对话式 AI",
				icon: "simple-icons:openai",
				iconColor: brandHex("ChatGPT"),
				weight: 9,
			},
			{
				title: "Claude",
				url: "https://claude.ai/",
				desc: "Anthropic 的对话式 AI，长文与代码见长",
				icon: "simple-icons:claude",
				iconColor: brandHex("Claude"),
				weight: 8,
			},
			{
				title: "Gemini",
				url: "https://gemini.google.com/",
				desc: "Google 的对话式 AI",
				icon: "simple-icons:googlegemini",
				iconColor: brandHex("Gemini"),
				weight: 7,
			},
			{
				title: "Grok",
				url: "https://grok.com/",
				desc: "xAI 的对话式 AI",
				icon: "simple-icons:x",
				iconColor: brandHex("Grok"),
				weight: 6,
			},
			{
				title: "即梦 AI",
				url: "https://jimeng.jianying.com/",
				desc: "AI 绘画与视频创作",
				icon: "simple-icons:bytedance",
				iconColor: brandHex("即梦 AI"),
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
				iconColor: brandHex("Hugging Face"),
				weight: 10,
			},
			{
				title: "53AI 知识库",
				url: "https://www.53ai.com/",
				desc: "AI 应用落地案例与资讯",
				icon: "/booknav-icons/53ai.png",
				weight: 9,
			},
			{
				title: "LangSmith",
				url: "https://smith.langchain.com/",
				desc: "LLM 应用追踪与评测平台",
				icon: "simple-icons:langchain",
				iconColor: brandHex("LangSmith"),
				weight: 8,
			},
			{
				title: "CC Switch",
				url: "https://www.ccswitch.io/",
				desc: "AI 编程工具统一管理",
				icon: "/booknav-icons/ccswitch.png",
				weight: 7,
			},
			{
				title: "火山方舟",
				url: "https://www.volcengine.com/",
				desc: "字节的模型服务平台",
				icon: "simple-icons:bytedance",
				iconColor: brandHex("火山方舟"),
				weight: 6,
			},
			{
				title: "硅基流动",
				url: "https://www.siliconflow.cn/",
				desc: "模型 API 与推理服务",
				icon: "/booknav-icons/siliconflow.png",
				weight: 5,
			},
			{
				title: "智谱 AI",
				url: "https://bigmodel.cn/",
				desc: "GLM 系列模型开放平台",
				icon: "/booknav-icons/bigmodel.png",
				weight: 4,
			},
			{
				title: "DeepSeek 开放平台",
				url: "https://platform.deepseek.com/",
				desc: "DeepSeek API 与用量",
				icon: "simple-icons:deepseek",
				iconColor: brandHex("DeepSeek 开放平台"),
				weight: 3,
			},
			{
				// v1.88：发起人给的地址（「书签导航加个这个」）。放在本组**最后一位**（weight 1）——
				// 这组的顺序是他 2026-09-30 定的优先级，新卡不插队；要挪前面说一声。
				// ⚠️ 品牌键**逐字等于标题**：`verify-ui.mjs` 那条"逐张核对亮色图标色"是按**卡片标题**
				//    索引品牌表的，键写成短名会让这张卡**静默漏掉核对**（写短名的第一版实测 27 张只核了 26 张）。
				title: "MiniMax 媒体平台",
				url: "https://design.minimax.cn/media-plan/console/details",
				desc: "MiniMax 的媒体计划控制台",
				icon: "simple-icons:minimax",
				iconColor: brandHex("MiniMax 媒体平台"),
				weight: 1,
			},
			{
				title: "OpenAI Platform",
				url: "https://platform.openai.com/",
				desc: "OpenAI API 平台",
				icon: "simple-icons:openai",
				iconColor: brandHex("OpenAI Platform"),
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
				iconColor: brandHex("洛谷"),
				weight: 10,
			},
			{
				title: "力扣 LeetCode",
				url: "https://leetcode.cn/",
				desc: "面试算法题库",
				icon: "simple-icons:leetcode",
				iconColor: brandHex("力扣 LeetCode"),
				weight: 9,
			},
			{
				title: "蓝桥杯大赛",
				url: "https://dasai.lanqiao.cn/",
				desc: "蓝桥杯赛事官网",
				icon: "/booknav-icons/lanqiao.png",
				weight: 8,
			},
			{
				title: "学习通",
				url: "https://i.chaoxing.com/",
				desc: "课程与作业平台",
				icon: "/booknav-icons/chaoxing.png",
				weight: 7,
			},
			{
				title: "中国教育考试网",
				url: "https://www.neea.edu.cn/",
				desc: "考试报名与成绩查询",
				icon: "/booknav-icons/neea.png",
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
				icon: "simple-icons:github",
				iconColor: brandHex("GitHub"),
				weight: 10,
			},
			{
				title: "Gitee",
				url: "https://gitee.com/",
				desc: "国内代码托管",
				icon: "simple-icons:gitee",
				iconColor: brandHex("Gitee"),
				weight: 9,
			},
			{
				title: "CSDN",
				url: "https://www.csdn.net/",
				desc: "中文技术社区",
				icon: "simple-icons:csdn",
				iconColor: brandHex("CSDN"),
				weight: 8,
			},
			{
				title: "LangChain 中文文档",
				url: "https://langchain-doc.cn/",
				desc: "LangChain 中文教程",
				icon: "simple-icons:langchain",
				iconColor: brandHex("LangChain 中文文档"),
				weight: 7,
			},
			{
				title: "LangChain 官方文档",
				url: "https://docs.langchain.com/",
				desc: "官方文档（含各家模型集成）",
				icon: "simple-icons:langchain",
				iconColor: brandHex("LangChain 官方文档"),
				weight: 6,
			},
			{
				title: "npm",
				url: "https://www.npmjs.com/",
				desc: "JS 包仓库",
				icon: "simple-icons:npm",
				iconColor: brandHex("npm"),
				weight: 5,
			},
			{
				title: "Chat SDK",
				url: "https://chat-sdk.dev/",
				desc: "构建聊天机器人的 SDK",
				icon: "material-symbols:forum-rounded",
				iconColor: brandHex("Chat SDK"),
				weight: 4,
			},
			{
				title: "FreeCAD",
				url: "https://www.freecad.org/",
				desc: "开源参数化三维建模",
				icon: "simple-icons:freecad",
				iconColor: brandHex("FreeCAD"),
				weight: 3,
			},
			{
				title: "腾讯位置服务 · 开发文档",
				url: "https://lbs.qq.com/",
				desc: "地图与定位开发文档",
				icon: "simple-icons:qq",
				iconColor: brandHex("腾讯位置服务 · 开发文档"),
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
				iconColor: brandHex("华为云"),
				weight: 10,
			},
			{
				title: "腾讯云",
				url: "https://cloud.tencent.com/",
				desc: "云服务器与云产品控制台",
				// ⚠️ simple-icons 里**没有** tencentcloud / qcloud 这个名字（逐个核对过
				// `node_modules/@iconify-json/simple-icons/icons.json`），硬凑一个 QQ 企鹅反而
				// 指错品牌。**v1.58 起改走各站官方 favicon 的本地副本**：来源
				// `https://cloud.tencent.com/favicon.ico`（949B ico，含内嵌 PNG，sharp 归一化为
				// 128×128 PNG），来源表见 `public/booknav-icons/README.md`。
				icon: "/booknav-icons/tencent-cloud.png",
				weight: 9,
			},
			{
				title: "Docker",
				url: "https://www.docker.com/",
				desc: "容器镜像与 Docker Hub",
				icon: "simple-icons:docker",
				iconColor: brandHex("Docker"),
				weight: 8,
			},
			{
				title: "Canva 可画",
				url: "https://www.canva.cn/",
				desc: "在线平面设计",
				icon: "simple-icons:canva",
				iconColor: brandHex("Canva 可画"),
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
				icon: "/booknav-icons/micuapi.png",
				weight: 10,
			},
			{
				title: "Tavily",
				url: "https://tavily.com/",
				desc: "为 AI 应用准备的搜索 API",
				icon: "/booknav-icons/tavily.png",
				weight: 9,
			},
			{
				title: "PriceAI 比价",
				url: "https://priceai.cc/",
				desc: "AI 服务价格比对",
				icon: "/booknav-icons/priceai.png",
				weight: 8,
			},
			{
				title: "BigME.Pro",
				url: "https://happy.bigmess.org/",
				desc: "第三方订阅服务",
				// ⚠️ **字母块例外**：happy.bigmess.org 整站 503（chrome / curl / Googlebot 三种 UA、
				// http/https、www/裸域全部 503；`bigmess.org` / `bigme.pro` 裸域 DNS 直接失败），
				// 取不到任何官方图形；一次性兜底接口给的是**通用地球占位图**（已按像素哈希识别并丢弃）。
				// 所以这一张按任务书允许的例外走**带品牌色的字母块**（见文件头图标策略 ③）。
				// 颜色是"待定"的显式占位，不是查到的事实 —— 报告里已点名。
				iconColor: brandHex("BigME.Pro"),
				weight: 7,
			},
			{
				title: "Google",
				url: "https://www.google.com/",
				desc: "搜索引擎",
				icon: "simple-icons:google",
				iconColor: brandHex("Google"),
				weight: 6,
			},
		],
	},
];
