---
title: "vector"
published: 2025-12-03 22:54:37
description: "定义：Vector 是 C++ STL 中的序列容器，表示可改变大小的数组"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 基本概念
- **定义**：Vector 是 C++ STL 中的序列容器，表示可改变大小的数组

- **特性**：
    - 动态数组，可以自动扩容
    - 支持随机访问（通过下标）
    - 在尾部插入/删除效率高，在中间插入/删除效率低
    - 元素在内存中连续存储

## 接口使用
### 构造函数
```cpp
// 1. 无参构造
vector<int> v1;

// 2. 构造并初始化n个val
vector<int> v2(10, 5);  // 10个5

// 3. 拷贝构造
vector<int> v3(v2);

// 4. 使用迭代器构造
int arr[] = {1, 2, 3, 4};
vector<int> v4(arr, arr + sizeof(arr)/sizeof(arr[0]));

// 5. C++11列表初始化
vector<int> v5 = {1, 2, 3, 4};
```

### 迭代器使用
```cpp
vector<int> v = {1, 2, 3, 4, 5};

// 正向迭代器
for(vector<int>::iterator it = v.begin(); it != v.end(); ++it)
    cout << *it << " ";

// 反向迭代器
for(vector<int>::reverse_iterator rit = v.rbegin(); rit != v.rend(); ++rit)
    cout << *rit << " ";

// 范围for（C++11）
for(auto& e : v)
    cout << e << " ";
```

## 容量操作
```cpp
vector<int> v;

// 大小和容量
cout << v.size();      // 有效元素个数
cout << v.capacity();  // 总容量
cout << v.empty();     // 是否为空

// 扩容机制
v.reserve(100);  // 预留空间，避免多次扩容
v.resize(50, 1); // 改变大小，多出的用1填充
```
**重要知识点**：
- **扩容策略**:
    - VS：按1.5倍增长
    - g++：按2倍增长

- **reserve vs resize**：
    - reserve：只改变capacity，不改变size
    - resize：既改变size，也初始化新元素

### 元素访问
```cpp
vector<int> v = {1, 2, 3, 4};

// 下标访问
for(size_t i = 0; i < v.size(); ++i)
    cout << v[i] << " ";

// at()访问（会检查边界）
try {
    cout << v.at(10);  // 抛出异常
} catch(out_of_range& e) {
    cout << e.what();
}

// 首尾元素
cout << v.front();  // 第一个元素
cout << v.back();   // 最后一个元素
```

## 增删查改
```cpp
vector<int> v;

// 尾部操作
v.push_back(1);  // 尾插
v.pop_back();    // 尾删

// 任意位置插入
auto it = v.begin() + 2;
v.insert(it, 3, 100);  // 在位置2插入3个100
v.insert(it, {7, 8, 9});  // 插入列表

// 删除
v.erase(v.begin());  // 删除第一个元素
v.erase(v.begin(), v.begin() + 3);  // 删除前三个

// 清空
v.clear();

// 交换
vector<int> v1, v2;
v1.swap(v2);  // 交换内容
```

# 迭代器失效问题

迭代器底层是指针，指向的空间被释放后继续使用会导致程序崩溃。

## 导致失效的操作

### 情况1：扩容导致失效
```cpp
vector<int> v = {1, 2, 3, 4};
auto it = v.begin();

v.reserve(100);  // 扩容，旧空间释放
// it已失效，不能再使用

// 正确做法：重新获取迭代器
it = v.begin();
```

### 情况2：插入导致失效
```cpp
vector<int> v = {1, 2, 3, 4};
auto pos = find(v.begin(), v.end(), 3);

v.insert(pos, 100);  // 可能导致扩容
// pos可能失效
```

### 情况3：删除导致失效
```cpp
// 错误示例：删除偶数
vector<int> v = {1, 2, 3, 4, 5, 6};
auto it = v.begin();
while(it != v.end()) {
    if(*it % 2 == 0) {
        v.erase(it);  // erase后it失效
        // ++it;  // 错误：使用失效的迭代器
    }
    ++it;
}

// 正确写法1：利用erase返回值
auto it = v.begin();
while(it != v.end()) {
    if(*it % 2 == 0) {
        it = v.erase(it);  // erase返回下一个有效迭代器
    } else {
        ++it;
    }
}

// 正确写法2：使用算法
v.erase(remove_if(v.begin(), v.end(), 
                  [](int x){return x%2==0;}), 
        v.end());
```

# vector模拟实现
## 基本框架
```cpp
namespace kiana {
template<class T>
class vector {
public:
    typedef T* iterator;
    typedef const T* const_iterator;
    
private:
    iterator _start = nullptr;           // 指向起始
    iterator _finish = nullptr;          // 指向最后一个元素的下一个位置
    iterator _end_of_storage = nullptr;  // 指向存储空间的结尾
};
}
```

## 核心接口实现
### 构造函数
```cpp
// 无参构造
vector() = default;

// 拷贝构造（现代写法）
vector(const vector<T>& v) {
    reserve(v.capacity());
    for(auto& e : v) {
        push_back(e);
    }
}

// 迭代器范围构造
template<class InputIterator>
vector(InputIterator first, InputIterator last) {
    while(first != last) {
        push_back(*first);
        ++first;
    }
}

// 填充构造
vector(size_t n, const T& val = T()) {
    reserve(n);
    for(size_t i = 0; i < n; ++i) {
        push_back(val);
    }
}

// 赋值运算符（现代写法）
vector<T>& operator=(vector<T> v) {
    swap(v);
    return *this;
}
```

### 容量相关
```cpp
size_t size() const { return _finish - _start; }
size_t capacity() const { return _end_of_storage - _start; }
bool empty() const { return _start == _finish; }

void reserve(size_t n) {
    if(n > capacity()) {
        size_t old_size = size();
        T* tmp = new T[n];
        
        // 深拷贝，不能用memcpy
        for(size_t i = 0; i < old_size; ++i) {
            tmp[i] = _start[i];  // 调用赋值运算符
        }
        
        delete[] _start;
        _start = tmp;
        _finish = _start + old_size;
        _end_of_storage = _start + n;
    }
}

void resize(size_t n, const T& val = T()) {
    if(n < size()) {
        _finish = _start + n;
    } else {
        if(n > capacity()) {
            reserve(n);
        }
        while(_finish != _start + n) {
            *_finish = val;
            ++_finish;
        }
    }
}
```

### 元素访问
```cpp
T& operator[](size_t pos) {
    assert(pos < size());
    return _start[pos];
}

const T& operator[](size_t pos) const {
    assert(pos < size());
    return _start[pos];
}

T& front() { return *begin(); }
T& back() { return *(end() - 1); }****
```

### 增删操作
```cpp
void push_back(const T& x) {
    if(_finish == _end_of_storage) {
        reserve(capacity() == 0 ? 4 : capacity() * 2);
    }
    *_finish = x;
    ++_finish;
}

void pop_back() {
    assert(!empty());
    --_finish;
}

iterator insert(iterator pos, const T& x) {
    assert(pos >= _start && pos <= _finish);
    
    // 扩容时记录偏移量，防止迭代器失效
    if(_finish == _end_of_storage) {
        size_t len = pos - _start;
        reserve(capacity() == 0 ? 4 : capacity() * 2);
        pos = _start + len;
    }
    
    // 移动元素
    iterator end = _finish - 1;
    while(end >= pos) {
        *(end + 1) = *end;
        --end;
    }
    *pos = x;
    ++_finish;
    return pos;
}

iterator erase(iterator pos) {
    assert(pos >= _start && pos < _finish);
    iterator it = pos + 1;
    while(it != _finish) {
        *(it - 1) = *it;
        ++it;
    }
    --_finish;
    return pos;
}
```

## 关键问题分析
## memcpy 拷贝问题
```cpp
// 错误示例：使用memcpy导致浅拷贝
void reserve(size_t n) {
    T* tmp = new T[n];
    memcpy(tmp, _start, size() * sizeof(T));  // 浅拷贝！
    delete[] _start;
    _start = tmp;
    // ... 字符串等资源管理对象会双重释放
}

// 正确做法：使用循环进行深拷贝
for(size_t i = 0; i < old_size; ++i) {
    tmp[i] = _start[i];  // 调用赋值运算符
}
```

## 动态二维数组理解
```cpp
// 创建n行的二维数组
vector<vector<int>> vv(n);
for(int i = 0; i < n; ++i) {
    vv[i].resize(i + 1, 1);  // 每行有i+1个元素，初始化为1
}

// 内存布局：
// vv[0]: [1]
// vv[1]: [1, 1]
// vv[2]: [1, 2, 1]
// ...
```

# 使用建议和注意事项

## 性能优化
1. **提前reserve**：如果知道大致元素数量，提前预留空间
2. **避免在中间插入**：尽量在尾部操作
3. **使用emplace_back**（C++11）：避免临时对象构造

## 常见错误
1. **迭代器失效**：扩容或删除后要重新获取迭代器
2. **越界访问**：使用[]前检查边界，或使用at()
3. **内存泄漏**：确保正确实现拷贝控制成员

## 选择vector的场景
- 需要随机访问
- 尾部频繁插入删除
- 元素数量变化不大或可预估
- 需要连续内存空间
