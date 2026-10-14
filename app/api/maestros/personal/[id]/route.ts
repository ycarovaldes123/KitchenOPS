import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';
import { requireRol } from '@/lib/auth-server';
import { auditLog } from '@/lib/audit';
import { esRol } from '@/lib/roles';
import { guardarCuenta, mapaCuentas, validarPassword } from '@/lib/cuentas-acceso';
import {
  AREAS, NIVELES, TABLAS_ACTIVIDAD, aPersona, columnaFaltante, normalizarPermisos, type ResponsableRow,
} from '@/lib/personal';

// Los registros historicos (produccion, mermas, colacion, frutas, inventarios, carnicos) apuntan a
// responsables.id: quien tiene historial solo se activa/desactiva; DELETE solo borra personas sin registros.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const { id } = await params;
  const supabase = await createServiceClient();
  const body = await req.json();

  const { data: anterior, error: errAnt } = await supabase.from('responsables').select('*').eq('id', id).maybeSingle();
  if (errAnt) return NextResponse.json({ error: errAnt.message }, { status: 500 });
  if (!anterior) return NextResponse.json({ error: 'Persona no encontrada' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (body.nombre !== undefined) {
    const nombre = String(body.nombre ?? '').trim().toUpperCase();
    if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    if (nombre !== anterior.nombre) {
      const { data: otro } = await supabase.from('responsables').select('id').eq('nombre', nombre).neq('id', id).maybeSingle();
      if (otro) return NextResponse.json({ error: 'Ya existe una persona con ese nombre' }, { status: 409 });
    }
    updates.nombre = nombre;
  }
  if (body.iniciales !== undefined) {
    const iniciales = String(body.iniciales ?? '').trim().toUpperCase();
    if (!iniciales) return NextResponse.json({ error: 'Las iniciales son requeridas' }, { status: 400 });
    updates.iniciales = iniciales;
  }
  if (body.email !== undefined) updates.email = String(body.email ?? '').trim().toLowerCase() || null;
  if (body.activo !== undefined) updates.activo = !!body.activo;
  if (body.area !== undefined) {
    if (body.area !== null && !AREAS.some(a => a.value === body.area)) return NextResponse.json({ error: 'Rol no valido' }, { status: 400 });
    updates.area = body.area;
  }
  if (body.nivel_acceso !== undefined) {
    if (!NIVELES.some(n => n.value === body.nivel_acceso)) return NextResponse.json({ error: 'Nivel de acceso no valido' }, { status: 400 });
    updates.nivel_acceso = body.nivel_acceso;
  }
  if (body.permisos !== undefined) updates.permisos = normalizarPermisos(body.permisos);

  // Cuenta de ingreso (solo admin): contraseña nueva y/o perfil del sistema.
  const password = typeof body.password === 'string' ? body.password : '';
  const perfil = esRol(body.perfil) ? body.perfil : null;
  const emailFinal = String((updates.email !== undefined ? updates.email : anterior.email) ?? '').toLowerCase();
  if ((password || perfil) && !emailFinal) {
    return NextResponse.json({ error: 'Para la cuenta de acceso ingresa el email.' }, { status: 400 });
  }
  if (password) {
    const errPass = validarPassword(password);
    if (errPass) return NextResponse.json({ error: errPass }, { status: 400 });
  }
  let comparten = 1;
  if (emailFinal) {
    const { data: mismos } = await supabase.from('responsables').select('id').ilike('email', emailFinal).neq('id', id);
    comparten = (mismos?.length ?? 0) + 1;
  }
  if (password && comparten > 1 && body.confirmar_compartida !== true) {
    return NextResponse.json({
      error: `El email ${emailFinal} lo usan ${comparten} personas: cambiar la contraseña la cambia para todas.`,
      compartida: true,
    }, { status: 409 });
  }

  const { data, error } = await supabase.from('responsables').update(updates).eq('id', id).select().single();
  if (error) {
    const msg = columnaFaltante(error) ? 'Falta ejecutar scripts/supabase_personal_permisos.sql en Supabase' : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  await auditLog(supabase, {
    usuario_email: s.email, rol_usuario: s.rol,
    accion: body.activo !== undefined && Object.keys(updates).length === 1
      ? (updates.activo ? 'activar_personal' : 'desactivar_personal')
      : 'editar_personal',
    tabla: 'responsables', registro_id: id,
    datos_anteriores: anterior, datos_nuevos: updates,
  });

  let cuenta = null;
  if (emailFinal) {
    try {
      const cuentas = await mapaCuentas(supabase);
      // Solo se toca la cuenta si se pidio: contraseña nueva, o perfil distinto en una cuenta existente.
      if (password || (perfil && cuentas.has(emailFinal))) {
        const r = await guardarCuenta(supabase, emailFinal, { password: password || undefined, perfil });
        cuenta = r.cuenta;
        await auditLog(supabase, {
          usuario_email: s.email, rol_usuario: s.rol,
          accion: r.creada ? 'crear_cuenta_acceso' : password ? 'cambiar_password' : 'cambiar_perfil_acceso',
          tabla: 'auth.users', registro_id: r.cuenta.id, datos_nuevos: { email: emailFinal, perfil: r.cuenta.rol },
        });
      } else {
        cuenta = cuentas.get(emailFinal) ?? null;
      }
    } catch (e) {
      return NextResponse.json({
        error: `Los datos se guardaron, pero no se pudo actualizar la cuenta de acceso: ${e instanceof Error ? e.message : 'error desconocido'}`,
      }, { status: 500 });
    }
  }

  return NextResponse.json(aPersona(data as ResponsableRow, new Map(), cuenta, comparten));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireRol(['admin']);
  if (!s.ok) return s.response;

  const { id } = await params;
  const supabase = await createServiceClient();

  const { data: persona, error: errP } = await supabase.from('responsables').select('*').eq('id', id).maybeSingle();
  if (errP) return NextResponse.json({ error: errP.message }, { status: 500 });
  if (!persona) return NextResponse.json({ error: 'Persona no encontrada' }, { status: 404 });

  let registros = 0;
  for (const tabla of TABLAS_ACTIVIDAD) {
    const { count, error } = await supabase.from(tabla).select('id', { count: 'exact', head: true }).eq('responsable_id', id);
    if (!error) registros += count ?? 0;
  }
  if (registros > 0) {
    return NextResponse.json({
      error: `No se puede eliminar: tiene ${registros.toLocaleString('es-CL')} registro${registros === 1 ? '' : 's'} en el historial. Desactiva a la persona para que no aparezca en los formularios.`,
      registros,
    }, { status: 409 });
  }

  const { error } = await supabase.from('responsables').delete().eq('id', id);
  if (error) {
    const msg = error.code === '23503'
      ? 'No se puede eliminar: tiene registros asociados en el sistema. Desactiva a la persona en su lugar.'
      : error.message;
    return NextResponse.json({ error: msg }, { status: error.code === '23503' ? 409 : 500 });
  }

  await auditLog(supabase, {
    usuario_email: s.email, rol_usuario: s.rol, accion: 'eliminar_personal',
    tabla: 'responsables', registro_id: id, datos_anteriores: persona,
  });

  return NextResponse.json({ ok: true });
}
