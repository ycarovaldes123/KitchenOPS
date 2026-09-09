'use client';

import Link from 'next/link';
import NavIcon from '@/components/layout/NavIcon';
import type { NavItem } from '@/lib/roles';

interface Props {
  items: NavItem[];
  nombre: string;
  rolLabel: string;
}

// Pantalla Inicio: grilla de modulos seleccionables con mouse o pantalla tactil.
// - Cada tarjeta es un <Link> completo (area tactil grande, un solo toque entra).
// - No depende de hover: el realce llega por :focus-visible y el feedback por :active.
export default function InicioGrid({ items, nombre, rolLabel }: Props) {
  return (
    <div style={{ padding: 'clamp(20px, 4vw, 40px)', maxWidth: '1140px', margin: '0 auto' }}>
      <style>{`
        .inicio-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 16px;
        }
        .inicio-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 144px;
          padding: 20px;
          border-radius: 14px;
          background: var(--sf);
          border: 1px solid var(--bo);
          color: var(--tx);
          text-decoration: none;
          -webkit-tap-highlight-color: transparent;
          transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
        }
        .inicio-card:hover { border-color: var(--ac); box-shadow: 0 6px 20px rgba(20,16,10,0.08); }
        .inicio-card:focus-visible { outline: 3px solid var(--ac); outline-offset: 2px; }
        .inicio-card:active { transform: scale(0.97); box-shadow: none; }
        .inicio-card__icon {
          width: 44px; height: 44px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          background: color-mix(in srgb, var(--ac) 14%, transparent);
          color: var(--ac);
        }
        @media (hover: none) {
          .inicio-card { min-height: 128px; }
          .inicio-card:active { background: color-mix(in srgb, var(--ac) 8%, var(--sf)); }
        }
      `}</style>

      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(22px, 3.5vw, 30px)', fontWeight: 800, color: 'var(--tx)', margin: 0 }}>
          Hola, {nombre}
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--ts)', margin: '4px 0 0' }}>
          {rolLabel} · Elige un módulo para comenzar
        </p>
      </header>

      <nav className="inicio-grid" aria-label="Módulos disponibles">
        {items.map(item => (
          <Link key={item.href} href={item.href} className="inicio-card">
            <span className="inicio-card__icon" aria-hidden>
              <NavIcon name={item.icon} size={24} />
            </span>
            <span style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1.2 }}>{item.label}</span>
            {item.descripcion && (
              <span style={{ fontSize: '12.5px', color: 'var(--ts)', lineHeight: 1.4 }}>{item.descripcion}</span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
