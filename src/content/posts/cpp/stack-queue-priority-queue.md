---
title: "stack,queue,priority_queue"
published: 2025-12-03 21:31:55
description: "栈（Stack）是一种后进先出（LIFO）的线性数据结构，只能在容器的一端（称为栈顶）进行插入和删除操作。"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# stack(栈)
## stack的基本介绍

**栈（Stack）**是一种**后进先出（LIFO）**的线性数据结构，只能在容器的**一端**（称为栈顶）进行插入和删除操作。

 **核心特性
- 仅允许在栈顶插入和删除元素
- 不支持随机访问
- 没有迭代器，只能访问栈顶元素
```cpp
template <class T, class Container = deque<T>>
class stack;
```

## stack的常用接口
|函数声明|功能说明|
|---|---|
|`stack()`|构造空栈|
|`empty()`|检测栈是否为空|
|`size()`|返回栈中元素个数|
|`top()`|返回栈顶元素的引用|
|`push(val)`|将元素val压入栈顶|
|`pop()`|弹出栈顶元素|

## stack的模拟实现
```cpp
template <class T, class Container = deque<T>>
class Stack {
private:
    Container _con;  // 底层容器
    
public:
    Stack() = default;
    
    void push(const T& val) {
        _con.push_back(val);  // 尾部作为栈顶
    }
    
    void pop() {
        _con.pop_back();
    }
    
    T& top() {
        return _con.back();
    }
    
    const T& top() const {
        return _con.back();
    }
    
    bool empty() const {
        return _con.empty();
    }
    
    size_t size() const {
        return _con.size();
    }
};
```

# queue（队列）

## queue的基本介绍

**队列（Queue）**是一种**先进先出（FIFO）**的线性数据结构，允许在队尾插入元素，在队头删除元素。
```cpp
template <class T, class Container = deque<T>>
class queue;
```

## queue的常用接口
| 函数声明        | 功能说明       |
| ----------- | ---------- |
| `queue()`   | 构造空队列      |
| `empty()`   | 检测队列是否为空   |
| `size()`    | 返回队列中元素个数  |
| `front()`   | 返回队头元素的引用  |
| `back()`    | 返回队尾元素的引用  |
| `push(val)` | 在队尾插入元素val |
| `pop()`     | 删除队头元素     |

## queue的模拟实现
```cpp
template <class T, class Container = deque<T>>
class Queue {
private:
    Container _con;
    
public:
    Queue() = default;
    
    void push(const T& val) {
        _con.push_back(val);
    }
    
    void pop() {
        _con.pop_front();  // 需要底层支持pop_front
    }
    
    T& front() {
        return _con.front();
    }
    
    T& back() {
        return _con.back();
    }
    
    bool empty() const {
        return _con.empty();
    }
    
    size_t size() const {
        return _con.size();
    }
};
```

# priority_queue的基本介绍

**优先队列（Priority Queue）**是一种特殊的队列，其中的元素按照**优先级**排序。默认情况下，优先级最高的元素（最大堆）总是在队头。
```cpp
template <class T, class Container = vector<T>, 
          class Compare = less<typename Container::value_type>>
class priority_queue;
```

 **核心特性
- 底层通常使用**堆（heap）**实现
- 默认是**大根堆**（最大元素在顶部）
- 支持插入和删除最大/最小元素的操作（O(log n)）
- 支持查看堆顶元素（O(1)）

## priority_queue的基本用法

```cpp
// 默认大根堆
priority_queue<int> maxHeap;

// 小根堆
priority_queue<int, vector<int>, greater<int>> minHeap;

// 使用数组初始化
vector<int> nums = {3, 1, 4, 1, 5, 9};
priority_queue<int> pq(nums.begin(), nums.end());
```

## priority_queue的模拟实现
```cpp
template <class T, class Container = vector<T>, 
          class Compare = less<T>>
class PriorityQueue {
private:
    Container _con;
    Compare _comp;
    
    // 向上调整（用于插入）
    void shiftUp(int idx) {
        while (idx > 0) {
            int parent = (idx - 1) / 2;
            if (!_comp(_con[parent], _con[idx])) break;
            swap(_con[parent], _con[idx]);
            idx = parent;
        }
    }
    
    // 向下调整（用于删除）
    void shiftDown(int idx) {
        int size = _con.size();
        while (idx * 2 + 1 < size) {
            int child = idx * 2 + 1;
            if (child + 1 < size && _comp(_con[child], _con[child + 1])) {
                child++;
            }
            if (!_comp(_con[idx], _con[child])) break;
            swap(_con[idx], _con[child]);
            idx = child;
        }
    }
    
public:
    PriorityQueue() = default;
    
    void push(const T& val) {
        _con.push_back(val);
        shiftUp(_con.size() - 1);
    }
    
    void pop() {
        if (empty()) return;
        _con[0] = _con.back();
        _con.pop_back();
        if (!empty()) shiftDown(0);
    }
    
    const T& top() const {
        return _con.front();
    }
    
    bool empty() const {
        return _con.empty();
    }
    
    size_t size() const {
        return _con.size();
    }
};
```

```cpp
注释版
/**
 * 优先队列（堆）模板类
 * @tparam T 元素类型
 * @tparam Container 底层容器类型，默认为vector<T>
 * @tparam Compare 比较器类型，默认为less<T>（最大堆）
 */
template <class T, class Container = vector<T>, 
          class Compare = less<T>>
class PriorityQueue {
private:
    Container _con;  // 底层容器（通常为数组）
    Compare _comp;   // 比较函数对象
    
    /**
     * 向上调整（堆化） - 用于插入新元素后维护堆性质
     * @param idx 需要向上调整的节点索引
     * 时间复杂度：O(log n)
     */
    void shiftUp(int idx) {
        // 从当前节点开始，向上遍历直到根节点
        while (idx > 0) {
            int parent = (idx - 1) / 2;  // 计算父节点索引
            // 如果当前节点不比父节点"优先"，则停止调整
            if (!_comp(_con[parent], _con[idx])) break;
            // 交换父子节点
            swap(_con[parent], _con[idx]);
            idx = parent;  // 继续向上检查
        }
    }
    
    /**
     * 向下调整（堆化） - 用于删除堆顶后维护堆性质
     * @param idx 需要向下调整的节点索引
     * 时间复杂度：O(log n)
     */
    void shiftDown(int idx) {
        int size = _con.size();
        // 当当前节点至少有一个子节点时继续调整
        while (idx * 2 + 1 < size) {
            int child = idx * 2 + 1;  // 左子节点索引
            
            // 如果存在右子节点且右子节点比左子节点"更优先"
            if (child + 1 < size && _comp(_con[child], _con[child + 1])) {
                child++;  // 选择更优先的子节点
            }
            
            // 如果当前节点比子节点"优先"，则停止调整
            if (!_comp(_con[idx], _con[child])) break;
            
            // 交换父子节点
            swap(_con[idx], _con[child]);
            idx = child;  // 继续向下检查
        }
    }
    
public:
    // 默认构造函数
    PriorityQueue() = default;
    
    /**
     * 插入元素到优先队列
     * @param val 要插入的值
     * 步骤：1. 添加到末尾 2. 向上调整恢复堆性质
     */
    void push(const T& val) {
        _con.push_back(val);          // 在末尾添加新元素
        shiftUp(_con.size() - 1);     // 从新元素位置开始向上调整
    }
    
    /**
     * 移除堆顶元素（优先级最高的元素）
     * 步骤：1. 用末尾元素替换堆顶 2. 删除末尾 3. 向下调整恢复堆性质
     */
    void pop() {
        if (empty()) return;         // 空队列检查
        _con[0] = _con.back();       // 用最后一个元素覆盖堆顶
        _con.pop_back();             // 删除最后一个元素
        if (!empty()) shiftDown(0);  // 从堆顶开始向下调整
    }
    
    /**
     * 获取堆顶元素（优先级最高的元素）
     * @return 堆顶元素的常量引用
     * 注意：调用前需确保队列非空
     */
    const T& top() const {
        return _con.front();  // 堆顶位于容器首部
    }
    
    /**
     * 检查优先队列是否为空
     * @return bool 队列为空返回true
     */
    bool empty() const {
        return _con.empty();
    }
    
    /**
     * 获取优先队列中元素数量
     * @return size_t 元素个数
     */
    size_t size() const {
        return _con.size();
    }
};

// 使用示例说明：
// PriorityQueue<int> pq;                    // 最大堆（默认）
// PriorityQueue<int, vector<int>, greater<int>> min_pq;  // 最小堆
```

# 容器适配器

**适配器（Adapter）**是一种设计模式，它将一个类的接口转换成客户期望的另一个接口。STL中的容器适配器是在现有容器的基础上封装新的接口。

## STL中的容器适配器
|适配器|底层容器要求|默认容器|特性|
|---|---|---|---|
|`stack`|支持`push_back()`, `pop_back()`, `back()`|`deque`|LIFO|
|`queue`|支持`push_back()`, `pop_front()`, `front()`, `back()`|`deque`|FIFO|
|`priority_queue`|支持随机访问迭代器、`push_back()`, `pop_back()`, `front()`|`vector`|优先队列|

# deque（双端队列）

## deque的结构原理

**deque（Double-ended Queue）**是一个双开口的"连续"空间数据结构：
- 支持在头部和尾部高效插入/删除（O(1)）
- 实际是分段连续空间（动态二维数组）
- 通过**中控器（map）**管理多个固定大小的缓冲区

## deque的底层结构
```cpp
中控器map   [ptr0] -> [缓冲区0: 0 1 2]
            [ptr1] -> [缓冲区1: 3 4 5]
            [ptr2] -> [缓冲区2: 6 7 8]
            ...
```

## 迭代器设计：

deque迭代器需要维护:
1. 当前元素位置
2. 当前缓冲区指针
3. 缓冲区边界信息

## deque的优缺点分析
### 优点
1. **头尾插入删除高效**：O(1)时间复杂度
2. **空间利用率较高**：比list连续，无需额外指针开销
3. **扩容代价较低**：无需像vector一样整体搬移

### 缺点
1. **遍历效率低**：需要频繁检查缓冲区边界
2. **随机访问较慢**：需要计算定位到具体缓冲区
3. **中间插入删除效率低**：需要移动元素

## deque作为默认容器的原因
```cpp
// STL中的默认定义
template <class T, class Container = deque<T>> class stack;
template <class T, class Container = deque<T>> class queue;
```

**选择deque的原因：**
1. **对于stack**：
    - 只需要尾插尾删，deque效率高
    - 比vector扩容代价小
    - 比list空间利用率高
2. **对于queue**：
    - 需要头删尾插，deque在两端操作都是O(1)
    - vector不支持高效的头删
    - list空间开销大
3. **综合优势**：
    - 避免了vector的大规模数据搬移
    - 避免了list的额外指针开销
    - 完美适配stack和queue的操作需求

## 容器选择总结
| 数据结构             | 适用场景                   | 时间复杂度                       | 注意事项     |
| ---------------- | ---------------------- | --------------------------- | -------- |
| `stack`          | 括号匹配、函数调用栈、DFS、表达式求值   | 插入/删除：O(1)  <br>访问：O(1)     | 只能访问栈顶元素 |
| `queue`          | BFS、任务调度、缓冲区、消息队列      | 插入/删除：O(1)  <br>访问：O(1)     | 只能访问队头队尾 |
| `priority_queue` | 任务调度、TopK问题、Dijkstra算法 | 插入/删除：O(log n)  <br>访问：O(1) | 只能访问堆顶元素 |
| `deque`          | 需要两端操作的场景              | 头尾操作：O(1)  <br>随机访问：O(1)    | 遍历效率较低   |

```cpp
// 根据需求自定义底层容器

// 1. 如果需要频繁遍历
stack<int, vector<int>> st1;      // 使用vector
queue<int, list<int>> q1;         // 使用list

// 2. 如果对内存敏感
stack<int, list<int>> st2;        // 无扩容问题
queue<int, deque<int>> q2;        // 折中方案

// 3. 如果对性能要求极高
stack<int, deque<int>> st3;       // 默认最优
queue<int, deque<int>> q3;        // 默认最优

// 4. priority_queue的特殊需求
priority_queue<int, vector<int>> pq1;          // 默认，随机访问快
priority_queue<int, deque<int>> pq2;           // 扩容代价小
```
