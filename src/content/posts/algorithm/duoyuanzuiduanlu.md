---
title: "多源最短路"
published: 2026-06-05 12:00:20
description: "Floyd算法是一种多源最短路径算法，用于求解图中任意两个节点之间的最短路径。该算法基于动态规划，通过不断在路径中插入中间节点来更新最短路径，因此也被称为插点法。"
category: "算法"
tags: ["算法", "图论", "最短路", "动态规划", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

# Floyd 算法
## 算法概述
Floyd算法是一种多源最短路径算法，用于求解图中任意两个节点之间的最短路径。该算法基于[动态规划](/posts/algorithm/dongtaiguihua/)，通过不断在路径中插入中间节点来更新最短路径，因此也被称为插点法。

### 适用条件

· 适用于任何图（有向图、无向图、带权图）
· 要求不存在负环（但可以处理负权边）
· 最短路必须存在

### 核心思想

**状态定义**

设 f[k][i][j] 表示经过编号不超过 k 的节点，从节点 i 到节点 j 的最短路径长度。

**状态转移方程**

对于每个中间节点 k，考虑两种情况：

```cpp
1. 不经过节点 k：f[k][i][j] = f[k-1][i][j]

2. 经过节点 k：f[k][i][j] = f[k-1][i][k] + f[k-1][k][j]


取两者最小值：f[k][i][j] = min(f[k-1][i][j], f[k-1][i][k] + f[k-1][k][j]
```
### 空间优化
实际实现中省略第一维，使用二维数组迭代更新
```cpp
f[i][j] = min(f[i][j], f[i][k] + f[k][j])
```
### 代码实现
```cpp
#include <iostream>
#include <cstring>
#include <algorithm>
using namespace std;

const int N = 210;  // 根据题目调整大小
const int INF = 0x3f3f3f3f;
int f[N][N];
int n, m;

int main() {
    cin >> n >> m;
    
    // 初始化
    memset(f, 0x3f, sizeof f);
    for (int i = 1; i <= n; i++) {
        f[i][i] = 0;  // 自己到自己的距离为0
    }
    
    // 读入边
    for (int i = 1; i <= m; i++) {
        int a, b, c;
        cin >> a >> b >> c;
        f[a][b] = f[b][a] = min(f[a][b], c);  // 处理重边，选择最小边
    }
    
    // Floyd算法核心
    for (int k = 1; k <= n; k++) {
        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= n; j++) {
                if (f[i][k] != INF && f[k][j] != INF) {  // 防止溢出
                    f[i][j] = min(f[i][j], f[i][k] + f[k][j]);
                }
            }
        }
    }
    
    // 输出结果
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= n; j++) {
            if (f[i][j] == INF) {
                cout << "INF ";
            } else {
                cout << f[i][j] << " ";
            }
        }
        cout << endl;
    }
    
    return 0;
}
```

三维
```cpp
#include <iostream>
#include <cstring>
#include <algorithm>
using namespace std;

const int N = 210;  // 根据题目调整大小
const int INF = 0x3f3f3f3f;
int f[N][N][N];
int n, m;

int main() {
    cin >> n >> m;
    
    // 初始化
    memset(f, 0x3f, sizeof f);
    
    // 初始化k=0的情况（不经过任何中间点）
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= n; j++) {
            if (i == j) {
                f[0][i][j] = 0;  // 自己到自己的距离为0
            }
        }
    }
    
    // 读入边（初始化k=0的直接路径）
    for (int i = 1; i <= m; i++) {
        int a, b, c;
        cin >> a >> b >> c;
        f[0][a][b] = min(f[0][a][b], c);  // 处理重边
        f[0][b][a] = min(f[0][b][a], c);  // 无向图
    }
    
    // Floyd算法核心（三维版本）
    for (int k = 1; k <= n; k++) {
        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= n; j++) {
                // 状态转移：经过前k个点 = min(经过前k-1个点, 经过第k个点)
                if (f[k-1][i][k] != INF && f[k-1][k][j] != INF) {
                    f[k][i][j] = min(f[k-1][i][j], f[k-1][i][k] + f[k-1][k][j]);
                } else {
                    f[k][i][j] = f[k-1][i][j];
                }
            }
        }
    }
    
    // 输出结果（使用经过所有n个点的结果）
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= n; j++) {
            if (f[n][i][j] == INF) {
                cout << "INF ";
            } else {
                cout << f[n][i][j] << " ";
            }
        }
        cout << endl;
    }
    
    return 0;
}
```

### 时空复杂度

时间复杂度
· O(n³)，其中 n 为节点数
· 三重循环：k → i → j

空间复杂度
· O(n²)，使用二维数组存储距离矩阵

通过数学归纳法证明算法正确性：

· 基础：k=0时，f[i][j]为直接边权值
· 归纳：假设已知前k-1个节点时的最短路径，加入第k个节点时，要么不经过k，要么经过k

### 注意事项

1. 初始化要点：
   · 对角线元素初始化为0
   · 有边连接的点初始化为边权值
   · 无边连接的点初始化为无穷大
2. 重边处理：
   ```cpp
   f[a][b] = min(f[a][b], c);  // 取最小边权
   ```
3. 负权边处理：
   · 可以处理负权边
   · 但不能处理负环（会陷入无限循环）
4. 无穷大判断：
   ```cpp
   if (f[i][k] != INF && f[k][j] != INF) {
       // 防止整数溢出
   }
   ```

### 应用场景

1. 任意两点间最短路径问题
2. 传递闭包计算
3. 最小环检测
4. 图的连通性判断
