-- =============================================================================
-- PHASE 1 SCHEMA UPDATES
-- Adds: Symbol lookup/auto-typing, Daily price snapshots, 52-week high/low
-- =============================================================================

-- -----------------------------------------------------------------------------
-- UPDATE ASSETS TABLE - Add more price tracking fields
-- -----------------------------------------------------------------------------
ALTER TABLE public.assets 
ADD COLUMN IF NOT EXISTS previous_close DECIMAL(20, 4),
ADD COLUMN IF NOT EXISTS open_price DECIMAL(20, 4),
ADD COLUMN IF NOT EXISTS day_high DECIMAL(20, 4),
ADD COLUMN IF NOT EXISTS day_low DECIMAL(20, 4),
ADD COLUMN IF NOT EXISTS week_52_high DECIMAL(20, 4),
ADD COLUMN IF NOT EXISTS week_52_low DECIMAL(20, 4),
ADD COLUMN IF NOT EXISTS volume BIGINT,
ADD COLUMN IF NOT EXISTS avg_volume BIGINT,
ADD COLUMN IF NOT EXISTS nav DECIMAL(20, 4), -- For mutual funds
ADD COLUMN IF NOT EXISTS nav_change DECIMAL(10, 4), -- NAV daily change
ADD COLUMN IF NOT EXISTS dividend_yield DECIMAL(6, 4),
ADD COLUMN IF NOT EXISTS pe_ratio DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS last_metadata_update TIMESTAMPTZ;

-- Update asset_type CHECK constraint to include 'mutual_fund'
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_asset_type_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_asset_type_check 
    CHECK (asset_type IN ('stock', 'etf', 'crypto', 'index', 'mutual_fund'));

-- -----------------------------------------------------------------------------
-- DAILY PRICE SNAPSHOTS TABLE
-- Stores historical daily prices for each asset
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asset_price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    -- Price data
    open_price DECIMAL(20, 4),
    high_price DECIMAL(20, 4),
    low_price DECIMAL(20, 4),
    close_price DECIMAL(20, 4),
    adjusted_close DECIMAL(20, 4),
    volume BIGINT,
    -- For mutual funds
    nav DECIMAL(20, 4),
    -- Calculated fields
    change_amount DECIMAL(20, 4),
    change_percent DECIMAL(10, 4),
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(asset_id, snapshot_date)
);

-- Indexes for price history
CREATE INDEX IF NOT EXISTS idx_price_history_asset_date 
    ON public.asset_price_history(asset_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_date 
    ON public.asset_price_history(snapshot_date DESC);

-- -----------------------------------------------------------------------------
-- SYMBOL LOOKUP CACHE TABLE
-- Caches symbol lookups from external APIs to reduce API calls
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.symbol_lookup_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query TEXT NOT NULL, -- The search query
    results JSONB NOT NULL, -- Array of matching symbols
    provider TEXT NOT NULL, -- Which API provided this
    expires_at TIMESTAMPTZ NOT NULL, -- When to refresh
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(query, provider)
);

-- Index for cache lookups
CREATE INDEX IF NOT EXISTS idx_symbol_cache_query ON public.symbol_lookup_cache(query);
CREATE INDEX IF NOT EXISTS idx_symbol_cache_expires ON public.symbol_lookup_cache(expires_at);

-- -----------------------------------------------------------------------------
-- UPDATE NEWS_ITEMS TABLE - Ensure article link fields exist
-- -----------------------------------------------------------------------------
-- These should already exist, but let's make sure
ALTER TABLE public.news_items 
ADD COLUMN IF NOT EXISTS snippet TEXT, -- Short excerpt/description
ADD COLUMN IF NOT EXISTS read_time_minutes INTEGER; -- Estimated read time

-- -----------------------------------------------------------------------------
-- RLS for new tables
-- -----------------------------------------------------------------------------
ALTER TABLE public.asset_price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_history_read_all ON public.asset_price_history;
CREATE POLICY price_history_read_all ON public.asset_price_history 
    FOR SELECT USING (true);

ALTER TABLE public.symbol_lookup_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS symbol_cache_read_all ON public.symbol_lookup_cache;
CREATE POLICY symbol_cache_read_all ON public.symbol_lookup_cache 
    FOR SELECT USING (true);

-- -----------------------------------------------------------------------------
-- HELPFUL VIEW: Asset with latest price data
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_assets_with_prices AS
SELECT 
    a.id,
    a.symbol,
    a.name,
    a.asset_type,
    a.exchange,
    a.sector,
    a.current_price,
    a.previous_close,
    a.price_change_24h,
    a.price_change_pct_24h,
    a.day_high,
    a.day_low,
    a.week_52_high,
    a.week_52_low,
    a.volume,
    a.nav,
    a.nav_change,
    a.market_cap,
    a.pe_ratio,
    a.dividend_yield,
    a.last_price_update,
    -- Calculate distance from 52-week high/low
    CASE 
        WHEN a.week_52_high > 0 THEN 
            ROUND(((a.current_price - a.week_52_high) / a.week_52_high * 100)::numeric, 2)
        ELSE NULL 
    END as pct_from_52w_high,
    CASE 
        WHEN a.week_52_low > 0 THEN 
            ROUND(((a.current_price - a.week_52_low) / a.week_52_low * 100)::numeric, 2)
        ELSE NULL 
    END as pct_from_52w_low
FROM public.assets a
WHERE a.is_active = true;

-- -----------------------------------------------------------------------------
-- COMMENTS
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.asset_price_history IS 'Daily price snapshots for historical tracking';
COMMENT ON TABLE public.symbol_lookup_cache IS 'Cache for symbol search results from external APIs';
COMMENT ON COLUMN public.assets.nav IS 'Net Asset Value for mutual funds';
COMMENT ON COLUMN public.assets.week_52_high IS '52-week high price';
COMMENT ON COLUMN public.assets.week_52_low IS '52-week low price';
