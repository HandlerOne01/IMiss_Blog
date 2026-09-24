---
title: "基本指令"
published: 2026-04-08 11:49:44
description: "语法：cd [目录名] 功能：改变当前工作目录到指定目录"
category: "Linux 系统"
tags: ["Linux 系统"]
lang: "zh_CN"
draft: false
comment: true
---

# `cd` 命令 - 改变工作目录
**语法**：`cd [目录名]`
**功能**：改变当前工作目录到指定目录

**常用参数和技巧**：
```cpp
# 1. 返回上级目录
[whb@bite-alicloud ~]$ pwd
/home/whb
[whb@bite-alicloud ~]$ cd ..
[whb@bite-alicloud home]$ pwd
/home

# 2. 绝对路径定位（从根目录开始）
[whb@bite-alicloud home]$ pwd
/home
[whb@bite-alicloud home]$ cd /home/whb/test
[whb@bite-alicloud test]$ pwd
/home/whb/test

# 3. 相对路径定位（相对于当前目录）
[whb@bite-alicloud test]$ pwd
/home/whb/test
[whb@bite-alicloud test]$ cd ../temp/
[whb@bite-alicloud temp]$ pwd
/home/whb/temp

# 4. 查看/home目录下的用户
[whb@bite-alicloud temp]$ ls /home
bss gaobo luojie whb wudu
# 说明：每次新建用户都会在/home下创建同名目录

# 5. 快速进入家目录（三种方式）
[whb@bite-alicloud test]$ whoami
whb
[whb@bite-alicloud test]$ pwd
/home/whb/test
[whb@bite-alicloud test]$ cd ~     # 方式1：使用~
[whb@bite-alicloud ~]$ pwd
/home/whb
[whb@bite-alicloud test]$ cd       # 方式2：直接cd
[whb@bite-alicloud ~]$ pwd
/home/whb
[whb@bite-alicloud test]$ cd $HOME # 方式3：使用$HOME变量

# 6. 返回最近访问的目录
[whb@bite-alicloud ~]$ pwd        # 当前在/home/whb
/home/whb
[whb@bite-alicloud ~]$ cd /       # 进入根目录
[whb@bite-alicloud /]$ pwd
/
[whb@bite-alicloud /]$ cd -       # 返回上一次目录
/home/whb
[whb@bite-alicloud ~]$ pwd
/home/whb
[whb@bite-alicloud ~]$ cd -       # 再次切换
/
[whb@bite-alicloud /]$ pwd
/

# 7. 返回上上级目录
[whb@bite-alicloud ~]$ cd ../..   # 返回上两级目录

# 8. 进入当前目录（无实际效果）
[whb@bite-alicloud ~]$ cd .       # 仍在当前目录
```

# `ls` 命令 - 列出目录内容

**语法**：`ls [选项] [目录或文件]`
**功能**：列出目录内容或文件信息

**常用选项详解**：
```cpp
# 基础示例
[whb@bite-alicloud test]$ ls
dir file.txt

# 1. -a：显示所有文件（包括隐藏文件）
[whb@bite-alicloud test]$ ls -a
.  ..  dir  file.txt
# 说明：.表示当前目录，..表示上级目录，隐藏文件以.开头

# 2. -l：长格式显示详细信息
[whb@bite-alicloud test]$ ls -l
total 4
drwxrwxr-x 2 whb whb 4096 Jan 11 14:22 dir
-rw-rw-r-- 1 whb whb    0 Jan 11 14:22 file.txt
# 字段说明：
# 第1列：文件类型和权限
# 第2列：硬链接数
# 第3列：所有者
# 第4列：所属组
# 第5列：文件大小(字节)
# 第6-8列：最后修改时间
# 第9列：文件名

# 3. -a和-l组合使用
[whb@bite-alicloud test]$ ls -a -l
total 12
drwxrwxr-x 3 whb whb 4096 Jan 11 15:01 .
drwx------ 22 whb whb 4096 Jan 11 14:21 ..
drwxrwxr-x 2 whb whb 4096 Jan 11 14:22 dir
-rw-rw-r-- 1 whb whb    0 Jan 11 14:22 file.txt

# 4. -F：显示文件类型标识符
[whb@bite-alicloud test]$ ls -a -l -F
total 12
drwxrwxr-x 3 whb whb 4096 Jan 11 15:01 ./
drwx------ 22 whb whb 4096 Jan 11 14:21 ../
drwxrwxr-x 2 whb whb 4096 Jan 11 14:22 dir/
-rw-rw-r-- 1 whb whb    0 Jan 11 14:22 file.txt
# 标识符说明：
# / 表示目录
# * 表示可执行文件
# @ 表示符号链接
# | 表示FIFOs（命名管道）
# = 表示套接字(sockets)

# 5. -n：用数字显示UID和GID
[whb@bite-alicloud test]$ ls -alFn
total 12
drwxrwxr-x 3 1003 1003 4096 Jan 11 15:01 ./
drwx------ 22 1003 1003 4096 Jan 11 14:21 ../
drwxrwxr-x 2 1003 1003 4096 Jan 11 14:22 dir/
-rw-rw-r-- 1 1003 1003    0 Jan 11 14:22 file.txt
# 说明：1003是whb用户的UID和GID

# 6. -i：显示inode号（索引节点号）
[whb@bite-alicloud test]$ ls -i
1844718 dir  1844719 file.txt

# 7. -t：按时间排序（最新修改的在前）
[whb@bite-alicloud test]$ ls -lt

# 8. -r：反向排序
[whb@bite-alicloud test]$ ls -lr

# 9. -R：递归显示子目录内容
[whb@bite-alicloud test]$ ls -R

# 10. -h：人类可读的文件大小（配合-l使用）
[whb@bite-alicloud test]$ ls -lh
drwxrwxr-x 2 whb whb 4.0K Jan 11 14:22 dir
-rw-rw-r-- 1 whb whb    0 Jan 11 14:22 file.txt

# 11. -S：按文件大小排序（大文件在前）
[whb@bite-alicloud test]$ ls -lS

# 12. -d：将目录像文件一样显示
[whb@bite-alicloud test]$ ls -ld test
drwxrwxr-x 3 whb whb 4096 Jan 11 15:01 test

# 13. -1：每行只显示一个文件
[whb@bite-alicloud test]$ ls -1
dir
file.txt
```

# `pwd` 命令 - 显示当前目录

**语法**：`pwd`
**功能**：显示当前工作目录的绝对路径

```cpp
[whb@bite-alicloud test]$ pwd
/home/whb/test
```

# `touch` 命令 - 创建文件或修改时间戳

**语法**：`touch [选项]... 文件...`

**功能**：
1. 创建不存在的文件
2. 更改文件的时间戳（访问时间和修改时间）

**常用选项**：
- `-a`：只更改访问时间(access time)
- `-c`：不创建新文件（文件不存在时不创建）
- `-m`：只更改修改时间(modification time)
```cpp
# 1. 创建普通文件
[whb@bite-alicloud test]$ ls
dir file.txt
[whb@bite-alicloud test]$ touch newFile.txt
[whb@bite-alicloud test]$ ls
dir file.txt newFile.txt

# 2. 查看文件详细信息（stat命令）
[whb@bite-alicloud test]$ stat newFile.txt
File: 'newFile.txt'
Size: 0          Blocks: 0          IO Block: 4096   regular empty file
Device: fd01h/64769d    Inode: 1844719     Links: 1
Access: (0664/-rw-rw-r--)  Uid: ( 1003/    whb)   Gid: ( 1003/    whb)
Access: 2023-01-11 15:06:45.832787572 +0800  # 访问时间
Modify: 2023-01-11 15:06:45.832787572 +0800  # 修改时间
Change: 2023-01-11 15:06:45.832787572 +0800  # 改变时间（元数据变更）
Birth: -  # 创建时间（Linux通常不记录）

# 3. 修改文件访问时间
[whb@bite-alicloud test]$ touch -a newFile.txt
[whb@bite-alicloud test]$ stat newFile.txt
Access: 2023-01-11 15:07:00.062846804 +0800  # 访问时间更新
Modify: 2023-01-11 15:06:45.832787572 +0800  # 修改时间不变
Change: 2023-01-11 15:07:00.062846804 +0800  # 改变时间也更新了
# 注意：改变时间(Change time)记录元数据变更，包括权限、时间戳等

# 4. 修改文件修改时间
[whb@bite-alicloud test]$ touch -m newFile.txt
[whb@bite-alicloud test]$ stat newFile.txt
Access: 2023-01-11 15:07:00.062846804 +0800  # 访问时间不变
Modify: 2023-01-11 15:09:19.428426903 +0800  # 修改时间更新
Change: 2023-01-11 15:09:19.428426903 +0800  # 改变时间也更新了

# 5. 不创建文件（文件不存在时）
[whb@bite-alicloud test]$ touch -c non_exist.txt
[whb@bite-alicloud test]$ ls
# non_exist.txt不会被创建

# 6. 同时创建多个文件
[whb@bite-alicloud test]$ touch file1.txt file2.txt file3.txt

# 7. 使用通配符创建文件
[whb@bite-alicloud test]$ touch test{1..5}.txt
```

# `mkdir` 命令 - 创建目录

**语法**：`mkdir [选项] dirname...`

**功能**：创建目录

**常用选项**：
- `-p`/`--parents`：递归创建目录（父目录不存在时自动创建）
- `-v`：显示创建过程
- `-m`：设置目录权限
```cpp
# 1. 创建普通空目录
[whb@bite-alicloud test]$ ls -l
total 4
drwxrwxr-x 2 whb whb 4096 Jan 11 14:22 dir
-rw-rw-r-- 1 whb whb    0 Jan 11 14:22 file.txt
-rw-rw-r-- 1 whb whb    0 Jan 11 15:09 newFile.txt
[whb@bite-alicloud test]$ mkdir mydir
[whb@bite-alicloud test]$ ls -l
total 8
drwxrwxr-x 2 whb whb 4096 Jan 11 14:22 dir
-rw-rw-r-- 1 whb whb    0 Jan 11 14:22 file.txt
drwxrwxr-x 2 whb whb 4096 Jan 11 15:15 mydir
-rw-rw-r-- 1 whb whb    0 Jan 11 15:09 newFile.txt

# 2. 递归创建多级目录
[whb@bite-alicloud test]$ mkdir -p path1/path2/path3/path4
[whb@bite-alicloud test]$ ls -l
total 12
drwxrwxr-x 2 whb whb 4096 Jan 11 14:22 dir
-rw-rw-r-- 1 whb whb    0 Jan 11 14:22 file.txt
drwxrwxr-x 2 whb whb 4096 Jan 11 15:15 mydir
-rw-rw-r-- 1 whb whb    0 Jan 11 15:09 newFile.txt
drwxrwxr-x 3 whb whb 4096 Jan 11 15:16 path1

# 3. 查看目录结构（tree命令）
[whb@bite-alicloud test]$ tree path1
path1
└── path2
    └── path3
        └── path4

# 4. 创建目录时设置权限
[whb@bite-alicloud test]$ mkdir -m 755 public_dir
[whb@bite-alicloud test]$ ls -ld public_dir
drwxr-xr-x 2 whb whb 4096 Jan 11 15:20 public_dir

# 5. 创建多个目录
[whb@bite-alicloud test]$ mkdir dir1 dir2 dir3

# 6. 显示创建过程
[whb@bite-alicloud test]$ mkdir -vp a/b/c/d
mkdir: created directory 'a'
mkdir: created directory 'a/b'
mkdir: created directory 'a/b/c'
mkdir: created directory 'a/b/c/d'
```

# `rmdir` 命令 - 删除空目录

**语法**：`rmdir [-p] [dirName]`
**功能**：删除空目录
**常用选项**：
- `-p`：递归删除空目录（子目录删除后，如果父目录也变为空，则一并删除）

```cpp
# 1. 删除空目录
[whb@bite-alicloud test]$ ll
total 12
drwxrwxr-x 2 whb whb 4096 Jan 11 14:22 dir
-rw-rw-r-- 1 whb whb    0 Jan 11 14:22 file.txt
drwxrwxr-x 2 whb whb 4096 Jan 11 15:15 mydir
-rw-rw-r-- 1 whb whb    0 Jan 11 15:09 newFile.txt
drwxrwxr-x 3 whb whb 4096 Jan 11 15:16 path1
[whb@bite-alicloud test]$ tree mydir/
mydir/

0 directories, 0 files  # 空目录
[whb@bite-alicloud test]$ rmdir mydir
[whb@bite-alicloud test]$ ll
total 8
drwxrwxr-x 2 whb whb 4096 Jan 11 14:22 dir
-rw-rw-r-- 1 whb whb    0 Jan 11 14:22 file.txt
-rw-rw-r-- 1 whb whb    0 Jan 11 15:09 newFile.txt
drwxrwxr-x 3 whb whb 4096 Jan 11 15:16 path1

# 2. 递归删除空目录链
[whb@bite-alicloud test]$ tree path1
path1
└── path2
    └── path3
        └── path4

3 directories, 0 files  # 都是空目录
[whb@bite-alicloud test]$ rmdir -p path1/path2/path3/path4
[whb@bite-alicloud test]$ ll
total 4
drwxrwxr-x 2 whb whb 4096 Jan 11 14:22 dir
-rw-rw-r-- 1 whb whb    0 Jan 11 14:22 file.txt
-rw-rw-r-- 1 whb whb    0 Jan 11 15:09 newFile.txt

# 3. 目录非空时无法删除
[whb@bite-alicloud test]$ mkdir -p path1/path2/path3/path4
[whb@bite-alicloud test]$ touch path1/myfile.txt
[whb@bite-alicloud test]$ touch path1/path2/myfile.txt
[whb@bite-alicloud test]$ tree path1/
path1/
├── myfile.txt
└── path2
    ├── myfile.txt
    └── path3
        └── path4

3 directories, 2 files  # 有文件，不是空目录
[whb@bite-alicloud test]$ rmdir -p path1/path2/path3/path4
rmdir: failed to remove directory 'path1/path2': Directory not empty
```
**注意**：`rmdir` 只能删除空目录，如果目录中有文件或子目录，需要使用 `rm -r` 命令。

# `rm` 命令 - 删除文件或目录

**语法**：`rm [-f-i-r-v] [dirName/dir]`
**功能**：删除文件或目录
**常用选项**：
- `-f`：强制删除，不提示
- `-i`：删除前逐一询问确认
- `-r`/`-R`：递归删除目录及其下所有文件
- `-v`：显示删除过程
```cpp
# 16-23行：删除目录的两种方式
[whb@bite-alicloud test]$ ll
total 8
drwxrwxr-x 2 whb whb 4096 Jan 11 14:22 dir
-rw-rw-r-- 1 whb whb    0 Jan 11 15:09 newFile.txt
drwxrwxr-x 3 whb whb 4096 Jan 11 15:26 path1

[whb@bite-alicloud test]$ rm dir
rm: cannot remove 'dir': Is a directory  # 直接删除目录会报错

[whb@bite-alicloud test]$ rm -r dir      # 使用 -r 选项递归删除
[whb@bite-alicloud test]$ ll
total 4
-rw-rw-r-- 1 whb whb    0 Jan 11 15:09 newFile.txt
drwxrwxr-x 3 whb whb 4096 Jan 11 15:26 path1

# 29-38行：交互式删除文件
[whb@bite-alicloud test]$ ll
total 4
-rw-rw-r-- 1 whb whb    0 Jan 11 15:09 newFile.txt
drwxrwxr-x 3 whb whb 4096 Jan 11 15:26 path1

[whb@bite-alicloud test]$ rm -i newFile.txt
rm: remove regular empty file 'newFile.txt'? y  # 输入 y 确认

[whb@bite-alicloud test]$ ll
total 0
drwxrwxr-x 3 whb whb 4096 Jan 11 15:26 path1

# 43-61行：递归交互式删除目录
[whb@bite-alicloud test]$ mkdir -p d/d/d/d
[whb@bite-alicloud test]$ tree d
d
└── d
    └── d
        └── d

3 directories, 0 files

[whb@bite-alicloud test]$ rm -ri d
rm: descend into directory 'd'? y           # 是否进入目录 d？
rm: descend into directory 'd/d'? y         # 是否进入目录 d/d？
rm: descend into directory 'd/d/d'? y       # 是否进入目录 d/d/d？
rm: remove directory 'd/d/d/d'? y           # 是否删除目录 d/d/d/d？
rm: remove directory 'd/d/d'? y             # 是否删除目录 d/d/d？
rm: remove directory 'd/d'? y               # 是否删除目录 d/d？
rm: remove directory 'd'? y                 # 是否删除目录 d？

[whb@bite-alicloud test]$ ll
total 0  # 所有内容已删除

# 63-75行：强制递归删除非空目录
[whb@bite-alicloud test]$ tree path1/
path1/
├── myfile.txt
└── path2
    └── myfile.txt

1 directory, 2 files

[whb@bite-alicloud test]$ rm -f path1
rm: cannot remove 'path1': Is a directory  # -f 不能删除目录

[whb@bite-alicloud test]$ rm -rf path1      # 需要 -r 选项
[whb@bite-alicloud test]$ ll
total 0
```

# `man` 命令 - 查看帮助手册

**语法**：`man [选项] 命令`
**功能**：查看Linux命令、系统调用、库函数等的帮助手册
**常用选项**：
- `-k`：根据关键字搜索联机帮助
- `-f`：显示命令的简短描述
- `-a`：显示所有章节的手册
- `数字`：指定手册章节号

## 手册章节说明
Linux的man手册分为9个章节（不同系统可能略有差异）：

| 章节    | 内容说明        | 示例                          |
| ----- | ----------- | --------------------------- |
| **1** | 普通命令和可执行程序  | `man ls`, `man cp`          |
| **2** | 系统调用（内核函数）  | `man open`, `man read`      |
| **3** | 库函数（C语言函数库） | `man printf`, `man fopen`   |
| **4** | 特殊文件（设备文件）  | `man null`, `man zero`      |
| **5** | 文件格式和约定     | `man passwd`, `man hosts`   |
| **6** | 游戏和娱乐       | 游戏程序说明                      |
| **7** | 杂项（变量、宏包等）  | `man environ`, `man signal` |
| **8** | 系统管理命令      | `man ifconfig`, `man mount` |
| **9** | 内核例程（非标准）   | 内核相关文档                      |
## 使用示例
```cpp
# 1. 查看printf命令（第1章）
[whb@bite-alicloud test]$ man printf  # 查看printf命令

# 2. 查看系统调用fork（自动查找第2章）
[whb@bite-alicloud test]$ man fork    # 自动到第2章查找

# 3. 指定查看第2章的系统调用fork
[whb@bite-alicloud test]$ man 2 fork  # 明确指定第2章

# 4. 查看C库函数printf（第3章）
[whb@bite-alicloud test]$ man 3 printf

# 5. 查看环境变量（第7章）
[whb@bite-alicloud test]$ man 7 environ
[whb@bite-alicloud test]$ man 7 signal

# 6. 查看man命令自身
[whb@bite-alicloud test]$ man man

# 7. 搜索包含特定关键字的命令
[whb@bite-alicloud test]$ man -k "copy"
[whb@bite-alicloud test]$ apropos "copy"  # 等同于 man -k

# 8. 显示命令的简短描述
[whb@bite-alicloud test]$ whatis ls
[whb@bite-alicloud test]$ man -f ls       # 等同于 whatis

# 9. 显示所有章节的printf
[whb@bite-alicloud test]$ man -a printf
# 按q退出当前章节，会自动进入下一章节

# 10. 查看手册所在位置
[whb@bite-alicloud test]$ whereis man
man: /usr/bin/man /usr/share/man

# 11. 搜索man手册内容
在man页面中：
  /关键词    # 向前搜索（向下）
  ?关键词    # 向后搜索（向上）
  n         # 查找下一个匹配项
  N         # 查找上一个匹配项
```
## man页面操作快捷键
在man页面中可以使用以下快捷键：

| 快捷键                    | 功能         |
| ---------------------- | ---------- |
| **空格键** 或 **PageDown** | 向下翻一页      |
| **b** 或 **PageUp**     | 向上翻一页      |
| **回车键** 或 **↓**        | 向下翻一行      |
| **↑**                  | 向上翻一行      |
| **/** + 关键词            | 向下搜索关键词    |
| **?** + 关键词            | 向上搜索关键词    |
| **n**                  | 跳转到下一个匹配项  |
| **N**                  | 跳转到上一个匹配项  |
| **g**                  | 跳转到首页      |
| **G**                  | 跳转到末页      |
| **q**                  | 退出man页面    |
| **h**                  | 查看man页面的帮助 |
## 其他帮助命令
```cpp
# 1. info命令（更详细的帮助）
[whb@bite-alicloud test]$ info ls

# 2. --help选项（快速帮助）
[whb@bite-alicloud test]$ ls --help
[whb@bite-alicloud test]$ cp --help

# 3. help命令（shell内置命令帮助）
[whb@bite-alicloud test]$ help cd
[whb@bite-alicloud test]$ help echo

# 4. 查看命令类型
[whb@bite-alicloud test]$ type ls
ls is aliased to `ls --color=auto'

[whb@bite-alicloud test]$ type cd
cd is a shell builtin  # shell内置命令

[whb@bite-alicloud test]$ type man
man is /usr/bin/man    # 外部命令
```

# `cp` 命令 - 复制文件或目录

**语法**：`cp [选项] 源文件或目录 目标文件或目录`
**功能**：复制文件或目录
**常用选项**：
- `-f` 或 `--force`：强制复制，覆盖目标文件（不提示）
- `-i` 或 `--interactive`：覆盖前询问用户
- `-r` 或 `-R`：递归复制目录及其内容
- `-p`：保留源文件的属性（权限、时间戳等）
- `-a`：归档模式，相当于 `-dR --preserve=all`
- `-v`：显示复制过程
- `-u`：只复制源文件中更新时间较新的文件
```cpp
# 1. 复制单个文件
echo "你好比特就业课" > myfile.txt
cp myfile.txt myfile-backup.txt

# 2. 复制多个文件到目录
mkdir dir
cp *.txt dir    # 使用通配符*匹配所有.txt文件

# 3. 覆盖文件测试
echo "hello bite tech" > myfile.txt
cp myfile.txt myfile-backup.txt  # 直接覆盖

# 4. 交互式覆盖
cp -i myfile.txt myfile-backup.txt

# 5. 递归强制复制整个目录
tree test/      # 查看目录结构
cp -rf test test-backup

# 6. 保留属性复制
cp -p source.txt dest.txt
```

# mv 命令 - 移动/重命名

**语法**：`mv [选项] 源文件或目录 目标文件或目录`
**功能**：移动文件或目录，也可用于重命名
**常用选项**：

- `-f`：强制移动，覆盖时不提示
- `-i`：覆盖前询问确认
- `-v`：显示移动过程
- `-n`：不覆盖已存在的文件
- `-u`：只移动更新时间较新的文件
- `--backup`：为已存在的目标文件创建备份
- `-b`：类似 `--backup` 但不接受参数

```cpp
# 1. 重命名文件
touch oldname.txt
mv oldname.txt newname.txt

# 2. 移动文件到目录
mkdir target_dir
mv newname.txt target_dir/

# 3. 交互式移动（覆盖前询问）
touch file1.txt file2.txt
mv -i file1.txt file2.txt
# 输出：mv: overwrite 'file2.txt'?

# 4. 强制移动（直接覆盖）
mv -f file1.txt file2.txt

# 5. 显示移动过程
mv -v file2.txt file3.txt
# 输出：renamed 'file2.txt' -> 'file3.txt'

# 6. 不覆盖已存在文件
touch existing.txt
mv -n newfile.txt existing.txt  # 不会覆盖

# 7. 只移动较新文件
touch oldfile
sleep 2
echo "new" > newfile
mv -u newfile oldfile  # 会移动，因为newfile更新

# 8. 创建备份后再移动
touch target.txt
mv --backup=numbered source.txt target.txt
# 如果target.txt已存在，会创建target.txt.~1~备份

# 9. 批量移动文件
touch file1.txt file2.txt file3.txt
mkdir backup
mv file*.txt backup/

# 10. 移动并重命名目录
mkdir olddir
mv olddir newdir

# 11. 移动隐藏文件
mv .hiddenfile .config/

# 12. 使用通配符移动
mv *.jpg images/
mv 2024*.pdf documents/2024/
```

# **cp 命令 - 复制文件/目录**

**语法**：`cp [选项] 源文件或目录 目标文件或目录`
**功能**：复制文件或目录
**常用选项**：

- `-f` 或 `--force`：强制复制，覆盖目标文件（不提示）
- `-i` 或 `--interactive`：覆盖前询问用户
- `-r` 或 `-R`：递归复制目录及其内容
- `-p`：保留源文件的属性（权限、时间戳等）
- `-a`：归档模式，相当于 `-dR --preserve=all`
- `-v`：显示复制过程
- `-u`：只复制源文件中更新时间较新的文件
- `-l`：创建硬链接而非复制
- `-s`：创建符号链接（软链接）
- `--backup`：覆盖前创建备份

```cpp
# 1. 基本文件复制
echo "Hello Linux" > file1.txt
cp file1.txt file2.txt

# 2. 复制时询问确认（覆盖前）
cp -i file1.txt file2.txt
# 输出：cp: overwrite 'file2.txt'?

# 3. 强制复制（不询问）
cp -f file1.txt file2.txt

# 4. 递归复制整个目录
mkdir dir1
echo "test" > dir1/file.txt
cp -r dir1 dir2

# 5. 保留文件属性的复制
cp -p file1.txt file3.txt
ls -l file1.txt file3.txt  # 查看权限和时间是否一致

# 6. 归档模式复制（常用于备份）
cp -a dir1 dir1_backup

# 7. 详细模式显示复制过程
cp -v file1.txt file4.txt
# 输出：'file1.txt' -> 'file4.txt'

# 8. 只复制更新文件
touch oldfile  # 创建旧文件
sleep 2
echo "new content" > newfile  # 创建新文件
cp -u newfile oldfile  # 只有newfile比oldfile新时才复制

# 9. 创建硬链接
cp -l source.txt hardlink.txt

# 10. 创建符号链接
cp -s source.txt symlink.txt

# 11. 复制前创建备份
touch target.txt
cp --backup=numbered source.txt target.txt
# 如果target.txt已存在，会创建target.txt.~1~备份

# 12. 复制多个文件到目录
cp file1.txt file2.txt file3.txt destination/

# 13. 使用通配符复制
cp *.txt text_files/
cp image*.jpg photos/

# 14. 复制时保持目录结构
cp --parents dir1/subdir/file.txt backup/
# 会在backup中创建dir1/subdir/目录结构
```

# **cat 命令 - 查看/创建文件**

**语法**：`cat [选项] [文件...]`
**功能**：连接文件并打印到标准输出，也可用于创建文件
**常用选项**：

- `-n`：对所有行编号
- `-b`：对非空行编号
- `-s`：压缩连续空行为一行
- `-E`：在每行末尾显示$
- `-T`：将Tab显示为^I
- `-A`：相当于 `-vET`
- `-v`：显示非打印字符（除了Tab和换行符）
```cpp
# 1. 查看文件内容
echo -e "Line 1\nLine 2\nLine 3" > test.txt
cat test.txt

# 2. 查看多个文件
echo "File1 Content" > file1.txt
echo "File2 Content" > file2.txt
cat file1.txt file2.txt

# 3. 带行号显示
cat -n test.txt
# 输出：
#     1  Line 1
#     2  Line 2
#     3  Line 3

# 4. 只对非空行编号
echo -e "Line 1\n\nLine 3" > test2.txt
cat -b test2.txt
# 输出：
#     1  Line 1
#    
#     2  Line 3

# 5. 压缩空行
echo -e "Line 1\n\n\nLine 2" > test3.txt
cat -s test3.txt
# 输出：
# Line 1
# 
# Line 2

# 6. 显示行尾和Tab
echo -e "Line with tab:\ttext" > test4.txt
cat -A test4.txt
# 输出：Line with tab:^Itext$

# 7. 创建新文件（EOF结束）
cat > newfile.txt << EOF
This is line 1
This is line 2
This is line 3
EOF

# 8. 追加内容到文件
cat >> newfile.txt << EOF
This is appended line
EOF

# 9. 合并多个文件
cat file1.txt file2.txt > combined.txt

# 10. 显示文件内容并添加行号
cat -n /etc/passwd | head -20

# 11. 创建脚本文件
cat > myscript.sh << 'EOF'
#!/bin/bash
echo "Hello World"
date
EOF

# 12. 查看二进制文件（显示控制字符）
cat -v /bin/ls | head -20

# 13. 管道中使用cat
cat test.txt | grep "Line"
cat *.log | sort | uniq

# 14. 显示文件并分页
cat longfile.txt | less
cat longfile.txt | more
```

# **more 命令 - 分页显示**

**语法**：`more [选项] [文件...]`
**功能**：分页显示文件内容（只能向前翻页）
**常用选项**：

- `-d`：显示提示信息
- `-f`：计算行数时以实际行数为准
- `-l`：不处理换页符
- `-p`：不滚屏，清屏后显示
- `-s`：将多个空行压缩为一行
- `-u`：不显示下划线
- `+行号`：从指定行开始显示
- `+/模式`：从匹配模式的第一行开始显示

```cpp
# 1. 基本分页显示
more /etc/passwd

# 2. 从第50行开始显示
more +50 /var/log/syslog

# 3. 搜索并显示
more +/error /var/log/syslog

# 4. 显示提示信息
more -d large_file.txt
# 底部显示：--More--(XX%)[Press space to continue, 'q' to quit.]

# 5. 压缩空行显示
echo -e "Line 1\n\n\nLine 2" > test.txt
more -s test.txt

# 6. 查看多个文件
more file1.txt file2.txt

# 7. 管道中使用more
ps aux | more
ls -la /etc | more

# 8. 清屏后显示
more -p config_file.txt

# 9. more常用操作键：
# 空格键：向下翻一页
# Enter键：向下翻一行
# =：显示当前行号
# :f：显示文件名和当前行号
# /pattern：搜索指定模式
# n：重复上次搜索
# q：退出
# :n：切换到下一个文件
# :p：切换到上一个文件

# 10. 显示行号（需要配合其他命令）
cat -n file.txt | more

# 11. 监控日志变化（配合tail）
tail -f logfile.txt | more
```

# **less 命令 - 高级分页显示**

**语法**：`less [选项] [文件...]`
**功能**：分页显示文件内容（可向前向后翻页）
**常用选项**：

- `-N`：显示行号
- `-i`：搜索时忽略大小写
- `-S`：截断长行（不自动换行）
- `-r`：显示控制字符
- `-m`：显示百分比
- `-M`：显示更详细的状态行
- `-F`：如果文件能在一屏显示完则自动退出
- `-X`：退出时不清理屏幕
- `-R`：正确处理ANSI颜色代码
- `-w`：高亮显示第一个匹配项

```cpp
# 1. 基本使用
less /var/log/syslog

# 2. 显示行号
less -N /etc/passwd

# 3. 忽略大小写搜索
less -i large_file.txt
# 在less中输入：/error  # 会匹配ERROR、Error、error等

# 4. 不换行长行（适合看日志）
less -S /var/log/kern.log

# 5. 保持ANSI颜色
ls --color=always | less -R

# 6. 显示控制字符
echo -e "Line with\ttab and\nnewline" | less -r

# 7. 查看压缩文件
less file.gz  # less可以自动解压查看
less file.bz2

# 8. less常用操作命令：
# 空格/f：向下翻一页
# b：向上翻一页
# j/↓：向下滚动一行
# k/↑：向上滚动一行
# g：跳到文件开头
# G：跳到文件末尾
# /pattern：向下搜索
# ?pattern：向上搜索
# n：重复上一次搜索
# N：反向重复搜索
# :n：切换到下一个文件
# :p：切换到上一个文件
# F：实时跟踪文件（类似tail -f）
# v：用默认编辑器编辑当前文件
# h：显示帮助
# q：退出

# 9. 管道中使用
history | less
dmesg | less -S

# 10. 查看多个文件
less file1.txt file2.txt file3.txt

# 11. 从中间开始查看
less +100p large_file.txt  # 从第100行开始
less +/ERROR logfile.txt   # 从第一个ERROR开始

# 12. 标记位置
# ma：用a标记当前位置
# 'a：跳转到标记a的位置

# 13. 实时监控日志
less +F /var/log/nginx/access.log
# 按Ctrl+C退出监控模式，再按F重新进入

# 14. 结合grep高亮搜索
less -p "error\|warning" logfile.txt
```

# **head 命令 - 显示文件头部**

**语法**：`head [选项] [文件...]`
**功能**：显示文件开头部分内容
**常用选项**：

- `-n <行数>`：显示指定行数
- `-c <字节数>`：显示指定字节数
- `-q`：不显示文件名（静默模式）
- `-v`：总是显示文件名
- `-z`：以NUL字符分隔而不是换行符
```cpp
# 1. 显示前10行（默认）
head /etc/passwd

# 2. 显示前5行
head -n 5 /etc/passwd
# 或简写：head -5 /etc/passwd

# 3. 显示前100字节
head -c 100 /etc/passwd

# 4. 显示多个文件（默认显示文件名）
head -3 file1.txt file2.txt
# 输出：
# ==> file1.txt <==
# content...
# ==> file2.txt <==
# content...

# 5. 静默模式（不显示文件名）
head -q -3 file1.txt file2.txt

# 6. 总是显示文件名
head -v -3 file1.txt

# 7. 管道中使用
ls /usr/bin | head -20
ps aux | head -15

# 8. 显示前50个字符
echo "This is a long sentence for testing head command" | head -c 50

# 9. 显示除最后N行外的所有行
head -n -5 file.txt  # 显示除了最后5行的所有行

# 10. 结合其他命令使用
head -n 100 large_file.txt | grep "pattern"
head -c 1K binary_file.bin | hexdump -C

# 11. 查看配置文件开头
head -20 /etc/nginx/nginx.conf

# 12. 批量处理多个文件
for file in *.log; do
    echo "=== First 5 lines of $file ==="
    head -5 "$file"
done

# 13. 创建测试文件的前缀
head -1000 large_data.csv > sample_data.csv
```

# **tail 命令 - 显示文件尾部**

**语法**：`tail [选项] [文件...]`
**功能**：显示文件末尾部分内容
**常用选项**：

- `-n <行数>`：显示末尾指定行数
- `-c <字节数>`：显示末尾指定字节数
- `-f`：实时跟踪文件变化
- `-F`：跟踪文件变化（文件重命名后仍能跟踪）
- `--pid=PID`：与-f合用，当指定进程结束时停止跟踪
- `-q`：不显示文件名
- `-v`：总是显示文件名
- `-s <秒数>`：与-f合用，指定监视间隔时间
- `--retry`：文件不可访问时重试
- `-z`：以NUL字符分隔行
```cpp
# 1. 显示末尾10行（默认）
tail /var/log/syslog

# 2. 显示末尾5行
tail -n 5 /var/log/syslog
# 或简写：tail -5 /var/log/syslog

# 3. 显示最后100字节
tail -c 100 /var/log/syslog

# 4. 实时监控日志文件
tail -f /var/log/nginx/access.log

# 5. 监控多个日志文件
tail -f /var/log/nginx/access.log /var/log/nginx/error.log

# 6. 智能跟踪（文件被移动或重命名后仍能跟踪）
tail -F /var/log/app.log

# 7. 指定刷新间隔
tail -f -s 2 /var/log/syslog  # 每2秒刷新一次

# 8. 监控直到进程结束
tail -f --pid=1234 /var/log/myapp.log

# 9. 显示文件的一部分（从第80行到末尾）
tail -n +80 large_file.txt

# 10. 静默模式查看多个文件
tail -q -5 file1.log file2.log

# 11. 查看日志文件的最新错误
tail -100 /var/log/syslog | grep -i error

# 12. 实时监控并过滤
tail -f /var/log/auth.log | grep "Failed password"

# 13. 监控日志并高亮显示
tail -f application.log | grep --color=auto -E "ERROR|WARN|FATAL"

# 14. 结合awk处理日志
tail -f /var/log/nginx/access.log | awk '{print $1, $7, $9}'

# 15. 监控并统计
tail -f access.log | awk '{count[$7]++} END {for (url in count) print url, count[url]}'

# 16. 查看最后修改的部分
tail -c 1K binary_file.bin | od -x

# 17. 批量查看日志结尾
for log in /var/log/*.log; do
    echo "=== Last 3 lines of $(basename $log) ==="
    tail -3 "$log"
done

# 18. 重试不可访问的文件
tail --retry -f /tmp/temp.log
```

# **date 命令 - 日期时间操作**

**语法**：`date [选项]... [+格式]`
**功能**：显示或设置系统日期和时间
**常用选项**：

- `-d <字符串>`：显示字符串指定的时间
- `-s <字符串>`：设置系统时间
- `-r <文件>`：显示文件最后修改时间
- `-u`：显示或设置UTC时间
- `--rfc-3339=<FMT>`：以RFC 3339格式输出
- `--iso-8601[=FMT]`：以ISO 8601格式输出
- `-I[TIMESPEC]`：ISO 8601格式的日期/时间
- `--help`：显示帮助信息
- `--version`：显示版本信息

**常用格式符号**
- `%Y`：4位年份（2024）
- `%y`：2位年份（24）
- `%m`：月份（01-12）
- `%d`：日（01-31）
- `%H`：小时（00-23）
- `%M`：分钟（00-59）
- `%S`：秒（00-60）
- `%A`：完整星期名（Monday）
- `%a`：简写星期名（Mon）
- `%B`：完整月份名（January）
- `%b`：简写月份名（Jan）
- `%s`：时间戳（从1970-1-01开始的秒数）
- `%N`：纳秒
- `%z`：时区（+0800）
- `%Z`：时区名称（CST）
- `%j`：一年中的第几天（001-366）
- `%U`：一年中的第几周（周日为一周开始）
- `%W`：一年中的第几周（周一为一周开始）
- `%w`：一周中的第几天（0=周日）

```cpp
# 1. 显示当前日期时间
date
# 输出：Mon Jan 15 14:30:25 CST 2024

# 2. 自定义格式显示
date "+%Y-%m-%d"
# 输出：2024-01-15

date "+%H:%M:%S"
# 输出：14:30:25

date "+%Y-%m-%d %A %H:%M:%S"
# 输出：2024-01-15 Monday 14:30:25

# 3. 显示时间戳
date +%s
# 输出：1705311045

# 4. 时间戳转日期
date -d @1705311045
date -d @1705311045 "+%Y-%m-%d %H:%M:%S"

# 5. 显示相对时间
date -d "now"
date -d "yesterday"
date -d "tomorrow"
date -d "1 day ago"
date -d "2 hours ago"
date -d "3 weeks ago"
date -d "next monday"
date -d "last month"
date -d "next year"

# 6. 时间计算
date -d "2024-12-31 + 10 days"
date -d "2024-01-01 - 2 months"
date -d "2024-01-15 + 1 week - 2 days"

# 7. 设置系统时间（需要root权限）
sudo date -s "2024-01-15 14:30:00"
sudo date -s "14:30:00"
sudo date -s "2024-01-15"
sudo date -s "2 days ago"  # 设置为2天前的时间

# 8. 显示文件修改时间
date -r /etc/passwd
ls -l /etc/passwd  # 对比查看

# 9. 显示UTC时间
date -u
date -u "+%Y-%m-%d %H:%M:%S %Z"

# 10. ISO 8601格式
date --iso-8601
# 输出：2024-01-15
date --iso-8601=seconds
# 输出：2024-01-15T14:30:25+08:00
date -Iseconds
# 输出：2024-01-15T14:30:25+08:00

# 11. RFC 3339格式
date --rfc-3339=seconds
# 输出：2024-01-15 14:30:25+08:00

# 12. 计算日期差
start_date="2024-01-01"
end_date="2024-01-15"
start_seconds=$(date -d "$start_date" +%s)
end_seconds=$(date -d "$end_date" +%s)
echo "Days difference: $(((end_seconds - start_seconds) / 86400))"

# 13. 获取特定日期信息
date -d "2024-12-25" "+%A"  # 查看2024年圣诞节是星期几
date -d "2024-01-01" "+%j"   # 查看元旦是一年中的第几天
```

# **cal 命令 - 日历显示**

**语法**：`cal [选项] [[月份] 年份]`
**功能**：显示公历（阳历）日历
**常用选项**：

- `-3`：显示系统前一个月、当前月、下一个月的月历
- `-j`：显示在当年中的第几天（一年日期按天算，从1月1号算起）
- `-y`：显示当前年份的日历
- `-m`：以星期一作为一周的第一天
- `-1`：只显示当前月份（默认）
- `-s`：以星期日作为一周的第一天（默认）
- `-h`：关闭高亮显示

```cpp
# 1. 显示当前月日历
cal
# 输出：
#    January 2023
# Su Mo Tu We Th Fr Sa
#  1  2  3  4  5  6  7
#  8  9 10 11 12 13 14
# 15 16 17 18 19 20 21
# 22 23 24 25 26 27 28
# 29 30 31

# 2. 显示指定年份
cal 1949
# 显示1949年全年日历

# 3. 显示指定月份和年份
cal 1 2024        # 2024年1月
cal december 2023 # 2023年12月
cal 12 2023       # 同上，用数字表示月份

# 4. 显示前一个月、当前月、下一个月的月历
cal -3
# 输出：
#    December 2022    January 2023   February 2023
# Su Mo Tu We Th Fr Sa Su Mo Tu We Th Fr Sa Su Mo Tu We Th Fr Sa
#              1  2  3  1  2  3  4  5  6  7          1  2  3  4
#  4  5  6  7  8  9 10  8  9 10 11 12 13 14  5  6  7  8  9 10 11
# 11 12 13 14 15 16 17 15 16 17 18 19 20 21 12 13 14 15 16 17 18
# 18 19 20 21 22 23 24 22 23 24 25 26 27 28 19 20 21 22 23 24 25
# 25 26 27 28 29 30 31 29 30 31            26 27 28

# 5. 显示一年中的第几天（儒略日）
cal -j
# 输出：
#     January 2023
#  Su  Mo  Tu  We  Th  Fr  Sa
#   1   2   3   4   5   6   7
#   8   9  10  11  12  13  14
#  15  16  17  18  19  20  21
#  22  23  24  25  26  27  28
#  29  30  31

cal -j 12 2023  # 显示12月每天是当年的第几天

# 6. 显示整年日历
cal -y
# 显示当前年份所有月份的日历

cal -y 2024
# 显示2024年整年日历

# 7. 以星期一作为一周的第一天
cal -m
# 输出：
#    January 2023
# Mo Tu We Th Fr Sa Su
#                    1
#  2  3  4  5  6  7  8
#  9 10 11 12 13 14 15
# 16 17 18 19 20 21 22
# 23 24 25 26 27 28 29
# 30 31

# 8. 组合使用选项
cal -jy  # 显示当前年份的儒略日历
cal -3j  # 显示三个月儒略日历

# 9. 查看特定日期是周几
cal 10 2023 | grep -E "^(Su|Mo|Tu|We|Th|Fr|Sa| *[0-9])" | grep -w "17"
# 查看2023年10月17日是星期几

# 10. 计算某月有多少天
cal 2 2024 | grep -v "^$" | tail -1 | wc -w
# 计算2024年2月有多少天

# 11. 显示复活节日期（西方节日）
ncal -e 2024
# 输出：2024-03-31

# 12. 显示所有节日（需要ncal）
ncal -o 2024
# 显示2024年所有官方节日

# 13. 高亮显示今天
cal -h
# 今天会高亮显示（如果终端支持）

# 14. 查看历史重要日期
echo "中华人民共和国成立日期："
cal 10 1949

echo "Linux首次发布日期："
cal 8 1991
```

# **find 命令 - 文件查找**

**语法**：`find [路径] [选项] [操作]`
**功能**：在目录树中查找文件，并执行指定操作
**常用选项**：

- `-name`：按文件名查找（支持通配符）
- `-iname`：按文件名查找（不区分大小写）
- `-type`：按文件类型查找（f=普通文件，d=目录，l=符号链接）
- `-size`：按文件大小查找
- `-mtime`：按修改时间查找
- `-atime`：按访问时间查找
- `-ctime`：按状态改变时间查找
- `-user`：按文件属主查找
- `-group`：按文件属组查找
- `-perm`：按文件权限查找
- `-maxdepth`：最大搜索深度
- `-mindepth`：最小搜索深度
- `-exec`：对找到的文件执行命令
- `-print`：打印找到的文件路径（默认）
- `-delete`：删除找到的文件
- `-empty`：查找空文件或空目录

```cpp
# 1. 按文件名查找（当前目录及子目录）
find . -name "test.c"
# 输出：
# ./test_code/old_code/test.c
# ./test_code/test.c

# 2. 在家目录中查找
find ~ -name "*.txt"

# 3. 使用通配符
find . -name "*.log"
find . -name "file[0-9].txt"
find . -name "config.???"

# 4. 不区分大小写查找
find . -iname "README"

# 5. 按文件类型查找
find . -type f           # 只找普通文件
find . -type d           # 只找目录
find . -type l           # 只找符号链接
find . -type f -name "*.sh"  # 组合使用

# 6. 按文件大小查找
find . -size +100M       # 大于100MB的文件
find . -size -10k        # 小于10KB的文件
find . -size 1G          # 等于1GB的文件
find . -size +500M -size -1G  # 500MB到1GB之间的文件

# 大小单位：
# c: bytes
# k: kilobytes (1024 bytes)
# M: megabytes (1024 kilobytes)
# G: gigabytes (1024 megabytes)

# 7. 按时间查找
find . -mtime -7         # 7天内修改的文件
find . -mtime +30        # 30天前修改的文件
find . -atime -1         # 1天内访问的文件
find . -ctime +60        # 60天前状态改变的文件

# 8. 按用户和组查找
find . -user whb         # 属于用户whb的文件
find . -group users      # 属于组users的文件
find . -nouser           # 没有属主的文件
find . -nogroup          # 没有属组的文件

# 9. 按权限查找
find . -perm 644         # 权限正好是644的文件
find . -perm -644        # 权限包含644的文件
find . -perm /222        # 任何人可写的文件
find . -perm -u=x        # 属主可执行的文件

# 10. 控制搜索深度
find . -maxdepth 1 -name "*.txt"  # 只在当前目录查找
find . -mindepth 2 -maxdepth 4 -name "*.c"  # 深度2-4层

# 11. 查找空文件和空目录
find . -empty            # 空文件或空目录
find . -type f -empty    # 空文件
find . -type d -empty    # 空目录

# 12. 逻辑操作
find . -name "*.c" -o -name "*.h"     # 查找.c或.h文件
find . -name "*.txt" -a -size +1k     # 查找大于1k的txt文件
find . ! -name "*.log"                # 排除log文件
find . \( -name "*.c" -o -name "*.h" \) -type f

# 13. 对找到的文件执行命令（-exec）
# 查找并显示详细信息
find . -name "*.c" -exec ls -l {} \;

# 查找并复制
find . -name "*.bak" -exec cp {} /backup/ \;

# 查找并删除
find . -name "*.tmp" -delete
find . -name "core" -exec rm -f {} \;

# 查找并更改权限
find . -name "*.sh" -exec chmod +x {} \;

# 14. 查找并打包
find . -name "*.log" -exec tar -czf logs.tar.gz {} +

# 15. 查找最近修改的文件
find . -type f -printf '%T+ %p\n' | sort -r | head -10

# 16. 查找大文件
find / -type f -size +100M 2>/dev/null | head -20

# 17. 查找硬链接
find . -type f -links +1

# 18. 查找并计算MD5
find . -type f -name "*.iso" -exec md5sum {} \;

# 19. 查找符号链接
find . -type l -exec ls -l {} \;

# 20. 查找SUID/SGID文件
find / -type f \( -perm -4000 -o -perm -2000 \) 2>/dev/null

# 21. 查找可执行文件
find . -type f -executable

# 22. 查找并统计
find . -name "*.py" | wc -l
find . -type f -name "*.jpg" -exec du -ch {} + | tail -1

# 23. 查找特定内容的文件
find . -type f -name "*.txt" -exec grep -l "error" {} \;

# 24. 查找并备份
find /home -name "*.doc" -mtime -7 -exec cp {} /backup/ \;

# 25. 查找重复文件（基于大小）
find . -type f -printf "%s %p\n" | sort -n | uniq -D -w 12

# 26. 使用xargs配合find
find . -name "*.tmp" -print0 | xargs -0 rm
find . -name "*.jpg" | xargs -I {} cp {} /images/

# 27. 查找并排序
find . -type f -name "*.log" | sort

# 28. 排除某些目录
find . -type f -not -path "./tmp/*" -not -path "./log/*"

# 29. 查找并重命名
find . -name "*.htm" -exec bash -c 'mv "$1" "${1%.htm}.html"' _ {} \;

# 30. 复杂组合示例
# 查找7天内修改的、大于1M的图片文件
find . -type f \( -name "*.jpg" -o -name "*.png" \) \
       -size +1M \
       -mtime -7 \
       -exec ls -lh {} \;
```

# stat 命令 - 显示文件状态信息

**语法**：`stat 文件名`
**功能**:   显示文件或目录的详细状态信息（元数据）
```bash
kiana@hcss-ecs-1848:~$ stat 111
  File: 111
  Size: 138       	Blocks: 8          IO Block: 4096   regular file
Device: fc01h/64513d	Inode: 402278      Links: 1
Access: (0660/-rw-rw----)  Uid: ( 1000/   kiana)   Gid: ( 1000/   kiana)
Access: 2026-01-17 16:51:19.151773316 +0800
Modify: 2026-01-17 16:51:14.404244599 +0800
Change: 2026-01-17 16:51:14.404244599 +0800
 Birth: 2026-01-17 16:51:14.404244599 +0800
kiana@hcss-ecs-1848:~$ ^C
kiana@hcss-ecs-1848:~$ 
```

# **which 命令** - 显示命令的完整路径

**语法**：`which [选项] 命令名`

**功能**：在 PATH 环境变量指定的路径中搜索某个命令的位置，返回该命令的完整路径

**常用选项**：

- `-a`：列出所有匹配的命令路径（默认只显示第一个）

- `--skip-alias`：忽略别名，只显示命令本身

- `--show-tilde`：输出时使用波浪号表示用户主目录

- `--version`：显示版本信息

- `--help`：显示帮助信息

**示例**：
```bash
# 1. 查找命令路径
which ls
# 输出：/usr/bin/ls

# 2. 查找多个命令
which ls cp mv
# 输出：
# /usr/bin/ls
# /usr/bin/cp
# /usr/bin/mv

# 3. 查找所有匹配的命令路径
which -a python
# 输出：
# /usr/bin/python
# /usr/local/bin/python

# 4. 查找但不显示别名
which --skip-alias ll
```

# **whereis 命令** - 定位命令的二进制文件、源代码和手册页

**语法**：`whereis [选项] 命令名`

**功能**：在标准系统路径中搜索指定命令的二进制文件、源代码文件以及手册页的位置

**常用选项**：

- `-b`：只搜索二进制文件（可执行文件）

- `-m`：只搜索手册页（man pages）

- `-s`：只搜索源代码文件

- `-u`：显示没有指定类型文件的命令

- `-B`：指定搜索二进制文件的路径（需配合 `-b` 使用）

- `-M`：指定搜索手册页的路径（需配合 `-m` 使用）

- `-S`：指定搜索源代码的路径（需配合 `-s` 使用）

- `-l`：列出 whereis 搜索的路径

**示例**：
```bash
# 1. 查找命令的所有相关信息
whereis ls
# 输出：ls: /usr/bin/ls /usr/share/man/man1/ls.1.gz

# 2. 只查找二进制文件
whereis -b ls
# 输出：ls: /usr/bin/ls

# 3. 只查找手册页
whereis -m ls
# 输出：ls: /usr/share/man/man1/ls.1.gz

# 4. 查找多个命令
whereis ls cp
# 输出：
# ls: /usr/bin/ls /usr/share/man/man1/ls.1.gz
# cp: /usr/bin/cp /usr/share/man/man1/cp.1.gz

# 5. 显示 whereis 搜索的路径列表
whereis -l
```

# **zip 命令** - 压缩文件或目录

**语法**：`zip [选项] 压缩包名称 要压缩的文件或目录`

**功能**：将文件或目录打包并压缩为 `.zip` 格式的归档文件（支持压缩算法）

**常用选项**：

- `-r`：递归压缩目录及其子目录中的所有文件

- `-q`：安静模式，不显示压缩过程

- `-v`：详细模式，显示压缩过程和统计信息

- `-d`：从压缩包中删除指定文件

- `-u`：更新压缩包（添加新文件或更新已修改的文件）

- `-m`：移动文件到压缩包（压缩后删除原文件）

- `-e`：加密压缩包（压缩时提示输入密码）

- `-P`：使用密码加密压缩包（后接密码，安全性较低）

- `-x`：排除指定文件或目录

- `-9`：使用最大压缩率（数值范围 0-9，0 表示仅存储不压缩）

- `-j`：不存储目录路径（只存储文件名）

**示例**：
```bash
# 1. 压缩单个文件
zip file.zip file1.txt

# 2. 压缩多个文件
zip archive.zip file1.txt file2.txt file3.txt

# 3. 递归压缩整个目录
zip -r dir.zip dir1/

# 4. 压缩时显示详细信息
zip -v archive.zip file1.txt

# 5. 安静模式压缩（不显示输出）
zip -rq dir.zip dir1/

# 6. 使用密码加密压缩
zip -e secure.zip file1.txt
# 输出：Enter password:
#       Verify password:

# 7. 使用密码加密压缩（命令行指定）
zip -P 123456 secure.zip file1.txt

# 8. 更新压缩包中的文件
zip -u archive.zip file1.txt

# 9. 从压缩包中删除文件
zip -d archive.zip file2.txt

# 10. 排除特定文件
zip -r dir.zip dir1/ -x "*.log"

# 11. 最大压缩率压缩
zip -9r dir.zip dir1/

# 12. 不存储目录路径
zip -j file.zip dir1/file1.txt
```

# **unzip 命令** - 解压 .zip 格式的压缩文件

**语法**：`unzip [选项] 压缩包文件 [-d 目标目录]`

**功能**：解压 `.zip` 格式的压缩文件，提取其中的文件或目录

**常用选项**：

- `-d`：指定解压目标目录（不指定则解压到当前目录）

- `-l`：列出压缩包中的文件列表（不解压）

- `-v`：显示详细信息（包括压缩率、文件大小等）

- `-q`：安静模式，不显示解压过程

- `-o`：覆盖已存在的文件（不提示）

- `-n`：不覆盖已存在的文件

- `-f`：只解压比现有文件更新的文件

- `-x`：排除指定的文件或目录不解压

- `-P`：使用密码解密加密的压缩包

- `-t`：测试压缩包是否完整（不解压）

- `-j`：忽略压缩包中的目录结构（将所有文件解压到同一目录）

- `-Z`：查看压缩包信息（相当于 `zipinfo` 命令）

**示例**：
```bash
# 1. 解压到当前目录
unzip archive.zip

# 2. 解压到指定目录
unzip archive.zip -d /path/to/directory

# 3. 创建指定目录并解压（如果目录不存在会自动创建）
unzip archive.zip -d target_dir/

# 4. 列出压缩包内容（不解压）
unzip -l archive.zip
# 输出：
# Archive:  archive.zip
#   Length      Date    Time    Name
# ---------  ---------- -----   ----
#       12  2024-01-15 10:30   file1.txt
#       24  2024-01-15 10:31   dir1/file2.txt

# 5. 显示详细信息
unzip -v archive.zip

# 6. 安静模式解压（不显示输出）
unzip -q archive.zip

# 7. 覆盖已存在文件（不提示）
unzip -o archive.zip

# 8. 不覆盖已存在文件
unzip -n archive.zip

# 9. 测试压缩包完整性
unzip -t archive.zip
# 输出：No errors detected in compressed data

# 10. 解压加密的压缩包
unzip -P 123456 secure.zip

# 11. 解压时排除指定文件
unzip archive.zip -x "*.log"

# 12. 忽略目录结构（所有文件解压到同一目录）
unzip -j archive.zip -d flat_dir/

# 13. 只解压指定文件
unzip archive.zip file1.txt

# 14. 查看压缩包信息（不包含详细文件列表）
unzip -Z archive.zip
```

# **tar 命令** - 打包/解包文件（磁带归档工具）

**语法**：`tar [选项] [归档文件名] [要打包的文件或目录]`

**功能**：将多个文件或目录打包成一个归档文件（.tar），常与压缩工具结合使用，支持多种压缩格式（gzip、bzip2、xz 等）

**常用选项**：

**主要操作（必须指定一个）**：

- `-c`：创建新的归档文件（打包）

- `-x`：解包归档文件

- `-t`：列出归档文件中的内容

- `-r`：向归档文件末尾追加文件

- `-u`：更新归档文件（只添加比归档中更新的文件）

**压缩选项**：

- `-z`：通过 gzip 压缩/解压（.tar.gz 或 .tgz）

- `-j`：通过 bzip2 压缩/解压（.tar.bz2 或 .tbz2）

- `-J`：通过 xz 压缩/解压（.tar.xz）

**其他常用选项**：

- `-f`：指定归档文件名（必须使用，后接文件名）

- `-v`：显示详细处理过程

- `-C`：指定解压目标目录

- `-p`：保留文件权限和属性

- `--exclude`：排除指定文件或目录

- `-P`：使用绝对路径（不截断路径名）

- `--wildcards`：使用通配符匹配

**示例**
```bash
# 1. 创建 tar 包（不压缩）
tar -cvf archive.tar file1.txt dir1/

# 2. 创建 gzip 压缩包（.tar.gz）
tar -czvf archive.tar.gz file1.txt dir1/

# 3. 创建 bzip2 压缩包（.tar.bz2）
tar -cjvf archive.tar.bz2 file1.txt dir1/

# 4. 创建 xz 压缩包（.tar.xz）
tar -cJvf archive.tar.xz file1.txt dir1/

# 5. 解压 tar 包到当前目录
tar -xvf archive.tar

# 6. 解压 tar.gz 包
tar -xzvf archive.tar.gz

# 7. 解压到指定目录
tar -xzvf archive.tar.gz -C /path/to/directory

# 8. 列出归档内容（不解压）
tar -tvf archive.tar.gz

# 9. 解压单个文件
tar -xzvf archive.tar.gz file1.txt

# 10. 解压多个指定文件
tar -xzvf archive.tar.gz file1.txt dir1/file2.txt

# 11. 使用通配符解压
tar -xzvf archive.tar.gz --wildcards "*.txt"

# 12. 打包时排除特定文件
tar -czvf archive.tar.gz dir1/ --exclude="*.log" --exclude="temp/"

# 13. 打包时排除多个模式
tar -czvf archive.tar.gz dir1/ --exclude={*.log,*.tmp,backup/}

# 14. 追加文件到已有归档
tar -rvf archive.tar newfile.txt

# 15. 保留文件权限和属性
tar -czvpf archive.tar.gz dir1/

# 16. 打包时去除第一个目录前缀
tar -czvf archive.tar.gz --transform='s/^dir1\///' dir1/

# 17. 查看 tar 包大小
tar -czvf archive.tar.gz dir1/ | wc -c
```
**常见压缩格式对比**：

|扩展名|压缩方式|创建命令|解压命令|
|---|---|---|---|
|.tar|无压缩|`tar -cvf`|`tar -xvf`|
|.tar.gz / .tgz|gzip|`tar -czvf`|`tar -xzvf`|
|.tar.bz2 / .tbz2|bzip2|`tar -cjvf`|`tar -xjvf`|
|.tar.xz|xz|`tar -cJvf`|`tar -xJvf`|

**快速记忆**：

- `tar -czvf` = **c**reate + **z** (gzip) + **v**erbose + **f**ile → 创建压缩包

- `tar -xzvf` = e**x**tract + **z** (gzip) + **v**erbose + **f**ile → 解压文件

- `tar -tvf` = **t**est + **v**erbose + **f**ile → 查看内容

# **scp 命令** - 远程安全复制（基于 SSH）

**语法**：`scp [选项] [源文件或目录] [目标文件或目录]`

**功能**：通过 SSH 协议在本地和远程主机之间安全地复制文件或目录，支持加密传输，是 cp 命令的跨网络版本

**常用选项**：

- `-r`：递归复制整个目录

- `-P`：指定远程主机的 SSH 端口（大写 P，默认 22）

- `-p`：保留源文件的属性（权限、时间戳等）（小写 p）

- `-q`：安静模式，不显示传输进度和 SSH 警告

- `-v`：详细模式，显示调试信息（用于排查问题）

- `-C`：传输时启用压缩

- `-i`：指定身份验证的私钥文件

- `-l`：限制传输带宽（单位：Kbit/s）

- `-o`：传递 SSH 选项（如 `-o ConnectTimeout=10`）

- `-3`：通过本地主机在两个远程主机间复制

- `-F`：指定 SSH 配置文件

**格式说明**：

- 本地路径：直接使用路径，如 `/home/user/file.txt` 或 `./file.txt`

- 远程路径：`[用户名@]主机地址:文件路径`

- 远程路径省略用户名时使用当前本地用户名

**示例**：
```bash
# 1. 本地文件复制到远程主机
scp file.txt user@192.168.1.100:/home/user/

# 2. 本地文件复制到远程主机并重命名
scp file.txt user@192.168.1.100:/home/user/newname.txt

# 3. 从远程主机复制文件到本地
scp user@192.168.1.100:/home/user/file.txt ./local/

# 4. 复制整个目录到远程（递归）
scp -r dir/ user@192.168.1.100:/home/user/

# 5. 从远程复制目录到本地
scp -r user@192.168.1.100:/home/user/dir/ ./local/

# 6. 指定 SSH 端口（非默认 22）
scp -P 2222 file.txt user@192.168.1.100:/home/user/

# 7. 保留文件属性（权限、时间戳）
scp -p file.txt user@192.168.1.100:/home/user/

# 8. 显示详细信息（调试用）
scp -v file.txt user@192.168.1.100:/home/user/

# 9. 安静模式传输
scp -q file.txt user@192.168.1.100:/home/user/

# 10. 传输时启用压缩
scp -C largefile.tar.gz user@192.168.1.100:/home/user/

# 11. 限制带宽（限制为 500 Kbit/s）
scp -l 500 largefile.zip user@192.168.1.100:/home/user/

# 12. 使用指定私钥文件
scp -i ~/.ssh/id_rsa_custom file.txt user@192.168.1.100:/home/user/

# 13. 在两个远程主机之间复制（通过本地转发）
scp -3 user1@host1:/home/user/file.txt user2@host2:/home/user/

# 14. 复制多个文件到远程
scp file1.txt file2.txt file3.txt user@192.168.1.100:/home/user/

# 15. 复制文件并使用通配符
scp *.log user@192.168.1.100:/home/user/logs/

# 16. 从远程复制到远程（通过本地中转）
scp user1@host1:/home/user/file.txt user2@host2:/home/user/
```

# **sz 命令** - 通过 Zmodem 协议发送文件

**语法**：`sz [选项] 文件1 [文件2 ...]`

**功能**：使用 Zmodem 协议将文件从远程服务器发送到本地终端（如 Xshell、SecureCRT、iTerm2 等），常用于通过 SSH 会话下载文件到本地

**常用选项**：

- `-b`：以二进制模式传输（推荐用于传输非文本文件，如压缩包、图片、可执行文件等）

- `-e`：转义所有控制字符，防止传输过程中被误解释

- `-y`：覆盖本地已存在的文件（不提示）

- `-v`：显示详细信息（多个 v 增加详细程度）

- `-q`：安静模式，不显示传输进度

- `-Z`：启用 Zmodem 协议优化

- `-a`：以 ASCII 模式传输（用于文本文件，自动转换换行符）

- `-B`：设置缓冲区大小（单位：字节）

- `-L`：设置传输包大小

- `-X`：使用 Xmodem 协议（速度较慢）

- `-Y`：使用 Ymodem 协议

**使用前提**：

- 终端软件（如 SecureCRT、Xshell、MobaXterm）需要支持 Zmodem 协议

- 服务器端需要安装 lrzsz 软件包：`yum install lrzsz` 或 `apt install lrzsz`

**示例**：
```bash
# 1. 基本文件发送
sz file.txt

# 2. 发送多个文件
sz file1.txt file2.txt file3.txt

# 3. 二进制模式发送（推荐）
sz -b file.zip

# 4. 发送时覆盖本地已存在的文件
sz -y file.txt

# 5. 二进制模式 + 覆盖已存在文件
sz -by archive.zip

# 6. 显示详细信息
sz -v file.txt

# 7. 安静模式（不显示进度）
sz -q file.txt

# 8. ASCII 模式发送文本文件
sz -a README.txt

# 9. 发送文件并启用 Zmodem 优化
sz -Z largefile.tar.gz

# 10. 发送目录（需要先打包）
tar -czf archive.tar.gz dir/ && sz -b archive.tar.gz
```
**常见使用场景**：
```bash
# 1. 下载日志文件
sz -b /var/log/nginx/access.log

# 2. 下载配置文件
sz /etc/nginx/nginx.conf

# 3. 下载多个日志文件
sz /var/log/*.log

# 4. 下载压缩包
sz -b backup_20250115.tar.gz

# 5. 下载数据库备份
sz -b /backup/database.sql.gz

# 6. 下载脚本并覆盖本地版本
sz -y script.sh

# 7. 查看详细传输信息（调试用）
sz -vv file.txt
```
**注意事项**：

- sz/rz 适用于小文件传输（几百 MB 以内），大文件建议使用 scp 或 rsync

- 传输二进制文件（压缩包、图片、可执行文件）**必须**使用 `-b` 参数，否则可能损坏文件

- 在 tmux 或 screen 会话中使用 sz 可能失败（需要终端软件的 Zmodem 直连支持）

- 传输中断后部分终端支持断点续传，但不是全部

- 同时发送多个文件时，某些终端软件会逐个提示保存位置

**安装方法**：
```bash
# CentOS/RHEL
yum install lrzsz -y

# Ubuntu/Debian
apt install lrzsz -y

# Alpine
apk add lrzsz

# 验证安装
which rz sz
```

# **rz 命令** - 通过 Zmodem 协议接收文件

**语法**：`rz [选项]`

**功能**：使用 Zmodem 协议从本地终端（如 Xshell、SecureCRT、iTerm2 等）接收文件到远程服务器，常用于通过串口或 SSH 会话进行文件传输

**常用选项**：

- `-b`：以二进制模式传输（推荐用于传输非文本文件，如压缩包、图片等）

- `-e`：转义所有控制字符，防止传输过程中被误解释

- `-y`：覆盖已存在的文件（不提示）

- `-v`：显示详细信息（多个 v 增加详细程度）

- `-q`：安静模式，不显示传输进度

- `-Z`：启用 Zmodem 协议优化

- `-B`：设置缓冲区大小（单位：字节）

- `-S`：指定传输文件名（不弹出文件选择对话框）

- `-E`：如果目标文件已存在，重命名为 `文件名.序号`

**使用前提**：

- 终端软件（如 SecureCRT、Xshell、MobaXterm）需要支持 Zmodem 协议

- 服务器端需要安装 lrzsz 软件包：`yum install lrzsz` 或 `apt install lrzsz`

**示例**：
```bash
# 1. 基本文件接收（会弹出文件选择对话框）
rz

# 2. 二进制模式接收（推荐）
rz -b

# 3. 接收时覆盖已存在的文件
rz -y

# 4. 接收时自动重命名冲突文件
rz -E

# 5. 二进制模式 + 覆盖已存在文件
rz -by

# 6. 显示详细信息
rz -v

# 7. 安静模式（不显示进度）
rz -q

# 8. 指定文件名接收（不弹出对话框）
rz -S filename.txt

# 9. 启用 Zmodem 优化
rz -Z
```
**常见使用场景**：
```bash
# 1. 上传配置文件到服务器
rz -b -y

# 2. 上传压缩包（二进制模式）
rz -b

# 3. 上传多个文件时防止覆盖
rz -E

# 4. 从服务器下载日志到本地
sz -b /var/log/nginx/access.log

# 5. 下载脚本文件
sz script.sh
```

# **uname 命令** - 显示系统信息

**语法**：`uname [选项]`

**功能**：显示当前操作系统、内核版本、主机名、硬件架构等系统相关信息

**常用选项**：

- `-a`：显示所有系统信息（依次相当于 -s -n -r -v -m）

- `-s`：显示内核名称（默认选项）

- `-n`：显示网络节点主机名

- `-r`：显示内核发行版本号

- `-v`：显示内核版本详细信息（编译时间、编译者等）

- `-m`：显示机器硬件架构（如 x86_64、aarch64）

- `-p`：显示处理器类型（在某些系统上可能显示 unknown）

- `-i`：显示硬件平台（在某些系统上可能显示 unknown）

- `-o`：显示操作系统名称

**示例**：
```bash
# 1. 显示内核名称
uname
# 输出：Linux

# 2. 显示所有系统信息
uname -a
# 输出示例：Linux hostname 5.15.0-91-generic #101-Ubuntu SMP Tue Nov 21 16:04:15 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux

# 3. 显示内核发行版本
uname -r
# 输出：5.15.0-91-generic

# 4. 显示主机名
uname -n
# 输出：myserver

# 5. 显示机器硬件架构
uname -m
# 输出：x86_64

# 6. 显示内核版本详情
uname -v
# 输出：#101-Ubuntu SMP Tue Nov 21 16:04:15 UTC 2023

# 7. 显示操作系统名称
uname -o
# 输出：GNU/Linux

# 8. 显示处理器类型
uname -p
# 输出：x86_64

# 9. 组合显示多个信息
uname -s -r
# 输出：Linux 5.15.0-91-generic
```

# **su 命令** - 切换用户身份

**语法**：`su [选项] [用户名]`

**功能**：切换当前登录会话的用户身份，默认切换到 root 用户（需要输入目标用户的密码）

**常用选项**：

- `-` 或 `-l` 或 `--login`：切换用户时同时切换环境变量（工作目录、PATH、SHELL 等），模拟完整登录

- `-c`：以目标用户身份执行单条命令后返回原用户

- `-s`：指定要使用的 shell（如 `/bin/bash`）

- `-m` 或 `-p` 或 `--preserve-environment`：保留当前环境变量（不切换到目标用户的环境）

- `-g`：指定初始组

- `-G`：指定附加组

- `--help`：显示帮助信息

- `--version`：显示版本信息

**示例**：
```bash
# 1. 切换到 root 用户（保留当前环境变量）
su
# 输入 root 密码后切换到 root

# 2. 切换到 root 用户并加载 root 的环境（推荐）
su -
# 或
su -l
# 输入 root 密码，切换到 root 并切换到 root 的家目录和 PATH

# 3. 切换到指定用户
su username
# 输入 username 的密码

# 4. 切换到指定用户并加载其环境
su - username
# 或
su -l username

# 5. 以目标用户身份执行单条命令
su -c "ls -la /root" root
# 以 root 身份执行 ls 命令，执行后返回原用户

# 6. 以目标用户身份执行多条命令
su -c "cd /tmp && echo 'hello' > test.txt" username

# 7. 切换到 root 并指定 shell
su -s /bin/zsh

# 8. 切换到用户但保留当前环境变量
su -m username
# 或
su -p username

# 9. 查看当前用户身份
whoami

# 10. 切换后返回原用户
exit
# 或按 Ctrl+D
```
**su vs su - 的区别**：

| 命令     | 环境变量     | 工作目录    | PATH       | 效果                   |
| ------ | -------- | ------- | ---------- | -------------------- |
| `su`   | 保留原用户环境  | 当前目录    | 原用户的 PATH  | 部分切换，可能找不到 root 特有命令 |
| `su -` | 加载目标用户环境 | 目标用户家目录 | 目标用户的 PATH | 完整切换，模拟登录            |

# **sudo 命令** - 以其他用户身份执行命令

**语法**：`sudo [选项] [命令]`

**功能**：允许授权用户以其他用户（通常是 root）的身份执行命令，遵循最小权限原则，执行前验证当前用户密码

**常用选项**：

- `-i` 或 `--login`：以目标用户身份执行登录 shell（模拟完整登录，加载环境变量）

- `-s` 或 `--shell`：以目标用户身份启动 shell（可指定 shell 路径）

- `-u`：指定要切换到的用户（默认 root）

- `-g`：指定主要组

- `-k`：使凭证失效，下次执行 sudo 需要重新输入密码

- `-K`：完全移除凭证（立即失效）

- `-l` 或 `--list`：列出当前用户可执行的 sudo 权限

- `-v`：更新凭证时间戳（延长有效期，不执行命令）

- `-b` 或 `--background`：在后台执行命令

- `-E`：保留当前用户的环境变量

- `-H`：设置 HOME 环境变量为目标用户的家目录

- `-n`：非交互模式，不提示输入密码（用于脚本）

- `-S`：从标准输入读取密码

**配置文件**：`/etc/sudoers`（必须使用 `visudo` 命令编辑）

**示例**：
```bash
# 1. 以 root 身份执行命令
sudo systemctl restart nginx

# 2. 以指定用户身份执行命令
sudo -u deployer systemctl restart app

# 3. 切换到 root 并加载 root 环境（类似 su -）
sudo -i
# 或
sudo -i root

# 4. 切换到指定用户并加载其环境
sudo -i -u deployer

# 5. 以 root 身份启动 shell
sudo -s
# 或
sudo /bin/bash

# 6. 以指定用户身份启动 shell
sudo -u deployer -s

# 7. 列出当前用户的 sudo 权限
sudo -l

# 8. 保留当前环境变量执行命令
sudo -E env | grep PATH

# 9. 在后台执行命令
sudo -b dd if=/dev/zero of=/dev/null &

# 10. 编辑 sudoers 文件（必须使用此命令）
sudo visudo

# 11. 使凭证立即失效
sudo -k
sudo systemctl status nginx
# 此时需要重新输入密码

# 12. 更新凭证有效期（不执行命令）
sudo -v

# 13. 以其他用户身份执行多条命令
sudo -u deployer bash -c "cd /app && ./deploy.sh && systemctl restart app"
```

# **chmod 命令** - 修改文件或目录的权限

**语法**：`chmod [选项] 模式 文件或目录`

**功能**：更改文件或目录的访问权限（读、写、执行），支持符号模式（字母表示）和数字模式（八进制）两种方式

**权限分类**：

- **所有者（u）**：文件所有者

- **所属组（g）**：文件所属组的成员

- **其他用户（o）**：其他所有用户

- **所有用户（a）**：相当于 u+g+o

**权限类型**：

- **读（r）**：读取文件内容 / 列出目录内容

- **写（w）**：修改文件内容 / 在目录中创建或删除文件

- **执行（x）**：执行文件 / 进入目录

**常用选项**：

- `-R`：递归修改目录及其子目录中所有文件的权限

- `-v`：显示详细处理信息（显示每个修改的文件）

- `-c`：类似 -v，但仅在修改时显示

- `-f`：静默模式，不显示错误信息

- `--reference=参考文件`：将权限设置为与参考文件相同

**符号模式语法**：`[ugoa...][+-=][rwxXst...]`

- `+`：添加权限

- `-`：移除权限

- `=`：设置权限（覆盖原有权限）

**数字模式（八进制）**：

|数字|权限|说明|
|---|---|---|
|0|---|无权限|
|1|--x|仅执行|
|2|-w-|仅写入|
|3|-wx|写入+执行|
|4|r--|仅读取|
|5|r-x|读取+执行|
|6|rw-|读取+写入|
|7|rwx|所有权限|

**示例**：
```bash
# ========== 符号模式示例 ==========

# 1. 为所有者添加执行权限
chmod u+x script.sh

# 2. 为所有者和组添加写权限
chmod ug+w file.txt

# 3. 移除其他用户的读权限
chmod o-r file.txt

# 4. 设置所有者为读写，组为只读，其他无权限
chmod u=rw,go=r file.txt

# 5. 为所有用户添加执行权限
chmod a+x script.sh

# 6. 递归为目录及其内容添加执行权限（仅对目录）
chmod -R u+X dir/
# X 表示仅对目录或已有执行权限的文件添加执行权限

# 7. 设置粘滞位（只有文件所有者才能删除）
chmod +t /tmp

# 8. 设置 SUID（以文件所有者身份执行）
chmod u+s /usr/bin/passwd

# 9. 设置 SGID（以文件所属组身份执行）
chmod g+s shared_dir/

# ========== 数字模式示例 ==========

# 10. 设置权限为 rwxr-xr-x（所有者全权限，组读执行，其他读执行）
chmod 755 script.sh

# 11. 设置权限为 rw-r--r--（所有者读写，组只读，其他只读）
chmod 644 file.txt

# 12. 设置权限为 rwx------（仅所有者全权限）
chmod 700 private.sh

# 13. 设置权限为 rw-rw-r--（所有者和组读写，其他只读）
chmod 664 shared.txt

# 14. 设置目录权限（所有者全权限，组读执行，其他无权限）
chmod 750 dir/

# 15. 递归设置目录权限
chmod -R 755 /var/www/html/

# ========== 其他示例 ==========

# 16. 显示详细修改信息
chmod -v 644 file.txt
# 输出：mode of 'file.txt' changed from 0755 (rwxr-xr-x) to 0644 (rw-r--r--)

# 17. 静默模式（不显示错误）
chmod -f 644 readonly.txt

# 18. 参考其他文件的权限
chmod --reference=template.txt target.txt

# 19. 查看文件权限
ls -l file.txt
# 输出：-rw-r--r-- 1 user group 1024 Jan 15 10:30 file.txt
```

# **chown 命令** - 修改文件或目录的所有者和所属组

**语法**：`chown [选项] [所有者][:组] 文件或目录`

**功能**：更改文件或目录的所有者（owner）和/或所属组（group），通常需要超级用户权限执行

**常用选项**：

- `-R`：递归修改目录及其子目录中所有文件的所有者和组

- `-v`：显示详细处理信息（显示每个修改的文件）

- `-c`：类似 -v，但仅在修改时显示

- `-f`：静默模式，不显示错误信息

- `--reference=参考文件`：将所有者/组设置为与参考文件相同

- `-h`：修改符号链接本身的所有者，而非链接指向的文件

- `--from=当前所有者:当前组`：仅当当前所有者/组匹配时才更改

**格式说明**：

|格式|说明|示例|
|---|---|---|
|`所有者`|仅修改所有者|`chown user file.txt`|
|`:`|仅修改组（省略所有者）|`chown :group file.txt`|
|`所有者:`|修改所有者和组（组与所有者同名）|`chown user: file.txt`|
|`所有者:组`|修改所有者和组|`chown user:group file.txt`|

**示例**：
```bash
# ========== 修改所有者 ==========

# 1. 修改文件的所有者
sudo chown newuser file.txt

# 2. 修改目录的所有者
sudo chown newuser /var/www/html/

# 3. 递归修改目录及其内容的所有者
sudo chown -R newuser /var/www/html/

# ========== 修改组 ==========

# 4. 仅修改文件的所属组
sudo chown :newgroup file.txt

# 5. 修改目录的所属组
sudo chown :www-data /var/www/html/

# 6. 递归修改目录及其内容的所属组
sudo chown -R :newgroup /var/www/html/

# ========== 同时修改所有者和组 ==========

# 7. 同时修改所有者和组
sudo chown newuser:newgroup file.txt

# 8. 修改所有者和组（组与所有者同名）
sudo chown newuser: file.txt

# 9. 修改所有者为指定用户，组保持不变
sudo chown newuser: file.txt

# ========== 递归修改 ==========

# 10. 递归修改目录及其所有内容的所有者和组
sudo chown -R www-data:www-data /var/www/html/

# 11. 递归修改并显示详细信息
sudo chown -Rv user:group /path/to/dir/

# 12. 递归修改但仅在修改时显示
sudo chown -Rc user:group /path/to/dir/

# ========== 其他用法 ==========

# 13. 使用参考文件设置所有者/组
sudo chown --reference=template.txt target.txt

# 14. 修改符号链接本身（而非链接目标）
sudo chown -h user:group symlink

# 15. 条件修改（仅当当前所有者匹配时才修改）
sudo chown --from=olduser newuser file.txt

# 16. 条件修改（仅当当前所有者和组都匹配时）
sudo chown --from=olduser:oldgroup newuser:newgroup file.txt

# 17. 静默模式（不显示错误）
sudo chown -f user:group file.txt

# 18. 查看修改结果
ls -l file.txt
# 输出：-rw-r--r-- 1 newuser newgroup 1024 Jan 15 10:30 file.txt
```

# **chgrp 命令** - 修改文件或目录的所属组

**语法**：`chgrp [选项] 组名 文件或目录`

**功能**：更改文件或目录的所属组（group），普通用户可以更改自己拥有的文件的组（必须是目标组的成员），超级用户可更改任意文件

**常用选项**：

- `-R`：递归修改目录及其子目录中所有文件的所属组

- `-v`：显示详细处理信息（显示每个修改的文件）

- `-c`：类似 -v，但仅在修改时显示

- `-f`：静默模式，不显示错误信息

- `-h`：修改符号链接本身的所属组，而非链接指向的文件

- `--reference=参考文件`：将所属组设置为与参考文件相同

- `-H`：配合 -R 使用，只处理命令行指定的符号链接指向的目录

- `-L`：配合 -R 使用，处理所有符号链接指向的目录

- `-P`：配合 -R 使用，不处理符号链接（默认行为）

**示例**：
```bash
# ========== 基本用法 ==========

# 1. 修改文件的所属组
sudo chgrp www-data file.txt
# 或（如果当前用户是 www-data 组成员）
chgrp www-data file.txt

# 2. 修改目录的所属组
sudo chgrp developers /project/

# 3. 递归修改目录及其内容的所属组
sudo chgrp -R www-data /var/www/html/

# ========== 递归修改 ==========

# 4. 递归修改并显示详细信息
sudo chgrp -Rv developers /shared/project/
# 输出：
# changed group of '/shared/project/' from root to developers
# changed group of '/shared/project/file1.txt' from root to developers
# changed group of '/shared/project/file2.txt' from root to developers

# 5. 递归修改但仅在修改时显示
sudo chgrp -Rc www-data /var/www/html/

# 6. 静默模式（不显示错误）
sudo chgrp -Rf users /tmp/test/

# ========== 符号链接处理 ==========

# 7. 修改符号链接本身（而非目标文件）
sudo chgrp -h newgroup symlink

# 8. 创建测试示例
ln -s /etc/passwd passwd_link
sudo chgrp -h users passwd_link
ls -l passwd_link
# 输出：lrwxrwxrwx 1 root users 11 Jan 15 10:30 passwd_link -> /etc/passwd

# ========== 参考文件用法 ==========

# 9. 将目标文件的组设置为与参考文件相同
sudo chgrp --reference=template.txt target.txt

# 10. 递归设置目录组与参考目录相同
sudo chgrp -R --reference=/var/www/html /backup/html/

# ========== 组合操作 ==========

# 11. 同时修改多个文件
sudo chgrp www-data file1.txt file2.txt file3.txt

# 12. 使用通配符批量修改
sudo chgrp developers *.log

# 13. 修改目录组并设置 SGID
sudo chgrp -R developers /shared/project/
sudo chmod -R g+s /shared/project/

# 14. 查看修改结果
ls -l file.txt
# 输出：-rw-r--r-- 1 user www-data 1024 Jan 15 10:30 file.txt
```

# **ps 命令** - 显示进程状态

**语法**：`ps [选项]`

**功能**：显示当前系统中运行的进程信息，包括进程 ID（PID）、CPU 使用率、内存使用量、运行状态、命令等

**常用选项**：

**UNIX 风格（带 `-`）**：

- `-e`：显示所有进程（等价于 `-A`）

- `-f`：显示完整格式的信息（包括 UID、PPID、STIME 等）

- `-u`：显示指定用户的进程

- `-p`：显示指定 PID 的进程

- `-C`：显示指定命令名称的进程

- `-o`：自定义输出格式

- `-l`：显示长格式（包括 F、PRI、NI 等）

- `-j`：显示作业格式（包括 PGID、SID 等）

**BSD 风格（不带 `-`）**：

- `a`：显示所有终端的进程（包括其他用户的）

- `x`：显示没有控制终端的进程

- `u`：以用户友好格式显示（CPU、内存、VSZ、RSS 等）

- `e`：显示进程环境变量

- `f`：以树状结构显示进程关系

**常用组合**：

- `ps aux`：最常用组合，显示所有进程的详细信息

- `ps -ef`：显示所有进程的完整格式

- `ps -eLf`：显示所有进程及线程信息

**示例**：
```bash
# ========== 基础用法 ==========

# 1. 显示当前终端的进程
ps
# 输出：
#   PID TTY          TIME CMD
#  1234 pts/0    00:00:00 bash
#  5678 pts/0    00:00:00 ps

# 2. 显示所有进程（详细格式）
ps aux
# 输出：
# USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
# root         1  0.0  0.1 225856  9216 ?        Ss   10:30   0:02 /sbin/init
# user      1234  0.0  0.2 115512 21536 pts/0    Ss   10:31   0:00 bash
# user      5678  0.0  0.0  15728  1120 pts/0    R+   10:35   0:00 ps aux

# 3. 显示所有进程（完整格式）
ps -ef
# 输出：
# UID        PID  PPID  C STIME TTY          TIME CMD
# root         1     0  0 10:30 ?        00:00:02 /sbin/init
# user      1234     1  0 10:31 pts/0    00:00:00 bash
# user      5678  1234  0 10:35 pts/0    00:00:00 ps -ef

# ========== 按条件筛选 ==========

# 4. 显示指定用户的进程
ps -u username

# 5. 显示指定 PID 的进程
ps -p 1234

# 6. 显示多个 PID 的进程
ps -p 1234,5678,9012

# 7. 显示指定命令名称的进程
ps -C nginx

# 8. 显示 root 用户的所有进程
ps -u root

# ========== 树状结构 ==========

# 9. 显示进程树
ps -ef --forest
# 或
ps auxf

# 10. 显示指定进程的树状结构
ps -f --forest -C nginx

# ========== 自定义输出 ==========

# 11. 自定义显示列
ps -eo pid,user,comm,pcpu,pmem
# 输出：
#   PID USER     COMMAND         %CPU %MEM
#     1 root     systemd          0.0  0.1
#  1234 user     bash             0.0  0.2

# 12. 按 CPU 使用率排序
ps aux --sort=-%cpu | head -10

# 13. 按内存使用率排序
ps aux --sort=-%mem | head -10

# 14. 显示进程及其线程
ps -eLf

# 15. 显示进程环境变量
ps -e -o pid,cmd,env
ps -ww -p 1234 -o env  # 完整显示环境变量

# ========== 其他常用用法 ==========

# 16. 显示所有进程（BSD 风格）
ps -A
# 或
ps -e

# 17. 显示用户友好格式
ps u
# 显示当前终端的进程（用户格式）

# 18. 显示无控制终端的进程
ps x

# 19. 显示所有终端的进程
ps a

# 20. 显示进程的线程信息
ps -e -o pid,comm,pcpu,pmem --sort=-pcpu

# 21. 实时监控进程（配合 watch）
watch -n 1 'ps aux --sort=-%cpu | head -10'

# 22. 查找特定进程的 PID
ps aux | grep nginx
# 或
pgrep nginx

# 23. 显示进程的父进程关系
ps -o pid,ppid,cmd -p 1234
```
**输出字段说明**：

|字段|含义|说明|
|---|---|---|
|USER / UID|用户名 / 用户 ID|进程所有者|
|PID|进程 ID|进程唯一标识|
|PPID|父进程 ID|创建此进程的进程|
|%CPU|CPU 使用率|占用 CPU 的百分比|
|%MEM|内存使用率|占用物理内存的百分比|
|VSZ|虚拟内存大小|进程占用的虚拟内存（KB）|
|RSS|常驻内存大小|进程占用的物理内存（KB）|
|TTY|终端|关联的终端（? 表示无终端）|
|STAT|进程状态|见下方状态说明|
|START / STIME|启动时间|进程开始运行的时间|
|TIME|累计 CPU 时间|进程占用 CPU 的总时间|
|COMMAND / CMD|命令|执行的命令和参数|

**进程状态（STAT）**：

|状态码|含义|
|---|---|
|R|运行中（runnable）|
|S|可中断睡眠（sleeping）|
|D|不可中断睡眠（通常为 I/O）|
|Z|僵尸进程（zombie）|
|T|停止状态（stopped）|
|t|跟踪状态（traced）|
|X|死亡状态（dead）|

**状态修饰符**：

| 修饰符 | 含义         |
| --- | ---------- |
| `<` | 高优先级       |
| `N` | 低优先级       |
| `L` | 有锁定在内存中的页面 |
| `s` | 会话领导者      |
| `l` | 多线程进程      |
| `+` | 前台进程组      |

# **nice 命令** - 以指定的优先级启动进程

**语法**：`nice [选项] [命令] [参数]`

**功能**：以调整后的调度优先级（niceness value）启动一个程序，数值范围通常为 -20（最高优先级）到 19（最低优先级），默认值为 10

**常用选项**：

- `-n`：指定优先级值（niceness），默认为 10

- `--adjustment`：与 `-n` 相同

- `--help`：显示帮助信息

- `--version`：显示版本信息

**优先级说明**：

|优先级范围|说明|
|---|---|
|-20 到 -1|高优先级（需要 root 权限）|
|0|默认优先级|
|1 到 19|低优先级（普通用户可设置）|

**nice 值含义**：

- **正值（1-19）**：降低优先级，进程获得较少的 CPU 时间

- **负值（-20 到 -1）**：提高优先级，进程获得更多的 CPU 时间（需要 root）

- **0**：默认优先级

**示例**：
```bash
# ========== 基本用法 ==========

# 1. 以默认优先级（10）启动进程
nice long_running_script.sh

# 2. 以指定优先级启动进程
nice -n 5 ./backup.sh

# 3. 以低优先级启动进程（让出 CPU）
nice -n 19 ./batch_process.sh

# 4. 查看当前 shell 的 nice 值
nice
# 输出：0

# ========== 实际应用示例 ==========

# 5. 以低优先级执行压缩任务（不影响系统响应）
nice -n 19 tar -czf backup.tar.gz /home/user/

# 6. 以高优先级执行关键任务（需要 root）
sudo nice -n -20 ./critical_task.sh

# 7. 以低优先级执行数据库备份
nice -n 15 mysqldump -u root mydb > backup.sql

# 8. 以低优先级执行视频转码
nice -n 10 ffmpeg -i input.mp4 output.avi

# 9. 以低优先级执行日志分析
nice -n 15 grep "ERROR" /var/log/syslog > errors.log

# 10. 以低优先级执行长时间运行的科学计算
nice -n 10 python3 simulation.py

# ========== 与其他命令组合 ==========

# 11. 结合 nohup 在后台执行
nohup nice -n 19 ./long_task.sh &

# 12. 将已运行的进程设置为低优先级（使用 renice）
# 先查看进程 PID
ps aux | grep process_name
# 修改优先级
renice -n 15 -p 12345

# 13. 批量启动多个低优先级任务
for i in {1..10}; do
    nice -n 19 ./task_$i.sh &
done

# 14. 使用 time 查看执行时间对比
time nice -n 19 ./heavy_task.sh
time ./heavy_task.sh

# ========== 查看优先级 ==========

# 15. 查看进程的 nice 值
ps -eo pid,comm,nice,pri | head -10

# 16. 查看特定进程的 nice 值
ps -o pid,comm,nice -p 12345

# 17. 查看进程详细信息（包括优先级）
top
# 在 top 中 NI 列显示 nice 值

# 18. 按优先级排序显示进程
ps -eo pid,comm,nice,pcpu --sort=nice

# 19. 显示所有进程的 nice 值
ps aux | awk '{print $1,$2,$11,$4}'
```

# **renice 命令 - 修改运行中进程的优先级**：

**语法**：`renice [优先级] -p [PID]`

**常用选项**：

- `-n`：指定新的 nice 值

- `-p`：指定进程 PID

- `-u`：指定用户

- `-g`：指定进程组

**示例**：
```bash
# 1. 修改运行中进程的优先级
renice -n 15 -p 12345

# 2. 修改多个进程的优先级
renice -n 10 -p 12345 12346 12347

# 3. 修改指定用户的所有进程优先级
renice -n 5 -u username

# 4. 修改指定进程组的优先级
renice -n 10 -g 12345

# 5. 降低已运行任务的优先级
# 查找 PID
ps aux | grep ffmpeg
# 降低优先级
sudo renice -n 19 -p 5678

# 6. 提高已运行任务的优先级（需要 root）
sudo renice -n -10 -p 12345

# 7. 查看 renice 后的效果
ps -o pid,comm,nice -p 12345
```

**grep 命令** - 文本搜索工具

**语法**：`grep [选项] 模式 [文件...]`

**功能**：在文件或标准输入中搜索匹配指定模式的行，并输出匹配的行，支持正则表达式

**常用选项**：

**匹配控制**：

- `-i`：忽略大小写

- `-v`：反向匹配（显示不匹配的行）

- `-w`：匹配整个单词（单词边界）

- `-x`：匹配整行（整行完全匹配）

- `-f`：从文件中读取模式（每行一个模式）

- `-e`：指定多个模式（可重复使用）

**输出控制**：

- `-n`：显示匹配行的行号

- `-c`：只统计匹配的行数

- `-l`：只显示包含匹配内容的文件名

- `-L`：只显示不包含匹配内容的文件名

- `-m`：指定最多匹配的行数（达到后停止）

- `-o`：只输出匹配的部分（而非整行）

- `-q`：安静模式（不输出任何内容，仅通过退出码判断）

- `-s`：不显示错误信息（如文件不存在）

**上下文控制**：

- `-A`：显示匹配行及其后 N 行（After）

- `-B`：显示匹配行及其前 N 行（Before）

- `-C`：显示匹配行及其前后各 N 行（Context）

**文件处理**：

- `-r` 或 `-R`：递归搜索目录

- `-H`：显示文件名（多个文件时默认）

- `-h`：不显示文件名

- `--color`：高亮显示匹配的文本（`auto`、`always`、`never`）

- `-E`：使用扩展正则表达式（等价于 `egrep`）

- `-F`：将模式视为固定字符串（等价于 `fgrep`）

- `-P`：使用 Perl 兼容正则表达式（PCRE）

**示例**：
```bash
# ========== 基本搜索 ==========

# 1. 在文件中搜索字符串
grep "error" /var/log/syslog

# 2. 忽略大小写搜索
grep -i "warning" app.log

# 3. 搜索多个文件
grep "pattern" file1.txt file2.txt file3.txt

# 4. 从标准输入读取
ps aux | grep python

# 5. 显示匹配行的行号
grep -n "error" app.log
# 输出：
# 23:2024-01-15 10:30:15 error: connection failed
# 45:2024-01-15 10:35:22 error: timeout

# ========== 反向匹配 ==========

# 6. 显示不包含模式的行
grep -v "^#" config.conf  # 排除注释行

# 7. 排除空行和注释行
grep -v "^#" config.conf | grep -v "^$"

# ========== 递归搜索 ==========

# 8. 递归搜索目录
grep -r "TODO" /home/user/project/

# 9. 递归搜索并显示文件名
grep -rn "function" /path/to/source/

# 10. 递归搜索特定类型文件
grep -r --include="*.py" "import" /project/

# 11. 排除特定文件或目录
grep -r --exclude="*.log" "error" /var/log/
grep -r --exclude-dir=".git" "TODO" /project/

# ========== 统计和列表 ==========

# 12. 统计匹配行数
grep -c "error" app.log

# 13. 只显示包含匹配的文件名
grep -l "error" *.log

# 14. 只显示不包含匹配的文件名
grep -L "success" *.log

# ========== 上下文显示 ==========

# 15. 显示匹配行及后3行
grep -A 3 "Exception" app.log

# 16. 显示匹配行及前2行
grep -B 2 "error" app.log

# 17. 显示匹配行及前后各2行
grep -C 2 "warning" app.log

# ========== 正则表达式 ==========

# 18. 基本正则表达式
grep "^[0-9]" file.txt      # 以数字开头的行
grep "error$" file.txt      # 以 error 结尾的行
grep "log.*txt" file.txt    # 包含 log 后跟任意字符再跟 txt

# 19. 扩展正则表达式（-E）
grep -E "error|warning|fatal" app.log
grep -E "(error|warning):" app.log

# 20. 匹配单词边界
grep -w "free" text.txt     # 匹配 free，不匹配 freedom

# 21. 匹配 IP 地址
grep -E "\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" access.log

# 22. 匹配邮箱地址
grep -E "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}" contacts.txt

# ========== 高级用法 ==========

# 23. 输出匹配部分（而非整行）
grep -o "error[0-9]*" app.log
# 输出：error123 error456 error789

# 24. 安静模式（仅通过退出码判断）
if grep -q "error" app.log; then
    echo "Found errors"
fi

# 25. 限制匹配行数
grep -m 10 "error" app.log

# 26. 高亮显示匹配
grep --color=auto "pattern" file.txt

# 27. 从文件读取模式
grep -f patterns.txt app.log

# 28. 多个模式匹配
grep -e "error" -e "warning" -e "fatal" app.log

# 29. 固定字符串模式（不解析正则）
grep -F ".*" file.txt    # 搜索字面字符串 .*

# 30. 显示匹配行及文件名
grep -H "pattern" *.txt

# ========== 实用场景 ==========

# 31. 查找运行中的进程
ps aux | grep nginx | grep -v grep

# 32. 统计错误类型
grep -o "error: [^ ]*" app.log | sort | uniq -c

# 33. 查找今天的日志
grep "$(date +%Y-%m-%d)" /var/log/syslog

# 34. 查找特定时间段的日志
grep "2024-01-15 1[0-2]:" app.log

# 35. 提取配置中的有效行
grep -v "^#" /etc/nginx/nginx.conf | grep -v "^$"

# 36. 查找包含特定内容的文件
find . -type f -name "*.py" -exec grep -l "def main" {} \;

# 37. 搜索并替换（结合 sed）
grep -l "oldtext" *.txt | xargs sed -i 's/oldtext/newtext/g'

# 38. 查看日志中的错误统计
grep "ERROR" app.log | cut -d' ' -f2- | sort | uniq -c | sort -rn

# 39. 查找特殊权限文件
ls -la | grep "^...s"  # SUID 文件

# 40. 显示 PATH 中的可执行文件
echo $PATH | tr ':' '\n' | xargs -I {} find {} -maxdepth 1 -type f 2>/dev/null | grep -v "^$"
```
**正则表达式快速参考**：

|元字符|含义|示例|
|---|---|---|
|`.`|匹配任意单个字符|`a.c` 匹配 abc、aac|
|`^`|匹配行首|`^error` 匹配以 error 开头的行|
|`$`|匹配行尾|`error$` 匹配以 error 结尾的行|
|`*`|匹配前一个字符 0 次或多次|`ab*c` 匹配 ac、abc、abbc|
|`+`|匹配前一个字符 1 次或多次（扩展）|`ab+c` 匹配 abc、abbc|
|`?`|匹配前一个字符 0 次或 1 次（扩展）|`ab?c` 匹配 ac、abc|
|`[ ]`|匹配括号内任意字符|`[0-9]` 匹配数字|
|`[^ ]`|匹配不在括号内的字符|`[^0-9]` 匹配非数字|
|`\|`|或（扩展）|`error\|warning` 匹配 error 或 warning|
|`( )`|分组（扩展）|`(error)+` 匹配 error、errorerror|
|`{n}`|匹配 n 次（扩展）|`[0-9]{4}` 匹配 4 位数字|
|`\b`|单词边界|`\bfree\b` 匹配单词 free|
|`\d`|数字（Perl）|`\d{3}` 匹配 3 位数字|

**退出状态码**：

- `0`：找到匹配

- `1`：未找到匹配

- `2`：语法错误或文件不可访问

# **env 命令** - 显示或设置环境变量

**语法**：`env [选项] [变量=值...] [命令 [参数...]]`

**功能**：显示当前所有环境变量，或在修改后的环境中执行命令，常用于临时设置环境变量、清理环境运行程序、查看环境配置

**常用选项**：

- `-i` 或 `--ignore-environment`：忽略继承的环境变量（清空环境），只使用指定的变量

- `-0`：以空字符（null）结束输出，而非换行符（配合 `xargs -0` 使用）

- `-u` 或 `--unset`：从环境中移除指定的变量

- `-C` 或 `--chdir`：先切换到指定目录再执行命令

- `-S`：解析参数中的字符串（用于 shebang 脚本）

- `--help`：显示帮助信息

- `--version`：显示版本信息

**示例**：
```bash
# ========== 查看环境变量 ==========

# 1. 显示所有环境变量
env
# 输出：
# HOME=/home/user
# PATH=/usr/local/bin:/usr/bin:/bin
# USER=user
# SHELL=/bin/bash
# ...

# 2. 查看指定环境变量（结合 grep）
env | grep PATH
# 输出：PATH=/usr/local/bin:/usr/bin:/bin

# 3. 显示环境变量（按字母排序）
env | sort

# 4. 显示环境变量数量
env | wc -l

# ========== 临时设置环境变量执行命令 ==========

# 5. 临时设置变量执行命令
env DEBUG=true ./app.sh

# 6. 设置多个变量
env APP_ENV=production LOG_LEVEL=info ./app

# 7. 设置变量后执行 Python 脚本
env PYTHONPATH=/custom/lib python3 script.py

# 8. 设置变量后执行命令并传递参数
env EDITOR=vim crontab -e

# 9. 设置 PATH 后执行命令
env PATH=/usr/local/bin:$PATH which python3

# 10. 临时设置语言环境
env LANG=en_US.UTF-8 date

# ========== 清空环境执行命令 ==========

# 11. 清空环境执行命令
env -i /bin/bash

# 12. 清空环境后设置特定变量
env -i HOME=/tmp PATH=/usr/bin USER=test /bin/bash

# 13. 清空环境执行脚本（安全执行）
env -i PATH=/usr/bin /bin/bash -c 'echo $PATH'

# 14. 清空环境执行 Python
env -i PYTHONPATH=. python3 script.py

# ========== 移除变量 ==========

# 15. 移除指定环境变量
env -u http_proxy curl https://example.com

# 16. 移除多个变量
env -u http_proxy -u https_proxy curl https://example.com

# ========== 切换目录执行命令 ==========

# 17. 切换到指定目录执行命令
env -C /var/www/html ls -la

# 18. 切换目录并设置变量
env -C /app NODE_ENV=production node server.js

# ========== 脚本中使用 ==========

# 19. Shebang 中使用 env（查找解释器路径）
#!/usr/bin/env python3
# 这样写比 #!/usr/bin/python3 更灵活

# 20. Shebang 中传递参数（使用 -S）
#!/usr/bin/env -S python3 -u
# 启动 Python 并开启无缓冲输出

# ========== 实用场景 ==========

# 21. 查看默认 shell
env | grep SHELL

# 22. 检查当前用户信息
env | grep USER

# 23. 查看 Python 环境变量
env | grep PYTHON

# 24. 查看代理设置
env | grep -i proxy

# 25. 显示 null 分隔的环境变量
env -0 | xargs -0 -n1 echo

# 26. 比较当前 shell 和 env 的区别
set | wc -l
env | wc -l
# set 显示更多（包括 shell 函数和本地变量）

# 27. 在脚本中检查变量是否存在
env | grep -q "DATABASE_URL" && echo "Database configured"

# 28. 执行命令并记录环境变量
env > /tmp/env.log && ./my_script.sh

# 29. 调试启动问题
env -i /bin/bash -c 'env'  # 查看干净环境
env /bin/bash -c 'env'     # 查看当前环境

# 30. 容器中调试环境变量
docker run --rm alpine env
```
**常见环境变量**：

|变量名|含义|示例值|
|---|---|---|
|`PATH`|可执行文件搜索路径|`/usr/local/bin:/usr/bin:/bin`|
|`HOME`|用户家目录|`/home/username`|
|`USER`|当前用户名|`username`|
|`SHELL`|当前 shell 路径|`/bin/bash`|
|`LANG`|语言和编码|`en_US.UTF-8`|
|`PWD`|当前工作目录|`/home/user/project`|
|`OLDPWD`|上一个工作目录|`/home/user`|
|`TERM`|终端类型|`xterm-256color`|
|`EDITOR`|默认编辑器|`vim` 或 `nano`|
|`http_proxy`|HTTP 代理|`http://proxy:8080`|

**env vs printenv vs set**：

|命令|显示内容|说明|
|---|---|---|
|`env`|环境变量|只显示导出到子进程的变量|
|`printenv`|环境变量|与 env 类似，可指定变量名|
|`set`|环境变量 + shell 变量 + 函数|显示更多内容（包括本地变量）|

# **printenv 命令** - 打印环境变量

**语法**：`printenv [选项] [变量名...]`

**功能**：打印部分或全部环境变量的值，如果指定变量名则只显示该变量的值，如果不指定则显示所有环境变量

**常用选项**：

- `-0`：以空字符（null）结束输出，而非换行符（便于处理特殊字符）

- `--help`：显示帮助信息

- `--version`：显示版本信息

**示例**：
```bash
# ========== 基本用法 ==========

# 1. 显示所有环境变量
printenv
# 输出：
# HOME=/home/user
# PATH=/usr/local/bin:/usr/bin:/bin
# USER=user
# SHELL=/bin/bash
# LANG=en_US.UTF-8
# ...

# 2. 显示指定环境变量的值
printenv HOME
# 输出：/home/user

# 3. 显示多个环境变量的值
printenv HOME USER SHELL
# 输出：
# /home/user
# user
# /bin/bash

# 4. 显示不存在的变量（无输出）
printenv NONEXIST_VAR

# ========== 实用场景 ==========

# 5. 检查环境变量是否存在
printenv PATH > /dev/null && echo "PATH is set"

# 6. 在脚本中检查必需的变量
if [ -z "$(printenv DATABASE_URL)" ]; then
    echo "DATABASE_URL is not set"
    exit 1
fi

# 7. 显示所有环境变量并排序
printenv | sort

# 8. 统计环境变量数量
printenv | wc -l

# 9. 过滤特定环境变量
printenv | grep -i proxy

# 10. 显示以 PATH 开头的变量
printenv | grep "^PATH"

# 11. 导出所有环境变量到文件
printenv > /tmp/env_backup.txt

# 12. 显示环境变量（空字符分隔）
printenv -0 | xargs -0 -n1 echo

# 13. 显示用户相关变量
printenv | grep -E "^(USER|HOME|SHELL|UID)="

# ========== 脚本中使用 ==========

# 14. 检查多个变量是否都存在
required_vars="PATH HOME USER"
for var in $required_vars; do
    if printenv $var > /dev/null; then
        echo "✓ $var is set to: $(printenv $var)"
    else
        echo "✗ $var is not set"
    fi
done

# 15. 获取变量值并赋值
MY_PATH=$(printenv PATH)
echo "Current PATH: $MY_PATH"

# 16. 条件判断中使用
if printenv DEBUG | grep -q "true"; then
    echo "Debug mode enabled"
fi

# 17. 比较两个环境变量的值
if [ "$(printenv ENV)" = "production" ]; then
    echo "Running in production"
fi

# ========== 调试和排查 ==========

# 18. 查看当前用户身份
printenv USER

# 19. 查看工作目录
printenv PWD

# 20. 查看默认编辑器
printenv EDITOR

# 21. 查看语言设置
printenv LANG LC_ALL

# 22. 查看终端类型
printenv TERM

# 23. 查看所有路径相关变量
printenv | grep -E "PATH|DIR|ROOT"

# 24. 查看代理设置
printenv | grep -i proxy

# 25. 查看 shell 配置
printenv SHELL

# 26. 对比两个环境
# 保存当前环境
printenv > env1.txt
# 切换到干净环境
env -i bash -c 'printenv' > env2.txt
diff env1.txt env2.txt

# ========== 与其他命令配合 ==========

# 27. 结合 watch 监控环境变量变化
watch -n 1 'printenv | grep PATH'

# 28. 结合 grep 查找特定变量
printenv | grep -E "^PATH="

# 29. 结合 xargs 处理
printenv -0 | xargs -0 -n1 | head -10

# 30. 在 Makefile 中使用
# Makefile:
# show-env:
#     @printenv

# 31. 在 Docker 容器中调试
docker run --rm alpine printenv

# 32. 查看 cron 环境
# 在 crontab 中添加：
# * * * * * printenv > /tmp/cron_env.txt 2>&1

# ========== 实用函数 ==========

# 33. 创建函数显示变量值
show_env() {
    for var in "$@"; do
        echo "$var = $(printenv $var)"
    done
}
show_env PATH HOME USER

# 34. 列出所有变量名
printenv | cut -d= -f1

# 35. 导出到文件并恢复
printenv > env.save
# 恢复（谨慎使用）
# source env.save

# 36. 查找包含特定值的变量
printenv | grep -i "linux"

# 37. 检查敏感变量
printenv | grep -E "(PASSWORD|SECRET|KEY|TOKEN)" | cut -d= -f1
```

# **unset 命令** - 删除变量或函数

**语法**：`unset [选项] [变量名或函数名...]`

**功能**：删除已定义的 shell 变量、环境变量或函数，释放其占用的命名空间，使其不再可用

**常用选项**：

- `-f`：指定要删除的是函数（而不是变量）

- `-v`：指定要删除的是变量（默认行为）

- `-n`：删除变量引用（用于 declare -n 定义的引用变量）

- `--help`：显示帮助信息

- `--version`：显示版本信息

**示例**：
```bash
# ========== 删除变量 ==========

# 1. 删除本地变量
MY_VAR="hello"
echo $MY_VAR
# 输出：hello
unset MY_VAR
echo $MY_VAR
# 输出：（空）

# 2. 删除环境变量
export MY_ENV="world"
printenv MY_ENV
# 输出：world
unset MY_ENV
printenv MY_ENV
# 输出：（空）

# 3. 删除多个变量
VAR1=one VAR2=two VAR3=three
unset VAR1 VAR2 VAR3
echo $VAR1 $VAR2 $VAR3
# 输出：（空）

# 4. 删除数组变量
arr=(a b c d)
echo ${arr[@]}
# 输出：a b c d
unset arr
echo ${arr[@]}
# 输出：（空）

# 5. 删除数组中的单个元素
arr=(a b c d)
unset arr[2]      # 删除第三个元素
echo ${arr[@]}
# 输出：a b d

# ========== 删除函数 ==========

# 6. 定义并删除函数
myfunc() {
    echo "This is a function"
}
myfunc
# 输出：This is a function
unset -f myfunc
myfunc
# 输出：bash: myfunc: command not found

# 7. 删除多个函数
func1() { echo "func1"; }
func2() { echo "func2"; }
unset -f func1 func2

# ========== 实际应用场景 ==========

# 8. 清理敏感信息
export PASSWORD="secret123"
# 使用密码后立即清除
unset PASSWORD

# 9. 在脚本中清理临时变量
#!/bin/bash
TEMP_FILE="/tmp/$(date +%s).tmp"
# ... 使用临时文件 ...
rm -f $TEMP_FILE
unset TEMP_FILE   # 清理变量

# 10. 重置环境变量
export OLD_PATH=$PATH
PATH=/custom/bin:$PATH
# ... 使用自定义 PATH ...
PATH=$OLD_PATH
unset OLD_PATH

# 11. 在函数中清理局部变量
myfunc() {
    local temp="temp value"
    echo $temp
    unset temp
    echo $temp  # 输出空
}

# 12. 防止变量被继承
# 脚本开头清理不需要的环境变量
unset USER_HOME LOG_DIR TEMP_PATH

# 13. 删除所有以 TEST_ 开头的变量
for var in $(printenv | grep "^TEST_" | cut -d= -f1); do
    unset $var
done

# ========== 数组操作 ==========

# 14. 删除关联数组元素
declare -A user
user[name]="John"
user[age]="30"
unset user[age]
echo ${user[age]}   # 输出空

# 15. 清空整个数组（多种方式）
arr=(1 2 3)
unset arr           # 删除整个数组
arr=(1 2 3)
arr=()              # 设置为空数组
arr=(1 2 3)
unset arr[@]        # 删除所有元素但保留数组结构

# ========== 特殊情况 ==========

# 16. 删除只读变量（会失败）
readonly RO_VAR="readonly"
unset RO_VAR
# 输出：bash: unset: RO_VAR: cannot unset: readonly variable

# 17. 删除不存在的变量（不报错）
unset NONEXIST_VAR  # 无输出，退出码为 0

# 18. 检查变量是否被删除
if [ -z ${MY_VAR+x} ]; then
    echo "MY_VAR is not set"
fi

# 19. 在子 shell 中删除变量不影响父 shell
export PARENT_VAR="parent"
bash -c 'unset PARENT_VAR; echo $PARENT_VAR'  # 输出空
echo $PARENT_VAR   # 输出：parent

# 20. 删除由 declare -n 创建的引用
declare -n ref=original
original="value"
unset -n ref
echo $ref  # 输出空（引用被删除）
echo $original  # 输出：value

# ========== 调试和验证 ==========

# 21. 检查变量是否存在
var_check() {
    if [ -z ${1+x} ]; then
        echo "Variable $1 is not set"
    else
        echo "Variable $1 is set to: ${!1}"
    fi
}
unset TEST_VAR
var_check TEST_VAR

# 22. 查看所有当前定义的变量
set | grep -E "^[A-Z_]+=" | head -20

# 23. 查看所有定义的函数
declare -f

# 24. 验证环境变量是否被清除
export ENV_VAR="test"
unset ENV_VAR
printenv ENV_VAR   # 无输出
```

# **export 命令** - 设置或导出环境变量

**语法**：`export [选项] [变量名[=值]...]`

**功能**：将 shell 变量标记为环境变量，使其在当前 shell 及其创建的所有子进程中可用，用于传递配置信息、路径设置等

**常用选项**：

- `-p`：显示所有已导出的环境变量

- `-n`：取消变量的导出属性（使其不再为环境变量）

- `-f`：将函数导出为环境变量（函数可在子 shell 中使用）

- `--help`：显示帮助信息

- `--version`：显示版本信息

**基本概念**：

- **shell 变量**：只在当前 shell 中有效，子进程无法访问

- **环境变量**：通过 export 导出后，当前 shell 及所有子进程都可访问

**示例**：
```bash
# ========== 基本用法 ==========

# 1. 导出变量
MY_VAR="hello"
export MY_VAR
# 或合并为一行
export MY_VAR="hello"

# 2. 导出多个变量
export VAR1="value1" VAR2="value2" VAR3="value3"

# 3. 查看所有导出的环境变量
export -p
# 输出：
# declare -x HOME="/home/user"
# declare -x PATH="/usr/local/bin:/usr/bin:/bin"
# declare -x USER="user"
# declare -x MY_VAR="hello"

# 4. 查看特定环境变量
export | grep PATH

# ========== 变量导出测试 ==========

# 5. 对比导出前后的差异
# 未导出变量（仅在当前 shell）
SHELL_VAR="only this shell"
bash -c 'echo $SHELL_VAR'  # 输出空

# 导出后（子进程可访问）
export SHELL_VAR
bash -c 'echo $SHELL_VAR'  # 输出：only this shell

# 6. 验证变量是否已导出
export -p | grep MY_VAR
# 或
declare -x | grep MY_VAR

# ========== 取消导出 ==========

# 7. 取消变量导出（但变量仍存在）
export MY_VAR="test"
export -n MY_VAR
echo $MY_VAR          # 输出：test
bash -c 'echo $MY_VAR' # 输出空（不再是环境变量）

# 8. 完全删除变量
unset MY_VAR

# ========== 路径操作 ==========

# 9. 添加目录到 PATH
export PATH=$PATH:/custom/bin

# 10. 在 PATH 开头添加目录
export PATH=/opt/bin:$PATH

# 11. 添加多个目录
export PATH=$PATH:/usr/local/go/bin:$HOME/.local/bin

# 12. 添加 LD_LIBRARY_PATH
export LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH

# 13. 设置 Python 路径
export PYTHONPATH=/path/to/modules:$PYTHONPATH

# ========== 常见环境变量配置 ==========

# 14. 设置 Java 环境
export JAVA_HOME=/usr/lib/jvm/java-11-openjdk
export PATH=$JAVA_HOME/bin:$PATH

# 15. 设置代理
export http_proxy=http://proxy.example.com:8080
export https_proxy=https://proxy.example.com:8080
export no_proxy=localhost,127.0.0.1

# 16. 设置语言环境
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# 17. 设置编辑器
export EDITOR=vim
export VISUAL=vim

# 18. 设置历史记录
export HISTSIZE=10000
export HISTFILESIZE=20000

# 19. 设置时区
export TZ="Asia/Shanghai"

# 20. 设置数据库连接
export DATABASE_URL="postgresql://user:pass@localhost:5432/mydb"

# ========== 配置文件使用 ==========

# 21. 在 ~/.bashrc 中永久设置
# echo 'export EDITOR=vim' >> ~/.bashrc
# echo 'export PATH=$HOME/bin:$PATH' >> ~/.bashrc

# 22. 在 ~/.profile 中设置（登录 shell）
# echo 'export JAVA_HOME=/usr/lib/jvm/java-11' >> ~/.profile

# 23. 在项目特定配置中设置
source project_env.sh
# project_env.sh 内容：
# export PROJECT_ROOT=/path/to/project
# export PYTHONPATH=$PROJECT_ROOT/src:$PYTHONPATH

# ========== 函数导出 ==========

# 24. 定义并导出函数
myfunc() {
    echo "Hello from function"
}
export -f myfunc

# 25. 在子 shell 中使用导出的函数
bash -c 'myfunc'  # 输出：Hello from function

# 26. 取消函数导出
export -fn myfunc

# ========== 实用场景 ==========

# 27. 临时修改环境运行命令
export DEBUG=true && ./app && unset DEBUG

# 28. 保存并恢复环境变量
OLD_PATH=$PATH
export PATH=/custom/path:$PATH
# ... 执行操作 ...
export PATH=$OLD_PATH
unset OLD_PATH

# 29. 批量导出变量
set -a  # 所有后续变量自动导出
VAR1=value1
VAR2=value2
VAR3=value3
set +a  # 关闭自动导出

# 30. 从文件加载环境变量
# 假设 .env 文件内容：
# DB_HOST=localhost
# DB_USER=root
# DB_PASS=secret
while IFS='=' read -r key value; do
    export "$key"="$value"
done < .env

# 31. 检查变量是否已导出
is_exported() {
    export -p | grep -q "declare -x $1="
}
export TEST_VAR="test"
is_exported TEST_VAR && echo "Exported"  # 输出：Exported

# 32. 导出所有变量（谨慎使用）
for var in $(set | grep -E "^[A-Z_]+=" | cut -d= -f1); do
    export $var
done

# 33. 在脚本开头导出必要变量
#!/bin/bash
export PATH=/usr/local/bin:/usr/bin:/bin
export LANG=C
export TZ=UTC

# ========== 调试和验证 ==========

# 34. 查看变量的导出状态
declare -p MY_VAR 2>/dev/null | grep -q "declare -x" && echo "Exported"

# 35. 列出所有环境变量（多种方式）
export -p
printenv
env

# 36. 查看特定变量的值
echo $JAVA_HOME
printenv JAVA_HOME
export | grep JAVA_HOME

# 37. 显示导出变量的数量
export -p | wc -l
```

# **ln 命令** - 创建链接文件

**语法**：`ln [选项] 源文件 目标文件` 或 `ln [选项] 源文件... 目标目录`

**功能**：创建文件之间的链接（硬链接或软链接），硬链接是文件的多个名称，软链接（符号链接）是指向另一个文件的特殊文件

**链接类型**：

|链接类型|特点|限制|
|---|---|---|
|**硬链接**|多个文件名指向同一 inode，删除一个不影响其他|不能跨文件系统，不能链接目录|
|**软链接**|独立的文件，存储目标路径，指向原文件|可跨文件系统，可链接目录，目标删除后失效|

**常用选项**：

- `-s`：创建符号链接（软链接）

- `-f`：强制覆盖已存在的目标文件

- `-i`：覆盖前询问确认

- `-n`：将目标视为普通文件（而非目录）

- `-v`：显示详细处理信息

- `-b`：覆盖前备份原文件

- `-d`：允许超级用户创建目录的硬链接

- `-r`：创建相对路径的符号链接

- `-P`：创建硬链接时使用原文件的绝对路径

- `-L`：如果源文件是符号链接，链接其指向的目标

- `-P`：如果源文件是符号链接，链接该符号链接本身

**硬链接示例**：
```bash
# ========== 硬链接 ==========

# 1. 创建硬链接
echo "Hello World" > file1.txt
ln file1.txt file2.txt
ls -li file1.txt file2.txt
# 输出：
# 123456 -rw-r--r-- 2 user user 12 Jan 15 10:30 file1.txt
# 123456 -rw-r--r-- 2 user user 12 Jan 15 10:30 file2.txt
# 相同的 inode 号（123456），链接数为 2

# 2. 验证硬链接（相同 inode）
stat file1.txt file2.txt
# 或
ls -i file1.txt file2.txt

# 3. 修改任意一个文件，另一个同步变化
echo "New content" >> file1.txt
cat file2.txt  # 显示新内容

# 4. 删除源文件，硬链接仍可访问
rm file1.txt
cat file2.txt  # 仍然可以访问

# 5. 创建多个硬链接
ln file2.txt file3.txt
ln file2.txt file4.txt
ls -l file*.txt
# -rw-r--r-- 4 user user 12 Jan 15 10:30 file2.txt
# -rw-r--r-- 4 user user 12 Jan 15 10:30 file3.txt
# -rw-r--r-- 4 user user 12 Jan 15 10:30 file4.txt

# ========== 软链接 ==========

# 6. 创建符号链接
echo "Original content" > original.txt
ln -s original.txt symlink.txt
ls -l symlink.txt
# 输出：lrwxrwxrwx 1 user user 12 Jan 15 10:30 symlink.txt -> original.txt

# 7. 查看链接指向
readlink symlink.txt
# 输出：original.txt
readlink -f symlink.txt  # 获取绝对路径

# 8. 通过符号链接访问文件
cat symlink.txt  # 输出：Original content

# 9. 删除源文件，符号链接失效（成为悬空链接）
rm original.txt
cat symlink.txt
# 输出：cat: symlink.txt: No such file or directory
ls -l symlink.txt
# 输出：lrwxrwxrwx 1 user user 12 Jan 15 10:30 symlink.txt -> original.txt (红色闪烁)

# ========== 目录链接 ==========

# 10. 创建目录的符号链接
mkdir real_dir
ln -s real_dir link_dir
ls -ld link_dir
# 输出：lrwxrwxrwx 1 user user 8 Jan 15 10:30 link_dir -> real_dir

# 11. 通过符号链接访问目录
cd link_dir
pwd
# 输出：/home/user/link_dir（物理路径）
pwd -P  # 显示实际物理路径
# 输出：/home/user/real_dir

# 12. 创建相对路径符号链接（推荐）
ln -rs /absolute/path/to/source link_name

# ========== 常用操作 ==========

# 13. 强制覆盖已存在的链接
ln -sf new_target existing_link

# 14. 覆盖前询问
ln -si target link_name

# 15. 创建链接时显示详细信息
ln -sv source link

# 16. 覆盖前备份
ln -sb source link
# 会创建 link~ 作为备份

# 17. 创建多个链接到目录
ln -s /usr/local/bin /home/user/bin
ln -s /opt/app/bin /home/user/bin  # 错误，目标已存在
ln -sf /opt/app/bin /home/user/bin  # 使用 -f 覆盖

# ========== 实际应用场景 ==========

# 18. 创建版本控制链接
ln -s /usr/local/python3.11 /usr/local/python
# 更新版本时只需修改链接

# 19. 链接配置文件
ln -s /home/user/dotfiles/.bashrc ~/.bashrc
ln -s /home/user/dotfiles/.vimrc ~/.vimrc

# 20. 链接日志文件
ln -sf /var/log/nginx/access.log /home/user/logs/access.log

# 21. 创建库文件版本链接
ln -s libfoo.so.1.2.3 libfoo.so.1
ln -s libfoo.so.1 libfoo.so

# 22. 将可执行文件链接到 PATH 目录
ln -s /opt/myapp/bin/myapp /usr/local/bin/myapp

# 23. 创建多个版本的 Python 链接
ln -s /usr/bin/python3.11 /usr/local/bin/python3
ln -s /usr/bin/python3.11 /usr/local/bin/python

# 24. 链接项目依赖
ln -s /shared/database.db ./data/database.db
ln -s /shared/uploads ./static/uploads

# ========== 高级用法 ==========

# 25. 查找硬链接
find . -samefile file1.txt

# 26. 查找所有指向同一 inode 的文件
ls -i file1.txt
# 假设输出 123456
find /home -inum 123456 2>/dev/null

# 27. 查找悬空符号链接
find /path -type l ! -exec test -e {} \; -print

# 28. 查找并修复悬空链接
find /path -type l ! -exec test -e {} \; -delete

# 29. 批量创建符号链接
for file in *.txt; do
    ln -s "$file" "link_$file"
done

# 30. 创建带时间戳的备份链接
ln -sf config.conf config.conf.$(date +%Y%m%d)

# 31. 更新符号链接（原子操作）
ln -snf new_target existing_link

# 32. 创建相对路径链接（相对于目标目录）
ln -sr /absolute/source/file ./link_name

# 33. 跨文件系统创建链接（只能软链接）
ln -s /mnt/usb/file.txt ./link.txt  # 软链接
ln /mnt/usb/file.txt ./link.txt      # 硬链接失败

# 34. 统计硬链接数量
ls -l file.txt | awk '{print $2}'

# 35. 查看文件的所有硬链接
find / -inum $(stat -c %i file.txt) 2>/dev/null
```

# **df 命令** - 显示磁盘空间使用情况

**语法**：`df [选项] [文件或目录...]`

**功能**：显示文件系统的磁盘空间使用情况，包括总容量、已用空间、可用空间、使用百分比和挂载点

**常用选项**：

- `-h`：以人类可读的格式显示（KB、MB、GB）

- `-H`：以 1000 为基数的人类可读格式（而非 1024）

- `-T`：显示文件系统类型（ext4、xfs、tmpfs 等）

- `-i`：显示 inode 使用情况而非块使用情况

- `-l`：只显示本地文件系统（不显示网络文件系统）

- `-a`：显示所有文件系统（包括 0 块的特殊系统）

- `-t`：只显示指定类型的文件系统

- `-x`：排除指定类型的文件系统

- `-P`：使用 POSIX 输出格式

- `--total`：显示总计行

- `--sync`：显示前先同步文件系统（获取准确数据）

- `--output`：自定义输出字段

**示例**：
```bash
# ========== 基本用法 ==========

# 1. 显示所有挂载的文件系统
df
# 输出：
# Filesystem     1K-blocks    Used Available Use% Mounted on
# /dev/sda1       10253536 5234560   4518976  54% /
# devtmpfs         1943756       0   1943756   0% /dev
# tmpfs            1951684       0   1951684   0% /dev/shm
# /dev/sda2      102535360 8234560  94300800   9% /home

# 2. 人类可读格式（最常用）
df -h
# 输出：
# Filesystem      Size  Used Avail Use% Mounted on
# /dev/sda1        98G   50G   43G  54% /
# devtmpfs        1.9G     0  1.9G   0% /dev
# tmpfs           1.9G     0  1.9G   0% /dev/shm
# /dev/sda2       978G  7.9G  921G   1% /home

# 3. 显示文件系统类型
df -T
# 输出：
# Filesystem     Type     1K-blocks    Used Available Use% Mounted on
# /dev/sda1      ext4      10253536 5234560   4518976  54% /
# devtmpfs       devtmpfs   1943756       0   1943756   0% /dev
# tmpfs          tmpfs      1951684       0   1951684   0% /dev/shm

# 4. 同时显示类型和人类可读
df -Th
# 输出：
# Filesystem     Type      Size  Used Avail Use% Mounted on
# /dev/sda1      ext4       98G   50G   43G  54% /
# devtmpfs       devtmpfs  1.9G     0  1.9G   0% /dev
# tmpfs          tmpfs     1.9G     0  1.9G   0% /dev/shm

# ========== 查看特定目录 ==========

# 5. 查看指定目录所在分区的使用情况
df -h /home
# 显示 /home 所在分区的信息

# 6. 查看多个目录
df -h / /home /var

# 7. 查看当前目录所在分区
df -h .

# ========== 过滤文件系统 ==========

# 8. 只显示本地文件系统
df -lh

# 9. 只显示 ext4 类型文件系统
df -t ext4 -h

# 10. 排除 tmpfs 和 devtmpfs
df -h -x tmpfs -x devtmpfs

# 11. 显示所有文件系统（包括特殊系统）
df -a

# ========== 查看 inode 使用情况 ==========

# 12. 显示 inode 使用情况
df -i
# 输出：
# Filesystem     Inodes IUsed IFree IUse% Mounted on
# /dev/sda1      6553600 523456 6020144    8% /
# devtmpfs        485939   389  485550    1% /dev
# tmpfs           487921     1  487920    1% /dev/shm

# 13. 人类可读的 inode 显示
df -ih

# 14. 显示特定分区的 inode 使用
df -i /home

# ========== 高级用法 ==========

# 15. 显示总计行
df -h --total
# 输出最后一行：total       2.0T  1.2T  800G  60% -

# 16. 使用 POSIX 格式
df -P

# 17. 同步后获取准确数据
df --sync

# 18. 自定义输出字段
df --output=source,size,used,avail,pcent,target
# 输出：
# Filesystem        Size   Used  Avail Use% Mounted on
# /dev/sda1         98G    50G    43G  54% /

# 19. 显示所有可用字段
df --help | grep "output field"

# 20. 以块大小显示（KB）
df -k

# 21. 以 MB 为单位显示
df -m

# ========== 实际应用场景 ==========

# 22. 检查磁盘使用率是否超过阈值
df -h | awk 'NR>1 {print $5 " " $6}' | while read use mount; do
    if [ ${use%\%} -gt 90 ]; then
        echo "Warning: $mount is $use full"
    fi
done

# 23. 监控根分区空间
df -h / | awk 'NR==2 {print "Root usage: " $5}'

# 24. 检查所有分区使用情况（排除 tmpfs）
df -h -x tmpfs -x devtmpfs

# 25. 输出为 CSV 格式
df -h --output=source,size,used,avail,pcent | tr -s ' ' ','

# 26. 显示使用率超过 80% 的分区
df -h | awk 'NR==1 || $5+0 > 80'

# 27. 检查 inode 使用率
df -i | awk 'NR==1 || $5+0 > 85'

# 28. 定期监控磁盘使用（cron 任务）
# 0 * * * * df -h / > /var/log/disk_usage.log

# ========== 脚本示例 ==========

# 29. 检查磁盘空间是否充足
#!/bin/bash
check_space() {
    local dir=$1
    local needed=$2  # 需要的空间（MB）
    local available=$(df -m $dir | awk 'NR==2 {print $4}')
    if [ $available -lt $needed ]; then
        echo "Insufficient space: need ${needed}MB, have ${available}MB"
        return 1
    fi
    echo "Space OK: ${available}MB available"
}
check_space /home 1024

# 30. 找出使用率最高的分区
df -h | grep '^/dev' | sort -k5 -rn | head -5

# 31. 显示所有分区及其挂载点（格式化输出）
df -h --output=target,size,used,avail,pcent | column -t

# 32. 监控磁盘使用变化
watch -n 10 df -h /
```

# **mount 命令** - 挂载文件系统

**语法**：`mount [选项] [设备] [挂载点]` 或 `mount [选项]`

**功能**：将存储设备（硬盘分区、光盘、USB、网络存储等）挂载到 Linux 目录树中的某个挂载点，使文件系统可访问

**常用选项**：

**显示当前挂载**：

- `-l`：列出所有已挂载的文件系统（带卷标）

- `-t`：指定文件系统类型（如 ext4、xfs、ntfs、vfat）

- `-a`：挂载 `/etc/fstab` 中的所有文件系统

- `-h`：显示帮助信息

**挂载选项**：

- `-o`：指定挂载选项（如下方选项列表）

- `-r`：以只读方式挂载

- `-w`：以读写方式挂载（默认）

- `-n`：不写入 `/etc/mtab`（用于恢复模式）

- `-v`：显示详细输出

**常用挂载选项（-o）**：

|选项|说明|
|---|---|
|`ro`|只读挂载|
|`rw`|读写挂载（默认）|
|`noexec`|禁止执行二进制文件|
|`exec`|允许执行二进制文件|
|`nosuid`|禁止 suid 和 sgid 位生效|
|`nodev`|不解析设备文件|
|`auto` / `noauto`|是否允许 `mount -a` 自动挂载|
|`user` / `nouser`|是否允许普通用户挂载|
|`defaults`|默认选项（rw、suid、dev、exec、auto、nouser、async）|
|`remount`|重新挂载（修改挂载选项）|
|`bind`|绑定挂载（目录挂载到另一位置）|
|`rbind`|递归绑定挂载|

**示例**：
```bash
# ========== 查看挂载 ==========

# 1. 显示所有已挂载的文件系统
mount
# 输出：
# /dev/sda1 on / type ext4 (rw,relatime)
# devtmpfs on /dev type devtmpfs (rw,relatime,size=1943756k)
# tmpfs on /dev/shm type tmpfs (rw,relatime)

# 2. 列出挂载点（带卷标）
mount -l

# 3. 只显示特定类型
mount -t ext4

# 4. 查看指定挂载点的信息
mount | grep /home

# ========== 挂载设备 ==========

# 5. 挂载硬盘分区
sudo mount /dev/sdb1 /mnt/data

# 6. 指定文件系统类型挂载
sudo mount -t ext4 /dev/sdb1 /mnt/data

# 7. 以只读方式挂载
sudo mount -o ro /dev/sdb1 /mnt/data

# 8. 以读写方式挂载（默认）
sudo mount -o rw /dev/sdb1 /mnt/data

# 9. 挂载时指定选项组合
sudo mount -o defaults,noatime /dev/sdb1 /mnt/data

# 10. 挂载 ISO 镜像文件
sudo mount -o loop ubuntu.iso /mnt/iso

# 11. 挂载 USB 设备
sudo mount /dev/sdc1 /mnt/usb

# ========== 挂载选项示例 ==========

# 12. 禁止执行程序
sudo mount -o noexec /dev/sdb1 /mnt/data
# 挂载点中的程序无法执行

# 13. 禁止 suid 程序
sudo mount -o nosuid /home/user

# 14. 重新挂载（修改选项）
sudo mount -o remount,ro /mnt/data
# 将已挂载的分区改为只读

# 15. 重新挂载为读写
sudo mount -o remount,rw /mnt/data

# 16. 绑定挂载（将目录挂载到另一位置）
sudo mount --bind /var/www /mnt/backup

# 17. 递归绑定挂载（包含子挂载点）
sudo mount --rbind /home /mnt/home_backup

# 18. 移动挂载点
sudo mount --move /old/mountpoint /new/mountpoint

# ========== 特殊文件系统 ==========

# 19. 挂载 proc 文件系统
sudo mount -t proc proc /proc

# 20. 挂载 sysfs
sudo mount -t sysfs sys /sys

# 21. 挂载 tmpfs（内存文件系统）
sudo mount -t tmpfs -o size=1G tmpfs /mnt/ramdisk

# 22. 挂载 devtmpfs
sudo mount -t devtmpfs devtmpfs /dev

# ========== 网络文件系统 ==========

# 23. 挂载 NFS 共享
sudo mount -t nfs 192.168.1.100:/export /mnt/nfs

# 24. 挂载 NFS 指定选项
sudo mount -t nfs -o rw,hard,intr 192.168.1.100:/export /mnt/nfs

# 25. 挂载 CIFS/SMB 共享（Windows 共享）
sudo mount -t cifs //192.168.1.100/share /mnt/smb -o username=user,password=pass

# 26. 挂载 CIFS 使用凭据文件
sudo mount -t cifs //server/share /mnt/smb -o credentials=/etc/smbcredentials

# ========== 挂载 Windows 文件系统 ==========

# 27. 挂载 NTFS 分区
sudo mount -t ntfs-3g /dev/sdb1 /mnt/windows

# 28. 挂载 FAT32 分区
sudo mount -t vfat /dev/sdc1 /mnt/usb

# 29. 挂载 exFAT 分区
sudo mount -t exfat /dev/sdc1 /mnt/usb

# ========== 卸载 ==========

# 30. 卸载设备（通过挂载点）
sudo umount /mnt/data

# 31. 卸载设备（通过设备名）
sudo umount /dev/sdb1

# 32. 强制卸载（设备忙时）
sudo umount -f /mnt/data

# 33. 懒惰卸载（使用完毕后卸载）
sudo umount -l /mnt/data

# 34. 卸载所有挂载点（谨慎使用）
sudo umount -a

# ========== /etc/fstab 配置 ==========

# 35. 查看 fstab 配置
cat /etc/fstab
# 示例条目：
# /dev/sda1  /  ext4  defaults  0  1
# UUID=xxx   /home  ext4  defaults  0  2
# /dev/sdb1  /mnt/data  ext4  defaults  0  0

# 36. 挂载 fstab 中的所有文件系统
sudo mount -a

# 37. 挂载 fstab 中特定挂载点
sudo mount /mnt/data

# 38. 显示 fstab 中的挂载选项
findmnt --fstab

# ========== 实用场景 ==========

# 39. 创建挂载点并挂载
sudo mkdir -p /mnt/data
sudo mount /dev/sdb1 /mnt/data

# 40. 查看分区 UUID（用于 fstab）
sudo blkid
# 输出：/dev/sda1: UUID="1234-5678" TYPE="ext4"

# 41. 在 fstab 中使用 UUID
# UUID=1234-5678  /home  ext4  defaults  0  2

# 42. 查看磁盘分区情况
lsblk -f
# 输出：
# NAME   FSTYPE LABEL UUID MOUNTPOINT
# sda
# ├─sda1 ext4         abc-123 /
# └─sda2 swap         def-456 [SWAP]

# 43. 检查挂载点是否已挂载
mountpoint /mnt/data
# 输出：/mnt/data is a mountpoint

# 44. 查看挂载点详细统计
findmnt /mnt/data

# 45. 以树状结构显示挂载
findmnt

# 46. 显示所有挂载点
findmnt -l

# 47. 挂载 LVM 逻辑卷
sudo mount /dev/vg01/lv01 /mnt/lvm

# 48. 挂载加密分区
sudo cryptsetup luksOpen /dev/sdb1 encrypted
sudo mount /dev/mapper/encrypted /mnt/encrypted

# ========== 脚本示例 ==========

# 49. 检查并挂载设备
#!/bin/bash
MOUNT_POINT="/mnt/data"
DEVICE="/dev/sdb1"

if ! mountpoint -q $MOUNT_POINT; then
    echo "Mounting $DEVICE to $MOUNT_POINT"
    sudo mount $DEVICE $MOUNT_POINT
else
    echo "$MOUNT_POINT is already mounted"
fi

# 50. 挂载所有 USB 设备（自动）
for dev in /dev/sd[b-z][0-9]; do
    if [ -b "$dev" ]; then
        mount_point="/mnt/usb-$(basename $dev)"
        mkdir -p $mount_point
        sudo mount $dev $mount_point
    fi
done

# 51. 显示挂载统计信息
df -h | grep '^/dev' | while read line; do
    echo "$line"
done
```

# **umount 命令** - 卸载文件系统

**语法**：`umount [选项] {挂载点|设备文件}`

**功能**：从 Linux 目录树中卸载已挂载的文件系统，断开设备与挂载点的关联，释放资源

**常用选项**：

- `-a`：卸载 `/etc/mtab` 中列出的所有文件系统（可配合 `-t` 使用）

- `-t`：仅卸载指定类型的文件系统

- `-f`：强制卸载（当设备不可达时，如 NFS 服务器宕机）

- `-l`：懒惰卸载（立即从目录树分离，等待文件系统空闲后清理）

- `-n`：卸载时不写入 `/etc/mtab`

- `-v`：显示详细输出

- `-r`：卸载失败时尝试以只读方式重新挂载

- `-O`：仅卸载指定选项的文件系统

- `-h`：显示帮助信息

- `-V`：显示版本信息

**示例**：
```bash
# ========== 基本卸载 ==========

# 1. 通过挂载点卸载
sudo umount /mnt/data

# 2. 通过设备文件卸载
sudo umount /dev/sdb1

# 3. 卸载多个挂载点
sudo umount /mnt/data /mnt/backup /mnt/usb

# ========== 强制卸载 ==========

# 4. 强制卸载（设备不可达时，如 NFS 服务器宕机）
sudo umount -f /mnt/nfs

# 5. 懒惰卸载（立即分离，等待使用完毕后清理）
sudo umount -l /mnt/busy

# 6. 强制且懒惰卸载
sudo umount -fl /mnt/problem

# 7. 卸载失败时尝试只读重新挂载
sudo umount -r /mnt/data

# ========== 批量卸载 ==========

# 8. 卸载所有文件系统（谨慎使用）
sudo umount -a

# 9. 只卸载 ext4 类型文件系统
sudo umount -a -t ext4

# 10. 卸载所有 ext4 和 xfs 类型
sudo umount -a -t ext4,xfs

# 11. 卸载除了指定类型之外的文件系统
sudo umount -a -t nfs -t cifs  # 只卸载网络文件系统

# 12. 卸载所有网络文件系统（NFS 和 CIFS）
sudo umount -a -t nfs,cifs

# ========== 处理设备忙 ==========

# 13. 查看哪个进程在使用挂载点
lsof /mnt/data
# 或
fuser -v /mnt/data
# 输出：
# USER        PID ACCESS COMMAND
# user       1234 ..c.. bash

# 14. 查看所有访问挂载点的进程
fuser -m /mnt/data

# 15. 终止使用挂载点的进程
sudo fuser -km /mnt/data

# 16. 终止特定 PID
sudo kill -9 1234
# 然后卸载
sudo umount /mnt/data

# 17. 显示进程详细信息
ps aux | grep 1234

# 18. 查找打开文件的进程
lsof | grep /mnt/data

# ========== 网络文件系统卸载 ==========

# 19. 卸载 NFS 挂载
sudo umount /mnt/nfs

# 20. NFS 服务器无响应时强制卸载
sudo umount -f /mnt/nfs

# 21. NFS 懒惰卸载（推荐）
sudo umount -l /mnt/nfs

# 22. 卸载所有 NFS 挂载
sudo umount -a -t nfs

# 23. 卸载 CIFS/SMB 挂载
sudo umount /mnt/smb

# ========== 检查卸载状态 ==========

# 24. 验证是否已卸载
mount | grep /mnt/data
# 无输出表示已卸载

# 25. 检查挂载点状态
mountpoint /mnt/data
# 输出：/mnt/data is not a mountpoint

# 26. 查看挂载点是否仍在使用
if mountpoint -q /mnt/data; then
    echo "Still mounted"
else
    echo "Unmounted successfully"
fi

# ========== 实际应用场景 ==========

# 27. 卸载前自动杀死占用进程
umount_with_kill() {
    local mount_point=$1
    if mountpoint -q "$mount_point"; then
        sudo fuser -km "$mount_point"
        sleep 2
        sudo umount "$mount_point"
    fi
}
umount_with_kill /mnt/data

# 28. 安全卸载脚本
#!/bin/bash
MOUNT_POINT="/mnt/data"

echo "Checking processes using $MOUNT_POINT..."
fuser -v $MOUNT_POINT 2>/dev/null

if fuser -m $MOUNT_POINT 2>/dev/null; then
    read -p "Kill processes? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo fuser -km $MOUNT_POINT
        sleep 2
    fi
fi

echo "Unmounting $MOUNT_POINT..."
sudo umount $MOUNT_POINT

if [ $? -eq 0 ]; then
    echo "Successfully unmounted"
else
    echo "Unmount failed, trying lazy unmount..."
    sudo umount -l $MOUNT_POINT
fi

# 29. 卸载所有 USB 设备
for mount in $(mount | grep '^/dev/sd' | awk '{print $3}'); do
    echo "Unmounting $mount"
    sudo umount $mount
done

# 30. 卸载所有可移动媒体
sudo umount /media/* 2>/dev/null

# 31. 定时检查并卸载空闲挂载
#!/bin/bash
# 检查挂载点是否在 10 分钟内未被访问
MOUNT_POINT="/mnt/backup"
if [ -n "$(lsof -t $MOUNT_POINT 2>/dev/null)" ]; then
    echo "$MOUNT_POINT is busy"
else
    echo "$MOUNT_POINT is idle, unmounting..."
    sudo umount $MOUNT_POINT
fi

# ========== 高级用法 ==========

# 32. 不更新 mtab 卸载
sudo umount -n /mnt/data

# 33. 详细模式卸载
sudo umount -v /mnt/data
# 输出：/mnt/data: unmounted

# 34. 卸载并显示统计信息
time sudo umount /mnt/data

# 35. 使用正则表达式批量卸载
mount | grep '^/dev/sd' | awk '{print $3}' | xargs sudo umount

# 36. 卸载后自动删除挂载点
umount_and_clean() {
    local mount_point=$1
    sudo umount "$mount_point" && sudo rmdir "$mount_point"
}

# 37. 检查并修复挂载问题
if ! sudo umount /mnt/data 2>/dev/null; then
    echo "Unmount failed, checking for open files..."
    lsof | grep /mnt/data
    echo "Attempting lazy unmount..."
    sudo umount -l /mnt/data
fi

# ========== 错误处理 ==========

# 38. 设备忙错误处理
# 错误信息：umount: /mnt/data: target is busy
# 解决方案：
# 1. 切换出挂载目录
cd /home
# 2. 查找占用进程
lsof /mnt/data
# 3. 结束进程或懒惰卸载
sudo umount -l /mnt/data

# 39. 设备不存在错误
# 错误信息：umount: /mnt/data: not mounted
# 检查是否已卸载
mount | grep /mnt/data

# 40. 权限不足错误
# 错误信息：umount: /mnt/data: must be superuser to unmount
# 使用 sudo
sudo umount /mnt/data

# 41. 文件系统错误
# 错误信息：umount: /mnt/data: device is busy
# 强制卸载
sudo umount -f /mnt/data
# 或检查文件系统
sudo fsck /dev/sdb1
```

# **mkfs.ext4 命令** - 创建 ext4 文件系统

**语法**：`mkfs.ext4 [选项] 设备 [块数]`

**功能**：在磁盘分区或设备上创建 ext4（第四代扩展文件系统）文件系统，这是 Linux 系统中最常用的日志型文件系统之一

**常用选项**：

**基本选项**：

- `-L`：设置卷标（最多 16 个字符）

- `-b`：指定块大小（1024、2048、4096 字节，默认 4096）

- `-i`：指定每多少字节分配一个 inode

- `-N`：指定 inode 数量

- `-m`：保留给 root 用户的块百分比（默认 5%）

- `-O`：启用或禁用文件系统特性

- `-E`：设置扩展选项（如 stride、stripe_width）

- `-F`：强制创建（即使设备已挂载或不是块设备）

- `-q`：安静模式（不显示输出）

- `-v`：详细输出

- `-V`：显示版本信息

- `-f`：指定片段大小

- `-J`：设置日志选项（大小、位置等）

**扩展特性（-O）**：

- `has_journal`：启用日志（默认）

- `extents`：启用 extent 特性（提高大文件性能）

- `flex_bg`：启用 flex 块组

- `uninit_bg`：未初始化的块组

- `dir_index`：目录索引（加速目录查找）

- `filetype`：文件类型存储

- `sparse_super`：稀疏超级块

- `large_file`：支持大于 2GB 的文件

**扩展选项（-E）**：

- `stride=RAID块大小/块大小`：RAID 优化

- `stripe_width=RAID块数*stride`：RAID 条带宽度

- `resize=大小`：预留空间供在线调整大小

- `root_owner=uid:gid`：设置根目录所有者

- `discard`：创建时丢弃坏块

- `nodiscard`：不丢弃坏块

**示例**：
```bash
# ========== 基本创建 ==========

# 1. 在分区上创建 ext4 文件系统
sudo mkfs.ext4 /dev/sdb1
# 输出：
# mke2fs 1.46.5 (30-Dec-2021)
# Creating filesystem with 262144 4k blocks and 65536 inodes
# Filesystem UUID: 12345678-1234-1234-1234-123456789abc
# Superblock backups stored on blocks:
#     32768, 98304, 163840, 229376
# Allocating group tables: done
# Writing inode tables: done
# Creating journal (8192 blocks): done
# Writing superblocks and filesystem accounting information: done

# 2. 设置卷标
sudo mkfs.ext4 -L mydata /dev/sdb1

# 3. 指定块大小（4KB）
sudo mkfs.ext4 -b 4096 /dev/sdb1

# 4. 安静模式创建
sudo mkfs.ext4 -q /dev/sdb1

# 5. 详细输出
sudo mkfs.ext4 -v /dev/sdb1

# ========== inode 配置 ==========

# 6. 指定 inode 数量（每 8KB 一个 inode）
sudo mkfs.ext4 -i 8192 /dev/sdb1
# 适用于大量小文件场景

# 7. 直接指定 inode 数量
sudo mkfs.ext4 -N 1000000 /dev/sdb1

# 8. 增大 inode 大小（默认 256 字节）
sudo mkfs.ext4 -I 512 /dev/sdb1
# 适合需要存储大量扩展属性的场景

# ========== 保留块配置 ==========

# 9. 设置保留块百分比为 1%（减少空间浪费）
sudo mkfs.ext4 -m 1 /dev/sdb1

# 10. 设置保留块为指定块数（而非百分比）
sudo mkfs.ext4 -r 102400 /dev/sdb1

# 11. 不保留块（不推荐，可能影响系统稳定性）
sudo mkfs.ext4 -m 0 /dev/sdb1

# ========== RAID 优化 ==========

# 12. 针对 RAID 0 优化（条带大小 64KB，块大小 4KB，stride=16）
sudo mkfs.ext4 -E stride=16,stripe_width=32 /dev/sdb1
# stride = RAID条带大小 / 块大小
# stripe_width = RAID条带宽度 / 块大小

# 13. RAID 5/6 优化
sudo mkfs.ext4 -E stride=16,stripe_width=64 /dev/sdb1

# ========== 日志配置 ==========

# 14. 指定日志大小（MB）
sudo mkfs.ext4 -J size=128 /dev/sdb1

# 15. 指定日志位置（外部日志）
sudo mkfs.ext4 -J device=/dev/sdc1 /dev/sdb1

# 16. 创建不带日志的文件系统（性能提升，但可能丢失数据）
sudo mkfs.ext4 -O ^has_journal /dev/sdb1

# ========== 高级特性 ==========

# 17. 禁用某些特性（如 extent）
sudo mkfs.ext4 -O ^extents /dev/sdb1

# 18. 启用 flex_bg 优化
sudo mkfs.ext4 -O flex_bg /dev/sdb1

# 19. 创建大文件系统（大于 16TB）
sudo mkfs.ext4 -O extent,uninit_bg,flex_bg /dev/sdb1

# 20. 设置根目录所有者和组
sudo mkfs.ext4 -E root_owner=1000:1000 /dev/sdb1

# 21. 预留空间供在线调整
sudo mkfs.ext4 -E resize=500G /dev/sdb1

# ========== 实际应用场景 ==========

# 22. 创建普通数据分区（1% 保留，卷标为 data）
sudo mkfs.ext4 -L data -m 1 /dev/sdb1

# 23. 创建数据库分区（大量小文件，增加 inode）
sudo mkfs.ext4 -L mysql -i 4096 -m 1 /dev/sdb1

# 24. 创建备份分区（保留块为 0，节省空间）
sudo mkfs.ext4 -L backup -m 0 /dev/sdb1

# 25. 创建高性能 SSD 分区（禁用日志）
sudo mkfs.ext4 -O ^has_journal -L ssd_fast /dev/sdb1

# 26. 创建大容量存储分区（4TB+）
sudo mkfs.ext4 -T largefile4 /dev/sdb1

# 27. 创建邮件服务器分区（大量小文件）
sudo mkfs.ext4 -i 2048 -L mail /dev/sdb1

# 28. 创建虚拟化存储分区
sudo mkfs.ext4 -E stride=8,stripe_width=16 /dev/sdb1

# ========== 创建前准备 ==========

# 29. 查看现有分区信息
sudo fdisk -l /dev/sdb
sudo parted /dev/sdb print
sudo lsblk -f /dev/sdb

# 30. 创建分区（使用 fdisk）
sudo fdisk /dev/sdb
# 输入: n (新建分区)
# 输入: p (主分区)
# 输入: 1 (分区号)
# 输入: 回车 (默认起始扇区)
# 输入: 回车 (默认结束扇区)
# 输入: w (写入并退出)

# 31. 检查分区是否被使用
sudo mount | grep /dev/sdb1
sudo lsof | grep /dev/sdb1

# 32. 强制创建（即使已挂载，危险！）
sudo mkfs.ext4 -F /dev/sdb1

# ========== 创建后操作 ==========

# 33. 查看文件系统信息
sudo dumpe2fs -h /dev/sdb1
# 输出包含：
# Filesystem volume name:   mydata
# Filesystem UUID:          12345678-1234-1234-1234-123456789abc
# Filesystem magic number:  0xEF53
# Filesystem revision #:    1 (dynamic)
# Filesystem features:      has_journal ext_attr resize_inode dir_index ...
# Block size:               4096
# Inode size:               256
# Reserved block count:     131072
# Free blocks:              253952
# Free inodes:              65520

# 34. 查看 UUID
sudo blkid /dev/sdb1
# 输出：/dev/sdb1: LABEL="mydata" UUID="1234-5678" TYPE="ext4"

# 35. 调整卷标（创建后也可修改）
sudo e2label /dev/sdb1 newlabel

# 36. 修改保留块百分比（创建后）
sudo tune2fs -m 2 /dev/sdb1

# 37. 创建挂载点并挂载
sudo mkdir -p /mnt/data
sudo mount /dev/sdb1 /mnt/data
sudo chown $USER:$USER /mnt/data

# 38. 添加到 fstab 自动挂载
echo "UUID=$(sudo blkid -s UUID -o value /dev/sdb1) /mnt/data ext4 defaults 0 2" | sudo tee -a /etc/fstab

# ========== 性能优化 ==========

# 39. SSD 优化（启用 discard）
sudo mkfs.ext4 -E discard /dev/sdb1

# 40. 减少日志提交频率
sudo mkfs.ext4 -J size=256 /dev/sdb1

# 41. 禁用最后访问时间更新（提高性能）
# 可在 fstab 中添加 noatime 选项
# UUID=xxx /mnt/data ext4 defaults,noatime 0 2

# ========== 脚本示例 ==========

# 42. 自动化创建脚本
#!/bin/bash
DEVICE="/dev/sdb1"
LABEL="data"
MOUNT_POINT="/mnt/data"

echo "Creating ext4 filesystem on $DEVICE..."
sudo mkfs.ext4 -F -L "$LABEL" -m 1 $DEVICE

echo "Creating mount point..."
sudo mkdir -p $MOUNT_POINT

echo "Mounting filesystem..."
sudo mount $DEVICE $MOUNT_POINT

echo "Setting permissions..."
sudo chown $USER:$USER $MOUNT_POINT

echo "Adding to fstab..."
UUID=$(sudo blkid -s UUID -o value $DEVICE)
echo "UUID=$UUID $MOUNT_POINT ext4 defaults,noatime 0 2" | sudo tee -a /etc/fstab

echo "Done!"

# 43. 批量创建分区脚本
for i in {1..4}; do
    DEVICE="/dev/sdb$i"
    LABEL="disk$i"
    echo "Formatting $DEVICE as $LABEL"
    sudo mkfs.ext4 -F -L "$LABEL" $DEVICE
done

# 44. 创建前确认脚本
#!/bin/bash
DEVICE="/dev/sdb1"
echo "WARNING: This will erase all data on $DEVICE"
read -p "Are you sure? (yes/no): " confirm
if [ "$confirm" = "yes" ]; then
    sudo mkfs.ext4 -F $DEVICE
    echo "Filesystem created successfully"
else
    echo "Operation cancelled"
fi
```

# **dd 命令** - 转换和复制文件

**语法**：`dd [选项]`

**功能**：按块复制和转换数据，是一个功能强大的低级数据复制工具，可用于备份、恢复、磁盘克隆、创建启动盘、数据转换等操作

**常用选项**：

**输入/输出**：

- `if=文件`：输入文件（默认标准输入）

- `of=文件`：输出文件（默认标准输出）

- `iflag=标志`：输入标志（direct、sync、dsync、nonblock 等）

- `oflag=标志`：输出标志

- `status=级别`：显示状态（none、noxfer、progress）

**块大小**：

- `bs=大小`：设置输入和输出的块大小（覆盖 ibs 和 obs）

- `ibs=大小`：设置输入块大小（默认 512 字节）

- `obs=大小`：设置输出块大小（默认 512 字节）

- `cbs=大小`：转换缓冲区大小

**复制控制**：

- `count=块数`：只复制指定数量的输入块

- `skip=块数`：跳过输入文件开头的指定块数

- `seek=块数`：跳过输出文件开头的指定块数

- `seek_bytes`：seek 使用字节计数而非块计数

- `skip_bytes`：skip 使用字节计数而非块计数

**转换选项**：

- `conv=转换`：数据转换（见下方转换列表）

- `sync`：用零填充输入块到 ibs 大小

- `noerror`：读取错误时继续

- `fdatasync`：写入完成后同步数据

- `fsync`：写入完成后同步数据和元数据

**常用转换（conv=）**：

- `ascii`：EBCDIC 转 ASCII

- `ebcdic`：ASCII 转 EBCDIC

- `lcase`：大写转小写

- `ucase`：小写转大写

- `noerror`：忽略读取错误

- `notrunc`：不截断输出文件

- `sparse`：尝试创建稀疏文件

- `swab`：交换每对字节

- `sync`：填充零使每个输入块达到 ibs 大小

**示例**：
```bash
# ========== 基本复制 ==========

# 1. 复制文件
dd if=/etc/passwd of=/tmp/passwd.bak
# 输出：
# 10+0 records in
# 10+0 records out
# 5120 bytes (5.1 kB) copied, 0.000123 s, 41.6 MB/s

# 2. 复制文件并指定块大小
dd if=largefile.iso of=/tmp/copy.iso bs=1M

# 3. 显示进度（Linux 下）
dd if=/dev/zero of=/tmp/test bs=1M count=100 status=progress
# 输出：104857600 bytes (105 MB) copied, 0.5 s, 210 MB/s

# 4. 限制复制大小
dd if=/dev/urandom of=random.bin bs=1M count=10

# ========== 磁盘操作 ==========

# 5. 备份整个磁盘（克隆）
dd if=/dev/sda of=/backup/sda.img bs=4M status=progress

# 6. 恢复磁盘镜像
dd if=/backup/sda.img of=/dev/sda bs=4M status=progress

# 7. 备份分区
dd if=/dev/sda1 of=/backup/sda1.img bs=4M

# 8. 克隆磁盘到另一个磁盘
dd if=/dev/sda of=/dev/sdb bs=4M status=progress

# 9. 创建磁盘映像并压缩
dd if=/dev/sda bs=4M | gzip -c > /backup/sda.img.gz

# 10. 恢复压缩的磁盘映像
gunzip -c /backup/sda.img.gz | dd of=/dev/sda bs=4M

# ========== 创建启动盘 ==========

# 11. 写入 ISO 到 USB（创建启动盘）
sudo dd if=ubuntu.iso of=/dev/sdb bs=1M status=progress

# 12. 写入后同步（确保数据写入）
sudo dd if=ubuntu.iso of=/dev/sdb bs=1M oflag=sync status=progress

# 13. 清空 USB 引导扇区
sudo dd if=/dev/zero of=/dev/sdb bs=446 count=1

# ========== 数据擦除 ==========

# 14. 用零覆盖磁盘
sudo dd if=/dev/zero of=/dev/sdb bs=1M status=progress

# 15. 用随机数据覆盖磁盘（安全擦除）
sudo dd if=/dev/urandom of=/dev/sdb bs=1M status=progress

# 16. 擦除分区开头（清除超级块）
sudo dd if=/dev/zero of=/dev/sdb1 bs=4096 count=1024

# 17. 擦除 MBR（保留分区表）
sudo dd if=/dev/zero of=/dev/sda bs=512 count=1

# ========== 内存操作 ==========

# 18. 测试内存写入速度
dd if=/dev/zero of=/dev/null bs=1M count=1000

# 19. 测试内存读取速度
dd if=/dev/urandom of=/dev/null bs=1M count=1000

# 20. 测试磁盘写入速度
dd if=/dev/zero of=/tmp/test bs=1M count=1000 conv=fdatasync

# 21. 测试磁盘读取速度
dd if=/tmp/test of=/dev/null bs=1M

# ========== 跳过和定位 ==========

# 22. 跳过文件开头（跳过前 1MB）
dd if=file.bin of=output.bin bs=1M skip=1

# 23. 复制文件末尾（跳过前 10 块，复制 5 块）
dd if=file.bin of=output.bin bs=1M skip=10 count=5

# 24. 写入到指定位置（seek）
dd if=data.bin of=disk.img bs=1M seek=100

# 25. 使用字节计数（跳过 1024 字节）
dd if=file.bin of=output.bin bs=1 skip=1024 skip_bytes

# ========== 数据转换 ==========

# 26. 大小写转换
echo "Hello World" | dd conv=ucase
# 输出：HELLO WORLD

# 27. 大写转小写
echo "HELLO WORLD" | dd conv=lcase
# 输出：hello world

# 28. 处理读取错误（继续复制）
dd if=/dev/sda of=/backup/sda.img conv=noerror,sync bs=4M

# 29. 创建稀疏文件（节省空间）
dd if=/dev/zero of=sparse.img bs=1M count=0 seek=1000
# 创建大小为 1GB 但实际占用空间为 0 的稀疏文件

# 30. 交换字节（用于不同字节序）
dd if=input.bin of=output.bin conv=swab

# ========== 实际应用场景 ==========

# 31. 备份 MBR
dd if=/dev/sda of=mbr.bak bs=512 count=1

# 32. 备份 MBR 和分区表
dd if=/dev/sda of=mbr_full.bak bs=512 count=2048

# 33. 恢复 MBR
dd if=mbr.bak of=/dev/sda bs=512 count=1

# 34. 创建指定大小的空文件
dd if=/dev/zero of=empty.bin bs=1M count=100
# 创建 100MB 的空文件

# 35. 创建随机数据文件
dd if=/dev/urandom of=random.bin bs=1M count=10

# 36. 提取 ISO 中的引导扇区
dd if=ubuntu.iso of=boot.bin bs=512 count=1

# 37. 备份和恢复主引导记录
dd if=/dev/sda of=mbr.bin bs=512 count=1
dd if=mbr.bin of=/dev/sda bs=512 count=1

# 38. 创建加密磁盘镜像
dd if=/dev/zero of=encrypted.img bs=1M count=1000
sudo cryptsetup luksFormat encrypted.img

# 39. 拆分大文件
dd if=largefile.bin of=part1.bin bs=1M count=1000
dd if=largefile.bin of=part2.bin bs=1M skip=1000

# 40. 合并拆分文件
cat part1.bin part2.bin > largefile.bin

# ========== 高级技巧 ==========

# 41. 带进度条复制（使用 pv）
dd if=/dev/sda | pv | dd of=/dev/sdb bs=4M

# 42. 网络传输（发送端）
dd if=/dev/sda bs=4M | nc -l 9999

# 43. 网络传输（接收端）
nc 192.168.1.100 9999 | dd of=/backup/sda.img bs=4M

# 44. 使用更大的块大小提高性能
dd if=/dev/sda of=/dev/sdb bs=64M

# 45. 检查磁盘坏块
dd if=/dev/sda of=/dev/null bs=512 conv=noerror,sync

# 46. 恢复损坏的磁盘数据
dd if=/dev/sda of=/backup/sda.img conv=noerror,sync bs=4K

# 47. 生成测试文件
dd if=/dev/urandom of=testfile bs=1M count=100 status=progress

# 48. 备份当前分区表
sfdisk -d /dev/sda > partition_table.txt
dd if=/dev/sda of=mbr.bin bs=512 count=1

# ========== 脚本示例 ==========

# 49. 带备份确认的磁盘克隆脚本
#!/bin/bash
SOURCE="/dev/sda"
TARGET="/dev/sdb"
BACKUP_DIR="/backup"

echo "WARNING: This will clone $SOURCE to $TARGET"
read -p "Continue? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Creating backup of source MBR..."
    dd if=$SOURCE of=$BACKUP_DIR/mbr.bin bs=512 count=1
    echo "Starting clone..."
    dd if=$SOURCE of=$TARGET bs=4M status=progress
    echo "Clone complete"
fi

# 50. 磁盘健康检查脚本
#!/bin/bash
DEVICE="/dev/sda"
ERROR_COUNT=0
BLOCK_SIZE=1M
MAX_BLOCKS=1000

echo "Checking $DEVICE for read errors..."
for i in $(seq 1 $MAX_BLOCKS); do
    if ! dd if=$DEVICE of=/dev/null bs=$BLOCK_SIZE count=1 skip=$i 2>/dev/null; then
        echo "Error at block $i"
        ((ERROR_COUNT++))
    fi
done
echo "Found $ERROR_COUNT errors in first $MAX_BLOCKS blocks"

# 51. 带进度条的函数
dd_progress() {
    local if=$1
    local of=$2
    local bs=${3:-1M}
    local size=$(blockdev --getsize64 $if 2>/dev/null || stat -c%s $if 2>/dev/null)
    if [ -n "$size" ]; then
        dd if=$if of=$of bs=$bs status=progress &
        pid=$!
        wait $pid
    else
        dd if=$if of=$of bs=$bs
    fi
}
```

# **ar 命令** - 创建和管理静态库档案文件

**语法**：`ar [选项] 档案文件 成员文件`

**功能**：创建静态库文件（.a 文件），主要用于 C/C++ 程序打包目标文件（.o）供链接使用

**常用选项**：

- `-r`：插入文件到档案中

- `-x`：从档案中提取文件

- `-t`：列出档案中的内容

- `-c`：创建档案时不显示警告

- `-v`：显示详细过程

- `-s`：创建索引（便于链接）

```bash
# 1. 创建静态库（最常用）
# 先编译生成目标文件
gcc -c add.c sub.c
# 创建静态库
ar rcs libmath.a add.o sub.o

# 2. 查看库中有哪些文件
ar t libmath.a
# 输出：
# add.o
# sub.o

# 3. 查看详细信息（文件大小、权限等）
ar tv libmath.a

# 4. 从库中提取文件
ar x libmath.a add.o

# 5. 向已有库添加新文件
gcc -c mul.c
ar r libmath.a mul.o

# 6. 从库中删除文件
ar d libmath.a mul.o

# 7. 使用静态库编译程序
gcc main.c -L. -lmath -o program
# -L. 表示在当前目录查找库
# -lmath 表示链接 libmath.a
```

# **ldd 命令** - 显示可执行文件或共享库的依赖关系

**语法**：`ldd [选项] 文件`

**功能**：打印程序或共享库所依赖的动态链接库（共享库），用于检查程序运行时需要哪些 .so 文件

**常用选项**：

- `-v`：显示详细信息（包括版本信息）

- `-u`：显示未使用的直接依赖

- `-d`：执行数据重定位并报告缺失的符号

- `-r`：执行数据和函数重定位，报告所有缺失的符号

- `--version`：显示版本信息

```bash
# 1. 查看 ls 命令依赖哪些库
ldd /bin/ls
# 输出：
#     linux-vdso.so.1 (0x00007ffe5e1e0000)
#     libselinux.so.1 => /lib/x86_64-linux-gnu/libselinux.so.1
#     libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6
#     libpcre2-8.so.0 => /lib/x86_64-linux-gnu/libpcre2-8.so.0
#     /lib64/ld-linux-x86-64.so.2 (0x00007f8e2c200000)

# 2. 查看自己编译的程序
gcc -o myapp main.c
ldd ./myapp

# 3. 查看共享库本身依赖什么
ldd /lib/x86_64-linux-gnu/libc.so.6

# 4. 检查缺失的库（显示 not found）
ldd ./myapp
# 如果缺少库会显示：
# libxxx.so => not found

# 5. 查看详细信息
ldd -v /bin/ls | head -20
```

# **file 命令** - 识别文件类型

**语法**：`file [选项] 文件`

**功能**：通过检查文件内容（而非扩展名）来判断文件的真实类型，如文本、二进制、可执行文件、图片、压缩包等

**常用选项**：

- `-i`：显示 MIME 类型（如 text/plain、image/png）

- `-b`：不显示文件名，只显示类型信息

- `-z`：查看压缩文件内部的内容类型

- `-L`：对符号链接显示原文件的类型

- `-f`：从文件中读取要检查的文件列表

```bash
# 1. 查看文件类型
file /etc/passwd
# 输出：/etc/passwd: ASCII text

file /bin/ls
# 输出：/bin/ls: ELF 64-bit LSB executable, x86-64, dynamically linked

# 2. 查看图片类型
file image.jpg
# 输出：image.jpg: JPEG image data, JFIF standard 1.01

file image.png
# 输出：image.png: PNG image data, 1920 x 1080, 8-bit/color RGB

# 3. 查看压缩包类型
file archive.zip
# 输出：archive.zip: Zip archive data, at least v2.0 to extract

file archive.tar.gz
# 输出：archive.tar.gz: gzip compressed data

# 4. 显示 MIME 类型（适合脚本处理）
file -i /etc/passwd
# 输出：/etc/passwd: text/plain; charset=us-ascii

# 5. 不显示文件名
file -b /bin/ls
# 输出：ELF 64-bit LSB executable, x86-64, dynamically linked

# 6. 查看脚本文件
file script.sh
# 输出：script.sh: Bash script, ASCII text executable

# 7. 查看多个文件
file /etc/passwd /bin/ls image.jpg

# 8. 查看符号链接指向的文件
file -L /usr/bin/python
```

# **readelf 命令** - 显示 ELF 文件信息

**语法**：`readelf [选项] ELF文件`

**功能**：显示 ELF（可执行与可链接格式）文件的详细信息，包括文件头、段表、符号表、动态节等，用于分析和调试可执行文件、目标文件、共享库

**常用选项**：

- `-h`：显示 ELF 文件头

- `-l`：显示程序段头（程序头表）

- `-S`：显示节头（段表）

- `-s`：显示符号表

- `-d`：显示动态节（动态库依赖）

- `-r`：显示重定位信息

- `-a`：显示所有信息

- `-e`：显示所有头信息（等效于 -h -l -S）
```bash
# 1. 查看 ELF 文件头（文件类型、架构、入口点等）
readelf -h /bin/ls
# 输出：
# ELF Header:
#   Magic:   7f 45 4c 46 02 01 01 00 00 00 00 00 00 00 00 00
#   Class:                             ELF64
#   Data:                              2's complement, little endian
#   Type:                              EXEC (Executable file)
#   Machine:                           Advanced Micro Devices X86-64
#   Entry point address:               0x404900

# 2. 查看程序段头（运行时需要加载的段）
readelf -l /bin/ls

# 3. 查看节头（各个节的信息）
readelf -S /bin/ls

# 4. 查看动态节（程序依赖的共享库）
readelf -d /bin/ls
# 输出包含：
#  0x0000000000000001 (NEEDED)  Shared library: [libselinux.so.1]
#  0x0000000000000001 (NEEDED)  Shared library: [libc.so.6]

# 5. 查看符号表（函数名、变量名等）
readelf -s /bin/ls | head -20

# 6. 查看所有信息
readelf -a /bin/ls

# 7. 查看目标文件的节信息
gcc -c test.c
readelf -S test.o

# 8. 查看共享库的动态依赖
readelf -d /lib/x86_64-linux-gnu/libc.so.6 | grep NEEDED
```

# **objdump 命令** - 显示目标文件信息

**语法**：`objdump [选项] 目标文件`

**功能**：显示目标文件（.o、.so、可执行文件）的详细信息，包括反汇编代码、节信息、符号表等，是程序分析和逆向工程的常用工具

**常用选项**：

- `-d`：反汇编可执行代码段

- `-D`：反汇编所有节

- `-S`：反汇编时显示源代码（需要编译时加 -g）

- `-t`：显示符号表

- `-h`：显示节头信息

- `-x`：显示所有头信息

- `-p`：显示文件头信息

- `-r`：显示重定位条目

- `-T`：显示动态符号表
```bash
# 1. 查看节头（各段的大小、位置）
objdump -h /bin/ls

# 2. 反汇编可执行代码（查看汇编指令）
objdump -d /bin/ls | head -30

# 3. 显示符号表（函数名、变量名）
objdump -t /bin/ls | head -20

# 4. 查看动态符号表（动态库导出函数）
objdump -T /bin/ls | head -20

# 5. 显示所有头信息
objdump -x /bin/ls | head -50

# 6. 反汇编目标文件
gcc -c test.c
objdump -d test.o

# 7. 显示文件头信息
objdump -p /bin/ls

# 8. 反汇编并显示源代码（调试版）
gcc -g -o test test.c
objdump -S test | head -50
```

# **size 命令** - 显示目标文件各段大小

**语法**：`size [选项] 目标文件`

**功能**：显示可执行文件或目标文件的各段大小（text、data、bss 等），用于分析程序内存占用情况

**常用选项**：

- `-A`：使用 System V 格式显示（更详细）

- `-B`：使用 Berkeley 格式显示（默认）

- `-o`：以八进制显示大小

- `-d`：以十进制显示大小（默认）

- `-x`：以十六进制显示大小

- `-t`：显示总计
```bash
# 1. 显示可执行文件的段大小
size /bin/ls
# 输出：
#    text    data     bss     dec     hex filename
#  139648   10128    4496  154272   25aa0 /bin/ls
# text: 代码段大小
# data: 已初始化数据段大小
# bss:  未初始化数据段大小
# dec:  十进制总大小
# hex:  十六进制总大小

# 2. 显示目标文件的大小
gcc -c test.c
size test.o

# 3. 显示详细信息（System V 格式）
size -A /bin/ls
# 输出：
# /bin/ls ：
# section            size        addr
# .text            139648     4194304
# .data             10128     6299664
# .bss               4496     6289920
# Total            154272

# 4. 显示多个文件
size /bin/ls /bin/ps /bin/bash

# 5. 显示总计（多个文件时）
size -t /bin/ls /bin/ps

# 6. 以十六进制显示
size -x /bin/ls

# 7. 查看自己程序的占用
gcc -o myapp myapp.c
size myapp
```

# **ipcs 命令** - 显示进程间通信资源信息

**语法**：`ipcs [选项]`

**功能**：显示系统中进程间通信（IPC）资源的状态，包括共享内存、消息队列、信号量等

**常用选项**：

- `-m`：显示共享内存信息

- `-q`：显示消息队列信息

- `-s`：显示信号量信息

- `-a`：显示所有IPC资源（默认）

- `-l`：显示系统限制信息

- `-u`：显示摘要信息

- `-p`：显示共享内存的进程ID

- `-c`：显示创建者信息
```bash
# 1. 显示所有IPC资源
ipcs
# 输出：
# ------ Shared Memory Segments --------
# key        shmid      owner      perms      bytes      nattch     status
# 0x00000000 32768      user       600        4096       2          dest
#
# ------ Semaphore Arrays --------
# key        semid      owner      perms      nsems
#
# ------ Message Queues --------
# key        msqid      owner      perms      used-bytes   messages

# 2. 只显示共享内存
ipcs -m

# 3. 只显示消息队列
ipcs -q

# 4. 只显示信号量
ipcs -s

# 5. 显示详细信息（进程ID等）
ipcs -m -p

# 6. 显示系统IPC限制
ipcs -l
# 输出：
# ------ Shared Memory Limits --------
# max number of segments = 4096
# max seg size (kbytes) = 18014398509465599
# max total shared memory (kbytes) = 18014398509465599
# min seg size (bytes) = 1

# 7. 显示摘要统计
ipcs -u

# 8. 显示创建者信息
ipcs -m -c
```

# **ipcrm 命令** - 删除进程间通信资源

**语法**：`ipcrm [选项] 资源标识`

**功能**：删除系统中的 IPC 资源（共享内存、消息队列、信号量），释放被占用的系统资源

**常用选项**：

- `-m shmid`：删除指定 ID 的共享内存

- `-M key`：删除指定 key 的共享内存

- `-q msqid`：删除指定 ID 的消息队列

- `-Q key`：删除指定 key 的消息队列

- `-s semid`：删除指定 ID 的信号量

- `-S key`：删除指定 key 的信号量

- `-a`：删除所有 IPC 资源（谨慎使用）
```bash
# 1. 先查看 IPC 资源
ipcs -m
# 输出：
# key        shmid      owner      perms      bytes      nattch     status
# 0x00000000 32768      user       600        4096       2          dest

# 2. 删除共享内存（使用 shmid）
ipcrm -m 32768

# 3. 删除消息队列
ipcs -q
# 假设 msqid 为 65536
ipcrm -q 65536

# 4. 删除信号量
ipcs -s
# 假设 semid 为 98304
ipcrm -s 98304

# 5. 删除指定 key 的共享内存
ipcrm -M 0x00000000

# 6. 删除所有 IPC 资源（谨慎！）
ipcrm -a

# 7. 删除程序残留的共享内存
# 先查看
ipcs -m | grep username
# 再删除
ipcrm -m 32768 32769 32770

# 8. 批量删除（脚本）
ipcs -m | awk '/user/ {print $2}' | xargs -I {} ipcrm -m {}
```
