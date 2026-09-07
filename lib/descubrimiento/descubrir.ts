import type { Adaptador, Hallazgo } from "../adaptadores/tipos.ts";
import { calcularPuesto } from "../costo.ts";
import type { Parametros } from "../tipos.ts";
import { evaluar, type Veredicto } from "./coincidencia.ts";

/**
 * Encontrar las publicaciones de un producto, en vez de que yo las pegue.
 *
 * La decisión de fondo: lo obvio se adopta solo, lo dudoso se pregunta, lo
 * malo ni se muestra. Un sistema que adopta todo se llena de fundas; uno que
 * pregunta todo me devuelve el trabajo que vine a sacarme de encima.
 */

export type ProductoABuscar = {
  productoId: string;
  usuarioId: string;
  nombre: string;
  pesoKg: number;
  objetivoPuesto: number | null;
  /** URLs que ya son listing o que ya rechacé: no se vuelven a proponer. */
  conocidas: Set<string>;
};

export type Candidato = Hallazgo & {
  productoId: string;
  usuarioId: string;
  tiendaSlug: string;
  /** El puesto estimado con los parámetros de hoy y el peso del producto. */
  puestoEstimado: number | null;
  puntaje: number;
  motivos: string[];
  decision: Veredicto["decision"];
};

/** El recorte de precio que se le pide a la tienda, derivado del objetivo. */
export function recorte(objetivo: number | null, parametros: Parametros, pesoKg: number) {
  if (!objetivo) return { precioMin: null, precioMax: null };
  // El objetivo está en precio puesto; la tienda cobra etiqueta. Se invierte
  // la fórmula para no pedirle a eBay un rango que no tiene sentido allá.
  const aEtiqueta = (puesto: number) =>
    (puesto - pesoKg * parametros.tarifaKg - parametros.feeFijo) / (1 + parametros.tasaImp);
  return {
    precioMin: Math.max(0, aEtiqueta(objetivo * 0.3)),
    precioMax: Math.max(1, aEtiqueta(objetivo * 2.2)),
  };
}

export async function buscarPara(
  producto: ProductoABuscar,
  tiendas: { slug: string; adaptador: Adaptador }[],
  parametros: Parametros,
  opciones: { maximo?: number } = {}
): Promise<{ candidatos: Candidato[]; errores: Record<string, string> }> {
  const candidatos: Candidato[] = [];
  const errores: Record<string, string> = {};
  const { precioMin, precioMax } = recorte(producto.objetivoPuesto, parametros, producto.pesoKg);

  for (const { slug, adaptador } of tiendas) {
    if (!adaptador.buscar || !adaptador.disponible) continue;
    let hallazgos: Hallazgo[];
    try {
      hallazgos = await adaptador.buscar({
        texto: producto.nombre,
        maximo: opciones.maximo ?? 25,
        precioMin,
        precioMax,
      });
    } catch (e) {
      errores[slug] = String((e as Error).message);
      continue;
    }

    for (const h of hallazgos) {
      if (producto.conocidas.has(h.url)) continue;

      // El puesto estimado usa el peso del producto: comparar etiquetas entre
      // una tienda con envío gratis y otra sin él no dice nada.
      const puestoEstimado =
        h.precio === null
          ? null
          : calcularPuesto({ precio: h.precio, envioUs: h.envio, pesoKg: producto.pesoKg }, parametros).puesto;

      const veredicto = evaluar(
        { titulo: h.titulo, puesto: puestoEstimado, condicion: h.condicion, tipoVenta: h.tipoVenta },
        { nombre: producto.nombre, objetivoPuesto: producto.objetivoPuesto }
      );
      if (veredicto.decision === "descartar") continue;

      candidatos.push({
        ...h,
        productoId: producto.productoId,
        usuarioId: producto.usuarioId,
        tiendaSlug: slug,
        puestoEstimado,
        puntaje: veredicto.puntaje,
        motivos: veredicto.motivos,
        decision: veredicto.decision,
      });
    }
  }

  // El más barato puesto primero: si algo se adopta solo, que sea lo mejor.
  candidatos.sort((a, b) => {
    if (a.decision !== b.decision) return a.decision === "adoptar" ? -1 : 1;
    return (a.puestoEstimado ?? Infinity) - (b.puestoEstimado ?? Infinity);
  });

  return { candidatos, errores };
}

/** Cuántas publicaciones adopto sin preguntar, por producto y por corrida. */
export const MAXIMO_ADOPTADOS = 3;

export function repartir(candidatos: Candidato[]) {
  const adoptar = candidatos.filter((c) => c.decision === "adoptar").slice(0, MAXIMO_ADOPTADOS);
  const revisar = candidatos.filter((c) => c.decision === "revisar");
  return { adoptar, revisar };
}
