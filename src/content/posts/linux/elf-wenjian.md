---
title: "ELF文件"
published: 2026-04-08 11:50:49
description: "源代码（.c）经过编译生成目标文件（.o），多个目标文件通过链接生成可执行文件。"
category: "Linux 系统"
tags: ["Linux 系统"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. 编译与链接基础

- 源代码（`.c`）经过编译生成**目标文件**（`.o`），多个目标文件通过链接生成可执行文件。

- 目标文件是二进制文件，格式为 **ELF**（Executable and Linkable Format），是对二进制代码和数据的封装。

- 优点：修改单个源文件只需重新编译该文件，无需重新编译整个工程。
```bash
# 编译生成目标文件
gcc -c code.c hello.c          # 生成 code.o hello.o
# 链接生成可执行文件
gcc *.o -o main.exe
# 查看文件类型
file hello.o
# 输出：hello.o: ELF 64-bit LSB relocatable, x86-64, version 1 (SYSV), not stripped
```

# 2. ELF文件概述

ELF（Executable and Linkable Format）是一种通用的二进制文件格式，主要有四种类型：

|类型|描述|示例|
|---|---|---|
|可重定位文件（Relocatable File）|包含代码和数据，可与其他目标文件链接生成可执行文件或共享库|`.o` 文件|
|可执行文件（Executable File）|可直接执行的程序|`a.out`|
|共享目标文件（Shared Object File）|动态链接库|`.so` 文件|
|核心转储（Core Dump）|进程异常终止时的内存映像|`core` 文件|
## 2.1 ELF文件的组成结构
![](/images/posts/elf-wenjian/01.png)

ELF文件由以下四部分组成：

1. **ELF头（ELF Header）**

    - 位于文件开始位置，描述文件的主要特性（如文件类型、机器架构、入口点地址等）。

    - 定位程序头表和节头表的位置。

2. **程序头表（Program Header Table）**

    - 描述如何将文件映射到内存，列举所有段（segments）及其属性（偏移、长度、权限等）。

    - 用于加载可执行文件，是执行视图的核心。

3. **节（Sections）**

    - ELF文件的基本组成单元，存储特定类型的数据（如代码、数据、符号表等）。

    - 常见节：

        - `.text`：代码节，保存机器指令。

        - `.data`：已初始化的全局变量和静态变量。

        - `.rodata`：只读数据（如字符串常量）。

        - `.bss`：未初始化的全局变量和静态变量（仅占位符，不占用文件空间）。

        - `.symtab`：符号表，记录函数名、变量名与地址的对应关系。

        - `.got` / `.plt`：全局偏移表和过程链接表，用于动态链接。

4. **节头表（Section Header Table）**

    - 描述所有节的属性（名称、类型、偏移、大小等），是链接视图的核心。

    - 可重定位文件必须有节头表，可执行文件可选。

**两个视图：**

- **链接视图（Linking View）**：通过节头表查看，用于静态链接时合并节。

- **执行视图（Execution View）**：通过程序头表查看，用于运行时加载段。

# 3. ELF头信息详解

使用 `readelf -h` 查看ELF头：
```bash
$ readelf -h hello.o
ELF Header:
  Magic:   7f 45 4c 46 02 01 01 00 00 00 00 00 00 00 00 00
  Class:                             ELF64
  Data:                              2's complement, little endian
  Version:                           1 (current)
  OS/ABI:                            UNIX - System V
  ABI Version:                       0
  Type:                              REL (Relocatable file)   # 可重定位文件
  Machine:                           Advanced Micro Devices X86-64
  Version:                           0x1
  Entry point address:               0x0                      # 目标文件无入口点
  Start of program headers:          0 (bytes into file)      # 无程序头表
  Start of section headers:          728 (bytes into file)    # 节头表起始位置
  ...
```

可执行文件的ELF头会有入口点地址和程序头表：
```bash
$ readelf -h a.out
  Type:                              DYN (Shared object file)  # 实际为动态可执行文件
  Entry point address:               0x1060
  Start of program headers:          64 (bytes into file)
  Number of program headers:         13
```

# 4. 节头表与程序头表

## 4.1 查看节头表
```bash
$ readelf -S a.out
There are 31 section headers, starting at offset 0x19d8:
Section Headers:
  [Nr] Name              Type             Address           Offset
       Size              EntSize          Flags  Link  Info  Align
  [16] .text             PROGBITS         0000000000001060  00001060
       00000000000001a5  0000000000000000  AX       0     0     16
  [25] .data             PROGBITS         0000000000004000  00003000
       0000000000000010  0000000000000000  WA       0     0     8
  [26] .bss              NOBITS           0000000000004010  00003010
       0000000000000008  0000000000000000  WA       0     0     1
  ...
```
- **Flags**：W（可写）、A（可分配内存）、X（可执行）、...

- 可执行文件中，`.got`、`.data`、`.bss` 等通常合并到同一个段（segment）中。

## 4.2 查看程序头表（段）
```bash
$ readelf -l a.out
Elf file type is EXEC (Executable file)
Entry point 0x4003e0
There are 9 program headers, starting at offset 64

Program Headers:
  Type           Offset   VirtAddr           PhysAddr           FileSiz  MemSiz   Flg Align
  LOAD           0x000000 0x0000000000400000 0x0000000000400000 0x000744 0x000744 R E 0x200000
  LOAD           0x000e10 0x0000000000600e10 0x0000000000600e10 0x000218 0x000220 RW  0x200000
  DYNAMIC        0x000e28 0x0000000000600e28 0x0000000000600e28 0x0001d0 0x0001d0 RW  0x8
  ...

Section to Segment mapping:
  Segment Sections...
   02     .interp .note.ABI-tag .note.gnu.build-id .gnu.hash .dynsym .dynstr .gnu.version ... .text .rodata ...
   03     .init_array .fini_array .jcr .dynamic .got .got.plt .data .bss
```
**LOAD段**：
- 告诉操作系统哪些模块可以被加载进内存。
- 加载进内存之后哪些分段是可读可写，哪些分段是只读，哪些分段是可执⾏的。

- 多个节合并为段，目的是减少内存页内碎片，提高内存利用率（例如将`.text`和`.rodata`合并到只读可执行段）。
### 4.2.1为什么要将section合并成为segment
**答：**
- Section合并的主要原因是为了减少页面碎⽚，提⾼内存使用效率。如果不进⾏合并，
假设页面大小为4096字节（内存块基本⼤⼩，加载，管理的基本单位），如果.text部分
为4097字节，.init部分为512字节，那么它们将占⽤3个⻚⾯，⽽合并后，它们只需2个
⻚⾯。
- 此外，操作系统在加载程序时，会将具有相同属性（如可执行段，可读可写段等）的section合并成⼀个大的segment，这样就可以实现不同的访问权限，从而优化内存管理和权限访问控制。

![](/images/posts/elf-wenjian/02.png)

# 5. 静态链接（地址重定位）

## 5.1 为什么需要重定位？

编译单个源文件时，编译器无法知道外部函数（如`printf`、其他模块的函数）的地址，因此临时填充为0或占位符，留待链接时修正。
`objdump -d`:将代码段（.text）进⾏反汇编查看
```bash
$ objdump -d hello.o
0000000000000000 <main>:
   0:   f3 0f 1e fa          endbr64
   4:   55                   push   %rbp
   5:   48 89 e5             mov    %rsp,%rbp
   8:   48 8d 3d 00 00 00 00 lea    0x0(%rip),%rdi        # f <main+0xf>   # 字符串地址未知
   f:   e8 00 00 00 00       callq  14 <main+0x14>        # printf地址未知
  14:   b8 00 00 00 00       mov    $0x0,%eax
  19:   e8 00 00 00 00       callq  1e <main+0x1e>        # run函数地址未知
  1e:   b8 00 00 00 00       mov    $0x0,%eax
  23:   5d                   pop    %rbp
  24:   c3                   retq
```
## 5.2 符号表与未定义符号

使用 `readelf -s` 查看符号表：
```bash
$ readelf -s code.o
Symbol table '.symtab' contains 13 entries:
   Num:    Value          Size Type    Bind   Vis      Ndx Name
    10: 0000000000000000    23 FUNC    GLOBAL DEFAULT    1 run
    12: 0000000000000000     0 NOTYPE  GLOBAL DEFAULT  UND puts   # UND表示未定义
```
- **UND**：未定义符号，需要在链接时从其他目标文件或库中解析。

- **静态链接**：将所有目标文件的节合并，并根据符号表修正地址（重定位）。

## 5.3 链接过程

1. 合并各个`.o`文件的相同节（如将所有`.text`合并）。

2. 为合并后的节分配虚拟地址（可执行文件有固定基址，现代系统使用ASLR，但链接时生成相对地址）。

3. 根据重定位表修正指令中的地址（将占位符替换为真实地址）。
```bash
$ objdump -d a.out
0000000000001149 <run>:
    1149:   f3 0f 1e fa          endbr64
    114d:   55                   push   %rbp
    114e:   48 89 e5             mov    %rsp,%rbp
    1151:   48 8d 3d ac 0e 00 00 lea    0xeac(%rip),%rdi   # 2004 <_IO_stdin_used+0x4>
    1158:   e8 f3 fe ff ff       callq  1050 <puts@plt>     # 已修正为PLT入口
    115d:   90                   nop
    115e:   5d                   pop    %rbp
    115f:   c3                   retq
```
![](/images/posts/elf-wenjian/03.png)
所以，链接过程中会涉及到对.o中外部符号进行地址重定位。
# 6. 动态链接
![](/images/posts/elf-wenjian/04.png)

## 6.1 为什么需要动态链接？

- **节省磁盘和内存空间**：多个程序共享同一份库代码，内存中只需加载一次。

- **便于更新**：升级库无需重新链接所有程序。

## 6.2 动态库的加载

程序启动时，动态链接器（如`ld-linux.so`）负责：

1. 解析可执行文件依赖的共享库（通过`.dynamic`段和`.dynstr`）。

2. 将库映射到进程地址空间的共享区。

3. 重定位库中的符号（GOT表更新）。-确保程序中的函数调用和变量访问能正确映射到动态库中的实际地址

查看依赖：
```bash
$ ldd a.out
        linux-vdso.so.1 (0x00007ffc3a5f7000)
        libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f8a1a200000)
        /lib64/ld-linux-x86-64.so.2 (0x00007f8a1a5f7000)
```
## 6.3 地址无关代码（PIC）与GOT

**动态库需要在任意地址加载，因此编译时必须用 `-fPIC` 生成地址无关代码。**
```bash
gcc -shared -fPIC -o lib.so source.c
```
这个选项告诉编译器：
**"生成代码时，所有访问都用 rip 相对寻址，别用绝对地址"**

- 库内部函数调用使用相对寻址。

- 外部函数和全局变量的地址通过**全局偏移表（GOT）** 间接访问。

**GOT（Global Offset Table）**：位于数据段（可写），存放全局变量和函数的实际地址。

- 代码中访问外部符号时，先通过GOT获取地址，再跳转。

- GOT表项在动态库加载时由动态链接器填充。

## 6.4 延迟绑定与PLT

为了减少启动时的重定位开销，采用**延迟绑定**技术，通过**过程链接表（PLT）** 实现。

- **PLT（Procedure Linkage Table）**：代码段中的一小段桩代码，每个动态函数对应一个PLT条目。

- 第一次调用函数时，PLT跳转到动态链接器的解析函数，解析后将真实地址填入GOT，然后执行函数。

- 后续调用直接通过GOT跳转。

反汇编观察：
```asm
0000000000001050 <puts@plt>:
    1050:   f3 0f 1e fa          endbr64
    1054:   f2 ff 25 75 2f 00 00 bnd jmpq *0x2f75(%rip)        # 3fd0 <puts@GLIBC_2.2.5>
    # 第一次调用时，*0x2f75 指向下一行指令（解析代码），解析后指向真正的puts
```

## 6.5 GOT的修改

动态库映射完成后，动态链接器根据库的基址和函数偏移，计算实际地址，并写入GOT表项。
因此GOT表位于可写段（如`.got`），而代码段保持只读，可被多个进程共享。

# 7. 虚拟地址空间与ELF加载

## 7.1 ELF文件中的虚拟地址

ELF文件在编译时就已经为代码和数据分配了**虚拟地址**（从0开始编址）。
可执行文件的入口点（Entry point）就是虚拟地址，由ELF头指定。
```bash
$ readelf -h a.out | grep Entry
  Entry point address:               0x1060
```
## 7.2 进程地址空间的初始化

当程序被加载时，内核根据程序头表（LOAD段）创建 `vm_area_struct` 结构，描述各段在虚拟内存中的位置（起始、结束、权限）。

- 代码段：只读、可执行

- 数据段：可读写

- 堆、栈、共享库映射区等

```c
// task_struct 中包含 mm_struct，mm_struct 中包含 vm_area_struct 链表
struct mm_struct {
    struct vm_area_struct *mmap;  // 虚拟区间链表
    // ...
};
```
## 7.3 动态库映射到进程地址空间

动态库通过`mmap`系统调用映射到进程的共享区。

- 库的代码段映射为只读可执行，数据段映射为可读写。

- 映射后，动态链接器更新GOT表，完成重定位。

# 8. 进程调用动态库全过程
```
时间轴：
────┼───────────────────────────────────────────►
    │
   ① 程序启动
    │
   ② 内核加载程序本身
    │
   ③ 内核加载动态链接器
    │
   ④ 动态链接器读取程序头
    │      ↓
   ⑤ 查找需要的动态库
    │      ↓
   ⑥ 打开库文件
    │      ↓
   ⑦ mmap 映射到地址空间
    │      ↓
   ⑧ 计算函数地址，填写 GOT
    │      ↓
   ⑨ 程序开始执行 main
    │
   ⑩ 调用 printf
       → 通过 GOT 跳转到库函数
```
## 8.1 最初状态：程序在磁盘上
```
磁盘上的可执行文件：
┌─────────────────────────┐
│        ELF头            │
├─────────────────────────┤
│       代码段 .text       │
│   call printf@plt       │  ← 只知道要调用 printf
│   call malloc@plt       │     但不知道 printf 在哪
├─────────────────────────┤
│       数据段 .data       │
│   GOT表(初始状态)        │
│   printf_addr = 0       │  ← 还没填地址
│   malloc_addr = 0       │
└─────────────────────────┘

磁盘上的 libc.so：
┌─────────────────────────┐
│       代码段 .text       │
│   printf函数在这里       │
│   malloc函数在这里       │
└─────────────────────────┘
```
## 8.2 加载程序到内存

```
步骤1：程序被加载器加载到内存
┌─────────────────────────┐
│     进程地址空间         │
├─────────────────────────┤
│   代码段 (来自可执行文件) │
│   call printf@plt       │
├─────────────────────────┤
│   数据段 (来自可执行文件) │
│   GOT表(还是空的)        │
└─────────────────────────┘

此时程序还不知道 libc.so 在哪
```

## 8.3 动态链接器介入
```
步骤2：动态链接器 /lib/ld-linux.so 被加载
┌─────────────────────────┐
│     进程地址空间         │
├─────────────────────────┤
│   程序代码段             │
├─────────────────────────┤
│   程序数据段             │
├─────────────────────────┤
│   动态链接器             │ ← 负责找库、加载库
└─────────────────────────┘
```

## 8.4 查找需要的动态库
```
步骤3：动态链接器查看程序头
程序说："我需要 libc.so"

动态链接器开始找：
1. 检查 LD_LIBRARY_PATH 环境变量
2. 检查 /etc/ld.so.cache
3. 检查 /lib, /usr/lib

找到 libc.so 在 /lib/x86_64-linux-gnu/libc.so.6
```

## 8.5 打开并映射动态库
```
步骤4：动态链接器打开 libc.so 文件

int fd = open("/lib/libc.so.6", O_RDONLY);

步骤5：用 mmap 映射到进程地址空间

┌─────────────────────────┐
│     进程地址空间         │
├─────────────────────────┤
│   程序代码段             │
├─────────────────────────┤
│   程序数据段             │
├─────────────────────────┤
│   动态链接器             │
├─────────────────────────┤
│   libc.so 代码段         │ ← mmap 到这里
│   printf函数实际代码在这里│
├─────────────────────────┤
│   libc.so 数据段         │
└─────────────────────────┘
```
- **动态库也是文件，要访问也是要被先加载，要加载也是要被先打开**
- **进程找到动态库的本质也是文件操作，不过我们访问库函数是通过虚拟地址进行跳转访问，所以需要把动态库映射到进程的地址空间**

## 8.6 填写 GOT 表
```
步骤6：动态链接器计算函数地址

libc.so 起始地址 = 0x7f8a4000
printf 在 libc 中的偏移 = 0x3a
printf 真实地址 = 0x7f8a4000 + 0x3a = 0x7f8a403a

步骤7：把这个地址写入 GOT 表

┌─────────────────────────┐
│   GOT表                  │
│   printf_addr = 0x7f8a403a │ ← 填好了！
│   malloc_addr = 0x7f8a4120 │
└─────────────────────────┘
```

## 8.7 进程终于"看到"了动态库
```
现在进程的完整视图：

┌─────────────────────────┐ 0x7f8a4000 (libc 起始)
│   libc.so 代码段         │
│   0x7f8a403a: printf     │ ← 进程通过 GOT 知道这里
│   0x7f8a4120: malloc     │
├─────────────────────────┤
│   libc.so 数据段         │
└─────────────────────────┘

┌─────────────────────────┐
│   程序代码段             │
│   call printf@plt       │
│   ↓                     │
│   printf@plt:           │
│       jmp *GOT[printf]  │ → 跳到 0x7f8a403a
└─────────────────────────┘

进程终于能看到并调用 printf 了！
```
![](/images/posts/elf-wenjian/05.png)
**动态库最初在磁盘上，通过 mmap 预订虚拟地址，通过第一次访问时的缺页异常触发从磁盘到物理内存的加载，之后所有进程共享这同一份物理内存**
**动态库的物理内存只有一份，但虚拟地址在不同进程中不一样，通过页表映射。程序调用库函数时，先通过 GOT/PLT 找到虚拟地址，再通过页表找到物理地址。**

# 8. 常用命令总结

|命令|作用|
|---|---|
|`file <file>`|查看文件类型|
|`readelf -h <file>`|查看ELF头|
|`readelf -l <file>`|查看程序头表（段）|
|`readelf -S <file>`|查看节头表|
|`readelf -s <file>`|查看符号表|
|`objdump -d <file>`|反汇编代码段|
|`objdump -S <file>`|反汇编并混合源代码（需编译时加-g）|
|`ldd <file>`|查看可执行文件依赖的动态库|
|`size <file>`|查看各段大小（text, data, bss）|

# 9. 关键概念辨析

- **可重定位文件（.o）**：未链接，节头表重要，程序头表不存在（或为空）。

- **可执行文件**：已链接，程序头表重要，用于加载；节头表可选（调试信息）。

- **静态链接**：在编译时将所有代码合并，地址固定（重定位），生成独立可执行文件。

- **动态链接**：在加载或运行时解析符号，依赖共享库，生成位置无关可执行文件（PIE）。

- **GOT vs PLT**：GOT存地址，PLT存桩代码，两者配合实现延迟绑定。

- **PIC（位置无关代码）**：代码中不使用绝对地址，通过相对寻址和GOT实现共享。
