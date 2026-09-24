---
title: "list"
published: 2025-12-02 17:11:36
description: "模板参数使用：listnode 中必须包含模板参数T 默认构造函数参数：T() 对于内置类型会初始化为0，对于类类型调用默认构造函数"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 节点类模板
```cpp
template<class T>
struct list_node {
    T _data;                // 节点存储的数据
    list_node<T>* _next;    // 指向下一个节点的指针
    list_node<T>* _prev;    // 指向前一个节点的指针

    list_node(const T& data = T())
        :_data(data)
        ,_next(nullptr)
        ,_prev(nullptr)
    {}
};
```
1. **模板参数使用**：`list_node<T>` 中必须包含模板参数T
2. **默认构造函数参数**：`T()` 对于内置类型会初始化为0，对于类类型调用默认构造函数

# 迭代器模板
```cpp
template<class T, class Ref, class Ptr>
struct list_iterator {
    typedef list_node<T> Node;          // 节点类型别名
    typedef list_iterator<T, Ref, Ptr> Self; // 迭代器自身类型别名
    Node* _node;                        // 当前迭代器指向的节点指针

    list_iterator(Node* node)
        :_node(node)
    {}
    
    // 操作符重载...
};
```
1. **三个模板参数**：`T`（数据类型），`Ref`（引用类型），`Ptr`（指针类型）
2. **typedef作用域**：`Node` 和 `Self` 只在类内部有效
3. **无默认构造函数**：防止创建未初始化的迭代器
4. **节点指针成员**：`_node` 是 `Node*` 类型，存储节点地址

# 操作符重载

## 解引用操作符
```cpp
Ref operator*()
{
    return _node->_data;
}
```
1. **返回类型是Ref**：可能是 `T&` 或 `const T&`
2. **不检查空指针**：调用者需确保迭代器有效
3. **访问节点数据**：通过 `_node->_data` 访问

## 箭头操作符
```cpp
Ptr operator->()
{
    return &_node->_data;
}
```
1. **返回指针**：`&` 取地址操作符，返回 `T*` 或 `const T*`
2. **链式访问机制**：`it->member` 被转换为 `(&it._node->_data)->member`
3. **类型安全**：返回指针类型由模板参数 `Ptr` 控制

# 前置自增操作符
```cpp
Self& operator++()
{
    _node = _node->_next;
    return *this;
}
```
1. **返回引用**：支持链式调用 `++++it`
2. **修改当前对象**：`_node` 指向下一个节点
3. **返回 `*this`**：返回当前迭代器对象本身的引用

## 后置自增操作符
```cpp
Self operator++(int)
{
    Self tmp(*this);
    _node = _node->_next;
    return tmp;
}
```
1. **int参数是占位符**：区分前置和后置
2. **创建临时副本**：`Self tmp(*this)` 保存当前状态
3. **返回值（不是引用）**：返回副本，局部变量不能返回引用
4. **性能较低**：需要拷贝构造

## 比较操作符
```cpp
bool operator!=(const Self& s) const
{
    return _node != s._node;
}

bool operator==(const Self& s) const
{
    return _node == s._node;
}
```
1. **比较的是节点指针**：不是节点数据
2. **const成员函数**：可以用于const迭代器
3. **参数类型**：`const Self&`，避免不必要的拷贝

# 链表类模板

## 链表类模板声明
```cpp
template<class T>
class list {
    typedef list_node<T> Node; // 节点类型别名
public:
    // 迭代器类型别名
    typedef list_iterator<T, T&, T*> iterator;
    typedef list_iterator<T, const T&, const T*> const_iterator;
    
private:
    Node* _head;   // 头节点指针
    size_t _size;  // 链表大小
};
```
1. **模板参数传递**：`list<T>` 传递给 `list_iterator` 和 `list_node`
2. **typedef区分作用域**：`iterator` 和 `const_iterator` 是公有接口
3. **私有成员**：`_head` 和 `_size` 是私有实现细节

## 迭代器获取函数
```cpp
iterator begin()
{
    return _head->_next; // 头节点的下一个节点是第一个有效元素
}

iterator end()
{
    return _head; // 头节点作为尾后迭代器
}

const_iterator begin() const
{
    return _head->_next;
}

const_iterator end() const
{
    return _head;
}
```
1. **哨兵节点设计**：`_head` 是哨兵节点，不存储有效数据
2. **begin() 返回第一个有效节点**：不是头节点本身
3. **end() 返回头节点**：表示尾后位置
4. **const版本必须成对出现**：用于const对象

## 初始化和构造函数
```cpp
void empty_init()
{
    _head = new Node;      // 创建头节点
    _head->_next = _head;  // 初始化next指针指向自身
    _head->_prev = _head;  // 初始化prev指针指向自身
    _size = 0;             // 大小设为0
}

list()
{
    empty_init();
}
```
1. **循环链表结构**：头节点的next和prev都指向自身
2. **空链表也有一个节点**：哨兵节点
3. **构造函数必须初始化**：不能留空

## 插入函数
```cpp
iterator insert(iterator pos, const T& x)
{
    Node* cur = pos._node;    // 当前节点
    Node* prev = cur->_prev;  // 前一个节点
    Node* newnode = new Node(x); // 创建新节点

    // 调整指针，将新节点插入到prev和cur之间
    newnode->_next = cur;
    cur->_prev = newnode;
    newnode->_prev = prev;
    prev->_next = newnode;

    ++_size; // 链表大小增加

    return newnode; // 返回指向新节点的迭代器
}
```
1. **插入位置是pos之前**：在pos指向的节点前插入
2. **四步指针调整**：必须按正确顺序
3. **必须更新_size**：维护链表大小
4. **返回迭代器**：指向新插入的节点

## 删除操作
```cpp
iterator erase(iterator pos)
{
    assert(pos != end()); // 不能删除头节点

    Node* cur = pos._node;    // 要删除的节点
    Node* prev = cur->_prev;  // 前驱节点
    Node* next = cur->_next;  // 后继节点

    // 调整指针，跳过被删除节点
    prev->_next = next;
    next->_prev = prev;
    delete cur; // 释放节点内存

    --_size; // 链表大小减少

    return iterator(next); // 返回被删除节点的下一个节点的迭代器
}
```
1. **不能删除哨兵节点**：`pos != end()` 必须为真
2. **必须释放内存**：`delete cur` 释放节点
3. **必须更新_size**：维护链表大小
4. **🚨 关键错误修正**：`return iterator(next)` 而不是 `return next`
5. **迭代器失效**：删除后pos失效，需使用返回的新迭代器

## 拷贝构造函数
```cpp
list(const list<T>& lt)
{
    empty_init();
    for (auto& e : lt) // 遍历源链表
    {
        push_back(e); // 将每个元素添加到新链表
    }
}
```
1. **深拷贝**：创建新节点，复制数据
2. **必须先初始化**：调用 `empty_init()`
3. **使用范围for循环**：依赖迭代器的实现

## 拷贝赋值操作符（拷贝交换技巧）
```cpp
list<T>& operator=(list<T> lt) // 传值调用，自动拷贝
{
    swap(lt); // 交换当前对象与拷贝对象
    return *this;
}

void swap(list<T>& lt)
{
    std::swap(_head, lt._head);
    std::swap(_size, lt._size);
}
```
1. **参数传值**：调用拷贝构造函数创建副本
2. **交换而不是赋值**：高效且异常安全
3. **自赋值安全**：传值自动处理自赋值
4. **必须返回 * this：支持链式赋值

## 析构函数
```cpp
~list()
{
    clear();       // 删除所有有效节点
    delete _head;  // 删除头节点
    _head = nullptr;
}

void clear()
{
    auto it = begin();
    while (it != end())
    {
        it = erase(it); // 逐个删除节点，erase返回下一个节点的迭代器
    }
}
```
1. **必须按顺序释放**：先clear()再delete _ head
2. **clear()使用erase**：需要捕获返回值
3. **置空指针**：`_head = nullptr` 防止悬垂指针
4. **异常安全**：如果clear()中发生异常，头节点可能泄漏

# 模板机制
## 模板实例化过程
```cpp
// 当用户声明 list<int> 时：
// 1. list_node<int> 被实例化
// 2. list_iterator<int, int&, int*> 被实例化（普通迭代器）
// 3. list_iterator<int, const int&, const int*> 被实例化（const迭代器）
// 4. list<int> 被实例化

// 实际编译器生成的代码：
struct list_node_int {
    int _data;
    list_node_int* _next;
    list_node_int* _prev;
    // ...
};

struct list_iterator_int_ref {
    list_node_int* _node;
    // 操作符重载...
};

class list_int {
    list_node_int* _head;
    size_t _size;
    // 成员函数...
};
```

## 类型推到和typedef
```cpp
// 在list<T>内部：
typedef list_iterator<T, T&, T*> iterator;
// 当 T = int 时，展开为：
typedef list_iterator<int, int&, int*> iterator;

// 在list_iterator内部：
typedef list_node<T> Node;
// 当 T = int 时，展开为：
typedef list_node<int> Node;
```

# 易错总结
## 模板参数传递链
```txt
list<T>
  ↓ 传递T
list_node<T>
  ↓ 传递T
list_iterator<T, Ref, Ptr>
```
每个类模板都需要正确的参数传递

# 返回类型混淆
| 函数                | 错误返回            | 正确返回                     | 原因                      |
| ----------------- | --------------- | ------------------------ | ----------------------- |
| `erase`           | `return next;`  | `return iterator(next);` | next是Node*，需要构造iterator |
| `operator++()`    | `return this;`  | `return *this;`          | this是指针，*this是对象        |
| `operator++(int)` | `return *this;` | `return tmp;`            | 后置++应返回原值的副本            |

## const正确性
- const对象只能调用const成员函数
- const迭代器的operator*()返回const引用
- const迭代器的operator->()返回const指针

## 迭代器失效规则
| 操作                   | 失效的迭代器        | 原因       |
| -------------------- | ------------- | -------- |
| `insert`             | 无             | 节点地址不变   |
| `erase`              | 被删除节点及其之后的迭代器 | 节点被删除    |
| `push_back/pop_back` | end()可能失效     | 哨兵节点可能变化 |

## 资源管理
```cpp
// 正确顺序
1. new 分配内存
2. 设置指针连接
3. ++_size

// 删除时
1. 调整指针跳过被删除节点
2. delete 释放内存
3. --_size
```
