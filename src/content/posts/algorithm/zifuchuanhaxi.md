---
title: "字符串哈希"
published: 2026-04-10 11:54:54
description: "hash(s) = \\sum{i=0}^{n-1} s[i] \\times p^{n-i-1} \\pmod{M}"
category: "算法"
tags: ["算法", "预处理", "前缀", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

# 基本概念

## 哈希函数

$$
hash(s) = \sum_{i=0}^{n-1} s[i] \times p^{n-i-1} \pmod{M}
$$
- 定义：将关键字映射成对应地址的函数，记作 Hash(key)=Addr
- 特性：哈希函数可能会把两个或两个以上的不同关键字映射到统一地址（哈希冲突）

## 字符串哈希
- **核心思想**：将一个字符串用一个整数表示
- **应用场景**：字符串匹配，快速比较子串，字符串搜索等

# 哈希函数设计
## 常用参数
```cpp
// p 通常取质数 131 或 13331
const int P = 13331;  // 或 131

// 利用 unsigned long long 的自然溢出实现自动取模
typedef unsigned long long ULL;
```

## 哈希计算原理
对于字符串“abc”,哈希值计算为：
```cpp
hash = a × p² + b × p¹ + c × p⁰
```

# 前缀哈希法
## 数据结构定义
```cpp
typedef unsigned long long ULL;
const int N = 1e6 + 10, P = 13331;

char s[N];        // 字符串数组，下标从1开始
int len;          // 字符串长度
ULL f[N];         // 前缀哈希数组
ULL p[N];         // p的i次方数组
```

## 初始化处理
```cpp
void init_hash() {
    f[0] = 0; 
    p[0] = 1;
    
    for (int i = 1; i <= len; i++) {
        f[i] = f[i - 1] * P + s[i];  // 计算前缀哈希
        p[i] = p[i - 1] * P;         // 计算p的幂次
    }
}
```

## 获取任意子串哈希值
```cpp
ULL get_hash(int l, int r) {
    return f[r] - f[l - 1] * p[r - l + 1];
}
//假设字符串“abc”,需要子串“bc”哈希，则要“abc”-"a"；注意“a”为高位*过2次（下标为2）
//故f[r] - f[l - 1] * p[r - l + 1]-->"abc"-"a"*(a下标)
```

## 单个字符串哈希计算
```cpp
ULL get_simple_hash() {
    ULL ret = 0;
    for (int i = 1; i <= len; i++) {
        ret = ret * P + s[i];
    }
    return ret;
}
//无需计算p[i];
```

# 完整代码示例
```cpp
#include <iostream>
#include <cstring>
using namespace std;

typedef unsigned long long ULL;
const int N = 1e6 + 10, P = 13331;

class StringHash {
private:
    char s[N];
    int len;
    ULL f[N], p[N];
    
public:
    void init(const char* str) {
        len = strlen(str);
        // 字符串下标从1开始
        for (int i = 1; i <= len; i++) {
            s[i] = str[i - 1];
        }
        init_hash();
    }
    
    void init_hash() {
        f[0] = 0;
        p[0] = 1;
        for (int i = 1; i <= len; i++) {
            f[i] = f[i - 1] * P + s[i];
            p[i] = p[i - 1] * P;
        }
    }
    
    ULL get_hash(int l, int r) {
        if (l < 1 || r > len || l > r) return 0;
        return f[r] - f[l - 1] * p[r - l + 1];
    }
    
    ULL get_simple_hash() {
        ULL ret = 0;
        for (int i = 1; i <= len; i++) {
            ret = ret * P + s[i];
        }
        return ret;
    }
};

int main() {
    StringHash sh;
    sh.init("hello world");
    
    // 获取子串 "hello" 的哈希值
    ULL hash1 = sh.get_hash(1, 5);
    cout << "Hash of 'hello': " << hash1 << endl;
    
    // 获取子串 "world" 的哈希值
    ULL hash2 = sh.get_hash(7, 11);
    cout << "Hash of 'world': " << hash2 << endl;
    
    return 0;
}
```

# 注意事项
1. 字符串下标：通常从1开始，避免边界处理问题
2. 参数选择：P取质数131或13331，减少哈希冲突
3. 溢出利用：ULL类型溢出自动取模2^64
4. 哈希冲突：虽然概率很低，但在关键应用中可能需要双哈希
5. 初始化顺序：必须先初始化p数组，再计算前缀哈希

# 应用场景

· 快速比较子串：O(1)时间比较任意两个子串是否相等
· 字符串匹配：Rabin-Karp算法的基础
· 回文判断：结合正向和反向哈希
· 最长公共子串：二分答案+哈希检查（[二分](/posts/algorithm/erfen/)）
