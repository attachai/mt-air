import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, CalendarDays, FileText, Image, Paperclip, Plus, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, categoryLabels, dateOnly, dateTime, fileKindLabels, money, statusLabels } from '../api';
import { EmptyState, Field, Loading, Notice, PageHeader, Pagination, StatusBadge } from '../components';
import { useAuth } from '../App';
import type { Customer, CustomerDetail, Job, JobDetail, JobStatus, PageResult, Service } from '../types';

interface JobLine { service_id: string; unit_id: string; quantity: number; price: string; note: string }
const blankLine = (): JobLine => ({ service_id: '', unit_id: '', quantity: 1, price: '', note: '' });
function bahtToSatang(value: string): number { return Math.round(Number(value || 0) * 100); }
function toLocalInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function JobsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PageResult<Job> | null>(null);
  const [error, setError] = useState('');
  const q = params.get('q') ?? ''; const status = params.get('status') ?? '';
  useEffect(() => {
    let active = true; setResult(null); setError('');
    api<PageResult<Job>>(`/jobs?q=${encodeURIComponent(q)}&status=${status}&page=${page}`)
      .then((data) => { if (active) setResult(data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'โหลดงานไม่ได้'); });
    return () => { active = false; };
  }, [q, status, page]);
  return <>
    <PageHeader title={user?.role === 'technician' ? 'งานที่ได้รับมอบหมาย' : 'งานบริการ'} description="ติดตามนัดหมาย รายละเอียดหน้างาน และเอกสารทุกครั้งที่ให้บริการ" action={user?.role !== 'technician' ? <Link className="button button-primary" to="/jobs/new"><Plus size={17} /> สร้างงานใหม่</Link> : undefined} />
    <section className="surface table-surface"><div className="table-toolbar table-toolbar-wrap"><form className="search-form" onSubmit={(e) => { e.preventDefault(); setPage(1); setParams({ q: query, status }); }}><Search size={18} /><input aria-label="ค้นหางาน" placeholder="ค้นหาเลขงาน ชื่อลูกค้า หรือเบอร์โทร" value={query} onChange={(e) => setQuery(e.target.value)} /><button type="submit">ค้นหา</button></form><select aria-label="กรองสถานะ" value={status} onChange={(e) => { setPage(1); setParams({ q, status: e.target.value }); }}><option value="">ทุกสถานะ</option>{(Object.keys(statusLabels) as JobStatus[]).map((key) => <option value={key} key={key}>{statusLabels[key]}</option>)}</select></div>
      {error && <Notice message={error} />}{!result ? <Loading /> : result.items.length === 0
        ? <EmptyState title={q || status ? 'ไม่พบงานที่ตรงกับตัวกรอง' : 'ยังไม่มีงานบริการ'} detail={q || status ? 'ลองเปลี่ยนคำค้นหาหรือสถานะ' : 'เมื่อเพิ่มลูกค้าและสถานที่แล้ว สร้างงานแรกได้ที่นี่'} action={user?.role !== 'technician' && !q && !status ? 'สร้างงานแรก' : undefined} to="/jobs/new" />
        : <><div className="table-scroll"><table><thead><tr><th>งานบริการ</th><th>ลูกค้า / สถานที่</th><th>วันนัด</th><th>ช่าง</th><th>สถานะ</th><th>มูลค่างาน</th><th></th></tr></thead><tbody>{result.items.map((job) => <tr key={job.id}><td><Link className="table-primary" to={`/jobs/${job.id}`}>{job.job_no}</Link><small>{job.title}</small></td><td><strong>{job.customer_name}</strong><small>{job.site_label}</small></td><td>{dateTime(job.scheduled_at)}</td><td>{job.technician_name || 'ยังไม่มอบหมาย'}</td><td><StatusBadge status={job.status} /></td><td>{money(job.total_satang)}</td><td><Link className="row-link" to={`/jobs/${job.id}`} aria-label={`ดูงาน ${job.job_no}`}><ArrowUpRight size={18} /></Link></td></tr>)}</tbody></table></div><Pagination page={page} total={result.total} onPageChange={setPage} /></>}
    </section>
  </>;
}

export function JobFormPage() {
  const { id } = useParams(); const [searchParams] = useSearchParams(); const navigate = useNavigate();
  const [customerQuery, setCustomerQuery] = useState(''); const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(searchParams.get('customer') ?? '');
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [siteId, setSiteId] = useState(''); const [technicianId, setTechnicianId] = useState('');
  const [scheduled, setScheduled] = useState(''); const [nextService, setNextService] = useState('');
  const [title, setTitle] = useState(''); const [problem, setProblem] = useState(''); const [workNote, setWorkNote] = useState('');
  const [status, setStatus] = useState<JobStatus>('new'); const [lines, setLines] = useState<JobLine[]>([blankLine()]);
  const [services, setServices] = useState<Service[]>([]); const [technicians, setTechnicians] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(Boolean(id));
  useEffect(() => {
    api<{ items: Service[] }>('/services').then((data) => setServices(data.items)).catch(() => setError('โหลดประเภทบริการไม่ได้'));
    api<{ items: { id: string; name: string }[] }>('/technicians').then((data) => setTechnicians(data.items)).catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    api<PageResult<Customer>>(`/customers?q=${encodeURIComponent(customerQuery)}`)
      .then((data) => { if (active) setCustomers(data.items); }).catch(() => {});
    return () => { active = false; };
  }, [customerQuery]);
  useEffect(() => {
    if (!customerId) { setCustomerDetail(null); return; }
    api<CustomerDetail>(`/customers/${customerId}`).then(setCustomerDetail).catch(() => setCustomerDetail(null));
  }, [customerId]);
  useEffect(() => {
    if (!id) return;
    api<JobDetail>(`/jobs/${id}`).then(({ job, services: items }) => {
      setCustomerId(job.customer_id); setSiteId(job.site_id); setTechnicianId(job.technician_id || '');
      setScheduled(toLocalInput(job.scheduled_at)); setNextService(job.next_service_on || '');
      setTitle(job.title); setProblem(job.problem || ''); setWorkNote(job.work_note || ''); setStatus(job.status);
      setLines(items.map((item) => ({ service_id: item.service_id, unit_id: item.unit_id || '', quantity: item.quantity, price: String(item.unit_price_satang / 100), note: item.note || '' })));
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'โหลดงานไม่ได้')).finally(() => setLoading(false));
  }, [id]);
  const selectedCustomer = customerDetail?.customer;
  const units = customerDetail?.units.filter((unit) => unit.site_id === siteId) ?? [];
  function updateLine(index: number, patch: Partial<JobLine>) { setLines(lines.map((line, i) => i === index ? { ...line, ...patch } : line)); }
  function selectService(index: number, serviceId: string) {
    const service = services.find((item) => item.id === serviceId);
    updateLine(index, { service_id: serviceId, price: service ? String(service.base_price_satang / 100) : '' });
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!customerId || !siteId) { setError('กรุณาเลือกลูกค้าและสถานที่'); return; }
    if (lines.some((line) => !line.service_id || !Number.isFinite(Number(line.price)) || Number(line.price) < 0)) { setError('กรุณาตรวจรายการบริการและราคา'); return; }
    setBusy(true);
    const body = { customer_id: customerId, site_id: siteId, technician_id: technicianId || null,
      scheduled_at: scheduled ? new Date(scheduled).toISOString() : null, next_service_on: nextService || null,
      title, problem, work_note: workNote, ...(id ? { status } : {}),
      items: lines.map((line) => ({ service_id: line.service_id, unit_id: line.unit_id || null,
        quantity: line.quantity, unit_price_satang: bahtToSatang(line.price), note: line.note })) };
    try {
      const result = await api<{ id: string }>(id ? `/jobs/${id}` : '/jobs', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      navigate(`/jobs/${id || result.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'บันทึกงานไม่ได้'); }
    finally { setBusy(false); }
  }
  if (loading) return <Loading />;
  return <>
    <Link className="back-link" to={id ? `/jobs/${id}` : '/jobs'}><ArrowLeft size={16} /> กลับไปงานบริการ</Link>
    <PageHeader title={id ? 'แก้ไขงานบริการ' : 'สร้างงานบริการ'} description="เลือกลูกค้าและสถานที่ก่อนระบุบริการและนัดหมาย" />
    {error && <Notice message={error} />}
    <form onSubmit={submit} className="job-form"><section className="surface form-section"><div className="section-title"><span>1</span><div><h2>ลูกค้าและสถานที่</h2><p>เชื่อมงานนี้กับประวัติลูกค้าที่มีอยู่</p></div></div>
      <div className="form-grid"><Field label="ค้นหาลูกค้า"><input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="พิมพ์ชื่อหรือเบอร์โทร" /></Field>
        <Field label="เลือกลูกค้า" required><select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setSiteId(''); setLines(lines.map((line) => ({ ...line, unit_id: '' }))); }} required disabled={Boolean(id)}><option value="">เลือกลูกค้า</option>{selectedCustomer && !customers.some((item) => item.id === selectedCustomer.id) && <option value={selectedCustomer.id}>{selectedCustomer.name}</option>}{customers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.phone}</option>)}</select></Field>
        <Field label="สถานที่ให้บริการ" required><select value={siteId} onChange={(e) => { setSiteId(e.target.value); setLines(lines.map((line) => ({ ...line, unit_id: '' }))); }} required disabled={!customerDetail || Boolean(id)}><option value="">เลือกสถานที่</option>{customerDetail?.sites.map((site) => <option value={site.id} key={site.id}>{site.label} · {site.address}</option>)}</select></Field></div>
      {customerId && customerDetail?.sites.length === 0 && <Notice kind="info" message="ลูกค้ารายนี้ยังไม่มีสถานที่ กรุณาเพิ่มสถานที่ในหน้าลูกค้าก่อน" />}
      {!id && <Link className="text-link" to={customerId ? `/customers/${customerId}` : '/customers/new'}>{customerId ? 'เพิ่มสถานที่ให้ลูกค้ารายนี้' : 'ยังไม่มีลูกค้า? เพิ่มลูกค้าใหม่'} <ArrowUpRight size={16} /></Link>}
    </section>
    <section className="surface form-section"><div className="section-title"><span>2</span><div><h2>รายละเอียดงาน</h2><p>หัวข้องาน วันนัด และช่างผู้รับผิดชอบ</p></div></div>
      <div className="form-grid"><Field label="ชื่องาน" required><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ล้างแอร์ห้องนอนใหญ่" required minLength={2} /></Field><Field label="วันและเวลานัด"><input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} /></Field><Field label="ช่างผู้รับผิดชอบ"><select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}><option value="">ยังไม่มอบหมาย</option>{technicians.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="วันบริการครั้งถัดไป"><input type="date" value={nextService} onChange={(e) => setNextService(e.target.value)} /></Field>
        {id && <Field label="สถานะงาน"><select value={status} onChange={(e) => setStatus(e.target.value as JobStatus)}>{(Object.keys(statusLabels) as JobStatus[]).map((key) => <option key={key} value={key}>{statusLabels[key]}</option>)}</select></Field>}</div>
      <div className="form-grid"><Field label="ปัญหา / ความต้องการ"><textarea rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} /></Field><Field label="บันทึกการทำงาน"><textarea rows={3} value={workNote} onChange={(e) => setWorkNote(e.target.value)} /></Field></div>
    </section>
    <section className="surface form-section"><div className="section-title"><span>3</span><div><h2>รายการบริการ</h2><p>ราคาในงานนี้เก็บแยกจากราคาเริ่มต้น</p></div></div>
      {lines.map((line, index) => <div className="service-line" key={index}><div className="form-grid form-grid-four"><Field label="บริการ" required><select value={line.service_id} onChange={(e) => selectService(index, e.target.value)} required><option value="">เลือกบริการ</option>{services.filter((service) => service.active || service.id === line.service_id).map((service) => <option value={service.id} key={service.id}>{service.name} · {categoryLabels[service.category]}</option>)}</select></Field><Field label="เครื่องแอร์"><select value={line.unit_id} onChange={(e) => updateLine(index, { unit_id: e.target.value })} disabled={!siteId}><option value="">ไม่ระบุเครื่อง</option>{units.map((unit) => <option value={unit.id} key={unit.id}>{unit.label}</option>)}</select></Field><Field label="จำนวน"><input type="number" min="1" max="100" value={line.quantity} onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })} required /></Field><Field label="ราคา/หน่วย (บาท)"><input type="number" min="0" step="0.01" value={line.price} onChange={(e) => updateLine(index, { price: e.target.value })} required /></Field></div><div className="line-bottom"><input aria-label={`หมายเหตุบริการ ${index + 1}`} placeholder="รายละเอียดเพิ่มเติมของรายการนี้" value={line.note} onChange={(e) => updateLine(index, { note: e.target.value })} /><button type="button" className="icon-button danger-icon" disabled={lines.length <= 1} aria-label={`ลบรายการบริการ ${index + 1}`} onClick={() => setLines(lines.filter((_, i) => i !== index))}><X size={18} /></button></div></div>)}
      <div className="line-summary"><button type="button" className="button button-quiet" onClick={() => setLines([...lines, blankLine()])}><Plus size={16} /> เพิ่มรายการ</button><strong>รวม {money(lines.reduce((sum, line) => sum + line.quantity * bahtToSatang(line.price), 0))}</strong></div>
    </section>
    <div className="sticky-actions"><Link className="button button-quiet" to={id ? `/jobs/${id}` : '/jobs'}>ยกเลิก</Link><button className="button button-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : id ? 'บันทึกการแก้ไข' : 'สร้างงานบริการ'}</button></div>
    </form>
  </>;
}

export function JobDetailPage() {
  const { id } = useParams(); const { user } = useAuth();
  const [data, setData] = useState<JobDetail | null>(null); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [fileKind, setFileKind] = useState('before'); const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false);
  const [workNote, setWorkNote] = useState('');
  async function load() { if (id) { const result = await api<JobDetail>(`/jobs/${id}`); setData(result); setWorkNote(result.job.work_note || ''); } }
  useEffect(() => { load().catch((cause) => setError(cause instanceof Error ? cause.message : 'โหลดงานไม่ได้')); }, [id]);
  async function upload(event: FormEvent) {
    event.preventDefault(); if (!file || !id) return; setBusy(true); setError(''); setSuccess('');
    try { const body = new FormData(); body.append('file', file); body.append('kind', fileKind);
      await api(`/jobs/${id}/files`, { method: 'POST', body }); await load(); setFile(null); setSuccess('เพิ่มไฟล์เรียบร้อย');
      const input = document.getElementById('job-file') as HTMLInputElement | null; if (input) input.value = '';
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'อัปโหลดไม่ได้'); } finally { setBusy(false); }
  }
  async function removeFile(fileId: string) {
    if (!window.confirm('ลบไฟล์นี้จากงานบริการ?')) return;
    setError(''); setSuccess('');
    try { await api(`/files/${fileId}`, { method: 'DELETE' }); await load(); setSuccess('ลบไฟล์แล้ว'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'ลบไฟล์ไม่ได้'); }
  }
  async function progress(status: 'in_progress' | 'completed') {
    if (!id) return; setBusy(true); setError(''); setSuccess('');
    try { await api(`/jobs/${id}/progress`, { method: 'PATCH', body: JSON.stringify({ status, work_note: workNote }) });
      await load(); setSuccess(status === 'completed' ? 'ปิดงานแล้ว' : 'เริ่มงานแล้ว'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'เปลี่ยนสถานะไม่ได้'); } finally { setBusy(false); }
  }
  if (!data) return <>{error ? <Notice message={error} /> : <Loading />}</>;
  const { job, services, files } = data;
  return <>
    <Link className="back-link" to="/jobs"><ArrowLeft size={16} /> งานบริการทั้งหมด</Link>
    <PageHeader title={job.title} description={`${job.job_no} · ${job.customer_name}`} action={user?.role !== 'technician' && !['completed', 'cancelled'].includes(job.status) ? <Link className="button button-quiet" to={`/jobs/${id}/edit`}>แก้ไขงาน</Link> : undefined} />
    {error && <Notice message={error} />}{success && <Notice kind="success" message={success} />}
    <div className="job-detail-top"><StatusBadge status={job.status} /><span><CalendarDays size={17} /> นัดหมาย {dateTime(job.scheduled_at)}</span><span>ช่าง: {job.technician_name || 'ยังไม่มอบหมาย'}</span></div>
    <div className="detail-grid"><section className="surface"><h2>ข้อมูลหน้างาน</h2><dl className="detail-list"><div><dt>ลูกค้า</dt><dd>{user?.role === 'technician' ? job.customer_name : <Link to={`/customers/${job.customer_id}`}>{job.customer_name}</Link>}</dd></div><div><dt>เบอร์โทร</dt><dd><a href={`tel:${job.customer_phone}`}>{job.customer_phone}</a></dd></div><div><dt>สถานที่</dt><dd>{job.site_label}<small>{job.site_address}</small></dd></div><div><dt>ปัญหา / ความต้องการ</dt><dd>{job.problem || '—'}</dd></div><div><dt>บริการครั้งถัดไป</dt><dd>{dateOnly(job.next_service_on)}</dd></div></dl></section>
      <section className="surface"><h2>รายการบริการ</h2><div className="job-services">{services.map((item) => <div key={item.id}><div><strong>{item.service_name}</strong><span>{item.unit_label || 'ไม่ระบุเครื่อง'} · {item.quantity} รายการ</span>{item.note && <small>{item.note}</small>}</div><strong>{money(item.quantity * item.unit_price_satang)}</strong></div>)}</div><div className="job-total"><span>มูลค่างาน</span><strong>{money(job.total_satang)}</strong></div><p className="muted tiny">มูลค่างานไม่ใช่ยอดรับชำระเงิน</p></section></div>
    <section className="surface section-spaced"><div className="surface-heading"><div><h2>บันทึกผลการทำงาน</h2><p>อัปเดตความคืบหน้าให้ทีมเห็นตรงกัน</p></div></div>
      <textarea rows={4} value={workNote} onChange={(e) => setWorkNote(e.target.value)} placeholder="รายละเอียดที่ทำ อะไหล่ที่เปลี่ยน หรือข้อแนะนำให้ลูกค้า" disabled={!['scheduled', 'in_progress'].includes(job.status)} />
      {['scheduled', 'in_progress'].includes(job.status) && <div className="form-actions"><button className="button button-primary" disabled={busy} onClick={() => progress(job.status === 'scheduled' ? 'in_progress' : 'completed')}>{job.status === 'scheduled' ? 'เริ่มงาน' : 'ปิดงานเสร็จสิ้น'}</button></div>}
      {job.status === 'completed' && <p className="muted">ปิดงานเมื่อ {dateTime(job.completed_at)}</p>}
    </section>
    <section className="surface section-spaced"><div className="surface-heading"><div><h2>รูปและเอกสาร</h2><p>รูปก่อน–หลัง ใบเสนอราคา และเอกสารบริการ</p></div><Paperclip size={20} className="surface-icon" /></div>
      <form className="upload-row" onSubmit={upload}><Field label="ประเภทไฟล์"><select value={fileKind} onChange={(e) => setFileKind(e.target.value)}>{Object.entries(fileKindLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field><Field label="เลือกไฟล์"><input id="job-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} required /></Field><button className="button button-primary" disabled={!file || busy}><UploadCloud size={16} /> {busy ? 'กำลังอัปโหลด…' : 'อัปโหลด'}</button></form><p className="muted tiny">PDF, JPG, PNG หรือ WebP ขนาดไม่เกิน 10 MB ต่อไฟล์</p>
      {files.length === 0 ? <EmptyState title="ยังไม่มีไฟล์ในงานนี้" detail="เพิ่มภาพหน้างานหรือเอกสารเพื่อให้ค้นพบได้ในประวัติ" /> : <div className="file-list">{files.map((item) => <div className="file-row" key={item.id}><div className="file-icon">{item.mime_type === 'application/pdf' ? <FileText size={19} /> : <Image size={19} />}</div><div><a href={`/api/files/${item.id}`} target="_blank" rel="noreferrer">{item.original_name}</a><span>{fileKindLabels[item.kind]} · {(item.size_bytes / 1024 / 1024).toFixed(2)} MB · {dateTime(item.created_at)}</span></div>{user?.role !== 'technician' && <button className="icon-button danger-icon" aria-label={`ลบไฟล์ ${item.original_name}`} onClick={() => removeFile(item.id)}><Trash2 size={17} /></button>}</div>)}</div>}
    </section>
  </>;
}
