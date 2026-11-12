import type { Hono } from 'hono';
import { z } from 'zod';
import { requireOffice, type AppContext } from '../auth';

export function registerReportRoutes(app: Hono<AppContext>): void {
  app.get('/api/reports/summary', requireOffice, async (c) => {
    const parsed = z.object({ from: z.iso.date(), to: z.iso.date() }).safeParse({
      from: c.req.query('from'), to: c.req.query('to'),
    });
    if (!parsed.success || parsed.data.from > parsed.data.to) return c.json({ error: 'ช่วงวันที่ไม่ถูกต้อง' }, 400);
    const { from, to } = parsed.data;
    const [statusRows, categoryRows, dailyRows, customerCount, repeatCount, upcoming, technicians] = await Promise.all([
      c.env.DB.prepare(`SELECT status, COUNT(*) AS count FROM jobs
        WHERE date(created_at, '+7 hours') BETWEEN ? AND ? GROUP BY status`).bind(from, to).all(),
      c.env.DB.prepare(`SELECT sc.category, COUNT(*) AS count FROM job_services js
        JOIN jobs j ON j.id = js.job_id JOIN service_catalog sc ON sc.id = js.service_id
        WHERE j.status <> 'cancelled' AND date(j.created_at, '+7 hours') BETWEEN ? AND ?
        GROUP BY sc.category ORDER BY count DESC`).bind(from, to).all(),
      c.env.DB.prepare(`SELECT date(created_at, '+7 hours') AS day, COUNT(*) AS count
        FROM jobs WHERE date(created_at, '+7 hours') BETWEEN ? AND ?
        GROUP BY day ORDER BY day`).bind(from, to).all(),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM customers
        WHERE date(created_at, '+7 hours') BETWEEN ? AND ?`).bind(from, to).first<{ count: number }>(),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM (
        SELECT customer_id FROM jobs WHERE status = 'completed'
        GROUP BY customer_id HAVING COUNT(*) >= 2)`).first<{ count: number }>(),
      c.env.DB.prepare(`SELECT j.id, j.job_no, j.title, j.scheduled_at, cu.name AS customer_name,
        u.name AS technician_name FROM jobs j JOIN customers cu ON cu.id = j.customer_id
        LEFT JOIN users u ON u.id = j.technician_id
        WHERE j.status IN ('new', 'scheduled', 'in_progress') AND j.scheduled_at IS NOT NULL
        AND datetime(j.scheduled_at) >= datetime('now')
        ORDER BY j.scheduled_at LIMIT 8`).all(),
      c.env.DB.prepare(`SELECT u.name, COUNT(*) AS count FROM jobs j JOIN users u ON u.id = j.technician_id
        WHERE j.status <> 'cancelled' AND date(j.created_at, '+7 hours') BETWEEN ? AND ?
        GROUP BY u.id, u.name ORDER BY count DESC LIMIT 10`).bind(from, to).all(),
    ]);
    return c.json({
      from, to,
      byStatus: statusRows.results,
      byCategory: categoryRows.results,
      byDay: dailyRows.results,
      newCustomers: customerCount?.count ?? 0,
      repeatCustomers: repeatCount?.count ?? 0,
      upcoming: upcoming.results,
      technicians: technicians.results,
    });
  });
}
