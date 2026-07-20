import { NextRequest, NextResponse } from 'next/server';
import { requireRol } from '@/lib/auth-server';
import { createServiceClient } from '@/utils/supabase/server';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function POST(req: NextRequest) {
  const s = await requireRol(['admin', 'finanzas']);
  if (!s.ok) return s.response;

  const formData = await req.formData();
  const file = formData.get('file');
  const plato = String(formData.get('plato') || 'plato').trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'El archivo debe ser una imagen' }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'La foto es demasiado pesada. Usa una imagen menor a 4 MB.' }, { status: 413 });
  }

  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'jpg';
  const safeName = `${Date.now()}-${slugify(plato || file.name)}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const supabase = await createServiceClient();
  const { error } = await supabase.storage
    .from('fotos-platos')
    .upload(safeName, bytes, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: true,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from('fotos-platos').getPublicUrl(safeName);
  return NextResponse.json({ url: data.publicUrl });
}
