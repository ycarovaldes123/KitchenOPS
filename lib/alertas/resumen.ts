// Resumen diario de alertas: selección y armado del correo (misma lógica que la vista previa).

import { CATEGORIA_GRUPO } from './catalogo';
import type { Correo } from '@/lib/email';
import type { Alerta, GrupoCategoria, ModuloAlerta, NivelAlerta } from './types';

// PILOTO: único destinatario de todo correo del módulo (se usa en servidor y en la vista previa)
export const DESTINATARIO_PILOTO = 'jsepulveda@cerveceriakunstmann.cl';

export const MAX_DESTACADAS = 5;
const ORDEN_NIVEL: Record<NivelAlerta, number> = { ALTA: 0, REVISAR: 1, INFO: 2 };
const GRUPOS: GrupoCategoria[] = ['Cantidad / Unidad', 'Fechas', 'Datos maestros', 'Otros'];

function fmtF(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// El correo solo incluye alertas de los módulos operativos del día a día
export const MODULOS_CORREO: ModuloAlerta[] = ['Producción', 'Mermas', 'Colación'];

// Alertas de esos módulos del último día que tuvo alertas
export function alertasDelResumen(alertas: Alerta[]): { fecha: string; alertas: Alerta[] } {
  const delCorreo = alertas.filter(a => MODULOS_CORREO.includes(a.modulo));
  const fecha = delCorreo.reduce((m, a) => (a.fecha > m ? a.fecha : m), '');
  return { fecha, alertas: delCorreo.filter(a => a.fecha === fecha) };
}

export function asuntoResumen(n: number, fecha: string) {
  return `KitchenOps · ${n} alerta${n !== 1 ? 's' : ''} detectada${n !== 1 ? 's' : ''} · ${fmtF(fecha)}`;
}

export function destacadas(alertas: Alerta[]) {
  return [...alertas].sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel]).slice(0, MAX_DESTACADAS);
}

// Texto de apertura (plano) del correo; en HTML el conteo va en negrita
interface Opciones { asunto?: string; intro?: (n: string) => string }

export function armarCorreoResumen(alertas: Alerta[], fecha: string, urlModulo: string, opciones: Opciones = {}): Correo {
  const grupos = GRUPOS.map(g => [g, alertas.filter(a => CATEGORIA_GRUPO[a.categoria] === g).length] as const).filter(([, n]) => n > 0);
  const top = destacadas(alertas);
  const resto = alertas.length - top.length;
  const asunto = opciones.asunto ?? asuntoResumen(alertas.length, fecha);
  const intro = opciones.intro ?? ((n: string) => `KitchenOps detectó ${n} en Producción, Mermas y Colación el ${fmtF(fecha)}.`);
  const cuantas = `${alertas.length} posible${alertas.length !== 1 ? 's' : ''} inconsistencia${alertas.length !== 1 ? 's' : ''}`;

  const texto = [
    'Hola,', '',
    `${intro(cuantas)} Los movimientos se guardaron normalmente; estas alertas son para revisión.`, '',
    ...grupos.map(([g, n]) => `• ${n} ${g}`), '',
    ...top.map(a => `${a.registro}\n  ${a.modulo} · ${a.detalle}`),
    ...(resto > 0 ? ['', `+${resto} alerta${resto !== 1 ? 's' : ''} adicional${resto !== 1 ? 'es' : ''}`] : []),
    '', `Ver todas las alertas: ${urlModulo}`, '', '— KitchenOps (piloto, modo observación)',
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;background:#F7F4EF;font-family:Arial,Helvetica,sans-serif;color:#141414">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #E5E0D8;border-radius:12px">
<tr><td style="padding:24px 24px 8px"><div style="font-size:20px;font-weight:bold">Kitchen<span style="color:#E8560A">Ops</span></div>
<div style="font-size:12px;color:#6B6560;margin-top:2px">Alertas y Validaciones · modo observación</div></td></tr>
<tr><td style="padding:8px 24px;font-size:14px;line-height:1.55">
<p>Hola,</p>
<p>${esc(intro('§')).replace('§', `<b>${cuantas}</b>`)} Los movimientos se guardaron normalmente; estas alertas son para revisión.</p>
<p>${grupos.map(([g, n]) => `<span style="display:inline-block;border:1px solid #E5E0D8;border-radius:8px;padding:6px 10px;margin:0 6px 6px 0"><b>${n}</b> ${esc(g)}</span>`).join('')}</p>
${top.map(a => `<div style="padding:10px 0;border-bottom:1px solid #F0ECE6"><b>${esc(a.registro)}</b><br><span style="font-size:13px;color:#6B6560">${esc(a.modulo)} · ${esc(a.detalle)}</span></div>`).join('')}
${resto > 0 ? `<p style="font-size:13px;color:#6B6560">+${resto} alerta${resto !== 1 ? 's' : ''} adicional${resto !== 1 ? 'es' : ''}</p>` : ''}
<p style="margin:20px 0"><a href="${esc(urlModulo)}" style="background:#E8560A;color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:8px;display:inline-block">Ver todas las alertas</a></p>
</td></tr>
<tr><td style="padding:12px 24px 20px;font-size:11px;color:#9A938C">Correo de prueba del piloto local. Solo se envía a una dirección de prueba.</td></tr>
</table></td></tr></table></body></html>`;

  return { asunto, html, texto };
}

// Correo inmediato al crear un registro que generó alertas (solo ese registro)
export function armarCorreoRegistro(alertas: Alerta[], urlModulo: string): Correo {
  const a0 = alertas[0];
  const modulo = a0.modulo;
  const fecha = a0.movimiento.fecha_movimiento;
  const por = a0.movimiento.created_by;
  return armarCorreoResumen(alertas, fecha, urlModulo, {
    asunto: `KitchenOps · ${alertas.length} alerta${alertas.length !== 1 ? 's' : ''} · ${modulo} · ${fmtF(fecha)} · ${por}`,
    intro: n => `${por} acaba de registrar ${modulo === 'Colación' ? 'una colación' : modulo === 'Mermas' ? 'mermas' : 'una producción'} del ${fmtF(fecha)} y KitchenOps detectó ${n}.`,
  });
}
