import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

export interface Env {
  DB: D1Database;
  FILES?: R2Bucket;
  SETUP_KEY?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff' | 'technician';
  active: number;
}

export type AppContext = { Bindings: Env; Variables: { user: User } };
type Ctx = Context<AppContext>;

const encoder = new TextEncoder();

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310_000 }, key, 256,
  ));
  return `pbkdf2-sha256$310000$${hex(salt)}$${hex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationsText, saltHex, expectedHex] = stored.split('$');
  if (algorithm !== 'pbkdf2-sha256' || !iterationsText || !saltHex || !expectedHex) return false;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) ?? [], (part) => parseInt(part, 16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const actual = hex(new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256,
  )));
  if (actual.length !== expectedHex.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return difference === 0;
}

export async function createSession(c: Ctx, userId: string): Promise<void> {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
  const tokenHash = await sha256(raw);
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, userId, expiry.toISOString()).run();
  setCookie(c, 'mt_session', raw, {
    httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax',
    path: '/', expires: expiry,
  });
}

export async function revokeSession(c: Ctx): Promise<void> {
  const raw = getCookie(c, 'mt_session');
  if (raw) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(raw)).run();
  deleteCookie(c, 'mt_session', { path: '/' });
}

export async function authenticate(c: Ctx, next: Next): Promise<Response | void> {
  const path = c.req.path;
  if (path === '/api/health' || path === '/api/setup/status' || path === '/api/setup' || path === '/api/auth/login') {
    await next();
    return;
  }
  const raw = getCookie(c, 'mt_session');
  if (!raw) return c.json({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
  const user = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.role, u.active FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
  ).bind(await sha256(raw), new Date().toISOString()).first<User>();
  if (!user) return c.json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' }, 401);
  c.set('user', user);
  await next();
}

export async function requireAdmin(c: Ctx, next: Next): Promise<Response | void> {
  if (c.get('user').role !== 'admin') return c.json({ error: 'ไม่มีสิทธิ์ดำเนินการ' }, 403);
  await next();
}

export async function requireOffice(c: Ctx, next: Next): Promise<Response | void> {
  if (c.get('user').role === 'technician') return c.json({ error: 'ไม่มีสิทธิ์ดำเนินการ' }, 403);
  await next();
}

export async function audit(c: Ctx, action: string, entityType: string, entityId: string): Promise<void> {
  await c.env.DB.prepare('INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), c.get('user')?.id ?? null, action, entityType, entityId).run();
}
