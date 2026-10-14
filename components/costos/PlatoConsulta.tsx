'use client';

import { formatCLP, formatPct } from '@/lib/calculos';
import { formatCantidad } from '@/lib/costo-receta-pp';
import NavIcon from '@/components/layout/NavIcon';
import Semaforo, { SEMAFORO } from './Semaforo';
import { NOMBRE_CARTA, PlatoFoto, esIngredientePP, type Plato } from './shared';

interface Props {
  plato:   Plato;
  onEdit?: () => void;
  onCopy?: () => void;
  /** Solo admin: alterna Activo/Inactivo sin entrar a Editar. */
  onToggleActivo?: () => void;
  cambiandoEstado?: boolean;
}

// Modo consulta del panel lateral: es lo primero que se ve al elegir un plato; editar es una accion explicita.
export default function PlatoConsulta({ plato, onEdit, onCopy, onToggleActivo, cambiandoEstado = false }: Props) {
  const ings = plato.carta_ingredientes ?? [];
  const sem = SEMAFORO[plato.semaforo];

  return (
    <div className="ck-side__scroll">
      <div className="ck-side__hero">
        <PlatoFoto src={plato.foto_url} alt={plato.nombre} iconSize={48} />
      </div>

      <div className="ck-side__body">
        <p className="ck-eyebrow">Detalle del plato · {NOMBRE_CARTA[plato.tipo_carta ?? 'ANTIGUA']}</p>
        <h2 className="ck-side__title">{plato.nombre}</h2>
        <p className="ck-side__meta">
          {plato.categoria}
          {plato.cod_softland && <> · Código <span className="ck-code">{plato.cod_softland}</span></>}
          {plato.codigo_toteat && <> · Toteat <span className="ck-code">{plato.codigo_toteat}</span></>}
        </p>

        <div className="ck-side__actions">
          {onEdit && (
            <button type="button" className="ck-btn ck-btn--primary" onClick={onEdit}>
              <NavIcon name="pencil" size={15} /> Editar
            </button>
          )}
          {onCopy && (
            <button type="button" className="ck-btn ck-btn--copy" onClick={onCopy}>
              <NavIcon name="copy" size={15} /> Copiar
            </button>
          )}
          {onToggleActivo ? (
            <button
              type="button"
              className={`ck-btn ck-btn--estado ${plato.activo ? 'is-activo' : 'is-inactivo'}`}
              onClick={onToggleActivo}
              disabled={cambiandoEstado}
              aria-pressed={plato.activo}
              title={plato.activo ? 'Plato habilitado: clic para desactivarlo' : 'Plato desactivado: clic para reactivarlo'}
            >
              <span className="ck-btn__dot" />
              {cambiandoEstado ? 'Guardando...' : plato.activo ? 'Activo' : 'Inactivo'}
            </button>
          ) : !plato.activo && (
            <span className="ck-tag ck-tag--inactivo">Inactivo</span>
          )}
          <span style={{ flex: 1 }} />
          <Semaforo color={plato.semaforo} margen={plato.margen_pct} />
        </div>

        <div className="ck-costs ck-costs--side">
          <div className="ck-cost">
            <p className="ck-cost__label">Precio carta</p>
            <p className="ck-cost__value">{formatCLP(plato.precio_carta)}</p>
            <p className="ck-cost__sub">con IVA</p>
          </div>
          <div className="ck-cost">
            <p className="ck-cost__label">Costo bruto</p>
            <p className="ck-cost__value">{plato.semaforo === 'gray' && !plato.costo_neto ? '—' : formatCLP(plato.costo_bruto)}</p>
            <p className="ck-cost__sub">neto × 1,19</p>
          </div>
          <div className="ck-cost" style={{ background: sem.bg, borderColor: 'transparent' }}>
            <p className="ck-cost__label" style={{ color: sem.color }}>Margen</p>
            <p className="ck-cost__value" style={{ color: sem.color }}>{formatPct(plato.margen_pct)}</p>
            <p className="ck-cost__sub" style={{ color: sem.color }}>{sem.rango}</p>
          </div>
        </div>

        <p className="ck-block__title" style={{ marginTop: '18px' }}><span>Ingredientes ({ings.length})</span></p>
        {ings.length === 0 ? (
          <p style={{ color: 'var(--ts)', fontSize: '13px', margin: 0 }}>Sin ingredientes cargados.</p>
        ) : (
          <div style={{ border: '1px solid var(--bo)', borderRadius: '10px', overflowX: 'auto' }}>
            <table className="ck-table ck-table--compact">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Ingrediente</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Costo unit.</th>
                  <th className="num">Costo total</th>
                </tr>
              </thead>
              <tbody>
                {ings.map(ing => (
                  <tr key={ing.id}>
                    <td><span className="ck-code">{ing.codigo_producto ?? '—'}</span></td>
                    <td>
                      {ing.nombre ?? '—'}
                      {esIngredientePP(ing) && <span className="ck-tag ck-tag--pp" style={{ marginLeft: '6px' }}>PP</span>}
                    </td>
                    <td className="num muted">{formatCantidad(ing.cantidad)} {ing.unidad_medida ?? ''}</td>
                    <td className="num muted">{ing.precio_unitario != null ? formatCLP(ing.precio_unitario) : '—'}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{ing.costo_total != null ? formatCLP(ing.costo_total) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ borderTop: '1px solid var(--bo)', fontSize: '11px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Costo neto total
                  </td>
                  <td className="num" style={{ borderTop: '1px solid var(--bo)', fontSize: '14px', fontWeight: 700, fontFamily: 'Syne, sans-serif' }}>
                    {formatCLP(plato.costo_neto)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
