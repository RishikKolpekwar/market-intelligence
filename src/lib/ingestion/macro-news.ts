/**
 * Macro News Ingestion
 * Fetches general market news for the Market Headlines section
 * Focus: Fed policy, economic indicators, geopolitical events, sector trends
 */

import { createServerClient } from '@/lib/supabase/client';

// RSS feeds for macro/general market news - prioritize Google News for trending
const MACRO_NEWS_FEEDS = [
  // GOOGLE NEWS - Top trending business/market news
  { url: 'https://news.google.com/rss/search?q=stock+market&hl=en-US&gl=US&ceid=US:en', category: 'general', name: 'Google News', priority: 1 },
  { url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', category: 'general', name: 'Google News Business', priority: 1 },
  { url: 'https://news.google.com/rss/search?q=S%26P+500+OR+Dow+Jones+OR+NASDAQ&hl=en-US&gl=US&ceid=US:en', category: 'general', name: 'Google News Markets', priority: 1 },
  { url: 'https://news.google.com/rss/search?q=Federal+Reserve+OR+interest+rates&hl=en-US&gl=US&ceid=US:en', category: 'fed', name: 'Google News Fed', priority: 1 },
  
  // Backup sources
  { url: 'https://feeds.marketwatch.com/marketwatch/topstories/', category: 'economy', name: 'MarketWatch', priority: 2 },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', category: 'general', name: 'CNBC Top News', priority: 2 },
  { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US', category: 'general', name: 'Yahoo Finance', priority: 2 },
  { url: 'https://www.reuters.com/rssfeed/businessNews', category: 'sector', name: 'Reuters Business', priority: 2 },
];

// Keywords that indicate macro-relevant news
const MACRO_KEYWORDS = [
  // Fed & Monetary
  'federal reserve', 'fed', 'interest rate', 'rate cut', 'rate hike', 'powell', 'fomc', 'monetary policy',
  'quantitative', 'inflation', 'deflation', 'cpi', 'pce',
  // Economic Indicators
  'gdp', 'unemployment', 'jobs report', 'nonfarm payroll', 'consumer confidence', 'retail sales',
  'housing starts', 'manufacturing', 'pmi', 'ism', 'economic growth', 'recession',
  // Markets & Indices
  's&p 500', 'dow jones', 'nasdaq', 'russell', 'market rally', 'market selloff', 'correction',
  'bull market', 'bear market', 'volatility', 'vix',
  // Geopolitical
  'trade war', 'tariff', 'sanctions', 'geopolitical', 'china trade', 'eu', 'opec', 'oil price',
  // Sector-wide
  'tech sector', 'financial sector', 'energy sector', 'healthcare sector', 'semiconductor', 'ai sector',
];

interface MacroNewsItem {
  title: string;
  summary?: string;
  url: string;
  sourceName: string;
  category: string;
  publishedAt: Date;
  relevanceScore: number;
  whyItMatters?: string;
}

/**
 * Calculate relevance score for macro news
 */
function calculateMacroRelevance(title: string, summary: string = ''): number {
  const text = `${title} ${summary}`.toLowerCase();
  let score = 0.4; // Base score
  
  // Check for macro keywords
  let keywordMatches = 0;
  for (const keyword of MACRO_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      keywordMatches++;
    }
  }
  
  // More keywords = higher relevance (up to 0.4 bonus)
  score += Math.min(keywordMatches * 0.08, 0.4);
  
  // Boost for title matches (more important)
  for (const keyword of MACRO_KEYWORDS.slice(0, 20)) { // Top priority keywords
    if (title.toLowerCase().includes(keyword.toLowerCase())) {
      score += 0.05;
    }
  }
  
  return Math.min(score, 1.0);
}

/**
 * Generate "Why it matters" for macro news
 */
function generateWhyItMatters(title: string, category: string): string {
  const titleLower = title.toLowerCase();
  
  if (category === 'fed' || titleLower.includes('fed') || titleLower.includes('rate')) {
    return 'Federal Reserve policy directly impacts borrowing costs and equity valuations.';
  }
  if (titleLower.includes('inflation') || titleLower.includes('cpi')) {
    return 'Inflation data influences Fed policy and consumer purchasing power.';
  }
  if (titleLower.includes('jobs') || titleLower.includes('unemployment')) {
    return 'Employment data signals economic health and consumer spending capacity.';
  }
  if (titleLower.includes('gdp') || titleLower.includes('growth')) {
    return 'Economic growth metrics affect corporate earnings expectations.';
  }
  if (titleLower.includes('china') || titleLower.includes('trade')) {
    return 'Trade dynamics impact global supply chains and multinational revenues.';
  }
  if (titleLower.includes('oil') || titleLower.includes('energy')) {
    return 'Energy prices affect production costs across all sectors.';
  }
  if (titleLower.includes('tech') || titleLower.includes('semiconductor')) {
    return 'Technology sector trends drive broader market movements.';
  }
  
  return 'Market-moving news affecting investment sentiment and valuations.';
}

/**
 * Fetch macro news from NewsAPI
 */
export async function fetchMacroNewsFromNewsAPI(): Promise<MacroNewsItem[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    console.warn('NEWS_API_KEY not configured for macro news');
    return [];
  }
  
  const results: MacroNewsItem[] = [];
  
  // Queries for different macro categories
  const queries = [
    { q: 'Federal Reserve OR interest rate OR FOMC', category: 'fed' },
    { q: 'stock market OR S&P 500 OR Dow Jones', category: 'general' },
    { q: 'inflation OR GDP OR employment report', category: 'economy' },
    { q: 'trade policy OR tariffs OR geopolitical', category: 'geopolitical' },
  ];
  
  for (const query of queries) {
    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query.q)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${apiKey}`;
      const res = await fetch(url);
      
      if (!res.ok) continue;
      
      const data = await res.json();
      
      for (const article of data.articles || []) {
        if (!article.title || !article.url) continue;
        
        const relevanceScore = calculateMacroRelevance(article.title, article.description);
        
        // Only include if reasonably relevant
        if (relevanceScore >= 0.5) {
          results.push({
            title: article.title,
            summary: article.description,
            url: article.url,
            sourceName: article.source?.name || 'News',
            category: query.category,
            publishedAt: new Date(article.publishedAt),
            relevanceScore,
            whyItMatters: generateWhyItMatters(article.title, query.category),
          });
        }
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 200));
    } catch (error) {
      console.error(`Error fetching macro news for query "${query.q}":`, error);
    }
  }
  
  return results;
}

/**
 * Fetch macro news from RSS feeds (prioritized)
 */
export async function fetchMacroNewsFromRSS(): Promise<MacroNewsItem[]> {
  const results: MacroNewsItem[] = [];
  
  // Sort feeds by priority (lower = higher priority)
  const sortedFeeds = [...MACRO_NEWS_FEEDS].sort((a, b) => 
    ((a as any).priority || 3) - ((b as any).priority || 3)
  );
  
  for (const feed of sortedFeeds) {
    try {
      console.log(`[MacroNews] Fetching from ${feed.name}...`);
      const res = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MarketIntelligence/1.0)',
        },
      });
      if (!res.ok) {
        console.warn(`[MacroNews] ${feed.name} returned ${res.status}`);
        continue;
      }
      
      const text = await res.text();
      
      // Simple RSS parsing (extract <item> elements)
      const itemMatches = text.match(/<item>([\s\S]*?)<\/item>/gi) || [];
      console.log(`[MacroNews] ${feed.name}: found ${itemMatches.length} items`);
      
      for (const itemXml of itemMatches.slice(0, 8)) {
        const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i);
        const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/i);
        const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/i);
        const dateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/i);
        // Google News uses <source> tag for actual source
        const sourceMatch = itemXml.match(/<source[^>]*>(.*?)<\/source>/i);
        
        if (!titleMatch || !linkMatch) continue;
        
        let title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
        // Clean up HTML entities
        title = title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        
        const url = linkMatch[1].trim();
        let summary = descMatch ? descMatch[1].replace(/<[^>]*>/g, '').trim() : '';
        summary = summary.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        
        const publishedAt = dateMatch ? new Date(dateMatch[1]) : new Date();
        
        // Use the actual source name if from Google News
        let sourceName = feed.name;
        if (sourceMatch && feed.name.includes('Google News')) {
          sourceName = sourceMatch[1].trim();
        }
        
        // For Google News, boost relevance (these are already trending)
        const baseRelevance = (feed as any).priority === 1 ? 0.2 : 0;
        const relevanceScore = calculateMacroRelevance(title, summary) + baseRelevance;
        
        // Lower threshold for Google News (already curated)
        const threshold = (feed as any).priority === 1 ? 0.35 : 0.45;
        
        if (relevanceScore >= threshold) {
          results.push({
            title,
            summary: summary.substring(0, 500),
            url,
            sourceName,
            category: feed.category,
            publishedAt,
            relevanceScore: Math.min(relevanceScore, 1.0),
            whyItMatters: generateWhyItMatters(title, feed.category),
          });
        }
      }
    } catch (error) {
      console.error(`[MacroNews] Error fetching RSS feed ${feed.name}:`, error);
    }
  }
  
  return results;
}

/**
 * Ingest macro news and save to database
 */
export async function ingestMacroNews(): Promise<{ ingested: number; errors: number }> {
  const supabase = createServerClient();
  let ingested = 0;
  let errors = 0;
  
  // Fetch from both sources
  const [newsApiResults, rssResults] = await Promise.all([
    fetchMacroNewsFromNewsAPI(),
    fetchMacroNewsFromRSS(),
  ]);
  
  const allNews = [...newsApiResults, ...rssResults];
  
  // Deduplicate by URL
  const seenUrls = new Set<string>();
  const uniqueNews = allNews.filter(item => {
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);
    return true;
  });
  
  // Sort by relevance and recency
  uniqueNews.sort((a, b) => {
    const scoreDiff = b.relevanceScore - a.relevanceScore;
    if (Math.abs(scoreDiff) > 0.1) return scoreDiff;
    return b.publishedAt.getTime() - a.publishedAt.getTime();
  });
  
  // Insert top 20 items
  for (const item of uniqueNews.slice(0, 20)) {
    try {
      const { error } = await supabase.from('macro_news').upsert({
        title: item.title,
        summary: item.summary,
        url: item.url,
        source_name: item.sourceName,
        category: item.category,
        published_at: item.publishedAt.toISOString(),
        relevance_score: item.relevanceScore,
        why_it_matters: item.whyItMatters,
      }, { onConflict: 'url' });
      
      if (error) {
        console.error('Error inserting macro news:', error);
        errors++;
      } else {
        ingested++;
      }
    } catch (e) {
      errors++;
    }
  }
  
  return { ingested, errors };
}

/**
 * Get recent macro news for briefing
 * Falls back to news_items if macro_news is empty
 */
export async function getRecentMacroNews(
  hoursBack: number = 48,
  limit: number = 5
): Promise<MacroNewsItem[]> {
  const supabase = createServerClient();
  
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - hoursBack);
  
  // Try macro_news table first
  const { data: macroData, error: macroError } = await supabase
    .from('macro_news')
    .select('*')
    .eq('is_active', true)
    .gte('published_at', cutoff.toISOString())
    .order('relevance_score', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(limit);
  
  if (!macroError && macroData && macroData.length > 0) {
    console.log(`[MacroNews] Found ${macroData.length} items from macro_news table`);
    return macroData.map(item => ({
      title: item.title,
      summary: item.summary,
      url: item.url,
      sourceName: item.source_name,
      category: item.category,
      publishedAt: new Date(item.published_at),
      relevanceScore: item.relevance_score,
      whyItMatters: item.why_it_matters,
    }));
  }
  
  // FALLBACK: Use news_items table (general news, not portfolio-specific)
  console.log(`[MacroNews] macro_news empty, falling back to news_items...`);
  
  const { data: newsData, error: newsError } = await supabase
    .from('news_items')
    .select('*')
    .gte('published_at', cutoff.toISOString())
    .order('published_at', { ascending: false })
    .limit(limit * 3); // Get more to filter
  
  if (newsError || !newsData || newsData.length === 0) {
    console.error('[MacroNews] Both sources empty:', newsError);
    return [];
  }
  
  // Filter and score for macro relevance
  const scoredNews = newsData
    .map(item => {
      const relevanceScore = calculateMacroRelevance(item.title, item.summary || '');
      return {
        title: item.title,
        summary: item.summary,
        url: item.url,
        sourceName: item.source_name,
        category: 'general',
        publishedAt: new Date(item.published_at),
        relevanceScore,
        whyItMatters: generateWhyItMatters(item.title, 'general'),
      };
    })
    .filter(item => item.relevanceScore >= 0.3) // Lower threshold for fallback
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
  
  console.log(`[MacroNews] Found ${scoredNews.length} items from news_items fallback`);
  return scoredNews;
}
