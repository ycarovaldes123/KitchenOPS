import type { VentaLike } from '@/lib/carnicos-ventas';

/**
 * Dataset sintetico usado SOLO cuando faltan credenciales TOTEAT
 * (TOTEAT_XIR/XIL/XIU/XAPITOKEN) y no hay ventas_toteat sincronizadas para la
 * fecha consultada. Todo queda marcado DEMO- / (DEMO) para que nunca se
 * confunda con datos reales. Cubre: plato con 1 carne, plato con varias
 * carnes (espejo de K13057 TABLA CRIOLLA), dos platos que resuelven al mismo
 * producto, y un codigo sin relacion (para probar el warning correspondiente).
 */
export function getToteatDemoSales(fecha: string): VentaLike[] {
  return [
    { fecha, product_code: 'K13012', product_name: 'CRUDO KUNSTMANN (DEMO)', quantity: 12 },
    { fecha, product_code: 'K13057', product_name: 'TABLA CRIOLLA (DEMO)', quantity: 5 },
    { fecha, product_code: 'K17000', product_name: 'ENSALADA CESAR DE POLLO (DEMO)', quantity: 8 },
    { fecha, product_code: 'K63000', product_name: 'ENSALADA CESAR DE POLLO PEDIDOS YA (DEMO)', quantity: 3 },
    { fecha, product_code: 'K99999', product_name: 'PLATO SIN RELACION (DEMO)', quantity: 2 },
  ];
}
