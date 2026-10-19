---
title: "Boost Search Engine"
published: 2026-10-16
draft: false
order: 40
description: "把「自研 HTTP 服务器」和「正倒排索引搜索引擎」两半合成一个能跑的服务：搜索请求由自己的 epoll + 多线程 Reactor 网络层接（不再依赖 cpp-httplib），cppjieba 分词、正排 + 倒排双索引、按相关性排序后直接吐搜索结果页。"
image: ""
tags:
  - C++
  - 搜索引擎
  - 倒排索引
  - epoll
  - Reactor
link:
  - label: "GitHub 仓库"
    icon: "simple-icons:github"
    value: "https://github.com/HandlerOne01/search_engine"
  - label: "Gitee 仓库"
    icon: "simple-icons:gitee"
    value: "https://gitee.com/a2186988646/search_server"
  - label: "在线体验"
    icon: "material-symbols:travel-explore"
    value: "http://106.52.158.48:8080/"
status: "published"
lang: ""
---

## 项目简介

这个项目是**「自研 HTTP 服务器」和「Boost 文档搜索引擎」两半的合并版** —— 之前它们是两个独立项目：搜索那一半靠第三方 HTTP 库把结果吐出去，服务器那一半只会做 echo 与静态页；现在合成一个服务：**HTTP 层换成自己写的 epoll + 多线程 Reactor 网络层**（`net/`），上面直接挂搜索接口和搜索页，一条命令起来就能搜。

语料还是 **Boost 1.82 官方文档**的离线版：递归扫描本地 HTML、去掉标签、按文档 ID 建**正排**（拿 ID 取标题/正文/原文链接）与**倒排**（拿词取命中文档与词频权重）两套索引。

## 合并后长了什么

| | 合并前 | 合并后 |
| --- | --- | --- |
| HTTP 层 | 搜索用第三方库、服务器自己写 | **两半都走自研的 epoll + 多线程 Reactor 网络层** |
| 跑起来的样子 | 两个程序、两个端口 | 一个服务，`/s?word=关键词` 直接返回 JSON，网页端渲染结果 |
| 源码位置 | 两个仓库 | 引擎部分 [search_engine](https://github.com/HandlerOne01/search_engine) / 服务器部分 [search_server](https://gitee.com/a2186988646/search_server) |

## 它怎么工作

```text
本地 HTML 文档
      │  parser：提取标题、去标签、生成 Boost 原文链接
      ▼
   data/raw_html/raw.txt（语料）
      │  服务启动时：cppjieba 搜索模式分词 → 建索引
      ├──▶ 正排索引（文档 ID → 标题 / 正文 / URL）
      └──▶ 倒排索引（关键词 → 命中文档 + 词频权重）
                │
用户输入关键词 ──▶ 分词 ──▶ 召回 ──▶ 按相关性排序 ──▶ 摘要 + JSON ──▶ 搜索页
```

排序用的是**词频 + 文档长度 + 标题匹配**三者的加权得分，命中的文档先按 ID 去重再排序；摘要截的是命中词附近那段正文。

## 当前边界

- **索引在服务启动时建在内存里** —— 没有持久化，也没有增量更新；改了语料要重启服务重建。
- **没有分页**：一页把命中的都列出来，结果区内部滚动，整页不滚。
- 运行环境是 **Linux**（用的是 epoll）。
- 只针对 Boost 文档这一份语料做过验证。

## 在线体验

<http://106.52.158.48:8080/> —— 自建服务器上的实例（裸 IP + HTTP，非标准端口）。
