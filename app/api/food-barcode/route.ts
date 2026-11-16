import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { mapUsdaFood } from '@/lib/usda';
import { cleanCode, mapOffProduct, sameCode, validBarcode } from '@/lib/barcode';

// Open Food Facts asks every app to identify itself: AppName/Version (contact email)
const OFF_USER_AGENT = process.env.OFF_USER_AGENT ?? 'Macrocoach/1.0 (personal app)';

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const code = cleanCode(req.nextUrl.searchParams.get('code') ?? '');
  if (!validBarcode(code)) return NextResponse.json({ error: 'That is not a valid barcode number' }, { status: 400 });

  // 1. USDA branded foods: search by number, then keep only an exact barcode match
  try {
    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${process.env.USDA_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: code, dataType: ['Branded'], pageSize: 10 }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const json = await res.json();
      const hit = (json.foods ?? []).find((f: { gtinUpc?: string }) => f.gtinUpc && sameCode(f.gtinUpc, code));
      const food = hit ? mapUsdaFood(hit) : null;
      if (food) return NextResponse.json({ food: { ...food, barcode: code } });
    }
  } catch {
    /* fall through to Open Food Facts */
  }

  // 2. Open Food Facts fallback (community data: check it against the label)
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments,serving_quantity,serving_size`,
      { headers: { 'User-Agent': OFF_USER_AGENT }, signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) {
      const json = await res.json();
      const food = json.status === 1 ? mapOffProduct(code, json.product) : null;
      if (food) return NextResponse.json({ food });
    }
  } catch {
    /* not found */
  }

  return NextResponse.json({ food: null });
}
