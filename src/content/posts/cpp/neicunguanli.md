---
title: "内存管理"
published: 2026-01-29 18:04:14
description: "栈（Stack） 存储非静态局部变量、函数参数、返回值 向下增长（从高地址向低地址） 自动分配和释放 堆（Heap） 动态内存分配区域 向上增长（从低地址向高地址） 手动管理（malloc/free, new/delete） 数据段/静态…"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# c/cpp程序内存区域划分
1. **栈（Stack）**
    - 存储非静态局部变量、函数参数、返回值
    - 向下增长（从高地址向低地址）
    - 自动分配和释放
2. **堆（Heap）**
    - 动态内存分配区域
    - 向上增长（从低地址向高地址）
    - 手动管理（malloc/free, new/delete）
3. **数据段/静态区**
    - 存储全局变量和静态变量
    - 程序开始时分配，结束时释放
4. **代码段/常量区**
    - 存储可执行代码和字符串常量
    - 只读区域
5. **内存映射段**
    - 文件映射、动态库、匿名映射
    - 进程间通信

## 练习
```cpp
int globalVar = 1;           // 数据段
static int staticGlobalVar = 1; // 数据段

void Test() {
    static int staticVar = 1; // 数据段
    int localVar = 1;         // 栈
    int num1[10] = {1,2,3,4}; // 栈
    char char2[] = "abcd";    // 栈
    const char* pChar3 = "abcd"; // 指针在栈，字符串在代码段
    int* ptr1 = (int*)malloc(sizeof(int)*4); // 指针在栈，指向堆
    int* ptr2 = (int*)calloc(4, sizeof(int)); // 指针在栈，指向堆
    int* ptr3 = (int*)realloc(ptr2, sizeof(int)*4); // 指针在栈，指向堆
    
    free(ptr1);
    free(ptr3);
}
选择题：根据下面的选项，选择每个变量所在的区域：  
A.栈 B.堆 C.数据段（静态区） D.代码段（常量区）

- `globalVar`在哪里？__ -> C（数据段）
    
- `staticGlobalVar`在哪里？__ -> C（数据段）
    
- `staticVar`在哪里？__ -> C（数据段）
    
- `localVar`在哪里？__ -> A（栈）
    
- `num1`在哪里？__ -> A（栈）
    
- `char2`在哪里？__ -> A（栈）
    
- `*char2`在哪里？__ -> A（栈） // 注意：char2是一个数组，数组在栈上，所以数组元素也在栈上
    
- `pChar3`在哪里？__ -> A（栈）
    
- `*pChar3`在哪里？__ -> D（代码段/常量区） // pChar3指向一个字符串常量，字符串常量在代码段/常量区
    
- `ptr1`在哪里？__ -> A（栈）
    
- `*ptr1`在哪里？__ -> B（堆）
```

# C语言中动态内存管理方式malloc/calloc/realloc/free
```cpp
void Test() {
    int* p1 = (int*)malloc(sizeof(int)*4);    // 分配未初始化的内存
    int* p2 = (int*)calloc(4, sizeof(int));   // 分配并初始化为0
    int* p3 = (int*)realloc(p2, sizeof(int)*10); // 调整内存大小
    
    // 不需要free(p2)，因为realloc已经处理
    free(p1);
    free(p3);
}
```
## malloc/calloc/realloc的区别？
    - malloc：申请指定字节数的内存，不初始化。
    - calloc：为指定数量的元素分配内存，每个元素的大小为指定字节数，并将内存初始化为0。
    - realloc：调整已分配内存块的大小，可以扩大或缩小。扩大时，原内容保留，新增部分不初始化；缩小时，截断部分内容。可能移动内存块到新的位置

| 函数      | 初始化   | 参数            | 功能              |
| ------- | ----- | ------------- | --------------- |
| malloc  | 不初始化  | size          | 分配指定字节数的内存      |
| calloc  | 初始化为0 | num, size     | 分配num个size字节的元素 |
| realloc | 保持原内容 | ptr, new_size | 调整已分配内存的大小      |

## malloc的实现原理？glibc中malloc实现原理

    - malloc的实现原理通常涉及内存池管理，使用空闲链表（free list）来管理已释放的内存块，并通过brk或mmap系统调用向操作系统申请内存。glibc的malloc使用ptmalloc2实现，它通过维护多个内存块（chunk）和多个链表来管理内存，包括未分配的内存和已分配的内存，并尝试减少内存碎片。

# c++内存管理方式 new和delete
```cpp
void Test()
{
    // 动态申请一个int类型的空间
    int* ptr4 = new int;
    // 动态申请一个int类型的空间并初始化为10
    int* ptr5 = new int(10);
    // 动态申请10个int类型的空间
    int* ptr6 = new int[3];
    delete ptr4;
    delete ptr5;
    delete[] ptr6;
}

注意：申请和释放单个元素的空间，使用new和delete操作符，申请和释放连续的空间，使用new[]和delete[]，注意匹配起来使用。
```
## new和delete操作自定义类型
```cpp
class A
{
public:
    A(int a = 0) : _a(a)
    {
        cout << "A():" << this << endl;
    }
    ~A()
    {
        cout << "~A():" << this << endl;
    }
private:
    int _a;
};

int main()
{
    // new/delete和malloc/free最大区别是new/delete对于【自定义类型】除了开空间还会调用构造函数和析构函数
    A* p1 = (A*)malloc(sizeof(A));
    A* p2 = new A(1);
    free(p1);
    delete p2;

    // 内置类型是几乎是一样的
    int* p3 = (int*)malloc(sizeof(int)); // C
    int* p4 = new int;
    free(p3);
    delete p4;

    A* p5 = (A*)malloc(sizeof(A)*10);
    A* p6 = new A[10];
    free(p5);
    delete[] p6;
    return 0;
}
在申请自定义类型的空间时，new会调用构造函数，delete会调用析构函数，而malloc与free不会。
```

# operator new与operator delete函数
```cpp
/*
operator new：该函数实际通过malloc来申请空间，当malloc申请空间成功时直接返回；申请空间失败，尝试执行空间不足应对措施，如果改应对措施用户设置了，则继续申请，否则抛异常。
*/
void* __CRTDECL operator new(size_t size) _THROW1(_STD bad_alloc)
{
    // try to allocate size bytes
    void* p;
    while ((p = malloc(size)) == 0)
        if (_callnewh(size) == 0)
        {
            // report no memory
            // 如果申请内存失败了，这里会抛出bad_alloc类型异常
            static const std::bad_alloc nomem;
            _RAISE(nomem);
        }
    return (p);
}

/*
operator delete: 该函数最终是通过free来释放空间的
*/
void operator delete(void* pUserData)
{
    _CrtMemBlockHeader* pHead;
    RTCCALLBACK(_RTC_Free_hook, (pUserData, 0));
    if (pUserData == NULL)
        return;
    _mlock(_HEAP_LOCK);  /* block other threads */
    __TRY
        /* get a pointer to memory block header */
        pHead = pHdr(pUserData);
        /* verify block type */
        _ASSERTE(_BLOCK_TYPE_IS_VALID(pHead->nBlockUse));
        _free_dbg(pUserData, pHead->nBlockUse);
    __FINALLY
        _munlock(_HEAP_LOCK);  /* release other threads */
    __END_TRY_FINALLY
        return;
}

// free的实现
#define free(p) _free_dbg(p, _NORMAL_BLOCK)

// operator new 的简化实现
void* operator new(size_t size) {
    void* p;
    while ((p = malloc(size)) == 0) {
        // 尝试处理内存不足的情况
        if (处理函数 == 0) {
            // 抛出bad_alloc异常
            throw std::bad_alloc();
        }
    }
    return p;
}

// operator delete 的简化实现
void operator delete(void* p) {
    free(p);
}
```
通过上述两个全局函数的实现知道，operator new实际也是通过malloc来申请空间，如果malloc申请空间成功就直接返回，否则执行用户提供的空间不足应对措施，如果用户提供该措施就继续申请，否则就抛异常。operator delete最终是通过free来释放空间的。

# new和delete的实现原理
如果申请的是内置类型的空间，new和malloc，delete和free基本类似，不同的地方是：new/delete申请和释放的是单个元素的空间，new[]和delete[]申请的是连续空间，而且new在申请空间失败时会抛异常，malloc会返回NULL。

## 自定义类型

- **new的原理**
    1. 调用operator new函数申请空间
    2. 在申请的空间上执行构造函数，完成对象的构造
- **delete的原理**
    1. 在空间上执行析构函数，完成对象中资源的清理工作
    2. 调用operator delete函数释放对象的空间
- **new T[N]的原理**
    1. 调用operator new[]函数，在operator new[]中实际调用operator new函数完成N个对象空间的申请
    2. 在申请的空间上执行N次构造函数
- **delete[]的原理**
    1. 在释放的对象空间上执行N次析构函数，完成N个对象中资源的清理
    2. 调用operator delete[]释放空间，实际在operator delete[]中调用operator delete来释放空间

## 定位new表达式（placement-new）
```cpp
new (place_address) type;
new (place_address) type(initializer-list);
```
其中，`place_address`必须是一个指针，`initializer-list`是类型的初始化列表。

使用场景：
定位new表达式在实际中一般是配合内存池使用。因为内存池分配出的内存没有初始化，所以如果是自定义类型的对象，需要使用new的定位表达式进行显示调构造函数进行初始化。
```cpp
class A
{
public:
    A(int a = 0) : _a(a)
    {
        cout << "A():" << this << endl;
    }
    ~A()
    {
        cout << "~A():" << this << endl;
    }
private:
    int _a;
};

// 定位new/replacement new
int main()
{
    // p1现在指向的只不过是与A对象相同大小的一段空间，还不能算是一个对象，因为构造函数没有执行
    A* p1 = (A*)malloc(sizeof(A));
    new(p1) A;  // 注意：如果A类的构造函数有参数时，此处需要传参
    p1->~A();
    free(p1);

    A* p2 = (A*)operator new(sizeof(A));
    new(p2) A(10);
    p2->~A();
    operator delete(p2);
    return 0;
}
```

# malloc/free 和 new/delete 的区别

|特性|malloc/free|new/delete|
|---|---|---|
|**性质**|函数|操作符|
|**初始化**|不初始化|可以初始化|
|**空间计算**|手动计算字节数|自动计算类型大小|
|**返回值**|void* 需要强转|返回具体类型指针|
|**失败处理**|返回NULL|抛出异常|
|**自定义类型**|不调用构造/析构|调用构造/析构|
|**重载**|不可重载|可重载operator new/delete|
|**内存来源**|堆|可自定义（placement-new|
malloc/free和new/delete的共同点是：都是从堆上申请空间，并且需要用户手动释放。不同的地方是：
1. malloc和free是函数，new和delete是操作符
2. malloc申请的空间不会初始化，new可以初始化
3. malloc申请空间时，需要手动计算空间大小并传递，new只需在其后跟上空间的类型即可，如果是多个对象，[]中指定对象个数即可
4. malloc的返回值为void*，在使用时必须强转，new不需要，因为new后跟的是空间的类型
5. malloc申请空间失败时，返回的是NULL，因此使用时必须判空，new不需要，但是new需要捕获异常
6. 申请自定义类型对象时，malloc/free只会开辟空间，不会调用构造函数与析构函数，而new在申请空间后会调用构造函数完成对象的初始化，delete在释放空间前会调用析构函数完成空间中资源的清理
