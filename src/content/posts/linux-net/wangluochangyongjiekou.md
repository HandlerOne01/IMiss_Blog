---
title: "网络常用接口"
published: 2026-04-29 11:31:06
description: "核心作用：将一个 16位 整数从 主机字节序 转换为 网络字节序（大端）。"
category: "Linux 网络"
tags: ["Linux 网络"]
lang: "zh_CN"
draft: false
comment: true
---

# IP 和端口的主机与网络之间转换
## `htons`

- **核心作用**：将一个 **16位** 整数从 **主机字节序** 转换为 **网络字节序**（大端）。

- **常用场景**：在发送网络数据包前，将本地定义的 **端口号** 转换为网络标准字节序。

- **函数原型**：
```c
    uint16_t htons(uint16_t hostshort);
```

- **返回类型**：`uint16_t`（返回转换后的网络字节序整数）。

- **参数**：`hostshort`（一个 16 位的主机字节序整数）。

- **头文件**：

    - **Linux/Unix**: `<arpa/inet.h>`

    - **Windows**: `<winsock2.h>`

- **记忆**：**h** (host) **to** **n** (network) **s** (short)

## `inet_ntop`

- **作用**：将**网络二进制数值**（Network）转换为**点分十进制字符串**（Presentation）。即把结构体中的 IP 地址转换成人类可读的字符串格式。

- **支持协议**：同时支持 IPv4 和 IPv6。

- **函数原型**：
```c
	const char *inet_ntop(int af, const void *src, char *dst, socklen_t size);
```

- **参数说明**：

    1. **`af`** (Address Family)：协议族。常用 `AF_INET` (IPv4) 或 `AF_INET6` (IPv6)。

    2. **`src`**：指向网络字节序的二进制地址结构（如 `struct in_addr`）。

    3. **`dst`**：指向存储转换后字符串的缓冲区。

    4. **`size`**：目标缓冲区 `dst` 的大小（防止溢出）。

- **返回类型**：

    - **成功**：返回指向 `dst` 的非空指针。

    - **失败**：返回 `NULL`，并设置 `errno`。

- **头文件**：`<arpa/inet.h>` (Linux/Unix)

- **记忆**：**inet** (Internet) **n** (network) **to** **p** (presentation/printable)

## `inet_pton`

- **核心作用**：将**点分十进制字符串**（Presentation）转换为**网络二进制数值**（Network）。它是 `inet_ntop` 的逆过程，常用于将字符串格式的 IP 地址填充到 `sockaddr_in` 结构体中。

- **支持协议**：同时支持 IPv4 和 IPv6。

- **函数原型**：
```c
	int inet_pton(int af, const char *src, void *dst);
```

- **参数说明**：

    1. **`af`** (Address Family)：协议族。常用 `AF_INET` (IPv4) 或 `AF_INET6` (IPv6)。

    2. **`src`**：指向待转换的 IP 地址字符串（如 `"192.168.1.1"`）。

    3. **`dst`**：指向存储转换后二进制结果的缓冲区（通常是 `struct in_addr` 或 `struct in6_addr`）。

- **返回类型**：`int`

    - **`1`**：转换成功。

    - **`0`**：输入字符串不是有效的 IP 地址格式。

    - **`-1`**：发生错误（如 `af` 参数无效），并设置 `errno`。

- **头文件**：`<arpa/inet.h>` (Linux/Unix)；Windows 下使用需包含 `<ws2tcpip.h>` 并链接 `Ws2_32.lib`。

- **记忆技巧**：**inet** (Internet) **p** (presentation/printable) **to** **n** (network)

## `struct sockaddr_in 结构体`

- **核心作用**：用于存储 **IPv4** 地址和端口号信息的系统预定义结构体。它是网络编程中处理地址最常用的结构。

- **设计逻辑**：它是对通用地址结构 `struct sockaddr` 的具体化封装，方便开发者直接设置 IP 和端口。

- **结构体定义**（通常位于 `<netinet/in.h>`）：

```c
    struct sockaddr_in {
        sa_family_t    sin_family; // 地址族 (Address Family)
        in_port_t      sin_port;   // 16位 端口号 (网络字节序)
        struct in_addr sin_addr;   // 32位 IP地址结构体
        char           sin_zero[8];// 填充位，为了与 struct sockaddr 保持大小一致
    };
    
    // 内部包含的 IP 地址结构体
    struct in_addr {
        uint32_t s_addr; // 32位 IP地址 (网络字节序)
    };
```

- **成员说明**：

    1. **`sin_family`**：恒定设置为 `AF_INET`（表示使用 IPv4）。

    2. **`sin_port`**：必须使用 `htons()` 转换后的网络字节序端口。

    3. **`sin_addr.s_addr`**：通常使用 `inet_pton()` 转换后的网络字节序 IP，或设置为 `INADDR_ANY`（监听所有网卡）。

- **常用场景**：

    - 在服务器端执行 `bind()` 绑定端口前。

    - 在客户端执行 `connect()` 连接目标服务器前。

    - 在调用 `sendto()` 或 `recvfrom()` 识别来源/目标时。

- **注意**：
	虽然我们在代码中使用 `struct sockaddr_in` 来操作数据，但在调用系统接口（如 `bind` 或 `connect`）时，通常需要将其**强制类型转换**为通用结构体指针 `(struct sockaddr*)`。

# 进程

## `pthread_getname_np`

- **核心作用**：获取指定线程的**字符串名称**。

- **名称含义**：`pthread` (POSIX thread) `getname` (获取名称) `np` (**n**on-**p**ortable，非标准扩展)。

```c
#define _GNU_SOURCE             /* 必须定义这个宏才能使用 */
#include <pthread.h>

int pthread_getname_np(pthread_t thread, char *name, size_t len);
```

- **参数说明**
	1. **`thread`**：目标线程的 ID（`pthread_t` 类型）。

	2. **`name`**：指向缓冲区的指针，用于存储获取到的线程名。

	3. **`len`**：缓冲区 `name` 的大小（单位：字节）。

- **`0`**：执行成功。

- **非 0**：失败（返回错误码）。常见错误如 `ERANGE`（缓冲区 `len` 太小，无法容纳线程名）。
- **限制
	- **16 字节限制**：Linux 内核规定线程名称（包括结尾的 `\0`）最大长度为 **16 字节**。

	- **默认值**：如果没调用 `pthread_setname_np` 手动设置，线程名默认继承自**进程的可执行文件名**。

## `pthread_self`

**核心作用**：获取当前调用线程的 **线程 ID (pthread_t)**。

**函数原型**：
```c
#include <pthread.h>
pthread_t pthread_self(void);
```

**返回类型**：`pthread_t`。在 Linux 环境下，这通常是一个**无符号长整型**（unsigned long），本质上是线程库在用户空间内分配的一个内存地址。

**参数**：无。

**常见用途**：

1. **线程分离**：调用 `pthread_detach(pthread_self())` 让线程结束后自动回收资源。

2. **标识区分**：在日志中打印该 ID，用以区分不同的并发执行流。

3. **线程比较**：作为参数传递给 `pthread_equal` 来判断两个线程变量是否指向同一个线程。

**与tid的区别**：它获取的是**用户态**的线程标识符，仅在当前进程内有效且唯一；这与内核态的 **TID**（通过 `gettid` 获取，全系统唯一）是不同的概念。

# 网络通信
## `socket()`

**核心作用**：创建一个网络通信端点（Endpoint），并返回一个文件描述符。它是网络编程的第一步，就像安装一部电话机，只有安装了电话机才能拨号或接听。

**函数原型**：
```c
#include <sys/types.h>
#include <sys/socket.h>

int socket(int domain, int type, int protocol);
```

**参数说明**：

- **`domain`（地址族）**：指定通信使用的协议族。

    - `AF_INET`：IPv4 网络协议（最常用）。

    - `AF_INET6`：IPv6 网络协议。

    - `AF_UNIX`：本地进程间通信。

- **`type`（服务类型）**：指定数据传输的方式。

    - `SOCK_STREAM`：流式套接字（对应 **TCP**），提供可靠的、面向连接的双向通信。

    - `SOCK_DGRAM`：数据报套接字（对应 **UDP**），提供不可靠的、无连接的通信。

- **`protocol`（协议）**：通常设置为 **0**，表示根据 `type` 自动选择默认协议（如 `SOCK_STREAM` 默认匹配 IPPROTO_TCP）。

**返回值**：

- **成功**：返回一个非负整数（套接字文件描述符 `sockfd`）。

- **失败**：返回 **-1**，并设置 `errno`。

**理解**：
1. **文件描述符**：在 Linux 中“一切皆文件”，套接字创建后，你可以像读写文件一样使用 `read()`/`write()` 或 `send()`/`recv()` 来通过它收发网络数据。

2. **资源回收**：套接字占用了系统资源（文件描述符表空间），使用完毕后必须调用 `close(sockfd)` 进行关闭。

3. **后续步骤**：

    - **服务器端**：接下来的典型流程是 `bind()` -> `listen()` -> `accept()`。

    - **客户端**：接下来的典型流程是 `connect()`。

## `bind()`

**作用**：将一个本地协议地址（IP 地址 + 端口号）分配给一个套接字（Socket）。对于服务器程序，这一步是必不可少的，它告诉内核：“如果有发往这个 IP 和端口的数据，请交给我处理。”

**函数原型**：
```c
#include <sys/types.h>
#include <sys/socket.h>

int bind(int sockfd, const struct sockaddr *addr, socklen_t addrlen);
```

**参数说明**：

- **`sockfd`**：由 `socket()` 函数创建的文件描述符。

- **`addr`**：指向通用地址结构体 `struct sockaddr` 的指针。通常我们会传入 `struct sockaddr_in`（针对 IPv4）并进行强制类型转换。

- **`addrlen`**：传入地址结构体的大小，通常用 `sizeof(struct sockaddr_in)`。

**返回值**：

- **`0`**：绑定成功。

- **`-1`**：绑定失败，并设置 `errno`（例如端口已被占用会返回 `EADDRINUSE`）。

**理解**：

1. **服务器端必备**：客户端通常不调用 `bind`，而是由内核随机分配端口。但服务器必须绑定固定端口，否则客户端找不到它。

2. **INADDR_ANY**：如果设置为这个宏，表示监听服务器上所有的网络接口（比如 Wi-Fi 和以太网）。

3. **权限限制**：在 Linux 中，绑定 **0 到 1023** 之间的端口通常需要 root 权限。

## `listen()`

**核心作用**：将一个套接字由主动修改为**被动**状态。它告诉内核，这个套接字应该愿意接受指向该地址的入站连接请求。如果说 `socket()` 是安装电话，那么 `listen()` 就是**打开铃声并坐在电话旁**，准备迎接呼叫。

**函数原型**：
```c
#include <sys/types.h>
#include <sys/socket.h>

int listen(int sockfd, int backlog);
```

**参数说明**：

- **sockfd**：由 `socket()` 创建，并已经由 `bind()` 绑定了地址的套接字文件描述符。

- **backlog**：指定内核为该套接字排队的**最大连接个数**。它定义了“未完成连接队列”和“已完成连接队列”的总和上限。如果队列满了，新的客户端连接请求会收到错误。

**返回值**：

- **成功**：返回 0。

- **失败**：返回 -1，并设置 errno。

**温馨提示**：

`listen()` 仅适用于 **SOCK_STREAM**（TCP）协议。对于 UDP 这种“无连接”的协议，是不需要调用 `listen()` 的，因为 UDP 根本没有建立连接的过程，直接 `recvfrom()` 就能接听数据。

## `connect()`

**核心作用**：由客户端发起，请求与远程服务器建立连接。如果说服务器端是在“等电话”，那么 `connect()` 就是**主动拨号**的过程。在 TCP 协议中，这个调用会触发底层的“三次握手”流程。

**函数原型**：
```c
#include <sys/types.h>
#include <sys/socket.h>

int connect(int sockfd, const struct sockaddr *addr, socklen_t addrlen);
```

**参数说明**：

- **sockfd**：客户端通过 `socket()` 创建的文件描述符。

- **addr**：指向服务器地址结构（包含目标 IP 和端口）的指针。

- **addrlen**：服务器地址结构体的长度，通常为 `sizeof(struct sockaddr_in)`。

**返回值**：

- **成功**：返回 0。

- **失败**：返回 -1，并设置 `errno`（例如 `ETIMEDOUT` 表示连接超时，`ECONNREFUSED` 表示目标端口未开启）。

**温馨提示**：

对于 **UDP**（无连接）套接字，虽然也可以调用 `connect()`，但它并不会产生握手动作。它的作用是“绑定”对端地址，使得后续可以使用 `send()` 和 `recv()` 代替 `sendto()` 和 `recvfrom()`，并且内核会过滤掉非指定地址发来的数据包。此外，TCP 客户端通常不需要调用 `bind()`，因为 `connect()` 会让内核自动选择一个临时的可用端口。

## `accept()`

**核心作用**：从已完成连接队列中提取下一个连接请求。它会创建一个**新的套接字**来与客户端通信，而原有的监听套接字继续等待其他连接。就像客服接线员听到了铃声，按下接听键，并开辟一个专属频道与当前客户交谈。

**函数原型**：
```c
#include <sys/types.h>
#include <sys/socket.h>

int accept(int sockfd, struct sockaddr *addr, socklen_t *addrlen);
```

**参数说明**：

- **sockfd**：监听套接字文件描述符（由 `listen()` 设置后的那个描述符）。

- **addr**：指向 `struct sockaddr` 的指针，用于**存储客户端的地址信息**（如 IP 和端口）。如果不关心客户端是谁，可以传 `NULL`。

- **addrlen**：指向变量的指针，输入时指定缓冲区大小，返回时内核会填入实际写入地址结构的长度。

**返回值**：

- **成功**：返回一个新的套接字文件描述符（非负整数），专门用于与该客户端通信。

- **失败**：返回 -1，并设置 `errno`。

**温馨提示**：

`accept()` 返回的是一个全新的文件描述符，而最初的 `sockfd`（监听套接字）依然保持打开状态，继续监听新的连接请求。通常在多进程或多线程服务器中，我们会把 `accept()` 返回的新描述符交给子进程/线程去处理具体业务。

### connect() 与 accept() 的关系

**核心作用**：它们是 TCP 连接握手过程中的“两端”。`connect()` 是**主动发起方**（客户端）的行为，而 `accept()` 是**被动接收方**（服务器）的行为。它们共同完成了从“孤立的套接字”到“建立通信链路”的跨越。

**协作流程**：

1. **准备阶段**：服务器调用 `listen()` 进入监听状态。

2. **发起阶段**：客户端调用 `connect()`，向服务器发送同步信号（SYN）。

3. **握手阶段**：

    - 内核在底层完成 TCP 三次握手。

    - 握手成功的连接会进入服务器内核的**已完成连接队列**。

4. **建立阶段**：服务器进程调用 `accept()`，从队列中取出一个已就绪的连接，并返回一个新的套接字。

**参数关联**：

- **地址匹配**：客户端 `connect()` 填写的 `addr` 必须是服务器 `bind()` 绑定的地址。

- **信息获取**：服务器 `accept()` 的 `addr` 参数会被内核填充，从而告知服务器“是谁连过来了”（即客户端的 IP 和端口）。

**返回值对比**：

|**特性**|**connect()**|**accept()**|
|---|---|---|
|**调用方**|客户端|服务器|
|**阻塞点**|等待三次握手完成|等待连接队列中有新连接|
|**套接字变化**|使用原有的 `sockfd` 进行通信|**返回一个新的 `sockfd`** 用于通信，原监听套接字继续等待|

**温馨提示**：

本质上，`connect()` 的成功返回意味着三次握手已经完成；而 `accept()` 的返回则意味着服务器应用程序正式“接管”了这个已经建立好的连接。如果客户端拨通了电话（connect 成功），但服务器没人接听（没调用 accept），这个连接会一直静静地待在内核的队列里。

## `recv()`

**核心作用**：从已连接的套接字中接收数据。它主要用于 TCP 通信，从内核的接收缓冲区中将数据拷贝到应用层定义的缓冲区里。就像是**从快递柜（缓冲区）里取走你的包裹**。

**函数原型**：
```c
#include <sys/types.h>
#include <sys/socket.h>

ssize_t recv(int sockfd, void *buf, size_t len, int flags);
```

**参数说明**：

- **sockfd**：已建立连接的套接字文件描述符（对于服务器来说，通常是 `accept()` 返回的那个新描述符）。

- **buf**：指向存储接收数据的本地缓冲区的指针。

- **len**：缓冲区的大小（单位为字节），即你一次最多想接收多少数据。

- **flags**：收号控制标志。通常设置为 **0**。常用的还有 `MSG_PEEK`（查看数据但不从缓冲区取走）或 `MSG_WAITALL`（等待直到满足 len 字节的数据才返回）。

**返回值**：

- **大于 0**：实际接收到的字节数。

- **等于 0**：表示对端已经**关闭了连接**（这是判断 TCP 断开连接的重要标志）。

- **小于 0 (-1)**：发生错误，并设置 `errno`（如 `EAGAIN` 表示非阻塞模式下暂无数据）。

**温馨提示**：

`recv()` 默认是**阻塞**的。如果没有数据到达，程序会停在这一行死等。另外，由于 TCP 是流式协议，你调用一次 `send()` 发出的数据，对方可能需要多次 `recv()` 才能收全，或者一次 `recv()` 收到了对方多次发送的数据（俗称粘包/拆包）。
## `recvfrom()`

**核心作用**：从套接字接收数据，并捕获发送方的源地址信息。它主要用于 **UDP**（无连接）协议，因为 UDP 不像 TCP 那样维持连接，每次收到数据包都必须知道是谁发的，以便回信。

**函数原型**：
```c
#include <sys/types.h>
#include <sys/socket.h>

ssize_t recvfrom(int sockfd, void *buf, size_t len, int flags,
                 struct sockaddr *src_addr, socklen_t *addrlen);
```

**参数说明**：

- **`sockfd`**：套接字文件描述符。

- **`buf`**：接收数据的缓冲区。

- **`len`**：缓冲区的大小。

- **`flags`**：调用标志，通常设为 **0**（阻塞模式）。

- **`src_addr`**（关键）：指向 `struct sockaddr` 的指针。函数执行后，内核会将**发送方的 IP 和端口**填入这里。如果不需要知道是谁发的，可以传 `NULL`。

- **`addrlen`**：输入输出参数。调用前设为 `src_addr` 的长度，调用后内核会更新为实际存入地址的长度。

**返回值**：

- **成功**：返回实际接收到的**字节数**。

- **连接关闭**：返回 `0`。

- **失败**：返回 `-1`，并设置 `errno`。

**与 recv() 的区别**：

- **`recv()`**：通常用于 TCP。因为 TCP 是面向连接的，套接字已经知道对方是谁，所以不需要额外的地址参数。

- **`recvfrom()`**：多了一个地址“采集”功能。虽然它也能用于 TCP，但通常没必要。在 UDP 中，它是核心函数，配合 `sendto()` 实现数据的往返。

**总结：**
	`recvfrom()` 就像是收快递，不仅拿到了包裹内容（数据），还顺便看了一眼快递单上的回邮地址（`src_addr`）。

## `send()`

**核心作用**：向已连接的套接字发送数据。它将应用层缓冲区中的数据拷贝到内核的发送缓冲区中，由内核负责通过网络发送出去。这就像是**把写好的信件塞进邮筒（缓冲区）**，至于邮局什么时候发走、怎么发，由系统底层处理。

**函数原型**：
```c
#include <sys/types.h>
#include <sys/socket.h>

ssize_t send(int sockfd, const void *buf, size_t len, int flags);
```

**参数说明**：

- **sockfd**：已建立连接的套接字文件描述符。

- **buf**：指向包含待发送数据的缓冲区的指针。

- **len**：要发送的数据字节数。

- **flags**：发送控制标志。通常设置为 **0**。常用标志如 `MSG_NOSIGNAL`（防止在对端关闭时产生 `SIGPIPE` 信号导致程序崩溃）。

**返回值**：

- **大于等于 0**：实际发送（成功拷贝到内核缓冲区）的字节数。

- **小于 0 (-1)**：发生错误，并设置 `errno`。

**温馨提示**：

`send()` 返回成功并不代表对方已经收到了数据，只代表数据已经成功进入了本地系统的发送队列。此外，如果发送缓冲区已满，`send()` 默认会**阻塞**直到有空间可用。在处理 TCP 时，如果返回值小于 `len`，你需要循环调用 `send()` 来确保所有数据都已发出。

## `sendto()`

**作用**：向指定的目的地址发送数据。它是 **UDP** 协议（无连接通信）中最核心的发送函数。由于 UDP 协议不维护连接，每次发送数据都必须明确指出“要把这包数据发给谁”。

**函数原型**：
```c
#include <sys/types.h>
#include <sys/socket.h>

ssize_t sendto(int sockfd, const void *buf, size_t len, int flags,
               const struct sockaddr *dest_addr, socklen_t addrlen);
```

**参数说明**：

- **`sockfd`**：套接字文件描述符。

- **`buf`**：指向要发送数据的缓冲区。

- **`len`**：要发送的数据长度（字节）。

- **`flags`**：调用标志，通常设为 **0**。

- **`dest_addr`**（关键）：指向 `struct sockaddr` 的指针，里面包含了**接收方的 IP 和端口**。

- **`addrlen`**：地址结构体的长度，即 `sizeof(struct sockaddr_in)`。

**返回值**：

- **成功**：返回实际发送的**字节数**。

- **失败**：返回 **-1**，并设置 `errno`。

**与 send() 的区别**：

- **`send()`**：用于已连接的套接字（通常是 TCP）。因为连接已经建立了，内核知道对方是谁，所以不需要目标地址参数。

- **`sendto()`**：用于无连接的套接字（UDP）。每次发信都要在参数里手动填上“收件人地址”。

**总结**：
如果说 `send()` 是在已经接通的电话里说话，那么 `sendto()` 就像是**寄明信片**，每一张你都得在背面亲手写上收件人的地址和邮编。

# 标准库函数
## `std::bind`

这是定义在 C++ `<functional>` 头文件中的函数模板，它是一个“函数适配器”，用来生成新的调用对象。

**函数原型（简化版）：**
```cpp
#include <functional>

template< class F, class... Args >
/* 这里的返回值类型非常复杂，通常用 auto 或 std::function 接收 */
bind( F&& f, Args&&... args );
```

- **F (`f`)**：你要“包装”的可调用对象。可以是普通函数、成员函数指针、Lambda 表达式等。

- **Args (`args`)**：你要预先绑定（固定）的参数列表。

- **返回值**：返回一个仿函数对象（`bind-expression`）。当你调用这个返回的对象时，它会自动去调用 `f`，并将预存的 `args` 传进去。
