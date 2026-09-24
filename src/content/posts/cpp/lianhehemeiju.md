---
title: "联合和枚举"
published: 2025-11-08 16:28:45
description: "联合体由一个或多个成员构成，成员可以是不同类型 编译器只为最大的成员分配足够的内存空间 所有成员共用同一块内存空间 给其中一个成员赋值，其他成员的值也会变化"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 联合体（共用体）
## 联合体类型的声明
- 联合体由一个或多个成员构成，成员可以是不同类型
- 编译器只为最大的成员分配足够的内存空间
- 所有成员共用同一块内存空间
- 给其中一个成员赋值，其他成员的值也会变化
```c
#include <stdio.h>

// 联合类型的声明
union Un
{
    char c;
    int i;
};

int main()
{
    // 联合变量的定义
    union Un un = {0};
    // 计算变量的大小
    printf("%d\n", sizeof(un));  // 输出：4
    return 0;
}
```

## 特点
- 成员共用同一块内存空间
- 联合变量的大小至少是最大成员大小

### 地址验证
```c
#include <stdio.h>

union Un
{
    char c;
    int i;
};

int main()
{
    union Un un = {0};
    printf("%p\n", &(un.i));  // 三个地址相同
    printf("%p\n", &(un.c));
    printf("%p\n", &un);
    return 0;
}
```
### 内存共享验证
```c
#include <stdio.h>

union Un
{
    char c;
    int i;
};

int main()
{
    union Un un = {0};
    un.i = 0x11223344;
    un.c = 0x55;
    printf("%x\n", un.i);  // 输出：11223355
    return 0;
}
```

## 相同成员的结构体和联合体对比
- 结构体
```cpp
struct S
{
    char c;
    int i;
};
struct S s = {0};
```
- 各成员有独立的内存空间
- 存在内存对齐，可能有浪费的空间

- 联合体
```c
union Un
{
    char c;
    int i;
};
union Un un = {0};
```

## 联合体大小的计算规则
- 联合的大小至少是最大成员的大小
- 当最大成员大小不是最大对齐数的整数倍时，要对齐到最大对齐数的整数倍
```cpp
#include <stdio.h>

union Un1
{
    char c[5];  // 大小5，对齐数1
    int i;      // 大小4，对齐数4
};

union Un2
{
    short c[7]; // 大小14，对齐数2
    int i;      // 大小4，对齐数4
};

int main()
{
    printf("%d\n", sizeof(union Un1));  // 输出：8（对齐到4的倍数）
    printf("%d\n", sizeof(union Un2));  // 输出：16（对齐到4的倍数）
    return 0;
}
```

## 联合体应用示例
```cpp
struct gift_list
{
    int stock_number;  // 库存量
    double price;      // 定价
    int item_type;     // 商品类型
    
    union {
        struct
        {
            char title[20];   // 书名
            char author[20];  // 作者
            int num_pages;    // 页数
        } book;
        struct
        {
            char design[30];  // 设计
        } mug;
        struct
        {
            char design[30];  // 设计
            int colors;       // 颜色
            int sizes;        // 尺寸
        } shirt;
    } item;
};
```

## 联合体判断大小端
```cpp
int check_sys()
{
    union
    {
        int i;
        char c;
    } un;
    un.i = 1;
    return un.c;  // 返回1是小端，返回0是大端
}
```

# 枚举类型
## 声明
- 枚举就是把可能的取值一一列举
```c
enum Day          // 星期
{
    Mon,          // 默认值：0
    Tues,         // 默认值：1
    Wed,          // 默认值：2
    Thur,         // 默认值：3
    Fri,          // 默认值：4
    Sat,          // 默认值：5
    Sun           // 默认值：6
};

enum Sex          // 性别
{
    MALE,         // 默认值：0
    FEMALE,       // 默认值：1
    SECRET        // 默认值：2
};

enum Color        // 颜色
{
    RED,          // 默认值：0
    GREEN,        // 默认值：1
    BLUE          // 默认值：2
};

// 可以自定义初始值
enum Color
{
    RED = 2,
    GREEN = 4,
    BLUE = 8
};
```

## 枚举类型的优点
1. **增加代码的可读性和可维护性**
2. **类型检查更严谨**（相比#define）
3. **便于调试**（预处理阶段不会删除枚举符号）
4. **使用方便**，一次可以定义多个常量
5. **遵循作用域规则**

## 枚举类型使用
```c
enum Color
{
    RED = 1,
    GREEN = 2,
    BLUE = 4
};

enum Color clr = GREEN;  // 正确：使用枚举常量赋值
// clr = 2;              // C语言中可以，C++中不行（类型检查严格）
```

# 总结

## 联合体要点
- 所有成员共享同一内存空间
- 大小由最大成员和对齐规则决定
- 适合需要节省内存的场景

## 枚举要点
- 提高代码可读性和类型安全性
- 默认从0开始递增，可自定义初始值
- 相比#define有更好的调试支持和作用域控制
