export const TIPOS_CARTA = ['ANTIGUA', 'NUEVA'] as const;

export type TipoCarta = typeof TIPOS_CARTA[number];
