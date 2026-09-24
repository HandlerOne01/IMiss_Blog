---
title: "区间DP"
published: 2026-04-09 13:47:35
description: "定义 区间DP是用区间的左右端点来描述状态，通过小区间的解来推导出大区间的解的动态规划方法"
category: "算法"
tags: ["算法", "动态规划", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

# 基本概念

**定义**
区间DP是用区间的左右端点来描述状态，通过小区间的解来推导出大区间的解的动态规划方法

**核心思想**
· [分治](/posts/algorithm/fenzhi/)思想：将大区间分解为小区间
· 最优子结构：大区间的最优解依赖于小区间的最优解
· 无后效性：当前区间的决策不影响已处理区间的状态
# 通用模板
```cpp
for (int len = 1; len <= n; len++) {           // 枚举区间长度
    for (int l = 1; l + len - 1 <= n; l++) {   // 枚举左端点
        int r = l + len - 1;                   // 计算右端点
        if (len == 1) {
            dp[l][r] = 初始值;
            continue;
        }
        // 根据具体问题设计状态转移
        for (int k = l; k < r; k++) {          // 枚举分割点
            dp[l][r] = min/max(dp[l][r], dp[l][k] + dp[k+1][r] + cost);
        }
    }
}
```

# 基于区间端点的讨论
## 构造回文串
题目：给定一个字符串，通过插入字符使其变成回文串，求最少插入字符数
思路：
- dp[i][j]:将子串s[i，j]变成回文串所需的最少插入次数
- 状态转移：
- 如果s[i] == s[j]：两端相同，不需要额外插入
- 如果s[i]!=s[j]：在左端或右端插入一个字符
**代码实现**
```cpp
#include <iostream>
#include <string>
#include <algorithm>
#include <cstring>
using namespace std;

const int N = 1010;
int f[N][N];

int main() {
    string s;
    cin >> s;
    int n = s.size();
    s = " " + s;  // 让下标从1开始
    
    memset(f, 0, sizeof(f));
    
    for (int len = 2; len <= n; len++) {        // 长度从2开始，枚举长度
        for (int i = 1; i + len - 1 <= n; i++) {  //枚举左端点
            int j = i + len - 1;     //计算右端点
            if (s[i] == s[j]) {
                f[i][j] = f[i + 1][j - 1];     // 两端相同，不需要插入
            } else {
                f[i][j] = min(f[i + 1][j], f[i][j - 1]) + 1;
                // f[i+1][j]: 在右边插入s[i]
                // f[i][j-1]: 在左边插入s[j]
            }
        }
    }
    
    cout << f[1][n] << endl;
    return 0;
}
```

# 基于分割点的讨论
## 石子合并

**题目**：N堆石子排成一排，每次合并相邻两堆，代价为两堆石子重量之和，求最小总代价。
思路分析
· dp[l][r]：合并区间[l, r]的石子所需的最小代价
· 状态转移：枚举最后一步合并的分割点k
· 代价计算：合并[l,k]和[k+1,r]的代价 + 本次合并的代价（[前缀和](/posts/algorithm/qianzhuihe/)）

**代码实现**
```cpp
#include <iostream>
#include <cstring>
#include <algorithm>
using namespace std;

const int N = 310;
int a[N], f[N];      // 前缀和
int dp[N][N];        // dp数组

int main() {
    int n;
    cin >> n;
    
    // 读入数据并计算
    for (int i = 1; i <= n; i++) {
        cin >> a[i];
        f[i] = f[i - 1] + a[i];  // f[i]表示前i堆石子的总重量
    }
    
    // 初始化DP数组
    memset(dp, 0x3f, sizeof(dp));  // 初始化为无穷大
    
    // 对角线初始化：单堆石子合并代价为0
    for (int i = 1; i <= n; i++) {
        dp[i][i] = 0;
    }
    
    // 区间DP
    for (int len = 2; len <= n; len++) {        // 区间长度从2开始
        for (int l = 1; l + len - 1 <= n; l++) { // 左端点
            int r = l + len - 1;                // 右端点
            for (int k = l; k < r; k++) {       // 枚举分割点
                dp[l][r] = min(dp[l][r], 
                              dp[l][k] + dp[k + 1][r] + f[r] - f[l - 1]);
                // f[r]-f[l-1]是区间[l,r]的石子总重量
            }
        }
    }
    
    cout << dp[1][n] << endl;
    return 0;
}
```

# 总结
## 两种模式对比

| 特征    | 基于端点讨论     | 基于分割点讨论     |
| ----- | ---------- | ----------- |
| 实用问题  | 区间端点特性决定解  | 区间需要分割为子区间  |
| 状态转移  | 直接比较端点字符   | 枚举分割点k      |
| 典型问题  | 回文串相关，括号匹配 | 石子合并，矩阵连乘   |
| 时间复杂度 | O（n * n）   | O（n* n * n） |
## 常见变种
1. 环形区间DP：将数组复制一份后接在后面
2. 区间DP+前缀和：快速计算区间和
3. 区间DP记录方案：额外数组记录决策点
