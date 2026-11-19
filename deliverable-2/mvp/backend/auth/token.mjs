// Signed access-token creation and verification for stateless authentication.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { TOKEN_SECRET } from '../config.mjs';

const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function signToken(user, ttlSeconds = 8 * 60 * 60) {
  const header = enc({ alg: 'HS256', typ: 'JWT' });
  const payload = enc({ sub: user.id, role: user.role, email: user.email, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', TOKEN_SECRET).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

export function verifyToken(token) {
  const parts = token?.split('.') || [];
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = createHmac('sha256', TOKEN_SECRET).update(`${header}.${payload}`).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}
