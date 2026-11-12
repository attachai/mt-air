import type { Hono } from 'hono';
import { z } from 'zod';
import { audit, createSession, hashPassword, requireAdmin, revokeSession, sha256, verifyPassword, type AppContext, type User } from '../auth';

const credentials = z.object({
  email: z.email().max(200),
  password: z.string().min(12).max(200),
});

export function registerAuthRoutes(app: Hono<AppContext>): void {
  app.get('/api/setup/status', async (c) => {
    const row = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
    return c.json({ needsSetup: (row?.count ?? 0) === 0, setupAvailable: Boolean(c.env.SETUP_KEY) });
  });

  app.post('/api/setup', async (c) => {
    const row = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
    if ((row?.count ?? 0) !== 0 || !c.env.SETUP_KEY) return c.json({ error: 'ปิดการตั้งค่าผู้ดูแลระบบแล้ว' }, 403);
    const body = z.object({ name: z.string().trim().min(2).max(120), setupKey: z.string().min(20) })
      .extend(credentials.shape).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'กรุณากรอกชื่อ อีเมล รหัสผ่านอย่างน้อย 12 ตัว และรหัสตั้งค่า' }, 400);
    if (await sha256(body.data.setupKey) !== await sha256(c.env.SETUP_KEY)) {
      return c.json({ error: 'รหัสตั้งค่าไม่ถูกต้อง' }, 403);
    }
    const hash = await hashPassword(body.data.password);
    try {
      await c.env.DB.prepare(
        `INSERT INTO users (id, name, email, password_hash, role) VALUES ('initial-admin', ?, ?, ?, 'admin')`,
      ).bind(body.data.name, body.data.email.toLowerCase(), hash).run();
    } catch {
      return c.json({ error: 'ตั้งค่าผู้ดูแลระบบแล้ว หรืออีเมลซ้ำ' }, 409);
    }
    await createSession(c, 'initial-admin');
    return c.json({ user: { id: 'initial-admin', name: body.data.name, email: body.data.email.toLowerCase(), role: 'admin' } }, 201);
  });

  app.post('/api/auth/login', async (c) => {
    const body = credentials.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, 400);
    const email = body.data.email.toLowerCase();
    const ip = c.req.header('CF-Connecting-IP') ?? 'local';
    const key = await sha256(`${email}:${ip}`);
    const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
    await c.env.DB.prepare('DELETE FROM login_attempts WHERE key_hash = ? AND first_attempt_at < ?').bind(key, cutoff).run();
    const attempts = await c.env.DB.prepare('SELECT attempts FROM login_attempts WHERE key_hash = ?').bind(key).first<{ attempts: number }>();
    if ((attempts?.attempts ?? 0) >= 5) return c.json({ error: 'ลองรหัสผิดหลายครั้ง กรุณารอ 15 นาที' }, 429);
    const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? AND active = 1').bind(email)
      .first<User & { password_hash: string }>();
    if (!user || !(await verifyPassword(body.data.password, user.password_hash))) {
      await c.env.DB.prepare(`INSERT INTO login_attempts (key_hash, attempts, first_attempt_at) VALUES (?, 1, ?)
        ON CONFLICT(key_hash) DO UPDATE SET attempts = attempts + 1`).bind(key, new Date().toISOString()).run();
      return c.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, 401);
    }
    await c.env.DB.prepare('DELETE FROM login_attempts WHERE key_hash = ?').bind(key).run();
    await createSession(c, user.id);
    return c.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  });

  app.get('/api/auth/me', (c) => c.json({ user: c.get('user') }));
  app.post('/api/auth/logout', async (c) => {
    await revokeSession(c);
    return c.json({ ok: true });
  });

  app.post('/api/auth/password', async (c) => {
    const body = z.object({ currentPassword: z.string(), newPassword: z.string().min(12).max(200) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 12 ตัว' }, 400);
    const stored = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(c.get('user').id).first<{ password_hash: string }>();
    if (!stored || !(await verifyPassword(body.data.currentPassword, stored.password_hash))) {
      return c.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, 400);
    }
    await c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(await hashPassword(body.data.newPassword), c.get('user').id).run();
    await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(c.get('user').id).run();
    await audit(c, 'password_changed', 'user', c.get('user').id);
    await revokeSession(c);
    return c.json({ ok: true });
  });

  app.get('/api/users', requireAdmin, async (c) => {
    const rows = await c.env.DB.prepare('SELECT id, name, email, role, active, created_at FROM users ORDER BY created_at DESC').all();
    return c.json({ items: rows.results });
  });
  app.get('/api/technicians', async (c) => {
    if (c.get('user').role === 'technician') return c.json({ error: 'ไม่มีสิทธิ์' }, 403);
    const rows = await c.env.DB.prepare(`SELECT id, name, role FROM users WHERE active = 1
      ORDER BY CASE role WHEN 'technician' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END, name`).all();
    return c.json({ items: rows.results });
  });
  app.post('/api/users', requireAdmin, async (c) => {
    const body = z.object({ name: z.string().trim().min(2).max(120), role: z.enum(['admin', 'staff', 'technician']) })
      .extend(credentials.shape).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'ตรวจชื่อ อีเมล รหัสผ่านอย่างน้อย 12 ตัว และบทบาท' }, 400);
    const id = crypto.randomUUID();
    try {
      await c.env.DB.prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
        .bind(id, body.data.name, body.data.email.toLowerCase(), await hashPassword(body.data.password), body.data.role).run();
    } catch {
      return c.json({ error: 'อีเมลนี้มีผู้ใช้งานแล้ว' }, 409);
    }
    await audit(c, 'created', 'user', id);
    return c.json({ id }, 201);
  });
  app.patch('/api/users/:id', requireAdmin, async (c) => {
    const body = z.object({ name: z.string().trim().min(2).max(120), role: z.enum(['admin', 'staff', 'technician']), active: z.boolean() })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'ข้อมูลพนักงานไม่ถูกต้อง' }, 400);
    const id = c.req.param('id') ?? '';
    if (id === c.get('user').id && (!body.data.active || body.data.role !== 'admin')) {
      return c.json({ error: 'ปิดบัญชีหรือลดสิทธิ์ของตนเองไม่ได้' }, 400);
    }
    const result = await c.env.DB.prepare('UPDATE users SET name = ?, role = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(body.data.name, body.data.role, body.data.active ? 1 : 0, id).run();
    if (!result.meta.changes) return c.json({ error: 'ไม่พบพนักงาน' }, 404);
    if (!body.data.active) await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
    await audit(c, 'updated', 'user', id);
    return c.json({ ok: true });
  });
}
