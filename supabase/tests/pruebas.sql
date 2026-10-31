-- RumbaLive · Pruebas de la lógica de negocio (SQL Editor de Supabase)
-- Crea datos de prueba temporales (locales TEST-*, usuarios test-*@rumbalive.test), ejecuta los casos
-- y al final los borra. Muestra una tabla PASA / FALLA.
-- Nota: dentro de un script now() es constante, por eso se "envejecen" check-ins y reportes a mano.
-- No se puede probar aquí (hacerlo a mano en la app): TC-05 concurrencia real y TC-08 reconexión del WebSocket.
-- La suscripción Realtime usa la misma política RLS que la lectura: TC-07 se cubre con la lectura (T07).

drop table if exists pg_temp.resultados;
create temp table resultados (n serial, caso text, pasa boolean, detalle text);
grant all on resultados to public;
grant usage, select on sequence resultados_n_seq to public;

create or replace function pg_temp.t(p_caso text, p_pasa boolean, p_detalle text default null) returns void
language sql as $$ insert into resultados (caso, pasa, detalle) values (p_caso, coalesce(p_pasa, false), p_detalle) $$;

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  la uuid; lb uuid; lc uuid;
  r jsonb; n int; msg text;
  -- A y B se solapan a propósito (~33 m entre centros); C está lejos (~333 m)
  latA constant double precision := 6.00000; latB constant double precision := 6.00030; latC constant double precision := 6.00300;
  lng constant double precision := -75.00000;
begin
  insert into auth.users (id, email) values (ua, 'test-a@rumbalive.test'), (ub, 'test-b@rumbalive.test');
  insert into public.locales (nombre, categoria, centroide, radio_geofence_m) values
    ('TEST-A', 'test', extensions.ST_SetSRID(extensions.ST_MakePoint(lng, latA), 4326)::extensions.geography, 35) returning id into la;
  insert into public.locales (nombre, categoria, centroide, radio_geofence_m) values
    ('TEST-B', 'test', extensions.ST_SetSRID(extensions.ST_MakePoint(lng, latB), 4326)::extensions.geography, 35) returning id into lb;
  insert into public.locales (nombre, categoria, centroide, radio_geofence_m) values
    ('TEST-C', 'test', extensions.ST_SetSRID(extensions.ST_MakePoint(lng, latC), 4326)::extensions.geography, 35) returning id into lc;

  -- TC-01a: usuario sin sesión no puede reportar
  begin
    execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', '', true);
    perform public.crear_reporte(la, 'fila', 'corta', latA, lng);
    execute 'reset role'; perform pg_temp.t('TC-01a sin sesión no puede reportar', false, 'no lanzó error');
  exception when others then
    execute 'reset role'; perform pg_temp.t('TC-01a sin sesión no puede reportar', sqlerrm = 'no_autenticado', sqlerrm);
  end;

  -- TC-01b: anónimo no puede ejecutar funciones protegidas ni leer reportes
  begin
    execute 'set local role anon';
    perform public.crear_checkin(latA, lng);
    execute 'reset role'; perform pg_temp.t('TC-01b anon no ejecuta crear_checkin', false, 'no lanzó error');
  exception when others then
    execute 'reset role'; perform pg_temp.t('TC-01b anon no ejecuta crear_checkin', sqlstate = '42501', sqlerrm);
  end;
  begin
    execute 'set local role anon';
    perform count(*) from public.reportes;
    execute 'reset role'; perform pg_temp.t('TC-01c anon no lee reportes', false, 'no lanzó error');
  exception when others then
    execute 'reset role'; perform pg_temp.t('TC-01c anon no lee reportes', sqlstate = '42501', sqlerrm);
  end;

  -- Públicas: locales_cercanos funciona sin sesión
  execute 'set local role anon';
  select count(*) into n from public.locales_cercanos(latA, lng, 100);
  execute 'reset role';
  perform pg_temp.t('Público: locales_cercanos (anon, radio 100 m) devuelve A y B', n = 2, 'devolvió ' || n);

  -- Pruebas como usuario A
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', ua::text, true);

  -- TC-02: fuera del radio → rechazo
  r := public.crear_checkin(latA + 0.01, lng, 5);
  perform pg_temp.t('TC-02 check-in lejos de todo geofence se rechaza', (r->>'ok')::boolean = false and r->>'motivo' = 'fuera_de_geofence', r::text);

  -- Más cercano gana cuando los geofences se solapan
  r := public.crear_checkin(latA + 0.00005, lng, 0);
  perform pg_temp.t('Solape: cerca de A se asigna A', r->>'local_nombre' = 'TEST-A', r::text);
  r := public.crear_checkin(latB - 0.00005, lng, 0);
  perform pg_temp.t('Solape: cerca de B se asigna B', r->>'local_nombre' = 'TEST-B', r::text);

  -- Tolerancia GPS: 50 m al sur de A (radio 35)
  r := public.crear_checkin(latA - 0.00045, lng, 0);
  perform pg_temp.t('GPS: a 50 m con precisión 0 se rechaza', (r->>'ok')::boolean = false, r::text);
  r := public.crear_checkin(latA - 0.00045, lng, 20);
  perform pg_temp.t('GPS: a 50 m con precisión 20 se acepta (35+20)', (r->>'ok')::boolean = true, r::text);
  r := public.crear_checkin(latA - 0.00063, lng, 100);
  perform pg_temp.t('GPS: a 70 m con precisión 100 se rechaza (tope 25)', (r->>'ok')::boolean = false, r::text);

  -- TC-04 dwell-time: check-in recién hecho no alcanza
  r := public.crear_reporte(la, 'fila', 'corta', latA, lng, 5);
  perform pg_temp.t('TC-04 sin esperar 3 min el reporte se rechaza', r->>'motivo' = 'dwell_time_no_cumplido', r::text);

  execute 'reset role';
  -- Preparar casos de borde: dejar un único check-in de A en TEST-A con edad exacta
  delete from public.checkins where usuario_id = ua and local_id = la;
  insert into public.checkins (usuario_id, local_id, creado_en) values (ua, la, now() - interval '2 minutes 59 seconds');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', ua::text, true);
  r := public.crear_reporte(la, 'fila', 'corta', latA, lng, 5);
  perform pg_temp.t('TC-04 edad 2 min 59 s se rechaza', r->>'motivo' = 'dwell_time_no_cumplido', r::text);

  execute 'reset role';
  update public.checkins set creado_en = now() - interval '3 minutes' where usuario_id = ua and local_id = la;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', ua::text, true);

  -- TC-03: sin reporte propio, B no ve el estado; A tampoco antes de reportar
  r := public.estado_local(la);
  perform pg_temp.t('TC-03 antes de reportar, A no ve el estado', (r->>'acceso')::boolean = false, r::text);

  -- Geofence al reportar: desde lejos con check-in válido
  r := public.crear_reporte(la, 'fila', 'corta', latC, lng, 5);
  perform pg_temp.t('Reporte desde fuera del geofence se rechaza', r->>'motivo' = 'fuera_de_geofence' and (r->>'dwell_time_cumplido')::boolean, r::text);

  r := public.crear_reporte(la, 'fila', 'inventado', latA, lng, 5);
  perform pg_temp.t('Valor inválido se rechaza', r->>'motivo' = 'valor_invalido', r::text);

  r := public.crear_reporte(la, 'fila', 'corta', latA, lng, 5);
  perform pg_temp.t('TC-04 edad exacta 3 min se acepta y desbloquea', (r->>'ok')::boolean and (r->>'acceso_desbloqueado')::boolean, r::text);

  -- TC-10: antiabuso
  r := public.crear_reporte(la, 'fila', 'larga', latA, lng, 5);
  perform pg_temp.t('TC-10 segundo reporte inmediato del mismo tipo se rechaza', r->>'motivo' = 'demasiado_pronto', r::text);
  r := public.crear_reporte(la, 'aforo', 'alto', latA, lng, 5);
  perform pg_temp.t('Otro tipo de reporte sí se acepta', (r->>'ok')::boolean, r::text);

  -- Ahora A tiene acceso: ve el estado
  r := public.estado_local(la);
  perform pg_temp.t('A ve el estado tras reportar', (r->>'acceso')::boolean and r#>>'{estado,fila,valor}' = 'corta' and r#>>'{estado,aforo,valor}' = 'alto', r::text);

  -- TC-03 / TC-07: B (sin reportes) no ve nada, ni por función ni por lectura directa
  perform set_config('request.jwt.claim.sub', ub::text, true);
  r := public.estado_local(la);
  perform pg_temp.t('TC-03 B sin reportar no ve el estado', (r->>'acceso')::boolean = false, r::text);
  select count(*) into n from public.reportes;
  perform pg_temp.t('TC-07 B sin reportar lee 0 reportes por SELECT directo (misma política que Realtime)', n = 0, 'leyó ' || n);

  -- Nadie escribe directo en las tablas
  begin
    insert into public.reportes (usuario_id, local_id, tipo, valor) values (ub, la, 'fila', 'corta');
    perform pg_temp.t('INSERT directo en reportes está bloqueado', false, 'se insertó');
  exception when others then
    perform pg_temp.t('INSERT directo en reportes está bloqueado', sqlstate = '42501', sqlerrm);
  end;
  begin
    update public.usuarios set ultimo_reporte_en = now() where id = ub;
    get diagnostics n = row_count;
    perform pg_temp.t('UPDATE directo de usuarios está bloqueado', false, 'filas: ' || n);
  exception when others then
    perform pg_temp.t('UPDATE directo de usuarios está bloqueado', sqlstate = '42501', sqlerrm);
  end;

  -- A solo ve sus propios check-ins
  perform set_config('request.jwt.claim.sub', ua::text, true);
  select count(*) into n from public.checkins where usuario_id <> ua;
  perform pg_temp.t('Check-ins ajenos no son visibles', n = 0, 'vio ' || n);

  -- B reporta (con su check-in) y entonces sí puede ver; el acceso vence
  execute 'reset role';
  insert into public.checkins (usuario_id, local_id, creado_en) values (ub, la, now() - interval '5 minutes');
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', ub::text, true);
  r := public.crear_reporte(la, 'fila', 'media', latA, lng, 5);
  select count(*) into n from public.reportes;
  perform pg_temp.t('TC-03 B tras reportar desbloquea y lee reportes ajenos', (r->>'ok')::boolean and n >= 3, 'leyó ' || n);

  execute 'reset role';
  update public.usuarios set ultimo_reporte_en = now() - interval '181 minutes' where id = ub;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', ub::text, true);
  r := public.estado_local(la);
  perform pg_temp.t('El acceso vence a los 181 min', (r->>'acceso')::boolean = false, r::text);

  -- TC-06: un reporte viejo deja de contar
  execute 'reset role';
  update public.reportes set creado_en = now() - interval '61 minutes' where local_id = la;
  update public.usuarios set ultimo_reporte_en = now() where id = ub;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', ub::text, true);
  r := public.estado_local(la);
  perform pg_temp.t('TC-06 reportes de hace 61 min no aparecen en el estado', (r->>'acceso')::boolean and r->'estado' = '{}'::jsonb, r::text);

  execute 'reset role';
  -- Vigencia del check-in: 2 h exactas sirve, 2 h y 1 s no
  delete from public.checkins where usuario_id = ua and local_id = la;
  insert into public.checkins (usuario_id, local_id, creado_en) values (ua, la, now() - interval '2 hours');
  update public.reportes set creado_en = now() - interval '3 hours' where usuario_id = ua;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', ua::text, true);
  r := public.crear_reporte(la, 'cover', 'gratis', latA, lng, 5);
  perform pg_temp.t('Vigencia: check-in de 2 h exactas se acepta', (r->>'ok')::boolean, r::text);
  execute 'reset role';
  update public.checkins set creado_en = now() - interval '2 hours 1 second' where usuario_id = ua and local_id = la;
  update public.reportes set creado_en = now() - interval '3 hours' where usuario_id = ua;
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', ua::text, true);
  r := public.crear_reporte(la, 'cover', 'gratis', latA, lng, 5);
  perform pg_temp.t('Vigencia: check-in de 2 h 1 s se rechaza', r->>'motivo' = 'dwell_time_no_cumplido', r::text);

  execute 'reset role';
  -- Limpieza
  delete from auth.users where id in (ua, ub);
  delete from public.locales where nombre like 'TEST-%';
exception when others then
  execute 'reset role';
  perform pg_temp.t('ERROR INESPERADO en el script de pruebas', false, sqlstate || ' ' || sqlerrm);
  delete from auth.users where email like 'test-%@rumbalive.test';
  delete from public.locales where nombre like 'TEST-%';
end $test$;

select n, case when pasa then 'PASA' else 'FALLA' end as resultado, caso, detalle from pg_temp.resultados order by n;
