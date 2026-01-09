-- =============================================================================
-- PORTFOLIOS/FUNDS FEATURE
-- Allows users to create multiple portfolios to organize their investments
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PORTFOLIOS TABLE
-- Each user can have multiple portfolios (funds)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portfolios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    -- Portfolio type for categorization
    portfolio_type TEXT DEFAULT 'investment' CHECK (portfolio_type IN ('investment', 'watchlist', 'retirement', 'trading', 'other')),
    -- Visual customization
    color TEXT DEFAULT '#3B82F6', -- Default blue
    icon TEXT DEFAULT '📈',
    -- Settings
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    -- Cached totals (updated on asset changes)
    total_value DECIMAL(20, 4) DEFAULT 0,
    total_cost_basis DECIMAL(20, 4) DEFAULT 0,
    total_gain_loss DECIMAL(20, 4) DEFAULT 0,
    total_gain_loss_pct DECIMAL(10, 4) DEFAULT 0,
    asset_count INTEGER DEFAULT 0,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portfolios_user ON public.portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_default ON public.portfolios(user_id, is_default) WHERE is_default = true;

-- -----------------------------------------------------------------------------
-- UPDATE USER_ASSETS TABLE - Add portfolio reference
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_assets 
ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE;

-- Index for portfolio lookups
CREATE INDEX IF NOT EXISTS idx_user_assets_portfolio ON public.user_assets(portfolio_id);

-- -----------------------------------------------------------------------------
-- RLS POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own portfolios
DROP POLICY IF EXISTS portfolios_self_access ON public.portfolios;
CREATE POLICY portfolios_self_access ON public.portfolios
    FOR ALL USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- FUNCTION: Create default portfolio for new users
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_default_portfolio()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.portfolios (user_id, name, description, is_default)
    VALUES (NEW.id, 'My Portfolio', 'Default investment portfolio', true);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create default portfolio when user is created
DROP TRIGGER IF EXISTS on_user_created_portfolio ON public.users;
CREATE TRIGGER on_user_created_portfolio
    AFTER INSERT ON public.users
    FOR EACH ROW EXECUTE FUNCTION create_default_portfolio();

-- -----------------------------------------------------------------------------
-- FUNCTION: Migrate existing user_assets to default portfolio
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION migrate_assets_to_portfolios()
RETURNS void AS $$
DECLARE
    user_record RECORD;
    default_portfolio_id UUID;
BEGIN
    -- For each user with assets but no portfolio assignment
    FOR user_record IN 
        SELECT DISTINCT ua.user_id 
        FROM public.user_assets ua 
        WHERE ua.portfolio_id IS NULL
    LOOP
        -- Get or create default portfolio
        SELECT id INTO default_portfolio_id
        FROM public.portfolios 
        WHERE user_id = user_record.user_id AND is_default = true
        LIMIT 1;
        
        IF default_portfolio_id IS NULL THEN
            INSERT INTO public.portfolios (user_id, name, description, is_default)
            VALUES (user_record.user_id, 'My Portfolio', 'Default investment portfolio', true)
            RETURNING id INTO default_portfolio_id;
        END IF;
        
        -- Assign all unassigned assets to default portfolio
        UPDATE public.user_assets 
        SET portfolio_id = default_portfolio_id
        WHERE user_id = user_record.user_id AND portfolio_id IS NULL;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run the migration
SELECT migrate_assets_to_portfolios();

-- -----------------------------------------------------------------------------
-- FUNCTION: Update portfolio totals
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_portfolio_totals()
RETURNS TRIGGER AS $$
DECLARE
    portfolio_record RECORD;
BEGIN
    -- Get the portfolio ID from either NEW or OLD record
    IF TG_OP = 'DELETE' THEN
        SELECT * INTO portfolio_record FROM public.portfolios WHERE id = OLD.portfolio_id;
    ELSE
        SELECT * INTO portfolio_record FROM public.portfolios WHERE id = NEW.portfolio_id;
    END IF;
    
    IF portfolio_record.id IS NOT NULL THEN
        UPDATE public.portfolios p
        SET 
            total_value = COALESCE((
                SELECT SUM(COALESCE(ua.shares_held, 0) * COALESCE(a.current_price, 0))
                FROM public.user_assets ua
                JOIN public.assets a ON a.id = ua.asset_id
                WHERE ua.portfolio_id = p.id
            ), 0),
            total_cost_basis = COALESCE((
                SELECT SUM(COALESCE(ua.shares_held, 0) * COALESCE(ua.average_cost, 0))
                FROM public.user_assets ua
                WHERE ua.portfolio_id = p.id
            ), 0),
            asset_count = (
                SELECT COUNT(*)
                FROM public.user_assets ua
                WHERE ua.portfolio_id = p.id
            ),
            updated_at = NOW()
        WHERE p.id = portfolio_record.id;
        
        -- Update gain/loss fields
        UPDATE public.portfolios p
        SET 
            total_gain_loss = total_value - total_cost_basis,
            total_gain_loss_pct = CASE 
                WHEN total_cost_basis > 0 THEN ((total_value - total_cost_basis) / total_cost_basis * 100)
                ELSE 0 
            END
        WHERE p.id = portfolio_record.id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers to update portfolio totals
DROP TRIGGER IF EXISTS update_portfolio_on_asset_change ON public.user_assets;
CREATE TRIGGER update_portfolio_on_asset_change
    AFTER INSERT OR UPDATE OR DELETE ON public.user_assets
    FOR EACH ROW EXECUTE FUNCTION update_portfolio_totals();

-- -----------------------------------------------------------------------------
-- UPDATED TIMESTAMP TRIGGER
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_portfolios_timestamp ON public.portfolios;
CREATE TRIGGER update_portfolios_timestamp
    BEFORE UPDATE ON public.portfolios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -----------------------------------------------------------------------------
-- HELPFUL VIEW: Portfolio summary with assets
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_portfolio_summary AS
SELECT 
    p.id,
    p.user_id,
    p.name,
    p.description,
    p.portfolio_type,
    p.color,
    p.icon,
    p.is_default,
    p.total_value,
    p.total_cost_basis,
    p.total_gain_loss,
    p.total_gain_loss_pct,
    p.asset_count,
    p.created_at,
    p.updated_at
FROM public.portfolios p
WHERE p.is_active = true
ORDER BY p.is_default DESC, p.created_at ASC;

-- -----------------------------------------------------------------------------
-- COMMENTS
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.portfolios IS 'User investment portfolios/funds for organizing assets';
COMMENT ON COLUMN public.portfolios.is_default IS 'The default portfolio for new assets';
COMMENT ON COLUMN public.portfolios.total_value IS 'Cached total market value of all assets';
COMMENT ON COLUMN public.user_assets.portfolio_id IS 'The portfolio this asset belongs to';
