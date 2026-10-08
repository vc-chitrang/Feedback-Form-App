/**
 * Schema migrations, applied in order once each.
 *
 * Core integrity rules enforced by the database itself (not just app code):
 *  - a published/archived form_version can never change its content or be deleted (trigger);
 *  - submissions reference the exact version they were filled on (FK, ON DELETE RESTRICT);
 *  - at most one draft and one live version per form (partial unique indexes).
 *
 * NOTE: on a real multi-tenant Postgres server, add row-level security policies on tenant_id.
 * PGlite runs as a single superuser, so tenant isolation is enforced in the query layer here.
 */
export const MIGRATIONS: Array<{ id: number; sql: string }> = [
  {
    id: 1,
    sql: /* sql */ `
create table tenant (
  id text primary key,
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table admin_user (
  id text primary key,
  tenant_id text not null references tenant(id) on delete restrict,
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table admin_session (
  token_hash text primary key,
  user_id text not null references admin_user(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table form (
  id text primary key,
  tenant_id text not null references tenant(id) on delete restrict,
  name text not null,
  public_slug text not null unique,
  live_version_id text,
  created_at timestamptz not null default now()
);
create index form_tenant_idx on form (tenant_id);

create table form_version (
  id text primary key,
  form_id text not null references form(id) on delete restrict,
  number int,
  status text not null check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  doc jsonb not null,
  revision int not null default 1,
  based_on_version_id text references form_version(id),
  created_by text references admin_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by text references admin_user(id),
  check ((status = 'DRAFT') = (number is null))
);
create unique index form_version_one_draft on form_version (form_id) where status = 'DRAFT';
create unique index form_version_one_live on form_version (form_id) where status = 'PUBLISHED';
create unique index form_version_number on form_version (form_id, number) where number is not null;
alter table form add constraint form_live_version_fk foreign key (live_version_id) references form_version(id);

create function form_version_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'DRAFT' then
      raise exception 'published form versions cannot be deleted';
    end if;
    return old;
  end if;
  if old.status <> 'DRAFT' and (
       new.doc is distinct from old.doc
    or new.number is distinct from old.number
    or new.status = 'DRAFT') then
    raise exception 'published form versions are immutable';
  end if;
  return new;
end $$;
create trigger form_version_guard before update or delete on form_version
  for each row execute function form_version_guard();

create table device (
  id text primary key,
  tenant_id text not null references tenant(id),
  form_id text not null references form(id),
  name text not null,
  token_hash text not null unique,
  running_version_id text references form_version(id),
  outbox_size int not null default 0,
  app_version text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table pairing_code (
  code_hash text primary key,
  tenant_id text not null references tenant(id),
  form_id text not null references form(id),
  device_name text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by text references admin_user(id),
  created_at timestamptz not null default now()
);

create table submission (
  id uuid primary key,
  tenant_id text not null references tenant(id),
  form_id text not null references form(id),
  version_id text not null references form_version(id) on delete restrict,
  device_id text references device(id),
  channel text not null check (channel in ('kiosk', 'public')),
  locale text not null,
  started_at timestamptz,
  device_submitted_at timestamptz,
  duration_ms int,
  received_at timestamptz not null default now()
);
create index submission_form_received_idx on submission (form_id, received_at desc, id desc);
create index submission_version_idx on submission (version_id);

create table answer (
  submission_id uuid not null references submission(id) on delete cascade,
  question_uid text not null,
  value jsonb not null,
  primary key (submission_id, question_uid)
);
create index answer_question_idx on answer (question_uid);

create table asset (
  id text primary key,
  tenant_id text not null references tenant(id),
  kind text not null,
  storage_key text not null,
  mime text not null,
  size_bytes int not null,
  sha256 text not null,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  tenant_id text not null references tenant(id),
  user_id text references admin_user(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_tenant_idx on audit_log (tenant_id, created_at desc);
`,
  },
  {
    id: 2,
    // Supabase exposes the public schema through its REST API with a public 'anon' key.
    // Enable RLS with NO policies (deny all) and revoke grants, so only the API's own database
    // connection (table owner) can read or write. Role checks keep this a no-op on local PGlite.
    sql: /* sql */ `
do $$
declare t text;
begin
  foreach t in array array['_migrations','tenant','admin_user','admin_session','form','form_version','device','pairing_code','submission','answer','asset','audit_log'] loop
    execute format('alter table %I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table %I from anon, authenticated', t);
    end if;
  end loop;
end $$;
`,
  },
];
