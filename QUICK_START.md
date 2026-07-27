# 快速上手

Goto 现在是一个**纯浏览器 Web 应用**（`desktop/` 目录，Vite + React 18 +
Zustand 4），本地数据落 IndexedDB，保险库用 Web Crypto（argon2id）加密。可选的后端
（FastAPI）与自托管 relay 用于跨设备同步。

## Web 应用（最快）

```bash
cd desktop
npm install
npm run dev
```

打开它打印的地址（通常是 `http://localhost:5173`）。功能完整，无需模拟器、无需签名。

构建可部署的静态 bundle：

```bash
npm run build     # 写入 dist/renderer/（静态 SPA）
```

`dist/renderer/` 是一个纯静态站点，丢到任意主机（Netlify、Vercel、S3 + CloudFront、
GitHub Pages）即可。

## 自托管 Relay（跨设备同步用）

```bash
cd relay
docker compose up -d   # 使用 relay/docker-compose.yml
```

relay 默认监听 `8787`，WebSocket 路径 `/sync`。TLS 与 Nginx 反代配置见
[docs/relay-deployment.md](docs/relay-deployment.md)。relay 只转发密文，看不到明文。

## 后端（可选）

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

后端默认监听 `127.0.0.1:8000`，鉴权用一个启动时生成并写入本机文件的 API token。
前端要在 Web 应用里用它做 http-rest 同步，需要把该 token 注入到浏览器安全存储
（当前没有自动获取端点，属已知缺口）。

## 验证你的安装

```bash
cd desktop
npm run typecheck   # 期望 0 错误（tsc --noEmit）
npm run lint        # 期望 0 错误
npm run build       # 约 30s 完成，产物在 dist/renderer/
npm test            # vitest 单元测试（550 passed / 26 skipped）
```

跑端到端测试(需先下载 chromium + 系统依赖):

```bash
cd desktop
npx playwright install chromium           # 首次下载 chromium 二进制
npx playwright install-deps chromium      # Linux 需装系统共享库(libatk 等)
npx playwright test                       # 108 个 e2e 用例,约 2 分钟
```

国内网络可加 `PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright`
加速 chromium 下载。

如果全新克隆后任一步失败,见 [FAQ.md](FAQ.md)。
