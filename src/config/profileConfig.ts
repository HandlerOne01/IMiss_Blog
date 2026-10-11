import type { ProfileConfig } from "../types/profileConfig";

export const profileConfig: ProfileConfig = {
	// 头像
	// 图片路径支持三种格式：
	// 1. public 目录（以 "/" 开头，不优化）："/assets/images/avatar.webp"
	// 2. src 目录（不以 "/" 开头，自动优化但会增加构建时间，推荐）："assets/images/avatar.webp"
	// 3. 远程 URL："https://example.com/avatar.jpg"
	// IMiss Blog：**正式头像 = 爱弥斯人物插画**（发起人 2026-10-07 给的图，v1.64 起）。
	// 源图 `design/imiss-avatar.png`（486×487）→ `pnpm make:logo` 生成这份 486×486 的 webp。
	// 与"小图标是纸飞机"的分工一致：导航栏/标签页用纸飞机，**大图标与侧栏头像用人物**
	// （参考上游作者站的做法）。它同时是 schema.org 的作者 image（见 utils/schema-image.ts）。
	// ⚠️ 阻塞项 B-02 的"头像"这一半自此关闭；作者名/签名/社交链接仍待发起人给。
	avatar: "assets/images/avatar/imiss-avatar.webp",

	// 名字
	// ✅ v1.107：**发起人给定真名**（2026-10-10 原话「**名字为 HandlerOne 记得改关于本站文本那里也说了我的名字**」）
	// → 占位 `IMiss` 换成 **`HandlerOne`**，阻塞项 **B-02 至此整条关闭**。
	// ⚠️ 这是**作者名**，不是站点名：`siteConfig.title` 的 `IMiss Blog` 是**站点名**（导航栏标题 /
	//    `<title>` / OG 标题），按发起人的口径**一个字都没动**；同理项目名 `vibecoding IMiss_Blog个人博客` 也不动。
	// 它出现在：侧栏资料卡（`Profile.astro`）、页脚版权「© 年份 <name>. All Rights Reserved.」
	//    （`Footer.astro`）、`<meta name="author">`（`Layout.astro`）、文章 `article:author` 兜底
	//    （`[...slug].astro`）、动态条目作者（`DynamicItem*.astro`）、JSON-LD `Person.name`。
	// ⚠️ 与「关于我」页里那条 `HandlerOne`（三角洲行动 干员 ID）**是同一个名字**，不是巧合。
	name: "HandlerOne",

	// 个人签名
	// ✅ v1.98：**发起人亲自给定**（2026-10-10 他圈着侧栏资料卡那张截图说「B-02 签名换成 おかえり」），
	// 一字未改照抄（日语「欢迎回来」，七个字符）。
	// ⚠️ 这一行同时进 JSON-LD：`buildPersonEntity({ description })` → `Person.description`
	// （about 页与每篇文章的 `application/ld+json`，见 `src/utils/schema-utils.ts`）。
	// 也就是说结构化数据里作者的 description 现在就是「おかえり」—— 发起人的选择，如实保留。
	bio: "おかえり",

	// 链接配置
	// 已经预装的图标集：fa7-brands，fa7-regular，fa7-solid，material-symbols，simple-icons
	// 访问https://icones.js.org/ 获取图标代码，
	// 如果想使用尚未包含相应的图标集，则需要安装它
	// `pnpm add @iconify-json/<icon-set-name>`
	// showName: true 时显示图标和名称，false 时只显示图标
	//
	// IMiss Blog：上游示例里的 GitHub 用户名与邮箱都是**模板作者**的信息，已删除；
	// RSS/Atom 两个订阅入口也随 R-ID-06 一起删掉（v1.63~v1.66 期间这里是空数组）。
	// ✅ v1.98：**发起人给定**（2026-10-10 原话「社交链接就是我链接下拉条的前四个」）——
	// **逐字取导航「链接」下拉的前 4 条**（顺序也是他的顺序）：Gitee → GitHub → CSDN → 洛谷；
	// 后两条（Boost 搜索引擎 / HTTP 服务器）**不进资料卡**。
	// ⚠️ 这里是**副本**，单一事实来源仍是 `navBarConfig.ts` 的「链接」子项 ——
	// `verify:ui` 有一条断言（R-WDG-05）**逐字比对这两个列表**：导航前 4 条一改，它就判红提醒同步。
	// ⚠️ 只显示图标（不写 `showName`）：侧栏卡片窄，4 个 40×40 按钮正好一行；
	// 名字在 `aria-label` 里（无障碍与悬停都能读到）。
	// ⚠️ 这 4 条同时进 JSON-LD 的 `Person.sameAs`（`filterAbsoluteLinks()`，见 schema-utils.ts）。
	links: [
		{ name: "Gitee", url: "https://gitee.com/a2186988646", icon: "simple-icons:gitee" },
		{ name: "GitHub", url: "https://github.com/a13824367931-alt", icon: "simple-icons:github" },
		{ name: "CSDN", url: "https://blog.csdn.net/is_ko_nois_ko", icon: "simple-icons:csdn" },
		{ name: "洛谷", url: "https://www.luogu.com.cn/user/1726221", icon: "simple-icons:luogu" },
	],
};
