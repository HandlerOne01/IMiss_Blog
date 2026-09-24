---
title: "模板进阶"
published: 2025-12-24 22:30:13
description: "类型模板参数：出现在模板参数列表中，跟在class或typename后的参数类型名称 非类型模板参数：用一个常量作为类（函数）模板的参数，在模板中可将该参数当成常量使用"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

## 基本概念
- **类型模板参数**：出现在模板参数列表中，跟在`class`或`typename`后的参数类型名称
- **非类型模板参数**：用一个常量作为类（函数）模板的参数，在模板中可将该参数当成常量使用

## 代码示例
```cpp
namespace bite {
    // 自定义数组类模板
    template<class T, size_t N = 10>
    class array {
    public:
        // 下标访问操作符
        T& operator[](size_t index) {
            return _array[index];
        }
        
        // const版本的下标访问
        const T& operator[](size_t index) const {
            return _array[index];
        }
        
        // 获取当前元素个数
        size_t size() const {
            return _size;
        }
        
        // 判断是否为空
        bool empty() const {
            return 0 == _size;
        }
        
    private:
        T _array[N];      // 静态数组，大小固定为N
        size_t _size;     // 记录当前存储的元素数量
    };
}
```

### 注意事项
1. **限制类型**：浮点数、类对象以及字符串是不允许作为非类型模板参数的
2. **编译期确定**：非类型的模板参数必须在编译期就能确认结果
3. **适用类型**：通常是整型常量、枚举、指针或引用

# 模板的特化
## 概念

模板特化是针对某些特殊类型，需要对模板进行特殊处理的情况。原模板可能在某些类型下得到错误结果，需要特殊实现。

##  函数模板特化
### 问题场景
```cpp
// 函数模板--参数匹配
template<class T>
bool Less(T left, T right) {
    return left < right;  // 使用<运算符比较两个对象
}

class Date {
public:
    Date(int year, int month, int day)
        : _year(year), _month(month), _day(day) {}
    
    // 重载<运算符，用于日期比较
    bool operator<(const Date& d) const {
        if (_year < d._year) return true;
        if (_year == d._year && _month < d._month) return true;
        if (_year == d._month && _month == d._month && _day < d._day) return true;
        return false;
    }
    
private:
    int _year;
    int _month;
    int _day;
};

int main() {
    cout << Less(1, 2) << endl;  // 比较两个int，调用模板函数
    
    Date d1(2022, 7, 7);
    Date d2(2022, 7, 8);
    cout << Less(d1, d2) << endl;  // 比较两个Date对象，使用重载的<运算符
    
    Date* p1 = &d1;
    Date* p2 = &d2;
    cout << Less(p1, p2) << endl;  // 比较两个指针，比较的是地址而不是日期值
    return 0;
}
```
### 函数模板特化步骤
1. 必须要先有一个基础的函数模板
2. 关键字`template`后面接一对空的尖括号`<>`
3. 函数名后跟一对尖括号，尖括号中指定需要特化的类型
4. 函数形参表必须和模板函数的基础参数类型完全相同

### 特化实现
```cpp
// 特化版本：用于比较Date*类型
template<>
bool Less<Date*>(Date* left, Date* right) {
    return *left < *right;  // 解引用指针，比较Date对象本身
}
```

### 完整示例
```cpp
#include <iostream>
using namespace std;

// Date类的定义应该在这里
class Date {
public:
    Date(int year, int month, int day)
        : _year(year), _month(month), _day(day) {}
    
    bool operator<(const Date& d) const {
        if (_year < d._year) return true;
        if (_year == d._year && _month < d._month) return true;
        if (_year == d._year && _month == d._month && _day < d._day) return true;
        return false;
    }
    
private:
    int _year;
    int _month;
    int _day;
};

// 函数模板
template<class T>
bool Less(T left, T right) {
    return left < right;  // 通用比较模板
}

// 对Less函数模板进行特化（处理Date*类型）
template<>
bool Less<Date*>(Date* left, Date* right) {
    return *left < *right;  // 解引用后比较Date对象
}

int main() {
    cout << Less(1, 2) << endl;  // 调用通用模板
    
    Date d1(2022, 7, 7);
    Date d2(2022, 7, 8);
    cout << Less(d1, d2) << endl;  // 调用通用模板
    
    Date* p1 = &d1;
    Date* p2 = &d2;
    cout << Less(p1, p2) << endl;  // 调用特化版本
    return 0;
}
```

### 函数模板不建议特化，直接重载更简单
```cpp
bool Less(Date* left, Date* right) {
    return *left < *right;
}
```
- 代码可读性更高，容易书写
- 对于复杂参数类型的函数模板，特化时特别麻烦

## 类模板特化
### 全特化
全特化即将模板参数列表中所有的参数都确定化。
```cpp
template<class T1, class T2>
class Data {
public:
    Data() {
        cout << "Data<T1, T2>" << endl;  // 通用模板构造函数
    }
private:
    T1 _d1;
    T2 _d2;
};

// 全特化版本：针对<int, char>类型组合
template<>
class Data<int, char> {
public:
    Data() {
        cout << "Data<int, char>" << endl;  // 特化版本构造函数
    }
private:
    int _d1;
    char _d2;
};

void TestVector() {
    Data<int, int> d1;      // 匹配通用模板
    Data<int, char> d2;     // 匹配全特化版本
}
```

## 偏特化（部分特化）
偏特化是对模板参数进一步进行条件限制设计的特化版本。
### 部分参数特化
```cpp
// 偏特化版本：第二个参数固定为int
template <class T1>
class Data<T1, int> {
public:
    Data() {
        cout << "Data<T1, int>" << endl;  // 偏特化构造函数
    }
private:
    T1 _d1;   // 保持模板参数
    int _d2;  // 固定为int类型
};
```

### 参数类型限制（指针类型）
```cpp
// 偏特化版本：两个参数都偏特化为指针类型
template <typename T1, typename T2>
class Data<T1*, T2*> {
public:
    Data() {
        cout << "Data<T1*, T2*>" << endl;  // 指针类型特化
    }
private:
    T1 _d1;  // 指针指向的类型
    T2 _d2;  // 指针指向的类型
};
```

### 参数类型限制（引用类型)
```cpp
// 偏特化版本：两个参数都偏特化为引用类型
template <typename T1, typename T2>
class Data<T1&, T2&> {
public:
    Data(const T1& d1, const T2& d2)
        : _d1(d1), _d2(d2) {
        cout << "Data<T1&, T2&>" << endl;  // 引用类型特化
    }
private:
    const T1& _d1;  // 引用成员
    const T2& _d2;  // 引用成员
};
```

### 测试代码
```cpp
void test2() {
    Data<double, int> d1;        // 匹配偏特化<T1, int>版本
    Data<int, double> d2;        // 匹配基础模板版本
    Data<int*, int*> d3;         // 匹配偏特化指针版本<T1*, T2*>
    Data<int&, int&> d4(1, 2);   // 匹配偏特化引用版本<T1&, T2&>
}
```

## 类模板特化应用示例
### 问题场景
```cpp
#include <vector>
#include <algorithm>
using namespace std;

template<class T>
struct Less {
    bool operator()(const T& x, const T& y) const {
        return x < y;  // 仿函数对象，重载()运算符
    }
};

// 假设Date类已经定义并重载了<运算符

int main() {
    Date d1(2022, 7, 7);
    Date d2(2022, 7, 6);
    Date d3(2022, 7, 8);
    
    vector<Date> v1;
    v1.push_back(d1);
    v1.push_back(d2);
    v1.push_back(d3);
    // 直接排序Date对象，使用Date类的<运算符
    sort(v1.begin(), v1.end(), Less<Date>());
    
    vector<Date*> v2;
    v2.push_back(&d1);
    v2.push_back(&d2);
    v2.push_back(&d3);
    // 排序指针，比较的是地址而不是Date对象
    sort(v2.begin(), v2.end(), Less<Date*>());
    return 0;
}
```

### 解决方案：类模板特化
```cpp
// 对Less类模板按照指针方式特化
template<>
struct Less<Date*> {
    bool operator()(Date* x, Date* y) const {
        return *x < *y;
    }
};
```

# 模板分离编译

## 什么是分离编译
一个程序（项目）由若干个源文件共同实现，每个源文件单独编译生成目标文件，最后将所有目标文件链接起来形成单一可执行文件的过程。

## 模板的分离编译问题
### 错误示例
```cpp
// a.h
template<class T>
T Add(const T& left, const T& right);  // 模板函数声明

// a.cpp
template<class T>
T Add(const T& left, const T& right) {
    return left + right;  // 模板函数定义
}

// main.cpp
#include "a.h"
int main() {
    Add(1, 2);       // 需要int版本，但模板定义在a.cpp中不可见
    Add(1.0, 2.0);   // 需要double版本，但模板定义在a.cpp中不可见
    return 0;
}
```
#### 编译过程分析
1. **预处理**：处理头文件和宏定义
2. **编译**：生成汇编代码（头文件不参与编译）
3. **汇编**：生成目标文件（.obj）
4. **链接**：合并目标文件，解决地址问题
#### 问题原因
- 在`a.cpp`中，编译器没有看到对`Add`模板函数的实例化
- 在`main.obj`中调用的`Add<int>`和`Add<double>`没有生成具体代码
- 链接时找不到函数地址，报"无法解析的外部符号"错误

### 解决方法
#### 方法一：声明和定义放在同一文件（推荐）
```cpp
// xxx.hpp 或 xxx.h
template<class T>
T Add(const T& left, const T& right) {
    return left + right;
}
```

#### 方法二：显式实例化（不推荐）
```cpp
// a.cpp
template<class T>
T Add(const T& left, const T& right) {
    return left + right;
}

// 显式实例化
template int Add<int>(const int&, const int&);
template double Add<double>(const double&, const double&);
```

## 模板总结
### 优点
1. **代码复用**：节省资源，提高开发效率
2. **类型安全**：编译期类型检查
3. **灵活性高**：适用于多种数据类型
4. **STL基础**：C++标准模板库的基石
### 缺点
1. **代码膨胀**：为不同类型生成多份代码，增加可执行文件大小
2. **编译时间长**：模板实例化需要时间
3. **调试困难**：错误信息复杂，不易定位
4. **代码可读性差**：模板代码通常较复杂
### 使用建议
1. 优先使用STL中的模板类
2. 避免过度使用模板元编程
3. 注意模板特化的合理使用
4. 将模板声明和定义放在同一文件中

# 完整代码示例
```cpp
// Date类定义
class Date {
public:
    Date(int year = 1, int month = 1, int day = 1)
        : _year(year), _month(month), _day(day) {}
    
    bool operator<(const Date& d) const {
        if (_year < d._year) return true;
        if (_year == d._year && _month < d._month) return true;
        if (_year == d._year && _month == d._month && _day < d._day) return true;
        return false;
    }
    
private:
    int _year;
    int _month;
    int _day;
};

// 函数模板及特化
template<class T>
bool Less(T left, T right) {
    return left < right;
}

// 函数重载（替代特化）
bool Less(Date* left, Date* right) {
    return *left < *right;
}

// 类模板及各种特化
template<class T1, class T2>
class Data {
public:
    Data() { cout << "Data<T1, T2>" << endl; }
private:
    T1 _d1;
    T2 _d2;
};

// 全特化
template<>
class Data<int, char> {
public:
    Data() { cout << "Data<int, char>" << endl; }
private:
    int _d1;
    char _d2;
};

// 偏特化：部分参数特化
template <class T1>
class Data<T1, int> {
public:
    Data() { cout << "Data<T1, int>" << endl; }
private:
    T1 _d1;
    int _d2;
};

// 偏特化：指针类型
template <typename T1, typename T2>
class Data<T1*, T2*> {
public:
    Data() { cout << "Data<T1*, T2*>" << endl; }
private:
    T1 _d1;
    T2 _d2;
};

// 比较器类模板及特化
template<class T>
struct LessComparator {
    bool operator()(const T& x, const T& y) const {
        return x < y;
    }
};

// 指针特化版本
template<>
struct LessComparator<Date*> {
    bool operator()(Date* x, Date* y) const {
        return *x < *y;
    }
};
```
