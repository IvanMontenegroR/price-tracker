import { amazon } from "./amazon.ts";
import { bestbuy } from "./bestbuy.ts";
import { adaptadorFixture } from "./fixture.ts";
import { adaptadorJsonLd } from "./jsonld.ts";
import type { Adaptador } from "./tipos.ts";

/**
 * El catálogo de adaptadores. Agregar una tienda es agregar una línea acá.
 *
 * Orden de preferencia de fuentes: feed de afiliado > API oficial > scraping
 * liviano. Hoy no hay ninguna con feed porque no tengo cuenta de publisher
 * aprobada; cuando la tenga, esa tienda cambia de adaptador y nada más.
 */

const UA_NAVEGADOR =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

export const ADAPTADORES: Record<string, Adaptador> = {
  // API oficial, gratis y permitida.
  bestbuy,

  // Sin API pública: JSON-LD, un GET por lectura, solo en tier caliente.
  bhphoto: adaptadorJsonLd({ slug: "bhphoto", nombre: "B&H Photo", userAgent: UA_NAVEGADOR }),
  adorama: adaptadorJsonLd({ slug: "adorama", nombre: "Adorama", userAgent: UA_NAVEGADOR }),
  newegg: adaptadorJsonLd({ slug: "newegg", nombre: "Newegg", userAgent: UA_NAVEGADOR }),

  // Detrás de la interfaz, sin implementar. Ver el archivo.
  amazon,

  // Para pruebas y para la corrida de humo.
  fixture: adaptadorFixture("fixture"),
};

export function adaptadorPara(clave: string): Adaptador {
  const a = ADAPTADORES[clave];
  if (!a) throw new Error(`no existe el adaptador "${clave}"`);
  return a;
}
