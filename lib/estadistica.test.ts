import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mediana, percentil, volatilidad } from "./estadistica.ts";

test("la mediana ignora el outlier que el promedio se comería", () => {
  const precios = [1000, 1010, 990, 1005, 40];
  assert.equal(mediana(precios), 1000);
  // El promedio sería 809: con eso, un error de precio del 96% pasa por normal.
  const promedio = precios.reduce((a, b) => a + b, 0) / precios.length;
  assert.ok(promedio < 850);
});

test("percentil interpola y respeta los bordes", () => {
  assert.equal(percentil([10, 20, 30, 40], 0.5), 25);
  assert.equal(percentil([10, 20, 30, 40], 0), 10);
  assert.equal(percentil([10, 20, 30, 40], 1), 40);
  assert.equal(percentil([], 0.5), null);
});

test("la volatilidad no se dispara por un solo error de precio", () => {
  const quieto = [100, 100, 101, 99, 100, 100, 100];
  const conError = [...quieto, 5];
  assert.ok(volatilidad(conError) < 0.05, `${volatilidad(conError)}`);
  const movido = [100, 130, 80, 120, 90, 110];
  assert.ok(volatilidad(movido) > volatilidad(quieto));
});
