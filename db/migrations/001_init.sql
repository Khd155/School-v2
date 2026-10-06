-- Initial schema. All access goes through the server (no client-side DB access).

create table if not exists app_settings (
  id smallint primary key default 1 check (id = 1),
  school_name text not null default 'مدرسة عبدالرحمن بن أبي بكر الابتدائية',
  education_office text not null default '',
  academic_year text not null default '',
  term text not null default '',
  subject text not null default 'الدراسات الإسلامية',
  grade text not null default 'السادس',
  enabled_classes integer[] not null default '{4,5,6}',
  teacher_name text not null default '',
  footer_text text not null default '',
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

create table if not exists logos (
  kind text primary key check (kind in ('ministry', 'school')),
  mime text not null check (mime in ('image/png', 'image/webp', 'image/svg+xml')),
  data bytea not null,
  sha256 text not null,
  updated_at timestamptz not null default now()
);

create table if not exists settings_log (
  id bigserial primary key,
  changed_at timestamptz not null default now(),
  summary text not null
);

-- One row per approved import ("version"). Older versions stay restorable.
create table if not exists datasets (
  id bigserial primary key,
  committed_at timestamptz not null default now(),
  source_filename text not null,
  sheet_name text not null,
  student_count integer not null,
  class_counts jsonb not null,
  warning_count integer not null default 0
);

create table if not exists students (
  id bigserial primary key,
  dataset_id bigint not null references datasets(id) on delete cascade,
  source_row integer not null,
  name text not null,
  email text not null,
  class_no integer not null,
  scores jsonb not null,
  quran jsonb not null,
  hadith jsonb not null,
  note text,
  unique (dataset_id, email)
);

create table if not exists class_stats (
  dataset_id bigint not null references datasets(id) on delete cascade,
  class_no integer not null,
  average numeric,
  highest numeric,
  counted integer not null,
  total integer not null,
  primary key (dataset_id, class_no)
);

-- Single-row pointer to the live dataset. data_updated_at changes only when
-- student data is approved or restored — never for settings changes.
create table if not exists app_state (
  id smallint primary key default 1 check (id = 1),
  active_dataset_id bigint references datasets(id),
  data_updated_at timestamptz
);
insert into app_state (id) values (1) on conflict (id) do nothing;

-- Parsed upload awaiting the teacher's approval. What is previewed is exactly what is committed.
create table if not exists import_drafts (
  id uuid primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  payload jsonb not null
);

-- Access codes are keyed by e-mail so they survive data re-imports.
create table if not exists access_codes (
  email text primary key,
  code_hash text not null,
  generated_at timestamptz not null default now(),
  version integer not null default 1
);

create table if not exists admin_credentials (
  id smallint primary key default 1 check (id = 1),
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists admin_sessions (
  token_hash text primary key,
  csrf_token text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists admin_sessions_expires_idx on admin_sessions (expires_at);

create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

-- Defence in depth on Supabase: block the auto-generated REST API from these tables.
-- The app connects as the table owner, which bypasses RLS.
alter table app_settings enable row level security;
alter table logos enable row level security;
alter table settings_log enable row level security;
alter table datasets enable row level security;
alter table students enable row level security;
alter table class_stats enable row level security;
alter table app_state enable row level security;
alter table import_drafts enable row level security;
alter table access_codes enable row level security;
alter table admin_credentials enable row level security;
alter table admin_sessions enable row level security;
alter table rate_limits enable row level security;
