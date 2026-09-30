import type { GalleryConfig } from "@/types/galleryConfig";

// 相册配置
export const galleryConfig: GalleryConfig = {
	// 相册列表
	albums: [
		// 支持jpg/png/webp/avif/gif格式
		// id: 相册唯一标识符（用于目录命名和URL路径），比如设置：id: "my-album", 对应 public/gallery/my-album/目录
		// cover: 手动指定封面图（可选，不填会把cover.*文件作为封面图，如果没有cover.*文件，则使用第一张图片作为封面图）
		// name: 相册名称
		// description: 相册描述
		// location: 相册拍摄地点
		// date: 相册日期，格式为 YYYY-MM-DD，用于排序和显示
		// tags: 相册标签，用于分类和过滤
		// password: 访问密码，设置后需要输入密码才能查看相册内容（可选）
		// passwordHint: 密码提示，设置后在输入密码错误时显示（可选，需配合password使用）
		// 每添加一个数组项就相当于添加了一个相册，记得在 public/gallery/ 目录下创建对应的子目录并放入图片
		//
		// P4-8（v1.47）：上游的两个示例相册已按发起人批准删除 ——
		//   · 上游示例相册「可爱流萤」（《崩坏：星穹铁道》主题示例，配 `public/gallery/` 下的同名目录）
		//   · 「加密相册示例」（密码 123456 明文写在 desc 里，配 `public/gallery/` 下的同名目录）
		// 配置项与 public/gallery/ 下的目录**必须成对增删**：只删目录会留下一个「0 张照片」的空相册，
		// 只删配置会留下孤儿文件与孤儿路由。当前 albums 为空 → /gallery/ 渲染 I18nKey.galleryNoAlbums 空态。
	],

	// 瀑布流最小列宽(px)，浏览器根据容器宽度自动计算列数，默认 240
	// 值越小列数越多，值越大列数越少
	columnWidth: 240,
};
