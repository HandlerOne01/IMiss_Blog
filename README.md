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

## 快速开始

```powershell
pnpm install          # 安装依赖（见下方"网络"提示）
pnpm dev              # 开发服务器 http://localhost:4321
pnpm build            # 生产构建 → dist/
pnpm preview          # 本地预览构建产物
```

**网络提示（开发机与服务器都适用）**

- 直连 `registry.npmjs.org` 很慢/会超时，安装依赖请加国内镜像：
  `pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com`
- 装完依赖后，`pnpm build` **全程不需要外网**（字体已本地化、VNDB 封面默认关闭、GitHub 卡片失败会回落缓存），断网也能构建成功。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` / `pnpm start` | 本地开发（默认 4321 端口） |
| `pnpm check` | Astro 诊断（类型 / 内容 / 模板错误） |
| `pnpm type-check` | `tsc --noEmit`，覆盖 `src/` 与 `scripts/` |
| `pnpm build` | 生产构建：LQIP → VNDB 封面（未配置则跳过）→ Astro → 清理未用看板娘资源 → 字体子集 → 内联脚本压缩 → Pagefind 索引 |
| `pnpm preview` | 预览 `dist/` |
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

页面：`/rank/jp/`（日漫排行）、`/rank/cn/`（国漫排行），右上角可在「全剧 / 单集」间切换。

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
