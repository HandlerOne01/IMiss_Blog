---
title: "string"
published: 2025-11-23 19:37:28
description: "多个对象共享同一资源 析构时重复释放同一内存 一个对象修改影响其他对象"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# string类基础
```cpp
#include <string>
using namespace std;

// 基本使用
string s1;              // 空字符串
string s2 = "hello";    // 直接初始化
string s3(s2);          // 拷贝构造
```

# auto和范围for
```cpp
#include <iostream>
using namespace std;

int func1() { return 10; }

// auto不能作为函数参数
// void func2(auto a) {}  // 错误！

auto func3() { return 3; }  // 可以做返回值

int main() {
    int a = 10;
    auto b = a;                    // int
    auto c = 'a';                  // char
    auto d = func1();              // int
    
    // auto e;                     // 错误！必须初始化
    
    int x = 10;
    auto y = &x;                   // int*
    auto* z = &x;                  // int*
    auto& m = x;                   // int&
    
    // auto aa = 1, bb = 2;        // 正确，相同类型
    // auto cc = 3, dd = 4.0;      // 错误！不同类型
    
    // auto array[] = {4,5,6};     // 错误！不能声明数组
    
    // map遍历的auto应用
    map<string, string> dict = {{"apple","苹果"}, {"orange","橙子"}};
    auto it = dict.begin();  // 替代冗长的迭代器声明
    while (it != dict.end()) {
        cout << it->first << ":" << it->second << endl;
        ++it;
    }
    
    return 0;
}
```
 范围for循环
```cpp
 #include <iostream>
#include <string>
using namespace std;

int main() {
    int array[] = {1, 2, 3, 4, 5};
    
    // C++98遍历方式
    for (int i = 0; i < sizeof(array)/sizeof(array[0]); ++i) {
        array[i] *= 2;
    }
    
    // C++11范围for
    for (auto& e : array) {    // 引用，可以修改元素
        e *= 2;
    }
    
    for (auto e : array) {     // 值拷贝，不修改原数组
        cout << e << " ";
    }
    cout << endl;
    
    string str("hello world");
    for (auto ch : str) {
        cout << ch << " ";
    }
    cout << endl;
    
    return 0;
}
```
# 访问与遍历
```cpp
void TestAccess() {
    string s = "hello";
    
    // 1. operator[]
    for (size_t i = 0; i < s.size(); ++i) {
        cout << s[i] << " ";  // h e l l o
    }
    cout << endl;
    
    // 2. 迭代器
    for (auto it = s.begin(); it != s.end(); ++it) {
        cout << *it << " ";
    }
    cout << endl;
    
    // 3. 范围for
    for (auto ch : s) {
        cout << ch << " ";
    }
    cout << endl;
}
```

# VS和g++下string结构差异
## VS下的string结构（28字节）
```cpp
// 联合体设计，小字符串优化
union _Bxty {
    char _Buf[16];    // 16字节缓冲区，存储小字符串
    char* _Ptr;       // 指向堆空间的指针
} _Bx;

size_t _Mysize;       // 字符串长度
size_t _Myres;        // 总容量
```

```cpp
struct _Rep_base {
    size_type _M_length;     // 字符串长度
    size_type _M_capacity;   // 总容量  
    _Atomic_word _M_refcount;// 引用计数（写时拷贝）
};
```

# string浅拷贝存在的问题

```cpp
class String {
public:
    String(const char* str = "") {
        _str = new char[strlen(str) + 1];
        strcpy(_str, str);
    }
    
    ~String() {
        if (_str) {
            delete[] _str;
            _str = nullptr;
        }
    }
    
private:
    char* _str;
};

void Test() {
    String s1("hello");
    String s2(s1);  // 浅拷贝！s1和s2指向同一块内存
    // 析构时同一块内存会被delete两次，程序崩溃
}
```
**浅拷贝问题：**
- 多个对象共享同一资源
- 析构时重复释放同一内存
- 一个对象修改影响其他对象

# 使用深拷贝解决方案
## 传统版string
```cpp
class String {
public:
    String(const char* str = "") {
        if (nullptr == str) {
            assert(false);
            return;
        }
        _str = new char[strlen(str) + 1];
        strcpy(_str, str);
    }
    
    // 拷贝构造 - 深拷贝
    String(const String& s) 
        : _str(new char[strlen(s._str) + 1]) {
        strcpy(_str, s._str);
    }
    
    // 赋值运算符重载
    String& operator=(const String& s) {
        if (this != &s) {  // 防止自赋值
            char* temp = new char[strlen(s._str) + 1];
            strcpy(temp, s._str);
            delete[] _str;    // 释放原有资源
            _str = temp;
        }
        return *this;
    }
    
    ~String() {
        if (_str) {
            delete[] _str;
            _str = nullptr;
        }
    }
    
private:
    char* _str;
};
```
## 现代版
```cpp
class String {
public:
    String(const char* str = "") {
        if (nullptr == str) str = "";
        _str = new char[strlen(str) + 1];
        strcpy(_str, str);
    }
    
    // 拷贝构造
    String(const String& s) : _str(nullptr) {
        String temp(s._str);  // 用s的字符串构造临时对象
        swap(_str, temp._str); // 交换资源
    }
    
    // 赋值运算符重载 - 现代写法
    String& operator=(String s) {  // 传值调用，自动调用拷贝构造
        swap(_str, s._str);       // 交换资源
        return *this;             // s析构时自动释放旧资源
    }
    
    /* 另一种现代写法
    String& operator=(const String& s) {
        if (this != &s) {
            String temp(s);      // 拷贝构造临时对象
            swap(_str, temp._str); // 交换资源
        }
        return *this;
    }
    */
    
    ~String() {
        if (_str) {
            delete[] _str;
            _str = nullptr;
        }
    }
    
private:
    char* _str;
};
```
**现代写法的优势：**
- 代码简洁，复用拷贝构造
- 天然避免自赋值
- 异常安全

# 写时拷贝（Copy-On-Write）
- **引用计数**记录资源使用者个数
- **读取时**共享同一资源
- **修改时**才进行实际拷贝
- 优点：减少不必要的拷贝，提高性能
- 缺点：读取时的线程安全问题

# string类基本模拟实现
## string.h(头文件部分)
```cpp
#define _CRT_SECURE_NO_WARNINGS 1
#pragma once

#include <iostream>
#include <cstring>
#include <cassert>
using namespace std;

namespace bit
{
    class string
    {
    public:
        // 迭代器类型定义
        typedef char* iterator;
        typedef const char* const_iterator;

        // 静态常量定义
        static const size_t npos;

        // 构造函数和析构函数
        string(const char* str = "");
        string(const string& s);
        string& operator=(string tmp);
        ~string();

        // 迭代器相关函数
        iterator begin();
        iterator end();
        const_iterator begin() const;
        const_iterator end() const;

        // 容量相关函数
        size_t size() const;
        size_t capacity() const;
        void clear();
        void reserve(size_t n);

        // 元素访问函数
        char& operator[](size_t pos);
        const char& operator[](size_t pos) const;
        const char* c_str() const;

        // 修改操作函数
        void push_back(char ch);
        string& operator+=(char ch);
        void append(const char* str);
        string& operator+=(const char* str);
        void insert(size_t pos, char ch);
        void insert(size_t pos, const char* s);
        void erase(size_t pos, size_t len = npos);

        // 查找操作函数
        size_t find(char ch, size_t pos = 0);
        size_t find(const char* str, size_t pos = 0);
        string substr(size_t pos = 0, size_t len = npos);

    private:
        void swap(string& s);

    private:
        char* _str = nullptr;     // 字符串数据指针
        size_t _size = 0;         // 字符串长度
        size_t _capacity = 0;     // 字符串容量
    };

    // 全局比较运算符重载
    bool operator<(const string& s1, const string& s2);
    bool operator<=(const string& s1, const string& s2);
    bool operator>(const string& s1, const string& s2);
    bool operator>=(const string& s1, const string& s2);
    bool operator==(const string& s1, const string& s2);
    bool operator!=(const string& s1, const string& s2);

    // 流操作符重载
    ostream& operator<<(ostream& out, const string& s);
    istream& operator>>(istream& in, string& s);
}
```

## string.cpp(实现文件)
### 静态成员函数初始化
```cpp
const size_t bit::string::npos = -1;
```

### 默认构造函数
```cpp
/* 默认构造函数 - 创建空字符串 */
bit::string::string(const char* str)
{
    _size = strlen(str);
    _capacity = _size;
    _str = new char[_capacity + 1];  // 多分配1个空间存放'\0'
    strcpy(_str, str);
}
```

### 拷贝构造函数
```cpp
/* 拷贝构造函数 - 现代写法 */
bit::string::string(const string& s)
{
    string tmp(s._str);  // 用s的C字符串构造临时对象
    swap(tmp);           // 交换当前对象和临时对象的内容
}
```

### 赋值运算符构造函数
```cpp
/* 赋值运算符重载 - 现代写法 */
bit::string& bit::string::operator=(string tmp)
{
    swap(tmp);  // 交换当前对象和临时对象的内容
    return *this;
}
```

### 析构函数
```cpp
/* 析构函数 */
bit::string::~string()
{
    if (_str)
    {
        delete[] _str;
        _str = nullptr;
        _size = _capacity = 0;
    }
}
```

### 迭代器相关函数
```cpp
/* 获取起始迭代器 */
bit::string::iterator bit::string::begin() 
{ 
    return _str; 
}

/* 获取结束迭代器 */
bit::string::iterator bit::string::end() 
{ 
    return _str + _size; 
}

/* 获取常量起始迭代器 */
bit::string::const_iterator bit::string::begin() const 
{ 
    return _str; 
}

/* 获取常量结束迭代器 */
bit::string::const_iterator bit::string::end() const 
{ 
    return _str + _size; 
}
```

### 容量相关函数
```cpp
/* 获取字符串长度 */
size_t bit::string::size() const 
{ 
    return _size; 
}

/* 获取容量 */
size_t bit::string::capacity() const 
{ 
    return _capacity; 
}

/* 清空字符串内容 */
void bit::string::clear()
{
    _str[0] = '\0';
    _size = 0;
}

/* 扩容函数 */
void bit::string::reserve(size_t n)
{
    if (n > _capacity)
    {
        char* tmp = new char[n + 1];  // 分配新空间
        strcpy(tmp, _str);            // 拷贝原内容
        delete[] _str;                // 释放原空间
        _str = tmp;                   // 指向新空间
        _capacity = n;                // 更新容量
    }
}
```

### 元素访问函数
```cpp
/* 下标运算符重载 - 可修改版本 */
char& bit::string::operator[](size_t pos)
{
    assert(pos < _size);  // 检查下标合法性
    return _str[pos];
}

/* 下标运算符重载 - 常量版本 */
const char& bit::string::operator[](size_t pos) const
{
    assert(pos < _size);  // 检查下标合法性
    return _str[pos];
}

/* 获取C风格字符串 */
const char* bit::string::c_str() const 
{ 
    return _str; 
}
```

### 修改操作函数
```cpp
/* 在末尾添加字符 */
void bit::string::push_back(char ch)
{
    if (_size == _capacity)  // 需要扩容
    {
        reserve(_capacity == 0 ? 4 : _capacity * 2);  // 初始容量为4，后续2倍扩容
    }

    _str[_size] = ch;    // 添加字符
    ++_size;             // 更新大小
    _str[_size] = '\0';  // 添加结束符
}

/* 追加字符运算符重载 */
bit::string& bit::string::operator+=(char ch)
{
    push_back(ch);
    return *this;
}

/* 追加C字符串 */
void bit::string::append(const char* str)
{
    size_t len = strlen(str);
    if (_size + len > _capacity)  // 需要扩容
    {
        // 扩容策略：大于2倍容量时按需扩容，否则2倍扩容
        reserve(_size + len > 2 * _capacity ? _size + len : 2 * _capacity);
    }

    strcpy(_str + _size, str);  // 拷贝字符串到末尾
    _size += len;               // 更新大小
}

/* 追加C字符串运算符重载 */
bit::string& bit::string::operator+=(const char* str)
{
    append(str);
    return *this;
}

/* 在指定位置插入字符 */
void bit::string::insert(size_t pos, char ch)
{
    assert(pos <= _size);  // 检查位置合法性

    if (_size == _capacity)  // 需要扩容
    {
        reserve(_capacity == 0 ? 4 : _capacity * 2);
    }

    // 向后移动数据，为插入腾出空间
    size_t end = _size + 1;
    while (end > pos)
    {
        _str[end] = _str[end - 1];
        --end;
    }

    _str[pos] = ch;  // 插入字符
    ++_size;         // 更新大小
}

/* 在指定位置插入C字符串 */
void bit::string::insert(size_t pos, const char* s)
{
    assert(pos <= _size);  // 检查位置合法性

    size_t len = strlen(s);
    if (_size + len > _capacity)  // 需要扩容
    {
        // 扩容策略：大于2倍容量时按需扩容，否则2倍扩容
        reserve(_size + len > 2 * _capacity ? _size + len : 2 * _capacity);
    }

    // 向后移动数据
    size_t end = _size + len;
    while (end > pos + len - 1)
    {
        _str[end] = _str[end - len];
        --end;
    }

    // 插入新字符串
    for (size_t i = 0; i < len; i++)
    {
        _str[pos + i] = s[i];
    }

    _size += len;  // 更新大小
}

/* 删除指定位置开始的len个字符 */
void bit::string::erase(size_t pos, size_t len)
{
    assert(pos < _size);  // 检查位置合法性

    if (len >= _size - pos)  // 删除到末尾
    {
        _str[pos] = '\0';
        _size = pos;
    }
    else  // 删除中间部分
    {
        // 向前移动数据，覆盖要删除的部分
        for (size_t i = pos + len; i <= _size; i++)
        {
            _str[i - len] = _str[i];
        }
        _size -= len;  // 更新大小
    }
}
```

### 查找操作函数
```cpp
/* 查找字符，返回位置 */
size_t bit::string::find(char ch, size_t pos)
{
    assert(pos < _size);  // 检查位置合法性

    for (size_t i = pos; i < _size; i++)
    {
        if (_str[i] == ch)
        {
            return i;  // 找到返回位置
        }
    }

    return npos;  // 未找到返回npos
}

/* 查找子字符串，返回起始位置 */
size_t bit::string::find(const char* str, size_t pos)
{
    assert(pos < _size);  // 检查位置合法性

    const char* ptr = strstr(_str + pos, str);  // 使用strstr函数查找
    if (ptr == nullptr)
    {
        return npos;  // 未找到返回npos
    }
    else
    {
        return ptr - _str;  // 找到返回位置
    }
}

/* 获取子字符串 */
bit::string bit::string::substr(size_t pos, size_t len)
{
    assert(pos < _size);  // 检查位置合法性

    // 如果len大于剩余长度，调整len
    if (len > _size - pos)
    {
        len = _size - pos;
    }

    string sub;           // 创建结果字符串
    sub.reserve(len);     // 预分配空间
    for (size_t i = 0; i < len; i++)
    {
        sub += _str[pos + i];  // 逐个字符添加
    }

    return sub;  // 返回子字符串
}
```

### 私有辅助函数
```cpp
/* 交换两个字符串对象的内容 */
void bit::string::swap(string& s)
{
    std::swap(_str, s._str);
    std::swap(_size, s._size);
    std::swap(_capacity, s._capacity);
}
```

### 全局比较运算符重载
```cpp
/* 小于比较 */
bool bit::operator<(const string& s1, const string& s2)
{
    return strcmp(s1.c_str(), s2.c_str()) < 0;
}

/* 小于等于比较 */
bool bit::operator<=(const string& s1, const string& s2)
{
    return s1 < s2 || s1 == s2;
}

/* 大于比较 */
bool bit::operator>(const string& s1, const string& s2)
{
    return !(s1 <= s2);
}

/* 大于等于比较 */
bool bit::operator>=(const string& s1, const string& s2)
{
    return !(s1 < s2);
}

/* 等于比较 */
bool bit::operator==(const string& s1, const string& s2)
{
    return strcmp(s1.c_str(), s2.c_str()) == 0;
}

/* 不等于比较 */
bool bit::operator!=(const string& s1, const string& s2)
{
    return !(s1 == s2);
}
```

### 流操作重载
```cpp
/* 输出流操作符 */
ostream& bit::operator<<(ostream& out, const string& s)
{
    for (auto ch : s)  // 使用范围for循环输出每个字符
    {
        out << ch;
    }
    return out;
}

/* 输入流操作符 */
istream& bit::operator>>(istream& in, string& s)
{
    s.clear();  // 清空原内容

    const int N = 256;  // 缓冲区大小
    char buff[N];       // 输入缓冲区
    int i = 0;

    char ch;
    ch = in.get();  // 读取一个字符
    // 读取直到遇到空格或换行
    while (ch != ' ' && ch != '\n')
    {
        buff[i++] = ch;
        if (i == N - 1)  // 缓冲区快满了
        {
            buff[i] = '\0';
            s += buff;  // 将缓冲区内容添加到字符串
            i = 0;      // 重置缓冲区索引
        }
        ch = in.get();  // 读取下一个字符
    }

    // 处理缓冲区剩余内容
    if (i > 0)
    {
        buff[i] = '\0';
        s += buff;
    }

    return in;
}
```
