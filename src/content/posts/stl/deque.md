---
title: "Deque"
published: 2025-10-30 21:46:43
description: "本质：双端队列，序列容器 头文件：include 命名空间：std:: 特点：支持在头部和尾部高效插入删除，支持随机访问 复杂度：头尾插入删除 O(1)，随机访问 O(1)，中间插入删除 O(n) 内存结构：由多个固定大小的块组成，不是完…"
category: "STL"
tags: ["STL", "数据结构"]
lang: "zh_CN"
draft: false
comment: true
---

# 核心概念
- **本质**：双端队列，序列容器
- **头文件**：`#include <deque>`
- **命名空间**：`std::`
- **特点**：支持在头部和尾部高效插入删除，支持随机访问
- **复杂度**：头尾插入删除 O(1)，随机访问 O(1)，中间插入删除 O(n)
- **内存结构**：由多个固定大小的块组成，不是完全连续的内存

# 构造函数

| 接口                          | 说明                      |
| --------------------------- | ----------------------- |
| `deque<T> dq;`              | 默认构造，创建空deque           |
| `deque<T> dq(n);`           | 创建大小为n的deque，默认初始化      |
| `deque<T> dq(n, value);`    | 创建大小为n的deque，每个元素为value |
| `deque<T> dq(begin, end);`  | 用迭代器范围`[begin, end)`初始化 |
| `deque<T> dq(other_deque);` | 拷贝构造                    |
| `deque<T> dq = {a, b, c};`  | 列表初始化                   |

# 大小操作

| 接口                           | 说明                 |
| ---------------------------- | ------------------ |
| `dq.size()`                  | 返回元素数量             |
| `dq.empty()`                 | 检查是否为空             |
| `dq.resize(new_size)`        | 改变大小               |
| `dq.resize(new_size, value)` | 改变大小，新增元素初始化为value |
| `dq.max_size()`              | 返回最大可能大小           |
| `dq.shrink_to_fit()`         | 请求移除未使用的容量         |

# 元素访问

| 接口             | 说明          |
| -------------- | ----------- |
| `dq[index]`    | 不检查边界访问元素   |
| `dq.at(index)` | 检查边界访问元素    |
| `dq.front()`   | 返回第一个元素的引用  |
| `dq.back()`    | 返回最后一个元素的引用 |

# 修改器

| 接口                                        | 说明             |
| ----------------------------------------- | -------------- |
| `dq.push_back(value)`                     | 在尾部插入元素        |
| `dq.push_front(value)`                    | 在头部插入元素        |
| `dq.pop_back()`                           | 移除尾部元素         |
| `dq.pop_front()`                          | 移除头部元素         |
| `dq.insert(iterator_pos, value)`          | 在指定位置插入元素      |
| `dq.insert(iterator_pos, n, value)`       | 在指定位置插入n个value |
| `dq.insert(iterator_pos, begin, end)`     | 在指定位置插入迭代器范围   |
| `dq.erase(iterator_pos)`                  | 移除指定位置元素       |
| `dq.erase(iterator_first, iterator_last)` | 移除迭代器范围内的元素    |
| `dq.clear()`                              | 清空所有元素         |
| `dq.assign(n, value)`                     | 分配n个value      |
| `dq.assign(begin, end)`                   | 分配迭代器范围内的元素    |
| `dq.swap(other_deque)`                    | 交换两个deque的内容   |
| `dq.emplace_back(args...)`                | 在尾部就地构造元素      |
| `dq.emplace_front(args...)`               | 在头部就地构造元素      |
| `dq.emplace(iterator_pos, args...)`       | 在指定位置就地构造元素    |

# 迭代器

| 接口                          | 说明      |
| --------------------------- | ------- |
| `dq.begin() / dq.end()`     | 正向迭代器   |
| `dq.rbegin() / dq.rend()`   | 反向迭代器   |
| `dq.cbegin() / dq.cend()`   | 常量正向迭代器 |
| `dq.crbegin() / dq.crend()` | 常量反向迭代器 |
# 注意事项

1. 内存结构：deque 由多个固定大小的块组成，不是完全连续的内存
2. 迭代器失效：
   · 在头尾插入不会使迭代器失效
   · 在中间插入删除可能使所有迭代器失效
3. 性能特点：
   · 头尾操作性能优秀
   · 随机访问性能接近vector
   · 中间操作性能较差
4. 内存开销：比vector有更高的内存开销，但比list低
5. 适用场景：需要频繁在头尾进行插入删除操作的场景

# 常见应用场景

· 需要高效头尾操作的场景
· 滑动窗口问题
· 实现队列和栈
· 作为queue和stack的默认底层容器
· 数据流处理
· 撤销操作历史
