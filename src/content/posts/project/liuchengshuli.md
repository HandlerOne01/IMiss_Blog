---
title: "流程梳理"
published: 2026-09-02 15:57:19
description: "先看 EventLoop::Start()——整个框架的一切活动都发生在这个循环里"
category: "项目梳理"
tags: ["项目实战", "My_Server"]
series: "My_Server"
seriesOrder: 3
lang: "zh_CN"
draft: false
comment: true
---

# 主线：事件循环是唯一的发动机
先看 `EventLoop::Start()`——整个框架的一切活动都发生在这个循环里
```cpp
while (1)
{
    _poller.Poll(&actives);      // ① 等事件 → 得到"有哪些 fd 就绪"
    for (auto &c : actives)
        c->HandleEvent();        // ② 处理事件 → 回调代码在这里跑
    RunAllTask();                // ③ 执行任务 → 消化投递来的活
}
```

# 阶段 1：启动 —— 先造好’事件源‘和’任务接收站‘
事件循环要消费事件，所以启动阶段必须先制造事件源（监听 socket）和任务接收站（子线程池），并把它们挂进循环
```
main → HttpServer 构造 → TcpServer 构造：
  ① Acceptor::CreateServer(8085)：
     socket() → 设非阻塞 → bind → listen
     → 得到监听 fd —— 这是第一个"事件源"：客户端 connect 会让它可读
  ② _channel.SetReadCallBack(HandleRead)   ← 挂好处理函数
  ③ 但【先不】EnableRead！
     → 为什么：如果现在开监控，万一立刻有连接来，HandleRead 里 _accept_callback 还是空的
     → 连接无人认领，fd 泄漏。所以必须先注册回调、后开监控
  ④ _acceptor.SetAcceptCallBack(NewConnection)   ← 先注册
  ⑤ _acceptor.Linst() → EnableRead               ← 后开监控
     → 因果：此刻起，监听 fd 挂上了主线程的 epoll，"新连接事件"进入事件循环的监控范围
```
```
server.Listen() → TcpServer::Start()：
  ① _pool.Create()：创建 3 个 LoopThread
     → 每个子线程：创建自己的 EventLoop → notify → 进入自己的事件循环
     → 因果：线程池是"任务接收站"——主线程投递的任务，由这些循环消化
  ② _baseloop.Start()：主线程进入事件循环
     → 此刻起：主循环监控监听 fd，子循环监控 eventfd（等待任务投递）
```
**事件循环启动后，一切就绪：主循环等"新连接"，子循环等"任务"，时间轮等"每秒"——三个事件源全部就位。**

# 阶段 2：新连接 —— 主线程"接客"，投递任务给子线程

**客户端 connect → 监听 fd 可读 → 主循环 ① 返回它 → 主循环 ② 处理它。**
```
客户端 connect(127.0.0.1:8085)
  → 内核：监听 fd 可读
  → 主循环 Poll 返回 → Channel::HandleEvent → 读回调 = Acceptor::HandleRead
  → accept() 拿到 newfd（LT 模式：一次只 accept 一个，没接完下次继续触发）
  → _accept_callback(newfd) = TcpServer::NewConnection
```
**`NewConnection` 的七步**
```cpp
① _next_id++                    → 得到唯一 ID
② _pool.NextLoop()              → 选一个子线程（轮询负载均衡）
                                 → 因果：决定了任务投给谁、连接归谁管
③ new Connection(子loop, id, fd) → Connection 诞生：状态 CONNECTING
                                 → 内部：Socket 接管 fd、Channel 绑定 5 个事件回调
④ 转交 4 个业务回调 + 注册内部回调(RemoveConnection)
                                 → 因果：业务回调在此"通电"，之后事件触发才能干活
⑤ if 开启超时踢出: EnableInactiveRelease(10)
                                 → RunInLoop 投递任务A 到子线程
⑥ conn->Established()
                                 → RunInLoop 投递任务B 到子线程（排在 A 后面）
⑦ _conns.insert(id, conn)        → 连接表 +1 引用"保命"
```
**为什么任务 A 必须排在 B 前面？** 因为 A（加定时器）是 B（开读监控）的前置条件——B 执行后读事件可能立刻触发，触发时刷新活跃度必须能找到定时器。**投递顺序 → FIFO 队列 → 执行顺序**，这个保证来自阶段 0 主线第 ③ 步的 RunAllTask 按序执行。

**跨线程的唤醒机制（任务怎么"抵达"子线程）**
```
主线程 QueueInLoop：push 任务 + 向子线程的 eventfd 写 1
  → 子线程正阻塞在 epoll_wait 上 → eventfd 可读 → Poll 返回
  → HandleEvent：读 eventfd（ReadEventFd 消费信号）
  → RunAllTask：执行任务 A、B
       A: EnableInactiveReleaseInLoop
            → TimerAdd → 同线程 RunInLoop → 同步执行 → 定时器进时间轮 ✅
       B: EstablishedInLoop
            ① 状态 CONNECTING → CONNECTED
            ② EnableRead → 该连接的 fd 挂上子线程的 epoll（事件源就位！）
            ③ 业务 connected 回调：
                 Echo：打印日志
                 HTTP：SetContext(HttpContext())   ← 解析器上岗
```
**任务 B 执行完，这个连接就在子线程的事件循环里"活"了——它的读事件开始被监控，业务逻辑开始有回调可触发。**

# 阶段 3：数据收发 —— 事件与任务的交替驱动

## 3.1 接收：数据事件 → 回调

**客户端发数据 → 连接的 fd 可读（EnableRead 注册的监控起作用了）→ 子循环 Poll 返回 → HandleEvent 派发读回调。**
```
子循环 Poll 返回该连接
  → Connection::HandleRead：
      ret = NonBlockRecv(buf, 65536)
      → ret > 0：_in_buffer.WriteAndPush → 数据进输入缓冲
      → ret == 0（EAGAIN）：没数据，返回等下次
      → ret < 0（出错/对端关）：ShutdownInLoop（半关闭，见阶段 5）
      → if (_in_buffer 有数据) _message_callback(shared_from_this(), &_in_buffer)
```
**回调是在子线程的事件处理阶段（主线②）同步执行的,这里差分出两个业务**

**Echo 方向：**
```cpp
void OnMessage(conn, buf)
{
    conn->Send(全部数据);        // ① 同步走（见 3.2）
    buf->MoveReadOffset(全部);    // ② 消费缓冲
    conn->ShutDown();             // ③ 半关闭（见阶段 5）
}
```

**HTTP 方向（`OnMessage` 的 while 循环）：**
```cpp
while (buffer->ReadAbleSize() > 0)          // 粘包：一条消息可能含多个请求
{
    context->RecvHttpRequest(buffer);       // 喂给解析状态机
    // 因果：状态机推进失败分两种：
    //   半包 → 状态原地不动 → 下面 RecvStatu != OVER → return
    //          → 数据留在 _in_buffer，等下次 HandleRead 再喂（缓冲跨事件存活！）
    //   出错 → 状态码 400/414 → 错误页 + 断连
    if (context->RecvStatu() != RECV_HTTP_OVER) return;   // 半包：等下一包

    Route(req, &rsp);          // 路由：静态文件优先 → 正则路由表 → 405
    WriteResponse(conn, req, rsp);   // 拼报文 → conn->Send（走 3.2）
    context->ReSet();          // 重置解析器 → 因果：才能解析下一条（粘包循环的续）
    if (rsp.Close()) conn->ShutDown();   // 短连接 → 半关闭
}
```

## 3.2 发送：回调投递任务 → 写事件 → 真正发送
**业务回调调了 `conn->Send` → 因为回调跑在子线程、而 Send 内部是 `RunInLoop` → `IsInLoop()` 为真 → 同步执行 `SendInLoop`，不需要投递！**
```cpp
void Send(data, len)
{
    Buffer buf;  buf.WriteAndPush(data, len);   // ① 拷贝（防调用方临时数据悬垂）
    _loop->RunInLoop(SendInLoop, move(buf));    // ② 同线程 → 同步执行 ↓
}
void SendInLoop(Buffer &buf)
{
    if (_statu == DISCONNECTED) return;
    _out_buffer.WriteBufferAndPush(buf);        // 数据进输出缓冲
    if (!_channel.WriteAble())
        _channel.EnableWrite();                 // ★ 因果：注册 EPOLLOUT
}
```

**为什么发送还要等一个事件？** 因为 LT 模式下，**只有内核 socket 发送缓冲有空位**才触发 EPOLLOUT——`EnableWrite` 只是"报名"，真正发送要等下一次 Poll 回报 EPOLLOUT：
```
EnableWrite → 下一次子循环 Poll 返回 EPOLLOUT → HandleWrite：
    ret = NonBlockSend(out_buffer 的全部)
    → ret < 0：发送出错 → 处理残留输入 → Release（阶段 6）
    → ret >= 0：MoveReadOffset(ret)   // 可能只发了一半（TCP 缓冲满）
         → 还有剩余 → 等下次 EPOLLOUT 继续（因果：循环直到发完）
         → 发完了：
              DisableWrite()   // ★ 因果：不关的话 LT 会疯狂触发 EPOLLOUT，CPU 空转
              if (_statu == DISCONNECTING)   // 优雅关闭等待者
                  Release()    // ★ 因果：数据发完，可以释放了（阶段 6）
```

## 3.3 续命：每次事件都刷新活跃度

**每次事件处理的最后，`HandleEvent` 都会调 `_event_callback` → Connection::HandleEvent：**
```cpp
if (_enable_inactive_release)
    _loop->TimerRefresh(_conn_id);   // 把超时任务挪到当前刻度之后 = 续命
```
**活跃的连接不断续命 → 超时任务永远到不了期；不活跃的连接 10 秒没人续 → 任务到期 → 踢出（阶段 4）。**

## 阶段 4：超时踢出 —— 时间轮事件驱动

**因果：TimerAdd 时任务被放进时间轮的某个刻度 → timerfd 每秒触发一次 → 秒针前进 → 刻度到期 → 任务析构。**
```
timerfd（内核定时器，每秒可读一次）挂在本子循环的 epoll 上
  → 每秒 Poll 返回 → TimerWheel::OnTime
  → read(timerfd) 拿超时次数（防阻塞错漏）→ 秒针前进 times 格
  → _wheel[tick].clear()：
       该刻度所有 TimerTask 的 shared_ptr 引用归零 → 析构
       析构函数：if (!_canceled) _task_cb();    ← 任务回调在这里执行！
       回调 = Connection::Release
  → QueueInLoop 投递 ReleaseInLoop → 本阶段事件处理结束后，RunAllTask 执行（阶段 6）
```
任务进轮（TimerAdd）→ 事件续命（TimerRefresh）→ 秒针到期（析构执行）→ 连接被踢（Release）——**时间轮用 shared_ptr 的引用计数天然实现"到期自动执行"，RAII 的威力。**

# 阶段 5：优雅关闭 —— "把话说完再挂电话"

**因果：业务层调 `ShutDown` → 同线程 RunInLoop → 同步执行 `ShutdownInLoop`：**
```cpp
_statu = DISCONNECTING;                       // ① 半关闭状态
if (_in_buffer 还有数据)
    _message_callback(...);                   // ② 没处理完的输入再处理一次
if (_out_buffer 还有数据 && 没开写监控)
    _channel.EnableWrite();                   // ③ 还没发完 → 继续发
if (_out_buffer 空了)
    Release();                                // ④ 没数据 → 直接释放
```
**分支：**
- **有数据没发完** → ③ 开写监控 → 下一次 EPOLLOUT → HandleWrite 发完 → 发现 DISCONNECTING → Release（阶段 3.2 的收尾分支）→ **因果链闭合：关闭动作等数据发完才真正执行**
- **本来就没数据** → ④ 直接 Release

**异常路径同理：** `HandleRead` 收到 ret < 0 → `ShutdownInLoop`（不直接释放，先处理残留）；`EPOLLHUP`/`EPOLLERR` → `HandleClose` → 处理残留输入 → `Release`。

# 阶段 6：释放 —— 为什么必须"推迟到任务阶段"

**Release 从各处被触发（超时、断开、发完、主动关）→ 但释放操作不能当场执行！**
```cpp
void Release()
{
    _loop->QueueInLoop(ReleaseInLoop);   // ★ 无条件投递（即使本线程）
}
```
**为什么用 `QueueInLoop` 而不是 `RunInLoop`？** 因为 Release 往往发生在**事件处理阶段的中途**（比如 HandleWrite 里、时间轮的 OnTime 里）——如果当场释放：

- `RunInLoop`先判断如果是本线程就直接执行，不是才执行`QueueInLoop`放入队列尾并唤醒
- 当前事件处理栈上还有该连接的代码在跑（HandleWrite 还没返回）
- 事件循环接下来还要处理该连接的其他就绪事件
- → 用已释放的对象 → **野指针崩溃**

**所以必须推迟：等本次事件处理阶段全部结束，在 RunAllTask 里统一执行**——这正是主线 ②→③ 顺序设计的核心原因之一。

```
RunAllTask 执行 ReleaseInLoop：
  ① _statu = DISCONNECTED
  ② _channel.Remove()          → 从 epoll 移除监控（因果：不再有该连接的事件）
  ③ _socket.Close()            → 关闭 fd
  ④ 取消定时器（若还在）
  ⑤ _closed_callback(shared_from_this())   → 业务回调（此刻连接还活着，能安全告别）
     _server_closed_callback(shared_from_this())  → = RemoveConnection
        → 因果：连接断开发生在子线程，而 _conns 是主线程的数据
        → RunInLoop 投递回主线程 + 唤醒主线程 eventfd
        → 主线程 Poll 返回 → 读 eventfd → RunAllTask → RemoveConnectionInLoop
        → _conns.erase(id) → 引用计数归零 → Connection 析构 ✅
```
**最后一步的因果**：第 ⑤ 步先调业务回调、后调框架移除——顺序反了的话，`_conns.erase` 先执行导致对象析构，业务回调就访问到已销毁的对象。**"先告别、后注销"是引用计数生命周期的必然要求。**

# HTTP 一次请求的完整因果链

**场景：浏览器请求 `GET /index.html`（HTTP/1.1 长连接）**

## ① 连接建立 → 解析器上岗
```
浏览器 TCP 连接建立
  → 主线程 accept → NewConnection → 子线程 EstablishedInLoop
  → 业务 connected 回调 = HttpServer::OnConnected：
        conn->SetContext(HttpContext());
  → 因果：这个连接从此有了专属解析器（存在 Any _context 里），
          半包状态有了"存放地"——没有它，跨包解析无从谈起
  → EnableRead 已先行完成，该连接的读事件进入监控
```

## ② 请求到达 → 数据进缓冲
```
浏览器发送：
    GET /index.html HTTP/1.1\r\n
    Host: 127.0.0.1:8085\r\n
    Connection: keep-alive\r\n
    \r\n
  → 内核：fd 可读 → 子循环 Poll 返回 → HandleRead
  → recv 成功 → _in_buffer.WriteAndPush（可能只收到一部分！半包）
  → _in_buffer 有数据 → 调 HttpServer::OnMessage
```

## ③ 解析：状态机推进（半包就等，全了就冲）
```cpp
while (buffer->ReadAbleSize() > 0)          // 粘包预留：缓冲里可能有多条请求
{
    HttpContext *context = conn->Getcontext()->Get<HttpContext>();  // 取回解析器
    context->RecvHttpRequest(buffer);
```
```
穿透式 switch 开始推进：
    RECV_HTTP_LINE → GetLineAndPop 取请求行
        → 数据不足一行 → 返回，状态原地不动
        → 因果：OnMessage 里 RecvStatu() != OVER → return
                 数据留在 _in_buffer（跨 HandleRead 存活）
                 等下一包到达 → 回到 ②，再次喂解析器（半包闭环 ✅）
        → 行太长(>8192) → 状态 ERROR，状态码 414
    → 正则解析成功 → 状态 → HEAD
    RECV_HTTP_HEAD → 循环取行 → 遇到空行 → 状态 → BODY
    RECV_HTTP_BODY → ContentLength() = 0 → 直接 OVER
```
**解析出错（400/414）→ 状态码 ≥ 400 → OnMessage 的错误分支 → 错误页 + 断连（下面第 ⑦ 步的变体）；解析完整（OVER）→ 继续往下**

## ④ 路由分发：静态文件优先
```cpp
Route(req, &rsp);
```

```
IsFileHandler 检查（环环相扣的四个条件）：
    ① _basedir 已设置？      → 没设置 → 走功能路由
    ② 方法是 GET/HEAD？      → 不是 → 走功能路由
    ③ VaildPath 合法？       → /../ 穿越 → 拒绝（安全）
    ④ 拼路径存在且是普通文件？ → IsRegular 检查
        → 请求 / → 自动补 index.html（首页默认）
        → 不是文件 → 走功能路由
全部通过 → FileHandler：
    ReadFile 读文件内容 → rsp->_body
    ExtMime 查后缀 → Content-Type: text/html
    → 因果：响应体填好了，类型也对了——浏览器才能正确渲染而不是下载
（若走功能路
由：正则逐个匹配 → 命中执行 Hello/Login...；全不中 → 404）
```

## ⑤ 拼报文：`WriteResponse` 自动补全头部
```cpp
// 因果：req.Close() 决定连接头——请求说 keep-alive 就回 keep-alive
if (req.Close()) rsp.SetHeader("Connection", "close");
else             rsp.SetHeader("Connection", "keep-alive");

if (rsp._body.size() && !rsp.HasHeader("Content-length"))
    rsp.SetHeader("Content-length", std::to_string(rsp._body.size()));  // 自动补长度
// （还有默认 Content-Type、重定向 Location 的自动补全）

rsp_str << req._version << " " << 200 << " " << "OK" << "\r\n"   // 状态行
        << 各头部 << "\r\n" << rsp._body;                        // 头部+正文
conn->Send(...);
```
**`Content-Length` 必须正确——浏览器靠它知道响应到哪结束；HTTP/1.1 长连接下尤其关键（没有它浏览器无法区分"响应结束"和"连接断开"）。**

**⑥ 发送：两段式（与框架一致，此处同步执行）**
```
OnMessage 在子线程跑 → Send → RunInLoop 同线程 → 同步 SendInLoop
  → out_buffer + EnableWrite → 下次 Poll 回报 EPOLLOUT → HandleWrite 真正发出
  → 发完 → DisableWrite → 若 DISCONNECTING → Release
```

## ⑦ 长短连接分叉（HTTP 协议的因果终点)
```cpp
context->ReSet();                    // 解析器复位：状态回 LINE、请求清空
if (rsp.Close())                     // 请求头 Connection: close？
    conn->ShutDown();                //  是 → 优雅关闭（框架收尾，见下）
// 否 → 什么都不做，函数返回
```
```
分支 A（本场景）：keep-alive 长连接
    → 不关闭，OnMessage 返回
    → 因果：连接留在 epoll 里等下一个请求
            10 秒内没新请求 → 时间轮到期 → 踢出（超时兜底）
            新请求来了 → 回到 ②，用 ReSet 后的解析器重新解析（连接复用闭环 ✅）

分支 B：Connection: close 短连接
    → ShutDown → ShutdownInLoop → DISCONNECTING
    → 响应数据已在发送中/已发完 → 发完 → HandleWrite 发现 DISCONNECTING → Release
    → 框架释放流程：移除监控 → 关 fd → 业务告别 → 投回主线程 → 析构
```

## ⑧ 粘包场景（while 循环的续）：一条消息里塞 3 个请求
```
缓冲里同时有 3 条完整请求 → OnMessage 的 while 循环：
    第 1 条：解析 → 路由 → 响应 → ReSet
    第 2 条：继续（缓冲还有数据）→ 解析 → 响应 → ReSet
    第 3 条：同上
    缓冲空了 → 退出 while → 返回
    → 因果：3 个响应依次发出，每个都独立正确（test/client5 验证的就是这个）
```

## ⑨ 错误场景汇总
```
解析失败（请求行格式错）        → 400 → ErrorHandler 拼错误页 → 响应 → 断连
单行超长（>8192）              → 414 → 同上
路径非法（/../ 穿越）           → VaildPath 拦截 → 不进文件服务 → 路由未命中 → 404
资源不存在                    → IsRegular false → 路由未命中 → 404
方法不支持（PATCH 等）          → 405
静态文件读取失败               → FileHandler 直接返回（rsp 空）→ 空响应体（教学简化）
```

## ⑩ 超时兜底与最终释放
```
无论哪条分支，连接最终走向三种结局之一：
    主动关闭（close 头 / 错误断连）→ ShutDown → 发完 → Release
    对端断开 → HandleClose → Release
    10 秒无活动（keep-alive 挂机）→ 时间轮到期 → Release
统一收尾（框架层）：移除监控 → 关 fd → 取消定时器
    → 业务 closed 回调（HttpServer 未注册 → 跳过）
    → 投回主线程 → _conns.erase → 引用归零 → 析构 ✅
```

**连接建立时装解析器（OnConnected）→ 数据进缓冲（HandleRead）→ 状态机凑齐请求（半包原地等、粘包循环吃）→ 路由三级分发（静态文件优先、正则路由兜底、405 收尾）→ WriteResponse 自动补全头部拼报文 → 两段式发送 → keep-alive 就 ReSet 等下一个请求、close 就 ShutDown 优雅关闭 → 超时/断开/发完三路汇入 Release → 投回主线程析构——HTTP 协议层和框架层在"事件循环"这条主线上严丝合缝地咬合：**框架管"字节何时到、何时走"，HTTP 管"字节是什么含义"**。
