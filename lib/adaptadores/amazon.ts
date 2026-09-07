import { NoImplementado, type Adaptador } from "./tipos.ts";

/**
 * Amazon: sigue sin implementarse, y no es una decisión de diseño mía.
 *
 * Su acuerdo de uso prohíbe el scraping y exige que cualquier precio que yo
 * muestre venga de la Product Advertising API. Y para tener acceso a esa API
 * no alcanza con abrir una cuenta de Amazon Associates: hay que estar
 * aprobado y haber hecho ventas calificadas en los primeros meses. Sin esas
 * credenciales no hay forma legal de leer un precio de Amazon.
 *
 * O sea: esto lo desbloquea una cuenta, no una tarde de código. Cuando estén
 * las credenciales (PAAPI_ACCESS_KEY, PAAPI_SECRET_KEY, PAAPI_PARTNER_TAG),
 * se implementa `leer` acá —GetItems, firma SigV4, Offers.Listings— y no
 * cambia una línea en ningún otro archivo: el resto del sistema ya lo trata
 * como una tienda más que hoy está apagada.
 *
 * Mientras tanto, la tienda existe en el catálogo con `activa = false`, así
 * que el recolector la saltea sin romperse.
 */
export const amazon: Adaptador = {
  slug: "amazon",
  nombre: "Amazon",
  origen: "api",
  disponible: false,
  async leer() {
    throw new NoImplementado(
      "Amazon solo por Product Advertising API, que exige cuenta de Associates aprobada con ventas. Sin credenciales todavía."
    );
  },
};
