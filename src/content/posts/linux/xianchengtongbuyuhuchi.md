---
title: "线程同步与互斥"
published: 2026-09-23 21:36:32
description: "线程共享地址空间：同一个进程内的多个线程共享进程的虚拟地址空间。"
category: "Linux 系统"
tags: ["Linux 系统"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. 引入
- **线程共享地址空间**：同一个进程内的多个线程共享进程的虚拟地址空间。

- **线程共享大部分资源**：堆、全局变量、静态变量、文件描述符等 → 这些成为 **公共资源**。

- **引发的问题**：多线程并发访问公共资源时，容易出现 **数据不一致** 等各种问题。

- **解决方案**：**同步** 和 **互斥**。

# 2. 共享资源与临界资源
- **共享资源**：多个执行流（线程/进程）都能访问的资源。

- **临界资源**：被多线程执行流 **保护起来** 的共享资源。即：只有通过互斥手段访问的共享资源才叫临界资源。

- **临界区**：每个线程内部，**访问临界资源的代码段** 就叫做临界区。

- **互斥**：任何时刻，**保证有且只有一个执行流进入临界区**，访问临界资源。互斥通常用于对临界资源起保护作用。

- **原子性**：不会被任何调度机制打断的操作。该操作只有两态：**要么完成，要么未完成**（没有中间状态）。原子性是实现互斥的基础。

# 3. 信号量

## 3.1 信号量是什么？

- **本质**：一个 **计数器**，用来表示临界资源中 **资源的数量**（有多少份可用资源）。

- **理解信号量**：类比电影院售票。

    - 电影院放映厅是一个临界资源。

    - 座位有 100 个 → 信号量初始值为 100。

    - 买票 → 申请信号量（预订一个座位）。

    - **实际含义**：信号量是对资源的 **预订机制**！想访问临界资源中的一小块，必须先申请信号量。

## 3.2 信号量的核心工作方式

- **所有进程/线程** 在访问临界资源的一小块之前，**必须先申请信号量**。

- 申请信号量的本质：**对资源的预订**。

- 信号量的作用：

    - 避免多个执行流访问同一个位置。

    - 控制同时访问资源的执行流数量（避免投入过多）。

## 3.3 信号量的操作：P/V 操作

- **P 操作**（申请资源）：计数器减 1。如果计数器 < 0，则阻塞等待。

- **V 操作**（释放资源）：计数器加 1。唤醒等待队列中的线程。

- **原子性要求**：信号量本身也是共享资源，所以 **P/V 操作必须原子完成**。

## 3.4 二元信号量与互斥

- **二元信号量**：信号量的值只有 **0 或 1**。

- 二元信号量就是 **互斥锁**！用于实现互斥。

## 3.5 信号量的内部结构
```c
struct sem {
    int count;                 // 计数器
    struct task_struct *waitqueue;  // 等待队列
    // 还有用于保护自身的锁（原子操作）
};
```
## 3.6 多元信号量
# 4. 互斥场景：抢票
## 4.1 无锁版本
```c
int ticket = 1000;

void *route(void *arg) {
    char *id = (char *)arg;
    while (1) {
        if (ticket > 0) {          // 1. 判断
            usleep(1000);          // 模拟抢票耗时
            printf("%s sells ticket:%d\n", id, ticket); // 2. 输出
            ticket--;              // 3. 票数减1
        } else {
            break;
        }
    }
    return nullptr;
}
```
**现象**：可能出现负数票（如 `sells ticket: -1`, `-2`）。

**原因分析**：

- `ticket--` 不是原子操作。C语言的一条语句，编译成汇编通常是三条指令：
```c
0xFF00: mov  ebx, [ticket]   ; 载入内存到寄存器
0xFF02: dec  ebx             ; 减少1
0xFF04: mov  [ticket], ebx   ; 写回内存
```
- 线程切换可能发生在任意一条汇编指令之间。

- 例如：

    - 线程A：载入 ticket=100 → 计算得99 → 还未写回时被切走。

    - 线程B：载入 ticket=100 → 计算得99 → 写回 ticket=99。

    - 线程A恢复：写回 ticket=99（覆盖了B的结果，但只减了一次，实际应减两次）。

    - 最终可能导致 ticket 减成负数（判断时 >0，但多个线程同时通过判断后各自减，造成超卖）。

**结论**：多线程并发访问共享变量，若操作非原子，则数据不一致。

## 4.2 加锁版本
```c
int ticket = 10000;
pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;   // 全局静态初始化

void *route(void *arg) {
    char *id = (char *)arg;
    while (1) {
        pthread_mutex_lock(&lock);    // 加锁
        if (ticket > 0) {
            usleep(1000);
            printf("%s sells ticket:%d\n", id, ticket);
            ticket--;
            pthread_mutex_unlock(&lock); // 解锁
        } else {
            pthread_mutex_unlock(&lock);
            break;
        }
    }
    return nullptr;
}
```
**效果**：同一时刻只有一个线程能进入临界区，保证 ticket 操作的正确性。
![](/images/posts/xianchengtongbuyuhuchi/01.png)

# 5. 互斥锁（pthread_mutex_t）
## 5.1 基本接口
```c
#include <pthread.h>

int pthread_mutex_init(pthread_mutex_t *mutex, const pthread_mutexattr_t *attr);
int pthread_mutex_destroy(pthread_mutex_t *mutex);
int pthread_mutex_lock(pthread_mutex_t *mutex);       // 阻塞加锁
int pthread_mutex_trylock(pthread_mutex_t *mutex);    // 非阻塞加锁
int pthread_mutex_unlock(pthread_mutex_t *mutex);
```
### 5.1.1 pthread_mutex_init

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_mutex_init(pthread_mutex_t *mutex, const pthread_mutexattr_t *attr);`

- **功能**：初始化一个互斥锁。

- **参数**：

    - `mutex`：指向要初始化的互斥锁变量。

    - `attr`：互斥锁属性，传 `NULL` 表示使用默认属性。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码（不设置 `errno`，直接返回错误号）。

### 5.1.2 pthread_mutex_destroy

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_mutex_destroy(pthread_mutex_t *mutex);`

- **功能**：销毁一个互斥锁，释放相关资源。

- **参数**：

    - `mutex`：指向要销毁的互斥锁。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

### 5.1.3 pthread_mutex_lock

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_mutex_lock(pthread_mutex_t *mutex);`

- **功能**：对互斥锁加锁，若锁已被占用则阻塞等待。

- **参数**：

    - `mutex`：指向互斥锁。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

### 5.1.4 pthread_mutex_trylock

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_mutex_trylock(pthread_mutex_t *mutex);`

- **功能**：尝试对互斥锁加锁，若锁已被占用则立即返回（非阻塞）。

- **参数**：

    - `mutex`：指向互斥锁。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：若锁已被占用，返回 `EBUSY`；其他错误返回非零错误码。

### 5.1.5 pthread_mutex_unlock

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_mutex_unlock(pthread_mutex_t *mutex);`

- **功能**：释放互斥锁。

- **参数**：

    - `mutex`：指向互斥锁。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

## 5.2 静态初始化
```c
pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
// 不需要手动 destroy，程序结束自动释放
```

## 5.3 锁的本质

- **锁本身也是临界资源**（所有线程都能看到它）。

- **申请锁的过程必须是原子的**（因为多个线程同时竞争锁）。

- 成功申请到锁的线程继续运行，访问临界区。

- 失败的线程：阻塞挂起，等待锁释放。

## 5.4 锁提供的能力

- 将 **临界区代码的执行从并行变为串行**。

- 持有锁的线程在执行临界区期间，即使被切换走（时间片到、IO等），**其他线程也无法进入临界区**，因为锁还未释放。

- 对于其他线程来说，临界区的执行是 **原子的**（要么没开始，要么已完全结束）。

## 5.5 锁的底层原理（软件实现）

**硬件基础**：大多数体系结构提供 `swap` 或 `exchange` 指令，可以原子地交换寄存器和内存单元的数据。

**伪代码实现**：
```c
// 锁变量 mutex，1 表示未锁，0 表示已锁
lock:
    movb $0, %al
    xchgb %al, mutex      // 原子交换：al <-> mutex
    if (al寄存器的内容 > 0) {
        return 0;         // 成功获得锁
    } else {
        挂起等待;
        goto lock;
    }

unlock:
    movb $1, mutex        // 释放锁
    唤醒等待 mutex 的线程;
    return 0;
```
**理解**：

- 每个线程有自己的寄存器上下文（私有）。

- `xchg` 交换时，内存 `mutex` 的值被交换到线程的 `%al` 寄存器中。

- 如果 `mutex` 原值为 1（未锁），交换后 `mutex` 变为 0，`%al` 得到 1，表示获得锁。

- 如果 `mutex` 原值为 0（已锁），交换后 `%al` 为 0，表示锁被他人持有。

- **因为交换是原子的**，所以不会有两个线程同时得到锁。

## 5.6 硬件级实现

- 更底层：**关闭时钟中断** → 单条指令执行期间不会被中断，保证了原子性。

## 5.7 如果有一个线程不遵守加锁规则会怎样？

- **后果**：它可以直接访问临界资源而不加锁，导致数据不一致。

- **结论**：**所有线程必须遵守同一套加锁/解锁规则**，否则保护无效。

## 5.8 加锁之后，在临界区内部允许线程切换吗？切换了会怎么样？

- **允许切换**。

- **切换了不会出问题**：因为当前线程 **持有锁** 被切换走，锁没有被释放。其他线程在申请锁时会失败（阻塞），无法进入临界区。

- 直到持有锁的线程恢复执行，完成临界区代码并解锁，其他线程才能竞争锁。

- **对外部观察者**：临界区的执行是 **原子的**（要么完全没执行，要么执行完毕）。

## 5.9 锁的粒度与性能

- **加锁粒度太大**：临界区包含大量非必要代码，并发性能下降（串行化过多）。

- **加锁粒度太小**：临界区没有完整保护共享资源，可能出现数据不一致。

- **正确做法**：只保护对临界资源访问的最小必要代码段。

## 5.10 进程间的互斥

- **共享内存（shm）** 可实现进程间共享数据。

- 若需进程间互斥，可将 `pthread_mutex_t` 放在共享内存中，并设置进程共享属性。

- 锁的语义与线程间互斥一致。
```c
// 伪代码示例
pthread_mutex_t *mutex = (pthread_mutex_t *)shmat(...);
pthread_mutexattr_t attr;
pthread_mutexattr_setpshared(&attr, PTHREAD_PROCESS_SHARED);
pthread_mutex_init(mutex, &attr);
```
## 5.11 数据不一致问题的根源总结

| 原因          | 说明             |
| ----------- | -------------- |
| 多线程并发访问共享资源 | 地址空间共享，天然存在    |
| 操作非原子       | 高级语言语句对应多条机器指令 |
| 线程切换时机不可控   | 可能在任意指令之间发生    |
| 缺乏同步/互斥保护   | 没有锁或信号量        |

**解决根本手段**：将临界区代码串行化（加锁），保证操作的原子性。

# 6. 同步引入
## 6.1 纯互斥的问题

回顾之前的“超级自习室”例子（互斥锁）：

- 一个人进入自习室（获得锁），出来（释放锁）。

- 但可能出现 **高频申请钥匙却不做有效动作** 的情况：

    - 某线程：申请锁 → 检查条件不满足 → 立即释放锁 → 立刻又申请锁 → 循环。

- 导致 **其他人得不到钥匙（锁）** → **其他线程饥饿问题**。

## 6.2 互斥没错，但不高效、不公平

- **纯互斥** 在功能上没错，能保证数据安全。

- 但存在两个问题：

    1. **不高效**：线程可能频繁申请/释放锁，却没有实际工作。

    2. **不公平**：某些线程可能长时间无法获得锁（饥饿）。

## 6.3 改进思路（管理员规则）

> 在保证自习室安全的前提下，让所有执行流 **按照一定的顺序访问临界资源**。

- 规则示例：

    - 不能立即申请第二次（退出的人必须排队到队尾）。

    - 外部线程排队，释放锁的人自动排到队列尾部。

**这就是线程同步的雏形：让线程有序访问临界资源，避免饥饿。**

# 7. 线程同步概念

## 7.1 为什么需要条件变量？

- 当一个线程互斥地访问某个变量时，它可能发现：**在其它线程改变状态之前，它什么也做不了**。

- 例如：线程访问一个队列，发现队列为空 → 它只能等待，直到其它线程添加一个节点到队列中。

- **条件变量** 就是用来解决这种“等待某个条件成立”的场景。

## 7.2 同步概念与竞态条件

- **同步**：在保证数据安全的前提下，让线程能够按照某种 **特定的顺序** 访问临界资源，从而有效避免饥饿问题。

- **竞态条件**：多个线程并发访问共享数据，最终结果依赖于线程执行的时序（通常是不期望的结果）。

## 7.3 条件变量的直观理解

- **放苹果的人**：生产者，往篮子里放苹果。

- **队列**：存放苹果的篮子（临界资源）。

- **条件变量**：用于通知“篮子不空”或“篮子不满”的信号机制。

# 8. 条件变量接口详解

## 8.1 初始化和销毁
```c
#include <pthread.h>

int pthread_cond_destroy(pthread_cond_t *cond);
int pthread_cond_init(pthread_cond_t *restrict cond, 
                      const pthread_condattr_t *restrict attr);
                      
// 静态初始化（全局或static变量）
pthread_cond_t cond = PTHREAD_COND_INITIALIZER;
```

### 8.1.1 pthread_cond_init

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_cond_init(pthread_cond_t *restrict cond, const pthread_condattr_t *restrict attr);`

- **功能**：初始化条件变量。

- **参数**：

    - `cond`：指向要初始化的条件变量。

    - `attr`：条件变量属性，传 `NULL` 表示使用默认属性。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

### 8.1.2 pthread_cond_destroy

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_cond_destroy(pthread_cond_t *cond);`

- **功能**：销毁条件变量，释放相关资源。

- **参数**：

    - `cond`：指向要销毁的条件变量。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

### 8.1.3 PTHREAD_COND_INITIALIZER（静态初始化）

- **头文件**：`#include <pthread.h>`

- **原型**：`pthread_cond_t cond = PTHREAD_COND_INITIALIZER;`

- **功能**：静态初始化条件变量（适用于全局变量或 `static` 变量），无需调用 `pthread_cond_init`。

- **参数**：

    - `cond`：条件变量。

- **返回值**：

    - 成功：无返回值（编译期初始化）。

    - 失败：不适用。

## 8.2 等待条件变量
```c
int pthread_cond_wait(pthread_cond_t *restrict cond, 
                      pthread_mutex_t *restrict mutex);
int pthread_cond_timedwait(pthread_cond_t *restrict cond, 
                           pthread_mutex_t *restrict mutex,
                           const struct timespec *restrict abstime);
```
**理解**：

- `pthread_cond_wait` 必须在持有锁的情况下调用。

- 调用时，它会 **原子性地** 做两件事：

    1. 释放锁（让其他线程可以修改条件）。

    2. 阻塞等待条件变量。

- 当被唤醒后，它会 **重新获取锁**，然后返回。

- **为什么必须传入互斥锁？** 因为条件判断（如 `queue == empty`）本身就是访问临界资源，必须在锁保护下进行。如果条件不满足，线程需要休眠，但休眠前必须释放锁，否则会死锁。`pthread_cond_wait` 将这个“释放锁+休眠”操作做成原子的。
### 8.1.1 pthread_cond_wait

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_cond_wait(pthread_cond_t *restrict cond, pthread_mutex_t *restrict mutex);`

- **功能**：等待条件变量，原子性地释放互斥锁并阻塞等待条件变量被唤醒，被唤醒后重新获取互斥锁。

- **参数**：

    - `cond`：指向条件变量。

    - `mutex`：指向已加锁的互斥锁。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

### 8.2.2 pthread_cond_timedwait

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_cond_timedwait(pthread_cond_t *restrict cond, pthread_mutex_t *restrict mutex, const struct timespec *restrict abstime);`

- **功能**：等待条件变量，原子性地释放互斥锁并阻塞，直到条件变量被唤醒或到达指定的绝对时间。

- **参数**：

    - `cond`：指向条件变量。

    - `mutex`：指向已加锁的互斥锁。

    - `abstime`：绝对超时时间（使用系统时钟 `CLOCK_REALTIME`，如 `struct timespec` 指定的时刻）。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：

        - 超时返回 `ETIMEDOUT`。

        - 其他错误返回非零错误码。

## 8.3 唤醒条件变量
```c
int pthread_cond_signal(pthread_cond_t *cond);   // 唤醒一个等待线程
int pthread_cond_broadcast(pthread_cond_t *cond); // 唤醒所有等待线程
```
- `signal`：至少唤醒一个（通常是一个）等待该条件的线程。

- `broadcast`：唤醒所有等待线程。

### 8.3.1 pthread_cond_signal

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_cond_signal(pthread_cond_t *cond);`

- **功能**：唤醒一个等待该条件变量的线程（若有多个等待线程，唤醒其中一个）。

- **参数**：

    - `cond`：指向条件变量。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

### 8.3.2 pthread_cond_broadcast

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_cond_broadcast(pthread_cond_t *cond);`

- **功能**：唤醒所有等待该条件变量的线程。

- **参数**：

    - `cond`：指向条件变量。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

## 8.4 典型使用模式
```c
// 等待线程
pthread_mutex_lock(&mutex);
while (condition_is_false) {        // 用 while，不是 if（防止虚假唤醒）
    pthread_cond_wait(&cond, &mutex);
}
// 条件满足，执行操作
pthread_mutex_unlock(&mutex);

// 唤醒线程（修改条件后）
pthread_mutex_lock(&mutex);
// 修改条件（如添加数据）
condition_is_true = 1;
pthread_cond_signal(&cond);         // 唤醒等待者
pthread_mutex_unlock(&mutex);
```

# 9. 生产者消费者模型
![](/images/posts/xianchengtongbuyuhuchi/02.png)

## 9.1 模型描述

> 经典的多线程通信模型。

- **生产者**：生成数据的线程（如工厂生产商品）。

- **消费者**：处理数据的线程（如用户消费商品）。

- **交易场所**：存放数据的缓冲区（如超市、队列、内存空间）。

## 9.2 “321”原则（快速记忆）
|数字|含义|
|---|---|
|**3** 种关系|生产者-生产者（互斥）、消费者-消费者（互斥）、生产者-消费者（互斥 + 同步）|
|**2** 种角色|生产者线程、消费者线程|
|**1** 个交易场所|以特定结构构成的一块内存空间（临界资源）|

## 9.3 三种关系说明
- **生产者 vs 生产者**：互斥关系。多个生产者不能同时向交易场所放入数据（会冲突）。

- **消费者 vs 消费者**：互斥关系。多个消费者不能同时从交易场所取出数据（会冲突）。

- **生产者 vs 消费者**：

    - **互斥**：不能同时访问交易场所（如放入和取出同时发生会混乱）。

    - **同步**：当交易场所为空时，消费者必须等待生产者；当交易场所满时，生产者必须等待消费者。

## 9.4 为什么需要生产者消费者模型？好处

| 好处         | 解释                                                            |
| ---------- | ------------------------------------------------------------- |
| **解耦**     | 生产过程和消费过程分开，不互相依赖                                             |
| **支持忙闲不均** | 生产者生产快时，缓冲区积压；消费者消费快时，消耗积压；双方速率可不同                            |
| **提高效率**   | 不是体现在入队/出队本身（那部分还是串行的），而是体现在：生产者可以并发生成数据，消费者可以并发处理数据，两者可以重叠执行 |

**效率提升的本质**：生产者线程生产数据（如从网络接收、计算）和消费者线程处理数据（如写入磁盘、发送）可以 **并发执行**，而交易场所只是临时中转。

# 10. 阻塞队列（Blocking Queue）
![](/images/posts/xianchengtongbuyuhuchi/03.png)

## 10.1 阻塞队列定义

> 一种常用于实现生产者消费者模型的数据结构。

- 普通队列 + 容量上限。

- **当队列空**：消费者线程从队列取元素会被阻塞，直到有元素放入。

- **当队列满**：生产者线程往队列放元素会被阻塞，直到有元素被取出。

- 操作基于不同线程，阻塞是线程调度层面的。

## 10.2 为什么等待必须在临界区内进行？
![](/images/posts/xianchengtongbuyuhuchi/04.png)

理解：

> 等待是需要等，什么条件才会等呢？票数为0，等待之前，就要对资源的数量进行判定。
> 判定本身就是访问临界资源！判断一定是在临界区内部的。当前线程是持有锁的！
> 判定结果，也一定在临界资源内部。所以，**条件不满足要休眠，一定是在临界区内休眠的！**

- 条件变量的 `wait` 操作 **必须在锁的保护下调用**。

- 因为条件判断（如 `queue->size == 0`）本身就是对临界资源的访问。

- 如果不在临界区内休眠，就会出现：判断完条件后、休眠前，条件被其他线程改变，导致永远休眠（丢失唤醒）。

## 10.3 阻塞队列伪代码（单生产者单消费者）
```c
// 交易场所：阻塞队列
typedef struct {
    int *buffer;
    int capacity;
    int front, rear, count;
    pthread_mutex_t mutex;
    pthread_cond_t not_full;   // 条件：队列不满
    pthread_cond_t not_empty;  // 条件：队列不空
} block_queue_t;

// 生产者：放入数据
void enqueue(block_queue_t *q, int data) {
    pthread_mutex_lock(&q->mutex);
    while (q->count == q->capacity) {      // 队列满，等待
        pthread_cond_wait(&q->not_full, &q->mutex);
    }
    // 放入数据
    q->buffer[q->rear] = data;
    q->rear = (q->rear + 1) % q->capacity;
    q->count++;
    pthread_cond_signal(&q->not_empty);    // 唤醒等待的消费者
    pthread_mutex_unlock(&q->mutex);
}

// 消费者：取出数据
int dequeue(block_queue_t *q) {
    pthread_mutex_lock(&q->mutex);
    while (q->count == 0) {                // 队列空，等待
        pthread_cond_wait(&q->not_empty, &q->mutex);
    }
    // 取出数据
    int data = q->buffer[q->front];
    q->front = (q->front + 1) % q->capacity;
    q->count--;
    pthread_cond_signal(&q->not_full);     // 唤醒等待的生产者
    pthread_mutex_unlock(&q->mutex);
    return data;
}
```
## 10.4 用 `while` 不用 `if`？

- **虚假唤醒**：条件变量可能在没有被 `signal`/`broadcast` 的情况下醒来（某些实现或信号导致）。

- 使用 `while` 可以重新检查条件，确保条件真正满足。

# 11. 同步与互斥的关系总结

| 概念     | 目标               | 工具                        | 典型问题        |
| ------ | ---------------- | ------------------------- | ----------- |
| **互斥**![](/images/posts/xianchengtongbuyuhuchi/05.png) | 同一时间只有一个线程访问临界资源 | 互斥锁（pthread_mutex_t）      | 数据不一致、竞态条件  |
| **同步** | 线程按特定顺序访问资源，避免饥饿 | 条件变量（pthread_cond_t）+ 互斥锁 | 空队列等待、满队列等待 |

- **互斥是同步的基础**：条件变量的 `wait` 必须配合锁使用。

- **同步是对互斥的补充**：纯互斥可能导致饥饿，同步让等待变得有序。
