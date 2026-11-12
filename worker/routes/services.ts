import type { Hono } from 'hono';
import { z } from 'zod';
import { audit, requireAdmin, type AppContext } from '../auth';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum(['install', 'clean', 'repair', 'inspect', 'other']),
  base_price_satang: z.number().int().min(0).max(100_000_000),
  active: z.boolean().optional(),
});

export function registerServiceRoutes(app: Hono<AppContext>): void {
  app.get('/api/services', async (c) => {
    const activeOnly = c.req.query('active') === '1';
    const rows = await c.env.DB.prepare(`SELECT * FROM service_catalog ${activeOnly ? 'WHERE active = 1' : ''}
      ORDER BY active DESC, category, name`).all();
    return c.json({ items: rows.results });
  });

  app.post('/api/services', requireAdmin, async (c) => {
    const body = schema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'กรุณาตรวจชื่อ ประเภท และราคาเริ่มต้น' }, 400);
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO service_catalog (id, name, category, base_price_satang)
      VALUES (?, ?, ?, ?)`).bind(id, body.data.name, body.data.category, body.data.base_price_satang).run();
    await audit(c, 'created', 'service', id);
    return c.json({ id }, 201);
  });

  app.patch('/api/services/:id', requireAdmin, async (c) => {
    const body = schema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'กรุณาตรวจชื่อ ประเภท และราคาเริ่มต้น' }, 400);
    const id = c.req.param('id') ?? '';
    const result = await c.env.DB.prepare(`UPDATE service_catalog SET name = ?, category = ?, base_price_satang = ?,
      active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(body.data.name, body.data.category,
      body.data.base_price_satang, body.data.active === false ? 0 : 1, id).run();
    if (!result.meta.changes) return c.json({ error: 'ไม่พบบริการ' }, 404);
    await audit(c, 'updated', 'service', id);
    return c.json({ ok: true });
  });
}
