import type { Parametros } from "./tipos.ts";

/**
 * El precio comparable: lo que sale poner el artículo en mi mano en Asunción.
 *
 *   puesto_py = precio + envio_us + (peso_kg × TARIFA_KG) + FEE_FIJO + precio × TASA_IMP
 *
 * Es la única cifra con la que se decide, así que nunca se muestra sola:
 * toda alerta y toda fila de la lista llevan este desglose completo.
 */
export type Desglose = {
  /** Precio de etiqueta en la tienda. */
  etiqueta: number;
  /** Envío dentro de EE.UU. hasta el casillero. */
  envioUs: number;
  /** peso_kg × tarifa_kg */
  flete: number;
  /** Fee fijo del courier. */
  fee: number;
  /** precio × tasa_imp */
  impuesto: number;
  /** La suma. */
  puesto: number;
  /** Los insumos, para poder reproducir el número a mano. */
  insumos: { pesoKg: number; tarifaKg: number; feeFijo: number; tasaImp: number };
};

/** Redondeo a centavos, sin arrastrar coma flotante a la vista. */
export const centavos = (n: number): number => Math.round(n * 100) / 100;

export function calcularPuesto(
  entrada: { precio: number; envioUs?: number | null; pesoKg: number },
  p: Parametros
): Desglose {
  const { precio, pesoKg } = entrada;
  const envioUs = entrada.envioUs ?? 0;

  if (!Number.isFinite(precio) || precio < 0) throw new Error(`precio inválido: ${precio}`);
  if (!Number.isFinite(pesoKg) || pesoKg <= 0) throw new Error(`peso inválido: ${pesoKg}`);
  if (!Number.isFinite(envioUs) || envioUs < 0) throw new Error(`envío inválido: ${envioUs}`);

  const flete = pesoKg * p.tarifaKg;
  const impuesto = precio * p.tasaImp;
  const puesto = precio + envioUs + flete + p.feeFijo + impuesto;

  return {
    etiqueta: centavos(precio),
    envioUs: centavos(envioUs),
    flete: centavos(flete),
    fee: centavos(p.feeFijo),
    impuesto: centavos(impuesto),
    puesto: centavos(puesto),
    insumos: { pesoKg, tarifaKg: p.tarifaKg, feeFijo: p.feeFijo, tasaImp: p.tasaImp },
  };
}

/** El desglose como texto, igual en el mail, en el push y en pantalla. */
export function desgloseEnTexto(d: Desglose): string[] {
  const { insumos: i } = d;
  return [
    `Etiqueta            US$ ${d.etiqueta.toFixed(2)}`,
    `Envío en EE.UU.     US$ ${d.envioUs.toFixed(2)}`,
    `Flete ${i.pesoKg} kg × ${i.tarifaKg}   US$ ${d.flete.toFixed(2)}`,
    `Fee fijo            US$ ${d.fee.toFixed(2)}`,
    `Impuesto ${(i.tasaImp * 100).toFixed(0)}%        US$ ${d.impuesto.toFixed(2)}`,
    `─────────────────────────────`,
    `Puesto en Asunción  US$ ${d.puesto.toFixed(2)}`,
  ];
}
