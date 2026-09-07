import { desgloseEnTexto, type Desglose } from "../costo";

export type ContenidoAlerta = {
  producto: string;
  tienda: string;
  url: string;
  objetivo: number | null;
  desglose: Desglose;
  regla: string;
};

export const asunto = (c: ContenidoAlerta): string =>
  `US$ ${c.desglose.puesto.toFixed(2)} puesto — ${c.producto} (${c.tienda})`;

/**
 * Toda alerta muestra el desglose completo. Sin eso el aviso obliga a abrir la
 * app para saber si el número es real, y un aviso que hay que verificar a mano
 * no sirve de nada.
 */
export function textoAlerta(c: ContenidoAlerta): string {
  const lineas = [
    c.producto,
    `${c.tienda} — ${c.url}`,
    "",
    ...desgloseEnTexto(c.desglose),
  ];
  if (c.objetivo !== null) {
    const dif = c.objetivo - c.desglose.puesto;
    lineas.push("", `Tu objetivo: US$ ${c.objetivo.toFixed(2)} (${dif >= 0 ? "−" : "+"}US$ ${Math.abs(dif).toFixed(2)})`);
  }
  lineas.push("", `Regla ${c.regla}`);
  return lineas.join("\n");
}

const escapar = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function htmlAlerta(c: ContenidoAlerta): string {
  const d = c.desglose;
  const fila = (etiqueta: string, valor: number, fuerte = false) =>
    `<tr><td style="padding:4px 12px 4px 0;${fuerte ? "font-weight:600;" : ""}">${escapar(etiqueta)}</td>` +
    `<td align="right" style="padding:4px 0;font-variant-numeric:tabular-nums;${fuerte ? "font-weight:600;" : ""}">US$ ${valor.toFixed(2)}</td></tr>`;

  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;color:#111">
  <p style="margin:0 0 4px;font-size:13px;color:#666">${escapar(c.tienda)} · regla ${escapar(c.regla)}</p>
  <h2 style="margin:0 0 2px;font-size:18px">${escapar(c.producto)}</h2>
  <p style="margin:0 0 16px;font-size:28px;font-weight:700">US$ ${d.puesto.toFixed(2)} <span style="font-size:13px;font-weight:400;color:#666">puesto en Asunción</span></p>
  <table style="border-collapse:collapse;font-size:14px;width:100%">
    ${fila("Etiqueta", d.etiqueta)}
    ${fila("Envío en EE.UU.", d.envioUs)}
    ${fila(`Flete ${d.insumos.pesoKg} kg × ${d.insumos.tarifaKg}`, d.flete)}
    ${fila("Fee fijo", d.fee)}
    ${fila(`Impuesto ${(d.insumos.tasaImp * 100).toFixed(0)}%`, d.impuesto)}
    <tr><td colspan="2" style="border-top:1px solid #ddd;padding:0"></td></tr>
    ${fila("Puesto", d.puesto, true)}
  </table>
  ${c.objetivo !== null ? `<p style="margin:12px 0 0;font-size:14px;color:#555">Tu objetivo: US$ ${c.objetivo.toFixed(2)}</p>` : ""}
  <p style="margin:16px 0 0"><a href="${escapar(c.url)}" style="font-size:14px">Ver en ${escapar(c.tienda)}</a></p>
</div>`;
}
