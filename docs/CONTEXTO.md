# MVP "RumbaLive" (Waze de la Rumba) — Documento de Contexto Técnico

**Proyecto de aula — 6to semestre Ingeniería de Software**
**Equipo:** Sebastian, Miguel, Juan Jose, Samuel

**Objetivo inmediato del equipo:** construir un **MVP funcional** para **exponerlo en la Universidad**. La ambición de convertirlo en startup real (análisis de mercado, plan de capitalización, aceleradoras) queda documentada como visión de largo plazo en este mismo documento, pero **no define el alcance de lo que se construye para la feria**.

Este documento distingue explícitamente dos capas:
- **Visión de producto completa**: todo lo diseñado hasta ahora (queda documentado, útil para el informe escrito y como roadmap real).
- **MVP factible**: el subconjunto que un equipo de 4 estudiantes puede construir y hacer funcionar en vivo en el tiempo disponible del semestre.

---

## 0. Alcance del MVP para la feria (lo que se construye)

| Debe funcionar en vivo (MVP) | Queda como diseño documentado (visión completa) |
|---|---|
| Registro/login simple (Supabase Auth) | Verificación OTP por SMS |
| Check-in manual con geolocalización (botón "Estoy aquí") | Geofencing pasivo en segundo plano |
| Geofence circular (lat/long + radio) | Polígono real dibujado por local |
| Reporte rápido: fila / cover / aforo (3 toques) | — |
| Give-to-Get simple: reportar desbloquea el mapa en vivo esa sesión | Capa 1 / Capa 2 con tokens diarios y premium de bienvenida |
| Umbral de consenso = 1 reporte (para que la demo responda al instante) | Consenso de 2-3 reportes / reputación silenciosa / disputas de negocio |
| Mapa con 5-8 locales reales de Provenza/La 70, estado por color | Expansión a más zonas/ciudades |
| App web / PWA (una sola base de código) | App móvil nativa (iOS/Android) |
| Un solo proveedor (Supabase: Postgres+PostGIS, Auth, API, Realtime) | Arquitectura de 3 servicios serverless separados (DB + Redis + funciones) |

Todo lo de la columna derecha **no se elimina del proyecto** — se documenta como parte de la visión completa (secciones 6-9 más abajo) y alimenta el informe escrito y la sección "Recomendaciones futuras" del póster. Simplemente no es lo que corre en vivo el día de la feria.

---

## 1. Problema

La vida nocturna en Medellín (zonas como Provenza y La 70) es caótica y cambia minuto a minuto. La información disponible hoy en Google o Instagram es **estática** (directorios, menús, horarios generales) y no refleja la realidad del momento: cuánta fila hay, cuánto vale el cover ahora mismo, o qué tan lleno está el local.

## 2. Solución

Un **"Waze de la rumba"**: una plataforma basada puramente en **crowdsourcing de datos en tiempo real**, impulsada por los propios usuarios. Se mapean tres fricciones inmediatas:

- Tiempo de fila
- Valor del cover en ese instante
- Aforo aproximado

### Decisión de producto ya tomada
Se **descartó por completo** el modelo de directorio estático B2B (donde los dueños de los bares actualizan la información), porque:
- Genera el problema del arranque en frío (nadie actualiza si no hay usuarios, no hay usuarios si no hay datos)
- Los negocios no tienen incentivos reales para mantenerlo actualizado

## 3. Modelo de Incentivos — "Give to Get" (Muro de Pago Social)

El usuario **no puede ver** el estado en tiempo real de los locales a su alrededor a menos que **reporte primero** el estado del local en el que se encuentra actualmente. Esto se valida mediante **geofencing**.

Este mecanismo es el corazón del producto: sin reporte no hay lectura, y ese ciclo es lo que evita que la base de datos quede vacía. Se mantiene igual en el MVP; lo que cambia es cómo se detecta la presencia del usuario (ver sección 4) y cuántos reportes hacen falta para publicar el estado (ver sección 7).

## 4. Decisiones de UX

- **Zero-Text-Entry, estilo Uber/DiDi**: nada de escribir. Toda interacción es táctil. *(se mantiene en el MVP)*
- **Geofencing**: en el MVP es un **check-in manual** — el usuario presiona "Estoy en este local" y ahí se valida su ubicación. La versión de producto completa usa geofencing **pasivo** en segundo plano (sin que el usuario haga nada), pero eso requiere app nativa (ver sección 5).
- **Estética**: colores neón de alto contraste sobre fondo OLED negro puro.
- **Tres variables puras**: Fila (semáforo verde/amarillo/rojo), Cover (tarjetas grandes), Aforo (termómetro visual).
- **Corrección de accesibilidad**: el semáforo de colores solo no basta (falla para usuarios daltónicos) — cada estado se acompaña de ícono + texto en negrita (ej. ⚡ + "Menos de 5 min").

## 5. Restricciones Técnicas y de Infraestructura

- El backend debe estar optimizado para **lecturas geoespaciales** y **escrituras concurrentes**, sin quemar recursos de cómputo innecesarios.
- Filosofía explícita: **cero sobreingeniería** — solo lo esencial para probar el concepto frente al jurado.
- **Decisión de plataforma (MVP): app web / PWA, no nativa.** La razón original para exigir nativa era el geofencing pasivo en segundo plano; como el MVP usa check-in manual (sección 4), esa restricción no aplica todavía. App nativa con geofencing pasivo real queda como el camino de producto completo si el proyecto avanza más allá de la feria.

---

## 6. Arquitectura del MVP (factible para la feria)

**Un solo proveedor: Supabase** — Postgres administrado con la extensión PostGIS habilitada, Auth, API REST autogenerada (PostgREST) y suscripciones en tiempo real (Realtime), todo en un solo proyecto con capa gratuita.

**Por qué un solo proveedor y no la arquitectura de 3 servicios separados** (Postgres serverless + Redis serverless + funciones serverless en Cloud Run/Lambda, como se había planteado inicialmente): para 4 estudiantes sin experiencia previa en DevOps, orquestar tres servicios de tres proveedores distintos es carga operativa que no aporta nada a una demo con tráfico de un puñado de usuarios en un piloto de 5-8 bares. Esa arquitectura de 3 servicios queda documentada como la opción correcta si el producto llega a operar con tráfico real (ver comparación en la sección 0).

**Diagrama de infraestructura del MVP:**

```
[App web / PWA]
        │ HTTPS
        ▼
[Supabase: Auth + API REST (PostgREST) + Realtime]
        ▼
[Postgres + PostGIS]   (capa gratuita — suficiente para el piloto)
```

- **Geofence circular, no polígono**: `ST_DWithin(centroide, punto_usuario, radio_m)` en vez de `ST_Contains` contra un polígono dibujado a mano. Cargar un local nuevo es una sola fila con lat/long + radio.
- **Sin Redis**: con 5-8 locales y el tráfico de una feria, Postgres responde sin problema directamente. Cachear el estado agregado queda documentado como optimización de escala real, no del MVP.
- **Seguridad:** gestionada por Supabase (Auth con JWT); no hay VM, puertos ni llaves SSH que administrar.
- **Give-to-Get en la base de datos:** el muro se implementa con una política RLS (Row Level Security) que solo permite leer el estado de los locales si el usuario tiene un reporte vigente. Al vivir en la base de datos, protege tanto la API REST como las suscripciones de Realtime.

---

## 7. Reglas Anti-Fraude y Moderación

- **Dwell-time** (regla única): el último check-in válido del usuario en ese local debe tener **mínimo 3 min** de antigüedad (permanencia) y **máximo 2 h** (vigencia; pasado ese tiempo debe repetir el check-in). Ambos valores son parámetros configurables. Se mantiene en el MVP — es barato de implementar (comparar el timestamp del check-in contra el del reporte) y demuestra la idea sin fricción de arquitectura.
- **Umbral de consenso**: en el MVP se deja en **1 reporte** (activa el estado al instante, para que la demo responda en vivo frente al jurado). El valor de producto completo es **2-3 reportes coincidentes en 15 minutos** — queda documentado como el comportamiento previsto a mayor escala.
- **Reputación silenciosa por usuario** y **mecanismo de disputa para negocios** (subir el umbral a 5-6 reportes con límite mensual): **fuera de alcance del MVP** — diseño completo documentado, no implementado (ver sección 13).

## 8. Mecánica de Monetización de Uso — visión completa (fuera de alcance del MVP)

Esta sección describe el diseño completo de acceso por capas; **el MVP no implementa nada de esto** — su Give-to-Get es el simple de la sección 3 (reportar desbloquea el mapa en vivo por esa sesión).

- **Capa 1 (planeación en casa)**: 3 tokens/pases diarios gratis para consultar el radar sin haber reportado aún ese día.
- **Capa 2 (modo en vivo, en el sitio)**: reportar (Give-to-Get) desbloquea el radar ilimitado esa noche.
- **Premium de bienvenida**: la primera vez que un usuario nuevo entra a Capa 2, se le regala acceso ilimitado esa noche sin necesidad de reportar aún. Gateado por **verificación OTP de celular**.
- **Publicidad**: banners discretos (ej. AdMob con soporte de modo oscuro) — ingreso secundario, no el motor principal del modelo (ese es el B2B2C vía datos/negocios).

### Principios de monetización de datos (a futuro, no ejecutado)
- Nunca vender un insight agregado con menos de 5-10 reportes independientes
- Siempre a nivel de zona/franja horaria, nunca el reporte individual crudo
- Requiere consentimiento separado del consentimiento básico de uso de la app

### Pregunta abierta — qué hacer entre semana (lunes-jueves)
No resuelta; tres caminos posibles: extender a happy hour/almuerzo, convertir la Capa 1 en "modo planeación" con datos históricos, o aceptar que entre semana es tiempo operativo/B2B. No bloquea el MVP de la feria.

---

## 9. Modelo de Datos — Esquema MVP

```sql
-- USUARIOS (Supabase Auth maneja credenciales; esta tabla solo extiende datos propios)
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT now(),
    ultimo_reporte_en TIMESTAMPTZ       -- clave para validar el Give to Get
);

-- LOCALES — geofence circular (radio), no polígono
CREATE TABLE locales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(150) NOT NULL,
    categoria VARCHAR(50),
    centroide GEOGRAPHY(POINT, 4326) NOT NULL,
    radio_geofence_m INT DEFAULT 40,
    zona VARCHAR(50)                    -- 'Provenza', 'La 70'
);

CREATE INDEX idx_locales_centroide ON locales USING GIST (centroide);

-- CHECKINS (el usuario declara "Estoy en este local"; es la base del dwell-time)
CREATE TABLE checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES usuarios(id),
    local_id UUID REFERENCES locales(id),
    ubicacion GEOGRAPHY(POINT, 4326) NOT NULL,
    geofence_valido BOOLEAN NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_checkins_usuario_local ON checkins (usuario_id, local_id, creado_en DESC);

-- REPORTES (log append-only)
CREATE TABLE reportes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES usuarios(id),
    local_id UUID REFERENCES locales(id),
    tipo VARCHAR(20) NOT NULL,          -- 'fila', 'cover', 'aforo'
    valor NUMERIC,
    ubicacion_reporte GEOGRAPHY(POINT, 4326) NOT NULL,
    geofence_valido BOOLEAN NOT NULL,
    dwell_time_cumplido BOOLEAN NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reportes_local_tiempo ON reportes (local_id, creado_en DESC);
```

**Esquema completo (visión de producto, no implementado en el MVP):** agrega a `usuarios` los campos `telefono_verificado`, `tokens_capa1_hoy`, `premium_bienvenida_usado` y `reputacion`; cambia `locales.centroide` por un `poligono GEOGRAPHY(POLYGON)`; y añade una tabla `disputas` (`local_id`, `activada_en`, `expira_en`, `umbral_elevado`) para el mecanismo de disputa de negocios de la sección 7.

---

## 10. Endpoints del MVP

Estos son los nombres lógicos de la API. En Supabase se exponen como funciones PostgREST (`/rpc/<función>`); la correspondencia está en la tabla al final de esta sección.

### `POST /checkins`
El usuario presiona "Estoy en este local". Se valida el geofence y se registra el check-in, que más adelante sirve de base para el dwell-time.
```
Body: { local_id, lat, long }
Server: ST_DWithin(centroide_local, ST_MakePoint(long, lat), radio_geofence_m) → geofence_valido
Efecto: INSERT en checkins
Response: { geofence_valido: bool }
```

### `POST /reportes`
```
Body: { local_id, tipo, valor, lat, long }
Server: 1) geofence: ST_DWithin(centroide_local, ST_MakePoint(long, lat), radio_geofence_m)
        2) dwell-time: el check-in válido más reciente del usuario en ese local
           tiene entre 3 min y 2 h de antigüedad (límites incluidos: 3 min ≤ edad ≤ 2 h)
Efecto: INSERT en reportes + UPDATE usuarios.ultimo_reporte_en = now()
Response: { geofence_valido: bool, dwell_time_cumplido: bool, acceso_desbloqueado: bool }
```

### `GET /locales/nearby?lat={}&long={}&radio_m={}`
Público para cualquier usuario autenticado, sin Give-to-Get. Devuelve los pines genéricos (nombre, categoría y ubicación), **sin** fila/cover/aforo; es lo que se ve en el estado bloqueado.
```sql
SELECT id, nombre, categoria, centroide,
       ST_Distance(centroide, ST_MakePoint(:long,:lat)::geography) AS distancia
FROM locales
WHERE ST_DWithin(centroide, ST_MakePoint(:long,:lat)::geography, :radio_m)
ORDER BY distancia ASC;
```

### `GET /locales/{id}/status`
**Este es el endpoint protegido por el Give-to-Get.** Si `ultimo_reporte_en` no está vigente (esa noche), el acceso se deniega.
```
- fila: valor del reporte válido más reciente (consenso = 1 en el MVP)
- cover: valor del reporte más reciente
- aforo: valor del reporte más reciente
Response: { fila_min, cover_valor, aforo_pct, ultima_actualizacion, num_reportes_base }
```

*(El endpoint `POST /locales/{id}/disputa` del diseño completo no aplica al MVP — ver sección 7.)*

### Correspondencia con Supabase

| Endpoint lógico | Función PostgREST |
|---|---|
| `POST /checkins` | `crear_checkin` |
| `POST /reportes` | `crear_reporte` |
| `GET /locales/nearby` | `locales_cercanos` |
| `GET /locales/{id}/status` | `estado_local` |

---

## 11. Proceso de Uso del MVP (Flujo End-to-End)

```
1. ONBOARDING
   Registro/login (email, Supabase Auth) → permisos de geolocalización

2. ESTADO BLOQUEADO (default)
   Mapa visible con pines genéricos de los 5-8 locales del piloto (GET /locales/nearby, sin fila/cover/aforo)

3. CHECK-IN (botón, no pasivo)
   Usuario presiona "Estoy en este local" → POST /checkins valida el geofence circular y registra el check-in

4. REPORTE — 3 toques
   Usuario reporta fila (semáforo) / cover (tarjeta) / aforo (termómetro)
   → validación server-side de geofence + dwell-time

5. DESBLOQUEO (Get)
   Reportar desbloquea fila/cover/aforo del resto de locales (GET /locales/{id}/status) por esa sesión

6. CONSUMO DE DATOS
   Usuario navega el mapa con datos agregados de los locales cercanos (Realtime)

7. FIN DE SESIÓN
   Al cerrar sesión o pasar a un nuevo día, se vuelve a pedir reporte para desbloquear
```

---

## 12. Funcionalidades del MVP (lo que se construye)

1. **Mapa con actualización en tiempo real** (Supabase Realtime) — pines por color + ícono/texto según estado
2. **Check-in por botón** con validación de geofence circular
3. **Reporte táctil de 3 toques** — semáforo (fila), tarjeta (cover), termómetro (aforo)
4. **Give-to-Get simple** — reportar desbloquea el mapa en vivo esa sesión
5. **Dwell-time** — el botón de reporte solo se habilita tras unos minutos dentro del geofence
6. **Piloto de 5-8 locales reales** en Provenza/La 70

## 13. Fuera de Alcance del MVP (documentado como visión de producto completa)

- App móvil nativa con geofencing pasivo en segundo plano
- Verificación OTP por SMS
- Sistema de acceso por capas (Capa 1 tokens diarios / Capa 2 / premium de bienvenida)
- Consenso de 2-3 reportes coincidentes, reputación silenciosa por usuario, mecanismo de disputa para negocios
- Polígonos reales por local (geofence circular en su lugar)
- Arquitectura de 3 servicios serverless separados (DB + Redis + funciones) — un solo proveedor (Supabase) en su lugar
- Moderación con Machine Learning
- Chat o mensajería entre usuarios
- Pasarela de pago (el cover reportado es informativo, no transaccional)
- Notificaciones push predictivas o personalizadas
- Panel de administración para dueños de bares (modelo descartado explícitamente)
- Monetización de datos agregados (principios definidos en la sección 8, no implementada)
- Resolución del modo "entre semana" (sección 8) — decisión de negocio pendiente, no bloquea la demo académica
- Publicidad (AdMob u otro proveedor)

---

## 14. Decisiones de implementación (octubre 2026)

- **Frontend:** PWA en React + Vite (JavaScript), Leaflet con mapa base OpenStreetMap. Proyecto en `RumbaLive/`.
- **Demo:** en el campus del TdeA (sede Robledo), con 4 locales de prueba: Parqueadero arriba, Parqueadero abajo, Cafetería principal y Cafetería Apolo 11. El póster mantiene el enfoque Provenza/La 70; el campus es el entorno de pruebas del piloto.
- **Geofence:** radio por local (columna `radio_geofence_m`; 35 m en los parqueaderos y 20 m en las cafeterías). Se suma el margen de error del GPS que reporta el celular, con tope de 25 m. Si varios geofences contienen al usuario, el check-in se asigna al local más cercano (diferencia respecto a "radio fijo" del diagrama de componentes).
- **Parámetros (tabla `config`):** dwell-time mínimo 3 min; vigencia del check-in 2 h; vigencia de un reporte en el estado del local 60 min; acceso Give-to-Get 180 min tras reportar; 2 min entre dos reportes del mismo tipo (antiabuso).
- **Escrituras:** los clientes no escriben en las tablas; solo llaman a `crear_checkin` y `crear_reporte` (SECURITY DEFINER). Lectura de reportes ajenos, por consulta o por Realtime, protegida por RLS (`tiene_acceso()`).
- **Pruebas:** `supabase/tests/pruebas.sql` (46 casos; cubre TC-01 a TC-04, TC-06, TC-07 y TC-10 del QA). TC-05 (concurrencia) y TC-08 (reconexión del WebSocket) se prueban a mano.

### Pase gratis (decisión de noviembre 2026)
Para que el usuario pruebe el valor antes de dar algo a cambio, cada cuenta tiene **1 pase gratis de por vida en el MVP** (la versión final tendrá 3): permite ver el estado de un solo local durante 180 min sin reportar. Es un parámetro (`pases_gratis_max`), no una regla de código. El pase se gasta explícitamente (con confirmación) y lo impone el servidor (`usar_pase_gratis`, migración 0005), no la interfaz. Los diagramas C4 y el póster no cambian: es una regla dentro de la misma capa de funciones/RLS.
