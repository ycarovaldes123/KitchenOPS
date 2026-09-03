'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AnchoredPanel from '@/components/forms/AnchoredPanel';
import type { CarnicoProducto } from '@/types/carnicos';

const UM_COLOR: Record<string, string> = {
  KG: '#0D9373',
  GR: '#6366F1',
  UN: '#D97706',
  PQ: '#8B5CF6',
  PR: '#64748B',
};

function normalizeText(text: unknown) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export default function ProductoCarnicoSelector({
  productos,
  selectedId,
  selectedNombre,
  selectedUM,
  onSelect,
  onClear,
}: {
  productos: CarnicoProducto[];
  selectedId: string;
  selectedNombre: string;
  selectedUM: string;
  onSelect: (producto: CarnicoProducto) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeText(query).trim();
    if (!normalizedQuery) return productos.slice(0, 80);
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return productos
      .filter(producto => {
        const haystack = normalizeText([producto.codigo, producto.nombre, producto.tipo].join(' '));
        return terms.every(term => haystack.includes(term));
      })
      .slice(0, 80);
  }, [productos, query]);
  const safeActiveIndex = Math.min(activeIndex, Math.max(filtered.length - 1, 0));

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  function selectProducto(producto: CarnicoProducto) {
    onSelect(producto);
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }

  if (selectedId) {
    const color = UM_COLOR[selectedUM] || '#6B7280';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', flexShrink: 0, background: `${color}18`, color, border: `1px solid ${color}40`, whiteSpace: 'nowrap' }}>
          {selectedUM || 'UM'}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedNombre}</span>
        <button
          type="button"
          onClick={onClear}
          title="Quitar producto"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', fontSize: '16px', lineHeight: 1, flexShrink: 0, padding: '2px 4px', borderRadius: '4px' }}
        >
          x
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        style={{
          width: '100%', textAlign: 'left', background: open ? 'var(--al)' : 'var(--bg)',
          border: `1.5px solid ${open ? 'var(--ac)' : 'var(--bo)'}`, borderRadius: '8px', padding: '6px 10px',
          fontSize: '12px', color: 'var(--ts)', cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: '6px', fontFamily: 'DM Sans, sans-serif',
        }}
      >
        <span>Buscar producto o PP...</span>
        <span style={{ fontSize: '9px', transform: open ? 'rotate(180deg)' : 'none' }}>v</span>
      </button>

      <AnchoredPanel
        open={open}
        anchorRef={triggerRef}
        onClose={() => { setOpen(false); setQuery(''); setActiveIndex(0); }}
        minWidth={320}
      >
        <div style={{ padding: '8px 8px 0' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setQuery(''); return; }
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, Math.max(filtered.length - 1, 0))); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); return; }
              if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (filtered[safeActiveIndex]) selectProducto(filtered[safeActiveIndex]); return; }
              if (e.key === 'Tab' && filtered[safeActiveIndex]) selectProducto(filtered[safeActiveIndex]);
            }}
            placeholder={`Buscar en ${productos.length} productos...`}
            style={{ width: '100%', border: '1.5px solid var(--bo)', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', background: 'var(--bg)', color: 'var(--tx)', outline: 'none', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '4px 0 6px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>
              {productos.length === 0 ? 'Sin productos configurados.' : 'Sin coincidencias'}
            </div>
          ) : filtered.map((producto, index) => {
            const color = UM_COLOR[producto.unidad_medida] || '#6B7280';
            return (
              <button
                key={producto.id}
                type="button"
                tabIndex={-1}
                onClick={() => selectProducto(producto)}
                style={{ width: '100%', textAlign: 'left', background: index === safeActiveIndex ? 'var(--al)' : 'none', border: 'none', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'DM Sans, sans-serif' }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: `${color}18`, color, border: `1px solid ${color}40`, flexShrink: 0, minWidth: '34px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {producto.unidad_medida}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--tx)', flex: 1 }}>{producto.nombre}</span>
                {producto.es_pp && <span style={{ fontSize: '9px', color: 'var(--ac)', fontWeight: 700 }}>PP</span>}
              </button>
            );
          })}
        </div>
      </AnchoredPanel>
    </div>
  );
}
