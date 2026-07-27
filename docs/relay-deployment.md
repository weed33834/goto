# Goto Relay 自托管部署指南

本文档说明如何把 Goto Relay 中继服务部署到自己的服务器上。Relay 是一个无状态
的 Node.js 服务，负责设备配对、令牌签发和 WebSocket 帧转发；它不接触任何用户数据，
所有同步数据都是端到端加密的，relay 只看到密文。

> 如果你只是本地调试，跳到 [本地开发](#本地开发) 一节即可，不需要 TLS 和反代。

---

## 1. 架构与端口

```
客户端 ──(wss://relay.example.com/sync)──> Nginx :443 ──> relay:8787
              │
              └─ HTTP API 也在 443 上走反代
                 POST /register-device /pairing-codes /claim-pairing-code /refresh-token
```

| 端口 | 协议 | 用途 |
|------|------|------|
| 8787 | HTTP + WS | relay 容器内部监听端口，不直接对外 |
| 80   | HTTP | ACME http-01 挑战 + 强制跳转到 443 |
| 443  | HTTPS + WSS | 对外唯一入口 |

relay 内部不处理 TLS，TLS 由前端的 Nginx 终止。这样 relay 镜像本身保持简单，
证书轮换也不需要重启 relay。

---

## 2. 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8787` | relay 监听端口。容器内一般不改。 |
| `HOST` | `0.0.0.0` | 监听网卡。容器内固定 `0.0.0.0`。 |
| `PUBLIC_WS_URL` | `ws://localhost:8787/sync` | **客户端实际连接的 WebSocket 地址**。这是最关键的配置——它会被写进 `/register-device` 的响应里，客户端拿到后用它建立 WebSocket 连接。走反代时必须改成 `wss://relay.example.com/sync`。 |
| `NODE_ENV` | `production` | 生产环境关闭测试用的限流跳过和详细错误信息。 |

> `PUBLIC_WS_URL` 和实际监听地址可以不一致：监听在容器 8787，但对外是
> `wss://relay.example.com/sync`。relay 不校验这个地址，只透传给客户端。

---

## 3. 前置准备

### 3.1 域名与 DNS

准备一个域名（例如 `relay.example.com`），A 记录指向你的服务器公网 IP。

### 3.2 服务器

- Docker 20+ 和 docker compose v2
- 开放 80 和 443 端口（TCP）
- 至少 512MB 内存（relay 很轻量）

### 3.3 TLS 证书

二选一：

**方案 A：Let's Encrypt（推荐，免费）**

用 acme.sh 或 certbot 申请。下面以 acme.sh webroot 模式为例：

```bash
# 在宿主机上（不在容器内）
mkdir -p relay/deploy/acme relay/deploy/certs

# 安装 acme.sh 后
acme.sh --issue -d relay.example.com -w $(pwd)/relay/deploy/acme

# 安装证书到 deploy/certs，并设置自动 reload nginx
acme.sh --install-cert -d relay.example.com \
  --key-file       $(pwd)/relay/deploy/certs/privkey.pem \
  --fullchain-file $(pwd)/relay/deploy/certs/fullchain.pem \
  --reloadcmd      "docker compose -f relay/docker-compose.yml --profile tls restart nginx"
```

**方案 B：自签证书（仅内网测试）**

```bash
mkdir -p relay/deploy/certs
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout relay/deploy/certs/privkey.pem \
  -out    relay/deploy/certs/fullchain.pem \
  -subj "/CN=relay.example.com"
```

客户端默认会校验证书。自签证书需要在客户端配置里关闭校验或导入 CA，**仅限测试**。

---

## 4. 生产部署（带 TLS）

### 4.1 编辑 Nginx 配置

打开 [relay/deploy/nginx/relay.conf](../relay/deploy/nginx/relay.conf)，把
`relay.example.com` 全部替换成你的真实域名。

### 4.2 启动

在仓库根目录：

```bash
export PUBLIC_WS_URL=wss://relay.example.com/sync
docker compose -f relay/docker-compose.yml --profile tls up -d --build
```

`--profile tls` 会同时拉起 relay 和 nginx 两个容器；不加这个 profile 只起 relay。

> **防火墙**：relay 容器始终把 8787 映射到宿主机。走 tls profile 时，建议在防火墙
> 上屏蔽 8787 的公网访问，只放行 80/443，强制流量走 TLS：
> ```bash
> # 示例（ufw）
> ufw allow 80/tcp
> ufw allow 443/tcp
> ufw deny 8787/tcp
> ```

### 4.3 验证

```bash
# 健康检查
curl https://relay.example.com/health
# 期望：{"ok":true}

# WebSocket 升级（用 websocat 或 wscat）
wscat -c wss://relay.example.com/sync
```

### 4.4 查看日志

```bash
docker compose -f relay/docker-compose.yml logs -f relay
docker compose -f relay/docker-compose.yml logs -f nginx
```

---

## 5. 内网 / 本地部署（不带 TLS）

适合局域网内测试或内网生产环境：

```bash
# 只起 relay，直接暴露 8787
docker compose -f relay/docker-compose.yml up -d --build

# 验证
curl http://localhost:8787/health
```

此时 `PUBLIC_WS_URL` 默认是 `ws://localhost:8787/sync`。如果你要让局域网内其他机器
连进来，改成 `ws://<服务器内网IP>:8787/sync`：

```bash
PUBLIC_WS_URL=ws://192.168.1.10:8787/sync \
  docker compose -f relay/docker-compose.yml up -d --build
```

---

## 6. 本地开发

不用 Docker，直接跑源码：

```bash
cd relay
npm install
npm run build
npm start
# 或者开发模式：npm run build && node dist/index.js
```

默认监听 `0.0.0.0:8787`，`PUBLIC_WS_URL` 是 `ws://localhost:8787/sync`。

测试：

```bash
npm test
```

---

## 7. 资源限制与容量规划

relay 是 store-and-forward 模式，离线设备的消息会在内存里暂存。当前上限：

| 维度 | 上限 | 触发后行为 |
|------|------|-----------|
| 单个设备队列 TTL | 7 天 | 超时帧被后台清理任务删除（每 60s 扫一次） |
| 单个设备最大帧数 | 10000 | 入队时丢弃最旧的帧，保留最新的（滑窗淘汰） |
| 单个设备最大字节数 | 64 MB | 同上，按字节维度淘汰最旧帧 |
| 单帧最大体积 | 8 MB | 超大帧直接关闭连接（close code 1009） |

> 这些常量定义在 [relay/src/store.ts](../relay/src/store.ts) 和
> [relay/src/wsRelay.ts](../relay/src/wsRelay.ts)。

**容量估算**：假设每台设备平均每天产生 100 个同步帧，单帧 2KB，则 7 天 TTL 内单设备
约占 14MB / 700 帧，远低于上限。一台 1GB 内存的服务器轻松支撑几百台活跃设备。

如果需要调大上限，修改 `store.ts` 里的常量后重新构建镜像即可。relay 本身无状态，
重启不丢数据（数据在内存里，所以重启**会**丢未投递的帧——这是有意为之，避免持久化
密文的复杂性）。

---

## 8. 升级

```bash
git pull
docker compose -f relay/docker-compose.yml --profile tls up -d --build
```

`--build` 会重新构建镜像。relay 容器重启很快（几秒），WebSocket 连接会断开，
客户端会自动重连并通过 outbox 补发未投递的帧。

---

## 9. 监控

目前 relay 不内置 metrics 端点。推荐方案：

- **进程存活**：docker compose 的 healthcheck（已配置，每 30s 探测 `/health`）
- **日志聚合**：把 `docker compose logs` 接到你的日志系统
- **基础指标**：在 Nginx 前面挂 prometheus/nginx-exporter，监控连接数和请求量

如果你需要 relay 原生 metrics，可以在 [relay/src/server.ts](../relay/src/server.ts)
里加一个 `/metrics` 路由，导出当前活跃连接数和队列深度。

---

## 10. 安全注意事项

1. **不要把 8787 直接暴露到公网**。永远走 Nginx + TLS。
2. **证书私钥权限**：`deploy/certs/privkey.pem` 在宿主机上设为 `600`，只让 docker
   daemon 读到。
3. **限流**：relay 已对 `/register-device`、`/pairing-codes`、`/claim-pairing-code`
   配置了 express-rate-limit（生产环境生效，测试环境跳过）。如果遇到暴力配对，
   可以在 Nginx 层再加一道 `limit_req`。
4. **客户端证书校验**：relay 验证设备签名用的是 Ed25519，签名消息里带时间戳，
   60 秒外拒绝。客户端时钟偏差过大会配对失败。
5. **数据隐私**：relay 只看到加密帧，无法解密任何用户数据。即便 relay 被攻破，
   攻击者也只能拿到密文和元数据（设备 ID、帧大小、时间戳）。

---

## 11. 故障排查

| 现象 | 排查方向 |
|------|---------|
| `curl /health` 404 | Nginx 没配 `location = /health`，或 relay 没起来。先 `docker compose logs relay` 看 relay 是否监听成功。 |
| WebSocket 连不上 | 检查 `PUBLIC_WS_URL` 协议：走 443 必须是 `wss://`，不是 `ws://`。Nginx 的 `location /sync` 必须有 `proxy_http_version 1.1` 和 Upgrade 头。 |
| 配对码失败 | 看响应里的 `error` 字段。常见：时钟偏差 > 60s、签名错误、码已过期（5 分钟 TTL）。 |
| 连接频繁断开重连 | Nginx 的 `proxy_read_timeout` 太短。已配 3600s，若你自定义了配置记得调大。 |
| 内存持续增长 | 某台设备长期离线，队列堆积到上限前不会被清理。可以临时重启 relay 清空内存（会丢未投递帧）。 |
