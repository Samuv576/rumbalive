# Probar el SQL en un Postgres local

`stub_supabase.sql` imita lo mínimo de Supabase (roles `anon`/`authenticated`, esquema `auth`, `auth.uid()`, publicación `supabase_realtime`). **No ejecutarlo en Supabase.**

Necesitas PostgreSQL 16 con PostGIS. Ejemplo:

```bash
createdb rl && psql -d rl -c "create schema extensions"
psql -d rl -v ON_ERROR_STOP=1 -f supabase/local/stub_supabase.sql -f supabase/setup_completo.sql
psql -d rl -f supabase/tests/pruebas.sql      # 29 filas PASA
```
