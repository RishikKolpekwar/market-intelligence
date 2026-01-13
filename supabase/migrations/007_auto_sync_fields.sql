-- Migration 007: Add auto-sync staleness tracking and computed price fields
-- This enables automatic syncing with intelligent staleness detection

-- Part 1: Add staleness timestamp columns to assets table
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS prices_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS history_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fundamentals_updated_at TIMESTAMPTZ;

-- Part 2: Add computed price change fields (month and year)
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS month_change NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS month_change_pct NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS year_change NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS year_change_pct NUMERIC(10,4);

-- Part 3: Add fundamental metrics (if not already present from migration 005)
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS ev_ebitda NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS next_earnings_date DATE;

-- Part 4: Ensure 52-week range columns exist
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS week_52_high NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS week_52_low NUMERIC(12,4);

-- Part 5: Add indexes for efficient staleness queries
CREATE INDEX IF NOT EXISTS idx_assets_prices_staleness
  ON assets(prices_updated_at) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_assets_history_staleness
  ON assets(history_updated_at) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_assets_fundamentals_staleness
  ON assets(fundamentals_updated_at) WHERE is_active = true;

-- Part 6: Add comments
COMMENT ON COLUMN assets.prices_updated_at IS 'Last time current_price, day change, and 52-week range were synced';
COMMENT ON COLUMN assets.history_updated_at IS 'Last time historical prices (month/year changes) were synced';
COMMENT ON COLUMN assets.fundamentals_updated_at IS 'Last time EV/EBITDA and earnings date were synced';
COMMENT ON COLUMN assets.month_change IS 'Price change over last ~30 days (absolute)';
COMMENT ON COLUMN assets.month_change_pct IS 'Price change over last ~30 days (percentage)';
COMMENT ON COLUMN assets.year_change IS 'Price change over last ~365 days (absolute)';
COMMENT ON COLUMN assets.year_change_pct IS 'Price change over last ~365 days (percentage)';
COMMENT ON COLUMN assets.ev_ebitda IS 'Enterprise Value to EBITDA ratio (from FMP)';
COMMENT ON COLUMN assets.next_earnings_date IS 'Next scheduled earnings date (from FMP)';
