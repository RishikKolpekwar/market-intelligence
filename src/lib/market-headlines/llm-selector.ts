/**
 * LLM-based final selection for Market Headlines
 * Uses Gemini to pick the best 5 from top 20 candidates
 */

import { generateWithGemini } from "@/lib/llm/gemini";
import { ScoredCandidate } from "./scorer";

export interface FinalHeadline {
  title: string;
  source: string;
  url: string;
  published_at: string;
  why_it_matters: string;
  confidence: number;
  article_index: number; // References the candidate article
}

const SYSTEM_PROMPT = `You are a financial news curator for an institutional investor dashboard.

Your task: Select the TOP 5 most important market-wide headlines from the provided candidate articles.

CRITICAL RULES:
1. GROUNDING: Only use information explicitly stated in the candidate articles. Do NOT hallucinate, infer, or add external knowledge.
2. DIVERSITY: Ensure topical diversity across macro/rates, geopolitics, tech/AI, market indices, and earnings.
3. RELEVANCE: Prioritize articles that matter to portfolio managers and institutional investors.
4. CITATION: Reference articles by their index number (0-19). Each headline must map to exactly ONE candidate article.
5. "WHY IT MATTERS": Write 1-2 sentences explaining market impact. Ground it in the article's content.
6. NO MARKDOWN: Output pure JSON only, no code fences or formatting.
7. REFUSAL: If fewer than 5 quality articles exist, return fewer items. Do not fabricate.

OUTPUT SCHEMA (strict JSON):
{
  "headlines": [
    {
      "article_index": 0,
      "title": "exact or slightly edited title from candidate",
      "source": "exact source from candidate",
      "url": "exact url from candidate",
      "published_at": "exact ISO timestamp from candidate",
      "why_it_matters": "1-2 sentence explanation grounded in article content",
      "confidence": 0.95
    }
  ],
  "reasoning": "brief explanation of selection logic"
}`;

function buildUserPrompt(candidates: ScoredCandidate[]): string {
  const candidateList = candidates.map((c, idx) => {
    return `[${idx}] Title: ${c.title}
Source: ${c.source_name}
Published: ${c.published_at}
URL: ${c.url}
Summary: ${c.summary || "N/A"}
Score: ${c.score.toFixed(3)} (recency: ${c.recency_score.toFixed(2)}, credibility: ${c.credibility_score.toFixed(2)})
Topic: ${c.topic_bucket}
`;
  }).join("\n---\n");

  return `CANDIDATE ARTICLES (${candidates.length} total):

${candidateList}

Select the TOP 5 headlines that provide the most comprehensive view of today's market. Prioritize:
- Federal Reserve / interest rates / inflation news
- Major geopolitical developments
- Significant tech/AI infrastructure moves
- Broad market index movements
- Systemic earnings/guidance stories

Output pure JSON following the schema. No markdown, no code fences.`;
}

/**
 * Use Gemini to select final top 5 headlines
 */
export async function selectFinalHeadlines(
  candidates: ScoredCandidate[]
): Promise<FinalHeadline[] | null> {
  if (candidates.length === 0) return null;

  try {
    console.log(`[MarketHeadlines] Asking Gemini to select from ${candidates.length} candidates...`);
    
    const userPrompt = buildUserPrompt(candidates);
    const response = await generateWithGemini(SYSTEM_PROMPT, userPrompt, {
      temperature: 0.3,
      responseFormat: "json",
    });

    if (!response) {
      console.error("[MarketHeadlines] Gemini returned empty response");
      return null;
    }

    // Parse JSON response
    let parsed: any;
    try {
      // Remove any markdown code fences if present
      const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("[MarketHeadlines] Failed to parse Gemini JSON:", parseErr);
      console.error("[MarketHeadlines] Raw response:", response.substring(0, 500));
      return null;
    }

    if (!parsed.headlines || !Array.isArray(parsed.headlines)) {
      console.error("[MarketHeadlines] Invalid response structure:", parsed);
      return null;
    }

    // Validate and map to final format
    const finals: FinalHeadline[] = [];
    for (const item of parsed.headlines) {
      const idx = item.article_index;
      if (idx < 0 || idx >= candidates.length) {
        console.warn(`[MarketHeadlines] Invalid article_index: ${idx}`);
        continue;
      }

      const candidate = candidates[idx];
      finals.push({
        title: item.title || candidate.title,
        source: item.source || candidate.source_name,
        url: item.url || candidate.url,
        published_at: item.published_at || candidate.published_at,
        why_it_matters: item.why_it_matters || "Significant market development",
        confidence: item.confidence || 0.8,
        article_index: idx
      });
    }

    console.log(`[MarketHeadlines] Gemini selected ${finals.length} headlines`);
    return finals.length > 0 ? finals : null;

  } catch (error) {
    console.error("[MarketHeadlines] LLM selection failed:", error);
    return null;
  }
}

/**
 * Fallback: convert top 5 scored candidates to final headlines
 */
export function fallbackSelection(candidates: ScoredCandidate[]): FinalHeadline[] {
  return candidates.slice(0, 5).map((c, idx) => ({
    title: c.title,
    source: c.source_name,
    url: c.url,
    published_at: c.published_at,
    why_it_matters: `Key ${c.topic_bucket.replace(/_/g, " ")} development with ${c.credibility_score.toFixed(0)}% source credibility`,
    confidence: c.score,
    article_index: idx
  }));
}
