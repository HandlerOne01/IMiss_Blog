---
title: "DFS"
published: 2026-06-05 10:22:31
description: "遍历是是形式，搜索是目的；回溯是“回头”，剪枝是“砍树”，记忆化是“记答案”；"
category: "算法"
tags: ["算法", "搜索", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

**遍历是是形式，搜索是目的；回溯是“回头”，剪枝是“砍树”，记忆化是“记答案”；**

# 深度优先遍历（DFS）
## DFS框架
```cpp
void dfs(int u) {
    if (终点/边界) { 更新答案; return; }
    for (int v : 邻接点) {
        if (vis[v]) continue;     // 已访问剪枝
        vis[v] = 1;               // 标记
        path.push_back(v);        // 选入路径
        dfs(v);                   // 深入
        vis[v] = 0;               // 恢复现场
        path.pop_back();          // 撤销选择
    }
}

```
DFS 的逻辑可以类比为“走迷宫”：

- 选择一条路向前走，直到遇到障碍或死胡同。

- 当无法继续前进时，**回溯（Backtrack）** 到上一个分叉口，选择另一条路继续尝试。

- **重复**以上过程，直到所有路径都被探索。
## 剪枝(优化技巧1)
**在搜索过程中，如果发现当前路径已经不可能达到最优解或目标，提前停止递归，极大减少计算量。**

| 类型     | 条件判断       | 效果          |
| ------ | ---------- | ----------- |
| 可行性剪枝  | 当前已违反约束    | 直接 return   |
| 最优性剪枝  | 当前代价>=已知最优 | 直接 return   |
| 排除等效冗余 | 同一状态不同路径   | 只搜一次（排序/哈希） |
## 记忆化搜索（优化技巧2）
**记录已计算过的状态结果，避免在 DFS 中重复搜索。**

```cpp
//以洛谷P1434滑雪为例

// 滑雪问题 - 记忆化搜索
#include<iostream>
#include<cstring>
#include<algorithm>
using namespace std;

const int N = 310;  // 根据题目要求，通常滑雪问题最大为300左右

int n, m;  // 滑雪场的行数和列数
int h[N][N];  // 各点的高度
int f[N][N];  // 备忘录，f[i][j]表示从(i,j)出发的最长滑雪长度，-1表示未计算
int dx[4] = {-1, 0, 1, 0};  // 四个方向：上、右、下、左
int dy[4] = {0, 1, 0, -1};

// 记忆化搜索：计算从(i,j)出发的最长滑雪长度
int dfs(int i, int j) {
    if (f[i][j] != -1) return f[i][j]; // 已经算过，直接返回

    int &len = f[i][j] = 1;           // 初始长度是 1（自己这一格）
    for (int k = 0; k < 4; k++) {     // 四个方向滑下去
        int x = i + dx[k], y = j + dy[k];
        if (x < 1 || x > n || y < 1 || y > m) continue;  // 边界检查
        if (h[x][y] >= h[i][j]) continue; // 必须严格更低才能滑下去
        
        len = max(len, dfs(x, y) + 1);    // 滑下去的长度 +1
    }
    return len; // 返回从 (i, j) 出发的最长滑雪长度
}

int main() {
    // 输入滑雪场大小
    cin >> n >> m;
    
    // 输入各点高度
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= m; j++) {
            cin >> h[i][j];
        }
    }
    
    // 初始化备忘录为-1（表示未计算）
    memset(f, -1, sizeof f);
    
    // 计算从每个点出发的最长滑雪长度，取最大值
    int ans = 0;
    for (int i = 1; i <= n; i++) {
        for (int j = 1; j <= m; j++) {
            ans = max(ans, dfs(i, j));
        }
    }
    
    // 输出结果
    cout << ans << endl;
    
    return 0;
}

```

# DFS枚举算法
**DFS 的关键要素**
1. **访问标记（Visited Array）**：

    - 在图论搜索中，为了防止死循环（环路），必须记录哪些节点已被访问。

2. **终止条件（Base Case）**：

    - 递归必须有出口。例如：到达了叶子节点、找到了目标状态、或者超出了边界。

3. **回溯（Backtracking）**：

    - **回溯是 DFS 的精髓**。它允许你在尝试失败后撤销当前选择，返回到上一步。在解决排列组合、八皇后问题或数独时，回溯必不可少。

## 子集枚举
**问题**：枚举几何的所有子集（包括空集）
算法步骤
1. 从第一个元素开始
2. 每个元素两种选择：选或不选
3. 记录所有路径：每个节点都是有效结点
4. 回溯：选择完后撤销选择
时间复杂度：O（2^n）-每个元素两种选择
空间复杂度：O（n）-递归栈深度
### 选或不选（二进制思想）
```cpp
#include <iostream>
#include <vector>
using namespace std;
vector<vector<int>> result;  // 存储所有子集结果
vector<int> path;           // 存储当前路径（当前子集）
vector<int> nums;           // 全局nums数组

void dfs(int pos)
{
	if(pos>=nums.size()){
		result.push_back(path);
		return ;
	}
	
	dfs(pos+1);
	
	path.push_back(nums[pos]);
	dfs(pos+1);
	path.pop_back();
}

int main() {
    // 初始化nums数组
    nums = {1, 2, 3};  // 可以修改为任意测试数据
    
    // 清空结果和路径
    result.clear();
    path.clear();
    
    // 从第1个元素开始DFS
    dfs(0);
    
    // 输出为：[] [3] [2] [23] [1] [13] [12] [123] 格式
    for (const auto& subset : result) {
        cout << "[";
        for (int i = 0; i < subset.size(); i++) {
            cout << subset[i];
        }
        cout << "] ";
    }
    cout << endl;
    
    return 0;
}
```
### 按起始位置枚举
```cpp
#include <iostream>
#include <vector>
using namespace std;

vector<vector<int>> result;
vector<int> path;
vector<int> nums;  // 全局nums数组

void dfs(int start) {
    // 每个节点都是有效结果，不只是叶子节点
    result.push_back(path);  // 记录当前路径作为一个子集
    
    // 从start开始，避免重复选择
    for (int i = start; i <= nums.size(); i++) {
        path.push_back(nums[i-1]);      // 选择当前元素（注意索引要减1）
        dfs(i + 1);                     // 递归：从下一个位置开始，避免重复
        path.pop_back();                // 回溯：撤销选择
    }
}

int main() {
    // 初始化nums数组
    nums = {1, 2, 3};  // 可以修改为任意测试数据
    
    // 清空结果和路径
    result.clear();
    path.clear();
    
    // 从第1个元素开始DFS
    dfs(1);
    
    // 输出为：[] [1] [12] [123] [13] [2] [23] [3] 格式
    for (const auto& subset : result) {
        cout << "[";
        for (int i = 0; i < subset.size(); i++) {
            cout << subset[i];
        }
        cout << "] ";
    }
    cout << endl;
    
    return 0;
}
```

## 组合枚举
**问题描述**
从n个元素中选k个的所有组合（不考虑顺序）

算法步骤
1. 从起始位置开始选择
2. 固定长度终止
3. 避免重复：只从后面元素选择
4. 回溯：尝试其他选择

时间复杂度：O（C（n,k））-组合数
空间复杂度：O（k）-路径长度

```cpp
#include <iostream>
#include <vector>
using namespace std;

vector<vector<int>> result;  // 存储所有组合结果
vector<int> path;           // 存储当前组合
int n, k;                   // 全局变量

void dfs(int start) {
    // 终止条件：当前组合长度等于k
    if (path.size() == k) {
        result.push_back(path);  // 保存有效组合
        return;
    }
    
    // 从start开始选择，避免重复和保证顺序
    for (int i = start; i <= n; i++) {
        path.push_back(i);           // 选择当前数字
        dfs(i + 1);                  // 关键：从i+1开始，避免重复选择
        path.pop_back();             // 回溯：撤销选择
    }
}

int main() {
    // 初始化参数
    n = 4;  // 从1到n的数字
    k = 2;  // 组合长度
    
    // 清空结果和路径
    result.clear();
    path.clear();
    
    // 从数字1开始选择
    dfs(1);
    
    // 输出为：12 13 14 23 24 34 格式
    for (const auto& comb : result) {
        for (int i = 0; i < comb.size(); i++) {
            cout << comb[i];
        }
        cout << " ";
    }
    cout << endl;
    
    return 0;
}
```

## 排列枚举
### 全排列（无重复元素）
算法步骤
1. 从头遍历所有元素
2. 使用标记数组：记录已用元素
3. 长度满就记录：选满n个元素
4. 回溯恢复：撤销并恢复标记
时间复杂度：O（n!）
空间复杂度：O（n）
```cpp
#include <iostream>
#include <vector>
using namespace std;

vector<vector<int>> result;  // 存储所有排列结果
vector<int> path;           // 存储当前排列
vector<bool> used;          // 标记数组，记录哪些元素已被使用
int n;                      // 全局变量，表示从1到n的数字

void dfs() {
    // 终止条件：当前排列长度等于n
    if (path.size() == n) {
        result.push_back(path);  // 保存完整排列
        return;
    }
    
    // 排列问题：每次都从1开始遍历所有数字
    for (int i = 1; i <= n; i++) {
        if (!used[i]) {           // 如果当前数字未被使用
            used[i] = true;       // 标记为已使用
            path.push_back(i);    // 加入当前排列
            dfs();                // 递归处理下一位置
            path.pop_back();      // 回溯：撤销选择
            used[i] = false;      // 回溯：恢复标记
        }
    }
}

int main() {
    // 示例
    n = 3;  // 从1到n的数字
    
    // 初始化标记数组（索引从1到n）
    used.resize(n + 1, false);
    result.clear();
    path.clear();
    
    // 开始DFS排列
    dfs();
    
    // 输出为：123 132 213 231 312 321 格式
    for (int i = 0; i < result.size(); i++) {
        for (int j = 0; j < result[i].size(); j++) {
            cout << result[i][j];
        }
        cout << " ";
    }
    cout << endl;
    
    return 0;
}
```

```cpp
示例
[1,2,3], [1,3,2], [2,1,3], [2,3,1], [3,1,2], [3,2,1]
```
### 全排列（有重复元素）
算法步骤
1. 先排序：让相同元素相邻
2. 从头遍历所有元素
3. 使用标记数组：记录已用元素
4. 剪枝去重：跳过相同元素的重复选择
5. 条件判断：前一个相同元素没被使用才跳过
6. 长度满就记录：选满n个元素
7. 回溯恢复：撤销并恢复标记
时间复杂度：O（n!）
空间复杂度：O（n)
```cpp
#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

vector<vector<int>> result;
vector<int> path;
vector<bool> used;
vector<int> nums;

void dfs() {
    if (path.size() == nums.size()) {
        result.push_back(path);
        return;
    }
    
    for (int i = 0; i < nums.size(); i++) {
        if (used[i] || (i > 0 && nums[i] == nums[i-1] && !used[i-1])) {
            continue;
        }
        
        used[i] = true;
        path.push_back(nums[i]);
        dfs();
        path.pop_back();
        used[i] = false;
    }
}

int main() {
    nums = {1, 2, 3};
    sort(nums.begin(), nums.end());
    used.resize(nums.size(), false);
    dfs();
    
    // 输出为：123 321 格式
    for (int i = 0; i < result.size(); i++) {
        for (int j = 0; j < result[i].size(); j++) {
            cout << result[i][j];
        }
        cout << " ";
    }
    cout << endl;
    
    return 0;
}
```

```cpp
if (used[i] || (i > 0 && nums[i] == nums[i-1] && !used[i-1])) {
            continue;
        }
```
**`i > 0` 是为了防止数组越界！**
**是 `!used[i-1]` 这个条件保证了相对顺序！**

这个条件说：**如果前一个相同元素还没有被使用，就不能使用当前这个元素**

**举个例子** `[1,1,2]`：

- 两个1：位置0的1（1a），位置1的1（1b）

**这个条件强制：**

1. **想用1b（位置1）时，必须先检查1a（位置0）是否被用过**

2. 如果1a还没用，就不能用1b，必须**先用1a**

3. 这样就保证了 **1a永远在1b之前被使用**
