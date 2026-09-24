import NavIcon from '@/components/layout/NavIcon';
import { CATEGORIA_ICONO, CATEGORIA_LABEL } from '@/lib/alertas/catalogo';
import type { CategoriaAlerta, EstadoRevision, NivelAlerta } from '@/lib/alertas/types';

export const NIVEL_LABEL: Record<NivelAlerta, string> = { ALTA: 'Alta atención', REVISAR: 'Revisar', INFO: 'Informativa' };
const NIVEL_ICONO: Record<NivelAlerta, string> = { ALTA: 'circle-alert', REVISAR: 'triangle-alert', INFO: 'info' };

export const ESTADO_LABEL: Record<EstadoRevision, string> = {
  PENDIENTE: 'Pendiente',
  ERROR_CONFIRMADO: 'Error confirmado',
  DATO_CORRECTO: 'Dato correcto',
  CORREGIDO: 'Corregido',
};
// Clases de chip de recetas-pp.css
const ESTADO_CHIP: Record<EstadoRevision, string> = {
  PENDIENTE: 'rpp-chip-warn',
  ERROR_CONFIRMADO: 'rpp-chip-error',
  DATO_CORRECTO: 'rpp-chip-off',
  CORREGIDO: 'rpp-chip-ok',
};

export function NivelChip({ nivel }: { nivel: NivelAlerta }) {
  return (
    <span className={`alr-nivel is-${nivel}`}>
      <NavIcon name={NIVEL_ICONO[nivel]} size={13} /> {NIVEL_LABEL[nivel]}
    </span>
  );
}

export function EstadoChip({ estado }: { estado: EstadoRevision }) {
  return <span className={`rpp-chip ${ESTADO_CHIP[estado]}`}>{ESTADO_LABEL[estado]}</span>;
}

export function TipoLabel({ categoria }: { categoria: CategoriaAlerta }) {
  return (
    <span className="alr-tipo">
      <NavIcon name={CATEGORIA_ICONO[categoria]} size={15} /> {CATEGORIA_LABEL[categoria]}
    </span>
  );
}
