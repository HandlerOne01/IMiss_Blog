---
title: "哈希表"
published: 2025-12-28 14:52:04
description: "哈希（Hash）又称散列，是一种组织数据的方式。通过哈希函数把关键字Key跟存储位置建立映射关系，查找时通过哈希函数计算出Key存储的位置，实现快速查找。"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 1、哈希概念

### 1.1 什么是哈希

哈希（Hash）又称散列，是一种组织数据的方式。通过哈希函数把关键字Key跟存储位置建立映射关系，查找时通过哈希函数计算出Key存储的位置，实现快速查找。

## 1.2 直接定址法

当关键字的范围比较集中时，直接定址法非常简单高效。

**示例1：统计小写字母**
```cpp
int firstUniqChar(string s) {
    int count[26] = {0};
    
    // 统计次数
    for(auto ch : s) {
        count[ch - 'a']++;
    }
    
    for(size_t i = 0; i < s.size(); ++i) {
        if(count[s[i] - 'a'] == 1)
            return i;
    }
    
    return -1;
}
```

**特点：**
- 关键字直接作为数组下标
- 时间复杂度O(1)的查找
- 适用于关键字范围集中的情况

## 1.3 哈希冲突

当不同关键字映射到同一位置时，发生哈希冲突。这是哈希表设计中的核心问题。

### 1.4 负载因子
```
负载因子α = N / M
```

- N：哈希表中已存储的元素个数
- M：哈希表的大小
- 负载因子越大，冲突概率越高，空间利用率越高
- 负载因子越小，冲突概率越低，空间利用率越低

# 2、哈希函数设计

## 2.1 除法散列法（最常用）
```
h(key) = key % M
```

**注意事项：**
1. M应取质数，避免2的幂或10的幂
2. 如M=16（2⁴），则63%16=15，31%16=15，冲突
3. 实际应用中，Java的HashMap使用2的幂，但通过扰动函数减少冲突

## 2.2 其他哈希函数（了解）

- **乘法散列法**：`h(key) = floor(M × ((A × key) % 1.0))`，A≈0.618
- **全域散列法**：`hₐb(key) = ((a × key + b) % P) % M`，随机选择a、b
- **平方取中法、折叠法**等

# 3、哈希冲突解决方法

## 3.1 开放定址法

所有元素都存储在哈希表中，冲突时按规则寻找下一个空位。

### 3.1.1 线性探测

从冲突位置开始，依次向后探测空位。
**探测公式：**
```
hashi = (hash0 + i) % M, i = 1, 2, 3, ...
```

**缺点：** 容易产生"堆积"现象，冲突会聚集在一起。

### 3.1.2 二次探测

跳跃式探测，减少堆积现象。

**探测公式：**
```
hashi = (hash0 ± i²) % M, i = 1, 2, 3, ...
```

### 3.1.3 双重散列（了解）

使用第二个哈希函数计算偏移量。
```
hashi = (hash0 + i × h₂(key)) % M
```

## 3.2 开放定址法代码实现

### 3.2.1 数据结构定义
```cpp
namespace open_address {
    enum State {
        EXIST,   // 存在数据
        EMPTY,   // 空位置
        DELETE   // 已删除
    };

    template<class K, class V>
    struct HashData {
        pair<K, V> _kv;
        State _state = EMPTY;
    };

    // 哈希函数仿函数
    template<class K>
    struct HashFunc {
        size_t operator()(const K& key) {
            return (size_t)key;
        }
    };

    // string特化版本
    template<>
    struct HashFunc<string> {
        size_t operator()(const string& key) {
            // BKDR哈希算法
            size_t hash = 0;
            for(auto e : key) {
                hash *= 131;  // 质数31、131、1313、13131等
                hash += e;
            }
            return hash;
        }
    };
}
```

### 3.2.2 扩容质数表
```cpp
inline unsigned long __stl_next_prime(unsigned long n) {
    // 28个质数，近似2倍增长
    static const int __stl_num_primes = 28;
    static const unsigned long __stl_prime_list[__stl_num_primes] = {
        53, 97, 193, 389, 769, 1543, 3079, 6151, 12289, 24593,
        49157, 98317, 196613, 393241, 786433, 1572869, 3145739,
        6291469, 12582917, 25165843, 50331653, 100663319,
        201326611, 402653189, 805306457, 1610612741,
        3221225473, 4294967291
    };
    
    const unsigned long* first = __stl_prime_list;
    const unsigned long* last = __stl_prime_list + __stl_num_primes;
    const unsigned long* pos = lower_bound(first, last, n);
    
    return pos == last ? *(last - 1) : *pos;
}
```

### 3.2.3 哈希表类实现
```cpp
template<class K, class V, class Hash = HashFunc<K>>
class HashTable {
public:
    HashTable() {
        _tables.resize(__stl_next_prime(0));
    }

    // 插入元素
    bool Insert(const pair<K, V>& kv) {
        // 1. 如果已存在，返回false
        if(Find(kv.first))
            return false;
        
        // 2. 负载因子检查（大于0.7扩容）
        if(_n * 10 / _tables.size() >= 7) {
            // 创建新哈希表，重新哈希所有元素
            HashTable<K, V, Hash> newHT;
            newHT._tables.resize(__stl_next_prime(_tables.size() + 1));
            
            for(size_t i = 0; i < _tables.size(); i++) {
                if(_tables[i]._state == EXIST) {
                    newHT.Insert(_tables[i]._kv);
                }
            }
            
            // 交换新旧表
            _tables.swap(newHT._tables);
        }
        
        // 3. 计算哈希值
        Hash hash;
        size_t hash0 = hash(kv.first) % _tables.size();
        size_t hashi = hash0;
        size_t i = 1;
        
        // 4. 线性探测找空位
        while(_tables[hashi]._state == EXIST) {
            hashi = (hash0 + i) % _tables.size();
            ++i;
        }
        
        // 5. 插入数据
        _tables[hashi]._kv = kv;
        _tables[hashi]._state = EXIST;
        ++_n;
        
        return true;
    }
    
    // 查找元素
    HashData<K, V>* Find(const K& key) {
        Hash hash;
        size_t hash0 = hash(key) % _tables.size();
        size_t hashi = hash0;
        size_t i = 1;
        
        // 遇到EMPTY停止，DELETE继续查找
        while(_tables[hashi]._state != EMPTY) {
            if(_tables[hashi]._state == EXIST && 
               _tables[hashi]._kv.first == key) {
                return &_tables[hashi];
            }
            
            hashi = (hash0 + i) % _tables.size();
            ++i;
        }
        
        return nullptr;
    }
    
    // 删除元素
    bool Erase(const K& key) {
        HashData<K, V>* ret = Find(key);
        
        if(ret == nullptr) {
            return false;
        } else {
            // 标记为DELETE，不实际删除数据
            ret->_state = DELETE;
            --_n;
            return true;
        }
    }
    
private:
    vector<HashData<K, V>> _tables;
    size_t _n = 0;  // 表中存储的数据个数
};
```

### 3.2.4 开放定址法示例（之后看看删不删）
```
// 示例数据：{19, 30, 5, 36, 13, 20, 21, 12}
// 哈希表大小M=11

// 哈希计算：
// h(19)=8, h(30)=8, h(5)=5, h(36)=3
// h(13)=2, h(20)=9, h(21)=10, h(12)=1

// 最终存储位置：
// 下标: 0  1  2  3  4  5  6  7  8  9  10
// 数据:    12 13 36     5       19 20 21
//                        30
```

## 3.3 链地址法（哈希桶）

### 3.3.1 解决冲突思路

- 哈希表中存储链表头指针
- 冲突的元素链接成链表挂在该位置下
- 也叫拉链法或哈希桶

### 3.3.2 示例(下次修改看插入图片后删除)
```cpp
数据：{19,30,5,36,13,20,21,12,24,96}
M=11

哈希计算：
h(19)=8, h(30)=8, h(5)=5, h(36)=3
h(13)=2, h(20)=9, h(21)=10, h(12)=1
h(24)=2, h(96)=8

存储结构：
0: 
1: 12
2: 13 -> 24
3: 36
4: 
5: 5
6: 
7: 
8: 19 -> 30 -> 96
9: 20
10: 21
```

### 3.3.3 链地址法代码实现

#### 节点结构
```cpp
namespace hash_bucket {
    template<class K, class V>
    struct HashNode {
        pair<K, V> _kv;
        HashNode<K, V>* _next;
        
        HashNode(const pair<K, V>& kv)
            : _kv(kv)
            , _next(nullptr)
        {}
    };
}
```

#### 哈希表类
```cpp
template<class K, class V, class Hash = HashFunc<K>>
class HashTable {
    typedef HashNode<K, V> Node;
    
public:
    HashTable() {
        _tables.resize(__stl_next_prime(0), nullptr);
    }
    
    ~HashTable() {
        // 释放所有节点
        for(size_t i = 0; i < _tables.size(); ++i) {
            Node* cur = _tables[i];
            while(cur) {
                Node* next = cur->_next;
                delete cur;
                cur = next;
            }
            _tables[i] = nullptr;
        }
    }
    
    // 插入元素
    bool Insert(const pair<K, V>& kv) {
        // 1. 检查重复
        if(Find(kv.first))
            return false;
        
        // 2. 负载因子检查（大于1就扩容）
        if(_n == _tables.size()) {
            // 创建新表
            vector<Node*> newTables;
            newTables.resize(__stl_next_prime(_tables.size()), nullptr);
            
            // 重新哈希所有元素
            for(size_t i = 0; i < _tables.size(); ++i) {
                Node* cur = _tables[i];
                while(cur) {
                    Node* next = cur->_next;
                    
                    // 计算在新表中的位置
                    Hash hash;
                    size_t hashi = hash(cur->_kv.first) % newTables.size();
                    
                    // 头插到新表
                    cur->_next = newTables[hashi];
                    newTables[hashi] = cur;
                    
                    cur = next;
                }
                _tables[i] = nullptr;
            }
            
            // 交换新旧表
            _tables.swap(newTables);
        }
        
        // 3. 计算哈希值并插入
        Hash hash;
        size_t hashi = hash(kv.first) % _tables.size();
        
        // 头插法
        Node* newNode = new Node(kv);
        newNode->_next = _tables[hashi];
        _tables[hashi] = newNode;
        ++_n;
        
        return true;
    }
    
    // 查找元素
    Node* Find(const K& key) {
        Hash hash;
        size_t hashi = hash(key) % _tables.size();
        
        Node* cur = _tables[hashi];
        while(cur) {
            if(cur->_kv.first == key)
                return cur;
            cur = cur->_next;
        }
        
        return nullptr;
    }
    
    // 删除元素
    bool Erase(const K& key) {
        Hash hash;
        size_t hashi = hash(key) % _tables.size();
        
        Node* prev = nullptr;
        Node* cur = _tables[hashi];
        
        while(cur) {
            if(cur->_kv.first == key) {
                // 删除节点
                if(prev == nullptr) {
                    // 头节点
                    _tables[hashi] = cur->_next;
                } else {
                    prev->_next = cur->_next;
                }
                
                delete cur;
                --_n;
                return true;
            }
            
            prev = cur;
            cur = cur->_next;
        }
        
        return false;
    }
    
private:
    vector<Node*> _tables;
    size_t _n = 0;  // 存储的有效数据个数
};
```

# 4、两种方法对比

| 链地址法   | 特性        | 开放定址法   |
| ------ | --------- | ------- |
| 表+链表   | **存储方式**  | 所有元素在表中 |
| 可>1    | **负载因子**  | 必须<1    |
| 直接删除节点 | **删除处理**  | 需要状态标记  |
| 较高     | **空间利用**  | 较低（有空洞） |
| 较高     | **实现复杂度** | 较低      |
| 链表长度影响 | **查找效率**  | 受堆积影响   |

# 5、实际应用建议

## 5.1 选择建议

1. **优先链地址法**：实际应用中更常见，处理更灵活
2. **小数据量**：开放定址法实现简单
3. **内存敏感**：链地址法空间利用率更高

## 5.2 极端情况处理

- **链表过长**：Java8的HashMap当链表长度>8时转为红黑树
- **恶意攻击**：使用全域散列法增加随机性
- **扩容优化**：渐进式扩容，避免一次性rehash卡顿

## 5.3 哈希函数选择
```cpp
// 综合哈希函数示例
template<class K>
struct HashFunc {
    // 1. 对于整数类型直接返回
    size_t operator()(const K& key) {
        return (size_t)key;
    }
};

// 2. 字符串常用哈希算法
template<>
struct HashFunc<string> {
    size_t operator()(const string& s) {
        // DJB2哈希算法
        size_t hash = 5381;
        for(char c : s) {
            hash = ((hash << 5) + hash) + c; // hash * 33 + c
        }
        return hash;
    }
};

// 3. 自定义类型需要提供哈希函数
struct MyKey {
    int id;
    string name;
    
    bool operator==(const MyKey& other) const {
        return id == other.id && name == other.name;
    }
};

template<>
struct HashFunc<MyKey> {
    size_t operator()(const MyKey& key) {
        // 组合哈希
        size_t h1 = HashFunc<int>()(key.id);
        size_t h2 = HashFunc<string>()(key.name);
        return h1 ^ (h2 << 1);
    }
};
```

# 6、性能优化技巧

## 6.1 减少冲突

1. 选择好的哈希函数
2. 合理设置哈希表大小（质数）
3. 控制负载因子
## 6.2 提高缓存友好性

1. 开放定址法更紧凑，缓存命中率高
2. 链地址法中可以考虑使用小数组+链表

## 6.3 内存管理

1. 预分配足够空间减少扩容次数
2. 使用内存池管理节点内存

# 7、总结

1. **哈希表核心**：通过哈希函数建立Key到位置的映射
2. **关键问题**：哈希冲突的解决
3. **两种主流方法**：
    - 开放定址法：简单，适合小数据量
    - 链地址法：灵活，实际应用更广泛
4. **设计要点**：
    - 好的哈希函数减少冲突
    - 合理负载因子平衡性能
    - 考虑极端情况处理

哈希表是实现O(1)平均时间复杂度查找的重要数据结构，在实际开发中广泛应用，如数据库索引、缓存系统、编译器符号表等。
