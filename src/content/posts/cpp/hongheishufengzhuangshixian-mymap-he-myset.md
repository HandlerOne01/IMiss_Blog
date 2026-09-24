---
title: "红黑树封装实现mymap和myset"
published: 2026-02-23 17:48:03
description: "rbtree的泛型设计：通过第二个模板参数Value决定红黑树节点中存储的数据类型 set实例化rbtree时：Value = Key map实例化rbtree时：Value = pair"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

[红黑树](/posts/cpp/hongheishu/)
# 1. 源码及框架分析

## 1.1 STL源代码结构分析
```java
// set
#ifndef __SGI_STL_INTERNAL_TREE_H
#include <stl_tree.h>
#endif
#include <stl_set.h>
#include <stl_multiset.h>

// map
#ifndef __SGI_STL_INTERNAL_TREE_H
#include <stl_tree.h>
#endif
#include <stl_map.h>
#include <stl_multimap.h>
```

## 1.2 set源代码框架
```cpp
// stl_set.h
template <class Key, class Compare = less<Key>, class Alloc = alloc>
class set {
public:
    // typedefs:
    typedef Key key_type;
    typedef Key value_type;  // 注意：set的key_type和value_type相同
private:
    // 使用红黑树作为底层容器
    typedef rb_tree<key_type, value_type, 
                   identity<value_type>, key_compare, Alloc> rep_type;
    rep_type t;  // red-black tree representing set
};
```

## 1.3 map源代码框架
```cpp
// stl_map.h
template <class Key, class T, class Compare = less<Key>, class Alloc = alloc>
class map {
public:
    // typedefs:
    typedef Key key_type;
    typedef T mapped_type;
    typedef pair<const Key, T> value_type;  // 注意：map的value_type是pair
private:
    // 使用红黑树作为底层容器
    typedef rb_tree<key_type, value_type,
                   select1st<value_type>, key_compare, Alloc> rep_type;
    rep_type t;  // red-black tree representing map
};
```

## 1.4 红黑树节点结构
```cpp
// stl_tree.h
struct __rb_tree_node_base {
    typedef __rb_tree_color_type color_type;
    typedef __rb_tree_node_base* base_ptr;
    
    color_type color;  // 节点颜色
    base_ptr parent;   // 父节点
    base_ptr left;     // 左孩子
    base_ptr right;    // 右孩子
};

template <class Value>
struct __rb_tree_node : public __rb_tree_node_base {
    typedef __rb_tree_node<Value>* link_type;
    Value value_field;  // 存储的数据
};
```

## 1.5 红黑树类框架
```cpp
// stl_tree.h
template <class Key, class Value, class KeyofValue, 
          class Compare, class Alloc = alloc>
class rb_tree {
protected:
    typedef void* void_pointer;
    typedef __rb_tree_node_base* base_ptr;
    typedef __rb_tree_node<Value> rb_tree_node;
    typedef rb_tree_node* link_type;
    typedef Key key_type;
    typedef Value value_type;
    
public:
    // insert用的是第二个模板参数做形参
    pair<iterator, bool> insert_unique(const value_type& x);
    
    // erase和find用第一个模板参数做形参
    size_type erase(const key_type& x);
    iterator find(const key_type& x);
    
protected:
    size_type node_count;  // 记录树的大小
    link_type header;      // 头节点（哨兵）
};
```

# 2. 设计思想分析

## 2.1 泛型设计思想

**关键洞察**：
1. **rb_tree的泛型设计**：通过第二个模板参数`Value`决定红黑树节点中存储的数据类型
    - `set`实例化rb_tree时：`Value = Key`
    - `map`实例化rb_tree时：`Value = pair<const Key, T>`

2. **模板参数的作用**：
    - 第一个模板参数`Key`：用于`find`/`erase`等函数的参数类型
    - 第二个模板参数`Value`：节点实际存储的数据类型
    - 第三个模板参数`KeyOfValue`：从`Value`中提取`Key`的仿函数

3. **为什么需要KeyOfValue仿函数**：
    - `map`中`Value = pair<const K, V>`，需要提取`K`进行比较
    - `set`中`Value = K`，直接返回自身即可

# 3. 模拟实现map和set

## 3.1 实现复用红黑树的框架
```cpp
// RBTree.h
enum Colour {
    RED,
    BLACK
};

template<class T>
struct RBTreeNode {
    T _data;  // 存储的数据
    
    RBTreeNode<T>* _left;
    RBTreeNode<T>* _right;
    RBTreeNode<T>* _parent;
    Colour _col;
    
    RBTreeNode(const T& data)
        : _data(data)
        , _left(nullptr)
        , _right(nullptr)
        , _parent(nullptr)
    {}
};
```

## 3.2 红黑树类的实现
```cpp
template<class K, class T, class KeyOfT>
class RBTree {
private:
    typedef RBTreeNode<T> Node;
    Node* _root = nullptr;
    
public:
    bool Insert(const T& data) {
        if (_root == nullptr) {
            _root = new Node(data);
            _root->_col = BLACK;
            return true;
        }
        
        KeyOfT kot;
        Node* parent = nullptr;
        Node* cur = _root;
        while (cur) {
            if (kot(cur->_data) < kot(data)) {
                parent = cur;
                cur = cur->_right;
            }
            else if (kot(cur->_data) > kot(data)) {
                parent = cur;
                cur = cur->_left;
            }
            else {
                return false;  // 已存在，插入失败
            }
        }
        
        cur = new Node(data);
        Node* newnode = cur;
        
        // 新增结点颜色为红色
        cur->_col = RED;
        if (kot(parent->_data) < kot(data)) {
            parent->_right = cur;
        }
        else {
            parent->_left = cur;
        }
        cur->_parent = parent;
        
        // ... 红黑树调整逻辑
        
        return true;
    }
};
```

## 3.3 map的实现
```cpp
// Mymap.h
namespace kiana {
    template<class K, class V>
    class map {
        struct MapKeyOfT {
            const K& operator()(const pair<K, V>& kv) {
                return kv.first;
            }
        };
        
    public:
        bool insert(const pair<K, V>& kv) {
            return _t.Insert(kv);
        }
        
    private:
        RBTree<K, pair<K, V>, MapKeyOfT> _t;
    };
}
```

## 3.4 set的实现
```cpp
// Myset.h
namespace kiana {
    template<class K>
    class set {
        struct SetKeyOfT {
            const K& operator()(const K& key) {
                return key;
            }
        };
        
    public:
        bool insert(const K& key) {
            return _t.Insert(key);
        }
        
    private:
        RBTree<K, K, SetKeyOfT> _t;
    };
}
```

## 4. 迭代器实现

## 4.1 迭代器核心逻辑
```cpp
template<class T, class Ref, class Ptr>
struct RBTreeIterator {
    typedef RBTreeNode<T> Node;
    typedef RBTreeIterator<T, Ref, Ptr> Self;
    
    Node* _node;
    Node* _root;
    
    RBTreeIterator(Node* node, Node* root)
        : _node(node), _root(root) {}
    
    // operator++ 实现中序遍历的下一个节点
    Self& operator++() {
        if (_node->_right) {
            // 右子树不为空，下一个是右子树的最左节点
            Node* leftMost = _node->_right;
            while (leftMost->_left) {
                leftMost = leftMost->_left;
            }
            _node = leftMost;
        }
        else {
            // 右子树为空，向上找第一个孩子是父亲左孩子的祖先
            Node* cur = _node;
            Node* parent = cur->_parent;
            while (parent && cur == parent->_right) {
                cur = parent;
                parent = cur->_parent;
            }
            _node = parent;  // 可能为空（end()）
        }
        return *this;
    }
    
    // operator-- 实现中序遍历的上一个节点
    Self& operator--() {
        if (_node == nullptr) {  // end()
            // --end()，指向最右节点
            Node* rightMost = _root;
            while (rightMost && rightMost->_right) {
                rightMost = rightMost->_right;
            }
            _node = rightMost;
        }
        else if (_node->_left) {
            // 左子树不为空，上一个节点是左子树的最右节点
            Node* rightMost = _node->_left;
            while (rightMost->_right) {
                rightMost = rightMost->_right;
            }
            _node = rightMost;
        }
        else {
            // 向上找第一个孩子是父亲右孩子的祖先
            Node* cur = _node;
            Node* parent = cur->_parent;
            while (parent && cur == parent->_left) {
                cur = parent;
                parent = cur->_parent;
            }
            _node = parent;
        }
        return *this;
    }
    
    Ref operator*() {
        return _node->_data;
    }
    
    Ptr operator->() {
        return &_node->_data;
    }
    
    bool operator!=(const Self& s) const {
        return _node != s._node;
    }
    
    bool operator==(const Self& s) const {
        return _node == s._node;
    }
};
```

## 4.2 红黑树中迭代器相关方法
```cpp
template<class K, class T, class KeyOfT>
class RBTree {
    // ... 其他代码
    
public:
    typedef RBTreeIterator<T, T&, T*> Iterator;
    typedef RBTreeIterator<T, const T&, const T*> ConstIterator;
    
    Iterator Begin() {
        Node* leftMost = _root;
        while (leftMost && leftMost->_left) {
            leftMost = leftMost->_left;
        }
        return Iterator(leftMost, _root);
    }
    
    Iterator End() {
        return Iterator(nullptr, _root);
    }
    
    // ... 其他方法
};
```

## 4.3 map和set中迭代器的封装
```cpp
// map中的迭代器
template<class K, class V>
class map {
    // ... 其他代码
    
public:
    typedef typename RBTree<K, pair<const K, V>, MapKeyOfT>::Iterator iterator;
    typedef typename RBTree<K, pair<const K, V>, MapKeyOfT>::ConstIterator const_iterator;
    
    iterator begin() {
        return _t.Begin();
    }
    
    iterator end() {
        return _t.End();
    }
    
    // ... 其他方法
};
```

# 5. 完整代码实现

## 5.1 map的完整实现
```cpp
// Mymap.h
#include "RBTree.h"

namespace kiana {
    template<class K, class V>
    class map {
        struct MapKeyOfT {
            const K& operator()(const pair<const K, V>& kv) {
                return kv.first;
            }
        };
        
    public:
        typedef typename RBTree<K, pair<const K, V>, MapKeyOfT>::Iterator iterator;
        typedef typename RBTree<K, pair<const K, V>, MapKeyOfT>::ConstIterator const_iterator;
        
        iterator begin() {
            return _t.Begin();
        }
        
        iterator end() {
            return _t.End();
        }
        
        const_iterator begin() const {
            return _t.Begin();
        }
        
        const_iterator end() const {
            return _t.End();
        }
        
        pair<iterator, bool> insert(const pair<const K, V>& kv) {
            return _t.Insert(kv);
        }
        
        iterator find(const K& key) {
            return _t.Find(key);
        }
        
        V& operator[](const K& key) {
            pair<iterator, bool> ret = insert(make_pair(key, V()));
            return ret.first->second;
        }
        
    private:
        RBTree<K, pair<const K, V>, MapKeyOfT> _t;
    };
}
```

## 5.2 set的完整实现
```cpp
// Myset.h
#include "RBTree.h"

namespace kiana {
    template<class K>
    class set {
        struct SetKeyOfT {
            const K& operator()(const K& key) {
                return key;
            }
        };
        
    public:
        typedef typename RBTree<K, const K, SetKeyOfT>::Iterator iterator;
        typedef typename RBTree<K, const K, SetKeyOfT>::ConstIterator const_iterator;
        
        iterator begin() {
            return _t.Begin();
        }
        
        iterator end() {
            return _t.End();
        }
        
        const_iterator begin() const {
            return _t.Begin();
        }
        
        const_iterator end() const {
            return _t.End();
        }
        
        pair<iterator, bool> insert(const K& key) {
            return _t.Insert(key);
        }
        
        iterator find(const K& key) {
            return _t.Find(key);
        }
        
    private:
        RBTree<K, const K, SetKeyOfT> _t;
    };
}
```

## 5.3 红黑树的完整实现
```cpp
// RBTree.h
enum Colour {
    RED,
    BLACK
};

template<class T>
struct RBTreeNode {
    T _data;
    RBTreeNode<T>* _left;
    RBTreeNode<T>* _right;
    RBTreeNode<T>* _parent;
    Colour _col;
    
    RBTreeNode(const T& data)
        : _data(data)
        , _left(nullptr)
        , _right(nullptr)
        , _parent(nullptr)
        , _col(RED)
    {}
};

template<class T, class Ref, class Ptr>
struct RBTreeIterator {
    // 迭代器实现，见上文
    // ...
};

template<class K, class T, class KeyOfT>
class RBTree {
private:
    typedef RBTreeNode<T> Node;
    Node* _root = nullptr;
    
    // 红黑树旋转和调整方法
    void RotateL(Node* parent) {
        // 左旋实现
    }
    
    void RotateR(Node* parent) {
        // 右旋实现
    }
    
    void Destroy(Node* root) {
        // 销毁红黑树
    }
    
public:
    // 类型定义
    typedef RBTreeIterator<T, T&, T*> Iterator;
    typedef RBTreeIterator<T, const T&, const T*> ConstIterator;
    
    // 构造函数和析构函数
    RBTree() = default;
    ~RBTree() {
        Destroy(_root);
        _root = nullptr;
    }
    
    // 迭代器相关方法
    Iterator Begin() {
        Node* leftMost = _root;
        while (leftMost && leftMost->_left) {
            leftMost = leftMost->_left;
        }
        return Iterator(leftMost, _root);
    }
    
    Iterator End() {
        return Iterator(nullptr, _root);
    }
    
    // 插入方法
    pair<Iterator, bool> Insert(const T& data) {
        // 插入逻辑，包括红黑树调整
        // 返回pair<iterator, bool>
    }
    
    // 查找方法
    Iterator Find(const K& key) {
        KeyOfT kot;
        Node* cur = _root;
        while (cur) {
            if (kot(cur->_data) < key) {
                cur = cur->_right;
            }
            else if (kot(cur->_data) > key) {
                cur = cur->_left;
            }
            else {
                return Iterator(cur, _root);
            }
        }
        return End();
    }
};
```

# 6. 关键点总结

## 6.1 设计模式总结
1. **适配器模式**：map和set都是红黑树的适配器
2. **模板泛型编程**：通过模板参数实现代码复用
3. **迭代器模式**：提供统一的访问接口

## 6.2 实现要点

1. **KeyOfT仿函数**：解决不同类型数据的关键字提取问题
2. **const设计**：
    - set的迭代器不允许修改元素
    - map的迭代器不允许修改key，但可以修改value
3. **迭代器实现**：中序遍历的顺序迭代器
4. **operator[]实现**：基于insert方法实现

## 6.3 性能特点

1. **时间复杂度**：
    - 插入、删除、查找：O(log n)
    - 迭代器遍历：O(n)
2. **空间复杂度**：O(n)

## 6.4 与STL实现的差异
1. **end()处理**：我们使用nullptr作为end，STL使用哨兵节点
2. **内存管理**：简化版本，实际STL使用allocator
3. **异常安全**：简化版本，实际STL考虑异常安全

这个实现展示了STL中map和set的核心设计思想，通过复用红黑树实现了两种不同功能的容器。
