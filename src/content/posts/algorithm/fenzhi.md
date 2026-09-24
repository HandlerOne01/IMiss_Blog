---
title: "分治"
published: 2026-02-23 17:49:15
description: "问题一分为二 —递归(DFS)-合并答案 时间优化：O(nn)-O(n log n)"
category: "算法"
tags: ["算法", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

- 问题一分为二 —>递归([DFS](/posts/algorithm/dfs/))->合并答案
- 时间优化：O(nn)->O(n log n)

- 步骤
1. 分：折半 min=(l+r)/2
2. 治：左右递归 dfs(l,mid),dfs(mid+1,r)
3. 合：跨中界的答案必须线性合并（否则白分）
4. 返：max(左，右，跨中)或累加

 **模板**
```cpp
 // 最大子段和——分治版（简洁注释）
int dfs(int l,int r){
    if(l==r) return a[l];                 // 只剩一个元素，直接返回
    int m=(l+r)>>1;                       // 折半
    int ret=max(dfs(l,m),dfs(m+1,r));     // 左右子问题最优解

    int sum=a[m], lmax=a[m];              // 向左延伸的最大后缀和
    for(int i=m-1;i>=l;--i) lmax=max(lmax,sum+=a[i]);

    sum=a[m+1]; int rmax=a[m+1];          // 向右延伸的最大前缀和
    for(int i=m+2;i<=r;++i) rmax=max(rmax,sum+=a[i]);

    return max(ret,lmax+rmax);            // 跨中、左、右三者最值
}
```

```cpp
// 逆序对——归并版（简洁注释）
ll dfs(int l,int r){
    if(l>=r) return 0;                    // 空或单元素，逆序对为 0
    int m=(l+r)>>1;
    ll ret=dfs(l,m)+dfs(m+1,r);           // 左右子区间逆序对累加

    // 以下归并两个已排好序的子区间，并统计跨越中点的逆序对
    int i=l,p1=l,p2=m+1;
    while(p1<=m&&p2<=r){
        if(a[p1]<=a[p2])  b[i++]=a[p1++]; // 左侧小，无逆序对
        else{
            ret+=m-p1+1;                  // 左侧剩余全都 > a[p2]
            b[i++]=a[p2++];
        }
    }
    while(p1<=m) b[i++]=a[p1++];          // 把剩余元素直接拷完
    while(p2<=r) b[i++]=a[p2++];
    for(int j=l;j<=r;++j) a[j]=b[j];      // 复制回原数组，供上层使用
    return ret;
}
//时间复杂度O（n log n）
```
