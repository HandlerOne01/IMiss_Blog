---
title: "MySQL_From_DeepSeek"
published: 2026-09-10 19:26:18
description: "0. 学习路线与环境准备 0.1 MySQL 是什么 0.2 安装与启动服务 0.3 用命令行连上数据库 0.4 客户端里必须会用的 10 个命令 0.5 导入配套练习库"
category: "MySQL"
tags: ["MySQL"]
lang: "zh_CN"
draft: false
comment: true
---

# MySQL 零基础入门教程：从"装好数据库"到"写出能跑的分析查询"

> **适合读者**：完全没接触过数据库，或者只会照抄别人的 SQL 但说不清原理的同学。
> 你不需要任何编程基础，只要会打字、会复制粘贴命令就行。
>
> **版本**：MySQL 5.7 / MySQL 8.0 都适用；凡是只在 8.0 才有的功能，文中都会明确标注 **【8.0+】**。
>
> **配套文件**（都在 `mysql-practice/` 目录里，边看边敲效果最好）：
>
> | 文件 | 作用 |
> | --- | --- |
> | `00_init_database.sql` | 一键创建两个练习库：`shop`（电商）和 `school`（学生成绩），共 8 张表、真实数据已备好 |
> | `01_basic_queries.sql` | 第 3～5 章的动手脚本（增删改 + 基础查询 + 分组） |
> | `02_join_and_subquery.sql` | 第 6～8 章的动手脚本（多表连接 + 子查询 + 窗口函数） |
> | `03_index_and_transaction.sql` | 第 9～10 章的动手脚本（索引 + EXPLAIN + 事务与锁） |
> | `04_exercises_answers.sql` | 第 17 章综合实战 20 题的**参考答案** |
> | `verify/expected-results.mjs` | 教程作者自检用的小工具：用 SQLite 复算文中所有"示例输出"，保证结果没错 |
>
> **强烈建议**：先花 10 分钟把 `00_init_database.sql` 跑起来（见 0.5 节），
> 之后每一段 SQL 都自己敲一遍、看一眼输出。**数据库是"练"会的，不是"读"会的。**

---

## 目录

**准备篇**
- [0. 学习路线与环境准备](#0-学习路线与环境准备)
  - [0.1 MySQL 是什么](#01-mysql-是什么它能干什么)
  - [0.2 安装与启动服务](#02-安装与启动-mysql-服务)
  - [0.3 用命令行连上数据库](#03-用命令行客户端连上数据库)
  - [0.4 客户端里必须会用的 10 个命令](#04-mysql-客户端里必须会用的-10-个命令)
  - [0.5 导入配套练习库](#05-导入配套练习库)

**基础篇**
- [1. 数据库核心概念（10 分钟建立世界观）](#1-数据库核心概念10-分钟建立世界观)
- [2. 数据类型与建表（DDL）](#2-数据类型与建表ddl)
- [3. 增删改（DML）](#3-增删改dml)

**查询篇（本教程的重点）**
- [4. 查询基础 SELECT](#4-查询基础-select)
- [5. 分组聚合 GROUP BY / HAVING](#5-分组聚合-group-by--having)
- [6. 多表连接 JOIN](#6-多表连接-join)
- [7. 子查询](#7-子查询)
- [8. 窗口函数【8.0+】](#8-窗口函数80)

**进阶篇**
- [9. 索引与执行计划 EXPLAIN](#9-索引与执行计划-explain)
- [10. 事务与锁](#10-事务与锁)
- [11. 视图 / 存储过程 / 函数 / 触发器 / 事件](#11-视图--存储过程--函数--触发器--事件)
- [12. 用户与权限管理](#12-用户与权限管理)
- [13. 备份、恢复与导入导出](#13-备份恢复与导入导出)

**手册篇**
- [14. 常用命令速查表（大合集）](#14-常用命令速查表大合集)
- [15. 常见报错速查（错误码 → 原因 → 解决）](#15-常见报错速查错误码--原因--解决)
- [16. 性能优化入门清单](#16-性能优化入门清单)
- [17. 综合实战：20 道电商数据分析题](#17-综合实战20-道电商数据分析题)
- [18. 学习路线、面试高频问题与 FAQ](#18-学习路线面试高频问题与-faq)
- [附录 A：文件清单](#附录-a配套文件清单)
- [附录 B：MySQL 5.7 与 8.0 的主要差异](#附录-bmysql-57-与-80-的主要差异)
- [附录 C：术语中英对照表](#附录-c术语中英对照表)

---

# 0. 学习路线与环境准备

## 0.1 MySQL 是什么？它能干什么？

**一句话**：MySQL 是一个"专门用来长期、安全地存放数据，并能按你的要求快速取出来"的软件。
这类软件统称为 **数据库管理系统（DBMS）**，MySQL 是目前最流行的**关系型**数据库之一。

先用一个生活比喻建立直觉，后面所有概念都从这个比喻长出来：

| 数据库术语 | 生活比喻 | 说明 |
| --- | --- | --- |
| 数据库（Database） | 一个 Excel 文件 | 一个项目一个库，比如"电商系统库 `shop`" |
| 表（Table） | Excel 里的一个 Sheet | 同一种东西放一张表：客户表、订单表 |
| 列 / 字段（Column / Field） | Sheet 的表头 | 每列必须有明确的类型，如"姓名 VARCHAR(50)" |
| 行 / 记录（Row / Record） | Sheet 的一行数据 | 一行 = 一个客户、一笔订单 |
| 主键（Primary Key） | 身份证号 | 唯一标识一行，不能重复、不能为空 |
| 外键（Foreign Key） | "订单必须属于某个已有客户" | 保证数据不"凭空乱指" |
| 索引（Index） | 书的目录 | 没有目录只能一页页翻（全表扫描），有目录才能秒定位 |
| SQL | 你跟数据库说话的语言 | 你说"给我 5 月消费最高的 10 个客户"，它给你结果 |

**关系型**的意思是：数据分散在多张表里，表与表之间通过**主键-外键**建立"关系"，
需要时用 `JOIN`（连接）把它们拼起来看。这样设计的好处是**不重复存数据**，改一处就全对。

## 0.2 安装与启动 MySQL 服务

MySQL 分两部分，别搞混：

- **MySQL Server（服务端）**：真正管数据的后台程序，装一次，一直以后台服务运行。
- **MySQL Client（客户端）**：你敲命令的工具，最常见的就是命令行程序 `mysql`。

### Windows

1. 去官网下载 **MySQL Installer for Windows**（推荐 8.0 版本），安装时选 `Server only` 或 `Developer Default`。
2. 配置向导里会要求设置 **root 密码**——**请务必记住**，忘了只能重装。
3. 字符集选 `utf8mb4`（默认就是），认证方式选 `Use Strong Password Encryption`（即 `caching_sha2_password`）。
4. 安装完 MySQL 会作为 Windows 服务自动启动，服务名通常叫 `MySQL80`。

```bat
:: 以下命令在【管理员身份】的 cmd / PowerShell 里执行
net start MySQL80          :: 启动服务
net stop  MySQL80          :: 停止服务
sc query  MySQL80          :: 查看服务运行状态（RUNNING / STOPPED）

:: 如果忘记服务名，可以先列出来
sc queryex type= service state= all | findstr /i mysql
```

也可以按 `Win + R` 输入 `services.msc` 打开"服务"面板，找到 MySQL 手动启动。

### macOS

```bash
brew install mysql                 # 用 Homebrew 安装
brew services start mysql          # 启动（并设置开机自启）
brew services stop mysql           # 停止
mysql.server start                 # 不想用 brew services 时的另一种启动方式
```

### Linux（Ubuntu / Debian 系）

```bash
sudo apt update && sudo apt install mysql-server   # 安装
sudo systemctl start  mysql                        # 启动
sudo systemctl enable mysql                        # 开机自启
sudo systemctl status mysql                        # 查看状态
sudo mysql_secure_installation                     # 安全初始化（设 root 密码、删匿名用户等）
```

> **小技巧**：在 Linux 上默认 root 走 `auth_socket` 认证，所以 `sudo mysql` 能进，
> 普通 `mysql -u root -p` 却报 1045。解决办法见 [15 章错误码表](#15-常见报错速查错误码--原因--解决)。

## 0.3 用命令行客户端连上数据库

装好后，打开终端（Windows 用 cmd / PowerShell，macOS/Linux 用 Terminal），输入：

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p
```

回车后提示 `Enter password:`，输入你设置的 root 密码（**输入时不显示任何字符，这是正常的**），
看到 `mysql>` 提示符就说明连上了。

`mysql` 命令的参数含义（这个表建议背下来）：

| 参数 | 含义 | 例子 |
| --- | --- | --- |
| `-h` | host，服务器地址 | `-h 127.0.0.1` 本机；`-h 192.168.1.10` 远程；`-h localhost` 走本地 socket |
| `-P` | **大写 P**，端口号，默认 3306 | `-P 3307` |
| `-u` | user，用户名 | `-u root` |
| `-p` | password，密码 | `-p` 回车后再输（安全）；`-p123456` 紧跟密码（**不安全，会留在命令历史里**） |
| `-D` | 直接切到某个库 | `-D shop` |
| `-e` | 执行一条 SQL 后立即退出 | `mysql -uroot -p -e "SELECT VERSION();"` |
| `--default-character-set` | 指定客户端字符集 | `--default-character-set=utf8mb4` |
| `-A` | 不预读表名补全信息（库很多时连得更快） | `-A` |
| `--prompt` | 自定义提示符 | `--prompt="\\u@\\h[\\d]> "` |

几个实战例子：

```bash
# 1) 连接本机，进入交互模式
mysql -u root -p

# 2) 连上后直接执行一条 SQL，结果以表格输出后退出（写脚本时最常用）
mysql -u root -p -e "SHOW DATABASES;"

# 3) 连接远程服务器并直接进入 shop 库
mysql -h 192.168.1.10 -P 3306 -u app_user -p -D shop

# 4) 一行流：把查询结果导出成 CSV 风格文本（-B 制表符分隔，-N 不输出表头）
mysql -u root -p -B -N -e "SELECT name, price FROM shop.product LIMIT 3;" > out.tsv
```

> **注意**：`-p` 和密码之间**不能有空格**。`-p 123456` 会被理解成"密码为空，并把 `123456` 当成数据库名"。

## 0.4 mysql 客户端里必须会用的 10 个命令

这些是 `mysql` 客户端自己的"元命令"（meta-command），**不是 SQL，结尾不需要分号**：

| 命令 | 全称 | 作用 | 记住它的理由 |
| --- | --- | --- | --- |
| `help` 或 `\h` | help | 查看帮助；`help 'SELECT'` 查具体语法 | 忘了语法时不用上网搜 |
| `status` 或 `\s` | status | 显示当前连接信息：版本、字符集、当前库、端口 | 排查乱码/连错库的第一招 |
| `source 文件路径` 或 `\.` | source | **执行一个 .sql 文件** | 导入脚本、恢复备份天天用 |
| `use 库名` 或 `\u 库名` | use | 切换当前数据库 | 忘了切库是新手第一大坑 |
| `quit` / `exit` / `\q` | quit | 退出客户端 | —— |
| `\G` | —— | 把结果**竖着**显示（代替结尾分号） | 表很宽时输出不会折行错乱 |
| `tee 文件路径` 或 `\T` | tee | 把之后所有输出同时写入文件 | 记录操作过程 |
| `\! 系统命令` | —— | 在客户端里执行操作系统命令 | 不用退出就能 `ls` / `dir` |
| `\c` | clear | 放弃当前正在输入的多行语句 | 输错了想重来 |
| `prompt 字符串` | prompt | 自定义提示符，如显示当前库 | 防止"在错误的库里执行错误的语句" |

一个个试一遍（**先连上数据库**）：

```sql
-- 1) 看自己连的是谁、字符集对不对（乱码第一排查命令）
status;

-- 2) 看服务器版本和当前时间
SELECT VERSION(), NOW(), USER(), DATABASE();

-- 3) 列出所有数据库
SHOW DATABASES;

-- 4) 切换数据库（接下来的语句都作用在 shop 里）
USE shop;
SELECT DATABASE();      -- 再确认一次：返回 shop

-- 5) 列出当前库的所有表
SHOW TABLES;

-- 6) 看表结构：字段、类型、是否为空、键、默认值
DESC product;           -- DESC 是 DESCRIBE 的缩写

-- 7) 看建表原句（含索引、外键、字符集）
SHOW CREATE TABLE product\G

-- 8) 竖排显示：字段很多的表看起来更舒服
SELECT * FROM product WHERE product_id = 1\G

-- 9) 执行磁盘上的 SQL 文件
source D:/HuaweiMoveData/Users/HUAWEI/Desktop/dsh/mysql-practice/00_init_database.sql

-- 10) 查看帮助（比如忘了 SHOW 有哪些子命令）
help 'SHOW';
```

> **新手最容易犯的 3 个错**
> 1. 写完 SQL 忘了分号 `;`，然后一直等在 `->` 提示符后面。补救：补一个 `;`，或输入 `\c` 取消。
> 2. 没 `USE 库名` 就查询，报 `ERROR 1046 (3D000): No database selected`。
> 3. 中文乱码：先 `status` 看 `Client characterset` / `Server characterset` 是不是 `utf8mb4`。

## 0.5 导入配套练习库

本教程所有例子都基于这两个库：**`shop`（电商，5 张表）** 和 **`school`（学生成绩，3 张表）**。

**方式一（推荐，在系统命令行里执行）**：

```bash
mysql -u root -p < D:/HuaweiMoveData/Users/HUAWEI/Desktop/dsh/mysql-practice/00_init_database.sql
```

**方式二（已经进入 mysql 客户端）**：

```sql
source D:/HuaweiMoveData/Users/HUAWEI/Desktop/dsh/mysql-practice/00_init_database.sql
```

脚本末尾会打印各表行数，**只要数字和下面一致，就说明导入成功**：

```txt
+-----------------+--------+
| 表名            | 行数   |
+-----------------+--------+
| shop.category   |      5 |
| shop.product    |     12 |
| shop.customer   |      9 |
| shop.orders     |     15 |
| shop.order_item |     22 |
| school.student  |      6 |
| school.course   |      4 |
| school.score    |     20 |
+-----------------+--------+
```

> ⚠️ 脚本开头有 `DROP DATABASE IF EXISTS shop;`，**重复执行会清空这两个库的数据**。
> 自己练手时随便重跑没问题，但别在别人的生产服务器上跑。

---

# 1. 数据库核心概念（10 分钟建立世界观）

## 1.1 三层结构：服务器 → 数据库 → 表

```
MySQL 服务器（一个进程，监听 3306 端口）
├── 数据库 school          ← 一个项目一个库
│   ├── 表 student
│   ├── 表 course
│   └── 表 score
└── 数据库 shop
    ├── 表 category
    ├── 表 product
    ├── 表 customer
    ├── 表 orders
    └── 表 order_item
```

访问任何一张表，完整写法是 `库名.表名`：`SELECT * FROM shop.product;`。
如果先 `USE shop;`，就可以简写成 `SELECT * FROM product;`。

## 1.2 用一张图看懂 shop 库的表关系

```
 ┌────────────┐ 1        N ┌────────────┐ 1        N ┌──────────────┐
 │  customer  │────────────│   orders   │────────────│  order_item  │
 │  客户表     │  一个客户  │   订单表    │  一笔订单  │  订单明细表   │
 └────────────┘  多笔订单   └────────────┘  多条明细   └───────┬──────┘
                                                              │ N
                                                              │ 一条明细
                                                              │ 对应一件商品
                                                     ┌────────┴────────┐
                                                     │ N            1  │
                                              ┌──────┴─────┐   ┌──────┴─────┐
                                              │  product   │ N │  category  │
                                              │   商品表    │───│   分类表    │
                                              └────────────┘ 1 └────────────┘
```

读图方法（**这是理解 JOIN 的关键**）：

- `customer` 与 `orders`：**一对多（1:N）**。「1」的那一端是主键，`orders` 里用 `customer_id` 指向它。
- `orders` 与 `order_item`：一对多。一笔订单可以买多件商品，所以明细单独成表。
- `product` 与 `category`：一对多。商品属于某个分类。
- 注意 `order_item` 这张"中间表"：它把**订单**和**商品**这两个多对多的东西拆成了两个一对多，
  并且**额外保存了 `quantity`（数量）和 `unit_price`（下单时的单价）**。
  `unit_price` 是**价格快照**——商品以后涨价了，历史订单金额也不能跟着变，这是业务上的硬要求。
- `school` 库同理：`student` 1:N `score` N:1 `course` —— 经典的"学生选课"多对多模型。

## 1.3 SQL 语句分五大类（后面章节按这个顺序讲）

| 类别 | 全称 | 代表语句 | 干什么 | 本教程章节 |
| --- | --- | --- | --- | --- |
| DDL | Data Definition Language | `CREATE` `ALTER` `DROP` `TRUNCATE` | 定义/修改**结构**（库、表、索引） | 第 2 章 |
| DML | Data Manipulation Language | `INSERT` `UPDATE` `DELETE` | 增删改**数据** | 第 3 章 |
| DQL | Data Query Language | `SELECT` | 查询数据（DML 的一个子集，因为太重要被单独拿出来） | 第 4～8 章 |
| DCL | Data Control Language | `GRANT` `REVOKE` | 授权与回收权限 | 第 12 章 |
| TCL | Transaction Control Language | `BEGIN` `COMMIT` `ROLLBACK` | 事务控制 | 第 10 章 |

> **记忆点**：`DDL` 管"骨架"（改了立刻生效、通常不能回滚），`DML` 管"血肉"（可以放在事务里回滚）。

## 1.4 书写规范（初学就养成，能省很多事）

```sql
-- 1) SQL 关键字大写，表名字段名小写：一眼分得清哪是语法哪是数据
SELECT product_id, name, price
FROM   product
WHERE  price > 3000
ORDER  BY price DESC;

-- 2) 每条语句以分号结尾；一条语句可以跨很多行，MySQL 读到分号才执行
-- 3) 注释两种写法：-- 后至少跟一个空格（单行）；/* ... */（可跨行）
SELECT
    name,       -- 商品名
    price       -- 单价
    /* 下面是库存 */
    , stock
FROM product;

-- 4) 库名/表名/字段名默认区分大小写吗？在 Windows 上表名不区分、Linux 上区分！
--    所以统一都用小写，跨平台就不会踩坑。
-- 5) 表名/字段名如果和关键字撞了（比如 order、desc、key），用反引号包起来：
SELECT `name` FROM `orders`;
```

---

# 2. 数据类型与建表（DDL）

## 2.1 数值类型

| 类型 | 占字节 | 取值范围（有符号） | 典型用途 |
| --- | --- | --- | --- |
| `TINYINT` | 1 | -128 ~ 127 | 状态标记、年龄、0/1 开关 |
| `SMALLINT` | 2 | -32768 ~ 32767 | 数量、年份 |
| `MEDIUMINT` | 3 | -838 万 ~ 838 万 | 较少用 |
| `INT` / `INTEGER` | 4 | -21 亿 ~ 21 亿 | **最常用**：ID、数量、计数 |
| `BIGINT` | 8 | ±922 亿亿 | 订单号、雪花 ID、超大计数 |
| `DECIMAL(M,D)` | 变长 | 精确小数，`M` 总位数、`D` 小数位 | **金额**：`DECIMAL(10,2)` 表示最多 10 位、其中 2 位小数 |
| `FLOAT` | 4 | 约 7 位有效数字 | 科学计算，**不要用来存钱** |
| `DOUBLE` | 8 | 约 15 位有效数字 | 同上 |

```sql
-- ========== 重要实验：浮点数为什么不能用来存钱？ ==========
-- 先建一张表，放一列 FLOAT、一列 DOUBLE、一列 DECIMAL，都存 0.1
DROP TABLE IF EXISTS t_float;
CREATE TABLE t_float (f FLOAT, d DOUBLE, c DECIMAL(10,2));
INSERT INTO t_float VALUES (0.1, 0.1, 0.1);

SELECT f + 0.2 = 0.3 AS float相等吗,      -- 0 ← 不相等！
       d + 0.2 = 0.3 AS double相等吗,     -- 0 ← 不相等！
       c + 0.2 = 0.3 AS decimal相等吗     -- 1 ← DECIMAL 是精确的
FROM t_float;

-- 想亲眼看到"差在哪"：
SELECT f, d, c FROM t_float;               -- 显示时都被四舍五入成 0.1，看不出问题
SELECT f + 0.2 AS float结果, d + 0.2 AS double结果, c + 0.2 AS decimal结果 FROM t_float;
-- float结果/double结果 会显示出 0.30000000000000004 这类"尾巴"

-- 顺便破除一个常见误解：下面这条【成立】（返回 1），别惊讶
SELECT 0.1 + 0.2 = 0.3 AS 字面量相加;      -- 1
-- 原因：MySQL 里带小数点的数字字面量默认是【DECIMAL】（精确小数），不是浮点数。
-- 但写成科学计数法就是 DOUBLE 了，于是就不精确了：
SELECT 0.1E0 + 0.2E0 = 0.3E0 AS 浮点字面量相加;   -- 0
-- ★ 结论：金额一律用 DECIMAL；FLOAT/DOUBLE 只用于科学计算、统计近似值。
```

> **`INT(11)` 里的 11 是什么？** 是**显示宽度**（老客户端的零填充用），**和取值范围无关**。
> `INT(11)` 和 `INT` 能存的范围完全一样。MySQL 8.0.17 起显示宽度已被官方废弃，**新代码直接写 `INT`**。
> 真正控制位数的是 `ZEROFILL`/`UNSIGNED` 这类属性，但 `UNSIGNED` 也建议少用（见下）。

## 2.2 字符串类型

| 类型 | 特点 | 使用建议 |
| --- | --- | --- |
| `CHAR(n)` | **定长**，不足补空格，取出时去掉尾部空格 | 长度固定的：手机号 `CHAR(11)`、MD5 `CHAR(32)`、性别 `CHAR(1)` |
| `VARCHAR(n)` | **变长**，只存实际长度 + 1~2 字节长度前缀 | 最常用：姓名 `VARCHAR(50)`、地址 `VARCHAR(200)` |
| `TEXT` | 最长 65535 字节，**不能有默认值**，不能整列建索引 | 文章正文、备注 |
| `MEDIUMTEXT` / `LONGTEXT` | 16MB / 4GB | 超大文本、日志 |
| `BLOB` 系列 | 存二进制（图片、文件） | **不建议**把图片塞数据库，存文件路径更常见 |

```sql
-- CHAR 与 VARCHAR 的差别（注意 CHAR 会丢掉尾部空格）
CREATE TABLE t_str (
    c CHAR(5),
    v VARCHAR(5)
);
INSERT INTO t_str VALUES ('ab   ', 'ab   ');   -- 第一个补空格，第二个原样存
SELECT CONCAT('[', c, ']') AS char列, LENGTH(c) AS char字节数,
       CONCAT('[', v, ']') AS varchar列, LENGTH(v) AS varchar字节数
FROM t_str;
-- 结果： char列=[ab]  char字节数=2   varchar列=[ab   ]  varchar字节数=5

-- 字符数 vs 字节数（中文在 utf8mb4 里占 3 字节，emoji 占 4 字节）
SELECT CHAR_LENGTH('数据库') AS 字符数,      -- 3
       LENGTH('数据库')      AS 字节数,      -- 9
       CHAR_LENGTH('😀')     AS emoji字符数,  -- 1
       LENGTH('😀')          AS emoji字节数;  -- 4
```

> **`VARCHAR(n)` 的 n 是字符数，不是字节数**。`VARCHAR(50)` 在 utf8mb4 下能存 50 个中文。
> 但整行所有列加起来不能超过 65535 字节（utf8mb4 下大约 16000 个中文字符），超了报 1118/1074。
> 长文本请用 `TEXT`。另外 **utf8mb3 存不了 emoji，必须用 `utf8mb4`**。

## 2.3 日期时间类型

| 类型 | 格式 | 范围 | 说明 |
| --- | --- | --- | --- |
| `DATE` | `YYYY-MM-DD` | 1000-01-01 ~ 9999-12-31 | 生日、日期 |
| `TIME` | `HH:MM:SS` | -838:59:59 ~ 838:59:59 | 时长、时刻 |
| `DATETIME` | `YYYY-MM-DD HH:MM:SS` | 1000 ~ 9999 年 | **最常用**：下单时间、创建时间（不做时区转换） |
| `TIMESTAMP` | `YYYY-MM-DD HH:MM:SS` | 1970-01-01 ~ **2038-01-19** | 存 UTC 时间戳，**会随服务器时区自动换算** |
| `YEAR` | `YYYY` | 1901 ~ 2155 | 年份 |

```sql
-- DATETIME 与 TIMESTAMP 的区别（这是面试常问）
CREATE TABLE t_time (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    dt      DATETIME  DEFAULT CURRENT_TIMESTAMP,   -- 创建时自动填当前时间
    ts      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- 创建/更新都自动维护
    birth   DATE
);
INSERT INTO t_time (birth) VALUES ('2000-01-01');   -- dt、ts 自动填充
SELECT * FROM t_time;

-- 一句话选择建议：
--   记录"业务发生的时刻"（下单、支付、生日）用 DATETIME —— 不受时区影响、能存 2038 年以后；
--   需要"跟着服务器时区自动转换"（国际化系统）才用 TIMESTAMP。
```

> ⚠️ **2038 问题**：`TIMESTAMP` 上限是 `2038-01-19 03:14:07`（32 位整数上限）。
> 系统设计寿命超过 2038 年，就用 `DATETIME` 或 `BIGINT` 存毫秒时间戳。

## 2.4 其他常用类型

| 类型 | 说明 | 例子 |
| --- | --- | --- |
| `ENUM('a','b')` | 枚举，只能取列表里的值，内部按**定义顺序**存 1,2,3... | 订单状态 `ENUM('待付款','已付款','已发货','已完成','已取消')` |
| `SET('a','b')` | 多选集合，可存多个值（逗号分隔） | 用户标签 |
| `JSON` **【8.0 增强】** | 存 JSON 并可直接用 `->` / `->>` 取值 | 商品扩展属性 |
| `BIT(1)` / `BOOLEAN` | 布尔（MySQL 里 `BOOLEAN` 就是 `TINYINT(1)`） | 是否删除标记 |
| `BINARY` / `VARBINARY` | 定长/变长二进制 | 加密后的密文 |

```sql
-- ENUM 的两个坑
--   坑1：插入不在列表里的值，在严格模式下直接报错 1265；
--        非严格模式会插入"空字符串"并给警告 —— 所以别关闭严格模式。
--   坑2：ENUM 排序按"定义顺序"而不是拼音/字母！
SELECT status FROM orders ORDER BY status;   -- 待付款 < 已付款 < 已发货 < 已完成 < 已取消（按定义先后）

-- JSON 示例【8.0+】
CREATE TABLE t_json (
    id   INT AUTO_INCREMENT PRIMARY KEY,
    info JSON
);
INSERT INTO t_json (info) VALUES ('{"brand":"小米","tags":["手机","5G"],"price":3999}');
SELECT info ->> '$.brand'          AS 品牌,       -- 小米（->> 取出来是字符串）
       info -> '$.tags'            AS 标签数组,    -- ["手机", "5G"]（-> 取出来还是 JSON）
       JSON_EXTRACT(info,'$.price')AS 价格,       -- 3999（JSON_EXTRACT 是 -> 的函数写法）
       info ->> '$.tags[0]'        AS 第一个标签   -- 手机
FROM t_json;
```

## 2.5 建库（CREATE DATABASE）

```sql
-- 完整语法（方括号表示可选）
-- CREATE DATABASE [IF NOT EXISTS] 库名
--   [DEFAULT] CHARACTER SET 字符集
--   [DEFAULT] COLLATE 排序规则;

CREATE DATABASE IF NOT EXISTS demo          -- IF NOT EXISTS：已存在时不报错（可重复执行）
    DEFAULT CHARACTER SET utf8mb4           -- 强烈建议一律 utf8mb4
    DEFAULT COLLATE utf8mb4_general_ci;     -- ci = 比较时不区分大小写

-- 常用的库级操作
SHOW DATABASES;                             -- 列出所有库
SHOW CREATE DATABASE demo;                  -- 查看建库语句
ALTER DATABASE demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;  -- 改字符集
DROP DATABASE IF EXISTS demo;               -- 删库（极其危险！没有回收站）
```

**排序规则（collation）怎么选？**

| 排序规则 | 含义 | 场景 |
| --- | --- | --- |
| `utf8mb4_general_ci` | 不区分大小写，比较快但不完全符合语言学规则 | 5.7 的默认值，兼容性好 |
| `utf8mb4_unicode_ci` | 不区分大小写，按 Unicode 标准排序（更准） | 跨语言场景 |
| `utf8mb4_0900_ai_ci` | **8.0 默认**，基于 Unicode 9.0，`ai` = accent insensitive（不区分重音） | 8.0 新库默认即可 |
| `utf8mb4_bin` | 按二进制比较，**区分大小写** | 需要区分 `Abc` 和 `abc` 时 |

```sql
-- 体会 ci 与 bin 的差别
SELECT 'ABC' = 'abc' COLLATE utf8mb4_general_ci AS 不区分大小写,  -- 1
       'ABC' = 'abc' COLLATE utf8mb4_bin        AS 区分大小写;    -- 0
```

## 2.6 建表：完整示例逐行拆解

下面这张表就是练习库里的 `shop.product`（已简化注释），**每一行都值得读一遍**：

```sql
CREATE TABLE product (
    -- ① 主键列：INT 类型 + UNSIGNED 非负 + NOT NULL + AUTO_INCREMENT 自增
    product_id  INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '商品ID（主键）',

    -- ② 必填字符串列。NOT NULL = 插入时必须给值
    name        VARCHAR(100)  NOT NULL                COMMENT '商品名称',

    -- ③ 外键列：存的是 category 表的主键值
    category_id INT UNSIGNED  NOT NULL                COMMENT '所属分类ID',

    -- ④ 金额用 DECIMAL(10,2)；DEFAULT 0.00 表示不写这列时默认 0 元
    price       DECIMAL(10,2) NOT NULL DEFAULT 0.00   COMMENT '单价（元）',

    -- ⑤ 整数列 + 默认值
    stock       INT           NOT NULL DEFAULT 0      COMMENT '库存数量',

    -- ⑥ 枚举列：只允许这三个值之一，默认"在售"
    status      ENUM('在售','下架') NOT NULL DEFAULT '在售' COMMENT '商品状态',

    -- ⑦ 时间列：不传值时自动填当前时间
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上架时间',

    -- ⑧ 定义主键（也可以直接写在列后面：product_id INT PRIMARY KEY）
    PRIMARY KEY (product_id),

    -- ⑨ 普通索引，命名规范 idx_表名_列名；给外键列建索引能加快按分类查商品
    KEY idx_product_category (category_id),

    -- ⑩ 外键约束，命名规范 fk_本表_引用表
    CONSTRAINT fk_product_category
        FOREIGN KEY (category_id) REFERENCES category (category_id)
) ENGINE = InnoDB                       -- 存储引擎：InnoDB（支持事务/行锁/外键，默认就是它）
  DEFAULT CHARSET = utf8mb4             -- 表字符集
  COMMENT = '商品表';                    -- 表注释：好东西，半年后你会感谢自己
```

**建表语法骨架**：

```sql
CREATE TABLE [IF NOT EXISTS] 表名 (
    列名 数据类型 [列级约束] [COMMENT '注释'],
    ...
    [表级约束：PRIMARY KEY / UNIQUE KEY / KEY / FOREIGN KEY / CHECK]
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='表注释';
```

## 2.7 约束（Constraint）详解

约束是数据库帮你"守规矩"的机制——**能在数据库层挡住的错误，就不要只靠程序挡**。

| 约束 | 写法 | 作用 | 违反时报错 |
| --- | --- | --- | --- |
| 非空 | `NOT NULL` | 该列必须有值 | 1048 |
| 默认值 | `DEFAULT 值` | 不写该列时用什么值 | —— |
| 唯一 | `UNIQUE KEY uk_名 (列)` | 该列（或列组合）不能重复 | 1062 |
| 主键 | `PRIMARY KEY (列)` | 唯一 + 非空，且一张表只能一个 | 1062 / 1048 |
| 自增 | `AUTO_INCREMENT` | 只能用于键列，自动 +1 | —— |
| 外键 | `FOREIGN KEY (列) REFERENCES 父表(列)` | 值必须存在于父表 | 1452（插入）/ 1451（删除） |
| 检查 | `CHECK (条件)` | 值必须满足条件 **【8.0.16+ 才真正生效】** | 3819 |
| 无符号 | `UNSIGNED` | 只允许非负数（负数插入报 1264） | 1264 |

```sql
-- 新建一张表，把约束一次性用全
CREATE TABLE student_demo (
    id      INT UNSIGNED AUTO_INCREMENT,
    name    VARCHAR(50)  NOT NULL,                       -- 必须填姓名
    gender  ENUM('男','女','保密') NOT NULL DEFAULT '保密', -- 只能是这三个值之一（★ 默认值必须在列表里！）
    phone   CHAR(11)     UNIQUE,                         -- 手机号不能重复，但可以为 NULL
    age     TINYINT UNSIGNED DEFAULT 18,                 -- 无符号：不能存负数
    email   VARCHAR(100),
    PRIMARY KEY (id),
    UNIQUE KEY uk_phone (phone),
    CONSTRAINT chk_age CHECK (age >= 0 AND age <= 150)   -- 8.0.16+ 生效；5.7 会解析但忽略
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='约束演示表';

-- 看看数据库是怎么替你挡错的（下面几条会报错，这很正常）
INSERT INTO student_demo (name, gender, age) VALUES (NULL, '男', 18);   -- 1048 姓名不能为空
INSERT INTO student_demo (name, gender, age) VALUES ('小明', '男', 200); -- 3819 CHECK 不通过（5.7 会插入成功）
INSERT INTO student_demo (name, gender, age) VALUES ('小明', '男', 18),
                                                   ('小红', '女', 19);  -- 成功，两条都能插
INSERT INTO student_demo (name, gender, age) VALUES ('小明', '男', 18);  -- 这行也允许（phone 允许重复为 NULL）

-- ★ 重点考点：UNIQUE 列可以有多个 NULL！（NULL 表示"未知"，未知不等于未知）
INSERT INTO student_demo (name, phone) VALUES ('甲', NULL), ('乙', NULL);  -- 两条都成功
-- 也就是说：UNIQUE 只保证"非 NULL 值不重复"，练习库里的吴涛 phone 为 NULL 正是这个道理。
```

**外键的三种删除行为**（`ON DELETE` / `ON UPDATE`）：

| 行为 | 含义 | 举例 |
| --- | --- | --- |
| `RESTRICT`（默认）/ `NO ACTION` | 父表还有子表引用时，**禁止**删除父行（报 1451） | 有订单的客户不能删 |
| `CASCADE` | 删父行时**级联删除**子行 | 删订单时自动删订单明细（本教程 `order_item` 就是这种） |
| `SET NULL` | 删父行时把子表外键列置为 NULL（前提是允许 NULL） | 删分类时商品的 category_id 变 NULL |
| `SET DEFAULT` | MySQL/InnoDB **不支持**（语法接受但不起作用） | —— |

```sql
-- 级联删除演示（请在你的练习库上做，做完可重新导入初始化脚本）
DELETE FROM orders WHERE order_id = 15;   -- 删掉订单
SELECT COUNT(*) FROM order_item WHERE order_id = 15;  -- 0：明细被自动删掉了（CASCADE）

-- 而被引用的客户是删不掉的
DELETE FROM customer WHERE customer_id = 1;  -- 1451: Cannot delete or update a parent row
```

## 2.8 查看和修改表结构

```sql
-- ===== 查看 =====
SHOW TABLES;                                  -- 当前库有哪些表
SHOW TABLES LIKE 'prod%';                     -- 按模式过滤（% 通配任意字符）
DESC product;                                 -- 表结构（DESCRIBE 的缩写）
DESCRIBE product;                             -- 同上，完整写法
SHOW COLUMNS FROM product;                    -- 同上，另一种写法
SHOW CREATE TABLE product\G                   -- 建表原句（含索引/外键/引擎/字符集）
SHOW TABLE STATUS LIKE 'product'\G            -- 表的状态：引擎、行数估计、大小、注释
SHOW INDEX FROM product;                      -- 表上的所有索引（=\G 更易读）
SELECT * FROM information_schema.TABLES       -- 数据字典：查所有库/表的元信息
WHERE table_schema = 'shop';
```

```sql
-- ===== 修改表结构 ALTER TABLE =====
-- 1) 加列（AFTER / FIRST 控制位置）
ALTER TABLE product
    ADD COLUMN weight DECIMAL(6,2) NULL COMMENT '重量(kg)' AFTER price,
    ADD COLUMN origin VARCHAR(50)  NULL COMMENT '产地'      AFTER weight;

-- 2) 改列类型/约束（MODIFY 不能改列名）
ALTER TABLE product
    MODIFY COLUMN origin VARCHAR(100) NOT NULL DEFAULT '未知' COMMENT '产地';

-- 3) 改列名 + 改类型（CHANGE 必须把列定义重写一遍）
ALTER TABLE product
    CHANGE COLUMN origin made_in VARCHAR(100) NOT NULL DEFAULT '未知' COMMENT '产地';

-- 4) 删列（数据一起没了，不可恢复）
ALTER TABLE product DROP COLUMN weight, DROP COLUMN made_in;

-- 5) 加索引 / 删索引 / 加唯一索引 / 加全文索引
ALTER TABLE product ADD INDEX idx_product_name (name);
ALTER TABLE product ADD UNIQUE KEY uk_product_name (name);
ALTER TABLE product DROP INDEX idx_product_name;
ALTER TABLE product ADD FULLTEXT INDEX ft_product_name (name);   -- 全文索引（中文需 ngram 分词器）

-- 6) 改默认值 / 加非空（已有 NULL 数据时加 NOT NULL 会失败，要么先 UPDATE 补数据）
ALTER TABLE product ALTER COLUMN stock SET DEFAULT 100;
UPDATE product SET stock = 0 WHERE stock IS NULL;      -- 先把 NULL 补齐
ALTER TABLE product MODIFY COLUMN stock INT NOT NULL DEFAULT 0;

-- 7) 重命名表 / 改表注释 / 改引擎 / 改字符集
ALTER TABLE product RENAME TO product_old;
ALTER TABLE product_old RENAME TO product;             -- 改回来
ALTER TABLE product COMMENT = '商品表（含价格快照说明）';
ALTER TABLE product ENGINE = InnoDB;
ALTER TABLE product CONVERT TO CHARACTER SET utf8mb4;
```

> **ALTER TABLE 的性能提醒**：在 MySQL 5.6 以前，很多 `ALTER` 会**锁表重建**，百万行表上可能卡几分钟。
> 5.6+ 支持部分 Online DDL（加索引基本不锁写），8.0 又改进了 `ADD COLUMN`（INSTANT，秒级）。
> 但大表改结构仍然要谨慎，**尽量在业务低峰执行**，或用 `pt-online-schema-change` / `gh-ost` 这类工具。
> 加列时记得给默认值，否则 `NOT NULL` 无默认值会失败。

**删除的三种方式（务必分清！）**：

| 语句 | 类型 | 删什么 | 能否回滚 | 自增计数器 | 速度 |
| --- | --- | --- | --- | --- | --- |
| `DELETE FROM t WHERE ...` | DML | 符合条件的**行** | ✅ 能（在事务里） | 不重置 | 慢（逐行记日志） |
| `TRUNCATE TABLE t` | DDL | **整表所有行**，保留表结构 | ❌ 不能 | **重置为 1** | 极快 |
| `DROP TABLE t` | DDL | **整张表**（结构+数据+索引） | ❌ 不能 | —— | 快 |

```sql
DELETE FROM t_money WHERE id = 1;   -- 删一行（危险但可控）
TRUNCATE TABLE t_money;             -- 清空整表，自增从 1 重新开始
DROP TABLE IF EXISTS t_money;       -- 连表都不要了
```

---

# 3. 增删改（DML）

> 本章所有操作都在 `shop` 库里做。**动手前先确认：`SELECT DATABASE();` 返回 `shop`。**
>
> ⚠️ **重要提醒**：本章的语句会**真的改掉练习数据**。请尽情折腾，但**练完本章、准备进入第 4 章之前**，
> 重新执行一次初始化脚本把数据恢复原样（否则后面章节里给出的"示例输出"会对不上）：
> ```sql
> source D:/HuaweiMoveData/Users/HUAWEI/Desktop/dsh/mysql-practice/00_init_database.sql
> ```

## 3.1 INSERT：四种写法

```sql
USE shop;

-- ========== 写法 1：指定列插入（★★★★★ 最推荐） ==========
-- 明确写出列名，列的顺序可以任意；没写的列走默认值
INSERT INTO category (name) VALUES ('运动户外');
-- 插入成功返回：Query OK, 1 row affected

-- ========== 写法 2：一次插多行（批量插入，性能好得多） ==========
INSERT INTO category (name) VALUES
    ('宠物用品'),
    ('汽车用品');
-- 返回：Query OK, 2 rows affected

-- ========== 写法 3：不写列名（不推荐！） ==========
-- 必须按建表时列的【物理顺序】把所有列都写上，一张表加了列这段代码就废了
INSERT INTO category VALUES (9, '珠宝首饰');

-- ========== 写法 4：INSERT ... SET（可读性好，MySQL 特有） ==========
INSERT INTO category SET name = '乐器';

-- ========== 写法 5：从别的表查出来直接插入（造测试数据、做数据迁移常用） ==========
INSERT INTO category (name)
SELECT CONCAT(name, '（副本）')     -- 从 category 里查出来加工一下再插回去
FROM category
WHERE category_id <= 2;             -- 结果：插入了"手机数码（副本）""电脑办公（副本）"

-- 看看现在有哪些分类
SELECT * FROM category ORDER BY category_id;
```

**三个实用变体**：

```sql
-- ① INSERT IGNORE：遇到唯一键冲突就"跳过并警告"，不报错（适合批量导入脏数据）
INSERT IGNORE INTO category (category_id, name) VALUES (1, '手机数码重复');   -- 跳过，0 rows affected

-- ② ON DUPLICATE KEY UPDATE：冲突时改成更新（"有则更新，无则插入"，即 upsert）
INSERT INTO category (category_id, name) VALUES (1, '手机数码改名')
ON DUPLICATE KEY UPDATE name = VALUES(name);       -- 老写法（5.7 通用，8.0.20 起已废弃但还能用）

-- 8.0.20+ 的新写法：给 VALUES 起个别名，语义更清楚（推荐）
INSERT INTO category (category_id, name) VALUES (1, '手机数码改名') AS new
ON DUPLICATE KEY UPDATE name = new.name;
-- 效果：category_id=1 已存在 -> 把 name 更新掉

-- ③ REPLACE INTO：先删后插（注意！它会删掉整行再插新行，未指定的列会变默认值，
--    并可能触发 ON DELETE 级联删除，一般不建议用）
REPLACE INTO category (category_id, name) VALUES (2, '电脑办公改名');

-- ④ 查看刚刚插入的自增主键值（同一个连接里有效）
SELECT LAST_INSERT_ID() AS 刚插入的ID;
```

> **批量插入为什么快？** 每条 `INSERT` 都要一次网络往返 + 一次事务提交。
> 把 1000 条合成一条 `INSERT ... VALUES (...),(...)`，往返和提交都只有一次，快几十倍。
> 更大量时还可以显式包事务：`BEGIN; ... COMMIT;`。

## 3.2 UPDATE：改数据

```sql
-- 完整语法
-- UPDATE 表名 SET 列1 = 值1, 列2 = 值2 [WHERE 条件] [ORDER BY ...] [LIMIT n];

-- ① 改单行：把 12 号商品（蒙牛纯牛奶）的库存补上
UPDATE product SET stock = 50 WHERE product_id = 12;

-- ② 改多行：给所有图书类（category_id = 4）商品打折 9 折
UPDATE product
SET    price = ROUND(price * 0.9, 2)
WHERE  category_id = 4;

-- ③ 多列一起改
UPDATE customer
SET    city = '苏州', level = '银牌'
WHERE  customer_id = 9;              -- 客户"吴涛"之前 city 是 NULL，现在补上

-- ④ 用原值参与计算：库存减 3（注意 stock 是 UNSIGNED，减成负会报 1264）
UPDATE product SET stock = stock - 3 WHERE product_id = 1;

-- ⑤ 排序 + 限量更新（MySQL 特有）：只涨最早的 2 个商品的库存
UPDATE product SET stock = stock + 10 ORDER BY created_at ASC LIMIT 2;

-- ⑥ 批量"补齐 NULL"（生产环境很常见的救火操作）
UPDATE customer SET city = '未知' WHERE city IS NULL;

-- 看一眼改完的结果
SELECT product_id, name, price, stock FROM product ORDER BY product_id;
```

> 🔥 **新手第一大事故：UPDATE 忘了写 WHERE**
> ```sql
> UPDATE product SET price = 0;   -- 整张表的 price 全变成 0 ！！！
> ```
> **三条保命守则**：
> 1. 改之前**先用同样的 WHERE 跑一次 `SELECT`**，确认命中的是你要改的行；
>    练手时再用 `SELECT COUNT(*)` 数一下行数。
> 2. 打开安全更新模式（默认开启，能拦住"没有 WHERE 或用非索引列做 WHERE 的全表更新"）：
>    `SET SQL_SAFE_UPDATES = 1;` —— 报错 1175 时说明它救了你一命。
>    真要全表更新时临时关闭：`SET SQL_SAFE_UPDATES = 0;`
> 3. 生产环境改数据前**先备份**，或用 `LIMIT` 小批量试跑。
>
> **UPDATE 必须放在事务里**（第 10 章会讲）：`BEGIN; UPDATE ...; SELECT 确认; COMMIT;`（不满意就 `ROLLBACK`）。

## 3.3 DELETE：删数据

```sql
-- 完整语法
-- DELETE FROM 表名 [WHERE 条件] [ORDER BY ...] [LIMIT n];

-- ① 删指定的一行
DELETE FROM category WHERE category_id = 9;

-- ② 按条件批量删
DELETE FROM category WHERE name LIKE '%（副本）';

-- ③ 删"最新插入的 1 行"（MySQL 特有的 ORDER BY + LIMIT 组合，适合清理垃圾数据）
DELETE FROM category ORDER BY category_id DESC LIMIT 1;

-- ④ 删除所有行（可回滚，但很慢；只想清空请用 TRUNCATE）
DELETE FROM category;    -- 危险！等价于 DELETE FROM category WHERE 1=1

-- ⑤ 删除 NULL 行
DELETE FROM t_str WHERE c IS NULL;

-- ⑥ 大表分批删（避免一次删几百万行把主从延迟拉爆、把 undo 撑爆）
--    每次删 1000 行，循环执行，直到 affected rows = 0
DELETE FROM orders WHERE status = '已取消' ORDER BY order_id LIMIT 1000;
```

> 🔥 **同样是忘了 WHERE 的灾难**：`DELETE FROM orders;` 会清空整张订单表。
> 保命做法：**先用 SELECT 验证条件**，再执行 DELETE；重要表删除前 `CREATE TABLE orders_bak AS SELECT * FROM orders;` 留个快照；
> 或者用"软删除"代替物理删除：加一列 `is_deleted TINYINT DEFAULT 0`，删除时只 `UPDATE` 标记位。
>
> **什么情况该用 TRUNCATE 而不是 DELETE？** 测试环境清库、临时表复用 —— 用 `TRUNCATE`，它不写行日志，速度快得多。
> 但 `TRUNCATE` 是 DDL，**不能回滚**，也会连带重置 `AUTO_INCREMENT`。

## 3.4 顺手记两个小函数

```sql
-- ROW_COUNT()：上一条 DML 影响了几行（写脚本判断成败很有用）
UPDATE product SET stock = stock WHERE product_id = 1;   -- 值没变，affected rows = 0
SELECT ROW_COUNT() AS 影响行数;                          -- 0

-- 客户端还会直接告诉你：Query OK, 0 rows affected / 3 rows affected
```

---

# 4. 查询基础 SELECT

> 查询是 SQL 的灵魂。本章开始，每一段 SQL 后面都给出**在练习库上真实跑出来的输出**，
> 你可以直接对照（前提是练习数据没被第 3 章改过，改过就重新导入一遍）。

## 4.1 先记住"书写顺序"和"执行顺序"不一样

**你写 SQL 的顺序（书写顺序）**：

```sql
SELECT   列
FROM     表
WHERE    行过滤
GROUP BY 分组
HAVING   分组后过滤
ORDER BY 排序
LIMIT    限制条数;
```

**MySQL 真正执行的顺序（执行顺序）**——这个顺序决定了"为什么别名在 WHERE 里不能用"：

```txt
1. FROM / JOIN     先确定从哪些表取数据，并做连接       → 得到一张"大宽表"
2. ON              连接条件
3. WHERE           对行做过滤（不能用 SELECT 里的别名！）
4. GROUP BY        分组
5. 聚合函数        在每组内计算 COUNT/SUM/AVG...
6. HAVING          对分组结果过滤（可以用聚合函数）
7. SELECT          选出最终要显示的列，此时才产生别名
8. DISTINCT        去重
9. ORDER BY        排序（可以用别名，因为别名在第 7 步已产生）
10. LIMIT          只取前 N 条
```

> **一句话记住**：`WHERE` 比 `SELECT` 先执行，所以 `WHERE` 里**不能**用 `SELECT` 里定义的别名；
> 而 `ORDER BY` 在 `SELECT` 之后，所以**可以**用别名。这个规则能解释你 90% 的"为什么报错"。

## 4.2 最基本的三件事：选列、算列、去重

```sql
USE shop;

-- ========== ① 查所有列（SELECT *） ==========
-- 优点：敲得快，适合"我就想看看这表长什么样"
-- 缺点：① 网络传输多、无法用覆盖索引优化 ② 表加列后结果集悄悄变了
-- 结论：探索数据时用它，正式代码里【永远】写清楚列名
SELECT * FROM category;

-- ========== ② 查指定列，并起中文别名（AS 可省略，但建议写上） ==========
SELECT
    product_id AS 商品编号,     -- AS 起别名，结果集表头就变成"商品编号"
    name       AS 商品名称,
    price      AS 单价,
    stock      AS 库存
FROM product
ORDER BY price DESC;            -- 按单价从高到低

-- ========== ③ 对列做运算，产生"计算列" ==========
SELECT
    name                      AS 商品,
    price                     AS 单价,
    price * 0.8               AS 打八折后,       -- 直接算术运算
    CONCAT(price * 0.8, ' 元') AS 带单位的价格,   -- 用函数加工
    stock * price             AS 库存金额         -- 多列参与运算
FROM product
WHERE category_id = 1          -- 只看手机数码
ORDER BY 库存金额 DESC;         -- ORDER BY 可以用别名！
```

**输出的真实样子**（练习库数据）：

```txt
+--------------+---------+------------+----------------+
| 商品         | 单价    | 打八折后   | 带单位的价格   |
+--------------+---------+------------+----------------+
| iPhone 15    | 5999.00 | 4799.200   | 4799.200 元    |
| 小米 14 手机 | 3999.00 | 3199.200   | 3199.200 元    |
+--------------+---------+------------+----------------+
```

> 注意 `4799.200` 这种"多出来的小数位"：`price` 是 `DECIMAL(10,2)`（2 位小数），
> 乘数 `0.8` 是 1 位小数，MySQL 规定**乘法结果的小数位 = 两个操作数小数位之和**，所以是 3 位。
> **要控制小数位就用函数包一下**：`ROUND(price * 0.8, 2)` → `4799.20`。

```sql
-- ========== ④ DISTINCT 去重：只想知道"有哪些值"，不关心出现几次 ==========
SELECT DISTINCT city AS 客户所在城市 FROM customer ORDER BY city;
```

```txt
+--------------+
| 客户所在城市 |
+--------------+
| NULL         |   ← 吴涛的 city 是 NULL，DISTINCT 会把 NULL 当成一个独立的值保留
| 上海         |
| 北京         |
| 广州         |
| 成都         |
| 杭州         |
| 武汉         |
| 深圳         |
+--------------+
```

```sql
-- DISTINCT 作用于"整行组合"：只有 city 和 level 都相同才算重复
SELECT DISTINCT city, level FROM customer ORDER BY city, level;

-- 想知道"有多少个不同的城市"：COUNT(DISTINCT 列) 会自动忽略 NULL
SELECT COUNT(*) AS 客户总数,
       COUNT(city) AS 填了城市的客户数,        -- 39? 不，NULL 不计入 COUNT(列)
       COUNT(DISTINCT city) AS 不同城市数
FROM customer;
-- 结果：9 | 8 | 7
```

## 4.3 WHERE：行过滤的全部运算符

```sql
-- ========== 比较运算符 ==========
SELECT * FROM product WHERE price >  3000;    -- 大于
SELECT * FROM product WHERE price >= 3000;    -- 大于等于
SELECT * FROM product WHERE price <  100;     -- 小于
SELECT * FROM product WHERE price <= 100;     -- 小于等于
SELECT * FROM product WHERE price =  699.00;  -- 等于（注意：单等号，不是 ==）
SELECT * FROM product WHERE price <> 699.00;  -- 不等于（推荐 <>，!= 也行）
SELECT * FROM product WHERE stock = 0;        -- 库存为 0

-- ========== 逻辑运算符：AND / OR / NOT + 括号 ==========
-- 优先级：NOT > AND > OR —— 所以混合使用时【必须加括号】！
SELECT product_id, name, price, stock
FROM   product
WHERE  price > 3000 AND stock > 0    -- 又贵又有货
ORDER  BY price;
```

```txt
+------------+----------------------+---------+-------+
| product_id | name                 | price   | stock |
+------------+----------------------+---------+-------+
|          7 | 美的 1.5 匹空调      | 3299.00 |    18 |
|          1 | 小米 14 手机         | 3999.00 |   120 |
|          3 | 华为 MateBook 14     | 5499.00 |    45 |
|          2 | iPhone 15            | 5999.00 |    80 |
|          4 | 联想拯救者 Y7000P    | 7299.00 |    30 |
+------------+----------------------+---------+-------+
```

```sql
-- OR 的坑：下面这句的 OR 会把结果集"放大"，你以为的两个条件其实被 OR 拆开了
SELECT * FROM product WHERE category_id = 1 AND price < 1000 OR stock > 100;
-- 正确写法（用括号表达你真正想要的意思）
SELECT * FROM product WHERE (category_id = 1 AND price < 1000) OR stock > 100;

-- ========== IN：等于其中的任意一个 ==========
SELECT * FROM product WHERE category_id IN (1, 2);          -- 等价于 category_id=1 OR =2
SELECT * FROM product WHERE category_id NOT IN (1, 2);      -- 不在其中

-- ⚠️ NOT IN 的致命陷阱：列表里如果有 NULL，结果是【永远是空集】！
SELECT * FROM product WHERE category_id NOT IN (1, 2, NULL);  -- 一行都查不出来
-- 原因：x NOT IN (1,2,NULL) 等价于 x<>1 AND x<>2 AND x<>NULL，
--       而 x<>NULL 的结果是 NULL（不是 true），AND 之后整体就不成立。
-- 解决：过滤掉 NULL，或改用 NOT EXISTS（见第 7 章）。
SELECT * FROM product WHERE category_id NOT IN (SELECT category_id FROM product WHERE category_id IS NOT NULL);

-- ========== BETWEEN ... AND ...：闭区间 [小, 大] ==========
SELECT product_id, name, price
FROM   product
WHERE  price BETWEEN 500 AND 4000      -- 含 500 和 4000 两端！
ORDER  BY price;
```

```txt
+------------+---------------------+---------+
| product_id | name                | price   |
+------------+---------------------+---------+
|          5 | 罗技 MX Master 3S   |  699.00 |
|          6 | 海尔 501L 冰箱      | 2899.00 |
|          7 | 美的 1.5 匹空调     | 3299.00 |
|          8 | 戴森 V12 吸尘器     | 3690.00 |
|          1 | 小米 14 手机        | 3999.00 |
+------------+---------------------+---------+
```

```sql
-- BETWEEN 也能用于日期（记住：'2024-03-01' 是当天 00:00:00）
SELECT order_no, order_time FROM orders
WHERE order_time BETWEEN '2024-03-01' AND '2024-03-31 23:59:59';

-- ========== LIKE：模糊匹配（% 任意多个字符，_ 恰好一个字符） ==========
SELECT product_id, name FROM product WHERE name LIKE '%机%';
```

```txt
+------------+--------------------------+
| product_id | name                     |
+------------+--------------------------+
|          1 | 小米 14 手机             |
|         10 | 《深入理解计算机系统》   |   ← 注意这个！"计算机"里也含"机"
+------------+--------------------------+
```

```sql
-- 复习：LIKE 的两个通配符
SELECT 'abc' LIKE 'a%'    AS 以a开头,     -- 1
       'abc' LIKE '%c'    AS 以c结尾,     -- 1
       'abc' LIKE '%b%'   AS 含b,         -- 1
       'abc' LIKE 'a_c'   AS a任意一个字符c, -- 1
       'abc' LIKE 'a_'    AS 两个字符吗,   -- 0（长度不匹配）
       'abc' LIKE 'A%'    AS 区分大小写吗; -- 1（utf8mb4_general_ci 不区分大小写！）
-- 要区分大小写就用 BINARY：SELECT 'abc' LIKE BINARY 'A%';  → 0

-- ⚠️ 性能警告：以 % 开头的 LIKE 无法使用索引（'%机%'、'%机' 都会全表扫描）
--    只有 '小米%' 这种"前缀确定"的写法才能走索引。大表上要慎用前置 %。

-- 转义：要查的字符串本身含 % 或 _ 时，用 ESCAPE 指定转义符
SELECT * FROM product WHERE name LIKE '%100\%%' ESCAPE '\';   -- 名字里真的含 "100%"

-- ========== REGEXP：正则匹配（MySQL 8.0 用 ICU 正则，功能更强） ==========
SELECT name FROM product WHERE name REGEXP '^[A-Za-z]';   -- 以英文字母开头的商品名

-- ========== IS NULL / IS NOT NULL：判断空值 ==========
-- ⚠️ NULL 不能用 = 或 <> 比较！NULL = NULL 的结果是 NULL，不是 TRUE
SELECT customer_id, name, phone, city
FROM   customer
WHERE  phone IS NULL;                                    -- ★ 正确
-- WHERE phone = NULL;                                   -- ✗ 错误：永远查不到任何行
```

```txt
+-------------+--------+-------+------+
| customer_id | name   | phone | city |
+-------------+--------+-------+------+
|           9 | 吴涛   | NULL  | NULL |
+-------------+--------+-------+------+
```

### 必须搞懂的 NULL 三值逻辑

SQL 里的逻辑有**三个值**：`TRUE` / `FALSE` / `NULL`（未知）。
任何和 NULL 做的比较（除 `IS NULL` 和 `<=>`），结果都是 `NULL`，而 `WHERE` **只放行结果为 TRUE 的行**。

```sql
-- 自己验证一下（结果是 NULL / 0 / 1，而不是报错）
SELECT NULL = NULL       AS 空等于空,        -- NULL（未知，不是 1！）
       NULL <> NULL      AS 空不等于空,      -- NULL
       NULL = 1          AS 空等于一,        -- NULL
       NULL IS NULL      AS 空是空,          -- 1
       NULL <=> NULL     AS 安全等于,        -- 1  ← MySQL 特有：null-safe equal
       1 <=> NULL        AS 安全等于二,      -- 0
       NULL + 1          AS 空加一,          -- NULL（任何算术与 NULL 运算都得 NULL）
       CONCAT('a', NULL) AS 拼接含空;        -- NULL（这是拼接函数最坑的地方）
```

| 表达式 | 结果 |
| --- | --- |
| `NULL = NULL` | `NULL`（不是 TRUE！） |
| `NULL <=> NULL` | `1` |
| `NULL AND TRUE` | `NULL` |
| `NULL AND FALSE` | `0` |
| `NULL OR TRUE` | `1` |
| `NULL OR FALSE` | `NULL` |
| `NOT NULL` | `NULL` |
| `COUNT(NULL)` | 不计数（`COUNT(*)` 才数行） |
| `SUM(NULL)` / `AVG(NULL)` | `NULL` |
| `ORDER BY 列 ASC` | NULL 排最前；`DESC` 时排最后 |

**实战结论**：

- 想"要么是空要么等于某值"：`WHERE col IS NULL OR col = 'x'`。
- 拼接字符串怕 NULL 把整体带成 NULL：用 `CONCAT_WS`（它会跳过 NULL）或 `IFNULL(col,'')`。
- 求和求平均怕全组是 NULL：用 `IFNULL(SUM(x),0)` 或 `COALESCE(SUM(x),0)`。

## 4.4 ORDER BY 排序 + LIMIT 分页

```sql
-- ========== 单列排序 ==========
SELECT name, price FROM product ORDER BY price DESC;   -- 降序（贵 → 便宜）
SELECT name, price FROM product ORDER BY price ASC;    -- 升序（ASC 是默认，可省略）

-- ========== 多列排序：先按第一列，第一列相同时再按第二列 ==========
SELECT name, stock, price
FROM   product
ORDER  BY stock DESC, price ASC;      -- 库存多的在前；库存一样时便宜的在前
```

```txt
+--------------------------+-------+---------+
| name                     | stock | price   |
+--------------------------+-------+---------+
| 《MySQL必知必会》        |   500 |   45.00 |
| 三只松鼠坚果大礼包       |   300 |   99.00 |
| 罗技 MX Master 3S        |   200 |  699.00 |
| 小米 14 手机             |   120 | 3999.00 |
| iPhone 15                |    80 | 5999.00 |
| 华为 MateBook 14         |    45 | 5499.00 |
| 联想拯救者 Y7000P        |    30 | 7299.00 |
| 海尔 501L 冰箱           |    25 | 2899.00 |
| 美的 1.5 匹空调          |    18 | 3299.00 |
| 《深入理解计算机系统》   |    12 |  128.00 |
| 蒙牛纯牛奶 250ml*12      |     0 |   59.90 |   ← 库存都是 0
| 戴森 V12 吸尘器          |     0 | 3690.00 |   ← 但价格升序，59.90 在前
+--------------------------+-------+---------+
```

```sql
-- ========== 按"自定义顺序"排序：用 FIELD()（比如按订单状态业务流程排序） ==========
SELECT order_no, status FROM orders
ORDER BY FIELD(status, '待付款', '已付款', '已发货', '已完成', '已取消');
-- 否则 ENUM 默认按"定义顺序"排，而不是你想要的业务顺序

-- 让 NULL 排在最后（否则 ASC 时 NULL 总在最前）
SELECT name, city FROM customer ORDER BY city IS NULL, city;   -- city 为 NULL 的假值 0 排在前面

-- ========== LIMIT：只取前 N 条 ==========
SELECT * FROM product ORDER BY price DESC LIMIT 3;                  -- 最贵的 3 件
SELECT * FROM product ORDER BY price DESC LIMIT 1;                  -- 最贵的 1 件（"取 Top1"经典写法）

-- ========== 分页：跳过 offset 条，取 n 条 ==========
-- 两种等价写法：
SELECT product_id, name FROM product ORDER BY product_id LIMIT 5 OFFSET 5;  -- 推荐（英文语义清晰）
SELECT product_id, name FROM product ORDER BY product_id LIMIT 5, 5;        -- 等价的简写（先 offset 后 n）
```

```txt
-- LIMIT 5 OFFSET 5 的结果：第 2 页（每页 5 条）
+------------+--------------------------+
| product_id | name                     |
+------------+--------------------------+
|          6 | 海尔 501L 冰箱           |
|          7 | 美的 1.5 匹空调          |
|          8 | 戴森 V12 吸尘器          |
|          9 | 《MySQL必知必会》        |
|         10 | 《深入理解计算机系统》   |
+------------+--------------------------+
```

```sql
-- 分页公式：第 page 页、每页 size 条  →  LIMIT size OFFSET (page-1)*size
-- 第 3 页，每页 5 条：
SELECT product_id, name FROM product ORDER BY product_id LIMIT 5 OFFSET 10;  -- 只剩 2 条，不足一页就少返回
```

> ⚠️ **分页的两个坑**
> 1. **不写 ORDER BY 的 LIMIT 结果是不确定的**！数据库返回顺序可能变化，翻页时会出现"同一条数据在两页都出现"。
>    **分页必须配一个唯一且稳定的排序键**（通常是主键）：`ORDER BY product_id`。
> 2. **深分页很慢**：`LIMIT 10 OFFSET 1000000` 要先把前 100 万行扫出来再丢掉。
>    优化写法见 [16.4 深分页优化](#164-深分页优化limit-1000000-为什么慢)。

## 4.5 常用函数大全（附例子和结果）

### 字符串函数

| 函数 | 作用 | 例子 → 结果 |
| --- | --- | --- |
| `CONCAT(a,b,...)` | 拼接（**遇 NULL 返回 NULL**） | `CONCAT('小米','14')` → `小米14` |
| `CONCAT_WS(sep,a,b)` | 用分隔符拼接，**自动跳过 NULL** | `CONCAT_WS('-','A',NULL,'B')` → `A-B` |
| `LENGTH(s)` | 字节数 | `LENGTH('数据库')` → `9` |
| `CHAR_LENGTH(s)` | **字符数** | `CHAR_LENGTH('数据库')` → `3` |
| `UPPER(s)` / `LOWER(s)` | 转大写 / 小写 | `UPPER('abc')` → `ABC` |
| `TRIM(s)` / `LTRIM` / `RTRIM` | 去首尾空格 / 左 / 右 | `TRIM('  ab  ')` → `ab` |
| `SUBSTRING(s,pos,len)` | 截取子串（**下标从 1 开始**） | `SUBSTRING('abcdef',2,3)` → `bcd` |
| `LEFT(s,n)` / `RIGHT(s,n)` | 左 / 右取 n 个字符 | `LEFT('abcdef',2)` → `ab` |
| `LOCATE(sub,s)` / `INSTR(s,sub)` | 子串位置（找不到返回 0） | `LOCATE('cd','abcdef')` → `3` |
| `REPLACE(s,a,b)` | 替换 | `REPLACE('a-b','-','')` → `ab` |
| `LPAD(s,n,c)` / `RPAD` | 左/右补字符到长度 n | `LPAD('7',3,'0')` → `007` |
| `REVERSE(s)` | 反转 | `REVERSE('abc')` → `cba` |
| `FORMAT(x,n)` | 千分位 + n 位小数 | `FORMAT(1234567.891,2)` → `1,234,567.89` |
| `GROUP_CONCAT(col)` | 把一组值拼成一个字符串（配合 GROUP BY） | 见第 5 章 |

```sql
-- 字符串函数实战：把手机号中间 4 位打码
SELECT
    name,
    phone,
    CONCAT(LEFT(phone, 3), '****', RIGHT(phone, 4)) AS 脱敏手机号
FROM customer
WHERE phone IS NOT NULL
LIMIT 3;
```

### 数值函数

| 函数 | 作用 | 例子 → 结果 |
| --- | --- | --- |
| `ROUND(x,n)` | 四舍五入到 n 位（**会进位**） | `ROUND(2.567,2)` → `2.57` |
| `TRUNCATE(x,n)` | 直接截断到 n 位（**不进位**） | `TRUNCATE(2.567,2)` → `2.56` |
| `CEIL(x)` / `FLOOR(x)` | 向上 / 向下取整 | `CEIL(2.1)` → `3`，`FLOOR(2.9)` → `2` |
| `ABS(x)` | 绝对值 | `ABS(-5)` → `5` |
| `MOD(a,b)` 或 `a % b` | 取余 | `MOD(7,3)` → `1` |
| `POW(a,b)` | 幂 | `POW(2,10)` → `1024` |
| `SQRT(x)` | 平方根 | `SQRT(16)` → `4` |
| `GREATEST(...)` / `LEAST(...)` | 最大 / 最小 | `GREATEST(1,9,5)` → `9` |
| `RAND()` | 0~1 随机数 | `ORDER BY RAND() LIMIT 1`（随机取一条，大表慎用） |

```sql
-- 数值实战：算出每个商品的总货值，并保留 2 位小数
SELECT name AS 商品, price AS 单价, stock AS 库存,
       ROUND(price * stock, 2) AS 货值
FROM   product
ORDER  BY 货值 DESC
LIMIT  5;
```

```txt
+---------------------+---------+------+-----------+
| 商品                | 单价    | 库存 | 货值      |
+---------------------+---------+------+-----------+
| iPhone 15           | 5999.00 |   80 | 479920.00 |
| 小米 14 手机        | 3999.00 |  120 | 479880.00 |
| 华为 MateBook 14    | 5499.00 |   45 | 247455.00 |
| 联想拯救者 Y7000P   | 7299.00 |   30 | 218970.00 |
| 罗技 MX Master 3S   |  699.00 |  200 | 139800.00 |
+---------------------+---------+------+-----------+
```

### 日期时间函数

| 函数 | 作用 | 例子 → 结果 |
| --- | --- | --- |
| `NOW()` | 当前日期+时间（**语句开始的时间**，同一语句内不变） | `2024-06-20 10:30:00` |
| `SYSDATE()` | 当前日期+时间（**函数执行的瞬间**） | 与 NOW 略有差异 |
| `CURDATE()` / `CURTIME()` | 当前日期 / 当前时间 | `2024-06-20` / `10:30:00` |
| `DATE(x)` | 取日期部分 | `DATE('2024-06-20 10:30:00')` → `2024-06-20` |
| `YEAR/MONTH/DAY/HOUR/MINUTE/SECOND(x)` | 取各部分 | `YEAR('2024-06-20')` → `2024` |
| `DATE_FORMAT(d,fmt)` | 格式化输出 | `DATE_FORMAT(NOW(),'%Y年%m月%d日')` → `2024年06月20日` |
| `STR_TO_DATE(s,fmt)` | 字符串转日期 | `STR_TO_DATE('2024/06/20','%Y/%m/%d')` → `2024-06-20` |
| `DATE_ADD(d, INTERVAL n 单位)` | 日期加 | `DATE_ADD('2024-01-31', INTERVAL 1 MONTH)` → `2024-02-29`（自动处理月末） |
| `DATE_SUB(d, INTERVAL n 单位)` | 日期减 | `DATE_SUB(NOW(), INTERVAL 7 DAY)` → 7 天前 |
| `DATEDIFF(a,b)` | 相差**天数** | `DATEDIFF('2024-06-20','2024-01-05')` → `167` |
| `TIMESTAMPDIFF(单位,a,b)` | 相差多少个月/年/小时等 | `TIMESTAMPDIFF(YEAR,'1990-05-12','2024-06-20')` → `34` |
| `LAST_DAY(d)` | 当月最后一天 | `LAST_DAY('2024-02-15')` → `2024-02-29` |
| `UNIX_TIMESTAMP(d)` / `FROM_UNIXTIME(n)` | 日期 ↔ 时间戳 | `UNIX_TIMESTAMP('1970-01-01 08:00:01')` → `1`（东八区） |

`DATE_FORMAT` 常用的格式符：`%Y` 四位年、`%y` 两位年、`%m` 月、`%d` 日、`%H` 24 小时、`%i` 分、`%s` 秒、`%W` 星期名、`%j` 一年中的第几天。

```sql
-- 日期实战 1：算每个客户的年龄（用 TIMESTAMPDIFF，比按年相减准）
SELECT name AS 客户, birth_date AS 生日,
       TIMESTAMPDIFF(YEAR, birth_date, CURDATE()) AS 年龄
FROM   customer
WHERE  birth_date IS NOT NULL
ORDER  BY 年龄;

-- 日期实战 2：统计 2024 年每个月有多少笔订单（按月分组的经典写法）
SELECT DATE_FORMAT(order_time, '%Y-%m') AS 月份,
       COUNT(*)                          AS 订单数
FROM   orders
WHERE  order_time >= '2024-01-01' AND order_time < '2025-01-01'
GROUP  BY 月份
ORDER  BY 月份;

-- 日期实战 3：查询"最近 7 天"的数据（注意别用 DATE_FORMAT 包住列，那样索引会失效）
SELECT COUNT(*) AS 近7天订单数
FROM   orders
WHERE  order_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY);   -- ★ 让列裸奔，把函数用在常量上
-- ✗ 反例（索引失效 + 语义还不准）：
-- WHERE DATE(order_time) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY);
-- 提示：练习库里的订单都是 2024 年的，你现在跑这句多半返回 0 —— 这是对的，不是写错了。
```

### 条件函数（把判断写进查询里）

| 函数 | 作用 | 例子 → 结果 |
| --- | --- | --- |
| `IF(条件, 真值, 假值)` | 二选一 | `IF(1>0,'是','否')` → `是` |
| `IFNULL(x, 替代值)` | x 为 NULL 时用替代值 | `IFNULL(NULL, 0)` → `0` |
| `NULLIF(a,b)` | a=b 时返回 NULL，否则返回 a | `NULLIF(5,5)` → `NULL` |
| `COALESCE(a,b,c...)` | 返回第一个非 NULL 的值 | `COALESCE(NULL,NULL,3)` → `3` |
| `CASE WHEN ... THEN ... ELSE ... END` | 多分支（**最灵活**） | 见下 |

```sql
-- 条件函数实战：把库存数字翻译成人能读懂的标签
SELECT
    name AS 商品,
    stock AS 库存,
    CASE
        WHEN stock = 0        THEN '缺货'        -- 从上往下判断，命中即停
        WHEN stock < 20       THEN '库存紧张'
        WHEN stock < 100      THEN '正常'
        ELSE                       '库存充足'
    END AS 库存状态
FROM product
ORDER BY stock;

-- CASE 的第二种写法（等值匹配，类似 switch）
SELECT name,
       CASE status
           WHEN '在售' THEN '可购买'
           WHEN '下架' THEN '不可购买'
           ELSE '未知'
       END AS 是否可买
FROM product
LIMIT 3;
```

**🖐 动手练习（第 4 章）**

1. 查出价格在 100~5000 元之间、并且状态为"在售"的商品，按价格升序。
2. 查出所有 2024 年 4 月之后（含 4 月）注册的客户。
3. 查出名字里含"小"或"米"的商品（提示：`LIKE` + `OR`，或 `REGEXP`）。
4. 查出所有"没有填城市"或"没有填手机号"的客户。
5. 把商品按价格分成"<100 / 100~3000 / >3000"三档，统计每档有多少件（提示：先想想这题是不是该用第 5 章的 `GROUP BY`）。

---

# 5. 分组聚合 GROUP BY / HAVING

## 5.1 五个聚合函数：把"多行"压成"一个值"

| 函数 | 作用 | 是否忽略 NULL | 注意 |
| --- | --- | --- | --- |
| `COUNT(*)` | 统计**行数** | 不忽略（数行） | 最常用，InnoDB 里会选最小的索引来数 |
| `COUNT(列)` | 统计该列**非 NULL** 的行数 | **忽略 NULL** | 与 `COUNT(*)` 结果可能不同！ |
| `COUNT(DISTINCT 列)` | 统计该列**去重后**非 NULL 的个数 | 忽略 NULL | 想知道"有多少种"时用 |
| `SUM(列)` | 求和 | 忽略 NULL；**全 NULL 时返回 NULL** | 用 `IFNULL(SUM(x),0)` 兜底 |
| `AVG(列)` | 求平均 | 忽略 NULL（**分母是有效值个数**） | 与"除以总行数"不同，要小心 |
| `MAX(列)` / `MIN(列)` | 最大 / 最小 | 忽略 NULL | 对字符串按字典序、对日期按时间先后 |
| `GROUP_CONCAT(列)` | 把一组值拼成一个字符串 | 忽略 NULL | 默认逗号分隔，长度受 `group_concat_max_len` 限制（默认 1024 字节） |

```sql
-- 先看不带 GROUP BY 的"整表聚合"：结果永远只有 1 行
SELECT
    COUNT(*)                    AS 商品总数,      -- 12
    COUNT(stock)                AS 库存非空数,    -- 12
    SUM(stock)                  AS 库存合计,      -- 1330
    ROUND(AVG(price), 2)        AS 平均单价,      -- 2809.58
    MAX(price)                  AS 最贵,          -- 7299.00
    MIN(price)                  AS 最便宜,        -- 45.00
    COUNT(DISTINCT category_id) AS 涉及分类数     -- 5
FROM product;

-- ★ 重点：COUNT(*) 与 COUNT(列) 的区别
SELECT COUNT(*) AS 总行数,          -- 9（9 个客户）
       COUNT(phone) AS 有手机号,    -- 8（吴涛的 phone 是 NULL，不计入）
       COUNT(city) AS 有城市,       -- 8
       COUNT(birth_date) AS 有生日  -- 8
FROM customer;

-- ★ 重点：AVG 的分母是"非 NULL 个数"，不是总行数
SELECT COUNT(*) AS 总行数, COUNT(score) AS 有成绩的, ROUND(AVG(score),2) AS 平均分
FROM score;
-- 若某个学生缺考（score 为 NULL），AVG 不会把它算作 0 分 —— 这正是大多数人期望的行为

-- GROUP_CONCAT：把一组的名字拼起来看（默认逗号分隔）
SELECT category_id AS 分类, GROUP_CONCAT(name ORDER BY price DESC SEPARATOR ' / ') AS 该分类商品
FROM   product
GROUP  BY category_id;
-- 结果（每个分类一行）：
-- 1 | iPhone 15 / 小米 14 手机
-- 2 | 联想拯救者 Y7000P / 华为 MateBook 14 / 罗技 MX Master 3S
-- ...
```

## 5.2 GROUP BY：把行"分桶"，每个桶输出一行

```sql
-- 语法：SELECT 分组列, 聚合函数(...) FROM 表 GROUP BY 分组列;
-- 直译："把行按 xxx 分成若干组，每组算一个统计值"

-- 例：统计每个分类各有几件商品、平均多少钱
SELECT
    category_id                AS 分类ID,
    COUNT(*)                   AS 商品数,       -- 每组（每个分类）的行数
    ROUND(AVG(price), 2)       AS 平均单价,
    SUM(stock)                 AS 总库存
FROM product
GROUP BY category_id             -- ★ 按 category_id 分桶
ORDER BY 商品数 DESC, category_id;   -- ★ 并列时补一个排序列，结果才稳定
```

```txt
+--------+--------+----------+--------+
| 分类ID | 商品数 | 平均单价 | 总库存 |
+--------+--------+----------+--------+
|      2 |      3 |  4499.00 |    275 |
|      3 |      3 |  3296.00 |     43 |
|      1 |      2 |  4999.00 |    200 |
|      4 |      2 |    86.50 |    512 |
|      5 |      2 |    79.45 |    300 |
+--------+--------+----------+--------+
```

**理解 GROUP BY 的三条铁律**：

1. `SELECT` 后面**只能出现两种东西**：① `GROUP BY` 里出现过的列；② 聚合函数。其余列没有意义（一组有 3 行，你让我显示哪一行的 name？）。
2. `GROUP BY` 之后，**结果集的行数 = 组的个数**，不是原表行数。
3. 想让分组列显示成"人能看懂的名字"，就把它 JOIN 到字典表（见第 6 章）：

```sql
-- 把上面的 category_id 换成分类名（用连接实现，第 6 章会详细讲）
SELECT
    c.name                     AS 分类,
    COUNT(p.product_id)        AS 商品数,       -- ★ 用 COUNT(p.xxx) 而不是 COUNT(*)
    IFNULL(ROUND(AVG(p.price), 2), 0) AS 平均单价
FROM category c
LEFT JOIN product p ON p.category_id = c.category_id   -- 用左连接：没有商品的分类也要显示
GROUP BY c.category_id, c.name                          -- 分组列要把用到的列都写上
ORDER BY 商品数 DESC, 分类;
```

```txt
+----------+--------+----------+
| 分类     | 商品数 | 平均单价 |
+----------+--------+----------+
| 电脑办公 |      3 |  4499.00 |
| 家用电器 |      3 |  3296.00 |
| 手机数码 |      2 |  4999.00 |
| 图书     |      2 |    86.50 |
| 食品生鲜 |      2 |    79.45 |
+----------+--------+----------+
```

> **`COUNT(*)` 还是 `COUNT(p.product_id)`？** 这里必须用后者！
> 因为 `LEFT JOIN` 会给"没有商品的分类"造出一行 `product` 全为 NULL 的假行，
> `COUNT(*)` 会把它数成 1（错），而 `COUNT(列)` 忽略 NULL，正确地数成 0。
> **这个坑在 LEFT JOIN + 聚合时非常常见，务必记住。**

## 5.3 HAVING：对"分组结果"再过滤

- `WHERE` 在分组**之前**过滤**行**，不能用聚合函数。
- `HAVING` 在分组**之后**过滤**组**，可以用聚合函数。

```sql
-- 需求：找出"订单数 >= 2 笔"的客户，以及他们的总消费
SELECT
    c.name                       AS 客户,
    COUNT(*)                     AS 订单数,
    ROUND(SUM(o.total_amount),2) AS 消费金额
FROM customer c
JOIN orders o ON o.customer_id = c.customer_id    -- 内连接：只统计下过单的客户
GROUP BY c.customer_id, c.name
HAVING COUNT(*) >= 2                              -- ★ 过滤"组"：组内行数 >= 2
ORDER BY 消费金额 DESC;
```

```txt
+--------+--------+----------+
| 客户   | 订单数 | 消费金额 |
+--------+--------+----------+
| 陈静   |      2 | 13497.00 |
| 张伟   |      3 | 12095.00 |
| 王芳   |      2 | 11194.00 |
| 刘洋   |      2 |  8957.90 |
| 赵磊   |      2 |  8798.00 |
| 李娜   |      2 |   436.80 |
+--------+--------+----------+
```

```sql
-- 对比：同一个条件，WHERE 和 HAVING 放的位置不同，含义完全不同
-- ① WHERE 先过滤行：只统计"已完成的订单"，再分组
SELECT c.name, COUNT(*) AS 已完成订单数
FROM   orders o JOIN customer c ON c.customer_id = o.customer_id
WHERE  o.status = '已完成'                    -- ★ 先筛行
GROUP  BY c.customer_id, c.name;

-- ② HAVING 后过滤组：先算所有订单，再看"已完成订单数 >= 2"的客户
SELECT c.name, COUNT(*) AS 总订单数,
       SUM(o.status = '已完成') AS 其中已完成    -- 布尔表达式求和 = 条件计数技巧
FROM   orders o JOIN customer c ON c.customer_id = o.customer_id
GROUP  BY c.customer_id, c.name
HAVING SUM(o.status = '已完成') >= 2;        -- ★ 后筛组

-- ③ 两者可以同时用：先 WHERE 再 GROUP BY 再 HAVING
SELECT c.city AS 城市, COUNT(*) AS 有效订单数, ROUND(SUM(o.total_amount),2) AS 金额
FROM   orders o JOIN customer c ON c.customer_id = o.customer_id
WHERE  o.status <> '已取消'                  -- 行过滤
GROUP  BY c.city
HAVING COUNT(*) >= 1                         -- 组过滤
ORDER  BY 金额 DESC;
```

| | `WHERE` | `HAVING` |
| --- | --- | --- |
| 过滤对象 | 行 | 分组（组） |
| 执行时机 | `GROUP BY` **之前** | `GROUP BY` **之后** |
| 能用聚合函数吗 | ❌ 不能 | ✅ 能 |
| 能用 SELECT 别名吗 | ❌ 不能 | ✅ 可以（MySQL 特有，标准 SQL 不允许，跨库时要小心） |
| 性能 | 更快（先筛掉数据，分组量小） | 更慢（先分组再筛） |
| 建议 | **能写在 WHERE 的条件就写在 WHERE** | 只放聚合条件 |

## 5.4 多列分组

```sql
-- 按"城市 + 会员等级"两个维度交叉统计：每个组合一行
SELECT
    city                     AS 城市,
    level                    AS 会员等级,
    COUNT(*)                 AS 人数,
    GROUP_CONCAT(name)       AS 客户名单
FROM customer
GROUP BY city, level                      -- ★ 多列分组 = 组合去重
ORDER BY city, level;
```

```txt
+--------+----------+------+------------------+
| 城市   | 会员等级 | 人数 | 客户名单         |
+--------+----------+------+------------------+
| NULL   | 普通     |    1 | 吴涛             |
| 上海   | 金牌     |    1 | 李娜             |
| 北京   | 普通     |    1 | 孙丽             |
| 北京   | 金牌     |    1 | 张伟             |
| 广州   | 银牌     |    1 | 王芳             |
| 成都   | 银牌     |    1 | 赵磊             |
| 杭州   | 金牌     |    1 | 陈静             |
| 武汉   | 银牌     |    1 | 周敏             |
| 深圳   | 普通     |    1 | 刘洋             |
+--------+----------+------+------------------+
```

> 小提示：`城市` 列内部各行的先后顺序由数据库的排序规则决定（不同环境可能略有差别），
> 重点是**分组结果本身**：每个"城市 + 等级"组合输出一行。
> 想让顺序完全可控，就在 `ORDER BY` 里加上 `city`、`level`，或者用 `FIELD()` 指定业务顺序。

## 5.5 报错 1055：`ONLY_FULL_GROUP_BY` 怎么修

MySQL 5.7+ 默认开启 `ONLY_FULL_GROUP_BY`，下面这种"想当然"的写法会直接报错：

```sql
-- ✗ 报错：ERROR 1055 (42000): Expression #2 of SELECT list is not in GROUP BY clause
--   and contains nonaggregated column 'shop.product.name' ...
SELECT category_id, name, COUNT(*)      -- name 既没分组，也没聚合 —— 一个分类有 3 个名字，显示哪个？
FROM product
GROUP BY category_id;
```

三种正确的修法（**按推荐程度排序**）：

```sql
-- ① 推荐：把要显示的列也放进 GROUP BY（结果里的 name 就成了"分组维度之一"）
SELECT category_id, name, COUNT(*) FROM product GROUP BY category_id, name;

-- ② 推荐：用聚合函数把那一列"压"成一个值
SELECT category_id, GROUP_CONCAT(name) AS 商品名列表, COUNT(*) AS 数量
FROM product GROUP BY category_id;

-- ③ 下策：改服务器配置关掉检查（会让语义错误悄悄放过，不推荐）
SELECT @@sql_mode;                               -- 先看看当前模式
SET SESSION sql_mode = REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', '');   -- 只对当前会话生效
-- 永久生效要改配置文件 my.cnf / my.ini 里的 sql_mode，然后重启服务
```

> **为什么默认要开着它？** 因为"不分组就显示某列"在别的数据库里直接被禁止，
> 而在 MySQL 老版本里会随机返回组内某一行的值——这种不确定性是 bug 的温床。

## 5.6 小计与合计：`WITH ROLLUP`

```sql
-- 按分类统计商品数，最后再补一行"总计"
SELECT IFNULL(c.name, '【总计】') AS 分类,
       COUNT(p.product_id)       AS 商品数,
       ROUND(SUM(p.price * p.stock), 2) AS 库存总货值
FROM category c LEFT JOIN product p ON p.category_id = c.category_id
GROUP BY c.name WITH ROLLUP;              -- ★ 多出一行汇总
```

```txt
+-------------+--------+--------------+
| 分类        | 商品数 | 库存总货值   |
+-------------+--------+--------------+
| 手机数码    |      2 |    959800.00 |
| 电脑办公    |      3 |    606225.00 |
| 家用电器    |      3 |    131857.00 |
| 图书        |      2 |     24036.00 |
| 食品生鲜    |      2 |     29700.00 |
| 【总计】    |     12 |   1751618.00 |   ← ROLLUP 生成的汇总行，永远在最后
+-------------+--------+--------------+
```

> 说明：除汇总行固定在最后，`ROLLUP` 各分组的先后顺序**不做保证**（这里按分组顺序展示）。
> 8.0 里 `ROLLUP` 产生的 NULL 和真实的 NULL 分不清，可以用 `GROUPING(列)` 判断：
> `SELECT c.name, GROUPING(c.name) AS 是否汇总行 ...`（返回 1 表示这是汇总行）。

## 5.7 实战：一份销售报表的 6 连问

```sql
-- 问 1：一共有多少笔订单、总金额多少？（整表聚合）
SELECT COUNT(*) AS 订单总数, ROUND(SUM(total_amount),2) AS 总金额 FROM orders;
-- 15 | 58911.70

-- 问 2：只看"有效订单"（排除已取消）呢？
SELECT COUNT(*) AS 有效订单数, ROUND(SUM(total_amount),2) AS 有效金额
FROM orders WHERE status <> '已取消';
-- 14 | 52912.70
```

```sql
-- 问 3：各种订单状态各有多少笔、金额多少？（单列分组）
SELECT
    status                        AS 状态,
    COUNT(*)                      AS 订单数,
    ROUND(SUM(total_amount), 2)   AS 金额,
    ROUND(100 * COUNT(*) / (SELECT COUNT(*) FROM orders), 1) AS 占比百分比
FROM orders
GROUP BY status
ORDER BY 订单数 DESC, status;
-- 注意：子查询 (SELECT COUNT(*) FROM orders) 是"整表总数"，用来算占比
```

```txt
+--------+--------+----------+------------+
| 状态   | 订单数 | 金额     | 占比百分比 |
+--------+--------+----------+------------+
| 已完成 |     10 | 35567.80 |       66.7 |
| 已发货 |      2 | 10696.00 |       13.3 |
| 已付款 |      1 |  2958.90 |        6.7 |
| 已取消 |      1 |  5999.00 |        6.7 |
| 待付款 |      1 |  3690.00 |        6.7 |
+--------+--------+----------+------------+
```

```sql
-- 问 4：按月看销售趋势（日期函数 + 分组）
SELECT
    DATE_FORMAT(order_time, '%Y-%m')  AS 月份,
    COUNT(*)                          AS 订单数,
    ROUND(SUM(total_amount), 2)       AS 销售额
FROM orders
GROUP BY 月份                 -- MySQL 允许 GROUP BY 用 SELECT 的别名
ORDER BY 月份;
```

```txt
+---------+--------+----------+
| 月份    | 订单数 | 销售额   |
+---------+--------+----------+
| 2024-01 |      2 |  4217.00 |
| 2024-02 |      2 |  3895.00 |
| 2024-03 |      3 | 12415.80 |
| 2024-04 |      2 | 11297.00 |
| 2024-05 |      3 | 18386.00 |
| 2024-06 |      3 |  8700.90 |
+---------+--------+----------+
```

```sql
-- 问 5：每种商品的销量和销售额，并按卖得好坏排序（多表连接 + 分组）
SELECT
    p.name                                        AS 商品,
    SUM(i.quantity)                               AS 销量,
    ROUND(SUM(i.quantity * i.unit_price), 2)      AS 销售额
FROM order_item i
JOIN product p ON p.product_id = i.product_id
GROUP BY p.product_id, p.name
ORDER BY 销量 DESC, 销售额 DESC
LIMIT 5;
```

```txt
+------------------------+------+----------+
| 商品                   | 销量 | 销售额   |
+------------------------+------+----------+
| 三只松鼠坚果大礼包     |    6 |   594.00 |
| 罗技 MX Master 3S      |    4 |  2796.00 |
| 小米 14 手机           |    3 | 11997.00 |
| 蒙牛纯牛奶 250ml*12    |    3 |   179.70 |
| 《MySQL必知必会》      |    3 |   135.00 |
+------------------------+------+----------+
```

```sql
-- 问 6：各分类的销售额占比（三表连接 + 分组 + 窗口/子查询算占比）
SELECT
    c.name                                            AS 分类,
    SUM(i.quantity)                                   AS 销量,
    ROUND(SUM(i.quantity * i.unit_price), 2)          AS 销售额
FROM order_item i
JOIN product  p ON p.product_id  = i.product_id
JOIN category c ON c.category_id = p.category_id
GROUP BY c.category_id, c.name
ORDER BY 销售额 DESC;
```

```txt
+----------+------+----------+
| 分类     | 销量 | 销售额   |
+----------+------+----------+
| 手机数码 |    5 | 23995.00 |
| 电脑办公 |    7 | 21093.00 |
| 家用电器 |    4 | 12787.00 |
| 食品生鲜 |    9 |   773.70 |
| 图书     |    4 |   263.00 |
+----------+------+----------+
```

---

# 6. 多表连接 JOIN

## 6.1 为什么要拆表？为什么又要连起来？

如果所有数据塞一张表，会出现：订单里的客户电话重复存了 15 次、客户换号要改 15 个地方、商品名写错一个字就有 3 种写法……
所以设计上要**拆表**（这叫"规范化"），而查询时再用 `JOIN` **拼回来**。

`JOIN` 的本质：**按连接条件，把两张表的行两两配对，拼成一张更宽的表**。

## 6.2 从"笛卡尔积"说起：不加连接条件会怎样？

```sql
-- 危险实验：两张表直接 FROM，不给连接条件
SELECT COUNT(*) AS 结果行数 FROM customer, orders;
-- 9 × 15 = 135 行！每一行客户都跟每一行订单配对了一次，这叫【笛卡尔积】
-- 真实业务表动辄百万行，这么写一次就能把数据库拖死。
-- 老式写法（隐式连接）必须把连接条件写进 WHERE：
SELECT COUNT(*) FROM customer c, orders o WHERE o.customer_id = c.customer_id;   -- 15（正确）
-- 现在推荐用显式的 JOIN ... ON，语义清楚，也不容易漏写条件。
```

## 6.3 内连接 INNER JOIN：只保留"两边都匹配上"的行

```sql
-- 语法：FROM A INNER JOIN B ON 连接条件     （INNER 可以省略，直接写 JOIN）
-- 语义：只保留 A、B 中"能配上对"的行
SELECT
    o.order_id     AS 订单号,
    o.order_no     AS 订单编号,
    c.name         AS 客户,
    o.order_time   AS 下单时间,
    o.status       AS 状态,
    o.total_amount AS 金额
FROM orders o
JOIN customer c ON c.customer_id = o.customer_id     -- ★ 连接条件：订单的客户ID = 客户的ID
ORDER BY o.order_id
LIMIT 6;
```

```txt
+--------+----------------+--------+---------------------+--------+---------+
| 订单号 | 订单编号       | 客户   | 下单时间            | 状态   | 金额    |
+--------+----------------+--------+---------------------+--------+---------+
|      1 | SO202401050001 | 张伟   | 2024-01-05 10:12:00 | 已完成 | 3999.00 |
|      2 | SO202401080002 | 李娜   | 2024-01-08 14:30:00 | 已完成 |  218.00 |
|      3 | SO202402110003 | 王芳   | 2024-02-11 09:05:00 | 已完成 | 3196.00 |
|      4 | SO202402200004 | 张伟   | 2024-02-20 20:45:00 | 已完成 |  699.00 |
|      5 | SO202403020005 | 刘洋   | 2024-03-02 11:20:00 | 已取消 | 5999.00 |
|      6 | SO202403150006 | 陈静   | 2024-03-15 16:00:00 | 已完成 | 6198.00 |
+--------+----------------+--------+---------------------+--------+---------+
```

**给表起别名是连接查询的标配**：`orders o` 之后，`o.customer_id` 就代替了 `orders.customer_id`，句子短、可读性好。
**当两张表有同名列（比如都叫 `name`）时，必须用 `表别名.列名` 指明，否则报 1052 字段不明确。**

```sql
-- 三表连接：订单明细 + 订单 + 商品（想同时看到订单号、商品名、数量、金额）
SELECT
    o.order_no                             AS 订单编号,
    o.order_time                           AS 下单时间,
    p.name                                 AS 商品,
    i.quantity                             AS 数量,
    i.unit_price                           AS 单价,
    ROUND(i.quantity * i.unit_price, 2)    AS 小计
FROM order_item i
JOIN orders  o ON o.order_id   = i.order_id     -- 明细 → 订单
JOIN product p ON p.product_id = i.product_id   -- 明细 → 商品
ORDER BY o.order_id, i.item_id
LIMIT 8;
```

```txt
+----------------+---------------------+------------------------+------+---------+---------+
| 订单编号       | 下单时间            | 商品                   | 数量 | 单价    | 小计    |
+----------------+---------------------+------------------------+------+---------+---------+
| SO202401050001 | 2024-01-05 10:12:00 | 小米 14 手机           |    1 | 3999.00 | 3999.00 |
| SO202401080002 | 2024-01-08 14:30:00 | 《MySQL必知必会》      |    2 |   45.00 |   90.00 |
| SO202401080002 | 2024-01-08 14:30:00 | 《深入理解计算机系统》 |    1 |  128.00 |  128.00 |
| SO202402110003 | 2024-02-11 09:05:00 | 海尔 501L 冰箱         |    1 | 2899.00 | 2899.00 |
| SO202402110003 | 2024-02-11 09:05:00 | 三只松鼠坚果大礼包     |    3 |   99.00 |  297.00 |
| SO202402200004 | 2024-02-20 20:45:00 | 罗技 MX Master 3S      |    1 |  699.00 |  699.00 |
| SO202403020005 | 2024-03-02 11:20:00 | iPhone 15              |    1 | 5999.00 | 5999.00 |
| SO202403150006 | 2024-03-15 16:00:00 | 华为 MateBook 14       |    1 | 5499.00 | 5499.00 |
+----------------+---------------------+------------------------+------+---------+---------+
```

### 连接方式一览

| 写法 | 含义 | 说明 |
| --- | --- | --- |
| `A JOIN B ON ...` | 内连接 | 只留匹配上的（= `INNER JOIN`） |
| `A LEFT JOIN B ON ...` | 左外连接 | 保留**左表全部**行，右表匹配不上就填 NULL |
| `A RIGHT JOIN B ON ...` | 右外连接 | 保留**右表全部**行（用 `LEFT JOIN` 换个顺序写更易读） |
| `A CROSS JOIN B` | 交叉连接 | 笛卡尔积（就是不加条件的连接） |
| `A JOIN B USING (列名)` | 简化写法 | 两表同名列相同时，可写 `USING (customer_id)` |
| `A NATURAL JOIN B` | 自然连接 | 自动按所有同名列连接，**危险，别用**（加列就悄悄改变语义） |
| `A FULL OUTER JOIN B` | 全外连接 | **MySQL 不支持**，用 `LEFT JOIN UNION RIGHT JOIN` 模拟（见 6.6） |

## 6.4 左连接 LEFT JOIN：保留左表全部行

**LEFT JOIN 是最重要的连接**：它回答的是"**每个 xx（哪怕没有对应的 yy）**"这一类问题。

```sql
-- 需求：列出所有客户 + 各自的订单数和消费金额（"没有订单的客户"也要出现！）
SELECT
    c.customer_id                  AS 客户ID,
    c.name                         AS 客户,
    COUNT(o.order_id)              AS 订单数,        -- ★ 用 COUNT(o.order_id)，不能用 COUNT(*)
    IFNULL(ROUND(SUM(o.total_amount), 2), 0) AS 消费金额   -- ★ 用 IFNULL 把 NULL 变成 0
FROM customer c
LEFT JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.name
ORDER BY 消费金额 DESC;
```

```txt
+--------+--------+--------+----------+
| 客户ID | 客户   | 订单数 | 消费金额 |
+--------+--------+--------+----------+
|      5 | 陈静   |      2 | 13497.00 |
|      1 | 张伟   |      3 | 12095.00 |
|      3 | 王芳   |      2 | 11194.00 |
|      4 | 刘洋   |      2 |  8957.90 |
|      6 | 赵磊   |      2 |  8798.00 |
|      7 | 孙丽   |      1 |  3690.00 |
|      2 | 李娜   |      2 |   436.80 |
|      8 | 周敏   |      1 |   243.00 |
|      9 | 吴涛   |      0 |     0.00 |   ← ★ 没有订单的客户被保留下来了
+--------+--------+--------+----------+
```

**LEFT JOIN 生成的"假行"**：如果左表的某行在右表匹配不到，MySQL 会造一行"右表所有列都是 NULL"的行。
所以要在 `SELECT` 里用 `IFNULL()` / `COALESCE()` 兜底，否则会显示 NULL 而不是 0。

```sql
-- 反连接（Anti-Join）：找出"没有任何订单的客户"
-- 思路：左连接后，右表主键为 NULL 的行 = 匹配不上的行
SELECT c.customer_id, c.name
FROM customer c
LEFT JOIN orders o ON o.customer_id = c.customer_id
WHERE o.order_id IS NULL;         -- ★ 判断右表主键是不是 NULL
```

```txt
+-------------+--------+
| customer_id | name   |
+-------------+--------+
|           9 | 吴涛   |
+-------------+--------+
```

```sql
-- 右连接 RIGHT JOIN：语法上等价于"把左右表调个位置写 LEFT JOIN"
-- 下面两句结果一样，但第二句更好读（推荐尽量统一用 LEFT JOIN）
SELECT c.name, o.order_no FROM customer c RIGHT JOIN orders o ON o.customer_id = c.customer_id;
SELECT c.name, o.order_no FROM orders o LEFT JOIN customer c ON c.customer_id = o.customer_id;
```

## 6.5 自连接：一张表跟自己连

```sql
-- 需求：找出"住在同一个城市"的客户对
-- 思路：把 customer 想象成两张表 a 和 b，用城市连接，再用 a.id < b.id 去重（否则会出现自己和自己的配对）
SELECT
    a.name AS 客户A,
    b.name AS 客户B,
    a.city AS 城市
FROM customer a
JOIN customer b
  ON a.city = b.city                -- 连接条件：城市相同
 AND a.customer_id < b.customer_id  -- ★ 防止 (A,B) 和 (B,A) 重复出现，也排除自己跟自己配对
ORDER BY a.city;
```

```txt
+--------+--------+------+
| 客户A  | 客户B  | 城市 |
+--------+--------+------+
| 张伟   | 孙丽   | 北京 |
+--------+--------+------+
```

**自连接的典型场景**：员工表里查"每个员工的上级姓名"（`employee.manager_id = m.employee_id`）、
分类表里查"父子分类"、找"连续两天都下单的用户"。

```sql
-- 更实用的自连接：查"比某件商品更贵的其他商品"（同一张表内比较）
SELECT a.name AS 商品, a.price AS 价格,
       b.name AS 对比商品, b.price AS 对比价格
FROM product a JOIN product b ON a.price > b.price
WHERE a.product_id = 1              -- 只看小米14手机
ORDER BY b.price DESC
LIMIT 3;
```

## 6.6 连接条件写 `ON` 还是 `WHERE`？—— LEFT JOIN 里的关键区别

这是新手最容易搞错的地方，**必须做实验记住**：

```sql
-- 实验目标：统计每个客户的有效订单数（"已取消"不算），没有订单的客户也要显示
-- ★ 正确写法 A：把状态条件写在 ON 里
SELECT c.customer_id AS 客户ID, c.name AS 客户, COUNT(o.order_id) AS 有效订单数
FROM customer c
LEFT JOIN orders o
       ON o.customer_id = c.customer_id
      AND o.status <> '已取消'          -- 条件在 ON 里：右表先被过滤，再匹配；匹配不到仍保留左表行
GROUP BY c.customer_id, c.name
ORDER BY c.customer_id;

-- ✗ 错误写法 B：把状态条件写在 WHERE 里
SELECT c.name AS 客户, COUNT(o.order_id) AS 订单数
FROM customer c
LEFT JOIN orders o ON o.customer_id = c.customer_id
WHERE o.status <> '已取消'              -- 条件在 WHERE 里：右表为 NULL 的假行被过滤掉 → 左连接退化成内连接！
GROUP BY c.customer_id, c.name;
-- 效果：吴涛（本来没有订单，右表全是 NULL）被 WHERE 干掉了，结果里再也看不到"0 单客户"
```

```txt
-- 写法 A 的结果（正确，9 个客户都在，吴涛 0 单）
+--------+--------+--------------+
| 客户ID | 客户   | 有效订单数   |
+--------+--------+--------------+
|      1 | 张伟   |            3 |
|      2 | 李娜   |            2 |
|      3 | 王芳   |            2 |
|      4 | 刘洋   |            1 |   ← 刘洋本来有 2 单，其中 5 号单已取消，所以有效 1 单
|      5 | 陈静   |            2 |
|      6 | 赵磊   |            2 |
|      7 | 孙丽   |            1 |
|      8 | 周敏   |            1 |
|      9 | 吴涛   |            0 |   ← ★ 没有订单的客户被保留下来了
+--------+--------+--------------+
```

> **一句话记住**：
> - `ON` 里的条件决定"右表的哪些行**有资格**参与匹配"；
> - `WHERE` 里的条件决定"拼完之后**哪些行能留下**"（会把补 NULL 的假行也一起干掉）。
>
> 内连接时两者等价（优化器会做同样的事），**但 LEFT JOIN 时差别巨大**。

## 6.7 UNION：把两个结果集"上下叠起来"

```sql
-- UNION：合并两个 SELECT 的结果，并【去重】
-- UNION ALL：合并但【不去重】（更快，能用 UNION ALL 就别用 UNION）
-- 规则：两个 SELECT 的列数必须相同，对应列的类型要兼容；列名以第一个 SELECT 为准
SELECT '无订单客户' AS 类型, c.name AS 姓名
FROM customer c LEFT JOIN orders o ON o.customer_id = c.customer_id
WHERE o.order_id IS NULL
UNION ALL
SELECT '无成绩学生', st.name
FROM student st LEFT JOIN score s ON s.student_id = st.student_id
WHERE s.score_id IS NULL;
```

```txt
+--------------+--------+
| 类型         | 姓名   |
+--------------+--------+
| 无订单客户   | 吴涛   |
| 无成绩学生   | 赵磊   |
+--------------+--------+
```

```sql
-- 用 UNION 模拟 FULL OUTER JOIN（MySQL 没有 FULL JOIN）
-- 需求：既要"没订单的客户"，也要"没有客户的订单"
SELECT c.name AS 客户, o.order_no AS 订单
FROM customer c LEFT JOIN orders o ON o.customer_id = c.customer_id
UNION                                  -- 这里用 UNION 去重
SELECT c.name, o.order_no
FROM orders o LEFT JOIN customer c ON c.customer_id = o.customer_id
WHERE c.customer_id IS NULL;
-- 本例数据里没有"孤儿订单"（外键保证了），所以结果就是全部 15 笔订单 + 吴涛那行

-- 排序的写法：ORDER BY 只能写在最后，作用于【合并后的结果】
(SELECT name AS 名称 FROM product WHERE price > 5000)
UNION ALL
(SELECT name FROM product WHERE stock = 0)
ORDER BY 名称;
```

`UNION` 与 `UNION ALL` 的区别用一句话说清：**`UNION` = 合并 + 去重（有排序开销）；`UNION ALL` = 只合并（最快）**。
如果明知两个结果集不会重复，一定用 `UNION ALL`。

## 6.8 实战：三张报表

```sql
-- 报表 1：每个商品的销量与销售额（含从未卖出的商品，要显示 0）
SELECT
    p.product_id                               AS 商品ID,
    p.name                                     AS 商品,
    IFNULL(SUM(i.quantity), 0)                 AS 销量,
    IFNULL(ROUND(SUM(i.quantity * i.unit_price), 2), 0) AS 销售额
FROM product p
LEFT JOIN order_item i ON i.product_id = p.product_id   -- ★ 左连接：没卖出去的也要出现
GROUP BY p.product_id, p.name
ORDER BY 销量 DESC, p.product_id;
```

```txt
+--------+--------------------------+------+----------+
| 商品ID | 商品                     | 销量 | 销售额   |
+--------+--------------------------+------+----------+
|     11 | 三只松鼠坚果大礼包       |    6 |   594.00 |
|      5 | 罗技 MX Master 3S        |    4 |  2796.00 |
|      1 | 小米 14 手机             |    3 | 11997.00 |
|      9 | 《MySQL必知必会》        |    3 |   135.00 |
|     12 | 蒙牛纯牛奶 250ml*12      |    3 |   179.70 |
|      2 | iPhone 15                |    2 | 11998.00 |
|      3 | 华为 MateBook 14         |    2 | 10998.00 |
|      6 | 海尔 501L 冰箱           |    2 |  5798.00 |
|      4 | 联想拯救者 Y7000P        |    1 |  7299.00 |
|      7 | 美的 1.5 匹空调          |    1 |  3299.00 |
|      8 | 戴森 V12 吸尘器          |    1 |  3690.00 |
|     10 | 《深入理解计算机系统》   |    1 |   128.00 |
+--------+--------------------------+------+----------+
```

```sql
-- 报表 2：每个客户的消费金额及占总额的百分比
SELECT
    c.name                                              AS 客户,
    ROUND(SUM(o.total_amount), 2)                       AS 消费金额,
    ROUND(100 * SUM(o.total_amount)
          / (SELECT SUM(total_amount) FROM orders), 2)  AS 占比百分比
FROM customer c
JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.name
ORDER BY 消费金额 DESC;
```

```txt
+--------+----------+------------+
| 客户   | 消费金额 | 占比百分比 |
+--------+----------+------------+
| 陈静   | 13497.00 |      22.91 |
| 张伟   | 12095.00 |      20.53 |
| 王芳   | 11194.00 |      19.00 |
| 刘洋   |  8957.90 |      15.21 |
| 赵磊   |  8798.00 |      14.93 |
| 孙丽   |  3690.00 |       6.26 |
| 李娜   |   436.80 |       0.74 |
| 周敏   |   243.00 |       0.41 |
+--------+----------+------------+
```

```sql
-- 报表 3：四个表的"全链路"查询 —— 谁、什么时候、买了什么分类的什么商品、多少钱
SELECT
    o.order_no       AS 订单编号,
    c.name           AS 客户,
    c.city           AS 城市,
    cat.name         AS 分类,
    p.name           AS 商品,
    i.quantity       AS 数量,
    ROUND(i.quantity * i.unit_price, 2) AS 小计
FROM order_item i
JOIN orders   o   ON o.order_id    = i.order_id
JOIN customer c   ON c.customer_id = o.customer_id
JOIN product  p   ON p.product_id  = i.product_id
JOIN category cat ON cat.category_id = p.category_id
WHERE o.status <> '已取消'
ORDER BY o.order_id, i.item_id
LIMIT 10;
```

> **连接写多了会慢吗？** 会在一定复杂度上变慢，但这是"正确的慢"。
> 关键是**连接列上要有索引**（`order_item.order_id`、`order_item.product_id` 等在初始化脚本里都建了索引）。
> 没索引的连接会变成"每行都去对方表里全表扫一遍"，几万行就能拖垮数据库。

---

# 7. 子查询

**子查询（Subquery）= 写在括号里的一条 SELECT**。它可以出现在 `WHERE`、`FROM`、`SELECT` 甚至 `HAVING` 里，
让你"用一步查出来的结果，去喂给另一条语句"。

## 7.1 子查询的四种形态（按返回结果的形状分类）

| 形态 | 返回什么 | 能用在 | 例子 |
| --- | --- | --- | --- |
| **标量子查询** | 1 行 1 列（一个值） | 任何需要"一个值"的地方 | `WHERE price > (SELECT AVG(price) FROM product)` |
| **列子查询** | 1 列多行 | `IN` / `ANY` / `ALL` / `EXISTS` | `WHERE category_id IN (SELECT ...)` |
| **行子查询** | 1 行多列 | `(a,b) = (SELECT x,y ...)` | 见 7.5 |
| **表子查询** | 多行多列（一张小表） | 只能放在 `FROM` 后面（派生表） | `FROM (SELECT ...) t` |

```sql
-- ① 标量子查询（最常用）：拿"全店平均价"去比较每件商品
SELECT name AS 商品, price AS 价格
FROM   product
WHERE  price > (SELECT AVG(price) FROM product)     -- ★ 括号里的结果是一个数字：2809.575
ORDER  BY price;
```

```txt
+--------------------------+---------+
| 商品                     | 价格    |
+--------------------------+---------+
| 海尔 501L 冰箱           | 2899.00 |
| 美的 1.5 匹空调          | 3299.00 |
| 戴森 V12 吸尘器          | 3690.00 |
| 小米 14 手机             | 3999.00 |
| 华为 MateBook 14         | 5499.00 |
| iPhone 15                | 5999.00 |
| 联想拯救者 Y7000P        | 7299.00 |
+--------------------------+---------+
```

```sql
-- 标量子查询还能放在 SELECT 里当"动态列"
SELECT
    name  AS 商品,
    price AS 价格,
    (SELECT ROUND(AVG(price), 2) FROM product)          AS 全店均价,   -- 每行都显示同一个值
    price - (SELECT AVG(price) FROM product)            AS 高于均价多少
FROM product
ORDER BY 高于均价多少 DESC
LIMIT 5;

-- ⚠️ 标量子查询必须"确实只返回一个值"：
--    如果它返回多行，会报 1242: Subquery returns more than 1 row
SELECT * FROM product WHERE price = (SELECT price FROM product);   -- ✗ 1242

-- ② 列子查询 + IN：买过某个商品的客户
SELECT customer_id AS 客户ID, name AS 客户
FROM   customer
WHERE  customer_id IN (
    SELECT o.customer_id
    FROM orders o
    JOIN order_item i ON i.order_id = o.order_id
    WHERE i.product_id = (SELECT product_id FROM product WHERE name = '三只松鼠坚果大礼包')
);
```

```txt
+--------+--------+
| 客户ID | 客户   |
+--------+--------+
|      2 | 李娜   |
|      3 | 王芳   |
|      8 | 周敏   |
+--------+--------+
```

```sql
-- ③ ANY / ALL：和"一组值"做比较（记住等价关系就不容易绕晕）
--    > ANY (子查询)  等价于  > 最小值
--    > ALL (子查询)  等价于  > 最大值
--    = ANY (子查询)  等价于  IN
SELECT * FROM product WHERE price > ALL (SELECT price FROM product WHERE category_id = 4);
-- 图书价格是 45.00 和 128.00；> ALL 意味着 > 128.00 → 命中 8 件商品

SELECT * FROM product WHERE price > ANY (SELECT price FROM product WHERE category_id = 4);
-- > 最小值 45.00 → 命中 11 件商品（除 45.00 那本之外全部）

-- ⚠️ 子查询结果里只要有一个 NULL，ALL/ANY 的结论就可能变成"未知"，整条查询返回空
--    所以对可能为 NULL 的列，记得加 WHERE 列 IS NOT NULL
```

## 7.2 `IN` 还是 `EXISTS`？以及 `NOT IN` 的 NULL 陷阱

```sql
-- ========== NOT IN 的坑（第 4 章埋的伏笔，这里彻底讲清） ==========
-- 需求：找出"从没买过任何商品"的客户
SELECT * FROM customer
WHERE customer_id NOT IN (SELECT customer_id FROM orders);
-- 这条能跑对，因为 orders.customer_id 是 NOT NULL。
-- 但如果子查询的列允许 NULL，比如"没买过商品的商品ID"，就会全军覆没：
SELECT * FROM product
WHERE product_id NOT IN (SELECT product_id FROM order_item);   -- 若 order_item 里有 product_id 为 NULL 的行 → 结果永远为空
-- 原因复习：x NOT IN (1,2,NULL) = x<>1 AND x<>2 AND x<>NULL = ... AND NULL = NULL → 永不为 TRUE

-- ========== EXISTS：改写成"存在性判断"，天然躲开 NULL 陷阱 ==========
-- EXISTS 只回答"子查询有没有查到行"，不关心查到了什么值，所以 NULL 完全不影响它
SELECT st.student_id AS 学号, st.name AS 学生
FROM   student st
WHERE  EXISTS (SELECT 1 FROM score s                 -- SELECT 1 就行，写 * 也可以
               WHERE s.student_id = st.student_id
                 AND s.score >= 60)                 -- ★ 至少有一门课及格
ORDER  BY st.student_id;
```

```txt
+--------+--------+
| 学号   | 学生   |
+--------+--------+
|      1 | 张伟   |
|      2 | 李娜   |
|      3 | 王芳   |
|      4 | 刘洋   |
|      5 | 陈静   |
+--------+--------+
```

```sql
-- NOT EXISTS：一门课都没有成绩的学生（转学生赵磊）
SELECT st.student_id AS 学号, st.name AS 学生
FROM   student st
WHERE  NOT EXISTS (SELECT 1 FROM score s WHERE s.student_id = st.student_id);
```

```txt
+--------+--------+
| 学号   | 学生   |
+--------+--------+
|      6 | 赵磊   |
+--------+--------+
```

| 对比项 | `IN` | `EXISTS` |
| --- | --- | --- |
| 语义 | 值在集合里 | 子查询是否查到行 |
| 遇 NULL | `NOT IN` 容易踩坑（结果为空） | 不受 NULL 影响 ✅ |
| 执行方式 | 5.6+ 优化器常把它改写成半连接（semi-join），性能不错 | 逐行做"存在性"探测，通常走索引，很快 |
| 推荐 | 子查询结果集小、且列 NOT NULL 时 | **不确定时优先用 `EXISTS` / `NOT EXISTS`** |

## 7.3 相关子查询：子查询里"引用外层表的列"

```sql
-- 需求：每门课的最高分是谁
SELECT st.name AS 学生, c.name AS 课程, s.score AS 分数
FROM   score s
JOIN   student st ON st.student_id = s.student_id
JOIN   course  c  ON c.course_id   = s.course_id
WHERE  s.score = (SELECT MAX(s2.score)                 -- ★ 子查询里用到了外层的 s.course_id
                  FROM   score s2
                  WHERE  s2.course_id = s.course_id);  -- 这叫"相关"：子查询依赖外层的值
                                                     -- 概念上：外层每有一行，子查询就重跑一次
ORDER  BY c.course_id;
```

```txt
+--------+--------+-------+
| 学生   | 课程   | 分数  |
+--------+--------+-------+
| 李娜   | 语文   |  95.0 |
| 陈静   | 数学   |  96.5 |
| 李娜   | 英语   |  92.5 |
| 陈静   | 物理   |  94.0 |
+--------+--------+-------+
```

```sql
-- 更实用的相关子查询：查"价格高于本分类均价"的商品
SELECT c.name AS 分类, p.name AS 商品, p.price AS 价格,
       (SELECT ROUND(AVG(p2.price), 2) FROM product p2
        WHERE p2.category_id = p.category_id) AS 本分类均价     -- 相关子查询当"动态列"
FROM product p
JOIN category c ON c.category_id = p.category_id
WHERE p.price > (SELECT AVG(p3.price) FROM product p3
                 WHERE p3.category_id = p.category_id)          -- 相关子查询做过滤
ORDER BY c.category_id, p.price DESC;                          -- 按分类ID排序，结果稳定
```

```txt
+----------+--------------------------+---------+------------+
| 分类     | 商品                     | 价格    | 本分类均价 |
+----------+--------------------------+---------+------------+
| 手机数码 | iPhone 15                | 5999.00 |    4999.00 |
| 电脑办公 | 联想拯救者 Y7000P        | 7299.00 |    4499.00 |
| 电脑办公 | 华为 MateBook 14         | 5499.00 |    4499.00 |
| 家用电器 | 戴森 V12 吸尘器          | 3690.00 |    3296.00 |
| 家用电器 | 美的 1.5 匹空调          | 3299.00 |    3296.00 |
| 图书     | 《深入理解计算机系统》   |  128.00 |      86.50 |
| 食品生鲜 | 三只松鼠坚果大礼包       |   99.00 |      79.45 |
+----------+--------------------------+---------+------------+
```

> **相关子查询的性能提醒**：概念上"外层每行都要跑一次子查询"，所以大表上要留意。
> 但只要子查询用到的列**有索引**（这里是 `idx_product_category`），实际执行会走索引，性能通常可以接受。
> 用 `EXPLAIN` 看执行计划时，如果出现 `DEPENDENT SUBQUERY`，就说明是相关子查询，要关注它扫了多少行。

## 7.4 派生表（FROM 里的子查询）与 CTE

```sql
-- 派生表：把子查询的结果当成一张"临时表"来查
-- ★ 铁律：FROM 后面的子查询【必须起别名】（否则报 1248: Every derived table must have its own alias）
SELECT t.分类, t.平均价
FROM (
    SELECT c.name AS 分类, ROUND(AVG(p.price), 2) AS 平均价
    FROM product p JOIN category c ON c.category_id = p.category_id
    GROUP BY c.category_id, c.name
) t                                                -- ★ 别名 t 不能省
WHERE t.平均价 > (SELECT AVG(price) FROM product)  -- 高于全店平均价的分类
ORDER BY t.平均价 DESC;
```

```txt
+----------+---------+
| 分类     | 平均价  |
+----------+---------+
| 手机数码 | 4999.00 |
| 电脑办公 | 4499.00 |
| 家用电器 | 3296.00 |
+----------+---------+
```

```sql
-- CTE（公用表表达式）【8.0+】：把派生表提到前面写，可读性更好，还能被引用多次
WITH cust_amount AS (                     -- ★ 定义"临时结果集"，可以定义多个，用逗号隔开
    SELECT c.customer_id AS 客户ID, c.name AS 客户,
           ROUND(SUM(o.total_amount), 2) AS 消费金额
    FROM customer c JOIN orders o ON o.customer_id = c.customer_id
    GROUP BY c.customer_id, c.name
)
SELECT 客户, 消费金额,
       CASE WHEN 消费金额 >= 10000 THEN '高价值'
            WHEN 消费金额 >= 3000  THEN '中价值'
            ELSE '低价值' END AS 价值分档
FROM cust_amount
ORDER BY 消费金额 DESC;
```

```txt
+--------+----------+----------+
| 客户   | 消费金额 | 价值分档 |
+--------+----------+----------+
| 陈静   | 13497.00 | 高价值   |
| 张伟   | 12095.00 | 高价值   |
| 王芳   | 11194.00 | 高价值   |
| 刘洋   |  8957.90 | 中价值   |
| 赵磊   |  8798.00 | 中价值   |
| 孙丽   |  3690.00 | 中价值   |
| 李娜   |   436.80 | 低价值   |
| 周敏   |   243.00 | 低价值   |
+--------+----------+----------+
```

```sql
-- CTE 的进阶用法：WITH RECURSIVE 递归（8.0+）—— 生成数字序列、查组织树、算层级
WITH RECURSIVE seq(n) AS (
    SELECT 1                      -- ① 初始行（锚点）
    UNION ALL
    SELECT n + 1 FROM seq         -- ② 递归：引用自己，直到 WHERE 不成立
    WHERE n < 5
)
SELECT n AS 序号 FROM seq;
-- 结果：1 2 3 4 5

-- CTE 可以定义多个，后面的可以引用前面的（用逗号分隔）
WITH a AS (SELECT 1 AS x),
     b AS (SELECT x + 1 AS y FROM a)
SELECT * FROM a JOIN b;
```

## 7.5 子查询 vs JOIN：到底该用哪个？

```sql
-- 同一个需求（买过坚果大礼包的客户）的三种写法
-- ① 子查询 + IN（直观，像自然语言）
SELECT name FROM customer WHERE customer_id IN (
    SELECT o.customer_id FROM orders o JOIN order_item i ON i.order_id = o.order_id
    WHERE i.product_id = 11);

-- ② EXISTS（不怕 NULL，通常能走索引）
SELECT c.name FROM customer c WHERE EXISTS (
    SELECT 1 FROM orders o JOIN order_item i ON i.order_id = o.order_id
    WHERE o.customer_id = c.customer_id AND i.product_id = 11);

-- ③ JOIN + DISTINCT（连接查询，注意要用 DISTINCT 去重，否则一个客户买多次会出现多行）
SELECT DISTINCT c.name
FROM customer c
JOIN orders o     ON o.customer_id = c.customer_id
JOIN order_item i ON i.order_id = o.order_id
WHERE i.product_id = 11;
```

**选择建议**：

| 场景 | 推荐写法 |
| --- | --- |
| 需要"另一个表里的具体列"（比如显示商品名） | **JOIN**（子查询做不到一次取出多列） |
| 只需要"存在 / 不存在"判断 | `EXISTS` / `NOT EXISTS` |
| 在集合里取一个值做比较 | 标量子查询或 `IN` |
| 先聚合再筛选（每组的最大值、平均值） | 派生表 / CTE / 窗口函数（第 8 章） |
| 逻辑复杂、要分步骤写 | **CTE**（8.0+），可读性最好 |

> **性能上的真相**：现代 MySQL 优化器很聪明，`IN`、`EXISTS`、`JOIN` 常常被改写成同一种执行计划。
> **先写清楚语义，再用 `EXPLAIN` 看实际计划**，不要凭感觉"背结论"。

**🖐 动手练习（第 5～7 章）**

1. 统计每个分类下"在售"商品的数量和平均价（没有在售商品的分类也要显示，均价显示 0）。
2. 找出订单数超过 2 笔的客户，以及他们的平均每单金额。
3. 查出"单价高于同分类商品平均价、且库存大于 0"的商品。
4. 查出每门课的"最高分"和"最低分之差"。
5. 找出既没有下过订单、也没有成绩记录的人（跨库？想想该怎么查，或者分成两句）。

---

# 8. 窗口函数【8.0+】

> 窗口函数是 MySQL 8.0 最重要的功能升级之一。它解决了一类"以前只能靠自连接或变量硬湊"的问题：
> **在不折叠行的前提下做聚合**。
> 如果你的环境还是 5.7，本章可以先跳过，等升级后再回来看（第 6.5 节的自连接能替代一部分场景）。

## 8.1 一个例子看懂"窗口"和"分组"的区别

```sql
-- 需求：显示每个学生的总分，同时显示"全班总分最高的那个人的分数"和"他在班里的名次"
-- 用 GROUP BY 做不到：GROUP BY 会把 5 个学生折叠成 1 行，你就看不到每个学生了
-- 用窗口函数：每一行都保留，同时多出"基于某个窗口算出来的统计值"

SELECT
    st.name                          AS 学生,
    ROUND(SUM(s.score), 1)           AS 总分,
    ROUND(SUM(SUM(s.score)) OVER (), 2) AS 全员总分合计,   -- 窗口 = 全部行
    ROUND(AVG(SUM(s.score)) OVER (), 2) AS 平均总分
FROM student st
JOIN score s ON s.student_id = st.student_id
GROUP BY st.student_id, st.name
ORDER BY 总分 DESC;
```

| | `GROUP BY` | 窗口函数 `OVER()` |
| --- | --- | --- |
| 输出行数 | 变成"组的个数"（行被折叠） | **和原行数一样**（行不折叠） |
| 能同时看明细和统计值吗 | ❌ 不能 | ✅ 能 |
| 写在哪儿 | `GROUP BY` 子句 | `SELECT` 列表 / `ORDER BY` |
| 典型场景 | 报表汇总 | 排名、占比、环比、累计、TopN |

## 8.2 `OVER()` 的三件套

```txt
函数名(...) OVER (
    PARTITION BY 分组列      -- ① 把行分成几个窗口（不写 = 全部行是一个窗口）
    ORDER BY    排序列       -- ② 窗口内怎么排序（决定"累计"的顺序）
    ROWS BETWEEN ... AND ... -- ③ 窗口帧：算哪些行（不写有默认值）
)
```

- **`PARTITION BY`**：相当于"分组"，但它不折叠行，只是把同组的行划到一起算。
- **`ORDER BY`**：一旦写了排序，聚合窗口默认就变成"从第一行累计到当前行"（见 8.4）。
- **窗口帧（frame）**：控制"当前行参与计算的范围"，默认是 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`。
  注意默认是 **`RANGE`** 而不是 `ROWS`：排序值**相同的行会被当成一批**（累计值一样）；
  想严格"一行一行地累加"就显式写 `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`。

```sql
-- 用一组小数据直观看出"帧"的作用
SELECT
    x AS 值,
    SUM(x) OVER (ORDER BY x) AS 默认累计,                                    -- 从头加到当前行
    SUM(x) OVER (ORDER BY x ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) AS 移动两行和
FROM (SELECT 10 AS x UNION ALL SELECT 20 UNION ALL SELECT 30 UNION ALL SELECT 40) t;
```

```txt
+------+----------+------------+
| 值   | 默认累计 | 移动两行和 |
+------+----------+------------+
|   10 |       10 |         10 |
|   20 |       30 |         30 |   ← 20 前面只有 1 行，所以是 10+20
|   30 |       60 |         50 |   ← 只看"前一行 + 当前行" = 20+30
|   40 |      100 |         70 |   ← 30+40
+------+----------+------------+
```

## 8.3 排名三兄弟：ROW_NUMBER / RANK / DENSE_RANK

```sql
-- 先用一组"有并列"的数据看清三者差别（成绩：100, 100, 90, 80）
SELECT x AS 分数,
       ROW_NUMBER() OVER (ORDER BY x DESC) AS 行号,      -- 永远 1,2,3,4（并列也要分出先后）
       RANK()       OVER (ORDER BY x DESC) AS 并列排名,  -- 并列同名次，之后【跳号】
       DENSE_RANK() OVER (ORDER BY x DESC) AS 紧凑排名   -- 并列同名次，之后【不跳号】
FROM (SELECT 100 AS x UNION ALL SELECT 100 UNION ALL SELECT 90 UNION ALL SELECT 80) t;
```

```txt
+------+------+----------+----------+
| 分数 | 行号 | 并列排名 | 紧凑排名 |
+------+------+----------+----------+
|  100 |    1 |        1 |        1 |
|  100 |    2 |        1 |        1 |
|   90 |    3 |        3 |        2 |   ← RANK 跳到 3，DENSE_RANK 是 2
|   80 |    4 |        4 |        3 |
+------+------+----------+----------+
```

```sql
-- 实战：给学生的总分排名（练习库数据没有并列，三个函数结果相同）
SELECT
    st.name                        AS 学生,
    ROUND(SUM(s.score), 1)         AS 总分,
    ROW_NUMBER() OVER (ORDER BY SUM(s.score) DESC) AS 行号,
    RANK()       OVER (ORDER BY SUM(s.score) DESC) AS 排名
FROM student st
JOIN score s ON s.student_id = st.student_id
GROUP BY st.student_id, st.name;
```

```txt
+--------+-------+------+------+
| 学生   | 总分  | 行号 | 排名 |
+--------+-------+------+------+
| 陈静   | 367.0 |    1 |    1 |
| 李娜   | 365.5 |    2 |    2 |
| 张伟   | 345.0 |    3 |    3 |
| 王芳   | 318.0 |    4 |    4 |
| 刘洋   | 267.5 |    5 |    5 |
+--------+-------+------+------+
```

```sql
-- PARTITION BY 的威力：每门课内部单独排名（"班内排名"变"各科排名"）
SELECT c.name AS 课程, st.name AS 学生, s.score AS 分数,
       RANK() OVER (PARTITION BY c.course_id ORDER BY s.score DESC) AS 课程内排名
FROM score s
JOIN student st ON st.student_id = s.student_id
JOIN course  c  ON c.course_id   = s.course_id
ORDER BY c.course_id, 课程内排名;
```

```txt
+--------+--------+-------+------------+
| 课程   | 学生   | 分数  | 课程内排名 |
+--------+--------+-------+------------+
| 语文   | 李娜   |  95.0 |          1 |
| 语文   | 陈静   |  91.0 |          2 |
| 语文   | 张伟   |  88.5 |          3 |
| 语文   | 王芳   |  76.0 |          4 |
| 语文   | 刘洋   |  68.0 |          5 |
| 数学   | 陈静   |  96.5 |          1 |
| 数学   | 张伟   |  92.0 |          2 |
| 数学   | 李娜   |  88.0 |          3 |
| 数学   | 王芳   |  81.5 |          4 |
| 数学   | 刘洋   |  59.5 |          5 |
| ...    | ...    |   ... |        ... |
+--------+--------+-------+------------+
```

```sql
-- 其他常用排名/取值函数
SELECT name, price,
       NTILE(4)     OVER (ORDER BY price DESC) AS 价格四等分档,   -- 平均分成 4 档，返回 1~4
       FIRST_VALUE(name) OVER (ORDER BY price DESC) AS 最贵的商品, -- 窗口内第一行的值
       LAST_VALUE(name)  OVER (ORDER BY price DESC
             ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS 最便宜的商品
FROM product
LIMIT 5;
```

> ⚠️ `LAST_VALUE` 默认的帧是"第一行到当前行"，所以直接写会得到"当前行自己"。
> 想取整个窗口的最后一行，必须显式写 `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`（如上）。
> 这个坑很经典，考试和面试都爱问。

## 8.4 聚合 + 窗口：累计、占比、移动平均

```sql
-- ① 累计消费（每个客户的订单按时间累加）
SELECT c.name AS 客户, o.order_time AS 下单时间, o.total_amount AS 金额,
       ROUND(SUM(o.total_amount) OVER (PARTITION BY c.customer_id
                                       ORDER BY o.order_time), 2) AS 累计消费
FROM orders o
JOIN customer c ON c.customer_id = o.customer_id
WHERE c.customer_id = 1                     -- 只看张伟，结果短一点好读
ORDER BY o.order_time;
```

```txt
+--------+---------------------+---------+----------+
| 客户   | 下单时间            | 金额    | 累计消费 |
+--------+---------------------+---------+----------+
| 张伟   | 2024-01-05 10:12:00 | 3999.00 |  3999.00 |
| 张伟   | 2024-02-20 20:45:00 |  699.00 |  4698.00 |
| 张伟   | 2024-05-09 15:40:00 | 7397.00 | 12095.00 |
+--------+---------------------+---------+----------+
```

```sql
-- ② 占比：每个人的消费占总额的百分比（不用子查询，直接除以"全窗口合计"）
SELECT c.name AS 客户,
       ROUND(SUM(o.total_amount), 2) AS 消费金额,
       ROUND(100 * SUM(o.total_amount) / SUM(SUM(o.total_amount)) OVER (), 2) AS 占比百分比
FROM customer c
JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.name
ORDER BY 消费金额 DESC;
```

```txt
+--------+----------+------------+
| 客户   | 消费金额 | 占比百分比 |
+--------+----------+------------+
| 陈静   | 13497.00 |      22.91 |
| 张伟   | 12095.00 |      20.53 |
| 王芳   | 11194.00 |      19.00 |
| 刘洋   |  8957.90 |      15.21 |
| 赵磊   |  8798.00 |      14.93 |
| 孙丽   |  3690.00 |       6.26 |
| 李娜   |   436.80 |       0.74 |
| 周敏   |   243.00 |       0.41 |
+--------+----------+------------+
```

## 8.5 LAG / LEAD：和"上一行、下一行"比较（环比、同比）

```sql
-- 月度销售额及环比（这个月比上个月多了多少）
SELECT
    月份,
    金额,
    LAG(金额)  OVER (ORDER BY 月份) AS 上月金额,     -- 取上一行的值（第一行没有上一行 → NULL）
    金额 - LAG(金额) OVER (ORDER BY 月份) AS 环比增减 -- 
    -- LEAD(金额) OVER (ORDER BY 月份) AS 下月金额,  -- LEAD 是取下一行
FROM (
    SELECT DATE_FORMAT(order_time, '%Y-%m') AS 月份,
           ROUND(SUM(total_amount), 2)      AS 金额
    FROM orders
    WHERE status <> '已取消'          -- 排除取消单
    GROUP BY 月份
) t
ORDER BY 月份;
```

```txt
+---------+----------+----------+----------+
| 月份    | 金额     | 上月金额 | 环比增减 |
+---------+----------+----------+----------+
| 2024-01 |  4217.00 |     NULL |     NULL |
| 2024-02 |  3895.00 |  4217.00 |  -322.00 |
| 2024-03 |  6416.80 |  3895.00 |  2521.80 |
| 2024-04 | 11297.00 |  6416.80 |  4880.20 |
| 2024-05 | 18386.00 | 11297.00 |  7089.00 |
| 2024-06 |  8700.90 | 18386.00 | -9685.10 |
+---------+----------+----------+----------+
```

```sql
-- LAG 还可以"隔着几行取"：LAG(值, 2) 取上上行（同比常用 LAG(x, 12) 取去年同月）
SELECT 月份, 金额,
       LAG(金额, 1, 0) OVER (ORDER BY 月份) AS 上上月或0   -- 第三个参数是"没有上一行时的默认值"
FROM (SELECT DATE_FORMAT(order_time,'%Y-%m') AS 月份, ROUND(SUM(total_amount),2) AS 金额
      FROM orders WHERE status <> '已取消' GROUP BY 月份) t
ORDER BY 月份;
```

## 8.6 每组取 TopN：窗口函数最经典的用途

```sql
-- 需求：每个分类里最贵的那件商品
-- 思路：① 先用窗口函数给"每个分类内部"按价格排名；② 外层子查询只留 rn = 1
SELECT 分类, 商品, 价格
FROM (
    SELECT c.name AS 分类, p.name AS 商品, p.price AS 价格,
           ROW_NUMBER() OVER (PARTITION BY p.category_id      -- 按分类分窗口
                              ORDER BY p.price DESC) AS rn    -- 窗口内按价格排名
    FROM product p
    JOIN category c ON c.category_id = p.category_id
) t
WHERE rn = 1                                  -- ★ 不能直接写在 WHERE 里，必须套一层（见下方注意）
ORDER BY 价格 DESC;
```

```txt
+----------+--------------------------+---------+
| 分类     | 商品                     | 价格    |
+----------+--------------------------+---------+
| 电脑办公 | 联想拯救者 Y7000P        | 7299.00 |
| 手机数码 | iPhone 15                | 5999.00 |
| 家用电器 | 戴森 V12 吸尘器          | 3690.00 |
| 图书     | 《深入理解计算机系统》   |  128.00 |
| 食品生鲜 | 三只松鼠坚果大礼包       |   99.00 |
+----------+--------------------------+---------+
```

```sql
-- 想"每组取前 2 名"就改成 WHERE rn <= 2 —— 这是自连接/子查询很难优雅做到的
-- 如果同一分类里有并列最贵的商品：用 RANK() 会都取出来（rn=1 有多行），用 ROW_NUMBER() 只会取一件

-- 不用窗口函数的老写法（8.0 之前只能这样）：相关子查询
SELECT c.name AS 分类, p.name AS 商品, p.price AS 价格
FROM product p JOIN category c ON c.category_id = p.category_id
WHERE p.price = (SELECT MAX(p2.price) FROM product p2 WHERE p2.category_id = p.category_id)
ORDER BY 价格 DESC;                       -- 结果与上面完全相同

-- 或者用"行构造器 + IN"（第 7 章的行子查询）
SELECT c.name AS 分类, p.name AS 商品, p.price AS 价格
FROM product p JOIN category c ON c.category_id = p.category_id
WHERE (p.category_id, p.price) IN (SELECT category_id, MAX(price) FROM product GROUP BY category_id)
ORDER BY 价格 DESC;                       -- 结果也完全相同
```

## 8.7 使用窗口函数的 6 个注意事项

1. **窗口函数不能写在 `WHERE` 里**（因为 `WHERE` 比窗口计算先执行）：
   ```sql
   -- ✗ 报错：You cannot use the window function 'row_number' in this context.
   SELECT *, ROW_NUMBER() OVER (ORDER BY price DESC) AS rn FROM product WHERE rn <= 3;
   -- ✅ 正确：套一层派生表或 CTE，在外层过滤
   SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY price DESC) AS rn FROM product) t WHERE rn <= 3;
   ```
2. 同样**不能**写在 `GROUP BY` / `HAVING` 里；可以写在 `SELECT` 和 `ORDER BY` 里。
3. **`PARTITION BY` ≠ `GROUP BY`**：前者不折叠行，后者折叠行。但两者可以同时出现在一条语句里（8.4 的占比例子就是）。
4. **没写 `ORDER BY` 的窗口**：`SUM() OVER ()` 是"全体求和"，`SUM() OVER (ORDER BY x)` 是"累计到当前行"——差别巨大。
5. **性能**：窗口函数需要对数据排序，大表上开销明显；`PARTITION BY` + `ORDER BY` 的列**最好有联合索引**。
6. **5.7 及以前没有窗口函数**，那里通常用"用户变量（`@变量`）"或自连接模拟，代码难读且容易出错——这也是升级 8.0 的最大理由之一。

**🖐 动手练习（第 8 章）**

1. 给每个客户的订单按时间编号，标出"第几单"。
2. 计算每个商品的销售额在**本分类**中的占比。
3. 找出每个月销售额最高的那一天（提示：先按月、日聚合，再用 `RANK()`）。
4. 用 `LAG` 算出每个学生每门课成绩与"他上一门课成绩"的差值（按课程号排序）。

---

# 9. 索引与执行计划 EXPLAIN

> 前面 8 章解决"**写对**"，这一章开始解决"**写快**"。
> 索引是数据库性能的第一杠杆：**没有索引，100 万行的表就是 100 万次磁盘查找；有索引，通常几次就够了。**

## 9.1 索引到底是什么？（用"书的目录"理解）

表里 100 万行数据无序堆在一起，要找一个 `name = '张三'`，只能一行一行翻——这叫**全表扫描**。
索引就是**把某一列（或几列）的值排好序，另外存一份"值 → 行位置"的对照表**，查找时先查对照表，直接跳到那一行。

InnoDB 的索引底层是 **B+ 树**（一种矮胖的多叉平衡树）：

- **矮**：1000 万行数据，树高通常只有 3～4 层 → 最多 3～4 次磁盘 I/O 就能定位。
- **胖**：一个节点存几百个键值，所以层数少。
- **叶子节点双向链表相连**：所以"范围查询"（`BETWEEN`、`>`、`ORDER BY`）也能高效顺序读取。

**两种索引要分清**：

| | 聚簇索引（Clustered Index） | 二级索引（Secondary Index / 辅助索引） |
| --- | --- | --- |
| 是什么 | **主键**对应的索引，叶子节点里存的是**整行数据** | 我们额外建的索引，叶子节点里存的是**索引列 + 主键值** |
| 一张表能有几个 | **只能有 1 个**（就是主键；没主键时 InnoDB 会选唯一非空列，再没有就内部造一个隐藏的） | 可以有很多个 |
| 查找方式 | 直接拿到整行 | **先查到主键值，再回聚簇索引取整行 → 这叫"回表"** |

```txt
二级索引查找 name='张三' 的过程：

  ① 在 idx_name 这棵 B+ 树上找到 '张三'  →  拿到主键 product_id = 37
  ② 拿着 37 再去主键（聚簇）索引上找到那一行，取出所有列   ← 这一步叫【回表】

  如果查询需要的列"索引里刚好都有"，就不用回表了  ← 这叫【覆盖索引】
```

## 9.2 建索引、看索引、删索引

```sql
-- 建索引（三种写法等价，选一种顺手的）
CREATE INDEX idx_product_name ON product (name);                 -- 建普通索引
ALTER TABLE product ADD INDEX idx_product_price (price);         -- 同上（建表后追加）
CREATE UNIQUE INDEX uk_product_name ON product (name);           -- 唯一索引（顺便约束数据不重复）
CREATE INDEX idx_p_name_price ON product (name, price);          -- 联合索引（两列一起）

-- 看某张表有哪些索引
SHOW INDEX FROM product;
SHOW INDEX FROM product\G      -- 竖排更好读（关注 Key_name、Seq_in_index、Column_name、Cardinality）

-- 看索引的"区分度"（Cardinality 越大越接近总行数，说明这一列越"独一无二"，越适合建索引）
SELECT INDEX_NAME, COLUMN_NAME, CARDINALITY, NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'shop' AND TABLE_NAME = 'product';

-- 删索引
ALTER TABLE product DROP INDEX idx_product_name;
DROP INDEX idx_product_price ON product;      -- 等价写法

-- 前缀索引：很长的字符串列只索引前 n 个字符，省空间（但不能再用于覆盖索引和 ORDER BY）
ALTER TABLE product ADD INDEX idx_name_prefix (name(5));
```

> **索引不是越多越好**：每个索引都要占磁盘、都要在每次 `INSERT`/`UPDATE`/`DELETE` 时同步维护。
> 经验值：**单表索引 5 个以内**，写多读少的表更要克制。

## 9.3 联合索引与"最左前缀"原则

对联合索引 `idx_abc (a, b, c)`，B+ 树是**先按 a 排序，a 相同再按 b 排，b 相同再按 c 排**（就像电话簿先按姓、再按名）。
所以**想用上索引，就必须从最左边的列开始连续使用**：

| 查询条件 | 能用上索引吗 | 说明 |
| --- | --- | --- |
| `WHERE a = 1` | ✅ 用 a | 用最左列 |
| `WHERE a = 1 AND b = 2` | ✅ 用 a、b | 连续前缀 |
| `WHERE a = 1 AND b = 2 AND c = 3` | ✅ 用 a、b、c | 全用上，最高效 |
| `WHERE b = 2` | ❌ 用不上 | 跳过了最左列 a |
| `WHERE b = 2 AND c = 3` | ❌ 用不上 | 同上 |
| `WHERE a = 1 AND c = 3` | ⚠️ 只用到 a | c 不能用于定位（但可能被"索引条件下推 ICP"用来过滤，仍比全表扫好） |
| `WHERE a = 1 AND b > 2 AND c = 3` | ⚠️ 用到 a、b | **范围查询后面的列失效**（b 用了范围，c 用不上） |
| `WHERE a = 1 ORDER BY b` | ✅ 用 a 且排序也走索引 | 排序与索引顺序一致，不会 `Using filesort` |

```sql
-- 实验：亲手验证最左前缀（用练习库 product 表）
ALTER TABLE product ADD INDEX idx_cat_price (category_id, price);

EXPLAIN SELECT * FROM product WHERE category_id = 1;                    -- 用上 idx_cat_price
EXPLAIN SELECT * FROM product WHERE category_id = 1 AND price > 3000;   -- 用上（range）
EXPLAIN SELECT * FROM product WHERE price > 3000;                       -- 用不上（跳过最左列）
```

> **设计联合索引的实用口诀**：
> 1. **等值条件在前，范围条件在后**（范围后面的列排不上用场）。
> 2. **区分度高的列尽量靠前**（能更快缩小范围）。
> 3. 把 `ORDER BY` / `GROUP BY` 的列**接在等值条件列后面**，可以顺带优化排序。
> 4. 一条联合索引 `(a,b)` 相当于同时拥有 `(a)` 索引，**所以不用再单独建 a 的索引**（能省一个索引）。

## 9.4 覆盖索引：不回表，快得飞起

```sql
-- 场景：只需要 category_id 和 price 两列，而索引 idx_cat_price 里正好有这两列 + 主键
EXPLAIN SELECT category_id, price FROM product WHERE category_id = 1;
-- Extra 里会出现：Using index   ← 这就是"覆盖索引"，不用回表，性能最好

-- 对比：查 SELECT * 时索引里没有其他列，必须回表
EXPLAIN SELECT * FROM product WHERE category_id = 1;
-- Extra 里没有 Using index

-- 实战优化技巧：把"经常一起查的几列"做成覆盖索引
-- 需求：列表页只需要显示 name 和 price，按 category_id 过滤
ALTER TABLE product ADD INDEX idx_cat_name_price (category_id, name, price);
SELECT category_id, name, price FROM product WHERE category_id = 1;   -- 全程走索引，零回表
```

## 9.5 EXPLAIN：看懂执行计划

`EXPLAIN` 是 SQL 调优的第一工具：**它不执行语句，只告诉你"MySQL 打算怎么执行"**。

```sql
-- 用法：在任意 SELECT/UPDATE/DELETE 前面加 EXPLAIN
EXPLAIN SELECT * FROM product WHERE category_id = 1;
EXPLAIN FORMAT=TREE SELECT * FROM product WHERE category_id = 1;   -- 【8.0.16+】树形输出，更直观
EXPLAIN ANALYZE SELECT * FROM product WHERE category_id = 1;       -- 【8.0.18+】真跑一遍并给出实际耗时
```

输出列的含义（**重点看 type、key、rows、Extra 这 4 列**）：

| 列 | 含义 | 怎么读 |
| --- | --- | --- |
| `id` | 查询序号 | 越大越先执行；相同则从上往下执行 |
| `select_type` | 查询类型 | `SIMPLE` 简单查询；`PRIMARY` 最外层；`SUBQUERY` 子查询；`DERIVED` 派生表；`UNION`；**`DEPENDENT SUBQUERY` 相关子查询（要留意性能）** |
| `table` | 正在访问的表/别名 | —— |
| `type` | **访问类型（最重要）** | 从好到坏：`system` > `const` > `eq_ref` > `ref` > `range` > `index` > `ALL`。**看到 `ALL` 就要警惕（全表扫描）** |
| `possible_keys` | 可能用到的索引 | 只是"候选" |
| `key` | **实际用到的索引** | **`NULL` 表示没走索引** |
| `key_len` | 索引用了多少字节 | 可反推"联合索引用了几列"（utf8mb4 下 VARCHAR(n) 是 4n+2 字节，可空再加 1） |
| `ref` | 与索引比较的是什么 | `const`（常量）、`库.表.列`（连接列） |
| `rows` | **预计扫描行数** | 越小越好；几十万就该优化了 |
| `filtered` | 过滤后剩余百分比 | 越小说明过滤条件效果越好 |
| `Extra` | 附加信息 | 见下表，**这是调优的重点** |

`type` 各值的含义：

| type | 含义 | 好到什么程度 |
| --- | --- | --- |
| `const` | 通过主键/唯一索引查到**最多一行** | 最快 |
| `eq_ref` | 连接时被驱动表用主键/唯一索引匹配（一对一的连接） | 很快 |
| `ref` | 普通索引等值查找（可能多行） | 快，常见良好状态 |
| `range` | 索引范围扫描（`BETWEEN`、`>`、`IN`、`LIKE 'x%'`） | 可以接受 |
| `index` | 扫描整棵索引树（比 ALL 好一点，因为索引比整行小） | 偏差 |
| `ALL` | **全表扫描** | 最差，大表上必须优化 |

`Extra` 里的常见关键字：

| Extra | 含义 | 是否要处理 |
| --- | --- | --- |
| `Using index` | **覆盖索引**，不回表 | 👍 很好 |
| `Using where` | 拿到行后还要用 WHERE 过滤 | 正常 |
| `Using filesort` | **需要额外排序**（没走上索引顺序） | ⚠️ 大结果集要优化（让 ORDER BY 用上索引） |
| `Using temporary` | **用到了临时表**（常见于 GROUP BY / DISTINCT / UNION 无法用索引） | ⚠️ 大结果集要优化 |
| `Using index condition` | 索引条件下推（ICP），在存储引擎层先过滤 | 👍 好事 |
| `Using join buffer` | 连接时没用上被驱动表的索引，用了内存缓冲 | ⚠️ 给连接列加索引 |
| `Impossible WHERE` | WHERE 恒假，直接返回空 | 说明条件写错了 |
| `Select tables optimized away` | 优化器直接用索引算出结果（如 `MIN/MAX` 走索引） | 👍 很好 |

### 在小表上做实验的注意事项（很重要）

练习库的表只有 12 行、15 行——**这种规模下，优化器经常认为"全表扫描比走索引还快"，于是 `EXPLAIN` 显示 `type=ALL`。
这不是你的写法错了，而是数据太少。** 想看到真实的索引效果，请先造一张大表：

```sql
-- 造一张 10 万行的测试表（存储过程批量插入，8.0/5.7 都能跑）
DROP TABLE IF EXISTS big_user;
CREATE TABLE big_user (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,   -- 主键 = 聚簇索引
    name       VARCHAR(50)  NOT NULL,                     -- 先不建索引
    age        TINYINT      NOT NULL,
    city       VARCHAR(20)  NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_created (created_at)                          -- 只给时间列建索引
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='索引实验用大表';

DELIMITER $$                                  -- DELIMITER 告诉客户端：遇到 $$ 才算语句结束
CREATE PROCEDURE gen_big_user(IN total INT)   -- 参数：要造多少行
BEGIN
    DECLARE i INT DEFAULT 1;                  -- 局部变量
    SET autocommit = 0;                       -- ★ 关掉自动提交：10 万次提交会非常慢，最后统一提交
    WHILE i <= total DO
        INSERT INTO big_user (name, age, city)
        VALUES (
            CONCAT('用户', i),                -- 用户名：用户1、用户2……
            18 + (i % 50),                    -- 年龄：18~67 循环
            ELT(1 + (i % 5), '北京','上海','广州','深圳','杭州')   -- ELT 返回第 n 个字符串
        );
        SET i = i + 1;
    END WHILE;
    COMMIT;                                   -- 一次性提交
    SET autocommit = 1;                       -- 恢复自动提交
END$$
DELIMITER ;                                   -- 恢复分号作为语句结束符

CALL gen_big_user(100000);                    -- 造 10 万行（大约几秒到几十秒）
SELECT COUNT(*) FROM big_user;                -- 100000
```

```sql
-- ========== 实验 1：没有索引的列 ==========
EXPLAIN SELECT * FROM big_user WHERE name = '用户50000';
-- type: ALL   key: NULL   rows: 约 100000   Extra: Using where
-- 解读：全表扫描 10 万行才找到 1 行，非常慢

-- 加索引后再看
ALTER TABLE big_user ADD INDEX idx_name (name);
EXPLAIN SELECT * FROM big_user WHERE name = '用户50000';
-- type: ref   key: idx_name   rows: 1   ← 从 10 万行降到 1 行，这就是索引的威力

-- ========== 实验 2：联合索引与最左前缀 ==========
ALTER TABLE big_user ADD INDEX idx_city_age (city, age);

EXPLAIN SELECT * FROM big_user WHERE city = '北京' AND age = 30;
-- type: ref   key: idx_city_age   key_len: 62 左右（用到了 city + age 两列）

EXPLAIN SELECT * FROM big_user WHERE city = '北京';
-- type: ref   key: idx_city_age   key_len: 只用了 city 那一列

EXPLAIN SELECT * FROM big_user WHERE age = 30;
-- type: ALL   key: NULL          ← ★ 跳过最左列 city，索引用不上！这就是最左前缀原则

-- ========== 实验 3：覆盖索引 vs 回表 ==========
EXPLAIN SELECT city, age FROM big_user WHERE city = '北京';
-- Extra: Using index   ← 覆盖索引，不用回表

EXPLAIN SELECT * FROM big_user WHERE city = '北京';
-- Extra: 没有 Using index   ← 需要回表取 name、created_at 等列

-- ========== 实验 4：范围查询后面的列会失效 ==========
EXPLAIN SELECT * FROM big_user WHERE city = '北京' AND age > 30;
-- type: range，key 仍然是 idx_city_age（city 等值 + age 范围，age 还能用于范围定位）
EXPLAIN SELECT * FROM big_user WHERE city = '北京' AND age > 30 AND name = '用户1';
-- name 上虽然有独立索引，但这里通常只会选一个索引用（除非走 index merge）
```

## 9.6 索引失效的 8 种常见情况

```sql
-- ① 在索引列上做运算 / 用函数（最常见！）
SELECT * FROM big_user WHERE age + 1 = 31;                 -- ✗ 索引失效
SELECT * FROM big_user WHERE age = 31 - 1;                 -- ✅ 把运算挪到常量那边
SELECT * FROM orders WHERE YEAR(order_time) = 2024;        -- ✗ 索引失效
SELECT * FROM orders WHERE order_time >= '2024-01-01'      -- ✅ 改成范围查询
                     AND order_time <  '2025-01-01';

-- ② 隐式类型转换（字符串列传数字，或反之）
--    order_no 是 VARCHAR(32)，下面这种"用数字查字符串列"会让索引失效
SELECT * FROM orders WHERE order_no = 202401050001;        -- ✗ 列被转成数字比较，索引失效
SELECT * FROM orders WHERE order_no = 'SO202401050001';    -- ✅ 加引号
--    反过来：INT 列用字符串查，MySQL 会把常量转成 INT，索引仍然可用
SELECT * FROM product WHERE product_id = '1';              -- ✅ 能用索引（但别养成习惯）

-- ③ LIKE 以 % 开头
SELECT * FROM big_user WHERE name LIKE '%用户5%';          -- ✗ 全表扫描
SELECT * FROM big_user WHERE name LIKE '用户5%';           -- ✅ 前缀确定，能用索引

-- ④ OR 两侧有一侧没索引
SELECT * FROM big_user WHERE name = '用户1' OR age = 30;   -- ✗ 若 age 无索引，整体可能全表扫
-- 解决：给 age 也建索引，或改写成 UNION ALL

-- ⑤ 使用 != / <> / NOT IN / NOT LIKE（优化器可能认为"不如全表扫"）
SELECT * FROM big_user WHERE city <> '北京';               -- ✗ 通常全表扫描
SELECT * FROM big_user WHERE city NOT IN ('北京','上海');   -- ✗ 同上

-- ⑥ 联合索引不满足最左前缀（见 9.3）

-- ⑦ 连接时两表字符集/排序规则不一致（比如一个 utf8mb4、一个 utf8），连接列索引会失效
--   解决：统一字符集；或用 CONVERT 显式转换（但转换后仍可能失效，最好统一）

-- ⑧ 数据量太小 / 区分度太低
--  优化器估算"走索引还不如直接全表扫"时就会放弃索引。
--  比如 status 只有 '在售'/'下架' 两种值，用它查"在售"会命中大部分行 → 全表扫更划算。
--  这类列不适合单独建索引（可作为联合索引的一部分）。
```

## 9.7 索引设计清单（写在便签上）

1. **主键必建**，且用自增 `INT/BIGINT`（随机主键如 UUID 会导致页分裂、插入变慢）。
2. **外键列建议建索引**（JOIN 的驱动列，`order_item.order_id` 这类）。
3. **WHERE / JOIN ON / ORDER BY / GROUP BY 用到的列**是索引候选。
4. **联合索引：等值在前、范围在后、区分度高的在前**。
5. **能用覆盖索引解决的查询，就别 `SELECT *`**。
6. **写多读少的列、区分度极低的列、超大文本列慎建索引**（`TEXT` 要建就建前缀索引）。
7. **索引要定期体检**：用 `information_schema.STATISTICS` 找"从没被用过"的冗余索引。
8. **加索引前先在测试库验证**：`EXPLAIN` 对比加索引前后，别在大表业务高峰期直接加（会占用 IO，8.0 加索引虽支持 Online DDL，但仍建议低峰执行）。

---

# 10. 事务与锁

## 10.1 从一个"转账"说起

张三给李四转 100 元，数据库里要做两件事：

```sql
UPDATE account SET balance = balance - 100 WHERE name = '张三';   -- ① 张三扣 100
UPDATE account SET balance = balance + 100 WHERE name = '李四';   -- ② 李四加 100
```

如果 ①执行完、服务器突然断电了，②没执行 → **100 元凭空消失**。
事务就是用来解决这个问题的：**把多条语句打包成一个"要么全成功、要么全失败"的原子操作**。

```sql
-- 事务的标准用法：BEGIN → 若干语句 → COMMIT（或 ROLLBACK）
START TRANSACTION;                                       -- ① 开启事务（BEGIN 是同义词）
UPDATE account SET balance = balance - 100 WHERE name = '张三';
UPDATE account SET balance = balance + 100 WHERE name = '李四';
COMMIT;                                                  -- ② 提交：两条同时生效
-- 如果中途发现不对，用 ROLLBACK; 撤销整个事务，数据回到 BEGIN 之前的状态
```

## 10.2 ACID：事务的四个特性

| 特性 | 含义 | 靠什么实现 |
| --- | --- | --- |
| **A** 原子性 Atomicity | 事务里的操作要么全做，要么全不做 | undo log（回滚日志） |
| **C** 一致性 Consistency | 事务前后数据都满足业务规则（如"总金额不变"） | 由 A、I、D 共同保证 |
| **I** 隔离性 Isolation | 并发事务之间互不干扰 | 锁 + MVCC |
| **D** 持久性 Durability | 提交后的数据不会丢（即使断电） | redo log（重做日志） |

> 顺带理解 MySQL 的日志分工（面试高频）：
> **undo log** 负责"回滚"和 MVCC 快照，**redo log** 负责"崩溃恢复"（先写日志再刷数据，即 WAL），
> **binlog** 是 MySQL Server 层的归档日志，用于**主从复制和数据恢复**。

## 10.3 事务控制语句全解（含完整实验）

```sql
-- ========== 基础四件套 ==========
START TRANSACTION;         -- 或 BEGIN;  开启事务
COMMIT;                    -- 提交：永久生效
ROLLBACK;                  -- 回滚：撤销本事务所有修改
SAVEPOINT sp1;             -- 设置保存点（事务内的"存档"）
ROLLBACK TO sp1;           -- 回滚到保存点（保存点之后的修改撤销，之前的保留）
RELEASE SAVEPOINT sp1;     -- 删除保存点

-- ========== 自动提交开关 ==========
SELECT @@autocommit;       -- 默认 1：每条语句自动提交（= 每条语句自己就是一个事务）
SET autocommit = 0;        -- 关掉：之后的所有语句都在同一个事务里，直到你手动 COMMIT/ROLLBACK
SET autocommit = 1;        -- 记得改回来！否则容易忘提交导致锁一直不放
```

**实验：完整走一遍（在练习库上做）**

```sql
USE shop;
SELECT product_id, name, stock FROM product WHERE product_id = 1;   -- 记下当前库存：120

-- ① 开启事务并改数据
START TRANSACTION;
UPDATE product SET stock = stock - 5 WHERE product_id = 1;
SELECT stock FROM product WHERE product_id = 1;   -- 本连接里看到 115（改了）

-- ② 打个保存点，再改一次
SAVEPOINT sp1;
UPDATE product SET stock = stock - 5 WHERE product_id = 1;
SELECT stock FROM product WHERE product_id = 1;   -- 110

-- ③ 后悔第二次修改，回滚到保存点
ROLLBACK TO sp1;
SELECT stock FROM product WHERE product_id = 1;   -- 回到 115（第一次修改还在）

-- ④ 全部不要了
ROLLBACK;
SELECT stock FROM product WHERE product_id = 1;   -- 回到 120（原始值）
```

```sql
-- 对比：COMMIT 之后就回不去了
START TRANSACTION;
UPDATE product SET stock = 200 WHERE product_id = 1;
COMMIT;                       -- 写死在磁盘上了
ROLLBACK;                     -- 这句对已经提交的事务无效！
SELECT stock FROM product WHERE product_id = 1;   -- 仍然是 200
-- 恢复：UPDATE product SET stock = 120 WHERE product_id = 1;
```

**⚠️ 会"偷偷提交"事务的语句（隐式提交）**：执行 DDL 时会自动提交当前事务！

```sql
START TRANSACTION;
UPDATE product SET stock = 999 WHERE product_id = 1;
ALTER TABLE product ADD COLUMN tmp_col INT;   -- ★ 这句会隐式 COMMIT 前面的事务！
ROLLBACK;                                     -- 已经没用，stock 的修改被提交了
```

> 隐式提交的常见语句：`CREATE`/`ALTER`/`DROP`/`TRUNCATE`、`GRANT`/`REVOKE`、`LOCK TABLES`、
> `START TRANSACTION`（会先提交上一个事务）等。**所以"事务里别混 DDL"是一个硬规矩。**

## 10.4 隔离级别：并发会带来什么问题？

多个事务同时跑，会出现三类"脏现象"：

| 现象 | 一句话解释 | 例子 |
| --- | --- | --- |
| **脏读** Dirty Read | 读到了别人**还没提交**的数据 | A 改了余额没提交，B 读到了新值，然后 A 回滚了 → B 读的是"从未存在过"的数据 |
| **不可重复读** Non-Repeatable Read | 同一事务内**两次读同一行结果不同**（别人改了并提交） | A 第一次读余额 100，B 改成 200 提交，A 再读变成 200 |
| **幻读** Phantom Read | 同一事务内**两次查同一范围，行数变了**（别人插入/删除了行） | A 查"年龄>30 的用户"有 10 行，B 插入 1 行提交，A 再查变成 11 行 |

四个隔离级别（**越高越安全但并发越差**）：

| 隔离级别 | 脏读 | 不可重复读 | 幻读 | 说明 |
| --- | --- | --- | --- | --- |
| `READ UNCOMMITTED`（读未提交） | ❌ 可能 | ❌ 可能 | ❌ 可能 | 几乎不用 |
| `READ COMMITTED`（读已提交） | ✅ 不会 | ❌ 可能 | ❌ 可能 | Oracle/PostgreSQL 默认；互联网业务常用 |
| `REPEATABLE READ`（可重复读） | ✅ | ✅ | ✅ 基本不会* | **MySQL 默认级别**（InnoDB 靠 MVCC + 间隙锁） |
| `SERIALIZABLE`（串行化） | ✅ | ✅ | ✅ | 全部加锁，并发性能最差 |

> \* InnoDB 的 RR 下：**快照读**（普通 SELECT）靠 MVCC 保证不出现幻读；
> **当前读**（`SELECT ... FOR UPDATE`、`UPDATE`、`DELETE`）靠**间隙锁（gap lock）**阻止其他事务在范围内插入，
> 所以在 InnoDB 的 RR 下幻读基本被消除。

```sql
-- 查看当前隔离级别
SELECT @@transaction_isolation;      -- 8.0（5.7 请用 SELECT @@tx_isolation;）
-- 默认：REPEATABLE-READ

-- 设置隔离级别（SESSION 只影响当前连接，GLOBAL 影响之后的新连接；都已存在的事务不受影响）
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET GLOBAL  TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- 也可以在开启事务时指定"只对这个事务生效"
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;
```

### 亲手验证"不可重复读"（需要开两个客户端窗口）

```txt
=========== 窗口 A ================================  =========== 窗口 B ===========
-- 先确认隔离级别是默认的 RR
SELECT @@transaction_isolation;

-- 把隔离级别调成 READ COMMITTED，方便观察
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;

START TRANSACTION;
SELECT stock FROM product WHERE product_id = 1;      -- 读到 120
                                                     -- 窗口 B 执行：
                                                     --   UPDATE product SET stock = 500 WHERE product_id = 1;
                                                     --   （B 没提交时，A 读到的是旧值 120 → 没有脏读）
                                                     --   COMMIT;
SELECT stock FROM product WHERE product_id = 1;      -- ★ 读到 500 —— 同一事务内两次不一致 = 不可重复读
COMMIT;
```

```txt
-- 把窗口 A 的隔离级别换成 REPEATABLE READ 再试一次：
-- 第二次 SELECT 仍然是 120 —— 因为 RR 下整个事务用的是"开启事务那一刻的快照"
-- 这就是"可重复读"字面上的意思。
-- 想拿到最新已提交数据，可以在 RR 下用"当前读"：SELECT ... FOR UPDATE / FOR SHARE
```

## 10.5 锁：InnoDB 的行级锁

**两个维度组合出四种锁**：

| | 共享锁 S（读锁） | 排他锁 X（写锁） |
| --- | --- | --- |
| S 锁 | ✅ 兼容（多人可同时读） | ❌ 冲突 |
| X 锁 | ❌ 冲突 | ❌ 冲突 |

加锁方式：

```sql
-- 共享锁（S）：别的事务可以读，但不能改
SELECT * FROM product WHERE product_id = 1 FOR SHARE;             -- 8.0 写法（推荐）
SELECT * FROM product WHERE product_id = 1 LOCK IN SHARE MODE;    -- 5.7 老写法（8.0 仍兼容）

-- 排他锁（X）：别的事务既不能读（当前读）也不能改
SELECT * FROM product WHERE product_id = 1 FOR UPDATE;

-- 8.0 新增的两个实用选项
SELECT * FROM product WHERE product_id = 1 FOR UPDATE NOWAIT;            -- 拿不到锁立刻报错，不等待
SELECT * FROM product WHERE product_id = 1 FOR UPDATE SKIP LOCKED;       -- 跳过被锁的行（做任务队列很好用）

-- UPDATE / DELETE 会自动加 X 锁，不需要你手写 FOR UPDATE
UPDATE product SET stock = stock - 1 WHERE product_id = 1;
```

**锁实验 1：行锁相互阻塞**

```txt
=========== 窗口 A =================================  =========== 窗口 B ===========
START TRANSACTION;
UPDATE product SET stock = stock - 1
  WHERE product_id = 1;        -- 拿到 id=1 这一行的 X 锁
                                                      START TRANSACTION;
                                                      UPDATE product SET stock = stock - 1
                                                        WHERE product_id = 1;   -- ⏳ 卡住！等待锁
                                                      -- （默认等待 50 秒后报 1205 Lock wait timeout exceeded）
COMMIT;                        -- 释放锁
                                                      -- 立刻执行成功，返回 Query OK
```

```sql
-- 查看谁在等锁、谁持有锁（排查线上问题时必用）
SHOW ENGINE INNODB STATUS\G          -- 看 TRANSACTIONS 段落
SELECT * FROM performance_schema.data_locks\G          -- 8.0：当前锁信息
SELECT * FROM performance_schema.data_lock_waits\G     -- 8.0：谁在等谁
SELECT * FROM information_schema.innodb_trx\G          -- 当前运行的事务（看 trx_started 判断长事务）
SELECT @@innodb_lock_wait_timeout;                     -- 锁等待超时秒数，默认 50
SHOW PROCESSLIST;                                      -- 看有没有长时间 Sleep/Query 的连接
```

**锁实验 2（重点）：更新"没有索引的列"会锁住整张表**

```txt
=========== 窗口 A =================================  =========== 窗口 B ===========
START TRANSACTION;
-- product.name 上没有索引 → 只能全表扫描 → 扫到的每一行都被加上 X 锁
UPDATE product SET status = '在售' WHERE name = '不存在的商品';
                                                      START TRANSACTION;
                                                      UPDATE product SET stock = 1
                                                        WHERE product_id = 2;   -- ⏳ 也卡住了！
                                                      -- 明明改的是另一行，却被锁住了
COMMIT;   -- A 提交后 B 才能继续
```

> **这是生产事故的经典成因**：`UPDATE ... WHERE 无索引列` 会把整表（或大量行）锁住，
> 其他业务全被堵住，连接数暴涨，最后整个服务雪崩。
> **结论：UPDATE / DELETE 的 WHERE 条件列一定要有索引。**
> 另一个推论：**一定要把 WHERE 写全**，别让 UPDATE 变成"全表锁 + 全表改"。

**间隙锁（Gap Lock）**：RR 级别下，为了防止别人在"范围中间"插入新行（幻读），
InnoDB 会给范围加上间隙锁。例如 `SELECT * FROM orders WHERE order_id BETWEEN 5 AND 10 FOR UPDATE;`
不仅锁住 5~10 这些行，还锁住它们之间的"空隙"，别的会话往这个区间 `INSERT` 会被阻塞。
**RC 隔离级别下间隙锁基本不生效**，所以很多互联网业务把隔离级别改成 RC 来提升并发。

## 10.6 死锁：互相等对方手里的锁

```txt
=========== 窗口 A =================================  =========== 窗口 B ===========
START TRANSACTION;
UPDATE product SET stock = stock - 1
  WHERE product_id = 1;        -- A 持有 id=1 的锁
                                                      START TRANSACTION;
                                                      UPDATE product SET stock = stock - 1
                                                        WHERE product_id = 2;   -- B 持有 id=2 的锁

UPDATE product SET stock = stock - 1
  WHERE product_id = 2;        -- ⏳ A 等 B 释放 id=2
                                                      UPDATE product SET stock = stock - 1
                                                        WHERE product_id = 1;   -- ⏳ B 等 A 释放 id=1
-- 双方互等 → InnoDB 检测到死锁，主动回滚"代价小"的那个事务，报错：
-- ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction
-- 被回滚的一方重试整个事务即可；另一方正常提交
```

```sql
-- 排查死锁：看最近一次死锁的详细信息（谁持有什么锁、在等什么锁、执行了什么 SQL）
SHOW ENGINE INNODB STATUS\G
-- 输出里找这一段：
-- ------------------------
-- LATEST DETECTED DEADLOCK
-- ------------------------
```

**降低死锁概率的 5 条经验**（都很实用）：

1. **让所有事务按同样的顺序访问数据**（比如都"先扣库存、再改订单"，而不是各自反过来）。
2. **事务尽量短**：不要在处理事务的过程中调外部接口、等用户输入。
3. **一次锁定所需的所有行**：能用一条 `UPDATE ... WHERE id IN (...)` 就别拆成多条。
4. **给 WHERE 条件列建索引**，避免"顺带锁一大堆行"。
5. **业务上允许时，捕获 1213 错误后自动重试**（但要限制重试次数，避免雪崩）。

## 10.7 事务使用 checklist

- ✅ `START TRANSACTION` 之后**一定要有 `COMMIT` 或 `ROLLBACK`**（程序里用 try/finally 保证）。
- ✅ 事务里**只放必要的 SQL**，网络请求、文件读写、循环里的日志打印都挪出去。
- ✅ **关掉自动提交的实验做完记得 `SET autocommit = 1;`**，否则锁会一直不释放。
- ✅ 大批量操作**分批提交**（比如每 1000 行一个事务），避免产生巨大的 undo 和长时间持锁。
- ✅ 生产环境**不要用 `SELECT ... FOR UPDATE` 做长时间的"读-改-写"**，除非确实需要悲观锁；
  大多数场景可以用乐观锁替代（`UPDATE ... WHERE id = ? AND version = ?`）。
- ✅ 监控长事务：`SELECT trx_id, trx_started, TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS 已运行秒数,
  trx_mysql_thread_id, trx_query FROM information_schema.innodb_trx ORDER BY trx_started;`

---

# 11. 视图 / 存储过程 / 函数 / 触发器 / 事件

> 这一章是"数据库里的代码"：把逻辑写进数据库，而不只是写 SQL 语句。
> 初学时**先把这章当字典看**，知道有这些东西、能看懂别人写的即可；真正用好它们需要项目经验。

## 11.1 视图 VIEW：给复杂查询起个名字

**视图 = 一条被保存下来的 SELECT，用起来像一张"虚拟表"**（它不存数据，每次查都实时执行那条 SELECT）。

```sql
-- 场景：报表用的"客户消费汇总"查询很长，每次都要重写 → 做成视图
CREATE OR REPLACE VIEW v_customer_amount AS      -- OR REPLACE：已存在就替换（很实用）
SELECT
    c.customer_id                                        AS 客户ID,
    c.name                                               AS 客户,
    c.city                                               AS 城市,
    c.level                                              AS 会员等级,
    COUNT(o.order_id)                                    AS 订单数,
    IFNULL(ROUND(SUM(o.total_amount), 2), 0)             AS 消费总额
FROM customer c
LEFT JOIN orders o
       ON o.customer_id = c.customer_id
      AND o.status <> '已取消'                        -- 只算有效订单
GROUP BY c.customer_id, c.name, c.city, c.level;

-- 之后就能像查表一样查视图（视图里也可以再 WHERE / ORDER BY / JOIN）
SELECT * FROM v_customer_amount WHERE 消费总额 > 3000 ORDER BY 消费总额 DESC;

-- 视图经常用来做"分级权限"：让业务账号只能看到脱敏后的数据
CREATE OR REPLACE VIEW v_customer_safe AS
SELECT customer_id, name,
       CONCAT(LEFT(phone, 3), '****', RIGHT(phone, 4)) AS 脱敏手机号,   -- 手机号打码
       city, level
FROM customer;
SELECT * FROM v_customer_safe LIMIT 3;
```

```sql
-- 查看与管理视图
SHOW FULL TABLES WHERE Table_type = 'VIEW';   -- 列出所有视图
SHOW CREATE VIEW v_customer_amount\G          -- 看视图的定义语句
ALTER VIEW v_customer_amount AS SELECT ...;   -- 修改视图定义
RENAME TABLE v_customer_amount TO v_cust_amt; -- 重命名
DROP VIEW IF EXISTS v_customer_amount;        -- 删除视图（不会影响基表数据）
```

**视图能更新吗？** 简单视图（不含聚合、`DISTINCT`、`GROUP BY`、`UNION`、子查询等）**可以** `INSERT`/`UPDATE`/`DELETE`，
改动会落到基表上。但**含聚合/分组/连接的复杂视图通常不可更新**，会报 1288。

```sql
-- 可更新视图 + WITH CHECK OPTION：保证"通过视图插入/修改的数据，之后还能被这个视图查到"
CREATE OR REPLACE VIEW v_product_onsale AS
SELECT product_id, name, price, stock, status
FROM product
WHERE status = '在售'
WITH CHECK OPTION;          -- 通过视图插入 status='下架' 的数据会被拒绝

INSERT INTO v_product_onsale (name, price, stock, status) VALUES ('测试商品', 9.9, 1, '下架');
-- 报错 1369：CHECK OPTION failed —— 这正是我们想要的效果
```

**视图的优缺点**：

| 优点 | 缺点 |
| --- | --- |
| 简化复杂查询，一处定义到处用 | 只存定义不存数据，**每次查询都要重新执行**（性能不一定变好） |
| 隐藏敏感列，实现列级权限控制 | 嵌套视图会让执行计划难以优化 |
| 基表结构变了，只要改视图定义，上层代码不用动 | 视图里改数据可能让人困惑（不知道数据最终去哪张表） |

## 11.2 存储过程 PROCEDURE：把一段 SQL 脚本存进数据库

**存储过程 = 一组预编译好的 SQL 语句，起个名字存进数据库，需要时 `CALL` 一下。**

```sql
-- 语法骨架
-- DELIMITER $$                       ← 先把语句结束符临时改成 $$（否则过程中间的分号会提前结束语句）
-- CREATE PROCEDURE 名字([IN|OUT|INOUT 参数 类型, ...])
-- BEGIN
--     ...过程体：变量声明、流程控制、SQL 语句...
-- END$$
-- DELIMITER ;                        ← 记得改回分号

DELIMITER $$
CREATE PROCEDURE sp_customer_report(
    IN  p_customer_id INT,             -- IN：输入参数（默认）
    IN  p_start       DATE,            -- 统计起始日期
    IN  p_end         DATE,            -- 统计结束日期
    OUT p_order_count INT,             -- OUT：输出参数（把结果带回去）
    OUT p_total       DECIMAL(12,2)    -- OUT：输出参数
)
BEGIN
    DECLARE v_name VARCHAR(50);        -- 局部变量必须声明在过程体最前面

    -- 异常处理器：出任何 SQL 错误就回滚，并给出提示
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SELECT '执行出错，已回滚' AS 提示;
    END;

    -- SELECT ... INTO 变量：把查询结果赋给变量
    SELECT name INTO v_name FROM customer WHERE customer_id = p_customer_id;

    IF v_name IS NULL THEN             -- IF 语句
        SET p_order_count = 0;
        SET p_total = 0;
    ELSE
        SELECT COUNT(*), IFNULL(SUM(total_amount), 0)
          INTO p_order_count, p_total
        FROM orders
        WHERE customer_id = p_customer_id
          AND order_time >= p_start
          AND order_time <  DATE_ADD(p_end, INTERVAL 1 DAY);   -- 含结束当天
    END IF;
END$$
DELIMITER ;

-- 调用：OUT 参数要用"用户变量"（@开头）接收
CALL sp_customer_report(1, '2024-01-01', '2024-12-31', @cnt, @total);
SELECT @cnt AS 订单数, @total AS 消费总额;      -- 3 | 12095.00
```

```sql
-- 查看/删除存储过程
SHOW PROCEDURE STATUS WHERE Db = 'shop';                       -- 列表
SHOW CREATE PROCEDURE sp_customer_report\G                      -- 查看源码
SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = 'shop';
DROP PROCEDURE IF EXISTS sp_customer_report;
```

**过程体里能用的流程控制**（写起来很像编程语言）：

```sql
DELIMITER $$
CREATE PROCEDURE sp_demo_flow(IN p_n INT)
BEGIN
    DECLARE i INT DEFAULT 1;                       -- 局部变量
    DECLARE v_sum INT DEFAULT 0;

    -- ① IF / ELSEIF / ELSE
    IF p_n > 100 THEN
        SELECT '大数' AS 类型;
    ELSEIF p_n > 10 THEN
        SELECT '中数' AS 类型;
    ELSE
        SELECT '小数' AS 类型;
    END IF;

    -- ② WHILE 循环：算 1+2+...+p_n
    WHILE i <= p_n DO
        SET v_sum = v_sum + i;
        SET i = i + 1;
    END WHILE;
    SELECT v_sum AS 累加结果;

    -- ③ CASE 语句
    CASE p_n
        WHEN 0 THEN SELECT '零';
        WHEN 1 THEN SELECT '一';
        ELSE SELECT '其他';
    END CASE;
END$$
DELIMITER ;

CALL sp_demo_flow(100);      -- 类型=中数（100 不大于 100）、累加结果=5050
```

**游标（CURSOR）：在过程里"一行一行"处理数据**

```sql
DELIMITER $$
CREATE PROCEDURE sp_cursor_demo()
BEGIN
    DECLARE done INT DEFAULT 0;                        -- 循环结束标志
    DECLARE v_name VARCHAR(100);
    -- ① 声明游标：它绑定一条 SELECT
    DECLARE cur CURSOR FOR SELECT name FROM product ORDER BY product_id;
    -- ② 声明"没数据了就置标志位"的处理器（NOT FOUND 在游标取完时触发）
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_names (name VARCHAR(100));  -- 临时表（会话结束自动消失）

    OPEN cur;                                          -- ③ 打开游标
    read_loop: LOOP                                    -- ④ 给循环起个标签，方便 LEAVE
        FETCH cur INTO v_name;                         -- ⑤ 取一行到变量
        IF done = 1 THEN LEAVE read_loop; END IF;      -- ⑥ 取完就跳出
        INSERT INTO tmp_names VALUES (v_name);         --    处理这一行
    END LOOP;
    CLOSE cur;                                         -- ⑦ 关闭游标

    SELECT * FROM tmp_names;
    DROP TEMPORARY TABLE tmp_names;
END$$
DELIMITER ;

CALL sp_cursor_demo();
```

> **游标要慎用**：它是"逐行处理"，和 SQL 擅长的"集合处理"背道而驰。
> 能用一条 `UPDATE ... JOIN ...` 解决的，就不要用游标循环。

**存储过程该不该用？**

| 适合 | 不适合 |
| --- | --- |
| 批量数据清洗、一次性数据修复脚本 | 业务逻辑（放应用层更好维护、更好做版本管理） |
| 定时任务的主体逻辑（配合 EVENT） | 复杂的`if/else` 业务流程（SQL 调试体验差） |
| 需要减少网络往返的批量操作 | 团队没有 DBA、没人会写存储过程的场景 |

## 11.3 存储函数 FUNCTION：能在 SQL 里直接调用的"自定义函数"

```sql
DELIMITER $$
CREATE FUNCTION fn_amount_level(p_total DECIMAL(12,2))
RETURNS VARCHAR(10)                     -- ① 必须先声明返回类型
DETERMINISTIC                           -- ② 声明"同样的输入必然得到同样的输出"（不写可能报 1418）
READS SQL DATA                          -- ③ 声明只读数据、不修改数据
BEGIN
    RETURN CASE                         -- ④ 函数体里用 RETURN 返回值
        WHEN p_total >= 10000 THEN '高价值'
        WHEN p_total >= 3000  THEN '中价值'
        ELSE '低价值'
    END;
END$$
DELIMITER ;

-- 用法：和内置函数一样，直接写在 SELECT / WHERE 里
SELECT name AS 客户, fn_amount_level(12095) AS 分档 FROM customer LIMIT 3;

-- 更实用的用法：作用在真实的聚合结果上
SELECT c.name AS 客户,
       ROUND(SUM(o.total_amount), 2) AS 消费总额,
       fn_amount_level(SUM(o.total_amount)) AS 价值分档
FROM customer c JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.name
ORDER BY 消费总额 DESC;

SHOW FUNCTION STATUS WHERE Db = 'shop';
DROP FUNCTION IF EXISTS fn_amount_level;
```

> ⚠️ **函数 vs 过程**：函数**必须返回一个值**、能在 SQL 里内联使用、**不能有 OUT 参数**；
> 过程可以有多个 OUT 参数、用 `CALL` 调用、不能出现在表达式里。
> 另外：函数在 `WHERE` 里包住索引列会导致**索引失效**，大表上要小心。
>
> 如果建函数时报 `ERROR 1418`，说明服务器开了 binlog 但你没声明 `DETERMINISTIC`/`NO SQL`/`READS SQL DATA`；
> 二选一：补上声明，或让管理员设置 `SET GLOBAL log_bin_trust_function_creators = 1;`。

## 11.4 触发器 TRIGGER：数据一变就自动做事

**触发器 = 绑定在表上的"自动执行程序"，在 INSERT / UPDATE / DELETE 的前后自动触发。**

```sql
-- 先建一张"订单状态变更日志表"
CREATE TABLE IF NOT EXISTS order_log (
    log_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id   BIGINT UNSIGNED NOT NULL              COMMENT '订单ID',
    action     VARCHAR(20)     NOT NULL              COMMENT '动作类型',
    old_status VARCHAR(20)     NULL                  COMMENT '原状态',
    new_status VARCHAR(20)     NULL                  COMMENT '新状态',
    log_time   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
    PRIMARY KEY (log_id),
    KEY idx_log_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单操作日志表';

DELIMITER $$
CREATE TRIGGER trg_orders_status_log
AFTER UPDATE ON orders                -- 时机：AFTER（也可 BEFORE）+ 事件：UPDATE
FOR EACH ROW                          -- 每一行都触发（行级触发器）
BEGIN
    -- OLD.列 = 修改前的值；NEW.列 = 修改后的值
    IF OLD.status <> NEW.status THEN  -- 只有状态真的变了才记日志
        INSERT INTO order_log (order_id, action, old_status, new_status)
        VALUES (NEW.order_id, 'STATUS_CHANGE', OLD.status, NEW.status);
    END IF;
END$$
DELIMITER ;

-- 试一试：把 10 号订单（待付款）改成已付款
UPDATE orders SET status = '已付款' WHERE order_id = 10;
SELECT * FROM order_log;              -- 自动多了一行记录，你没有手写这条 INSERT

-- 查看与删除触发器
SHOW TRIGGERS;                        -- 当前库所有触发器
SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING, EVENT_OBJECT_TABLE
FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = 'shop';
DROP TRIGGER IF EXISTS trg_orders_status_log;
```

**另一个真实场景：下单自动扣库存（BEFORE INSERT 校验 + AFTER INSERT 扣减）**

```sql
DELIMITER $$
-- AFTER INSERT：插入明细后自动扣库存，库存不足则报错阻止下单
CREATE TRIGGER trg_item_deduct_stock
AFTER INSERT ON order_item
FOR EACH ROW
BEGIN
    -- 先检查库存够不够（用 SIGNAL 主动抛错）
    IF (SELECT stock FROM product WHERE product_id = NEW.product_id) < NEW.quantity THEN
        SIGNAL SQLSTATE '45000'                                   -- 自定义错误码
            SET MESSAGE_TEXT = '库存不足，下单失败';                -- 错误提示
    END IF;
    UPDATE product SET stock = stock - NEW.quantity WHERE product_id = NEW.product_id;
END$$
DELIMITER ;
```

> ⚠️ **触发器的"三不要"**（血泪经验）：
> 1. **不要在触发器里写复杂业务逻辑**——出问题时极难排查（数据"莫名其妙"就变了）。
> 2. **不要写会递归触发自己的逻辑**（MySQL 禁止同表递归触发，会报 1442）。
> 3. **不要依赖触发器做数据一致性**——它只在"经过数据库的修改"时生效，批量导入、主从复制场景都可能绕过或重复触发。
>
> 触发器在**审计日志**、**自动维护统计字段**、**强制校验**这几个场景最合适。

## 11.5 事件 EVENT：数据库自带的"定时任务"【8.0 / 5.7 都支持】

```sql
-- ① 先确认事件调度器开着（默认是 OFF！）
SHOW VARIABLES LIKE 'event_scheduler';
SET GLOBAL event_scheduler = ON;          -- 需要 SUPER/SYSTEM_VARIABLES_ADMIN 权限；重启后失效
-- 想永久生效：在配置文件 my.cnf / my.ini 的 [mysqld] 段写 event_scheduler = ON

-- ② 创建事件：每天凌晨 3 点清理 30 天前的日志
CREATE EVENT IF NOT EXISTS ev_clean_order_log
ON SCHEDULE EVERY 1 DAY                        -- 频率：每天一次
STARTS '2024-07-01 03:00:00'                   -- 从什么时候开始
ON COMPLETION PRESERVE                         -- 事件执行完保留（不是执行一次就删）
COMMENT '清理历史订单日志'
DO
    DELETE FROM order_log WHERE log_time < DATE_SUB(NOW(), INTERVAL 30 DAY);

-- 其他调度写法
CREATE EVENT ev_once
ON SCHEDULE AT '2024-12-31 23:59:00'           -- 只在某个时刻执行一次
DO DELETE FROM order_log WHERE log_time < '2024-01-01';

-- ③ 管理事件
SHOW EVENTS;                                    -- 列表（含状态 ENABLED/DISABLED）
SHOW CREATE EVENT ev_clean_order_log\G
ALTER EVENT ev_clean_order_log DISABLE;         -- 停用
ALTER EVENT ev_clean_order_log ENABLE;          -- 启用
DROP EVENT IF EXISTS ev_clean_order_log;
```

> **注意**：事件只在**服务器运行期间**触发。如果你更习惯用 cron / 计划任务去执行 SQL 脚本文件，那也完全没问题，而且更可控。

---

# 12. 用户与权限管理

> 新手常年在本地用 root 直连，但在真实项目里：**应用连接数据库必须用单独的、权限最小的账号**。
> 原因很简单：万一应用被攻破，攻击者能拿到的只是"这个账号的那点权限"，而不是整个数据库。

## 12.1 先理解"用户 = 用户名 + 来源主机"

MySQL 的用户标识是 **`'用户名'@'来源主机'`** 两部分：

| 写法 | 含义 |
| --- | --- |
| `'app'@'localhost'` | 只能从**本机**连（走 socket 或 127.0.0.1） |
| `'app'@'127.0.0.1'` | 只能从本机 IPv4 连 |
| `'app'@'192.168.1.%'` | 允许 192.168.1 网段任意主机 |
| `'app'@'%'` | **任意主机**（生产环境慎用，容易被暴力破解） |

```sql
-- 查看现有用户（8.0 里 mysql.user 是只读视图，不能用 UPDATE 改）
SELECT user, host, plugin, account_locked FROM mysql.user;
SELECT CURRENT_USER() AS 我是谁, USER() AS 我用哪个账号连的;   -- CURRENT_USER 是"实际匹配到的账号"

-- 查看当前用户的权限
SHOW GRANTS;
SHOW GRANTS FOR 'app'@'%';
```

## 12.2 创建用户、改密码、删用户

```sql
-- ========== 创建用户 ==========
CREATE USER 'app_readonly'@'%' IDENTIFIED BY 'Str0ng#Pass2024';    -- 8.0 默认认证插件 caching_sha2_password
CREATE USER IF NOT EXISTS 'app_rw'@'192.168.1.%' IDENTIFIED BY 'An0ther#Pass2024';

-- 老客户端/老驱动（如 PHP 5.x、旧版 Navicat）连不上 8.0 时，可以改用旧插件（安全性略低）
CREATE USER 'legacy'@'%' IDENTIFIED WITH mysql_native_password BY 'Legacy#Pass2024';

-- 限制连接数、资源（可选）
CREATE USER 'limited'@'%' IDENTIFIED BY 'P@ssw0rd123'
    WITH MAX_CONNECTIONS_PER_HOUR 100 MAX_USER_CONNECTIONS 10;

-- ========== 改密码 ==========
ALTER USER 'app_rw'@'192.168.1.%' IDENTIFIED BY 'NewStr0ng#Pass2024';   -- 推荐（8.0）
SET PASSWORD FOR 'app_rw'@'192.168.1.%' = 'NewStr0ng#Pass2024';         -- 老写法（8.0 仍可用）
ALTER USER USER() IDENTIFIED BY 'MyOwn#NewPass';                        -- 改自己的密码

-- 让用户下次登录必须改密码
ALTER USER 'app_rw'@'192.168.1.%' PASSWORD EXPIRE;

-- ========== 锁定/解锁/删除 ==========
ALTER USER 'app_rw'@'192.168.1.%' ACCOUNT LOCK;      -- 临时锁定（保留账号和权限）
ALTER USER 'app_rw'@'192.168.1.%' ACCOUNT UNLOCK;
DROP USER IF EXISTS 'legacy'@'%';                    -- 删除用户（权限同时被回收）
```

## 12.3 授权与回收权限

**权限有 4 个层级**（从大到小）：全局 `*.*` → 库级 `库名.*` → 表级 `库名.表名` → 列级 `(列名)`。

```sql
-- ========== 授权 GRANT ==========
-- ① 只读账号：只能查 shop 库（最常见的报表/BI 账号）
GRANT SELECT ON shop.* TO 'app_readonly'@'%';

-- ② 读写账号：能增删改查，但不能改结构、不能删库
GRANT SELECT, INSERT, UPDATE, DELETE ON shop.* TO 'app_rw'@'192.168.1.%';

-- ③ 允许把权限再授给别人（WITH GRANT OPTION，慎用）
GRANT SELECT ON shop.* TO 'dba_helper'@'%' WITH GRANT OPTION;

-- ④ 全部权限（只给管理员，不要给应用账号）
GRANT ALL PRIVILEGES ON shop.* TO 'shop_admin'@'localhost';

-- ⑤ 列级权限：只能看客户的姓名和城市，手机号看不到
GRANT SELECT (customer_id, name, city) ON shop.customer TO 'app_readonly'@'%';

-- ⑥ 常用权限清单
--    SELECT, INSERT, UPDATE, DELETE        —— 数据增删改查
--    CREATE, ALTER, DROP, INDEX            —— 建表/改表/删表/建索引（DDL）
--    CREATE VIEW, SHOW VIEW                —— 视图
--    CREATE ROUTINE, EXECUTE, ALTER ROUTINE—— 存储过程/函数
--    TRIGGER, EVENT                        —— 触发器/事件
--    FILE                                  —— 读写服务器文件（LOAD DATA、INTO OUTFILE），很危险
--    PROCESS, SUPER, RELOAD, SHUTDOWN      —— 管理类，只给 DBA
--    GRANT OPTION                          —— 能授权给别人

-- ========== 回收权限 REVOKE ==========
REVOKE DELETE ON shop.* FROM 'app_rw'@'192.168.1.%';       -- 收回删除权限
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'dba_helper'@'%'; -- 收回全部

-- ========== 查看权限 ==========
SHOW GRANTS FOR 'app_readonly'@'%';
-- 输出类似：
-- GRANT USAGE ON *.* TO `app_readonly`@`%`                       ← USAGE = "能登录但没权限"
-- GRANT SELECT ON `shop`.* TO `app_readonly`@`%`

-- ========== 什么时候需要 FLUSH PRIVILEGES？ ==========
-- 用 GRANT/REVOKE/CREATE USER 改权限时，MySQL 会自动更新内存中的权限表，【不需要】flush。
-- 只有当你用 INSERT/UPDATE/DELETE 直接改了 mysql.user 等权限表时，才需要：
FLUSH PRIVILEGES;
```

## 12.4 角色 ROLE【8.0+】：把一组权限打包

```sql
-- 场景：有 5 个只读账号，每次都要写 5 条 GRANT → 用角色一次搞定
CREATE ROLE 'role_readonly';                                  -- 建角色
GRANT SELECT ON shop.* TO 'role_readonly';                    -- 给角色授权
GRANT 'role_readonly' TO 'app_readonly'@'%';                  -- 把角色授予用户
SET DEFAULT ROLE 'role_readonly' TO 'app_readonly'@'%';       -- 设置默认角色（登录即生效）

-- 用户也可以在会话里手动激活角色
SET ROLE 'role_readonly';
SELECT CURRENT_ROLE();

-- 管理角色
SHOW GRANTS FOR 'role_readonly';
DROP ROLE IF EXISTS 'role_readonly';
```

## 12.5 实战：一套标准的账号规划

```sql
-- ① 应用读写账号（给后端程序用，只连本机/内网）
CREATE USER 'shop_app'@'192.168.1.%' IDENTIFIED BY 'App#Pass2024!';
GRANT SELECT, INSERT, UPDATE, DELETE ON shop.* TO 'shop_app'@'192.168.1.%';

-- ② 报表/BI 只读账号（连视图，看不到敏感列）
CREATE USER 'shop_bi'@'%' IDENTIFIED BY 'Bi#Pass2024!';
GRANT SELECT ON shop.v_customer_amount TO 'shop_bi'@'%';       -- 只给视图权限
GRANT SHOW VIEW ON shop.* TO 'shop_bi'@'%';

-- ③ 备份账号（只需要读全库 + 锁表权限）
CREATE USER 'shop_backup'@'localhost' IDENTIFIED BY 'Bak#Pass2024!';
GRANT SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER, RELOAD, PROCESS, REPLICATION CLIENT ON *.* TO 'shop_backup'@'localhost';

-- ④ 验证：用新账号登录，看看能不能越权
--    mysql -u shop_app -p -h 192.168.1.10 -D shop
--    DROP TABLE product;      → 报错 1142: DROP command denied（说明权限控制生效了）
```

**安全建议清单**：

1. **应用别用 root**，给每个应用单独的账号（便于审计和按需回收）。
2. **遵循最小权限**：只读账号绝不给写权限。
3. **限制来源主机**：能用内网段的就别用 `%`。
4. **密码要强**：8.0 默认启用 `validate_password` 插件，弱密码会直接报 1819。
5. **定期清理**：离职人员、废弃账号及时 `DROP USER`；用
   `SELECT user, host FROM mysql.user;` 定期盘一遍。
6. **不要明文存密码**：配置文件里用密钥管理服务，或至少限制配置文件权限（600）。

---

# 13. 备份、恢复与导入导出

> **没有备份的数据库等于没有数据库。** 而且**没演练过恢复的备份，等于没有备份**。

## 13.1 mysqldump：最常用的逻辑备份工具

在**操作系统的命令行**里执行（不是 mysql 客户端里）：

```bash
# ========== 备份 ==========
# ① 备份单个库（最常用）——注意 > 是命令行的重定向
mysqldump -u root -p shop > shop_backup.sql

# ② 备份多个库（会带上 CREATE DATABASE / USE 语句）
mysqldump -u root -p --databases shop school > two_db.sql

# ③ 备份服务器上所有库（含用户权限等系统库）
mysqldump -u root -p --all-databases > all_db.sql

# ④ 只备份某张表 / 只备份表结构 / 只备份数据
mysqldump -u root -p shop product order_item > two_tables.sql     # 指定表名（不写 --databases）
mysqldump -u root -p --no-data shop > shop_schema_only.sql        # 只要建表语句
mysqldump -u root -p --no-create-info shop > shop_data_only.sql   # 只要 INSERT 数据

# ⑤ 生产环境必备参数（不锁表、支持事务一致性快照）
mysqldump -u root -p \
    --single-transaction \      # InnoDB 下一致性快照，备份期间不锁表（关键！）
    --routines \                # 连存储过程和函数一起备份
    --triggers \                # 连触发器一起备份（默认就带）
    --events \                  # 连事件一起备份
    --default-character-set=utf8mb4 \
    --set-gtid-purged=OFF \     # 主从复制环境常用，避免导出的 GTID 影响恢复
    --result-file=shop_full.sql \
    shop
```

`mysqldump` 常用参数速查：

| 参数 | 作用 |
| --- | --- |
| `-h -P -u -p` | 连接参数（同 mysql 客户端） |
| `--databases db1 db2` | 导出时**包含 CREATE DATABASE**（恢复时不用先建库） |
| `--all-databases` | 所有库 |
| `--single-transaction` | 一致性快照，**InnoDB 必加**（避免锁表） |
| `--no-data` / `-d` | 只导结构 |
| `--no-create-info` / `-t` | 只导数据 |
| `--routines` / `-R` | 导出存储过程与函数 |
| `--triggers` | 导出触发器（默认开启，`--skip-triggers` 关闭） |
| `--events` / `-E` | 导出事件 |
| `--where="条件"` | 只导部分数据，如 `--where="order_time>='2024-06-01'"` |
| `--ignore-table=shop.log` | 排除某张表（可写多次） |
| `--hex-blob` | 二进制列用十六进制导出，避免乱码 |
| `--default-character-set=utf8mb4` | 避免中文乱码 |
| `--result-file=文件` | 输出到文件（Windows 下比 `>` 更可靠） |
| `--set-gtid-purged=OFF` | 避免导出含 GTID 信息的语句 |
| `--compact` | 去掉注释和多余信息，文件更小 |

## 13.2 恢复数据

```bash
# 方式一：命令行重定向（推荐，文件很大时也适用）
mysql -u root -p shop < shop_backup.sql          # 恢复到 shop 库（库要先存在！）
mysql -u root -p < all_db.sql                    # 备份里含 CREATE DATABASE 时不用指定库

# 方式二：在 mysql 客户端里用 source
mysql -u root -p
mysql> CREATE DATABASE IF NOT EXISTS shop DEFAULT CHARACTER SET utf8mb4;
mysql> USE shop;
mysql> source D:/backup/shop_backup.sql
```

**恢复时的注意事项**：

1. **备份文件里通常没有 `CREATE DATABASE`**（除非用了 `--databases`），恢复前要手动建库并选库。
2. **恢复是"执行 SQL"**，所以大文件恢复慢：可以先在文件开头加
   ```sql
   SET autocommit = 0;  SET unique_checks = 0;  SET foreign_key_checks = 0;
   ```
   结尾再加 `COMMIT; SET foreign_key_checks = 1;`，能快数倍。
3. **恢复前先备份现状**（哪怕数据已经坏了）：`mysqldump ... > before_restore.sql`。
4. 恢复**只读账号**也可能有帮助：恢复期间锁住写入，避免业务写脏数据。

## 13.3 导出/导入文本文件（CSV、TSV）

```sql
-- ========== 导出：SELECT ... INTO OUTFILE ==========
-- ⚠️ 只能导出到服务器上由 secure_file_priv 指定的目录（MySQL 8.0 默认 /var/lib/mysql-files/）
SHOW VARIABLES LIKE 'secure_file_priv';        -- 看看允许写到哪
-- 若为 NULL：完全禁止导出到文件；若为空串：不限制（不安全）

SELECT product_id, name, price, stock
FROM product
INTO OUTFILE '/var/lib/mysql-files/products.csv'
FIELDS TERMINATED BY ','            -- 字段分隔符
       ENCLOSED BY '"'              -- 字段用引号包起来（CSV 规范）
LINES  TERMINATED BY '\n'           -- 行分隔符（Windows 常用 \r\n）
;                                   -- 报 1290 说明目录不在 secure_file_priv 允许范围内

-- ========== 导入：LOAD DATA ==========
-- 从【服务器本地】文件导入（速度快，需要 FILE 权限）
LOAD DATA INFILE '/var/lib/mysql-files/products.csv'
INTO TABLE product
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES                       -- 跳过第一行表头
(product_id, name, price, stock);    -- 指定列顺序（列不匹配时必须写）

-- 从【客户端本地】文件导入（需要客户端开启 --local-infile=1，且服务端 local_infile=ON）
LOAD DATA LOCAL INFILE 'D:/data/products.csv'
INTO TABLE product
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\r\n'
IGNORE 1 LINES;
```

> **导入大文件更快的方法**：`LOAD DATA` 通常比逐条 `INSERT` 快 20 倍以上。
> 导入前可以先 `ALTER TABLE 表名 DISABLE KEYS;`（仅 MyISAM 有效），InnoDB 则建议
> 先去掉次要索引、导入完再重建，并调大 `innodb_buffer_pool_size`。

## 13.4 物理备份与时间点恢复（了解即可，知道有这条路）

| 方式 | 工具 | 特点 |
| --- | --- | --- |
| 逻辑备份 | `mysqldump` | 跨版本、可读的 SQL 文本，但**慢**、大库恢复时间长 |
| 物理备份 | **XtraBackup**（Percona）、MySQL Enterprise Backup | 直接复制数据文件，**快**，适合 TB 级库 |
| 快照备份 | LVM / 云盘快照 | 秒级，依赖存储层 |
| 二进制日志 | `binlog` | 用于**时间点恢复（PITR）**和主从复制 |

```bash
# 时间点恢复思路：全量备份 + 重放 binlog
# ① 先恢复最近一次全量备份
mysql -u root -p < full_backup.sql
# ② 再把"备份之后到误操作之前"的 binlog 重放上去
mysqlbinlog --start-datetime="2024-06-20 09:00:00" \
            --stop-datetime="2024-06-20 10:30:00" \
            /var/lib/mysql/binlog.000123 | mysql -u root -p
# 关键：binlog 必须开启（log_bin=ON）、格式建议 ROW（binlog_format=ROW）
SHOW VARIABLES LIKE 'log_bin';
SHOW BINARY LOGS;
```

**备份策略建议**：

1. **全备 + 增量**：例如每周日全备、每天 binlog 增量。
2. **异地保存**：本机备份和数据库一起挂掉的概率很高。
3. **定期演练恢复**：每月至少恢复一次到测试库，验证备份文件可用。
4. **备份要监控**：备份失败要告警（很多事故是"以为有备份"）。
5. **注意权限**：备份账号只需 `SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER, RELOAD, PROCESS, REPLICATION CLIENT`。

---

# 14. 常用命令速查表（大合集）

> 这一章建议**收藏**。日常 90% 的操作都在这几张表里。

## 14.1 服务与连接

| 目的 | 命令（系统命令行） |
| --- | --- |
| Windows 启动/停止服务 | `net start MySQL80` / `net stop MySQL80` |
| Linux 启动/停止/自启 | `systemctl start mysql` / `stop` / `enable` / `status mysql` |
| macOS 启动/停止 | `brew services start mysql` / `brew services stop mysql` |
| 连接本机 | `mysql -u root -p` |
| 连接远程指定端口 | `mysql -h 192.168.1.10 -P 3306 -u app -p -D shop` |
| 执行一条语句后退出 | `mysql -u root -p -e "SHOW DATABASES;"` |
| 执行 SQL 文件 | `mysql -u root -p shop < file.sql` |
| 导出结果到文件 | `mysql -u root -p -B -N -e "SELECT ..." > out.tsv` |
| 指定字符集连接 | `mysql -u root -p --default-character-set=utf8mb4` |
| 查看服务器状态 | `mysqladmin -u root -p status` / `ping` / `processlist` |
| 关闭服务器 | `mysqladmin -u root -p shutdown` |

## 14.2 数据库操作

| 目的 | 命令 |
| --- | --- |
| 列出所有库 | `SHOW DATABASES;` |
| 创建库 | `CREATE DATABASE 库名 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;` |
| 创建库（不存在才建） | `CREATE DATABASE IF NOT EXISTS 库名;` |
| 查看建库语句 | `SHOW CREATE DATABASE 库名;` |
| 切换库 | `USE 库名;` |
| 看当前在哪个库 | `SELECT DATABASE();` |
| 改库字符集 | `ALTER DATABASE 库名 CHARACTER SET utf8mb4;` |
| 删库（⚠️不可恢复） | `DROP DATABASE 库名;` |
| 看库的大小 | `SELECT table_schema, ROUND(SUM(data_length+index_length)/1024/1024,2) AS MB FROM information_schema.TABLES GROUP BY table_schema;` |

## 14.3 表结构（DDL）

| 目的 | 命令 |
| --- | --- |
| 列出表 | `SHOW TABLES;` / `SHOW TABLES LIKE 'prod%';` |
| 看表结构 | `DESC 表名;` / `SHOW COLUMNS FROM 表名;` |
| 看建表语句 | `SHOW CREATE TABLE 表名\G` |
| 看表状态（引擎/行数/大小） | `SHOW TABLE STATUS LIKE '表名'\G` |
| 建表 | `CREATE TABLE 表名 (列 类型 约束, PRIMARY KEY(列)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='说明';` |
| 复制表结构 | `CREATE TABLE 新表 LIKE 旧表;` |
| 复制表结构和数据 | `CREATE TABLE 新表 AS SELECT * FROM 旧表;` |
| 加列 | `ALTER TABLE 表名 ADD COLUMN 列 类型 COMMENT '说明' AFTER 某列;` |
| 改列类型 | `ALTER TABLE 表名 MODIFY COLUMN 列 新类型;` |
| 改列名 | `ALTER TABLE 表名 CHANGE COLUMN 旧列名 新列名 类型;` |
| 删列 | `ALTER TABLE 表名 DROP COLUMN 列;` |
| 改表名 | `ALTER TABLE 旧表名 RENAME TO 新表名;` / `RENAME TABLE a TO b, c TO d;` |
| 加索引 | `ALTER TABLE 表名 ADD INDEX idx_列 (列);` |
| 加唯一索引 | `ALTER TABLE 表名 ADD UNIQUE KEY uk_列 (列);` |
| 删索引 | `ALTER TABLE 表名 DROP INDEX 索引名;` |
| 加外键 | `ALTER TABLE 子表 ADD CONSTRAINT fk_名 FOREIGN KEY (列) REFERENCES 父表(列);` |
| 删外键 | `ALTER TABLE 子表 DROP FOREIGN KEY fk_名;` |
| 清空表（保留结构） | `TRUNCATE TABLE 表名;` |
| 删表 | `DROP TABLE IF EXISTS 表名;` |
| 批量生成删表语句 | `SELECT CONCAT('DROP TABLE ', table_name, ';') FROM information_schema.TABLES WHERE table_schema='shop' AND table_name LIKE 'tmp_%';` |

## 14.4 数据操作（DML）

| 目的 | 命令 |
| --- | --- |
| 插入一行 | `INSERT INTO 表 (列1,列2) VALUES (值1,值2);` |
| 批量插入 | `INSERT INTO 表 (列1,列2) VALUES (1,2),(3,4),(5,6);` |
| 插入或更新 | `INSERT INTO 表 (...) VALUES (...) ON DUPLICATE KEY UPDATE 列=新值;` |
| 冲突则忽略 | `INSERT IGNORE INTO 表 (...) VALUES (...);` |
| 从查询结果插入 | `INSERT INTO 表 (列) SELECT 列 FROM 其他表 WHERE ...;` |
| 更新 | `UPDATE 表 SET 列=值 WHERE 条件;` |
| 排序限量更新 | `UPDATE 表 SET 列=值 ORDER BY 列 LIMIT 10;` |
| 删除 | `DELETE FROM 表 WHERE 条件;` |
| 删除限量 | `DELETE FROM 表 WHERE 条件 ORDER BY 列 LIMIT 1000;` |
| 取刚插入的自增 ID | `SELECT LAST_INSERT_ID();` |
| 看上次影响行数 | `SELECT ROW_COUNT();` |
| 关/开安全更新模式 | `SET SQL_SAFE_UPDATES = 0;` / `SET SQL_SAFE_UPDATES = 1;` |

## 14.5 查询（DQL）

| 目的 | 命令模板 |
| --- | --- |
| 基本查询 | `SELECT 列 FROM 表 WHERE 条件 GROUP BY 列 HAVING 条件 ORDER BY 列 LIMIT n;` |
| 去重 | `SELECT DISTINCT 列 FROM 表;` |
| 分页 | `SELECT * FROM 表 ORDER BY 主键 LIMIT 20 OFFSET 40;` |
| 取前 N | `SELECT * FROM 表 ORDER BY 列 DESC LIMIT 10;` |
| 内连接 | `SELECT * FROM a JOIN b ON b.a_id = a.id;` |
| 左连接 | `SELECT * FROM a LEFT JOIN b ON b.a_id = a.id;` |
| 合并结果集 | `SELECT ... UNION ALL SELECT ...;` |
| 子查询 | `SELECT * FROM 表 WHERE 列 IN (SELECT 列 FROM 表2 WHERE ...);` |
| 存在性判断 | `SELECT * FROM a WHERE EXISTS (SELECT 1 FROM b WHERE b.a_id = a.id);` |
| CTE【8.0+】 | `WITH t AS (SELECT ...) SELECT * FROM t;` |
| 窗口函数【8.0+】 | `SELECT ROW_NUMBER() OVER (PARTITION BY 列 ORDER BY 列) FROM 表;` |
| 行转列 | `SELECT SUM(CASE WHEN 列='值1' THEN 1 ELSE 0 END) AS 值1个数, ... FROM 表 GROUP BY ...;` |
| 简单判断 | `SELECT IF(条件,'是','否'); SELECT IFNULL(列,0); SELECT COALESCE(a,b,c);` |
| 多分支判断 | `SELECT CASE WHEN 条件 THEN '结果' ELSE '其他' END FROM 表;` |
| 行号/变量 | `SET @i = 0; SELECT @i := @i + 1 AS 序号, 列 FROM 表;`（5.7 风格，8.0 建议用窗口函数） |
| 随机一条 | `SELECT * FROM 表 ORDER BY RAND() LIMIT 1;`（大表慎用） |
| 导出为插入语句 | `SELECT CONCAT('INSERT INTO 表 VALUES(', 列, ');') FROM 表;` |

## 14.6 索引 / 视图 / 过程 / 触发器 / 事件

| 目的 | 命令 |
| --- | --- |
| 看索引 | `SHOW INDEX FROM 表;` |
| 建索引 | `CREATE INDEX idx_名 ON 表 (列1, 列2);` |
| 删索引 | `DROP INDEX idx_名 ON 表;` |
| 分析索引统计 | `ANALYZE TABLE 表;` |
| 建/替换视图 | `CREATE OR REPLACE VIEW v_名 AS SELECT ...;` |
| 看视图定义 | `SHOW CREATE VIEW v_名\G` |
| 列视图 | `SHOW FULL TABLES WHERE Table_type='VIEW';` |
| 建存储过程 | `DELIMITER $$ CREATE PROCEDURE p_名(IN x INT) BEGIN ... END$$ DELIMITER ;` |
| 调用过程 | `CALL p_名(参数);` |
| 看过程列表 | `SHOW PROCEDURE STATUS WHERE Db='库名';` |
| 看过程源码 | `SHOW CREATE PROCEDURE p_名\G` |
| 删除过程 | `DROP PROCEDURE IF EXISTS p_名;` |
| 建函数 | `CREATE FUNCTION f_名(x INT) RETURNS INT DETERMINISTIC RETURN x*2;` |
| 看触发器 | `SHOW TRIGGERS;` |
| 删除触发器 | `DROP TRIGGER IF EXISTS trg_名;` |
| 开事件调度器 | `SET GLOBAL event_scheduler = ON;` |
| 看事件 | `SHOW EVENTS;` |
| 删事件 | `DROP EVENT IF EXISTS ev_名;` |

## 14.7 事务与锁

| 目的 | 命令 |
| --- | --- |
| 开启事务 | `START TRANSACTION;` 或 `BEGIN;` |
| 提交 / 回滚 | `COMMIT;` / `ROLLBACK;` |
| 保存点 | `SAVEPOINT sp1;` / `ROLLBACK TO sp1;` / `RELEASE SAVEPOINT sp1;` |
| 自动提交开关 | `SELECT @@autocommit;` / `SET autocommit = 0;` |
| 看隔离级别 | `SELECT @@transaction_isolation;`（5.7 用 `@@tx_isolation`） |
| 设隔离级别 | `SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;` |
| 加排他锁 | `SELECT ... FOR UPDATE;` |
| 加共享锁 | `SELECT ... FOR SHARE;`（8.0）/ `LOCK IN SHARE MODE;`（5.7） |
| 不等待锁 | `SELECT ... FOR UPDATE NOWAIT;`（8.0） |
| 跳过被锁行 | `SELECT ... FOR UPDATE SKIP LOCKED;`（8.0） |
| 看当前事务 | `SELECT * FROM information_schema.innodb_trx\G` |
| 看锁等待 | `SELECT * FROM performance_schema.data_lock_waits\G` |
| 看死锁日志 | `SHOW ENGINE INNODB STATUS\G` |
| 锁等待超时 | `SELECT @@innodb_lock_wait_timeout;` |

## 14.8 用户与权限

| 目的 | 命令 |
| --- | --- |
| 看所有用户 | `SELECT user, host FROM mysql.user;` |
| 建用户 | `CREATE USER 'u'@'%' IDENTIFIED BY '密码';` |
| 改密码 | `ALTER USER 'u'@'%' IDENTIFIED BY '新密码';` |
| 删用户 | `DROP USER 'u'@'%';` |
| 锁定/解锁 | `ALTER USER 'u'@'%' ACCOUNT LOCK;` / `UNLOCK;` |
| 授权 | `GRANT SELECT, INSERT ON 库.* TO 'u'@'%';` |
| 收权 | `REVOKE DELETE ON 库.* FROM 'u'@'%';` |
| 看权限 | `SHOW GRANTS FOR 'u'@'%';` |
| 看自己的权限 | `SHOW GRANTS;` |
| 刷新权限 | `FLUSH PRIVILEGES;`（只有直接改权限表后才需要） |
| 建/授角色【8.0+】 | `CREATE ROLE 'r'; GRANT SELECT ON 库.* TO 'r'; GRANT 'r' TO 'u'@'%';` |

## 14.9 备份恢复与导入导出

| 目的 | 命令 |
| --- | --- |
| 备份单库 | `mysqldump -u root -p --single-transaction 库名 > 文件.sql` |
| 备份多库 | `mysqldump -u root -p --databases 库1 库2 > 文件.sql` |
| 备份全库 | `mysqldump -u root -p --all-databases --single-transaction > 文件.sql` |
| 只备份结构 | `mysqldump -u root -p --no-data 库名 > schema.sql` |
| 只备份数据 | `mysqldump -u root -p --no-create-info 库名 > data.sql` |
| 条件备份 | `mysqldump -u root -p 库名 表名 --where="order_time>='2024-06-01'" > part.sql` |
| 恢复 | `mysql -u root -p 库名 < 文件.sql` |
| 客户端内恢复 | `source D:/backup/文件.sql` |
| 导出 CSV | `SELECT ... INTO OUTFILE '/path/x.csv' FIELDS TERMINATED BY ',' ENCLOSED BY '"';` |
| 导入 CSV | `LOAD DATA INFILE '/path/x.csv' INTO TABLE 表 FIELDS TERMINATED BY ',' IGNORE 1 LINES;` |
| 看导出目录限制 | `SHOW VARIABLES LIKE 'secure_file_priv';` |
| 看 binlog | `SHOW BINARY LOGS;` / `SHOW VARIABLES LIKE 'log_bin';` |
| 重放 binlog | `mysqlbinlog --start-datetime='...' binlog.000001 \| mysql -u root -p` |

## 14.10 状态、监控与诊断

| 目的 | 命令 |
| --- | --- |
| 当前连接/正在执行的语句 | `SHOW PROCESSLIST;` / `SHOW FULL PROCESSLIST;` |
| 杀掉某个连接 | `KILL 连接ID;` / `KILL QUERY 连接ID;`（只杀语句不杀连接） |
| 服务器状态指标 | `SHOW STATUS;` / `SHOW STATUS LIKE 'Threads_connected';` |
| 服务器变量 | `SHOW VARIABLES LIKE 'innodb_buffer_pool_size';` |
| 查看字符集设置 | `SHOW VARIABLES LIKE 'character%';` / `SHOW VARIABLES LIKE 'collation%';` |
| 查看 sql_mode | `SELECT @@sql_mode;` |
| 慢查询日志状态 | `SHOW VARIABLES LIKE 'slow_query_log%';` |
| 开启慢查询日志 | `SET GLOBAL slow_query_log = ON; SET GLOBAL long_query_time = 1;` |
| 看 InnoDB 引擎状态 | `SHOW ENGINE INNODB STATUS\G` |
| 表大小排行 | `SELECT table_name, ROUND((data_length+index_length)/1024/1024,2) AS MB FROM information_schema.TABLES WHERE table_schema='shop' ORDER BY MB DESC;` |
| 看表的碎片 | `SHOW TABLE STATUS LIKE '表'\G` → `Data_free` 列 |
| 整理碎片 | `OPTIMIZE TABLE 表名;`（会锁表，大表慎用） |
| 刷新表统计信息 | `ANALYZE TABLE 表名;` |
| 看错误日志位置 | `SHOW VARIABLES LIKE 'log_error';` |
| 复制状态（主从） | `SHOW REPLICA STATUS\G`（8.0.22+）/ `SHOW SLAVE STATUS\G`（5.7） |

## 14.11 mysql 客户端元命令（不带分号）

| 命令 | 作用 |
| --- | --- |
| `help` / `\h` / `?` | 帮助；`help 'SELECT'` 查语法 |
| `status` / `\s` | 连接状态（版本、字符集、当前库） |
| `use 库名` / `\u 库名` | 切换数据库 |
| `source 文件` / `\.` | 执行 SQL 文件 |
| `quit` / `exit` / `\q` | 退出 |
| `\G` | 结果竖排显示（代替分号） |
| `\c` | 取消当前输入 |
| `tee 文件` / `\T` | 记录输出到文件 |
| `notee` / `\t` | 停止记录 |
| `\! 命令` | 执行系统命令 |
| `prompt 字符串` | 自定义提示符，如 `prompt "\u@\h[\d]> "` |
| `\P 分页器` / `nopager` | 设置/取消分页显示（大结果集） |
| `delimiter $$` | 临时改语句结束符（写存储过程用） |
| `show warnings;` | 看上一条语句的警告（配合非严格模式排查问题） |

---

# 15. 常见报错速查（错误码 → 原因 → 解决）

> 看到报错别慌：**错误码本身就是文档**。下表覆盖了初学者 95% 会遇到的情况。

## 15.1 连接与权限类

| 错误码 | 报错信息（节选） | 原因 | 解决 |
| --- | --- | --- | --- |
| **1045** | Access denied for user 'root'@'localhost' | 密码错 / 用户不存在 / 来源主机不匹配 | 检查密码；用 `SELECT user,host FROM mysql.user;` 确认账号；远程连接要授权 `'u'@'%'` |
| **1044** | Access denied for user ... to database 'xxx' | 账号没有该库的权限 | `GRANT ... ON xxx.* TO 'u'@'%';` |
| **1130** | Host 'x.x.x.x' is not allowed to connect | 没有匹配来源主机的账号 | 建 `'u'@'%'` 或对应网段账号；检查 `bind-address` |
| **1040** | Too many connections | 连接数达到 `max_connections` | 查 `SHOW PROCESSLIST` 找泄漏连接；调大 `max_connections`；修连接池配置 |
| **1129** | Host is blocked because of many connection errors | 被 `max_connect_errors` 拉黑 | `FLUSH HOSTS;` 解除，并排查连接失败原因 |
| **2059** | Authentication plugin 'caching_sha2_password' cannot be loaded | 老客户端不支持 8.0 默认认证插件 | `ALTER USER 'u'@'%' IDENTIFIED WITH mysql_native_password BY '密码';` 或升级客户端 |
| **2003** | Can't connect to MySQL server on '...' | 服务没启动 / 端口错 / 防火墙 | 启动服务；确认端口 `-P`；检查防火墙与 `bind-address` |

## 15.2 库、表、字段类

| 错误码 | 报错信息（节选） | 原因 | 解决 |
| --- | --- | --- | --- |
| **1046** | No database selected | 没 `USE 库名` 就查表 | `USE 库名;` 或写全 `库.表` |
| **1049** | Unknown database 'xxx' | 库不存在 / 拼错 / 没建库就恢复 | `CREATE DATABASE xxx;` 或修正库名 |
| **1146** | Table 'xxx.yyy' doesn't exist | 表不存在 / 库选错 / 大小写问题 | `SHOW TABLES;` 确认；Linux 下表名区分大小写 |
| **1054** | Unknown column 'xxx' in 'field list' | 列名拼错 / 表别名用错 | 用 `DESC 表` 核对列名；检查别名 |
| **1052** | Column 'name' in field list is ambiguous | 多表连接时有同名列没指明 | 加表别名：`a.name`、`b.name` |
| **1064** | You have an error in your SQL syntax ... | **语法错**（最常见） | 看报错位置附近；检查逗号、引号、关键字拼写、是否漏了 `;` |
| **1051** | Unknown table 'xxx' | 删的表不存在 | `DROP TABLE IF EXISTS xxx;` |
| **1248** | Every derived table must have its own alias | `FROM (子查询)` 没起别名 | `FROM (SELECT ...) t` |
| **1242** | Subquery returns more than 1 row | 标量子查询返回多行 | 改用 `IN` / `EXISTS`，或加 `LIMIT 1` |
| **1241** | Operand should contain 1 column(s) | 子查询列数不匹配 | 检查 `IN (...)` 里的列数 |
| **1305** | FUNCTION xxx does not exist | 函数名拼错 / 库不对 / 该函数版本不支持 | 核对函数名与 MySQL 版本 |
| **1118/1074** | Row size too large | 单行超 65535 字节 | 用 `TEXT` 替换超长 `VARCHAR`；拆表 |

## 15.3 数据与约束类

| 错误码 | 报错信息（节选） | 原因 | 解决 |
| --- | --- | --- | --- |
| **1062** | Duplicate entry 'x' for key 'uk_xxx' | 唯一键/主键冲突 | 换值；或用 `INSERT IGNORE` / `ON DUPLICATE KEY UPDATE` |
| **1048** | Column 'xxx' cannot be null | 该列 `NOT NULL` 但给了 NULL | 补值或给默认值 |
| **1265** | Data truncated for column 'xxx' | 值不在 `ENUM` 列表里 / 类型不匹配 | 用列表内的值；检查类型 |
| **1264** | Out of range value for column 'xxx' | 数值超出范围（如 `UNSIGNED` 列存负数） | 检查取值与列类型 |
| **1406** | Data too long for column 'xxx' | 字符串超长 | 加长列：`ALTER TABLE ... MODIFY 列 VARCHAR(200);` |
| **1366** | Incorrect string value: '\xE5\xB0\x8F...' | 字符集不支持（常见于 utf8 存 emoji） | 把库/表/连接字符集统一成 `utf8mb4` |
| **1292** | Incorrect datetime value | 日期格式不对（如 '2024-13-45'） | 用 `YYYY-MM-DD HH:MM:SS` 格式 |
| **1364** | Field 'xxx' doesn't have a default value | 严格模式下没给值且无默认值 | 插入时补值，或给列加 `DEFAULT` |
| **1369** | CHECK OPTION failed | 通过带 `WITH CHECK OPTION` 的视图写入了视图看不到的数据 | 改成符合视图条件的数据 |
| **3819** | Check constraint 'chk_xxx' is violated | `CHECK` 约束不满足（8.0.16+） | 修正数据或调整约束 |

## 15.4 外键与事务类

| 错误码 | 报错信息（节选） | 原因 | 解决 |
| --- | --- | --- | --- |
| **1452** | Cannot add or update a child row: a foreign key constraint fails | 插入的外键值在父表不存在 | 先插父表，或修正外键值 |
| **1451** | Cannot delete or update a parent row: a foreign key constraint fails | 父表行被子表引用，不能删 | 先删子表数据，或把外键改成 `ON DELETE CASCADE` |
| **1215** | Cannot add foreign key constraint | 建外键失败：类型/字符集/引擎不一致 | 两列类型与字符集必须完全一致；都用 InnoDB；父列要有索引 |
| **1213** | Deadlock found when trying to get lock | 死锁，InnoDB 回滚了本事务 | 按固定顺序访问数据；缩短事务；业务侧加重试 |
| **1205** | Lock wait timeout exceeded | 等锁超过 `innodb_lock_wait_timeout`（默认 50 秒） | 找长事务：`SELECT * FROM information_schema.innodb_trx;`；确认后 `KILL` |
| **1064 / 1193** | Unknown system variable | 变量名在当前版本不存在 | 5.7 用 `tx_isolation`，8.0 用 `transaction_isolation` 等 |
| **1792** | Cannot execute statement in a READ ONLY transaction | 只读事务里做了写操作 | 检查 `START TRANSACTION READ ONLY` |
| **1175** | You are using safe update mode ... | 安全更新模式拦截了无 WHERE 的 UPDATE/DELETE | 补 `WHERE`，或 `SET SQL_SAFE_UPDATES = 0;` |

## 15.5 分组与窗口函数类

| 错误码 | 报错信息（节选） | 原因 | 解决 |
| --- | --- | --- | --- |
| **1055** | Expression #N of SELECT list is not in GROUP BY clause ... | `ONLY_FULL_GROUP_BY` 模式下 SELECT 了未分组的列 | 把该列加入 `GROUP BY`，或用聚合函数包起来（见 5.5） |
| **1140** | In aggregated query without GROUP BY ... | 混用了聚合列与普通列 | 同上 |
| **3580 / 3593** | You cannot use the window function ... in this context | 窗口函数写在了 `WHERE`/`GROUP BY`/`HAVING` 里 | 套一层派生表或 CTE，在外层过滤（见 8.7） |
| **1140 / 1247** | 引用别名出错 | `WHERE` 里用了 `SELECT` 的别名 | 别名只能在 `GROUP BY`/`HAVING`/`ORDER BY` 里用；`WHERE` 里要重写表达式 |

## 15.6 文件与导入导出类

| 错误码 | 报错信息（节选） | 原因 | 解决 |
| --- | --- | --- | --- |
| **1290** | The MySQL server is running with the --secure-file-priv option | 导出路径不在 `secure_file_priv` 允许目录 | 导出到该目录：`SHOW VARIABLES LIKE 'secure_file_priv';` |
| **13** | Can't get stat of ... (Errcode: 13) | 文件权限不足 / `LOAD DATA` 用错了本地语法 | 检查文件权限；客户端文件要用 `LOAD DATA LOCAL INFILE` |
| **1148** | The used command is not allowed with this MySQL version | 服务端禁用了 `local_infile` | 服务端 `local_infile=ON`，客户端加 `--local-infile=1` |
| **2006** | MySQL server has gone away | 连接超时 / 包太大（`max_allowed_packet`） | 调大 `max_allowed_packet`；分批导入 |
| **1064** 出现在恢复时 | 备份文件本身有问题/被截断 | 备份不完整 | 重新备份；检查磁盘空间与文件编码 |

---

# 16. 性能优化入门清单

> 优化有个基本顺序：**先定位（哪个 SQL 慢）→ 再分析（为什么慢）→ 最后才动手（加索引 / 改写 SQL / 调结构）**。
> 千万不要"凭感觉加索引"。

## 16.1 第一步：找出慢 SQL

```sql
-- ① 看看现在有没有正在跑的慢查询
SHOW FULL PROCESSLIST;             -- 关注 Time 很大、State 是 Sending data / Copying to tmp table 的
SELECT * FROM information_schema.PROCESSLIST WHERE TIME > 5 ORDER BY TIME DESC;

-- ② 开启慢查询日志（需要权限，重启会失效，永久生效要改配置文件）
SHOW VARIABLES LIKE 'slow_query_log%';         -- 看当前状态和日志路径
SHOW VARIABLES LIKE 'long_query_time';         -- 默认 10 秒，太宽松了
SET GLOBAL slow_query_log = ON;                -- 打开
SET GLOBAL long_query_time = 1;                -- 超过 1 秒就记录（新会话生效）
SET GLOBAL log_queries_not_using_indexes = ON; -- 记录没走索引的语句（临时排查时开，平时别开，日志会爆）
FLUSH LOGS;                                    -- 滚动日志文件

-- Windows 上路径通常是 data 目录下的 xxx-slow.log
-- Linux 通常是 /var/log/mysql/slow.log
```

```bash
# ③ 分析慢日志（系统命令行）
mysqldumpslow -s t -t 10 /var/log/mysql/slow.log      # 按总耗时排序，取前 10 条
mysqldumpslow -s c -t 10 /var/log/mysql/slow.log      # 按出现次数排序
# 更强大的工具（Percona Toolkit）：
pt-query-digest /var/log/mysql/slow.log
```

## 16.2 第二步：用 EXPLAIN 看"为什么慢"

```sql
EXPLAIN SELECT ...;                         -- 看执行计划
EXPLAIN ANALYZE SELECT ...;                 -- 【8.0.18+】实际执行并给出真实耗时
```

**看计划的三条速判规则**：

1. `type = ALL` 且 `rows` 很大 → **缺索引或索引用不上**（回到第 9 章）。
2. `Extra` 里有 `Using filesort` 或 `Using temporary` 且数据量大 → **排序/分组没走索引**，考虑给 `ORDER BY`/`GROUP BY` 列建联合索引。
3. `rows` 远大于最终返回行数 → **过滤效率低**，考虑更有区分度的索引列放前面。

## 16.3 SQL 写法上的 12 条建议

| # | 别这么写 | 建议这么写 | 原因 |
| --- | --- | --- | --- |
| 1 | `SELECT *` | 只列需要的列 | 减少 IO、利于覆盖索引 |
| 2 | `WHERE YEAR(t) = 2024` | `WHERE t >= '2024-01-01' AND t < '2025-01-01'` | 列上套函数导致索引失效 |
| 3 | `WHERE name LIKE '%张%'` | `WHERE name LIKE '张%'` 或全文索引 | 前置 % 无法用索引 |
| 4 | `WHERE age != 30` | 尽量改成范围/`IN` | `!=` 常导致全表扫 |
| 5 | `WHERE s_id NOT IN (SELECT ...)` | `NOT EXISTS (...)` | 避免 NULL 陷阱 + 更好的执行计划 |
| 6 | `INSERT` 循环单条插 | 批量 `INSERT ... VALUES (),(),()` | 减少往返与提交次数 |
| 7 | 一次删/改几十万行 | 分批 `LIMIT 1000` 循环 | 避免长事务、主从延迟 |
| 8 | 大事务 | 拆小 + 及时提交 | 减少锁持有时间与 undo 膨胀 |
| 9 | `ORDER BY RAND() LIMIT 1` | 用随机主键范围取 | 全表排序，代价极高 |
| 10 | `COUNT(列)` 当行数用 | 用 `COUNT(*)`（或 `COUNT(1)`） | `COUNT(列)` 要判 NULL，语义也不同 |
| 11 | 隐式类型转换（字符串列传数字） | 类型一致地比较 | 列被转换 → 索引失效 |
| 12 | 在 `WHERE` 里对列做算术 | 把运算移到常量侧 | 同上 |

## 16.4 深分页优化（`LIMIT 1000000` 为什么慢）

```sql
-- 慢：要先扫出前 100 万行，再丢掉
SELECT * FROM big_user ORDER BY id LIMIT 10 OFFSET 1000000;

-- ✅ 优化 1：游标分页（记录上一页最后一行的 id，下次从它之后取）
--    最快，但只能"下一页"，不能跳到第 N 页（适合信息流、无限滚动）
SELECT * FROM big_user WHERE id > 1000000 ORDER BY id LIMIT 10;

-- ✅ 优化 2：延迟关联（先用覆盖索引拿到主键，再回表取整行）
SELECT u.*
FROM big_user u
JOIN (SELECT id FROM big_user ORDER BY id LIMIT 10 OFFSET 1000000) t   -- 子查询只取主键，走覆盖索引
  ON u.id = t.id;

-- ✅ 优化 3：业务上限制最大页数（比如只允许翻到第 100 页），或用"搜索结果只取前 N 条"
```

## 16.5 批量操作的性能技巧

```sql
-- ① 批量插入：一条语句插多行，比循环单条插快几十倍
INSERT INTO order_log (order_id, action) VALUES (1,'a'),(2,'b'),(3,'c');   -- 建议每批 500~1000 行

-- ② 显式事务包住批量插入（减少提交次数）
START TRANSACTION;
INSERT INTO order_log (order_id, action) VALUES (1,'a'),(2,'b');
INSERT INTO order_log (order_id, action) VALUES (3,'c');
COMMIT;

-- ③ 导入大文件时临时关掉约束检查（仅在确认数据干净时使用！）
SET unique_checks = 0;
SET foreign_key_checks = 0;
-- ... 执行导入 ...
SET unique_checks = 1;
SET foreign_key_checks = 1;
```

## 16.6 结构与环境层面的优化（了解即可）

| 方向 | 措施 |
| --- | --- |
| 表结构 | 用合适的数据类型（`TINYINT` 代替 `INT`、`DATETIME` 代替字符串日期）；避免过多大字段（`TEXT`/`BLOB`）拖慢查询 |
| 分区 | 按时间范围分区，便于"查最近数据"和"按分区归档删除"（如 `PARTITION BY RANGE (TO_DAYS(order_time))`） |
| 配置 | `innodb_buffer_pool_size` 调到物理内存的 50%~70%（最重要的一个参数）、`max_connections`、`innodb_flush_log_at_trx_commit` |
| 架构 | 读写分离（主从复制）、缓存（Redis 挡热点查询）、分库分表（最后手段，代价很大） |
| 应用 | 合理的连接池大小、避免 N+1 查询、热点数据本地缓存、SQL 上线前 review |

## 16.7 优化 checklist（遇到慢查询按顺序走一遍）

1. `SHOW PROCESSLIST` → 现在有没有跑很久的语句？
2. 打开慢日志，找出 Top 10 慢语句（按总耗时排）。
3. 对每条慢语句 `EXPLAIN`，看 `type`、`key`、`rows`、`Extra`。
4. 索引层面：该加的加（联合索引注意最左前缀、等值在前范围在后、尽量覆盖）。
5. SQL 层面：按 16.3 的清单改写（去函数、去前置 %、去 `SELECT *`、拆大事务）。
6. 数据层面：是不是数据量太大了？考虑归档历史数据、分区。
7. 结构层面：表设计是否合理？有没有把大字段塞在同一张表？
8. 兜底：加缓存、读写分离、分库分表。
9. **改完必须复测**：同样的 SQL 再 `EXPLAIN` 一次 + 记录真实耗时，确认真的变快了。

---

# 17. 综合实战：20 道电商数据分析题

> **用法**：先自己写，能跑出结果就行（不同写法完全正常）；实在卡住再看提示；
> 完整参考答案在 `mysql-practice/04_exercises_answers.sql`，每题都注明了思路。
> 全部题目都基于 `shop`（1-19 题）和 `school`（第 20 题）两个库。
>
> **建议**：每写一题，先想清楚三件事——**要查哪几张表？怎么连接？按什么分组？**

## 17.1 基础查询（第 4 章水平）

**题 1**　列出所有"在售"且库存大于 0 的商品，显示商品名、单价、库存，按价格从高到低。
> 提示：`WHERE status = '在售' AND stock > 0`。

**题 2**　查出 2024 年 3 月下单的订单编号、客户姓名、下单时间、金额。
> 提示：需要连接 `orders` 和 `customer`；月份条件用 `BETWEEN` 或 `>= / <`。

**题 3**　查出商品名里含"米"或"果"的商品（商品名、分类ID、单价）。
> 提示：`LIKE '%米%' OR LIKE '%果%'`。

**题 4**　统计每个会员等级有多少人，显示等级和人数。
> 提示：`GROUP BY level`。

**题 5**　查出消费总额最高的前 3 位客户（姓名、消费总额）。
> 提示：连接后 `GROUP BY` 再 `ORDER BY ... DESC LIMIT 3`。

<details>
<summary>点开看第 5 题参考答案</summary>

```sql
SELECT c.name AS 客户, ROUND(SUM(o.total_amount), 2) AS 消费总额
FROM customer c
JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.name
ORDER BY 消费总额 DESC
LIMIT 3;
```

```txt
+--------+----------+
| 客户   | 消费总额 |
+--------+----------+
| 陈静   | 13497.00 |
| 张伟   | 12095.00 |
| 王芳   | 11194.00 |
+--------+----------+
```
</details>

**题 6**　把商品按价格分成"100 元以下 / 100-3000 元 / 3000 元以上"三档，统计每档的商品数量和平均价。
> 提示：`CASE WHEN` + `GROUP BY`（可以按别名分组）。

## 17.2 分组与多表连接（第 5～6 章水平）

**题 7**　统计每个分类的商品数、平均价、库存总数；**没有商品的分类也要显示**（商品数 0）。
> 提示：`category LEFT JOIN product`，并且用 `COUNT(p.product_id)` 而不是 `COUNT(*)`。

**题 8**　列出每笔订单的订单编号、客户姓名、商品种数、总金额，按金额从高到低。
> 提示：`orders` + `customer` + `order_item` 三表连接后 `GROUP BY`。
> 想一想：`orders.total_amount` 已经有了，为什么还要从明细算？——练手用，生产上以明细为准更可靠。

**题 9**　统计 2024 年每个月的**有效订单**（排除"已取消"）笔数与金额。
> 提示：`WHERE status <> '已取消'` + `GROUP BY DATE_FORMAT(order_time,'%Y-%m')`。

**题 10**　① 找出没有任何订单的客户；② 找出"在售但库存为 0"的缺货商品。
> 提示：① 用 `LEFT JOIN ... WHERE o.order_id IS NULL` 或 `NOT EXISTS`；
> ② 就是一条简单的 `WHERE status='在售' AND stock = 0`。

<details>
<summary>点开看第 10 题参考答案</summary>

```sql
-- ① 没有任何订单的客户（反连接）
SELECT c.customer_id AS 客户ID, c.name AS 客户
FROM customer c
LEFT JOIN orders o ON o.customer_id = c.customer_id
WHERE o.order_id IS NULL;                 -- 右表没匹配上 → 补的 NULL 行

-- ② 在售但缺货的商品（这个只需要普通过滤）
SELECT product_id AS 商品ID, name AS 商品, stock AS 库存
FROM product
WHERE status = '在售' AND stock = 0;
```

```txt
-- ① 结果            ② 结果
+--------+--------+  +--------+--------------------------+------+
| 客户ID | 客户   |  | 商品ID | 商品                     | 库存 |
+--------+--------+  +--------+--------------------------+------+
|      9 | 吴涛   |  |      8 | 戴森 V12 吸尘器          |    0 |
+--------+--------+  |     12 | 蒙牛纯牛奶 250ml*12      |    0 |
                    +--------+--------------------------+------+
```
</details>

**题 11**　列出每个客户的订单数、消费总额、平均每单金额；**没有订单的客户也要显示，数值显示 0**。
> 提示：`LEFT JOIN` + `COUNT(o.order_id)` + `IFNULL(SUM(...),0)`；平均每单 = 总额/订单数，注意除零。

**题 12**　找出"买了 2 种以上不同商品"的订单，显示订单编号、商品种数、金额，按金额降序。
> 提示：`GROUP BY 订单` + `HAVING COUNT(*) >= 2`。

<details>
<summary>点开看第 12 题参考答案</summary>

```sql
SELECT o.order_no AS 订单编号,
       COUNT(*)   AS 商品种数,
       ROUND(SUM(i.quantity * i.unit_price), 2) AS 金额
FROM order_item i
JOIN orders o ON o.order_id = i.order_id
GROUP BY o.order_id, o.order_no
HAVING COUNT(*) >= 2
ORDER BY 金额 DESC;
```

```txt
+----------------+----------+---------+
| 订单编号       | 商品种数 | 金额    |
+----------------+----------+---------+
| SO202405090011 |        2 | 7397.00 |
| SO202403150006 |        2 | 6198.00 |
| SO202402110003 |        2 | 3196.00 |
| SO202406110014 |        2 | 2958.90 |
| SO202406030013 |        2 |  243.00 |
| SO202403280007 |        2 |  218.80 |
| SO202401080002 |        2 |  218.00 |
+----------------+----------+---------+
```
</details>

## 17.3 子查询与窗口函数（第 7～8 章水平）

**题 13**　查出价格高于"全店平均价"的商品（用标量子查询）。
> 提示：`WHERE price > (SELECT AVG(price) FROM product)`。

**题 14**　查出每笔订单里"单价最高"的那件商品（订单编号、商品名、单价）。
> 提示：用 `ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY unit_price DESC)` 取 `rn = 1`，
> 或者用相关子查询。注意外层过滤要在派生表外面做。

**题 15**　找出消费金额前 3 名的客户，并算出他们的消费额占总额的百分比。
> 提示：先聚合出每人金额，再除以 `(SELECT SUM(total_amount) FROM orders)`。

**题 16**　给张伟（customer_id = 1）的订单按时间编号（第几单），并计算累计消费。
> 提示：`ROW_NUMBER() OVER (ORDER BY order_time)` + `SUM(...) OVER (ORDER BY order_time)`。

**题 17**　算出每个月（排除已取消订单）的销售额，以及与上个月的环比增减。
> 提示：先按月聚合，再用 `LAG(金额) OVER (ORDER BY 月份)`。

## 17.4 综合报表（把前面所有知识合起来）

**题 18**　做一张"客户价值报表"，字段：客户、城市、会员等级、订单数、消费总额、价值分档（≥10000 高价值 / ≥3000 中价值 / 其他低价值）、消费占比百分比。
要求：**没有订单的客户也要出现**（订单数 0、占比 0.00%），按消费总额降序。
> 提示：`LEFT JOIN` + `CASE WHEN` + 窗口函数算占比（`SUM(SUM(...)) OVER ()`）；
> 注意没有订单的客户 `SUM` 是 NULL，要用 `IFNULL` 兜住。

**题 19**　做一张"商品销售报表"，字段：分类、商品名、单价、销量、销售额，以及该商品销售额在**本分类内**的排名。
要求：**没有卖过的商品也要出现**（销量 0），按分类、排名排列。
> 提示：`product LEFT JOIN order_item`，销量用 `IFNULL(SUM(i.quantity),0)`；
> 分类内排名用 `RANK() OVER (PARTITION BY 分类 ORDER BY 销售额 DESC)`。
> 小提示：在当前练习数据里每件商品都卖出过，所以你不会看到销量 0 的行——
> 但这正是"先写对，再验证"的意义：**用 LEFT JOIN 保证逻辑上不会漏掉未卖出的商品**。

**题 20**（`school` 库）　查出每门课的课程名、参考人数、平均分、最高分、最低分、及格率（百分比，保留 1 位小数）。
> 提示：`score JOIN course` + `GROUP BY`；及格率 = `SUM(CASE WHEN score>=60 THEN 1 ELSE 0 END) / COUNT(*) * 100`。

# 18. 学习路线、面试高频问题与 FAQ

## 18.1 学完这份教程，你的水平画像

- ✅ 能独立装好 MySQL、建库建表、设计合理的数据类型与约束；
- ✅ 能熟练写 `SELECT`（`WHERE` / `GROUP BY` / `HAVING` / `JOIN` / 子查询 / 窗口函数）；
- ✅ 看得懂 `EXPLAIN`，知道索引为什么失效、怎么加索引；
- ✅ 知道事务、隔离级别、锁和死锁是怎么回事；
- ✅ 会做用户授权、备份恢复、慢查询排查。

这已经覆盖了**日常开发 90% 的数据库工作**。

## 18.2 下一步学什么（按优先级）

| 顺序 | 主题 | 为什么要学 |
| --- | --- | --- |
| 1 | **范式与表设计**（1NF/2NF/3NF、反范式、字段设计的坑） | 表设计错了，后面所有优化都是徒劳 |
| 2 | **MVCC 与 InnoDB 内部原理**（undo/redo/binlog、快照读） | 面试必问，也是理解隔离级别的钥匙 |
| 3 | **主从复制与读写分离**（binlog、GTID、半同步） | 生产环境的标准架构 |
| 4 | **在代码里用 MySQL**（JDBC / MyBatis / ORM、连接池、N+1 问题） | 真正落地的环节 |
| 5 | **Redis 缓存**（缓存穿透/击穿/雪崩、缓存与数据库一致性） | 性能优化的第一手段 |
| 6 | **分库分表与中间件**（ShardingSphere、分区表） | 单表上亿行时的选择（能不做就不做） |
| 7 | **MySQL 8 新特性**（窗口函数、CTE、JSON、降序索引、直方图） | 升级收益大 |
| 8 | **备份恢复与高可用**（MHA/MGR/云 RDS） | 生产必备 |

## 18.3 面试高频 20 问（附答题要点）

1. **事务的 ACID 是什么？靠什么实现？** → undo log（原子性）、redo log（持久性）、锁+MVCC（隔离性）。
2. **MySQL 默认隔离级别？RR 怎么避免幻读？** → REPEATABLE READ；快照读靠 MVCC，当前读靠间隙锁。
3. **MVCC 原理？** → 隐藏列（trx_id、roll_pointer）+ undo 版本链 + ReadView 可见性判断。
4. **索引为什么用 B+ 树而不是 B 树/哈希/红黑树？** → 树矮（磁盘 IO 少）、叶子链表支持范围查询、比哈希支持排序与范围。
5. **聚簇索引和二级索引的区别？什么是回表？** → 见 9.1。
6. **最左前缀原则是什么？** → 见 9.3。
7. **什么情况索引会失效？** → 见 9.6（函数、隐式转换、前置 %、OR、不等于等）。
8. **`COUNT(*)` / `COUNT(1)` / `COUNT(列)` 的区别？** → `COUNT(*)` 与 `COUNT(1)` 统计行数；`COUNT(列)` 跳过 NULL。InnoDB 里三者性能差异可忽略。
9. **`DELETE` / `TRUNCATE` / `DROP` 的区别？** → 见 2.8 表格。
10. **`WHERE` 和 `HAVING` 的区别？** → 见 5.3 表格。
11. **`UNION` 和 `UNION ALL` 的区别？** → 去重与否，性能差异。
12. **`IN` 和 `EXISTS` 怎么选？** → 见 7.2 表格。
13. **深分页为什么慢？怎么优化？** → 见 16.4。
14. **一条 SQL 的执行流程？** → 连接器 → 查询缓存（8.0 已移除）→ 解析器 → 优化器 → 执行器 → 存储引擎。
15. **redo log 和 binlog 的区别？** → 前者 InnoDB 物理日志、循环写、崩溃恢复；后者 Server 层逻辑日志、追加写、主从复制与归档。
16. **两阶段提交是什么？** → redo log 与 binlog 写入的一致性保证（prepare → 写 binlog → commit）。
17. **什么是死锁？怎么排查和避免？** → 见 10.6。
18. **为什么推荐自增主键？** → 顺序插入避免页分裂，二级索引存主键也更小。
19. **大表加字段/加索引会锁表吗？** → 8.0 加列支持 INSTANT（秒级），加索引支持 Online DDL；仍建议低峰执行。
20. **一亿行数据怎么优化查询？** → 索引 → 分区/归档 → 缓存 → 读写分离 → 分库分表（层层递进）。

## 18.4 FAQ：初学者最常问的 12 个问题

**Q1：SQL 要背吗？**
不用背语法细节，要背的是**结构**（SELECT 的书写顺序、执行顺序）和**思路**（要查什么 → 涉及哪些表 → 怎么连接 → 怎么过滤聚合）。具体函数随时查第 14 章速查表。

**Q2：学 MySQL 还是 PostgreSQL？**
先学 MySQL（国内岗位最多、资料最多）。两者 SQL 语法相通，学会一个，另一个一周就能上手。

**Q3：要不要装 Navicat / DBeaver / Workbench？**
建议都装：**命令行练 SQL**（理解力最强），**图形工具看数据**（效率最高）。工具只是工具，别依赖自动生成的 SQL。

**Q4：为什么我的结果顺序和教程不一样？**
没写 `ORDER BY` 时，数据库返回顺序**不做保证**（可能受数据量、索引、缓存影响）。**要确定的顺序就必须显式排序。**

**Q5：中文乱码怎么办？**
三步排查：① `status;` 看 `Client/Server characterset` 是不是 utf8mb4；
② `SHOW CREATE TABLE 表名;` 看表字符集；③ 连接串里指定字符集（`--default-character-set=utf8mb4`）。统一成 utf8mb4 基本就解决了。

**Q6：`SELECT *` 真的不能用吗？**
探索数据时随便用；**写进代码的 SQL 不要用**。原因：表加列会让程序行为悄悄变化、无法用覆盖索引、传输多余数据。

**Q7：为什么不建议用外键？**
这是"互联网派 vs 传统派"的老争论。互联网公司常**在数据库层不建外键**（怕高并发下的锁和级联删除风险），改由应用层保证；而业务系统严谨、并发不高时，外键能帮你挡住脏数据。**初学阶段建议建**——它是最好的"数据正确性老师"。

**Q8：`NULL` 和空字符串 `''` 有什么区别？**
`NULL` = 未知，`''` = 知道但为空。`NULL` 参与比较结果是 `NULL`，要用 `IS NULL`；索引对 `''` 有效但对 `NULL` 的处理有差异。**建表时建议：能 `NOT NULL DEFAULT ''` 就别允许 NULL**（除非业务上真的"未知"）。

**Q9：一条 SQL 最多能多长/多复杂？**
没有硬限制，但**别写 500 行的 SQL**。复杂逻辑拆成 CTE 或临时表，可读性和可优化性都更好。

**Q10：为什么加了索引还是慢？**
常见原因：① 索引没被用上（看 `EXPLAIN` 的 `key` 是不是 `NULL`）；② 用了索引但仍要回表扫大量行；③ 排序/分组产生了 `Using filesort`；④ 数据量太大，扫描行数本来就多。**永远用 `EXPLAIN` 说话。**

**Q11：本地怎么练手最快？**
用本教程的 `00_init_database.sql`，然后**把每一道练习题都换成自己的业务问题**（比如"我的订单表怎么统计复购率"）。有真实问题驱动的学习效率最高。

**Q12：我写的 SQL 会不会把生产库搞挂？**
会，而且很容易。三条底线：**① UPDATE/DELETE 必须有 WHERE 且先用 SELECT 验证；② 大表改结构/删数据要低峰执行并先备份；③ 生产环境永远不要用 root 直连做实验。**

---

## 附录 A：配套文件清单

| 文件 | 内容 |
| --- | --- |
| `mysql-tutorial.md` | 本教程正文 |
| `mysql-practice/00_init_database.sql` | 创建 `shop`（电商）和 `school`（学生成绩）两个练习库 + 全部测试数据 + 行数自检 |
| `mysql-practice/01_basic_queries.sql` | 第 3～5 章动手脚本：增删改、基础查询、函数、分组聚合（每段都有注释和预期结果） |
| `mysql-practice/02_join_and_subquery.sql` | 第 6～8 章动手脚本：多表连接、子查询、窗口函数 |
| `mysql-practice/03_index_and_transaction.sql` | 第 9～10 章动手脚本：索引实验、EXPLAIN、造 10 万行大表、事务与锁的两个窗口实验 |
| `mysql-practice/04_exercises_answers.sql` | 第 17 章 20 道题的参考答案（含思路注释） |
| `mysql-practice/README.md` | 练习素材包的使用说明（导入顺序、常见问题） |
| `mysql-practice/verify/expected-results.mjs` | 教程作者自检脚本：用 Node 内置 SQLite 复算正文里所有"示例输出"（需要 Node 22+，初学者可忽略） |
| `mysql-practice/verify/exercises-check.mjs` | 同上，复算第 17 章 20 道题的答案结果 |
| `mysql-practice/verify/load-data.mjs` | 上面两个自检脚本共用的数据装载模块 |

**推荐学习顺序**：

```txt
① 00_init_database.sql 导入练习库
② 读第 0～2 章，边读边敲（建表、类型、约束）
③ 01_basic_queries.sql 跑一遍 + 读第 3～5 章
④ 02_join_and_subquery.sql 跑一遍 + 读第 6～8 章（重点！）
⑤ 03_index_and_transaction.sql 跑一遍 + 读第 9～10 章
⑥ 第 11～13 章按需查阅（视图/权限/备份）
⑦ 做第 17 章的 20 道题，先自己写再看答案
⑧ 收藏第 14～16 章当手册，遇到问题回来查
```

## 附录 B：MySQL 5.7 与 8.0 的主要差异

| 特性 | 5.7 | 8.0 |
| --- | --- | --- |
| 窗口函数 | ❌ | ✅ `ROW_NUMBER()` / `RANK()` / `LAG()` 等 |
| CTE（`WITH`） | ❌ | ✅ 含 `WITH RECURSIVE` |
| 默认字符集 | `latin1`（要手动改 utf8mb4） | **`utf8mb4`**（默认就是） |
| 默认认证插件 | `mysql_native_password` | `caching_sha2_password`（老客户端可能连不上） |
| 默认排序规则 | `utf8mb4_general_ci` | `utf8mb4_0900_ai_ci` |
| 查询缓存 | 有（`query_cache`） | **已移除** |
| JSON 支持 | 基础（`JSON_EXTRACT`） | 增强：`->`/`->>`、JSON_TABLE、部分更新 |
| 降序索引 | 语法接受但被忽略 | ✅ 真正支持 `INDEX (col DESC)` |
| 隐藏索引 | ❌ | ✅ `ALTER TABLE ... ALTER INDEX idx INVISIBLE;` |
| 函数索引 | ❌ | ✅ `INDEX ((LOWER(name)))` |
| 隔离级别变量名 | `tx_isolation` | `transaction_isolation` |
| 复制命令 | `SHOW SLAVE STATUS` | `SHOW REPLICA STATUS`（8.0.22+，旧名仍可用） |
| 主键自增持久化 | 重启后可能"回退"（5.7 的著名坑） | ✅ 8.0 持久化到 redo log |
| 排序规则、直方图统计 | ❌ | ✅ 直方图（`ANALYZE TABLE ... UPDATE HISTOGRAM`） |
| 默认 `sql_mode` | 已含 `ONLY_FULL_GROUP_BY` | 相同，另有 `NO_ZERO_DATE` 等更严格 |

> **结论**：新项目请直接用 **MySQL 8.0**。老项目升级前要重点测试：认证插件、字符集/排序规则变化、`GROUP BY` 行为、
> 以及被移除的特性（如 `\N`、查询缓存相关参数）。

## 附录 C：术语中英对照表

| 中文 | 英文 | 一句话解释 |
| --- | --- | --- |
| 数据库 | Database (Schema) | 表的容器 |
| 表 / 行 / 列 | Table / Row / Column | 二维数据结构 |
| 主键 | Primary Key (PK) | 唯一标识一行 |
| 外键 | Foreign Key (FK) | 指向另一张表的主键 |
| 索引 | Index | 加速查找的数据结构（B+ 树） |
| 聚簇索引 | Clustered Index | 叶子存整行（就是主键索引） |
| 二级索引 | Secondary Index | 叶子存"索引列 + 主键"，需要回表 |
| 回表 | Lookup / Back to table | 用二级索引拿到主键后再查聚簇索引 |
| 覆盖索引 | Covering Index | 查询所需列都在索引里，免回表 |
| 全表扫描 | Full Table Scan | 逐行扫描（`EXPLAIN` 里 `type=ALL`） |
| 执行计划 | Execution Plan | `EXPLAIN` 的输出 |
| 事务 | Transaction | 一组要么全成功要么全失败的操作 |
| 提交 / 回滚 | Commit / Rollback | 确认修改 / 撤销修改 |
| 隔离级别 | Isolation Level | 并发事务之间的可见性规则 |
| 脏读/不可重复读/幻读 | Dirty Read / Non-Repeatable Read / Phantom Read | 三类并发异常 |
| 快照读 | Consistent Read | 普通 `SELECT`，走 MVCC 快照 |
| 当前读 | Locking Read | `FOR UPDATE` 等，读最新已提交并加锁 |
| 间隙锁 | Gap Lock | 锁住索引记录之间的"空隙"，防幻读 |
| 死锁 | Deadlock | 互相等待对方持有的锁 |
| 存储引擎 | Storage Engine | InnoDB（默认）/ MyISAM / Memory |
| 视图 | View | 保存下来的 SELECT |
| 存储过程 | Stored Procedure | 存在数据库里的一段过程化代码 |
| 触发器 | Trigger | 数据变更时自动执行的代码 |
| 分区 | Partition | 把一张大表在物理上切成多块 |
| 主从复制 | Replication | 主库写、从库同步读 |
| 慢查询日志 | Slow Query Log | 记录执行超过阈值的 SQL |

---

## 结语

数据库这门手艺，**看懂 ≠ 会写，会写 ≠ 写对，写对 ≠ 写快**。
这份教程带你走完了前两步，剩下的两步只能靠动手：

1. **把 20 道实战题做完**（第 17 章）；
2. **拿你手头真实业务的数据，写出 10 个分析查询**；
3. **打开慢查询日志，亲手优化一条慢 SQL**。

做到第 3 步的时候，你就已经是能独当一面的 MySQL 使用者了。加油！🚀
