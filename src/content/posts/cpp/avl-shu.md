---
title: "AVL树"
published: 2025-12-23 22:03:49
description: "AVL树满足以下条件之一："
category: "C/C++"
tags: ["C/C++"]
lang: "zh_CN"
draft: false
comment: true
---

![](/images/posts/avl-shu/01.jpg)
# AVL树的概念

## 定义
AVL树满足以下条件之一：
- 是一棵空树
- 是一棵二叉搜索树，且左右子树都是AVL树，且**左右子树高度差的绝对值不超过1

## 平衡因子
为了方便观察和控制平衡，AVL树引入**平衡因子**的概念：
- 平衡因子 = 右子树高度 - 左子树高度
- 任何结点的平衡因子只能是-1、0、1

## 为什么高度差不超过1而不是0？
不是不想让高度差为0，而是有些情况做不到。例如：
- 2个结点：高度差最好为1，无法做到0
- 4个结点：同样无法做到完全平衡

## 性能分析
AVL树的结点分布与完全二叉树类似，高度控制在O(logN)，增删查改效率均为O(logN)，相比普通二叉搜索树有本质提升。

# AVL树的结构
```cpp
// AVL树节点
template<class K, class V>
struct AVLTreeNode
{
    pair<K, V> _kv;                // 存数据（键值对）
    AVLTreeNode<K, V>* _left;      // 左孩子
    AVLTreeNode<K, V>* _right;     // 右孩子  
    AVLTreeNode<K, V>* _parent;    // 父节点（更新平衡因子时需要）
    int _bf;                       // 平衡因子 = 右子树高 - 左子树高
    
    // 构造函数
    AVLTreeNode(const pair<K, V>& kv)
        : _kv(kv)
        , _left(nullptr)      // 新节点没有孩子
        , _right(nullptr)
        , _parent(nullptr)    // 新节点没有父节点
        , _bf(0)             // 新节点平衡因子为0
    {}
};

// AVL树类
template<class K, class V>
class AVLTree
{
    typedef AVLTreeNode<K, V> Node;  // 简化类型名
public:
    // 公有方法（插入、查找、删除等）
    
private:
    Node* _root = nullptr;  // 根节点，初始为空树
    
    // 私有辅助方法（旋转等）
};
```

# AVL树的插入
## 插入流程
1. **插入结点**：按照二叉搜索树规则插入新结点
2. **更新平衡因子**：从新增结点到根结点路径上更新平衡因子
3. **检查平衡**：如果更新过程中出现不平衡，进行旋转处理
4. **结束条件**：旋转后树恢复平衡，插入结束

## 平衡因子更新规则
- **更新原则**：平衡因子 = 右子树高度 - 左子树高度
- **更新方式**：
    - 新增结点在parent右子树：parent平衡因子++
    - 新增结点在parent左子树：parent平衡因子--

## 更新停止条件
| 更新后平衡因子 | 含义                           | 操作     |
| ------- | ---------------------------- | ------ |
| 0       | 插入前parent一边高一边低，插入在低的一边，高度不变 | 更新结束   |
| 1或-1    | 插入前parent两边等高，插入后一边高，高度+1    | 继续向上更新 |
| 2或-2    | 插入前parent一边高一边低，插入在高的那边，破坏平衡 | 需要旋转处理 |
| 更新到根    | 根结点平衡因子为1或-1                 | 更新结束   |
### 需要旋转处理
**更新到10结点，平衡因子为2，10所在的子树已经不平衡，需要旋转处理

![](/images/posts/avl-shu/02.jpg)

### 更新结束
**更新到中间节点，3为根的子树高度不变，不会影响上一层，更新结束

![](/images/posts/avl-shu/03.jpg)

### 最坏更新到根停止

![](/images/posts/avl-shu/04.jpg)

## 插入代码实现
```cpp
bool Insert(const pair<K, V>& kv)
{
    // 空树直接新建根节点
    if (_root == nullptr)
    {
        _root = new Node(kv);
        return true;
    }
    
    // 查找插入位置
    Node* parent = nullptr;
    Node* cur = _root;
    while (cur)
    {
        if (cur->_kv.first < kv.first)
        {
            parent = cur;
            cur = cur->_right;  // 去右子树
        }
        else if (cur->_kv.first > kv.first)
        {
            parent = cur;
            cur = cur->_left;   // 去左子树
        }
        else
        {
            return false;  // 键已存在，插入失败
        }
    }
    
    // 创建新节点
    cur = new Node(kv);
    // 链接到父节点
    if (parent->_kv.first < kv.first)
    {
        parent->_right = cur;
    }
    else
    {
        parent->_left = cur;
    }
    cur->_parent = parent;
    
    // 更新平衡因子
    while (parent)
    {
        // 更新父节点平衡因子
        if (cur == parent->_left)
            parent->_bf--;  // 左子树高度增加
        else
            parent->_bf++;  // 右子树高度增加
        
        // 判断平衡因子状态
        if (parent->_bf == 0)
        {
            // 插入后高度不变，停止更新
            break;
        }
        else if (parent->_bf == 1 || parent->_bf == -1)
        {
            // 高度变化，继续向上更新
            cur = parent;
            parent = parent->_parent;
        }
        else if (parent->_bf == 2 || parent->_bf == -2)
        {
            // 不平衡，需要旋转
            // 这里会调用旋转函数
            // ...
            break;
        }
        else
        {
            assert(false);  // 平衡因子异常
        }
    }
    
    return true;
}
```

# 旋转操作

## 旋转原则
1. 保持搜索树的规则
2. 让旋转的树从不平衡变平衡
3. 降低旋转树的高度

旋转分为四种类型：左单旋、右单旋、左右双旋、右左双旋。
## 右单旋

**适用场景**：左子树过高，且新结点插入在左子树的左子树

![](/images/posts/avl-shu/05.jpg)

**旋转步骤**：
1. 将b子树作为10的左子树
2. 将10作为5的右子树
3. 将5作为新的根结点

**平衡因子更新**：旋转后5和10的平衡因子都变为0

### 情况1：插入前a/b/c高度h\==0
![](/images/posts/avl-shu/06.jpg)

### 情况2：插入前a/b/c高度h\==1
![](/images/posts/avl-shu/07.jpg)

### 右单旋代码实现
```cpp
void RotateR(Node* parent)
{
    Node* subL = parent->_left;      // parent的左孩子
    Node* subLR = subL->_right;      // subL的右孩子
    
    // 1. subLR作为parent的新左孩子
    parent->_left = subLR;
    if (subLR)
        subLR->_parent = parent;
    
    // 2. 记录parent的父节点
    Node* parentParent = parent->_parent;
    
    // 3. parent变成subL的右孩子
    subL->_right = parent;
    parent->_parent = subL;
    
    // 4. subL连接到原父节点
    if (parentParent == nullptr)
    {
        // parent是根节点
        _root = subL;
        subL->_parent = nullptr;
    }
    else
    {
        // parent是子树
        if (parent == parentParent->_left)
        {
            parentParent->_left = subL;
        }
        else
        {
            parentParent->_right = subL;
        }
        subL->_parent = parentParent;
    }
    
    // 5. 更新平衡因子
    parent->_bf = subL->_bf = 0;
}
```

## 左单旋

**适用场景**：右子树过高，且新结点插入在右子树的右子树

![](/images/posts/avl-shu/08.jpg)

**旋转步骤**：
1. 将b子树作为10的右子树
2. 将10作为15的左子树
3. 将15作为新的根结点

**平衡因子更新**：旋转后10和15的平衡因子都变为0

### 左单旋代码实现
```cpp
void RotateL(Node* parent)
{
    Node* subR = parent->_right;     // parent的右孩子
    Node* subRL = subR->_left;       // subR的左孩子
    
    // 1. subRL作为parent的新右孩子
    parent->_right = subRL;
    if (subRL)
        subRL->_parent = parent;
    
    // 2. 记录parent的父节点
    Node* parentParent = parent->_parent;
    
    // 3. parent变成subR的左孩子
    subR->_left = parent;
    parent->_parent = subR;
    
    // 4. subR连接到原父节点
    if (parentParent == nullptr)
    {
        // parent是根节点
        _root = subR;
        subR->_parent = nullptr;
    }
    else
    {
        // parent是子树
        if (parent == parentParent->_left)
        {
            parentParent->_left = subR;
        }
        else
        {
            parentParent->_right = subR;
        }
        subR->_parent = parentParent;
    }
    
    // 5. 更新平衡因子
    parent->_bf = subR->_bf = 0;
}
```

## 左右双旋

**适用场景**：左子树过高，但新结点插入在左子树的右子树

**旋转步骤**：
1. 以5为旋转点进行左单旋
2. 以10为旋转点进行右单旋

**平衡因子更新**（根据subLR的平衡因子bf）：
- bf == 0：所有平衡因子变为0
- bf == -1：subL平衡因子0，subLR平衡因子0，parent平衡因子1
- bf == 1：subL平衡因子-1，subLR平衡因子0，parent平衡因子0

![](/images/posts/avl-shu/09.jpg)

**平衡因子更新需分三种情况讨论

### 情况1：新结点插入在subLR的左子树

![](/images/posts/avl-shu/10.jpg)
- 插入前e,f高度分别为h-1，现把新节点插入到e
- 之后e成为5的右子树，f成为10的左子树
- 但e有新插入结点高度为h,f的高度仍为h-1
- 故subL（5）的平衡因子变为0，parent（10）的平衡因子变为1

### 情况2：新结点插入在subLR的右子树

![](/images/posts/avl-shu/11.jpg)
- 插入前e,f高度分别为h-1，现把新节点插入到f
- 之后e成为5的右子树，f成为10的左子树
- 但f有新插入结点高度为h,e的高度仍为h-1
- 故subL（5）的平衡因子变为-1，parent（10）的平衡因子变为10

### 情况3：subLR本身就是新插入的结点

![](/images/posts/avl-shu/12.jpg)
- 旋转后所有子树高度相同
- subL（5）与parent(10)的平衡因子皆为0

### 左右双旋代码实现
```cpp
void RotateLR(Node* parent)
{
    Node* subL = parent->_left;      // 父节点的左孩子
    Node* subLR = subL->_right;      // 中间节点
    int bf = subLR->_bf;             // 记录中间节点的原始平衡因子
    
    // 步骤1：对subL进行左单旋
    RotateL(parent->_left);
    
    // 步骤2：对parent进行右单旋
    RotateR(parent);
    
    // 步骤3：根据subLR的原始平衡因子更新平衡因子
    if (bf == 0)
    {
        // 情况1：subLR本身就是新插入的结点
        // 旋转后所有子树高度相同
        subL->_bf = 0;
        subLR->_bf = 0;
        parent->_bf = 0;
    }
    else if (bf == -1)
    {
        // 情况2：新结点插入在subLR的左子树
        // subL的平衡因子变为0，parent的平衡因子变为1
        subL->_bf = 0;
        subLR->_bf = 0;
        parent->_bf = 1;
    }
    else if (bf == 1)
    {
        // 情况3：新结点插入在subLR的右子树
        // subL的平衡因子变为-1，parent的平衡因子变为0
        subL->_bf = -1;
        subLR->_bf = 0;
        parent->_bf = 0;
    }
    else
    {
        assert(false);  // 不应该出现的情况
    }
}
```

## 右左双旋

**适用场景**：右子树过高，但新结点插入在右子树的左子树

**旋转步骤**：
1. 以15为旋转点进行右单旋
2. 以10为旋转点进行左单旋

**平衡因子更新**（根据subRL的平衡因子bf）：
- bf == 0：所有平衡因子变为0
- bf == 1：subR平衡因子0，subRL平衡因子0，parent平衡因子-1
- bf == -1：subR平衡因子1，subRL平衡因子0，parent平衡因子0

![](/images/posts/avl-shu/13.jpg)

**平衡因子分析仍需分三种情况讨论

### 情况1：新插入结点在subRL的左子树

![](/images/posts/avl-shu/14.jpg)
- 插入前e,f高度分别为h-1，现把新节点插入到e
- 之后e成为10的右子树，f成为15的左子树
- 但e有新插入结点高度为h,f的高度仍为h-1
- 故parent(10)的平衡因子变为0，subR(15)的平衡因子变为1

### 情况2：新插入结点在subRL的右子树

![](/images/posts/avl-shu/15.jpg)
- 插入前e,f高度分别为h-1，现把新节点插入到f
- 之后e成为10的右子树，f成为15的左子树
- 但f有新插入结点高度为h,e的高度仍为h-1
- 故parent(10)的平衡因子变为-1，subR(15)的平衡因子变为0

### 情况3：subRL本身就是新插入结点

![](/images/posts/avl-shu/16.jpg)
- 旋转后所有子树高度相同
- subR（15）与parent(10)的平衡因子皆为0

### 右左双旋代码实现
```cpp
void RotateRL(Node* parent)
{
    Node* subR = parent->_right;     // 图中节点15
    Node* subRL = subR->_left;       // 图中节点12
    int bf = subRL->_bf;             // 记录12的原始平衡因子
    
    // 步骤1：以15为旋转点进行右单旋
    RotateR(parent->_right);
    
    // 步骤2：以10为旋转点进行左单旋
    RotateL(parent);
    
    // 步骤3：根据12的原始平衡因子更新平衡因子
    if (bf == 0)
    {
        // 情况3：subRL本身就是新插入的结点
        subR->_bf = 0;      // 15的平衡因子
        subRL->_bf = 0;     // 12的平衡因子
        parent->_bf = 0;    // 10的平衡因子
    }
    else if (bf == 1)
    {
        //情况2：新插入结点在subRL的左子树
        subR->_bf = 0;      // 15的平衡因子
        subRL->_bf = 0;     // 12的平衡因子
        parent->_bf = -1;   // 10的平衡因子
    }
    else if (bf == -1)
    {
        //情况1：新插入结点在subRL的左子树
        subR->_bf = 1;      // 15的平衡因子
        subRL->_bf = 0;     // 12的平衡因子
        parent->_bf = 0;    // 10的平衡因子
    }
    else
    {
        assert(false);      // 不应该出现的情况
    }
}
```

# AVL树的查找

查找操作与普通二叉搜索树相同，时间复杂度为O(logN)
```cpp
Node* Find(const K& key)
{
    Node* cur = _root;
    while (cur)
    {
        if (cur->_kv.first < key)
        {
            cur = cur->_right;
        }
        else if (cur->_kv.first > key)
        {
            cur = cur->_left;
        }
        else
        {
            return cur;
        }
    }
    return nullptr;
}
```

# AVL树平衡检测

用于验证AVL树实现是否正确，检查高度差和平衡因子
```cpp
int _Height(Node* root)
{
    if (root == nullptr)
        return 0;
    
    int leftHeight = _Height(root->_left);
    int rightHeight = _Height(root->_right);
    
    return leftHeight > rightHeight ? leftHeight + 1 : rightHeight + 1;
}

bool _IsBalanceTree(Node* root)
{
    // 空树也是AVL树
    if (nullptr == root)
        return true;
    
    // 计算root结点的平衡因子：即root左右子树的高度差
    int leftHeight = _Height(root->_left);
    int rightHeight = _Height(root->_right);
    int diff = rightHeight - leftHeight;
    
    // 如果计算出的平衡因子与root的平衡因子不相等，或者
    // root平衡因子的绝对值超过1，则一定不是AVL树
    if (abs(diff) >= 2)
    {
        cout << root->_kv.first << "高度差异常" << endl;
        return false;
    }
    
    if (root->_bf != diff)
    {
        cout << root->_kv.first << "平衡因子异常" << endl;
        return false;
    }
    
    // root的左和右如果都是AVL树，则该树一定是AVL树
    return _IsBalanceTree(root->_left) && _IsBalanceTree(root->_right);
}

// 测试代码示例
void TestAVLTree1()
{
    AVLTree<int, int> t;
    // 常规的测试用例
    // int a[] = {16, 3, 7, 11, 9, 26, 18, 14, 15};
    // 特殊的带有双旋场景的测试用例
    int a[] = {4, 2, 6, 1, 3, 5, 15, 7, 16, 14};
    for (auto e : a)
    {
        t.Insert({e, e});
    }
    
    t.InOrder();
    cout << t.IsBalanceTree() << endl;
}

// 插入一堆随机值，测试平衡，顺便测试一下高度和性能等
void TestAVLTree2()
{
    const int N = 100000;
    vector<int> v;
    v.reserve(N);
    srand(time(0));
    
    for (size_t i = 0; i < N; i++)
    {
        v.push_back(rand() + i);
    }
    
    size_t begin2 = clock();
    AVLTree<int, int> t;
    for (auto e : v)
    {
        t.Insert(make_pair(e, e));
    }
    size_t end2 = clock();
    
    cout << "Insert:" << end2 - begin2 << endl;
    cout << t.IsBalanceTree() << endl;
    
    cout << "Height:" << t.Height() << endl;
    cout << "Size:" << t.Size() << endl;
    
    size_t begin1 = clock();
    // 确定在的值
    /*for (auto e : v)
    {
        t.Find(e);
    }*/
    
    // 随机值
    for (size_t i = 0; i < N; i++)
    {
        t.Find((rand() + i));
    }
    
    size_t end1 = clock();
    
    cout << "Find:" << end1 - begin1 << endl;
}
```

# AVL树的删除
之后再学
