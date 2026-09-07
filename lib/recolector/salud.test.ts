import { strict as assert } from "node:assert";
import { test } from "node:test";
import { clasificar, diagnosticar } from "./salud.ts";

test("más del 30% de lecturas malas apaga la tienda", () => {
  assert.equal(diagnosticar({ tiendaSlug: "x", total: 10, malas: 4 }).apagar, true);
  assert.equal(diagnosticar({ tiendaSlug: "x", total: 10, malas: 3 }).apagar, false);
});

test("con muestra chica no se apaga nada", () => {
  assert.equal(diagnosticar({ tiendaSlug: "x", total: 3, malas: 3 }).apagar, false);
});

test("nulo, cero y absurdo se distinguen", () => {
  assert.equal(clasificar(null, 1000), "nula");
  assert.equal(clasificar(0, 1000), "absurda");
  assert.equal(clasificar(-5, 1000), "absurda");
  assert.equal(clasificar(50_000, 1000), "absurda");
  assert.equal(clasificar(5, 1000), "absurda");
});

test("un error de precio real sigue siendo una lectura válida", () => {
  // 60% off es lo que R3 tiene que poder ver: no se puede filtrar como basura.
  assert.equal(clasificar(400, 1000), "ok");
  assert.equal(clasificar(250, 1000), "ok");
});

test("sin historial no se descarta nada por absurdo", () => {
  assert.equal(clasificar(999, null), "ok");
});
