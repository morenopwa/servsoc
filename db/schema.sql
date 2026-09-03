-- Ejecuta todo este archivo en Supabase: panel del proyecto -> "SQL Editor" -> "New query"
-- -> pega esto -> "Run". Se crean dos tablas: usuarios y atenciones.

create extension if not exists pgcrypto;

create table if not exists ss_users (
  id uuid primary key default gen_random_uuid(),
  dni text unique not null,
  name text not null,
  role text not null default 'asistente',
  salt text not null,
  hash text not null,
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists ss_records (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz
);

-- Activamos seguridad a nivel de fila (RLS) y NO creamos ninguna política.
-- Esto significa que la clave pública "anon" no puede leer ni escribir NADA
-- en estas tablas. Solo nuestro servidor, usando la "service_role key"
-- (que ignora RLS por diseño), puede acceder. Así, aunque la clave "anon"
-- se filtrara alguna vez, los datos de pacientes seguirían protegidos.
alter table ss_users enable row level security;
alter table ss_records enable row level security;
