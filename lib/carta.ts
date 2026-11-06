// BEBESTIBLES y PEDIDOSYA requieren scripts/supabase_carta_tipos_bebestibles_pedidosya.sql
// (amplia el CHECK carta_tipo_carta_check de la BD).
export const TIPOS_CARTA = ['NUEVA', 'ANTIGUA', 'BEBESTIBLES', 'PEDIDOSYA'] as const;

export type TipoCarta = typeof TIPOS_CARTA[number];

// En la UI la carta NUEVA se presenta como "Carta actual".
export const NOMBRE_TIPO_CARTA: Record<TipoCarta, string> = {
  NUEVA: 'Carta actual',
  ANTIGUA: 'Carta antigua',
  BEBESTIBLES: 'Bebestibles',
  PEDIDOSYA: 'PedidosYa',
};

export function esTipoCarta(value: unknown): value is TipoCarta {
  return typeof value === 'string' && (TIPOS_CARTA as readonly string[]).includes(value);
}

// La categoria del plato es texto en carta.categoria (siempre en mayusculas). Esta es la lista
// que se ofrece al crear/editar; un plato con una categoria antigua fuera de la lista la conserva.
export const CATEGORIAS_CARTA = [
  'PLATOS',
  'PICADAS',
  'SANDWICH & BURGERS',
  'ENSALADAS',
  'POSTRES',
  'AGREGADOS Y PORCIONES',
  'JUGOS NATURALES',
  'CAFETERÍA',
  'CAFETERÍA GASTOS PERSONAL',
  'CAFETERÍA PERSONAL',
  'MAQUINA DE CAFE LAVAZZA',
  'COCTELERÍA',
  'CATERING',
] as const;

// Selector Comida / Coctelería / Cafetería de Costos: el grupo sale de la categoria del plato.
// Cafeteria agrupa las categorias CAFETERÍA*, MAQUINA DE CAFE LAVAZZA y JUGOS NATURALES; Cocteleria, las que contienen
// COCTEL/COCKTAIL/TRAGO; todo lo demas es Comida.
export const GRUPOS_CARTA = ['comida', 'cocteleria', 'cafeteria'] as const;
export type GrupoCarta = typeof GRUPOS_CARTA[number];

export function grupoDeCategoria(categoria: string | null | undefined): GrupoCarta {
  const c = String(categoria ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/COCTEL|COCKTAIL|TRAGO/.test(c)) return 'cocteleria';
  if (c.startsWith('CAFETERIA') || c.includes('LAVAZZA') || c.includes('JUGO')) return 'cafeteria';
  return 'comida';
}
