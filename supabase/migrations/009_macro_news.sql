-- Migration 009: Add macro_news table for general market headlines
-- This stores non-portfolio-specific news for Market Headlines section

CREATE TABLE IF NOT EXISTS public.macro_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL,
  category TEXT DEFAULT 'general', -- 'fed', 'economy', 'geopolitical', 'sector', 'general'
  published_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  relevance_score NUMERIC(3,2) DEFAULT 0.50,
  why_it_matters TEXT, -- Pre-generated or LLM-generated importance
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_macro_news_published_at ON public.macro_news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_macro_news_category ON public.macro_news(category);

-- RLS policies (macro news is public/read-only for authenticated users)
ALTER TABLE public.macro_news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read macro news"
  ON public.macro_news FOR SELECT
  USING (true);

-- Only service role can insert/update macro news  
CREATE POLICY "Service role can manage macro news"
  ON public.macro_news FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.macro_news IS 'General market headlines for briefing Market Headlines section';
COMMENT ON COLUMN public.macro_news.category IS 'News category: fed (Federal Reserve), economy (GDP/jobs/inflation), geopolitical, sector, general';
COMMENT ON COLUMN public.macro_news.why_it_matters IS 'One-sentence explanation of market importance';
