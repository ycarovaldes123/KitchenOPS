import type { ToteatVentaItem } from '@/lib/toteat';

// Precio de carta desde las ventas de Toteat (regla de la usuaria, 2026-11-09):
//   precio = (venta total Toteat + descuento) / cantidad vendida
// La venta de Toteat (payed) ya viene con el descuento restado y el descuento viene negativo, así que se
// suma de vuelta su valor absoluto. El botón "Actualizar precio" usa solo los últimos 30 días (Toteat entrega
// ~4 días por segundo, 90 días tardaban ~24 s); el script usa 30 → 90 días o un rango propio.
// Lo usan el botón "Actualizar precio" de Costos (/api/carta/precio-toteat) y scripts/precios-carta-con-descuento.mjs.

export type PrecioToteat = {
  venta: number;
  descuento: number;
  cantidad: number;
  precio: number;
  periodo: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Rango de consulta: hasta = ayer (hora Chile) salvo que se indique; desde30/desde90 inclusive. */
export function rangoPrecioToteat(hastaIso?: string) {
  const ayer = hastaIso ?? (() => {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
    const d = new Date(`${hoy}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return iso(d);
  })();
  const base = new Date(`${ayer}T12:00:00Z`);
  const menos = (n: number) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() - n); return iso(d); };
  return { hasta: ayer, desde30: menos(29), desde90: menos(89) };
}

export function codigoToteatDeVenta(item: Pick<ToteatVentaItem, 'product_code' | 'raw'>) {
  const detail = (item.raw as { detail?: { id?: unknown } } | undefined)?.detail;
  return String(detail?.id ?? item.product_code ?? '').trim();
}

export type VentanaPrecio = { desde: string; periodo: string };

/** Ventanas por defecto: últimos 30 días y, si el plato no se vendió, 90 días. */
export function ventanasPorDefecto(rango: { desde30: string; desde90: string }): VentanaPrecio[] {
  return [{ desde: rango.desde30, periodo: '30 días' }, { desde: rango.desde90, periodo: '90 días' }];
}

/** Precio por código Toteat (en mayúsculas): se usa la primera ventana (desde → hasta de los items) con ventas. */
export function calcularPreciosToteat(
  items: Pick<ToteatVentaItem, 'fecha' | 'product_code' | 'raw' | 'gross_amount' | 'discount_amount' | 'quantity'>[],
  ventanas: VentanaPrecio[],
) {
  const agrupar = (desde: string) => {
    const m = new Map<string, { venta: number; descuento: number; cantidad: number }>();
    for (const i of items) {
      if (i.fecha < desde) continue;
      const code = codigoToteatDeVenta(i).toUpperCase();
      if (!code) continue;
      const e = m.get(code) ?? { venta: 0, descuento: 0, cantidad: 0 };
      e.venta += Number(i.gross_amount) || 0;
      e.descuento += Number(i.discount_amount) || 0;
      e.cantidad += Number(i.quantity) || 0;
      m.set(code, e);
    }
    return m;
  };
  const agregados = ventanas.map(v => ({ ...v, m: agrupar(v.desde) }));
  const codigos = new Set(agregados.flatMap(a => [...a.m.keys()]));
  const out = new Map<string, PrecioToteat>();
  for (const code of codigos) {
    for (const a of agregados) {
      const e = a.m.get(code);
      // descuento es negativo: venta - descuento = venta + |descuento|
      if (e && e.cantidad > 0 && e.venta - e.descuento > 0) {
        out.set(code, { ...e, periodo: a.periodo, precio: Math.round((e.venta - e.descuento) / e.cantidad) });
        break;
      }
    }
  }
  return out;
}
