---
title: "HTTP 协议"
published: 2026-05-20 20:34:10
description: "HTTP (HyperText Transfer Protocol, 超文本传输协议) 是应用层最广泛使用的协议之一。它定义了客户端（如浏览器）与服务器之间如何通信，以交换超文本资源（如 HTML 文档、图片、视频等）。"
category: "Linux 网络"
tags: ["Linux 网络"]
lang: "zh_CN"
draft: false
comment: true
---

# 1. HTTP 协议概述

**HTTP (HyperText Transfer Protocol, 超文本传输协议)** 是应用层最广泛使用的协议之一。它定义了客户端（如浏览器）与服务器之间如何通信，以交换超文本资源（如 HTML 文档、图片、视频等）。

**核心特点：**

1. **客户端/服务器模型：** 请求由客户端发起，服务端处理并返回响应。

2. **无连接：** 每次请求通常建立新的连接（但在 HTTP/1.1 后通过 Keep-Alive 优化）。

3. **无状态：** 协议本身不会保存客户端的状态信息（通过 Cookie/Session 技术解决）。

---

# 2. URL (统一资源定位符)

URL 是我们平时常说的“网址”，用于定位互联网上的资源。

### URL 的结构

一个完整的 URL 示例：

![](/images/posts/http-xieyi/01.png)

| **组成部分**     | **描述**                             |
| ------------ | ---------------------------------- |
| **协议方案名**    | `http` 或 `https`                   |
| **登录信息**     | `user:pass` (认证信息，现在较少直接出现在 URL 中) |
| **服务器地址**    | `www.example.jp` (域名或 IP 地址)       |
| **服务器端口号**   | `:80` (HTTP 默认 80，HTTPS 默认 443)    |
| **带层次的文件路径** | `/dir/index.htm` (资源在服务器上的位置)      |
| **查询字符串**    | `?uid=1` (参数，以 `key=value` 形式传递)   |
| **片段标识符**    | `#ch1` (锚点，用于定位页面内的某个位置)           |

### urlencode 与 urldecode

- **原因：** URL 中某些字符具有特殊含义（如 `/`, `?`, `:`），若参数中包含这些字符，必须转义。

- **规则：** 将字符转为 16 进制，每 2 位前面加上 `%`。

- **示例：** `+` 会被转义成 `%2B`。

- **过程：** `urlencode` 是编码过程，`urldecode` 是解码过程。

---

# 3. HTTP 报文格式

HTTP 报文分为 **请求 (Request)** 和 **响应 (Response)**。

### 3.1 HTTP 请求格式
![](/images/posts/http-xieyi/02.png)

![](/images/posts/http-xieyi/03.png)
1. **首行：** `[方法] + [URL] + [版本]` (如 `GET /index.html HTTP/1.1`)

2. **Header (请求报头)：** 键值对格式，每组以 `\r\n` 分隔。

3. **空行：** 表示 Header 结束。

4. **Body (请求正文)：** 允许为空。若不为空，Header 中需有 `Content-Length`。

### 3.2 HTTP 响应格式
![](/images/posts/http-xieyi/04.png)

![](/images/posts/http-xieyi/05.png)
1. **首行：** `[版本号] + [状态码] + [状态码解释]` (如 `HTTP/1.1 200 OK`)

2. **Header (响应报头)：** 同请求格式。

3. **空行：** 表示 Header 结束。

4. **Body (响应正文)：** 包含服务端返回的数据（如 HTML 代码）。

---

# 4. HTTP 方法
![](/images/posts/http-xieyi/06.png)

| **方法**      | **说明**                                 | **常用性** |
| ----------- | -------------------------------------- | ------- |
| **GET**     | 请求获取 URL 指定的资源。参数通常附在 URL 后面。          | **极高**  |
| **POST**    | 传输实体主体，通常用于提交表单或上传数据。数据在 Body 中。       | **极高**  |
| **PUT**     | 传输文件，保存到 URL 指定位置（常用于 RESTful API 更新）。 | 一般      |
| **HEAD**    | 类似 GET，但只返回响应头，不返回正文。用于检查资源有效性。        | 一般      |
| **DELETE**  | 删除 URL 指定的资源。                          | 一般      |
| **OPTIONS** | 查询服务器对该 URL 支持的 HTTP 方法。               | 调试用     |

> **实验：** 使用 `curl -i` 可以查看响应头，使用 `curl --head` 仅获取 Header。

---

# 5. HTTP 状态码

状态码用于告知客户端请求的处理结果。

### 5.1 状态码类别

|**类别**|**范围**|**原因短语**|
|---|---|---|
|**1XX**|100-199|信息性状态码，接收的请求正在处理。|
|**2XX**|200-299|成功状态码，请求正常处理完毕。|
|**3XX**|300-399|重定向状态码，需要附加操作完成请求。|
|**4XX**|400-499|客户端错误，服务器无法处理请求。|
|**5XX**|500-599|服务器错误，服务器处理时出错。|

### 5.2 常见状态码详解

- **200 OK：** 请求成功。

- **301 Moved Permanently：** 永久重定向。配合 Header 中的 `Location` 使用，浏览器会缓存新地址。

- **302 Found：** 临时重定向。配合 `Location` 使用，后续请求仍访问旧地址。

- **403 Forbidden：** 服务器理解请求但拒绝执行（无权限）。

- **404 Not Found：** 资源不存在。

- **500 Internal Server Error：** 服务器内部崩溃。

- **502 Bad Gateway：** 代理服务器从上游获取了无效响应。

---

# 6. HTTP 常见 Header 属性

| **字段名**            | **含义**          | **样例**                            |
| ------------------ | --------------- | --------------------------------- |
| **Content-Type**   | 数据的媒体类型         | `text/html`, `application/json`   |
| **Content-Length** | Body 的字节大小      | `Content-Length: 150`             |
| **Host**           | 目标主机名和端口        | `www.example.com:8080`            |
| **User-Agent**     | 客户端的浏览器/系统信息    | `Mozilla/5.0 ...`                 |
| **Referer**        | 当前页面是从哪个页面跳转过来的 | `http://.../prev_page.html`       |
| **Location**       | 重定向的新地址         | 配合 3xx 使用                         |
| **Cookie**         | 存储在客户端的小量信息     | 用于 Session 管理                     |
| **Connection**     | 连接管理            | `keep-alive` (长连接), `close` (短连接) |

### Connection: keep-alive (长连接)

- **HTTP/1.0：** 默认短连接，每次请求都要新建 TCP 连接。如果希望在HTTP/1.0上实现持久连接，需要在请求头中显式设置 `Connection: keep-alive`。

- **HTTP/1.1：** 默认长连接，允许在同一个 TCP 连接上发送多个请求/响应，减少建立连接的开销。

**语法格式**
- `Connection: keep-alive` ：表⽰希望保持连接以复⽤TCP连接。
- `Connection: close` ：表⽰请求/响应完成后，应该关闭TCP连接。

---
