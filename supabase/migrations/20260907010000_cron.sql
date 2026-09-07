-- El cron vive en la base: pg_cron dispara, pg_net hace el POST a la edge
-- function. No hay servidor propio que programar, y la service_role nunca
-- sale de Supabase.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- El secreto que autoriza el disparo va a Vault y no al comando del cron:
-- cron.job lo puede leer cualquiera que mire el catálogo.
do $do$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secreto') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'cron_secreto',
      'Autoriza el POST de pg_cron a la edge function recolectar'
    );
  end if;
end $do$;

-- Cada cinco minutos. Que los disparos no sean exactos no importa: el
-- planificador no asume ticks parejos, mira qué está vencido y cuánto
-- presupuesto queda.
select cron.schedule(
  'recolectar',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://ofekkczobrxhjoyggtmc.supabase.co/functions/v1/recolectar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secreto', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secreto')
    ),
    timeout_milliseconds := 55000
  );
  $cron$
);

-- Arranca apagado: hasta que la función esté desplegada, cada disparo sería
-- un 404 cada cinco minutos. Se prende con:
--   select cron.alter_job((select jobid from cron.job where jobname='recolectar'), active := true);
select cron.alter_job((select jobid from cron.job where jobname = 'recolectar'), active := false);
