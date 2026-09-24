---
title: "数论"
published: 2026-03-08 17:26:56
description: "如果 $a$ 除以 $b$ 没有余数，那么 $a$ 就是 $b$ 的倍数，$b$ 就是 $a$ 的约数，记作 $b \\mid a$。 约数，也称因数。"
category: "算法"
tags: ["算法", "基础算法"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. 最大公约数和最小公倍数

【约数和倍数】

- 如果 $a$ 除以 $b$ 没有余数，那么 $a$ 就是 $b$ 的倍数，$b$ 就是 $a$ 的约数，记作 $b \mid a$。
    约数，也称因数。

【最大公约数和最小公倍数】

- **最大公约数**（Greatest Common Divisor），常缩写为 **gcd**。
    一组整数的公约数，是指同时是这组数中每一个数的约数的数。
    一组整数的最大公约数，是指所有公约数里面最大的一个。

- **最小公倍数**（Least Common Multiple），常缩写为 **lcm**。
    一组整数的公倍数，是指同时是这组数中每一个数的倍数的数。
    一组整数的最小公倍数，是指所有正的公倍数里面，最小的一个数。

求两个数的 gcd 与 lcm 时，有如下性质：

- 对于两个数 $a$ 和 $b$，$\gcd(a, b) \times \operatorname{lcm}(a, b) = a \times b$。也就是最大公约数乘以最小公倍数等于两个数的乘积。
    因此，一般先求最大公约数，然后用这个性质求最小公倍数。

## 1.1 欧几里得算法

欧几里得算法也称**辗转相除法**，可以求出两个整数的最大公约数。

算法流程：
设 $a > b$：

- 如果 $b$ 是 $a$ 的约数，那么 $b$ 就是两者的最大公约数；

- 如果 $b$ 不是 $a$ 的约数，那么 $\gcd(a, b) = \gcd(b, a \bmod b)$。

因为 $a \bmod b$ 会不断减小，因此可以用递归进行求解。

代码实现：
```cpp
1 LL gcd(LL a, LL b)
2 {
3     if (!b) return a; // 如果 b 等于 0，说明 a 就是最大公约数
4     return gcd(b, a % b);
5 }
```
**时间复杂度**：
求 $\gcd(a, b)$ 会遇到两种情况：

1. $a < b$，则 $\gcd(a, b) = \gcd(b, a)$

2. $a > b$，则 $\gcd(a, b) = \gcd(b, a \bmod b)$

第二种情况会让 $a$ 至少折半，因此最多执行 $\log n$ 次。第一种情况不会多于第二种，因此时间复杂度为 $O(\log n)$。

### 1.1.1 例题
[B3736 [信息与未来 2018] 最大公约数](https://www.luogu.com.cn/problem/B3736)
输入三个正整数 $x, y, z$，求它们的最大公约数 $g$：最大的正整数 $g \ge 1$，满足 $x, y, z$ 都是 $g$ 的倍数，即 $(x \bmod g) = (y \bmod g) = (z \bmod g) = 0$。
输入：12 34 56
输出：2
```cpp
1 #include <iostream>
2 
3 using namespace std;
4 
5 int gcd(int a, int b)
6 {
7     return b == 0 ? a : gcd(b, a % b);
8 }
9 
10 int main()
11 {
12     int x, y, z; cin >> x >> y >> z;
13 
14     cout << gcd(gcd(x, y), z) << endl;
15 
16     return 0;
17 }
```
## 1.2 秦九韶算法

秦九韶算法是一种将一元 $n$ 次多项式的求值问题转化为 $n$ 个一次式的算法。其大大简化了计算过程，即使在现代，利用计算机解决多项式的求值问题时，秦九韶算法依然是最优的算法。

一个 $n$ 次多项式：
$f(x) = a_n x^{n-1} + a_{n-1} x^{n-2} + \dots + a_1 x + a_0$
可以改写成：
$f(x) = (a_n x^{n-2} + a_{n-1} x^{n-3} + \dots + a_1)x + a_0$
$= ((a_n x^{n-3} + a_{n-1} x^{n-4} + \dots + a_2)x + a_1)x + a_0$
$= (\dots((a_n x + a_{n-1})x + a_{n-2})x + \dots + a_2)x + a_1)x + a_0$

例如：对于一个整数 $987654321$，可以拆成：
$((((((((9 \times 10 + 8) \times 10 + 7) \times 10 + 6) \times 10 + 5) \times 10 + 4) \times 10 + 3) \times 10 + 2) \times 10 + 1$

这样对于高精度的数取模，就可以分阶段取模。

### 1.2.1 例题
牛客>小红的gcb
给两个正整数 $a, b$，输出他们的最大公约数 $\gcd(a, b)$。
$len$ 表示 $a$ 的十进制位数，$1 \le len \le 10^6$，$1 \le b \le 10^9$。

【解法】
先将大数取模，然后再代入公式计算。
```cpp
1 #include <iostream>
2 
3 using namespace std;
4 
5 string a;
6 int b;
7 
8 int gcd(int a, int b)
9 {
10     return b == 0 ? a : gcd(b, a % b);
11 }
12 
13 int calc()
14 {
15     long long t = 0;
16     for (auto ch : a)
17     {
18         t = t * 10 + ch - '0';
19         t %= b;
20     }
21     return t;
22 }
23 
24 int main()
25 {
26     cin >> a >> b;
27 
28     cout << gcd(b, calc()) << endl;
29 
30     return 0;
31 }
```

# 2. 质数的判定

【质数和合数】

- 一个大于 $1$ 的自然数，除了 $1$ 和它自身外，不能被其他自然数整除的数叫做**质数**；否则称为**合数**。其中，质数又称**素数**。
    规定 $1$ 既不是质数也不是合数。

## 2.1 试除法判断质数

- 对于一个数 $x$，根据定义，可以从 $[2, x-1]$ 一个一个尝试，判断 $x$ 能否被整除。
    但是，没有必要每一个都去判断。因为如果 $a$ 是 $x$ 的约数，那么 $x/a$ 也是 $x$ 的约数。因此，我们仅需判断较小的 $a$ 是否是 $x$ 的约数，没有必要再去考虑 $x/a$。那么，仅需枚举到 $\sqrt{x}$ 即可。

代码实现：
```cpp
1 bool isprime(int x)
2 {
3     if (x <= 1) return false; // 小于等于1的数不考虑
4 
5     // 试除法判断是否是质数 - 只需枚举到 sqrt(x)
6     for (int i = 2; i <= x / i; i++) // 防溢出的写法
7     {
8         if (x % i == 0) return false;
9     }
10    return true;
11 }
```
**时间复杂度**：
枚举到 $\sqrt{n}$，因此时间复杂度为 $O(\sqrt{N})$

# 3. 筛质数

上一个专题学习了如何判断一个数是否是质数，如果此时想知道 $[1, n]$ 中有多少个素数呢？或者是 $[1, n]$ 中的素数里面，第 $k$ 个素数是多少？

- 一个自然的想法就是从 $2$ 开始，依次向后对每一个自然数进行一次质数检验。

但是这种解法相对暴力，这里介绍两种方法，能够快速地将 $[1, n]$ 中的素数全部记录下来。

## 3.1 埃氏筛法

算法思想：

- 对于任意一个大于 $1$ 的正整数，那么它的 $k$（$k > 1$）倍就是合数。
    因此，如果我们从小到大考虑每个数，然后同时把当前这个数的所有倍数记为合数，没有被标记的数就是素数。

小优化：

- 找到一个质数 $x$ 之后，可以从该数的 $x$ 倍向后筛，因此小于 $x$ 的倍数一定被之前筛过了。

**时间复杂度**：
埃氏筛的时间复杂度为 $O(n \log \log n)$。

代码实现：
```cpp
#include <iostream>
using namespace std;

typedef long long LL;
const int N = 1000010;

bool st[N];     // 当前这个数有没有被筛掉（true表示被筛掉，不是质数）
int p[N];       // 记录质数
int cnt;        // 统计质数个数
int n;          // 求1~n范围内的质数

void get_prime()
{
    // 初始化：0和1不是质数
    st[0] = st[1] = true;
    
    for (LL i = 2; i <= n; i++)
    {
        if (!st[i]) // 没有被标记，说明是质数
        {
            p[++cnt] = i; // 记录这个质数
            
            // 从 i*i 开始，因为小于 i 的倍数已经被之前的质数筛掉了
            // 注意：i*i 可能会溢出，所以要用 long long
            for (LL j = i * i; j <= n; j += i) // 筛掉这个质数的倍数
                st[j] = true;
        }
    }
}

int main()
{
    cin >> n;
    get_prime();
    
    // 输出质数
    cout << "2~" << n << "之间的质数有：" << endl;
    for (int i = 1; i <= cnt; i++)
        cout << p[i] << " ";
    cout << endl;
    cout << "共有 " << cnt << " 个" << endl;
    
    return 0;
}
```
## 3.2 第二种筛法：线性筛法

线性筛法，又称欧拉筛法。算法思想：

- 在埃氏筛法中，它会将一个合数重复多次标记。如果能让每个合数都只被标记一次，那么时间复杂度就可以降到 $O(n)$ 了。

- 我们的做法是，让每一个合数被它的最小质因数筛掉。

**时间复杂度**：
每个数只会被自身最小的质因数筛掉一次，时间复杂度为 $O(n)$。

代码实现：
```cpp
1 int n, q;
2 bool st[N];
3 int p[N], cnt;
4
5 // 欧拉筛
6 void get_prime()
7 {
8     for (int i = 2; i <= n; i++)
9     {
10        if (!st[i]) p[++cnt] = i; // 如果没标记过，就是质数
11
12        // 枚举所有的质数
13        for (int j = 1; 1ll * i * p[j] <= n; j++)
14        {
15            st[i * p[j]] = true;
16            if (i % p[j] == 0) break;
17            // 这个判定条件能让每一个合数被自己的最小质因数筛掉。
18            // 1. 如果 i 是合数，枚举到最小质因数的时候跳出循环
19            // 2. 如果 i 是质数，枚举到自身时跳出循环
20            // 注意，在筛的过程中，我们还能知道 p[j] 是 i 的最小质因数
21        }
22    }
23 }
```
## 3.3 例题
[UVA543 Goldbach's Conjecture](https://www.luogu.com.cn/problem/UVA543)
【题目描述】
哥德巴赫猜想的内容如下：
任意一个大于 $4$ 的偶数都可以拆成两个奇质数之和。
比如：
$8 = 3 + 5$
$20 = 3 + 17 = 7 + 13$
$42 = 5 + 37 = 11 + 31 = 13 + 29 = 19 + 23$
你的任务是：验证小于 $10^6$ 的数满足哥德巴赫猜想。

【输入描述】
输入包含多组数据。每组数据占一行，包含一个偶数 $n$。读入以 $0$ 结束。

【输出描述】
对于每组数据，输出形如 $n = a + b$，其中 $a, b$ 是奇素数。若有多组满足条件的 $a, b$，输出 $b - a$ 最大的一组。若无解，输出 `Goldbach's conjecture is wrong.`。
输入：
```
8
20
42
0
```
输出：
```
8 = 3 + 5
20 = 3 + 17
42 = 5 + 37
```
代码：
```cpp
#include <iostream>

using namespace std;

const int N = 1e6 + 10;

bool st[N];
int p[N], cnt;

void get_prime()
{
    int n = 1e6;
    for (int i = 2; i <= n; i++)
    {
        if (!st[i]) p[++cnt] = i;

        for (int j = 1; 1ll * i * p[j] <= n; j++)
        {
            st[i * p[j]] = true;
            if (i % p[j] == 0) break;
        }
    }
}

void solve(int x)
{
    for (int i = 2; i <= cnt; i++)
    {
        if (!st[x - p[i]])
        {
            printf("%d = %d + %d\n", x, p[i], x - p[i]);
            break;
        }
    }
}

int main()
{
    get_prime();

    int x;
    while (cin >> x, x)
    {
        solve(x);
    }

    return 0;
}
```

# 4. 算术基本定理

【算术基本定理】
算术基本定理又称**唯一分解定理**：

- 任何一个大于 $1$ 的自然数 $n$，都可以唯一分解成有限个质数的乘积
    $n = p_1^{\alpha_1} \times p_2^{\alpha_2} \times p_3^{\alpha_3} \times \dots \times p_k^{\alpha_k}$；
    这里 $p_1 < p_2 < p_3 < \dots < p_k$ 均为质数，其中指数 $\alpha_i$ 是正整数。这样的分解称为 $n$ 的标准分解式。

## 4.1 分解质因数

- 分解质因数就是将一个合数用质因数相乘的形式表示出来，例如 $360 = 2^3 \times 3^2 \times 5^1$。

### 4.1.1 试除法分解质因数

- $n$ 的所有因数中，不会有两个大于 $\sqrt{n}$。
    因此，枚举 $[2, \sqrt{n}]$ 中所有的数，如果能整除 $n$ 就一直除下去。如果最后剩下的数大于 $1$，那就是大于 $\sqrt{n}$ 的因子。

小优化：

- 如果我们提前打出来一个素数表，枚举所有素数的话，时间复杂度能进一步降低。

**时间复杂度**：
枚举到 $\sqrt{n}$，因此时间复杂度为 $O(\sqrt{N})$。但是最优情况下会达到 $O(\log n)$。

代码实现：
```cpp
1 int c[N]; // c[i] 表示 i 这个质数出现的次数
2 
3 void deprime(int x)
4 {
5     for (int i = 2; i <= x / i; i++)
6     {
7         int cnt = 0;
8         while (x % i == 0) // 只要有这个因子，就除尽，并且计数
9         {
10            x /= i;
11            cnt++;
12        }
13        c[i] += cnt;
14    }
15    if (x > 1) c[x]++; // 不要忘记判断最后一个质数
16 }
```

### 4.1.2 例题
**题目链接**：[P2043 质因子分解](https://www.luogu.com.cn/problem/P2043)

【题目描述】
对 $N!$ 进行质因子分解。

【输入描述】
输入数据仅有一行包含一个正整数 $N$，$N \le 10000$。

【输出描述】
输出数据包含若干行，每行两个正整数 $p, a$，中间用一个空格隔开。表示 $N!$ 包含 $a$ 个质因子 $p$，要求按 $p$ 的值从小到大输出。

输入：
```
10
```

输出：
```
2 8
3 4
5 2
7 1
```

解法：
对阶乘中的每一个数，分解质因数。

参考代码：
```cpp
1 #include <iostream>
2 
3 using namespace std;
4 
5 const int N = 1e4 + 10;
6 
7 int n;
8 int c[N];
9 
10 // 试除法分解质因数
11 void deprime(int x)
12 {
13     for (int i = 2; i <= x / i; i++)
14     {
15         int cnt = 0;
16         while (x % i == 0)
17         {
18             cnt++;
19             x /= i;
20         }
21         c[i] += cnt;
22     }
23     // 注意判断最后一个数
24     if (x > 1) c[x]++;
25 }
26 
27 int main()
28 {
29     cin >> n;
30 
31     for (int i = 2; i <= n; i++)
32     {
33         deprime(i);
34     }
35 
36     for (int i = 2; i <= n; i++)
37     {
38         if (c[i])
39         {
40             cout << i << " " << c[i] << endl;
41         }
42     }
43 
44     return 0;
45 }
```

# 5. 约数

## 5.1 求一个整数的所有约数 - 试除法

对于一个整数 $x$，若 $d$ 是 $x$ 的约数，那么 $x/d$ 也是 $x$ 的约数。也就是说，除了完全平方数，约数都是成对出现的。因此，可以用试除法求一个整数的所有约数。
枚举 $1 \sim \sqrt{x}$ 之间的整数，判断是否能整除 $x$。

试除法也能求出一个整数的约数个数以及约数总和。

**时间复杂度**：
枚举到 $\sqrt{n}$，因此时间复杂度为 $O(\sqrt{N})$。
因此，一个整数 $n$ 的约数个数的上限为 $2\sqrt{n}$。

代码实现：
```cpp
1 int d[N], cnt;
2 
3 void get_d(int x)
4 {
5     // 注意从 1 开始循环
6     for (int i = 1; i <= x / i; i++)
7     {
8         if (x % i == 0)
9         {
10            d[++cnt] = i;
11            if (i != x / i) d[++cnt] = x / i;
12        }
13    }
14 }
```

## 5.1.2 求一个整数的所有约数 - 倍数法

如果用试除法分别求每一个数的约数，时间复杂度过高。
可以反过来想，对于每个数 $d$，$[1, n]$ 中以 $d$ 为约数的数就是 $d$ 的倍数，也就是 $d, 2d, 3d, \dots, \lfloor n/d \rfloor \cdot d$。
因此可以用倍数法求出 $[1, n]$ 每个数的约数集合。

**时间复杂度**：
$n$ 倍的调和数，约为 $O(n \log n)$。

代码实现：
```cpp
1 int n;
2 vector<int> d[N];
3 
4 void get_d()
5 {
6     for (int i = 1; i <= n; i++) // 枚举所有约数
7         for (int j = 1; j <= n / i; j++) // 约数的倍数
8             d[i * j].push_back(i);
9 }
```

## 5.2 约数个数定理

由唯一分解定理得：$n = p_1^{\alpha_1} \times p_2^{\alpha_2} \times p_3^{\alpha_3} \times \dots \times p_k^{\alpha_k}$。
若用 $d(n)$ 表示某一个数约数的个数，那么有：
$d(n) = (\alpha_1 + 1)(\alpha_2 + 1)\dots(\alpha_k + 1)$，也就是所有系数加一之后的乘积。

### 5.2.1 求单个数的约数个数方法

- 第一种方式：枚举 $1 \sim \sqrt{x}$ 之间的整数；

- 第二种方式：在分解质因数的过程中，利用公式可以直接计算出某个数的约数个数。

## 5.3约数和定理

由唯一分解定理得：$n = p_1^{\alpha_1} \times p_2^{\alpha_2} \times p_3^{\alpha_3} \times \dots \times p_k^{\alpha_k}$。
若用 $f(n)$ 表示某一个数约数和，那么有：
$f(n) = \prod_{i=1}^{k} \frac{p_i^{\alpha_i+1} - 1}{p_i - 1}$。

### 5.3.1 求单个数的约数之和方法

- 第一种方式：枚举 $1 \sim \sqrt{x}$ 之间的整数；

- 第二种方式：在分解质因数的过程中，利用公式可以直接计算出某个数的约数总和。

### 5.3.2 例题

求自然数 $N$ 的所有约数之和。

输入描述:
输入一行，包含一个正整数 $n$，范围在 $10000$ 以内。

输出描述:
输出一行，包含一个整数。

输入：10
输出：18

```cpp
1 #include <iostream>
2 
3 using namespace std;
4 
5 int main()
6 {
7     int n; cin >> n;
8     int sum = 0;
9 
10    for (int i = 1; i <= n / i; i++)
11    {
12        if (n % i == 0)
13        {
14            sum += i;
15            if (i != n / i) sum += n / i;
16        }
17    }
18 
19    cout << sum << endl;
20 
21    return 0;
22 }
```

### 5.3.3 例题

【题目描述】
给个 $n$，求 $1$ 到 $n$ 的所有数的约数个数的和。

【输入描述】
第一行一个正整数 $n$。

【输出描述】
输出一个整数，表示答案。

输入：3
输出：5

【解法】
正难则反。
求每个数的约数比较麻烦，对于一个数 $x$，在 $[1, n]$ 中，一共有 $\lfloor n/x \rfloor$ 个数，里面的约数有 $x$。因此可以反着求。

```cpp
1 #include <iostream>
2 
3 using namespace std;
4 
5 int main()
6 {
7     int n; cin >> n;
8 
9     long long sum = 0;
10    for (int i = 1; i <= n / 2; i++) sum += n / i;
11    sum += n - n / 2;
12 
13    cout << sum << endl;
14 
15    return 0;
16 }
```
