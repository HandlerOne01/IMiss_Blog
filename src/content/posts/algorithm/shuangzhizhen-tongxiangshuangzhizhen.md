---
title: "双指针（同向双指针）"
published: 2026-02-23 17:49:00
description: "核心思想 right 一直往右走（不回退） left 只在“窗口非法”时被迫右移（也不回退） 时间优化：两层for-一层while; 模板（最长合法窗口）"
category: "算法"
tags: ["算法", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

- 核心思想
   right 一直往右走（不回退）
   left 只在“窗口非法”时被迫右移（也不回退）
- 时间优化：两层for->一层while;
 - 模板（最长合法窗口）
```cpp
int left = 0, ret = 0;
unordered_map<int,int> mp;          // 计数器，视题意更换
for (int right = 0; right < n; ++right) {
    // 1. 进窗口
    mp[a[right]]++;

    // 2. 判断合法性
    while (mp[a[right]] > 1) {      // 出现重复，非法
        // 3. 出窗口
        mp[a[left]]--;
        left++;
    }

    // 4. 更新答案
    ret = max(ret, right - left + 1);
}

```

- 常见题型
1. 最长无重复子串
2. 最长至多k个重复子串
