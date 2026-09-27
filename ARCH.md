# IMiss Blog 架构与技术设计（ARCH）

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.38 |
| 最后更新 | 2026-09-27 |
| 关联文档 | `prd.md`（需求编号 R-xxx 的来源）、`PROJECT_STATUS.md`（阶段与阻塞项） |
| 基线代码 | Firefly v6.16.8，Astro 7.3.2 + Svelte 5 + Swup + Tailwind 4，静态输出 |

本文档回答三个问题：**改哪个文件**、**怎么改**、**为什么这么改**。每一条都能追溯到 `prd.md` 的需求编号。

---

## 1. 技术栈与硬约束

| 层 | 选型 | 约束与理由 |
| --- | --- | --- |
| 站点框架 | Astro 7（静态输出） | `astro.config.mjs` 只在 `CF_WORKERS` 环境变量存在时才挂 Cloudflare adapter；本项目走静态 |
| 交互岛 | Svelte 5 | 复杂交互（榜单切换、搜索、文件树等）用 Svelte，其余用 Astro + 内联脚本 |
| 页面切换 | Swup（`@swup/astro`） | 只替换固定的几个容器；**新增的常驻组件必须挂在这些容器之外**，否则每次切页都会被销毁重建 |
| 样式 | Tailwind 4 + Stylus 变量 | 主题令牌在 `src/styles/variables.styl`，组件里用 `var(--primary)` 这类语义变量，不要写死颜色 |
| 路由 | `trailingSlash: "always"` | 所有 URL 以 `/` 结尾，产物是 `<route>/index.html`；Nginx 不需要 SPA 回退 |
| 内容 | Content Collections（`src/content.config.ts`） | `posts` / `dynamic` / `projects` / `spec` 四个集合，schema 是 zod |
| 图片 | `sharp` + Astro 图片管线 | `src` 下的图自动优化（`imageOptimization.formats: webp`，质量 85）；`public` 下的图原样拷贝 |
| 搜索 | Pagefind | 构建末尾由 `scripts/run-pagefind.ts` 生成 |
| 运行时依赖 | Node ≥ 22.23、pnpm 11.x | 本机实测 Node v24.16.0 / pnpm 11.24.0 ✅ |
| Agent | Python 3.12 + LangGraph + FastAPI + DeepSeek | 独立进程，通过 Nginx 反代与前端同源；本机 uv 未安装（见阻塞项） |

**三条不可越过的硬约束**

1. **前端不允许出现任何密钥**：LLM / LangSmith 的 Key 只存在于 Python 服务端进程与环境变量里。
2. **构建不允许依赖外网**（PRD R-DEP-04）：VNDB 封面下载保持关闭；番剧页未配置凭据时不发起请求；**字体必须走 npm provider**（远端 provider 会在构建时访问 jsdelivr，实测会直接失败，见 §14.3 T16）；GitHub 卡片步骤允许尝试联网但失败必须回落缓存。
3. **`dosc/**` 与 `agent_-for_-blog/**` 全程只读**：前者是内容源，后者是参考实现。

---

## 2. 总体架构

```
┌──────────────────────────── 构建期（本机 / CI） ────────────────────────────┐
│  src/content/posts/**  ─┐                                                  │
│  src/content/{dynamic,projects,spec}/** ─┤                                 │
│  src/config/*.ts（站点/导航/壁纸/排行/桌宠）─┤→  astro build  →  dist/       │
│  src/assets/images/**  ─┘   ↑                                             │
│                             └─ scripts/：generate-lqips → subset-fonts      │
│                                → pagefind →（本项目新增）verify-posts       │
│  scripts/export-agent-data.mjs ──→ agent/data/{blog-index.json,rank.json}  │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
┌────────────────────────── 运行期（云服务器 / 本机） ──────────────────────────┐
│  Nginx  ── 静态文件 ──→  dist/（HTML 不缓存，/_astro 与 /assets 长缓存）       │
│    └── /api/ 反代 ──→  FastAPI 网关 :8000（SSE，proxy_buffering off）        │
│                          └── langgraph_sdk ──→ LangGraph Server :2024      │
│                                                 └── DeepSeek API            │
│                          └── LangSmith（追踪，被动上报，不在关键路径上）       │
│                                                                             │
│  浏览器：静态页面 + 桌宠组件 ─ fetch(/api/pet/chat, SSE) ─→ 网关              │
│          无后端时：桌宠走本地 mock，不报错（PRD R-AGT-03）                    │
└───────────────────────────────────────────────────────────────────────────┘
```

**运行时数据流（桌宠对话）**

1. 桌宠组件生成并保存 `threadId`（localStorage），用户输入 → `fetch(apiBase + "/pet/chat", { method: "POST" })`。
2. 网关校验（同源/CORS、限流、长度）→ 调用 LangGraph（`langgraph_sdk` 或进程内直调）→ 逐 token 转发为 SSE。
3. 桌宠收到 `state` 事件改动画状态，收到 `token` 事件写入气泡，收到 `meta` 事件渲染文章链接。
4. 请求结束（`state: done`）→ 回到待机；出错 → `failed` 状态 + 气泡内可读提示。

---

## 3. 目录架构

### 3.1 工作区布局

```
imiss_-blog/                      ← 工作区根（= 站点仓库）
├─ prd.md                         ← 本文档体系（P0 交付）
├─ ARCH.md
├─ PROJECT_STATUS.md
├─ README.md / README.en.md       ← 从模板继承，改写为本站说明
├─ astro.config.mjs               ← 基本不动（除 sitemap 过滤条件）
├─ package.json                   ← 增加 verify:ui / make:logo / verify:posts / export:agent 脚本
├─ src/                           ← 模板源码（见下）
├─ public/                        ← 原样拷贝的静态资源
│  ├─ assets/videos/              ← 【新增】壁纸视频（原片 + 兜底）
│  ├─ favicon/imiss-*.png         ← 【P1 已落地】临时 favicon（32/128/180/192）
│  └─ images/posts/<slug>/        ← 【P4 已落地】文章内图片（不进优化管线）
├─ src/content/posts/             ← 【P4 已落地】**只剩迁移进来的 10 个分类目录**；
│                                    上游示例文章 14 篇已按发起人要求删除（恢复：`git show 76a49ec:src/content/posts/firefly.md`）
├─ scripts/
│  ├─ make-logo.mjs               ← 【P1 已落地】把 imiss-logo.svg 栅格化成 Logo 与 favicon
│  ├─ verify-ui.mjs               ← 【P1 已落地】界面验收（CDP 断言 + 截图，零依赖）
│  ├─ verify-docs.mjs             ← 【v1.12 已落地】文档一致性自检（文档 ↔ 仓库事实）
│  ├─ make-rank-cover-guide.mjs   ← 【v1.13 已落地】榜单配图比例对照图
│  ├─ convert-wallpaper.mjs       ← 【P3 已落地】壁纸图 → webp（dosc/photo → imiss-d*/m*）
│  ├─ import-posts.mjs            ← 【P4 已落地】旧笔记迁移（dry-run 默认，见 §9.2）
│  ├─ verify-posts.mjs            ← 【P4 已落地】内容校验（阻断式，见 §9.4）
│  └─ export-agent-data.mjs       ← 【新增】给 Agent 导出索引
├─ deploy/nginx.conf              ← 【新增】生产站点配置
├─ reports/                       ← 【新增，.gitignore 已忽略】脚本产出：reports/screenshots/*.png、reports/import-report.json、reports/image-mapping-*.json
├─ src/assets/fonts/*.woff2       ← 【P0 已落地】本地字体（11 个，约 205KB）
├─ src/assets/images/pet/         ← 【P1 已落地】桌宠图集（P3 会用它做桌宠，Logo 也从这里裁）
└─ agent/                         ← 【新增】Python Agent 服务（见 §8）
```

> 模板目录 `my_-blog\Blog template` 的内容会**复制进工作区根**（不带它自己的 `.git`），工作区保留现有 gitee 远端。
> 复制结果已在 P0 用逐文件 SHA256 验证：`src/` 390 个文件与源模板完全一致。

### 3.2 模板源码中会被改动的部分

```
src/
├─ config/
│  ├─ siteConfig.ts               ✏️ 站点名/描述/主题色/site_url/pages 开关
│  ├─ navBarConfig.ts             ✏️ 导航树与链接预设（改动最大的一处）
│  ├─ backgroundWallpaper.ts      ✏️ 壁纸（图片期/视频期两套配置）
│  ├─ sidebarConfig.ts            ✏️ 日历热力图关闭
│  ├─ index.ts                    ✏️ 导出新的 rankConfig / petConfig
│  ├─ rankConfig.ts               ➕ 排行数据（唯一需要手工维护的数据文件）
│  ├─ petConfig.ts                ➕ 桌宠开关、缩放、台词、Agent 地址
│  ├─ pioConfig.ts                ⛔ 不改，但两个看板娘保持 enable: false
│  └─ commentConfig.ts            ⛔ 不改（保持 type: "none"）
├─ types/
│  ├─ rankConfig.ts               ➕
│  ├─ petConfig.ts                ➕
│  └─ sidebarConfig.ts            ✏️ `SiteInfoConfig` 增加 `placeholder`（注意：类型真身在这里，`config.ts` 只是 barrel，见 §14.3 T1）
├─ components/
│  ├─ widget/SiteStats.astro      ✏️ 删除「运行时长」「最后活动」及其客户端脚本
│  ├─ widget/SiteInfo.astro       ✏️ 占位模式
│  ├─ features/AemeathPet.astro   ➕ 桌宠（DOM + 样式 + 脚本）
│  ├─ pages/rank/RankBoard.astro  ➕ 榜单板（切换与入场动效也在它的内联脚本里）
│  └─ comment/index.astro         ⛔ 不改（留言页复用其"未配置"分支）
├─ layouts/Layout.astro           ✏️ 仅插入一行 <AemeathPet />（§7.2 给出位置）
├─ pages/
│  ├─ rank/index.astro            ➕ 重定向到 /rank/jp/
│  ├─ rank/jp.astro               ➕ 日漫排行
│  ├─ rank/cn.astro               ➕ 国漫排行
│  ├─ rank/game.astro             ➕ 二游排行（单一榜：data 是数组，页面没有维度切换）
│  ├─ friends.astro / bilibili.astro / bangumi.astro / sponsor.astro
│  │                              ⛔ 不改代码，靠 pages 开关关掉（返回 404）
│  └─ about.astro                 ⛔ 不改（导航移入「我的」）
├─ content/
│  ├─ posts/**                    ➕ 迁移来的文章
│  └─ spec/guestbook.md           ✏️ 留言页文案
├─ assets/
│  ├─ fonts/*.woff2               ✅ 本地字体（P0 已落地：3 个字体 11 个 woff2，约 205KB；**放 src 而非 public**，见 §14.3 T16）
│  ├─ images/
│  │  ├─ logo/imiss-logo.svg      ✅ 站点标识**设计源**（手写矢量，P1 修订；改它 + `pnpm make:logo` 重新出图）
│  │  ├─ logo/imiss-{light,dark}.webp  ✅ 栅格化产物（导航栏用，256×256）
│  │  ├─ DesktopWallpaper/imiss-*.webp  ➕ 壁纸图（临时）
│  │  ├─ rank/<slug>.webp         ➕ 排行榜条配图
│  │  └─ pet/pet-aemeath.webp     ✅ 桌宠图集（P1 提前入库，P3 使用；Logo 已不再从它裁）
├─ config/fontConfig.ts           ✅ 已改：三个字体改 `local` provider（P0，见 §14.3 T16）
└─ utils/
   └─ pet-agent-client.ts         ➕ 桌宠 ↔ Agent 适配层（唯一与后端耦合的文件）
   ⛔ utils/feed-utils.ts         ❌ 已删（R-ID-06 订阅功能移除；恢复清单见 §14.4）
```

> 图例：✏️ 改现有文件　➕ 新增文件　⛔ 明确不改

---

## 4. 改动落点总表（需求 → 文件 → 做法）

| 需求 | 文件 | 做法 | 关键实现细节 |
| --- | --- | --- | --- |
| R-ID-01 R-ID-03 | `src/config/siteConfig.ts` | 改值 | `title`/`subtitle`/`description`/`keywords` 重写；`navbar.title = "IMiss Blog"`；`site_url` 先填占位域名并在 `PROJECT_STATUS.md` 登记 |
| R-ID-05 | `src/config/siteConfig.ts` | 改值（清空示例凭据） | 清空 `mal.username` / `mal.clientId`（**去掉那个前导制表符**）/ `vndb.userId` / `bangumi.userId` / `bilibili.uid`；这些是上游示例值，其中 `mal.clientId` 形如真实凭据（见 §14.3 T3） |
| R-ID-02 | `src/config/siteConfig.ts` | 改值 | `themeColor.hue: 165 → 345`；改完必须亮/暗两套都看一遍对比度 |
| R-ID-04 | `src/assets/images/logo/imiss-logo.svg`（手写矢量，设计源）+ `scripts/make-logo.mjs`（栅格化）+ `siteConfig.navbar.logo` / `siteConfig.favicon` | 新增设计源 + 改脚本 + 改值 | **P1 修订**：原方案是从桌宠像素图集裁头像，发起人要求换掉 → 改为**手写 SVG 标识**（粉色晶体心 + 青色四角星芒 + 机械翼片 + 深蓝紫方圆底，深浅两套导航栏都成立），由 `make-logo.mjs` 用 sharp 栅格化成 `imiss-{light,dark}.webp`（256×256）与 `imiss-{32,128,180,192}.png`。为什么必须栅格化：favicon 与 OG 流程要 PNG，导航栏 Logo 走 Astro 图片管线只吃位图。改设计只需改那一个 SVG 再跑 `pnpm make:logo` |
| R-ID-06 | 删 5 个文件 + 改 4 处接线 | 删文件 + 改配置 | 删：`src/pages/{rss,atom}.astro`、`src/pages/{rss,atom}.xml.ts`、`src/utils/feed-utils.ts`。改：`Layout.astro` 去掉 head 里两条 `<link rel="alternate">`；`Footer.astro` 去掉 RSS/Atom（保留 Sitemap）；`backgroundWallpaper.ts` 的 `homeText.linksEnable: false` + `links: []`；`profileConfig.links: []`（`Profile.astro` 对 0 个链接不渲染整行，布局不会塌）。`siteConfig.feed` 配置块已注释掉并标注"无消费方"（保留上游类型定义）。**恢复清单见 §14.4**。注意：这 4 条路由删掉后是**真 404**，与 R-NAV-05/06 的 noindex 存根行为不同（因为文件不存在，没有任何页面去 redirect） |
| R-ID-07 | `src/config/displaySettingsConfig.ts`（上游文件，**只改 `enable` 一个值**）+ `src/components/controls/DisplaySettingsIntegrated.svelte`（面板本体 38.4KB，**未改**） | 改 1 个值 | **上游自带、默认关闭**；从 P0 基线（`3dbc38d`）到开启前的 `git diff` 证明这批文件一个字节都没改过——不是被删，是默认关着。**发起人已决定对访客全开**（2026-09-24，原话"肯定要这个啊"）→ `enable: true`，其余条目保持开启。备用开启方式：环境变量 `PUBLIC_DISPLAY_SETTINGS=true`（优先级更高；实测 dev 下按钮与面板都在，未设变量的 `dist` 为 0）。**成本已实测**：全开（含 `wallpaperModeSwitchable`）→ 每页 HTML **+11.6 KB**（38 页共 +439.7 KB，dist 20.76→21.19 MB），`_astro/*.js` 总量无变化；**比上游注释估的 +33 KB/页低得多**。**注意**：面板"主题色相"改的就是 `--hue`，`siteConfig` 的 345 只是默认值，访客拖过会写进自己的 localStorage。**面板本身的改进待排期**（发起人：先做完 P2/P3） |
| R-ID-08 | `src/config/licenseConfig.ts` + `src/components/widget/SiteInfo.astro` | 改值 + 改组件 | `licenseConfig.enable: true → false`（发起人 2026-09-24："这个许可协议似乎没有啥用啊"）；`SiteInfo.astro` 里许可那一项**改成条件展开**（`...(enable ? [{…}] : [])`）——原来关闭时会显示一个 `None` 假值。文章页的许可块由 `posts/[...slug].astro` 的 `licenseConfig.enable &&` 控制，配置一关就整块不渲染，**不用改页面**。想恢复：`enable: true` |
| R-ID-09 | `src/config/siteConfig.ts` 的 `post.share`（**保持 `true`**）+ `src/components/misc/SharePoster.svelte`（**未改**） | 只加注释，不改行为 | 发起人 2026-09-24 评审时先问"这个二维码扫了也没啥用啊"，随后澄清"**我要分享块啊**，只是后面提醒我添加域名而已" → **分享块保留**。真正的临时问题在数据：`SharePoster.svelte` 用 `url={Astro.url.href}` 生成二维码、「复制链接」也用它，而 `site_url` 还是 `https://imiss.example.com`（B-01）→ 域名到位前扫码/复制指向假域名。**域名到位后三步**：`site_url` 填真值 → 重建 → 把 `verify:ui` 的占位域名断言翻成真值断言（**执行方要主动提醒**，见 `PROJECT_STATUS.md` §1 第 6 条） |
| R-NAV-01 ~ R-NAV-06 | `src/config/navBarConfig.ts` | 重写 `getDynamicNavBarConfig()` 与 `LinkPresets` | 见 §4.1 的最终导航树。**P1 已落地**，另附带两处改名收尾：`i18n/languages/zh_CN.ts` 里 `vndb`→「轻小说」、`mal`→「番剧」，以及两个页面"未配置数据源"的文案（否则导航叫「轻小说」而页面标题还叫 VNDB，自相矛盾） |
| R-NAV-07 | `src/config/siteConfig.ts` 的 `pages` | 改值 | 见 §4.2 的开关矩阵；`nav-menu-utils.ts`、sitemap 过滤、`llms.txt.ts` 都已按 `pageKey` 处理，**无需改代码**。⚠️ 关闭的页面在**静态输出**下不是 HTTP 404，而是 Astro 的 noindex 跳转存根，真 404 由生产 Nginx 给（§12.2、§14.3 T17） |
| R-WDG-01 | `src/components/widget/SiteStats.astro` | 删代码 | `stats` 数组删掉 `running-days`/`last-update` 两项；随之删除 `getActivityDate`/`lastActivityDate`/`lastPostDate`/`siteStartDate`/`todayText` 与整个 `<script is:inline>` 块（不再有动态项）；`formatNumber` 保留给总字数用 |
| R-WDG-02 | `src/config/sidebarConfig.ts` | 改值 | 日历组件 `specificConfig.calendar.showHeatmap: true → false` |
| R-WDG-03 | `src/types/sidebarConfig.ts` + `src/components/widget/SiteInfo.astro` | 改类型 + 改组件 | ⚠️ **实测纠正**：`WidgetSpecificConfig` 与 `SiteInfoConfig` 的真身在 `src/types/sidebarConfig.ts:37-52`，`src/types/config.ts` 只是 barrel（re-export，**不用改**）。在 `SiteInfoConfig`（现只有 `unknownBuildPlatform` 一个字段）上加 `placeholder?: boolean`；`SiteInfo.astro` 在占位模式把"构建平台/系统架构/构建时间/CI"等值替换为 `—`，卡片底部加一行「部署后自动填充」；本地配置项（文章许可）照常显示 |
| R-WDG-04 | `src/config/sidebarConfig.ts` | 不改（确认清单） | 保持左侧 `profile`/`announcement`/`music`/`categories`/`tags`，右侧 `dynamic`/`stats`/`siteInfo`/`calendar`/`sidebarToc`，两个 `advertisement` 保持 `enable: false`；移动端底部组件保持现状 |
| R-BG-01 | `scripts/convert-wallpaper.mjs`（新增）+ `src/assets/images/DesktopWallpaper/imiss-d*.webp` + `backgroundWallpaper.ts` | 新增 + 改值 | 见 §6.1 |
| R-BG-02 | `backgroundWallpaper.ts`（`src.playerUrl`）+ `public/assets/videos/*` | 改值 + 新增资源 | 见 §6.2 |
| R-BG-03 | `backgroundWallpaper.ts` 的 `common.homeText` | 改值 | ⚠️ **P1 已提前处理一部分**（因为它是"站点身份 + 打赏移除"的盲区，见 §14.3 T18）：横幅 `links` 里上游作者的 GitHub / 邮箱 / **Sponsor 打赏入口**已全部删除，换成 RSS + Atom；主标题从 `Lovely firefly!` 换成本站名占位。**正式横幅文案仍等发起人定稿（B-10）** |
| R-BG-04 | `backgroundWallpaper.ts` 的 `banner.position` + `common.dimOpacity` | 改值 | `position` 控制 cover 取景锚点（默认 `"0% 20%"` 保头脸），`dimOpacity` 控制暗罩（默认 0.2）；换素材后按 §6.4 复量 |
| R-RANK-01 ~ R-RANK-07 | 见 §5.2 文件清单 | 新增为主 | 复用 `ImageWrapper.astro` 解析配图（组件里另做一次存在性判定，见 §5.6），不新造图片机制 |
| R-PET-01 ~ R-PET-05 | `src/components/features/AemeathPet.astro`（新增）+ `petConfig.ts`（新增）+ `Layout.astro` 插一行 | 新增 + 插一行 | 见 §7；`Layout.astro` 只在 `<WavesEffect />` 之后插 `<AemeathPet />` |
| R-AGT-01 ~ R-AGT-06 | `agent/**`（新增）+ `src/utils/pet-agent-client.ts`（新增） | 新增 | 见 §8 |
| **R-AGT-07**（P5-0） | `src/config/agentConfig.ts`（新增）+ `src/types/agentConfig.ts`（新增）+ `scripts/verify-agent.mjs`（新增）+ `src/config/index.ts`（挂 barrel） | **新增配置与契约测试，不写业务逻辑** | 见 **§8.9**。`enable` 保持 `false`（P5-0 阶段桌宠仍走 `petConfig.mockReplies`，一个请求都不发）；`baseUrl`/`graphId`/`timeoutMs`/`resumeWords`/`fallbackToMock`/`debug` 六个字段只放"能被改的值"。契约测试零依赖、服务没起时 SKIP 且**退出码 0**、契约不符**退出码 1** |
| R-CNT-01 ~ R-CNT-08 | `scripts/import-posts.mjs`、`scripts/verify-posts.mjs`（新增）+ `src/content/posts/**`、`public/images/posts/**` | 新增 | 见 §9 |
| R-CMT-01 R-CMT-02 | `src/config/commentConfig.ts`（不动）+ `src/content/spec/guestbook.md`（改文案） | 改内容 | 评论系统保持 `type: "none"`，留言页自动落到 `commentNotConfigured` 分支，显示"评论未配置"占位卡片；留言页说明文案在 `guestbook.md` 里重写 |
| R-DEP-01 ~ R-DEP-04 | `deploy/nginx.conf`（新增）；R-DEP-04 另需 `src/config/fontConfig.ts`（改 provider）+ `package.json`（加 `@fontsource/*` 依赖） | 新增 + 改配置 | 见 §12、§14.3 T16 |

### 4.1 最终导航树（`navBarConfig.ts`）

```
主页            /                      （LinkPresets.Home，原样保留）
文章 ▾          归档 /archive/ · 分类 /categories/ · 标签 /tags/ · 系列 /series/
排行 ▾ 【新增】  日漫排行 /rank/jp/ · 国漫排行 /rank/cn/ · 二游排行 /rank/game/
                                                   ← 放在「文章」与「我的」之间
我的 ▾          动态 /dynamic/ · 项目 /projects/ · 相册 /gallery/ · 书签导航 /booknav/
                轻小说 /vndb/（原 VNDB，改名不改功能） · 番剧 /myanimelist/（原 AnimeList）
                关于我 /about/                                    ← 必须最后一项
链接 ▾          外链列表（内容待提供）
留言            /guestbook/                                        ← 原「社交」父项删除，本项最后
```

实现要点：

1. **删除「社交」父项**，把 `LinkPresets.Guestbook` 作为顶层 `links.push({...LinkPresets.Guestbook})`，位置在所有项之后。
2. **删除「关于」父项**：`LinkPresets.Sponsor` 与 `LinkPresets.About` 不再出现在 `links` 里；`About` 作为 `我的` 的最后一个 child。
3. **改名两项**：`LinkPresets.VNDB.name = "轻小说"`、`LinkPresets.MAL.name = "番剧"`（URL、`pageKey`、图标都可保留，`VNDB` 的图标可换成 `material-symbols:menu-book` 之类更贴切的）。
4. **新增三个预设**（放在 `LinkPresets` 里，便于复修）：
   ```ts
   RankJP:   { name: "日漫排行", url: "/rank/jp/",   icon: "material-symbols:emoji-events" },
   RankCN:   { name: "国漫排行", url: "/rank/cn/",   icon: "material-symbols:military-tech" },
   RankGame: { name: "二游排行", url: "/rank/game/", icon: "material-symbols:sports-esports" },
   ```
   注意：排行页是**新增页面**，不属于 `siteConfig.pages` 的开关体系（那套开关只覆盖模板自带页面），所以这三个预设**不带 `pageKey`**。
   ⚠️ 加子项时**必须同时建好路由**（`src/pages/rank/<id>.astro`），否则导航里就是一个死链；`pnpm verify:docs` 会核对"导航子项 ↔ 实际路由"两边一致。
5. 未使用的预设（`Friends`/`Bilibili`/`Bangumi`/`Sponsor`）从 `LinkPresets` 中删除，避免以后被误引用；对应页面文件保留（靠开关关掉）。

### 4.2 页面开关矩阵（`siteConfig.pages`）

| key | 值 | 结果 |
| --- | --- | --- |
| `friends` | `false` | 友链页 404，不进导航/sitemap/llms.txt（R-NAV-05） |
| `guestbook` | `true` | 留言页保留（R-NAV-01、R-CMT-01） |
| `dynamic` | `true` | 动态页保留（本地 `src/content/dynamic/*.md` 数据源） |
| `projects` | `true` | 项目页保留 |
| `gallery` | `true` | 相册页保留 |
| `booknav` | `true` | 书签导航保留 |
| `bilibili` | `false` | 哔哩哔哩页 404（R-NAV-03） |
| `bangumi` | `false` | 番组计划页 404（R-NAV-03） |
| `vndb` | `true` | 轻小说页开启（需 `userId`，见阻塞项） |
| `mal` | `true` | 番剧页开启（需 `username` + `clientId`，见阻塞项） |
| `sponsor` | `false` | 打赏页 404，**文章页打赏按钮同时消失**（`posts/[...slug].astro` 用 `pages.sponsor` 判定，R-NAV-06） |

> 除了直接改文件，也支持 `PUBLIC_PAGES_<KEY>=false` 环境变量覆盖（`src/utils/page-toggle-utils.ts`），部署平台可不开文件就关页面。

### 4.3 数据来源与"构建期是否联网"对照

| 页面 | 数据来源 | 构建期联网 | 说明 |
| --- | --- | --- | --- |
| 轻小说 `/vndb/` | VNDB API（`mode: "dynamic"`） | ❌ 不联网 | 客户端实时拉取；封面下载脚本有**四重短路**：`pages.vndb` 关闭 / `userId` 为空或是 `you-user-id` / `downloadCovers: false` / `mode !== "static"`（实测 `generate-vndb-covers.ts:101-119`） |
| 番剧 `/myanimelist/` | MAL API（构建期） | ⚠️ 配置了凭据才联网 | `myanimelist.astro:48-49` 里 `isConfigured = username && clientId` 为假时**整段跳过**（`:101` 包住全部请求），页面显示未配置状态 |
| GitHub 卡片 | `api.github.com`（构建期，按正文里的 `::github{repo=...}` 指令） | ⚠️ 会尝试联网，但**失败不阻断** | `generate-github-card-data.ts:54` 会请求，`:95` 失败时打印 `[GITHUB-CARD] Failed to refresh …; keeping cached data.` 并保留已提交的 `src/constants/github-card-data.json`。**本站迁移后正文不含该指令，这一步即空转** |
| 排行 `/rank/*` | `src/config/rankConfig.ts` | ❌ | 纯本地数据 |
| 动态 `/dynamic/` | `src/content/dynamic/*.md` → `/api/dynamic.json` | ❌ | 也可切到 Memos（本项目不用） |

---

### 4.4 需求覆盖矩阵（可核对）

上表的区间写法便于阅读，这里逐条列出 50 条需求各自唯一的落点，便于评审时一条条对：

| 落点（文件 / 位置） | 覆盖需求 | 详见 |
| --- | --- | --- |
| `src/config/siteConfig.ts` | R-ID-01 / R-ID-02 / R-ID-03 / R-ID-05 / R-NAV-05 / R-NAV-06 / R-NAV-07 | §4.2 |
| `src/assets/images/logo/imiss-logo.svg`（设计源）+ `imiss-*.webp` + `public/favicon/imiss-*.png` + `scripts/make-logo.mjs` | R-ID-04 | §4 |
| `src/i18n/languages/zh_CN.ts`（页面名与未配置文案） | R-NAV-03 | §4 |
| `src/config/navBarConfig.ts` | R-NAV-01 / R-NAV-02 / R-NAV-03 / R-NAV-04 | §4.1 |
| `src/components/widget/SiteStats.astro` | R-WDG-01 | §4 |
| `src/config/sidebarConfig.ts` | R-WDG-02 / R-WDG-04 | §4 |
| `src/types/sidebarConfig.ts` + `src/components/widget/SiteInfo.astro` | R-WDG-03 | §4 |
| `scripts/convert-wallpaper.mjs` + `src/assets/images/DesktopWallpaper/*` + `backgroundWallpaper.ts` | R-BG-01 / R-BG-03 / R-BG-04 | §6.1 |
| `public/assets/videos/*` + `backgroundWallpaper.src.playerUrl` | R-BG-02 | §6.2 |
| `src/pages/rank/index.astro` / `jp.astro` / `cn.astro` | R-RANK-01 | §5.2 |
| `src/pages/rank/game.astro` + `rankConfig.boards.game`（单一榜） | R-RANK-07 | §5.2、§5.3 |
| `RankBoard.astro` 的内联脚本 + URL 契约（`?kind=`） | R-RANK-02 | §5.4 |
| `src/components/pages/rank/RankBoard.astro` + `src/styles/pages/rank.css` | R-RANK-03 / R-RANK-05 / R-RANK-06 | §5.5、§5.6 |
| `src/config/rankConfig.ts` + `src/types/rankConfig.ts` | R-RANK-04 | §5.3 |
| `src/components/features/AemeathPet.astro` + `petConfig.ts` + `pet-utils.ts`（`PET_MOOD_STATES` 等帧率口径）+ `src/utils/pet-chat-text.ts`（`cleanMarkdown()`）+ `Layout.astro` 一行 | R-PET-01 / R-PET-02 / R-PET-03 / R-PET-05 / R-PET-06 / R-PET-07 / R-PET-10 / R-PET-11 | §7.1~§7.6 |
| `pioConfig.ts` 保持关闭 + 互斥注释 | R-PET-04 | §7.5 |
| `agent/src/agent/**`（含 `persona.txt`） | R-AGT-01 / R-AGT-06 | §8.3 |
| `agent/src/gateway/**` | R-AGT-02 / R-AGT-05 | §8.4、§8.5 |
| `src/utils/pet-agent-client.ts` | R-AGT-03 / R-AGT-04 | §8.6 |
| `scripts/import-posts.mjs` | R-CNT-01 / R-CNT-02 / R-CNT-03 / R-CNT-05 / R-CNT-07 | §9.2、§9.3 |
| `scripts/verify-posts.mjs` | R-CNT-06 | §9.4 |
| 去重规则 + 只读约定 | R-CNT-04 / R-CNT-08 | §9.1、§9.5 |
| `src/content/spec/guestbook.md` + `commentConfig.ts`（保持 `none`） | R-CMT-01 / R-CMT-02 | §4 |
| `deploy/nginx.conf` | R-DEP-01 / R-DEP-02 | §12.2、§12.3 |
| 部署后回填清单 | R-DEP-03 | §12.4 |
| 构建期无外网约束 | R-DEP-04 | §2、§4.3、§14.3 T16 |
| 删除订阅功能（残留接线清干净） | R-ID-06 | §4、§14.4 |
| 显示设置面板（调色盘 / 界面结构管理） | R-ID-07 | §4 |

---

## 5. 排行子系统（R-RANK）

### 5.1 设计目标

- 视觉对齐参考图 `dosc\排行\*.jpg` 的"榜单板"：**名次 + 剧照背景 + 标题**。
- **不做**右侧的得票率、升降箭头、涨幅（发起人明确不要）。
- 数据只有一期、由作者手工维护；改数据不需要碰组件与样式。
- 「全剧 / 单集」两个维度，状态写进 URL 可分享；**二游排行没有维度**（单一榜，R-RANK-07）。

### 5.2 文件清单

| 文件 | 作用 |
| --- | --- |
| `src/types/rankConfig.ts` | 类型定义 |
| `src/config/rankConfig.ts` | **唯一需要手工维护的数据文件**（日漫/国漫各 2 组维度数据 + 二游 1 份名单 + 文案） |
| `src/config/index.ts` | 增加 `export { rankConfig } from "./rankConfig";` 与类型导出 |
| `src/components/pages/rank/RankBoard.astro` | 榜单板渲染（接收 board + kind + kindLabels + dataStatus）；**「全剧 / 单集」切换、入场动效、配图存在性判定都写在这个组件里**（切换用 `<script is:inline>`，原计划的 `RankTabs.svelte` 已放弃，理由见 §5.4） |
| `src/styles/pages/rank.css` | 榜单板全部版式（两档名次色、行高/名次列比例、scrim、缺图占位、移动端、入场动效） |
| `src/pages/rank/index.astro` | `return Astro.redirect("/rank/jp/")` |
| `src/pages/rank/jp.astro` | 读取 `rankConfig.boards.jp`，渲染 `<RankBoard>` |
| `src/pages/rank/cn.astro` | 读取 `rankConfig.boards.cn`，渲染 `<RankBoard>` |
| `src/pages/rank/game.astro` | 二游排行（R-RANK-07）：同一套榜单板，数据是单一数组 → 组件不渲染维度切换 |
| `src/assets/images/rank/*.webp` | 条目配图（可选，缺图走占位）。现有的 `_demo-01.webp` / `_demo-02.webp` 是**演示图**，只在 `rankConfig` 的占位数据里引用，填真数据时一并删掉 |

### 5.3 数据模型

```ts
// src/types/rankConfig.ts（与真实文件一致，P2 完成后复核）
export type RankKind = "all" | "ep";           // 全剧 / 单集

export interface RankEntry {
  title: string;        // 必填，显示在剧照上的标题
  original?: string;    // 可选，日文原名或副标题
  note?: string;        // 可选，一句话短评（右端小胶囊）
  cover?: string;       // 可选，形如 "assets/images/rank/frieren.webp"（src 相对路径）
}

export interface RankBoardConfig {
  id: string;           // 短标识，同时用于路由 /rank/<id>/
  title: string;        // 页面主标题，如「日漫排行」
  description?: string; // 页面副标题
  labels?: Partial<Record<RankKind, string>>;  // 覆盖默认的「全剧 / 单集」
  /**
   * 两种形态（判据 Array.isArray）：
   *  · Record<RankKind, RankEntry[]> —— 有「全剧 / 单集」两个维度（日漫、国漫）
   *  · RankEntry[]                  —— 单一榜，页面没有维度切换（二游排行，R-RANK-07）
   */
  data: Record<RankKind, RankEntry[]> | RankEntry[];
}

export interface RankConfig {
  kindLabels: Record<RankKind, string>;         // 有维度的榜共用一套维度名称
  dataStatus: "placeholder" | "final";          // placeholder 时页面显示"当前为占位数据"
  boards: Record<string, RankBoardConfig>;
}
```

**约定**

- 数组顺序 = 名次，第 1 项是第 1 名；不写名次数字。
- **单一榜不引入假维度**：二游排行在 `rankConfig` 里直接写数组，组件按 `Array.isArray(board.data)` 决定是否渲染切换按钮——不要靠 `board.id === "game"` 这类硬编码判断（加榜时容易忘）。类型收窄必须在**同一个表达式**里做 `Array.isArray` 判断（先存进布尔变量再判，TS 收窄不到，`board.data[k]` 会报 ts(7053)）。
- `cover` 用**不带前导 `/`** 的相对路径（与 `siteConfig` 里壁纸写法一致），交给 `ImageWrapper` 的 glob 解析；以 `/` 开头则视为 `public` 资源原样引用。
- 没有 `cover`、或 `cover` 指向的文件不存在时渲染主题色渐变占位（§5.5/§5.6），不出现裂图。
- 数据规模按 10~30 条/榜设计，不做分页。

### 5.4 页面与交互

```astro
---
// src/pages/rank/jp.astro（cn.astro / game.astro 同构，只换 board id）
// game.astro 的区别只有一个：它的 data 是数组（单一榜），组件因此不渲染维度切换
import RankBoard from "@/components/pages/rank/RankBoard.astro";
import { rankConfig } from "@/config";
import MainGridLayout from "@/layouts/MainGridLayout.astro";
import "@/styles/pages/rank.css";

const board = rankConfig.boards.jp;
if (!board) return Astro.redirect("/404/");     // 数据被删时别炸在页面里
---
<MainGridLayout title={board.title} description={board.description ?? ""}>
  <div class="card-base ..."><RankBoard board={board} kindLabels={rankConfig.kindLabels} dataStatus={rankConfig.dataStatus} /></div>
</MainGridLayout>
```

**切换行为（P2 实现，与原计划的差异已在这里对齐）**

> **改动说明**：原计划用 `RankTabs.svelte`（Svelte 岛）做切换，实测后改成组件内的 `<script is:inline>`，**没有新增 Svelte 岛**。两个理由：
> ① 站是静态输出，服务端**读不到 `?kind=`**——SSR 只能先渲染「全剧」，若交给 Svelte 在 `onMount` 里纠正，会先闪一下「全剧」再跳；内联脚本在**解析期**就落定，无闪烁。
> ② 两个按钮的显隐切换不值得付一次 hydration；两组面板都在 DOM 里，切换零请求。

**单一榜（二游排行，R-RANK-07）**：`data` 是数组时组件只生成**一块面板**、整个不渲染 `.rank-tabs`，内联脚本里所有与维度切换有关的代码（`apply`/`kindFromUrl`/click/键盘/popstate）都跳过；入场动效照旧运行（守卫条件是"有面板"而不是"有按钮"，第一版写成后者会让单一榜丢掉动效）。

1. 服务端固定渲染「全剧」为初始选中态（`kind` prop 默认 `"all"`）。
2. 客户端脚本在**解析期**读 `location.search` 里的 `?kind=` 并纠正选中态（直接打开分享链接就是对的榜单；实测面板翻转约 63ms，早于首帧 80ms，不会闪一下「全剧」）。
3. 两个面板的 DOM **都输出**，靠 `rank-panel--off` 这个 class 显隐（规则挂在 `html[data-rank-js="1"]` 上，见 T24 —— **不用 `hidden` 属性**，否则 Tailwind preflight 的分层 `!important` 会让"打印/无 JS 也要显示"的兜底静默失效）。
4. 点击切换：`history.pushState` 更新 `?kind=`（**只在维度真的变了时写历史**，连点同一个按钮不会堆历史记录）→ 浏览器后退能回到上一个维度；`popstate` 复用面板实例上的 `apply()`。
5. 语义用 `role="tablist" / role="tab" / aria-selected` + **roving tabindex**（只有选中的那个能 Tab 进来，←/→ 切换并聚焦）；非当前面板加 `aria-hidden="true"` 与 `inert`（键盘/读屏都进不去，不只是"看不见"）。
6. Swup 切页时容器内脚本会重跑（`@swup/scripts-plugin`）+ `astro:page-load` 再触发一次 → 每个 root 用 `root.dataset.rankReady` 做**幂等守卫**。⚠️ 少这一层守卫就会把 click 绑两遍、一次点击 pushState 两次、后退一次回不到上一个榜单（P2 独立审查抓到的阻断缺陷）；`window.__rankTabsInit` 只挡 document 级监听，挡不住"同一个 root 绑两遍"。另外 Swup 4.9.2 **没有** `swup:contentReplaced` 事件，别去监听它。

### 5.5 视觉规格（对齐参考图）

| 部位 | 规格（括号内为量自参考图的实测值） |
| --- | --- |
| 榜单块 | 单列，最大宽度跟随内容栏；块整体圆角 `var(--radius-large)`、`overflow: hidden`，块内行与行之间只留一条深色缝 |
| 行容器 | `display: grid; grid-template-columns: var(--rank-badge-w) minmax(0, 1fr);`；**行高 = 内容宽的 1/5.7**（实测 96px / 图宽 551px = 17.4%）、**名次列 = 内容宽的 13.7%**（实测 75px）。实现见下方"比例必须用 cqw"；行间距 **2~4px**（实测相邻行几乎紧贴）；行自身圆角 **2px**（参考图行是近直角，只有整块是圆角） |
| 名次列 | 宽度 = 内容宽的 **13.7%**（实测 75px）≈ 行高的 0.78 倍；底色纯色填充，数字水平垂直居中 |
| 名次数字 | 字号 = 行高的 0.52（再用名次列宽 0.72 倍兜住窄屏，防止两位数顶出格子），字重 800，`font-variant-numeric: tabular-nums`；**颜色随档位变**：1~3 名白色，4 名以后 `#14100b` |
| **名次底色（两档，不是金银铜）** | **1~3 名：粉 `#E2696B`**（参考图实测 `#EA7B7C`，采样区间 `#E78278`/`#EE7B7E`/`#EC7979`/`#E87E7E`；但白字压 `#EA7B7C` 只有 **2.76:1**、不达 WCAG AA 大字 3:1，因此加深一档到 `#E2696B` = **3.25:1**，肉眼几乎无差别）；**4 名及以后：橙 `#EFA662`**（实测 `#EBA972`/`#EFA965`/`#F0A667`/`#F1AB66`/`#EFA661`，深色数字压上去 9.29:1）。两档色写成 `rank.css` 顶部的 CSS 变量便于调整；正文里不做金银铜 |
| 剧照层 | 整行铺满：`ImageWrapper`（`showOverlay={false}`）+ 自己的一层 scrim；标题区加暗罩保证白字可读（水平方向由左向右可略变浅），左缘与名次列用 `mask-image: linear-gradient(90deg, transparent, #000 14%)` 自然衔接 |
| 标题 | 白字 + `text-shadow: 0 1px 2px rgb(0 0 0 / .6)`；字号 = 行高的 0.27（实测约 26px / 96px，上限 32px）；粗体 700；起始位置紧跟名次列留一个小间距；最多折 2 行（`-webkit-line-clamp: 2`，参考图第 5 名就是两行） |
| 原名 | 标题下方一行小字，字号 = 行高的 0.13（上限 17px）、`rgba(255,255,255,.78)`；数据里没有就不占位 |
| 短评胶囊 | **参考图里没有这一列**，所以默认不渲染；只有数据里写了 `note` 才在右端显示一枚小胶囊（窄屏隐藏）。它是网格的第 2 列（不是绝对定位），**永远不会压住标题**；宽度上限用 `40cqw` 这类长度（`%` 会把 auto 轨道里的它压扁，见 T26） |
| **条目配图（背景版）—— 交付规格** | 每个名次**一张**图，作为整行背景（`object-fit: cover` + 居中，标题白字压在上面）。**推荐比例 5.7:1**（= 行宽÷行高；1440 屏实测 629×109px = 5.77:1），**推荐尺寸 1600×280**，**单张 ≤150KB**（每页 10 张 ≤1.5MB，`prd.md` §6.1）。格式不限：**jpg / png / webp / avif 都行**（Astro 构建期自动出 webp/avif 多档 + 生成 LQIP 占位色，实测 1600×914 的 JPG 会产出 6 档 webp）。命名建议 `榜单-维度-名次`：`jp-all-01.jpg`、`jp-ep-03.jpg`、`cn-all-01.jpg`、`game-01.jpg`（二游无维度），放进 `src/assets/images/rank/`。**给 16:9 截图也能用**，但会被居中裁掉约 70% 的高度（只留中间一条）——对照图见 `docs/imiss/rank-cover-guide.png`（由 `node scripts/make-rank-cover-guide.mjs` 生成）；某张图必须换取景点时告诉执行方，**暂时不加 `position` 字段**（发起人 2026-09-24 明确不要，等真有需要再加） |
| 缺图占位 | **先铺不透明深色底** `hsl(var(--hue) 28% 20%)`，再叠 `linear-gradient(120deg, hsl(var(--hue) 62% 58% / .5), hsl(calc(var(--hue) + 40) 52% 44% / .42), hsl(calc(var(--hue) - 25) 58% 34% / .5))` + 一层极淡的点阵纹理（`radial-gradient` 平铺）。**深底是关键**：半透明渐变直接罩在卡片底上时，亮色主题下是浅粉、白字会糊（P2 亮色截图实测踩到，已改为不透明深底并加断言） |
| 浅色主题 | 剧照上的白字方案两套主题通用；scrim 不变，只把 1~3 名的粉调深一档（`#e2696b`）以提高白字对比度。**缺图占位靠上面的不透明深底保证两套主题一致**（`verify:ui` 对暗/亮两套主题都断言"渐变最亮处对白字 ≥ 4.5:1"） |
| 移动端（<768px） | 按 17.4cqw 算行高只剩约 68px（390px 宽），放不下 2 行标题 → 行高放宽到 `max(64px, 20cqw)`，**名次列仍保持 13.7%**，标题最多 2 行、字号不低于 15px；短评胶囊隐藏 |
| 入场动效 | `IntersectionObserver` 逐行淡入上移，延迟 = `名次 × 40ms`；**隐藏态挂在 `html[data-rank-anim="1"]` 上**（该属性由组件内联脚本在解析期设置，仅当"JS 可用 + 未开启减少动态"时才存在）→ 无 JS / 爬虫 / 打印时看到的是完整榜单而不是空白；`@media print` 再兜一层强制显示 |

> **比例必须用 cqw，不能用 vw**：行高说的是"内容宽（榜单板宽度）的 17.4%"，而 `17.4vw` 是"视口宽度的 17.4%"——1440 视口下 17.4vw = 250px，会被 `clamp` 上限卡住，而榜单板实际只有 629px 宽，实测行高比 **21%**（比参考图高一大截）。现在给 `.rank-board` 加 `container-type: inline-size`，行高与名次列都用 **cqw**（`max(76px, 17.4cqw)` / `max(44px, 13.7cqw)`），比例在任何屏宽下都成立；P2 实测 1440 → 629px 板宽 / 行高 109px = **17.3%**、1920 → 904px / 157px = **17.4%**；名次列两者都是 **13.7%**。下限（76px / 44px）在板宽 < 437px 时接管，此时比例会略高于 17.4%——这是有意为之（窄屏要放得下两行标题）。
> 另外名次列**不能写成 `%` 再给 `font-size` 用**：同一个变量在 `grid-template-columns` 里 `%` 是"相对格宽"，在 `font-size` 的 `calc()` 里 `%` 是"相对父级字号"，会算出两个完全不同的值。cqw 是长度，到哪都指板宽的 1%。

> **这些数值的来源**：对发起人提供的裁切参考图（551×992）逐像素量得——行高 96px、名次列 75~78px、1~3 名粉底白字、4 名以后橙底深色字。参考图的**右侧那三列（得票率 / 升降 / 涨幅）已被发起人裁掉，明确不做**。原图在 `my_-blog\dosc\排行\444e59a870dd4ec71d881b6e8866eda0.jpg`（含被裁掉的右侧列，不可照抄）。

> 复用而不是新造：**配图解析直接用现成的 `ImageWrapper.astro`**（它内部用 `import.meta.glob("../../**/*.{png,jpg,jpeg,webp,avif}")` 把字符串路径解析成 `ImageMetadata`，缺图会在构建日志里报 `Image file not found`）。构建链会自动跑 `scripts/generate-lqips.ts` 为新图生成 LQIP 占位色。

### 5.6 空数据与错误处理

| 情况 | 表现 |
| --- | --- |
| 某组数据为空 | 显示居中的"榜单待更新"卡片，不渲染行 |
| `cover` 指向的文件不存在 | `RankBoard` 自己先按 `/src/**` glob 判一次（`ImageWrapper` 只负责出图）：解析不到就**当没有配图**，走渐变占位，同时在构建日志里 `console.warn` 报路径。这样"路径写错"不会变成亮色主题下的白卡片 + 白字（`ImageWrapper` 找不到文件时**什么都不渲染**，见 T7） |
| `title` 为空 | 校验脚本报错并阻断（不允许空标题） |
| 条目超过 30 条 | 正常渲染（不做分页），但校验脚本给出提示 |
| 数据还是占位内容 | `rankConfig.dataStatus = "placeholder"` → 榜单下方显示一条提示（含改法与文件路径）；填完真数据改成 `"final"` 即消失 |

---

## 6. 背景与动态壁纸子系统（R-BG）

模板已经内置视频壁纸能力：`backgroundWallpaper.src.playerUrl` + `src/components/features/BackgroundPlayer.astro`（带播放/切换按钮、加载失败 toast）。**所以"图片变视频"不需要新写播放器**，本项目要做的是：图片期先上图片，视频产出后把 `playerUrl` 指过去，并按原型已验证的参数微调降级与循环。

### 6.1 图片期（R-BG-01）

1. 转换脚本 `scripts/convert-wallpaper.mjs`（用 `sharp`，不引入新依赖）—— **P3 已落地**：
   - 输入：`dosc/photo/*.jpg`（4 张，1916×821 等）
   - 输出：`src/assets/images/DesktopWallpaper/imiss-d1..4.webp`（长边 2560 上限、`withoutEnlargement`、质量 82）
   - **不做预裁**：源图是 21:9，横幅（banner）本身很宽，让渲染时的 `object-position` 决定构图；预裁只会损失像素
   - 同时复制一份给移动端：`imiss-m1..4.webp`（长边 1600，因为竖屏只需要覆盖高度）——**同一批素材先顶上，后续可换成正式竖构图**
2. `backgroundWallpaper.ts` 改成：
   ```ts
   mode: "banner",
   playerEnable: false,          // ⚠️ 图片期必须关：见下方第 5 条
   src: {
     desktop: ["assets/images/DesktopWallpaper/imiss-d1.webp", /* … d2~d4 */],
     mobile:  ["assets/images/MobileWallpaper/imiss-m1.webp",  /* … m2~m4 */],
     // playerUrl 在视频产出前保持注释；产出后填 "/assets/videos/imiss-hero.mp4"
     // playerUrl: "/assets/videos/imiss-hero.mp4",
   },
   ```
3. `banner.position` 初值 `"0% 20%"`（保头脸），换图后按 §6.4 的方法复量。
4. `common.dimOpacity: 0.2` 保持（学参考站），文字看不清时先调它，不要改图片。
5. ⚠️ **两个实测陷阱（不处理会出"点了没反应"的死按钮）**：
   - 导航栏视频按钮的渲染条件是 `playerEnable && mode !== "none"`（`Navbar.astro:212`），**不看 `playerUrl`**；而播放器实体还要求 `src` 是对象且 `src.playerUrl` 存在（`WallpaperSection.astro:532`）。所以**图片期要把 `playerEnable` 设为 `false`**，否则导航栏会出现一个点了没反应的按钮；视频到位后再改回 `true`。
   - `src` 必须保持**对象形态**（`{ desktop, mobile, playerUrl }`）。若把 `src` 写成字符串或数组（模板注释里推荐的"单张图/随机图 API"写法），播放器实体的判断同样不成立 → 同一个死按钮问题。

### 6.1.1 手动换壁纸（R-BG-05，本站新增）

横幅两侧各有一个**隐藏交互区**（真 `<button>`），桌面端（≥1024px）hover 或 Tab 聚焦才淡出箭头；
鼠标与触屏都可以**按住横向拖动**超过 60px 换图（同一套 pointer 手势）。手机端不显示交互区，只用手势。

| 决策 | 做法 | 为什么 |
| --- | --- | --- |
| 复用而不是另写 | 直接调模板已有的 `changeToSlide()`（循环、懒实例化、1000ms 过渡、`transitioning` 防连点都在那边） | 重写一套必然与轮播/断点/懒加载打架 |
| 脚本怎么拿到那个函数 | 在轮播脚本末尾把 `changeToSlide` / `getVisibleSlides` 挂到 `window.__imiss*` | 两个 `<script is:inline>` 之间没有闭包共享 |
| 交互区放哪 | `#wallpaper-wrapper` 内、**Swup 容器（`#banner-overlay-container`）之外**，`z-index: 30`（高于 dim 10 / overlay 20） | 放进 Swup 容器会被切页换掉、监听全失效；z 低了会被 0.2 暗罩压灰 |
| 拖动 vs 点击 | 先要求"横向意图"（位移 > 10px 且大于纵向位移）才进入拖动，从 `a/button/input` 上按下的直接放过 | 否则会抢掉横幅上的链接点击与文字选择 |
| 让位 | 置 `window.__imissManualSwitchActive`，模板原有的触摸滑动看到它就 return | 同一次滑动不能切两张 |

> **画质与裁切（发起人 2026-09-24 反馈"图片模糊 / 有些地方看不见"，已修）**
>
> | 问题 | 根因（实测） | 修法 |
> | --- | --- | --- |
> | 发糊 | **同一条图被压了两代**：我先把原 JPG 转成 webp q82（201KB → 143KB，尺寸没变，掉的全是细节），Astro 构建时又按 `siteConfig.imageQuality = 85` 压了一遍 | ① `convert-wallpaper.mjs` 改成**只复制改名、不重编码**，原图（1916×821 / 181~251KB）直接进 `src/assets`；② 壁纸的 `quality` 单独提到 **95**（`WallpaperSection.astro` 的 `WALLPAPER_QUALITY`）。现在满档变体是 **1916×821 / 303KB**（之前 143KB），只经过 Astro 一代压缩 |
> | 有些地方看不见 | 首页横幅高 65vh，2.33:1 的原图塞进 3.05:1 的框，`object-fit: cover` 只保留 76% 的高度 | `BANNER_HEIGHT` 35+30 → **45+35 = 80vh**（`src/constants/constants.ts`，必须改常量：它同时驱动 `--banner-height-home`、内容起始位置、水波纹与滚动视差）。实测 1918×966 窗口下**可见高度 76% → 95%、宽度 100%** |
> | 只裁一侧 | `banner.position` 原来是 `"0% 20%"`——x=0% 表示"裁的时候只从右边切"，宽屏上画面被挤到左边 | 改成 **`"50% 35%"`**（水平居中，纵向略偏上保面部） |
>
> 各窗口的可见比例（`object-fit: cover` 的几何必然结果，实测见 `reports/wallpaper-probe.mjs`）：
>
> | 窗口 | 框 | 图渲染后 | 可见宽 | 可见高 |
> | --- | --- | --- | --- | --- |
> | 1918×966 | 1903×773 | 1903×816 | 100% | 95% |
> | 1440×900 | 1425×720 | 1680×720 | 85% | 100% |
> | 2560×1440 | 2545×1152 | 2688×1152 | 95% | 100% |
>
> **想要 0% 裁切**：把首页横幅高度改成"跟随壁纸比例"（`min(92vh, 100vw / 2.333)`）即可在任意窗口下 100%×100% 显示，代价是横幅会更高（1918 宽时 822px ≈ 85vh）。**这是发起人的视觉取舍，等他拍板再改。**
> 另外注意 2560 宽屏：源图只有 1916 宽，Astro 会**放大**出 2560 的变体（像素是插值出来的）——要真正锐利必须给更高分辨率的原图或视频。

> ⚠️ 素材质量提示：4 张源图是 1916×821 的预裁图，在 2560 宽屏上会被放大约 1.34 倍，属于**临时占位**。正式方案是视频（源宽度建议 ≥ 2560）。

### 6.2 视频期（R-BG-02）

沿用原型 `blog_test/blog_test` 已经验证过的结论，不重新试错：

| 议题 | 结论（来自原型 README 的实测记录） | 在本项目的落地 |
| --- | --- | --- |
| 首选素材 | **原片直出**（不转码、不二次采样），放 `public/assets/videos/imiss-hero.mp4` | `<source>` 顺序里排第一 |
| 循环点 | 若原片首尾帧对不上（大概率），只有"正放+倒放拼成回文"才能帧级无缝；该版本必须重编码，放 `imiss-hero.webm` 作兜底 | 原型脚本 `tools/video.mjs loop` 可复用（它在 `blog_test` 里，属参考实现，不改其代码，可复制一份到本项目 `tools/` 或直接用 ffmpeg 等价实现） |
| 兜底码率 | 14Mbps 时编码误差约为素材自身运动量的 79%（低于"看得见"的门槛）；8Mbps 档（8.26MB）也仍在素材运动量以内 | 体积敏感就用 8Mbps 档 |
| 播放速率 | 0.5 倍（只改 `playbackRate`，不解码损失） | 配置项写进组件脚本常量 |
| 交叉淡入 | 淡入窗口按**素材秒**计算再除以倍速；**只淡入上层**（两层同时降透明度会让页面背景透出来，画面发灰） | 变量名 `FADE_SECONDS` + `RATE`，注释写清换算 |
| 封面帧 | 与视频**同一画面**（同构图、同裁切），否则视频接上来的瞬间会跳 | `public/assets/images/hero-poster.webp` |
| 降级 1 | `prefers-reduced-motion: reduce` → 不播，只显示首帧静图 | ⚠️ **实测：模板的 `BackgroundPlayer.astro` 完全没有这一条**（也没有 saveData 与 visibilitychange），三条降级都要我们自己补进该组件 |
| 降级 2 | `navigator.connection.saveData` → 不播（壁纸原片通常是数 MB 到十几 MB，省流量优先） | 需要在 `BackgroundPlayer.astro` 里补（模板目前没有） |
| 降级 3 | 切后台 → `pause()`（不是卸载，回来接着播，不重新下载） | 模板没有 `visibilitychange` 处理，需要补；播放状态靠 `<html>/<body>` 的 `data-bg-video-playing` 属性与 `bg-player-toggle` 事件在导航栏按钮之间同步（`BackgroundPlayer.astro:116-120`、`Navbar.astro:281/296-318`），补逻辑时不能破坏这套同步 |
| 取景 | `cover` + `object-position` 锚点；参数与静态首帧保持一致 | 与模板 `banner.position` 同源，避免两套参数 |

**替换步骤（写进 README，避免忘事）**

```powershell
# 1) 量素材
#    看分辨率/时长/水印位置
# 2) 原片直出（一个像素都别动）
Copy-Item "新原片.mp4" "public/assets/videos/imiss-hero.mp4"
# 3) 出封面帧（与视频同构图）
# 4) 生成无缝兜底版（正放+倒放拼接 + 裁掉水印）
#    → public/assets/videos/imiss-hero.webm
# 5) 打开 backgroundWallpaper.ts 的 playerUrl，指向 mp4
# 6) 复量取景锚点（banner.position）与首帧是否一致
```

### 6.3 三层结构与 z-index 约定

沿用模板既有的分层（不要自己加 fixed 全屏层）：

| 层 | 归属 | 说明 |
| --- | --- | --- |
| 壁纸（图片/视频） | 模板 banner 容器 | `$z` 最低层 |
| 水波纹 / 渐变 | 模板 `WavesEffect` / `backgroundWallpaper.common.gradient` | 两者互斥（开了水波纹就自动关渐变） |
| 樱花 / 桌宠 / 浮动控件 | 模板 features 层（`SakuraEffect`、`AemeathPet`、`FloatingControls`） | 桌宠 `z-index` 低于浮动按钮与弹层，避免遮挡菜单 |

### 6.4 换素材后的验收动作

1. 目视：视频循环处无硬切、无闪白；首帧 → 视频过渡不跳。
2. 三种降级各测一次（系统偏好减少动态、DevTools 里模拟 saveData、切到别的标签页再回来）。
3. 取景：桌面 1440/1912、移动 390 三个宽度各截一张，确认脸没被切、水印没露出来。

---

## 7. 桌宠子系统（R-PET）

### 7.1 素材与规格

| 项 | 值 |
| --- | --- |
| 文件 | `src/assets/images/pet/pet-aemeath.webp`（从原型 `blog_test/blog_test/assets/img/pet-aemeath.webp` 复制，311KB） |
| 尺寸 | 1152×1404，8 列 × 9 行，单格 144×156（原图 1536×1872 / 单格 192×208 的 0.75 倍） |
| 取帧方式 | CSS 百分比定位：容器宽 = `calc(144px * var(--pet-scale))`，`background-size: 800% 900%`，第 `c` 列偏移 = `c/7 × 100%`（百分比定位的分母是"图宽 − 容器宽"= 7 格） |
| 行 → 状态 | 0 `idle`（6 帧）、1 `running-right`（8 帧）、2 `running-left`（**跳过**）、3 `waving`（4 帧，一次性）、4 `jumping`（5 帧，一次性）、5 `failed`（8 帧，`dy: -3`）、6 `waiting`（6 帧，`dy: -3`）、7 `running`（6 帧）、8 `review`（6 帧，一次性） |
| 已知坑 | 第 2 行与第 1 行逐像素完全相同（源仓库标了 `mirrored: true` 但出货图集没镜像）→ **左走用第 1 行 + `scaleX(-1)`**；`failed`/`waiting` 是"电子幽灵屏幕"素材，比小人矮一截，底边在 155 而非 152，用 `dy: -3` 对齐 |

### 7.2 挂载位置（关键）

`Layout.astro` 的 Swup 容器只有 `#banner-overlay-container`、`#banner-dim-container`、`#swup-container`、`#left-sidebar-dynamic`、`#right-sidebar-dynamic`、`#floating-toc-wrapper`。桌宠必须挂在容器之外，才能跨页常驻、不闪、不重载：

```astro
<!-- src/layouts/Layout.astro，第 571 行 <WavesEffect /> 之后，<FancyboxManager /> 之前 -->
<!-- Aemeath Pet -->
<AemeathPet />
```

切页时 Swup 会派发 `astro:page-load` / `swup:contentReplaced`，桌宠监听到后只做"打招呼 + 重新量视口尺寸 + 按页面类型调安静度"，**不重建节点**。（`SiteStats.astro` 里已有监听 `swup:contentReplaced` 的先例，沿用同一事件。）

### 7.3 配置（`src/config/petConfig.ts`）

```ts
export interface PetConfig {
  enable: boolean;              // 总开关
  hideOnMobile: boolean;        // 移动端是否隐藏
  mobileBreakpoint: number;     // 默认 768
  scale: number;                // 精灵缩放，0.6 ~ 1.5
  startSide: "left" | "right";  // 首次出场靠哪边
  zIndex: number;               // 默认 90（低于浮动按钮与弹层）
  idleMinutesToSleep: number;   // 无操作多久进入屏幕待机，默认 45（秒×60）
  lines: string[];              // 随机台词池
  greeting: string;             // 首次出场台词
  movement: {                   // R-PET-06 运动模式（默认 float，改一行即可切换）
    mode: "float" | "fixed" | "ground";
    hoverAmplitude: number;     // 悬浮上下浮动幅度 px，默认 6
    hoverPeriodMs: number;      // 浮动周期，默认 3200
    flyIntervalRange: [number, number]; // 飞行间隔 ms，默认 [30000, 90000]（R-PET-07 放宽）
    flyDurationRange: [number, number]; // 单次飞行时长 ms，默认 [4000, 6000]（R-PET-07 由固定 2600 改区间）
    flyRespectReducedMotion: boolean;   // 默认 true
  };
  agent: {
    enable: boolean;            // false = 纯本地 mock，不发任何请求
    apiBase: string;            // 空 = 同源（"/api"）
    timeoutMs: number;          // 默认 60000
  };
}
```

在 `src/config/index.ts` 与 `src/types/config.ts` 同步导出，保持与模板其它配置一致的组织方式。

### 7.4 状态机与行为

```
                 ┌──────────── 双击 / 切主题 ────────────┐
                 ▼                                      │
 idle ──计时器──→ running-left/right ──到达目标──→ idle   │
  │  ▲                                                   │
  │  │ 一次性动画播完                                      │
  │  ├─→ waving   （首次出场、切页）                        │
  │  ├─→ jumping  （单击、落地反弹）                        │
  │  ├─→ review   （对话完成、切主题）←────────────────────┘
  │  ├─→ failed   （被拖拽、对话报错）
  └─→ waiting    （无操作超时）
```

| 事件 | 状态 | 说明 |
| --- | --- | --- |
| 默认 | `idle` | 站立/悬浮时朝向跟随鼠标（用 `face` 变量，不改素材） |
| 自由活动（`ground` 档） | `running-right` / `running-left` | 在视口底部来回走；左走用第 1 行 + `scaleX(-1)` |
| 自由飞行（`float` 档） | `jumping`（**循环播放**，R-PET-07 起） | **不套走路动画**：用图集 **row4（`jumping`：九行里唯一"双臂张开、双脚离地"的形状）**循环播 + `--pet-tilt` / `--pet-fly-scale` 飘过去（见 §7.6）；`setState(name, holdMs, loop)` 的第三个参数把 `once` 动画在本次播放里改成循环 |
| 首次出场 / 切页 | `waving` | 台词取自 `petConfig.greeting` 或 `lines` |
| 单击 / 落地 | `jumping` | 重力落地后若速度大则再弹一次（只有 `ground` 档会落地） |
| 拖拽中 | `failed` | 影子随高度缩小变淡；松手后的去向**按模式分**（见 §7.6） |
| 无操作超时 | `waiting` | 进入"屏幕待机"；有任何交互立刻回 `idle` |
| 搜索框 / 命令面板打字 | `running` | 停止输入 `1.4s` 后回 `idle` |
| 对话完成 / 切主题 | `review` | 触发一次庆祝动效。**注意：模板没有"星屑爆发"能力**（那是 `blog_test` 原型 `anime.js` 里的），所以庆祝动效用组件内部的纯 CSS 小动效实现，不引第三方库；若以后想要星屑，单独开一个小任务 |
| 对话进行中 | `running` | 由 Agent 适配层的 `state` 事件驱动。⚠️ R-PET-10：聊天时的图集动画曾经"抖得很快"（12fps / 83ms，比待机呼吸还快一倍），现在 `running` 是 **4fps / 250ms**，且这一档还有一条**不变量**——`PET_MOOD_STATES`（语气/待机类）的帧间隔必须 ≥ 200ms；当前状态的实际帧间隔写在 DOM 的 `data-pet-frame-ms` 上，见 §7.6 第 17 条 |
| 对话报错 | `failed` | 气泡内给可读提示（不暴露技术细节） |

**交互**

| 操作 | 行为 |
| --- | --- |
| 单击 | 跳一下 + 随机台词（**原地**：R-PET-09 起跳跃动画期间位置定住、不掉高度也不浮动） |
| 双击 | `review` + 星屑 |
| 按住拖动 | 跟随鼠标/手指；**松手：`ground` 受重力落地 / `float` 就地悬停 / `fixed` 原地不动**（R-PET-06） |
| 右键 | 菜单：说句话 / **落下去 · 飘起来**（按档位二选一） / **和爱弥斯聊天**。⚠️ R-PET-08 起菜单**并排在宠物的左边或右边**（哪边够放哪边、默认右侧，纵向顶部对齐，见 §7.6 的 R-PET-08 小节），摆好后用 `elementFromPoint` 抽 5 个点确认没被遮挡（被挡就换边 / 纵向让开）；菜单项「跟过来」「睡一会儿」（R-PET-08）与「跳一下」（R-PET-09，左键单击就能跳）都已按发起人要求删除 —— 三者的**函数/状态本体都还在用**，只是入口没了。菜单必须带 `z-index`（宠物 `zIndex` + 1 = 67），否则会被壁纸/正文面板压在下面 |
| 键盘 | `Tab` 聚焦宠物；`Enter` 跳一下（**R-PET-09 保留**：它是 `role="button"` 的无障碍激活路径，与左键单击完全等价；发起人说的"按键没有必要"指的是菜单里那个「跳一下」按钮，已删）；`←` `→` 指挥它移动（`ground` 走 / `float` 飘 / `fixed` 不动）；气泡用 `aria-live="polite"`。**R-PET-11 的聊天框**另有一套：`Enter` 发送（走原生隐式提交）、`Esc` 关框并把焦点还给宠物、`↑` / `↓` 翻自己说过的话；历史区是 `role="log" aria-live="polite"`，气泡在聊天时换成 `role="dialog"`（不再整块重播历史） |
| 位置记忆 | `localStorage["imiss.pet.pos"]`（R-PET-06 起存 `{x,y,mode}`，兼容 P3 的纯数字旧格式；**模式以配置为准**，见 §7.6） |

**对话 UI**

点"和爱弥斯聊天"→ 气泡变成一个小输入框（`maxlength` 与后端上限一致）→ 回车发送 → 气泡切回流式文本区，显示增量回复与命中的文章链接（`meta` 事件）→ 关闭后回到台词模式。对话期间宠物不自由走动。

### 7.5 降级与可访问性

| 条件 | 行为 |
| --- | --- |
| `prefers-reduced-motion: reduce` | 退化为静止的 `idle` 单帧：`ground` 档贴地站着、`float` 档**静态悬浮**（停在悬浮基准线上，不浮动也不飞行，`movement.flyRespectReducedMotion` 控制是否禁飞）；点击/对话仍然可用 |
| 页面切到后台 | 停止 `requestAnimationFrame`（省电），回来恢复（悬浮/飞行都靠这条循环，因此也随之暂停） |
| 移动端（`hideOnMobile: true` 时） | 不渲染宠物节点 |
| `agentConfig.enable: false` / 接不上 / 超时 / 契约不符 / 答复为空 | 走本地 mock 台词（`fallbackReply()` 按用户那句话挑，出厂池是 `petConfig.mockReplies`）：**短、平、然后给出口**，不报错、不提任何内部信息（服务/端口/连接/模型/图/线程/错误码一个都不许有）、**也不自称 AI / 程序 / 模型 / 机器人**（R-PET-11 的硬要求）。⚠️ `petConfig.agent.enable` 是 P3 遗留的**死配置**（没有消费方），真正的开关是 `agentConfig.enable` |
| 关闭樱花/特效 | 宠物不受影响；宠物自身有独立开关（`petConfig.enable`） |

**与看板娘的互斥（R-PET-04）**：`pioConfig.ts` 的 `spineModelConfig.enable` 与 `live2dWidgetConfig.enable` 一律保持 `false`；若将来要开，必须先关掉桌宠。此约定写进 `petConfig.ts` 的注释。

**避免遮挡（R-PET-05）**：默认出场在**右下角、但预留安全区**（距右 ≥ 24px、距底 = 地面 10px，且 x 不进入浮动按钮的 96px 半径内）；`zIndex` 低于浮动控件层。⚠️ R-PET-06 起这条规则要**跟着宠物当前高度走**：`rightLimit(yTop)` 的收窄判据从"地面高度"改成了传入的纵向位置（默认 `pet.y`），否则悬浮/飞行中的宠物在按钮正上方时不会收窄（贴地档的判据与改前等价）。

### 7.6 运动模式（R-PET-06）

发起人原话：「这个小人应该是可以**悬浮**的、偶尔可以**到处飞**的，**且默认是这样**；可以给个**固定（不给飞）**和**下落（在下面）**的选项。」→ 三档做成配置 `petConfig.movement.mode`，**改一行即可切换**（组件启动读它；`localStorage` 里的模式只是"记着"，永远不覆盖配置）。

| 档位 | 落点（y 怎么来） | 有没有重力 | 计时器到点什么 | 拖动松手后 |
| --- | --- | --- | --- | --- |
| `float`（**默认**） | 悬浮基准线 `vh × 0.52 − h/2`（`PET_TUNING.hoverLineRatio`），并在 `±hoverAmplitude` 内正弦浮动；**离地至少 `PET_TUNING.airMinGap` = 48px**（"不贴地"的硬约束，拖放/缩窗都会被它夹回） | 无 | `nextAt` 到点 → `startFlight()` 从**当前位置**朝随机方向挪 `flyDistanceRange` = 60~180px（R-PET-07）；飞行中每帧缓动插值 | 就地悬停（不掉落），随后 8s 内再飘一次 |
| `fixed` | 当前位置（切换时只 clamp 回视口） | 无 | `nextAt = Infinity` → 什么都不做 | **原地不动**（不悬停、不漂移、不落地） |
| `ground` | 地面 `floorY` | 有（P3 原逻辑） | 原有 `decide()`（走/招手/跳/困惑/发呆） | 受重力落地（P3 原行为） |

**实现要点（三个"为什么这么做"）**

1. **悬浮与位置的位移都在 `#pet` 的 `translate3d` 上，由 rAF 逐帧写**（`hoverStep()` / `advanceFlight()` → `applyTransform()`）。**没有用 CSS animation 做浮动**：CSS 动画的位移与 JS 写的 `transform` 是同一条属性，会互相覆盖 —— 一旦拖拽或"刷新后恢复位置"再写一次 `transform`，动画就会被顶掉或抖动。重心放在 `translate3d` 上还有个好处：拖拽、位置记忆、模式切换共用同一份 `(x, y)` 事实，没有第二份状态可以对不上。
2. **飞行 = 缓动 + 弧线 + 姿态**（R-PET-07 收紧了全部参数）：`easeInOutSine` 插值（比原来的 `easeInOutQuad` 更柔，起步/收尾几乎看不出"启动"与"刹车"），纵向再叠 `flyArc × sin(πt)` 的抬升（**12px**，改前 44px —— 位移只有 60~180px 时 44px 的拱高会盖过位移本身，看起来像"蹦"），姿态用 CSS 变量 `--pet-tilt`（最大 `flyTilt` **3°**，改前 7°）与 `--pet-fly-scale`（最大 `1 + flyZoom` = 1.04）写在 `.pet-sprite` 上，与 `--pet-dy`（素材底边补偿）、`--pet-face`（朝向）拼在同一个 `transform` 里。**飞行用图集 row4（`jumping`，"双臂张开、双脚离地"）循环播放**（`PET_FLIGHT_POSE`；九行里没有专门的"飞"行，逐行对照图见 `reports/pet-atlas-rows.png`），不套 `running-*` 的横向位移（那是贴地逻辑）。飞行期间 `.pet` 带 `data-pet-flying="1"`（验收脚本据此判"真的在飞"）。
3. **约束是逐帧守的，不是只挑目标点时守一次**：目标点先用 `rightLimit(y1)` 收窄，飞行每一帧再用 `clampX(x, y)` / `clampAirY(y)` 夹一次 —— 这样"飞行途中返回顶部按钮冒出来""窗口被缩小""中途被拖拽"都不会压上按钮或飞出视口。用户一 `pointerdown`（拖动或单击）就 `cancelFlight()` 立即中断本次飞行。
4. **模式与位置记忆的关系**：`savePos()` 写 `{x, y, mode}`（兼容读 P3 的纯数字旧格式）；`boot()` 时 `mode` **只取配置**，记忆里的 `mode` 仅用于判断"那份 `y` 还作不作数"（同一模式才复用 y，否则 `float/fixed` 回落到悬浮基准线、`ground` 回落到地面）。这样"改配置就能切换"不会被浏览器里的旧记忆挡住。
5. **验收用的调试钩子**（`window.__imissFlyNow()` / `__imissSetMode()` / `__imissPetDebug()`）调的是**和真实行为同一个函数**（`startFlight()` / `setMode()`），只多了"跳过睡着判断""允许运行期切档"两件事 —— 否则飞行间隔最小 20 秒，自动化验收只能干等或造假。`verify:ui` 的 R-PET-06 共 13 条断言覆盖三档各自的落点、飞行位移、固定不动、松手行为、三档不遮挡与 reduced-motion 静态悬浮。
6. **自主飞行与"屏幕待机"的关系**：`waiting`（45 秒无操作）期间**不飞**（`decide()` 被 `pet.asleep` 挡住），任何交互立刻唤醒并恢复计时 —— 与 P3 贴地档的口径一致（待机就是要安静）。另外**自动飞行不写位置记忆**：`savePos()` 有 `pet.userMoved` 闸门，没被用户拖过就不落盘，免得访客刷新后被"上一次自己飞到的位置"接管。
7. ⚠️ **一次自查出来的偏差（已修）**：一次性动画（出场招呼 1.9s）收尾时原本会把 `nextAt` 重排成 1.2~4.2s，而这个 `nextAt` 在悬浮档正是"下一次飞行"的时刻 → 页面加载 **7 秒**就飞了，与配置写的 20~60 秒不符。现在只有贴地档在动画收尾时重排 `nextAt`；独立探针 `reports/_rpet06-autoflight-probe.mjs`（不碰调试钩子、纯等真实时间）复测：**页面加载后 31.7 秒自主起飞**、悬停 y 峰峰值 **12px**（= 配置 ±6px）。

**R-PET-07（发起人 2026-09-26 反馈两条，都已修）**

8. ⚠️ **右键菜单的锚点不能再假设"宠物贴地"**（发起人附图：「这框都在下面」）。改动前的 `openMenu(clientX, clientY)` 直接拿**鼠标坐标**当 `left/top`，只做了两条 clamp：左边不许溢出、`top` 不小于 10 —— **纵向完全没有下界**。P3 时代宠物只有"贴地"一种形态（`pet.y` 恒等于 `floorY`），鼠标点它必然落在视口底部附近，菜单往上一挂就没事；R-PET-06 把默认档换成 `float` 之后宠物悬在 `vh × 0.52`，位置可以是从视口顶到离地 48px 的**任意高度**，于是"点宠物下半身"这个最常见的动作就能让高约 200px 的菜单整块探出视口底。实测（`reports/_rpet07-menu-shots.mjs`，用真实几何套旧公式）：宠物在下部时旧公式给出 `top=815 → bottom=1018`，视口高 900 → **溢出 118px**（菜单高 203px 的 58%，正是发起人看到的"被裁掉一半"）。
   另一个同时存在的坑：**菜单原来没有 `z-index`**（= `auto` = 0），而模板里 `#wallpaper-wrapper` 是 `z-index: 10`、`#content-panel` 是 `30` —— 菜单被画在它们**下面**，只在两者都盖不到的地方露出来。用 `elementFromPoint` 在菜单中心取样，命中的是壁纸 `<img>` / `#header-waves` / 侧栏组件，**根本不是菜单**（矩形算得再对也没用）。
   修法：`placeMenu()` 改成按**宠物矩形**（组件自己维护的 `pet.x/pet.y/w/h`，不读布局，拖拽/飞行逐帧重排也不引发 layout thrash）摆位 —— 优先贴下方，下方放不下翻到上方，横向优先左对齐、右边不够就右对齐，最后四边都夹进视口（间隙 `menuGap` 10px、视口边距 `menuMargin` 8px）；`<div class="pet-menu">` 补 `style="z-index:{zIndex+1}"`（67，仍远低于浮动控件 1000 与移动端面板 1100，R-PET-05 不受影响）；拖动/飞行/切档/滚动（capture 监听）/缩窗（清尺寸缓存重量）/Swup 切页时都调一次 `placeMenu()`。**悬浮的 ±6px 呼吸故意不重排**（否则菜单会跟着一呼一吸地动，用户在菜单上点不准）—— 间隙 10px > 振幅 6px，所以也不会压到宠物。
   ⚠️ 这条的"贴下/翻上"判据**已被 R-PET-08 整体替换成左右摆位**（发起人第二轮反馈），下面第 10~13 条是现行算法；这里保留原文是为了记住"为什么会走到按宠物矩形摆位"这一步。
   断言口径（`verify:ui` 的 R-PET-07）：1440×900 与 390×844 各 4~6 个宠物位置，断言**四边在视口内**、**并排在左/右**（水平间隙 ≤ 26px、零重叠、纵向有交叠）、**纵向顶部对齐宠物顶部**、**哪边够放哪边**、**5 点 `elementFromPoint` 全部命中菜单本身**。最后这条是"像素真话"：只算矩形的话，没有 z-index 的那一版**断言全绿但菜单根本看不见**（§14.3 T19/T26 那类假绿的同一个坑）。
9. ⚠️ **飞行参数必须有上界**（发起人：「你飞的太快了…自然一点就微微挪动就好了」）。改动前的目标点是"**整个视口内随机取点**"（`edge + Math.random() × 可用宽/高`），单次位移实测 **414~550px**、时长固定 2600ms → 平均速度 ≈ 580px/s（走路是 58px/s 的一个数量级之上），看起来像瞬移。现在改成"**从当前位置出发、朝随机角挪 `flyDistanceRange`（60~180px）**"（纵向乘 `flyVerticalRatio` 0.55 压扁），时长 `flyDurationRange` **4000~6000ms**，平均速度约 18~38px/s；随机方向被视口/浮动按钮夹回后位移缩水太多就重摇（最多 6 次），实在不行这次不飞。间隔同时从 20~60s 放宽到 **30~90s**：位移小了以后 20 秒一动会像"在原地抽动"，拉长后更像"它自己有事、偶尔挪个地方"。
   实测（`verify:ui` 连飞 3 次）：位移 **95 / 104 / 133 px**、时长 **5.0 / 5.7 / 5.7 s**、平均速度 **20px/s**（两次独立运行的样本区间：位移 68~158px、时长 4.1~5.7s；R-PET-08 那轮复测 110 / 90 / 112 px、4.5~5.9s，仍在同一区间内）；飞行中 `data-pet-state=jumping`、`background-position` y=50%（row4）。

**R-PET-08（发起人 2026-09-26 第二轮菜单反馈：删两项 / 加「落下去」+「飘起来」 / 菜单摆到左右 + 防遮挡）**

10. **菜单项：删两个入口、加两个方向入口**。发起人原话：「（跟过来、睡一会儿）**这两个没有鸟用啊，我要的是下落啊，下落就是变成和之前一样会下落到底部**」→ `data-pet-act="follow"` 与 `"sleep"` 两个按钮从模板里删除，`click` 分支里对应的两个 `case` 一并删掉（原地留注释说明"入口已按发起人要求移除"）。**能力不删**：`walkTo()` 仍被键盘 `←/→` 与贴地档 `decide()` 调用；`waiting` 仍由"45 秒无操作"的巡检触发 —— 顺手把巡检里判定通过后的三行抽成 `doze()`，这样验收脚本的 `__imissSleepNow()` 调的是**同一段状态转换**（与 `__imissFlyNow()` / `__imissSetMode()` 同一个惯例：钩子只跳过计时/前置判断，不绕过行为本身）。
11. **「落下去」= 复用贴地档那条重力路径，不另写一套下落**。菜单项 `drop` → `setMode("ground", smooth=true)`：切档但**不瞬移**（`setMode` 的贴地分支在 `smooth` 时不写 `pet.y = floorY`），位置交给 `startFall()` 起手（`airborne = y < floorY − 2`、`vy = 60`）—— 这两行原来内联在 `onPointerUp`（拖动松手）里，现在抽成公共入口，**`onPointerUp` 与菜单共用**；逐帧加速度、落地判定（`y >= floorY && vy >= 0`）、撞击回弹（`impact > 1100` → `vy = -impact × 0.26`）全部还是 `step()` 里贴地档那段积分，一行没改。下落途中借 `PET_FLIGHT_POSE`（图集 row4，"双臂张开、双脚离地"）循环播放（悬空时用站姿帧看起来像平移），落地那一帧由 `step()` 自己 `setState("jumping", 420)` 播弹跳；落定后就是普通贴地档行为（`nextAt` 重新排队，走/招手/跳/困惑照旧）。实测：从 y=137（离地 629px）落到 y=759（离地 6px）**约 1.2~1.5 秒**（含落地回弹的收尾；两次运行 1.2 / 1.5 秒），落点与"拖动松手落地"完全一致（同一段积分）。
12. **「飘起来」= 反向入口（否则落下去就是死路）**。菜单项 `rise` → `setMode("float", smooth=true)`：`smooth` 时算出悬浮基准线却不直接写 `pet.y`，而是把它当**显式目标点**交给 `startFlight(now, true, {x, y})`（给 `startFlight` 新增可选的 `dest` 参数：带了它就不摇随机方向，只过 `clampX/clampAirY`）——于是"飘起来"复用飞行的 `easeInOutSine` 插值与弧线，**竖直**飘回 `vh×0.52 − h/2`。`startFlight()` 返回 false 时（`reduced-motion` 下 `flyBlocked`、或此刻正在飞）退回直接定位，**不能**让宠物带着 `float` 档位卡在地面上。实测：y 759 → 402（悬浮基准线 400.5）耗时 4.5~6.0s（配置区间 4~6s；两次运行 6.0 / 4.5s），期间 `data-pet-flying=1`。
   **两个入口按档位二选一显示**：`syncMenuMode()` 按 `pet.mode` 翻 `hidden`（悬浮/固定档 → 「落下去」；贴地档 → 「飘起来」），并作废菜单尺寸缓存（`.pet-menu button[hidden] { display: none }` 必须显式写：模板全局样式会压过 UA 的 `[hidden]`，漏掉就会出现两个按钮同时露出来）。两个按钮**都在 DOM 里**（不是条件渲染）——切档时只翻属性，不重建节点，读屏与键盘不受影响。
13. **菜单摆位改成左右 + 遮挡检测**（`placeMenu()` 重写，判据替换 R-PET-07 的"贴下/翻上"）。发起人原话：「**右键出现的选择框最好是要出现在人物的左边或者右边**啊，出现判断应该是**左边或右边区域够不够展开**，展开之后**会不会被遮挡**。」→ 四段式：
    ① **选边**：`roomRight = vw − margin − (pet.right + gap)`、`roomLeft = pet.left − gap − margin`（`menuGap` 10px / `menuMargin` 8px）；`room ≥ menuW` 才算这一侧放得下。**优先右侧**（本站 LTR，"从宠物向右读"与阅读方向一致；且宠物默认站位在右下角、右侧通常本来就不够 → 默认观感就是贴左侧），右侧放不下才翻左侧；**两侧都放不下**（视口比 `menuW + 宠物宽 + 间隙` 还窄 —— 实测 390 宽、宠物落在正中那一小段会出现）→ 取**空间更大**的一侧再夹回视口，这时可能压住宠物 1~2px（几何上无解，不再假装能并排）。
    ② **纵向**：**顶部对齐宠物顶部**（气泡在宠物上方，纵向对齐不与气泡打架），再夹回 `[margin, vh − margin − menuH]` —— 宠物贴屏幕上下边时菜单也不溢出。
    ③ **遮挡检测**：摆好后用 `document.elementFromPoint()` 抽 **5 个点**（中心 + 四角内缩 `MENU_SAMPLE_INSET` = 6px），命中必须是**菜单自己**；被挡住**先换另一侧**。
    ④ **两侧都被挡 → 两级兜底**：先**纵向让开遮挡带**（把遮挡方盒子的下沿/上沿之外各试一次，最多 3 轮 —— `occluderBox()` 会从命中节点一路上溯到"仍然覆盖该点、盒子更大"的最外层祖先，因为 `elementFromPoint` 命中的往往只是遮挡带里的小元素：实测是导航栏里的 `button.btn-plain`，真正压住菜单的是外层 `#navbar-wrapper`，`z-index: 80` > 菜单的 67）；让不开才取**遮挡点更少**的一侧。
    结果写进三个可断言的 DOM 事实：`data-pet-menu-side`（`left`/`right`）、`data-pet-menu-occluded`（被挡点数，0 = 干净）、`data-pet-menu-nudged`（1 = 为避让遮挡动过纵向位置）。
    ⚠️ **层级一个数字都没动**（仍是 `petConfig.zIndex + 1` = 67 < 导航栏 80 / 浮动控件 1000 / 移动端面板 1100）：防遮挡靠"换边 + 让位"，**不是**靠抬 `z-index` 把别人压下去；`verify:ui` 里有一条专门的断言锁住这一点（`menu.z === 宠物 z + 1 === 67`）。
    实测（1440×900 六个位置 + 390×844 四个位置）：默认悬浮位 → 贴左（右侧只余 70px < 菜单宽 132）、宠物在左 → 贴右、宠物在中（两侧都够）→ 贴右、贴右边缘 → 贴左、下部 → 纵向夹回、贴顶（宠物 y=15）→ **下移 61px 避让导航栏**；**四边在视口内、水平间隙 10px、与宠物纵向交叠 134px、顶差 0、5 点全命中菜单自己**。遮挡用例（注入 `z-index:1100` 遮挡层）：盖住右侧候选区 → 自动换到左侧（`occluded=0`）；铺满全屏 → 兜底（侧别照记、四边仍在视口内、`occluded=5` 如实上报）。`verify:ui` 的 R-PET-08 共 10 条断言。

**R-PET-09（发起人 2026-09-26 第三轮：删「跳一下」入口 + 跳的时候不要动）**

14. **「跳一下」菜单入口删除，但"跳"这件事只剩两条**。发起人原话：「**还有跳一跳的功能也删了，左键点击就能跳所以按键没有必要**」→ 菜单里的 `data-pet-act="jump"` 按钮与 `case "jump"` 一起删掉，菜单变成**三项**（说句话 / 落下去·飘起来 / 和爱弥斯聊天）。`jump()` **本体保留**：左键单击（`onPointerUp` → 双击判定之外的单击分支）与键盘 `Enter` 都在调它 —— 后者是 `role="button" tabindex="0"` 的**无障碍激活路径**，去掉之后宠物会变成"Tab 能聚焦、按下去却毫无反应"的假按钮（WCAG 2.1.1）。所以那句"按键没有必要"按**菜单按钮**理解并执行：菜单里那个按钮删了，键盘那条留着（它做的事和左键单击一模一样，不构成第二套功能）。⚠️ 如果发起人要求连键盘一起删，正确做法是同时去掉 `tabindex`/`role`，别只删监听器 —— 要另行确认。
15. **「跳的时候就不要动了」= 跳变成纯动画**。改动前：悬浮档边跳边做 `±6px` 的正弦浮动，走路档（或刚被 ←/→ 指挥过）会"边走边跳"，桌面端还可能正好赶上一次自动飞行 —— 观感是"跳的时候还在到处动"。现在 `jump()` 起手先 `cancelFlight()` + `pet.walking = false`，再由 `step()` 里新加的 `frozen` 闸门（`pet.state === "jumping" && pet.busyUntil > now`）在动画播放期间**同时冻结走路位移与悬浮浮动**，动画播完（`busyUntil` 到期）自动恢复原档位行为。⚠️ 闸门**只认 `jumping` 这个一次性动画**："落下去"那条自由落体的 `busyUntil` 是 0、且走的是重力分支，不受影响（否则下落会被冻在半空）。实测：单击后 `120 / 290 / 460ms` 三个采样点坐标全等（独立探针一轮 `(1228,396)`、`verify:ui` 一轮 `(138,666)`）；跳完按 `←` 键 420ms 移动 40~41px（冻结不是永久性的）。
    `verify:ui` 的 R-PET-09 共 5 条断言（菜单里已无「跳一下」、左键单击仍会跳、跳跃期间位置定住、跳完 ← 键仍能移动、Enter 保留且与单击等价）。

**R-PET-10（发起人 2026-09-26 第四轮：① 「点击落下去之后没有真的落下去啊」 ② 「聊天的时候小人抖动太快了，至少要慢一倍」）**

16. ⚠️ **"把状态立起来"和"把状态跑完"是两件事：下落的执行体在 `step()` 里，而 `step()` 只在 rAF 循环里跑。** 这是本轮最贵的一条教训。`setMode("ground", smooth=true)` → `startFall()` 只做了 `pet.airborne = pet.y < floorY − 2` / `pet.vy = 60`（"把下落立起来"），真正让宠物掉下去的是 `step()` 里贴地档那段重力积分。于是**任何让 `step()` 提前 return 的条件，都会让"立起来的下落"永远停在半空**，而菜单/档位/DOM 属性全都已经正常翻成"贴地档"了 —— 表面上"点了没反应"，实际上是"状态机对了、执行体没跑"。两条真实路径（都实测复现过：宠物带着 `mode=ground + airborne=true`，y 连续 1.5 秒一动不动、离地 370px）：
    - **聊天框开着**：`step()` 原来是 `if (pet.dragging || chatOpen) return;`，位置在重力分支**之前**。修法：闸门只留 `pet.dragging`（拖动期间 y 由 `onPointerMove` 直接写，重力不能跟它抢），`chatOpen` 挪到重力分支**之后**（重力照跑，但"走路 / 悬浮浮动 / `decide()`"仍然停）。
    - **`prefers-reduced-motion: reduce`**：`start()` 里有 `if (raf || reduce || document.hidden) return;` —— 这一档**按设计根本不开 rAF 循环**，`step()` 永远不会被调用。修法：`startFall()` 在 `reduce` 下**直接落到 `floorY`**（不是"修好动画"：减少动态本来就不做位移动画，而"落下去"是用户要的**落点**、不是装饰，语义与 `__imissSetMode("ground")` 的"直接定位"一致）。
    顺带把 `startFall()` 的"已经在地面线上下"分支也改成**对齐 `floorY`**：`clampY`（固定档）允许 y 一直到 `vh − h`，比 `floorY` 还低 7px，原来那条分支只是 `setState("idle")` 就 return，会停在离地 −7px 的位置。
    ⚠️ 排查时被**排除**的三个怀疑（都实测过，不是想当然）：① 按钮文字与动作**对得上**（`drop` → `ground`、`rise` → `float`，真机点可见项的中心点实测）；② `hidden` 互斥**正确**（悬浮档只有「落下去」`display:block`、另一项 `display:none`，点击坐标上 `elementFromPoint` 命中的就是它自己）；③ `decide()` 的三档分流读的是**运行时** `pet.mode`，不是配置 —— **不存在"巡检按配置把宠物拉回 `float`"这回事**（配置只在 `boot()` 里当初始值，见第 4 条）。落地稳定性是单独断言出来的：落地后连续 5.4 秒 ≥ 45 次采样始终 `mode=ground`、离地高度不变。
17. **语气类动画要有帧率下限，物理类不能跟着变。** 聊天时播的是 `running`（图集 row7 戴墨镜干活，`openChat()` 里 `setState("running")`）——原来 **12fps / 83ms 一帧**，比待机呼吸 `idle`（167ms）还快一倍；而聊天期间 `step()` 又被 `chatOpen` 冻住位置，**唯一在动的就是图集**，观感就是发起人说的"抖"。规则落在 `src/utils/pet-utils.ts`：
    - `PET_MOOD_STATES`（语气/待机类：`idle` / `waving` / `failed` / `waiting` / `running` / `review`）**帧间隔 ≥ 200ms**；`running` 与 `review` 取 **250ms**。
    - **物理类**（`running-right` / `running-left` / `jumping`）**不受这条管辖**：走路的帧率与 `PET_TUNING.walkSpeed` 是同一件事（慢下来会像"滑步"），`jumping` 同时是 `PET_FLIGHT_POSE`（下落与飞行途中循环播的姿态帧），放慢它等于放慢物理速度。
    - 改动：`running` 12→4fps（83.3→250ms，**3.00×**）、`review` 9→4fps（111.1→250ms，**2.25×**）、`idle` 6→5fps、`waving`/`failed` 7→5fps、`waiting` 原样；物理类一个没动。
    - ⚠️ **`once` 状态有一个隐蔽耦合**：`setState()` 用 `busyUntil = now + holdMs` 计时，到点后 `step()` 无条件 `setState("idle")` —— 所以 `holdMs` 必须 ≥ `frames × 帧间隔`，否则动画会被**截断**（`review` 放到 4fps 后 6 帧要 1500ms，原来写死的 900ms 只够播 3.6 帧）。现在这个数提成组件里的具名常量 `REVIEW_HOLD`，并有一条断言卡住"`REVIEW_HOLD ≥ frames × 帧间隔`"。
    - 帧率也**写进 DOM**（`data-pet-frame-ms`），验收时能直接核对"此刻正在播的那一帧序列确实够慢"；再加一条 `MutationObserver` 抓 `backgroundPosition` 变化时间戳的真机实测（改前 83ms → 改后中位 250ms）。
    - 图集里**没有**"听/说"这一行：row7（戴眼罩干活）是唯一"在工作"的形状，row3（单手挥）是一次性的打招呼手势（4 帧、`once`），循环播会变成"反复招手"。所以聊天继续用 `running`，只是把帧率放到不抖（"换个更贴合语义的形象"没做 —— 需要的话得先换图集，见第 8 条"九行 = 九状态"那条对应关系）。
18. `verify:ui` 的 R-PET-10 共 11 条断言。这一轮特地加了三条"上一轮抓不到"的口径：**真机鼠标事件 + 点"当前可见那一项"的矩形中心**（不再 `querySelector('[data-pet-act=...]').click()`）、**落定后继续采样 5.4 秒**（不再一落地就 break）、**两条失效现场各跑一遍**（聊天框开着 / `reduced-motion`）。理由见 §14.3 T45。

**R-PET-11（发起人 2026-09-27 第五轮：① 「思考的时候应该显示在思考」 ② 「输入框不应该在下面吗」 ③ 「还看不到之前的聊天」 ④ 「不应该是左右边吗」 ⑤ 「这聊天框是不是小了」 ⑥ 追加：「不许自称 AI」）**

19. **状态可见与"答复上屏"解耦：思考中一个字都不上屏。** 发起人的图证是"半截答案实时刷屏"（`SDD？ 你说的是 Spec-Driven Development？ 还是别的什么缩写 ——我这边翻不到上下文…`）——用户分不清"它还在想"还是"它答完了"。改法：`agent-client` 的 `onReply` 流式增量只写进组件闭包里的 `chatStreamBuf`（**只记字数、不渲染**），界面上给一个**独立的** `.pet-chat-thinking`（三个动画省略号 + 短句轮换 + `已经写了 N 字…`），答复在 `turn` 落地时**整段清洗后一次上屏**。
    - **为什么选"完成后一次上屏"而不是"流式但标注还在说"**：图证里 `**规范驱动开发**` 的星号漏出来，正是"流式途中先露半个 `**`"造成的 —— 只要还按增量上屏，Markdown 清洗就只能对**半截文本**做，符号泄漏是结构性的。而"状态可见"这件事本来就不需要拿半截答案当进度条：省略号 + 短句 + 已收字数已经给了进展感（`data-pet-chat-recv` 是断言读的那个数）。
    - 思考中的短句是**配置而不是硬编码**（`petConfig.chat.thinkingLines`，4 条，2.6 秒轮换、随机但不重复上一条）：写死一句会让 120 秒的检索轮看起来像卡住。
    - ⚠️ **发送按钮不进原生 `disabled`**：原生 `disabled` 会让表单的**隐式提交（回车）整条失效**，而那正是 P5 复核 D-9 点名要保住的路径（"在飞时又按发送"要有可见反馈、且不丢用户输入）。所以"禁用"落在三处：提交守卫（`chatBusy` 直接 return 给反馈）、视觉（`data-pet-busy="1"` → `opacity: .5`）、读屏（`aria-disabled="true"`）。
20. **"输入框在下面"要同时落在 DOM 顺序与几何上。** 面板结构自上而下 = `.pet-chat-head`（sticky top）→ `.pet-chat-log`（历史）→ `form.pet-chat`（**最后一个子节点** + `position: sticky; bottom: 0`）。两条断言各证一次：`form === panel.lastElementChild`、且 `input.top ≥ log.top`（改前实测 `inputAboveReply = true`）。**为什么表单是 sticky 而不是 flex 布局**：整块面板必须是**滚动容器**（见第 21 条），sticky 能在"面板滚"的前提下把输入行钉在可视区底部，而 flex + 内层滚动会破坏那条老断言。
21. **滚动容器是整块面板，不是内层历史区**（这一条是"改之前先看断言"救回来的）。`verify:ui` 的 R-AGT-07 用 `#pet-bubble` 的 `scrollHeight > clientHeight` 断言"500 字长答复可滚、首行可见、整块在视口内"——如果历史区自己变成滚动容器，面板本身就不再滚，那条断言会**变成假绿**（量的是一个永远不滚的元素）。所以：面板 `overflow-y: auto`、头部 `sticky top`、表单 `sticky bottom`、历史区就是普通块级流。新消息自动滚到底（仅在用户"贴着底部"时；往回翻超过 28px 就显示「↓ 最新」让他自己跳）。
    - ⚠️ 同时**放弃**了给面板加 `max-height`：基类 `.pet-bubble` 的 `max-height: min(48vh, 360px)` 会把 460px 的面板砍回 360px，`is-chat` 必须显式 `max-height: none` + `height: var(--pet-chat-h)`。
22. **"贴在宠物左边或右边"= 复用菜单那份 `placePanel()`，不新写一套。** R-PET-08 的算法（选边 = 两侧可用宽度够不够 → 5 点 `elementFromPoint` 遮挡抽样 → 换边 → 沿自由轴让开遮挡带 → 四边夹回视口）被抽成通用的 `placePanel(node, box, opts)`：菜单传 `verticalFallback: false`（行为逐字不变，`data-pet-menu-side/occluded/nudged` 三条口径照旧），聊天框传 `verticalFallback: true` + 两条额外约束：
    - `rightEdgeFor`：右侧还要避开右下角的浮动按钮列（`#back-to-top-btn` / `.floating-controls-container`，与 R-PET-05 给宠物留安全区用的是同一批节点）——**只作用于聊天框**：菜单只有 132px 宽、贴右时本来就在浮动按钮左边，给它加这条会让 R-PET-08 的选边断言在"宠物在左"的用例上翻边。
    - `toLocal`：聊天框是 `.pet` 的子节点（`.pet` 有 `transform` → 它就是绝对定位的包含块），所以写 `style.left/top` 时要减 `pet.x/pet.y`，而 `elementFromPoint` 抽样仍用视口坐标。菜单是 `position: fixed` 的兄弟节点 → 恒等映射。
    - **尺寸先算再量**：期望 340×460 → 若某侧塞得下就收窄到那一侧（**优先保持"左右"**，宁可窄一点也别换轴）→ 两侧都不到 `minWidth`(236) 才改走宠物上下方，并把高度压到"上下真正剩多少"（宁可矮、内部可滚，也**不盖住宠物本体**）。
    - **什么时候重排**：开框 / 缩窗 / 滚动（浮动按钮随滚动出现）+ 拖动松手、飞行结束各补一次。**飞行与悬浮的逐帧位移故意不跟**——面板是"读东西的地方"，跟着宠物一呼一吸地漂会让字看不稳（菜单是瞬时控件，所以它跟）。
23. **历史是"当前页面会话"级别的内存事实，DOM 每次开框按它重建。** `chatLog`（`{role, text, at}` 数组，上限 `petConfig.chat.historyLimit`）是唯一事实来源：关框（`closeChat()` 有**冻结的老口径**——气泡文本必须清空，R-AGT-04 的复位断言就量的它）只清 DOM，数组留着；再开框 `buildChatPanel()` 按数组回填。**跨 Swup 切页保留**：组件节点本来就不重建（§7.2），历史跟着走没有任何额外机制，而"切页就忘掉刚才聊的"对一个常驻角色来说是更差的手感；切页仍然 `closeChat()`（不破坏 R-AGT-04 的"切页后不卡在思考态"）。
    - `.pet-chat-reply`（对 R-AGT 断言与旧口径暴露"答复"的那个类名）由 `markLatestReply()` **跟着最新一条走**：每次追加后先摘掉所有 `.pet-chat-text` 上的这个类，再挂到**最后一条 ai/notice 行**的正文元素上。这是"第 N 问必须显示第 N 答"的落点——如果它按"每条答复都挂"实现，`querySelector` 会永远返回**第一条**（历史一开就串台）。这个类名**故意不带任何样式**（带了就会影响 500 字那条几何断言），样式钩子是 `.pet-chat-text` / `.pet-chat-line[data-role]`。
24. **Markdown 是前端兜底，不是"再实现一遍渲染"。** `src/utils/pet-chat-text.ts` 的 `cleanMarkdown()`（纯函数，不碰 DOM）：块级先洗（围栏 / 标题 `#` / 引用 `>` / 分隔线 → 空行 / 表格分隔行整行丢且内容行 `|` → ` · ` / 列表符号 → `· `），再洗行内（`**粗**`·`__粗__`·`*斜*` → 文字、图片与链接 → 只留可见文字 / 反引号去掉），最后压空白。**顺序敏感**：块级必须在行内之前（否则 `- ` 列表与 `*` 斜体会互相吃）。
    - **不许碰单个 `_`**：`word_count_min` / `user_preferences` 这类标识符里的下划线被拆掉会变成另一种泄漏（禁词表里就有它们）；下划线强调只处理 `__成对__` 这一种形态。`*斜*` 也加了"开头 `*` 后必须紧跟非空白"的限制，否则 `2 * 3 * 4` 这种算式会被误伤。
    - **折叠与滚动是互相抵消的两种长答复策略**：`collapseChars` 定在 **900**（真后端实测 439~496 字），就是为了不让 R-AGT-07 那条"500 字可滚"的断言因为"被折叠了所以滚不动"而变红。折叠只用 CSS（`max-height` + `mask-image`），**DOM 里始终是全文**（所以"复制""展开"拿到的都是完整文本，`replyChars === 500` 那条也照旧成立）。
25. **"不许自称 AI"（发起人同日追加）与可见性口径。** 她的口吻里不许出现 `AI` / `人工智能` / `程序` / `模型` / `机器人` / `大脑` / `未连接` / `agent`：本轮排查了 `petConfig.mockReplies`、`fallbackReply()` 的出厂台词、`AemeathPet.astro` 的全部用户可见字符串，**运行时文案里已经没有这类词**（旧文档里那句"我还没连上大脑"是 P3 的说法，P5 重写 mock 台词时就没在代码里了 —— 本轮把 `prd.md` §4.3、`PROJECT_STATUS.md` P3-6、本节 §7.5 的**文档残留**一并改掉）。断言分两层：**DOM 层**只扫"她说的那部分"（`#pet-bubble` 文本 + `#pet` / `#pet-menu` 的 DOM + 答复元素），**不扫整页**（站内本来就有讲 AI 的文章，扫整页必然假红，这条与 `leakScan()` 的分层理由一致）；**配置层**直接读 `petConfig.ts` / `agent-client.ts` 的源码取那几句台词（行首锚点避开注释里的引号）。
26. **可访问性：聊天时气泡从 `role="status"` 换成 `role="dialog"`。** `role=status` 是 `aria-atomic` 的隐式语义——历史一多，每加一条都会**重播整段聊天记录**。现在：面板换成 `role="dialog"` + `aria-label`，历史区自己 `role="log" aria-live="polite" aria-relevant="additions"`（只播新增行）；关框时把 `role` / `aria-live` 复原成 `status`。其它无障碍细节：开框自动聚焦输入框、关框把焦点还给宠物（`hit.focus()`，Esc 之后 Tab 不必从头找）、`reduced-motion` 下省略号不跳但"思考中"仍然可见、清空对话/复制/展开都是真 `<button>`。
27. `verify:ui` 的 R-PET-11 共 19 条断言，全部走**页面内假后端**（`rpet11Fake()`：按轮次给答复 / 先推 42 字再挂着不动 / 带 Markdown 的答复 / 1200 字长答复）——真后端给不了"发半句就挂着"这种输入，而"半截答案刷屏"正是要钉住的回归。另有一条配置层断言（尺寸 / 轮换条数 / 出厂台词不含自称词）与一条 `INFO` 级事实记录。

---

## 8. Agent 子系统（R-AGT）

### 8.1 为什么是这个形状

浏览器不能跑 Python，所以"桌宠用 Python SDK 调 Agent"必须拆成两段：

- **前端 → 网关**：普通 HTTP + SSE（浏览器唯一能做的）。
- **网关 → Agent**：Python 侧调用。用户指定的 Python SDK 路线 = `langgraph_sdk`（LangGraph Server 的官方 Python 客户端）+ `langsmith`（追踪/评测）。LangSmith 负责**观测**，不承担推理运行时。

参考实现 `agent_-for_-blog`（**只读**）给出的既定做法，本项目沿用同样的骨架与约定：LangGraph 图 + 单一 LLM 实例 + `persona.txt` 人设文件 + `Store` 长期记忆 + `interrupt()` 人在环 + DeepSeek（`ChatOpenAI` 兼容接口）。

### 8.2 目录结构

```
agent/
├─ langgraph.json                 # 注册 blog_agent（后续可加 recommend/collect）
├─ pyproject.toml                 # langgraph / langchain-openai / fastapi / langsmith / uvicorn
├─ .env.example                   # 只放占位（.env 不入库）
├─ README.md                      # 起服务的两条命令
├─ data/
│  ├─ blog-index.json             # 构建期导出：文章索引（标题/标签/摘要/URL）
│  └─ rank.json                   # 构建期导出：排行数据
├─ src/agent/
│  ├─ graph.py                    # 主图：路由 + 子节点
│  ├─ node/{main,search,rank,chat}.py
│  ├─ state/main.py
│  └─ common/{llm,persona,store,index}.py
│  └─ common/persona.txt          # 爱弥斯人设（改文案不用动代码）
└─ src/gateway/
   ├─ main.py                     # FastAPI：/api/pet/chat、/api/pet/health、/api/pet/reset
   ├─ client.py                   # 传输层：server（langgraph_sdk）/ inproc 两种模式
   └─ limits.py                   # 限流、长度校验、CORS
```

### 8.3 图设计（首期）

```
START → load_context ─→ route_intent ─┬→ search_blog → respond ─→ END
        （读 Store 记忆）  （结构化输出）├→ ask_rank    → respond ─→ END
                                     └→ chat        → respond ─→ END
```

| 节点 | 职责 | 实现要点 |
| --- | --- | --- |
| `load_context` | 取该 `user_id` 的历史（看过哪些文章、聊过什么） | LangGraph `Store`，namespace `(user_id, "preferences")`；空则返回 `{}` |
| `route_intent` | 三分类：`search_blog` / `ask_rank` / `chat` | 用 `with_structured_output(..., method="function_calling")`（**DeepSeek 不支持 `json_schema` 形态**，这一点参考实现已经踩过） |
| `search_blog` | 在 `data/blog-index.json` 上检索 | 关键词打分：标题命中 3 分、标签 2 分、摘要 1 分；中文用空格/标点切词 + 子串匹配即可，**首期不引入向量库** |
| `ask_rank` | 读 `data/rank.json`，按问法选榜（日漫/国漫）与维度（全剧/单集） | 直接拼装榜单为文本，交给 `respond` 组织语言 |
| `chat` | 闲聊 / 兜底 | 人设 + 少量上下文 |
| `respond` | 统一出话 | 每个面向用户的节点都用 `with_persona(任务说明)` 拼系统提示，保证口吻一致（避免"精神分裂"） |

**LLM 配置**

```ini
DEEPSEEK_API_KEY=sk-....
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```
- 路由节点 `temperature: 0`；对话节点 `temperature: 0.3`。
- 输出上限（`max_tokens`）默认 800，可配。
- 换服务商只需改 `.env`（OpenAI 兼容）。

**人设文件 `persona.txt`（首版要点）**

- 身份：住在 IMiss Blog 里的爱弥斯，认识这个站的每一篇文章；称呼访客"你"而不是"您"。
- 语气：短句、口语、不卖萌不过度感叹号、每段最多一个 emoji。
- 硬边界：只依据检索结果说话，不编造文章标题/链接/字数；查不到就说查不到；用户问技术问题时认真回答。

> **v1.37 补：身份口径（发起人 2026-09-27 决定）** —— 人设升到 **v7**（`agent/persona-aemeath-v7.txt`，
> 安装位置仍是后端 `src/agent/common/persona.txt`）。**这条是产品决定，不是技术偏好**：
> **不得出现任何自称 AI 的回复，必须明确自己是爱弥斯**（v6 里「被问是不是 AI 就诚实承认」的口径作废）。
> 唯一保留、且优先级更高的**底线**是：**不得宣称自己是真人**、**不得宣称自己是官方爱弥斯本人**——
> 不给访客可被截图打脸的硬伤。示范句与硬规则见人设第八节 8.1~8.4。
> ⚠️ **这不属于契约变更**：§8.9 的端点、事件、取答、降级一条都没动，前端**一行都不用改**；
> 但正因为人设是启动期加载的，改完**必须重启 `langgraph dev`**（§8.9.4），否则跑的还是旧人设。

> **前端到底调哪张图、路由在哪（发起人 2026-09-27 问过，答案记在这儿）**：
> 前端**只调一张图** —— `agentConfig.graphId = "blog_agent"`，`assistant_id` 每次会话用
> `POST /assistants/search` 现查（**不硬编码**）。**路由在后端图内部**，不在前端：
> `blog_agent` 自己的骨架是 `get_store_info → identify_question → router_message()`
> → 条件边分流到 `recommended_graph`（推荐）/ `collect_graph`（收藏）/ `extend_graph`（闲聊）/
> `get_user_preferences`（偏好），最后由各分支 `END`。另外三张图（`recommended_agent` /
> `collect_agent` / `extend_agent`）是**后端注册在 `langgraph.json` 里的独立入口**，
> 前端**一个都不碰** —— 换默认图只改 `graphId` 一个值。所以"能不能路由到别的问题"这件事
> 由后端图决定，前端只负责把这一句话发出去、把最后一条 `ai` 消息取回来。

### 8.4 网关接口契约（前端唯一依赖）

**`POST /api/pet/chat`**

```jsonc
// 请求
{
  "threadId": "a4f1…",        // 前端生成的 uuid，localStorage 持久化
  "message": "帮我找一篇讲智能指针的文章",
  "userId": "anon-3f9c"       // 可选，匿名哈希；用于 Store 记忆隔离
}
```

```text
// 响应：text/event-stream
event: state
data: {"state":"thinking"}

event: token
data: {"text":"我记得"}

event: meta
data: {"posts":[{"title":"C++11 智能指针","url":"/posts/cpp11-smart-pointer/"}]}

event: state
data: {"state":"done"}
```
错误时：`event: error` + `{"code":"rate_limited","message":"说得太快啦，缓一缓再问"}`（HTTP 状态仍为 200，便于前端统一处理；校验失败等硬错误用 4xx）。

**`GET /api/pet/health`** → `{"ok":true,"agent":"blog_agent","llm":"deepseek-chat"}`

**`POST /api/pet/reset`** → `{"threadId":"…"}` → 清除该线程状态（`{ok:true}`）

**传输模式**（`client.py`）

| 模式 | 触发 | 用途 |
| --- | --- | --- |
| `server`（默认） | `PET_AGENT_TRANSPORT=server` | 通过 `langgraph_sdk` 调 LangGraph Server（`langgraph dev`/`up`），有 threads/checkpoint/Studio |
| `inproc` | `PET_AGENT_TRANSPORT=inproc` | 网关进程内直接 `graph.ainvoke()`，不需要 Server；用于快速自测与无 Server 的降级运行 |

两种模式共用同一个 `graph.py`，前端无感知。

### 8.5 安全与限额（R-AGT-05）

> ⚠️ **下表是"网关侧的目标口径"，不是现状**（2026-09-26 澄清）。
> 网关（`src/gateway/`）**还没实现**，`langgraph dev` 是**裸跑**的：实测它返回 `access-control-allow-origin: *`，
> 且没有任何鉴权、限流、长度校验、线程数上限。**现状与目标的差距逐条列在 §8.9.7 的未决项里，
> 对应的上线前必修项是 `PROJECT_STATUS.md` 的 B-14。** 别把下表当成"已经配好了"。

| 项 | 目标取值 | 实现位置（规划） | 现状 |
| --- | --- | --- | --- |
| CORS 白名单 | 线上域名 + `http://localhost:4321`（dev） | `limits.py`，来自 `PET_ALLOWED_ORIGINS` 环境变量 | ⛔ **未实现**：`langgraph dev` 实测 `ACAO: *` |
| 限流 | 20 次/分钟/IP，内存令牌桶 | `limits.py`（首期单机内存即可，不做 Redis） | ⛔ 未实现 |
| 消息长度 | ≤ 1000 字 | 网关校验 + 前端 `maxlength` | ⛔ 未实现（前端的 `maxlength` 是体验，不是安全） |
| 输出上限 | `max_tokens` ≤ 800 | LLM 调用参数 | 后端图侧可配（未在契约里锁） |
| 线程数上限 | 同 IP 同时活跃线程 ≤ 3 | `limits.py` | ⛔ 未实现 |
| 日志 | 只记 `threadId`/耗时/状态，不记消息原文 | `main.py` | ⛔ 未实现 |
| 密钥 | 只在 `.env`（不入库）；前端零密钥 | `.env.example` 只放占位 | ✅ 前端确实零密钥；后端 `.env` 已存在且不入库 |
| 鉴权 | （未定） | — | ⛔ **为零**：拿到 `assistant_id` 即可调用 |

### 8.6 前端适配层（`src/utils/pet-agent-client.ts`）

对外只暴露三个方法，组件不直接写 fetch：

```ts
export interface PetAgentEvents {
  onState(s: "thinking" | "done" | "error"): void;
  onToken(text: string): void;
  onMeta(posts: { title: string; url: string }[]): void;
  onError(message: string): void;
}
export function petChat(message: string, ev: PetAgentEvents, signal?: AbortSignal): Promise<void>;
export function petHealth(): Promise<{ ok: boolean }>;
export function petReset(): Promise<void>;
```

- `apiBase` 取自 `petConfig.agent.apiBase`，为空则用同源 `/api`。
- `petConfig.agent.enable === false`、`petHealth()` 失败、或 SSE 解析失败 → 走内部 `mockReply()`（本地台词 + 一条"Agent 未连接"提示），**不抛异常、不弹技术报错**。
- 用 `AbortController` 支持关闭气泡时中断请求。
- SSE 解析用 `fetch` + `ReadableStream` 手写（不引第三方库，约 40 行）。

### 8.7 启动与运维

```powershell
# Agent 图（LangGraph Server，端口 2024）
cd agent
python -m pip install -e . "langgraph-cli[inmem]"
langgraph dev                     # 开发：带 Studio UI；生产用 langgraph up 或 uvicorn

# 网关（端口 8000）
uvicorn src.gateway.main:app --host 127.0.0.1 --port 8000
```

| 环境注意 | 说明 |
| --- | --- |
| Windows | `langgraph dev` 的彩色日志需要 `colorama`；`langgraph-checkpoint-postgres` 的 `psycopg` 必须装 `[binary]` 变体（否则报 `no pq wrapper available`）——两条都来自参考实现的实测记录，本项目**首期用内存 checkpoint**，不依赖 Postgres |
| `.env` 编码 | 保持纯 ASCII、注释单独占行（`python-dotenv` 在中文 Windows 上按 GBK 读，行尾注释会被吞进值里） |
| 常驻 | Linux 服务器用 systemd（两个 unit：langgraph server、gateway）；Windows 用 `nssm` 或计划任务 |
| 启动顺序 | 先 LangGraph Server，再网关；网关 `/api/pet/health` 里做一次 Server 可达性探测并在启动日志里明确打印 |

### 8.8 构建期数据导出（前端与 Agent 的契约）

`scripts/export-agent-data.mjs`（新增，挂在 `pnpm build` 之前或独立执行）：

| 输入 | 输出 | 字段 |
| --- | --- | --- |
| `src/content/posts/**/*.md` | `agent/data/blog-index.json` | `slug`/`title`/`description`/`tags`/`category`/`published`/`url`/`excerpt`（正文前 600 字纯文本） |
| `src/config/rankConfig.ts` | `agent/data/rank.json` | 5 份榜单（日漫/国漫各 2 组维度 + 二游单一榜；标题、原名、短评、名次） |

**单向依赖**：Agent 只读导出产物，不读前端源码；前端不 import Agent 的任何东西。这样两边可以独立演进。

### 8.9 Agent 接口契约（P5-0 冻结）

> **这一节是"前端唯一依赖的东西"。** 冻结的含义是：**只要这一节不变，`agent_-for_-blog` 那边的图、节点、人设、prompt 怎么改，前端都不用动**；反过来，前端要改这一节的任何一条，都属于契约变更，必须连带改 `src/config/agentConfig.ts` 与 `scripts/verify-agent.mjs`。
>
> **本节全部内容都是 2026-09-26 对 `http://127.0.0.1:2024`（`langgraph dev`）的实测结果**，不是设计推演。逐条都能用 `pnpm verify:agent` 复现（输出见 `reports/verify-agent.log`）。
>
> ⚠️ 本节**只定义接口，不含任何前端业务实现**。接线（`src/utils/pet-agent-client.ts`）、气泡渲染、桌宠状态联动是 P5-1 起的活。

#### 8.9.1 端点与调用序列

| # | 调用 | 用途 | 实测 |
| --- | --- | --- | --- |
| 0 | `GET /ok` | 可用性探测（**降级判定的唯一入口**） | `200 {"ok":true}` |
| 1 | `POST /assistants/search`，body `{"limit":50}` | 查 `assistant_id`。**`assistant_id` 不是固定值**，每次部署都可能变，绝不能硬编码 | `200`，返回 **5 个 assistant / 4 张图** |
| 2 | `POST /threads`，body `{}` | 建线程。一个会话一个线程，`thread_id` 由前端持有（`localStorage`） | `200`，取 `thread_id` |
| 3 | `POST /threads/{thread_id}/runs/stream` | 发消息 / 续跑，SSE 流式返回 | `200`，`text/event-stream` |

**4 张图**（`graph_id` 去重后的值，与 `agent_-for_-blog/langgraph.json` 一致）：

| `graph_id` | 用途 | 备注 |
| --- | --- | --- |
| `blog_agent` | **默认入口**。按意图自己路由（闲聊 / 检索 / 排行 / 推荐 / 扩展） | 实测**有两个 assistant 实例**，所以 `search` 返回 5 条 |
| `recommended_agent` | 专门的推荐链路，**会 `interrupt()` 问字数** | 见 §8.9.5 |
| `collect_agent` | 收集/登记类 | 首期前端不用 |
| `extend_agent` | 扩展类（`blog_agent` 闲聊意图会路由到它的节点） | 首期前端不用 |

> ⚠️ **断言口径**：契约测试**必须去重后按"4 张图"断言**（`new Set(list.map(a => a.graph_id))`），**不能按返回条数断言**——返回 5 条里有 2 条是同一个 `blog_agent`。返回条数会随后端部署变化，去重后的图名清单才是契约。

**两条备用端点**（不是主路径，但前端要知道它们存在）：

- `POST /threads/{thread_id}/runs/wait` —— 非流式，一次返回最终 state（`{messages, user_preferences, user_intent}`）。实测闲聊可用，**但拿不到流式增量，且推荐链路拿不到 `interrupt` 的时机**，所以前端主路径用 `runs/stream`。
- `GET /threads/{thread_id}/state` —— 取线程最终状态。**这是"契约测试的自检工具"**：用来核对"最后一个 `values` 事件 == 线程真实状态"。

**超时与重试**

| 项 | 取值 | 依据 |
| --- | --- | --- |
| 可用性探测超时 | 1.5~2 秒 | 本机 `ECONNREFUSED` 是**立刻**返回的；给 2 秒是为了兼容"端口开着但不响应" |
| 闲聊轮超时 | 60 秒（`agentConfig.timeoutMs`） | 实测 3~8 秒 |
| 检索 / 推荐轮超时 | 90~180 秒 | 实测 30~120 秒（要跑 RAG + 多轮 LLM），**推荐链路两轮各自计时** |
| 重试 | **连接层错误重试 1 次**（间隔 ~500ms）；`4xx` **不重试** | `4xx` 是契约不符/参数错，重试只会把错误放大；`5xx` 与网络错误重试 1 次即止 |

**生命周期**：`thread_id` 跟着"一次会话"走，不跟着"一条消息"走。要开新会话就新建线程（旧线程留在服务端，前端只管自己的 `localStorage`）。**前端不做线程回收**——服务端是内存 checkpoint，重启即清空（见 §8.9.7 的风险）。

#### 8.9.2 请求形状与必须/禁止字段

```jsonc
// POST /threads/{thread_id}/runs/stream
{
  "assistant_id": "446b73ee-9199-57c8-9238-d4ac2d89b200",  // 必须：来自 /assistants/search
  "input": { "messages": [{ "type": "human", "content": "在吗" }] },  // 首轮必须
  "stream_mode": ["messages", "values", "updates"]          // 必须：三个都要（少一个就取不到最终状态或 interrupt）
  // 续跑轮用 "command" 替代 "input"：{ "command": { "resume": "不提供" } }
}
```

| 字段 | 规矩 | 为什么 |
| --- | --- | --- |
| `assistant_id` | **必须**，且**每次会话都要现查** | 不是固定值 |
| `input.messages[].type` | **必须** `"human"` | 实测传别的形态会被当普通内容处理 |
| `stream_mode` | **必须**同时含 `messages`、`values`、`updates` | `values` 是最终状态的唯一载体；`updates` 是 `interrupt` 的第二来源 |
| `config.configurable` 与 `context` | ⛔ **绝对不能同时传** | 实测 **HTTP 400**：`Cannot specify both configurable and context. Prefer setting context alone.`（LangGraph 0.6.0 起 `context` 是 `configurable` 的长期替代）。**二选一，首期推荐都不传**（本机没配鉴权，传了也没用） |
| `input` 与 `command` | ⛔ **不能同时传** | 首轮用 `input`、续跑轮用 `command`，语义互斥 |

#### 8.9.3 SSE 事件契约

**事件名白名单**（出现白名单外的名字 = 上游改了协议，要显形）：

| 事件名 | 事件体 | 含义 |
| --- | --- | --- |
| `metadata` | `{"run_id":…,"attempt":1}` | run 起手帧。**只有走 `extend_graph` 这类子图路径时才出现** |
| `values` | 线程**完整状态快照** | **最后一个 `values` 就是最终状态**——前端只认它（末事件也可能是 `updates`，见下面顺序保证 #2） |
| `updates` | 本步各节点的增量 | `interrupt` 的第二来源；前端**不用**它渲染。⚠️ **实测它可以是末事件**（resume 轮） |
| `messages/metadata` | `{"lc_run--…":{metadata:{…}}}` | 某条消息的元信息（模型名、节点名等）。**纯内部信息** |
| `messages/partial` | `[部分消息]` | 流式增量（token 级）。`content` 常为空、`tool_calls` 会半成品 |
| `messages/complete` | `[完整消息]` | 某条消息完成 |
| `error` / `end` | — | 异常/结束（本机实测未出现，保留在白名单里） |

**顺序保证（只锁这三条，别锁死顺序）**

1. 事件流**非空**，且事件名**都在白名单内**。
2. **`values` 是主收尾信号；`updates` 也可以作为末事件。**
   ⚠️ **v1.35 修订**（P5 独立复核 D-2 的实测证据：`reports/_p5r-backend3.json` 的 resume 轮
   `last=updates`）：原口径写的是「**最后一个事件必须是 `values`**」，实测**不成立** ——
   `recommended_agent` 的 resume 轮就是 `… → updates` 收尾。所以：
   - **取答逻辑不变**：最终答复仍取「**最后一个 `values`** 里最后一条 `content` 非空的 `ai` 消息」；
   - 若这一轮**一个 `values` 都没有**，回退到 `GET /threads/{id}/state`（契约 §8.9.5 层③）；
   - **不要把「末事件不是 `values`」当降级条件**：那会让 resume 轮无故降级
     （旧版 §8.9.6 条件 4 就是这么写的，已同步改掉）。
3. `metadata` **若出现**，必须在**任何 `messages/*` 事件之前**（它是 run 起手帧）。

> **为什么不能锁死事件名序列**（后来人看到"测试只查白名单"容易以为是偷懒，所以写清楚）：
> **同一句「在吗」，走哪条节点是不确定的，事件集就跟着变。**实测两种都出现过——
> · 直接答复路径：**整个流只有 1 个 `values` 事件**（没有 `metadata`、没有 `messages/complete`，消息数 2：`human,ai`）；
> · 经 `extend_graph` 路径：`metadata → values → updates → values → messages/metadata → messages/partial ×N → messages/complete → updates → values`（消息数 10：`human,human,ai,tool,ai,ai,tool,ai,tool,ai`）。
> 两者**都符合契约**。所以契约只能锁"事件名集合 + `values` 收尾 + 与 `GET /threads/{id}/state` 一致"，
> **锁顺序就会变成一个随机失败的假红灯**。第三层保险是：契约测试会拿**最后一个 `values` 的消息数与 `GET /threads/{id}/state` 对比**，确保"前端拿到的最终状态"确实等于线程真实状态。
>
> ⚠️ **v1.35 起，"`values` 收尾"这一条也要放宽成"末事件是 `values` 或 `updates`"** —— 实测 resume 轮以
> `updates` 收尾（`reports/_p5r-backend3.json`）。`scripts/verify-agent.mjs` 里的断言同步放宽，
> 但**取答仍然只认 `values`**：`updates` 只是"流结束了"的信号，它不是完整状态快照。

**「最终答复」怎么取（唯一正确做法）**

```js
// 从最后一个 values 事件的状态里，取【最后一条 content 非空的 ai 消息】
const state = lastValuesEvent;                      // 最后一个 values 的 data
const ai = (state.messages ?? [])
  .filter(m => m.type === "ai" && typeof m.content === "string" && m.content.trim())
  .pop();
const reply = ai?.content ?? "";                    // ← 只有它进气泡
```

> ⛔ **明确禁止：把工具消息 / 中间步骤渲染给用户。**
> 实测检索意图（如「帮我找几篇讲 C++ 的文章」）的消息流是
> `human,human,ai,tool,ai,ai,tool,ai,tool,ai`，其中包含**数据库内部输出**：
> `可用的表:blog, blog_content`（纯 `ai` 消息，`content` 就是这行字）与
> `CREATE TABLE blog ( id BIGINT UNSIGNED NOT NULL COMMENT '文章ID' … )`（`tool` 消息）。
> **这两条是 schema DDL，不是爱弥斯的话。** P5-0 的契约测试专门锁了这一条：
> 同一条流里工具输出确实进了消息流，而按上面的取法拿到的答复**命中禁词 0 个**（`reports/verify-agent.log`「检索轮 · 只渲染最后一条」）。
> 禁词表（`scripts/verify-agent.mjs` 的 `leakMarkers`）：`可用的表`、`CREATE TABLE`、`word_count_min`、`user_preferences`、`user_intent`。
> 同理**不要**渲染 `messages/metadata`（含模型名、节点名、线程 id）、`messages/partial`（半成品 tool_calls）。

#### 8.9.4 人设与代码改动必须重启进程

`agent_-for_-blog` 的**人设文件与图代码是在 `langgraph dev` 启动时加载**的：改了 `persona`、prompt、节点代码、`langgraph.json` 的图注册，**必须重启进程**才生效（热重载不可依赖）。前端侧的对应规矩：**不要在请求参数里试图覆盖人设**（没有这个能力），人设问题一律回后端改 + 重启。

> **v1.37 实测留痕（这条规矩真的会咬人）**：人设 v7 装机后**必须先停旧进程再起新的**，否则 `/ok` 照样 200、
> 四张图照样都在，看上去"服务是好的"，但回话的还是旧人设。本轮的取证口径是**功能证据 > 进程证据**：
> 重启后直接问后端一句「你是AI吗」，拿到「我是爱弥斯。这站角落里那个，会唱歌、会打游戏那个。」
> —— 只查端口和 `/ok` 是**测不出人设新旧**的。回归断言：`pnpm verify:ui` 的 R-AGT 段「身份类禁自称」。

#### 8.9.5 `interrupt` 与人机交互约定

**这是整条契约里最容易写错的一环**：`interrupt` **不是事件名**，前端不能去 `event: interrupt` 上等它。

**怎么判"需要续跑"**（三层信号，按代价从低到高；至少命中一层）：

| 层 | 信号 | 实测 |
| --- | --- | --- |
| ① | `values` 事件的状态对象里有 `__interrupt__` 数组 | 命中。`[{"value":"…","id":"1ecfed…"}]` |
| ② | `updates` 事件的事件体里有 `{"__interrupt__":[…]}` | 命中（**但同一轮不一定发 `updates`**，见 §8.9.3，所以不能只靠它） |
| ③ | `GET /threads/{id}/state` 的 `interrupts[]`（或 `next:["collect_user_info"]`、`tasks[].interrupts[]`） | 命中，**最可靠**，适合做兜底与排障 |

**判定规则**：一轮 `runs/stream` 结束后，若拿到任何 `__interrupt__` 的值 → **这一轮要求用户再答一句**；
此时要按**两种形态**分别处理（**v1.35 补第二种**，P5 独立复核已独立复现）：

| 形态 | 长什么样（实测） | 前端该怎么办 |
| --- | --- | --- |
| **A. 先给答复、再反问** | 最后一个 `values` 里**同时**有 ~482~522 字的答复 **和** `__interrupt__`（例：`blog_agent` 检索链路给完文章列表后问「要不要我收进本子？」） | 答复 + 反问**一起**进气泡（答复在前），**不自动续跑** —— 替访客做决定等于把他刚问出来的结果丢掉。用户下一句回「需要 / 不需要」时按下面的 **`command.resume`** 发 |
| **B. 纯反问、没有答复** | 最后一个 `values` 里有 `__interrupt__` 但 `lastAiMessage` 为空（例：`recommended_agent` 问「篇幅大概多少字」） | 这一轮确实没有答复 → **自动续跑一次**（`command.resume` + 推出来的约定词）；续跑仍不成功才把反问交给用户 |

> ⚠️ **形态 A 的 `messages` 里那 482 字是"答复"，不是"历史消息"** —— 契约 §8.9.3 的取法
> （最后一条 `content` 非空的 `ai` 消息）在两种形态下都成立，所以前端**不需要**为形态 A 另写一套取法，
> 只需要在"有答复"时**不要**自动续跑。
>
> ⚠️ **跨轮回答也必须用 `command.resume`**（复核 D-2）：形态 A 是"这一轮有答复 + 反问"，
> 用户是**隔一轮**才回答的。旧实现只在"同一轮内拿到过无答复的 interrupt"时才发 `command`，
> 隔轮回答时把用户那句当**新 `input`** 发了出去 —— 真后端今天容忍这种写法（实测 200 + interrupt 被消费），
> 但那是**没写进契约的宽容行为**，后端一收紧这条链路就静默失效。所以判定口径是：
> **只要"上一轮气泡里有一句反问"且"用户这句是约定词"，这一轮就发 `command.resume`。**

**resume 载荷**：

```jsonc
{ "assistant_id": "…", "command": { "resume": "不提供" }, "stream_mode": ["messages","values","updates"] }
```

- **用 `command` 而不是 `input`**（两者互斥）。
- `resume` 的值是一个**字符串**，直接就是用户那句话本身；约定词**必须原样匹配**（见下）。

**约定词**（`agentConfig.resumeWords`；后端 `collect_user_info` 节点的 prompt 与这三个词是对好的暗号）：

| 约定词 | 什么时候用 |
| --- | --- |
| `不提供`（**默认**） | 用户没明说字数/时长 → 让后端按站内常用范围自己挑 |
| `需要` | 用户明确给了字数或时长要求（或明确同意"收进本子"这类落盘动作） |
| `不需要` | 用户明确表示不要后端代挑 |

> ⚠️ 改这三个词**必须同时改后端 prompt 与本节**。暗号不匹配**不会报错**，后端会把它当普通回答处理（推荐结果跑偏，最难查的一类问题）。
> 实测的询问原文（`recommended_agent` 第一轮）：`行，我去翻。不过你还没说清：篇幅（大概多少字、能看多久）。\n不想说也行，回我「不提供」——我按站里的常用范围替你挑，挑完你再嫌。`
> 实测续跑：`resume:"不提供"` → `HTTP 200` → 拿到 463~495 字的最终推荐答复，**且不再出现第二次 `interrupt`**（契约要求一轮收口）。
> **前端展示询问原文**：`__interrupt__[0].value` 就是**可以直接放进气泡的用户可读文本**（人设已经写好了），不要自己另编一句。

**⚠️ 已知脆弱点（v1.35 登记，P5 复核 D-8 的结论）：`resumeWords` 一词两义，前端只能靠"问句形态"猜词。**

`resumeWords` 的三个词**同时**承担两个角色：① `command.resume` 的**默认载荷**；② 判"用户这句是不是在
回答反问"的**意图信号**（`isResumeWord()` 拿它们对用户输入做子串匹配）。于是"该回哪个词"这件事，
前端只能从 `__interrupt__[0].value` 的**问句措辞**里反推：

- 旧实现有一条 `/要不要|需要我|要我/ → 需要` 的规则，于是后端只要问「**要不要**我按站里的常用范围替你挑几篇？」
  （一句**宽松提问**，用户什么都没说），前端就会自动回 `需要` —— 而契约里 `需要` 的含义是"用户明确给了字数/时长"。
  更硬的一条：后端人设原文写着「这两个词我认得准；回别的话，我这边就当你没说」→ **猜错的词不会报错，只会跑偏**。
- **当前缓解口径（已落地）**：只在问句**明确在问字数/篇幅/时长**，或**明确在问"要不要收进本子"**时才推 `provide`；
  其余（含各种"要不要…"的宽松提问）一律回**默认词 `不提供`** —— **推不出来就默认，不猜用户意图**。
- **根治方案（未决项，需后端配合，见 §8.9.7 第 9 条）**：让后端在 `interrupt` 里带**结构化载荷**
  （例如 `{"kind":"word_count","options":["不提供","需要","不需要"],"default":"不提供"}`），
  前端按 `kind` 选词，彻底不解析自然语言。**这需要改 `agent_-for_-blog`，本轮不做。**
- 可执行的反例已进回归：`pnpm verify:agent:robust` 的 `[D-8]`（4 种问句 → 期望词，含那条宽松提问）。

#### 8.9.6 降级规则（R-AGT-03：**没有后端也不许报错**）

**触发条件**（命中任意一条即视为"Agent 不可用"）：

| # | 条件 | 判定方式 |
| --- | --- | --- |
| 1 | `agentConfig.enable === false` | 读配置，**一个请求都不发** |
| 2 | 连不上 | `GET /ok` 抛 `ECONNREFUSED` 等网络错误 |
| 3 | 超时 | 超过 `timeoutMs` 未拿到首字节 |
| 4 | 契约不符 | 事件名在白名单外 / 取不到非空 `ai` 消息 / 单事件超过 64KB（上游失控） |
| 5 | 返回空 | `200` 但最终答复是空串或全空白 |
| 6 | 服务端错误 | `5xx`（含重试后仍失败） |
| 7 | 线程 / assistant 失效 | `runs/stream` 回 **4xx**（实测重启后失效的 thread 与 assistant 都回 **404**）：**先自愈**（清缓存 → 重建线程 / 重查 assistant → 重试一次），仍失败才降级（§8.9.7 未决项 #5「失效即降级/**新建**」） |

> ⚠️ **v1.35 删掉了旧条件 4 里的一条**：「末事件不是 `values` → 降级」。实测 resume 轮以 `updates`
> 收尾（复核 D-2），照旧条件写会**把正常的 resume 轮打成降级**。正确的降级判据是
> 「**一个 `values` 都没有、且 `GET /state` 也取不到答复**」，不是"末事件名不对"。
> ⚠️ **第 7 条是 v1.35 新增的（复核 D-3）**：只降级不自愈会让后端一重启就**永久降级到用户刷新页面为止**
> —— 而 §8.9.4 规定改人设/图代码**必须重启**，所以这条是高频路径，不是边角。

**降级行为（硬要求）**：

1. **走 mock**：从 `petConfig.mockReplies` 取一句（或按"降级 + 用户输入"轻量挑选），**不抛异常、不弹技术报错、气泡不显示"错误"字样**。
2. **必须符合爱弥斯人设**，口径取自 `agent/persona-aemeath-v7.txt` 的红线段落（**第八节「安全红线」的「被要求做不该做的事」**，v1.37 前的引用写的是 v5，段落号也旧了）——**短、平、然后给出口**：
   - 模板：`不行。` + 换行 + `……<原因，一句话>。` + `<换点别的/换个说法>`。
   - 原句示范：`不行。\n……里面的东西不归我管。换点别的吧，文章我挺在行的。`
   - 同类可用：「我这边断了」这种**直说**的说法是官方口径（人设第十节明确写着：**宁可说"我这边断了"，也不要说"星轨紊乱了"**）。
3. ⛔ **不得暴露任何内部信息**：不许出现 `langgraph` / `LangGraph` / `assistant_id` / `thread_id` / `run_id` / `127.0.0.1` / `2024` / `8000` / `ECONNREFUSED` / `HTTP 4xx|5xx` / `timeout` / 端口号 / 栈信息 / 模型名（`deepseek-chat` / `deepseek-flash`）/ 节点名 / 表名。**"Agent 未连接"这类运维字样也不给访客看**（那是给日志的，不是给气泡的）。
4. **仍然可用**：降级后输入框照常能用、能连续降级、能重试（下次请求会重新探活）。

**降级路径上的两条硬口径（v1.35 依据独立复核补写）**：

- **判出契约不符要立刻收手**，不能"记一笔错然后继续读流"：继续读会让用户白等到看门狗超时，
  期间他再问一句还会被静默吞掉。适配层一旦判出（白名单外事件 / `error` 事件 / 单事件超限）
  就 `reader.cancel()` 收口，**已到手的字节照常解析完，但不许再渲染**。
- **降级只在"取不到答复"时发生**：已经拿到答复的轮次**不许**因为别的理由（例如第三层兜底慢）
  把它压回去。`GET /threads/{id}/state` 是**兜底**，不是关键路径的一环 ——
  只在「前两层都没有 `interrupt` 信号**且**本轮答复为空」时才调，超时 1.8 秒（与 `/ok` 同级）。

> 这条规则的**可执行形态**已经在测试里：`scripts/verify-agent.mjs` 用一个最小探测函数（`probeAvailability`）对
> **死端口 `http://127.0.0.1:2099`** 断言"被识别为不可用"，并**对照**断言同一个函数对活服务返回可用
> （防止写成一个恒 `false` 的假探测）。实测：死端口 → `TypeError: fetch failed (ECONNREFUSED)`；活服务 → `ok`。

#### 8.9.7 未决项与风险

| # | 未决项 | 现状（实测） | 上线前必须做什么 |
| --- | --- | --- | --- |
| 1 | **CORS 是 `*`，不是白名单** | `langgraph dev` 的预检与实际响应都返回 `access-control-allow-origin: *`（**任何网站都能在访客浏览器里直连这个服务**）。⚠️ 这与 §8.5 写的「仅同源 + 白名单跨域」**不符——那段是网关侧的规划口径，不是现在的现状**（网关还没实现）。 | 生产必须收紧到本站域名白名单。见 `PROJECT_STATUS.md` **B-14** |
| 2 | **直连 2024 还是走网关** | 契约按**直连 `langgraph dev`（127.0.0.1:2024）**冻结，与 `prd.md` R-AGT-02 写的"对外只暴露一个网关 `POST /api/pet/chat`"**是两条路线**。直连的好处是不用先做网关就能联调；坏处是鉴权/限流/密钥边界没有落点 | 二选一：① 上线前补网关，契约里的端点序列挪到网关后面（前端只需改 `baseUrl`）；② 明确放弃网关，把 `baseUrl` 指向反代后的同源路径 |
| 3 | **鉴权为零** | 本机无任何鉴权，`assistant_id` 拿到即可调用 | 上线前定：网关侧令牌 / 同源 + Nginx 限流（`ARCH.md` §12.2） |
| 4 | **域名与反代路径未定** | `baseUrl` 现在硬编码 `http://127.0.0.1:2024` | 域名到位后（**B-01**）改 `agentConfig.baseUrl`，同步 §12.2 的 `/api/` 反代与 SSE 关闭缓冲 |
| 5 | **线程是内存 checkpoint，重启即清空** | `langgraph dev` 用内存 checkpoint；服务一重启，旧 `thread_id` 全部失效 | 决定：前端检测到线程失效就**新建线程并重放最近 N 轮**，还是接受"重启后忘掉上下文"。当前契约只要求"失效即降级/新建"，不要求续接 |
| 6 | **限流与长度上限没有落点** | §8.5 定的 20 次/分钟/IP、≤1000 字，实测**服务端没有**（那是网关规划） | 上线前在网关或 Nginx 做；前端侧 `maxlength` 是体验不是安全 |
| 7 | **检索轮的耗时抖动大** | 实测 30~120 秒（同一句话两次运行差一倍以上） | 前端要么给"正在翻"的中间反馈（桌宠 `thinking` 态），要么把超时放宽到 180 秒；不要按"平均 45 秒"设计 |
| 8 | **本机直连 Fandom / `web_fetch` 不通** | 只有 `127.0.0.1:2024` 正常 | 与前端无关，但**排障时别把网络问题误判成契约问题**：先看 `GET /ok` |
| 9 | **`interrupt` 只有自然语言，没有结构化载荷**（v1.35 新增，复核 D-8） | 前端"该回哪个约定词"只能从 `__interrupt__[0].value` 的**问句措辞**反推（`replyForAsk()` 的几条正则）。缓解后仍脆弱：后端把「要不要我按站里的常用范围替你挑几篇？」这种**宽松提问**问出来时，前端只能回默认词 | **要改 `agent_-for_-blog`（本轮不做）**：在 `interrupt` 里带结构化字段，例如 `{"value":"<给人看的问句>","kind":"word_count","options":["不提供","需要","不需要"],"default":"不提供"}`；前端按 `kind` 选词、`value` 只负责上屏，彻底不解析自然语言。落地前这条一直是"改一个字就翻转载荷"的脆弱点（§8.9.5 已登记） |
| 10 | **失效自愈的"清缓存 + 新建"是前端单方面行为**（v1.35 新增，复核 D-3） | 前端在 4xx 后 `resetSession()` + 重试一次；**新线程没有上下文**（旧线程的历史不会重放） | 与未决项 #5 是同一个决定：要不要"重放最近 N 轮"。当前口径是"接受重启后忘掉上下文，但**不许永久降级**" |

#### 8.9.8 契约的可执行形态（`pnpm verify:agent`）

`scripts/verify-agent.mjs`（零依赖，与 `verify-ui.mjs` 同风格：Node 原生 `fetch`，无第三方库）把本节变成 14 项断言：

| 组 | 断言 |
| --- | --- |
| 配置对齐 | `agentConfig.ts` 的 `baseUrl`/`graphId`/`timeoutMs`/`resumeWords`/`knownGraphs` 与脚本内置契约常量一致（**读 `.ts` 原文核对**，脚本不 import 业务代码） |
| 服务可用性 | `GET /ok → 200 {ok:true}` |
| `assistants/search` | 去重后 4 张图齐全（**按图名断言，不按返回条数**）＋ 配置的 `graphId` 有对应 assistant |
| 闲聊轮 | 事件名白名单 / `values` 收尾 / `metadata` 不在消息事件之后 / 与 `GET state` 一致；取到最后一条非空 `ai` 消息；答复不含工具输出 |
| 检索轮 | **前提项**：检索意图的消息流确实含工具输出；**结论项**：同一条流里工具输出**没进**最终答复 |
| 推荐轮 | 判出 `interrupt` 并取到询问原文；`resume:「不提供」` 后拿到最终答复、无第二次 `interrupt` |
| 请求形状 | 同时传 `configurable` + `context` 被 `400` 拒 |
| 降级路径 | 死端口被判为不可用 ＋ 活服务被判为可用（对照项，防假绿） |

**退出码规矩（与其它 `verify:*` 不同，务必注意）**：

| 情形 | 行为 | 退出码 |
| --- | --- | --- |
| Agent 没在跑 | 全套 **SKIP**，打印启动命令 `cd ..\agent_-for_-blog; langgraph dev` | **0**（环境问题不算回归，**不能让 CI 变红**） |
| 全绿 / 有 SKIP 但无 FAIL | 正常报告 | **0** |
| **契约不符**（白名单外事件名 / 取不到答复 / leak 命中 / 400 坑失效 …） | 逐条 ❌ | **1** |

产物：`reports/verify-agent.log`（UTF-8 全文）、`reports/verify-agent.json`（结构化结果，含 `mode`/`passed`/`failed`/`skipped`/`exitCode`）。

> **这条规矩是"验过"的，不是写上去的**：2026-09-26 停掉 `langgraph dev` 后跑，输出 `⏭️ [SKIP]` + 启动命令，**退出码 0**；再注入两次契约漂移（① 把一个图名改错，② 把"取最后一条 `ai`"改成"取第一条 `ai`"）→ 都是 **退出码 1**，且第二条精确命中了「检索轮 · 只渲染最后一条」这条断言。

### 8.10 前端实现落点（P5-1 / P5-2 / P5-3）

> §8.9 是**契约**（冻结，不许改）；这一节是**契约在前端的落点**（可以改，改完要同步这一节与 `verify:ui` 的 R-AGT 断言）。

**代码落点**

| 落点 | 文件 | 职责 |
| --- | --- | --- |
| 适配层 | **`src/utils/agent-client.ts`**（新增） | HTTP + SSE + `interrupt` 判定 + 降级。**只依赖 `agentConfig`**，组件不许自己写 `fetch` / 解析 SSE |
| 配置 | `src/config/agentConfig.ts` | `enable` 已改 **true**（P5-2）；`baseUrl` **支持构建期环境变量覆盖**（见下）；`graphId`/`timeoutMs`/`resumeWords`/`fallbackToMock`/`debug` 照旧 |
| 对话入口 | `src/components/features/AemeathPet.astro` 的 `openChat()` / `runAsk()` / `closeChat()` | 气泡 DOM、九状态联动、会话作废（不再读 `petConfig.agent.enable`——那是遗留死配置） |

**`baseUrl` 怎么定（发起人 2026-09-26 确认：Agent 是跑在云服务器上的，不是访客本机）**

```
① import.meta.env.PUBLIC_AGENT_BASE_URL   // Astro 只把 PUBLIC_ 前缀的变量注入客户端
② 没设 → DEFAULT_AGENT_BASE_URL = "http://127.0.0.1:2024"（langgraph dev 默认端口）
```

| 场景 | 怎么配 | 说明 |
| --- | --- | --- |
| 本地开发 | **什么都不用设** | 打本机 2024，就是现在的行为 |
| 上线（**推荐：同源反代**） | `PUBLIC_AGENT_BASE_URL=/api/agent`，Nginx 把 `/api/agent/` 反代到 `127.0.0.1:2024` | ① **同源没有 CORS 问题**（现在是 `ACAO: *`，见 B-14；同源之后浏览器不发预检，也不必求对方改 CORS）；② SSE 只需 Nginx 上 `proxy_buffering off`（§12.2 已写好）；③ 端口不外露，限流/鉴权将来都落这一层 |
| 独立域名 / 将来的网关 | 给完整 URL（如 `https://agent.example.com`） | 前提是它实现了 §8.9 的端点序列 |

> **前端只依赖 `baseUrl` 一个值**：直连（本机 2024）与反代（同源 `/api/agent`）走的是同一份代码，
> 换形态只改这个变量 / 环境变量，**不改任何别的文件**。
> 实测证据：设 `PUBLIC_AGENT_BASE_URL=https://agent-probe.example.invalid` 构建 → 哨兵值出现在
> `dist/_astro/config.*.js`；不设再构建 → 哨兵消失、`127.0.0.1:2024` 回到产物里。

**三档时间闸门（这是"别拿一个总时长把流掐断"的落点）**

| 闸门 | 取值 | 管什么 | 为什么 |
| --- | --- | --- | --- |
| 连接 / 首字节 | `min(agentConfig.timeoutMs, 20s)` | "发出请求 → 拿到响应头"这一小段 | 实测首字节 1~5 秒；服务在排队时别一直耗着 |
| 流中途卡死 | **60 秒没有任何新 chunk** | 流已经开了但不动了 | 检索轮总耗时实测 30~120 秒且抖动大（§8.9.7 未决项 #7）；**固定总时长掐流 = 真机"聊到一半断掉"** |
| 单轮硬上限 | **300 秒** | 兜底，防"永远挂着" | 与 §12.2 的 Nginx `proxy_read_timeout 300s` 对齐 —— 前端比反代稍早收手，用户看到的是降级台词而不是 504 |
| `/ok` 探测 | 2 秒（§8.9.1） | 降级判定的唯一入口 | 本机 `ECONNREFUSED` 是立刻返回的 |
| 重试 | 连接层错误 1 次 / 间隔 500ms；`4xx` 不重试；**流已开始后中途断开不重试** | — | 重试会把半截答复重放一遍 |

**适配层对外的形状**（组件只认这些；内部字段一律不出这个文件）

```ts
export async function askAemeath(message: string, opts?: {
  signal?: AbortSignal;                       // 关聊天框 / 切页时取消
  events?: { onReply?: (text: string) => void };  // 流式增量（去重后）
  lastReply?: string;                         // 上一轮气泡里的那句话（判"是不是在回答 interrupt"）
}): Promise<AgentTurn>;                       // 永不抛异常

type AgentTurnStatus = "answer" | "interrupt" | "fallback" | "disabled";
interface AgentTurn {
  text: string;             // 进气泡的文本
  status: AgentTurnStatus;  // 组件按它做状态联动
  fromMock: boolean;        // 走了 mock（降级 / 开关关掉）
  reason?: string;          // **只给日志与断言看**，绝不许进气泡
  interrupt?: { ask: string; reply: string; via: "values" | "updates" | "state" };
  elapsedMs: number;
}
// 另导出 probe / listAssistants / createThread / fallbackReply / pickLiveConfig / resetSession（测试与排障用）
```

**实现要点（逐条与 §8.9 对应）**

1. **`listAssistants()` 按 `graph_id` 去重**后取 `agentConfig.graphId` 对应的那一个 → **不硬编码 `assistant_id`**。`assistant_id` 与 `thread_id` 都只活在模块级变量里，**不进 DOM、不进气泡、不写 `localStorage`**（服务端是内存 checkpoint，存了也要处理失效，见 §8.9.7 未决项 #5）。
2. **SSE 手写解析**：`fetch` + `body.getReader()` + 自写的增量解析器（约 30 行，零依赖）。**先把 `\r\n`/`\r` 归一成 `\n`**，行前缀用 `/^(event|data):\s?/` 而不是 `startsWith("data: ")`（中间有代理时会去掉空格）；`:` 开头当注释/心跳跳过；**跨 chunk 的半截事件留在缓冲里**。
3. **事件白名单**（§8.9.3 的 8 个名字）之外的任何事件名 → 判契约不符 → 降级（`reason` 里显形，气泡里一个字都不露）。
4. **只认 `values`**：`tool` 消息、`messages/partial`、`messages/metadata`、`messages/complete` **一个都不送给 UI**。最终答复 = 最后一个 `values` 里**最后一条 `content` 非空的 `ai` 消息**（§8.9.3 的唯一取法）。
5. **`interrupt` 三层**：① `values.__interrupt__` → ② `updates.__interrupt__` → ③ `GET /threads/{id}/state`。第三层**优先读 `tasks[].interrupts[]` 而不是 `interrupts[]`** —— 后者是**历史累计**（跑过几轮就有几条），拿它会把"上一轮的旧问题"混进来（P5-1 实测踩到，登记为 T50）。
6. **约定词**：判定规则写死在 `replyForAsk()` 里（问句里出现「不提供 / 不想说」→ 默认词；出现「多少字 / 篇幅 / 时长」→ 默认词；出现「要不要我 / 需要我」→ `provide`）。用户那句本身若含约定词，就用他说的那个（`decline` 优先于 `provide`）；**不含就当新消息发**，绝不报错（§8.9.5）。
7. **超时与重试**：见上面那张「三档时间闸门」表 —— **连接/首字节**与**整轮**是分开的，长答复不会被一刀切断。
8. **降级**（§8.9.6 六条触发条件全覆盖）：

   | 触发 | 判定 | 行为 |
   | --- | --- | --- |
   | `enable:false` | 读配置 | **一个请求都不发**，直接 `fallbackReply()` |
   | 连不上 | `fetch` 抛 `TypeError` | 重试 1 次 → 仍失败就降级 |
   | 超时 | 首字节 20s / 整轮 180s | 降级 |
   | 契约不符 | 白名单外事件名 / 末事件不是 `values`（等价于取不到答复）/ 响应没有 body | 降级 |
   | 返回空 | 最后一条非空 `ai` 消息是空串 | 降级 |
   | 服务端错误 | `5xx`（含重试后仍失败） | 降级 |
   | **调用方取消** | `signal.aborted`（关框 / 切页） | **不降级、不报错**：返回 `text: ""`，组件按会话号丢弃（不算 §8.9.6 的六条） |

9. **mock 台词口径**：`fallbackReply()` 按用户这句话挑一句（人设红线：短、平、然后给出口），出厂台词池是 `petConfig.mockReplies`（已按同一口径重写）。**两边都不含任何运维字样**（不提服务/端口/连接/模型/图/线程/错误码）。
10. **九状态联动**（R-AGT-04，**不新增第 10 个状态**）：请求发出 → `running`（"执行任务"；不用 `review` 是因为它是 `once` 一次性动画 + 星屑庆祝，语义是"完成了"）；失败/降级 → `failed`（1500ms 后回 `running`，聊天框还开着不算待机）；答复完成 → `review`（"完成反馈"）+ `waving` 的意图由 `openChat()` 的 `running` 承接。
11. **复位**（R-PET-04 的硬要求）：`chatSession` 计数器 + `AbortController` + `thinkTimer` 三件套 —— 关聊天框、Swup 切页、连续提问时**迟到的结果一律丢弃**，状态由 `endTrip()` / `closeChat()` 复位。⚠️ `closeChat()` 只 `abort()` 不断流会让 `fetch` 抛 `AbortError`，**必须同时作废会话号**（登记为 T51）。

**测试落点（`pnpm verify:ui` 的 R-AGT 段，18 条）**

| 断言 | 做法 |
| --- | --- |
| 产物里 `enable` 是 true | 在**产物自己的 chunk 集合**里找到那份带 `graphId` 的 agent 配置，核对 `enable` 为真（⚠️ v1.35 起不再写死文件名：`agentConfig` 会随打包在 `AemeathPet.*.js` 与 `config.*.js` 之间搬家，写死会静默失配 —— 见 T59） |
| `enable:false` 零请求 | 注入 `{enable:false}` + 包装 `fetch` 计数 → 真机走一遍"右键菜单 → 聊天 → 键入 → 提交"，打到 `127.0.0.1:2024` 的请求数必须 **0** |
| 真往返 + 人设口径 | 注入 `{enable:true}` 再走一遍：计数 **>0**、气泡文本无完整域名 / 无表格 / 无加粗 / 无「您」、且**不是出厂 mock 台词**（⚠️ 判据是"不等于 mock 原文"，不是"首字不是 `在的`"：真后端会回以「在的。」开头的正常答复） |
| `interrupt` + 续跑 | 真机问「推荐几篇讲 Linux 的博客」→ 气泡里出现反问 → 回组件推出的约定词 → 拿到**真的后端答复**（两种合规结局都认：一轮收口 / 先答复再反问）、禁词 0 命中。⚠️ **后端文章库偶发连不上时如实记 SKIP，不算通过** |
| 死端口降级 | 注入 `baseUrl=http://127.0.0.1:2099`（测完还原）→ 仍可用、走 mock、`data-pet-state` 序列含 `failed`、整页无禁词 |
| 状态联动与复位 | 死端口跑两次提问，用 `MutationObserver` 记 `data-pet-state` 序列；关框后回 `idle`；Swup 切页后不卡在思考态 |
| **长答复可读（v1.35 新增）** | 页面内假后端回 **500 字** → 量气泡几何：首行可见（`top ≥ 0`）、整块在视口内、`overflow-y:auto`、`scrollHeight > clientHeight`（可滚），并**截图** `pet-agent-long-answer-1440.png`；另加一条"旧病灶不复发"（不复核实测的 `top=-15` / `overflow-y:visible` / 436px） |
| **禁词闸门（v1.35 新增）** | 页面内假后端把 `可用的表:blog, blog_content` 当**最后一条 ai 答复** → 气泡**一个字都不许出现**该字符串，改走 mock（复核 D-6） |
| **失效自愈（v1.35 新增）** | 页面内假后端让第 2 次 `runs/stream` 回 **404** → 断言真实请求流水恰好是「t1 成功 → **复用 t1** 吃 404 → 新建 t2 重试成功」（既证自愈、又证线程跨轮持有），且第 2 问拿到答复 |
| **`/state` 不压关键路径（v1.35 新增）** | 页面内假后端让 `GET /state` **永不响应** → 断言答复仍在 **1~3 秒**内上屏、且这一轮 `/state` 调用次数为 **0**（复核 D-4） |
| **协议不符立刻降级（v1.35 新增）** | 页面内假后端发一个白名单外事件后**挂着不动** → 断言 **6 秒内**出现降级台词且假答复一个字都没渲染（复核 D-9；旧实现要等 60 秒看门狗） |
| **在飞时再发送有反馈（v1.35 新增）** | 流挂着不动时打第二句并提交 → 断言气泡出现可见反馈、**输入框仍留着用户刚打的字**（不清空）、`busy` 仍为真（复核 D-9 的第二个病灶） |
| 还原 | 测完 `delete window.__imissAgentConfig` 并断言已删 |

> **为什么要注入开关**：`enable` 是构建期常量，"零请求"与"真往返"要在**同一份产物**上各证一次；build 两次会留下与交付物不一致的产物。注入钩子（`window.__imissAgentConfig`，白名单只放 `enable`/`baseUrl`/`timeoutMs`）只在 `verify:ui` 里被写入，正常运行路径上这个全局量不存在。
>
> **v1.35 起还有第二种注入：页面内假后端**（地址 `http://127.0.0.1:2026`，**不监听任何端口**，纯内存应答）。上面标"v1.35 新增"的那六条用它——因为真后端是个**正常服务**，给不了畸形响应、`/state` 挂住、500 字长答复、404 失效这些输入。做法是在 `arm()` 里、**计数器包装之后**再包一层 `fetch`（顺序很重要：先计数后造假，"到底发了几次请求"才数得准），走的仍然是**同一份交付产物 + 同一套真机路径**（真右键、真键盘）。
>
> **纯逻辑的那部分在另一处**：SSE 解析器的字节级反例（跨 chunk 的 `\r`、EOF 未闭合、单事件超限）、`command.resume` 载荷形状、约定词推法、`/state` 的调用条件——这些不需要浏览器，落在 **`pnpm verify:agent:robust`**（`scripts/verify-agent-robust.mjs`：esbuild 把真源码打成临时 ESM + 内存假 fetch，**26 条、零外部依赖**）。为什么不在 `verify:ui` 里做：那要多起一次 Chrome，而这组是纯逻辑，该在 CI 里几秒跑完。

---

## 9. 内容迁移流水线（R-CNT）

### 9.1 源数据画像（2026-09-24 实测，脚本 `reports/census-source.mjs` → `reports/_p4-census.json`）

| 项 | 情况 |
| --- | --- |
| 文章 | `dosc/blog/**/*.md`，**135 篇 / 3.63MB**，**0 篇有 frontmatter**（`图片/` 目录下另有 1 篇误入的散篇 `linux/POSIX 信号量….md`，忽略）<br>**注**：立项时估的是 142 篇，实测是 135 篇；下面所有数字都是实测值 |
| 目录 = 分类 | AI应用（3 篇）、C++11（6）、C与C++（28）、Linux系统（27）、linux网络（13）、MySQL（6）、stL（6）、八股（12）、基础算法（28）、项目（6，下设 `My_Server` / `搜索引擎`） |
| 图片引用 ① | Obsidian 嵌入 `![[…]]`：**125 处**（实测**全部是图片**，0 条笔记嵌入） |
| 图片引用 ② | HTML `<img …>`：**216 处**，其中 **204 个是外链**（`cdn.jsdelivr.net` 161、`s2.loli.net` 28、其余零散；抽样 8 个全部 HTTP 200 存活） |
| 图片引用 ③ | 标准 Markdown `![](…)`：**150 处**（125 处在 `AI应用` 两篇、其余多是 shields.io 徽章与远程图） |
| 汇总 | 本地引用 **258** / 远端引用 **233** |
| 图片文件 | `图片/<分类>/<文章名>/*.jpg`，**35 个目录 / 169 张**，hash 或 `Pasted image <时间戳>` 命名 |
| 重复图片目录 | `图片/linux` 与 `图片/linux系统`：**36 个同名文件大小完全一致**（同一批图），解析时合并成一个池，优先取 `linux系统` 那侧 |
| 完全重复的文章 | **只有 2 组**（MD5 一致）：`二分.md`／`二分算法.md`、`动态规划.md`／`动态规划思想.md`。立项时记的第 3 组 `linux基础知识点.md`／`linux基础知识点（1）.md` 在源目录里**不存在** |
| 缺图 | **138 处**本地引用在磁盘上没有对应文件：`AI应用` 两篇 **125**（`page-*.png` 整批没导出）、`Linux系统/ELF文件` 5、`八股` 4 篇 8 |
| 图片 ↔ 正文能不能对上号 | **能，而且大部分能**：258 条本地引用里 **116 条**在本文章的图片目录里按同名命中，**4 条**（`右值引用与移动语义` 的 3 张 + `进程状态` 的 1 张）在全库唯一同名命中 → 剩下 **138 条**才是真缺图。**这条推翻了 §9.2 原来的假设**（详见下节） |

### 9.2 迁移流水线（`scripts/import-posts.mjs`，P4-1 已实现）

```
dosc/blog/**/*.md（只读）
   │
   ├─(1) 去重筛选 ──→ MD5 相同的只留一篇（优先"被双链指向的名字"，再取短名）
   ├─(2) 生成 slug ─→ pinyin-pro 逐段转 ASCII，如 C++11/智能指针 → cpp11/smart-pointer
   │                  （`C++`→`cpp`；同分类内重名自动加 -2）
   ├─(3) 生成 frontmatter ─→ title/published/category/tags/description/lang/draft/series
   ├─(4) 图片解析 ──→ 本文章图片目录同名 → 全库唯一同名 → 都没有就记警告
   │                  命中的复制到 public/images/posts/<slug>/NN.ext（引用顺序编号，不重编码）
   ├─(5) 正文改写 ──→ ![[图]] / ![](…) / <img src> → /images/posts/<slug>/NN.ext
   │                  [[双链]] → 站内链接；文首与行内 #标签 → frontmatter + 从正文摘掉；
   │                  缺图引用 → `> [!WARNING]` 提示块；相邻两行图片之间补空行
   └─(6) 写出 ──→ src/content/posts/<分类目录>/<slug>.md（+ reports/import-report.json）
```

**默认 dry-run**：不加 `--write` 只打印将要产生的文件与警告。参数：`--batch 1..5|all`、`--cat`、`--only`（可重复）、`--limit`、`--src`、`--quiet`。

> **⚠️ 与本文档旧版的差异（重要，已实测推翻）**：旧版写"源图是 hash 命名、正文里是 `Pasted image …`，两者之间没有任何可用线索，所以只能顺序映射"。
> **实测：不对。** 源笔记导出时正文引用已经被改写成与磁盘一致的文件名——258 条本地引用里 **116 条能在本文章的图片目录里按同名精确命中**、4 条全库唯一同名命中，只有 138 条真的没有文件。
> 所以脚本**只做文件名精确匹配，绝不按顺序猜**：猜错位置（张冠李戴）比缺图更糟，而且无法事后发现。

**frontmatter 生成规则**

| 字段 | 规则 |
| --- | --- |
| `title` | **文件名去 `.md`**（`README.md` 用覆盖表 `八股/README.md → 八股文面试总结 · 写在前面`）。<br>⚠️ 旧版写"有 H1 就以 H1 为准"，实测**不能用**：`stL/Stack.md` 的首个 H1 是"核心概念"、`基础算法/前缀和.md` 的首个 H1 是"一维前缀和"，那是小节名不是文章名。H1 只在"与标题规范化后相同"时才从正文删掉（避免重复标题） |
| `published` | 文件 mtime（`YYYY-MM-DD HH:mm:ss`）。**需要发起人确认是否接近真实写作时间**——源笔记没有 frontmatter、也没有别的可信日期 |
| `category` | 一级目录 → 映射表（见下），同时决定站内目录与 URL：`/posts/<分类目录>/<slug>/` |
| `tags` | **作者自己写的 Obsidian 标签行**（`#预处理 #前缀 #基础算法` → `tags: [算法, 预处理, 基础算法]`）+ 分类名；按规范化去重（`Linux系统` 与 `Linux 系统` 算同一个、"八股"是"八股文"的一部分不重复）；上限 8 个 |
| `description` | 正文里**最早出现的**可读文字（跳过围栏代码块 / 缩进代码 / 表格 / 图片 / 标题 / 数学块），列表项也算（作者的笔记大量用列表写）；截 120 字。⚠️ 两个坑：只判断"这一行像不像块级语法"会让**代码块内部**的行混进摘要；按空行分段又会把"短标题行 + 列表"拼成半截摘要 |
| `lang` | `zh_CN` |
| `draft` | `false`；**整篇一张图都解析不到时 `true`**并在正文顶部加 `> [!IMPORTANT]` 说明 |
| `comment` | `true` |
| `series` / `seriesOrder` | 项目类按子目录设 `My_Server` / `搜索引擎`；序号按 time 排序给 1..n |
| **不写 `slug`** | 站内目录已经承担了分类前缀，写 `slug` 反而会让 URL 丢掉分类层级（glob loader 见到 `slug` 会直接拿它当 entry id） |

**分类映射表（一级目录 → `category` / 站内目录）**

| 源目录 | category | 站内目录 | 备注 |
| --- | --- | --- | --- |
| AI应用 | AI 应用 | `ai` | 2 篇缺图（125 张 `page-*.png`），`draft: true` 隔离 |
| C++11 | C++11 | `cpp11` | |
| C与C++ | C/C++ | `cpp` | |
| Linux系统 | Linux 系统 | `linux` | 与 `图片/linux`+`图片/linux系统` 两个池合并 |
| linux网络 | Linux 网络 | `linux-net` | |
| MySQL | MySQL | `mysql` | |
| stL | STL | `stl` | |
| 八股 | 八股文 | `interview` | 长文（1.1MB），批次最后迁；见 B-13 |
| 基础算法 | 算法 | `algorithm` | |
| 项目 | 项目实战 | `project` | 下设 `My_Server` / `搜索引擎` 两个 series |

**图片处理策略（P4-1 定型）**

1. 目标目录：`public/images/posts/<slug>/`（**public 资源**，不进构建期图片优化管线——全量图片进 `src/` 会把构建时间拖得很长）。**复制是纯复制，一个字节都不重编码**（画质优先，发起人明确要求）。
2. 命名：`NN.ext`，NN = 该图**第一次被引用**的顺序（`01`、`02`…），扩展名保持原样（png/jpg/webp）。同一张图被引用两次只复制一份、复用同一路径。
3. 解析顺序：**本文章图片目录同名**（含 NFKC 规范化与去尾空白）→ 去掉 Obsidian 重名后缀（` 1`，**只吃 1~2 位数字**）再试 → **全库唯一同名** → 都没有则判定缺图。
4. 缺图处理：那一处引用换成 `> [!WARNING]\n> 原图缺失：\`<原文件名>\`（源导出里没有这个文件，见 PROJECT_STATUS 阻塞项）`，并记进 `reports/import-report.json`；**整篇都缺图**时额外置 `draft: true`。
5. 每次 `--write` 另写 `reports/image-mapping-<slug>.json`（原文件相对路径 → `NN.ext` 的完整对照），便于人工核对"第 i 个引用 = 第 i 张图"。
6. `AI应用` 两篇：`images/page-*.png` 全缺 → 按 R-CNT-07 处理（`draft: true` 不上线，登记 B-06）。

### 9.3 分批策略（R-CNT-01 / R-CNT-02）

| 批次 | 范围 | 目的 |
| --- | --- | --- |
| 批次 1 | 精选 15~20 篇，覆盖六类：有图 / 无图 / 超长文 / 含表格 / 含代码块 / 含 `![[...]]` | 验证规则、定型脚本、统一排版 |
| 批次 2 | C++11 + C与C++ + STL | 中等体量，重复结构多 |
| 批次 3 | Linux系统 + linux网络 + MySQL | 图片最多的部分 |
| 批次 4 | 基础算法 + AI应用 | 含缺图与超长错题本 |
| 批次 5 | 八股 + 项目 | 最长文（几十万字节），单独跑以免拖慢迭代 |

### 9.4 校验与隔离（R-CNT-06，`scripts/verify-posts.mjs` → `pnpm verify:posts`）

阻断式（有错误退出码 1），逐项检查：

| 检查 | 失败处理 |
| --- | --- |
| frontmatter 可解析、`title`/`category` 非空、`published` 可解析为日期、`tags` 是字符串数组、`draft` 是布尔 | 报错 |
| slug（相对路径去掉扩展名）唯一且 ASCII 小写 | 报错 |
| 正文非空 | 报错 |
| 正文里所有**本地**图片路径存在、且不是 0 字节（`/images/posts/...` 与相对路径都查；外链跳过） | 报错（列出文件:行号） |
| `frontmatter.image` 非外链时文件存在 | 报错 |
| `rankConfig` 每条 `title` 非空、`cover` 文件存在 | 报错 |
| 正文没有标题 | **警告**（见下） |
| 正文残留 `![[`、`[[`、`%%`、`^blockid` | 警告（并列出位置） |
| 站内链接 `/posts/...` 的目标文章存在 | 警告（分批导入期间必然出现） |
| 标题在两篇之间重复 | 警告 |

**与旧版文档的差异**：「正文至少有一个标题」从**报错**降级为**警告**。原因：源笔记 `AI应用/SDD.md` 全篇只有一条编号清单、没有任何标题，那是作者原本的写法——迁移脚本不该替它编一个标题，把它挡在构建外反而丢内容。

**隔离**：默认只报告、不动文件；加 `--quarantine` 才把"有错误"的文章移到 `src/content/_quarantine/`（**在 `posts` 集合的 glob 之外**，Astro 不会构建）。这与模板自带的 `scripts/quarantine-bad-posts.mjs` 思路一致——该脚本里的 `stripCode()`（先把代码块/行内代码剥掉，再判断图片引用）与"外链不算本地图"的判断，**已按同样规则复用**，不要重写。

**实测（P4 批次 1 落盘后）**：32 篇（18 篇迁移 + 14 篇上游示例/文档）**0 错误、6 条警告**——4 条站内链接指向本批次还没导入的文章（`/posts/algorithm/qianzhuihe/` ×2、`/posts/algorithm/chabingji/`、`/posts/cpp/hongheishu/`、`/posts/algorithm/bfs/`）、1 条 `ai/sdd.md` 没有标题、1 条上游 `draft.md` 本身是草稿（信息项）。

### 9.5 只读约定与**交付节奏**（R-CNT-08）

`dosc/**` 全程只读：迁移脚本只读取、只输出报告，绝不修改源文件；`图片\linux` 这类重复目录也不删除源，只是在流程中忽略。

**交付节奏（发起人 2026-09-24 澄清，最终版）**：**闸门只有一道** ——

```
先导批次（18 篇）交发起人确认
   ├─ 发起人说"没问题" ─→ 一次性全量导入（批次 2 → 3 → 4 → 5 连着跑完，逐批出报告）
   └─ 发起人提了意见   ─→ 先改到确认，再开全量
```

**我方自检通过 ≠ 可以抢跑全量**（自检只说明"可以交给发起人看了"）；但**发起人确认之后不要再逐批停下来问**——"每批都等确认"是我理解错的一版。P5/P6 同理：阶段做完交发起人确认后再进下一阶段。

---

## 10. 数据模型汇总

| 模型 | 位置 | 关键字段 |
| --- | --- | --- |
| 文章 | `src/content.config.ts` → `posts` | `title` `published` `updated?` `draft` `description` `image` `tags` `category` `lang` `pinned` `author` `series` `seriesOrder?` `comment` `password?` |
| 动态 | 同上 → `dynamic` | `published` `pinned` `location` |
| 项目 | 同上 → `projects` | `title` `published` `description` `image` `tags` `link[]` `status` |
| 榜单 | `src/types/rankConfig.ts` | 见 §5.3 |
| 桌宠 | `src/types/petConfig.ts` | 见 §7.3 |
| Agent 文章索引 | `agent/data/blog-index.json` | `slug` `title` `description` `tags` `category` `published` `url` `excerpt` |
| Agent 榜单 | `agent/data/rank.json` | 与 `rankConfig` 同构 |

**约定**：文章内图片一律用 `public` 路径（`/images/posts/<slug>/01.jpg`）；封面/壁纸/榜单配图/桌宠图集用 `src/assets` 相对路径（自动优化 + LQIP）。

**文章 URL 形态（P4 定型）**：`/posts/<分类目录>/<slug>/`（如 `/posts/linux-net/http-xieyi/`）。文件放 `src/content/posts/<分类目录>/<slug>.md`，**frontmatter 里不写 `slug`**——glob loader 见到 `slug` 会直接把它当 entry id，URL 就会丢掉分类层级（`/posts/http-xieyi/`），那样不同分类下的同名文章还会互相撞。重写双链时用的也是这个形态（`toPostId` / `createPostUrl` 与 `src/plugins/remark-wiki-link.js` 一致）。

---

## 11. 脚本与命令

| 命令 | 作用 | 新增 |
| --- | --- | --- |
| `pnpm dev` | 本地开发（默认 4321 端口） | — |
| `pnpm check` / `pnpm type-check` | Astro 诊断 / TS 校验 | — |
| `pnpm build` | 完整构建（图标 → LQIP → VNDB 封面 → Astro → 字体子集 → 内联脚本压缩 → Pagefind） | — |
| `pnpm preview` | 预览构建产物 | — |
| `pnpm format` / `pnpm lint` | Biome 格式化与检查 | — |
| `pnpm verify:posts` | **内容校验**（`scripts/verify-posts.mjs`，阻断式）：frontmatter 完整性 / slug 唯一且 ASCII / 正文非空 / **本地图片存在且非 0 字节** / `frontmatter.image` 存在性 / 站内链接目标存在 / 残留 Obsidian 语法 / 标题重复 / `rankConfig` 的 title 与 cover。`--quarantine` 可把出错文章移进 `src/content/_quarantine/` | ✅（P4 新增） |
| `pnpm verify:ui` | **界面验收**：开真实 Chrome 跑 **257 项功能断言**（导航顺序、站点名、色相、**上游信息/打赏入口泄漏扫描**、统计行数、热力图、占位模式、页面可达性、sitemap/**llms.txt**、配色对比度、**排行榜全项**：几何比例 / 两档名次色与对比度 / 切换与 URL / Swup 路径回归 / 键盘 / 后退 / 打印与无 JS 兜底、**P4 内容迁移全项**：配图真实加载 / 编号顺序 / 移动端 / 不生成 figure 图注 / URL 形态 / 双链改写 / 无 Obsidian 残留 / 表格与代码块 / 无标题短笔记 / 归档与分类收录），并输出 **51 张**截图到 `reports/screenshots/`。P3 起含桌宠与壁纸全项（九状态触发 / 键盘 / 拖拽 / 菜单 / 联动 / reduced-motion / 与浮动按钮不重叠 / 移动端隐藏 / 取景与暗罩），**P3-R-PET-06 起含三档运动模式全项**：默认档为 `float` 且悬空（底部距视口底 > 120px）/ 强制起飞后坐标真的变化且飞行中带 `data-pet-flying` / 飞行全程不出视口 / 固定档 1.6s 两次采样坐标完全相同且拖放不落地 / 贴地档松手回地面高度 / 三档都不与右下角浮动按钮重叠 / reduced-motion 下 `float` 两帧 `transform` 相同（静态悬浮）/ 位置记忆仍生效且模式以配置为准；**R-PET-07 起含飞行手感与菜单摆位**（位移 60~180px / 时长 4~6s / row4 姿态 / 菜单四边在视口内）；**R-PET-08 起菜单判据全部换成左右摆位**（并排在宠物左/右、纵向顶部对齐、哪边够放哪边、5 点 `elementFromPoint` 命中、被遮挡换边、两侧都被挡的两级兜底、`data-pet-menu-side` 取值与层级不变），并新增**菜单项与下落/上升行为**断言（档位二选一显示「落下去」/「飘起来」、点「落下去」后 y 在 3 秒内落到地面线且 `data-pet-mode=ground`、点「飘起来」后反向回到悬浮档）。⚠️ **数字基准是"对 `pnpm preview` 的静态产物跑"**：对 `pnpm dev` 跑会少 12 条（4 条 noindex 存根 + sitemap 4 条 + llms.txt 2 条 + `/rank/` 存根 + noscript/class 兜底），那时的旧口径 145 就是这么来的，别拿它当基准 | ✅（P1 新增，P2/P3/P4/R-PET-06/R-PET-07/R-PET-08 六次扩容） |
| `node scripts/import-posts.mjs` | **旧博客迁移**（默认 dry-run）：`--write` 落盘、`--batch 1..5`、`--cat`、`--only`、`--limit`、`--src`；报告写 `reports/import-report.json` | ✅（P4 新增） |
| `pnpm verify:docs` | **文档一致性自检**（`scripts/verify-docs.mjs`）：核对三份文档互相之间、以及文档与仓库事实是否一致——版本号与"最后更新"日期、断言/截图数与最近一次实测、排行页清单与路由文件、导航子项与 `navBarConfig.ts`、需求编号引用闭环、阻塞项条数与编号连续、§2 与 §3 阶段状态，以及**配置事实**（`displaySettingsConfig.enable`、`rankConfig.dataStatus`、"4 组数据"类说法是否漏了第 5 份）。**每次收工前跑一次**（P2 加二游排行时文档漂移了 12 处，就是没有这道关卡） | ✅（v1.12 新增） |
| `pnpm verify:agent` | **Agent 接口契约自检**（`scripts/verify-agent.mjs`，零依赖）：把 `ARCH.md` §8.9 的契约变成 **14 项断言**——配置对齐（读 `agentConfig.ts` 原文核对，**baseUrl/graphId 同时认字面量、常量、函数回落三种形态**，见 T59）/ `GET /ok` / `GET /assistants/search` 去重后 4 张图 / 闲聊轮事件白名单+`values` 或 `updates` 收尾+与 `GET state` 一致+最终答复 / 检索轮「工具输出进了流但没进答复」/ 推荐轮 `interrupt`→`resume:「不提供」`（**原始汇总行会打出两轮的末事件名**）/ `configurable`+`context` 400 坑 / 降级探测（死端口不可用 + 活服务可用对照项）。**退出码规矩与其它 `verify:*` 不同**：Agent 没在跑 = **SKIP + 退出码 0**（打印 `langgraph dev` 启动命令），**契约不符 = 退出码 1**。⚠️ **SKIP 与 ✅ 必须长得不一样**（v1.35 起）：`⏭️ [SKIP]` 单列一行 + 单独打"跳过原因"，汇总行 `✅ 通过 N，❌ 失败 N，⏭️ 跳过 N` **三项分开计数**，并额外打一行"本轮 N 项**没有执行**（不计入通过）"；JSON 里带 `skippedIds`。产物 `reports/verify-agent.log` + `reports/verify-agent.json` | ✅（v1.33 / P5-0 新增；v1.35 修 D-1、SKIP 语义收紧） |
| `pnpm verify:agent:robust` | **适配层健壮性回归**（`scripts/verify-agent-robust.mjs`，**26 条**）：P5 独立复核那批"只有畸形输入才暴露"的缺陷的**可执行反例**。做法：用 esbuild（Astro 自带依赖）把 `src/utils/agent-client.ts` 打成临时 ESM（`reports/_agent-client.bundle.mjs`，gitignore 内）再 `import()` —— 测的是**真源码**，改一处代码这里立刻跟着变；再用 `globalThis.fetch` 的**内存假后端**喂畸形 SSE（跨 chunk 的 `\r`、EOF 未闭合、70KB 单事件、schema 行当答复、挂住的 `/state`、404 失效、5 万字答复、宽松问句）。覆盖 D-2/D-3/D-4/D-5/D-6/D-8/D-9/D-15/D-16/D-17/D-18。**不依赖真后端、不起浏览器、不起服务**（几秒跑完，CI 可跑）；退出码：有失败 = 1。产物 `reports/verify-agent-robust.log` + `.json` | ✅（v1.35 / P5 复核修复新增） |
| `pnpm verify:ui` 的 **R-AGT 段** | **端到端联动断言（21 条，见 §8.10）**：产物里 `enable` 是真的（不写死 chunk 文件名）/ `enable:false` **零请求** / `enable:true` 真往返 + 人设口径（无「您」无加粗无表格无完整域名 + 不是出厂 mock）/ `interrupt` 反问进气泡 + 续跑拿到真答复 / 死端口降级仍可用 / 状态联动与复位（关框、Swup 切页、连续提问）/ 气泡与整页 DOM 无禁词表 / 注入已还原；**v1.35 起另加 6 条用"页面内假后端"跑的反例**：500 字长答复可读可滚（带截图）/ 禁词闸门 / thread 404 自愈 / `/state` 永挂仍 1~3 秒上屏 / 协议不符立刻降级 / 在飞时再发送有可见反馈。⚠️ Agent 没在跑时**真往返那两条记 SKIP 不计失败**（与 `verify:agent` 的退出码规矩一致：环境未就绪不算回归）。**R-PET-11 起这段里还挂着聊天框的 19 条**（同一个"页面内假后端"手法，见 §7.6 第 27 条）。**v1.37 加 3 条**：① **身份类禁自称**（发起人 2026-09-27 决定）：同一会话里连问 5 条身份问题，只扫**她说的那部分**（不扫整页——站内本来就有讲 AI 的文章正文；也不扫用户那句话——`AI` 是他打的），**6 个自称词 0 命中、且每条都明确「我是爱弥斯」**，另加"不许越过底线（自称真人 / 冒充官方）"的反向判据与"起手历史必须为 0"的前置自检；② **"同一句答复被重复上屏"的回归**：假后端**仿真实 langgraph**（首快照 = 整份 state，含上一轮答复）返回 R1 长 / R2 短，断言**第二问的气泡是第二问的答复且不残留 R1**（旧实现在这里会停在第一句，见 T69）；③ **降级必须一眼可分辨**：面板带 `data-pet-chat-source`、台词走"接不上话"起头池、**连着两次不重样**、且不与真答复同形 | ✅（v1.34 / P5-1~P5-3 新增；v1.35 加 6 条 + 修 2 条假红口径；v1.36 挂上 R-PET-11 的 19 条；v1.37 加身份类禁自称 + 重复上屏回归 + 降级可分辨 3 条） |
| `pnpm make:logo` | 把 `src/assets/images/logo/imiss-logo.svg`（手写矢量设计源）栅格化成导航栏 Logo（webp）与 favicon 四档 PNG | ✅（P1 新增） |
| `node scripts/make-rank-cover-guide.mjs` | 生成榜单配图比例对照图 `docs/imiss/rank-cover-guide.png`（16:9 原图裁成 5.7:1 后哪一条留下；发起人准备素材时看这张） | ✅（v1.13 新增） |

> **关于 `verify:ui` 的对比度检查**：主体走"token 级"校验（`--deep-text`/`--content-meta`/`--btn-content`/`--primary` 对卡片底/页面底），不是"扫全站文字元素"。
> 原因：这个主题里大量文字压在封面图、壁纸、半透明面板上，逐元素自动判定无法可靠取得背景色（试了三版：canvas 转色 → 逐层合成 → Node 侧解析，期间还产出过"66/71 元素低于 3:1"的假警报）。
> P2 补了两处**具体**的对比度断言（不依赖背景取色）：① 名次数字对名次底色（`getComputedStyle` 直接读两个颜色，白字压粉底 ≥ 3:1、深字压橙底 ≥ 4.5:1）；② 缺图占位把渐变各档合成到不透明底色上取最亮值，与白字算对比度（暗/亮主题各一条）。
> 观感部分仍然是"**可复现的数字交给脚本，观感交给截图**"：脚本每轮输出 54 张截图并人工核对；另外把 `--hue` 在 345 与 165 之间切换做 A/B，证明"换色没让对比度变差"。

---

## 11.1 内容迁移相关（P4 新增）

| 命令 / 脚本 | 作用 | 状态 |
| --- | --- | --- |
| `node scripts/import-posts.mjs [--write] [--batch n] [--cat x] [--only y] [--limit n]` | 旧笔记迁移（默认 dry-run） | ✅ P4-1 |
| `pnpm verify:posts` | 内容校验（阻断式，见 §9.4） | ✅ P4-3 |
| `reports/census-source.mjs` / `ref-resolve.mjs` / `ref-missing.mjs` | 源数据清点与引用解析诊断（只读探针，产物 `reports/_p4-census.json`） | ✅ P4 一次性 |
| `reports/check-code-fidelity.mjs` | 逐块比对"源笔记代码块 vs 导入后代码块"（含行尾空白） | ✅ P4 一次性 |
| `node scripts/convert-wallpaper.mjs` | 壁纸图 → webp | ✅ P3 |

---

## 12. 部署架构（R-DEP）

### 12.1 拓扑

```
公网
 │
 ├─ 443 → Nginx
 │        ├─ /            → root /var/www/imiss-blog/dist（静态）
 │        ├─ /_astro/     → 一年缓存，immutable
 │        ├─ /assets/     → 30 天缓存（含视频，需支持 Range）
 │        └─ /api/        → proxy_pass http://127.0.0.1:8000（SSE，禁用缓冲）
 │
 └─ （不对外）127.0.0.1:2024  LangGraph Server
              127.0.0.1:8000  网关（FastAPI）
```

### 12.2 `deploy/nginx.conf` 要点

```nginx
server {
  listen 443 ssl;
  http2 on;
  server_name imiss.example.com;          # 域名待提供
  root /var/www/imiss-blog/dist;
  index index.html;

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;

  # Astro 产物带内容哈希，可长缓存
  location /_astro/ { expires 1y; add_header Cache-Control "public, immutable"; }
  location /assets/ { expires 30d; add_header Cache-Control "public"; add_header Accept-Ranges bytes; }

  # trailingSlash: always → 每个路由都是目录 + index.html，不需要 SPA 回退
  location / { try_files $uri $uri/index.html =404; }

  # 自定义 404 页：Astro 把 src/pages/404.astro 输出成 dist/404.html
  error_page 404 /404.html;
  location = /404.html { internal; }

  # 已关闭的页面给「真 404」
  # 静态输出下 Astro 只会生成一个 HTTP 200 + meta refresh + noindex 的跳转存根（见 §14.3 T17），
  # 这里直接掐掉，让线上返回真正的 404 状态码（并落到上面的 404 页）
  location = /friends/  { return 404; }
  location = /bilibili/ { return 404; }
  location = /bangumi/  { return 404; }
  location = /sponsor/  { return 404; }
  # 存根里的 meta refresh 目标是 /404/（带斜杠），这个路径本身没有产物，一并给 404
  location = /404/      { return 404; }

  # /rank/ 是 /rank/jp/ 的跳转存根（静态产物下是 200 + meta refresh，且已从 sitemap 排除）
  # 线上用真 301 接管，省掉那 2 秒的 meta refresh 等待
  location = /rank/     { return 301 /rank/jp/; }

  location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;            # SSE 必须
    proxy_read_timeout 300s;
    proxy_set_header Connection "";
  }
}
```

### 12.3 发布流程

```powershell
pnpm verify:posts          # 1) 内容校验不过就停
pnpm build                 # 2) 产出 dist/
# 3) 上传 dist/ 到服务器（rsync / scp / git 拉取后构建）
# 4) Nginx 无需 reload（纯静态覆盖）；改了 nginx.conf 才需要 nginx -t && systemctl reload nginx
```

**服务器上的依赖安装**（只有首次/依赖变更时需要）：

```bash
pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com   # 直连 npmjs 慢或超时时加镜像
```

- P0 实测：本机直连 `registry.npmjs.org` 只有 32–46 KiB/s，多个 tarball 超时导致安装失败；换 `registry.npmmirror.com` 后 48.5s 装完。（镜像写在命令行/用户级 `.npmrc`，**不写进仓库的 `.npmrc`**，避免把个人环境偏好带进项目。）
- `pnpm install` 之后 `pnpm build` **全程不需要外网**（§14.3 T16 + R-DEP-04 已实测）。

### 12.4 部署后回填清单（R-DEP-03）

1. `siteConfig.site_url` 填真实域名 → 重新构建（sitemap/RSS/OG 依赖它）。
2. 站点信息组件的 `placeholder` 关掉 → 显示真实构建信息。
3. 社交分享自检：把首页与一篇文章链接丢进任意 OG 调试工具，标题/摘要/图正确。
4. `dist/sitemap-*.xml` 里不应出现 `/friends/`、`/bilibili/`、`/bangumi/`、`/sponsor/`。

---

## 13. 性能预算与实施要点

| 项 | 预算 | 实施要点 |
| --- | --- | --- |
| 首屏视频 | ≤ 12MB | 原片直出；超预算则用 8Mbps 回文版；`saveData` 与 reduced-motion 不下载 |
| 首屏图片 | 单张 ≤ 400KB | webp q82、长边 ≤ 2560 |
| 桌宠图集 | ≤ 350KB | 单文件 + CSS 取帧，无逐帧请求 |
| 文章内图片 | 全量 ≤ 60MB | 已在源头压缩；`public` 直出，不进优化管线 |
| 榜单配图 | 单页 ≤ 1.5MB（**单张 ≤150KB**，每页 10 张） | 5.7:1、推荐 1600×280（§5.5）；格式不限，构建期自动转 webp/avif 多档；配 `loading="lazy"` + `decoding="async"` |
| JS 体积 | 不引入新运行时 | 桌宠与榜单切换用原生 JS/Svelte 岛，不引第三方动画库。⚠️ **例外（已实测）**：`displaySettingsConfig.wallpaperModeSwitchable` 开启（R-ID-07，访客可切壁纸模式）会让**每页 HTML +11.6 KB**（38 页合计 +439.7 KB；`_astro/*.js` 总量无变化）——低于上游注释估的 +33 KB/页，但仍是每页都要付的代价 |
| 构建时间 | 全量内容 ≤ 10 分钟 | 文章图走 `public`；`src` 图片只保留封面/壁纸/榜单/桌宠 |
| 动画性能 | 只改 `transform`/`opacity` | 桌宠与樱花统一由 `requestAnimationFrame` 驱动；后台暂停 |

---

## 14. 风险、取舍与决策记录

### 14.1 风险登记

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 上游 Firefly 升级覆盖自定义 | 改动丢失 | 改动集中在 `src/config/*` 与**新增文件**；核心组件只做最小编辑（`SiteStats.astro`、`SiteInfo.astro`、`Layout.astro` 各一处） |
| 图片顺序映射不可靠 | 文章配图张冠李戴 | 批次 1 逐篇人工核对；数量不一致就报错不猜；报告文件留痕 |
| 壁纸源素材分辨率不足 | 大屏发糊 | 图片期明确标注"临时"；正式方案换 ≥2560 宽的视频 |
| 视频壁纸体积 | 首屏慢、费流量 | 三种降级 + 按需加载（`preload="none"`，`play()` 触发） |
| Agent 外部依赖（DeepSeek/LangSmith）不可达 | 桌宠不能聊天 | 前端 mock 兜底；网关 health 探测；不阻塞页面任何功能 |
| 构建期联网 | 断网构建失败 | VNDB 封面关闭、MAL 未配置则跳过；`pnpm build` 全程无外网验证一次 |
| 中文字体子集 | 首屏字体闪烁 | 沿用模板的 `subset-fonts` 流程，不额外引字体 |
| 密钥泄漏 | 费用与安全问题 | 只在服务端 `.env`；`.gitignore` 覆盖；`.env.example` 只放占位 |

### 14.2 决策记录（简版 ADR）

| # | 决策 | 备选 | 理由 |
| --- | --- | --- | --- |
| D1 | 在 Firefly 上二次开发，不另起栈 | 继续用 `blog_test` 纯静态原型 | 模板已有内容集合、搜索、i18n、图片管线、壁纸与视频播放器；原型的价值是"已验证的做法"，不是运行时 |
| D2 | 排行数据放 TS 配置文件，只有一期 | CMS / 外部 API / 数据库 | 手工维护、主观排名、零后端；TS 有类型校验，改错立刻暴露 |
| D3 | 文章内图片放 `public`，封面放 `src/assets` | 全部进 `src` | 142 篇的图片进优化管线会把构建时间拖长；封面/壁纸/榜单/桌宠量小，值得优化 |
| D4 | 桌宠挂在 Swup 容器之外常驻 | 每页各挂一次 | 避免切页重建带来的闪烁与位置丢失 |
| D5 | Agent 独立进程 + 网关，前端只用同源 `/api` | 直接在浏览器调 LLM | 密钥安全 + 可限流 + 可换模型；浏览器无法运行 Python 是硬约束 |
| D6 | Agent 首期用内存 checkpoint，不接 Postgres | Postgres / SQLite | 参考实现踩过 Windows `psycopg` 的坑；首期对话无持久化需求，等有需要再换 |
| D7 | 首期检索用关键词打分，不引向量库 | 向量检索 / 全文索引 | 142 篇文章规模下关键词足够；少一个依赖、少一份运维 |
| D8 | 页面移除只关入口，不物理删文件 | 删除组件与页面 | 降低回归风险；彻底清理作为独立任务评估 |
| D9 | 评论区先关闭但页面保留 | 直接删留言页 | 页面结构与导航一次到位，评论系统到位后只改一个配置 |
| D10 | 留言/评论与 Agent 解耦 | 用 Agent 当留言后端 | 两者目标不同（留言是异步公开记录，Agent 是实时对话）；耦合会让简单需求变复杂 |
| D11 | **人设「不许自称 AI，必须明确自己是爱弥斯」**（人设 v7，2026-09-27 发起人决定） | 保留 v6 的「被问是不是 AI 就诚实承认」 | **这是产品决定，由发起人拍板，不是技术偏好**：气泡里出现"我是 AI / 我是程序"会直接毁掉角色。**唯一保留、优先级更高的底线是不许越界到另一个方向**：不得宣称自己是真人、不得宣称自己是官方爱弥斯本人——否则就从"演得像"变成"给访客一个能截图打脸的硬伤"。落地只在后端人设文件（`agent/persona-aemeath-v7.txt` → `src/agent/common/persona.txt`），**契约与前端都不动**；验证是"真机问出来的字"（R-AGT 段身份类禁自称），不是"人设文件里写了什么" |

### 14.3 模板已知陷阱（P0 起逐阶段实测清单，现有 73 条，编号连续 T1~T73：T1~T19 来自 P0/P1，T20~T26 来自 P2，T27~T29 来自 P3，T30~T33 来自 P3-9/P3-11，T34~T38 来自 P4，T39~T40 来自 R-PET-06，T41~T42 来自 R-PET-07，T43 来自 R-PET-08，T44 来自 R-PET-09，T45~T46 来自 R-PET-10，T47~T48 来自 P5-0 契约冻结，T49~T58 来自 P5-1~P5-3 接线，**T53/T54 于 v1.35 补登记**（这两条在 P5-1 就被引用过、但一直没进表），**T59~T63 来自 P5 独立复核修复**，**T64~T67 来自 R-PET-11 聊天框重做**，**T68~T70 来自 v1.37 人设 v7 与"重复上屏"修复**，**T71~T73 来自 v1.38 父级独立复跑**）

实现时按这张表走，不要凭"应该没问题"假设。每条都给了文件与行号，可当场复核。

| # | 陷阱 | 影响 | 应对 |
| --- | --- | --- | --- |
| T1 | `WidgetSpecificConfig` / `SiteInfoConfig` 的真身在 `src/types/sidebarConfig.ts:37-52`；`src/types/config.ts` 只是 re-export barrel | 改错文件不生效 | R-WDG-03 改 `sidebarConfig.ts` |
| T2 | `SiteStats.astro` 的数组项（`stat.id`）与脚本里的 `'[data-stat-id="…"]'` 是**字符串字面量解耦**；只删一边会留死代码，或让页面永久显示初始值 `0` | 改动不完整 | 删数组项与删脚本必须同时（R-WDG-01） |
| T3 | `src/config/siteConfig.ts:317` 的 `mal.clientId` **带一个前导制表符**，且是形如真实凭据的 32 位十六进制串（上游示例值）；`mal-utils.ts:67-68` 会把它**原样**塞进请求头（不 trim） | 安全｜疑似真实凭据随仓库分发 | P1 清空为 `""`（新增需求 R-ID-05）；同理清掉 VNDB / Bangumi / Bilibili 的示例 ID |
| T4 | `siteConfig.pages` 是单点开关，联动 5 处：导航过滤（`nav-menu-utils.ts:7`）、页面 404 重定向（如 `myanimelist.astro:20`）、sitemap（`astro.config.mjs:242-280`）、`llms.txt`（`llms.txt.ts:97`）、VNDB 封面脚本（`generate-vndb-covers.ts:101`） | 关一个页面会连带 5 处 | R-NAV-07 逐页核对 |
| T5 | `navbar-i18n.ts:11-34` 用**字面量中文名**当 key 做翻译映射（"文章"/"社交"/"我的"/"链接"…），未命中即原样输出；`VNDB`/`AnimeList` 被有意排除在映射外 | 改名后该菜单项失去多语言翻译 | 本站只用 `zh_CN`，可接受；将来加语言时要同步 `NAVBAR_DEFAULT_NAMES` |
| T6 | `nav-menu-utils.ts:19-23` 会让"只剩 1 个可用子项"的下拉组塌缩成单项 | 关页面后导航形态会变 | 我们的组都有 ≥2 个子项（文章 4 / 排行 2 / 我的 7 / 链接 3），不受影响 |
| T7 | `ImageWrapper.astro:85-92` 找不到图时 `console.error` 且**不渲染任何 `<img>`**（只剩空壳 div + LQIP 渐变） | 配图路径写错不会出现裂图，而是"一片渐变"，肉眼很难发现 | 校验脚本必须逐个比对 `cover` 路径（R-CNT-06）；`src` 不能带 `./`、`../`，大小写必须与磁盘一致 |
| T8 | 新增 `src/assets` 图片后必须跑 `pnpm lqips`（或 `pnpm build`）才有正确占位色；缺失时静默用默认渐变 | 占位色不对但不报错 | `pnpm build` 链里已含 `generate-lqips`；只跑 `dev` 时改完图要手动补一次 |
| T9 | `minify-inline-scripts.ts:13` 用正则 `<script([^>]*)>` 扫 dist —— **属性值里含 `>` 就匹配不上**；且刻意设 `minifyIdentifiers: false`（内联脚本共享全局作用域，改名会炸） | 新写的内联脚本可能不被压缩，或被后置步骤改坏 | 桌宠内联脚本：属性值里不要出现 `>`；顶层变量挂 `window.__imissPet` 之类的唯一名 |
| T10 | Swup 只替换 6 个容器（`astro.config.mjs:125-132`）；容器外的 Navbar / Footer / FloatingControls / `#bg-player` / 移动底栏切页**不重渲染** | 放错位置会导致切页闪烁、状态丢失或脚本重跑 | 桌宠挂在容器之外（§7.2）；容器内的 `is:inline` 脚本必须自带 `window.__xxxInit` 守卫（先例 `SiteStats.astro:185`） |
| T11 | `BackgroundPlayer.astro` **完全没有** reduced-motion / saveData / `visibilitychange` 处理 | 无任何降级 | §6.2 的三条降级由我们自己补，并保持 `data-bg-video-playing` 同步不被破坏 |
| T12 | `pinyin-pro` 在 **devDependencies**（目前只被 `scripts/new-post.js:5` 使用） | `--prod` 安装下该脚本不可用 | 迁移脚本属开发期工具，可继续用 devDependencies；**不要把 `pinyin-pro` 引进 `pnpm build` 链路**，否则要移到 dependencies |
| T13 | `quarantine-bad-posts.mjs` 不在任何 npm script 里；文件头注释写的目录（`src/content/posts/_quarantine/`）与真实常量（`src/content/_quarantine`，脚本自建）不一致；用 `fs.renameSync` 移动原文（跨盘符会抛错），frontmatter 解析失败也会被当作坏文章移走 | 直接照抄会踩坑 | 我们的 `verify-posts.mjs` **只借鉴其 `stripCode()` / `isExternalUrl()` 思路**；隔离目录与移动方式自己定（同盘符或改复制） |
| T14 | `SiteInfo.astro` 是纯构建期快照，用硬编码相对路径读 `../../../package.json`，失败被空 catch 吞掉 | 组件移位会静默显示 `unknown` | 只在其内部加占位分支，不移动该组件 |
| T15 | 站点统计原逻辑用 `Math.abs()` 算天数差、用 `i18n(...).replace("{days}","")` 拼后缀、用 `nextElementSibling` 隐藏后缀 | 逻辑脆弱（日期晚于今天也得正数等） | 这两项在 R-WDG-01 里直接删除，不受影响 |
| T16 | **字体 provider 会在构建期联网**：`fontConfig.ts` 原用 `provider: "fontsource"`，`pnpm build` 会去 `https://cdn.jsdelivr.net/fontsource/fonts/...` 下载 woff2，网络不可达即 `CannotFetchFontFile` 直接构建失败（P0 实测踩到；jsdelivr 在国内不可靠）。另外 `Zen Maru Gothic` 在 Fontsource **根本没有 600 字重**，原配置请求 600 属无效值 | 阻断 R-DEP-04（构建不依赖外网），在自建服务器上必崩 | 已改为 `provider: "local"` + woff2 存进 `src/assets/fonts/`（`@fontsource/*` 三个包转为 devDependencies 作为文件来源）。注意 **`npm` provider 也会联网**（走 `cdn.jsdelivr.net/npm/@fontsource/…`），不要改回任何远端 provider |
| T17 | **「关闭的页面」在静态输出下不是 404**：页面里的 `return Astro.redirect("/404/")` 被编译成存根 HTML——`<title>Redirecting to: /404/</title>` + `<meta http-equiv="refresh" content="2;url=/404/">` + `<meta name="robots" content="noindex">`，Web 服务器以 **HTTP 200** 返回（P1 实测：`/friends/`、`/bilibili/`、`/bangumi/`、`/sponsor/` 全是 200）。而且存根指向的 `/404/` 本身没有产物（真正产出的是 `dist/404.html`） | ① 我最初在 `prd.md` 里写的"访问返回 404"是**错的**（按 dev 服务器行为想当然）；② 线上会先给一个 200 空页再跳，SEO 靠 Astro 的 `noindex` 兜住 | ① `prd.md` R-NAV-05/R-NAV-06 的验收条件已改成真实行为；② `scripts/verify-ui.mjs` 断言"它确实是那个 noindex 存根"而不是断言 404；③ **真 404 在 Nginx 层做**（§12.2 的 `return 404` + `error_page 404 /404.html`）；④ 注意 `dist/404.html` 是单文件，不是 `404/index.html` |
| T18 | **首页横幅的 `links` 是"站点身份 / 打赏移除"的盲区**：R-NAV-06 只盯着导航与页面，但 `backgroundWallpaper.common.homeText.links` 里另有 4 条上游作者链接——GitHub（作者仓库）、Email（`mailto:xiaye@msn.com`，被 `rehype-email-protection` 编码成 base64 的 `data-encoded-email` 挂在**每一个页面**上）、**Sponsor（`blog.cuteleaf.cn/sponsor/`，即打赏入口）**、RSS | 按 R-NAV-06 验收不合格；且每个页面都夹带上游作者邮箱 | P1 审查时抓到并已清理（换成 RSS + Atom）；`scripts/verify-ui.mjs` 新增**渲染结果泄漏扫描**（对 `/`、`/about/`、`/guestbook/`、`/posts/*` 扫上游邮箱/ID/打赏链接/横幅标题，命中即失败），防止同类问题再溜过去 |
| T19 | **侧栏容器有两套 id，名字只差一个后缀**：`#left-sidebar-dynamic` / `#right-sidebar-dynamic` 是 **Swup 的替换容器**，静态产物里带 `class="hidden"`，内容由客户端切页时填；SSR 出来的真实侧栏内容在 `#left-sidebar` / `#right-sidebar` 里（`SidebarColumn.astro:47/65`） | 任何针对侧栏的 DOM 断言/脚本若用错 id 会**静默什么都查不到**（我的验证脚本第一版就踩了：采样恒为 0，断言恒真通过 = 假绿） | 用 `#left-sidebar` / `#right-sidebar`；任何"集合类"断言都要先校验**样本量**（`verify:ui` 里已有 `count >= 20` 之类的门槛，样本不足判失败） |
| T20 | **用 `vw` 表达"内容宽的百分比"会算错**：排行榜的行高规格是"内容宽的 17.4%"，第一版写成 `clamp(76px, 17.4vw, 132px)`——1440 视口下 17.4vw = 250px 被上限卡到 132px，而榜单板实际只有 629px 宽 → 实测行高比 **21%**（比参考图高一截）；同理名次列的 `clamp(48px, 13.7%, 96px)` 上限 96px 一旦被卡住，比例也会失真 | 版式"看着差不多"，但与参考图比例对不上；越宽的屏偏得越多 | 给容器加 `container-type: inline-size`，用 **cqw**：`--rank-row-h: max(76px, 17.4cqw)`、`--rank-badge-w: max(44px, 13.7cqw)`；P2 实测 629px → 109px = 17.3%、86px = 13.7%。**凡是"相对内容宽"的尺寸都优先 cqw，别用 vw** |
| T21 | **同一个 CSS 变量里写 `%`，在不同属性里语义不同**：`--rank-badge-w: max(44px, 13.7%)` 用在 `grid-template-columns` 是"相对格宽"，用在 `font-size: calc(var(--rank-badge-w) * 0.72)` 却变成"相对父级字号"（13.7% × 16px ≈ 2.2px），同一个变量算出两个值 | 数字字号上限静默失效/离谱，且几乎看不出来 | 会用在不同类型属性里的尺寸变量，统一用**长度单位**（cqw / px）表达；`%` 只在单一明确语境下用 |
| T22 | **"内容默认隐藏、JS 再显示"的入场动效会把无 JS 场景变成空白**：第一版 `.rank-row { opacity: 0 }` + IntersectionObserver 加 `.is-in`，结果整页截图里 5~10 名全是空白（未进入视口的行永远不触发），爬虫/打印同理 | 内容可见性依赖 JS，属于可访问性与 SEO 的硬伤 | 隐藏态挂在 `html[data-rank-anim="1"]` 上，该属性由**解析期内联脚本**设置且仅在"JS 可用 + 未开启减少动态"时存在；再加一条 `@media print` 兜底强制显示 |
| T23 | **`html { scroll-behavior: smooth }`（`src/styles/main.css:53`）会让脚本里的 `scrollTo` 变成动画**：验证脚本截图前用 `window.scrollTo(0, y)` 逐步滚动来触发入场动效，每步只等 90ms，实际页面几乎没动 → 截图里仍然是空白行 | 自动化截图/视觉回归会得出错误结论（我据此误判过两次） | 脚本里必须写 `window.scrollTo({ top: y, behavior: "instant" })`（或临时把 `scroll-behavior` 设为 `auto`） |
| T24 | **Tailwind 4 的 preflight 用分层 `!important` 锁死了 `[hidden]`**：编译产物里是 `@layer base{… [hidden]:where(:not([hidden=until-found])){display:none!important} …}`。按 CSS 层叠规范，**`!important` 声明"分层优先于不分层"**——所以自己在未分层的样式表里写 `.rank-panel[hidden]{display:block!important}`，特异性再高也**盖不住**它（P2 独立审查实测：打印时第二块面板始终印不出来） | "打印/无 JS 时也要看到内容"这类兜底会**静默失效**，而且看不出原因（规则明明生效了） | 不要跟 `[hidden]` 抢 `display`：改用**自己的 class**（`.rank-panel--off`）+ `html[data-rank-js="1"]` 这类"JS 可用"标记来隐藏，打印/无 JS 时用普通规则覆盖即可。另外注意**未分层的普通声明也会输给分层里的普通声明**（正常声明是"不分层优先"），所以别指望靠层外的规则去覆盖 Tailwind 组件层 |
| T25 | **`import.meta.glob` 的相对路径是相对"当前文件所在目录"**：`ImageWrapper.astro` 在 `components/common/` 下写 `"../../**/*.webp"` 正好指到 `src/`；我在 `components/pages/rank/RankBoard.astro` 里照抄同一串，`../../` 只到 `components/` → **一个配图都解析不到**，全站榜单静默退化成渐变占位（构建日志里 4 条 warning 才发现） | 复制粘贴式复用 glob 会静默失效；页面"看起来还能看"，很难发现配图全丢了 | glob 一律用**项目根绝对路径**（`"/src/**/*.{png,jpg,jpeg,webp,avif}"`），key 也随之变成 `/src/...`，与文件位置无关；复制任何 `import.meta.glob` 前先数清 `../` 的层数 |
| T26 | **auto 轨道里的 grid item 用百分比 `max-width` 会把它压扁**：短评胶囊改成网格第 2 列后写了 `max-width: 45%`，Chrome 下胶囊被压成一个小圆点（截图里一眼看到）——auto 轨道的尺寸本来要靠内容算，百分比上限参与进来就形成"先算宽度、再按百分比限制"的循环 | 元素"还在"，但小到看不出内容，**只断言"不重叠"会通过（假绿）** | 这类上限用**长度**表达（`40cqw`、`min(40%, 220px)` 之类）；断言里除了"不重叠"还要断言"自身没被压扁"（宽度下限 + `scrollWidth <= clientWidth + 2`） |

| T27 | **模板的 `--deep-text` 在暗色下不生效**：`src/styles/variables.styl` 里 `--deep-text: oklch(0.25 …)` **只在浅色 `:root` 定义了一次，`:root.dark` 没有覆盖它**（上游遗留）。拿它当"通用正文色"用，暗色下就是深字压深卡片——桌宠气泡第一版就这样，几乎看不见（截图才发现） | 自己写的浮动组件（气泡/菜单/面板）在暗色下文字"消失"，而且不报错 | 浮动组件的文字色**分主题写**（模板自己的做法是配 `dark:text-white`）：`:root.dark .pet-bubble { color: rgb(255 255 255 / .92) }`。判断一个变量能不能跨主题用，先去 `variables.styl` 里确认 `:root.dark` 有没有覆盖它 |
| T28 | **`<script is:inline>` 里的 `{表达式}` 不会被求值**：把 `if (${hideOnMobile} && …)` 直接写在 `is:inline` 的 script 标签体里，Astro **不当作表达式处理**——变量不会被插值（还会被 TS 报"声明未使用"）。P3 的"移动端要不要桌宠"判断第一版就这么写，产物里是字面量 `${hideOnMobile}` | 内联脚本里的构建期开关全部失效，且看起来"写了" | 把整段脚本在 frontmatter 里拼成字符串，再 `<script is:inline set:html={petHideScript} />`；产物里能看到值真的被替换（实测 `767px`） |
| T29 | **验收脚本里的"等待"要跟着物理走**：拖拽测试把宠物丢在半空，紧接着做双击测试——它**落地那一帧会 `setState("jumping")`**，把刚触发的 `review` 盖掉，于是断言读到 `jumping` 并误判成"双击没生效"。同理"键盘 →"在宠物已经贴右边时会被 clamp、根本走不动 | 交互断言时红时绿（取决于时序），很容易被当成偶发 | 交互测试要显式等待物理过程（这里加 `sleep(1400)` 等落地）；"走到边界"的用例换方向（用 ← 而不是 →）；断言详情里把实际状态打出来，别只说 true/false |

| T30 | **绑事件的脚本必须排在目标节点之后**：把"给两侧交互区绑 click"的脚本插在按钮**之前**，`wrapper.querySelectorAll('.banner-switch-zone')` 抓到空列表 → **监听一个都没绑上**，而同一个脚本里绑在父容器上的拖拽手势却照常工作（P3 实测：点击/键盘失效、拖拽正常，很容易误判成"按钮有问题"） | 交互"半死不活"，症状取决于你把监听绑在谁身上 | 内联脚本要么放在目标节点之后，要么用事件委托绑在稳定祖先上；验收时**每条路径都要单独点一遍**（点击 / 键盘 / 手势是三条不同的代码路径） |
| T31 | **CDP 的 `rawKeyDown` 不触发浏览器默认行为**：用 `type: "rawKeyDown"` 发 Enter，能触发页面上自己写的 `keydown` 监听，但**不会**触发 `<button>` 的原生激活（那是 keydown 的默认动作）。P3 验收"键盘 Enter 换图"因此假失败过一次 | 依赖原生行为的键盘断言会误判成"功能没做" | 要验证原生行为就发 `type: "keyDown"` + `text: "\\r"`（Enter）/ `" "`（Space），或干脆用 `Input.dispatchKeyEvent` 的 `char` 事件类型 |

| T32 | **同一条图被压两代**：我自己写脚本把原 JPG 转 webp q82，Astro 构建又按 `imageQuality`(85) 压一遍 —— 尺寸一个像素没变，但细看明显发糊（201KB → 143KB，掉的全是细节）。发起人一眼看出来："你似乎进行了图片裁剪或压缩" | 画质锅甩不掉，而且**只看截图不容易判断是哪一代压的** | 素材能用原图就用原图放进 `src/assets`，**压缩只交给构建管线做一次**；首屏大图（壁纸）单独把 quality 提到 95。要判断有没有多压一代：比"原图体积 vs 产物体积"，尺寸相同却明显变小就是压过 |
| T33 | **`object-position` 的百分比是"对齐点"，不是"偏移量"**：写 `"0% 20%"` 的 x=0% 意味着"图的左边缘对齐框的左边缘"——一旦图比框宽，就只从**右侧**裁，画面被挤到左边；写 50% 才是水平居中 | 宽屏上构图偏向一侧，看起来像"图被切歪了" | 想让画面居中就用 `"50% y%"`；纵向百分比越大越往下（0% 顶对齐、100% 底对齐） |
| T34 | **用 PowerShell 改带中文的 UTF-8 文件会双重编码**：`Get-Content -Raw` 按 ANSI(GBK) 解码 → `Set-Content -Encoding utf8` 再按 UTF-8 写回，中文全变成 `鍥剧墖` 这种乱码（P4 改 `verify-posts.mjs` 时真发生了，整份文件的中文串报废） | 文件内容静默损坏，`git diff` 里满屏乱码，且**没有报错** | 批量文本替换**别用 PowerShell 的读写 cmdlet**：用 Node 脚本（`fs.readFileSync`/`writeFileSync`）或 edit/write 工具；非要重定向就用 `cmd /c "... > file"`（字节直通，不解码）。`node --check` 只查语法，查不出这种损坏 |
| T35 | **`==x==` 在本语料里不是 Obsidian 高亮，是 C++ 相等比较**：去掉代码区后全库只有 1 处 `==…==`，而那一处正是表格行 `| 过程中判断 dist[t]==INF | 最后判段边数cnt==n-1 |` 里被两个 `==` 夹住的普通文字——全局替换成 `<mark>` 会把表格连同行尾一起吞掉 | 表格被改坏，且看起来像"作者写错了" | **不做** `==`→`<mark>` 的全局替换；真要支持高亮，先按行判断"+ 两侧不能紧邻 `=`/空格"，且只处理非表格非代码区 |
| T36 | **文件名归一化不能顺手把"空格+数字"都剥掉**：为兼容 Obsidian 的 `图 1.png` 重名后缀，第一版写了 `/\s+\d+(?=\.[a-z]+$)/` → `Pasted image 20260509141005.png` 的时间戳被当成后缀吃掉，全篇 6 张图归一化成同一个键，**6 张只复制了 1 张**（映射看起来"成功"，其实是同一张） | 图片静默丢一半、正文重复指向同一张 | 归一化只做 NFKC + trim + 小写；重名后缀**作为退路单独试**，且**只吃 1~2 位数字**（`\s+\d{1,2}`）。判断有没有踩：看报告的 `images.copied` 是否等于 `images.resolved` |
| T37 | **全库性的空白整理会改坏代码块**：`body.replace(/[ \t]+$/gm, "")` + `.replace(/\n{3,}/g, "\n\n")` 把 5 篇里 **100 处代码块内部**的行尾空白与空行改掉了（独立子 agent 逐块比对时抓到：`"    "` → `""`） | 代码块内容与源文件不再逐字节一致，"迁移保真"这条承诺就破了（对 C++ 语义通常无影响，但不可接受） | 任何全局空白/换行整理都要**围栏感知**：逐行扫、围栏内原样输出、围栏外才整理（`tidyWhitespace()` / `separateAdjacentImages()` 都是这么写的）。验证手段：`reports/check-code-fidelity.mjs` 逐块比对 |
| T38 | **LQIP 生成器会 glob 到 `public/**` 的图片**：`generate-lqips.ts` 扫 `{src,public}/**/*.{png,jpg,…}`，只忽略几个固定目录；P4 往 `public/images/posts/` 一放图，`lqips.json` 立刻多出 9 条无用记录（全量会上百条） | 每次导入都在 `lqips.json` 里制造 diff 噪音；虽然 `<img>` 是裸标签、根本用不到 LQIP | 在 `IGNORE_DIRS` 里加 `public/images/posts/**`。注意文件被删后这些记录会由脚本自动清掉（日志里是 `Removed N stale entries`） |
| T39 | **"悬浮/上下浮动"别用 CSS animation 做**：桌面宠物同时被三处写位置——拖拽（每帧指哪写哪）、位置记忆（刷新后恢复）、自由移动（每帧插值）。CSS animation 的位移和 JS 写的 `transform` 是**同一条属性**，谁后写谁生效：拖拽一放手就会被动画顶回去，恢复位置那一帧还会跳 | 宠物的位置在拖拽/刷新/模式切换后"莫名回弹"，且**不报任何错**（看起来像逻辑 bug，其实是样式打架） | 位置只保留**一份事实**（组件里的 `pet.x/pet.y`），所有模式（悬浮正弦、飞行插值、走路、拖拽）都算完再统一写 `translate3d`；`pet.css` 里给 `.pet-sprite` 的 `--pet-tilt`/`--pet-fly-scale` 也**不加 `transition`**（逐帧写入会一直停在过渡中间） |
| T40 | **验收用的"调试钩子"必须是同一函数，不能是旁路**：R-PET-06 的飞行间隔最小 20 秒，脚本不可能干等一分钟，很容易顺手写成"直接给 DOM 加个 `data-pet-flying`"或"直接把坐标改掉"——那样测的是"我能不能改属性"，不是"行为对不对"（P1/P2 审查都点名过这类假绿） | 断言全绿但功能其实是坏的；以后重构行为时断言照样绿 | 钩子只做"提前调用"：`window.__imissFlyNow()` 调的就是 `decide()` 里那次 `startFlight()`，`window.__imissSetMode()` 调的就是 `boot()` 里那次 `setMode()`，只多"跳过睡着判断""允许运行期切档"。断言侧再核对**真实副作用**（`data-pet-flying` 标记 + 两次采样坐标真的变了 + 不出视口） |
| T41 | **浮动组件的锚点会随"宠物形态"一起过期**：`openMenu(clientX, clientY)` 是 P3 贴地时代的写法（鼠标点贴地的宠物，坐标必然在视口底部附近，`top = max(10, y-8)` 往上挂就没事）。R-PET-06 把默认档改成悬浮后，宠物可以停在**从视口顶到离地 48px 的任意高度**，"点宠物下半身"就能让 200px 高的菜单整块探出视口底（实测溢出 **118px**）。同一个菜单还**没写 `z-index`**，而模板里 `#wallpaper-wrapper` 是 10、`#content-panel` 是 30 —— 菜单被画在它们下面，只在两者都盖不到的地方露出来（发起人看到的就是"框跑到下面、还被裁掉一半"） | 弹出层位置错乱 + 被壁纸/正文面板遮住；**矩形断言全绿也发现不了**（看不见不等于不在） | 弹出层一律**按目标元素矩形**定位（这里用组件自己维护的 `pet.x/pet.y/w/h`，不读布局），上下/左右各按"放不下就换边"处理，四边再夹进视口；**必须显式给 `z-index`**（本组件取 `petConfig.zIndex + 1` = 67，仍低于浮动控件 1000）。断言除了矩形，还要用 **`document.elementFromPoint(菜单中心)` 命中菜单自己**这条"像素真话"兜底（§7.6 第 8 条） |
| T42 | **"随机到视口任意点"这类参数没有上界，手感会随视口变大而失控**：`float` 档最早的飞行目标是 `edge + Math.random() × 可用宽/高`，1440×900 下单次位移实测 **414~550px**、时长固定 2600ms → 平均 ≈580px/s，发起人一眼看出"飞得太快太远"。这类"看起来能跑"的随机位移，**只要屏幕更大就会更离谱**（1024 宽时还有 ~350px，4K 下会到 1500px 以上），而且没有任何断言会红 | 动效与"自然、轻微"的预期不符，且越是大屏越糟；调参时不知道该改哪个量 | 位移/时长都改成**有上界的区间**（`PET_TUNING.flyDistanceRange` 60~180px、`petConfig.movement.flyDurationRange` 4000~6000ms），目标点相对**当前位置**取而不是相对视口取；缓动换成更柔的 `easeInOutSine`，弧线/倾角同步收小（44→12px、7°→3°）。断言直接锁定**区间上界**与**3 次实飞实测值**（位移 ≤ 200px、时长 ≥ 3.8s），避免以后又被"随机"改回去 |
| T43 | **`elementFromPoint` 命中的"遮挡方"往往不是那条遮挡带本身**：R-PET-08 做遮挡避让时，宠物拖到视口最上面、菜单顶部对齐宠物顶部 → 顶部两个角落在模板导航栏下面（`#navbar-wrapper` 是 `z-index: 80`，比菜单的 67 高）。在抽样点上 `elementFromPoint` 返回的是导航栏里的 **`button.btn-plain`**（按钮自己的 rect 只有 ~40px 高），按它的底边往下让位 → 菜单顶边只挪到导航栏内部，**抽样依旧被挡，循环原地打转**（`elementFromPoint` 不告诉你"这一条带子有多高"） | 遮挡检测"看起来做了"，实际让不开；表现为菜单永远压着一截导航栏，而 `data-pet-menu-occluded` 一直非 0 | 从命中节点**沿祖先链上溯**，取"仍然覆盖该抽样点、且盒子更大"的最外层祖先当作遮挡带（本组件 `occluderBox()`，最多 6 层；实测能一路取到 `#navbar-wrapper`，一次就让开 61px）。另外遮挡判定的抽样点**不能只取中心**：中心在导航栏下方照样命中菜单，顶部两个角才暴露问题 —— 取"中心 + 四角内缩"，并且**换边优先于让位**（换边是发起人明确要的第一补救） |
| T44 | **挂在元素上的 `keydown` 监听，用 CDP 的 `Input.dispatchKeyEvent` 打过去时不会触发** —— 事件是发给**当前焦点元素**的：宠物没聚焦时按键全落到 `document` 上，`#pet-body` 上的监听器收不到。R-PET-09 的探针第一版就踩了：按 `←` 之后宠物确实移动了 8px，看着像"通过"，其实是**后台的自动飞行**在动，按键根本没生效（差一点把假绿写进断言） | 键盘相关断言会静默变成"空跑"：状态恰好被别的行为改掉就假绿，否则假红，两种情况都看不出原因 | 键盘断言**先 `document.getElementById("pet-body").focus()`** 再 `dispatchKeyEvent`（本仓库 `verify:ui` 的 R-PET-02 键盘块一直是这么写的，探针要照抄）；并且断言要挑**只有这条路径能产生**的证据（R-PET-09 用"按 ← 后 420ms 内 x 位移 ≥ 20px"，位移量级对得上 93px/s 的悬浮滑行，而不是"动了就算过"） |
| T45 | **`querySelector('[data-pet-act=...]').click()` 这种"按属性点元素"的断言，测不到"用户到底点到了什么"** —— 它绕过布局与命中测试：元素**不可见**（`display:none`）、**被别的层盖住**、或者"点到的其实是另一个按钮"，它全都照点不误并且全绿。R-PET-10 这一轮就是活例子：⑧b/⑧c 两条"落下去"的断言一直全绿，而真机上「落下去」有一整类现场根本不落地 —— 断言只跑了"悬浮档 + 没开聊天 + 没有减少动态偏好"这一种现场，而两条失效路径（`chatOpen` 挡在重力分支前面、`reduced-motion` 下压根没有 rAF 循环）**都在这三种现场之外**。另一个同源的坑：`menu.hidden = true` + `dispatchEvent(new MouseEvent("contextmenu"))` 合成右键，跳过了浏览器真实命中测试 | 断言全绿 + 真机不可用（发起人原话："点击落下去之后没有真的落下去啊"）；而且失效现场越"边缘"（开着聊天、系统开了减少动态）越测不到，恰好这些是真实用户会待的状态 | 菜单/弹出层的断言一律走 **`Input.dispatchMouseEvent` 的真实鼠标事件**（右键 `mousePressed`/`mouseReleased` button=right 走原生 `contextmenu`），坐标取**"当前可见那一项"的矩形中心**，并顺带核对 `getComputedStyle(项).display`、另一项是 `none`、以及该坐标上 `document.elementFromPoint` 命中的就是它自己；**同一个行为要把"能让它失效的现场"列出来各跑一遍**（这里是：聊天框开着 / `prefers-reduced-motion`），别只测出厂状态 |
| T46 | **"把状态立起来"和"把状态跑完"分居两个函数时，任何提前 `return` 都会造成"状态对了、行为没发生"** —— `startFall()` 只写 `airborne = true` / `vy = 60`，真正的重力积分在 `step()` 里，而 `step()` 只在 rAF 循环里跑。于是：① `step()` 开头那句 `if (pet.dragging \|\| chatOpen) return;` 让"聊天框开着点落下去"卡在半空（实测 y 连续 1.5s 不动、离地 370px）；② `start()` 的 `if (raf \|\| reduce \|\| document.hidden) return;` 让**减少动态**这一档根本没有循环，`airborne` 立起来也永远没人积分。两次都是"`data-pet-mode` 已变 `ground`、菜单已换成「飘起来」、DOM 一切正常，就是宠物没动" | 用户看到的是"点了没反应/按钮是坏的"，而所有状态属性、菜单文字、档位**全都对**；断言若只看属性就必然假绿 | 立状态与跑状态**必须在同一个可判定条件下闭环**：要么保证执行体一定会被调到（把 `chatOpen` 闸门挪到重力分支**之后**，只留拖动——拖动期间 y 由指针直接写），要么在"执行体永远跑不到"的那一档**直接给终态**（`reduce` 下 `startFall()` 直接落到 `floorY`，语义与"直接定位"一致，不做位移动画）。断言口径：**位置随时间采样**（下落要有 ≥3 个递增采样点、落定要贴地、落地后还要继续采 5.4 秒确认没被拉走），不看属性变没变 |
| T47 | **`langgraph dev` 的 SSE 事件集随"路由走哪个节点"变化，契约不能锁事件名顺序** —— 同一句「在吗」实测两种形态：**直接答复路径整个流只有 1 个 `values` 事件**（无 `metadata`、无 `messages/complete`，消息 `human,ai`）；走 `extend_graph` 路径才有 `metadata → values → updates → values → messages/metadata → messages/partial ×N → messages/complete → updates → values`（消息 `human,human,ai,tool,ai,ai,tool,ai,tool,ai`）。**两者都合法** | 契约测试若断言"首个事件必须是 `metadata`、必须含 `messages/complete`"，就会变成一个**随机失败的假红灯**（跑十次红几次），最后被人加 `skip` 绕过——比不测更糟 | 契约只锁**可判定且稳定**的三条：**事件名白名单**（越界说明上游改了协议）+ **末事件必须是 `values`**（前端就靠它拿最终状态）+ **`metadata` 若出现必须在任何 `messages/*` 之前**。再加一层保险：拿**最后一个 `values` 的消息数与 `GET /threads/{id}/state` 对比**，确保"前端拿到的最终状态 == 线程真实状态"。**P5-0 实测依据见 §8.9.3** | ✅ 已按此实现（`scripts/verify-agent.mjs`「闲聊轮 · 事件序列」） |
| T48 | **`POST /assistants/search` 同一个 `graph_id` 可能有多个 assistant，断言必须去重** —— 实测返回 **5 条**，其中 `blog_agent` 有**两个实例**（不同 `assistant_id`），去重后才是 **4 张图**（`blog_agent` / `recommended_agent` / `collect_agent` / `extend_agent`） | 按返回条数断言（`expect(list).toHaveLength(4)`）会**因为后端多注册一个实例就变红**，而契约（"有这 4 张图可用"）其实没破；反过来也可能因为"少一张图但多了别的"而假绿 | 断言口径写成**去重后的图名集合**（`new Set(list.map(a => a.graph_id))` 必须包含契约清单里的每一张），并把**真实条数**只作为 detail 打印出来。同时**永远不要硬编码 `assistant_id`**——它是部署时生成的，每次都可能变 |

| T49 | **同一份构建产物只能有一种 `enable`，而「零请求」与「真往返」两种路径都要证** —— `agentConfig.enable` 是构建期常量，build 两次会留下与交付物不一致的产物；只改配置不重建则验的是旧产物 | 断言只能覆盖一半：要么永远验不到「关掉时一个请求都不发」，要么永远验不到真链路 | 适配层读配置时**多看一眼测试注入钩子**（`window.__imissAgentConfig`，白名单只放 `enable`/`baseUrl`/`timeoutMs`，见 `src/utils/agent-client.ts` 的 `pickLiveConfig()`）：`verify:ui` 在同一份产物上分别注入 `false`/`true`/死端口，**测完 `delete` 并断言已还原**。⚠️ 钩子只在测试里写，正常运行路径上这个全局量不存在 |
| T50 | **`GET /threads/{id}/state` 的 `interrupts[]` 是「历史累计」，不是「当前待回答」** —— 一个线程跑过 N 轮推荐，`interrupts[]` 里就可能有 N 条（上一轮的问题还在里面）。P5-1 接线时若直接取 `interrupts[0]`，会出现「用户问新问题、气泡里却弹出上一轮那句反问」（而且 `resume` 会把旧答案回给新问题） | 偶发地把**上一轮的反问**当成这一轮的问题；`resume` 用错词，推荐结果跑偏且不报错（最难查的一类） | 第三层兜底**优先读 `tasks[].interrupts[]`**（当前活跃任务），只有在它为空时才退回 `interrupts[]`；第一、二层（`values.__interrupt__` / `updates.__interrupt__`）本就只反映本轮 |
| T51 | **取消 ≠ 降级**：`AbortController.abort()` 会让 `fetch` 抛 `AbortError`，如果适配层把它和「连不上」归成一类，就会**在用户关掉聊天框之后**再弹一句 mock 台词进气泡（气泡已经清空了，字却写进去） | 关框 / 切页之后气泡里冒出一句没头没尾的话；用户以为「它自己乱了」 | 适配层识别 `signal.aborted` → 返回 `text: ""` 且**不降级**；组件侧再叠一层 `chatSession` 会话号：异步回调回来先比会话号，不是当前这轮就整个丢掉（`openChat()`/`closeChat()` 都会 `chatSession++`） |
| T52 | **「永远像没在思考」和「卡在思考」是同一个 bug 的两头** —— `running` 是**循环**状态（不是 `once`），`setState("running")` 在状态已经等于 `running` 时会提前 return：连续提问时第二次请求**看不到任何状态变化**；反过来，如果只把状态立起来、复位交给一条可能永远不来的网络回调，关框 / 切页 / 请求被丢弃时就会**卡在思考中** | 用户看不出「它在忙」；或宠物一直戴墨镜干活动画不放 | 每次提问都**用会话号 + 兜底计时器复位**（`endTrip()` 里 `setState(state, hold)` + `stateTimer` 到点回 `running`）；请求一发出就 `setState("running")`，收尾（答复 / 降级 / 取消 / 关框）**每条路径都要复位**。`verify:ui` 用 `MutationObserver` 记 `data-pet-state` 序列，断言「每次提问都出现思考态、连续两次都能复位、关框后回 `idle`、切页后不卡在思考态」 |
| T53 | **契约 §8.9.5 只写了 `interrupt` 的一种形态，实测有两种** —— `recommended_agent` 是**纯反问**（最后一个 `values` 里有 `__interrupt__`、**没有**答复），而 `blog_agent` 的检索链路是**先给答复再反问**（同一个 `values` 里既有 ~482~522 字的文章列表、又有 `__interrupt__`「要不要我收进本子？」） | 只按"纯反问"实现 → 遇到形态 A 会**自动续跑**，等于替访客做了决定：刚查到的文章列表被换掉/丢掉；反过来如果只按"有答复就别续跑"实现，形态 B 又会卡住不动 | 按**有没有答复**分流（`agent-client.ts` 的 ④）：有答复 → 答复 + 反问**一起**进气泡（答复在前）、不自动续跑；没答复 → 自动续跑一次（`command.resume` + 推出来的约定词）。⚠️ **跨轮回答也必须用 `command.resume`**（复核 D-2）：形态 A 是隔一轮回答的，旧实现只在"同一轮内拿到过无答复的 interrupt"时才发 `command`，隔轮时把用户那句当**新 `input`** 发了 —— 真后端今天容忍，但那是**没写进契约的宽容行为**。回归断言：`verify:agent:robust` 的 `[D-2]`/`[D-2 对照]`；契约 §8.9.5 已于 v1.35 补上第二种形态 |
| T54 | **`resumeWords` 一词两义：既是"默认载荷"又是"用户意图信号"** —— 同一个 `不提供` 既当 `command.resume` 的默认值，又被 `isResumeWord()` 拿去对**用户输入**做子串匹配判"这句是不是在回答反问"。于是"该回哪个词"只能从 `__interrupt__[0].value` 的**自然语言措辞**反推 ——旧实现有一条 `/要不要|需要我|要我/ → 需要`，后端只要问一句宽松的「**要不要**我按站里的常用范围替你挑几篇？」，前端就自动回 `需要`（而契约里 `需要` = "用户明确给了字数/时长"） | **改一个字就翻转载荷，而且不报错**：后端人设写着「这两个词我认得准；回别的话，我这边就当你没说」→ 推荐结果跑偏，属于最难查的一类。**第二个已知副作用**：用户用「好的 / 嗯」这种**非约定词**回答反问时，这句会被当**新 `input`** 发出去（后端当新话题，推荐链路那一轮白跑）—— 当前口径是"宁可当新话题，也不替用户编一个约定词" | **缓解（已落地）**：只在问句**明确在问字数/篇幅/时长**或**明确在问"要不要收进本子"**时才推 `provide`，其余（含各种"要不要…"的宽松提问）一律回**默认词 `不提供`** —— 推不出来就默认，不猜用户意图。**根治要改后端**（`interrupt` 带 `kind`/`options`/`default` 结构化载荷，§8.9.7 未决项 #9），**本轮不做**。回归断言：`verify:agent:robust` 的 `[D-8]`（4 种问句 → 期望词） |
| T55 | **CDP 的 `Runtime.evaluate` 自己有 30 秒超时，而真后端一轮要 3~120 秒** —— 把「等到答复为止」整段写成页面里的一个 `await`（配 `awaitPromise: true`），短答复时看不出问题，**检索/推荐轮必然抛 `Runtime.evaluate 超时`**（P5-1 第一次真机跑实测踩到，整脚本崩在这一句上） | 长链路（正是最需要验的那条）永远测不到，而且报的是「脚本超时」这种与业务无关的错 | 页面侧只做「**发出去**」，结果放进 `window.__agtDone` 之类的槽；**Node 侧每 250ms 轮询一次状态**（每次 `Runtime.evaluate` 都是短调用）。判定条件用「稳定窗口」而不是「第一次变化」——刚提交时气泡里是**用户那句回声**，`reply !== text` 也可能立刻成立（输入法/回车各写一次，实测拿到过「在在吗吗」这种看着像答复的回声） |
| T56 | **泄漏扫描词表里的通用词会撞上站内合法内容** —— `langgraph` / `LangGraph` 在正文里到处都是（站里有一篇文章标题就叫《LangGraph 能力详解 · 学习笔记》，首页「最近文章」卡片与归档日历都带这个链接），拿它扫**整页 DOM** 必然假红；反过来，`.pet-bubble` 这种「真正会给访客看」的层反而没扫到 | 断言假红 → 被人 `skip` 掉 → 真正要守的那条（工具输出不许进气泡）失守；或者为了让它变绿把词表删空，等于没测 | 分**三层**扫、各扫各的：① 气泡文本 —— 禁词表**全部**条目；② 桌宠自己的 DOM（`#pet` / `#pet-menu`，去掉 `script/style`）—— 全部条目；③ 整页 —— 只扫「页面里绝不该出现」的宿主泄漏（`127.0.0.1`、`:2024`、`:2099`、`assistant_id`、`thread_id`）。⚠️ 端口要写成 `:2024` 这种带冒号的形态，裸数字 `2024` 会撞上日期与字数 |
| T57 | **「长答复」与「卡死的连接」必须用两个不同的闸门** —— 契约 §8.9.7 早就写了检索轮总耗时实测 **30~120 秒且抖动很大**，但如果适配层拿**一个固定总时长**去 `AbortController.abort()` 整条流，真机上就会出现「聊到一半断掉」（发起人 2026-09-26 专门提醒过这一点）。反过来只按「没有新 chunk」判卡死，遇到「服务收下请求但永远不返回响应头」又会一直挂着 | 前者：答复被截断、用户以为后端坏了；后者：气泡永远停在「等我一下」 | 拆成**三档**（`agent-client.ts` 顶部常量）：① **连接/首字节** `min(timeoutMs, 20s)` —— 只管「发出请求 → 拿到响应头」；② **流中途卡死** 60 秒没有任何新 chunk（每读一次重置看门狗，`reader.cancel()` 让 `read()` 立刻返回）；③ **单轮硬上限** 300 秒兜底，且与 `ARCH.md` §12.2 的 Nginx `proxy_read_timeout 300s` 对齐（前端比反代稍早收手，用户看到的是降级台词而不是 504）。拿到响应头后必须把「连接」那一路的信号**摘掉**（`removeEventListener`），否则读到一半会被它误杀 |
| T58 | **PowerShell 的 `*>` / `Out-File` 默认写 UTF-16LE，而下游脚本按 UTF-8 读** —— `node scripts/verify-ui.mjs --base … *> reports/verify-p4.log` 之后，`reports/sync-doc-counts.mjs` 报「日志里读不到「功能断言 N 项」」，`read` 工具也会把它当成二进制文件拒读（P5-1 实测踩到，卡了同步文档那一步） | 文档数字同步不了 → `verify:docs` 卡在"断言数与最近实测不符"；日志本身还是好的，容易误判成"脚本坏了" | 需要 UTF-8 日志时用 **`pnpm verify:ui:log`**（`scripts/verify-ui-log.mjs`：用 `spawnSync(..., {encoding:"utf8"})` 收输出再显式 `fs.writeFileSync(..., "utf8")`，写 `reports/verify-ui.log`）；`sync-doc-counts.mjs` 也改成**优先读 `reports/verify-ui.log`**、回退阶段日志。⚠️ **v1.35 追加同源的第二条坑**：这个包装脚本**没有转发 `--base`** → `pnpm verify:ui:log --base http://localhost:4322` 实际打的是 `verify-ui.mjs` 的默认值 **4321**（dev 服务器 / 别人的 server）；**端口错了不报错**，只要那个端口有个能返回 200 的东西就会一路跑完，于是一份"本地 dev 服务器"的日志被当成"交付产物"的证据。现在没给 `--base` 就补 **4322**（preview 端口，§11 的收尾流程），并把转发参数打进日志头。**教训：包装 / 转发类脚本必须显式透传关键参数，并把自己实际用的值打出来** |
| T59 | **验收脚本按正则匹配源码字面量，源码一重构就永久失配** —— `verify-agent.mjs` 原来只认 `baseUrl:\s*"([^"]+)"` 这一种形态，P5-2 把默认值挪进 `DEFAULT_AGENT_BASE_URL` 并改成 `baseUrl: resolveAgentBaseUrl()` 之后就再也匹配不上：**HEAD 上 `pnpm verify:agent` 直接是红的（13/14、退出码 1）**，而"配置对齐"这一项恰恰是契约的**可执行形态**——也就是说"交付证据"本身失效了，还被人当成绿的在汇报 | 交付说明里的"14/14"在 HEAD 上不成立；更坏的是**没人发现**，因为重构那次没跑这个脚本（P5 独立复核抓出来的，登记为 D-1） | ① **改脚本，不要为了迁就脚本去改配置**：`grabLiteralOrRef()` 同时认三种形态（字面量 / `baseUrl: CONST` / `baseUrl: fn()`，后者再去源码里找"哪个常量声明提到了这个函数名、且被赋值成字符串"），并把**取值方式**打进 detail（`baseUrl 取值方式：常量 DEFAULT_AGENT_BASE_URL（被 resolveAgentBaseUrl() 引用）`），下次再重构能一眼看出走的是哪条路；② 解析不出一律 `null` → 照旧判**失败**（不是静默放行，防"正则恒真"的假绿）；③ 教训推广：**凡是"读源码字面量做断言"的脚本，都要对"这行被抽成常量/函数"这件事免疫** |
| T60 | **把兜底请求挂在关键路径上，等于给正常轮次加一个 60 秒的雷** —— `GET /threads/{id}/state` 是契约里的**第三层兜底**（§8.9.5 层③），旧实现却**每轮无条件调一次**，而且它复用了 `agentConfig.timeoutMs`（整轮口径 60 秒）。正常一轮的请求账因此是 8 个（多一个纯开销），而 `/state` 一旦挂住，**已经到手的答复会被压 60 秒才上屏**（复核实测 `state-hang`：气泡 60079ms 才更新） | 后端"端口开着但不响应"时，用户看着"它在想"一分钟，其实答复一秒前就到了；同时每轮多一次请求 = 多一个可能拖慢的点 | ① **只在"前两层都没有 `interrupt` 信号且本轮答复为空"时才调**（正常轮次一次都不多打，请求账回到 6~7 个）；② 给它**独立的短超时 1.8 秒**（`STATE_TIMEOUT_MS`，与 `/ok` 探测同级），**不要**复用整轮口径；③ 通用教训：**任何兜底/探测类请求都不许挂在"用户等答复"的那条路径上**，要么条件触发、要么预算与主路径分开。回归断言：`verify:agent:robust` 的 `[D-4]`（正常轮 0 次 `/state` + `/state` 永挂时 1.8 秒收口）+ `verify:ui` 的 R-AGT「`/state` 挂住不影响上屏」 |
| T61 | **"清缓存"和"新建资源"是两件事，中间夹着一个自己的短缓存** —— 修 D-3（4xx → `resetSession()` + 重试一次）时，第一版改了却被自己的防抖挡死：`threadAttemptAt` 这道"建线程失败后 5 秒内不重试"的缓存，时间戳**连成功也记**（`threadAttemptAt = Date.now()` 写在 try 之前），于是"刚建完线程 → 立刻失效 → 要新建"这条路径必然撞上缓存 → **清了缓存却建不出新线程，自愈等于没做**；同时 `askAemeath` 里还把 `thread`/`assistant` 收进了闭包外的常量，自愈换过值之后重试仍在用**旧 id** | 看起来"修好了"（代码里确实调了 `resetSession()`），实测仍然永久降级 —— 属于"修了但没生效"的假修复，比不修更难查 | ① 防抖缓存**只在失败分支里留时间戳**，成功就归零（`threadAttemptAt = 0`）；② 自愈走**显式 `force` 通道**（`acquire(true)`），别指望"清缓存"能顺带绕过所有短缓存；③ 重试时**每轮现取**当前的 `threadId`/`assistantId`（不要闭包快照）。回归断言：`verify:agent:robust` 的 `[D-3]` 三条（自愈成功 / 不被短缓存挡住 / 只自愈一次）。⚠️ 顺带发现的**更早就存在**的 bug 也一并钉住了：模块级 `threadId` 以前**从来没被写过值**（只有 `resetSession()` 写 null）→ 每问一句都 `POST /threads` 建新线程，会话上下文根本没接上，只是被"永久降级"掩盖着 |
| T62 | **SSE 解析器做"整段缓冲归一化"会提前消费跨 chunk 的 `\r`** —— 旧实现每次 `push()` 对**整段**缓冲跑 `.replace(/\r\n/g,"\n").replace(/\r/g,"\n")`：一个 chunk 以孤立的 `\r` 结尾时，它立刻被当成换行，于是"下一个 chunk 开头的 `\n`"被提前吃掉，**多行 `data:` 的 JSON 被劈成两个半截事件**（都丢弃 → 假降级）。真后端实测**确实用 `\r\n`**，所以这不是纸上谈兵。同一处还有第二个：`if (chunk.done) break;` 之后没有 `flush()`，**事件没以空行结尾就 EOF 时会被丢掉**（SSE 规范要求派发） | 只在"多行 data + CRLF 切断"或"帧后直接断流"这两种组合下出事 → 复现概率低、看起来像随机降级 | ① 归一化时**把末尾孤立的 `\r` 留在缓冲里**等下一个 chunk（`normalizeNewlines()`：先摘掉末位 `\r` → 归一 → 再把 `\r` 放回）；② 读循环结束后 `parser.push(dec.decode())` + `parser.flush()`（把余下缓冲当"最后一行 + 隐式空行"处理）；③ 同类教训：**流式解析器的状态必须跨 chunk 保持，任何"对整段缓冲做变换"的写法都要先问一句"这段会不会被下一个 chunk 续上"**。回归断言：`verify:agent:robust` 的 `[D-17]`/`[D-18]`（直接给解析器喂切断的字节） |
| T63 | **短缓存的"钥匙"选错，缓存就变成死代码** —— `probeCache`（`GET /ok` 的 5 秒结果缓存）的判定写成 `confirmedBase === baseUrl ? probeCache : null`，而 `confirmedBase` **只在"成功拿到 assistant"时才会等于 `baseUrl`**：成功路径上 `assistantId` 先在前面 return 了、**根本走不到这行**；失败路径上 `confirmedBase` 还是旧值 → 缓存永远是 `null`。**两头都够不着**，于是"服务端口开着但不响应"时，**每问一句都先白等满 2 秒探测超时** | 缓存看起来"写了"，实际一次都没命中（复核 D-13 静态读出来的）。这类 bug 不报错、只让每次交互都慢一档，**最容易在性能复盘里被当成"后端就是慢"** | 缓存**按自己的键记**（`probeCache = { at, ok, base }`，判定看 `probeCache.base === baseUrl`），**不要借另一个状态量（`confirmedBase`）当钥匙** —— 那个量有自己的更新时机，两者不等价。回归断言：`verify:agent:robust` 的 `[D-13]`（`/ok` 故意慢 600ms：第一问 622ms、第二问 16ms、`/ok` 全程只打 1 次） |
| T64 | **"流式上屏"与"Markdown 兜底清洗"在结构上不可兼得** —— 发起人图证里 `**规范驱动开发**` 的星号被原样显示。根因不只是"后端没守人设"：只要答案还在**按增量上屏**，清洗函数就只能作用在**半截文本**上，`**` 必然先露半个（第一个 `*` 到了、第二个还在路上）。同一张图证的另一半是"半截答案刷屏让用户分不清它在想还是在答" | 前端兜底再严也会漏符号（漏的是"半个"）；而"状态可见"如果靠半截答案来体现，长回合里用户永远不确定它到底答完没有 | **把"状态可见"与"正文上屏"解耦**：流式增量只进内存缓冲（只记字数 → `data-pet-chat-recv`），界面用**独立的思考指示**（动画省略号 + 配置化的短句轮换）承担"它在想"，答复**完成时整段清洗后一次上屏**。选"完成后一次上屏"而不是"流式但标注还在说"的理由就是这个：后者等于把清洗对象重新变回半截文本。回归断言：`verify:ui` 的 R-PET-11「思考中不给半截答复」（假后端真推 42 字、面板里一个字都没有） |
| T65 | **给"每轮复用同一个元素"的旧结构加历史时，那个类名会永远命中第一条** —— R-AGT 的断言与组件旧口径都用 `.pet-chat-reply` 指代"这一轮的答复"。一旦历史区里**每条**答复都挂这个类，`document.querySelector(".pet-chat-reply")` 恒等于**第一条**（最旧的那条）→ 表现就是"第 2 问显示的是第 1 问的答复"，而且它是**静默**的：DOM 里每一句都在，只有"哪一句算答复"错了 | 回归断言集体变假红/假绿（脚本读到的答复永远是第 1 轮）；真机上用户看到的是"答非所问" | 这类"最新一条"的语义必须由 JS **显式维护**：`markLatestReply()` 每次追加后先摘掉所有同类名、再挂到**最后一条** ai/notice 行的正文元素上。⚠️ 还要注意这个类名**不许带任何样式**——它是"给断言与旧口径读正文"的接口，一带 padding/margin，`replyChars === 500` 那条几何断言与"答复长度"口径就会跟着飘。回归断言：`verify:ui` 的 R-PET-11「连续 4 问：第 N 问的答复区必须是第 N 答」（含 `RN:`、不含 `R(N-1):`） |
| T66 | **改布局之前先看老断言"量的是哪个元素"** —— R-AGT-07 用 `#pet-bubble` 的 `scrollHeight > clientHeight` 断言"500 字长答复可滚、首行可见、整块在视口内"。R-PET-11 要加历史区，最自然的写法是"面板做成 flex 列、历史区自己 `overflow-y:auto`"——那样**面板本身就不再滚**，这条断言会变成**假绿**（量的是一个永远不滚的元素，`canScroll` 恒假 → 断言直接红；如果反过来只看"能不能看到"就会静默失效） | 要么把一条真实的老断言改成"看着还在、其实没测"，要么为了迁就新布局把长答复的回归覆盖删掉 | 本轮选**保持那个元素仍是滚动容器**：面板 `overflow-y: auto` + 头部 `sticky top` + 表单 `sticky bottom` + 历史区是普通块级流，于是老断言一个字都不用改、而且测的还是同一件事。**通用规矩**：动 DOM 结构前先把"哪些断言量了这个元素"列出来（`grep` 选择器），能不动断言就不动；真要动，必须把"口径等价迁移"写进文档与 detail |
| T67 | **给按钮加原生 `disabled` 会把表单的隐式提交（回车）整条掐掉** —— P5 复核 D-9 要求"在飞时又按发送要给可见反馈、且不丢用户输入"，而 R-PET-11 又要求"思考中禁用发送"。第一反应是 `send.disabled = true`；但表单有默认提交按钮时，**隐式提交走的就是那个按钮的激活行为**，按钮 `disabled` → 回车什么都不发生 → D-9 那条路径直接消失（`verify:ui` 的 R-AGT-04 会红，而且真机上表现为"回车没反应"） | 一个"更规范"的禁用写法把一条冻结的行为回归静默删掉；或者有人为了让它变绿，把 D-9 的断言删了 | "禁用"落在**三处**而不是 `disabled` 属性：① **行为守卫**（`chatBusy` 时提交直接 return，并给可见反馈）；② **视觉**（`data-pet-busy="1"` → `opacity: .5` + `cursor: progress`）；③ **读屏**（`aria-disabled="true"`）。要动 `disabled` 之前先想清楚"这个控件有没有承担隐式提交"——`type="submit"` 的按钮就是那个默认按钮 |
| T68 | **"最新一条答复"这个类名也被本地占位句占用，而占位句能通过"是不是真答复"的判据** —— v1.37 加身份类断言时，为了避开"上一轮 interrupt 还停在一句反问上"，起手先点了「清空对话」再提问。`clearConversation()` 结尾会 `addLine("notice", CLEAR_NOTICE)` 写一句「……行，刚才那些我不提了，重新说。」，而 T65 的 `markLatestReply()` 会把 `.pet-chat-reply` 挂到它身上 —— 于是 `askPet()` 的轮询**第一圈就把这句提示读成了答复**（16 字、又不等于提问，`isRealReply()` 的长度与回声两条判据全都放行）；紧接着下一问撞上在飞的那一轮，读到的是 `BUSY_HINT`「……我这儿还忙着上一句呢…」（23 字，同样放行）→ 5 条身份问题全被读成客户端自己的提示句，断言判成 **0/5**（本轮实测，`reports/verify-ui.log`） | 这是**最坏的一类假红**：失败信息（"0/5 条明确自称爱弥斯"）把人指向人设与后端，而真相是断言读错了元素；反过来若提示句恰好命中词表，同一条路径也会变成**假绿**。**"读到的到底是不是她答的"不能只靠长度与回声来判** | ① 断言起手别复用"先清空再问"：**重新 `arm()` 载入页面**（前端 `chatLog` 与后端线程一起变新），把"残留答复"与"停在反问上"两个坑一次消掉；② 起手显式自检 **历史条数必须为 0**（不为 0 直接 FAIL，不许静默算过）；③ 把组件自己的占位句做成**显式排除表**（`CLEAR_NOTICE` / `BUSY_HINT` / `INTERRUPT_HINT`）—— 本地提示句**不是答复**，被读成答复时必须出声。回归断言：`verify:ui` 的 R-AGT 段「身份类禁自称」（含"起手历史 N 条（要求 0）"） |
| T69 | **"流式快照 = 整份 state" 撞上"按长度去重"，新答复更短就被静默丢弃** —— `values` 发的是**整份 state**，所以多步图（`blog_agent` 一轮实测 **4 个** `values` 快照）的**首个快照里"最后一条非空 `ai` 消息"就是上一轮的答复**。适配层旧实现把这个快照当本轮答复先收下（`sentText` 被写成上一轮的长度），随后本轮真答复只要更短，就被"变长才推"的判据丢掉 → `round.answer` 停在旧文本 → **气泡显示的是上一轮的答复**。真后端原始取证（`reports/_p5v7-snapshots.mjs`）：问「你好厉害啊」→ 42 字、id `…-dd42-0`；问「nb」→ 首快照 [1][2][3] 仍是那 42 字，第 [4] 个快照才是本轮答复 **37 字**、id `…-9f84-0` | **用户看到的是"连着问两句，两次都是同一句"** —— 发起人 2026-09-27 的图证就是它（「你好厉害啊」「nb」两次同一句；「你是谁？」「你是ai吧」两次同一句）。而且它是**静默**的：请求都真的发了、后端都真的答了，只有"哪一句算答复"错了。查起来极易误判成"模型在复读"或"走了 mock" | 两处一起改（`agent-client.ts`）：① **取答复要带锚点** —— `lastAiMessage(messages, afterIndex)`，`afterIndex` = 最后一条 human 消息的下标；本轮自己的提问一定排在最后，历史里的答复**根本取不到**（而"提问与答复同一个快照"的单 `values` 路径照样取得到）；② **换了一条消息就无条件接受**（按 `id` 判"同一条消息的流式增量"还是"换了一条新消息"），只有同一条消息才退回"变长才推"。⚠️ 判"是不是本轮答复"**不能只看长度**。回归断言：`verify:ui` 的 R-AGT 段「连问两轮，第二问的气泡必须是第二问的答复」 |
| T70 | **假后端的"答复形状"与真后端不一致 → 回归断言假绿** —— R-PET-11 那条「连续 4 问：第 N 问的答复区必须是第 N 答」（R1~R4 标记）一直是绿的，于是很容易认为"连问不串台"已经被覆盖。但它的假后端每轮**只发一条** `values`、且**只含本轮那条新答复** —— 真后端"首快照 = 整份 state（含上一轮答复）+ 一轮多个快照"这个形态**根本没被模拟**，所以 T69 那个 bug 在它眼皮底下活了下来（而且它还恰好躲过了长度判据：R1~R4 的假答复长度相近） | 一条**看起来在测同一件事**的断言，测的其实是另一个形状的输入 —— 比没有断言更危险（它给出"已覆盖"的错觉）。这类假绿的判据是："这条断言用的假数据，是不是从真后端抓下来的形状？" | ① 假后端要**照着真后端的原始抓包造**（本轮把 `values` 快照 dump 成 `reports/_p5v7-snapshots.mjs` 的输出，再按它写 `historyFake`）；② 让关键变量**真的触发旧判据**：R2 **刻意比 R1 短**（长度相近就测不到"更短被丢"）；③ 断言里把"旧实现在这里会怎么错"写进 detail，让失败信息能自证。回归断言：`verify:ui` 的 R-AGT 段「连问两轮，第二问的气泡必须是第二问的答复」（同一块） |
| T71 | **"服务保持运行"是子 agent 活着期间的状态，不跨进程继承** —— v1.38 父级独立复跑时，子 agent 的报告写着"2024 的 `langgraph dev` 保持运行（PID 44128）"；它一退出，**2024 与 4323 双双零监听**（`netstat` 无输出、`Get-Process python` 空）。原因是服务是那个 agent 的后台子进程，agent 一收工就被回收 | 父级若直接采信"服务还在跑"，第一步复跑就会拿到一堆假红（`verify:agent` 全线 SKIP、`verify:ui` 的真机往返全降级）—— 然后很容易误判成"子 agent 改坏了"。反过来，**交接说明里写"XX 保持运行"本身没有错**，错在把它当成可继承的交付状态 | 复跑前**自己把服务拉起来**并确认端口真的在听：`cd ..\agent_-for_-blog; .venv\Scripts\langgraph.exe dev --port 2024 --no-browser`、`pnpm preview --port 4323`，然后 `GET /ok` + `GET http://localhost:4323/` 各探一次再开跑。**报告里"保持运行"这类状态一律注明"截至何时"**，跨 agent 不继承 |
| T72 | **受限沙箱会把这条工具链弄坏，而症状一点都不像权限问题** —— 同一台机器上：`langgraph dev` 起不来（Python `multiprocessing` 建命名管道被拒，满屏 `PermissionError: [WinError 5] 拒绝访问` / `_winapi.CreateNamedPipe`）；`astro preview` 与 `astro sync` **连配置都加载不了**（`Unable to load your Astro config` + `require is not defined`，栈顶定位到 `node_modules/.pnpm/picomatch@4.0.7/…/index.js:6` —— 一个"Vite 把 CJS 当 ESM 求值"的假象）；`tasklist` 与 `Get-NetTCPConnection` 直接 `ERROR: Access denied`；`netstat` 与 `node -e` 读文件却完全正常（所以"文件读得到"不能证明没被限制）。**放宽权限后同一条命令 `astro preview` 19ms 就 ready** | 极易把环境限制误读成**代码回归**（"配置加载失败 = 有人改坏了 astro.config"），然后去改一堆本来没坏的代码；也极易把**跑不动的验证**当成"已验证"。本轮为此白跑了三轮（一次 preview 起不来、一次打错端口、一次 `verify:ui` 中途超时） | ① **绿色结论必须在同一环境下复跑**，换环境复跑出来的红不是回归；② 遇到"整条工具链集体失灵 + 症状不像权限"时，先跑一条**已知能成的旁证命令**（`node -e` 读文件 / `netstat`）区分"环境受限"与"代码坏了"；③ `langgraph dev` 与 `astro preview` 这类要起服务、开子进程的验证，**必须在能起服务的权限下做**，否则宁可不跑，也别把 SKIP 记成通过 |
| T73 | **`verify:ui` 默认打 4321 —— 那是别人的 dev server** —— `scripts/verify-ui.mjs` 的 `--base` 默认值是 `http://localhost:4321`；本机 4321 长期被**另一个 `astro dev`**（用户自己的，IPv6-only）占着。不传 `--base` 复跑时，脚本会静默地去打那个站：本轮实测直接 `验收脚本出错：TypeError: fetch failed … UND_ERR_HEADERS_TIMEOUT`（若那个站恰好能应答，则会跑出一份**看着像交付产物、实际是 dev 服务器**的日志） | 两类坏结果：① 报一个与本次改动无关的超时；② 更坏 —— **对着错误的站点跑完全绿**，日志数字被当成交付证据（`verify-ui-log.mjs` 的 `--base` 透传 bug 就是这一类的先例，见 T58 段注释） | **复跑一律显式给 `--base`**：验证交付产物用 `pnpm verify:ui:log --base http://localhost:4323`（顺带拿到 UTF-8 的 `reports/verify-ui.log` 供 `reports/sync-doc-counts.mjs` 读）；跑完看日志头第一行的"目标站点"是不是你要打的那个端口。**永远不要用默认值跑验收**（`pnpm verify:ui:log` 在不给 `--base` 时会补一个 4322 并打进日志头，就是为这件事） |

### 14.4 被移除的上游功能怎么找回来

P1 按发起人要求删掉了**订阅（RSS/Atom）**。删除是有意为之，但恢复路径要写清楚，免得以后想加回来时满仓库找：

| 要恢复什么 | 需要找回的文件 | 还需要接回的位置 |
| --- | --- | --- |
| feed 输出 | `src/pages/rss.xml.ts`、`src/pages/atom.xml.ts`、`src/utils/feed-utils.ts` | `siteConfig.feed`（配置块被注释掉了，取消注释即可） |
| 订阅介绍页 | `src/pages/rss.astro`、`src/pages/atom.astro` | — |
| 浏览器/阅读器自动发现 | — | `Layout.astro` 的 head 里两条 `<link rel="alternate" type="application/rss+xml·atom+xml">` |
| 页脚入口 | — | `Footer.astro` 的 RSS/Atom 链接（现在只剩 Sitemap） |
| 首页横幅图标行 | — | `backgroundWallpaper.ts` 的 `homeText.linksEnable: true` + `links` 数组 |
| 侧栏资料卡图标 | — | `profileConfig.links` 数组 |

> 全部文件都能从上游 Firefly v6.16.8 原样取回（它们是主题自带功能，删除时未做任何修改）。
> 删除本身只涉及"删文件 + 摘掉 4 处引用"，没有改动 `feed-utils` 的实现，所以恢复不需要重新适配。
