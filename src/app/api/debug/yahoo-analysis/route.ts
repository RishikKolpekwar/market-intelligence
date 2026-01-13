import { NextResponse } from 'next/server';
import { getYahooQuote, calculateYahooHistoricalChanges } from '@/lib/financial-data/yahoo-finance';

/**
 * Debug endpoint to analyze a stock's Day $, Day %, 1M $, 1M %, 1Y $, 1Y % values from Yahoo Finance
 * Usage: GET /api/debug/yahoo-analysis?symbol=GOOGL
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'GOOGL';

  const results: any = {
    symbol,
    timestamp: new Date().toISOString(),
    source: 'Yahoo Finance API',
    data: {}
  };

  try {
    // Get current quote (includes Day $ and Day %)
    console.log(`[Yahoo Analysis] Fetching quote for ${symbol}...`);
    const quote = await getYahooQuote(symbol);
    
    if (!quote) {
      return NextResponse.json({
        ...results,
        error: 'Failed to fetch quote from Yahoo Finance',
      }, { status: 404 });
    }

    results.data.currentQuote = {
      price: quote.price,
      previousClose: quote.previousClose,
      dayChange: quote.change,           // Day $ (dollar change)
      dayChangePercent: quote.changePercent, // Day % (percent change)
      dayHigh: quote.high,
      dayLow: quote.low,
      volume: quote.volume,
      week52High: quote.week52High,
      week52Low: quote.week52Low,
      name: quote.name,
    };

    // Calculate historical changes (1M $, 1M %, 1Y $, 1Y %)
    console.log(`[Yahoo Analysis] Calculating historical changes for ${symbol}...`);
    const historicalChanges = await calculateYahooHistoricalChanges(symbol, quote.price);
    
    if (historicalChanges) {
      results.data.historicalChanges = {
        monthChange: historicalChanges.monthChange,           // 1M $ (dollar change)
        monthChangePercent: historicalChanges.monthChangePct, // 1M % (percent change)
        yearChange: historicalChanges.yearChange,             // 1Y $ (dollar change)
        yearChangePercent: historicalChanges.yearChangePct,   // 1Y % (percent change)
      };
    } else {
      results.data.historicalChanges = null;
      results.warning = 'Historical changes calculation failed or no data available';
    }

    // Format summary for easy reading
    results.summary = {
      symbol,
      name: quote.name,
      currentPrice: `$${quote.price.toFixed(2)}`,
      dayChange: {
        dollar: `${quote.change >= 0 ? '+' : ''}$${quote.change.toFixed(2)}`,
        percent: `${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%`,
      },
      monthChange: historicalChanges ? {
        dollar: `${historicalChanges.monthChange >= 0 ? '+' : ''}$${historicalChanges.monthChange.toFixed(2)}`,
        percent: `${historicalChanges.monthChangePct >= 0 ? '+' : ''}${historicalChanges.monthChangePct.toFixed(2)}%`,
      } : null,
      yearChange: historicalChanges ? {
        dollar: `${historicalChanges.yearChange >= 0 ? '+' : ''}$${historicalChanges.yearChange.toFixed(2)}`,
        percent: `${historicalChanges.yearChangePct >= 0 ? '+' : ''}${historicalChanges.yearChangePct.toFixed(2)}%`,
      } : null,
      week52Range: `$${quote.week52Low.toFixed(2)} - $${quote.week52High.toFixed(2)}`,
    };

    return NextResponse.json(results, { status: 200 });
  } catch (error: any) {
    console.error(`[Yahoo Analysis] Error analyzing ${symbol}:`, error);
    return NextResponse.json({
      ...results,
      error: error.message || 'Unknown error occurred',
    }, { status: 500 });
  }
}