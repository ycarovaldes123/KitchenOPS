import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';
import { esRol } from '@/lib/roles';
import { guardarCuenta, mapaCuentas, validarPassword } from '@/lib/cuentas-acceso';
import {
  AREAS, NIVELES, TABLAS_ACTIVIDAD, aPersona, columnaFaltante, inicialesDe, normalizarPermisos, rolDesdeArea,
  type Area, type NivelAcceso, type ResponsableRow,
} from '@/lib/personal';
import { HEX_NOMBRE_VALIDOS } from '@/lib/colores-responsable';


const PALETA = ['#E8560A', '#3B82F6', '#0D9373', '#8B5CF6', '#D97706', '#0EA5E9', '#EC4899', '#14B8A6', '#6366F1', '#059669'];

type Supabase = Awaited<ReturnType<typeof createServiceClient>>;

async function ultimaActividad(supabase: Supabase, ids: string[]) {
  const ultima = new Map<string, string>();
  const consultas = ids.flatMap(id => TABLAS_ACTIVIDAD.map(async tabla => {
    const { data, error } = await supabase.from(tabla).select('created_at').eq('responsable_id', id)
      .order('created_at', { ascending: false }).limit(1);
    const fecha = !error ? (data?.[0] as { created_at?: string } | undefined)?.created_at : undefined;
    if (fecha && (!ultima.has(id) || fecha > ultima.get(id)!)) ultima.set(id, fecha);
  }));
  await Promise.all(consultas);
  return ultima;
}

export async function GET() {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const supabase = await createServiceClient();
  const { data, error } = await supabase.from('responsables').select('*').order('nombre');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as ResponsableRow[];
  const [ultima, cuentas] = await Promise.all([
    ultimaActividad(supabase, rows.map(r => r.id)),
    mapaCuentas(supabase).catch(() => new Map()),
  ]);
  const columnasListas = rows.length === 0 || 'nivel_acceso' in rows[0];
  const porEmail = new Map<string, number>();
  for (const r of rows) if (r.email) porEmail.set(r.email.toLowerCase(), (porEmail.get(r.email.toLowerCase()) ?? 0) + 1);

  return NextResponse.json({
    personas: rows.map(r => {
      const email = r.email?.toLowerCase() ?? '';
      return aPersona(r, ultima, email ? cuentas.get(email) ?? null : null, porEmail.get(email) ?? 1);
    }),
    columnasListas,
  });
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const supabase = await createServiceClient();
  const body = await req.json();
  const nombre = String(body.nombre ?? '').trim().toUpperCase();
  if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });

  const area = AREAS.some(a => a.value === body.area) ? body.area as Area : null;
  const nivel = NIVELES.some(n => n.value === body.nivel_acceso) ? body.nivel_acceso as NivelAcceso : 'operativo';
  const email = String(body.email ?? '').trim().toLowerCase() || null;

  // Cuenta de ingreso opcional (solo admin): contraseña + perfil del sistema.
  const password = typeof body.password === 'string' ? body.password : '';
  const perfil = esRol(body.perfil) ? body.perfil : null;
  if (password) {
    if (!email) return NextResponse.json({ error: 'Para crear la cuenta de acceso ingresa el email.' }, { status: 400 });
    const errPass = validarPassword(password);
    if (errPass) return NextResponse.json({ error: errPass }, { status: 400 });
  }

  const { data: existentes } = await supabase.from('responsables').select('nombre,iniciales,email');
  const comparten = email ? (existentes ?? []).filter(r => (r.email ?? '').toLowerCase() === email).length + 1 : 1;
  if (password && comparten > 1 && body.confirmar_compartida !== true) {
    return NextResponse.json({
      error: `El email ${email} ya lo usan otras ${comparten - 1} persona(s): cambiar la contraseña la cambia para todas.`,
      compartida: true,
    }, { status: 409 });
  }
  if ((existentes ?? []).some(r => r.nombre === nombre)) {
    return NextResponse.json({ error: 'Ya existe una persona con ese nombre' }, { status: 409 });
  }
  const usadas = new Set((existentes ?? []).map(r => r.iniciales));
  let iniciales = String(body.iniciales ?? '').trim().toUpperCase() || inicialesDe(nombre);
  for (let n = 2; usadas.has(iniciales); n++) iniciales = `${iniciales.replace(/\d+$/, '')}${n}`;

  const nuevo = {
    nombre, email, iniciales, activo: true,
    rol: rolDesdeArea(area),
    color_hex: HEX_NOMBRE_VALIDOS.has(String(body.color_hex ?? '').toUpperCase())
      ? String(body.color_hex).toUpperCase()
      : PALETA[(existentes?.length ?? 0) % PALETA.length],
    area, nivel_acceso: nivel,
    permisos: normalizarPermisos(body.permisos),
  };

  const { data, error } = await supabase.from('responsables').insert(nuevo).select().single();
  if (error) {
    const msg = columnaFaltante(error) ? 'Falta ejecutar scripts/supabase_personal_permisos.sql en Supabase' : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  await auditLog(supabase, {
    usuario_email: s.email, rol_usuario: s.rol, accion: 'crear_personal', tabla: 'responsables',
    registro_id: data.id, datos_nuevos: nuevo,
  });

  let cuenta = null;
  if (email) {
    try {
      if (password) {
        const r = await guardarCuenta(supabase, email, { password, perfil });
        cuenta = r.cuenta;
        await auditLog(supabase, {
          usuario_email: s.email, rol_usuario: s.rol, accion: r.creada ? 'crear_cuenta_acceso' : 'cambiar_password',
          tabla: 'auth.users', registro_id: r.cuenta.id, datos_nuevos: { email, perfil: r.cuenta.rol },
        });
      } else {
        cuenta = (await mapaCuentas(supabase)).get(email) ?? null;
      }
    } catch (e) {
      return NextResponse.json({
        error: `La persona se guardó, pero no se pudo crear la cuenta de acceso: ${e instanceof Error ? e.message : 'error desconocido'}`,
        persona: aPersona(data as ResponsableRow, new Map(), null, comparten),
      }, { status: 500 });
    }
  }

  return NextResponse.json(aPersona(data as ResponsableRow, new Map(), cuenta, comparten), { status: 201 });
}
