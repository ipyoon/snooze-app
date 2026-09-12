import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
export function issueGuestSession(secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ id: randomUUID(), expiresAt: now + 15 * 60000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function validGuestSession(token: string, secret: string, now = Date.now()): boolean {
  if (token.length > 2000) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(payload).digest('base64url'));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try { const value = JSON.parse(Buffer.from(payload, 'base64url').toString()); return typeof value.id === 'string' && Number.isFinite(value.expiresAt) && value.expiresAt > now && value.expiresAt <= now + 15 * 60000; }
  catch { return false; }
}
