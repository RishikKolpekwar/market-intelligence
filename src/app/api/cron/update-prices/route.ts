import { NextResponse } from 'next/server';
import { updateAllAssetPrices } from '@/lib/market-data/price-service';
import { createServerClient } from '@/lib/supabase/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/cron/update-prices
 * Updates prices for all active assets
 * Scheduled to run every hour during market hours
 */
export async function POST(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const startTime = Date.now();

  try {
    // Update all asset prices
    const result = await updateAllAssetPrices();

    // Log the result
    await supabase.from('ingestion_log').insert({
      source_name: 'price_update',
      status: result.failed === 0 ? 'success' : 'partial',
      items_fetched: result.updated + result.failed,
      items_stored: result.updated,
      duration_ms: Date.now() - startTime,
      error_message: result.errors.length > 0 ? result.errors.join('; ') : null,
    });

    return NextResponse.json({
      success: true,
      updated: result.updated,
      failed: result.failed,
      errors: result.errors.slice(0, 10), // Limit errors returned
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await supabase.from('ingestion_log').insert({
      source_name: 'price_update',
      status: 'failed',
      items_fetched: 0,
      items_stored: 0,
      duration_ms: Date.now() - startTime,
      error_message: errorMessage,
    });

    console.error('Price update error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// Support GET for manual testing
export async function GET(request: Request) {
  return POST(request);
}
