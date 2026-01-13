-- ========================================
-- SQL Validation Queries for Briefing Debug
-- ========================================

-- Query 1: Check user's tracked assets (replace USER_ID)
-- This should return rows if you have tracked assets
SELECT
  ua.id as user_asset_id,
  ua.user_id,
  ua.portfolio_id,
  ua.importance_level,
  a.id as asset_id,
  a.symbol,
  a.name,
  p.name as portfolio_name
FROM user_assets ua
JOIN assets a ON ua.asset_id = a.id
LEFT JOIN portfolios p ON ua.portfolio_id = p.id
WHERE ua.user_id = 'a0cabe63-e1ca-44e3-a979-ffda8de8880c'
ORDER BY p.name, a.symbol;

-- Query 2: Check news relevance for user's assets (last 14 days)
-- This should return news items matched to your assets
SELECT
  a.symbol,
  a.name,
  COUNT(DISTINCT nar.id) as relevance_count,
  COUNT(DISTINCT ni.id) as unique_news_items,
  MIN(ni.published_at) as oldest_article,
  MAX(ni.published_at) as newest_article
FROM user_assets ua
JOIN assets a ON ua.asset_id = a.id
LEFT JOIN news_asset_relevance nar ON nar.asset_id = a.id
LEFT JOIN news_items ni ON ni.id = nar.news_item_id
WHERE ua.user_id = 'a0cabe63-e1ca-44e3-a979-ffda8de8880c'
  AND ni.published_at >= NOW() - INTERVAL '14 days'
GROUP BY a.id, a.symbol, a.name
ORDER BY relevance_count DESC;

-- Query 3: Detailed news items for a specific asset
-- Replace ASSET_ID with one from Query 1
SELECT
  ni.id,
  ni.title,
  ni.source_name,
  ni.published_at,
  nar.relevance_score,
  nar.match_type,
  nar.matched_terms
FROM news_asset_relevance nar
JOIN news_items ni ON ni.id = nar.news_item_id
WHERE nar.asset_id = 'REPLACE_WITH_ASSET_ID'
  AND ni.published_at >= NOW() - INTERVAL '14 days'
ORDER BY ni.published_at DESC
LIMIT 10;

-- Query 4: Check RLS policies on user_assets
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'user_assets';

-- Query 5: Check RLS policies on news_asset_relevance
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'news_asset_relevance';

-- Query 6: Test RLS as authenticated user
-- Run this using the Supabase SQL editor while logged in as the user
-- or via psql with SET ROLE
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "a0cabe63-e1ca-44e3-a979-ffda8de8880c"}';

SELECT COUNT(*) as user_assets_visible
FROM user_assets
WHERE user_id = 'a0cabe63-e1ca-44e3-a979-ffda8de8880c';

RESET ROLE;
