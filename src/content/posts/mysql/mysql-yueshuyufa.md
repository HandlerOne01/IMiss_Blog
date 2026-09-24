---
title: "MySQL约束语法"
published: 2026-05-27 18:27:27
description: "概念解释：在表定义时强制要求某列不得为空，用于从底层保证关键业务数据的完整录入。"
category: "MySQL"
tags: ["MySQL"]
lang: "zh_CN"
draft: false
comment: true
---

# 一、 基础属性与格式约束命令

## 1.1 空属性约束 (NOT NULL)

- **概念解释**：在表定义时强制要求某列不得为空，用于从底层保证关键业务数据的完整录入。

- **笔记**：

    - **声明语法**：在创建表时的字段类型后直接追加 `not null`。

    - **命令示例**：`class_name varchar(20) not null`

    - **测试验证命令**：插入数据时不给定该字段的值或显式给定 `null`，系统会报错拒收。

## 1.2 默认值约束 (DEFAULT)

- **概念解释**：为数据列指定一个常量作为预设值。若用户在 `INSERT` 时未显式提供该列的数据，系统将自动写入此预设常量。

- **笔记**：

    - **声明语法**：在字段定义后追加 `default [具体值]`。

    - **命令示例**：`sex char(2) default '男'`

    - **触发命令**：插入时必须完全省略该列，例如 `insert into tt10(name) values('zhangsan');` （省略了 `sex` 列）。

## 1.3 列描述约束 (COMMENT)

- **概念解释**：虽不具备物理限制，但作为“软约束”将开发者的业务意图以注释形式永久绑定在数据库结构中。

- **笔记**：

    - **声明语法**：在字段定义末尾追加 `comment '[描述文本]'`。

    - **命令示例**：`name varchar(20) not null comment '姓名'`

    - **查看命令**：必须使用 `show create table 表名 \G` 命令才能查阅，普通的 `desc 表名;` 无法显示。

## 1.4 格式化显示约束 (ZEROFILL)

- **概念解释**：显示层面的排版约束。当数值宽度低于设定阈值时，强制在左侧使用 `0` 进行前导补齐。

- **笔记**：

    - **声明语法**：在整型数值定义后追加 `zerofill`。

    - **命令示例**：`a int(5) unsigned zerofill`

    - **修改已有字段命令**：`alter table 表名 change [旧列名] [新列名] int(5) unsigned zerofill;`

# 二、 唯一性与标识约束命令

## 2.1 主键约束 (PRIMARY KEY)

- **概念解释**：保证实体的绝对唯一性。将指定列升级为主键，要求数据既不重复也不为空。

- **笔记**：

    - **单列主键声明语法**：直接在字段后追加 `primary key`。

        - 示例：`id int unsigned primary key`

    - **复合主键声明语法**：在所有字段定义完毕后，单独声明。

        - 示例：`primary key(id, course)`

    - **后期追加主键命令**：`alter table 表名 add primary key(字段列表);`

    - **删除主键命令**：`alter table 表名 drop primary key;`

## 2.2 自增长约束 (AUTO_INCREMENT)

- **概念解释**：交由数据库引擎维护的序列号生成器，通常挂载于主键之上，实现逻辑主键的自动累加。

- **笔记**：

    - **声明语法**：在整数索引列后追加 `auto_increment`。

    - **命令示例**：`id int unsigned primary key auto_increment`

    - **获取最新值命令**：执行 `select last_insert_id();`。

## 2.3 唯一键约束 (UNIQUE KEY)

- **概念解释**：业务层面的去重约束，确保一列或多列的数据在全表中不出现重复值（但对 `null` 免疫）。

- **笔记**：

    - **声明语法**：在字段类型后追加 `unique` 或 `unique key`。

    - **命令示例**：`card_id char(18) unique key comment '身份证'`

# 三、 跨表参照约束命令

## 3.1 外键约束 (FOREIGN KEY)

- **概念解释**：跨越两张表的强制参照规则。要求子表（从表）的某列数据，必须源自父表（主表）的合法范围。

- **笔记**：

    - **声明语法**：在子表的建表语句末尾，显式绑定引用关系。

    - **命令示例**：`foreign key (class_id) references myclass(id)`

    - **触发拦截机制**：当使用 `insert into 子表` 插入一个在主表对应列中查不到的值时，MySQL 底层会直接驳回该操作。
