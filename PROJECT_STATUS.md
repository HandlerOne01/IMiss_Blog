# IMiss Blog 项目状态（PROJECT_STATUS）

> **这份文档是项目的唯一进度入口。** 阶段、进度、下一步、阻塞项都只在这里维护，其它文档不重复记录状态。

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.5 |
| 最后更新 | **2026-09-24** |
| 当前阶段 | **P1 已完成（含审查后修订），待发起人审查**（通过后进入 P2） |
| 整体进度 | **35%**（口径：文档与共识 10% + P0 5% + P1 20%；各阶段权重见第 2 章） |
| 关联文档 | `prd.md`（需求编号 R-xxx）、`ARCH.md`（改动落点） |
| 阻塞项 | **11 条**（B-01 ~ B-11，其中 3 条为红色阻断，影响 P5 / P6） |

---

## 1. 一页速览

**已完成**：需求共识（7 个决策点）→ 三份基线文档 → **P0 仓库基线与工具链** → **P1 站点身份与导航改造**（站点名/配色/导航树/侧边栏三处/留言页/清凭据 + 独立审查后修订；`pnpm verify:ui` **52 项功能断言全绿** + 7 张截图）。

**当前在做**：**等待 P1 审查**。审查通过后进入 P2（排行子系统）。

**下一步（三条）**

1. **请你审查 P1 交付**：① 打开 `reports/screenshots/home-1440.png`、`sidebar-1440.png`、`home-390.png` 看实际效果；② 重点确认三处**我自己定的事**：副标题「爱弥斯的小站」、作者名占位 `IMiss`、首页横幅占位文案（标题已改 `IMiss Blog`、副标题三条、链接只留 RSS/Atom）；③ 确认留言页文案口吻。
2. **P2 开工前**：等你给排行数据（`B-08`，可以先给 3~5 条示例），我先做机制与视觉；P2 会补上 `/rank/jp/`、`/rank/cn/`（**现在导航里点进去是 404，这是预期，P1 不要单独上线**）。
3. **顺手能给就给**：`B-01`（域名）、`B-02`（作者名/头像/签名/社交链接）——这两个决定了站点标题的最终形态与页脚版权名。

**最近变更**：2026-09-24 v1.4 —— P1 **审查后修订**：独立审查（子 agent）发现 **1 条阻断 + 2 条应修**，已全部修完并复验（52/52 全绿）。阻断项是**首页横幅还挂着上游 Sponsor 打赏链接与作者邮箱**（R-NAV-06 的盲区）；另修 `vndb.mode` 应改回 `dynamic`（否则填上 userId 就会构建期联网）、`siteStartDate` 清空（R-ID-05）。同时把 `verify:ui` 的 3 处假绿断言与断言盲区一并修掉，并新增"渲染结果泄漏扫描"。

---

## 2. 阶段进度表

权重口径：文档 10% + P0 5% + P1 20% + P2 10% + P3 15% + P4 15% + P5 20% + P6 5% = 100%

| 阶段 | 名称 | 交付物 | 验收 | 进度 | 状态 | 依赖 |
| --- | --- | --- | --- | --- | --- | --- |
| **P0** | 仓库基线与工具链 | 工作区 = Firefly 副本 + 依赖装好 | `pnpm check` / `type-check` / `build` 通过；断网构建通过 | **100%** | ✅ 已完成（待审查） | — |
| **P1** | 站点身份与导航改造 | 站点名/配色/导航树/侧边栏三处改动 | `pnpm verify:ui` **52/52 通过**；截图核对（1440 / 390） | **100%** | ✅ 已完成（含审查后修订，待审查） | P0 审查通过 |
| **P2** | 排行子系统 | 两个榜单页 + 4 组数据 + 全剧/单集切换 | 榜单视觉对齐参考图；`?kind=ep` 直开正确；空/缺图不崩 | 0% | ⬜ 未开始 | P1 审查通过、B-08（数据可后补） |
| **P3** | 背景壁纸与桌宠 | 图片期壁纸 + 桌宠组件 | 三种降级可用；桌宠九状态与键盘可达 | 0% | ⬜ 未开始 | P0 |
| **P4** | 内容迁移 | 批次 1（15~20 篇）→ 全量 142 篇 | `pnpm verify:posts` 通过；抽查无断裂图片与残留 `![[` | 0% | ⬜ 未开始 | P0、P1 |
| **P5** | 桌宠 Agent | `agent/` + 网关 + 前端适配层 | 三种意图可用、LangSmith 有 trace、断后端走 mock | 0% | ⬜ 未开始 | P3、B-07、B-11 |
| **P6** | 部署与回填 | Nginx 上线 + 站点信息回填 | 线上域名可访问；SSE 流式回复；sitemap 无关闭页 | 0% | ⬜ 未开始 | 全部、B-01 |

图例：⬜ 未开始　🟡 进行中　✅ 已完成　⛔ 阻塞

---

## 3. 各阶段任务明细

### P0 仓库基线与工具链　✅ 已完成（2026-09-24）

- [x] P0-1 复制模板进工作区根（排除上游 `.git`），保留 gitee 远端 —— **robocopy exit=3；`src/` 390 文件逐文件 SHA256 与源模板一致；`pnpm-lock.yaml`/`package.json`/`.npmrc`/`astro.config.mjs`/`pnpm-workspace.yaml` 哈希一致**
- [x] P0-2 `pnpm install` 成功 —— **首次直连 npmjs 失败（32–46 KiB/s，多个 tarball 超时 + `operation was aborted due to timeout`）；改用 `--registry=https://registry.npmmirror.com` 后 48.5s 装完；pnpm 自动切换到仓库声明的 v11.22.0；`--frozen-lockfile` 未改动锁文件**
- [x] P0-3 `pnpm check` 通过 —— **259 文件：0 errors / 0 warnings / 0 hints**
- [x] P0-4 `pnpm type-check` 通过 —— **exit=0**
- [x] P0-5 `pnpm build` 通过 —— **exit=0；1115 个内联脚本被压缩（省 1508.9 KiB）；Pagefind 索引 18 页 / 2088 词；`dist/pio` 被正确裁掉（省 14.35MB）**
- [x] P0-6 断网复跑 `pnpm build` —— **设 `NODE_USE_ENV_PROXY=1` + 黑洞代理 `http://127.0.0.1:9`，日志出现 `ECONNREFUSED 127.0.0.1:9`，GitHub 卡片步骤回落缓存（`Cached 2 repositories (0 refreshed)`），构建仍 `exit=0`。为达成这一点修掉了字体 provider 的构建期联网（见下）**
- [x] P0-7 重写 `README.md` 为本站说明 —— **上游中文 README 保留为 `README.upstream.zh.md`，英文 `README.en.md` 原样保留**
- [x] P0-8 目录与 `.gitignore` 复核 —— **`.gitignore` 增补 `reports/`、`src/content/_quarantine/`、`agent/data/`、`agent/.env`、`agent/.venv/`；另发现上游 `.github/workflows/deploy.yml` 会在 push `master` 时自动发布到 GitHub Pages（与本站"自建服务器 + Nginx"的决定冲突），已保留文件但在文件头加了醒目警示（当前远端是 Gitee，不会触发）**
- [x] P0-9 开发服务器冒烟测试 —— **`pnpm dev` 8.6s 就绪；`/` → 200（716KB，23 条 `@font-face`）、`/posts/firefly/` → 200；`/404/` 在 dev 下返回 404 属 Astro 正常行为**
- [x] P0-10 独立代码审查（子 agent，只读）—— **核对 23 条"文档对代码的断言"，发现 4 条不成立/部分成立，已全部修正进文档；额外产出 20 条耦合/陷阱，其中 15 条整理为 `ARCH.md` §14.3**
- [x] P0-11 基线提交 —— **`3dbc38d`（562 文件，+88018 行；`git status` 干净；未 push，等你审查）**

### P1 站点身份与导航改造　✅ 已完成（2026-09-24）

- [x] P1-1 站点名与元信息（R-ID-01、R-ID-03）—— **`title`/`subtitle`/`description`/`keywords` 重写；`navbar.title = IMiss Blog`；`site_url` 先占位 `https://imiss.example.com` 并登记 B-01；页脚版权名已从 `XiaYe` 换成占位 `IMiss`（`profileConfig`）**
- [x] P1-2 主题色 hue=345（R-ID-02）—— **`themeColor.hue: 165 → 345`；实测 `--hue` inline/computed 都是 345**
- [x] P1-3 临时 Logo 与 favicon（R-ID-04）—— **新增 `scripts/make-logo.mjs`（从图集第 1 格裁头像，`nearest` 放大到 128），产出 `imiss-light/dark.webp` 与 `imiss-{32,128,180,192}.png`；导航栏 Logo 与 favicon 均已接上**
- [x] P1-4 导航树重写（R-NAV-01~04）—— **实测顶层 = `["主页","文章","排行","我的","链接","留言"]`；排行子项 = 日漫排行/国漫排行（`/rank/jp/`、`/rank/cn/`，不带 pageKey）；我的子项 = 动态/项目/相册/书签导航/轻小说/番剧/关于我；已删项在导航中零残留（含移动端菜单）**
- [x] P1-5 页面开关矩阵（R-NAV-05~07）—— **`friends/sponsor/bilibili/bangumi` 关闭、`vndb/mal` 打开；sitemap 不含 4 个关闭页、含 4 个保留页；llms.txt 同步（走同一 pageKey 机制）；⚠️ 关闭页在静态输出下是 200 + noindex 存根而非 404，已按真实行为修正 PRD 验收条件，真 404 交给 Nginx（§12.2）**
- [x] P1-6 站点统计删两项（R-WDG-01）—— **`stats` 数组删 running-days/last-update，连带删掉整段 `<script is:inline>` 与 `getActivityDate`/`lastActivityDate`/`lastPostDate`/`siteStartDate`/`todayText`；渲染标记里的 `data-stat-id` 与 `suffix` 也一并清理（TS 先报错抓出来的）；实测组件只剩 4 行，文案里无「运行时长/最后活动/天前」**
- [x] P1-7 日历热力图关闭（R-WDG-02）—— **`showHeatmap: false`；实测 `#heatmap-container` 不存在，月历本身正常**
- [x] P1-8 站点信息占位模式（R-WDG-03）—— **`SiteInfoConfig` 加 `placeholder?: boolean`（真身在 `src/types/sidebarConfig.ts`），左右侧栏两处都开；实测构建平台/域名/各版本号显示 `—`，底部提示「站点尚未部署，构建信息待上线后自动填充」，Firefly 版本与文章许可照常显示**
- [x] P1-9 留言页文案（R-CMT-01、R-CMT-02）—— **`guestbook.md` 重写；`commentConfig.type` 保持 `none`，页面落占位卡片；zh_CN 的 `commentNotConfigured`（→「留言板正在装修中」）与 `guestbookCommentHint` 改成自己的口吻（该 key 的另一处消费方是 `comment/index.astro` 的不可达分支，只影响留言页）**
- [x] P1-10 清空上游示例凭据（R-ID-05）—— **`mal.username`/`mal.clientId`（含前导制表符）/`vndb.userId`/`bangumi.userId`/`bilibili.uid` 全部清空，并在注释里写明原值与来源**
- [x] P1-11 逐项核对（桌面 1440 + 移动 390）—— **新增 `scripts/verify-ui.mjs`：**35 项断言全绿**（HTTP 可达性、导航顺序、已删项、站点名、色相、统计行数、热力图、占位模式、留言/番剧/轻小说文案、sitemap）；输出 7 张截图到 `reports/screenshots/`（含一张 1440×2400 的侧栏专用视口图，因为 sticky 侧栏在整页截图里会失真）**
- [x] P1-12 附带收尾（不属于原清单，但属于 R-NAV-03 的"改名"）—— **`zh_CN` 里 `vndb`→「轻小说」、`mal`→「番剧」，以及两个页面「未配置数据源」的文案；否则导航叫「轻小说」而页面标题还印着 VNDB**
- [x] P1-13 把上轮遗留的桌宠图集提前入库（`src/assets/images/pet/pet-aemeath.webp`）—— **Logo 要从它裁，P3 做桌宠时直接用同一份，不算重复劳动**

### P2 排行子系统（R-RANK）

- [ ] P2-1 类型与数据文件骨架（`rankConfig.ts` + 4 组空数据）
- [ ] P2-2 `RankBoard.astro` 榜单板（名次 + 剧照 + 标题 + scrim + 缺图占位）
- [ ] P2-3 `RankTabs.svelte` 全剧/单集切换（URL 同步 + 后退 + 键盘）
- [ ] P2-4 三个页面（`/rank/`、`/rank/jp/`、`/rank/cn/`）+ 导航接入
- [ ] P2-5 浅色主题与移动端适配
- [ ] P2-6 空数据 / 缺图 / 超长标题边界处理
- [ ] P2-7 填入第一批真实数据（等 B-08）

### P3 背景壁纸与桌宠（R-BG / R-PET）

- [ ] P3-1 壁纸转换脚本 + 4 张图转 webp 接入（R-BG-01）
- [ ] P3-2 主页横幅文案与链接（R-BG-03，文案待确认）
- [ ] P3-3 取景锚点与暗罩调优（R-BG-04）
- [ ] P3-4 桌宠组件骨架：图集、缩放、位置记忆（R-PET-01）
- [ ] P3-5 九状态与交互（拖拽/气泡/右键/键盘）（R-PET-02）
- [ ] P3-6 站点联动与降级（R-PET-03）
- [ ] P3-7 与看板娘互斥、浮动按钮不遮挡（R-PET-04、R-PET-05）
- [ ] P3-8 视频期壁纸（等 B-04）：`playerUrl` + 封面帧 + 兜底版 + 三种降级（R-BG-02）

### P4 内容迁移（R-CNT）

- [ ] P4-1 `import-posts.mjs`（dry-run + 报告）
- [ ] P4-2 批次 1：15~20 篇人工核对并定型
- [ ] P4-3 `verify-posts.mjs` + `pnpm verify:posts`
- [ ] P4-4 批次 2~5 全量迁移
- [ ] P4-5 去重与分类/标签/摘要抽检
- [ ] P4-6 缺图文章处理（AI应用 两篇，等 B-06）
- [ ] P4-7 归档/分类/标签/系列页数据核对
- [ ] P4-8 替换上游示例内容页：**书签导航**（`booknavConfig.ts` 里现在是 Firefly/CuteLeaf 的博客卡片与 `firefly-32.png` 图标）、相册（`public/gallery/firefly-2026/*`）、动态、关于页、示例文章（`posts/firefly*`、`markdown-*`、`katex-*`、`mdx-example`、`encrypted-demo`、`video`、`guide/*`）与 `projects/*` —— 这些 P1 有意保留（属内容迁移），但**在真实内容到位前，站上仍会看到上游示例**

### P5 桌宠 Agent（R-AGT）

- [ ] P5-1 安装 Python 依赖（等 B-11：uv 或 pip 路线确认）
- [ ] P5-2 `agent/` 骨架 + `persona.txt`（爱弥斯人设）
- [ ] P5-3 图与节点（路由 / 检索 / 榜单 / 闲聊）
- [ ] P5-4 `langgraph dev` 跑通，LangSmith 出 trace（等 B-07）
- [ ] P5-5 网关（SSE）+ 限流 + CORS
- [ ] P5-6 前端适配层与 mock 降级
- [ ] P5-7 宠物状态联动（思考/出错/完成）
- [ ] P5-8 端到端联调 + 断后端回归

### P6 部署与回填（R-DEP）

- [ ] P6-1 `deploy/nginx.conf`（静态 + `/api/` 反代 + SSE 关闭缓冲）
- [ ] P6-2 服务器目录与发布脚本（rsync / git 拉取）
- [ ] P6-3 上线静态站点 + HTTPS
- [ ] P6-4 Python 服务常驻（systemd / nssm）
- [ ] P6-5 `site_url` 回填并重新构建（sitemap/RSS/OG）
- [ ] P6-6 站点信息组件切回真实值
- [ ] P6-7 OG / sitemap / 404 / 移动端全站回归
- [ ] P6-8 修 apple-touch-icon：`Layout.astro` 取 favicon 数组里**第一个 png**（现在是 32px），而 `imiss-180.png` / `imiss-192.png` 已生成但无人引用；把它接进 `siteConfig.favicon` 并带上 `sizes`（P1 审查提出，判为可延后）

---

## 4. 阻塞项

| 编号 | 阻塞内容 | 影响需求 | 需要谁做什么 | 解除条件 | 等级 |
| --- | --- | --- | --- | --- | --- |
| **B-01** | 服务器信息未知：主机、域名、部署路径、是否已有 Nginx | R-ID-03、R-DEP-01、R-DEP-03 | 发起人提供服务器与域名信息 | 拿到域名与部署路径，`site_url` 可填真值 | 🔴 阻断 P6 |
| **B-02** | 作者信息未知：作者名、头像、个人签名、社交链接 | 用户资料组件、页脚版权、文章 `author` 字段 | 发起人提供 | 信息落进 `profileConfig.ts`（P1 已放占位：名字 `IMiss`、头像用临时 Logo、签名「技术笔记、番剧排行，和一只会聊天的爱弥斯。」；上游的 GitHub/邮箱已删除） | 🟡 非阻断（可先占位） |
| **B-03** | 正式 Logo 未提供 | R-ID-04 | 发起人提供，或确认长期用临时版 | **P1 已用临时版顶上**（从桌宠图集裁的头像 + favicon 四档）；正式文件到位后覆盖同名文件即可，无需改代码 | 🟢 可延后 |
| **B-04** | 壁纸视频未制作 | R-BG-02 | 发起人产出视频（源宽度建议 ≥2560） | 视频文件到位 | 🟡 非阻断（图片期先跑） |
| **B-05** | 番剧页缺 MAL `username` + `Client ID`；轻小说页缺 VNDB `userId` | R-NAV-03 两个页面的数据 | 发起人注册并配置 | **P1 已把两页打开（`vndb: true` / `mal: true`）**，空凭据下不联网、显示"数据源还没配置"卡片；填上凭据即刻有数据 | 🟡 非阻断（页面先空着） |
| **B-06** | `AI应用` 两篇缺配图（`images/page-*.png` 在磁盘上不存在） | R-CNT-07 | 发起人找回配图，或确认这两篇不上线 | 图片到位或确认永久隔离 | 🟢 可延后 |
| **B-07** | `DEEPSEEK_API_KEY` 未提供（可选 LangSmith Key） | R-AGT-01、R-AGT-02 | 发起人提供 Key（放 `agent/.env`，不入库） | Key 配好，能跑通一次对话 | 🔴 阻断 P5 |
| **B-08** | 排行 4 组数据未提供（日漫/国漫 × 全剧/单集）与条目配图 | R-RANK-04 | 发起人给数据（可以先给 3~5 条示例） | `rankConfig.ts` 填入真实数据 | 🟡 非阻断（P2 可先做机制） |
| **B-09** | 留言评论系统选型未定 | R-CMT-01 | 发起人从 Waline / Twikoo / Giscus / Artalk 中选一个 | 选型确定并可部署 | 🟢 可延后（已决定先关评论） |
| **B-10** | 主页横幅文案与「链接」下拉内容未定 | R-BG-03、R-NAV-07 | 发起人提供文案与网站列表 | **P1 已把「链接」下拉收窄为 2 条 Firefly 署名链接**（原来第一条是主题作者的 GitHub、第二条是作者的 Gitee 镜像，容易误认成本站仓库）；横幅文案仍留给 P3 | 🟢 可延后 |
| **B-11** | 本机未安装 `uv`（Python 包管理器）；Agent 依赖安装路线未定 | P5-1 | 执行方（可 `pip install uv`，或直接用 `pip install -e .`） | 依赖装好，`langgraph dev` 能起 | 🔴 阻断 P5（可自行解除） |

> 三条红色阻断项分别在 **P6 / P5 / P5**，不影响 P0~P4 开工——可以并行推进：先把站点做出来，等 Key 与域名到位再上最后两段。

---

## 5. 环境与工具现状（已实测）

| 工具 | 版本 / 状态 | 说明 |
| --- | --- | --- |
| Node | v24.16.0 ✅ | 模板要求 ≥22.23 |
| pnpm | 全局 11.24.0，仓库内自动切到 **11.22.0** ✅ | 因 `.npmrc` 里 `manage-package-manager-versions = true`，pnpm 会按 `packageManager` 字段用声明版本（构建日志末尾显示 `using pnpm v11.22.0`） |
| npm | 11.13.0 ✅ | 仅辅助；会就 `.npmrc` 里的 pnpm 专属配置打印 `npm warn Unknown project config "manage-package-manager-versions"`（无害噪声） |
| **npm registry** | ⚠️ **直连 npmjs 不可用** | 实测 `registry.npmjs.org` 只有 32–46 KiB/s，多个 tarball 超时（`error (23)` / `operation was aborted due to timeout`）导致安装失败。**必须加镜像**：`pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com`（48.5s 装完）。镜像不写进仓库 `.npmrc`，属于环境偏好 |
| Python | 3.12.10 ✅（另有 3.14.7） | 参考 Agent 要求 ≥3.10；3.12 更稳 |
| uv | ❌ 未安装 | 见 B-11 |
| git | 2.55.0 ✅ | 已配置 gitee 远端 |
| Chrome | ✅ 已安装 | 仅用于截图/视觉回归；图片转换用模板自带的 `sharp` |

---

## 6. 已完成（含证据）

| 日期 | 事项 | 证据 |
| --- | --- | --- |
| 2026-09-24 | 需求盘点与 7 项决策确认 | 决策已写入 `prd.md`（标记【已定】/【假设】） |
| 2026-09-24 | 基线事实核查（模板版本、导航机制、统计/日历/站点信息落点、文章语料画像、参考 Agent 结构） | 结论写入 `prd.md` §2 与 `ARCH.md` §1/§4/§9 |
| 2026-09-24 | 三份基线文档建立 | `prd.md`、`ARCH.md`、`PROJECT_STATUS.md` |
| 2026-09-24 | 排行榜视觉规格改为"实测值" | 发起人提供裁切参考图并确认不要右侧三列；对图逐像素量得行高 96px / 名次列 75px / 1~3 名粉 `#EA7B7C` 白字 / 4 名以后橙 `#EFA662` 深色字，结论写入 `ARCH.md` §5.5 与 `prd.md` R-RANK-03 |
| 2026-09-24 | **P0-1** 模板复制进工作区 | robocopy exit=3（=成功）；`src/` 390 文件、`pnpm-lock.yaml`、`package.json`、`.npmrc`、`astro.config.mjs`、`pnpm-workspace.yaml` 逐文件 SHA256 与源模板一致；未带入上游 `.git`（源 `.git` 119MB 已排除） |
| 2026-09-24 | **P0-2** 依赖安装 | 直连 npmjs 失败 → 镜像 48.5s 成功；`--frozen-lockfile` 通过（锁文件未被改写）；pnpm 自动用 11.22.0 |
| 2026-09-24 | **P0-3/4** 静态检查 | `pnpm check` 259 文件 0 error / 0 warning / 0 hint；`pnpm type-check` exit=0 |
| 2026-09-24 | **P0-5** 生产构建 | `pnpm build` exit=0；内联脚本压缩 1115 处（省 1508.9 KiB）；Pagefind 18 页；`dist/pio` 被裁掉（省 14.35MB）；dist 22.12MB |
| 2026-09-24 | **P0-6** 断网构建（R-DEP-04 关键验收） | 黑洞代理 `ECONNREFUSED 127.0.0.1:9` 下 `pnpm build` 仍 exit=0；GitHub 卡片回落缓存 `Cached 2 repositories (0 refreshed)`；`[VNDB] Page not enabled, skipping`；日志中无其它出网 URL |
| 2026-09-24 | **P0-7/8** README 与 `.gitignore` | `README.md` 重写为本站说明（上游中文版保留为 `README.upstream.zh.md`）；`.gitignore` 增补 `reports/`、`src/content/_quarantine/`、`agent/data/`、`agent/.env`、`agent/.venv/` |
| 2026-09-24 | **P0-9** 开发服务器冒烟 | `pnpm dev` 8.6s 就绪；`/` → 200（716KB、23 条 `@font-face`）、`/posts/firefly/` → 200 |
| 2026-09-24 | **P0-10** 独立代码审查（子 agent） | 23 条文档断言逐条核对：4 条需修正（类型真身在 `types/sidebarConfig.ts` 而非 `types/config.ts`；VNDB 封面脚本是四重短路；`BackgroundPlayer` 完全没有降级逻辑；`ImageWrapper` 缺图只渲染空壳）→ 已全部改进文档；另整理 15 条陷阱进 `ARCH.md` §14.3 |
| 2026-09-24 | **P0 修掉的两个真实问题** | ① **字体 provider 构建期联网**：`fontsource`/`npm` provider 都会去 jsdelivr 取字体，实测 `CannotFetchFontFile` 导致构建失败 → 改为 `local` provider，11 个 woff2 存入 `src/assets/fonts/`（205KB，同时避免 public 直出造成 dist 内两份副本），并发现 `Zen Maru Gothic` 根本没有 600 字重（原配置请求了无效值）；② **上游示例凭据**：`siteConfig.mal.clientId` 是带前导制表符的 32 位十六进制串（形如真实凭据）→ 立项为新需求 R-ID-05，P1 清空 |
| 2026-09-24 | **P1** 站点身份与导航改造 | `prd.md` R-ID-01~05 / R-NAV-01~07 / R-WDG-01~03 / R-CMT-01~02 全部落地；`pnpm check` 0 error/0 warning、`pnpm type-check` exit=0、`pnpm build` exit=0 |
| 2026-09-24 | **P1 验收工具** | 新增 `scripts/verify-ui.mjs`（零依赖，直接开系统 Chrome 走 DevTools Protocol）：**35 项断言全绿，exit=0**；截图 7 张 |
| 2026-09-24 | **P1 实测纠正了自己写错的一条验收条件** | `prd.md` 原写"直接访问 `/friends/` 返回 404"——实测静态输出下是 **HTTP 200 + `meta refresh` + `noindex` 的存根**（Astro 只在 SSR 下才有真 302），且存根指向的 `/404/` 没有产物（真正的是 `dist/404.html`）。已按真实行为改写 R-NAV-05/R-NAV-06 验收条件、在 `scripts/verify-ui.mjs` 里改为断言"确实是那个 noindex 存根"、并把真 404 落到 Nginx 层（`ARCH.md` §12.2 的五条 `return 404` + `error_page 404 /404.html`），同时登记为陷阱 T17 |
| 2026-09-24 | **P1 中途被 TS 抓到的耦合** | `SiteStats.astro` 删掉统计数组项后，渲染标记里仍在用 `stat.id` / `stat.suffix` → `pnpm check` 报 3 处 ts(2339)。正好印证 `ARCH.md` §14.3 T2「数组与脚本/标记靠字符串字面量解耦，必须一起删」 |
| 2026-09-24 | **P1 独立审查（子 agent，只读）** | 逐条核对 16 条需求 + 排查副作用 + 评估验证脚本，结论：**工程上可提交，但按需求验收有 1 条阻断 + 2 条应修**。① **阻断 R-NAV-06**：首页横幅 `backgroundWallpaper.common.homeText.links` 里仍挂着上游 Sponsor 打赏链接，以及作者 GitHub / 邮箱（邮箱被编码成 base64 挂在**每一页**）；② 应修：`vndb.mode` 应为 `dynamic`（写成了 `static`，一旦填 userId 就构建期联网）；③ 应修：`siteStartDate` 未按 R-ID-05 清空。另指出 `verify-ui` 有 3 项"不验证也记 ✅"（P2 待建路由、sitemap 读不到产物时 catch 记 pass）与 5 条需求零断言，并给出 3 处注释与事实不符 |
| 2026-09-24 | **P1 审查后修订 + 复验** | 修完上述 3 项，并清理同批上游身份（首页横幅标题/副标题/链接）；`verify-ui.mjs` 修掉 3 处假绿、新增**渲染结果泄漏扫描**（上游邮箱/ID/打赏链接/横幅标题）、新增文章页打赏按钮断言、标题描述与 keywords 断言、导航 Logo 断言、留言页副标题断言，且把"关于我页"的弱断言（`length > 100`）换成内容标志断言；对比度检查改为 token 级并加 `--hue` 345↔165 的 A/B。**复验：52 项功能断言全绿、exit=0** |

**需求共识要点（防止以后记错）**

- 排行榜：**只要一期、主观排名、手工维护、不要右侧的得票率/升降/涨幅**；视觉以发起人提供的**裁切参考图**为准（名次色只有两档：1~3 名粉底白字、4 名以后橙底深色字），实测比例已记入 `ARCH.md` §5.5。
- 桌宠 Agent：现在还没有后端，**允许先写一个简单版测试**，参考 `agent_-for_-blog`，但**不许改它的代码**。
- 留言：**暂时关闭评论**，页面与导航先做好。
- 内容迁移：**先精选 15~20 篇跑通**，再全量。
- 部署：**自建服务器 + Nginx 静态托管**。
- 保留：动态、项目、相册、书签导航、音乐播放器、公告、番剧（原 AnimeList）、轻小说（原 VNDB）。
- 站点信息：**保留组件但值先留空**，部署后回填。

---

## 7. 风险登记（与 `ARCH.md` §14 对应）

| 风险 | 触发条件 | 影响 | 应对 | 状态 |
| --- | --- | --- | --- | --- |
| 上游模板升级覆盖自定义 | 以后同步 Firefly 新版 | 改动丢失 | 改动集中在 config 与新增文件；核心组件最小编辑 | 监控 |
| 图片顺序映射错误 | 批次迁移时引用与图片数量不一致 | 配图张冠李戴 | 数量不一致即报错、不猜；批次 1 人工核对 | 待 P4 验证 |
| 视频壁纸体积过大 | 视频产出后 | 首屏慢 | 三种降级 + 8Mbps 兜底档 | 待 P3 |
| 构建期需要外网 | 配置了 VNDB/MAL 凭据、或字体用远端 provider | 构建失败 | **P0 已验证**：黑洞代理下构建 exit=0；字体已改本地文件；VNDB 封面默认关闭 | ✅ 已解决（R-DEP-04 实测通过；后续新增依赖时需重跑一次 P0-6） |
| 新增依赖引入新的构建期联网 | 以后加字体/图片/数据源类依赖 | 构建失败 | 新增依赖后重跑一次黑洞代理构建（P0-6 的做法） | 持续 |
| npm registry 直连不可用 | 换机器/服务器安装依赖 | 安装失败 | 安装时加 `--registry=https://registry.npmmirror.com`；已写入 README 与 `ARCH.md` §12.3 | ✅ 已知并规避 |
| 上游示例凭据随仓库分发 | 未清理即公开仓库 | 误导/安全 | R-ID-05 **已在 P1 完成**：5 处示例 ID 全部清空并在注释里标注原值来源 | ✅ 已解决（P1） |
| 「关闭页面」被当成 404 | 依赖 `Astro.redirect` 的行为 | 线上返回 200 软跳转，SEO 不理想 | P1 已按真实行为改验收条件；真 404 落到 Nginx（§12.2 五条 `return 404` + `error_page`） | ✅ 已有对策（待 P6 落地验证） |
| 侧边栏 sticky 组件在整页截图里失真 | 用 full-page 截图做视觉验收 | 误判"组件没渲染" | `verify-ui.mjs` 额外输出一张 `sidebar-1440.png`（1440×2400 视口、不整页） | ✅ 已解决（P1） |
| Agent 依赖不可达 | DeepSeek / LangSmith 网络异常 | 桌宠不能聊天 | 前端 mock 兜底；health 探测 | 待 P5 |
| 密钥泄漏 | `.env` 误提交 | 费用与安全 | `.gitignore` 覆盖 + 只放占位在 `.env.example` | 待 P5 |

---

## 8. 变更日志

| 日期 | 版本 | 变更 | 影响文档 |
| --- | --- | --- | --- |
| 2026-09-24 | v1.0 | 建立项目文档体系；固化需求共识、架构设计与阶段划分 | `prd.md`、`ARCH.md`、`PROJECT_STATUS.md` |
| 2026-09-24 | v1.1 | 排行榜视觉规格改为实测值：名次色两档（1~3 名 `#EA7B7C` 白字 / 4+ 名 `#EFA662` 深色字）、行高 = 内容宽 1/5.7、名次列 = 内容宽 13.7%；明确右侧三列不做 | `prd.md` R-RANK-03 / R-RANK-06、`ARCH.md` §5.5 |
| 2026-09-24 | v1.2 | **P0 完成**：模板复制并 SHA256 校验、依赖安装（发现必须用国内镜像）、`check`/`type-check`/`build`/断网构建/`dev` 全部通过。新增需求 **R-ID-05**（清理上游示例凭据）、`ARCH.md` **§14.3 模板已知陷阱（15 条）**、字体改 `local` provider（修掉构建期联网）、`.gitignore` 增补、`README.md` 重写 | `prd.md` R-ID-05 / R-DEP-04、`ARCH.md` §2/§3/§4/§6/§12/§14.3、`PROJECT_STATUS.md` §1~§8 |
| 2026-09-24 | v1.3 | **P1 完成**：站点改名 IMiss Blog、hue=345、导航树重写、统计删两项、热力图关闭、站点信息占位、临时 Logo/favicon、留言页文案、清空示例凭据、轻小说/番剧页改名收尾。新增 `scripts/verify-ui.mjs`（35 项断言）与 `scripts/make-logo.mjs`。**纠正 PRD 一条错误验收条件**（关闭页面在静态输出下是 200 + noindex 存根，不是 404）+ `ARCH.md` §14.3 新增 T17、§12.2 增加 5 条 Nginx `return 404` 与 `error_page 404 /404.html` | `prd.md` R-ID-04 / R-NAV-05 / R-NAV-06、`ARCH.md` §3/§4/§11/§12.2/§14.3、`PROJECT_STATUS.md` §1~§8 |
| 2026-09-24 | v1.4 | **P1 审查后修订**：独立审查发现 1 条阻断（首页横幅的上游 Sponsor 打赏链接 + 作者邮箱/GitHub）与 2 条应修（`vndb.mode` 改回 `dynamic`、`siteStartDate` 清空），已全部修完；首页横幅标题/副标题/链接一并换成占位。`verify-ui.mjs` 修掉 3 处假绿、新增泄漏扫描与 5 条缺失断言、对比度改为 token 级 + hue A/B；复验 **52/52 全绿**。新增陷阱 **T18**（横幅 links 是身份/打赏清理盲区）与 **T19**（侧栏 `-dynamic`/`-static` 容器 id 坑，会让 DOM 断言静默空过）；P4 新增 P4-8（替换上游示例内容页）、P6 新增 P6-8（apple-touch-icon 用 180/192） | `prd.md` R-ID-05 / R-NAV-06、`ARCH.md` §4/§11/§14.3、`PROJECT_STATUS.md` §1~§8 |
| 2026-09-24 | v1.5 | `README.md` 增补「我自己怎么把它跑起来」手把手一节（开终端 → 装依赖 → `pnpm dev` → `pnpm preview` → `pnpm verify:ui` → 停止方式 → 常见问题），并实测 `pnpm dev --host --port 4322`：监听 `::`、`localhost:4322` 与局域网 `192.168.3.5:4322` 均 200 | `README.md`（需求与架构未变，`prd.md`/`ARCH.md` 无改动） |

---

## 9. 文档维护约定

1. **状态只写在这里**：`prd.md` 写"要什么"，`ARCH.md` 写"怎么改"，状态与进度一律回本文件。
2. **需求变更走编号**：新增/修改需求先改 `prd.md` 并给编号，再在 `ARCH.md` 补落点，最后在本文件登记。
3. **阶段完成要留证据**：勾选任务时必须能指认证据（命令输出、截图路径、构建产物、线上 URL）。
4. **阻塞项只增不删**：解除后把等级改成 ✅ 并写明解除方式与日期，便于回溯。
5. **三份文档共用一个版本号**：版本号跟"项目修订"走，某一轮只改了 README 或状态表时，`prd.md`/`ARCH.md` 也同步标同一个号——避免三份文档版本号不一致，看起来像漏改。
6. **每次开工先读第 1 章**的三条"下一步"，收工回填第 2、3、8 章。
