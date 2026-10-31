-- RumbaLive · 0005 · Pase gratis (Give-to-Get con prueba)
-- Cada usuario tiene `pases_gratis_max` pases de por vida: cada pase deja ver el estado de UN local durante
-- `pase_vigencia_min` minutos sin haber reportado. MVP = 1 pase; versión final = 3 (basta con
-- `update public.config set valor = 3 where clave = 'pases_gratis_max'`).
-- El pase se gasta SOLO de forma explícita con usar_pase_gratis(): estado_local() nunca lo consume.
-- Es re-ejecutable.

insert into public.config (clave, valor, descripcion) values
  ('pases_gratis_max',  1,   'Pases gratis de por vida por usuario (MVP 1, versión final 3)'),
  ('pase_vigencia_min', 180, 'Minutos que dura un pase gratis sobre un local')
on conflict (clave) do nothing;

create table if not exists public.pases_gratis (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  local_id   uuid not null references public.locales (id) on delete cascade,
  creado_en  timestamptz not null default now(),
  unique (usuario_id, local_id)
);

alter table public.pases_gratis enable row level security;
revoke all on public.pases_gratis from anon, authenticated;
grant select on public.pases_gratis to authenticated;
drop policy if exists pases_propios on public.pases_gratis;
create policy pases_propios on public.pases_gratis for select to authenticated using (usuario_id = auth.uid());

-- ¿Tiene el usuario actual un pase vigente sobre este local?
create or replace function public.pase_activo(p_local_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pases_gratis p
     where p.usuario_id = auth.uid() and p.local_id = p_local_id
       and p.creado_en > now() - make_interval(mins => public.cfg('pase_vigencia_min')::int)
  )
$$;

-- Pases que aún le quedan al usuario actual.
create or replace function public.pases_restantes() returns integer
language sql stable security definer set search_path = public as $$
  select greatest(public.cfg('pases_gratis_max')::int
           - (select count(*)::int from public.pases_gratis where usuario_id = auth.uid()), 0)
$$;

-- POST /locales/{id}/pase  (gasta un pase sobre un local)
create or replace function public.usar_pase_gratis(p_local_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text));   -- evita gastar 2 pases con doble toque

  if not exists (select 1 from public.locales where id = p_local_id and activo) then
    return jsonb_build_object('ok', false, 'motivo', 'local_no_existe', 'pases_restantes', public.pases_restantes());
  end if;
  if public.tiene_acceso() then
    return jsonb_build_object('ok', false, 'motivo', 'ya_tienes_acceso', 'pases_restantes', public.pases_restantes());
  end if;
  if public.pase_activo(p_local_id) then
    return jsonb_build_object('ok', true, 'ya_activo', true, 'pases_restantes', public.pases_restantes());
  end if;
  if exists (select 1 from public.pases_gratis where usuario_id = v_uid and local_id = p_local_id) then
    return jsonb_build_object('ok', false, 'motivo', 'pase_ya_usado', 'pases_restantes', public.pases_restantes());
  end if;
  if public.pases_restantes() <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'sin_pases', 'pases_restantes', 0);
  end if;

  insert into public.pases_gratis (usuario_id, local_id) values (v_uid, p_local_id);
  return jsonb_build_object('ok', true, 'pases_restantes', public.pases_restantes());
end $$;

-- GET /locales/{id}/status: ahora también abre con un pase vigente sobre ese local.
-- SECURITY INVOKER: la política RLS de `reportes` se vuelve a aplicar (ver más abajo).
create or replace function public.estado_local(p_local_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare v jsonb; v_acceso boolean; v_pase boolean;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  v_acceso := public.tiene_acceso();
  v_pase   := public.pase_activo(p_local_id);
  if not (v_acceso or v_pase) then
    return jsonb_build_object('acceso', false, 'motivo', 'sin_reporte_vigente',
                              'pases_restantes', public.pases_restantes());
  end if;

  select jsonb_build_object(
           'acceso', true, 'local_id', p_local_id,
           'via', case when v_acceso then 'reporte' else 'pase' end,
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

-- Give-to-Get en la lectura directa y en Realtime: con acceso por reporte se ve todo; con pase, solo ese local.
drop policy if exists reportes_g2g on public.reportes;
create policy reportes_g2g on public.reportes for select to authenticated
  using (public.tiene_acceso() or usuario_id = auth.uid() or public.pase_activo(local_id));

revoke execute on function public.pase_activo(uuid), public.pases_restantes(), public.usar_pase_gratis(uuid)
  from public, anon, authenticated;
grant execute on function public.pase_activo(uuid), public.pases_restantes(), public.usar_pase_gratis(uuid)
  to authenticated;
