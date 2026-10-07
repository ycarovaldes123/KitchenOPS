'use client';

import { useMemo, useState } from 'react';
import NavIcon from '@/components/layout/NavIcon';
import { CATEGORIA_LABEL } from '@/lib/alertas/catalogo';
import { enRango, fmtFechaHora } from '@/lib/alertas/metricas';
import type { Alerta, ModuloAlerta, NivelAlerta } from '@/lib/alertas/types';
import type { FuenteAlertas } from '@/lib/alertas/fuente';
import { alertasDelResumen } from '@/lib/alertas/resumen';
import { useAlertas } from './useAlertas';
import FiltrosAlertas, { FILTROS_INICIALES, RANGO_LABEL, type Filtros } from './FiltrosAlertas';
import TablaAlertas from './TablaAlertas';
import AlertaDrawer from './AlertaDrawer';
import ReglasPanel from './ReglasPanel';
import MetricasPanel from './MetricasPanel';
import CorreoPreview from './CorreoPreview';

type Pestana = 'alertas' | 'reglas' | 'metricas';
const PESTANAS: { key: Pestana; label: string }[] = [
  { key: 'alertas', label: 'Alertas' },
  { key: 'metricas', label: 'Métricas' },
  { key: 'reglas', label: 'Reglas' },
];
const ORDEN_NIVEL: Record<NivelAlerta, number> = { ALTA: 0, REVISAR: 1, INFO: 2 };

const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function coincide(a: Alerta, texto: string): boolean {
  const q = norm(texto).trim();
  if (!q) return true;
  const campos = norm([a.registro, a.codigo, a.regla, a.modulo, a.movimiento.created_by, a.detalle, a.titulo, a.movimiento.id, CATEGORIA_LABEL[a.categoria]].join(' '));
  return q.split(/\s+/).every(t => campos.includes(t));
}

// `fuente` permite inyectar otra fuente de datos (por defecto: análisis real vía /api/alertas)
export default function AlertasModulo({ fuente }: { fuente?: FuenteAlertas }) {
  const { datos, error, cargando, actualizar, cambiarEstado, reiniciarRevisiones } = useAlertas(fuente);
  const [pestana, setPestana] = useState<Pestana>('alertas');
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [correo, setCorreo] = useState(false);

  const alertas = useMemo(() => datos?.alertas ?? [], [datos]);
  const hoy = datos?.hoy ?? '';
  const enPeriodo = useMemo(() => alertas.filter(a => enRango(a.fecha, filtros.rango, hoy)), [alertas, filtros.rango, hoy]);

  const visibles = useMemo(() => enPeriodo
    .filter(a => (!filtros.modulo || a.modulo === filtros.modulo)
      && (!filtros.estado || a.estado === filtros.estado)
      && (!filtros.nivel || a.nivel === filtros.nivel)
      && coincide(a, filtros.texto))
    .sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel] || b.fecha.localeCompare(a.fecha)),
  [enPeriodo, filtros]);

  const modulos = useMemo(() => [...new Set(alertas.map(a => a.modulo))].sort() as ModuloAlerta[], [alertas]);
  const seleccionada = alertas.find(a => a.id === seleccionadaId) ?? null;

  // Correo: mismas alertas que el envío real (Producción, Mermas, Colación · último día con alertas)
  const { fecha: ultimoDia, alertas: delUltimoDia } = alertasDelResumen(alertas);

  // Indicadores = accesos rápidos a filtros
  const pendientes = enPeriodo.filter(a => a.estado === 'PENDIENTE');
  const kpis: { label: string; valor: number; activo: boolean; aplicar: Partial<Filtros>; main?: boolean }[] = [
    { label: 'Pendientes', valor: pendientes.length, main: true, activo: filtros.estado === 'PENDIENTE' && !filtros.nivel, aplicar: { estado: 'PENDIENTE', nivel: '' } },
    { label: 'Alta atención', valor: pendientes.filter(a => a.nivel === 'ALTA').length, activo: filtros.nivel === 'ALTA', aplicar: { estado: 'PENDIENTE', nivel: 'ALTA' } },
    { label: 'Revisadas', valor: enPeriodo.length - pendientes.length, activo: false, aplicar: { estado: '', nivel: '' } },
    { label: `Total · ${RANGO_LABEL[filtros.rango].toLowerCase()}`, valor: enPeriodo.length, activo: !filtros.estado && !filtros.nivel, aplicar: { estado: '', nivel: '' } },
  ];

  return (
    <div className="page rpp-page rpp alr">
      <header className="alr-head">
        <div>
          <h1 className="alr-title">Alertas y Validaciones <span className="alr-sim">PILOTO LOCAL</span></h1>
          <p className="alr-sub">Calidad de los datos cargados en KitchenOps.</p>
        </div>
        <div className="alr-head-actions">
          <button type="button" className="rpp-btn" onClick={actualizar} disabled={cargando} title="Vuelve a analizar todos los datos (solo lectura)">
            <NavIcon name="refresh" size={15} /> {cargando ? 'Analizando…' : 'Actualizar'}
          </button>
          <button type="button" className="rpp-btn" onClick={() => setCorreo(true)} disabled={!alertas.length}>
            <NavIcon name="mail" size={15} /> Resumen diario
          </button>
        </div>
      </header>

      <div className="alr-obs" role="status">
        <NavIcon name="shield-alert" size={18} />
        <span><strong>Módulo activo</strong> · advierte al guardar en Producción, Mermas y Colación; no bloquea ni modifica movimientos</span>
        {datos && (
          <span className="alr-obs-meta">
            Análisis {fmtFechaHora(datos.generadoEn)} · {datos.registrosAnalizados.toLocaleString('es-CL')} registros
          </span>
        )}
      </div>

      <nav className="alr-tabs" role="tablist" aria-label="Secciones de Alertas">
        {PESTANAS.map(p => (
          <button key={p.key} type="button" role="tab" aria-selected={pestana === p.key} className={`alr-tab${pestana === p.key ? ' is-active' : ''}`} onClick={() => setPestana(p.key)}>
            {p.label}
          </button>
        ))}
      </nav>

      {error ? (
        <div className="rpp-alert is-error">{error}</div>
      ) : !datos ? (
        <p className="alr-muted" style={{ fontSize: 14 }}>Analizando los datos del sistema…</p>
      ) : pestana === 'alertas' ? (
        <>
          <div className="alr-kpis">
            {kpis.map(k => (
              <button
                key={k.label}
                type="button"
                className={`alr-kpi${k.main ? ' is-main' : ''}${k.activo ? ' is-on' : ''}`}
                onClick={() => setFiltros(f => ({ ...f, ...k.aplicar }))}
                aria-pressed={k.activo}
              >
                <b>{k.valor}</b><span>{k.label}</span>
              </button>
            ))}
          </div>
          <FiltrosAlertas filtros={filtros} onChange={setFiltros} modulos={modulos} visibles={visibles.length} />
          <TablaAlertas key={JSON.stringify(filtros)} alertas={visibles} seleccionada={seleccionadaId} onSelect={a => setSeleccionadaId(a.id)} />
        </>
      ) : pestana === 'metricas' ? (
        <MetricasPanel alertas={alertas} volumen={datos.volumen} onReiniciar={reiniciarRevisiones} />
      ) : (
        <ReglasPanel reglas={datos.reglas} />
      )}

      {seleccionada && (
        <AlertaDrawer
          key={seleccionada.id}
          alerta={seleccionada}
          onClose={() => setSeleccionadaId(null)}
          onEstado={estado => { void cambiarEstado(seleccionada, estado); }}
        />
      )}

      {correo && ultimoDia && (
        <CorreoPreview
          alertas={delUltimoDia}
          fecha={ultimoDia}
          onClose={() => setCorreo(false)}
          onVerTodas={() => { setCorreo(false); setPestana('alertas'); setFiltros({ ...FILTROS_INICIALES, estado: '', rango: ultimoDia === hoy ? 'HOY' : '7D' }); }}
        />
      )}
    </div>
  );
}
