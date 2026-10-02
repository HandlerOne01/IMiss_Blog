# `public/booknav-icons/` —— 书签导航本地站点图标

> 本目录的 PNG **不是**本站原创素材，是各站**官方 favicon** 的本地副本，
> 用途只有一个：IMiss Blog 的「书签导航」页（`/booknav/`）每张卡片左侧的图标位。
> 图标版权归各站点所有，本站仅作导航标识使用。

## 为什么放本地

运行期**零第三方请求**：图标全部随站点一起发布，访客打开书签页不会把
常用站点清单交给任何 favicon 聚合服务（这是上一轮已经定下的口径，
`src/config/booknavConfig.ts` 里 `favicon.enabled` 至今为 `false`）。
所以配置里写的是 `/booknav-icons/<slug>.png`，**不是**网络图片 URL。

## 重新获取

```bash
# ⚠️ 用 tsx 而不是裸 node：本脚本 `import` 了 TS 模块
#    `src/constants/booknav-brand-colors.ts`（品牌色同源），裸 node 读不了 .ts
npx tsx scripts/fetch-booknav-icons.mjs
```

脚本会重跑一遍取图（官网 `favicon.ico` → 页面 `<link rel="icon">` → 一次性兜底）、
用 sharp 归一化成 128×128 PNG 覆盖写回本目录，并重写这份 README 的来源表。
品牌色表在 `src/constants/booknav-brand-colors.ts`（脚本与页面配置同源）。
每次跑完记得 `pnpm build` 再 `pnpm verify:ui`（`scripts/verify-ui.mjs` 的 R-BOOKNAV-05~08 就是这个目录的契约）。

## 当前文件与来源

| 文件 | 字节 | 尺寸 | 来源 URL |
|---|---:|---|---|
| `53ai.png` | 6501 | 128x128 | https://www.53ai.com/favicon.ico |
| `bigmodel.png` | 3014 | 128x128 | https://bigmodel.cn/static/images/favicon.png |
| `ccswitch.png` | 5907 | 128x128 | https://ccswitch.io/favicon.ico |
| `chaoxing.png` | 1562 | 128x128 | https://i.chaoxing.com/favicon.ico |
| `lanqiao.png` | 4336 | 128x128 | https://assets.lanqiao.cn/lanqiaobei-fe/v8.9.12/dist/favico.png |
| `micuapi.png` | 4498 | 128x128 | https://www.micuapi.ai/favicon.ico |
| `neea.png` | 12672 | 128x128 | https://www.neea.edu.cn/favicon.ico |
| `priceai.png` | 2425 | 128x128 | https://priceai.cc/icon.svg |
| `siliconflow.png` | 1969 | 128x128 | https://www.siliconflow.cn/favicon.ico |
| `tavily.png` | 4702 | 128x128 | https://www.tavily.com/favicon.ico |
| `tencent-cloud.png` | 6623 | 128x128 | https://cloud.tencent.com/favicon.ico |

## 取不到、退回字母块的条目

- `happy.bigmess.org`（bigmess）—— 兜底返回的是通用占位图，已丢弃；该卡片用**带品牌色的字母块**兜底。
