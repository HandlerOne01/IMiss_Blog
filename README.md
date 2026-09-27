# IMiss Blog

以《鸣潮》角色 **爱弥斯** 为主题的个人技术博客。站点名 **IMiss** 取自「爱弥斯」（**A**i **M**i **S**i）的谐音。

> **项目状态**：开发中。阶段、进度、下一步与阻塞项一律以 [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) 为准。
> **需求与设计**：[`prd.md`](./prd.md)（需求编号 R-xxx）、[`ARCH.md`](./ARCH.md)（改动落点与子系统设计）。

本站基于开源主题 **Firefly v6.16.8** 二次开发（Astro 7 + Svelte 5，静态输出）。
上游完整文档保留为 [`README.upstream.zh.md`](./README.upstream.zh.md)（中文）与 [`README.en.md`](./README.en.md)（English），本文件只描述**本站自己的**约定。

---

## 环境要求

| 工具 | 要求 | 当前开发机 |
| --- | --- | --- |
| Node.js | ≥ 22.23 | v24.16.0 ✅ |
| pnpm | 11.x（仓库声明 `pnpm@11.22.0`） | 11.24.0 ✅ |

> 包管理器由 `preinstall` 脚本强制为 pnpm；`pnpm-workspace.yaml` 里已允许 `esbuild` / `workerd` 的构建脚本。

## 我自己怎么把它跑起来（手把手）

### 第 0 步：打开一个终端，进到本目录

在文件资源管理器里打开 `D:\HuaweiMoveData\Users\HUAWEI\Desktop\imiss_-blog`，
在地址栏输入 `powershell` 回车（或右键空白处 →「在终端中打开」）。
确认当前目录正确：

```powershell
pwd    # 应输出 D:\HuaweiMoveData\Users\HUAWEI\Desktop\imiss_-blog
```

### 第 1 步：装依赖（**只需一次**，装过就跳过）

```powershell
pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com
```

不加镜像会失败（本机直连 npmjs 只有 32–46 KiB/s，会超时）。

### 第 2 步：起开发服务器（日常就用这个）

```powershell
pnpm dev
```

等它打印出 `Local http://localhost:4321/`（约 10 秒），然后：

- 浏览器打开 **http://localhost:4321/**
- 改动 `src/` 下任何文件都会**自动刷新**，不用重启
- 想用手机看（同一 WiFi）：`pnpm dev --host`，它会多打印一行 `Network http://192.168.x.x:4321/`，手机就访问这个地址
- **停止：在这个终端窗口按 `Ctrl + C`**

### 第 3 步（可选）：看"上线后的样子"

`pnpm dev` 是开发模式，和最终产物不完全一样。想看真实产物：

```powershell
pnpm build      # 产出 dist/，约 1–2 分钟，全程不需要外网
pnpm preview    # 用 dist/ 起本地服务，同样是 http://localhost:4321/
```

`dev` 和 `preview` **占同一个端口，不要同时开**。端口冲突时：`pnpm dev --port 4322`。

### 第 4 步（可选）：跑一遍验收脚本

它会自己开一个无头 Chrome，把需求逐条断言一遍，并截图到 `reports/screenshots/`：

```powershell
pnpm build        # 先构建（脚本要读 dist/ 与 sitemap）
pnpm preview      # 另开一个终端窗口跑这个并保持运行
pnpm verify:ui    # 再另开一个终端窗口跑这个
```

期望输出：`功能断言 267 项：✅ 通过 263，❌ 失败 0，⏭️ 跳过 4`。
若输出 `检测到 astro dev 服务器` 的提示，说明你对 `pnpm dev` 跑了它——
那会把"关闭页面"等断言误判，请改成对 `pnpm preview` 跑。

再跑**内容校验**（不依赖浏览器，几秒钟出结果）：

```powershell
pnpm verify:posts   # 期望输出：`✅ verify:posts 通过：18 篇 0 错误、N 个警告`（有错误则退出码 1）
```

跑完界面验收后，再跑一次**文档自检**（它拿上面这次实测的数字当基准，核对三份文档有没有跟着更新）：

```powershell
pnpm verify:docs    # 期望输出：`文档检查 … ：通过 N，失败 0`（有 FAIL 就是文档与仓库对不上了）
```

> 它会拦下这类问题：改了导航/路由/数据，但 `prd.md`、`ARCH.md`、`PROJECT_STATUS.md` 里还写着旧数字或旧清单。

### 常见问题

| 现象 | 原因 / 解决 |
| --- | --- |
| `pnpm: 无法将"pnpm"项识别为…` | 没装 pnpm：`npm i -g pnpm` |
| 安装依赖卡住/报 `ETIMEDOUT` | 忘了加 `--registry=https://registry.npmmirror.com` |
| 启动报端口被占用 | 上一台的窗口还开着；关掉它，或 `pnpm dev --port 4322` |
| 页面标题还是 `Firefly`、导航没有"排行" | 你跑的不是这个仓库（`pwd` 确认目录），或工作区被切到了别的提交 |
| 现在**还没有**桌宠、聊天 | 正常：桌宠在 P3、Agent 后端在 P5（见 `PROJECT_STATUS.md`） |
| 排行榜里是"示例作品 01"这类内容 | 正常：真实榜单数据还没给（`PROJECT_STATUS.md` 的 `B-08`），页面底部也有同样的提示 |

> 📌 当前阶段：**P0 / P1 / P2 已完成，等审查**。`/rank/jp/`（日漫排行）、`/rank/cn/`（国漫排行）、`/rank/game/`（二游排行，单一榜）都已经能访问，
> 「全剧 / 单集」可切换（URL 带 `?kind=ep`）；`/rank/` 本地是跳转存根，线上由 Nginx 301 到 `/rank/jp/`。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` / `pnpm start` | 本地开发（默认 4321 端口） |
| `pnpm check` | Astro 诊断（类型 / 内容 / 模板错误） |
| `pnpm type-check` | `tsc --noEmit`，覆盖 `src/` 与 `scripts/` |
| `pnpm build` | 生产构建：LQIP → VNDB 封面（未配置则跳过）→ Astro → 清理未用看板娘资源 → 字体子集 → 内联脚本压缩 → Pagefind 索引 |
| `pnpm preview` | 预览 `dist/` |
| `pnpm verify:ui` | 界面验收：267 项断言 + 泄漏扫描 + 对比度 A/B + 56 张截图（**要先 `pnpm build` 再 `pnpm preview`**） |
| `pnpm verify:posts` | 内容校验：frontmatter / slug / 图片存在性 / 站内链接 / 残留 Obsidian 语法 / 榜单配图（**改完文章或跑完迁移后跑一次**；有错退出码 1） |
| `pnpm verify:docs` | 文档自检：核对三份文档与仓库事实是否一致（版本号、断言/截图数、排行页清单、导航子项、需求编号、阻塞项、阶段状态）。**改完东西收工前跑一次** |
| `node scripts/import-posts.mjs --batch 1` | 迁移旧博客笔记（**默认 dry-run 只出报告**；加 `--write` 才落盘。详见下面「迁移旧笔记」一节） |
| `node scripts/convert-wallpaper.mjs` | 把 `dosc/photo` 的 4 张壁纸转成 webp（桌面 + 移动两套），改壁纸素材时用 |
| `pnpm make:logo` | 从 `imiss-logo.svg` 重新栅格化 Logo 与 favicon |
| `pnpm format` / `pnpm lint` | Biome 格式化 / 检查并安全修复（只针对 `src/`） |
| `pnpm new-post` | 新建文章脚手架 |
| `pnpm lqips` | 重新生成 `src/constants/lqips.json`（图片占位色） |

**构建不依赖外网**：字体走本地文件（`src/assets/fonts/`，**不要**改回 `fontsource`/`npm` 等远端 provider，它们会在构建期访问 jsdelivr 并直接失败）；VNDB 封面下载保持关闭；番剧页（MyAnimeList）在未配置凭据时整段跳过；GitHub 卡片步骤失败会回落已提交的缓存。因此断网也能 `pnpm build`。

## 目录说明（本站相关部分）

```
src/config/          所有可配置项（改站点基本只动这里）
  siteConfig.ts        站点名、描述、主题色、页面开关
  navBarConfig.ts      导航结构（本站已按需求重构）
  backgroundWallpaper.ts  壁纸（图片期 / 视频期两套配置）
  sidebarConfig.ts     侧边栏组件与顺序
  pioConfig.ts         模板自带看板娘（本站保持关闭，改用桌宠）
src/content/posts/   博客文章（Markdown）
src/content/spec/    关于页、留言页等特殊页面内容
src/content/dynamic/ 动态（短消息）
src/assets/images/  需要构建期优化的图（壁纸 / 封面 / 排行榜配图 / 桌宠图集）
public/images/posts/ 文章内图片（不参与构建期优化）
public/assets/videos/ 背景视频（原片 + 无缝兜底版）
agent/               博客专用 Agent（Python，规划中，见 PROJECT_STATUS）
deploy/              生产 Nginx 配置（规划中）
docs/                上游主题文档（多语言 README）
```

## 写一篇文章

在 `src/content/posts/` 下新建 `.md`，frontmatter 至少要有：

```yaml
---
title: 文章标题
published: 2026-09-24
description: 一两句摘要，会出现在卡片与搜索结果里
category: Linux系统        # 对应归档/分类页
tags: [Linux, 进程]
---
```

文章内的图片放在 `public/images/posts/<slug>/`，正文里用绝对路径引用：

```md
![示意图](/images/posts/my-post/01.jpg)
```

> 为什么不放 `src/assets/`：文章图片数量大，进构建期图片优化管线会显著拖长构建时间；只有壁纸、封面、排行榜配图、桌宠图集这些少量图才交给 Astro 优化。

## 迁移旧笔记（Obsidian → 本站）

旧笔记放在 `D:\HuaweiMoveData\Users\HUAWEI\Desktop\my_-blog\dosc\blog`（**全程只读，脚本绝不改源文件**）。迁移脚本会把每篇转成带 frontmatter 的文章、把配图复制进 `public/images/posts/<slug>/` 并把正文里的引用改写成站内路径。

```powershell
node scripts/import-posts.mjs --batch 1          # 先看报告（dry-run，不落盘）
node scripts/import-posts.mjs --batch 1 --write  # 确认没问题再落盘
node scripts/import-posts.mjs --cat Linux系统 --write   # 只迁某一个分类
node scripts/import-posts.mjs --only 缓冲区 --write     # 只迁文件名含「缓冲区」的
pnpm verify:posts                                # 落盘后校验
```

| 参数 | 作用 |
| --- | --- |
| （不加参数） | 全量 dry-run，只打印计划与警告 |
| `--write` | 真正写文件（**不加就一个字节都不写**） |
| `--batch 1..5` | 按批次迁（1 = 已定型的 18 篇；2 = C++11+C与C+++STL；3 = Linux系统+linux网络+MySQL；4 = 基础算法+AI应用；5 = 八股+项目） |
| `--cat` / `--only` / `--limit` | 按分类 / 路径子串 / 数量筛选 |
| `--src` | 换源目录（默认就是上面那个） |

**图片怎么对上号**：脚本**只按文件名精确匹配**（先在本篇文章的图片目录里找同名，再退化到"全库唯一同名"），**不会按顺序硬凑**——源笔记 258 条本地引用里 116 条能本目录同名命中、4 条全库同名命中、2 条确实没文件。匹配不到的引用会变成 `> [!WARNING] 原图缺失：xxx` 提示块并记进 `reports/import-report.json`；整篇一张图都找不到时该篇 `draft: true`（不上线）。每次落盘还会写 `reports/image-mapping-<slug>.json`（哪张原图 → 哪个 `NN.png`）。

**它会替你处理的 Obsidian 语法**：文首标签行 `#标签`（转成 frontmatter 的 `tags` 并从正文摘掉）、行内 `#标签`、`![[图片]]`、`![[]]` 之外的 `[[双链]]`（按标题索引改写成站内链接，解析不到的原样保留）、相邻两行图片之间补空行（否则会被解析进同一个段落并排显示）。`==高亮==` **不会**被改写——本语料里 `==` 全是 C++ 相等比较。


## 怎么换壁纸 / 加壁纸

壁纸配置在 `src/config/backgroundWallpaper.ts`：

| 想做什么 | 怎么做 |
| --- | --- |
| 换/加图片 | 图片放进 `src/assets/images/DesktopWallpaper/`（桌面）与 `MobileWallpaper/`（手机），然后往 `src.common.src.desktop` / `.mobile` 数组里加路径；**数组多于 1 张时**横幅两侧就会出现隐藏换图区 |
| 调整构图 | `banner.position`（现在是 `50% 35%`：水平居中、纵向略偏上保面部）与 `common.dimOpacity`（暗罩，现在是 `0.2`）——只改配置，不用碰代码 |
| 横幅高度 / 画面被裁 | `src/constants/constants.ts` 的 `BANNER_HEIGHT` + `BANNER_HEIGHT_EXTEND`（现在 45+35 = **80vh**）。框越矮，`object-fit: cover` 裁掉的画面越多：65vh 时只看得到 76% 的高度，80vh 时 95% |
| 画质 | **原图直出、不要自己重压**：素材原样放进 `src/assets`，压缩只交给构建管线；壁纸单独用 `WALLPAPER_QUALITY = 95`（在 `WallpaperSection.astro`）。自己先转一道 webp 再让 Astro 压一道 = 两代有损压缩，会明显发糊（踩过） |
| 关掉手动换图 | `banner.manualSwitch.enable = false`（完全回到模板原有行为） |
| 只关某一侧的行为 | `manualSwitch.zones`（桌面两侧交互区）/ `manualSwitch.drag`（拖动换图）/ `manualSwitch.dragThreshold`（拖动阈值，默认 60px） |
| 从原始素材重新转 webp | `node scripts/convert-wallpaper.mjs [--src <目录>]`（把 `dosc/photo` 那批转成桌面/移动两套 webp） |

**怎么用**：桌面端鼠标移到横幅**最左/最右边缘**会淡出一个箭头，点它换上一张/下一张（可循环）；也可以**按住横幅左右拖**。
手机端不显示箭头，**左右滑动**换图。键盘：Tab 能聚焦到两侧箭头，按 Enter / 空格换图。

## 维护排行榜

排行榜数据在 `src/config/rankConfig.ts`：**日漫 / 国漫各两组（全剧 + 单集）+ 二游一份名单，共 5 份**；**数组顺序就是名次**，只有一期、手工维护。条目配图放 `src/assets/images/rank/`；不填配图会自动用主题色渐变占位，不会出现裂图。

页面：`/rank/jp/`（日漫排行）、`/rank/cn/`（国漫排行），右上角可在「全剧 / 单集」间切换（状态写在 URL 的 `?kind=` 上，可以直接分享链接）；`/rank/game/`（二游排行）**没有维度**，直接是一份名单——它的数据在同一个文件里写成一个数组即可（`game: { ..., data: [ … ] }`）。

> 现在是**占位数据**（示例作品 01~10），所以页面底部有一条提示。填完真实数据后，把同一个文件里的 `dataStatus` 从 `"placeholder"` 改成 `"final"`，提示就会消失；两张演示剧照 `_demo-0*.webp` 也可以一并删掉。

### 以后怎么给榜单配背景图

每个名次可以配**一张背景版**，它会整行铺满、标题白字压在上面。加图就三步：

1. 把图片放进 `src/assets/images/rank/`（**格式随便**：jpg / png / webp / avif 都行）
2. 在 `src/config/rankConfig.ts` 对应条目上加一行：`cover: "assets/images/rank/jp-all-01.jpg"`
3. `pnpm dev` 看效果；改完图跑一次 `pnpm build`（构建期会自动生成 webp/avif 多档与 LQIP 占位色）

**图片规格（给素材时按这个准备最省事）**

| 项 | 值 |
| --- | --- |
| 比例 | **5.7 : 1**（宽:高），例如 **1600 × 280** |
| 体积 | 单张 ≤ 150 KB（每页 10 张 ≤ 1.5 MB） |
| 命名 | `榜单-维度-名次`：`jp-all-01.jpg`、`jp-ep-03.jpg`、`cn-all-01.jpg`、`game-01.jpg`（二游没有维度） |
| 文字 | **不要在图里做字**（标题由页面渲染，换标题不用重做图） |

> ⚠️ 直接给 16:9 的截图也能用，但会被**居中裁掉约 70% 的高度、只留中间一条**。
> 哪条留下、哪条被切，看这张对照图：`docs/imiss/rank-cover-guide.png`
> （想重新生成：`node scripts/make-rank-cover-guide.mjs`）。构图怕被裁的图，单独说明要保留哪一块。
>
> 没写 `cover` 的条目会走主题色渐变占位，不会裂图；**写了路径但文件不存在**也会自动按缺图处理（构建日志里有 warning）。

### 桌宠怎么调

右下角那只爱弥斯是常驻组件（`src/components/features/AemeathPet.astro` + `src/styles/pet.css`），配置在 **`src/config/petConfig.ts`**：

| 想改什么 | 改哪里 |
| --- | --- |
| 开 / 关桌宠 | `petConfig.enable` |
| 手机上要不要 | `petConfig.hideOnMobile`（现在 `true` = 手机不显示） |
| 大小 | `petConfig.scale`（1 = 单格 144×156 原始像素） |
| 出场靠哪边 / 台词 / 待机多久睡 | `petConfig.startSide` / `lines` / `greeting` / `idleSecondsToSleep` |
| **运动模式**（悬浮+飞行 / 固定 / 贴地） | `petConfig.movement.mode`：`"float"`（默认，悬浮 + 每 30~90 秒朝随机方向轻轻挪 60~180px）/ `"fixed"`（不悬浮不飞行、拖放也不落地）/ `"ground"`（贴地行走、松手落地） |
| 悬浮与飞行的手感 | `petConfig.movement` 的 `hoverAmplitude`（浮动幅度 px）/ `hoverPeriodMs`（周期 ms）/ `flyIntervalRange`（飞行间隔 ms，30~90s）/ `flyDurationRange`（单次飞行时长 ms，4~6s）；**位移/弧线/倾角**在 `src/utils/pet-utils.ts` 的 `PET_TUNING`：`flyDistanceRange`（单次位移 px，60~180）/ `flyArc`（弧线拱高 px）/ `flyTilt`（倾角 deg） |
| 右键菜单的位置 | `AemeathPet.astro` 的 `placeMenu()`：按**宠物矩形**并排在**左边或右边**（哪边够放哪边、默认右侧；间隙 `PET_TUNING.menuGap`、边距 `menuMargin`），纵向顶部对齐宠物顶部并夹回视口；摆好后用 `elementFromPoint` 抽 5 个点（中心 + 四角）确认没被遮挡 —— 被挡就换另一侧、两侧都被挡就纵向让开遮挡带，结果写进 `data-pet-menu-side` / `data-pet-menu-occluded` / `data-pet-menu-nudged`。R-PET-07 起不再用鼠标坐标当锚点，菜单必须带 `z-index`（= 宠物 `zIndex` + 1 = 67，低于导航栏 80 / 浮动控件 1000） |
| 右键菜单里有哪些项 | 说句话 / **落下去 · 飘起来**（按档位二选一：悬浮/固定档显示「落下去」把宠物放回地面并**真的带重力掉下去**，贴地档显示「飘起来」飘回悬浮）/ 和爱弥斯聊天。「跟过来」「睡一会儿」（R-PET-08）与「跳一下」（R-PET-09，左键单击宠物就能跳）都已按发起人要求删除 —— **能力都没删**：键盘 ←/→ 仍能指挥它走、Enter 仍等价于左键单击（`role="button"` 的无障碍激活路径）、45 秒无操作它仍会进「屏幕待机」 |
| 跳 / 走的观感 | 跳是**原地动画**（R-PET-09）：跳跃那 0.7 秒里不叠加悬浮浮动、也不位移；悬浮档平时在 `±hoverAmplitude` 内上下浮动、每 30~90 秒自己轻轻飘一段（`petConfig.movement`） |
| 行为（走、跳、拖、说话、对话） | `AemeathPet.astro` 里的脚本；状态表在 `src/utils/pet-utils.ts` |
| 和它聊天 | 右键 →「和爱弥斯聊天」→ 在**底部**的输入框里说一句（回车发送）。**接得上后端就走真实 Agent**（`agentConfig.enable: true`，默认指向本机 `127.0.0.1:2024` 的 `langgraph dev`）；**接不上就走本地 mock 台词**（`petConfig.mockReplies`），不报错、不提任何内部信息 |
| 聊天框长什么样（R-PET-11） | 尺寸 / 思考中短句 / 折叠阈值都在 `petConfig.chat`：`width`·`height`（默认 **340×460**，窄屏按可用空间收窄、塞不下才改走宠物上下方）、`minWidth`·`minHeight`（收窄下限与上下兜底的高度下限）、`thinkingLines`（**至少 3 条**，默认 4 条，每 `thinkingRotateMs` 轮换）、`historyLimit`（历史条数上限）、`collapseChars`（超过多少字才折叠给「展开全文」） |
| 聊天框摆在哪 | `AemeathPet.astro` 的 `placeChat()` → **复用右键菜单那份 `placePanel()`**（同一份选边 + 5 点遮挡抽样 + 让位 + 四边夹回视口）：默认贴宠物左边或右边，右侧还要避开右下角浮动按钮列；摆位结果写进 `data-pet-chat-side`（`left`/`right`/`above`/`below`）/ `data-pet-chat-occluded` / `data-pet-chat-w` / `data-pet-chat-h` |
| 聊天框的文本口径 | 流式增量**不上屏**（只记字数），答复完成后由 `src/utils/pet-chat-text.ts` 的 `cleanMarkdown()` 整段清洗再上屏：`**粗**`/`# 标题`/表格 `\|`/`> 引用` 这些裸符号一个都不会漏给访客；用户自己那句话只压空白与长度 |

> **怎么改运动模式（R-PET-06）**：打开 `src/config/petConfig.ts`，把 `movement.mode` 改成 `"float"`（默认：悬浮 + 偶尔到处飞）/ `"fixed"`（固定：不悬浮不飞行、拖放也不落地）/ `"ground"`（贴地走、松手落地）三者之一，**不用改任何代码**；
> 飞行间隔 / 单次时长 / 浮动幅度与周期都在同一段 `movement` 里（默认 20~60 秒飞一次、单次 2.6 秒、上下浮动 ±6px）；`pnpm dev` 下改完自动生效，生产要重新 `pnpm build`。
> 浏览器里存的旧位置记忆（`localStorage["imiss.pet.pos"]`）**不会**盖掉配置里的模式——只有"同一模式存下的坐标"才会被复用。

> 素材是 Codex 自定义宠物图集（8 列 × 9 行、单格 144×156，MIT）。第 2 行与第 1 行逐像素相同，
> 所以左走用第 1 行 + `scaleX(-1)`。**不要同时开模板自带的 Live2D / Spine 看板娘**（R-PET-04）。

## 桌宠与 Agent

桌宠是页面右下角的爱弥斯像素角色，配置在 `src/config/petConfig.ts`（开关、缩放、台词、Agent 地址）。
它连接的博客专用 Agent 是独立的 Python 服务（LangGraph + DeepSeek），**没有后端时桌宠走本地 mock，不会报错**。接入方式见 [`ARCH.md`](./ARCH.md) 第 8 章。

## 部署

本站目标是**自建服务器 + Nginx 静态托管**：

```powershell
pnpm build                       # → dist/
# 将 dist/ 上传到服务器站点目录，Nginx 指向它
```

要点（完整配置见 `ARCH.md` 第 12 章，实现文件 `deploy/nginx.conf`）：

- 路由使用 `trailingSlash: always`，产物是 `<route>/index.html`，不需要 SPA 回退；
- `/_astro/`（带内容哈希）长缓存，`/assets/` 中等缓存，HTML 不缓存；
- Agent 网关通过 `/api/` 反向代理，流式响应需 `proxy_buffering off`。

首次部署后需要回填站点信息组件与 `siteConfig.site_url`（真实域名），否则 sitemap / RSS / OG 仍是占位值。

## 与上游 Firefly 的关系

- 本站 = Firefly v6.16.8 + 本站改动。改动集中在 `src/config/*` 与**新增文件**，核心组件只做最小编辑（便于将来跟随上游升级）。
- 上游升级步骤：拉取上游新版 → 用 `git diff` 核对 `src/components`、`src/utils`、`scripts` 的冲突 → 保留本站的 `src/config/*`、`src/content/*`、`public/*` 与新增组件。
- 首页横幅文字、导航、页面开关等差异都在配置层，升级时不需要改代码。

## 许可与致谢

- 主题：[Firefly](https://github.com/CuteLeaf/Firefly)（MIT），基于 [Fuwari](https://github.com/saicaca/fuwari)。
- 桌宠像素素材：[aemeath-mini-codex-pet](https://github.com/cuNuo/aemeath-mini-codex-pet)（MIT），其像素小人来源 [lzy-buaa-jdi/ameath](https://gitee.com/lzy-buaa-jdi/ameath)（MIT）。
- 免责声明：本站为非官方粉丝项目；爱弥斯、《鸣潮》及相关官方视觉设定归其权利方（库洛游戏）所有。
