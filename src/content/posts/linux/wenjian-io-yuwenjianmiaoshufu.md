---
title: "文件 IO 与文件描述符"
published: 2026-04-08 11:50:27
description: "即使文件大小为 0（内容为空），其属性信息（文件名、权限、时间戳等）仍需要占用磁盘空间。"
category: "Linux 系统"
tags: ["Linux 系统"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. 文件 = 内容 + 属性
即使文件大小为 0（内容为空），其**属性信息**（文件名、权限、时间戳等）仍需要占用磁盘空间。

# 2. 文件操作的层次

## 2.1 系统角度

- 操作系统的磁盘管理者 → 文件读写必须通过**系统调用**。

- **对文件的操作本质是进程对文件的操作**。

- C/C++ 库函数（`fopen`/`fclose`/`fread`/`fwrite`）是对底层系统调用的**封装**，目的是提高可移植性和开发效率。

## 2.2 文件分类

- **磁盘级文件**：尚未被打开，存储在磁盘上。

- **内存级文件**：已被进程打开，内核为其维护数据结构。

## 2.3 访问文件的流程

访问文件前必须先**打开**文件 → 由进程发起 `open` 系统调用 → 内核将文件加载到内核缓冲区，并返回文件描述符。

# 3. 标准输入 / 输出 / 错误

- C 程序启动时默认打开三个流，类型均为 `FILE*`：

    - `stdin`  → 标准输入（键盘）

    - `stdout` → 标准输出（显示器）

    - `stderr` → 标准错误（显示器）

- 在操作系统层面，这三个流对应的文件描述符固定为：

    - `0` – `stdin`

    - `1` – `stdout`

    - `2` – `stderr`
```cpp
#include <stdio.h>
extern FILE *stdin;
extern FILE *stdout;
extern FILE *stderr;
```

## 3.1 标准输出流与重定向

- 标准输出（stdout）：文件描述符为 1，是程序默认的输出流，通常指向终端。
- 重定向：通过 shell 操作符可以将标准输出指向其他文件（如 >、>>），实现输出的重新定向。
  ```bash
  ./a.out > log.txt          # 将 stdout 重定向到 log.txt
  ./a.out >> log.txt         # 追加模式
  ```
- 为什么需要标准输出流？
    提供统一的输出接口，使得程序可以独立于具体输出设备终端、文件、管道等），printf、cout 等函数默认使用 stdout；perror、cerr 使用标准错误（stderr）。

## 3.2 文件描述符操作与重定向的底层实现

可以通过关闭文件描述符 1，然后打开新文件，使新文件自动获得描述符 1，从而实现重定向。

```c
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <string.h>

int main() {
    close(1);   // 关闭标准输出
    int fd = open("log.txt", O_CREAT | O_WRONLY | O_APPEND, 0666);
    // fd 此时为 1，因为最小可用描述符是 1

    printf("hello printf\n");          // 写入 log.txt
    fprintf(stdout, "hello fprintf\n"); // 写入 log.txt
    const char *msg = "hello write\n";
    write(fd, msg, strlen(msg));       // 直接通过 fd 写入

    return 0;
}
```

- 注意：如果不先 close(1)，新打开的文件描述符不会是 1，重定向不会生效。

## 3.3 标准输出与标准错误的分离

- 标准错误（stderr）：文件描述符 2，默认也输出到终端。
- 可以通过 shell 重定向将 stdout 和 stderr 分别或合并处理。
  ```bash
  ./a.out > log.txt 2>&1      # 将 stdout 和 stderr 都写入 log.txt
  ./a.out 2> error.log        # 只将 stderr 重定向到 error.log
  ```
- 示例运行观察：
  ```bash
  $ ./a.out
  hello con
  hello printf
  hello err
  
  $ ./a.out > log.txt 2>&1
  $ cat log.txt
  hello con
  hello printf
  hello stderr
  ```
  可见重定向后所有输出都进入了文件。

# 4. 文件描述符（File Descriptor, fd）

## 4.1 定义

- **文件描述符是一个非负整数**，本质是**进程文件描述符表的数组下标**。

- 每次打开文件，内核返回当前**最小未使用**的描述符。

## 4.2 分配规则
```cpp
close(1);                     // 释放 fd=1
int fd = open("log.txt", O_CREAT|O_WRONLY|O_TRUNC, 0666); 
printf("fd: %d\n", fd);       // 此时 fd 通常为 1
```

## 4.3 语言库的可移植性

- C 的 `FILE*` 结构体内部封装了文件描述符 `fd`。

- C++ 的 `cin`/`cout`/`cerr`、Java/Python/Go 等语言的 I/O 类库同样封装了操作系统底层的 `fd`，**目的：屏蔽平台差异，增强可移植性**。

# 5. 系统调用接口

## 5.1 `open` – 打开/创建文件
```cpp
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

int open(const char *pathname, int flags);
int open(const char *pathname, int flags, mode_t mode);
```

- **flags**（必须包含一种访问模式）：

    - `O_RDONLY` 只读

    - `O_WRONLY` 只写

    - `O_RDWR`  读写

    - 可与以下标志按位或：

        - `O_CREAT` 文件不存在则创建

        - `O_TRUNC` 打开时将文件截断为0

        - `O_APPEND` 追加写入

- **mode**：当使用 `O_CREAT` 时，指定文件权限（如 `0666`），实际权限受 umask 影响。

**示例:**
```c
int fd1 = open("log.txt", O_CREAT | O_WRONLY | O_TRUNC, 0666); // 写、截断
int fd2 = open("log.txt", O_CREAT | O_WRONLY | O_APPEND, 0666); // 追加
```

## 5.2 `write` – 写入文件
```c
#include <unistd.h>
ssize_t write(int fd, const void *buf, size_t count);
```
- **系统不关心写入的数据是文本还是二进制**，一律视为字节流。

## 5.3 `read` – 读取文件
```c
ssize_t read(int fd, void *buf, size_t count);
```

## 5.4 `close` – 关闭文件
```c
int close(int fd);
```

# 6. C 库函数与系统调用的关系

| C 库函数               | 对应系统调用          | 说明                 |
| ------------------- | --------------- | ------------------ |
| `fopen`, `fclose`   | `open`, `close` | 返回 `FILE*`，封装 `fd` |
| `fread`, `fwrite`   | `read`, `write` | 带缓冲的 I/O           |
| `fputc`, `fputs`    | `write`         | 字符/字符串写入           |
| `printf`, `fprintf` | `write`         | 格式化输出              |

**库函数的意义**：用户无需直接处理 `fd`，且具备缓冲区、跨平台等优势。

# 7. 内核文件数据结构

## 7.1 进程与文件的关系

- 每个进程的 `task_struct` 中包含 `struct files_struct *files`。

- `files_struct` 中有一个**文件描述符表** `fd_array[]`，数组元素是指向内核 `struct file` 的指针。
```txt
进程 task_struct
    │
    └─ files (struct files_struct *)
        │
        └─ fd_array[] (struct file *)
            ├─ [0] → 标准输入 file 对象
            ├─ [1] → 标准输出 file 对象
            ├─ [2] → 标准错误 file 对象
            ├─ [3] → 打开的文件A
            └─ ...
```
## 7.2 `struct file`（内核中已打开的文件）

- 文件当前偏移量

- 访问模式（只读/只写/读写）

- 引用计数（`ref_cnt`，记录多少个描述符指向该对象）

- 文件操作函数指针（`read`, `write`, `lseek` 等）

- 文件缓冲区（内存与磁盘交互的缓存）

- 指向磁盘 inode 的指针（保存文件元数据）

# 8. 重定向原理

## 8.1 核心思想

1. **不改变数组下标，只修改 `fd_array[]` 中特定下标的指向**。

2. **所有输出重定向，都是在修改 fd=1 这个数组下标里存的指针，让它指向不同的文件对象。**
	- **close(1)+open = 释放位置，等系统分配给我（可能拿回1，也可能拿不到）**
	- **dup2(fd,1) = 直接命令系统：1 号描述符必须指向这个文件!**

## 8.2 关键函数 `dup2`
```c
int dup2(int oldfd, int newfd);
```
- 使 `newfd` 成为 `oldfd` 的副本（即指向同一个 `struct file` 对象）。

- 若 `newfd` 已打开，则先关闭。

**示例**：
```c
int fd = open("log.txt", O_CREAT | O_WRONLY | O_TRUNC, 0666);
dup2(fd, 1);   // 将 stdout 重定向到 log.txt
printf("This goes to file\n");
```

此时向 `fd=1` 写入的数据实际写入了 `log.txt`，而不是显示器。

## 8.3 恢复重定向

- 保存原始 `fd` 副本，操作完成后用 `dup2` 恢复。

# 9. 数据拷贝过程

- **读文件**：`read(fd, buf, count)`
    磁盘 → 内核缓冲区 → 用户空间 `buf`

- **写文件**：`write(fd, buf, count)`
    用户空间 `buf` → 内核缓冲区 → 磁盘（延迟写入）

**无论对文件内容进行何种操作，数据都必须先拷贝到内核对应的文件缓冲区中**。

# 10. 总结要点

|概念|说明|
|---|---|
|**文件描述符**|进程级的整数索引，指向内核打开文件表|
|**默认描述符**|0(stdin), 1(stdout), 2(stderr)|
|**分配规则**|取当前可用最小描述符|
|**重定向本质**|修改文件描述符表项的指向（`dup2`）|
|**库函数优势**|封装系统调用，提供缓冲、格式化、跨平台|
|**内核 file 对象**|代表一个已打开的文件，保存偏移量、引用计数、操作函数等|
|**写截断与追加**|`O_TRUNC` 清空原有内容；`O_APPEND` 每次写定位到末尾|
