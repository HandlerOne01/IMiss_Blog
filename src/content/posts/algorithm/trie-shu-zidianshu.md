---
title: "Trie树（字典树）"
published: 2026-02-23 17:50:05
description: "定义：快速插入和查询字符串的数据结构 特点：利用字符串的公告前缀，将字符串组成树形结构 优势：相比map，可以高效查找公共前缀"
category: "算法"
tags: ["算法", "前缀", "预处理", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

# 基本概念
- **定义**：快速插入和查询字符串的数据结构
- **特点**：利用字符串的公告前缀，将字符串组成树形结构
- 优势：相比map，可以高效查找公共前缀

# 数据结构准备
  - **头文件**
```cpp
#include <iostream>
#include <cstring>
using namespace std;
```
- **核心数组定义**
```cpp
const int N = 1e6 + 10;  // 总节点数上限

int tree[N][26];  // Trie树结构，26个字母，
                  // tree[cur][path]从节点cur出发，走path边到达下一节点；
int p[N];         // 记录经过该节点的次数（前缀统计）
int e[N];         // 记录以该节点结尾的单词数量
int idx;          // 当前可用的节点编号
```

# 核心操作
## 插入字符串
```cpp
void insert(string &s) {
    int cur = 0;        // 从根节点开始
    p[cur]++;           // 根节点经过次数+1
    
    for (auto ch : s) {
        int path = ch - 'a';  // 计算字符对应的路径
        
        // 如果没有这条路，创建新节点
        if (tree[cur][path] == 0) {
            tree[cur][path] = ++idx;
        }
        
        cur = tree[cur][path];  // 移动到下一个节点
        p[cur]++;               // 当前节点经过次数+1
    }
    
    e[cur]++;  // 标记单词结尾
}
```
```
插入"abc"：
根(0) --a--> 节点1 --b--> 节点2 --c--> 节点3
p[0]++, p[1]++, p[2]++, p[3]++
e[3]++  // 标记单词结尾
```

# 查询完整单词出现次数
```cpp
int find(string &s) {
    int cur = 0;
    
    for (auto ch : s) {
        int path = ch - 'a';
        
        // 如果路径不存在，说明单词不存在
        if (tree[cur][path] == 0) {
            return 0;
        }
        
        cur = tree[cur][path];  // 沿着路径移动
    }
    
    return e[cur];  // 返回以该节点结尾的单词数量
}
```

## 查询前缀出现次数
```cpp
int find_pre(string &s) {
    int cur = 0;
    
    for (auto ch : s) {
        int path = ch - 'a';
        
        // 如果路径不存在，说明没有以此前缀开头的单词
        if (tree[cur][path] == 0) {
            return 0;
        }
        
        cur = tree[cur][path];  // 沿着路径移动
    }
    
    return p[cur];  // 返回经过该节点的次数（即前缀数量）
}
```
## 使用示例
```cpp
int main() {
    // 初始化
    idx = 0;
    memset(tree, 0, sizeof(tree));
    memset(p, 0, sizeof(p));
    memset(e, 0, sizeof(e));
    
    // 插入单词
    string word1 = "apple";
    string word2 = "app";
    insert(word1);
    insert(word2);
    
    // 查询
    cout << find("apple") << endl;    // 输出: 1
    cout << find("app") << endl;      // 输出: 1  
    cout << find_pre("app") << endl;  // 输出: 2 (apple和app都以app开头)
    
    return 0;
}
```

# 应用场景&注意事项
- **应用场景** :
- 单词检索：快速判断单词是否存在
- 前缀搜索：输入提示、自动补全
- 词频统计：统计单词出现次数
- 字典应用：拼写检查、单词推荐

- **注意事项**
- 节点编号：根节点始终为0，新节点从1开始编号
- 内存管理：需要预先分配足够大的数组空间
- 字符范围：示例针对小写字母，其他字符需要调整tree数组第二维大小
- 初始化：使用前务必清空数组和重置idx；
