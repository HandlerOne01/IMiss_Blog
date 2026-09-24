---
title: "MySQL常用命令"
published: 2026-05-27 14:54:11
description: "输入后会提示你输入密码。"
category: "MySQL"
tags: ["MySQL"]
lang: "zh_CN"
draft: false
comment: true
---

### 1. 登录与退出（在终端/命令行中执行）

- **登录 MySQL：**

    ```bash
    mysql -u root -p
    ```

    _输入后会提示你输入密码。_

- **连接远程数据库：**

    ```bash
    mysql -h 主机IP地址 -P 端口号 -u 用户名 -p
    ```

- **退出 MySQL 命令行：**

    ```sql
    exit;
    -- 或者使用 quit;
    ```

### 2. 数据库操作 (Database)

- **查看所有数据库：**
    ```bash
    SHOW DATABASES;
    ```

- **创建数据库：**
    ```sql
    CREATE DATABASE 数据库名;
    -- 推荐指定字符集以支持多语言和 Emoji：
    CREATE DATABASE 数据库名 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    ```

- **切换/选择数据库：**

    ```sql
    USE 数据库名;
    ```

- **查看当前正在使用的数据库：**
    ```sql
    SELECT DATABASE();
    ```

- **删除数据库（极其危险的操作，请谨慎）：**

    ```sql
    DROP DATABASE 数据库名;
    ```

### 3. 数据表操作 (Table)

- **查看当前数据库中的所有表：**
    ```sql
    SHOW TABLES;
    ```

- **创建数据表：**

    ```sql
    CREATE TABLE 表名 (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        age INT,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    ```

- **查看表结构（字段信息）：**
    ```sql
    DESC 表名;
    -- 或者 DESCRIBE 表名;
    ```

- **查看建表语句：**
    ```sql
    SHOW CREATE TABLE 表名;
    ```

- **删除数据表：**

    ```sql
    DROP TABLE 表名;
    ```

- **修改表结构（添加、删除、修改列）：**
    ```sql
    -- 添加一列：
    ALTER TABLE 表名 ADD 列名 数据类型;
    -- 删除一列：
    ALTER TABLE 表名 DROP 列名;
    -- 修改列的数据类型：
    ALTER TABLE 表名 MODIFY 列名 新数据类型;
    -- 重命名列：
    ALTER TABLE 表名 CHANGE 旧列名 新列名 数据类型;
    ```

### 4. 数据操作 - 增删改查 (CRUD)

- **新增数据 (Insert)：**
    ```sql
    INSERT INTO 表名 (列1, 列2) VALUES (值1, 值2);
    -- 插入多条：
    INSERT INTO 表名 (列1, 列2) VALUES (值1, 值2), (值3, 值4);
    ```

- **查询数据 (Select)：**
    ```sql
    -- 查询所有数据（生产环境中慎用 *）：
    SELECT * FROM 表名;
    -- 条件查询：
    SELECT 列1, 列2 FROM 表名 WHERE 条件;
    -- 排序查询 (DESC降序，ASC升序)：
    SELECT * FROM 表名 ORDER BY 列名 DESC;
    -- 分页/限制条数查询：
    SELECT * FROM 表名 LIMIT 10;          -- 取前10条
    SELECT * FROM 表名 LIMIT 10 OFFSET 20; -- 跳过20条，取10条
    ```

- **修改数据 (Update)：**
    ```sql
    UPDATE 表名 SET 列1 = 新值, 列2 = 新值 WHERE 条件;
    -- 注意：如果不加 WHERE 条件，会更新整张表的所有数据！
    ```

- **删除数据 (Delete)：**
    ```sql
    DELETE FROM 表名 WHERE 条件;
    -- 注意：如果不加 WHERE 条件，会删除表中所有数据！
    
    -- 清空整张表（重置自增ID，速度比 DELETE 快）：
    TRUNCATE TABLE 表名;
    ```

### 5. 用户与权限管理

- **创建新用户：**
    ```sql
    CREATE USER '用户名'@'主机名' IDENTIFIED BY '密码';
    -- 允许在任何主机登录：主机名使用 '%'
    ```

- **授权（给用户分配权限）：**
    ```sql
    GRANT ALL PRIVILEGES ON 数据库名.* TO '用户名'@'主机名';
    -- 刷新权限，使其立即生效：
    FLUSH PRIVILEGES;
    ```

- **查看用户权限：**
    ```sql
    SHOW GRANTS FOR '用户名'@'主机名';
    ```

- **撤销权限：**
    ```sql
    REVOKE ALL PRIVILEGES ON 数据库名.* FROM '用户名'@'主机名';
    ```

### 6. 数据导入与导出（在终端/命令行中执行）

- **导出整个数据库（备份）：**
    ```bash
    mysqldump -u 用户名 -p 数据库名 > backup.sql
    ```

- **导入 SQL 文件（恢复）：**
    ```bash
    mysql -u 用户名 -p 数据库名 < backup.sql
    ```

    _或者在 MySQL 命令行内执行：_
    ```sql
    source /文件路径/backup.sql;
    ```
