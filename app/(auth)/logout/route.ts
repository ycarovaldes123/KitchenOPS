import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { SUPABASE_URL } from '@/lib/supabase-public';

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(
    new URL('/login', SUPABASE_URL.replace('supabase.co', 'vercel.app') ?? 'http://localhost:3000'),
    { status: 302 }
  );
}

export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/login`);
}
