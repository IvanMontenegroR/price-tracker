import { strict as assert } from "node:assert";
import { test } from "node:test";
import { planificar, score, tierDe, type CandidataLectura } from "./presupuesto.ts";

const ahora = new Date("2026-09-07T12:00:00Z");
const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString();

const c = (p: Partial<CandidataLectura> & { listingId: string }): CandidataLectura => ({
  tiendaSlug: "bestbuy",
  distancia: 0.3,
  historial: [100, 102, 98],
  ultimaLectura: hace(120),
  evento: false,
  ...p,
});

test("el tier sale de la distancia al umbral", () => {
  assert.equal(tierDe(0.02), "caliente");
  assert.equal(tierDe(0.2), "normal");
  assert.equal(tierDe(0.8), "frio");
  assert.equal(tierDe(null), "normal");
});

test("un caliente se relee a los 5 minutos y un frío no", () => {
  const plan = planificar(
    [
      c({ listingId: "caliente", distancia: 0.01, ultimaLectura: hace(6) }),
      c({ listingId: "frio", distancia: 0.9, ultimaLectura: hace(60) }),
    ],
    { ahora, presupuestoDiario: 1000, usadasHoy: 0, maxPorTick: 10 }
  );
  assert.deepEqual(plan.aLeer.map((x) => x.candidata.listingId), ["caliente"]);
});

test("con el presupuesto casi agotado solo siguen los calientes", () => {
  const plan = planificar(
    [
      c({ listingId: "caliente", distancia: 0.01, ultimaLectura: hace(60) }),
      c({ listingId: "normal", distancia: 0.2, ultimaLectura: hace(60) }),
    ],
    { ahora, presupuestoDiario: 1000, usadasHoy: 900, maxPorTick: 10 }
  );
  assert.equal(plan.soloCalientes, true);
  assert.deepEqual(plan.aLeer.map((x) => x.candidata.listingId), ["caliente"]);
});

test("el sistema nunca se pasa del presupuesto", () => {
  const muchas = Array.from({ length: 50 }, (_, i) => c({ listingId: `l${i}`, distancia: 0.01 }));
  const plan = planificar(muchas, { ahora, presupuestoDiario: 20, usadasHoy: 17, maxPorTick: 40 });
  assert.equal(plan.aLeer.length, 3);
  assert.equal(plan.restanteDespues, 0);
  assert.equal(plan.postergadas, 47);
});

test("una tienda apagada por el breaker no consume presupuesto", () => {
  const plan = planificar(
    [c({ listingId: "rota", tiendaSlug: "newegg", distancia: 0.01 }), c({ listingId: "sana", distancia: 0.01 })],
    { ahora, presupuestoDiario: 100, usadasHoy: 0, maxPorTick: 10, tiendasApagadas: new Set(["newegg"]) }
  );
  assert.deepEqual(plan.aLeer.map((x) => x.candidata.listingId), ["sana"]);
});

test("cerca del umbral, volátil y con evento gana la prioridad", () => {
  const cerca = score(c({ listingId: "a", distancia: 0.01, historial: [100, 120, 90], evento: true }));
  const lejos = score(c({ listingId: "b", distancia: 2, historial: [100, 100, 100], evento: false }));
  assert.ok(cerca > lejos * 10, `${cerca} vs ${lejos}`);
});

test("un listing sin historial igual se lee alguna vez", () => {
  assert.ok(score(c({ listingId: "nuevo", historial: [], ultimaLectura: null })) > 0);
  const plan = planificar([c({ listingId: "nuevo", historial: [], ultimaLectura: null })], {
    ahora, presupuestoDiario: 100, usadasHoy: 0, maxPorTick: 10,
  });
  assert.equal(plan.aLeer.length, 1);
});

test("con presupuesto chico el turno rota: nadie se muere de hambre", () => {
  // Un listing con score altísimo y otros nueve normales, un solo slot por tick.
  // Si la prioridad fuera solo el score, el primero se lleva los 60 slots.
  const listings = [
    c({ listingId: "estrella", distancia: 0.001, historial: [100, 140, 70, 130], evento: true }),
    ...Array.from({ length: 9 }, (_, i) => c({ listingId: `n${i}`, distancia: 0.03 })),
  ];
  const leidas = new Map<string, number>();
  const ultima = new Map<string, string>();

  for (let t = 0; t < 60; t++) {
    const reloj = new Date(ahora.getTime() + t * 5 * 60_000);
    const plan = planificar(
      listings.map((l) => ({ ...l, ultimaLectura: ultima.get(l.listingId) ?? null })),
      { ahora: reloj, presupuestoDiario: 1000, usadasHoy: 0, maxPorTick: 1 }
    );
    for (const x of plan.aLeer) {
      const id = x.candidata.listingId;
      leidas.set(id, (leidas.get(id) ?? 0) + 1);
      ultima.set(id, reloj.toISOString());
    }
  }

  assert.equal(leidas.size, 10, `solo se leyeron ${leidas.size} de 10 listings`);
  assert.ok((leidas.get("estrella") ?? 0) > (leidas.get("n0") ?? 0), "el prioritario igual se lee más seguido");
  assert.ok((leidas.get("n0") ?? 0) >= 1, "al de menor prioridad igual le llega el turno");
});

test("una subasta que cierra pronto es caliente aunque esté lejos del objetivo", () => {
  const en20min = new Date(ahora.getTime() + 20 * 60_000).toISOString();
  assert.equal(tierDe(0.9, en20min, ahora), "caliente");
  assert.equal(tierDe(0.9, null, ahora), "frio");
});

test("una publicación que ya cerró no se lee más", () => {
  const cerrada = new Date(ahora.getTime() - 60_000).toISOString();
  const plan = planificar(
    [
      c({ listingId: "cerrada", terminaEn: cerrada, distancia: 0.01 }),
      c({ listingId: "viva", distancia: 0.01 }),
    ],
    { ahora, presupuestoDiario: 100, usadasHoy: 0, maxPorTick: 10 }
  );
  assert.deepEqual(plan.aLeer.map((x) => x.candidata.listingId), ["viva"]);
});
