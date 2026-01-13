/**
 * Test endpoint to show Google price calculations step-by-step
 * Access via: http://localhost:3000/api/test/google-prices
 */

import { NextResponse } from "next/server";
import { getSymbolQuote, getYahooMonthYearChanges } from "@/lib/market-data/symbol-lookup";

export async function GET() {
  const SYMBOL = "GOOGL";
  const results: any = {
    symbol: SYMBOL,
    timestamp: new Date().toISOString(),
    steps: [],
  };

  try {
    // ============================================================
    // STEP 1: Fetch current quote
    // ============================================================
    results.steps.push({
      step: 1,
      title: "Fetching Current Quote from Yahoo/Finnhub",
      description: "Getting real-time price data",
    });

    const quote = await getSymbolQuote(SYMBOL);

    if (!quote) {
      return NextResponse.json({
        ...results,
        error: "Failed to fetch quote for GOOGL",
      }, { status: 500 });
    }

    results.quote = {
      symbol: quote.symbol,
      name: quote.name,
      type: quote.type,
      exchange: quote.exchange,
      currentPrice: quote.currentPrice,
      previousClose: quote.previousClose,
      change: quote.change,
      changePercent: quote.changePercent,
      dayHigh: quote.dayHigh,
      dayLow: quote.dayLow,
      week52High: quote.week52High,
      week52Low: quote.week52Low,
      volume: quote.volume,
      marketCap: quote.marketCap,
    };

    // ============================================================
    // STEP 2: Calculate Day $ and Day %
    // ============================================================
    results.steps.push({
      step: 2,
      title: "Day $ and Day % Calculations",
      description: "Calculate daily price change",
    });

    if (quote.currentPrice !== null && quote.previousClose !== null) {
      const manualChange = quote.currentPrice - quote.previousClose;
      const manualChangePct = (manualChange / quote.previousClose) * 100;

      results.dayCalculations = {
        currentPrice: quote.currentPrice,
        previousClose: quote.previousClose,
        formula: {
          dayDollar: "current_price - previous_close",
          dayPercent: "(day_dollar / previous_close) * 100",
        },
        manualCalculation: {
          dayDollar: manualChange,
          dayPercent: manualChangePct,
        },
        apiProvided: {
          dayDollar: quote.change,
          dayPercent: quote.changePercent,
        },
        verification: {
          dayDollarMatches: Math.abs((quote.change || 0) - manualChange) < 0.01,
          dayPercentMatches: Math.abs((quote.changePercent || 0) - manualChangePct) < 0.01,
        },
      };
    } else {
      results.dayCalculations = {
        error: "Missing price data",
      };
    }

    // ============================================================
    // STEP 3: Calculate 1M and 1Y changes
    // ============================================================
    results.steps.push({
      step: 3,
      title: "Historical Changes (1M and 1Y)",
      description: "Fetch historical closes from Yahoo Chart API",
    });

    const hist = await getYahooMonthYearChanges(SYMBOL, quote.currentPrice);

    const now = new Date();
    const monthTarget = new Date(now);
    monthTarget.setDate(monthTarget.getDate() - 30);

    // Use 364 days to stay within Yahoo's 1-year data range
    const yearTarget = new Date(now);
    yearTarget.setDate(yearTarget.getDate() - 364);

    results.historicalData = {
      fetchedData: hist,
      targetDates: {
        today: now.toISOString().split('T')[0],
        monthAgo: monthTarget.toISOString().split('T')[0],
        yearAgo: yearTarget.toISOString().split('T')[0] + " (364 days ago)",
      },
      debug: {
        note: "Using 364 days (not 365) to ensure we stay within Yahoo's 1-year data range",
        yahooApiCall: `https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL}?range=1y&interval=1d`,
      },
    };

    // 1 Month calculations
    if (quote.currentPrice !== null && hist.monthAgoClose !== null) {
      const manual1MChange = quote.currentPrice - hist.monthAgoClose;
      const manual1MPct = (manual1MChange / hist.monthAgoClose) * 100;

      results.monthCalculations = {
        currentPrice: quote.currentPrice,
        monthAgoClose: hist.monthAgoClose,
        formula: {
          monthDollar: "current_price - month_ago_close",
          monthPercent: "(month_dollar / month_ago_close) * 100",
        },
        manualCalculation: {
          monthDollar: manual1MChange,
          monthPercent: manual1MPct,
        },
        functionReturned: {
          monthDollar: hist.monthChange,
          monthPercent: hist.monthChangePct,
        },
        verification: {
          monthDollarMatches: Math.abs((hist.monthChange || 0) - manual1MChange) < 0.01,
          monthPercentMatches: Math.abs((hist.monthChangePct || 0) - manual1MPct) < 0.01,
        },
      };
    } else {
      results.monthCalculations = {
        error: "Missing historical data",
      };
    }

    // 1 Year calculations
    if (quote.currentPrice !== null && hist.yearAgoClose !== null) {
      const manual1YChange = quote.currentPrice - hist.yearAgoClose;
      const manual1YPct = (manual1YChange / hist.yearAgoClose) * 100;

      results.yearCalculations = {
        currentPrice: quote.currentPrice,
        yearAgoClose: hist.yearAgoClose,
        formula: {
          yearDollar: "current_price - year_ago_close",
          yearPercent: "(year_dollar / year_ago_close) * 100",
        },
        manualCalculation: {
          yearDollar: manual1YChange,
          yearPercent: manual1YPct,
        },
        functionReturned: {
          yearDollar: hist.yearChange,
          yearPercent: hist.yearChangePct,
        },
        verification: {
          yearDollarMatches: Math.abs((hist.yearChange || 0) - manual1YChange) < 0.01,
          yearPercentMatches: Math.abs((hist.yearChangePct || 0) - manual1YPct) < 0.01,
        },
      };
    } else {
      results.yearCalculations = {
        error: "Missing historical data",
      };
    }

    // ============================================================
    // STEP 4: Final Summary
    // ============================================================
    results.summary = {
      symbol: quote.symbol,
      name: quote.name,
      currentPrice: quote.currentPrice,
      metrics: {
        day: {
          previousClose: quote.previousClose,
          changeDollar: quote.change,
          changePercent: quote.changePercent,
        },
        month: {
          monthAgoClose: hist.monthAgoClose,
          changeDollar: hist.monthChange,
          changePercent: hist.monthChangePct,
        },
        year: {
          yearAgoClose: hist.yearAgoClose,
          changeDollar: hist.yearChange,
          changePercent: hist.yearChangePct,
        },
      },
    };

    // ============================================================
    // STEP 5: What gets stored in database
    // ============================================================
    results.databaseFormat = {
      stored_in_assets_table: {
        symbol: quote.symbol,
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
      },
      note: "1M and 1Y changes are computed on-demand, NOT stored in database",
      computed_on_demand: {
        monthChange: hist.monthChange,
        monthChangePct: hist.monthChangePct,
        yearChange: hist.yearChange,
        yearChangePct: hist.yearChangePct,
      },
    };

    return NextResponse.json(results, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({
      ...results,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
