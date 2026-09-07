import { strict as assert } from "node:assert";
import { test } from "node:test";
import { pasaAntiRuido, reArmar, TECHO_DIARIO } from "./antiruido.ts";

const ahora = new Date("2026-09-07T12:00:00Z");
const armado = { ultimaAlertaEn: null, ultimoPuestoAlertado: null, armado: true };
const base = { ahora, alertasHoy: 0, ultimaAlertaProducto: null, referencia: 1000 };

test("sin stock nunca alerta", () => {
  const v = pasaAntiRuido("R1", 900, false, armado, base);
  assert.equal(v.avisa, false);
  assert.match((v as { motivo: string }).motivo, /stock/);
});

test("stock desconocido tampoco alerta", () => {
  assert.equal(pasaAntiRuido("R1", 900, null, armado, base).avisa, false);
});

test("el cooldown es de 12 horas por producto", () => {
  const hace2h = new Date(ahora.getTime() - 2 * 3.6e6).toISOString();
  const hace13h = new Date(ahora.getTime() - 13 * 3.6e6).toISOString();
  assert.equal(pasaAntiRuido("R1", 900, true, armado, { ...base, ultimaAlertaProducto: hace2h }).avisa, false);
  assert.equal(pasaAntiRuido("R1", 900, true, armado, { ...base, ultimaAlertaProducto: hace13h }).avisa, true);
});

test("el techo diario corta a las 5", () => {
  assert.equal(pasaAntiRuido("R1", 900, true, armado, { ...base, alertasHoy: TECHO_DIARIO }).avisa, false);
});

test("R3 ignora cooldown y techo", () => {
  const hace1h = new Date(ahora.getTime() - 3.6e6).toISOString();
  const v = pasaAntiRuido("R3", 900, true, armado, {
    ...base,
    alertasHoy: 99,
    ultimaAlertaProducto: hace1h,
  });
  assert.equal(v.avisa, true);
});

test("histéresis: tras avisar a 900 no reabre hasta 855", () => {
  const disparado = { ultimaAlertaEn: null, ultimoPuestoAlertado: 900, armado: false };
  const ctx = { ...base, ultimaAlertaProducto: null };
  assert.equal(pasaAntiRuido("R1", 890, true, disparado, ctx).avisa, false);
  assert.equal(pasaAntiRuido("R1", 855, true, disparado, ctx).avisa, true);
});

test("volver por encima de la referencia re-arma el watch", () => {
  const disparado = { ultimaAlertaEn: null, ultimoPuestoAlertado: 900, armado: false };
  assert.equal(reArmar(disparado, 1050, 1000).armado, true);
  assert.equal(reArmar(disparado, 980, 1000).armado, false);
});
