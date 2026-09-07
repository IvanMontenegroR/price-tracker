import type { Condicion, TipoVenta } from "../tipos.ts";

/**
 * Decidir si un resultado de búsqueda es el producto que quiero.
 *
 * Es la parte difícil del descubrimiento y la que puede arruinar todo el
 * sistema. Buscar "Sony WH-1000XM6" devuelve, en la misma página: los
 * auriculares, la funda de los auriculares, un cable de repuesto, un
 * WF-1000XM6 que es otro producto, y una caja vacía. Si el tracker adopta
 * cualquiera de esos como listing, el anti-ruido no lo salva: le va a avisar
 * de una funda de US$ 12 como si fuera una baja del 97%.
 *
 * Tres filtros, en orden de fuerza:
 *   1. Palabras que descalifican (funda, cable, "for parts", caja vacía).
 *   2. Los números tienen que coincidir: 256GB no es 128GB, XM6 no es XM5.
 *   3. El precio tiene que ser plausible contra el objetivo que yo puse.
 *
 * El tercero es el que más trabaja. Yo ya declaré cuánto vale la cosa para mí
 * cuando puse el objetivo; un resultado a la vigésima parte de eso no es una
 * ganga, es otra cosa.
 */

export const NORMA = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s./+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Lo que casi nunca es el producto y casi siempre comparte su nombre. */
export const DESCALIFICAN = [
  "case", "cover", "funda", "sleeve", "pouch", "skin", "sticker", "decal",
  "screen protector", "protector", "tempered glass", "film",
  "cable", "charger", "cargador", "adapter", "adaptador", "power supply",
  "replacement", "repuesto", "spare", "for parts", "parts only", "not working",
  "no funciona", "broken", "roto", "faulty", "damaged", "cracked", "as is",
  "repair", "reparar", "empty box", "box only", "caja vacia", "solo caja",
  "manual", "stand", "mount", "soporte", "strap", "correa", "band",
  "replica", "clone", "copy", "compatible with", "fits ", "for use with",
  "lot of", "bundle of", "wholesale",
];

/** Deja solo letras y números: "WH-1000XM6" y "WH1000XM6" son lo mismo. */
const PELADO = (s: string): string => NORMA(s).replace(/[^a-z0-9]/g, "");

export type ResultadoCandidato = {
  titulo: string;
  /** Precio puesto estimado, ya con flete e impuesto. */
  puesto: number | null;
  condicion: Condicion | null;
  tipoVenta: TipoVenta;
};

export type Veredicto = {
  puntaje: number;
  /** Por qué quedó así. Va a la pantalla: una decisión que no se explica no se audita. */
  motivos: string[];
  decision: "adoptar" | "revisar" | "descartar";
};

/** Arriba de esto se adopta solo; abajo del segundo, ni se muestra. */
export const UMBRAL_ADOPTAR = 0.82;
export const UMBRAL_REVISAR = 0.45;

/** Un resultado a menos de esta fracción del objetivo no es el producto. */
export const PISO_PRECIO = 0.25;
/** Ni a más de este múltiplo. */
export const TECHO_PRECIO = 2.5;

function tokens(s: string): string[] {
  return NORMA(s).split(" ").filter((t) => t.length > 1);
}

/**
 * Los tokens del nombre que no se pueden negociar: modelo y capacidad.
 *
 * Es lo que separa un XM6 de un XM5 y un 256GB de un 128GB, que es donde se
 * cuela la mitad de los falsos positivos. Un dígito suelto no entra —el "3"
 * de "AirPods Pro 3" no discrimina nada por sí solo—, pero cualquier token
 * que mezcle letras y números sí.
 */
export function exigencias(nombre: string): string[] {
  const salida = new Set<string>();
  for (const t of NORMA(nombre).split(" ")) {
    const pelado = PELADO(t);
    if (!/\d/.test(pelado)) continue;
    const tieneLetra = /[a-z]/.test(pelado);
    const variosDigitos = (pelado.match(/\d/g) ?? []).length >= 2;
    if (tieneLetra || variosDigitos) salida.add(pelado);
  }
  return [...salida];
}

/**
 * Una exigencia se cumple distinto según qué sea.
 *
 * Un número suelto tiene que aparecer como palabra entera, o "17" se daría
 * por cumplido dentro de "1170".
 *
 * Un token de modelo se busca pelado, para que "WH1000XM6" encuentre a
 * "WH-1000XM6". Y cuando no está entero hay que distinguir dos cosas que no
 * son iguales: que el título **omita** el prefijo ("Sony 1000XM6", que bien
 * puede ser el mío escrito rápido) o que diga **otro** prefijo ("WF-1000XM6",
 * que es otro producto). Lo primero va a revisión; lo segundo se descarta.
 */
export type Cumplimiento = "si" | "parcial" | "no";

export function cumple(exigencia: string, titulo: string): Cumplimiento {
  const palabras = NORMA(titulo).split(" ").map(PELADO).filter(Boolean);

  if (!/[a-z]/.test(exigencia)) {
    return palabras.includes(exigencia) ? "si" : "no";
  }

  // El corazón del modelo: lo que va desde el primer dígito.
  const nucleo = exigencia.slice(exigencia.search(/\d/));
  const prefijoMio = exigencia.slice(0, exigencia.search(/\d/));
  let parcial = false;

  // Palabra por palabra, no sobre el título pegado: ahí "Sony 1000XM6" se
  // leía como si "sony" fuera el prefijo del modelo.
  for (const palabra of palabras) {
    if (palabra === exigencia || palabra.endsWith(exigencia)) return "si";
    if (!palabra.endsWith(nucleo)) continue;
    const prefijo = palabra.slice(0, palabra.length - nucleo.length);
    if (prefijo === "") parcial = true; // omitió el prefijo: puede ser el mío
    // Si tiene otro prefijo, es otro modelo: no lo acepto, pero sigo mirando
    // por si otra palabra del título trae el modelo completo.
  }

  return parcial ? "parcial" : "no";
}

export function evaluar(
  candidato: ResultadoCandidato,
  producto: { nombre: string; objetivoPuesto: number | null; condicionesOk?: Condicion[] }
): Veredicto {
  const motivos: string[] = [];
  const titulo = NORMA(candidato.titulo);

  // 1 · Palabras que descalifican.
  const descalificante = DESCALIFICAN.find((p) => titulo.includes(NORMA(p)));
  if (descalificante) {
    return { puntaje: 0, motivos: [`dice "${descalificante}"`], decision: "descartar" };
  }

  // 2 · Los números del nombre tienen que estar.
  const pedidos = exigencias(producto.nombre);
  const veredictos = pedidos.map((e) => [e, cumple(e, candidato.titulo)] as const);
  const faltantes = veredictos.filter(([, v]) => v === "no").map(([e]) => e);
  if (faltantes.length) {
    return {
      puntaje: 0,
      motivos: [`no dice ${faltantes.join(", ")}`],
      decision: "descartar",
    };
  }
  const parciales = veredictos.filter(([, v]) => v === "parcial").map(([e]) => e);
  if (parciales.length) motivos.push(`dice el modelo incompleto (${parciales.join(", ")})`);
  const exactas = veredictos.filter(([, v]) => v === "si").map(([e]) => e);
  if (exactas.length) motivos.push(`coincide en ${exactas.join(", ")}`);

  // 3 · Cobertura de palabras del nombre.
  const delProducto = tokens(producto.nombre).filter((t) => !/^\d+$/.test(t));
  const presentes = delProducto.filter((t) => titulo.includes(t));
  const cobertura = delProducto.length ? presentes.length / delProducto.length : 0;
  motivos.push(`${presentes.length} de ${delProducto.length} palabras`);

  // 4 · Plausibilidad de precio contra mi propio objetivo.
  let precioOk = 1;
  if (candidato.puesto !== null && producto.objetivoPuesto) {
    const razon = candidato.puesto / producto.objetivoPuesto;
    if (razon < PISO_PRECIO) {
      return {
        puntaje: 0,
        motivos: [`US$ ${candidato.puesto.toFixed(0)} es el ${(razon * 100).toFixed(0)}% de tu objetivo: no es esto`],
        decision: "descartar",
      };
    }
    if (razon > TECHO_PRECIO) {
      return {
        puntaje: 0,
        motivos: [`US$ ${candidato.puesto.toFixed(0)} es ${razon.toFixed(1)}× tu objetivo`],
        decision: "descartar",
      };
    }
    // Cerca del objetivo no suma puntaje: un precio bueno no prueba que sea
    // el producto. Solo se penaliza lo raro.
    precioOk = razon < 0.45 ? 0.75 : 1;
    if (precioOk < 1) motivos.push("precio sospechosamente bajo");
  } else if (candidato.puesto === null) {
    precioOk = 0.9;
    motivos.push("sin precio todavía");
  }

  // 5 · Condición.
  const permitidas = producto.condicionesOk ?? ["nuevo", "open_box", "reacondicionado", "usado"];
  if (candidato.condicion && !permitidas.includes(candidato.condicion)) {
    return { puntaje: 0, motivos: [`condición ${candidato.condicion}`], decision: "descartar" };
  }

  const puntaje = Math.max(0, Math.min(1, cobertura * precioOk));
  // Un modelo a medias nunca se adopta solo: eso lo mira una persona.
  const tope = parciales.length ? "revisar" : "adoptar";
  const decision =
    puntaje >= UMBRAL_ADOPTAR ? tope : puntaje >= UMBRAL_REVISAR ? "revisar" : "descartar";
  return { puntaje, motivos, decision };
}
