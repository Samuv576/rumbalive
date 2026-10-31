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
