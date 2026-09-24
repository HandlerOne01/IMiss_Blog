---
title: "BFS"
published: 2026-05-14 19:39:04
description: "核心思想： 从起点出发，像水波纹一样一层层向外扩散。由于其“层序”特性，在所有边权均为 1 的图中，第一次搜到目标节点时，所经过的路径一定是最短路。"
category: "算法"
tags: ["算法", "搜索", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. 宽度优先搜索 BFS (单源)

**核心思想：** 从起点出发，像水波纹一样一层层向外扩散。由于其“层序”特性，在所有边权均为 1 的图中，第一次搜到目标节点时，所经过的路径一定是最短路。

**核心模板：**
```cpp
void bfs() {
    memset(dist, -1, sizeof dist);
    queue<PII> q;
    q.push({x, y});
    dist[x][y] = 0; // 距离数组兼顾了标记访问的功能

    while (!q.empty()) {
        auto t = q.front(); q.pop();
        for (int k = 0; k < 8; k++) {
            int i = t.first, j = t.second;
            int nx = i + dx[k], ny = j + dy[k];
            if (nx < 1 || nx > n || ny < 1 || ny > m) continue; // 越界
            if (dist[nx][ny] != -1) continue;                   // 已访问
            
            dist[nx][ny] = dist[i][j] + 1;
            q.push({nx, ny});
        }
    }
}
```

---

# 2. 多源 BFS

**应用场景：** 图中同时存在多个起点（例如：矩阵中多个火源同时扩散，求每个点到最近火源的距离）。

**初始化逻辑：**

1. 将**所有起点**一次性全部插入队列。

2. 将所有起点的 `dist` 设为 0。

3. 后续执行与单源 BFS 完全一致。这相当于建立了一个“虚拟源点”连接了所有实际起点。

---

# 3. 01-BFS (边权仅为 0 或 1)

**核心逻辑：**

当边权不全为 1（存在 0 权边）时，普通队列不再满足单调性。使用 **双端队列 (deque)**：

- **0 权边：** 目标点权重不变，优先级最高，插入 **队头** (`push_front`)。

- **1 权边：** 目标点权重 +1，优先级较低，插入 **队尾** (`push_back`)。

**注意点：** 01-BFS 中，一个点可能被多次更新（如果之前通过 1 权边到达，后来发现了 0 权边路径）。虽然代码中通常用 `dist[nx][ny] != -1` 简写，但在某些复杂变体中，标准做法是判断 `dist[nx][ny] > dist[x][y] + w`。

```cpp
int bfs01(int x1, int y1, int x2, int y2) {
    memset(dist, 0x3f, sizeof dist); // 初始化为无穷大
    deque<pair<int, int>> q;
    q.push_back({x1, y1});
    dist[x1][y1] = 0;

    while (!q.empty()) {
        auto [x, y] = q.front(); q.pop_front();
        if (x == x2 && y == y2) return dist[x][y];

        for (int k = 0; k < 4; k++) {
            int nx = x + dx[k], ny = y + dy[k];
            if (nx < 1 || nx > n || ny < 1 || ny > m) continue;

            int w = (g[nx][ny] == g[x][y] ? 0 : 1);
            if (dist[nx][ny] > dist[x][y] + w) { // 更新最短路
                dist[nx][ny] = dist[x][y] + w;
                if (w == 0) q.push_front({nx, ny});
                else q.push_back({nx, ny});
            }
        }
    }
    return -1;
}
```

---

# 4. 常见应用对照表

|**问题类型**|**核心关键词**|**推荐算法**|
|---|---|---|
|**迷宫/网格最短路**|步数最少、边权恒为 1|单源 BFS|
|**最近距离地图**|多个起点、求到任意起点的最小值|多源 BFS|
|**电路布线/双端搜索**|开关状态切换、代价为 0 或 1|01-BFS|
|**连通性分析**|染色法、求联通块个数|BFS / DFS|
