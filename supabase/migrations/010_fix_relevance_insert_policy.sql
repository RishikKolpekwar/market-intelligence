-- Fix RLS policy for news_asset_relevance to allow server-side inserts
-- This is needed for the news ingestion system to link news items to assets

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "relevance_read_all" ON public.news_asset_relevance;

-- Recreate read policy
CREATE POLICY "relevance_read_all" 
  ON public.news_asset_relevance 
  FOR SELECT 
  USING (true);

-- Add insert policy for authenticated users (includes service role)
CREATE POLICY "relevance_insert_authenticated" 
  ON public.news_asset_relevance 
  FOR INSERT 
  WITH CHECK (true);

-- Add update policy (for upserts)
CREATE POLICY "relevance_update_authenticated" 
  ON public.news_asset_relevance 
  FOR UPDATE 
  USING (true);

COMMENT ON POLICY "relevance_insert_authenticated" ON public.news_asset_relevance 
IS 'Allow server-side news ingestion to link news items to assets';

COMMENT ON POLICY "relevance_update_authenticated" ON public.news_asset_relevance 
IS 'Allow server-side news ingestion to update relevance scores';
