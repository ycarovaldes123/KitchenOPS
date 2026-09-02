'use client';

import { useEffect, useState } from 'react';
import type { CarnicoProducto } from '@/types/carnicos';
import type { Responsable } from '@/types/database';
import { useRol } from '@/components/RolProvider';
import NavIcon from '@/components/layout/NavIcon';
import IngresosSalidasTab from './tabs/IngresosSalidasTab';
import VentasTab from './tabs/VentasTab';
import InventariosTab from './tabs/InventariosTab';
import TablaResumenTab from './tabs/TablaResumenTab';
import HistorialTab from './tabs/HistorialTab';

type Tab = 'ingresos-salidas' | 'ventas' | 'inventarios' | 'resumen' | 'historial';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'ingresos-salidas', label: 'Ingresos / Salidas', icon: 'download' },
  { key: 'ventas', label: 'Ventas', icon: 'dollar' },
  { key: 'inventarios', label: 'Inventarios', icon: 'grid' },
  { key: 'resumen', label: 'Tabla Resumen', icon: 'barchart' },
  { key: 'historial', label: 'Historial', icon: 'clock' },
];

export interface Maestros {
  productos: CarnicoProducto[];
  responsables: Responsable[];
}

function IconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

// Silueta de trozo de carne con hueso (pierna/osobuco): un corte redondeado + un hueso que sobresale.
function IconCarne({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9.5" cy="9.5" r="6.5" />
      <line x1="14" y1="14" x2="19.5" y2="19.5" />
      <circle cx="20" cy="20" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function ControlCarnicosPage() {
  const { puede } = useRol();
  // Roles sin permiso de registrar (ej. jefatura/fcaro) solo ven la Tabla Resumen, en solo lectura.
  const soloResumen = !puede('controlCarnicos', 'registrar');
  const tabsDisponibles = soloResumen ? TABS.filter(t => t.key === 'resumen') : TABS;

  // El modulo siempre abre en Tabla Resumen al entrar o al refrescar (no se recuerda la ultima pestaña visitada).
  const [tab, setTab] = useState<Tab>('resumen');
  const [maestros, setMaestros] = useState<Maestros | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rangoHeader, setRangoHeader] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/control-carnicos/maestros')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setMaestros({ productos: data.productos ?? [], responsables: data.responsables ?? [] });
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Error cargando maestros'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page" style={{ paddingBottom: '48px', maxWidth: 'none' }}>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px', height: '46px', borderRadius: '13px', background: 'var(--al)', color: 'var(--ac)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <IconCarne size={24} />
          </div>
          <div>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '24px', fontWeight: 800, margin: 0 }}>Control Cárnicos</h1>
            <p style={{ color: 'var(--ts)', margin: '4px 0 0', fontSize: '13.5px' }}>
              Ingresos, salidas, ventas Toteat, inventarios y cuadre diario de productos cárnicos.
            </p>
          </div>
        </div>

        {rangoHeader && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', border: '1.5px solid var(--bo)', borderRadius: '10px',
            padding: '9px 14px', fontSize: '13px', fontWeight: 700, color: 'var(--tx)', background: 'var(--sf)',
          }}>
            <IconCalendar />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{rangoHeader}</span>
            <span aria-hidden style={{ color: 'var(--ts)', fontSize: '10px' }}>▾</span>
          </div>
        )}
      </div>

      {tabsDisponibles.length > 1 && (
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '22px' }}>
        {tabsDisponibles.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            style={{
              border: tab === item.key ? '1.5px solid var(--ac)' : '1.5px solid transparent', cursor: 'pointer', padding: '11px 18px', borderRadius: '10px',
              fontSize: '13.5px', fontWeight: tab === item.key ? 800 : 600, fontFamily: 'DM Sans, sans-serif',
              color: tab === item.key ? 'var(--ac)' : 'var(--ts)',
              background: tab === item.key ? 'var(--al)' : 'transparent',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
            }}
          >
            <NavIcon name={item.icon} size={18} />
            {item.label}
          </button>
        ))}
      </div>
      )}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {loading || !maestros ? (
        <div style={{ color: 'var(--ts)', fontSize: '14px' }}>Cargando Control Cárnicos...</div>
      ) : (
        <>
          {tab === 'ingresos-salidas' && <IngresosSalidasTab maestros={maestros} />}
          {tab === 'ventas' && <VentasTab />}
          {tab === 'inventarios' && <InventariosTab maestros={maestros} />}
          {tab === 'resumen' && <TablaResumenTab onRangoTexto={setRangoHeader} />}
          {tab === 'historial' && <HistorialTab />}
        </>
      )}
    </div>
  );
}
