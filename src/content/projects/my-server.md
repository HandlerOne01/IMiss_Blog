---
title: "仿 muduo 实现的高并发服务器"
published: 2026-10-08
draft: false
order: 20
description: "用 C++11 从零手写的高并发 TCP 服务器：单头文件核心 1600 余行，多 Reactor + epoll + eventfd 唤醒 + timerfd 时间轮，附带 echo 与 HTTP 两个可直接运行的示例。"
image: ""
tags:
  - C++
  - 网络编程
  - Reactor
  - epoll
  - 高并发
link:
  - label: "Gitee 仓库"
    icon: "simple-icons:gitee"
    value: "https://gitee.com/a2186988646/my_server"
status: "published"
lang: ""
---

## 项目简介

这是一个**用 C++11 从零手写的高并发 TCP 服务器框架**，设计思路参考 muduo：Reactor 事件循环 + 非阻塞 IO + 多线程主从模型。核心全部集中在**一个头文件** `source/server.hpp`（1625 行）里，不依赖任何第三方库，Linux 下一条 `g++ -lpthread` 就能编。

在框架之上，我又写了两个可以直接跑的应用层示例：

| 示例 | 说明 |
| --- | --- |
| **HTTP 服务**（`source/http/`，995 行） | 支持 GET / POST / PUT / DELETE 四种方法、路由注册、静态文件服务、大文件上传 |
| **Echo 服务**（`source/echo/`，36 行） | 最小可用的回显服务，演示如何接入框架写业务 |

## 整体架构

```
                    ┌─────────────────────────────────────────┐
   新连接 ────────► │  Acceptor（只在 main Reactor 上 accept） │
                    └───────────────────┬─────────────────────┘
                                        │ 轮询分配
                    ┌───────────────────▼─────────────────────┐
                    │        LoopThreadPool（sub Reactor 池）   │
                    │   ┌──────────┐  ┌──────────┐  ┌────────┐ │
                    │   │ EventLoop│  │ EventLoop│  │  ...   │ │
                    │   │  + Poller│  │  + Poller│  │        │ │
                    │   └────┬─────┘  └────┬─────┘  └────────┘ │
                    └────────┼─────────────┼───────────────────┘
                             │  每条连接只属于一个线程
                    ┌────────▼─────────────▼───────────────────┐
                    │  Connection（读写缓冲 + 状态机 + 回调）    │
                    └──────────────────────────────────────────┘
```

一次典型的事件处理流程是这样的：

1. **事件监控**：每个线程的 `EventLoop` 阻塞在 `epoll_wait` 上等事件；
2. **事件处理**：谁就绪就回调谁的 `Channel`（可读 → 收数据进缓冲区 → 调业务回调；可写 → 把发送缓冲剩下的数据发完）；
3. **任务调度**：其他线程通过 `QueueInLoop` 投递的任务，在同一个循环里被取出执行。

## 几个关键实现

### 1. 多 Reactor：main 只负责接，sub 负责干活

`Acceptor` 挂在 main Reactor 上，只做一件事：`accept` 新连接并按**轮询**把它交给线程池里的某个 sub Reactor。连接一旦分配，之后所有的读写都在那个线程里完成 —— 所以**写业务回调不需要加锁**，天然是"单连接单线程"的。线程数可以在启动时配置，配成 0 就是纯单线程模式。

### 2. epoll 用水平触发，用 eventfd 换来"可以死等"

事件底层是 Linux 的 epoll，采用**水平触发（LT）**模式，`epoll_wait` 的超时直接给 `-1`（一直阻塞到有事件）。既然线程真的睡着了，就必须能被别的线程叫醒 —— 这里用 `eventfd` 实现：任何线程往任务队列投递任务后，顺手往 eventfd 写一下，阻塞中的 loop 立即返回并处理任务。

LT 的特点是"只要可写就一直通知"，所以写事件的监控是**按需开关**的：发送缓冲区还有数据才打开可写监控，发完立刻关掉，避免事件循环空转。

### 3. 定时器：timerfd 驱动的时间轮

超时管理没有用"遍历所有连接找超时"的笨办法，而是**时间轮**：一个 60 格的环形数组 + 一根秒针，由 `timerfd` 每秒触发一次。任务到期时不需要扫描，秒针走到哪一格就处理哪一格。

配合连接使用就变成了"**每条连接一个可刷新的定时任务**"：连接上任何事件都会给它续命（把任务挂到更靠后的刻度），一直没动静就会被时间轮踢掉。echo 示例里配的是 10 秒非活跃释放。

### 4. 连接的生命周期管理

`Connection` 继承 `enable_shared_from_this`，所有回调都传 `shared_ptr` 而不是裸指针，保证"正在回调时对象不会被销毁"。关闭连接分三步：**半关闭**（不再接收新数据）→ **延后释放**（即使用户在 loop 线程里调用，也要推到下一轮事件循环执行）→ **真正释放**（摘除 epoll 监控、关闭 fd、撤销定时器、通知用户）。

"延后释放"这一步是刻意设计的：如果业务回调里触发了超时释放，而回调自己还在栈上使用这个对象，立刻析构就会出问题。把它推到下一轮循环，就天然避开了这类竞态。

### 5. HTTP 应用层：状态机解析 + 粘包/半包处理

HTTP 解析写成了清晰的**五态状态机**：请求行 → 头部 → 空行 → 正文 → 完成。数据不够时**原地等待、状态不推进**，下次收到继续解析（解决半包）；一次收到多份请求时，在 `onMessage` 里循环解析直到缓冲区读空（解决粘包）。

应用层还实现了 URL 编解码、状态码文案、文件扩展名到 MIME 的映射、静态资源根目录限制，以及一套简单的路由注册接口。写一个 HTTP 服务只要这样：

```cpp
int main() {
    HttpServer server(8085);
    server.SetThreadCount(3);       // 3 个工作线程
    server.SetBaseDir("./wwwroot/");
    server.Get("/hello",  Hello);   // 注册路由
    server.Post("/login", Login);
    server.Listen();
}
```

## 怎么跑起来

```bash
# Echo 服务（8085 端口，2 个工作线程 + 10 秒非活跃释放）
cd source/echo && make && ./main

# HTTP 服务（8085 端口，3 个工作线程，静态根目录 ./wwwroot/）
cd source/http && make && ./main
```

`test/` 下准备了六个测试客户端，每个都针对一个具体现场，用来验证框架的真实行为：

| 客户端 | 验证什么 |
| --- | --- |
| client1 | 长连接：隔 3 秒再发（小于超时时间，连接应保持） |
| client2 | 超时释放：隔 15 秒再发（应被时间轮踢掉） |
| client3 | 半包：声明 17 字节正文却分三次发，看服务端能不能收齐 |
| client4 | 并发压测：**fork 10 个进程**同时发请求 |
| client5 | 粘包：一次发 3 条请求，看能否逐条正确解析 |
| client6 | 大文件上传：PUT 上传文件到静态目录 |

## 小结

这个项目把"服务器怎么同时处理很多连接"这件事从头到尾走了一遍：Reactor 怎么组织、IO 为什么必须非阻塞、epoll 的触发模式会带来什么差别、定时器怎么高效管理几十万个超时、以及智能指针在回调式代码里怎么用才安全。写完最大的感受是：**框架的每一行几乎都对应一个具体的坑**，比如"释放连接为什么必须延后一轮"这种设计，不看别人的实现、不自己踩一次，是很难想到的。

## 附：实现导图

下面是按「文件 → 类 → 成员/方法」逐条整理的完整实现导图（用 XMind 边写边整理，共 835 个节点）——把每个类的私有成员、公有接口和设计说明都摊在了一张图里，适合当速查表用。

整张导图很长（原始导出是 4423×23302），为了在手机上也能正常打开，这里**按原生分辨率从上到下切成 8 段**展示：每段都可以单独点开放大，文字是为实现对照准备的，放大了看很清楚。

<div style="border:1px solid rgba(128,128,128,.28); border-radius:12px; overflow:hidden; margin:1rem 0;">
  <img src="/images/projects/http-server-mindmap-01.png" alt="Http_Server 实现导图 第 1/8 段" width="4423" height="3000" loading="lazy" decoding="async" style="display:block;width:100%;height:auto;margin:0;" />
  <img src="/images/projects/http-server-mindmap-02.png" alt="Http_Server 实现导图 第 2/8 段" width="4423" height="3000" loading="lazy" decoding="async" style="display:block;width:100%;height:auto;margin:0;" />
  <img src="/images/projects/http-server-mindmap-03.png" alt="Http_Server 实现导图 第 3/8 段" width="4423" height="3000" loading="lazy" decoding="async" style="display:block;width:100%;height:auto;margin:0;" />
  <img src="/images/projects/http-server-mindmap-04.png" alt="Http_Server 实现导图 第 4/8 段" width="4423" height="3000" loading="lazy" decoding="async" style="display:block;width:100%;height:auto;margin:0;" />
  <img src="/images/projects/http-server-mindmap-05.png" alt="Http_Server 实现导图 第 5/8 段" width="4423" height="3000" loading="lazy" decoding="async" style="display:block;width:100%;height:auto;margin:0;" />
  <img src="/images/projects/http-server-mindmap-06.png" alt="Http_Server 实现导图 第 6/8 段" width="4423" height="3000" loading="lazy" decoding="async" style="display:block;width:100%;height:auto;margin:0;" />
  <img src="/images/projects/http-server-mindmap-07.png" alt="Http_Server 实现导图 第 7/8 段" width="4423" height="3000" loading="lazy" decoding="async" style="display:block;width:100%;height:auto;margin:0;" />
  <img src="/images/projects/http-server-mindmap-08.png" alt="Http_Server 实现导图 第 8/8 段" width="4423" height="2302" loading="lazy" decoding="async" style="display:block;width:100%;height:auto;margin:0;" />
</div>
