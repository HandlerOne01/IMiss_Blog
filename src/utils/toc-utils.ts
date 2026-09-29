/**
 * TOC (Table of Contents) 工具类
 * 用于 SidebarTOC 和 FloatingTOC 的共享逻辑
 */

import I18nKey from "@/i18n/i18nKey";
import { i18n } from "@/i18n/translation";
import {
	computeTocItems,
	renderTocItemHTML,
	type TocInput,
} from "@/utils/toc-shared";
import { isArticleDetailPage } from "@/utils/url-utils";

export interface TOCConfig {
	contentId: string;
	indicatorId: string;
	maxLevel?: number;
	/**
	 * @deprecated B-16 起不再生效（保留字段只为不动三处调用点）。
	 * 原先用于 JS 手动滚动时的导航栏补偿量；现在锚点走浏览器原生导航，
	 * 补偿量由 CSS 负责（`src/styles/markdown.css` 给 `.custom-md [id]` 的
	 * `scroll-margin-top: 5.5rem`），JS 侧再减一次反而会偏。
	 */
	scrollOffset?: number;
}

export class TOCManager {
	private tocItems: HTMLElement[] = [];
	private observer: IntersectionObserver | null = null;
	private maxLevel: number;
	private scrollTimeout: number | null = null;
	private contentId: string;
	private indicatorId: string;

	constructor(config: TOCConfig) {
		this.contentId = config.contentId;
		this.indicatorId = config.indicatorId;
		this.maxLevel = config.maxLevel || 3;
	}

	/**
	 * 查找文章内容容器
	 */
	private getContentContainer(): Element | null {
		return (
			document.querySelector(".custom-md") ||
			document.querySelector(".prose") ||
			document.querySelector(".markdown-content")
		);
	}

	/**
	 * 查找所有标题
	 */
	private getAllHeadings(): HTMLElement[] {
		const contentContainer = this.getContentContainer();
		if (!contentContainer) {
			return [];
		}
		return Array.from(
			contentContainer.querySelectorAll("h1, h2, h3, h4, h5, h6"),
		);
	}

	/**
	 * 获取标题的纯文本内容（排除 script/style 标签的文本）
	 */
	private getCleanTextContent(element: HTMLElement): string {
		const clone = element.cloneNode(true) as HTMLElement;
		for (const el of clone.querySelectorAll("script, style")) {
			el.remove();
		}
		return clone.textContent || "";
	}

	/**
	 * 空状态文案
	 */
	private getEmptyStateHTML(): string {
		return `<div class="text-center py-8 text-gray-500 dark:text-gray-400"><p>${i18n(I18nKey.tocEmpty)}</p></div>`;
	}

	/**
	 * 将 DOM 标题转换为与服务端一致的 TocInput
	 */
	private domHeadingsToInputs(headings: HTMLElement[]): TocInput[] {
		return headings.map((heading) => {
			const depth = Number.parseInt(heading.tagName.charAt(1), 10);
			let text = this.getCleanTextContent(heading)
				.replace(/#+\s*$/, "")
				.trim();

			// 空文本回退（例如动态副标题）
			if (!text) {
				const dataSubtitles = heading.getAttribute("data-subtitles");
				if (dataSubtitles) {
					try {
						const subtitles = JSON.parse(dataSubtitles);
						text = Array.isArray(subtitles) ? subtitles[0] : subtitles;
					} catch {
						// ignore
					}
				}
			}

			return { depth, slug: heading.id, text };
		});
	}

	/**
	 * 生成TOC HTML（客户端 fallback 路径，与服务端 SSR 输出保持一致）
	 */
	public generateTOCHTML(): string {
		const headings = this.getAllHeadings();

		if (headings.length === 0) {
			return this.getEmptyStateHTML();
		}

		const items = computeTocItems(this.domHeadingsToInputs(headings), {
			maxLevel: this.maxLevel,
		});

		if (items.length === 0) {
			return this.getEmptyStateHTML();
		}

		let tocHTML = "";
		for (const item of items) {
			tocHTML += renderTocItemHTML(item);
		}

		tocHTML += `<div id="${this.indicatorId}" style="opacity: 0;" class="toc-active-indicator"></div>`;

		return tocHTML;
	}

	/**
	 * 更新TOC内容（重建，DOM 遍历路径）
	 */
	public updateTOCContent(): void {
		const tocContent = document.getElementById(this.contentId);
		if (!tocContent) return;

		tocContent.innerHTML = this.generateTOCHTML();
		this.tocItems = Array.from(
			document.querySelectorAll(`#${this.contentId} a`),
		);
	}

	/**
	 * 获取可见的标题ID
	 */
	private getVisibleHeadingIds(): string[] {
		const headings = this.getAllHeadings();
		const visibleHeadingIds: string[] = [];

		headings.forEach((heading) => {
			if (heading.id) {
				const rect = heading.getBoundingClientRect();
				const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

				if (isVisible) {
					visibleHeadingIds.push(heading.id);
				}
			}
		});

		// 如果没有可见标题，选择最接近屏幕顶部的标题
		if (visibleHeadingIds.length === 0 && headings.length > 0) {
			let closestHeading: string | null = null;
			let minDistance = Number.POSITIVE_INFINITY;

			headings.forEach((heading) => {
				if (heading.id) {
					const rect = heading.getBoundingClientRect();
					const distance = Math.abs(rect.top);

					if (distance < minDistance) {
						minDistance = distance;
						closestHeading = heading.id;
					}
				}
			});

			if (closestHeading) {
				visibleHeadingIds.push(closestHeading);
			}
		}

		return visibleHeadingIds;
	}

	/**
	 * 更新活动状态
	 */
	public updateActiveState(): void {
		if (!this.tocItems || this.tocItems.length === 0) return;

		// 移除所有活动状态
		this.tocItems.forEach((item) => {
			item.classList.remove("visible");
		});

		const visibleHeadingIds = this.getVisibleHeadingIds();

		// 找到对应的TOC项并添加活动状态
		const activeItems = this.tocItems.filter((item) => {
			const headingId = item.dataset.headingId;
			return headingId && visibleHeadingIds.includes(headingId);
		});

		// 添加活动状态
		activeItems.forEach((item) => {
			item.classList.add("visible");
		});

		// 更新活动指示器
		this.updateActiveIndicator(activeItems);
	}

	/**
	 * 更新活动指示器
	 */
	private updateActiveIndicator(activeItems: HTMLElement[]): void {
		const indicator = document.getElementById(this.indicatorId);
		if (!indicator || !this.tocItems.length) return;

		if (activeItems.length === 0) {
			indicator.style.opacity = "0";
			return;
		}

		const tocContent = document.getElementById(this.contentId);
		if (!tocContent) return;

		const contentRect = tocContent.getBoundingClientRect();
		const firstActive = activeItems[0];
		const lastActive = activeItems[activeItems.length - 1];

		const firstRect = firstActive.getBoundingClientRect();
		const lastRect = lastActive.getBoundingClientRect();

		const top = firstRect.top - contentRect.top;
		const height = lastRect.bottom - firstRect.top;

		indicator.style.top = `${top}px`;
		indicator.style.height = `${height}px`;
		indicator.style.opacity = "1";

		// 自动滚动到活动项
		if (firstActive) {
			this.scrollToActiveItem(firstActive);
		}
	}

	/**
	 * 滚动到活动项
	 */
	private scrollToActiveItem(activeItem: HTMLElement): void {
		if (!activeItem) return;

		const tocContainer = document
			.querySelector(`#${this.contentId}`)
			?.closest(".toc-scroll-container");
		if (!tocContainer) return;

		// 清除之前的定时器
		if (this.scrollTimeout) {
			clearTimeout(this.scrollTimeout);
		}

		// 使用节流机制
		this.scrollTimeout = window.setTimeout(() => {
			const containerRect = tocContainer.getBoundingClientRect();
			const itemRect = activeItem.getBoundingClientRect();

			// 只在元素不在可视区域时才滚动
			const isVisible =
				itemRect.top >= containerRect.top &&
				itemRect.bottom <= containerRect.bottom;

			if (!isVisible) {
				const itemOffsetTop = (activeItem as HTMLElement).offsetTop;
				const containerHeight = tocContainer.clientHeight;
				const itemHeight = activeItem.clientHeight;

				// 计算目标滚动位置，将元素居中显示
				const targetScroll =
					itemOffsetTop - containerHeight / 2 + itemHeight / 2;

				tocContainer.scrollTo({
					top: targetScroll,
					behavior: "smooth",
				});
			}
		}, 100);
	}

	/**
	 * 设置IntersectionObserver
	 */
	public setupObserver(): void {
		const headings = this.getAllHeadings();

		if (this.observer) {
			this.observer.disconnect();
		}

		this.observer = new IntersectionObserver(
			() => {
				this.updateActiveState();
			},
			{
				rootMargin: "0px 0px 0px 0px",
				threshold: 0,
			},
		);

		headings.forEach((heading) => {
			if (heading.id) {
				this.observer?.observe(heading);
			}
		});
	}

	/**
	 * ⚠️ **B-16：这里原先绑的点击处理器已删除 —— 目录里的页内锚点必须由浏览器原生处理。**
	 * 旧处理器是 `preventDefault()` + 手动 `window.scrollTo({behavior:"smooth"})`，
	 * 它一次做坏两件事：① URL 里**连 hash 都不写**（看到的 hash 是 Swup 拦下点击后用
	 * `replaceState` 补写的）；② 更不产生历史记录 —— 点完目录按一次「后退」直接离开本页。
	 *
	 * 交给浏览器后一次做齐四件事：写 `location.hash`、**写历史记录**（后退才回得来）、
	 * 按 `scroll-margin-top` 定位（`src/styles/markdown.css` 给 `.custom-md [id]` 定的 5.5rem，
	 * 与原来写死的 `scrollOffset: 80` 基本一致）、按 `history.scrollRestoration` 还原位置。
	 * `html` 上的 `scroll-behavior: smooth` 仍在，所以平滑滚动没有丢。
	 *
	 * 实测证据（reports/_b16-probe2.log）：给 TOC 条目补 `data-no-swup`（≡ 修复后的 `ignore`）
	 * 后，旧处理器下 `location.hash` 仍为空、`history.length` 不变（§Q1）；删掉它之后
	 * hash + 新历史条目 + 退回到原位、且 Swup 一次 visit 都没跑（§Q2）。
	 *
	 * 保留这个方法（空实现）只是为了让 `attach()` / `render()` 的调用点保持原样 ——
	 * 将来若要在这里加逻辑，**不许**取消默认行为。
	 */
	public bindClickEvents(): void {
		// 故意留空：点击交给浏览器原生处理（见上面 B-16 说明）。
	}

	/**
	 * 清理
	 */
	public cleanup(): void {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		if (this.scrollTimeout) {
			clearTimeout(this.scrollTimeout);
			this.scrollTimeout = null;
		}
	}

	/**
	 * 重建目录（DOM 遍历生成列表）+ 绑定交互。
	 * 用于 fallback：加密文章解密后、空 SSR、或站内导航后侧栏 DOM 变旧时。
	 */
	public render(): void {
		this.updateTOCContent();
		this.bindClickEvents();
		this.setupObserver();
		this.updateActiveState();
	}

	/**
	 * 判断现有锚点是否与当前正文的目录完全一致（避免站内导航后侧栏 DOM 未被
	 * swup 替换、仍显示上一篇目录的情况）。用与 SSR 相同的算法从当前正文算出
	 * 期望 id 序列并逐一比对——不同文章即使共用个别标题名也不会误判。
	 */
	private anchorsMatchCurrentContent(anchors: HTMLElement[]): boolean {
		const expected = computeTocItems(
			this.domHeadingsToInputs(this.getAllHeadings()),
			{ maxLevel: this.maxLevel },
		);
		if (expected.length !== anchors.length) return false;
		return expected.every(
			(item, i) => anchors[i].dataset.headingId === item.headingId,
		);
	}

	/**
	 * 附着到已有的服务端渲染锚点上（不重新生成列表），只绑定滚动高亮/点击。
	 * 若没有 SSR 锚点、或锚点属于上一篇文章（侧栏未被 swup 替换），回退到 render()。
	 */
	public attach(): void {
		const tocContent = document.getElementById(this.contentId);
		if (!tocContent) return;

		const anchors = Array.from(tocContent.querySelectorAll<HTMLElement>("a"));

		// 没有锚点（加密未解密/空）或锚点是上一篇的 → 重建
		if (anchors.length === 0 || !this.anchorsMatchCurrentContent(anchors)) {
			this.render();
			return;
		}

		this.tocItems = anchors;
		this.bindClickEvents();
		this.setupObserver();
		this.updateActiveState();
	}

	/**
	 * 初始化（向后兼容别名，等价于 render()）
	 */
	public init(): void {
		this.render();
	}
}

/**
 * 检查是否为文章/项目详情页
 */
export function isPostPage(): boolean {
	return isArticleDetailPage(window.location.pathname);
}
