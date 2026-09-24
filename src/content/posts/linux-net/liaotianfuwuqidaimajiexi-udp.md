---
title: "聊天服务器代码解析（UDP）"
published: 2026-04-28 20:52:30
description: "防止后续设计的服务器或线程池对象被意外拷贝"
category: "Linux 网络"
tags: ["Linux 网络"]
lang: "zh_CN"
draft: false
comment: true
---

# 基础构建
## nocopy.hpp
**防止后续设计的服务器或线程池对象被意外拷贝**

```cpp
//禁用拷贝基类
#pragma once
#include<iostream>

class nocopy
{
public:
    nocopy(){}
    //禁用拷贝构造
    nocopy(const nocopy &) = delete;
    //禁用赋值运算符
    const nocopy& operator = (const nocopy &) = delete;
    ~nocopy(){}
};
```

## Log.hpp - 未解释知识点或可开单章节，先跳过
**日志**

```cpp
#pragma once
#include "Mutex.hpp"
#include <ctime>
#include <filesystem> //c++17文件系统库
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <unistd.h>

namespace LogModule {
    using namespace MutexModule;

    // 默认配置
    const std::string defaultpath = "./log/"; // 默认日志文件存放目录
    const std::string defaultname = "log.txt";

    // 日志等级定义
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
        case LogLevel::DEBUG:
            return "DEBUG";
        case LogLevel::INFO:
            return "INFO";
        case LogLevel::WARNING:
            return "WARNING";
        case LogLevel::ERROR:
            return "ERROR";
        case LogLevel::FATAL:
            return "FATAL";
        default:
            return "UNKNOWN";
        }
    }

    // 获取当前时间的格式化字符串，如“2026-04-08 15:30:45”
    // 使用localttime_r 保证线程安全
    std::string GetCurrTime() {
        time_t tm = time(nullptr);
        struct tm curr; // tm 为<time.h>定义的一个结构体类型，用于表示时间的各个组成部分。
        localtime_r(&tm, &curr);

        char timebuffer[64];
        snprintf(timebuffer, sizeof(timebuffer), "%4d-%02d-%02d %02d:%02d:%02d", 
                 curr.tm_year + 1900, curr.tm_mon + 1, curr.tm_mday,
                 curr.tm_hour, curr.tm_min, curr.tm_sec);
        return timebuffer;
    }

    // 策略模式：抽象基类
    // 定义日志输出策略的统一接口
    class LogStrategy {
    public:
        // 同步一条日志信息
        virtual void SyncLog(const std::string &message) = 0;
        virtual ~LogStrategy() = default;
    };

    // 控制台输出策略
    // 将日志输出到标准错误流（stderr）
    class ConsoleLogStrategy : public LogStrategy {
    public:
        void SyncLog(const std::string &message) override {
            LockGuard lockguard(_mutex);
            std::cerr << message << std::endl;
        }
        ~ConsoleLogStrategy() {}

    private:
        Mutex _mutex; // 保护cerr共享资源
    };

    // 文件输出策略
    // 将日志追加到指定路径的文件中
    class FileLogStrategy : public LogStrategy {
    public:
        // 构造
        FileLogStrategy(const std::string logpath = defaultpath, std::string logfilename = defaultname)
            : _logpath(logpath), _logfilename(logfilename) {
            LockGuard lockguard(_mutex);
            // 如果路径存在则不创建
            if (std::filesystem::exists(_logpath))
                return;
            // 捕获异常
            try {
                // 递归创建目录（例如 ./log/ 如果父目录不存在也会创建）
                std::filesystem::create_directories(_logpath);
            } catch (const std::filesystem::filesystem_error &e) {
                std::cerr << e.what() << "\n";
            }
        }

        void SyncLog(const std::string &message) override {
            LockGuard lockguard(_mutex);
            std::string fullpath = _logpath + _logfilename;
            // 以追加模式打开文件
            std::ofstream out(fullpath.c_str(), std::ios::app);
            if (!out.is_open())
                return;
            out << message << "\n";
            out.close();
        }
        ~FileLogStrategy() {}

        // 公开成员变量（允许外部调整路径）
        std::string _logpath;
        std::string _logfilename;
        Mutex _mutex;
    };

    // 日志器主类
    // 负责管理日志策略，并通过内部RAII类LogMassage完成日志的格式化与自动刷新
    class Logger {
    public:
        Logger() {
            // 默认使用控制台输出策略
            UseConsoleStrategy();
        }
        ~Logger() {}

        // 切换控制台策略
        void UseConsoleStrategy() {
            _strategy = std::make_unique<ConsoleLogStrategy>();
        }

        // 切换文件策略（使用默认路径/文件名）
        void UseFileStrategy() {
            _strategy = std::make_unique<FileLogStrategy>();
        }

        // 内部RAII类：代表一条完整的日志消息
        class LogMessage {
        private:
            LogLevel _type;         // 日志等级
            std::string _curr_time; // 日志产生的时间
            pid_t _pid;             // 进程id
            std::string _filename;  // 源代码文件
            int _line;              // 源代码行号
            Logger &_logger;        // 引入外部Logger，便于调用策略刷新
            std::string _loginfo;   // 最终拼接完整日志内容

        public:
            // 构造函数：构建日志头部（时间，等级，进程，id,文件名，行号）
            LogMessage(LogLevel type, const std::string &filename, int line, Logger &logger)
                : _type(type), _curr_time(GetCurrTime()), _pid(getpid()), _filename(filename), _line(line), _logger(logger) {
                std::stringstream ssbuffer;
                ssbuffer << "[" << _curr_time << "]"
                         << "[" << LogLevelToString(type) << "]"
                         << "[" << _pid << "]"
                         << "[" << _filename << "]"
                         << "[" << _line << "]"
                         << " - ";
                _loginfo = ssbuffer.str();
            }

            // 重载 << 操作符，支持流式追加任意类型的数据（模板实现）
            // 例如：LOG(INFO) << "value = " << 42;
            template <typename T> 
            LogMessage &operator<<(const T &info) {
                std::stringstream ssbuffer;
                ssbuffer << info;
                _loginfo += ssbuffer.str();
                return *this; // 返回自身，支持连续<<
            }

            // 析构函数：当 LogMessage 临时对象生命周期结束时，
            // 自动调用策略的 SyncLog 将完整的日志持久化（输出到控制台或文件）
            ~LogMessage() {
                if (_logger._strategy) {
                    _logger._strategy->SyncLog(_loginfo);
                }
            }
        };

        // 仿函数：创建一个临时的 LogMessage 对象
        // 参数：日志等级、文件名、行号
        // 该对象会被 LOG 宏使用，宏会自动传入 __FILE__ 和 __LINE__
        LogMessage operator()(LogLevel type, std::string filename, int line) {
            return LogMessage(type, filename, line, *this);
        }

    private:
        std::unique_ptr<LogStrategy> _strategy; // 当前的日志输出策略
    };

    // 全局唯一的日志器实例（方便直接使用，无需手动创建对象）
    Logger logger;

// 宏定义
// 生成一条日志消息，自动注入文件名和行号
// 使用示例：LOG(LogLevel::INFO) << "Hello";
#define LOG(type) logger(type, __FILE__, __LINE__)

// 切换日志策略的宏
#define ENABLE_CONSOLE_LOG_STRATEGY() logger.UseConsoleStrategy()
#define ENABLE_FILE_LOG_STRATEGY() logger.UseFileStrategy()

} // namespace LogModule
```

## Mutex.hpp
**封装Mutex**
```cpp
#pragma once
#include <iostream>
#include <pthread.h>

namespace MutexModule {

    class Mutex {
    public:
        Mutex() {
            pthread_mutex_init(&_mutex, nullptr);
        }

        void Lock() {
            pthread_mutex_lock(&_mutex);
        }

        void Unlock() {
            pthread_mutex_unlock(&_mutex);
        }

        ~Mutex() {
            pthread_mutex_destroy(&_mutex);
        }

        pthread_mutex_t *Get() {
            return &_mutex;
        }

    private:
        pthread_mutex_t _mutex;
    };

    class LockGuard {
    public:
        // 在构造时自动加锁
        LockGuard(Mutex &mutex) : _mutex(mutex) {
            _mutex.Lock();
        }

        // 在析构时自动释放锁，防止死锁
        ~LockGuard() {
            _mutex.Unlock();
        }

    private:
        Mutex &_mutex;
    };

} // namespace MutexModule
```

## Cond.hpp
**封装Cond**
```cpp
#include "Mutex.hpp"
#include <iostream>
#include <pthread.h>

using namespace MutexModule;

namespace CondModule {

    class Cond {
    public:
        Cond() {
            pthread_cond_init(&_cond, nullptr);
        }

        // 这里的 Wait 需要传入一个封装好的 Mutex 对象
        void Wait(Mutex &mutex) {
            pthread_cond_wait(&_cond, mutex.Get());
        }

        // 唤醒条件变量下等待的一个线程
        void Signal() {
            pthread_cond_signal(&_cond);
        }

        // 唤醒所有在条件变量下等待的线程
        void Broadcast() {
            pthread_cond_broadcast(&_cond);
        }

        ~Cond() {
            pthread_cond_destroy(&_cond);
        }

    private:
        pthread_cond_t _cond;
    };

} // namespace CondModule
```

## Thread.hpp
**封装Thread.hpp**
```cpp
#ifndef _THREAD_H_
#define _THREAD_H_

#include "Log.hpp"
#include <atomic>    // C++11 引入的原子类型，提供线程安全的操作
#include <cstdio>
#include <cstring>
#include <functional>
#include <iostream>
#include <pthread.h>
#include <string>

namespace ThreadModule {
    using namespace LogModule;

    // 使用 std::atomic 确保在多线程环境下递增线程编号是安全的
    static std::atomic<uint32_t> number(1);

    class Thread {
        // 定义函数包装器类型：允许传入符合 void() 签名的可调用对象
        using func_t = std::function<void()>;

    private:
        // 设置分离状态
        void EnableDetach() {
            _isdetach = true;
        }

        // 设置运行状态
        void EnableRunning() {
            _isrunning = true;
        }

        // 线程执行的函数入口
        // pthread_create 要求的回调函数必须是静态的（没有隐含的 this 指针）
        static void *Routine(void *args) {
            // 通过传入的 this 指针，静态函数可以访问类的非静态成员
            Thread *self = static_cast<Thread *>(args);
            self->EnableRunning();

            if (self->_isdetach)
                self->Detach();

            // 设置线程在操作系统中的名称
            pthread_setname_np(self->_tid, self->_name.c_str());

            // 执行用户传入的任务逻辑
            self->_func();
            return nullptr;
        }

    public:
        // 构造：初始化线程基本信息，不立即启动线程
        Thread(func_t func) 
            : _tid(0), _isdetach(false), _isrunning(false), res(nullptr), _func(func) {
            _name = "thread-" + std::to_string(number++);
        }

        // 分离线程
        void Detach() {
            if (_isdetach)
                return; // 防止重复分离
            if (_isrunning) {
                pthread_detach(_tid);
            }
            EnableDetach();
        }

        // 获取线程名
        std::string Name() {
            return _name;
        }

        // 启动线程，调用 pthread_create
        bool Start() {
            if (_isrunning)
                return false;

            // 将 this 作为参数传递给 Routine，以便 Routine 访问实例成员
            int n = pthread_create(&_tid, nullptr, Routine, this);
            if (n != 0)
                return false;
            return true;
        }

        // 停止线程：通过 pthread_cancel 发送请求
        bool Stop() {
            if (_isrunning) {
                int n = pthread_cancel(_tid);
                if (n != 0)
                    return false;
                _isrunning = false;
                return true;
            }
            return false;
        }

        // 等待线程：阻塞调用者直到该线程执行完毕
        void Join() {
            // 已分离的线程不可被 Join
            if (_isdetach)
                return;

            int n = pthread_join(_tid, &res);
            if (n != 0) {
                LOG(LogLevel::DEBUG) << "Join 线程 " << _name << " 失败";
            } else {
                LOG(LogLevel::DEBUG) << "Join 线程 " << _name << " 成功";
                _isrunning = false;
            }
        }

        pthread_t Id() {
            return _tid;
        }

        ~Thread() {}

    private:
        pthread_t _tid;    // 线程原生 ID
        std::string _name; // 自定义线程名
        bool _isdetach;    // 是否是分离状态
        bool _isrunning;   // 是否在运行
        void *res;         // 线程返回的结果指针
        func_t _func;      // 用户要执行的任务
    };
} // namespace ThreadModule

#endif
```

## InetAddr.hpp
**封装网络地址。因为不管是服务器收消息还是逻辑层发消息，都离不开 IP 和端口的处理**
```cpp
#pragma once
#include "Common.hpp"

class InetAddr {
public:
    InetAddr() {}

    // 构造函数：从底层的 sockaddr_in 解析出 IP 和端口
    InetAddr(const struct sockaddr_in &addr) : _addr(addr) {
        // 1. 端口转换：网络字节序转为主机字节序
        _port = ntohs(_addr.sin_port);

        // 2. IP 转换：网络二进制格式转为点分十进制字符串 (线程安全)
        char ipbuffer[64];
        inet_ntop(AF_INET, &_addr.sin_addr, ipbuffer, sizeof(ipbuffer));
        _ip = ipbuffer;
    }

    // 构造函数：传入 IP 和端口（常用于客户端连接或服务器绑定特定 IP）
    InetAddr(const std::string &ip, uint16_t port) : _ip(ip), _port(port) {
        memset(&_addr, 0, sizeof(_addr));
        _addr.sin_family = AF_INET; // IPv4 协议族

        // 1. IP 转换：点分十进制字符串转为网络二进制格式
        inet_pton(AF_INET, _ip.c_str(), &_addr.sin_addr);

        // 2. 端口转换：主机字节序转为网络字节序
        _addr.sin_port = htons(_port);
    }

    // 构造函数：仅指定端口（常用于服务器 bind，默认监听所有网卡 INADDR_ANY）
    InetAddr(uint16_t port) : _port(port), _ip("") {
        memset(&_addr, 0, sizeof(_addr));
        _addr.sin_family = AF_INET;

        // 监听本地所有可用 IP
        _addr.sin_addr.s_addr = INADDR_ANY;

        // 端口转换：主机字节序转为网络字节序
        _addr.sin_port = htons(_port);
    }

    // 获取 IP 字符串
    std::string Ip() {
        return _ip;
    }

    // 获取底层的 sockaddr_in 结构体引用
    const struct sockaddr_in &NetAddr() {
        return _addr;
    }

    // 获取底层的 sockaddr 指针并进行强制类型转换（用于 bind, connect, sendto 等系统调用）
    const struct sockaddr *NetAddrPtr() {
        return (struct sockaddr *)&_addr;
    }

    // 获取结构体长度
    socklen_t NetAddrLen() {
        return sizeof(_addr);
    }

    // 重载判等操作符，方便比较两个地址对象
    bool operator==(const InetAddr &addr) {
        return addr._ip == _ip && addr._port == _port;
    }

    // 返回 "IP:Port" 格式的字符串，方便日志打印
    std::string StringAddr() {
        return _ip + ":" + std::to_string(_port);
    }

    ~InetAddr() {}

private:
    struct sockaddr_in _addr; // 底层 socket API 需要的结构
    std::string _ip;
    uint16_t _port;
};
```
### `ntohs`
- **作用**：将一个 **16位** 整数从 **网络字节序**（大端）转换为 **主机字节序**（通常是小端）。

- **常用场景**：在接收到网络数据包后，将提取出的 **端口号** 转换为本地主机可读的格式。

- **函数原型**：

```c
  uint16_t ntohs(uint16_t netshort);
```

- **返回类型**：`uint16_t`（返回转换后的主机字节序整数）。

- **参数**：`netshort`（一个 16 位的网络字节序整数）。

- **头文件**：

    - **Linux/Unix**: `<arpa/inet.h>`

    - **Windows**: `<winsock2.h>`

- **记忆**：**n** (network) **to** **h** (host) **s** (short)

### `htons`

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

### `inet_ntop`

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

### `inet_pton`

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

### `struct sockaddr_in 结构体`

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

# 并发框架
## `ThreadPool.hpp`
**在这个阶段编写线程池。它依赖前面的 Thread、Mutex 和 Cond。写完这一步，系统的异步处理能力就具备了**

```cpp
#pragma once
#include "Log.hpp"
#include "Mutex.hpp"
#include "Thread.hpp"
#include "Cond.hpp"
#include <iostream>
#include <queue>
#include <string>
#include <vector>

namespace ThreadPoolModule {
    using namespace ThreadModule;
    using namespace LogModule;
    using namespace CondModule;
    using namespace MutexModule;

    static const int gnum = 5;

    template <typename T> 
    class ThreadPool {
    private:
        // 唤醒所有等待中的工作线程
        // 通常在线程停止时调用
        void WakeUpAllThread() {
            LockGuard lockguard(_mutex);
            if (_sleepernum > 0)
                _cond.Broadcast();
            LOG(LogLevel::INFO) << "唤醒所有休眠的线程";
        }

        // 唤醒单个休眠线程
        void WakeUpOne() {
            _cond.Signal();
            LOG(LogLevel::INFO) << "唤醒一个休眠线程";
        }

        // 私有构造函数：确保单例模式
        ThreadPool(int num = gnum) : _num(num), _isrunning(false), _sleepernum(0) {
            for (int i = 0; i < num; i++) {
                // 使用 lambda 表达式绑定工作函数 HandlerTask
                _threads.emplace_back([this]() { HandlerTask(); });
            }
        }

        // 内部启动接口：启动所有线程对象
        void Start() {
            if (_isrunning)
                return;
            _isrunning = true;
            for (auto &thread : _threads) {
                thread.Start();
                LOG(LogLevel::INFO) << "start new thread success: " << thread.Name();
            }
        }

        // 禁止拷贝构造和赋值构造，防止单例违背
        ThreadPool(const ThreadPool<T> &) = delete;
        ThreadPool<T> &operator=(const ThreadPool<T> &) = delete;

    public:
        // 获取单例实例（双重检查锁定）
        static ThreadPool<T> *GetInstance() {
            if (inc == nullptr) // 第一次检查，避免不必要的加锁
            {
                LockGuard lockgurad(_lock); // 加锁确保线程安全
                if (inc == nullptr)         // 第二次检查：确认是否其他线程已创建
                {
                    LOG(LogLevel::DEBUG) << "首次使用单例，创建并启动线程池...";
                    inc = new ThreadPool<T>();
                    inc->Start();
                }
            }
            return inc;
        }

        // 停止线程池，设置运行标志并唤醒所有工作线程让他们退出
        void Stop() {
            if (!_isrunning)
                return;
            _isrunning = false;
            WakeUpAllThread();
        }

        // 等待所有线程退出
        void Join() {
            for (auto &thread : _threads) {
                thread.Join();
            }
        }

        // 线程执行逻辑（消费者）
        void HandlerTask() {
            char name[128];
            pthread_getname_np(pthread_self(), name, sizeof(name));
            while (true) {
                T t; // 任务对象
                {
                    LockGuard lockguard(_mutex);
                    // 1. 等待条件：队列为空且池还在运行，则线程休眠
                    while (_taskq.empty() && _isrunning) {
                        _sleepernum++;
                        _cond.Wait(_mutex); // 释放锁并等待信号
                        _sleepernum--;
                    }

                    // 2. 检查退出条件：池已关且任务已处理完
                    if (!_isrunning && _taskq.empty()) {
                        LOG(LogLevel::INFO) << name << " 退出了，线程池已关闭且任务队列为空";
                        break;
                    }

                    // 3. 提取任务：从队列中获取一个任务
                    t = _taskq.front();
                    _taskq.pop();
                }
                // 4. 执行任务：在临界区外部执行，提升并发性能
                t();
            }
        }

        // 生产者接口：向队列投放任务
        bool Enqueue(const T &in) {
            if (_isrunning) {
                LockGuard lockguard(_mutex);
                _taskq.push(in);
                if (_sleepernum > 0)
                    WakeUpOne();
                return true;
            }
            return false;
        }

        ~ThreadPool() {}

    private:
        std::vector<Thread> _threads; // 线程集合
        int _num;                     // 线程数量
        std::queue<T> _taskq;         // 任务队列
        Cond _cond;                   // 条件变量
        Mutex _mutex;                 // 任务队列互斥锁
        bool _isrunning;              // 运行状态标识
        int _sleepernum;              // 正在休眠的线程数

        static ThreadPool<T> *inc;    // 单例指针
        static Mutex _lock;           // 单例创建过程的全局锁
    };

    // 模板静态成员初始化
    template <typename T>
    ThreadPool<T> *ThreadPool<T>::inc = nullptr;

    template <typename T>
    MutexModule::Mutex ThreadPool<T>::_lock;

} // namespace ThreadPoolModule
```

### 运行逻辑
线程池的运行逻辑可以概括为一个“生产-消费”模型。它通过预先创建线程和维护任务队列，实现了任务的异步处理和线程的循环利用。

#### 初始化阶段（单例与预热）

当你第一次调用 `GetInstance()` 时，线程池开始“开门营业”：

- **创建工人**：构造函数根据 `gnum`（默认 5）创建出 5 个 `Thread` 对象，并存入 `vector`。

- **启动线程**：调用 `Start()`，这 5 个线程正式进入 `while(1)` 死循环，开始执行 `HandlerTask` 逻辑。

- **空转等待**：由于此时任务队列 `_taskq` 为空，这 5 个线程会执行 `_cond.Wait(_mutex)`，交出锁并进入**休眠状态**。

#### 任务投放阶段（生产者逻辑）

当你的主程序（或其他地方）调用 `Enqueue(task)` 时：

- **加锁入队**：先获取 `_mutex`，把任务 `T` 塞进 `_taskq` 队列。

- **精准唤醒**：检查 `_sleepernum`（正在睡觉的工人数量）。如果有工人在睡觉，就调用 `_cond.Signal()` 喊醒**其中一个**。

- **解耦**：生产者投完任务就走了，不需要等待任务被做完。

#### 任务处理阶段（消费者逻辑）

这是线程池最核心的**循环逻辑**（`HandlerTask` 内部）：

1. **抢活**：被唤醒的线程从 `_cond.Wait` 返回，重新竞争并拿到锁。

2. **取件**：从 `_taskq` 队列头部弹出一个任务 `t = _taskq.front()`。

3. **释放锁**：一旦拿到任务，立即释放 `_mutex`（**非常重要！** 这样其他线程才能去拿下一个任务）。

4. **埋头苦干**：在锁外执行 `t()`。这时即使任务执行时间很长，也不会阻塞其他线程取任务。

5. **归位**：任务执行完后，线程不会退出，而是回到 `while(1)` 开头，看看还有没有活，没活就继续睡。

#### 停止阶段（收尾逻辑）

当你调用 `Stop()` 时：

- **改标志位**：将 `_isrunning` 设为 `false`。

- **大范围唤醒**：调用 `WakeUpAllThread()`（`Broadcast`），把所有正在睡觉的工人全喊起来。

- **判空退出**：

    - 线程醒来发现 `_isrunning == false`。

    - 如果队列里还有剩下的活，它们会把活干完。

    - 如果队列空了，命中 `break`，线程函数返回，线程真正销毁。

#### 核心逻辑总结

1. **进场**：启动 5 个 `while(1)` 工人。

2. **等活**：队列空？-> 睡觉。

3. **接单**：有活了？-> 醒来 -> 抢锁 -> 拿走任务 -> 开锁。

4. **开干**：在锁外面执行任务逻辑。

5. **循环**：干完回到步骤 2。

**优势**：避免了每来一个任务就 `new` 一个线程（太慢、费内存），也避免了任务处理完就销毁线程（太浪费），实现了**资源的高效复用**。
### `pthread_getname_np`

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

### `pthread_self`

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

---

# 网络通信基础 (传输管道)
**开始搭建 UDP 通信的架子**

## Comm.hpp
**定义一些公共的错误码（如 Socket_Err）或常量**

```c
#pragma once

// 错误码枚举，用于规范程序退出状态或返回值
enum {
    Usage_Err = 1, // 参数使用错误
    Socket_Err,    // 套接字创建失败
    Bind_Err       // 绑定地址失败
};
```

## UdpServer.hpp
**实现最基础的 UDP 监听逻辑。这个阶段的 `UdpServer` 通常只负责把数据 `recvfrom` 上来，然后简单打印一下，确保网络通了**
```cpp
// UDP 服务器核心
// 服务器遵循：创建套接字 -> 绑定(Bind) -> 循环收发数据
#pragma once
#include "Comm.hpp"
#include "InetAddr.hpp"
#include "Log.hpp"
#include "nocopy.hpp"
#include <arpa/inet.h>
#include <cerrno>
#include <cstring>
#include <iostream>
#include <netinet/in.h>
#include <string>
#include <strings.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>
#include <functional>

using namespace LogModule;

// 定义回调函数类型：参数包括套接字、接收到的消息、发送方的地址信息
using func_t = std::function<void(int sockfd, const std::string& message, InetAddr& addr)>;

// 默认配置
const static uint16_t defaultport = 8888;
const static int defaultfd = -1;
const static int defaultsize = 1024;

// 继承 nocopy，防止服务器对象被意外复制
class UdpServer : public nocopy {
public:
    UdpServer(uint16_t port = defaultport, func_t func = nullptr) 
        : _port(port), _sockfd(defaultfd), _func(func) {
    }

    void Init() {
        // 1. 创建 socket。AF_INET 表示 IPv4, SOCK_DGRAM 表示 UDP 协议
        _sockfd = socket(AF_INET, SOCK_DGRAM, 0);
        if (_sockfd < 0) {
            LOG(LogLevel::FATAL) << "socket error!";
            exit(Usage_Err);
        }
        LOG(LogLevel::INFO) << "socket success, sockfd: " << _sockfd;

        // 2. 绑定指定服务器的网络信息（IP 和端口）
        struct sockaddr_in local;
        bzero(&local, sizeof(local)); // 清空内存
        local.sin_family = AF_INET;
        local.sin_port = htons(_port);      // 主机端口转为网络字节序
        local.sin_addr.s_addr = INADDR_ANY; // 监听本地所有可用 IP

        // 真正的绑定操作，将配置信息设置进内核
        int n = ::bind(_sockfd, (struct sockaddr *)&local, sizeof(local));
        if (n != 0) {
            LOG(LogLevel::FATAL) << "bind error";
            exit(Bind_Err);
        }
        LOG(LogLevel::INFO) << "bind success, sockfd: " << _sockfd;
    }

    void Start() {
        char buffer[defaultsize];
        for (;;) // 服务器死循环，永远不退出
        {
            struct sockaddr_in peer; // 用于存储发送端（客户端）的信息
            socklen_t len = sizeof(peer);
            
            // recvfrom: 接收数据，同时获取对方的 IP 和端口并填入 peer
            ssize_t n = recvfrom(_sockfd, buffer, sizeof(buffer) - 1, 0, (struct sockaddr *)&peer, &len);
            
            if (n > 0) {
                InetAddr addr(peer);      // 解析发送方地址信息封装成对象
                buffer[n] = 0;            // 字符串结尾，防止越界或乱码
                
                // 调用外部传入的业务逻辑处理函数
                if (_func) {
                    _func(_sockfd, buffer, addr);
                }
            }
        }
    }

    ~UdpServer() {
        // 析构时自动关闭文件描述符，释放系统资源
        if (_sockfd > defaultfd) {
            close(_sockfd);
        }
    }

private:
    uint16_t _port;   // 服务器端口号
    int _sockfd;      // 网络文件描述符
    func_t _func;     // 外部回调业务逻辑
};
```
---
### 运行逻辑
这段代码实现了一个标准的 **UDP 网络服务器**。它的核心运行逻辑可以分为：**初始化资源**、**绑定地址**、**死循环服务** 三个阶段。

#### 1. 准备阶段：Init() — 搭建通信端点

当程序启动并调用 `Init()` 时，服务器会做两件大事：

- **创建套接字 (socket)**：

    调用 `socket(AF_INET, SOCK_DGRAM, 0)`。这相当于在操作系统内核中申请了一个“通信柜台”。`AF_INET` 说明我们要走 IPv4 网络，`SOCK_DGRAM` 明确告诉内核：我要跑的是 **UDP** 协议（就像发短信，不需要建立连接）。

- **绑定地址 (bind)**：

    服务器必须有一个固定的“门牌号”，否则客户端找不到。程序通过 `struct sockaddr_in` 配置了端口号 `_port`。

    > **注意**：代码中没有显式设置 IP。在 `bind` 时，如果不指定具体 IP，通常默认监听机器上所有的网卡（INADDR_ANY）。
---
#### 2. 工作阶段：Start() — 永不停歇的接待员

`Start()` 逻辑是一个 `for(;;)` 死循环，这是服务器的标准形态。每循环一次，就会经历以下过程：

- **阻塞等待 (recvfrom)**：

    程序执行到 `recvfrom` 时会“卡住”（阻塞）。它在等待任何一个客户端发来的 UDP 数据包。

- **捕获来源 (peer)**：

    一旦有数据到达，`recvfrom` 不仅把数据拷贝到 `buffer` 中，还会自动记录是谁发的。发送方的 IP 和端口会被填充进 `struct sockaddr_in peer`。

- **逻辑解耦 (\_func)**：

    这是代码设计比较好的地方。服务器本身不负责处理具体的业务（比如翻译单词、聊天等），而是通过一个回调函数 `_func`。

    - `_func(_sockfd, buffer, addr)`：服务器把拿到的**消息**和**发送方地址**打包交给这个函数去处理。处理完后，循环回到起点，继续等下一个人的消息。

---

#### 3. 数据流转与封装

在整个逻辑中，数据的流转路径是：

1. **内核** 收到网卡数据包。

2. **`recvfrom`** 将数据从内核拷贝到用户态 `buffer`。

3. **`InetAddr`** 将二进制的 IP/Port 转化为易读的对象。

4. **`_func`** 执行具体的业务逻辑。

---

#### 4. 退出阶段：析构函数 — 资源回收

由于服务器是死循环，通常需要手动按下 `Ctrl+C` 终止。此时：

- 程序触发销毁流程，执行 `~UdpServer()`。

- 调用 `close(_sockfd)`。这非常重要，它会关闭内核中的文件描述符，释放端口资源，否则可能会出现“端口被占用”而无法立即重启的问题。

---

#### **逻辑总结**

1. **开门**：买个“UDP 类型的电话机” (`socket`)。

2. **贴号码**：告诉所有人我的号码是 `_port` (`bind`)。

3. **接听**：坐在电话旁等着 (`recvfrom` 阻塞)。

4. **处理**：有人说话，我就把话传给后台处理人员 (`_func`)。

5. **循环**：挂掉电话，立刻等下一个。

**特点**：使用了 `std::function` 回调逻辑，这意味着你可以把这个服务器模板复用到任何 UDP 场景中，只需要改动传进去的 `_func` 即可实现不同的功能。

### `socket()`

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

### `bind()`

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

**关键逻辑**：

1. **服务器端必备**：客户端通常不调用 `bind`，而是由内核随机分配端口。但服务器必须绑定固定端口，否则客户端找不到它。

2. **INADDR_ANY**：如果设置为这个宏，表示监听服务器上所有的网络接口（比如 Wi-Fi 和以太网）。

3. **权限限制**：在 Linux 中，绑定 **0 到 1023** 之间的端口通常需要 root 权限。

### `recvfrom()`

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

---
# 第四阶段：业务逻辑与协议设计 (核心大脑)
**当数据能收上来后，就需要考虑怎么处理这些数据**
### Route.hpp
**这是专门为“聊天室”设计的逻辑。在这个文件里定义如何管理用户列表、如何拼接消息字符串。它让服务器从一个单纯的“回显服务器”变成了“聊天服务器”。**

```cpp
#pragma once
#include "InetAddr.hpp"
#include "Log.hpp"
#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

using namespace LogModule;

/**
 * Route 类：负责管理在线用户并进行消息广播
 * 逻辑：收到任何人的消息 -> 格式化消息 -> 发送给列表中所有人
 */
class Route {
private:
    // 检查用户是否已在列表中（基于 IP 和端口）
    bool IsExist(InetAddr &peer) {
        for (auto &user : _online_user) {
            if (user == peer) {
                return true;
            }
        }
        return false;
    }

    // 将新用户添加到在线列表
    void AddUser(InetAddr &peer) {
        LOG(LogLevel::INFO) << "新增一个在线用户：" << peer.StringAddr();
        _online_user.push_back(peer);
    }

    // 从在线列表中移除特定用户
    void DeleteUser(InetAddr &peer) {
        // 使用 C++20 引入的 std::erase 简化容器元素删除
        std::erase(_online_user, peer);
        LOG(LogLevel::INFO) << "删除一个在线用户: " << peer.StringAddr() << " 成功";
    }

public:
    Route() {}

    /**
     * 核心业务逻辑：路由消息
     * sockfd   用于发送消息的套接字描述符
     * message  原始消息内容
     * peer     发送者的地址信息（来源）
     */
    void MessageRoute(int sockfd, const std::string &message, InetAddr &peer) {
        // 1. 自动登录逻辑：如果发消息的用户不在列表，则加入
        if (!IsExist(peer)) {
            AddUser(peer);
        }

        // 2. 封装广播格式：“IP:Port# 消息内容”
        std::string send_message = peer.StringAddr() + "# " + message;

        // 3. 广播分发：遍历所有在线用户，将消息通过 UDP 送达
        for (auto &user : _online_user) {
            // 调用系统调用接口 sendto，目标是列表中每一个用户的 NetAddr()
            sendto(sockfd, 
                   send_message.c_str(), 
                   send_message.size(), 
                   0, 
                   (const struct sockaddr *)&(user.NetAddr()),
                   sizeof(user.NetAddr()));
        }

        // 4. 用户退出逻辑
        // 如果用户发送的内容正好是“QUIT”, 则在广播完该消息后将其移除
        if (message == "QUIT") {
            LOG(LogLevel::INFO) << "处理用户退出请求: " << peer.StringAddr();
            DeleteUser(peer);
        }
    }

    ~Route() {}

private:
    // 在线用户容器：存储所有活跃客户端的地址信息
    // 只要给服务器发过消息且没发送过 "QUIT"，其地址都会保留在此
    std::vector<InetAddr> _online_user;
};
```
---

#### 运行逻辑
这段代码实现了一个 **UDP 聊天室的转发核心（路由逻辑）**。它的主要作用是维护一个“在线名单”，并将收到的任何消息像“大喇叭”一样广播给名单里的所有人。

其执行逻辑可以分为以下四个步骤：

#### 1. 自动注册（隐式登录）

当 `MessageRoute` 被触发时，程序首先检查 `peer`（当前发消息的人）是否在 `_online_user` 容器中。

- **新面孔**：如果 `IsExist` 返回 `false`，说明这是该用户第一次发消息，程序会自动调用 `AddUser` 将其地址加入名单。

- **老用户**：如果已存在，则跳过，直接进入后续逻辑。

- **逻辑特点**：用户不需要专门的“Login”操作，发第一条消息即视为上线。

#### 2. 消息封装（统一格式）

为了让接收者知道是谁在说话，程序会对原始消息进行重组：

- **格式**：`IP地址:端口号# 原始消息内容`

- 这样在客户端显示时，就会看到类似 `192.168.1.10:8888# Hello World` 的效果。

#### 3. 广播分发（核心动作）

这是最消耗资源但也最关键的一步。程序通过 `for` 循环遍历 `_online_user` 列表：

- **全员推送**：对列表中的**每一个**用户，都执行一次 `sendto` 系统调用。

- **注意点**：发送者本人也会收到这条消息（因为他在名单里）。这种设计方便客户端验证自己的消息是否发送成功。

#### 4. 退出机制（挥手逻辑）

在完成本次广播后，程序会检查消息内容：

- **匹配 "QUIT"**：如果消息正好是字符串 `"QUIT"`，说明该用户想要下线。

- **清理**：调用 `DeleteUser`（使用 `std::erase`）将其从名单中移除。

- **延迟删除**：必须先广播再删除。这样名单里的其他人（包括正在退出的用户）都能收到最后一条“下线通知”。

---

#### 总结：数据流转

1. **Client A** 发送 "Hello" -> **Server**。

2. **Server** 检查：A 不在名单？-> **Add A**。

3. **Server** 遍历名单（A）：调用 `sendto` -> **Client A** 收到 "A# Hello"。

4. **Client B** 发送 "Hi" -> **Server**。

5. **Server** 检查：B 不在名单？-> **Add B**。

6. **Server** 遍历名单（A, B）：

    - `sendto` -> **Client A** 收到 "B# Hi"。

    - `sendto` -> **Client B** 收到 "B# Hi"。

**设计细节**：

- **std::vector**：存储用户地址，适合用户量不大的场景。

- **std::erase**：C++20 的新写法，比以前的 `remove-erase idiom` 简洁得多，直接一行代码精准删除目标对象。

### `sendto()`

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

# 两个.cc
## `UdpClient.cc`

```cpp
#include "Thread.hpp"
#include <arpa/inet.h>
#include <cerrno>
#include <cstring>
#include <iostream>
#include <netinet/in.h>
#include <string>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>

// 全局变量
int sockfd = 0;
std::string server_ip;
uint16_t server_port = 0;
pthread_t id;

using namespace ThreadModule;

void Usage(const std::string &process) {
    std::cout << "Usage:" << process << " server_ip server_port" << std::endl;
}

void Recv() {
    while (1) {
        char buffer[1024];
        struct sockaddr_in peer;
        socklen_t len = sizeof(peer); // 注意类型并非int,参数类型特别

        // recvfrom 会阻塞等待，直到服务器有消息发过来
        int m = recvfrom(sockfd, buffer, sizeof(buffer) - 1, 0, (struct sockaddr *)&peer, &len);
        if (m > 0) {
            buffer[m] = 0;
            // 使用 std::cerr 输出，可以和 std::cout 的输入提示符稍微分开
            // 或者配合输出重定向使用。
            std::cerr << buffer << std::endl;
        }
    }
}

void Send() {
    // 1. 填充目标服务器的信息
    struct sockaddr_in server;
    memset(&server, 0, sizeof server);
    server.sin_family = AF_INET;
    server.sin_port = htons(server_port);
    server.sin_addr.s_addr = inet_addr(server_ip.c_str());

    // 2. 预热：先发一个通知告诉服务器“我上线了”
    const std::string online = "inline";
    sendto(sockfd, online.c_str(), online.size(), 0, (struct sockaddr *)&server, sizeof server);

    // 3. 循环获取输入
    while (1) {
        std::string inbuffer;
        std::cout << "Please Enter# ";
        std::getline(std::cin, inbuffer); // 获取用户输入的字符串

        // 发送数据给服务器
        ssize_t n = sendto(sockfd, inbuffer.c_str(), inbuffer.size(), 0, (struct sockaddr *)&server, sizeof server);

        // 4. 退出逻辑：如果输入QUIT,需结束循环并且关掉接收进程
        if (inbuffer == "QUIT") {
            pthread_cancel(id);
            break;
        }
    }
}

int main(int argc, char *argv[]) {
    if (argc != 3) {
        Usage(argv[0]);
        return 1;
    }

    server_ip = argv[1];
    server_port = std::stoi(argv[2]);

    // 1. 创建socket
    sockfd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sockfd < 0) {
        // 输出日志
        std::cerr << "socket error" << std::endl;
        return 2;
    }

    // 客户端不需要显式调用bind
    // OS会在client首次调用sendto时，随机分配一个端口并自动bind

    // 2. 启动双线程
    Thread recver(Recv);
    Thread sender(Send);

    recver.Start();
    sender.Start();

    // 记录接收线程的原生ID,用于后续的pthread_cancel
    id = recver.Id();

    recver.Join();
    sender.Join();

    close(sockfd);
    return 0;
}
```

### 执行逻辑

**1. 基础环境搭建** 程序在进入多线程逻辑前，先在主线程完成了环境初始化。通过调用 `socket()` 函数申请内核资源，获得一个文件描述符。需要注意的是，UDP 客户端通常选择“隐式绑定”，这意味着开发者不需要关心具体使用哪个端口，OS 会在数据第一次发出的瞬间，在 1024 到 65535 之间挑选一个空闲端口与该套接字关联。

**2. 发送线程的生命周期** 发送线程（`Send`）承担了“主动发起者”的角色。它首先执行一个“打招呼”的动作，向服务器发送 `inline` 信号，这在业务逻辑上被称为**心跳起始**或**注册**。随后它进入一个死循环，循环的核心是 `std::getline`。这是一个阻塞操作，但由于它运行在独立线程中，并不会影响程序接收来自网络的消息。当检测到退出指令 `QUIT` 时，它不仅结束自身，还会利用 `pthread_cancel` 给接收线程发送终止信号，确保整个进程能优雅退出。

**3. 接收线程的常驻监听** 接收线程（`Recv`）是一个纯粹的“监听者”。它不断重复 `recvfrom` 操作，该函数在没有数据到达时会让线程进入休眠状态，不占用 CPU 资源。一旦内核接收到匹配的数据包，线程被唤醒，将二进制数据转化为字符串并输出。这里选择 `std::cerr` 是一个非常老练的技巧：在 Linux 中，标准输出（stdout）和标准错误（stderr）是分离的。如果用户将聊天记录重定向到文件（`./client > log.txt`），`std::cerr` 打印的消息依然会显示在屏幕上，确保交互不中断。

**4. 线程同步与资源清理** 主线程在启动两个子线程后，通过 `Join()` 进入等待状态。这就像是工厂经理等待两个车间完工。只有当发送线程退出（用户输入 QUIT）且接收线程被取消后，主线程才会向下执行。最后的 `close(sockfd)` 是必不可少的，它会通知内核回收文件描述符及相关的缓冲区资源，防止资源泄漏。

**5. 整体逻辑总结** 该程序的本质是将用户交互（慢速 IO）**与**网络监听（异步 IO）通过多线程进行解耦。这种设计模式让客户端具备了类似即时通讯软件（IM）的基础功能：你可以在打字的同时，看到别人发来的消息即时跳出。

## UdpServer.cc
```cpp
#include <iostream>
#include <memory>
#include <string>
#include <functional>
#include "UdpServer.hpp"
#include "Route.hpp"
#include "ThreadPool.hpp"

using namespace ThreadPoolModule;

// 仅仅是用来进行测试的
std::string defaulthandler(const std::string &message)
{
    std::string hello = "hello, ";
    hello += message;
    return hello;
}

// 定义任务类型：包装成一个无参数无返回值的包装器，方便丢进线程池
using task_t = std::function<void()>;

// ./udpserver port
int main(int argc, char *argv[])
{
    if (argc != 2)
    {
        std::cerr << "Usage: " << argv[0] << " port" << std::endl;
        return 1;
    }

    // std::string ip = argv[1];
    uint16_t port = std::stoi(argv[1]);

    ENABLE_CONSOLE_LOG_STRATEGY();

    // 1. 实例化路由服务对象
    Route r;

    // 2. 获取线程池单例对象
    auto tp = ThreadPool<task_t>::GetInstance();

    // 3. 网络服务器对象，提供通信功能
    // 构造函数参数：端口号 + 处理回调函数
    // &r: 捕获路由对象引用，用于处理逻辑
    // &tp: 捕获线程池引用，用于异步执行
    // sockfd, message, peer: 当 UdpServer 收到数据时传入的原始信息
    std::unique_ptr<UdpServer> usvr = std::make_unique<UdpServer>(port, [&r, &tp](int sockfd, const std::string &message, InetAddr &peer) {
        // 1. 使用 std::bind 将逻辑处理函数（Route::MessageRoute）和它所需的参数绑定
        // 这就形成了一个不带参数的任务对象 t
        task_t t = std::bind(&Route::MessageRoute, &r, sockfd, message, peer);

        // 2. 将任务推送到线程池的任务队列
        tp->Enqueue(t);
    });

    // 4. 服务器启动与初始化
    usvr->Init();
    usvr->Start();

    return 0;
}
```

### 运行逻辑
这段服务器程序实现了一个高性能的 **UDP 并发服务器**。它最显著的特点是采用了**生产者-消费者模型**，将“网络 IO 接收”与“业务逻辑处理”完全解耦。

**1. 初始化与资源准备**

程序启动后，首先从命令行获取监听端口，并进行了一系列“基础设施”的准备。

- **路由实例化**：`Route r` 对象被创建，它包含了服务器的核心业务逻辑（如消息如何分发、如何处理业务数据）。

- **线程池单例获取**：通过 `ThreadPool::GetInstance()` 获取全局唯一的线程池对象。此时，线程池内部已经预先启动了一组工作线程，它们正处于阻塞状态，等待任务队列中出现新任务。

**2. 回调函数的绑定与注入**

这是程序设计最巧妙的地方。在创建 `UdpServer` 对象时，主程序向其注入了一个 **Lambda 表达式**。这个表达式定义了“当服务器收到数据时该做什么”：

- 它并没有立即处理数据，而是利用 `std::bind` 将处理函数 `Route::MessageRoute` 及其所需的上下文（socket 描述符、消息内容、客户端地址）打包成一个任务对象。

- 随后，这个任务被放入线程池的队列中。

- 这种做法保证了主线程（IO 线程）能够以极快的速度返回，继续监听下一个 UDP 数据包。

**3. 网络监听与任务生产**

当执行 `usvr->Start()` 后，服务器进入底层循环（通常是 `recvfrom`）。

- **接收数据**：一旦网络上有数据到达，`UdpServer` 接收该数据包并提取出客户端的 IP 和端口。

- **分发任务**：`UdpServer` 调用之前注入的回调函数，将数据包装成任务丢进线程池。

- **高并发保障**：由于主线程不参与耗时的业务计算，即使短时间内有成千上万个 UDP 包涌入，主线程也能快速处理并将压力转移给后端线程池。

**4. 异步处理与逻辑消费**

线程池中的某个工作线程被唤醒，并从队列中取出任务执行。

- **业务处理**：工作线程执行 `Route::MessageRoute`，解析消息内容。

- **响应回传**：根据业务逻辑，工作线程会直接通过传入的 `sockfd` 和 `peer` 信息，将处理结果 `sendto` 给对应的客户端。

- 整个过程对主线程是透明的，实现了真正的异步处理。

**5. 整体架构总结**

该程序是一个典型的 **IO 复用与线程池结合** 的模型。

- **主线程**：负责“看门”，即生产任务。

- **线程池**：负责“干活”，即消费任务。

    这种设计不仅提高了服务器的响应速度，还增强了系统的稳定性，防止因单条消息处理过慢而导致后续请求丢失或超时。

### `std::bind`

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

# 整体逻辑
**基于UDP的发布-订阅（广播）群聊模型**。核心思想是：服务器充当“路由器”或“交换机”的角色，收集来自任何客户端的消息，然后将这条消息群发给所有已知上线的客户端。

## 第一阶段：服务器启动 (`./udpserver port`)

当你在终端运行服务器程序时，它会执行以下准备工作：

1. **初始化资源**：在 `main` 函数中，服务器首先实例化了路由对象 `Route r`，并获取了全局的线程池单例 `ThreadPool`。

2. **定义处理逻辑**：创建一个 `UdpServer` 对象，并向其传入一个 Lambda 表达式。这个 Lambda 的作用是：一旦收到网络数据，就把“处理并广播这条数据”的任务（`Route::MessageRoute`）打包，丢进线程池的任务队列中。

3. **网络绑定 (Bind)**：调用 `Init()` 方法，底层调用 `socket()` 创建一个 UDP 套接字，并通过 `bind()` 将套接字与你指定的端口（Port）绑定。

4. **进入监听状态**：调用 `Start()` 方法，服务器进入一个死循环 `for(;;)`，阻塞在 `recvfrom()` 函数上，静静等待任何客户端发来数据。

---

## 第二阶段：客户端启动 (`./udpclient ip port`)

当你在另一个终端运行客户端时，流程如下：

1. **创建 Socket**：客户端底层同样调用 `socket()` 创建 UDP 套接字。但它不需要显式 `bind`，当它第一次发送数据时，操作系统会自动为它分配一个随机端口。

2. **双线程分离**：为了防止“等待用户键盘输入”和“等待接收服务器消息”互相阻塞，客户端启动了两个线程：

    - **`Send` 线程**（发送端）：负责读取键盘输入并发送给服务器。

    - **`Recv` 线程**（接收端）：死循环执行 `recvfrom()`，专门等待服务器发来的广播消息。

3. **“隐式登录”机制**：`Send` 线程刚启动时，在要求用户输入之前，会主动向服务器发送一个 `"inline"` 字符串（预热机制）。这相当于告诉服务器：“我上线了，请把我的 IP 和端口记下来”。

---

## 第三阶段：消息路由与广播（核心数据流）

当用户在客户端的提示符 `Please Enter#` 后输入一条消息（例如 `"Hello World"`）并回车时，真正的数据流转开始了：

1. **客户端发送**：客户端的 `Send` 线程调用 `sendto()`，将 `"Hello World"` 发送到服务器的 IP 和端口。

2. **服务器接收并分发**：

    - 服务器主线程的 `recvfrom()` 解除阻塞，收到了 `"Hello World"`，同时通过 `peer` 参数获取了该客户端的 IP 和端口。

    - 服务器立刻执行回调，将任务放入 `ThreadPool` 的队列中，然后**主线程立刻回到 `recvfrom()` 继续监听**（这保证了服务器的高并发接收能力）。

3. **线程池处理**：

    - 线程池中某个正在休眠的线程被唤醒，取出任务，开始执行 `Route::MessageRoute()`。

4. **路由逻辑 (`Route.hpp`)**：

    - **检查是否存在**：调用 `IsExist()` 检查发消息的这个客户端是否在 `_online_user` 列表中。如果不在（比如刚才发 `"inline"` 的时候），就调用 `AddUser` 把它加进去。

    - **封装消息**：将消息格式化为 `[发送者IP]:[发送者端口]# 消息内容`（例如：`127.0.0.1:54321# Hello World`）。

    - **广播群发**：遍历内部的 `_online_user` 列表（包含了所有曾经发过消息且没退出的客户端），对列表里的每一个地址调用系统 API `sendto()`，把格式化后的消息依次发出去。

---

## 第四阶段：其他客户端接收信息

经过第三步的广播，这条消息通过网络飞向了所有在线的客户端：

1. **客户端解阻**：各个客户端里原本阻塞在 `recvfrom()` 的 **`Recv` 线程** 会收到这条数据。

2. **打印输出**：客户端利用 `std::cerr` 将收到的字符串打印到屏幕上。这样，包括发送者本人在内的所有客户端，都会在屏幕上看到：`127.0.0.1:54321# Hello World`。

---

## 第五阶段：客户端退出逻辑

当用户想要退出聊天室时，程序的处理十分优雅：

1. 用户在键盘输入 `"QUIT"`。

2. **客户端侧**：`Send` 线程捕捉到 `"QUIT"`，调用 `pthread_cancel(id)` 强行终止正在死等消息的 `Recv` 线程，跳出循环，关闭 socket，进程结束。

3. **服务器侧**：服务器依然会把 `"QUIT"` 这条消息当作正常消息广播给所有人。但是在广播完毕后，`Route::MessageRoute` 内部有这样一段逻辑：
```cpp
    if (message == "QUIT") {
        DeleteUser(peer);
    }
```

它会从 `_online_user` 列表中把这个客户端剔除。以后再有人发消息，服务器就不会再往这个已退出的客户端发数据了。
## 总结

整个流程巧妙地利用了 UDP 面向无连接的特性：**服务器不需要像 TCP 那样维护复杂的长连接，只要你给我发过消息，我就把你的地址存进“通讯录（Route）”，别人一说话，我就照着通讯录挨个发短信。** 配合线程池处理广播，即使同时有成百上千个用户在线发言，主线程也不会卡顿。
