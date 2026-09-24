---
title: "String"
published: 2025-10-30 19:48:49
description: "本质：动态字符序列，封装了字符串操作 头文件：include 命名空间：std:: 优点：自动内存管理，丰富的字符串操作，支持C风格字符串转换 底层：通常包含长度信息，不以\\0作为必需结尾（但支持C风格转换）"
category: "STL"
tags: ["STL", "数据结构"]
lang: "zh_CN"
draft: false
comment: true
---

# 核心概念

- **本质**：动态字符序列，封装了字符串操作
- **头文件**：`#include <string>`
- **命名空间**：`std::`
- **优点**：自动内存管理，丰富的字符串操作，支持C风格字符串转换
- **底层**：通常包含长度信息，不以`\0`作为必需结尾（但支持C风格转换）

# 构造函数

| 接口 | 说明 |
|------|------|
| `string str;` | 默认构造，创建空字符串 |
| `string str("hello");` | 从C风格字符串构造 |
| `string str("hello", 3);` | 从字符串前n个字符构造 |
| `string str(5, 'A');` | 创建包含5个'A'的字符串 |
| `string str(other_string);` | 拷贝构造 |
| `string str(other_string, pos, n);` | 从另一个string的pos位置开始取n个字符 |
| `string str = "hello";` | 赋值初始化 |

# 大小与容量

| 接口 | 说明 |
|------|------|
| `str.length()` | 返回字符串长度（同size） |
| `str.size()` | 返回字符串长度 |
| `str.capacity()` | 返回当前分配容量 |
| `str.empty()` | 检查是否为空 |
| `str.resize(new_size)` | 改变大小，新增字符默认初始化 |
| `str.resize(new_size, char)` | 改变大小，新增字符初始化为指定字符 |
| `str.reserve(new_cap)` | 预分配容量 |
| `str.shrink_to_fit()` | 请求移除未使用的容量 |
| `str.max_size()` | 返回string能支持的最大长度 |

# 元素访问

| 接口 | 说明 |
|------|------|
| `str[index]` | 不检查边界访问字符 |
| `str.at(index)` | 检查边界访问字符 |
| `str.front()` | 返回第一个字符的引用 |
| `str.back()` | 返回最后一个字符的引用 |
| `str.data()` | 返回指向底层字符数组的指针（C++17前非常量） |
| `str.c_str()` | 返回C风格字符串（const char*） |

# 修改器

| 接口                                | 说明             |
| --------------------------------- | -------------- |
| `str.push_back(char)`             | 在尾部添加字符        |
| `str.pop_back()`                  | 移除尾部字符         |
| `str.append("world")`             | 在尾部追加字符串       |
| `str.append(other_string)`        | 追加另一个string    |
| `str.append("world", 3)`          | 追加字符串的前n个字符    |
| `str += "world"`                  | 运算符重载，追加字符串    |
| `str.insert(pos, "text")`         | 在指定位置插入字符串     |
| `str.insert(pos, other_string)`   | 插入另一个string    |
| `str.erase(pos, len)`             | 从pos位置删除len个字符 |
| `str.erase(iterator)`             | 删除迭代器指向的字符     |
| `str.erase(first, last)`          | 删除迭代器范围内的字符    |
| `str.replace(pos, len, "new")`    | 替换子串           |
| `str.replace(first, last, "new")` | 替换迭代器范围内的内容    |
| `str.clear()`                     | 清空字符串          |
| `str.assign("new content")`       | 分配新内容          |
| `str.swap(other_string)`          | 交换两个string的内容  |

# 字符串操作

| 接口 | 说明 |
|------|------|
| `str.substr(pos, len)` | 返回从pos开始长度为len的子串 |
| `str.compare(other_string)` | 比较两个字符串 |
| `str.compare("c_string")` | 与C风格字符串比较 |
| `str.find("pattern")` | 查找子串，返回位置 |
| `str.find("pattern", pos)` | 从指定位置开始查找 |
| `str.rfind("pattern")` | 从后向前查找 |
| `str.find_first_of("chars")` | 查找第一个出现的指定字符 |
| `str.find_last_of("chars")` | 查找最后一个出现的指定字符 |
| `str.find_first_not_of("chars")` | 查找第一个非指定字符 |
| `str.find_last_not_of("chars")` | 查找最后一个非指定字符 |

# 迭代器

| 接口                          | 说明      |
| --------------------------- | ------- |
| `str.begin() / str.end()`   | 正向迭代器   |
| `str.rbegin() / str.rend()` | 反向迭代器   |
| `str.cbegin() / str.cend()` | 常量正向迭代器 |

# 输入输出

| 接口 | 说明 |
|------|------|
| `cin >> str` | 从输入流读取字符串（遇到空格停止） |
| `getline(cin, str)` | 从输入流读取一行 |
| `getline(cin, str, delim)` | 读取直到遇到分隔符 |
| `cout << str` | 输出到输出流 |

# 数值转换（C++11）

| 接口 | 说明 |
|------|------|
| `to_string(number)` | 数值转字符串 |
| `stoi(str)` | 字符串转int |
| `stol(str)` | 字符串转long |
| `stoll(str)` | 字符串转long long |
| `stof(str)` | 字符串转float |
| `stod(str)` | 字符串转double |
| `stold(str)` | 字符串转long double |
