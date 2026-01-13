-- =============================================================================
-- ADD PORTFOLIO PERCENTAGE FIELD
-- Tracks the target percentage allocation for each asset in a portfolio
-- =============================================================================

-- Add portfolio_percentage field to user_assets
ALTER TABLE public.user_assets
ADD COLUMN IF NOT EXISTS portfolio_percentage DECIMAL(5, 2) DEFAULT NULL
CHECK (portfolio_percentage IS NULL OR (portfolio_percentage >= 0 AND portfolio_percentage <= 100));

-- Add index for sorting by percentage
CREATE INDEX IF NOT EXISTS idx_user_assets_portfolio_pct ON public.user_assets(portfolio_id, portfolio_percentage DESC NULLS LAST);

-- Comment
COMMENT ON COLUMN public.user_assets.portfolio_percentage IS 'Target percentage of portfolio value for this asset (0-100)';
