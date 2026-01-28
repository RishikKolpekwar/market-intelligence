/**
 * Symbol Lookup + Quotes (Yahoo-first, Finnhub fallback)
 * Also exposes Yahoo historical close helpers for 1M / 1Y changes.
 */

import { createServerClient, createAdminClient } from "@/lib/supabase/client";
import { generateAssetKeywords } from "@/lib/utils/asset-type-detector";

export interface SymbolLookupResult {
  symbol: string;
  name: string;
  type: "stock" | "etf" | "mutual_fund" | "crypto" | "index";
  exchange?: string;
  currency?: string;
  country?: string;
  confidence: number;
}

export interface SymbolQuote {
  symbol: string;
  name: string;
  type: "stock" | "etf" | "mutual_fund" | "crypto" | "index";
  exchange?: string;
  sector?: string;

  currentPrice: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;

  dayHigh: number | null;
  dayLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  volume: number | null;
  marketCap?: number | null;

  // Optional extras
  nav?: number | null;
  navChange?: number | null;
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

/** -----------------------
 *  Small helpers
 * ----------------------*/
function safeNum(x: any): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function computeChange(currentPrice: number | null, previousClose: number | null) {
  if (currentPrice == null || previousClose == null || previousClose === 0) {
    return { change: null, changePercent: null };
  }
  const change = currentPrice - previousClose;
  const changePercent = (change / previousClose) * 100;
  return { change, changePercent };
}

function inferAssetType(
  symbol: string,
  metadata?: any
): "stock" | "etf" | "mutual_fund" | "crypto" | "index" {
  const upper = symbol.toUpperCase();

  // Mutual funds commonly 5 letters ending with X: FCNTX, FXAIX, VFIAX
  if (/^[A-Z]{4}X$/.test(upper)) return "mutual_fund";
  if (/^\^/.test(upper) || /^\./.test(upper)) return "index";
  if (/-USD$/.test(upper) || ["BTC", "ETH", "DOGE", "SOL", "ADA"].some(p => upper.startsWith(p))) return "crypto";

  // ETF heuristics
  if (
    ["SPY","QQQ","IWM","DIA","VTI","VOO","VEA","IVV","AGG","BND","GLD","SLV","USO"].includes(upper) ||
    /^XL[A-Z]$/.test(upper) ||
    /^I[A-Z]{2,3}$/.test(upper) ||
    /^V[A-Z]{2,3}$/.test(upper)
  ) return "etf";

  // Metadata hint
  const mt = String(metadata?.quoteType || metadata?.type || "").toLowerCase();
  if (mt.includes("etf")) return "etf";
  if (mt.includes("mutual")) return "mutual_fund";
  if (mt.includes("crypto")) return "crypto";
  if (mt.includes("index")) return "index";

  return "stock";
}

/** -----------------------
 *  Yahoo: quote
 * ----------------------*/
async function fetchYahooQuote(symbol: string): Promise<SymbolQuote | null> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;

  const json = await res.json();
  const q = json?.quoteResponse?.result?.[0];
  if (!q) return null;

  const currentPrice =
    safeNum(q?.regularMarketPrice) ??
    safeNum(q?.postMarketPrice) ??
    safeNum(q?.preMarketPrice);

  const previousClose = safeNum(q?.regularMarketPreviousClose);

  const { change, changePercent } = computeChange(currentPrice, previousClose);

  const type = inferAssetType(symbol, q);

  return {
    symbol,
    name: q?.longName || q?.shortName || symbol,
    type,
    exchange: q?.fullExchangeName || q?.exchange || undefined,
    sector: undefined,

    currentPrice,
    previousClose,
    change,
    changePercent,

    dayHigh: safeNum(q?.regularMarketDayHigh),
    dayLow: safeNum(q?.regularMarketDayLow),
    week52High: safeNum(q?.fiftyTwoWeekHigh),
    week52Low: safeNum(q?.fiftyTwoWeekLow),
    volume: safeNum(q?.regularMarketVolume),
    marketCap: safeNum(q?.marketCap),

    nav: safeNum(q?.navPrice) ?? null,
    navChange: null,
  };
}

/** -----------------------
 *  Yahoo: historical closes (chart API)
 *  Returns array of {ts, close}
 * ----------------------*/
type YahooClosePoint = { ts: number; close: number };

async function fetchYahooDailyCloses(symbol: string, range: "1y" | "6mo" | "3mo" = "1y"): Promise<YahooClosePoint[] | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false&events=div%7Csplit`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;

  const timestamps: number[] = result.timestamp || [];
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || [];
  if (!timestamps.length || !closes.length) return null;

  const pts: YahooClosePoint[] = [];
  for (let i = 0; i < Math.min(timestamps.length, closes.length); i++) {
    const c = closes[i];
    if (typeof c === "number" && Number.isFinite(c)) {
      pts.push({ ts: timestamps[i], close: c });
    }
  }
  return pts.length ? pts : null;
}

/**
 * Get the close for the closest trading day ON OR BEFORE targetDate (UTC date).
 * If none found, returns null.
 */
export async function getYahooCloseOnOrBefore(symbol: string, targetDate: Date): Promise<number | null> {
  const pts = await fetchYahooDailyCloses(symbol, "1y");
  if (!pts) return null;

  const targetTs = Math.floor(targetDate.getTime() / 1000);

  // Yahoo timestamps are seconds at market close-ish. We want the last <= target.
  let best: YahooClosePoint | null = null;
  for (const p of pts) {
    if (p.ts <= targetTs) best = p;
    else break; // pts are chronological
  }

  // If chart points come unsorted (rare), sort once:
  if (!best) {
    const sorted = [...pts].sort((a, b) => a.ts - b.ts);
    for (const p of sorted) {
      if (p.ts <= targetTs) best = p;
      else break;
    }
  }

  return best ? best.close : null;
}

/**
 * Convenience: compute 1M/1Y change vs historical closes.
 * Uses 30d and 364d lookbacks, trading-day aware via "on or before".
 * Note: 364 days (not 365) to ensure we stay within Yahoo's 1-year data range.
 */
export async function getYahooMonthYearChanges(symbol: string, currentPrice: number | null): Promise<{
  monthChange: number | null;
  monthChangePct: number | null;
  yearChange: number | null;
  yearChangePct: number | null;
  monthAgoClose: number | null;
  yearAgoClose: number | null;
}> {
  if (currentPrice == null) {
    return {
      monthChange: null, monthChangePct: null,
      yearChange: null, yearChangePct: null,
      monthAgoClose: null, yearAgoClose: null
    };
  }

  const now = new Date();
  const monthTarget = new Date(now);
  monthTarget.setDate(monthTarget.getDate() - 30);

  // Use 364 days instead of 365 to stay within Yahoo's 1-year data range
  const yearTarget = new Date(now);
  yearTarget.setDate(yearTarget.getDate() - 364);

  const monthAgoClose = await getYahooCloseOnOrBefore(symbol, monthTarget);
  const yearAgoClose = await getYahooCloseOnOrBefore(symbol, yearTarget);

  const monthChange = monthAgoClose != null ? (currentPrice - monthAgoClose) : null;
  const monthChangePct = (monthAgoClose != null && monthAgoClose !== 0) ? (monthChange! / monthAgoClose) * 100 : null;

  const yearChange = yearAgoClose != null ? (currentPrice - yearAgoClose) : null;
  const yearChangePct = (yearAgoClose != null && yearAgoClose !== 0) ? (yearChange! / yearAgoClose) * 100 : null;

  return { monthChange, monthChangePct, yearChange, yearChangePct, monthAgoClose, yearAgoClose };
}

/** -----------------------
 *  Finnhub fallback: quote + profile
 * ----------------------*/
async function fetchFinnhubQuote(symbol: string): Promise<SymbolQuote | null> {
  if (!FINNHUB_API_KEY) return null;

  const quoteRes = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`,
    { cache: "no-store" }
  );
  if (!quoteRes.ok) return null;
  const quote = await quoteRes.json();

  const profileRes = await fetch(
    `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`,
    { cache: "no-store" }
  );
  const profile = profileRes.ok ? await profileRes.json() : {};

  const currentPrice = safeNum(quote?.c);
  const previousClose = safeNum(quote?.pc);
  const { change, changePercent } = computeChange(currentPrice, previousClose);

  const type = inferAssetType(symbol, profile);

  return {
    symbol,
    name: profile?.name || symbol,
    type,
    exchange: profile?.exchange || undefined,
    sector: profile?.finnhubIndustry || undefined,

    currentPrice,
    previousClose,
    change,
    changePercent,

    dayHigh: safeNum(quote?.h),
    dayLow: safeNum(quote?.l),
    week52High: safeNum(profile?.week52High) ?? safeNum(quote?.h),
    week52Low: safeNum(profile?.week52Low) ?? safeNum(quote?.l),
    volume: safeNum(quote?.v),
    marketCap: profile?.marketCapitalization ? profile.marketCapitalization * 1_000_000 : null,

    nav: null,
    navChange: null,
  };
}

/** Coerce to integer for DB columns like BIGINT (market_cap, volume) */
function toBigIntSafe(value: number | null | undefined): number | null {
  if (value == null || typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function quoteLooksBad(q: SymbolQuote): boolean {
  // If missing key fields, bad
  if (q.currentPrice == null || q.previousClose == null) return true;
  // If absurd daily move, likely bad mapping
  if (q.changePercent != null && Math.abs(q.changePercent) > 40) return true;
  // If prev close is 0 but current nonzero, bad
  if (q.previousClose === 0 && q.currentPrice !== 0) return true;
  return false;
}

/**
 * Public: get full quote data for a symbol (Yahoo-first, Finnhub fallback)
 */
export async function getSymbolQuote(symbol: string): Promise<SymbolQuote | null> {
  // 1) Yahoo first
  const y = await fetchYahooQuote(symbol);
  if (y && !quoteLooksBad(y)) return y;

  // 2) Finnhub fallback
  const f = await fetchFinnhubQuote(symbol);
  if (f && !quoteLooksBad(f)) return f;

  // 3) if Yahoo existed but “bad”, still return it rather than null
  if (y) return y;

  return f;
}

/**
 * Get quotes for multiple symbols
 */
export async function getMultipleQuotes(symbols: string[]): Promise<Map<string, SymbolQuote>> {
  const quotes = new Map<string, SymbolQuote>();

  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);

    const results = await Promise.all(batch.map((s) => getSymbolQuote(s)));

    results.forEach((quote, idx) => {
      if (quote) quotes.set(batch[idx], quote);
    });

    if (i + batchSize < symbols.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return quotes;
}

/**
 * Search symbols using Finnhub (unchanged behavior from your version)
 * If no Finnhub key, fallback to local DB.
 */
export async function searchSymbols(query: string): Promise<SymbolLookupResult[]> {
  if (!FINNHUB_API_KEY) return searchSymbolsFallback(query);

  const supabase = createServerClient();
  const { data: cached } = await (supabase
    .from("symbol_lookup_cache") as any)
    .select("results")
    .eq("query", query.toLowerCase())
    .eq("provider", "finnhub")
    .gt("expires_at", new Date().toISOString())
    .single();

  if (cached?.results) return cached.results as SymbolLookupResult[];

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${FINNHUB_API_KEY}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error(`Finnhub API error: ${res.status}`);
    const data = await res.json();

    const results: SymbolLookupResult[] = (data.result || [])
      .slice(0, 20)
      .map((item: any) => ({
        symbol: item.symbol,
        name: item.description,
        type: inferAssetType(item.symbol, item),
        exchange: item.displaySymbol?.split(":")[0],
        confidence: 0.8,
      }));

    await (supabase.from("symbol_lookup_cache") as any).upsert(
      {
        query: query.toLowerCase(),
        provider: "finnhub",
        results,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "query,provider" }
    );

    return results;
  } catch {
    return searchSymbolsFallback(query);
  }
}

async function searchSymbolsFallback(query: string): Promise<SymbolLookupResult[]> {
  const supabase = createServerClient();
  const { data: assets } = await supabase
    .from("assets")
    .select("symbol, name, asset_type, exchange")
    .or(`symbol.ilike.%${query}%,name.ilike.%${query}%`)
    .eq("is_active", true)
    .limit(20);

  return (assets || []).map((a: any) => ({
    symbol: a.symbol,
    name: a.name,
    type: a.asset_type,
    exchange: a.exchange || undefined,
    confidence: 1.0,
  }));
}

/**
 * Add or update an asset in the database with full metadata.
 * Uses admin client so server-side insert/update on assets bypasses RLS
 * (assets table has SELECT-only policy for anon).
 */
export async function upsertAssetWithQuote(
  symbol: string
): Promise<{ id: string; symbol: string; name: string; type: string } | null> {
  const supabase = createAdminClient();

  const { data: existing } = await (supabase
    .from("assets") as any)
    .select("id, symbol, name, asset_type")
    .eq("symbol", symbol.toUpperCase())
    .single();

  if (existing) {
    const quote = await getSymbolQuote(symbol);
    if (quote) {
      await (supabase
        .from("assets") as any)
        .update({
          current_price: quote.currentPrice,
          previous_close: quote.previousClose,
          price_change_24h: quote.change,
          price_change_pct_24h: quote.changePercent,
          day_high: quote.dayHigh,
          day_low: quote.dayLow,
          week_52_high: quote.week52High,
          week_52_low: quote.week52Low,
          volume: toBigIntSafe(quote.volume),
          market_cap: toBigIntSafe(quote.marketCap),
          nav: quote.nav,
          nav_change: quote.navChange,
          last_price_update: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }

    return { id: existing.id, symbol: existing.symbol, name: existing.name, type: existing.asset_type };
  }

  const quote = await getSymbolQuote(symbol);
  if (!quote) {
    const type = inferAssetType(symbol);
    const keywords = generateAssetKeywords(symbol.toUpperCase(), symbol.toUpperCase(), type);

    const { data: newAsset, error: insertError } = await (supabase
      .from("assets") as any)
      .insert({
        symbol: symbol.toUpperCase(),
        name: symbol.toUpperCase(),
        asset_type: type,
        keywords,
      })
      .select("id, symbol, name, asset_type")
      .single();

    if (insertError) {
      console.error(`[upsertAssetWithQuote] Insert error for ${symbol}:`, insertError);
    }

    return newAsset
      ? { id: newAsset.id, symbol: newAsset.symbol, name: newAsset.name, type: newAsset.asset_type }
      : null;
  }

  const keywords = generateAssetKeywords(quote.symbol, quote.name, quote.type);

  const { data: newAsset, error: insertError } = await (supabase
    .from("assets") as any)
    .insert({
      symbol: quote.symbol.toUpperCase(),
      name: quote.name,
      asset_type: quote.type,
      exchange: quote.exchange,
      sector: quote.sector,
      current_price: quote.currentPrice,
      previous_close: quote.previousClose,
      price_change_24h: quote.change,
      price_change_pct_24h: quote.changePercent,
      day_high: quote.dayHigh,
      day_low: quote.dayLow,
      week_52_high: quote.week52High,
      week_52_low: quote.week52Low,
      volume: toBigIntSafe(quote.volume),
      market_cap: toBigIntSafe(quote.marketCap),
      nav: quote.nav,
      nav_change: quote.navChange,
      keywords,
      last_price_update: new Date().toISOString(),
    })
    .select("id, symbol, name, asset_type")
    .single();

  if (insertError) {
    console.error(`[upsertAssetWithQuote] Insert error for ${symbol} with quote:`, insertError);
  }

  return newAsset
    ? { id: newAsset.id, symbol: newAsset.symbol, name: newAsset.name, type: newAsset.asset_type }
    : null;
}
