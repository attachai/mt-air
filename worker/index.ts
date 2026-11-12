import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { authenticate, type AppContext } from './auth';
import { registerAuthRoutes } from './routes/auth';
import { registerCustomerRoutes } from './routes/customers';
import { registerServiceRoutes } from './routes/services';
import { registerJobRoutes } from './routes/jobs';
import { registerFileRoutes } from './routes/files';
import { registerReportRoutes } from './routes/reports';

const app = new Hono<AppContext>();

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],
  },
}));

app.use('/api/*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    if (!origin || origin !== new URL(c.req.url).origin) {
      return c.json({ error: 'คำขอไม่ผ่านการตรวจสอบต้นทาง' }, 403);
    }
  }
  await next();
});
app.use('/api/*', authenticate);

app.get('/api/health', (c) => c.json({ ok: true, service: 'mt-air' }));
registerAuthRoutes(app);
registerCustomerRoutes(app);
registerServiceRoutes(app);
registerJobRoutes(app);
registerFileRoutes(app);
registerReportRoutes(app);

app.notFound((c) => c.req.path.startsWith('/api/')
  ? c.json({ error: 'ไม่พบ API ที่เรียก' }, 404)
  : new Response(null, { status: 404 }));
app.onError((error, c) => {
  console.error('API error', error);
  return c.json({ error: 'ระบบขัดข้อง กรุณาลองอีกครั้ง' }, 500);
});

export default app;
