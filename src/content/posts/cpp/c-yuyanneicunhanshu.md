---
title: "c语言内存函数"
published: 2026-01-15 13:58:40
description: "从source位置开始向后复制num个字节到destination指向的内存位置 不会在遇到'\\0'时停下来 如果source和destination有重叠，复制结果是未定义的 适用于非重叠内存区域的拷贝"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# memcpy - 内存拷贝
```cpp
void *memcpy(void *destination, const void *source, size_t num);
```
- 从source位置开始向后复制num个字节到destination指向的内存位置
- **不会**在遇到'\0'时停下来
- 如果source和destination有重叠，复制结果是未定义的
- 适用于非重叠内存区域的拷贝

## 使用示例
```cpp
#include <stdio.h>
#include <string.h>

int main() {
    int arr1[] = {1,2,3,4,5,6,7,8,9,10};
    int arr2[10] = {0};
    memcpy(arr2, arr1, 20);  // 拷贝20个字节(5个int)
    
    for(int i = 0; i < 10; i++) {
        printf("%d ", arr2[i]);
    }
    // 输出: 1 2 3 4 5 0 0 0 0 0
    return 0;
}
```

## 模拟实现
```cpp
void *memcpy(void *dst, const void *src, size_t count) {
    void *ret = dst;
    assert(dst);
    assert(src);
    
    /* copy from lower addresses to higher addresses */
    while(count--) {
        *(char *)dst = *(char *)src;
        dst = (char *)dst + 1;
        src = (char *)src + 1;
    }
    return ret;
}
```

# memmove - 可处理重叠的内存拷贝
```cpp
void *memmove(void *destination, const void *source, size_t num);
```
- 与memcpy功能类似，但可以处理源内存块和目标内存块重叠的情况
- 如果源空间和目标空间出现重叠，必须使用memmove函数

## 使用示例
```cpp
#include <stdio.h>
#include <string.h>

int main() {
    int arr1[] = {1,2,3,4,5,6,7,8,9,10};
    memmove(arr1 + 2, arr1, 20);  // 将前5个元素拷贝到从第3个元素开始的位置
    
    for(int i = 0; i < 10; i++) {
        printf("%d ", arr1[i]);
    }
    // 输出: 1 2 1 2 3 4 5 8 9 10
    return 0;
}
```

## 模拟实现
```cpp
void *memmove(void *dst, const void *src, size_t count) {
    void *ret = dst;
    
    if(dst <= src || (char *)dst >= ((char *)src + count)) {
        /* Non-Overlapping Buffers - 从低地址向高地址拷贝 */
        while(count--) {
            *(char *)dst = *(char *)src;
            dst = (char *)dst + 1;
            src = (char *)src + 1;
        }
    } else {
        /* Overlapping Buffers - 从高地址向低地址拷贝 */
        dst = (char *)dst + count - 1;
        src = (char *)src + count - 1;
        
        while(count--) {
            *(char *)dst = *(char *)src;
            dst = (char *)dst - 1;
            src = (char *)src - 1;
        }
    }
    return ret;
}
```

# memset - 内存设置
```cpp
void *memset(void *ptr, int value, size_t num);
```
- 将内存中的值以**字节为单位**设置成指定内容
- 常用于初始化内存区域或清空数组

## 使用示例
```cpp
#include <stdio.h>
#include <string.h>

int main() {
    char str[] = "hello world";
    memset(str, 'x', 6);  // 将前6个字节设置为'x'
    printf("%s\n", str);  // 输出: xxxxxxworld
    
    // 也可以用于初始化数组
    int arr[10];
    memset(arr, 0, sizeof(arr));  // 将整个数组初始化为0
    return 0;
}
```

# memcmp - 内存比较
```cpp
int memcmp(const void *ptr1, const void *ptr2, size_t num);
```
- 比较从ptr1和ptr2指针开始向后的num个字节
- 按**无符号字符**的方式逐字节比较

| 返回值 | 含义                         |
| --- | -------------------------- |
| <0  | 第一个不匹配的字节在prt1中的值小于prt2中的值 |
| =0  | 两个内存块的内容相等                 |
| >0  | 第一个不匹配的字节在prt1中的值大于prt2中的值 |

## 使用示例
```cpp
#include <stdio.h>
#include <string.h>

int main() {
    char buffer1[] = "DWgaOtP12df0";
    char buffer2[] = "DWGAOTP12DF0";
    int n;
    
    n = memcmp(buffer1, buffer2, sizeof(buffer1));
    
    if(n > 0)
        printf("'%s' is greater than '%s'.\n", buffer1, buffer2);
    else if(n < 0)
        printf("'%s' is less than '%s'.\n", buffer1, buffer2);
    else
        printf("'%s' is the same as '%s'.\n", buffer1, buffer2);
    
    return 0;
}
```
