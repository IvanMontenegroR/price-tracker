import { NoImplementado, type Adaptador } from "./tipos.ts";

/**
 * Amazon: no se puede, y conviene decirlo sin vueltas.
 *
 * Su acuerdo de uso prohíbe el scraping y exige que cualquier precio que yo
 * muestre venga de su API. Y esa puerta se cerró más de lo que estaba:
 *
 * - La Product Advertising API v5 se retiró en mayo de 2026.
 * - La reemplaza la Creators API, que pide cuenta de Amazon Associates
 *   aceptada y **ventas referidas calificadas en los últimos 30 días, de
 *   forma sostenida**. No es un trámite de entrada: es un requisito que hay
 *   que seguir cumpliendo mes a mes o te cortan las credenciales.
 *
 * Traducido a este proyecto: para vigilar el precio de un iPhone que quiero
 * comprar, Amazon me pediría mantener un sitio de afiliados vendiendo todos
 * los meses. No es una tarea pendiente, es un callejón sin salida para un
 * tracker personal.
 *
 * El adaptador queda igual, y no por optimismo: documenta la decisión y deja
 * el enchufe puesto por si algún día tengo esa cuenta por otra razón. La
 * tienda está en el catálogo con `activa = false`, así que el recolector la
 * saltea sin romperse.
 */
export const amazon: Adaptador = {
  slug: "amazon",
  nombre: "Amazon",
  origen: "api",
  disponible: false,
  async leer() {
    throw new NoImplementado(
      "Amazon no tiene vía legal para un tracker personal: PA-API se retiró y la Creators API exige ventas de afiliado sostenidas."
    );
  },
};
