import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchEarningsDate } from "@/lib/market-data/price-service";
import {
  getYahooQuote,
  getYahooKeyStats,
  calculateYahooHistoricalChanges
} from "@/lib/financial-data/yahoo-finance";
import { getQuote as getTwelveDataQuote } from "@/lib/financial-data/twelve-data";
import { getGlobalQuote as getAlphaVantageQuote } from "@/lib/financial-data/alpha-vantage";
import { getPreviousClose as getPolygonQuote } from "@/lib/financial-data/polygon";
import { getSymbolQuote as getFinnhubQuote } from "@/lib/market-data/symbol-lookup";

// Staleness thresholds
const PRICE_STALE_MS = 60 * 60 * 1000; // 1 hour
const HISTORY_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours
const FUNDAMENTALS_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Check if data is missing (null/undefined/0 for numeric fields)
 */
function isDataMissing(asset: any, fields: string[]): boolean {
  for (const field of fields) {
    const value = asset[field];
    if (value === null || value === undefined) return true;
    if (typeof value === 'number' && value === 0 && ['week_52_high', 'week_52_low'].includes(field)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if 52-week data looks suspicious (likely incorrect daily high/low was saved)
 * Returns true if the data needs re-fetching
 */
function is52WeekDataSuspicious(asset: any): boolean {
  const high = asset.week_52_high;
  const low = asset.week_52_low;
  const price = asset.current_price;
  
  // If either is missing, needs refetch
  if (!high || !low || !price) return true;
  
  // If high and low are within 5% of each other, it's probably wrong (daily range saved instead of 52-week)
  const rangePercent = ((high - low) / low) * 100;
  if (rangePercent < 5) {
    console.log(`[Sync] 52-week range looks suspicious (only ${rangePercent.toFixed(1)}% range)`);
    return true;
  }
  
  // If price is outside the 52-week range (with 5% buffer), data is likely stale
  if (price > high * 1.05 || price < low * 0.95) {
    console.log(`[Sync] Price $${price} outside 52-week range ($${low} - $${high})`);
    return true;
  }
  
  return false;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return NextResponse.json({ success: false, error: "Missing token" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const user = userRes.user;
  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get("portfolio_id");
  const forceRefresh = searchParams.get("force") === "true";

  try {
    // 1. Get user's tracked assets
    let query = supabase
      .from('user_assets')
      .select('assets!inner(*)')
      .eq('user_id', user.id);

    if (portfolioId) {
      query = query.eq('portfolio_id', portfolioId);
    }

    const { data: userAssets, error: assetsErr } = await query;
    if (assetsErr) throw assetsErr;

    const assets = userAssets.map((ua: any) => ua.assets);
    const results = {
      prices: 0,
      history: 0,
      fundamentals: 0,
      totalAssets: assets.length
    };

    const now = new Date();

    // 2. Iterate and sync each asset
    for (const asset of assets) {
      const updates: any = {};
      const symbol = asset.symbol;

      console.log(`[Sync] Processing ${symbol}...`);

      // Check staleness AND missing data AND suspicious 52-week range
      const priceTimestampStale = !asset.prices_updated_at || (now.getTime() - new Date(asset.prices_updated_at).getTime() > PRICE_STALE_MS);
      const priceDataMissing = isDataMissing(asset, ['current_price', 'week_52_high', 'week_52_low']);
      const week52Suspicious = is52WeekDataSuspicious(asset);
      const pricesStale = forceRefresh || priceTimestampStale || priceDataMissing || week52Suspicious;
      
      const historyTimestampStale = !asset.history_updated_at || (now.getTime() - new Date(asset.history_updated_at).getTime() > HISTORY_STALE_MS);
      const historyDataMissing = isDataMissing(asset, ['month_change', 'year_change']);
      const historyStale = forceRefresh || historyTimestampStale || historyDataMissing;
      
      const fundamentalsTimestampStale = !asset.fundamentals_updated_at || (now.getTime() - new Date(asset.fundamentals_updated_at).getTime() > FUNDAMENTALS_STALE_MS);
      const fundamentalsDataMissing = isDataMissing(asset, ['ev_ebitda', 'next_earnings_date']);
      const fundamentalsStale = forceRefresh || fundamentalsTimestampStale || fundamentalsDataMissing;

      // ============================================================
      // PRICES + 52-WEEK: Yahoo Finance first, then fallback to other APIs
      // ============================================================
      if (pricesStale) {
        let pricesFetched = false;
        
        // 1️⃣ TRY YAHOO FINANCE FIRST (most accurate for 52-week)
        console.log(`[Sync] ${symbol}: Trying Yahoo Finance...`);
        try {
          const yahooQuote = await getYahooQuote(symbol);
          if (yahooQuote && yahooQuote.price > 0) {
            updates.current_price = yahooQuote.price;
            updates.previous_close = yahooQuote.previousClose;
            updates.price_change_24h = yahooQuote.change;
            updates.price_change_pct_24h = yahooQuote.changePercent;
            updates.day_high = yahooQuote.high;
            updates.day_low = yahooQuote.low;
            updates.week_52_high = yahooQuote.week52High;
            updates.week_52_low = yahooQuote.week52Low;
            pricesFetched = true;
            console.log(`[Sync] ${symbol}: ✅ Yahoo: $${yahooQuote.price.toFixed(2)}, 52W: $${yahooQuote.week52Low.toFixed(2)} - $${yahooQuote.week52High.toFixed(2)}`);
          }
        } catch (err) {
          console.warn(`[Sync] ${symbol}: Yahoo failed, trying Twelve Data...`);
        }
        
        // 2️⃣ FALLBACK: Twelve Data
        if (!pricesFetched) {
          try {
            const twelveQuote = await getTwelveDataQuote(symbol);
            if (twelveQuote && twelveQuote.close) {
              updates.current_price = parseFloat(twelveQuote.close);
              updates.previous_close = parseFloat(twelveQuote.previous_close);
              updates.price_change_24h = parseFloat(twelveQuote.change);
              updates.price_change_pct_24h = parseFloat(twelveQuote.percent_change);
              if (twelveQuote.fifty_two_week) {
                updates.week_52_high = parseFloat(twelveQuote.fifty_two_week.high);
                updates.week_52_low = parseFloat(twelveQuote.fifty_two_week.low);
              }
              pricesFetched = true;
              console.log(`[Sync] ${symbol}: ✅ Twelve Data: $${updates.current_price}`);
            }
          } catch (err) {
            console.warn(`[Sync] ${symbol}: Twelve Data failed, trying Alpha Vantage...`);
          }
        }
        
        // 3️⃣ FALLBACK: Alpha Vantage
        if (!pricesFetched) {
          try {
            const avQuote = await getAlphaVantageQuote(symbol);
            if (avQuote && avQuote.price > 0) {
              updates.current_price = avQuote.price;
              updates.previous_close = avQuote.previousClose;
              updates.price_change_24h = avQuote.change;
              updates.price_change_pct_24h = avQuote.changePercent;
              updates.day_high = avQuote.high;
              updates.day_low = avQuote.low;
              pricesFetched = true;
              console.log(`[Sync] ${symbol}: ✅ Alpha Vantage: $${avQuote.price}`);
            }
          } catch (err) {
            console.warn(`[Sync] ${symbol}: Alpha Vantage failed, trying Polygon...`);
          }
        }
        
        // 4️⃣ FALLBACK: Polygon
        if (!pricesFetched) {
          try {
            const polygonQuote = await getPolygonQuote(symbol);
            if (polygonQuote && polygonQuote.price > 0) {
              updates.current_price = polygonQuote.price;
              updates.previous_close = polygonQuote.previousClose;
              updates.price_change_24h = polygonQuote.change;
              updates.price_change_pct_24h = polygonQuote.changePercent;
              updates.day_high = polygonQuote.high;
              updates.day_low = polygonQuote.low;
              pricesFetched = true;
              console.log(`[Sync] ${symbol}: ✅ Polygon: $${polygonQuote.price}`);
            }
          } catch (err) {
            console.warn(`[Sync] ${symbol}: Polygon failed, trying Finnhub...`);
          }
        }
        
        // 5️⃣ LAST RESORT: Finnhub
        if (!pricesFetched) {
          try {
            const finnhubQuote = await getFinnhubQuote(symbol);
            if (finnhubQuote) {
              if((finnhubQuote.currentPrice ?? 0) > 0){
                updates.current_price = finnhubQuote.currentPrice;
                updates.previous_close = finnhubQuote.previousClose;
                updates.price_change_24h = finnhubQuote.change;
                updates.price_change_pct_24h = finnhubQuote.changePercent;
                updates.day_high = finnhubQuote.dayHigh;
                updates.day_low = finnhubQuote.dayLow;
                pricesFetched = true;
                console.log(`[Sync] ${symbol}: ✅ Finnhub: $${finnhubQuote.currentPrice}`);
              }
            }
          } catch (err) {
            console.error(`[Sync] ${symbol}: ❌ All price APIs failed`);
          }
        }
        
        // CONSISTENCY CHECK: Recalculate change values from current_price and previous_close
        // This ensures Day $ and Day % always match the displayed prices
        if (pricesFetched && updates.current_price && updates.previous_close) {
          updates.price_change_24h = updates.current_price - updates.previous_close;
          updates.price_change_pct_24h = (updates.price_change_24h / updates.previous_close) * 100;
          console.log(`[Sync] ${symbol}: 📊 Recalculated change: $${updates.price_change_24h.toFixed(2)} (${updates.price_change_pct_24h.toFixed(2)}%)`);
        }

        if (pricesFetched) {
          updates.prices_updated_at = now.toISOString();
          results.prices++;
        }
      }

      // ============================================================
      // HISTORICAL CHANGES: Yahoo Finance first, then fallback
      // ============================================================
        if (historyStale) {
        const currentPrice = updates.current_price || asset.current_price;
        if (currentPrice) {
          let historyFetched = false;
          
          // 1️⃣ TRY YAHOO FINANCE FIRST
          console.log(`[Sync] ${symbol}: Trying Yahoo for history...`);
          try {
            const changes = await calculateYahooHistoricalChanges(symbol, currentPrice);
            if (changes && (changes.monthChange !== 0 || changes.yearChange !== 0)) {
              updates.month_change = changes.monthChange;
              updates.month_change_pct = changes.monthChangePct;
              updates.year_change = changes.yearChange;
              updates.year_change_pct = changes.yearChangePct;
              historyFetched = true;
              console.log(`[Sync] ${symbol}: ✅ Yahoo history: 1M=${changes.monthChangePct?.toFixed(2)}%, 1Y=${changes.yearChangePct?.toFixed(2)}%`);
            }
          } catch (err) {
            console.warn(`[Sync] ${symbol}: Yahoo history failed, trying Twelve Data...`);
          }
          
          
          if (historyFetched) {
            updates.history_updated_at = now.toISOString();
            results.history++;
          }
        }
      }

      // ============================================================
      // FUNDAMENTALS: Yahoo Finance for EV/EBITDA, FMP for Earnings
      // ============================================================
        if (fundamentalsStale) {
        console.log(`[Sync] ${symbol}: Fetching fundamentals...`);
        
        // 1️⃣ EV/EBITDA from Yahoo Finance (most reliable)
        let evEbitdaFetched = false;
        try {
          const yahooStats = await getYahooKeyStats(symbol);
          if (yahooStats && yahooStats.evEbitda !== null) {
            updates.ev_ebitda = yahooStats.evEbitda;
            evEbitdaFetched = true;
            console.log(`[Sync] ${symbol}: ✅ Yahoo EV/EBITDA = ${yahooStats.evEbitda.toFixed(2)}`);
          }
        } catch (err) {
          console.warn(`[Sync] ${symbol}: Yahoo key stats failed`);
        }
        
        // 2️⃣ Fallback: FMP for EV/EBITDA if Yahoo failed
        if (!evEbitdaFetched) {
          try {
            const { fetchValuationMetrics } = await import('@/lib/market-data/price-service');
            const metrics = await fetchValuationMetrics(symbol);
            if (metrics && metrics.evEbitda !== null) {
              updates.ev_ebitda = metrics.evEbitda;
              evEbitdaFetched = true;
              console.log(`[Sync] ${symbol}: ✅ FMP EV/EBITDA = ${metrics.evEbitda}`);
            }
          } catch (err) {
            console.warn(`[Sync] ${symbol}: FMP EV/EBITDA failed`);
          }
        }
        
        if (!evEbitdaFetched) {
          console.log(`[Sync] ${symbol}: No EV/EBITDA data available`);
        }
        
        // 3️⃣ Earnings date from FMP
        const earnings = await fetchEarningsDate(symbol);
        if (earnings) {
          updates.next_earnings_date = earnings;
          console.log(`[Sync] ${symbol}: ✅ Next earnings = ${earnings}`);
        } else {
          console.log(`[Sync] ${symbol}: No earnings date available`);
        }
        
        updates.fundamentals_updated_at = now.toISOString();
        results.fundamentals++;
      }

      // Save updates
      if (Object.keys(updates).length > 0) {
        console.log(`[Sync] ${symbol}: Saving ${Object.keys(updates).length} fields...`);
        const { data, error } = await supabase
          .from("assets")
          .update(updates)
          .eq("id", asset.id)
          .select("id");

        if (error) {
          console.error(`[Sync] ${symbol}: Update failed:`, error);
        } else {
          console.log(`[Sync] ${symbol}: ✅ Saved`);
        }
      }

      // Small delay to respect rate limits
      await new Promise(r => setTimeout(r, 200));
    }

    return NextResponse.json({ ok: true, updated: results });
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
