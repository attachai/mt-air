import type { Hono } from 'hono';
import { audit, requireOffice, type AppContext } from '../auth';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const kinds = ['before', 'after', 'quotation', 'service', 'other'];

function sniff(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

async function jobAccessible(db: D1Database, jobId: string, userId: string, role: string): Promise<boolean> {
  const job = await db.prepare('SELECT technician_id FROM jobs WHERE id = ?').bind(jobId)
    .first<{ technician_id: string | null }>();
  return Boolean(job && (role !== 'technician' || job.technician_id === userId));
}

export function registerFileRoutes(app: Hono<AppContext>): void {
  app.post('/api/jobs/:id/files', async (c) => {
    if (!c.env.FILES) return c.json({ error: 'ระบบไฟล์ยังไม่พร้อมใช้งาน' }, 503);
    const jobId = c.req.param('id') ?? '';
    const user = c.get('user');
    if (!(await jobAccessible(c.env.DB, jobId, user.id, user.role))) return c.json({ error: 'ไม่พบงานหรือไม่มีสิทธิ์' }, 404);
    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    const kind = form?.get('kind');
    if (!(file instanceof File) || typeof kind !== 'string' || !kinds.includes(kind)) {
      return c.json({ error: 'กรุณาเลือกไฟล์และประเภทเอกสาร' }, 400);
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) return c.json({ error: 'ไฟล์ต้องมีขนาดไม่เกิน 10 MB' }, 400);
    const mime = sniff(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
    if (!mime) return c.json({ error: 'รองรับเฉพาะ PDF, JPG, PNG และ WebP' }, 400);
    const id = crypto.randomUUID();
    const extension = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
    const key = `jobs/${jobId}/${id}.${extension}`;
    await c.env.FILES.put(key, file.stream(), { httpMetadata: { contentType: mime } });
    try {
      await c.env.DB.prepare(`INSERT INTO attachments
        (id, job_id, kind, r2_key, original_name, mime_type, size_bytes, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, jobId, kind, key, file.name.slice(0, 255), mime,
          file.size, user.id).run();
    } catch (error) {
      await c.env.FILES.delete(key);
      throw error;
    }
    await audit(c, 'uploaded', 'attachment', id);
    return c.json({ id }, 201);
  });

  app.get('/api/files/:id', async (c) => {
    if (!c.env.FILES) return c.json({ error: 'ระบบไฟล์ยังไม่พร้อมใช้งาน' }, 503);
    const file = await c.env.DB.prepare(`SELECT a.*, j.technician_id FROM attachments a
      JOIN jobs j ON j.id = a.job_id WHERE a.id = ? AND a.deleted_at IS NULL`)
      .bind(c.req.param('id') ?? '').first<{ r2_key: string; mime_type: string; original_name: string; technician_id: string | null }>();
    if (!file) return c.json({ error: 'ไม่พบไฟล์' }, 404);
    if (c.get('user').role === 'technician' && file.technician_id !== c.get('user').id) {
      return c.json({ error: 'ไม่มีสิทธิ์ดูไฟล์' }, 403);
    }
    const object = await c.env.FILES.get(file.r2_key);
    if (!object) return c.json({ error: 'ไม่พบไฟล์ในคลัง' }, 404);
    const safeName = file.original_name.replace(/[\r\n"\\]/g, '_');
    const fallbackName = `attachment.${file.mime_type === 'application/pdf' ? 'pdf' : file.mime_type.split('/')[1]}`;
    return new Response(object.body, {
      headers: {
        'Content-Type': file.mime_type,
        'Content-Disposition': `inline; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        'Content-Length': String(object.size),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': 'sandbox',
      },
    });
  });

  app.delete('/api/files/:id', requireOffice, async (c) => {
    if (!c.env.FILES) return c.json({ error: 'ระบบไฟล์ยังไม่พร้อมใช้งาน' }, 503);
    const id = c.req.param('id') ?? '';
    const file = await c.env.DB.prepare('SELECT r2_key FROM attachments WHERE id = ? AND deleted_at IS NULL')
      .bind(id).first<{ r2_key: string }>();
    if (!file) return c.json({ error: 'ไม่พบไฟล์' }, 404);
    await c.env.DB.prepare('UPDATE attachments SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();
    await audit(c, 'deleted', 'attachment', id);
    await c.env.FILES.delete(file.r2_key);
    return c.json({ ok: true });
  });
}
