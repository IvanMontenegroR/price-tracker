import { strict as assert } from "node:assert";
import { test } from "node:test";
import { calcularPuesto } from "./costo.ts";
import { PARAMETROS_INICIALES } from "./tipos.ts";

test("el iPhone de US$999 sale US$1.156,65 puesto", () => {
  // A mano, con los parámetros de arranque (7 USD/kg, 5 fijo, 15%):
  //   999 + 0 + 0.4×7 + 5 + 999×0.15 = 999 + 2.80 + 5 + 149.85 = 1156.65
  const d = calcularPuesto({ precio: 999, envioUs: 0, pesoKg: 0.4 }, PARAMETROS_INICIALES);
  assert.equal(d.flete, 2.8);
  assert.equal(d.impuesto, 149.85);
  assert.equal(d.puesto, 1156.65);
});

test("el envío en EE.UU. entra al puesto y no paga impuesto", () => {
  const sin = calcularPuesto({ precio: 500, envioUs: 0, pesoKg: 1 }, PARAMETROS_INICIALES);
  const con = calcularPuesto({ precio: 500, envioUs: 20, pesoKg: 1 }, PARAMETROS_INICIALES);
  assert.equal(con.puesto - sin.puesto, 20);
  assert.equal(con.impuesto, sin.impuesto);
});

test("un artículo pesado puede perder contra uno más caro", () => {
  const p = PARAMETROS_INICIALES;
  const liviano = calcularPuesto({ precio: 520, pesoKg: 0.3 }, p);
  const pesado = calcularPuesto({ precio: 500, pesoKg: 4 }, p);
  assert.ok(pesado.puesto > liviano.puesto, `${pesado.puesto} vs ${liviano.puesto}`);
});

test("los parámetros viajan con el desglose, para poder rehacer la cuenta", () => {
  const d = calcularPuesto({ precio: 100, pesoKg: 2 }, { tarifaKg: 9, feeFijo: 6, tasaImp: 0.1 });
  assert.deepEqual(d.insumos, { pesoKg: 2, tarifaKg: 9, feeFijo: 6, tasaImp: 0.1 });
  assert.equal(d.puesto, 100 + 18 + 6 + 10);
});

test("rechaza entradas imposibles en vez de inventar un número", () => {
  assert.throws(() => calcularPuesto({ precio: -1, pesoKg: 1 }, PARAMETROS_INICIALES));
  assert.throws(() => calcularPuesto({ precio: 100, pesoKg: 0 }, PARAMETROS_INICIALES));
});
