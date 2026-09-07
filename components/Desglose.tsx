import type { Desglose } from "@/lib/costo";

const usd = (n: number) => `US$ ${n.toFixed(2)}`;

/**
 * El desglose completo. Va en pantalla y en el mail con las mismas cifras:
 * el número puesto no se muestra nunca solo, porque un número que no se puede
 * verificar a mano no se puede usar para decidir.
 */
export function DesgloseTabla({ d }: { d: Desglose }) {
  const filas: [string, number][] = [
    ["Etiqueta", d.etiqueta],
    ["Envío en EE.UU.", d.envioUs],
    [`Flete · ${d.insumos.pesoKg} kg × ${d.insumos.tarifaKg}`, d.flete],
    ["Fee fijo", d.fee],
    [`Impuesto · ${(d.insumos.tasaImp * 100).toFixed(0)}%`, d.impuesto],
  ];
  return (
    <dl className="text-sm">
      {filas.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="flex items-baseline justify-between gap-4 py-1">
          <dt className="text-tenue">{etiqueta}</dt>
          <dd className="numero text-tinta/90">{usd(valor)}</dd>
        </div>
      ))}
      <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-borde pt-2 font-semibold">
        <dt>Puesto en Asunción</dt>
        <dd className="numero">{usd(d.puesto)}</dd>
      </div>
    </dl>
  );
}
