---
title: "二分"
published: 2026-02-23 17:49:04
description: "解集具“二段性”即可用：前一段不满足，后一段一定满足，或反之"
category: "算法"
tags: ["算法", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

# 二分算法
- 解集具“二段性”即可用：前一段不满足，后一段一定满足，或反之

- 两套模板
1. 找左端点，满足条件的最小下标（≥x 的最小元素）
```cpp
int l = 1, r = n;
while (l < r)
 {
    int mid = l + (r - l) / 2;   // 防溢出
    if (check(mid)) r = mid;     // 条件真，答案≤mid
    else            l = mid + 1; // 条件假，答案>mid
}
// 结束时 l==r，再验证 a[l] 是否真满足

```
2.找右端点，满足条件的最大下标（≤y 的最大元素）
```cpp
int l = 1, r = n;
while (l < r) {
    int mid = l + (r - l + 1) / 2; // 向上取整
    if (check(mid)) l = mid;       // 条件真，答案≥mid
    else            r = mid - 1;   // 条件假，答案<mid
}
```
- STL
```cpp
#include <algorithm>
vector<int> a;
auto it1 = lower_bound(a.begin(), a.end(), x); // ≥x 最小元素
auto it2 = upper_bound(a.begin(), a.end(), x); // >x 最小元素
// 返回迭代器，解引用 *it，下标 it - a.begin()。
// 想拿 ≤x 的最大元素：--it2（先判 it2!=a.begin()）

```
## 时间复杂度
O（log n）
# 二分答案
- 最大值最小/最小值最大
```cpp
bool check(int mid) { /* 判定“答案≤mid”是否可行 */ }

int left = MINAns, right = MAXAns;
while (left < right) {
    int mid = left + (right - left) / 2;   // 左端点版
    if (check(mid)) right = mid;           // 可行，尝试更小
    else            left  = mid + 1;       // 不可行，需更大
}
// left 即为“最小化最大值”

```
## 时空复杂度
O（log n）
