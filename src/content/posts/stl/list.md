---
title: "List"
published: 2025-10-30 20:08:00
description: "本质：双向链表容器 头文件：include 命名空间：std:: 优点：任意位置插入删除高效 O(1)，不需要连续内存 缺点：不支持随机访问，访问元素需要遍历 O(n)，内存开销较大（每个节点包含前后指针） 特点：双向迭代器，插入删除不会…"
category: "STL"
tags: ["STL", "数据结构"]
lang: "zh_CN"
draft: false
comment: true
---

# 核心概念

- **本质**：双向链表容器
- **头文件**：`#include <list>`
- **命名空间**：`std::`
- **优点**：任意位置插入删除高效 O(1)，不需要连续内存
- **缺点**：不支持随机访问，访问元素需要遍历 O(n)，内存开销较大（每个节点包含前后指针）
- **特点**：双向迭代器，插入删除不会使其他迭代器失效

# 构造函数

| 接口 | 说明 |
|------|------|
| `list<T> lst;` | 默认构造，创建空list |
| `list<T> lst(n);` | 创建大小为n的list，默认初始化 |
| `list<T> lst(n, value);` | 创建大小为n的list，每个元素为value |
| `list<T> lst(begin, end);` | 用迭代器范围`[begin, end)`初始化 |
| `list<T> lst(other_list);` | 拷贝构造 |
| `list<T> lst = {a, b, c};` | 列表初始化 |

# 大小操作

| 接口 | 说明 |
|------|------|
| `lst.size()` | 返回元素数量 |
| `lst.empty()` | 检查是否为空 |
| `lst.resize(new_size)` | 改变大小 |
| `lst.resize(new_size, value)` | 改变大小，新增元素初始化为value |
| `lst.max_size()` | 返回最大可能大小 |

# 元素访问

| 接口 | 说明 |
|------|------|
| `lst.front()` | 返回第一个元素的引用 |
| `lst.back()` | 返回最后一个元素的引用 |

# 修改器

| 接口 | 说明 |
|------|------|
| `lst.push_back(value)` | 在尾部添加元素 |
| `lst.push_front(value)` | 在头部添加元素 |
| `lst.pop_back()` | 移除尾部元素 |
| `lst.pop_front()` | 移除头部元素 |
| `lst.insert(iterator_pos, value)` | 在指定位置插入元素 |
| `lst.insert(iterator_pos, n, value)` | 在指定位置插入n个value |
| `lst.insert(iterator_pos, begin, end)` | 在指定位置插入迭代器范围 |
| `lst.erase(iterator_pos)` | 移除指定位置元素 |
| `lst.erase(iterator_first, iterator_last)` | 移除迭代器范围内的元素 |
| `lst.clear()` | 清空所有元素 |
| `lst.assign(n, value)` | 分配n个value |
| `lst.assign(begin, end)` | 分配迭代器范围内的元素 |
| `lst.swap(other_list)` | 交换两个list的内容 |
| `lst.emplace_back(args...)` | 在尾部就地构造元素 |
| `lst.emplace_front(args...)` | 在头部就地构造元素 |
| `lst.emplace(iterator_pos, args...)` | 在指定位置就地构造元素 |

# 链表特有操作

| 接口 | 说明 |
|------|------|
| `lst.splice(iterator_pos, other_list)` | 将other_list的所有元素移动到当前list的指定位置 |
| `lst.splice(iterator_pos, other_list, it)` | 将other_list的指定元素移动到当前list |
| `lst.splice(iterator_pos, other_list, first, last)` | 将other_list的指定范围移动到当前list |
| `lst.remove(value)` | 移除所有等于value的元素 |
| `lst.remove_if(predicate)` | 移除所有满足条件的元素 |
| `lst.unique()` | 移除连续的重复元素 |
| `lst.unique(binary_pred)` | 移除连续满足条件的元素 |
| `lst.merge(other_list)` | 合并两个已排序的list |
| `lst.merge(other_list, comp)` | 按指定比较器合并 |
| `lst.sort()` | 排序list |
| `lst.sort(comp)` | 按指定比较器排序 |
| `lst.reverse()` | 反转list |
```cpp
list<int> list1 = {1, 3, 5};
list<int> list2 = {2, 4, 6};

// 合并（需要先排序）
list1.merge(list2);     // list1: {1, 2, 3, 4, 5, 6}, list2: {}

// 拼接
list<int> list3 = {7, 8, 9};
auto it = list1.begin();
advance(it, 2);         // 移动到第三个位置
list1.splice(it, list3); // list1: {1, 2, 7, 8, 9, 3, 4, 5, 6}

// 移除元素
list1.remove(2);        // 移除所有2
list1.remove_if([](int x) { return x % 2 == 0; }); // 移除所有偶数

// 排序和去重
list<int> list4 = {3, 1, 2, 2, 1};
list4.sort();           // {1, 1, 2, 2, 3}
list4.unique();         // {1, 2, 3}

// 反转
list4.reverse();        // {3, 2, 1}
```
# 迭代器

| 接口 | 说明 |
|------|------|
| `lst.begin() / lst.end()` | 正向迭代器 |
| `lst.rbegin() / lst.rend()` | 反向迭代器 |
| `lst.cbegin() / lst.cend()` | 常量正向迭代器 |
# 注意事项

不支持随机访问：不能使用 [] 或 at()，访问元素需要遍历
迭代器稳定性：插入删除不会使其他迭代器失效（被删除的除外）
内存开销：每个元素需要额外存储前后指针
排序效率：sort() 成员函数比 std::sort() 算法更适合list
合并前提：merge() 要求两个list都是已排序的
拼接操作：splice() 是移动操作，原list中的元素会被移除
