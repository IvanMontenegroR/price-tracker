import { strict as assert } from "node:assert";
import { test } from "node:test";
import { itemDeUrl, leerItem } from "./ebay.ts";

test("el id de item sale de la URL de eBay", () => {
  assert.equal(itemDeUrl("https://www.ebay.com/itm/145678901234"), "145678901234");
  assert.equal(itemDeUrl("https://www.ebay.com/itm/Apple-iPhone/145678901234?hash=abc"), "145678901234");
  assert.equal(itemDeUrl("https://www.ebay.com/sch/i.html?_nkw=iphone"), null);
});

test("precio fijo: precio, envío y stock", () => {
  const l = leerItem({
    price: { value: "849.99", currency: "USD" },
    shippingOptions: [{ shippingCost: { value: "12.50", currency: "USD" } }],
    estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK" }],
    buyingOptions: ["FIXED_PRICE"],
    condition: "Used",
  });
  assert.equal(l.precio, 849.99);
  assert.equal(l.envio, 12.5);
  assert.equal(l.stock, true);
  assert.equal(l.tipoVenta, "fijo");
  assert.equal(l.terminaEn, null);
});

test("subasta pura: sigue la puja y trae el cierre", () => {
  const l = leerItem({
    currentBidPrice: { value: "310.00", currency: "USD" },
    buyingOptions: ["AUCTION"],
    itemEndDate: "2026-09-08T18:00:00.000Z",
  });
  assert.equal(l.precio, 310);
  assert.equal(l.tipoVenta, "subasta");
  assert.equal(l.terminaEn, "2026-09-08T18:00:00.000Z");
});

test("subasta con cómpralo ya: manda el precio que puedo pagar hoy", () => {
  const l = leerItem({
    price: { value: "500.00", currency: "USD" },
    currentBidPrice: { value: "120.00", currency: "USD" },
    buyingOptions: ["AUCTION", "FIXED_PRICE"],
    itemEndDate: "2026-09-10T18:00:00.000Z",
  });
  assert.equal(l.precio, 500);
  assert.equal(l.tipoVenta, "fijo");
});

test("agotado se lee como agotado", () => {
  const l = leerItem({
    price: { value: "10.00" },
    estimatedAvailabilities: [{ estimatedAvailabilityStatus: "OUT_OF_STOCK" }],
    buyingOptions: ["FIXED_PRICE"],
  });
  assert.equal(l.stock, false);
});

test("sin envío declarado no se inventa un cero", () => {
  const l = leerItem({ price: { value: "99.00" }, buyingOptions: ["FIXED_PRICE"] });
  assert.equal(l.envio, null);
  assert.equal(l.stock, null);
});
