# IMiss Blog 架构与技术设计（ARCH）

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.23 |
| 最后更新 | 2026-09-24 |
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
| `src/components/features/AemeathPet.astro` + `petConfig.ts` + `Layout.astro` 一行 | R-PET-01 / R-PET-02 / R-PET-03 / R-PET-05 | §7.1~§7.5 |
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
| 默认 | `idle` | 站立时朝向跟随鼠标（用 `face` 变量，不改素材） |
| 自由活动 | `running-right` / `running-left` | 在视口底部来回走；左走用第 1 行 + `scaleX(-1)` |
| 首次出场 / 切页 | `waving` | 台词取自 `petConfig.greeting` 或 `lines` |
| 单击 / 落地 | `jumping` | 重力落地后若速度大则再弹一次 |
| 拖拽中 | `failed` | 影子随高度缩小变淡；松手下落 |
| 无操作超时 | `waiting` | 进入"屏幕待机"；有任何交互立刻回 `idle` |
| 搜索框 / 命令面板打字 | `running` | 停止输入 `1.4s` 后回 `idle` |
| 对话完成 / 切主题 | `review` | 触发一次庆祝动效。**注意：模板没有"星屑爆发"能力**（那是 `blog_test` 原型 `anime.js` 里的），所以庆祝动效用组件内部的纯 CSS 小动效实现，不引第三方库；若以后想要星屑，单独开一个小任务 |
| 对话进行中 | `running` | 由 Agent 适配层的 `state` 事件驱动 |
| 对话报错 | `failed` | 气泡内给可读提示（不暴露技术细节） |

**交互**

| 操作 | 行为 |
| --- | --- |
| 单击 | 跳一下 + 随机台词 |
| 双击 | `review` + 星屑 |
| 按住拖动 | 跟随鼠标/手指，松手受重力落地 |
| 右键 | 菜单：说句话 / 跳一下 / 跟过来 / 睡一会儿 / **和爱弥斯聊天** |
| 键盘 | `Tab` 聚焦宠物；`Enter` 跳一下；`←` `→` 指挥它走；气泡用 `aria-live="polite"` |
| 位置记忆 | `localStorage["imiss.pet.pos"]`（只存 x，y 由地面决定） |

**对话 UI**

点"和爱弥斯聊天"→ 气泡变成一个小输入框（`maxlength` 与后端上限一致）→ 回车发送 → 气泡切回流式文本区，显示增量回复与命中的文章链接（`meta` 事件）→ 关闭后回到台词模式。对话期间宠物不自由走动。

### 7.5 降级与可访问性

| 条件 | 行为 |
| --- | --- |
| `prefers-reduced-motion: reduce` | 退化为静止的 `idle` 单帧；点击/对话仍然可用 |
| 页面切到后台 | 停止 `requestAnimationFrame`（省电），回来恢复 |
| 移动端（`hideOnMobile: true` 时） | 不渲染宠物节点 |
| `petConfig.agent.enable: false` 或请求失败 | 走本地 mock 台词，并在气泡里明确说"我还没连上大脑" |
| 关闭樱花/特效 | 宠物不受影响；宠物自身有独立开关（`petConfig.enable`） |

**与看板娘的互斥（R-PET-04）**：`pioConfig.ts` 的 `spineModelConfig.enable` 与 `live2dWidgetConfig.enable` 一律保持 `false`；若将来要开，必须先关掉桌宠。此约定写进 `petConfig.ts` 的注释。

**避免遮挡（R-PET-05）**：默认出场在**右下角、但预留安全区**（距右 ≥ 24px、距底 = 地面 10px，且 x 不进入浮动按钮的 96px 半径内）；`zIndex` 低于浮动控件层。

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

| 项 | 取值 | 实现位置 |
| --- | --- | --- |
| CORS 白名单 | 线上域名 + `http://localhost:4321`（dev） | `limits.py`，来自 `PET_ALLOWED_ORIGINS` 环境变量 |
| 限流 | 20 次/分钟/IP，内存令牌桶 | `limits.py`（首期单机内存即可，不做 Redis） |
| 消息长度 | ≤ 1000 字 | 网关校验 + 前端 `maxlength` |
| 输出上限 | `max_tokens` ≤ 800 | LLM 调用参数 |
| 线程数上限 | 同 IP 同时活跃线程 ≤ 3 | `limits.py` |
| 日志 | 只记 `threadId`/耗时/状态，不记消息原文 | `main.py` |
| 密钥 | 只在 `.env`（不入库）；前端零密钥 | `.env.example` 只放占位 |

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
| `pnpm verify:ui` | **界面验收**：开真实 Chrome 跑 **157 项功能断言**（导航顺序、站点名、色相、**上游信息/打赏入口泄漏扫描**、统计行数、热力图、占位模式、页面可达性、sitemap/**llms.txt**、配色对比度、**排行榜全项**：几何比例 / 两档名次色与对比度 / 切换与 URL / Swup 路径回归 / 键盘 / 后退 / 打印与无 JS 兜底、**P4 内容迁移全项**：配图真实加载 / 编号顺序 / 移动端 / 不生成 figure 图注 / URL 形态 / 双链改写 / 无 Obsidian 残留 / 表格与代码块 / 无标题短笔记 / 归档与分类收录），并输出 **24 张**截图到 `reports/screenshots/`。P3 起含桌宠与壁纸全项（九状态触发 / 键盘 / 拖拽 / 菜单 / 联动 / reduced-motion / 与浮动按钮不重叠 / 移动端隐藏 / 取景与暗罩）| ✅（P1 新增，P2/P3/P4 三次扩容） |
| `node scripts/import-posts.mjs` | **旧博客迁移**（默认 dry-run）：`--write` 落盘、`--batch 1..5`、`--cat`、`--only`、`--limit`、`--src`；报告写 `reports/import-report.json` | ✅（P4 新增） |
| `pnpm verify:docs` | **文档一致性自检**（`scripts/verify-docs.mjs`）：核对三份文档互相之间、以及文档与仓库事实是否一致——版本号与"最后更新"日期、断言/截图数与最近一次实测、排行页清单与路由文件、导航子项与 `navBarConfig.ts`、需求编号引用闭环、阻塞项条数与编号连续、§2 与 §3 阶段状态，以及**配置事实**（`displaySettingsConfig.enable`、`rankConfig.dataStatus`、"4 组数据"类说法是否漏了第 5 份）。**每次收工前跑一次**（P2 加二游排行时文档漂移了 12 处，就是没有这道关卡） | ✅（v1.12 新增） |
| `pnpm make:logo` | 把 `src/assets/images/logo/imiss-logo.svg`（手写矢量设计源）栅格化成导航栏 Logo（webp）与 favicon 四档 PNG | ✅（P1 新增） |
| `node scripts/make-rank-cover-guide.mjs` | 生成榜单配图比例对照图 `docs/imiss/rank-cover-guide.png`（16:9 原图裁成 5.7:1 后哪一条留下；发起人准备素材时看这张） | ✅（v1.13 新增） |

> **关于 `verify:ui` 的对比度检查**：主体走"token 级"校验（`--deep-text`/`--content-meta`/`--btn-content`/`--primary` 对卡片底/页面底），不是"扫全站文字元素"。
> 原因：这个主题里大量文字压在封面图、壁纸、半透明面板上，逐元素自动判定无法可靠取得背景色（试了三版：canvas 转色 → 逐层合成 → Node 侧解析，期间还产出过"66/71 元素低于 3:1"的假警报）。
> P2 补了两处**具体**的对比度断言（不依赖背景取色）：① 名次数字对名次底色（`getComputedStyle` 直接读两个颜色，白字压粉底 ≥ 3:1、深字压橙底 ≥ 4.5:1）；② 缺图占位把渐变各档合成到不透明底色上取最亮值，与白字算对比度（暗/亮主题各一条）。
> 观感部分仍然是"**可复现的数字交给脚本，观感交给截图**"：脚本每轮输出 24 张截图并人工核对；另外把 `--hue` 在 345 与 165 之间切换做 A/B，证明"换色没让对比度变差"。

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

### 14.3 模板已知陷阱（P0 起逐阶段实测清单，现有 26 条：T1~T19 来自 P0/P1，T20~T26 来自 P2）

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
