-- RumbaLive · 0003 · Seguridad (RLS) y tiempo real
-- Regla general: los clientes NO escriben en las tablas; solo llaman a las funciones de 0002.

alter table public.config    enable row level security;   -- sin políticas: inaccesible desde la API
alter table public.usuarios  enable row level security;
alter table public.locales   enable row level security;
alter table public.checkins  enable row level security;
alter table public.reportes  enable row level security;

revoke all on public.config, public.usuarios, public.locales, public.checkins, public.reportes
  from anon, authenticated;
grant select on public.locales to anon, authenticated;
grant select on public.usuarios, public.checkins, public.reportes to authenticated;

drop policy if exists locales_lectura   on public.locales;
drop policy if exists usuarios_propio   on public.usuarios;
drop policy if exists checkins_propios  on public.checkins;
drop policy if exists reportes_g2g      on public.reportes;

create policy locales_lectura  on public.locales  for select to anon, authenticated using (activo);
create policy usuarios_propio  on public.usuarios for select to authenticated using (id = auth.uid());
create policy checkins_propios on public.checkins for select to authenticated using (usuario_id = auth.uid());

-- Give-to-Get: ver reportes ajenos (por consulta o por suscripción Realtime) exige haber reportado hace poco.
create policy reportes_g2g on public.reportes for select to authenticated
  using (public.tiene_acceso() or usuario_id = auth.uid());

-- Tiempo real: Realtime respeta la política anterior.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reportes') then
    alter publication supabase_realtime add table public.reportes;
  end if;
end $$;
