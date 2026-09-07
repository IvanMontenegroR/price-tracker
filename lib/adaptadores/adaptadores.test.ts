import { strict as assert } from "node:assert";
import { test } from "node:test";
import { amazon } from "./amazon";
import { skuDeUrl } from "./bestbuy";
import { COLUMNAS_AWIN, lecturaDeFila, parsearCsv } from "./feed";
import { adaptadorFixture } from "./fixture";
import { extraerBloquesJsonLd, leerOferta } from "./jsonld";
import { NoImplementado } from "./tipos";

test("Amazon está detrás de la interfaz y sin implementar", async () => {
  assert.equal(amazon.disponible, false);
  await assert.rejects(() => amazon.leer({ url: "x", sku: null, vendedor: null }), NoImplementado);
});

test("el sku de Best Buy sale de la URL", () => {
  assert.equal(skuDeUrl("https://www.bestbuy.com/site/algo/6418599.p?skuId=6418599"), "6418599");
  assert.equal(skuDeUrl("https://www.bestbuy.com/site/algo"), null);
});

test("JSON-LD: precio, moneda y stock de una página de producto", () => {
  const html = `<html><head>
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Cosa",
      offers: { "@type": "Offer", price: "1299.99", priceCurrency: "USD", availability: "https://schema.org/InStock" },
    })}</script></head><body></body></html>`;
  const o = leerOferta(extraerBloquesJsonLd(html));
  assert.equal(o.precio, 1299.99);
  assert.equal(o.moneda, "USD");
  assert.equal(o.stock, true);
});

test("JSON-LD: agotado se lee como agotado, no como desconocido", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    offers: { "@type": "Offer", price: 10, availability: "https://schema.org/OutOfStock" },
  })}</script>`;
  assert.equal(leerOferta(extraerBloquesJsonLd(html)).stock, false);
});

test("JSON-LD: un bloque roto no invalida los demás", () => {
  const html =
    `<script type="application/ld+json">{ roto </script>` +
    `<script type="application/ld+json">${JSON.stringify({ "@type": "Offer", price: 5 })}</script>`;
  assert.equal(leerOferta(extraerBloquesJsonLd(html)).precio, 5);
});

test("JSON-LD: con varias ofertas se queda con la más barata", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@graph": [
      { "@type": "Offer", price: 120 },
      { "@type": "Offer", price: 99.5 },
    ],
  })}</script>`;
  assert.equal(leerOferta(extraerBloquesJsonLd(html)).precio, 99.5);
});

test("CSV de feed: comas y comillas dentro del campo", () => {
  const csv = 'merchant_product_id,search_price,in_stock\n"A,1","1,299.00",yes\n';
  const filas = parsearCsv(csv);
  assert.equal(filas.length, 1);
  const l = lecturaDeFila(filas[0], COLUMNAS_AWIN);
  assert.equal(l.precio, 1299);
  assert.equal(l.stock, true);
});

test("el fixture es determinista", async () => {
  const a = adaptadorFixture("t", { base: 500, amplitud: 0.1 });
  const x = await a.leer({ url: "u", sku: null, vendedor: null });
  const y = await a.leer({ url: "u", sku: null, vendedor: null });
  assert.equal(x.precio, y.precio);
  assert.ok(x.precio! >= 450 && x.precio! <= 550);
});
