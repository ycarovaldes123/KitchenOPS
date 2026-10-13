'use client';

import { useState } from 'react';
import NavIcon from '@/components/layout/NavIcon';
import type { ColorSemaforo } from '@/types/database';

export interface Ingrediente {
  id: string;
  nombre: string | null;
  cantidad: number;
  unidad_medida: string | null;
  precio_unitario: number | null;
  costo_total: number | null;
  codigo_producto: string | null;
  pp_id: string | null;
}

export interface Plato {
  id: string;
  cod_softland: string | null;
  codigo_toteat?: string | null;
  nombre: string;
  categoria: string;
  tipo_carta: 'ANTIGUA' | 'NUEVA';
  precio_carta: number | null;
  activo: boolean;
  costo_neto: number;
  costo_bruto: number;
  margen_pct: number | null;
  semaforo: ColorSemaforo;
  foto_url: string | null;
  carta_ingredientes: Ingrediente[];
}

// En la UI la carta NUEVA se presenta como "Carta actual".
export const NOMBRE_CARTA: Record<'all' | 'ANTIGUA' | 'NUEVA', string> = {
  all: 'Todas las cartas',
  NUEVA: 'Carta actual',
  ANTIGUA: 'Carta antigua',
};

export function CartaTag({ tipo }: { tipo: 'ANTIGUA' | 'NUEVA' }) {
  return tipo === 'NUEVA'
    ? <span className="ck-tag ck-tag--actual">Carta actual</span>
    : <span className="ck-tag ck-tag--antigua">Antigua</span>;
}

export function esIngredientePP(ing: Pick<Ingrediente, 'codigo_producto' | 'pp_id'>) {
  return !!ing.pp_id || /^0502\d+$/.test((ing.codigo_producto ?? '').trim());
}

/** Foto del plato; si no hay URL o la imagen falla, placeholder gastronomico (nunca imagen rota). */
export function PlatoFoto({ src, alt, iconSize = 34, className }: { src: string | null; alt: string; iconSize?: number; className?: string }) {
  const [fallida, setFallida] = useState<string | null>(null);
  if (!src || fallida === src) {
    return (
      <div className={`ck-placeholder ${className ?? ''}`} role="img" aria-label={`${alt} sin foto`}>
        <NavIcon name="utensils" size={iconSize} strokeWidth={1.5} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- fotos externas (CDN/Storage) de largo arbitrario
  return <img src={src} alt={alt} className={className} loading="lazy" decoding="async" onError={() => setFallida(src)} />;
}
