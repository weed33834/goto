import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createPublicKey } from 'crypto';
import { RelayStore } from './store';
import { buildAuthMessage, nowSeconds } from './auth';
import { getDeviceFingerprint, verifyDeviceSignature } from './identity';

const TIMESTAMP_TOLERANCE_SECONDS = Number(process.env.TIMESTAMP_TOLERANCE_SECONDS ?? 60);
const MAX_BODY_SIZE = process.env.MAX_BODY_SIZE ?? '100kb';

interface AuthenticatedRequest extends Request {
  deviceId?: string;
  token?: string;
}

function isValidPublicKey(publicKey: unknown): publicKey is string {
  if (typeof publicKey !== 'string') return false;
  const pk = publicKey.trim();
  if (pk.length === 0) return false;
  // 用 crypto.createPublicKey 真正解析 PEM，并校验算法为 ed25519。
  // 仅检查 PEM 头尾会被任意合法 PEM（如 RSA 公钥）绕过。
  try {
    const key = createPublicKey(pk);
    return key.asymmetricKeyType === 'ed25519';
  } catch {
    return false;
  }
}

// rate limiter 工厂：3 个 limiter 仅 max 不同，其余配置完全一致。
const makeLimiter = (max: number) => rateLimit({
  windowMs: 15 * 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many requests' },
});

// 签名验证结果：ok 为 false 时已向 res 写入错误响应，调用方直接 return。
type VerifyResult = { ok: true; deviceId: string; publicKey: string } | { ok: false };

// 校验自带 publicKey 的请求（register-device / claim-pairing-code）：
// 字段齐全 → 公钥合法 → 时间戳容差 → 指纹匹配 → 签名有效。
function verifySelfSignedAuth(
  body: { deviceId?: unknown; publicKey?: unknown; timestamp?: unknown; signature?: unknown },
  action: string,
  res: Response,
): VerifyResult {
  const { deviceId, publicKey, timestamp, signature } = body;
  if (!deviceId || !publicKey || typeof timestamp !== 'number' || !signature) {
    res.status(400).json({ error: 'missing fields' });
    return { ok: false };
  }
  if (!isValidPublicKey(publicKey)) {
    res.status(400).json({ error: 'Invalid public key' });
    return { ok: false };
  }
  if (Math.abs(nowSeconds() - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    res.status(400).json({ error: 'timestamp out of tolerance' });
    return { ok: false };
  }
  if (getDeviceFingerprint(publicKey) !== deviceId) {
    res.status(400).json({ error: 'deviceId does not match public key fingerprint' });
    return { ok: false };
  }
  const message = buildAuthMessage(deviceId as string, timestamp, action);
  if (!verifyDeviceSignature(message, signature as string, publicKey)) {
    res.status(401).json({ error: 'invalid signature' });
    return { ok: false };
  }
  return { ok: true, deviceId: deviceId as string, publicKey };
}

// 校验已认证设备（pairing-codes / refresh-token）：从 store 取已注册公钥后验签。
function verifyRegisteredAuth(
  deviceId: string,
  body: { timestamp?: unknown; signature?: unknown },
  action: string,
  store: RelayStore,
  res: Response,
): VerifyResult {
  const { timestamp, signature } = body;
  if (typeof timestamp !== 'number' || !signature) {
    res.status(400).json({ error: 'missing fields' });
    return { ok: false };
  }
  if (Math.abs(nowSeconds() - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    res.status(400).json({ error: 'timestamp out of tolerance' });
    return { ok: false };
  }
  const device = store.getDevice(deviceId);
  if (!device) {
    res.status(404).json({ error: 'device not registered' });
    return { ok: false };
  }
  const message = buildAuthMessage(deviceId, timestamp, action);
  if (!verifyDeviceSignature(message, signature as string, device.publicKey)) {
    res.status(401).json({ error: 'invalid signature' });
    return { ok: false };
  }
  return { ok: true, deviceId, publicKey: device.publicKey };
}

export function createRoutes(store: RelayStore, publicWsUrl: string): Router {
  const router = Router();
  router.use(express.json({ limit: MAX_BODY_SIZE }));

  const authLimiter = makeLimiter(10);
  const claimPairingCodeLimiter = makeLimiter(5);
  const createPairingCodeLimiter = makeLimiter(5);

  router.post('/register-device', authLimiter, (req, res) => {
    const verified = verifySelfSignedAuth(req.body, 'register', res);
    if (!verified.ok) return;
    store.registerDevice(verified.deviceId, verified.publicKey);
    const token = store.createToken(verified.deviceId);
    return res.status(200).json({ deviceId: verified.deviceId, token, wsUrl: publicWsUrl });
  });

  router.post('/pairing-codes', createPairingCodeLimiter, requireAuth(store), (req, res) => {
    const deviceId = (req as AuthenticatedRequest).deviceId as string;
    const verified = verifyRegisteredAuth(deviceId, req.body, 'pairing-code', store, res);
    if (!verified.ok) return;
    if (!store.canCreatePairingCode(deviceId)) {
      return res.status(429).json({ error: 'rate limited or active code exists' });
    }
    const code = store.createPairingCode(deviceId);
    return res.status(200).json({ code, expiresAt: Date.now() + 5 * 60 * 1000 });
  });

  router.post('/claim-pairing-code', claimPairingCodeLimiter, authLimiter, (req, res) => {
    const { code } = req.body as { code?: string };
    if (!code) {
      return res.status(400).json({ error: 'missing fields' });
    }
    const verified = verifySelfSignedAuth(req.body, 'claim-pairing-code:' + code, res);
    if (!verified.ok) return;
    const createdByDeviceId = store.consumePairingCode(code, verified.deviceId);
    if (!createdByDeviceId) {
      return res.status(400).json({ error: 'invalid, expired, or exhausted pairing code' });
    }
    store.registerDevice(verified.deviceId, verified.publicKey);
    const token = store.createToken(verified.deviceId);
    return res.status(200).json({ deviceId: verified.deviceId, token, wsUrl: publicWsUrl, pairedDeviceId: createdByDeviceId });
  });

  router.post('/refresh-token', authLimiter, requireAuth(store), (req, res) => {
    const deviceId = (req as AuthenticatedRequest).deviceId as string;
    const oldToken = (req as AuthenticatedRequest).token as string;
    const verified = verifyRegisteredAuth(deviceId, req.body, 'refresh-token', store, res);
    if (!verified.ok) return;
    store.revokeToken(oldToken);
    const token = store.createToken(deviceId);
    return res.status(200).json({ token });
  });

  return router;
}

function requireAuth(store: RelayStore) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const prefix = 'bearer ';
    if (
      typeof header !== 'string' ||
      header.length <= prefix.length ||
      header.toLowerCase().slice(0, prefix.length) !== prefix
    ) {
      return res.status(401).json({ error: 'missing authorization' });
    }
    const token = header.slice(prefix.length).trim();
    const deviceId = store.validateToken(token);
    if (!deviceId) {
      return res.status(401).json({ error: 'invalid token' });
    }
    (req as AuthenticatedRequest).deviceId = deviceId;
    (req as AuthenticatedRequest).token = token;
    next();
  };
}
