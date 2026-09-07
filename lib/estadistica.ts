/**
 * Mediana y percentiles. Nunca promedio.
 *
 * Un promedio lo destruye un outlier, y los errores de precio *son* outliers:
 * si el estimador se mueve con el error, el error deja de detectarse.
 * No hay función de media en este archivo a propósito.
 */

export function mediana(xs: readonly number[]): number | null {
  return percentil(xs, 0.5);
}

export function percentil(xs: readonly number[], p: number): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (v.length === 0) return null;
  if (p <= 0) return v[0];
  if (p >= 1) return v[v.length - 1];
  // Interpolación lineal entre los dos vecinos.
  const pos = (v.length - 1) * p;
  const bajo = Math.floor(pos);
  const alto = Math.ceil(pos);
  if (bajo === alto) return v[bajo];
  return v[bajo] + (v[alto] - v[bajo]) * (pos - bajo);
}

/**
 * Desviación absoluta mediana, normalizada por la mediana.
 * Es la medida de volatilidad que uso para priorizar: robusta a outliers,
 * a diferencia del desvío estándar.
 */
export function volatilidad(xs: readonly number[]): number {
  const m = mediana(xs);
  if (m === null || m === 0) return 0;
  const desvios = xs.filter(Number.isFinite).map((x) => Math.abs(x - m));
  const mad = mediana(desvios) ?? 0;
  return mad / m;
}

/** Mínimo, ignorando nulos. */
export function minimo(xs: readonly (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? Math.min(...v) : null;
}
