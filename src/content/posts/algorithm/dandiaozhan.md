---
title: "单调栈"
published: 2026-03-05 20:43:00
description: "单调栈是一种特殊的栈结构，栈中的元素保持单调递增或单调递减的顺序"
category: "算法"
tags: ["算法", "数据结构", "预处理", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

# 概念
单调栈是一种特殊的栈结构，栈中的元素保持单调递增或单调递减的顺序
# 基本实现
```cpp
#include <iostream>
#include <stack>
using namespace std;
const int N = 3e6 + 10;
int a[N], n;

// 维护单调递增栈
void test1() {
    stack<int> st;
    for(int i = 1; i <= n; i++) {
        // 栈里面大于等于a[i]的元素全部出栈
        while(st.size() && st.top() >= a[i]) st.pop();
        st.push(a[i]);
    }
}

// 维护单调递减栈
void test2() {
    stack<int> st;
    for(int i = 1; i <= n; i++) {
        // 栈里面小于等于a[i]的元素全部出栈
        while(st.size() && st.top() <= a[i]) st.pop();
        st.push(a[i]);
    }
}
```

# 单调栈解决的四类问题

## 寻找左侧比当前元素大的最近元素
**方法**：从左往右遍历，维护单调递减栈
```cpp
#include <iostream>
#include <stack>
using namespace std;
const int N = 3e6 + 10;
int a[N], n;
int ret[N]; // 存储结果

void test() {
    stack<int> st; // 维护单调递减栈
    
    for(int i = 1; i <= n; i++) {
        // 栈里面小于等于a[i]的元素全部出栈
        while(st.size() && a[st.top()] <= a[i]) st.pop();
        
        // 栈顶元素就是所求结果
        if(st.size()) ret[i] = st.top();
        else ret[i] = 0; // 左侧没有比它大的元素
        
        st.push(i); // 存储下标
    }
    
    for(int i = 1; i <= n; i++) {
        cout << ret[i] << " ";
    }
    cout << endl;
}

int main() {
    cin >> n;
    for(int i = 1; i <= n; i++) cin >> a[i];
    test();
    return 0;
}
```
```cpp
输入：
9
1 4 10 6 3 3 15 21 8

输出：
0 0 0 3 4 4 0 0 8
```

## 寻找左侧比当前元素小的最近元素
**方法**：从左往右遍历，维护单调递增栈
```cpp
#include <iostream>
#include <stack>
using namespace std;
const int N = 3e6 + 10;
int a[N], n;
int ret[N];

void test() {
    stack<int> st; // 维护单调递增栈
    
    for(int i = 1; i <= n; i++) {
        // 栈里面大于等于a[i]的元素全部出栈
        while(st.size() && a[st.top()] >= a[i]) st.pop();
        
        // 栈顶元素就是所求结果
        if(st.size()) ret[i] = st.top();
        else ret[i] = 0;
        
        st.push(i);
    }
    
    for(int i = 1; i <= n; i++) {
        cout << ret[i] << " ";
    }
    cout << endl;
}

int main() {
    cin >> n;
    for(int i = 1; i <= n; i++) cin >> a[i];
    test();
    return 0;
}
```
```cpp
输入：
9
1 4 10 6 3 3 15 21 8

输出：
0 1 2 2 1 1 6 7 6
```

## 寻找右侧比当前元素大的最近元素
**方法**：从右往左遍历，维护单调递减栈
```cpp
#include <iostream>
#include <stack>
using namespace std;
const int N = 3e6 + 10;
int a[N], n;
int ret[N];

void test() {
    stack<int> st; // 维护单调递减栈
    
    for(int i = n; i >= 1; i--) {
        // 栈里面小于等于a[i]的元素全部出栈
        while(st.size() && a[st.top()] <= a[i]) st.pop();
        
        // 栈顶元素就是所求结果
        if(st.size()) ret[i] = st.top();
        else ret[i] = 0;
        
        st.push(i);
    }
    
    for(int i = 1; i <= n; i++) {
        cout << ret[i] << " ";
    }
    cout << endl;
}

int main() {
    cin >> n;
    for(int i = 1; i <= n; i++) cin >> a[i];
    test();
    return 0;
}
```
```cpp
输入：
9
1 4 10 6 3 3 15 21 8

输出：
2 3 7 7 7 7 8 0 0
```
## 寻找右侧比当前元素小的最近元素
方法：从右往左遍历，维护单调递增栈
```cpp
#include <iostream>
#include <stack>
using namespace std;
const int N = 3e6 + 10;
int a[N], n;
int ret[N];

void test() {
    stack<int> st; // 维护单调递增栈
    
    for(int i = n; i >= 1; i--) {
        // 栈里面大于等于a[i]的元素全部出栈
        while(st.size() && a[st.top()] >= a[i]) st.pop();
        
        // 栈顶元素就是所求结果
        if(st.size()) ret[i] = st.top();
        else ret[i] = 0;
        
        st.push(i);
    }
    
    for(int i = 1; i <= n; i++) {
        cout << ret[i] << " ";
    }
    cout << endl;
}

int main() {
    cin >> n;
    for(int i = 1; i <= n; i++) cin >> a[i];
    test();
    return 0;
}
```
```cpp
输入：
9
1 4 10 6 3 3 15 21 8

输出：
0 5 4 5 0 0 9 9 0
```
