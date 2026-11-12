import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AirVent, BarChart3, BriefcaseBusiness, ChevronDown, ClipboardList, Gauge, LogOut, Menu, Settings, Users, X } from 'lucide-react';
import { api } from './api';
import { Field, Loading, Notice } from './components';
import type { User } from './types';
import { DashboardPage, ReportsPage } from './pages/Reports';
import { CustomerDetailPage, CustomerFormPage, CustomersPage } from './pages/Customers';
import { JobDetailPage, JobFormPage, JobsPage } from './pages/Jobs';
import { ServicesPage } from './pages/Services';
import { AccountPage, UsersPage } from './pages/Users';

interface AuthState { user: User | null; refresh: () => Promise<void>; setUser: (user: User | null) => void }
const AuthContext = createContext<AuthState | null>(null);
export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthContext missing');
  return value;
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    try { const result = await api<{ user: User }>('/auth/me'); setUser(result.user); }
    catch { setUser(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  return <AuthContext.Provider value={{ user, refresh, setUser }}>
    {loading ? <div className="boot-screen"><AirVent size={32} /><Loading /></div> : children}
  </AuthContext.Provider>;
}

function LoginPage() {
  const { user, setUser } = useAuth();
  const [setup, setSetup] = useState<{ needsSetup: boolean; setupAvailable: boolean } | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ needsSetup: boolean; setupAvailable: boolean }>('/setup/status').then(setSetup).catch(() => setError('เชื่อมต่อระบบไม่ได้')); }, []);
  if (user) return <Navigate to={user.role === 'technician' ? '/jobs' : '/dashboard'} replace />;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api<{ user: User }>(setup?.needsSetup ? '/setup' : '/auth/login', {
        method: 'POST', body: JSON.stringify(setup?.needsSetup ? { name, email, password, setupKey } : { email, password }),
      });
      setUser(result.user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'เข้าสู่ระบบไม่ได้'); }
    finally { setBusy(false); }
  }
  return <div className="login-page">
    <div className="login-brand"><div className="brand-symbol"><AirVent size={32} /></div><span>MT AIR</span></div>
    <div className="login-layout">
      <section className="login-story"><div className="story-rule" /><h1>งานบริการทุกครั้ง<br />ต่อกันเป็นประวัติเดียว</h1>
        <p>ข้อมูลลูกค้า เครื่องแอร์ นัดหมาย และเอกสารอยู่ในที่เดียว พร้อมใช้เมื่อลูกค้ากลับมาอีกครั้ง</p>
        <div className="story-mark"><span>ลูกค้า</span><span>สถานที่</span><span>งานบริการ</span><span>ประวัติ</span></div>
      </section>
      <section className="login-panel"><div className="login-card">
        <h2>{setup?.needsSetup ? 'ตั้งค่าผู้ดูแลระบบ' : 'เข้าสู่ระบบ'}</h2>
        <p>{setup?.needsSetup ? 'สร้างบัญชีผู้ดูแลระบบคนแรกสำหรับทีมงาน' : 'สำหรับพนักงานและช่างของ MT Air'}</p>
        {error && <Notice message={error} />}
        {setup?.needsSetup && !setup.setupAvailable && <Notice kind="info" message="ระบบยังไม่มีรหัสตั้งค่า กรุณาตั้งค่า SETUP_KEY ใน Cloudflare ก่อน" />}
        {setup && <form onSubmit={submit} className="form-stack">
          {setup.needsSetup && <Field label="ชื่อผู้ดูแลระบบ" required><input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" /></Field>}
          <Field label="อีเมล" required><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></Field>
          <Field label="รหัสผ่าน" required><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={setup.needsSetup ? 12 : undefined} autoComplete={setup.needsSetup ? 'new-password' : 'current-password'} /></Field>
          {setup.needsSetup && <Field label="รหัสตั้งค่า" hint="รหัสนี้ตั้งไว้ใน Cloudflare และใช้สร้างบัญชีคนแรกเท่านั้น" required><input type="password" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} required autoComplete="off" /></Field>}
          <button className="button button-primary button-block" disabled={busy || (setup.needsSetup && !setup.setupAvailable)}>{busy ? 'กำลังดำเนินการ…' : setup.needsSetup ? 'สร้างผู้ดูแลระบบ' : 'เข้าสู่ระบบ'}</button>
        </form>}
      </div></section>
    </div>
  </div>;
}

const navMain = [
  { to: '/dashboard', label: 'ภาพรวม', icon: Gauge },
  { to: '/customers', label: 'ลูกค้า', icon: Users },
  { to: '/jobs', label: 'งานบริการ', icon: ClipboardList },
  { to: '/services', label: 'ประเภทบริการ', icon: BriefcaseBusiness },
  { to: '/reports', label: 'รายงาน', icon: BarChart3 },
];

function Shell({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const navigate = useNavigate();
  if (!user) return <Navigate to="/login" replace />;
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } finally { setUser(null); navigate('/login'); }
  }
  const links = user.role === 'technician' ? navMain.filter((item) => item.to === '/jobs') : navMain;
  return <div className="app-shell">
    {mobileOpen && <button className="mobile-scrim" aria-label="ปิดเมนู" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><div className="brand-symbol"><AirVent size={24} /></div><div><strong>MT AIR</strong><small>ระบบดูแลลูกค้า</small></div><button className="icon-button close-menu" aria-label="ปิดเมนู" onClick={() => setMobileOpen(false)}><X size={20} /></button></div>
      <nav aria-label="เมนูหลัก" className="sidebar-nav"><span className="nav-label">จัดการงาน</span>
        {links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={19} strokeWidth={1.8} /><span>{label}</span></NavLink>)}
        {user.role === 'admin' && <><span className="nav-label nav-label-lower">ระบบ</span><NavLink to="/users" onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Settings size={19} strokeWidth={1.8} /><span>พนักงานและสิทธิ์</span></NavLink></>}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><strong>ข้อมูลครบทุกหน้างาน</strong><p>เปิดประวัติลูกค้าและไฟล์บริการได้ทันทีที่ต้องใช้</p></div><span>MT Air · Customer Care</span></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><button className="icon-button menu-toggle" aria-label="เปิดเมนู" onClick={() => setMobileOpen(true)}><Menu size={22} /></button>
        <Link className="topbar-title" to={user.role === 'technician' ? '/jobs' : '/dashboard'}>ระบบจัดการงานบริการแอร์</Link>
        <div className="topbar-right"><span className="topbar-role">{user.role === 'admin' ? 'ผู้ดูแลระบบ' : user.role === 'staff' ? 'พนักงาน' : 'ช่าง'}</span>
          <div className="account-menu"><button className="account-button" onClick={() => setAccountOpen(!accountOpen)} aria-expanded={accountOpen}><span className="avatar">{user.name.slice(0, 1)}</span><span className="account-name">{user.name}</span><ChevronDown size={15} /></button>
            {accountOpen && <div className="account-popover"><Link to="/account" onClick={() => setAccountOpen(false)}>บัญชีของฉัน</Link><button onClick={logout}><LogOut size={16} /> ออกจากระบบ</button></div>}
          </div>
        </div></header>
      <main className="content">{children}</main>
    </div>
  </div>;
}

function Protected({ children, office = false, admin = false }: { children: ReactNode; office?: boolean; admin?: boolean }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/jobs" replace />;
  if (office && user.role === 'technician') return <Navigate to="/jobs" replace />;
  return <Shell>{children}</Shell>;
}

function AppRoutes() {
  const { user } = useAuth();
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/dashboard" element={<Protected office><DashboardPage /></Protected>} />
    <Route path="/customers" element={<Protected office><CustomersPage /></Protected>} />
    <Route path="/customers/new" element={<Protected office><CustomerFormPage /></Protected>} />
    <Route path="/customers/:id/edit" element={<Protected office><CustomerFormPage /></Protected>} />
    <Route path="/customers/:id" element={<Protected office><CustomerDetailPage /></Protected>} />
    <Route path="/jobs" element={<Protected><JobsPage /></Protected>} />
    <Route path="/jobs/new" element={<Protected office><JobFormPage /></Protected>} />
    <Route path="/jobs/:id/edit" element={<Protected office><JobFormPage /></Protected>} />
    <Route path="/jobs/:id" element={<Protected><JobDetailPage /></Protected>} />
    <Route path="/services" element={<Protected office><ServicesPage /></Protected>} />
    <Route path="/reports" element={<Protected office><ReportsPage /></Protected>} />
    <Route path="/users" element={<Protected admin><UsersPage /></Protected>} />
    <Route path="/account" element={<Protected><AccountPage /></Protected>} />
    <Route path="*" element={<Navigate to={user?.role === 'technician' ? '/jobs' : user ? '/dashboard' : '/login'} replace />} />
  </Routes>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>;
}
