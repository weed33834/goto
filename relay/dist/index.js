#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/server.ts
var import_http = __toESM(require("http"));
var import_express3 = __toESM(require("express"));
var import_ws2 = require("ws");
var import_helmet = __toESM(require("helmet"));
var import_cors = __toESM(require("cors"));

// src/auth.ts
var import_crypto = require("crypto");
function buildAuthMessage(deviceId, timestamp, purpose) {
  return Buffer.from(`${deviceId}:${timestamp}:${purpose}`, "utf8");
}
function generatePairingCode() {
  return String((0, import_crypto.randomInt)(0, 1e8)).padStart(8, "0");
}
function generateAuthToken() {
  return (0, import_crypto.randomBytes)(32).toString("base64url");
}
function nowSeconds() {
  return Math.floor(Date.now() / 1e3);
}

// src/store.ts
var MAX_FRAME_SIZE = Number(process.env.MAX_FRAME_SIZE ?? 8 * 1024 * 1024);
var QUEUE_TTL_MS = Number(process.env.QUEUE_TTL_MS ?? 7 * 24 * 60 * 60 * 1e3);
var TOKEN_TTL_MS = Number(process.env.TOKEN_TTL_MS ?? 24 * 60 * 60 * 1e3);
var CODE_TTL_MS = Number(process.env.CODE_TTL_MS ?? 5 * 60 * 1e3);
var MAX_QUEUE_BYTES_PER_PEER = Number(
  process.env.MAX_QUEUE_BYTES_PER_PEER ?? 64 * 1024 * 1024
);
var MAX_QUEUE_FRAMES_PER_PEER = Number(process.env.MAX_QUEUE_FRAMES_PER_PEER ?? 1e4);
var PAIRING_RATE_LIMIT_MS = Number(process.env.PAIRING_RATE_LIMIT_MS ?? 1e4);
var MAX_CODE_ATTEMPTS = Number(process.env.MAX_CODE_ATTEMPTS ?? 5);
var DEVICE_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
var RelayStore = class {
  devices = /* @__PURE__ */ new Map();
  tokens = /* @__PURE__ */ new Map();
  codes = /* @__PURE__ */ new Map();
  queues = /* @__PURE__ */ new Map();
  // 与 queues 同步维护的每队列字节数缓存，避免 enqueueFrame 每次 O(n) 重算
  queueBytesCache = /* @__PURE__ */ new Map();
  lastPairingRequest = /* @__PURE__ */ new Map();
  registerDevice(deviceId, publicKey) {
    const existing = this.devices.get(deviceId);
    const now = Date.now();
    this.devices.set(deviceId, {
      deviceId,
      publicKey,
      registeredAt: existing?.registeredAt ?? now,
      lastSeenAt: now
    });
  }
  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }
  createToken(deviceId) {
    const token = generateAuthToken();
    this.tokens.set(token, {
      deviceId,
      expiresAt: Date.now() + TOKEN_TTL_MS
    });
    return token;
  }
  validateToken(token) {
    const record = this.tokens.get(token);
    if (!record) return void 0;
    if (record.expiresAt < Date.now()) {
      this.tokens.delete(token);
      return void 0;
    }
    const device = this.devices.get(record.deviceId);
    if (device) {
      device.lastSeenAt = Date.now();
    }
    return record.deviceId;
  }
  revokeToken(token) {
    this.tokens.delete(token);
  }
  canCreatePairingCode(deviceId) {
    const last = this.lastPairingRequest.get(deviceId) ?? 0;
    if (Date.now() - last < PAIRING_RATE_LIMIT_MS) return false;
    for (const code of this.codes.values()) {
      if (code.createdByDeviceId === deviceId && !code.used && code.expiresAt > Date.now()) {
        return false;
      }
    }
    return true;
  }
  createPairingCode(createdByDeviceId) {
    this.lastPairingRequest.set(createdByDeviceId, Date.now());
    const code = generatePairingCode();
    this.codes.set(code, {
      createdByDeviceId,
      expiresAt: Date.now() + CODE_TTL_MS,
      used: false,
      attempts: 0
    });
    return code;
  }
  consumePairingCode(code, claimantDeviceId) {
    const record = this.codes.get(code);
    if (!record) return void 0;
    if (claimantDeviceId === record.createdByDeviceId) return void 0;
    if (record.used || record.expiresAt < Date.now()) {
      this.codes.delete(code);
      return void 0;
    }
    record.attempts += 1;
    if (record.attempts > MAX_CODE_ATTEMPTS) {
      this.codes.delete(code);
      return void 0;
    }
    record.used = true;
    return record.createdByDeviceId;
  }
  /**
   * 验证配对码是否可用于 WebSocket 握手。
   * 检查：存在、未过期、未超过最大尝试次数。
   * 注意：不检查 used 标志——joiner 在 HTTP claim（标记 used=true）后才用同一 code
   * 建立 WebSocket，此时 used 为 true 是正常的。单次消费语义由 consumePairingCode 保证。
   * 每次调用都会增加 attempts 计数，超过 MAX_CODE_ATTEMPTS 后失效，防止穷举攻击。
   */
  validatePairingCodeForWs(code) {
    const record = this.codes.get(code);
    if (!record) return false;
    if (record.expiresAt < Date.now()) {
      this.codes.delete(code);
      return false;
    }
    record.attempts += 1;
    if (record.attempts > MAX_CODE_ATTEMPTS) {
      this.codes.delete(code);
      return false;
    }
    return true;
  }
  enqueueFrame(recipientDeviceId, senderDeviceId, payload) {
    const key = `${recipientDeviceId}:${senderDeviceId}`;
    const queue = this.queues.get(key) ?? [];
    let queueBytes = this.queueBytesCache.get(key) ?? 0;
    while (queue.length > 0 && (queue.length >= MAX_QUEUE_FRAMES_PER_PEER || queueBytes + payload.length > MAX_QUEUE_BYTES_PER_PEER)) {
      const dropped = queue.shift();
      queueBytes -= dropped.payload.length;
    }
    queue.push({ senderDeviceId, payload, createdAt: Date.now() });
    queueBytes += payload.length;
    this.queues.set(key, queue);
    this.queueBytesCache.set(key, queueBytes);
  }
  dequeueFrames(recipientDeviceId, senderDeviceId) {
    const key = `${recipientDeviceId}:${senderDeviceId}`;
    const queue = this.queues.get(key);
    if (!queue) return [];
    this.queues.delete(key);
    this.queueBytesCache.delete(key);
    return queue;
  }
  cleanup() {
    const now = Date.now();
    for (const [token, record] of this.tokens) {
      if (record.expiresAt < now) this.tokens.delete(token);
    }
    for (const [code, record] of this.codes) {
      if (record.used || record.expiresAt < now) this.codes.delete(code);
    }
    for (const [key, queue] of this.queues) {
      const filtered = queue.filter((f) => now - f.createdAt < QUEUE_TTL_MS);
      if (filtered.length === 0) {
        this.queues.delete(key);
        this.queueBytesCache.delete(key);
      } else {
        this.queues.set(key, filtered);
        this.queueBytesCache.set(
          key,
          filtered.reduce((sum, f) => sum + f.payload.length, 0)
        );
      }
    }
    for (const [deviceId, lastRequest] of this.lastPairingRequest) {
      if (now - lastRequest > CODE_TTL_MS) {
        this.lastPairingRequest.delete(deviceId);
      }
    }
    for (const [deviceId, device] of this.devices) {
      if (now - device.lastSeenAt > DEVICE_TTL_MS) {
        this.devices.delete(deviceId);
      }
    }
  }
};

// src/routes.ts
var import_express = require("express");
var import_express2 = __toESM(require("express"));
var import_express_rate_limit = __toESM(require("express-rate-limit"));
var import_crypto3 = require("crypto");

// src/identity.ts
var import_crypto2 = require("crypto");
function getDeviceFingerprint(publicKeyPem) {
  const jwk = (0, import_crypto2.createPublicKey)(publicKeyPem).export({ format: "jwk" });
  const rawPublicKey = Buffer.from(jwk.x ?? "", "base64url");
  return (0, import_crypto2.createHash)("sha256").update(rawPublicKey).digest("hex").slice(0, 16);
}
function verifyDeviceSignature(message, signatureBase64, publicKeyPem) {
  try {
    return (0, import_crypto2.verify)(null, message, publicKeyPem, Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
}

// src/routes.ts
var TIMESTAMP_TOLERANCE_SECONDS = Number(process.env.TIMESTAMP_TOLERANCE_SECONDS ?? 60);
var MAX_BODY_SIZE = process.env.MAX_BODY_SIZE ?? "100kb";
function isValidPublicKey(publicKey) {
  if (typeof publicKey !== "string") return false;
  const pk = publicKey.trim();
  if (pk.length === 0) return false;
  try {
    const key = (0, import_crypto3.createPublicKey)(pk);
    return key.asymmetricKeyType === "ed25519";
  } catch {
    return false;
  }
}
var makeLimiter = (max) => (0, import_express_rate_limit.default)({
  windowMs: 15 * 60 * 1e3,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: "Too many requests" }
});
function verifySelfSignedAuth(body, action, res) {
  const { deviceId, publicKey, timestamp, signature } = body;
  if (!deviceId || !publicKey || typeof timestamp !== "number" || !signature) {
    res.status(400).json({ error: "missing fields" });
    return { ok: false };
  }
  if (!isValidPublicKey(publicKey)) {
    res.status(400).json({ error: "Invalid public key" });
    return { ok: false };
  }
  if (Math.abs(nowSeconds() - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    res.status(400).json({ error: "timestamp out of tolerance" });
    return { ok: false };
  }
  if (getDeviceFingerprint(publicKey) !== deviceId) {
    res.status(400).json({ error: "deviceId does not match public key fingerprint" });
    return { ok: false };
  }
  const message = buildAuthMessage(deviceId, timestamp, action);
  if (!verifyDeviceSignature(message, signature, publicKey)) {
    res.status(401).json({ error: "invalid signature" });
    return { ok: false };
  }
  return { ok: true, deviceId, publicKey };
}
function verifyRegisteredAuth(deviceId, body, action, store, res) {
  const { timestamp, signature } = body;
  if (typeof timestamp !== "number" || !signature) {
    res.status(400).json({ error: "missing fields" });
    return { ok: false };
  }
  if (Math.abs(nowSeconds() - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    res.status(400).json({ error: "timestamp out of tolerance" });
    return { ok: false };
  }
  const device = store.getDevice(deviceId);
  if (!device) {
    res.status(404).json({ error: "device not registered" });
    return { ok: false };
  }
  const message = buildAuthMessage(deviceId, timestamp, action);
  if (!verifyDeviceSignature(message, signature, device.publicKey)) {
    res.status(401).json({ error: "invalid signature" });
    return { ok: false };
  }
  return { ok: true, deviceId, publicKey: device.publicKey };
}
function createRoutes(store, publicWsUrl2) {
  const router = (0, import_express.Router)();
  router.use(import_express2.default.json({ limit: MAX_BODY_SIZE }));
  const authLimiter = makeLimiter(10);
  const claimPairingCodeLimiter = makeLimiter(5);
  const createPairingCodeLimiter = makeLimiter(5);
  router.post("/register-device", authLimiter, (req, res) => {
    const verified = verifySelfSignedAuth(req.body, "register", res);
    if (!verified.ok) return;
    store.registerDevice(verified.deviceId, verified.publicKey);
    const token = store.createToken(verified.deviceId);
    return res.status(200).json({ deviceId: verified.deviceId, token, wsUrl: publicWsUrl2 });
  });
  router.post("/pairing-codes", createPairingCodeLimiter, requireAuth(store), (req, res) => {
    const deviceId = req.deviceId;
    const verified = verifyRegisteredAuth(deviceId, req.body, "pairing-code", store, res);
    if (!verified.ok) return;
    if (!store.canCreatePairingCode(deviceId)) {
      return res.status(429).json({ error: "rate limited or active code exists" });
    }
    const code = store.createPairingCode(deviceId);
    return res.status(200).json({ code, expiresAt: Date.now() + 5 * 60 * 1e3 });
  });
  router.post("/claim-pairing-code", claimPairingCodeLimiter, authLimiter, (req, res) => {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: "missing fields" });
    }
    const verified = verifySelfSignedAuth(req.body, "claim-pairing-code:" + code, res);
    if (!verified.ok) return;
    const createdByDeviceId = store.consumePairingCode(code, verified.deviceId);
    if (!createdByDeviceId) {
      return res.status(400).json({ error: "invalid, expired, or exhausted pairing code" });
    }
    store.registerDevice(verified.deviceId, verified.publicKey);
    const token = store.createToken(verified.deviceId);
    return res.status(200).json({ deviceId: verified.deviceId, token, wsUrl: publicWsUrl2, pairedDeviceId: createdByDeviceId });
  });
  router.post("/refresh-token", authLimiter, requireAuth(store), (req, res) => {
    const deviceId = req.deviceId;
    const oldToken = req.token;
    const verified = verifyRegisteredAuth(deviceId, req.body, "refresh-token", store, res);
    if (!verified.ok) return;
    store.revokeToken(oldToken);
    const token = store.createToken(deviceId);
    return res.status(200).json({ token });
  });
  return router;
}
function requireAuth(store) {
  return (req, res, next) => {
    const header = req.headers.authorization ?? "";
    const prefix = "bearer ";
    if (typeof header !== "string" || header.length <= prefix.length || header.toLowerCase().slice(0, prefix.length) !== prefix) {
      return res.status(401).json({ error: "missing authorization" });
    }
    const token = header.slice(prefix.length).trim();
    const deviceId = store.validateToken(token);
    if (!deviceId) {
      return res.status(401).json({ error: "invalid token" });
    }
    req.deviceId = deviceId;
    req.token = token;
    next();
  };
}

// src/connectionManager.ts
var import_ws = require("ws");
var ConnectionManager = class {
  constructor(store) {
    this.store = store;
  }
  store;
  connections = /* @__PURE__ */ new Map();
  pairingRooms = /* @__PURE__ */ new Map();
  add(ws, deviceId, targetDeviceId, pairingCode) {
    const key = `${deviceId}:${targetDeviceId}`;
    const existing = this.connections.get(key);
    if (existing && existing !== ws) {
      this.remove(existing);
      try {
        existing.close(1e3, "superseded");
      } catch {
      }
    }
    this.connections.set(key, ws);
    if (pairingCode) {
      const room = this.pairingRooms.get(pairingCode) ?? /* @__PURE__ */ new Map();
      room.set(deviceId, ws);
      this.pairingRooms.set(pairingCode, room);
    }
    const queued = this.store.dequeueFrames(deviceId, targetDeviceId);
    for (const frame of queued) {
      if (ws.readyState === import_ws.WebSocket.OPEN) {
        ws.send(frame.payload);
      }
    }
  }
  remove(ws) {
    for (const [key, value] of this.connections) {
      if (value === ws) {
        this.connections.delete(key);
        break;
      }
    }
    for (const [code, room] of this.pairingRooms) {
      for (const [deviceId, value] of room) {
        if (value === ws) {
          room.delete(deviceId);
          break;
        }
      }
      if (room.size === 0) {
        this.pairingRooms.delete(code);
      }
    }
  }
  forward(senderDeviceId, targetDeviceId, payload, pairingCode) {
    const key = `${targetDeviceId}:${senderDeviceId}`;
    const ws = this.connections.get(key);
    if (ws && ws.readyState === import_ws.WebSocket.OPEN) {
      ws.send(payload);
      return;
    }
    if (pairingCode) {
      const room = this.pairingRooms.get(pairingCode);
      if (room) {
        for (const [deviceId, peerWs] of room) {
          if (deviceId !== senderDeviceId && peerWs.readyState === import_ws.WebSocket.OPEN) {
            peerWs.send(payload);
            return;
          }
        }
      }
    }
    this.store.enqueueFrame(targetDeviceId, senderDeviceId, payload);
  }
};

// src/logger.ts
var import_pino = __toESM(require("pino"));
var isDev = process.env.NODE_ENV !== "production";
var logger = (0, import_pino.default)({
  level: process.env.LOG_LEVEL ?? "info",
  ...isDev ? {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss" }
    }
  } : {}
});

// src/wsRelay.ts
var PING_INTERVAL_MS = Number(process.env.PING_INTERVAL_MS ?? 3e4);
var MAX_TARGET_LENGTH = 128;
var MAX_PAIRING_CODE_LENGTH = 32;
var MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS ?? 1e3);
var MAX_CONNECTIONS_PER_IP = Number(process.env.MAX_CONNECTIONS_PER_IP ?? 10);
var IP_RATE_LIMIT_WINDOW_MS = Number(process.env.IP_RATE_LIMIT_WINDOW_MS ?? 6e4);
var MAX_CONNECTIONS_PER_IP_WINDOW = Number(process.env.MAX_CONNECTIONS_PER_IP_WINDOW ?? 20);
var SYNC_PATH = process.env.WS_PATH ?? "/sync";
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") {
    return xff.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}
function attachWsRelay(wss, store, connections) {
  const alive = /* @__PURE__ */ new WeakMap();
  const ipConnectionCounts = /* @__PURE__ */ new Map();
  const ipConnectionTimestamps = /* @__PURE__ */ new Map();
  function cleanupIpTracking(ip) {
    const now = Date.now();
    const timestamps = ipConnectionTimestamps.get(ip);
    if (timestamps) {
      const windowStart = now - IP_RATE_LIMIT_WINDOW_MS;
      const recent = timestamps.filter((t) => t > windowStart);
      if (recent.length === 0) {
        ipConnectionTimestamps.delete(ip);
        ipConnectionCounts.delete(ip);
      } else {
        ipConnectionTimestamps.set(ip, recent);
        ipConnectionCounts.set(ip, recent.length);
      }
    }
  }
  wss.on("connection", (ws, req) => {
    const clientIp = getClientIp(req);
    const now = Date.now();
    if (wss.clients.size >= MAX_CONNECTIONS) {
      logger.warn({ limit: MAX_CONNECTIONS }, "connection rejected: global connection limit reached");
      ws.close(1013, "server busy");
      return;
    }
    cleanupIpTracking(clientIp);
    const currentCount = ipConnectionCounts.get(clientIp) ?? 0;
    const timestamps = ipConnectionTimestamps.get(clientIp) ?? [];
    if (currentCount >= MAX_CONNECTIONS_PER_IP) {
      logger.warn({ clientIp, limit: MAX_CONNECTIONS_PER_IP }, "connection rejected: per-IP connection limit reached");
      ws.close(1008, "too many connections from your IP");
      return;
    }
    const windowStart = now - IP_RATE_LIMIT_WINDOW_MS;
    const recentConnections = timestamps.filter((t) => t > windowStart);
    if (recentConnections.length >= MAX_CONNECTIONS_PER_IP_WINDOW) {
      logger.warn({ clientIp }, "connection rate limited: too many connection attempts");
      ws.close(1008, "rate limited");
      return;
    }
    timestamps.push(now);
    ipConnectionTimestamps.set(clientIp, timestamps);
    ipConnectionCounts.set(clientIp, currentCount + 1);
    const url = new URL(req.url ?? "", "http://localhost");
    const targetDeviceId = url.searchParams.get("target");
    const pairingCode = url.searchParams.get("pairingCode");
    if (targetDeviceId !== null && (targetDeviceId.length === 0 || targetDeviceId.length > MAX_TARGET_LENGTH) || pairingCode !== null && (pairingCode.length === 0 || pairingCode.length > MAX_PAIRING_CODE_LENGTH)) {
      logger.warn({ clientIp }, "websocket auth failed: invalid target or pairingCode query parameter");
      ws.close(4001, "invalid target or pairingCode");
      ipConnectionCounts.set(clientIp, (ipConnectionCounts.get(clientIp) ?? 1) - 1);
      return;
    }
    const authHeader = req.headers["authorization"];
    const authMatch = typeof authHeader === "string" ? /^Bearer\s+(.+)$/i.exec(authHeader) : null;
    const queryToken = url.searchParams.get("token");
    if (!authMatch && !queryToken) {
      logger.warn({ clientIp }, "websocket auth failed: missing Authorization header or token query param");
      ws.close(4001, "missing authorization");
      ipConnectionCounts.set(clientIp, (ipConnectionCounts.get(clientIp) ?? 1) - 1);
      return;
    }
    if (!targetDeviceId && !pairingCode) {
      logger.warn({ clientIp }, "websocket auth failed: missing target or pairingCode query parameter");
      ws.close(4001, "missing target or pairingCode");
      ipConnectionCounts.set(clientIp, (ipConnectionCounts.get(clientIp) ?? 1) - 1);
      return;
    }
    const token = authMatch ? authMatch[1] : queryToken;
    const deviceId = store.validateToken(token);
    if (!deviceId) {
      logger.warn({ clientIp }, "websocket auth failed: invalid token");
      ws.close(4001, "invalid token");
      ipConnectionCounts.set(clientIp, (ipConnectionCounts.get(clientIp) ?? 1) - 1);
      return;
    }
    if (pairingCode && !store.validatePairingCodeForWs(pairingCode)) {
      logger.warn({ clientIp }, "websocket auth failed: invalid or expired pairingCode");
      ws.close(4001, "invalid pairingCode");
      ipConnectionCounts.set(clientIp, (ipConnectionCounts.get(clientIp) ?? 1) - 1);
      return;
    }
    alive.set(ws, true);
    connections.add(ws, deviceId, targetDeviceId ?? "", pairingCode ?? void 0);
    ws.on("ping", () => {
      ws.pong();
    });
    ws.on("pong", () => {
      alive.set(ws, true);
    });
    ws.on("message", (data) => {
      const buffer = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
      if (buffer.length > MAX_FRAME_SIZE) {
        ws.close(1009, "frame too large");
        return;
      }
      connections.forward(deviceId, targetDeviceId ?? "", buffer, pairingCode ?? void 0);
    });
    const handleClose = () => {
      connections.remove(ws);
      const count = ipConnectionCounts.get(clientIp);
      if (count !== void 0) {
        const newCount = count - 1;
        if (newCount <= 0) {
          ipConnectionCounts.delete(clientIp);
        } else {
          ipConnectionCounts.set(clientIp, newCount);
        }
      }
    };
    ws.on("close", handleClose);
    ws.on("error", () => {
      handleClose();
      try {
        ws.terminate();
      } catch {
      }
    });
  });
  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, PING_INTERVAL_MS);
  wss.on("close", () => clearInterval(interval));
}

// src/server.ts
function createRelayServer(opts) {
  const app = (0, import_express3.default)();
  app.set("trust proxy", 1);
  app.use((0, import_helmet.default)());
  const rawOrigin = process.env.ALLOWED_ORIGINS;
  const corsOrigin = rawOrigin ? rawOrigin.split(",").map((s) => s.trim()).filter(Boolean) : "*";
  app.use((0, import_cors.default)({ origin: corsOrigin }));
  const server = import_http.default.createServer(app);
  const wss = new import_ws2.WebSocketServer({ server, path: SYNC_PATH });
  const store = new RelayStore();
  const connections = new ConnectionManager(store);
  const publicWsUrl2 = opts.publicWsUrl && opts.publicWsUrl.length > 0 ? opts.publicWsUrl : `ws://localhost:${opts.port}/sync`;
  const host2 = opts.host ?? "0.0.0.0";
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(createRoutes(store, publicWsUrl2));
  app.use((err, _req, res, _next) => {
    logger.error({ err }, "unhandled error");
    const isDev2 = process.env.NODE_ENV === "development";
    res.status(500).json({ error: isDev2 ? err.message : "Internal server error" });
  });
  attachWsRelay(wss, store, connections);
  const cleanupInterval = setInterval(
    () => store.cleanup(),
    Number(process.env.CLEANUP_INTERVAL_MS ?? 6e4)
  );
  cleanupInterval.unref();
  const start = () => new Promise((resolve) => {
    server.listen(opts.port, host2, () => {
      logger.info({ host: host2, port: opts.port }, "relay listening");
      logger.info({ publicWsUrl: publicWsUrl2 }, "websocket path");
      resolve();
    });
  });
  const stop = () => new Promise((resolve) => {
    clearInterval(cleanupInterval);
    wss.clients.forEach((ws) => {
      try {
        ws.close(1001, "server shutdown");
      } catch {
      }
    });
    const forceTimer = setTimeout(() => {
      wss.clients.forEach((ws) => {
        try {
          ws.terminate();
        } catch {
        }
      });
    }, 500);
    forceTimer.unref();
    wss.close(() => {
      server.close(() => {
        resolve();
      });
    });
  });
  return { app, server, store, start, stop };
}

// src/index.ts
var DEFAULT_PORT = 8787;
var SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 1e4);
var port = parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
var publicWsUrl = process.env.PUBLIC_WS_URL;
var host = process.env.HOST;
var relay = createRelayServer({ port, publicWsUrl, host });
relay.start().then(() => {
}).catch((err) => {
  logger.error({ err }, "failed to start");
  process.exit(1);
});
function shutdown() {
  const forceExit = setTimeout(() => {
    logger.error("shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();
  relay.stop().then(() => process.exit(0)).catch((err) => {
    logger.error({ err }, "stop failed");
    process.exit(1);
  });
}
function forceShutdown() {
  const forceExit = setTimeout(() => {
    logger.error("force shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();
  relay.stop().then(() => process.exit(1)).catch((err) => {
    logger.error({ err }, "stop failed during force shutdown");
    process.exit(1);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException");
  forceShutdown();
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandledRejection");
  forceShutdown();
});
//# sourceMappingURL=index.js.map