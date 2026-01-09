/**
 * Symbol Lookup Service
 * Auto-detects asset type (stock/ETF/mutual fund) from ticker symbol
 * Uses Finnhub and Yahoo Finance APIs for metadata
 */

import { createServerClient } from '@/lib/supabase/client';

export interface SymbolLookupResult {
  symbol: string;
  name: string;
  type: 'stock' | 'etf' | 'mutual_fund' | 'crypto' | 'index';
  exchange?: string;
  currency?: string;
  country?: string;
  confidence: number; // 0-1, how confident we are in the type detection
}

export interface SymbolQuote {
  symbol: string;
  name: string;
  type: 'stock' | 'etf' | 'mutual_fund' | 'crypto' | 'index';
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  week52High: number;
  week52Low: number;
  volume: number;
  avgVolume?: number;
  marketCap?: number;
  peRatio?: number;
  dividendYield?: number;
  // Mutual fund specific
  nav?: number;
  navChange?: number;
  exchange?: string;
  sector?: string;
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

/**
 * Detect asset type from symbol patterns and metadata
 */
function inferAssetType(symbol: string, metadata?: any): 'stock' | 'etf' | 'mutual_fund' | 'crypto' | 'index' {
  const upperSymbol = symbol.toUpperCase();
  
  // Common ETF patterns
  const etfPatterns = [
    /^SPY$/, /^QQQ$/, /^IWM$/, /^DIA$/, /^VTI$/, /^VOO$/, /^VEA$/,
    /^IVV$/, /^AGG$/, /^BND$/, /^GLD$/, /^SLV$/, /^USO$/,
    /^XL[A-Z]$/, // Sector SPDRs (XLF, XLK, etc.)
    /^I[A-Z]{2,3}$/, // iShares pattern
    /^V[A-Z]{2,3}$/, // Vanguard pattern
  ];
  
  // Mutual fund patterns (typically 5 characters ending in X)
  const mutualFundPatterns = [
    /^[A-Z]{4}X$/, // Most mutual funds: VFIAX, FXAIX, etc.
    /^[A-Z]{3}[A-Z]{2}$/, // Some variations
  ];
  
  // Crypto patterns
  const cryptoPatterns = [
    /^BTC/, /^ETH/, /^DOGE/, /^SOL/, /^ADA/,
    /-USD$/, /-EUR$/, /-GBP$/,
  ];
  
  // Index patterns
  const indexPatterns = [
    /^\^/, // Starts with ^ (^GSPC, ^DJI, etc.)
    /^\./, // Starts with . (.DJI, etc.)
  ];
  
  // Check patterns
  if (indexPatterns.some(p => p.test(upperSymbol))) return 'index';
  if (cryptoPatterns.some(p => p.test(upperSymbol))) return 'crypto';
  if (mutualFundPatterns.some(p => p.test(upperSymbol))) return 'mutual_fund';
  if (etfPatterns.some(p => p.test(upperSymbol))) return 'etf';
  
  // Check metadata if available
  if (metadata?.type) {
    const typeStr = metadata.type.toLowerCase();
    if (typeStr.includes('etf') || typeStr.includes('exchange traded')) return 'etf';
    if (typeStr.includes('mutual') || typeStr.includes('fund')) return 'mutual_fund';
    if (typeStr.includes('crypto')) return 'crypto';
    if (typeStr.includes('index')) return 'index';
  }
  
  // Default to stock
  return 'stock';
}

/**
 * Search for symbols using Finnhub API
 */
export async function searchSymbols(query: string): Promise<SymbolLookupResult[]> {
  if (!FINNHUB_API_KEY) {
    console.warn('FINNHUB_API_KEY not configured, using fallback');
    return searchSymbolsFallback(query);
  }

  // Check cache first
  const supabase = createServerClient();
  const { data: cached } = await supabase
    .from('symbol_lookup_cache')
    .select('results')
    .eq('query', query.toLowerCase())
    .eq('provider', 'finnhub')
    .gt('expires_at', new Date().toISOString())
    .single();

  if (cached?.results) {
    return cached.results as SymbolLookupResult[];
  }

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${FINNHUB_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`);
    }

    const data = await response.json();
    
    const results: SymbolLookupResult[] = (data.result || [])
      .slice(0, 20)
      .map((item: any) => ({
        symbol: item.symbol,
        name: item.description,
        type: inferAssetType(item.symbol, item),
        exchange: item.displaySymbol?.split(':')[0],
        confidence: 0.8,
      }));

    // Cache the results for 24 hours
    await supabase.from('symbol_lookup_cache').upsert({
      query: query.toLowerCase(),
      provider: 'finnhub',
      results,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'query,provider' });

    return results;
  } catch (error) {
    console.error('Symbol search error:', error);
    return searchSymbolsFallback(query);
  }
}

/**
 * Fallback search using local database
 */
async function searchSymbolsFallback(query: string): Promise<SymbolLookupResult[]> {
  const supabase = createServerClient();
  
  const { data: assets } = await supabase
    .from('assets')
    .select('symbol, name, asset_type, exchange')
    .or(`symbol.ilike.%${query}%,name.ilike.%${query}%`)
    .eq('is_active', true)
    .limit(20);

  return (assets || []).map(a => ({
    symbol: a.symbol,
    name: a.name,
    type: a.asset_type as any,
    exchange: a.exchange || undefined,
    confidence: 1.0, // High confidence since it's from our DB
  }));
}

/**
 * Get full quote data for a symbol
 */
export async function getSymbolQuote(symbol: string): Promise<SymbolQuote | null> {
  if (!FINNHUB_API_KEY) {
    console.warn('FINNHUB_API_KEY not configured');
    return null;
  }

  try {
    // Fetch quote data
    const quoteResponse = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`
    );

    if (!quoteResponse.ok) {
      throw new Error(`Quote API error: ${quoteResponse.status}`);
    }

    const quote = await quoteResponse.json();

    // Fetch profile for additional metadata
    const profileResponse = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`
    );

    let profile: any = {};
    if (profileResponse.ok) {
      profile = await profileResponse.json();
    }

    // Detect type
    const type = inferAssetType(symbol, profile);

    return {
      symbol,
      name: profile.name || symbol,
      type,
      currentPrice: quote.c || 0,
      previousClose: quote.pc || 0,
      change: quote.d || 0,
      changePercent: quote.dp || 0,
      dayHigh: quote.h || 0,
      dayLow: quote.l || 0,
      week52High: profile.week52High || quote.h || 0,
      week52Low: profile.week52Low || quote.l || 0,
      volume: quote.v || 0,
      marketCap: profile.marketCapitalization ? profile.marketCapitalization * 1000000 : undefined,
      exchange: profile.exchange,
      sector: profile.finnhubIndustry,
    };
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get quotes for multiple symbols
 */
export async function getMultipleQuotes(symbols: string[]): Promise<Map<string, SymbolQuote>> {
  const quotes = new Map<string, SymbolQuote>();
  
  // Process in batches to respect rate limits
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    
    const results = await Promise.all(
      batch.map(symbol => getSymbolQuote(symbol))
    );
    
    results.forEach((quote, index) => {
      if (quote) {
        quotes.set(batch[index], quote);
      }
    });
    
    // Small delay between batches
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return quotes;
}

/**
 * Add or update an asset in the database with full metadata
 */
export async function upsertAssetWithQuote(symbol: string): Promise<{ id: string; symbol: string; name: string; type: string } | null> {
  const supabase = createServerClient();
  console.log('upsertAssetWithQuote called for symbol:', symbol); // Debug log
  // First check if we already have this asset
  const { data: existing, error: existingError } = await supabase
    .from('assets')
    .select('id, symbol, name, asset_type')
    .eq('symbol', symbol.toUpperCase())
    .single();
  if (existingError) {
    console.error('Error querying assets table:', existingError);
  }
  if (existing) {
    console.log('Asset already exists:', existing);
    // Update with latest price data
    const quote = await getSymbolQuote(symbol);
    if (quote) {
      await supabase
        .from('assets')
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
          last_price_update: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }
    return {
      id: existing.id,
      symbol: existing.symbol,
      name: existing.name,
      type: existing.asset_type,
    };
  }
  // Fetch full quote data for new asset
  const quote = await getSymbolQuote(symbol);
  console.log('Quote for symbol:', symbol, quote); // Debug log
  if (!quote) {
    console.warn('No quote data for symbol:', symbol);
    // Couldn't get quote data, create minimal entry
    const type = inferAssetType(symbol);
    const { data: newAsset, error: insertError } = await supabase
      .from('assets')
      .insert({
        symbol: symbol.toUpperCase(),
        name: symbol.toUpperCase(),
        asset_type: type,
        keywords: [symbol.toUpperCase()],
      })
      .select('id, symbol, name, asset_type')
      .single();
    if (insertError) {
      console.error('Error inserting minimal asset:', insertError);
    }
    return newAsset ? {
      id: newAsset.id,
      symbol: newAsset.symbol,
      name: newAsset.name,
      type: newAsset.asset_type,
    } : null;
  }
  // Create new asset with full data
  const { data: newAsset, error: fullInsertError } = await supabase
    .from('assets')
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
      volume: quote.volume,
      market_cap: quote.marketCap ? Math.round(quote.marketCap) : undefined,
      keywords: [quote.symbol.toUpperCase(), quote.name],
      last_price_update: new Date().toISOString(),
    })
    .select('id, symbol, name, asset_type')
    .single();
  if (fullInsertError) {
    console.error('Error inserting full asset:', fullInsertError);
  }
  return newAsset ? {
    id: newAsset.id,
    symbol: newAsset.symbol,
    name: newAsset.name,
    type: newAsset.asset_type,
  } : null;
}
