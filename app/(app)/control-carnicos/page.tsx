'use client';

import { useEffect, useState } from 'react';
import type { CarnicoProducto } from '@/types/carnicos';
import type { Responsable } from '@/types/database';
import IngresosSalidasTab from './tabs/IngresosSalidasTab';
import VentasTab from './tabs/VentasTab';
import InventariosTab from './tabs/InventariosTab';
import TablaResumenTab from './tabs/TablaResumenTab';
import HistorialTab from './tabs/HistorialTab';

type Tab = 'ingresos-salidas' | 'ventas' | 'inventarios' | 'resumen' | 'historial';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ingresos-salidas', label: 'Ingresos / Salidas' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'inventarios', label: 'Inventarios' },
  { key: 'resumen', label: 'Tabla Resumen' },
  { key: 'historial', label: 'Historial' },
];

export interface Maestros {
  productos: CarnicoProducto[];
  responsables: Responsable[];
}

export default function ControlCarnicosPage() {
  const [tab, setTab] = useState<Tab>('ingresos-salidas');
  const [maestros, setMaestros] = useState<Maestros | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    <div className="page" style={{ paddingBottom: '48px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '22px', fontWeight: 800, margin: 0 }}>Control Carnicos</h1>
        <p style={{ color: 'var(--ts)', margin: '3px 0 0', fontSize: '13px' }}>
          Ingresos, salidas, ventas Toteat, inventarios y cuadre diario de productos carnicos.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px', borderBottom: '1px solid var(--bo)' }}>
        {TABS.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            style={{
              border: 'none', background: 'none', cursor: 'pointer', padding: '10px 14px',
              fontSize: '13px', fontWeight: 800, fontFamily: 'DM Sans, sans-serif',
              color: tab === item.key ? 'var(--ac)' : 'var(--ts)',
              borderBottom: tab === item.key ? '2.5px solid var(--ac)' : '2.5px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {loading || !maestros ? (
        <div style={{ color: 'var(--ts)', fontSize: '14px' }}>Cargando Control Carnicos...</div>
      ) : (
        <>
          {tab === 'ingresos-salidas' && <IngresosSalidasTab maestros={maestros} />}
          {tab === 'ventas' && <VentasTab />}
          {tab === 'inventarios' && <InventariosTab maestros={maestros} />}
          {tab === 'resumen' && <TablaResumenTab />}
          {tab === 'historial' && <HistorialTab />}
        </>
      )}
    </div>
  );
}
