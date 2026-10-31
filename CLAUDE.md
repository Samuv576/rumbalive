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
| `estado_local` | `p_local_id` | `{acceso:false, motivo:'sin_reporte_vigente'}` o `{acceso:true, local_id, estado:{fila?:{valor,hace_min}, cover?:..., aforo?:...}}` |

Errores lanzados (excepción): `no_autenticado` (sin sesión), `coordenadas_invalidas`.
Valores válidos: `fila` → `sin_fila|corta|media|larga` · `cover` → `gratis|con_costo` · `aforo` → `bajo|medio|alto|lleno`.
Pasar siempre `p_precision_m = position.coords.accuracy`: el servidor lo suma al radio (tope 25 m).
Con `p_local_id` omitido, el check-in se asigna al local más cercano que contenga al usuario.

Flujo de un reporte: autenticado → datos válidos → local existe → geofence → dwell-time (check-in con 3 min ≤ edad ≤ 2 h) → antiabuso (2 min por tipo) → guardar → desbloquear acceso (180 min).

## Comandos
```bash
npm run dev | npm run dev:https | npm run build | npm run preview
```
Probar el SQL sin Supabase: ver `supabase/local/README.md`. Tras editar SQL, ejecutar `supabase/tests/pruebas.sql` (29 casos).

## Cosas que NO están verificadas (cuidado)
- El SQL nunca se ha ejecutado en un proyecto Supabase real; sí en Postgres 16 + PostGIS 3 local con un stub de Supabase.
- `pruebas.sql` inserta usuarios directo en `auth.users`; si Supabase lo rechaza, hay que adaptarlo.
- La entrega de eventos Realtime con la política `reportes_g2g` (que llama a una función) debe comprobarse a mano con 2 celulares.
- Los radios de geofence (35 m / 20 m) se midieron en mapa, no en uso real: se ajustan en T09.

## Datos de la demo
4 locales del campus del TdeA (sede Robledo), en `supabase/migrations/0004_seed_locales_campus.sql` y `src/data/localesDemo.js` (deben coincidir). El póster habla de Provenza/La 70: el campus es el entorno de pruebas del piloto.

## Qué falta
`docs/TAREAS.md` (T01–T10).
