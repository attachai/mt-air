export type Role = 'admin' | 'staff' | 'technician';
export type JobStatus = 'new' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type ServiceCategory = 'install' | 'clean' | 'repair' | 'inspect' | 'other';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: number;
  created_at?: string;
}
export interface Customer {
  id: string;
  kind: 'person' | 'company';
  name: string;
  phone: string;
  email: string | null;
  note: string | null;
  active: number;
  created_at: string;
  job_count?: number;
}
export interface Site {
  id: string;
  customer_id: string;
  label: string;
  address: string;
  province: string | null;
  contact_name: string | null;
  contact_phone: string | null;
}
export interface AirUnit {
  id: string;
  site_id: string;
  label: string;
  brand: string | null;
  model: string | null;
  btu: number | null;
  serial_number: string | null;
  installed_on: string | null;
  note: string | null;
}
export interface Service {
  id: string;
  name: string;
  category: ServiceCategory;
  base_price_satang: number;
  active: number;
}
export interface Job {
  id: string;
  job_no: string;
  customer_id: string;
  site_id: string;
  technician_id: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  next_service_on: string | null;
  status: JobStatus;
  title: string;
  problem: string | null;
  work_note: string | null;
  total_satang: number;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  site_label: string;
  site_address: string;
  technician_name: string | null;
}
export interface JobService {
  id: string;
  job_id: string;
  service_id: string;
  unit_id: string | null;
  service_name: string;
  unit_label: string | null;
  quantity: number;
  unit_price_satang: number;
  note: string | null;
}
export interface Attachment {
  id: string;
  job_id: string;
  kind: 'before' | 'after' | 'quotation' | 'service' | 'other';
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}
export interface CustomerDetail { customer: Customer; sites: Site[]; units: AirUnit[]; jobs: Job[] }
export interface JobDetail { job: Job; services: JobService[]; files: Attachment[] }
export interface PageResult<T> { items: T[]; total: number; page: number }
export interface Report {
  from: string;
  to: string;
  byStatus: { status: JobStatus; count: number }[];
  byCategory: { category: ServiceCategory; count: number }[];
  byDay: { day: string; count: number }[];
  newCustomers: number;
  repeatCustomers: number;
  upcoming: Job[];
  technicians: { name: string; count: number }[];
}
