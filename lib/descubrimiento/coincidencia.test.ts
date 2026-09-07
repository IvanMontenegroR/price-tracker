import { strict as assert } from "node:assert";
import { test } from "node:test";
import { evaluar, exigencias } from "./coincidencia.ts";

const sony = { nombre: "Sony WH-1000XM6", objetivoPuesto: 360 };
const iphone = { nombre: "iPhone 17 Pro 256GB", objetivoPuesto: 1150 };

const c = (titulo: string, puesto: number | null = null) => ({
  titulo,
  puesto,
  condicion: null,
  tipoVenta: "fijo" as const,
});

test("adopta el producto correcto", () => {
  const v = evaluar(c("Sony WH-1000XM6 Wireless Noise Canceling Headphones - Black", 355), sony);
  assert.equal(v.decision, "adoptar");
});

test("la funda no pasa, aunque diga el nombre entero", () => {
  const v = evaluar(c("Case for Sony WH-1000XM6 Headphones - Hard Shell", 12), sony);
  assert.equal(v.decision, "descartar");
  assert.match(v.motivos[0], /case/);
});

test("el precio absurdo descarta aunque el título sea perfecto", () => {
  // Sin este filtro, un accesorio con el nombre completo entra como ganga.
  const v = evaluar(c("Sony WH-1000XM6 Wireless Headphones", 15), sony);
  assert.equal(v.decision, "descartar");
  assert.match(v.motivos[0], /objetivo/);
});

test("un modelo parecido no es el modelo", () => {
  assert.equal(evaluar(c("Sony WF-1000XM6 Earbuds", 340), sony).decision, "descartar");
  assert.equal(evaluar(c("Sony WH-1000XM5 Headphones", 300), sony).decision, "descartar");
});

test("la capacidad importa: 128 no es 256", () => {
  assert.equal(evaluar(c("Apple iPhone 17 Pro 128GB Unlocked", 1100), iphone).decision, "descartar");
  assert.equal(evaluar(c("Apple iPhone 17 Pro 256GB Unlocked", 1100), iphone).decision, "adoptar");
});

test("las piezas sueltas y las cajas vacías se van", () => {
  for (const t of [
    "iPhone 17 Pro 256GB for parts only",
    "iPhone 17 Pro 256GB Empty Box",
    "Screen Protector for iPhone 17 Pro 256GB",
    "Charger cable compatible with iPhone 17 Pro 256GB",
  ]) {
    assert.equal(evaluar(c(t, 900), iphone).decision, "descartar", t);
  }
});

test("lo dudoso va a revisión, no a la basura ni a producción", () => {
  // Le faltan palabras del nombre pero el número y el precio cierran.
  const v = evaluar(c("Sony 1000XM6 headphones black", 350), sony);
  assert.equal(v.decision, "revisar");
  assert.ok(v.puntaje > 0);
});

test("un precio muy por debajo baja el puntaje pero no descarta solo", () => {
  const bueno = evaluar(c("Sony WH-1000XM6 Wireless Noise Canceling Headphones", 350), sony);
  const barato = evaluar(c("Sony WH-1000XM6 Wireless Noise Canceling Headphones", 150), sony);
  assert.ok(barato.puntaje < bueno.puntaje);
  assert.match(barato.motivos.join(" "), /sospechosamente/);
});

test("sin precio todavía igual puede revisarse", () => {
  const v = evaluar(c("Sony WH-1000XM6 Wireless Noise Canceling Headphones", null), sony);
  assert.notEqual(v.decision, "descartar");
});

test("las exigencias son el modelo y la capacidad, no cualquier número", () => {
  assert.deepEqual(exigencias("iPhone 17 Pro 256GB"), ["17", "256gb"]);
  assert.deepEqual(exigencias("Sony WH-1000XM6"), ["wh1000xm6"]);
  // Un dígito suelto no discrimina nada.
  assert.deepEqual(exigencias("AirPods Pro 3"), []);
  // Sin guiones tiene que encontrarlo igual: así lo escriben los vendedores.
  assert.deepEqual(exigencias('MacBook Air 13" M4 16GB/256GB'), ["13", "m4", "16gb256gb"]);
});

test("el modelo se reconoce con o sin guiones", () => {
  const sinGuion = evaluar(c("Sony WH1000XM6 Headphones Black", 355), sony);
  assert.notEqual(sinGuion.decision, "descartar");
});

test("un número suelto no entra dentro de otro número", () => {
  // "17" no debe darse por cumplido porque el título diga "1170".
  const v = evaluar(c("Apple iPhone 1170 Pro 256GB", 1100), iphone);
  assert.equal(v.decision, "descartar");
});

test("el veredicto explica por qué", () => {
  const v = evaluar(c("Sony WH-1000XM6 Wireless Noise Canceling Headphones", 355), sony);
  assert.ok(v.motivos.length > 0);
  assert.match(v.motivos.join(" "), /palabras/);
});
