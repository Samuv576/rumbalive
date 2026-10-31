# RumbaLive

«El Waze de la rumba»: la fila, el cover y el aforo de un local en tiempo real, reportados por los propios usuarios y validados por geofencing. El acceso se rige por **Give to Get**: para ver el estado de los demás, primero reportas el del local donde estás.

Proyecto de aula — Ingeniería de Software, Tecnológico de Antioquia (TdeA), Sexta Feria PPI.
Equipo: Samuel Valencia Buitrago · Sebastian David Sanchez Parra · Miguel Quintero Jaramillo · Juan Jose Molina Peña.

## Estado actual

| Parte | Estado |
|---|---|
| Diseño (C4 niveles 1–3, póster, documento de contexto) | Hecho (`docs/`) |
| Backend SQL: esquema, funciones, RLS, tiempo real | Hecho y probado en Postgres+PostGIS local (29/29). **Aún no ejecutado en un proyecto Supabase real** |
| Locales del campus con coordenadas medidas | Hecho (4 puntos) |
| App React: mapa + panel de calibración de coordenadas | Hecho |
| App React: login, check-in, reporte, Give-to-Get, tiempo real | **Pendiente** → `docs/TAREAS.md` |
| Publicación (HTTPS) y pruebas en el campus | **Pendiente** |

**Empieza por `docs/TAREAS.md`** (10 tareas ordenadas, con criterios de aceptación) y lee `CLAUDE.md`, que resume todo lo técnico.

## Stack

PWA en **React + Vite** (JavaScript) · mapa con **Leaflet + OpenStreetMap** · **Supabase** (PostgreSQL + PostGIS, Auth, Realtime). Las reglas de negocio viven en funciones PL/pgSQL y políticas RLS, no en el frontend.

## Correrlo

Requiere Node.js LTS.

```bash
npm install
cp .env.example .env        # y completar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev                 # http://localhost:5173
```

Sin Supabase la app arranca en «modo calibración» (mapa + coordenadas del GPS).

Probar en el celular (la geolocalización exige HTTPS):
- `npm run dev:https` con PC y celular en la misma red (si la red no deja, usar el hotspot del celular), o
- un túnel: `cloudflared tunnel --url http://localhost:5173` (con `npm run dev` corriendo), o
- publicar `npm run build` en Netlify/Vercel (opción recomendada para la demo).

## Backend (Supabase)

1. SQL Editor → ejecutar `supabase/setup_completo.sql` (esquema + funciones + RLS + realtime; se puede repetir).
2. Ejecutar `supabase/migrations/0004_seed_locales_campus.sql` (los 4 locales del campus).
3. Ejecutar `supabase/tests/pruebas.sql` → tabla PASA/FALLA, todo debe ser PASA.

`supabase/migrations/0001–0003` son el mismo contenido de `setup_completo.sql` por partes.

## Estructura

```
src/                  app React (App.jsx hoy solo es el modo calibración)
  data/localesDemo.js   locales del campus (a reemplazar por la RPC en T03)
  lib/supabase.js       cliente Supabase (null si faltan las variables de entorno)
supabase/
  setup_completo.sql    esquema + funciones + RLS
  migrations/           lo mismo por partes + seed de locales
  tests/pruebas.sql     29 casos de la lógica de negocio
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
