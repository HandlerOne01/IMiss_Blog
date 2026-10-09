---
title: "C++ 搜索引擎 课程笔记"
published: 2026-07-21 17:26:46
description: "LEVEL — 字符串化运算符，LOG(NORMAL, ...) 展开为 log(\"NORMAL\", ...)，输出 [NORMAL] 而非 [1] FILE 和 LINE — 编译时硬替换，记录调用位置 四个日志等级常量目前未在 log…"
category: "项目梳理"
tags: ["项目实战", "搜索引擎"]
series: "搜索引擎"
seriesOrder: 1
lang: "zh_CN"
draft: false
comment: true
---

> 基于 `search_engine` 项目，从零开始逐模块讲解

---

## 课程总览

```
makefile          ← 构建
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
http_server.cc    ← 接口层（HTTP 服务 / 命令行调试）
debug.cc
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
searcher.hpp      ← 服务层（搜索调度：分词 → 查倒排 → 合并 → 排序 → JSON）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
index.hpp         ← 数据层（正排索引 + 倒排索引，双单例）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
util.hpp          ← 工具层（文件读取 / 字符串切割 / 中文分词）
log.hpp           ← 日志
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
parser.cc         ← 离线预处理（HTML → raw.txt，独立运行）
```

---

## 第一课：`log.hpp` — 日志模块

```cpp
#define NORMAL 1
#define WARNING 2
#define DEBUG 3
#define FATAL 4
#define LOG(LEVEL, MESSAGE) log(#LEVEL, MESSAGE, __FILE__, __LINE__)
void log(std::string level, std::string message, std::string file, int line) {
    std::cout << "[" << level << "]"
              << "[" << time(nullptr) << "]"
              << "[" << message << "]"
              << "[" << file << ": " << line << "]"
              << std::endl;
}
```

- `#LEVEL` — 字符串化运算符，`LOG(NORMAL, ...)` 展开为 `log("NORMAL", ...)`，输出 `[NORMAL]` 而非 `[1]`
- `__FILE__` 和 `__LINE__` — 编译时硬替换，记录调用位置
- 四个日志等级常量目前未在 `log` 函数中使用，预留扩展
- 被所有模块 include

---

## 第二课：`util.hpp` — 工具层

### 2.1 `FileUtil` — 静态工具类

```cpp
static bool ReadFile(const std::string &file_path, std::string *out);
```

- `static` 方法 → 直接 `FileUtil::ReadFile(...)` 调用，无需实例化
- 返回值 `bool` 表示成败，内容通过指针 `*out` 传出
- `getline` 丢弃换行符，读完是一坨无换行的文本
- 函数体写在类内 → 自动 `inline` → header-only 项目能编译

**`inline` 真正的作用：** 告诉链接器"这个函数可能出现在多个 .o 文件里，它们是同一份"。函数体写在类定义里面自动获得此属性。

### 2.2 `StringUtil` — 字符串切割

```cpp
static void Split(const std::string &target, std::vector<std::string> *out, const std::string &sep) {
    boost::split(*out, target, boost::is_any_of(sep), boost::token_compress_on);
}
```

- `boost::token_compress_on` — 压缩连续分隔符，`"a\\3\\3b"` → `["a","b"]` 而非 `["a","","b"]`
- 整个项目中 `index.hpp` 用它按 `\3` 切割 raw.txt 每行

### 2.3 `JiebaUtil` — 单例 + 分词

**单例结构：**

```cpp
class JiebaUtil {
private:
    JiebaUtil() : jieba(五个词典路径) {}           // private 构造函数
    JiebaUtil(const JiebaUtil &) = delete;          // 禁止拷贝
    static JiebaUtil *instance;                     // 静态成员
```

- 构造代价大（加载五本词典到内存），只需一个实例 → 单例模式
- 双重检查锁确保多线程安全：

```cpp
static JiebaUtil *get_instance() {
    static std::mutex mtx;
    if (nullptr == instance) {      // 第一次检查（快车道，避免每次加锁）
        mtx.lock();
        if (nullptr == instance) {  // 第二次检查（正确性，防止等锁期间别人已创建）
            instance = new JiebaUtil();
            instance->InitJiebaUtil();
        }
        mtx.unlock();
    }
    return instance;
}
```

**分词逻辑：**

```cpp
void CutStringHelper(const std::string &src, std::vector<std::string> *out) {
    jieba.CutForSearch(src, *out);       // 搜索模式分词（最大粒度）
    for (auto iter = out->begin(); iter != out->end();) {
        if (stop_words 里有 *iter)
            iter = out->erase(iter);     // 删除停用词
        else
            iter++;
    }
}
```

- `CutForSearch` — 搜索模式，尽可能多切子词提高召回率
- `erase` 返回下一个有效迭代器，直接赋值给 `iter`，不能另写 `iter++`
- `CutString` 为 `public static`，对外隐藏获取实例的细节

**五本词典：**

| 文件 | 作用 |
|------|------|
| `jieba.dict.utf8` | 核心词库，记录词和词频 |
| `hmm_model.utf8` | 隐马尔可夫模型，切分未登录词 |
| `user.dict.utf8` | 用户自定义词典 |
| `idf.utf8` | 逆文档频率，衡量词的重要性 |
| `stop_words.utf8` | 停用词（"的""了""是"这类无意义词） |

---

## 第三课：`index.hpp` — 索引层

### 3.1 数据结构

**`DocInfo`** — 正排索引条目：

```cpp
struct DocInfo {
    std::string title;
    std::string content;
    std::string url;
    uint64_t doc_id;
};
```

正排索引 = `vector<DocInfo>`，下标天然是 doc_id。

**`InvertedElem`** — 倒排元素：

```cpp
struct InvertedElem {
    uint64_t doc_id;
    std::string word;
    int weight;
};
```

**`InvertedList`** = `vector<InvertedElem>`

倒排索引 = `unordered_map<string, InvertedList>`

```
"vector"    → [{doc_id:3, weight:15}, {doc_id:7, weight:8}]
"algorithm" → [{doc_id:7, weight:12}, {doc_id:3, weight:5}]
```

- 倒排负责"搜索"（按关键词找文档），正排负责"展示"（按文档 ID 拿详细信息）

### 3.2 `Index` 单例

与 `JiebaUtil` 同样的单例结构（`private` 构造 + `= delete` 拷贝 + 双重检查锁）。

### 3.3 `BuildIndex` — 建索引入口

```cpp
bool BuildIndex(const std::string &input) {
    while (std::getline(in, line)) {
        DocInfo *doc = BuildForwardIndex(line);
        if (nullptr == doc) continue;          // 格式错误跳过
        BuildInvertedIndex(*doc);
    }
}
```

### 3.4 `BuildForwardIndex` — 建正排

```cpp
ns_util::StringUtil::Split(line, &results, "\3");   // 按分隔符切三段
doc.doc_id = forward_index.size();                   // 当前 size 即新 ID
forward_index.push_back(std::move(doc));             // move 避免拷贝
```

### 3.5 `BuildInvertedIndex` — 建倒排（核心）

1. `JiebaUtil::CutString` 对 title 和 content 分别分词
2. 用 `word_map` 分别统计标题词频和正文词频
3. `boost::to_lower` 统一转小写

**权重公式：**

```
weight = 10 × 标题中出现次数 + 1 × 正文中出现次数
```

标题词的权重是正文词的 10 倍（`#define X 10` `#define Y 1`）。

### 3.6 查询接口

- `GetForwardIndex(doc_id)` → `DocInfo*`：越界检查后返回指针
- `GetInvertedList(word)` → `InvertedList*`：用 `find` 而非 `[]`，避免词不存在时误插入

---

## 第四课：`searcher.hpp` — 搜索调度中心

### 4.1 `InvertedElemPrint` — 搜索中间态

```cpp
struct InvertedElemPrint {
    uint64_t doc_id;
    int weight;
    std::vector<std::string> words;  // 记录被哪些搜索词命中
};
```

与 `InvertedElem` 区别：`words` 是 `vector`，用于合并多个搜索词。

### 4.2 `Search` 完整流程

输入 `"vector algorithm"` → 输出 JSON 字符串：

```
① JiebaUtil::CutString  →  ["vector", "algorithm"]
② 遍历每个词：
     Index::GetInvertedList(word) → 倒排拉链
     tokens_map[doc_id] 合并去重，权重累加
     item.words.push_back(elem.word)  记录命中词
③ 从 map 倒进 vector，std::sort 按 weight 降序
④ 遍历排序结果：
     Index::GetForwardIndex(doc_id) → DocInfo
     GetDesc(content, words[0]) → 摘要
     打包成 JSON: {"title","desc","url","id","weight"}
⑤ Json::FastWriter 序列化输出
```

### 4.3 关键细节

- `tokens_map[elem.doc_id]`：key 不存在时 `operator[]` 自动创建空条目，所以 `item.doc_id = elem.doc_id` 必须写（给首次出现的条目赋 ID）
- `item.weight += elem.weight`：多词命中时权重自动累加
- `item.words.push_back(elem.word)`：记录命中词，供 `GetDesc` 选锚点
- `continue` 兜底：搜索词不存在时跳过，最终返回空 JSON 数组 `[]`

### 4.4 `GetDesc` — 生成摘要

```cpp
auto iter = std::search(content.begin(), content.end(),
    word.begin(), word.end(),
    [](int x, int y) { return std::tolower(x) == std::tolower(y); });
// 找到关键词 → 前后截取 50/100 字节
```

- 不区分大小写匹配
- 纯字节偏移截取，UTF-8 多字节字符可能被切碎

### 4.5 数据流全景

```
raw.txt一行 → DocInfo → 分词 → InvertedElem × N → 插入 inverted_index
                                                ↓
query → 分词 → GetInvertedList → InvertedElemPrint → 排序
    → GetForwardIndex → DocInfo → JSON → 浏览器
```

---

## 第五课：`parser.cc` — 数据清洗流水线

```
main
 ├─ ① EnumFile        → 递归收集所有 .html 文件路径
 ├─ ② ParseHtml       → 逐个文件解析
 │    ├─ ParseTitle    → find("<title>") + substr
 │    ├─ ParseContent  → 状态机去标签
 │    └─ ParseUrl      → 拼 Boost 在线 URL
 └─ ③ SaveHtml        → 写入 raw.txt
```

### 5.1 各函数要点

| 函数 | 关键点 |
|------|--------|
| `EnumFile` | `boost::filesystem::recursive_directory_iterator` 递归遍历，过滤 `.html` |
| `ParseTitle` | `find("<title>")` + `find("</title>")`，`begin += 7` 跳过标签本身 |
| `ParseContent` | **状态机** LABLE/CONTENT 两状态交替去标签；`\n` `\r` 换空格；连续空格合并 |
| `ParseUrl` | 本地路径砍掉 `data/input` 前缀，拼上 `boost.org` 域名 |
| `SaveHtml` | `ios::binary` 二进制写入，保证 `\3` 不被转义 |

### 5.2 状态机详解

```
初始 s = LABLE
LABLE 状态:     读到 '>' → 切换 CONTENT
                其他字符 → 丢弃
CONTENT 状态:   读到 '<' → 切换 LABLE
                其他字符 → 保留（\n \r 换空格，连续空格合并）
```

**注意：** 初始状态为 LABLE，假定文件以 HTML 标签开头。对纯文本文件会吞掉所有内容。

### 5.3 与 index.hpp 的分工

```
parser.cc（离线，跑一次）          index.hpp（在线，启动时跑）
─────────────────────            ──────────────────────
HTML 文件 → raw.txt              raw.txt → 正排 + 倒排
格式: title\3content\3url        Split(\3) 切三段
```

两个 `DocInfo` 定义不同：parser 的少 `doc_id` 字段（doc_id 是建索引时才分配的）。

---

## 第六课：两个入口

### `http_server.cc` — HTTP 搜索服务

```cpp
Searcher search;
search.InitSearcher("data/raw_html/raw.txt");
httplib::Server svr;
svr.set_base_dir("./wwwroot");              // 托管 index.html
svr.Get("/s", [&search](req, rsp) {         // 搜索 API
    string word = req.get_param_value("word");
    search.Search(word, &json_string);
    rsp.set_content(json_string, "application/json");
});
svr.listen("0.0.0.0", 8081);
```

- `set_content(body, content_type)`：第一个参数是 HTTP 响应体，第二个是 Content-Type 头
- `"application/json"` 让浏览器/jQuery 自动按 JSON 解析
- `[&search]`：lambda 以引用捕获 search 对象

### `debug.cc` — 命令行调试

```cpp
while (true) {
    fgets(buffer, ..., stdin);
    search->Search(query, &json_string);
    cout << json_string << endl;
}
```

循环读取键盘输入，直接打印原始 JSON，不需浏览器。

---

## 第七课：`makefile` — 构建系统

```makefile
cc=g++
parser: parser.cc
    $(cc) -o $@ $^ -lboost_system -lboost_filesystem -std=c++11
debug: debug.cc
    $(cc) -o $@ $^ -ljsoncpp -std=c++11
http_server: http_server.cc
    $(cc) -o $@ $^ -ljsoncpp -lpthread -lcpp-httplib -std=c++11
```

| 变量/标记 | 含义 |
|-----------|------|
| `$@` | 目标名（如 `parser`） |
| `$^` | 所有依赖（如 `parser.cc`） |
| `.PHONY` | 伪目标，不与同名文件冲突 |
| `-lboost_system` | 链接 boost::system（filesystem 的依赖） |
| `-lboost_filesystem` | 链接 boost::filesystem |
| `-ljsoncpp` | 链接 jsoncpp |
| `-lpthread` | 链接 pthread（多线程） |
| `-lcpp-httplib` | 链接 cpp-httplib |
| `-std=c++11` | C++11 标准 |

---

## 附录 A：关键 C++ 知识点速查

| 概念 | 出现位置 | 一句话 |
|------|---------|--------|
| `#` 字符串化 | `log.hpp` | `#LEVEL` 把宏参数变成字符串字面量 |
| `__FILE__` `__LINE__` | `log.hpp` | 编译时替换为当前文件名和行号 |
| 隐式 inline | `util.hpp` | 函数体写在类内 → 链接器允许重复定义 |
| `static` 类方法 | `FileUtil` | 直接 `类名::方法()` 调用 |
| `static` 成员变量 | `instance` | 属于类而非对象，类外定义分配空间 |
| `private` 构造函数 | 单例 | 禁止外部构造 |
| `= delete` | 单例 | 禁止拷贝 |
| 双重检查锁 | `get_instance()` | 锁外第一次（性能）+ 锁内第二次（正确性） |
| 状态机 | `ParseContent` | 字符级别遍历，状态决定行为 |
| `std::move` | `push_back` | 转移所有权，避免拷贝 |
| `operator[]` 自动创建 | `inverted_index` | key 不存在时当场建空 value |
| `find` vs `[]` | `GetInvertedList` | `find` 不修改容器，`[]` 会插入 |
| lambda 表达式 | `Search` `GetDesc` | `[捕获](参数){ 函数体 }` |
| `std::search` | `GetDesc` | 带自定义比较函数的子序列查找 |
| `const char *const` | 词典路径 | 双层 const，指针和内容都不可变 |

---

## 附录 B：数据结构转换关系

```
raw.txt一行
   │  StringUtil::Split("\3")
   ▼
 DocInfo {title, content, url, doc_id}
   │  存入 forward_index (vector<DocInfo>)
   │
   │  JiebaUtil::CutString 分词 → boost::to_lower
   ▼
 InvertedElem {doc_id, word, weight}
   │  存入 inverted_index (map<string, vector<InvertedElem>>)
   │
   │  用户搜索时:
   │  GetInvertedList(word) → InvertedList
   ▼
 InvertedElemPrint {doc_id, weight, words}
   │  存入 tokens_map 合并去重
   │  std::sort 降序
   │
   │  GetForwardIndex(doc_id) → DocInfo
   │  GetDesc(content, words[0]) → 摘要
   ▼
 JSON [{title, desc, url, id, weight}, ...]
   │  浏览器 BuildHtml 渲染
   ▼
 搜索结果卡片
```

---

## 附录 C：设计决策汇总

| 决策 | 原因 |
|------|------|
| header-only 架构 | 小项目，省 .cpp 链接负担 |
| 单例（Index / JiebaUtil） | 构造代价大（加载词典/建索引），全局只需一份 |
| 权重 10:1（标题:正文） | 标题词远比正文词重要 |
| 分隔符 `\3`（ASCII ETX） | 不可见字符，极低概率与文档内容冲突 |
| 二进制模式写 raw.txt | 保证 `\3` 不被转义 |
| `CutForSearch` 分词 | 搜索场景需要最大召回率（细粒度切词） |
| `FastWriter` 紧凑 JSON | 省带宽 |
| 状态机初始 `LABLE` | 假设 Boost HTML 以标签开头 |
| 所有路径相对路径 | 必须在项目根目录执行 |
