---
title: "继承"
published: 2025-12-09 13:36:03
description: "继承（Inheritance） 是面向对象程序设计中实现代码复用的核心机制。它允许我们在保持原有类特性的基础上进行扩展，增加新的成员函数和成员变量，从而创建新的类（派生类）。"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 继承的基本概念与原理

## 什么是继承？

**继承（Inheritance）** 是面向对象程序设计中实现代码复用的核心机制。它允许我们在保持原有类特性的基础上进行扩展，增加新的成员函数和成员变量，从而创建新的类（派生类）。

## 继承解决的问题

在没有继承的情况下，不同类中重复的代码会导致：
- 代码冗余
- 维护困难
- 一致性难以保证

**示例：学生和老师的重复代码**
```cpp
// 没有继承的设计（存在冗余）
class Student {
public:
    void identity() { /* 身份验证 */ }
    void study() { /* 学习 */ }
protected:
    string _name;    // 重复
    string _address; // 重复
    string _tel;     // 重复
    int _age;        // 重复
    int _stuid;      // 学生特有
};

class Teacher {
public:
    void identity() { /* 身份验证 */ }
    void teaching() { /* 授课 */ }
protected:
    string _name;    // 重复
    string _address; // 重复
    string _tel;     // 重复
    int _age;        // 重复
    string _title;   // 老师特有
};
```

## 继承的实现方式
```cpp
// 使用继承优化设计
class Person {  // 基类/父类
public:
    void identity() { cout << "身份验证: " << _name << endl; }
protected:
    string _name = "张三";
    string _address;
    string _tel;
    int _age = 18;
};

class Student : public Person {  // 派生类/子类
public:
    void study() { /* 学习 */ }
protected:
    int _stuid;  // 学生特有
};

class Teacher : public Person {  // 派生类/子类
public:
    void teaching() { /* 授课 */ }
protected:
    string _title;  // 老师特有
};

int main() {
    Student s;
    Teacher t;
    s.identity();  // 复用Person的代码
    t.identity();  // 复用Person的代码
    return 0;
}
```

# 继承的详细定义与访问控制

## 继承的语法格式
```cpp
// 基本语法
class 派生类名 : 继承方式 基类名 {
    // 派生类新增成员
};

// 示例
class Student : public Person {
    // Student特有的成员
};
```

## 三种继承方式

C++支持三种继承方式，它们决定了基类成员在派生类中的访问权限：

| 基类成员/继承方式   | public继承  | protected继承 | private继承 |
| ----------- | --------- | ----------- | --------- |
| public成员    | public    | protected   | private   |
| protected成员 | protected | protected   | private   |
| private成员   | 不可见       | 不可见         | 不可见       |

## 访问权限详细规则

### 规则1：private成员不可见
基类的private成员无论以什么方式继承，在派生类中都不可见。这里的"不可见"是指：
- 基类私有成员仍然被继承到了派生类对象中
- 但派生类对象（无论在类内还是类外）都不能直接访问它
### 规则2：protected成员的诞生
protected访问限定符就是为了继承而设计的：
- 不想在类外直接被访问
- 但需要在派生类中能访问
- 就定义为protected
### 规则3：访问权限计算公式
基类的其他成员在派生类中的访问方式 = Min(成员在基类的访问限定符, 继承方式)
权限等级：public > protected > private
### 规则4：默认继承方式
- class定义的类默认是private继承
- struct定义的类默认是public继承
- **建议**：总是显式写出继承方式
### 规则5：实际应用建议
- 主要使用public继承
- 几乎不使用protected/private继承
- 因为protected/private继承下来的成员只能在派生类内部使用，扩展维护性差

## 完整示例
```cpp
class Person {
public:
    void Print() {
        cout << _name << endl;     // 可以访问
        cout << _age << endl;      // 可以访问（成员函数内）
    }
    
protected:
    string _name;  // 姓名
    
private:
    int _age;      // 年龄
};

// public继承示例
class Student : public Person {
public:
    void Test() {
        _name = "张三";  // √ 可以访问基类protected成员
        // _age = 18;    // × 不能访问基类private成员
        Print();         // √ 可以访问基类public成员函数
    }
    
protected:
    int _stunum;  // 学号
};

// private继承示例（不推荐）
class Teacher : private Person {
public:
    void Test() {
        _name = "李四";  // √ 在派生类内部可以访问
        Print();         // √ 在派生类内部可以访问
    }
};

int main() {
    Student s;
    s.Print();  // √ public继承，基类public成员在派生类中仍是public
    
    Teacher t;
    // t.Print();  // × private继承，基类public成员在派生类中变为private
    
    return 0;
}
```

# 基类与派生类的对象转换（切片）

## 什么是切片
派生类对象赋值给基类的对象、指针或引用时，编译器会"切掉"派生类特有的部分，只保留基类部分。
## 转换规则详解

### 允许的转换（向上转型)
```cpp
class Person {
protected:
    string _name;
    string _sex;
    int _age;
};

class Student : public Person {
public:
    int _No;  // 学号
};

int main() {
    Student sobj;
    
    // 1. 派生类对象赋值给基类指针（安全）
    Person* pp = &sobj;
    // 2. 派生类对象赋值给基类引用（安全）
    Person& rp = sobj;
    
    // 3. 派生类对象赋值给基类对象（发生切片）
    Person pobj = sobj;  // 调用Person的拷贝构造函数
    
    return 0;
}

// ptr指向Student对象中的Person部分
// ref引用Student对象中的Person部分
// 通过ptr/ref只能访问Person的成员
// ptr->_No  // 错误！无法访问派生类特有成员
```
#### **派生类指针赋值给基类指针（安全）**

```cpp
Person* pp = &sobj;  // 安全，不会切片
```
- **内存情况**：`pp`指向的是`sobj`对象的起始地址
- **类型转换**：编译器进行隐式向上转型（upcast）
- **可访问性**：通过`pp`只能访问`Person`类的成员，不能访问`Student`特有的成员（如`_No`）
- **没有切片**：因为只是指针，指向的还是完整的`Student`对象

#### **派生类引用赋值给基类引用（安全）**

```cpp
Person& rp = sobj;  // 安全，不会切片
```
- **内存情况**：`rp`是`sobj`的引用，操作的是同一个对象
- **类型转换**：编译器进行隐式向上转型
- **可访问性**：通过`rp`只能访问`Person`类的成员
- **没有切片**：引用本身就是对象的别名，没有创建新对象

####  **派生类对象赋值给基类对象（发生切片）**

```cpp
Person pobj = sobj;  // 发生切片！
```
- **发生拷贝**：调用`Person`的拷贝构造函数
- **内存情况**：`pobj`是一个全新的`Person`对象
- **数据丢失**：只拷贝了`sobj`中的`Person`部分（`_name`, `_sex`, `_age`），`Student`特有的成员（`_No`）被丢弃
- **这就是切片（object slicing）**
### 不允许的转换（向下转型）
```cpp
int main() {
    Person pobj;
    Student sobj;
    
    // 错误！基类对象不能赋值给派生类对象
    // sobj = pobj;  // 编译报错
    
    // 错误！基类指针不能隐式转换为派生类指针
    // Student* sp = &pobj;  // 编译报错
    
    return 0;
}
```

## 切片的底层原理
```cpp
// 内存布局示意图
class Person {        class Student : public Person {
    string _name;         string _name;   // 继承自Person
    string _sex;     →    string _sex;    // 继承自Person
    int _age;             int _age;       // 继承自Person
};                        int _No;        // Student特有
                       };

// 当Student对象赋值给Person对象时：
Student s;          // 内存：| _name | _sex | _age | _No |
Person p = s;       // 内存：| _name | _sex | _age |      ← 切掉了_No
```
## 安全的下行转换
```cpp
// 方法1：dynamic_cast（需要基类有虚函数）
class Person {
public:
    virtual ~Person() {}  // 至少有一个虚函数
};

class Student : public Person {
public:
    void study() { cout << "学习中..." << endl; }
};

int main() {
    Person* p = new Student();
    
    // 安全的向下转型
    Student* s = dynamic_cast<Student*>(p);
    if (s != nullptr) {
        s->study();  // 安全调用
    }
    
    delete p;
    return 0;
}

// 方法2：static_cast（在确定类型时使用）
Student st;
Person* p = &st;
Student* s = static_cast<Student*>(p);  // 确定p指向Student对象
```

# 继承中的作用域与隐藏规则
### 继承体系中的作用域
- 基类和派生类都有独立的作用域
- 派生类的作用域嵌套在基类作用域中
- 查找规则：先查找派生类，再查找基类
## 同名成员的隐藏（重定义）
当派生类定义了与基类同名的成员时，会隐藏基类的同名成员。
```cpp
class Person {
protected:
    string _name = "小李子";
    int _num = 111;  // 身份证号
};

class Student : public Person {
public:
    void Print() {
        cout << "姓名：" << _name << endl;            // √ 访问Person::_name
        cout << "身份证号：" << Person::_num << endl; // √ 显示指定访问基类成员
        cout << "学号：" << _num << endl;             // √ 访问Student::_num
    }
protected:
    int _num = 999;  // 学号，隐藏了Person::_num
};

int main() {
    Student s;
    s.Print();
    return 0;
}
```

## 成员函数的隐藏

**重要规则**：函数隐藏只需要函数名相同，与参数列表无关！
```cpp
class A {
public:
    void func() {
        cout << "A::func()" << endl;
    }
};

class B : public A {
public:
    void func(int i) {  // 隐藏了A::func()
        cout << "B::func(int i): " << i << endl;
    }
};

int main() {
    B b;
    b.func(10);     // √ 调用B::func(int)
    // b.func();    // × A::func()被隐藏
    b.A::func();    // √ 显示调用基类函数
    
    return 0;
}
```

## 一道选择题
A和B类中的两个func构成什么关系（）

A. 重载 B. 隐藏 C.没关系

下⾯程序的编译运⾏结果是什么（）

A. 编译报错 B. 运⾏报错 C. 正常运⾏
```cpp
class A {
public:
    void func() {
        cout << "func()" << endl;
    }
};

class B : public A {
public:
    void func(int i) {
        cout << "func(int i)" << i << endl;
    }
};

int main() {
    B b;
    b.func(10);  // 正确
    // b.func(); // 编译错误：A::func()被B::func(int)隐藏
    **答案**：B中的func隐藏了A中的func，两者构成隐藏关系。
}
```

# 派生类的默认成员函数详解

## 默认成员函数的继承规则
### 1. 构造函数
- 派生类构造函数必须调用基类构造函数初始化基类部分
- 如果基类没有默认构造函数，必须在派生类构造函数的初始化列表中显式调用
### 2. 拷贝构造函数
- 派生类拷贝构造函数必须调用基类拷贝构造函数
- 完成基类部分的拷贝初始化
### 3. 赋值运算符重载
- 派生类operator=必须显式调用基类operator=
- 派生类的operator=会隐藏基类的operator=
- 需要指定基类作用域来调用
### 4. 析构函数
- 派生类析构函数执行完毕后自动调用基类析构函数
- 保证清理顺序：派生类成员 → 基类成员
- 多态场景下，析构函数可能需要构成重写（需要同名）

### 代码示例
```cpp
class Person {
public:
    Person(const char* name = "peter")
        : _name(name) {
        cout << "Person()" << endl;
    }
    
    Person(const Person& p)
        : _name(p._name) {
        cout << "Person(const Person& p)" << endl;
    }
    
    Person& operator=(const Person& p) {
        cout << "Person operator=(const Person& p)" << endl;
        if (this != &p)
            _name = p._name;
        return *this;
    }
    
    ~Person() {
        cout << "~Person()" << endl;
    }
    
protected:
    string _name;
};

class Student : public Person {
public:
    Student(const char* name, int num)
        : Person(name)   // 必须调用基类构造函数
        , _num(num) {
        cout << "Student()" << endl;
    }
    
    Student(const Student& s)
        : Person(s)      // 调用基类拷贝构造函数
        , _num(s._num) {
        cout << "Student(const Student& s)" << endl;
    }
    
    Student& operator=(const Student& s) {
        cout << "Student& operator=(const Student& s)" << endl;
        if (this != &s) {
            Person::operator=(s);  // 显式调用基类operator=
            _num = s._num;
        }
        return *this;
    }
    
    ~Student() {
        cout << "~Student()" << endl;
        // 这里编译器会自动插入 Person::~Person()
    }
    
protected:
    int _num;
};

int main() {
    Student s1("jack", 18);
    Student s2(s1);           // 调用拷贝构造
    Student s3("rose", 17);
    s1 = s3;                  // 调用赋值运算符
    
    return 0;
}
```

## 执行顺序总结
```cpp
构造顺序：基类构造 → 派生类构造
析构顺序：派生类析构 → 基类析构
```

## 实现不能被继承的类
### 方法1：构造函数私有化
```cpp
class Base {
private:
    Base() {}  // 构造函数私有
    
public:
    static Base CreateObj() {
        return Base();  // 类内可以访问私有构造函数
    }
};

// class Derive : public Base {};  // 错误：无法调用基类私有构造函数
```

### 方法2: final关键字
```cpp
class Base final {  // final表示这个类不能被继承
public:
    void func() { cout << "Base::func" << endl; }
};

// class Derive : public Base {};  // 错误：不能继承final类
```

# 继承与友元、静态成员

## 继承与友元关系

**重要规则**：友元关系不能继承
```cpp
class Student;

class Person {
public:
    friend void Display(const Person& p, const Student& s);
protected:
    string _name;
};

class Student : public Person {
protected:
    int _stuNum;
};

void Display(const Person& p, const Student& s) {
    cout << p._name << endl;     // √ Person的友元
    // cout << s._stuNum << endl; // × 不是Student的友元
}

// 解决方案：将Display也声明为Student的友元
class Student : public Person {
public:
    friend void Display(const Person& p, const Student& s);
protected:
    int _stuNum;
};
```

## 继承与静态成员

**重要特性**：基类的静态成员在整个继承体系中只有一份！
```cpp
class Person {
public:
    string _name;
    static int _count;  // 静态成员
};

int Person::_count = 0;  // 静态成员初始化

class Student : public Person {
protected:
    int _stuNum;
};

int main() {
    Person p;
    Student s;
    
    // 非静态成员：每个对象各有一份
    cout << &p._name << endl;  // 地址不同
    cout << &s._name << endl;  // 地址不同
    
    // 静态成员：所有对象共享同一份
    cout << &p._count << endl;  // 地址相同
    cout << &s._count << endl;  // 地址相同
    
    // 通过任何类都可以访问
    cout << Person::_count << endl;
    cout << Student::_count << endl;  // 实际上是同一个
    
    return 0;
}
```

# 多继承与菱形继承问题

## 多重继承模型

### 单继承 vs 多继承
```cpp
// 单继承：一个派生类只有一个直接基类
class A {};
class B : public A {};

// 多继承：一个派生类有多个直接基类
class A {};
class B {};
class C : public A, public B {};  // 多继承
```

### 多继承的内存布局
```cpp
class Base1 { int b1; };
class Base2 { int b2; };
class Derive : public Base1, public Base2 { int d; };

// Derive对象内存布局：
// | Base1::b1 | Base2::b2 | d |
// ↑先继承的        ↑后继承的   ↑派生类特有
```

## 菱形继承（钻石继承）问题
```cpp
class Person {
public:
    string _name;
};

class Student : public Person {
protected:
    int _num;
};

class Teacher : public Person {
protected:
    int _id;
};

class Assistant : public Student, public Teacher {
protected:
    string _majorCourse;
};

int main() {
    Assistant a;
    // a._name = "peter";  // 错误：二义性，不知道访问哪个_name
    
    // 需要显式指定
    a.Student::_name = "张三";
    a.Teacher::_name = "李四";
    
    return 0;
}
```
### 问题分析
1. **数据冗余**：Assistant对象中包含两份Person成员
2. **二义性**：访问_name时无法确定使用哪条继承路径

## 虚继承解决方案

### 虚继承语法
```cpp
class Person {
public:
    string _name;
};

class Student : virtual public Person {  // 虚继承
protected:
    int _num;
};

class Teacher : virtual public Person {  // 虚继承
protected:
    int _id;
};

class Assistant : public Student, public Teacher {
protected:
    string _majorCourse;
};

int main() {
    Assistant a;
    a._name = "peter";  // 正确：无二义性，无数据冗余
    return 0;
}
```
### 虚继承的构造顺序
```cpp
class Person {
public:
    Person(const char* name) : _name(name) {}
    string _name;
};

class Student : virtual public Person {
public:
    Student(const char* name, int num) 
        : Person(name), _num(num) {}  // 初始化Person部分
protected:
    int _num;
};

class Teacher : virtual public Person {
public:
    Teacher(const char* name, int id) 
        : Person(name), _id(id) {}  // 初始化Person部分
protected:
    int _id;
};

class Assistant : public Student, public Teacher {
public:
    // 虚基类Person由最派生类Assistant直接初始化
    Assistant(const char* name1, const char* name2, const char* name3)
        : Person(name3)          // 直接初始化虚基类
        , Student(name1, 1)      // name1传递给Student的Person
        , Teacher(name2, 2) {    // name2传递给Teacher的Person
        // 实际上Person只被初始化一次，使用name3
    }
};

int main() {
    Assistant a("张三", "李四", "王五");
    cout << a._name << endl;  // 输出："王五"
    return 0;
}
```

## 多继承指针偏移问题
```cpp
class Base1 { public: int _b1; };
class Base2 { public: int _b2; };
class Derive : public Base1, public Base2 { public: int _d; };

int main() {
    Derive d;
    Base1* p1 = &d;
    Base2* p2 = &d;
    Derive* p3 = &d;
    
    cout << "p1: " << p1 << endl;
    cout << "p2: " << p2 << endl;   // p2 = p1 + sizeof(Base1)
    cout << "p3: " << p3 << endl;   // p3 = p1
    
    // 答案：p1 == p3 != p2
    return 0;
}
```

## C++标准库中的虚继承示例
```cpp
// C++ IO流库中的菱形继承
template<class CharT, class Traits = std::char_traits<CharT>>
class basic_ostream : virtual public std::basic_ios<CharT, Traits> {};

template<class CharT, class Traits = std::char_traits<CharT>>
class basic_istream : virtual public std::basic_ios<CharT, Traits> {};

template<class CharT, class Traits = std::char_traits<CharT>>
class basic_iostream : public basic_istream<CharT, Traits>,
                       public basic_ostream<CharT, Traits> {};
```

# 继承 vs 组合

## 概念对比

| 特性  | 继承（is-a）            | 组合（has-a）        |
| --- | ------------------- | ---------------- |
| 关系  | 派生类是基类的一种           | 类包含另一个类的对象       |
| 示例  | Student is a Person | Car has a Engine |
| 复用  | 白箱复用（内部可见）          | 黑箱复用（接口可见）       |
| 耦合  | 强耦合                 | 弱耦合              |
| 维护  | 基类改变影响大             | 相对独立             |
| 设计  | 表达层次关系              | 表达组合关系           |

## 继承（is-a关系)
```cpp
// Car和BMW是is-a关系
class Car {
protected:
    string _colour = "白色";
    string _num = "陕ABIT00";
};

class BMW : public Car {  // BMW is a Car
public:
    void Drive() { cout << "好开-操控" << endl; }
};

class Benz : public Car {  // Benz is a Car
public:
    void Drive() { cout << "好坐-舒适" << endl; }
};
```

## 组合（has-a关系）
```cpp
// Car和Tire是has-a关系
class Tire {
protected:
    string _brand = "Michelin";
    size_t _size = 17;
};

class Car {
protected:
    string _colour = "白色";
    string _num = "陕ABIT00";
    Tire _t1, _t2, _t3, _t4;  // 组合：Car has Tires
};
```

## 继承类模板的两种方式
```cpp
// 方式1：继承（is-a）
template<class T>
class stack1 : public vector<T> {
public:
    void push(const T& x) { 
        vector<T>::push_back(x);  // 需要指定作用域
    }
    void pop() { 
        vector<T>::pop_back(); 
    }
};

// 方式2：组合（has-a）
template<class T>
class stack2 {
public:
    void push(const T& x) { 
        _v.push_back(x);  // 直接调用
    }
    void pop() { 
        _v.pop_back(); 
    }
private:
    vector<T> _v;  // 包含vector对象
};
```

##  设计原则
### 1. 优先使用组合的情况
- has-a关系
- 需要复用实现而非接口
- 希望降低类间依赖
- 需要灵活的运行时组合
### 2. 适合使用继承的情况
- 明确的is-a关系
- 需要实现多态（虚函数）
- 需要重用基类接口
- 类层次结构稳定
### 3. 最佳实践建议
1. **Liskov替换原则**：派生类对象应该能够替换基类对象
2. **组合优先原则**：优先考虑组合，除非明确需要继承
3. **避免过度继承**：继承层次不宜过深（建议不超过3层）
4. **接口隔离**：使用纯虚类定义接口

# 现代C++继承特性
## override和final关键字（C++11）
```cpp
class Base {
public:
    virtual void func1() {}
    virtual void func2() const {}
    void func3() {}  // 非虚函数
    virtual void func4() final {}  // 禁止重写
};

class Derived : public Base {
public:
    void func1() override {}     // √ 正确重写
    // void func2() override {}  // × 错误：签名不匹配（缺少const）
    // void func3() override {}  // × 错误：基类func3不是虚函数
    // void func4() override {}  // × 错误：func4被声明为final
};

class Derived2 final : public Base {  // final类，不能被继承
    // ...
};

// class Derived3 : public Derived2 {};  // × 错误：不能继承final类
```

## 继承构造函数（C++11）
```cpp
class Base {
public:
    Base(int x) { cout << "Base(" << x << ")" << endl; }
    Base(int x, int y) { cout << "Base(" << x << "," << y << ")" << endl; }
};

class Derived : public Base {
public:
    using Base::Base;  // 继承基类的所有构造函数
    
    // 可以添加自己的构造函数
    Derived(int x, int y, int z) : Base(x, y), _z(z) {}
    
private:
    int _z = 0;  // 所有继承的构造函数都会用这个默认值
};

int main() {
    Derived d1(10);        // 调用继承的Base(int)
    Derived d2(10, 20);    // 调用继承的Base(int, int)
    Derived d3(10, 20, 30); // 调用Derived自己的构造函数
    return 0;
}
```

## 委托构造函数与继承
```cpp
class Base {
protected:
    int _value;
public:
    Base(int v) : _value(v) {}
};

class Derived : public Base {
    string _name;
public:
    // 委托构造函数
    Derived() : Derived(0, "default") {}  // 委托给另一个构造函数
    
    Derived(int v) : Derived(v, "unnamed") {}  // 委托
    
    Derived(int v, string n) : Base(v), _name(n) {}  // 实际工作的构造函数
};
```

# 完整继承体系设计(现在没学不用看)

## 图形类继承体系
```cpp
// 抽象基类
class Shape {
protected:
    string _name;
    string _color;
    static int _count;  // 统计所有图形对象
    
public:
    Shape(string name, string color) 
        : _name(name), _color(color) {
        _count++;
    }
    
    virtual ~Shape() {
        _count--;
        cout << "Destroying " << _name << endl;
    }
    
    // 纯虚函数：定义接口
    virtual double area() const = 0;
    virtual double perimeter() const = 0;
    virtual void draw() const = 0;
    
    // 非虚函数：通用实现
    void info() const {
        cout << _name << " (" << _color << ")" << endl;
        cout << "Area: " << area() << endl;
        cout << "Perimeter: " << perimeter() << endl;
    }
    
    // 静态成员函数
    static int getCount() { return _count; }
};

int Shape::_count = 0;

// 派生类：圆形
class Circle : public Shape {
private:
    double _radius;
    
public:
    Circle(double r, string color = "red") 
        : Shape("Circle", color), _radius(r) {}
    
    // 重写虚函数
    double area() const override {
        return 3.14159 * _radius * _radius;
    }
    
    double perimeter() const override {
        return 2 * 3.14159 * _radius;
    }
    
    void draw() const override {
        cout << "Drawing a circle with radius " << _radius << endl;
    }
    
    // 新增功能
    double diameter() const {
        return 2 * _radius;
    }
};

// 派生类：矩形
class Rectangle : public Shape {
private:
    double _width, _height;
    
public:
    Rectangle(double w, double h, string color = "blue")
        : Shape("Rectangle", color), _width(w), _height(h) {}
    
    double area() const override {
        return _width * _height;
    }
    
    double perimeter() const override {
        return 2 * (_width + _height);
    }
    
    void draw() const override {
        cout << "Drawing a rectangle " << _width << "x" << _height << endl;
    }
    
    bool isSquare() const {
        return _width == _height;
    }
};

// 进一步派生：正方形
class Square : public Rectangle {
public:
    Square(double side, string color = "green")
        : Rectangle(side, side, color) {
        _name = "Square";  // 修改基类成员
    }
    
    // 正方形特有的方法
    double diagonal() const {
        return sqrt(2) * this->_width;  // 访问基类protected成员
    }
};
```

## 使用示例
```cpp
int main() {
    // 多态使用
    vector<unique_ptr<Shape>> shapes;
    shapes.push_back(make_unique<Circle>(5.0));
    shapes.push_back(make_unique<Rectangle>(4.0, 6.0));
    shapes.push_back(make_unique<Square>(3.0));
    
    for (auto& shape : shapes) {
        shape->info();      // 多态调用
        shape->draw();      // 多态调用
        cout << endl;
    }
    
    // 访问静态成员
    cout << "Total shapes created: " << Shape::getCount() << endl;
    
    // 类型识别和转换
    for (auto& shape : shapes) {
        if (auto circle = dynamic_cast<Circle*>(shape.get())) {
            cout << "This is a circle with diameter: " 
                 << circle->diameter() << endl;
        }
    }
    
    return 0;
}
```

# 常见陷阱与最佳实践总结

## 常见陷阱

### 陷阱1：私有继承的误用
```cpp
class Engine {
public:
    void start() { cout << "Engine started" << endl; }
};

class Car : private Engine {  // 私有继承：Car使用Engine的实现
public:
    void drive() {
        start();  // 只能在Car内部使用
    }
};

int main() {
    Car car;
    car.drive();
    // car.start();  // 错误！start()在类外不可访问
    return 0;
}
```

### 陷阱2：切片导致的多态丢失
```cpp
class Base {
public:
    virtual void func() { cout << "Base::func" << endl; }
};

class Derived : public Base {
public:
    void func() override { cout << "Derived::func" << endl; }
};

void testByValue(Base b) {  // 按值传递，发生切片
    b.func();  // 总是调用Base::func
}

void testByRef(Base& b) {   // 按引用传递，无切片
    b.func();  // 多态调用
}

int main() {
    Derived d;
    testByValue(d);  // 输出：Base::func（切片，多态丢失）
    testByRef(d);    // 输出：Derived::func（多态保持）
    return 0;
}
```
##  最佳实践总结
1. **遵循Liskov替换原则**：派生类对象应该能够替换基类对象
2. **优先使用组合**：除非明确需要is-a关系
3. **将析构函数声明为virtual**：如果类中有虚函数或需要多态
4. **避免过度继承**：继承层次不宜过深
5. **使用final防止进一步继承**：当类设计为最终版本时
6. **避免菱形继承**：使用虚继承或重新设计
7. **合理使用访问控制**：public继承最常用
8. **注意同名隐藏**：避免意外的函数隐藏
## 性能考虑
1. **虚函数调用开销**：需要查虚表，有额外开销
2. **虚继承开销**：有额外的指针开销
3. **多重继承开销**：可能导致this指针调整开销
4. **内存对齐**：继承可能影响内存布局和缓存效率
