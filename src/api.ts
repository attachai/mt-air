export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin' });
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new ApiError(data?.error || `เกิดข้อผิดพลาด (${response.status})`, response.status);
  return data as T;
}

export function money(satang: number | null | undefined): string {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 2 })
    .format((satang ?? 0) / 100);
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  }).format(date);
}

export function dateOnly(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeZone: 'Asia/Bangkok',
  }).format(date);
}

export const statusLabels = {
  new: 'รับงานใหม่', scheduled: 'นัดหมายแล้ว', in_progress: 'กำลังดำเนินการ',
  completed: 'เสร็จสิ้น', cancelled: 'ยกเลิก',
} as const;

export const categoryLabels = {
  install: 'ติดตั้ง', clean: 'ล้างแอร์', repair: 'ซ่อม', inspect: 'ตรวจเช็ก', other: 'อื่น ๆ',
} as const;

export const fileKindLabels = {
  before: 'รูปก่อนบริการ', after: 'รูปหลังบริการ', quotation: 'ใบเสนอราคา',
  service: 'เอกสารบริการ', other: 'เอกสารอื่น',
} as const;
