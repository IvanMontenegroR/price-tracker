import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PARAMETROS_INICIALES, type Observacion, type Watch } from "../tipos";
import { evaluarR1, type Candidata } from "./r1";

const ahora = new Date("2026-09-07T12:00:00Z");

const obs = (p: Partial<Observacion>): Observacion => ({
  listingId: "l1",
  usuarioId: "u1",
  ts: ahora.toISOString(),
  precio: 900,
  envioUs: 0,
  moneda: "USD",
  stock: true,
  origen: "fixture",
  estado: "ok",
  parametrosId: null,
  pesoKg: 0.4,
  tarifaKg: 7,
  feeFijo: 5,
  tasaImp: 0.15,
  ...p,
});

const cand = (o: Partial<Observacion>, tienda = "bestbuy"): Candidata => ({
  observacion: obs(o),
  tienda,
  url: `https://${tienda}.example/p`,
});

const watch = (p: Partial<Watch> = {}): Watch => ({
  id: "w1",
  usuarioId: "u1",
  productoId: "p1",
  regla: "R1",
  objetivoPuesto: 1100,
  activo: true,
  ultimaAlertaEn: null,
  ultimoPuestoAlertado: null,
  armado: true,
  ...p,
});

const ctx = { ahora, alertasHoy: 0, ultimaAlertaProducto: null };

test("avisa cuando el precio puesto queda bajo el objetivo", () => {
  // 900 → 900 + 2.80 + 5 + 135 = 1042.80, bajo el objetivo de 1100.
  const r = evaluarR1(watch(), [cand({})], PARAMETROS_INICIALES, ctx);
  assert.equal(r.avisa, true);
  if (r.avisa) assert.equal(r.desglose.puesto, 1042.8);
});

test("la etiqueta bajo el objetivo no alcanza: decide el puesto", () => {
  // 1000 de etiqueta parece < 1100, pero puesto son 1157.80.
  const r = evaluarR1(watch(), [cand({ precio: 1000 })], PARAMETROS_INICIALES, ctx);
  assert.equal(r.avisa, false);
  if (!r.avisa) assert.equal(r.mejor?.desglose.puesto, 1157.8);
});

test("elige la tienda más barata puesta, no la de etiqueta más baja", () => {
  const r = evaluarR1(
    watch(),
    [
      cand({ listingId: "a", precio: 890, envioUs: 60 }, "newegg"),
      cand({ listingId: "b", precio: 900, envioUs: 0 }, "bestbuy"),
    ],
    PARAMETROS_INICIALES,
    ctx
  );
  assert.equal(r.avisa, true);
  if (r.avisa) assert.equal(r.candidata.tienda, "bestbuy");
});

test("prefiere una con stock antes que una más barata agotada", () => {
  const r = evaluarR1(
    watch(),
    [
      cand({ listingId: "a", precio: 700, stock: false }, "adorama"),
      cand({ listingId: "b", precio: 900, stock: true }, "bestbuy"),
    ],
    PARAMETROS_INICIALES,
    ctx
  );
  assert.equal(r.avisa, true);
  if (r.avisa) assert.equal(r.candidata.tienda, "bestbuy");
});

test("si la única barata está agotada, no avisa", () => {
  const r = evaluarR1(watch(), [cand({ precio: 700, stock: false })], PARAMETROS_INICIALES, ctx);
  assert.equal(r.avisa, false);
  if (!r.avisa) assert.match(r.motivo, /stock/);
});

test("una lectura vieja no dispara nada", () => {
  const vieja = new Date(ahora.getTime() - 20 * 3.6e6).toISOString();
  const r = evaluarR1(watch(), [cand({ ts: vieja })], PARAMETROS_INICIALES, ctx);
  assert.equal(r.avisa, false);
  if (!r.avisa) assert.match(r.motivo, /frescas/);
});

test("usa los parámetros congelados de la observación, no los de hoy", () => {
  // Observación tomada con tarifa 20/kg sobre un producto de 5 kg.
  const r = evaluarR1(
    watch({ objetivoPuesto: 1100 }),
    [cand({ precio: 900, pesoKg: 5, tarifaKg: 20 })],
    PARAMETROS_INICIALES,
    ctx
  );
  assert.equal(r.avisa, false);
  if (!r.avisa) assert.equal(r.mejor?.desglose.flete, 100);
});

test("un watch sin objetivo no es una regla", () => {
  const r = evaluarR1(watch({ objetivoPuesto: null }), [cand({})], PARAMETROS_INICIALES, ctx);
  assert.equal(r.avisa, false);
});
