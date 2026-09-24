---
title: "Git"
published: 2026-04-08 11:50:58
description: "工作区 当前你正在编辑的文件目录"
category: "Linux 系统"
tags: ["Linux 系统"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. Git 的三个工作区域

1. **工作区**
	当前你正在编辑的文件目录

2. **暂存区**
	使用 `git add` 后进入

3. **本地仓库**
	使用 `git commit` 后进入

# 2. Git 基本命令

## 2.1 创建放置代码的目录（暂存区  ） - clone
```bash
git clone [url]
```

## 2.2 添加文件到暂存区 - add
```csharp
git add [⽂件名]
```

## 2.3 提交到本地仓库 - commit
```sql
git commit -m "XXX"
```
最后的 "." 表⽰当前⽬录
提交的时候应该注明提交⽇志, 描述改动
## 2.4 推送到远程仓库 - push
```bash
git push
```

## 2.5 查看状态
```bash
git status
```

## 2.6 查看提交历史
```bash
git log
```

# 3. Git 管理的内容

- **Git 只管理：**
	1. 源代码
	2. 变化内容

- **Git 不适合管理：**
	 1. 编译产物（.o、exe）
	2. 日志文件
	3. 临时文件

# 4. `.gitignore`：忽略文件配置

**用途**
忽略不需要纳入版本控制的文件

 **示例内容**
```bash
 *.o
*.exe
build/
log/
```

# 5. 远程仓库冲突问题
## 5.1 报错示例
```sql
! [rejected] master -> master (fetch first)
error: failed to push some refs
```

**冲突产生原因**
- 多人同时修改
- 本地与远程不同步

 **原因**
> **远程仓库比本地更新，你需要先同步**

## 5.2 解决方案
```perl
git pull
git push
```
