---
title: "二叉搜索树"
published: 2025-12-17 21:06:37
description: "二叉搜索树又称二叉排序树，它或者是一棵空树，或者是具有以下性质的二叉树："
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

# 二叉搜索树的概念

二叉搜索树又称二叉排序树，它或者是一棵空树，或者是具有以下性质的二叉树：

## 性质

1. **左子树性质**：若它的左子树不为空，则左子树上所有结点的值都小于等于根结点的值
2. **右子树性质**：若它的右子树不为空，则右子树上所有结点的值都大于等于根结点的值
3. **递归性质**：它的左右子树也分别为二叉搜索树

## 相等值的处理

- 二叉搜索树**可以支持**插入相等的值，也可以**不支持**插入相等的值
- 具体看使用场景定义
- C++ STL中的map/set不支持插入相等值，multimap/multiset支持插入相等值

**示例二叉搜索树**：
```cpp
    8
   / \
  3   10
 / \    \
1   6    14
   / \   /
  4   7 13
```

# 二叉搜索树的性能分析

## 时间复杂度分析

|情况|树形|高度|时间复杂度|
|---|---|---|---|
|最优情况|完全二叉树（接近完全二叉树）|log₂N|O(logN)|
|最差情况|单支树（类似单支）|N|O(N)|
**综合时间复杂度**：O(N)（最坏情况）

## 与二分查找对比

|特性|二叉搜索树|二分查找|
|---|---|---|
|查找效率|O(N)~O(logN)|O(log₂N)|
|存储结构|链式结构|顺序结构（数组）|
|插入/删除|效率高（修改指针）|效率低（需要挪动数据）|
|随机访问|不支持|支持（下标访问）|
|有序性|天然有序|需要预先排序|
**二分查找的缺陷**：

1. 需要存储在支持下标随机访问的结构中，并且有序
2. 插入和删除数据效率很低

# 二叉搜索树的插入

## 插入过程

1. **树为空**：直接新增结点，赋值给root指针
2. **树不空**：
    - 插入值比当前结点大 → 往右走
    - 插入值比当前结点小 → 往左走
    - 找到空位置，插入新结点
3. **相等值的处理**：
    - 如果支持插入相等的值，可以往右走或往左走
    - **注意**：要保持逻辑一致性（不要一会往右走，一会往左走）

## 插入示例
初始树：{8, 3, 1, 10, 6, 4, 7, 14, 13}
```cpp
插入16前：
    8
   / \
  3   10
 / \    \
1   6    14
   / \   /
  4   7 13

插入16后：
    8
   / \
  3   10
 / \    \
1   6    14
   / \   / \
  4   7 13  16
```

# 二叉搜索树的查找

## 查找过程

1. 从根开始比较
2. x比根的值大 → 往右边走查找
3. x比根值小 → 往左边走查找
4. 最多查找**高度次**，走到空还没找到 → 值不存在
5. **不支持插入相等的值**：找到x即可返回
6. **支持插入相等的值**：一般要求查找中序的第一个
## 查找示例
```cpp
要查找3：
    8
   / \
  3   10
 / \    \
1   6    14
   / \   /
  4   7 13
  
查找路径：8 → 3（找到）
```

# 二叉搜索树的删除

## 删除步骤

1. 查找元素是否在二叉搜索树中
2. 如果不存在，则返回false
3. 如果存在，分四种情况处理（假设要删除的结点为N）

## 四种删除情况

### **情况1：要删除结点N左右孩子均为空**

1. **判断是否为根节点**：
    - 如果是根节点（parent为空）：直接将根节点指针设为nullptr
    - 如果不是根节点：将父节点对应的孩子指针设为nullptr
2. **删除结点N**

### **情况2：要删除的结点N左孩子为空，右孩子不为空**

1. **判断是否为根节点**：
    - 如果是根节点：将根节点指针指向N的右孩子
    - 如果不是根节点：将父节点对应的孩子指针指向N的右孩子
2. **删除结点N**

### **情况3：要删除的结点N右孩子为空，左孩子不为空**

1. **判断是否为根节点**：
    - 如果是根节点：将根节点指针指向N的左孩子
    - 如果不是根节点：将父节点对应的孩子指针指向N的左孩子
2. **删除结点N**

### **情况4：要删除的结点N左右孩子结点均不为空（替换法删除）**

1. **找到替代结点R**：N右子树的最左结点（最小结点）
2. **找到R的父节点P**
3. **值替换**：用R的值覆盖N的值
4. **指针调整**：
    - 如果R是P的左孩子：将P的左指针指向R的右孩子
    - 如果R是P的右孩子（R就是N的右孩子）：将P的右指针指向R的右孩子
5. **删除替代结点R**

## 删除示例

### 情况1样例：删除1
```cpp
删除前：
    8
   / \
  3   10
 / \    \
1   6    14
   / \   /
  4   7 13
  
删除后：
    8
   / \
  3   10
   \    \
    6    14
   / \   /
  4   7 13
```

### 情况2样例：删除10
```cpp
删除前：
    8
   / \
  3   10
 / \    \
1   6    14
   / \   /
  4   7 13
  
删除后：
    8
   / \
  3   14
 / \   /
1   6 13
   / \
  4   7
```

### 情况4样例：删除3（替换法）
```cpp
删除前：
    8
   / \
  3   10
 / \    \
1   6    14
   / \   /
  4   7 13
  
替换：用左子树最大值1替换3，然后删除1
删除后：
    8
   / \
  1   10
   \    \
    6    14
   / \   /
  4   7 13
```

# 二叉搜索树的实现代码（key版本）
```cpp
// 二叉搜索树节点模板类
template<class K>
struct BSTNode {
    K _key;                // 节点存储的关键字
    BSTNode<K>* _left;     // 左孩子指针
    BSTNode<K>* _right;    // 右孩子指针
    
    // 构造函数
    BSTNode(const K& key)
        : _key(key)        // 初始化关键字
        , _left(nullptr)   // 左孩子初始化为空
        , _right(nullptr)  // 右孩子初始化为空
    {}
};

// 二叉搜索树模板类
template<class K>
class BSTree {
    typedef BSTNode<K> Node;  // 类型别名，方便使用
    
public:
    // 插入操作：向BST中插入一个关键字
    // 返回值：插入成功返回true，如果关键字已存在返回false
    bool Insert(const K& key) {
        // 如果树为空，直接创建根节点
        if (_root == nullptr) {
            _root = new Node(key);
            return true;
        }
        
        // 查找插入位置
        Node* parent = nullptr;  // 记录父节点
        Node* cur = _root;       // 当前节点
        
        while (cur) {
            // 如果当前节点的key小于要插入的key，向右子树查找
            if (cur->_key < key) {
                parent = cur;
                cur = cur->_right;
            }
            // 如果当前节点的key大于要插入的key，向左子树查找
            else if (cur->_key > key) {
                parent = cur;
                cur = cur->_left;
            }
            // 如果key已经存在，返回false（不支持重复值）
            else {
                return false;
            }
        }
        
        // 创建新节点
        cur = new Node(key);
        
        // 将新节点链接到父节点
        // 如果父节点的key小于插入的key，新节点作为右孩子
        if (parent->_key < key) {
            parent->_right = cur;
        }
        // 否则作为左孩子
        else {
            parent->_left = cur;
        }
        
        return true;
    }
    
    // 查找操作：在BST中查找关键字
    // 返回值：找到返回true，否则返回false
    bool Find(const K& key) {
        Node* cur = _root;
        
        while (cur) {
            if (cur->_key < key) {
                cur = cur->_right;    // 向右子树查找
            }
            else if (cur->_key > key) {
                cur = cur->_left;     // 向左子树查找
            }
            else {
                return true;          // 找到关键字
            }
        }
        return false;  // 未找到关键字
    }
    
    // 删除操作：从BST中删除一个关键字
    // 返回值：删除成功返回true，未找到关键字返回false
    bool Erase(const K& key) {
        Node* parent = nullptr;  // 记录要删除节点的父节点
        Node* cur = _root;       // 要删除的节点
        
        while (cur) {
            // 查找要删除的节点
            if (cur->_key < key) {
                parent = cur;
                cur = cur->_right;
            }
            else if (cur->_key > key) {
                parent = cur;
                cur = cur->_left;
            }
            else {  // 找到了要删除的节点
                
                // --- 情况1：要删除的节点左孩子为空 ---
                if (cur->_left == nullptr) {
                    // 如果要删除的是根节点
                    if (parent == nullptr) {
                        _root = cur->_right;  // 根节点变为右孩子
                    }
                    // 如果要删除的节点是父节点的左孩子
                    else if (parent->_left == cur) {
                        parent->_left = cur->_right;  // 父节点的左孩子指向cur的右孩子
                    }
                    // 如果要删除的节点是父节点的右孩子
                    else {
                        parent->_right = cur->_right; // 父节点的右孩子指向cur的右孩子
                    }
                    delete cur;  // 释放节点内存
                    return true;
                }
                
                // --- 情况2：要删除的节点右孩子为空 ---
                else if (cur->_right == nullptr) {
                    // 如果要删除的是根节点
                    if (parent == nullptr) {
                        _root = cur->_left;  // 根节点变为左孩子
                    }
                    // 如果要删除的节点是父节点的左孩子
                    else if (parent->_left == cur) {
                        parent->_left = cur->_left;  // 父节点的左孩子指向cur的左孩子
                    }
                    // 如果要删除的节点是父节点的右孩子
                    else {
                        parent->_right = cur->_left; // 父节点的右孩子指向cur的左孩子
                    }
                    delete cur;  // 释放节点内存
                    return true;
                }
                
                // --- 情况3：要删除的节点左右孩子都不为空（替换法删除）---
                else {
                    // 方法：用右子树的最小节点（或左子树的最大节点）替换要删除的节点
                    
                    // 查找右子树的最小节点（最左节点）
                    Node* rightMinP = cur;      // 最小节点的父节点
                    Node* rightMin = cur->_right; // 最小节点
                    
                    // 一直向左走，找到最小节点
                    while (rightMin->_left) {
                        rightMinP = rightMin;
                        rightMin = rightMin->_left;
                    }
                    
                    // 替换：将最小节点的值复制到要删除的节点
                    cur->_key = rightMin->_key;
                    
                    // 删除右子树的最小节点
                    // 最小节点是父节点的左孩子
                    if (rightMinP->_left == rightMin) {
                        rightMinP->_left = rightMin->_right;  // 最小节点的父节点指向最小节点的右孩子
                    }
                    // 特殊情况：右子树的根就是最小节点（即右子树没有左孩子）
                    else {
                        rightMinP->_right = rightMin->_right; // 父节点的右孩子指向最小节点的右孩子
                    }
                    
                    delete rightMin;  // 释放最小节点内存
                    return true;
                }
            }
        }
        return false;  // 没找到要删除的关键字
    }
    
    // 中序遍历：按升序输出BST中的所有关键字
    void InOrder() {
        _InOrder(_root);    // 调用递归辅助函数
        cout << endl;
    }
    
private:
    // 递归辅助函数：中序遍历子树
    void _InOrder(Node* root) {
        if (root == nullptr) return;          // 递归终止条件：空树
        _InOrder(root->_left);               // 遍历左子树
        cout << root->_key << " ";           // 访问根节点
        _InOrder(root->_right);              // 遍历右子树
    }
    
private:
    Node* _root = nullptr;  // 二叉搜索树的根节点
};
```

# 二叉搜索树key和key/value使用场景

## key搜索场景（只有key）

- **特点**：结构中只需要存储key，关键码即为需要搜索到的值
- **支持操作**：增、删、查
- **不支持**：修改key（修改会破坏搜索树结构）
- **应用场景**：
    1. **小区无人值守车库**：录入车牌号，车辆进入时扫描车牌在不在系统中
    2. **单词拼写检查**：将词库所有单词放入二叉搜索树，检查文章单词是否正确

## key/value搜索场景（key和value）

- **特点**：每个关键码key都有对应的值value，value可以是任意类型
- **树结构**：结点除了存储key还要存储对应的value
- **操作**：增/删/查以key为关键字走二叉搜索树规则
- **支持**：可以修改value
- **不支持**：修改key（会破坏搜索树性质）
- **应用场景**：
    1. **中英互译字典**：存储key(英文)和value(中文)，输入英文查中文
    2. **商场无人值守车库**：记录车牌(key)和入场时间(value)，出场时计算费用
    3. **单词出现次数统计**：读取单词，不存在则插入(单词,1)，存在则++次数

```cpp
template<class K, class V>
struct BSTNode {
    K _key;
    V _value;
    BSTNode<K, V>* _left;
    BSTNode<K, V>* _right;
    
    BSTNode(const K& key, const V& value)
        : _key(key)
        , _value(value)
        , _left(nullptr)
        , _right(nullptr)
    {}
};

template<class K, class V>
class BSTree {
    typedef BSTNode<K, V> Node;
public:
    // 构造函数
    BSTree() = default;
    
    // 拷贝构造函数
    BSTree(const BSTree<K, V>& t) {
        _root = Copy(t._root);
    }
    
    // 赋值运算符重载
    BSTree<K, V>& operator=(BSTree<K, V> t) {
        swap(_root, t._root);
        return *this;
    }
    
    // 析构函数
    ~BSTree() {
        Destroy(_root);
        _root = nullptr;
    }
    
    // 插入操作
    bool Insert(const K& key, const V& value) {
        if (_root == nullptr) {
            _root = new Node(key, value);
            return true;
        }
        
        Node* parent = nullptr;
        Node* cur = _root;
        while (cur) {
            if (cur->_key < key) {
                parent = cur;
                cur = cur->_right;
            }
            else if (cur->_key > key) {
                parent = cur;
                cur = cur->_left;
            }
            else {
                return false;  // 不支持重复key
            }
        }
        
        cur = new Node(key, value);
        if (parent->_key < key) {
            parent->_right = cur;
        }
        else {
            parent->_left = cur;
        }
        
        return true;
    }
    
    // 查找操作（返回节点指针，可以修改value）
    Node* Find(const K& key) {
        Node* cur = _root;
        while (cur) {
            if (cur->_key < key) {
                cur = cur->_right;
            }
            else if (cur->_key > key) {
                cur = cur->_left;
            }
            else {
                return cur;
            }
        }
        return nullptr;
    }
    
    // 删除操作
    bool Erase(const K& key) {
        // 与key版本类似，需要同时处理key和value
        // 代码略，参考key版本
    }
    
    // 中序遍历
    void InOrder() {
        _InOrder(_root);
        cout << endl;
    }
    
private:
    // 中序遍历递归实现
    void _InOrder(Node* root) {
        if (root == nullptr) return;
        _InOrder(root->_left);
        cout << root->_key << ":" << root->_value << endl;
        _InOrder(root->_right);
    }
    
    // 销毁树
    void Destroy(Node* root) {
        if (root == nullptr) return;
        Destroy(root->_left);
        Destroy(root->_right);
        delete root;
    }
    
    // 拷贝树
    Node* Copy(Node* root) {
        if (root == nullptr) return nullptr;
        Node* newRoot = new Node(root->_key, root->_value);
        newRoot->_left = Copy(root->_left);
        newRoot->_right = Copy(root->_right);
        return newRoot;
    }
    
private:
    Node* _root = nullptr;
};
```

# 应用示例

## 示例1：字典应用
```cpp
int main() {
    BSTree<string, string> dict;
    dict.Insert("left", "左边");
    dict.Insert("right", "右边");
    dict.Insert("insert", "插入");
    dict.Insert("string", "字符串");
    
    string str;
    while (cin >> str) {
        auto ret = dict.Find(str);
        if (ret) {
            cout << "->" << ret->_value << endl;
        }
        else {
            cout << "无此单词，请重新输入" << endl;
        }
    }
    return 0;
}
```

## 示例2：单词计数
```cpp
int main() {
    string arr[] = {"苹果", "西瓜", "苹果", "西瓜", "苹果", "苹果", 
                   "西瓜", "苹果", "香蕉", "苹果", "香蕉"};
    
    BSTree<string, int> countTree;
    for (const auto& str : arr) {
        // 先查找水果在不在搜索树中
        // 1、不在，说明水果第一次出现，则插入<水果，1>
        // 2、在，则查找到的结点中水果对应的次数++
        auto ret = countTree.Find(str);
        if (ret == NULL) {
            countTree.Insert(str, 1);
        }
        else {
            ret->_value++;  // 修改value
        }
    }
    
    countTree.InOrder();  // 输出统计结果
    return 0;
}
```

# 总结

## 二叉搜索树的优点

1. 结构简单，易于实现
2. 支持高效的查找、插入、删除操作（平均O(logN)）
3. 天然有序，中序遍历可得到有序序列
4. 支持key/value对存储，应用场景广泛

## 二叉搜索树的缺点

1. 最坏情况下退化为链表，时间复杂度O(N)
2. 需要引入平衡机制（如AVL树、红黑树）来保证性能

## 适用场景

1. 数据动态变化频繁，需要频繁插入删除
2. 需要有序存储和查找
3. 内存中存储和搜索数据
4. 不适合大规模数据且数据分布不均的情况
