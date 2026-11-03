// Fuente de datos del módulo Alertas. La UI solo conoce esta interfaz.
// Hoy: análisis real vía GET /api/alertas (solo lectura) + revisiones guardadas en este navegador.
// Para producción: guardar las revisiones en una tabla propia (sin tocar los movimientos).

import type { Alerta, CambioEstado, DatosModulo, EstadoRevision } from './types';

export interface FuenteAlertas {
  cargar(refrescar?: boolean): Promise<DatosModulo>;
  // Las alertas nunca se eliminan: cada revisión se agrega al historial
  cambiarEstado(alerta: Alerta, estado: EstadoRevision, usuario: string, nota?: string): Promise<Alerta>;
}

// ── Revisiones del piloto: localStorage (solo este navegador; no llegan a la base) ──
const LS_KEY = 'kops-alertas-revisiones-v1';
type Revisiones = Record<string, CambioEstado[]>;

function leer(): Revisiones {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) as Revisiones : {};
  } catch {
    return {};
  }
}
function guardar(r: Revisiones) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(r)); } catch { /* modo privado: dura hasta recargar */ }
}

function conRevisiones(a: Alerta, revisiones: Revisiones): Alerta {
  const extra = revisiones[a.id];
  if (!extra?.length) return a;
  return { ...a, estado: extra[extra.length - 1].estado, historial: [...a.historial, ...extra] };
}

function ahoraLocal(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

export const fuenteAnalisis: FuenteAlertas = {
  async cargar(refrescar = false) {
    const res = await fetch(`/api/alertas${refrescar ? '?refrescar=1' : ''}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'No se pudo cargar el análisis');
    const revisiones = leer();
    const datos = data as DatosModulo;
    return { ...datos, alertas: datos.alertas.map(a => conRevisiones(a, revisiones)) };
  },
  async cambiarEstado(alerta, estado, usuario, nota) {
    const r = leer();
    const cambio: CambioEstado = { estado, fecha: ahoraLocal(), usuario, ...(nota ? { nota } : {}) };
    r[alerta.id] = [...(r[alerta.id] ?? []), cambio];
    guardar(r);
    return { ...alerta, estado, historial: [...alerta.historial, cambio] };
  },
};

// Borra las revisiones del piloto (todas las alertas vuelven a Pendiente)
export function borrarRevisiones() {
  try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
}
