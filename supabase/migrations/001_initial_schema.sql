-- =============================================================================
-- MARKET INTELLIGENCE BRIEFING - DATABASE SCHEMA
-- =============================================================================
-- This schema is designed for Supabase (PostgreSQL) with Row Level Security
-- Run this in your Supabase SQL Editor
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text matching

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- USERS TABLE
-- Extends Supabase auth.users with application-specific data
-- -----------------------------------------------------------------------------
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    timezone TEXT DEFAULT 'UTC',
    email_enabled BOOLEAN DEFAULT true,
    email_frequency TEXT DEFAULT 'daily' CHECK (email_frequency IN ('daily', 'weekly', 'disabled')),
    preferred_send_hour INTEGER DEFAULT 7 CHECK (preferred_send_hour >= 0 AND preferred_send_hour <= 23),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for email lookups
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_email_enabled ON public.users(email_enabled) WHERE email_enabled = true;

-- -----------------------------------------------------------------------------
-- ASSETS TABLE
-- Master list of trackable stocks, ETFs, and other securities
-- -----------------------------------------------------------------------------
CREATE TABLE public.assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('stock', 'etf', 'crypto', 'index')),
    exchange TEXT,
    sector TEXT,
    industry TEXT,
    -- Keywords for matching news (company name variations, ticker, etc.)
    keywords TEXT[] DEFAULT '{}',
    -- Market data cache
    current_price DECIMAL(20, 4),
    price_change_24h DECIMAL(10, 4),
    price_change_pct_24h DECIMAL(10, 4),
    market_cap BIGINT,
    last_price_update TIMESTAMPTZ,
    -- Metadata
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for asset lookups
CREATE INDEX idx_assets_symbol ON public.assets(symbol);
CREATE INDEX idx_assets_type ON public.assets(asset_type);
CREATE INDEX idx_assets_keywords ON public.assets USING GIN(keywords);
CREATE INDEX idx_assets_name_trgm ON public.assets USING GIN(name gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- USER_ASSETS TABLE (many-to-many)
-- Tracks which assets each user is monitoring
-- -----------------------------------------------------------------------------
CREATE TABLE public.user_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    -- User can customize alert sensitivity per asset
    importance_level TEXT DEFAULT 'normal' CHECK (importance_level IN ('low', 'normal', 'high', 'critical')),
    -- Optional: user's position size for contextual relevance
    shares_held DECIMAL(20, 6),
    average_cost DECIMAL(20, 4),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, asset_id)
);

-- Indexes for efficient lookups
CREATE INDEX idx_user_assets_user ON public.user_assets(user_id);
CREATE INDEX idx_user_assets_asset ON public.user_assets(asset_id);

-- -----------------------------------------------------------------------------
-- NEWS_SOURCES TABLE
-- Configuration for each news source (API or RSS)
-- -----------------------------------------------------------------------------
CREATE TABLE public.news_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL CHECK (source_type IN ('api', 'rss')),
    base_url TEXT,
    -- Credibility score for ranking (1-10)
    credibility_score INTEGER DEFAULT 5 CHECK (credibility_score >= 1 AND credibility_score <= 10),
    -- Rate limiting config
    requests_per_minute INTEGER DEFAULT 10,
    last_fetch_at TIMESTAMPTZ,
    -- Status
    is_active BOOLEAN DEFAULT true,
    -- Configuration JSON (API keys stored in env, this is for params)
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- NEWS_ITEMS TABLE
-- Normalized news articles from all sources
-- -----------------------------------------------------------------------------
CREATE TABLE public.news_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Source tracking
    source_id UUID REFERENCES public.news_sources(id),
    source_name TEXT NOT NULL,
    external_id TEXT, -- Original ID from source
    -- Content
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT, -- Full content if available
    url TEXT NOT NULL,
    image_url TEXT,
    author TEXT,
    -- Timing
    published_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ DEFAULT NOW(),
    -- Categorization
    category TEXT,
    tags TEXT[] DEFAULT '{}',
    -- Extracted entities (tickers, companies mentioned)
    mentioned_symbols TEXT[] DEFAULT '{}',
    mentioned_entities TEXT[] DEFAULT '{}',
    -- Deduplication
    content_hash TEXT NOT NULL, -- Hash of title + URL for dedup
    -- Sentiment (optional, from LLM or API)
    sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
    sentiment_score DECIMAL(3, 2), -- -1.0 to 1.0
    -- Processing status
    is_processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for news queries
CREATE UNIQUE INDEX idx_news_items_hash ON public.news_items(content_hash);
CREATE INDEX idx_news_items_published ON public.news_items(published_at DESC);
CREATE INDEX idx_news_items_source ON public.news_items(source_id);
CREATE INDEX idx_news_items_symbols ON public.news_items USING GIN(mentioned_symbols);
CREATE INDEX idx_news_items_entities ON public.news_items USING GIN(mentioned_entities);
CREATE INDEX idx_news_items_title_trgm ON public.news_items USING GIN(title gin_trgm_ops);
-- Note: Removed partial index with NOW() - not allowed in PostgreSQL

-- -----------------------------------------------------------------------------
-- NEWS_ASSET_RELEVANCE TABLE
-- Links news items to relevant assets with relevance scores
-- -----------------------------------------------------------------------------
CREATE TABLE public.news_asset_relevance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    news_item_id UUID NOT NULL REFERENCES public.news_items(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    -- How the match was determined
    match_type TEXT NOT NULL CHECK (match_type IN ('symbol_mention', 'keyword_match', 'llm_inferred', 'manual')),
    -- Relevance strength (0.0 to 1.0)
    relevance_score DECIMAL(3, 2) DEFAULT 0.5 CHECK (relevance_score >= 0 AND relevance_score <= 1),
    -- Which keywords/entities triggered the match
    matched_terms TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(news_item_id, asset_id)
);

-- Indexes for relevance lookups
CREATE INDEX idx_relevance_news ON public.news_asset_relevance(news_item_id);
CREATE INDEX idx_relevance_asset ON public.news_asset_relevance(asset_id);
CREATE INDEX idx_relevance_score ON public.news_asset_relevance(relevance_score DESC);

-- -----------------------------------------------------------------------------
-- EMAIL_SEND_LOG TABLE
-- Tracks all email sends for idempotency and debugging
-- -----------------------------------------------------------------------------
CREATE TABLE public.email_send_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    -- Date key for idempotency (YYYY-MM-DD format)
    briefing_date DATE NOT NULL,
    -- Email details
    email_type TEXT DEFAULT 'daily_briefing' CHECK (email_type IN ('daily_briefing', 'weekly_digest', 'alert')),
    subject TEXT,
    -- Status tracking
    status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    sent_at TIMESTAMPTZ,
    -- External tracking
    mailersend_id TEXT,
    -- Error tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    -- Content reference (store briefing ID or summary)
    briefing_content_hash TEXT,
    news_item_count INTEGER,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Ensure one email per user per day per type
    UNIQUE(user_id, briefing_date, email_type)
);

-- Indexes for email log queries
CREATE INDEX idx_email_log_user ON public.email_send_log(user_id);
CREATE INDEX idx_email_log_date ON public.email_send_log(briefing_date DESC);
CREATE INDEX idx_email_log_status ON public.email_send_log(status);

-- -----------------------------------------------------------------------------
-- DAILY_BRIEFINGS TABLE
-- Stores generated briefings for reference/debugging
-- -----------------------------------------------------------------------------
CREATE TABLE public.daily_briefings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    briefing_date DATE NOT NULL,
    -- Generated content
    market_overview TEXT,
    asset_summaries JSONB DEFAULT '[]', -- Array of {asset_id, summary, news_count}
    notable_headlines JSONB DEFAULT '[]', -- Array of {title, url, source}
    full_briefing_html TEXT,
    full_briefing_text TEXT,
    -- Stats
    total_news_items INTEGER DEFAULT 0,
    assets_covered INTEGER DEFAULT 0,
    -- LLM metadata
    llm_model TEXT,
    llm_tokens_used INTEGER,
    generation_time_ms INTEGER,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, briefing_date)
);

-- Index for briefing lookups
CREATE INDEX idx_briefings_user_date ON public.daily_briefings(user_id, briefing_date DESC);

-- -----------------------------------------------------------------------------
-- INGESTION_LOG TABLE
-- Tracks each ingestion run for monitoring
-- -----------------------------------------------------------------------------
CREATE TABLE public.ingestion_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID REFERENCES public.news_sources(id),
    source_name TEXT NOT NULL,
    run_type TEXT CHECK (run_type IN ('scheduled', 'manual', 'backfill')),
    -- Results
    status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
    items_fetched INTEGER DEFAULT 0,
    items_new INTEGER DEFAULT 0,
    items_duplicate INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    -- Error tracking
    error_message TEXT,
    error_details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for monitoring queries
CREATE INDEX idx_ingestion_log_date ON public.ingestion_log(started_at DESC);
CREATE INDEX idx_ingestion_log_source ON public.ingestion_log(source_id);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_briefings ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own data
CREATE POLICY users_self_access ON public.users
    FOR ALL USING (auth.uid() = id);

CREATE POLICY user_assets_self_access ON public.user_assets
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY email_log_self_access ON public.email_send_log
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY briefings_self_access ON public.daily_briefings
    FOR ALL USING (auth.uid() = user_id);

-- Assets and news are publicly readable (no user-specific data)
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY assets_read_all ON public.assets FOR SELECT USING (true);

ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY news_read_all ON public.news_items FOR SELECT USING (true);

ALTER TABLE public.news_asset_relevance ENABLE ROW LEVEL SECURITY;
CREATE POLICY relevance_read_all ON public.news_asset_relevance FOR SELECT USING (true);

ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY sources_read_all ON public.news_sources FOR SELECT USING (true);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
CREATE TRIGGER update_users_timestamp
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_assets_timestamp
    BEFORE UPDATE ON public.assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_assets_timestamp
    BEFORE UPDATE ON public.user_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_news_sources_timestamp
    BEFORE UPDATE ON public.news_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_email_log_timestamp
    BEFORE UPDATE ON public.email_send_log
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- SEED DATA - Common Assets
-- =============================================================================

INSERT INTO public.assets (symbol, name, asset_type, exchange, sector, keywords) VALUES
-- Major Tech Stocks
('AAPL', 'Apple Inc.', 'stock', 'NASDAQ', 'Technology', ARRAY['Apple', 'iPhone', 'iPad', 'Mac', 'Tim Cook', 'Cupertino']),
('MSFT', 'Microsoft Corporation', 'stock', 'NASDAQ', 'Technology', ARRAY['Microsoft', 'Windows', 'Azure', 'Satya Nadella', 'Xbox', 'Office 365']),
('GOOGL', 'Alphabet Inc.', 'stock', 'NASDAQ', 'Technology', ARRAY['Google', 'Alphabet', 'YouTube', 'Android', 'Sundar Pichai', 'Search']),
('AMZN', 'Amazon.com Inc.', 'stock', 'NASDAQ', 'Consumer Cyclical', ARRAY['Amazon', 'AWS', 'Prime', 'Andy Jassy', 'Bezos', 'e-commerce']),
('NVDA', 'NVIDIA Corporation', 'stock', 'NASDAQ', 'Technology', ARRAY['NVIDIA', 'GPU', 'Jensen Huang', 'AI chips', 'GeForce', 'CUDA']),
('META', 'Meta Platforms Inc.', 'stock', 'NASDAQ', 'Technology', ARRAY['Meta', 'Facebook', 'Instagram', 'WhatsApp', 'Zuckerberg', 'Metaverse']),
('TSLA', 'Tesla Inc.', 'stock', 'NASDAQ', 'Consumer Cyclical', ARRAY['Tesla', 'Elon Musk', 'EV', 'electric vehicle', 'Cybertruck', 'Model']),

-- Financial
('JPM', 'JPMorgan Chase & Co.', 'stock', 'NYSE', 'Financial Services', ARRAY['JPMorgan', 'Chase', 'Jamie Dimon', 'banking']),
('V', 'Visa Inc.', 'stock', 'NYSE', 'Financial Services', ARRAY['Visa', 'payments', 'credit card']),
('MA', 'Mastercard Inc.', 'stock', 'NYSE', 'Financial Services', ARRAY['Mastercard', 'payments', 'credit card']),

-- Healthcare
('JNJ', 'Johnson & Johnson', 'stock', 'NYSE', 'Healthcare', ARRAY['Johnson & Johnson', 'J&J', 'pharmaceutical']),
('UNH', 'UnitedHealth Group', 'stock', 'NYSE', 'Healthcare', ARRAY['UnitedHealth', 'health insurance']),

-- Major ETFs
('SPY', 'SPDR S&P 500 ETF', 'etf', 'NYSE', NULL, ARRAY['S&P 500', 'SPY', 'index fund', 'market']),
('QQQ', 'Invesco QQQ Trust', 'etf', 'NASDAQ', NULL, ARRAY['QQQ', 'Nasdaq 100', 'tech ETF']),
('VTI', 'Vanguard Total Stock Market ETF', 'etf', 'NYSE', NULL, ARRAY['VTI', 'Vanguard', 'total market']),
('IWM', 'iShares Russell 2000 ETF', 'etf', 'NYSE', NULL, ARRAY['Russell 2000', 'small cap', 'IWM']),
('DIA', 'SPDR Dow Jones Industrial Average ETF', 'etf', 'NYSE', NULL, ARRAY['Dow Jones', 'DIA', 'Dow']),

-- Indexes (for reference)
('^GSPC', 'S&P 500 Index', 'index', NULL, NULL, ARRAY['S&P 500', 'S&P', 'stock market']),
('^DJI', 'Dow Jones Industrial Average', 'index', NULL, NULL, ARRAY['Dow Jones', 'Dow', 'DJIA']),
('^IXIC', 'NASDAQ Composite', 'index', NULL, NULL, ARRAY['NASDAQ', 'Nasdaq Composite'])

ON CONFLICT (symbol) DO NOTHING;

-- Insert default news sources
INSERT INTO public.news_sources (name, source_type, base_url, credibility_score, config) VALUES
('NewsAPI', 'api', 'https://newsapi.org/v2', 7, '{"category": "business"}'),
('Finnhub', 'api', 'https://finnhub.io/api/v1', 8, '{}'),
('Reuters RSS', 'rss', 'https://www.reutersagency.com/feed/', 9, '{}'),
('Yahoo Finance RSS', 'rss', 'https://finance.yahoo.com/rss/', 7, '{}'),
('MarketWatch RSS', 'rss', 'https://feeds.marketwatch.com/marketwatch/topstories/', 7, '{}'),
('Bloomberg RSS', 'rss', 'https://feeds.bloomberg.com/markets/news.rss', 9, '{}')
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- USEFUL VIEWS
-- =============================================================================

-- View: Recent news for an asset (last 24 hours)
CREATE OR REPLACE VIEW v_recent_asset_news AS
SELECT 
    a.symbol,
    a.name as asset_name,
    ni.title,
    ni.summary,
    ni.url,
    ni.source_name,
    ni.published_at,
    nar.relevance_score,
    nar.match_type
FROM public.news_asset_relevance nar
JOIN public.news_items ni ON ni.id = nar.news_item_id
JOIN public.assets a ON a.id = nar.asset_id
WHERE ni.published_at > NOW() - INTERVAL '24 hours'
ORDER BY ni.published_at DESC;

-- View: User portfolio with recent news counts
CREATE OR REPLACE VIEW v_user_portfolio_summary AS
SELECT 
    ua.user_id,
    a.symbol,
    a.name,
    a.asset_type,
    a.current_price,
    a.price_change_pct_24h,
    ua.importance_level,
    ua.shares_held,
    (SELECT COUNT(*) 
     FROM public.news_asset_relevance nar 
     JOIN public.news_items ni ON ni.id = nar.news_item_id
     WHERE nar.asset_id = a.id 
     AND ni.published_at > NOW() - INTERVAL '24 hours') as news_count_24h
FROM public.user_assets ua
JOIN public.assets a ON a.id = ua.asset_id
ORDER BY ua.importance_level DESC, news_count_24h DESC;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE public.users IS 'User profiles extending Supabase auth';
COMMENT ON TABLE public.assets IS 'Master list of trackable securities';
COMMENT ON TABLE public.user_assets IS 'User watchlist / portfolio tracking';
COMMENT ON TABLE public.news_items IS 'Normalized news articles from all sources';
COMMENT ON TABLE public.news_asset_relevance IS 'Links between news and relevant assets';
COMMENT ON TABLE public.email_send_log IS 'Email delivery tracking for idempotency';
COMMENT ON TABLE public.daily_briefings IS 'Generated daily briefing content';
COMMENT ON TABLE public.ingestion_log IS 'Monitoring log for data ingestion runs';
