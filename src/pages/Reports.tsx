import { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays, ClipboardCheck, Clock3, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, categoryLabels, dateTime } from '../api';
import { EmptyState, Field, Loading, Notice, PageHeader, StatusBadge } from '../components';
import type { Report } from '../types';

function thaiToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function useReport(from: string, to: string) {
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api<Report>(`/reports/summary?from=${from}&to=${to}`)
      .then((result) => { if (active) setData(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'โหลดรายงานไม่ได้'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to]);
  return { data, loading, error };
}

function ReportBars({ report }: { report: Report }) {
  const max = Math.max(1, ...report.byCategory.map((item) => item.count));
  return <div className="report-bars">{report.byCategory.length === 0
    ? <p className="muted">ยังไม่มีงานบริการในช่วงเวลานี้</p>
    : report.byCategory.map((item) => <div className="bar-row" key={item.category}>
      <span>{categoryLabels[item.category]}</span><div className="bar-track"><div className={`bar-fill bar-${item.category}`} style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }} /></div><strong>{item.count}</strong>
    </div>)}</div>;
}

function Upcoming({ report }: { report: Report }) {
  return report.upcoming.length === 0
    ? <EmptyState title="ยังไม่มีนัดที่กำลังจะมาถึง" detail="งานที่กำหนดวันนัดจะแสดงที่นี่เพื่อช่วยเตรียมทีม" />
    : <div className="upcoming-list">{report.upcoming.map((job) => <Link to={`/jobs/${job.id}`} key={job.id} className="upcoming-row">
      <div className="date-chip"><CalendarDays size={16} /></div><div><strong>{job.customer_name}</strong><span>{job.title} · {dateTime(job.scheduled_at)}</span></div><ArrowUpRight size={17} />
    </Link>)}</div>;
}

export function DashboardPage() {
  const today = thaiToday();
  const { data, loading, error } = useReport(`${today.slice(0, 7)}-01`, today);
  const count = (status: string) => data?.byStatus.find((item) => item.status === status)?.count ?? 0;
  const total = data?.byStatus.reduce((sum, item) => sum + item.count, 0) ?? 0;
  return <>
    <PageHeader title="ภาพรวมงานบริการ" description="ติดตามงานของทีมและนัดหมายที่ต้องดูแลในวันนี้" action={<Link className="button button-primary" to="/jobs/new">+ สร้างงานใหม่</Link>} />
    {error && <Notice message={error} />}{loading ? <Loading /> : data && <>
      <section className="overview-strip" aria-label="สรุปงานเดือนนี้">
        <div><span>งานเดือนนี้</span><strong>{total}</strong><small>รายการทั้งหมด</small></div>
        <div><span>กำลังดำเนินการ</span><strong>{count('new') + count('scheduled') + count('in_progress')}</strong><small>รอรับงานและลงพื้นที่</small></div>
        <div><span>เสร็จสิ้น</span><strong>{count('completed')}</strong><small>ปิดงานแล้ว</small></div>
        <div><span>ลูกค้าใหม่</span><strong>{data.newCustomers}</strong><small>ในเดือนนี้</small></div>
      </section>
      <div className="dashboard-grid"><section className="surface"><div className="surface-heading"><div><h2>ประเภทงานที่ให้บริการ</h2><p>จำนวนรายการบริการในเดือนนี้</p></div><Link to="/reports" className="text-link">ดูรายงาน <ArrowUpRight size={16} /></Link></div><ReportBars report={data} /></section>
        <section className="surface"><div className="surface-heading"><div><h2>นัดหมายถัดไป</h2><p>งานที่มีวันนัดและยังไม่ปิด</p></div><Clock3 size={20} className="surface-icon" /></div><Upcoming report={data} /></section></div>
      <div className="shortcut-row"><Link to="/customers/new"><Users size={18} /> เพิ่มลูกค้า <ArrowUpRight size={15} /></Link><Link to="/jobs"><ClipboardCheck size={18} /> ดูงานทั้งหมด <ArrowUpRight size={15} /></Link></div>
    </>}
  </>;
}

export function ReportsPage() {
  const today = thaiToday();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const { data, loading, error } = useReport(from, to);
  const total = data?.byStatus.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const maxDay = Math.max(1, ...(data?.byDay.map((item) => item.count) ?? []));
  return <>
    <PageHeader title="รายงานสรุป" description="ดูจำนวนงานและการใช้บริการจากข้อมูลที่บันทึกจริง" />
    <div className="filter-bar"><Field label="ตั้งแต่วันที่"><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="ถึงวันที่"><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field></div>
    {error && <Notice message={error} />}{loading ? <Loading /> : data && <>
      <section className="report-summary"><div><span>งานทั้งหมด</span><strong>{total}</strong></div><div><span>ลูกค้าใหม่</span><strong>{data.newCustomers}</strong></div><div><span>ลูกค้าใช้บริการซ้ำ</span><strong>{data.repeatCustomers}</strong><small>เคยปิดงานอย่างน้อย 2 ครั้ง</small></div></section>
      <div className="dashboard-grid"><section className="surface"><div className="surface-heading"><div><h2>บริการยอดนิยม</h2><p>ไม่นับงานที่ยกเลิก</p></div></div><ReportBars report={data} /></section>
        <section className="surface"><div className="surface-heading"><div><h2>สถานะงาน</h2><p>จำนวนงานตามวันที่สร้าง</p></div></div><div className="status-report">{data.byStatus.length === 0 ? <p className="muted">ยังไม่มีงานในช่วงนี้</p> : data.byStatus.map((item) => <Link to={`/jobs?status=${item.status}`} key={item.status}><StatusBadge status={item.status} /><strong>{item.count}</strong></Link>)}</div></section></div>
      <div className="dashboard-grid"><section className="surface"><div className="surface-heading"><div><h2>งานรายวัน</h2><p>วันที่สร้างงานในช่วงที่เลือก</p></div></div>{data.byDay.length ? <div className="day-chart" role="img" aria-label="กราฟจำนวนงานรายวัน">{data.byDay.map((item) => <div key={item.day} title={`${item.day}: ${item.count} งาน`}><div style={{ height: `${Math.max(9, item.count / maxDay * 100)}%` }} /><span>{item.day.slice(8)}</span></div>)}</div> : <p className="muted">ยังไม่มีงานในช่วงนี้</p>}</section>
        <section className="surface"><div className="surface-heading"><div><h2>ภาระงานช่าง</h2><p>จำนวนงานที่มอบหมายในช่วงที่เลือก</p></div></div>{data.technicians.length ? <div className="rank-list">{data.technicians.map((item, index) => <div key={item.name}><span>{index + 1}</span><strong>{item.name}</strong><em>{item.count} งาน</em></div>)}</div> : <p className="muted">ยังไม่มีงานที่มอบหมายช่าง</p>}</section></div>
      <p className="report-footnote">รายงานนี้แสดงจำนวนงานและบริการ ยังไม่ใช่ยอดรับชำระเงิน</p>
    </>}
  </>;
}
