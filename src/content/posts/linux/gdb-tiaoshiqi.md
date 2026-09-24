---
title: "gdb - 调试器"
published: 2026-04-08 11:50:55
description: "Release 模式（默认）"
category: "Linux 系统"
tags: ["Linux 系统"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. Debug vs Release 模式

**Release 模式（默认）**
- gcc/g++ 默认
- 体积小、运行快
- **无调试信息**

**Debug 模式**
- 包含调试信息
- 便于 gdb 调试

\- 程序的发布⽅式有两种， debug 模式和 release 模式，Linux gcc/g++ 出来的⼆进制程序，默认是 release 模式。
\- 要使⽤gdb调试，必须在源代码⽣成⼆进制程序的时候, 加上 -g 选项，如果没有添加，程序⽆法被编译
```bash
$ gcc mycmd.c -o mycmd -g
```

# 2. 常见使用

•开始： gdb binFile
•退出： ctrl + d 或 quit 调试命令

| 命令                   | 作用                      | 样例                   |     |
| -------------------- | ----------------------- | -------------------- | --- |
| list / l             | 显示源代码，从上次位置开始，每次列出 10 行 | list                 |     |
| list / l 行号          | 从指定行号开始显示源代码            | list 10              |     |
| list / l 函数名         | 列出指定函数的源代码              | list main            |     |
| list / l 文件名:行号      | 列出指定文件指定行号的源代码          | list mycmd.c:1       |     |
| r / run              | 从程序开始连续执行               | run                  |     |
| n / next             | 单步执行，不进入函数内部（逐过程）       | next / F10           |     |
| s / step             | 单步执行，进入函数内部（逐语句）        | step / F11           |     |
| break / b 行号         | 在指定行号设置断点               | break 10             |     |
| break 文件名:行号         | 在指定文件的指定行号设置断点          | break test.c:10      |     |
| break / b 函数名        | 在函数入口设置断点               | break main           |     |
| info break           | 查看当前所有断点信息              | info break           |     |
| finish               | 执行到当前函数返回，然后停止          | finish               |     |
| print / p 表达式        | 打印表达式的值                 | print start+end      |     |
| p 变量                 | 打印指定变量的值                | p x                  |     |
| set var 变量=值         | 修改变量的值                  | set var i=10         |     |
| continue / c         | 从当前位置开始连续执行程序           | continue             |     |
| delete breakpoints   | 删除所有断点                  | delete breakpoints   |     |
| delete breakpoints n | 删除序号为 n 的断点             | delete breakpoints 1 |     |
| disable breakpoints  | 禁用所有断点                  | disable breakpoints  |     |
| enable breakpoints   | 启用所有断点                  | enable breakpoints   |     |
| info breakpoints     | 查看当前设置的断点列表             | info breakpoints     |     |
| display 变量名          | 每次程序停止时跟踪显示变量值          | display x            |     |
| undisplay 编号         | 取消对指定编号变量的跟踪显示          | undisplay 1          |     |
| until 行号             | 执行到指定行号                 | until 20             |     |
| backtrace / bt       | 查看当前执行栈的函数调用关系及参数       | backtrace            |     |
| info locals          | 查看当前栈帧的局部变量值            | info locals          |     |
