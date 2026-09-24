---
title: "系统调用及其库函数"
published: 2026-04-08 11:50:32
description: "功能：向文件描述符中写入数据。"
category: "Linux 系统"
tags: ["Linux 系统"]
lang: "zh_CN"
draft: false
comment: true
---

# 文件I/O

## write() 函数
```c
#include <unistd.h>

ssize_t write(int fd, const void *buf, size_t count);
```
- **功能**：向文件描述符中写入数据。

- **参数**：

    - **fd**：文件描述符，指向要写入的文件、管道、socket等。

    - **buf**：输入参数，缓冲区指针，存储要写入的数据。

    - **count**：要写入的字节数。

- **返回值**：

    - **成功**：返回实际写入的字节数。

    - **失败**：返回-1，并设置errno以指示错误原因

## read() 函数
```c
#include <unistd.h>

ssize_t read(int fd, void *buf, size_t count);
```
- **功能**：从文件描述符中读取数据。

- **参数**：

    - **fd**：文件描述符，指向要读取的文件、管道、socket等。

    - **buf**：输出参数，缓冲区指针，用于存储读取到的数据。

    - **count**：要读取的字节数。

- **返回值**：

    - **成功**：返回实际读取的字节数（0表示到达文件末尾）。

    - **失败**：返回-1，并设置errno以指示错误原因。

- **特点**：

    - 如果文件描述符指向的是普通文件且读取位置在文件末尾，返回0。

    - 对于管道、终端等设备，如果无数据可用，read()会阻塞等待（除非设置为非阻塞模式）。

    - 实际读取的字节数可能小于count，原因包括：到达文件末尾、被信号中断、从管道/网络读取时数据不足等。

    - 返回值类型为ssize_t（有符号），可用于判断是否出错或到达文件尾。

## open() 函数
```c
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

int open(const char *pathname, int flags);
int open(const char *pathname, int flags, mode_t mode);
```
- **功能**：打开或创建文件，返回文件描述符。

- **参数**：

    - **pathname**：要打开的文件路径。

    - **flags**：文件打开方式标志，如O_RDONLY、O_WRONLY、O_RDWR、O_CREAT、O_APPEND、O_TRUNC等。

    - **mode**：可选参数，当使用O_CREAT标志时，指定新文件的权限。

- **返回值**：

    - **成功**：返回最小的未使用的文件描述符。

    - **失败**：返回-1，并设置errno以指示错误原因。

## close() 函数
```c
#include <unistd.h>

int close(int fd);
```
- **功能**：关闭一个文件描述符。

- **参数**：

    - **fd**：要关闭的文件描述符。

- **返回值**：

    - **成功**：返回0。

    - **失败**：返回-1，并设置errno以指示错误原因。

## unlink() 函数

```c
#include <unistd.h>

int unlink(const char *pathname);
```

- **功能**：删除一个文件的目录项（减少文件的链接数）。

- **参数**：
  - **pathname**：要删除的文件路径。

- **返回值**：
  - **成功**：返回0。
  - **失败**：返回-1，并设置errno以指示错误原因。

# 进程
## 进程控制与创建

### fork() 函数

```c
#include <unistd.h>

pid_t fork(void);
```

- **功能**：创建一个新的进程（子进程）。

- **参数**：
  - **无参数**。

- **返回值**：
  - **成功**：在父进程中返回子进程的PID，在子进程中返回0。
  - **失败**：返回-1，并设置errno以指示错误原因。

- **特点**：
  - 子进程是父进程的副本，获得父进程数据段、堆栈段的拷贝。
  - 父子进程执行顺序不确定，取决于系统调度。
  - 子进程会继承父进程的文件描述符、环境变量等资源。

### waitpid() 函数

```c
#include <sys/types.h>
#include <sys/wait.h>

pid_t waitpid(pid_t pid, int *status, int options);
```

- **功能**：更灵活的进程等待函数。

- **参数**：
  - **pid**：指定要等待的子进程。
    - **>0**：等待指定PID的子进程。
    - **-1**：等待任意子进程（类似wait）。
    - **0**：等待与调用进程同进程组的任意子进程。
    - **<-1**：等待进程组ID等于|pid|的任意子进程。
  - **status**：输出参数，存储子进程退出状态。
  - **options**：控制函数行为。
    - **0**：阻塞等待。
    - **WNOHANG**：非阻塞，立即返回。

- **返回值**：
  - **成功**：返回被等待子进程的PID。
  - **失败**：返回-1，并设置errno以指示错误原因。
  - **WNOHANG时**：若没有子进程退出，返回0。

### dup2() 函数

```c
#include <unistd.h>

int dup2(int oldfd, int newfd);
```

- **功能**：复制文件描述符，指定新描述符的编号。

- **参数**：
  - **oldfd**：要复制的文件描述符。
  - **newfd**：指定的新文件描述符编号。

- **返回值**：
  - **成功**：返回newfd（即新的文件描述符）。
  - **失败**：返回-1，并设置errno以指示错误原因。

- **特点**：
  - 如果newfd已经打开，dup2()会先关闭它，然后再进行复制。
  - 复制后的新文件描述符与原文件描述符共享相同的文件表项（文件偏移量、状态标志等）。

## exec系列函数
```c
#include <unistd.h>

// 最基本的形式
int execve(const char *pathname, char *const argv[], char *const envp[]);

// 常用变体（都是基于execve的封装）
int execl(const char *path, const char *arg, ... /* (char *) NULL */);
int execlp(const char *file, const char *arg, ... /* (char *) NULL */);
int execle(const char *path, const char *arg, ... /*, (char *) NULL, char *const envp[] */);
int execv(const char *path, char *const argv[]);
int execvp(const char *file, char *const argv[]);
int execvpe(const char *file, char *const argv[], char *const envp[]);
```

- **l** (list)：参数以**列表**形式传递，可变参数，以`NULL`结尾。

- **v** (vector)：参数以**数组**形式传递。

- **p** (path)：使用`PATH`环境变量查找可执行文件。

- **e** (environment)：可以指定新的环境变量。

### execl() - 列表参数，完整路径
```c
#include <stdio.h>
#include <unistd.h>

int main() {
    printf("程序开始\n");
    
    // 执行 ls -l -a 命令
    execl("/usr/bin/ls", "ls", "-l", "-a", NULL);
    
    // 如果execl成功，下面的代码不会执行
    printf("这行不会执行\n");
    
    return 0;
}
```

### execlp() - 列表参数，自动PATH搜索
```c
#include <stdio.h>
#include <unistd.h>

int main() {
    printf("使用execlp执行系统命令\n");
    
    // 示例1: 执行ls命令（自动在PATH中查找）
    execlp("ls", "ls", "-l", "-a", "--color=auto", NULL);
    
    // 示例2: 执行grep命令
    // execlp("grep", "grep", "error", "/var/log/syslog", NULL);
    
    // 示例3: 执行ps命令
    // execlp("ps", "ps", "aux", NULL);
    
    perror("execlp failed");
    return 1;
}
```

### execv() （使用参数数组）
```c
#include <stdio.h>
#include <unistd.h>

int main() {
    printf("使用execv执行命令\n");
    
    // 参数数组方式
    char *argv[] = {
        "ls",           // 程序名（argv[0]）
        "-l",
        "-a",
        "--time-style=long-iso",
        NULL           // 必须以NULL结尾
    };
    
    execv("/bin/ls", argv);
    
    perror("execv failed");
    return 1;
}
```

###  execle() - 列表参数，指定环境变量
```c
#include <stdio.h>
#include <unistd.h>

int main() {
    printf("使用execle执行程序，指定环境变量\n");
    
    // 自定义环境变量数组
    char *envp[] = {
        "PATH=/usr/bin:/bin",
        "HOME=/tmp/test_home",
        "USER=custom_user",
        "MYVAR=hello_world",
        NULL  // 必须以NULL结尾
    };
    
    // 执行env命令显示环境变量
    execle("/usr/bin/env", "env", NULL, envp);
    
    perror("execle failed");
    return 1;
}
```

###  execvp() - 数组参数，自动PATH搜索
```c
#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>

int main() {
    printf("使用execvp执行命令\n");
    
    // 示例1: 基本用法
    char *argv1[] = {"ls", "-l", "-a", NULL};
    execvp("ls", argv1);
    
    // 示例2: 执行带复杂参数的命令
    // char *argv2[] = {"find", ".", "-name", "*.c", "-type", "f", NULL};
    // execvp("find", argv2);
    
    // 示例3: 执行shell命令（通过bash解释）
    // char *argv3[] = {"bash", "-c", "echo $PATH && ls -l", NULL};
    // execvp("bash", argv3);
    
    perror("execvp failed");
    return 1;
}
```

###  execvpe() - 数组参数，PATH搜索+指定环境
```c
#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>

int main() {
    printf("使用execvpe执行命令\n");
    
    // 参数数组
    char *argv[] = {
        "env",      // 程序名
        NULL        // 参数列表结束
    };
    
    // 自定义环境变量
    char *envp[] = {
        "PATH=/usr/local/bin:/usr/bin:/bin",
        "LANG=en_US.UTF-8",
        "CUSTOM_SETTING=1",
        "DEBUG_MODE=true",
        "HOME=/tmp/my_home",
        NULL        // 环境变量列表结束
    };
    
    // 注意：execvpe不是标准POSIX函数，但Linux glibc支持
    // 如果编译失败，可以使用execve替代
    execvpe("env", argv, envp);
    
    perror("execvpe failed");
    return 1;
}
```

### execve() - 系统调用版本
```c
#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>

int main() {
    printf("使用execve系统调用\n");
    
    // 参数数组
    char *argv[] = {
        "/bin/ls",
        "-l",
        "-a",
        "-i",   // 显示inode号
        NULL
    };
    
    // 环境变量数组
    char *envp[] = {
        "PATH=/bin:/usr/bin",
        "TERM=xterm-256color",
        NULL
    };
    
    // execve是系统调用，其他exec函数都是它的封装
    execve("/bin/ls", argv, envp);
    
    perror("execve failed");
    return 1;
}
```

## 进程信息获取
### getppid() 函数

```c
#include <unistd.h>

pid_t getppid(void);
```

- **功能**：获取父进程的进程ID。

- **参数**：
  - **无参数**。

- **返回值**：
  - **成功**：返回调用进程的父进程ID。
  - **失败**：此函数总是成功，不会返回错误。

### getpid() 函数

```c
#include <unistd.h>

pid_t getpid(void);
```

- **功能**：获取当前进程的进程ID。

- **参数**：
  - **无参数**。

- **返回值**：
  - **成功**：返回当前进程的进程ID。
  - **失败**：此函数总是成功，不会返回错误。

## 进程优先级与调度
### getpriority() 函数

```c
#include <sys/resource.h>

int getpriority(int which, id_t who);
```

- **功能**：获取进程、进程组或用户的优先级（nice值）。

- **参数**：
  - **which**：指定优先级的作用范围，可选值为 PRIO_PROCESS（进程）、PRIO_PGRP（进程组）、PRIO_USER（用户）。
  - **who**：根据which参数指定的类型，标识具体的进程ID、进程组ID或用户ID。若为0，表示调用者自身。

- **返回值**：
  - **成功**：返回当前进程、进程组或用户的优先级（nice值，范围通常为 -20 到 19，数值越小优先级越高）。
  - **失败**：返回-1，并设置errno以指示错误原因。

### setpriority() 函数

```c
#include <sys/resource.h>

int setpriority(int which, id_t who, int prio);
```

- **功能**：设置进程、进程组或用户的优先级（nice值）。

- **参数**：
  - **which**：指定优先级的作用范围，可选值为 PRIO_PROCESS（进程）、PRIO_PGRP（进程组）、PRIO_USER（用户）。
  - **who**：根据which参数指定的类型，标识具体的进程ID、进程组ID或用户ID。若为0，表示调用者自身。
  - **prio**：要设置的优先级（nice值），范围通常为 -20 到 19，数值越小优先级越高。

- **返回值**：
  - **成功**：返回0。
  - **失败**：返回-1，并设置errno以指示错误原因。

## 其他
### wait() 函数

```c
#include <sys/types.h>
#include <sys/wait.h>

pid_t wait(int *status);
```

- **功能**：等待任意一个子进程退出。

- **参数**：
  - **status**：输出参数，存储子进程退出状态。

- **返回值**：
  - **成功**：返回被等待子进程的PID。
  - **失败**：返回-1，并设置errno以指示错误原因。

- **特点**：
  - 如果没有任何子进程退出，父进程会阻塞在wait()调用处。

### exit() 函数

```c
#include <stdlib.h>

void exit(int status);
```

- **功能**：正常终止调用进程。

- **参数**：
  - **status**：进程退出状态码，通常0表示成功，非0表示错误。父进程可通过wait()或waitpid()获取该状态。

- **返回值**：
  - 此函数不会返回。

- **特点**：
  - 执行进程终止前的清理工作：刷新并关闭所有标准I/O流、执行通过atexit()注册的终止处理函数、关闭所有打开的文件描述符。
  - 将status的低8位传递给父进程。

# 目录与路径操作
### chdir() 函数

```c
#include <unistd.h>

int chdir(const char *path);
```

- **功能**：改变当前工作目录。

- **参数**：
  - **path**：要切换到的目标目录路径。

- **返回值**：
  - **成功**：返回0。
  - **失败**：返回-1，并设置errno以指示错误原因。

## getcwd() 函数

```c
#include <unistd.h>

char *getcwd(char *buf, size_t size);
```

- **功能**：获取当前工作目录的绝对路径。

- **参数**：
  - **buf**：输出参数，缓冲区指针，用于存储当前工作目录的路径字符串。
  - **size**：缓冲区的大小（字节数）。

- **返回值**：
  - **成功**：返回指向buf的指针。
  - **失败**：返回NULL，并设置errno以指示错误原因。

# 进程间通信（IPC）

## System V IPC
### ftok() 函数

```c
#include <sys/types.h>
#include <sys/ipc.h>

key_t ftok(const char *pathname, int proj_id);
```

- **功能**：将路径名和项目标识符转换为System V IPC键值。

- **参数**：
  - **pathname**：一个存在的且可访问的文件路径名。
  - **proj_id**：项目标识符，通常为一个字符（只使用低8位）。

- **返回值**：
  - **成功**：返回一个唯一的键值（key_t类型），可用于创建或获取System V IPC对象（共享内存、消息队列、信号量）。
  - **失败**：返回-1，并设置errno以指示错误原因。
### 共享内存

#### shmget() 函数

```c
#include <sys/ipc.h>
#include <sys/shm.h>

int shmget(key_t key, size_t size, int shmflg);
```

- **功能**：获取或创建一个共享内存段。

- **参数**：
  - **key**：共享内存段的键值，通常由ftok()生成。可设为IPC_PRIVATE（私有共享内存）。
  - **size**：共享内存段的大小（字节数），通常向上取整为页大小的整数倍。
  - **shmflg**：标志位，包括权限（如0666）和操作选项（如IPC_CREAT、IPC_EXCL）。

- **返回值**：
  - **成功**：返回共享内存标识符（shmid）。
  - **失败**：返回-1，并设置errno以指示错误原因。

#### shmat() 函数

```c
#include <sys/types.h>
#include <sys/shm.h>

void *shmat(int shmid, const void *shmaddr, int shmflg);
```

- **功能**：将共享内存段连接到当前进程的地址空间。

- **参数**：
  - **shmid**：共享内存标识符，由shmget()返回。
  - **shmaddr**：指定连接的地址，通常设为NULL（由系统自动选择）。
  - **shmflg**：标志位，如SHM_RDONLY（只读连接）、SHM_RND（地址对齐）等。

- **返回值**：
  - **成功**：返回共享内存段在进程地址空间中的连接地址。
  - **失败**：返回(void \*)-1，并设置errno以指示错误原因。

#### shmdt() 函数

```c
#include <sys/types.h>
#include <sys/shm.h>

int shmdt(const void *shmaddr);
```

- **功能**：将共享内存段从当前进程的地址空间分离。

- **参数**：
  - **shmaddr**：要分离的共享内存段地址，即shmat()返回的连接地址。

- **返回值**：
  - **成功**：返回0。
  - **失败**：返回-1，并设置errno以指示错误原因。

#### shmctl() 函数

```c
#include <sys/ipc.h>
#include <sys/shm.h>

int shmctl(int shmid, int cmd, struct shmid_ds *buf);
```

- **功能**：控制共享内存段的操作。

- **参数**：
  - **shmid**：共享内存标识符，由shmget()返回。
  - **cmd**：控制命令，如IPC_STAT（获取状态）、IPC_SET（设置状态）、IPC_RMID（删除共享内存段）等。
  - **buf**：struct shmid_ds类型的结构体指针，用于存储或设置共享内存段的状态信息。

- **返回值**：
  - **成功**：根据cmd不同，返回值有所不同（通常为0）。
  - **失败**：返回-1，并设置errno以指示错误原因。

### 消息队列

#### msgget() 函数

```c
#include <sys/types.h>
#include <sys/ipc.h>
#include <sys/msg.h>

int msgget(key_t key, int msgflg);
```

- **功能**：获取或创建一个消息队列。

- **参数**：
  - **key**：消息队列的键值，通常由ftok()生成。可设为IPC_PRIVATE（私有消息队列）。
  - **msgflg**：标志位，包括权限（如0666）和操作选项（如IPC_CREAT、IPC_EXCL）。

- **返回值**：
  - **成功**：返回消息队列标识符（msqid）。
  - **失败**：返回-1，并设置errno以指示错误原因。

#### msgctl() 函数

```c
#include <sys/types.h>
#include <sys/ipc.h>
#include <sys/msg.h>

int msgctl(int msqid, int cmd, struct msqid_ds *buf);
```

- **功能**：控制消息队列的操作。

- **参数**：
  - **msqid**：消息队列标识符，由msgget()返回。
  - **cmd**：控制命令，如IPC_STAT（获取状态）、IPC_SET（设置状态）、IPC_RMID（删除消息队列）等。
  - **buf**：struct msqid_ds类型的结构体指针，用于存储或设置消息队列的状态信息。

- **返回值**：
  - **成功**：根据cmd不同，返回值有所不同（通常为0）。
  - **失败**：返回-1，并设置errno以指示错误原因。

#### msgsnd() 函数

```c
#include <sys/types.h>
#include <sys/ipc.h>
#include <sys/msg.h>

int msgsnd(int msqid, const void *msgp, size_t msgsz, int msgflg);
```

- **功能**：向消息队列发送一条消息。

- **参数**：
  - **msqid**：消息队列标识符，由msgget()返回。
  - **msgp**：指向消息缓冲区的指针，消息结构通常包含一个long类型的消息类型和消息数据。
  - **msgsz**：消息数据部分的长度（字节数），不包含消息类型字段。
  - **msgflg**：标志位，如IPC_NOWAIT（非阻塞发送）。

- **返回值**：
  - **成功**：返回0。
  - **失败**：返回-1，并设置errno以指示错误原因。

#### msgrcv() 函数

```c
#include <sys/types.h>
#include <sys/ipc.h>
#include <sys/msg.h>

ssize_t msgrcv(int msqid, void *msgp, size_t msgsz, long msgtyp, int msgflg);
```

- **功能**：从消息队列接收一条消息。

- **参数**：
  - **msqid**：消息队列标识符，由msgget()返回。
  - **msgp**：指向消息缓冲区的指针，用于存储接收到的消息（包含消息类型和数据）。
  - **msgsz**：消息数据部分的最大长度（字节数），不包含消息类型字段。
  - **msgtyp**：指定接收的消息类型。
    - **0**：接收队列中的第一条消息。
    - **>0**：接收指定类型的第一条消息。
    - **<0**：接收类型小于或等于msgtyp绝对值的消息中类型最小的那条。
  - **msgflg**：标志位，如IPC_NOWAIT（非阻塞接收）、MSG_NOERROR（截断过长的消息）。

- **返回值**：
  - **成功**：返回实际接收到的消息数据部分的长度（字节数）。
  - **失败**：返回-1，并设置errno以指示错误原因。

### 信号量

#### semget() 函数

```c
#include <sys/types.h>
#include <sys/ipc.h>
#include <sys/sem.h>

int semget(key_t key, int nsems, int semflg);
```

- **功能**：获取或创建一个信号量集。

- **参数**：
  - **key**：信号量集的键值，通常由ftok()生成。可设为IPC_PRIVATE（私有信号量集）。
  - **nsems**：信号量集中信号量的个数。
  - **semflg**：标志位，包括权限（如0666）和操作选项（如IPC_CREAT、IPC_EXCL）。

- **返回值**：
  - **成功**：返回信号量集标识符（semid）。
  - **失败**：返回-1，并设置errno以指示错误原因。

#### semctl() 函数

```c
#include <sys/types.h>
#include <sys/ipc.h>
#include <sys/sem.h>

int semctl(int semid, int semnum, int cmd, ...);
```

- **功能**：控制信号量集的操作。

- **参数**：
  - **semid**：信号量集标识符，由semget()返回。
  - **semnum**：信号量在集合中的索引（从0开始）。
  - **cmd**：控制命令，如IPC_STAT（获取状态）、IPC_SET（设置状态）、IPC_RMID（删除信号量集）、GETVAL（获取信号量值）、SETVAL（设置信号量值）、GETALL（获取所有信号量值）、SETALL（设置所有信号量值）等。
  - **...**：可选参数，根据cmd的不同，可能需要传入一个union semun类型的参数。

- **返回值**：
  - **成功**：根据cmd不同，返回值有所不同（如GETVAL返回信号量值，其他命令通常返回0）。
  - **失败**：返回-1，并设置errno以指示错误原因。

#### semop() 函数

```c
#include <sys/types.h>
#include <sys/ipc.h>
#include <sys/sem.h>

int semop(int semid, struct sembuf *sops, size_t nsops);
```

- **功能**：对信号量集执行操作（PV操作）。

- **参数**：
  - **semid**：信号量集标识符，由semget()返回。
  - **sops**：指向sembuf结构体数组的指针，每个结构体包含信号量索引、操作值、标志。
  - **nsops**：sops数组中的操作个数。

- **返回值**：
  - **成功**：返回0。
  - **失败**：返回-1，并设置errno以指示错误原因。

## 管道与FIFO
### pipe() 函数

```c
#include <unistd.h>

int pipe(int pipefd[2]);
```

- **功能**：创建一个管道，用于进程间通信。

- **参数**：
  - **pipefd**：输出参数，整数数组，用于存储两个文件描述符。
    - **pipefd[0]**：管道的读端，用于从管道读取数据。
    - **pipefd[1]**：管道的写端，用于向管道写入数据。

- **返回值**：
  - **成功**：返回0。
  - **失败**：返回-1，并设置errno以指示错误原因。

- **特点**：
  - 管道是半双工的，数据只能从读端读取，从写端写入。
  - 通常用于父子进程之间的通信。

### mkfifo() 函数

```c
#include <sys/types.h>
#include <sys/stat.h>

int mkfifo(const char *pathname, mode_t mode);
```

- **功能**：创建一个命名管道（FIFO）文件。

- **参数**：
  - **pathname**：要创建的FIFO文件的路径名。
  - **mode**：指定创建文件的权限，通常使用八进制表示（如0666），会受到进程的umask影响。

- **返回值**：
  - **成功**：返回0。
  - **失败**：返回-1，并设置errno以指示错误原因。

## 内存映射
### mmap() 函数

```c
#include <sys/mman.h>

void *mmap(void *addr, size_t length, int prot, int flags, int fd, off_t offset);
```

- **功能**：将文件或设备映射到进程的地址空间。

- **参数**：
  - **addr**：指定映射区的起始地址（通常设为NULL，由系统选择）。
  - **length**：映射区的长度（字节数）。
  - **prot**：映射区的保护权限，可选值为 PROT_READ、PROT_WRITE、PROT_EXEC、PROT_NONE 的组合。
  - **flags**：映射类型标志，如 MAP_SHARED（共享映射）、MAP_PRIVATE（私有映射）等。
  - **fd**：要映射的文件描述符。
  - **offset**：文件映射的偏移量（必须是页大小的整数倍）。

- **返回值**：
  - **成功**：返回映射区的起始地址。
  - **失败**：返回 MAP_FAILED（即 (void \*)-1），并设置 errno 以指示错误原因。

# 信号处理
## kill() 函数

```c
#include <sys/types.h>
#include <signal.h>

int kill(pid_t pid, int sig);
```

- **功能**：向指定进程或进程组发送信号。

- **参数**：
  - **pid**：指定接收信号的进程。
    - **>0**：发送信号给指定PID的进程。
    - **0**：发送信号给与调用进程同进程组的所有进程。
    - **-1**：发送信号给调用进程有权限发送的所有进程（不包括init进程和自身）。
    - **<-1**：发送信号给进程组ID等于|pid|的所有进程。
  - **sig**：要发送的信号编号（如SIGKILL、SIGTERM、SIGINT等）。若为0，则用于检测进程是否存在。

- **返回值**：
  - **成功**：返回0。
  - **失败**：返回-1，并设置errno以指示错误原因。

## raise() 函数

```c
#include <signal.h>

int raise(int sig);
```

- **功能**：向调用进程自身发送信号。

- **参数**：
  - **sig**：要发送的信号编号（如SIGKILL、SIGTERM、SIGINT等）。

- **返回值**：
  - **成功**：返回0。
  - **失败**：返回非0值。

## abort() 函数

```c
#include <stdlib.h>

void abort(void);
```

- **功能**：异常终止当前进程。

- **参数**：
  - **无参数**。

- **返回值**：
  - 此函数不会返回。

- **特点**：
  - 向调用进程发送SIGABRT信号。
  - 如果SIGABRT信号未被捕获或捕获后返回，abort()仍会终止进程。
  - 会刷新并关闭所有标准I/O流。

## alarm() 函数

```c
#include <unistd.h>

unsigned int alarm(unsigned int seconds);
```

- **功能**：设置一个定时器，在指定时间后向调用进程发送SIGALRM信号。

- **参数**：
  - **seconds**：定时器的时间（秒数）。若为0，则取消之前设置的定时器。

- **返回值**：
  - 返回之前设置的定时器剩余的秒数。如果之前没有设置定时器，则返回0。

## pause() 函数

```c
#include <unistd.h>

int pause(void);
```

- **功能**：使调用进程挂起，直到捕获到一个信号。

- **参数**：
  - **无参数**。

- **返回值**：
  - 仅当捕获到信号并从信号处理函数返回时，pause()才返回-1，并设置errno为EINTR。

## 信号集（sigset_t）
`sigset_t` 类型用于表示信号集合，**每个信号用一个 bit 表示“有效”或“无效”状态**。其内部如何存储这些 bit 取决于系统实现，从使用者的角度**不必关心**，也**不应直接操作其内部数据**（例如用 `printf` 直接打印 `sigset_t` 变量是没有意义的）。

**头文件**
```
#include <signal.h>
```

### sigemptyset()
```cpp
int sigemptyset(sigset_t *set);
```

| 项目      | 说明                                         |
| ------- | ------------------------------------------ |
| **功能**  | 初始化信号集，将所有信号的对应 bit 清零，表示该信号集**不包含任何有效信号** |
| **参数**  | `set`：指向要初始化的 `sigset_t` 变量的指针             |
| **返回值** | 成功返回 `0`，出错返回 `-1`                         |
### sigfillset()
```c
int sigfillset(sigset_t *set);
```

| 项目      | 说明                                           |
| ------- | -------------------------------------------- |
| **功能**  | 初始化信号集，将所有信号的对应 bit 置位，表示该信号集**包含系统支持的所有信号** |
| **参数**  | `set`：指向要初始化的 `sigset_t` 变量的指针               |
| **返回值** | 成功返回 `0`，出错返回 `-1`                           |

### sigaddset()
```c
int sigaddset(sigset_t *set, int signo);
```

| 项目      | 说明                                                             |
| ------- | -------------------------------------------------------------- |
| **功能**  | 向信号集中**添加**一种有效信号                                              |
| **参数**  | `set`：指向目标信号集的指针  <br>`signo`：要添加的信号编号（如 `SIGINT`、`SIGTERM` 等） |
| **返回值** | 成功返回 `0`，出错返回 `-1`                                             |

### sigdelset()
```c
int sigdelset(sigset_t *set, int signo);
```

| 项目      | 说明                                     |
| ------- | -------------------------------------- |
| **功能**  | 从信号集中**删除**一种有效信号                      |
| **参数**  | `set`：指向目标信号集的指针  <br>`signo`：要删除的信号编号 |
| **返回值** | 成功返回 `0`，出错返回 `-1`                     |

### sigismember()
```c
int sigismember(const sigset_t *set, int signo);
```

| 项目      | 说明                                       |
| ------- | ---------------------------------------- |
| **功能**  | 判断一个信号集中是否包含某种信号（布尔函数）                   |
| **参数**  | `set`：指向要检查的信号集的指针  <br>`signo`：要判断的信号编号 |
| **返回值** | 包含返回 `1`，不包含返回 `0`，出错返回 `-1`             |

 ### `sigprocmask()`：读取或更改进程的信号屏蔽字（`block` 表）
```c
#include <signal.h>
int sigprocmask(int how, const sigset_t *set, sigset_t *oldset);
```

- **参数 `how`**：

    - `SIG_BLOCK`：将 `set` 中的信号添加到当前信号屏蔽字中（`mask = mask | set`）。

    - `SIG_UNBLOCK`：将 `set` 中的信号从当前信号屏蔽字中移除（`mask = mask & ~set`）。

    - `SIG_SETMASK`：将当前信号屏蔽字设置为 `set` 所指向的值（`mask = set`）。

- **`set`**：输入型参数，指向要设置的信号集。

- **`oldset`**：输出型参数，保存旧的信号屏蔽字。

- **返回值**：成功返回0，失败返回-1。

### **`sigpending()`**：获取当前进程的未决信号集（`pending` 表）
```c
#include <signal.h>
int sigpending(sigset_t *set);
```

**位图操作细节**：
使用 `struct bits` 可以模拟位图：
```c
struct bits {
    int bitmap[10]; // 32*10 = 320，足以容纳所有信号（通常最多64个）
};
// 要定位某个信号的位置，例如信号编号39：
int index = 39 / 32;   // 1，确定在bitmap[1]中
int pos   = 39 % 32;   // 7，确定第7个比特位
```

## 信号捕捉
### `sigaction` 函数

- **作用**：用于检查或修改与指定信号相关联的处理动作。它比 `signal` 函数更强大、更可控。

- **函数原型**：
```c
#include <signal.h>
int sigaction(int signum, const struct sigaction *act, struct sigaction *oldact);
```
- - `signum`：要处理的信号编号。

    - `act`：输入型参数，指向一个 `struct sigaction` 结构体，用于设置新的信号处理方式。

    - `oldact`：输出型参数，用于保存旧的信号处理方式。

    - **返回值**：成功返回0，失败返回-1并设置 `errno`。

- **`struct sigaction` 结构体**：
```c
struct sigaction {
    void     (*sa_handler)(int);      // 信号处理函数指针
    void     (*sa_sigaction)(int, siginfo_t *, void *); // 用于实时信号
    sigset_t   sa_mask;               // 信号集，指定在处理本信号时需要额外屏蔽的信号
    int        sa_flags;              // 修改信号处理行为的标志位
    void     (*sa_restorer)(void);    // 已废弃
};
```

# 线程
## 线程控制接口
### 线程创建：`pthread_create`
```c
#include <pthread.h>

int pthread_create(pthread_t *thread,
                   const pthread_attr_t *attr,
                   void *(*start_routine) (void *),
                   void *arg);
```
- **参数**：

    - `thread`：**输出型参数**。用于返回新创建的线程ID（`pthread_t`类型，通常是一个无符号长整型）。

    - `attr`：线程属性。通常设置为 `nullptr`，表示使用默认属性。

    - `start_routine`：**函数指针**。新线程创建后将要执行的函数入口。该函数类型为 `void* (void*)`。

    - `arg`：传递给 `start_routine` 函数的参数。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回一个非零的错误码（errno），并且 `thread` 指向的内容是未定义的

### 线程等待`pthread_join`
线程创建后，类似于进程，也需要被等待，否则会产生类似于“僵尸进程”的内存泄漏问题。
```c
#include <pthread.h>

int pthread_join(pthread_t thread, void **retval);
```
- **功能**：阻塞调用线程（通常是主线程），直到指定的 `thread` 线程终止。

- **参数**：

    - `thread`：要等待的线程ID。

    - `retval`：**输出型参数**，二级指针。用于接收被等待线程的退出码（即 `start_routine` 的返回值）。如果不需要，可以设置为 `nullptr`。

- **返回值**：成功返回 `0`，失败返回错误码。

### 线程ID获取：`pthread_self`
```c
#include <pthread.h>
pthread_t pthread_self(void);
```
- **功能**：获取调用线程自身的线程ID。

- **返回值**：返回调用线程的ID。

- **注意**：`pthread_t` 类型的线程ID是一个不透明的类型，通常是一个结构体指针或无符号长整型。它用于在 `pthread` 库层面标识线程，**不要将其与内核调度的LWP混淆**。我们不应该直接暴露LWP的概念给用户。

### 线程终止：`pthread_exit`
```c
#include <pthread.h>
void pthread_exit(void *retval);
```
 - **功能**：终止调用它的线程。
- `retval` 是一个指针，指向线程的返回值。这个返回值可以被同一进程中的其他线程通过 `pthread_join` 获取。

- 调用 `pthread_exit` 后，当前线程立即终止，其后续代码（如下例中的 `std::cout`）将**不会被执行**。
```c
void* routine(void* args) {
    Task *t = static_cast<Task*>(args);
    sleep(100);
    Result *res = new Result(t->Execute());
    sleep(1);
    // return res;      // 1. 正常返回，等同于 pthread_exit(res)
    // exit(13);        // 2. 进程退出，所有线程都将终止
    pthread_exit(res);  // 3. 仅当前线程退出，并返回 res
    std::cout << "haha，新线程不应该看到这里" << std::endl; // 此行永不执行
}
```
- - **`return res`**：在线程函数中，`return` 等同于隐式调用了 `pthread_exit`，返回值会被传递。

- **`exit(13)`**：这是进程级别的退出。一旦调用，整个进程（包括所有线程）都会终止，是一种更“激烈”的退出方式。

- **`pthread_exit(res)`**：这是线程级别的优雅退出，仅终止当前线程，并将 `res` 作为返回值。

### 线程取消：`pthread_cancel`
```c
#include <pthread.h>
int pthread_cancel(pthread_t thread);
```
- **功能**：向一个指定线程发送取消请求
- **调用时机**：主线程或其他线程调用 `pthread_cancel` 时，必须确保目标线程已经启动。否则，取消请求可能无效或产生未定义行为。

- **并发不确定性**：主线程和新创建的线程谁先运行是**不确定**的，由操作系统的调度器决定。这可能导致竞争条件，因此在编写代码时必须考虑线程的同步问题。

###  线程分离：`pthread_detach`
```c
#include <pthread.h>
int pthread_detach(pthread_t thread);
```
- **功能**：将一个线程设置为分离状态。
- 一个线程可以是**可结合的**或**分离的**。

- **可结合线程**：默认状态。当它终止时，其资源（如线程控制块TCB、栈空间）不会被自动回收。必须由另一个线程（通常是主线程）对其调用 `pthread_join` 来回收资源并获取其返回值。

- **分离线程**：当它终止时，其所有资源会被系统自动回收。不需要、也不能对它调用 `pthread_join`。尝试 `join` 一个已分离的线程会出错。
## clone() 函数

```c
#define _GNU_SOURCE
#include <sched.h>

int clone(int (*fn)(void *), void *stack, int flags, void *arg, ...
          /* pid_t *parent_tid, void *tls, pid_t *child_tid */ );
```

- **功能**：创建一个新的进程，类似于fork()，但允许更精细地控制父子进程之间共享的资源（如内存空间、文件描述符、信号处理等）。通常用于实现线程。

- **参数**：
  - **fn**：子进程执行时调用的函数指针。
  - **stack**：子进程使用的栈空间地址（通常指向分配的内存区域的顶部）。
  - **flags**：控制资源共享的标志位，如CLONE_VM（共享内存空间）、CLONE_FS（共享文件系统信息）、CLONE_FILES（共享文件描述符表）、CLONE_SIGHAND（共享信号处理表）、CLONE_THREAD（创建线程）等。
  - **arg**：传递给fn函数的参数。
  - **...**：可选参数，根据flags的不同可能需要提供parent_tid、tls、child_tid等。

- **返回值**：
  - **成功**：在父进程中返回子进程的PID，在子进程中返回0。
  - **失败**：返回-1，并设置errno以指示错误原因。

## 互斥锁
### pthread_mutex_init

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_mutex_init(pthread_mutex_t *mutex, const pthread_mutexattr_t *attr);`

- **功能**：初始化一个互斥锁。

- **参数**：

    - `mutex`：指向要初始化的互斥锁变量。

    - `attr`：互斥锁属性，传 `NULL` 表示使用默认属性。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码（不设置 `errno`，直接返回错误号）。

### pthread_mutex_destroy

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_mutex_destroy(pthread_mutex_t *mutex);`

- **功能**：销毁一个互斥锁，释放相关资源。

- **参数**：

    - `mutex`：指向要销毁的互斥锁。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

### pthread_mutex_lock

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_mutex_lock(pthread_mutex_t *mutex);`

- **功能**：对互斥锁加锁，若锁已被占用则阻塞等待。

- **参数**：

    - `mutex`：指向互斥锁。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

### pthread_mutex_trylock

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_mutex_trylock(pthread_mutex_t *mutex);`

- **功能**：尝试对互斥锁加锁，若锁已被占用则立即返回（非阻塞）。

- **参数**：

    - `mutex`：指向互斥锁。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：若锁已被占用，返回 `EBUSY`；其他错误返回非零错误码。

### pthread_mutex_unlock

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_mutex_unlock(pthread_mutex_t *mutex);`

- **功能**：释放互斥锁。

- **参数**：

    - `mutex`：指向互斥锁。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

## 条件变量接口详解

### 初始化和销毁
```c
#include <pthread.h>

int pthread_cond_destroy(pthread_cond_t *cond);
int pthread_cond_init(pthread_cond_t *restrict cond, 
                      const pthread_condattr_t *restrict attr);
                      
// 静态初始化（全局或static变量）
pthread_cond_t cond = PTHREAD_COND_INITIALIZER;
```

#### pthread_cond_init

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_cond_init(pthread_cond_t *restrict cond, const pthread_condattr_t *restrict attr);`

- **功能**：初始化条件变量。

- **参数**：

    - `cond`：指向要初始化的条件变量。

    - `attr`：条件变量属性，传 `NULL` 表示使用默认属性。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

#### pthread_cond_destroy

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_cond_destroy(pthread_cond_t *cond);`

- **功能**：销毁条件变量，释放相关资源。

- **参数**：

    - `cond`：指向要销毁的条件变量。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

#### PTHREAD_COND_INITIALIZER（静态初始化）

- **头文件**：`#include <pthread.h>`

- **原型**：`pthread_cond_t cond = PTHREAD_COND_INITIALIZER;`

- **功能**：静态初始化条件变量（适用于全局变量或 `static` 变量），无需调用 `pthread_cond_init`。

- **参数**：

    - `cond`：条件变量。

- **返回值**：

    - 成功：无返回值（编译期初始化）。

    - 失败：不适用。

### 等待条件变量
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
#### pthread_cond_wait()

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_cond_wait(pthread_cond_t *restrict cond, pthread_mutex_t *restrict mutex);`

- **功能**：等待条件变量，原子性地释放互斥锁并阻塞等待条件变量被唤醒，被唤醒后重新获取互斥锁。

- **参数**：

    - `cond`：指向条件变量。

    - `mutex`：指向已加锁的互斥锁。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

#### pthread_cond_timedwait()

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

### 唤醒条件变量
```c
int pthread_cond_signal(pthread_cond_t *cond);   // 唤醒一个等待线程
int pthread_cond_broadcast(pthread_cond_t *cond); // 唤醒所有等待线程
```
- `signal`：至少唤醒一个（通常是一个）等待该条件的线程。

- `broadcast`：唤醒所有等待线程。

#### pthread_cond_signal

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_cond_signal(pthread_cond_t *cond);`

- **功能**：唤醒一个等待该条件变量的线程（若有多个等待线程，唤醒其中一个）。

- **参数**：

    - `cond`：指向条件变量。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。

#### pthread_cond_broadcast

- **头文件**：`#include <pthread.h>`

- **原型**：`int pthread_cond_broadcast(pthread_cond_t *cond);`

- **功能**：唤醒所有等待该条件变量的线程。

- **参数**：

    - `cond`：指向条件变量。

- **返回值**：

    - 成功：返回 `0`。

    - 失败：返回非零错误码。
