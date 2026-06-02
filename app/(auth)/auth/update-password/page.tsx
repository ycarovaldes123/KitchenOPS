'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;

      if (!data.user) {
        setError('No hay una sesion activa para cambiar la contrasena.');
        setLoading(false);
        return;
      }

      setReady(true);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || password.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contrasenas no coinciden.');
      return;
    }

    setSaving(true);
    setError('');

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setSaving(false);
      setError('No se pudo actualizar la contrasena.');
      return;
    }

    await supabase.auth.signOut();
    router.replace('/login?updated=1');
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <p style={{ color: 'var(--ts)' }}>Cargando...</p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'var(--bg)',
    }}>
      <div style={{
        background: 'var(--sf)',
        borderRadius: '20px',
        border: '1px solid var(--bo)',
        padding: '44px 36px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
      }}>
        <div style={{ marginBottom: '6px' }}>
          <span style={{
            fontFamily: 'Syne, sans-serif',
            fontSize: '26px',
            fontWeight: 800,
            color: 'var(--tx)',
          }}>
            Kitchen<span style={{ color: 'var(--ac)' }}>Ops</span>
          </span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--ts)', marginBottom: '28px' }}>
          Definir nueva contrasena
        </p>

        {!ready ? (
          <div style={{ color: 'var(--ts)', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--ts)',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              marginBottom: '5px',
            }}>
              Nueva contrasena
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              style={{
                width: '100%',
                border: `1.5px solid ${error ? 'var(--rd)' : 'var(--bo)'}`,
                borderRadius: '9px',
                padding: '11px 13px',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '14px',
                background: 'var(--bg)',
                color: 'var(--tx)',
                outline: 'none',
                marginBottom: '10px',
                boxSizing: 'border-box',
              }}
            />

            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--ts)',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              marginBottom: '5px',
            }}>
              Repetir contrasena
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(''); }}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              style={{
                width: '100%',
                border: `1.5px solid ${error ? 'var(--rd)' : 'var(--bo)'}`,
                borderRadius: '9px',
                padding: '11px 13px',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '14px',
                background: 'var(--bg)',
                color: 'var(--tx)',
                outline: 'none',
                marginBottom: '12px',
                boxSizing: 'border-box',
              }}
            />

            {error && (
              <p style={{
                fontSize: '12px',
                color: 'var(--rd)',
                marginBottom: '10px',
              }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              style={{
                width: '100%',
                background: saving ? '#ccc' : 'var(--ac)',
                color: '#fff',
                border: 'none',
                borderRadius: '9px',
                padding: '12px',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '14px',
                fontWeight: 600,
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Guardando...' : 'Actualizar contrasena'}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => router.push('/login')}
          style={{
            width: '100%',
            marginTop: '10px',
            border: '1px solid var(--bo)',
            background: 'var(--bg)',
            color: 'var(--ts)',
            borderRadius: '9px',
            padding: '12px',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Volver al login
        </button>
      </div>
    </div>
  );
}
