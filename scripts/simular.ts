import { readFileSync, writeFileSync } from "node:fs";
import { adaptadorFixture, fijarSemilla } from "../lib/adaptadores/fixture";
import { calcularPuesto, desgloseEnTexto } from "../lib/costo";
import type { FilaPlanificacion, WatchConProducto } from "../lib/db/deposito";
import { DepositoMemoria } from "../lib/db/memoria";
import { correr } from "../lib/recolector/correr";
import { PARAMETROS_INICIALES } from "../lib/tipos";

/**
 * Corrida de humo: el sistema entero —planificación por presupuesto, lectura,
 * costo puesto, R1 y anti-ruido— corriendo un día completo contra el
 * adaptador de fixtures, sin red y sin base.
 *
 *   npx tsx scripts/simular.ts [--entrada filas.json] [--ticks 288] [--sql salida.sql]
 *
 * Con --entrada toma listings reales exportados de la base, y con --sql
 * escribe las observaciones resultantes como INSERT: así lo que termina en la
 * tabla lo produjo el mismo motor que corre en producción, no un INSERT
 * inventado a mano.
 */

const arg = (nombre: string): string | null => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : null;
};

const ticks = Number(arg("ticks") ?? 288); // 288 × 5 min = 24 h
const minutosPorTick = Number(arg("minutos") ?? 5);
const entrada = arg("entrada");
const salidaSql = arg("sql");

type Entrada = {
  filas: FilaPlanificacion[];
  watches: WatchConProducto[];
};

function sintetico(): Entrada {
  const productos = JSON.parse(readFileSync(new URL("../data/productos.json", import.meta.url), "utf8")) as {
    nombre: string;
    peso_kg: number;
    objetivo: number;
  }[];
  const tiendas = ["bestbuy", "bhphoto", "adorama"];
  const filas: FilaPlanificacion[] = [];
  const watches: WatchConProducto[] = [];

  productos.forEach((p, i) => {
    const productoId = `p${i}`;
    watches.push({
      id: `w${i}`,
      usuarioId: "u1",
      productoId,
      regla: "R1",
      objetivoPuesto: p.objetivo,
      activo: true,
      ultimaAlertaEn: null,
      ultimoPuestoAlertado: null,
      armado: true,
      productoNombre: p.nombre,
      pesoKg: p.peso_kg,
    });
    tiendas.forEach((t, j) => {
      filas.push({
        listingId: `p${i}-${t}`,
        usuarioId: "u1",
        productoId,
        productoNombre: p.nombre,
        pesoKg: p.peso_kg,
        tiendaSlug: t,
        adaptador: t,
        url: `https://${t}.example/${productoId}`,
        sku: null,
        vendedor: null,
        imagenUrl: null,
        ultimaLectura: null,
        terminaEn: null,
        historial: [],
        // El objetivo está cerca del precio de fixture: así el día produce
        // disparos y se puede ver el anti-ruido trabajando.
        distancia: j === 0 ? 0.02 : 0.2,
        evento: false,
      });
    });
  });
  return { filas, watches };
}

const datos: Entrada = entrada ? JSON.parse(readFileSync(entrada, "utf8")) : sintetico();

const deposito = new DepositoMemoria();
deposito.filas = datos.filas;
deposito.watches = datos.watches;
deposito.parametros = { ...PARAMETROS_INICIALES, id: arg("parametros") ?? undefined };

/**
 * Precio de etiqueta base por listing, invirtiendo la fórmula del puesto:
 * si quiero que el precio puesto ronde el objetivo, la etiqueta tiene que ser
 *   (objetivo − flete − fee) / (1 + tasa)
 * Así el día tiene bajadas que cruzan el objetivo de verdad, en vez de una
 * línea plana muy arriba o muy abajo.
 */
const baseDe = new Map<string, number>();
for (const f of datos.filas) {
  const w = datos.watches.find((x) => x.productoId === f.productoId);
  const objetivo = w?.objetivoPuesto ?? 500;
  const p = deposito.parametros;
  const etiqueta = (objetivo - f.pesoKg * p.tarifaKg - p.feeFijo) / (1 + p.tasaImp);
  // La primera tienda de cada producto ronda el objetivo; las otras, más caras.
  const recargo = f.tiendaSlug === datos.filas.find((x) => x.productoId === f.productoId)!.tiendaSlug ? 1 : 1.08;
  baseDe.set(f.url, Math.max(10, etiqueta * recargo));
}

const arranque = new Date();
arranque.setUTCHours(arranque.getUTCHours() - Math.floor((ticks * minutosPorTick) / 60));

let alertas = 0;
let leidas = 0;
for (let t = 0; t < ticks; t++) {
  const ahora = new Date(arranque.getTime() + t * minutosPorTick * 60_000);
  // La semilla cambia con el tiempo: la caminata del precio a lo largo del día.
  fijarSemilla(t);
  deposito.reloj = () => ahora;
  const r = await correr({
    deposito,
    // El adaptador mira la URL del pedido, así cada listing tiene su propio
    // precio en vez de compartir el de la primera fila de esa tienda.
    adaptadores: (slug) => ({
      slug,
      nombre: slug,
      origen: "fixture" as const,
      disponible: true,
      leer: (pedido) =>
        adaptadorFixture(slug, {
          base: baseDe.get(pedido.url),
          amplitud: 0.06,
          agotado: 0.08,
          fallas: 0.02,
        }).leer(pedido),
    }),
    avisar: async () => ({ email: "ok (simulado)", push: "0/0 (simulado)" }),
    ahora,
    presupuestoDiario: Number(arg("presupuesto") ?? 2000),
    maxPorTick: Number(arg("max") ?? 40),
  });
  alertas += r.alertas;
  leidas += r.leidas;
  if (process.env.DEBUG_MOTIVOS && t % 40 === 0) console.error(t, JSON.stringify(r.motivos).slice(0, 400));
}

// ── Reporte ─────────────────────────────────────────────────────────────────
const ok = deposito.observaciones.filter((o) => o.estado === "ok");
const nulas = deposito.observaciones.filter((o) => o.estado !== "ok");

console.log(`\nCorrida de ${ticks} ticks de ${minutosPorTick} min (${((ticks * minutosPorTick) / 60).toFixed(0)} h)`);
console.log(`  listings          ${datos.filas.length}`);
console.log(`  observaciones     ${deposito.observaciones.length}  (${ok.length} ok, ${nulas.length} nulas/absurdas)`);
console.log(`  peticiones usadas ${leidas + nulas.length}`);
console.log(`  alertas           ${alertas}`);
console.log(`  tiendas apagadas  ${deposito.apagados.length ? deposito.apagados.map((a) => a.slug).join(", ") : "ninguna"}`);

const porProducto = new Map<string, { nombre: string; puestos: number[] }>();
for (const o of ok) {
  const f = datos.filas.find((x) => x.listingId === o.listingId)!;
  const e = porProducto.get(f.productoId) ?? { nombre: f.productoNombre, puestos: [] };
  if (typeof o.puestoPy === "number") e.puestos.push(o.puestoPy);
  porProducto.set(f.productoId, e);
}

console.log("\nProducto                              obs   mín      máx");
for (const [, v] of porProducto) {
  const min = Math.min(...v.puestos).toFixed(2);
  const max = Math.max(...v.puestos).toFixed(2);
  console.log(`  ${v.nombre.padEnd(36).slice(0, 36)} ${String(v.puestos.length).padStart(4)}  ${min.padStart(8)} ${max.padStart(8)}`);
}

// Un desglose verificable a mano.
const muestra = ok.find((o) => o.precio !== null)!;
const filaMuestra = datos.filas.find((f) => f.listingId === muestra.listingId)!;
console.log(`\nDesglose de una observación (${filaMuestra.productoNombre}, ${filaMuestra.tiendaSlug}):`);
for (const linea of desgloseEnTexto(
  calcularPuesto(
    { precio: muestra.precio!, envioUs: muestra.envioUs, pesoKg: muestra.pesoKg },
    { tarifaKg: muestra.tarifaKg, feeFijo: muestra.feeFijo, tasaImp: muestra.tasaImp }
  )
)) {
  console.log(`  ${linea}`);
}
console.log(`  guardado en la observación: ${muestra.puestoPy}`);

if (deposito.alertas.length) {
  const a = deposito.alertas[0].alerta;
  console.log(`\nPrimera alerta: ${a.desglose.producto} en ${a.desglose.tienda} a US$ ${a.puesto.toFixed(2)}`);
}

if (salidaSql) {
  const val = (x: unknown) =>
    x === null || x === undefined ? "null" : typeof x === "number" ? String(x) : `'${String(x).replace(/'/g, "''")}'`;
  const lineas = deposito.observaciones.map(
    (o) =>
      `insert into tracker.observacion (listing_id, usuario_id, ts, precio, envio_us, moneda, stock, origen, estado, parametros_id, peso_kg, tarifa_kg, fee_fijo, tasa_imp, crudo) values (${val(o.listingId)}, ${val(o.usuarioId)}, ${val(o.ts)}, ${val(o.precio)}, ${val(o.envioUs)}, ${val(o.moneda)}, ${o.stock === null ? "null" : o.stock}, ${val(o.origen)}, ${val(o.estado)}, ${val(o.parametrosId ?? null)}, ${val(o.pesoKg)}, ${val(o.tarifaKg)}, ${val(o.feeFijo)}, ${val(o.tasaImp)}, ${val(JSON.stringify(o.crudo ?? {}))}::jsonb);`
  );
  writeFileSync(salidaSql, lineas.join("\n") + "\n");
  console.log(`\n${lineas.length} observaciones escritas en ${salidaSql}`);
}
