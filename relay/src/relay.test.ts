import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { sign, generateKeyPairSync } from 'crypto';
import { createRelayServer } from './server';
import { buildAuthMessage, nowSeconds } from './auth';
import { getDeviceFingerprint } from './identity';

function createIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    deviceId: getDeviceFingerprint(publicKey),
    publicKey,
    privateKey,
  };
}

function signMessage(message: Buffer, privateKeyPem: string): string {
  return sign(null, message, privateKeyPem).toString('base64');
}

async function registerDevice(
  app: ReturnType<typeof createRelayServer>['app'],
  identity: ReturnType<typeof createIdentity>
) {
  const timestamp = nowSeconds();
  const signature = signMessage(buildAuthMessage(identity.deviceId, timestamp, 'register'), identity.privateKey);
  const res = await request(app)
    .post('/register-device')
    .send({ deviceId: identity.deviceId, publicKey: identity.publicKey, timestamp, signature });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

async function createPairingCode(
  app: ReturnType<typeof createRelayServer>['app'],
  token: string,
  identity: ReturnType<typeof createIdentity>
) {
  const timestamp = nowSeconds();
  const signature = signMessage(buildAuthMessage(identity.deviceId, timestamp, 'pairing-code'), identity.privateKey);
  const res = await request(app)
    .post('/pairing-codes')
    .set('Authorization', `Bearer ${token}`)
    .send({ timestamp, signature });
  expect(res.status).toBe(200);
  return res.body.code as string;
}

async function claimPairingCode(
  app: ReturnType<typeof createRelayServer>['app'],
  code: string,
  identity: ReturnType<typeof createIdentity>,
  hostIdentity: ReturnType<typeof createIdentity>
) {
  const timestamp = nowSeconds();
  const signature = signMessage(
    buildAuthMessage(identity.deviceId, timestamp, 'claim-pairing-code:' + code),
    identity.privateKey
  );
  const res = await request(app)
    .post('/claim-pairing-code')
    .send({ code, deviceId: identity.deviceId, publicKey: identity.publicKey, timestamp, signature });
  expect(res.status).toBe(200);
  expect(res.body.pairedDeviceId).toBe(hostIdentity.deviceId);
  return res.body.token as string;
}

function connectWs(port: number, token: string, targetDeviceId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/sync?target=${encodeURIComponent(targetDeviceId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const timer = setTimeout(() => reject(new Error('websocket connection timeout')), 2000);
    ws.on('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function connectPairingWs(
  port: number,
  token: string,
  pairingCode: string,
  targetDeviceId?: string
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let url = `ws://127.0.0.1:${port}/sync?pairingCode=${encodeURIComponent(pairingCode)}`;
    if (targetDeviceId) {
      url += `&target=${encodeURIComponent(targetDeviceId)}`;
    }
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } });
    const timer = setTimeout(() => reject(new Error('websocket connection timeout')), 2000);
    ws.on('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function connectWsWithHandler(
  port: number,
  token: string,
  targetDeviceId: string,
  onMessage: (data: WebSocket.RawData) => void
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/sync?target=${encodeURIComponent(targetDeviceId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    ws.on('message', onMessage);
    const timer = setTimeout(() => reject(new Error('websocket connection timeout')), 2000);
    ws.on('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function encodeFrame(mode: number, payload: Buffer): Buffer {
  const frame = Buffer.allocUnsafe(5 + payload.length);
  frame[0] = mode;
  frame.writeUInt32BE(payload.length, 1);
  payload.copy(frame, 5);
  return frame;
}

describe('RelayServer', () => {
  let relay: ReturnType<typeof createRelayServer>;
  let port: number;

  beforeEach(async () => {
    relay = createRelayServer({ port: 0 });
    await relay.start();
    port = (relay.server.address() as { port: number }).port;
  });

  afterEach(async () => {
    await relay.stop();
  });

  it('registers a device and issues a token', async () => {
    const identity = createIdentity();
    const token = await registerDevice(relay.app, identity);
    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(16);
  });

  it('issues and claims a pairing code', async () => {
    const existing = createIdentity();
    const existingToken = await registerDevice(relay.app, existing);
    const code = await createPairingCode(relay.app, existingToken, existing);
    expect(code).toMatch(/^\d{8}$/);

    const newest = createIdentity();
    const newToken = await claimPairingCode(relay.app, code, newest, existing);
    expect(newToken).toBeDefined();
  });

  it('does not consume pairing code on invalid claim signature', async () => {
    const existing = createIdentity();
    const existingToken = await registerDevice(relay.app, existing);
    const code = await createPairingCode(relay.app, existingToken, existing);

    const newest = createIdentity();
    const timestamp = nowSeconds();
    const badSignature = signMessage(
      buildAuthMessage(newest.deviceId, timestamp, 'claim-pairing-code:' + code + 'x'),
      newest.privateKey
    );
    const bad = await request(relay.app)
      .post('/claim-pairing-code')
      .send({ code, deviceId: newest.deviceId, publicKey: newest.publicKey, timestamp, signature: badSignature });
    expect(bad.status).toBe(401);

    const token = await claimPairingCode(relay.app, code, newest, existing);
    expect(token).toBeDefined();
  });

  it('refreshes an auth token', async () => {
    const identity = createIdentity();
    const oldToken = await registerDevice(relay.app, identity);

    const timestamp = nowSeconds();
    const signature = signMessage(buildAuthMessage(identity.deviceId, timestamp, 'refresh-token'), identity.privateKey);
    const res = await request(relay.app)
      .post('/refresh-token')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ timestamp, signature });
    expect(res.status).toBe(200);
    const newToken = res.body.token as string;
    expect(newToken).toBeDefined();
    expect(newToken).not.toBe(oldToken);

    const oldCheck = await request(relay.app)
      .post('/pairing-codes')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ timestamp, signature });
    expect(oldCheck.status).toBe(401);

    const pairTs = nowSeconds();
    const pairSig = signMessage(buildAuthMessage(identity.deviceId, pairTs, 'pairing-code'), identity.privateKey);
    const newCheck = await request(relay.app)
      .post('/pairing-codes')
      .set('Authorization', `Bearer ${newToken}`)
      .send({ timestamp: pairTs, signature: pairSig });
    expect(newCheck.status).toBe(200);
  });

  it('forwards frames between two online devices', async () => {
    const alice = createIdentity();
    const bob = createIdentity();
    const aliceToken = await registerDevice(relay.app, alice);
    const bobToken = await registerDevice(relay.app, bob);

    const bobReceived = new Promise<Buffer>((resolve, reject) => {
      setTimeout(() => reject(new Error('timeout waiting for frame')), 2000);
      connectWsWithHandler(port, bobToken, alice.deviceId, (data) =>
        resolve(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer))
      ).catch(reject);
    });

    const aliceWs = await connectWs(port, aliceToken, bob.deviceId);
    const payload = Buffer.from(JSON.stringify({ type: 'HELLO', deviceId: alice.deviceId }));
    aliceWs.send(encodeFrame(0, payload));

    const received = await bobReceived;
    expect(received.subarray(0, 1).readUInt8(0)).toBe(0);
    const len = received.readUInt32BE(1);
    expect(JSON.parse(received.subarray(5, 5 + len).toString('utf8')).deviceId).toBe(alice.deviceId);

    aliceWs.close();
  });

  it('stores and forwards frames when recipient is offline', async () => {
    const alice = createIdentity();
    const bob = createIdentity();
    const aliceToken = await registerDevice(relay.app, alice);
    const bobToken = await registerDevice(relay.app, bob);

    const aliceWs = await connectWs(port, aliceToken, bob.deviceId);
    const payload = Buffer.from(JSON.stringify({ type: 'HELLO', deviceId: alice.deviceId }));
    aliceWs.send(encodeFrame(0, payload));
    aliceWs.close();

    const bobMessages: Buffer[] = [];
    await connectWsWithHandler(port, bobToken, alice.deviceId, (data) =>
      bobMessages.push(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer))
    );

    const bobReceived = await new Promise<Buffer>((resolve, reject) => {
      setTimeout(() => reject(new Error('timeout waiting for queued frame')), 2000);
      const check = setInterval(() => {
        if (bobMessages.length > 0) {
          clearInterval(check);
          resolve(bobMessages[0]);
        }
      }, 10);
    });

    const len = bobReceived.readUInt32BE(1);
    expect(JSON.parse(bobReceived.subarray(5, 5 + len).toString('utf8')).deviceId).toBe(alice.deviceId);
  });

  it('rejects WebSocket connections without Authorization header', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/sync?target=peer`);
    const code = await new Promise<number>((resolve) => {
      ws.on('close', (c) => resolve(c));
    });
    expect(code).toBe(4001);
  });

  it('forwards frames between devices in a pairing room', async () => {
    const host = createIdentity();
    const joiner = createIdentity();
    const hostToken = await registerDevice(relay.app, host);
    const joinerToken = await registerDevice(relay.app, joiner);

    // 必须先通过 API 创建真实有效的配对码，WebSocket 握手会校验 pairingCode 有效性
    const pairingCode = await createPairingCode(relay.app, hostToken, host);

    const hostReceived = new Promise<Buffer>((resolve, reject) => {
      setTimeout(() => reject(new Error('timeout waiting for pairing frame')), 2000);
      connectPairingWs(port, hostToken, pairingCode).then((ws) => {
        ws.once('message', (data) => resolve(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)));
      });
    });

    const joinerWs = await connectPairingWs(port, joinerToken, pairingCode, host.deviceId);
    const payload = Buffer.from(JSON.stringify({ type: 'HELLO', deviceId: joiner.deviceId }));
    joinerWs.send(encodeFrame(0, payload));

    const received = await hostReceived;
    expect(received.subarray(0, 1).readUInt8(0)).toBe(0);
    const len = received.readUInt32BE(1);
    expect(JSON.parse(received.subarray(5, 5 + len).toString('utf8')).deviceId).toBe(joiner.deviceId);

    joinerWs.close();
  });

  it('rejects WebSocket connections with invalid pairingCode', async () => {
    const host = createIdentity();
    const hostToken = await registerDevice(relay.app, host);

    // 未通过 API 创建的配对码应被拒绝
    const ws = new WebSocket(`ws://127.0.0.1:${port}/sync?pairingCode=BOGUS-CODE`, {
      headers: { Authorization: `Bearer ${hostToken}` },
    });
    const code = await new Promise<number>((resolve) => {
      ws.on('close', (c) => resolve(c));
    });
    expect(code).toBe(4001);
  });
});
