import { NextResponse } from 'next/server';
import { getSymbolQuote } from '@/lib/market-data/symbol-lookup';
import { getQuote } from '@/lib/financial-data/twelve-data';
import { getKeyMetrics, getRatiosTTM, getEarningsReport } from '@/lib/financial-data/fmp';

/**
 * Test endpoint to check if a symbol (stock or mutual fund) is supported by our APIs
 * Usage: GET /api/debug/symbol-test?symbol=FCNTX
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'FCNTX';

  const results: any = {
    symbol,
    timestamp: new Date().toISOString(),
    apis: {}
  };

  // Test 1: Finnhub
  try {
    const quote = await getSymbolQuote(symbol);
    results.apis.finnhub = {
      status: quote ? 'success' : 'no_data',
      data: quote,
      notes: 'Real-time stock quotes (may not support mutual funds)'
    };
  } catch (error: any) {
    results.apis.finnhub = {
      status: 'error',
      error: error.message
    };
  }

  // Test 2: Twelve Data
  try {
    const quote = await getQuote(symbol);
    results.apis.twelveData = {
      status: quote ? 'success' : 'no_data',
      data: quote,
      notes: 'Historical prices and 52-week ranges (may support mutual funds)'
    };
  } catch (error: any) {
    results.apis.twelveData = {
      status: 'error',
      error: error.message
    };
  }

  // Test 3: FMP Ratios
  try {
    const ratios = await getRatiosTTM(symbol);
    results.apis.fmpRatios = {
      status: ratios ? 'success' : 'no_data',
      data: ratios,
      notes: 'Fundamental ratios (typically stocks only)'
    };
  } catch (error: any) {
    results.apis.fmpRatios = {
      status: 'error',
      error: error.message
    };
  }

  // Summary
  const supportedApis = Object.values(results.apis).filter((api: any) => api.status === 'success').length;
  results.summary = {
    totalApis: 3,
    supportedApis,
    isFullySupported: supportedApis >= 2,
    recommendation: supportedApis >= 2 
      ? `${symbol} is supported! Data available from ${supportedApis}/3 APIs.`
      : supportedApis === 1
      ? `${symbol} has limited support. Only 1/3 APIs returned data.`
      : `${symbol} is not supported. None of the APIs returned data. This may be a mutual fund or invalid ticker.`
  };

  return NextResponse.json(results, { status: 200 });
}
