'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { rolDeUsuario, RUTA_INICIO_COMUN } from '@/lib/roles';

const ERROR_MSG: Record<string, string> = {
  unauthorized: 'Este correo no tiene acceso a KitchenOps.',
  link_expirado: 'El enlace expiro. Solicita uno nuevo.',
  auth_failed: 'Error de autenticacion. Intenta de nuevo.',
};

type LoginMode = 'login' | 'reset';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<LoginMode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const queryError = searchParams.get('error');
  const queryStatus =
    searchParams.get('updated') === '1'
      ? 'Contrasena actualizada. Inicia sesion nuevamente.'
      : searchParams.get('reset') === '1'
        ? 'Te enviamos un correo para restablecer tu contrasena.'
        : '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError('');

    if (mode === 'reset') {
      const redirectTo = `${window.location.origin}/auth/callback?next=/auth/update-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo }
      );

      setLoading(false);
      if (resetError) {
        setError('No se pudo enviar el correo de recuperacion.');
        return;
      }
      return;
    }

    if (!password) {
      setLoading(false);
      return;
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError || !data.user) {
      setLoading(false);
      setError('Correo o contrasena incorrectos.');
      return;
    }

    const rol = rolDeUsuario(data.user);
    if (!rol) {
      await supabase.auth.signOut();
      setLoading(false);
      setError('Este correo no tiene acceso a KitchenOps.');
      return;
    }

    router.push(RUTA_INICIO_COMUN);
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
        maxWidth: '400px',
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
          Cerveceria Kunstmann · Torobayo
        </p>

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
            Correo institucional
          </label>
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            placeholder="usuario@cerveceriakunstmann.cl"
            required
            autoComplete="email"
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
              transition: 'border-color 0.15s',
              boxSizing: 'border-box',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--ac)'; }}
            onBlur={e => { e.target.style.borderColor = error ? 'var(--rd)' : 'var(--bo)'; }}
          />

          {mode === 'login' && (
            <>
              <label style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 500,
                color: 'var(--ts)',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '5px',
              }}>
                Contrasena
              </label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                required
                autoComplete="current-password"
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
                  marginBottom: '8px',
                  transition: 'border-color 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { e.target.style.borderColor = 'var(--ac)'; }}
                onBlur={e => { e.target.style.borderColor = error ? 'var(--rd)' : 'var(--bo)'; }}
              />
              <button
                type="button"
                onClick={() => { setMode('reset'); setError(''); setPassword(''); }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--ac)',
                  padding: 0,
                  margin: '0 0 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Olvidaste tu contrasena?
              </button>
            </>
          )}

          {error || queryError ? (
            <p style={{
              fontSize: '12px',
              color: 'var(--rd)',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              <span>⚠</span> {error || (queryError ? (ERROR_MSG[queryError] ?? 'Error desconocido.') : 'Error desconocido.')}
            </p>
          ) : null}
          {!error && queryStatus && (
            <p style={{
              fontSize: '12px',
              color: 'var(--tl)',
              marginBottom: '10px',
            }}>
              {queryStatus}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || (mode === 'login' && !password)}
            style={{
              width: '100%',
              background: loading || !email.trim() || (mode === 'login' && !password) ? '#ccc' : 'var(--ac)',
              color: '#fff',
              border: 'none',
              borderRadius: '9px',
              padding: '12px',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '14px',
              fontWeight: 600,
              cursor: loading || !email.trim() || (mode === 'login' && !password) ? 'default' : 'pointer',
              transition: 'background 0.15s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: '14px', height: '14px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'spin 0.7s linear infinite',
                }} />
                {mode === 'login' ? 'Ingresando...' : 'Enviando...'}
              </>
            ) : mode === 'login' ? 'Ingresar' : 'Enviar enlace'}
          </button>
        </form>

        {mode === 'reset' && (
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); }}
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
        )}

        <p style={{
          fontSize: '11px',
          color: 'var(--ts)',
          textAlign: 'center',
          marginTop: '20px',
        }}>
          Sistema interno · Cerveceria Kunstmann
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input { box-sizing: border-box; }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <p style={{ color: 'var(--ts)' }}>Cargando...</p>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
