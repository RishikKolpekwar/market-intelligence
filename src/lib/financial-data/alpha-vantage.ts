/**
 * Alpha Vantage API Client
 * Best for: Mutual funds, ETFs, fund fundamentals (expense ratios, yield)
 * Free tier: 25 requests/day
 */

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';
const BASE_URL = 'https://www.alphavantage.co/query';

export interface AlphaVantageQuote {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  previousClose: number;
  week52High?: number;
  week52Low?: number;
}

export interface AlphaVantageFundamentals {
  symbol: string;
  expenseRatio?: number;
  dividendYield?: number;
  beta?: number;
  peRatio?: number;
  week52High?: number;
  week52Low?: number;
}

/**
 * Get real-time quote (works for stocks, mutual funds, ETFs)
 */
export async function getGlobalQuote(symbol: string): Promise<AlphaVantageQuote | null> {
  try {
    const url = `${BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    console.log(`[AlphaVantage] Fetching quote for ${symbol}...`);
    
    const response = await fetch(url);
    const data = await response.json();

    // Check for API errors
    if (data['Error Message'] || data['Note']) {
      console.error(`[AlphaVantage] API error:`, data['Error Message'] || data['Note']);
      return null;
    }

    const quote = data['Global Quote'];
    if (!quote || !quote['05. price']) {
      console.warn(`[AlphaVantage] No quote data for ${symbol}`);
      return null;
    }

    return {
      symbol: quote['01. symbol'],
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change']),
      changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      volume: parseInt(quote['06. volume']),
      previousClose: parseFloat(quote['08. previous close']),
    };
  } catch (error) {
    console.error(`[AlphaVantage] Error fetching quote for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get company/fund overview (includes fundamentals)
 */
export async function getOverview(symbol: string): Promise<AlphaVantageFundamentals | null> {
  try {
    const url = `${BASE_URL}?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    console.log(`[AlphaVantage] Fetching overview for ${symbol}...`);
    
    const response = await fetch(url);
    const data = await response.json();

    // Check for API errors
    if (data['Error Message'] || data['Note']) {
      console.error(`[AlphaVantage] API error:`, data['Error Message'] || data['Note']);
      return null;
    }

    if (!data.Symbol) {
      console.warn(`[AlphaVantage] No overview data for ${symbol}`);
      return null;
    }

    return {
      symbol: data.Symbol,
      expenseRatio: data.ExpenseRatio ? parseFloat(data.ExpenseRatio) : undefined,
      dividendYield: data.DividendYield ? parseFloat(data.DividendYield) : undefined,
      beta: data.Beta ? parseFloat(data.Beta) : undefined,
      peRatio: data.PERatio ? parseFloat(data.PERatio) : undefined,
      week52High: data['52WeekHigh'] ? parseFloat(data['52WeekHigh']) : undefined,
      week52Low: data['52WeekLow'] ? parseFloat(data['52WeekLow']) : undefined,
    };
  } catch (error) {
    console.error(`[AlphaVantage] Error fetching overview for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get daily time series (for historical price changes)
 */
export async function getDailyTimeSeries(symbol: string, outputSize: 'compact' | 'full' = 'compact'): Promise<any[] | null> {
  try {
    const url = `${BASE_URL}?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=${outputSize}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    console.log(`[AlphaVantage] Fetching daily time series for ${symbol}...`);
    
    const response = await fetch(url);
    const data = await response.json();

    // Check for API errors
    if (data['Error Message'] || data['Note']) {
      console.error(`[AlphaVantage] API error:`, data['Error Message'] || data['Note']);
      return null;
    }

    const timeSeries = data['Time Series (Daily)'];
    if (!timeSeries) {
      console.warn(`[AlphaVantage] No time series data for ${symbol}`);
      return null;
    }

    // Convert to array of {date, open, high, low, close, volume}
    return Object.entries(timeSeries).map(([date, values]: [string, any]) => ({
      date,
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      volume: parseInt(values['5. volume']),
    }));
  } catch (error) {
    console.error(`[AlphaVantage] Error fetching time series for ${symbol}:`, error);
    return null;
  }
}

/**
 * Calculate monthly and yearly price changes from time series data
 */
export function calculatePriceChanges(
  timeSeriesData: any[],
  currentPrice: number
): { monthChange: number; monthChangePct: number; yearChange: number; yearChangePct: number } | null {
  if (!timeSeriesData || timeSeriesData.length === 0) return null;

  const sortedData = timeSeriesData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const now = new Date();

  // Find price ~1 month ago (30 days)
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
  const monthData = sortedData.find(d => new Date(d.date) <= oneMonthAgo);
  
  // Find price ~1 year ago (364 days to match Yahoo and symbol-lookup.ts)
  const oneYearAgo = new Date(now);
  oneYearAgo.setDate(oneYearAgo.getDate() - 364);
  const yearData = sortedData.find(d => new Date(d.date) <= oneYearAgo);

  const monthChange = monthData ? currentPrice - monthData.close : 0;
  const monthChangePct = monthData ? ((currentPrice - monthData.close) / monthData.close) * 100 : 0;
  const yearChange = yearData ? currentPrice - yearData.close : 0;
  const yearChangePct = yearData ? ((currentPrice - yearData.close) / yearData.close) * 100 : 0;

  return {
    monthChange,
    monthChangePct,
    yearChange,
    yearChangePct,
  };
}
