/**
 * Yahoo Finance API Client
 * Uses direct HTTP calls to Yahoo Finance chart API
 * - Price and 52-week high/low from chart endpoint
 * - Historical price data for 1M/1Y calculations
 */

const CHART_URL = 'https://query2.finance.yahoo.com/v8/finance/chart';

export interface YahooQuote {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  week52High: number;
  week52Low: number;
  marketCap?: number;
  name?: string;
}

export interface YahooKeyStats {
  evEbitda: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  enterpriseValue: number | null;
  ebitda: number | null;
  profitMargin: number | null;
  beta: number | null;
}

/**
 * Get quote data from Yahoo Finance chart endpoint
 */
export async function getYahooQuote(symbol: string): Promise<YahooQuote | null> {
  try {
    // Use range=1d to get current day data with correct previousClose
    // (range=1y returns split-adjusted historical data which gives wrong previousClose)
    const url = `${CHART_URL}/${symbol}?range=1d&interval=1m&includePrePost=false`;
    console.log(`[Yahoo] Fetching quote for ${symbol}...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.error(`[Yahoo] HTTP error ${response.status} for ${symbol}`);
      return null;
    }

    const data = await response.json();
    
    if (!data?.chart?.result?.[0]) {
      console.warn(`[Yahoo] No data for ${symbol}`);
      return null;
    }

    const result = data.chart.result[0];
    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice || meta.previousClose;
    
    if (!currentPrice) {
      console.warn(`[Yahoo] No price for ${symbol}`);
      return null;
    }

    // Get 52-week from meta (this is accurate)
    const week52High = meta.fiftyTwoWeekHigh;
    const week52Low = meta.fiftyTwoWeekLow;
    
    console.log(`[Yahoo] ${symbol} meta: 52WH=${week52High}, 52WL=${week52Low}`);

    // Calculate day change: currentPrice - previousClose
    const prevClose = meta.previousClose || meta.chartPreviousClose;
    const change = currentPrice - prevClose;
    const changePercent = prevClose ? ((change / prevClose) * 100) : 0;

    console.log(`[Yahoo] ${symbol}: ✅ Price=$${currentPrice.toFixed(2)}, Change=$${change.toFixed(2)} (${changePercent.toFixed(2)}%), 52W: $${week52Low?.toFixed(2)} - $${week52High?.toFixed(2)}`);

    return {
      symbol: meta.symbol,
      price: currentPrice,
      previousClose: prevClose,
      change,
      changePercent,
      high: meta.regularMarketDayHigh || currentPrice,
      low: meta.regularMarketDayLow || currentPrice,
      volume: meta.regularMarketVolume || 0,
      week52High: week52High || currentPrice,
      week52Low: week52Low || currentPrice,
      marketCap: meta.marketCap,
      name: meta.longName || meta.shortName,
    };
  } catch (error) {
    console.error(`[Yahoo] Error fetching quote for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get key statistics - returns null since Yahoo's quoteSummary requires auth
 * We fall back to FMP for EV/EBITDA
 */
export async function getYahooKeyStats(symbol: string): Promise<YahooKeyStats | null> {
  // Yahoo's quoteSummary endpoint requires authentication/crumb
  // We use FMP as fallback for these metrics
  console.log(`[Yahoo] Key stats not available via direct API for ${symbol}, using FMP fallback`);
  return null;
}

/**
 * Get historical prices from Yahoo Finance chart endpoint
 */
export async function getYahooHistoricalPrices(
  symbol: string,
  range: '1mo' | '3mo' | '1y' | '5y' = '1y'
): Promise<{ date: string; close: number }[] | null> {
  try {
    const url = `${CHART_URL}/${symbol}?range=${range}&interval=1d`;
    console.log(`[Yahoo] Fetching ${range} historical data for ${symbol}...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.error(`[Yahoo] Historical HTTP error ${response.status} for ${symbol}`);
      return null;
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    
    if (!result?.timestamp || !result?.indicators?.quote?.[0]?.close) {
      console.warn(`[Yahoo] No historical data for ${symbol}`);
      return null;
    }

    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;

    const prices = timestamps.map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      close: closes[i],
    })).filter((item: { date: string; close: number | null }) => item.close !== null);

    console.log(`[Yahoo] ${symbol}: ✅ Got ${prices.length} days of historical data`);
    return prices;
  } catch (error) {
    console.error(`[Yahoo] Error fetching historical for ${symbol}:`, error);
    return null;
  }
}

/**
 * Calculate monthly and yearly changes from Yahoo historical data
 * Compares current price to the closing price from exactly 30 days and 364 days ago (or last trading day on/before those dates)
 */
export async function calculateYahooHistoricalChanges(
  symbol: string,
  currentPrice: number
): Promise<{ monthChange: number; monthChangePct: number; yearChange: number; yearChangePct: number } | null> {
  try {
    const historical = await getYahooHistoricalPrices(symbol, '1y');
    if (!historical || historical.length === 0) {
      console.warn(`[Yahoo] ${symbol}: No historical data available`);
      return null;
    }

    // Sort by date ascending (oldest first)
    const sorted = [...historical].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate target dates: 30 days and 364 days ago
    const targetMonthDate = new Date(today);
    targetMonthDate.setDate(targetMonthDate.getDate() - 30);
    targetMonthDate.setHours(0, 0, 0, 0);

    const targetYearDate = new Date(today);
    // Use 364 days (not 365) to stay within Yahoo's 1-year data range
    targetYearDate.setDate(targetYearDate.getDate() - 364);
    targetYearDate.setHours(0, 0, 0, 0);

    // Find the last trading day on or before each target date (matches Yahoo Finance)
    const findPriceOnOrBefore = (targetDate: Date): { date: string; close: number } | null => {
      let best: { date: string; close: number } | null = null;
      const targetTimestamp = targetDate.getTime();
      
      for (const item of sorted) {
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0);
        const itemTimestamp = itemDate.getTime();
        
        // Use the last date that is <= target date
        if (itemTimestamp <= targetTimestamp) {
          best = item;
        } else {
          // Since sorted is ascending, we can break once we pass the target
          break;
        }
      }
      
      return best;
    };

    const monthData = findPriceOnOrBefore(targetMonthDate);
    const yearData = findPriceOnOrBefore(targetYearDate);
    
    // If no year data, use oldest available data
    const effectiveYearData = yearData || sorted[0];

    // Calculate changes
    const monthPrice = monthData?.close || null;
    const yearPrice = effectiveYearData?.close || null;

    console.log(`[Yahoo] ${symbol} Historical: Current=$${currentPrice.toFixed(2)}`);
    if (monthData) {
      console.log(`[Yahoo] ${symbol} 1M ago (${monthData.date}): $${monthData.close.toFixed(2)}`);
    } else {
      console.log(`[Yahoo] ${symbol}: No 1M data found`);
    }
    if (yearData) {
      console.log(`[Yahoo] ${symbol} 1Y ago (${yearData.date}): $${yearData.close.toFixed(2)}`);
    } else if (effectiveYearData) {
      console.log(`[Yahoo] ${symbol} Oldest available (${effectiveYearData.date}): $${effectiveYearData.close.toFixed(2)} (no 1Y data)`);
    }

    const monthChange = monthPrice ? currentPrice - monthPrice : 0;
    const monthChangePct = monthPrice ? ((currentPrice - monthPrice) / monthPrice) * 100 : 0;
    const yearChange = yearPrice ? currentPrice - yearPrice : 0;
    const yearChangePct = yearPrice ? ((currentPrice - yearPrice) / yearPrice) * 100 : 0;

    console.log(`[Yahoo] ${symbol}: 1M change: $${monthChange.toFixed(2)} (${monthChangePct.toFixed(2)}%), 1Y change: $${yearChange.toFixed(2)} (${yearChangePct.toFixed(2)}%)`);

    return {
      monthChange,
      monthChangePct,
      yearChange,
      yearChangePct,
    };
  } catch (error) {
    console.error(`[Yahoo] Error calculating historical changes for ${symbol}:`, error);
    return null;
  }
}
