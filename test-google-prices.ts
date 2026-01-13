/**
 * Test script to trace Google (GOOGL) price calculations step-by-step
 * Run with: npx tsx test-google-prices.ts
 */

import { getSymbolQuote, getYahooMonthYearChanges } from "./src/lib/market-data/symbol-lookup";

const SYMBOL = "GOOGL";

console.log("=".repeat(80));
console.log("GOOGLE (GOOGL) PRICE CALCULATION TEST");
console.log("=".repeat(80));
console.log();

async function testGooglePrices() {
  // ============================================================
  // STEP 1: Fetch current quote from Yahoo/Finnhub
  // ============================================================
  console.log("📊 STEP 1: Fetching Current Quote");
  console.log("-".repeat(80));

  const quote = await getSymbolQuote(SYMBOL);

  if (!quote) {
    console.error("❌ Failed to fetch quote for GOOGL");
    return;
  }

  console.log("Raw Quote Data from API:");
  console.log(JSON.stringify(quote, null, 2));
  console.log();

  // ============================================================
  // STEP 2: Day $ and Day % Calculations
  // ============================================================
  console.log("📈 STEP 2: Day $ and Day % Calculations");
  console.log("-".repeat(80));

  console.log(`Current Price:   $${quote.currentPrice?.toFixed(2) || "N/A"}`);
  console.log(`Previous Close:  $${quote.previousClose?.toFixed(2) || "N/A"}`);
  console.log();

  if (quote.currentPrice !== null && quote.previousClose !== null) {
    // Manual calculation to verify
    const manualChange = quote.currentPrice - quote.previousClose;
    const manualChangePct = (manualChange / quote.previousClose) * 100;

    console.log("CALCULATIONS:");
    console.log(`  Formula: Day $ = current_price - previous_close`);
    console.log(`  Manual:  Day $ = ${quote.currentPrice.toFixed(2)} - ${quote.previousClose.toFixed(2)}`);
    console.log(`  Manual:  Day $ = ${manualChange.toFixed(2)}`);
    console.log();
    console.log(`  Formula: Day % = (Day $ / previous_close) * 100`);
    console.log(`  Manual:  Day % = (${manualChange.toFixed(2)} / ${quote.previousClose.toFixed(2)}) * 100`);
    console.log(`  Manual:  Day % = ${manualChangePct.toFixed(2)}%`);
    console.log();

    console.log("RESULTS FROM API:");
    console.log(`  API Day $: ${quote.change?.toFixed(2) || "N/A"}`);
    console.log(`  API Day %: ${quote.changePercent?.toFixed(2) || "N/A"}%`);
    console.log();

    // Verify match
    const changeMatch = Math.abs((quote.change || 0) - manualChange) < 0.01;
    const pctMatch = Math.abs((quote.changePercent || 0) - manualChangePct) < 0.01;

    console.log("VERIFICATION:");
    console.log(`  Day $ matches: ${changeMatch ? "✅" : "❌"}`);
    console.log(`  Day % matches: ${pctMatch ? "✅" : "❌"}`);
  } else {
    console.log("⚠️  Missing price data - cannot calculate Day $ and Day %");
  }
  console.log();

  // ============================================================
  // STEP 3: 1M and 1Y Historical Changes
  // ============================================================
  console.log("📅 STEP 3: Historical Changes (1M and 1Y)");
  console.log("-".repeat(80));

  const hist = await getYahooMonthYearChanges(SYMBOL, quote.currentPrice);

  console.log("Historical Data Retrieved:");
  console.log(JSON.stringify(hist, null, 2));
  console.log();

  // 1 MONTH CALCULATIONS
  console.log("1 MONTH (30 DAYS) CALCULATIONS:");
  console.log("-".repeat(40));
  const now = new Date();
  const monthTarget = new Date(now);
  monthTarget.setDate(monthTarget.getDate() - 30);

  console.log(`Today's Date:        ${now.toISOString().split('T')[0]}`);
  console.log(`Target Date (30d):   ${monthTarget.toISOString().split('T')[0]}`);
  console.log(`Close on/before:     $${hist.monthAgoClose?.toFixed(2) || "N/A"}`);
  console.log();

  if (quote.currentPrice !== null && hist.monthAgoClose !== null) {
    const manual1MChange = quote.currentPrice - hist.monthAgoClose;
    const manual1MPct = (manual1MChange / hist.monthAgoClose) * 100;

    console.log(`  Formula: 1M $ = current_price - month_ago_close`);
    console.log(`  Manual:  1M $ = ${quote.currentPrice.toFixed(2)} - ${hist.monthAgoClose.toFixed(2)}`);
    console.log(`  Manual:  1M $ = ${manual1MChange.toFixed(2)}`);
    console.log();
    console.log(`  Formula: 1M % = (1M $ / month_ago_close) * 100`);
    console.log(`  Manual:  1M % = (${manual1MChange.toFixed(2)} / ${hist.monthAgoClose.toFixed(2)}) * 100`);
    console.log(`  Manual:  1M % = ${manual1MPct.toFixed(2)}%`);
    console.log();

    console.log("RESULTS FROM FUNCTION:");
    console.log(`  Function 1M $: ${hist.monthChange?.toFixed(2) || "N/A"}`);
    console.log(`  Function 1M %: ${hist.monthChangePct?.toFixed(2) || "N/A"}%`);
    console.log();

    const change1MMatch = Math.abs((hist.monthChange || 0) - manual1MChange) < 0.01;
    const pct1MMatch = Math.abs((hist.monthChangePct || 0) - manual1MPct) < 0.01;

    console.log("VERIFICATION:");
    console.log(`  1M $ matches: ${change1MMatch ? "✅" : "❌"}`);
    console.log(`  1M % matches: ${pct1MMatch ? "✅" : "❌"}`);
  } else {
    console.log("⚠️  Missing historical data - cannot calculate 1M changes");
  }
  console.log();

  // 1 YEAR CALCULATIONS
  console.log("1 YEAR (365 DAYS) CALCULATIONS:");
  console.log("-".repeat(40));
  const yearTarget = new Date(now);
  yearTarget.setDate(yearTarget.getDate() - 365);

  console.log(`Today's Date:        ${now.toISOString().split('T')[0]}`);
  console.log(`Target Date (365d):  ${yearTarget.toISOString().split('T')[0]}`);
  console.log(`Close on/before:     $${hist.yearAgoClose?.toFixed(2) || "N/A"}`);
  console.log();

  if (quote.currentPrice !== null && hist.yearAgoClose !== null) {
    const manual1YChange = quote.currentPrice - hist.yearAgoClose;
    const manual1YPct = (manual1YChange / hist.yearAgoClose) * 100;

    console.log(`  Formula: 1Y $ = current_price - year_ago_close`);
    console.log(`  Manual:  1Y $ = ${quote.currentPrice.toFixed(2)} - ${hist.yearAgoClose.toFixed(2)}`);
    console.log(`  Manual:  1Y $ = ${manual1YChange.toFixed(2)}`);
    console.log();
    console.log(`  Formula: 1Y % = (1Y $ / year_ago_close) * 100`);
    console.log(`  Manual:  1Y % = (${manual1YChange.toFixed(2)} / ${hist.yearAgoClose.toFixed(2)}) * 100`);
    console.log(`  Manual:  1Y % = ${manual1YPct.toFixed(2)}%`);
    console.log();

    console.log("RESULTS FROM FUNCTION:");
    console.log(`  Function 1Y $: ${hist.yearChange?.toFixed(2) || "N/A"}`);
    console.log(`  Function 1Y %: ${hist.yearChangePct?.toFixed(2) || "N/A"}%`);
    console.log();

    const change1YMatch = Math.abs((hist.yearChange || 0) - manual1YChange) < 0.01;
    const pct1YMatch = Math.abs((hist.yearChangePct || 0) - manual1YPct) < 0.01;

    console.log("VERIFICATION:");
    console.log(`  1Y $ matches: ${change1YMatch ? "✅" : "❌"}`);
    console.log(`  1Y % matches: ${pct1YMatch ? "✅" : "❌"}`);
  } else {
    console.log("⚠️  Missing historical data - cannot calculate 1Y changes");
  }
  console.log();

  // ============================================================
  // STEP 4: Final Summary
  // ============================================================
  console.log("=".repeat(80));
  console.log("📋 FINAL SUMMARY - ALL METRICS");
  console.log("=".repeat(80));

  console.log(`Symbol:              ${quote.symbol}`);
  console.log(`Name:                ${quote.name}`);
  console.log(`Current Price:       $${quote.currentPrice?.toFixed(2) || "N/A"}`);
  console.log();
  console.log("DAILY METRICS:");
  console.log(`  Previous Close:    $${quote.previousClose?.toFixed(2) || "N/A"}`);
  console.log(`  Day Change ($):    $${quote.change?.toFixed(2) || "N/A"}`);
  console.log(`  Day Change (%):    ${quote.changePercent?.toFixed(2) || "N/A"}%`);
  console.log();
  console.log("1-MONTH METRICS:");
  console.log(`  Month Ago Close:   $${hist.monthAgoClose?.toFixed(2) || "N/A"}`);
  console.log(`  1M Change ($):     $${hist.monthChange?.toFixed(2) || "N/A"}`);
  console.log(`  1M Change (%):     ${hist.monthChangePct?.toFixed(2) || "N/A"}%`);
  console.log();
  console.log("1-YEAR METRICS:");
  console.log(`  Year Ago Close:    $${hist.yearAgoClose?.toFixed(2) || "N/A"}`);
  console.log(`  1Y Change ($):     $${hist.yearChange?.toFixed(2) || "N/A"}`);
  console.log(`  1Y Change (%):     ${hist.yearChangePct?.toFixed(2) || "N/A"}%`);
  console.log();

  // ============================================================
  // STEP 5: Database Storage Format
  // ============================================================
  console.log("=".repeat(80));
  console.log("💾 DATABASE STORAGE FORMAT");
  console.log("=".repeat(80));
  console.log();
  console.log("What gets stored in 'assets' table:");
  console.log(JSON.stringify({
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
  }, null, 2));
  console.log();
  console.log("⚠️  NOTE: 1M and 1Y changes are computed on-demand, NOT stored in DB");
  console.log("    They are calculated fresh each time via getYahooMonthYearChanges()");
  console.log();
}

// Run the test
testGooglePrices().catch(console.error);
