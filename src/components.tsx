import type { ReactNode } from 'react';
import { AlertCircle, ArrowRight, Inbox, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { statusLabels } from './api';
import type { JobStatus } from './types';

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {action && <div className="page-actions">{action}</div>}
  </header>;
}

export function Field({ label, children, hint, required }: { label: string; children: ReactNode; hint?: string; required?: boolean }) {
  return <label className="field"><span className="field-label">{label}{required && <span className="required"> *</span>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Notice({ message, kind = 'error' }: { message: string; kind?: 'error' | 'success' | 'info' }) {
  return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    <AlertCircle size={18} aria-hidden="true" /><span>{message}</span>
  </div>;
}

export function Loading({ label = 'กำลังโหลดข้อมูล' }: { label?: string }) {
  return <div className="loading"><LoaderCircle size={22} className="spin" aria-hidden="true" /><span>{label}</span></div>;
}

export function EmptyState({ title, detail, action, to }: { title: string; detail: string; action?: string; to?: string }) {
  return <div className="empty-state"><div className="empty-icon"><Inbox size={26} aria-hidden="true" /></div>
    <h2>{title}</h2><p>{detail}</p>{action && to && <Link className="text-link" to={to}>{action}<ArrowRight size={16} /></Link>}
  </div>;
}

export function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={`status status-${status}`}>{statusLabels[status]}</span>;
}

export function Pagination({ page, total, onPageChange }: { page: number; total: number; onPageChange: (page: number) => void }) {
  if (total <= 20) return null;
  const pages = Math.ceil(total / 20);
  return <div className="pagination"><span>หน้า {page} จาก {pages} · {total} รายการ</span>
    <div><button type="button" className="button button-quiet" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>ก่อนหน้า</button>
      <button type="button" className="button button-quiet" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>ถัดไป</button></div>
  </div>;
}
