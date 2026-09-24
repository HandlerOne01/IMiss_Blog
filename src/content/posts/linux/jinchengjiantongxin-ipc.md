---
title: "进程间通信（IPC）"
published: 2026-04-08 11:50:07
description: "数据传输：一个进程需要将它的数据发送给另一个进程。"
category: "Linux 系统"
tags: ["Linux 系统"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. 理解层面

## 1.1 为什么要进程间通信？

- **数据传输**：一个进程需要将它的数据发送给另一个进程。

- **资源共享**：多个进程之间共享同样的资源。

- **通知事件**：一个进程需要向另一个或一组进程发送消息，通知它（它们）发生了某种事件（如进程终止时要通知父进程）。

- **进程控制**：有些进程希望完全控制另一个进程的执行（如 Debug 进程），此时控制进程希望能够拦截另一个进程的所有陷入和异常，并能够及时知道它的状态改变。

## 1.2 怎么通信？

**进程间通信的本质**：先让不同的进程看到同一份资源（内存），然后才有通信的条件。

- 不是由任何一个进程提供资源，而是由**操作系统**提供。

- 操作系统通过**系统调用**暴露接口，设计统一的通信方案。

## 1.3 什么是通信？

进程间通信（IPC，Inter-Process Communication）是指运行在同一台计算机或不同计算机上的多个进程之间进行数据交换和通信的技术。由于每个进程都有自己的地址空间，它们无法直接访问彼此的数据，因此需要通过特定的机制来实现通信。IPC 是操作系统和多进程编程中的一个重要概念，广泛应用于分布式系统、多任务操作系统以及各种应用程序之间。

# 2. 匿名管道

- 基于已有的文件技术，直接进行通信。

- 父子进程通过继承文件描述符表来共享同一个管道文件。

- 管道是内存级的文件，不需要刷盘，与磁盘无关。

## 2.1 原理

1. **父进程创建管道**：调用 `pipe()` 系统调用，获得两个文件描述符：

    - `fd[0]`：读端

    - `fd[1]`：写端

    - 管道是一个内存级的特殊文件，由操作系统专门设计。

2. **父进程 fork 出子进程**：子进程继承父进程的文件描述符表，因此父子进程都拥有相同的读端和写端。

3. **关闭不需要的端**：

    - 父进程关闭读端 `fd[0]`，保留写端。

    - 子进程关闭写端 `fd[1]`，保留读端。

    - 从而实现**单向通信**（父写子读）。

**为什么能保证两个进程打开的是同一个管道文件？**
子进程继承父进程的文件描述符表，因此它们指向内核中同一个 `struct file` 对象（引用计数增加）。这个 `struct file` 指向内存中的管道缓冲区（通过 `inode` 和页缓存）。

**管道文件的内核结构**：

- 每个 `struct file` 包含 `f_mode`、`f_pos`、`f_flags`、`f_count`、`f_inode`、`f_op` 等字段。

- `f_inode` 指向的 `inode` 包含管道特有的操作函数（`pipefifo_fops`）和数据页。

- 写操作通过 `write` 系统调用将数据写入管道缓冲区，读操作通过 `read` 从缓冲区读取数据。

## 2.2 demo 代码
```cpp
#include <unistd.h>
#include <stdio.h>

int main() {
    int fds[2];
    int ret = pipe(fds);
    if (ret == -1) {
        perror("pipe");
        return 1;
    }
    printf("fds[0]: %d\n", fds[0]); // 读端
    printf("fds[1]: %d\n", fds[1]); // 写端
    return 0;
}
```

**运行结果**
```txt
fds[0]: 3
fds[1]: 4
```

## 2.3 5 种特性

1. **只能用于具有血缘关系的进程**（通常是父子进程）。

2. **自带同步机制**：读写操作会按照管道空/满自动阻塞。

3. **面向字节流**：数据是无边界的字节序列。

4. **单向通信（半双工）**：一端读一端写，任何时刻只能单向传输；若要全双工需要两个管道。

5. **生命周期随进程**：当所有指向管道的文件描述符关闭后，管道被销毁。

## 2.4  4种通信情况

1. **写慢读快**：读端会阻塞等待数据。

2. **写快读慢**：当管道缓冲区满时，写端会阻塞等待读端读取。

3. **写端关闭，读端继续读**：`read` 返回 0，表示文件结束（EOF）。

4. **读端关闭，写端继续写**：操作系统会向写进程发送信号 `SIGPIPE`（信号编号 13），终止写进程（因为写已无意义）。

验证方式：可以编写程序让父子进程分别休眠或大量读写，观察阻塞和信号行为。

## 2.5 管道的容量与原子性

- **容量**：在 Linux 上，管道的缓冲区大小通常为 65536 字节（可通过 `fcntl` 调整）
	`65536 ÷ 1024 = 64 KB`
- **原子性**：POSIX 规定，写入数据量小于 `PIPE_BUF`（Linux 上为 4096 字节）时，保证 write 是原子的，即不会与其他进程的写交错

## 2.6 基于匿名管道实现进程池

通过父进程写任务码，子进程读任务码来执行不同任务，实现简单的进程池。

示例代码框架：
```txt
// 父进程创建多个管道，fork 多个子进程，每个子进程保留读端，父进程保留所有写端
// 父进程根据任务类型向指定子进程的管道写入任务码
// 子进程从管道读取任务码并执行
```
注意：需要确保父进程正确管理所有管道的写端，避免文件描述符泄漏（例如倒着关闭无用端）。

# 3. 命名管道

## 3.1 为什么需要命名管道？

匿名管道只能用于具有血缘关系的进程，对于不相关的两个进程，如何通信？
答案：通过打开同一个路径下的同一个文件，让不同进程看到同一份资源。

**命名管道**（FIFO）就是这样一个有路径、有名字的管道文件，它只存在于内存中（但文件系统中有对应的 inode），不需要刷新到磁盘。

##### 原理

- 使用 `mkfifo()` 系统调用创建一个命名管道文件（特殊类型）。

- 不相关的进程可以通过打开同一个 FIFO 文件来获得管道的读端或写端。

- 内核中，对同一个 FIFO 的多次打开会指向同一个管道缓冲区对象。

- 特性与匿名管道一致（面向字节流、自带同步、半双工等），只是创建和使用方式不同。

##### 代码示例

**写端进程**：
```c
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

int main() {
    mkfifo("myfifo", 0666); // 创建命名管道
    int fd = open("myfifo", O_WRONLY);
    write(fd, "hello", 5);
    close(fd);
    unlink("myfifo"); // 删除管道文件
    return 0;
}
```

**读端进程**：
```c
int fd = open("myfifo", O_RDONLY);
char buf[128];
read(fd, buf, sizeof(buf));
close(fd);
```
- 两个不相关进程通过相同的路径 `myfifo` 实现了通信。

# 4. System V IPC - 共享内存

**IPC（Inter-Process Communication，进程间通信）** 是指操作系统提供的让不同进程之间交换数据或信号的机制。System V IPC 是其中一套经典的实现，包括：

- 消息队列（Message Queue）

- 信号量（Semaphore）

- 共享内存（Shared Memory）

这些 IPC 资源在内核中统一管理，通过 **key** 来唯一标识，并提供了相似的接口（如 `xxxget`、`xxxctl`）和命令行工具（`ipcs`、`ipcrm`）。

## 4.1 共享内存的原理

共享内存允许两个或多个进程共享一个给定的内存区域，是最快的 IPC 形式，因为数据不需要在进程间复制。

**本质**：让不同进程的虚拟地址空间映射到同一块物理内存。

**步骤**：

1. 在物理内存中分配一块共享内存。

2. 通过页表将这块物理内存映射到进程 A 的虚拟地址空间中的某个区域。

3. 同样地，也映射到进程 B 的虚拟地址空间。

4. 当进程 A 写入数据时，进程 B 可以直接看到。

所有这些工作由操作系统完成，通过系统调用接口。

## 4.2 共享内存的管理

操作系统中可能同时存在多个共享内存，因此需要管理它们。内核通过**先描述，再组织**的方式管理共享内存：

- 每个共享内存对应一个内核数据结构（如 `struct shmid_kernel`）。

- 该结构包含：权限、大小、引用计数、映射的物理页等信息。

- 进程通过 `shmid`（共享内存标识符）来操作对应的共享内存。

## 4.3 生命周期随内核

共享内存的一个关键特性：**生命周期随内核**。
    进程退出不会自动释放共享内存，必须显式删除。

## 4.4 删除共享内存的两种方式

### 4.4.1使用命令行工具
```bash
# ❌ 错误：不能直接使用key删除
whb@bite:~/code/merge_class/lesson25/shm$ ipcrm -m 0x660135b2
ipcrm: failed to parse argument: '0x660135b2'

# ✅ 正确：使用shmid删除
whb@bite:~/code/merge_class/lesson25/shm$ ipcrm -m 1
whb@bite:~/code/merge_class/lesson25/shm$ ipcs -m  # 验证删除成功

------ Shared Memory Segments --------
key        shmid      owner      perms      bytes      nattch     status
```
**重要理解**：

- `key` 仅用于内核区分唯一性，用于`shmget()`创建/获取

- `shmid` 是用户空间操作共享内存的句柄

- `ipcrm` 运行在用户空间，必须使用`shmid`

### 4.4.2 代码中显式删除 - shmctl()
```c
#include <sys/types.h>
#include <sys/shm.h>

int shmctl(int shmid, int cmd, struct shmid_ds *buf);

// 使用示例
shmctl(shmid, IPC_RMID, NULL);  // 标记共享内存为删除
```

## 4.5 共享内存的挂接与虚拟地址

### 4.5.1 shmat() - 挂接共享内存
```c
#include <sys/types.h>
#include <sys/shm.h>

void *shmat(int shmid, const void *shmaddr, int shmflg);
```
**参数详解**：

- `shmid`：共享内存标识符（由`shmget()`返回）

- `shmaddr`：挂接的起始虚拟地址

    - 传`NULL`：让内核自动选择合适的地址（推荐）

    - 传具体地址：尝试在指定地址挂接（通常不这么做）

- `shmflg`：标志位

    - `0`：使用默认设置（可读可写）

    - `SHM_RDONLY`：只读挂接

**返回值**：

- 成功：返回挂接后的虚拟地址（类似于`malloc`返回的地址）

- 失败：返回`(void *)-1`

### 4.5.1 共享内存的地址空间理解
```c
// 类比理解：shmat vs malloc
void *malloc(size_t size);     // 堆上分配内存
void *shmat(int shmid, ...);    // 将共享内存挂接到进程地址空间

// 共享内存位于进程地址空间的共享区
```

```txt
进程虚拟地址空间布局：
+------------------+ 高地址
|      栈区        |
+------------------+
|        |         |
|      共享区       |  <-- shmat返回的地址在这里
|        |         |
+------------------+
|      堆区        |
+------------------+
|     数据段       |
+------------------+
|     代码段       |
+------------------+ 低地址
```
## 4.6 共享内存是最快的IPC
```c
// 进程A
void *addr = shmat(shmid, NULL, 0);
sprintf(addr, "Hello, this is process A");  // 直接写入，无系统调用

// 进程B
void *addr = shmat(shmid, NULL, 0);
printf("Received: %s\n", (char*)addr);      // 直接读取，无系统调用
```
**速度快的两大原因**：

1. **零拷贝**：数据直接在共享内存中读写，不需要在用户态和内核态之间复制

2. **无系统调用**：挂接后，读写操作在用户空间完成，不陷入内核

对比其他IPC：

- 管道：需要`write()`/`read()`系统调用，数据需在内核缓冲区拷贝

- 消息队列：需要`msgsnd()`/`msgrcv()`系统调用

- 共享内存：挂接后直接读写内存

## 4.7 共享内存的缺点
```c
// 问题：没有同步机制
// 进程A
strcpy(shm_addr, "long message...");  // 写入一半...

// 进程B
printf("%s", shm_addr);  // 读取到不完整的数据！
```
**缺乏同步机制**：

- 多个进程同时读写会造成数据不一致

- 需要程序员自行使用信号量等机制保护

## 4.8 共享内存大小必须是4KB(4096)的整数倍
```c
// 关键特性：共享内存大小必须是4KB(4096)的整数倍
int shmid = shmget(key, 4097, IPC_CREAT | 0644);
// 实际分配的大小：8192字节（向上取整到4KB的倍数）

// 验证
struct shmid_ds ds;
shmctl(shmid, IPC_STAT, &ds);
printf("实际大小: %ld\n", ds.shm_segsz);  // 输出8192，不是4097
```

## 4.9 共享内存编程步骤
共享内存编程遵循固定的流程：**创建/获取 → 挂接 → 使用 → 脱接 → 删除/控制**
```c
// 完整流程示意图
ftok() → shmget() → shmat() → 读写操作 → shmdt() → shmctl(IPC_RMID)
  ↓          ↓         ↓           ↓         ↓           ↓
生成key   创建/获取  挂接到进程  使用共享  从进程    删除共享
          共享内存   地址空间     内存     脱接       内存
```

### 4.9.1 步骤1：生成唯一键值 - ftok()

不同进程需要约定一个共同的 key 来标识同一块共享内存。常用函数 `ftok`：
```c
#include <sys/types.h>
#include <sys/ipc.h>

key_t ftok(const char *pathname, int proj_id);
```

- `pathname`：一个存在的文件路径（唯一性保证）。

- `proj_id`：项目 ID，一个字符（低 8 位）。

- 返回值：基于文件 inode 和 proj_id 生成的 key 值。

```c
// 示例：生成key
key_t key = ftok("./", 0x66);  // 使用当前目录和项目ID 0x66
if (key == -1) {
    perror("ftok");
    exit(1);
}
printf("生成的key: 0x%x\n", key);
```

### 4.9.2 步骤2：创建/获取共享内存 - shmget()
```c
#include <sys/shm.h>

int shmget(key_t key, size_t size, int shmflg);
```
- `key`：由 `ftok` 生成的 key，或使用 `IPC_PRIVATE`（创建私有共享内存，通常用于父子进程）。

- `size`：共享内存大小（字节），一般按页对齐。

- `shmflg`：标志位，如 `IPC_CREAT`（不存在则创建，存在则打开）、`IPC_EXCL`（与 `IPC_CREAT` 一起使用，若已存在则出错返回）。

- 返回值：成功返回共享内存标识符 `shmid`，失败返回 -1。

**注意**：`key` 用于在用户层约定，内核用 `shmid` 来管理。
```c
// 示例1：创建新的共享内存
int shmid = shmget(key, 4096, IPC_CREAT | IPC_EXCL | 0644);
if (shmid == -1) {
    if (errno == EEXIST) {
        printf("共享内存已存在，尝试获取\n");
        shmid = shmget(key, 0, 0);  // 获取已存在的
    } else {
        perror("shmget");
        exit(1);
    }
}

// 示例2：获取已存在的共享内存
int shmid = shmget(key, 0, 0);  // size传0，flags传0表示获取已存在的
if (shmid == -1) {
    perror("shmget");
    exit(1);
}
```

### 4.9.3 步骤3：挂接共享内存 - shmat()
```c
#include <sys/types.h>
#include <sys/shm.h>

void *shmat(int shmid, const void *shmaddr, int shmflg);
```
**参数详解**：

- `shmid`：共享内存标识符（由`shmget()`返回）

- `shmaddr`：挂接的起始虚拟地址

    - 传`NULL`：让内核自动选择合适的地址（推荐）

    - 传具体地址：尝试在指定地址挂接（通常不这么做）

- `shmflg`：标志位

    - `0`：使用默认设置（可读可写）

    - `SHM_RDONLY`：只读挂接

**返回值**：

- 成功：返回挂接后的虚拟地址（类似于`malloc`返回的地址）

- 失败：返回`(void *)-1

```c
// 示例：挂接共享内存
char *shm_addr = (char*)shmat(shmid, NULL, 0);
if (shm_addr == (char*)-1) {
    perror("shmat");
    exit(1);
}
printf("共享内存挂接在地址: %p\n", shm_addr);
```

### 4.9.4 步骤4：使用共享内存（读写操作）
```c
// 写入数据
strcpy(shm_addr, "Hello, this is a message in shared memory!");

// 读取数据
printf("从共享内存读取: %s\n", shm_addr);

// 复杂数据结构示例
struct Data {
    int id;
    char name[32];
    float score;
};

struct Data *p = (struct Data*)shm_addr;
p->id = 1001;
strcpy(p->name, "张三");
p->score = 95.5;
```

### 4.9.5 步骤5：脱接共享内存 - shmdt()
```c
#include <sys/shm.h>

int shmdt(const void *shmaddr);
```
**参数**：

- `shmaddr`：shmat返回的地址

**返回值**：

- 成功：返回0

- 失败：返回-1
```c
// 示例：脱接共享内存
if (shmdt(shm_addr) == -1) {
    perror("shmdt");
    exit(1);
}
printf("共享内存脱接成功\n");
```

### 4.9.6 步骤6：控制/删除共享内存 - shmctl()
```c
int shmctl(int shmid, int cmd, struct shmid_ds *buf);
```
**常用命令**：

- `IPC_STAT`：获取共享内存的状态信息

- `IPC_SET`：设置共享内存的属性

- `IPC_RMID`：删除共享内存（标记删除）
```c
// 示例1：删除共享内存
if (shmctl(shmid, IPC_RMID, NULL) == -1) {
    perror("shmctl IPC_RMID");
    exit(1);
}

// 示例2：获取共享内存信息
struct shmid_ds ds;
if (shmctl(shmid, IPC_STAT, &ds) == -1) {
    perror("shmctl IPC_STAT");
    exit(1);
}
printf("共享内存大小: %ld\n", ds.shm_segsz);
printf("当前挂接数: %ld\n", ds.shm_nattch);
printf("创建者PID: %d\n", ds.shm_cpid);
```

#### 4.9.6.1 shmid_ds 数据结构
```c
struct shmid_ds {
    struct ipc_perm shm_perm;    /* 所有权和权限 */
    size_t          shm_segsz;   /* 段大小（字节） */
    time_t          shm_atime;   /* 最后挂接时间 */
    time_t          shm_dtime;   /* 最后脱接时间 */
    time_t          shm_ctime;   /* 最后改变时间 */
    pid_t           shm_cpid;    /* 创建者的PID */
    pid_t           shm_lpid;    /* 最后shmat/shmdt的PID */
    shmatt_t        shm_nattch;  /* 当前挂接数 */
    ...
};

struct ipc_perm {
    key_t          __key;    /* shmget使用的key */
    uid_t          uid;      /* 所有者的有效UID */
    gid_t          gid;      /* 所有者的有效GID */
    uid_t          cuid;     /* 创建者的有效UID */
    gid_t          cgid;     /* 创建者的有效GID */
    unsigned short mode;     /* 权限标志 */
    unsigned short __seq;    /* 序列号 */
};
```

#### 4.9.3.2 使用示例：获取共享内存信息
```c
#include <stdio.h>
#include <sys/shm.h>
#include <sys/ipc.h>

void print_shm_info(int shmid) {
    struct shmid_ds ds;
    
    if (shmctl(shmid, IPC_STAT, &ds) == -1) {
        perror("shmctl");
        return;
    }
    
    printf("共享内存信息：\n");
    printf("  key: 0x%x\n", ds.shm_perm.__key);
    printf("  大小: %ld 字节\n", ds.shm_segsz);
    printf("  当前挂接数: %ld\n", ds.shm_nattch);
    printf("  创建者PID: %d\n", ds.shm_cpid);
    printf("  最后操作PID: %d\n", ds.shm_lpid);
    printf("  权限: %o\n", ds.shm_perm.mode);
    printf("  最后挂接时间: %ld\n", ds.shm_atime);
    printf("  最后脱接时间: %ld\n", ds.shm_dtime);
}
```

## 4.10 共享内存指令
### 4.10.1 `ipcs` 命令 - 显示进程间通信设施状态

**语法**：`ipcs [选项]`
**功能**：显示系统的进程间通信（IPC）设施信息，包括共享内存、消息队列和信号量
```bash
[user@host ~]$ ipcs

------ Message Queues --------
key        msqid      owner      perms      used-bytes   messages    

------ Shared Memory Segments --------
key        shmid      owner      perms      bytes      nattch     status      
0x00000000 0          root       600        4194304    6          dest         
0x00000000 32769      root       600        67108864   6          dest         
0x00000000 65538      root       600        524288     6          dest         

------ Semaphore Arrays --------
key        semid      owner      perms      nsems     
0x00000000 0          root       600        1         
0x00000000 32769      root       600        1
```
**常用选项**：

- `-m`：显示共享内存信息

- `-q`：显示消息队列信息

- `-s`：显示信号量信息

- `-a`：显示所有IPC设施（默认）

- `-l`：显示系统限制

- `-u`：显示摘要信息

- `-t`：显示时间信息

- `-p`：显示进程ID信息

### 4.10.2 `ipcrm` 命令 - 移除进程间通信设施

**语法**：`ipcrm [选项]`
**功能**：移除（删除）系统的进程间通信（IPC）设施，包括共享内存、消息队列和信号量
```bash
[user@host ~]$ ipcrm -m 32769
```
**常用选项**：

- `-m shmid`：移除指定的共享内存段（通过shmid）

- `-M shmkey`：移除指定的共享内存段（通过key值）

- `-q msqid`：移除指定的消息队列（通过msqid）

- `-Q msgkey`：移除指定的消息队列（通过key值）

- `-s semid`：移除指定的信号量数组（通过semid）

- `-S semkey`：移除指定的信号量数组（通过key值）

- `-a`：移除所有IPC设施（慎用！）

**示例**：
```bash
ipcrm -m 65538        # 移除shmid为65538的共享内存
ipcrm -M 0x00000000   # 移除key值为0x00000000的共享内存
ipcrm -q 1234         # 移除msqid为1234的消息队列
ipcrm -s 5678         # 移除semid为5678的信号量数组
ipcrm -a              # 移除所有IPC设施（需要超级用户权限）
```
**说明**：
- 通常需要先使用`ipcs`命令查看当前系统中的IPC设施及其ID

- 移除IPC设施可能需要适当的权限（通常需要是创建者或超级用户）

- 谨慎使用`-a`选项，它会删除所有IPC设施，可能影响正在运行的应用程序
## 4.11 小小总结

- **持久性**：共享内存随内核持续，除非显式删除或系统重启。

- **同步问题**：共享内存本身不提供同步机制，需要配合信号量等使用。

- **速度最快**：因为避免了数据拷贝。

# 5. System V - 消息队列

## 5.1 概念

消息队列提供了一种**一个进程给另一个进程发送有类型数据块**的方式。它本质上是一个由内核维护的队列，多个进程可以向队列中写入消息，也可以从队列中读取消息。消息带有类型，允许接收方按类型读取。

- **IPC：看到同一份资源 → 维护成为一个队列**

- 内核需要对消息队列进行管理，遵循“先描述，再组织”的原则。

- 两个进程要看到同一个消息队列，需要通过 **key** 来标识。

## 5.2 接口与系统调用

### 5.2.1 ftok() - 生成 key
```c
#include <sys/types.h>
#include <sys/ipc.h>

key_t ftok(const char *pathname, int proj_id);
```
- `ftok` 用于根据路径名和项目 ID 生成一个唯一的键值（key_t）。这体现了 System V 标准。

### 5.2.2 msgget() - 创建或获取消息队列
```c
#include <sys/types.h>
#include <sys/ipc.h>
#include <sys/msg.h>

int msgget(key_t key, int msgflg);
```
- 返回一个消息队列标识符（msqid）。

- `msgflg` 可包含 `IPC_CREAT` 和 `IPC_EXCL` 等标志，用于控制创建行为。

### 5.2.3 msgctl() - 控制消息队列
```c
int msgctl(int msqid, int cmd, struct msqid_ds *buf);
```
- 常用命令：

    - `IPC_RMID`：立即删除消息队列。

    - `IPC_STAT`：获取内核中的 `msqid_ds` 结构，拷贝到 `buf` 中。

### 5.2.4 msgsnd() 与 masgrcv() - 发送和接收消息
```c
#include <sys/types.h>
#include <sys/ipc.h>
#include <sys/msg.h>

int msgsnd(int msqid, const void *msgp, size_t msgsz, int msgflg);
ssize_t msgrcv(int msqid, void *msgp, size_t msgsz, long msgtyp, int msgflg);
```
- `msgp` 指向一个消息缓冲区，其结构通常定义为：
```c
struct msgbuf {
    long mtype;       /* 消息类型，必须大于 0 */
    char mtext[1];    /* 消息数据（实际可以更大） */
};
```
- **细节**：`msgsz` 一般指消息正文（mtext）的大小，不包括消息类型。

## 5.3 数据结构
### 5.3.1 msqid_ds 结构
```c
struct msqid_ds {
    struct ipc_perm msg_perm;  /* 所有权和权限 */
    time_t          msg_stime;  /* 最后一次 msgsnd(2) 的时间 */
    time_t          msg_rtime;  /* 最后一次 msgrcv(2) 的时间 */
    time_t          msg_ctime;  /* 最后一次修改的时间 */
    unsigned long   __msg_cbytes; /* 队列中当前字节数（非标准） */
    msgqnum_t       msg_qnum;  /* 队列中当前消息数量 */
    msglen_t        msg_qbytes; /* 队列中允许的最大字节数 */
    pid_t           msg_lspid;  /* 最后一次执行 msgsnd(2) 的进程 PID */
    pid_t           msg_lrpid;  /* 最后一次执行 msgrcv(2) 的进程 PID */
};
```
### 2.3.2 `ipc_perm` 结构（通用权限结构）
```c
struct ipc_perm {
    key_t          __key;       /* 提供给 msgget(2) 的键值 */
    uid_t          uid;         /* 所有者的有效用户ID */
    gid_t          gid;         /* 所有者的有效组ID */
    uid_t          cuid;        /* 创建者的有效用户ID */
    gid_t          cgid;        /* 创建者的有效组ID */
    unsigned short mode;        /* 权限 */
    unsigned short __seq;       /* 序列号 */
};
```

## 5.4 命令行工具

### 5.4.1 ipcs -q 查看消息队列
```bash
ipcs -q
```
输出示例：
```txt
------ Message Queues --------
key        msqid      owner      perms      used-bytes   messages
```

### 5.4.2 ipcrm -q msqid 删除消息队列
```bash
ipcrm -q msqid
```

# 6. 信号量
## 6.1 引入

共享内存允许多个进程直接访问同一块物理内存，是速度最快的 IPC 方式。但多个进程同时读写同一块内存会导致**数据不一致**的问题。

**解决方案：信号量**

信号量是一种用于同步的机制，可以保护共享资源。基本思想：

- **临界资源**：被保护起来的共享资源。

- **临界区**：访问临界资源的代码段。

- **原子性**：操作要么全部执行，要么完全不执行。

- **互斥**：任何时刻只允许一个执行流访问临界资源。

## 6.2 概念

- 信号量是一个计数器，用于描述临界资源中资源的数量。

- 进程访问临界资源前必须先申请信号量（预订机制）。

- 如果信号量值为 0，进程可能阻塞等待。

**二元信号量**：值只有 0 和 1，用于实现互斥。

**多元信号量**：值大于 1，表示有多个同类资源。

## 6.3 操作

- **P 操作**（申请资源）：`sem--`，若结果小于 0 则阻塞。

- **V 操作**（释放资源）：`sem++`，唤醒等待的进程。

P、V 操作必须保证原子性。

## 6.4 接口与系统调用

### 6.4.1 semget() - 创建或获取信号量集
```c
#include <sys/types.h>
#include <sys/ipc.h>
#include <sys/sem.h>

int semget(key_t key, int nsems, int semflg);
```
- `nsems`：信号量集中信号量的个数。

- 返回信号量集标识符（semid）。

### 6.4.2 semctl() - 控制信号量集
```c
int semctl(int semid, int semnum, int cmd, ...);
```
- 常用命令：

    - `IPC_RMID`：立即删除信号量集。

    - `SETVAL`：设置第 `semnum` 个信号量的值。

- 第四个参数是可选联合体 `semun`：
```c
union semun {
    int              val;    /* 用于 SETVAL 的值 */
    struct semid_ds *buf;    /* 用于 IPC_STAT, IPC_SET 的缓冲区 */
    unsigned short  *array;  /* 用于 GETALL, SETALL 的数组 */
    struct seminfo  *__buf;  /* 用于 IPC_INFO 的缓冲区（Linux 特有） */
};
```
### 6.4.3 semop() - 信号量操作（P/V）
```c
int semop(int semid, struct sembuf *sops, size_t nsops);
```
- `sops` 指向一个操作数组：
```c
struct sembuf {
    unsigned short sem_num;  /* 信号量编号（从0开始） */
    short          sem_op;   /* 信号量操作：+1 表示 V 操作，-1 表示 P 操作 */
    short          sem_flg;  /* 操作标志（例如 IPC_NOWAIT） */
};
```
- `nsops` 是数组元素个数。
## 6.5 数据结构
### 6.5.1 semid_ds 结构
```c
struct semid_ds {
    struct ipc_perm sem_perm;  /* 所有权和权限 */
    time_t          sem_otime;  /* 最后一次 semop 操作的时间 */
    time_t          sem_ctime;  /* 最后一次修改的时间 */
    unsigned long   sem_nsems;  /* 信号量集合中的信号量个数 */
};
```
### 6.5.2 内核中的信号量表示
```c
/* 系统中每个信号量对应一个 sem 结构 */
struct sem {
    int semval;        /* 当前值 */
    int sempid;        /* 最后一次操作的进程 PID */
};

/* 系统中每个信号量集合对应一个 sem_array 数据结构 */
struct sem_array {
    struct kern_ipc_perm sem_perm;  /* 权限（参见 ipc.h） */
    int sem_id;
    time_t sem_otime;      /* 最后一次 semop 操作的时间 */
    time_t sem_ctime;      /* 最后一次修改的时间 */
    struct sem *sem_base;      /* 指向数组中第一个信号量的指针 */
    struct sem_queue *sem_pending;    /* 待处理的操作队列 */
    struct sem_queue **sem_pending_last; /* 最后一个待处理的操作 */
    struct sem_undo *undo;          /* 对此数组的撤销请求 */
    unsigned long sem_nsems;      /* 数组中的信号量个数 */
};
```

## 6.6 命令行工具

### 6.6.1 查看信号量集：
```bash
ipcs -s
```
### 6.6.2 删除信号量集
```bash
ipcrm -s semid
```

# 7. System V IPC 内核组织

## 7.1 统一管理结构

内核将消息队列、信号量、共享内存视为同一类 IPC 资源，使用相似的数据结构进行管理。核心结构包括：

### 7.1.1 `ipc_ids` 结构
```c
struct ipc_ids {
    int in_use;
    int max_id;
    unsigned short seq;
    unsigned short seq_max;
    struct mutex mutex;
    struct ipc_id_ary nullentry;
    struct ipc_id_ary* entries;
};
```
- `entries` 指向一个 `ipc_id_ary` 结构，其中包含了指向 `kern_ipc_perm` 的指针数组。

### 7.1.2 `ipc_id_ary` 结构
```c
struct ipc_id_ary {
    int size;
    struct kern_ipc_perm* p[0];   /* 柔性数组 */
};
```
- 柔性数组用于动态扩展，实际上 `p` 是一个指针数组，每个元素指向一个具体的 IPC 资源对象（如 `msg_queue`、`sem_array`、`shmid_kernel`）。

- 通过这种设计，可以用数组下标（即 `msqid`、`semid`、`shmid`）快速访问对应的 `kern_ipc_perm`。

### 7.1.3 通用权限结构 `kern_ipc_perm`
```c
struct kern_ipc_perm
{
    spinlock_t lock;
    int deleted;
    key_t key;
    uid_t uid;
    uid_t cuid;
    gid_t gid;
    gid_t cgid;
    mode_t mode;
    unsigned long seq;
    void *security;
};
```
- 该结构嵌入在每个 IPC 资源的具体结构中，用于标识权限和 key。

## 7.2 三种资源的具体结构

#### 7.2.1 消息队列
```c
struct msq_queue {
    struct kern_ipc_perm q_perm;   /* 内核IPC权限结构 */
    int q_id;                       /* 队列ID */
    time_t q_stime;                  /* 最后一次 msgsnd 的时间 */
    time_t q_rtime;                  /* 最后一次 msgrcv 的时间 */
    time_t q_ctime;                  /* 最后一次修改的时间 */
    unsigned long q_cbytes;          /* 队列当前字节数 */
    unsigned long q_qnum;            /* 队列中消息数量 */
    unsigned long q_qbytes;          /* 队列允许的最大字节数 */
    pid_t q_lspid;                   /* 最后一次执行 msgsnd 的进程PID */
    pid_t q_lrpid;                   /* 最后一次执行 msgrcv 的进程PID */

    struct list_head q_messages;     /* 消息链表头 */
    struct list_head q_receivers;    /* 接收进程等待队列链表头 */
    struct list_head q_senders;      /* 发送进程等待队列链表头 */
};
```
### 7.2.2 信号量集

前面已给出 `sem_array` 和 `sem` 结构。

### 7.2.3 共享内存
```c
struct shmid_kernel /* 内核私有结构 */
{
    struct kern_ipc_perm shm_perm;   /* 内核IPC权限结构 */
    struct file *shm_file;            /* 映射的文件对象 */
    int id;                           /* 共享内存标识符 */
    unsigned long shm_nattch;         /* 当前附加的进程数量 */
    unsigned long shm_segsz;          /* 段大小（字节） */
    time_t shm_atim;                   /* 最后一次附加的时间 */
    time_t shm_dtim;                   /* 最后一次分离的时间 */
    time_t shm_ctim;                   /* 最后一次修改的时间 */
    pid_t shm_cprid;                   /* 创建者的进程PID */
    pid_t shm_lprid;                   /* 最后一次操作的进程PID */
    struct user_struct *mlock_user;    /* 锁定内存的用户 */
};
```
## 7.3 设计思想

- **先描述，再组织**：每种资源都有对应的数据结构，内核通过链表或数组组织起来。

- **统一管理**：通过 `ipc_ids` 和 `kern_ipc_perm` 实现多态，C 语言模拟面向对象。

- **key 的作用**：全局唯一标识，供用户空间指定同一资源。

- **柔性数组**：`ipc_id_ary.p[0]` 用于动态扩展，类似 `struct XXX { int cnt; char buffer[0]; }` 的技巧。

# 8. 内存管理相关结构

以下是进程地址空间和虚拟内存区域的内核表示，用于理解共享内存的映射。
```c
struct mm_struct {
    struct vm_area_struct *mmap;          /* 虚拟内存区域链表 */
    struct rb_root mm_rb;                  /* 虚拟内存区域红黑树根 */
    struct vm_area_struct *mmap_cache;     /* 最近使用的虚拟内存区域缓存 */
    unsigned long (*get_unmapped_area) (struct file *, unsigned long, unsigned long, unsigned long, unsigned long);  /* 获取未映射区域的函数 */
    unsigned long mmap_base;                /* 内存映射基地址 */
    unsigned long task_size;                /* 进程地址空间大小 */
    unsigned long cached_hole_size;         /* 缓存空洞大小 */
    unsigned long free_area_cache;          /* 空闲区域缓存 */
    pgd_t *pgd;                             /* 页全局目录 */
    atomic_t mm_users;                      /* 使用该地址空间的用户数 */
    atomic_t mm_count;                      /* 主引用计数 */
    // ...
};

struct vm_area_struct {
    struct mm_struct *vm_mm;                /* 所属的地址空间 */
    unsigned long vm_start;                 /* 在 vm_mm 中的起始地址 */
    unsigned long vm_end;                    /* 在 vm_mm 中的结束地址后的第一个字节 */

    /* 每个任务的虚拟内存区域链表，按地址排序 */
    struct vm_area_struct *vm_next;          /* 下一个虚拟内存区域 */

    pgprot_t vm_page_prot;                    /* 该虚拟内存区域的访问权限 */
    unsigned long vm_flags;                    /* 标志位，见下文 */

    struct rb_node vm_rb;                      /* 红黑树节点 */
    union {
        struct {
            struct list_head list;
            void *parent; /* 与 prio_tree_node parent 对齐 */
            struct vm_area_struct *head;
        } vm_set;

        struct raw_prio_tree_node prio_tree_node;
    } shared;                                   /* 共享区域相关 */
    struct list_head anon_vma_node;             /* 由 anon_vma->lock 序列化 */
    struct anon_vma *anon_vma;                  /* 由 page_table_lock 序列化 */
    unsigned long vm_pgoff;                      /* 在 vm_file 中的偏移量（以 PAGE_SIZE 为单位，不是 PAGE_CACHE_SIZE） */
    struct file *vm_file;                        /* 映射的文件（可以为 NULL） */
    void *vm_private_data;                       /* 原为 vm_pte（共享内存） */
    unsigned long vm_truncate_count;              /* truncate_count 或 restart_addr */
};
```
# 7. 管道相关结构

虽然管道不属于 System V IPC，但也是重要的 IPC 机制
```c
struct pipe_inode_info {
    wait_queue_head_t wait;
    unsigned int nrbufs, curbuf, bufs;
    unsigned int page;
    unsigned int tmp_page;
    unsigned int start;
    unsigned int readers;
    unsigned int writers;
    unsigned int waiting_writers;
    unsigned int r_counter;
    unsigned int w_counter;
    struct fasync_struct *fasync_readers;
    struct fasync_struct *fasync_writers;
    struct page *bufs[16];
};

struct pipe_buffer {
    struct page *page;
    unsigned int offset, len;
    const struct pipe_buf_operations *ops;
    unsigned int flags;
    unsigned long private;
};

struct pipe_buf_operations {
    int (*can_merge)(struct pipe_inode_info *, struct pipe_buffer *, struct pipe_buffer *);
    int (*map)(struct pipe_inode_info *, struct pipe_buffer *, struct vm_area_struct *);
    void (*unmap)(struct pipe_inode_info *, struct pipe_buffer *);
    void (*release)(struct pipe_inode_info *, struct pipe_buffer *);
};
```
# 8. 总结

| 通信方式          | 适用场景      | 优点          | 缺点           |
| ------------- | --------- | ----------- | ------------ |
| 匿名管道          | 父子进程      | 简单，自带同步     | 只能用于有血缘关系的进程 |
| 命名管道          | 任意两个进程    | 可用于无血缘关系，简单 | 半双工，面向字节流    |
| System V 共享内存 | 任意进程，大数据量 | 速度最快        | 需要同步机制，编程较复杂 |

**进程间通信的本质**：让不同的进程看到同一份资源（内存），从而交换数据。操作系统提供了多种机制，开发者需根据需求选择合适的方式。

- System V IPC 提供了三种经典的进程间通信方式：消息队列、信号量、共享内存。

- 它们在内核中通过统一的框架管理，使用 key 作为外部标识，通过 `ipc_perm` 和 `kern_ipc_perm` 维护权限信息。

- 信号量是解决共享内存同步问题的常用工具，其 P/V 操作必须原子执行。

- 内核采用“先描述，再组织”的思想，为每种资源定义对应的数据结构，并通过 `ipc_ids` 组织所有 IPC 对象。

- 理解这些内核结构有助于深入掌握 IPC 的工作原理及性能特点。
