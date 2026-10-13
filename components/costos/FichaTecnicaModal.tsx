'use client';

import { useEffect } from 'react';
import { formatCLP, formatPct } from '@/lib/calculos';
import { formatCantidad } from '@/lib/costo-receta-pp';
import NavIcon from '@/components/layout/NavIcon';
import Semaforo, { SEMAFORO } from './Semaforo';
import { NOMBRE_CARTA, PlatoFoto, esIngredientePP, type Plato } from './shared';

interface Props {
  plato:    Plato;
  onClose:  () => void;
  onEdit?:  () => void;
  onCopy?:  () => void;
}

// Vista de consulta del plato: siempre se abre primero esta ficha; editar es una accion explicita.
export default function FichaTecnicaModal({ plato, onClose, onEdit, onCopy }: Props) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const ings = plato.carta_ingredientes ?? [];
  const sem = SEMAFORO[plato.semaforo];

  return (
    <div className="ck-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ck-modal" style={{ maxWidth: '680px' }} role="dialog" aria-modal="true" aria-label={plato.nombre}>
        <div className="ck-modal__scroll">
          <div className="ck-modal__hero">
            <PlatoFoto src={plato.foto_url} alt={plato.nombre} iconSize={54} />
            <button type="button" className="ck-close" onClick={onClose} aria-label="Cerrar">
              <NavIcon name="x" size={18} />
            </button>
          </div>

          <div className="ck-modal__head">
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <p className="ck-eyebrow">{NOMBRE_CARTA[plato.tipo_carta ?? 'ANTIGUA']} · {plato.categoria}</p>
              <h2>{plato.nombre}</h2>
              {(plato.cod_softland || plato.codigo_toteat) && (
                <p style={{ margin: '5px 0 0', fontSize: '12px', color: 'var(--ts)' }}>
                  {plato.cod_softland && <>Código <span className="ck-code">{plato.cod_softland}</span></>}
                  {plato.cod_softland && plato.codigo_toteat && ' · '}
                  {plato.codigo_toteat && <>Toteat <span className="ck-code">{plato.codigo_toteat}</span></>}
                </p>
              )}
            </div>
            <div className="ck-modal__actions">
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
              <Semaforo color={plato.semaforo} margen={plato.margen_pct} />
            </div>
          </div>

          <div className="ck-costs">
            <div className="ck-cost">
              <p className="ck-cost__label">Precio carta</p>
              <p className="ck-cost__value">{formatCLP(plato.precio_carta)}</p>
              <p className="ck-cost__sub">con IVA</p>
            </div>
            <div className="ck-cost">
              <p className="ck-cost__label">Costo bruto</p>
              <p className="ck-cost__value">{plato.semaforo === 'gray' && !plato.costo_neto ? '—' : formatCLP(plato.costo_bruto)}</p>
              <p className="ck-cost__sub">costo neto × 1,19</p>
            </div>
            <div className="ck-cost" style={{ background: sem.bg, borderColor: 'transparent' }}>
              <p className="ck-cost__label" style={{ color: sem.color }}>Margen</p>
              <p className="ck-cost__value" style={{ color: sem.color }}>
                {formatPct(plato.margen_pct)}
              </p>
              <p className="ck-cost__sub" style={{ color: sem.color }}>{sem.rango}</p>
            </div>
          </div>

          <div className="ck-block">
            <p className="ck-block__title"><span>Ingredientes ({ings.length})</span></p>
            {ings.length === 0 ? (
              <p style={{ color: 'var(--ts)', fontSize: '13px', margin: 0 }}>Sin ingredientes cargados.</p>
            ) : (
              <div style={{ border: '1px solid var(--bo)', borderRadius: '10px', overflowX: 'auto' }}>
                <table className="ck-table">
                  <thead>
                    <tr>
                      <th>Ingrediente</th>
                      <th className="num">Cantidad</th>
                      <th className="num">Costo unitario</th>
                      <th className="num">Costo total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ings.map(ing => (
                      <tr key={ing.id}>
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
                      <td colSpan={3} style={{ borderTop: '1px solid var(--bo)', fontSize: '11.5px', fontWeight: 700, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Costo neto total
                      </td>
                      <td className="num" style={{ borderTop: '1px solid var(--bo)', fontSize: '15px', fontWeight: 700, fontFamily: 'Syne, sans-serif' }}>
                        {formatCLP(plato.costo_neto)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
