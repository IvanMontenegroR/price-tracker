-- Descubrimiento: el sistema busca las publicaciones en vez de que yo las
-- pegue. Lo obvio se adopta solo; lo dudoso espera acá a que alguien decida.
alter table tracker.producto add column if not exists buscado_en timestamptz;

create table if not exists tracker.candidato (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users(id) on delete cascade,
  producto_id     uuid not null references tracker.producto(id) on delete cascade,
  tienda_id       uuid not null references tracker.tienda(id),
  url             text not null,
  sku             text,
  titulo          text not null,
  precio          numeric(12,2),
  envio_us        numeric(12,2),
  moneda          text not null default 'USD',
  condicion       text,
  tipo_venta      text not null default 'fijo',
  termina_en      timestamptz,
  imagen_url      text,
  vendedor        text,
  puesto_estimado numeric(12,2),
  puntaje         numeric(4,3) not null,
  -- Por qué el sistema cree que es esto. Una decisión que no se explica no se
  -- puede auditar, y estas se toman solas.
  motivos         jsonb not null default '[]'::jsonb,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','aceptado','rechazado')),
  creado_en       timestamptz not null default now(),
  resuelto_en     timestamptz,
  -- Un rechazo es para siempre: no se vuelve a proponer lo mismo.
  unique (producto_id, url)
);
create index if not exists candidato_pendientes_idx
  on tracker.candidato (usuario_id, creado_en desc) where estado = 'pendiente';

alter table tracker.candidato enable row level security;
create policy candidato_propias on tracker.candidato
  for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));
grant select, insert, update, delete on tracker.candidato to authenticated;
grant all on tracker.candidato to service_role;
