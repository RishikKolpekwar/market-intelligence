-- Migration: Add portfolio metrics and price history tracking
-- Part 1: Add new columns to user_assets table

ALTER TABLE user_assets
  ADD COLUMN IF NOT EXISTS portfolio_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS ev_ebitda DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS next_earnings_date DATE;

-- Add constraint for portfolio_percentage range
ALTER TABLE user_assets
  ADD CONSTRAINT chk_portfolio_percentage
  CHECK (portfolio_percentage >= 0 AND portfolio_percentage <= 100);

-- Part 2: Create asset_price_history table for historical price tracking
CREATE TABLE IF NOT EXISTS asset_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  price DECIMAL(12,4) NOT NULL,
  price_date DATE NOT NULL,
  source VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_asset_price_date UNIQUE(asset_id, price_date)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_price_history_lookup
  ON asset_price_history(asset_id, price_date DESC);

CREATE INDEX IF NOT EXISTS idx_user_assets_allocation
  ON user_assets(user_id, portfolio_percentage DESC);

CREATE INDEX IF NOT EXISTS idx_user_assets_portfolio
  ON user_assets(portfolio_id, portfolio_percentage DESC);

-- Part 3: Backfill existing assets with 0% allocation (users can edit later)
UPDATE user_assets
SET portfolio_percentage = 0.00
WHERE portfolio_percentage IS NULL;

-- Part 4: Add comment documentation
COMMENT ON COLUMN user_assets.portfolio_percentage IS 'Percentage allocation of this asset within its portfolio (0-100). Required field.';
COMMENT ON COLUMN user_assets.ev_ebitda IS 'Enterprise Value to EBITDA ratio. NULL for unprofitable companies.';
COMMENT ON COLUMN user_assets.next_earnings_date IS 'Next scheduled earnings release date. Updated weekly.';
COMMENT ON TABLE asset_price_history IS 'Historical daily closing prices for assets. Used to calculate month/year price changes.';
