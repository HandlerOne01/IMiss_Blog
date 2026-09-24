---
title: "拓扑排序"
published: 2026-02-23 17:50:50
description: "定义：在有向图中，顶点表示活动，有向边表示活动Vi必须先于活动Vj进行 特性：必须是有向无环图"
category: "算法"
tags: ["算法", "图论", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

# 基本概念
## AOV网
- 定义：在有向图中，顶点表示活动，有向边<Vi,Vj>表示活动Vi必须先于活动Vj进行
- 特性：必须是有向无环图

## 拓扑排序
## 定义
将有向无环图中的所有结点排序，使得排在前面的结点不能依赖于排在后面的结点。

## 核心思想
不断选择图中入度为0的顶点输出，并删除该顶点及其所有出边。

## 算法流程
1. 初始化：
   · 计算所有顶点的入度
   · 将所有入度为 0 的顶点加入队列
2. 循环处理：
   · 从队列中取出队头元素并输出
   · 删除该顶点的所有出边（即后继顶点入度减1）
   · 如果某个后继顶点的入度变为 0，将其加入队列
3. 结束条件：
   · 队列为空

## 环检测
· 无环：所有顶点都进入过队列
· 有环：存在未进入队列的顶点（这些顶点形成了环）

# 代码实现
```cpp
#include <iostream>
#include <vector>
#include <queue>
using namespace std;

const int N = 100010;

vector<int> graph[N];  // 邻接表
int inDegree[N];       // 入度数组
int n, m;              // 顶点数、边数

bool topologicalSort() {
    queue<int> q;
    vector<int> result;
    
    // 1. 将所有入度为0的顶点加入队列
    for (int i = 1; i <= n; i++) {
        if (inDegree[i] == 0) {
            q.push(i);
        }
    }
    
    // 2. 处理队列中的顶点
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        result.push_back(u);
        
        // 删除u的所有出边，更新后继顶点的入度
        for (int v : graph[u]) {
            inDegree[v]--;
            if (inDegree[v] == 0) {
                q.push(v);
            }
        }
    }
    
    // 3. 判断是否有环
    if (result.size() == n) {
        // 输出拓扑序列
        for (int node : result) {
            cout << node << " ";
        }
        cout << endl;
        return true;  // 无环
    } else {
        cout << "图中存在环！" << endl;
        return false; // 有环
    }
}

int main() {
    cin >> n >> m;
    
    // 构建图和入度数组
    for (int i = 0; i < m; i++) {
        int u, v;
        cin >> u >> v;
        graph[u].push_back(v);
        inDegree[v]++;
    }
    
    topologicalSort();
    
    return 0;
}
```
# 关键要点
## 时间复杂度
 - O(n + m)：每个顶点和边各处理一次

## 应用场景
1. 课程安排：先修课程关系
2. 任务调度：依赖任务执行顺序
3. 编译顺序：源文件依赖关系
4. 工作流：工序先后关系

## 注意事项
1. 拓扑序列不唯一：同一DAG可能有多个合法的拓扑序列
2. 必须是有向图：无向图无法定义先后关系
3. 必须无环：有环图无法进行拓扑排序
# 环检测应用
```
// 判断有向图是否有环
bool hasCycle() {
    return !topologicalSort();
}
```
