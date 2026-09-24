---
title: "指针，引用与const的复杂关系"
published: 2025-12-04 20:34:27
description: "从右向左读： const在左边 ： 指向的内容是const const在右边：指针本身是const 引用没有const：因为引用不能重新绑定 mutable是例外：可以在const函数中修改"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 指向内容与指向本身
## 对指针来说
```cpp
int a = 10;
int* p = &a;

// p本身：是一个变量，存储着地址值（比如 0x7ffee4354a5c）
// p指向的内容：*p 得到的是 a 的值（10）

// 修改p本身（改变指向）
int b = 20;
p = &b;  // p现在指向b，p本身的值变了

// 修改p指向的内容
*p = 30;  // 现在b的值变成30，p本身的值没变（还是b的地址）
```

## 对引用来说
```cpp
int a = 10;
int& r = a;

// r本身：不是独立的变量，是a的别名
// r指向的内容：就是a的内容

// 不能修改引用本身（不能改变绑定）
int b = 20;
// r = &b;  // 错误！引用不能重新绑定

// 修改引用指向的内容
r = 30;  // 修改的是a的值，现在a=30
```

# const的基本用法
```cpp
const int a = 10;        // a是常量，不能修改
// a = 20;               // 错误：不能修改常量

int b = 20;
const int* p1 = &b;      // 指向常量的指针（可以修改指针，不能修改内容）
// *p1 = 30;             // 错误：不能通过p1修改b
p1 = nullptr;            // 正确：可以修改指针本身

int* const p2 = &b;      // 常量指针（不能修改指针，可以修改内容）
*p2 = 30;                // 正确：可以修改b的值
// p2 = nullptr;         // 错误：不能修改指针本身

const int* const p3 = &b; // 指向常量的常量指针（都不能修改）
```

# const 与引用组合
```cpp
#include <iostream>
using namespace std;

void basicConstReference() {
    cout << "=== const与引用的基本用法 ===" << endl;
    
    int x = 10;
    int y = 20;
    
    // 1. 普通引用
    int& r1 = x;         // 可以修改x
    r1 = 15;             // OK: x现在是15
    
    // 2. const引用（引用常量）
    const int& r2 = x;   // 不能通过r2修改x
    // r2 = 25;          // 错误：r2是const引用
    x = 25;              // OK：直接修改x
    
    // 3. const引用绑定到常量
    const int& r3 = 30;  // OK：const引用可以绑定到字面值
    // int& r4 = 30;     // 错误：非const引用不能绑定字面值
    
    // 4. const引用绑定到不同类型的临时对象
    double d = 3.14;
    const int& r5 = d;   // OK：创建临时int对象
    // int& r6 = d;      // 错误：非const引用不能绑定临时对象
    
    cout << "r1=" << r1 << ", r2=" << r2 << ", r3=" << r3 << ", r5=" << r5 << endl;
}
```

# const 的各种组合
```cpp
#include <iostream>
using namespace std;

void allCombinations() {
    cout << "\n=== const的完整排列组合 ===" << endl;
    
    int data = 100;
    int other = 200;
    const int constData = 300;
    
    // ========== 指针的const组合 ==========
    cout << "\n1. 指针的const组合：" << endl;
    
    // 组合1: 指向常量的指针（pointer to const）
    const int* p1 = &data;       // 可以修改指针，不能修改内容
    p1 = &other;                 // OK
    // *p1 = 999;                // 错误
    
    // 组合2: 常量指针（const pointer）
    int* const p2 = &data;       // 不能修改指针，可以修改内容
    // p2 = &other;              // 错误
    *p2 = 999;                   // OK
    
    // 组合3: 指向常量的常量指针
    const int* const p3 = &data; // 都不能修改
    // p3 = &other;              // 错误
    // *p3 = 999;                // 错误
    
    // 组合4: 指向const对象的const指针
    const int* const p4 = &constData;  // 最严格的组合
    
    // ========== 引用的const组合 ==========
    cout << "\n2. 引用的const组合：" << endl;
    
    // 引用本身不能是const（因为引用不能重新绑定）
    // int& const r1 = data;     // 错误：引用天然是const的
    
    // 只能有：引用到const对象
    const int& r2 = data;        // 不能通过r2修改data
    const int& r3 = constData;   // 引用到const对象
    const int& r4 = 400;         // 可以绑定到字面值
    
    // ========== 指针的引用 ==========
    cout << "\n3. 指针的引用：" << endl;
    
    int* ptr = &data;
    
    // 指针的引用
    int*& rp1 = ptr;             // 可以修改ptr指向的内容，也可以修改ptr本身
    *rp1 = 111;                  // 修改data的值
    rp1 = &other;                // 修改ptr的指向
    
    // 指向常量的指针的引用
    const int*& rp2 = p1;        // p1是const int*
    
    // 常量指针的引用
    int* const& rp3 = p2;        // p2是int* const
    
    // 指向常量的常量指针的引用
    const int* const& rp4 = p3;  // 最复杂的类型！
}
```

# 函数参数中的const
```cpp
#include <iostream>
using namespace std;

class Data {
public:
    int value;
    Data(int v) : value(v) {}
};

void functionParameters() {
    cout << "\n=== 函数参数中的const ===" << endl;
    
    Data d(100);
    const Data cd(200);
    
    // 1. 按值传递
    auto func1 = [](Data param) {
        param.value = 999;  // 修改的是副本
        return param.value;
    };
    
    // 2. 引用传递（可以修改原始对象）
    auto func2 = [](Data& param) {
        param.value = 888;  // 修改原始对象
        return param.value;
    };
    
    // 3. const引用传递（不能修改，效率高）
    auto func3 = [](const Data& param) {
        // param.value = 777;  // 错误：不能修改
        return param.value;
    };
    
    // 4. 指针传递
    auto func4 = [](Data* param) {
        if (param) {
            param->value = 666;
        }
    };
    
    // 5. 指向const的指针
    auto func5 = [](const Data* param) {
        if (param) {
            // param->value = 555;  // 错误
            return param->value;
        }
        return 0;
    };
    
    cout << "func1修改副本: " << func1(d) << ", 原对象d.value=" << d.value << endl;
    cout << "func2修改原对象后: " << func2(d) << ", d.value=" << d.value << endl;
    cout << "func3读取const引用: " << func3(d) << endl;
    
    func4(&d);
    cout << "func4通过指针修改后: " << d.value << endl;
}
```

# 模板中的const推导
```cpp
#include <iostream>
#include <type_traits>
using namespace std;

template<typename T>
void printTypeInfo(const char* name, T&& value) {
    cout << "\n分析: " << name << endl;
    cout << "  传入类型: " << typeid(decltype(value)).name() << endl;
    cout << "  T的类型: " << typeid(T).name() << endl;
    cout << "  是左值引用? " << is_lvalue_reference<decltype(value)>::value << endl;
    cout << "  是右值引用? " << is_rvalue_reference<decltype(value)>::value << endl;
    cout << "  有const限定? " << is_const<remove_reference_t<decltype(value)>>::value << endl;
}

void templateConstDeduction() {
    cout << "\n=== 模板中的const推导 ===" << endl;
    
    int x = 10;
    const int cx = 20;
    const int& crx = x;
    int&& rrx = 30;  // 右值引用
    
    printTypeInfo("int", x);
    printTypeInfo("const int", cx);
    printTypeInfo("const int&", crx);
    printTypeInfo("int&&", move(x));  // 右值
    printTypeInfo("字面值", 42);
    
    // 完美转发中的const
    auto forwardFunc = [](auto&& param) {
        // auto&&是万能引用
        cout << "\n万能引用参数: ";
        if constexpr (is_lvalue_reference_v<decltype(param)>) {
            cout << "左值引用";
            if (is_const_v<remove_reference_t<decltype(param)>>) {
                cout << " (const)";
            }
        } else if (is_rvalue_reference_v<decltype(param)>) {
            cout << "右值引用";
        }
    };
    
    forwardFunc(x);      // 左值
    forwardFunc(cx);     // const左值
    forwardFunc(100);    // 右值
}
```

# 类成员中的const
```cpp
#include <iostream>
using namespace std;

class ComplexClass {
private:
    int regularData;
    const int constData;           // const成员，必须在初始化列表初始化
    mutable int mutableData;       // mutable成员，即使在const函数中也可修改
    int* ptr;
    const int* constPtr;
    
public:
    ComplexClass(int val) 
        : regularData(val), constData(val * 2), mutableData(0),
          ptr(&regularData), constPtr(&constData) {
    }
    
    // 1. const成员函数 - 不能修改非mutable成员
    int getRegularData() const {
        // regularData = 999;      // 错误：不能修改
        mutableData++;             // OK：mutable成员
        return regularData;
    }
    
    // 2. 返回const引用
    const int& getConstRef() const {
        return regularData;
    }
    
    // 3. 返回指向const的指针
    const int* getConstPtr() const {
        return ptr;
    }
    
    // 4. 重载const和非const版本
    int& getData() {               // 非const版本
        cout << "调用非const版本" << endl;
        return regularData;
    }
    
    const int& getData() const {   // const版本
        cout << "调用const版本" << endl;
        return regularData;
    }
    
    // 5. 修改指针指向的内容
    void modifyThroughPointer() const {
        // ptr = nullptr;          // 错误：不能修改指针本身
        *ptr = 888;                // OK：可以修改指针指向的内容
    }
    
    // 6. 处理const指针
    void processConstPointer() {
        // *constPtr = 999;        // 错误：指向const
        // constPtr = nullptr;     // 错误：指针本身是const
    }
};

void classMemberConst() {
    cout << "\n=== 类成员中的const ===" << endl;
    
    ComplexClass obj(100);
    const ComplexClass constObj(200);
    
    cout << "非const对象调用: ";
    obj.getData() = 300;           // 调用非const版本，可以修改
    
    cout << "const对象调用: ";
    // constObj.getData() = 400;   // 错误：返回const引用
    
    cout << "通过const引用调用: ";
    const ComplexClass& ref = obj;
    int value = ref.getData();     // 调用const版本
}
```

# const 在类型推到中的规则
```cpp
#include <iostream>
#include <type_traits>
using namespace std;

void typeDeductionRules() {
    cout << "\n=== const的类型推导规则 ===" << endl;
    
    // 规则1：auto会丢弃引用和顶层const
    const int ci = 10;
    const int& cr = ci;
    auto a1 = ci;      // a1的类型是int，丢弃const
    auto a2 = cr;      // a2的类型是int，丢弃const和引用
    
    a1 = 20;           // OK：a1不是const
    // ci = 30;        // 错误：ci是const
    
    // 规则2：decltype会保留所有信息
    decltype(ci) d1 = ci;    // d1是const int
    decltype(cr) d2 = ci;    // d2是const int&
    // d1 = 40;              // 错误：d1是const
    
    // 规则3：auto&会保留const
    auto& a3 = ci;           // a3是const int&
    // a3 = 50;              // 错误：a3是const引用
    
    // 规则4：const auto
    const auto ca1 = ci;     // ca1是const int（冗余的const）
    const auto& ca2 = ci;    // ca2是const int&
    
    // 规则5：模板参数推导
    auto deduce = [](const auto& param) {
        using ParamType = decltype(param);
        cout << "  推导出的类型: " << typeid(ParamType).name() << endl;
    };
    
    int x = 10;
    deduce(x);               // param是const int&
    deduce(ci);              // param是const int&
}
```

# 总结：const的位置与含义
```cpp
位置                  含义                   示例
-----               -----                  -----
const T             常量对象                const int x = 10;
T const             同上（较少用）          int const x = 10;

const T*            指向常量的指针          const int* p = &x;
T const*            同上                   int const* p = &x;

T* const            常量指针                int* const p = &x;

const T* const      指向常量的常量指针      const int* const p = &x;

const T&            常量引用                const int& r = x;
T& const            错误！引用天然是const

const T*&           指向常量的指针的引用    const int*& rp = p;

T* const&           常量指针的引用          int* const& rp = p;

const T* const&     指向常量的常量指针的引用 最复杂的类型
```

# 记忆技巧
1. **从右向左读**：
```cpp
const int* const p;  // p是const指针，指向const int
// 读作：p is a const pointer to const int
```
2. **const在左边** ： 指向的内容是const
3. **const在右边**：指针本身是const
4. **引用没有const**：因为引用不能重新绑定
5. **mutable是例外**：可以在const函数中修改
