// Advertencias al guardar: corre las mismas reglas del módulo Alertas sobre un registro que todavía
// no se guarda. El borrador se agrega en memoria a los datos reales (para comparar contra lo habitual,
// duplicados, merma vs producción del día, etc.) y se devuelven solo las alertas que origina él.
// Solo lectura: no escribe nada en la base.

import type { SupabaseClient } from '@supabase/supabase-js';
import { cargarDatosSistema, type DatosSistema } from './datos';
import { analizarDatos } from './analizador';
import { REGLAS } from './catalogo';
import type { Alerta } from './types';

export type ModuloValidable = 'Producción' | 'Mermas' | 'Colación';

const BORRADOR = '__borrador__';
const MODO = new Map(REGLAS.map(r => [r.codigo, r.modo]));

// Los datos de referencia (≈17 mil filas) se reutilizan unos minutos: lo que cambia entre un
// guardado y otro no altera medianas ni rendimientos habituales.
const CACHE_MS = 3 * 60 * 1000;
let cache: { en: number; datos: Promise<DatosSistema> } | null = null;

function datosReferencia(supabase: SupabaseClient) {
  if (!cache || Date.now() - cache.en > CACHE_MS) {
    const datos = cargarDatosSistema(supabase);
    cache = { en: Date.now(), datos };
    datos.catch(() => { cache = null; });
  }
  return cache.datos;
}

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === 'string' ? v : v == null ? null : String(v));
const num = (v: unknown) => Number(v) || 0;
const filas = (v: unknown) => (Array.isArray(v) ? (v as Fila[]) : []);

function conBorrador(d: DatosSistema, modulo: ModuloValidable, body: Fila): DatosSistema {
  const fecha = String(body.fecha ?? '');
  const ahora = new Date().toISOString();
  const responsable = txt(body.responsable_nombre);
  const out: DatosSistema = { ...d };

  if (modulo === 'Producción') {
    out.produccion = [...d.produccion, { id: BORRADOR, fecha, responsable_nombre: responsable, observacion: txt(body.observacion), created_at: ahora }];
    out.detalleProduccion = [...d.detalleProduccion, ...filas(body.detalle).map((l, i) => ({
      id: `${BORRADOR}-${i}`, produccion_id: BORRADOR, pp_id: txt(l.pp_id), nombre_pp: txt(l.nombre_pp), tipo_pp: txt(l.tipo_pp),
      cantidad: num(l.cantidad), gramos_por_pp: l.gramos_por_pp == null ? null : num(l.gramos_por_pp),
      total_producido: l.total_producido == null ? null : num(l.total_producido), codigo_producto: txt(l.codigo_producto),
      costo_unitario: l.costo_unitario == null ? null : num(l.costo_unitario),
    }))];
    out.rendimiento = [...d.rendimiento, ...filas(body.rendimiento).map((r, i) => ({
      id: `${BORRADOR}-r${i}`, produccion_id: BORRADOR, fecha: String(r.fecha ?? fecha), verdura: String(r.verdura ?? ''),
      kg_utilizados: num(r.kg_utilizados), rendimiento_kg: num(r.rendimiento_kg), responsable_nombre: responsable,
    }))];
  } else if (modulo === 'Mermas') {
    out.mermas = [...d.mermas, { id: BORRADOR, fecha, responsable_nombre: responsable, observacion: txt(body.observacion), created_at: ahora }];
    out.detalleMermas = [...d.detalleMermas, ...filas(body.detalle).map((l, i) => ({
      id: `${BORRADOR}-${i}`, merma_id: BORRADOR, codigo_producto: txt(l.codigo_producto), nombre_producto: txt(l.nombre_producto),
      cantidad: num(l.cantidad), unidad_medida: txt(l.unidad_medida), motivo: txt(l.motivo),
      costo_unitario: l.costo_unitario == null ? null : num(l.costo_unitario),
    }))];
  } else {
    out.colacion = [...d.colacion, { id: BORRADOR, fecha, responsable_nombre: responsable, menu: txt(body.menu), n_inscritos: num(body.n_inscritos), created_at: ahora }];
    out.detalleColacion = [...d.detalleColacion, ...filas(body.detalle).map((l, i) => ({
      id: `${BORRADOR}-${i}`, colacion_id: BORRADOR, codigo_producto: txt(l.codigo_producto), nombre_producto: txt(l.nombre_producto),
      cantidad: num(l.cantidad), unidad_medida: txt(l.unidad_medida),
      costo_unitario: l.costo_unitario == null ? null : num(l.costo_unitario),
    }))];
  }
  return out;
}

export async function advertenciasDeBorrador(supabase: SupabaseClient, modulo: ModuloValidable, body: Fila): Promise<Alerta[]> {
  const datos = conBorrador(await datosReferencia(supabase), modulo, body);
  // `desde` = fecha del borrador: solo interesa lo que genera este registro
  const { alertas } = analizarDatos(datos, String(body.fecha ?? '').slice(0, 10) || undefined);
  return alertas.filter(a => a.origen === BORRADOR && MODO.get(a.regla) === 'ADVERTIR');
}
