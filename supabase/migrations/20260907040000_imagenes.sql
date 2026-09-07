-- La foto la trae la publicación, no la cargo a mano: eBay la devuelve en el
-- mismo item del que sale el precio. Vive en el listing porque es de la
-- publicación; el producto tiene la suya para cuando todavía no hay listing
-- o para pisarla si la de la tienda es fea.
alter table tracker.listing  add column if not exists imagen_url text;
alter table tracker.producto add column if not exists imagen_url text;

drop view if exists tracker.v_seguimiento;

create view tracker.v_seguimiento
with (security_invoker = true) as
with mejor as (
  select distinct on (l.producto_id)
    l.producto_id, l.id as listing_id, t.slug as tienda, t.nombre as tienda_nombre,
    l.url, l.condicion, l.imagen_url,
    u.puesto_py, u.precio, u.envio_us, u.stock, u.ts,
    u.tipo_venta, u.termina_en,
    u.peso_kg, u.tarifa_kg, u.fee_fijo, u.tasa_imp, u.observacion_id
  from tracker.listing l
  join tracker.tienda t on t.id = l.tienda_id
  join tracker.v_ultima_observacion u on u.listing_id = l.id
  where l.activo
    and (u.termina_en is null or u.termina_en > now())
  order by l.producto_id, u.stock desc nulls last, u.puesto_py asc
)
select
  p.id as producto_id, p.usuario_id, p.nombre, p.marca, p.peso_kg,
  -- La del producto manda: si la cargué a mano es porque la de la tienda no servía.
  coalesce(p.imagen_url, m.imagen_url) as imagen,
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
