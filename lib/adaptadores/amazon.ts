import { NoImplementado, type Adaptador } from "./tipos.ts";

/**
 * Amazon: nunca scrapear.
 *
 * Su acuerdo de uso lo prohíbe y exige que cualquier precio que yo muestre
 * venga de la Product Advertising API. Para usar esa API hace falta cuenta de
 * Amazon Associates aprobada y con ventas, que hoy no tengo.
 *
 * El adaptador existe para que el resto del sistema no tenga que saber nada de
 * esto: cuando tenga la cuenta, se implementa acá y no cambia una línea en
 * ningún otro archivo.
 */
export const amazon: Adaptador = {
  slug: "amazon",
  nombre: "Amazon",
  origen: "api",
  disponible: false,
  async leer() {
    throw new NoImplementado(
      "Amazon solo por Product Advertising API (su contrato prohíbe scraping). Sin implementar."
    );
  },
};
