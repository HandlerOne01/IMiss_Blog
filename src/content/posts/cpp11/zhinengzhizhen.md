---
title: "智能指针"
published: 2026-05-31 17:12:18
description: "内存泄漏 (Memory Leak)：动态分配的堆内存由于程序设计错误未被释放，导致系统内存持续消耗。"
category: "C++11"
tags: ["C++11"]
lang: "zh_CN"
draft: false
comment: true
---

# 一、裸指针的痛点与 RAII 思想

## 1.1 裸指针与异常安全隐患

- **概念解释**：

    - **内存泄漏 (Memory Leak)**：动态分配的堆内存由于程序设计错误未被释放，导致系统内存持续消耗。

    - **异常安全 (Exception Safety)**：指当程序在运行过程中抛出异常（Exception）时，程序依然能够保持有效的内部状态，并且不会发生资源（如内存、锁、文件句柄）泄漏的问题。

- **笔记**：

    - 在传统 C++ 中，使用 `new` / `delete` 管理动态内存极易引发异常安全问题。如果在两者之间调用的函数抛出了异常，或者后续逻辑提前 `return`，控制流会直接跳转跳过 `delete`，引发绝对的内存泄漏。

    - **传统方案的局限**：使用 `try-catch` 拦截异常，释放内存后再将异常重新抛出。但在多处连续分配内存的场景下，嵌套捕获和释放逻辑会导致代码极度繁琐和臃肿。

    - **代码演示**：
        ```cpp
        void Func() {
            int* array1 = new int[10];
            int* array2 = new int[10]; // 若此处抛异常，array1 将永远无法释放
        
            try {
                // ... 可能抛出异常的业务逻辑 ...
            } catch(...) {
                // 发生异常时，必须手动清理已分配的所有内存，再重新抛出
                delete[] array1;
                delete[] array2;
                throw; 
            }
            delete[] array1;
            delete[] array2;
        }
        ```

## 1.2 RAII 设计理念与智能指针模拟

- **概念解释**：

    - **RAII (Resource Acquisition Is Initialization)**：中文意为“资源获取即初始化”。利用 C++ 局部对象生命周期（离开作用域自动调用析构函数）的特性，将动态资源强制绑定给局部对象，从而将资源管理的责任交给编译器。

- **笔记**：

    - **核心机制**：在获取资源时，将其委托给一个局部对象（构造函数初始化）。当对象离开作用域生命周期结束时，自动触发析构函数释放资源。

    - **智能指针基本设计**：除满足 RAII 思路外，为了能像原生指针一样使用，必须重载指针相关运算符（`operator*`、`operator->`、`operator[]`）。

## 1.3 历史遗留的坑点：`auto_ptr` (C++98)

- **概念解释**：

    - **所有权转移 (Ownership Transfer)**：一种粗暴的资源交接方式，剥夺原指针的控制权交给新指针。

- **笔记**：

    - **缺陷**：拷贝时，将被拷贝对象的资源管理权强行转移给拷贝对象，导致原指针悬空。若程序员不知情再次访问原对象，程序将直接崩溃。

    - **结论**：设计极其糟糕，C++11 之后已被废弃，企业级项目中**绝对禁止使用**。

# 二、 现代 C++ 核心智能指针体系 (C++11/14)

## 2.1 独占型智能指针：`unique_ptr`

- **概念解释**：

    - **独占所有权 (Exclusive Ownership)**：同一时刻只能有一个指针指向并拥有该对象，从语法层面彻底防止“二次释放 (Double Free)”。

- **核心函数**：`std::make_unique` (C++14)

- **函数原型**：
    ```cpp
    template< class T, class... Args >
    std::unique_ptr<T> make_unique( Args&&... args );
    ```

    _功能说明_：完美转发参数给 `T` 的构造函数并在堆上创建对象，返回管理该对象的 `unique_ptr`。

- **笔记**：

    - **核心语义**：“这东西归我，别人不准碰”。

    - **特性**：

        - **禁止拷贝**：`auto p2 = p1;` 编译直接拦截报错。

        - **支持移动**：可通过 `auto p2 = std::move(p1);` 将所有权转移给 `p2`，转移后 `p1` 变空。

        - **零性能开销**：无内部状态维护，运行效率等同原生裸指针。

## 2.2 共享型智能指针：`shared_ptr`

- **概念解释**：

    - **共享所有权与引用计数 (Reference Counting)**：允许多个指针管理同一对象。底层维护一个原子计数器，记录当前管理者数量；仅当计数器归零时，才触发真实对象的 `delete`。

- **核心函数**：`std::make_shared` (C++11)

- **函数原型**：
    ```cpp
    template< class T, class... Args >
    std::shared_ptr<T> make_shared( Args&&... args );
    ```

    _功能说明_：构造对象并返回 `shared_ptr`。强烈推荐替代 `new` 使用，可实现内存合并分配。

- **笔记**：
	`shared_ptr` 的核心是**引用计数**。因为一份资源可能被多个对象共享，所以必须保证这几个对象看到的是同一个计数器。

- **不能使用普通成员变量：** 每个对象独享，无法同步。

- **不能使用静态成员变量：** 所有同类型的 `shared_ptr` 都会共享同一个计数，哪怕它们管理的是不同的资源。

- **正确做法：** **在堆上动态开辟一个计数器（`int* _pcount`）**。构造时伴随资源 `new` 一个计数器；拷贝时所有对象指向同一个堆上的计数器，并对其 `++`；析构时对计数器 `--`，当计数器减到 0 时，说明当前是最后一个管理者，此时释放资源和计数器。
    ![](/images/posts/zhinengzhizhen/01.png)

## 2.3 伴生弱指针：`weak_ptr` 与循环引用陷阱

- **概念解释**：

    - **循环引用 (Circular Reference)**：复杂数据结构（如双向链表互相指）中，两个 `shared_ptr` 互相持有对方，导致双方引用计数形成闭环，永远无法降为 0，引发内存泄漏。

    - **弱指针 (`weak_ptr`)**：专门为打破 `shared_ptr` 循环引用而生的伴生指针。它不具 RAII 特性，不增加引用计数，仅作为资源的“观察者”。

- **核心函数**：`std::weak_ptr::lock` / `std::weak_ptr::expired`

- **函数原型**：
    ```cpp
    std::shared_ptr<T> lock() const noexcept;
    bool expired() const noexcept;
    ```

    _功能说明_：`expired()` 检查观察的资源是否已释放；`lock()` 用于在资源有效时，临时提升返回一个强引用 `shared_ptr` 以安全访问数据。

- **笔记**：

    - **死锁过程**：双向链表中节点 A 与 B 的 `_next` 和 `_prev` 若为 `shared_ptr`，外部强引用释放后，内部互相依赖对方先析构，形成“回旋镖死锁”。

    - **破局之道**：将双向链表内部指向类的指针改为 `weak_ptr`。

    - **访问机制**：`weak_ptr` 没有重载 `*` 和 `->`，无法直接操作资源，必须通过 `lock()` 获取 `shared_ptr` 保证线程与生命周期安全。
        ![](/images/posts/zhinengzhizhen/02.png)

## 2.4 横向对比与 Reactor 模型选型规则

|**特性**|**unique_ptr**|**shared_ptr**|
|---|---|---|
|**所有权**|独占 (Exclusive)|共享 (Shared)|
|**拷贝行为**|严格禁止|允许（内部引用计数+1）|
|**开销**|零（等同裸指针）|存在（维护原子计数器）|
|**适用场景**|唯一拥有者 (首选)|必须在多处模块共享同一个对象|

- **Reactor 代码选型逻辑**：

    - **最高规则**：能用 `unique_ptr` 就别用 `shared_ptr`。

    - **独占场景**：`TcpServer` 独占 `Epoller` 和 `Listener`，必须采用 `unique_ptr`。

    - **共享场景**：`Connection` 既保存在 `TcpServer` 的 `map` 中，又需要传给其他工作线程/模块，必须采用 `shared_ptr`。

# 三、 为什么必须拥抱 `make_*` 系列？

## 3.1 消除极度隐蔽的“异常安全”漏洞

- **概念解释**：

    - **函数参数求值顺序未指定 (Unspecified Evaluation Order)**：C++17 前，编译器对函数调用的多个参数执行计算的顺序是不确定的。

- **笔记**：

    - **裸 `new` 的致命漏洞**：如 `Process(std::shared_ptr<Widget>(new Widget), ComputePriority());`。编译器可能先执行 `new Widget`，然后执行 `ComputePriority()`。如果此函数抛出异常，控制流中断，未被智能指针接管的 `Widget` 将发生内存泄漏。

    - **`make_*` 的原子性**：`Process(std::make_shared<Widget>(), ComputePriority());` 将内存分配与智能指针构造绑定为不可分割的原子过程，完美堵死并发求值漏洞。

## 3.2 底层内存布局与性能优化 (`make_shared` 专享)

- **笔记**：

    - `shared_ptr` 底层不仅有对象，还有维护引用计数的**控制块 (Control Block)**。

    - **传统构造**：`std::shared_ptr<Widget> p(new Widget);` 发生两次堆内存分配（一次对象，一次控制块），增加系统开销且导致内存碎片化，CPU 缓存命中率低。

    - **合并分配**：`make_shared` 只进行**单次合并内存分配**，开辟一块连续大内存同时存放对象和控制块，零碎片且极大地优化了 CPU Cache 表现。

    - **遵循 DRY 原则**：`auto p = std::make_unique<Type>();` 避免了类型名称手写两次的冗余。

## 3.3 架构师视角：必须退回使用 `new` 的特例

1. **指定自定义删除器 (Custom Deleter)**：`make_*` 写死了 `delete`。当管理 `new[]`、文件描述符 (`FILE*`)、网络 Socket 时，必须使用传统智能指针构造并传入仿函数/Lambda 删除器（注：C++ 标准库已特化 `unique_ptr<T[]>` 和 `shared_ptr<T[]>` 解决数组问题）。

2. **极大内存与 `weak_ptr` 纠缠**：因 `make_shared` 连续分配对象与控制块，只要还有 `weak_ptr` 指向控制块，哪怕强引用归零触发了对象析构，**整块极大的内存也无法交还操作系统**，引发延迟释放。此时必须分开 `new`。
