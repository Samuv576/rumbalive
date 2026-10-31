# Pruebas de punta a punta (modo demo)

`tests/e2e/flujo.cjs` abre la app en Chromium (Playwright) con el backend simulado y reproduce el flujo completo con tiempos acortados
(`?dwell=6&cooldown=8&acceso=20`). Última corrida: **36 PASA / 0 FALLA**.

| Qué comprueba | Tarea / caso |
|---|---|
| 4 locales y mapa sin sesión; estado bloqueado y check-in piden iniciar sesión | T03, T02, T06 |
| Error de login en español; registro; la sesión sobrevive a recargar (y el check-in vigente) | T02 |
| Check-in con GPS dentro del geofence; cuenta regresiva; botones deshabilitados hasta cumplir el dwell-time | T04, T05 |
| Reporte exitoso; estado desbloqueado con «hace X min»; segundo reporte igual → «demasiado pronto» | T05, T06, TC-10 |
| Usuario B sin reportes no ve el estado; A ve el reporte de B sin recargar | T06, T07 |
| Sin red: «Sin conexión», A conserva el dato viejo; al volver se reconcilia y vuelve a «En vivo» | T07, TC-08 |
| Vencido el acceso, vuelve a bloqueado | T06 |
| Pase gratis: se ofrece 1, pide confirmación, cancelar no lo gasta, ve solo ese local, recibe sus cambios en vivo, no hay segundo pase y vence | T06, T07 |
| Fuera del geofence → «Acércate…» y no queda check-in | T04 |
| Permiso de ubicación denegado → mapa sí, check-in no, con aviso | T03, T04, TC-09 |
| Lejos del campus → usa el campus y avisa; `?calibrar=1` abre la calibración | T03 |

**Qué NO prueba:** nada de esto toca Supabase. Hay que repetirlo a mano contra el proyecto real (T01 → T09), sobre todo Realtime con 2 celulares.
