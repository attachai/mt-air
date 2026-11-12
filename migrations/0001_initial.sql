PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','staff','technician')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('person','company')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  note TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_phone ON customers(phone);

CREATE TABLE customer_sites (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  label TEXT NOT NULL,
  address TEXT NOT NULL,
  province TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sites_customer ON customer_sites(customer_id);

CREATE TABLE air_units (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES customer_sites(id),
  label TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  btu INTEGER,
  serial_number TEXT,
  installed_on TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_units_site ON air_units(site_id);

CREATE TABLE service_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('install','clean','repair','inspect','other')),
  base_price_satang INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  job_no TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  site_id TEXT NOT NULL REFERENCES customer_sites(id),
  technician_id TEXT REFERENCES users(id),
  scheduled_at TEXT,
  completed_at TEXT,
  next_service_on TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','scheduled','in_progress','completed','cancelled')),
  title TEXT NOT NULL,
  problem TEXT,
  work_note TEXT,
  total_satang INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_jobs_customer ON jobs(customer_id);
CREATE INDEX idx_jobs_site ON jobs(site_id);
CREATE INDEX idx_jobs_status_date ON jobs(status, scheduled_at);
CREATE INDEX idx_jobs_technician ON jobs(technician_id);

CREATE TABLE job_services (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES service_catalog(id),
  unit_id TEXT REFERENCES air_units(id),
  service_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_satang INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
CREATE INDEX idx_job_services_job ON job_services(job_id);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  kind TEXT NOT NULL CHECK (kind IN ('before','after','quotation','service','other')),
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE INDEX idx_attachments_job ON attachments(job_id);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE login_attempts (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT NOT NULL
);
