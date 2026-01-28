/**
 * Test that a wide range of symbols can be resolved and (optionally) upserted.
 * Use this to ensure mainstream + edge-case stocks, ETFs, mutual funds, indices, crypto work.
 *
 * Run from project root with env loaded, e.g.:
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/test-asset-edge-cases.ts
 *   # or: export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/test-asset-edge-cases.ts
 *
 * Options:
 *   --quote-only   Only test getSymbolQuote (no DB upsert). No SUPABASE_SERVICE_ROLE_KEY needed.
 *   --upsert       Also run upsertAssetWithQuote for each (default). Needs Supabase env vars.
 */

import { getSymbolQuote, upsertAssetWithQuote } from "../src/lib/market-data/symbol-lookup";
import * as fs from "fs";
import * as path from "path";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const QUOTE_ONLY = process.argv.includes("--quote-only");
const DO_UPSERT = process.argv.includes("--upsert") || !QUOTE_ONLY;

/** Curated list: mainstream, low-key, ETFs, mutual funds, indices, crypto, international */
const TEST_SYMBOLS: { symbol: string; category: string }[] = [
  // Mega-cap / mainstream
  { symbol: "AAPL", category: "stock-mega" },
  { symbol: "MSFT", category: "stock-mega" },
  { symbol: "GOOGL", category: "stock-mega" },
  { symbol: "NVDA", category: "stock-mega" },
  { symbol: "MU", category: "stock-mega" },
  // Mid/small cap
  { symbol: "RBLX", category: "stock-mid" },
  { symbol: "PLTR", category: "stock-mid" },
  { symbol: "SOFI", category: "stock-small" },
  // ETFs
  { symbol: "SPY", category: "etf" },
  { symbol: "QQQ", category: "etf" },
  { symbol: "VTI", category: "etf" },
  { symbol: "VOO", category: "etf" },
  { symbol: "IWM", category: "etf" },
  { symbol: "XLK", category: "etf" },
  // Mutual funds (5-letter ending X)
  { symbol: "VFIAX", category: "mutual-fund" },
  { symbol: "VTSAX", category: "mutual-fund" },
  { symbol: "FCNTX", category: "mutual-fund" },
  { symbol: "FXAIX", category: "mutual-fund" },
  // Indices (Yahoo-style)
  { symbol: "^GSPC", category: "index" },
  { symbol: "^DJI", category: "index" },
  { symbol: "^IXIC", category: "index" },
  // Crypto
  { symbol: "BTC-USD", category: "crypto" },
  { symbol: "ETH-USD", category: "crypto" },
  // International (common suffixes)
  { symbol: "SHOP.TO", category: "intl" },
  { symbol: "BP.L", category: "intl" },
  // Less common / edge
  { symbol: "MOV", category: "stock-lowkey" },
  { symbol: "BRK.B", category: "stock-class-b" },
];

async function main() {
  loadEnvLocal();

  if (DO_UPSERT && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "❌ SUPABASE_SERVICE_ROLE_KEY required for upsert. Use --quote-only to skip DB, or set env."
    );
    process.exit(1);
  }

  console.log("\n📋 Asset edge-case test");
  console.log("   Mode:", QUOTE_ONLY ? "quote-only (no DB)" : "quote + upsert");
  console.log("   Symbols:", TEST_SYMBOLS.length, "\n");

  const results: { symbol: string; category: string; quote: boolean; upsert: boolean; error?: string }[] = [];

  for (const { symbol, category } of TEST_SYMBOLS) {
    let quoteOk = false;
    let upsertOk = false;
    let err: string | undefined;

    try {
      const quote = await getSymbolQuote(symbol);
      quoteOk = !!quote;
      if (quote) {
        if (DO_UPSERT) {
          const asset = await upsertAssetWithQuote(symbol);
          upsertOk = !!asset;
          if (!asset) err = "upsert returned null";
        }
      } else {
        err = "no quote (Yahoo + Finnhub)";
      }
    } catch (e: any) {
      err = e?.message || String(e);
    }

    results.push({ symbol, category, quote: quoteOk, upsert: upsertOk, error: err });
    const icon = quoteOk && (!DO_UPSERT || upsertOk) ? "✅" : "❌";
    const detail = err ? ` (${err})` : "";
    console.log(`${icon} ${symbol.padEnd(12)} ${category.padEnd(14)} quote=${quoteOk}${DO_UPSERT ? ` upsert=${upsertOk}` : ""}${detail}`);
  }

  const quoteFail = results.filter((r) => !r.quote);
  const upsertFail = DO_UPSERT ? results.filter((r) => r.quote && !r.upsert) : [];

  console.log("\n--- Summary ---");
  console.log("Quote OK:", results.filter((r) => r.quote).length, "/", results.length);
  if (DO_UPSERT) {
    console.log("Upsert OK:", results.filter((r) => r.upsert).length, "/", results.length);
  }
  if (quoteFail.length) {
    console.log("\n⚠️  No quote:", quoteFail.map((r) => r.symbol).join(", "));
  }
  if (upsertFail.length) {
    console.log("\n⚠️  Quote but upsert failed:", upsertFail.map((r) => `${r.symbol}: ${r.error || "unknown"}`).join("; "));
  }
  if (quoteFail.length === 0 && upsertFail.length === 0) {
    console.log("\n✅ All symbols digested successfully.");
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
