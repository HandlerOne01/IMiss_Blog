---
title: "多态"
published: 2026-03-07 18:48:32
description: "多态(polymorphism)：即\"多种形态\"，指同一接口表现出不同行为的能力。"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

#  多态的概念

## 定义
**多态(polymorphism)**：即"多种形态"，指同一接口表现出不同行为的能力。

## 多态的分类

1. **编译时多态（静态多态）**
    - 函数重载
    - 函数模板
    - 特点：编译时确定调用哪个函数，通过参数类型匹配
2. **运行时多态（动态多态）**
    - 通过虚函数实现
    - 特点：运行时根据对象类型确定调用哪个函数
## 实际应用示例
```cpp
// 买票场景
普通人买票 → 全价
学生买票 → 优惠价（5折或75折）
军人买票 → 优先购票

// 动物叫场景
猫对象 → "喵"
狗对象 → "汪汪"
```

#  多态的定义与实现
## 多态的构成条件（三个必要条件）
1. **继承关系**：存在继承关系的类
2. **虚函数重写**：派生类重写基类的虚函数
3. **基类指针/引用**：通过基类的指针或引用调用虚函数

## 虚函数 (Virtual Function)
```cpp
class Person {
public:
    // 虚函数声明
    virtual void BuyTicket() { 
        cout << "买票-全价" << endl; 
    }
};
```

## 虚函数重写/覆盖 (Override)
- 派生类中定义与基类**完全相同**的虚函数
- "完全相同"指：函数名、参数列表、返回值类型都相同
```cpp
class Student : public Person {
public:
    // 重写基类虚函数
    virtual void BuyTicket() { 
        cout << "买票-打折" << endl; 
    }
};
```
## 多态调用示例
```cpp
void Func(Person* ptr) {
    ptr->BuyTicket();  // 多态调用：根据ptr指向的实际对象类型决定
}

int main() {
    Person ps;
    Student st;
    
    Func(&ps);  // 输出：买票-全价
    Func(&st);  // 输出：买票-打折
    
    return 0;
}
```

# 虚函数重写的特殊情况

## 协变

- 允许派生类虚函数返回类型与基类不同
- 要求：返回类型是基类/派生类关系的指针或引用
```cpp
class A {};
class B : public A {};

class Person {
public:
    virtual A* BuyTicket() {
        cout << "买票-全价" << endl;
        return nullptr;
    }
};

class Student : public Person {
public:
    virtual B* BuyTicket() {  // 协变：返回派生类指针
        cout << "买票-打折" << endl;
        return nullptr;
    }
};
```

## 析构函数的重写

- 基类析构函数为虚函数时，派生类析构函数自动构成重写
- 编译器将析构函数名统一处理为`destructor`

- 为什么基类析构函数要声明为虚函数：
	当通过基类指针删除派生类对象时，如果基类没有虚析构函数，那么只会调用基类的析构函数，导致派生类的资源泄漏。
```cpp
class A {
public:
    virtual ~A() {  // 虚析构函数
        cout << "~A()" << endl;
    }
};

class B : public A {
public:
    ~B() {  // 自动构成重写
        cout << "~B()" << endl;
        delete _p;
    }
private:
    int* _p = new int[10];
};

int main() {
    A* p = new B;
    delete p;  // 正确调用：~B() → ~A()
    return 0;
}
```

## 派生类virtual关键字可省略
```cpp
class Student : public Person {
public:
    void BuyTicket() {  // 不加virtual也构成重写（不推荐）
        cout << "买票-打折" << endl;
    }
};
```

## 访问权限不影响重写
```cpp
class Person {
private:
    virtual void BuyTicket() {  // private虚函数
        cout << "买票-全价" << endl;
    }
public:
    void Func() {
        BuyTicket();
    }
};

class Student : public Person {
public:
    virtual void BuyTicket() {  // 可以重写private虚函数
        cout << "买票-打折" << endl;
    }
};
```

## 选择题示例
```cpp
class A {
public:
    virtual void func(int val = 1) {
        std::cout << "A->" << val << std::endl;
    }
    virtual void test() { func(); }
};

class B : public A {
public:
    void func(int val = 0) {
        std::cout << "B->" << val << std::endl;
    }
};

int main() {
    B* p = new B;
    p->test();  // 输出：B->1
    return 0;
}
```
1. 谁调用了 `test()`？
	- `p` 是 `B` 的指针
	- 但 `test()` 是 `A` 的函数（B继承来的）
	- **效果相当于**：`A` 在调用 `test()`

2. `test()` 里面做了什么？
```cpp
void test() { func(); }  // 在A的眼里，这是 func(1)
```
- 重写的本质是重写虚函数的实现，故函数参数该使用基函数参数1
- 在 `A` 的代码里，`func()` 默认参数是 `1`

3. 到底执行哪个 `func()`？
	- 虽然参数是 `A` 决定的（`1`）
	- 但 `func()` 是虚函数，实际执行 `B` 的版本
	- 所以最终：`B` 的 `func(1)`

4. 输出：B->1

## override关键字

- 显式声明重写，增强代码可读性
- 编译器检查是否真正重写
```cpp
class Car {
public:
    virtual void Drive() {}
};

class Benz : public Car {
public:
    virtual void Drive() override {  // 明确表示重写
        cout << "Benz-舒适" << endl;
    }
    
    // 错误示例：函数名拼写错误
    virtual void Dirve() override {  // 编译错误：没有重写任何函数
        cout << "Benz-舒适" << endl;
    }
};
```
## final关键字

1. **修饰虚函数**：禁止进一步重写
2. **修饰类**：禁止继承
```cpp
// 1. 禁止重写虚函数
class Car {
public:
    virtual void Drive() final {}  // 禁止派生类重写
};

class Benz : public Car {
public:
    virtual void Drive() {  // 编译错误：final函数不能被重写
        cout << "Benz-舒适" << endl;
    }
};

// 2. 禁止继承类
class Car final {  // Car类不能被继承
public:
    virtual void Drive() {}
};

class Benz : public Car {  // 编译错误：不能继承final类
};
```

# 重载，重载，隐藏对比
|特性|作用域|函数名|参数列表|返回值|virtual关键字|其他|
|---|---|---|---|---|---|---|
|**重载(Overload)**|同一类/同一作用域|相同|必须不同|可不同|无关|编译时确定|
|**重写/覆盖(Override)**|基类和派生类|相同|必须相同|必须相同（协变除外）|必须是虚函数|运行时多态|
|**隐藏(Hiding)**|基类和派生类|相同|可同可不同|可同可不同|无关|不构成重写就是隐藏|
# 纯虚函数

- 虚函数后面加`= 0`
- 可以不提供实现（也可以提供）

```cpp
virtual void Drive() = 0;  // 纯虚函数
```

### 抽象类

- 包含纯虚函数的类
- **不能实例化对象**
- 派生类必须重写所有纯虚函数，否则也是抽象类
```cpp
class Car {  // 抽象类
public:
    virtual void Drive() = 0;  // 纯虚函数
    virtual ~Car() {}          // 虚析构函数
};

class Benz : public Car {
public:
    virtual void Drive() override {  // 必须重写
        cout << "Benz-舒适" << endl;
    }
};

int main() {
    // Car car;  // 错误：抽象类不能实例化
    Car* p = new Benz;  // 正确：通过指针/引用
    p->Drive();
    delete p;
    return 0;
}
```

# 多态的原理（底层实现）

##  虚函数表指针(vptr)
```cpp
class Base {
public:
    virtual void Func1() { cout << "Func1()" << endl; }
private:
    int _b = 1;
    char _ch = 'x';
};

int main() {
    Base b;
    cout << sizeof(b) << endl;  // 32位: 12 bytes (vptr:4 + int:4 + char:1 + padding:3)
    return 0;
}
```

## 对象内存布局
```cpp
[ vptr(4) | _b(4) | _ch(1) | padding(3) ]
```

## 虚函数表(vtable)结构
```cpp
class Base {
public:
    virtual void func1() { cout << "Base::func1" << endl; }
    virtual void func2() { cout << "Base::func2" << endl; }
    void func3() { cout << "Base::func3" << endl; }  // 普通函数
    int a = 1;
};

class Derive : public Base {
public:
    virtual void func1() override { cout << "Derive::func1" << endl; }  // 重写
    virtual void func4() { cout << "Derive::func4" << endl; }           // 新增虚函数
    int b = 2;
};
```

## 虚函数表内容

- **Base对象vtable**：\[&Base::func1, &Base::func2]
- **Derive对象vtable**：\[&Derive::func1, &Base::func2, &Derive::func4]

## 多态调用过程
```cpp
Base* ptr = new Derive;
ptr->func1();  // 多态调用
```
**调用过程**：
1. 通过ptr找到对象
2. 从对象头部获取vptr
3. 通过vptr找到虚函数表
4. 在虚函数表中找到func1的地址（&Derive::func1）
5. 调用该函数

## 动态绑定 vs 静态绑定
```cpp
// 1. 动态绑定（多态）
ptr->virtual_func();  // 运行时确定函数地址

// 汇编代码示例：
// mov eax, dword ptr [ptr]    ; 获取对象地址
// mov edx, dword ptr [eax]    ; 获取vptr
// mov eax, dword ptr [edx]    ; 获取虚函数地址
// call eax                    ; 调用函数

// 2. 静态绑定（非多态）
ptr->non_virtual_func();  // 编译时确定函数地址

// 汇编代码示例：
// call Base::non_virtual_func ; 直接调用固定地址
```

## 虚函数表验证代码
```cpp
#include <iostream>
using namespace std;

// 打印各种内存区域的地址
void PrintMemoryLayout() {
    int stack_var = 0;
    static int static_var = 0;
    int* heap_var = new int(0);
    const char* const_var = "constant";
    
    cout << "栈区地址: " << &stack_var << endl;
    cout << "静态区地址: " << &static_var << endl;
    cout << "堆区地址: " << heap_var << endl;
    cout << "常量区地址: " << (void*)const_var << endl;
}

// 查看虚函数表地址
class Base {
public:
    virtual void f1() {}
    virtual void f2() {}
};

int main() {
    PrintMemoryLayout();
    
    Base b;
    Base* p = &b;
    
    // 获取虚函数表地址（对象前4/8字节）
    void** vtable = *(void***)p;
    cout << "虚函数表地址: " << vtable << endl;
    cout << "第一个虚函数地址: " << vtable[0] << endl;
    cout << "第二个虚函数地址: " << vtable[1] << endl;
    
    // VS编译器会在虚函数表末尾放0x00000000标记
    // g++编译器可能不放
    
    delete heap_var;
    return 0;
}
```

## 虚函数表知识点

1. 基类对象的虚函数表中存放基类所有虚函数的地址。同类型的对象共⽤同⼀张虚表，不同类型的对象各⾃有独⽴的虚表，所以基类和派⽣类有各⾃独⽴的虚表。•派⽣类由两部分构成，继承下来的基类和⾃⼰的成员，⼀般情况下，继承下来的基类中有虚函数表指针，⾃⼰就不会再⽣成虚函数表指针。但是要注意的这⾥继承下来的基类部分虚函数表指针和基类对象的虚函数表指针不是同⼀个，就像基类对象的成员和派⽣类对象中的基类对象成员也独⽴的。

2. 派⽣类中重写的基类的虚函数，派⽣类的虚函数表中对应的虚函数就会被覆盖成派⽣类重写的虚函数地址。

3. 派⽣类的虚函数表中包含，(1)基类的虚函数地址，(2)派⽣类重写的虚函数地址完成覆盖，派⽣类⾃⼰的虚函数地址三个部分。

4. 虚函数表本质是⼀个存虚函数指针的指针数组，⼀般情况这个数组最后⾯放了⼀个0x00000000标记。(这个C++并没有进⾏规定，各个编译器⾃⾏定义的，vs系列编译器会再后⾯放个0x00000000标记，g++系列编译不会放)

 5. 虚函数存在哪的？虚函数和普通函数⼀样的，编译好后是⼀段指令，都是存在代码段的，只是虚函数的地址⼜存到了虚表中。
6. 虚函数表存在哪的？这个问题严格说并没有标准答案C++标准并没有规定，我们写下⾯的代码可以对⽐验证⼀下。vs下是存在代码段(常量区)
