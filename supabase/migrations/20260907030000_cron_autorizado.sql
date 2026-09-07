-- La función del recolector pregunta acá si el disparo es legítimo, en vez de
-- comparar contra una variable de entorno suya. Así el secreto vive en un solo
-- lugar y, sobre todo, falla cerrado: si no está cargado, no autoriza a nadie.
create or replace function tracker.cron_autorizado(token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'cron_secreto' and decrypted_secret = token
  );
$$;

-- Solo el service_role, que es con quien entra la edge function.
revoke all on function tracker.cron_autorizado(text) from public;
revoke all on function tracker.cron_autorizado(text) from anon, authenticated;
grant execute on function tracker.cron_autorizado(text) to service_role;
