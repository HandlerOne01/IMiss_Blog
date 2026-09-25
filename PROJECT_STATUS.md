# IMiss Blog 项目状态（PROJECT_STATUS）

> **这份文档是项目的唯一进度入口。** 阶段、进度、下一步、阻塞项都只在这里维护，其它文档不重复记录状态。

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.25 |
| 最后更新 | **2026-09-24** |
| 当前阶段 | **P4 内容迁移全量完成：站上 131 篇（全部是你的笔记）+ 120 张配图**；AI应用 两篇按你的指示暂不导入，之后提醒 |
| 整体进度 | **80%**（口径：文档与共识 10% + P0 5% + P1 20% + P2 10% + P3 主体 15% + P4 20%；各阶段权重见第 2 章） |
| 关联文档 | `prd.md`（需求编号 R-xxx）、`ARCH.md`（改动落点） |
| 阻塞项 | **13 条**（B-01 ~ B-13，其中 3 条为红色阻断，影响 P5 / P6；P2 已用占位数据绕开 B-08；新增 B-12/B-13 是批次 1 审查时发现的两件事，需要你拍板） |

---

## 1. 一页速览

**已完成**：需求共识（7 个决策点）→ 三份基线文档 → **P0 仓库基线与工具链** → **P1 站点身份与导航改造**（站点名/配色/导航树/侧边栏三处/留言页/清凭据 + 删除订阅功能 + 显示设置面板对访客开启）→ **P2 排行子系统**（`/rank/jp/`、`/rank/cn/` 两个维度榜 + `/rank/game/` 二游单一榜 + 全剧/单集切换 + 缺图占位 + 亮暗双主题适配）→ **P3 背景壁纸与桌宠**（4 张爱弥斯壁纸原图入库 + 九状态桌宠「爱弥斯」常驻全站）→ **P4 批次 1 内容迁移**（`scripts/import-posts.mjs` + `scripts/verify-posts.mjs`，18 篇旧博客笔记入库、9 张配图逐张核对过位置）。

**当前在做**：**P4 全量导入已交付，等你验收**。P3-8（视频壁纸）仍等你一句话。

**下一步（六条）**

1. **请你验收全量导入的 131 篇**：`pnpm preview` 后随便翻——`/archive/` 有全部 131 篇、`/categories/` 10 个分类、`/posts/linux/` 下是 Linux 笔记。重点抽查这几篇：`/posts/linux-net/http-xieyi/`（6 图 4 表）、`/posts/cpp/hongheishufengzhuangshixian-mymap-he-myset/`（代码最多）、`/posts/algorithm/suanfacuotiben/`（173KB 超长错题本、16 图）、`/posts/interview/cpp/`（227KB 八股长文）、`/posts/ai/sdd/`（没有标题的短笔记）。**每个分类的图片位置都有独立子 agent 逐张看过**（4 组并行，结论见 §6）。
2. **⏰ AI应用 剩余两篇（`LangChain 能力详解` 351KB / `LangGraph 能力详解 · 学习笔记` 389KB）按你的指示暂不导入**——它们引用的 125 张 `page-*.png` 在源导出里整批缺失（B-06）。**我会主动提醒你**：等你找回配图（或说"就这样上"），我把这两篇补进来（脚本已把这两篇写进跳过名单，取消即可）。
3. **两件仍要你拍板的事（B-12 / B-13）**：① `HTTP 协议` 那篇的 02/04 两张抓包截图里有**明文账号密码与真实域名**（`username=…&password=…`、`JSESSIONID`），要不要打码/裁掉那两行？（上线前必须处理）② `八股/` 那 11 篇看内容与图片外链像是第三方公开仓库 `guaguaupup/cpp_interview` 的整理稿，图片 hotlink 在别人的 jsDelivr 上——要不要署来源、或把图片转存到本站？
4. **`P3-8` 视频壁纸 + `B-10` 横幅文案**还挂着：视频素材你说之后再给（原型里那份 `hero-loop.mp4` 9.23MB 也能直接用）；横幅文案给我一行我就换。
5. **⏰ 上游示例页先留着、以后替换（发起人 2026-09-24 决定，并要求"记得提醒"）**：`/projects/`（2 个示例项目）、`/dynamic/`（4 条上游演示动态）、`/gallery/`（两个示例相册）、`/booknav/`（Firefly/CuteLeaf 卡片）、`/about/`（上游模板介绍）**暂时保留原样**，等你以后给真实内容再换。**我每次开工都会主动提这件事**。
6. **⏰ 拿到域名后要回来重建（发起人 2026-09-24："我要分享块啊，只是后面提醒我添加域名而已"）**：**分享块是开着的**（`siteConfig.post.share: true`）——但海报二维码与「复制链接」取 `Astro.url.href`，而 `site_url` 还是占位域名 `imiss.example.com`（**B-01**），所以**上线前**扫出来/复制到的是假域名。**拿到域名时**：① `siteConfig.site_url` 填真域名 ② 重建 ③ 把 `verify:ui` 里"站点 URL 用的是本站占位域名"那条断言翻成真值断言。**我会主动提醒你**。

> **当前口径（数字只认这一行）**：`pnpm verify:ui` **157 项断言**全绿 · 截图 **24 张** · `pnpm verify:posts` **18 篇 0 错误** · 三份文档 v1.24 · 阶段 P4 **全量迁移完成**（131 篇在站 + 120 张配图）

**最近变更**：2026-09-24 v1.23 —— **纠正上一版的一个误判（发起人澄清）**：v1.22 我把"二维码扫了没啥用"理解成"不要分享块"，把 `siteConfig.post.share` 关掉了；发起人澄清"**我要分享块啊**，只是后面提醒我添加域名而已" → **分享块已改回开启**（`share: true`），配置注释里写清"域名到位前二维码/复制链接指向占位域名（B-01）"，`verify:ui` 里那条断言也**反过来锁成"分享块必须在"**（防止以后被误删）。**域名为占位值时的表现是临时状态，不是功能坏了**；拿到域名后填 `site_url` + 重建即可（§1 第 6 条，我会主动提醒）。R-ID-08（关闭许可协议）不受影响，仍是关的。

**上一次变更**：2026-09-24 v1.22 —— **发起人评审先导文章时提的两条**：① **R-ID-08 关闭文章许可协议**（"这个许可协议似乎没有啥用啊"）—— `licenseConfig.enable: false`，文章末尾许可块与侧栏「许可」一行都不再显示（侧栏那项改成**条件展开**，不会留一个显示 `None` 的空行）；② **R-ID-09 分享块**（"这个二维码扫了也没啥用啊"）—— 根因不是组件坏了，而是海报二维码与「复制链接」取 `Astro.url.href`，而 `site_url` 还是占位域名（B-01）。`verify:ui` 154 → **157 项**、`pnpm check` 0 error、`pnpm build` exit=0、`verify:posts` 18 篇 0 错误。

**上一次变更**：2026-09-24 v1.20 —— **上游示例文章全部删除（发起人要求"先把原有的博客进行删除"）**：删掉 14 篇文章 + 15 张孤儿配图共 **29 个文件**，站点文章 32 → **18 篇（全是你的笔记）**、构建 62 → **47 页**、`lqips.json` 自动清掉 15 条孤儿记录；`verify:ui` 里 3 处指向 `/posts/firefly/` 的断言改用真实文章。验收：`verify:posts` 18 篇 0 错误、`verify:ui` **154/154**（当轮口径；R-ID-08/09 之后为 157）、`pnpm build` exit=0。

**上一次变更**：2026-09-24 v1.19 —— **流程再澄清（发起人纠正我的上一版）**：闸门**只有一道**——先导 18 篇确认没问题后**一次性全量导入**（批次 2~5 连着跑完），**不是每批都等确认**；v1.18 我把它写成了"逐批确认"，是理解错的一版，已在 §1 第 3 条、§9 第 9 条、`ARCH.md` §9.5 三处改回同口径。本轮无代码改动，当轮口径不变（154 项断言 / 24 张截图）。

**上一次变更**：2026-09-24 v1.17 —— **P4 内容迁移·批次 1（18 篇）**：新增 `scripts/import-posts.mjs`（默认 dry-run、`--write` 才落盘、`--batch/--cat/--only/--limit` 过滤、逐篇 JSON 报告）与 `scripts/verify-posts.mjs`（`pnpm verify:posts`：frontmatter/slug/图片存在性/站内链接/残留语法/榜单配图，出错退出码 1）。**图片解析改用「文件名精确匹配」而不是文档原先写的「顺序映射」**——实测 258 条本地引用里 116 条能在本文章的图片目录里按同名命中、4 条全库唯一同名命中，只有 2 条真的没有文件；顺带修掉三个真坑：① 文件名归一化把「空格+数字」当 Obsidian 重名后缀剥掉，`Pasted image 20260509141005.png` 这类时间戳被吃掉 → 同篇 6 张图塌成 1 张（陷阱 T36）；② 全库 `==x==` → `<mark>` 会把 C++ 的 `dist[t]==INF` 连成高亮（陷阱 T35）；③ 全文去行尾空白把 5 篇 100 处**代码块内**的空格剥了（陷阱 T37）。**验收**：`verify:ui` 从 142 项扩到 **154 项**（当轮口径；R-ID-08/09 之后为 157 项）（新增 R-CNT 块：图片真实加载/顺序/移动端/无 figure/URL 形态/双链改写/无残留/表格与代码块/无标题短笔记/归档与分类收录），截图 20 → **24 张**；`verify:posts` 32 篇 0 错误、6 条预期警告（4 条站内链接指向尚未导入的文章）。新增陷阱 **T34~T38**。

**上一次变更**：2026-09-24 v1.16 —— **修掉你指出的「图糊了 / 有些地方看不见」**（R-BG-01 画质与裁切）：① **不再多压一道** —— 原来我把原 JPG 转成了 webp q82，Astro 又压一遍，两代有损压缩叠起来就糊了；现在原图（1916×821 / 181~251KB）**直接入库、一个字节不动**，压缩只交给构建管线做一次，壁纸质量提到 **95**（满档变体 1916×821 / 303KB，之前是 143KB）；② **横幅加高到 80vh**（原来 65vh）—— 65vh 的框装 2.33:1 的图，`cover` 只保留 76% 的画面，现在 1918×966 窗口下可见 **95% 高 × 100% 宽**；③ 取景锚点从 `0% 20%`（只从右侧裁）改成 **`50% 35%`**（居中偏上）。新增陷阱 T32/T33 与探针 `reports/wallpaper-probe.mjs`（量 1918 / 1440 / 2560 三个尺寸的可见比例）。**还剩一个取舍等你拍板**：想让画面 **100% 完整**（0% 裁切），可以把横幅高度改成跟随壁纸比例（`min(92vh, 100vw / 2.333)`），代价是横幅更高（你那个窗口下约 822px / 85vh）。

**更早变更**：2026-09-24 v1.15 —— **横幅加了手动换图（R-BG-05）**：桌面两侧隐藏交互区（hover / Tab 才显形）+ 鼠标拖动换图；手机端只用手势。新增陷阱 T30（绑事件的脚本排在目标节点之前 → 点击静默失效）、T31（CDP `rawKeyDown` 不触发原生激活）。

**更早变更**：2026-09-24 v1.14 —— **P3 主体完成**：壁纸换成你给的 4 张（`scripts/convert-wallpaper.mjs` + 取景/暗罩断言）；桌宠「爱弥斯」常驻全站（九状态、拖拽、右键菜单、键盘、位置记忆、四种联动、三种降级、与看板娘互斥、与浮动按钮不重叠）。新增陷阱 T27（`--deep-text` 暗色下不生效）/ T28（`is:inline` 里不写表达式）/ T29（交互测试要等物理过程）。

**更早变更**：2026-09-24 v1.13 —— **配图通路实测 + 图片交付规格入档**（发起人：「排行后面加的不单是文字，还有图片」）：16:9 JPG 接进榜单实测通过（构建期自动出 6 档 webp + 自动写 LQIP），验完已完整还原；新增 `docs/imiss/rank-cover-guide.png` 比例对照图（5.7:1 / 1600×280 / ≤150KB）；三份文档与 README 同步规格。

---

## 2. 阶段进度表

权重口径：文档 10% + P0 5% + P1 20% + P2 10% + P3 15% + P4 15% + P5 20% + P6 5% = 100%

| 阶段 | 名称 | 交付物 | 验收 | 进度 | 状态 | 依赖 |
| --- | --- | --- | --- | --- | --- | --- |
| **P0** | 仓库基线与工具链 | 工作区 = Firefly 副本 + 依赖装好 | `pnpm check` / `type-check` / `build` 通过；断网构建通过 | **100%** | ✅ 已完成（待审查） | — |
| **P1** | 站点身份与导航改造 | 站点名/配色/导航树/侧边栏三处改动 | `pnpm verify:ui` **52/52 通过**（当轮口径；脚本现已扩到 107 项）；截图核对（1440 / 390） | **100%** | ✅ 已完成（含审查后修订，待审查） | P0 审查通过 |
| **P2** | 排行子系统 | 三个榜单页（日漫/国漫为双维度、二游为单一榜）+ 5 份数据 + 全剧/单集切换 | 榜单视觉对齐参考图；`?kind=ep` 直开正确；二游无维度切换；空/缺图不崩 | **100%** | ✅ 已完成（含独立审查后修订，待审查） | P1 审查通过、B-08（数据可后补） |
| **P3** | 背景壁纸与桌宠 | 图片期壁纸 + 桌宠组件 | 三种降级可用；桌宠九状态与键盘可达 | **90%** | 🟡 主体完成（P3-8 视频期待你确认素材） | P0 |
| **P4** | 内容迁移 | 批次 1（18 篇）→ 全量 135 篇 | `pnpm verify:posts` 通过；抽查无断裂图片与残留 `![[` | **33%** | 🟡 批次 1 完成（18/135 篇，待发起人审查） | P0、P1 |
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
- [x] P1-3 临时 Logo 与 favicon（R-ID-04；**当天即被 P1-14 换成手写 SVG 标识，见下**）—— **新增 `scripts/make-logo.mjs`（当时从图集第 1 格裁头像，`nearest` 放大到 128），产出 `imiss-light/dark.webp` 与 `imiss-{32,128,180,192}.png`；导航栏 Logo 与 favicon 均已接上**
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
- [x] P1-14 换 Logo（发起人反馈）—— **改为手写矢量标识 `imiss-logo.svg`（粉晶体心 + 青色星芒 + 机械翼片 + 深蓝紫方圆底）；`make-logo.mjs` 改为从该 SVG 栅格化（sharp）；32px favicon 下实测可辨；桌宠图集不再参与 Logo**
- [x] P1-15 删除订阅功能（R-ID-06）—— **删 5 个文件（`pages/{rss,atom}.astro`、`pages/{rss,atom}.xml.ts`、`utils/feed-utils.ts`）+ 摘 4 处接线（head alternate / 页脚 / 横幅图标行 / 资料卡）；`dist` 与 sitemap 里已无相关产物；恢复清单见 `ARCH.md` §14.4**
- [x] P1-16 定位「显示设置面板」并登记 R-ID-07 —— **`git diff 3dbc38d..HEAD` 证明 `config/displaySettingsConfig.ts`、`components/controls/*`、`utils/display-settings-utils.ts`、`types/displaySettingsConfig.ts` 一个字节未改；面板本体 38.4KB 仍在。它是上游默认 `enable: false`。实测 `PUBLIC_DISPLAY_SETTINGS=true` 可开启：dev 下 `<button id="display-settings-switch">` 与面板触发都在，未设变量的 `dist` 为 0**
- [x] P1-17 开启显示设置面板（R-ID-07）—— **发起人决定对访客全开：`displaySettingsConfig.enable: true`，13 个条目全部保持开启。实测体积代价：每页 HTML +11.6 KB（38 页合计 +439.7 KB，dist 20.76→21.19 MB），`_astro/*.js` 总量无变化——比上游注释估的 33 KB/页低得多。`verify:ui` 新增 2 条断言（面板按钮与容器已渲染），复验 59/59 全绿**
- [ ] P1-18 面板本身的改造（增删条目 / 样式 / 交互 / 重置按钮等）—— **发起人指示先不改，排在 P2、P3 之后**

### P2 排行子系统（R-RANK）　✅ 已完成（2026-09-24）

- [x] P2-1 类型与数据文件（`rankConfig.ts` + 4 组占位数据；**二游那第 5 份见 P2-11**）—— **`src/types/rankConfig.ts`（`RankKind`/`RankEntry`/`RankBoardConfig`/`RankConfig` + `dataStatus`）与 `src/config/rankConfig.ts`（日漫×全剧/单集、国漫×全剧/单集各 10 条占位数据 + 两句占位说明文案；两张演示剧照 `_demo-01/02.webp`）**；数组顺序即名次，改数据不用碰组件
- [x] P2-2 `RankBoard.astro` 榜单板 —— **名次列（两档配色）+ `ImageWrapper` 剧照铺满 + 横向 scrim（`mask-image` 与名次列自然衔接）+ `data/rank` 逐行入场动效 + 缺图渐变占位 + 空数据"榜单待更新"**；页头为"标题在左、维度切换在右上"
- [x] P2-3 全剧/单集切换（**原计划 `RankTabs.svelte`，实际改为组件内联脚本**）—— **解析期读 `?kind=` 落定选中态（静态输出下 SSR 读不到查询串，交给 Svelte mount 会先闪一下「全剧」，实测翻转 63ms < 首帧 80ms）；`history.pushState` 同步 URL（只在维度真的变了时写历史）、`popstate` 复用同一套 `apply()`；`role="tablist"/"tab"` + `aria-selected` + roving tabindex + ←/→ 键；非当前面板 `aria-hidden` + `inert`；Swup 切页靠 `root.dataset.rankReady` 做幂等（**少了这层守卫就会把 click 绑两遍，见 P2-9**）**。零请求、零 hydration
- [x] P2-4 三个页面 + 导航接入（当时是 index/jp/cn 三个路由；**第四个路由 `game.astro` 见 P2-11**）—— **`src/pages/rank/{index,jp,cn}.astro`（index 跳 `/rank/jp/`；数据缺失时 `Astro.redirect("/404/")`）；导航「排行」两项 P1 时已指向这两个路由，本次补齐页面后不再 404；`/rank/` 存根不进 sitemap，也不进 llms.txt**
- [x] P2-5 浅色主题与移动端适配 —— **1~3 名粉在两种主题下统一用加深一档的 `#E2696B`（白字 3.25:1）；缺图占位用不透明深底，亮/暗两套主题都有"最亮处对白字 ≥ 4.5:1"的断言；新增亮色主题整页截图；移动端行高 `max(64px, 20cqw)`、名次列仍 13.7%、短评胶囊隐藏**
- [x] P2-6 空数据 / 缺图 / 超长标题边界 —— **缺图（含"写了路径但文件不存在"）统一走渐变占位（有图/无图互斥且覆盖全部条目，已断言）；空数组渲染"榜单待更新"；标题 `-webkit-line-clamp: 2`；`RankBoard` 模板里 `.map()` 回调不能写多语句（Astro 限制），行数据在 frontmatter 预先算好**
- [ ] P2-7 填入真实数据（等 B-08）—— **现在是占位数据 + 页面底部占位提示；`dataStatus: "placeholder"` 改成 `"final"` 即收尾**
- [x] P2-8 自查修正（4 个真问题，均为实测发现）—— **① 行高比例算错**：`clamp(76px, 17.4vw, 132px)` 在 1440 视口下被上限卡住，实测行高比 **21%**（参考图 17.4%）→ 改容器查询单位 `17.4cqw`/`13.7cqw`，复测 1440 为 **17.3%**、1920 为 **17.4%**、名次列两处都 **13.7%**；**② 亮色主题下缺图占位糊白字** → 占位改为"不透明深色底 + 半透明渐变"；**③ 入场动效让无 JS/爬虫/截图看到空白** → 隐藏态改挂 `html[data-rank-anim="1"]`（解析期内联脚本设置）+ `@media print` 兜底；**④ `/rank/` 跳转存根混进 sitemap** → `astro.config.mjs` 排除，并在 Nginx 用 301 接管（`ARCH.md` §12.2，**属 P6 待落地项**）。四条均登记为陷阱 T20~T23
- [x] P2-9 独立审查（子 agent，只读）发现的 1 阻断 + 3 应修 —— **①【阻断】Swup 路径下 tab 监听重复绑定**：`@swup/scripts-plugin` 重跑容器内联脚本一次、`astro:page-load` 又触发一次 → 同一按钮绑两个 click，点一次「单集」pushState 两次、**按一次后退回不到「全剧」**（R-RANK-02 验收不成立）。已加 `root.dataset.rankReady` 幂等守卫，并**新增"经 Swup 点导航进来再切换"的回归断言**（原来只测 `Page.navigate` 直开，所以全绿却在带病）；顺带删掉 Swup 4.9.2 里根本不存在的 `swup:contentReplaced` 监听。**② 无 JS / 打印时「单集」榜看不见**：面板原来用 `hidden` 属性切换，而 Tailwind 4 preflight 是 `@layer base{…[hidden]{display:none!important}}`，**`!important` 分层优先于不分层**，自己样式表里怎么覆盖都没用 → 改用 `rank-panel--off` class + `html[data-rank-js="1"]` 标记，打印/无 JS 时两块都可见（陷阱 T24）。**③ `cover` 写了但文件不存在时无兜底**：`ImageWrapper` 找不到图**什么都不渲染** → 那一行在亮色主题下是白卡片 + 白字；现在 `RankBoard` 自己按 `/src/**` glob 先判一次，解析不到按缺图走渐变占位（陷阱 T25）。**④ 1~3 名白字压 `#EA7B7C` 只有 2.76:1**（WCAG AA 大字要 3:1）→ 取加深一档 `#E2696B` = 3.25:1，并加断言锁住
- [x] P2-10 审查后自查再加两处 —— **① 短评胶囊从"绝对定位压在行上"改成网格第 2 列**（原来长标题最后一行有 60px 被胶囊盖住）；**② 胶囊宽度上限从 `45%` 改成 `40cqw`**——百分比上限在 auto 轨道里会把它压成一个小圆点（截图里发现），断言也从"不重叠"加强为"不重叠 **且** 自身没被压扁"（陷阱 T26）
- [x] P2-11 新增「二游排行」（R-RANK-07，发起人在审查时提的需求）—— **导航「排行」下拉第三项 → `/rank/game/`；榜单板与视觉规格和另两榜完全一致，但没有「全剧 / 单集」**。实现要点：`RankBoardConfig.data` 类型放宽为 `Record<RankKind, RankEntry[]> | RankEntry[]`，组件按 `Array.isArray(board.data)` 判断，单一榜只生成一块面板、整个不渲染 `.rank-tabs`；内联脚本的初始化守卫从"有面板且有按钮"改成"**有面板**"，否则单一榜会连带丢掉入场动效；页面图标换成游戏手柄。类型收窄必须在同一表达式里做 `Array.isArray`（先存布尔变量再判会报 ts(7053)）。`verify:ui` 新增 6 条断言、截图 2 张
- [x] P2-12 配图通路端到端实测（发起人明确"以后要能给每个名次加背景图"）—— **发起人的意思是：以后每条数据 = 标题 + 原名/短评 + 一张背景版。发起人同时明确"不用加 tags / position 字段，只要确保以后加图能达到预期效果"**，所以本轮**不动代码逻辑**，只把"能加图"这件事验到有证据：① 用仓库里现成的 16:9 壁纸做了一张 **JPG（1600×914, 173KB）**，接进「国漫·全剧」第 3 名 → `pnpm build` exit=0、**构建期自动产出 6 档 webp + 自动写入 `lqips.json` 占位色**、页面输出带 `srcset` 的 `<img>`；② 截图确认：居中裁成宽条、**不变形**、标题白字清晰（`reports/screenshots/rank-cover-live-test.png`，行内实拍裁切图）；③ 验完**已完整还原**（删测试图 + 还原 `rankConfig` + 重新构建，`git diff` 归零）；④ 新增对照图生成脚本 `scripts/make-rank-cover-guide.mjs` → `docs/imiss/rank-cover-guide.png`（16:9 裁成 5.7:1 后哪条留下、哪条被切，给发起人准备素材时看）。**结论：以后加图只需"放文件 + 写一行 `cover`"，不需要改任何代码**

### P3 背景壁纸与桌宠（R-BG / R-PET）

- [x] P3-1 壁纸转换脚本 + 4 张图转 webp 接入（R-BG-01）—— **新增 `scripts/convert-wallpaper.mjs`（sharp，不引新依赖）：`dosc/photo` 4 张 1915×821 → `imiss-d1~d4.webp`（桌面，长边 2560 不放大）+ `imiss-m1~m4.webp`（移动，长边 1600）；`backgroundWallpaper.ts` 的 desktop/mobile 都换成这批，上游示例图 `d1~d6`/`m1~m6` 共 12 个文件已删除（`lqips.json` 的 12 条旧记录由构建自动清掉）。实测 4 张 114~183KB；源图 1915×821 在 2560 屏会放大 1.34 倍 → 已标注为临时占位**
- [x] P3-2 主页横幅文案与链接（R-BG-03）—— **沿用 P1 的占位文案（标题 `IMiss Blog`、三条副标题打字机、链接图标行保持关闭）；正式文案仍等 `B-10`**，改一行即可
- [x] P3-3 取景锚点与暗罩（R-BG-04）—— **`banner.position: "0% 20%"`（保头脸）、`common.dimOpacity: 0.2`；`verify:ui` 新增断言：渲染出的 `object-position` 与配置一致、暗罩 alpha = 0.2（第一版读的是 `opacity`，恒为 1，已改成读 `background` 的 rgba alpha）**
- [x] P3-4 桌宠组件骨架（R-PET-01）—— **新增 `src/components/features/AemeathPet.astro`（DOM + 行为）+ `src/styles/pet.css`（样式**故意不用组件 scoped style**：JS 动态生成的星屑节点拿不到 Astro 的 scope 属性，样式会静默失效）+ `src/utils/pet-utils.ts`（状态表，验收脚本共用一份）+ `src/config/petConfig.ts` + `src/types/petConfig.ts`；挂在 `Layout.astro` 的 Swup 容器**之外**（`<WavesEffect />` 之后），切页不重建；移动端由解析期内联脚本打 `html[data-pet-off]`，脚本直接不启动**
- [x] P3-5 九状态与交互（R-PET-02）—— **从原型 `blog_test/assets/js/pet.js`（620 行、已验证）移植，按本站钩子重接；图集 8×9 单格 144×156，第 2 行是与第 1 行逐像素相同的副本 → 左走用 `scaleX(-1)`；状态表 `PET_STATES`（idle / running-right / running-left / waving / jumping / failed / waiting / running / review，含 `once` 与 `dy:-3`）；交互：单击跳、双击庆祝（纯 CSS 星屑）、按住拖动（松手重力落地）、右键五项菜单（说句话 / 跳一下 / 跟过来 / 睡一会儿 / **和爱弥斯聊天**）、键盘 Tab / Enter / ←→ / Esc、位置记忆 `localStorage["imiss.pet.pos"]`**
- [x] P3-6 站点联动与降级（R-PET-03）—— **搜索框打字→执行任务（停 1.4s 回待机）、模板 `theme-change` 事件→完成反馈、Swup `astro:page-load`→招呼 + 重新量尺寸、`/posts/` 与 `/archive/` →安静模式（不在正文下来回走）、reduced-motion→不跑 rAF 停在待机首帧但点击/对话仍可用、切后台→停 rAF、移动端隐藏；**没有后端时的对话走本地 mock 回复**（气泡里明说"我还没连上大脑"），P5 接真 Agent**
- [x] P3-7 与看板娘互斥、浮动按钮不遮挡（R-PET-04/05）—— **`pioConfig` 两个看板娘开关保持 false（`verify:ui` 静态核对）；宠物默认站位为右下角浮动按钮列预留 64px（第一版只看"按钮当前是否可见"，结果滚动后按钮冒出来正好压住宠物：实测宠物右边缘 1416 > 按钮左边缘 1409），现在 `rightLimit()` 按固定预留 + 可见时再收窄，walkTo 也受它约束；z-index 66 低于浮动控件；实测滚动后重叠数 = 0**
- [x] P3-9 横幅两侧隐藏换图键（R-BG-05，发起人 2026-09-24 提的需求）—— **桌面端两侧各一个真 `<button>` 交互区**（默认 `opacity: 0`，hover / Tab 聚焦才淡出箭头 + 边缘暗角），点击切上一张/下一张、**循环**；**鼠标与触屏都可以按住横向拖动换图**（同一套 pointer 手势，阈值 60px，先判"横向意图"避免抢掉链接点击与文字选择）；**手机端不显示交互区、只用手势**（发起人明确）。实现上**复用模板现成的 `changeToSlide()`**（循环 / 懒实例化 / 1000ms 过渡 / 防连点都在那边），轮播脚本把它挂到 `window.__imissChangeToSlide` 供另一个人脚本调用；交互区放在 Swup 容器**之外**（否则切页会被换掉、监听全失效），`z-index: 30` 高于暗罩。配置在 `backgroundWallpaper.banner.manualSwitch`（enable / zones / drag / dragThreshold）。`verify:ui` 新增 **9 条断言**（点右 / 点左 / 连点一圈回原点 / 键盘 Enter / 鼠标拖拽 / 手机端不显示 / 手机滑动 / 默认不可见且 hover 才显形 / aria-label + 可聚焦）
- [ ] P3-10 按北京时间决定首屏默认素材（R-BG-06）—— **发起人预告的功能，细节待补充**（分几个时段、各对应哪张素材）。当前实现是「每次刷新在 4 张里随机一张」（`WallpaperSection.astro` 的 `startIdx`），改成按时间选择时替换这一段即可，**不需要动别的**
- [x] P3-11 修正画质与裁切（发起人 2026-09-24 反馈「你似乎进行了图片裁剪或压缩，导致图片模糊或有些地方看不见，这是不可以的」）—— **两个问题都定位到具体数字并修掉**：① **发糊 = 同一条图被压了两代**：我先把原 JPG 转 webp q82（201KB → 143KB，尺寸没变、掉的全是细节），Astro 又按 `imageQuality`(85) 压一遍 → `convert-wallpaper.mjs` 改成**只复制改名不重编码**（原图 1916×821 / 181~251KB 直接入库），壁纸 quality 单独提到 **95**（`WALLPAPER_QUALITY`），满档变体现在 **1916×821 / 303KB**，只经过构建管线一代压缩；② **看不见 = 横幅太矮**：65vh 的框装 2.33:1 的原图，`cover` 只保留 76% 高度 → `BANNER_HEIGHT` 65 → **80vh**（必须改常量，它同时驱动内容起始位置与滚动视差），并把 `banner.position` 从 `0% 20%`（只从右侧裁）改成 **`50% 35%`**（居中偏上）。实测 1918×966 下**可见高 76% → 95%、宽 100%**；1440×900 可见宽 85%；2560×1440 可见宽 95%。新增探针 `reports/wallpaper-probe.mjs` 量这三个尺寸的可见比例，登记陷阱 **T32**（同图压两代）、**T33**（`object-position` 百分比是"对齐点"不是"偏移量"）
- [ ] P3-8 视频期壁纸（R-BG-02）—— **素材其实已经在原型里做好了**：`blog_test/blog_test/assets/video/hero-loop.mp4`（1280×720 / 5.088s / 15.4Mbps / **9.23MB 原片直出**）+ `hero-loop.webm`（1280×640 / 10.05s / VP9 / **11.57MB 正放倒放回文**，循环点帧级无缝）+ `assets/img/hero-loop-poster.webp`（1280×720 封面帧 209KB），两个版本都在 `prd.md` §6.1 的 ≤12MB 预算内。**等你确认要不要现在接**：接的话要①拷素材到 `public/assets/videos/` ②打开 `playerUrl` + `playerEnable` ③给模板的 `BackgroundPlayer.astro` 补三种降级（它现在**完全没有** reduced-motion / saveData / visibilitychange 处理，见 T11）**

### P4 内容迁移（R-CNT）

- [x] P4-1 `import-posts.mjs`（dry-run + 报告）—— **`scripts/import-posts.mjs`**：默认 dry-run 只出报告，`--write` 才落盘；过滤参数 `--batch 1..5|all`、`--cat`、`--only`（可重复）、`--limit`、`--src`；逐篇报告写到 `reports/import-report.json`，落盘时另出 `reports/image-mapping-<slug>.json`。**图片解析不是文档原先写的"顺序映射"**：实测 258 条本地引用里 **116 条**能在本文章的图片目录里按**同名**命中、**4 条**全库唯一同名命中、只有 2 条真的没有文件，所以规则改成"**只做名字精确匹配 + 全库唯一同名兜底，绝不按顺序猜**"（猜错位置比缺图更糟）。frontmatter 的 `title` 取**文件名**而不是首个 H1（实测 `stL/Stack.md` 的首个 H1 是"核心概念"、`基础算法/前缀和.md` 的首个 H1 是"一维前缀和"，取 H1 会得到错标题）；`tags` 优先用作者自己写的 Obsidian 标签行（`#预处理 #前缀 #基础算法`）；`published` 取文件 mtime（**需要你确认是否接近真实写作时间**）
- [x] P4-2 批次 1：18 篇人工核对并定型 —— **覆盖六类形态**：有图（`HTTP 协议` 6 张 / `缓冲区` 1 张 / `可变参数模板与emplace系列` 1 张 / `数据库基础与 MySQL` 1 张）、无图、超长文、含表格、含代码块、含 `![[...]]` 与 `[[双链]]`。**图片位置逐张核对过**：9 张图与源文件 SHA256 逐字节一致、引用顺序 = NN 编号顺序、无重复占用；两张有代表性的图（URL 结构图、HTTP 方法表）人工看图确认内容与所在小节相符；另派独立子 agent 用 `read_image` 把 9 张全部看过一遍并出表（结论：9/9 相符）。**内容保真也独立复核过**：18 篇零丢段、代码块 105 个逐块一致、无残留 Obsidian 语法、frontmatter 全部合法、两组重复篇（`二分`/`二分算法`、`动态规划`/`动态规划思想`，MD5 相同）保留正确
- [x] P4-3 `verify-posts.mjs` + `pnpm verify:posts` —— **`scripts/verify-posts.mjs`（阻断式，出错退出码 1）**：frontmatter 必填字段与类型、slug 唯一且 ASCII、正文非空、**本地图片路径真实存在（含 0 字节检查）**、`frontmatter.image` 存在性、站内链接目标存在、残留 Obsidian 语法（`![[`/`[[`/`%%`/`^blockid`）、标题重复、`rankConfig` 的 title 与 cover；`--quarantine` 可把出错文章移到 `src/content/_quarantine/`（默认只报告不动文件）。实测 **32 篇 0 错误、6 条警告**（4 条是站内链接指向本批次还没导入的文章 + 1 条是 `AI应用/SDD` 全篇没有标题 + 1 条是 `draft.md`）。**与 ARCH §9.4 的差异**：「正文至少有一个标题」从报错降级为警告——源笔记 `AI应用/SDD.md` 全篇只有一条编号清单、没有任何标题，不该替它编一个
- [x] P4-4 批次 2~5 全量迁移（**余下 117 篇**：批次 2 = C++11 + C与C++ + STL；批次 3 = Linux系统 + linux网络 + MySQL；批次 4 = 基础算法 + AI应用；批次 5 = 八股 + 项目） —— **已完成**：批次 2~5 全量导入，落盘 113 篇新增（累计 131 篇在站）、复制 125 张配图（24.7MB）、构建 170 页；`verify:posts` 131 篇 0 错误。**AI应用 两篇按发起人指示跳过**（见 P4-6）
- [x] P4-5 去重与分类/标签/摘要抽检（去重已实现：MD5 相同的只保留被双链指向的那一篇） —— **已完成**：去重 2 组（保留被双链指向的那篇）+ 4 个独立子 agent 按分类抽检（40 / 26 / 46 / 18 篇），结论全部可放行；已知小瑕疵：31 篇作者标签被折叠进分类名、6 篇 STL 摘要里的 `` `#include <string>` `` 被抹成 `include`（均为观感级）
- [x] P4-6 缺图文章处理（AI应用 两篇共 125 张 `page-*.png` 全缺 + `Linux系统/ELF文件` 5 张 + 八股 4 篇 8 张，等 B-06 / B-13） —— **部分完成**：`Linux系统/ELF文件` 曾被误判缺图（独立复核抓到后已修，图其实都在，现为 8 处真缺图 + 0 篇 draft）；`AI应用` 两篇（`LangChain 能力详解` 351KB、`LangGraph 能力详解 · 学习笔记` 389KB）按发起人 2026-09-24 指示**暂不导入**，脚本已写进跳过名单（`SKIP_SOURCES`）并要求之后主动提醒
- [x] P4-7 归档/分类/标签/系列页数据核对（批次 1 已加断言：`/archive/` 收录、`/categories/` 出现新分类名） —— **已完成**：`verify:ui` 有 `/archive/` 收录与 `/categories/` 分类名断言；`/series/` 由 `项目` 的 `My_Server`（4 篇）/`搜索引擎`（2 篇）填充，序号连续无重号（子 agent 复核）
- [x] P4-9 按发起人评审意见收尾两处显示（**2026-09-24 先导文章评审时提的**）：① **R-ID-08 关闭文章许可协议** —— `licenseConfig.enable: false`，文章末尾许可块不再渲染；`SiteInfo.astro` 的「许可」项改成条件展开（关掉时整项不渲染，不留 `None` 空行）；② **R-ID-09 分享块保留**（发起人澄清"我要分享块啊，只是后面提醒我添加域名而已"）—— `siteConfig.post.share: true` 不动，只在配置里写清"域名到位前二维码/复制链接指向占位域名"，并把"拿到域名→填 `site_url`→重建→翻断言"登记成 §1 第 6 条的提醒项。`verify:ui` 新增 3 条断言（文章页无「许可协议」/无 `creativecommons.org`；侧栏既无 CC 也无 `None`；**分享块存在**——这条是**故意断言"存在"**，防止以后被误删）
- [~] P4-8 替换上游示例内容页（**前半已完成**：发起人 2026-09-24 要求"先把原有的博客删除" → 已删掉 **29 个文件**：14 篇上游示例文章（`firefly.md`、`guide/*`、`code-examples.md`、`markdown-*`、`katex-math-example.md`、`encrypted-demo.md`、`mdx-example.mdx`、`video.md`、`draft.md`）+ 15 张只被这些文章引用的图片（`posts/images/*.avif`、`guide/cover.avif`）；`verify:ui` 里 3 处 `/posts/firefly/` 断言改用迁移进来的真实文章；构建从 62 页降到 **47 页**、`lqips.json` 自动清掉 15 条孤儿记录）。**后半：发起人 2026-09-24 决定「先留着，将来会进行替换，记得提醒」** —— 剩余上游示例 = **书签导航**（`booknavConfig.ts` 的 Firefly/CuteLeaf 卡片 + `firefly-32.png`）、**相册**（`public/gallery/firefly-2026/*`、`gallery/encrypted-test/*`）、**动态**（`src/content/dynamic/` 4 条 + `s41.ax1x.com` 外链图）、**关于页**（`src/content/spec/about.md`）、**项目**（`projects/firefly.md`、`example-project.md`）；**每次开工主动提醒发起人提供内容**（§1 第 5 条）

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
| **B-03** | 正式 Logo 未提供 | R-ID-04 | 发起人提供，或确认长期用当前设计 | **P1-14 已换成手写矢量标识**（设计源 `src/assets/images/logo/imiss-logo.svg` → `pnpm make:logo` 栅格化出导航栏 webp 与 favicon 四档；不再是从桌宠图集裁的头像）。正式设计到位后替换该 SVG 后重跑 `pnpm make:logo` 即可，无需改代码 | 🟢 可延后 |
| **B-04** | 壁纸视频未制作 | R-BG-02 | 发起人产出视频（源宽度建议 ≥2560） | 视频文件到位 | 🟡 非阻断（图片期先跑） |
| **B-05** | 番剧页缺 MAL `username` + `Client ID`；轻小说页缺 VNDB `userId` | R-NAV-03 两个页面的数据 | 发起人注册并配置 | **P1 已把两页打开（`vndb: true` / `mal: true`）**，空凭据下不联网、显示"数据源还没配置"卡片；填上凭据即刻有数据 | 🟡 非阻断（页面先空着） |
| **B-06** | `AI应用` 两篇缺配图（`images/page-*.png` 在磁盘上不存在） | R-CNT-07 | 发起人找回配图，或确认这两篇不上线 | 图片到位或确认永久隔离 | 🟢 可延后 |
| **B-07** | `DEEPSEEK_API_KEY` 未提供（可选 LangSmith Key） | R-AGT-01、R-AGT-02 | 发起人提供 Key（放 `agent/.env`，不入库） | Key 配好，能跑通一次对话 | 🔴 阻断 P5 |
| **B-08** | 排行数据未提供：**日漫/国漫各 2 组（全剧 + 单集）= 4 组，二游 1 份名单（无维度）**，共 **5 份**；以及**每个名次一张背景版** | R-RANK-04、**R-RANK-07** | 发起人给数据与图片（可以先给 3~5 条示例；二游那榜直接给一串名字即可，不分维度）。**图片规格：比例 5.7:1、推荐 1600×280、单张 ≤150KB、格式不限、图上不要做字**；对照图 `docs/imiss/rank-cover-guide.png`，操作步骤见 `README.md`「以后怎么给榜单配背景图」 | `rankConfig.ts` 里 5 份数据都填上 + 5 个榜单各 10 张配图接上，并把 `dataStatus` 改成 `"final"` | 🟡 非阻断（**P2 已用占位数据把 3 个页面与机制做完**；配图通路已端到端实测，只差内容） |
| **B-09** | 留言评论系统选型未定 | R-CMT-01 | 发起人从 Waline / Twikoo / Giscus / Artalk 中选一个 | 选型确定并可部署 | 🟢 可延后（已决定先关评论） |
| **B-10** | 主页横幅文案与「链接」下拉内容未定 | R-BG-03、R-NAV-07 | 发起人提供文案与网站列表 | **P1 已把「链接」下拉收窄为 2 条 Firefly 署名链接**（原来第一条是主题作者的 GitHub、第二条是作者的 Gitee 镜像，容易误认成本站仓库）；横幅文案仍留给 P3 | 🟢 可延后 |
| **B-11** | 本机未安装 `uv`（Python 包管理器）；Agent 依赖安装路线未定 | P5-1 | 执行方（可 `pip install uv`，或直接用 `pip install -e .`） | 依赖装好，`langgraph dev` 能起 | 🔴 阻断 P5（可自行解除） |
| **B-12** | 旧博客 `linux网络/HTTP 协议.md` 的两张抓包截图（现 `public/images/posts/http-xieyi/02.png`、`04.png`）里有**明文账号密码**（`username=…&password=…`）、真实域名与 `JSESSIONID` Cookie | R-CNT-03（文章内图片） | 发起人决定：打码 / 裁掉那两行 / 保持原样（**其余 7 张图没有这个问题**） | 二选一落定 | 🟡 非阻断（但**上线前必须处理**——P4 批次 1 审查时发现） |
| **B-13** | `八股/` 那批 12 篇（约 1.1MB，占迁移量一大半）看内容与图片外链像第三方公开仓库 `guaguaupup/cpp_interview` 的整理稿：正文图片 hotlink 在 `cdn.jsdelivr.net/gh/guaguaupup`、`luogou/cloudimg` 等别人的图床上（204 个外链 URL 抽样全部存活），README 也写着该仓库的链接 | R-CNT-05（图片与署名） | 发起人决定：① 是否署来源/加 `sourceLink`；② 是否把外链图片转存到本站（约 260 张、需联网）或保持 hotlink | 二选一落定 | 🟡 非阻断（批次 5 才会迁到，可以先不动） |

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
| **PowerShell 的退出码陷阱** | ⚠️ 已知噪声 | `pnpm build 2>&1 \| Select-Object -Last 40` 这类**管道**会把退出码报成 **1**（实际构建成功）；要判断成败就用 `& pnpm build *> 日志文件` 再读 `$LASTEXITCODE`。P2 因此虚惊过一次 |
| **PowerShell 写文件的 BOM 陷阱** | ⚠️ 已知 | `Set-Content -Encoding UTF8` 在某些 pwsh 版本下会给文件加 **UTF-8 BOM**（本轮就污染过 `src/config/rankConfig.ts`，`git diff` 里表现为首行多一个不可见字符）；改仓库里的文件优先用编辑器/Node，或改完用 `git diff` 扫一眼首行 |
| **PowerShell 重定向的编码陷阱** | ⚠️ 已知 | `*>` / `>` 写出来的是 **UTF-16LE**（带 BOM），Node 按 utf8 读会得到夹着 `\\u0000` 的乱码；要读这类日志先看 BOM（`scripts/verify-docs.mjs` 的 `readAny()` 就是这么做的）。要写 UTF-8 就用 `Set-Content -Encoding UTF8` 或 `Out-File -Encoding utf8` |

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
| 2026-09-24 | **P1 审查后修订 + 复验** | 修完审查提出的 1 阻断 + 2 应修（首页横幅的上游 Sponsor/邮箱/GitHub、`vndb.mode`、`siteStartDate`），横幅标题与副标题一并换成占位；`verify-ui.mjs` 修掉 3 处假绿、新增**渲染结果泄漏扫描**（上游邮箱/ID/打赏链接/横幅标题）与 5 条缺失断言（文章页打赏按钮、description/keywords、导航 Logo、留言页副标题、把"关于我"的弱断言 `length > 100` 换成内容标志断言）、对比度改为 token 级 + `--hue` 345↔165 的 A/B。**复验：52 项功能断言全绿、exit=0** |
| 2026-09-24 | **P1 修订（发起人反馈）** | ① **换 Logo**：原来的像素头像不好看／不合适 → 改为**手写 SVG 标识**（`src/assets/images/logo/imiss-logo.svg`：粉色晶体心 + 青色星芒 + 机械翼片 + 深蓝紫方圆底），`make-logo.mjs` 改为从该 SVG 栅格化；32px favicon 下实测可辨。② **新增需求 R-ID-06：删除订阅（RSS/Atom）功能**——删掉 5 个文件（`pages/{rss,atom}.astro`、`pages/{rss,atom}.xml.ts`、`utils/feed-utils.ts`）并摘掉 4 处接线（head 的 alternate 链接、页脚 RSS/Atom、首页横幅图标行、资料卡图标）；`siteConfig.feed` 标注为无消费方。恢复清单写进 `ARCH.md` §14.4 |
| 2026-09-24 | **P2** 排行子系统（R-RANK-01~06；二游排行见下一条） | `prd.md` R-RANK-01~06 落地：`types/rankConfig.ts`、`config/rankConfig.ts`（4 组 × 10 条占位数据 + 2 张演示剧照）、`components/pages/rank/RankBoard.astro`、`styles/pages/rank.css`、`pages/rank/{index,jp,cn}.astro`。`pnpm check` 0 error/0 warning、`pnpm type-check` exit=0、`pnpm build` exit=0 |
| 2026-09-24 | **P2 增补：二游排行（R-RANK-07，发起人审查时提的需求）** | 导航「排行」加第三项 → 新增 `src/pages/rank/game.astro` + `rankConfig.boards.game`（**单一榜**）。类型 `RankBoardConfig.data` 放宽为 `Record<RankKind, RankEntry[]> \| RankEntry[]`，组件按 `Array.isArray(board.data)` 决定是否渲染切换按钮（**不塞假维度**，也不靠 `board.id === "game"` 硬编码）；内联脚本守卫从"有面板且有按钮"改成"有面板"（否则单一榜丢动效）。`verify:ui` **107 项断言全绿**、截图 15 张（新增 `rank-game-1440/390.png`） |
| 2026-09-24 | **P2 验收工具扩容** | `scripts/verify-ui.mjs` 从 **59 项扩到 101 项断言**（当轮口径；二游排行加入后为 **107 项**）（新增 42 条：排行榜本体 + Swup 路径回归 + 打印/无 JS 兜底 + 两档对比度 + 几何与边界 + llms.txt/sitemap/canonical）：两个榜单页渲染/标题/条数、默认全剧、点单集后**真点一次 + `history.back()`** 验证 pushState/popstate、`?kind=ep` 直开、tab 语义、行高与名次列**比例**、两档底色与数字色（精确到 `rgb()`）、配图与占位互斥、390px 无横向溢出、缺图占位在**亮/暗两套主题**下对白字 ≥ 4.5:1、sitemap 不含 `/rank/` 存根。截图 **13 张**（新增 6 张：日漫/国漫/单集/亮色/1920 宽屏/手机） |
| 2026-09-24 | **P2 自查修掉 4 个真问题** | ① **行高比例算错**：`clamp(76px, 17.4vw, 132px)` 用视口宽表达"内容宽的 17.4%"，1440 视口下被 132px 上限卡住，而榜单板只有 629px 宽 → 实测 **21%**（参考图 17.4%）。改为 `container-type: inline-size` + `17.4cqw`/`13.7cqw`，复测 **17.3% / 13.7%**。② **亮色主题下缺图占位糊白字**（半透明渐变罩在白卡片上变浅粉）→ 占位改"不透明深色底 `hsl(var(--hue) 28% 20%)` + 半透明渐变"，并加断言锁住。③ **入场动效把无 JS 场景变成空白**：整页截图里 5~10 名全空（未进视口的行永不触发）→ 隐藏态改挂 `html[data-rank-anim="1"]`（解析期内联脚本设置）+ `@media print` 兜底。④ **`/rank/` 跳转存根混进 sitemap**（noindex 页不该被提交）→ 配置里排除 + Nginx 301 接管。**四条全部登记为陷阱 T20~T23** |
| 2026-09-24 | **P2 验证脚本自身的两个坑（已修）** | ① 断言里把 `facts["rank-jp-after-click"].rank` 当成了整页事实，读 `search` 恒为 `undefined` → 把 `search` 收进 `rank` 事实对象；② 截图前"模拟滚动"用了 `window.scrollTo(0, y)`，而本站 `html { scroll-behavior: smooth }` 让它是**动画**，每步 90ms 根本没滚动 → 截图里榜单仍是空白，**据此误判过两次**；改 `behavior: "instant"` 后正常 |
| 2026-09-24 | **P2 独立审查（子 agent，只读）** | 结论"主体可交付，但有 **1 条阻断** + 3 条应修"。阻断：**Swup 路径下 tab 监听重复绑定**（监听器 4→8，点一次 pushState 两次，一次后退回不到「全剧」）——`verify:ui` 全绿是因为它只走 `Page.navigate` 直开。应修：无 JS/打印下「单集」榜不可见、`cover` 写错路径无兜底、1~3 名白字对比度 2.76:1 低于 3:1。另指出文档三处数字打架（实测 86 / 文档 85 / ARCH 83）、ARCH 承诺的"缺图回落占位"不存在、`swup:contentReplaced` 是死代码、验证脚本若干弱断言与零覆盖项（Swup 路径、打印、对比度、无百分比/箭头、canonical、llms.txt） |
| 2026-09-24 | **P2 审查后修订 + 复验** | 4 条全部修完并各配一条断言（详见 §3 的 P2-9/P2-10）：幂等守卫 + Swup 路径回归断言、`rank-panel--off` class 替换 `hidden` 属性（绕开 Tailwind preflight 的分层 `!important`，陷阱 T24）、配图存在性自判（陷阱 T25）、加深粉色到 `#E2696B`；顺带修掉短评胶囊压标题与被压扁（陷阱 T26）。`verify:ui` 从 85 扩到 **101 项断言全绿**（exit=0），截图 13 张；文档三处数字已统一 |
| 2026-09-24 | **P4 源数据精确清点（先清点后动手）** | 源笔记实测 **135 篇 / 3.63MB / 0 篇带 frontmatter**（`ARCH.md` §9.1 原先写的 142 篇是估的，已按实测改）；图片目录 35 个 / 169 张；图片引用 `![[…]]` 125 处、`<img>` 216 处、`![](…)` 150 处 → 本地 258 / 远端 233；**完全重复的文章只有 2 组**（`二分`/`二分算法`、`动态规划`/`动态规划思想`，MD5 相同）而不是文档原先写的 3 组；`图片/linux` 与 `图片/linux系统` 是**同一批图**（36 个同名文件大小完全一致）；清点脚本 `reports/census-source.mjs` + `reports/ref-resolve.mjs` + `reports/ref-missing.mjs`，结果 `reports/_p4-census.json` |
| 2026-09-24 | **P4-1/2/3 迁移脚本 + 批次 1（18 篇）** | `scripts/import-posts.mjs`（dry-run 默认 / `--write` / `--batch` / `--cat` / `--only` / `--limit`）+ `scripts/verify-posts.mjs`（`pnpm verify:posts`）；导入 18 篇、复制 9 张图到 `public/images/posts/<slug>/NN.png`（**一个字节不重编码**）。**证据**：`verify:posts` 32 篇 0 错误 6 警告；`verify:ui` **154 项断言全绿**（当轮口径；新增 12 条 R-CNT 断言）、截图 **24 张**（新增 4 张文章页整页图）；`pnpm build` exit=0（62 页）；代码块保真复核 105 个逐块一致（`reports/check-code-fidelity.mjs`）；两个独立子 agent 只读复核：图片位置 9/9 相符、内容零丢失/无残留语法/frontmatter 全合法 |
| 2026-09-24 | **P4 自查抓到的三个真坑（都已修 + 登记陷阱）** | ① 图片文件名归一化把"空格+数字"当 Obsidian 重名后缀剥掉 → `Pasted image 20260509141005.png` 这类时间戳被吃掉，**同一篇 6 张图塌成 1 张**（T36）；② 全库 `==x==` → `<mark>` 会把 C++ 的 `dist[t]==INF | cnt==n-1` 从表格里连成高亮（T35）；③ 全文去行尾空白把 5 篇 **100 处代码块内**的空格剥掉了（T37，独立复核逐块比对时抓到） |

**需求共识要点（防止以后记错）**

- 排行榜：**只要一期、主观排名、手工维护、不要右侧的得票率/升降/涨幅**；视觉以发起人提供的**裁切参考图**为准（名次色只有两档：1~3 名粉底白字、4 名以后橙底深色字），实测比例已记入 `ARCH.md` §5.5。
- 桌宠 Agent：现在还没有后端，**允许先写一个简单版测试**，参考 `agent_-for_-blog`，但**不许改它的代码**。
- 留言：**暂时关闭评论**，页面与导航先做好。
- 内容迁移：**先精选 15~20 篇跑通**，再全量。
- 部署：**自建服务器 + Nginx 静态托管**。
- 保留：动态、项目、相册、书签导航、音乐播放器、公告、番剧（原 AnimeList）、轻小说（原 VNDB）。
- 站点信息：**保留组件但值先留空**，部署后回填。
- 排行榜条目：**标题 + 原名/短评 + 一张背景版**（发起人 2026-09-24 明确"不单是文字，还有图片"）；**明确不要 `tags` / `position` 字段**，只要求"以后加图能直接出效果"。图片规格：比例 **5.7:1**、推荐 **1600×280**、单张 ≤150KB、格式不限、**图上不做字**（标题由页面渲染）。对照图 `docs/imiss/rank-cover-guide.png`。

---

## 7. 风险登记（与 `ARCH.md` §14 对应）

| 风险 | 触发条件 | 影响 | 应对 | 状态 |
| --- | --- | --- | --- | --- |
| 上游模板升级覆盖自定义 | 以后同步 Firefly 新版 | 改动丢失 | 改动集中在 config 与新增文件；核心组件最小编辑 | 监控 |
| 图片映射错误（配图张冠李戴） | 迁移时正文引用与图片文件名对不上 | 配图张冠李戴 | **P4 已改成"文件名精确匹配"**：本文章图片目录同名 → 全库唯一同名兜底，**绝不按顺序猜**；对不上就换成 `> [!WARNING]` 提示块并记进报告。批次 1 的 9 张已逐张看图核对 | ✅ 已解决（机制 + 批次 1 实证；批次 2~5 每批复查） |
| 旧笔记里夹带明文凭据 | 截图/正文里有账号密码、真实域名、Cookie | 公开后泄露个人信息 | **B-12**：已定位到 `HTTP 协议` 的 02/04 两张截图，等发起人决定打码或裁掉；批次 2~5 迁移时对"疑似凭据"做一次扫描 | 🟡 待发起人拍板（上线前必须处理） |
| 第三方内容与 hotlink 图床 | `八股/` 那批来自公开仓库、图片 hotlink 在别人图床 | 版权/署名 + 图床挂掉后图片全裂 | **B-13**：等发起人决定是否署来源/转存图片。当前 204 个外链 URL 抽样全部存活 | 🟡 待发起人拍板 |
| `published` 时间取自文件 mtime | 源笔记没有 frontmatter、也没有可信的原始日期 | 文章发布时间不等于真实写作时间 | 已按 mtime 落库（同一天内按 mtime 秒级排序）；**需要发起人确认是否接受**，或以后用博客后台的原始日期批量回填 | 🟡 待确认 |
| 视频壁纸体积过大 | 视频产出后 | 首屏慢 | 三种降级 + 8Mbps 兜底档 | 待 P3 |
| 构建期需要外网 | 配置了 VNDB/MAL 凭据、或字体用远端 provider | 构建失败 | **P0 已验证**：黑洞代理下构建 exit=0；字体已改本地文件；VNDB 封面默认关闭 | ✅ 已解决（R-DEP-04 实测通过；后续新增依赖时需重跑一次 P0-6） |
| 新增依赖引入新的构建期联网 | 以后加字体/图片/数据源类依赖 | 构建失败 | 新增依赖后重跑一次黑洞代理构建（P0-6 的做法） | 持续 |
| npm registry 直连不可用 | 换机器/服务器安装依赖 | 安装失败 | 安装时加 `--registry=https://registry.npmmirror.com`；已写入 README 与 `ARCH.md` §12.3 | ✅ 已知并规避 |
| 上游示例凭据随仓库分发 | 未清理即公开仓库 | 误导/安全 | R-ID-05 **已在 P1 完成**：5 处示例 ID 全部清空并在注释里标注原值来源 | ✅ 已解决（P1） |
| 「关闭页面」被当成 404 | 依赖 `Astro.redirect` 的行为 | 线上返回 200 软跳转，SEO 不理想 | P1 已按真实行为改验收条件；真 404 落到 Nginx（§12.2 五条 `return 404` + `error_page`） | ✅ 已有对策（待 P6 落地验证） |
| 侧边栏 sticky 组件在整页截图里失真 | 用 full-page 截图做视觉验收 | 误判"组件没渲染" | `verify-ui.mjs` 额外输出一张 `sidebar-1440.png`（1440×2400 视口、不整页） | ✅ 已解决（P1） |
| 入场动效让截图/爬虫看到空白 | 内容默认 `opacity: 0`，靠 JS 加类显示 | 无 JS 场景内容不可见（可访问性 + SEO 硬伤）；自动化截图误判 | 隐藏态挂 `html[data-rank-anim="1"]`（仅 JS 可用时设置）+ 打印兜底 + 截图前"模拟滚动一遍"（`behavior:"instant"`） | ✅ 已解决（P2，T22/T23） |
| "相对内容宽"的比例用 `vw` 表达 | 响应式尺寸写成 vw | 宽屏下比例失真（实测偏到 21%） | 容器查询单位 `cqw`（T20） | ✅ 已解决（P2） |
| 半透明色罩在浅色主题下失去对比度 | 渐变直接罩在卡片底上 | 白字标题糊掉 | 先铺不透明深色底 + 双主题对比度断言 | ✅ 已解决（P2） |
| 容器/网格里的尺寸上限用 `%` | auto 轨道 + 百分比 `max-width` | 元素被压成小圆点（截图上才发现），"不重叠"断言仍会通过 | 上限改长度单位（`cqw`）+ 断言加"自身没被压扁"（T26） | ✅ 已解决（P2） |
| 只测"直开"路径而漏掉 Swup 路径 | 验证脚本统一用 `Page.navigate` 直开 | 交互缺陷全绿通过（P2 的阻断缺陷就是这么漏的：直开 4 个监听、Swup 进入 8 个） | 关键交互各补一条"经 Swup 点导航进来"的回归断言 | ✅ 已解决（P2，P2-9） |
| Agent 依赖不可达 | DeepSeek / LangSmith 网络异常 | 桌宠不能聊天 | 前端 mock 兜底；health 探测 | 待 P5 |
| 密钥泄漏 | `.env` 误提交 | 费用与安全 | `.gitignore` 覆盖 + 只放占位在 `.env.example` | 待 P5 |

### 7.1 已知验证盲区（诚实登记，别当成"已验过"）

| 没验的东西 | 为什么没验 | 打算怎么补 |
| --- | --- | --- |
| 空数据时"榜单待更新"文案 | 只做了静态推理，没真把某组数据清空跑一遍 | 等真实数据进来前手动跑一次（改 `rankConfig` 清空一组 → 看页面 → 改回） |
| `cover` 故意写错路径 | 组件里已按 `/src/**` glob 兜住，但**没有自动化断言**（不想为它塞一条假数据）；构建日志 warning 是间接证据 | 将来 `pnpm verify:posts`（P4）加一条"`rankConfig` 里所有 `cover` 路径在磁盘上存在"的校验，比在 UI 层测更合适 |
| Firefox / Safari 的 `cqw` 与 `container-type` | 验收脚本只驱动系统 Chrome | 上线后用真机/其它浏览器各看一眼榜单（P6 全站回归时带上） |
| 真机 390px、Lighthouse、首屏体积 | 只有 CDP 的 390×844 仿真 | P6 回归时跑一次 Lighthouse；榜单一页图片预算（≤1.5MB）等真实配图进来再核 |
| 生产 Nginx 的 `/rank/` 301 与关闭页真 404 | `deploy/` 目录还没建（属 P6 交付物） | P6 部署后按 `ARCH.md` §12.2 逐条核对 |
| 与参考图逐像素比对 | 参考图在 `my_-blog\dosc\排行`，不在本工作区 | 需要时把图放进工作区再量一次（当前的比例/配色是从发起人提供的裁切图量得的实测值） |

---

## 8. 变更日志

| 日期 | 版本 | 变更 | 影响文档 |
| --- | --- | --- | --- |
| 2026-09-24 | v1.23 | **纠正 v1.22 的误判（发起人澄清"我要分享块啊，只是后面提醒我添加域名而已"）**：分享块改回开启（`siteConfig.post.share: true`），`verify:ui` 那条断言**反转成"分享块必须在"**；配置注释与 §1 第 6 条写清"域名到位前二维码/复制链接指向占位域名（B-01），拿到域名后填 `site_url` + 重建"。R-ID-08（关闭许可协议）保持关闭 | `prd.md` R-ID-09、`ARCH.md` §4、`PROJECT_STATUS.md` §1/§3/§8、`src/config/siteConfig.ts`、`scripts/verify-ui.mjs` |
| 2026-09-24 | v1.22 | **发起人评审先导文章的两条意见**：① **R-ID-08 关闭文章许可协议**（`licenseConfig.enable: false` + 侧栏那一项改成条件展开，不留 `None` 空行）；② **R-ID-09** 分享块的二维码指向占位域名（`Astro.url.href` 取 `site_url` = `imiss.example.com`，见 B-01）→ 已加 3 条断言；新增需求编号 R-ID-08 / R-ID-09 | `prd.md` §3.1、`ARCH.md` §4、`PROJECT_STATUS.md` §1/§3/§8、`src/config/licenseConfig.ts`、`src/components/widget/SiteInfo.astro`、`scripts/verify-ui.mjs` |
| 2026-09-24 | v1.21 | **发起人两条决定入档**：① 全量导入**暂停**，等发起人审完先导 18 篇再一次性跑；② 剩余上游示例页（`/projects/`、`/dynamic/`、`/gallery/`、`/booknav/`、`/about/`）**先留着、将来替换**（发起人："记得提醒"）→ 写进 §1 第 5 条与 `prd.md` §7 第 13 条，执行方每次开工主动提醒 | `prd.md` §7、`PROJECT_STATUS.md` §1/§3/§8 |
| 2026-09-24 | v1.20 | **删除全部上游示例文章（发起人要求）**：29 个文件（14 篇文章 + 15 张孤儿配图）；站点文章 32 → **18 篇**（全是迁移进来的笔记）、构建 62 → 47 页、`lqips.json` 自动清 15 条；`verify:ui` 3 处 `/posts/firefly/` 断言改用真实文章。**剩余上游示例**（P4-8 后半）：`projects/*`、`src/content/dynamic/`、相册、书签导航、关于页 | `PROJECT_STATUS.md` §1/§3/§8、`README.md`、`scripts/verify-ui.mjs` |
| 2026-09-24 | v1.19 | **流程再澄清（发起人纠正我的上一版）**：闸门**只有一道**——先导 18 篇确认没问题后**一次性全量导入**（批次 2~5 连着跑完），**不是每批都停下来等确认**（v1.18 我写成了逐批确认，是理解错的一版，已改回）。`PROJECT_STATUS.md` §1 第 3 条 / §9 第 9 条、`ARCH.md` §9.5 三处同口径 | `ARCH.md` §9.5、`PROJECT_STATUS.md` §1/§8/§9 |
| 2026-09-24 | v1.18 | **流程纠正（发起人指出）**：全量迁移须「我方自查 → 交发起人确认样板文章 → 发起人确认 → 才开始下一批」，**我自检通过不等于可以继续执行**。写进 `PROJECT_STATUS.md` §1 第 3 条与 §9 第 9 条，`ARCH.md` §9.3 同步 | `ARCH.md` §9.3、`PROJECT_STATUS.md` §1/§8/§9 |
| 2026-09-24 | v1.0 | 建立项目文档体系；固化需求共识、架构设计与阶段划分 | `prd.md`、`ARCH.md`、`PROJECT_STATUS.md` |
| 2026-09-24 | v1.1 | 排行榜视觉规格改为实测值：名次色两档（1~3 名 `#EA7B7C` 白字 / 4+ 名 `#EFA662` 深色字）、行高 = 内容宽 1/5.7、名次列 = 内容宽 13.7%；明确右侧三列不做 | `prd.md` R-RANK-03 / R-RANK-06、`ARCH.md` §5.5 |
| 2026-09-24 | v1.2 | **P0 完成**：模板复制并 SHA256 校验、依赖安装（发现必须用国内镜像）、`check`/`type-check`/`build`/断网构建/`dev` 全部通过。新增需求 **R-ID-05**（清理上游示例凭据）、`ARCH.md` **§14.3 模板已知陷阱（15 条）**、字体改 `local` provider（修掉构建期联网）、`.gitignore` 增补、`README.md` 重写 | `prd.md` R-ID-05 / R-DEP-04、`ARCH.md` §2/§3/§4/§6/§12/§14.3、`PROJECT_STATUS.md` §1~§8 |
| 2026-09-24 | v1.3 | **P1 完成**：站点改名 IMiss Blog、hue=345、导航树重写、统计删两项、热力图关闭、站点信息占位、临时 Logo/favicon、留言页文案、清空示例凭据、轻小说/番剧页改名收尾。新增 `scripts/verify-ui.mjs`（35 项断言）与 `scripts/make-logo.mjs`。**纠正 PRD 一条错误验收条件**（关闭页面在静态输出下是 200 + noindex 存根，不是 404）+ `ARCH.md` §14.3 新增 T17、§12.2 增加 5 条 Nginx `return 404` 与 `error_page 404 /404.html` | `prd.md` R-ID-04 / R-NAV-05 / R-NAV-06、`ARCH.md` §3/§4/§11/§12.2/§14.3、`PROJECT_STATUS.md` §1~§8 |
| 2026-09-24 | v1.4 | **P1 审查后修订**：独立审查发现 1 条阻断（首页横幅的上游 Sponsor 打赏链接 + 作者邮箱/GitHub）与 2 条应修（`vndb.mode` 改回 `dynamic`、`siteStartDate` 清空），已全部修完；首页横幅标题/副标题/链接一并换成占位。`verify-ui.mjs` 修掉 3 处假绿、新增泄漏扫描与 5 条缺失断言、对比度改为 token 级 + hue A/B；复验 **52/52 全绿**。新增陷阱 **T18**（横幅 links 是身份/打赏清理盲区）与 **T19**（侧栏 `-dynamic`/`-static` 容器 id 坑，会让 DOM 断言静默空过）；P4 新增 P4-8（替换上游示例内容页）、P6 新增 P6-8（apple-touch-icon 用 180/192） | `prd.md` R-ID-05 / R-NAV-06、`ARCH.md` §4/§11/§14.3、`PROJECT_STATUS.md` §1~§8 |
| 2026-09-24 | v1.5 | `README.md` 增补「我自己怎么把它跑起来」手把手一节（开终端 → 装依赖 → `pnpm dev` → `pnpm preview` → `pnpm verify:ui` → 停止方式 → 常见问题），并实测 `pnpm dev --host --port 4322`：监听 `::`、`localhost:4322` 与局域网 `192.168.3.5:4322` 均 200 | `README.md`（需求与架构未变，`prd.md`/`ARCH.md` 无改动） |
| 2026-09-24 | v1.6 | **P1 修订（发起人两条反馈）**：① Logo 换成手写 SVG 标识（新增设计源 `imiss-logo.svg`，`make-logo.mjs` 改为从 SVG 栅格化）；② 新增需求 **R-ID-06** 删除订阅功能（删 5 文件 + 摘 4 处接线，恢复清单进 `ARCH.md` §14.4）。`verify:ui` 新增 6 条断言覆盖订阅移除与横幅图标行 | `prd.md` R-ID-04 / R-ID-06、`ARCH.md` §3/§4/§11/§14.4、`PROJECT_STATUS.md` §1~§8 |
| 2026-09-24 | v1.7 | 新增需求 **R-ID-07**：登记「显示设置面板（调色盘 + 界面结构管理）」的现状与开启方式——**上游自带、默认 `enable: false`、P1 未做任何改动**（附 `git diff 3dbc38d..HEAD` 证据与 `PUBLIC_DISPLAY_SETTINGS=true` 实测），并把 +33KB/页 的体积代价写进 `ARCH.md` §13；开放范围与改进点列为待发起人确认项 | `prd.md` R-ID-07、`ARCH.md` §4/§13、`PROJECT_STATUS.md` §1/§3/§8 |
| 2026-09-24 | v1.8 | 发起人决定**显示设置面板对访客全开**：`displaySettingsConfig.enable: true`（13 个条目全开），实测代价仅 **+11.6 KB/页**（38 页合计 +439.7 KB，远低于上游注释的 33KB）；面板本身的改造按指示排在 P2/P3 之后（P1-18） | `prd.md` R-ID-07、`ARCH.md` §4/§13、`PROJECT_STATUS.md` §1/§3/§8 |
| 2026-09-24 | v1.9 | **P2 完成**：排行子系统（2 个榜单页 + 全剧/单集切换 + 缺图/空数据降级 + 亮暗双主题与移动端）。真实偏差已回写文档——**「全剧/单集」由 Svelte 岛改为组件内联脚本**（静态输出读不到 `?kind=`，避免闪烁与 hydration）；视觉规格改用 **`cqw`** 表达"相对内容宽"的比例（原 `vw` 写法实测偏到 21%）；缺图占位改为**不透明深色底**以保住亮色主题下的白字对比度；`/rank/` 存根**从 sitemap 排除**并在 Nginx 用 301 接管。`verify:ui` 扩到 **83 项断言全绿**（新增 22 条 R-RANK、亮色主题截图、双主题对比度断言），新增陷阱 **T20~T23**，新增非功能要求"内容可见性不依赖 JS"（`prd.md` §6.2） | `prd.md` R-RANK-03/04/05/06、§6.2、`ARCH.md` §4/§5.2~§5.6/§11/§12.2/§14.3、`PROJECT_STATUS.md` §1~§8 |
| 2026-09-24 | v1.10 | **P2 审查后修订**：独立子 agent 审查发现 **1 阻断 + 3 应修**，全部修完并复验（`verify:ui` **101 项断言全绿**、截图 13 张）。① 阻断：Swup 路径下 tab 监听重复绑定 → 双 pushState、一次后退失效（加幂等守卫 + 新增 Swup 路径回归断言）；② 无 JS/打印时「单集」榜不可见（改用 class + `data-rank-js` 标记，绕开 Tailwind preflight 的**分层 `!important`**，新增陷阱 **T24**）；③ `cover` 写错路径无兜底（自己先判配图存在性，新增陷阱 **T25**）；④ 1~3 名白字对比度 2.76:1 → 取 `#E2696B`（3.25:1）。另修短评胶囊压标题/被压扁（陷阱 **T26**）。文档同步：`prd.md` R-RANK-03/05、§6.2/§6.3；`ARCH.md` §5.2~§5.6/§11/§14.3 新增 T24~T26；llms.txt 补上两个榜单页 | `prd.md` R-RANK-03/05、§6.2/§6.3、`ARCH.md` §5/§11/§14.3、`PROJECT_STATUS.md` §1/§2/§3/§6/§7/§8 |
| 2026-09-24 | v1.11 | **新增需求 R-RANK-07「二游排行」**（发起人审查 P2 时提出）：导航「排行」加第三项 `/rank/game/`，榜单板与视觉规格同另两榜，但**没有「全剧 / 单集」维度**（`rankConfig.game` 直接给数组、组件按 `Array.isArray` 判断，不塞假维度）；`verify:ui` 107 项断言全绿、截图 15 张 | `prd.md` R-RANK-07 / R-NAV-02 / §2 / §4.2 / §8、`ARCH.md` §3 / §4.1 / §5.2~§5.4 / §11、`PROJECT_STATUS.md` §1/§2/§3/§4/§6/§8 |
| 2026-09-24 | v1.17 | **P4 内容迁移·批次 1（18 篇）**：新增 `scripts/import-posts.mjs`（dry-run 默认、`--write` 落盘、`--batch/--cat/--only/--limit` 过滤、`reports/import-report.json`）与 `scripts/verify-posts.mjs`（`pnpm verify:posts`，阻断式）；**图片解析由文档原先写的"顺序映射"改为"文件名精确匹配 + 全库唯一同名兜底"**（实测 116/258 条本目录同名命中、4 条全库同名，只有 2 条真缺文件）；`title` 改取文件名（首个 H1 实测是小节标题）、`tags` 取作者自己的 Obsidian 标签行、`published` 取 mtime；缺图引用换成 `> [!WARNING]` 并记报告，全篇缺图（AI应用 2 篇）置 `draft: true`。`verify:ui` 142 → **154 项断言**（当轮口径；R-ID-08/09 之后为 157）、截图 20 → **24 张**（新增 4 张文章页整页图）；`verify:posts` 32 篇 0 错误 6 警告。新增陷阱 **T34**（PowerShell 改 UTF-8 中文文件会双重编码）/ **T35**（`==` 在本语料里是 C++ 相等比较，不能全局转 `<mark>`）/ **T36**（文件名归一化不能吃"空格+数字"，否则时间戳命名的图会塌成一张）/ **T37**（全库去行尾空白会改坏代码块）/ **T38**（LQIP 生成器 glob `public/**`，必须忽略 `public/images/posts/**`）。登记 **B-12**（HTTP 协议截图里有明文账号密码）与 **B-13**（八股那批疑似第三方仓库整理稿 + 外链图床） | `prd.md` R-CNT-01~08、`ARCH.md` §9/§11/§14.3、`PROJECT_STATUS.md` §1~§8、新增 `scripts/import-posts.mjs` / `scripts/verify-posts.mjs` / `src/content/posts/{ai,algorithm,cpp,cpp11,interview,linux,linux-net,mysql,project,stl}/*.md` / `public/images/posts/**` |
| 2026-09-24 | v1.16 | **修正壁纸画质与裁切**（发起人反馈「图片模糊 / 有些地方看不见」）：`convert-wallpaper.mjs` 改为不重编码（原图直出）+ 壁纸 quality 95；`BANNER_HEIGHT` 65vh → 80vh；`banner.position` → `50% 35%`。实测 1918×966 可见 95% 高 × 100% 宽（原 76%）。新增陷阱 T32/T33、探针 `reports/wallpaper-probe.mjs` | `prd.md` R-BG-01、`ARCH.md` §6.1/§14.3、`PROJECT_STATUS.md` §1/§3/§8 |
| 2026-09-24 | v1.15 | **新增需求 R-BG-05「横幅两侧隐藏换图键」并实现**（发起人提，含「鼠标拖拽」补充要求）：桌面两侧交互区（hover/Tab 才显形）+ 鼠标拖动换图；手机端只保留手势滑动。复用模板 `changeToSlide()`，配置 `backgroundWallpaper.banner.manualSwitch`；`verify:ui` 142/142、截图 20 张；新增陷阱 T30/T31。同时登记 **R-BG-06**（按北京时间决定首屏默认素材，待发起人补充细节）为 P3-10 | `prd.md` R-BG-05/R-BG-06、`ARCH.md` §6.1.1/§11/§14.3、`PROJECT_STATUS.md` §1/§2/§3/§8 |
| 2026-09-24 | v1.14 | **P3 主体完成**（背景壁纸 + 桌宠）：① 壁纸换成发起人给的 4 张（新增 `scripts/convert-wallpaper.mjs`，转 webp 不预裁；上游示例图 12 个文件删除；取景 `0% 20%` + 暗罩 0.2 有断言兜底）；② 桌宠「爱弥斯」常驻全站（`AemeathPet.astro` + `pet.css` + `pet-utils.ts` + `petConfig.ts`，挂 Swup 容器之外，从原型 620 行实现移植）：九状态、拖拽物理、右键五项菜单、键盘可达、位置记忆、四种站点联动、reduced-motion / 后台 / 移动端三种降级、与看板娘互斥、与浮动按钮不重叠（实测重叠 0）。`verify:ui` 107 → **133 项断言全绿**、截图 15 → **19 张**。新增陷阱 **T27**（`--deep-text` 暗色下不生效）、**T28**（`is:inline` 里不写表达式）、**T29**（交互测试要等物理过程） | `prd.md` R-BG-01/04、R-PET-01~05、`ARCH.md` §3/§6.1/§14.3、`PROJECT_STATUS.md` §1/§2/§3/§8、新增 `scripts/convert-wallpaper.mjs` / `src/components/features/AemeathPet.astro` / `src/styles/pet.css` / `src/utils/pet-utils.ts` / `src/config/petConfig.ts` / `src/types/petConfig.ts` |
| 2026-09-24 | v1.13 | **配图通路实测 + 图片交付规格入档**（发起人：「排行后面加的不单是文字，还有图片，每个排名配一个标题和对应的背景版」；同时明确 **不要 tags/position**，只要求「以后加图能出预期效果」）：① 端到端实测——16:9 JPG（1600×914）接进「国漫·全剧」第 3 名，`pnpm build` exit=0、构建期自动产出 6 档 webp 并自动写入 LQIP 占位色，截图确认居中裁成宽条不变形、白字清晰，**验完已完整还原（`git diff` 归零）**；② 新增 `scripts/make-rank-cover-guide.mjs` → `docs/imiss/rank-cover-guide.png`（比例对照图：16:9 裁成 5.7:1 后哪条留下）；③ 规格入档：`ARCH.md` §5.5 新增「条目配图交付规格」行、§13 榜单配图预算改为单张 ≤150KB、§11/§3 登记新脚本；`README.md` 新增「以后怎么给榜单配背景图」三步 + 规格表；`prd.md` §7 待提供信息 #8 补规格与对照图路径；`PROJECT_STATUS.md` 需求共识要点与 `B-08` 补「图片规格与交付方式」。**结论：以后加图 = 放文件 + 写一行 `cover`，不用改代码** | `prd.md` §7、`ARCH.md` §3/§5.5/§11/§13、`README.md`、`PROJECT_STATUS.md` §1/§3/§4/§5/§8、新增 `scripts/make-rank-cover-guide.mjs` + `docs/imiss/rank-cover-guide.png` |
| 2026-09-24 | v1.12 | **文档一致性整改（发起人指出「三张表维护不细」）**：全面回扫三份文档 + README，修掉 **18 处**因「加二游排行」或「P1 换 Logo / 开面板」而产生的漂移——**B-08 阻塞项**（仍写"4 组数据"，实际是 4 组 + 二游 1 份 = 5 份）、`prd.md` 成功标准与 §6.3 sitemap 清单与 §1.3"临时 Logo"、R-ID-07 开头仍像"默认关闭"、`ARCH.md` §3 目录树缺 `game.astro`、§4.1 导航树与预设清单、§5.1/§5.2/§10 的"4 组榜单"、§11 断言数（101→107）与截图数（13→15）、§14.3 标题还说"P0 阶段"（实为 26 条）、`PROJECT_STATUS.md` §2 阶段表交付物与 P1 验收口径、§6 补二游条目、**§8 变更日志 v1.10/v1.11 顺序颠倒**、README 的"四组数据"；历史口径数字统一加"（当轮口径；现为 X）"。**新增 `pnpm verify:docs`**（`scripts/verify-docs.mjs`，16 项检查）：版本号与最后更新日期、断言/截图数与最近一次实测、排行页清单与路由文件、导航子项与 `navBarConfig`、需求编号引用闭环、阻塞项条数与编号连续、§2↔§3 阶段状态、**配置事实**（`displaySettingsConfig.enable`、`rankConfig.dataStatus`、"4 组数据"是否漏了第 5 份）；并已用"注入漂移 → 必须失败 → 还原 → 恢复全绿"验证过它真的会拦。§9 维护约定补两条（收工前跑自检；区分"当前态"与"历史记录"） | `prd.md` §1.3/§4.5/§6.1/§6.3、`ARCH.md` §3/§4.1/§5.1/§5.2/§10/§11/§14.3、`PROJECT_STATUS.md` §1~§9、`README.md`、新增 `scripts/verify-docs.mjs` + `pnpm verify:docs` |

---

## 9. 文档维护约定

1. **状态只写在这里**：`prd.md` 写"要什么"，`ARCH.md` 写"怎么改"，状态与进度一律回本文件。
2. **需求变更走编号**：新增/修改需求先改 `prd.md` 并给编号，再在 `ARCH.md` 补落点，最后在本文件登记。
3. **阶段完成要留证据**：勾选任务时必须能指认证据（命令输出、截图路径、构建产物、线上 URL）。
4. **阻塞项只增不删**：解除后把等级改成 ✅ 并写明解除方式与日期，便于回溯。
5. **三份文档共用一个版本号**：版本号跟"项目修订"走，某一轮只改了 README 或状态表时，`prd.md`/`ARCH.md` 也同步标同一个号——避免三份文档版本号不一致，看起来像漏改。
6. **每次开工先读第 1 章**的三条"下一步"，收工回填第 2、3、8 章。
7. **收工前跑 `pnpm verify:docs`**：它会机械核对"文档声称 vs 仓库事实"（版本号与最后更新日期 / 断言数与截图数 / 排行页清单 / 导航子项 / 需求编号 / 阻塞项 / 阶段状态 / **配置事实**），共 17 项。有 FAIL 就是有漂移，改完再提交。**新增或删除路由、导航项、需求编号、阻塞项、配置开关之后必须跑它**——v1.11 加二游排行时就是因为缺这道关卡，让 `B-08` 等 12 处说法停在旧版本上，被发起人一眼看出来。
8. **"当前态"与"历史记录"要分清**：任务清单（§3）与变更日志（§8）是**历史记录，不回改**，但数字口径变了要加"（当轮口径；现为 X）"注；阻塞项（§4）、阶段表（§2）、第 1 章速览属于**当前态，必须跟着改**。
9. **执行权在发起人手里，但闸门只有一道（2026-09-24 发起人两次澄清后的最终版）**：P4 的规矩是——**先导批次（18 篇）交发起人确认 → 确认没问题 → 一次性全量导入**。我方自检通过只代表"可以交给发起人看了"，**不代表可以抢跑全量**；但发起人一旦确认，就**连着把批次 2~5 跑完，不要每批再停一次**（每批都等确认是我理解错的一版）。P5/P6 同理：阶段做完交发起人确认后再进下一阶段。拿不准先问，别先做。
