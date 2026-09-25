---
title: "LangGraph 能力详解 · 学习笔记"
published: 2026-09-24 21:00:00
description: "把 LangGraph 从状态图三要素讲到持久化、中断、流式与子图，含三个完整案例、五种编排模式和一个综合项目，全是能直接抄的 API 落点与踩坑清单。"
category: "AI 应用"
tags: ["LangGraph", "Agent", "状态机", "编排"]
lang: "zh_CN"
draft: false
comment: true
---

## 开篇：三句话与我自己的定位

先把整套东西压成三句，后面都是这三句的展开。

1. **State 是唯一被共享的东西**。节点之间不互相调用，只读写同一份带类型的共享状态。
2. **图 = 状态 + 节点 + 边**。边分固定边与条件边；条件边可以返回 `Send`，于是边的条数到运行时才定下来。
3. **持久化不是附加功能，而是记忆、断点续跑、人工中断、时间旅行共同的地基**。没挂 checkpointer，后面一半能力直接不可用。

我自己的定位理解：这套东西不管我用哪个模型、system prompt 长什么样，它管的是「多个步骤怎么串、状态放哪、人从哪插手」。把它当成为 Agent 准备的流程内核，比当成「又一个 LLM 框架」准确得多。

- 它和 LangChain 能顺畅拼在一起，但**脱离 LangChain 单独用也完全可以**（LangGraph 是 LangChain 家族的一员，不是它的子模块）。
- 同一套代码既能写死路径（工作流），也能把路径交给大模型决定（Agent），选择权在我手里。

## 一、LangGraph 介绍

### 认识智能服务（Agent Server）

先分清两类东西，我之前一直混着叫。

| | 普通对话式 AI | Agent Server |
| --- | --- | --- |
| 上下文 | 单轮问答，记不住太多 | 记得住全部聊过的内容 |
| 任务 | 一问一答 | 能连着执行一串动作（查天气 → 荐穿搭 → 提醒带伞） |
| 人的位置 | 只能问下一句 | 中途可以停下来等我反馈 |
| 时长 | 短 | 跑很久也不会「忘」 |

我见过的典型 Agent Server 形态：说一句「帮我规划周末旅行」，它自己往下走 —— 查天气 → 找景点 → 订酒店 → 规划路线 → 给打包清单，每一步都能看见中间结果。

一句话概括差异：它不只是回答问题，而是**把一件事从头跟到尾**。

### 构建 Agent Server 时遇到的四大难题

| 卡点 | 表现 | 类比 |
| --- | --- | --- |
| 状态丢失 | 长任务跑到一半忘掉前面步骤 | 写长文时电脑突然关机 |
| 难以调试 | 说不清模型为什么做了那个决定 | 黑盒，看不见内部 |
| 无法干预 | 中途插不进人的指导 | 自动驾驶不让接管 |
| 部署困难 | 复杂结构难以上线 | 手工作坊对比流水线工厂 |

思考一下：如果要做 7×24 小时的 AI 客服，我认为最头疼的是「无法干预」——出错时没有刹车，比出错本身更可怕。这四个难题正好是后面各章的主线。

### 解决方案：LangGraph —— Agent Server 的「操作系统」

它是给 Agent Server 用的操作系统内核：不关心我用什么模型、提示词怎么写，专心解决状态管理、流程编排、持久化、人工监督这些底层工程问题。

把 Agent Server 比作一家公司：

- AI 模型 = 干活的人（员工）
- 工具 = 办公装备（电脑、电话）
- LangGraph = 既当项目经理，又当流程系统

#### 三大超能力（我自己的叫法）

1. **记忆大师**：跨会话、跨时间都记得住。传统写法里我说「我叫小明」再问「我叫什么」会答不知道；挂上持久化之后能答出「你叫小明」。
2. **流程指挥官**：把复杂事情拆成小步骤。形状是：开始 → 理解需求 → 跑第一步 → 看结果 → 跑第二步 → 停下来等人反馈 → 接着跑 → 结束。中间那个「等人反馈」就是人工介入点。
3. **容错卫士**：靠四项基础设施兜底 ——
   - 持久执行：出了故障还能接着跑，长任务也扛得住
   - 人工介入：随时检查、修改 Agent Server 的状态
   - 调试能力够强：接上 `LangSmith`，能可视化追踪、能深挖
   - 生产就绪的部署：给有状态的长任务提供可横向扩展的上线方案

#### 现实里谁在用

| 公司 | 产品 / 服务 | 定位与备注 |
| --- | --- | --- |
| LinkedIn | LinkedIn AI 代理（如 LinkedIn Coach） | 个性化职位推荐、人脉拓展、职业建议；主要在探索测试阶段 |
| Uber | Uber AI Solutions | 面向企业的多智能体框架、工具与数据服务 |
| Klarna | AI 支付与购物助手、Agentic Product Protocol | 明确由 LangGraph 构建；已处理数百万次对话，自动化约七成重复客服任务，平均解决时间缩短约八成 |
| GitLab | GitLab Duo、CodeRider | Duo 是覆盖研发生命周期的 AI 套件；CodeRider 深度集成 GitLab，基于 LangGraph 开发，能做任务分解、跨文件改代码、跑终端命令 |

我以后想动手做的：学习助手（能记住我学到哪了）、客服机器人（接复杂咨询）、数据助手（跑多步分析）、带记忆的 NPC。

### LangGraph 生态系统

- `LangSmith`：追踪、评估、监控；调试图的时候几乎离不开。
- LangGraph 部署平台：把 Agent Server 部署和扩起来。
- LangChain：提供大量集成与组件。

> 注意：三者拼起来是完整的「开发 → 调试 → 部署」链路，但并不是绑死的。LangGraph 可以只身使用。

### 术语速查（这份笔记反复出现的名字）

| 名字 | 是什么 | 我什么时候碰它 |
| --- | --- | --- |
| `StateGraph` | 有状态图的构建器类 | 每次建图的第一步 |
| `CompiledStateGraph` | `compile()` 之后拿到的可执行对象 | 调用 `invoke` / `stream` 的那个东西 |
| `StateNode` | 节点的可执行对象形态 | 读 `add_node()` 参数时 |
| `START` / `__start__` | 图的入口特殊节点 | `add_edge(START, ...)` |
| `END` / `__end__` | 图的出口特殊节点 | 条件边返回 `"__end__"` 时 |
| `Send` | 运行时动态派发任务的对象 | 协调者-工作者模式 |
| `Command` | 同时携带「状态更新 + 跳转目标」的对象 | 中断恢复、节点内路由 |
| `Overwrite` | 绕过 reducer 直接覆盖状态值 | 想清空消息列表时 |
| `interrupt()` | 在图里主动按暂停 | 人工审批、人工填表 |
| `InMemorySaver` | 内存版 checkpointer | 本地开发 |
| `PostgresSaver` / `AsyncPostgresSaver` | Postgres 版 checkpointer | 生产 |
| `InMemoryStore` / `PostgresStore` | 跨会话的长期记忆仓库 | 记住用户画像 |
| `Store` | 长期记忆的抽象 | 语义搜索、跨线程共享 |

## LangGraph 的核心概念

### 常见概念区分

#### Agent（智能体）

一句话定义：会感知输入、自己拿主意、能排行动路线、会调工具去达成目标的自主软件实体。

核心一句话：**全程由大语言模型动态控制**。

我记的两个比喻：

- 我说「把单测覆盖率提到 80%」，它自己看代码、写测试、跑构建、看结果，直到达标才停 —— 中间不需要我插手。
- 私人助理机器人；我说「安排下周去上海出差」，它会自己拆成：查天气决定带什么衣服 → 比价订票 → 订酒店并推日程 → 提醒带身份证。

整个过程中**我并没有提前画流程图 —— 步骤是它现想现凑的**，这就是 Agent 行为。

#### 工作流（Workflow）

一句话定义：把复杂过程拆成若干定义清晰、按先后次序执行的任务，并在步骤之间自动搬运数据与状态。

**预设的、可重复的流程路径** —— 这句我当口诀记。

例子：报销单（交发票 → 主管签 → 财务核 → 结算 → 归档）；客服工单（提问 → 自动分类 → 派单 → 处理 → 评价 → 关单）。路径固定、沿着预设流程走，就是工作流。**LangGraph 实现的就是工作流。**

#### 两者区别

| 类型 | 英文 | 特点 | 适合 |
| --- | --- | --- | --- |
| 工作流 | Workflow | 路径固定、由代码驱动、步骤提前定好 | 流程明确的任务，比如客服工单 |
| 智能体 | Agent | 决策动态，路径由 LLM 决定 | 开放型问题，比如科研推理 |

- **Workflow 像「炒菜机器人」**：放油 → 炒蛋 → 加盐 → 出锅，一步不落；就算鸡蛋坏了它也照炒。
- **Agent 像「米其林主厨」**：会先想今天食材新不新鲜、客人有没有忌口、要不要换做法，能自己改菜单、调火候、尝完返工。

但不管走哪条路，做出来的东西都能叫 Agent Server。

### 工作流

工作流的代码路径是提前定死的，按固定次序跑。做复杂度更高的 AI 应用时，它能给边界清晰的任务带来可预测与一致。

书里的例子是研发一款城市通勤用的智能电动自行车（导航、社交、防盗），动手前先做多维分析：

- **市场分析**：用户看重能跑多远、车身沉不沉、防盗行不行，还冒出个新兴趣 —— 「骑行社交」（组队、晒路线）
- **竞品分析**：传统品牌智能化不足；互联网品牌续航和线下售后是短板。
- **技术分析**：更轻的电池材料与车身设计提升续航和便携，用 GPS + 移动网络做防盗，并与社交 App 打通。
- 最后汇总。

形状就是：`START` 同时分出三条分析分支，三条都汇入「汇总报告」，再指向 `END`。

```mermaid
flowchart LR
    S([START]) --> M[市场分析]
    S --> C[竞品分析]
    S --> T[技术分析]
    M --> R[汇总报告]
    C --> R
    T --> R
    R --> E([END])
```

在 LangGraph 里，工作流是搭在 LLM 之上的：LLM 出入两端之外，还挂着 `Retrieval`（检索）、`Memory`（记忆）、`Tool`（工具）三类增强能力 —— 也就是检索、短期记忆、工具调用这些。

> **再次强调**：它不关心我用什么模型和提示词，解决的是状态管理、流程编排、持久化、人工监督这类工程问题。

### 理解图计算

用节点和边表示复杂系统；在 AI 场景里，它特别适合搭多步骤、有状态的工作流。

用快递配送网络类比包裹从揽收站到配送站的过程：

```mermaid
flowchart LR
    LS[揽收站] --> FJ[分拣中心]
    FJ --> PS[配送站]
```

对应关系（**这张对照表是理解全篇的钥匙**）：

| 现实里的东西 | LangGraph 里的东西 |
| --- | --- |
| 揽收站 / 分拣中心 / 配送站 | 节点（Node） |
| 运输路线 | 边（Edge） |
| 包裹上的信息卡 | 状态（State） |
| 整套配送网 | 图（Graph） |

这三件套里有几个名字得先对齐。

### 实现工作流的核心概念

#### State —— 包裹上那张信息卡

就像包裹上的标签：当前位置、目的地、配送状态。全程所有站点都能看、能改。

三个性质：

- **共享性**：所有节点都可读可写
- **持久性**：整个工作流执行期间一直存在
- **结构化**：字段是明确声明出来的

```python
from typing import TypedDict

class PackageState(TypedDict):
    # 包裹基本信息
    package_id: str      # 包裹 id
    origin: str          # 始发站
    destination: str     # 目的地

    # 配送状态
    status: str          # "待揽收" / "运输中" / "派送中" / "已签收"
    history: list[str]   # 流转历史
    total_distance: int  # 总里程

    # 配送详情
    priority: str        # "普通" / "加急"
```

#### Nodes（节点）—— 快递站点

- 揽收站：收下包裹，把信息建好
- 分拣中心：按目的地分类
- 派送站：最终送到收件人手上

节点特征：

- **单一职责**：一个节点只管一件事
- **输入输出**：接状态进来，返回状态更新
- **独立性**：节点之间不直接通信，只通过 State 打交道

节点不过就是个函数：

```python
def receive_package(state: PackageState):
    """揽收站"""
    return {
        "status": "已揽收",
        "history": [f"在{state['origin']}揽收"],
    }

def sort_package(state: PackageState):
    """分拣中心：按目的地分拣"""
    destination = state["destination"]
    if "北京" in destination:
        next_station = "北京分拣中心"
    elif "上海" in destination:
        next_station = "上海分拣中心"
    else:
        next_station = "其他地区分拣中心"
    return {"status": "已分拣", "history": [f"分拣至{next_station}"]}

def final_delivery(state: PackageState):
    """派送站"""
    return {"status": "已签收", "history": [f"已送达{state['destination']}"]}
```

#### Edges（边）—— 快递运输路线

边决定包裹怎么从一个站点挪到下一个。路线分三类：

- **开始 / 结束路线**：流程的起点与终点（包裹的出发站、终点站）。

```mermaid
flowchart LR
    S([开始]) --> LS[揽收站]
    PS[配送站] --> E([结束])
```

- **固定路线**：所有包裹都走同一条，比如揽收站 → 分拣中心；而不会出现「配送站 → 揽收站」这种反向，配送站的去向是「家」。

```mermaid
flowchart LR
    LS[揽收站] -->|固定路线| FJ[分拣中心]
    PS[配送站] -.->|✗ 不可走| LS
    PS -->|实际去向| H[家]
```

- **条件路线**：按目的地走不同的分拣中心。

```mermaid
flowchart LR
    FJ[分拣中心] -->|北京分拣中心| BJ[北京分拣中心]
    FJ -->|上海分拣中心| SH[上海分拣中心]
    FJ -->|到达目的地| PS[配送站]
```

落到 LangGraph 的 API 上，边的类型就两种：

- **固定边**：永远从 A 到 B
- **条件边**：看状态决定下一步去哪

再把入口和出口两个特殊点加上，工作流就成型了。**节点**＝每个处理步骤的单元，**边**＝步骤之间的连接和次序，而**状态**将是图中所有节点与边共用的那份数据。

### State 更新机制：Reducers

这是我认为最容易踩坑、也最该先搞懂的一点。

节点返回的不是整个新状态，而只是一份「要改哪些字段」的增量。多个节点都要往同一个字段写时，怎么合并？答案靠 reducer。示例里用 `Annotated` 给 `history`、`total_distance` 指定了 reducer 函数 `operator.add`，语义就从「替换」变成了「追加 / 累加」。

```python
from typing import Annotated
from operator import add

class PackageState(TypedDict):
    # 覆盖更新：每次新状态替换旧状态
    status: str

    # 追加更新：新的流转记录添加到历史列表
    history: Annotated[list[str], add]

    # 数值累加：里程数累加
    total_distance: Annotated[int, add]
```

> **知识点小结**：`status` 走**覆盖更新**；`history` 走**追加更新**；`total_distance` 走**数值累加**。后两者之所以能累起来，全靠 `Annotated[..., add]` 里那个 reducer。

我现在的写法：默认字段用覆盖语义就够了（状态机式的「当前值」）；只有列表类字段（消息、历史、日志）才加 `operator.add`，否则每轮都会把前面的记录冲掉。

### 边与特殊节点的 API 细节

#### `add_node()` 的常用参数

| 参数名 | 类型 | 说明 |
| --- | --- | --- |
| `node` | 字符串 或 `StateNode` 对象 | 传字符串时该字符串就是节点名，真正的执行函数由 `action` 给；传 `StateNode` 对象时直接用它定义节点 |
| `action` | `StateNode` 对象或 `None`（默认） | `node` 是字符串时它承载实际执行逻辑；`node` 已是 `StateNode` 时通常为 `None` |

#### `add_edge()` 的常用参数

| 参数名 | 类型 | 说明 |
| --- | --- | --- |
| `start_key` | 字符串 或 字符串列表 | 这条边从哪个节点出发 |
| `end_key` | 字符串 | 边的结束节点的键 |

**`add_conditional_edges()` 的常用参数**（这个方法加的是条件边：起点一个，终点可以有多个）

| 参数名 | 类型 | 说明 |
| --- | --- | --- |
| `source` | 字符串 | 从哪个节点离开时触发这条条件边 |
| `path` | `Callable` 或 `Runnable` | 决定下一个（或下一批）节点的方法；没给 `path_map` 时应返回节点名，返回 `"END"` 则停止执行 |
| `path_map` | 字典 / 字符串列表 / `None` | 【可选】把 path 的返回值映射到节点名；省略时返回值必须本身就是节点名 |

#### 三个特殊节点

- `START`：特殊节点，表示把用户输入送进图的入口；引用的主要目的是确定「先调用哪些节点」。
- `END`：表示终端节点的特殊节点；用来指明哪些边走完之后没有后续动作。
- **条件入口点（Conditional Entry Point）**：用一个函数决定用户输入到达时先调用哪个节点。

#### 导入路径两套写法

```python
from langgraph.graph import StateGraph, START, END

# 等价写法：显式走 state 模块
from langgraph.graph.state import StateGraph
# 完整限定名就是 langgraph.graph.state.StateGraph
```

### 编译到底做了什么

第 2 步只是构建出 `StateGraph`，**它还不能直接执行，必须先编译**。`compile()` 会把它变成 `CompiledStateGraph`；产物实现了 `Runnable`，所以它能异步调、能流式传、也能批处理。

编译会顺手做个体检，主要看三件事：

- 每个节点从 `START` 出发都够得着
- 每个节点最终都能走到 `END`
- 不存在被孤立的节点，也没有死循环

**注意这里有个认知坑**：LangGraph 的「编译」和 C++/Java 那种语言编译完全不是一回事。它本质是运行时动态构建 + 校验一个图对象，不是把代码翻译成别的形态。

| 对比项 | LangGraph 的编译 | Java 的编译 | C++ 的编译 |
| --- | --- | --- | --- |
| 本质 | 组装并校验一份配置 | 把源码译成另一种形态（到中间码） | 把源码译成另一种形态（译成平台机器码） |
| 发生阶段 | 应用跑起来的时候（初始化） | 写代码的时候（构建） | 写代码的时候（构建） |
| 主要目的 | 1. 构建可执行的工作流对象；2. 结构验证 | 1. 高级语言转字节码；2. 语法与深度语义检查 | 1. 转特定平台机器码；2. 彻底检查；3. 链接所有模块生成可执行文件 |

另外，默认情况下图的输入和输出结构相同；`invoke()` 接受单个输入（字典或任意类型），默认返回最新的 State。

## 二、LangGraph 入门教程：构建 AI 工作流

这一章是三个递进的案例。

### 编码前的版本说明

- LangGraph 已经不再支持 Python 3.9，相关包都要求 Python 3.10 及以上。
- 用 `python --version` 先看一眼版本；低于 3.10 就直接换环境，别折腾。

### 【案例一】智能快递配送系统

顺着步骤走一遍。

### 编码思路：Graph API 的三步

建图顺序是固定的三步：**① 定义状态 → ② 定义并添加节点和边 → ③ 编译**。编译会顺手做结构检查（比如有没有孤立节点）。

写代码时的六步落地：

1. 定义 State（包裹信息）
2. 定义 `StateGraph` 图（成立快递公司）
3. 定义 Nodes（定义各个配送站点）
4. 添加 Nodes（把站点建进图里）
5. 添加 Edges（规划运输路线，含条件边）
6. 编译 + 测试

### 步骤 1：定义 State

```python
from typing import TypedDict, Annotated
from operator import add

# 1. 定义包裹状态
class PackageState(TypedDict):
    package_id: str             # 包裹 id
    origin: str                 # 始发站
    destination: str            # 目的地

    status: str                          # "待揽收" / "运输中" / "派送中" / "已签收"
    history: Annotated[list[str], add]   # 流转历史
    total_distance: Annotated[int, add]  # 总里程

    priority: str               # "普通" / "加急"
```

注意：状态既可以用 `TypedDict`，也可以用 `Pydantic` 模型；但 `Pydantic` 的性能不如 `TypedDict`，我一般只在需要校验时用它。

### 步骤 2：定义 StateGraph 图

`StateGraph` 是一套**有状态图计算框架**，走**有向图（Directed Graph）**模型，天生适合多步骤、带状态的工作流。它把复杂流程变得可视、可拆 —— 像设计快递配送网一样设计软件系统。

```python
from langgraph.graph import StateGraph, START, END

# 2. 成立快递公司
delivery = StateGraph(PackageState)
```

> 注意：到这一步只是有个构建器，**还不能执行**，必须编译。

### 步骤 3：定义 Nodes

节点就是 Python 函数（同步或异步都行）。两条铁律：

- 节点把**状态**当入参收下
- 节点**不需要返回整个**状态，给一份增量补丁就够了

```python
# 3. 定义各个配送站点
def receive_package(state: PackageState):
    """揽收站"""
    return {"status": "已揽收", "history": [f"在{state['origin']}揽收"]}

def sort_package(state: PackageState):
    """分拣中心：根据目的地分拣"""
    destination = state["destination"]
    if "北京" in destination:
        next_station = "北京分拣中心"
    elif "上海" in destination:
        next_station = "上海分拣中心"
    else:
        next_station = "其他地区分拣中心"
    return {"status": "已分拣", "history": [f"分拣至{next_station}"]}

def final_delivery(state: PackageState):
    """派送站"""
    return {"status": "已签收", "history": [f"已送达{state['destination']}"]}
```

### 步骤 4：添加 Nodes

```python
# 4. 添加配送站点
delivery.add_node("揽收站", receive_package)
delivery.add_node("分拣中心", sort_package)
delivery.add_node("派送站", final_delivery)
```

### 步骤 5：添加 Edges

**固定边**最简路线：揽收站 → 分拣中心 → 派送站。

```mermaid
flowchart TD
    S([START]) -->|初始化信息| A[揽收站]
    A --> B[分拣中心]
    B --> C[派送站]
    C -->|最终配送| E([END 派送结束])
```

**条件边**：加急件走空运、普通件走陆运。

```mermaid
flowchart TD
    S([START]) -->|初始化信息| A[揽收站]
    A --> B[分拣中心]
    B -.-> C1[加急配送]
    B -.-> C2[标准配送]
    C1 --> D[派送站]
    C2 --> D
    D -->|最终配送| E([END 派送结束])
```

先补两个分支节点，再连线：

```python
def standard_delivery(state: PackageState):
    """标准配送"""
    return {"status": "运输中", "history": ["标准陆运"], "total_distance": 500}

def express_delivery(state: PackageState):
    """加急配送"""
    return {"status": "加急运输", "history": ["空运加急"], "total_distance": 800}

delivery.add_node("标准配送", standard_delivery)
delivery.add_node("加急配送", express_delivery)

# 固定边
delivery.add_edge(START, "揽收站")
delivery.add_edge("揽收站", "分拣中心")

# 智能路由：根据优先级选择配送方式
def select_delivery(state: PackageState):
    """智能路由决策 - 根据包裹特性选择路线"""
    if state["priority"] == "加急":
        return "加急配送"
    return "标准配送"

delivery.add_conditional_edges(
    "分拣中心",               # source：起始节点
    select_delivery,          # path：确定下一个节点的可调用对象
    ["加急配送", "标准配送"],  # path_map
)

delivery.add_edge("标准配送", "派送站")
delivery.add_edge("加急配送", "派送站")
delivery.add_edge("派送站", END)
```

`path_map` 也可以用字典做「返回值 → 节点名」的映射：

```python
def select_delivery(state: PackageState):
    if state["priority"] == "加急":
        return "备注加急"
    return "无备注"

delivery.add_conditional_edges(
    "分拣中心",
    select_delivery,
    {"备注加急": "加急配送", "无备注": "标准配送"},
)
```

### 步骤 6：编译与测试

```python
# 7. 编译系统
delivery_system = delivery.compile()

# 8. 测试配送
test_packages = [
    {"package_id": "P001", "origin": "北京", "destination": "上海",
     "priority": "普通", "history": [], "total_distance": 0},
    {"package_id": "P002", "origin": "广州", "destination": "乌鲁木齐",
     "priority": "加急", "history": [], "total_distance": 0},
]

for package in test_packages:
    result = delivery_system.invoke(package)
    print(package["package_id"], result["status"], result["history"], result["total_distance"])
```

跑出来的效果：P001 走标准陆运、总里程 500；P002 走空运加急、总里程 800；两者最终都是「已签收」。**这一步很关键 —— 它验证了 reducer 真的在起作用**：如果 `history` 没加 `add`，我只会看到最后一条记录。

### 案例一回顾

| 概念 | 快递类比 | 作用 |
| --- | --- | --- |
| State | 包裹那张信息卡 | 把状态全记下来 |
| Nodes | 各个配送站点 | 干具体的活 |
| Edges | 运输路线 | 决定先后次序 |
| Reducers | 更新规则 | 定下变更怎么记 |

### 【案例二】会联网搜索的智能代理系统

先说要做成什么样。

### 案例介绍

一个「模型自己判断要不要搜、搜完再答」的循环式代理。流程：

```mermaid
flowchart TD
    Q[用户提问] --> J{LLM 判断是否需要搜索}
    J -->|不需要| A[返回最终答案]
    J -->|需要| S[执行搜索]
    S --> I[整合结果]
    I --> J
```

这个图要覆盖的能力清单：

- **智能对话与工具调用**：模型自己决定调不调工具
- **自动搜索整合**：把搜索结果回灌给模型
- **循环决策机制**：搜完再判断，可以来回多轮
- 延伸场景：实时信息查询、事实核查、深度研究、知识扩展

### 编码思路：设置 Nodes / State / Edges

**设置 Nodes**（靠单一职责原则拆）

- 节点 1 `tool_node`：专门负责搜索，拿搜索结果
- 节点 2 `llm_call`：专门负责调模型，拿最终结果

**设置 State**（靠共享性原则）

把历史对话存进 State 的 `messages` 列表，是构建对话系统的关键：

```python
from typing import Annotated, TypedDict
from langchain_core.messages import AnyMessage
import operator

class AgentState(TypedDict):
    # 类型: list[AnyMessage]；合并策略: operator.add —— 新消息追加而非替换
    messages: Annotated[list[AnyMessage], operator.add]
    # 类型: int —— 跟踪 LLM 调用次数
    llm_call_count: int
```

> 注意 `Annotated[list[AnyMessage], operator.add]` 这个注解特别重要：`operator.add` 让新消息**追加**到列表而不是替换，这保证了对话历史的连续性。

`messages` 的三重作用：

1. **对话记忆**：存储完整的对话流程
2. **上下文维护**：`llm_call` 节点调用模型时，把整个 `messages` 当上下文传进去，模型基于完整历史生成回复
3. **状态持久化**：`messages` 字段在节点之间传递，对话状态不会丢

没有这个字段，系统每次都像第一次对话。

#### 设置 Edges

```mermaid
flowchart TD
    S([__start__]) --> L[llm_call]
    L -.->|不调工具| E([__end__])
    L -.->|要调工具| T[tool_node]
    T --> L
```

- **对于开始逻辑**：用户输入后直接交给模型处理，「是否需要搜索」也让模型判断，所以入口点就是 `llm_call`。
- **对于结束逻辑**：看模型返回的结构里有没有工具调用 —— 要调工具就去 `tool_node`；不调就结束。

实线是普通边（`add_edge`），虚线是 `add_conditional_edges` 产生的条件边。

### 代码实现

### 步骤 1：先把模型和搜索工具备好

```python
# 步骤 1: 定义工具和模型
tools = [search_tool]              # 例如 TavilySearch 之类的搜索工具
model = init_chat_model("gpt-4o-mini", temperature=0)
model_with_tools = model.bind_tools(tools)   # 绑定工具
# 模型这一次的回复就是 new_ai_message = AIMessage(...)，随后被塞进 messages
```

**步骤 2：定义状态**（同上面的 `AgentState`）

### 步骤 3：模型节点

```python
# 步骤 3: 定义模型节点
def llm_call(state: AgentState):
    response = model_with_tools.invoke(
        [SystemMessage(content="你是一个乐于助人的助手")] + state["messages"]
    )
    # 只返回一个更新，reducer 会把它追加进 messages
    return {"messages": [response], "llm_call_count": state.get("llm_call_count", 0) + 1}
```

### 步骤 4：工具节点

三个要点，我认为这段是案例二的核心。

- **要点 1：回顾 `AIMessage` 消息结构。** 模型要调工具时，输出的 `AIMessage` 里带一个 `tool_calls` 属性，包含工具名和输入参数 —— 有这些就能发起工具调用。
- **要点 2：构造 `ToolMessage`。** 光调用成功不够，必须把工具返回值包成 `ToolMessage` 再送回模型，才能拿到真正想要的答案。完整链路是：`HumanMessage` → `AIMessage`（含工具调用）→ `ToolMessage` → 模型再输出最终 `AIMessage`。

```python
from langchain_core.messages import ToolMessage

tool_message = ToolMessage(
    content=str(tool_output),
    tool_call_id=ai_message.tool_calls[0]["id"],
)
```

- **要点 3：在 State 中访问 messages 用点表示法。** 虽然可以传「字典形态」的消息，但 State 里的 message 更新总是会被**反序列化为 LangChain Message 格式**。所以要访问 `AIMessage` 的 `tool_calls`，得用 `state["messages"][-1].tool_calls` 这种**点表示法**，而不是下标取字典。

```python
# 步骤 4: 定义工具节点
def tool_node(state: AgentState):
    outputs = []
    for tool_call in state["messages"][-1].tool_calls:
        result = tools_by_name[tool_call["name"]].invoke(tool_call["args"])
        outputs.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))
    return {"messages": outputs}
```

### 步骤 5：构建图

```python
# 步骤 5: 构建图
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode, tools_condition

builder = StateGraph(AgentState)
builder.add_node("llm_call", llm_call)
builder.add_node("tool_node", ToolNode(tools))   # ToolNode 直接吃工具列表
builder.add_edge(START, "llm_call")

# 定义结束逻辑：手写 should_continue
def should_continue(state: AgentState):
    last = state["messages"][-1]
    if last.tool_calls:            # 如果 LLM 调用工具，则执行操作
        return "tool_node"
    return END

builder.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
builder.add_edge("tool_node", "llm_call")

# 编译图
agent_builder = builder.compile()
```

我的习惯：能用手写的 `should_continue` 就手写，逻辑一眼能看懂；只判断「有没有工具调用」这种标准场景，直接用框架给的 `tools_condition` 更省事（案例三就用它）。

### 步骤 6：可视化图

编译出来的图带一个 `get_graph()`，传 `xray=True`（或 `xray=1`）就是详细视图；接着 `draw_mermaid_png()` 会吐出 PNG 的二进制内容；再用 `matplotlib` 显示即可。

```python
import matplotlib.pyplot as plt

png_bytes = agent_builder.get_graph(xray=1).draw_mermaid_png()
with open("graph.png", "wb") as f:      # 保存文件
    f.write(png_bytes)
plt.imshow(plt.imread("graph.png"))     # 使用 matplotlib 显示图像
plt.show()
```

Mermaid 本身是一种用文本描述流程图的标记语言，画甘特图、时序图、饼图都行；不装 matplotlib 也可以直接把文本贴到在线编辑器里看。

### 步骤 7：执行（非流式与流式）

```python
# 非流式
result = agent_builder.invoke({"messages": [HumanMessage(content="今天天气怎么样？")]})
print(result["messages"][-1].content)

# 流式：看图的执行步骤
for chunk in agent_builder.stream({"messages": [HumanMessage(content="今天天气怎么样？")]}):
    print(chunk)
```

> 注意这里的「流式」指的是**图执行步骤的流式输出**（经过节点的过程），不是 token 流。每个节点对 State 的更新值（注意：是**将要更新的值**，不是更新后的值）都能这样追踪。所以 `chunk` 类型是 `dict`：key 是节点名，value 是待更新的 State 片段。

### 【案例三】代理式 RAG：会自我纠错的检索增强生成系统

先看它跟链式写法差在哪。

### 案例介绍

链式 RAG 是一条直线，好处是简单：

- **概念少**：只要理解 `Runnable`、`StrOutputParser` 这类基础东西
- **逻辑简单**：线性流程，好理解好调试
- **代码直观**：一眼能看出数据怎么流
- **快速上手**：几分钟就能跑通

但它的形状是写死的。这个案例要做的是**按检索质量动态调整查询策略**的文档问答系统：

```mermaid
flowchart TD
    Q[用户问题] --> D{AI 决策是否需要检索}
    D -->|否 / 直接回答| A[结束]
    D -->|是 / 检索文档| R[检索]
    R --> C{质量检查：资料相关吗}
    C -->|合格| G[生成答案]
    C -->|不合格| W[重写问题]
    W --> D
    G --> A
```

举个我实际跑过的例子：知识库放几篇课程宣传文档，然后问「这些课都包含哪些方向」「Java 方向的课程安排是什么」「Redis 课程讲了什么」。当用户问「总共提供了哪些课程」时，链路是：

1. 模型决定调用检索工具，用「课程」相关关键词去搜
2. 检索到文档后做相关性评估
3. 搭得上就直接答；搭不上就把问题改写一遍再搜

**鲁棒性**是这个案例的关键词。它指的是系统在各种内外部干扰下仍能保持性能稳定：

- 说的是有不确定性、有噪声、有误差时它表现如何
- 它和稳定性不同：稳定性关注扰动消失后能否恢复，鲁棒性关注持续扰动下还稳不稳
- 放到模型上：环境陌生或带噪声时，它照样能把预期任务做完

一句话对比：链式 RAG 解决「怎么让 RAG 跑起来」，这个案例解决「怎么让它跑得更好、更智能」。

### 编码思路

- **模块化设计**：一个节点只担一件事
- **质量闭环**：查 → 评 → 改 → 再查
- **智能路由**：下一步走哪儿由 AI 自己定，不靠人工干预

四步走：

1. 把「知识库」备齐（加载 + 切分）
2. 创建「检索工具」
3. 把流程里的节点设计出来
   - 节点 1：`generate_query_or_respond`，负责决策
   - 节点 2：`retrieve`，检索工具
   - 节点 3：`rewrite_question`，改写提问
   - 节点 4：`generate_answer`，产出答案
4. 组装「工作流水线」
   - 条件边 1：让 LLM 决定要不要去知识库里搜
   - 条件边 2：判断捞回来的文档跟问题搭不搭

```mermaid
flowchart TD
    S([__start__]) --> G[generate_query_or_respond]
    G -.->|tools| R[retrieve]
    G -.->|直接回答| E([__end__])
    R -.->|相关| A[generate_answer]
    R -.->|不相关| W[rewrite_question]
    A --> E
    W --> G
```

### 代码实现

#### 步骤一：把知识库备好，再做一个检索工具

```python
# 聊天模型与嵌入模型
model = init_chat_model("gpt-4o-mini", temperature=0)
embeddings = init_embeddings("openai:text-embedding-3-small")

# 加载文档列表 → 切分 → 建向量库
docs = loader.load()
splits = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    chunk_size=100, chunk_overlap=50
).split_documents(docs)

# 使用内存中向量存储和 OpenAI 嵌入
vectorstore = InMemoryVectorStore.from_documents(splits, embedding=embeddings)
retriever = vectorstore.as_retriever()

# 使用 LangChain 的预构建 create_retriever_tool 创建检索器工具
retriever_tool = create_retriever_tool(
    retriever,
    "retrieve_blog_posts",
    "搜索并返回关于课程内容的文档片段。",
)
```

`create_retriever_tool()` 的参数说明：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `retriever` | `BaseRetriever` | 检索器实例，负责实际检索 |
| `name` | `str` | 工具名，会传给语言模型，必须唯一且有描述性 |
| `description` | `str` | 工具描述，帮模型判断何时该用它 |

它返回 `Tool` 对象，而 `Tool` 继承自 `BaseTool` —— `BaseTool` 是所有 LangChain 工具的基类。执行工具用 `invoke()`，参数就是检索器的执行参数。

#### 步骤二：把节点设计出来

- **节点 1：决策 `generate_query_or_respond`**：决定直接回答还是检索文档。核心是用 `model.bind_tools([retriever_tool])` 让模型能调检索工具。

```python
def generate_query_or_respond(state: MessagesState):
    response = model.bind_tools([retriever_tool]).invoke(state["messages"])
    return {"messages": [response]}
```

`MessagesState` 是 LangGraph 内置的、只含 `messages` 的 State，可以直接用 —— 省掉自己写 `Annotated[list[AnyMessage], operator.add]` 的功夫。

实测：问「总共提供了哪些课程？」，模型决定先检索，连第一版查询词都拟好了。

- **节点 2：检索工具 `retrieve`**：直接用 `ToolNode` 类定义。

```python
retrieve = ToolNode([retriever_tool])
```

`ToolNode` 的作用就是造一个专门跑工具的节点。

- **节点 3：改写问题 `rewrite_question`**：文档不相关时重写问题，改善检索效果。

```python
def rewrite_question(state: MessagesState):
    question = state["messages"][0].content
    response = model.invoke([
        HumanMessage(content=f"请把这个问题改写得更利于检索：\n\n{question}")
    ])
    return {"messages": [HumanMessage(content=response.content)]}
```

- **节点 4 答案生成节点 `generate_answer`**：拿着相关文档写出答案。提示词里要放**最初那个问题**，参考材料用**最近一轮搜到的内容**。

```python
def generate_answer(state: MessagesState):
    question = state["messages"][0].content                                  # 最原始问题
    context = state["messages"][-1].content                                  # 最新问题的检索结果
    response = model.invoke([
        HumanMessage(content=f"根据以下文档回答问题：\n\n{context}\n\n问题：{question}")
    ])
    return {"messages": [response]}
```

#### 步骤三：组装工作流水线

```python
workflow = StateGraph(MessagesState)

# 添加节点与入口点
workflow.add_node("generate_query_or_respond", generate_query_or_respond)
workflow.add_node("retrieve", retrieve)
workflow.add_node("rewrite_question", rewrite_question)
workflow.add_node("generate_answer", generate_answer)
workflow.add_edge(START, "generate_query_or_respond")

# 条件边1：LLM 决策是否需要进行知识库检索
workflow.add_conditional_edges(
    "generate_query_or_respond",
    tools_condition,          # 等价于手写 should_continue
)

# 条件边2：检测检索到的文档是否与问题相关
def grade_documents(state: MessagesState) -> Literal["generate_answer", "rewrite_question"]:
    question = state["messages"][0].content
    context = state["messages"][-1].content
    prompt = f"判断这段检索内容与问题是否相关，只回答 yes 或 no。\n\n{context}\n\n问题：{question}"
    response = model.with_structured_output(GradeDocuments).invoke(
        [HumanMessage(content=prompt)]
    )
    score = response.binary_score       # yes / no
    return "generate_answer" if score == "yes" else "rewrite_question"

workflow.add_conditional_edges("retrieve", grade_documents)
workflow.add_edge("generate_answer", END)
workflow.add_edge("rewrite_question", "generate_query_or_respond")

rag_agent = workflow.compile()
```

`tools_condition()` 的规则很简单：

- 最后一条 AI 消息里有工具调用 → 路由到工具执行节点
- 否则 → 结束工作流

它返回 `Literal["tools", "__end__"]`：有工具调用返回 `"tools"`，否则返回 `"__end__"`。

条件边 2 的评估用**结构化输出**拿一个二元评分（`yes` / `no`），再翻译成下一步路由目标 `"generate_answer"` 或 `"rewrite_question"`。

### LangGraph 的其他特性

### 使用 `Overwrite` 绕过 reducer

reducer 决定状态更新怎么合并。但总有想「直接覆盖」的时候：聊天应用里新消息通常是追加，可我要清空聊天记录重开，就得绕过追加逻辑。

```python
from langgraph.types import Overwrite

def reset_messages(state: MessagesState):
    # 绕过 reducer 并替换整个消息列表
    return {"messages": Overwrite(["replacement message"])}
```

输出只剩 `["replacement message"]`，前面那几条不会留下。

> 注意：`Overwrite` 要从 `langgraph.types` 导入；用法就是把新值包进 `Overwrite(...)` 再返回。

适用场景：

- 重置对话：把聊天记录清空重开
- 状态重置：出错恢复之后把应用状态拨回去
- 数据清理：把坏掉或过期的那份换掉

### 定义输入输出模式

默认只用一套状态模式。可以拆成三份：

- 输入模式独立：管进来的数据合不合规
- 输出模式独立：该露的才露，其余滤掉
- 内部模式：节点之间传的那份完整状态

为什么要拆？考虑问答系统：输入是用户问题（字符串），输出是 AI 答案（字符串），但内部要存中间结果、上下文 —— 我不想把这些内部状态暴露给用户。

`StateGraph` 的初始化参数：

| 参数名 | 类型 | 说明 |
| --- | --- | --- |
| `input_schema` | `type[InputT]` 或 `None` | 定义输入用的 State 类 |
| `output_schema` | `type[OutputT]` 或 `None` | 定义输出用的 State 类 |
| `state_schema` | `type[StateT]` | 定义内部完整 State 类 |

```python
# 1. 定义输入模式 - 只包含用户问题
class InputState(TypedDict):
    question: str

# 2. 定义输出模式 - 只包含 AI 答案
class OutputState(TypedDict):
    answer: str

# 3. 定义完整状态模式（内部使用）
class OverallState(InputState, OutputState):
    pass

def answer_node(state: OverallState):
    # 这里可以访问 question，生成 answer
    return {"answer": "..."}

# 构建图时指定输入输出模式
builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
```

跑一下会发现 `question` 被滤掉了，输出里看不到。适用场景：写 API（请求与响应边界清楚）、微服务（服务之间约定好字段）、数据管道（进出规格写明白）。

### 在节点间传递私有状态

有些临时数据对中间逻辑重要，但不该出现在最终输出里，只在特定节点之间共享 —— 这就是私有状态。

场景：根据数据库信息生成报告，三个节点 ——

1. 节点 1：捞原始数据（里面有敏感字段）
2. 节点 2：加工一遍，把敏感字段剔掉
3. 节点 3：出报告

节点 1 和 2 要共享原始数据，节点 3 不该看到敏感信息。

```python
class OverallState(TypedDict):
    final_result: str            # 公共状态（最终输出中可见）

class Node1Output(TypedDict):
    sensitive_data: str          # 节点1的私有输出

class Node2Input(OverallState):
    sensitive_data: str          # 节点2需要的输入（包含私有数据）

def node_1(state: OverallState) -> Node1Output:
    return {"sensitive_data": "原始敏感数据"}

def node_2(state: Node2Input) -> OverallState:
    # 处理数据，返回清理后的结果
    return {"final_result": "已清理的报告"}

def node_3(state: OverallState) -> OverallState:
    return {"final_result": state["final_result"] + "（终稿）"}

# 构建图
builder = StateGraph(OverallState)
# add_sequence：支持添加一系列节点，按所给的顺序执行。
builder.add_sequence([node_1, node_2, node_3])
```

> **要点**：私有状态靠**函数签名上的类型标注**声明 —— 入参写 `Node2Input`，返回值写 `Node1Output`，图本身用 `OverallState` 当公共状态。`Node1Output` 里的 `sensitive_data` 只在相邻两步之间用，落不到最终状态里；节点 3 拿到的只有 `final_result`。

### 在节点间传递私有状态（续）

跑起来会看到：`sensitive_data` 不出现在最终状态里，只剩 `final_result`。

适用场景：数据处理（步骤间的临时量）、鉴权流程（令牌这类敏感值）、复杂计算（中间结果）、错误处理（细节留在内部，对外只给友好提示）。

## 三、工作流的常见模式

所谓工作流模式，就是一条提前定好的执行路径：跟工厂流水线一样，每步进出什么都写清楚，按场景挑形状就行。这五种我都写过一遍，下面记形状 + 关键 API + 我踩过的点。

### 1. 提示链模式（Prompt Chaining）

### 概念

**提示链**就是串糖葫芦：上一步的输出就是下一步的输入。内容创作最典型 —— **大纲 → 初稿 → 润色 → 最终稿**，每一步的产出都往下传，质量才逐级往上抬。

```mermaid
flowchart LR
    S([START]) --> A[大纲生成]
    A -->|大纲| B[初稿生成]
    B -->|初稿| C[润色文章]
    C -->|润色版| D[最终稿生成]
    D --> E([END])
```

### 模式实践

四个节点，每个只干一件事：

- `generate_outline`：只管写大纲
- `generate_draft`：只管写初稿
- `polish_content`：只管润色
- `finalize_content`：只管出终稿

这个模式里我会顺手用上「独立输入输出模式」：

```python
# 1. 定义输入模式 - 只包含用户输入
class InputState(TypedDict):
    topic: str

# 2. 定义输出模式 - 只包含最终结果
class OutputState(TypedDict):
    final_article: str

# 3. 定义完整状态模式（内部使用）
class OverallState(InputState, OutputState):
    outline: str
    draft: str
    polished: str

def generate_outline(state: OverallState):      # 第一步：生成大纲
    return {"outline": llm.invoke(f"给这个主题写大纲：{state['topic']}").content}

def generate_draft(state: OverallState):        # 第二步：基于大纲生成初稿
    return {"draft": llm.invoke(f"按大纲写初稿：{state['outline']}").content}

def polish_content(state: OverallState):        # 第三步：润色稿件
    return {"polished": llm.invoke(f"润色这段文字：{state['draft']}").content}

def finalize_content(state: OverallState):      # 第四步：生成最终稿
    return {"final_article": llm.invoke(f"输出最终稿：{state['polished']}").content}

# 构建工作流
workflow = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
workflow.add_node("generate_outline", generate_outline)   # 添加节点
workflow.add_node("generate_draft", generate_draft)
workflow.add_node("polish_content", polish_content)
workflow.add_node("finalize_content", finalize_content)

# 连接节点（直线流程）
workflow.add_edge(START, "generate_outline")
workflow.add_edge("generate_outline", "generate_draft")
workflow.add_edge("generate_draft", "polish_content")
workflow.add_edge("polish_content", "finalize_content")
workflow.add_edge("finalize_content", END)

app = workflow.compile()      # 编译工作流
app.invoke({"topic": "人工智能的未来发展"})   # 使用工作流
```

这个例子跑出来的提纲长这样（模型自己发挥的标题层级）：

- **技术趋势与创新方向**
  - 自然语言处理的进步
  - 机器学习与深度学习的演变
  - 强人工智能的可能性
- **应用领域与社会影响**
  - 医疗行业的变革
  - 自动化与就业市场的关系
  - 伦理与监管的挑战

**我认识的优点**：逻辑简单、代码直观、快速上手，调试时每个节点的日志一眼能对上是哪一步。

### 2. 并行化模式（Parallelization）

### 概念

**并行化**：多个任务同时跑、最后汇总，效率高。适合从多个角度处理同一个问题。

还是那个**智能电动自行车**的例子（城市通勤，带导航、社交、防盗）。开工前先做多维分析：

- **市场分析**：用户看重能跑多远、车重、防盗，还冒出个新兴趣 —— 「骑行社交」（组队、晒路线）
- **竞品分析**：老牌子智能化做得不够；互联网牌子短板在续航和线下售后
- **技术分析**：用更轻的电池与车身方案把续航和便携提上去，再基于 GPS + 移动网络做防盗，并和社交 App 打通

最后汇总。并行分析不只是省时间，决策质量也更好。

```mermaid
flowchart LR
    S([START]) --> M[市场分析]
    S --> C[竞品分析]
    S --> T[技术分析]
    M --> R[汇总报告]
    C --> R
    T --> R
    R --> E([END])
```

### 模式实践

```python
# 三个并行分析任务
def market_research(state: BikeState):
    return {"market_report": llm.invoke("分析城市通勤电动自行车的市场...").content}

def competitor_research(state: BikeState):
    return {"competitor_report": llm.invoke("分析竞品...").content}

def tech_research(state: BikeState):
    return {"tech_report": llm.invoke("分析技术路线...").content}

# 汇总结果
def summarize(state: BikeState):
    merged = f"{state['market_report']}\n{state['competitor_report']}\n{state['tech_report']}"
    return {"final_report": llm.invoke(f"汇总成研发建议：{merged}").content}

# 构建工作流
builder = StateGraph(BikeState)
builder.add_node("market", market_research)
builder.add_node("competitor", competitor_research)
builder.add_node("tech", tech_research)
builder.add_node("summary", summarize)

# 并行执行三个分析
builder.add_edge(START, "market")
builder.add_edge(START, "competitor")
builder.add_edge(START, "tech")

# 汇总结果
builder.add_edge("market", "summary")
builder.add_edge("competitor", "summary")
builder.add_edge("tech", "summary")
builder.add_edge("summary", END)
```

**坑**：三个分支同时往 `summary` 汇入时，如果状态字段没配好 reducer，写进去的报告会互相覆盖。我的做法是每个分支写自己的独立字段。

### 3. 路由模式（Routing）

### 概念

**路由模式**也叫「智能分流」：按输入内容决定走哪个分支。最典型的落地是智能客服，把用户问题自动分给对应处理流程。

```mermaid
flowchart LR
    S([START]) --> A[分析问题类型]
    A -->|售前咨询| P[售前处理]
    A -->|售后问题| Q[售后处理]
    A -->|技术问题| T[技术处理]
    P --> E([END])
    Q --> E
    T --> E
```

### 模式实践

核心设计就两条：

- **动态路径选择**：基于 LLM 的分析结果（结构化返回）动态决定执行路径
- **分支隔离**：不同类别的问题交给专用处理器

节点设计：

- `model_call_router`：路由脑，让 LLM 用结构化返回拍板
- `pre_sale_handler`：接售前咨询
- `after_sale_handler`：接售后
- `technical_handler`：接技术问题

```python
# 定义路由决策的数据结构
class RouteDecision(BaseModel):
    category: Literal["售前咨询", "售后问题", "技术问题"]

# 路由决策节点
def model_call_router(state: ChatState):
    decision = llm.with_structured_output(RouteDecision).invoke(state["messages"])
    return {
        "route_decision": decision.category,
        # 构造一条可以进消息序列的路由结果
        "messages": [AIMessage(content=f"已识别为「{decision.category}」")],
    }

def pre_sale_handler(state: ChatState):
    return {"messages": [AIMessage(content="售前咨询已处理")], "final_result": "售前咨询已处理"}

def after_sale_handler(state: ChatState):
    return {"messages": [AIMessage(content="售后问题已处理")], "final_result": "售后问题已处理"}

def technical_handler(state: ChatState):
    return {"messages": [AIMessage(content="技术问题已处理")], "final_result": "技术问题已处理"}

# 路由函数 - 根据决策返回下一个节点
def route_decision(state: ChatState):
    return state["route_decision"]

# 构建路由工作流
builder = StateGraph(ChatState)
builder.add_node("model_call_router", model_call_router)   # 先经过路由决策
builder.add_node("pre_sale_handler", pre_sale_handler)     # 添加处理节点
builder.add_node("after_sale_handler", after_sale_handler)
builder.add_node("technical_handler", technical_handler)
builder.add_edge(START, "model_call_router")

# 条件边：根据路由结果选择分支
builder.add_conditional_edges(
    "model_call_router",
    route_decision,
    ["pre_sale_handler", "after_sale_handler", "technical_handler"],
)

# 所有分支最终都结束
builder.add_edge("pre_sale_handler", END)
builder.add_edge("after_sale_handler", END)
builder.add_edge("technical_handler", END)
```

**坑**：`add_conditional_edges` 的 `path_map` 列表里，每个返回值都必须能对上节点名，否则编译期或运行期会直接报「找不到节点」。路由键最好用 `Literal` 收口，让类型检查帮我挡住拼写错误。

### 4. 协调者-工作者模式（Orchestrator-Workers）

### 概念

分工是它的关键词。**协调者-工作者**：一个大脑带一群工人 —— 大脑拆活、派活，多个工人（工作者）并行执行，最后合成结果。

比如啃几百页技术文档：先由协调者切章节，再派几个工人各领一块并行做，最后合并。

```mermaid
flowchart TD
    S([开始]) --> O[协调者：拆分并分配任务]
    O -.-> W1[工作者：章节1处理]
    O -.-> W2[工作者：章节2处理]
    O -.-> W3[工作者：章节3处理]
    W1 --> SYN[合成器：最终汇总]
    W2 --> SYN
    W3 --> SYN
    SYN --> E([结束])
```

它和并行化的分界在**活是谁派的**：

| 模式 | 活怎么派 |
| --- | --- |
| **并行化** | 任务在写代码时就定好了，一起开跑 |
| **协调者-工作者** | 派活这件事发生在运行时，条数由协调者定 |

两个小例子帮我区分：

| 场景 | 并行化 | 协调者-工作者 |
| --- | --- | --- |
| 文档翻译 | 已知要翻 3 个固定章节，同时翻 | 先分析文档结构，发现要翻 5 个章节，动态分配 |
| 数据分析 | 同时算平均值、最大值、最小值（指标固定） | 先看数据特征，再决定该算哪些统计指标 |

### 模式实践

要实现的三个角色：

- **协调者**：按 `{topic}` 生成报告大纲，并按大纲把「写内容」的子任务指派出去
- **工作者**：生成大纲里对应那条的内容（协调者给 3 个标题就要 3 个工作者，给 10 个就要 10 个）
- **合成器**：汇总所有工作者的产出

关键在于派活：**边的数量在运行时才能确定** —— 这是它跟并行化最本质的差别。所以 LangGraph 允许条件边直接返回 `Send`。它有两个参数：先写节点名，再写要交给那个节点的状态。

```python
from langgraph.types import Send

# 定义数据结构-结构化输出
class Sections(BaseModel):
    sections: list[str] = Field(description="报告的章节标题列表")

# 创建规划器
planner = llm.with_structured_output(Sections)

# 协调者节点 - 制定计划
def orchestrator(state: ReportState):
    plan = planner.invoke([HumanMessage(content=f"为这个主题规划章节：{state['topic']}")])
    return {"sections": plan.sections}

# 工作者节点 - 执行具体任务
def llm_call(state: SectionState):
    return {"completed_sections": [llm.invoke(f"写这一节：{state['section']}").content]}

# 汇总节点
def synthesizer(state: ReportState):
    return {"final_report": "\n\n".join(state["completed_sections"])}

# 任务分配函数 - 关键部分！
def assign_workers(state: ReportState):
    # 为每个章节创建一个工作者任务
    return [Send("llm_call", {"section": s}) for s in state["sections"]]

# 构建工作流
builder = StateGraph(ReportState)
builder.add_node("orchestrator", orchestrator)
builder.add_node("llm_call", llm_call)
builder.add_node("synthesizer", synthesizer)
builder.add_edge(START, "orchestrator")

# 关键：协调者后创建多个工作者（动态生成 n 条边）
builder.add_conditional_edges("orchestrator", assign_workers, ["llm_call"])

# 所有工作者完成后汇总
builder.add_edge("llm_call", "synthesizer")
builder.add_edge("synthesizer", END)
```

**坑**：`Send` 派出去的工作者写回状态时也需要 reducer，否则多个工作者的结果会互相冲掉；另外 `Send` 的目标节点拿到的是**我在第二个参数里给的那份状态**，不是父图的完整状态。

### 5. 评估器-优化器模式（Evaluator-optimizer）

### 概念

流程三步：先出内容 → 再评质量 → 不行就返工，一直磨到达标。经典场景是内容打磨（**内容质量优化**）与写代码（**代码生成和改进**）。

```mermaid
flowchart TD
    S([开始]) --> G[生成内容]
    G --> E[评估质量]
    E -->|需要改进| G
    E -->|达标| F([结束])
```

### 模式实践

说实话，案例三本身就是评估器-优化器的一个完整变体：它看检索结果好不好，再决定是否换查询词。核心在**质量检测**这一步：

```python
def evaluate(state: QAState):
    # 评估逻辑...
    score = llm.with_structured_output(Grade).invoke(...).binary_score
    return {"score": score}

def route_after_eval(state: QAState):
    return "generate" if state["score"] == "no" else END
```

> 提示：关键在「谁来评估」。把 LLM 当**评估器**是一种；也可以做成**人机交互式**评估 —— 除此之外还支持交给人工判定，同样靠中断实现。

### 五种模式怎么选

| 模式 | 形状 | 关键 API | 我一般用它做 |
| --- | --- | --- | --- |
| 提示链 | 一条直线 | `add_edge` 串起来 | 有明确先后依赖的多步生成 |
| 并行化 | 扇出 → 汇合 | 多条 `add_edge(START, x)` | 多角度分析、多方校验 |
| 路由 | 一分多 | `add_conditional_edges` | 意图分类、工单分流 |
| 协调者-工作者 | 动态扇出 | `Send` | 任务条数运行时才知道 |
| 评估器-优化器 | 带条件的回环 | 条件边 + 循环 | 质量不达标要重做 |

## 四、LangGraph 持久化（Persistence）

这一章解决「记得住」。

### 什么是持久化能力？

**持久化能力**指把 AI 应用的状态（聊过什么、算到哪了、用户是谁）落盘存住，进程重启或机器宕了还能捡回来，让 AI 忘不掉之前发生的事。

两个最直观的场景：

- **场景一**：今天和助手聊了很多重要信息，关掉应用；明天重新打开，我希望它还记得我说过什么。
- **场景二**：一个能联网搜索的助手。搜索完拿到「今天晴，25 度」，程序崩溃重启，我再问「那要带伞吗」—— 没有持久化时它没有上文，可能又去调一次搜索；有持久化时它读到状态里的「今天晴」，直接答「不需要带伞」。

| 没有持久化 | 有持久化 |
| --- | --- |
| 问「今天天气怎么样」→ 调搜索 → 得到「晴，25 度」 | 同样得到答案，且**这个状态（对话历史 + 工具调用结果）被自动保存** |
| 进程挂了重启 | 进程挂了重启 |
| 再问「那我需要带伞吗」 | 在同一会话下再问同样的话 |
| 没有上文，可能又去调搜索 | 加载之前保存的状态，看到「晴」，直接答「不需要带伞」，无需再调工具 |

在 LangGraph 里，持久化具体拆成两部分：

1. **【线程级】持久化**：每一步都**自动保存**一份**状态快照**，让单次会话的上下文不断线。
   - **解释一**：这里的「线程」和操作系统的线程毫无关系。系统线程是进程内的调度单位；这里的线程指聊天里的单次会话，用来隔离不同会话。
   - **解释二**：这份**状态快照**不等于 State 快照，它把该有的上下文都装了进去：调过哪些工具、用户说过什么、聊到哪了、下一个该跑谁，全在里面。
2. **【跨会话】持久化**：用 `Store` 兜住用户资料、偏好这类长期数据，让不同对话之间能共享。
   - 例如把「用户有高血压病史」存下来，之后不管新开几个会话窗口，都能拿它当依据。

### 线程级持久化：两个零件

### 线程级持久化是怎么工作的？

工作流跑起来之后，可能会碰上**崩溃或重启导致的中断**。线程级持久化会在每一步自动存一份状态快照，于是执行过程有三种走向：

- **正常执行**：按节点顺序一路往下
- **异常恢复**：崩在两步之间时，从持久化存储里取回对应快照，接着往下跑
- **检查点回滚**：工作流结束后，也可以按需挑一个早先的状态快照回滚过去

```mermaid
flowchart LR
    S([开始]) --> N1[节点1]
    N1 --> P1[(快照1)]
    N1 --> N2[节点2]
    N2 --> P2[(快照2)]
    N2 --> N3[节点3]
    N3 --> E([结束])
    P1 -.->|异常恢复| N2
    P2 -.->|检查点回滚| N1
```

它保证了三件事：

1. **状态不丢失**：崩了、重启了、长流程被打断了，恢复时能从上次停下的地方继续，而不是从头重来。
2. **支持长时间运行的任务**：需要多轮交互（多步对话助手）或等待外部 API 回调这类超长流程，持久化是必需的。
3. **检查点和回滚**：可以把状态存到某个时间点，需要时回滚回去。

### 核心概念：Threads 与 Checkpoints

#### Threads（线程）

Thread 就是一次独立的执行会话 —— 可以想成「跟某人聊完的一整段记录」或「某个任务从头跑到尾的一趟」。

关键特性：

- **隔离性**：每个 Thread 完全独立，状态互不干扰
- **持久化单元**：状态就是按 Thread 为单位存的
- **标识符**：用唯一的 `thread_id` 识别

#### Checkpoints（检查点）

Checkpoint 是 Thread 在某一刻的**状态快照**，它记下跑到哪个节点时整份状态长什么样。用户每次输入完、每轮对话结束，都能落一个最新检查点。

关键特性：

- **状态快照（`StateSnapshot`）**：把某一刻的整份状态存下来，里面装着【状态值】、【下一个该跑谁】、【绑定的配置】和【元数据】。结构大致是：

```python
class StateSnapshot:
    values: dict          # 当前状态值（如：对话消息列表）
    next: tuple           # 接下来要执行的节点
    config: dict          # 配置信息
    metadata: dict        # 元数据（步骤号、来源、写入信息等）
    parent_config: dict   # 父检查点（形成链表）
    created_at: str       # 创建时间
```

- **版本历史与可恢复点**：一条 Thread 上能挂好几个 Checkpoint 串成历史，所以任意一个点都能回去翻、回去改。

```mermaid
flowchart TD
    T["Thread: thread_id = chat_123"] --> A["检查点 A：开始 / step 1"]
    T --> B["检查点 B：用户输入后 / step 2"]
    T --> C["检查点 C：AI 回复后 / step 3"]
    A --> V["每个检查点都含 value / next / metadata"]
    B --> V
    C --> V
```

### 线程级持久化使用姿势

分两步走。

#### 步骤一：配置 checkpointer 持久化存储

方式 1 —— 内存存储。最简单，状态放程序内存里；适合开发测试，程序重启就没了。

```python
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()      # 定义存储方式
agent = agent_builder.compile(checkpointer=checkpointer)   # 用 checkpointer 编译图
```

方式 2 —— 使用 Postgres 存储库。LangGraph 的检查点实现都放在独立可安装的库里：

- **SQLite 存储（`langgraph-checkpoint-sqlite`）**：`SqliteSaver` / `AsyncSqliteSaver`，适合实验与本地工作流，需要单独安装
- **Postgres 存储（`langgraph-checkpoint-postgres`）**：`PostgresSaver` / `AsyncPostgresSaver`，适合生产，得单独装

**为什么选择 PostgreSQL 作为存储库？**

| 优势 | 说明 |
| --- | --- |
| 原生支持 | 提供了 `PostgresSaver`，集成路径短 |
| 数据结构化与一致性 | 天生适合装结构化数据；消息历史、用户档案、工具调用记录都能落成表 |
| 可靠性与持久性 | 事务、ACID、备份恢复机制齐全，系统崩溃也不丢 |
| 强大的查询能力 | SQL 方便对历史行为、用户数据做分析统计审计；配合 pgvector 还能直接在库里做向量相似度搜索 |
| 可扩展性 | 读写分离、分区、集群支撑大规模并发 |
| 成熟的生态系统 | 社区大、工具多、运维经验成熟，维护成本低 |

```bash
# 1. 拉取 PostgreSQL 镜像
docker pull postgres

# 2. 运行 PostgreSQL 容器
docker run -p 5432:5432 -e POSTGRES_PASSWORD=bit --name postgres-sql -d postgres
# -p 5432:5432: 将容器的 5432 端口映射到宿主机的 5432 端口
# -e POSTGRES_PASSWORD=bit: 设置 postgres 用户密码
# --name postgres-sql: 给容器命名
# -d: 后台运行
```

数据库连上之后（用 Navicat 之类客户端测试连接即可）：

1. 安装 `langgraph-checkpoint-postgres` 包
2. 设置连接字符串（URI），格式是 `postgresql://<user>:<password>@<host>:<port>/<database_name>`
3. 用 `PostgresSaver.from_conn_string()` 从连接字符串创建实例

```python
from langgraph.checkpoint.postgres import PostgresSaver

with PostgresSaver.from_conn_string(DATABASE_URI) as checkpointer:
    checkpointer.setup()      # 第一次使用 Postgres 检查点时需要调用 checkpointer.setup()
    agent = agent_builder.compile(checkpointer=checkpointer)
```

#### 步骤二：使用 Thread 进行执行

图编译完之后，要靠一个 Thread ID 标识这次执行：

- Thread ID 不存在 → 新建一个 Thread，从初始状态开始跑
- Thread ID 已存在 → 从 Checkpointer 里加载该 Thread 最后一次保存的状态，接着往下跑

```python
config = {"configurable": {"thread_id": "1"}}     # 第一次执行，创建一个新的 Thread

# ...一段时间后，程序可能重启了...
result2 = agent.invoke(
    {"messages": [HumanMessage(content="我刚才问了什么？")]},
    config=config,     # 再次使用相同的 thread_id
)
# LangGraph 会从上次的状态继续，而不是重新开始
# 此时，result2 的上下文会包含之前的对话历史
```

#### 还有几个常用动作

- 获取状态快照：用 `get_state(config)` 拿最新快照。

```python
before = agent.get_state(config)    # 调用前的状态快照
agent.invoke({"messages": [HumanMessage(content="你好")]}, config)
after = agent.get_state(config)     # 调用后的状态快照
```

- 获取状态历史记录：`get_state_history(config)` 返回该线程完整的历史 `StateSnapshot` 列表，按时间排序，**列表第一个是最新的检查点**。
- 重放：调用图时同时给 `thread_id` 与 `checkpoint_id`（检查点的唯一标识，用来指名线程里的某一次），它就会把那个点之后的步骤再跑一遍。

```python
# 第一次执行
agent.invoke({"messages": [HumanMessage(content="今天天气怎么样？")]}, config)

# 保存调用工具前的状态
snapshots = list(agent.get_state_history(config))
target = snapshots[2]              # 找到调用工具前的步骤

# 第二次执行：重放
agent.invoke(None, {"configurable": {"thread_id": "1", "checkpoint_id": target.config["configurable"]["checkpoint_id"]}})

# 查看新的历史记录
list(agent.get_state_history(config))
```

历史记录里会同时留下重放前和重放后的步骤，这本身就证明重放成功。重放能力在时间旅行里会正式派上用场。

- 更新状态：用 `update_state()` 编辑图状态。比如把用户输入换成别的搜索内容，然后从更新后的快照继续跑。

```python
snapshots = list(agent.get_state_history(config))
target = snapshots[3]              # 找到调用 LLM 前的步骤

# 根据指定的 config，更新对于步骤的值
agent.update_state(target.config, {"messages": [HumanMessage(content="上海的天气怎么样？")]})   # 更新用户输入

# 第二次执行：重放更新后的配置
agent.invoke(None, target.config)
```

### 跨会话持久化

先说它管不到的地方。

### Checkpoint 的局限性

先看它管不到哪儿。

#### 问题场景：跨会话信息丢失

Checkpoint 提供的短期记忆能力很强，它能：

- 自动保存工作流每一步的状态快照
- 让一轮对话的上下文不断线
- 隔离不同 Thread 的执行状态

但它只管**一个线程内**。看这个例子：

```python
# 第一次对话
agent.invoke({"messages": [HumanMessage(content="我最爱吃汉堡")]}, config)
# AI 记得：你爱吃汉堡

# 星期一，用户首次对话（thread A）
# 星期二，用户开启一个新对话（thread B）
# 输出：我不知道你具体喜欢吃什么，但可以根据一些常见的食物类型来猜测……
```

问题很直白：**换个会话，它就把「爱吃汉堡」这事忘了**，每次都像初次见面。

#### 落到真实业务：需求从「聊完就散」变成「长期服务」

真实客服系统要的东西：

- 认出 VIP，优先伺候
- 同一件事别问第二遍
- 拿旧投诉改进服务

比如用户第一次投诉账户冻结，客服收集信息、了解需求、解决问题；10 天后用户又来投诉同一类问题 —— 如果系统不知道历史，就得把前因后果再问一遍。

理想形态是：一份**用户画像跨所有对话共享**（基本信息、历史记录、标签体系），下面挂多个对话线程，各自持有自己的上下文与临时状态，两者之间双向共享，最终汇成贴着个人的服务。

### 解决方案：引入 Store

Store 相当于一个长期记忆仓库：跑的过程中把用户资料、偏好这些长期数据存住，让不同对话之间能互通。

#### 存储 vs 检查点

| 维度 | 检查点（Checkpoint） | 存储（Store） |
| --- | --- | --- |
| 存什么 | 状态变化的流水（一条时间线） | 结构化的知识（像个库） |
| 管多宽 | 只管一次会话的完整经过 | 跨线程共用，谁都能读能写 |
| 怎么组织 | 按线程装：`thread_id = "chat_123"`，`checkpoints: [A, B, C, D]`；每个检查点形如 `state snapshot at step 2`，带 `value`、`next`、`metadata` | 按 `namespace = (user_id)` 装键值对；沉淀下来后一人一份 |
| 活多久 | 就一次会话，跟线程同生共死 | 长期留着，跨会话都在 |
| 拿它干嘛 | 会话内的记忆、回放状态、时间旅行 | 攒用户画像：每人的基本情况、过往记录、偏好标签 |

一句话记法：**检查点管会话内的完整历史，Store 管跨线程的共享数据**。两者一起用才算完整。

**Store 一进来，架构就换了个时代**

| 时代 | 能记住多少 | 聊起来什么样 |
| --- | --- | --- |
| 第 1 阶段：无状态 AI（石器时代） | 每回都像初见 | 今天说「你好」，明天它就不认得我了 |
| 第 2 阶段：检查点（工业革命） | 一次会话内能记住 | 报过名字它就叫得出我的名字，但换个会话又归零 |
| 第 3 阶段：检查点 + Store（智能时代） | 记得一辈子，还会越用越懂 | 能问「你以前爱吃披萨，现在口味变了没」，也能按我读过的书推书 |

真正变的是三件事：

- 视角从「这一问」挪到「这个人」
- 不只答眼前这题，还把过往数据用起来
- 回复从通用模板变成贴着个人来

> 题外话：用 AI 产品时别随手把隐私信息喂进去，很容易被它一直留着。

### 跨会话持久化使用姿势

Store 也有内存级与存储库两种。先创建实例，再在编译图时把 Checkpoint 与 Store 一起挂上：

```python
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()
agent = agent_builder.compile(checkpointer=checkpointer, store=store)
```

### 方式 1：内存存储

Store 靠 Namespace 区分不同数据。要存一条东西，需要：

- **先定义命名空间**：要把不同人的记忆分开放，相当于每人一个抽屉。怎么分按业务来，我一般写成元组：

```python
# 使用元组 - 层次清晰，易于扩展
namespace = ("user_123", "preferences")

# 使用字符串 - 扁平且易混淆
namespace = "user_123_preferences"
```

- **用 `store.put()` 写进命名空间**，参数含义：
  - `namespace`：这条记忆属于谁、是什么类型
  - `memory_id`：记忆条目的唯一键
  - `memory_content`：记忆的具体内容，一个字典

```python
# 1. 导入并创建存储
store = InMemoryStore()

# 2. 定义命名空间 (Namespace)
# 这里我们用一个元组 (用户ID, 记忆类型)
namespace = ("user_123", "profile")

# 3. 存入一条记忆 (Memory)
# 每条记忆需要一个唯一的 memory_id 和 一个 value (通常是字典)
store.put(namespace, str(uuid.uuid4()), {"name": "小明", "age": 10})

# 4. 读取记忆
# 可以搜索某个命名空间下的所有记忆
items = store.search(namespace)
for item in items:
    print(item.key, item.value)
```

用元组做命名空间还能这样搜：`store.search(("user_123",))` 会把该用户下所有类型的记忆都捞出来。

#### 在 LangGraph 里用 Store

思路：在每次调 LLM 之前先收集信息，再带着共享信息去调模型。于是流程变成新增一个 `get_person_by_llm` 节点：

```mermaid
flowchart TD
    S([__start__]) --> P[get_person_by_llm]
    P --> L[llm_call]
    L -.-> T[tool_node]
    L -.-> E([__end__])
    T --> P
```

- 编译图时加上 `store`：

```python
# 用 checkpointer + store 编译图
agent = agent_builder.compile(checkpointer=checkpointer, store=store)
```

- 任意节点函数注入 `store` 参数，就能摸到这份全局存储：

```python
def get_person_by_llm(state: AgentState, config: RunnableConfig, *, store: BaseStore):
    ...
```

这个抽信息的节点，关键就两条：

1. 要访问 Store 的节点函数，在参数里声明 `store: BaseStore` 和 `config: RunnableConfig` 即可拿到
2. 这里可以让 LLM 提取用户信息，所以定义结构化返回很有必要

```python
# 定义结构化输出
class Person(BaseModel):
    # 注意：
    # 1. 每个字段都是 Optional "可选的" —— 允许 LLM 在不知道答案时输出 None。
    # 2. 每个字段都有一个 description "描述" —— LLM 使用这个描述。
    name: Optional[str] = Field(default=None, description="用户姓名")
    height_in_meters: Optional[float] = Field(default=None, description="身高（米）")

# 提取用户信息节点
def get_person_by_llm(state: AgentState, config: RunnableConfig, *, store: BaseStore):
    # 1. 先提取：只把最近的用户消息喂给模型，控制 token，也避免把 AI/工具输出当成用户信息
    people_info = extractor.invoke(state["messages"][-1:])
    namespace = (config["configurable"]["user_id"], "profile")

    # 2. 再保存
    # 每次 put 前应判断是否存在，再更新。否则会有多条记录被记录。这里简写
    old = store.get(namespace, "profile")
    merged = old.value if old else {}
    # 读旧值 → 只用非 None 的新值覆盖 → 写回固定 key
    # 这一步很关键：新线程里问"你还记得我吗"抽出来全是 None，直接写会把旧画像冲掉
    for k, v in people_info.model_dump().items():
        if v is not None:
            merged[k] = v
    store.put(namespace, "profile", merged)

    # 只返回要更新的字段，LangGraph 会用各自的规则合并进全局状态
    return {"messages": state["messages"]}
```

- 更新模型调用节点，把共享信息拼进提示词：

```python
def llm_call(state: AgentState, config: RunnableConfig, *, store: BaseStore):
    namespace = (config["configurable"]["user_id"], "profile")
    item = store.get(namespace, "profile")      # 搜索用户信息
    profile = item.value if item else {}
    system = f"已知用户信息：{profile}，回答时请自然地利用它。"
    response = model_with_tools.invoke([SystemMessage(content=system)] + state["messages"])
    return {"messages": [response]}
```

- 建图时加入新节点并调整边（把原来的 `START → llm_call` 改成 `START → get_person_by_llm → llm_call`，`tool_node` 回到 `get_person_by_llm`）

**坑**：`store.put` 之前一定要先 `get` 判断存在与否再更新，否则每次都会新插一条记录；生产环境更要用固定 key（比如 `"profile"`）而不是 `uuid4()`。

#### 语义搜索

Store 的强项是支持语义搜索，而不只是精确匹配 —— 可以用自然语言问题去找相关记忆。

```python
# 配置带嵌入模型的 Store
store = InMemoryStore(index={"embed": init_embeddings("openai:text-embedding-3-small"), "dims": 1536})

# 在 Store 中进行语义搜索，找出最相关的 2 个记忆
# 这里直接在 user_id 维度下通过语义去找
items = store.search(("user_123",), query="用户喜欢吃什么", limit=2)
```

### 方式 2：Postgres 存储库

生产环境直接复用之前的 PostgreSQL，用 `PostgresStore`：

```python
from langgraph.store.postgres import PostgresStore

with PostgresStore.from_conn_string(DATABASE_URI) as store:
    store.setup()      # 第一次使用 Postgres store 时需要调用 store.setup()
    agent = agent_builder.compile(checkpointer=checkpointer, store=store)
```

**坑**：演示时如果没做「存在就更新」的判断，空值会把用户画像写坏，之后在 LLM 调用前查出来的就是空画像。验证前记得把那段临时写入代码注掉。

### 持久化实现的三大应用能力

这三个能力分别是记忆、人机交互、时间旅行。

### 记忆（Memory）

#### 记忆概念

所谓记忆，就是能把先前互动留下来的机制。对代理而言这是刚需：记得住旧交互、能靠反馈变好、会顺着用户口味做调整。任务越重、聊得越多，它越吃紧。

> 注意：**记忆**和**持久化**是两个层面的事。
> - **持久化**是底层能力，包含【线程级】与【跨会话】两类
> - **记忆**是应用层能力，包含【短期记忆】与【长期记忆】

映射关系很直白：

| 应用层能力 | 依赖的底层能力 |
| --- | --- |
| 短期记忆＝一次会话里的上下文 | 归线程级持久化管 |
| 长期记忆＝跨会话留下的用户数据 | 归跨会话持久化管 |

具体怎么管？往下看。

#### 管理短期记忆

应用层还要处理具体场景：消息记录太多时要裁剪、总结、删除。

先说存储方式的选择：开发阶段用内存存储，生产阶段换数据库。

- **修剪消息**：多数 LLM 都有最大上下文窗口。一种做法是对历史消息里的 token 计数，接近上限时就截断。

```python
# 只保留最近的 128 个 token 的消息
trimmer = trim_messages(max_tokens=128, strategy="last", token_counter=count_tokens_approximately)
trimmed = trimmer.invoke(state["messages"])
```

- **删除消息**：可以从图状态里删消息，用来删特定消息或清空整个历史。

```python
# 沿用上文定义的 model
def delete_old_messages(state: MessagesState):
    # 删除最早的 6 条消息
    return {"messages": [RemoveMessage(id=m.id) for m in state["messages"][:6]]}

# 删除所有消息
def delete_all(state: MessagesState):
    return {"messages": [RemoveMessage(id=m.id) for m in state["messages"]]}
```

> 注意：删掉就恢复不了，删完要确保剩下的对话仍然成立。

- **总结消息**：修剪或删除的问题是可能丢失信息。更好的做法是把旧对话压成简短摘要，保留关键信息，替掉冗长的历史。

State 扩展成「对话记录 + 摘要」两个字段，规则是：

- 对话记录：把新一轮问答追加进去
- 摘要：每次对话完成后做一次总结
- 总结完就可以删掉历史对话

每次调 LLM 时，用【新请求】+【总结摘要】共同拼提示词。

```python
class SummaryState(MessagesState):
    summary: str

def call_model(state: SummaryState):
    # 使用历史总结 + 最新消息发起调用
    summary = state.get("summary", "")
    messages = [SystemMessage(content=f"历史对话摘要：{summary}")] + state["messages"]
    response = model.invoke(messages)

    # 1. 创建总结提示词
    # 2. 生成新总结：【消息列表】+【历史总结】调用模型
    new_summary = model.invoke(
        [HumanMessage(content=f"把下面的对话压缩成摘要，已有摘要：{summary}")]
        + state["messages"]
    ).content

    # 3. 删除历史对话：除了最新的 AI 消息，都可以删除
    return {
        "messages": [RemoveMessage(id=m.id) for m in state["messages"][:-1]] + [response],
        "summary": new_summary,
    }
```

不必每次调用后都总结，可以设阈值：判断「消息数量 > 阈值」再总结与删除。

> 扩展：`LangMem` 是 LangChain 维护的记忆库，提供可与任意存储系统配合的功能原语，也与 LangGraph 存储层原生集成。上面手写的汇总逻辑，它用记忆管理组件（如 `SummarizationNode`）直接封装好了。

### 人机交互（Human-in-the-loop）

想做的场景：

- AI 自动发邮件之前，我想亲自确认一遍内容
- AI 生成文章之后，我想手动改几个段落
- ……

也就是在自动流程里插一个「暂停键」，等人类输入再继续。

#### 核心概念：中断（Interrupts）

中断能力建立在持久化之上，像打游戏：

- 打不过关时主动按「存档键」
- 当前状态被存档保存下来（实现过程的中断）
- 攻略完想继续时，读档继续玩（恢复游戏）

在 LangGraph 里，中断让工作流在特定点暂停，等外部输入后再继续。

**中断如何实现？**

两点：

- 流程里调 `interrupt()` 就断住了，当前状态靠持久化兜底
- 外部用户发送 `Command` 对象，让工作流恢复执行

```mermaid
sequenceDiagram
    participant G as LangGraph 系统
    participant H as 外部/人类
    G->>G: 运行节点，执行 interrupt() 暂停并保存状态
    G->>H: __interrupt__ 返回，控制权移交
    H->>H: 决策 / 审批 / 输入
    H->>G: Command(resume="结果")
    G->>G: 恢复保存的状态，继续执行节点
```

```python
# 必须指定 checkpointer，以在每个步骤后保存图状态。
agent = builder.compile(checkpointer=InMemorySaver())

# 必须使用 thread_id 运行 Graph，相当于告诉系统读哪个存档。
config = {"configurable": {"thread_id": "1"}}

def ask_human(state: ChatState):
    # 主动喊"停！"，并传递提示信息
    answer = interrupt("请确认是否继续？（yes/no）")
    return {"messages": [AIMessage(content=f"用户回答：{answer}")]}

# 步骤1：启动，触发暂停
result = agent.invoke({"messages": [HumanMessage(content="开始")]}, config)
print(result["__interrupt__"])

# 步骤2：恢复，把答案交回去
result = agent.invoke(Command(resume="yes"), config)
```

几个要点：

- 编译图时必须指定 `checkpointer`，才能每步保存状态
- 走到 `interrupt()` 就是主动喊「停」，顺手把提示语带出去
- 用 `invoke` / `stream` 恢复执行时，要用 `Command(resume=...)` 语法
- `resume` 表示传回给 AI 的响应值
- 跑图时必须带 `thread_id`，等于告诉它翻哪一份档

#### 中断的黄金法则（规则与限制）

_法则 1：只传能序列化的简单数据_

函数、类实例、数据库连接都别传。要传就传字符串、数字、布尔值、朴素的字典或列表。

```python
# ✅ 正确：传递可序列化的简单类型
interrupt("请确认")

# ✅ 正确：传递带有简单值的字典
interrupt({"question": "是否批准？", "amount": 100})

# ❌ 错误：传递一个函数来实现中断（函数不能被序列化）
interrupt(lambda: "yes")

# ❌ 错误：传递一个类实例来实现中断（实例不能被序列化）
interrupt(MyConnection())
```

_法则 2：不要把 `interrupt()` 包进 `try/except`_

如果把它包在通用的 `try/except Exception` 或空的 `try/except` 里，代码会提前捕获那个特殊异常，运行时系统感知不到中断，`interrupt()` 直接失效。

根本原因：`interrupt()` 内部是靠**抛出一个特殊异常**来暂停执行的，这个异常必须被 LangGraph 运行时捕获，才能触发状态保存与等待。

正确做法：

- **分离逻辑**：把 `interrupt()` 调用与可能出错的代码分开 —— 先中断，再处理容易失败的操作
- **精确捕获**：`try/except` 里只捕获我预期的具体异常类型（例如 `NetworkException`），这样中断异常就能顺利逃逸给运行时

```python
# ✅ 正确：先中断，再处理
answer = interrupt("确认继续吗？")
# 将中断调用与易出错代码分开
try:
    do_network_call()
except NetworkException as e:      # ✅ 正确：捕捉特定的异常类型
    ...
```

_法则 3：中断前的动作要「幂等」_

这点特别关键：**恢复时，抛中断的那个节点会从头再跑一遍**，于是中断点之前的代码将被多重复执行。

如果里面藏着非幂等动作（建记录、发消息、扣款），每次恢复都要重来一发，数据就会重复、对不上，甚至出怪事。

**幂等性**：同一操作跑 1 次和跑 N 次，结果没差别。

```python
# 使用幂等操作
def node_a(state: State):
    # ✅ 正确：使用 upsert（更新或插入）操作，多次执行结果一致
    db.upsert(...)

# 将副作用分离到独立节点
def approval_node(state: State):
    # 只处理中断
    decision = interrupt("是否批准？")
    return {"approved": decision}

def side_effect_node(state: State):
    # ✅ 正确：副作用在独立节点中，仅在获得批准后执行一次
    send_email()

# 将副作用放在中断之后
def node_b(state: State):
    # ✅ 正确：先中断，获得批准后再执行副作用
    decision = interrupt("是否发送？")
    if decision == "yes":
        send_email()

# 在中断前创建新记录
def bad_node_1(state: State):
    # ❌ 错误：每次恢复都会创建新的审计记录
    db.insert(AuditLog(...))
    interrupt("继续？")

# 在中断前追加到列表
def bad_node_2(state: State):
    # ❌ 错误：每次恢复都会重复追加相同条目
    state["log"].append("step done")
    interrupt("继续？")
```

_法则 4：中断顺序固定_

一个节点里用多个 `interrupt()` 时，恢复值的匹配有严格顺序：

- **恢复执行从头开始**：恢复那一刻，节点是打第一行重跑的，并非从中断那一行接着走
- **索引匹配**：每次执行任务背后都摊着一份恢复值清单，碰到 `interrupt()` 就按次序往下取一个
- **顺序必须一致**：每次执行时中断调用的顺序必须完全相同

```python
# ✅ 正确：中断调用顺序固定
a = interrupt("第一个问题")
b = interrupt("第二个问题")

# 条件性跳过中断
# ❌ 错误：第一次可能跳过，恢复时可能不跳过，导致索引错乱
if flag:
    a = interrupt("可能跳过的问题")

# 基于非确定性数据的循环中断
# ❌ 错误：中断数量随动态列表变化
for item in dynamic_list:      # 列表可能在不同执行中变化
    interrupt(f"确认 {item}？")
```

### 人机交互的四种常见模式

1. **审批或拒绝**：执行关键操作（API 调用、改数据库）前暂停，等人工批准或拒绝，按返回指令路由到不同分支
2. **审查和编辑状态**：先停下，让人看过、改过当前状态（比如模型写的文字），再把改好的那份送回去，状态一更新就接着跑
3. **在工具中中断**：把中断直接放进工具函数内部；LLM 调这个工具时自动暂停，允许人工在执行前审查、编辑调用参数或取消
4. **验证人工输入**：循环使用中断，反复要求输入直到通过验证（比如必须是有效的正数年龄）

核心就一句：中断让「先停下，等外面给个说法再走」变成现实，人机协作的应用才做得出来。

#### 模式 1：批准或拒绝（Approve or reject）

在关键操作前暂停图执行，等人批准或拒绝。

```mermaid
flowchart TD
    S([__start__]) --> A["批准此操作？/ interrupt"]
    A -->|拒绝后操作| E([__end__])
    A -->|批准后操作| E
```

实现方式：

- 节点里调 `interrupt()` 就暂停了；传进去的那个 JSON 对象（写清问什么、批的是哪件事）会出现在 `result["interrupt"]` 里
- 图暂停后，外部系统（如 UI）可以据此向用户展示审批请求
- 人工决定后用 `Command(resume=...)` 恢复；`Command(resume=True)` 表示批准，`Command(resume=False)` 表示拒绝
- 节点代码拿到的 `resume` 值就是 `interrupt()` 的返回值，据此用 `Command(goto=...)` 把流程路由到不同后续节点（例如 `proceed` 或 `cancel`）。`Command(goto=...)` 里的参数，就是下一个要去的节点名

```python
class TransferState(TypedDict):
    amount: int
    messages: Annotated[list, add]

def human_approval(state: TransferState) -> Command[Literal["proceed", "cancel"]]:
    # 中断执行，将审批请求传递给调用者
    is_approved = interrupt({
        "question": "是否批准这笔转账？",
        "amount": state["amount"],
    })
    # 恢复后路由到适当的节点
    return Command(goto="proceed" if is_approved else "cancel")

builder = StateGraph(TransferState)
builder.add_node("human_approval", human_approval)
builder.add_node("proceed", proceed)
builder.add_node("cancel", cancel)
builder.add_edge(START, "human_approval")
graph = builder.compile(checkpointer=InMemorySaver())

config = {"configurable": {"thread_id": "t1"}}
graph.invoke({"amount": 5000}, config)          # 运行图（首次调用会触发中断）
# 用决策恢复执行：True 路由到 proceed，False 路由到 cancel
graph.invoke(Command(resume=True), config)
```

#### 模式 2：查看和编辑状态（Review and edit state）

```mermaid
flowchart TD
    S([初始状态]) --> I[中断触发]
    I --> U[UI 展示内容]
    U --> H[人工编辑]
    H -->|传入编辑内容| UP[更新状态]
    I -->|恢复流程| UP
```

练习：人工审核 AI 生成的文档并编辑。

```python
def review_node(state: DraftState):
    # 请求审阅者编辑生成的内容
    edited = interrupt({"draft": state["draft"]})
    return {"draft": edited}

builder = StateGraph(DraftState)
builder.add_node("write", write)          # 构建图
builder.add_node("review", review_node)
builder.add_edge(START, "write")
builder.add_edge("write", "review")
builder.add_edge("review", END)
graph = builder.compile(checkpointer=InMemorySaver())

state = graph.invoke({"topic": "夏季促销"}, config)
# 用审阅者编辑后的文本恢复执行
graph.invoke(Command(resume="修改后的营销文案……"), config)
```

这类模式还能用在：

- 让专人过一遍模型写出来的东西（文案、数据都算）—— 比如营销文案交给营销同事把关
- 继续执行前纠正错误、补充信息或做微调 —— 比如提取结构化数据后让专家验证
- 凡是要卡质量、要专业把关的自动化环节都适用 —— 比如写完代码让开发同学 review

> 注意：恢复时交回去的那份东西是**整段顶替**原值的。想只改一小块，就得在中断载荷里先把可改的位置标出来。

#### 模式 3：在工具中中断（Interrupts in tools）

把中断直接嵌进工具函数内部，实现在工具调用前的人工审查与干预。

```mermaid
flowchart TD
    S([初始状态]) --> M[调用模型]
    M -->|需要调用工具| I[工具执行前先执行中断]
    I -->|人工决定执行工具| R[执行工具]
    I -->|人工决定不执行| U[更新状态]
    R --> U
    M --> U
```

关键特点：

- 中断逻辑内置于工具，而不是图的节点里
- 工具变聪明了，自己清楚什么时候该等人点头
- 工具能在任何图里复用，自动带上中断能力

练习：AI 发邮件前，人工审查邮件内容。

```python
@tool
def send_email(subject: str, body: str) -> str:
    """发送邮件。"""
    # 在发送前暂停
    decision = interrupt({"action": "review_email", "subject": subject, "body": body})
    if decision.get("action") == "同意":
        subject = decision.get("subject", subject)
        # 实际发送邮件（此处为示例，仅打印）
        return f"已发送：{subject}"
    return "已取消发送"

model_with_tools = model.bind_tools([send_email])     # 使用绑定工具的模型
send_email.invoke({"subject": "请假", "body": "……"})   # 直接调用工具（为了演示效果）
graph.invoke(Command(resume={"action": "同意", "subject": "病假"}), config)   # 用批准和可选编辑的参数恢复
```

#### 模式 4：验证人工输入（Validating human input）

在循环里验证人类输入，直到有效为止。

```mermaid
flowchart TD
    S([开始]) --> I[中断]
    I --> U[用户输入]
    U --> V{验证输入}
    V -->|有效| UP[更新状态]
    UP --> E([结束])
    V -->|无效，错误反馈| I
```

练习：注册时校验用户填的年龄。

```python
def get_age(state: AgeState):
    prompt = state.get("error") or "请输入你的年龄："
    # 每次验证失败后，提示信息会更新
    age = interrupt(prompt)
    if isinstance(age, int) and age > 0:
        return {"age": age, "error": None}
    return {"error": "年龄必须是正数，请重新输入："}

builder = StateGraph(AgeState)
builder.add_node("get_age", get_age)      # 构建图
builder.add_edge(START, "get_age")
graph = builder.compile(checkpointer=InMemorySaver())

graph.invoke({}, config)                       # 首次调用：显示初始提示
graph.invoke(Command(resume=-5), config)       # 提供无效数据：节点重新提示
graph.invoke(Command(resume=25), config)       # 提供有效数据：循环退出，状态更新
```

### 时间旅行（Time Travel）

先弄清它能干什么。

**时间旅行是什么？**

AI 工作流本身是非确定性的：同一个大模型每次跑可能给出不同结果。复杂任务要多个 AI 调用协同时，错误可能出现在任何一步，很难定位。

LangGraph 的做法是每个节点执行后自动「存档」。时间旅行允许重放先前的执行，从而查看或调试特定步骤。

```mermaid
flowchart LR
    S([开始]) --> N1["节点1（检查点）"]
    N1 --> N2["节点2（检查点）"]
    N2 --> E([结束])
    N1 -.->|可读取/更新、可恢复执行| N1
    N2 -.->|可读取/更新、可恢复执行| N2
```

它有三个实用价值：

1. **分析推理过程**：顺着轨迹看它怎么走到答案，把走得通的那条路记下来（也就是看它「想」对在哪）
2. **定位和修复错误**：精确找到出错的节点，在不影响原始流程的前提下测试修复方案（看它在哪一步跑偏）
3. **探索替代方案**：换个输入、改个中间值，把几条路线摆一起比一比

**时间旅行四步法**（顺序别乱）（顺序别乱）

_第一步：初始执行工作流_

```python
# 编译需要 checkpointer
graph = builder.compile(checkpointer=InMemorySaver())
# 创建执行线程
config = {"configurable": {"thread_id": "1"}}
# 执行工作流
graph.invoke({"topic": "猫"}, config)
```

_第二步：查看历史检查点_

```python
# 获取所有历史状态（按时间倒序）
for state in graph.get_state_history(config):
    print("检查点ID:", state.config["configurable"]["checkpoint_id"])
    print("下一步节点:", state.next)
    print("当前状态:", state.values)
    print("---")
```

输出里能看到一条从最新到最旧的链条：最新那条 `next` 是空元组（跑完了）、往下依次是 `('write_joke',)`、`('generate_topic',)`，最早那条的 `next` 是 `('__start__',)`。

_第三步：修改状态（可选）_

- `update_state` 改完之后会岔出一条新分支
- 老的那个点原样躺着
- 新分支自己往下长

```python
snapshot = list(graph.get_state_history(config))[2]     # 选择特定检查点
graph.update_state(snapshot.config, {"topic": "橘猫"})   # 修改状态数据
```

_第四步：从检查点恢复执行_

- 入参给 `None` 就行，状态本来就在检查点里
- 配置里必须带有效的 `checkpoint_id`：调用图时把 `thread_id` 和 `checkpoint_id` 一起递给它，它就从那个历史点重新演一遍，方便调试或试别的走法
- 它会从那个检查点接着往下跑，于是历史里多出一条岔路

```python
graph.invoke(None, snapshot.config)      # 从修改后的检查点继续执行
```

#### 完整示例：AI 笑话生成器

两步：先想主题，再按主题写笑话。

```python
class JokeState(TypedDict):
    topic: str
    joke: str

def generate_topic(state: JokeState):
    return {"topic": model.invoke("给我一个笑话主题").content}

def write_joke(state: JokeState):
    return {"joke": model.invoke(f"写一个关于{state['topic']}的笑话").content}

# 创建状态图
builder = StateGraph(JokeState)
# 添加节点
builder.add_node("generate_topic", generate_topic)
builder.add_node("write_joke", write_joke)
# 连接节点
builder.add_edge(START, "generate_topic")
builder.add_edge("generate_topic", "write_joke")
builder.add_edge("write_joke", END)
# 编译并启用检查点
graph = builder.compile(checkpointer=InMemorySaver())

graph.invoke({}, config)
```

我是这么查的：

- 发现问题：笑话的主题太泛
- 回头翻检查点：

```python
for s in graph.get_state_history(config):   # 查看所有检查点
    print(s.next, s.values)

# 检查主题生成节点后的状态
snapshot = [s for s in graph.get_state_history(config) if s.next == ("write_joke",)][0]
print(snapshot.values)
```

- 改完再跑：

```python
graph.update_state(snapshot.config, {"topic": "一只不会抓老鼠的橘猫"})   # 修改为更具体的主题
graph.invoke(None, snapshot.config)                                      # 重新执行
```

### 持久化小结

LangGraph 的持久化能力提供了：

- **自动化**：持久化基础设施（检查点与存储）是自动处理的，不需要手动配一堆东西
- **多种存储后端**：开发测试用内存版 `InMemorySaver`，生产换 `PostgresSaver`，都有人写好现成实现

基于这些，它支撑起下面这些功能：

| 功能 | 说明 |
| --- | --- |
| 状态查询 | `graph.get_state(config)` 拿当前最新状态；`graph.get_state_history(config)` 拿整条历史（每个检查点都在），时间倒序 |
| 时间旅行与重放 | 调用图时带上 `thread_id` 与 `checkpoint_id`，就能从那个历史点重演一遍，用于调试或试别的走法 |
| 状态编辑 | `graph.update_state(config, values)` 直接改线程当前状态；修改遵循状态模式里的规则（比如列表是追加而不是覆盖） |
| 人机交互 | 跑到某一步先挂起，等人工看过、改过状态再往下走 |
| 记忆 | 线程自己攒下完整交互记录，多轮对话才记得住；短期＝一次会话里的上下文，长期＝跨会话留下的用户/应用数据 |

## 五、LangGraph 其他核心能力

还剩三块拼图。

### 运行时上下文（Runtime context）

先说它解决什么。

### 什么是运行上下文？

上下文（Context）是程序运行时能访问到的数据与环境信息。在 LangGraph 里，它用来传递：

- 谁在用、有什么配置
- 库连接、密钥
- 会话状态、过往记录

我按两个维度分：

| 维度 | 取值 | 说明 | 例子 |
| --- | --- | --- | --- |
| 会不会变 | 静态上下文 | 跑起来就定住不动 | 用户 ID、数据库连接 |
| 会不会变 | 动态上下文 | 跑着跑着就变了 | 对话记录、中间结果 |
| 活多久 | 运行时上下文 | 只在这一轮/这条线程里有效 | 这次请求的临时数据 |
| 活多久 | 跨会话上下文 | 存住，多次会话都在 | 用户偏好、历史记录 |

两个维度一交叉，LangGraph 里就是三种上下文：

| 种类 | 变不变 | 活多久 | 怎么拿到 |
| --- | --- | --- | --- |
| **静态运行时上下文** | 静态 | 一轮或一条线程 | 走 `context` 参数递进去 |
| **动态运行时上下文** | 动态 | 一轮之内 | 落在 State 上 |
| **动态跨会话上下文** | 会变 | 会话之间 | 存进长期库（`Store`） |

前面那两样 `checkpoints` 与 `store`，对应的是**动态运行时上下文**与**动态跨会话上下文**；剩下**静态运行时上下文**还没说，下面补。

#### 场景练习：智能旅行规划助手

需求是：

1. 按用户母语给个性化回答
2. 按会员等级提供不同服务
3. 连旅游数据库查信息
4. 按季节推荐活动
5. 记住用户的历史查询，给更准的建议

这些东西该怎么存？

| 数据类型 | 算哪种上下文 | 理由 |
| --- | --- | --- |
| 库连接 | 静态运行时上下文 | 查一次用一次，一轮里不变 |
| 回什么语言 | 静态运行时上下文 | 决定回哪种语言，一轮里不变 |
| 哪档会员 | 静态运行时上下文 | 定下给哪档服务，一轮里不变 |
| 当下季节 | 静态运行时上下文 | 推当季活动用它，一轮里不变 |
| 聊天记录 | 动态运行时上下文 | 一轮之内一直在变 |
| 旅行口味 | 跨会话上下文 | 算长期记忆，跨会话留着 |

按数据类型挑对上下文，换来四个「更」：更省事（不变的东西不必反复传）、更贴合（按上下文做个性化）、更好维护（边界与职责清楚）、更能扩（多用户、多场景、长记忆都撑得住）。

### 配置运行时上下文

三步走。

#### 定义上下文模式

先给上下文定个结构，`dataclass` 和 `TypedDict` 都行。示例里放了三样：用户 ID、模型、system 消息。

```python
from dataclasses import dataclass
from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

@dataclass
class ContextSchema:
    user_id: str
    model: BaseChatModel
    system_message: str
```

#### 在图中使用上下文模式

建图时传 `context_schema`：

```python
builder = StateGraph(State, context_schema=ContextSchema)
```

#### 节点里怎么拿到上下文

节点函数靠 `runtime` 形参拿到上下文：

```python
def call_model(state: State, runtime: Runtime[ContextSchema]):
    model = runtime.context.model
    system = runtime.context.system_message
    # 使用 OpenAI 模型 / 使用 Anthropic 模型，都从上下文里取
    return {"messages": [model.invoke([SystemMessage(content=system)] + state["messages"])]}
```

#### 跑图的时候把上下文递进去

```python
config = {"configurable": {"thread_id": "1"}}
graph.invoke(
    {"messages": [HumanMessage(content="你好")]},
    config,
    context=ContextSchema(
        user_id="u_1",
        model=init_chat_model("gpt-4o-mini", temperature=0),
        system_message="你是一个乐于助人的助手",
    ),
)
```

#### 合起来跑一遍

```python
# 英文用户
graph.invoke({"messages": [HumanMessage(content="Hi")]}, config,
             context=ContextSchema(user_id="1", model=model, system_message="Reply in English."))
# 输出: Hello, Alice!

# 中文用户
graph.invoke({"messages": [HumanMessage(content="你好")]}, config,
             context=ContextSchema(user_id="2", model=model, system_message="请用中文回答。"))
# 输出: 你好, 张三!
```

### 在工具中访问上下文

工具这头更麻烦一点。

工具是去够外部系统、API、数据库，或者纯粹算点东西的地方。所以身份、配置、连接串、密钥这类信息常常得递进去。上下文对工具的价值：

- 个性化响应：按用户上下文给定制化回答
- 权限控制：不同身份给不同工具的钥匙
- 状态感知：工具看当前状态再决定怎么做
- 依赖注入：别硬编码，注入进去，测试也好写

#### 基本用法

工具靠 `ToolRuntime` 形参就能读到运行时信息，里面有：

- `State`：当前状态
- `Context`：静态上下文
- `Store`：长期存储

用的时候只需在工具签名里加 `runtime: ToolRuntime`，它会自动注入，调用时不用手动传。

```python
from langgraph.prebuilt import ToolRuntime

@tool
def search(query: str, runtime: ToolRuntime) -> str:
    """查询工具。"""
    user_id = runtime.context.user_id
    user_name = runtime.context.user_name
    print(f"日志记录：user_id: {user_id}, user_name: {user_name} 调用查询工具")
    return f"查询{query}：晴天，15-20度"
```

#### 合起来跑一遍

做一个支持搜索的 AI 系统：假设搜索 API 需要用户数据当参数，就得把相关信息传进工具。关键步骤：

1. 定好状态与上下文结构
2. 写工具节点（`ToolNode`）和 LLM 节点
3. 建图并编译，把状态与上下文都挂上
4. 跑一遍看结果

```python
model_with_tools = model.bind_tools([search])     # 绑定工具
graph = builder.compile()                         # 定义并编译图
```

跑出来的痕迹大致是这样：

```text
================================== Ai Message ==================================
Tool Calls:
  search (call_YU9O02F9JBdiz3J7CMmUYLNE)
 Call ID: call_YU9O02F9JBdiz3J7CMmUYLNE
 Args:
================================= Tool Message =================================
Name: search
查询天气：晴天，15-20度
================================== Ai Message ==================================
今天西安的天气是晴天，气温在 15 到 20 度之间。
```

同一类搜索工具返回的天气详情，长这样：

- 白天气温：预计最高气温 13.7℃，天气多云，微风
- 夜间气温：预计最低气温 -1.1℃，天气晴，微风
- 天气状况：多云，空气质量较好

### 流（Streaming）

### 概念

流式传输就是逐步输出数据，不必等全部算完 —— 提升体验、减少等待感，特别适合 LLM 这类高延迟任务（像看电影一帧帧播，而不是等整部下载完）。

在 LangGraph 里，流式能把运行中的实时信息推给应用：状态、模型吐的字、自己塞的数据，都行；而且模式有好几种。

### 五种流模式

| 模式 | 作用 | 什么时候用 |
| --- | --- | --- |
| `values` | 每次给整份状态 | 想盯每一步的全量状态 |
| `updates` | 每次只给增量 | 只关心这步改了哪几个字段 |
| `messages` | 逐个吐模型的 token | 要边生成边显示 |
| `custom` | 吐自己塞的数据 | 自己做进度条、打日志 |
| `debug` | 把调试信息全倒出来 | 开发期排错 |

用法：想要几种就传个列表，交给 `stream` 或 `astream`。

### 基础示例：流式输出状态值

```python
# 定义状态结构
class State(TypedDict):
    messages: Annotated[list, add]

# 创建节点函数
def node_a(state: State):
    return {"messages": [AIMessage(content="A")]}

def node_b(state: State):
    return {"messages": [AIMessage(content="B")]}

# 构建图
builder = StateGraph(State)
builder.add_node("node_a", node_a)
builder.add_node("node_b", node_b)
builder.add_edge(START, "node_a")
builder.add_edge("node_a", "node_b")
builder.add_edge("node_b", END)
graph = builder.compile()

# 流式输出状态更新
for chunk in graph.stream({"messages": []}, stream_mode="updates"):
    print(chunk)     # {'node_a': {'messages': [AIMessage('A')]}} ...
```

`stream_mode="updates"` 只给每个节点的**增量**；换成 `stream_mode="values"` 则每次给**完整状态**。

### 流式传输自定义数据

除了状态，还能从节点或工具里往外发自定义数据。步骤：

- 先 `get_stream_writer()` 拿到写入器，再往里塞自定义数据
- 调用 `.stream()` 或 `.astream()` 时设 `stream_mode="custom"`，才能拿到这些数据

> 注意：几种模式能叠着用（如 `["updates", "custom"]`），但里面必须有一个 `"custom"`。

#### 基本用法

```python
from langgraph.config import get_stream_writer

@tool
def search(query: str, runtime: ToolRuntime) -> str:
    """带进度上报的查询工具。"""
    writer = get_stream_writer()      # 获取流式写入器
    writer({"status": "start", "msg": "开始搜索"})     # 发送开始信号
    for i in range(3):                # 模拟搜索过程
        time.sleep(0.5)               # 模拟处理时间
        writer({"progress": f"[{i + 1}/3]"})
    writer({"status": "done", "msg": "搜索完成"})      # 结束
    return "搜索结果……"

# 消费端
for mode, payload in graph.stream({"messages": [...]}, stream_mode=["updates", "custom"]):
    print(mode, payload)
```

#### 应用场景：自定义监控面板

把工具调用模拟成多步骤执行，每一步都往外发进度，就能做出实时监控面板（`[1/2]`、`[2/2]` 这种中间进度都能算出来）。可见自定义流式数据的用途有：

1. 实时进度反馈：长任务里显示进度
2. 打调试信息：把中间算出来的值也吐出去
3. 多源整合：好几种数据一起往外流
4. 自定义监控：做自己的监控面板

### 流式传输 LLM tokens

Token 是模型处理文本的最小颗粒。所以 LangGraph 支持：

- 开 `stream_mode="messages"`，图的任何角落（节点、工具）产出的模型输出都能一个 token 一个 token 地流出来
- 输出格式是 `(message_chunk, metadata)` 元组

#### 先看最简写法

```python
# 定义状态 / 初始化模型 / 构建图（略）
for message_chunk, metadata in graph.stream(
    {"messages": [HumanMessage(content="讲个笑话")]},
    stream_mode="messages",      # 输出格式为 (message_chunk, metadata) 元组
):
    if message_chunk.content:
        print(message_chunk.content, end="", flush=True)     # 逐 Token 输出
```

#### 进阶一：按 tags 筛 token

把 tags 和 LLM 调用关联起来，就能按调用筛选 token：

```python
# 初始化带标签的模型
joke_model = model.with_config({"tags": ["joke"]})
poem_model = model.with_config({"tags": ["poem"]})

def node_joke(state):   # 生成笑话
    return {"messages": [joke_model.invoke("讲个笑话")]}

def node_poem(state):   # 生成诗歌
    return {"messages": [poem_model.invoke("写首诗")]}

# 流式输出并过滤
for message_chunk, metadata in graph.stream({"messages": []}, stream_mode="messages"):
    if "joke" in metadata.get("tags", []):
        print(message_chunk.content, end="", flush=True)      # 只输出笑话相关的 Tokens
```

#### 进阶二：按节点名筛

只想看某个节点的 token，就按流式元数据里的 `langgraph_node` 字段筛：

```python
for message_chunk, metadata in graph.stream({"messages": []}, stream_mode="messages"):
    node_name = metadata.get("langgraph_node")     # 获取节点名称
    if node_name == "node_a":                      # 只输出目标节点的 Tokens
        print(message_chunk.content, end="", flush=True)
```

### 子图（Subgraphs）

### 什么是子图？

**一张图也能当成另一张图里的一个节点**：能单独开发调试，还能被多张主图共用。

用途两条：

- **模块化开发**：不同团队可以分头开发不同部分
- **代码复用**：一套逻辑写一遍就够了

### 使用子图的两种方式

差别全在状态怎么走。

| 对比项 | 方式一：节点里调子图（状态各管各的） | 方式二：子图当节点挂（状态有交集） |
| --- | --- | --- |
| 怎么用 | 在父图的**节点内部**把子图调起来 | 把图**当作**另一个图中的一个节点 |
| 两边状态 | **不同状态模式**：两边结构**可以完全不同**，父图只认自己那份 | **共享状态模式**：两张图**共享部分状态**，各留私有键 |
| 状态定义 | 父子独立：`SubState` 定义 `sub_1` / `sub_2`（都不与父图共享），`ParentState` 只定义 `parent` | 子图 `SubState` 显式区分：`parent`（共享给父图）+ `sub`（子图私有）；父图 `ParentState` 里同样有 `parent` |
| 怎么挂 | `builder.add_node("node_2", node_2)`：挂上去的只是**普通节点函数**，调用被写在函数体里 | `builder.add_node("node_2", subgraph)`：**编译好的子图**本身就能当节点，不用再包一层 |
| 要不要换状态 | 得**手工转换**：先 `subgraph.invoke({"sub_2": state["parent"]})` 换进去，再 `return {"parent": response["sub_2"]}` 换回来 | 不用：同名字段（`parent`）两边自动对上，子图私有的（`sub`）留在里面 |
| 流式输出 | 父图 `.stream()` 里要设 `subgraphs=True`（默认 `False`），否则拿不到子图输出；设了就会从父图和任何子图往外流 | 直接 `graph.stream(...)` 即可：子图的状态更新会合并进父节点（`node_2`）的更新里 |

#### 方式一：在节点里调子图

特点：两张图的状态结构允许**完全不同**。

```mermaid
flowchart LR
    S([__start__]) --> N1[node_1]
    N1 --> E([__end__])
    subgraph node_2 内部
        SN1[sub_node_1] --> SN2[sub_node_2]
    end
```

> 注意：`SubState` 的 `sub_1`、`sub_2` 都是子图自己的，父图认不出来；所以转换这一步躲不掉。

```python
# 1. 定义子图
class SubState(TypedDict):
    sub_1: str
    sub_2: str
    # 注意，这些键都不与父图状态共享

def sub_node_1(state: SubState):
    return {"sub_1": "hello"}

def sub_node_2(state: SubState):
    return {"sub_2": state["sub_1"] + " world"}

sub_builder = StateGraph(SubState)
sub_builder.add_node("sub_node_1", sub_node_1)
sub_builder.add_node("sub_node_2", sub_node_2)
sub_builder.add_edge(START, "sub_node_1")
sub_builder.add_edge("sub_node_1", "sub_node_2")
sub_builder.add_edge("sub_node_2", END)
subgraph = sub_builder.compile()

# 2. 定义主图
class ParentState(TypedDict):
    parent: str

def node_1(state: ParentState):
    return {"parent": "start"}

def node_2(state: ParentState):
    # 将状态转换为子图状态
    response = subgraph.invoke({"sub_2": state["parent"]})
    # 将响应转换回父状态
    return {"parent": response["sub_2"]}

builder = StateGraph(ParentState)
builder.add_node("node_1", node_1)
builder.add_node("node_2", node_2)
builder.add_edge(START, "node_1")
builder.add_edge("node_1", "node_2")
builder.add_edge("node_2", END)
graph = builder.compile()

# 要在流式输出中包含子图的输出，可以在父图的 .stream() 方法中设置 subgraphs=True。
# subgraphs 默认为 False
for chunk in graph.stream({"parent": "hi"}, subgraphs=True):
    print(chunk)
```

开了 `subgraphs=True` 以后，子图出来的 chunk 会带一串命名空间前缀（像 `('node_2:60e75a5e-...',)`），父图自己的则是空元组 `()`。

> 扩展：主图 → 子图 → 孙子图这么套下去也可以，`subgraphs=True` 会把所有层级都流出来。

#### 方式二：把子图挂成节点

```python
# 子图和主图使用相同的状态结构
builder.add_node("node_2", subgraph)     # 直接把子图作为节点加入主图
```

它的卖点在于：**子图和主图共享部分状态** —— 同一个节点可以把状态分给多个子图，公共字段一起用，各自还能带自己的私有键。

```python
# 1. 定义子图
class SubState(TypedDict):
    parent: str      # 与父图共享
    sub: str         # 子图私有

def sub_node(state: SubState):
    return {"sub": state["parent"] + "!"}

sub_builder = StateGraph(SubState)
sub_builder.add_node("sub_node", sub_node)
sub_builder.add_edge(START, "sub_node")
sub_builder.add_edge("sub_node", END)
subgraph = sub_builder.compile()

# 2. 定义主图
class ParentState(TypedDict):
    parent: str

builder = StateGraph(ParentState)
builder.add_node("node_2", subgraph)
builder.add_edge(START, "node_2")
builder.add_edge("node_2", END)
graph = builder.compile()
```

### 为子图添加短期记忆

图里套了子图时，**只需在编译父图时提供 checkpoint**，它会自己往下传，子图不必再配一遍。

```python
subgraph = sub_builder.compile()                          # 子图：不传 checkpointer
graph = builder.compile(checkpointer=InMemorySaver())     # 主图：只在父图传
```

### 在子图中使用中断

子图里照样能停。

#### 基本用法

子图里照样能用中断，加了短期记忆之后也能检查图状态（检查点）。

> 注意：子图状态只有它挂着中断的时候才看得到；一旦恢复，就摸不着了。

```python
# 子图
def sub_node_2(state: SubState):
    answer = interrupt("子图需要确认")
    return {"sub_2": answer}

# 主图
graph = builder.compile(checkpointer=InMemorySaver())
config = {"configurable": {"thread_id": "1"}}
result = graph.invoke({"parent": "hi"}, config)
# 访问子图状态只能在子图被中断时才可用。
# 一旦恢复了图，将无法访问子图状态。
print(result["__interrupt__"])
```

#### 恢复时的注意事项

前面提过：恢复时，抛中断的那个节点会**从头再跑一遍**，中断点之前的代码就被**多重复执行**了。放到子图里，两种调用方式跑出来的结果还不一样。

- **把子图作为节点时**：由 `subgraph_node_2` 这个节点发起中断，恢复后 `subgraph_node_2` 会被调用两次，符合预期。

```text
subgraph_node_2 第 1 次执行
subgraph_node_2 第 2 次执行
```

- **在节点内调用子图时**：情况更麻烦 ——
  - 父图会从「调用子图并触发中断」的那个节点的开头恢复执行
  - 子图也会从「调用中断」的节点开头恢复

```text
主图 node_2 第 1 次执行
子图 sub_node_2 第 1 次执行
主图 node_2 第 2 次执行      # 连调用子图的主图节点也被重新调用了
子图 sub_node_2 第 2 次执行
```

> **坑**：所以子图里的中断，副作用设计要更小心 —— 只要中断发生在子图内部，父图那个「包装节点」的所有前置代码都会被重跑。

## 六、综合案例--AI 智能租房助手

这是我串起来的完整项目。

### 案例需求说明

先看它长什么样。

### 案例演示

一个「智能租房助手」网页应用：左侧是房源门户（三个搜索字段：城市/区域/小区、租金预算、户型需求；两张能力卡：「AI 智能推荐」「海量真实房源」；下面还有推荐列表），右下角挂着可展开的对话窗。

演示顺序：**荐房 → 反问要不要订 → 收手机号和证件 → 出预定工单 → 换个会话查我的预定 → 闲聊问答**。

几段关键交互（我照着复现过）：

- 用户说想在西安雁塔区找房，预算一千到两千，先看三套。
- 助手思考过程里能看到工具调用：先 `sql_db_list_tables` 拿到表清单，再 `sql_db_schema` 拿到表结构。
- 推荐完它会主动问一句：需不需要帮忙订？不要就回「不需要」，要就回「需要」，别的值不认。
- 用户回「需要」→ 助手依次问房源名称、手机号、身份证号 → 返回「您已成功预定房源：……，预定工单号为：`68b163ef-...`」
- 用户点「查询我的预定信息」→ 助手回显房源标题、工单 ID、预定电话。

### 项目能力说明

#### 房源推荐

- 从对话里抠出需求（钱、地段、通勤、户型），当场筛出房源推给用户
- 展示思考过程（调了哪些工具、工具返回了什么），体现结果准确性
- 需求说不清时会反过来问：请补上城市等信息；不想说就直接回「不提供」，它按现有信息推。

#### 房源预定

- 支持直接预定，也能从房源推荐引导到预定
- 会带着走签约流程，并自动列出待办（比如提示该传证件号了）

#### 查询我的

- 换个会话也能翻出以前的预算和租过的房

#### 常规问答

- 支持普通问答（比如让助手讲个笑话）

### 涉及知识点

- 多轮对话交互
- 图的三件套：状态、节点、边（含条件边）
- 子图，以及子图里的中断
- 两档持久化：线程级 + 跨会话
- 两档存储：内存 + Postgres
- 路由模式
- 用工具读 SQL 库
- 人工介入（中断）
- 运行期上下文
- 流模式混用
- 项目结构
- 生态与部署

### 搭建一个 LangGraph 项目

搭法有两种：自己写 Python 服务并自定协议对外提供能力；或者用 LangChain 生态里的 LangSmith Deployment 部署（需要结构化项目）。案例选后者。

LangSmith Deployment 抄的是开源 LangGraph 的地基，专跑有状态应用：抽象与执行模型来自 LangGraph，LangSmith 补齐整个生命周期 —— 托管设施、可观测性、部署选项、助手、并发控制。

#### 搭建项目

_步骤 1：安装 LangGraph CLI_

```bash
pip install -U "langgraph-cli[inmem]"     # 需要 Python 3.11 或更高
langgraph --version                       # 验证安装情况
```

CLI 提供的指令：

| 指令 | 解释 |
| --- | --- |
| `langgraph dev` | 启动轻量级本地开发服务器（不需要 Docker），适合快速测试 |
| `langgraph build` | 构建 LangGraph API 服务器的 Docker 镜像，用于部署 |
| `langgraph dockerfile`（导出 Docker 文件的指令） | 按配置导出一个 Dockerfile，用于自定义构建 |
| `langgraph up` | 在本地 Docker 里启动 LangGraph API 服务器；需要 Docker，本地开发还要 LangSmith API 密钥 |

由此产生的服务器公开三类东西：

- **助手（Assistants）**：图的配置实例
- **线程（Threads）**：攒着若干次运行的产出，说白了就是一串会话
- **线程执行（Thread Runs）**：每次运行就是拿线程上的图／助手调一次，顺带把线程状态推进

另外还附带托管的检查点库与存储库。

_步骤 2：创建应用_

用 `langgraph new` 从模板创建。方式 1 是交互式菜单选模板，可选模板有：

1. 新 LangGraph 项目：一个精简的、自带记忆的聊天机器人
2. ReAct 代理：结构简单、容易扩展多种工具的代理
3. 记忆代理：ReAct 风格，额外配了一个存记忆的工具，供不同对话线程复用
4. 检索代理：内部带一套靠检索作答的问答流程
5. 数据丰富代理：做网络搜索并把结果整理成结构化格式

交互过程就四步：输入路径 → 选模板 → 选语言（1 是 Python，2 是 JS/TS）→ 创建成功。生成出来的目录长这样：

```text
.git  .github  .venv  src  tests
.env  .env.example  .gitignore  langgraph.json
LICENSE  Makefile  pyproject.toml  README.md  uv.lock
```

方式 2 是直接指定模板：

```bash
langgraph new ./house-agent --template new-langgraph-project-python
```

模板里就是个单节点小应用，照着往里加逻辑即可；建好用 PyCharm 打开。

_步骤 3：安装依赖_

```bash
cd house-agent
pip install -e .
```

环境准备可能踩的坑：Debian / Ubuntu 从 Python 3.11 起引入了保护机制，默认禁止直接往系统 Python 里 `pip install`。解决方式：

- 用虚拟环境（推荐）
- 或在命令后加 `--break-system-packages` 强制覆盖（不推荐，急用可临时上）

_步骤 4：配置环境_

把 `.env.example` 复制成 `.env`，填上必要的 `LANGSMITH_API_KEY`。

```bash
LANGSMITH_API_KEY=lsv2_pt_xxx
```

_步骤 5：查看并启动服务器_

模板里的 `src/agent/graph.py` 就是一个单节点图：

```python
# Define the graph
builder = StateGraph(State, context_schema=Context)
builder.add_node("call_model", call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)
graph = builder.compile()
```

要让应用能跑，CLI 需要一个 `langgraph.json`，其中必须配 `"graphs"`：从图 ID（`agent`）映射到已编译图的路径（`./src/agent/graph.py:graph`）。

```bash
langgraph dev     # 内存模式启动 Agent Server，输出里会给 API 和 Studio UI 地址
```

> 坑：如果启动报错，先看 `langgraph-api` 版本是不是 `0.7.19`（该版本有 bug），换成 `0.7.18` 之类即可。

_步骤 6：在 Studio 中测试_

用输出的 URL 在 LangGraph Studio 里可视化和调试。Studio 是个和 Agent Server 交互的图形界面，**它不持久化任何私有数据**（发给服务器的内容不会进 LangSmith）。界面虽然挂在 smith.langchain.com 上，但它跑在浏览器里，直连本地 Agent Server。

界面上的关键区域：

| 区域 | 内容 |
| --- | --- |
| 顶栏 | `LangSmith` / `Studio` / `agent`，`Graph`、`Chat` 两个页签，`● Connected` 表示连上了，还有线程 ID 与右侧的 `Interact`、`Trace`、`Run experiment` |
| 左侧导航 | `Switch to AGENT BUILDER`、`Application`（`All applications`）、`Home`、`Tracing`、`Monitoring`、`Datasets & Experiments`、`Annotation Queues`、`Prompts`、`Playground`、`Studio`、`Deployments`；下方 `Documentation`、`What's New`、`Invitations`、`Theme`、`Settings` |
| 中间画布（定义的图） | `__start__` → `call_model` → `__end__`，上方有 `Memory`、`Interrupts` 两个入口 |
| 右侧（跑起来的过程） | 按 `TURN` 和超级步骤展示：第 1 步 `__start__`（`Changeme` 值为「哈哈」），第 2 步 `call_model`（`Changeme` 值为 `output from call_model`） |
| 底部（输入） | `Input` 面板（可切 `View Raw`），字段 `Changeme`（`Optional`），填值后点 `Submit` 提交执行 |

_步骤 7：测试 API_

两条路：Python SDK（异步 / 同步）或直接发 REST 请求。

- Python SDK：先 `pip install langgraph-sdk`，再用它的接口访问
- REST API：CLI 已经把接口文档准备好了，点 `API Docs` 即可
  - `API Docs` 自带的开发者工具里有 `Share`、`Generate SDKs`、`Configure` 三个操作项
  - 路径变量旁边标 `Required` 就是必填（例如 `thread_id`），`Optional` 则是可给可不给

做 Web 应用时案例选了 REST（SDK 与 REST 的概念和流程一样，只是姿势不同，一通百通）。两个最常用的接口：

- **创建会话线程**：`POST http://127.0.0.1:2024/threads`，请求体是空对象 `{}`；返回体里有 `thread_id`、`created_at`、`updated_at`、`metadata`、`status`（`idle`）、`config`、`values`
- **基于线程发起流式调用**：`POST http://127.0.0.1:2024/threads/{thread_id}/runs/stream`，body 里指定 `assistant_id` 与 `stream_mode`

流式调用常见的 `stream_mode`：

| Mode | 说明 |
| --- | --- |
| `values` | 每跑完一个超级步骤，就把整份图状态送出来 |
| `updates` | 每步之后给出状态更新；同一步里多个节点（比如并行）会分开发 |
| `messages` 或 `messages-tuple` | 流式传输 LLM token 和元数据，对聊天应用最有用 |
| `custom` | 把图里自己塞的数据送出来 |
| `events` | 所有事件都送（含图状态）；多半是迁大块 LCEL 应用时才用 |

`stream_mode` 也可以传列表同时开多种（如 `["updates", "messages"]`）。

返回结构是 SSE 格式的事件流，每条包含三部分：

- `event`：这一段的类型
- `data`：跟着事件走的数据
- `id`：编号

`event` 与 `data` 的取值跟传入的 `stream_mode` 有关。常见 event：

- `metadata`：data 里包含图节点、LLM 调用细节等信息
- `updates`：data 里是每个节点更新的状态
- `values`：data 里是每个节点最新的状态
- `messages`：data 里是聊天模型吐出的单个 token

### 项目结构说明

要部署，就得准备一个结构化项目。可部署的应用必须包含四部分：

- 一个或多个图：承载核心逻辑
- 配置文件（`langgraph.json`）：写清依赖、图、环境变量
- 依赖文件：列出要装的包，如 `requirements.txt`、`pyproject.toml`
- 环境变量文件（可选，`.env`）

```text
house-agent/
├── src/agent/
│   ├── __init__.py
│   └── graph.py
├── tests/
├── langgraph.json
├── pyproject.toml
├── .env
├── Makefile
├── README.md
├── LICENSE
└── uv.lock
```

### 配置文件：pyproject.toml 与 langgraph.json

#### pyproject.toml

这是当下 Python 项目的标配清单文件，把老的 `setup.py`、`requirements.txt` 顶掉了。它管几件事：

- 记元信息：叫啥、哪版、谁写的
- 管依赖：生产一套、开发一套
- 配构建系统
- 配代码检查工具（如 ruff）

分块说明：

| 区块 | 作用 |
| --- | --- |
| `[project]` | 项目名片 |
| `[project.dependencies]` | 上线要的依赖 |
| `[project.optional-dependencies]` | 可选依赖（分组） |
| `[build-system]` | 构建工具设置 |
| `[tool.setuptools]` | 包目录怎么摆 |
| `[tool.ruff]` | Ruff 检查器设置，里头集成了好几种检查 |
| `[dependency-groups]` | 依赖分组（开发用） |

整个模板的要点：源码放在 `src/agent/`；支持类型提示（带 `py.typed` 文件）；用了现代工具链（ruff、mypy、pytest 等）。

#### langgraph.json

CLI 默认在当前目录找这个文件。主要字段：

| 配置键 | 必填? | 类型 / 取值 | 说明与示例 |
| --- | --- | --- | --- |
| `$schema` | 必需 | 字符串 | 指向 JSON Schema 用于校验，例如 `"https://langgra.ph/schema.json"` |
| `dependencies` | 必需 | 数组 | 依赖清单：写 `"."` 表示找本地包；也可以给目录路径（里面得有 `pyproject.toml` / `setup.py` / `requirements.txt`）；或者干脆写包名 |
| `graphs` | 必需 | 对象 | 图的映射表，写法 `{"图ID": "文件路径:导出对象"}`，例如 `{ "chat": "./chat.graph:graph" }` |
| `auth` | 可选 | 对象 | 自定义认证配置（v0.0.11+），要指定认证处理器路径 |
| `base_image` | 可选 | 字符串 | 基础 Docker 镜像，默认 `langchain/langgraph-api`，可用于固定版本 |
| `image_distro` (>=0.2.11) | 可选 | 枚举 | 底层镜像用哪个 Linux 发行版：`"debian"`（默认）、`"wolfi"`、`"bookworm"`、`"bullseye"`；推荐用更稳的 `"wolfi"` |
| `env` | 可选 | 字符串或映射 | 环境变量：给 `.env` 路径，或者直接写成键值对 |
| `store` | 可选 | 对象 | 存储配置：`index` 做语义搜索索引（要指定 `embed` 嵌入模型、`dims` 维度、`fields` 字段）；`ttl` 配数据过期（可设 `refresh_on_read`、`default_ttl`、`sweep_interval_minutes`） |
| `checkpointer` | 可选 | 对象 | 检查点配置：`ttl` 是过期策略（`strategy`、`sweep_interval_minutes`、`default_ttl`）；`serde`（Agent server 0.5+）控制反序列化行为（`allowed_json_modules`、`pickle_fallback`） |
| `http` | 可选 | 对象 | HTTP 层设置：挂自定义应用（`app`）、CORS、中间件先后（`middleware_order`）、可配请求头、前缀挂载（`mount_prefix`） |
| `webhooks` (v0.5.36+) | 可选 | 对象 | 出站 Webhook 配置：含 `env_prefix`、`headers`（静态请求头）、`url`（URL 验证策略） |
| `python_version` | 可选 | 字符串 | Python 版本：`"3.11"`（默认）、`"3.12"`、`"3.13"` |
| `node_version` | 可选 | 字符串 | Node.js 版本；要用 LangGraph.js 可设 `"20"` |
| `pip_installer` (v0.3+) | 可选 | 枚举 | Python 包安装器：`"auto"`（默认，用 `uv pip`）、`"pip"`、`"uv"` |
| `api_version` (v0.3.7+) | 可选 | 字符串 | 指定 API Server 的语义化版本（如 `"0.3"`），不写就取最新 |

两个补充：

- 版本注意：部分键有最低 CLI 版本要求，表里已标出
- 自定义嵌入：`store.index.embed` 既能填内置模型名（如 `"openai:text-embedding-3-small"`），也能指向本地写好的嵌入函数（如 `"./embeddings.py:embed_texts"`）

### 案例思路解析

先讲方法，再讲落地。

### 整体思路--五步构建法

核心是把流程切成一个个节点，用共享状态串起来；每个节点既能读也能写，还能自己挑下一步。

#### 第一步：工作流分解

- 把流程拆成独立步骤，每步一个节点；复杂操作拆成子图处理
- 把节点之间的连线画出来

#### 第二步：节点功能识别

- LLM 节点：理解、分析、生成文本或做推理决策
- 数据节点：去外面取数据回来
- 动作节点：往外做动作（发请求、改库）
- 用户输入节点：留给人补一刀

#### 第三步：状态设计

- 状态等于共享内存，谁都能读
- 只放原始数据，别把拼好的文本或提示词模板塞进去
- 设计原则：只有跨步骤要留住的才放状态；能推出来的别存

#### 第四步：节点实现

- 每个节点都是「收状态、返回更新」的函数
- 用 `Command` 一次交代两件事：改什么状态、下一步去哪
- 出错怎么办：
  - 一会就好型（网络抖）：自动重试，节点上可以配 `RetryPolicy` 定重试次数与退避
  - LLM 自己能救：把错信息丢进状态让模型再试
  - 用户可修复错误：用 `interrupt()` 暂停，等人工输入
  - 意料之外：直接抛出来好排查

#### 第五步：连接组装

- 该加的节点和边都补上
- 挂上 `checkpointer` 拿到持久化，暂停与恢复就有了
- 编成能跑的成品

### 按功能模块拆分为多图

按能力拆图：荐房、订房、查我的、闲聊，各归各的子图：

- `recommended_graph` 推荐子图：查数据库、按条件推荐房源
- `reserve_graph` 预定子图：处理预定、生成工单
- `extend_graph` 其它子图：常规问答等

外面再套一张主图当调度：看这句话该丢给哪个子图。

### 主图--智能分流

节点设计：

| 节点 | 职责 |
| --- | --- |
| `get_store_info` | 去持久化里翻消息，比如用户以前的偏好 |
| `identify_question` | 识别用户问题，做智能路由 |
| `recommended_graph` | 路由 1：房源推荐 |
| `reserve_graph` | 路由 2：预定房源 |
| `extend_graph` | 路由 3：兜底的闲聊与杂问 |
| `get_user_preferences` | 路由 4：用户查询自己的信息 |
| `need_reserve` | 荐完房反问一句要不要订 |

```mermaid
flowchart TD
    S([__start__]) --> G[get_store_info]
    G --> I[identify_question]
    I -.-> R[recommended_graph]
    I -.-> V[reserve_graph]
    I -.-> X[extend_graph]
    I -.-> P[get_user_preferences]
    R --> N[need_reserve]
    N -.-> V
    N -.-> E([__end__])
    V --> E
    X --> E
    P --> E
```

### 推荐子图：构建自定义代理（SQL）

它要这么几个节点：

| 节点 | 职责 |
| --- | --- |
| `collect_user_info` | 收集用户想推荐的房源关键信息 |
| `list_tables` | 调 SQL 工具，查有哪些表 |
| `call_get_schema` | LLM 绑定 `get_schema` 工具，**强制**调用它 |
| `get_schema` | 执行工具，拿表详情（表结构、示例数据） |
| `generate_query` | 给 LLM 绑上 `run_query` 但**不强制**：既可能生成 SQL，也可能直接给结论 |
| `check_query` | LLM 绑定 `run_query` 工具，**强制**调用 |
| `run_query` | 执行工具：跑 `generate_query` 生成的 SQL，检验对不对 |

```mermaid
flowchart TD
    S([__start__]) --> C[collect_user_info]
    C --> L[list_tables]
    L --> CGS[call_get_schema]
    CGS --> GS[get_schema]
    GS --> GQ[generate_query]
    GQ -.-> CQ[check_query]
    GQ -.-> E([__end__])
    CQ --> RQ[run_query]
    RQ --> GQ
```

### 预定子图：需要人工介入的订房流程

节点设计：

| 节点 | 职责 |
| --- | --- |
| `get_title` | 中断，问清要订哪套房 |
| `get_phone` | 中断获取预定人电话 |
| `get_id` | 中断获取预定人身份证 |
| `add_reserve_message` | 构造并添加预定消息 |
| `call_orders` | LLM 绑定生成工单的工具 |
| `tool_node` | 生成工单的工具节点 |

```mermaid
flowchart TD
    S([__start__]) --> T[get_title]
    T --> P[get_phone]
    P --> I[get_id]
    I --> A[add_reserve_message]
    A --> C[call_orders]
    C -.-> TN[tool_node]
    C -.-> E([__end__])
    TN -.-> C
```

### 扩展子图：业务之外的问答助手

就是前面提到的 `extend_graph`，只用一个节点：

- `extend_node` 节点：LLM 对话助手

```mermaid
flowchart LR
    S([__start__]) --> X[extend_node] --> E([__end__])
```

### 案例开发

### 通用设计

#### LLM（`llm.py`）

主图和子图里所有 LLM 调用统一走 OpenAI。

#### 持久化存储（`store.py`）

因为要收集用户偏好与历史预定信息，必须用持久化存储。先定义存进 Store 的值结构：

```python
class UserPreferences(BaseModel):
    """用户偏好"""
    city: Optional[str] = None
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    house_type: Optional[str] = None
```

在节点里获取或添加：

```python
# 1. 通过 Namespace 获取用户偏好数据
user_id = runtime.context.get("user_id")
namespace = (user_id, "preferences")

# 2. 查询
item = store.get(namespace, "prefs")

# 3. 存储
store.put(namespace, "prefs", UserPreferences(...).model_dump())
```

#### 运行时上下文（`content.py`）

构建 Namespace 要按用户 id 区分，所以把用户 id 放进上下文，单次运行就能按 id 取持久化信息。

```python
@dataclass
class ContextSchema:
    user_id: str
```

节点里取用：

```python
def some_node(state: State, runtime: Runtime[ContextSchema]):
    user_id = runtime.context.user_id
```

### 主图--智能分流

#### 状态定义（`state/main.py`）

- 主状态 `State`：全局共享，从 `MessagesState` 继承，聊天记录不用自己管
- `user_intent`：用户意图，表示这次输入是推荐 / 预定 / 查询 / 其它
- `user_preferences`：用户口味，用来在节点之间共享
- 节点间传输私有状态 `NeedReserveOutput`：推荐子图跑完后，拿到「用户想不想预定房源」的意向，据此决定要不要进预定子图

#### 图怎么搭（`graph.py`）

> 注意：编译这张图时**不用**给 `checkpointer` 和 `store` —— 交给 LangSmith 部署时，持久化在配置里指定就行。

```python
builder = StateGraph(State, context_schema=ContextSchema)     # 构建图
# ...加节点、加边...
builder.add_conditional_edges("identify_question", router_message)      # 路由1/2/3/4 由 router_message 决定
builder.add_conditional_edges("need_reserve", should_reserve)          # 是否进预定子图
graph = builder.compile()
```

#### 节点实现（`node/main.py`）

- 识别用户问题：用结构化提取模型判断属于预定 / 推荐 / 我的，只看最新的用户消息
- 查询持久化消息：按 `user_id` 搜 Store 里的用户信息
- 中断询问是否需要帮忙预定房源：`interrupt()` 等用户输入
- 返回用户偏好信息：把已预定过的信息格式化后回给用户

### 推荐子图：代码怎么写

**状态定义（`state/recommend.py`）**：除了用户偏好（数据共享），还有推荐的关键参数；再提供一个获取推荐信息的方法。

**工作流定义**：先收集需求 → 看有哪些表 → 读表结构 → 拼 SQL → 校验 → 执行 → 回结果。

```python
builder = StateGraph(RecommendState)
# 添加边
builder.add_conditional_edges(
    "generate_query",
    should_check,     # 是：LLM 强制调用 sql_db_query 工具执行 SQL，并生成人工用户消息供检查
    {                 # 否：end
        "check_query": "check_query",
        END: END,
    },
)
```

#### 节点实现

`collect_user_info` 怎么跟用户来回：

1. 先用历史偏好打底
2. 再从这轮对话里抠
3. 还缺就中断问一句（缺什么就问什么，比如缺 `预算范围` 就 `missing_info.append("预算范围")`）
4. 持久化更新

`get_schema` 与 `run_query` 都要和数据库打交道。LangChain 里有个 SQL 交互工具包：**SQLDatabase Toolkit**。

#### 接入工具包

这个包住在 `langchain-community` 里，负责让程序跟 SQL 打交道。它最常被用来搭「查库作答」的问答应用，而且允许试错重来。里面备好的工具：

| 工具 | 作用 |
| --- | --- |
| `QuerySQLDatabaseTool` | 把 SQL 跑掉并回结果 |
| `InfoSQLDatabaseTool` | 取某张表的 schema 与样例行 |
| `ListSQLDatabaseTool` | 把库里所有表列出来 |
| `QuerySQLCheckerTool` | 运行前检查 SQL 查询的正确性 |

它还支持智能体工作流：图可以用这些工具自主探索库结构、写查询、检查并执行，最后给出自然语言答案。

安装与配置：

```bash
pip install langchain-community
```

```bash
# .env
# MYSQL 配置
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=xxx
MYSQL_DATABASE=house
```

实例化工具：

```python
# 获取数据库工具
db = SQLDatabase.from_uri("mysql+pymysql://...")
tools = SQLDatabaseToolkit(db=db, llm=llm).get_tools()
# 打印出来大致是：
# [QuerySQLDatabaseTool(description="Input to this tool is a detailed and ..."),
#  InfoSQLDatabaseTool(description='Input to this tool is a comma-separated ...'),
#  ListSQLDatabaseTool(db=...),
#  QuerySQLCheckerTool(description='Use this tool to double check if your query ...')]
sql_db_list_tables = tools[2]     # 列出所有表
sql_db_schema = tools[1]          # 获取表信息
```

工具节点封装：

```python
def get_schema_node(state):
    # 获取表信息
    return {"messages": [sql_db_schema.invoke(...)]}

def run_query_node(state):
    # 根据 SQL 查询结果
    return {"messages": [query_tool.invoke(...)]}
```

#### 房源表的字段

数据库客户端里那张表叫 `house_information_prd`，字段大致是：

| 字段 | 含义 |
| --- | --- |
| `id` / `user_id` | 主键 / 归属用户 |
| `title` | 房源标题 |
| `rent_type` | 租赁方式（整租 / 合租） |
| `house_type` | 户型（如 1室1厅1卫） |
| `rooms` | 房间数 |
| `floor` / `all_floor` | 所在楼层 / 总楼层 |
| `position` | 位置（区域、小区） |
| `area` | 面积 |
| `price` | 租金 |
| `intro` | 房源介绍 |
| `devices` | 配套设施 |

**`list_tables` 节点**：用 SQL 工具看看库里有哪些表。这里我一次返回三条消息 —— 【带工具调用的 AI 消息、工具消息、收尾的 AI 消息】，正好对上聊天模型要的序列：不调工具时一轮就 `Human message` + `AI message`；调工具时一轮变成 `Human message` → `AI message`（发起）→ `Tool message`（返回）→ `AI message`（收尾），开头都垫一条 `System message`。

**`call_get_schema` 节点**：让 LLM 绑定 `get_schema` 工具并强制调用它。这一步相当于构造第一个 AI message；前面定义的 `get_schema_node` 则是在构造 Tool message。

**`generate_query` 节点**：两个作用 —— 生成查 SQL 的工具调用（第一个 AI message），或生成最终结果（最后一个 AI message）。所以 LLM 要绑定 `run_query` 工具，但**不强制**调用，以允许模型在拿到答案时自然作答。

**`check_query` 节点**：给 `generate_query` 拼出来的 SQL 过一遍安检。只要上一步决定调工具，就会先落到这里 —— 先查后跑。这个节点上的 LLM 必须绑 `run_query`，而且**强制调用**。

```python
def check_query(state):
    # 强制创建一个调用查询 SQL 的工具调用
    ai_msg = llm.bind_tools([run_query], tool_choice="run_query").invoke(state["messages"])
    # 生成人工用户消息进行检查
    # 上一个节点是 generate_query，走到这必定调用了工具，拿到的 SQL 是准确的
    # 将 SQL 当作用户消息传入进行检查
    return {"messages": [ai_msg, HumanMessage(content=ai_msg.tool_calls[0]["args"]["query"])]}
```

### 预定子图--需要人来插手的订房流程

**状态定义**：从 `MessagesState` 继承，另加三个业务字段。

**图怎么搭**：起手 `StateGraph(ReserveState)` ——

- `add_sequence` 一口气串起 5 个节点
- 工具节点由 `ToolNode([generate_orders])` 担
- `START` 接 `get_title`
- `call_orders` 靠 `tools_condition` 分流（`tools` → `tool_node`，`__end__` → `END`）
- `tool_node` 回到 `call_orders` 形成循环

```python
builder = StateGraph(ReserveState)
builder.add_sequence([get_title, get_phone, get_id, add_reserve_message, call_orders])
builder.add_edge(START, "get_title")
builder.add_node("tool_node", ToolNode([generate_orders]))
builder.add_conditional_edges("call_orders", tools_condition)
builder.add_edge("tool_node", "call_orders")
```

**节点实现**：几个收数据的节点都在循环校验 —— 填对了才放行。

```python
def get_title(state: ReserveState):
    while True:
        title = interrupt("请输入要预定的房源名称")
        if title:
            return {"title": title}
        # 每次验证失败后，提示信息会更新

def get_phone(state: ReserveState):
    while True:
        phone = interrupt("请输入要预定的手机号")
        if len(str(phone)) == 11:
            return {"phone": phone}

def get_id(state: ReserveState):
    while True:
        id_card = interrupt("请输入要预定的身份证号码")
        if id_card:
            return {"id_card": id_card}

def add_reserve_message(state: ReserveState):
    # 节点：新增预定消息
    return {"messages": [HumanMessage(content=f"预定 {state['title']}")]}

@tool
def generate_orders(...) -> str:
    """工具：生成工单"""
    # 这里可以用 InjectedState / InjectedStore 注入状态与存储
    return "工单号：68b163ef-..."
```

> 说明：几个取数节点里「可以进行验证」的位置是留出的校验位，另外「持久化订单表」也是留出的扩展点，需要自己补实现。注入状态 / 存储可以参考 `InjectedState`、`InjectedStore` 的用法。

### 扩展子图--业务之外的问答助手

代码很短，合成一个 py 文件就够了：

```python
def extend_node(state: ExtendState):
    return {"messages": [llm.invoke(state["messages"])]}

builder = StateGraph(ExtendState)
builder.add_node("extend_node", extend_node)
builder.add_edge(START, "extend_node")
builder.add_edge("extend_node", END)
graph = builder.compile()
```

### 项目部署

### 自托管部署：相关组件逐个说明

这套流程本质上是 **LangSmith 自托管部署**：在企业自有基础设施里构建、部署、管理图。核心组件协同工作：

| 组件 | 角色 | 功能 |
| --- | --- | --- |
| Agent Server | 跑图的运行时底座 | 给一套标准 API，管执行、状态与持久化 |
| LangGraph CLI | 命令行工具 | 本地构建、打包图，与图交互，为部署做准备 |
| Studio | 集成开发环境 | 可视化、交互、调试图的专用 IDE，可连本地 Agent Server |
| Python SDK（自行了解） | 软件开发工具包 | 用编程接口与已部署的图和 Agent Server 交互 |
| RemoteGraph（自行了解） | 本地代理包装器 | 像调本地图一样调远程部署的图 |
| Control Plane（控制平面，自行了解） | 管理和配置层 | 创建、更新、管理 Agent Server 部署的界面与 API |
| Data plane（数据平面，自行了解） | 执行层 | 真正运行图的运行时层，含 Agent Server 实例与后端服务（PostgreSQL、Redis 等） |

串起来就是：开发者用 CLI 和 Studio 在本地开发测试，然后部署成 Agent Server；应用通过 SDK、RemoteGraph 或 Agent Server 提供的 API 调用；部署与生命周期由 Control Plane 管，具体任务执行在 Data plane。

> 注意：Control Plane 和 Data plane 是可选的，只是一种用法。

### 本地启动并测试

- 改 `langgraph.json`，把新增的图都配进去：

```json
{
  "dependencies": ["."],
  "graphs": {
    "house_agent": "./src/agent/graph.py:graph",
    "recommend_agent": "./src/recommend/graph.py:graph",
    "reserve_agent": "./src/reserve/graph.py:graph",
    "extend_agent": "./src/extend/graph.py:graph"
  },
  "env": ".env"
}
```

- 跑 `langgraph dev` 启动本地开发服务器（内存模式，适合开发测试）
- 在 Studio 里测试：`Select a graph` 下拉框选要测的图（`house_agent`、`recommend_agent`、`reserve_agent`、`extend_agent`），在 `Input` 面板填 `Messages`（必填）、`User Intent`（必填）、`User Preferences`（必填），点 `Submit` 运行，再看 `Interact` / `Trace` 里的过程

### 部署方式

Agent Server 能按手头的基础设施挑部署姿势：

- **云部署（有兴趣自行研究）**：全托管，基础设施全由平台扛 —— 全托管基础设施（更新、扩展、维护都由平台管）、从 GitHub 部署（连上代码库点几下）、自动化 CI/CD、LangSmith UI（可观测性、评估、部署管理、Studio 全都有）
- **混合 / 自托管（配 Control Plane，有兴趣自行研究）**：在本地打好 Docker 镜像，推进 K8s 够得着的仓库，然后从 LangSmith UI 上点部署
- **独立服务器**：直接部署 Agent Server，不走 Control Plane 和 LangSmith UI

### 独立部署 Agent Server

这里走独立部署：让它自己当个服务跑着。

#### 工作流程

1. 用 `langgraph-cli` 或 Studio 在本地定义并测试图
2. 把应用服务打包成 Docker 镜像
3. 把 Agent Server 部署到平台：
   - **Kubernetes**：用 LangSmith Helm 图表在 K8s 集群里跑 Agent Server（生产级推荐，官网自行研究）
   - **Docker**：凡是有 Docker 的机器（本机、VM、ECS）都能跑，开发或小流量最合适

#### 部署前的准备工作

部署 Agent Server 实际上是部署「一个或多个图 + 一个持久化数据库 + 一个任务队列」：

- PostgreSQL 当数据库：检查点、助手这些要留的东西都落在这儿
- Redis 当任务队列：靠发布订阅把事件实时推出去

> 注意：走 LangSmith 云部署时这些组件自动托管；独立部署就得自己搭、自己管。

```bash
# 启动 Redis 容器
docker run -p 6379:6379 --name redis -d redis

# 使用 Docker 快速安装并启动 postgres
docker run -p 5432:5432 -e POSTGRES_PASSWORD=bit --name postgres-sql -d postgres
```

`.env` 里再补 Redis 与 Postgres 两项：

```bash
# DOCKER 必须
REDIS_URI=redis://localhost:6379
DATABASE_URI=postgresql://postgres:bit@localhost:5432/postgres
```

#### 姿势 1：打镜像直接跑

```bash
langgraph build -t my-agent-server
```

- `.env` 必须设置 `REDIS_URI`、`DATABASE_URI`
- 默认端口 `8000`
- `-t` 是必选参数：Docker 镜像的标签

#### 部署姿势 2：生成 dockerfile 再配 Docker compose

用 `langgraph dockerfile [OPTIONS] SAVE_PATH` 生成一个用来构建 LangSmith API 服务镜像的 Dockerfile。

| OPTIONS | 默认 | 描述 |
| --- | --- | --- |
| `-c, --config FILE` | `langgraph.json` | 配置文件的路径，里面写依赖、图与环境变量 |
| `--help` | | 显示信息并退出 |

> 注意：这个命令会把 `langgraph.json` 里的所有配置转换成 Dockerfile 命令。所以每次改了 `langgraph.json` 都要重新跑一次，否则改动不会反映到构建或运行结果里。

然后配 Docker compose 启动：要么只放服务（Redis 和 Postgres 已经单独搭好了），要么写一份带 Redis 和 Postgres 的完整版（完整版要先打镜像再运行）。

```bash
docker compose up
```

#### 部署姿势 3：构建镜像并把服务跑在 Data plane 中

```bash
langgraph up
# 启动 langgraph-api，实际上依赖了 docker
```

**坑：数据库迁移失败。** `.env` 里的 `DATABASE_URI` 如果指向之前本地用的那个库，可能会撞上迁移失败：

- `checkpoints` 表里的 `thread_id` 字段是 `text` 类型
- `thread` 表里的 `thread_id` 字段是 `uuid` 类型
- 两者类型必须一致，才能建外键关系

解决办法：**新建一个库，做环境隔离**。

### 项目扩展（自行研究）

想再往前推，可以试试这几条：

- **扩展：在主图中进行消息管理** —— 挑合适的位置做修剪与总结。比如荐完房后把过程消息总结掉、删掉工具消息，免得消息堆太多把后续 LLM 调用撑爆。
- **扩展二**：把户型、朝向这类期望做成结构化输出；最好跟表字段一一对上，那样拼出的 SQL 更靠谱。
- **扩展三**：执行 SQL 前加中断，人工审核 SQL 的准确性。
- **扩展四**：自定义流式输出，让前端展示更详细、更实时的执行过程。

到这里，一张图从「状态 + 节点 + 边」长到「持久化 + 中断 + 子图 + 服务化」，能覆盖真实项目里绝大部分编排需求了。它是一个起点，不是终点。

