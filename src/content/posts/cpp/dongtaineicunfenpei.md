---
title: "动态内存分配"
published: 2025-11-08 19:37:35
description: "现有内存开辟方式局限性 缺点："
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 为什么需要动态内存分配

**现有内存开辟方式局限性
```c
int val = 20;           // 栈空间开辟4个字节
char arr[10] = {0};     // 栈空间开辟10个字节连续空间
```
**缺点：
- 空间开辟大小固定
- 数组必须指定长度，无法调整
**解决方案：** 动态内存分配，程序运行时申请和释放空间

#  malloc 和 free
## malloc
```cpp
void* malloc(size_t size);
```
**特点：**

- 成功：返回指向开辟空间的指针
- 失败：返回NULL指针（必须检查返回值）
- 返回void* 类型,需要使用者决定类型
- size为0时行为未定义

## free
```c
void free(void* ptr);
```
**特点：
- 释放动态开辟的内存
- ptr非动态开辟时行为未定义
- ptr为NULL时函数不执行任何操作

## 代码示例
```c
#include <stdio.h>
#include <stdlib.h>

int main()
{
    int num = 0;
    scanf("%d", &num);
    
    int* ptr = (int*)malloc(num * sizeof(int));
    
    if(NULL != ptr)  // 必须检查
    {
        for(int i = 0; i < num; i++)
        {
            *(ptr + i) = 0;
        }
    }
    
    free(ptr);      // 释放内存
    ptr = NULL;     // 防止野指针
    return 0;
}
```

# calloc和realloc
## calloc
```cpp
void* calloc(size_t num, size_t size);
```
**与malloc区别：自动初始化为0

## realloc
```c
void* realloc(void* ptr, size_t size);
```
**扩容的两种情况：**
1. **后续空间足够**：直接追加，原数据不变
2. **后续空间不足**：寻找新空间，拷贝原数据，释放原空间

**正确使用方法：**
```cpp
// 错误做法：直接赋值可能丢失原指针
ptr = (int*)realloc(ptr, 1000);

// 正确做法：使用临时指针
int* p = NULL;
p = (int*)realloc(ptr, 1000);
if(p != NULL)
{
    ptr = p;
}
```

# 常见的动态内存错误
## 对NULL指针解引用
```cpp
void test()
{
    int *p = (int *)malloc(INT_MAX/4);
    *p = 20;  // 如果p为NULL则出错
    free(p);
}
```
## 越界访问
```cpp
void test()
{
    int *p = (int *)malloc(10 * sizeof(int));
    for(int i = 0; i <= 10; i++)  // i=10时越界
    {
        *(p + i) = i;
    }
    free(p);
}
```
## 对非动态内存使用free
```cpp
void test()
{
    int a = 10;
    int *p = &a;
    free(p);  // 错误！
}
```
## 释放部分动态内存
```cpp
void test()
{
    int *p = (int *)malloc(100);
    p++;           // p不再指向起始位置
    free(p);       // 错误！
}
```
## 重复释放
```cpp
void test()
{
    int *p = (int *)malloc(100);
    free(p);
    free(p);  // 重复释放！
}
```
## 内存泄漏
```cpp
void test()
{
    int *p = (int *)malloc(100);
    if(NULL != p)
    {
        *p = 20;
    }
    // 忘记free(p) - 内存泄漏！
}
```

# 经典笔试题分析
## 传值问题
```cpp
void GetMemory(char *p)
{
    p = (char *)malloc(100);  // p是临时拷贝
}

void Test(void)
{
    char *str = NULL;
    GetMemory(str);           // str仍为NULL
    strcpy(str, "hello world");  // 崩溃！
    printf(str);
}

//_________________________________________________________________________________
正确的传址调用
void GetMemory(char **p, int num)
{
    *p = (char*)malloc(num);   // 正确的二级指针
}

void Test(void)
{
    char *str = NULL;
    GetMemory(&str, 100);      // 传递地址
    strcpy(str, "hello");
    printf(str);               // 正确输出
    free(str);                 // 记得释放
}
```
## 返回栈地址
```cpp
char *GetMemory(void)
{
    char p[] = "hello world";  // 栈空间
    return p;                  // 返回后空间失效
}

void Test(void)
{
    char *str = NULL;
    str = GetMemory();         // 野指针
    printf(str);               // 随机值
}
```
## 使用已释放内存
```cpp
void Test(void)
{
    char *str = (char *)malloc(100);
    strcpy(str, "hello");
    free(str);                 // 释放后
    if(str != NULL)            // str不为NULL但指向无效内存
    {
        strcpy(str, "world");  // 非法访问
        printf(str);
    }
}
```

# 柔性数组
## 定义与特点
```cpp
struct st_type
{
    int i;
    int a[];    // 柔性数组成员(C99)
    // 或 int a[0]; (某些编译器)
};
```
**特点：**
- 必须作为结构体最后一个成员
- sizeof不包含柔性数组内存
- 需要malloc动态分配

## 使用方法
```cpp
typedef struct st_type
{
    int i;
    int a[];
} type_a;

int main()
{
    type_a *p = (type_a*)malloc(sizeof(type_a) + 100 * sizeof(int));
    p->i = 100;
    for(int i = 0; i < 100; i++)
    {
        p->a[i] = i;  // 直接使用柔性数组
    }
    free(p);  // 一次释放所有内存
    return 0;
}
```
**柔性数组优势：**
1. **内存管理简单**：一次分配，一次释放
2. **访问速度快**：连续内存，减少内存碎片
3. **减少内存泄漏风险**

## 替代方案（不推荐）
```cpp
typedef struct st_type
{
    int i;
    int *p_a;
} type_a;

type_a *p = (type_a *)malloc(sizeof(type_a));
p->p_a = (int *)malloc(p->i * sizeof(int));  // 二次分配
// 需要两次free，容易内存泄漏
```

# 程序内存区域划分
```
┌─────────────────────┐
│    内核空间          │ ← 用户代码不能访问
├─────────────────────┤
│       栈区           │ ← 向下增长
│  - 局部变量          │
│  - 函数参数          │
│  - 返回地址          │
├─────────────────────┤
│       堆区           │ ← 向上增长  
│  - malloc/calloc    │
│  - realloc分配       │
├─────────────────────┤
│     内存映射段        │
│  - 文件映射          │
│  - 动态库            │
├─────────────────────┤
│      数据段          │
│  - 全局变量          │
│  - 静态变量          │
├─────────────────────┤
│      代码段          │
│  - 可执行代码        │
│  - 只读常量          │
└─────────────────────┘
```
## 各区域说明：
1. **栈区(stack)
   - 自动分配释放，效率高
   - 容量有限
   - 存放局部变量、函数参数等

1. **堆区(heap)
   - 手动分配释放
   - 容量较大（受系统限制）
   - 分配方式类似链表

 1. **数据段(静态区)
   - 存放全局变量、静态变量
   - 程序结束系统释放

1. **代码段
   - 存放函数二进制代码
   - 只读常量

# 重要提醒

1. **malloc后必须检查返回值**
2. **free后及时置为NULL**
3. **避免内存泄漏和重复释放**
4. **使用realloc时注意使用临时指针**
5. **动态内存必须配对使用malloc/free**
