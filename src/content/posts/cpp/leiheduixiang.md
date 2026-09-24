---
title: "类和对象"
published: 2026-03-02 14:08:57
description: "class 是定义类的关键字 类体中内容称为类的成员： 类中的变量 → 类的属性或成员变量 类中的函数 → 类的方法或成员函数 成员变量命名惯例：前面或后面加 或 m 开头（非强制） C++ 中 struct 也可以定义类，但推荐使用 c…"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 类的定义
## 类的定义格式
**基本语法：**
```cpp
class ClassName {
    // 类的主体
};  // 注意：分号不能省略
```
**代码示例**
```cpp
#include<iostream>
using namespace std;

class Stack {
public:
    // 成员函数
    void Init(int n = 4) {
        array = (int*)malloc(sizeof(int) * n);
        if(nullptr == array) {
            perror("malloc申请空间失败");
            return;
        }
        capacity = n;
        top = 0;
    }

    void Push(int x) {
        // ...扩容
        array[top++] = x;
    }

    int Top() {
        assert(top > 0);
        return array[top - 1];
    }

    void Destroy() {
        free(array);
        array = nullptr;
        top = capacity = 0;
    }

private:
    // 成员变量
    int* array;
    size_t capacity;
    size_t top;
};  // 分号不能省略

int main() {
    Stack st;
    st.Init();
    st.Push(1);
    st.Push(2);
    cout << st.Top() << endl;
    st.Destroy();
    return 0;
}
```
## 重要概念
- `class` 是定义类的关键字
- 类体中内容称为类的成员：
    - 类中的变量 → 类的属性或成员变量
    - 类中的函数 → 类的方法或成员函数
- 成员变量命名惯例：前面或后面加 `_` 或 `m` 开头（非强制）
- C++ 中 `struct` 也可以定义类，但推荐使用 `class`
- 定义在类内的成员函数默认为 `inline`

## struct 定义类的示例
```cpp
#include<iostream>
using namespace std;

// C++ 升级 struct 为类
// 1. 类里面可以定义函数
// 2. struct 名称就可以代表类型

// C++ 兼容 C 中 struct 的用法
typedef struct ListNodeC {
    struct ListNodeC* next;
    int val;
} LTNode;

// 不再需要 typedef，ListNodeCPP 就可以代表类型
struct ListNodeCPP {
    void Init(int x) {
        next = nullptr;
        val = x;
    }
    
    ListNodeCPP* next;
    int val;
};

int main() {
    return 0;
}
```
## 访问限定符
### 三种访问权限：
- `public`：公有，在类外可以直接访问
- `protected`：保护，在类外不能直接访问
- `private`：私有，在类外不能直接访问

### 访问权限规则：
- 作用域从访问限定符出现位置开始，到下一个访问限定符或类结束
- `class` 默认访问权限为 `private`
- `struct` 默认访问权限为 `public`
- 一般成员变量设为 `private/protected`，对外接口设为 `public`
**代码示例**
```cpp
#include<iostream>
using namespace std;

class Date {
public:
    void Init(int year, int month, int day) {
        _year = year;    // 可以访问
        _month = month;  // 可以访问
        _day = day;      // 可以访问
    }
    
    void Print() {
        cout << _year << "/" << _month << "/" << _day << endl;
    }

private:
    // 为了区分成员变量，一般习惯加特殊标识
    int _year;   // year_ 或 _year
    int _month;
    int _day;
};

int main() {
    Date d;
    d.Init(2024, 3, 31);  // 正确：public 成员
    // d._year = 2024;    // 错误：private 成员不能在类外访问
    return 0;
}
```
## 类域
**类域概念**
- 类定义了一个新的作用域
- 类的所有成员都在类的作用域中
- 在类体外定义成员时，需要使用 `::` 作用域操作符

```cpp
#include<iostream>
using namespace std;

class Stack {
public:
    // 成员函数声明
    void Init(int n = 4);
    
private:
    // 成员变量
    int* array;
    size_t capacity;
    size_t top;
};

// 声明和定义分离，需要指定类域
void Stack::Init(int n) {
    array = (int*)malloc(sizeof(int) * n);
    if(nullptr == array) {
        perror("malloc申请空间失败");
        return;
    }
    capacity = n;
    top = 0;
}

int main() {
    Stack st;
    st.Init();
    return 0;
}
```

# 实例化
## 实例化概念
**定义：** 用类类型在物理内存中创建对象的过程
**重要理解：**
- 类是对对象的抽象描述，是模型（不占空间）
- 实例化时才分配实际物理空间
- 一个类可以实例化出多个对象
**比喻：** 类就像建筑设计图，对象就像实际建造的房子
**代码示例**
```cpp
#include<iostream>
using namespace std;

class Date {
public:
    void Init(int year, int month, int day) {
        _year = year;
        _month = month;
        _day = day;
    }

    void Print() {
        cout << _year << "/" << _month << "/" << _day << endl;
    }

private:
    // 这里只是声明，没有开空间
    int _year;
    int _month;
    int _day;
};

int main() {
    // Date 类实例化出对象 d1 和 d2
    Date d1;  // 实例化对象 d1
    Date d2;  // 实例化对象 d2

    d1.Init(2024, 3, 31);
    d1.Print();

    d2.Init(2024, 7, 5);
    d2.Print();

    return 0;
}
```
## 对象大小
### **对象存储内容分析：**
- 对象中包含成员变量（每个对象独立存储）
- 对象中不包含成员函数（函数存储在代码段）
- 空类对象大小为 1 字节（占位标识）

### **内存对齐规则：**
1. 第一个成员在与结构体偏移量为 0 的地址处
2. 其他成员变量要对齐到对齐数的整数倍地址处
3. 对齐数 = min(编译器默认对齐数, 成员大小)
4. 结构体总大小为最大对齐数的整数倍
5. 嵌套结构体对齐到自己的最大对齐数的整数倍处

# this 指针
### this 指针概念
**工作原理：**
- 编译器在成员函数形参第一个位置添加 `this` 指针
- `this` 指针类型：`ClassName* const this`
- 成员函数中访问成员变量本质通过 `this` 指针

```cpp
#include<iostream>
using namespace std;

class Date {
public:
    // 实际原型：void Init(Date* const this, int year, int month, int day)
    void Init(int year, int month, int day) {
        // this = nullptr;  // 编译错误：this 指针是 const
        
        // this->_year = year;  // 实际访问方式
        _year = year;           // 编译器转换为 this->_year
        this->_month = month;   // 显式使用 this
        this->_day = day;
    }

    void Print() {
        cout << _year << "/" << _month << "/" << _day << endl;
    }

private:
    int _year;
    int _month;
    int _day;
};
```
## 测试题目
### 题目1
```cpp
#include<iostream>
using namespace std;

class A {
public:
    void Print() {
        cout << "A::Print()" << endl;
    }
private:
    int _a;
};

int main() {
    A* p = nullptr;
    p->Print();  // 正常运行
    return 0;
}
答案：正常运行（因为 Print 函数没有访问成员变量)
```
### 题目2
```cpp
#include<iostream>
using namespace std;

class A {
public:
    void Print() {
        cout << "A::Print()" << endl;
        cout << _a << endl;  // 这里访问成员变量
    }
private:
    int _a;
};

int main() {
    A* p = nullptr;
    p->Print();  // 运行崩溃
    return 0;
}
答案：B 运行崩溃（因为访问量空指针的成员变量）
```
### 题目3
**this 指针存在内存哪个区域？
**答案：**栈（this 指针是函数调用的参数）

# C++和C语言实现Stack对比
## c语言实现Stack
```cpp
#include<stdio.h>
#include<stdlib.h>
#include<stdbool.h>
#include<assert.h>

typedef int STDataType;
typedef struct Stack {
    STDataType* a;
    int top;
    int capacity;
} ST;

void STInit(ST* ps) {
    assert(ps);
    ps->a = NULL;
    ps->top = 0;
    ps->capacity = 0;
}

void STDestroy(ST* ps) {
    assert(ps);
    free(ps->a);
    ps->a = NULL;
    ps->top = ps->capacity = 0;
}

void STPush(ST* ps, STDataType x) {
    assert(ps);
    
    // 扩容
    if(ps->top == ps->capacity) {
        int newcapacity = ps->capacity == 0 ? 4 : ps->capacity * 2;
        STDataType* tmp = (STDataType*)realloc(ps->a, newcapacity * sizeof(STDataType));
        if(tmp == NULL) {
            perror("realloc fail");
            return;
        }
        ps->a = tmp;
        ps->capacity = newcapacity;
    }
    
    ps->a[ps->top] = x;
    ps->top++;
}

bool STEmpty(ST* ps) {
    assert(ps);
    return ps->top == 0;
}

void STPop(ST* ps) {
    assert(ps);
    assert(!STEmpty(ps));
    ps->top--;
}

STDataType STTop(ST* ps) {
    assert(ps);
    assert(!STEmpty(ps));
    return ps->a[ps->top - 1];
}

int STSize(ST* ps) {
    assert(ps);
    return ps->top;
}

int main() {
    ST s;
    STInit(&s);
    
    STPush(&s, 1);
    STPush(&s, 2);
    STPush(&s, 3);
    STPush(&s, 4);
    
    while(!STEmpty(&s)) {
        printf("%d\n", STTop(&s));
        STPop(&s);
    }
    
    STDestroy(&s);
    return 0;
}
```
## c++实现Stack
```cpp
#include<iostream>
#include<cassert>
using namespace std;

typedef int STDataType;
class Stack {
public:
    // 成员函数
    void Init(int n = 4) {
        _a = (STDataType*)malloc(sizeof(STDataType) * n);
        if(nullptr == _a) {
            perror("malloc申请空间失败");
            return;
        }
        _capacity = n;
        _top = 0;
    }

    void Push(STDataType x) {
        if(_top == _capacity) {
            int newcapacity = _capacity * 2;
            STDataType* tmp = (STDataType*)realloc(_a, newcapacity * sizeof(STDataType));
            if(tmp == NULL) {
                perror("realloc fail");
                return;
            }
            _a = tmp;
            _capacity = newcapacity;
        }
        _a[_top++] = x;
    }

    void Pop() {
        assert(_top > 0);
        --_top;
    }

    bool Empty() {
        return _top == 0;
    }

    int Top() {
        assert(_top > 0);
        return _a[_top - 1];
    }

    void Destroy() {
        free(_a);
        _a = nullptr;
        _top = _capacity = 0;
    }

private:
    // 成员变量
    STDataType* _a;
    size_t _capacity;
    size_t _top;
};

int main() {
    Stack s;
    s.Init();
    s.Push(1);
    s.Push(2);
    s.Push(3);
    s.Push(4);
    
    while(!s.Empty()) {
        printf("%d\n", s.Top());
        s.Pop();
    }
    
    s.Destroy();
    return 0;
}
```

## 对比总结
| 特性       | C 语言实现     | C++ 实现     |
| -------- | ---------- | ---------- |
| **封装性**  | 数据和函数分离    | 数据和函数封装在类中 |
| **访问控制** | 无访问限制      | 通过访问限定符控制  |
| **对象操作** | 需要显式传递对象指针 | 隐含 this 指针 |
| **类型使用** | 需要 typedef | 类名即类型      |
| **初始化**  | 手动初始化      | 可使用缺省参数    |
**封装的优势：**
- 更严格的数据访问控制
- 减少错误的数据修改
- 代码组织更清晰
- 符合面向对象设计原则

## 类的默认成员函数
## 概念
- **默认成员函数**：用户没有显式实现时，编译器会自动生成的成员函数
- 一个类不写的情况下，编译器会默认生成**6个默认成员函数**
- **最重要的4个**：构造函数、析构函数、拷贝构造函数、赋值运算符重载
- **不重要的2个**：取地址重载、const取地址重载
## 学习要点
1. 不写时，编译器默认生成的函数行为是什么，是否满足需求
2. 默认生成的函数不满足需求时，如何自己实现

# 构造函数
## 作用与特点
- **主要任务**：初始化对象（替代Init函数）
- **特点**：
    1. 函数名与类名相同
    2. 无返回值（不写void）
    3. 对象实例化时自动调用
    4. 可以重载
    5. 用户显式定义后，编译器不再生成默认构造函数
```cpp
class Date {
public:
    // 1. 无参构造函数
    Date() {
        _year = 1; _month = 1; _day = 1;
    }
    
    // 2. 带参构造函数
    Date(int year, int month, int day) {
        _year = year; _month = month; _day = day;
    }
    
    // 3. 全缺省构造函数
    Date(int year = 1, int month = 1, int day = 1) {
        _year = year; _month = month; _day = day;
    }
};
```
## 注意事项
1. **默认构造函数**：不传实参就可以调用的构造
    - 无参构造函数、全缺省构造函数、编译器默认生成的构造函数
    - 三者有且只能有一个存在
2. **编译器生成的构造函数行为**：
    - **内置类型**：不处理（值随机）
    - **自定义类型**：调用该成员的默认构造函数

```cpp
class Stack {
public:
    Stack(int n = 4) {
        _a = (int*)malloc(sizeof(int) * n);
        _capacity = n; _top = 0;
    }
private:
    int* _a;
    size_t _capacity;
    size_t _top;
};

class MyQueue {
    // 编译器自动调用Stack的构造函数完成初始化
private:
    Stack pushst;    // 调用Stack默认构造
    Stack popst;     // 调用Stack默认构造
};
```

## 初始化列表
```cpp
class ClassName {
public:
    ClassName() : member1(value1), member2(value2), ... {
        // 构造函数体
    }
private:
    Type member1;
    Type member2;
};
```
### 初始化列表特点
- 以冒号开始，逗号分隔的成员变量列表
- 每个成员变量只能出现一次
- 可以认为是成员变量定义初始化的地方
### 必须使用初始化列表的三种情况
1. **引用成员变量**
2. **const成员变量**
3. **没有默认构造的类类型变量**
```cpp
class Date {
public:
    Date(int& x, int year = 1, int month = 1, int day = 1)
        : _year(year)        // 普通成员
        , _month(month)      // 普通成员  
        , _day(day)          // 普通成员
        , _t(12)            // 没有默认构造的类类型
        , _ref(x)           // 引用成员
        , _n(1)             // const成员
    {
        // 构造函数体
    }
    
private:
    int _year;
    int _month; 
    int _day;
    Time _t;        // 没有默认构造，必须在初始化列表初始化
    int& _ref;      // 引用成员，必须在初始化列表初始化
    const int _n;   // const成员，必须在初始化列表初始化
};
```
### C++11成员变量缺省值
```cpp
class Date {
public:
    Date() : _month(2) {  // 只初始化了_month
        // _year使用缺省值1，_day使用缺省值？
    }
    
private:
    int _year = 1;      // 声明位置给缺省值
    int _month = 1;     // 声明位置给缺省值
    int _day;           // 没有缺省值
    
    Time _t = 1;        // 自定义类型也可以给缺省值
    const int _n = 1;   // const成员给缺省值
};
```
### 初始化规则总结

| 情况                   | 初始化方式       |
| -------------------- | ----------- |
| 显示在初始化列表初始化          | 按初始化列表的值初始化 |
| 未显示初始化，声明有缺省值        | 按缺省值初始化     |
| 未显示初始化，声明无缺省值（内置类型）  | 可能随机值，看编译器  |
| 未显示初始化，声明无缺省值（自定义类型） | 调用默认构造函数    |
### 初始化按声明顺序，与初始化列表顺序无关
```cpp
class A {
public:
    A(int a) : _a2(_a1), _a1(a) {}  // 危险：按声明顺序初始化
    
    void Print() {
        cout << _a1 << " " << _a2 << endl;
    }
    
private:
    int _a2 = 2;  // 先声明
    int _a1 = 2;  // 后声明
};

// 输出结果：1 随机值（_a2用未初始化的_a1初始化）
```

# 析构函数
## 作用与特点
- **主要任务**：对象销毁时自动调用，完成资源清理
- **特点**：
    1. 函数名：~类名
    2. 无参数无返回值
    3. 一个类只能有一个析构函数
    4. 对象生命周期结束时自动调用
    5. 后定义的对象先析构
## 编译器生成的析构函数行为
- **内置类型**：不处理
- **自定义类型**：调用该成员的析构函数
```cpp
class Stack {
public:
    Stack(int n = 4) {
        _a = (int*)malloc(sizeof(int) * n);
        _capacity = n; _top = 0;
    }
    
    ~Stack() {
        cout << "~Stack()" << endl;
        free(_a);
        _a = nullptr;
        _top = _capacity = 0;
    }
private:
    int* _a;
    size_t _capacity;
    size_t _top;
};

class MyQueue {
    // 编译器自动生成析构函数，调用Stack的析构
private:
    Stack pushst;
    Stack popst;
};
```
## 使用建议
- **不需要写析构**：没有资源申请（如Date）
- **需要写析构**：有资源申请（如Stack、动态数组等）

# 拷贝构造函数
## 概念与特点
- **定义**：第一个参数是自身类类型引用的构造函数
- **特点**：
    1. 是构造函数的重载形式
    2. 第一个参数必须是引用，否则会无限递归
    3. 自定义类型传值传参和传值返回都会调用拷贝构造
    4. 未显式定义时，编译器会自动生成
## 编译器生成的拷贝构造函数行为
- **内置类型**：值拷贝/浅拷贝
- **自定义类型**：调用该成员的拷贝构造函数
```cpp
- class Date {
public:
    // 正确的拷贝构造函数
    Date(const Date& d) {
        _year = d._year;
        _month = d._month;
        _day = d._day;
    }
    
    // 错误的拷贝构造函数（会导致无限递归）
    // Date(Date d) { ... }  // 错误！
};
```
## 深浅拷贝问题
```cpp
class Stack {
public:
    Stack(int n = 4) {
        _a = (int*)malloc(sizeof(int) * n);
        _capacity = n; _top = 0;
    }
    
    // 深拷贝：需要自己实现
    Stack(const Stack& st) {
        _a = (int*)malloc(sizeof(int) * st._capacity);
        memcpy(_a, st._a, sizeof(int) * st._top);
        _top = st._top;
        _capacity = st._capacity;
    }
    
    ~Stack() {
        free(_a);
        _a = nullptr;
        _top = _capacity = 0;
    }
private:
    int* _a;
    size_t _capacity;
    size_t _top;
};
```
### 使用技巧
- **需要显示实现拷贝构造**：类中显示实现了析构函数并释放资源
- **不需要显示实现**：编译器生成的拷贝构造就能满足需求

# 赋值运算符重载

## 运算符重载基本规则
### 特点
- 函数名：`operator运算符`
- 成员函数：参数比运算对象少一个（第一个参数是this）
- 不能创建新的运算符
- **不能重载的运算符**：`.*` `::` `sizeof` `?:` `.`
```cpp
class Date {
public:
    // 成员函数重载==
    bool operator==(const Date& d) {
        return _year == d._year 
            && _month == d._month 
            && _day == d._day;
    }
    
    // 前置++
    Date& operator++() {
        // ... 实现
        return *this;
    }
    
    // 后置++（用int参数区分）
    Date operator++(int) {
        Date tmp = *this;
        // ... 实现
        return tmp;
    }
};
```
### 输入输出流重载
```cpp
// 全局函数重载<<和>>
ostream& operator<<(ostream& out, const Date& d) {
    out << d._year << "-" << d._month << "-" << d._day;
    return out;
}

istream& operator>>(istream& in, Date& d) {
    in >> d._year >> d._month >> d._day;
    return in;
}
```
## 赋值运算符重载
### 特点
1. 必须重载为成员函数
2. 建议返回引用，支持连续赋值
3. 参数建议为const引用
4. 需要检查自赋值情况
```cpp
class Date {
public:
    Date& operator=(const Date& d) {
        // 检查自赋值
        if (this != &d) {
            _year = d._year;
            _month = d._month;
            _day = d._day;
        }
        return *this;  // 支持连续赋值
    }
};
```
### 编译器生成的赋值运算符重载行为
- **内置类型**：值拷贝/浅拷贝
- **自定义类型**：调用该成员的赋值运算符重载
## 重要区别
```cpp
Date d1(2024, 7, 5);
Date d2(d1);        // 拷贝构造：创建新对象
Date d3 = d1;       // 拷贝构造：创建新对象
Date d4;
d4 = d1;           // 赋值重载：两个已存在对象
```

# 默认成员函数使用场景
### 默认成员函数使用场景

| 类类型      | 构造函数 | 析构函数 | 拷贝构造    | 赋值重载    |
| -------- | ---- | ---- | ------- | ------- |
| Date类    | 可选   | 不需要  | 不需要     | 不需要     |
| Stack类   | 需要   | 需要   | 需要(深拷贝) | 需要(深拷贝) |
| MyQueue类 | 不需要  | 不需要  | 不需要     | 不需要     |

### 重要原则
1. **需要自己实现**：类中有资源申请（动态内存、文件句柄等）
2. **可用编译器生成**：类中全是内置类型或自定义类型成员能正确处理
3. **三/五法则**：如果需要自定义析构函数，通常也需要自定义拷贝构造和赋值重载

# const 成员函数
## 定义
- 将const修饰的成员函数称之为const成员函数
- const修饰符放在成员函数参数列表的后面
```cpp
class ClassName {
public:
    returnType functionName(parameters) const {
        // 函数体
    }
};
```
## 作用
- const实际修饰该成员函数隐含的this指针
- 将 `Date* const this` 变为 `const Date* const this`
- 表明在该成员函数中不能对类的任何成员进行修改
## 权限规则
- const对象 → 只能调用const成员函数
- 非const对象 → 可以调用const成员函数（权限缩小）

# 取地址运算符重载
**分类：**
1. 普通取地址运算符重载
2. const取地址运算符重载
```cpp
class Date {
public:
    // 普通对象的取地址重载
    Date* operator&() {
        return this;  // 正常返回地址
        // return nullptr;  // 特殊场景：不想让别人取到地址
    }
    
    // const对象的取地址重载  
    const Date* operator&() const {
        return this;  // 正常返回地址
        // return nullptr;  // 特殊场景：不想让别人取到地址
    }
    
private:
    int _year;   // 年
    int _month;  // 月  
    int _day;    // 日
};
```
## 特点
- 一般情况下，编译器会自动生成这两个函数，够我们使用
- 不需要显示实现，除非有特殊需求
- 特殊场景：不想让别人取到当前类对象的地址，可以返回nullptr或其他地址
## 使用场景
- 默认生成的取地址运算符通常就够用了
- 只有在需要特殊控制地址访问时才需要重载

# 类型转换
## 内置类型转换类型
```cpp
class A {
public:
    // explicit A(int a1)  // 加explicit禁止隐式转换
    A(int a1) : _a1(a1) {}
    
    A(int a1, int a2) : _a1(a1), _a2(a2) {}
    
    void Print() {
        cout << _a1 << " " << _a2 << endl;
    }
    
private:
    int _a1 = 1;
    int _a2 = 2;
};

// 使用
A aa1 = 1;           // 隐式类型转换：构造+拷贝构造 → 优化为直接构造
const A& aa2 = 1;    // 临时对象常引用
A aa3 = {2, 2};      // C++11 多参数转换
```
## 类类型转其他类型
```cpp
class B {
public:
    B(const A& a) : _b(a.Get()) {}  // A转B
    
private:
    int _b = 0;
};

// 使用  
B b = aa3;           // A对象隐式转换为B
const B& rb = aa3;   // 临时对象常引用
```

# static成员
## 静态成员变量
```cpp
class A {
public:
    A() { ++_scount; }
    A(const A& t) { ++_scount; }
    ~A() { --_scount; }
    
    static int GetACount() { return _scount; }
    
private:
    static int _scount;  // 类内声明
};

int A::_scount = 0;     // 类外初始化
```
## 静态成员特点
- 属于类，不属于具体对象
- 存放在静态区
- 必须在类外初始化
- 不能用初始化列表初始化

## 静态成员函数
```cpp
class A {
public:
    static int GetCount() { 
        // 不能访问非静态成员，没有this指针
        return _scount;  // 可以访问静态成员
    }
    
    void NormalFunc() {
        // 可以访问静态和非静态成员
        cout << _scount << endl;
    }
    
private:
    static int _scount;
    int _normalMember;
};
```
### 访问方式
```cpp
A::GetCount();    // 通过类名访问
a1.GetCount();    // 通过对象访问（不推荐）
```
## 应用例题
#### 1+2+3+...+n
```cpp
class Sum {
public:
    Sum() {
        _ret += _i;
        ++_i;
    }
    static int GetRet() { return _ret; }
    
private:
    static int _i;
    static int _ret;
};

int Sum::_i = 1;
int Sum::_ret = 0;

class Solution {
public:
    int Sum_Solution(int n) {
        Sum arr[n];  // 变长数组，创建n个Sum对象
        return Sum::GetRet();
    }
};
```
#### 计算对象个数
```cpp
// 统计创建的对象数量
class A {
public:
    A() { ++_scount; }
    A(const A& t) { ++_scount; }
    ~A() { --_scount; }
    static int GetACount() { return _scount; }
    
private:
    static int _scount;
};

int A::_scount = 0;
```

# 友元
## 友元函数
```cpp
class A;  // 前置声明

class B {
public:
    void func1(const A& aa);
    void func2(const A& aa);
    
private:
    int _b1 = 3;
    int _b2 = 4;
};

class A {
    friend void B::func1(const A& aa);  // 友元函数声明
    friend class B;                     // 友元类声明
    
private:
    int _a1 = 1;
    int _a2 = 2;
};

void B::func1(const A& aa) {
    cout << aa._a1 << endl;  // 可以访问A的私有成员
    cout << _b1 << endl;
}
```
## 友元类
```cpp
class A {
    friend class B;  // B是A的友元类
    
private:
    int _a1 = 1;
    int _a2 = 2;
};

class B {
public:
    void func(const A& aa) {
        cout << aa._a1 << endl;  // B的所有成员函数都是A的友元
        cout << aa._a2 << endl;
    }
};
```
## 友元特点
- 单向性：A是B的友元 ≠ B是A的友元
- 不传递：A是B友元，B是C友元 ≠ A是C友元
- 破坏封装，慎用！
# 内部类
## 基本概念
```cpp
class A {
private:
    static int _k;
    int _h = 1;
    
public:
    class B {  // B是A的内部类
    public:
        void foo(const A& a) {
            cout << _k << endl;    // 可以访问外部类静态成员
            cout << a._h << endl;  // 可以访问外部类私有成员
        }
        int _b1;
    };
};

int A::_k = 1;

// 使用
A::B b;           // 通过外部类名访问
cout << sizeof(A) << endl;  // 输出4，不包含内部类大小
```
## 内部类特点
- 是一个独立的类
- 受外部类类域和访问限定符限制
- 默认是外部类的友元
- 外部类对象不包含内部类
## 应用实例
```cpp
class Solution {
    // 内部类
    class Sum {
    public:
        Sum() {
            _ret += _i;
            ++_i;
        }
    };
    
    static int _i;
    static int _ret;
    
public:
    int Sum_Solution(int n) {
        Sum arr[n];  // 使用内部类
        return _ret;
    }
};

int Solution::_i = 1;
int Solution::_ret = 0;
```
# 匿名对象
## 基本使用
```cpp
class A {
public:
    A(int a = 0) : _a(a) {
        cout << "A(int a)" << endl;
    }
    ~A() {
        cout << "~A()" << endl;
    }
    
private:
    int _a;
};

class Solution {
public:
    int Sum_Solution(int n) {
        return n;
    }
};

// 使用
A aa1;           // 有名对象
// A aa1();      // 错误：函数声明

A();            // 匿名对象，生命周期只有这一行
A(1);           // 带参匿名对象
A aa2(2);       // 有名对象

Solution().Sum_Solution(10);  // 匿名对象的典型用法
```
## 匿名对象特点
- 生命周期只有当前一行
- 适用于临时使用场景
- 语法：`ClassName(parameters)`
