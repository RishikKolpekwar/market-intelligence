/**
 * Debug endpoint to test financial API connectivity
 * GET /api/debug/sync-test?symbol=MSFT
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSymbolQuote } from '@/lib/market-data/symbol-lookup';
import { getQuote, getTimeSeries } from '@/lib/financial-data/twelve-data';
import { getKeyMetrics, getEarningsCalendar, getRatiosTTM, getEvEbitda } from '@/lib/financial-data/fmp';
import { 
  fetchValuationMetrics, 
  fetchEarningsDate, 
  fetchHistoricalChanges 
} from '@/lib/market-data/price-service';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'MSFT';
  
  const results: Record<string, any> = {
    symbol,
    timestamp: new Date().toISOString(),
    finnhub: { status: 'pending' },
    twelveDataQuote: { status: 'pending' },
    twelveDataHistory: { status: 'pending' },
    fmpRatiosTTM: { status: 'pending' },
    fmpKeyMetrics: { status: 'pending' },
    fmpEarnings: { status: 'pending' },
    evEbitdaCombined: { status: 'pending' },
    priceService: { status: 'pending' },
  };

  // Test Finnhub
  try {
    console.log(`[Debug] Testing Finnhub for ${symbol}...`);
    const finnhubQuote = await getSymbolQuote(symbol);
    results.finnhub = {
      status: finnhubQuote ? 'success' : 'no_data',
      data: finnhubQuote,
    };
  } catch (e: any) {
    results.finnhub = { status: 'error', error: e.message };
  }

  // Test Twelve Data Quote
  try {
    console.log(`[Debug] Testing Twelve Data Quote for ${symbol}...`);
    const tdQuote = await getQuote(symbol);
    results.twelveDataQuote = {
      status: tdQuote ? 'success' : 'no_data',
      data: tdQuote,
    };
  } catch (e: any) {
    results.twelveDataQuote = { status: 'error', error: e.message };
  }

  // Test Twelve Data Time Series
  try {
    console.log(`[Debug] Testing Twelve Data History for ${symbol}...`);
    const tdHistory = await getTimeSeries(symbol, 30);
    results.twelveDataHistory = {
      status: tdHistory?.values ? 'success' : 'no_data',
      dataPoints: tdHistory?.values?.length || 0,
      sample: tdHistory?.values?.slice(0, 3),
    };
  } catch (e: any) {
    results.twelveDataHistory = { status: 'error', error: e.message };
  }

  // Test FMP Ratios TTM (often available on free tier)
  try {
    console.log(`[Debug] Testing FMP Ratios TTM for ${symbol}...`);
    const fmpRatios = await getRatiosTTM(symbol);
    results.fmpRatiosTTM = {
      status: fmpRatios ? 'success' : 'no_data',
      evEbitda: fmpRatios?.enterpriseValueMultipleTTM || null,
      peRatio: fmpRatios?.peRatioTTM || null,
      priceToBook: fmpRatios?.priceToBookRatioTTM || null,
      data: fmpRatios || null,
    };
  } catch (e: any) {
    results.fmpRatiosTTM = { status: 'error', error: e.message };
  }

  // Test FMP Key Metrics (might require paid tier)
  try {
    console.log(`[Debug] Testing FMP Key Metrics for ${symbol}...`);
    const fmpMetrics = await getKeyMetrics(symbol, 'quarter', 1);
    results.fmpKeyMetrics = {
      status: fmpMetrics?.length > 0 ? 'success' : 'no_data',
      evEbitda: fmpMetrics?.[0]?.enterpriseValueOverEBITDA || null,
      peRatio: fmpMetrics?.[0]?.peRatio || null,
      data: fmpMetrics?.[0] || null,
    };
  } catch (e: any) {
    results.fmpKeyMetrics = { status: 'error', error: e.message };
  }

  // Test Combined EV/EBITDA function (tries multiple sources)
  try {
    console.log(`[Debug] Testing combined getEvEbitda for ${symbol}...`);
    const evEbitda = await getEvEbitda(symbol);
    results.evEbitdaCombined = {
      status: evEbitda !== null ? 'success' : 'no_data',
      value: evEbitda,
    };
  } catch (e: any) {
    results.evEbitdaCombined = { status: 'error', error: e.message };
  }

  // Test FMP Earnings Calendar
  try {
    console.log(`[Debug] Testing FMP Earnings for ${symbol}...`);
    const fmpEarnings = await getEarningsCalendar(symbol);
    const now = new Date();
    const upcoming = fmpEarnings?.filter(e => new Date(e.date) >= now).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    results.fmpEarnings = {
      status: fmpEarnings?.length > 0 ? 'success' : 'no_data',
      totalEntries: fmpEarnings?.length || 0,
      nextEarningsDate: upcoming?.[0]?.date || null,
      sample: upcoming?.slice(0, 2),
    };
  } catch (e: any) {
    results.fmpEarnings = { status: 'error', error: e.message };
  }

  // Test Price Service helpers
  try {
    console.log(`[Debug] Testing Price Service for ${symbol}...`);
    const currentPrice = results.finnhub?.data?.currentPrice || 100;
    
    const [metrics, earnings, history] = await Promise.all([
      fetchValuationMetrics(symbol),
      fetchEarningsDate(symbol),
      fetchHistoricalChanges(symbol, currentPrice),
    ]);
    
    results.priceService = {
      status: 'success',
      metrics,
      earnings,
      history,
    };
  } catch (e: any) {
    results.priceService = { status: 'error', error: e.message };
  }

  // Summary
  results.summary = {
    finnhubWorking: results.finnhub.status === 'success',
    twelveDataWorking: results.twelveDataQuote.status === 'success',
    fmpRatiosTTMWorking: results.fmpRatiosTTM.status === 'success',
    fmpKeyMetricsWorking: results.fmpKeyMetrics.status === 'success',
    has52Week: !!(results.twelveDataQuote?.data?.fifty_two_week || results.finnhub?.data?.week52High),
    hasEvEbitda: results.evEbitdaCombined?.value !== null,
    evEbitdaValue: results.evEbitdaCombined?.value,
    evEbitdaSource: results.fmpRatiosTTM?.evEbitda ? 'ratios-ttm' : (results.fmpKeyMetrics?.evEbitda ? 'key-metrics' : 'none'),
    hasEarnings: !!results.fmpEarnings?.nextEarningsDate,
    hasHistory: results.twelveDataHistory?.dataPoints > 20,
  };

  return NextResponse.json(results);
}
