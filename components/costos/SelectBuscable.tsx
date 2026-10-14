'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import AnchoredPanel from '@/components/forms/AnchoredPanel';
import NavIcon from '@/components/layout/NavIcon';

export interface OpcionSelect {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  opciones: OpcionSelect[];
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
}

function normalizar(text: unknown) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Selector con busqueda para listas cortas (Categoria, Tipo de carta).
 * Clic o foco abren la lista; escribir filtra (sin tildes ni mayusculas); ↑↓ recorren;
 * Enter elige; Tab elige lo resaltado si se escribio algo y pasa al campo siguiente; Esc cierra.
 * Solo permite valores de la lista: lo escrito nunca se guarda como valor.
 */
export default function SelectBuscable({ value, onChange, opciones, ariaLabel, placeholder = 'Seleccionar...', disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = `sb-${useId().replace(/:/g, "")}`;

  const seleccionada = opciones.find(o => o.value === value);

  const filtradas = useMemo(() => {
    const q = normalizar(query);
    if (!q) return opciones;
    return opciones.filter(o => normalizar(o.label).includes(q) || normalizar(o.value).includes(q));
  }, [opciones, query]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function abrir() {
    if (disabled || open) return;
    setQuery('');
    setActiveIndex(Math.max(0, opciones.findIndex(o => o.value === value)));
    setOpen(true);
  }

  function cerrar() {
    setOpen(false);
    setQuery('');
  }

  function elegir(opcion: OpcionSelect | undefined) {
    if (opcion) onChange(opcion.value);
    cerrar();
  }

  return (
    <div ref={rootRef} className={`ck-combo${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`} onMouseDown={e => {
      // Clic en cualquier parte del campo (incluida la flecha) abre/cierra la lista.
      if (disabled) return;
      if (e.target !== inputRef.current) e.preventDefault();
      if (open && e.target !== inputRef.current) cerrar();
      else { abrir(); inputRef.current?.focus(); }
    }}>
      <input
        ref={inputRef}
        className="ck-combo__input"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtradas[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        disabled={disabled}
        value={open ? query : seleccionada?.label ?? value}
        placeholder={open ? (seleccionada?.label ?? placeholder) : placeholder}
        onFocus={abrir}
        onBlur={() => { if (open) cerrar(); }}
        onChange={e => { setQuery(e.target.value); setActiveIndex(0); if (!open) setOpen(true); }}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            if (open) { e.preventDefault(); e.stopPropagation(); cerrar(); }
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) { abrir(); return; }
            setActiveIndex(i => Math.min(i + 1, Math.max(filtradas.length - 1, 0)));
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(i => Math.max(i - 1, 0));
            return;
          }
          if (e.key === 'Enter') {
            if (!open) return;
            e.preventDefault();
            elegir(filtradas[activeIndex]);
            return;
          }
          if (e.key === 'Tab' && open) {
            // Tab confirma solo si se escribio algo (no cambia el valor al pasar de largo por el campo).
            if (query.trim() && filtradas[activeIndex]) elegir(filtradas[activeIndex]);
            else cerrar();
          }
        }}
      />
      <span className="ck-combo__arrow" aria-hidden="true"><NavIcon name="chevron-down" size={16} /></span>

      {open && (
        <AnchoredPanel open anchorRef={rootRef} onClose={cerrar} minWidth={220}>
          {/* El portal propaga eventos React al campo: se cortan aqui para que elegir no cierre antes del clic. */}
          <div ref={listRef} id={listId} role="listbox" className="ck-combo__list" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}>
            {filtradas.length ? filtradas.map((o, index) => (
              <div
                key={o.value}
                id={`${listId}-${index}`}
                data-idx={index}
                role="option"
                aria-selected={o.value === value}
                className={`ck-combo__opt${index === activeIndex ? ' is-active' : ''}${o.value === value ? ' is-selected' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => elegir(o)}
              >
                <span>{o.label}</span>
                {o.value === value && <NavIcon name="check" size={14} />}
              </div>
            )) : (
              <div className="ck-combo__empty">Sin coincidencias para “{query.trim()}”</div>
            )}
          </div>
        </AnchoredPanel>
      )}
    </div>
  );
}
