---
title: "Queue"
published: 2025-11-19 12:09:18
description: "本质：容器适配器，先进先出（FIFO）数据结构 头文件：include 命名空间：std:: 底层容器：默认使用 deque，也可指定 list 特点：只允许在队尾插入，队头删除 复杂度：所有操作的时间复杂度都是 O(1)"
category: "STL"
tags: ["STL", "数据结构"]
lang: "zh_CN"
draft: false
comment: true
---

# 核心概念

- **本质**：容器适配器，先进先出（FIFO）数据结构
- **头文件**：`#include <queue>`
- **命名空间**：`std::`
- **底层容器**：默认使用 `deque`，也可指定 `list`
- **特点**：只允许在队尾插入，队头删除
- **复杂度**：所有操作的时间复杂度都是 O(1)

# 构造函数

| 接口 | 说明 |
|------|------|
| `queue<T> q;` | 默认构造，创建空queue |
| `queue<T> q(other_queue);` | 拷贝构造 |
| `queue<T> q(container);` | 使用指定底层容器构造 |
| `queue<T> q = other_queue;` | 拷贝赋值 |

## 指定底层容器示例：
```cpp
queue<int> q1;                    // 默认使用deque
queue<int, list<int>> q2;         // 使用list作为底层容器
```

# 容量操作

| 接口        | 说明          |
| --------- | ----------- |
| q.empty() | 检查queue是否为空 |
| q.size()  | 返回元素数量      |

# 元素访问

| 接口        | 说明        |
| --------- | --------- |
| q.front() | 返回队头元素的引用 |
| q.back()  | 返回队尾元素的引用 |

# 修改器

| 接口                  | 说明           |
| ------------------- | ------------ |
| q.push(value)       | 在队尾插入元素      |
| q.pop()             | 移除队头元素       |
| q.emplace(args...)  | 在队尾就地构造元素    |
| q.swap(other_queue) | 交换两个queue的内容 |

# 非成员函数

| 接口           | 说明           |
| ------------ | ------------ |
| swap(q1, q2) | 交换两个queue的内容 |
| operator==   | 相等比较         |
| operator!=   | 不等比较         |
| operator<    | 小于比较         |
| operator<=   | 小于等于比较       |
| operator>    | 大于比较         |
| operator>=   | 大于等于比较       |

# 代码示例
## 就地构造元素：
```cpp
struct Person {
    string name;
    int age;
    Person(string n, int a) : name(n), age(a) {}
};

queue<Person> person_queue;

// 使用emplace就地构造
person_queue.emplace("Alice", 25);      // 直接在队尾构造
person_queue.push(Person("Bob", 30));   // 需要创建临时对象
```

## 队列应用：广度优先搜索([BFS](/posts/algorithm/bfs/))

```cpp
#include <vector>
#include <queue>
using namespace std;

void bfs(vector<vector<int>>& graph, int start) {
    int n = graph.size();
    vector<bool> visited(n, false);
    queue<int> q;
    
    q.push(start);
    visited[start] = true;
    
    while (!q.empty()) {
        int node = q.front();
        q.pop();
        
        cout << "访问节点: " << node << endl;
        
        for (int neighbor : graph[node]) {
            if (!visited[neighbor]) {
                q.push(neighbor);
                visited[neighbor] = true;
            }
        }
    }
}
```

## 遍历队列（需要临时队列）

```cpp
queue<int> q;
q.push(1);
q.push(2);
q.push(3);

// 遍历队列（会清空原队列）
cout << "队列内容: ";
while (!q.empty()) {
    cout << q.front() << " ";
    q.pop();
}
cout << endl;

// 如果要保留原队列，需要使用临时队列
queue<int> original_q;
original_q.push(1);
original_q.push(2);
original_q.push(3);

queue<int> temp = original_q;
cout << "临时队列内容: ";
while (!temp.empty()) {
    cout << temp.front() << " ";
    temp.pop();
}
cout << endl;
```

## 消息队列示例：

```cpp
#include <string>

queue<string> message_queue;

// 生产者添加消息
message_queue.push("消息1");
message_queue.push("消息2");
message_queue.push("消息3");

// 消费者处理消息
while (!message_queue.empty()) {
    string msg = message_queue.front();
    message_queue.pop();
    cout << "处理消息: " << msg << endl;
}
```

# 注意事项

1. 访问前检查：调用 front()、back() 或 pop() 前必须确保队列不为空
2. pop()不返回值：pop() 只移除元素，不返回元素值，需要先使用 front() 获取
3. 底层容器限制：选择的底层容器必须支持 front()、back()、push_back()、pop_front() 操作
4. 迭代器：queue 不提供迭代器，无法直接遍历
5. 异常安全：pop() 通常不抛出异常，但 front()、back() 和 push() 可能抛出
6. 性能考虑：
   · 默认 deque：平衡了头尾操作性能
   · list：每个操作都是常数时间，但内存开销大

# 常见应用场景

· 广度优先搜索（BFS）
· 消息队列系统
· 任务调度系统
· 打印队列管理
· 缓冲区管理
· 事件处理系统
· 数据流处理
