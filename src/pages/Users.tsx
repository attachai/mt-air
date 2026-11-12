import { useEffect, useState, type FormEvent } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { EmptyState, Field, Loading, Notice, PageHeader } from '../components';
import { useAuth } from '../App';
import type { Role, User } from '../types';

const roleLabels = { admin: 'ผู้ดูแลระบบ', staff: 'พนักงาน', technician: 'ช่าง' } as const;
const blank = { name: '', email: '', password: '', role: 'staff' as Role };

export function UsersPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<User[] | null>(null);
  const [form, setForm] = useState(blank); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  async function load() { const result = await api<{ items: User[] }>('/users'); setItems(result.items); }
  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'โหลดพนักงานไม่ได้')); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try { await api('/users', { method: 'POST', body: JSON.stringify(form) }); await load(); setForm(blank); setOpen(false); setSuccess('เพิ่มพนักงานแล้ว กรุณาส่งรหัสผ่านให้เจ้าของบัญชีผ่านช่องทางที่ปลอดภัย'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'เพิ่มพนักงานไม่ได้'); } finally { setBusy(false); }
  }
  async function changeUser(item: User, patch: Partial<User>) {
    setError(''); setSuccess('');
    try { await api(`/users/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name: patch.name ?? item.name, role: patch.role ?? item.role, active: patch.active === undefined ? Boolean(item.active) : Boolean(patch.active) }) });
      await load(); setSuccess('อัปเดตบัญชีแล้ว'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'แก้ไขบัญชีไม่ได้'); }
  }
  return <>
    <PageHeader title="พนักงานและสิทธิ์" description="จัดการบัญชีผู้ดูแลระบบ พนักงาน และช่าง" action={<button className="button button-primary" onClick={() => setOpen(!open)}><Plus size={17} /> เพิ่มพนักงาน</button>} />
    {error && <Notice message={error} />}{success && <Notice kind="success" message={success} />}
    {open && <form className="surface form-surface section-spaced" onSubmit={submit}><h2>บัญชีพนักงานใหม่</h2><div className="form-grid"><Field label="ชื่อ" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} /></Field><Field label="อีเมล" required><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field><Field label="บทบาท" required><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{Object.entries(roleLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field><Field label="รหัสผ่านเริ่มต้น" required hint="อย่างน้อย 12 ตัว เจ้าของบัญชีเปลี่ยนภายหลังได้"><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={12} autoComplete="new-password" /></Field></div><div className="form-actions"><button type="button" className="button button-quiet" onClick={() => setOpen(false)}>ยกเลิก</button><button className="button button-primary" disabled={busy}>เพิ่มพนักงาน</button></div></form>}
    <section className="surface table-surface">{!items ? <Loading /> : items.length === 0 ? <EmptyState title="ยังไม่มีพนักงาน" detail="เพิ่มบัญชีให้ทีมเพื่อเริ่มมอบหมายงาน" /> : <div className="table-scroll"><table><thead><tr><th>พนักงาน</th><th>บทบาท</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.email}</small></td><td><select aria-label={`บทบาทของ ${item.name}`} value={item.role} disabled={item.id === user?.id} onChange={(e) => changeUser(item, { role: e.target.value as Role })}>{Object.entries(roleLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></td><td><span className={`quiet-status ${item.active ? 'is-active' : ''}`}>{item.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td><td><button className="button button-quiet button-small" disabled={item.id === user?.id} onClick={() => changeUser(item, { active: item.active ? 0 : 1 })}>{item.active ? 'ปิดบัญชี' : 'เปิดบัญชี'}</button></td></tr>)}</tbody></table></div>}</section>
  </>;
}

export function AccountPage() {
  const { user, setUser } = useAuth(); const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState(''); const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try { await api('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }); setUser(null); navigate('/login'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'เปลี่ยนรหัสผ่านไม่ได้'); } finally { setBusy(false); }
  }
  return <><PageHeader title="บัญชีของฉัน" description="ข้อมูลการเข้าใช้งานและรหัสผ่าน" /><div className="detail-grid"><section className="surface"><div className="account-heading"><ShieldCheck size={22} /><h2>ข้อมูลบัญชี</h2></div><dl className="detail-list"><div><dt>ชื่อ</dt><dd>{user?.name}</dd></div><div><dt>อีเมล</dt><dd>{user?.email}</dd></div><div><dt>บทบาท</dt><dd>{user ? roleLabels[user.role] : '—'}</dd></div></dl></section><form className="surface form-stack" onSubmit={submit}><h2>เปลี่ยนรหัสผ่าน</h2>{error && <Notice message={error} />}<Field label="รหัสผ่านปัจจุบัน" required><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" /></Field><Field label="รหัสผ่านใหม่" required hint="อย่างน้อย 12 ตัว เปลี่ยนแล้วต้องเข้าสู่ระบบอีกครั้ง"><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={12} autoComplete="new-password" /></Field><button className="button button-primary" disabled={busy}>บันทึกรหัสผ่านใหม่</button></form></div></>;
}
