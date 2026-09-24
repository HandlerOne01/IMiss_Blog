---
title: "TCP序列化与反序列化网络计算器"
published: 2026-05-17 18:20:53
description: "首先编写通用的工具类，这些类不依赖于网络逻辑，但会被后续所有模块使用。"
category: "Linux 网络"
tags: ["Linux 网络"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. 基础设施与底层封装
首先编写通用的工具类，这些类不依赖于网络逻辑，但会被后续所有模块使用。
## 1.1 Log.hpp (日志模块)
• 作用：提供统一的日志输出格式（DEBUG, INFO, ERROR 等），方便后续调试。
```cpp
#pragma once

#include "Mutex.hpp"
#include <ctime>
#include <filesystem> // c++17 文件系统库
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <unistd.h>

namespace LogModule {
    using namespace MutexModule;

    // --- 默认配置 ---
    const std::string defaultpath = "./log/"; // 默认日志文件存放目录
    const std::string defaultname = "log.txt";

    // --- 日志等级定义 ---
    enum class LogLevel {
        DEBUG,   // 调试信息
        INFO,    // 常规信息
        WARNING, // 警告信息
        ERROR,   // 错误信息
        FATAL    // 致命错误
    };

    // 将日志等级枚举转换为可读字符串
    std::string LogLevelToString(LogLevel level) {
        switch (level) {
            case LogLevel::DEBUG:   return "DEBUG";
            case LogLevel::INFO:    return "INFO";
            case LogLevel::WARNING: return "WARNING";
            case LogLevel::ERROR:   return "ERROR";
            case LogLevel::FATAL:   return "FATAL";
            default:                return "UNKNOWN";
        }
    }

    // 获取当前时间的格式化字符串，如“2026-04-08 15:30:45”
    // 使用 localtime_r 保证线程安全
    std::string GetCurrTime() {
        time_t tm = time(nullptr);
        struct tm curr; // tm 为 <time.h> 定义的一个结构体类型
        localtime_r(&tm, &curr);

        char timebuffer[64];
        snprintf(timebuffer, sizeof(timebuffer), "%4d-%02d-%02d %02d:%02d:%02d", 
                 curr.tm_year + 1900, curr.tm_mon + 1, curr.tm_mday,
                 curr.tm_hour, curr.tm_min, curr.tm_sec);
        return timebuffer;
    }

    // --- 策略模式：抽象基类 ---
    // 定义日志输出策略的统一接口
    class LogStrategy {
    public:
        virtual void SyncLog(const std::string &message) = 0;
        virtual ~LogStrategy() = default;
    };

    // --- 控制台输出策略 ---
    // 将日志输出到标准错误流（stderr）
    class ConsoleLogStrategy : public LogStrategy {
    public:
        void SyncLog(const std::string &message) override {
            LockGuard lockguard(_mutex);
            std::cerr << message << std::endl;
        }
        ~ConsoleLogStrategy() {}

    private:
        Mutex _mutex; // 保护 cerr 共享资源
    };

    // --- 文件输出策略 ---
    // 将日志追加到指定路径的文件中
    class FileLogStrategy : public LogStrategy {
    public:
        FileLogStrategy(const std::string logpath = defaultpath, std::string logfilename = defaultname)
            : _logpath(logpath), _logfilename(logfilename) {
```

## 1.2 InetAddr.hpp (地址类封装)
• 作用：封装 struct sockaddr_in，将 IP 和端口号转化成更方便操作的对象。
```cpp
#pragma once

#include "Common.hpp"

// 网络地址和主机地址之间进行转换的类
class InetAddr
{
public:
    InetAddr() {}

    InetAddr(struct sockaddr_in &addr)
    {
        SetAddr(addr);
    }

    InetAddr(const std::string &ip, uint16_t port) 
        : _ip(ip), _port(port)
    {
        // 主机转网络
        memset(&_addr, 0, sizeof(_addr));
        _addr.sin_family = AF_INET;
        inet_pton(AF_INET, _ip.c_str(), &_addr.sin_addr);
        _addr.sin_port = htons(_port);
        // local.sin_addr.s_addr = inet_addr(_ip.c_str()); // TODO
    }

    InetAddr(uint16_t port) 
        : _port(port), _ip()
    {
        // 主机转网络
        memset(&_addr, 0, sizeof(_addr));
        _addr.sin_family = AF_INET;
        _addr.sin_addr.s_addr = INADDR_ANY;
        _addr.sin_port = htons(_port);
    }

    void SetAddr(struct sockaddr_in &addr)
    {
        _addr = addr;
        // 网络转主机
        _port = ntohs(_addr.sin_port); // 从网络中拿到的！网络序列
        // _ip = inet_ntoa(_addr.sin_addr); // 4字节网络风格的IP -> 点分十进制的字符串风格的IP
        
        char ipbuffer[64];
        inet_ntop(AF_INET, &_addr.sin_addr, ipbuffer, sizeof(_addr));
        _ip = ipbuffer;
    }

    uint16_t Port() { return _port; }

    std::string Ip() { return _ip; }

    const struct sockaddr_in &NetAddr() { return _addr; }

    const struct sockaddr *NetAddrPtr()
    {
        return CONV(_addr);
    }

    socklen_t NetAddrLen()
    {
        return sizeof(_addr);
    }

    bool operator==(const InetAddr &addr)
    {
        return addr._ip == _ip && addr._port == _port;
    }

    std::string StringAddr()
    {
        return _ip + ":" + std::to_string(_port);
    }

    ~InetAddr()
    {
    }

private:
    struct sockaddr_in _addr;
    std::string _ip;
    uint16_t _port;
};
```

## 1.3 Socket.hpp (套接字封装)
• 作用：利用模版方法模式或虚函数，封装 socket, bind, listen, accept, connect 等系统调用。
• 核心：实现一个 TcpSocket类，隐藏繁琐的底层参数设置。
```cpp
#pragma once

#include "Common.hpp"
#include "InetAddr.hpp"
#include "Log.hpp"
#include <arpa/inet.h>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <netinet/in.h>
#include <string>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>

namespace SocketModule {
    using namespace LogModule;
    
    const static int gbacklog = 16;  // 全局默认监听队列长度
    const static int defaultfd = -1; // 默认无效文件描述符

    // --- 抽象基类：定义 Socket 操作的接口和模板流程 ---
    class Socket {
    public:
        virtual ~Socket() {};

        // 纯虚函数：留给子类（Tcp/Udp）去实现具体的系统调用
        virtual void SocketOrDie() = 0;                                       // 创建套接字
        virtual void BindOrDie(uint16_t port) = 0;                            // 绑定端口
        virtual void ListenOrDie(int backlog) = 0;                            // 进入监听状态
        virtual std::shared_ptr<Socket> Accept(InetAddr *client) = 0;         // 接收新连接
        virtual void Close() = 0;                                             // 关闭文件描述符
        virtual int Recv(std::string *out) = 0;                               // 读取数据
        virtual int Send(const std::string &message) = 0;                     // 发送数据
        virtual int Connect(const std::string &server_ip, uint16_t port) = 0; // 连接

    public:
        // 模板方法：构建 TCP 服务器的固定步骤
        // 1.创建 2.绑定 3.监听
        void BuildTcpSocketMethod(uint16_t port, int backlog = gbacklog) {
            SocketOrDie();
            BindOrDie(port);
            ListenOrDie(backlog);
        }

        // 构建 TCP 客户端固定步骤
        void BuildTcpClientSocketMethod() {
            SocketOrDie(); // 客户端只需创建套接字，绑定由 OS 自动完成
        }
    };

    // --- 派生类：基于 TCP 协议的具体实现 ---
    class TcpSocket : public Socket {
    public:
        // 默认构造
        TcpSocket() : _sockfd(defaultfd) {
        }

        // 带参构造
        TcpSocket(int fd) : _sockfd(fd) {
        }

        ~TcpSocket() {
        }

        // 创建流式套接字（AF_INET + SOCK_STREAM, 0）
        void SocketOrDie() override {
            _sockfd = ::socket(AF_INET, SOCK_STREAM, 0);
            if (_sockfd < 0) {
                LOG(LogLevel::FATAL) << "socket error";
                exit(SOCKET_ERR);
            }
            LOG(LogLevel::INFO) << "socket success,fd: " << _sockfd;
        }

        // 绑定本地地址和端口
        void BindOrDie(uint16_t port) override {
            InetAddr localaddr(port); // 使用 InetAddr 辅助类处理 sockaddr_in
            int n = ::bind(_sockfd, localaddr.NetAddrPtr(), localaddr.NetAddrLen());
            if (n < 0) {
                LOG(LogLevel::FATAL) << "bind error";
                exit(BIND_ERR);
            }
            LOG(LogLevel::INFO) << "bind success";
        }

        // 开始监听连接请求
        void ListenOrDie(int backlog) override {
            int n = ::listen(_sockfd, backlog);
            if (n < 0) {
                LOG(LogLevel::FATAL) << "listen error";
                exit(LISTEN_ERR);
            }
            LOG(LogLevel::INFO) << "listen success";
        }

        // 阻塞获取新连接，并将其封装成新的 TcpSocket 对象返回
        std::shared_ptr<Socket> Accept(InetAddr *client) override {
            struct sockaddr_in peer;
            socklen_t len = sizeof(peer);
            int fd = ::accept(_sockfd, (struct sockaddr *)&peer, &len);
            if (fd < 0) {
                LOG(LogLevel::WARNING) << "accept warning ...";
                return nullptr;
            }
            client->SetAddr(peer); // 填入客户端的 IP 和端口信息
            
            // 返回共享指针，自动管理生命周期，防止文件描述符泄露
            return std::make_shared<TcpSocket>(fd);
        }

        // 接收数据（字节流读取）
        int Recv(std::string *out) override {
            char buffer[1024];
            ssize_t n = ::recv(_sockfd, buffer, sizeof(buffer) - 1, 0);
            if (n > 0) {
                buffer[n] = 0;
                *out += buffer;
            }
            return n;
        }

        // 发送数据
        int Send(const std::string &message) override {
            return ::send(_sockfd, message.c_str(), message.size(), 0);
        }

        void Close() override {
            if (_sockfd >= 0) {
                ::close(_sockfd);
                _sockfd = defaultfd;
            }
        }

        // 客户端连接服务器
        int Connect(const std::string &server_ip, uint16_t port) override {
            InetAddr server(server_ip, port);
            return ::connect(_sockfd, server.NetAddrPtr(), server.NetAddrLen());
        }

    private:
        int _sockfd; // 底层文件描述符
    };
} // namespace SocketModule
```
### 抽象基类 `Socket`

这类定义了所有套接字必须具备的公共接口。

- **`SocketOrDie()`**: 纯虚函数。用于创建套接字。如果创建失败，程序会记录错误并直接退出（"Or Die" 的含义）。

- **`BindOrDie(uint16_t port)`**: 纯虚函数。将套接字绑定到指定的本地端口。

- **`ListenOrDie(int backlog)`**: 纯虚函数。将套接字设置为监听状态，准备接收连接请求。

- **`Accept(InetAddr *client)`**: 纯虚函数。等待并接受客户端连接。返回一个新的 `Socket` 对象（通常是 `TcpSocket`）用于后续通信。

- **`Recv(std::string *out)`**: 纯虚函数。接收对端发送的数据。

- **`Send(const std::string &message)`**: 纯虚函数。向对端发送数据。

- **`Connect(const std::string &server_ip, uint16_t port)`**: 纯虚函数。客户端逻辑，用于连接远程服务器。

- **`Close()`**: 纯虚函数。关闭文件描述符，释放资源。

---
### 模板方法
- **`BuildTcpSocketMethod(...)`**: 核心模板方法。它通过固定顺序调用 `SocketOrDie -> BindOrDie -> ListenOrDie`，封装了服务端启动的标准化流程。

- **`BuildTcpClientSocketMethod()`**: 封装了客户端启动的基本流程（仅创建套接字）。

---

### 具体实现类 `TcpSocket`

这是针对 TCP 协议的具体实现。

- **构造函数 `TcpSocket(int fd)`**: 允许通过现有的文件描述符创建对象。这通常用于 `Accept` 成功后，为新建立的连接创建专门的通信对象。

- **`SocketOrDie()`**: 调用系统调用 `::socket(AF_INET, SOCK_STREAM, 0)` 创建一个 TCP 流式套接字。

- **`BindOrDie(uint16_t port)`**:

    1. 实例化 `InetAddr` 对象（处理主机转网络序列）。

    2. 调用 `::bind` 绑定地址，失败则报 `FATAL` 错误。

- **`ListenOrDie(int backlog)`**: 调用 `::listen`。`backlog` 参数决定了全连接队列的最大长度（即允许多少个请求在未被 `accept` 的情况下排队）。

- **`Accept(InetAddr *client)`**:

    1. 调用系统调用 `::accept`。

    2. 如果成功，将客户端的 IP 和端口信息填充到 `client` 对象中。

    3. 返回一个包装了新文件描述符的 `TcpSocket` 智能指针，实现多态。

- **`Recv(std::string *out)`**:

    1. 使用 `char buffer[1024]` 作为缓冲区。

    2. 调用 `::recv` 读取数据。

    3. 将读取到的字符拼接到输出字符串 `out` 中。

- **`Send(const std::string &message)`**: 调用 `::send` 将字符串内容发送出去。

- **`Close()`**: 检查 `_sockfd` 是否合法，若合法则调用 `::close` 关闭连接。

- **`Connect(...)`**:

    1. 根据传入的 IP 和端口构建 `InetAddr`。

    2. 调用 `::connect` 发起 TCP 三次握手连接。

# 2. 应用层协议设计
这是网络程序最关键的部分，决定了客户端和服务器如何“对话”。
## 2.1 Protocol.hpp
```cpp
#pragma once

#include "Socket.hpp"
#include <iostream>
#include <string>
#include <memory>
#include <jsoncpp/json/json.h>
#include <functional>

// 实现一个自定义的网络版本的计算器
using namespace SocketModule;

// =========================================================
// 1. 数据模型与序列化层
// =========================================================

// 客户端 -> 服务端的请求载体
class Request {
public:
    Request() {}
    Request(int x, int y, char oper) : _x(x), _y(y), _oper(oper) {}

    // 序列化：将对象数据转为 JSON 字符串
    std::string Serialize() {
        Json::Value root;
        root["x"] = _x;
        root["y"] = _y;
        root["oper"] = _oper; // 字符会被按 ASCII 码整数存储

        Json::FastWriter writer;
        return writer.write(root);
    }

    // 反序列化：将 JSON 字符串转回对象数据
    bool Deserialize(const std::string &in) {
        Json::Value root;
        Json::Reader reader;
        bool ok = reader.parse(in, root);
        if (ok) {
            _x = root["x"].asInt();
            _y = root["y"].asInt();
            _oper = (char)root["oper"].asInt();
        }
        return ok;
    }

    ~Request() {}
    int X() { return _x; }
    int Y() { return _y; }
    char Oper() { return _oper; }

private:
    int _x;
    int _y;
    char _oper;
};

// 服务端 -> 客户端的响应载体
class Response {
public:
    Response() {}
    Response(int result, int code) : _result(result), _code(code) {}

    // 序列化
    std::string Serialize() {
        Json::Value root;
        root["result"] = _result;
        root["code"] = _code;

        Json::FastWriter writer;
        return writer.write(root);
    }

    // 反序列化
    bool Deserialize(const std::string &in) {
        Json::Value root;
        Json::Reader reader;
        bool ok = reader.parse(in, root);
        if (ok) {
            _result = root["result"].asInt();
            _code = root["code"].asInt();
        }
        return ok;
    }

    ~Response() {}
    void SetResult(int res) { _result = res; }
    void SetCode(int code) { _code = code; }
    void ShowResult() {
        std::cout << "计算结果是: " << _result << " [状态码: " << _code << "]" << std::endl;
    }

private:
    int _result; // 运算结果
    int _code;   // 状态码：0表示成功，非0表示异常（如除0错误）
};

// =========================================================
// 2. 协议控制层（解决 TCP 粘包问题）
// =========================================================

const std::string sep = "\r\n"; // 报头与报体之间的分隔符

// 业务逻辑回调类型声明：输入 Request, 返回 Response
using func_t = std::function<Response(Request &req)>;

class Protocol {
public:
    Protocol() {}
    Protocol(func_t func) : _func(func) {}

    // 【添加报头】封装应用层协议：长度 + \r\n + JSON 串 + \r\n
    std::string Encode(const std::string &jsonstr) {
        std::string len = std::to_string(jsonstr.size());
        return len + sep + jsonstr + sep;
    }

    // 【解析报文】从接收缓冲区中安全提取一个完整的 JSON 字符串
    // 解决 TCP 面向字节流带来的“半包”和“粘包”问题
    bool Decode(std::string &buffer, std::string *package) {
        // 1. 找第一个分隔符，如果找不到，说明长度报头没收全
        size_t pos = buffer.find(sep);
        if (pos == std::string::npos)
            return false;

        // 2. 提取长度字段
        std::string package_len_str = buffer.substr(0, pos);
        int package_len_int = std::stoi(package_len_str);

        // 3. 计算一个完整报文需要的总长度：长度字符数 + 分隔符1 + JSON正文 + 分隔符2
        int target_len = package_len_str.size() + package_len_int + 2 * sep.size();

        // 4. 如果缓冲区数据不够，说明出现了“半包”，等待下次接收
        if (buffer.size() < (size_t)target_len)
            return false;

        // 5. 提取 JSON 正文部分
        *package = buffer.substr(pos + sep.size(), package_len_int);

        // 6. 从缓冲区中抹掉已处理的报文
        buffer.erase(0, target_len);
        return true;
    }

    // 服务端读取流程：读取流 -> 提取包 -> 反序列化 -> 业务计算 -> 序列化 -> 封包 -> 发送
    void GetRequest(std::shared_ptr<Socket> &sock, InetAddr &client) {
        std::string buffer_queue; // 用户态接收缓冲区
        while (true) {
            int n = sock->Recv(&buffer_queue); // 追加式读取
            if (n > 0) {
                std::string json_package;
                // 使用 while 处理粘包：一次 Recv 可能包含多个请求
                while (Decode(buffer_queue, &json_package)) {
                    LOG(LogLevel::DEBUG) << client.StringAddr() << " 请求：" << json_package;

                    // 1. 反序列化
                    Request req;
                    if (!req.Deserialize(json_package))
                        continue;

                    // 2. 执行业务回调，得到结果
                    Response resp = _func(req);

                    // 3. 结果序列化并封装报文
                    std::string send_str = Encode(resp.Serialize());

                    // 4. 发送给客户端
                    sock->Send(send_str);
                }
            } else if (n == 0) {
                LOG(LogLevel::INFO) << "client: " << client.StringAddr() << " Quit!";
                break;
            } else {
                LOG(LogLevel::WARNING) << "client: " << client.StringAddr() << ", recv error";
                break;
            }
        }
    }

    // 客户端读取流程：读取流 -> 提取包 -> 反序列化得到 Response
    bool GetResponse(std::shared_ptr<Socket> &client, std::string &resp_buff, Response *resp) {
        while (true) {
            int n = client->Recv(&resp_buff);
            if (n > 0) {
                std::string json_package;
                if (Decode(resp_buff, &json_package)) {
                    resp->Deserialize(json_package);
                    return true;
                }
                // 如果 Decode 返回 false，说明数据还没收全，继续循环 Recv
            } else {
                return false;
            }
        }
    }

    // 客户端发包辅助函数
    std::string BuildRequestString(int x, int y, char oper) {
        Request req(x, y, oper);
        return Encode(req.Serialize());
    }

    ~Protocol() {}

private:
    func_t _func;
};
```

这份代码实现了一个完整的**应用层协议栈**，它处于 OSI 模型中的**应用层**和**表示层**，解决了如何在不稳定的 TCP 字节流上可靠地传输“结构化数据”的问题。

整个模块可以分为三个核心维度：
### 数据表示层

通过 `Request` 和 `Response` 两个类，将内存中的 C++ 对象（如整数、字符）转换为跨网络的通用格式（JSON）。

- **Request (请求)**：封装了操作数 `x`, `y` 和运算符 `oper`。

- **Response (响应)**：封装了计算结果 `result` 和状态码 `code`。状态码至关重要，它能区分“计算成功”与“除 0 错误”等业务异常。

- **Jsoncpp 的应用**：使用 JSON 而不是二进制结构体，是为了更好的兼容性和可读性。即便客户端是用 Python 或 Java 写的，也能通过相同的 JSON 字段与这个 C++ 服务端通信。

---

### 协议控制层

TCP 协议是**面向字节流**的，它不保证发送方的一个 `send` 对应接收方的一个 `recv`。数据可能在传输过程中被拆分（半包）或合并（粘包）。

代码采用**“长度前缀 + 分隔符”** 的方案来划定报文边界：

- **封装格式**：`"Content-Length" + "\r\n" + "{JSON-Data}" + "\r\n"`。

- **Encode (封包)**：在发送前给数据戴上“帽子”（长度）和“尾巴”（分隔符）。

- **Decode (解包)**：

    1. 先找第一个 `\r\n`，确定报文长度。

    2. 检查缓冲区剩余长度是否满足这个包的大小。

    3. 只有数据完全到齐，才会将包从缓冲区中提取出来处理。

    4. **erase 操作**：处理完一个包后立即将其从缓冲区抹除，这是处理“持续字节流”的标准做法。

---

### 业务逻辑层

`Protocol` 类并没有把计算逻辑（加减乘除）写死在里面，而是通过 `std::function<Response(Request &req)>` 接受一个**回调函数**。

- **GetRequest (服务端主循环)**：

    - 它负责从 Socket 读数据到缓冲区。

    - 调用 `Decode` 不断尝试拆包。

    - **业务解耦**：解析出 `Request` 后，直接丢给 `_func` 回调。它不关心你是做加法还是做复杂的科学运算。

    - 拿到结果后再经过序列化和封包发回客户端。

---

### 5步
1. **IO 读取**：从内核读取字节流。

2. **协议解包**：将字节流转化为一个个完整的报文（解决粘包）。

3. **反序列化**：将报文转化为业务对象。

4. **业务处理**：执行逻辑计算。

5. **逆向封装**：序列化 -> 封包 -> IO 发送
