-- RumbaLive · 0004 · Locales de la demo (TdeA, sede Robledo)
-- Coordenadas medidas en sitio con el panel de calibración (precisión ±4–5 m).
-- Si queda algún 0 el script se detiene a propósito para no sembrar puntos falsos.
-- Radio: 35 m en los parqueaderos y 20 m en las cafeterías (espacios pequeños). Los centros deben quedar a más de 2 × radio entre sí; si dos geofences se
-- solapan igual funciona (se asigna el más cercano), pero con menos precisión.

do $seed$
declare r record;
begin
  for r in
    select * from (values
      ('Parqueadero arriba', 6.280701::float8, -75.582633::float8, 35),
      ('Parqueadero abajo', 6.279384::float8, -75.583152::float8, 35),
      ('Cafetería principal', 6.280119::float8, -75.583186::float8, 20),
      ('Cafetería Apolo 11', 6.279877::float8, -75.582287::float8, 20)
    ) as v(nombre, lat, lng, radio)
  loop
    if r.lat = 0 or r.lng = 0 then
      raise exception 'Faltan las coordenadas reales de "%". Edita 0004_seed_locales_campus.sql.', r.nombre;
    end if;
    insert into public.locales (nombre, categoria, centroide, radio_geofence_m)
    values (r.nombre, 'campus',
            extensions.ST_SetSRID(extensions.ST_MakePoint(r.lng, r.lat), 4326)::extensions.geography, r.radio)
    on conflict (nombre) do update
      set centroide = excluded.centroide, radio_geofence_m = excluded.radio_geofence_m, activo = true;
  end loop;
end $seed$;
