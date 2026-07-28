import { createClient } from '@/utils/supabase/server';
import { fetchToteatSales, getToteatCredentials } from '@/lib/toteat';
import { getToteatDemoSales } from '@/lib/toteat-demo';
import type { VentaLike } from '@/lib/carnicos-ventas';

export type FuenteVentas = 'sincronizadas' | 'toteat_en_vivo' | 'demo';

export async function getVentasParaFecha(fecha: string): Promise<{ ventas: VentaLike[]; fuente: FuenteVentas }> {
  const supabase = await createClient();
  const { data: sincronizadas, error } = await supabase
    .from('ventas_toteat')
    .select('fecha,product_code,product_name,quantity')
    .eq('fecha', fecha);

  if (!error && sincronizadas && sincronizadas.length > 0) {
    return { ventas: sincronizadas as VentaLike[], fuente: 'sincronizadas' };
  }

  try {
    getToteatCredentials();
  } catch {
    return { ventas: getToteatDemoSales(fecha), fuente: 'demo' };
  }

  const live = await fetchToteatSales(fecha, fecha, { soloComida: true });
  return {
    ventas: live.items.map(item => ({ fecha: item.fecha, product_code: item.product_code, product_name: item.product_name, quantity: item.quantity })),
    fuente: 'toteat_en_vivo',
  };
}
