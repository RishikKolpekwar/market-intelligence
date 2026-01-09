import crypto from 'crypto';
import { NormalizedArticle, NewsAPIArticle, FinnhubArticle, RSSItem, TiingoArticle } from '@/types/ingestion';

/**
 * Generate a content hash for deduplication
 * Uses title + URL to create a unique identifier
 */
export function generateContentHash(title: string, url: string): string {
  const normalized = `${title.toLowerCase().trim()}|${url.toLowerCase().trim()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 32);
}

/**
 * Extract stock symbols mentioned in text
 * Looks for $SYMBOL pattern and known ticker formats
 */
export function extractSymbolsFromText(text: string): string[] {
  const symbols = new Set<string>();

  // Match $SYMBOL pattern (e.g., $AAPL, $MSFT)
  const dollarPattern = /\$([A-Z]{1,5})\b/g;
  let match;
  while ((match = dollarPattern.exec(text)) !== null) {
    symbols.add(match[1]);
  }

  // Match standalone uppercase tickers (be conservative)
  // Only match if surrounded by spaces or punctuation
  const tickerPattern = /(?:^|[\s,.(])((?:AAPL|MSFT|GOOGL|GOOG|AMZN|NVDA|META|TSLA|JPM|V|MA|JNJ|UNH|SPY|QQQ|VTI|IWM|DIA))(?:[\s,.):]|$)/g;
  while ((match = tickerPattern.exec(text)) !== null) {
    symbols.add(match[1]);
  }

  return Array.from(symbols);
}

/**
 * Extract company/entity names from text
 * Basic extraction - can be enhanced with NLP later
 */
export function extractEntitiesFromText(text: string): string[] {
  const entities = new Set<string>();

  const knownEntities = [
    'Apple', 'Microsoft', 'Google', 'Alphabet', 'Amazon', 'NVIDIA',
    'Meta', 'Facebook', 'Tesla', 'JPMorgan', 'Visa', 'Mastercard',
    'Johnson & Johnson', 'UnitedHealth', 'Federal Reserve', 'Fed',
    'SEC', 'NYSE', 'NASDAQ', 'S&P', 'Dow Jones', 'Wall Street',
  ];

  const lowerText = text.toLowerCase();
  for (const entity of knownEntities) {
    if (lowerText.includes(entity.toLowerCase())) {
      entities.add(entity);
    }
  }

  return Array.from(entities);
}

/**
 * Normalize a NewsAPI article to our standard format
 */
export function normalizeNewsAPIArticle(article: NewsAPIArticle): NormalizedArticle {
  return {
    sourceName: article.source.name || 'NewsAPI',
    externalId: article.url, // NewsAPI doesn't provide unique IDs
    title: article.title,
    summary: article.description || undefined,
    content: article.content || undefined,
    url: article.url,
    imageUrl: article.urlToImage || undefined,
    author: article.author || undefined,
    publishedAt: new Date(article.publishedAt),
    mentionedSymbols: extractSymbolsFromText(`${article.title} ${article.description || ''}`),
    mentionedEntities: extractEntitiesFromText(`${article.title} ${article.description || ''}`),
  };
}

/**
 * Normalize a Finnhub article to our standard format
 */
export function normalizeFinnhubArticle(article: FinnhubArticle): NormalizedArticle {
  // Finnhub provides related tickers in the 'related' field
  const relatedSymbols = article.related
    ? article.related.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    sourceName: article.source || 'Finnhub',
    externalId: article.id.toString(),
    title: article.headline,
    summary: article.summary || undefined,
    url: article.url,
    imageUrl: article.image || undefined,
    publishedAt: new Date(article.datetime * 1000), // Finnhub uses Unix timestamp
    category: article.category || undefined,
    mentionedSymbols: [
      ...relatedSymbols,
      ...extractSymbolsFromText(`${article.headline} ${article.summary || ''}`),
    ],
    mentionedEntities: extractEntitiesFromText(`${article.headline} ${article.summary || ''}`),
  };
}

/**
 * Normalize an RSS feed item to our standard format
 */
export function normalizeRSSItem(item: RSSItem, feedName: string): NormalizedArticle {
  const publishedAt = item.isoDate
    ? new Date(item.isoDate)
    : item.pubDate
    ? new Date(item.pubDate)
    : new Date();

  return {
    sourceName: feedName,
    externalId: item.guid || item.link,
    title: item.title || 'Untitled',
    summary: item.contentSnippet || item.content?.substring(0, 500) || undefined,
    content: item.content || undefined,
    url: item.link || '',
    author: item.creator || undefined,
    publishedAt,
    tags: item.categories || undefined,
    mentionedSymbols: extractSymbolsFromText(`${item.title || ''} ${item.contentSnippet || ''}`),
    mentionedEntities: extractEntitiesFromText(`${item.title || ''} ${item.contentSnippet || ''}`),
  };
}

/**
 * Normalize a Tiingo article to our standard format
 */
export function normalizeTiingoArticle(article: TiingoArticle): NormalizedArticle {
  return {
    sourceName: article.source || 'Tiingo',
    externalId: article.id.toString(),
    title: article.title,
    summary: article.description || undefined,
    url: article.url,
    publishedAt: new Date(article.publishedDate),
    tags: article.tags || [],
    mentionedSymbols: [
      ...(article.tickers || []),
      ...extractSymbolsFromText(`${article.title} ${article.description || ''}`),
    ],
    mentionedEntities: extractEntitiesFromText(`${article.title} ${article.description || ''}`),
  };
}

/**
 * Clean and validate a normalized article
 * Returns null if article is invalid
 */
export function validateArticle(article: NormalizedArticle): NormalizedArticle | null {
  // Required fields
  if (!article.title || !article.url) {
    return null;
  }

  // Clean title
  article.title = article.title.trim();
  if (article.title.length < 10 || article.title.length > 500) {
    return null;
  }

  // Validate URL
  try {
    new URL(article.url);
  } catch {
    return null;
  }

  // Validate publish date (not in the future, not too old)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (article.publishedAt > now) {
    article.publishedAt = now; // Clamp to now
  }
  if (article.publishedAt < sevenDaysAgo) {
    return null; // Too old
  }

  // Clean summary
  if (article.summary) {
    article.summary = article.summary.trim().substring(0, 1000);
  }

  return article;
}

/**
 * Calculate similarity between two titles for deduplication
 * Uses Jaccard similarity on word sets
 */
export function calculateTitleSimilarity(title1: string, title2: string): number {
  const words1 = new Set(
    title1.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  );
  const words2 = new Set(
    title2.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  );

  if (words1.size === 0 || words2.size === 0) {
    return 0;
  }

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Check if an article is a duplicate of existing articles
 */
export function isDuplicateArticle(
  newArticle: NormalizedArticle,
  existingTitles: string[],
  threshold: number = 0.7
): boolean {
  for (const existingTitle of existingTitles) {
    if (calculateTitleSimilarity(newArticle.title, existingTitle) >= threshold) {
      return true;
    }
  }
  return false;
}
