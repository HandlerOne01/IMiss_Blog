---
title: "My_server框架全流程梳理"
published: 2026-09-23 21:24:32
description: "先看 EventLoop::Start()——整个框架的一切活动都发生在这个循环里，而它的三步是互锁的因果链："
category: "项目实战"
tags: ["项目实战", "My_Server"]
series: "My_Server"
seriesOrder: 4
lang: "zh_CN"
draft: false
comment: true
---

## 主线：事件循环是唯一的发动机

先看 `EventLoop::Start()`——整个框架的一切活动都发生在这个循环里，而它的**三步是互锁的因果链**：

```cpp
while (1)
{
    _poller.Poll(&actives);      // ① 等事件 → 得到"有哪些 fd 就绪"
    for (auto &c : actives)
        c->HandleEvent();        // ② 处理事件 → 回调代码在这里跑
    RunAllTask();                // ③ 执行任务 → 消化投递来的活
}
```

**三者互为因果：**
- ① 的产出（就绪 Channel 列表）是 ② 的输入
- ② 处理事件时，回调代码**会产生任务**（跨线程投递的、本线程内投递的）→ 任务进队列
- ③ 执行任务时，任务代码**可能修改事件监控**（`EnableRead`/`DisableWrite`/`EnableWrite`）→ 直接影响下一次 ① 能看到什么
- 然后回到 ①，循环往复

**所以整个框架的故事就是：谁在什么时机往这个循环里"塞事件"和"塞任务"，循环就驱动谁干活。** 下面所有阶段，都是往这条主线上挂因果。

---

## 阶段 1：启动 —— 先造好"事件源"和"任务接收站"

**因果：事件循环要消费事件，所以启动阶段必须先制造事件源（监听 socket）和任务接收站（子线程池），并把它们挂进循环。**

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

---

## 阶段 2：新连接 —— 主线程"接客"，投递任务给子线程

**因果：客户端 connect → 监听 fd 可读 → 主循环 ① 返回它 → 主循环 ② 处理它。**

```
客户端 connect(127.0.0.1:8085)
  → 内核：监听 fd 可读
  → 主循环 Poll 返回 → Channel::HandleEvent → 读回调 = Acceptor::HandleRead
  → accept() 拿到 newfd（LT 模式：一次只 accept 一个，没接完下次继续触发）
  → _accept_callback(newfd) = TcpServer::NewConnection
```

**`NewConnection` 的七步，每一步都是下一步的原因：**

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

**因果链：为什么任务 A 必须排在 B 前面？** 因为 A（加定时器）是 B（开读监控）的前置条件——B 执行后读事件可能立刻触发，触发时刷新活跃度必须能找到定时器。**投递顺序 → FIFO 队列 → 执行顺序**，这个保证来自阶段 0 主线第 ③ 步的 RunAllTask 按序执行。

**跨线程的唤醒机制（任务怎么"抵达"子线程）：**

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

**因果：任务 B 执行完，这个连接就在子线程的事件循环里"活"了——它的读事件开始被监控，业务逻辑开始有回调可触发。**

---

## 阶段 3：数据收发 —— 事件与任务的交替驱动

### 3.1 接收：数据事件 → 回调

**因果：客户端发数据 → 连接的 fd 可读（EnableRead 注册的监控起作用了）→ 子循环 Poll 返回 → HandleEvent 派发读回调。**

```
子循环 Poll 返回该连接
  → Connection::HandleRead：
      ret = NonBlockRecv(buf, 65536)
      → ret > 0：_in_buffer.WriteAndPush → 数据进输入缓冲
      → ret == 0（EAGAIN）：没数据，返回等下次
      → ret < 0（出错/对端关）：ShutdownInLoop（半关闭，见阶段 5）
      → if (_in_buffer 有数据) _message_callback(shared_from_this(), &_in_buffer)
```

**注意：回调是在子线程的事件处理阶段（主线②）同步执行的。** 因果链从这里分叉出两个业务方向：

**Echo 方向：**

```cpp
void OnMessage(conn, buf)
{
    conn->Send(全部数据);        // ① 同步走（见 3.2）
    buf->MoveReadOffset(全部);    // ② 消费缓冲
    conn->ShutDown();             // ③ 半关闭（见阶段 5）
}
```

**HTTP 方向（`OnMessage` 的 while 循环）：**

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

### 3.2 发送：回调投递任务 → 写事件 → 真正发送

**因果：业务回调调了 `conn->Send` → 因为回调跑在子线程、而 Send 内部是 `RunInLoop` → `IsInLoop()` 为真 → 同步执行 `SendInLoop`，不需要投递！**

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

**为什么发送还要等一个事件？** 因为 LT 模式下，**只有内核 socket 发送缓冲有空位**才触发 EPOLLOUT——`EnableWrite` 只是"报名"，真正发送要等下一次 Poll 回报 EPOLLOUT：

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

### 3.3 续命：每次事件都刷新活跃度

**因果：每次事件处理的最后，`HandleEvent` 都会调 `_event_callback` → Connection::HandleEvent：**

```cpp
if (_enable_inactive_release)
    _loop->TimerRefresh(_conn_id);   // 把超时任务挪到当前刻度之后 = 续命
```

**因果：活跃的连接不断续命 → 超时任务永远到不了期；不活跃的连接 10 秒没人续 → 任务到期 → 踢出（阶段 4）。**

---

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

**因果闭环**：任务进轮（TimerAdd）→ 事件续命（TimerRefresh）→ 秒针到期（析构执行）→ 连接被踢（Release）——**时间轮用 shared_ptr 的引用计数天然实现"到期自动执行"，RAII 的威力。**

---

## 阶段 5：优雅关闭 —— "把话说完再挂电话"

**因果：业务层调 `ShutDown` → 同线程 RunInLoop → 同步执行 `ShutdownInLoop`：**

```cpp
_statu = DISCONNECTING;                       // ① 半关闭状态
if (_in_buffer 还有数据)
    _message_callback(...);                   // ② 没处理完的输入再处理一次
if (_out_buffer 还有数据 && 没开写监控)
    _channel.EnableWrite();                   // ③ 还没发完 → 继续发
if (_out_buffer 空了)
    Release();                                // ④ 没数据 → 直接释放
```

**因果分支：**
- **有数据没发完** → ③ 开写监控 → 下一次 EPOLLOUT → HandleWrite 发完 → 发现 DISCONNECTING → Release（阶段 3.2 的收尾分支）→ **因果链闭合：关闭动作等数据发完才真正执行**
- **本来就没数据** → ④ 直接 Release

**异常路径同理：** `HandleRead` 收到 ret < 0 → `ShutdownInLoop`（不直接释放，先处理残留）；`EPOLLHUP`/`EPOLLERR` → `HandleClose` → 处理残留输入 → `Release`。

---

## 阶段 6：释放 —— 为什么必须"推迟到任务阶段"

**因果：Release 从各处被触发（超时、断开、发完、主动关）→ 但释放操作不能当场执行！**

```cpp
void Release()
{
    _loop->QueueInLoop(ReleaseInLoop);   // ★ 无条件投递（即使本线程）
}
```

**为什么用 `QueueInLoop` 而不是 `RunInLoop`？** 因为 Release 往往发生在**事件处理阶段的中途**（比如 HandleWrite 里、时间轮的 OnTime 里）——如果当场释放：
- 当前事件处理栈上还有该连接的代码在跑（HandleWrite 还没返回）
- 事件循环接下来还要处理该连接的其他就绪事件
- → 用已释放的对象 → **野指针崩溃**

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

**最后一步的因果**：第 ⑤ 步先调业务回调、后调框架移除——顺序反了的话，`_conns.erase` 先执行导致对象析构，业务回调就访问到已销毁的对象。**"先告别、后注销"是引用计数生命周期的必然要求。**

---

## 收尾：一条完整的因果链示范（Echo 一次请求的全程）

把前面所有链条串起来，看一次 Echo 请求的完整因果：

```
① 客户端发 "hello" → 内核：fd 可读
② 子循环 Poll 返回 → HandleRead → in_buffer = "hello"
③ → EchoServer::OnMessage（同步）：
     Send("hello") → RunInLoop（同线程）→ 同步 SendInLoop → out_buffer + EnableWrite
     ShutDown() → RunInLoop（同线程）→ 同步 ShutdownInLoop → DISCONNECTING
       → out_buffer 有数据 → 不释放，等 EPOLLOUT
④ 子循环下一次 Poll → EPOLLOUT → HandleWrite → 发出 "hello" → 发完
   → DisableWrite → 发现 DISCONNECTING → Release() → QueueInLoop
⑤ 本次事件处理结束 → RunAllTask → ReleaseInLoop：
     移除监控 → 关 fd → 取消定时器 → 业务 closed 回调（打印日志）
     → RemoveConnection → 投递回主线程
⑥ 主线程被唤醒 → RunAllTask → _conns.erase → 引用归零 → 析构
⑦ 回到 ①，等待下一个连接……
```

**每一环都是上一环的果、下一环的因——这就是框架的全部逻辑。**

## 铁律（一切因果背后的规则）

> 1. **事件循环三步互锁**：Poll 产出事件 → HandleEvent 处理（产生任务）→ RunAllTask 消化任务（改监控）→ 回 Poll
> 2. **跨线程一律投递**：任务 + eventfd 唤醒，绝不直接碰别人的数据
> 3. **释放必须推迟**：QueueInLoop 到事件处理结束后，防止用已释放对象
> 4. **先加定时器、后开读监控**：靠 FIFO 投递顺序保证
> 5. **先业务告别、后框架注销**：靠引用计数保证生命周期安全

这次从"事件源就位 → 事件触发 → 回调产生任务 → 任务改变监控/释放连接 → 影响下一次事件"的因果角度重新串了一遍——**上下文是连起来的：每一节都明确写着"上一节的什么操作，导致了这一节的什么发生"**。
