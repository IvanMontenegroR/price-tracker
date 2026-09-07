import { strict as assert } from "node:assert";
import { test } from "node:test";
import { adaptadorFixture } from "../adaptadores/fixture.ts";
import type { Adaptador } from "../adaptadores/tipos.ts";
import { DepositoMemoria } from "../db/memoria.ts";
import type { FilaPlanificacion, WatchConProducto } from "../db/deposito.ts";
import { correr } from "./correr.ts";

const fila = (p: Partial<FilaPlanificacion> & { listingId: string }): FilaPlanificacion => ({
  usuarioId: "u1",
  productoId: "p1",
  productoNombre: "iPhone 17 Pro 256GB",
  pesoKg: 0.4,
  tiendaSlug: "bestbuy",
  adaptador: "fixture",
  url: `https://tienda.example/${p.listingId}`,
  sku: null,
  vendedor: null,
  ultimaLectura: null,
  historial: [],
  distancia: 0.01,
  evento: false,
  ...p,
});

const watch = (p: Partial<WatchConProducto> = {}): WatchConProducto => ({
  id: "w1",
  usuarioId: "u1",
  productoId: "p1",
  regla: "R1",
  objetivoPuesto: 1200,
  activo: true,
  ultimaAlertaEn: null,
  ultimoPuestoAlertado: null,
  armado: true,
  productoNombre: "iPhone 17 Pro 256GB",
  pesoKg: 0.4,
  ...p,
});

/** Fixture con precio fijo, para poder afirmar números exactos. */
const fijo = (precio: number | null, stock: boolean | null = true): Adaptador => ({
  slug: "fijo",
  nombre: "fijo",
  origen: "fixture",
  disponible: true,
  async leer() {
    return { precio, envio: 0, moneda: "USD", stock, ts: new Date().toISOString() };
  },
});

test("de punta a punta: lee, guarda la observación y avisa con el desglose", async () => {
  const d = new DepositoMemoria();
  d.filas = [fila({ listingId: "l1" })];
  d.watches = [watch()];
  const avisos: unknown[] = [];

  const r = await correr({
    deposito: d,
    adaptadores: () => fijo(999),
    avisar: async (_dest, contenido) => {
      avisos.push(contenido);
      return { email: "ok", push: "0/0 enviados" };
    },
  });

  assert.equal(r.leidas, 1);
  assert.equal(d.observaciones.length, 1);
  // 999 + 0 + 0.4×7 + 5 + 999×0.15 = 1156.65
  assert.equal(d.observaciones[0].puestoPy, 1156.65);
  assert.equal(r.alertas, 1);
  assert.equal(d.alertas[0].alerta.puesto, 1156.65);
  assert.equal(d.alertas[0].alerta.desglose.impuesto, 149.85);
  assert.equal(d.alertas[0].alerta.desglose.flete, 2.8);
  assert.equal(avisos.length, 1);
});

test("la segunda corrida no repite el aviso: cooldown", async () => {
  const d = new DepositoMemoria();
  d.filas = [fila({ listingId: "l1" })];
  d.watches = [watch()];
  const correrUna = () =>
    correr({
      deposito: d,
      adaptadores: () => fijo(999),
      avisar: async () => ({ email: "ok" }),
      ahora: new Date(),
    });

  const a = await correrUna();
  const b = await correrUna();
  assert.equal(a.alertas, 1);
  assert.equal(b.alertas, 0);
  assert.match(b.motivos["iPhone 17 Pro 256GB"], /cooldown/);
});

test("precio bajo pero agotado no genera aviso", async () => {
  const d = new DepositoMemoria();
  d.filas = [fila({ listingId: "l1" })];
  d.watches = [watch()];
  const r = await correr({
    deposito: d,
    adaptadores: () => fijo(500, false),
    avisar: async () => ({ email: "ok" }),
  });
  assert.equal(d.observaciones.length, 1);
  assert.equal(r.alertas, 0);
  assert.match(r.motivos["iPhone 17 Pro 256GB"], /stock/);
});

test("un adaptador roto se guarda como lectura nula y apaga la tienda", async () => {
  const d = new DepositoMemoria();
  d.filas = Array.from({ length: 8 }, (_, i) => fila({ listingId: `l${i}`, tiendaSlug: "newegg" }));
  const roto: Adaptador = {
    slug: "roto",
    nombre: "roto",
    origen: "scrape",
    disponible: true,
    async leer() {
      throw new Error("503");
    },
  };
  const r = await correr({ deposito: d, adaptadores: () => roto, avisar: async () => ({}) });

  assert.equal(r.fallidas, 8);
  assert.equal(d.observaciones.every((o) => o.estado === "nula"), true);
  assert.equal(d.apagados.length, 1);
  assert.equal(d.apagados[0].slug, "newegg");
  assert.match(d.apagados[0].motivo, /8\/8/);
});

test("una tienda apagada no se vuelve a leer en la corrida siguiente", async () => {
  const d = new DepositoMemoria();
  d.filas = [fila({ listingId: "l1", tiendaSlug: "newegg" })];
  d.tiendasApagadas.add("newegg");
  const r = await correr({ deposito: d, adaptadores: () => fijo(100), avisar: async () => ({}) });
  assert.equal(r.leidas, 0);
});

test("con el presupuesto casi agotado los fríos se caen y los calientes siguen", async () => {
  const d = new DepositoMemoria();
  d.filas = [
    ...Array.from({ length: 10 }, (_, i) => fila({ listingId: `frio${i}`, distancia: 0.9 })),
    fila({ listingId: "caliente", distancia: 0.01 }),
  ];
  d.usadasHoy = 99;
  const r = await correr({
    deposito: d,
    adaptadores: () => fijo(100),
    avisar: async () => ({}),
    presupuestoDiario: 100,
  });

  assert.equal(r.detalle.soloCalientes, true);
  assert.equal(r.leidas, 1);
  assert.equal(d.observaciones[0].listingId, "caliente");
  assert.equal(r.usadasHoy <= 100, true);
});

test("el adaptador de Amazon no rompe la corrida", async () => {
  const d = new DepositoMemoria();
  d.filas = [fila({ listingId: "l1", tiendaSlug: "amazon", adaptador: "amazon" })];
  const r = await correr({ deposito: d, avisar: async () => ({}) });
  assert.equal(r.leidas, 0);
  assert.equal((r.detalle.errores as Record<string, string>).amazon, "adaptador no disponible");
});

test("con muchos listings el fixture llena la tabla de observaciones", async () => {
  const d = new DepositoMemoria();
  d.filas = Array.from({ length: 12 }, (_, i) =>
    fila({ listingId: `l${i}`, productoId: `p${i % 4}`, distancia: 0.02 })
  );
  const r = await correr({
    deposito: d,
    adaptadores: () => adaptadorFixture("f", { base: 300, agotado: 0 }),
    avisar: async () => ({}),
  });
  assert.equal(r.leidas, 12);
  assert.equal(d.observaciones.filter((o) => o.estado === "ok").length, 12);
});
