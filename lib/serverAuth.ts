import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

// Server-only: checks that the caller is a signed-in user before spending USDA quota
export async function requireUser(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? '';
  if (!token) return null;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await supabase.auth.getUser(token);
  return data.user ?? null;
}
