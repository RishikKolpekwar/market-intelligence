# Asset ingestion – edge-case testing

Use this to confirm that **mainstream and obscure** stocks, ETFs, mutual funds, indices, and crypto can be resolved and added to the app.

## Quick test (script)

From the project root. Load `.env.local` first (e.g. Node 20+ `--env-file`, or set vars in your shell).

```bash
# Quote + DB upsert (needs SUPABASE_SERVICE_ROLE_KEY in .env.local)
npm run test:assets

# Quote only (no DB, no service role needed)
npm run test:assets:quote-only
```

With env from file (Node 20+):

```bash
node --env-file=.env.local ./node_modules/.bin/tsx scripts/test-asset-edge-cases.ts
```

## Suggested symbols to try in the UI

Manual smoke test when adding an asset on the dashboard:

| Category        | Symbols to try        | Notes                                      |
|----------------|------------------------|--------------------------------------------|
| Mega-cap       | AAPL, MSFT, GOOGL, NVDA, MU | Common; MU previously hit bigint issue.   |
| Mid/small cap  | RBLX, PLTR, SOFI       | Less liquidity / smaller names.            |
| ETFs           | SPY, QQQ, VTI, VOO, IWM, XLK | Core ETFs; type inferred by symbol list.  |
| Mutual funds   | VFIAX, VTSAX, FCNTX, FXAIX | 5-letter ending in X; NAV from Yahoo.     |
| Indices        | ^GSPC, ^DJI, ^IXIC     | Yahoo-style with `^` prefix.               |
| Crypto         | BTC-USD, ETH-USD       | Yahoo uses `-USD` suffix.                  |
| International  | SHOP.TO, BP.L          | Exchange suffix (.TO = Toronto, .L = LSE). |
| Class B        | BRK.B                  | Dot in symbol.                             |
| Low-key        | MOV                    | Smaller name; tests quote + insert path.   |

## What the app supports

- **Quote source**: Yahoo Finance first, Finnhub fallback.
- **Asset types**: `stock`, `etf`, `mutual_fund`, `crypto`, `index` (DB and `inferAssetType`).
- **Mutual funds**: Heuristic 5-letter ending in `X`; metadata from Yahoo/Finnhub can override.
- **Indices**: Symbols starting with `^` or `.` treated as index.
- **Crypto**: `-USD` suffix or common tickers (BTC, ETH, etc.).
- **DB**: `market_cap` and `volume` are BIGINT; decimals are rounded before insert.

If a symbol returns no quote from either Yahoo or Finnhub, the app can still create a **minimal asset** (symbol, name, type, keywords) so it can be added to a portfolio; price fields stay empty until a later sync or a quote becomes available.
