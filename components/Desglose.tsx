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
    [`Flete ${d.insumos.pesoKg} kg × ${d.insumos.tarifaKg}`, d.flete],
    ["Fee fijo", d.fee],
    [`Impuesto ${(d.insumos.tasaImp * 100).toFixed(0)}%`, d.impuesto],
  ];
  return (
    <table className="w-full text-sm">
      <tbody>
        {filas.map(([etiqueta, valor]) => (
          <tr key={etiqueta} className="text-[color:var(--color-tenue)]">
            <td className="py-0.5">{etiqueta}</td>
            <td className="numero py-0.5 text-right">{usd(valor)}</td>
          </tr>
        ))}
        <tr className="border-t border-[color:var(--color-borde)] font-semibold">
          <td className="pt-1.5">Puesto en Asunción</td>
          <td className="numero pt-1.5 text-right">{usd(d.puesto)}</td>
        </tr>
      </tbody>
    </table>
  );
}
