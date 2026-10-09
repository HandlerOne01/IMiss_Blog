---
title: "本站使用与维护手册"
published: 2026-10-09 18:30:00
description: "从新建一个 .md、插一张图、发一条动态，到把文章挂进学习路线、以及删除一篇文章要动哪些地方：本站各类内容分别放在哪个目录、哪些字段必填、改完要跑哪几条命令，都收在这一篇里。"
category: "本站维护"
tags: ["Astro", "写作流程", "Markdown", "站点维护"]
lang: "zh_CN"
draft: false
comment: true
---

## 这篇是写给谁的

这座站是**静态站点**：所有内容在构建时被"编译"成一堆 HTML 文件，再整体发布出去。这个特性决定了一件事 —— **写内容就是改文件，发布就是重新构建**。没有后台、没有数据库里的编辑器，也没有"登录后点保存"这一步。

所以这篇手册写给两类人：

- **要往站里加内容的人**：写文章、发动态、传图片、加项目、建相册、换壁纸；
- **要维护这座站的人**：删内容、改配置、上线前跑自检。

读完之后，前面那些事每一件都应该能**照着目录和命令自己做完**，而不是靠记忆或猜。文中出现的路径都是仓库里的真实路径，命令都是可以直接复制执行的。

> [!TIP]
> 全文只有一个前提：本机装好了 **Node.js 22 以上** 与 **pnpm**（仓库的 `preinstall` 会强制只用 pnpm）。所有命令都在**仓库根目录**执行。

---

## 一、先认识六个命令

内容维护 90% 的时间只会用到下面这几条。左侧是命令，右侧是它真正做的事：

| 命令 | 作用 | 什么时候用 |
| --- | --- | --- |
| `pnpm dev` | 起本地开发服务器（`localhost:4321`） | 边写边看，改完立刻刷新 |
| `pnpm new-post <文件名>` | 在 `src/content/posts/` 下生成一篇文章的骨架 | 开新文章 |
| `pnpm new-dynamic <一句话>` | 在 `src/content/dynamic/` 下生成一条带时间戳的动态 | 发动态 |
| `pnpm build` | 生产构建：生成图标与 LQIP、编译 Astro、字体子集化、建搜索索引，产物在 `dist/` | 发布前 |
| `pnpm preview` | 用本地服务器预览 `dist/`（看到的是"线上真实产物"） | 构建后想确认最终效果 |
| `pnpm verify:posts` | 内容自检：逐篇检查 frontmatter、图片引用、站内链接、残留语法 | 每次改完内容 |

另外三条只在特定场景用得上：`pnpm check`（类型与模板诊断）、`pnpm type-check`（纯 TypeScript 检查）、`pnpm lqips`（重新生成图片的模糊占位数据）。

> [!IMPORTANT]
> 本站的技巧在于：**内容目录本身就是数据源**。`src/content/` 下每多一个合法文件，站上就多一份内容；删掉文件，内容就消失 —— 不需要改任何"列表配置"。唯一的例外是**学习路线**，它有一份手工维护的篇目表，下面第三节专门讲。

---

## 二、写一篇文章

### 2.1 文件放在哪、叫什么名字

文章统一放在 `src/content/posts/`，并且**按分类分子目录**：

```
src/content/posts/
├─ cpp/            ← 分类目录（决定文章的 category 归属）
├─ algorithm/
├─ linux/
├─ linux-net/
├─ mysql/
├─ stl/
├─ cpp11/
├─ interview/
├─ project/
└─ ai/
```

一个文件就是一篇：`src/content/posts/<分类目录>/<slug>.md`。**文件名即 URL 的一部分**，站点地址是 `/posts/<分类目录>/<slug>/`。所以文件名建议用**小写英文或拼音**，不要用中文和空格 —— 例如 `src/content/posts/project/boke-shiyong-yu-weihu-shouce.md` 对应 `/posts/project/boke-shiyong-yu-weihu-shouce/`。

### 2.2 用脚手架开一篇（推荐）

```bash
pnpm new-post project/boke-shiyong-yu-weihu-shouce
```

它会：

1. 自动补上 `.md` 后缀；
2. 目录不存在就**递归创建**；
3. 写入一份带 frontmatter 的骨架；
4. 如果文件已存在，**直接报错退出**（不会覆盖已有内容）。

生成出来的骨架长这样：

```markdown
---
title: project/boke-shiyong-yu-weihu-shouce
published: 2026-10-09
description: ''
image: ''
tags: []
category: ''
draft: false
lang: ''
slug: project/boke-shiyong-yu-weihu-shouce
---

```

骨架里的 `title`、`category` 需要**手工改成人话**（脚手架只是把参数原样塞进去），`slug` 那一行可以删掉 —— 它不是内容 schema 的字段，URL 由文件路径决定。

### 2.3 frontmatter 字段总表

`src/content.config.ts` 里定义了文章的 schema，字段与默认值如下（**只有前两个是必填**，其余留空即可）：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `title` | 字符串 | **必填** | 文章标题 |
| `published` | 日期 | **必填** | 发布日期，写 `2026-10-09` 或 `2026-10-09 18:30:00` 都行 |
| `updated` | 日期 | 无 | 更新日期（可选，列表与详情页会显示） |
| `draft` | 布尔 | `false` | `true` = 草稿，**生产构建不收录**（本地 `pnpm dev` 仍可预览） |
| `description` | 字符串 | `""` | 摘要，列表卡片与搜索结果会用到 |
| `image` | 字符串 | `""` | 封面图（写站内绝对路径，如 `/images/posts/xxx/cover.webp`） |
| `tags` | 字符串数组 | `[]` | 标签，会进 `/tags/` 页面 |
| `category` | 字符串或空 | `""` | 分类的**显示名**（目录名才是它的归属），如 `"项目实战"` |
| `lang` | 字符串 | `""` | 语言标记，本站统一写 `"zh_CN"` |
| `pinned` | 布尔 | `false` | 置顶 |
| `comment` | 布尔 | `true` | 是否允许评论（本站评论系统未接入，这条只是预留） |
| `password` / `passwordHint` | 字符串 | `""` | 加密文章与密码提示；填了 `password` 正文会被加密，访客要输密码才能看 |
| `series` / `seriesOrder` | 字符串 / 数字 | `""` / 无 | 系列名与系列内序号，用于 `/series/` 页面 |
| `author` / `sourceLink` | 字符串 | `""` | 作者与原文链接（转载时填） |
| `licenseName` / `licenseUrl` | 字符串 | `""` | 许可协议（本站已在站点层关闭许可块，一般不用） |

> [!WARNING]
> 日期写错格式（比如写成 `2026/10/09`）会让构建**直接失败**并指出是哪一篇。schema 校验很严格，不要靠"大概能过"。

### 2.4 正文里能直接用哪些语法

正文是标准 Markdown，另外站里装好了一批扩展，直接写就能用：

| 写法 | 效果 |
| --- | --- |
| 围栏代码块 + 语言名 | 带语言徽标、行号、折叠的代码块（Expressive Code） |
| `> [!NOTE]` / `> [!TIP]` / `> [!WARNING]` / `> [!IMPORTANT]` / `> [!CAUTION]` | 提示块（本文里就有几个） |
| `$E=mc^2$` 与 `$$…$$` | 行内 / 块级公式（KaTeX） |
| 代码块标注 `mermaid` | 流程图、时序图，支持缩放拖拽 |
| 代码块标注 `plantuml` | UML 图（构建期渲染成图片） |
| `::github{repo="owner/name"}` | GitHub 仓库卡片 |
| Tab 代码块（`rehype-code-group`） | 把多个代码块合成一组，顶部生成标签页切换 |
| 连续的图片行 | 自动组成图片网格（图集） |

写正文时还有两条本站的硬规矩：

- **不要写 HTML 里的裸 `<script>`**，也不要写会和外层模板冲突的标签；
- **外链**会被自动加上新窗口打开与转发策略，不需要手工补 `target="_blank"`。

### 2.5 插图：放哪里、怎么引用

图片统一放在 `public/images/posts/<slug>/` 目录下，正文里用**站内绝对路径**引用：

```markdown
![这张图的说明](/images/posts/boke-shiyong-yu-weihu-shouce/01.png)
```

目录名建议与文章 slug 一致（站内 125 张正文插图都是这个约定），这样一篇的所有素材集中在一个目录里，删除时不会漏。

几条与图片有关的约定：

- `public/images/posts/**` **不进构建期图片管线**，原样发货 —— 也就是说**不需要**为正文插图跑 `pnpm lqips`，也不要在正文里引用 `src/assets/` 下的文件；
- 格式优先 `webp` / `avif`，插画类 `png` 也行，但**不要用手机直出的大 JPEG**（一张 4 MB 的图会让首屏很难看）；
- 图片的替代文字（`![]` 方括号里那一段）尽量写一句人话，这既是无障碍要求，也是图挂了之后唯一的线索。

### 2.6 本地预览与发布前自检

```bash
pnpm dev                      # 边写边看
pnpm check                    # 模板与类型诊断：0 error 才算过
pnpm verify:posts             # 内容自检：frontmatter、图片、链接、残留语法
pnpm build                    # 生产构建（这一步会真正把文章编译进 dist/）
```

`pnpm verify:posts` 是内容这一层最值得依赖的一道闸门：它按篇扫描，检查 frontmatter 是否完整、`image` 指向的文件是否存在、正文引用的站内链接是否有目标、有没有残留的编辑器标记（比如 Obsidian 的 `==高亮==`）、有没有重复标题等等。**它说 0 错误，才说明这篇"能上线"**。

至于"发布"：本站没有上传按钮。构建产物 `dist/` 交给托管平台（Vercel / Cloudflare Workers / 自己的 Nginx 都可以），所以**发布 = 把改动提交并推送**，剩下的交给平台的构建流水线。

### 2.7 完整流程（照这个顺序做就不会漏）

1. `pnpm new-post <分类目录>/<slug>` 生成骨架；
2. 改 `title` / `category` / `description` / `tags`，写正文；
3. 图片放进 `public/images/posts/<slug>/`，正文用 `/images/posts/<slug>/xx.png` 引用；
4. **把这篇挂进学习路线**（见下一节 —— 漏了这一步构建会失败）；
5. `pnpm dev` 肉眼过一遍：标题、图片、代码块、脚注；
6. `pnpm check` → `pnpm verify:posts` → `pnpm build` 三条都过；
7. 提交并推送。

---

## 三、必修项：把文章挂进「学习路线」

学习路线页 `/roadmap/` 的数据**不在内容目录里**，而在一份手工维护的配置：`src/config/roadmapConfig.ts`。它的结构是「主线 → 阶段 → 篇目」，篇目用 **`category`（目录名）+ `slug`（文件名）成对定位**：

```ts
// 站内允许同名篇目（cpp/vector 与 stl/vector 就是两篇），所以定位必须成对
s("project", "boke-shiyong-yu-weihu-shouce")
s("cpp", "vector", "vector · 实现")        // 第三个参数只改本页显示名
s("linux", "neicunguanli", undefined, true) // 第四个参数 = 跨线复用标记
```

规矩有三条：

1. **`category` 与 `slug` 都必须能对上真实文件** —— 对不上，`pnpm build` **当场失败**（这是故意的：路线页宁可不构建，也不静默漏掉一篇）；
2. 顺序就是页面顺序，**不写"第 N 步"这类数字**，所以调整顺序不需要改编号；
3. 页顶那几个数字（多少篇、多少条主线、多少个停靠点、约多少小时）**是构建期实算的**，不要手工维护 —— 但也因此，**站内每一篇都必须至少出现在一条主线里**：站内文章总数与路线页篇目并集必须相等，有专门的断言在盯着这件事。

新增一篇的标准动作，就是在合适的主线里加一行 `s(category, slug)`；跨线的复用篇目加第四个参数 `true`。

---

## 四、发一条动态

动态（微动态）是短内容，放在 `src/content/dynamic/`：

```bash
pnpm new-dynamic 今天把学习路线的停靠点又核对了一遍。
```

脚本会：

1. 按 `siteConfig.timezone`（本站是 `Asia/Shanghai`）取当前时间；
2. 生成文件名 `YYYY-MM-DD-HHMMSS.md`；
3. 写入 `published: <时间戳>` 的 frontmatter 与正文。

动态的 schema 只有三个字段：`published`（必填）、`pinned`（置顶，默认 `false`）、`location`（地点，默认空）。**正文就是一句话**，不需要标题，也不会出现在文章列表里。

动态里同样可以插图：图片放 `public/images/dynamic/`（或与文章共用 `public/images/` 下一层子目录），正文用 `/images/...` 的绝对路径引用即可 —— 规则和文章一样，走的是同一套 Markdown 管线。

> [!TIP]
> 动态的"删除"就是把那个 `<时间戳>.md` 删掉，没有别的联动配置。`/dynamic/` 页面自身在 `siteConfig.pages.dynamic` 开关下（本站为开启）。

---

## 五、加一个项目

项目放在 `src/content/projects/<slug>.md`，一个文件一个项目，详情页地址是 `/projects/<slug>/`。字段如下：

| 字段 | 说明 |
| --- | --- |
| `title` | 项目名（**列表卡的标题框只有一行宽度**，太长会被截断，见文末"容易踩的坑"） |
| `published` | 日期 |
| `description` | 一句话介绍，卡片上显示两行 |
| `tags` | 技术栈标签，卡片上显示前两个 + 一个"还有 N 个" |
| `link` | 外链数组，每项 `{ label, icon, value }`：`label` 是按钮文字，`icon` 是图标名，`value` 是地址 |
| `status` | 状态文案的键（列表页的筛选条就是按它生成的） |
| `order` | 排序权重，**降序：数字越大越靠前**，不填的排最后 |

```markdown
---
title: "示例项目"
published: 2026-10-09
order: 5
description: "一句话说清它是什么、用什么写的。"
tags: ["Python", "LangGraph"]
link:
  - label: "源码仓库"
    icon: "simple-icons:gitee"
    value: "https://gitee.com/<你的账号>/<仓库>"
status: "published"
---
```

项目详情页的正文就是普通 Markdown，可以放架构图、数据表、代码片段 —— 与文章用的是同一套渲染管线。

---

## 六、建一个相册

相册需要**两处同时动手**，缺一不可：

1. 在 `src/config/galleryConfig.ts` 的 `albums` 数组里加一项；
2. 在 `public/gallery/<相册 id>/` 下建同名目录，把图片放进去（支持 jpg / png / webp / avif / gif）。

每一项的字段：`id`（唯一标识，同时是目录名与 URL）、`name`、`description`、`location`（拍摄地）、`date`（`YYYY-MM-DD`，用于排序）、`tags`、`cover`（可选：不填时用目录里的 `cover.*`，再没有就用第一张图）、`password` / `passwordHint`（可选：加密相册）。

> [!WARNING]
> **配置项与目录必须成对增删**：只删目录会留下一个"0 张照片"的空相册，只删配置会留下孤儿文件与孤儿路由。删除相册时两处一起删。

---

## 七、加一张书签卡

书签导航页 `/booknav/` 的卡片在 `src/config/booknavConfig.ts`：按"分组 → 卡片"两层组织，分组用 `weight` 决定先后（数字大的在前），卡片要写 `title` / `url` / `desc`。

图标有两种来源：

- **iconify 品牌图标**：写 `icon: "simple-icons:xxx"`，构建期打包进产物；
- **本地图标**：图片放 `public/booknav-icons/`，卡片写站内路径。

每张卡还可以给一个品牌色：`iconColor: brandHex("<品牌键>")`，键名定义在 `src/constants/booknav-brand-colors.ts`。**键名打错会直接抛错**，这是有意为之 —— 静默退化成灰色会让一张卡悄悄变得不一样，没人会发现。

本站已把"自动抓取第三方 favicon"的开关关掉了（`favicon.enabled: false`）：开着的话，每张没写图标的卡都会向第三方接口请求一次，等于把访客的浏览清单交出去。

---

## 八、照片之外：外观与站点级配置

| 想改什么 | 改哪里 |
| --- | --- |
| 站点名、副标题、描述、关键词 | `src/config/siteConfig.ts`（`title` / `subtitle` / `description` / `keywords`） |
| 主题色相 | 同上，`themeColor.hue`（本站 `345`，粉色系；访客可在显示设置面板里自己覆盖） |
| 页面开关（动态、项目、相册、书签导航…） | 同上，`pages` —— 关掉的页面不进导航、不进 sitemap、不进 `llms.txt` |
| 导航菜单 | `src/config/navBarConfig.ts`（顶层项与下拉子项都在这里；带 `pageKey` 的项会随页面开关自动隐藏） |
| 首页横幅文案 | `src/config/backgroundWallpaper.ts` 的 `common.homeText`（主标题 + 打字机轮播的一组小字；轮换快慢看同一个配置里的 `typewriter.pauseTime`） |
| 侧栏公告 | `src/config/announcementConfig.ts`（`content` / `link` / `closable`） |
| 桌面/手机壁纸 | `src/config/backgroundWallpaper.ts` 的 `video.playlist`：每项一个视频，视频本体放 `public/assets/wallpaper/<slug>.mp4`，同目录再放一张同名的首帧海报 `<slug>-poster.webp`（弱网与"减少动态"时会显示它） |
| 背景音乐 | `src/config/musicConfig.ts` 的本地歌单：音频放 `public/assets/music/`，封面放 `public/assets/music/cover/`，两个入口开关分别是 `showInNavbar` / `showInSidebar` |
| 关于页 / 关于本站 | `src/content/spec/about.md`、`src/content/spec/about-site.md` |
| 站点图标与头像 | 设计源放仓库根的 `design/`，跑 `pnpm make:logo` 生成各种尺寸 |

壁纸那一项值得多说一句：每支视频可以带**取景参数**（水平/垂直落点、放大倍数）。原因是素材是 2.36:1 的超宽画面，而站点同时有手机横幅、桌面横幅、全屏壁纸几种很不一样的框 —— 不写取景参数，窄框里可能会把人物裁掉半边。

---

## 九、删除一篇文章要动哪些地方

内容目录是数据源，但**有几处是会"记住"这篇文章的**，删的时候要一起清：

- [ ] 删掉 `src/content/posts/<分类目录>/<slug>.md`；
- [ ] 删掉它的图片目录 `public/images/posts/<slug>/`（这是把图片按 slug 集中存放的原因）；
- [ ] 去 `src/config/roadmapConfig.ts` 里**删掉对应的那一行 `s(category, slug)`** —— 不删，构建会因为"路线里指向一篇不存在的文章"而失败；
- [ ] 如果正文里有指向它的站内链接，一并改掉（`pnpm verify:posts` 会逐条报告失效链接）；
- [ ] 如果公告、关于页等文案里写了"站内共 N 篇"这类数字，**把数字改对**（站里有一条断言专门盯着公告里那句话，数字不对会判红）；
- [ ] 提交前跑一遍 `pnpm verify:posts` 与 `pnpm build`。

删除**动态**只需要删一个文件；删除**项目**要删 `src/content/projects/<slug>.md`，如果它的详情页被别处引用过，同样用自检脚本找出来。

---

## 十、收工前的六道自检

改完内容，按顺序跑完这六条再提交：

| 命令 | 它在查什么 | 通过长什么样 |
| --- | --- | --- |
| `pnpm check` | 模板与类型诊断 | `0 errors / 0 warnings` |
| `pnpm type-check` | 纯 TypeScript 检查 | 退出码 0 |
| `pnpm verify:posts` | 逐篇内容自检（frontmatter / 图片 / 站内链接 / 残留语法 / 重复标题） | `N 篇 0 错误` |
| `pnpm build` | 真实构建：任何一处内容不合规都会在这里炸出来 | 生成 `dist/` 与页数统计 |
| `pnpm verify:ui` | 真开浏览器跑界面断言（导航、卡片、路线页、桌宠、壁纸…） | `❌ 0` |
| `pnpm verify:docs` | 文档口径一致性（版本号、断言条数、截图张数、阻塞项编号） | `15 项：通过 15` |

前四条是"内容对不对"，后两条是"站还完整吗"。它们的意义在于：**把"我记得要改哪里"变成"脚本会告诉我漏了哪里"**。

---

## 十一、最容易踩的五个坑

1. **忘了把新文章挂进学习路线** —— 构建直接失败。这不是 bug，是设计：站内每一篇都必须能被路线页解释。
2. **把图片放进 `src/assets/` 再在正文里引用** —— 正文插图约定是 `public/images/posts/**`；`src/assets/` 下的图片会被构建管线改名成带哈希的文件名，正文里的固定路径必然 404。
3. **草稿忘了改 `draft: false`** —— 本地能看到、线上什么都没有，而且自检脚本**不会**报错（草稿是合法的）。发布前搜一遍 `draft: true`。
4. **作品名写成一句话** —— 列表卡的标题框只有一行宽度，超长的名字会被截断成一个没有信息量的前缀。标题该长就长在**详情页**，卡片名尽量短。
5. **改了带数字的文案没同步** —— 公告里的"共 N 篇"、页顶的统计数字，都和别人有联动：统计数字是构建期实算的（不用管），但**配置里手写的数字必须自己改对**，站内有断言盯着它们。

---

## 结语

把这座站的内容维护拆开看，其实只有三种动作：**放文件、改配置、跑命令**。

- 放文件：`src/content/**` 决定"有什么内容"，`public/**` 决定"素材在哪"；
- 改配置：`src/config/**` 决定"怎么组织、怎么显示"，其中学习路线是唯一必须手工维护的清单；
- 跑命令：`pnpm check` / `verify:posts` / `build` / `verify:ui` / `verify:docs` 把"我是不是漏了什么"交给脚本回答。

这三件事都不需要懂前端框架。真正需要记的只有一条因果关系：**内容目录里有什么，站上就有什么；而学习路线必须能解释站上的每一篇。**
