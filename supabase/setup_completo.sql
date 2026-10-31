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
-- RumbaLive · 0002 · Lógica de negocio (funciones PL/pgSQL)
-- Orden de validación de un reporte:
--   autenticado → datos válidos → local existe → geofence → dwell-time → antiabuso → guardar → desbloquear

create or replace function public.cfg(p_clave text) returns numeric
language sql stable security definer set search_path = public as $$
  select valor from public.config where clave = p_clave
$$;

-- Give-to-Get: ¿el usuario actual reportó hace menos de `acceso_vigencia_min`?
create or replace function public.tiene_acceso() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and u.ultimo_reporte_en is not null
      and u.ultimo_reporte_en > now() - make_interval(mins => public.cfg('acceso_vigencia_min')::int)
  )
$$;

-- POST /checkins  ("Estoy en este local")
-- Si no se indica local, se asigna el más cercano cuyo geofence contenga al usuario.
create or replace function public.crear_checkin(
  p_lat double precision,
  p_lng double precision,
  p_precision_m double precision default 0,
  p_local_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid   uuid := auth.uid();
  v_tol   double precision := least(greatest(coalesce(p_precision_m, 0), 0), public.cfg('tolerancia_gps_max_m'));
  v_pto   geography;
  v_local record;
  v_id    uuid;
begin
  if v_uid is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'coordenadas_invalidas' using errcode = '22023';
  end if;
  v_pto := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  select l.id, l.nombre, ST_Distance(l.centroide, v_pto) as dist
    into v_local
    from public.locales l
   where l.activo
     and (p_local_id is null or l.id = p_local_id)
     and ST_DWithin(l.centroide, v_pto, l.radio_geofence_m + v_tol)
   order by ST_Distance(l.centroide, v_pto)
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'fuera_de_geofence');
  end if;

  insert into public.checkins (usuario_id, local_id, distancia_m, precision_m)
  values (v_uid, v_local.id, round(v_local.dist::numeric, 1), p_precision_m)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'checkin_id', v_id, 'local_id', v_local.id,
                            'local_nombre', v_local.nombre, 'distancia_m', round(v_local.dist::numeric, 1));
end $$;

-- POST /reportes
create or replace function public.crear_reporte(
  p_local_id uuid,
  p_tipo text,
  p_valor text,
  p_lat double precision,
  p_lng double precision,
  p_precision_m double precision default 0
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid   uuid := auth.uid();
  v_tol   double precision := least(greatest(coalesce(p_precision_m, 0), 0), public.cfg('tolerancia_gps_max_m'));
  v_pto   geography;
  v_local record;
  v_geo   boolean;
  v_dwell boolean;
begin
  if v_uid is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'coordenadas_invalidas' using errcode = '22023';
  end if;

  if not ((p_tipo = 'fila'  and p_valor in ('sin_fila', 'corta', 'media', 'larga'))
       or (p_tipo = 'cover' and p_valor in ('gratis', 'con_costo'))
       or (p_tipo = 'aforo' and p_valor in ('bajo', 'medio', 'alto', 'lleno'))) then
    return jsonb_build_object('ok', false, 'motivo', 'valor_invalido',
                              'acceso_desbloqueado', public.tiene_acceso());
  end if;

  select l.id, l.centroide, l.radio_geofence_m into v_local
    from public.locales l where l.id = p_local_id and l.activo;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'local_no_existe',
                              'acceso_desbloqueado', public.tiene_acceso());
  end if;

  -- 1) geofence (con tolerancia por precisión del GPS)
  v_pto := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  v_geo := ST_DWithin(v_local.centroide, v_pto, v_local.radio_geofence_m + v_tol);

  -- 2) dwell-time: check-in en este local con edad entre dwell_min y vigencia (límites incluidos)
  v_dwell := exists (
    select 1 from public.checkins c
     where c.usuario_id = v_uid and c.local_id = p_local_id
       and c.creado_en <= now() - make_interval(mins => public.cfg('dwell_min_min')::int)
       and c.creado_en >= now() - make_interval(mins => public.cfg('checkin_vigencia_min')::int)
  );

  if not v_geo or not v_dwell then
    return jsonb_build_object('ok', false, 'motivo', case when not v_geo then 'fuera_de_geofence' else 'dwell_time_no_cumplido' end,
                              'geofence_valido', v_geo, 'dwell_time_cumplido', v_dwell,
                              'acceso_desbloqueado', public.tiene_acceso());
  end if;

  -- 3) antiabuso: mismo tipo, usuario y local dentro del cooldown
  if exists (
    select 1 from public.reportes r
     where r.usuario_id = v_uid and r.local_id = p_local_id and r.tipo = p_tipo
       and r.creado_en > now() - make_interval(mins => public.cfg('cooldown_reporte_min')::int)
  ) then
    return jsonb_build_object('ok', false, 'motivo', 'demasiado_pronto',
                              'geofence_valido', true, 'dwell_time_cumplido', true,
                              'acceso_desbloqueado', public.tiene_acceso());
  end if;

  -- 4) guardar y desbloquear
  insert into public.reportes (usuario_id, local_id, tipo, valor, dwell_time_cumplido)
  values (v_uid, p_local_id, p_tipo, p_valor, true);
  update public.usuarios set ultimo_reporte_en = now() where id = v_uid;

  return jsonb_build_object('ok', true, 'geofence_valido', true, 'dwell_time_cumplido', true,
                            'acceso_desbloqueado', true);
end $$;

-- GET /locales/nearby  (público, sin estado)
create or replace function public.locales_cercanos(
  p_lat double precision,
  p_lng double precision,
  p_radio_m double precision default 5000
) returns table (
  id uuid, nombre text, categoria text, lat double precision, lng double precision,
  radio_geofence_m integer, distancia_m numeric
)
language sql stable set search_path = public, extensions as $$
  select l.id, l.nombre, l.categoria,
         ST_Y(l.centroide::geometry), ST_X(l.centroide::geometry),
         l.radio_geofence_m,
         round(ST_Distance(l.centroide, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)::numeric, 1)
    from public.locales l
   where l.activo
     and ST_DWithin(l.centroide, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radio_m)
   order by 7
$$;

-- GET /locales/{id}/status  (protegido por Give-to-Get)
-- SECURITY INVOKER: además del chequeo explícito, la política RLS de `reportes` vuelve a aplicarse.
create or replace function public.estado_local(p_local_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  if not public.tiene_acceso() then
    return jsonb_build_object('acceso', false, 'motivo', 'sin_reporte_vigente');
  end if;

  select jsonb_build_object(
           'acceso', true, 'local_id', p_local_id,
           'estado', coalesce(jsonb_object_agg(r.tipo, jsonb_build_object(
                       'valor', r.valor,
                       'hace_min', round(extract(epoch from (now() - r.creado_en)) / 60)::int)), '{}'::jsonb))
    into v
    from (select distinct on (tipo) tipo, valor, creado_en
            from public.reportes
           where local_id = p_local_id
             and creado_en > now() - make_interval(mins => public.cfg('reporte_vigencia_min')::int)
           order by tipo, creado_en desc) r;
  return v;
end $$;

-- ---------------------------------------------------------------- Permisos de ejecución
revoke execute on function public.cfg(text), public.tiene_acceso(),
  public.crear_checkin(double precision, double precision, double precision, uuid),
  public.crear_reporte(uuid, text, text, double precision, double precision, double precision),
  public.locales_cercanos(double precision, double precision, double precision),
  public.estado_local(uuid)
  from public, anon, authenticated;

grant execute on function public.cfg(text), public.tiene_acceso(),
  public.crear_checkin(double precision, double precision, double precision, uuid),
  public.crear_reporte(uuid, text, text, double precision, double precision, double precision),
  public.estado_local(uuid)
  to authenticated;
grant execute on function public.locales_cercanos(double precision, double precision, double precision)
  to anon, authenticated;
-- RumbaLive · 0003 · Seguridad (RLS) y tiempo real
-- Regla general: los clientes NO escriben en las tablas; solo llaman a las funciones de 0002.

alter table public.config    enable row level security;   -- sin políticas: inaccesible desde la API
alter table public.usuarios  enable row level security;
alter table public.locales   enable row level security;
alter table public.checkins  enable row level security;
alter table public.reportes  enable row level security;

revoke all on public.config, public.usuarios, public.locales, public.checkins, public.reportes
  from anon, authenticated;
grant select on public.locales to anon, authenticated;
grant select on public.usuarios, public.checkins, public.reportes to authenticated;

drop policy if exists locales_lectura   on public.locales;
drop policy if exists usuarios_propio   on public.usuarios;
drop policy if exists checkins_propios  on public.checkins;
drop policy if exists reportes_g2g      on public.reportes;

create policy locales_lectura  on public.locales  for select to anon, authenticated using (activo);
create policy usuarios_propio  on public.usuarios for select to authenticated using (id = auth.uid());
create policy checkins_propios on public.checkins for select to authenticated using (usuario_id = auth.uid());

-- Give-to-Get: ver reportes ajenos (por consulta o por suscripción Realtime) exige haber reportado hace poco.
create policy reportes_g2g on public.reportes for select to authenticated
  using (public.tiene_acceso() or usuario_id = auth.uid());

-- Tiempo real: Realtime respeta la política anterior.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reportes') then
    alter publication supabase_realtime add table public.reportes;
  end if;
end $$;
