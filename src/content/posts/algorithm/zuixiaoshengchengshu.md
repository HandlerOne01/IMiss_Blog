---
title: "最小生成树"
published: 2026-02-28 16:02:23
description: "最小生成树：在连通带权无向图中，找到一个边权和最小的生成树"
category: "算法"
tags: ["算法", "图论", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

最小生成树：在连通带权无向图中，找到一个边权和最小的生成树

# Prim 算法 -不断加点

核心思想：从一个顶点开始，每次将距离当前生成树最近的顶点加入树中。

算法步骤
1. 初始化：任选一个顶点作为起点，初始化所有顶点到生成树的距离为无穷大 (INF)，起点距离为 0。
2. 循环 n 次：
   · 找最近点：在未加入生成树的顶点中，找到距离当前生成树最近的点 t。
   · 判断连通性：如果 dist[t] == INF，说明图不连通，不存在 MST。
   · 加入生成树：将点 t 标记为已加入，并将 dist[t] 累加到总权值中。
   · 更新距离：用点 t 的所有邻边，更新其他未加入顶点到生成树的距离。

代码关键点：

· 数据结构：使用邻接矩阵 edges[][] 存储图。
· 距离数组：dist[j] 表示顶点 j 到当前整个生成树（而不仅是某个点）的最小距离。
· 重边处理：建图时使用 min(edges[x][y], z) 保留最小权值。
## 代码
```cpp
#include <iostream>
#include <cstring>
using namespace std;

const int N = 5010, INF = 0x3f3f3f3f;
int n, m;
int edges[N][N];  // 邻接矩阵
int dist[N];      // 到生成树的最短距离
bool st[N];       // 是否已加入生成树

int prim() {
    memset(dist, 0x3f, sizeof dist);
    dist[1] = 0;
    int ret = 0;
    
    for (int i = 1; i <= n; i++) {
        int t = 0;  // 初始化为0，dist[0]为无穷大
        
        // 1. 找距离生成树最近的点
        for (int j = 1; j <= n; j++) {
            if (!st[j] && dist[j] < dist[t]) {
                t = j;
            }
        }
        
        // 判断是否连通
        if (dist[t] == INF) return INF;
        
        st[t] = true;
        ret += dist[t];
        
        // 2. 更新其他点到生成树的距离
        for (int j = 1; j <= n; j++) {
            if (!st[j]) {
                dist[j] = min(dist[j], edges[t][j]);
            }
        }
    }
    return ret;
}

int main() {
    cin >> n >> m;
    memset(edges, 0x3f, sizeof edges);
    
    for (int i = 1; i <= m; i++) {
        int x, y, z;
        cin >> x >> y >> z;
        // 处理重边，保留最小权值
        edges[x][y] = edges[y][x] = min(edges[x][y], z);
    }
    
    int ret = prim();
    if (ret == INF) cout << "orz" << endl;
    else cout << ret << endl;
    
    return 0;
}
```
注意：
- 使用邻接矩阵,是和稠密图
- dist[j]表示顶点j到当前整个生成树的最小距离
- 时间复杂度O（n * n）

# Kruskal 算法 - 不断加边

核心思想：按边权从小到大排序，依次选择不会形成环的边

算法步骤：
1. 将所有边按权值从小到大排序
2. 初始化[查并集](/posts/algorithm/chabingji/)，每一个顶点自成集合
3. 遍历排序后的边
	- 如果边的两个顶点不在集合，则选择该边
	- 合并这两个顶点所在的集合
4. 当选中n-1条边时结束

## 代码
```cpp
#include <iostream>
#include <algorithm>
using namespace std;

const int N = 5010, M = 2e5 + 10, INF = 0x3f3f3f3f;

struct Edge {
    int x, y, z;
} edges[M];

int n, m;
int fa[N];  // 并查集

bool cmp(Edge& a, Edge& b) {
    return a.z < b.z;
}

int find(int x) {
    return fa[x] == x ? x : fa[x] = find(fa[x]);
}

int kruskal() {
    // 1. 边按权值排序
    sort(edges + 1, edges + 1 + m, cmp);
    
    // 2. 初始化并查集
    for (int i = 1; i <= n; i++) {
        fa[i] = i;
    }
    
    int cnt = 0;  // 已选边数
    int ret = 0;  // 总权值
    
    // 3. 遍历所有边
    for (int i = 1; i <= m; i++) {
        int x = edges[i].x, y = edges[i].y, z = edges[i].z;
        int fx = find(x), fy = find(y);
        
        if (fx != fy) {  // 不连通，可以加入
            fa[fx] = fy;
            ret += z;
            cnt++;
            if (cnt == n - 1) break;  // 已选够边
        }
    }
    
    return cnt == n - 1 ? ret : INF;
}

int main() {
    cin >> n >> m;
    
    for (int i = 1; i <= m; i++) {
        cin >> edges[i].x >> edges[i].y >> edges[i].z;
    }
    
    int ret = kruskal();
    if (ret == INF) cout << "orz" << endl;
    else cout << ret << endl;
    
    return 0;
}
```
## 注意
- 使用边集数组+并查集，适合稀疏图
- 需要判断最终是否选中n-1条边来判断联通性
- 时间复杂度：O（m log m）

# 算法对比

| 特性    | prim 算法            | Kruskal 算法     |
| ----- | ------------------ | -------------- |
| 思想    | 加点法                | 加边法            |
| 数据结构  | 邻接矩阵               | 边集数组+查并集       |
| 时间复杂度 | O（n * n）           | O（m log m）     |
| 适用场景  | 稠密图（m~n * n）       | 稀疏图（m <<n* n）  |
| 连通性判断 | 过程中判断 dist[t]==INF | 最后判段边数cnt==n-1 |
- 边数多，用Prim
- 边数少，用Kruskal
