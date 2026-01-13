/**
 * Price Update Service
 * Fetches and stores daily price snapshots for tracked assets
 */

import { createServerClient } from "@/lib/supabase/client";
import { getMultipleQuotes, getYahooMonthYearChanges } from "./symbol-lookup";
import { getEvEbitda, getNextEarningsDate } from "@/lib/financial-data/fmp";

const BRIEFING_TZ = "America/New_York";

function getEtDateStringYYYYMMDD(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRIEFING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const m: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;

  return `${m.year}-${m.month}-${m.day}`;
}

/**
 * Update prices for all active assets
 */
export async function updateAllAssetPrices(): Promise<{
  updated: number;
  failed: number;
  errors: string[];
}> {
  const supabase = createServerClient();
  const errors: string[] = [];
  let updated = 0;
  let failed = 0;

  const { data: assets } = await supabase
    .from("assets")
    .select("id, symbol")
    .eq("is_active", true);

  if (!assets || assets.length === 0) {
    return { updated: 0, failed: 0, errors: [] };
  }

  const symbols = assets.map((a: any) => a.symbol);
  const quotes = await getMultipleQuotes(symbols);

  const snapshotDate = getEtDateStringYYYYMMDD();

  for (const asset of assets as any[]) {
    const quote = quotes.get(asset.symbol);

    if (!quote || quote.currentPrice == null) {
      failed++;
      errors.push(`No quote data for ${asset.symbol}`);
      continue;
    }

    try {
      // Update current asset fields
      await supabase
        .from("assets")
        .update({
          current_price: quote.currentPrice,
          previous_close: quote.previousClose,
          price_change_24h: quote.change,
          price_change_pct_24h: quote.changePercent,
          day_high: quote.dayHigh,
          day_low: quote.dayLow,
          week_52_high: quote.week52High,
          week_52_low: quote.week52Low,
          volume: quote.volume,
          market_cap: quote.marketCap,
          nav: quote.nav,
          nav_change: quote.navChange,
          last_price_update: new Date().toISOString(),
        })
        .eq("id", asset.id);

      // Historical 1M / 1Y computed from Yahoo closes (null if missing)
      const hist = await getYahooMonthYearChanges(asset.symbol, quote.currentPrice);

      // Store daily snapshot
      await supabase
        .from("asset_price_history")
        .upsert(
          {
            asset_id: asset.id,
            snapshot_date: snapshotDate,

            // If you don’t have true open, don’t fake it—leave null.
            open_price: null,
            high_price: quote.dayHigh,
            low_price: quote.dayLow,
            close_price: quote.currentPrice,
            volume: quote.volume,
            nav: quote.nav,

            change_amount: quote.change,
            change_percent: quote.changePercent,

            // OPTIONAL: if your table has these columns, keep them
            // month_ago_close: hist.monthAgoClose,
            // year_ago_close: hist.yearAgoClose,
            // month_change: hist.monthChange,
            // month_change_pct: hist.monthChangePct,
            // year_change: hist.yearChange,
            // year_change_pct: hist.yearChangePct,
          },
          { onConflict: "asset_id,snapshot_date" }
        );

      updated++;
    } catch (error: any) {
      failed++;
      errors.push(`Failed to update ${asset.symbol}: ${error?.message || String(error)}`);
    }
  }

  return { updated, failed, errors };
}

/**
 * Update prices for a specific user's tracked assets
 */
export async function updateUserAssetPrices(userId: string): Promise<void> {
  const supabase = createServerClient();

  const { data: userAssets } = await supabase
    .from("user_assets")
    .select("assets!inner(id, symbol)")
    .eq("user_id", userId);

  if (!userAssets || userAssets.length === 0) return;

  const symbols = userAssets.map((ua: any) => ua.assets.symbol);
  const quotes = await getMultipleQuotes(symbols);

  for (const ua of userAssets as any[]) {
    const asset = ua.assets;
    const quote = quotes.get(asset.symbol);
    if (!quote) continue;

    await supabase
      .from("assets")
      .update({
        current_price: quote.currentPrice,
        previous_close: quote.previousClose,
        price_change_24h: quote.change,
        price_change_pct_24h: quote.changePercent,
        day_high: quote.dayHigh,
        day_low: quote.dayLow,
        week_52_high: quote.week52High,
        week_52_low: quote.week52Low,
        volume: quote.volume,
        last_price_update: new Date().toISOString(),
      })
      .eq("id", asset.id);
  }
}

/**
 * Get price history for an asset
 */
export async function getAssetPriceHistory(
  assetId: string,
  days: number = 30
): Promise<
  {
    date: string;
    close: number;
    change: number;
    changePercent: number;
  }[]
> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from("asset_price_history")
    .select("snapshot_date, close_price, change_amount, change_percent")
    .eq("asset_id", assetId)
    .order("snapshot_date", { ascending: false })
    .limit(days);

  return (data || []).map((d: any) => ({
    date: d.snapshot_date,
    close: d.close_price || 0,
    change: d.change_amount || 0,
    changePercent: d.change_percent || 0,
  }));
}

/**
 * Fetch valuation metrics (EV/EBITDA) via FMP
 */
export async function fetchValuationMetrics(symbol: string) {
  try {
    const evEbitda = await getEvEbitda(symbol);
    return evEbitda !== null ? { evEbitda } : null;
  } catch {
    return null;
  }
}

/**
 * Fetch next earnings date via FMP
 */
export async function fetchEarningsDate(symbol: string) {
  try {
    return await getNextEarningsDate(symbol);
  } catch {
    return null;
  }
}
