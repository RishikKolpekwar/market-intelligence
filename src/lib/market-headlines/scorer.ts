/**
 * Market Headlines Scoring System
 * Two-stage approach: deterministic ranking → LLM selection
 */

// Source credibility map (editable)
export const SOURCE_CREDIBILITY: Record<string, number> = {
  "Bloomberg": 1.00,
  "Reuters": 0.95,
  "Financial Times": 0.95,
  "WSJ": 0.90,
  "Wall Street Journal": 0.90,
  "The Economist": 0.90,
  "Barron's": 0.85,
  "CNBC": 0.80,
  "MarketWatch": 0.75,
  "Yahoo Finance": 0.70,
  "Motley Fool": 0.60,
};

// Macro keyword boost list
export const MACRO_KEYWORDS = [
  "Federal Reserve", "Fed", "interest rates", "inflation", "CPI", "PPI",
  "jobs report", "GDP", "Treasury", "bond yields", "oil", "energy",
  "geopolitics", "China", "Middle East", "AI", "artificial intelligence",
  "data center", "semiconductors", "earnings season", "guidance",
  "S&P 500", "Nasdaq", "Dow", "volatility", "VIX", "recession",
  "rate cut", "rate hike", "Powell", "FOMC", "tariffs", "trade war"
];

// Topic buckets for diversity
export enum TopicBucket {
  MACRO_RATES = "macro_rates",
  GEOPOLITICS_COMMODITIES = "geopolitics_commodities",
  TECH_AI = "tech_ai",
  MARKET_INDICES = "market_indices",
  EARNINGS_MICRO = "earnings_micro",
  REGULATORY = "regulatory"
}

export interface NewsCandidate {
  id: string;
  title: string;
  summary?: string;
  url: string;
  source_name: string;
  published_at: string;
  relevance_score?: number;
}

export interface ScoredCandidate extends NewsCandidate {
  score: number;
  recency_score: number;
  credibility_score: number;
  macro_boost: number;
  topic_bucket: TopicBucket;
}

/**
 * Calculate recency score with exponential decay
 */
export function calculateRecencyScore(publishedAt: string): number {
  const now = new Date();
  const published = new Date(publishedAt);
  const hoursOld = (now.getTime() - published.getTime()) / (1000 * 60 * 60);
  
  // Exponential decay: recent articles get higher scores
  return Math.exp(-hoursOld / 24);
}

/**
 * Get source credibility score
 */
export function getCredibilityScore(sourceName: string): number {
  // Normalize source name for matching
  const normalized = sourceName.trim();
  
  // Exact match
  if (SOURCE_CREDIBILITY[normalized]) {
    return SOURCE_CREDIBILITY[normalized];
  }
  
  // Partial match (case-insensitive)
  const lowerSource = normalized.toLowerCase();
  for (const [key, value] of Object.entries(SOURCE_CREDIBILITY)) {
    if (lowerSource.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerSource)) {
      return value;
    }
  }
  
  // Default for unknown sources
  return 0.50;
}

/**
 * Calculate macro keyword boost
 */
export function calculateMacroBoost(text: string): number {
  const lowerText = text.toLowerCase();
  let matches = 0;
  
  for (const keyword of MACRO_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matches++;
    }
  }
  
  // Cap at 3 keywords for diminishing returns
  return Math.min(matches, 3) * 0.1; // +0.1 per keyword, max +0.3
}

/**
 * Classify article into topic bucket
 */
export function classifyTopicBucket(title: string, summary?: string): TopicBucket {
  const text = `${title} ${summary || ""}`.toLowerCase();
  
  // Priority order for classification
  if (/(federal reserve|fed|interest rate|inflation|cpi|ppi|powell|fomc|treasury|bond|yield)/i.test(text)) {
    return TopicBucket.MACRO_RATES;
  }
  if (/(china|russia|middle east|geopolit|war|tariff|trade|oil|energy|commodit)/i.test(text)) {
    return TopicBucket.GEOPOLITICS_COMMODITIES;
  }
  if (/(ai|artificial intelligence|data center|semiconductor|nvidia|chip|tech)/i.test(text)) {
    return TopicBucket.TECH_AI;
  }
  if (/(s&p 500|nasdaq|dow|market|index|rally|sell.?off|volatility|vix)/i.test(text)) {
    return TopicBucket.MARKET_INDICES;
  }
  if (/(earnings|guidance|quarter|revenue|profit|forecast)/i.test(text)) {
    return TopicBucket.EARNINGS_MICRO;
  }
  if (/(sec|regulation|antitrust|lawsuit|investigation)/i.test(text)) {
    return TopicBucket.REGULATORY;
  }
  
  // Default
  return TopicBucket.MARKET_INDICES;
}

/**
 * Calculate Jaccard similarity for de-duplication
 */
export function jaccardSimilarity(text1: string, text2: string): number {
  const tokens1 = new Set(text1.toLowerCase().split(/\s+/));
  const tokens2 = new Set(text2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return intersection.size / union.size;
}

/**
 * Remove near-duplicate articles
 */
export function deduplicateArticles(articles: ScoredCandidate[], threshold: number = 0.5): ScoredCandidate[] {
  const result: ScoredCandidate[] = [];
  
  for (const article of articles) {
    let isDuplicate = false;
    
    for (const existing of result) {
      const similarity = jaccardSimilarity(article.title, existing.title);
      if (similarity >= threshold) {
        isDuplicate = true;
        // Keep the one with higher score
        if (article.score > existing.score) {
          const index = result.indexOf(existing);
          result[index] = article;
        }
        break;
      }
    }
    
    if (!isDuplicate) {
      result.push(article);
    }
  }
  
  return result;
}

/**
 * Ensure diversity across topic buckets
 */
export function ensureDiversity(articles: ScoredCandidate[], minBuckets: number = 3): ScoredCandidate[] {
  const bucketCounts = new Map<TopicBucket, number>();
  const selected: ScoredCandidate[] = [];
  
  // First pass: pick top from each bucket
  for (const bucket of Object.values(TopicBucket)) {
    const inBucket = articles.filter(a => a.topic_bucket === bucket);
    if (inBucket.length > 0) {
      selected.push(inBucket[0]);
      bucketCounts.set(bucket as TopicBucket, 1);
    }
    if (selected.length >= 5) break;
  }
  
  // Second pass: fill remaining slots with highest scores
  const remaining = articles.filter(a => !selected.includes(a));
  for (const article of remaining) {
    if (selected.length >= 5) break;
    selected.push(article);
  }
  
  return selected.slice(0, 5);
}

/**
 * Main scoring function
 */
export function scoreArticles(candidates: NewsCandidate[]): ScoredCandidate[] {
  const scored: ScoredCandidate[] = candidates.map(candidate => {
    const recency_score = calculateRecencyScore(candidate.published_at);
    const credibility_score = getCredibilityScore(candidate.source_name);
    const macro_boost = calculateMacroBoost(`${candidate.title} ${candidate.summary || ""}`);
    const topic_bucket = classifyTopicBucket(candidate.title, candidate.summary);
    
    // Combined score formula
    const base_relevance = candidate.relevance_score || 0.5;
    const score = (base_relevance * 0.3 + recency_score * 0.3 + credibility_score * 0.4) * (1 + macro_boost);
    
    return {
      ...candidate,
      score,
      recency_score,
      credibility_score,
      macro_boost,
      topic_bucket
    };
  });
  
  // Sort by score descending
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Full pipeline: score → dedupe → diversify
 */
export function selectTopCandidates(candidates: NewsCandidate[], limit: number = 20): ScoredCandidate[] {
  // Step 1: Score all
  const scored = scoreArticles(candidates);
  
  // Step 2: Deduplicate
  const deduplicated = deduplicateArticles(scored);
  
  // Step 3: Take top N
  return deduplicated.slice(0, limit);
}
