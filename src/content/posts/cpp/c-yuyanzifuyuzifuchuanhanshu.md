---
title: "c语言字符与字符串函数"
published: 2026-02-23 17:58:01
description: "计算'\\0'之前的字符个数 返回类型为sizet（无符号整型） 字符串必须以'\\0'结束"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 字符分类函数

| 函数       | 功能描述                                                   |
| -------- | ------------------------------------------------------ |
| iscntrl  | 判断是否为控制字符                                              |
| isspace  | 判断是否为空白字符（空格‘ ’，换页‘\f’,换行‘\n’，回车'\r'，制表'\t'，垂直制表符'\v'） |
| isdigit  | 判断是否为十进制数字‘0’~‘9’                                      |
| isxdigit | 判断是否为十六进制数字（0-9，a-f,A-F）                               |
| islower  | 判断是否为小写字母a~z                                           |
| isupper  | 判断是否为大写字母A~Z                                           |
| isalpha  | 判断是否为字母a~z或A~Z                                         |
| isalnum  | 判断是否为字母或数字                                             |
| ispunct  | 判断是否为标点符号                                              |
| isgraph  | 判断是否为任何图形字符                                            |
| isprint  | 判断是否为任何打印字符                                            |

# strlen - 字符串长度

```cpp
size_t strlen(const char *str);
```
- 计算'\0'之前的字符个数
- 返回类型为`size_t`（无符号整型）
- 字符串必须以'\0'结束
## 模拟实现
```cpp
// 方式1：计数器
int my_strlen(const char* str) {
    int count = 0;
    assert(str);
    while(*str) {
        count++;
        str++;
    }
    return count;
}

// 方式2：递归
int my_strlen(const char *str) {
    assert(str);
    if(*str == '\0')
        return 0;
    else
        return 1 + my_strlen(str + 1);
}

// 方式3：指针相减
int my_strlen(char *s) {
    assert(s);
    char *p = s;
    while(*p != '\0')
        p++;
    return p - s;
}
```

# strcpy - 字符串拷贝
```cpp
char* strcpy(char* destination, const char* source);
```
- 源字符串必须以'\0'结束
- 会将源字符串的'\0'拷贝到目标空间
- 目标空间必须足够大且可修改

## 模拟实现
```cpp
char* my_strcpy(char *dest, const char* src) {
    char *ret = dest;
    assert(dest != NULL);
    assert(src != NULL);
    
    while((*dest++ = *src++)) {
        ;
    }
    return ret;
}
```

# strcat - 字符串追加
```cpp
char* strcat(char* destination, const char* source);
```
- 源字符串必须以'\0'结束
- 目标字符串必须有'\0'
- 目标空间必须足够大且可修改
- 不能自己追加自己

## 模拟实现
```cpp
char *my_strcat(char *dest, const char* src) {
    char *ret = dest;
    assert(dest != NULL);
    assert(src != NULL);
    
    while(*dest) {
        dest++;
    }
    while((*dest++ = *src++)) {
        ;
    }
    return ret;
}
```

# strcmp - 字符串比较
```cpp
int strcmp(const char* str1, const char* str2);
```
- str1 > str2：返回 >0 的数字
- str1 = str2：返回 0
- str1 < str2：返回 <0 的数字

## 模拟实现
```cpp
int my_strcmp(const char *str1, const char *str2) {
    int ret = 0;
    assert(str1 != NULL);
    assert(str2 != NULL);
    
    while(*str1 == *str2) {
        if(*str1 == '\0')
            return 0;
        str1++;
        str2++;
    }
    return *str1 - *str2;
}
```

# strncpy - 长度受限的字符串拷贝
```cpp
char* strncpy(char* destination, const char* source, size_t num);
```
- 拷贝num个字符到目标空间
- 如果源字符串长度小于num，则用'\0'填充剩余部分

# strncat - 长度受限的字符串追加
```cpp
char* strncat(char* destination, const char* source, size_t num);
```

#  strncmp - 长度受限的字符串比较
```cpp
int strncmp(const char* str1, const char* str2, size_t num);
```
- 只比较前num个字符
- 比较规则同strcmp

# strstr - 查找子串
```cpp
char* strstr(const char* str1, const char* str2);
```
- 返回str2在str1中第一次出现的位置，如果没找到返回NULL

## 模拟实现
```cpp
char* strstr(const char *str1, const char *str2) {
    char *cp = (char *)str1;
    char *s1, *s2;
    
    if(!*str2)
        return ((char *)str1);
        
    while(*cp) {
        s1 = cp;
        s2 = (char*)str2;
        
        while(*s1 && *s2 && !(*s1 - *s2))
            s1++, s2++;
            
        if(!*s2)
            return cp;
            
        cp++;
    }
    return NULL;
}
```

# strtok - 字符串分割
```cpp
char* strtok(char* str, const char* sep);
```
- sep参数定义分隔符集合
- 第一次调用传入字符串地址，后续调用传入NULL
- 会修改原字符串，用'\0'替换分隔符

## 代码示例
```cpp
#include <stdio.h>
#include <string.h>

int main() {
    char arr[] = "192.168.6.111";
    char* sep = ".";
    char* str = NULL;
    
    for(str = strtok(arr, sep); str != NULL; str = strtok(NULL, sep)) {
        printf("%s\n", str);
    }
    return 0;
}
```

# strerror - 错误信息描述
```cpp
char* strerror(int errnum);
```
-  返回错误码对应的错误信息字符串

## 代码示例
```cpp
#include <stdio.h>
#include <string.h>
#include <errno.h>

int main() {
    FILE *pFile;
    pFile = fopen("unexist.ent", "r");
    if(pFile == NULL) {
        printf("Error opening file: %s\n", strerror(errno));
        // 或者使用perror
        perror("Error opening file");
    }
    return 0;
}
```
