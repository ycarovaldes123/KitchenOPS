import type { ModoRegla, ReglaValidacion } from '@/lib/alertas/types';
import { NivelChip, TipoLabel } from './AlertasChips';

const MODOS: { modo: ModoRegla; label: string }[] = [
  { modo: 'OBSERVAR', label: 'Observar' },
  { modo: 'ADVERTIR', label: 'Advertir' },
  { modo: 'BLOQUEAR', label: 'Bloquear' },
];

// Modo de cada regla según lib/alertas/catalogo.ts (solo lectura en pantalla).
// Bloquear queda como opción futura, deshabilitada.
export default function ReglasPanel({ reglas }: { reglas: ReglaValidacion[] }) {
  return (
    <>
      <div className="rpp-alert is-warn" style={{ margin: '0 0 16px' }}>
        Las reglas en <b>Advertir</b> muestran un aviso al guardar en Producción, Mermas o Colación: la persona puede corregir o guardar igual.
        Las reglas en <b>Observar</b> (maestros, costos y cárnicos) solo aparecen en esta pantalla. Ninguna bloquea el guardado.
      </div>
      <div className="rpp-card rpp-table-wrap alr-table-scroll">
        <table className="rpp-table alr-table">
          <thead>
            <tr>
              <th scope="col">Regla</th>
              <th scope="col">Descripción</th>
              <th scope="col" className="col-opt">Módulo</th>
              <th scope="col" className="col-opt">Tipo</th>
              <th scope="col">Nivel</th>
              <th scope="col">Modo</th>
              <th scope="col">Activa</th>
            </tr>
          </thead>
          <tbody>
            {reglas.map(r => (
              <tr key={r.codigo}>
                <td><span className="rpp-code">{r.codigo}</span></td>
                <td>
                  <span className="rpp-row-name">{r.nombre}</span>
                  <span className="alr-code" style={{ fontFamily: 'inherit', fontSize: '12px', marginTop: 2 }}>{r.descripcion}</span>
                </td>
                <td className="col-opt">{r.modulo}</td>
                <td className="col-opt"><TipoLabel categoria={r.categoria} /></td>
                <td><NivelChip nivel={r.nivel} /></td>
                <td>
                  <div className="alr-modo" role="group" aria-label={`Modo de ${r.codigo}`}>
                    {MODOS.map(m => (
                      <button
                        key={m.modo}
                        type="button"
                        className={r.modo === m.modo ? 'is-on' : undefined}
                        aria-pressed={r.modo === m.modo}
                        disabled={m.modo !== r.modo}
                        title={m.modo === 'BLOQUEAR' ? 'No disponible por ahora' : m.modo === r.modo ? 'Modo actual' : undefined}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </td>
                <td><span className={`rpp-chip ${r.activa ? 'rpp-chip-ok' : 'rpp-chip-off'}`}>{r.activa ? 'Sí' : 'No'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
