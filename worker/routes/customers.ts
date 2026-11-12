import type { Hono } from 'hono';
import { z } from 'zod';
import { audit, requireOffice, type AppContext } from '../auth';

const optionalText = z.string().trim().max(500).optional().nullable();
const customerSchema = z.object({
  kind: z.enum(['person', 'company']),
  name: z.string().trim().min(2).max(180),
  phone: z.string().trim().min(8).max(30),
  email: z.union([z.email(), z.literal('')]).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});
const siteSchema = z.object({
  label: z.string().trim().min(1).max(120),
  address: z.string().trim().min(5).max(1000),
  province: optionalText,
  contact_name: optionalText,
  contact_phone: z.string().trim().max(30).optional().nullable(),
});
const unitSchema = z.object({
  label: z.string().trim().min(1).max(120),
  brand: optionalText,
  model: optionalText,
  btu: z.number().int().min(0).max(200000).optional().nullable(),
  serial_number: optionalText,
  installed_on: z.union([z.iso.date(), z.literal('')]).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
});

export function registerCustomerRoutes(app: Hono<AppContext>): void {
  app.get('/api/customers', requireOffice, async (c) => {
    const q = (c.req.query('q') ?? '').trim().slice(0, 100);
    const page = Math.max(1, Math.min(10000, Number(c.req.query('page')) || 1));
    const pattern = `%${q}%`;
    const where = q ? 'WHERE (name LIKE ? OR phone LIKE ? OR email LIKE ?)' : '';
    const values = q ? [pattern, pattern, pattern] : [];
    const [items, total] = await Promise.all([
      c.env.DB.prepare(`SELECT id, kind, name, phone, email, active, created_at,
        (SELECT COUNT(*) FROM jobs WHERE customer_id = customers.id) AS job_count
        FROM customers ${where} ORDER BY created_at DESC LIMIT 20 OFFSET ?`)
        .bind(...values, (page - 1) * 20).all(),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM customers ${where}`).bind(...values).first<{ count: number }>(),
    ]);
    return c.json({ items: items.results, total: total?.count ?? 0, page });
  });

  app.post('/api/customers', requireOffice, async (c) => {
    const body = customerSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'กรุณาตรวจชื่อและเบอร์โทรลูกค้า' }, 400);
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO customers (id, kind, name, phone, email, note)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(id, body.data.kind, body.data.name, body.data.phone,
      body.data.email || null, body.data.note || null).run();
    await audit(c, 'created', 'customer', id);
    return c.json({ id }, 201);
  });

  app.get('/api/customers/:id', requireOffice, async (c) => {
    const id = c.req.param('id') ?? '';
    const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first();
    if (!customer) return c.json({ error: 'ไม่พบลูกค้า' }, 404);
    const [sites, units, jobs] = await Promise.all([
      c.env.DB.prepare('SELECT * FROM customer_sites WHERE customer_id = ? ORDER BY created_at DESC').bind(id).all(),
      c.env.DB.prepare(`SELECT u.* FROM air_units u JOIN customer_sites s ON s.id = u.site_id
        WHERE s.customer_id = ? ORDER BY u.created_at DESC`).bind(id).all(),
      c.env.DB.prepare(`SELECT id, job_no, title, status, scheduled_at, total_satang
        FROM jobs WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20`).bind(id).all(),
    ]);
    return c.json({ customer, sites: sites.results, units: units.results, jobs: jobs.results });
  });

  app.patch('/api/customers/:id', requireOffice, async (c) => {
    const body = customerSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'กรุณาตรวจชื่อและเบอร์โทรลูกค้า' }, 400);
    const id = c.req.param('id') ?? '';
    const result = await c.env.DB.prepare(`UPDATE customers SET kind = ?, name = ?, phone = ?, email = ?, note = ?,
      active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(body.data.kind, body.data.name,
      body.data.phone, body.data.email || null, body.data.note || null, body.data.active === false ? 0 : 1, id).run();
    if (!result.meta.changes) return c.json({ error: 'ไม่พบลูกค้า' }, 404);
    await audit(c, 'updated', 'customer', id);
    return c.json({ ok: true });
  });

  app.post('/api/customers/:id/sites', requireOffice, async (c) => {
    const body = siteSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'กรุณาตรวจชื่อสถานที่และที่อยู่' }, 400);
    const customerId = c.req.param('id') ?? '';
    const customer = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ? AND active = 1').bind(customerId).first();
    if (!customer) return c.json({ error: 'ไม่พบลูกค้าที่ใช้งานได้' }, 404);
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO customer_sites (id, customer_id, label, address, province, contact_name, contact_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, customerId, body.data.label, body.data.address,
      body.data.province || null, body.data.contact_name || null, body.data.contact_phone || null).run();
    await audit(c, 'created', 'site', id);
    return c.json({ id }, 201);
  });

  app.patch('/api/sites/:id', requireOffice, async (c) => {
    const body = siteSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'กรุณาตรวจชื่อสถานที่และที่อยู่' }, 400);
    const id = c.req.param('id') ?? '';
    const result = await c.env.DB.prepare(`UPDATE customer_sites SET label = ?, address = ?, province = ?,
      contact_name = ?, contact_phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(body.data.label, body.data.address, body.data.province || null,
        body.data.contact_name || null, body.data.contact_phone || null, id).run();
    if (!result.meta.changes) return c.json({ error: 'ไม่พบสถานที่' }, 404);
    await audit(c, 'updated', 'site', id);
    return c.json({ ok: true });
  });

  app.post('/api/sites/:id/units', requireOffice, async (c) => {
    const body = unitSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'ข้อมูลเครื่องแอร์ไม่ถูกต้อง' }, 400);
    const siteId = c.req.param('id') ?? '';
    const site = await c.env.DB.prepare('SELECT id FROM customer_sites WHERE id = ?').bind(siteId).first();
    if (!site) return c.json({ error: 'ไม่พบสถานที่' }, 404);
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO air_units (id, site_id, label, brand, model, btu, serial_number, installed_on, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, siteId, body.data.label, body.data.brand || null,
      body.data.model || null, body.data.btu ?? null, body.data.serial_number || null,
      body.data.installed_on || null, body.data.note || null).run();
    await audit(c, 'created', 'air_unit', id);
    return c.json({ id }, 201);
  });

  app.patch('/api/units/:id', requireOffice, async (c) => {
    const body = unitSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'ข้อมูลเครื่องแอร์ไม่ถูกต้อง' }, 400);
    const id = c.req.param('id') ?? '';
    const result = await c.env.DB.prepare(`UPDATE air_units SET label = ?, brand = ?, model = ?, btu = ?,
      serial_number = ?, installed_on = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(body.data.label, body.data.brand || null, body.data.model || null, body.data.btu ?? null,
        body.data.serial_number || null, body.data.installed_on || null, body.data.note || null, id).run();
    if (!result.meta.changes) return c.json({ error: 'ไม่พบเครื่องแอร์' }, 404);
    await audit(c, 'updated', 'air_unit', id);
    return c.json({ ok: true });
  });
}
