'use client';

import Link from 'next/link';
import NavIcon from '@/components/layout/NavIcon';
import type { NavItem } from '@/lib/roles';
import '@/components/layout/navegacion.css';

interface Props {
  items: NavItem[];
  nombre: string;
  rolLabel: string;
}

// Pantalla Inicio: grilla de modulos seleccionables con mouse o pantalla tactil.
// - Cada tarjeta es un <Link> completo (area tactil grande, un solo toque entra).
// - Icono = el mismo del sidebar (NAV_ITEMS en lib/roles.ts). Estilos en navegacion.css.
// - Hover solo en dispositivos con mouse; en tactil el feedback llega por :active y el foco por :focus-visible.
export default function InicioGrid({ items, nombre, rolLabel }: Props) {
  return (
    <div style={{ padding: 'clamp(20px, 4vw, 40px)', maxWidth: '1140px', margin: '0 auto' }}>
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
            <span className="inicio-card__title">{item.label}</span>
            {item.descripcion && <span className="inicio-card__desc">{item.descripcion}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
