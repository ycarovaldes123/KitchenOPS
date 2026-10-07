'use client';

import { useEffect, useMemo, useState } from 'react';
import NavIcon from '@/components/layout/NavIcon';
import {
  AREAS, MODULOS_PERMISO, NIVELES, normalizarPermisos, permisosPorEmail,
  type Area, type NivelAcceso, type PermisosPersona, type PersonaAdmin,
} from '@/lib/personal';
import '@/app/(app)/maestros/personal.css';

type FormState = {
  id: string | null;
  nombre: string;
  iniciales: string;
  email: string;
  area: Area | '';
  nivel_acceso: NivelAcceso;
  permisos: PermisosPersona;
};

const AREA_MAP = new Map(AREAS.map(a => [a.value, a]));
const NIVEL_MAP = new Map(NIVELES.map(n => [n.value, n]));

const fmtHora = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' });

function formatoActividad(iso: string | null) {
  if (!iso) return 'Sin registros';
  const fecha = new Date(iso);
  const dia = fmtDia.format(fecha);
  const hoy = fmtDia.format(new Date());
  const ayer = fmtDia.format(new Date(Date.now() - 86_400_000));
  if (dia === hoy) return `Hoy · ${fmtHora.format(fecha)}`;
  if (dia === ayer) return `Ayer · ${fmtHora.format(fecha)}`;
  const [y, m, d] = dia.split('-');
  return `${d}/${m}/${y}`;
}

function nombreVisible(nombre: string) {
  return nombre.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
}

function Avatar({ p, size }: { p: PersonaAdmin; size: number }) {
  return (
    <span
      className="per-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: p.color_hex ?? '#6B7280', opacity: p.activo ? 1 : 0.55 }}
    >
      {(p.iniciales ?? '').replace(/\d+$/, '')}
    </span>
  );
}

function AreaChip({ area }: { area: Area | null }) {
  const a = area ? AREA_MAP.get(area) : null;
  if (!a) return <span className="per-chip" style={{ color: '#6B7280', background: '#F3F4F6' }}>Sin rol</span>;
  return <span className="per-chip" style={{ color: a.color, background: a.bg }}>{a.label}</span>;
}

function EstadoChip({ activo }: { activo: boolean }) {
  return (
    <span className={`per-chip per-estado ${activo ? 'is-on' : 'is-off'}`}>
      <span className="per-dot" />{activo ? 'Activo' : 'Inactivo'}
    </span>
  );
}

function Acceso({ nivel }: { nivel: NivelAcceso }) {
  const n = NIVEL_MAP.get(nivel)!;
  return <span className="per-acceso"><NavIcon name={n.icon} size={15} strokeWidth={1.9} />{n.label}</span>;
}

function Check({ on }: { on: boolean }) {
  return <span className={`per-check ${on ? 'is-on' : ''}`}>{on && <NavIcon name="check" size={12} strokeWidth={3} />}</span>;
}

export default function PersonalTab({ canEdit }: { canEdit: boolean }) {
  const [personas, setPersonas] = useState<PersonaAdmin[]>([]);
  const [columnasListas, setColumnasListas] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [filtroArea, setFiltroArea] = useState<Area | ''>('');
  const [filtroEstado, setFiltroEstado] = useState<'' | 'activo' | 'inactivo'>('');
  const [soloConAcceso, setSoloConAcceso] = useState(false);

  const [selId, setSelId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<PersonaAdmin | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [elimError, setElimError] = useState('');

  // Carga unica al montar; despues los cambios se aplican en memoria con la respuesta de la API.
  useEffect(() => {
    let vigente = true;
    fetch('/api/maestros/personal', { cache: 'no-store' })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? 'Error al cargar personal');
        return d as { personas: PersonaAdmin[]; columnasListas?: boolean };
      })
      .then(d => {
        if (!vigente) return;
        setPersonas(d.personas);
        setColumnasListas(d.columnasListas !== false);
        if (d.personas.length && window.matchMedia('(min-width: 1181px)').matches) {
          setSelId((d.personas.find(p => p.activo) ?? d.personas[0]).id);
        }
      })
      .catch(e => { if (vigente) setError(e instanceof Error ? e.message : 'Error al cargar personal'); })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, []);

  useEffect(() => {
    if (!menuId) return;
    const cerrar = () => setMenuId(null);
    window.addEventListener('click', cerrar);
    return () => window.removeEventListener('click', cerrar);
  }, [menuId]);

  const kpis = useMemo(() => {
    const activas = personas.filter(p => p.activo).length;
    return {
      total: personas.length,
      activas,
      inactivas: personas.length - activas,
      roles: new Set(personas.map(p => p.area).filter(Boolean)).size,
    };
  }, [personas]);

  const areasPresentes = useMemo(() => AREAS.filter(a => personas.some(p => p.area === a.value)), [personas]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return personas.filter(p =>
      (!q || p.nombre.toLowerCase().includes(q) || (p.email ?? '').includes(q) || (p.iniciales ?? '').toLowerCase().includes(q)) &&
      (!filtroArea || p.area === filtroArea) &&
      (!filtroEstado || (filtroEstado === 'activo') === p.activo) &&
      (!soloConAcceso || p.con_acceso),
    );
  }, [personas, busqueda, filtroArea, filtroEstado, soloConAcceso]);

  const sel = personas.find(p => p.id === selId) ?? null;

  function reemplazar(actualizada: PersonaAdmin) {
    setPersonas(prev => prev.map(p => p.id === actualizada.id
      ? { ...actualizada, ultima_actividad: p.ultima_actividad }
      : p));
  }

  async function toggleActivo(p: PersonaAdmin) {
    setMenuId(null);
    setToggling(p.id);
    setError('');
    try {
      const r = await fetch(`/api/maestros/personal/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: !p.activo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'No se pudo actualizar');
      reemplazar(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar');
    } finally {
      setToggling(null);
    }
  }

  function pedirEliminar(p: PersonaAdmin) {
    setMenuId(null);
    setElimError('');
    setAEliminar(p);
  }

  async function eliminar() {
    if (!aEliminar) return;
    setEliminando(true);
    setElimError('');
    try {
      const r = await fetch(`/api/maestros/personal/${aEliminar.id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'No se pudo eliminar');
      setPersonas(prev => prev.filter(p => p.id !== aEliminar.id));
      if (selId === aEliminar.id) setSelId(null);
      setAEliminar(null);
    } catch (e) {
      setElimError(e instanceof Error ? e.message : 'No se pudo eliminar');
    } finally {
      setEliminando(false);
    }
  }

  function abrirEditar(p: PersonaAdmin) {
    setMenuId(null);
    setFormError('');
    setForm({
      id: p.id, nombre: nombreVisible(p.nombre), iniciales: p.iniciales ?? '', email: p.email ?? '',
      area: p.area ?? '', nivel_acceso: p.nivel_acceso, permisos: { ...p.permisos },
    });
  }

  function abrirNuevo() {
    setFormError('');
    setForm({ id: null, nombre: '', iniciales: '', email: '', area: 'cocina', nivel_acceso: 'operativo', permisos: normalizarPermisos({}) });
  }

  function setPermiso(modulo: string, campo: 'ver' | 'editar', valor: boolean) {
    setForm(f => {
      if (!f) return f;
      const actual = f.permisos[modulo] ?? { ver: false, editar: false };
      // Editar requiere Visualizacion: activar Editar enciende Ver; apagar Ver apaga Editar.
      const nuevo = campo === 'editar'
        ? { ver: valor || actual.ver, editar: valor }
        : { ver: valor, editar: valor ? actual.editar : false };
      return { ...f, permisos: { ...f.permisos, [modulo]: nuevo } };
    });
  }

  async function guardar() {
    if (!form) return;
    if (!form.nombre.trim()) { setFormError('El nombre es requerido'); return; }
    setSaving(true);
    setFormError('');
    const body = {
      nombre: form.nombre, iniciales: form.iniciales, email: form.email,
      area: form.area || null, nivel_acceso: form.nivel_acceso, permisos: form.permisos,
    };
    try {
      const r = await fetch(form.id ? `/api/maestros/personal/${form.id}` : '/api/maestros/personal', {
        method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error al guardar');
      if (form.id) reemplazar(d);
      else { setPersonas(prev => [...prev, d].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))); setSelId(d.id); }
      setForm(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const modulosVisibles = sel ? MODULOS_PERMISO.filter(m => sel.permisos[m.key]?.ver) : [];

  return (
    <div className="per">
      {/* Cabecera */}
      <div className="per-head">
        <div className="per-head-title">
          <span className="per-head-icon"><NavIcon name="users" size={22} strokeWidth={1.9} /></span>
          <div>
            <h2>Personal</h2>
            <p>Administra las personas, roles y accesos del sistema</p>
          </div>
        </div>
        {canEdit && (
          <button type="button" className="per-btn-primary" onClick={abrirNuevo}>
            <NavIcon name="plus" size={18} /> Nuevo personal
          </button>
        )}
      </div>

      {/* Indicadores */}
      <div className="per-kpis">
        <div className="per-kpi k-total"><span className="per-kpi-icon"><NavIcon name="users" size={20} strokeWidth={1.9} /></span><div><b>{kpis.total}</b><span>personas</span></div></div>
        <div className="per-kpi k-on"><span className="per-kpi-icon"><NavIcon name="user" size={20} strokeWidth={1.9} /></span><div><b>{kpis.activas}</b><span>activas</span></div></div>
        <div className="per-kpi k-off"><span className="per-kpi-icon"><NavIcon name="user" size={20} strokeWidth={1.9} /></span><div><b>{kpis.inactivas}</b><span>inactivas</span></div></div>
        <div className="per-kpi k-roles"><span className="per-kpi-icon"><NavIcon name="database" size={20} strokeWidth={1.9} /></span><div><b>{kpis.roles}</b><span>roles</span></div></div>
      </div>

      {/* Buscador y filtros */}
      <div className="per-filtros">
        <label className="per-search">
          <NavIcon name="search" size={17} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar persona..." />
        </label>
        <label className="per-select">
          <span>Rol:</span>
          <select value={filtroArea} onChange={e => setFiltroArea(e.target.value as Area | '')}>
            <option value="">Todos</option>
            {areasPresentes.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </label>
        <label className="per-select">
          <span>Estado:</span>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as '' | 'activo' | 'inactivo')}>
            <option value="">Todos</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </label>
        <label className="per-checkbox">
          <input type="checkbox" checked={soloConAcceso} onChange={e => setSoloConAcceso(e.target.checked)} />
          Solo con acceso
        </label>
      </div>

      {!columnasListas && canEdit && (
        <p className="per-aviso">
          Para guardar rol, acceso y permisos falta ejecutar <code>scripts/supabase_personal_permisos.sql</code> en Supabase.
          Mientras tanto se muestran los valores que hoy entrega cada cuenta.
        </p>
      )}
      {error && <p className="per-error">{error}</p>}

      <div className={`per-body ${sel ? 'has-panel' : ''}`}>
        {/* Tabla */}
        <div className="per-table-card">
          <table className="per-table">
            <thead>
              <tr>
                <th>Persona</th><th>Rol</th><th>Acceso</th><th>Estado</th><th>Última actividad</th><th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="per-empty">Cargando...</td></tr>}
              {!loading && filtradas.length === 0 && <tr><td colSpan={6} className="per-empty">Sin resultados</td></tr>}
              {!loading && filtradas.map(p => (
                <tr
                  key={p.id}
                  className={`${p.id === selId ? 'is-selected' : ''} ${p.activo ? '' : 'is-inactive'}`}
                  onClick={() => setSelId(p.id)}
                >
                  <td>
                    <div className="per-persona">
                      <Avatar p={p} size={32} />
                      <span>{nombreVisible(p.nombre)}</span>
                    </div>
                  </td>
                  <td><AreaChip area={p.area} /></td>
                  <td><Acceso nivel={p.nivel_acceso} /></td>
                  <td><EstadoChip activo={p.activo} /></td>
                  <td className="per-actividad">{formatoActividad(p.ultima_actividad)}</td>
                  <td className="per-acciones" onClick={e => e.stopPropagation()}>
                    <button
                      type="button" className="per-kebab" aria-label="Acciones"
                      onClick={e => { e.stopPropagation(); setMenuId(menuId === p.id ? null : p.id); }}
                    >
                      <NavIcon name="more-vertical" size={18} />
                    </button>
                    {menuId === p.id && (
                      <div className="per-menu" onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => { setSelId(p.id); setMenuId(null); }}><NavIcon name="eye" size={15} /> Ver detalle</button>
                        {canEdit && <button type="button" onClick={() => abrirEditar(p)}><NavIcon name="pencil" size={15} /> Editar</button>}
                        {canEdit && (
                          <button type="button" className={p.activo ? 'is-danger' : ''} onClick={() => toggleActivo(p)}>
                            <NavIcon name={p.activo ? 'circle-pause' : 'circle-play'} size={15} /> {p.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        )}
                        {canEdit && (
                          <button type="button" className="is-danger" onClick={() => pedirEliminar(p)}>
                            <NavIcon name="trash" size={15} /> Eliminar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Panel de detalle */}
        {sel && (
          <>
            <div className="per-backdrop" onClick={() => setSelId(null)} />
            <aside className="per-panel" aria-label="Detalle de personal">
              <div className="per-panel-head">
                <h3>Detalle de personal</h3>
                <button type="button" className="per-icon-btn" aria-label="Cerrar" onClick={() => setSelId(null)}><NavIcon name="x" size={18} /></button>
              </div>

              <div className="per-panel-perfil">
                <Avatar p={sel} size={84} />
                <strong>{nombreVisible(sel.nombre)}</strong>
                <EstadoChip activo={sel.activo} />
              </div>

              <dl className="per-info">
                <div><dt><NavIcon name="user" size={16} strokeWidth={1.9} /> Rol</dt><dd><AreaChip area={sel.area} /></dd></div>
                <div><dt><NavIcon name="shield" size={16} strokeWidth={1.9} /> Acceso</dt><dd>{NIVEL_MAP.get(sel.nivel_acceso)?.label}</dd></div>
                <div><dt><NavIcon name="calendar" size={16} strokeWidth={1.9} /> Última actividad</dt><dd>{formatoActividad(sel.ultima_actividad)}</dd></div>
                {sel.email && <div><dt><NavIcon name="mail" size={16} strokeWidth={1.9} /> Cuenta</dt><dd className="per-email">{sel.email}</dd></div>}
              </dl>

              <div className="per-permisos">
                <h4>Módulos habilitados</h4>
                {modulosVisibles.length === 0 ? (
                  <p className="per-muted">Sin módulos habilitados</p>
                ) : (
                  <table>
                    <thead><tr><th>Módulo</th><th>Visualización</th><th>Editar</th></tr></thead>
                    <tbody>
                      {modulosVisibles.map(m => (
                        <tr key={m.key}>
                          <td><span className="per-modulo"><NavIcon name={m.icon} size={15} strokeWidth={1.9} />{m.label}</span></td>
                          <td><Check on={!!sel.permisos[m.key]?.ver} /></td>
                          <td><Check on={!!sel.permisos[m.key]?.editar} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {!sel.permisos_personalizados && <p className="per-muted per-nota">Según la cuenta con la que ingresa.</p>}
              </div>

              {canEdit && (
                <div className="per-panel-acciones">
                  <button type="button" className="per-btn-primary is-block" onClick={() => abrirEditar(sel)}>
                    <NavIcon name="pencil" size={17} /> Editar
                  </button>
                  <button
                    type="button" className={`per-btn-outline is-block ${sel.activo ? 'is-danger' : 'is-ok'}`}
                    disabled={toggling === sel.id} onClick={() => toggleActivo(sel)}
                  >
                    <NavIcon name={sel.activo ? 'circle-pause' : 'circle-play'} size={17} />
                    {toggling === sel.id ? 'Guardando...' : sel.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button type="button" className="per-btn-text is-danger" onClick={() => pedirEliminar(sel)}>
                    <NavIcon name="trash" size={15} /> Eliminar
                  </button>
                </div>
              )}
            </aside>
          </>
        )}
      </div>

      {/* Confirmar eliminacion */}
      {aEliminar && (
        <div className="per-modal-bg" onClick={e => { if (e.target === e.currentTarget && !eliminando) setAEliminar(null); }}>
          <div className="per-modal is-small" role="alertdialog" aria-modal="true">
            <div className="per-modal-head">
              <h3>Eliminar personal</h3>
              <button type="button" className="per-icon-btn" aria-label="Cerrar" onClick={() => setAEliminar(null)} disabled={eliminando}><NavIcon name="x" size={18} /></button>
            </div>
            <div className="per-modal-body">
              <div className="per-confirm">
                <Avatar p={aEliminar} size={44} />
                <p>¿Eliminar a <strong>{nombreVisible(aEliminar.nombre)}</strong>? Esta acción no se puede deshacer.</p>
              </div>
              <p className="per-muted">Solo se puede eliminar a quien no tiene registros en el historial. Si tiene registros, desactiva a la persona en su lugar.</p>
              {elimError && <p className="per-error" style={{ marginTop: 12 }}>{elimError}</p>}
            </div>
            <div className="per-modal-foot">
              <button type="button" className="per-btn-outline" onClick={() => setAEliminar(null)} disabled={eliminando}>Cancelar</button>
              <button type="button" className="per-btn-primary is-danger" onClick={eliminar} disabled={eliminando}>
                <NavIcon name="trash" size={16} /> {eliminando ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Formulario Nuevo / Editar */}
      {form && (
        <div className="per-modal-bg" onClick={e => { if (e.target === e.currentTarget) setForm(null); }}>
          <div className="per-modal" role="dialog" aria-modal="true">
            <div className="per-modal-head">
              <h3>{form.id ? 'Editar personal' : 'Nuevo personal'}</h3>
              <button type="button" className="per-icon-btn" aria-label="Cerrar" onClick={() => setForm(null)}><NavIcon name="x" size={18} /></button>
            </div>

            <div className="per-modal-body">
              <div className="per-form-grid">
                <label className="per-field is-wide">
                  <span>Nombre</span>
                  <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre Apellido" />
                </label>
                <label className="per-field">
                  <span>Iniciales</span>
                  <input value={form.iniciales} maxLength={4} onChange={e => setForm({ ...form, iniciales: e.target.value.toUpperCase() })} placeholder="Automáticas" />
                </label>
                <label className="per-field is-wide">
                  <span>Cuenta de acceso (email)</span>
                  <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="usuario@cerveceriakunstmann.cl" />
                </label>
                <label className="per-field">
                  <span>Rol</span>
                  <select value={form.area} onChange={e => setForm({ ...form, area: e.target.value as Area | '' })}>
                    <option value="">Sin rol</option>
                    {AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </label>
                <label className="per-field">
                  <span>Acceso</span>
                  <select value={form.nivel_acceso} onChange={e => setForm({ ...form, nivel_acceso: e.target.value as NivelAcceso })}>
                    {NIVELES.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="per-permisos is-edit">
                <div className="per-permisos-head">
                  <h4>Permisos por módulo</h4>
                  {form.email && (
                    <button type="button" className="per-link" onClick={() => setForm({ ...form, permisos: permisosPorEmail(form.email.trim().toLowerCase()) })}>
                      Usar los de su cuenta
                    </button>
                  )}
                </div>
                <table>
                  <thead><tr><th>Módulo</th><th>Visualización</th><th>Editar</th></tr></thead>
                  <tbody>
                    {MODULOS_PERMISO.map(m => {
                      const p = form.permisos[m.key] ?? { ver: false, editar: false };
                      return (
                        <tr key={m.key}>
                          <td><span className="per-modulo"><NavIcon name={m.icon} size={15} strokeWidth={1.9} />{m.label}</span></td>
                          <td><input type="checkbox" className="per-cb" checked={p.ver} onChange={e => setPermiso(m.key, 'ver', e.target.checked)} aria-label={`Visualizar ${m.label}`} /></td>
                          <td><input type="checkbox" className="per-cb" checked={p.editar} onChange={e => setPermiso(m.key, 'editar', e.target.checked)} aria-label={`Editar ${m.label}`} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="per-muted per-nota">Editar requiere Visualización. Por ahora el ingreso al sistema se sigue controlando por la cuenta (email).</p>
              </div>

              {formError && <p className="per-error">{formError}</p>}
            </div>

            <div className="per-modal-foot">
              <button type="button" className="per-btn-outline" onClick={() => setForm(null)}>Cancelar</button>
              <button type="button" className="per-btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
