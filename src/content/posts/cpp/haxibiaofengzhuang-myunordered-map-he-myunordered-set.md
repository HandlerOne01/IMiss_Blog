---
title: "哈希表封装myunordered_map和myunordered_set"
published: 2025-12-28 16:29:04
description: "SGI-STL30版本没有unorderedmap和unorderedset，但实现了hashmap和hashset作为非标准容器。其核心框架如下："
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. 源码及框架分析

SGI-STL30版本没有unordered_map和unordered_set，但实现了hash_map和hash_set作为非标准容器。其核心框架如下：

## 1.1 hash_set和hash_map的源码结构
```cpp
// stl_hash_set
template <class Value, class HashFcn = hash<Value>,
          class EqualKey = equal_to<Value>,
          class Alloc = alloc>
class hash_set
{
private:
    typedef hashtable<Value, Value, HashFcn, identity<Value>,
                      EqualKey, Alloc> ht;
    ht rep;
    // ... 其他成员
};

// stl_hash_map
template <class Key, class T, class HashFcn = hash<Key>,
          class EqualKey = equal_to<Key>,
          class Alloc = alloc>
class hash_map
{
private:
    typedef hashtable<pair<const Key, T>, Key, HashFcn,
                      select1st<pair<const Key, T>>, EqualKey, Alloc> ht;
    ht rep;
    // ... 其他成员
};
```

## 1.2 hashtable结构
```cpp
// stl_hashtable.h
template <class Value, class Key, class HashFcn,
          class ExtractKey, class EqualKey,
          class Alloc>
class hashtable {
public:
    typedef Key key_type;
    typedef Value value_type;
    typedef HashFcn hasher;
    typedef EqualKey key_equal;
    
private:
    hasher hash;
    key_equal equals;
    ExtractKey get_key;
    typedef __hashtable_node<Value> node;
    
    vector<node*, Alloc> buckets;
    size_type num_elements;
    
public:
    // ... 迭代器和成员函数
};
```

## 1.3 节点结构
```cpp
template <class Value>
struct __hashtable_node
{
    __hashtable_node* next;
    Value val;
};
```

# 2. 模拟实现unordered_map和unordered_set

## 2.1 实现复用哈希表的框架
```cpp
// HashFunc.h - 哈希函数
template<class K>
struct HashFunc
{
    size_t operator()(const K& key)
    {
        return (size_t)key;
    }
};

// 特化string版本
template<>
struct HashFunc<string>
{
    size_t operator()(const string& key)
    {
        size_t hash = 0;
        for(auto e : key)
        {
            hash *= 131;
            hash += e;
        }
        return hash;
    }
};

// HashTable.h
namespace hash_bucket
{
    template<class T>
    struct HashNode
    {
        T _data;
        HashNode<T>* _next;
        
        HashNode(const T& data)
            : _data(data)
            , _next(nullptr)
        {}
    };
    
    // 哈希表类
    template<class K, class T, class KeyOfT, class Hash>
    class HashTable
    {
        typedef HashNode<T> Node;
        
    public:
        // ... 成员函数
        
    private:
        vector<Node*> _tables;  // 指针数组
        size_t _n = 0;          // 存储的数据个数
    };
}
```

## 2.2 实现迭代器
```cpp
// HashTable.h - 迭代器实现
template<class K, class T, class Ptr, class Ref, class KeyOfT, class Hash>
struct HTIterator
{
    typedef HashNode<T> Node;
    typedef HTIterator<K, T, Ptr, Ref, KeyOfT, Hash> Self;
    
    Node* _node;
    const HashTable<K, T, KeyOfT, Hash>* _pht;
    
    HTIterator(Node* node, const HashTable<K, T, KeyOfT, Hash>* pht)
        : _node(node)
        , _pht(pht)
    {}
    
    Ref operator*()
    {
        return _node->_data;
    }
    
    Ptr operator->()
    {
        return &_node->_data;
    }
    
    bool operator!=(const Self& s)
    {
        return _node != s._node;
    }
    
    Self& operator++()
    {
        if(_node->_next)
        {
            // 当前桶还有节点
            _node = _node->_next;
        }
        else
        {
            // 当前桶走完了，找下一个不为空的桶
            KeyOfT kot;
            Hash hs;
            size_t hashi = hs(kot(_node->_data)) % _pht->_tables.size();
            ++hashi;
            
            while(hashi < _pht->_tables.size())
            {
                if(_pht->_tables[hashi])
                {
                    _node = _pht->_tables[hashi];
                    return *this;
                }
                ++hashi;
            }
            
            _node = nullptr;  // 结束
        }
        return *this;
    }
};
```

## 2.3 完整的实现代码

### 2.3.1 HashTable.h（完整版）
```cpp
#pragma once
#include <vector>
#include <algorithm>
#include <iostream>
using namespace std;

// 哈希函数
template<class K>
struct HashFunc
{
    size_t operator()(const K& key)
    {
        return (size_t)key;
    }
};

// 特化string版本
template<>
struct HashFunc<string>
{
    size_t operator()(const string& key)
    {
        size_t hash = 0;
        for(auto e : key)
        {
            hash *= 131;
            hash += e;
        }
        return hash;
    }
};

namespace hash_bucket
{
    template<class T>
    struct HashNode
    {
        T _data;
        HashNode<T>* _next;
        
        HashNode(const T& data)
            : _data(data)
            , _next(nullptr)
        {}
    };
    
    // 前置声明
    template<class K, class T, class KeyOfT, class Hash>
    class HashTable;
    
    // 迭代器
    template<class K, class T, class Ptr, class Ref, class KeyOfT, class Hash>
    struct HTIterator
    {
        typedef HashNode<T> Node;
        typedef HTIterator<K, T, Ptr, Ref, KeyOfT, Hash> Self;
        
        Node* _node;
        const HashTable<K, T, KeyOfT, Hash>* _pht;
        
        HTIterator(Node* node, const HashTable<K, T, KeyOfT, Hash>* pht)
            : _node(node)
            , _pht(pht)
        {}
        
        Ref operator*()
        {
            return _node->_data;
        }
        
        Ptr operator->()
        {
            return &_node->_data;
        }
        
        bool operator!=(const Self& s)
        {
            return _node != s._node;
        }
        
        Self& operator++()
        {
            if(_node->_next)
            {
                _node = _node->_next;
            }
            else
            {
                KeyOfT kot;
                Hash hs;
                size_t hashi = hs(kot(_node->_data)) % _pht->_tables.size();
                ++hashi;
                
                while(hashi < _pht->_tables.size())
                {
                    if(_pht->_tables[hashi])
                    {
                        _node = _pht->_tables[hashi];
                        return *this;
                    }
                    ++hashi;
                }
                
                _node = nullptr;
            }
            return *this;
        }
    };
    
    template<class K, class T, class KeyOfT, class Hash>
    class HashTable
    {
        // 友元声明
        template<class K, class T, class Ptr, class Ref, class KeyOfT, class Hash>
        friend struct HTIterator;
        
        typedef HashNode<T> Node;
        
    public:
        typedef HTIterator<K, T, T*, T&, KeyOfT, Hash> Iterator;
        typedef HTIterator<K, T, const T*, const T&, KeyOfT, Hash> ConstIterator;
        
        Iterator Begin()
        {
            if(_n == 0)
                return End();
                
            for(size_t i = 0; i < _tables.size(); i++)
            {
                Node* cur = _tables[i];
                if(cur)
                {
                    return Iterator(cur, this);
                }
            }
            return End();
        }
        
        Iterator End()
        {
            return Iterator(nullptr, this);
        }
        
        ConstIterator Begin() const
        {
            if(_n == 0)
                return End();
                
            for(size_t i = 0; i < _tables.size(); i++)
            {
                Node* cur = _tables[i];
                if(cur)
                {
                    return ConstIterator(cur, this);
                }
            }
            return End();
        }
        
        ConstIterator End() const
        {
            return ConstIterator(nullptr, this);
        }
        
        // 获取下一个素数（用于扩容）
        inline unsigned long __stl_next_prime(unsigned long n)
        {
            static const int __stl_num_primes = 28;
            static const unsigned long __stl_prime_list[__stl_num_primes] =
            {
                53, 97, 193, 389, 769,
                1543, 3079, 6151, 12289, 24593,
                49157, 98317, 196613, 393241, 786433,
                1572869, 3145739, 6291469, 12582917, 25165843,
                50331653, 100663319, 201326611, 402653189, 805306457,
                1610612741, 3221225473, 4294967291
            };
            
            const unsigned long* first = __stl_prime_list;
            const unsigned long* last = __stl_prime_list + __stl_num_primes;
            const unsigned long* pos = lower_bound(first, last, n);
            return pos == last ? *(last - 1) : *pos;
        }
        
        HashTable()
        {
            _tables.resize(__stl_next_prime(0), nullptr);
        }
        
        ~HashTable()
        {
            for(size_t i = 0; i < _tables.size(); i++)
            {
                Node* cur = _tables[i];
                while(cur)
                {
                    Node* next = cur->_next;
                    delete cur;
                    cur = next;
                }
                _tables[i] = nullptr;
            }
        }
        
        pair<Iterator, bool> Insert(const T& data)
        {
            KeyOfT kot;
            Iterator it = Find(kot(data));
            if(it != End())
                return make_pair(it, false);
                
            Hash hs;
            
            // 负载因子 == 1 时扩容
            if(_n == _tables.size())
            {
                vector<Node*> newtables(__stl_next_prime(_tables.size()), nullptr);
                for(size_t i = 0; i < _tables.size(); i++)
                {
                    Node* cur = _tables[i];
                    while(cur)
                    {
                        Node* next = cur->_next;
                        
                        // 重新计算哈希值
                        size_t hashi = hs(kot(cur->_data)) % newtables.size();
                        cur->_next = newtables[hashi];
                        newtables[hashi] = cur;
                        
                        cur = next;
                    }
                    _tables[i] = nullptr;
                }
                _tables.swap(newtables);
            }
            
            size_t hashi = hs(kot(data)) % _tables.size();
            
            // 头插
            Node* newnode = new Node(data);
            newnode->_next = _tables[hashi];
            _tables[hashi] = newnode;
            ++_n;
            
            return make_pair(Iterator(newnode, this), true);
        }
        
        Iterator Find(const K& key)
        {
            if(_tables.size() == 0)
                return End();
                
            KeyOfT kot;
            Hash hs;
            size_t hashi = hs(key) % _tables.size();
            Node* cur = _tables[hashi];
            
            while(cur)
            {
                if(kot(cur->_data) == key)
                {
                    return Iterator(cur, this);
                }
                cur = cur->_next;
            }
            
            return End();
        }
        
        bool Erase(const K& key)
        {
            KeyOfT kot;
            Hash hs;
            
            size_t hashi = hs(key) % _tables.size();
            Node* prev = nullptr;
            Node* cur = _tables[hashi];
            
            while(cur)
            {
                if(kot(cur->_data) == key)
                {
                    if(prev == nullptr)
                    {
                        _tables[hashi] = cur->_next;
                    }
                    else
                    {
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
        size_t _n = 0;
    };
}
```
#### 注释版
```cpp
#pragma once
#include <vector>
#include <algorithm>
#include <iostream>
using namespace std;

// 哈希函数模板 - 将任意类型转换为size_t
template<class K>
struct HashFunc
{
    size_t operator()(const K& key)
    {
        return (size_t)key;  // 默认强制类型转换，适用于整型
    }
};

// 特化string版本 - 采用BKDR哈希算法
template<>
struct HashFunc<string>
{
    size_t operator()(const string& key)
    {
        size_t hash = 0;
        for(auto e : key)
        {
            hash *= 131;      // 31, 131, 1313, 13131, 131313等素数
            hash += e;        // 累加字符ASCII值
        }
        return hash;          // 返回哈希值
    }
};

namespace hash_bucket
{
    // 哈希节点模板 - 链式地址法中的节点
    template<class T>
    struct HashNode
    {
        T _data;              // 存储的数据（T可能是K或pair<K,V>）
        HashNode<T>* _next;   // 指向下一个节点的指针
        
        HashNode(const T& data)
            : _data(data)
            , _next(nullptr)
        {}
    };
    
    // 前置声明哈希表类（供迭代器使用）
    template<class K, class T, class KeyOfT, class Hash>
    class HashTable;
    
    // 哈希表迭代器模板
    template<class K, class T, class Ptr, class Ref, class KeyOfT, class Hash>
    struct HTIterator
    {
        typedef HashNode<T> Node;
        typedef HTIterator<K, T, Ptr, Ref, KeyOfT, Hash> Self;
        
        Node* _node;          // 当前节点指针
        const HashTable<K, T, KeyOfT, Hash>* _pht;  // 指向所属哈希表的指针
        
        // 构造函数
        HTIterator(Node* node, const HashTable<K, T, KeyOfT, Hash>* pht)
            : _node(node)
            , _pht(pht)
        {}
        
        // 解引用操作符 - 返回数据的引用
        Ref operator*()
        {
            return _node->_data;
        }
        
        // 箭头操作符 - 返回数据的指针
        Ptr operator->()
        {
            return &_node->_data;
        }
        
        // 不等比较操作符
        bool operator!=(const Self& s)
        {
            return _node != s._node;
        }
        
        // 前置++操作符 - 核心难点：处理桶间跳转
        Self& operator++()
        {
            if(_node->_next)  // 当前桶还有后续节点
            {
                _node = _node->_next;
            }
            else              // 当前桶已遍历完
            {
                KeyOfT kot;   // 提取key的仿函数
                Hash hs;      // 哈希函数对象
                // 计算当前节点在哈希表中的桶位置
                size_t hashi = hs(kot(_node->_data)) % _pht->_tables.size();
                ++hashi;      // 从下一个桶开始查找
                
                // 查找下一个非空桶
                while(hashi < _pht->_tables.size())
                {
                    if(_pht->_tables[hashi])  // 找到非空桶
                    {
                        _node = _pht->_tables[hashi];
                        return *this;
                    }
                    ++hashi;
                }
                
                _node = nullptr;  // 已遍历完所有桶，到达end()
            }
            return *this;
        }
    };
    
    // 哈希表模板类
    template<class K, class T, class KeyOfT, class Hash>
    class HashTable
    {
        // 声明迭代器为友元类，允许访问私有成员
        template<class K, class T, class Ptr, class Ref, class KeyOfT, class Hash>
        friend struct HTIterator;
        
        typedef HashNode<T> Node;
        
    public:
        // 迭代器类型定义
        typedef HTIterator<K, T, T*, T&, KeyOfT, Hash> Iterator;
        typedef HTIterator<K, T, const T*, const T&, KeyOfT, Hash> ConstIterator;
        
        // 返回指向第一个元素的迭代器
        Iterator Begin()
        {
            if(_n == 0)  // 哈希表为空
                return End();
                
            // 找到第一个非空桶
            for(size_t i = 0; i < _tables.size(); i++)
            {
                Node* cur = _tables[i];
                if(cur)
                {
                    return Iterator(cur, this);
                }
            }
            return End();
        }
        
        // 返回尾后迭代器
        Iterator End()
        {
            return Iterator(nullptr, this);
        }
        
        // const版本的Begin()
        ConstIterator Begin() const
        {
            if(_n == 0)
                return End();
                
            for(size_t i = 0; i < _tables.size(); i++)
            {
                Node* cur = _tables[i];
                if(cur)
                {
                    return ConstIterator(cur, this);
                }
            }
            return End();
        }
        
        // const版本的End()
        ConstIterator End() const
        {
            return ConstIterator(nullptr, this);
        }
        
        // 获取下一个素数 - 用于确定桶的数量（减少哈希冲突）
        inline unsigned long __stl_next_prime(unsigned long n)
        {
            // 28个素数序列（STL中的经典实现）
            static const int __stl_num_primes = 28;
            static const unsigned long __stl_prime_list[__stl_num_primes] =
            {
                53, 97, 193, 389, 769,
                1543, 3079, 6151, 12289, 24593,
                49157, 98317, 196613, 393241, 786433,
                1572869, 3145739, 6291469, 12582917, 25165843,
                50331653, 100663319, 201326611, 402653189, 805306457,
                1610612741, 3221225473, 4294967291
            };
            
            const unsigned long* first = __stl_prime_list;
            const unsigned long* last = __stl_prime_list + __stl_num_primes;
            // 使用二分查找找到大于等于n的最小素数
            const unsigned long* pos = lower_bound(first, last, n);
            return pos == last ? *(last - 1) : *pos;  // 找不到则返回最大素数
        }
        
        // 构造函数 - 初始化哈希表大小为首个素数
        HashTable()
        {
            _tables.resize(__stl_next_prime(0), nullptr);
        }
        
        // 析构函数 - 释放所有节点内存
        ~HashTable()
        {
            for(size_t i = 0; i < _tables.size(); i++)
            {
                Node* cur = _tables[i];
                while(cur)
                {
                    Node* next = cur->_next;
                    delete cur;      // 释放节点
                    cur = next;
                }
                _tables[i] = nullptr;  // 清空桶指针
            }
        }
        
        // 插入元素 - 返回pair<迭代器, 是否成功>
        pair<Iterator, bool> Insert(const T& data)
        {
            KeyOfT kot;  // 提取key的仿函数
            // 先查找是否已存在相同key
            Iterator it = Find(kot(data));
            if(it != End())
                return make_pair(it, false);  // 已存在，插入失败
                
            Hash hs;  // 哈希函数
            
            // 扩容机制：负载因子达到1时扩容（STL标准）
            if(_n == _tables.size())
            {
                // 创建新表，大小为下一个素数
                vector<Node*> newtables(__stl_next_prime(_tables.size()), nullptr);
                // 重新哈希所有元素
                for(size_t i = 0; i < _tables.size(); i++)
                {
                    Node* cur = _tables[i];
                    while(cur)
                    {
                        Node* next = cur->_next;
                        
                        // 在新表中重新计算哈希值
                        size_t hashi = hs(kot(cur->_data)) % newtables.size();
                        // 头插到新桶中
                        cur->_next = newtables[hashi];
                        newtables[hashi] = cur;
                        
                        cur = next;
                    }
                    _tables[i] = nullptr;  // 清空旧桶
                }
                _tables.swap(newtables);  // 交换新旧表
            }
            
            // 计算插入位置
            size_t hashi = hs(kot(data)) % _tables.size();
            
            // 头插法插入新节点
            Node* newnode = new Node(data);
            newnode->_next = _tables[hashi];
            _tables[hashi] = newnode;
            ++_n;  // 更新元素计数
            
            return make_pair(Iterator(newnode, this), true);
        }
        
        // 查找元素
        Iterator Find(const K& key)
        {
            if(_tables.size() == 0)  // 哈希表为空
                return End();
                
            KeyOfT kot;
            Hash hs;
            // 计算key所在的桶
            size_t hashi = hs(key) % _tables.size();
            Node* cur = _tables[hashi];
            
            // 在链表中顺序查找
            while(cur)
            {
                if(kot(cur->_data) == key)  // 找到匹配的key
                {
                    return Iterator(cur, this);
                }
                cur = cur->_next;
            }
            
            return End();  // 未找到
        }
        
        // 删除元素
        bool Erase(const K& key)
        {
            KeyOfT kot;
            Hash hs;
            
            size_t hashi = hs(key) % _tables.size();
            Node* prev = nullptr;  // 前驱节点指针
            Node* cur = _tables[hashi];
            
            while(cur)
            {
                if(kot(cur->_data) == key)  // 找到要删除的节点
                {
                    if(prev == nullptr)  // 删除的是头节点
                    {
                        _tables[hashi] = cur->_next;
                    }
                    else  // 删除的是中间或尾部节点
                    {
                        prev->_next = cur->_next;
                    }
                    
                    delete cur;  // 释放节点内存
                    --_n;        // 更新元素计数
                    return true; // 删除成功
                }
                
                prev = cur;
                cur = cur->_next;
            }
            
            return false;  // 未找到要删除的元素
        }
        
    private:
        vector<Node*> _tables;  // 桶数组（每个元素是一个链表头指针）
        size_t _n = 0;          // 哈希表中元素个数
    };
}
```

### 2.3.2 MyUnorderedSet.h
```cpp
#pragma once
#include "HashTable.h"

namespace bit
{
    template<class K, class Hash = HashFunc<K>>
    class unordered_set
    {
        struct SetKeyOfT
        {
            const K& operator()(const K& key)
            {
                return key;
            }
        };
        
    public:
        typedef typename hash_bucket::HashTable<K, const K, SetKeyOfT, Hash>::Iterator iterator;
        typedef typename hash_bucket::HashTable<K, const K, SetKeyOfT, Hash>::ConstIterator const_iterator;
        
        iterator begin()
        {
            return _ht.Begin();
        }
        
        iterator end()
        {
            return _ht.End();
        }
        
        const_iterator begin() const
        {
            return _ht.Begin();
        }
        
        const_iterator end() const
        {
            return _ht.End();
        }
        
        pair<iterator, bool> insert(const K& key)
        {
            return _ht.Insert(key);
        }
        
        iterator find(const K& key)
        {
            return _ht.Find(key);
        }
        
        bool erase(const K& key)
        {
            return _ht.Erase(key);
        }
        
    private:
        hash_bucket::HashTable<K, const K, SetKeyOfT, Hash> _ht;
    };
}
```
#### 注释版
```cpp
#pragma once
#include "HashTable.h"  // 包含底层哈希表实现

namespace bit
{
    // unordered_set模板类 - 基于哈希表实现的无序集合容器
    // K: 集合元素类型（同时作为key），Hash: 哈希函数（默认HashFunc<K>）
    template<class K, class Hash = HashFunc<K>>
    class unordered_set
    {
        // 提取key的仿函数 - 对于unordered_set，元素本身就是key
        struct SetKeyOfT
        {
            const K& operator()(const K& key)
            {
                return key;  // 直接返回元素本身作为key
            }
        };
        
    public:
        // 迭代器类型定义 - 使用底层哈希表的迭代器
        // 注意：存储的是const K，确保集合元素不可修改
        typedef typename hash_bucket::HashTable<K, const K, SetKeyOfT, Hash>::Iterator iterator;
        typedef typename hash_bucket::HashTable<K, const K, SetKeyOfT, Hash>::ConstIterator const_iterator;
        
        // 迭代器接口
        iterator begin() { return _ht.Begin(); }        // 返回指向第一个元素的迭代器
        iterator end() { return _ht.End(); }            // 返回尾后迭代器
        const_iterator begin() const { return _ht.Begin(); }  // const版本
        const_iterator end() const { return _ht.End(); }      // const版本
        
        // 插入元素 - 元素即key
        // 返回值：pair<iterator, bool>，bool表示是否插入成功（元素已存在时返回false）
        pair<iterator, bool> insert(const K& key)
        {
            return _ht.Insert(key);
        }
        
        // 查找元素
        iterator find(const K& key)
        {
            return _ht.Find(key);
        }
        
        // 删除元素
        bool erase(const K& key)
        {
            return _ht.Erase(key);
        }
        
    private:
        // 底层哈希表实例
        // 模板参数说明：
        // K: key类型
        // const K: 存储的数据类型（const确保元素不可修改）
        // SetKeyOfT: 提取key的仿函数
        // Hash: 哈希函数
        hash_bucket::HashTable<K, const K, SetKeyOfT, Hash> _ht;
    };
}
```

### 2.3.3 MyUnorderedMap.h
```cpp
#pragma once
#include "HashTable.h"

namespace bit
{
    template<class K, class V, class Hash = HashFunc<K>>
    class unordered_map
    {
        struct MapKeyOfT
        {
            const K& operator()(const pair<const K, V>& kv)
            {
                return kv.first;
            }
        };
        
    public:
        typedef typename hash_bucket::HashTable<K, pair<const K, V>, MapKeyOfT, Hash>::Iterator iterator;
        typedef typename hash_bucket::HashTable<K, pair<const K, V>, MapKeyOfT, Hash>::ConstIterator const_iterator;
        
        iterator begin()
        {
            return _ht.Begin();
        }
        
        iterator end()
        {
            return _ht.End();
        }
        
        const_iterator begin() const
        {
            return _ht.Begin();
        }
        
        const_iterator end() const
        {
            return _ht.End();
        }
        
        pair<iterator, bool> insert(const pair<K, V>& kv)
        {
            return _ht.Insert(kv);
        }
        
        V& operator[](const K& key)
        {
            pair<iterator, bool> ret = _ht.Insert(make_pair(key, V()));
            return ret.first->second;
        }
        
        iterator find(const K& key)
        {
            return _ht.Find(key);
        }
        
        bool erase(const K& key)
        {
            return _ht.Erase(key);
        }
        
    private:
        hash_bucket::HashTable<K, pair<const K, V>, MapKeyOfT, Hash> _ht;
    };
}
```
#### 注释版
```cpp
#pragma once
#include "HashTable.h"  // 包含底层哈希表实现

namespace bit
{
    // unordered_map模板类 - 基于哈希表的无序映射容器
    // K: 键类型，V: 值类型，Hash: 哈希函数类型（默认为HashFunc<K>）
    template<class K, class V, class Hash = HashFunc<K>>
    class unordered_map
    {
        // 提取键的仿函数 - 从存储的pair<const K, V>中获取key
        struct MapKeyOfT
        {
            // 操作符重载：返回pair中的first（即key）
            const K& operator()(const pair<const K, V>& kv)
            {
                return kv.first;  // 提取key用于哈希计算和比较
            }
        };
        
    public:
        // 迭代器类型定义 - 使用底层哈希表的迭代器
        // 注意：存储的是pair<const K, V>，key为const防止修改
        typedef typename hash_bucket::HashTable<K, pair<const K, V>, MapKeyOfT, Hash>::Iterator iterator;
        typedef typename hash_bucket::HashTable<K, pair<const K, V>, MapKeyOfT, Hash>::ConstIterator const_iterator;
        
        // 迭代器接口
        iterator begin() { return _ht.Begin(); }        // 返回指向第一个元素的迭代器
        iterator end() { return _ht.End(); }            // 返回尾后迭代器
        const_iterator begin() const { return _ht.Begin(); }  // const版本
        const_iterator end() const { return _ht.End(); }      // const版本
        
        // 插入键值对
        // 返回值：pair<iterator, bool>，bool表示是否插入成功（key已存在时返回false）
        pair<iterator, bool> insert(const pair<K, V>& kv)
        {
            return _ht.Insert(kv);  // 委托给底层哈希表
        }
        
        // 下标运算符重载 - unordered_map的关键特性
        // 功能：1. 如果key存在，返回对应value的引用
        //       2. 如果key不存在，插入(key, V())并返回value的引用
        V& operator[](const K& key)
        {
            // 尝试插入(key, 默认构造的V())
            pair<iterator, bool> ret = _ht.Insert(make_pair(key, V()));
            // 返回value的引用（无论新旧插入）
            return ret.first->second;
        }
        
        // 查找元素
        iterator find(const K& key) { return _ht.Find(key); }
        
        // 删除元素
        bool erase(const K& key) { return _ht.Erase(key); }
        
    private:
        // 底层哈希表实例
        // 模板参数说明：
        // K: 键类型
        // pair<const K, V>: 存储的数据类型（const K保证键不可修改）
        // MapKeyOfT: 提取key的仿函数
        // Hash: 哈希函数
        hash_bucket::HashTable<K, pair<const K, V>, MapKeyOfT, Hash> _ht;
    };
}
```

### 测试代码
```cpp
// test.cpp
#include "MyUnorderedSet.h"
#include "MyUnorderedMap.h"

void test_set()
{
    bit::unordered_set<int> s;
    int a[] = {4, 2, 6, 1, 3, 5, 15, 7, 16, 14, 3, 3, 15};
    
    for(auto e : a)
    {
        s.insert(e);
    }
    
    bit::unordered_set<int>::iterator it = s.begin();
    while(it != s.end())
    {
        // *it += 1;  // 错误，set的key不允许修改
        cout << *it << " ";
        ++it;
    }
    cout << endl;
}

void test_map()
{
    bit::unordered_map<string, string> dict;
    dict.insert({"sort", "排序"});
    dict.insert({"left", "左边"});
    dict.insert({"right", "右边"});
    
    dict["left"] = "左边，剩余";
    dict["insert"] = "插入";
    dict["string"];  // 插入默认值
    
    bit::unordered_map<string, string>::iterator it = dict.begin();
    while(it != dict.end())
    {
        // it->first += 'x';  // 错误，key不能修改
        it->second += 'x';    // value可以修改
        cout << it->first << ":" << it->second << endl;
        ++it;
    }
    cout << endl;
}

int main()
{
    test_set();
    test_map();
    return 0;
}
```
