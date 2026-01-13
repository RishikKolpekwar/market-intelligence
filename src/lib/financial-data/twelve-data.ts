/**
 * Twelve Data API Client
 * https://twelvedata.com/docs
 * Free tier: 800 API credits/day
 */

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY || 'c003b0f23e6b4b7c8adf43b3ef361a69';
const BASE_URL = 'https://api.twelvedata.com';

interface TimeSeriesResponse {
  meta: {
    symbol: string;
    interval: string;
    currency: string;
    exchange_timezone: string;
    exchange: string;
    mic_code: string;
    type: string;
  };
  values: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>;
  status: string;
}

interface QuoteResponse {
  symbol: string;
  name: string;
  exchange: string;
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  previous_close: string;
  change: string;
  percent_change: string;
  fifty_two_week: {
    low: string;
    high: string;
  };
}

/**
 * Get historical daily prices for a symbol
 * @param symbol Stock ticker symbol
 * @param outputsize Number of data points (default: 30 for 1 month)
 */
export async function getTimeSeries(symbol: string, outputsize: number = 365): Promise<TimeSeriesResponse> {
  const url = `${BASE_URL}/time_series?symbol=${symbol}&interval=1day&outputsize=${outputsize}&apikey=${TWELVE_DATA_API_KEY}`;

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twelve Data API error: ${response.status} ${error}`);
  }

  const data = await response.json();

  if (data.status === 'error') {
    throw new Error(`Twelve Data error: ${data.message || 'Unknown error'}`);
  }

  return data;
}

/**
 * Get current quote with 52-week high/low
 */
export async function getQuote(symbol: string): Promise<QuoteResponse> {
  const url = `${BASE_URL}/quote?symbol=${symbol}&apikey=${TWELVE_DATA_API_KEY}`;

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twelve Data API error: ${response.status} ${error}`);
  }

  const data = await response.json();

  if (data.status === 'error') {
    throw new Error(`Twelve Data error: ${data.message || 'Unknown error'}`);
  }

  return data;
}

/**
 * Calculate price changes from historical data
 */
export function calculatePriceChanges(
  currentPrice: number,
  timeSeries: TimeSeriesResponse
): {
  priceChangeMonth: number | null;
  priceChangePctMonth: number | null;
  priceChangeYear: number | null;
  priceChangePctYear: number | null;
} {
  const values = timeSeries.values;

  if (!values || values.length === 0) {
    return {
      priceChangeMonth: null,
      priceChangePctMonth: null,
      priceChangeYear: null,
      priceChangePctYear: null,
    };
  }

  // Find price ~30 days ago (around index 21-30 for trading days)
  const monthAgoPrice = values.length >= 21 ? parseFloat(values[21].close) : null;

  // Find price ~365 days ago (around index 252 for trading days)
  const yearAgoPrice = values.length >= 252 ? parseFloat(values[252].close) : null;

  return {
    priceChangeMonth: monthAgoPrice ? currentPrice - monthAgoPrice : null,
    priceChangePctMonth: monthAgoPrice ? ((currentPrice - monthAgoPrice) / monthAgoPrice) * 100 : null,
    priceChangeYear: yearAgoPrice ? currentPrice - yearAgoPrice : null,
    priceChangePctYear: yearAgoPrice ? ((currentPrice - yearAgoPrice) / yearAgoPrice) * 100 : null,
  };
}
