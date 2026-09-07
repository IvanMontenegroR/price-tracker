-- eBay trae dos cosas que las tiendas de precio fijo no tenían: publicaciones
-- usadas y subastas. Una subasta cambia el sentido del precio —el número de
-- hoy no es lo que voy a pagar— así que la observación tiene que decir de qué
-- tipo de venta viene y cuándo cierra.
alter table tracker.observacion
  add column if not exists tipo_venta text not null default 'fijo'
    check (tipo_venta in ('fijo', 'subasta', 'mejor_oferta')),
  add column if not exists termina_en timestamptz;

-- Para encontrar rápido lo que está por cerrar.
create index if not exists observacion_termina_en_idx
  on tracker.observacion (termina_en)
  where termina_en is not null;

-- El usado es la mitad de la gracia de eBay.
alter table tracker.listing drop constraint if exists listing_condicion_check;
alter table tracker.listing add constraint listing_condicion_check
  check (condicion in ('nuevo', 'open_box', 'reacondicionado', 'usado'));

-- La vista tiene que arrastrarlas o la pantalla no puede avisar que lo que
-- está mirando es una puja y no un precio.
drop view if exists tracker.v_seguimiento;
drop view if exists tracker.v_ultima_observacion;

create view tracker.v_ultima_observacion
with (security_invoker = true) as
select distinct on (o.listing_id)
  o.listing_id, o.id as observacion_id, o.usuario_id, o.ts, o.precio, o.envio_us,
  o.stock, o.estado, o.origen, o.tipo_venta, o.termina_en,
  o.peso_kg, o.tarifa_kg, o.fee_fijo, o.tasa_imp, o.puesto_py
from tracker.observacion o
where o.estado = 'ok'
order by o.listing_id, o.ts desc;

create view tracker.v_seguimiento
with (security_invoker = true) as
with mejor as (
  select distinct on (l.producto_id)
    l.producto_id, l.id as listing_id, t.slug as tienda, t.nombre as tienda_nombre,
    l.url, l.condicion, u.puesto_py, u.precio, u.envio_us, u.stock, u.ts,
    u.tipo_venta, u.termina_en,
    u.peso_kg, u.tarifa_kg, u.fee_fijo, u.tasa_imp, u.observacion_id
  from tracker.listing l
  join tracker.tienda t on t.id = l.tienda_id
  join tracker.v_ultima_observacion u on u.listing_id = l.id
  where l.activo
    -- Una subasta ya cerrada no es el precio actual de nada.
    and (u.termina_en is null or u.termina_en > now())
  order by l.producto_id, u.stock desc nulls last, u.puesto_py asc
)
select
  p.id as producto_id, p.usuario_id, p.nombre, p.marca, p.peso_kg,
  w.id as watch_id, w.objetivo_puesto, w.regla, w.activo as watch_activo,
  w.armado, w.ultima_alerta_en,
  m.listing_id, m.tienda, m.tienda_nombre, m.url, m.condicion,
  m.precio, m.envio_us, m.stock, m.ts as leido_en, m.puesto_py,
  m.tipo_venta, m.termina_en,
  m.tarifa_kg, m.fee_fijo, m.tasa_imp, m.observacion_id,
  case when m.puesto_py is null or w.objetivo_puesto is null or w.objetivo_puesto <= 0
       then null
       else greatest(0, (m.puesto_py - w.objetivo_puesto) / w.objetivo_puesto)
  end as distancia
from tracker.producto p
left join tracker.watch w on w.producto_id = p.id and w.regla = 'R1'
left join mejor m on m.producto_id = p.id;
