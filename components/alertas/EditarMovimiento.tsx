'use client';

import { useState } from 'react';
import NavIcon from '@/components/layout/NavIcon';
import { fmtFecha } from '@/lib/alertas/metricas';
import type { EdicionMovimiento } from '@/lib/alertas/types';

// Corrige el movimiento que originó la alerta usando los mismos PATCH que Historial / Control Cárnicos
// (solo admin; el servidor recalcula costos y totales). Solo se envían los campos que cambiaron.

const API: Record<'Producción' | 'Mermas' | 'Colación', { url: string; campo: string }> = {
  'Producción': { url: '/api/produccion', campo: 'produccion_id' },
  'Mermas': { url: '/api/mermas', campo: 'merma_id' },
  'Colación': { url: '/api/colacion', campo: 'colacion_id' },
};

const fmtN = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 3 });
// Acepta "1,5" y "1.234,5" (formato chileno) además de "1.5"
const aNumero = (s: string) => { const t = s.trim(); return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); };
const texto = (n: number) => String(n).replace('.', ',');

async function enviar(url: string, method: 'PATCH', body: Record<string, unknown>) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar el cambio');
}

interface Props {
  edicion: EdicionMovimiento;
  // nota = resumen del cambio para el historial de la alerta
  onCorregido: (nota: string) => void;
}

export default function EditarMovimiento({ edicion: e, onCorregido }: Props) {
  const [cantidad, setCantidad] = useState('cantidad' in e ? texto(e.cantidad) : '');
  const [kg, setKg] = useState(e.tipo === 'rendimiento' ? texto(e.kg) : '');
  const [rend, setRend] = useState(e.tipo === 'rendimiento' ? texto(e.rendimiento) : '');
  const [fecha, setFecha] = useState(e.fecha);
  const [guardando, setGuardando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [error, setError] = useState('');

  const conFecha = e.tipo !== 'rendimiento';
  const conCantidad = e.tipo === 'linea' || e.tipo === 'carnico';
  const nCant = aNumero(cantidad), nKg = aNumero(kg), nRend = aNumero(rend);
  const cambioCant = conCantidad && 'cantidad' in e && nCant !== e.cantidad;
  const cambioFecha = conFecha && fecha !== e.fecha;
  const cambioRend = e.tipo === 'rendimiento' && (nKg !== e.kg || nRend !== e.rendimiento);
  const hayCambios = cambioCant || cambioFecha || cambioRend;

  const validar = (): string => {
    if (cambioCant && !(Number.isFinite(nCant) && nCant > 0)) return 'La cantidad debe ser mayor a 0 (para quitarla usa "Eliminar línea").';
    if (cambioFecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'Fecha inválida.';
    if (cambioRend) {
      if (!(Number.isFinite(nKg) && nKg > 0) || !(Number.isFinite(nRend) && nRend > 0)) return 'Los KG deben ser mayores a 0.';
      if (nRend > nKg) return 'El rendimiento no puede ser mayor que los KG utilizados.';
    }
    return '';
  };

  const guardar = async () => {
    const msg = validar();
    if (msg) { setError(msg); return; }
    setError(''); setGuardando(true);
    const notas: string[] = [];
    try {
      if (e.tipo === 'carnico') {
        const body: Record<string, unknown> = { id: e.lineaId };
        if (cambioCant) { body.cantidad = nCant; notas.push(`Cantidad ${fmtN(e.cantidad)} → ${fmtN(nCant)} ${e.unidad}`); }
        if (cambioFecha) { body.fecha = fecha; notas.push(`Fecha ${fmtFecha(e.fecha)} → ${fmtFecha(fecha)}`); }
        await enviar('/api/control-carnicos/movimientos', 'PATCH', body);
      } else if (e.tipo === 'rendimiento') {
        await enviar('/api/produccion', 'PATCH', {
          produccion_id: e.cabeceraId, detalle: [],
          rendimiento: [{ id: e.lineaId, kg_utilizados: nKg, rendimiento_kg: nRend }],
        });
        notas.push(`Rendimiento ${fmtN(e.kg)} → ${fmtN(e.rendimiento)} KG corregido a ${fmtN(nKg)} → ${fmtN(nRend)} KG`);
      } else {
        const api = API[e.modulo];
        const body: Record<string, unknown> = { [api.campo]: e.cabeceraId, detalle: [] };
        if (e.tipo === 'linea' && cambioCant) {
          body.detalle = [{ id: e.lineaId, cantidad: nCant }];
          notas.push(`Cantidad ${fmtN(e.cantidad)} → ${fmtN(nCant)} ${e.unidad}`.trim());
        }
        if (cambioFecha) { body.fecha = fecha; notas.push(`Fecha del registro ${fmtFecha(e.fecha)} → ${fmtFecha(fecha)}`); }
        await enviar(api.url, 'PATCH', body);
      }
      onCorregido(notas.join(' · '));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cambio');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarLinea = async () => {
    if (e.tipo !== 'linea') return;
    setError(''); setGuardando(true);
    try {
      const api = API[e.modulo];
      await enviar(api.url, 'PATCH', { [api.campo]: e.cabeceraId, detalle: [], delete_ids: [e.lineaId] });
      onCorregido(`Línea eliminada (${fmtN(e.cantidad)} ${e.unidad})`.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la línea');
      setConfirmarEliminar(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="alr-edit" aria-label="Editar movimiento">
      <h3><NavIcon name="edit" size={15} /> Corregir movimiento</h3>
      <p className="alr-edit-hint">El cambio se guarda en el registro original{e.tipo !== 'carnico' ? ` de ${e.tipo === 'rendimiento' ? 'Producción (rendimiento)' : e.modulo}` : ' de Control Cárnicos'} y la alerta queda como Corregida.</p>

      <div className="alr-edit-grid">
        {conCantidad && (
          <label className={e.tipo === 'linea' && e.sugerida ? 'alr-edit-sug' : undefined}>
            <span>Cantidad{'unidad' in e && e.unidad ? ` (${e.unidad})` : ''}</span>
            <input className="alr-select alr-input" inputMode="decimal" value={cantidad} onChange={ev => setCantidad(ev.target.value)} disabled={guardando} />
            {e.tipo === 'linea' && e.sugerida != null && aNumero(cantidad) !== e.sugerida && (
              <button type="button" className="rpp-btn rpp-btn-sm" onClick={() => setCantidad(texto(e.sugerida!))} disabled={guardando}>
                Usar sugerencia: {fmtN(e.sugerida)}{e.unidad ? ` ${e.unidad}` : ''}
              </button>
            )}
          </label>
        )}
        {e.tipo === 'rendimiento' && (
          <>
            <label>
              <span>KG utilizados</span>
              <input className="alr-select alr-input" inputMode="decimal" value={kg} onChange={ev => setKg(ev.target.value)} disabled={guardando} />
            </label>
            <label>
              <span>KG rendidos</span>
              <input className="alr-select alr-input" inputMode="decimal" value={rend} onChange={ev => setRend(ev.target.value)} disabled={guardando} />
            </label>
          </>
        )}
        {conFecha && (
          <label>
            <span>{e.tipo === 'carnico' ? 'Fecha' : 'Fecha del registro'}</span>
            <input type="date" className="alr-select alr-input" value={fecha} onChange={ev => setFecha(ev.target.value)} disabled={guardando} />
          </label>
        )}
      </div>
      {cambioFecha && e.tipo !== 'carnico' && <p className="alr-edit-hint">La fecha cambia para todo el registro, no solo esta línea.</p>}
      {e.tipo === 'cabecera' && <p className="alr-edit-hint">Para cambiar cantidades de este registro usa Historial.</p>}

      {error && <div className="rpp-alert is-error" role="alert">{error}</div>}

      <div className="alr-edit-actions">
        <button type="button" className="rpp-btn rpp-btn-primary" onClick={guardar} disabled={guardando || !hayCambios}>
          <NavIcon name="check" size={14} /> {guardando ? 'Guardando…' : 'Guardar corrección'}
        </button>
        {e.tipo === 'linea' && (confirmarEliminar ? (
          <>
            <button type="button" className="rpp-btn rpp-btn-danger" onClick={eliminarLinea} disabled={guardando}>Sí, eliminar línea</button>
            <button type="button" className="rpp-btn" onClick={() => setConfirmarEliminar(false)} disabled={guardando}>Cancelar</button>
          </>
        ) : (
          <button type="button" className="rpp-btn" onClick={() => setConfirmarEliminar(true)} disabled={guardando}>
            <NavIcon name="trash" size={14} /> Eliminar línea
          </button>
        ))}
      </div>
    </section>
  );
}
