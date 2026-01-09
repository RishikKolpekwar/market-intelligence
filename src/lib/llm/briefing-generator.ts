import { BriefingInput, GeneratedBriefing } from '@/types/ingestion';
import { callGemini } from './gemini';

/**
 * System prompt for daily briefing generation
 */
const BRIEFING_SYSTEM_PROMPT = `You are a professional financial news analyst who creates clear, concise daily briefings for investors. Your role is to synthesize multiple news sources into a readable summary.

CRITICAL GUIDELINES:
1. NEVER provide investment advice, buy/sell recommendations, or price predictions
2. NEVER use phrases like "you should", "consider buying", "it might be a good time to"
3. Always maintain a neutral, informative tone
4. Focus on FACTS reported in the news, not speculation
5. If sentiment is mentioned, attribute it to the source ("according to analysts...")
6. Clearly distinguish between confirmed facts and market speculation
7. Keep summaries concise but informative

OUTPUT FORMAT:
- Write in a calm, professional tone suitable for morning reading
- Use clear section headers
- Prioritize the most important/impactful news first
- Include relevant context but avoid excessive detail
- Make it scannable with bullet points where appropriate`;

/**
 * Generate a daily briefing from structured input using Google Gemini
 */
export async function generateDailyBriefing(
  input: BriefingInput,
  _usePremiumModel: boolean = false, // Kept for API compatibility
  newsWindowDays: number = 1 // NEW: configurable news window
): Promise<GeneratedBriefing> {
  const startTime = Date.now();

  // Filter news items by window
  const cutoff = new Date(input.briefingDate);
  cutoff.setDate(cutoff.getDate() - newsWindowDays);
  const filteredAssets = input.assets.map(asset => ({
    ...asset,
    newsItems: asset.newsItems.filter(n => {
      if (!n.publishedAt) return false;
      const published = new Date(n.publishedAt);
      return published >= cutoff && published <= input.briefingDate;
    })
  }));
  const filteredInput = { ...input, assets: filteredAssets };

  // Build the user prompt with structured data
  const userPrompt = BRIEFING_SYSTEM_PROMPT + '\n\n' + buildBriefingPrompt(filteredInput, newsWindowDays);

  try {
    const { text: responseContent } = await callGemini(userPrompt);

    // Parse the structured response
    const parsed = parseBriefingResponse(responseContent, filteredInput);

    return {
      ...parsed,
      llmModel: 'gemini-1.5-flash',
      tokensUsed: 0, // No longer tracking tokens in the helper
      generationTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Error generating briefing with Gemini:', error);
    // Fall back to basic briefing if LLM fails
    return {
      ...generateBasicBriefing(filteredInput, newsWindowDays),
      llmModel: 'fallback',
      tokensUsed: 0,
      generationTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Generate a basic briefing without LLM (fallback)
 */
function generateBasicBriefing(input: BriefingInput, newsWindowDays: number = 1): Omit<GeneratedBriefing, 'llmModel' | 'tokensUsed' | 'generationTimeMs'> {
  const dateStr = input.briefingDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  let marketOverviewText = 'Market data overview:\n';
  if (input.marketOverview) {
    if (input.marketOverview.sp500Change !== undefined) {
      marketOverviewText += `• S&P 500: ${input.marketOverview.sp500Change >= 0 ? '+' : ''}${input.marketOverview.sp500Change.toFixed(2)}%\n`;
    }
    if (input.marketOverview.nasdaqChange !== undefined) {
      marketOverviewText += `• NASDAQ: ${input.marketOverview.nasdaqChange >= 0 ? '+' : ''}${input.marketOverview.nasdaqChange.toFixed(2)}%\n`;
    }
    if (input.marketOverview.dowChange !== undefined) {
      marketOverviewText += `• Dow Jones: ${input.marketOverview.dowChange >= 0 ? '+' : ''}${input.marketOverview.dowChange.toFixed(2)}%\n`;
    }
  }

  const assetSummaries = input.assets.map((asset) => ({
    assetId: asset.assetId,
    symbol: asset.symbol,
    name: asset.name,
    summary: `${asset.newsItems.length} news items tracked in last ${newsWindowDays} day${newsWindowDays > 1 ? 's' : ''}.`,
    newsCount: asset.newsItems.length,
    currentPrice: asset.currentPrice,
    priceChange: asset.priceChange24h,
    priceChangePercent: asset.priceChangePct24h,
    week52High: asset.week52High,
    week52Low: asset.week52Low,
  }));

  // Get top news items
  const allNews = input.assets.flatMap((a) => a.newsItems);
  const topNews = allNews
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 5);

  const notableHeadlines = topNews.map((news) => {
    let publishedAt: string | undefined;
    if (news.publishedAt) {
      const date = new Date(news.publishedAt);
      publishedAt = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
    return {
      title: news.title,
      url: news.url,
      source: news.sourceName,
      reason: 'Top relevant story',
      publishedAt,
      snippet: news.summary?.substring(0, 150),
    };
  });

  const fullText = `# Daily Briefing - ${dateStr}

## Market Overview
${marketOverviewText}

## Your Portfolio Highlights
${input.assets.map(a => `**${a.symbol}** (${a.name}): ${a.newsItems.length} news items in last ${newsWindowDays} day${newsWindowDays > 1 ? 's' : ''}`).join('\n')}

## Notable Headlines
${topNews.map(n => `• ${n.title} (${n.sourceName})`).join('\n') || 'No significant headlines in this period.'}

---
*Note: AI summary unavailable. Showing raw headlines for last ${newsWindowDays} day${newsWindowDays > 1 ? 's' : ''}.*`;

  return {
    marketOverview: marketOverviewText,
    assetSummaries,
    notableHeadlines,
    fullBriefingText: fullText,
    fullBriefingHtml: markdownToHtml(fullText),
  };
}

/**
 * Build the user prompt from structured input
 */
function buildBriefingPrompt(input: BriefingInput, newsWindowDays: number = 1): string {
  const dateStr = input.briefingDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let prompt = `Generate a market briefing for ${dateStr}, covering the last ${newsWindowDays} day${newsWindowDays > 1 ? 's' : ''} of news.\n\n`;

  // Add market overview context if available
  if (input.marketOverview) {
    prompt += `## MARKET CONTEXT\n`;
    if (input.marketOverview.sp500Change !== undefined) {
      const direction = input.marketOverview.sp500Change >= 0 ? 'up' : 'down';
      prompt += `- S&P 500: ${direction} ${Math.abs(input.marketOverview.sp500Change).toFixed(2)}%\n`;
    }
    if (input.marketOverview.nasdaqChange !== undefined) {
      const direction = input.marketOverview.nasdaqChange >= 0 ? 'up' : 'down';
      prompt += `- NASDAQ: ${direction} ${Math.abs(input.marketOverview.nasdaqChange).toFixed(2)}%\n`;
    }
    if (input.marketOverview.dowChange !== undefined) {
      const direction = input.marketOverview.dowChange >= 0 ? 'up' : 'down';
      prompt += `- Dow Jones: ${direction} ${Math.abs(input.marketOverview.dowChange).toFixed(2)}%\n`;
    }
    prompt += '\n';
  }

  // Add tracked assets and their news
  prompt += `## USER'S TRACKED ASSETS AND RELEVANT NEWS\n\n`;

  for (const asset of input.assets) {
    prompt += `### ${asset.symbol} - ${asset.name}`;
    if (asset.priceChangePct24h !== undefined) {
      const direction = asset.priceChangePct24h >= 0 ? '+' : '';
      prompt += ` (${direction}${asset.priceChangePct24h.toFixed(2)}% today)`;
    }
    prompt += `\nImportance: ${asset.importanceLevel}\n`;

    if (asset.newsItems.length === 0) {
      prompt += `No significant news in the last ${newsWindowDays} day${newsWindowDays > 1 ? 's' : ''}.\n\n`;
    } else {
      prompt += `Recent headlines (${asset.newsItems.length} items):\n`;
      for (const news of asset.newsItems.slice(0, 5)) {
        // Limit to top 5 per asset
        prompt += `- "${news.title}" (${news.sourceName}, relevance: ${(news.relevanceScore * 100).toFixed(0)}%)\n`;
        if (news.summary) {
          prompt += `  Summary: ${news.summary.substring(0, 200)}...\n`;
        }
      }
      prompt += '\n';
    }
  }

  // Instructions for output format
  prompt += `## OUTPUT INSTRUCTIONS\n\nPlease generate a briefing with the following sections:\n\n1. **MARKET OVERVIEW** (2-3 sentences on overall market conditions)\n2. **YOUR PORTFOLIO HIGHLIGHTS** (Key news for tracked assets, prioritized by importance)\n3. **NOTABLE HEADLINES** (3-5 most important stories with brief context)\n\nKeep the total briefing under 500 words. Be factual and avoid speculation.\nFormat the output in clean Markdown.`;

  return prompt;
}

/**
 * Parse the LLM response into structured output
 */
function parseBriefingResponse(response: string, input: BriefingInput): Omit<GeneratedBriefing, 'llmModel' | 'tokensUsed' | 'generationTimeMs'> {
  // Extract sections from the response
  const marketOverviewMatch = response.match(
    /##?\s*MARKET OVERVIEW\s*\n([\s\S]*?)(?=##?\s|$)/i
  );
  const marketOverview = marketOverviewMatch
    ? marketOverviewMatch[1].trim()
    : 'Market data not available for this briefing.';

  // Build asset summaries with full price data
  const assetSummaries = input.assets.map((asset) => {
    // Try to find asset-specific content in the response
    const assetPattern = new RegExp(
      `${asset.symbol}[:\\s]*(.*?)(?=\\n\\n|###|$)`,
      'is'
    );
    const assetMatch = response.match(assetPattern);

    return {
      assetId: asset.assetId,
      symbol: asset.symbol,
      name: asset.name,
      summary: assetMatch ? assetMatch[1].trim().substring(0, 500) : `${asset.newsItems.length} news items tracked.`,
      newsCount: asset.newsItems.length,
      currentPrice: asset.currentPrice,
      priceChange: asset.priceChange24h,
      priceChangePercent: asset.priceChangePct24h,
      week52High: asset.week52High,
      week52Low: asset.week52Low,
    };
  });

  // Collect all news items with URLs for headlines section
  const allNews = input.assets.flatMap((a) => a.newsItems);
  
  // Extract notable headlines
  const headlinesMatch = response.match(
    /##?\s*NOTABLE HEADLINES\s*\n([\s\S]*?)(?=##?\s|$)/i
  );
  const headlinesSection = headlinesMatch ? headlinesMatch[1] : '';

  // Parse headlines from the section
  const headlineLines = headlinesSection
    .split('\n')
    .filter((line) => line.trim().startsWith('-') || line.trim().startsWith('*'));

  const notableHeadlines = headlineLines.slice(0, 5).map((line, index) => {
    const cleanLine = line.replace(/^[-*]\s*/, '').trim();
    // Try to find matching news item
    const matchedNews = allNews.find((n) =>
      cleanLine.toLowerCase().includes(n.title.toLowerCase().substring(0, 30))
    );

    // Format published date
    let publishedAt: string | undefined;
    if (matchedNews?.publishedAt) {
      const date = new Date(matchedNews.publishedAt);
      publishedAt = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }

    return {
      title: matchedNews?.title || cleanLine.substring(0, 100),
      url: matchedNews?.url || '#',
      source: matchedNews?.sourceName || 'Various sources',
      reason: `Key story #${index + 1}`,
      publishedAt,
      snippet: matchedNews?.summary?.substring(0, 150),
    };
  });

  // If no headlines parsed from LLM, use top news items directly
  if (notableHeadlines.length === 0 && allNews.length > 0) {
    const topNews = allNews
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);
    
    for (const news of topNews) {
      let publishedAt: string | undefined;
      if (news.publishedAt) {
        const date = new Date(news.publishedAt);
        publishedAt = date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
      }
      
      notableHeadlines.push({
        title: news.title,
        url: news.url,
        source: news.sourceName,
        reason: 'Top relevant story',
        publishedAt,
        snippet: news.summary?.substring(0, 150),
      });
    }
  }

  // Convert Markdown to basic HTML
  const fullBriefingHtml = markdownToHtml(response);

  return {
    marketOverview,
    assetSummaries,
    notableHeadlines,
    fullBriefingText: response,
    fullBriefingHtml,
  };
}

/**
 * Simple Markdown to HTML converter
 */
function markdownToHtml(markdown: string): string {
  let html = markdown
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Lists
    .replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    // Line breaks
    .replace(/\n/g, '<br>');

  // Wrap in paragraph tags
  html = `<p>${html}</p>`;

  // Wrap list items in ul
  html = html.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');

  return html;
}

/**
 * Generate a "no news" briefing when there's nothing significant
 */
export function generateEmptyBriefing(
  input: BriefingInput
): Omit<GeneratedBriefing, 'llmModel' | 'tokensUsed' | 'generationTimeMs'> {
  const dateStr = input.briefingDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const text = `# Daily Briefing - ${dateStr}

## Market Overview

No significant market news to report for your tracked assets today.

## Your Portfolio

You are tracking ${input.assets.length} asset${input.assets.length !== 1 ? 's' : ''}. No notable headlines were found in the last 24 hours.

This could mean markets are quiet, or your tracked assets haven't been in the news recently. This is normal and not necessarily a cause for concern.

---
*This briefing was generated automatically. Past performance is not indicative of future results.*`;

  return {
    marketOverview: 'No significant market news to report for your tracked assets today.',
    assetSummaries: input.assets.map((a) => ({
      assetId: a.assetId,
      symbol: a.symbol,
      summary: 'No news in the last 24 hours.',
      newsCount: 0,
    })),
    notableHeadlines: [],
    fullBriefingText: text,
    fullBriefingHtml: markdownToHtml(text),
  };
}
