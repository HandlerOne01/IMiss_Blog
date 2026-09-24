---
title: "单源最短路"
published: 2026-03-15 13:36:37
description: "每次从未确定最短路径的点中，选择距离起点最近的点，标记它的最短路径，并用它来更新邻居节点的距离。"
category: "算法"
tags: ["算法", "图论", "最短路", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

# Dijkstra 算法（堆优化）
## 核心思想

每次从未确定最短路径的点中，选择距离起点最近的点，标记它的最短路径，并用它来更新邻居节点的距离。

## 算法流程

1. 初始化 dist 数组，起点 dist[s] = 0，其他为无穷大
2. 创建小根堆，将起点 {0, s} 入堆
3. 循环直到堆空：
   · 弹出堆顶元素
   · 如果该点已确定最短路，跳过
   · 否则标记为已确定，用其更新所有出边
4. 输出最短路径结果

# # 代码实现
```cpp
#include <iostream>
#include <vector>
#include <queue>
#include <cstring>
using namespace std;

const int N = 100010, INF = 0x3f3f3f3f;
typedef pair<int, int> PII;

vector<PII> edges[N];  // edges[u] = {v, w}
bool st[N];           // 标记是否已确定最短路
int dist[N];          // 存储最短路径
int n, m, s;          // 点数、边数、起点

void dijkstra() {
    memset(dist, 0x3f, sizeof dist);
    priority_queue<PII, vector<PII>, greater<PII>> heap;
    
    heap.push({0, s});  //距离和下标
    dist[s] = 0;
    
    while (heap.size()) {
        auto t = heap.top(); heap.pop();
        int u = t.second;
        
        if (st[u]) continue;  // 已确定，跳过
        st[u] = true;         // 标记为已确定
        
        for (auto& t : edges[u]) {
            int v = t.first, w = t.second;
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                heap.push({dist[v], v});
            }
        }
    }
    
    for (int i = 1; i <= n; i++) {
        cout << dist[i] << " ";
    }
}

int main() {
    cin >> n >> m >> s;
    for (int i = 1; i <= m; i++) {
        int x, y, z;
        cin >> x >> y >> z;
        edges[x].push_back({y, z});  // x->y 权重z
    }
    dijkstra();
    return 0;
}
```
## 特点
- 只使用与非负权图
- 时间复杂度：O（m log n）
- 使用堆优化，适合稀疏图

# Bellman-Ford 算法
## 核心思想
通过对所有边进行多轮松弛操作，逐步逼近最短路径。
"我不知道最短路径长什么样，但我知道它最多有 n-1 条边。那我就把所有边都试 n-1 遍，总能找到它！

## 算法流程

1. 初始化 dist 数组，起点 dist[s] = 0，其他为无穷大
2. 进行 n-1 轮松弛操作：
   · 每轮遍历所有边进行松弛
   · 如果一轮中没有发生松弛，提前结束
3. 输出结果
```cpp
struct Edge {
    int u, v, w;  // 起点、终点、权重
} e[N];

int dist[N];
int n, m, s;

void bellman_ford() {
    memset(dist, 0x3f, sizeof dist);
    dist[s] = 0;
    
    bool flag;
    for (int i = 1; i < n; i++) {  // 最多n-1轮
        flag = false;
        for (int j = 1; j <= m; j++) {
            int u = e[j].u, v = e[j].v, w = e[j].w;
            if (dist[u] != INF && dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                flag = true;
            }
        }
        if (!flag) break;  // 无松弛操作，提前结束
    }
    
    for (int i = 1; i <= n; i++) {
        cout << dist[i] << " ";
    }
}
```
## 负环检测
```cpp
bool bellman_ford_negative_cycle() {
    memset(dist, 0x3f, sizeof dist);
    dist[1] = 0;
    
    bool flag;
    for (int i = 1; i <= n; i++) {  // 循环n次
        flag = false;
        for (int j = 1; j <= m; j++) {
            int u = e[j].u, v = e[j].v, w = e[j].w;
            if (dist[u] != INF && dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                flag = true;
            }
        }
        // 第n轮仍有松弛操作 → 存在负环
        if (i == n && flag) return true;
    }
    return false;
}
```
## 特点
- 可处理负权边
- 可检测负环
- 时间复杂度O（n m）
- 适合边数较少的情况

# SPFA 算法
## 核心思想

用队列优化 Bellman-Ford，只对可能引起松弛操作的节点进行处理。

算法流程

1. 初始化 dist 数组，起点 dist[s] = 0
2. 起点入队，标记入队状态
3. 循环直到队列空：
   · 出队队首元素，取消标记
   · 遍历所有出边进行松弛
   · 如果松弛成功且节点不在队列中，入队并标记
## 代码实现
```cpp
vector<PII> edges[N];  // edges[u] = {v, w}
int dist[N];
bool st[N];           // 标记是否在队列中
int n, m, s;

void spfa() {
    memset(dist, 0x3f, sizeof dist);
    queue<int> q;
    
    q.push(s);
    dist[s] = 0;
    st[s] = true;
    
    while (!q.empty()) {
        int u = q.front(); q.pop();
        st[u] = false;  // 标记出队
        
        for (auto& t : edges[u]) {
            int v = t.first, w = t.second;
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                if (!st[v]) {
                    q.push(v);
                    st[v] = true;
                }
            }
        }
    }
    
    for (int i = 1; i <= n; i++) {
        cout << dist[i] << " ";
    }
}
```
## 负环检测
```cpp
int cnt[N];  // 记录从起点到当前点的边数

bool spfa_negative_cycle() {
    memset(dist, 0x3f, sizeof dist);
    queue<int> q;
    
    // 所有点都入队，防止不连通图
    for (int i = 1; i <= n; i++) {
        q.push(i);
        st[i] = true;
    }
    dist[1] = 0;
    
    while (!q.empty()) {
        int u = q.front(); q.pop();
        st[u] = false;
        
        for (auto& t : edges[u]) {
            int v = t.first, w = t.second;
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                cnt[v] = cnt[u] + 1;
                
                // 路径边数 ≥ n → 存在环
                if (cnt[v] >= n) return true;
                
                if (!st[v]) {
                    q.push(v);
                    st[v] = true;
                }
            }
        }
    }
    return false;
}
```
## 特点
- Bellman-Ford 的优化版
- 可处理负边权
- 平均时间复杂度：O（km），最坏O（nm）;

# 算法对比总结

| 特性    | Dijkstra   | Bellman-Ford | SPFA     |
| ----- | ---------- | ------------ | -------- |
| 适用权值  | 非负权        | 任意权值         | 任意值权     |
| 负环检测  | 不支持        | 支持           | 支持       |
| 时间复杂度 | O（m log n） | O(n m)       | 平均O(k m) |
| 空间复杂度 | O（m）       | O(m)         | O(m)     |
| 适用场景  | 非负权图       | 负权图 负环检测     | 负权图优化    |
## 选择建议
- 只有非负权：用 Dijkstra
- 有负权边，需要检测负环：用 Bellman-Ford 或 SPFA
- 一般负权图：用 SPFA（效率更高）
