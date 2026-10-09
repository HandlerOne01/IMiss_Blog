# IMiss Blog 架构与技术设计（ARCH）

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.74 |
| 最后更新 | 2026-10-08 |
| 关联文档 | `prd.md`（需求编号 R-xxx 的来源）、`PROJECT_STATUS.md`（阶段与阻塞项） |
| 基线代码 | 上游模板基线 v6.16.8（站点信息里中性显示为「博客版本 v6.16.8」），Astro 7.3.2 + Svelte 5 + Swup + Tailwind 4，静态输出 |

本文档回答三个问题：**改哪个文件**、**怎么改**、**为什么这么改**。每一条都能追溯到 `prd.md` 的需求编号。

---

## 1. 技术栈与硬约束

| 层 | 选型 | 约束与理由 |
| --- | --- | --- |
| 站点框架 | Astro 7（静态输出） | `astro.config.mjs` 只在 `CF_WORKERS` 环境变量存在时才挂 Cloudflare adapter；本项目走静态 |
| 交互岛 | Svelte 5 | 复杂交互（搜索、文件树、分享海报、显示设置面板等）用 Svelte，其余用 Astro + 内联脚本。⚠️ **学习路线页 `/roadmap/` 刻意一个岛都不用**（纯静态 + 页内锚点，见 §5.4）：锚点跳转交回浏览器原生行为（`data-no-swup`，Swup 会吞掉点击且不写历史），页面在无 JS 时也必须完整可读 |
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
│  src/config/*.ts（站点/导航/壁纸/路线/桌宠）─┤→  astro build  →  dist/       │
│  src/assets/images/**  ─┘   ↑                                             │
│                             └─ scripts/：generate-lqips → subset-fonts      │
│                                → pagefind →（本项目新增）verify-posts       │
│  scripts/export-agent-data.mjs ──→ agent/data/{blog-index.json,rank.json}  │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
┌────────────────────────── 运行期（云服务器 / 本机） ──────────────────────────┐
│  Nginx  ── 静态文件 ──→  dist/（HTML 不缓存，/_astro 与 /assets 长缓存）       │
│    └── /api/agent/ 反代 ──→ Node 网关 :8787（server/pet-gateway.mjs，零依赖）  │
│         （SSE，proxy_buffering off）│  白名单 / 限流 / 长度 / 体积 / 单轮上限  │
│                          └── 原样透传（不翻译协议）──→ LangGraph Server :2024 │
│                                                 └── DeepSeek API            │
│                          └── LangSmith（追踪，被动上报，不在关键路径上）       │
│                                                                             │
│  浏览器：静态页面 + 桌宠组件 ─ fetch(/api/agent/threads/{id}/runs/stream, SSE) │
│          无后端时：桌宠走本地 mock，不报错（PRD R-AGT-03）                    │
└───────────────────────────────────────────────────────────────────────────┘
```

> ⚠️ 上面构建期图里的 `scripts/export-agent-data.mjs` 与 `agent/data/{blog-index.json,rank.json}` 是 **P5 之前的设计稿、从未落地**：本仓库没有这个脚本、`agent/data/` 目录也不存在（package.json 里没有 `export:agent`）。`rank.json` 那半条还牵着后端侧仍保留的 `ask_rank` 意图 —— 属**另一个仓库**的事，本计划只登记不修（**R32**，见交付报告）。
> ⚠️ **运行期那张图里的 "Python FastAPI 网关 :8000" 已在 v1.45（P5-5）被推翻**：真正落地的是**本仓库的零依赖 Node 反代 `server/pet-gateway.mjs`（:8787）**，`agent_-for_-blog` 一行未改。设计变更的理由见 §8.1，落点见 §8.4~§8.7。

**运行时数据流（桌宠对话）**

1. 桌宠组件按 §8.9 的调用序列发请求：`GET /ok` → `POST /assistants/search` → `POST /threads` → `POST /threads/{id}/runs/stream`（SSE）。`threadId` 由**服务端**建（前端持有在内存里，不写 localStorage —— 后端是内存 checkpoint，存了也要处理失效）。
2. 请求打到**同源路径** `/api/agent/...`，由 Nginx 转给网关；网关做来源/限流/长度/体积四道闸门，再把**原样的端点与协议**透传给 LangGraph Server（`:2024`），SSE 逐 chunk 转发、不缓冲。
3. 桌宠按 §8.9.3 的取法从 `values` 事件里取「最后一个 `values` 里最后一条 `content` 非空的 `ai` 消息」写进气泡，并按 §8.10 的三档时间闸门兜底。
4. 请求结束 → 回到待机；出错 / 连不上 / 契约不符 → `failed` 状态 + **本地 mock 台词**（R-AGT-03：绝不向访客报技术错误）。

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
├─ package.json                   ← 增加 verify:ui / verify:ui:log / verify:docs / verify:posts / verify:agent(:robust) / make:logo 脚本
├─ src/                           ← 模板源码（见下）
├─ public/                        ← 原样拷贝的静态资源
│  ├─ assets/videos/              ← 【新增】壁纸视频（原片 + 兜底）
│  ├─ favicon/imiss-*.png         ← 【P1 已落地】临时 favicon（32/128/180/192）；【P6-8 起 32/180/192 三档在 `siteConfig.favicon` 里登记并带 sizes】
│  └─ images/posts/<slug>/        ← 【P4 已落地】文章内图片（不进优化管线）
├─ src/content/posts/             ← 【P4 已落地】**只剩迁移进来的 10 个分类目录**；
│                                    上游示例文章 14 篇已按发起人要求删除（恢复：`git show 76a49ec:src/content/posts/`，删除前的文件名见该提交的 tree）
├─ scripts/
│  ├─ make-logo.mjs               ← 【P1 已落地 / v1.64 换源】从 `design/imiss-logo.png` 生成导航栏 Logo 与 favicon 四档
│  ├─ verify-ui.mjs               ← 【P1 已落地】界面验收（CDP 断言 + 截图，零依赖）
│  ├─ verify-docs.mjs             ← 【v1.12 已落地】文档一致性自检（文档 ↔ 仓库事实）
│  ├─ verify-agent.mjs / verify-agent-robust.mjs ← 【P5 已落地】Agent 契约自检 / 适配层健壮性回归
│  ├─ verify-gateway.mjs          ← 【v1.45 / P5-5 已落地】网关自检（自带 stub 上游 + 真后端一段，51 项）
│  ├─ verify-ui-log.mjs           ← 【P5 已落地】跑 verify-ui 并把 UTF-8 日志落成 reports/verify-ui.log
│  ├─ convert-wallpaper.mjs       ← 【P3 已落地】壁纸图 → webp（dosc/photo → imiss-d*/m*）
│  ├─ import-posts.mjs            ← 【P4 已落地】旧笔记迁移（dry-run 默认，见 §9.2）
│  ├─ verify-posts.mjs            ← 【P4 已落地】内容校验（阻断式，见 §9.4）
│  └─ export-agent-data.mjs       ← 【设计未落地】给 Agent 导出索引（v1.41 核对：脚本不存在，见 §2 的说明）
├─ server/pet-gateway.mjs         ← 【v1.45 / P5-5 新增】桌宠 Agent 网关：零依赖 Node 同源反代（:8787）
├─ deploy/                        ← 【v1.45 新增 / v1.54 扩成"上线操作单"】`nginx.conf`（/api/agent/ 反代，只有 Agent 那一段）+ `nginx-site.conf`（【v1.54】完整站点的 server{}：80 跳转 + 443 静态 + 缓存/压缩/安全头/真 404，含 `include` 上面那段）+ `publish.mjs`（【v1.55】Windows→Linux 发布脚本，**Node ESM / 零依赖**；v1.54 的 `publish.ps1` 已删除，原因见 §14.3 **T86**）+ `langgraph.service`（【v1.54】后端 systemd unit）+ `pet-gateway.service`（可选 systemd）+ `README.md`（【v1.54】从零到上线的操作单）
├─ design/                        ← 【v1.64 新增】**图标与头像的设计源**（都不进产物）：`imiss-logo.png` = **纸飞机**（发起人给的站点标识，**字节原样**，sha256 `0a6a8b45…`）、`imiss-avatar.png` = **爱弥斯人物插画**（发起人给的头像 / 大图标源，**字节原样**，sha256 `ae755478…`）。放这里而不是 `src/assets/` 的理由见 §4 的 R-ID-04 行（那个 glob 会把 `src/` 下所有图片打进 dist）
├─ reports/                       ← 【新增，.gitignore 已忽略】脚本产出：reports/screenshots/*.png、reports/import-report.json、reports/image-mapping-*.json、reports/verify-gateway.log
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
│  ├─ index.ts                    ✏️ 导出新的 roadmapConfig / petConfig
│  ├─ roadmapConfig.ts            ➕ 学习路线数据（8 条主线 × 阶段 × 篇目，**唯一需要手工维护的内容数据**；原 `rankConfig.ts` 已随 v1.41 删除）
│  ├─ petConfig.ts                ➕ 桌宠开关、缩放、台词、Agent 地址
│  ├─ pioConfig.ts                ⛔ 不改，但两个看板娘保持 enable: false
│  └─ commentConfig.ts            ⛔ type 不改（保持 "none"）；v1.49 已清空五处上游演示端点
├─ types/
│  ├─ roadmapConfig.ts            ➕ 路线类型（`RoadmapLine` / `RoadmapStage` / `RoadmapStop`；原 `rankConfig.ts` 已删）
│  ├─ petConfig.ts                ➕
│  └─ sidebarConfig.ts            ✏️ `SiteInfoConfig` 增加 `placeholder`（注意：类型真身在这里，`config.ts` 只是 barrel，见 §14.3 T1）
├─ components/
│  ├─ widget/SiteStats.astro      ✏️ 删除「运行时长」「最后活动」及其客户端脚本
│  ├─ widget/SiteInfo.astro       ✏️ 占位模式
│  ├─ features/AemeathPet.astro   ➕ 桌宠（DOM + 样式 + 脚本）
│  ├─ pages/roadmap/PathLine.astro / PathStop.astro  ➕ 路线页的「线」与「轻量行」（原 `pages/rank/RankBoard.astro` 已随 v1.41 删除）
│  └─ comment/index.astro         ⛔ 不改（留言页复用其"未配置"分支）
├─ layouts/Layout.astro           ✏️ 仅插入一行 <AemeathPet />（§7.2 给出位置）
├─ pages/
│  ├─ roadmap.astro               ➕ 学习路线（**单页**：页顶数字 + 8 条主线 × 阶段 × 篇目；原 `pages/rank/{index,jp,cn,game}.astro` 已随 v1.41 删除）
│  ├─ friends.astro / bilibili.astro / bangumi.astro / sponsor.astro
│  │                              ⛔ 不改代码，靠 pages 开关关掉（返回 404）
│  ├─ about.astro                  ⛔ 不改（导航移入「我的」；v1.65 起它渲染的 about.md 是占位页）
│  └─ about-site.astro             ➕ 关于本站（**v1.65 新增**，结构与 about.astro 同，但不发 ProfilePage 结构化数据）
├─ content/
│  ├─ posts/**                    ➕ 迁移来的文章
│  ├─ spec/about.md               ✏️ 关于我（**v1.65 起是占位页**；原内容整体搬到 about-site.md）
│  ├─ spec/about-site.md          ➕ 关于本站（**v1.65 新增**，原 about.md 那篇搬过来）
│  ├─ spec/guestbook.md           ✏️ 留言页文案
│  └─ projects/*.md               ➕ 项目（**v1.65 起 2 篇**：仿 muduo 实现的高并发服务器 / 基于正倒排索引的 Boost 搜索引擎）
├─ assets/
│  ├─ fonts/*.woff2               ✅ 本地字体（P0 已落地：3 个字体 11 个 woff2，约 205KB；**放 src 而非 public**，见 §14.3 T16）
│  ├─ images/
│  │  ├─ logo/imiss-{light,dark}.webp  ✅ 生成物（导航栏用，**256×190 纸飞机**；v1.63 及以前是 256×256 的方圆底爱心）
│  │  ├─ avatar/imiss-avatar.webp  ✅ 生成物（**486×486 人物插画**：侧栏资料卡头像 + schema.org 作者 image，v1.64 新增）
│  │  ├─ logo/（v1.63 及以前还有 `imiss-logo.svg` 这张手写矢量设计源，v1.64 已删除 → 见 `design/`）
│  │  ├─ DesktopWallpaper/imiss-*.webp  ➕ 壁纸图（临时）
│  │  └─ pet/pet-aemeath.webp     ✅ 桌宠图集（P1 提前入库，P3 使用；Logo 已不再从它裁）
├─ config/fontConfig.ts           ✅ 已改：三个字体改 `local` provider（P0，见 §14.3 T16）
└─ utils/
   ├─ agent-client.ts             ➕ 桌宠 ↔ Agent 适配层（唯一与后端耦合的文件；原设计稿叫 `pet-agent-client.ts`，**从未存在过**，见 §8.6）
   └─ roadmap-utils.ts            ➕ 路线页数据解析与页顶数字实算（原 `utils/` 无排行专属文件）
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
| R-ID-04 | `design/imiss-logo.png`（纸飞机，小图标源）+ `design/imiss-avatar.png`（人物插画，大图标与头像源）+ `scripts/make-logo.mjs`（出图）+ `siteConfig.navbar.logo` / `siteConfig.favicon` / `profileConfig.avatar` | 换设计源 + 改脚本 + 改值 | **v1.64（B-03 关闭、B-02 的"头像"那一半关闭）**：发起人 2026-10-07 先给**纸飞机**当站点标识，随即看了 Edge「安装应用」那张卡后又给了**爱弥斯人物插画**，并定下分工（原话：「**小图标是纸飞机，大图标侧栏才是人物**」，参考上游作者站 `firefly.cuteleaf.cn`）→ **小图标 = 纸飞机**（导航栏 28px + 浏览器标签 32px）、**大图标与侧栏头像 = 人物**（favicon 128/180/192 + 侧栏资料卡头像）。两张源图都**按字节原样提交**（sha256 `0a6a8b45…` / `ae755478…`），`make-logo.mjs` 从"一张源"改成"两张源 → 三组产物"：纸飞机先 `trim()` 到本体（1254×1254 → 1070×794）再出 `imiss-{light,dark}.webp`（256×190）与 `imiss-32.png`；人物出 `imiss-{128,180,192}.png`（满幅不透明方图）与 `src/assets/images/avatar/imiss-avatar.webp`（486×486）。**为什么源是位图**：两张都是发起人给的既有作品，重画成矢量必然有描摹误差。**为什么源放仓库根的 `design/`**：`Navbar.astro` 的 glob 会把 `src/` 下所有图片打进 dist（实测纸飞机那张 541 KB 源图会出现在 `dist/_astro/` 且**零处引用**）。**配色实测**：飞机浅蓝 `#8dd1e2` 在深蓝底上 9.07:1、粉 `#dd7ea6` 5.59:1，只有深紫尾翼 1.6~2.0:1 偏弱（占 6.6%，阴影面）。**断言（v1.64 新增 5 条，都在真浏览器里读像素/canvas，另 3 条钉文件名/接线）**：① 32px 中央列上下各有 ≥8% 透明带 ② 32px 内容包围盒 ≈1.35:1 且满宽 ③ 导航栏 Logo 固有尺寸 256×190 ④ 180/192 满幅不透明方图 ⑤ 侧栏头像与 192 图标**同源**（8×8 缩略指纹平均差 < 15）而 32px 与它们**不同源**（负控 > 40）。**注入验证**：把四档 favicon 与导航栏 webp 换回旧爱心、并把头像换成纸飞机 → `303 项：✅293 / ❌5 / ⏭️5`、退出码 1，**红的正好是这 5 条**（日志留档 `reports/_logo-inject-heart.log`），还原后 303 全绿。<br>⚠️ **v1.63 及以前**：设计源是手写矢量 `src/assets/images/logo/imiss-logo.svg`（粉色晶体心 + 青色四角星芒 + 机械翼片 + 深蓝紫方圆底，栅格化出 256×256），v1.64 已删除该文件（需要时去 git 历史取）。⚠️ **v1.43（P6-8）补的接线**：四档 PNG 里 180/192 此前只有文件、没有引用 —— `siteConfig.favicon` 只登记了 32px，而 `Layout.astro` 当时按「数组里第一个 `.png`」挑 `apple-touch-icon`，于是 iOS 主屏拿到的是 32px 放大图。现在 32/180/192 三档都进 `siteConfig.favicon` 且**各带 `sizes`**，`Layout.astro` 改成**优先 `sizes="180x180"`、否则取面积最大的 png**（Apple 约定 180；`sizes` 全缺时排序退化为保持原顺序＝旧行为）。顺带：`schema-image.ts` 的 publisher logo 也随之从 128px 变成 192px（它本来就按面积挑最大的 raster） |
| R-ID-06 | 删 5 个文件 + 改 4 处接线 | 删文件 + 改配置 | 删：`src/pages/{rss,atom}.astro`、`src/pages/{rss,atom}.xml.ts`、`src/utils/feed-utils.ts`。改：`Layout.astro` 去掉 head 里两条 `<link rel="alternate">`；`Footer.astro` 去掉 RSS/Atom（保留 Sitemap）；`backgroundWallpaper.ts` 的 `homeText.linksEnable: false` + `links: []`；`profileConfig.links: []`（`Profile.astro` 对 0 个链接不渲染整行，布局不会塌）。`siteConfig.feed` 配置块已注释掉并标注"无消费方"（保留上游类型定义）。**恢复清单见 §14.4**。注意：这 4 条路由删掉后是**真 404**，与 R-NAV-05/06 的 noindex 存根行为不同（因为文件不存在，没有任何页面去 redirect） |
| R-ID-07 | `src/config/displaySettingsConfig.ts`（上游文件，**只改 `enable` 一个值**）+ `src/components/controls/DisplaySettingsIntegrated.svelte`（面板本体 38.4KB，**未改**） | 改 1 个值 | **上游自带、默认关闭**；从 P0 基线（`3dbc38d`）到开启前的 `git diff` 证明这批文件一个字节都没改过——不是被删，是默认关着。**发起人已决定对访客全开**（2026-09-24，原话"肯定要这个啊"）→ `enable: true`，其余条目保持开启。备用开启方式：环境变量 `PUBLIC_DISPLAY_SETTINGS=true`（优先级更高；实测 dev 下按钮与面板都在，未设变量的 `dist` 为 0）。**成本已实测**：全开（含 `wallpaperModeSwitchable`）→ 每页 HTML **+11.6 KB**（38 页共 +439.7 KB，dist 20.76→21.19 MB），`_astro/*.js` 总量无变化；**比上游注释估的 +33 KB/页低得多**。**注意**：面板"主题色相"改的就是 `--hue`，`siteConfig` 的 345 只是默认值，访客拖过会写进自己的 localStorage。**面板本身的改进已关闭、不再排期**（⚠️ **v1.53 更正**：原文写「待排期（发起人：先做完 P2/P3）」，那是 2026-09-24 当时的说法；**P1-18 已按发起人 2026-09-29 看过面板截图后的判定「不用改」在 v1.45 关闭**，见 `PROJECT_STATUS.md` §3 的 P1-18） |
| R-ID-08 | `src/config/licenseConfig.ts` + `src/components/widget/SiteInfo.astro` | 改值 + 改组件 | `licenseConfig.enable: true → false`（发起人 2026-09-24："这个许可协议似乎没有啥用啊"）；`SiteInfo.astro` 里许可那一项**改成条件展开**（`...(enable ? [{…}] : [])`）——原来关闭时会显示一个 `None` 假值。文章页的许可块由 `posts/[...slug].astro` 的 `licenseConfig.enable &&` 控制，配置一关就整块不渲染，**不用改页面**。想恢复：`enable: true` |
| R-ID-09 | `src/config/siteConfig.ts` 的 `post.share`（**保持 `true`**）+ `src/components/misc/SharePoster.svelte`（**未改**） | 只加注释，不改行为 | 发起人 2026-09-24 评审时先问"这个二维码扫了也没啥用啊"，随后澄清"**我要分享块啊**，只是后面提醒我添加域名而已" → **分享块保留**。真正的临时问题在数据：`SharePoster.svelte` 用 `url={Astro.url.href}` 生成二维码、「复制链接」也用它，而 `site_url` 还是 `https://imiss.example.com`（B-01）→ 域名到位前扫码/复制指向假域名。**域名到位后三步**：`site_url` 填真值 → 重建 → 把 `verify:ui` 的占位域名断言翻成真值断言（**执行方要主动提醒**，见 `PROJECT_STATUS.md` §1 第 6 条） |
| R-NAV-01 ~ R-NAV-06 | `src/config/navBarConfig.ts` | 重写 `getDynamicNavBarConfig()` 与 `LinkPresets` | 见 §4.1 的最终导航树。**P1 已落地**，另附带两处改名收尾：`i18n/languages/zh_CN.ts` 里 `vndb`→「轻小说」、`mal`→「番剧」，以及两个页面"未配置数据源"的文案（否则导航叫「轻小说」而页面标题还叫 VNDB，自相矛盾） |
| R-NAV-07 | `src/config/siteConfig.ts` 的 `pages` | 改值 | 见 §4.2 的开关矩阵；`nav-menu-utils.ts`、sitemap 过滤、`llms.txt.ts` 都已按 `pageKey` 处理，**无需改代码**。⚠️ 关闭的页面在**静态输出**下不是 HTTP 404，而是 Astro 的 noindex 跳转存根，真 404 由生产 Nginx 给（§12.2、§14.3 T17） |
| R-WDG-01 | `src/components/widget/SiteStats.astro` | 删代码 | `stats` 数组删掉 `running-days`/`last-update` 两项；随之删除 `getActivityDate`/`lastActivityDate`/`lastPostDate`/`siteStartDate`/`todayText` 与整个 `<script is:inline>` 块（不再有动态项）；`formatNumber` 保留给总字数用 |
| R-WDG-02 | `src/config/sidebarConfig.ts` | 改值 | 日历组件 `specificConfig.calendar.showHeatmap: true → false` |
| R-WDG-03 | `src/types/sidebarConfig.ts` + `src/components/widget/SiteInfo.astro` | 改类型 + 改组件 | ⚠️ **实测纠正**：`WidgetSpecificConfig` 与 `SiteInfoConfig` 的真身在 `src/types/sidebarConfig.ts:37-52`，`src/types/config.ts` 只是 barrel（re-export，**不用改**）。在 `SiteInfoConfig`（现只有 `unknownBuildPlatform` 一个字段）上加 `placeholder?: boolean`；`SiteInfo.astro` 在占位模式把"构建平台/系统架构/构建时间/CI"等值替换为 `—`，卡片底部加一行「部署后自动填充」；本地配置项（文章许可）照常显示 |
| R-WDG-04 | `src/config/sidebarConfig.ts` | 不改（确认清单） | 保持左侧 `profile`/`announcement`/`music`/`categories`/`tags`，右侧 `dynamic`/`stats`/`siteInfo`/`calendar`/`sidebarToc`，两个 `advertisement` 保持 `enable: false`；移动端底部组件保持现状。⚠️ **v1.63 补记**：左侧那一格 `music`（`position: "top"`）在 **v1.47~v1.62 期间因为 `showInNavbar`/`showInSidebar` 被置 `false` 而**不渲染**（配置一直在、只是渲不出来），v1.63 恢复播放器后**重新出现在左栏**；本行的清单**一字未改**（它本来就是"保留 `music`"的口径），变化发生在 `src/config/musicConfig.ts` 那两个开关上 |
| R-BG-01 | `scripts/convert-wallpaper.mjs`（新增）+ `src/assets/images/DesktopWallpaper/imiss-d*.webp` + `backgroundWallpaper.ts` | 新增 + 改值 | 见 §6.1 |
| R-BG-02 | `backgroundWallpaper.ts`（`src.playerUrl`）+ `public/assets/videos/*` | 改值 + 新增资源 | 见 §6.2 |
| R-BG-03 | `backgroundWallpaper.ts` 的 `common.homeText` | 改值 | ⚠️ **P1 已提前处理一部分**（因为它是"站点身份 + 打赏移除"的盲区，见 §14.3 T18）：横幅 `links` 里模板作者的 GitHub / 邮箱 / **Sponsor 打赏入口**已全部删除，换成 RSS + Atom；主标题从模板默认标题（`Lovely <上游主题名>!`）换成本站名占位。**正式横幅文案仍等发起人定稿（B-10）** |
| R-BG-04 | `backgroundWallpaper.ts` 的 `banner.position` + `common.dimOpacity` | 改值 | `position` 控制 cover 取景锚点（默认 `"0% 20%"` 保头脸），`dimOpacity` 控制暗罩（默认 0.2）；换素材后按 §6.4 复量 |
| ~~R-RANK-01 ~ R-RANK-07~~ | ~~见 §5.2 文件清单~~ | **v1.41 已随排行模块删除**（R-RANK 在 `prd.md` 里标「已废弃」保号；那一格改由 R-PATH 学习路线承担 —— 落点见本表下方的 R-PATH 行） | —— |
| **R-PATH-01 ~ R-PATH-06** | `src/config/roadmapConfig.ts` + `src/types/roadmapConfig.ts` + `src/utils/roadmap-utils.ts`（新增）+ `src/pages/roadmap.astro` + `src/components/pages/roadmap/*` + `src/styles/pages/roadmap.css` | 新增 | 见 **§5**；纯静态零 JS，页顶数字构建期实算，篇目用 `slug` + `category` 成对定位（解析不到**构建期直接失败**） |
| R-PET-01 ~ R-PET-05 | `src/components/features/AemeathPet.astro`（新增）+ `petConfig.ts`（新增）+ `Layout.astro` 插一行 | 新增 + 插一行 | 见 §7；`Layout.astro` 只在 `<WavesEffect />` 之后插 `<AemeathPet />` |
| R-AGT-01 ~ R-AGT-06 | `agent/**`（**设计稿，未落地**，见 §8.1~§8.3）+ `src/utils/agent-client.ts`（新增，**v1.45 起是这个名字**）+ **`server/pet-gateway.mjs`（P5-5 网关）** | 新增 | 见 §8。R-AGT-02 的"对外只暴露一个网关"由**同源反代**满足（`/api/agent/*` → 网关 → §8.9 的 5 个端点），**不是**设计稿里的 `POST /api/pet/chat` |
| **R-AGT-07**（P5-0） | `src/config/agentConfig.ts`（新增）+ `src/types/agentConfig.ts`（新增）+ `scripts/verify-agent.mjs`（新增）+ `src/config/index.ts`（挂 barrel） | **新增配置与契约测试，不写业务逻辑** | 见 **§8.9**。`enable` 保持 `false`（P5-0 阶段桌宠仍走 `petConfig.mockReplies`，一个请求都不发）；`baseUrl`/`graphId`/`timeoutMs`/`resumeWords`/`fallbackToMock`/`debug` 六个字段只放"能被改的值"。契约测试零依赖、服务没起时 SKIP 且**退出码 0**、契约不符**退出码 1** |
| R-CNT-01 ~ R-CNT-08 | `scripts/import-posts.mjs`、`scripts/verify-posts.mjs`（新增）+ `src/content/posts/**`、`public/images/posts/**` | 新增 | 见 §9 |
| R-CMT-01 R-CMT-02 | `src/config/commentConfig.ts`（`type` 不动）+ `src/content/spec/guestbook.md`（改文案） | 改内容（+ v1.49 清空五处上游演示端点，见 R-ID-05） | 评论系统保持 `type: "none"`，留言页自动落到 `commentNotConfigured` 分支，显示"评论未配置"占位卡片；留言页说明文案在 `guestbook.md` 里重写。**v1.49**：`twikoo.envId` / `waline.serverURL` / `artalk.server` / `giscus.repo`+`repoId`+`categoryId` / `disqus.shortname` 五处上游演示值与上游仓库已清空成空串（`type: "none"` 下不生效，纯拆雷：切到 giscus 时不再默认把访客评论发到主题作者仓库） |
| R-DEP-01 ~ R-DEP-04 | `deploy/nginx.conf`（新增）；R-DEP-04 另需 `src/config/fontConfig.ts`（改 provider）+ `package.json`（加 `@fontsource/*` 依赖） | 新增 + 改配置 | 见 §12、§14.3 T16 |

### 4.1 最终导航树（`navBarConfig.ts`）

```
主页            /                      （LinkPresets.Home，原样保留）
文章 ▾          归档 /archive/ · 分类 /categories/ · 标签 /tags/ · 系列 /series/
学习路线        /roadmap/              【v1.41 新增】单链接、**无子项**（R-PATH-01）
                                        ← 占的是「文章」与「我的」之间那一格（原「排行」下拉位）
我的 ▾          动态 /dynamic/ · 项目 /projects/ · 相册 /gallery/ · 书签导航 /booknav/
                轻小说 /vndb/（原 VNDB，改名不改功能） · 番剧 /myanimelist/（原 AnimeList）
                关于我 /about/（v1.65 起是**占位页**，新自我介绍待发起人提供）
                关于本站 /about-site/                             ← **v1.65 新增，发起人要求放在「关于我」下面**
                                                                  （内容是原 about.md 那篇整体搬过来；公告「了解更多」也改指它）
链接 ▾          外链列表（**v1.61 起是发起人的 6 条**：Gitee / GitHub / CSDN / 洛谷 / Boost 搜索引擎 / HTTP 服务器）
                —— 触发器是 `url: "#"` 的下拉，**6 条都不是站内页面**（全 `external: true`、无 `pageKey`），见下面第 6 点
留言            /guestbook/                                        ← 原「社交」父项删除，本项最后
```

实现要点：

1. **删除「社交」父项**，把 `LinkPresets.Guestbook` 作为顶层 `links.push({...LinkPresets.Guestbook})`，位置在所有项之后。
2. **删除「关于」父项**：`LinkPresets.Sponsor` 与 `LinkPresets.About` 不再出现在 `links` 里；`About` 作为 `我的` 的最后一个 child。
3. **改名两项**：`LinkPresets.VNDB.name = "轻小说"`、`LinkPresets.MAL.name = "番剧"`（URL、`pageKey`、图标都可保留，`VNDB` 的图标可换成 `material-symbols:menu-book` 之类更贴切的）。
4. **第 3 格（R-PATH-01 / v1.41）**：直接 `links.push` 一个内联对象，**不进 `LinkPresets`**（它只此一处用，无需复修入口）：
   ```ts
   links.push({
       name: "学习路线",
       url: "/roadmap/",
       icon: "material-symbols:route",
   });
   ```
   注意三点：① 它不属于 `siteConfig.pages` 的开关体系（那套开关只覆盖模板自带页面），所以**不带 `pageKey`**；
   ② **不挂 `children`** —— 8 条主线走页内锚点，桌面/手机上挂 8 个子项会爆版；
   ③ 顶层的**单链接**项渲染成 `:scope > a`（带 `href`），带子项的项渲染成 `<button data-dropdown-trigger>`（**没有 `href`**）——
   `verify-ui.mjs` 的 `COLLECT` 正是靠这一点把 `navTops[2].href` 读成 `/roadmap/`。
   > 原「排行」下拉与 `LinkPresets.RankJP/RankCN/RankGame` 三个预设随 P2R **一并删除**（全仓只被那一组引用，已 grep 核实）；
   > 完整的原样代码留在本文件 §14.4「恢复路径表」与 v1.40 之前的最后一个提交里。
   > ⚠️ 这条规则对**任何**导航项都成立：加子项时**必须同时建好路由**（如 `src/pages/<子目录>/<id>.astro`），否则导航里就是一个死链；
   > `pnpm verify:docs` 的「导航子项」检查会核对"导航项 ↔ 实际路由"两边一致（v1.41 起该检查是两态的：`navBarConfig.ts` 里
   > 「排行」组在不在，决定它查 `/rank/…` 子项还是查「学习路线」→ `/roadmap/`）。
5. 未使用的预设（`Friends`/`Bilibili`/`Bangumi`/`Sponsor`）从 `LinkPresets` 中删除，避免以后被误引用。⚠️ **v1.47 起 `Friends`/`Sponsor` 的页面文件也已删除**（`/friends/`、`/sponsor/` 是**真 404**，不再是 noindex 存根）；**v1.48（P4-8 收尾轮）**又删掉它们的配置残留：`src/types/{friends,sponsor}Config.ts`、`src/styles/pages/{friends,sponsor}.css`、`navbar-i18n.ts` 里 `友链`/`打赏` 两条死映射。`Bilibili`/`Bangumi` 两个页面文件仍在、仍靠开关关掉。恢复路径见 §14.4。
6. **第 5 格「链接」= 纯外链下拉，不进 `LinkPresets`**（v1.57 重建、**v1.61 整批换成第二批 6 条**）：直接在 `getDynamicNavBarConfig()` 里内联 `links.push({ name: "链接", url: "#", icon: "material-symbols:link", children: [...] })`，位置固定在第 4 格「我的」与第 6 格「留言」之间。判据与口径（`prd.md` R-NAV-09 / R-NAV-10、`scripts/verify-ui.mjs` 的 `EXPECT_LINK_CHILDREN`）：
   - 6 条**都不是站内页面** → 每一条都要 `external: true`（新标签页打开 + `rel`），且**一律不许挂 `pageKey`**（`pageKey` 是给站内页面开关用的；随便挂一个不存在的 key 也**不会**隐藏，详见本文件 §4.1 第 4 点那条批注）；
   - 子项名字取**短名**，与书签导航页那 38 张卡的全名**故意不同**；
   - **地址必须干净**：v1.61 照办把 CSDN 的 `?spm=…` 跟踪参数去掉了（同 R-BOOKNAV-04 那一轮的口径）；
   - ⚠️ **唯一例外是发起人点名要的裸 IP 那条**：「Boost 搜索引擎」= `http://106.52.158.48:8081/`（裸 IP + 非标准端口 + HTTP，该 IP 同时是本站后端数据库所在机器）。**照原样收录**，配置注释里写明代价与"有域名后换 `https://<域名>/`"的建议；`verify:ui` 有一条**配置层**判据同时钉住"6 条无查询串 / 裸 IP 那条原样在 / 注释里有 https 建议"（只钉渲染出的 DOM 证不了后两件事）。
   - 图标：Gitee / GitHub / CSDN / 洛谷 用 `simple-icons:*` 品牌图标；「Boost 搜索引擎」「HTTP 服务器」没有品牌图标 → 用含义图标 `material-symbols:search-rounded` / `material-symbols:dns-rounded`。名字逐个对过 `node_modules/@iconify-json/{simple-icons,material-symbols}/icons.json`，且 `astro.config.mjs` 的 `icon({ include })` 里两套都是 `["*"]` 全量包含。

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
| GitHub 卡片 | `api.github.com`（构建期，按正文里的 `::github{repo=...}` 指令） | ⚠️ 会尝试联网，但**失败不阻断** | `generate-github-card-data.ts:54` 会请求，`:95` 失败时打印 `[GITHUB-CARD] Failed to refresh …; keeping cached data.` 并保留已提交的 `src/constants/github-card-data.json`。⚠️ **v1.48 更正（这一段是当时的结论；v1.51 起已被推翻，以本行末的 v1.53 更正为准）**：这里原来写"本站迁移后正文不含该指令，这一步即空转" —— **不成立**：`src/content/spec/about.md` 里仍有两条 `::github{repo="…"}`（v1.48 当时还在等发起人的新关于页文字，那几轮硬约束禁改），所以**v1.48 当时**这一步**每轮构建都真的会请求 api.github.com**；⚠️ **v1.51 起不再如此**（见行末）。而 `github-card-data.json` 是**构建期生成物**（每次 build 整个重写，只保留"这次刷到了"或"缓存里本来就有"的 repo）：本项目实测 API 返回 `403 rate limit exceeded`，所以**缓存里已有的原样保留、缓存里没有的会被删掉**；反过来，**能连上 API 时，正文里还留着的 `::github{}` 指令会把对应条目重新写回缓存** —— v1.48 实测走完了整个来回：删掉后一次 403 构建条目消失，下一次 API 通了 → `[GITHUB-CARD] Cached 2 repositories (2 refreshed)` → **条目被自动写回、内容与原文逐字节相同**，所以本轮最终**保留不删**那条条目（详见 `PROJECT_STATUS.md` §7.1）。结论：条目在不在取决于"正文指令 + 当轮网络"，**不是一次性删除**。⚠️ **v1.53 更正（这一段以这里为准）**：v1.51 把 `about.md` 换成中立版后**全站再无 `::github{repo=…}` 指令**（`git grep '::github' src/` 只剩 `rehype-component-github-card.mjs` 里那句报错文案），生成器口径是「正文里出现过的 repo」→ `src/constants/github-card-data.json` 已落成 `{}` 且**不再写回**（v1.51 两次连续构建实测都是 `[GITHUB-CARD] Cached 0 repositories (0 refreshed).`）。也就是说：**这一步现在是真的空转、也不再联网**，"条目会自己长回来"这条盲区已关闭（`PROJECT_STATUS.md` §7.1 标关闭于 v1.51）；想让它回来只有一条路 —— 再往正文里写 `::github{}` 指令 |
| 学习路线 `/roadmap/` | `src/config/roadmapConfig.ts` | ❌ 不联网 | 纯本地数据：8 条主线 × 阶段 × 篇目，篇目引用站内已有的 133 篇；页顶四个数（**篇数 / 主线数 / 停靠点数（含跨线复用）/ 总时长**，实测渲染 `133 篇 · 8 条主线 · 136 个停靠点（3 处跨线复用）· 约 69 小时` —— 总时长 = 各线表头小时数之和，同一套取整口径）构建期由 `getCollection("posts")` 实算。<br>~~排行 `/rank/*` → `rankConfig.ts`~~（v1.41 随排行模块删除，见 §5.2 删除清单） |
| 动态 `/dynamic/` | `src/content/dynamic/*.md` → `/api/dynamic.json` | ❌ | 也可切到 Memos（本项目不用） |

---

### 4.4 需求覆盖矩阵（可核对）

上表的区间写法便于阅读，这里逐条列出 50 条需求各自唯一的落点，便于评审时一条条对：

| 落点（文件 / 位置） | 覆盖需求 | 详见 |
| --- | --- | --- |
| `src/config/siteConfig.ts` | R-ID-01 / R-ID-02 / R-ID-03 / R-ID-05 / R-NAV-05 / R-NAV-06 / R-NAV-07 | §4.2 |
| `design/imiss-logo.png`（v1.64 起的设计源）+ `imiss-*.webp` + `public/favicon/imiss-*.png` + `scripts/make-logo.mjs` | R-ID-04 | §4 |
| `src/i18n/languages/zh_CN.ts`（页面名与未配置文案） | R-NAV-03 | §4 |
| `src/config/navBarConfig.ts` | R-NAV-01 / R-NAV-02 / R-NAV-03 / R-NAV-04 | §4.1 |
| `src/components/widget/SiteStats.astro` | R-WDG-01 | §4 |
| `src/config/sidebarConfig.ts` | R-WDG-02 / R-WDG-04 | §4 |
| `src/types/sidebarConfig.ts` + `src/components/widget/SiteInfo.astro` | R-WDG-03 | §4 |
| `scripts/convert-wallpaper.mjs` + `src/assets/images/DesktopWallpaper/*` + `backgroundWallpaper.ts` | R-BG-01 / R-BG-03 / R-BG-04 | §6.1 |
| `public/assets/videos/*` + `backgroundWallpaper.src.playerUrl` | R-BG-02 | §6.2 |
| `src/config/roadmapConfig.ts` + `src/types/roadmapConfig.ts` + `src/utils/roadmap-utils.ts` | R-PATH-01 / R-PATH-02 / R-PATH-03 / R-PATH-04 | §5.2、§5.3 |
| `src/pages/roadmap.astro` + `src/components/pages/roadmap/{PathLine,PathStop}.astro` + `src/styles/pages/roadmap.css` | R-PATH-01 / R-PATH-05 | §5.4、§5.5 |
| ~~`src/pages/rank/*` + `rankConfig.ts` + `RankBoard.astro` + `rank.css`~~ | ~~R-RANK-01~07~~ | **v1.41 已随排行模块删除**（R-RANK-01~07 在 `prd.md` 里标「已废弃」保号；恢复路径 §14.4） |
| `src/components/features/AemeathPet.astro` + `petConfig.ts` + `pet-utils.ts`（`PET_MOOD_STATES` 等帧率口径）+ `src/utils/pet-chat-text.ts`（`cleanMarkdown()`）+ `Layout.astro` 一行 | R-PET-01 / R-PET-02 / R-PET-03 / R-PET-05 / R-PET-06 / R-PET-07 / R-PET-10 / R-PET-11 | §7.1~§7.6 |
| `pioConfig.ts` 保持关闭 + 互斥注释 | R-PET-04 | §7.5 |
| ~~`agent/src/agent/**`（含 `persona.txt`）~~ | R-AGT-01 / R-AGT-06 | **设计稿，从未在本仓库落地**：R-AGT-06 的硬约束是"完全新建、**不改** `agent_-for_-blog`"，实际服务就是它（人设文本在本仓库 `agent/` 留档，代码在另一个仓库）。见 §8.1、§8.2 的说明 |
| **`server/pet-gateway.mjs`**（v1.45 / P5-5 落地） + `scripts/verify-gateway.mjs` + `deploy/nginx.conf` | R-AGT-02 / R-AGT-05 | **§8.4、§8.5、§8.7**（原设计是 `agent/src/gateway/**` 的 Python FastAPI 网关，已推翻） |
| `src/utils/agent-client.ts` | R-AGT-03 / R-AGT-04 / R-AGT-08 | §8.6、§8.10 |
| `scripts/import-posts.mjs` | R-CNT-01 / R-CNT-02 / R-CNT-03 / R-CNT-05 / R-CNT-07 | §9.2、§9.3 |
| `scripts/verify-posts.mjs` | R-CNT-06 | §9.4 |
| 去重规则 + 只读约定 | R-CNT-04 / R-CNT-08 | §9.1、§9.5 |
| `src/content/spec/guestbook.md` + `commentConfig.ts`（保持 `none`；v1.49 清空上游演示端点） | R-CMT-01 / R-CMT-02 | §4 |
| `deploy/nginx.conf` | R-DEP-01 / R-DEP-02 | §12.2、§12.3 |
| 部署后回填清单 | R-DEP-03 | §12.4 |
| 构建期无外网约束 | R-DEP-04 | §2、§4.3、§14.3 T16 |
| 删除订阅功能（残留接线清干净） | R-ID-06 | §4、§14.4 |
| 显示设置面板（调色盘 / 界面结构管理） | R-ID-07 | §4 |

---

## 5. 学习路线子系统（R-PATH）

> **本章 v1.40 取代原「5. 排行子系统（R-RANK）」**。发起人 2026-09-27 决定：**删掉排行，换成学习路线**。理由是排行需要作者持续产出 5 份榜单数据 + 约 50 张 5.7:1 配图（阻塞项 **B-08**），而路线页的数据**全部来自站内已有的 133 篇笔记**。
> 原章节（设计目标 / 文件清单 / 数据模型 / 页面与交互 / 视觉规格 / 空数据处理的完整正文）在 git 历史里：**v1.40 之前的最后一个提交**；被删代码的恢复路径见 **§14.4**。

### 5.1 设计目标

- **回答一个问题：「我该按什么顺序学」** —— 站内 133 篇笔记按「主线 → 阶段 → 篇目」组织成一条能从头读到尾的路。`/archive/` 已经能列出全部文章，路线页多出来的价值就是**顺序与阶段**。
- **零新素材**：不引入任何图片、不新增需要作者维护的内容型数据；篇目全部是站内已有文章的引用，阅读时长复用文章页现成口径（§5.5）。
- **纯静态、零 JS**（发起人 2026-09-27 选定）：无 JS 也能看到 8 条线、133 篇与每个可点链接（对应 `prd.md` §6.2「内容可见性不依赖 JS」）。**不做** localStorage 进度打勾、「下一站」推荐、拖拽排序。
- 删掉排行同时**关闭 B-08**：不再需要那 5 份榜单数据与约 50 张配图。

### 5.2 文件清单

| 文件 | 作用 |
| --- | --- |
| `src/types/roadmapConfig.ts` | 类型定义（`RoadmapLine` / `RoadmapStage` / `RoadmapStop`） |
| `src/config/roadmapConfig.ts` | **唯一需要手工维护的数据文件**：8 条线 × 阶段 × 篇目（顺序即数组顺序） |
| `src/config/index.ts` | 增加 `export { roadmapConfig } from "./roadmapConfig";` 与类型导出 |
| `src/pages/roadmap.astro` | **唯一页面**（单页 + 页内锚点） |
| `src/styles/pages/roadmap.css` | 版式：线 / 阶段 / 轻量行 / 页顶数字 / 锚点索引 / 移动端 |
| `src/components/pages/roadmap/PathLine.astro` | 单条线：线名 + 一句话说明 + 难度档 + 阶段 + 篇目行 |
| `src/components/pages/roadmap/PathStop.astro` | 单篇**轻量行**：标题 + 分类 + 约 N 分钟（**不拉封面、不显 note**） |
| `src/utils/reading-time.ts`（**仅当需要退路时才建**，见 §5.5） | 与 remark 插件同一套时长口径的共用入口 |

**删除清单（排行）**：`src/pages/rank/*`（4 个）、`src/config/rankConfig.ts`、`src/types/rankConfig.ts`、`src/components/pages/rank/RankBoard.astro`、`src/styles/pages/rank.css`、`src/assets/images/rank/_demo-*.webp`（2 张演示图）、`navBarConfig.ts` 的 `LinkPresets.RankJP/RankCN/RankGame` 与「排行」子树。全仓 `src/` 下约 **440 处**、文档约 **142 处** 引用 —— **v1.41 已按本清单全部清理完毕**（现在 `src/` 下再 grep「排行 / rankConfig / /rank/」只剩三类**不影响运行**的命中：① 注释里"这一格原来是排行、已删除"的历史说明；② 文章正文里"按 %CPU 排行"这类无关用词；③ 首页模板自带的「Top 10 标签排行」组件）。

### 5.3 数据模型

```ts
// src/types/roadmapConfig.ts
export type RoadmapLevel = "入门" | "进阶" | "实战";

export interface RoadmapStop {
	slug: string;          // 对应 src/content/posts/<category>/<slug>.md
	category: string;      // 分类目录名；**必须与 slug 成对**（站内有同名篇目，见下）
	name?: string;         // 显示名覆盖（只影响本页显示，**不改文章标题**）
	crossLine?: boolean;   // 跨线引用标记（同一篇出现在多条线里）
}
export interface RoadmapStage { title: string; stops: RoadmapStop[] }
export interface RoadmapLine {
	id: string;
	name: string;
	summary: string;       // 一句话说明（结构的一部分，保留）
	level: RoadmapLevel;
	stages: RoadmapStage[];
}
```

**线的构成（8 条，合计 133 篇，一篇不落）**

| id | 线 | 篇数 | 阶段（篇数） | 备注 |
| --- | --- | --- | --- | --- |
| `cpp` | C++ 与 STL | 40 | C 与内存基础(11) → 面向对象与模板(6) → STL 容器与实现(17) → 现代 C++(6) | `cpp/vector`、`cpp/list`、`cpp/string` 与 `stl/vector`、`stl/list`、`stl/string` **同名**（**两边文件名都是小写**；frontmatter 标题才是大写）→ 用 `name` 覆盖为「vector · 用法」/「vector · 模拟实现」 |
| `algo` | 算法与数据结构 | 26 | 基础技巧(3) → 查找与贪心分治(4) → 动态规划(4) → 图论(8) → 字符串与数学(4) → 进阶结构(2) → 总复习(1) | `algorithm/suanfacuotiben`（173KB）放**线尾**当总复习 |
| `linux` | Linux 系统 | 27 | **总览(1) → 上手与工具(5) → 编译与调试(5) → 文件与系统(5) → 进程(6) → 信号与线程(4) → IPC(1)** | **发起人指定**：`linux/linux-jichuzhishidian` 放**开头** |
| `net` | 网络 | 13 | 协议基础(7) → 编程接口(3) → 高并发 IO(3) | |
| `mysql` | MySQL | 6 | 基础(5) → 深入(1) | **发起人指定**：从「网络与 MySQL」里**拆出来单独一条** |
| `interview` | 面试八股 | 12 | 总览与语言(3) → 计算机基础(6) → 手撕与刁钻(3) | |
| `project` | 项目实战 | 6 | HTTP 小项目(1) → My_Server 框架(3) → 搜索引擎(2) | 与 `/series/`（My_Server 4 篇 / 搜索引擎 2 篇）有重叠：**series 是"同一项目的连载"，路线是"读的顺序"，两者并存** |
| `ai` | AI 应用 | 3 | 依次递进(3) | **发起人指定补上**（`sdd` → `langchain-nengli-xiangjie` → `langgraph-nengli-xiangjie-xuexibiji`） |

**三条建模规矩**

1. **顺序 = 数组顺序**，不写显式「第 N 步」数字 —— 改顺序时不会漏改编号。
2. **`slug` + `category` 成对定位**：站内确实存在同名篇目（`cpp` 与 `stl` 下的 `vector` / `list` / `string`），只按 slug 查会命中错的那篇。
3. **允许跨线引用**（`crossLine: true`，全站限制在 2~3 处）：例如「HTTP 协议」既在 `net` 线、也是 `project` 线的前置；「设计模式」既在 `interview` 线、也贴 `cpp` 线。**不做"一篇只归一条线"**（那样会有几篇被硬塞进不合适的线）。

### 5.4 页面与交互

- **`/roadmap/` 单页**（不拆 8 个子页：拆了导航要挂 8 个子项、手机上会爆，而路线本身是"一条从头读到尾的路"）。结构：
  - 页顶：一行**站点数字**（构建期实算，见 §5.6）+ **8 个锚点索引**
  - 主体：8 个 `h2`（线）→ 线的一句话说明 + 难度档 + `N 篇 · 约 M 小时` → `h3`（阶段）→ 篇目轻量行
- **轻量行**：`标题 · 分类显示名 · 约 N 分钟`（**没有封面、没有 note**）。⚠️ 分类那一格显示的是**文章 frontmatter 的 `category`**（`C/C++` / `Linux 网络` / `八股文` / `AI 应用` …，与面包屑 / `/categories/` / 归档同一套叫法），**不是** `src/content/posts/` 下的目录名（`cpp` / `linux-net` / `interview`）—— 目录名只是定位键（`roadmapConfig` 的 `category` 字段用来查文章，`resolveRoadmap` 另把 `entry.data.category` 作为 `categoryLabel` 带出来），属实现细节，不该出现在访客眼前（终审 I3：这是设计轮的疏漏，落地按显示名渲染）。**v1.52（P2R-9②）补**：frontmatter 的 `category` 为空时**不退回目录名**，改用站点既有约定 `i18n(I18nKey.uncategorized)`（zh_CN 渲染「未分类」；与 `PostMeta.astro` 的 `category || i18n(I18nKey.uncategorized)`、`content-utils.ts` 的分类聚合是同一套）—— 站内 133 篇 frontmatter `category` **无一为空**，所以改前/改后 `dist/roadmap/index.html` 逐字节相同。一页 133 行**不许拉图**（否则首屏体积爆），这条写成断言（§5.7 #8）。
- **纯静态**：不用 Svelte island、不写 localStorage、不依赖任何运行期 JS。
- **导航**：顶层第 3 格（原「排行」，固定位置在「文章」与「我的」之间）= **「学习路线」→ `/roadmap/`，不带子项**；「文章」下拉（归档 / 分类 / 标签 / 系列）**一根手指都不动**。
- **旧地址 `/rank/`、`/rank/jp/`、`/rank/cn/`、`/rank/game/` 直接删，不做 301**（站点尚未上线、没有外部链接指向它；上线后若确需再补）。

### 5.5 阅读时长口径：复用，不另造

文章页现成口径是 `src/plugins/remark-reading-time.mjs`（`reading-time` 包 → `Math.max(1, Math.round(minutes))`，写进 `remarkPluginFrontmatter.minutes`）。

路线页要 133 篇的时长，两条路：

1. **首选**：对每个 entry 调 `render()`，取 `remarkPluginFrontmatter.minutes` —— **与文章页逐字一致**。代价是一页要渲染 133 篇，**必须实测构建耗时增量**。
2. **退路（当增量 > 15 秒时）**：把公式抽成 `src/utils/reading-time.ts`，路线页用它、插件也改用它（**一处公式、两处使用**）。此时两处数值可能**差 1 分钟** —— 这种情况必须写进文档，不许悄悄存在。

无论走哪条：页顶总时长与每线小计都**构建期实算**（§5.7 #7）。

### 5.6 空数据与错误处理

| 情况 | 行为 |
| --- | --- |
| `slug` + `category` 解析不到文章 | **构建期直接失败**（抛错，不是静默跳过）—— 这是 §5.7 #1 的实现基础 |
| 某条线 0 篇 | 不渲染该线，构建日志 warning |
| 某阶段 0 篇 | 不渲染该阶段，构建日志 warning |
| 篇目并集 ≠ 站内总篇数 | 构建日志 warning（`resolveRoadmap` 里 `seen.size !== posts.length` 即 warn，v1.41 落地；真正的把关交给 `verify:ui` 的 #2 —— 它读构建产物 `dist/api/allPostMeta.json` 对账站点，不跟字面量比） |
| 页顶数字 | 构建期由 `getCollection("posts")` 实算，**不许硬编码** |

### 5.7 验证（约 16 条，取代排行那 44 条）

| # | 断言 | 来源 |
| --- | --- | --- |
| 1 | 每个 `slug` + `category` 都解析到**真实文章**（改文章路径/分类立刻报错）—— ⚠️ 这一条落在**构建期抛错**（`resolveRoadmap`，页面根本盖不出来），**不是** `verify:ui` 里的断言 | 新增（命根子） |
| 2 | 8 条线篇目**并集 = 站内总篇数**（有跨线引用时按并集算）—— 站内篇数**不写字面量**：当场读构建产物 `dist/api/allPostMeta.json`（v1.41 终审 I1） | 新增（命根子） |
| 3 | 每条线 ≥ 3 篇、每个阶段非空 | 新增 |
| 4 | 页面上 8 条线的名称都在 | 新增 |
| 5 | **关掉 JS 后**页面里仍有 133 条篇目 | 新增（纯静态的硬要求） |
| 6 | 每个篇目链接 `href` 请求都能 200 | 新增 |
| 7 | 页顶数字与构建期实算一致（防硬编码） | 新增 |
| 8 | 轻量行里**不含 `<img>`**（防后来加封面拖爆首屏） | 新增 |
| 9 | 页内 8 个锚点每个都能跳到对应区块（`elementFromPoint` 手法） | 新增 |
| 10 | 390px 无横向溢出 | **迁移**自 R-RANK-06 |
| 11 | 经 Swup 切页进入/离开路线页后，锚点与导航仍正常 | **迁移**自 R-RANK-02 |
| 12 | 浏览器后退正常 | **迁移**自 R-RANK-02 |
| 13 | 打印时 8 条线都在 | **迁移**自 R-RANK-02 兜底 |
| 14 | canonical 正确（不带查询串） | **迁移**自 R-RANK-01 |
| 15 | 导航：第三格是「学习路线」、`href=/roadmap/`、无子项；「排行」不存在 | 新增 |
| 16 | `/rank/`、`/rank/jp/`、`/rank/cn/`、`/rank/game/` 不在 sitemap 且请求返回 404 | 新增（替换原「`/rank/` 存根跳转」那条） |

**那 44 条 R-RANK 的处置**：约 **10 条**属通用能力（上表 #10~#14）→ **重新指向 `/roadmap/`**；约 **34 条**是排行专属（名次两档配色与对比度、全剧/单集切换与 URL、短评胶囊不压标题、缺图占位、二游单一榜、占位提示、榜单 10 条、`/rank/` 存根跳转）→ **删除**，并在 `PROJECT_STATUS.md` §8 变更日志里逐类写明"删了什么、为什么"。
**断言总数**：257 − 44 + 16 = **约 229**（这是 v1.40 设计轮的估算；`verify-docs` 的「4 组/5 份数据」与「`rankConfig.dataStatus`」两条检查随排行一起删）。

> **落地实测（v1.41，Task 2~5 逐轮按 `reports/verify-ui.log` 落盘）**：断言总数**不是**估算的 229，而是
> **232** —— **257 → 274**（Task 2/3/5 新增路线页断言）**→ 231**（Task 4 删掉 43 条排行相关、保留 2 条改名）
> **→ 232**（Task 4 修复轮补 1 条「llms.txt 无排行残渣」）**→ 234**（终审修复波：R-NAV-02 换面后补「进 /about/ 抽屉标当前页 + 展开父级」1 条、R-PATH-03 补「同名两行显示名可区分」1 条）**→ 235**（v1.43 / P6-8：补「apple-touch-icon 指向 180px 图标（不是 32px）」1 条）。演进与拆分的完整口径见 **§11**（**数字只认
> `reports/verify-ui.log` 的汇总行**）；`verify-docs` 的检查项由 **17 → 15**（删掉两条排行专属检查）。

### 5.8 文档落点

`prd.md` 新增 **R-PATH-01…R-PATH-06**（§3.5R，**v1.41 已全部标「已实现」**），原 **R-RANK-01~07 标记为「已废弃（v1.40 移除）」但不删行**（保住编号历史）；`prd.md` §2 导航树去掉「排行」；`ARCH.md` 本表 §5 换章、§4.1 导航树同步、§11 断言数 **257 → 232（实测，详见 §5.7 的落地实测段）**、§13 体积口径复核；`PROJECT_STATUS.md` §2/§3 的 P2 由「已完成」改「已移除」、新增 P2R 任务块、**B-08 关闭**、§8 变更日志、版本 → **v1.41**；`README.md` 同步命令与目录说明（含新增「怎么维护学习路线」一节）。三份文档共用 **v1.41**。

## 6. 背景与动态壁纸子系统（R-BG）

模板已经内置视频壁纸能力：`backgroundWallpaper.src.playerUrl` + `src/components/features/BackgroundPlayer.astro`（带播放/切换按钮、加载失败 toast）。**所以"图片变视频"不需要新写播放器**，本项目要做的是：图片期先上图片，视频产出后把 `playerUrl` 指过去，并按原型已验证的参数微调降级与循环。

### 6.1 图片期（R-BG-01）—— **已退役（v1.70）**

> ⚠️ 这一节记录的是**历史**：4 张静态图（`src/assets/images/DesktopWallpaper/imiss-d{1..4}.jpg`）
> 已按发起人要求**从仓库删除**，`backgroundWallpaper.src.desktop/mobile` 现在是**空数组**。
> 壁纸走 §6.5 的动态壁纸。把图片壁纸装回来 = 填回这两个数组 + 关掉 `video.enable`。
> 下面这段原文保留，因为它解释了"为什么当初是原图直出"——那条原则在视频期同样适用（不压缩）。

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

### 6.2 视频期（R-BG-02）—— **v1.70 已落地（下面这张表是"计划 vs 实际"）**

发起人 2026-10-09 交来 5 支原画（2944×1248 / 2.36:1 / 各 10 秒 / 合计 51.34 MB）并给了四条硬要求：
「**动态壁纸替换所有静态图片**」「**请注意首尾帧以达到无限循环要求**」「**能不裁就不裁**，
要裁时**人物在展示中心**（手机端脸必须全露），**全屏展示完整的动态壁纸**」
「**不可压缩我的动态壁纸大小和画质，这是原则，不能动，我要原画**」。

下面这张表是 P3 照原型 `blog_test` 写下的**计划**，右列是本轮**真正落地时的事实** ——
**有三条与计划不同**，逐条写明原因（别照着左列去做，会走回头路）：

| 议题 | 计划（原型 README 的实测记录） | **v1.70 实际落地** |
| --- | --- | --- |
| 首选素材 | 原片直出 | ✅ **照做，且更严**：5 支 mp4 按**字节原样**放 `public/assets/wallpaper/`，构建链路零转码；`verify:ui` 在**产物里**核对字节数 + sha256（R-BG-02） |
| 循环点 | "原片首尾帧大概率对不上 → 正放+倒放拼回文、**必须重编码**" | ⚠️ **实测推翻**：5 支的**首尾帧差都 ≤ 它自己 1 秒的正常运动量**（见 §6.5 的实测表）→ `loop` 硬切看不出接缝。**不做回文拼接**：那要重编码，而发起人的硬要求是"不可压缩、要原画" —— 计划里这条是拿"假设对不上"换来的，实测对得上就该省掉 |
| 兜底码率 | 14Mbps 够用 / 8Mbps 更省 | ⛔ **不适用**：不做二次编码，原片就是最终稿（码率 6.6~10.7 Mbps，见 §6.5） |
| 播放速率 | 0.5 倍 | ⚠️ **改为原速 1.0**：0.5 倍是原型那支 hero 视频的口味；发起人这 5 支是**循环壁纸**，本身节奏慢，调速属于"没要求的改动"。要调也就一行（`video.playbackRate`） |
| 交叉淡入 | 按素材秒算窗口、只淡入上层 | ⛔ **不需要**（接缝本身在阈值内）。**手动换壁纸**时另有一道 260ms 的**淡出→换源→淡入**（`video.fadeMs`），那是"换素材"的观感，不是循环点处理 |
| 封面帧 | 与视频同一画面 | ✅ **照做**：首帧 `t=0.001s` 导出 1920 宽 webp（`public/assets/wallpaper/<slug>-poster.webp`），三处用它 —— 首屏秒出、`prefers-reduced-motion` 下静止显示、全屏 contain 的留白垫底 |
| 降级 1 减少动态 | 不播、只显首帧 | ✅ **已落地**（在**壁纸层**的脚本里，不是 `BackgroundPlayer.astro` —— 那条路是"按钮切换的覆盖播放器"，本站不用它，见 §6.5 第 4 条） |
| 降级 2 省流量 | `saveData` → 不播 | ✅ **已落地**：读 `navigator.connection.saveData`，为真则不自动下载/播放（原画一支 8~13.5 MB，这条不是可选项） |
| 降级 3 切后台 | `pause()`，回来接着播 | ✅ **已落地**：`visibilitychange` 停/续播，不停不卸载。**不碰** `data-bg-video-playing` 那套同步（那是给模板播放器按钮用的，本站没开那个按钮） |
| 取景 | `cover` + `object-position` 锚点，与 `banner.position` 同源 | ⚠️ **升级成"按框反算"**：素材 2.36:1 而站点有四种框（0.71:1 ~ 2.9:1），一个写死的百分比不可能同时对上 → 每项自带 `focus`，脚本按当前框算 `object-position`（§6.5 第 2~3 条） |

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

### 6.4 换素材后的验收动作（v1.70 起大部分已经自动化）

1. **加壁纸 = 往 `video.playlist` 加一项**（+ 出一张首帧海报）。加完跑这三条命令就有结论：
   `node reports/_wallpaper-import.mjs`（字节原样入库 + 记 sha256）、
   `node reports/_wallpaper-posters.mjs`（出海报）、
   `pnpm verify:ui`（原画字节 / 在播 / 接缝 / 取景 / 三种降级 全在断言里）。
2. **接缝**不用肉眼赌：`verify:ui` 会在页面里真解码首帧与末帧、算平均绝对差并与"1 秒运动量"比
   （阈值见该条断言）。要单独复量 5 支就重跑 `node reports/_wallpaper-probe.mjs`。
3. ⚠️ **窄屏（≤1023px）的横幅高度与内容定位要一起改**：壁纸框读 `--banner-height-mobile`，
   内容定位（窄屏 `--content-top`）也必须读同一个变量，否则横幅下面会空出一块页面底色
   （v1.71 修过一次，见 §6.5 ①b）。加了新断点或改了 `BANNER_HEIGHT_MOBILE` 时，
   拿 `node reports/_band-probe.mjs` 量一眼"壁纸框底边 → 内容面板顶边"是不是"重叠 3.5rem"。
4. **取景**要人眼过一遍（判据只能保证"人物锚点在窗口里"，框好不好看还得看）：
   `node reports/_wallpaper-shots.mjs` 出四种框的截图到 `reports/screenshots/`。
4. 三种降级：前两种在 `verify:ui` 里（`prefers-reduced-motion` 重载 + CDP 注入 `saveData`），
   第三种（切后台）用 CDP 真开一个标签页把本站挤到后台再激活回来。

### 6.5 动态壁纸：素材台账、取景算法、降级与扩展点（v1.70 落地）

**① 素材台账（全部按字节原样，未压缩/未转码）**

| 文件（`public/assets/wallpaper/`） | 时长 | 体积 | 首尾帧差 MAD（大差异像素） | 1 秒正常运动 MAD（大差异像素） |
| --- | --- | --- | --- | --- |
| `chuangbian.mp4` | 10.125s | 7.95 MB | 2.663（0.394%） | 4.181（3.543%） |
| `xingye.mp4` | 10s | 9.85 MB | 3.07（0.191%） | 2.566（0.129%） |
| `hupan.mp4` | 10.125s | 12.89 MB | 5.307（2.191%） | 9.341（10.221%） |
| `xishoutai.mp4` | 10.125s | 9.12 MB | 3.715（1.192%） | 9.623（11.747%） |
| `taluo.mp4` | 10.125s | 11.53 MB | 4.937（1.738%） | 10.553（11.864%） |

- 五支均为 **2944×1248（2.36:1）/ 单 GOP / H.264 High@5.0**，合计 **51.34 MB**。
- ⚠️ **全屏模式用 cover（v1.72 更正）**：v1.70 我按"完整展示"做成了 `contain`，手机竖屏下画面缩成中间一条、
  上下两大块模糊垫底，发起人指出「全屏不是这个意思，和 firefly 一样」—— firefly 的壁纸容器实测就是
  `object-fit: cover`。改回 cover 后手机 390×844 可见源区只占原画 **20%** 宽（很紧的人像裁切，脸在正中），
  桌面 1440×900 占 68%；`contain` 分支保留但默认不用。
- **"接缝小"这条是量出来的**：判据是"末帧 vs 首帧的平均绝对差 **≤** 该素材自己 1 秒的正常运动量" ——
  五支全部满足，所以 `loop` 硬切看不出来（验收脚本每次跑都会在页面里重新量一遍活的那一支）。
- 复量命令：`node reports/_wallpaper-probe.mjs --all`（出 `reports/_wp-probe.json` + 逐帧 PNG）。

**①b 窄屏横幅高度：一个从 P3 起就没对上的数（v1.71 修）**

`--banner-height-home` = **80vh**（`constants.ts` 里 45+35，当年为了桌面大图不裁脸才调高的），
但 `layout-styles.css` 在 ≤1023px 的四处媒体查询里把壁纸框压成 **65vh** ——
**内容定位没有跟着压**，于是 `--content-top` 仍是 80vh−3.5rem：

| 量点（390×844） | 修前 | 修后 |
| --- | --- | --- |
| 壁纸框底边 | 549 | 549 |
| 内容面板顶边 | **626** | **500** |
| 两者之间 | **77px 纯页面底色**（+ 水波 84px + 渐变 55px，都是页面底色 ⇒ 一块黑板） | **−49px（重叠 3.5rem）** |

`layout-base.css` 那行注释写的是"= 65vh - 3.5rem"——**那是旧值**，说明这个不一致是改 80vh 时留下的。
修法：`BANNER_HEIGHT_MOBILE = 65` 收成单一事实来源，壁纸框（原来四处写死）与窄屏 `--content-top` 都读它。
⚠️ 这条与"什么壁纸"无关：静态图时代空档就在，只是**亮图配黑板**比**视频配黑板**更不容易被注意到。

**② 取景算法（R-BG-07 的核心，`WallpaperSection.astro` 里的 `applyFit()`）**

问题是"一个 `object-position` 喂四种框"：素材 2.36:1，而框有 0.71:1（手机横幅 65vh）、2:1（首页横幅 80vh）、
2.9:1（非首页横幅 55vh）、1.6:1（全屏）。所以改成**每次按当前框算**：

`
s = max(cw/iw, ch/ih)            // cover 的缩放比
visW = min(iw, cw/s)             // 这个框能看见原画的多宽（手机端只剩 30%）
left = clamp(focus.x*iw - visW/2, 0, iw - visW)
objectPosition.x = left / (iw - visW) * 100
`

落点还有三个可选旋钮：`focusAnchorX`（水平落点，默认 0.5 = 正中）、`focusAnchorY`（垂直落点，默认 0.45）、
`zoom`（放大系数，默认 1）。**为什么"下拉"要靠 zoom**：手机端框是竖的（0.71:1）而片源是横的（2.36:1），
高度成了约束 ⇒ 整幅高度全可见、**垂直方向一格余量都没有**，人物想"下沉"只能放大（放大后下缘被裁，
人物在框里的高度占比 ≈ `focus.y × zoom`），代价是可见宽度同比例变窄（44% → 26%）。发起人 2026-10-09
给了三条逐支微调，落地值见 `video.playlist` 里的注释与 prd R-BG-07。

`focus` 是**人物锚点**（每支一项，写在 `video.playlist` 里），取值来自
`reports/_wp-probe.mjs` 的肤色蒙版 + 12×6 边缘密度网格，再逐帧目视核对（`reports/_wp-frames/`）。
判据也不是"看着像"：断言**从 DOM 反推**可见窗口左边界，再算锚点在窗口里的偏移（0 = 正中）。

**③ 降级（R-BG-02 要求三条，全部落地在壁纸层脚本里）**

| 触发 | 行为 | `data-play-reason` | 断言 |
| --- | --- | --- | --- |
| `prefers-reduced-motion: reduce` | 不播，显示海报 | `reduced-motion` | ✅（重载 + 模拟媒体特性） |
| `navigator.connection.saveData` | 不自动下载/播放，显示海报 | `save-data` | ✅（CDP 在文档创建前注入） |
| 页面切到后台 | `pause()`，回前台续播 | `hidden` | ✅（真开一个标签页把本站挤到后台） |
| 浏览器拒绝自动播放 | 保持海报 | `autoplay-blocked` | 兜底（不判红） |

**④ 扩展点（发起人说"以后还会加壁纸、还要按时间排序"）**

- 加壁纸 = 往 `video.playlist` 加一项（+ 出一张海报）→ `_wallpaper-import.mjs` / `_wallpaper-posters.mjs` 两条命令。
- `video.order` 已有 `first / random / sequence / time` 四档；每项还留了 `timeRange` 字段。
  `time` 的匹配逻辑**故意没写**（时段怎么分、哪支配哪个时段要他定，写了也是猜）——见 prd R-BG-06。
- 手动换壁纸（R-BG-05）的那套 UI 直接服务播放清单：两侧箭头 / 拖动 / 键盘都能在 5 支之间循环
  （`window.__imissWallpaperVideo.step(±1)`，与轮播那套 `__imissChangeToSlide` 同构）。
- ⚠️ **v1.74：三种模式都能换了**。原来 `canSwitch()` 写死 `isBannerMode()`，全屏与透明覆盖下换不了；
  而且拖动监听挂在 `#wallpaper-wrapper` 上 —— **透明覆盖模式下壁纸层在 `z-index:-1`，指针事件根本到不了它**，
  等于没绑。现在：可切换模式 = banner / fullscreen / overlay；拖动改 **document 级捕获**（保留"从链接/按钮
  开始就交给它自己"与"先横向意图明确"两道防误触）；新增**点击空白换下一张**（`manualSwitch.click`，
  只在 fullscreen / overlay）；两侧箭头在全屏模式下也渲染。
- 取景的逐支微调（v1.73/v1.74 两轮）：窗边回正中（0.50）、湖畔 0.44 + zoom 1.15、洗手台 **0.38** + zoom 1.06。

**⑤ 两个工程上的坑（都已写进代码注释与陷阱表）**

- **高视口截图会把渲染进程卡死**：`verify:ui` 的 `sidebar-1440`（1440×2400）在视频壁纸下必挂 ——
  2400 高的视口 → 横幅 1920 → 视频被放大到约 4500×1920，软件合成顶不住；且一旦卡住连
  `Runtime.evaluate` 都不回，**事后重试救不回来**。处置：这类页面在**导航前**就
  `Network.setBlockedURLs(["*.mp4"])`，只让海报参与构图（观感一致，成本降到 1/10）。
- **"占位符/转义在补丁脚本里被吃掉"**：本轮三次踩到同一族（见 T91），最狠的一次是
  `\/` 被吃成 `/` —— 产物里的正则提前闭合，`pnpm check` 完全看不见，只在浏览器里抛 `SyntaxError`。

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
  hideOnMobile: boolean;        // 移动端是否隐藏（**v1.67 起默认 false**：手机上显示，只是缩得更小，R-PET-12）
  mobileBreakpoint: number;     // 默认 768
  scale: number;                // 桌面档精灵缩放，0.6 ~ 1.5（0.86 → 约 124×134px）
  mobileScale: number;          // 手机档精灵缩放（视口 ≤ mobileBreakpoint−1 时生效，v1.67 新增，0.62 → 约 89×97px）
  miniFactor: number;           // 迷你档比例系数（v1.67 新增，0.5 → 桌面约 62×67px；双击恢复；菜单文案 v1.69 起是「缩小」）
  startSide: "left" | "right";  // 首次出场靠哪边
  zIndex: number;               // 默认 66（低于浮动按钮 1000 与移动端菜单面板 1100）
  idleSecondsToSleep: number;   // 无操作多久进入屏幕待机，默认 45（秒）
  chat: { … };                  // R-PET-11 聊天框几何 / 历史上限 / 折叠阈值 / 思考中短句（见 §7.6 第 19~27 条）
  lines: string[];              // 随机台词池
  greeting: string;             // 首次出场台词
  movement: {                   // R-PET-06 运动模式（v1.59 起**默认 `fixed`**，改一行即可切换）
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
| 单击 | 跳一下 + 随机台词（**原地**：R-PET-09 起跳跃动画期间位置定住、不掉高度也不浮动）。⚠️ R-PET-13：菜单里的「说句话」入口已删，**单击仍是"让她说话"的唯一入口**；迷你档（菜单文案「缩小」）下单击只跳、不说话（`say()` 在迷你期间直接返回） |
| 双击 | `review` + 星屑；**「关闭」档下双击 = 把她叫回来**（R-PET-13：同一个 `setMini(false)`，挥爪 + 一句「……我回来了。」） |
| 按住拖动 | 跟随鼠标/手指；**松手：`ground` 受重力落地 / `float` 就地悬停 / `fixed` 原地不动**（R-PET-06） |
| 右键 | 菜单（**v1.67 起顺序**）：**和爱弥斯聊天** / **落下去 · 飘起来**（按档位二选一） / **缩小**（= 缩成很小一只，双击恢复；文案随状态变「缩小」↔「叫醒她」；v1.69 前写作「关闭」）。⚠️ R-PET-13 删掉的只是「说句话」的**入口**：`say()` 仍在左键单击、键盘 Enter、切档应答、出场问候四处被调用。⚠️ R-PET-08 起菜单**并排在宠物的左边或右边**（哪边够放哪边、默认右侧，纵向顶部对齐，见 §7.6 的 R-PET-08 小节），摆好后用 `elementFromPoint` 抽 5 个点确认没被遮挡（被挡就换边 / 纵向让开）；菜单项「跟过来」「睡一会儿」（R-PET-08）与「跳一下」（R-PET-09，左键单击就能跳）都已按发起人要求删除 —— 三者的**函数/状态本体都还在用**，只是入口没了。菜单必须带 `z-index`（宠物 `zIndex` + 1 = 67），否则会被壁纸/正文面板压在下面 |
| 键盘 | `Tab` 聚焦宠物；`Enter` 跳一下（**R-PET-09 保留**：它是 `role="button"` 的无障碍激活路径，与左键单击完全等价；发起人说的"按键没有必要"指的是菜单里那个「跳一下」按钮，已删）；`←` `→` 指挥它移动（`ground` 走 / `float` 飘 / `fixed` 不动）；气泡用 `aria-live="polite"`。**R-PET-11 的聊天框**另有一套：`Enter` 发送（走原生隐式提交）、`Esc` 关框并把焦点还给宠物、`↑` / `↓` 翻自己说过的话；历史区是 `role="log" aria-live="polite"`，气泡在聊天时换成 `role="dialog"`（不再整块重播历史） |
| 位置记忆 | `localStorage["imiss.pet.pos"]`（R-PET-06 起存 `{x,y,mode}`，兼容 P3 的纯数字旧格式；**模式以配置为准**，见 §7.6） |

**对话 UI**

点"和爱弥斯聊天"→ 气泡变成一个小输入框（`maxlength` 与后端上限一致）→ 回车发送 → 气泡切回流式文本区，显示增量回复与命中的文章链接（`meta` 事件）→ 关闭后回到台词模式。对话期间宠物不自由走动。

**怎么关（R-PET-14）**：Esc / Swup 切页 / **点面板与角色之外的任意处** —— 面板里**没有**关闭按钮（发起人 2026-10-08 先答"× 这个可以有"、随后明确「**不加叉键，那个功能不要了**」；代码里那处注释写明了"谁要再加先问过他"）。最后一条是 v1.68 按发起人要求补的 —— 在那之前手机上**根本没有关框路径**（没有 Esc、面板里也没有关闭按钮），发起人附的截图就是"聊天框铺了大半屏、退不出去"。判据里的两个例外同样是他的口径：**面板自己**（输入框 / 历史 / 「↓ 最新」/「清空对话」/ 气泡本体）与**角色本人**（点她=逗她玩，不关框）。⚠️ 连带的必修项：点角色走的是 `jump(); say();`，而 `say()` 是直接写 `#pet-bubble.textContent` 的 —— 聊天面板就长在那个节点里，**这一下会把整个面板 DOM 冲掉**（`chatList` / `chatInput` 当场变成游离节点，历史再也长不出来、清空按钮也不工作）→ `say()` 加了 `chatOpen` 闸门（聊天里的每一句都走 `addLine()`，不经过它）。

### 7.5 降级与可访问性

| 条件 | 行为 |
| --- | --- |
| `prefers-reduced-motion: reduce` | 退化为静止的 `idle` 单帧：`ground` 档贴地站着、`float` 档**静态悬浮**（停在悬浮基准线上，不浮动也不飞行，`movement.flyRespectReducedMotion` 控制是否禁飞）；点击/对话仍然可用 |
| 页面切到后台 | 停止 `requestAnimationFrame`（省电），回来恢复（悬浮/飞行都靠这条循环，因此也随之暂停） |
| 移动端 | **v1.67 起默认显示**（`hideOnMobile: false`）：走**手机档缩放** `mobileScale`（0.62 → 精灵约 89×97px，桌面 `scale` 0.86 → 约 124×134px），气泡宽度收到 176px。⚠️ 把 `hideOnMobile` 改回 `true` 仍然有效（解析期脚本按它插值、整块不启动），这条机制有断言钉着 |
| `agentConfig.enable: false` / 接不上 / 超时 / 契约不符 / 答复为空 | 走本地 mock 台词（`fallbackReply()` 按用户那句话挑，出厂池是 `petConfig.mockReplies`）：**短、平、然后给出口**，不报错、不提任何内部信息（服务/端口/连接/模型/图/线程/错误码一个都不许有）、**也不自称 AI / 程序 / 模型 / 机器人**（R-PET-11 的硬要求）。⚠️ `petConfig.agent.enable` 是 P3 遗留的**死配置**（没有消费方），真正的开关是 `agentConfig.enable` |
| 关闭樱花/特效 | 宠物不受影响；宠物自身有独立开关（`petConfig.enable`） |

**与看板娘的互斥（R-PET-04）**：`pioConfig.ts` 的 `spineModelConfig.enable` 与 `live2dWidgetConfig.enable` 一律保持 `false`；若将来要开，必须先关掉桌宠。此约定写进 `petConfig.ts` 的注释。

**避免遮挡（R-PET-05）**：默认出场在**右下角、但预留安全区**（距右 ≥ 24px、距底 = 地面 10px，且 x 不进入浮动按钮的 96px 半径内）；`zIndex` 低于浮动控件层。⚠️ R-PET-06 起这条规则要**跟着宠物当前高度走**：`rightLimit(yTop)` 的收窄判据从"地面高度"改成了传入的纵向位置（默认 `pet.y`），否则悬浮/飞行中的宠物在按钮正上方时不会收窄（贴地档的判据与改前等价）。

### 7.6 运动模式（R-PET-06）

发起人原话（2026-09-26）：「这个小人应该是可以**悬浮**的、偶尔可以**到处飞**的，**且默认是这样**；可以给个**固定（不给飞）**和**下落（在下面）**的选项。」→ 三档做成配置 `petConfig.movement.mode`，**改一行即可切换**（组件启动读它；`localStorage` 里的模式只是"记着"，永远不覆盖配置）。⚠️ **2026-10-02 发起人推翻了其中"且默认是这样"**：「**这小人待机时会移动，别让它移动**」→ **默认档由 `float` 改成 `fixed`**（三档全留，见本节第 28~32 条）。

| 档位 | 落点（y 怎么来） | 有没有重力 | 计时器到点什么 | 拖动松手后 |
| --- | --- | --- | --- | --- |
| `float`（**v1.59 前是默认**，仍是可用档位） | 悬浮基准线 `vh × 0.52 − h/2`（`PET_TUNING.hoverLineRatio`），并在 `±hoverAmplitude` 内正弦浮动；**离地至少 `PET_TUNING.airMinGap` = 48px**（"不贴地"的硬约束，拖放/缩窗都会被它夹回） | 无 | `nextAt` 到点 → `startFlight()` 从**当前位置**朝随机方向挪 `flyDistanceRange` = 60~180px（R-PET-07）；飞行中每帧缓动插值 | 就地悬停（不掉落），随后 8s 内再飘一次 |
| `fixed`（**默认**，v1.59 起） | **首访无位置记忆 → 右下角地面线 `floorY`**（与 `ground` 同一个休息位，v1.59 实测 (1228, 759.44)、离视口底 6px）；**切档**时只 clamp 回视口（就地停在当前高度）；记忆里存过同一档的 y 则恢复那个 y | 无 | `nextAt = Infinity` → 什么都不做 | **原地不动**（不悬停、不漂移、不落地） |
| `ground` | 地面 `floorY` | 有（P3 原逻辑） | 原有 `decide()`（走/招手/跳/困惑/发呆） | 受重力落地（P3 原行为） |

**实现要点（三个"为什么这么做"）**

1. **悬浮与位置的位移都在 `#pet` 的 `translate3d` 上，由 rAF 逐帧写**（`hoverStep()` / `advanceFlight()` → `applyTransform()`）。**没有用 CSS animation 做浮动**：CSS 动画的位移与 JS 写的 `transform` 是同一条属性，会互相覆盖 —— 一旦拖拽或"刷新后恢复位置"再写一次 `transform`，动画就会被顶掉或抖动。重心放在 `translate3d` 上还有个好处：拖拽、位置记忆、模式切换共用同一份 `(x, y)` 事实，没有第二份状态可以对不上。
2. **飞行 = 缓动 + 弧线 + 姿态**（R-PET-07 收紧了全部参数）：`easeInOutSine` 插值（比原来的 `easeInOutQuad` 更柔，起步/收尾几乎看不出"启动"与"刹车"），纵向再叠 `flyArc × sin(πt)` 的抬升（**12px**，改前 44px —— 位移只有 60~180px 时 44px 的拱高会盖过位移本身，看起来像"蹦"），姿态用 CSS 变量 `--pet-tilt`（最大 `flyTilt` **3°**，改前 7°）与 `--pet-fly-scale`（最大 `1 + flyZoom` = 1.04）写在 `.pet-sprite` 上，与 `--pet-dy`（素材底边补偿）、`--pet-face`（朝向）拼在同一个 `transform` 里。**飞行用图集 row4（`jumping`，"双臂张开、双脚离地"）循环播放**（`PET_FLIGHT_POSE`；九行里没有专门的"飞"行，逐行对照图见 `reports/pet-atlas-rows.png`），不套 `running-*` 的横向位移（那是贴地逻辑）。飞行期间 `.pet` 带 `data-pet-flying="1"`（验收脚本据此判"真的在飞"）。
3. **约束是逐帧守的，不是只挑目标点时守一次**：目标点先用 `rightLimit(y1)` 收窄，飞行每一帧再用 `clampX(x, y)` / `clampAirY(y)` 夹一次 —— 这样"飞行途中返回顶部按钮冒出来""窗口被缩小""中途被拖拽"都不会压上按钮或飞出视口。用户一 `pointerdown`（拖动或单击）就 `cancelFlight()` 立即中断本次飞行。
4. **模式与位置记忆的关系**：`savePos()` 写 `{x, y, mode}`（兼容读 P3 的纯数字旧格式）；`boot()` 时 `mode` **只取配置**，记忆里的 `mode` 仅用于判断"那份 `y` 还作不作数"（同一模式才复用 y，否则 `float/fixed` 回落到悬浮基准线、`ground` 回落到地面）。这样"改配置就能切换"不会被浏览器里的旧记忆挡住。
5. **验收用的调试钩子**（`window.__imissFlyNow()` / `__imissSetMode()` / `__imissPetDebug()`）调的是**和真实行为同一个函数**（`startFlight()` / `setMode()`），只多了"跳过睡着判断""允许运行期切档"两件事 —— 否则飞行间隔最小 20 秒，自动化验收只能干等或造假。`verify:ui` 的 R-PET-06 共 **15** 条断言覆盖三档各自的落点、飞行位移、固定不动、松手行为、三档不遮挡与 reduced-motion 静态悬浮（v1.59 起默认档那 3 条走"首访重载"，`float`/`ground` 那几条走**强制切档**）。
6. **自主飞行与"屏幕待机"的关系**：`waiting`（45 秒无操作）期间**不飞**（`decide()` 被 `pet.asleep` 挡住），任何交互立刻唤醒并恢复计时 —— 与 P3 贴地档的口径一致（待机就是要安静）。另外**自动飞行不写位置记忆**：`savePos()` 有 `pet.userMoved` 闸门，没被用户拖过就不落盘，免得访客刷新后被"上一次自己飞到的位置"接管。
7. ⚠️ **一次自查出来的偏差（已修）**：一次性动画（出场招呼 1.9s）收尾时原本会把 `nextAt` 重排成 1.2~4.2s，而这个 `nextAt` 在悬浮档正是"下一次飞行"的时刻 → 页面加载 **7 秒**就飞了，与配置写的 20~60 秒不符。现在只有贴地档在动画收尾时重排 `nextAt`；独立探针 `reports/_rpet06-autoflight-probe.mjs`（不碰调试钩子、纯等真实时间）复测：**页面加载后 31.7 秒自主起飞**、悬停 y 峰峰值 **12px**（= 配置 ±6px）。

**R-PET-07（发起人 2026-09-26 反馈两条，都已修）**

8. ⚠️ **右键菜单的锚点不能再假设"宠物贴地"**（发起人附图：「这框都在下面」）。改动前的 `openMenu(clientX, clientY)` 直接拿**鼠标坐标**当 `left/top`，只做了两条 clamp：左边不许溢出、`top` 不小于 10 —— **纵向完全没有下界**。P3 时代宠物只有"贴地"一种形态（`pet.y` 恒等于 `floorY`），鼠标点它必然落在视口底部附近，菜单往上一挂就没事；R-PET-06 引入三档、宠物可以停在**从视口顶到离地 48px 的任意高度**（v1.59 起默认档虽然换成了落地的 `fixed`，但 `float` / `ground` 仍是可用档位、拖动也能把它放到任何高度，所以这条前提**一点没松**），于是"点宠物下半身"这个最常见的动作就能让高约 200px 的菜单整块探出视口底。实测（`reports/_rpet07-menu-shots.mjs`，用真实几何套旧公式）：宠物在下部时旧公式给出 `top=815 → bottom=1018`，视口高 900 → **溢出 118px**（菜单高 203px 的 58%，正是发起人看到的"被裁掉一半"）。
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

**v1.59（发起人 2026-10-02：**默认档从 `float` 改成 `fixed`**）**

28. **默认档改了，三档一个都没删。** 发起人原话：「**这小人待机时会移动，别让它移动**」（截图指出的是待机时的漂移/飞行），追问后明确选「**完全静止（fixed 档）**」——这**推翻**了他 2026-09-26 那句"且默认是这样"。改动只有**一行**：`petConfig.movement.mode: "float" → "fixed"`。`float` / `ground` 的代码路径**一行未动**（`hoverStep()` / `startFlight()` / 重力积分 / `syncMenuMode()` 全在），运行期仍可用 `__imissSetMode("float" | "ground")` 切 —— 验收脚本正是靠它保住这两档的覆盖（见第 30 条）。
29. **`fixed` 的首访落点单独给了右下角地面线**（`boot()` 里新加一条分支）。改前它跟 `float` 共用 `floatBaseY()`（`vh × 0.52 − h/2`），落点就在**视口纵向正中**：实测（`reports/_pet-fixed-landing-probe.mjs`，1440×900、全新 profile 无 `localStorage`）宠物停在 **(1228, 401)**，压住右栏组件（「还没有发布动态」那段 5385px² + 两个 `.category-pill` 共 3712px²）——一个"完全静止"的角色停在屏幕正中，与这一档自己要表达的"安静待在角落"（配置注释原话）正好相反。现在 `fixed` 与 `ground` **共用同一个落点 `floorY`**（站在地面线上），实测落点 **(1228, 759.44)**、离视口底 **6px**、与右下角浮动按钮最近 **24px**（零重叠）、**文章正文阅读列（`.prose` / `#post-container`）重叠 0px²**。⚠️ 该位置与 `ground` 档**逐像素相同**（同一探针 force `ground` 量到 `matrix(1,0,0,1,1228,759.44)`，一模一样），也就是说这不是新引入的落点，而是把 P3 贴地档一直在用的休息位还给了"静止"档；它对**右栏**（首页的「更多动态」链接 / 文章页的目录条目）仍有部分覆盖（实测 4039 / 14638 px²），这是**结构性**的：宠物 x 被 `FLOAT_RESERVE`+`safeRight` 限制在 1228~1352，而右栏横跨 1102~1382，往右让开就会压上浮动按钮列（R-PET-05），所以任何落点都必然与右栏相交 —— 如实登记，不假装解决。
30. ⚠️ **改默认值 = 改所有"裸奔"用例的前提，这是本轮真实踩到的级联。** 断言里凡是**不显式切档**的步骤，测的都是当时那个默认档：
    - `R-PET-02` 的「键盘 ← → 左走」是在默认档下按的，而 `walkTo()` 在 fixed 档**直接 return**（组件里 R-PET-08 起就这么写）→ 改默认档后这条当场判红。修法不是删断言，而是**拆成两条**：默认档按 ← 断言"坐标与 `transform` 都没变"（默认档的真实行为），再 `__imissSetMode("float")` 按第二次，把「running-left」的覆盖面**原样留住**。
    - `R-PET-06` 原来 ① 就是"默认档 = float"，② 也用 `pet-boot`（默认档）量"悬空" —— 全部改成：默认档 fixed 三条（档位标记 / 1.6s 完全静止 / 右下角首访落点与不遮挡），`float`、`ground` 的行为一律**强制切档后**再测。
    - 连带两处：`⑨b` 结尾"切回出厂档位"由 `float` 改成 `fixed`；`reduced-motion` 那段**重载后要显式切 float** 才能验"float 退化成静态悬浮"（不切就是"在 fixed 上断言 float 的行为"，是一条**恒真**的假绿）。
    - 同时补了一条先前**没有**的采样：重载后、强制切档**之前**先采一次 `pet-reduced-default` —— 位置记忆里存的是 `ground`、配置是 `fixed`，这一采样才是"**模式以配置为准**、记忆盖不过配置"那条断言的证据（改默认档之前它由 `reduced1` 顺带承担，强制切档会把它抹掉）。
31. ⚠️ **已知单向门（故意不修，发起人明确否决了"菜单里加一项"）**：右键菜单只有「落下去」/「飘起来」两项，在"悬浮·固定"与"贴地"之间切，**没有回到 `fixed` 的入口** —— 访客从 UI 一旦切走（落下去 → 再飘起来落到 `float`）就**回不到 fixed**，只能改配置重建。为什么让它这样：悬浮与固定**共用同一个「落下去」**（`syncMenuMode()` 只按 `pet.mode === "ground"` 二分），加第三档就得动菜单的信息结构，而发起人对"再给个入口"的方案给了明确的否。这条已写进 `PRD` R-PET-06 与 `petConfig.ts` 的注释，**不要再"顺手补一个菜单项"**。
32. `verify:ui` 的 R-PET-06 由 **13 条 → 15 条**（默认档 3 条，含 2 条新增；`float` 4 条、`fixed` 2 条、`ground` 1 条全部改成强制切档后测；三档不遮挡 3 条 + reduced-motion 1 条 + 位置记忆 1 条照旧），`R-PET-02` **+1 条**（默认档按 ← 不位移）。全量计数见 §11。

**v1.67（发起人 2026-10-08：手机端显示 + 右键菜单改版）**

33. **手机端显示，但不是"原样搬过去"：两档缩放（R-PET-12）。** 发起人在手机上打开站点后问「**手机端我咋没看到桌宠**」，给了三个方案（A 显示但缩小降存在感 / B 只在桌面 / C 显示但默认收起），他选 **A**。改动两处：`petConfig.hideOnMobile: true → false`（"解析期要不要启动脚本"的机制保留、只是默认不再触发），以及新增 `petConfig.mobileScale: 0.62`（精灵约 89×97px；桌面档 `scale: 0.86` 约 124×134px）。
    - ⚠️ **这一轮修掉的是一个"写了但从来没生效"的样式**：`pet.css` 里那段 `@media (max-width: 767px) { .pet { --pet-scale: 0.62 } }` 从 P3 起就在，但组件把 `--pet-scale` 写成**内联变量**（`style="--pet-scale:0.86"`），而**内联变量赢过任何选择器（含媒体查询）** → 手机拿到的一直是桌面缩放。**登记为陷阱 T90**（它的表现是"静默不生效"，不报错、`getComputedStyle` 读到的也是内联那个值）。
    - 修法：**拆成三层变量，各管一件事** —— 组件只内联三个**值**（`--pet-scale-desktop` / `--pet-scale-mobile` / `pet-mini-factor`）；`pet.css` 负责**选档**（`--pet-scale-active`，媒体查询命中时换成手机档）与**叠 mini 系数**（`--pet-mini`），最终 `--pet-scale: calc(var(--pet-scale-active) * var(--pet-mini))` —— 下面所有 `calc()` 一个字没改。
    - 断点是**成对约束**：CSS 里的 `767` 必须等于 `petConfig.mobileBreakpoint − 1`，`verify:ui` 有一条断言直接读"组件源码 + pet.css + petConfig.ts"三个文件核对（改一处不改另一处会红）。这条为什么必须有：内联压住媒体查询这种事**在 DOM 里看不出来**（DOM 只会告诉你"现在是多少像素"）。
34. **右键菜单改版：删「说句话」、聊天提第一、末项「关闭」（R-PET-13）。** 发起人原话：「**把说句话交互删掉，然后把和爱弥斯聊天放在第一个，然后最后一个变成关闭，但关闭不是完全关闭，会变成很小一只，比待机还小，双击后仍能变回爱弥斯**」。菜单最终形态 = `和爱弥斯聊天` / `落下去`·`飘起来`（二选一，R-PET-08 口径逐字未变） / `关闭`。删掉的只是**入口**：`say()` 本体仍在四处被调用（左键单击、键盘 Enter、切档应答、出场问候）—— 与 R-PET-08 删「跟过来/睡一会儿」、R-PET-09 删「跳一下」是同一种处理：**去掉菜单项 ≠ 删掉能力**。
35. **「关闭」= 缩放档，不是 `enable: false`。** `petConfig.miniFactor: 0.5` → 桌面约 62×67px、手机约 45×48px。**"比待机还小"是这么成立的**：待机 `waiting` 用的是所在档位缩放（没有单独的"待机缩放"），所以 0.5 档必然比任何正常状态小。落地要点：
    - 缩放走 CSS（`.pet[data-pet-mini="1"] { --pet-mini: var(--pet-mini-factor) }`），JS 只翻属性；尺寸不写死 —— `measure()` 读的是真实 `offsetWidth`，所以断言量到的也是真实像素（124 → 62px）；
    - **脚底锚点要重算**：缩放会改 `w/h`，而 `fixed` 档的 `y` 是左上角，直接缩一半等于"人原地往上蹿半个身位"。`setMini()` 先记住底边、量完再把底边放回去（贴地档由 `measure()` 直接落到新的 `floorY`，天然等价）；实测底边 894 → 894px（Δ=0）；
    - **迷你期间闭嘴 + 不走动**：`say()` 直接返回（同时收起已经挂着的气泡）、`decide()` 把 `nextAt` 顶到无穷大（它是**唯一的调度咽喉** —— 换主题那类会把 `nextAt` 改回有限值的路径也会在这里被重新按住）、45 秒巡检跳过她（她已经很小了，再切成电子幽灵待机图反而更显眼）、Swup 切页不挥手；
    - **双击恢复**：`onPointerUp` 的双击分支先看 `pet.mini`，走的就是同一个 `setMini(false)`（挥爪 + 「……我回来了。」+ 星屑）；
    - 菜单末项是**开合项**：文案与 `aria-pressed` 跟着状态走（正常「关闭」/ 迷你「叫醒她」）。为什么让文案变 —— 双击能恢复这件事**没有任何视觉提示**，只留一个"关闭"会让人以为她真的没了；换文案等于把回程路写在菜单上。
36. **素材复核（发起人问「你看看有不有可用的模型照片」的答复，落成事实）：可用的就是这一张 `pet-aemeath.webp`（MIT，8 列 × 9 行 / 单格 144×156），九行全部已用上** —— row0 `idle`（待机呼吸，**「关闭」档用的就是它**）、row1 走右（+ `scaleX(-1)` 复用为走左）、row2 与 row1 逐像素相同（源仓库标了 `mirrored: true` 但出货图没镜像，**跳过**）、row3 挥手、row4 跳（飞行也借它循环）、row5 困惑、row6 待机画面、row7 墨镜（聊天中）、row8 完成反馈。**没有额外素材可以拿来做"更小的一只"**，所以"很小一只"与"待机"共用同一行动画，只靠缩放区分。
37. `verify:ui` 计数 **308 → 317**（R-PET-12 三条 + R-PET-13 五条 + R-PET-01 一条）。本轮还要记住**"改一个默认值会连带改掉别人用例的前提"**这件事（第三次踩到，前两次是 v1.59 改默认档、v1.66 删封面模块）：
    - `R-PET-01` 那条「移动端 390 不显示桌宠」**就地翻成**「移动端 390 能看到桌宠」，并另加一条"隐藏开关仍接在解析期脚本上"（否则那条机制就再没有断言覆盖了）；
    - `R-PET-03` 的 reduced-motion 那条点的是 `[data-pet-act="say"]`（该项已删）——`querySelector` 返回 null → evaluate 抛 `TypeError` → **静默表现成"气泡是空的"**，看起来像功能坏了。改走左键单击宠物；
    - `R-PET-08` 的两条**几何用例前提失效**（宠物在窄视口只有 89px 了 → 菜单/面板真的放得下了）：「390 正中两侧都放不下」的余量从 38px 掉到 4px（实测左余 137 > 菜单宽 132，贴左边是对的）→ 换到 **360×800**；「620×700 窄屏兜底」的两侧余量从 229px 涨到 247px（≥ `minWidth` 236）→ 换到 **520×700**。

**v1.68（发起人 2026-10-08：聊天框「点外面就关」）**

38. **手机上"关不掉聊天框"是真问题，不是手感问题（R-PET-14）。** 发起人附图（聊天框铺了大半屏）并给出方案：「**点按非对话框或非角色之外任意处，对话框就关闭**」。查了一遍关框入口：只有 Esc（手机没键盘）、Swup 切页、以及组件内部的调用 —— 面板里那两个按钮是「↓ 最新」与「清空对话」，**没有关闭按钮**，所以在手机上打开之后确实出不去。落地三件事：
    - **文档级 click（capture 阶段）里加一条"轻关闭"**：`chatOpen && !bubble.contains(t) && !hit.contains(t)` → `closeChat()`。两个例外都是发起人的口径（面板自己 / 角色本人）。
    - ⚠️ **例外不能写成 `el.contains(t)`**：`#pet` 是包住气泡的祖先节点，面板也在它里面 → 那样写等于"永远不关"（判据恒真）。要用 `hit`（`.pet-body`，真正的角色本體）。
    - ⚠️ **capture 阶段是故意的**：它让这条判断跑在"菜单项自己的 click 处理器"之前。从菜单点「和爱弥斯聊天」时 `chatOpen` 还是 `false` → 这一条空过 → 紧接着菜单处理器才 `openChat()`，所以"开框那一下"不会被自己关掉；改成冒泡阶段就会变成"刚开就关"。
39. **连带修掉一个真缺陷：点角色本體会把聊天面板的 DOM 冲掉。** 点她的路径是 `jump(); say();`，而 `say()` 的实现是 `bubble.textContent = msg` —— 面板（`.pet-chat-head` / `.pet-chat-log` / `.pet-chat` 表单）全都长在 `#pet-bubble` **里面**。所以"聊天框开着时点她一下"会把面板 DOM 整块换成一句台词：输入框的引用还在（它只是脱离了文档），但历史区再也长不出来、清空按钮也不工作 —— 而这一轮发起人要的恰恰是"点角色**不**关框"，这条路径必须能用。修法：`say()` 加 `chatOpen` 闸门（迷你档那条 `pet.mini` 闸门之后再加一条）；聊天里的每一句都走 `addLine()`、不经过 `say()`，所以**没有任何正常路径被挡住**（切档那两句 `say("好，我落下去。")` 在点菜单时已经先关框了，照常能说）。
40. `verify:ui` 计数 **317 → 320**（R-PET-14 三条：点空地关框 / 点面板里面不关 / 点角色不关且面板 DOM 完好）。三条都走**真实鼠标事件**，且第一条先自证"那个点真的是空地"（不在面板与宠物里、也不是链接或按钮）—— 否则"点了个链接导致 Swup 切页、顺手把框关了"会让它假绿（切页本来就会关框）。

**v1.69（发起人 2026-10-08：末项改叫「缩小」；明确不加「×」）**

41. **「关闭」这个名字从一开始就不准，改字面不动行为（R-PET-13）。** 发起人看着菜单截图说：「**关闭变成缩小，其他不变，就改个前端文字**」—— 那一项做的本来就是"缩小"（她没被关掉，也没被藏起来，双击就回来），叫「关闭」名不副实。改动只有两处字面：模板里那个按钮的初始文本、以及 `syncMenuMode()` 写回的那句（迷你状态仍是「叫醒她」，未动）；断言里跟着改的是几个 `same(…, [...])` 的字符串与几条标题文案，**条数一条没变（320）**。为它写进文档的理由：这是"名字 vs 行为"的一次对齐，下一个人看到 `miniFactor` 时不该再被「关闭」误导。
42. **⚠️「×」关闭按钮：明确不做（记进代码注释，防"顺手补一个"）。** 我在 v1.68 的汇报里问过一次，发起人先答"这个可以有"，随后改口：「**不加叉键，那个功能不要了**」。所以他否掉的是**这个按钮**，不是"能关框"这件事 —— 关框出口保持三条：**点面板与角色之外的任意处**（R-PET-14，手机上唯一顺手的）、Esc、Swup 切页。`buildChatPanel()` 里 `head.append(title, chatJump, clear)` 那行上面留了一段注释写明原委，避免以后有人把它当成"漏了一个 ×"。

---

## 8. Agent 子系统（R-AGT）

### 8.1 为什么是这个形状

浏览器不能跑 Python，所以"桌宠用 Python SDK 调 Agent"必须拆成两段：

- **前端 → 网关**：普通 HTTP + SSE（浏览器唯一能做的）。
- **网关 → Agent**：一段**原样透传**。⚠️ **v1.45（P5-5）改写了这一段的落地形态**：设计稿是"网关用 `langgraph_sdk` 调 Agent"（Python FastAPI，:8000），但那种网关必须建在 `agent_-for_-blog` 里，与 R-AGT-06「**完全新建，不改 agent_-for_-blog 的任何代码**」直接冲突。实际做法是**本仓库的零依赖 Node 反代**（`server/pet-gateway.mjs`，:8787）：它不翻译协议、不引 `langgraph_sdk`，只把 §8.9 的 5 个端点按白名单透传给 `langgraph dev`，把"安全与限额"（R-AGT-05）全部做在这一层。`langsmith` 追踪仍然由**后端进程自己**上报（§8.9.4 / §8.9.7 #11），与网关无关。

参考实现 `agent_-for_-blog`（**只读**）给出的既定做法，本项目沿用同样的骨架与约定：LangGraph 图 + 单一 LLM 实例 + `persona.txt` 人设文件 + `Store` 长期记忆 + `interrupt()` 人在环 + DeepSeek（`ChatOpenAI` 兼容接口）。

### 8.2 目录结构

> ⛔ **下面这棵树是 P5 之前的设计稿，只有后半部分（网关）被证明是错的。**
> 实际情况：`agent/` 目录**在本仓库里只放人设文本与档案**（`agent/persona-aemeath-v7.txt` / `agent/persona-notes.md` / `agent/archive/`），
> **没有** `langgraph.json` / `pyproject.toml` / `src/agent/**` / `src/gateway/**` —— 那些代码全在另一个仓库 `agent_-for_-blog`（只读，见 R-AGT-06 与 §8.1）。
> **v1.45（P5-5）落地的网关是 `server/pet-gateway.mjs`**（零依赖 Node ESM，本仓库），不是这里画的 FastAPI 网关。

```
agent/                              # ⚠️ 设计稿（本仓库实际只有人设文本，见上）
├─ langgraph.json                 # 注册 blog_agent（后续可加 recommend/collect）
├─ pyproject.toml                 # langgraph / langchain-openai / fastapi / langsmith / uvicorn
├─ .env.example                   # 只放占位（.env 不入库）
├─ README.md                      # 起服务的两条命令
├─ data/
│  ├─ blog-index.json             # 构建期导出：文章索引（标题/标签/摘要/URL）
│  └─ rank.json                   # 构建期导出：排行数据（⚠️ 设计稿，从未落地；rankConfig 已随 v1.41 删除，见 §10 与报告 R32）
├─ src/agent/
│  ├─ graph.py                    # 主图：路由 + 子节点
│  ├─ node/{main,search,rank,chat}.py
│  ├─ state/main.py
│  └─ common/{llm,persona,store,index}.py
│  └─ common/persona.txt          # 爱弥斯人设（改文案不用动代码）
└─ src/gateway/                   # ⛔ 已推翻（v1.45 / P5-5）：见 §8.4/§8.5/§8.7，实际落点是 server/pet-gateway.mjs
   ├─ main.py                     # FastAPI：/api/pet/chat、/api/pet/health、/api/pet/reset
   ├─ client.py                   # 传输层：server（langgraph_sdk）/ inproc 两种模式
   └─ limits.py                   # 限流、长度校验、CORS
```

**实际落点（v1.45 / P5-5）**

```
server/pet-gateway.mjs             # 零依赖 Node 反代：白名单 / 来源 / 限流 / 长度 / 体积 / 单轮上限 / SSE 直通
scripts/verify-gateway.mjs         # 51 项断言（自带 stub 上游 + 真后端一段）→ pnpm verify:gateway
deploy/nginx.conf                  # /api/agent/ → 127.0.0.1:8787（只有 Agent 那一段；v1.54 起含 gzip off）
deploy/nginx-site.conf             # 【v1.54】完整 server{}：静态段 + 真 404 + 缓存/压缩/安全头 + include 上面那段
deploy/langgraph.service           # 【v1.54】后端（另一仓库的服务）systemd unit 模板
deploy/publish.mjs                 # 【v1.55】发布脚本（Node ESM / 零依赖：构建 → 打包 → 上传 → 原子替换 → 计数校验 → 回滚备份）
deploy/README.md                   # 起法 / 环境变量 / 构建期 PUBLIC_AGENT_BASE_URL / 上线操作单
deploy/pet-gateway.service         # 可选：systemd 常驻单元
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

### 8.4 网关接口契约（前端唯一依赖）—— **P5-5 已实现：同源反代**

> **本节 v1.45（P5-5）重写。** 原稿写的是"对外只有一个 `POST /api/pet/chat` + `/api/pet/health` + `/api/pet/reset`"的**自定义协议**，
> 那要求一个**协议翻译层**（前端 `{message}` → LangGraph `input.messages`，再把上游 SSE 翻成 `token`/`state`/`meta`），
> 而翻译层只能写在 `agent_-for_-blog` 里 —— 与 R-AGT-06「**不改 agent 仓库**」冲突。**该设计已废弃，别按它实现。**
> 现在的口径：**网关 = 同源反代 + 四道闸门，不翻译协议**；前端依赖的端点就是 §8.9 那 5 个，只多一个 `/ok` 探测。

**挂载点与端点（`server/pet-gateway.mjs`）**

| 对外路径（同源） | 上游（`PET_GATEWAY_UPSTREAM`，默认 `http://127.0.0.1:2024`） | 说明 |
| --- | --- | --- |
| `GET  /api/agent/ok` | `GET /ok` | 可用性探测（§8.9.1 #0） |
| `POST /api/agent/assistants/search` | `POST /assistants/search` | 现查 `assistant_id`（**不许硬编码**） |
| `POST /api/agent/threads` | `POST /threads` | 建线程 |
| `POST /api/agent/threads/<id>/runs/stream` | 同左 | **SSE 流式那一轮**（不缓冲，`x-accel-buffering: no`） |
| `GET  /api/agent/threads/<id>/state` | 同左 | `interrupt` 兜底 / 失效判定 |
| `GET  /__gw/health` | ——（本进程自己答） | 非密诊断：生效的限额、来源白名单、前缀、路由白名单 |

`/api/agent` 前缀可配（`PET_GATEWAY_PREFIX`，默认就是它），**剥掉前缀之后再按白名单匹配**；bare `/ok`、`/threads/...` 也认（本地开发便利）。
**不在白名单上的路径一律 404**（`/docs`、`/assistants/{id}`、`/threads/{id}` 这些上游自带面**访客不可达**）；路径在、方法不对 → **405**。

**前端怎么切过来**：构建时给 `PUBLIC_AGENT_BASE_URL=/api/agent`（§8.10 的表）。**前端只依赖 `baseUrl` 一个值**，代码一个字节都不用改。

**传输与失败面的硬保证**（每一条都有 `pnpm verify:gateway` 的断言）

| 保证 | 实现要点 |
| --- | --- |
| 只暴露白名单 | 路由正则白名单（含 `<id>` 收紧成 `[A-Za-z0-9_-]{1,128}`）；路径先解码再判，`%2f`/`%5c`/`%00`/`..`/`\` 一律拒 |
| 来源可信 | `Origin` 不在白名单 → **403**（无 `Origin` 时按 `Referer` 的来源判；两者都没有 = curl / 同源非 CORS → 放行）；预检 204 只回**具体来源**，永不 `*`；客户端的 `Origin`/`Referer`/`Cookie` **不转发上游** |
| SSE 不被攒 | `content-type: text/event-stream; charset=utf-8` + `cache-control: no-cache, no-transform` + `connection: keep-alive` + `x-accel-buffering: no` + `flushHeaders()` + **逐 chunk 写**；上游状态码原样透传；两端都 `setNoDelay(true)` |
| 超时可控 | 单轮硬上限 `PET_GATEWAY_ROUND_TIMEOUT_MS`（默认 300 000 ms，= 前端硬上限 = §12.2 的 `proxy_read_timeout`）：流已开始 → 干净收尾；未开始 → **504** |
| 失败不泄漏 | 上游不可达 / DNS 失败 / 连接被拒 → **502 `{error:"upstream_unreachable"}`**，**不回显上游错误文本与栈**（只在自己日志里留一个错误码） |

### 8.5 安全与限额（R-AGT-05）—— **现状 vs 已实现（P5-5）**

> **本节 v1.45（P5-5）重写。** 原表是"网关侧的目标口径 / 实现位置（规划）"两栏，落点写的是 Python 的 `limits.py` + `PET_ALLOWED_ORIGINS`；
> 现在这些限额**已经真的落在一个文件里了**：`server/pet-gateway.mjs`（零依赖 Node），并由 `pnpm verify:gateway` 逐条钉住。
> ⚠️ **但"已实现并本机验过" ≠ "生产已生效"**：生产要生效还差两件事 —— ① 域名到位后把线上域名填进 `PET_ALLOWED_ORIGINS`（**B-01** 依赖）；
> ② 在 Nginx 后面显式打开 `PET_GATEWAY_TRUST_PROXY=1`。**在 ①没做之前，生产环境带 `Origin` 的写请求会被 403**（默认白名单只有两个 localhost）。

| 项 | 取值（已生效的默认值） | 落点 | 状态 |
| --- | --- | --- | --- |
| CORS / 来源白名单 | 线上域名 + `http://localhost:4321` + `http://localhost:4323`；不在名单 → **403**；无 `Origin` 按 `Referer` 判；预检 204 只回具体来源 | `server/pet-gateway.mjs`（`PET_ALLOWED_ORIGINS`） | ✅ **已实现**（默认值里的 localhost 两项已在 `verify:gateway` 里断言）｜⛔ **线上域名那一项还没填**（等 B-01） |
| 限流 | **20 次/分钟/IP**，内存令牌桶，键 = IP；超了 **429 + `Retry-After`** | 同上（`PET_GATEWAY_RATE_LIMIT`） | ✅ **已实现**（边界实测：3 次配额下第 4 次 429） |
| 消息长度 | **≤ 1000 码点**（按码点数，emoji/CJK 各算一个），超了 **400 `message_too_long`**、**不截断** | 同上（`PET_GATEWAY_MAX_CHARS`） | ✅ **已实现**（两侧边界都测：1000 放行 / 1001 拒绝，`actual` 报码点数） |
| 请求体上限 | **≤ 8192 字节**，边读边判，超了 **413** | 同上（`PET_GATEWAY_MAX_BODY`；Nginx 侧另有 `client_max_body_size 8k`） | ✅ **已实现** |
| 单轮时长上限 | **300 000 ms**；流已开始干净收尾 / 未开始 504 | 同上（`PET_GATEWAY_ROUND_TIMEOUT_MS`） | ✅ **已实现**（两种情况都实测） |
| 日志 | 一行一请求：时间 / 方法 / 路径 / 状态 / 耗时 / IP（流式那行带 thread id）；**不含正文、消息、答复、上游响应体、header 值** | 同上（`logRequest()`） | ✅ **已实现**（双向断言：金丝雀与假密钥**不在**日志、thread id **在**日志） |
| 客户端 IP | 默认只认 socket 对端地址；`X-Forwarded-For` 需 **`PET_GATEWAY_TRUST_PROXY=1`** | 同上（`clientIp()`） | ✅ **已实现**｜⛔ **生产必须在 Nginx 后面才开**（没有反代而开 = 访客伪造 XFF 就换一个新桶，限流形同虚设） |
| 输出上限 | `max_tokens` ≤ 800 | LLM 调用参数（**后端图侧**） | ⛔ **仍未落**（不在契约里锁；属另一个仓库） |
| 线程数上限 | 同 IP 同时活跃线程 ≤ 3 | —— | ⛔ **仍未实现**（当前只限"请求速率"，不限"线程数"；前端一个会话只建一个线程，风险低） |
| 鉴权 | **已选：接受现状（方案 A，2026-09-29 拍板）** | —— | ✅ **已落定**：网关不持令牌，拿到 `assistant_id` 即可调用（`/assistants/{id}` 那条路已被 404 堵死，但 `assistants/search` 仍在白名单上）—— 发起人在"加口令 / 只做 Nginx 规则 / 接受现状"里**选接受现状**（同源 + 20 次/分/IP + 长度上限兜底，剩余风险知情接受），**B-14 关闭**。见 §8.9.7 #3 |
| 密钥 | 只在 `.env`（不入库）；前端零密钥 | 后端 `.env.example` 只放占位 | ✅ 前端确实零密钥；后端 `.env` 已存在且不入库；`/__gw/health` 与日志**都不回显 `PET_*` 原文** |

> 为什么"前端 `maxlength=500`"与"网关 1000"不一样大且**不该一样大**：前端那个是**体验参数**（`petConfig.agent.maxLength`，本表口径"不是安全边界"），
> 网关这个是**安全边界**。安全边界比体验参数**松**是正确方向 —— 反过来的话，前端一次误改就把真正的闸门改没了。
> 真正的边界 **1000** 由网关守，且**按码点**数（`[...str].length`），所以 `"🙂".repeat(1001)` 会被拒（它的 UTF-16 长度是 2002、字节 4004 —— 拿后两者当判据都会算错）。

### 8.6 前端适配层（`src/utils/agent-client.ts`）

> **v1.45 更正**：本节原来写的文件名是 `src/utils/pet-agent-client.ts` —— **那个文件从来没存在过**（P5-1 落地时用的就是 `agent-client.ts`）。
> 接口草图也早就不是那样了：**没有** `petChat` / `petHealth` / `petReset`，也**没有** `onState` / `onToken` / `onMeta`（那是 §8.4 里已被废弃的
> `POST /api/pet/chat` 那套自定义协议的配套设计）。下面这份是**照着真实源码改写的**，口径以源码与 §8.10 为准。

对外只暴露「一轮问答」与几个探针，组件不直接写 `fetch`、不自己解析 SSE：

```ts
// 组件唯一需要调的函数（永不抛异常：失败一律降级成 mock 台词）
export async function askAemeath(message: string, opts?: {
  signal?: AbortSignal;                          // 关聊天框 / 切页时取消
  events?: { onReply?: (text: string) => void }; // 答复文本更新（实现里做了去重）
  lastReply?: string;                            // 上一轮气泡里那句（判"是不是在回答 interrupt"）
}): Promise<AgentTurn>;

export type AgentTurnStatus = "answer" | "interrupt" | "fallback" | "disabled";
export interface AgentTurn {
  text: string;             // 进气泡的文本
  status: AgentTurnStatus;  // 组件按它做状态联动（§8.10 / R-AGT-04）
  fromMock: boolean;        // 走了 mock（降级 / 开关关掉）
  reason?: string;          // **只给日志与断言看**，绝不许进气泡
  interrupt?: { ask: string; reply: string; via: "values" | "updates" | "state" };
  elapsedMs: number;
}

// 探针与排障（`probe` 是降级判定的唯一入口；`resetSession` / `sessionSnapshot` 给测试用）
export async function probe(baseUrl: string, timeoutMs?: number): Promise<boolean>;
export function resetSession(): void;
export function sessionSnapshot(): { hasThread: boolean; hasAssistant: boolean; confirmedBase: string; threadAttemptAgeMs: number };
```

- `baseUrl` 来自 `agentConfig.baseUrl`（构建期 `PUBLIC_AGENT_BASE_URL` 覆盖，默认 `http://127.0.0.1:2024`）；适配层自己 `replace(/\/+$/,"")` 去掉尾斜杠。
- `enable === false`、`probe()` 失败、SSE 解析失败、答复命中禁词表、`values` 里取不到答复 → 走 `fallbackReply()`（本地人设台词，**起头明说"我这边接不上话"**），**不抛异常、不弹技术报错**（R-AGT-03）。
- 用 `AbortController` 支持关闭气泡时中断；三档时间闸门（连接/首字节、60 秒无新 chunk、300 秒硬上限）见 §8.10。
- SSE 解析是 `fetch` + `ReadableStream` 手写（约 30 行，不引第三方库）；**导出 `SSEParser` / `normalizeNewlines` 是为了让 `verify-agent-robust.mjs` 能直接喂畸形字节**（D-17/D-18 那两个反例）。

### 8.7 启动与运维

> **v1.45（P5-5）重写。** 原稿写的是 `uvicorn src.gateway.main:app --host 127.0.0.1 --port 8000` —— **那个网关不存在**（见 §8.1/§8.2）。
> 现在要起的是**本仓库的 Node 网关**，端口 **8787**。

```powershell
# ① Agent 图（LangGraph Server，端口 2024）—— 属另一个仓库，只读
cd ..\agent_-for_-blog
.venv\Scripts\langgraph.exe dev --port 2024 --no-browser   # 开发：带 Studio UI；生产用 langgraph up

# ② 网关（端口 8787，零依赖，不需要 npm install）
node server/pet-gateway.mjs                # 前台；Ctrl+C 停
node server/pet-gateway.mjs --help         # 看全部环境变量与路由白名单
systemctl start pet-gateway                # Linux 常驻（deploy/pet-gateway.service）

# ③ 自检（起完网关就能跑；真后端那一段连不上会 SKIP，不影响退出码）
pnpm verify:gateway
```

| 环境注意 | 说明 |
| --- | --- |
| 启动顺序 | 先 LangGraph Server（2024），再网关（8787）。**反过来也能起** —— 网关不探活上游，上游不可达时按请求回 502（`upstream_unreachable`），恢复后自动可用 |
| 就绪判据 | 网关启动会打一行 `[gw] … listening on http://127.0.0.1:8787 prefix=/api/agent upstream=127.0.0.1:2024 limits=…`；`GET /__gw/health` 回生效配置（**非密**，可给监控用）。⚠️ 别拿 `GET /api/agent/ok` 当"网关起来了"的判据 —— 那个是**上游**的探针 |
| 生产必做的两项 | ① `PET_ALLOWED_ORIGINS` 加上线上域名（不加 → 浏览器带 `Origin` 的写请求一律 403）；② 只在 Nginx 后面开 `PET_GATEWAY_TRUST_PROXY=1`（开了才认 `X-Forwarded-For`；没有反代而开 = 可伪造） |
| 中间层 | Nginx 那段见 `deploy/nginx.conf`（只有 Agent 那一段，静态站点部分见 §12.2）；`client_max_body_size 8k` 与网关的 8192 对齐 |
| 配置改了要重启 | 网关**启动时读一次** `PET_*`（`readConfig()`），运行期不变 —— 与 `langgraph dev` 的 `.env` / 人设同一个毛病（§8.9.4）：**改完没重启 = 行为还是旧的** |
| 日志 | 一行一请求打到 stdout（`journalctl -u pet-gateway -f`）。**授权范围只有** 时间/方法/路径/状态/耗时/IP/thread id/本地 note 码；排障时**不要**临时加"把 body 打出来"（那会把访客提问写进日志，`verify:gateway` 的「日志不泄漏」会红，见 §14.3 T82） |
| Windows | 零 bash 依赖、不 shell out；`node server/pet-gateway.mjs` 直接起。要后台跑就用 `Start-Process`/计划任务，或 `nssm`（Linux 用 systemd） |

### 8.8 构建期数据导出（前端与 Agent 的契约）

`scripts/export-agent-data.mjs`（新增，挂在 `pnpm build` 之前或独立执行）：

| 输入 | 输出 | 字段 |
| --- | --- | --- |
| `src/content/posts/**/*.md` | `agent/data/blog-index.json` | `slug`/`title`/`description`/`tags`/`category`/`published`/`url`/`excerpt`（正文前 600 字纯文本） |
| `src/config/rankConfig.ts` | `agent/data/rank.json` | 5 份榜单（日漫/国漫各 2 组维度 + 二游单一榜；标题、原名、短评、名次）。⚠️ **这一行是 P5 之前的设计稿、从未落地**：`rankConfig` 已随排行模块在 v1.41 删除、`agent/data/` 目录也不存在；后端侧仍留 `ask_rank` 意图 —— 属另一个仓库，见 §10 与报告 **R32** |

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
| 0 | `GET /ok` | 可用性探测（**"服务在不在"的唯一入口**；⚠️ 它**不是**"降级与否"的唯一判据 —— 契约层面的降级条件共 7 条、见本节末尾与 §8.9.6，测试侧怎么识别这些降级见 §11 的 R-AGT 段） | `200 {"ok":true}` |
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
> **P5-4 补记（v1.44，实测）**：**`.env` 也是启动时读的**，包括 `LANGSMITH_TRACING` / `LANGSMITH_API_KEY` / `LANGSMITH_PROJECT` —— 换句话说，**"改完 .env 没重启"与"改完人设没重启"是同一种病**，症状都是"配置看起来对、行为却是旧的"。本机取证时实测：进程起于 `2026-09-27 16:14:35`、`.env` 改于 `2026-09-25 18:29:26` → 进程晚于 `.env`，所以追踪确实生效（根 run 的 `extra.metadata` 里能读到 `LANGSMITH_TRACING: "true"` 与 `LANGSMITH_PROJECT`，这是**判断"跑着的进程到底有没有开追踪"的唯一可靠办法** —— 看 `.env` 不算，`.env` 只说明"下次启动会开"）。⚠️ 由此带出**未决项 #11**：人设一旦进了 trace，就等于**整份人设被复制到第三方**。

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

> ⚠️ **测试侧怎么"认出"一轮是降级**（v1.41 / R27 + **R39** 收口，判据在 `scripts/verify-ui.mjs`，**不是**前端代码）：
> ① **客户端降级** —— `data-pet-chat-source ≠ "live"`，或答复以客户端 `FALLBACK_LEADS` 的某条起头；
> ② **后端降级哨兵** —— 答复命中测试侧常量 `BACKEND_DEGRADE_MARKERS`（后端自己连不上文章库时说的是**后端仓库里**的 `DB_UNAVAILABLE_REPLY` 一类话术，此时 `source` **仍然是 `live`**，只看 ① 认不出来）。
> **边界**：哨兵**只用来"排除/不判"那一轮**，绝不用来"洗白"——真人设回归（自称 AI、越底线、答非所问）不会命中 DB 故障话术。
> **同步义务**：后端改了降级文案，就要往 `BACKEND_DEGRADE_MARKERS` 里补关键词，否则那种轮次会重新变成假红（验证侧只认这三类信号，不认"我以为的降级"）。

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
| 1 | ~~**CORS 是 `*`，不是白名单**~~ **✅ 已决定并实现（v1.45 / P5-5）** | 上游 `langgraph dev` 裸跑时确实是 `access-control-allow-origin: *`（任何网站都能在访客浏览器里直连它）。**已不再依赖上游收紧 CORS**：上线走**同源**（`PUBLIC_AGENT_BASE_URL=/api/agent`），浏览器根本不发预检；上游那个 `*` 只在"直连 2024"这种本机开发形态下存在 | ✅ **已实现**：`server/pet-gateway.mjs` 的来源白名单（不在名单 → 403，预检只回具体来源、永不 `*`）+ `deploy/nginx.conf` 把 2024 收到回环地址后面。断言见 `scripts/verify-gateway.mjs`。**剩下的只是运维动作**（填线上域名，见 B-14） |
| 2 | ~~**直连 2024 还是走网关**~~ **✅ 已决定（v1.45 / P5-5）：走网关** | 契约按直连 2024 冻结；P5-5 选了"**补网关，而且网关只做反代不做翻译**"（`prd.md` R-AGT-02 原稿那个 `POST /api/pet/chat` 需要改后端，与 R-AGT-06 冲突，已废弃，见 §8.1/§8.4） | ✅ **已实现**：网关 = `server/pet-gateway.mjs`（:8787），契约里那 5 个端点原样透出；前端**只改 `baseUrl`**（构建期给 `PUBLIC_AGENT_BASE_URL=/api/agent`）。自检 `pnpm verify:gateway`（51 项，含真后端透传） |
| 3 | ~~**鉴权为零**~~ **✅ 已落定：接受现状（方案 A，发起人 2026-09-29 拍板）** | 从"零鉴权 + 零限流 + 白名单全开"收窄到**只剩"没有口令"**：白名单外的路径一律 404（`/assistants/{id}`、`/docs`、`/threads/{id}` 全部不可达）、来源白名单 403、限流 429、长度/体积/时长都有闸门；**但** `POST /assistants/search` 仍在白名单里，所以"拿到一个 `assistant_id` 就能发起一轮"这条**依然成立**（`assistant_id` 由 `search` 现查即可，不是秘密） | ✅ **已选：接受现状（方案 A —— 同源 + IP 限流 + 长度上限，不设口令；剩余风险知情接受）**。发起人 2026-09-29 在三个候选里拍板选③，理由是静态站的构建期注入值**对访客可见**（方案①只能挡"不知道口令的脚本"，挡不住"读过站点 JS 的人"），而方案②的 Nginx 规则与已有的来源白名单 / 限流高度重叠。**剩余风险**：最坏是被刷 token（有 20 次/分/IP 与 1000 码点上限兜着）。**B-14 随之关闭（v1.46）**；上线仍要做的两件运维动作（填 `PET_ALLOWED_ORIGINS`、开 `PET_GATEWAY_TRUST_PROXY`）见 §12.2 与 `deploy/README.md` |
| 4 | **域名与反代路径未定** | `baseUrl` 默认回落 `http://127.0.0.1:2024`（P5-5 起生产用构建期变量覆盖成 `/api/agent`） | 域名到位后（**B-01**）改 `agentConfig.baseUrl` 的覆盖值，并把线上域名填进 `PET_ALLOWED_ORIGINS`；同步 §12.2 的 `/api/agent/` 反代与 SSE 关闭缓冲（`deploy/nginx.conf` 已写好） |
| 5 | **线程是内存 checkpoint，重启即清空** | `langgraph dev` 用内存 checkpoint；服务一重启，旧 `thread_id` 全部失效 | 决定：前端检测到线程失效就**新建线程并重放最近 N 轮**，还是接受"重启后忘掉上下文"。当前契约只要求"失效即降级/新建"，不要求续接 |
| 6 | ~~**限流与长度上限没有落点**~~ **✅ 已实现（v1.45 / P5-5）** | 20 次/分钟/IP、≤1000 码点、≤8192 字节、单轮 300 秒 —— **全部落在 `server/pet-gateway.mjs`**，不再是"规划" | ✅ 见 §8.5 的表（每行都有 ✅/⛔ 标记）；`pnpm verify:gateway` 逐条断言（含 429 边界与两个方向的长度边界） |
| 7 | **检索轮的耗时抖动大** | 实测 30~120 秒（同一句话两次运行差一倍以上） | 前端要么给"正在翻"的中间反馈（桌宠 `thinking` 态），要么把超时放宽到 180 秒；不要按"平均 45 秒"设计。✅ P5-1~P5-3 已按三档闸门落地（§8.10）；✅ 网关侧 300 秒硬上限与之对齐 |
| 8 | **本机直连 Fandom / `web_fetch` 不通** | 只有 `127.0.0.1:2024` 正常 | 与前端无关，但**排障时别把网络问题误判成契约问题**：先看 `GET /ok`（走网关时先看 `GET /__gw/health`：它**不依赖上游**，能区分"网关没起"与"上游没起"） |
| 9 | **`interrupt` 只有自然语言，没有结构化载荷**（v1.35 新增，复核 D-8） | 前端"该回哪个约定词"只能从 `__interrupt__[0].value` 的**问句措辞**反推（`replyForAsk()` 的几条正则）。缓解后仍脆弱：后端把「要不要我按站里的常用范围替你挑几篇？」这种**宽松提问**问出来时，前端只能回默认词 | **要改 `agent_-for_-blog`（本轮不做）**：在 `interrupt` 里带结构化字段，例如 `{"value":"<给人看的问句>","kind":"word_count","options":["不提供","需要","不需要"],"default":"不提供"}`；前端按 `kind` 选词、`value` 只负责上屏，彻底不解析自然语言。落地前这条一直是"改一个字就翻转载荷"的脆弱点（§8.9.5 已登记） |
| 10 | **失效自愈的"清缓存 + 新建"是前端单方面行为**（v1.35 新增，复核 D-3） | 前端在 4xx 后 `resetSession()` + 重试一次；**新线程没有上下文**（旧线程的历史不会重放） | 与未决项 #5 是同一个决定：要不要"重放最近 N 轮"。当前口径是"接受重启后忘掉上下文，但**不许永久降级**" |
| 11 | **LangSmith 追踪会把"人设 + 对话 + 库表结构 + SQL 与结果行"复制到第三方**（v1.44 / P5-4 新增，**已实测**）｜**✅ 已决定（v1.45）：保持现状，线上也全量追踪** | **发起人 2026-09-28 拍板：「保持现状（线上也全量追踪）」** —— `LANGSMITH_TRACING` 在生产**保持开启**，**接受**"人设全文 + 访客提问 + 库表结构 + SQL 与结果行"被复制到第三方（`api.smith.langchain.com`）、**保留 14 天**。实测泄漏面（P5-4，证据 `reports/_p54-trace-final.json`，**第 7991 行起就是人设原文**）：一轮推荐点击 = **36 条 run / 171 642 字节**，含 ① **人设全文 13 690 字符**（`ChatOpenAI.in.messages[0].kwargs.content`，开头 `# 爱弥斯 · 人设 v7`）；② 用户问题原文（多轮 run）；③ 库名与完整表结构 DDL **2 945 字**（`sql_db_schema` 输出，含列注释与 `3 rows from blog table` 示例行）；④ 实际 SQL 253 字 + 结果行 443 字（含标题与站内 URL）；⑤ 她的答复原文 435 字。⚠️ **不是"只上报元数据"**：LangSmith 默认全量存 `inputs`/`outputs`（这也是它的产品价值），`ttl_seconds=1209600`（14 天） | ✅ **已决定，不再等拍板**；**不改后端代码**（`.env` 本来就是这个配置）。**将来要翻案，三个开关就够**（都在 `agent_-for_-blog/.env` + 重启进程，§8.9.4）：① `LANGSMITH_TRACING=false` —— 生产**直接关闭**追踪，最省事，代价是线上出问题没 trace 看；② `LANGSMITH_HIDE_INPUTS` / `LANGSMITH_HIDE_OUTPUTS` —— ⚠️ **候选开关、本项目尚未实测**：官方文档的语义是"不上传 inputs/outputs"，但**它到底是"不上传"还是"只是不上屏"没有在本机验过**，用之前必须先实测一轮再用 LangSmith API 核对（本次拍板**没有**依赖它）；③ **自托管 LangSmith** —— 数据不出自己机器，代价是多跑一个服务。底线不变：`.env` **不入库**（已 gitignore），前端侧不许出现任何 LangSmith key（§2 第 1 条） |

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
| **服务端那一层（v1.45 / P5-5 新增）** | **`server/pet-gateway.mjs`** + `scripts/verify-gateway.mjs` + `deploy/nginx.conf` | 同源反代 + 四道闸门（来源/限流/长度/体积）+ 单轮上限 + SSE 不缓冲。**前端不感知它的存在**（只感知 `baseUrl`）；正文见 §8.4~§8.7，断言见 §11 的 `verify:gateway` 行 |

**`baseUrl` 怎么定（发起人 2026-09-26 确认：Agent 是跑在云服务器上的，不是访客本机）**

```
① import.meta.env.PUBLIC_AGENT_BASE_URL   // Astro 只把 PUBLIC_ 前缀的变量注入客户端
② 没设 → DEFAULT_AGENT_BASE_URL = "http://127.0.0.1:2024"（langgraph dev 默认端口）
```

| 场景 | 怎么配 | 说明 |
| --- | --- | --- |
| 本地开发 | **什么都不用设** | 打本机 2024，就是现在的行为 |
| 上线（**推荐：同源反代**）**✅ P5-5 已实现** | `PUBLIC_AGENT_BASE_URL=/api/agent`，Nginx 把 `/api/agent/` 反代到**网关 `127.0.0.1:8787`**（网关再原样透传到 `127.0.0.1:2024`） | ① **同源没有 CORS 问题**（直连时上游是 `ACAO: *`，见 §8.9.7 #1；同源之后浏览器不发预检）；② SSE 只需 Nginx 上 `proxy_buffering off`（`deploy/nginx.conf` / §12.2 已写好）+ 网关不缓冲；③ 端口不外露，限流/长度/来源都落在网关这一层（§8.5）；④ ⚠️ **上线时 `PET_ALLOWED_ORIGINS` 必须加上线上域名**，否则同源 POST 带的 `Origin` 会被网关 403 |
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
| `/ok` 探测 | 2 秒（§8.9.1） | **可用性**探测的入口（降级的**触发条件**另有 **7 条**，见 §8.9.6 那张七行表：`enable:false` / 连不上 / 超时 / 契约不符 / 返回空 / 服务端错误 / 线程·assistant 失效） | 本机 `ECONNREFUSED` 是立刻返回的 |
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
8. **降级**（§8.9.6 的 **7 条**触发条件全覆盖；第 7 条"线程 / assistant 失效"是**先自愈、自愈不成才降级**，可执行判据在 §8.10 的「失效自愈」）：

   | 触发 | 判定 | 行为 |
   | --- | --- | --- |
   | `enable:false` | 读配置 | **一个请求都不发**，直接 `fallbackReply()` |
   | 连不上 | `fetch` 抛 `TypeError` | 重试 1 次 → 仍失败就降级 |
   | 超时 | 首字节 20s / 整轮 180s | 降级 |
   | 契约不符 | 白名单外事件名 / 末事件不是 `values`（等价于取不到答复）/ 响应没有 body | 降级 |
   | 返回空 | 最后一条非空 `ai` 消息是空串 | 降级 |
   | 服务端错误 | `5xx`（含重试后仍失败） | 降级 |
   | 线程 / assistant 失效 | `runs/stream` 回 `4xx`（实测重启后失效的 thread 与 assistant 都回 404） | **先自愈**：清缓存 → 重建线程 / 重查 assistant → 重试一次；仍失败才降级（§8.9.7 未决项 #5） |
   | **调用方取消**（**不是**降级条件，列在这里只为对照） | `signal.aborted`（关框 / 切页） | **不降级、不报错**：返回 `text: ""`，组件按会话号丢弃（不算 §8.9.6 的那 7 条） |

9. **mock 台词口径**：`fallbackReply()` 按用户这句话挑一句（人设红线：短、平、然后给出口），出厂台词池是 `petConfig.mockReplies`（已按同一口径重写）。**两边都不含任何运维字样**（不提服务/端口/连接/模型/图/线程/错误码）。
10. **九状态联动**（R-AGT-04，**不新增第 10 个状态**）：请求发出 → `running`（"执行任务"；不用 `review` 是因为它是 `once` 一次性动画 + 星屑庆祝，语义是"完成了"）；失败/降级 → `failed`（1500ms 后回 `running`，聊天框还开着不算待机）；答复完成 → `review`（"完成反馈"）+ `waving` 的意图由 `openChat()` 的 `running` 承接。
11. **复位**（R-PET-04 的硬要求）：`chatSession` 计数器 + `AbortController` + `thinkTimer` 三件套 —— 关聊天框、Swup 切页、连续提问时**迟到的结果一律丢弃**，状态由 `endTrip()` / `closeChat()` 复位。⚠️ `closeChat()` 只 `abort()` 不断流会让 `fetch` 抛 `AbortError`，**必须同时作废会话号**（登记为 T51）。

**测试落点（`pnpm verify:ui` 的 R-AGT 段，实测 23 条 —— 随真机轮次增减，逐条以 `reports/verify-ui.log` 的 `[R-AGT-*]` 记录为准；下表按判据分组，一行可对应多条断言）**

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
| AI应用 | AI 应用 | `ai` | **2 篇为原创重写版**（源导出里 125 张 `page-*.png` 整批缺失，发起人 2026-09-24 要求"重写这两篇" → 提交 `7219018`/`8264d0d`，站内 133 篇 0 draft）。⚠️ 源目录那两份**仍是缺图原版**，所以 `import-posts.mjs` 的 `SKIP_SOURCES` 必须保留（T74） |
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
| 学习路线 | `src/types/roadmapConfig.ts` | 见 §5.3（`lines[].stages[].stops[]`：`slug` + `category` 成对定位，`name?` 只覆盖显示名） |
| 桌宠 | `src/types/petConfig.ts` | 见 §7.3 |
| Agent 文章索引 | `agent/data/blog-index.json` | `slug` `title` `description` `tags` `category` `published` `url` `excerpt` |
| ~~Agent 榜单~~ | ~~`agent/data/rank.json`~~ | **已随 P2R 废止（v1.41）**：`rankConfig` 已删、这份文件磁盘上从来不存在（`agent/data/` 目录都没有）。⚠️ 后端侧（**另一个仓库**）仍留着 `ask_rank` 意图与 `rank.json` 设计 —— 见交付报告的 **R32**，本仓库不动 |

**约定**：文章内图片一律用 `public` 路径（`/images/posts/<slug>/01.jpg`）；封面/壁纸/桌宠图集用 `src/assets` 相对路径（自动优化 + LQIP）。

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
| `pnpm verify:posts` | **内容校验**（`scripts/verify-posts.mjs`，阻断式）：frontmatter 完整性 / slug 唯一且 ASCII / 正文非空 / **本地图片存在且非 0 字节** / `frontmatter.image` 存在性 / 站内链接目标存在 / 残留 Obsidian 语法 / 标题重复。`--quarantine` 可把出错文章移进 `src/content/_quarantine/` | ✅（P4 新增） |
| `pnpm verify:ui` | **界面验收**：开真实 Chrome 跑 **331 项功能断言**（**计数演进：257 → 274（P2R 新增路线页断言）→ 231（Task 4 删掉 43 条排行相关、保留 2 条改名）→ 232（Task 4 修复轮补 1 条「llms.txt 无排行残渣」）→ 234（终审修复波补 2 条：抽屉当前页/父级展开 1 条 + 同名两行显示名可区分 1 条）→ 235（v1.43 / P6-8 补「apple-touch-icon 是 180px 那张」1 条）→ 245（v1.46 / B-16 补 10 条页内锚点断言：历史记录 + 后退不重渲染 + 全站锚点形态普查 + 裸 `#` 占位边界）→ **259（v1.47 / P4-8：把「抽样泄漏扫描」升级成全站零残留 4 条 + 空态与详情路由 5 条 + 导航空分组 3 条 + 页脚 1 条 + 侧栏 1 条 + 音乐 3 条 = 17 条；另把 `/friends/`、`/sponsor/` 从「noindex 存根」改成「真 404」口径，净 +1）**→ **259（v1.48 / P4-8 收尾轮：**条数不变** —— 只把 `musicConfig` 那条断言就地换成新口径（上游 meting 歌单 ID 已清空、`mode` 仍 `local`）；删孤儿既不产生也不消灭断言）**→ **260（v1.49 / P4-8 末轮：扫描面从 `dist/**/*.html` 扩到「产物全集 + 文件名/路径」，**新增 1 条**「产物文件名/路径不含上游字样」；同轮删掉旧口径里那条"只放行 3 个已登记内部 JS 全局名"的白名单 —— 那几个名字与另外两处已全部改成中性 `imiss` 前缀，白名单归零）**→ **260（v1.50 / P4-8 源码层收尾：**条数不变** —— 本轮只清**源码层**（不发布）的上游字样：功能契约改名、`.github/**` 站点元数据、描述与注释，见 `PROJECT_STATUS.md` §1「最近变更」；`about.md` 与 `ABOUT_HTML` 例外**仍然原样保留**）**→ **264（v1.51 / P4-8 收官：**+4** —— 新增 1 条正控 + 3 条负控的「搜索索引里也搜不到上游字样」（`dist/pagefind/**` 那 184 个二进制索引分片此前是扫描盲区）；同轮把「唯一排除 `about/index.html`」那个例外连同 `INFO(待办)` **一起删除** —— 例外删除本身不产生也不消灭断言，条数变化全部来自那 4 条；判据第一版写成"搜 `cuteleaf`/`Firefly` 结果数 = 0"时实测各 3 条，查清是 **pagefind 的 zh-cn 分词器把拉丁词切成 CJK 二元组**造成的噪声，判据因此改成"精确查询 + 逐条查正文"两条腿，见 `scripts/verify-ui.mjs` 该块注释与 `reports/_p48-search-probe2.mjs`）**→ **279（v1.57 / B-10 关闭：**+15** —— ① 顶层导航那条**就地换口径并补 3 条**（「链接」组从"整组消失"翻成"已重建且含 8 条子项"，另加"8 条都标 `external: true` / 无 `pageKey`"与"组内无上游署名项"）；② **新增隐私与排除项泄漏守卫 2 条**（负控 14 个串扫 `dist/**` 全集 + 文件名/路径；正控「发起人要收录的域名仍在产物里」，防"产物空了"的假绿）；③ **书签导航页新增 10 条**（该页此前一条界面断言都没有：分组按权重渲染 / 每组条数 / 38 张卡标题与 URL 逐条等于清单 / 第三方 favicon 请求为 0 / 38 格图标无一空白 / 卡片高度整齐 / 空组过滤 / 胶囊锚点与条数角标 / `target=_blank` / 390 视口同口径）；④ 旧的「不再有『链接』组」1 条随 ① 一起消失 → 净 264 + 8 + 2 + 10 − 5 = **279**）**→ **289（v1.58 / 官方图标 + 官方品牌色：**+10** —— ① 书签页原有那条「38 格图标全部有内容」**就地换口径**（从"手填图标或首字母块"改成"svg / 本地 favicon / 字母块"三形态计数，并把旧判据里"卡片内 `<img>` 数量必须为 0"换成"所有 `<img>` 必须指向站内 `/booknav-icons/`" —— 后半句在 11 张卡改用本地官方 favicon 后必然为假，但"不许有 `<img>`"从来不是目标、"不许有**第三方**请求"才是）；② **新增 R-BOOKNAV-05 三条**：每张卡的图标都必须是真图标（`<svg>` 或本地 `<img>`，`.booknav-letter` 只允许出现在点名过的例外上，失败时逐张列出卡名）/ 字母块条数必须**恰好等于**例外名单长度 / 26 个 iconify `<svg>` 都必须带 `aria-hidden="true"`（图标是装饰性的，不挤占卡片标题的无障碍名）；③ **新增 R-BOOKNAV-06 三条**：每个图标都要有颜色（`27` 个带图形元素的图标，计算色 ≠ 旧中性灰/白 —— 判据**按解析后的 RGB 数值比**，因为 Chrome 在深色下把 `#404040` 序列化成 `oklch(0.371 0 none)`）/ 不同品牌卡的渲染色不全相同（23 种 vs 配置 22 种）/ **26 张 iconify 卡的亮色渲染色逐张等于配置里的品牌色**；④ **新增 R-BOOKNAV-07 两条**：深色下每个图标对**它自己那层图标块底色**的对比度 ≥ 3:1（实测最低 3.24:1、最高 12.23:1）/ 深色下图标色**确实被主题感知地提亮**（不是照搬亮色值，且前置断言 `html.dark === true`，防止"深色那一趟其实量的还是亮色值"）；⑤ **新增 R-BOOKNAV-08 两条**：11 个图标 `<img>` 全部指向站内 `/booknav-icons/`（封闭判据：任何 `http(s)://` 或协议相对 URL 都判红）/ 产物全集里不出现 favicon 聚合服务域名（`s2/favicons` · `favicon.im` · `faviconV2` · `googleapis.com`，扫 811 个产物文件；产物**没被扫到**时判红而不是放过））→ **292（v1.59 / 桌宠默认档改 `fixed`（完全静止）：**+3** —— ① R-PET-06 原来的「默认档 = `float`」**就地换成**「默认档 = `fixed`」（配置 + 运行时 DOM 两条证据都读）；②③ **新增两条默认档断言**：「1.6 秒两次采样 `transform` 与坐标完全相同（没有 hover 浮动）」与「首访落点在右下角、完整在视口内、不与浮动按钮列重叠」（后者**清掉 `localStorage` 位置记忆后重载**再采样，且要求按钮确实可见 —— 否则是空过）；④ `float` 4 条 / 强制切档的 `fixed` 2 条 / `ground` 1 条**全部改成显式 `__imissSetMode()` 切档后测**（默认值变了不等于这两档可以不测），三档不遮挡 3 条 + reduced-motion 1 条 + 位置记忆 1 条照旧 → R-PET-06 **13 → 15**；⑤ R-PET-02 **+1 条**：默认档按 ← 断言"坐标与 `transform` 都不动"（`walkTo()` 在 fixed 档直接 return —— 不显式切档的那条老断言「键盘 ←→ 左走」会当场判红），原来那条**保留**但改成在 `__imissSetMode("float")` 之后按））**→ **293（v1.60 / 侧栏模板示例公告换成正式文案：**+1** —— 新增一条「模板示例公告文案守卫」，**负控 + 正控压在同一个 pass 里**（拆两条的话，"公告被关掉 / 组件被摘掉"会表现成"负控 ✅ + 正控 ❌"这种像半个成功的假绿）：负控 = 2 个模板示例串（`这是一则示例公告` / `欢迎来到我的博客`）扫 `dist/**` 全集 + 文件名/路径（二进制按"含 NUL 字节"跳过内容，口径与上面那条一致），正控 = 新公告文案**逐字**出现在**每一张公告卡切片内**（`<widget-layout data-id="announcement">…</widget-layout>`，v1.60 实测全站 162 个 HTML × 2 张 = **324 张**）、且**首页必须有卡**（否则"只在某一页留公告、其余全摘掉"仍会绿）；`dist/**` 里 3 个没有公告卡的页面（`/bangumi/` / `/bilibili/` / `/dynamic/comments/`，正好是 pagefind 报"没有 `<html>` 元素"的那 3 页）不在正控的"每页必须有"之列，只被负控覆盖）**→ **294（v1.61 / 「链接」下拉整批换成发起人的 6 条：**+1** —— ① **就地换口径 3 条**（不是新增）：`EXPECT_LINK_CHILDREN` 8 → 6 条新清单（Gitee / GitHub / CSDN / 洛谷 / Boost 搜索引擎 / HTTP 服务器）、「8 条都标 `external: true` / 无 `pageKey`」→ 6 条、v1.57 那条「已重建且含 8 条子项」→ 「含 6 条子项」；② **新增 1 条配置层判据**：只钉渲染出的 DOM 证不了两件事 —— 「CSDN 的 `?spm=…` 是**照办去掉**的」与「裸 IP 那条**是照原样留的、注释里有 https 建议**」（前者把跟踪参数粘回去会红，但后者若被"顺手改成 https 域名"反而更干净、DOM 判据看不出来），所以这一条只看配置文件里 `url:` 的值：**6 条无查询串 + `http://106.52.158.48:8081/` 原样在 + 块内有 `https://<域名>/` 建议注释**；③ 上一轮 v1.57 为这一格钉的「组内无上游署名项」负控**原样保留**（判据本身仍然有效））**→ **295（v1.62 / 「断言格数不变量」：**+1** —— 修掉一个**真缺陷**：R-AGT 端到端②段那 4 格（3 条真机 + 1 条身份类）原来被 `if (!probe)` 挡着，**后端没起时根本没注册**（不是记成 SKIP）→ 汇总行的总数 294 → 290 → `verify:docs` 的「断言条数」门**随后端摆动**（后端一停就假红 14/15）。现在：**永远注册同样多的格数**，后端没起只把那 4 格记成 ⏭️ SKIP；另 2 格（页面内假后端 / 死端口）与后端在不在无关、**永远真跑**；并新增 1 条 `UNIT-AGT` 自检把「格数 + 编号 + 顺序」钉成常量（把常量改错即判红，注入证据见 `reports/_count-invariant-report.md`））**→ **298（v1.63 / 音乐播放器恢复：**+3** —— `musicConfig` 的 `showInNavbar` / `showInSidebar` 改回 `true`、`local.playlist` 填进发起人的《别难过》，R-ID-06 那 **3 格**（旧口径：「导航/侧栏都没有播放器入口」+「页面没有音频请求 → 结构上不可能 404」+「歌单已清空、两个开关均 false」）**逐条就地翻转**成新口径并拆成 **6 格**：两个入口各一格（导航按钮 + 浮层内 widget / `#left-sidebar-wrapper` 内的 widget）、产物里 `localPlaylist` 解转义后逐字段一格、mp3 与封面在 `dist` 里的**字节数逐字节对**（9599149 / 141956）且 HTTP HEAD 200 一格、浏览器里 `window.__imissMusic.getState()` 真拿到这条曲目一格、配置层 5 字段 + 两个开关 + `meting.id` 仍空 + `mode` 仍 `local` 一格 —— **没有删断言**；295 → 298。⚠️ 顺带修掉旧口径里的一个**恒真子判据**：`navHasMusic` 查的是 `home.allLabels`，而导航那格的播放器按钮**不在** `allLabels` 里（那里只收导航链接的文字），所以它从来没在判 `showInNavbar`（T85 同类））**。⚠️ 括号里的分解只是"这一轮怎么变的"，**数字一律以 `reports/verify-ui.log` 的汇总行为准**，见本节末尾的记账约定**）（导航顺序、站点名、色相、**上游身份零残留扫描（产物全集）**（v1.47 从「4 条路由抽样」升级为「`dist/**/*.html` 逐个扫」；**v1.49 再升级为「`dist/**` 全部 799 个文件 + 文件名/路径」**：① 产物全集内容按大小写不敏感匹配 8 条上游品牌/身份正则（**逐字只写在 `scripts/verify-ui.mjs` 的 `UPSTREAM_CI` 常量与 `IDENTITY_NEEDLES` 表里 —— 判据本体必须含这些字面量，这是源码层本项唯一保留上游字面量的功能性例外；v1.50 起三份文档与 `README.md` 里都不再重复这几个字面量**）；② **文件名/路径本身**同判据、单独一条断言；③ 品牌/身份/凭据串（大小写敏感 15 条：base64 邮箱形态、Bilibili/Bangumi/VNDB 的 UID、上游横幅标题与副标题诗）；④ 剥掉 script/style/注释后的**可见文本**（仅 HTML，补充层）。**二进制按"含 NUL 字节即视为二进制"跳过内容、文件名照查**，"内容可读 N / 跳过 M"写进通过文案。**v1.51 起这条断言对产物全集"零例外"** —— v1.47~v1.50 期间那个唯一的例外（`about/index.html`：整页曾是模板作者的自我介绍、硬约束禁改）已随关于页换成中立版**连例外代码与 `INFO(待办)` 一并删除**，通过文案从"唯一排除 about/index.html"改成"全产物零例外"，并用注入实测过它仍会红）、**v1.51 新增：搜索索引里也搜不到上游字样**（`dist/pagefind/**` 的 184 个压缩索引分片是上面那条断言的**扫描盲区** —— 二进制、内容整批跳过，而关于页是带 `data-pagefind-body` 被索引的；现在拿站点**实际加载**的 `window.pagefind` 直接问搜索：正控「指针」必须 > 0（API 73 条 + 真实搜索框打字渲染出结果链接），负控 `夏叶`/`cuteleaf`/`Firefly` 必须**精确查询 0 条 + 返回结果的正文里也没真的出现 + 搜索面板文字不含**。⚠️ 判据第一版"结果数 = 0"是错的：pagefind 的 zh-cn 分词器把拉丁词切成 CJK 二元组（`Firefly` → `fi`/`ir`/`re`…），会命中正文里的 shell `fi`、`Wi-Fi` 之类的噪声，实测各 3 条而正文里一条都没有 —— 详见该块注释与 `reports/_p48-search-probe2.mjs`）、统计行数、热力图、占位模式、页面可达性、sitemap/**llms.txt**、配色对比度、**P2R 学习路线全项**：8 条主线与页内锚点 / 停靠点与跨线 / 篇目并集 = 133 / 无 JS 与打印兜底 / Swup 切页与后退 / canonical / 导航第 3 格 / `/rank/*` 四个旧地址 404、不在 sitemap、llms.txt 里也没有残渣（排行整块已删，Task 4）、**P4 内容迁移全项**：配图真实加载 / 编号顺序 / 移动端 / 不生成 figure 图注 / URL 形态 / 双链改写 / 无 Obsidian 残留 / 表格与代码块 / 无标题短笔记 / 归档与分类收录），并输出 **55 张**截图到 `reports/screenshots/`（**v1.58 起含 `booknav-dark-1440.png`** —— 书签页深色版的图标配色证据；`pnpm verify:ui` 自己只产出亮色那张，深色那张由 `reports/_bni-shots.mjs` 产出，但它**计入**截图张数闸门。**v1.59 起另含两张桌宠首访落点证据** `pet-fixed-first-visit-1440.png` / `-scrolled.png`，由探针 `reports/_pet-fixed-landing-probe.mjs` 产出，同样计入）。P3 起含桌宠与壁纸全项（九状态触发 / 键盘 / 拖拽 / 菜单 / 联动 / reduced-motion / 与浮动按钮不重叠 / 移动端隐藏 / 取景与暗罩），**P3-R-PET-06 起含三档运动模式全项**（**v1.59 起口径 = 默认档 `fixed`**：默认档**静止**（1.6s 两次采样 `transform` 与坐标完全相同）/ 默认档**首访落点在右下角**且完整在视口内、不与浮动按钮重叠 / `float`（**强制切档**）悬空且强制起飞后坐标真的变化、飞行中带 `data-pet-flying` / 飞行全程不出视口 / 强制切档的 `fixed` 1.6s 两次采样坐标完全相同且拖放不落地 / `ground`（**强制切档**）松手回地面高度 / 三档都不与右下角浮动按钮重叠 / reduced-motion 下 `float`（强制切档）两帧 `transform` 相同（静态悬浮）/ 位置记忆仍生效且模式以配置为准；**R-PET-07 起含飞行手感与菜单摆位**（位移 60~180px / 时长 4~6s / row4 姿态 / 菜单四边在视口内）；**R-PET-08 起菜单判据全部换成左右摆位**（并排在宠物左/右、纵向顶部对齐、哪边够放哪边、5 点 `elementFromPoint` 命中、被遮挡换边、两侧都被挡的两级兜底、`data-pet-menu-side` 取值与层级不变），并新增**菜单项与下落/上升行为**断言（档位二选一显示「落下去」/「飘起来」、点「落下去」后 y 在 3 秒内落到地面线且 `data-pet-mode=ground`、点「飘起来」后反向回到悬浮档）。⚠️ **数字基准是"对 `pnpm preview` 的静态产物跑"**：对 `pnpm dev` 跑会少若干条（**产物级检查不适用** —— 例如 noindex 存根与 sitemap/llms.txt 这类要读 `dist/` 的判据；**具体少几条会随轮次变，别背这个数字**，以脚本输出的汇总行为准）。历史上那个"少 12 条"的分解早就过期了，别再拿它当基准 | ✅（P1 新增，P2/P3/P4/R-PET-06/R-PET-07/R-PET-08 六次扩容；v1.41 随排行删除 −43/+1，另修 `dist/llms.txt` 的诊断误标；**v1.60 新增 1 条「模板示例公告文案」守卫（292 → 293）**；**v1.61「链接」断言随 6 条新清单迁移（3 条就地换口径）+ 新增 1 条配置层判据（293 → 294）**；**v1.62 修「总数会随后端在不在摆动」（294 → 295，R-AGT 那 4 格改为永远注册、后端不在时记 ⏭️ SKIP，另加 1 条 `UNIT-AGT` 自检）**；**v1.63 恢复音乐播放器（R-ID-06 那 3 条「已关闭」就地翻成「已开启」并拆成 6 格，295 → 298）**；**v1.64 站点标识与头像换装（+5 条真浏览器读像素的判据：32px 透明带 / 32px 包围盒 1.35:1 / 导航栏 Logo 256×190 / 180·192 满幅不透明方图 / 侧栏头像与大图标同源且与小图标不同源；旧的 3 条只钉文件名、对本次改动恒真。⚠️ 当天先把 3 条判据加在 192 那张上（298 → 301），随后发起人把 192 改成人物、判据对象跟着挪到 32 并再加 2 条 → 301 → 303；同日再按发起人要求去掉资料卡头像悬停浮出的名片图标，补 1 条四条腿的判据（DOM 无 svg / 压暗层无子元素 / 悬停底色变深 / **产物里也搜不到图标名**）→ 304；**v1.66 项目页与「关于本站」**：`/projects/` 那条「空态」判据**就地翻成「列出 2 张卡且标题/状态/外链/详情四类字段逐条对得上」**、新增「两个项目详情页可达且正文渲染」、新增「公告「了解更多」指向 `/about-site/`（且不再指向 `/about/`）」、原「关于我页有真实内容」拆成「关于本站页有真实内容 + 关于我页是占位页」、（`ALLOWED_ROUTES` 加入 `/about-site/`（路由 200 那一趟多一格）→ 308）**；**v1.67 手机端显示 +「关闭」档**：（**+9**）R-PET-01 那条「移动端 390 不显示桌宠」**就地翻成**「移动端 390 能看到桌宠」、另加「隐藏开关仍接在解析期脚本上」1 条；新增 R-PET-12 三条（CSS 断点 = `mobileBreakpoint − 1`（跨三个文件核对）/ 390 冷启动的真实像素与 1440 对照 / 1440→390 resize 立刻切档）与 R-PET-13 五条（真机点「关闭」后精灵 124→62px、脚底锚点不动、迷你时单击不说话、真双击恢复、菜单末项文案跟着状态走）；另有三条旧判据**就地换前提**（R-PET-03 的 "`say` 菜单项"改左键单击、R-PET-08 的两条几何用例换视口宽）→ 317）**；**v1.68 聊天框「点外面就关」**：（**+3**）R-PET-14 三条 —— 真机点空地关框（先自证"那个点不在面板/宠物里、也不是链接或按钮"）/ 点面板里面不关 / 点角色本體不关且面板 DOM 完好（同时钉住 `say()` 的 `chatOpen` 闸门）→ **320**）**；**v1.69 只改字面**：（**±0**）菜单末项「关闭」→「缩小」（发起人：「关闭变成缩小，其他不变，就改个前端文字」），跟随改的是四个 `same(…, [...])` 数组、三处 `label ===` 比对与 `realMenuClick("缩小")`，**没有新增/删除任何判据**，条数恒 320；同轮明确**不做**「×」关闭按钮）**；**v1.70 动态壁纸（R-BG-02 兑现 + R-BG-07 新增）**：（**+9**）R-BG-01 两条**就地换口径**（"4 张 imiss 图加载成功" → "视频在播 + 静态图零残留"）、R-BG-04 一条**就地换口径**（钉 `object-position` 字面量 → 从 DOM 反推锚点在可见窗口里的偏移）；新增 R-BG-02 六条（产物里核对 5 支原画的字节+sha256 / 在播且 loop+muted+原生分辨率 / 首尾帧接缝 / 三种降级各一条）与 R-BG-07 三条（横幅 cover 且锚点在窗口内 / 手机只剩三成宽但锚点仍在中轴 / 全屏 contain 不裁一像素）；R-BG-05 那 9 条的**写法一字未改**（`count/activeIndex/activeSrc` 三个字段的来源从 slides 换成播放清单）→ 329）**；**v1.71 窄屏横幅高度与内容定位对齐**：（**±0**）本轮只改了 CSS 变量与常量（`BANNER_HEIGHT_MOBILE`），
**没有新增/删除判据** —— 它是"版式修正"，判据仍由 R-BG-08（prd）与 §6.5 ①b 的实测量值背书）**；**v1.73 取景逐支微调**：（**±0**）只加 @@focusAnchorX@@ / @@zoom@@ 两个旋钮，
那三条"锚点在窗口里的偏移"期望值改成 (anchorX − 0.5)（容差同时从 0.06/0.08 收到 0.03）**；**v1.74 换壁纸扩到全屏壁纸与透明覆盖**：（**+2**）
全屏壁纸"两侧箭头渲染 + 点空白换下一张 + 拖动换下一张"、透明覆盖"点空白 + 拖动"（透明覆盖那条尤其要紧：
它的壁纸层在 @@z-index:-1@@，指针到不了 wrapper，原来的拖动监听在这一模式下等于没绑）→ **331**）**） |
| `node scripts/import-posts.mjs` | **旧博客迁移**（默认 dry-run）：`--write` 落盘、`--batch 1..5`、`--cat`、`--only`、`--limit`、`--src`；报告写 `reports/import-report.json` | ✅（P4 新增） |
| `pnpm verify:docs` | **文档一致性自检**（`scripts/verify-docs.mjs`，**共 15 项（原 17 项）**）：核对三份文档互相之间、以及文档与仓库事实是否一致——版本号与"最后更新"日期、断言/截图数与最近一次实测、**模块路由清单**（`src/pages/rank/` 在不在决定判据走哪一支：还在就要求每个路由文件都在 ARCH 登记，已删就要求 prd §2 不再列 `/rank/` 且 ARCH 登记 `src/pages/roadmap.astro`）与路由文件、导航子项与 `navBarConfig.ts`、需求编号引用闭环、阻塞项条数与编号连续、§2 与 §3 阶段状态，、**配置事实**（`displaySettingsConfig.enable`）与**文件编码**（受版本控制的文本文件不带 UTF-8 BOM —— **v1.56 起判据是「按内容判文本」**：`git ls-files` 全量、逐个读前 8KB、含 NUL 字节即跳过二进制，覆盖 `.sh`/`.ps1`/`.conf`/`.service` 与 `.gitignore`/`LICENSE` 这类无扩展名文件；**读失败与 `git ls-files` 失败一律判 FAIL**，不静默放过）。**每次收工前跑一次**（P2 加二游排行时文档漂移了 12 处，就是没有这道关卡） | ✅（v1.12 新增；v1.41 随排行删除摘掉 `rankConfig.dataStatus` 与"4 组数据是否漏了第 5 份"两条检查 → 17 → 15；同轮补两处**闸门自身的防御**：基准日志候选过滤接受 `_verify*.log`、找不到基准日志**判 FAIL** 而不是记 `pass=true` 的 INFO，见 §14.3 **T77**；**v1.56 只加宽第 11 项「文件编码」的扫描面**（扩展名白名单 → 按内容判文本，覆盖 550 → 568 个文本文件），**项数仍是 15**，没有新增检查项） |
| `pnpm verify:agent` | **Agent 接口契约自检**（`scripts/verify-agent.mjs`，零依赖）：把 `ARCH.md` §8.9 的契约变成 **14 项断言**——配置对齐（读 `agentConfig.ts` 原文核对，**baseUrl/graphId 同时认字面量、常量、函数回落三种形态**，见 T59）/ `GET /ok` / `GET /assistants/search` 去重后 4 张图 / 闲聊轮事件白名单+`values` 或 `updates` 收尾+与 `GET state` 一致+最终答复 / 检索轮「工具输出进了流但没进答复」/ 推荐轮 `interrupt`→`resume:「不提供」`（**原始汇总行会打出两轮的末事件名**）/ `configurable`+`context` 400 坑 / 降级探测（死端口不可用 + 活服务可用对照项）。**退出码规矩与其它 `verify:*` 不同**：Agent 没在跑 = **SKIP + 退出码 0**（打印 `langgraph dev` 启动命令），**契约不符 = 退出码 1**。⚠️ **SKIP 与 ✅ 必须长得不一样**（v1.35 起）：`⏭️ [SKIP]` 单列一行 + 单独打"跳过原因"，汇总行 `✅ 通过 N，❌ 失败 N，⏭️ 跳过 N` **三项分开计数**，并额外打一行"本轮 N 项**没有执行**（不计入通过）"；JSON 里带 `skippedIds`。产物 `reports/verify-agent.log` + `reports/verify-agent.json` | ✅（v1.33 / P5-0 新增；v1.35 修 D-1、SKIP 语义收紧） |
| `pnpm verify:agent:robust` | **适配层健壮性回归**（`scripts/verify-agent-robust.mjs`，**26 条**）：P5 独立复核那批"只有畸形输入才暴露"的缺陷的**可执行反例**。做法：用 esbuild（Astro 自带依赖）把 `src/utils/agent-client.ts` 打成临时 ESM（`reports/_agent-client.bundle.mjs`，gitignore 内）再 `import()` —— 测的是**真源码**，改一处代码这里立刻跟着变；再用 `globalThis.fetch` 的**内存假后端**喂畸形 SSE（跨 chunk 的 `\r`、EOF 未闭合、70KB 单事件、schema 行当答复、挂住的 `/state`、404 失效、5 万字答复、宽松问句）。覆盖 D-2/D-3/D-4/D-5/D-6/D-8/D-9/D-15/D-16/D-17/D-18。**不依赖真后端、不起浏览器、不起服务**（几秒跑完，CI 可跑）；退出码：有失败 = 1。产物 `reports/verify-agent-robust.log` + `.json` | ✅（v1.35 / P5 复核修复新增） |
| `pnpm verify:gateway` | **网关自检**（`scripts/verify-gateway.mjs`，零依赖，**51 项**）：P5-5 那个网关拦的东西**都不可能靠读代码验掉**（缓冲只在"上游分两次、中间隔 1.5 秒"时才看得出来；上游不可达/永不响应这两种失败模式真后端造不出来），所以脚本**自己 spawn 网关实例**（`spawn(process.execPath, [...])` + 环境变量覆盖，stdout/stderr 落 `reports/gateway-<name>.log`），上游用**脚本内自带的 stub**。覆盖：预检 5 项（`node --check` / 只 import `node:` 内建 / 不 shell out / `package.json` 注册 / `--help`）+ 路由白名单 8 项（前缀剥离、bare 路径、query 原样透传、`/assistants/abc` 与 `/docs` 与编码穿越都 404 且**不打上游**、DELETE/GET `/threads` 405）+ 来源 7 项（evil Origin 403 且不打上游、实际响应 ACAO 非 `*`、预检 204、站外 Referer 403、无来源放行、origin/referer/cookie **不转发上游**）+ 体积与长度 7 项（413 / `invalid_json` / **1001 码点拒绝且 `actual=1001`**（拿 UTF-16 长度 2002 或字节 4004 当判据都会算错）/ **恰好 1000 码点放行** / `type:"human"` 与分片 `content` 两种形状同样受约束 / 续跑轮不被误杀）+ SSE 4 项（响应头、**不缓冲：首块 <1000ms 且第二块 ≥1400ms 后才到**、帧完整、上游 404 原样透传）+ **限流 2 项**（`PET_GATEWAY_RATE_LIMIT=3` 下第 4 个 429 + `Retry-After`）+ **客户端 IP 2 项**（`PET_GATEWAY_TRUST_PROXY=1` 时**真按 XFF 最左项分桶**：打满 2 次后第 3 次 429、换一个伪造 IP 立刻可用；**默认时换个伪造 IP 换不到新桶**：同一个 socket 第 3 次仍 429 —— 两半都测，"开了却没读"与"没开却读了（可伪造）"两种坏法都会显形）+ **出厂口径 4 项**（用**纯默认配置**起的实例从 `/__gw/health` 把 20/60s/8192/1000/300000/trustProxy=false、白名单两项、`/api/agent`、上游默认值、路由白名单**逐个读回来比对** —— 这是"生产值非空过"的钉子）+ 失败模式 4 项（死端口 502 且**响应体无栈无 `ECONNREFUSED`**、health 不依赖上游、未开始的 504、**已开始时的干净收尾**）+ **日志不泄漏 4 项（双向）**（金丝雀消息与假密钥**不在**日志；thread id **在**流式日志行上；并断言金丝雀真的到过上游、假密钥真的回到过客户端 —— 防"读错文件/猜错形状"导致的假绿）+ **真后端 4 项**（`/ok` → `assistants/search` → `/threads` → `runs/stream` 全走网关，断言拿到 200 与可解析的 `data:` 信封）。**退出码**：任一断言失败 = 1；**真后端没起 = 那 4 项 ⏭ SKIP 且退出码 0**（与 `verify:agent` 的规矩一致）。⚠️ 那条"跳过"路径本身也是**验过**的，不是写上去的：`PET_VERIFY_REAL_UPSTREAM=http://127.0.0.1:2099 node scripts/verify-gateway.mjs`（2099 没人监听）→ 实测 `网关检查 51 项：通过 47 / 失败 0 / 跳过 4`、**退出码 0**，并另行打出"本轮的 4 项**没有执行**（不计入通过，也不影响退出码）"。产物 `reports/verify-gateway.log` / `.json` / `gateway-*.log`。⚠️ **注入验证过**（4 处，逐个还原并核对 sha256）：去掉长度校验 → 长度 3 条红；关掉来源白名单 → 来源 5 条红；把 SSE 改成攒完再发 → 「不缓冲」红而「帧完整」仍绿（证明那条断言抓的是**时序**不是**内容**）；把请求体打进日志 → 「金丝雀不在日志」红而「thread id 在日志」仍绿 | ✅（v1.45 / P5-5 新增） |
| `pnpm verify:ui` 的 **R-AGT 段** | **端到端联动断言（实测 23 条，见 §8.10；**v1.62 起条数恒定、不再随后端在不在变化** —— 逐条以 `reports/verify-ui.log` 的 `[R-AGT-*]` 记录为准）**：产物里 `enable` 是真的（不写死 chunk 文件名）/ `enable:false` **零请求** / `enable:true` 真往返 + 人设口径（无「您」无加粗无表格无完整域名 + 不是出厂 mock）/ `interrupt` 反问进气泡 + 续跑拿到真答复 / 死端口降级仍可用 / 状态联动与复位（关框、Swup 切页、连续提问）/ 气泡与整页 DOM 无禁词表 / 注入已还原；**v1.35 起另加 6 条用"页面内假后端"跑的反例**：500 字长答复可读可滚（带截图）/ 禁词闸门 / thread 404 自愈 / `/state` 永挂仍 1~3 秒上屏 / 协议不符立刻降级 / 在飞时再发送有可见反馈。⚠️ Agent 没在跑时那 4 格（3 条真机 + 1 条身份类）**照样注册、记 ⏭️ SKIP 不计失败**（**v1.62 修**：旧版这 4 格**一条都不注册** —— 总数 294 → 290、`verify:docs` 的计数门随后端摆动而假红 14/15；现在**后端在不在只改"跑 / 跳过"，不改格数**，与 `verify:agent` 的退出码规矩一致：环境未就绪不算回归）；与后端**无关**的那 2 格（页面内假后端 / 死端口）永远真跑。**R-PET-11 起这段里还挂着聊天框的 19 条**（同一个"页面内假后端"手法，见 §7.6 第 27 条）。**v1.37 加 3 条**：① **身份类禁自称**（发起人 2026-09-27 决定）：同一会话里连问 5 条身份问题，只扫**她说的那部分**（不扫整页——站内本来就有讲 AI 的文章正文；也不扫用户那句话——`AI` 是他打的），**6 个自称词 0 命中、且每条都明确「我是爱弥斯」**，另加"不许越过底线（自称真人 / 冒充官方）"的反向判据与"起手历史必须为 0"的前置自检；② **"同一句答复被重复上屏"的回归**：假后端**仿真实 langgraph**（首快照 = 整份 state，含上一轮答复）返回 R1 长 / R2 短，断言**第二问的气泡是第二问的答复且不残留 R1**（旧实现在这里会停在第一句，见 T69）；③ **降级必须一眼可分辨**：面板带 `data-pet-chat-source`、台词走"接不上话"起头池、**连着两次不重样**、且不与真答复同形 | ✅（v1.34 / P5-1~P5-3 新增；v1.35 加 6 条 + 修 2 条假红口径；v1.36 挂上 R-PET-11 的 19 条；v1.37 加身份类禁自称 + 重复上屏回归 + 降级可分辨 3 条；**v1.41 给「身份类禁自称」与「降级可分辨」这两条加"降级感知路径"**（它们在脚本里的断言编号没有进 `prd.md` 的需求表，口径正文在 R-AGT-03 / R-PET-11）：**判据只落在"没降级的轮次"上，只有全部轮次都降级才记带原因的 SKIP**（v1.41 审查修复：原来是"任意一轮降级就整条 SKIP" —— 那会把"4 轮 live 全答对"降级成 SKIP，更坏的是把"4 轮 live 答坏了"的**真回归**变成 SKIP + exit 0）。**探测的信号恰好三类**：客户端降级（`data-pet-chat-source ≠ live` / 命中客户端 `FALLBACK_LEADS` 起头池）+ **后端降级哨兵**（测试侧常量 `BACKEND_DEGRADE_MARKERS`，关键词抄自 `reports/` 里实际出现过的后端降级原句）—— ⚠️ **后端换了降级文案时哨兵要跟着同步**，否则"后端连不上文章库"那几轮会重新被判成人设回归（假红，R39）。历轮这两条的假红（身份类 20 轮里红 4、降级可分辨红 1）都是"后端不可用时她答的是降级台词 / 后端降级话术"这个耦合，见 §14.3 T70 的同类教训） |
| `pnpm make:logo` | 从 `design/` 下两张设计源出图：**纸飞机** → 导航栏 Logo（webp，256×190）+ favicon **32px**；**人物插画** → favicon **128 / 180 / 192** + `src/assets/images/avatar/imiss-avatar.webp`（486×486，侧栏头像 / schema.org 用） | ✅（P1 新增；**v1.64 换源并拆成两套**：设计源从手写矢量 `imiss-logo.svg` 换成发起人给的两张位图，脚本改成「两张源 → 三组产物」） |

> **关于 `verify:ui` 的对比度检查**：主体走"token 级"校验（`--deep-text`/`--content-meta`/`--btn-content`/`--primary` 对卡片底/页面底），不是"扫全站文字元素"。
> 原因：这个主题里大量文字压在封面图、壁纸、半透明面板上，逐元素自动判定无法可靠取得背景色（试了三版：canvas 转色 → 逐层合成 → Node 侧解析，期间还产出过"66/71 元素低于 3:1"的假警报）。
> P2 曾补过两处**具体**的对比度断言（不依赖背景取色）：① 名次数字对名次底色（白字压粉底 ≥ 3:1、深字压橙底 ≥ 4.5:1）；② 缺图占位把渐变各档合成到不透明底色上取最亮值，与白字算对比度（暗/亮主题各一条）。**这两处都是排行专属判据，已随排行模块在 v1.41（Task 4）一并删除** —— 现在这一节只剩上面的 token 级校验。
> **v1.58 新补一处具体判据**（同样不依赖"扫全站文字元素"）：书签页每个卡片图标的**计算色**对**它自己那层图标块底色**（`.booknav-icon`，亮色 `zinc-100` / 深色 `zinc-800`）的对比度，深色下必须 ≥ 3:1。取色走真浏览器（`getComputedStyle`，`color-mix(in oklab, …)` 由 Chrome 自己算），判定走 Node 侧既有的 `parseCssColor` + WCAG `contrast()`（与本节 token 级校验同一套实现）。实测 27 个图标最低 3.24:1 / 最高 12.23:1。⚠️ 两个已登记的坑：① `text-neutral-700` 的 computed color 在**亮色**下是 `rgb(64,64,64)`、在**深色**下是 `oklch(0.371 0 none)` —— 同一个颜色两种字符串形态，判据必须**按解析后的 RGB 数值比**，比字符串会漏（注入验证实测：去掉某条的 `iconColor` 后，字符串比的那条断言照样绿）；② `.booknav-icon` 带 300ms 过渡，改完主题立刻读会拿到**插值中的颜色**（代码里根本不存在的值），所以深色那一趟是"先设 `prefers-color-scheme=dark` 再 `Page.navigate` 重载"，不是切类。
>
> 观感部分仍然是"**可复现的数字交给脚本，观感交给截图**"：脚本每轮输出 74 张截图并人工核对；另外把 `--hue` 在 345 与 165 之间切换做 A/B，证明"换色没让对比度变差"。

> **记账约定（v1.41 / R19 收口）：三份文档里的"当前口径"数字，一律只认 `reports/verify-ui.log` 的汇总行。**
> ① 这份日志由 `pnpm verify:ui:log --base <url>` 以 **UTF-8** 写出（`scripts/verify-ui-log.mjs`；用 PowerShell 的 `*>` 重定向会写成 UTF-16LE，读出来是乱码，见 **T58**）；
> ② `reports/sync-doc-counts.mjs` 是**辅助脚本，不在版本控制里**（整个 `reports/` 被 `.gitignore` 忽略），而且它**只覆盖"总数"**，够不到文档里那些括号内的分解 —— 所以**别再写"需要脚本同步才不漂移"的括号分解**（连"引述那个已经退休的分解"也算，见本段下文），要写就写成"不随轮次漂移"的说法：v1.41 把两处"对 `pnpm dev` 跑会少 N 条"后面那串**固定分解**删掉，换成了"少若干条（产物级检查不适用）"；
> ③ `verify-docs` 的计数闸门读的也是这份日志：候选文件名 **`verify*.log` 与 `_verify*.log`** 都认（按 mtime 取最新且含汇总行的那个）；**找不到基准日志时判 FAIL**，不再记一条 `pass=true` 的 INFO（见 **T77**）。
> ④ **功能断言的"总数"与 Agent 后端在不在无关（v1.62 起）**：`verify:ui` 里唯一探活真后端的地方只有 R-AGT 端到端②段那 4 格，而它们**后端没起时也照样注册**，只是记 ⏭️ SKIP —— 所以汇总行第一项（`功能断言 N 项`）**恒等于**本文档口径，后端在不在只影响"通过 / 跳过"的分解。⚠️ **这与"对 `pnpm dev` 跑会少若干条"是两件事**：dev 那几条少掉的是**产物级检查在 dev 下不适用**（`isDevServer` 那 5 处把 `dist/` 扫描、sitemap / llms.txt、pagefind 搜索、关闭页存根与真 404 判定换成**不计数的** `INFO(dev)` 记录），换掉的是**被测对象**（静态产物 ↔ 开发服务器），与后端在不在没有任何关系；`verify:docs` 的计数闸门读的是**静态产物那一轮**的日志（T73：复跑必须显式给 `--base`，别让 dev 那一轮进 `reports/verify-ui.log`）。

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
 │        └─ /api/agent/  → proxy_pass http://127.0.0.1:8787（P5-5 网关，SSE，禁用缓冲）
 │
 └─ （不对外）127.0.0.1:8787  Node 网关（server/pet-gateway.mjs，零依赖反代）
              127.0.0.1:2024  LangGraph Server（网关的上游）
```

### 12.2 `deploy/nginx.conf` 要点

> **v1.54（P6 上线预工）改口**：本节原来那份 `server{}` 是**示意稿**（只能看、不能装，且与 `deploy/nginx.conf`
> 的取值已经开始不一致 —— 例如它写着 `expires 1y` 而实现用 `add_header`、它没有 `gzip off`）。
> 现在**完整正文在 `deploy/nginx-site.conf`**（可直接 `cp` 到 `/etc/nginx/conf.d/` 后 `nginx -t`），
> 本节改成**要点摘录 + 与实现的对照**，不再维护第二份可安装的 `server{}`。
> ⚠️ **它从未在真机上跑过 `nginx -t`**（开发机没有 Nginx，B-01 未解除）—— 这点写在 `deploy/README.md` 开头。

```nginx
# 正文：deploy/nginx-site.conf（4 个占位符：__DOMAIN__ / __CERT_PATH__ / __WEB_ROOT__ / __SNIPPET_PATH__）
server {                                  # ① 80 端口：只做 301 跳转 + 放行 /.well-known/acme-challenge/
  listen 80; server_name __DOMAIN__ www.__DOMAIN__;
  location / { return 301 https://$host$request_uri; }
}
server {                                  # ② 443 端口：真正的站点
  listen 443 ssl http2;                   #    旧写法；nginx ≥ 1.25.1 会提示换成 `http2 on;`（不影响功能）
  server_name __DOMAIN__ www.__DOMAIN__;
  ssl_certificate __CERT_PATH__/fullchain.pem;
  ssl_certificate_key __CERT_PATH__/privkey.pem;
  root __WEB_ROOT__;  index index.html;  charset utf-8;  autoindex off;  server_tokens off;

  # 安全头最小集（每个自定义 location 里都重复一遍 —— nginx 的 add_header 是「就近覆盖」）
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
  add_header Cache-Control "no-cache" always;      # HTML 不缓存（回源校验，命中 304）
  # ⚠️ 不加 HSTS（发出去撤不回）、不加 CSP（内联脚本 + Pagefind wasm 会白屏）—— 理由与"以后怎么加"都写在文件里

  gzip on; gzip_comp_level 6; gzip_min_length 1024; gzip_vary on;
  gzip_types text/plain text/css text/xml application/javascript application/json
             application/xml image/svg+xml application/manifest+json application/wasm;
  # ⚠️ 不启用 brotli：需要 ngx_brotli 模块（发行版默认没编进去），写了会 nginx -t 直接报错

  location /_astro/  { add_header Cache-Control "public, max-age=31536000, immutable" always; }  # 带内容哈希
  location /assets/  { add_header Cache-Control "public, max-age=2592000" always; }              # 无哈希 → 30 天
  location /images/  { add_header Cache-Control "public, max-age=604800" always; }               # 文章配图 7 天
  location /og/      { add_header Cache-Control "public, max-age=604800" always; }               # OG 卡片 7 天
  location /pagefind/{ add_header Cache-Control "no-cache" always; }                             # 搜索索引：每次构建都变
  location /api/     { add_header Cache-Control "public, max-age=300, must-revalidate" always; } # 构建期导出的 json
  location ~ ^/(sitemap.*\.xml|robots\.txt|llms\.txt)$ { add_header Cache-Control "public, max-age=3600" always; }

  error_page 404 /404.html;                # dist/404.html 实测存在（单文件，239 421 字节）
  location = /404.html { internal; add_header Cache-Control "no-store" always; }

  # 已关闭的页面给「真 404」
  # 静态输出下 Astro 仍然产出 200 + meta refresh + noindex 的跳转存根（见 §14.3 T17），
  # 实测 **/bilibili/ 与 /bangumi/ 的存根文件还在产物里**，必须靠这几行掐掉；
  # /friends/ 与 /sponsor/ 的产物文件已随 v1.47 删除（这两行是保险）。
  location = /friends/  { return 404; }
  location = /bilibili/ { return 404; }
  location = /bangumi/  { return 404; }
  location = /sponsor/  { return 404; }
  # 存根里的 meta refresh 目标是 /404/（带斜杠），这个路径本身没有产物，一并给 404
  location = /404/      { return 404; }

  # ⚠️ 原「/rank/ → 301 /rank/jp/」的 location 已随排行模块删除（v1.41 / R-PATH-06）：
  #    `/rank/`、`/rank/jp/`、`/rank/cn/`、`/rank/game/` 四个地址**一律不做 301**，产物里也没有它们，
  #    由下面通用的 `try_files … =404` 返回真 404（verify:ui 的 R-PATH-06 用 `redirect: "manual"`
  #    按 404 断言 —— 这里再加任何跳转都会让它红）。

  # 隐藏文件 / 目录（.env / .git / 备份）一律不可访问（acme-challenge 除外）
  location ~ /\.(?!well-known/) { return 404; }

  location /api/agent/ {
    # ★ Agent 那一段的**唯一正文**在 deploy/nginx.conf（v1.45 / P5-5 落地；v1.54 补 `gzip off;`）
    #   它做五件事：转到网关 8787（不是 2024！）、关 proxy 缓冲与缓存、关 gzip、300 秒读/写超时、body 8k
    include __SNIPPET_PATH__;   # = deploy/nginx.conf，摘掉注释头就是这个片段
  }

  # trailingSlash: always → 每个路由都是目录 + index.html，不需要 SPA 回退
  # ⚠️ 顺序是 `$uri` → `$uri/index.html` → `=404`：`$uri/` 若排在前面，没有 index.html 的目录
  #    会退化成 **403 目录禁止**而不是 404；写成 `… /index.html` 回退则会把所有 404 变成首页 200。
  location / { try_files $uri $uri/index.html =404; }
}
```

> **为什么这里不照抄一遍 `location`**：`deploy/nginx.conf` 已经成为该段落的**唯一真相源**（P5-5 之前 ARCH 里这份 `server{}` 是唯一的文字，
> 而 `deploy/nginx.conf` 这个文件当时**根本不存在** —— 文件与文档各说各话的典型）。v1.54 起两处的关系是
> "`deploy/nginx-site.conf` 管**整个 server{}**（80 跳转 + 443 静态 + 关页 + 404 + 缓存/压缩/安全头），
> `deploy/nginx.conf` 管 **Agent 那一段**"，前者 `include` 后者（路径由 `__SNIPPET_PATH__` 决定）。
> ⚠️ 本节代码块是**要点摘录**，正文以 `deploy/nginx-site.conf` 为准（照抄两份必然漂移）。要点对照表：

| 要点 | 取值 | 为什么 |
| --- | --- | --- |
| `proxy_pass` 目标 | `http://127.0.0.1:8787/api/agent/` | **8787 是网关**（P5-5）；直连 2024 就绕过了所有闸门。**尾部斜杠要留**（路径原样透传，网关自己剥前缀） |
| `proxy_buffering off` + `proxy_cache off` | 必开 | SSE 被攒着不发 = 前端一个字都看不到（`verify:gateway` 的「不缓冲」那条就是钉它） |
| **`gzip off`**（v1.54 新增） | 必开 | **第二个独立的缓冲源**：完整配置里全局 `gzip on;`，而 gzip 过滤器要攒够 `gzip_min_length` 或一次 flush 才吐数据 —— 对 SSE 同样是"字卡在 Nginx 里"。`proxy_buffering off` 管不了它 |
| `proxy_read_timeout` / `proxy_send_timeout` | `300s` | 与前端 300 秒硬上限、网关 `PET_GATEWAY_ROUND_TIMEOUT_MS` 三处对齐（§8.10） |
| `proxy_http_version 1.1` + `proxy_set_header Connection ""` | 必开 | HTTP/1.0 会把流式连接变成短连接 |
| `chunked_transfer_encoding on` | 开 | 流式响应没有 `content-length`，靠 chunked |
| `X-Forwarded-For` / `X-Forwarded-Proto` / `Host` | 必开 | 网关侧要 **`PET_GATEWAY_TRUST_PROXY=1`** 才认 XFF（否则访客可伪造，见 §8.5）；反代后面**不开**则全站访客共用 `127.0.0.1` 一个限流桶（20 次/分） |
| `client_max_body_size 8k` | 与网关 8192 对齐 | 超了 Nginx 先回 413，不让大包进到网关 |
| Agent 段不写任何 `add_header` | 故意 | 网关自己对每个响应下了 `Cache-Control: no-store` / `no-cache, no-transform`；再叠一层会变成**两个 `Cache-Control` 头**，语义不可预期 |

### 12.3 发布流程

```powershell
pnpm verify:posts                              # 1) 内容校验不过就停
$env:PUBLIC_AGENT_BASE_URL = "/api/agent"      # 2) 构建期变量（同源反代）
pnpm build                                     # 3) 产出 dist/
node deploy/publish.mjs --server blog@<host> --web-root /var/www/imiss-blog/dist --dry-run   # 4) 先空跑看要执行什么
node deploy/publish.mjs --server blog@<host> --web-root /var/www/imiss-blog/dist             # 5) 真发
# 6) Nginx 无需 reload（纯静态覆盖）；改了 nginx 配置才需要 nginx -t && systemctl reload nginx
```

`deploy/publish.mjs`（**v1.55 由 v1.54 的 `publish.ps1` 改写而来 —— 为什么必须改写见 §14.3 T86**）做的十件事与它的安全闸门（参数名已同步成 CLI 形态；**退出码 0 = 成功 / 1 = 执行中失败 / 2 = 参数或安全闸门拒绝执行**）：

| 步骤 | 做什么 | 失败时怎么排查 |
| --- | --- | --- |
| ⓪ 参数闸门 | `--web-root` 为空 / 为 `/` / 为 `/etc` 等系统目录 / 不在白名单前缀（默认 `/var/www`,`/srv`,`/home`,`/data`,`/opt`）/ 含 `..` → **直接拒绝，一行命令都不执行** | 报错行会直接给出建议的 `--web-root-prefixes` 值 |
| ① 连通性 | `ssh … true`（`BatchMode=yes`，**只认密钥登录**，密码交互会立刻失败而不是挂住） | 先手工 `ssh -i <key> user@host true` |
| ② 构建 | `pnpm build`（`--skip-build` 跳过）；**失败立即中止，绝不上传半成品** | 看 pnpm 输出；`pnpm build` 全程不需要外网（R-DEP-04） |
| ③ 本地清点 | 文件数 / 总字节；并检查哨兵文件 `index.html` 与 `404.html` 在不在（不在就拒绝发布） | 本地 `dist/` 不完整 → 重新构建 |
| ④ 打包 | `tar -czf` 在 **`dist/` 里**打相对路径（Windows 自带 bsdtar ↔ Linux GNU tar 互认，实测往返 sha256 一致） | `tar` 不存在（老系统）→ 装 `bsdtar` 或用 WSL |
| ⑤ 上传 | `scp` 到 `/var/www/.imiss-publish/<时间戳>/`（**临时目录，不碰线上**） | 磁盘满 / 权限不足 |
| ⑥ 差异比对 | 远端 `sha256sum` 清单 vs 本地 `Get-FileHash` → 新增/修改、未变、远端多余（待删）三份名单 | 远端清单读不到（首次部署）→ 视为"全部新增" |
| ⑦ 生效 | 解包到临时目录 → 校验 `index.html` → 旧目录改名成 `<WebRoot>.releases/<时间戳>` → `cp -a` 落位 | 解包后缺 `index.html` 会在**改动线上目录之前**中止 |
| ⑧ 删除多余文件 | **逐条**校验路径（前缀白名单 + 无 `..`/引号/反斜杠），条数 > 200 要显式 `--allow-mass-delete` | 报错会列出前几条可疑路径 |
| ⑨ 校验 | 打印远端文件数 / 总字节 / 顶层目录 / 哨兵文件；与本地不一致会告警 | 差异常见于"上次残留孤儿文件" |
| ⑩ 回滚备份 | 保留最近 `--keep-releases`（默认 2）份 `<WebRoot>.releases/<时间戳>/`；回滚命令见 `deploy/README.md` §3 | — |

> ⚠️ `--skip-build` 会**自动降级为整包覆盖**并且**不删除远端任何文件**（本地 `dist/` 不保证是刚构建的完整产物，
> 拿它当基准算"远端多余"风险太大 —— 宁可不删，也不能误删）。
> ⚠️ **整条发布链路没有真机验证过**（没有服务器）：只验了**本机真实调用路径**的 `--help`、`--dry-run`（清点
> 799 文件 / 114.19 MiB、退出码 0）、安全闸门的拒绝用例（退出码 2）、tar 往返一致性。**第一次务必带 `--dry-run` 走一遍**。
> ⚠️ **v1.55 更正这里 v1.54 的说法**：v1.54 写的"只验了 PowerShell 语法解析（0 error）"是**用错方法量出来的** ——
> 那次用的是"按 UTF-8 解码成文本再 `ParseInput`"，而 PowerShell 5.1 真正跑脚本时按系统 ANSI（本机 CP936）读文件，
> 同一份文件实测 **40 条语法错误、调用时直接崩**。判据必须与真实消费者走同一条读取路径（§14.3 **T86**）。

**rsync 等价命令**（Linux/macOS 开发机以后要发同一台服务器时用这条；Windows 侧没有 rsync）：

```bash
rsync -az --delete --info=stats2 --exclude '.deploy-tmp/' -e "ssh -p 22" \
      dist/ blog@<host>:/var/www/imiss-blog/dist/
# ⚠️ `dist/` 结尾的斜杠不能省；`--delete` 会删掉目标目录里所有不在 dist/ 里的东西
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

**上线当天的冒烟清单**（v1.54 补；完整命令与期望输出在 `deploy/README.md` §2 第 8 步）：

| 检查 | 命令要点 | 期望 |
| --- | --- | --- |
| 首页 | `curl -sSI https://<域名>/` | `HTTP/2 200` |
| HTTP→HTTPS | `curl -sSI http://<域名>/` | `301` |
| 目录式路由 | `…/roadmap/` | `200` |
| 已删除的旧地址 | `…/rank/`、`…/rank/jp/` | `404`（**不是** 301） |
| 已关闭页面 | `…/bilibili/`、`…/friends/` | `404`（掐掉 noindex 存根） |
| 网关 | `…/__gw/health` | `200` JSON（生效的 `PET_*`，非密） |
| 上游（= 三段全通） | `…/api/agent/ok` | `200` `{"ok":true}` |
| **SSE 不缓冲** | 带时间戳跑一次 `runs/stream`，看首块时刻 | 首块在 **0.x~2 秒内**到达、块与块有时间差；**卡到最后一次性输出 = 有层在缓冲** |
| 压缩 | `curl -sSI -H 'Accept-Encoding: gzip' …/_astro/<css>` | `content-encoding: gzip`；而 `/api/agent/` **绝不能**是 gzip |
| 缓存头 | `…/_astro/<js>` / 首页 | `max-age=31536000, immutable` / `no-cache` |
| 搜索 | 浏览器搜一个只在文章里出现的词 | 有结果（`/pagefind/pagefind.js` 返回 200） |
| 无上游字样 | 抓首页正文喂给 `grep -ci '<上游主题名>'` | `0` |

> ⚠️ **以上全部没有真机验证过**（B-01 未解除：没有域名、没有服务器、开发机没装 Nginx）。
> 本轮（v1.54 / P6 预工）交付的是"参数化成品 + 操作单"，**未交付**的是这些命令的真实输出。

---

## 13. 性能预算与实施要点

| 项 | 预算 | 实施要点 |
| --- | --- | --- |
| 首屏视频 | ≤ 12MB | 原片直出；超预算则用 8Mbps 回文版；`saveData` 与 reduced-motion 不下载 |
| 首屏图片 | 单张 ≤ 400KB | webp q82、长边 ≤ 2560 |
| 桌宠图集 | ≤ 350KB | 单文件 + CSS 取帧，无逐帧请求 |
| 文章内图片 | 全量 ≤ 60MB | 已在源头压缩；`public` 直出，不进优化管线 |
| 学习路线页 | **页内 0 张图**（只有文字行） | 轻量行设计：标题 + 分类 + 时长，**不拉封面**（§5，零新素材）；页顶数字由 `render()` 实测的分钟数汇总 |
| JS 体积 | 不引入新运行时 | 桌宠与壁纸换图用原生 JS/Svelte 岛，不引第三方动画库。⚠️ **例外（已实测）**：`displaySettingsConfig.wallpaperModeSwitchable` 开启（R-ID-07，访客可切壁纸模式）会让**每页 HTML +11.6 KB**（38 页合计 +439.7 KB；`_astro/*.js` 总量无变化）——低于上游注释估的 +33 KB/页，但仍是每页都要付的代价 |
| 构建时间 | 全量内容 ≤ 10 分钟 | 文章图走 `public`；`src` 图片只保留壁纸 / Logo / 桌宠图集（排行配图已随模块删除） |
| 动画性能 | 只改 `transform`/`opacity` | 桌宠与樱花统一由 `requestAnimationFrame` 驱动；后台暂停 |

---

## 14. 风险、取舍与决策记录

### 14.1 风险登记

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 上游模板升级覆盖自定义 | 改动丢失 | 改动集中在 `src/config/*` 与**新增文件**；核心组件只做最小编辑（`SiteStats.astro`、`SiteInfo.astro`、`Layout.astro` 各一处） |
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
| D1 | 在上游模板上二次开发，不另起栈 | 继续用 `blog_test` 纯静态原型 | 模板已有内容集合、搜索、i18n、图片管线、壁纸与视频播放器；原型的价值是"已验证的做法"，不是运行时 |
| D2 | 排行数据放 TS 配置文件，只有一期 | CMS / 外部 API / 数据库 | 手工维护、主观排名、零后端；TS 有类型校验，改错立刻暴露。⚠️ **v1.41：这一条随排行模块废止**，但同一条思路被「学习路线」原样继承（数据同样放 TS 配置文件 `roadmapConfig.ts`、同样零后端，见 §5.3） |
| D3 | 文章内图片放 `public`，封面放 `src/assets` | 全部进 `src` | 142 篇的图片进优化管线会把构建时间拖长；封面/壁纸/榜单/桌宠量小，值得优化 |
| D4 | 桌宠挂在 Swup 容器之外常驻 | 每页各挂一次 | 避免切页重建带来的闪烁与位置丢失 |
| D5 | Agent 独立进程 + 网关，前端只用同源 `/api` | 直接在浏览器调 LLM | 密钥安全 + 可限流 + 可换模型；浏览器无法运行 Python 是硬约束 |
| D6 | Agent 首期用内存 checkpoint，不接 Postgres | Postgres / SQLite | 参考实现踩过 Windows `psycopg` 的坑；首期对话无持久化需求，等有需要再换 |
| D7 | 首期检索用关键词打分，不引向量库 | 向量检索 / 全文索引 | 142 篇文章规模下关键词足够；少一个依赖、少一份运维 |
| D8 | 页面移除只关入口，不物理删文件 | 删除组件与页面 | 降低回归风险；彻底清理作为独立任务评估 |
| D9 | 评论区先关闭但页面保留 | 直接删留言页 | 页面结构与导航一次到位，评论系统到位后只改一个配置 |
| D10 | 留言/评论与 Agent 解耦 | 用 Agent 当留言后端 | 两者目标不同（留言是异步公开记录，Agent 是实时对话）；耦合会让简单需求变复杂 |
| D11 | **人设「不许自称 AI，必须明确自己是爱弥斯」**（人设 v7，2026-09-27 发起人决定） | 保留 v6 的「被问是不是 AI 就诚实承认」 | **这是产品决定，由发起人拍板，不是技术偏好**：气泡里出现"我是 AI / 我是程序"会直接毁掉角色。**唯一保留、优先级更高的底线是不许越界到另一个方向**：不得宣称自己是真人、不得宣称自己是官方爱弥斯本人——否则就从"演得像"变成"给访客一个能截图打脸的硬伤"。落地只在后端人设文件（`agent/persona-aemeath-v7.txt` → `src/agent/common/persona.txt`），**契约与前端都不动**；验证是"真机问出来的字"（R-AGT 段身份类禁自称），不是"人设文件里写了什么" |
| D12 | **网关 = 本仓库的零依赖 Node 同源反代（`server/pet-gateway.mjs`，:8787），只做安全与转发，不翻译协议**（v1.45 / P5-5） | ① 设计稿：`agent_-for_-blog` 里的 FastAPI 网关 + 自定义协议 `POST /api/pet/chat`；② 不做网关，直连 2024，只在 Nginx 上限流 | ① 与 **R-AGT-06「不改 agent 仓库」** 直接冲突（翻译层只能写在后端）；② 直连形态下"CORS/鉴权/长度"没有落点，而 `langgraph dev` 实测 `ACAO: *`；③ **反代只要前端改一个 `baseUrl`**（构建期变量），契约 §8.9 一个字不用动；④ 零依赖 = 服务器上不需要 `npm install`、不需要 Python 侧改一行，且没有可被 `npm audit` 的供应链面。**代价照实说**：网关因此**不理解 SSE 语义**（不会把技术错误翻译成人设台词 —— 那仍然是前端 `agent-client.ts` 的职责，§8.6），也没有真正意义上的"鉴权"（§8.9.7 #3 仍开着） |
| D13 | **LangSmith 追踪保持现状：生产也全量追踪**（v1.45 补记，发起人 2026-09-28 拍板） | ① 生产关闭（`LANGSMITH_TRACING=false`）；② `LANGSMITH_HIDE_INPUTS` / `LANGSMITH_HIDE_OUTPUTS`；③ 自托管 LangSmith | 发起人选的 ① 的反面：**接受**把"人设全文（13 690 字符）+ 访客提问 + 库表结构 DDL + 实际 SQL 与结果行 + 她的答复"复制到第三方 `api.smith.langchain.com`、**保留 14 天**（实测一轮推荐点击 = 36 条 run / 171 642 字节，证据 `reports/_p54-trace-final.json`）。理由（按发起人的取舍如实记录）：**要能在线上出问题时看到 trace**，而"保留但隔离/自托管"都要额外的运维成本。⚠️ **这不是技术推荐，是知情后的取舍**；将来要翻案**不用改一行代码**，三个开关见 §8.9.7 #11（其中 `LANGSMITH_HIDE_*` 的两个开关**本项目尚未实测**，只能说成"候选"） |

### 14.3 模板已知陷阱（P0 起逐阶段实测清单，现有 91 条，编号连续 T1~T91：T1~T19 来自 P0/P1，T20~T26 来自 P2，T27~T29 来自 P3，T30~T33 来自 P3-9/P3-11，T34~T38 来自 P4，T39~T40 来自 R-PET-06，T41~T42 来自 R-PET-07，T43 来自 R-PET-08，T44 来自 R-PET-09，T45~T46 来自 R-PET-10，T47~T48 来自 P5-0 契约冻结，T49~T58 来自 P5-1~P5-3 接线，**T53/T54 于 v1.35 补登记**（这两条在 P5-1 就被引用过、但一直没进表），**T59~T63 来自 P5 独立复核修复**，**T64~T67 来自 R-PET-11 聊天框重做**，**T68~T70 来自 v1.37 人设 v7 与"重复上屏"修复**，**T71~T73 来自 v1.38 父级独立复跑**，**T74 来自 v1.39 文档纠偏**，**T75~T79 来自 v1.41（P2R 学习路线落地 / 排行移除）的实施与收尾**，**T80~T82 来自 v1.45（P5-5 网关）的实施与注入验证**，**T83~T84 来自 v1.46/v1.47 的 B-16**（B-16 于 v1.46 修复，这两条陷阱在 v1.47 的 P4-8 轮补登记进表 —— 完整取证见 `reports/_b16-report.md`），**T85 来自 v1.48 的 P4-8 收尾轮**，**T86 来自 v1.55 的 P6 预工复核**，**T87~T88 来自 v1.64 的正式标识与头像换装（纸飞机 + 人物插画）**，**T89 来自 v1.65 的 dev 排障（依赖预打包扫描器被注释里的标签字面量打崩）**，**T90 来自 v1.67 的手机端显示（内联 CSS 变量压住了媒体查询）**，**T91 来自 v1.70 的动态壁纸（补丁脚本的字符串吃掉了转义与定界符）**）

实现时按这张表走，不要凭"应该没问题"假设。每条都给了文件与行号，可当场复核。

| # | 陷阱 | 影响 | 应对 |
| --- | --- | --- | --- |
| T1 | `WidgetSpecificConfig` / `SiteInfoConfig` 的真身在 `src/types/sidebarConfig.ts:37-52`；`src/types/config.ts` 只是 re-export barrel | 改错文件不生效 | R-WDG-03 改 `sidebarConfig.ts` |
| T2 | `SiteStats.astro` 的数组项（`stat.id`）与脚本里的 `'[data-stat-id="…"]'` 是**字符串字面量解耦**；只删一边会留死代码，或让页面永久显示初始值 `0` | 改动不完整 | 删数组项与删脚本必须同时（R-WDG-01） |
| T3 | `src/config/siteConfig.ts:317` 的 `mal.clientId` **带一个前导制表符**，且是形如真实凭据的 32 位十六进制串（上游示例值）；`mal-utils.ts:67-68` 会把它**原样**塞进请求头（不 trim） | 安全｜疑似真实凭据随仓库分发 | P1 清空为 `""`（新增需求 R-ID-05）；同理清掉 VNDB / Bangumi / Bilibili 的示例 ID |
| T4 | `siteConfig.pages` 是单点开关，联动 5 处：导航过滤（`nav-menu-utils.ts:7`）、页面 404 重定向（如 `myanimelist.astro:20`）、sitemap（`astro.config.mjs:242-280`）、`llms.txt`（`llms.txt.ts:97`）、VNDB 封面脚本（`generate-vndb-covers.ts:101`） | 关一个页面会连带 5 处 | R-NAV-07 逐页核对 |
| T5 | `navbar-i18n.ts:11-34` 用**字面量中文名**当 key 做翻译映射（"文章"/"社交"/"我的"/"链接"…），未命中即原样输出；`VNDB`/`AnimeList` 被有意排除在映射外 | 改名后该菜单项失去多语言翻译 | 本站只用 `zh_CN`，可接受；将来加语言时要同步 `NAVBAR_DEFAULT_NAMES` |
| T6 | `nav-menu-utils.ts:19-23` 会让"只剩 1 个可用子项"的下拉组塌缩成单项 | 关页面后导航形态会变 | 我们的组都有 ≥2 个子项（文章 4 / 我的 7 / 链接 3），不受影响。⚠️ **v1.41 起第 3 格「学习路线」是单链接、根本不是"组"**（原「排行」组随 P2R 删除） |
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
| T18 | **首页横幅的 `links` 是"站点身份 / 打赏移除"的盲区**：R-NAV-06 只盯着导航与页面，但 `backgroundWallpaper.common.homeText.links` 里另有 4 条模板作者链接——GitHub（作者仓库）、Email（模板作者的邮箱，被 `rehype-email-protection` 编码成 base64 的 `data-encoded-email` 挂在**每一个页面**上）、**Sponsor（模板作者站点上的打赏入口）**、RSS | 按 R-NAV-06 验收不合格；且每个页面都夹带上游作者邮箱 | P1 审查时抓到并已清理（换成 RSS + Atom）；`scripts/verify-ui.mjs` 新增**渲染结果泄漏扫描**（对 `/`、`/about/`、`/guestbook/`、`/posts/*` 扫上游邮箱/ID/打赏链接/横幅标题，命中即失败），防止同类问题再溜过去 |
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
| T41 | **浮动组件的锚点会随"宠物形态"一起过期**：`openMenu(clientX, clientY)` 是 P3 贴地时代的写法（鼠标点贴地的宠物，坐标必然在视口底部附近，`top = max(10, y-8)` 往上挂就没事）。R-PET-06 引入三档之后（v1.59 起默认是落地的 `fixed`，但 `float` / `ground` 仍是可用档位、拖动也能把它放到任何高度），宠物可以停在**从视口顶到离地 48px 的任意高度**，"点宠物下半身"就能让 200px 高的菜单整块探出视口底（实测溢出 **118px**）。同一个菜单还**没写 `z-index`**，而模板里 `#wallpaper-wrapper` 是 10、`#content-panel` 是 30 —— 菜单被画在它们下面，只在两者都盖不到的地方露出来（发起人看到的就是"框跑到下面、还被裁掉一半"） | 弹出层位置错乱 + 被壁纸/正文面板遮住；**矩形断言全绿也发现不了**（看不见不等于不在） | 弹出层一律**按目标元素矩形**定位（这里用组件自己维护的 `pet.x/pet.y/w/h`，不读布局），上下/左右各按"放不下就换边"处理，四边再夹进视口；**必须显式给 `z-index`**（本组件取 `petConfig.zIndex + 1` = 67，仍低于浮动控件 1000）。断言除了矩形，还要用 **`document.elementFromPoint(菜单中心)` 命中菜单自己**这条"像素真话"兜底（§7.6 第 8 条） |
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
| T58 | **PowerShell 的 `*>` / `Out-File` 默认写 UTF-16LE，而下游脚本按 UTF-8 读；同一台 PowerShell 还会往"写文件"和"写提交信息"里塞 UTF-8 BOM** —— ① 重定向：`node scripts/verify-ui.mjs --base … *> reports/verify-p4.log` 之后，`reports/sync-doc-counts.mjs` 报「日志里读不到「功能断言 N 项」」，`read` 工具也会把它当成二进制文件拒读（P5-1 实测踩到，卡了同步文档那一步）；② **BOM（v1.51 合并进来，同一个病因）**：`Set-Content -Encoding UTF8` / `Out-File` / PowerShell 里 `echo … > 文件` 在某些版本下会给**文件**加 UTF-8 BOM（历史上污染过 `src/config/rankConfig.ts`、**三份文档整批一次**），而**同样的写法也污染过提交信息** —— 那次有 **4 个提交的主题行首字符是 U+FEFF**，`git log --oneline` 看着完全正常（终端里那个字符不可见），只有把 `%s` 取出来看字节（首三字节是不是 `EF BB BF` / 首字符是不是 U+FEFF）才发现 | 文档数字同步不了 → `verify:docs` 卡在"断言数与最近实测不符"；日志本身还是好的，容易误判成"脚本坏了"。BOM 更坏一层：①**文件**里表现为首行一个不可见字符（`git diff` 里几乎看不出来，`verify:docs` 第 11 项专门查它）；②**提交信息**里表现为**历史被污染** —— 主题行多一个 U+FEFF，任何按主题行做匹配的脚本/检索都会错位，而 `git log` 肉眼看不出来 | ① 需要 UTF-8 日志时用 **`pnpm verify:ui:log`**（`scripts/verify-ui-log.mjs`：用 `spawnSync(..., {encoding:"utf8"})` 收输出再显式 `fs.writeFileSync(..., "utf8")`，写 `reports/verify-ui.log`）；`sync-doc-counts.mjs` 也改成**优先读 `reports/verify-ui.log`**、回退阶段日志。⚠️ **v1.35 追加同源的第二条坑**：这个包装脚本**没有转发 `--base`** → `pnpm verify:ui:log --base http://localhost:4322` 实际打的是 `verify-ui.mjs` 的默认值 **4321**（dev 服务器 / 别人的 server）；**端口错了不报错**，只要那个端口有个能返回 200 的东西就会一路跑完，于是一份"本地 dev 服务器"的日志被当成"交付产物"的证据。现在没给 `--base` 就补 **4322**（preview 端口，§11 的收尾流程），并把转发参数打进日志头。**教训：包装 / 转发类脚本必须显式透传关键参数，并把自己实际用的值打出来**。② **v1.51 追加：写文件/写提交信息一律别用 PowerShell 的文本输出**（`Set-Content` / `Out-File` / `echo >`）。文件用编辑器或 Node 写；**提交信息用 `git commit -F <文件>`（文件本身由编辑器/Node 生成）或 `-m`，绝不用管道拼字符串**。已经污染了怎么修：`git filter-branch --msg-filter "node <绝对路径>/strip-msg-bom.mjs" <范围>`（本项目那个脚本是 `reports/_strip-msg-bom.mjs`：从 stdin 读消息、**只摘掉开头那一个 U+FEFF**、其余字节原样写到 stdout）——⚠️ 三个坑（**v1.51 在一个 `--no-hardlinks` 临时克隆里逐个实测过**，不是纸上推测）：**(a) 过滤器命令是在 filter-branch 的临时目录 `.git-rewrite/t/` 下执行的，不是仓库根目录** → 相对路径必然找不到脚本（实测报 `Cannot find module '…\clone\.git-rewrite\t\tools\strip-msg-bom.mjs'`），**必须给绝对路径**；而且命令是经 `sh`（Git for Windows 的 bash）递过去的，**Windows 反斜杠绝对路径会被吃掉所有分隔符**（实测报 `Cannot find module 'C:UsersHUAWEIAppData…'`）→ **要用正斜杠形态的绝对路径**（实测 `node C:/…/strip-msg-bom.mjs` 成功，改完主题行首三字节从 `239,187,191`（EF BB BF）变成 `116,101,115`（`tes`））；**(b) 它重写历史 → 被改的那条之后所有提交哈希全变**（别在已推送的分支上做）；**(c) 修完还要清 `refs/original/*` 与 reflog，否则旧提交仍可达、`U+FEFF` 还躺在仓库里**（本项目修完已确认 `git for-each-ref` 里没有 `original` 残留，当前 HEAD 三个提交主题首字节实测是 ASCII）。③ **⚠️ v1.56 补记：BOM 那道门的扫描面已从「扩展名白名单」换成「按内容判文本」**。`verify:docs` 第 11 项原来的判据是**扩展名白名单**（`.ts` / `.tsx` / `.js` / `.mjs` / `.astro` / `.svelte` / `.css` / `.json` / `.md` / `.yml` / `.yaml` / `.txt` / `.styl` 共 13 种后缀，大小写不敏感）—— 于是 **`.sh` / `.ps1` / `.conf` / `.service` / `.toml` / `.xml` / `.svg` / `.env` 与全部无扩展名文本文件**（`LICENSE` / `.gitignore` / `.gitattributes` / `.npmrc` / `.gitkeep`）**都不在扫描面内**；v1.55 实测「给 `deploy/publish.ps1` 加 BOM 之后 `pnpm verify:docs` 仍 15/15 全绿」就是这个缺口（见 T86）。**为什么选「按内容」而不是「补齐扩展名清单」**：白名单是**开放集合**，永远能再冒出一种没登记的扩展名（这个病本段已经犯过多次）；按内容判是**封闭判据**。新口径 = `git ls-files` **全量** → 逐个读**前 8KB** → **含 NUL 字节即视为二进制跳过**（与 `reports/_p48-census.mjs` 同一口径）→ 其余一律必须无 BOM。实测扫描面 **550 → 568** 个文本文件（本仓库 734 个受版本控制文件里 166 个判为二进制，全部是 png/jpg/woff2/webp/otf，**没有一个以 EF BB BF 开头**，故此判据不会误报）；**读失败一律判红**（不再 `continue` 静默放过）、`git ls-files` 本身跑不起来也**判红**（原来是记一条 `pass=true` 的 INFO，属 T77 同类「静默导致假绿」）。**破坏性验证（注入 → 判红 → 还原 → 回绿，两次都核对 sha256）**：给 `deploy/pet-gateway.service`（新纳入面）与 `deploy/README.md`（老的 `.md` 面）各注入一次 BOM，`pnpm verify:docs` 都判红并逐字点名（`命中 BOM 1 个：<文件>`），还原后回绿；另用一个临时受版本控制的**无扩展名**文件复验同类。检查项数**仍是 15**（只加宽第 11 项，不新增检查项） |
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
| T74 | **"跳过名单"被人当成待办清单 → 清掉它就会用旧内容覆盖新内容** —— `scripts/import-posts.mjs` 的 `SKIP_SOURCES` 里那两条（`AI应用/LangChain 能力详解.md`、`AI应用/LangGraph 能力详解 · 学习笔记.md`）从 2026-09-24 起被写成"暂不导入（缺图），**之后主动提醒**"，所以它读起来像一张**待办**。但真相是反的：那两篇后来**被重写成原创笔记并直接落在站点里**（提交 `7219018` → `8264d0d`），而**源目录那两份仍是缺图原版**（359KB / 398KB，引用 125 / 80 张不存在的 `page-*.png`）—— 也就是说**跳过名单在这一刻已经变成"保护措施"**：谁"顺手把待办清掉"再跑 `--write`，谁就会用缺图原版**覆盖掉站内的重写版**（而且 `verify:posts` 不会报错——缺图会被导入器转成 `> [!WARNING]` 占位，看起来"只是少了图"） | **静默地毁掉已经验收过的内容**：覆盖后文章还在、构建也绿、`verify:posts` 0 错误，只有正文和图一起变回原样（125 处缺图占位）。比"导入漏了"难查得多——因为它不留报错，只留下"怎么变回去了"的困惑 | ① 跳过名单的**每一条都要写清"为什么现在还必须跳过"**，而不是"以后要做什么"：这两条的理由已改成 `【已由重写版替代 · 勿导入】…导入会覆盖它`；② 源码注释里写明**"不许删"**并指向本条陷阱；③ 更一般的规矩：**任何"白名单/黑名单"都要区分"临时待办"与"长期护栏"** —— 待办会被人清理，护栏必须自己说明身份。回归方式：`node scripts/import-posts.mjs`（dry-run）后看 `reports/import-report.json` 的 `ignored[]` 里那两条是否仍在、理由是否正确 |
| T75 | **`pnpm lint` / `pnpm format` 会改写验收脚本自己的源码** —— 这两条不是"只针对 `src/`"（旧说法与 `package.json` 不符），实际是 `biome check --write ./src ./scripts` / `biome format --write ./src ./scripts`。它把 `scripts/verify-ui.mjs` 里 **CDP 模板字符串中的正则**"顺手美化"了：`/rgba?\(([^)]+)\)/` → `/rgba?(([^)]+))/` —— **语义已经变了**（捕获组从"括号里的内容"变成"整个匹配"），还顺带重排了 ~19 个无关文件、1761 行 | **静默改坏验收脚本本身**（断言可能从此量错东西，而报告照旧全绿），同时制造一个 1700+ 行的无关 diff，把真实改动淹掉。Task 2 实测踩到，已完整回滚 | ① **本项目不要跑这两个脚本**（`README.md` 的命令表、`CLAUDE.md` / `AGENTS.md` 都已写明）；② 要保格式只对**动过的文件**跑 `npx biome check <files>`；③ 任何"格式化/自动修复"跑完，必须 `git diff` 看一遍 `scripts/` —— 它改的可能是判据本身 |
| T76 | **`COLLECT` 是模板字符串：连注释里的反引号都会提前闭合它** —— `scripts/verify-ui.mjs` 里浏览器侧代码（`COLLECT`）整体是一个反引号模板字符串，所以在**注释里**写一个反引号（例如想引用某个类名/变量名）就会把模板提前结束 → 当场 `SyntaxError` | 脚本直接跑不起来（这一点还算响亮）；**更坏的是反引号成对出现时**：模板被切成两半、中间的代码变成字符串/语法错位，症状会出现在离改动很远的地方 | 在 `COLLECT` 内部（**包括注释**）**不许出现反引号** —— 要引用标识符就写纯文本。**同一坑两次独立踩到**（Task 2 的注释、Task 5 的注释）；改完先 `node --check scripts/verify-ui.mjs` |
| T77 | **文件名不匹配 → 读旧日志 → 计数闸门静默失效** —— `verify-docs` 的"断言数与最近实测一致"从 `reports/` 里挑候选日志，过滤是 `^verify.*\.log$`；某一轮把实测落成了 `reports/_verify-task2-green.log`（**下划线开头，不匹配**）→ 闸门回退去读**停更的旧日志** → 输出 `257 == 257 ✅`，而真实值已经是 **263** | 文档计数闸门**看起来在查、其实查的是过期数字**：新加的断言（或删掉的断言）永远不会让文档红，漂移一路带到收工 | ① 候选过滤**同时接受 `_verify*.log`**；② **找不到基准日志必须响亮报错**（原来是一条 `pass=true` 的 INFO —— "闸门没读到基准"与"一切正常"长得一模一样）；③ 通则：**任何"按文件名挑输入"的闸门都要问一句"挑不到会怎样"**。v1.41 已在 `scripts/verify-docs.mjs` 里实施 ①② |
| T78 | **验证用的"注入器"自己必须先被验证** —— 某轮为了证明"某条判据真的会红"，写了个把标记注入文件的脚本；它把**多行 LF 标记**写进一个 **CRLF** 的 `.cjs`，于是注入后的 `includes()` 判定**恒为 false** → **注入根本没生效**，而校验脚本照旧报 `✅`（**假绿**），差点被当成"注入证明"写进报告 | 一个"证明判据有效"的实验，自己先把判据架空了 —— 于是"已用注入验证过"这句话变成**没有证据的断言**。这类假绿比不加验证更坏 | ① 注入后**先断言注入成功**（用 `[\s\S]` 这类跨行正则匹配，别用受行尾影响的 `includes`）；② 注入器要有硬闸门：**`next === src` 就 `exit 2`**（没变就是没注入）；③ 判据的注入实验必须"先红后绿"两次都记录原始输出 |
| T79 | **mobile 模拟下 `documentElement.scrollWidth − window.innerWidth` 的差值恒为 0** —— CDP 的设备模拟里 `window.innerWidth` **会随内容一起涨**（视口 390 → 实测涨到 1200），于是"有没有横向溢出"的判据**永远算不出红** | 一条看似标准的移动端溢出断言**永远不会失败**：页面真的溢出时它也报 ✅（假绿），而这种错只有"手工注入一个溢出元素"才会暴露 | 正确口径是 **`documentElement.scrollWidth − documentElement.clientWidth`**（`clientWidth` 不随内容涨）。实测同一注入态：**旧差法 0 / 新差法 810**。回归断言：`verify:ui` 的 R-PATH「390px 无横向溢出」（v1.41 已按新口径改） |
| T80 | **安全闸门只认一种载荷形状 → 真正的客户端根本不经过它** —— 网关的消息长度闸门按 `input.messages[*]` 里 `role === "user"` 找"用户那句"。但**前端适配层发的是 `{type:"human", content}`**（LangGraph 的另一种写法，§8.9.2 的契约形状）：只认 `role:"user"` 的话，闸门**在真机上一次都不会触发**，只在测试里（手写成 `role:"user"`）生效 —— 也就是"安全边界变成了装饰" | 与 P5-4 那次 13 690 字人设外泄的假绿**同一个病**：实测口径与真实载荷形状不一致，于是"验过了"是空的。更坏的是它**双向都能骗人**：测试全绿（因为测试自己按判据的形状造数据），线上等于没拦 | ① 闸门要**同时认两种形状**（`role:"user"` **或** `type:"human"`，`content` 是字符串**或** `[{type:"text",text}]` 分片数组）—— 本仓库 `lastUserMessageText()` 就是这么写的；② 回归断言**必须拿"真前端发的那个形状"各测一遍**（`verify:gateway` 的「形状覆盖」两条：`type:"human"` 与分片数组）；③ 通则：**写"按形状取值"的判据时，先去抓一次真实流量，别照着自己脑子里的形状写** |
| T81 | **对请求流用 `for await (… of req) { … break }` 会把 socket 一起 destroy → 精心构造的 413 变成 ECONNRESET** —— 网关的请求体上限要"边读边判、超了立刻停"，最自然的写法是 `for await (const c of req) { if (n > cap) break; }`。但 Node 的 `Readable` 异步迭代器在**提前退出**（break/return/throw）时会 `stream.destroy()`，而 `req` 的 destroy 就是**把这条连接掐掉** —— 客户端拿到的是 `socket hang up`，**根本读不到那 413 的 JSON**（判据看起来"实现了"，实际是"返回了但对方永远看不见"） | 症状具有误导性：脚本里若只断言"超限被拒"（比如只看"连不上/报错"），它甚至会绿；真机上表现为"发大包就直接断网"，用户与排查者都会往网络层想。**同类风险**：任何"读一半就停"的中间层（限流器、流式解析器、上传闸门） | ① 读请求体**用事件式 + `req.pause()`**：`req.on("data")` 里累加，超限就 `pause()` 并**立刻**把 413 写出去（剩下的字节留在内核缓冲里，连接照常收尾）；② 真要 `break`，就别指望还能往这条连接写东西；③ 回归断言必须**真的把 413 的 body 读出来**（`verify:gateway` 实测 `{"error":"body_too_large"}`，不是"连接出错了就算通过"）。⚠️ 注意 `for await` 读**响应**流（`upstreamRes`）没有这个问题：循环正常走完（`done`）不会调 `return()`，只有提前 `break` 才会 |
| T82 | **响应收口挂在两处，任何"改变写出时机"的改动都会变成静默空响应** —— `server/pet-gateway.mjs` 的转发路径有**两条**收口来源：上游 `end` 事件（`upstreamRes.on("end", finishUp)`）与管道读完（`pipeChunked(...).then(finishUp)`），谁先到谁 `res.end()`。注入实验里把"逐 chunk 转发"改成"攒完整段再发"之后，**上游 `end` 先到 → 响应被 `res.end()` 收掉 → 之后那些 `res.write()` 全部落在已结束的响应上，客户端拿到 200 + 空 body**，而服务端**一行错都不报** | 这是最坏的一类：**不报错、不抛异常，只是内容没了**。本仓库在 v1.45 的注入验证里真的踩到（第一次注入 C 时 10 条断言红，其中 `GET /api/agent/ok` 返回 `200 null`）；如果当时没有"断言真的读 body"，它会以"透传成功"的样子混过去 | ① 改这条路径时**先问"现在是谁在什么时候 `res.end()`"**，两条收口路径要留**唯一**的语义（本项目保留"逐 chunk 写 + 上游结束即收口"）；② 任何"攒着再发"的实现都必须**同时**接管收口时机（注入 C 的最终版本就顺手摘掉了 `end` 那条）；③ 通用判据：**断言必须读响应体内容**（`verify:gateway` 的每一条都断言 body/headers，不是只看状态码）—— 只看状态码的话，"200 + 空 body"永远抓不到 |
| T83 | **`@swup/astro` 只转发 6 个选项给 `new Swup()` —— 没被转发的选项"写了等于没写"，而且 `ignore` 数组只能放一个元素** —— `@swup/astro` 1.8.0 的 `buildInitScript()` **只**把 `ignoreVisit / animationSelector / containers / cache / native / plugins` 六个选项传给 `new Swup()`，其余同名选项**全部丢弃**。旧配置里的 `skipPopStateHandling: (e) => e.state?.url?.includes("#")` 因此**从来没生效过** —— 构建产物 `dist/_astro/page.*.js` 里 `skipPopStateHandling` 出现 **0** 次（修复前与修复后都是 0），一直没人发现。第二半：`ignore` 的 reviver（`deserialise()`）会把"**长度 2 且第 2 项是字符串**"的数组当成 `[:regex:, …]` 标记拆掉 —— 实测 `['a','b']` 反序列化后**只剩 `"b"`**，豁免**静默失效**。同类未转发选项还有 `resolveUrl` / `animateHistoryBrowsing` / `linkSelector`（只是它们的值恰好等于 Swup 默认值，才没有可观察差异） | 这是"配置看起来写了、行为上根本不存在"的假安全感 —— 比报错难查得多：**没有任何警告、没有任何报错**，读源码才看得出来。风险双向：以为加了一道闸门（其实没有），或者以为改了行为（其实没改）。`ignore` 那一半更阴：**写两个选择器时第一个被悄悄吃掉**，看起来"配了"，实际只豁免了一个 | ① **可验证手段：改完在构建产物里 grep 该选项的字面量** —— `dist/_astro/*.js` 里搜 `skipPopStateHandling` / `ignoreVisit` 等，**出现 0 次就说明它没进实例**（本项目就是这么定案的）；② `ignore` **数组只放一个元素**（本项目：`['a[href^="#"]:not([href="#"])']`），要豁免多个形态就写进**同一个选择器**（逗号分隔或 `:not()`），别用数组第二项；③ 想用上游没转发的选项时，先读 `@swup/astro` 的 `buildInitScript()` 白名单，再决定是"改走支持的入口"还是"自己 `new Swup()`" |
| T84 | **Swup 4.9.2 对"同页锚点"走自己的 `link:anchor` 分支 → 点击不写历史，按一次「后退」直接离开该页；而判据不能只看 `location.hash`** —— `handleLinkClick()` 对同页锚点（`to === from` 且带 hash）执行 `hooks.callSync("link:anchor", …)`，里面调 `updateHistoryRecord()` = **`window.history.replaceState()`**（不是 `pushState`）。于是**URL 会变、也会滚到位**，但**永远不产生历史记录**。真机探针实测（`reports/_b16-probe*.{mjs,json,log}`）：文章页标题锚点 `history.length` **4 → 4**、侧栏目录项 **6 → 6**、390px **12 → 12**，点完按一次「后退」**全部落到 `/`（离开了该页）** | **判据陷阱比 bug 本身更值得记**：`location.hash` 变了、`window.scrollY` 也对了 —— 只断言这两项的话，**这条断言在坏掉的实现上照样全绿**。唯一能判出真假的是 **`history.length` 的差值**（以及后退后的落点）。另一个方向也反直觉：「后退会重渲染整页」这个常见猜测在真机上**不成立**（Swup `visit:start` 计数 0、JS 上下文与容器首个子节点都没变） | ① **回归断言**：`pnpm verify:ui` 的 **10 条 `R-NAV-08`**（`scripts/verify-ui.mjs` 末尾的 B-16 块）—— 含**点侧栏目录项 / 点正文标题锚点各自"`history.length` +1"**、**其后按「后退」留在本页 + hash 清空 + 不重渲染**、全程无整页导航、`/roadmap/` 的 8 个 `data-no-swup` 锚点仍进历史、**裸 `href="#"` 占位不在豁免内**、以及 **390px 浮层的两条边界**（锚点仍进历史 + 浮层不被误关；裸 `#` 仍是 Swup 拦下）；② 修法：`astro.config.mjs` 用 `ignore: ['a[href^="#"]:not([href="#"])']` 把这类点击**整个交回浏览器原生**，并删掉 `src/utils/toc-utils.ts` 里 `TOCManager` 自己的 `preventDefault()` + 手动 `window.scrollTo()`（**只豁免 Swup 而不动它会更糟**：URL 里连 hash 都不写，见 `reports/_b16-report.md` 探针 Q1）；③ `:not([href="#"])` **不能省** —— 裸 `#` 占位被豁免后会变成原生 `#` 跳转（URL 尾巴多一个 `#`、白多一条历史记录） |
| T85 | **"删干净了"的判据，扫描面必须等于「产物全集」—— 只扫 `*.html`、或只扫"可见文本"，都会漏掉随产物发布出去的非 HTML 静态文件；同一病因的另一半是"解释自己删干净了"的那段话本身会被发布（模板 HTML 注释被 Astro 原样打进产物）** —— v1.47（P4-8）的第一版，把"为什么删掉上游署名"的理由写成了 `src/components/layout/Footer.astro` **模板区**里的 `<!-- … -->`。Astro 会把模板里的 HTML 注释**原样**写进 `dist/**/*.html`，而页脚是每个页面都渲染的组件 —— 于是那段解释里的**上游主题名 / 作者名**出现在**全站 162 个 HTML** 里。**第二次（v1.48 查出、v1.49 清掉）：扫描面当时只有 `dist/**/*.html`（165 个），而产物是 `799` 个文件** —— `dist/assets/css/twikoo-custom.css` 顶部的上游署名行（原文见 `git show 1e5ea99:public/assets/css/twikoo-custom.css`，源文件同一行的 `:4`）**既不进 HTML、页面上也永远看不见**（`commentConfig.type: "none"`，这条 CSS 根本没人加载），就这么**随产物发布了一整轮**，而零残留断言一路全绿 | 这是"清理动作自己制造残留"的典型：注意力全在"源码里还有没有那个字符串"，没人想到**解释文字本身就是会被发布的内容**。而且它**只在产物里显形**：源码里 grep 上游主题名只会命中那段"解释"，读起来完全是一条正常的注释，**读代码永远看不出来**。`Footer.astro` 每页都渲染，一处注释 = 全站 162 份 —— 规模被组件复用放大。第二次那半更"安静"：**非 HTML 产物在浏览器里永远看不见**，它躺在 `dist/assets/` 里等访客的浏览器来取 —— 只要判据不问"发布出去的东西一共有哪些"，它就能一直绿下去 | ① 这类解释写在 **frontmatter / JS 注释**里（不随产物发布），**不要**写在模板 HTML 注释里 —— 本项目就是这么改的（`Footer.astro` frontmatter 顶部那段注释，并明确写了"必须留在 frontmatter"）；② **判据的扫描面 = 产物全集，不是"页面集合"**：`dist/**` 的**每一个文件**（HTML / CSS / JS / JSON / sitemap / `llms.txt` / pagefind / robots…）**加上文件名与路径本身**（`<上游主题名>-*.png` 这类"内容干净、只有名字里带"的存活方式，只有查路径才抓得到；逐字判据见 `scripts/verify-ui.mjs`）。`verify:ui` 的 `R-ID-05/R-NAV-06` 从 v1.49 起按这个口径扫，并**另记一条**「产物文件名/路径不含上游字样」；"剥掉 `<script>`/`<style>`/HTML 注释之后的可见文本"那一层（第④层）**保留但只能当补充** —— 它抓不到 CSS 文件、也抓不到 HTML 注释（第①②层才是主判据）；③ **二进制怎么算"扫过了"**：读文件，**含 NUL 字节即视为二进制** → 跳过其**内容**、**文件名/路径照查**，并把"内容可读 N / 跳过二进制 M"写进**通过文案**（跳过面必须可见，否则"跳过一大批"会退化成"扫了个空"，同类见 T77）；再加一条反向保险：**可读文本文件数为 0 直接判红**；④ 一条可复用的自检：**改完把产物当数据集查一遍** —— `dist/**` 全部文件的内容 + **`ls` 一遍文件名**，别只 grep 源码、也别只 grep HTML；⑤ 同源推论：**"页面上看不见"不等于"没发布"** —— 关掉的组件、没人加载的 CSS、构建期原样复制过来的静态文件，全都在发布面上。⚠️ **v1.64 又踩到一次**：改 `Profile.astro` 去掉头像悬停图标时，把"为什么删"的说明写成了**模板里的 `<!-- -->` 注释**，里面自然带着图标名 → `dist/index.html` 里真的多出**两处**（浅/深两套侧栏各一份）。**修法**：说明挪进 **frontmatter** 注释（构建期用、不进产物），并给压暗层加一个 `profile-avatar-veil` 钩子；同时在 `verify:ui` 里加了一条**产物级**判据（`dist/**` 全量内容里搜不到那个图标名）—— 只查 DOM 是拦不住"名字跟着注释回来了"的 |
| T86 | **Windows PowerShell 5.1 按系统 ANSI/GBK 读无 BOM 的 `.ps1`：含中文的脚本在"被调用时"成片语法崩、报错文本本身还是乱码**；而更值得记的是**判据陷阱** —— `ReadAllBytes + UTF8.GetString + Parser::ParseInput` 这类"先解码再解析"的检查**永远发现不了它** —— v1.54 交付的 `deploy/publish.ps1`（28 888 字节，其中 **13 366 字节非 ASCII**，满篇中文注释，**无 BOM**，首 3 字节 `60,35,10`）在 v1.55 的 P6 预工复核里被**真实调用路径**抓出来：`[Parser]::ParseFile(<真实路径>)` 报 **40 条语法错误**（第一条 `:181 MissingFileSpecification` + `RedirectionNotSupported` —— `:181` 正是 `Say ("$ ssh " + … + " bash -s   <<'EOF'")` 那行，`<<` 被判成重定向操作符），而直接 `& .\deploy\publish.ps1 -Server … -WebRoot … -DryRun` **在调用瞬间就 ParserError**，报错文本里的中文全是乱码（`涓婁紶锛氬帇缂╁寘` ＝ UTF-8 的「上传：压缩包」被当 GBK 读）。**机制（用 .NET 的 CP936 解码器逐字节实测）**：本机 `[Encoding]::Default` = **936 / GB2312**；UTF-8 里一个中文字 3 字节，GBK 眼里是"1 个双字节字 + 1 个落单字节"，落单字节（0x80–0xBF）又会与紧跟其后的那个字节拼成"另一个合法的 GBK 字" → 字节流从第一个中文起**整体错位**：实测 **52 个换行、41 个 `"`、1 个 `'`、18 个 `*`、11 个 `-`、7 个 `$`、6 个 `/`、5 个反引号、2 个 `{`、131 个空格**被当成"双字节字的第二字节"吞掉（第一个吞噬点在偏移 116：`0x82 + 0x0A`），于是 561 行的文件在 PowerShell 眼里只剩 **510 行** —— 一条注释把下一行的 `function Invoke-RemoteBash {` 吃进了自己行内，引号配对随之崩掉，`<<'EOF'` 就落到字符串外面了。**同一份字节加 3 字节 BOM → `ParseFile` 0 error 且 `--dry-run` 真跑通（清点 799 文件 / 114.19 MiB、退出码 0）；同一份内容把非 ASCII 全换成 `?`（纯 ASCII）→ `ParseFile` 也是 0 error** —— 所以坏的不是脚本逻辑，是"文件编码 + 读取方按什么编码读"这个契约 | ① 这类坑**只在"真跑"时出现**，任何"读进来自己解码再解析"的检查都量不到它：上一轮用的正是 `ReadAllBytes + UTF8.GetString + Parser::ParseInput`，同一份文件它报 **0 error**（`ParseInput=0 / ParseFile=40` 的对照），于是"语法零错误"被写进了文档与状态表 —— **判据错了，结论就跟着错一整轮**。② 报错文本本身是乱码，最容易被误读成"脚本写错了 / 中文注释里有非法字符"，于是跑去改逻辑 —— 真正该改的是编码契约。③ 波及面比"一条命令跑不起来"更大：这份脚本是 P6 的发布通道，**离线怎么检查都看不出来**，上线当天才会炸 | ① **面向 Windows 交付的脚本优先用 Node**（本项目已要求 Node ≥ 22，Node 读源码一律按 UTF-8，与 BOM 无关）—— 本轮的修法就是把 `deploy/publish.ps1` 改写成零依赖的 `deploy/publish.mjs` 并删掉 `.ps1`（能力与安全闸门逐条保留，另加 `--help`）。② 若必须用 `.ps1`：**内容保持纯 ASCII**（实测 0 error），或**带 BOM**（实测 0 error 且能跑）—— 但**别指望 `verify:docs` 第 11 项替你兜住**：那道门只扫 `.ts/tsx/js/mjs/astro/svelte/css/json/md/yml/yaml/txt/styl`，**`.ps1` / `.sh` / `.conf` / `.service` 都不在名单里**，本轮实测"给 `deploy/publish.ps1` 加 BOM"之后 `pnpm verify:docs` 仍然 **15/15 全绿**（也就是说这条路上没有任何机器闸门，"不写中文"全靠人记）—— ⚠️ **v1.56 已把这台机器闸门补上**：第 11 项改成按内容判文本后，`.ps1` / `.sh` / `.conf` / `.service` 与无扩展名文件**都在扫描面内**，同一个注入态现在会判红并逐字点名（细节见 T58 的 ③）。③ 通用判据：**"语法检查通过" ≠ "能跑" —— 检查器必须和真实消费者走同一条读取路径**（能直接调用就直接调用，退一步至少也要用 `ParseFile` 让解析器按文件真实编码自己读，而不是自己解码后再喂 `ParseInput`）。④ 反向自查：任何"我验过了"的结论，都要能说清**消费者是谁、它按什么编码 / 什么解析器读**（与 T58 同源：一边写、一边读，两边对不上就出事） |
| T87 | **带 `srcset` 的 `<img>`，`naturalWidth`/`naturalHeight` 报的不是资源像素数，而是"密度校正后的 CSS 像素"**：`Navbar.astro` 的 Logo `<img>` 由 Astro 图片管线生成 `srcset="… 28w, … 56w"` 而**没有 `sizes`**（规范缺省 = `100vw`）→ 密度 = 描述符 ÷ 视口宽，于是 56×42 的那张图在 1440 视口下量出来是 **1440×1080 = 视口尺寸本身**（看着像"图根本没加载"）。v1.64 写新断言时先拿到的就是这个数，`complete=true` 与 `await img.decode()` **前后都是它**（真机取证 `reports/_logo-navbar-probe.mjs`） | ① 把 `naturalWidth` 当"资源像素尺寸"用会得到**绝对值错误**的结果（本例 1440×1080 ≠ 56×42），据此写的判据会莫名其妙地恒真或恒假；② 但**比例是对的**（密度对宽高同乘一个数）—— 所以"宽高比"类判据可以用它，"像素数 / 真实尺寸"类判据必须换手段；③ 反过来说，`width`/`height` **属性**（Astro 从源图元数据写的固有尺寸）在 `srcset` 场景下比 `naturalWidth` 更贴近"资源本体多大" | ① 要比**比例** → `naturalWidth/naturalHeight` 可用（v1.64 的"导航栏 Logo ≈1.35:1"就是这么写的，并在详情里注明绝对值随视口）；② 要比**真实像素** → 在真浏览器里 `Image + canvas` 读像素（v1.64 那两条 favicon 判据），或读磁盘 / HTTP 回来的字节自己解 PNG 头；③ 想知道资源本体尺寸 → 看 `currentSrc` 指到的那张文件，别看属性；④ 断言详情里**把这件事写出来**，免得下一个人看到 `1440×1080` 以为是 logo 变大了 |
| T88 | **块注释里直接写 glob 通配串会提前闭合注释**：`/** … **/*.png … */` 这段里 `**` 紧跟 `/` 就凑出了 `*/` —— 注释在那一行**当场结束**，后面的中文说明变成代码，脚本报 `SyntaxError: Unexpected token '*'`。v1.64 改 `scripts/make-logo.mjs` 的头部注释时踩到（**同一段文字在上一个版本里也存在**，只是那一版改完没再跑过这个脚本，所以一直没暴露 —— 直到这轮真的执行它才炸） | ① 脚本"看起来只是改了注释"，实际整个文件语法坏了；② 更阴的是**它可能潜伏一整轮**：写完没跑就以为没事（本轮就是上一轮埋下的）；③ 与 T9（正则 `<script([^>]*)>` 里的 `>`）、T76（模板字符串里的反引号）同源 —— 都是"注释/字符串里出现定界符" | ① 注释里**别写通配串**：改写成"`src/` 下的全部图片扩展名（`../../` 起头的通配）"这类描述；非要写就把 `*/` 打断（写成 `* /` 或拆两截拼接）；② **改完脚本必须真跑一次**（`node scripts/make-logo.mjs`），别只靠"我只动了注释"（T86 的同一条教训：判据必须走真实消费路径）；③ 提交前 `node --check <file>` 做一次语法体检（零成本）。⚠️ **v1.65 当天第二次复发**：这次是把"模板注释会进产物"写成说明时，**在块注释正文里写出了注释的起止定界符**（`/* … */` 那一对），Astro 编译器当场 `Unexpected token`（`AemeathPet.astro:60`）—— 与 T88 的原案例同一个病：**注释正文里出现定界符 = 注释提前结束**。写文档性注释时把定界符描述成"那对符号"，别照抄 |
| T89 | **`.astro` 的注释里写出 `<script` 字面量，会把 Vite 8 的依赖预打包扫描器打崩**：v1.65 排障（发起人报 `pnpm dev` 起不来、抛 `transport invoke timed out after 60000ms … fetchModule`）时从 dev 日志里挖出来的真因 —— 日志里有一行被埋掉的 `[ERROR] [vite] (!) Failed to run dependency scan. **Skipping dependency pre-bundling**`，其下 4 条 `PARSE_ERROR` 指向 `WallpaperSection.astro?id=0` 与 `AemeathPet.astro?id=0`，代码帧逐字就是**注释里的中文**：「` 里的 ${} 不会被 Astro 求值，」与「 里——」。机制：rolldown 的 scan 把 .astro 按 `<script>` 切块后当 JS 解析 —— **它不认注释**，注释里那句"内联 script 标签"（尖括号 + script）被当成真的脚本块开始标记，紧跟其后的中文散文就被当 JS 解析，于是报 `Invalid Character` / `Expected a semicolon`。**依赖预打包整轮被跳过** → 模块请求全走未优化的裸 ESM → 服务端模块 runner 的 `fetchModule` 卡到 60 秒硬超时（**发起人看到的是超时，真因在扫描阶段**）。三处命中：`WallpaperSection.astro`（frontmatter 注释）、`AemeathPet.astro`（frontmatter 注释）、`SiteStats.astro`（frontmatter 注释），另有一处 `WallpaperSection.astro` 内联脚本里的 JS 行注释（同形，一并改掉） | ① dev **起得来但模块全走裸 ESM**，症状是"随机某个模块请求超时/页面卡住"，而不是"启动即报错" —— 只看终端那条 timeout 会一直查错方向（本轮先误判成"内存不足 + 缓存陈旧"，清了 `.astro` / `node_modules/.vite` 都没用）；② 这类错误**只在依赖预打包被触发时**出现（缓存有效时那条 `[ERROR]` 根本不打印），所以它可能潜伏很久；③ 与 T9（`minify-inline-scripts` 的正则 `<script([^>]*)>`）、T85（模板注释进产物）、T76/T88（注释/字符串里出现定界符）同源 —— **都是"扫描/解析器不认注释"** | ① `.astro` 的注释里**不要出现 `<script` 这三个字符的组合**（写"内联 script 标签"或"那个标签"）；② 排 dev 卡顿**先翻 dev 日志找 `Failed to run dependency scan`**，别急着清缓存；③ 想快速判定：`pnpm exec astro dev` 后 grep 日志里有没有 `Skipping dependency pre-bundling`，有就是这一类；④ 修完直接重启 dev 复验（本轮实测：修复后 `ready in 5.7 s`、`PARSE_ERROR 0`、`CompilerError 0`、页面 4 秒内 200） |
| T90 | **组件内联写的自定义属性（`style="--x: …"`）优先级高于任何选择器，包括 `@media` 里的规则 —— "写好了的移动端样式"可以长期不生效而没有任何报错**：v1.67 排「**手机端我咋没看到桌宠**」时发现，`src/styles/pet.css` 里那段 `@media (max-width: 767px) { .pet { --pet-scale: 0.62 } }` 从 P3 起就在，但 `AemeathPet.astro` 的内联 `style="--pet-scale:0.86"` 一直赢（**内联声明在层叠里压过作者样式表里的任何选择器**）→ 手机端拿到的一直是桌面缩放。⚠️ 它的表现是**静默不生效**：不报错、不警告，`getComputedStyle(el).getPropertyValue("--pet-scale")` 读到的**就是内联那个值**，所以"我看了一眼样式表里写着 0.62"这种检查永远是绿的。判据/修法：**"档位"与"具体值"分层** —— 组件只内联 `--x-desktop` / `--x-mobile` 两个**值**，由 CSS 用媒体查询选 `--x-active`，需要再叠系数时乘一层（`calc(var(--x-active) * var(--x-mini))`）；并补一条**跨文件断言**（读组件源码 + CSS + 配置文件，核对"CSS 断点 = 配置断点 − 1"），因为这类失效在 DOM 里根本看不出来 —— DOM 只会告诉你"现在是多少像素"。同族教训见 T28（`is:inline` 里的表达式不求值，也是"写了但不生效"） |
| T91 | **"补丁脚本"自己的字符串会吃掉 payload 里的转义与定界符 —— 而且 `pnpm check` 看不见**：v1.70 写动态壁纸组件时同一个坑踩了三次。① 在**模板字符串**里放"要写进 .astro 的脚本"，脚本注释里的一个**反引号**就把外层字符串提前闭合 → Astro 编译报 `ts(1005)`（那还算好的，至少报错）；② 同一段里 `it.src.replace(/^.*\//, ...)` 的 `\/` 被字符串求值吃成 `/`，产物里正则**提前闭合** → 浏览器抛 `SyntaxError: Unexpected token ','` —— 而 `pnpm check` / `tsc` **全程 0 error**（它们只看模板字符串合不合法，不看字符串里是什么）；③ `\.mp4$` 被吃成 `.mp4$`：这次连错都不报，"点"变成了"任意字符"，语义静默漂移。判据/做法：**要写进字符串的脚本，别在字符串里造**——落成一个纯文本文件再读进来拼（本轮的 `reports/_wp-rbg-block.txt` / `_rpet14-block.txt` 就是这个用法）；必须在字符串里写时，**转义写两层**（`\\/`、`\\.`）并跑一遍守卫脚本（`reports/_check-video-script-literal.mjs`：扫"体内反引号数"与"单层反斜杠+斜杠"）；最后**一定要在产物上验**（`node --check` 抠出来的那段，或直接在浏览器里看有没有 `SyntaxError`）——编译期绿灯在这类问题上等于没查 |

### 14.4 被移除的上游功能怎么找回来

P1 按发起人要求删掉了**订阅（RSS/Atom）**。删除是有意为之，但恢复路径要写清楚，免得以后想加回来时满仓库找：

| 要恢复什么 | 需要找回的文件 | 还需要接回的位置 |
| --- | --- | --- |
| **评论系统接入**（R-CMT-01：v1.49 清空了五处上游演示端点） | 只想"能填值"的话不需要找回任何文件 —— 值就在 `src/config/commentConfig.ts`；想找回上游那套演示值（**不建议**：`giscus.repo` 填的是**模板作者的仓库**，切到 giscus 会把访客评论发到别人仓库）则 `git show 1e5ea99:src/config/commentConfig.ts` | `commentConfig.type` 改成 `twikoo`/`waline`/`giscus`/`disqus`/`artalk` 之一，**并填自己的地址**：twikoo `envId`、waline `serverURL`、artalk `server`、disqus `shortname`、giscus `repo` + `repoId` + `categoryId`（后两个从 <https://giscus.app> 取）；另见 `src/types/commentConfig.ts` 的字段契约与 §4 的 R-CMT 两行 |
| feed 输出 | `src/pages/rss.xml.ts`、`src/pages/atom.xml.ts`、`src/utils/feed-utils.ts` | `siteConfig.feed`（配置块被注释掉了，取消注释即可） |
| 订阅介绍页 | `src/pages/rss.astro`、`src/pages/atom.astro` | — |
| 浏览器/阅读器自动发现 | — | `Layout.astro` 的 head 里两条 `<link rel="alternate" type="application/rss+xml·atom+xml">` |
| 页脚入口 | — | `Footer.astro` 的 RSS/Atom 链接（现在只剩 Sitemap） |
| 首页横幅图标行 | — | `backgroundWallpaper.ts` 的 `homeText.linksEnable: true` + `links` 数组 |
| 侧栏资料卡图标 | — | `profileConfig.links` 数组 |
| **友链 / 打赏两个页面**（R-NAV-05 / R-NAV-06：v1.47 删页面，v1.48 清残留） | 页面 `src/pages/friends.astro`、`src/pages/sponsor.astro`；配置 `src/config/friendsConfig.ts`、`src/config/sponsorConfig.ts` 与内容 `src/content/spec/friends.mdx`；类型 `src/types/friendsConfig.ts`、`src/types/sponsorConfig.ts`；样式 `src/styles/pages/friends.css`、`src/styles/pages/sponsor.css`；收款码 `public/assets/images/sponsor/{alipay,wechat}.png` | `navBarConfig.ts` 的 `LinkPresets.Friends`/`Sponsor`（预设行已删）；`src/config/index.ts` 与 `src/types/config.ts` 里的导出；`posts/[...slug].astro` 的文章页打赏按钮（原有 5 处用法）；`navbar-i18n.ts` 的 `友链`/`打赏` 两条映射；`llms.txt.ts` 的 `KEY_PAGES` 两条；`siteConfig.pages.friends`/`sponsor`（值仍是 `false`，改 `true` 才会放行） |

> 全部文件都能从**上游模板基线 v6.16.8** 原样取回（它们是模板自带功能，删除时未做任何修改）；上游出处与许可见 `LICENSE` 与 `README.upstream.zh.md`。
> 删除本身只涉及"删文件 + 摘掉 4 处引用"，没有改动 `feed-utils` 的实现，所以恢复不需要重新适配。
> ⚠️ **友链 / 打赏是例外**：文件本身是上游原件，但接回时那些"摘引用"的地方（`posts/[...slug].astro` 的打赏按钮、`navBarConfig.ts` 的预设行）v1.47 已经改过，恢复等于把那些改动反向做一遍 —— 从 **git 历史**取比从上游取更省事（`git log --diff-filter=D -- src/pages/friends.astro` 定位删除提交）。

**本站自己的模块被移除时，同样要在这里留恢复路径**（v1.40 起）：

| 要恢复什么 | 需要找回的文件 | 还需要接回的位置 |
| --- | --- | --- |
| **排行子系统**（R-RANK，v1.40 被「学习路线 R-PATH」取代） | `src/pages/rank/index.astro`、`src/pages/rank/jp.astro`、`src/pages/rank/cn.astro`、`src/pages/rank/game.astro`、`src/components/pages/rank/RankBoard.astro`、`src/styles/pages/rank.css`、`src/config/rankConfig.ts`、`src/types/rankConfig.ts`、`src/assets/images/rank/_demo-*.webp` | `navBarConfig.ts` 的 `LinkPresets.RankJP/RankCN/RankGame` 与「排行」子树；`verify-ui.mjs` 里那 44 条 R-RANK 断言（**约 34 条在 v1.40 被删**，只能从 git 历史取回）；`verify-docs.mjs` 的排行相关检查 |

> 排行的完整身影在 **v1.40 之前的最后一个提交**里（`git log --diff-filter=D -- src/pages/rank` 可定位删除提交；`git show <v1.40 前一个提交>:src/pages/rank/jp.astro` 直接取文件）。设计正文也在同一提交的 `ARCH.md` §5。**恢复的前提**：先决定 `/roadmap/` 是否保留 —— 两者抢同一格导航位。
