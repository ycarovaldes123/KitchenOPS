import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const supa = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

const { data, error } = await supa
  .from('responsables')
  .upsert(
    { nombre: 'SANDRA', email: 'chefstorobayo@cerveceriakunstmann.cl', rol: 'PASTELERIA', color_hex: '#06B6D4', iniciales: 'SA', activo: true },
    { onConflict: 'nombre' },
  )
  .select();

if (error) { console.error(error); process.exit(1); }
console.log('OK:', data);
