-- Migration: Fix unique constraint to allow same asset across multiple portfolios
-- This allows users to track the same asset in different portfolios with different allocations

-- Drop the old constraint that prevents same asset in multiple portfolios
ALTER TABLE user_assets
  DROP CONSTRAINT IF EXISTS user_assets_user_id_asset_id_key;

-- Add new constraint that allows same asset in different portfolios
-- but prevents duplicate entries within the same portfolio
ALTER TABLE user_assets
  ADD CONSTRAINT user_assets_user_portfolio_asset_unique
  UNIQUE(user_id, asset_id, portfolio_id);

-- Add comment explaining the change
COMMENT ON CONSTRAINT user_assets_user_portfolio_asset_unique ON user_assets IS
  'Allows same asset in multiple portfolios but prevents duplicates within a portfolio';
