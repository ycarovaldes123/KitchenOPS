'use client';

import { createContext, useContext } from 'react';
import type { RolType } from '@/lib/roles';
import { PERMISOS, type Modulo, type PermisoModulo } from '@/lib/permissions';

interface RolCtx {
  rol:    RolType;
  puede:  (modulo: Modulo, accion: keyof PermisoModulo) => boolean;
}

const Ctx = createContext<RolCtx | null>(null);

export function RolProvider({ rol, children }: { rol: RolType; children: React.ReactNode }) {
  const puede = (modulo: Modulo, accion: keyof PermisoModulo) =>
    !!PERMISOS[rol][modulo][accion];

  return <Ctx.Provider value={{ rol, puede }}>{children}</Ctx.Provider>;
}

export function useRol(): RolCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRol() debe usarse dentro de RolProvider');
  return ctx;
}
