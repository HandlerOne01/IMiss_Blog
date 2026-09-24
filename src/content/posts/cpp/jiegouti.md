---
title: "结构体"
published: 2026-03-05 18:54:59
description: "结构体：一些值的集合，这些值称为成员变量 每个成员可以是不同类型变量"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 结构体类型的声明
- 结构体：一些值的集合，这些值称为成员变量
- 每个成员可以是不同类型变量

## 声明
```cpp
struct tag
{
    member-list;
}variable-list;

// 示例：描述学生
struct Stu
{
    char name[20];  // 名字
    int age;        // 年龄
    char sex[5];    // 性别
    char id[20];    // 学号
};  // 分号不能丢
```
## 创建和初始化
```cpp
#include <stdio.h>

int main()
{
    // 按照结构体成员的顺序初始化
    struct Stu s = {"张三", 20, "男", "20230818001"};
    
    // 按照指定的顺序初始化
    struct Stu s2 = {.age = 18, .name = "lisi", 
                     .id = "20230818002", .sex = "女"};
    return 0;
}
```
## 匿名结构体
声明时省略结构体标签
```cpp
// 匿名结构体类型
struct
{
    int a;
    char b;
    float c;
}x;

struct
{
    int a;
    char b;
    float c;
}a[20], *p;

// p = &x;  // 非法！编译器认为是不同的类型
```

## 结构体自引用
```cpp
结构体包含同类型结构体指针

struct Node
{
    int data;
    struct Node* next;  // 如果没有* 大小将会是无穷大
};
```

## typedef注意事项
```cpp
// 错误写法
typedef struct
{
    int data;
    Node* next;  // 错误！Node还未定义
}Node;

// 正确写法
typedef struct Node
{
    int data;
    struct Node* next;
}Node;
```

# 结构体内存对齐
## 对齐规则

1. 第一个成员对齐到偏移量为0的地址处
2. 其他成员对齐到**对齐数**的整数倍地址处
    - 对齐数 = min(编译器默认对齐数，成员大小)
    - VS默认值：8，Linux gcc无默认（对齐数=成员大小）
3. 结构体总大小为**最大对齐数**的整数倍
4. 嵌套结构体：嵌套的结构体成员对齐到自己的最大对齐数的整数倍处

## 为什么存在内存对齐
1. **平台原因**：不是所有硬件都能访问任意地址的数据
2. **性能原因**：对齐的内存访问只需一次，未对齐可能需要两次
**设计建议**：让占用空间小的成员尽量集中在一起

## 修改默认对齐数
```c
#include <stdio.h>

#pragma pack(1)  // 设置默认对齐数为1
struct S
{
    char c1;
    int i;
    char c2;
};
//pack(1)时：输出 6（1+4+1）


#pragma pack()   // 还原为默认对齐数
//默认对齐时：输出 12（1+3填充+4+1+3填充）
int main()
{
    printf("%d\n", sizeof(struct S));  // 输出结果会改变
    return 0;
}
```

# 结构体传参
```c
struct S
{
    int data[1000];
    int num;
};

// 结构体传参 - 不推荐
void print1(struct S s)
{
    printf("%d\n", s.num);
}

// 结构体地址传参 - 推荐
void print2(struct S* ps)
{
    printf("%d\n", ps->num);
}

int main()
{
    struct S s = {{1,2,3,4}, 1000};
    print1(s);    // 传结构体 - 开销大
    print2(&s);   // 传地址 - 效率高
    return 0;
}
```

# 结构体实现位段
## 什么是位断
```cpp
struct A
{
    int _a:2;   // 占用2个bit
    int _b:5;   // 占用5个bit  
    int _c:10;  // 占用10个bit
    int _d:30;  // 占用30个bit
};
```
## 位段的内存分配
- 空间按需以4字节(int)或1字节(char)方式开辟
- 涉及很多不确定因素，不跨平台
## 位段的跨平台问题
1. int位段被当成有符号数还是无符号数不确定
2. 位段中最大位的数目不能确定
3. 成员在内存中从左向右还是从右向左分配不确定
4. 位段空间不足时，舍弃剩余位还是利用不确定
## 位段的应用
- 网络协议中IP数据报格式使用位段节省空间
## 位段使用的注意事项
- 不能对位段成员使用&操作符（字节内部的bit位没有地址）
- 不能直接用scanf给位段成员输入值
```
// 错误
scanf("%d", &sa._b);

// 正确
int b = 0;
scanf("%d", &b);
sa._b = b;
```

# 总结
- 结构体是自定义类型的重要工具
- 内存对齐是用空间换时间的策略
- 结构体传参应传递地址以提高效率
- 位段可以节省空间但存在跨平台问题
