---
title: "可变参数模板与emplace系列"
published: 2026-04-22 20:43:16
description: "在 C++11 之前，模板的参数个数是固定的。C++11 引入了可变参数模板，允许函数或类接受任意数量、任意类型的参数。"
category: "C++11"
tags: ["C++11"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. 可变参数模板

在 C++11 之前，模板的参数个数是固定的。C++11 引入了可变参数模板，允许函数或类接受任意数量、任意类型的参数。

## 1.1 概念

- **参数包 (Parameter Pack)**：

    - **模板参数包**：`template <class ...Args>`，表示零个或多个模板参数。

    - **函数参数包**：`void Func(Args... args)`，表示零个或多个函数参数。

- **引用类型支持**：

    - `Args&&... args`：结合**万能引用 (Universal Reference)** 和 **引用折叠 (Reference Folding)** 规则，可以完美保留实参的左值或右值属性。
```cpp
		template <class ...Args> void Func(Args&&... args) {}
```

## 1.2 获取包的大小

可以使用 `sizeof...` 运算符来获取参数包中元素的个数：

C++

```cpp
template <class ...Args>
void Print(Args&&... args) {
    cout << sizeof...(args) << endl; // 获取参数个数
}
```

---

# 2. 编译器的推演原理

可变参数模板并不是在运行时动态处理参数，而是在**编译阶段**由编译器根据调用情况，实例化出对应的函数。

## 2.1 实例化过程

当你调用不同参数个数的 `Print` 时：

- `Print();` $\rightarrow$ 编译器生成一个无参函数。

- `Print(1, "hello");` $\rightarrow$ 编译器生成一个接受 `int` 和 `const char*` 的函数。

## 2.1 底层本质

**没有模板语法支持时的模拟：** 编译器本质上是结合引用折叠规则，实例化出了多个重载函数。

> **总结：** 函数模板实例化出多个**类型不同**的函数；可变参数模板实例化出多个**参数个数不同**的函数。

---

# 3. 参数包的展开

我们不能直接通过索引（如 `args[0]`）访问参数包，必须通过“展开”来使用。

## 3.1 递归展开模式

这是最常用的展开方式，需要一个**递归终止函数**（通常是无参或单参的重载）。

```cpp
// 终止函数（递归出口）
void ShowList() {
    cout << endl;
}

// 递归函数
template <class T, class ...Args>
void ShowList(T x, Args... args) {
    cout << x << " ";      // 处理当前包的第一个参数
    ShowList(args...);    // 将剩下的 N-1 个参数继续递归
}
```

## 3.2 编译器展开的轨迹
![](/images/posts/kebiancanshumubanyu-emplace-xilie/01.png)

当你调用 `Print(1, string("xxxxx"), 2.2)` 时，编译器会递归推导出如下调用链：

1. `ShowList(int x, string y, double z)` $\rightarrow$ 打印 `x`，调用 `ShowList(y, z)`

2. `ShowList(string x, double z)` $\rightarrow$ 打印 `x`，调用 `ShowList(z)`

3. `ShowList(double x)` $\rightarrow$ 打印 `x`，调用 `ShowList()`

4. `ShowList()` $\rightarrow$ 匹配无参函数，递归结束。

---

# 4. emplace_back vs push_back

这是可变参数模板在 STL 中的典型应用。`emplace` 系列函数（如 `emplace_back`）利用可变参数模板和完美转发，实现了更高效的插入。

## 4.1 对比测试结论

| **场景**      | **push_back**                       | **emplace_back** | **结论**         |
| ----------- | ----------------------------------- | ---------------- | -------------- |
| **传左值对象**   | 走拷贝构造                               | 走拷贝构造            | **效果一致**       |
| **传右值对象**   | 走移动构造                               | 走移动构造            | **效果一致**       |
| **直接传构造参数** | 1. 构造临时对象<br><br>  <br><br>2. 走移动构造 | **直接在容器内存中构造**   | **emplace 胜出** |

## 4.2 `push_back` 的源码逻辑

`push_back` 通常有两个重载版本：一个针对左值（拷贝），一个针对右值（移动）。

```cpp
// 1. 左值版本：传入的是现成的对象
void push_back(const T& val) {
    // 先扩容（如果需要）
    _allocator.allocate(...); 
    // 在预留的内存上调用【拷贝构造函数】
    construct(_finish, val); 
    _finish++;
}

// 2. 右值版本：传入的是临时对象或 move 后的对象
void push_back(T&& val) {
    _allocator.allocate(...);
    // 在预留的内存上调用【移动构造函数】
    // 使用 std::move 确保触发移动语义
    construct(_finish, std::move(val)); 
    _finish++;
}
```

## 4.3 `emplace_back` 的源码逻辑

这是 C++11 的黑科技，它是一个**可变参数模板**。

```cpp
template <class... Args>
void emplace_back(Args&&... args) {
    _allocator.allocate(...);
    // 核心秘密就在这里！
    // 1. args 是一个参数包
    // 2. std::forward<Args>(args)... 完美转发所有参数
    // 3. 直接在目标内存上调用 T 的构造函数，参数就是传进来的 args
    _allocator_traits::construct(_finish, std::forward<Args>(args)...);
    _finish++;
}
```

## 4.4 它们到底差在哪？

- **`push_back` 是“搬家”**：你得先在外面有一个“人”（对象），然后再把这个人搬进房间里。如果是左值，就是克隆一个（拷贝）；如果是右值，就是把灵魂抽走（移动）。

- **`emplace_back` 是“原地投胎”**：你不需要先在外面造一个人。你只需要把造人需要的参数（比如姓名、年龄）传给房间，`emplace_back` 就会直接在房间里按照这些参数把人造出来。

## 4.5 为什么 `emplace_back` 往往更快？

当你写 `list.push_back("Hello")` 时：

1. 编译器先看 `"Hello"` 是 `char*`，不是 `string`，所以会造一个 `string` 的**临时对象**。

2. 调用 `push_back(T&&)`。

3. 执行**移动构造**，把临时对象的内容搬进容器。

4. 销毁临时对象。

而当你写 `list.emplace_back("Hello")` 时：

1. `emplace_back` 直接拿到 `"Hello"` 这个指针。

2. 直接在容器内部的内存上调用 `string(const char*)` 构造函数。

3. **没有临时对象，没有移动构造。**

> **小贴士：**
>
> 虽然 `emplace_back` 很强，但也不是万能的。如果你已经有一个构造好的对象 `s1` 了，那 `lt.emplace_back(s1)` 和 `lt.push_back(s1)` 效果是一模一样的。它只有在**直接传构造参数**的时候才会有性能起飞的感觉！

---

# 5. 总结

1. **可变参数模板**是 C++11 极其强大的特性，它让模板编程从“固定维度”跨越到了“无限维度”。

2. **包扩展**本质上是编译器在编译时的递归拆解，将复杂的模板转化为具体的重载函数。

3. **emplace 系列**是开发中的首选。它不仅兼容 `push` 的所有功能，还能在直接传参时通过减少临时对象的构造与移动，提升性能。
