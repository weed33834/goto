// 移动端 relay 认证消息构造 —— 与桌面端 relayAuth.ts、relay 服务端 auth.ts 字节一致。
// 格式 `${deviceId}:${timestamp}:${purpose}`，UTF-8。purpose 绑定请求语义防跨端点重放：
// register / pairing-code / claim-pairing-code:xx / refresh-token。
// purpose 内的 ':' 原样保留，relay 只取前两段拆分 deviceId/timestamp，剩余整体作 purpose。

import { utf8Encode } from './bytes';
import type { Bytes } from './bytes';

/** 构造 relay 认证签名消息。三段以 ':' 分隔，purpose 内的 ':' 不影响解析。 */
export function buildAuthMessage(
  deviceId: string,
  timestamp: number,
  purpose: string,
): Bytes {
  return utf8Encode(`${deviceId}:${timestamp}:${purpose}`);
}
