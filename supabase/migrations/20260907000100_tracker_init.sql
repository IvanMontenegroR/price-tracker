-- Tracker de precios personal. Vive en su propio schema para no mezclarse
-- con lo que ya hay en este proyecto de Supabase.
create schema if not exists tracker;

-- ─────────────────────────────────────────────────────────────────────────────
-- Parámetros de costo de importación. Globales, editables y versionados:
-- nunca se hace UPDATE, se inserta una versión nueva. Así el histórico se
-- puede recalcular con los parámetros de hoy y también con los de entonces.
-- ─────────────────────────────────────────────────────────────────────────────
create table tracker.parametros (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references auth.users(id) on delete cascade,
  tarifa_kg     numeric(10,4) not null check (tarifa_kg >= 0),
  fee_fijo      numeric(10,4) not null check (fee_fijo >= 0),
  tasa_imp      numeric(6,4)  not null check (tasa_imp >= 0 and tasa_imp < 1),
  nota          text,
  vigente_desde timestamptz not null default now(),
  creado_en     timestamptz not null default now()
);
create index on tracker.parametros (usuario_id, vigente_desde desc);

-- Catálogo de tiendas. No es por usuario: es el catálogo del sistema.
create table tracker.tienda (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  nombre     text not null,
  adaptador  text not null,
  -- Si entra en el cálculo de mercado_hoy (R3). El circuit breaker la baja.
  confiable  boolean not null default true,
  activa     boolean not null default true,
  config     jsonb not null default '{}'::jsonb,
  creado_en  timestamptz not null default now()
);

-- Estado del circuit breaker por tienda.
create table tracker.tienda_estado (
  tienda_id     uuid primary key references tracker.tienda(id) on delete cascade,
  apagada_hasta timestamptz,
  motivo        text,
  actualizado_en timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Las tres cosas separadas: producto, listing, observación.
-- ─────────────────────────────────────────────────────────────────────────────

-- La entidad abstracta. El peso vive acá porque es lo único que no se scrapea
-- y sin lo cual no hay costo puesto.
create table tracker.producto (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  nombre     text not null,
  marca      text,
  peso_kg    numeric(6,3) not null check (peso_kg > 0),
  notas      text,
  creado_en  timestamptz not null default now()
);
create index on tracker.producto (usuario_id);

-- Ese producto en una tienda concreta.
create table tracker.listing (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  producto_id uuid not null references tracker.producto(id) on delete cascade,
  tienda_id   uuid not null references tracker.tienda(id),
  url         text not null,
  sku         text,
  vendedor    text,
  condicion   text not null default 'nuevo'
              check (condicion in ('nuevo','open_box','reacondicionado')),
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  unique (producto_id, tienda_id, url)
);
create index on tracker.listing (producto_id);
create index on tracker.listing (usuario_id, activo);

-- Una lectura. Guarda los parámetros con los que se calculó, congelados.
create table tracker.observacion (
  id            bigint generated always as identity primary key,
  listing_id    uuid not null references tracker.listing(id) on delete cascade,
  usuario_id    uuid not null references auth.users(id) on delete cascade,
  ts            timestamptz not null default now(),
  precio        numeric(12,2),
  envio_us      numeric(12,2),
  moneda        text not null default 'USD',
  stock         boolean,
  origen        text not null check (origen in ('feed','api','scrape','fixture')),
  estado        text not null default 'ok' check (estado in ('ok','nula','absurda')),

  -- Parámetros congelados en el momento de la lectura.
  parametros_id uuid references tracker.parametros(id),
  peso_kg       numeric(6,3)  not null,
  tarifa_kg     numeric(10,4) not null,
  fee_fijo      numeric(10,4) not null,
  tasa_imp      numeric(6,4)  not null,

  -- El precio comparable. Columna generada: la fórmula vive en un solo lugar
  -- y la base garantiza que ninguna fila quede con un puesto inconsistente.
  --   puesto = precio + envio + peso×tarifa + fee + precio×tasa
  puesto_py numeric(12,2) generated always as (
    case when precio is null then null
    else round(
      precio + coalesce(envio_us,0) + (peso_kg * tarifa_kg) + fee_fijo + (precio * tasa_imp)
    , 2) end
  ) stored,

  crudo jsonb,
  unique (listing_id, ts)
);
create index on tracker.observacion (listing_id, ts desc);
create index on tracker.observacion (usuario_id, ts desc);
create index on tracker.observacion (ts desc) where estado = 'ok';

-- ─────────────────────────────────────────────────────────────────────────────
-- Encima: watch y alerta.
-- ─────────────────────────────────────────────────────────────────────────────
create table tracker.watch (
  id                     uuid primary key default gen_random_uuid(),
  usuario_id             uuid not null references auth.users(id) on delete cascade,
  producto_id            uuid not null references tracker.producto(id) on delete cascade,
  regla                  text not null default 'R1' check (regla in ('R1','R2','R3')),
  objetivo_puesto        numeric(12,2),
  activo                 boolean not null default true,
  -- Estado del anti-ruido.
  ultima_alerta_en       timestamptz,
  ultimo_puesto_alertado numeric(12,2),
  armado                 boolean not null default true,
  creado_en              timestamptz not null default now(),
  unique (usuario_id, producto_id, regla),
  -- R1 sin objetivo no es una regla, es un deseo.
  constraint objetivo_obligatorio_en_r1
    check (regla <> 'R1' or objetivo_puesto is not null)
);
create index on tracker.watch (usuario_id, activo);

create table tracker.alerta (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references auth.users(id) on delete cascade,
  watch_id       uuid not null references tracker.watch(id) on delete cascade,
  producto_id    uuid not null references tracker.producto(id) on delete cascade,
  observacion_id bigint references tracker.observacion(id) on delete set null,
  regla          text not null,
  puesto         numeric(12,2) not null,
  -- El desglose completo, congelado. Una alerta se tiene que poder auditar
  -- un año después aunque los parámetros hayan cambiado tres veces.
  desglose       jsonb not null,
  canales        jsonb not null default '{}'::jsonb,
  enviada_en     timestamptz not null default now()
);
create index on tracker.alerta (usuario_id, enviada_en desc);
create index on tracker.alerta (producto_id, enviada_en desc);

create table tracker.suscripcion_push (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  creado_en  timestamptz not null default now()
);

-- Bitácora del cron: sin esto no se puede saber por qué un día no llegó nada.
create table tracker.corrida (
  id           bigint generated always as identity primary key,
  inicio       timestamptz not null default now(),
  fin          timestamptz,
  leidas       int not null default 0,
  fallidas     int not null default 0,
  postergadas  int not null default 0,
  presupuesto  int,
  usadas_hoy   int,
  detalle      jsonb not null default '{}'::jsonb
);
create index on tracker.corrida (inicio desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Vistas. security_invoker: la RLS del que consulta sigue aplicando.
-- ─────────────────────────────────────────────────────────────────────────────

-- Última observación válida de cada listing.
create view tracker.v_ultima_observacion
with (security_invoker = true) as
select distinct on (o.listing_id)
  o.listing_id, o.id as observacion_id, o.usuario_id, o.ts, o.precio, o.envio_us,
  o.stock, o.estado, o.origen, o.peso_kg, o.tarifa_kg, o.fee_fijo, o.tasa_imp, o.puesto_py
from tracker.observacion o
where o.estado = 'ok'
order by o.listing_id, o.ts desc;

-- Lo que sigo: una fila por producto con su mejor precio puesto con stock.
create view tracker.v_seguimiento
with (security_invoker = true) as
with mejor as (
  select distinct on (l.producto_id)
    l.producto_id, l.id as listing_id, t.slug as tienda, t.nombre as tienda_nombre,
    l.url, l.condicion, u.puesto_py, u.precio, u.envio_us, u.stock, u.ts,
    u.peso_kg, u.tarifa_kg, u.fee_fijo, u.tasa_imp, u.observacion_id
  from tracker.listing l
  join tracker.tienda t on t.id = l.tienda_id
  join tracker.v_ultima_observacion u on u.listing_id = l.id
  where l.activo
  order by l.producto_id, u.stock desc nulls last, u.puesto_py asc
)
select
  p.id as producto_id, p.usuario_id, p.nombre, p.marca, p.peso_kg,
  w.id as watch_id, w.objetivo_puesto, w.regla, w.activo as watch_activo,
  w.armado, w.ultima_alerta_en,
  m.listing_id, m.tienda, m.tienda_nombre, m.url, m.condicion,
  m.precio, m.envio_us, m.stock, m.ts as leido_en, m.puesto_py,
  m.tarifa_kg, m.fee_fijo, m.tasa_imp, m.observacion_id,
  case when m.puesto_py is null or w.objetivo_puesto is null or w.objetivo_puesto <= 0
       then null
       else greatest(0, (m.puesto_py - w.objetivo_puesto) / w.objetivo_puesto)
  end as distancia
from tracker.producto p
left join tracker.watch w on w.producto_id = p.id and w.regla = 'R1'
left join mejor m on m.producto_id = p.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS. Todo lo del usuario es del usuario; el catálogo de tiendas se lee.
-- El cron entra con service_role, que la salta por diseño.
-- ─────────────────────────────────────────────────────────────────────────────
alter table tracker.parametros       enable row level security;
alter table tracker.producto         enable row level security;
alter table tracker.listing          enable row level security;
alter table tracker.observacion      enable row level security;
alter table tracker.watch            enable row level security;
alter table tracker.alerta           enable row level security;
alter table tracker.suscripcion_push enable row level security;
alter table tracker.tienda           enable row level security;
alter table tracker.tienda_estado    enable row level security;
alter table tracker.corrida          enable row level security;

do $do$
declare t text;
begin
  foreach t in array array['parametros','producto','listing','observacion','watch','alerta','suscripcion_push']
  loop
    execute format($f$
      create policy %1$I_propias on tracker.%1$I
        for all to authenticated
        using (usuario_id = (select auth.uid()))
        with check (usuario_id = (select auth.uid()));
    $f$, t);
  end loop;
end $do$;

create policy tienda_lectura on tracker.tienda
  for select to authenticated using (true);
create policy tienda_estado_lectura on tracker.tienda_estado
  for select to authenticated using (true);
create policy corrida_lectura on tracker.corrida
  for select to authenticated using (true);

-- El schema no se expone por PostgREST hasta que se lo agregue a
-- "Exposed schemas" en el panel; el service role del cron entra igual.
grant usage on schema tracker to authenticated, service_role;
grant select, insert, update, delete on all tables in schema tracker to authenticated;
grant all on all tables in schema tracker to service_role;
alter default privileges in schema tracker
  grant select, insert, update, delete on tables to authenticated;
