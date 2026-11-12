import type { Hono } from 'hono';
import { z } from 'zod';
import { audit, requireOffice, type AppContext } from '../auth';

const itemSchema = z.object({
  service_id: z.string().uuid(),
  unit_id: z.string().uuid().optional().nullable(),
  quantity: z.number().int().min(1).max(100),
  unit_price_satang: z.number().int().min(0).max(100_000_000),
  note: z.string().trim().max(1000).optional().nullable(),
});
const jobSchema = z.object({
  customer_id: z.string().uuid(),
  site_id: z.string().uuid(),
  technician_id: z.string().uuid().optional().nullable(),
  scheduled_at: z.iso.datetime().optional().nullable(),
  next_service_on: z.iso.date().optional().nullable(),
  title: z.string().trim().min(2).max(180),
  problem: z.string().trim().max(3000).optional().nullable(),
  work_note: z.string().trim().max(5000).optional().nullable(),
  items: z.array(itemSchema).min(1).max(30),
});
const statuses = ['new', 'scheduled', 'in_progress', 'completed', 'cancelled'] as const;

async function validateRelations(db: D1Database, data: z.infer<typeof jobSchema>, existing = false): Promise<string | null> {
  const customer = await db.prepare('SELECT id FROM customers WHERE id = ? AND active = 1').bind(data.customer_id).first();
  if (!customer) return 'ไม่พบลูกค้าที่ใช้งานได้';
  const site = await db.prepare('SELECT id FROM customer_sites WHERE id = ? AND customer_id = ?')
    .bind(data.site_id, data.customer_id).first();
  if (!site) return 'สถานที่ไม่ตรงกับลูกค้า';
  if (data.technician_id) {
    const technician = await db.prepare(`SELECT id FROM users WHERE id = ? AND active = 1
      AND role IN ('technician', 'staff', 'admin')`).bind(data.technician_id).first();
    if (!technician) return 'ไม่พบช่างที่ใช้งานได้';
  }
  for (const item of data.items) {
    const service = await db.prepare(`SELECT id FROM service_catalog WHERE id = ? ${existing ? '' : 'AND active = 1'}`)
      .bind(item.service_id).first();
    if (!service) return 'ไม่พบบริการที่เลือก';
    if (item.unit_id) {
      const unit = await db.prepare('SELECT id FROM air_units WHERE id = ? AND site_id = ?')
        .bind(item.unit_id, data.site_id).first();
      if (!unit) return 'เครื่องแอร์ไม่ตรงกับสถานที่';
    }
  }
  return null;
}

function total(items: z.infer<typeof itemSchema>[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unit_price_satang, 0);
}

export function registerJobRoutes(app: Hono<AppContext>): void {
  app.get('/api/jobs', async (c) => {
    const q = (c.req.query('q') ?? '').trim().slice(0, 100);
    const status = c.req.query('status') ?? '';
    const page = Math.max(1, Math.min(10000, Number(c.req.query('page')) || 1));
    if (status && !statuses.includes(status as typeof statuses[number])) return c.json({ error: 'สถานะไม่ถูกต้อง' }, 400);
    const filters: string[] = [];
    const args: (string | number)[] = [];
    if (c.get('user').role === 'technician') {
      filters.push('j.technician_id = ?');
      args.push(c.get('user').id);
    }
    if (status) { filters.push('j.status = ?'); args.push(status); }
    if (q) {
      filters.push('(j.job_no LIKE ? OR j.title LIKE ? OR cu.name LIKE ? OR cu.phone LIKE ?)');
      args.push(...Array(4).fill(`%${q}%`));
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const from = 'FROM jobs j JOIN customers cu ON cu.id = j.customer_id JOIN customer_sites s ON s.id = j.site_id LEFT JOIN users u ON u.id = j.technician_id';
    const [items, count] = await Promise.all([
      c.env.DB.prepare(`SELECT j.*, cu.name AS customer_name, cu.phone AS customer_phone,
        s.label AS site_label, s.address AS site_address, u.name AS technician_name
        ${from} ${where} ORDER BY COALESCE(j.scheduled_at, j.created_at) DESC LIMIT 20 OFFSET ?`)
        .bind(...args, (page - 1) * 20).all(),
      c.env.DB.prepare(`SELECT COUNT(*) AS count ${from} ${where}`).bind(...args).first<{ count: number }>(),
    ]);
    return c.json({ items: items.results, total: count?.count ?? 0, page });
  });

  app.post('/api/jobs', requireOffice, async (c) => {
    const body = jobSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'กรุณาตรวจข้อมูลลูกค้า สถานที่ และรายการบริการ' }, 400);
    const relationError = await validateRelations(c.env.DB, body.data);
    if (relationError) return c.json({ error: relationError }, 400);
    const amount = total(body.data.items);
    if (!Number.isSafeInteger(amount) || amount > 1_000_000_000) return c.json({ error: 'ยอดรวมสูงเกินกำหนด' }, 400);
    const id = crypto.randomUUID();
    const jobNo = `MT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${id.slice(0, 6).toUpperCase()}`;
    const statements = [
      c.env.DB.prepare(`INSERT INTO jobs (id, job_no, customer_id, site_id, technician_id, scheduled_at,
        next_service_on, status, title, problem, work_note, total_satang, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, jobNo, body.data.customer_id,
        body.data.site_id, body.data.technician_id || null, body.data.scheduled_at || null,
        body.data.next_service_on || null, body.data.scheduled_at ? 'scheduled' : 'new', body.data.title,
        body.data.problem || null, body.data.work_note || null, amount, c.get('user').id),
    ];
    for (const item of body.data.items) {
      const service = await c.env.DB.prepare('SELECT name FROM service_catalog WHERE id = ?').bind(item.service_id)
        .first<{ name: string }>();
      statements.push(c.env.DB.prepare(`INSERT INTO job_services
        (id, job_id, service_id, unit_id, service_name, quantity, unit_price_satang, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), id, item.service_id,
          item.unit_id || null, service!.name, item.quantity, item.unit_price_satang, item.note || null));
    }
    await c.env.DB.batch(statements);
    await audit(c, 'created', 'job', id);
    return c.json({ id, job_no: jobNo }, 201);
  });

  app.get('/api/jobs/:id', async (c) => {
    const id = c.req.param('id') ?? '';
    const job = await c.env.DB.prepare(`SELECT j.*, cu.name AS customer_name, cu.phone AS customer_phone,
      s.label AS site_label, s.address AS site_address, u.name AS technician_name
      FROM jobs j JOIN customers cu ON cu.id = j.customer_id
      JOIN customer_sites s ON s.id = j.site_id LEFT JOIN users u ON u.id = j.technician_id WHERE j.id = ?`)
      .bind(id).first<Record<string, unknown>>();
    if (!job) return c.json({ error: 'ไม่พบงานบริการ' }, 404);
    if (c.get('user').role === 'technician' && job.technician_id !== c.get('user').id) {
      return c.json({ error: 'ไม่มีสิทธิ์ดูงานนี้' }, 403);
    }
    const [services, files] = await Promise.all([
      c.env.DB.prepare(`SELECT js.*, u.label AS unit_label FROM job_services js
        LEFT JOIN air_units u ON u.id = js.unit_id WHERE js.job_id = ?`).bind(id).all(),
      c.env.DB.prepare(`SELECT id, job_id, kind, original_name, mime_type, size_bytes, created_at
        FROM attachments WHERE job_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`).bind(id).all(),
    ]);
    return c.json({ job, services: services.results, files: files.results });
  });

  app.patch('/api/jobs/:id', requireOffice, async (c) => {
    const body = jobSchema.extend({ status: z.enum(statuses) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'ข้อมูลบริการไม่ถูกต้อง' }, 400);
    const id = c.req.param('id') ?? '';
    const current = await c.env.DB.prepare('SELECT status, customer_id, site_id FROM jobs WHERE id = ?')
      .bind(id).first<{ status: string; customer_id: string; site_id: string }>();
    if (!current) return c.json({ error: 'ไม่พบงานบริการ' }, 404);
    if (current.customer_id !== body.data.customer_id || current.site_id !== body.data.site_id) {
      return c.json({ error: 'ไม่สามารถย้ายงานไปยังลูกค้าหรือสถานที่อื่นได้' }, 400);
    }
    if (current.status === 'completed' || current.status === 'cancelled') {
      return c.json({ error: 'งานที่ปิดแล้วแก้ไขไม่ได้' }, 400);
    }
    const relationError = await validateRelations(c.env.DB, body.data, true);
    if (relationError) return c.json({ error: relationError }, 400);
    const amount = total(body.data.items);
    if (!Number.isSafeInteger(amount) || amount > 1_000_000_000) return c.json({ error: 'ยอดรวมสูงเกินกำหนด' }, 400);
    const statements = [
      c.env.DB.prepare(`UPDATE jobs SET customer_id = ?, site_id = ?, technician_id = ?, scheduled_at = ?,
        next_service_on = ?, status = ?, title = ?, problem = ?, work_note = ?, total_satang = ?,
        completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(body.data.customer_id, body.data.site_id,
          body.data.technician_id || null, body.data.scheduled_at || null, body.data.next_service_on || null,
          body.data.status, body.data.title, body.data.problem || null, body.data.work_note || null, amount,
          body.data.status, id),
      c.env.DB.prepare('DELETE FROM job_services WHERE job_id = ?').bind(id),
    ];
    for (const item of body.data.items) {
      const service = await c.env.DB.prepare('SELECT name FROM service_catalog WHERE id = ?').bind(item.service_id)
        .first<{ name: string }>();
      statements.push(c.env.DB.prepare(`INSERT INTO job_services
        (id, job_id, service_id, unit_id, service_name, quantity, unit_price_satang, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), id, item.service_id,
          item.unit_id || null, service!.name, item.quantity, item.unit_price_satang, item.note || null));
    }
    await c.env.DB.batch(statements);
    await audit(c, `updated:${current.status}->${body.data.status}`, 'job', id);
    return c.json({ ok: true });
  });

  app.patch('/api/jobs/:id/progress', async (c) => {
    const body = z.object({ status: z.enum(['in_progress', 'completed']), work_note: z.string().trim().max(5000) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'ข้อมูลความคืบหน้าไม่ถูกต้อง' }, 400);
    const id = c.req.param('id') ?? '';
    const job = await c.env.DB.prepare('SELECT technician_id, status FROM jobs WHERE id = ?').bind(id)
      .first<{ technician_id: string | null; status: string }>();
    if (!job) return c.json({ error: 'ไม่พบงานบริการ' }, 404);
    if (c.get('user').role === 'technician' && job.technician_id !== c.get('user').id) {
      return c.json({ error: 'ไม่มีสิทธิ์แก้งานนี้' }, 403);
    }
    if (!['scheduled', 'in_progress'].includes(job.status)) return c.json({ error: 'สถานะงานไม่อนุญาต' }, 400);
    if (job.status === 'scheduled' && body.data.status === 'completed') return c.json({ error: 'กรุณาเริ่มงานก่อนปิดงาน' }, 400);
    await c.env.DB.prepare(`UPDATE jobs SET status = ?, work_note = ?,
      completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(body.data.status, body.data.work_note, body.data.status, id).run();
    await audit(c, `progress:${body.data.status}`, 'job', id);
    return c.json({ ok: true });
  });
}
