# 上线操作单（P6 预工版）

> 契约与设计：`ARCH.md` **§12**（部署架构 · 拓扑 · `server{}` 要点 · 回填清单）/ **§8.4~§8.7**（网关端点、安全限额、启动运维）。
> 自检：`pnpm verify:gateway`（51 项）/ `pnpm verify:docs`（15 项）。
>
> ## ⚠️ 先读这一段：这些东西**没有一样在真机上跑过**
>
> 发起人还没买域名/服务器（阻塞项 **B-01**），所以本目录里**每一个部署件都只经过离线验证**：
> `nginx-site.conf` **没有跑过 `nginx -t`**（开发机没装 Nginx）、`publish.mjs` **没有连过任何服务器**
> （只做了本机真实调用路径的空跑：`--help` / `--dry-run` / 安全闸门拒绝用例，见下表和 §6）、`langgraph.service` /
> `pet-gateway.service` 两个 unit **没有 `systemctl` 装过**。
> 每一项"上线时怎么验证它"写在下面的操作步骤里，也在 `reports/_p6-prep-report.md` 里有逐文件表格。
> **上线当天的第一件事永远是 `sudo nginx -t`。**

---

## 0. 本目录里有什么

| 文件 | 一句话说明 | 真机验证过吗 |
| --- | --- | --- |
| `nginx-site.conf` | **完整站点**的 `server{}`：80→443 跳转、443 站点段、静态缓存/压缩/安全头/真 404、`include` Agent 段。4 个 `__占位符__` 待填 | ❌ 没跑过 `nginx -t` |
| `nginx.conf` | **只有** `location /api/agent/ { … }` 那一段（Agent 反代的**唯一正文**，被上面那个 `include` 引进去）。v1.54 起多了 `gzip off;` | ❌ 同上 |
| `publish.mjs` | Windows → Linux 发布脚本（**Node ESM / 零依赖**：构建 → 打包 → 上传 → 原子替换 → 两端计数校验 → 回滚备份）。⚠️ **v1.55 之前它是 `publish.ps1`，而且在本机根本跑不起来** —— 见下方 T86 | ❌ 没连过服务器；✅ 本机真实调用路径跑过 `--help` / `--dry-run` / 安全闸门拒绝用例 |
| `pet-gateway.service` | 网关（`:8787`）的 systemd unit | ❌ 没 `systemctl` 装过 |
| `langgraph.service` | 后端 LangGraph Server（`:2024`）的 systemd unit —— **属于另一个仓库的服务** | ❌ 同上 |

---

## 1. ⏱️ 上线当天要填的值的完整清单

**这张表是本轮的核心产出。** 按顺序填，填完再做第 2 节的步骤。

| # | 值 | 填在哪（文件:行 / 环境变量） | 例子 | **不填会怎样** |
| --- | --- | --- | --- | --- |
| 1 | **域名**（站点根 URL） | `src/config/siteConfig.ts:53` 的 `site_url`（**源码常量，不是环境变量**，没有 `PUBLIC_SITE_URL` 这种东西） | `https://imiss.example.com` | sitemap / RSS / canonical / OG 卡片 / 分享二维码 / `robots.txt` 里的 Sitemap 行**全是占位域名 `imiss.example.com`**；分享出去扫到的二维码指向假地址。改完**必须重新构建**（§2 第 2 步） |
| 2 | **域名**（Nginx `server_name`） | `deploy/nginx-site.conf` 里的 `__DOMAIN__`（**共 2 处**：80 段与 443 段，每处写成 `__DOMAIN__ www.__DOMAIN__`） | `imiss.example.com`（**只写域名，不带 `https://`**） | 请求落到默认 server 块 —— 轻则 404，重则**串站**（同一个 IP 上别的站被打开） |
| 3 | **站点根目录** | `deploy/nginx-site.conf` 的 `__WEB_ROOT__`；同时是 `publish.mjs --web-root` 的值 | `/var/www/imiss-blog/dist` | `root` 指不到产物 → **全站 404**；两个地方不一致 → 发布到 A 目录而 Nginx 读 B 目录（症状也是全站 404） |
| 4 | **证书目录** | `deploy/nginx-site.conf` 的 `__CERT_PATH__`（**2 行**：`ssl_certificate` 与 `ssl_certificate_key`） | `/etc/letsencrypt/live/imiss.example.com` | `nginx -t` **直接报错**、reload 失败（旧配置继续跑，新配置不生效）；证书路径写成单个 `.pem` 文件也会报错 |
| 5 | **Agent 片段路径** | `deploy/nginx-site.conf` 的 `__SNIPPET_PATH__`（1 行 `include`） | `/etc/nginx/snippets/pet-gateway.conf` | `nginx -t` 报 `open() … failed`；或 Agent 全挂（`/api/agent/*` 落到静态 `try_files` → 404） |
| 6 | **`PET_ALLOWED_ORIGINS`** | `deploy/pet-gateway.service` 的 `Environment=PET_ALLOWED_ORIGINS=…`（**也可以是你自己的 `/etc/default/pet-gateway`**） | `https://imiss.example.com,http://localhost:4321,http://localhost:4323` | **生产环境带 `Origin` 的写请求一律 403**（桌宠能加载、一说话就失败）。默认值只有 `localhost:4321/4323`。改完 `systemctl restart pet-gateway`（网关**启动时读一次**环境变量） |
| 7 | **`PET_GATEWAY_TRUST_PROXY`** | `deploy/pet-gateway.service` 的 `Environment=PET_GATEWAY_TRUST_PROXY=1` | `1` | **只在真有反代时开**（见 §5 第 2 条）。反代后面**不开**它更糟：**全站访客的 IP 都变成 `127.0.0.1`，20 次/分钟** 由所有访客共享 —— 一个人刷几下，别人全部 429 |
| 8 | **`PUBLIC_AGENT_BASE_URL`** | **构建期环境变量**（不是文件）：`$env:PUBLIC_AGENT_BASE_URL="/api/agent"; pnpm build` | `/api/agent` | 前端回落到 `http://127.0.0.1:2024` —— 那是**访客自己电脑**的 2024 端口，**线上桌宠必然连不上**（控制台一堆 `ERR_CONNECTION_REFUSED`），而且绕过了网关四道闸门 |
| 9 | **Cloudflare Worker 名**（只在走 CF 时） | `wrangler.jsonc` 的 `name`（当前 `imiss-blog`）；部署用 `npx wrangler deploy` | `imiss-blog` | 走自建服务器 + Nginx（本操作单的默认路线）时**这一项可以整条忽略**；走 CF Workers 时名字冲突会被要求改，或部署到别人的 Worker 上 |
| 10 | **后端 `.env` 的密钥** | 后端仓库 `agent_-for-blog/.env`（`DEEPSEEK_API_KEY` / `LANGSMITH_API_KEY`）—— **本仓库不碰、不复制、不上传** | — | 后端起不来（`ExecStart` 直接失败）；把 `.env` 传进 web root 则是**泄密事故**（§6 严禁事项） |

> 顺手核一下：`src/config/agentConfig.ts:19` 读的就是 `PUBLIC_AGENT_BASE_URL`；
> `src/config/displaySettingsConfig.ts` 还认一个可选的 `PUBLIC_DISPLAY_SETTINGS`（不设＝保持默认）。

---

## 2. 逐步操作（从本地到线上）

### 第 1 步 · 本地：把域名填进去并构建

```powershell
# ① 改 src/config/siteConfig.ts 的 site_url 为真域名（这就是清单第 1 项）
# ② 内容自检（不通过就别构建）
pnpm verify:posts
# ③ 构建（约 165 个页面；注意 PUBLIC_AGENT_BASE_URL 是**构建期**变量）
$env:PUBLIC_AGENT_BASE_URL = "/api/agent"
pnpm build
# ④ 本地先看一眼（这一步能提前发现 90% 的低级问题）
pnpm preview            # 打开 http://localhost:4321
```

确认 `dist/` 里有：`index.html`、`404.html`、`sitemap-index.xml`、`sitemap-0.xml`、`robots.txt`、
`llms.txt`、`pagefind/`、`_astro/`。**`dist/404.html` 必须存在** —— Nginx 的 `error_page 404 /404.html;`
就指着它（本仓库实测存在，239 421 字节 ≈ 234 KiB 的完整页面）。

### 第 2 步 · 服务器：装 Nginx 与目录（**一次性**）

```bash
sudo apt update && sudo apt install -y nginx
sudo mkdir -p /var/www/imiss-blog/dist /etc/nginx/snippets
sudo chown -R "$USER":www-data /var/www/imiss-blog      # 让发布账号能写，www-data 能读
```

### 第 3 步 · 装 Agent 那一段（`include` 的目标）

```bash
# 把本仓库 deploy/nginx.conf 装到 __SNIPPET_PATH__ 那个路径
sudo cp deploy/nginx.conf /etc/nginx/snippets/pet-gateway.conf
# 别忘了把里面的占位域名换成真域名（PET_ALLOWED_ORIGINS 在 service 文件里，不在这里）
sudo grep -n "127.0.0.1:8787" /etc/nginx/snippets/pet-gateway.conf
```

### 第 4 步 · 证书（二选一）

```bash
# A. certbot（推荐，自动续期）
sudo apt install -y certbot
sudo certbot certonly --webroot -w /var/www/acme -d imiss.example.com -d www.imiss.example.com
#    → 证书目录 = /etc/letsencrypt/live/imiss.example.com  ← 这就是 __CERT_PATH__
#    ⚠️ 第一次要先把 nginx-site.conf 的 80 段装上（里面已有 /.well-known/acme-challenge/ 的 location）
# B. 已有证书：直接把 __CERT_PATH__ 填成你放 fullchain.pem / privkey.pem 的目录
sudo certbot renew --dry-run      # 续期演练（A 路线必做一次）
```

### 第 5 步 · 装站点配置 + `nginx -t`（**上线当天的第一件正事**）

```bash
sudo cp deploy/nginx-site.conf /etc/nginx/conf.d/imiss-blog.conf
sudo vi /etc/nginx/conf.d/imiss-blog.conf        # 填 __DOMAIN__ / __CERT_PATH__ / __WEB_ROOT__ / __SNIPPET_PATH__
grep -nE '__[A-Z_]+__' /etc/nginx/conf.d/imiss-blog.conf   # ← 必须**没有任何输出**（还有占位符就回去填）
sudo nginx -t                                     # ← 必须 0 错误；这一条本仓库**没跑过**，报错就按 §5 排查
sudo systemctl reload nginx
```

### 第 6 步 · 发布静态产物

```powershell
# 先空跑一遍，看清楚它要执行哪几条命令（不会连服务器、不会写任何东西）
node deploy/publish.mjs --server blog@<服务器IP> --web-root /var/www/imiss-blog/dist --dry-run

# 真发（增量：只传变化的文件；远端会留 2 份回滚备份）
node deploy/publish.mjs --server blog@<服务器IP> --web-root /var/www/imiss-blog/dist
# 需要整包重传时加 --full-upload；已经构建好了不想再构建加 --skip-build
# 全部参数：node deploy/publish.mjs --help
```

它会打印本地/远端的**文件数与总字节**，两者应当一致（不一致会在最后一行 `⚠️` 提示）。
纯静态覆盖**不需要 reload Nginx**；只有改了 Nginx 配置才需要。

> ⚠️ **脚本形态在 v1.55 变过**：v1.54 交付的是 `deploy/publish.ps1`，而它在**本机真实调用路径**下
> 直接语法崩（PowerShell 5.1 按系统 ANSI/GBK 读无 BOM 的 `.ps1`，中文注释把字节流顶错位 →
> 40 条语法错误）。现已改写成 `deploy/publish.mjs`（Node ≥ 22，读源码一律 UTF-8），`.ps1` 已删除。
> 完整取证与"为什么检查方式也会骗人"见 `ARCH.md` §14.3 **T86**。
> 如果你手上还留着旧的 `publish.ps1` 命令行，把 `-Server X -WebRoot Y -DryRun` 依次换成
> `--server X --web-root Y --dry-run` 即可（其余开关同名 kebab-case：`-SkipBuild` → `--skip-build`、
> `-FullUpload` → `--full-upload`、`-KeyFile` → `--key-file`、`-Port` → `--port`、`-KeepReleases` → `--keep-releases`）。
> 退出码：**0 = 成功 / 1 = 执行中失败 / 2 = 参数或安全闸门拒绝执行**。

### 第 7 步 · 两个 systemd unit

```bash
# 后端（另一个仓库的服务）：先按 §0 表里第 10 项把 .env 放好
sudo cp deploy/langgraph.service /etc/systemd/system/
sudo vi /etc/systemd/system/langgraph.service     # 改 4 处 ★：WorkingDirectory / ExecStart / User / EnvironmentFile
# 网关
sudo cp deploy/pet-gateway.service /etc/systemd/system/
sudo vi /etc/systemd/system/pet-gateway.service   # 改 WorkingDirectory / User / PET_ALLOWED_ORIGINS

sudo systemctl daemon-reload
sudo systemctl enable --now langgraph              # ★ 顺序：先后端
sudo systemctl enable --now pet-gateway            # ★ 再网关（反了也能起，见下）
systemctl status langgraph pet-gateway --no-pager
```

**启动顺序**：先 `langgraph`（:2024）再 `pet-gateway`（:8787）。反过来**也能起** —— 网关不探活上游，
上游不可达时按请求回 502 `upstream_unreachable`，后端起来后**自动恢复**（ARCH §8.7）。
两个 unit **没有**互相写 `After=`（避免制造"必须成对重启"的假依赖）；重启顺序按上面这份文档执行即可。

```bash
journalctl -u langgraph -f          # 后端日志
journalctl -u pet-gateway -f        # 网关日志（一行一请求；不含提问正文，排障时也别加）
```

### 第 8 步 · 冒烟检查（把 `<域名>` 换成真域名，逐条对期望值）

```bash
# ① 首页 200 + HTTPS
curl -sSI https://<域名>/ | head -1                       # 期望：HTTP/2 200
# ② HTTP 跳 HTTPS
curl -sSI http://<域名>/ | head -1                        # 期望：HTTP/1.1 301（Location: https://…）
# ③ 目录式路由（trailingSlash: always 的产物形态）
curl -sS -o /dev/null -w '%{http_code}\n' https://<域名>/roadmap/          # 期望：200
# ④ 已删除的旧地址：真 404（**不是** 301，也不是首页）
curl -sS -o /dev/null -w '%{http_code}\n' https://<域名>/rank/             # 期望：404
curl -sS -o /dev/null -w '%{http_code}\n' https://<域名>/rank/jp/          # 期望：404
# ⑤ 已关闭页面：真 404（产物里还有 noindex 存根，靠 Nginx 掐掉）
curl -sS -o /dev/null -w '%{http_code}\n' https://<域名>/bilibili/         # 期望：404
curl -sS -o /dev/null -w '%{http_code}\n' https://<域名>/friends/          # 期望：404
# ⑥ 404 页确实是自己的 404 页（不是 nginx 默认页）
curl -sS https://<域名>/nonexistent-xyz/ | grep -o '<title>[^<]*</title>'   # 期望：站点自己的 404 标题
# ⑦ 网关活着（网关自己的探针）
curl -fsS https://<域名>/__gw/health | head -3            # 期望：JSON（生效的 PET_* 配置，非密）
# ⑧ 上游活着（**这条通＝后端 + 网关 + 反代三段全通**）
curl -sS -o /dev/null -w '%{http_code}\n' https://<域名>/api/agent/ok      # 期望：200  {"ok":true}
# ⑨ SSE 不缓冲 —— 肉眼验法：首块必须在**几百毫秒**内出来
curl -sS -N -X POST https://<域名>/api/agent/threads/<thread_id>/runs/stream \
     -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
     -d '{"assistant_id":"blog_agent","input":{"messages":[{"role":"user","content":"在吗"}]}}' \
     | while IFS= read -r line; do printf '%s  %s\n' "$(date +%T.%3N)" "$line"; done | head -5
#    ✅ 第一行的时刻 ≈ 请求发出后 0.x~2 秒内，之后每块陆续到达（有时间差）
#    ❌ 卡住几十秒、最后**一次性**把全部内容打印出来 = 有人在缓冲（见 §5 第 3 条）
# ⑩ 压缩：CSS/JS 应当是 gzip，SSE 那条**绝不能**是 gzip
curl -sSI -H 'Accept-Encoding: gzip' https://<域名>/_astro/<某个css> | grep -i content-encoding   # 期望：content-encoding: gzip
# ⑪ 缓存头
curl -sSI https://<域名>/_astro/<某个js> | grep -i cache-control     # 期望：public, max-age=31536000, immutable
curl -sSI https://<域名>/ | grep -i cache-control                    # 期望：no-cache（**不是**不缓存：改版后立刻生效）
# ⑫ sitemap / robots / llms.txt
curl -sS https://<域名>/sitemap-index.xml | head -3        # 期望：真域名，且**不含** /friends/ 等关闭页
curl -sS https://<域名>/robots.txt                         # 期望：Sitemap: https://<真域名>/sitemap-index.xml
# ⑬ 搜索能用（Pagefind）：浏览器打开首页 → 点搜索 → 搜一个只有你文章里才有的词 → 有结果
#    命令行旁证：curl -sS -o /dev/null -w '%{http_code}\n' https://<域名>/pagefind/pagefind.js   # 期望：200
# ⑭ 页脚无上游字样（R-ID-10 的线上口径；把 <上游主题名> 换成那个名字来查）
curl -sS https://<域名>/ | grep -ci '<上游主题名>'         # 期望：0
```

---

## 3. 回滚（改动出问题时的退路）

**上一版在哪**：每次 `publish.mjs` 发布前，服务器上的旧目录会被改名成
`<WebRoot>.releases/<时间戳>/`，默认**保留 2 份**（`--keep-releases N` 可调，0 = 不留）。
本次发布若解包后缺 `index.html`，脚本会**在改动线上目录之前**中止（线上不动）。

```bash
# ① 看有哪些版本
ls -1dt /var/www/imiss-blog/dist.releases/*/

# ② 回滚到上一版（把当前这版先挪走，再把备份挪回来 —— 两条都是 mv，毫秒级）
cd /var/www/imiss-blog
mv dist "dist.broken.$(date +%Y%m%d-%H%M%S)"
mv "dist.releases/20260930-154510" dist
# ③ 验一下
curl -sS -o /dev/null -w '%{http_code}\n' https://<域名>/            # 期望 200
```

**只回滚内容、不回滚 Nginx**：`dist/` 换掉就生效，**不用 reload**（纯静态）。
如果你改过 `nginx-site.conf` 并且新配置有问题：`sudo nginx -t` 会拦住你；
真 reload 之后才发现问题，就 `sudo cp /etc/nginx/conf.d/imiss-blog.conf.bak …` 再 `nginx -t && systemctl reload nginx`。

**紧急止血**（连回滚都来不及，只想先让人看到东西）：

```bash
sudo systemctl stop pet-gateway        # 桌宠会退化成前端本地 mock（不会报错，ARCH §8.6）
# 或者直接让整站下来：
# sudo systemctl stop nginx
```

---

## 4. 常见故障 → 症状 → 处置

| # | 故障 | 症状（怎么认出来） | 处置 |
| --- | --- | --- | --- |
| 1 | **`403 origin_not_allowed`** | 页面正常、桌宠能弹出，但**一发消息就失败**；`journalctl -u pet-gateway` 上有 403 | 线上域名没进 `PET_ALLOWED_ORIGINS`（清单第 6 项）。改 `pet-gateway.service` 的 `Environment=` → `systemctl daemon-reload && systemctl restart pet-gateway`。核对：`curl -sS -H 'Origin: https://<域名>' -o /dev/null -w '%{http_code}\n' https://<域名>/api/agent/ok` 应为 200；换个不在名单的 Origin 应回 **403** |
| 2 | **`502 upstream_unreachable`** | `/api/agent/ok` 回 **502**，JSON 里是 `{"error":"upstream_unreachable"}`（不回显栈）；`/__gw/health` 仍 200 | 网关活着、**后端没起来**。`systemctl status langgraph`；`curl -fsS http://127.0.0.1:2024/ok`；看 `journalctl -u langgraph -n 50`（最常见：`.env` 缺 `DEEPSEEK_API_KEY`、venv 路径不对、端口被占） |
| 3 | **SSE 卡住不吐字** | 提问后**长时间一个字都不出**，最后一次性全出来（或 300 秒后被掐） | 三层各查一遍：① **Nginx**：`/api/agent/` 那段必须有 `proxy_buffering off;` **和** `gzip off;`（后者是 v1.54 补的 —— 全局 `gzip on` 会攒着不发）；② **网关**：`/__gw/health` 看 `trustProxy` 等生效值，确认没被中间层（CDN/Cloudflare）缓冲 —— CF 要关掉该路径的压缩与缓存；③ **上游**：`curl -N` 直连 `127.0.0.1:2024` 复现。用第 8 步第 ⑨ 条的**带时间戳**命令来定性 |
| 4 | **静态 404 全变首页** | 随便一个不存在的地址都回 **200 + 首页内容**（爬虫会收录一堆首页副本） | `try_files` 被写成了 SPA 回退（`… /index.html`）。正确写法**只有** `try_files $uri $uri/index.html =404;`（`$uri/` 会退化成 403，也别加）。改完 `nginx -t && systemctl reload nginx`；验：`curl -sS -o /dev/null -w '%{http_code}\n' https://<域名>/definitely-not-here/` 必须是 **404** |
| 5 | **证书过期 / `nginx -t` 报错** | 浏览器 `NET::ERR_CERT_DATE_INVALID`；或 `nginx -t` 直接红字（`cannot load certificate` / `unknown directive`） | `sudo certbot renew`（A 路线）→ `nginx -t` → `reload`；检查 `__CERT_PATH__` 是否指到 `live/<域名>/` 目录、是否漏了 `fullchain.pem`。`unknown directive "http2"` ＝ nginx < 1.25.1，把 `listen 443 ssl http2;` 换成 `listen 443 ssl;`；`unknown directive "brotli"` ＝ 没编 brotli 模块（本配置**没开** brotli，开了就删掉） |
| 6 | **429 特别频繁** | 正常访问也频繁 `429 too_many_requests` | 反代后面**没开** `PET_GATEWAY_TRUST_PROXY=1` → 全站访客共用 `127.0.0.1` 那一个桶（清单第 7 项）。开了之后仍频繁，就调 `PET_GATEWAY_RATE_LIMIT`（默认 20 次/分/IP） |
| 7 | **页面样式全丢 / 图片 404** | HTML 出来了但没有 CSS、图全是裂的 | 多半是 `__WEB_ROOT__` 指错（指到了 `dist` 的上一层或下一层）。`ls <WEB_ROOT>/_astro | head` 应有文件；也检查发布脚本报的"本地/远端计数不一致"警告 |
| 8 | **旧笔记里的 `./deploy/publish.ps1 …` 一敲就报一串语法错**（报错行里的中文还是乱码，例如 `涓婁紶锛氬帇缂╁寘`） | `The '<' operator is reserved for future use` / `Missing file specification after redirection operator`，位置在 `:181` 附近 | **那是 v1.54 的旧脚本，v1.55 已删除** —— 不是你的参数写错了。原因：Windows PowerShell 5.1 按系统 ANSI/GBK 读**无 BOM** 的 `.ps1`，满篇中文注释把字节流顶错位（实测 52 个换行、41 个双引号被吞），`<<'EOF'` 因此落到字符串外被判成重定向 → 40 条语法错误。**改用 `node deploy/publish.mjs --server … --web-root …`**，参数名对照见 §2 第 6 步末尾那段；完整分析见 `ARCH.md` §14.3 **T86**。⚠️ **v1.56 起**那条「这条路上没有任何机器闸门」的缺口已经补上：`pnpm verify:docs` 第 11 项（文件编码）改成**按内容判文本**，`.ps1` / `.sh` / `.conf` / `.service` 与无扩展名文件都在扫描面内 |

---

## 5. 两个容易搞反的开关（务必读一遍）

1. **`PET_ALLOWED_ORIGINS`**：网关做的是**来源白名单**（浏览器发 POST 会带 `Origin: https://<域名>`，
   不在名单里一律 403，且预检**永不回 `*`**）。它是"防别的网站拿访客浏览器刷你的 token"，
   不是"防访客" —— 所以**每个线上域名（含 www 与否）都要列全**。
2. **`PET_GATEWAY_TRUST_PROXY`**：只有**真的在反代后面**才置 `1`。
   - 有反代却不开 → 所有请求的 IP 都被看成 `127.0.0.1`，**限流退化成全站共享 20 次/分钟**；
   - 没有反代却开了 → 访客可以自己伪造 `X-Forwarded-For` **绕开限流**。
   本操作单的拓扑（Nginx → 网关）属于前者，所以 `pet-gateway.service` 里默认写了 `=1`。

---

## 6. 严禁事项（每一条都有真实代价）

1. **不要把 `.env` / 密钥 / `.pem` 私钥上传进 web root**。`publish.mjs` 只发 `dist/`，
   而 `dist/` 里不存在这些文件；手工 `scp` 时尤其注意。**第二道闸**是 `nginx-site.conf` 里那条
   `location ~ /\.(?!well-known/) { return 404; }`（`.env`、`.git` 一律不可访问）—— 但别指望它兜底。
2. **不要 `chmod -R 777`**。静态目录的标准权限：目录 `755`、文件 `644`、属主"发布账号"、组 `www-data`。
   777 意味着同机任何账号都能改你的页面（挂马）。
3. **不要把 `reports/`、`src/`、`node_modules/`、`deploy/` 放进 web root**。线上只需要 `dist/` 的内容；
   放源码等于把"哪篇文章引用了哪些图、有哪些待办、有哪些坑"全部公开。
4. **不要在 web root 里手工改文件**。下次发布时 `publish.mjs` 会把它当"远端多余文件"删掉
   （在允许删除的前缀内）——或者更糟：它留在那里但没人知道它从哪来。
5. **不要把 `PUBLIC_AGENT_BASE_URL` 指向 `127.0.0.1:2024`**。那是**访客的**回环地址，
   而且会绕过网关的四道闸门（白名单/限流/体积/长度）。
6. **不要在没有反代的情况下把 `langgraph` 暴露到公网**。`langgraph dev` 官方定位是"受信任环境使用"；
   本操作单里它只绑 `127.0.0.1`，公网入口只有 Nginx。

---

## 7. 运维备忘

- **改配置要重启**：网关**启动时读一次** `PET_*`（`readConfig()`），后端同理（`.env` 与人设文件也是启动期加载）
  —— **改完没重启 = 行为还是旧的**（ARCH §8.7 / §8.9.4）。
- **线程记忆是内存态**：后端进程一重启（含 `MemoryMax` 触发重启），已有会话上下文清空
  （ARCH §8.9.7 #4 已登记，属已知取舍）。
- **日志**：`journalctl -u pet-gateway -f` 一行一请求，**授权范围只有** 时间/方法/路径/状态/耗时/IP/thread id；
  排障时**不要**临时把请求体打进日志（`verify:gateway` 的「日志不泄漏」会红，见 ARCH §14.3 T82）。
- **本仓库的门禁**：改了 `server/` 或 `deploy/` 之后跑 `pnpm verify:gateway`（51 项）；
  改了三份文档之后跑 `pnpm verify:docs`（15 项）。

---

## 8. 真机部署实况（2026-10-12 首次上线 —— 上面那些"❌ 没跑过"从这一天起作废）

> 这一节是**事实记录**：本操作单的模板第一次落到真机上，实际填了什么值、踩了哪些坑。
> 上线阶段：**域名 `imissblog.cn` 还在实名审核 → 先用公网 IP**，HTTPS 那一半等域名过审再做。

| 项 | 实际值 |
| --- | --- |
| 服务器 | 腾讯云轻量应用服务器 · **首尔** · Ubuntu 26.04 LTS / 2 核 / 3.7 GB / 60 GB SSD |
| 公网 IP | **`43.133.230.71`**（域名过审前用它访问，如 <http://43.133.230.71/>） |
| 登录用户 | **`kiana`**（原来的 `ubuntu` 已改名；`PermitRootLogin yes` + 部署公钥，root 也留了钥匙做后路） |
| 登录方式 | 密钥：`reports/_ops/imiss_deploy`（本机私钥，**不进仓库**；`reports/` 已 gitignore） |
| `__WEB_ROOT__` | `/var/www/imiss-blog/dist`（归属 `kiana:www-data`、组读 + setgid） |
| `__SNIPPET_PATH__` | `/etc/nginx/snippets/pet-gateway.conf`（正文 = 本仓库 `deploy/nginx.conf`） |
| 站点配置 | **IP 阶段版**：`/etc/nginx/sites-available/imiss-blog.conf`（只监听 80、`server_name _`，其余逐条同完整版）；域名过审后换成 `deploy/nginx-site.conf` 填好占位的完整版 |
| `__CERT_PATH__` | 待域名：`/etc/letsencrypt/live/imissblog.cn`（`/.well-known/acme-challenge/` 出口已留，`root /var/www/acme`） |
| 后端 | `/home/kiana/agent`（Gitee clone）+ `uv` 建的 `.venv`（**Python 3.12**，按本机 `pip freeze` 的 113 包精确对齐）+ `.env`（`DB_HOST=127.0.0.1`） |
| 数据库 | 本机 MySQL 8.4.11：库 `my_blog`、用户 `kiana_mysql`（**库名/用户/密码与原来一致**）；已从 `106.52.158.48` 迁入并**逐项对账**（两表各 138 行、视图/外键/全文索引/3 个触发器齐全、两侧 MD5 指纹一致） |
| systemd | `langgraph.service`（:2024，User=kiana，**去掉了模板里的 `ProtectHome=true`** —— 服务在 `/home` 下）+ `pet-gateway.service`（:8787，User=www-data，`/opt/imiss-gateway/pet-gateway.mjs`，`PET_ALLOWED_ORIGINS` 先填 IP、`TRUST_PROXY=1`） |
| 发布命令 | `node deploy/publish.mjs --server kiana@43.133.230.71 --key-file reports/_ops/imiss_deploy --web-root /var/www/imiss-blog/dist --stage-root /home/kiana/.imiss-publish`（首次整包 1079 文件 / 445,024,548 字节 / **92.7 秒**；之后是增量） |
| 上线冒烟 | `node reports/_ops/50-smoke.mjs https://imissblog.cn` → **14/14 通过**（首页 200 / 目录路由 / 真 404 / 掐存根 / 隐藏文件 / 缓存头 / 大素材逐字节 / 搜索索引 / sitemap·robots·llms / **绝对地址 = 真域名** / 同源 `/api/agent` / 三段链路 / 桌宠 SSE 首块 718 ms）；`http://` 那条 **301 → https**。IP 阶段那次的 14/14 用的是 `http://43.133.230.71` |

**首次上真机踩到的坑（都记进 PROJECT_STATUS v1.112，这里只列要点）**：

1. **改名要先收掉 `systemd --user`**：`usermod -l/-m` 被 user manager 挡住 → `loginctl terminate-user <旧名>` 后再改。
   ⚠️ 顺序上**先改 sudoers 再改名**会让旧名在那几十秒里失去免密 sudo —— **务必提前给 root 装公钥**（本项目就是这么兜住的）。
2. **`.env` 的键名大小写**：`.env` 里写 `DeepSeek_API_KEY`，Windows 环境变量名大小写不敏感、**Linux 敏感**，
   而代码读全大写 → 服务器版必须补 `DEEPSEEK_API_KEY`（或直接改 .env）。
3. **Python 版本要用 uv 拉 3.12**：系统自带 3.14，依赖轮子未必齐；`uv sync` 还会因 `requires-python` 做通用解析而失败
   → **按本机 `pip freeze` 的清单 `uv pip install -r`**，再 `uv pip install -e . --no-deps`（版本对照 15 项 0 不一致）。
4. **触发器要用 root 建**：binlog 开启时应用用户没有 SUPER（`ERROR 1419`）。
5. **web root 权限**：发布用户要能写、Nginx（www-data）要能读 → `chown kiana:www-data` + `chmod -R g+rX` + 目录 `g+s`。

**域名切换（2026-10-12 完成，v1.113）**：`imissblog.cn` 实名通过后，发起人在 DNSPod 加了
`@` 与 `www` 两条 A → `43.133.230.71`；随后用**一键脚本** `~/70-switch-to-domain.sh` 完成切换
（DNS 前置检查 → `certbot certonly --webroot` → 填占位符装 HTTPS 配置 → 停用 IP 阶段配置并启用 → 网关加 origin → 续期演练），
证书在 `/etc/letsencrypt/live/imissblog.cn/`（到期 2027-01-10，timer 自动续期），站点重建后重发、
`site_url` 已是 `https://imissblog.cn`。

> ⚠️ **上真机时最容易漏的一步：控制台防火墙要放行 443**。本案就是被它卡住的 ——
> 现象是"本机 `nginx -t`/回环 https 都 200，但公网怎么都连不上"，且**服务器自己从公网打自己的 443 也超时**，
> 而系统 iptables 里没有任何拦 443 的规则。判据三段：`ss -lntp | grep :443` 有 LISTEN、`curl --resolve … 127.0.0.1` 得 200、
> `curl --resolve … <公网IP>` 超时 → **只可能是上游防火墙**。处置：控制台 → 轻量应用服务器 → 该实例 → **防火墙** → 加 TCP 443 允许（来源 `0.0.0.0/0`）。
> **顺序建议**：先放行 443，再切 Nginx 配置 —— 否则会出现"80 已 301 跳到 https、而 https 又连不上"的**短暂不可访问**窗口。
>
> ⚠️ **实战补充（2026-10-12 真的踩了）**：那次为了避开上面这个"不可访问窗口"，把 Nginx **整份切回**了 IP 阶段的 80 直服配置 ——
> **但那份没有 443 段**，于是 nginx 干脆不监听 443 了。发起人随后放行防火墙、反馈"还是打不开"，
> 排查半天才发现**根因是没人在听 443，而不是防火墙没生效**。
> **两条教训**：① "等 443 放行"期间**不要撤掉 443 的监听**；真要保可用性，就让 **80 直接服务站点、同时保留 443 段**（`server_name _` 的 80 段 + 域名 443 段可以共存），而不是整份换掉。
> ② 判断"是不是防火墙"之前，先看**服务器自己**：`ss -lntp | grep :443` 必须有 LISTEN、`curl --resolve 域名:443:127.0.0.1 https://域名/` 必须 200 —— 这两条不过，就别去怪防火墙。

**域名过审后要做的三件事**（届时按 §2 第 1/4/5 步走）：① `site_url` → `https://imissblog.cn` 并**重建**；
② `certbot certonly --webroot -w /var/www/acme -d imissblog.cn -d www.imissblog.cn`；
③ 换成完整版 `deploy/nginx-site.conf`（填 `__DOMAIN__` / `__CERT_PATH__`）→ `nginx -t` → reload；
另把 `PET_ALLOWED_ORIGINS` 加上 `https://imissblog.cn` 并 `systemctl restart pet-gateway`。
（以上三步 2026-10-12 已全部完成 ✅ —— 保留这段是为了将来换域名时照做。）
