---
title: "线性DP"
published: 2026-06-04 18:27:34
description: "线性DP：状态转移只依赖于前一个或前几个状态，状态之间的关系是线性的，通常可以用一维或二维数组存储状态。 三个关键要素"
category: "算法"
tags: ["算法", "动态规划", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

**线性DP**：状态转移只依赖于前一个或前几个状态，状态之间的关系是线性的，通常可以用一维或二维数组存储状态。
**三个关键要素**
1. 最优子结构：大问题的最优解包含小问题的最优解
2. 重叠子问题：子问题会被重复计算
3. 状态转移：当前状态可以从之前状态推导
# 1. 代码模板
```cpp
#include <iostream>
using namespace std;

const int N = 1e5 + 10, MOD = 1e5 + 3;
int n, k;
int f[N];    // 创建DP数组

int main() {
    cin >> n >> k;
    
    // 步骤3：初始化
    f[0] = 1;
    
    // 步骤4：确定填表顺序（从左到右）
    for (int i = 1; i <= n; i++) {
        // 步骤2：状态转移计算
        for (int j = 1; j <= k && i - j >= 0; j++) {
            // 状态转移方程（递推公式）
            f[i] = (f[i] + f[i - j]) % MOD;
        }
    }
    
    // 步骤5：确定最终结果
    cout << f[n] << endl;
    return 0;
}
```
## 1.1 代码分析
1. 状态定义
```cpp
f[i]；//表示到达第i位置的方案数
```
2. 状态转移
```cpp
f[i]=f[i-1]+f[i-2]+...+f[i-k];
//当前状态=前k个状态之和
```
3. 边界处理
```cpp
j<=k&&i-j>=0;//确保不越界
```
4. 初始化
```cpp
f[0]=1;//起点有一种方案（不动）
```

# 2. 最长上升子序列（LIS）
## 2.1 基础版本（O(n²)）

**问题：** 给定序列，求最长严格递增子序列长度

**核心思想：**
- 对于每个位置 i，考虑所有可能的"前驱位置" j (j < i)
- 如果 a[j] < a[i]，那么 a[i] 可以接在 a[j] 后面形成更长的序列

**状态定义：**
`dp[i]` = 以第 i 个元素结尾的最长上升子序列长度

**状态转移：**
```cpp
dp[i] = max(dp[j] + 1) 对于所有 j < i 且 a[j] < a[i]
```
**代码实现**
```cpp
#include <iostream>
using namespace std;

const int N = 5010;
int n;
int a[N], f[N];

int main() {
    cin >> n;
    for(int i = 1; i <= n; i++) cin >> a[i];
    
    int ret = 0;
    for(int i = 1; i <= n; i++) {
        f[i] = 1;  // 初始：只有自己
        for(int j = 1; j < i; j++) {
            if(a[j] < a[i]) {
                f[i] = max(f[i], f[j] + 1);
            }
        }
        ret = max(ret, f[i]);
    }
    
    cout << ret << endl;
    return 0;
}
```
## 2.2 最长上升子序列优化(n log n)
**核心思想**
1. 我们不关心这个序列具体长啥样，仅需知道长度以及最后一个元素是谁即可
2. 长度为i的序列有很多个，我们仅需保留最小即可
3. f[]数组是严格递增的，因此对于一个新的数a[i]，就可以二分出想要放的位置（>=a[i]的最小位置）
**因此有如下策略**
- 维护数组 f，其中 f[len] = 长度为 len 的上升子序列的最小末尾元素
- 对于新元素 a[i]：
    - 如果大于所有末尾，可以延长序列
    - 否则替换第一个 ≥ a[i] 的元素，为后面创造机会

```cpp
#include <iostream>
using namespace std;

const int N = 1e5 + 10;
int n, a[N], f[N], len;

int main() {
    cin >> n;
    for(int i = 1; i <= n; i++) cin >> a[i];
    
    for(int i = 1; i <= n; i++) {
        if(len == 0 || a[i] > f[len]) {
            f[++len] = a[i];  // 可以延长最长序列
        } else {
            // 二分查找替换位置
            int l = 1, r = len;
            while(l < r) {
                int mid = (l + r) / 2;
                if(f[mid] >= a[i]) r = mid;
                else l = mid + 1;
            }
            f[l] = a[i];  // 让同样长度的序列"门槛"更低
        }
    }
    
    cout << len << endl;
    return 0;
}
```
# 3. 最长公共子序列（LCS）
**最长公共子序列（Longest Common Subsequence，简称LCS）** 是一个经典的计算机科学问题，指的是在两个或多个序列中，找到最长的子序列，使得这个子序列在每个原序列中都按顺序出现（但不一定连续）。
**问题：** 求两个字符串的最长公共子序列长度
**核心思想：**
- 比较两个字符串的每个字符位置
- 字符相同时，继承前驱状态并+1
- 字符不同时，选择两种可能中的最大值
**状态定义：**
`dp[i][j]` = s1前i个字符与s2前j个字符的LCS长度
**状态转移**
```cpp
if(s1[i] == s2[j])   //如果相同，则继承前面长度+1
    dp[i][j] = dp[i-1][j-1] + 1
else
    dp[i][j] = max(dp[i-1][j], dp[i][j-1])   //如果不同就找（i-1，j)与（i,j-1）取max
```
**代码实现**
```cpp
#include <iostream>
using namespace std;

const int N = 5010;
string s, t;
int f[N][N];
            
int main() {
    while(cin >> s >> t) {
        int n = s.size(), m = t.size();
        s = " " + s, t = " " + t;  // 下标从1开始
        
        for(int i = 1; i <= n; i++) {
            for(int j = 1; j <= m; j++) {
                if(s[i] == t[j]) {  
                 f[i][j] = f[i-1][j-1] + 1;} 
                else {
                    f[i][j] = max(f[i-1][j], f[i][j-1]);}
            }
        }
        
        cout << f[n][m] << endl;
    }
    return 0;
}
```
# 4. 字符串A->B
**问题：** 计算将字符串A转换为字符串B所需的最少操作次数（插入、删除、替换）
**核心思想：**
- 考虑三种操作对状态的影响
- 字符相同时直接继承，不同时选择成本最小的操作
**状态定义：**
`dp[i][j]` = 将A的前i个字符转换为B的前j个字符所需的最少操作次数
**状态转移**
```cpp
if(A[i] == B[j])
    dp[i][j] = dp[i-1][j-1]
else
    dp[i][j] = min(dp[i-1][j],    // 删除A[i]
                   dp[i][j-1],    // 在A中插入B[j]，故i要与j-1相同 
                   dp[i-1][j-1])  // 将A[i]替换为B[j]
               + 1
```
**代码实现**
```cpp
#include <iostream>
using namespace std;

const int N = 2010;
string a, b;
int n, m, f[N][N];

int main() {
    cin >> a >> b;
    n = a.size(), m = b.size();
    a = " " + a, b = " " + b;
    
    // 初始化边界情况
    for(int i = 1; i <= n; i++) f[i][0] = i;  // 删除所有字符
    for(int j = 1; j <= m; j++) f[0][j] = j;  // 插入所有字符
    
    for(int i = 1; i <= n; i++) {
        for(int j = 1; j <= m; j++) {
            if(a[i] == b[j]) {
                f[i][j] = f[i-1][j-1];  // 字符匹配，无需操作
            } else {
                f[i][j] = min(min(f[i-1][j],    // 删除a[i]
                                 f[i][j-1]),    // 插入b[j]
                                 f[i-1][j-1])   // 替换a[i]为b[j]
                             + 1;
            }
        }
    }
    
    cout << f[n][m] << endl;
    return 0;
}
```
