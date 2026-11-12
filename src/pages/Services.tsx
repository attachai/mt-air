import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { api, categoryLabels, money } from '../api';
import { EmptyState, Field, Loading, Notice, PageHeader } from '../components';
import { useAuth } from '../App';
import type { Service, ServiceCategory } from '../types';

const blank = { name: '', category: 'clean' as ServiceCategory, price: '', active: true };

export function ServicesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Service[] | null>(null);
  const [form, setForm] = useState(blank); const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  async function load() { const data = await api<{ items: Service[] }>('/services'); setItems(data.items); }
  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'โหลดบริการไม่ได้')); }, []);
  function edit(item: Service) { setEditing(item.id); setForm({ name: item.name, category: item.category, price: String(item.base_price_satang / 100), active: Boolean(item.active) }); setOpen(true); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try { await api(editing ? `/services/${editing}` : '/services', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify({ name: form.name, category: form.category, base_price_satang: Math.round(Number(form.price || 0) * 100), active: form.active }) });
      await load(); setOpen(false); setEditing(null); setForm(blank); setSuccess('บันทึกประเภทบริการแล้ว');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'บันทึกไม่ได้'); } finally { setBusy(false); }
  }
  return <>
    <PageHeader title="ประเภทบริการ" description="กำหนดงานที่ทีมรับบริการและราคาเริ่มต้น" action={user?.role === 'admin' ? <button className="button button-primary" onClick={() => { setEditing(null); setForm(blank); setOpen(!open); }}><Plus size={17} /> เพิ่มบริการ</button> : undefined} />
    {error && <Notice message={error} />}{success && <Notice kind="success" message={success} />}
    {open && <form className="surface form-surface section-spaced" onSubmit={submit}><h2>{editing ? 'แก้ไขบริการ' : 'เพิ่มประเภทบริการ'}</h2><div className="form-grid"><Field label="ชื่อบริการ" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} placeholder="เช่น ล้างแอร์ผนัง" /></Field><Field label="หมวดหมู่" required><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ServiceCategory })}>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="ราคาเริ่มต้น (บาท)" required><input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></Field></div>{editing && <label className="check-row"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> เปิดให้เลือกในงานใหม่</label>}<div className="form-actions"><button type="button" className="button button-quiet" onClick={() => setOpen(false)}>ยกเลิก</button><button className="button button-primary" disabled={busy}>บันทึกบริการ</button></div></form>}
    <section className="surface table-surface">{!items ? <Loading /> : items.length === 0 ? <EmptyState title="ยังไม่มีประเภทบริการ" detail="เพิ่มงานติดตั้ง ล้าง ซ่อม หรือตรวจเช็กเพื่อใช้ในฟอร์มงาน" /> : <div className="table-scroll"><table><thead><tr><th>ชื่อบริการ</th><th>หมวดหมู่</th><th>ราคาเริ่มต้น</th><th>สถานะ</th>{user?.role === 'admin' && <th></th>}</tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{categoryLabels[item.category]}</td><td>{money(item.base_price_satang)}</td><td><span className={`quiet-status ${item.active ? 'is-active' : ''}`}>{item.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span></td>{user?.role === 'admin' && <td><button className="icon-button" onClick={() => edit(item)} aria-label={`แก้ไข ${item.name}`}><Pencil size={17} /></button></td>}</tr>)}</tbody></table></div>}</section>
    <p className="report-footnote">เมื่อสร้างงาน ระบบจะเก็บราคาของงานนั้นแยกไว้ การแก้ราคาเริ่มต้นไม่เปลี่ยนงานเก่า</p>
  </>;
}
