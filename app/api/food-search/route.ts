import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { mapUsdaFood } from '@/lib/usda';

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.USDA_API_KEY) return NextResponse.json({ error: 'USDA_API_KEY is not set on the server' }, { status: 500 });

  const q = req.nextUrl.searchParams.get('q')?.trim().slice(0, 100) ?? '';
  if (q.length < 2) return NextResponse.json({ foods: [] });
  const dataType = req.nextUrl.searchParams.get('type') === 'branded' ? ['Branded'] : ['Foundation', 'SR Legacy'];

  try {
    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${process.env.USDA_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, dataType, pageSize: 25 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return NextResponse.json({ error: 'Food search is unavailable right now' }, { status: 502 });
    const json = await res.json();
    const foods = (json.foods ?? []).map(mapUsdaFood).filter(Boolean);
    return NextResponse.json({ foods });
  } catch {
    return NextResponse.json({ error: 'Food search timed out. Try again.' }, { status: 504 });
  }
}
