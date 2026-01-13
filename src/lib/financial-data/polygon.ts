/**
 * Polygon.io API Client
 * Best for: Real-time quotes, previous day data, aggregates
 * Free tier: 5 API calls/minute
 */

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const BASE_URL = 'https://api.polygon.io';

export interface PolygonQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  previousClose: number;
  open: number;
}

export interface PolygonAggregates {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

/**
 * Get previous day's OHLCV data
 */
export async function getPreviousClose(symbol: string): Promise<PolygonQuote | null> {
  try {
    const url = `${BASE_URL}/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;
    console.log(`[Polygon] Fetching previous close for ${symbol}...`);
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.warn(`[Polygon] No data for ${symbol}:`, data.status);
      return null;
    }

    const result = data.results[0];
    const change = result.c - result.o;
    const changePercent = ((result.c - result.o) / result.o) * 100;

    return {
      symbol: data.ticker,
      price: result.c, // close price
      change,
      changePercent,
      high: result.h,
      low: result.l,
      volume: result.v,
      previousClose: result.o, // previous day's close = current day's open (approx)
      open: result.o,
    };
  } catch (error) {
    console.error(`[Polygon] Error fetching previous close for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get aggregates (bars) for a given time range
 * Useful for calculating monthly/yearly changes
 */
export async function getAggregates(
  symbol: string,
  multiplier: number,
  timespan: 'day' | 'week' | 'month' | 'year',
  from: string, // YYYY-MM-DD
  to: string    // YYYY-MM-DD
): Promise<PolygonAggregates[] | null> {
  try {
    const url = `${BASE_URL}/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=desc&apiKey=${POLYGON_API_KEY}`;
    console.log(`[Polygon] Fetching aggregates for ${symbol} from ${from} to ${to}...`);
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.results) {
      console.warn(`[Polygon] No aggregates for ${symbol}:`, data.status);
      return null;
    }

    return data.results.map((r: any) => ({
      symbol: data.ticker,
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
      timestamp: r.t,
    }));
  } catch (error) {
    console.error(`[Polygon] Error fetching aggregates for ${symbol}:`, error);
    return null;
  }
}

/**
 * Calculate monthly and yearly price changes from aggregates
 */
export async function calculateHistoricalChanges(
  symbol: string,
  currentPrice: number
): Promise<{ monthChange: number; monthChangePct: number; yearChange: number; yearChangePct: number } | null> {
  try {
    const now = new Date();
    // Use 364 days (not calendar year) to match Yahoo and symbol-lookup.ts
    const oneYearAgo = new Date(now);
    oneYearAgo.setDate(oneYearAgo.getDate() - 364);

    const from = oneYearAgo.toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);

    const aggregates = await getAggregates(symbol, 1, 'day', from, to);
    if (!aggregates || aggregates.length === 0) return null;

    // Sort by timestamp (oldest first)
    const sortedAggs = aggregates.sort((a, b) => a.timestamp - b.timestamp);

    // Find price ~30 days ago
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthAgg = sortedAggs.find(a => a.timestamp >= thirtyDaysAgo.getTime());

    // Price from 1 year ago (oldest in our dataset)
    const yearAgg = sortedAggs[0];

    const monthChange = monthAgg ? currentPrice - monthAgg.close : 0;
    const monthChangePct = monthAgg ? ((currentPrice - monthAgg.close) / monthAgg.close) * 100 : 0;
    const yearChange = yearAgg ? currentPrice - yearAgg.close : 0;
    const yearChangePct = yearAgg ? ((currentPrice - yearAgg.close) / yearAgg.close) * 100 : 0;

    return {
      monthChange,
      monthChangePct,
      yearChange,
      yearChangePct,
    };
  } catch (error) {
    console.error(`[Polygon] Error calculating historical changes for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get ticker details (company info, type, etc.)
 */
export async function getTickerDetails(symbol: string): Promise<any | null> {
  try {
    const url = `${BASE_URL}/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
    console.log(`[Polygon] Fetching ticker details for ${symbol}...`);
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.results) {
      console.warn(`[Polygon] No ticker details for ${symbol}`);
      return null;
    }

    return data.results;
  } catch (error) {
    console.error(`[Polygon] Error fetching ticker details for ${symbol}:`, error);
    return null;
  }
}
