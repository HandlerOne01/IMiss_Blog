---
title: "模板"
published: 2025-12-24 22:36:54
description: "函数模板代表了一个函数家族 与类型无关，在使用时被参数化 根据实参类型产生函数的特定类型版本"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 函数模板
## 函数模板概念
- 函数模板代表了一个函数家族
- 与类型无关，在使用时被参数化
- 根据实参类型产生函数的特定类型版本

## 函数模板格式
```cpp
template<typename T1, typename T2, ..., typename Tn>
返回值类型 函数名(参数列表) {}
```
**示例**
```cpp
template<typename T>
void Swap(T& left, T& right) {
    T temp = left;
    left = right;
    right = temp;
}
```
**注意**
- `typename` 是用来定义模板参数的关键字
- 也可以使用 `class`（但不能使用 `struct` 代替 `class`）

## 函数模板原理
- 函数模板是一个蓝图，本身并不是函数
- 编译器根据使用方式产生特定具体类型函数的模具
- 将重复的工作交给编译器
**示例
```cpp
// 编译器根据模板生成的具体函数
void Swap(int& a, int& b) {    // int版本
    int temp = a;
    a = b;
    b = temp;
}

void Swap(double& a, double& b) {  // double版本
    double temp = a;
    a = b;
    b = temp;
}

void Swap(char& a, char& b) {      // char版本
    char temp = a;
    a = b;
    b = temp;
}
```

## 函数模板实例化
### 隐式实例化
让编译器根据实参推演模板参数的实际类型
```cpp
template<class T>
T Add(const T& left, const T& right) {
    return left + right;
}

int main() {
    int a1 = 10, a2 = 20;
    double d1 = 10.0, d2 = 20.0;
    
    Add(a1, a2);    // T 被推演为 int
    Add(d1, d2);    // T 被推演为 double
    
    // Add(a1, d1);  // 错误：编译器无法确定T的类型
    Add(a1, (int)d1); // 解决方法1：用户自己强制转换
    
    return 0;
}
```
### 显式实例化
在函数名后的 `<>` 中指定模板参数的实际类型
```cpp
int main() {
    int a = 10;
    double b = 20.0;
    
    // 显式实例化
    Add<int>(a, b); // 指定T为int类型
    
    return 0;
}
```

## 模板参数的匹配原则
**原则1：** 非模板函数和同名函数模板可以共存
```cpp
// 专门处理int的加法函数
int Add(int left, int right) {
    return left + right;
}

// 通用加法函数模板
template<class T>
T Add(T left, T right) {
    return left + right;
}

void Test() {
    Add(1, 2);        // 调用非模板函数
    Add<int>(1, 2);   // 调用模板函数
}
```

**原则2：** 优先匹配非模板函数，除非模板能产生更好的匹配
```cpp
// 专门处理int的加法函数
int Add(int left, int right) {
    return left + right;
}

// 通用加法函数模板
template<class T1, class T2>
T1 Add(T1 left, T2 right) {
    return left + right;
}

void Test() {
    Add(1, 2);      // 调用非模板函数（完全匹配）
    Add(1, 2.0);    // 调用模板函数（生成更匹配的版本）
}
```

**原则3：** 模板函数不允许自动类型转换，但普通函数可以

# 类模板
## 类模板的定义格式
```cpp
template<class T1, class T2, ..., class Tn>
class 类模板名 {
    // 类内成员定义
};
```

**示例：栈类模板
```cpp
#include <iostream>
using namespace std;

template<typename T>
class Stack {
public:
    Stack(size_t capacity = 4) {    // 构造函数
        _array = new T[capacity];   // 动态分配数组
        _capacity = capacity;       // 设置容量
        _size = 0;                  // 初始大小为0
    }
    
    void Push(const T& data);       // 入栈函数声明
    
    ~Stack() {                      // 析构函数
        delete[] _array;            // 释放动态内存
    }

private:
    T* _array;                      // 栈数据数组
    size_t _capacity;               // 栈容量
    size_t _size;                   // 当前栈大小
};

// 类模板成员函数定义
template<class T>
void Stack<T>::Push(const T& data) {
    // 扩容检查...                  // 实际需要添加扩容逻辑
    _array[_size] = data;           // 将数据放入栈顶
    ++_size;                        // 栈大小增加
}
```
**重要提示：** 模板不建议声明和定义分离到 `.h` 和 `.cpp` 文件，会出现链接错误。

## 类模板的实例化
- 类模板实例化与函数模板实例化不同
- 类模板名字不是真正的类，实例化的结果才是真正的类
- 需要在类模板名字后跟 `<>`，将实例化的类型放在 `<>` 中
```cpp
- int main() {
    Stack<int> st1;      // Stack<int> 是类型
    Stack<double> st2;   // Stack<double> 是类型
    
    return 0;
}
```
**关键区别：
- `Stack` 是类模板名
- `Stack<int>` 才是具体的类型
