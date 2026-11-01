# Tareas pendientes (en orden)

Cada tarea también está como archivo en `docs/issues/` y se puede subir como *issues* de GitHub con `scripts/crear-issues.sh`.
El orden importa: T01 desbloquea todo lo demás. **T02–T07 ya tienen código** (con un backend simulado para desarrollar sin Supabase): lo que falta es correrlos contra el Supabase real y corregir lo que aparezca.

| ID | Tarea | Área | Depende de | Estado |
|---|---|---|---|---|
| T01 | Crear el proyecto Supabase y cargar el backend | infra | — | **Hecho** (proyecto `rumbalive`, 46/46 pruebas); falta agregar al equipo |
| T02 | Registro e inicio de sesión | frontend | T01 | Código hecho, falta validar con Supabase |
| T03 | Mapa con los locales reales (RPC `locales_cercanos`) | frontend | T01 | Código hecho, falta validar con Supabase |
| T04 | Check-in «Estoy aquí» (RPC `crear_checkin`) | frontend | T02, T03 | Código hecho, falta validar con Supabase |
| T05 | Reporte táctil Zero-Text-Entry (RPC `crear_reporte`) | frontend | T04 | Código hecho, falta validar con Supabase |
| T06 | Give-to-Get: estado bloqueado/desbloqueado (RPC `estado_local`) | frontend | T05 | Código hecho, falta validar con Supabase |
| T07 | Actualización en tiempo real (Supabase Realtime) | frontend | T06 | Código hecho, falta validar con Supabase |
| T08 | Publicar la app (HTTPS) y probarla instalada | devops | T07 | Pendiente |
| T09 | Pruebas en el campus con 2 celulares | qa | T08 | Pendiente |
| T10 | Cierre del proyecto: póster, documentos y guion de la demo | documentación | T09 | Pendiente |

---

### T01 · Crear el proyecto Supabase y cargar el backend

**Área:** infra  ·  **Depende de:** —

**Estado:** proyecto `rumbalive` creado en la cuenta de Samuel (ref `zkjuxchzdliwakztxrap`), `setup_completo.sql` + seed ejecutados, `pruebas.sql` = 46 PASA / 0 FALLA en Supabase real, Realtime activo en `reportes`, «Confirm email» desactivado. **Falta:** agregar a los demás integrantes (paso 3) y que cada uno cree su `.env` (la clave anon legacy está en Project Settings → API Keys → Legacy).

**Objetivo:** Dejar la base de datos funcionando con las reglas de negocio y las 46 pruebas en verde.

**Pasos**
1. Crear cuenta y proyecto en supabase.com (región São Paulo). Guardar la contraseña de la BD en un gestor, NO en el repo.
2. Authentication → Providers → Email: desactivar *Confirm email* (evita fricción en la demo).
3. Agregar a los demás integrantes al proyecto (Organization → Team) para que no dependa de una sola persona.
4. SQL Editor: ejecutar `supabase/setup_completo.sql` completo.
5. Ejecutar `supabase/migrations/0004_seed_locales_campus.sql` (4 locales del campus, coordenadas ya medidas).
6. Ejecutar `supabase/tests/pruebas.sql`: todas las filas deben decir PASA (son 46).
7. Copiar `.env.example` a `.env` y pegar Project URL y anon key (Project Settings → API). Nunca la service_role key.

**Criterios de aceptación**
- [ ] `select * from public.locales` devuelve 4 filas (parqueaderos 35 m, cafeterías 20 m).
- [ ] `pruebas.sql` muestra 46 PASA y ninguna FALLA.
- [ ] `npm run dev` muestra «Supabase conectado» en la cabecera.
- [ ] Si `pruebas.sql` falla al insertar en `auth.users` (nunca se probó en Supabase real): crear 2 usuarios desde la app/Authentication y adaptar el script, o avisar en el issue.

Contexto técnico: `CLAUDE.md` y `docs/CONTEXTO.md`.

### T02 · Registro e inicio de sesión

**Área:** frontend  ·  **Depende de:** T01

**Estado:** código listo (`src/`) y probado de punta a punta con el backend simulado del modo demo. Falta confirmarlo contra el Supabase real (depende de T01) — ver `docs/PRUEBAS_E2E.md`.

**Objetivo:** Que el usuario pueda crear cuenta e iniciar sesión con email y contraseña.

**Pasos**
1. Pantalla de registro/login (supabase.auth.signUp / signInWithPassword) con mensajes de error en español.
2. Mantener la sesión al recargar (onAuthStateChange) y botón de cerrar sesión.
3. El mapa y los pins (T03) son públicos: se ven sin sesión. Reportar, check-in y estado exigen sesión.

**Criterios de aceptación**
- [ ] Un usuario nuevo se registra, y al entrar aparece una fila en `public.usuarios` (la crea un trigger).
- [ ] Recargar la página no cierra la sesión.
- [ ] Sin sesión, los botones de check-in y reporte piden iniciar sesión.

Contexto técnico: `CLAUDE.md` y `docs/CONTEXTO.md`.

### T03 · Mapa con los locales reales (RPC `locales_cercanos`)

**Área:** frontend  ·  **Depende de:** T01

**Estado:** código listo (`src/`) y probado de punta a punta con el backend simulado del modo demo. Falta confirmarlo contra el Supabase real (depende de T01) — ver `docs/PRUEBAS_E2E.md`.

**Objetivo:** Reemplazar `src/data/localesDemo.js` por datos reales de la BD.

**Pasos**
1. Llamar `supabase.rpc('locales_cercanos', { p_lat, p_lng, p_radio_m: 5000 })` (funciona sin sesión).
2. Dibujar pin y círculo del geofence (radio_geofence_m) por local; tocar un local abre su panel.
3. Si la ubicación está denegada, usar el centro del campus y mostrar aviso (caso TC-09).
4. Dejar el panel de calibración detrás de `?calibrar=1` (hoy es la pantalla principal).

**Criterios de aceptación**
- [ ] Se ven los 4 locales del TdeA con su círculo correcto.
- [ ] Funciona sin iniciar sesión.
- [ ] `?calibrar=1` muestra el panel actual de calibración.

Contexto técnico: `CLAUDE.md` y `docs/CONTEXTO.md`.

### T04 · Check-in «Estoy aquí» (RPC `crear_checkin`)

**Área:** frontend  ·  **Depende de:** T02, T03

**Estado:** código listo (`src/`) y probado de punta a punta con el backend simulado del modo demo. Falta confirmarlo contra el Supabase real (depende de T01) — ver `docs/PRUEBAS_E2E.md`.

**Objetivo:** Registrar la presencia del usuario en un local.

**Pasos**
1. Botón «Estoy aquí» que llama `rpc('crear_checkin', { p_lat, p_lng, p_precision_m: coords.accuracy })` (sin `p_local_id`: el servidor elige el local más cercano).
2. Si `ok:false, motivo:'fuera_de_geofence'`: mensaje claro («Acércate más al local»).
3. Si `ok:true`: mostrar el local asignado y una cuenta regresiva de 3 min (dwell-time) antes de habilitar el reporte.
4. Pedir ubicación de alta precisión (`enableHighAccuracy: true`) y mostrar la precisión actual.

**Criterios de aceptación**
- [ ] Dentro del geofence: check-in correcto y se ve el nombre del local.
- [ ] Fuera del geofence: se rechaza con mensaje amable.
- [ ] Con el permiso de ubicación denegado, la app lo dice y no muestra el check-in como válido (TC-09).

Contexto técnico: `CLAUDE.md` y `docs/CONTEXTO.md`.

### T05 · Reporte táctil Zero-Text-Entry (RPC `crear_reporte`)

**Área:** frontend  ·  **Depende de:** T04

**Estado:** código listo (`src/`) y probado de punta a punta con el backend simulado del modo demo. Falta confirmarlo contra el Supabase real (depende de T01) — ver `docs/PRUEBAS_E2E.md`.

**Objetivo:** Reportar fila, cover y aforo solo con botones, sin escribir texto.

**Pasos**
1. Selector de tipo (`fila`, `cover`, `aforo`) y de valor con botones grandes. Valores válidos: fila → `sin_fila|corta|media|larga`; cover → `gratis|con_costo`; aforo → `bajo|medio|alto|lleno`.
2. Llamar `rpc('crear_reporte', { p_local_id, p_tipo, p_valor, p_lat, p_lng, p_precision_m })`.
3. Traducir los `motivo` a mensajes: `dwell_time_no_cumplido` («Espera unos minutos desde tu check-in»), `fuera_de_geofence`, `demasiado_pronto` (2 min entre reportes iguales), `valor_invalido`, `local_no_existe`.
4. Al `ok:true` quedó desbloqueado el acceso: pasar a T06.

**Criterios de aceptación**
- [ ] Reporte exitoso tras esperar 3 min desde el check-in.
- [ ] Antes de los 3 min, la app muestra el mensaje de espera y no deja reportar.
- [ ] Un segundo reporte del mismo tipo antes de 2 min muestra «demasiado pronto» (TC-10).

Contexto técnico: `CLAUDE.md` y `docs/CONTEXTO.md`.

### T06 · Give-to-Get: estado bloqueado/desbloqueado (RPC `estado_local`)

**Área:** frontend  ·  **Depende de:** T05

**Estado:** código listo (`src/`) y probado de punta a punta con el backend simulado del modo demo. Falta confirmarlo contra el Supabase real (depende de T01) — ver `docs/PRUEBAS_E2E.md`.

**Objetivo:** Mostrar fila/cover/aforo solo a quien reportó (acceso 180 min).

**Pasos**
1. Llamar `rpc('estado_local', { p_local_id })`. Respuesta bloqueada: `{ acceso:false, motivo:'sin_reporte_vigente' }`; desbloqueada: `{ acceso:true, estado:{ fila:{valor,hace_min}, cover:{...}, aforo:{...} } }`.
2. Bloqueado: los pins se siguen viendo, pero el estado aparece difuminado con el texto «Reporta para desbloquear». Mantener el mensaje de valor, no de castigo.
3. Desbloqueado: mostrar cada tipo con «hace X min». Si `estado` viene vacío: «Sin reportes recientes» (vigencia 60 min).
4. **Pase gratis:** si `pases_restantes > 0`, el bloqueado ofrece «Ver este local gratis» (con confirmación) que llama `rpc('usar_pase_gratis', { p_local_id })`; luego el estado de ese local llega con `via:'pase'`. MVP = 1 pase; versión final = 3 (parámetro `pases_gratis_max`).

**Criterios de aceptación**
- [ ] Usuario sin reportes: ve los locales pero no el estado.
- [ ] Tras reportar: ve el estado de todos los locales.
- [ ] Pasados 180 min desde su último reporte, vuelve a bloquearse.
- [ ] Un usuario nuevo puede usar 1 pase en un local, ve solo ese local, y el pase vence a los 180 min.

Contexto técnico: `CLAUDE.md` y `docs/CONTEXTO.md`.

### T07 · Actualización en tiempo real (Supabase Realtime)

**Área:** frontend  ·  **Depende de:** T06

**Estado:** código listo (`src/`) y probado de punta a punta con el backend simulado del modo demo. Falta confirmarlo contra el Supabase real (depende de T01) — ver `docs/PRUEBAS_E2E.md`.

**Objetivo:** Que el estado se actualice solo cuando otro usuario reporta.

**Pasos**
1. Suscribirse con `supabase.channel(...).on('postgres_changes', { event:'INSERT', schema:'public', table:'reportes' }, ...)` y refrescar `estado_local` del local afectado.
2. La política RLS `reportes_g2g` ya hace que un usuario sin acceso NO reciba eventos de otros: comprobarlo a mano con 2 celulares (TC-07).
3. Si el WebSocket se cae y vuelve, refrescar todo el estado para no dejar datos viejos (TC-08).

**Criterios de aceptación**
- [ ] Celular A reporta; celular B (con acceso) ve el cambio en menos de unos segundos sin recargar.
- [ ] Un celular sin acceso no recibe ni ve el reporte.
- [ ] Activar modo avión 20 s y volver: la app se reconcilia sola.

Contexto técnico: `CLAUDE.md` y `docs/CONTEXTO.md`.

### T08 · Publicar la app (HTTPS) y probarla instalada

**Área:** devops  ·  **Depende de:** T07

**Objetivo:** Dejar una URL estable para la sustentación.

**Pasos**
1. Publicar en Netlify o Vercel con las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` configuradas en el panel (no en el repo).
2. Abrir en 2 celulares reales, aceptar permiso de ubicación e instalar la PWA («Añadir a pantalla de inicio»).
3. Guardar la URL final en el README.

**Criterios de aceptación**
- [ ] La URL abre con HTTPS válido y la geolocalización funciona.
- [ ] La PWA se instala y abre a pantalla completa.

Contexto técnico: `CLAUDE.md` y `docs/CONTEXTO.md`.

### T09 · Pruebas en el campus con 2 celulares

**Área:** qa  ·  **Depende de:** T08

**Objetivo:** Validar en sitio lo que SQL no puede probar y afinar radios.

**Pasos**
1. Recorrer los 4 puntos: parqueadero arriba, parqueadero abajo, cafetería principal y cafetería Apolo 11. Anotar si el check-in es aceptado/rechazado dentro y fuera del círculo.
2. Si hay rechazos injustos en las cafeterías (radio 20 m), subir el radio con `update public.locales set radio_geofence_m = 25 where nombre = '...'` o la tolerancia: `update public.config set valor = 30 where clave = 'tolerancia_gps_max_m'`.
3. Casos manuales: TC-05 (dos usuarios reportan a la vez), TC-07 (sin acceso no recibe eventos), TC-08 (reconexión), TC-09 (ubicación denegada).
4. Anotar resultados en `docs/PRUEBAS_CAMPUS.md` (crear).

**Criterios de aceptación**
- [ ] Tabla con resultado de cada caso y cada punto.
- [ ] Radios ajustados y sincronizados con `src/data/localesDemo.js` y el seed SQL.

Contexto técnico: `CLAUDE.md` y `docs/CONTEXTO.md`.

### T10 · Cierre del proyecto: póster, documentos y guion de la demo

**Área:** documentación  ·  **Depende de:** T09

**Objetivo:** Dejar entregables coherentes con lo construido.

**Pasos**
1. Póster (`docs/poster/Poster_RumbaLive.pptx`): sección 4 solo muestra arquitectura. Si el MVP funciona, agregar 2–3 capturas reales debajo del nivel 3. No inventar métricas.
2. Corregir nombres con tilde en el póster si aplica (p. ej. «Sebastián», «Juan José»), confirmándolos con cada integrante.
3. Revisar `docs/CONTEXTO.md` sección 14: si algún valor cambió (radios, tiempos), actualizarlo. Los diagramas C4 no cambian con eso.
4. Escribir un guion de demo de 5 minutos: abrir mapa sin sesión → registrarse → check-in → esperar dwell-time → reportar → ver estado → segundo celular ve el cambio en vivo.
5. Aclarar en la sustentación que el campus es el entorno de pruebas del piloto; el póster describe el caso Provenza/La 70.

**Criterios de aceptación**
- [ ] Póster actualizado y exportado a PDF.
- [ ] Guion de demo ensayado una vez completo.

Contexto técnico: `CLAUDE.md` y `docs/CONTEXTO.md`.
