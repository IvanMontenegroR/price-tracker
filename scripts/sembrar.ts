import { readFileSync } from "node:fs";
import { clienteAdmin } from "../lib/supabase/admin";

/**
 * Carga las tiendas y los 10 productos con su peso y su objetivo.
 *
 *   npx tsx scripts/sembrar.ts <usuario_id>
 *
 * Los pesos son estimaciones mías: son lo único que no se puede leer de la
 * tienda y hay que corregirlos contra la etiqueta real del courier. Un peso
 * mal cargado corre el precio puesto de todo el producto.
 */

const TIENDAS = [
  // La fuente principal: API oficial, gratis, y la única que da subastas y
  // usado, que es donde aparecen los precios que valen la pena.
  { slug: "ebay", nombre: "eBay", adaptador: "ebay", confiable: true },

  // Sin API: JSON-LD, un GET por lectura. Quedan disponibles por si hago
  // falta comparar contra precio de lista nuevo.
  { slug: "bhphoto", nombre: "B&H Photo", adaptador: "bhphoto", confiable: true },
  { slug: "adorama", nombre: "Adorama", adaptador: "adorama", confiable: true },
  { slug: "newegg", nombre: "Newegg", adaptador: "newegg", confiable: true },

  // Registradas pero apagadas. Amazon, porque su contrato exige la PA-API y
  // esa API exige una cuenta de Associates con ventas. Best Buy, porque no lo
  // sigo. Prenderlas es poner activa: true.
  { slug: "amazon", nombre: "Amazon", adaptador: "amazon", confiable: false, activa: false },
  { slug: "bestbuy", nombre: "Best Buy", adaptador: "bestbuy", confiable: true, activa: false },
];

async function main() {
  const usuarioId = process.argv[2];
  if (!usuarioId) throw new Error("uso: tsx scripts/sembrar.ts <usuario_id>");

  const sb = clienteAdmin();
  const productos = JSON.parse(readFileSync(new URL("../data/productos.json", import.meta.url), "utf8"));

  for (const t of TIENDAS) {
    const { error } = await sb.from("tienda").upsert({ activa: true, ...t }, { onConflict: "slug" });
    if (error) throw new Error(`tienda ${t.slug}: ${error.message}`);
  }

  const { error: eParam } = await sb.from("parametros").insert({
    usuario_id: usuarioId,
    tarifa_kg: 7,
    fee_fijo: 5,
    tasa_imp: 0.15,
    nota: "valores de arranque, sin calibrar contra factura",
  });
  if (eParam) throw new Error(`parámetros: ${eParam.message}`);

  for (const p of productos) {
    const { data: producto, error } = await sb
      .from("producto")
      .insert({
        usuario_id: usuarioId,
        nombre: p.nombre,
        marca: p.marca,
        peso_kg: p.peso_kg,
        notas: p.notas,
      })
      .select("id")
      .single();
    if (error) throw new Error(`producto ${p.nombre}: ${error.message}`);

    const { error: eWatch } = await sb.from("watch").insert({
      usuario_id: usuarioId,
      producto_id: producto.id,
      regla: "R1",
      objetivo_puesto: p.objetivo,
    });
    if (eWatch) throw new Error(`watch ${p.nombre}: ${eWatch.message}`);
    console.log(`· ${p.nombre} — ${p.peso_kg} kg — objetivo US$ ${p.objetivo}`);
  }

  console.log(`\n${productos.length} productos cargados. Falta pegarle a cada uno su URL de tienda.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
