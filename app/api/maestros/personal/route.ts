import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';
import {
  AREAS, NIVELES, TABLAS_ACTIVIDAD, aPersona, columnaFaltante, inicialesDe, normalizarPermisos, rolDesdeArea,
  type Area, type NivelAcceso, type ResponsableRow,
} from '@/lib/personal';


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
  const ultima = await ultimaActividad(supabase, rows.map(r => r.id));
  const columnasListas = rows.length === 0 || 'nivel_acceso' in rows[0];

  return NextResponse.json({ personas: rows.map(r => aPersona(r, ultima)), columnasListas });
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

  const { data: existentes } = await supabase.from('responsables').select('nombre,iniciales');
  if ((existentes ?? []).some(r => r.nombre === nombre)) {
    return NextResponse.json({ error: 'Ya existe una persona con ese nombre' }, { status: 409 });
  }
  const usadas = new Set((existentes ?? []).map(r => r.iniciales));
  let iniciales = String(body.iniciales ?? '').trim().toUpperCase() || inicialesDe(nombre);
  for (let n = 2; usadas.has(iniciales); n++) iniciales = `${iniciales.replace(/\d+$/, '')}${n}`;

  const nuevo = {
    nombre, email, iniciales, activo: true,
    rol: rolDesdeArea(area),
    color_hex: PALETA[(existentes?.length ?? 0) % PALETA.length],
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

  return NextResponse.json(aPersona(data as ResponsableRow, new Map()), { status: 201 });
}
