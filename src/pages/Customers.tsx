import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Building2, Fan, MapPin, Pencil, Phone, Plus, Search } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, dateTime, money } from '../api';
import { EmptyState, Field, Loading, Notice, PageHeader, Pagination, StatusBadge } from '../components';
import type { AirUnit, Customer, CustomerDetail, PageResult, Site } from '../types';

export function CustomersPage() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PageResult<Customer> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setError('');
    api<PageResult<Customer>>(`/customers?q=${encodeURIComponent(search)}&page=${page}`)
      .then((data) => { if (active) setResult(data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'โหลดข้อมูลลูกค้าไม่ได้'); });
    return () => { active = false; };
  }, [search, page]);
  return <>
    <PageHeader title="ลูกค้า" description="ข้อมูลติดต่อ สถานที่ และประวัติงานของลูกค้าแต่ละราย" action={<Link className="button button-primary" to="/customers/new"><Plus size={17} /> เพิ่มลูกค้า</Link>} />
    <section className="surface table-surface"><div className="table-toolbar"><form onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(query); }} className="search-form"><Search size={18} /><input aria-label="ค้นหาลูกค้า" placeholder="ค้นหาชื่อ เบอร์โทร หรืออีเมล" value={query} onChange={(e) => setQuery(e.target.value)} /><button type="submit">ค้นหา</button></form><span>{result?.total ?? 0} รายการ</span></div>
      {error && <Notice message={error} />}{!result ? <Loading /> : result.items.length === 0
        ? <EmptyState title={search ? 'ไม่พบลูกค้าที่ค้นหา' : 'เริ่มจากเพิ่มลูกค้าคนแรก'} detail={search ? 'ลองค้นด้วยชื่อหรือเบอร์โทรส่วนอื่น' : 'ข้อมูลลูกค้าจะเชื่อมกับสถานที่ เครื่องแอร์ และงานบริการ'} action={!search ? 'เพิ่มลูกค้า' : undefined} to="/customers/new" />
        : <><div className="table-scroll"><table><thead><tr><th>ลูกค้า</th><th>เบอร์โทร</th><th>ประเภท</th><th>งานบริการ</th><th>สถานะ</th><th><span className="sr-only">ดูรายละเอียด</span></th></tr></thead><tbody>{result.items.map((item) => <tr key={item.id}><td><Link className="table-primary" to={`/customers/${item.id}`}>{item.name}</Link><small>{item.email || 'ไม่มีอีเมล'}</small></td><td>{item.phone}</td><td>{item.kind === 'company' ? 'บริษัท' : 'บุคคล'}</td><td>{item.job_count ?? 0} งาน</td><td><span className={`quiet-status ${item.active ? 'is-active' : ''}`}>{item.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td><td><Link className="row-link" to={`/customers/${item.id}`} aria-label={`ดู ${item.name}`}><ArrowUpRight size={18} /></Link></td></tr>)}</tbody></table></div><Pagination page={page} total={result.total} onPageChange={setPage} /></>}
    </section>
  </>;
}

export function CustomerFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [kind, setKind] = useState<'person' | 'company'>('person');
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(''); const [note, setNote] = useState(''); const [active, setActive] = useState(true);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) return;
    api<CustomerDetail>(`/customers/${id}`).then(({ customer }) => {
      setKind(customer.kind); setName(customer.name); setPhone(customer.phone); setEmail(customer.email || '');
      setNote(customer.note || ''); setActive(Boolean(customer.active));
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'โหลดข้อมูลลูกค้าไม่ได้'));
  }, [id]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = await api<{ id: string }>(id ? `/customers/${id}` : '/customers', {
        method: id ? 'PATCH' : 'POST', body: JSON.stringify({ kind, name, phone, email, note, active }),
      });
      navigate(`/customers/${id || data.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'บันทึกลูกค้าไม่ได้'); }
    finally { setBusy(false); }
  }
  return <>
    <Link className="back-link" to={id ? `/customers/${id}` : '/customers'}><ArrowLeft size={16} /> กลับไปลูกค้า</Link>
    <PageHeader title={id ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้า'} description="บันทึกข้อมูลหลักก่อน แล้วเพิ่มสถานที่และเครื่องแอร์ในหน้ารายละเอียด" />
    <form className="surface form-surface" onSubmit={submit}>{error && <Notice message={error} />}
      <div className="form-grid"><Field label="ประเภทลูกค้า" required><select value={kind} onChange={(e) => setKind(e.target.value as 'person' | 'company')}><option value="person">บุคคล</option><option value="company">บริษัท</option></select></Field>
        <Field label={kind === 'company' ? 'ชื่อบริษัท' : 'ชื่อลูกค้า'} required><input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></Field>
        <Field label="เบอร์โทร" required><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={8} /></Field>
        <Field label="อีเมล"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      </div><Field label="หมายเหตุ"><textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ข้อมูลเพิ่มเติมที่ทีมควรรู้" /></Field>
      {id && <label className="check-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> เปิดใช้งานลูกค้ารายนี้</label>}
      <div className="form-actions"><Link className="button button-quiet" to={id ? `/customers/${id}` : '/customers'}>ยกเลิก</Link><button className="button button-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกลูกค้า'}</button></div>
    </form>
  </>;
}

const blankSite = { label: '', address: '', province: '', contact_name: '', contact_phone: '' };
const blankUnit = { label: '', brand: '', model: '', btu: '', serial_number: '', installed_on: '', note: '' };

export function CustomerDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState('');
  const [siteOpen, setSiteOpen] = useState(false); const [unitOpen, setUnitOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<string | null>(null); const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [siteForm, setSiteForm] = useState(blankSite); const [unitForm, setUnitForm] = useState(blankUnit);
  const [unitSite, setUnitSite] = useState(''); const [busy, setBusy] = useState(false);
  async function load() { if (id) setData(await api<CustomerDetail>(`/customers/${id}`)); }
  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'โหลดข้อมูลไม่ได้')); }, [id]);
  async function saveSite(event: FormEvent) {
    event.preventDefault(); if (!id) return; setBusy(true); setError('');
    try { await api(editingSite ? `/sites/${editingSite}` : `/customers/${id}/sites`, { method: editingSite ? 'PATCH' : 'POST', body: JSON.stringify(siteForm) });
      await load(); setSiteOpen(false); setEditingSite(null); setSiteForm(blankSite);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'บันทึกสถานที่ไม่ได้'); } finally { setBusy(false); }
  }
  async function saveUnit(event: FormEvent) {
    event.preventDefault(); if (!unitSite) return; setBusy(true); setError('');
    try { await api(editingUnit ? `/units/${editingUnit}` : `/sites/${unitSite}/units`, { method: editingUnit ? 'PATCH' : 'POST', body: JSON.stringify({ ...unitForm, btu: unitForm.btu ? Number(unitForm.btu) : null }) });
      await load(); setUnitOpen(false); setEditingUnit(null); setUnitForm(blankUnit);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'บันทึกเครื่องแอร์ไม่ได้'); } finally { setBusy(false); }
  }
  function editSite(site: Site) { setEditingSite(site.id); setSiteForm({ label: site.label, address: site.address, province: site.province || '', contact_name: site.contact_name || '', contact_phone: site.contact_phone || '' }); setSiteOpen(true); }
  function editUnit(unit: AirUnit) { setEditingUnit(unit.id); setUnitSite(unit.site_id); setUnitForm({ label: unit.label, brand: unit.brand || '', model: unit.model || '', btu: unit.btu?.toString() || '', serial_number: unit.serial_number || '', installed_on: unit.installed_on || '', note: unit.note || '' }); setUnitOpen(true); }
  if (!data) return <>{error ? <Notice message={error} /> : <Loading />}</>;
  const { customer, sites, units, jobs } = data;
  return <>
    <Link className="back-link" to="/customers"><ArrowLeft size={16} /> ลูกค้าทั้งหมด</Link>
    <PageHeader title={customer.name} description={customer.kind === 'company' ? 'ลูกค้าบริษัท' : 'ลูกค้าบุคคล'} action={<><Link className="button button-quiet" to={`/customers/${id}/edit`}><Pencil size={16} /> แก้ไข</Link><Link className="button button-primary" to={`/jobs/new?customer=${id}`}><Plus size={17} /> สร้างงาน</Link></>} />
    {error && <Notice message={error} />}
    <div className="detail-grid"><section className="surface customer-info"><h2>ข้อมูลติดต่อ</h2><div><Phone size={18} /><span>{customer.phone}</span></div>{customer.email && <div><span className="info-spacer" />{customer.email}</div>}{customer.note && <p>{customer.note}</p>}</section>
      <section className="surface customer-info"><h2>ภาพรวมลูกค้า</h2><div><BriefcaseIcon /> <span>{jobs.length} งานล่าสุด</span></div><div><MapPin size={18} /><span>{sites.length} สถานที่</span></div><div><Fan size={18} /><span>{units.length} เครื่องแอร์</span></div></section></div>
    <section className="surface section-spaced"><div className="surface-heading"><div><h2>สถานที่ให้บริการ</h2><p>หนึ่งลูกค้าสามารถมีได้หลายสถานที่</p></div><button className="button button-quiet" onClick={() => { setEditingSite(null); setSiteForm(blankSite); setSiteOpen(!siteOpen); }}><Plus size={16} /> เพิ่มสถานที่</button></div>
      {siteOpen && <form className="inline-form" onSubmit={saveSite}><div className="form-grid"><Field label="ชื่อสถานที่" required><input value={siteForm.label} onChange={(e) => setSiteForm({ ...siteForm, label: e.target.value })} placeholder="เช่น บ้าน, สำนักงาน" required /></Field><Field label="จังหวัด"><input value={siteForm.province} onChange={(e) => setSiteForm({ ...siteForm, province: e.target.value })} /></Field><Field label="ผู้ติดต่อหน้างาน"><input value={siteForm.contact_name} onChange={(e) => setSiteForm({ ...siteForm, contact_name: e.target.value })} /></Field><Field label="เบอร์หน้างาน"><input value={siteForm.contact_phone} onChange={(e) => setSiteForm({ ...siteForm, contact_phone: e.target.value })} /></Field></div><Field label="ที่อยู่" required><textarea rows={3} value={siteForm.address} onChange={(e) => setSiteForm({ ...siteForm, address: e.target.value })} required minLength={5} /></Field><div className="form-actions"><button type="button" className="button button-quiet" onClick={() => setSiteOpen(false)}>ยกเลิก</button><button className="button button-primary" disabled={busy}>บันทึกสถานที่</button></div></form>}
      {sites.length === 0 ? <EmptyState title="ยังไม่มีสถานที่" detail="เพิ่มสถานที่ก่อนสร้างงานบริการหรือบันทึกเครื่องแอร์" /> : <div className="entity-list">{sites.map((site) => <div key={site.id} className="entity-row"><div className="entity-icon"><MapPin size={18} /></div><div><strong>{site.label}</strong><span>{site.address}{site.province ? `, ${site.province}` : ''}</span>{site.contact_name && <small>ผู้ติดต่อ {site.contact_name} {site.contact_phone || ''}</small>}</div><button className="icon-button" aria-label={`แก้ไขสถานที่ ${site.label}`} onClick={() => editSite(site)}><Pencil size={17} /></button></div>)}</div>}
    </section>
    <section className="surface section-spaced"><div className="surface-heading"><div><h2>เครื่องปรับอากาศ</h2><p>อ้างอิงเครื่องเดิมในงานล้างหรือซ่อมครั้งถัดไป</p></div><button className="button button-quiet" disabled={sites.length === 0} onClick={() => { setEditingUnit(null); setUnitForm(blankUnit); setUnitSite(sites[0]?.id ?? ''); setUnitOpen(!unitOpen); }}><Plus size={16} /> เพิ่มเครื่อง</button></div>
      {unitOpen && <form className="inline-form" onSubmit={saveUnit}><div className="form-grid"><Field label="สถานที่" required><select value={unitSite} onChange={(e) => setUnitSite(e.target.value)} disabled={Boolean(editingUnit)}>{sites.map((site) => <option key={site.id} value={site.id}>{site.label}</option>)}</select></Field><Field label="ชื่อเรียกเครื่อง" required><input value={unitForm.label} onChange={(e) => setUnitForm({ ...unitForm, label: e.target.value })} placeholder="เช่น ห้องนอนใหญ่" required /></Field><Field label="ยี่ห้อ"><input value={unitForm.brand} onChange={(e) => setUnitForm({ ...unitForm, brand: e.target.value })} /></Field><Field label="รุ่น"><input value={unitForm.model} onChange={(e) => setUnitForm({ ...unitForm, model: e.target.value })} /></Field><Field label="BTU"><input type="number" min="0" value={unitForm.btu} onChange={(e) => setUnitForm({ ...unitForm, btu: e.target.value })} /></Field><Field label="Serial"><input value={unitForm.serial_number} onChange={(e) => setUnitForm({ ...unitForm, serial_number: e.target.value })} /></Field><Field label="วันที่ติดตั้ง"><input type="date" value={unitForm.installed_on} onChange={(e) => setUnitForm({ ...unitForm, installed_on: e.target.value })} /></Field></div><Field label="หมายเหตุ"><textarea rows={2} value={unitForm.note} onChange={(e) => setUnitForm({ ...unitForm, note: e.target.value })} /></Field><div className="form-actions"><button type="button" className="button button-quiet" onClick={() => setUnitOpen(false)}>ยกเลิก</button><button className="button button-primary" disabled={busy}>บันทึกเครื่อง</button></div></form>}
      {units.length === 0 ? <EmptyState title="ยังไม่มีเครื่องแอร์" detail="เพิ่มเครื่องหลังติดตั้ง หรือบันทึกไว้ก่อนงานล้างครั้งแรก" /> : <div className="entity-list">{units.map((unit) => <div key={unit.id} className="entity-row"><div className="entity-icon"><Fan size={18} /></div><div><strong>{unit.label}</strong><span>{sites.find((site) => site.id === unit.site_id)?.label} · {[unit.brand, unit.model, unit.btu ? `${unit.btu.toLocaleString()} BTU` : null].filter(Boolean).join(' · ') || 'ยังไม่มีข้อมูลเครื่อง'}</span>{unit.serial_number && <small>Serial: {unit.serial_number}</small>}</div><button className="icon-button" aria-label={`แก้ไขเครื่อง ${unit.label}`} onClick={() => editUnit(unit)}><Pencil size={17} /></button></div>)}</div>}
    </section>
    <section className="surface section-spaced"><div className="surface-heading"><div><h2>ประวัติงานบริการ</h2><p>งานล่าสุดของลูกค้ารายนี้</p></div></div>{jobs.length === 0 ? <EmptyState title="ยังไม่มีงานบริการ" detail="สร้างงานครั้งแรกแล้วประวัติจะปรากฏที่นี่" action="สร้างงาน" to={`/jobs/new?customer=${id}`} /> : <div className="table-scroll"><table><thead><tr><th>เลขงาน</th><th>รายละเอียด</th><th>วันนัด</th><th>สถานะ</th><th>มูลค่างาน</th><th></th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><Link className="table-primary" to={`/jobs/${job.id}`}>{job.job_no}</Link></td><td>{job.title}</td><td>{dateTime(job.scheduled_at)}</td><td><StatusBadge status={job.status} /></td><td>{money(job.total_satang)}</td><td><Link className="row-link" to={`/jobs/${job.id}`} aria-label={`ดูงาน ${job.job_no}`}><ArrowUpRight size={18} /></Link></td></tr>)}</tbody></table></div>}</section>
  </>;
}

function BriefcaseIcon() { return <Building2 size={18} />; }
