---
title: "缓冲区"
published: 2026-04-08 11:49:39
description: "Linux 设计哲学：一切皆文件。硬件设备、普通文件、管道、套接字等都被抽象为文件，通过统一的接口访问。"
category: "Linux 系统"
tags: ["Linux 系统"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. 一切皆文件：VFS 与 file_operations

Linux 设计哲学：一切皆文件。硬件设备、普通文件、管道、套接字等都被抽象为文件，通过统一的接口访问。

- VFS（虚拟文件系统）：内核层抽象，隐藏底层具体文件系统的差异。
- 每个打开的文件在内核中对应一个 struct file，其中包含指向具体设备操作的函数指针表 struct file_operations。
- 这种设计是 C 语言版的多态：不同设备实现相同的函数指针，但底层操作不同。

内核源码片段（简化）：

```c
struct file_operations {
    ssize_t (*read) (struct file *, char __user *, size_t, loff_t *);
    ssize_t (*write) (struct file *, const char __user *, size_t, loff_t *);
    int (*open) (struct inode *, struct file *);
    int (*release) (struct inode *, struct file *);
    // ... 其他函数指针
};

struct file {
    const struct file_operations *f_op;  // 指向特定设备的操作表
    loff_t          f_pos;                // 当前读写位置
    unsigned int    f_flags;
    // ...
};
```
![](/images/posts/huanchongqu/01.png)
# 2. 缓冲区机制

## 2.1 什么是缓冲区

缓冲区是一段内存空间，用于暂存数据，目的是减少系统调用次数，提高 I/O 效率。

## 2.2 缓冲区存在的层次

1. 用户层 / 语言层缓冲区：如 C 标准库的 FILE 结构体内部的缓冲区。
2. 内核层缓冲区：内核维护的页缓存（page cache）。
3. 应用层自定义缓冲区：某些程序自己实现的缓冲逻辑。

## 2.3 为什么需要缓冲区

- 系统调用（如 read / write）开销较大，通过批量处理数据减少调用次数。
- 硬件 I/O 速度慢，缓冲可以平滑数据流。
- 数据的本质是拷贝：从用户空间拷贝到内核空间，再到硬件。

## 2.4 刷新策略

- 无缓冲（\_IONBF）：数据立即写入，例如 stderr 通常是无缓冲的，用于及时输出错误信息。
- 行缓冲（\_IOLBF）：遇到换行符 \n 时刷新缓冲区，典型应用是与终端交互的 stdout。
- 全缓冲（\_IOFBF）：缓冲区满才刷新，普通文件默认采用全缓冲，效率最高。

## 2.5 C 标准库的 FILE 结构体

FILE 是对文件流的抽象，内部包含文件描述符、缓冲区指针等信息（glibc 定义）。

```c
struct _IO_FILE {
    int _flags;           // 标志位
    char *_IO_read_ptr;   // 读指针
    char *_IO_read_end;
    char *_IO_read_base;
    char *_IO_write_base; // 写缓冲区基址
    char *_IO_write_ptr;  // 当前写指针
    char *_IO_write_end;
    char *_IO_buf_base;   // 缓冲区基址
    char *_IO_buf_end;    // 缓冲区结束
    int _fileno;          // 关联的文件描述符
    // ...
};
typedef struct _IO_FILE FILE;
```

## 2.6 系统调用与库函数的区别

- 系统调用：如 write，直接进入内核，将数据写入内核缓冲区（或硬件），无用户态缓冲。
- 库函数：如 printf、fprintf，先写入用户态 FILE 缓冲区，满足条件（满、换行、主动 fflush）时才调用 write。

示例对比：

```c
printf("hello printf\n");
fprintf(stdout, "hello fprintf\n");
const char *s = "hello write\n";
write(1, s, strlen(s));
```

- 在终端运行时，stdout 是行缓冲，\n 会触发刷新，所以三个输出顺序正常。
- 当重定向到文件时，stdout 变为全缓冲，printf 和 fprintf 的数据暂存在用户缓冲区，直到程序结束才刷新；而 write 直接写入，可能导致顺序错乱。可通过 fflush(stdout) 强制刷新用户缓冲区。

# 3. 实验观察

以下是一些运行示例，展示了重定向对输出的影响：

```bash
$ ./a.out > log.txt
$ cat log.txt
hello printf
hello fprintf
# 注意 write 的输出可能没有出现或顺序不同
```

若需确保顺序，可以在库函数后主动调用 fflush：

```c
printf("hello printf\n");
fflush(stdout);
fprintf(stdout, "hello fprintf\n");
fflush(stdout);
const char *s = "hello write\n";
write(1, s, strlen(s));
```

# 4. 其他要点

- 文件描述符与 FILE 的关联：FILE 结构体中的\_fileno 成员存储了对应的文件描述符。
- 打开文件：fopen 返回一个 FILE*，内部会分配缓冲区。
- 刷新缓冲区：fflush(FILE*) 强制将用户态缓冲区数据写入内核（最终可能写入硬件）。
- 关闭文件：fclose 会先刷新缓冲区，再释放资源。
