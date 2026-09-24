---
title: "C++基础语法"
published: 2025-11-15 11:11:09
description: "std是C++标准库的命名空间，就像一个大文件夹 cout、endl等都放在这个\"文件夹\"里 using namespace std相当于说\"我要用std文件夹里的所有东西\" 不加这行的话，每次都要写std::cout，就像写\"文件夹/文…"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 命名空间
## 什么是命名空间
```cpp
#include <iostream>
// using namespace std;  // 这行是什么意思？

int main()
{
    std::cout << "hello world" << std::endl;
    return 0;
}
```
**知识点解释
- `std`是C++标准库的命名空间，就像一个大文件夹
- `cout`、`endl`等都放在这个"文件夹"里
- `using namespace std`相当于说"我要用std文件夹里的所有东西"
- 不加这行的话，每次都要写`std::cout`，就像写"文件夹/文件"

## 为什么需要命名空间
```cpp
#include <stdlib.h>

int rand = 10;  // 问题：stdlib.h里也有个rand函数

int main()
{
    printf("%d\n", rand);  // 编译错误！名字冲突了
    return 0;
}
```
**使用命名空间解决命名冲突
```cpp
#include <stdlib.h>

namespace my_space  // 创建自己的命名空间
{
    int rand = 10;  // 这个rand在my_space里，不会冲突
}

int main()
{
    printf("%p\n", rand);           // 访问全局的rand函数
    printf("%d\n", my_space::rand); // 访问我自己的rand变量
    return 0;
}
```
## 三种使用方式
```cpp
namespace bit {
    int a = 0;
    int b = 1;
}

// 方式1：指定命名空间（最安全）
std::cout << bit::a << std::endl;

// 方式2：展开特定成员
using bit::b;
cout << b << endl;

// 方式3：展开整个命名空间（最方便但可能冲突）
using namespace bit;
cout << a << " " << b << endl;
```

# cin与cout
## 基本用法
```cpp
#include <iostream>
using namespace std;

int main()
{
    int a;
    double b;
    char c;
    
    // 输入 - 自动识别类型！
    cin >> a >> b >> c;
    
    // 输出 - 不用记%d %f %c了！
    cout << "a=" << a << ", b=" << b << ", c=" << c << endl;
    
    return 0;
}
```
## 优势
- 自动识别变量类型
- 不用写格式控制符
- 更安全，不容易出错
- 支持自定义类型的输入输出

# 缺省参数
## 什么是缺省参数
```cpp
// 给函数参数设置默认值
void introduce(string name = "未知", int age = 0)
{
    cout << "我叫" << name << "，今年" << age << "岁" << endl;
}

int main()
{
    introduce("张三", 20);  // 我叫张三，今年20岁
    introduce("李四");      // 我叫李四，今年0岁
    introduce();            // 我叫未知，今年0岁
    
    return 0;
}
```
## 规则说明
```cpp
// 全缺省 - 所有参数都有默认值
void func1(int a = 10, int b = 20, int c = 30);

// 半缺省 - 部分参数有默认值（必须从右往左）
void func2(int a, int b = 20, int c = 30);  // ✅ 正确
// void func3(int a = 10, int b, int c = 30); // ❌ 错误！

int main()
{
    func2(100);        // a=100, b=20, c=30
    func2(100, 200);   // a=100, b=200, c=30
    func2(100, 200, 300);
    
    return 0;
}
```

# 函数重载-同名不同参
## 什么是函数重载
```cpp
// 同一个函数名，不同的参数列表
int add(int a, int b) {
    cout << "整数加法" << endl;
    return a + b;
}

double add(double a, double b) {
    cout << "小数加法" << endl;
    return a + b;
}

void add(string a, string b) {
    cout << "字符串连接: " << a + b << endl;
}

int main()
{
    add(1, 2);           // 调用整数版本
    add(1.1, 2.2);       // 调用小数版本  
    add("Hello", "World"); // 调用字符串版本
    
    return 0;
}
```
## 重载条件：
- 参数类型不同
- 参数个数不同
- 参数顺序不同
- 仅返回类型不同**不可重载

# 引用-变量别名
## 引用是什么
```cpp
int main()
{
    int original = 100;
    
    // 创建引用（别名）
    int& alias = original;  // alias是original的别名
    
    cout << "original = " << original << endl;  // 100
    cout << "alias = " << alias << endl;        // 100
    
    alias = 200;  // 通过别名修改值
    
    cout << "修改后 original = " << original << endl;  // 200
    cout << "两个变量的地址相同吗？" << endl;
    cout << &original << " == " << &alias << endl;  // 地址相同！
    
    return 0;
}
```
## 引用的重要特性
```cpp
int main()
{
    int a = 10;
    
    // 特性1：必须初始化
    int& ref = a;        // ✅ 正确
    // int& ref2;         // ❌ 错误！引用必须初始化
    
    // 特性2：不能改变指向
    int b = 20;
    ref = b;            // 这是赋值，不是改变指向！
    
    cout << a << endl;   // 20，a的值被改变了
    cout << &a << " " << &ref << endl;  // 地址还是a的地址
    
    return 0;
}
```
## 引用的实用场景
```cpp
// 场景1：引用传参（避免拷贝，直接修改）
void swap(int& x, int& y) {
    int temp = x;
    x = y;
    y = temp;
}

// 场景2：引用返回（可以当左值）
int& getElement(int arr[], int index) {
    return arr[index];
}

int main()
{
    int x = 1, y = 2;
    swap(x, y);  // 直接传变量，不用取地址
    
    int arr[5] = {1, 2, 3, 4, 5};
    getElement(arr, 2) = 100;  // 直接修改数组元素
    cout << arr[2] << endl;    // 100
    
    return 0;
}
```

# const引用
## 基本概念
```cpp
void const_reference_basics()
{
    int original = 100;
    
    // 普通引用
    int& ref1 = original;   // 可以读写
    ref1 = 200;             // ✅ 可以修改
    
    // const引用
    const int& ref2 = original;  // 只读引用
    // ref2 = 300;               // ❌ 错误！不能通过const引用修改
    
    cout << "original = " << original << endl;
    cout << "ref2 = " << ref2 << endl;
}
```
## const引用的重要特性
```cpp
void const_reference_features()
{
    // 1. 权限缩小原则
    int a = 10;
    const int& cra = a;     // ✅ 权限缩小：可读写 → 只读
    
    // const int b = 20;
    // int& rb = b;         // ❌ 错误！权限放大：只读 → 可读写
    
    // 2. 绑定临时对象
    const int& temp_ref1 = 100;          // ✅ 正确
    const int& temp_ref2 = a + 50;       // ✅ 正确
    const double& temp_ref3 = 3.14;      // ✅ 正确
    
    // int& bad_ref1 = 100;              // ❌ 错误！
    // int& bad_ref2 = a + 50;           // ❌ 错误！
    
    // 3. 类型转换时的临时对象
    double d = 12.34;
    const int& int_ref = d;  // ✅ 创建临时int对象，绑定到const引用
    // int& bad_int_ref = d; // ❌ 错误！
    
    cout << "d = " << d << endl;
    cout << "int_ref = " << int_ref << endl;  // 12
}
```
## const引用的实用场景
```cpp
// 场景1：函数参数 - 避免拷贝，同时保护数据
void print_large_object(const vector<int>& data) {
    // data不会被意外修改，同时避免拷贝整个vector
    for(const int& num : data) {
        cout << num << " ";
    }
    cout << endl;
    // data.push_back(100);  // ❌ 编译错误！
}

// 场景2：返回const引用保护成员变量
class Student {
private:
    string name;
public:
    const string& get_name() const {  // 返回const引用
        return name;  // 避免拷贝，同时保护name不被外部修改
    }
};

// 场景3：高效遍历
void efficient_traversal(const vector<string>& words) {
    for(const string& word : words) {  // 避免字符串拷贝
        cout << word << " ";
    }
}

void demonstrate_const_ref_usage()
{
    vector<int> big_data = {1, 2, 3, 4, 5};
    print_large_object(big_data);  // 高效且安全
    
    vector<string> texts = {"hello", "world", "cpp"};
    efficient_traversal(texts);    // 避免字符串拷贝
}
```
##  综合总结表

| 特性       | 指针           | 引用     | const引用  |
| -------- | ------------ | ------ | -------- |
| **本质**   | 存储地址的变量      | 变量的别名  | 只读别名     |
| **初始化**  | 可不初始化        | 必须初始化  | 必须初始化    |
| **指向可变** | ✅ 可以改变       | ❌ 不能改变 | ❌ 不能改变   |
| **空值**   | ✅ 可以为nullptr | ❌ 不能为空 | ❌ 不能为空   |
| **访问方式** | 需要解引用(*)     | 直接使用   | 直接使用(只读) |
| **重指向**  | ✅ 可以         | ❌ 不能   | ❌ 不能     |
| **多级**   | ✅ 支持多级指针     | ❌ 不支持  | ❌ 不支持    |
| **安全性**  | 较低(野指针)      | 较高     | 最高       |

# 指针与引用的区别
```cpp
#include <iostream>
using namespace std;

void compare_pointers_references()
{
    int a = 10;
    int b = 20;
    
    // 1. 语法概念
    //引⽤是⼀个变量的取别名不开空间，指针是存储⼀个变量地址，要开空间
    int* p = &a;        // 指针需要取地址，存储地址
    int& r = a;         // 引用直接初始化，是别名
    
    // 2. 初始化要求
    // int* p2;         // ❌ 指针可以不初始化（危险！）
    // int& r2;         // ✅ 引用必须初始化
    
    // 3. 指向可变性
    p = &b;             // ✅ 指针可以改变指向
    // r = b;           // ❌ 这不是改变指向，这是赋值！
    // 引用一旦绑定，终身不变
    
    // 4. 访问方式
    *p = 30;            // 指针需要解引用
    r = 40;             // 引用直接使用
    
    // 5. 空值情况
    p = nullptr;        // ✅ 指针可以为空
    // int& r3 = nullptr; // ❌ 引用不能为空
    
    // 6. 多级概念
    int** pp = &p;      // ✅ 可以有指针的指针
    // int&& rr = r;    // ❌ 没有引用的引用（C++11中的&&是右值引用）
    
    // 7. sizeof大小
    cout << "sizeof(指针) = " << sizeof(p) << endl;    // 4或8字节（地址大小）
    cout << "sizeof(引用) = " << sizeof(r) << endl;    // 被引用对象的大小
    
    // 8. 安全性
    // 野指针问题：
    int* dangerous_ptr;  // 未初始化，野指针！
    // *dangerous_ptr = 100; // ❌ 可能导致程序崩溃
    
    // 引用相对安全：
    // int& dangerous_ref;   // 直接编译错误！
}
```

# 内联函数(Inline)
```cpp
// 普通函数调用有开销
int add(int a, int b) {
    return a + b;
}

// 内联函数 - 编译时直接展开代码
inline int inline_add(int a, int b) {
    return a + b;
}

int main()
{
    int result1 = add(1, 2);      // 需要函数调用
    int result2 = inline_add(1, 2); // 可能直接变成 1 + 2
    
    return 0;
}
```
## 对比宏函数
```cpp
#define ADD(a, b) ((a) + (b))  // 宏函数 - 容易出错

inline int add(int a, int b) {  // 内联函数 - 更安全
    return a + b;
}

int main()
{
    int x = 1, y = 2;
    
    // 宏的陷阱
    cout << ADD(x & y, x | y) << endl;  // 可能不是你期望的结果
    
    // 内联函数更安全
    cout << add(x & y, x | y) << endl;
    
    return 0;
}
```

# nullptr-明确的空指针
## 与NULL的区别
- NULL实际是一个宏，在cpp中被定义为字面常量0，在c中被定义成五类线指针（void*）的常量；不论采取何种定义，在使⽤空值的指针时，都不可避免的会遇到⼀些麻烦，本想通过f(NULL)调⽤指针版本的f(int*)函数，但是由于NULL被定义成0，调⽤了f(int x)，因此与程序的初衷相悖。f((void*)NULL);调用会报错。

- C++11中引⼊nullptr，nullptr是⼀个特殊的关键字，nullptr是⼀种特殊类型的字面量，它可以转换成任意其他类型的指针类型。使⽤nullptr定义空指针可以避免类型转换的问题，因为nullptr只能被隐式地转换为指针类型，⽽不能被转换为整数类型。
```java
#ifndef NULL

#ifdef __cplusplus

   #define NULL 0

 #else

   #define NULL ((void *)0)

 #endif

#endif
```
```cpp
void func(int x) {
    cout << "整数版本" << endl;
}

void func(int* ptr) {
    cout << "指针版本" << endl;
}

int main()
{
    func(0);        // 调用整数版本
    func(NULL);     // 可能调用整数版本（有歧义）
    func(nullptr);  // 明确调用指针版本
    
    return 0;
```
## nullptr优势
```cpp
void nullptr_advantages()
{
    // 1. 类型安全
    int* p1 = nullptr;      // ✅ 正确
    // int i = nullptr;     // ❌ 错误！不能将nullptr赋给整数
    
    // 2. 明确表达意图
    int* ptr1 = 0;          // 这是空指针？还是整数0？
    int* ptr2 = nullptr;    // 明确表示空指针！
    
    // 3. 模板编程中更安全
    template<typename T>
    void safe_delete(T* ptr) {
        if(ptr != nullptr) {
            delete ptr;
            ptr = nullptr;  // 避免野指针
        }
    }
}
```
