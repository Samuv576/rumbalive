# RumbaLive — guía para quien (o qué IA) siga el proyecto

**Objetivo inmediato:** un MVP funcional para exponer en la universidad. No es la versión completa del producto: ver `docs/CONTEXTO.md` §0 (MVP vs visión completa) y §13 (fuera de alcance). No añadir funcionalidades fuera del MVP.

## Arquitectura (decidida; no cambiarla sin motivo)
PWA React+Vite → API REST autogenerada de Supabase (PostgREST) → funciones PL/pgSQL + políticas RLS → PostgreSQL/PostGIS. Realtime de Supabase para empujar reportes. Diagramas en `docs/c4/`.

## Reglas que no se rompen
1. **El cliente nunca escribe directo en las tablas.** Solo llama a las funciones RPC. Los permisos (`revoke/grant`) y RLS lo impiden; no «arreglarlo» abriendo permisos.
2. **Las reglas de negocio viven en SQL**, no en el frontend. El frontend solo muestra y traduce mensajes.
3. **Give-to-Get** lo imponen `tiene_acceso()` y la política `reportes_g2g`. Nunca mostrar estado ajeno a quien no reportó, ni por consulta ni por Realtime.
4. **No commitear `.env`** ni claves. La anon key es pública por diseño, pero igual se mantiene fuera del repo. Jamás usar la service_role key en el frontend.
5. Si cambias una función SQL, actualiza `supabase/setup_completo.sql`, la migración correspondiente y `supabase/tests/pruebas.sql` (y vuelve a correr las pruebas).
6. UI en español, pensada para celular y con **cero texto libre** (botones, no teclado).

## Contrato de las RPC (`supabase.rpc(nombre, args)`)

| Función | Args | Respuesta |
|---|---|---|
| `locales_cercanos` (pública, sin sesión) | `p_lat, p_lng, p_radio_m=5000` | filas `{id, nombre, categoria, lat, lng, radio_geofence_m, distancia_m}` |
| `crear_checkin` | `p_lat, p_lng, p_precision_m=0, p_local_id=null` | `{ok:true, checkin_id, local_id, local_nombre, distancia_m}` o `{ok:false, motivo:'fuera_de_geofence'}` |
| `crear_reporte` | `p_local_id, p_tipo, p_valor, p_lat, p_lng, p_precision_m=0` | `{ok:true, geofence_valido, dwell_time_cumplido, acceso_desbloqueado}` o `{ok:false, motivo, ...}` con motivo ∈ `valor_invalido, local_no_existe, fuera_de_geofence, dwell_time_no_cumplido, demasiado_pronto` |
| `estado_local` | `p_local_id` | `{acceso:false, motivo:'sin_reporte_vigente', pases_restantes}` o `{acceso:true, local_id, via:'reporte'\|'pase', estado:{fila?:{valor,hace_min}, cover?:..., aforo?:...}}` |
| `usar_pase_gratis` | `p_local_id` | `{ok:true, pases_restantes, ya_activo?}` o `{ok:false, motivo ∈ sin_pases\|pase_ya_usado\|ya_tienes_acceso\|local_no_existe, pases_restantes}` |

Errores lanzados (excepción): `no_autenticado` (sin sesión), `coordenadas_invalidas`.
Valores válidos: `fila` → `sin_fila|corta|media|larga` · `cover` → `gratis|con_costo` · `aforo` → `bajo|medio|alto|lleno`.
Pasar siempre `p_precision_m = position.coords.accuracy`: el servidor lo suma al radio (tope 25 m).
Con `p_local_id` omitido, el check-in se asigna al local más cercano que contenga al usuario.

**Pase gratis (0005):** cada usuario tiene `pases_gratis_max` pases de por vida (MVP = 1; versión final = 3, solo `update public.config set valor = 3 where clave = 'pases_gratis_max'`). Un pase deja ver el estado de UN local por `pase_vigencia_min` (180) sin haber reportado. Se gasta solo con `usar_pase_gratis` (el cliente pide confirmación); `estado_local` nunca lo consume, por eso el cliente puede consultar todos los locales sin gastarlo. La política `reportes_g2g` también deja leer (y recibir por Realtime) los reportes del local con pase vigente, no los de los demás.

Flujo de un reporte: autenticado → datos válidos → local existe → geofence → dwell-time (check-in con 3 min ≤ edad ≤ 2 h) → antiabuso (2 min por tipo) → guardar → desbloquear acceso (180 min).

## Comandos
```bash
npm run dev | npm run dev:https | npm run build | npm run preview
```
Probar el SQL sin Supabase: ver `supabase/local/README.md`. Tras editar SQL, ejecutar `supabase/tests/pruebas.sql` (46 casos).

## Cómo está armado el frontend
`src/lib/backend.js` elige `supabaseBackend` (si hay `.env`) o `mockBackend` (modo demo); ambos exponen la misma interfaz (`getUser, onAuth, signUp, signIn, signOut, rpc, suscribirReportes`). `src/lib/api.js` envuelve las 4 RPC y convierte errores en `motivo`. **Si cambias una función SQL, actualiza también `mockBackend.js`** (es su espejo) y `src/lib/mensajes.js`. `useEstados` mantiene `estado_local` por local, escucha Realtime y refresca todo al reconectar, al volver a la pestaña y cada 30 s.

## Cosas que NO están verificadas (cuidado)
- Todo `src/` se probó solo contra el simulador (`tests/e2e/flujo.cjs`, 36 comprobaciones). Contra Supabase real falta: signUp/signIn, `supabase.rpc`, eventos Realtime (`postgres_changes` + RLS `reportes_g2g`, que además se evalúa con el JWT del suscriptor al momento de suscribirse) y el estado del canal al caer la red.
- Si el Project API Keys nuevo (`sb_publishable_...`) da error «Invalid JWT» con la versión instalada de supabase-js, usar la clave *legacy* anon (JWT) o actualizar `@supabase/supabase-js`.
- El SQL y `pruebas.sql` (46 casos) SÍ se ejecutaron en el proyecto Supabase real `rumbalive` (todo PASA; el insert directo en `auth.users` funciona). Lo que no se probó contra el real es el frontend.
- La entrega de eventos Realtime con la política `reportes_g2g` (que llama a una función) debe comprobarse a mano con 2 celulares.
- Los radios de geofence (35 m / 20 m) se midieron en mapa, no en uso real: se ajustan en T09.

## Datos de la demo
4 locales del campus del TdeA (sede Robledo), en `supabase/migrations/0004_seed_locales_campus.sql` y `src/data/localesDemo.js` (deben coincidir). El póster habla de Provenza/La 70: el campus es el entorno de pruebas del piloto.

## Qué falta
Validar T02–T07 contra el Supabase real (T01 ya está hecho) y T08–T10: `docs/TAREAS.md`.
