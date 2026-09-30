# Repository Guidelines

## Project Structure & Module Organization

IMiss Blog is a personal blog built on **Astro 7** with **Svelte 5** islands and TypeScript configuration. Main source code lives in `src/`: routes in `src/pages`, layouts in `src/layouts`, reusable UI in `src/components`, styles in `src/styles`, content in `src/content`, helpers in `src/utils`, and Markdown/HTML plugins in `src/plugins`. Site configuration is split across `src/config` with matching type definitions in `src/types`; prefer imports from `@/config` when available. Static files served directly belong in `public`, source-managed images in `src/assets`, upstream documentation kept for reference in `docs`, and automation in `scripts`. This site is a secondary development of an Astro blog template; upstream attribution and licence live in `LICENSE` and `README.upstream.zh.md`.

## Build, Test, and Development Commands

Use `pnpm`; the `preinstall` script enforces it.

- `pnpm dev` or `pnpm start`: run the local Astro dev server.
- `pnpm check`: run Astro diagnostics.
- `pnpm type-check`: run TypeScript with `--noEmit`.
- `pnpm format` / `pnpm lint`: `biome … --write ./src ./scripts` — **do not run in this project**: it rewrites regexes inside the CDP template literals in `scripts/verify-ui.mjs` and reformats unrelated files (trap T75). Format only the files you touched: `npx biome check <files>`.
- Never write files **or commit messages** through PowerShell text output (`Set-Content` / `Out-File` / `echo … >`): it adds a UTF-8 BOM, and this project has already been bitten twice (once across the three docs, once with **4 commit subjects starting with U+FEFF**, fixed via `git filter-branch --msg-filter`). Write files with the editor/Node, and commit with `git commit -F <file>` or `-m` — never a PowerShell pipeline. Same root cause as T75's neighbours, logged as trap **T58**.
- The other half of T58's "one side writes, the other side reads" family: **Windows PowerShell 5.1 reads a BOM-less `.ps1` as ANSI/GBK**, so a script with non-ASCII comments blows up **when it is invoked** (not when it is parsed by a "decode it yourself first" checker). Prefer Node for scripts handed to Windows, or keep `.ps1` content pure ASCII. Logged as trap **T86** in `ARCH.md` §14.3 — its real lesson is that a checker must read a file the same way its real consumer does.
- `pnpm build`: generate icons, LQIPs, the Astro build, font subsets, and Pagefind search output in `dist`.
- `pnpm preview`: preview the production build locally.
- `pnpm new-post`: scaffold a new content post.

## Coding Style & Naming Conventions

Biome is the formatter and linter. It uses tabs for indentation and double quotes for JavaScript/TypeScript strings. Keep Astro and Svelte components in `PascalCase` (`PostCard.astro`, `Search.svelte`), config modules in `camelCase` ending with `Config.ts`, and utilities in descriptive kebab case such as `date-utils.ts`. Keep `src/types` aligned with `src/config`. Avoid unrelated formatting churn.

## Testing Guidelines

There is no dedicated unit-test framework configured. Before submitting changes, run `pnpm check`, `pnpm type-check`, and `pnpm build` for rendering, content, or generated asset work. For visual or interactive changes, verify with `pnpm dev` or `pnpm preview` and include screenshots in the PR. Name future tests near the feature they cover, using the local file name as the stem.

## Commit & Pull Request Guidelines

Use Conventional Commits, matching the current history: `feat: ...`, `fix: ...`, and `chore: ...`. Keep commits and PRs focused on one concern. PRs should include a concise summary, linked issues when relevant, validation commands run, and screenshots for UI changes. Discuss major features or design changes in an issue or discussion before implementation.

## Security & Configuration Tips

Do not commit secrets, tokens, or service keys in config files. Keep deployment-specific settings in the target platform environment, and review generated files such as `dist`, `src/constants/lqips.json`, and `src/constants/icons.ts` before committing them.
