import { CATEGORIA_LABEL } from '@/lib/alertas/catalogo';
import { contarPorEstado, fmtPct, metricasPorUsuario } from '@/lib/alertas/metricas';
import type { Alerta, CategoriaAlerta, VolumenUsuario } from '@/lib/alertas/types';

interface Props {
  alertas: Alerta[];
  volumen: VolumenUsuario[];
  onReiniciar: () => void;
}

// Dashboard del piloto: todo se calcula desde las alertas (sin valores fijos).
export default function MetricasPanel({ alertas, volumen, onReiniciar }: Props) {
  const e = contarPorEstado(alertas);
  const porUsuario = metricasPorUsuario(alertas, volumen);

  const porCategoria = new Map<CategoriaAlerta, number>();
  for (const a of alertas) porCategoria.set(a.categoria, (porCategoria.get(a.categoria) ?? 0) + 1);
  const categorias = [...porCategoria].sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...categorias.map(c => c[1]));

  const kpis = [
    { label: 'Detectadas', valor: alertas.length, main: true },
    { label: 'Pendientes', valor: e.PENDIENTE },
    { label: 'Error confirmado', valor: e.ERROR_CONFIRMADO + e.CORREGIDO },
    { label: 'Dato correcto', valor: e.DATO_CORRECTO },
  ];

  return (
    <>
      <div className="alr-kpis">
        {kpis.map(k => (
          <div key={k.label} className={`alr-kpi is-static${k.main ? ' is-main' : ''}`}><b>{k.valor}</b><span>{k.label}</span></div>
        ))}
      </div>

      <div className="alr-grid-2" style={{ marginBottom: 16 }}>
        <section className="rpp-card alr-panel">
          <h2>Distribución por tipo</h2>
          <p>Alertas desde el 01/09/2026 (inicio del módulo).</p>
          {categorias.map(([c, n]) => (
            <div key={c} className="alr-bar">
              <span>{CATEGORIA_LABEL[c]}</span>
              <div className="alr-bar-track" aria-hidden="true"><div className="alr-bar-fill" style={{ width: `${(n / maxCat) * 100}%` }} /></div>
              <b>{n}</b>
            </div>
          ))}
        </section>

        <section className="rpp-card alr-panel">
          <h2>Alertas por usuario</h2>
          <p>Desde el 01/09/2026. Dato operacional con su volumen de registros; no es una evaluación de desempeño.</p>
          <table className="rpp-table">
            <thead><tr><th scope="col">Usuario</th><th scope="col" className="num">Alertas</th><th scope="col" className="num">Movimientos</th><th scope="col" className="num">Tasa</th></tr></thead>
            <tbody>
              {porUsuario.map(u => (
                <tr key={u.usuario}>
                  <td>{u.usuario}</td>
                  <td className="num rpp-num">{u.alertas}</td>
                  <td className="num rpp-num">{u.movimientos ?? '—'}</td>
                  <td className="num rpp-num">{fmtPct(u.tasa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <p className="alr-muted alr-reset">
        Las revisiones del piloto se guardan solo en este navegador.
        <button type="button" className="rpp-btn rpp-btn-sm" onClick={() => { if (window.confirm('¿Borrar todas las revisiones del piloto? Las alertas vuelven a Pendiente.')) onReiniciar(); }}>
          Borrar revisiones
        </button>
      </p>
    </>
  );
}
