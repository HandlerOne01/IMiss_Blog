// src/config/roadmapConfig.ts
/**
 * 学习路线数据（R-PATH-02）。**唯一需要手工维护的文件**。
 * 规矩（改数据前先读这段）：
 *  · 顺序 = 数组顺序，**不写显式「第 N 步」数字**（改顺序时不会漏改编号）；
 *  · 篇目用 `category` + `slug` 成对定位（站内有同名篇目）；
 *  · `name` 只覆盖本页显示名；
 *  · `crossLine: true` = 跨线复用（同一篇在别的线里已经出现过，代码：R-PATH-03）。
 */
import type { RoadmapConfig, RoadmapStop } from "../types/roadmapConfig";

const s = (
	category: string,
	slug: string,
	name?: string,
	crossLine?: boolean,
): RoadmapStop => ({
	category,
	slug,
	...(name ? { name } : {}),
	...(crossLine ? { crossLine: true } : {}),
});

export const roadmapConfig: RoadmapConfig = {
	lines: [
		{
			id: "cpp",
			name: "C++ 与 STL",
			summary:
				"从 C 的内存模型一路写到现代 C++：先把指针和内存搞清楚，再进面向对象与模板，然后自己实现一遍 STL 容器，最后补 C++11。",
			level: "进阶",
			stages: [
				{
					title: "C 与内存基础",
					stops: [
						s("cpp", "shujuzaineicunzhongcunchu"),
						s("cpp", "zhizhen"),
						s("cpp", "zhizhen-yinyongyu-const-defuzaguanxi"),
						s("cpp", "c-yuyanneicunhanshu"),
						s("cpp", "c-yuyanzifuyuzifuchuanhanshu"),
						s("cpp", "jiegouti"),
						s("cpp", "lianhehemeiju"),
						s("cpp", "dongtaineicunfenpei"),
						s("cpp", "neicunguanli"),
						s("cpp", "yuchuli"),
						s("cpp", "wenjiancaozuo"),
					],
				},
				{
					title: "面向对象与模板",
					stops: [
						s("cpp", "cpp-jichuyufa"),
						s("cpp", "leiheduixiang"),
						s("cpp", "jicheng"),
						s("cpp", "duotai"),
						s("cpp", "muban"),
						s("cpp", "mubanjinjie"),
					],
				},
				{
					title: "STL 容器与实现",
					stops: [
						s("cpp", "vector", "vector · 模拟实现"),
						s("cpp", "string", "string · 模拟实现"),
						s("cpp", "list", "list · 模拟实现"),
						s("cpp", "stack-queue-priority-queue"),
						s("stl", "vector", "vector · 用法"),
						s("stl", "string", "string · 用法"),
						s("stl", "list", "list · 用法"),
						s("stl", "stack"),
						s("stl", "queue"),
						s("stl", "deque"),
						s("cpp", "erchasousuoshu"),
						s("cpp", "avl-shu"),
						s("cpp", "hongheishu"),
						s("cpp", "hongheishufengzhuangshixian-mymap-he-myset"),
						s("cpp", "haxibiao"),
						s("cpp", "haxibiaofengzhuang-myunordered-map-he-myunordered-set"),
						s("cpp", "cpp-cuotiben"),
					],
				},
				{
					title: "现代 C++（C++11）",
					stops: [
						s("cpp11", "leidexingongnengyu-stl-rongqibianhua"),
						s("cpp11", "youzhiyinyongyuyidongyuyi"),
						s("cpp11", "zhinengzhizhen"),
						s("cpp11", "lambda-biaodashi-function-yu-bind-baozhuangqi"),
						s("cpp11", "kebiancanshumubanyu-emplace-xilie"),
						s("cpp11", "cpp11-bingfabiancheng"),
					],
				},
				{
					title: "面试前的自查（跨线）",
					stops: [s("interview", "cpp", "C++ 八股总复习", true)],
				},
			],
		},
		{
			id: "algo",
			name: "算法与数据结构",
			summary:
				"按“先技巧、再 DP、再图论”的顺序走；最后用错题本把整条线过一遍。",
			level: "入门",
			stages: [
				{
					title: "基础技巧",
					stops: [
						s("algorithm", "qianzhuihe"),
						s("algorithm", "chafen"),
						s("algorithm", "shuangzhizhen-tongxiangshuangzhizhen"),
					],
				},
				{
					title: "查找、贪心与分治",
					stops: [
						s("algorithm", "erfen"),
						s("algorithm", "tanxin"),
						s("algorithm", "fenzhi"),
						s("algorithm", "lisanhua"),
					],
				},
				{
					title: "动态规划",
					stops: [
						s("algorithm", "dongtaiguihua"),
						s("algorithm", "xianxing-dp"),
						s("algorithm", "qujian-dp"),
						s("algorithm", "beibaowenti"),
					],
				},
				{
					title: "图论",
					stops: [
						s("algorithm", "tudejibengainian"),
						s("algorithm", "dfs"),
						s("algorithm", "bfs"),
						s("algorithm", "tuopupaixu"),
						s("algorithm", "chabingji"),
						s("algorithm", "zuixiaoshengchengshu"),
						s("algorithm", "danyuanzuiduanlu"),
						s("algorithm", "duoyuanzuiduanlu"),
					],
				},
				{
					title: "字符串与数学",
					stops: [
						s("algorithm", "zifuchuanhaxi"),
						s("algorithm", "trie-shu-zidianshu"),
						s("algorithm", "shulun"),
						s("algorithm", "gaojingdu"),
					],
				},
				{
					title: "进阶结构",
					stops: [
						s("algorithm", "dandiaozhan"),
						s("algorithm", "dandiaoduilie"),
					],
				},
				{ title: "总复习", stops: [s("algorithm", "suanfacuotiben")] },
			],
		},
		{
			id: "linux",
			name: "Linux 系统",
			summary:
				"先用基础知识点建立地图，再按“工具 → 编译 → 文件 → 进程 → 信号线程 → IPC”一路往下；中间自己写一个 myshell。",
			level: "进阶",
			stages: [
				{
					title: "总览（先读这个）",
					stops: [s("linux", "linux-jichuzhishidian")],
				},
				{
					title: "上手与工具",
					stops: [
						s("linux", "jibenzhiling"),
						s("linux", "vim-bianjiqishiyongyu-linux-ruanjiananzhuang"),
						s("linux", "git"),
						s("linux", "quanxianguanli"),
						s("linux", "huanjingbianliang"),
					],
				},
				{
					title: "编译与调试",
					stops: [
						s("linux", "bianyiliuchengyukujizhi"),
						s("linux", "kuzhizuoyuyuanli"),
						s("linux", "make-yu-makefile"),
						s("linux", "gdb-tiaoshiqi"),
						s("linux", "elf-wenjian"),
					],
				},
				{
					title: "文件与系统",
					stops: [
						s("linux", "wenjian-io-yuwenjianmiaoshufu"),
						s("linux", "huanchongqu"),
						s("linux", "ext-xiliewenjianxitong"),
						s("linux", "xunidizhikongjian"),
						s("linux", "jisuanjitixijiegouyucaozuoxitonghexingainian"),
					],
				},
				{
					title: "进程",
					stops: [
						s("linux", "jinchengguanli"),
						s("linux", "jinchengzhuangtai"),
						s("linux", "jinchengyouxianji-qiehuanyudiaodu"),
						s("linux", "jinchengtuichu-dengdaiyuchengxutihuan"),
						s("linux", "xitongdiaoyongjiqikuhanshu"),
						s("linux", "myshell-daima"),
					],
				},
				{
					title: "信号与线程",
					stops: [
						s("linux", "xinhao"),
						s("linux", "xiancheng"),
						s("linux", "xianchengtongbuyuhuchi"),
						s("linux", "posix"),
					],
				},
				{
					title: "进程间通信（IPC）",
					stops: [s("linux", "jinchengjiantongxin-ipc")],
				},
			],
		},
		{
			id: "net",
			name: "网络",
			summary:
				"先把协议栈从链路层读到 HTTP，再学 socket 接口，最后进高并发 IO 模型。",
			level: "进阶",
			stages: [
				{
					title: "协议基础",
					stops: [
						s("linux-net", "wangluojichu"),
						s("linux-net", "shujulianluceng-yitaiwangzhen-arp-xieyi"),
						s("linux-net", "ip-xieyi-ziwanghuafenyukuawangluyou"),
						s("linux-net", "udp-xieyiyuwangluotongxinzhishidian"),
						s("linux-net", "tcp-wangluotongxinliucheng"),
						s("linux-net", "tcp-chuanshukongzhixieyi"),
						s("linux-net", "http-xieyi"),
					],
				},
				{
					title: "编程接口",
					stops: [
						s("linux-net", "wangluochangyongjiekou"),
						s("linux-net", "tcp-xuliehuayufanxuliehuawangluojisuanqi"),
						s("linux-net", "liaotianfuwuqidaimajiexi-udp"),
					],
				},
				{
					title: "高并发 IO",
					stops: [
						s(
							"linux-net",
							"linux-wuzhonggaoji-io-moxingyu-select-duoluzhuanjie",
						),
						s("linux-net", "poll-epoll-reactor"),
						s("linux-net", "jinchengjianguanxiyushouhujincheng"),
					],
				},
				{
					title: "面试前的自查（跨线）",
					stops: [
						s("interview", "jisuanjiwangluo", "计算机网络八股总复习", true),
					],
				},
			],
		},
		{
			id: "mysql",
			name: "MySQL",
			summary:
				"五篇语法打底，再用那篇长文把“为什么这么设计”补上（索引 / 事务 / 锁）。",
			level: "入门",
			stages: [
				{
					title: "基础语法与操作",
					stops: [
						s("mysql", "shujukujichuyu-mysql"),
						s("mysql", "mysql-changyongmingling"),
						s("mysql", "mysql-zhongkuhebiaodezengshanchagaicaozuo"),
						s("mysql", "mysql-shujuleixing"),
						s("mysql", "mysql-yueshuyufa"),
					],
				},
				{
					title: "深入（面试问的是这一半）",
					stops: [s("mysql", "mysql-from-deepseek")],
				},
				{
					title: "面试前的自查（跨线）",
					stops: [s("interview", "shujuku", "数据库八股总复习", true)],
				},
			],
		},
		{
			id: "interview",
			name: "面试八股",
			summary:
				"先看总览和语言，再按计算机基础六件套铺开，最后上手撕代码和刁钻问题。",
			level: "实战",
			stages: [
				{
					title: "总览与语言",
					stops: [
						s("interview", "baguwenmianshizongjie-xiezaiqianmian"),
						s("interview", "cpp"),
						s("interview", "shejimoshi"),
					],
				},
				{
					title: "计算机基础",
					stops: [
						s("interview", "caozuoxitong"),
						s("interview", "jisuanjiwangluo"),
						s("interview", "shujuku"),
						s("interview", "shujujiegoujisuanfa"),
						s("interview", "qitajishuzhan"),
						s("interview", "linux-fuwuqi"),
					],
				},
				{
					title: "手撕与刁钻",
					stops: [
						s("interview", "shousidaima"),
						s("interview", "leetcode-shuati"),
						s("interview", "lipuwenti"),
					],
				},
			],
		},
		{
			id: "project",
			name: "项目梳理",
			summary:
				"从零写出来的几个项目：先 HTTP 小项目，再 My_Server 框架，最后搜索引擎；收尾是项目展示页的文章版与一篇本站自己的维护手册。",
			level: "实战",
			stages: [
				{ title: "HTTP 小项目", stops: [s("project", "http")] },
				{
					title: "My_Server 框架",
					stops: [
						s("project", "my-server-kuangjiaquanliuchengshuli"),
						s("project", "my-server-siweidaotu"),
						s("project", "liuchengshuli"),
					],
				},
				{
					title: "搜索引擎",
					stops: [
						s("project", "cpp-sousuoyinqing-kechengbiji"),
						s("project", "sousuoyinqingsiweidaotu"),
					],
				},
				// v1.85 新增：把「项目」模块那 3 篇的**同一批内容**也做成文章（新分类「项目实战」）。
				// ⚠️ 站内每一篇都必须能被路线页解释（R-PATH-04 的判据是"路线并集 == 站内总篇数"），
				//    所以这 3 篇必须有停靠点；它们与上面三条主线讲的是同一批项目，单列一阶段说明来源。
				{
					title: "项目展示（文章版）",
					stops: [
						s("projects", "my-server"),
						s("projects", "boost-search-engine"),
						s("projects", "blog-agent"),
					],
				},
				// v1.84 新增：本站自己的使用与维护手册（发起人：「创作一篇文章……教使用者如何使用本站」）。
				// ⚠️ 它不是"第三个项目"，所以单开一个阶段、并把这层意思写进上面那句 summary ——
				//    站内每一篇都必须能被路线页解释（R-PATH-04 的判据是"路线并集 == 站内总篇数"）。
				{ title: "本站维护", stops: [s("project", "boke-shiyong-yu-weihu-shouce")] },
			],
		},
		{
			id: "ai",
			name: "AI 应用",
			summary:
				"从 SDD 的思路进 LangChain 的编排，再进 LangGraph 的状态图 —— 三篇依次递进。",
			level: "进阶",
			stages: [
				{
					title: "依次递进",
					stops: [
						s("ai", "sdd"),
						s("ai", "langchain-nengli-xiangjie"),
						s("ai", "langgraph-nengli-xiangjie-xuexibiji"),
					],
				},
			],
		},
	],
};

export default roadmapConfig;
