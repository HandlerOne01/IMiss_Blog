---
title: "MySQL中库和表的增删查改操作"
published: 2026-05-25 20:09:30
description: "概念解释：在对数据库对象进行任何操作前，必须通过客户端工具建立与 MySQL Server 的 TCP/IP 或本地 Socket 会话连接。"
category: "MySQL"
tags: ["MySQL"]
lang: "zh_CN"
draft: false
comment: true
---

# 一、 前置准备与服务器管理

## 1.1 客户端连接

- **概念解释**：在对数据库对象进行任何操作前，必须通过客户端工具建立与 MySQL Server 的 TCP/IP 或本地 Socket 会话连接。

- **涉及的核心函数**：`mysql_client_connection`

- **命令原型**：
    ```bash
    # mysql: 启动客户端程序
    # -h (host): 主机，指定连接的服务器IP地址
    # -P (port): 端口，指定连接的端口号
    # -u (user): 用户名
    # -p (password): 密码
    mysql -h [主机IP] -P [端口号] -u [用户名] -p[密码]
    ```

- **功能与参数说明**：

    - `-h 127.0.0.1`：指定连接的数据库服务器 IP。若缺省，默认连接本地。

    - `-P 3306`：指定连接端口号。若缺省，默认连接 3306 端口。

    - `-u` / `-p`：指定用户名和密码。连接成功后会进入 MySQL 交互式终端。

## 1.2 查看连接线程状态

- **函数名**：`show_processlist`

- **命令原型**：
    ```sql
    -- SHOW: 显示 / PROCESSLIST: 进程(线程)列表
    SHOW PROCESSLIST;
    ```

- **功能与参数说明**：

    - 用于输出当前 MySQL 实例中正在执行的所有连接和线程状态（包含 `Id, User, Host, db, Command, Time, State, Info`）。可用于识别非正常用户的入侵连接，或在数据库发生慢查询时快速定位拥塞的 SQL 指令。

# 二、 数据库管理 (Database DDL)

## 2.1 字符集与校验规则

- **概念解释**：

    - **字符集 (Character Set)**：决定数据库采用何种语言编码来存储数据（例如 `utf8` 支持中文）。

    - **校验规则 (Collation)**：决定数据库字符在比对和排序时的规则。

- **笔记**：

    - **查看默认/支持配置**：`show variables like 'character_set_database';` / `show charset;` / `show collation;`

    - **校验规则的实质影响 (以 utf8 为例)**：

        - `utf8_general_ci`：**不区分大小写**。查询 `name='a'` 会同时匹配 `a` 和 `A`；排序时混合排列。

        - `utf8_bin`：**区分大小写**。基于底层二进制值比对。查询 `name='a'` 仅精确匹配 `a`。

## 2.2 数据库 DDL

- **函数名**：`create_database` / `alter_database` / `drop_database`

- **语句原型**：
    ```sql
    -- CREATE (创建) DATABASE (数据库)
    -- IF NOT EXISTS (如果不存在则执行，防止报错)
    -- DEFAULT (默认) CHARACTER SET (字符集) COLLATE (校验规则)
    CREATE DATABASE [IF NOT EXISTS] db_name 
    [DEFAULT] CHARACTER SET charset_name 
    [DEFAULT] COLLATE collation_name;
    
    -- ALTER (修改/改变) DATABASE (数据库)
    -- 通常用来修改字符集 (charset) 和校验规则
    ALTER DATABASE db_name charset=gbk;
    
    -- DROP (丢弃/删除) DATABASE (数据库)
    -- IF EXISTS (如果存在则执行)
    DROP DATABASE [IF EXISTS] db_name;
    ```

- **功能与参数说明**：

    - **防冲突语法**：数据库名字若使用反引号 `` ` `` 包裹，是为了防止其恰好是 MySQL 关键字。

    - **显示创建语句**：`show create database 数据库名;` 返回的建库语句中，`/*!40100 DEFAULT CHARACTER SET ... */` 并非注释，而是条件编译，表示 MySQL 版本 `>= 4.01` 时执行。

    - **删除警告**：执行 Drop 后，对应的数据库文件夹将被彻底级联删除，内部所有表全部销毁。严禁随意执行。

## 2.3 数据库的备份与恢复

- **概念解释**：**mysqldump** 是 MySQL 提供的原生逻辑备份工具，将指定的库/表结构及数据转化为可执行的 SQL 脚本。

- **命令原型**：
    ```bash
    # mysqldump: MySQL提供的数据导出/备份程序
    # 备份整个库 (带 -B 会在脚本中自动包含 CREATE DATABASE 和 USE 语句)
    # ">" 符号表示将输出结果重定向(保存)到指定的文件路径中
    mysqldump -P3306 -u root -p[密码] -B [数据库名] > [存储路径.sql]
    
    # source: 来源/导入，用于执行外部的 SQL 脚本文件
    # 恢复数据库 (需在 MySQL 终端内部执行)
    source [存储路径.sql];
    ```

- **笔记注意事项**：若备份时未携带 `-B` 参数，恢复前必须先手动创建空数据库，并使用 `use` 命令进入数据库后再执行 `source`。

# 三、 库表切换与表结构操作 (Table DDL)

## 3.1 切换工作数据库

- **函数名**：`use_database`

- **语句原型**：
    ```sql
    -- USE (使用/切换到目标数据库)
    USE db_name;
    ```

- **功能与参数说明**：

    - **极其重要的一步**。在对表进行增删改查前，系统必须知道你要操作的是哪个库。`USE` 命令用于切换当前会话上下文，设定目标库为工作区。例如：`use helloworld;`。

## 3.2 创建表与存储引擎底层文件结构

- **笔记**：

    - **表与实体的映射**：开发者针对每一个应用创建一个库，库中创建多个表，用于保存应用中的实体数据。

    - **底层文件存储机制** (建表后在 Data 目录下生成的文件)：

        - **MyISAM 引擎** (生成 3 个文件)：`.frm` (表结构), `.MYD` (表数据), `.MYI` (表索引)。

        - **InnoDB 引擎** (生成 2 个文件)：`.frm` (表结构), `.ibd` (表空间，数据与聚簇索引合一)。

## 3.3 数据表 DDL 与属性查看

- **函数名**：`create_table` / `desc_table` / `alter_table` / `drop_table`

- **语句原型**：
    ```sql
    -- 1. 创建表 (CREATE: 创建, TABLE: 表格)
    CREATE TABLE table_name (
        field1 datatype [comment '注释'],
        field2 datatype
    ) character set [字符集] collate [校验规则] engine [存储引擎];
    
    -- 2. 查看表结构详情 (DESC 或 DESCRIBE: 描述，用于看表有哪些列)
    DESC table_name;
    
    -- 3. 修改表 (ALTER: 修改/改变)
    ALTER TABLE tablename ADD (column datatype) [after 存在列名];            -- ADD: 添加 (用于在表中增加新的列)
    ALTER TABLE tablename MODIFY (column datatype);                          -- MODIFY: 修改 (仅用于修改现有列的数据类型或长度)
    ALTER TABLE tablename CHANGE [旧列名] [新列名] datatype;                 -- CHANGE: 改变 (功能更强，可同时修改列的名字和数据类型)
    ALTER TABLE tablename DROP (column);                                     -- DROP: 丢弃 (删除整个列及列中的数据)
    ALTER TABLE tablename RENAME TO new_tablename;                           -- RENAME TO: 重命名为 (修改整张表的名字)
    
    -- 4. 删除表
    DROP TABLE tbl_name;                                                     -- DROP: 丢弃 (彻底删除整张表)
    ```

- **功能与参数说明**：

    - **DESC**：格式化输出表的各项属性，包含：字段名(Field)、类型(Type)、是否可空(Null)、索引(Key)、默认值(Default) 和 扩展属性(Extra)。

    - **修改区别**：`MODIFY` 只能改类型/长度；`CHANGE` 可以连同列名一起改；`ADD` 新列不会破坏旧数据，默认填入 `NULL`；`DROP` 字段会永久丢失该列所有历史数据。

# 四、 表的数据操作 (DML & DQL)

## 4.1 写入表数据

- **函数名**：`insert_into`

- **概念解释**：**数据操纵语言 (DML)** 的核心指令，用于向已存在的表结构中按行插入具体的业务数据。

- **语句原型**：
    ```sql
    -- INSERT (插入) INTO (到...里面), 即插入数据到某张表
    -- VALUES (值), 后面括号里跟具体的具体数据项
    INSERT INTO table_name (column1, column2, column3) 
    VALUES (value1, value2, value3);
    ```

- **功能与参数说明**：

    - 必须保证 `VALUES` 括号中的数据类型、顺序与前面定义的列名 `(column1, ...)` 一一对应。

    - **结合文本案例**：
        ```sql
        insert into student(id,name,gender) values(1,'张三','男');
        insert into student(id,name,gender) values(2,'李四','女');
        insert into student(id,name,gender) values(3,'王五','男');
        ```

## 4.2 查询表数据

- **函数名**：`select_from`

- **概念解释**：**数据查询语言 (DQL)** 的核心指令，用于遍历表结构，提取并返回满足要求的数据行。

- **语句原型**：
    ```sql
    -- SELECT (选择/查询), "*" 代表所有列
    -- FROM (从...里), 指定去哪张表查询
    -- WHERE (哪里/条件), 相当于过滤条件
    -- ORDER BY (按照...排序)
    SELECT [*/column_names] FROM table_name [WHERE condition] [ORDER BY column_name];
    ```

- **功能与参数说明**：

    - `*` 代表查询并输出表中所有的列。如果指定具体列名，则只返回部分数据。

    - `WHERE` 用于过滤特定的行（结合前文的大小写校验规则，`WHERE name='a'` 的结果会因规则不同而变化）。

    - `ORDER BY` 用于对结果集进行排序。

    - **结合文本案例**：
```sql
//在hobby这列这查找列举出为登山（注意假如登山只是其中之一则不会被查出，要用函数FIND_IN_SET）
mysql> select * from votes where hobby='登山';
+----------+--------+--------+
| username | hobby  | gender |
+----------+--------+--------+
| LiLei    | 登山    |   男   |
+----------+--------+--------+
```

```sql
        -- 查询 student 表中的所有数据
        select * from student;
```
