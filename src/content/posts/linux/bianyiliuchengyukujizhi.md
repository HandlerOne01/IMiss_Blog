---
title: "编译流程与库机制"
published: 2026-04-22 11:38:07
description: "将 C 代码翻译成汇编代码"
category: "Linux 系统"
tags: ["Linux 系统"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. C 程序的完整编译流程

## 1.1 预处理（Preprocess）

**作用**：

- 宏替换

- 头文件展开

- 条件编译处理

**命令**
```bash
gcc -E code.c -o code.i
```

## 1.2 编译（Compile → 汇编）

**作用**：

- 将 C 代码翻译成汇编代码

**命令**
```bash
gcc -S code.i -o code.s
```
`.s`：汇编代码文件（人类可读）

## 1.3 汇编（Assemble → 目标文件）

**作用**：

- 将汇编代码翻译成机器指令

**命令**
```bash
gcc -c code.s -o code.o
```
**特点**

- `.o`：可重定位目标文件

- 已是二进制

- 不可直接执行

- 类似 Windows 的 `.obj`

## 1.4 链接（Link → 可执行文件）

**作用**：

- 将目标文件与库文件链接成最终程序

**命令**
```bash
gcc code.o -o code
```

---

# 2. 多文件编译流程

## 2.1 单独编译每个源文件
```bash
gcc -c code1.c
gcc -c code2.c
```
生成：
```bash
code1.o
code2.o
```

## 2.2 链接多个目标文件
```bash
gcc code.o code1.o code2.o -o code
```
如：
```txt
1.c → 1.o
2.c → 2.o
3.c → 3.o
     ↓
    链接
     ↓
    exe

```

---

# 3. 程序运行与依赖库分析

## 3.1 查看动态依赖 - ldd
```bash
ldd code
```

示例输出：
```bash
libc.so.6 => /lib64/libc.so.6
```

libc 实际位置
```bash
/lib64/libc.so.6 -> libc-2.17.so
```

---

# 4. 库的分类

## 4.1 动态库

**动态库的本质:**
让公共代码在内存中只存在一份

- Linux：`.so`

- Windows：`.dll`

## 4.1 静态库

- Linux：`.a`

- Windows：`.lib`

---

# 5. 条件编译

## 5.1 命令行定义宏
```bash
gcc code.c -o code -DM
gcc code.c -o code -DM=100
```
本质
```c
#define M 100
```
➡ 预处理阶段直接修改源码文本

## 5.2 条件编译的用途

1. 商业版 / 免费版功能裁剪

2. Linux 内核裁剪

3. 不同平台、工具链适配

---

# 6. 为什么要先编译成汇编？

**原因总结：**

- CPU 只识别二进制

- 汇编是二进制的**助记符**

- 编译器最初由汇编写成（自举）

**语言翻译层级**
```txt
C/C++/Java → 汇编 → 机器码
```

# 7. 动态链接与静态链接

## 7.1 动态链接（默认方式）

**特点**

- 程序不包含库代码

- 运行时跳转到共享库

- 多个程序共享一份库

**示意**
```txt
程序 → libc.so → printf()
```
**优点**

- 程序体积小

- 节省内存和磁盘

**缺点**

- 库缺失 → 程序无法运行

## 7.2 静态链接

**命令**
```bash
gcc code.c -o code-static -static
```
**特点**

- 链接时拷贝库代码进程序

- 运行时不依赖外部库

- 文件体积大

**验证**
```bash
ldd code-static
# not a dynamic executable
```

## 7.3 动态 / 静态链接对比总结

|对比项|动态链接|静态链接|
|---|---|---|
|程序体积|小|大|
|内存占用|低|高|
|库依赖|必须存在|不需要|
|共享性|高|无|
