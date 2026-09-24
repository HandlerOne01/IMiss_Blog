---
title: "红黑树"
published: 2025-12-26 21:44:29
description: "红黑树是一种自平衡的二叉搜索树，通过对节点颜色的约束来确保树的平衡性。每个节点额外存储一个颜色位（红色或黑色），通过特定的规则约束，保证从根到叶子的任何一条路径不会比其他路径长出2倍。"
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. 红黑树的概念

红黑树是一种自平衡的二叉搜索树，通过对节点颜色的约束来确保树的平衡性。每个节点额外存储一个颜色位（红色或黑色），通过特定的规则约束，保证从根到叶子的任何一条路径不会比其他路径长出2倍。

![](/images/posts/hongheishu/01.jpg)
## 1.1 红黑树的规则

1. **每个节点不是红色就是黑色**
2. **根节点是黑色的**
3. **红色节点的两个子节点必须是黑色的**（不存在连续的红色节点)
4. **从任一节点到其所有叶子节点（NIL节点）的路径上，黑色节点的数量相同**

	**关于NIL节点的说明**：《算法导论》等书籍中提到的"叶子节点"指的是NIL节点（空节点），这些节点被看作黑色。在实际实现中，我们通常用nullptr表示这些节点，但逻辑上认为它们是黑色的。
	![](/images/posts/hongheishu/02.jpg)

## 1.2 红黑树的平衡性分析

**问题**：红黑树如何确保最长路径不超过最短路径的2倍？
**分析**:
- 设从根到NIL节点的最短路径长度为 `bh`（black height，全黑路径）
- 由规则4可知，所有路径的黑色节点数相同，都是 `bh`
- 由规则3可知，红色节点不能连续，所以最长路径是黑红相间，长度为 `2*bh`
- 因此，最长路径不超过最短路径的2倍
![](/images/posts/hongheishu/03.jpg)

![](/images/posts/hongheishu/04.jpg)
## 1.3 红黑树的效率

- 时间复杂度：O(logN)
- 与AVL树比较：
    - AVL树：严格平衡，旋转次数多
    - 红黑树：近似平衡，旋转次数少
    - 两者都是O(logN)，红黑树更适合频繁插入删除的场景

# 2. 红黑树的实现

## 2.1 红黑树的结构
```cpp
// 枚举值表示颜色
enum Colour {
    RED,
    BLACK
};

// 红黑树节点结构
template<class K, class V>
struct RBTreeNode {
    // 键值对
    pair<K, V> _kv;
    
    // 三叉链结构
    RBTreeNode<K, V>* _left;
    RBTreeNode<K, V>* _right;
    RBTreeNode<K, V>* _parent;
    
    // 颜色
    Colour _col;
    
    // 构造函数
    RBTreeNode(const pair<K, V>& kv)
        : _kv(kv)
        , _left(nullptr)
        , _right(nullptr)
        , _parent(nullptr)
        , _col(RED)  // 新节点默认为红色
    {}
};

// 红黑树类
template<class K, class V>
class RBTree {
    typedef RBTreeNode<K, V> Node;
    
public:
    // 插入操作
    bool Insert(const pair<K, V>& kv);
    
    // 查找操作
    Node* Find(const K& key);
    
    // 验证红黑树
    bool IsBalance();
    
private:
    Node* _root = nullptr;
    
    // 旋转操作
    void RotateL(Node* parent);  // 左旋
    void RotateR(Node* parent);  // 右旋
    
    // 检查函数
    bool Check(Node* root, int blackNum, const int refNum);
};
```

## 2.2 红黑树的插入操作

### 2.2.1 插入过程概览

1. **空树插入**：插入节点作为根节点，颜色设为黑色
2. **非空树插入**：
    - 按照二叉搜索树规则找到插入位置
    - 新节点颜色设为**红色**（减少对规则4的影响）
    - 如果父节点是黑色，直接插入完成
    - 如果父节点是红色，需要进行调整

### 2.2.2 调整情况分析

定义：
- `c` (cur)：当前节点（新增节点）
- `p` (parent)：父节点
- `g` (grandfather)：祖父节点
- `u` (uncle)：叔叔节点（p的兄弟）

#### **情况1：变色**

![](/images/posts/hongheishu/05.jpg)

- 条件：c为红，p为红，g为黑，u存在且为红
- 处理：
    1. 将p和u变为黑色
    2. 将g变为红色
    3. 将g作为新的c，继续向上调整
    4. 如果g是根，最后将根变回黑色
```cpp
// 情况1：变色处理
if (uncle && uncle->_col == RED) {
    // u存在且为红 -> 变色再继续往上处理
    parent->_col = uncle->_col = BLACK;
    grandfather->_col = RED;
    
    cur = grandfather;
    parent = cur->_parent;
}
```
![](/images/posts/hongheishu/06.jpg)

![](/images/posts/hongheishu/07.jpg)

#### **情况2：单旋 + 变色**
![](/images/posts/hongheishu/08.jpg)

- 条件：c为红，p为红，g为黑，u不存在或u为黑
- 子情况：
    - p是g的左，c是p的左：以g为轴右单旋
    - p是g的右，c是p的右：以g为轴左单旋
- 处理：旋转后，p变黑，g变红
```cpp
// 情况2-1：p是g的左，c是p的左（右单旋）
if (cur == parent->_left) {
    // 单旋
    RotateR(grandfather);
    parent->_col = BLACK;
    grandfather->_col = RED;
}
```
![](/images/posts/hongheishu/09.jpg)

![](/images/posts/hongheishu/10.jpg)

#### **情况3：双旋 + 变色**
![](/images/posts/hongheishu/11.jpg)
- 条件：c为红，p为红，g为黑，u不存在或u为黑
- 子情况：
    - p是g的左，c是p的右：先以p左旋，再以g右旋
    - p是g的右，c是p的左：先以p右旋，再以g左旋
- 处理：旋转后，c变黑，g变红
```cpp
// 情况3-1：p是g的左，c是p的右（左右双旋）
else {
    // 双旋
    RotateL(parent);
    RotateR(grandfather);
    
    cur->_col = BLACK;
    grandfather->_col = RED;
}
```
![](/images/posts/hongheishu/12.jpg)

![](/images/posts/hongheishu/13.jpg)

## 2.3 完整插入代码实现
```cpp
template<class K, class V>
bool RBTree<K, V>::Insert(const pair<K, V>& kv) {
    // 1. 空树情况
    if (_root == nullptr) {
        _root = new Node(kv);
        _root->_col = BLACK;  // 根节点必须为黑色
        return true;
    }
    
    // 2. 查找插入位置
    Node* parent = nullptr;
    Node* cur = _root;
    while (cur) {
        if (cur->_kv.first < kv.first) {
            parent = cur;
            cur = cur->_right;
        } else if (cur->_kv.first > kv.first) {
            parent = cur;
            cur = cur->_left;
        } else {
            return false;  // 键已存在
        }
    }
    
    // 3. 创建新节点
    cur = new Node(kv);
    cur->_col = RED;  // 新节点为红色
    
    // 4. 链接到父节点
    if (parent->_kv.first < kv.first) {
        parent->_right = cur;
    } else {
        parent->_left = cur;
    }
    cur->_parent = parent;
    
    // 5. 调整红黑树
    while (parent && parent->_col == RED) {
        Node* grandfather = parent->_parent;
        
        if (parent == grandfather->_left) {
            Node* uncle = grandfather->_right;
            
            // 情况1：叔叔存在且为红
            if (uncle && uncle->_col == RED) {
                // 变色处理
                parent->_col = uncle->_col = BLACK;
                grandfather->_col = RED;
                
                // 继续向上调整
                cur = grandfather;
                parent = cur->_parent;
            } else {
                // 情况2和3：叔叔不存在或为黑
                if (cur == parent->_left) {
                    // 情况2：右单旋
                    RotateR(grandfather);
                    parent->_col = BLACK;
                    grandfather->_col = RED;
                } else {
                    // 情况3：左右双旋
                    RotateL(parent);
                    RotateR(grandfather);
                    cur->_col = BLACK;
                    grandfather->_col = RED;
                }
                break;  // 旋转后调整完成
            }
        } else {
            // parent是grandfather的右孩子
            Node* uncle = grandfather->_left;
            
            // 情况1：叔叔存在且为红
            if (uncle && uncle->_col == RED) {
                parent->_col = uncle->_col = BLACK;
                grandfather->_col = RED;
                
                cur = grandfather;
                parent = cur->_parent;
            } else {
                // 情况2和3：叔叔不存在或为黑
                if (cur == parent->_right) {
                    // 情况2：左单旋
                    RotateL(grandfather);
                    parent->_col = BLACK;
                    grandfather->_col = RED;
                } else {
                    // 情况3：右左双旋
                    RotateR(parent);
                    RotateL(grandfather);
                    cur->_col = BLACK;
                    grandfather->_col = RED;
                }
                break;  // 旋转后调整完成
            }
        }
    }
    
    // 6. 确保根节点为黑色
    _root->_col = BLACK;
    return true;
}
```

## 2.4 旋转操作实现
```cpp
// 左旋
template<class K, class V>
void RBTree<K, V>::RotateL(Node* parent) {
    Node* subR = parent->_right;
    Node* subRL = subR->_left;
    
    // 1. 处理subRL
    parent->_right = subRL;
    if (subRL) {
        subRL->_parent = parent;
    }
    
    // 2. 处理parent的父节点
    subR->_parent = parent->_parent;
    if (parent == _root) {
        _root = subR;
    } else {
        if (parent->_parent->_left == parent) {
            parent->_parent->_left = subR;
        } else {
            parent->_parent->_right = subR;
        }
    }
    
    // 3. 处理parent和subR的关系
    subR->_left = parent;
    parent->_parent = subR;
}

// 右旋
template<class K, class V>
void RBTree<K, V>::RotateR(Node* parent) {
    Node* subL = parent->_left;
    Node* subLR = subL->_right;
    
    // 1. 处理subLR
    parent->_left = subLR;
    if (subLR) {
        subLR->_parent = parent;
    }
    
    // 2. 处理parent的父节点
    subL->_parent = parent->_parent;
    if (parent == _root) {
        _root = subL;
    } else {
        if (parent->_parent->_left == parent) {
            parent->_parent->_left = subL;
        } else {
            parent->_parent->_right = subL;
        }
    }
    
    // 3. 处理parent和subL的关系
    subL->_right = parent;
    parent->_parent = subL;
}
```

## 2.5 查找操作
```cpp
template<class K, class V>
Node* RBTree<K, V>::Find(const K& key) {
    Node* cur = _root;
    while (cur) {
        if (cur->_kv.first < key) {
            cur = cur->_right;
        } else if (cur->_kv.first > key) {
            cur = cur->_left;
        } else {
            return cur;
        }
    }
    return nullptr;
}
```

## 2.6 红黑树的验证
![](/images/posts/hongheishu/14.jpg)
```cpp
// 检查红黑树是否平衡
template<class K, class V>
bool RBTree<K, V>::Check(Node* root, int blackNum, const int refNum) {
    if (root == nullptr) {
        // 走到空节点，计算当前路径黑色节点数
        if (refNum != blackNum) {
            cout << "存在黑色节点数量不相等的路径" << endl;
            return false;
        }
        return true;
    }
    
    // 检查规则3：红色节点的父节点不能是红色
    if (root->_col == RED && root->_parent && root->_parent->_col == RED) {
        cout << root->_kv.first << "存在连续的红色节点" << endl;
        return false;
    }
    
    // 统计黑色节点数
    if (root->_col == BLACK) {
        blackNum++;
    }
    
    // 递归检查左右子树
    return Check(root->_left, blackNum, refNum) &&
           Check(root->_right, blackNum, refNum);
}

template<class K, class V>
bool RBTree<K, V>::IsBalance() {
    if (_root == nullptr) {
        return true;
    }
    
    // 规则2：根节点必须是黑色
    if (_root->_col == RED) {
        return false;
    }
    
    // 计算参考黑色节点数（最左路径）
    int refNum = 0;
    Node* cur = _root;
    while (cur) {
        if (cur->_col == BLACK) {
            ++refNum;
        }
        cur = cur->_left;
    }
    
    // 检查所有路径
    return Check(_root, 0, refNum);
}
```

## 2.7 红黑树的删除

红黑树的删除操作比较复杂，涉及多种情况的处理：
1. 被删除节点有两个子节点
2. 被删除节点有一个子节点
3. 被删除节点没有子节点
4. 删除后需要调整颜色和旋转

**主要步骤**：
1. 按二叉搜索树规则删除节点
2. 根据被删除节点的颜色和位置进行调整
3. 处理可能出现的"双黑"情况

由于删除操作较为复杂，一般建议参考《算法导论》或《STL源码剖析》进行深入学习。

# 3. 红黑树与AVL树的比较

|特性|红黑树|AVL树|
|---|---|---|
|平衡标准|近似平衡|严格平衡|
|查找效率|O(logN)|O(logN)|
|插入删除效率|旋转次数少|旋转次数多|
|实现难度|相对简单|相对复杂|
|应用场景|map/set等|需要频繁查找的场景|

## 4. 总结

红黑树通过颜色约束实现了近似平衡，具有以下特点：

1. 查找、插入、删除的时间复杂度都是O(logN)
2. 插入和删除的旋转次数比AVL树少
3. 实现相对简单，适合作为通用平衡树结构
4. 广泛应用于STL的map、set等容器

红黑树的核心在于插入时的四种情况处理，掌握这些情况就能理解红黑树的平衡机制。
