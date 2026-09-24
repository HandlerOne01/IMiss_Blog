---
title: "vector"
published: 2025-10-30 19:49:28
description: "本质：动态数组，大小可变 内存：连续存储空间 头文件：include 命名空间：std:: 优点：随机访问快，尾部操作高效，自动内存管理 缺点：中间插入/删除慢，内存占用可能较高"
category: "STL"
tags: ["STL", "数据结构"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. 核心概念

- **本质**：动态数组，大小可变
- **内存**：连续存储空间
- **头文件**：`#include <vector>`
- **命名空间**：`std::`
- **优点**：随机访问快，尾部操作高效，自动内存管理
- **缺点**：中间插入/删除慢，内存占用可能较高

# 2. 构造函数

| 接口                              | 说明                           |
| ------------------------------- | ---------------------------- |
| `vector<T> v;`                  | 默认构造，创建空 vector              |
| `vector<T> v(n);`               | 创建大小为 n 的 vector，默认初始化       |
| `vector<T> v(n, value);`        | 创建大小为 n 的 vector，每个元素为 value |
| `vector<T> v(begin, end);`      | 用迭代器范围 `[begin, end)` 初始化    |
| `vector<T> v(other_vector);`    | 拷贝构造                         |
| `vector<T> v = {a, b, c, ...};` | 列表初始化 (C++11)                |
| vector< T > v[N]                | 创建包含N个vector的数组              |

# 3. 大小与容量

| 接口 | 说明 |
|------|------|
| `v.size()` | 返回当前元素数量 |
| `v.capacity()` | 返回当前分配容量 |
| `v.empty()` | 检查是否为空 |
| `v.resize(new_size)` | 改变大小，新增元素默认初始化 |
| `v.resize(new_size, value)` | 改变大小，新增元素初始化为 value |
| `v.reserve(new_cap)` | 预分配容量，避免多次重新分配 |
| `v.shrink_to_fit()` | 请求移除未使用的容量 (C++11) |

# 4. 元素访问

| 接口 | 说明 |
|------|------|
| `v[index]` | 不检查边界访问，越界行为未定义 |
| `v.at(index)` | 检查边界访问，越界抛异常 |
| `v.front()` | 返回第一个元素的引用 |
| `v.back()` | 返回最后一个元素的引用 |
| `v.data()` | 返回指向底层数组的指针 (C++11) |

# 5. 修改器

| 接口 | 说明 |
|------|------|
| `v.push_back(value)` | 在尾部添加元素 |
| `v.pop_back()` | 移除尾部元素 |
| `v.insert(iterator_pos, value)` | 在指定位置插入元素 |
| `v.insert(iterator_pos, n, value)` | 在指定位置插入 n 个 value |
| `v.insert(iterator_pos, begin, end)` | 在指定位置插入迭代器范围 |
| `v.erase(iterator_pos)` | 移除指定位置元素 |
| `v.erase(iterator_first, iterator_last)` | 移除范围 `[first, last)` 内元素 |
| `v.clear()` | 清空所有元素 |
| `v.assign(n, value)` | 用 n 个 value 替换内容 |
| `v.assign(begin, end)` | 用迭代器范围替换内容 |
| `v.emplace_back(args...)` | 在尾部就地构造元素 (C++11) |
| `v.emplace(iterator_pos, args...)` | 在指定位置就地构造元素 (C++11) |

# 6. 迭代器

| 接口 | 说明 |
|------|------|
| `v.begin() / v.end()` | 指向第一个元素/尾后位置的迭代器 |
| `v.rbegin() / v.rend()` | 反向迭代器 |
| `v.cbegin() / v.cend()` | 常量迭代器 (C++11) |

# 7. 代码示例

### 遍历 vector 的三种方式：
```cpp
std::vector<int> vec = {1, 2, 3, 4, 5};

// 1. 基于范围的 for 循环 (推荐)
for (const auto& element : vec) {
    std::cout << element << " ";
}

// 2. 使用迭代器
for (auto it = vec.begin(); it != vec.end(); ++it) {
    std::cout << *it << " ";
}

// 3. 使用下标
for (size_t i = 0; i < vec.size(); ++i) {
    std::cout << vec[i] << " ";
}
