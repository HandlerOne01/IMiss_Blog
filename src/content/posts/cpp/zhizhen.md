---
title: "指针"
published: 2025-11-07 17:12:58
description: "指针是地址，指针变量是存储地址的变量 指针类型决定了解引用的权限和指针运算的步长 const修饰指针有不同含义，位置很重要 野指针很危险，要养成良好的编程习惯 需要修改实参值时必须使用传址调用 数组名：通常是首元素地址，除了sizeof(…"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 总结
1. 指针是地址，指针变量是存储地址的变量
2. 指针类型决定了解引用的权限和指针运算的步长
3. const修饰指针有不同含义，位置很重要
4. 野指针很危险，要养成良好的编程习惯
5. 需要修改实参值时必须使用传址调用
6. **数组名**：通常是首元素地址，除了`sizeof(arr)`和`&arr`两种情况
7. **数组访问**：`arr[i]`等价于`*(arr + i)`，都是通过地址计算实现
8. **数组传参**：传递的是首元素地址，函数内无法获取数组大小
9. **二级指针**：指向指针的指针，用于管理指针变量
10. **指针数组**：存放指针的数组，可模拟二维数组结构
11. **内存连续性**：指针数组模拟的"二维数组"各行在内存中不一定连续
12.  **字符指针**：指向字符串常量时，多个指针可能指向同一内存
13. **数组指针**：指向整个数组的指针，类型为`int(*)[size]
14. **二维数组传参**：传递的是第一行的地址，可用数组指针接收
15. **函数指针**：指向函数的指针，用于动态调用函数
16. **typedef简化**：可简化复杂的指针类型声明
17. **函数指针数组**：存放函数指针的数组，实现转移表模式
18. **转移表应用**：替代多重分支，提高代码可维护性和扩展性
19. **回调函数本质**：通过函数指针实现函数的间接调用
20. **qsort核心**：泛型排序 + 回调比较机制
21. **void*作用**：实现泛型编程，可处理任意数据类型
22. **地址计算**：`(char*)base + index * size` 是泛型数组访问的关键
23. **字节交换**：逐字节交换实现泛型数据交换
24. **设计思想**：将算法框架与具体比较逻辑分离，提高代码复用性

**泛型编程的核心技巧**：
- 使用`void*`接收任意类型数据
- 通过`size`参数知道每个元素的大小
- 通过回调函数处理类型相关的操作（比较、交换等）
- 按字节计算偏移量来访问元素
# 指针变量和地址

## 取地址操作符（&）
```cpp
    int a = 10;
    &a; // 取出a的地址
    printf("%p\n", &a); // 打印地址
//&a取出的是a所占4个字节中地址较小的字节地址
```

## 指针变量和解引用操作符（ * ）
```cpp
int a = 10;
int *pa = &a; // 指针变量pa存储a的地址

*pa = 0;//通过指针修改变量a的值
//*pa表示通过pa中的地址找到指向的空间
```

## 指针变量的大小
```cpp
printf("%zd\n", sizeof(char *));    // 4或8
printf("%zd\n", sizeof(short *));   // 4或8  
printf("%zd\n", sizeof(int *));     // 4或8
printf("%zd\n", sizeof(double *));  // 4或8
//32位平台4字节
//64位平台8字节
```

# 指针变量类型和意义
## 指针的解引用权限
- 指针类型决定解引用时的的操作权限（能操作几个字节）
```cpp
// 代码1：int*指针修改4个字节
int n = 0x11223344;
int *pi = &n;
*pi = 0; // 将4个字节全部改为0

// 代码2：char*指针修改1个字节  
int n = 0x11223344;
char *pc = (char*)&n;
*pc = 0; // 只将第一个字节改为0
```

## 指针+-整数
- 指针类型决定指针向前或向后走的一部=步距离
```cpp
int n = 10;
char *pc = (char*)&n;
int *pi = &n;

printf("%p\n", pc);    // 00AFF974
printf("%p\n", pc+1);  // 00AFF975 (+1字节)
printf("%p\n", pi);    // 00AFF974  
printf("%p\n", pi+1);  // 00AFF978 (+4字节)
```

## void* 指针
```cpp
int a = 10;
void *pa = &a;    // 可以接收任意类型地址
void *pc = &a;

// *pa = 10;     // 错误：void*不能直接解引用
// *pc = 0;      // 错误：void*不能直接解引用
// pc++;         // 错误：void*不能进行算术运算
```

# const修饰指针
## const 修饰变量
```cpp
const int n = 0;
// n = 20; // 错误：n不能被直接修改

// 但可以通过指针间接修改（打破const限制）
int *p = &n;
*p = 20; // 语法允许但不合理
```

## const修饰指针变量
```cpp
// 1. 无const修饰
int *p; // p和*p都可修改

// 2. const在*左边
const int *p; // *p不能修改，p可以修改

// 3. const在*右边  
int *const p; // p不能修改，*p可以修改

// 4. *两边都有const
int const *const p; // p和*p都不能修改

//测试代码
void test2() // const在*左边
{
    int n = 10, m = 20;
    const int *p = &n;
    // *p = 20; // 错误：不能修改指向的内容
    p = &m;     // 正确：可以修改指针本身
}

void test3() // const在*右边
{
    int n = 10, m = 20;
    int *const p = &n;
    *p = 20;    // 正确：可以修改指向的内容
    // p = &m; // 错误：不能修改指针本身
}
```

# 指针运算
## 指针+-整数
```cpp
int arr[10] = {1,2,3,4,5,6,7,8,9,10};
int *p = &arr[0];
int sz = sizeof(arr)/sizeof(arr[0]);

for(int i = 0; i < sz; i++)
{
    printf("%d ", *(p + i)); // 指针+整数遍历数组
}
```
## 指针-指针
```cpp
int my_strlen(char *s)
{
    char *p = s;
    while(*p != '\0')
        p++;
    return p - s; // 指针相减得到元素个数
}
//前提：两指针指向同一个区间
```

# 野指针
## 野指针成因
```cpp
1.指针未初始化
int *p; // 未初始化，随机值
*p = 20; // 危险操作

2.指针越界访问
int arr[10] = {0};
int *p = &arr[0];
for(int i = 0; i <= 11; i++) // i=10,11时越界
{
    *(p++) = i; // 野指针
}

3.指针指向已释放空间
int* test()
{
    int n = 100;
    return &n; // 返回局部变量地址
}

int main()
{
    int *p = test(); // p成为野指针
    printf("%d\n", *p); // 危险操作
}
```

## 规避野指针方法
```cpp
1.指针初始化
int num = 10;
int *p1 = &num;  // 明确指向
int *p2 = NULL;  // 不知道指向哪里时置NULL

2.使用指针后及时置NULL
p = NULL; // 像拴住野狗
// 使用前检查
if(p != NULL)
{
    // 安全使用
}
```

# assert断言
```cpp
#include <assert.h>

int my_strlen(const char *str)
{
    assert(str != NULL); // 断言：确保str不是NULL
    // 或者简写：assert(str);
    函数内容
}

#define NDEBUG  // 禁用所有assert
#include <assert.h>
```

# 传值调用和传址调用
- 传值调用：只需要主调函数中的变量值进行计算
- 传址调用：需要修改主调函数中的变量值

# 数组名就是数组首元素的地址
## 两个例外
- sizeof(数组名)：数组名表示整个数组，计算整个数组的大小
- **&arr：整个数组的地址，+1跳过整个数组
- **arr` 和 `&arr[0]：首元素地址，+1跳过一个元素

## 数组传参本质
- 数组传参传递的是数组首元素的地址
- 函数形参接收的是指针变量
- 在函数内部无法通过`sizeof(arr)`获取数组大小
- 需要在外部计算好元素个数再传入函数

```cpp
// 以下四种写法完全等价：
void test(int arr[])     // 数组形式
void test(int arr[10])   // 带大小数组形式（编译器忽略大小）
void test(int *arr)      // 指针形式
void test(int arr[5])    // 任意大小数组形式
```

# 二级指针
```cpp
#include <stdio.h>
int main()
{
    int a = 10;
    int *pa = &a;      // 一级指针，存放a的地址
    int **ppa = &pa;   // 二级指针，存放pa的地址
    
    return 0;
}
```

## 二级指针运算
```cpp
int a = 10;
int b = 20;
int *pa = &a;
int **ppa = &pa;

// 1. *ppa 访问 pa
*ppa = &b;  // 等价于 pa = &b;

// 2. **ppa 访问 a
**ppa = 30; // 等价于 *pa = 30; 等价于 a = 30;
```

# 指针数组
```cpp
// 整型数组 - 存放整型
int arr1[5] = {1, 2, 3, 4, 5};

// 字符数组 - 存放字符  
char arr2[5] = {'a', 'b', 'c', 'd', 'e'};

// 指针数组 - 存放指针（地址）
int *arr3[5];  // 存放5个int*类型指针
```

## 指针数组模拟二维数组
```cpp
#include <stdio.h>
int main()
{
    int arr1[] = {1, 2, 3, 4, 5};
    int arr2[] = {2, 3, 4, 5, 6};
    int arr3[] = {3, 4, 5, 6, 7};
    
    // 指针数组：每个元素指向一个一维数组
    int *parr[3] = {arr1, arr2, arr3};
    
    // 使用二维数组的语法访问
    for(int i = 0; i < 3; i++)
    {
        for(int j = 0; j < 5; j++)
        {
            printf("%d ", parr[i][j]);  // parr[i][j]等价于*（parr[i]+j）
        }
        printf("\n");
    }
    return 0;
}
```

# 数组指针
## 定义
```cpp
int *p1[10];   // 指针数组：10个int*指针的数组
int (*p2)[10]; // 数组指针：指向含10个int元素数组的指针
- `p` 先和 `*` 结合，说明是指针变量
- 指向的是大小为10个整型的数组
- 所以p是指向数组的指针，称为数组指针
```
## 初始化
```cpp
int arr[10] = {0};
int (*p)[10] = &arr;  // 获取数组地址，存入数组指针
```

# 二维数组名表示第一行的地址
`类型为`int(*)[5]

## 二维数组传参
```cpp
#include <stdio.h>
void test(int (*p)[5], int r, int c)
{
    for(int i = 0; i < r; i++)
    {
        for(int j = 0; j < c; j++)
        {
            printf("%d ", *(*(p + i) + j));
            // 等价于 p[i][j]
        }
        printf("\n");
    }
}

int main()
{
    int arr[3][5] = {{1,2,3,4,5}, {2,3,4,5,6}, {3,4,5,6,7}};
    test(arr, 3, 5);
    return 0;
}
```
访问原理：
- - `p + i`：第i行的地址
- `*(p + i)`：第i行首元素的地址
- `*(p + i) + j`：第i行第j个元素的地址
- `*(*(p + i) + j)`：第i行第j个元素的值

# 函数指针变量
##  函数指针变量的创建
```cpp
void test()
{
    printf("hehe\n");
}

// 函数指针定义
void (*pf1)() = &test;//函数名就是地址
void (*pf2)() = test;  // 两种写法等价

int Add(int x, int y)
{
    return x + y;
}

int (*pf3)(int, int) = Add;
int (*pf4)(int x, int y) = &Add;  // 参数名可写可不写
```

## 函数指针类型解析
```cpp
int (*p)(int,int)
- p：函数指针变量名
- *：说明是指针
- (int, int)：指向函数的参数类型和个数
- int：指向函数的返回类型
```

## 使用示例
```cpp
#include <stdio.h>
int Add(int x, int y)
{
    return x + y;
}

int main()
{
    int (*pf3)(int, int) = Add;
    
    printf("%d\n", (*pf3)(2, 3));  // 传统调用方式
    printf("%d\n", pf3(3, 5));     // 简化调用方式
    return 0;
}
```

# 复杂函数指针声明
```cpp
// 代码1：调用0地址处的函数
(*(void(*)())0)();

// 代码2：signal函数声明
void (*signal(int, void(*)(int)))(int);
```

# typedef简化函数指针
**新的类型名必须在`*`的右边
```cpp
// 基本类型重命名
typedef unsigned int uint;
typedef int* ptr_t;

// 数组指针类型重命名
typedef int(*parr_t)[5];

// 函数指针类型重命名
typedef void(*pfun_t)(int);

// 使用typedef简化复杂声明
pfun_t signal(int, pfun_t);  // 等价于void(*signal(int, void(*)(int)))(int);
```

# 转移表（函数指针数组应用）
```cpp
#include <stdio.h>
int add(int a, int b) { return a + b; }
int sub(int a, int b) { return a - b; }
int mul(int a, int b) { return a * b; }
int div(int a, int b) { return a / b; }

int main()
{
    int x, y, input = 1, ret = 0;
    
    // 函数指针数组（转移表）
    int (*p[5])(int x, int y) = {0, add, sub, mul, div};
    
    do {
        printf("*************************\n");
        printf("1:add 2:sub\n");
        printf("3:mul 4:div\n");
        printf("0:exit\n");
        printf("*************************\n");
        printf("请选择：");
        scanf("%d", &input);
        
        if(input >= 1 && input <= 4) {
            printf("输入操作数：");
            scanf("%d %d", &x, &y);
            ret = (*p[input])(x, y);  // 通过函数指针调用
            printf("ret = %d\n", ret);
        }
        else if(input == 0) {
            printf("退出计算器\n");
        }
        else {
            printf("输入有误\n");
        }
    } while(input);
    
    return 0;
}
```
## 优势
1. **代码简洁**：避免冗长的switch-case语句
2. **易于扩展**：新增功能只需在数组中添加函数指针
3. **统一管理**：所有相关函数指针集中管理
4. **动态调用**：通过索引直接调用对应函数

# 回调函数
**定义**：回调函数就是一个通过函数指针调用的函数。

**核心思想**：
- 把函数的指针（地址）作为参数传递给另一个函数
- 当这个指针被用来调用其所指向的函数时，被调用的函数就是回调函数
- 回调函数不是由实现方直接调用，而是在特定事件或条件发生时由另外一方调用

```cpp
#include <stdio.h>

int add(int a, int b) { return a + b; }
int sub(int a, int b) { return a - b; }
int mul(int a, int b) { return a * b; }
int div(int a, int b) { return a / b; }

int main()
{
    int x, y, input = 1, ret = 0;
    do {
        printf("*************************\n");
        printf("1:add 2:sub\n");
        printf("3:mul 4:div\n");
        printf("0:exit\n");
        printf("*************************\n");
        printf("请选择：");
        scanf("%d", &input);
        
        switch(input) {
            case 1:
                printf("输入操作数：");
                scanf("%d %d", &x, &y);
                ret = add(x, y);
                printf("ret = %d\n", ret);
                break;
            case 2:
                printf("输入操作数：");
                scanf("%d %d", &x, &y);
                ret = sub(x, y);
                printf("ret = %d\n", ret);
                break;
            // case 3, 4 重复类似代码...
            case 0:
                printf("退出程序\n");
                break;
            default:
                printf("选择错误\n");
                break;
        }
    } while(input);
    return 0;
}
```
