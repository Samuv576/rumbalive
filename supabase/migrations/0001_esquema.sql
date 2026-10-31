-- RumbaLive · 0001 · Esquema (tablas, índices y parámetros)
-- Ejecutar en Supabase → SQL Editor. Es re-ejecutable.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------- Parámetros
-- Reglas de negocio configurables. Solo las leen las funciones (ver 0002).
create table if not exists public.config (
  clave       text primary key,
  valor       numeric not null,
  descripcion text
);

insert into public.config (clave, valor, descripcion) values
  ('dwell_min_min',        3,   'Dwell-time: minutos mínimos desde el check-in para poder reportar'),
  ('checkin_vigencia_min', 120, 'Vigencia del check-in (min). Pasado este tiempo hay que repetirlo'),
  ('reporte_vigencia_min', 60,  'Un reporte más viejo que esto ya no cuenta en el estado del local'),
  ('acceso_vigencia_min',  180, 'Give-to-Get: minutos que dura el acceso tras reportar'),
  ('tolerancia_gps_max_m', 25,  'Tope (m) del margen de error del GPS que se suma al radio del geofence'),
  ('cooldown_reporte_min', 2,   'Antiabuso: minutos entre dos reportes del mismo tipo, usuario y local')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------- Tablas
create table if not exists public.usuarios (
  id                uuid primary key references auth.users (id) on delete cascade,
  alias             text,
  creado_en         timestamptz not null default now(),
  ultimo_reporte_en timestamptz
);

create table if not exists public.locales (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null unique,
  categoria        text not null default 'campus',
  centroide        extensions.geography(Point, 4326) not null,
  radio_geofence_m integer not null default 35 check (radio_geofence_m between 10 and 150),
  activo           boolean not null default true
);
create index if not exists locales_centroide_gix on public.locales using gist (centroide);

create table if not exists public.checkins (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.usuarios (id) on delete cascade,
  local_id    uuid not null references public.locales (id) on delete cascade,
  creado_en   timestamptz not null default now(),
  distancia_m numeric,
  precision_m numeric
);
create index if not exists checkins_usuario_local_idx on public.checkins (usuario_id, local_id, creado_en desc);

create table if not exists public.reportes (
  id                  uuid primary key default gen_random_uuid(),
  usuario_id          uuid not null references public.usuarios (id) on delete cascade,
  local_id            uuid not null references public.locales (id) on delete cascade,
  tipo                text not null check (tipo in ('fila', 'cover', 'aforo')),
  valor               text not null,
  dwell_time_cumplido boolean not null default true,
  creado_en           timestamptz not null default now(),
  constraint reportes_valor_valido check (
       (tipo = 'fila'  and valor in ('sin_fila', 'corta', 'media', 'larga'))
    or (tipo = 'cover' and valor in ('gratis', 'con_costo'))
    or (tipo = 'aforo' and valor in ('bajo', 'medio', 'alto', 'lleno'))
  )
);
create index if not exists reportes_local_tipo_idx on public.reportes (local_id, tipo, creado_en desc);

-- ---------------------------------------------------------------- Alta automática en `usuarios`
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (id, alias)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
