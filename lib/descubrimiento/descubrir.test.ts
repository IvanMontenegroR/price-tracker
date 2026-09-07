import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Adaptador, Hallazgo } from "../adaptadores/tipos.ts";
import { PARAMETROS_INICIALES } from "../tipos.ts";
import { buscarPara, recorte, repartir, type ProductoABuscar } from "./descubrir.ts";

const producto: ProductoABuscar = {
  productoId: "p1",
  usuarioId: "u1",
  nombre: "Sony WH-1000XM6",
  pesoKg: 1,
  objetivoPuesto: 360,
  conocidas: new Set(),
};

const h = (p: Partial<Hallazgo> & { titulo: string; url: string }): Hallazgo => ({
  sku: "1",
  precio: 300,
  envio: 0,
  moneda: "USD",
  condicion: "nuevo",
  tipoVenta: "fijo",
  terminaEn: null,
  imagen: null,
  vendedor: "v",
  ...p,
});

const tienda = (hallazgos: Hallazgo[]): { slug: string; adaptador: Adaptador } => ({
  slug: "ebay",
  adaptador: {
    slug: "ebay",
    nombre: "eBay",
    origen: "api",
    disponible: true,
    leer: async () => ({ precio: null, envio: null, moneda: "USD", stock: null, ts: "" }),
    buscar: async () => hallazgos,
  },
});

test("adopta lo obvio y manda lo dudoso a revisión", async () => {
  const { candidatos } = await buscarPara(
    producto,
    [
      tienda([
        h({ titulo: "Sony WH-1000XM6 Wireless Noise Canceling Headphones", url: "https://e/1", precio: 300 }),
        h({ titulo: "Sony 1000XM6 headphones", url: "https://e/2", precio: 305 }),
        h({ titulo: "Case for Sony WH-1000XM6", url: "https://e/3", precio: 12 }),
      ]),
    ],
    PARAMETROS_INICIALES
  );

  const { adoptar, revisar } = repartir(candidatos);
  assert.equal(adoptar.length, 1);
  assert.equal(adoptar[0].url, "https://e/1");
  assert.equal(revisar.length, 1);
  assert.equal(revisar[0].url, "https://e/2");
  // La funda ni aparece.
  assert.equal(candidatos.find((c) => c.url === "https://e/3"), undefined);
});

test("no vuelve a proponer lo que ya conozco o rechacé", async () => {
  const { candidatos } = await buscarPara(
    { ...producto, conocidas: new Set(["https://e/1"]) },
    [tienda([h({ titulo: "Sony WH-1000XM6 Wireless Headphones", url: "https://e/1" })])],
    PARAMETROS_INICIALES
  );
  assert.equal(candidatos.length, 0);
});

test("el puesto estimado usa el peso, no la etiqueta", async () => {
  const { candidatos } = await buscarPara(
    producto,
    [tienda([h({ titulo: "Sony WH-1000XM6 Wireless Headphones", url: "https://e/1", precio: 300, envio: 10 })])],
    PARAMETROS_INICIALES
  );
  // 300 + 10 + 1×7 + 5 + 45 = 367
  assert.equal(candidatos[0].puestoEstimado, 367);
});

test("una tienda que no sabe buscar no rompe la corrida", async () => {
  const sinBuscar: { slug: string; adaptador: Adaptador } = {
    slug: "bhphoto",
    adaptador: {
      slug: "bhphoto",
      nombre: "B&H",
      origen: "scrape",
      disponible: true,
      leer: async () => ({ precio: null, envio: null, moneda: "USD", stock: null, ts: "" }),
    },
  };
  const { candidatos, errores } = await buscarPara(producto, [sinBuscar], PARAMETROS_INICIALES);
  assert.equal(candidatos.length, 0);
  assert.deepEqual(errores, {});
});

test("una búsqueda que falla queda anotada y no tumba el resto", async () => {
  const rota: { slug: string; adaptador: Adaptador } = {
    slug: "ebay",
    adaptador: {
      slug: "ebay",
      nombre: "eBay",
      origen: "api",
      disponible: true,
      leer: async () => ({ precio: null, envio: null, moneda: "USD", stock: null, ts: "" }),
      buscar: async () => {
        throw new Error("401 keyset sin habilitar");
      },
    },
  };
  const { errores } = await buscarPara(producto, [rota], PARAMETROS_INICIALES);
  assert.match(errores.ebay, /keyset/);
});

test("el recorte de precio se pide en etiqueta, no en puesto", () => {
  const r = recorte(360, PARAMETROS_INICIALES, 1);
  // El objetivo son 360 puestos; pedirle a eBay artículos de hasta 360×2.2 de
  // etiqueta traería cosas que puestas valen el doble de eso.
  assert.ok(r.precioMax! < 360 * 2.2);
  assert.ok(r.precioMin! < r.precioMax!);
});

test("no adopta más de tres por producto y corrida", async () => {
  const muchos = Array.from({ length: 8 }, (_, i) =>
    h({ titulo: "Sony WH-1000XM6 Wireless Noise Canceling Headphones", url: `https://e/${i}`, precio: 300 + i })
  );
  const { candidatos } = await buscarPara(producto, [tienda(muchos)], PARAMETROS_INICIALES);
  const { adoptar } = repartir(candidatos);
  assert.equal(adoptar.length, 3);
  // Y los tres más baratos puestos.
  assert.deepEqual(adoptar.map((c) => c.precio), [300, 301, 302]);
});
