---
title: "背包问题"
published: 2026-03-15 13:20:45
description: "问题：每个物品选一次，总价值最大且不超过容量 v[]:代表体积 w[]:代表价值"
category: "算法"
tags: ["算法", "动态规划", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

# 01背包
## 最大价值问题
**问题**：每个物品选一次，总价值最大且不超过容量
**v[]**:代表体积
**w[]**:代表价值

```cpp
// 二维版本
int f[N][N];  // f[i][j]: 前i个物品容量j的最大价值
memset(f, 0, sizeof f);

for (int i = 1; i <= n; i++) {
    for (int j = 0; j <= m; j++) {
        f[i][j] = f[i - 1][j];  // 不选
        if (j >= v[i]) {
            f[i][j] = max(f[i][j], f[i - 1][j - v[i]] + w[i]);
        }
    }
}

// 🚀 一维优化版本（推荐）
int f[N];
memset(f, 0, sizeof f);
for (int i = 1; i <= n; i++) {
    for (int j = m; j >= v[i]; j--) {  // ⚠️必须倒序！
        f[j] = max(f[j], f[j - v[i]] + w[i]);
    }
}
```
**注意**：
- 一维倒序遍历（当前答案需要上和左上）
- 初始化全0（无要求恰好装满）

## 恰好装满问题
**问题**：背包必须刚好放满，求最大价值
```cpp
// 初始化是关键！
memset(f, -0x3f, sizeof f);  // 负无穷表示不可达
f[0][0] = 0;  // 唯一合法起点

for (int i = 1; i <= n; i++) {
    for (int j = 0; j <= m; j++) {
        f[i][j] = f[i - 1][j];  // 不选
        if (j >= v[i]) {
            f[i][j] = max(f[i][j], f[i - 1][j - v[i]] + w[i]);
        }
    }
}
if (f[n][m] < 0) cout << "无法装满";
else cout << f[n][m];
```
**初始化注意**
- 负无穷表示“不可能状态”
- 只有f[0][0]是合法起点（什么都不选，容量为0）

## 方案数问题
**问题**：求恰好装满容量M的方案数
```cpp
int f[N];  // f[j]: 装满容量j的方案数
memset(f, 0, sizeof f);
f[0] = 1;  // 容量0有1种方案（不选）

for (int i = 1; i <= n; i++) {
    for (int j = m; j >= v[i]; j--) {
        f[j] += f[j - v[i]];  // 累加方案数
    }
}
cout << f[m] << endl;

//二维
int f[N][M];  // f[i][j]: 前i个物品，装满容量j的方案数
memset(f, 0, sizeof f);
f[0][0] = 1;  // 容量0有1种方案（不选）

for (int i = 1; i <= n; i++) {
    for (int j = 0; j <= m; j++) {
        // 先继承上一层的方案数（不选第i个物品）
        f[i][j] = f[i-1][j];
        
        // 如果能选第i个物品，则累加上选择它的方案数
        if (j >= v[i]) {
            f[i][j] += f[i-1][j - v[i]];
        }
    }
}
cout << f[n][m] << endl;
```
**注意**：方案数初始化时如：f[1][0]=1,f[0][1]=0等均有意义；故不可初始化负无穷

# 完全背包
## 物品无限个，求最大价值
```cpp
// 二维理解
for (int i = 1; i <= n; i++) {
    for (int j = 0; j <= m; j++) {
        f[i][j] = f[i - 1][j];
        if (j >= v[i]) {
            f[i][j] = max(f[i][j], f[i][j - v[i]] + w[i]);  // 注意是f[i]
        }
    }
}

// 一维优化版本
int f[N];
memset(f, 0, sizeof f);
for (int i = 1; i <= n; i++) {
    for (int j = v[i]; j <= m; j++) {  // 必须正序！
        f[j] = max(f[j], f[j - v[i]] + w[i]);
    }
}
```
## 01背包与完全背包的核心区别

| 特征   | 01背包           | 完全背包           |
| ---- | -------------- | -------------- |
| 遍历顺序 | j=w->v[i] (倒序) | j=v[i]->m (正序) |
| 状态转移 | f[i-1][j-v]+w  | f[i][j-v]+w    |
| 物理意义 | 防止重复选择         | 允许重复选择         |
## 恰好装满
```cpp
memset(f, -0x3f, sizeof f);
f[0] = 0;
for (int i = 1; i <= n; i++) {
    for (int j = v[i]; j <= m; j++) {
        f[j] = max(f[j], f[j - v[i]] + w[i]);
    }
}
// 检查f[m]是否>=0
```

# 多重背包
## 基础版本
**问题**：物品有数量限制，求最大价值
```cpp
for (int i = 1; i <= n; i++) {
    for (int j = m; j >= 0; j--) {
        for (int k = 1; k <= s[i] && k * v[i] <= j; k++) {
            f[j] = max(f[j], f[j - k * v[i]] + k * w[i]);
        }
    }
}

//二维
int f[N][M];  // f[i][j]: 前i个物品，容量j的最大价值
memset(f, 0, sizeof f);

for (int i = 1; i <= n; i++) {
    for (int j = 0; j <= m; j++) {
        // 先继承不选第i个物品的情况
        f[i][j] = f[i-1][j];
        
        // 枚举第i个物品选几个
        for (int k = 1; k <= s[i] && k * v[i] <= j; k++) {
            f[i][j] = max(f[i][j], f[i-1][j - k * v[i]] + k * w[i]);
        }
    }
}
cout << f[n][m] << endl;
```
## 二进制优化
```cpp
//优化原理：用1，2，4，...等2的幂次组合表示任意数量
vector<pair<int, int>> items;  // (体积, 价值)

// 二进制拆分
for (int i = 1; i <= n; i++) {
    int cnt = s[i];
    for (int k = 1; k <= cnt; k *= 2) {
        items.push_back({k * v[i], k * w[i]});
        cnt -= k;
    }
    if (cnt > 0) {
        items.push_back({cnt * v[i], cnt * w[i]});
    }
}

// 转化为01背包
for (auto &item : items) {
    for (int j = m; j >= item.first; j--) {
        f[j] = max(f[j], f[j - item.first] + item.second);
    }
}
```

# 分组背包
**问题**：每组物品只能选一个，求最大价值
```cpp
#include <bits/stdc++.h>
using namespace std;

const int N = 105;   // 最大组数
const int M = 1005;  // 背包最大容量
int f[N][M];  // f[i][j]: 考虑前i组，容量为j的最大价值
vector<pair<int, int>> g[N];  // g[i]: 第i组的物品列表 (体积, 价值)

int main() {
    int n, m;
    cin >> n >> m;
    
    // 输入分组信息
    int cnt = 0;  // 组数
    for (int i = 1; i <= n; i++) {
        int group;  // 物品所属的组号
        cin >> group;
        int v, w;
        cin >> v >> w;
        g[group].push_back({v, w});
        cnt = max(cnt, group);  // 更新最大组号
    }
    
    // 初始化
    memset(f, 0, sizeof f);  // 非恰好装满问题
    
    // 分组背包核心代码（二维版本）
    for (int i = 1; i <= cnt; i++) {  // 遍历每一组
        for (int j = 0; j <= m; j++) {  // 遍历容量
            // 不选第i组的任何物品
            f[i][j] = f[i-1][j];
            
            // 选第i组的某个物品
            for (auto &item : g[i]) {
                int v = item.first, w = item.second;
                if (j >= v) {
                    f[i][j] = max(f[i][j], f[i-1][j - v] + w);
                }
            }
        }
    }
    
    cout << f[cnt][m] << endl;
    return 0;
}
```
## 如果是恰好装满问题
```cpp
#include <bits/stdc++.h>
using namespace std;

const int N = 105;
const int M = 1005;
const int INF = 0x3f3f3f3f;
int f[N][M];
vector<pair<int, int>> g[N];

int main() {
    int n, m;
    cin >> n >> m;
    
    // 输入分组信息
    int cnt = 0;
    for (int i = 1; i <= n; i++) {
        int group, v, w;
        cin >> group >> v >> w;
        g[group].push_back({v, w});
        cnt = max(cnt, group);
    }
    
    // 恰好装满的初始化
    memset(f, -0x3f, sizeof f);
    f[0][0] = 0;  // 前0组，容量0，价值0（合法）
    
    // 分组背包（恰好装满）
    for (int i = 1; i <= cnt; i++) {
        for (int j = 0; j <= m; j++) {
            // 不选第i组的任何物品
            f[i][j] = f[i-1][j];
            
            // 选第i组的某个物品
            for (auto &item : g[i]) {
                int v = item.first, w = item.second;
                if (j >= v && f[i-1][j - v] != -INF) {
                    f[i][j] = max(f[i][j], f[i-1][j - v] + w);
                }
            }
        }
    }
    
    if (f[cnt][m] < 0) cout << "无法装满" << endl;
    else cout << f[cnt][m] << endl;
    
    return 0;
}
```

# 特殊变种问题

## 至少装满问题
**问题**：价值至少为M时的最小花费

```cpp
#include <bits/stdc++.h>
using namespace std;

const int N = 105;   // 物品数量
const int M = 1005;  // 目标价值上限
int f[N][M];  // f[i][j]: 考虑前i个物品，价值至少为j的最小花费
int p[N], c[N];  // 价值, 花费

int main() {
    int n, m;  // m: 至少需要的价值
    cin >> n >> m;
    
    for (int i = 1; i <= n; i++) {
        cin >> p[i] >> c[i];
    }
    
    // 初始化：求最小值，初始化为无穷大
    memset(f, 0x3f, sizeof f);
    
    // 价值至少为0的最小花费是0
    for (int i = 0; i <= n; i++) {
        f[i][0] = 0;
    }
    
    // 动态规划
    for (int i = 1; i <= n; i++) {
        for (int j = 0; j <= m; j++) {
            // 不选第i个物品
            f[i][j] = f[i-1][j];
            
            // 选第i个物品
            // 关键：当j-p[i] <= 0时，表示已经超额满足，取f[i-1][0]
            int prev = max(0, j - p[i]);
            f[i][j] = min(f[i][j], f[i-1][prev] + c[i]);
        }
    }
    
    // 输出结果：价值至少为m的最小花费
    cout << f[n][m] << endl;
    
    return 0;
}
```

**二维**
```cpp
int p[N], c[N];  // 价值, 花费
memset(f, 0x3f, sizeof f);  // 求最小值初始化无穷大
f[0] = 0;

for (int i = 1; i <= n; i++) {
    for (int j = m; j >= 0; j--) {
        // 关键：max(0, j-p[i])处理超额情况
        f[j] = min(f[j], f[max(0, j - p[i])] + c[i]);
    }
}
```

## 求具体方案
```cpp
// 倒推求方案
int j = m;
for (int i = n; i >= 1; i--) {
    if (j >= v[i] && f[j] == f[j - v[i]] + w[i]) {
        cout << i << " ";  // 选第i个物品
        j -= v[i];
    }
}
```

1. **至少装满 vs 恰好装满**：

    - 恰好装满：`f[j]` 从 `f[j-v[i]]` 转移

    - 至少装满：`f[j]` 从 `f[max(0, j-p[i])]` 转移，允许超额

2. **超额处理**：当 `j - p[i] <= 0` 时，表示选了这个物品后已经超过目标价值，此时只需要基础状态 `f[i-1][0]`

3. **初始化**：价值至少为0，无论选了多少物品，花费都是0（不选任何物品）
4. 当价值/容量被"填满"或"超额"时，就会触达某个 f[i][0]

5. f[i][0] 是所有合法路径的必经之路
# 总结

## 初始化策略表

| 问题类型 | 初始化          | 最终检查      |
| ---- | ------------ | --------- |
| 最大价值 | 全0           | 直接输出f[m]  |
| 恰好装满 | f[0]=0,其他负无穷 | f[m]>0才有效 |
| 方案计数 | f[0]=1,其他0   | 直接输出f[m]  |
| 最小花费 | f[0]=0,其他正无穷 | 直接输出f[m]  |
