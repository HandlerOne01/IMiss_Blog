---
title: "make 与 Makefile"
published: 2026-04-23 19:40:54
description: "Makefile：描述构建规则的文件"
category: "Linux 系统"
tags: ["Linux 系统"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. make 与 Makefile

## 1.1 是什么？

- `make`：命令

- `Makefile`：描述构建规则的文件
## 1.2 最简单的 Makefile

`
```makefile
myproc:myproc.c 	
	gcc -o myproc myproc.c 
.PHONY:clean 
clean: 	
	rm -f myproc
```

### 1.2.1 标注说明

- **伪目标（.PHONY）**

    - `clean` 是一个伪目标

    - 不对应真实文件

    - **总是被执行**

- **依赖关系**

    - `myproc` 依赖 `myproc.c`

    - 冒号左边：目标

    - 冒号右边：依赖

- **依赖方法**

    - 缩进（Tab）后的命令是生成目标的方法

- **什么叫“不被执行”？**

    1. **默认情况下：老代码不重新编译**

    2. `make` 会判断是否需要重新执行命令

- **make 如何判断是否需要重新编译？**

    - **通过文件的 Modify 时间（修改时间）**

    - 若依赖文件比目标文件新 → 重新执行
		如 `myproc.c` 的修改时间 **新于** `myproc`- → 重新编译

- **常用命令**

    - `make`：执行默认目标

    - `make clean`：执行 clean 目标

- **make 扫描规则**

    - 从上到下扫描 Makefile

    - **第一个目标是默认目标**

**总结一句话**
> **编译是翻译，链接是组装，库是复用，make 是自动化规则。**

# 2. 分步编译的 Makefile

## 2.1 分步编译 Makefile
```makefile
myproc:myproc.o
	gcc myproc.o -o myproc

myproc.o:myproc.s
	gcc -c myproc.s -o myproc.o

myproc.s:myproc.i
	gcc -S myproc.i -o myproc.s

myproc.i:myproc.c
	gcc -E myproc.c -o myproc.i
```
**依赖链说明**
```txt
myproc.c
 ↓
myproc.i   （预处理）
 ↓
myproc.s   （编译）
 ↓
myproc.o   （汇编）
 ↓
myproc     （链接）
```

## 2.2 对应的 gcc 分步编译命令
```bash
gcc -E myproc.c -o myproc.i
gcc -S myproc.i -o myproc.s
gcc -c myproc.s -o myproc.o
gcc myproc.o -o myproc
```
**标注**
- Makefile **本质就是对这些命令的组织**

- 利用 **推导规则** 自动决定执行顺序

## 2.3 命令执行的“栈模型”理解
```txt
入栈                              出栈并执行
┌─────────────────────────────────────────────────┐
│ gcc -S myproc.i -o myproc.s                     │
│ gcc -c myproc.s -o myproc.o                     │
│ gcc myproc.o -o myproc                          │
└─────────────────────────────────────────────────┘  栈
```
**特点**

- `gcc -E myproc.c -o myproc.i`

    - **独立执行**

    - 不依赖其他步骤

# 3. 变量化 Makefile

## 3.1 Makefile（基础变量）
```makefile
BIN=proc.exe
CC=gcc
SRC=myproc.c
FLAGS=-o
RM=rm -f

$(BIN):$(SRC)
	@$(CC) $(FLAGS) $@ $^

.PHONY:
clean:
	$(RM) $(BIN)
```
**自动变量**
- `$@`：目标
- `$^`：所有依赖
- `$<`：第一个依赖
## 3.2 Makefile（增加输出提示）
```makefile
BIN=proc.exe
CC=gcc
SRC=myproc.c
FLAGS=-o
RM=rm -f

$(BIN):$(SRC)
	@$(CC) $(FLAGS) $@ $^
	@echo "linking ... $^ to $@"

.PHONY:
clean:
	@$(RM) $(BIN)
	@echo "remove ... $(BIN)"

.PHONY:test
test:
	@echo $(BIN)
	@echo $(CC)
	@echo $(SRC)
	@echo $(FLAGS)
	@echo $(RM)
```

# 4. Makefile 多文件编译
## 4.1 模式规则 Makefile（Version 1）
```makefile
BIN=proc.exe
CC=gcc
SRC=myproc.c
OBJ=myproc.o
LFLAGS=-o
FLAGS=-c
RM=rm -f

$(BIN):$(OBJ)
	@$(CC) $(LFLAGS) $@ $^

%.o:%.c
	$(CC) $(FLAGS) $<
```
**标注说明**

- `%.o: %.c`

    - **模式规则**

- 把当前目录下的 `.c` → `.o` **依次展开**

- `$<`：第一个依赖

## 4.2 自动扫描源码 Makefile（Version 2）
```makefile
# 1. 定义变量（方便后续修改和维护）
# 编译器
CC = gcc
# 编译选项：-Wall显示所有警告，-g生成调试信息（新手调试必备）
CFLAGS = -Wall -g
# 最终生成的可执行文件名
TARGET = app
# 源文件列表（包含所有.c文件）
SRC = main.c my_stdio.c
# 自动推导目标文件（.c替换成.o，无需手动写）
OBJ = $(SRC:.c=.o)
# 头文件列表（关联的.h文件）
HDR = my_stdio.h

# 2. 默认目标：执行make时编译生成可执行文件
all: $(TARGET)

# 3. 生成可执行文件的规则：依赖所有.o文件
$(TARGET): $(OBJ)
	$(CC) $(CFLAGS) -o $@ $^

# 4. 生成.o文件的通用规则：每个.o依赖对应的.c + 所有.h文件
# 确保修改.h文件后，会自动重新编译相关.c文件
%.o: %.c $(HDR)
	$(CC) $(CFLAGS) -c $< -o $@

# 5. 清理规则：执行make clean删除生成的文件
clean:
	rm -f $(TARGET) $(OBJ)

# 声明clean为伪目标（避免和同名文件冲突）
.PHONY: all clean
```
### 4.2.1 解释

#### 变量定义

| 变量名                       | 作用                                                           |
| ------------------------- | ------------------------------------------------------------ |
| `CC = gcc`                | 指定编译器为 gcc（如果是 C++ 可改成 g++）                                  |
| `CFLAGS = -Wall -g`       | 编译参数：`-Wall` 能帮你发现代码里的语法 / 逻辑警告，`-g` 支持 gdb 调试               |
| `TARGET = app`            | 最终生成的可执行文件名，改这里就能换输出文件名                                      |
| `SRC = main.c my_stdio.c` | 所有 .c 源文件，新增 .c 文件只需在这里添加                                    |
| `OBJ = $(SRC:.c=.o)`      | 自动把 `main.c` 转成 `main.o`、`my_stdio.c` 转成 `my_stdio.o`，无需手动维护 |
| `HDR = my_stdio.h`        | 头文件列表，确保修改 `my_stdio.h` 后会重新编译所有依赖它的 .c 文件                   |

#### 核心规则

- **`all: $(TARGET)`**：默认目标，执行 `make` 时会优先编译 `$(TARGET)`（即 `app`）；
- **`$(TARGET): $(OBJ)`**：生成可执行文件 `app` 依赖 `main.o` 和 `my_stdio.o`，只有这两个 .o 文件都存在，才会链接生成可执行文件；
- **`%.o: %.c $(HDR)`**：通用规则（模式规则），比如 `main.o` 依赖 `main.c` + `my_stdio.h`，`my_stdio.o` 依赖 `my_stdio.c` + `my_stdio.h`。只要 .c 或 .h 文件修改，对应的 .o 文件会重新编译；

    - `$<`：自动变量，代表 “第一个依赖文件”（比如编译 `main.o` 时，`$<` 就是 `main.c`）；
    - `$@`：自动变量，代表 “目标文件”（比如编译 `main.o` 时，`$@` 就是 `main.o`）；

- **`clean`**：执行 `make clean` 会删除可执行文件 `app` 和所有 .o 文件，清理编译产物。

**问：为什么要先.c变成.o然后再连接**
**答：**
**make只看文件的时间戳**，不看文件内容：

- 它比较 `.o` 和 `.c` 的时间戳来决定是否编译

- 它比较 `app` 和 `.o` 的时间戳来决定是否链接

**这就是为什么需要 `.o` 文件**：它们作为中间文件，记录了每个源文件的编译时间，让make能够精确知道哪些文件需要重新编译！
