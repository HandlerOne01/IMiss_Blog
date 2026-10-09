# 相册素材（本站图片）

`public/gallery/site-images/` —— 相册「本站图片」的图，**原图按字节原样入库，未转码未压缩**。

| 页面里的文件名 | 发起人给的原文件名 | 大小 | sha256 |
| --- | --- | --- | --- |
| `cover.png` | `ChatGPT 图像 2026年10月8日 01_49_29.png` | 23.7 MB | `6a7b37724e73c722…` |
| `01.png` | `ChatGPT 图像 2026年10月3日 18_02_26.png` | 2.3 MB | `0e42c5c4ce16c1a1…` |
| `02.png` | `ChatGPT 图像 2026年10月7日 17_00_06.png` | 3.0 MB | `46b3cdfa1a5b9193…` |
| `03.png` | `ChatGPT 图像 2026年10月8日 15_20_57.png` | 2.3 MB | `ea467db0daa09a94…` |
| `04.png` | `Codex 图像 2026年9月26日 14_08_38.png` | 2.1 MB | `783090133d2b4d79…` |
| `05.png` | `Codex 图像 2026年9月29日 15_47_30.png` | 2.6 MB | `95674771bf182559…` |
| `06.png` | `aemeath_wuwa_4k219_flare_1.png` | 2.4 MB | `11ac0f5437bb1878…` |
| `07.png` | `纸飞机_参考方向_透明背景.png` | 1.6 MB | `ba7cdb9dce6908f5…` |

- 画册列表由 `src/utils/gallery-utils.ts` 的 `scanAlbumPhotos()` **扫目录**得出（不逐张写进配置）；
  `cover.*` 会自动被认成封面并排在第一位。
- 文件名改成 ASCII 只是为了 URL 干净（原文件名里有空格与中文）；图**一个像素都没动**。
- 合计 39.9 MB。
