---
title: "文件操作"
published: 2025-11-09 16:59:51
description: "程序文件： 源程序文件（.c） 目标文件（.obj） 可执行程序（.exe） 数据文件：程序运行时读写的数据文件"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 什么是文件

## 文件分类
- **程序文件**：
    - 源程序文件（.c）
    - 目标文件（.obj）
    - 可执行程序（.exe）
- **数据文件**：程序运行时读写的数据文件
## 文件名组成
- 文件路径 + 文件名主干 + 文件后缀
- 例如：`c:\code\test.txt`

#  二进制文件和文本文件
## 区别：
- **文本文件**：以ASCII码形式存储
- **二进制文件**：以二进制形式直接存储

## 存储示例：
整数10000的存储：
- ASCII形式：5个字节（'1','0','0','0','0'）
- 二进制形式：4个字节（直接存储10000的二进制）

# 文件的打开和关闭

## 流和标准流
- **流**：抽象的数据流动通道
- **三种标准流**：
    - `stdin`：标准输入流（键盘）
    - `stdout`：标准输出流（显示器）
    - `stderr`：标准错误流（显示器）

## 文件指针
```cpp
FILE *pf;  // 文件指针变量
```

## 文件打开和关闭函数
```cpp
// 打开文件
FILE *fopen(const char *filename, const char *mode);

// 关闭文件
int fclose(FILE *stream);
```

## 文件打开模式

| 模式   | 含义    | 文件不存在时 |
| ---- | ----- | ------ |
| “r”  | 只读    | 出错     |
| "w"  | 只写    | 创建新文件  |
| "a"  | 追加    | 创建新文件  |
| "rb" | 二进制只读 | 出错     |
| "wb" | 二进制只写 | 创建新文件  |
| "r+" | 读写    | 出错     |
| "w+" | 读写    | 创建新文件  |

# 文件的顺序读写

| 函数        | 功能    | 适用范围  |
| --------- | ----- | ----- |
| `fgetc`   | 字符输入  | 所有输入流 |
| `fputc`   | 字符输出  | 所有输出流 |
| `fgets`   | 文本行输入 | 所有输入流 |
| `fputs`   | 文本行输出 | 所有输出流 |
| `fscanf`  | 格式化输入 | 所有输入流 |
| `fprintf` | 格式化输出 | 所有输出流 |
| `fread`   | 二进制输入 | 文件输入流 |
| `fwrite`  | 二进制输出 | 文件输出流 |

# 文件随机读写

## fseek
```cpp
int fseek(FILE *stream, long int offset, int origin);
```
- 根据文件指针位置和偏移量定位

## ftell
```cpp
long int ftell(FILE *stream);
```
- 返回文件指针相对于起始位置的偏移量

## rewind
```cpp
void rewind(FILE *stream);
```
- 让文件指针回到文件起始位置

# 文件读取结束的判定

## 重要提醒
**不能直接用feof判断文件是否结束**
## `feof`

`feof` 是一个C语言标准库函数，用于**检查文件的结束标志是否被设置**
```cpp
int feof(FILE *stream);
```
**返回值：**
- **非0值（真）**：已经到达了文件末尾（End Of File）
- **0（假）**：还没有到达文件末尾
## 正确工作流程
```cpp
// 1. 先进行读取操作
while ((ch = fgetc(fp)) != EOF) {
    // 2. 正常处理数据
    putchar(ch);
}

// 3. 读取结束后，判断是什么原因结束的
if (ferror(fp)) {
    printf("读取时发生I/O错误\n");
} else if (feof(fp)) {
    printf("成功读取到文件末尾\n");  // feof在这里才发挥作用！
}
```
## 正确的判断方法
### 文本文件
- `fgetc`：判断返回值是否为`EOF`
- `fgets`：判断返回值是否为`NULL`

```cpp
// 方法1：检查返回值
while ((ch = fgetc(fp)) != EOF) {
    // 处理字符
}

// 方法2：检查NULL（用于fgets）
while (fgets(buffer, size, fp) != NULL) {
    // 处理字符串
}
```
### 二进制文件
- `fread`：判断返回值是否小于实际要读的个数
```cpp
// 检查实际读取的元素个数
size_t elements_read = fread(buffer, size, count, fp);
if (elements_read < count) {
    // 读取不完整，判断原因
    if (feof(fp)) {
        printf("到达文件末尾\n");
    } else if (ferror(fp)) {
        printf("读取错误\n");
    }
}
```
```

# 文件缓冲区
## 缓冲文件系统：
- 系统自动为每个使用的文件开辟内存缓冲区
- 数据先送到缓冲区，再批量传输到磁盘

## 缓冲区刷新
- 使用`fflush()`函数手动刷新缓冲区
- `fclose()`关闭文件时也会自动刷新缓冲区

## 重要结论
**操作文件时需要刷新缓冲区或关闭文件，否则可能导致读写问题**
