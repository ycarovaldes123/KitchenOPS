'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AnchoredPanel from '@/components/forms/AnchoredPanel';
import { formatCLP } from '@/lib/calculos';

interface ProductoMaestro {
  codigo: string;
  nombre: string;
  unidad_medida: string | null;
  costo_promedio?: number | null;
}

interface Props {
  value: string;
  onChange: (codigo: string) => void;
  productos: ProductoMaestro[];
  placeholder?: string;
  allowManual?: boolean;
  disabled?: boolean;
}

const MAX_RESULTADOS = 60;

const UM_COLOR: Record<string, string> = {
  KG: '#E8590C', GR: '#E8590C', LT: '#1C7ED6', CC: '#1C7ED6', UN: '#7048E8', UND: '#7048E8', PR: '#0D9373',
};

function normalizeText(text: unknown) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function productLabel(producto: ProductoMaestro) {
  const unidad = producto.unidad_medida ? ` (${producto.unidad_medida})` : '';
  return `${producto.codigo} - ${producto.nombre}${unidad}`;
}

// Puntaje de relevancia: código exacto > código que empieza > nombre que empieza > palabra que empieza > contiene.
function puntaje(producto: ProductoMaestro, query: string, terms: string[]): number {
  const codigo = producto.codigo.toLowerCase();
  const nombre = normalizeText(producto.nombre);
  if (codigo === query) return 0;
  if (codigo.startsWith(query)) return 1;
  if (nombre.startsWith(query)) return 2;
  const palabras = nombre.split(/[^a-z0-9]+/);
  if (terms.every(t => palabras.some(p => p.startsWith(t)))) return 3;
  return 4;
}

const FORMATO_DECIMAL = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 });

function formatCosto(costo: number) {
  return costo >= 100 ? formatCLP(Math.round(costo)) : `$${FORMATO_DECIMAL.format(costo)}`;
}

export default function ProductSearchSelect({
  value,
  onChange,
  productos,
  placeholder = 'Buscar producto...',
  allowManual = true,
  disabled = false,
}: Props) {
  const selected = value ? productos.find(producto => producto.codigo === value) : undefined;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const { results, total } = useMemo(() => {
    // Cerrado no se muestra nada: no filtrar ni ordenar (en una receta hay un buscador por ingrediente).
    if (!open) return { results: [], total: 0 };
    const normalizedQuery = normalizeText(query).trim();
    if (!normalizedQuery) return { results: productos.slice(0, MAX_RESULTADOS), total: productos.length };

    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    const matches = productos
      .filter(producto => {
        const haystack = normalizeText(`${producto.codigo} ${producto.nombre} ${producto.unidad_medida ?? ''}`);
        return terms.every(term => haystack.includes(term));
      })
      .map(producto => ({ producto, score: puntaje(producto, normalizedQuery, terms) }))
      .sort((a, b) => a.score - b.score || a.producto.nombre.localeCompare(b.producto.nombre, 'es'));
    return { results: matches.slice(0, MAX_RESULTADOS).map(m => m.producto), total: matches.length };
  }, [productos, query, open]);

  // Mantener visible la opción activa al navegar con flechas
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function selectProduct(codigo: string) {
    onChange(codigo);
    close();
  }

  function clearSelection() {
    onChange('');
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  }

  const displayValue = open ? query : selected ? productLabel(selected) : '';

  return (
    <div ref={rootRef} style={{ position: 'relative', minWidth: 0 }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        <input
          ref={inputRef}
          value={displayValue}
          disabled={disabled}
          placeholder={selected ? productLabel(selected) : placeholder}
          title={selected ? productLabel(selected) : undefined}
          onFocus={() => { setActiveIndex(0); setOpen(true); }}
          onChange={event => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
              return;
            }
            if (event.key === 'Tab') {
              close();
              return;
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex(index => Math.min(index + 1, Math.max(results.length - 1, 0)));
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex(index => Math.max(index - 1, 0));
              return;
            }
            if (event.key === 'Enter') {
              if (!open) return;
              event.preventDefault();
              if (results[activeIndex]) selectProduct(results[activeIndex].codigo);
            }
          }}
          style={{
            width: '100%',
            border: `1px solid ${open ? 'var(--ac)' : 'var(--bo)'}`,
            borderRadius: '6px',
            padding: '7px 8px',
            fontSize: '12px',
            background: disabled ? 'var(--al)' : 'var(--bg)',
            color: 'var(--tx)',
            minWidth: 0,
            outline: 'none',
            textOverflow: 'ellipsis',
          }}
        />
        {(value || query) && !disabled && (
          <button
            type="button"
            onClick={clearSelection}
            title="Limpiar producto"
            style={{
              border: '1px solid var(--bo)',
              background: 'var(--sf)',
              color: 'var(--ts)',
              borderRadius: '6px',
              width: '30px',
              flexShrink: 0,
              cursor: 'pointer',
              fontSize: '16px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Portal a <body>: la lista no queda recortada por tablas con scroll ni por el modal */}
      {open && !disabled && (
      <AnchoredPanel open anchorRef={rootRef} onClose={close} minWidth={380}>
        <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--bo)', fontSize: '11px', color: 'var(--ts)', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
          <span>
            {query.trim()
              ? `${total} resultado${total !== 1 ? 's' : ''}${total > results.length ? ` · mostrando ${results.length}` : ''}`
              : `${productos.length} productos · escribe nombre o código`}
          </span>
          <span style={{ whiteSpace: 'nowrap' }}>↑↓ Enter</span>
        </div>
        <div ref={listRef} style={{ maxHeight: '260px', overflowY: 'auto', padding: '4px 0' }}>
          {allowManual && (
            <button
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => selectProduct('')}
              style={{
                width: '100%', border: 'none', borderBottom: '1px solid var(--bo)',
                background: value ? 'var(--sf)' : 'var(--al)', color: 'var(--ac)',
                padding: '8px 12px', textAlign: 'left', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
              }}
            >
              Manual
            </button>
          )}

          {results.length ? results.map((producto, index) => {
            const um = (producto.unidad_medida || '—').toUpperCase();
            const color = UM_COLOR[um] ?? '#6B7280';
            const costo = Number(producto.costo_promedio) || 0;
            const activo = index === activeIndex;
            return (
              <button
                key={producto.codigo}
                data-idx={index}
                type="button"
                onMouseDown={event => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectProduct(producto.codigo)}
                style={{
                  width: '100%', border: 'none', textAlign: 'left', cursor: 'pointer',
                  background: activo ? 'var(--al)' : producto.codigo === value ? 'var(--bg)' : 'none',
                  padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '8px',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: `${color}18`, color, border: `1px solid ${color}40`, flexShrink: 0, minWidth: '30px', textAlign: 'center' }}>
                  {um}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{producto.nombre}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: 'var(--ts)', fontFamily: "'Space Grotesk', sans-serif" }}>{producto.codigo}</span>
                </span>
                <span style={{ fontSize: '11px', color: costo > 0 ? 'var(--ts)' : '#B45309', fontWeight: costo > 0 ? 400 : 600, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {costo > 0 ? `${formatCosto(costo)}/${um.toLowerCase()}` : 'Sin costo'}
                </span>
              </button>
            );
          }) : (
            <div style={{ padding: '18px', textAlign: 'center', color: 'var(--ts)', fontSize: '12px' }}>
              Sin coincidencias para “{query.trim()}”
            </div>
          )}
        </div>
      </AnchoredPanel>
      )}
    </div>
  );
}
