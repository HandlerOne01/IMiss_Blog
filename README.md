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

期望输出：`功能断言 107 项：通过 107，失败 0`。
若输出 `检测到 astro dev 服务器` 的提示，说明你对 `pnpm dev` 跑了它——
那会把"关闭页面"等断言误判，请改成对 `pnpm preview` 跑。

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
| `pnpm verify:ui` | 界面验收：107 项断言 + 泄漏扫描 + 对比度 A/B + 15 张截图（**要先 `pnpm build` 再 `pnpm preview`**） |
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

## 维护排行榜

排行榜数据在 `src/config/rankConfig.ts`：四组数据（日漫 / 国漫 × 全剧 / 单集），**数组顺序就是名次**，只有一期、手工维护。条目配图放 `src/assets/images/rank/`；不填配图会自动用主题色渐变占位，不会出现裂图。

页面：`/rank/jp/`（日漫排行）、`/rank/cn/`（国漫排行），右上角可在「全剧 / 单集」间切换（状态写在 URL 的 `?kind=` 上，可以直接分享链接）；`/rank/game/`（二游排行）**没有维度**，直接是一份名单——它的数据在同一个文件里写成一个数组即可（`game: { ..., data: [ … ] }`）。

> 现在是**占位数据**（示例作品 01~10），所以页面底部有一条提示。填完真实数据后，把同一个文件里的 `dataStatus` 从 `"placeholder"` 改成 `"final"`，提示就会消失；两张演示剧照 `_demo-0*.webp` 也可以一并删掉。

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
