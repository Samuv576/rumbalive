# RumbaLive

«El Waze de la rumba»: la fila, el cover y el aforo de un local en tiempo real, reportados por los propios usuarios y validados por geofencing. El acceso se rige por **Give to Get**: para ver el estado de los demás, primero reportas el del local donde estás.

Proyecto de aula — Ingeniería de Software, Tecnológico de Antioquia (TdeA), Sexta Feria PPI.
Equipo: Samuel Valencia Buitrago · Sebastian David Sanchez Parra · Miguel Quintero Jaramillo · Juan Jose Molina Peña.

## Estado actual

| Parte | Estado |
|---|---|
| Diseño (C4 niveles 1–3, póster, documento de contexto) | Hecho (`docs/`) |
| Backend SQL: esquema, funciones, RLS, tiempo real | Hecho. 46/46 pruebas en Postgres local **y en el proyecto Supabase real** (`rumbalive`) |
| Locales del campus con coordenadas medidas | Hecho (4 puntos) |
| App React: mapa, login, check-in con cuenta regresiva, reporte táctil, Give-to-Get, tiempo real (T02–T07) | Hecho y probado con backend simulado (36 comprobaciones). **Falta correrlo contra el Supabase real (hay `.env`)** |
| Panel de calibración de coordenadas | Hecho (`?calibrar=1`) |
| Publicación (HTTPS) y pruebas en el campus | **Pendiente** |

**T01 ya está hecho** (Supabase creado y probado). Siguiente: correr la app con su `.env`, validar T02–T07 contra Supabase y seguir con T08–T10 en `docs/TAREAS.md` y lee `CLAUDE.md`, que resume todo lo técnico.

## Stack

PWA en **React + Vite** (JavaScript) · mapa con **Leaflet + OpenStreetMap** · **Supabase** (PostgreSQL + PostGIS, Auth, Realtime). Las reglas de negocio viven en funciones PL/pgSQL y políticas RLS, no en el frontend.

## Correrlo

Requiere Node.js LTS.

```bash
npm install
cp .env.example .env        # y completar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev                 # http://localhost:5173
```

Sin `.env` la app arranca en **modo demo**: un backend simulado en el navegador con las mismas reglas que el SQL (dwell-time, cooldown, Give-to-Get con 1 pase gratis, tiempo real entre pestañas). Sirve para desarrollar y ensayar sin Supabase; trae un selector para simular la ubicación desde el computador y acepta `?dwell=10&cooldown=15&acceso=60` (segundos) para acortar los tiempos. Con `.env` completo usa Supabase de verdad.

Panel de calibración de coordenadas: `/?calibrar=1`.

Probar en el celular (la geolocalización exige HTTPS):
- `npm run dev:https` con PC y celular en la misma red (si la red no deja, usar el hotspot del celular), o
- un túnel: `cloudflared tunnel --url http://localhost:5173` (con `npm run dev` corriendo), o
- publicar `npm run build` en Netlify/Vercel (opción recomendada para la demo).

## Backend (Supabase)

1. SQL Editor → ejecutar `supabase/setup_completo.sql` (esquema + funciones + RLS + realtime; se puede repetir).
2. Ejecutar `supabase/migrations/0004_seed_locales_campus.sql` (los 4 locales del campus).
3. Ejecutar `supabase/tests/pruebas.sql` → tabla PASA/FALLA, todo debe ser PASA.

`supabase/migrations/0001–0003` y `0005` (pase gratis) son el mismo contenido de `setup_completo.sql` por partes; `0004` es el seed de locales y se corre aparte.

## Estructura

```
src/                  app React
  App.jsx               pantalla principal (T02–T07) · `?calibrar=1` abre la calibración
  components/           Auth, MapView, EstadoLocal, Accion (check-in + reporte), Calibracion
  hooks/                useUbicacion (GPS), useEstados (estado + Realtime + reconexión), useAhora
  lib/                  api.js (las 4 RPC), backend.js (elige Supabase o simulador), mensajes.js (textos)
                        supabaseBackend.js · mockBackend.js (simulador con las mismas reglas) · geo.js
  data/localesDemo.js   locales del campus (los usa el simulador y la calibración; la app real los lee por RPC)
  config.js             reglas de negocio del lado cliente (solo cuenta regresiva y textos)
tests/e2e/flujo.cjs   prueba de punta a punta del modo demo (Playwright)
supabase/
  setup_completo.sql    esquema + funciones + RLS
  migrations/           lo mismo por partes + seed de locales
  tests/pruebas.sql     46 casos de la lógica de negocio
  local/                stub para probar el SQL en un Postgres local (ver su README)
docs/
  TAREAS.md, issues/    lo que falta, en orden
  CONTEXTO.md           documento de contexto completo (v3 + decisiones de implementación)
  c4/                   diagramas C4 (PNG, SVG y .drawio editable)
  poster/, ppi/         póster y plantilla del PPI
scripts/crear-issues.sh sube docs/issues como issues de GitHub
```

## Reglas de negocio vigentes (tabla `config`)

Dwell-time mínimo 3 min · vigencia del check-in 2 h · vigencia de un reporte 60 min · acceso Give-to-Get 180 min tras reportar · tolerancia GPS máx. 25 m · 2 min entre reportes iguales. Radio de geofence: 35 m parqueaderos, 20 m cafeterías.
Se cambian con `update public.config set valor = X where clave = '...'`.
