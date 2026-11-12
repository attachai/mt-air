import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const base = process.env.SMOKE_BASE || 'http://127.0.0.1:5173';
const origin = new URL(base).origin;
const secret = readFileSync('.dev.vars', 'utf8').match(/^SETUP_KEY=(.+)$/m)?.[1];
if (!secret) throw new Error('Missing local SETUP_KEY');
const password = `Local-${randomBytes(12).toString('hex')}!`;
const credentialsPath = 'smoke.local.json';
let credentials = existsSync(credentialsPath) ? JSON.parse(readFileSync(credentialsPath, 'utf8')) : null;

async function request(path, { method = 'GET', body, cookie, expected = 200 } = {}) {
  const headers = { Origin: origin };
  if (cookie) headers.Cookie = cookie;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}/api${path}`, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (response.status !== expected) throw new Error(`${method} ${path}: expected ${expected}, got ${response.status} ${JSON.stringify(data)}`);
  return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

const health = await request('/health');
if (!health.data.ok) throw new Error('Health failed');
const setup = await request('/setup/status');
if (setup.data.needsSetup) {
  credentials = { email: 'admin@mt-air.local', password };
  await request('/setup', { method: 'POST', body: { name: 'ผู้ดูแลระบบทดสอบ', ...credentials, setupKey: secret }, expected: 201 });
  writeFileSync(credentialsPath, JSON.stringify(credentials));
}
if (!credentials) throw new Error('Local admin exists but smoke credentials were not saved');
const login = await request('/auth/login', { method: 'POST', body: credentials });
const cookie = login.cookie;
if (!cookie) throw new Error('Login did not set cookie');
await request('/auth/me', { cookie });
await request('/customers', { expected: 401 });

const suffix = randomBytes(3).toString('hex');
const service = await request('/services', { method: 'POST', cookie, expected: 201,
  body: { name: `ล้างแอร์ทดสอบ ${suffix}`, category: 'clean', base_price_satang: 65000 } });
const customer = await request('/customers', { method: 'POST', cookie, expected: 201,
  body: { kind: 'person', name: `ลูกค้าทดสอบ ${suffix}`, phone: '0812345678', email: '', note: '' } });
const site = await request(`/customers/${customer.data.id}/sites`, { method: 'POST', cookie, expected: 201,
  body: { label: 'บ้าน', address: '99/9 ถนนตัวอย่าง อำเภอเมือง จังหวัดกรุงเทพฯ', province: 'กรุงเทพฯ' } });
const unit = await request(`/sites/${site.data.id}/units`, { method: 'POST', cookie, expected: 201,
  body: { label: 'ห้องนอน', brand: 'Test', model: 'A1', btu: 12000 } });
const job = await request('/jobs', { method: 'POST', cookie, expected: 201,
  body: { customer_id: customer.data.id, site_id: site.data.id, title: 'ล้างแอร์ห้องนอน',
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), technician_id: null,
    items: [{ service_id: service.data.id, unit_id: unit.data.id, quantity: 1, unit_price_satang: 65000 }] } });
const detail = await request(`/jobs/${job.data.id}`, { cookie });
if (detail.data.job.total_satang !== 65000 || detail.data.services.length !== 1) throw new Error('Job details mismatch');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lHsAAAAASUVORK5CYII=', 'base64');
const form = new FormData();
form.append('kind', 'before');
form.append('file', new File([png], 'before.png', { type: 'image/png' }));
const uploaded = await request(`/jobs/${job.data.id}/files`, { method: 'POST', cookie, body: form, expected: 201 });
const fileResponse = await fetch(`${base}/api/files/${uploaded.data.id}`, { headers: { Cookie: cookie } });
if (fileResponse.status !== 200 || fileResponse.headers.get('content-type') !== 'image/png') throw new Error('File retrieval failed');
await request(`/files/${uploaded.data.id}`, { expected: 401 });

const today = new Date().toISOString().slice(0, 10);
const report = await request(`/reports/summary?from=${today.slice(0, 7)}-01&to=${today}`, { cookie });
if (!report.data.byCategory.some((item) => item.category === 'clean')) throw new Error('Report missing service');
await request('/auth/logout', { method: 'POST', cookie });
await request('/auth/me', { cookie, expected: 401 });
console.log('Smoke passed: setup/login, access control, customer/site/unit, service, job, R2 upload/read, report, logout');
