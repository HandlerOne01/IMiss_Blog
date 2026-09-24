---
title: "环境变量"
published: 2026-05-07 20:44:12
description: "定义：环境变量是操作系统用来指定系统运行环境参数的特殊变量。"
category: "Linux 系统"
tags: ["Linux 系统"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. 环境变量基本概念

- **定义**：环境变量是操作系统用来**指定系统运行环境参数**的特殊变量。

- **作用**：

    - 为系统或用户程序提供配置信息。

    - 控制程序行为，如搜索路径、默认编辑器、语言设置等。

- **特性**：

    - **全局性**：通常在整个系统或用户会话中有效。

    - **持久性**：可以保存在配置文件中，在系统重启后依然存在。

- **示例**：在编译C/C++代码时，系统通过环境变量（如`PATH`、`LD_LIBRARY_PATH`）找到链接库的位置。

# 2. 命令行参数

- **`main`函数的参数**：
```c
int main(int argc, char *argv[], char *env[])
```
- - `argc`：命令行参数个数。

    - `argv`：指向参数字符串指针数组。

    - `env`：指向环境变量字符串指针数组（可选）。

- **作用**：命令行参数允许程序根据不同的输入参数执行不同的功能，实现**程序选项**功能。

- **示例**：
```c
./code a b c d
```
对应 `argv` 数组：
```c
argv[0] = "./code"
argv[1] = "a"
argv[2] = "b"
argv[3] = "c"
argv[4] = "d"
```

# 3. PATH环境变量
- **作用**：指定系统**搜索可执行文件**的默认路径列表。

- **查看方法**：
```bash
echo $PATH
# 输出示例：/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/sbin:/home/user/bin
```
- **路径分隔符**：在Linux/Unix中使用冒号(`:`)，在Windows中使用分号(`;`)。

- **工作机制**：当输入一个命令时，系统会按照PATH中的路径顺序查找对应的可执行文件。

# 4 环境变量的存储与来源

- **存储位置**：每个进程（包括bash）都维护一张**环境变量表**。

- **环境变量来源**：

    1. **系统级配置文件**：

        - `/etc/profile`：系统全局配置文件。

        - `/etc/bashrc`：系统级bash配置。

    2. **用户级配置文件**：

        - `~/.bash_profile`：用户登录时执行。

        - `~/.bashrc`：每次启动bash时执行。

- **多用户环境**：每个登录用户都有自己独立的bash进程，拥有独立的环境变量表。

# 5 常用环境变量

| 变量名               | 含义         | 示例                        |
| ----------------- | ---------- | ------------------------- |
| `PATH`            | 可执行文件搜索路径  | `/usr/bin:/usr/local/bin` |
| `HOME`            | 当前用户的家目录   | `/home/kiana`             |
| `USER`            | 当前用户名      | `whb`                     |
| `SHELL`           | 当前使用的Shell | `/bin/bash`               |
| `PWD`             | 当前工作目录     | `/home/kiana/code`        |
| `LANG`            | 语言和字符集设置   | `en_US.UTF-8`             |
| `LD_LIBRARY_PATH` | 动态库搜索路径    | `/usr/local/lib`          |
| `PS1`             | 命令行提示符格式   | `[\u@\h \W]\$`            |

# 6. 环境变量的操作

## 查看环境变量
```bash
env                  # 显示所有环境变量
echo $PATH           # 显示特定环境变量
printenv PATH        # 显示特定环境变量
```
## 设置环境变量
```bash
# 临时设置（仅在当前shell有效）
export MY_VAR="hello"          # 设置为环境变量
MY_LOCAL_VAR="world"          # 设置为本地变量（仅当前shell）

# 永久设置（添加到配置文件）
# 在~/.bashrc或~/.bash_profile中添加：
# export MY_VAR="permanent_value"
```
## 取消环境变量
```bash
unset MY_VAR        # 删除环境变量
```

# 7. 在程序中获取环境变量

## 方法一：通过main函数的第三个参数
```c
#include <stdio.h>

int main(int argc, char *argv[], char *env[])
{
    for(int i = 0; env[i] != NULL; i++)
    {
        printf("env[%d]: %s\n", i, env[i]);
    }
    return 0;
}
```

## 方法二：使用全局变量`environ`
```c
#include <stdio.h>
#include <unistd.h>

extern char **environ;  // 声明外部全局变量

int main()
{
    for(char **env = environ; *env != NULL; env++)
    {
        printf("%s\n", *env);
    }
    return 0;
}
```

## 方法三：使用`getenv()`函数
```c
#include <stdio.h>
#include <stdlib.h>

int main()
{
    char *path = getenv("PATH");
    if(path != NULL)
    {
        printf("PATH: %s\n", path);
    }
    
    // 安全示例：限制特定用户执行程序
    char *user = getenv("USER");
    if(user != NULL && strcmp(user, "admin") == 0)
    {
        printf("Welcome admin!\n");
        // 执行管理员操作
    }
    else
    {
        printf("Access denied!\n");
        return 1;
    }
    return 0;
}
```

# 8 环境变量的继承特性

- **继承机制**：父进程的环境变量会**自动传递给子进程**。

- **bash启动子进程的过程**
```bash
// 简化表示bash启动子进程的逻辑
int start_child_process()
{
    int ret = 0;
    int arg_count = 0;
    
    // 准备参数和环境变量
    char *argv[] = {"./program", "arg1", "arg2", NULL};
    char *envp[] = {"PATH=/usr/bin", "HOME=/home/user", NULL};
    
    // 根据参数数量调用main函数
    if(arg_count == 0)
        ret = main();
    else if(arg_count == 2)
        ret = main(argc, argv);
    else
        ret = main(argc, argv, envp);
        
    return ret;
}
```

# 9. 环境变量 vs 本地变量

| 特性       | 环境变量                    | 本地变量           |
| -------- | ----------------------- | -------------- |
| **作用域**  | 全局，可被子进程继承              | 仅在当前shell有效    |
| **设置方法** | `export VAR=value`      | `VAR=value`    |
| **查看方法** | `env`, `printenv`       | `set` (显示所有变量) |
| **示例**   | `export PATH=/new/path` | `count=10`     |
| **用途**   | 配置系统行为                  | 临时存储，脚本内部使用    |

- **bash内部维护两套变量表**：环境变量表和本地变量表。

- **内建命令(built-in command)**：如`export`、`cd`等，由bash直接执行，不创建子进程。
