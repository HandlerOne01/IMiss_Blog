import type { LicenseConfig } from "../types/licenseConfig";

export const licenseConfig: LicenseConfig = {
	// 是否启用文章顶部许可证信息显示
	// ⚠️ 2026-09-24 发起人决定**关闭**（R-ID-08）：文章末尾的许可块与侧栏「许可」一行都不再显示。
	// 「CC BY-NC-SA 4.0」是上游模板的默认值，对个人笔记站没有实际意义，发起人评审先导文章时指出
	// 「这个许可协议似乎没有啥用」。想恢复只说一句：把 enable 改回 true（name/url 已是可用的 CC 值）。
	enable: false,

	// 许可证名称及链接
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",

	// 可选：自定义许可证图标（iconify 图标名）
	// 留空时根据许可证名称自动匹配，匹配规则如下：
	//   CC BY / CC BY-SA / CC BY-NC / CC BY-NC-SA / CC BY-ND / CC BY-NC-ND 等 CC 系列
	//   → fa7-brands:creative-commons
	//   CC0 1.0
	//   → fa7-brands:creative-commons-zero
	//   Public Domain / 公共领域
	//   → fa7-brands:creative-commons-pd
	//   MIT / Apache / BSD / ISC / MPL / GPL / LGPL / AGPL / MulanPSL / Unlicense
	//   → fa7-brands:osi
	//   其余未匹配的许可证（如 All Rights Reserved、WTFPL 等）
	//   → fa7-regular:copyright
	icon: "",
};
