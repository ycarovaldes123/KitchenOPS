'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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

function normalizeText(text: unknown) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function productLabel(producto: ProductoMaestro) {
  const unidad = producto.unidad_medida ? ` (${producto.unidad_medida})` : '';
  return `${producto.codigo} - ${producto.nombre}${unidad}`;
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

  const results = useMemo(() => {
    const normalizedQuery = normalizeText(query).trim();
    if (!normalizedQuery) return productos.slice(0, 50);

    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return productos
      .filter(producto => {
        const haystack = normalizeText([
          producto.codigo,
          producto.nombre,
          producto.unidad_medida,
          productLabel(producto),
        ].join(' '));
        return terms.every(term => haystack.includes(term));
      })
      .slice(0, 50);
  }, [productos, query]);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function selectProduct(codigo: string) {
    onChange(codigo);
    setOpen(false);
    setQuery('');
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
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={event => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setOpen(false);
              setQuery('');
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
            border: '1px solid var(--bo)',
            borderRadius: '6px',
            padding: '7px 8px',
            fontSize: '12px',
            background: disabled ? 'var(--al)' : 'var(--bg)',
            color: 'var(--tx)',
            minWidth: 0,
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
              cursor: 'pointer',
              fontSize: '16px',
              lineHeight: 1,
            }}
          >
            x
          </button>
        )}
      </div>

      {open && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 800,
            maxHeight: '260px',
            overflowY: 'auto',
            background: 'var(--sf)',
            border: '1px solid var(--bo)',
            borderRadius: '8px',
            boxShadow: '0 14px 32px rgba(0,0,0,0.18)',
          }}
        >
          {allowManual && (
            <button
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => selectProduct('')}
              style={{
                width: '100%',
                border: 'none',
                borderBottom: '1px solid var(--bo)',
                background: value ? 'var(--sf)' : 'var(--al)',
                color: 'var(--ac)',
                padding: '8px 10px',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              Manual
            </button>
          )}

          {results.length ? results.map((producto, index) => (
            <button
              key={producto.codigo}
              type="button"
              onMouseDown={event => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectProduct(producto.codigo)}
              style={{
                width: '100%',
                border: 'none',
                borderBottom: index === results.length - 1 ? 'none' : '1px solid var(--bo)',
                background: index === activeIndex ? 'var(--al)' : 'var(--sf)',
                color: 'var(--tx)',
                padding: '8px 10px',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              <span style={{ display: 'block', fontWeight: 700 }}>{producto.codigo} - {producto.nombre}</span>
              <span style={{ display: 'block', color: 'var(--ts)', fontSize: '11px', marginTop: '2px' }}>
                {producto.unidad_medida || 'Sin unidad'}
              </span>
            </button>
          )) : (
            <div style={{ padding: '10px', color: 'var(--ts)', fontSize: '12px' }}>
              Sin coincidencias
            </div>
          )}
        </div>
      )}
    </div>
  );
}
