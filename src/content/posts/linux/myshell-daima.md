---
title: "myshell代码"
published: 2026-04-08 11:51:08
description: ".cstr() 是 C++ 中 std::string 类的一个成员函数，它返回一个指向以 null 结尾的 C 风格字符串（const char）的指针。这个函数主要用于将 C++ 的 std::string 对象传递给需要 C 风格字…"
category: "Linux 系统"
tags: ["Linux 系统"]
lang: "zh_CN"
draft: false
comment: true
---

`.c_str()` 是 C++ 中 `std::string` 类的一个成员函数，它返回一个指向以 null 结尾的 C 风格字符串（`const char*`）的指针。这个函数主要用于将 C++ 的 `std::string` 对象传递给需要 C 风格字符串的函数。

`snprintf` 是 C/C++ 中用于格式化字符串的安全函数，可以防止缓冲区溢出。相比于 `sprintf`，它多了一个参数来指定缓冲区的大小。
```
int snprintf(char* buffer, size_t size, const char* format, ...);
```
## 参数说明

- **buffer**: 输出的目标缓冲区

- **size**: 缓冲区的大小（包括结尾的空字符）

- **format**: 格式化字符串

- **...**: 可变参数列表

```c
// 包含必要的头文件
#include <iostream>      // C++输入输出
#include <[[文件 IO 与文件描述符]]cstdio>        // C标准输入输出，如printf、snprintf
#include <cstring>       // C字符串操作，如strcpy、strtok
#include <cstdlib>       // C标准库，如getenv、malloc、putenv
#include <unistd.h>      // POSIX操作系统API，如chdir、getcwd、fork、execvp
#include <sys/types.h>   // 系统数据类型定义
#include <sys/wait.h>    // 进程等待相关函数，如waitpid
#include <cstring>       // 字符串操作（重复包含）
#include <unordered_map> // C++哈希表容器

#define COMMAND_SIZE 1024  // 命令行缓冲区大小
#define FORMAT "[%s@%s %s]# "  // 命令行提示符格式：用户名@主机名 当前目录#

// ==================== Shell全局数据结构定义 ====================

// 1. 命令行参数表：存储解析后的命令行参数
#define MAXARGC 128          // 最大参数数量
char *g_argv[MAXARGC];       // 参数指针数组
int g_argc = 0;              // 实际参数个数

// 2. 环境变量表：存储自定义的环境变量
#define MAX_ENVS 100         // 最大环境变量数量
char *g_env[MAX_ENVS];       // 环境变量指针数组
int g_envs = 0;              // 实际环境变量个数

// 3. 别名映射表：使用C++ unordered_map存储命令别名
std::unordered_map<std::string, std::string> alias_list;

// 4. 工作目录缓存（用于测试）
char cwd[1024];              // 存储当前工作目录
char cwdenv[1024];           // 用于构造PWD环境变量的缓冲区

// 5. 上一条命令的退出状态码
int lastcode = 0;            // 用于支持 $? 变量

// ==================== 环境变量相关函数 ====================

// 获取当前用户名
const char *GetUserName()
{
    const char *name = getenv("USER");  // 从环境变量获取USER
    return name == NULL ? "None" : name; // 不存在则返回"None"
}

// 获取主机名
const char *GetHostName()
{
    const char *hostname = getenv("HOSTNAME");
    return hostname == NULL ? "None" : hostname;
}

// 获取当前工作目录并更新PWD环境变量
const char *GetPwd()
{
    // 使用getcwd获取当前工作目录（更可靠）
    const char *pwd = getcwd(cwd, sizeof(cwd));
    
    if(pwd != NULL)
    {
        // 构造PWD环境变量字符串，格式为"PWD=路径"
        snprintf(cwdenv, sizeof(cwdenv), "PWD=%s", cwd);
        // 更新环境变量（使PWD与真实目录同步）
        putenv(cwdenv);
    }
    return pwd == NULL ? "None" : pwd;
}

// 获取用户家目录
const char *GetHome()
{
    const char *home = getenv("HOME");
    return home == NULL ? "" : home;  // 返回空字符串而不是"None"
}

// 初始化环境变量表：复制系统环境变量并添加自定义变量
void InitEnv()
{
    extern char **environ;  // 引用系统全局环境变量数组
    
    // 1. 清空自定义环境变量表
    memset(g_env, 0, sizeof(g_env));
    g_envs = 0;

    // 本来应该从配置文件读取，这里简化直接从系统获取
    // 2. 复制系统环境变量到自定义表
    for(int i = 0; environ[i]; i++)
    {
        // 2.1 申请空间：长度+1是为了字符串结束符'\0'
        g_env[i] = (char*)malloc(strlen(environ[i]) + 1);
        // 2.2 复制字符串
        strcpy(g_env[i], environ[i]);
        g_envs++;
    }
    
    // 3. 添加自定义环境变量（测试用）
    g_env[g_envs++] = (char*)"HAHA=for_test"; // 注意：这里直接使用字符串常量
    g_env[g_envs] = NULL;  // 数组以NULL结尾

    // 4. 将自定义环境变量注册到进程环境
    for(int i = 0; g_argv[i]; i++)
    {
        // putenv将"NAME=VALUE"形式字符串添加到环境变量
        putenv(g_env[i]);
    }
    
    // 5. 关键步骤：将全局environ指向我们的环境变量表
    // 这样后续所有环境变量操作都使用我们的版本
    environ = g_env;
}

// ==================== 内置命令实现 ====================

// cd命令：切换工作目录
bool Cd()
{
    // cd 命令（无参数）：切换到用户家目录
    if(g_argc == 1)
    {
        std::string home = GetHome();
        if(home.empty()) return true;  // 家目录不存在则直接返回
        chdir(home.c_str());  // 切换到home目录
    }
    else  // cd 带参数
    {
        std::string where = g_argv[1];
        
        // 处理特殊参数
        if(where == "-")  // 切换到上一个目录（待实现）
        {
            // TODO: 记录和切换前一个目录
        }
        else if(where == "~")  // 切换到用户家目录（待实现）
        {
            // TODO: 切换到用户家目录
        }
        else  // 切换到指定目录
        {
            chdir(where.c_str());  // 系统调用切换目录
        }
    }
    return true;
}

// echo命令：输出文本或变量值
void Echo()
{
    if(g_argc == 2)  // echo只有一个参数的情况
    {
        std::string opt = g_argv[1];
        
        // 输出上一条命令的退出码
        if(opt == "$?")
        {
            std::cout << lastcode << std::endl;
            lastcode = 0;  // 重置退出码
        }
        // 输出环境变量值
        else if(opt[0] == '$')
        {
            std::string env_name = opt.substr(1);  // 去掉$前缀
            const char *env_value = getenv(env_name.c_str());
            if(env_value)
                std::cout << env_value << std::endl;
        }
        else  // 输出普通字符串
        {
            std::cout << opt << std::endl;
        }
    }
}

// ==================== 命令行界面函数 ====================

// 从完整路径中提取最后一个目录名
std::string DirName(const char *pwd)
{
#define SLASH "/"  // 路径分隔符
    std::string dir = pwd;
    
    if(dir == SLASH) return SLASH;  // 根目录直接返回"/"
    
    auto pos = dir.rfind(SLASH);  // 从后往前查找最后一个"/"
    if(pos == std::string::npos) return "BUG?";  // 不应该发生的情况
    
    return dir.substr(pos + 1);  // 返回"/"后面的部分
}

// 构造命令行提示符字符串
void MakeCommandLine(char cmd_prompt[], int size)
{
    // 格式：[用户名@主机名 最后目录名]#
    snprintf(cmd_prompt, size, FORMAT, 
             GetUserName(), 
             GetHostName(), 
             DirName(GetPwd()).c_str());
}

// 打印命令行提示符
void PrintCommandPrompt()
{
    char prompt[COMMAND_SIZE];
    MakeCommandLine(prompt, sizeof(prompt));
    printf("%s", prompt);  // 打印提示符
    fflush(stdout);        // 立即刷新输出缓冲区
}

// 获取用户输入的命令行
bool GetCommandLine(char *out, int size)
{
    // 从标准输入读取一行命令
    char *c = fgets(out, size, stdin);
    if(c == NULL) return false;  // 读取失败或EOF
    
    out[strlen(out) - 1] = 0;  // 去掉末尾的换行符'\n'
    if(strlen(out) == 0) return false;  // 空命令
    
    return true;
}

// ==================== 命令行解析函数 ====================

// 解析命令行字符串为参数数组
bool CommandParse(char *commandline)
{
#define SEP " "  // 参数分隔符（空格）
    
    g_argc = 0;
    
    // 使用strtok分割字符串
    // 第一次调用传入原字符串
    g_argv[g_argc++] = strtok(commandline, SEP);
    
    // 后续调用传入NULL继续分割
    while((g_argv[g_argc++] = strtok(nullptr, SEP)));
    
    g_argc--;  // 修正参数个数（因为循环多计了一个）
    
    return g_argc > 0 ? true : false;  // 有参数返回true
}

// 调试函数：打印解析后的参数
void PrintArgv()
{
    for(int i = 0; g_argv[i]; i++)
    {
        printf("argv[%d]->%s\n", i, g_argv[i]);
    }
    printf("argc: %d\n", g_argc);
}

// ==================== 内置命令检测和执行 ====================

// 检查并执行内置命令
bool CheckAndExecBuiltin()
{
    std::string cmd = g_argv[0];  // 命令名（第一个参数）
    
    if(cmd == "cd")  // 切换目录命令
    {
        Cd();
        return true;
    }
    else if(cmd == "echo")  // 输出命令
    {
        Echo();
        return true;
    }
    else if(cmd == "export")  // 设置环境变量命令（待实现）
    {
        // TODO: 实现export命令
    }
    else if(cmd == "alias")  // 设置别名命令（待实现）
    {
        // TODO: 实现alias命令
        // std::string nickname = g_argv[1];
        // alias_list.insert(key, value);
    }
    
    return false;  // 不是内置命令
}

// ==================== 外部命令执行 ====================

// 执行外部命令（通过fork+execvp）
int Execute()
{
    // 1. 创建子进程
    pid_t id = fork();
    
    if(id == 0)  // 子进程
    {
        // 使用execvp执行命令
        // execvp会自动搜索PATH环境变量中的可执行文件
        execvp(g_argv[0], g_argv);
        
        // 如果execvp失败才会执行到这里
        exit(1);  // 退出码1表示执行失败
    }
    
    // 2. 父进程等待子进程结束
    int status = 0;
    pid_t rid = waitpid(id, &status, 0);
    
    if(rid > 0)  // 成功等待到子进程
    {
        // 使用WEXITSTATUS宏获取子进程的退出状态
        lastcode = WEXITSTATUS(status);
    }
    
    return 0;
}

// ==================== 主函数 ====================

int main()
{
    // Shell启动时初始化环境变量
    InitEnv();
    
    // 主循环：读取-解析-执行循环（Read-Eval-Print Loop）
    while(true)
    {
        // 1. 输出命令行提示符
        PrintCommandPrompt();
        
        // 2. 获取用户输入的命令
        char commandline[COMMAND_SIZE];
        if(!GetCommandLine(commandline, sizeof(commandline)))
            continue;  // 获取失败或空命令，继续循环
        
        // 3. 解析命令行
        if(!CommandParse(commandline))
            continue;  // 解析失败，继续循环
            
        // 4. 检测并执行内置命令
        if(CheckAndExecBuiltin())
            continue;  // 是内置命令，执行后继续循环
        
        // 5. 执行外部命令
        Execute();
    }
    
    // TODO: 清理函数（释放动态分配的内存）
    // cleanup();
    
    return 0;
}
```
