---
title: "离散化"
published: 2026-02-23 17:51:05
description: "空间换时间 时间复杂度O（n log n）sort排序"
category: "算法"
tags: ["算法", "预处理", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

空间换时间
时间复杂度O（n log n）sort排序
# 算法原理
## 基本概念
离散化是一种数据处理思想，当遇到以下情况时使用
· 数据范围很大（如0-10^9）
· 但数据总量不大（如10^5个）
· 需要用数据值作为数组下标

## 核心思想

将原始的大范围数据映射到一个小范围的连续整数空间，保持数据间的相对大小关系。
```
原始数据：[9, 99, 9999, 999999]
离散化后：[1, 2, 3, 4]
```

# 算法实现
```cpp
#include <iostream>
#include <unordered_map>
#include <algorithm>
using namespace std;

const int N = 1e5 + 10;
int n;
int a[N]; // 原始数据
int tmp[N]; // 用于排序的数组
int cnt; // 离散化后的值计数器
unordered_map<int, int> id; // 记录离散化映射关系

int main()
{
    cin >> n;
    
    // 读取数据
    for(int i = 1; i <= n; i++)
    {
        int x; 
        cin >> x;
        a[i] = x;
        tmp[i] = x; // 数据放进离散化数组中
    }
    
    // 离散化处理：排序 + 建立映射
    sort(tmp + 1, tmp + 1 + n);
    
    for(int i = 1; i <= n; i++)
    {
        if(id.count(tmp[i])) continue; // 如果已经存过这个数，跳过
        cnt++; // 这个数映射之后的值
        id[tmp[i]] = cnt; // 建立映射关系
    }
    
    // 使用离散化后的值
    for(int i = 1; i <= n; i++)
    {
        int x = a[i];
        cout << x << " 离散化之后是：" << id[a[i]] << endl;
    }
    
    return 0;
}
```

# 算法步骤详解

## 数据准备

· a[]：存储原始数据
· tmp[]：存储待排序的原始数据副本

## 排序处理

```cpp
sort(tmp + 1, tmp + 1 + n);
```

对数据进行排序，为建立映射关系做准备。

## 建立映射

```cpp
for(int i = 1; i <= n; i++)
{
    if(id.count(tmp[i])) continue;
    cnt++;
    id[tmp[i]] = cnt;
}
```

· 遍历排序后的数组
· 跳过重复值（保证唯一映射）
· 为每个唯一值分配一个连续的整数编号

##  查询使用

```cpp
int discrete_value = id[original_value];
```

通过哈希表快速查询原始值对应的离散值。

# 注意事项

1. 离散化是思想，不是固定模板：可以根据具体问题调整实现方式
2. 理解映射关系：
   · 原始值 → 离散值：通过id[]映射
   · 离散值 → 原始值：需要另外存储（如tmp[]）
3. 处理重复值：必须跳过重复值，保证一一映射
4. 保持顺序：排序确保离散化后的大小关系不变

## 常见变体

1. 结构体离散化：当需要同时记录其他信息时
2. 二分查找离散化：不使用哈希表，用二分查找定位
3. 保序离散化：确保离散化后的顺序与原始顺序一致
