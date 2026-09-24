# IMiss Blog 架构与技术设计（ARCH）

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.10 |
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
│  └─ images/posts/<slug>/        ← 【新增】文章内图片（不进优化管线）
├─ scripts/
│  ├─ make-logo.mjs               ← 【P1 已落地】从桌宠图集裁 Logo 与 favicon
│  ├─ verify-ui.mjs               ← 【P1 已落地】界面验收（CDP 断言 + 截图，零依赖）
│  ├─ import-posts.mjs            ← 【新增】内容迁移
│  ├─ verify-posts.mjs            ← 【新增】内容校验
│  ├─ convert-wallpaper.mjs       ← 【新增】壁纸图 → webp
│  └─ export-agent-data.mjs       ← 【新增】给 Agent 导出索引
├─ deploy/nginx.conf              ← 【新增】生产站点配置
├─ reports/                       ← 【新增，.gitignore 已忽略】脚本产出：reports/screenshots/*.png、reports/import-warnings.json
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
| R-RANK-01 ~ R-RANK-06 | 见 §5.2 文件清单 | 新增为主 | 复用 `ImageWrapper.astro` 解析配图，不新造图片机制 |
| R-PET-01 ~ R-PET-05 | `src/components/features/AemeathPet.astro`（新增）+ `petConfig.ts`（新增）+ `Layout.astro` 插一行 | 新增 + 插一行 | 见 §7；`Layout.astro` 只在 `<WavesEffect />` 之后插 `<AemeathPet />` |
| R-AGT-01 ~ R-AGT-06 | `agent/**`（新增）+ `src/utils/pet-agent-client.ts`（新增） | 新增 | 见 §8 |
| R-CNT-01 ~ R-CNT-08 | `scripts/import-posts.mjs`、`scripts/verify-posts.mjs`（新增）+ `src/content/posts/**`、`public/images/posts/**` | 新增 | 见 §9 |
| R-CMT-01 R-CMT-02 | `src/config/commentConfig.ts`（不动）+ `src/content/spec/guestbook.md`（改文案） | 改内容 | 评论系统保持 `type: "none"`，留言页自动落到 `commentNotConfigured` 分支，显示"评论未配置"占位卡片；留言页说明文案在 `guestbook.md` 里重写 |
| R-DEP-01 ~ R-DEP-04 | `deploy/nginx.conf`（新增）；R-DEP-04 另需 `src/config/fontConfig.ts`（改 provider）+ `package.json`（加 `@fontsource/*` 依赖） | 新增 + 改配置 | 见 §12、§14.3 T16 |

### 4.1 最终导航树（`navBarConfig.ts`）

```
主页            /                      （LinkPresets.Home，原样保留）
文章 ▾          归档 /archive/ · 分类 /categories/ · 标签 /tags/ · 系列 /series/
排行 ▾ 【新增】  日漫排行 /rank/jp/ · 国漫排行 /rank/cn/          ← 放在「文章」与「我的」之间
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
4. **新增两个预设**（放在 `LinkPresets` 里，便于复修）：
   ```ts
   RankJP: { name: "日漫排行", url: "/rank/jp/", icon: "material-symbols:emoji-events" },
   RankCN: { name: "国漫排行", url: "/rank/cn/", icon: "material-symbols:military-tech" },
   ```
   注意：排行页是**新增页面**，不属于 `siteConfig.pages` 的开关体系（那套开关只覆盖模板自带页面），所以这两个预设**不带 `pageKey`**。
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
- 「全剧 / 单集」两个维度，状态写进 URL 可分享。

### 5.2 文件清单

| 文件 | 作用 |
| --- | --- |
| `src/types/rankConfig.ts` | 类型定义 |
| `src/config/rankConfig.ts` | **唯一需要手工维护的数据文件**（4 组数据 + 文案） |
| `src/config/index.ts` | 增加 `export { rankConfig } from "./rankConfig";` 与类型导出 |
| `src/components/pages/rank/RankBoard.astro` | 榜单板渲染（接收 board + kind + kindLabels + dataStatus）；**「全剧 / 单集」切换、入场动效、配图存在性判定都写在这个组件里**（切换用 `<script is:inline>`，原计划的 `RankTabs.svelte` 已放弃，理由见 §5.4） |
| `src/styles/pages/rank.css` | 榜单板全部版式（两档名次色、行高/名次列比例、scrim、缺图占位、移动端、入场动效） |
| `src/pages/rank/index.astro` | `return Astro.redirect("/rank/jp/")` |
| `src/pages/rank/jp.astro` | 读取 `rankConfig.boards.jp`，渲染 `<RankBoard>` |
| `src/pages/rank/cn.astro` | 读取 `rankConfig.boards.cn`，渲染 `<RankBoard>` |
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
  data: Record<RankKind, RankEntry[]>;
}

export interface RankConfig {
  kindLabels: Record<RankKind, string>;         // 两个榜单共用一套维度名称
  dataStatus: "placeholder" | "final";          // placeholder 时页面显示"当前为占位数据"
  boards: Record<string, RankBoardConfig>;
}
```

**约定**

- 数组顺序 = 名次，第 1 项是第 1 名；不写名次数字。
- `cover` 用**不带前导 `/`** 的相对路径（与 `siteConfig` 里壁纸写法一致），交给 `ImageWrapper` 的 glob 解析；以 `/` 开头则视为 `public` 资源原样引用。
- 没有 `cover` 时渲染主题色渐变占位（§5.5），不出现裂图。
- 数据规模按 10~30 条/榜设计，不做分页。

### 5.4 页面与交互

```astro
---
// src/pages/rank/jp.astro（cn.astro 同构，只换 board id）
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

1. 转换脚本 `scripts/convert-wallpaper.mjs`（用 `sharp`，不引入新依赖）：
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
| `src/config/rankConfig.ts` | `agent/data/rank.json` | 4 组榜单（标题、原名、短评、名次） |

**单向依赖**：Agent 只读导出产物，不读前端源码；前端不 import Agent 的任何东西。这样两边可以独立演进。

---

## 9. 内容迁移流水线（R-CNT）

### 9.1 源数据画像（已核实）

| 项 | 情况 |
| --- | --- |
| 文章 | `dosc/blog/**/*.md`，**142 篇 / 3.6MB**，**0 篇有 frontmatter** |
| 目录 = 分类 | AI应用、C++11、C与C++、Linux系统、linux网络、MySQL、stL、八股、基础算法、项目（+ 一个 `图片` 资源目录） |
| 图片引用 ① | Obsidian 嵌入 `![[Pasted image ….png]]`：**16 篇 / 59 处** |
| 图片引用 ② | HTML `<img …>`：**211 处** |
| 图片引用 ③ | 标准 Markdown `![alt](images/page-001.png)`：仅 `AI应用` 两篇，**磁盘上没有这些文件** |
| 图片文件 | `图片/<分类>/<文章名>/*.jpg`，共 169 张，hash 命名，**与正文引用的文件名没有对应关系** |
| 重复图片目录 | `图片\linux` 与 `图片\linux系统`：各 37 张、36 个同名文件 |
| 完全重复的文章 | 3 组（MD5 一致）：`linux基础知识点.md`／`linux基础知识点（1）.md`、`二分.md`／`二分算法.md`、`动态规划.md`／`动态规划思想.md` |

### 9.2 迁移流水线（`scripts/import-posts.mjs`）

```
dosc/blog/**/*.md
   │
   ├─(1) 去重筛选 ──→ 跳过 3 组重复中的非保留项
   ├─(2) 生成 slug ─→ pinyin-pro（模板已有该 devDependency）转 ASCII，如
   │                  C++11/智能指针 → cpp11-smart-pointer
   ├─(3) 生成 frontmatter ─→ title/date/category/tags/description/lang
   ├─(4) 图片处理 ──→ 复制到 public/images/posts/<slug>/NN.jpg
   │                 并重写正文引用（![[...]] 与 <img src>）
   ├─(5) 缺图/无法映射 ─→ 记入 reports/import-warnings.json，默认不进站
   └─(6) 写出 ──→ src/content/posts/<category>/<slug>.md
```

**默认 dry-run**：不加 `--write` 只打印将要产生的文件与警告，便于先看报告。

**frontmatter 生成规则**

| 字段 | 规则 |
| --- | --- |
| `title` | 文件名去掉 `.md`；若正文首个 `# 一级标题` 存在且非空，以一级标题为准 |
| `published` | 文件 mtime；同一目录内按 mtime 排序，保证比文章顺序合理。**需要人工确认时间**（拿到原始日期更好） |
| `category` | 一级目录 → 映射表（见下） |
| `tags` | 分类名 + 二级目录名（若有）+ 标题里出现的技术关键词白名单（如 `智能指针`、`TCP`、`epoll`） |
| `description` | 首个非标题、非图片、非表格的正文段落，截 120 字 |
| `lang` | `zh_CN` |
| `draft` | `false`；缺图且未处理的写 `true` |
| `comment` | `true` |
| `series` | 项目类文章按子目录设 `My_Server` / `搜索引擎`，用于「系列」页 |

**分类映射表（一级目录 → `category`）**

| 源目录 | category | 备注 |
| --- | --- | --- |
| AI应用 | AI 应用 | 2 篇缺图，先隔离 |
| C++11 | C++11 | |
| C与C++ | C/C++ | |
| Linux系统 | Linux系统 | 合并 `图片\linux系统` |
| linux网络 | Linux 网络 | |
| MySQL | MySQL | |
| stL | STL | |
| 八股 | 八股文 | 长文，批次最后迁 |
| 基础算法 | 算法 | |
| 项目 | 项目实战 | 下设系列 |

**图片处理策略**

1. 目标目录：`public/images/posts/<slug>/`（**public 资源**，不进构建期图片优化管线——142 篇的图片总量会让 `src` 图片优化把构建时间拖得很长）。
2. 命名：按"该文章图片目录内文件名字典序"复制为 `01.jpg`、`02.jpg`…（保持确定性），同时输出 `reports/image-mapping-<slug>.json` 记录 `原文件名 → 新文件名`。
3. 正文重写：把第 `i` 个引用（`![[...]]` 或 `<img ...>`）指向第 `i` 张图；**当引用数量与图片数量不一致时，整篇标记为"需人工映射"**并写进警告报告，不猜。
4. `AI应用` 两篇：`images/page-*.png` 全部缺失 → 按 R-CNT-07 处理（先不上线，`draft: true`，登记阻塞项）。

> 为什么不做"按文件名智能匹配"：源图是 hash 命名（`2cf9a90f….jpg`），正文里是 `Pasted image 20260531171008.png`，两者之间没有任何可用线索。**顺序映射 + 数量不一致就报错**是唯一诚实的做法；批次 1 会逐篇人工核对，用人工核对的结果反过来校准规则。

### 9.3 分批策略（R-CNT-01 / R-CNT-02）

| 批次 | 范围 | 目的 |
| --- | --- | --- |
| 批次 1 | 精选 15~20 篇，覆盖六类：有图 / 无图 / 超长文 / 含表格 / 含代码块 / 含 `![[...]]` | 验证规则、定型脚本、统一排版 |
| 批次 2 | C++11 + C与C++ + STL | 中等体量，重复结构多 |
| 批次 3 | Linux系统 + linux网络 + MySQL | 图片最多的部分 |
| 批次 4 | 基础算法 + AI应用 | 含缺图与超长错题本 |
| 批次 5 | 八股 + 项目 | 最长文（几十万字节），单独跑以免拖慢迭代 |

### 9.4 校验与隔离（R-CNT-06）

`scripts/verify-posts.mjs`（`pnpm verify:posts`），逐项检查并给出退出码：

| 检查 | 失败处理 |
| --- | --- |
| frontmatter 必填字段齐全、`published` 可解析 | 报错 |
| slug 唯一、ASCII | 报错 |
| 正文中所有本地图片路径存在 | 报错（列出文件:行号） |
| 正文无残留 `![[` | 警告（并列出位置） |
| 正文非空、有至少一个标题 | 报错 |
| `rankConfig` 每条 `title` 非空、`cover` 存在 | 报错 |

不合格的文章移动到 `src/content/_quarantine/`（**在 `posts` 集合的 glob 之外**，Astro 不会构建），这与模板自带的 `scripts/quarantine-bad-posts.mjs` 思路一致——该脚本里的 `stripCode()`（先把代码块/行内代码剥掉，再判断图片引用）与"外链不算本地图"的判断，**直接复用其做法**，不要重写。

### 9.5 只读约定（R-CNT-08）

`dosc/**` 全程只读：迁移脚本只读取、只输出报告，绝不修改源文件；`图片\linux` 这类重复目录也不删除源，只是在流程中忽略。

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

---

## 11. 脚本与命令

| 命令 | 作用 | 新增 |
| --- | --- | --- |
| `pnpm dev` | 本地开发（默认 4321 端口） | — |
| `pnpm check` / `pnpm type-check` | Astro 诊断 / TS 校验 | — |
| `pnpm build` | 完整构建（图标 → LQIP → VNDB 封面 → Astro → 字体子集 → 内联脚本压缩 → Pagefind） | — |
| `pnpm preview` | 预览构建产物 | — |
| `pnpm format` / `pnpm lint` | Biome 格式化与检查 | — |
| `pnpm verify:posts` | 内容与排行数据校验（阻断式） | ✅（P4 新增） |
| `pnpm verify:ui` | **界面验收**：开真实 Chrome 跑 **101 项功能断言**（导航顺序、站点名、色相、**上游信息/打赏入口泄漏扫描**、统计行数、热力图、占位模式、页面可达性、sitemap/**llms.txt**、配色对比度、**排行榜全项**：几何比例 / 两档名次色与对比度 / 切换与 URL / Swup 路径回归 / 键盘 / 后退 / 打印与无 JS 兜底），并输出 **13 张**截图到 `reports/screenshots/`。P1 落地、P2 扩容 | ✅（P1 新增，P2 扩容） |
| `pnpm make:logo` | 把 `src/assets/images/logo/imiss-logo.svg`（手写矢量设计源）栅格化成导航栏 Logo（webp）与 favicon 四档 PNG | ✅（P1 新增） |

> **关于 `verify:ui` 的对比度检查**：主体走"token 级"校验（`--deep-text`/`--content-meta`/`--btn-content`/`--primary` 对卡片底/页面底），不是"扫全站文字元素"。
> 原因：这个主题里大量文字压在封面图、壁纸、半透明面板上，逐元素自动判定无法可靠取得背景色（试了三版：canvas 转色 → 逐层合成 → Node 侧解析，期间还产出过"66/71 元素低于 3:1"的假警报）。
> P2 补了两处**具体**的对比度断言（不依赖背景取色）：① 名次数字对名次底色（`getComputedStyle` 直接读两个颜色，白字压粉底 ≥ 3:1、深字压橙底 ≥ 4.5:1）；② 缺图占位把渐变各档合成到不透明底色上取最亮值，与白字算对比度（暗/亮主题各一条）。
> 观感部分仍然是"**可复现的数字交给脚本，观感交给截图**"：脚本每轮输出 13 张截图并人工核对；另外把 `--hue` 在 345 与 165 之间切换做 A/B，证明"换色没让对比度变差"。
| `pnpm import:posts -- --write` | 内容迁移（默认 dry-run） | ✅ |
| `pnpm export:agent` | 导出 `agent/data/*.json` | ✅ |
| `node scripts/convert-wallpaper.mjs` | 壁纸图 → webp | ✅ |
| `pnpm new-post` | 新建文章脚手架（模板自带） | — |

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
| 榜单配图 | 单页 ≤ 1.5MB | 按显示尺寸 2 倍导出；配 `loading="lazy"` + `decoding="async"` |
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

### 14.3 模板已知陷阱（P0 阶段实测清单）

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
