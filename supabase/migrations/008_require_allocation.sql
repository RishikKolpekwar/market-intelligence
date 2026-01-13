-- =============================================================================
-- REQUIRE PORTFOLIO ALLOCATION PERCENTAGE
-- Makes portfolio_percentage a required field for all user_assets
-- =============================================================================

-- Step 1: Set default value for any existing NULL records
UPDATE public.user_assets 
SET portfolio_percentage = 0.00 
WHERE portfolio_percentage IS NULL;

-- Step 2: Make the column NOT NULL
ALTER TABLE public.user_assets 
ALTER COLUMN portfolio_percentage SET NOT NULL;

-- Step 3: Set a default for new inserts (will be overridden by user input)
ALTER TABLE public.user_assets 
ALTER COLUMN portfolio_percentage SET DEFAULT 0.00;

-- Step 4: Ensure the check constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_assets_portfolio_percentage_check'
  ) THEN
    ALTER TABLE public.user_assets
    ADD CONSTRAINT user_assets_portfolio_percentage_check
    CHECK (portfolio_percentage >= 0 AND portfolio_percentage <= 100);
  END IF;
END $$;

-- Comment
COMMENT ON COLUMN public.user_assets.portfolio_percentage IS 'Required: Target percentage of portfolio value for this asset (0-100)';
