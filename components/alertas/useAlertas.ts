'use client';

import { useCallback, useEffect, useState } from 'react';
import { borrarRevisiones, fuenteAnalisis, type FuenteAlertas } from '@/lib/alertas/fuente';
import type { Alerta, DatosModulo, EstadoRevision } from '@/lib/alertas/types';

// Capa entre la UI y la fuente de datos (análisis real vía /api/alertas)
export function useAlertas(fuente: FuenteAlertas = fuenteAnalisis) {
  const [datos, setDatos] = useState<DatosModulo | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [pedido, setPedido] = useState<{ n: number; refrescar: boolean }>({ n: 0, refrescar: false });

  useEffect(() => {
    let vivo = true;
    fuente.cargar(pedido.refrescar)
      .then(d => { if (vivo) { setDatos(d); setError(''); } })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'Error cargando alertas'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [fuente, pedido]);

  const actualizar = useCallback(() => {
    setCargando(true);
    setPedido(p => ({ n: p.n + 1, refrescar: true }));
  }, []);

  const cambiarEstado = useCallback(async (alerta: Alerta, estado: EstadoRevision, nota?: string) => {
    const actualizada = await fuente.cambiarEstado(alerta, estado, 'Administrador', nota);
    setDatos(d => d && { ...d, alertas: d.alertas.map(a => a.id === alerta.id ? actualizada : a) });
  }, [fuente]);

  // Re-análisis silencioso (tras corregir un movimiento): no muestra "Analizando…" ni bloquea la pantalla
  const reanalizarEnSegundoPlano = useCallback(() => {
    fuente.cargar(true).then(d => setDatos(d)).catch(() => { /* se mantiene lo que hay; el botón Actualizar sigue disponible */ });
  }, [fuente]);

  const reiniciarRevisiones = useCallback(() => {
    borrarRevisiones();
    setCargando(true);
    setPedido(p => ({ n: p.n + 1, refrescar: false }));
  }, []);

  return { datos, error, cargando, actualizar, reanalizarEnSegundoPlano, cambiarEstado, reiniciarRevisiones };
}
