---
title: "进程退出、等待与程序替换"
published: 2026-04-08 11:50:11
description: "代码运行完毕，结果不正确（如逻辑错误）"
category: "Linux 系统"
tags: ["Linux 系统"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. 进程退出场景与退出码

## 1.1 进程退出的三种场景

1. **代码运行完毕，结果正确**

2. **代码运行完毕，结果不正确**（如逻辑错误）

3. **代码异常终止**（如段错误、被信号杀死）

## 1.2 退出码

- **作用**：用于表示程序的执行情况，父进程通过退出码了解子进程执行结果。

- **存储位置**：进程退出码存储在`task_struct`结构体中。

- **查看方式**：
```c
./program      # 运行程序
echo $?        # 查看最近一次执行的程序的退出码
```
- **取值范围**：通常为0-255，其中：

    - **0**：表示成功（结果正确）

    - **非0**：表示失败或异常，不同的值代表不同的错误原因

- **main函数返回值**：`main`函数的返回值就是进程的退出码。

## 1.3 进程退出方式

1. **main函数返回**：`return`语句使进程正常退出。

2. **exit()函数**：在任何地方调用`exit()`都会使进程立即退出。

3. **\_exit()系统调用**：系统级退出函数。

## 1.4 exit() vs \_exit()
![](/images/posts/jinchengtuichu-dengdaiyuchengxutihuan/01.png)

|特性|exit() (库函数)|_exit() (系统调用)|
|---|---|---|
|**缓冲区处理**|刷新缓冲区（如`printf`的输出）|不刷新缓冲区|
|**清理操作**|执行清理函数（如`atexit`注册的函数）|直接退出，不执行清理|
|**头文件**|`#include <stdlib.h>`|`#include <unistd.h>`|
|**使用场景**|一般用户程序退出|系统底层退出|
```c
// 示例：缓冲区刷新差异
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main() {
    printf("Hello");  // 输出到标准输出缓冲区
    
    // fork();  // 如果fork，会有更复杂的缓冲区行为
    
    // exit(0);      // 会刷新缓冲区，输出"Hello"
    // _exit(0);     // 不会刷新缓冲区，可能不输出"Hello"
    
    return 0;        // main返回会刷新缓冲区
}
```
## 1.5 缓冲区的位置

- **一定不在操作系统内部**：操作系统的I/O缓冲区是另一回事。

- **在C标准库中**：`printf`等函数的缓冲区是由C标准库维护的。

- **三种缓冲类型**：

    1. **全缓冲**：文件操作通常使用全缓冲。

    2. **行缓冲**：终端输出通常使用行缓冲（遇到换行符`\n`时刷新）。

    3. **无缓冲**：标准错误`stderr`通常无缓冲，立即输出。

# 2. 进程等待的必要性

## 2.1 为什么需要进程等待？

1. **防止僵尸进程**：子进程退出后，父进程如果不回收，子进程会变成僵尸进程，导致内存泄漏。

2. **获取子进程退出信息**：父进程需要知道子进程的执行结果（成功、失败、异常）。

3. **同步父子进程**：确保子进程先于父进程完成某些任务。

## 2.2 僵尸进程的危害

- **资源泄漏**：僵尸进程的PCB（`task_struct`）不会被释放。

- **无法杀死**：`kill -9`对僵尸进程无效，因为僵尸进程已经"死亡"。

- **占用进程号**：大量僵尸进程会占用系统进程号资源。

## 2.3 进程等待函数
![](/images/posts/jinchengtuichu-dengdaiyuchengxutihuan/02.png)
### 2.3.1 wait() 函数
```c
#include <sys/types.h>
#include <sys/wait.h>

pid_t wait(int *status);
```

- **功能**：等待**任意一个**子进程退出。

- **参数**：`status` - 输出参数，存储子进程退出状态。

- **返回值**：成功返回被等待子进程的PID，失败返回-1。

- **特点**：如果没有任何子进程退出，父进程会**阻塞**在`wait()`调用处。

### 2.3.2 waitpid() 函数
```c
#include <sys/types.h>
#include <sys/wait.h>

pid_t waitpid(pid_t pid, int *status, int options);
```

- **功能**：更灵活的进程等待函数。

- **参数**：

    - `pid`：指定要等待的子进程

        - `>0`：等待指定PID的子进程

        - `-1`：等待任意子进程（类似`wait`）

        - `0`：等待与调用进程同进程组的任意子进程

        - `<-1`：等待进程组ID等于`|pid|`的任意子进程

    - `status`：输出参数，存储子进程退出状态。

    - `options`：控制函数行为

        - `0`：阻塞等待

        - `WNOHANG`：非阻塞，立即返回

# 3. 获取子进程status
- `wait`和`waitpid`，都有一个`status`参数，该参数是⼀个输出型参数，由操作系统填充。
- 如果传递`NULL`，表⽰不关心⼦进程的退出状态信息。
- 否则，操作系统会根据该参数，将⼦进程的退出信息反馈给⽗进程。
- `status`不能简单的当作整形来看待，可以当作位图来看待，具体细节如下图（只研究status低16⽐特位）：![](/images/posts/jinchengtuichu-dengdaiyuchengxutihuan/03.png)
```c
#include <sys/wait.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

int main(void)
{
    pid_t pid;
    
    if ((pid = fork()) == -1) {
        perror("fork");
        exit(1);
    }
    
    if (pid == 0) {
        // 子进程
        sleep(20);
        exit(10);
    } else {
        // 父进程
        int st;
        int ret = wait(&st);
        
        if (ret > 0 && (st & 0x7F) == 0) {  // 正常退出
            printf("child exit code: %d\n", (st >> 8) & 0xFF);
        } else if (ret > 0) {               // 异常退出
            printf("sig code: %d\n", st & 0x7F);
        }
    }
    
    return 0;
}
```

# 4. 非阻塞等待

## 4.1 阻塞 vs 非阻塞等待

- **阻塞等待**：父进程调用`waitpid(pid, &status, 0)`后，如果子进程未退出，父进程会一直等待（阻塞）。

- **非阻塞等待**：父进程调用`waitpid(pid, &status, WNOHANG)`后，立即返回，不会阻塞。

## 4.2 非阻塞等待的返回值
```c
pid_t waitpid(pid_t pid, int *status, int options);
// options = WNOHANG 时：
// 返回值 > 0：子进程已退出，返回子进程PID
// 返回值 = 0：子进程未退出，但调用成功返回
// 返回值 = -1：调用失败
```

## 4.3 非阻塞等待的应用
```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/wait.h>

int main() {
    pid_t id = fork();
    
    if (id == 0) {
        // 子进程运行5秒后退出
        printf("子进程开始运行，PID: %d\n", getpid());
        sleep(5);
        exit(0);
    } else if (id > 0) {
        // 父进程非阻塞等待
        int status = 0;
        
        while (1) {
            pid_t ret = waitpid(id, &status, WNOHANG);
            
            if (ret > 0) {
                printf("子进程已退出\n");
                break;
            } else if (ret == 0) {
                // 子进程未退出，父进程可以做其他工作
                printf("父进程等待中，做其他工作...\n");
                sleep(1);
            } else {
                // 错误处理
                perror("waitpid");
                break;
            }
        }
    }
    
    return 0;
}
```

# 5. 进程程序替换

## 5.1 程序替换的概念

- **定义**：将当前进程的代码和数据替换为新的程序的代码和数据。

- **特点**：

    1. **不创建新进程**：进程PID不变，只是执行新的程序。

    2. **替换成功后**：执行新程序的代码，原程序代码不再执行。

    3. **exec系列函数**：只有失败时才返回，成功则不返回（因为原程序已被替换）。

## 5.2 exec系列函数
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
## 5.3 函数命名规律

- **l** (list)：参数以**列表**形式传递，可变参数，以`NULL`结尾。

- **v** (vector)：参数以**数组**形式传递。

- **p** (path)：使用`PATH`环境变量查找可执行文件。

- **e** (environment)：可以指定新的环境变量。

## 5.4 使用示例

### 5.4.1 execl() - 列表参数，完整路径
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

### 5.4.2 execlp() - 列表参数，自动PATH搜索
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

### 5.4.3 execv() 示例（使用参数数组）
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

#### 5.4.4 execle() - 列表参数，指定环境变量
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

### 5.4.5 execvp() - 数组参数，自动PATH搜索
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

### 5.4.6 execvpe() - 数组参数，PATH搜索+指定环境
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

### 5.4.7 execve() - 系统调用版本
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

## 5.5 程序替换与fork()结合
```c
#include <stdio.h>
#include <unistd.h>
#include <sys/wait.h>

int main() {
    pid_t id = fork();
    
    if (id == 0) {
        // 子进程：执行程序替换
        printf("子进程开始执行新程序\n");
        execl("/bin/ls", "ls", "-l", "-a", NULL);
        
        // 如果execl失败，才会执行下面的代码
        perror("execl failed");
        exit(1);
    } else if (id > 0) {
        // 父进程：等待子进程
        wait(NULL);
        printf("父进程继续执行\n");
    }
    
    return 0;
}
```

### 5.6 程序替换的底层原理

1. **进程结构不变**：PID、PPID、文件描述符表等保持不变。

2. **代码和数据被覆盖**：新的程序代码和数据加载到进程地址空间。

3. **页表重新建立**：建立新的虚拟地址到物理地址的映射。

4. **从新程序的main开始执行**：程序计数器指向新程序的入口点。

# 6. 总结

1. **进程退出**：通过退出码表示执行结果，`exit()`刷新缓冲区，`_exit()`不刷新。

2. **进程等待**：必须等待子进程，防止僵尸进程，获取退出信息。

3. **状态解析**：使用`WIFEXITED`、`WEXITSTATUS`等宏解析子进程状态。

4. **非阻塞等待**：使用`WNOHANG`选项，父进程可以继续做其他工作。

5. **程序替换**：`exec`系列函数替换进程代码和数据，不创建新进程。

6. **Shell实现**：通过`fork()+exec()`执行命令，需要解析命令行参数。

7. **进程独立性**：程序替换不会影响父进程，因为写时拷贝机制。
