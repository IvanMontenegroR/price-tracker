import { ahora, type Adaptador, type Lectura, type PedidoLectura } from "./tipos.ts";

/**
 * Adaptador de prueba: precios deterministas derivados de la URL, con una
 * caminata pseudoaleatoria en el tiempo. No pega a ninguna tienda.
 *
 * Existe para poder probar el sistema entero de punta a punta —recolección,
 * costo puesto, reglas, anti-ruido, aviso— sin depender de que una tienda
 * conteste, y para reproducir un escenario exacto cuando algo falla.
 */

let semillaGlobal = 0;
export const fijarSemilla = (n: number) => (semillaGlobal = n);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export type OpcionesFixture = {
  /** Precio base; si no, sale del hash de la URL. */
  base?: number;
  /** Amplitud de la oscilación, 0.08 = ±8%. */
  amplitud?: number;
  /** Fracción de lecturas que salen nulas, para probar el circuit breaker. */
  fallas?: number;
  /** Fracción de lecturas sin stock. */
  agotado?: number;
  envio?: number;
};

export function adaptadorFixture(slug = "fixture", op: OpcionesFixture = {}): Adaptador {
  const { amplitud = 0.08, fallas = 0, agotado = 0.1, envio = 0 } = op;
  return {
    slug,
    nombre: `Fixture ${slug}`,
    origen: "fixture",
    disponible: true,
    async leer(pedido: PedidoLectura): Promise<Lectura> {
      const h = hash(pedido.url + slug + semillaGlobal);
      const r1 = (h % 1000) / 1000;
      const r2 = ((h >> 10) % 1000) / 1000;
      const r3 = ((h >> 20) % 1000) / 1000;

      if (r1 < fallas) {
        return { precio: null, envio: null, moneda: "USD", stock: null, ts: ahora(), crudo: { falla: true } };
      }

      const base = op.base ?? 100 + (h % 90000) / 100;
      const precio = Math.round(base * (1 + (r2 - 0.5) * 2 * amplitud) * 100) / 100;

      return {
        precio,
        envio,
        moneda: "USD",
        stock: r3 >= agotado,
        ts: ahora(),
        crudo: { semilla: semillaGlobal, base },
      };
    },
  };
}
