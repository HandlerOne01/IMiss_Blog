# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IMiss Blog is a personal blog built on a feature-rich static blog theme for **Astro 7** with **Svelte 5** for interactive components. The theme itself is derived from [Fuwari](https://github.com/saicaca/fuwari) extended with extensive features; this repository is that theme's **secondary development** by the site owner. Upstream attribution and licence live in `LICENSE` and `README.upstream.zh.md`. Primary language is Chinese (Simplified) with i18n for en, zh_TW, ja, ko, ru.

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server at `localhost:4321` |
| `pnpm build` | Production build (LQIPs → VNDB covers → Astro build → pio asset pruning → font subsetting → Pagefind indexing) |
| `pnpm preview` | Preview production build |
| `pnpm check` | `astro check` for type/error checking |
| `pnpm type-check` | `tsc --noEmit --isolatedDeclarations` (covers `src/` and `scripts/`) |
| `pnpm lint` | Biome lint + auto-fix（⛔ 本项目不要跑 —— 见 Code Style 的 T75） |
| `pnpm format` | Biome format（⛔ 本项目不要跑 —— 见 Code Style 的 T75） |
| `pnpm new-post <filename>` | Scaffold a new blog post |
| `pnpm new-dynamic` (`new-d`) | Scaffold a new dynamic (microblog) entry |
| `pnpm lqips` | Regenerate LQIP data into `src/constants/lqips.json` |

Package manager is **pnpm** (enforced). Node.js >= 22 required.

## Architecture

### Astro + Svelte Hybrid

- `.astro` components for static content and layouts
- `.svelte` components for interactive UI (search, settings, pagination, archive) — mounted with `client:load` or `client:visible`
- Swup.js handles SPA-like page transitions with multiple container targets

### Configuration-Driven

All features are toggled/configured via TypeScript files in `src/config/`, exported through the barrel at `src/config/index.ts`. Key configs:

- `siteConfig.ts` — core site settings, theme, pagination
- `sidebarConfig.ts` — sidebar layout (left/right/both, widget ordering)
- `commentConfig.ts`, `analyticsConfig.ts`, `fontConfig.ts`, etc.

### Layout System

- `Layout.astro` — base HTML shell (head, body, theme init, analytics, Swup hooks)
- `MainGridLayout.astro` — full page grid with sidebar(s), navbar, wallpaper, footer

### Scroll Performance Constraints

Scroll-linked work in `src/utils/` is rAF-throttled and must stay cheap on mobile — do not regress these:

- `fullscreen-wallpaper-utils.ts` — fullscreen-mode title fade + blur ramp. The blur value `--fullscreen-blur` is **quantized to 2px steps** (skips writes when unchanged) and the max blur (`--overlay-blur`) is **cached** (read once; refreshed by a MutationObserver on `#wallpaper-wrapper` style). Avoid per-frame `getComputedStyle` or continuous full-screen `filter: blur()` writes — each change re-rasterizes the whole viewport on mobile.
- `grid-layout-utils.ts` — `updateSidebarStickySpacing()` is the per-scroll path and **must not read layout** (`offsetHeight` etc.). The sidebar top-container visibility (`hasVisibleTop`) is cached by `refreshSidebarStickyState()`, which runs on init/navigation only.
- Fullscreen blur ramp can be disabled per device via `backgroundWallpaper.fullscreen.blurRamp.enable.{desktop,mobile}` — when off, fullscreen mode has no blur on that device (home + other pages) and the settings-panel blur slider is hidden. Documented in the upstream template documentation set (the multi-language READMEs kept under `docs/`).

### Content Collections

Defined in `src/content.config.ts`:
- `posts` — blog posts (`.md`/`.mdx`) with frontmatter: title, published, tags, category, draft, pinned, password, comment, etc.
- `spec` — special pages (about, guestbook)
- `dynamic` — microblog entries (`.md`) with frontmatter: published, pinned, location

### Key Directories

- `src/components/` — organized by domain: `analytics/`, `comment/`, `common/`, `controls/`, `features/`, `layout/`, `misc/`, `pages/`, `widget/`
- `src/plugins/` — 15 custom remark/rehype plugins (Mermaid, PlantUML, KaTeX, GitHub cards, reading time, wiki links, etc.)
- `src/i18n/` — translation keys in `i18nKey.ts`, language files in `languages/*.ts`, lookup via `translation.ts`
- `src/utils/` — content sorting, crypto (encrypted posts), date formatting, image processing/LQIP, TOC generation
- `src/pages/` — Astro file-based routing
- `scripts/` — build-time utilities (`generate-lqips.ts`, `generate-vndb-covers.ts`, `subset-fonts.ts`, `new-post.js`, `new-dynamic.js`)

### Path Aliases (tsconfig.json)

`@components/*`, `@assets/*`, `@constants/*`, `@utils/*`, `@i18n/*`, `@layouts/*` → `./src/<dir>/*`; `@/*` → `./src/*`

## Code Style

- **Biome** enforces: tab indentation, double quotes, recommended lint rules
- Relaxed rules for `.svelte`/`.astro`/`.vue` files (`useConst`, `useImportType`, `noUnusedVariables`, `noUnusedImports` off)
- ⛔ **本项目不要跑 `pnpm lint` / `pnpm format`**：它们是 `biome check|format --write ./src ./scripts`（**不是只针对 `./src`** —— 这句旧话与 `package.json` 不符，已按陷阱 T75 更正），会改写 `scripts/verify-ui.mjs` 里 CDP 模板字符串中的正则（`/rgba?\(([^)]+)\)/` → `/rgba?(([^)]+))/`，语义已变）并顺带重排十几个无关文件。要保格式只对**动过的文件**跑 `npx biome check <files>`；`scripts/` 里仍有历史 Biome 报告，没人打算清
- `scripts/subset-font.d.ts` is a hand-written ambient declaration for the untyped `subset-font` package
- Commit convention: **Conventional Commits** (`feat:`, `fix:`, `chore:`, etc.)
- ⛔ **写文件与写提交信息都不要走 PowerShell 的文本输出**（`Set-Content` / `Out-File` / `echo … >`）：它会加 UTF-8 BOM，本项目**已经踩过两次**（一次是三份文档整批，一次是**4 个提交的主题行首字符是 U+FEFF**，父级用 `git filter-branch --msg-filter` 才修掉）。文件用编辑器/Node 写；提交信息用 `git commit -F <文件>` 或 `-m`，别用管道拼字符串。与 T75 同一节，登记为陷阱 **T58**
- ⛔ **它的另一半（同一个"一边写、一边读"的病因）**：**Windows PowerShell 5.1 把无 BOM 的 `.ps1` 按系统 ANSI/GBK 读** —— 带中文注释的脚本会在**被调用时**成片语法崩，而用"先自己解码再 `ParseInput`"的方式检查却永远是 0 error（见陷阱 **T86**，`ARCH.md` §14.3）。**面向 Windows 交付的脚本优先用 Node**；非用 `.ps1` 不可时内容保持纯 ASCII。通用判据：**检查器必须和真实消费者走同一条读取路径**（"语法检查通过" ≠ "能跑"）

## Build Pipeline

Multi-step: `scripts/generate-lqips.ts` → `scripts/generate-vndb-covers.ts` → `astro build` → `scripts/prune-pio-assets.ts` → `scripts/subset-fonts.ts` → `scripts/minify-inline-scripts.ts` → `pagefind --site dist`

LQIP data is generated into `src/constants/lqips.json` and committed — regenerate with `pnpm lqips`. Icon data lives in `src/constants/icons-data.json` (committed, Biome-ignored, consumed by `src/components/common/Icon.svelte`) but has no generator script in the current build.

`generate-vndb-covers.ts` downloads VNDB cover art into `public/vndb-covers/` (gitignored, skips files that already exist). It no-ops unless `siteConfig.vndb` has a `userId`, `downloadCovers: true`, and `mode: "static"`.

`prune-pio-assets.ts` deletes unused 看板娘 assets from `dist/` after the Astro build (Astro copies all of `public/` regardless of config). It drops `dist/pio/models/live2d` plus the orphaned `Live2DWidget` client chunk when `live2dWidgetConfig.enable` is false, `dist/pio/models/spine` and `dist/pio/static` when `spineModelConfig.enable` is false, and all of `dist/pio` when both are off (~15 MiB). It no-ops when both are enabled.

## Deployment

- **Vercel** (default, `vercel.json`)
- **Cloudflare Workers** (`wrangler.jsonc`, set `CF_WORKERS` env var)
- Static output to `dist/`

