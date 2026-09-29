# 桌宠 Agent 网关（P5-5）——部署三件事
> 契约与设计：`ARCH.md` §8.4（端点与白名单）/ §8.5（安全与限额）/ §8.7（启动与运维）。
> 自检：`pnpm verify:gateway`（51 项；自带 stub 上游 + 真后端一段，退出码 0 才算绿）。

## 1. 起网关（零依赖，不需要 npm install）

```bash
node server/pet-gateway.mjs            # 127.0.0.1:8787，前台跑；Ctrl+C 停
node server/pet-gateway.mjs --help     # 看全部环境变量与路由白名单
systemctl start pet-gateway            # 常驻：把 deploy/pet-gateway.service 装到 /etc/systemd/system/
```

## 2. 环境变量（默认值即生产口径；生效值看 `curl -s 127.0.0.1:8787/__gw/health`）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PET_GATEWAY_PORT` | `8787` | 监听端口 |
| `PET_GATEWAY_UPSTREAM` | `http://127.0.0.1:2024` | 上游 LangGraph Server |
| `PET_ALLOWED_ORIGINS` | `http://localhost:4321,http://localhost:4323` | **上线必须把站点域名加进去**（浏览器 POST 会带 `Origin`，不在名单里一律 403） |
| `PET_GATEWAY_RATE_LIMIT` | `20` | 次/分钟/IP（内存令牌桶，单进程） |
| `PET_GATEWAY_MAX_BODY` | `8192` | 请求体上限（字节），超了 413 |
| `PET_GATEWAY_MAX_CHARS` | `1000` | 流式端点用户消息上限（**码点**），超了 400（前端输入框的 500 是体验口径，宽松方向正确） |
| `PET_GATEWAY_ROUND_TIMEOUT_MS` | `300000` | 单轮硬上限；流已开始就干净收尾，没开始就 504 |
| `PET_GATEWAY_TRUST_PROXY` | `0` | **只有在 Nginx 后面才置 `1`**（否则访客可伪造 `X-Forwarded-For` 绕开限流） |

## 3. 构建前端时指到同源路径

```bash
PUBLIC_AGENT_BASE_URL=/api/agent pnpm build     # PowerShell: $env:PUBLIC_AGENT_BASE_URL="/api/agent"; pnpm build
```

① Nginx 用 `deploy/nginx.conf` 那段把 `/api/agent/` 转到 `127.0.0.1:8787`；② 不设这个变量就会回落到 `http://127.0.0.1:2024`（只有本机开发才成立）。
