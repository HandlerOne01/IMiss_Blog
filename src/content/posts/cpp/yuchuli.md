---
title: "预处理"
published: 2025-11-11 12:45:18
description: "C语言内置的预定义符号，在预处理期间处理："
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 预定义符号
**C语言内置的预定义符号，在预处理期间处理：
```cpp
__FILE__      // 当前源文件名
__LINE__      // 当前行号
__DATE__      // 编译日期
__TIME__      // 编译时间
__STDC__      // 如果编译器遵循ANSI C，值为1
```
#  \#defind定义常量
**基本语法：** `#define name stuff`
```java
#define MAX 1000
#define reg register
#define do_forever for(;;)
#define CASE break;case

// 多行定义使用反斜杠
#define DEBUG_PRINT printf("file:%s\tline:%d\tdate:%s\ttime:%s\n", \
                          __FILE__, __LINE__, __DATE__, __TIME__)
```
注意： 不要在define最后加分号，否则可能导致语法错误

# \#define定义宏
语法： \#define name(parameter-list) stuff
## 示例与问题
```java
#define SQUARE(x) x*x
// 问题：SQUARE(5+1) 会被展开为 5+1*5+1 = 11

// 正确写法：
#define SQUARE(x) ((x)*(x))
#define DOUBLE(x) ((x)+(x))
```
重要： 宏定义中的每个参数和整个表达式都应该用括号括起来

# 带有副作用的宏参数
**副作用：** 表达式求值产生的永久性效果
```cpp
x+1;  // 无副作用
x++;  // 有副作用

#define MAX(a,b) ((a)>(b)?(a):(b))
int x=5, y=8;
int z = MAX(x++, y++);  // 展开后：((x++)>(y++)?(x++):(y++))
// 结果：x=6, y=10, z=9
```

# 宏替换规则
1. 调用宏时，先检查参数是否包含#define定义的符号
2. 替换文本插入到原位置
3. 重新扫描结果文件

**注意：
- 宏不能递归
- 字符串常量中的内容不被搜索

# 宏与函数对比
| 属性     | 宏         | 函数      |
| ------ | --------- | ------- |
| 代码长度   | 每次使用都插入代码 | 代码只出现一次 |
| 执行速度   | 更快        | 有调用开销   |
| 操作符优先级 | 可能产生意外结果  | 容易预测    |
| 参数求值   | 参数可能被多次求值 | 参数只求值一次 |
| 参数类型   | 类型无关      | 类型相关    |
| 调试     | 不方便       | 可以逐语句调试 |
| 递归     | 不能递归      | 可以递归    |
## 宏的优势示例
```cpp
#define MALLOC(num, type) (type*)malloc(num * sizeof(type))
MALLOC(10, int);  // 展开为：(int*)malloc(10 * sizeof(int))
```

# \#和##运算符
## \#运算符（字符串化）
```cpp
#define PRINT(n) printf("the value of "#n" is %d", n)
PRINT(a);  // 展开为：printf("the value of ""a"" is %d", a)
```
## \#\#运算符（记号粘合）
```java
#define GENERIC_MAX(type) \
type type##_max(type x, type y) \
{ return (x > y ? x : y); }

GENERIC_MAX(int)    // 生成：int int_max(int x, int y)
GENERIC_MAX(float)  // 生成：float float_max(float x, float y)
```

# 命名约定
- 宏名：全部大写
- 函数名：不要全部大写

# \#undef
移除宏定义
```java
#undef NAME
```
# 命令行定义
在编译时定义符号：
```bash
gcc -D ARRAY_SIZE=10 programe.c
```

# 编译条件
## 基本用法
```java
#ifdef DEBUG
    printf("调试信息\n");
#endif

#if 1
    // 这部分代码会被编译
#else
    // 这部分不会
#endif
```
## 多分支条件编译
```java
#if constant_expression
    // ...
#elif constant_expression
    // ...
#else
    // ...
#endif
```
# 判断是否定义
```java
#if defined(symbol)  // 等同于 #ifdef symbol
#if !defined(symbol) // 等同于 #ifndef symbol
```

# 头文件包含
## 包含方式
- 本地文件： \#include "filename.h"
查找策略：先在源文件目录查找，再到标准路径

- 库文件： \#include <filename.h>
直接去标准路径查找

## 防止重复包含
## 方法1
```java
#ifndef __TEST_H__
#define __TEST_H__
// 头文件内容
#endif
```
## 方法2
```java
#pragma once
```

# 其他预处理指令
```java
#error      // 编译错误
#pragma     // 编译器特定功能
#line       // 改变行号信息
```

# 重要提醒
- 宏定义中要多使用括号避免优先级问题
- 避免在宏参数中使用有副作用的表达式
- 头文件要使用防护措施防止重复包含
- 合理选择使用宏还是函数
