---
title: "查并集"
published: 2026-03-19 19:00:42
description: "维护“集合”的三件套：查询/合并/判同"
category: "算法"
tags: ["算法", "预处理", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

维护“集合”的三件套：查询/合并/判同

# 普通并查集
## 数据结构
- fa[i]:结点i的父指针，根结点指向自己
- 初始化：每个元素自成集合，fa[i]=i;
## 三大基础操作
```cpp
void init(int n) { for(int i=1;i<=n;i++) fa[i]=i; }

int find(int x) {                    // 路径压缩
    if(fa[x]==x) return x;
    return fa[x]=find(fa[x]);
}

void un(int x,int y) {               // 按秩/大小合并可写一行
    int fx=find(x), fy=find(y);
    if(fx!=fy) fa[fx]=fy;            // 把 fx 挂到 fy 下
}

bool same(int x,int y) { return find(x)==find(y); }

```
## 统计集合个数
```cpp
int cnt=0;
for(int i=1;i<=n;i++) if(fa[i]==i) cnt++;

```
# 扩展域查并集（关系>2种）
- **核心思想**：把“每个元素”拆成多个域，每个域代表一种状态/关系，用偏移量存储。
## 经典场景：朋友&敌人（2倍域）
- 域1~n: 朋友身份
- 域n+1~2n:敌人身份
## 合并规则
- 朋友 x,y → un(x,y) 且 un(x+n,y+n)
- 敌人 x,y → un(x,y+n) 且 un(y,x+n)
## 代码模板
```cpp
const int N = 1e6 + 10;
int fa[N * 2];             // 0~n-1 为原域，n~2n-1 为“敌人域”

void init(int n) {
    for (int i = 1; i <= 2 * n; i++) fa[i] = i;
}

int find(int x) {          // 与普通版完全相同
    if (fa[x] == x) return x;
    return fa[x] = find(fa[x]);
}

void un(int x, int y) {    // 合并根，普通写法
    int fx = find(x), fy = find(y);
    if (fx != fy) fa[fx] = fy;
}

void mergeFriend(int x, int y, int n) { // 朋友：双向绑定
    un(x, y);
    un(x + n, y + n);
}

void mergeEnemy(int x, int y, int n) {  // 敌人：交叉绑定
    un(x, y + n);
    un(y, x + n);
}

bool isFriend(int x, int y) { return find(x) == find(y); }
bool isEnemy (int x, int y)  { return find(x) == find(y + n); }
bool conflict(int x, int y, int n) { // 判断是否“既友又敌”
    return isFriend(x, y) && isEnemy(x, y, n);
}

```
# 带权并查集
核心思想：给每条父边记录“权值 d[i]”，表示 i 到父节点的某种累积量（距离、差值、高度差等）。路径压缩后 d[i] 直接是 i → 根 的累积。
## 数据结构
```cpp
int fa[N], d[N];   // d[i]：i 相对于父节点的权值
void init(int n) {
    for(int i=1;i<=n;i++) { fa[i]=i; d[i]=0; }
}

```
## 查询（路径压缩+累计权值）
```cpp
int find(int x) {
    if(fa[x]==x) return x;
    int root=find(fa[x]);   // 先让祖先挂到根
    d[x] += d[fa[x]];       // 累加“祖父→根”部分
    return fa[x]=root;      // 挂根，返回根
}

```
## 合并
（按题目给出的权值公式）
- 以 “x 到 y 的边权为 w” 为例（x 在 fx 树，y 在 fy 树）
- 目标：让 fx 挂到 fy，且满足d[x] + d[fx] + w == d[y]→ d[fx] = d[y] - d[x] - w
```cpp
void un(int x,int y,int w) {   // w: x→y 的给定边权
    int fx=find(x), fy=find(y);
    if(fx==fy) return;         // 已同集合，视情况判断矛盾
    fa[fx]=fy;
    d[fx] = d[y] - d[x] - w;   // 保证公式成立
}

```
## 查询两点间量值
```cpp
int query(int x,int y) {
    int fx=find(x), fy=find(y);
    if(fx!=fy) return INF;     // 不同集合，量值未知
    return d[y] - d[x];        // 根据合并公式推导
}

```

# 选用策略

| 场景          | 用法                   |
| ----------- | -------------------- |
| 纯连通、集合计数    | 普通 UFS + 路径压缩 + 按秩合并 |
| 朋友-敌人 / 食物链 | 扩展域（2 倍或 3 倍）        |
| 差分、距离、相对高度  | 带权 UFS（维护 d[]）       |
