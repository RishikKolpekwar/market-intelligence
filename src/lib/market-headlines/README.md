# Market Headlines System

## Architecture Overview

The Market Headlines system uses a **two-stage pipeline** to select the top 5 general market news articles:

```
News Items DB (48h) 
    ↓
Deterministic Scoring (top 20)
    ↓
Diversity Filter
    ↓
LLM Selection (Gemini)
    ↓
Final Top 5 Headlines
```

### Stage 1: Deterministic Scoring

**Inputs:** All `news_items` from last 48 hours (NOT restricted to user assets)

**Scoring Formula:**
```
score = (relevance * 0.3 + recency * 0.3 + credibility * 0.4) × (1 + macro_boost)
```

Where:
- **Relevance**: From `news_items.relevance_score` (default 0.5)
- **Recency**: `exp(-hoursOld / 24)` (exponential decay)
- **Credibility**: Source-based score (Bloomberg=1.0, Reuters=0.95, etc.)
- **Macro Boost**: +0.1 per macro keyword matched (max +0.3)

**De-duplication:** Jaccard similarity on titles (threshold 0.5)

**Output:** Top 20 scored candidates

### Stage 2: LLM Selection

**Model:** `gemini-1.5-flash`

**Input:** Top 20 candidates with metadata (score, topic, recency)

**Task:** Select final 5 headlines ensuring:
- Topical diversity (3+ buckets)
- Maximum market relevance
- Grounded "why it matters" explanations

**Output:** JSON with 5 headlines + reasoning

**Fallback:** If LLM fails, use top 5 from deterministic scoring

---

## Files Structure

```
src/lib/market-headlines/
├── scorer.ts              # Deterministic ranking logic
└── llm-selector.ts        # Gemini-based final selection

src/app/api/briefing/
└── market-headlines/
    └── route.ts           # API endpoint (POST)
```

---

## API Usage

### Endpoint
```
POST /api/briefing/market-headlines
Authorization: Bearer <user_token>
```

### Response
```json
{
  "ok": true,
  "headlines": [
    {
      "title": "Federal Reserve Signals Potential Rate Cut by Mid-Year",
      "source": "Bloomberg",
      "url": "https://...",
      "published_at": "2026-01-10T14:30:00Z",
      "why_it_matters": "Shift in Fed policy could impact equity valuations and bond yields across all sectors.",
      "confidence": 0.95
    }
  ],
  "metadata": {
    "candidates_reviewed": 187,
    "top_scored": 20,
    "final_selected": 5,
    "cached": false
  }
}
```

### Caching
- Results are cached for **30 minutes**
- Cache is in-memory (resets on server restart)
- To force refresh: wait 30+ minutes or restart server

---

## Configuration & Tuning

### 1. Source Credibility Weights

Edit `src/lib/market-headlines/scorer.ts`:

```typescript
export const SOURCE_CREDIBILITY: Record<string, number> = {
  "Bloomberg": 1.00,
  "Reuters": 0.95,
  // Add your sources here
};
```

### 2. Macro Keywords

Add keywords to boost macro-focused articles:

```typescript
export const MACRO_KEYWORDS = [
  "Federal Reserve", "inflation", "GDP",
  // Add more keywords
];
```

### 3. Scoring Weights

Adjust the formula in `scoreArticles()`:

```typescript
const score = (
  base_relevance * 0.3 +  // ← Adjust weight
  recency_score * 0.3 +   // ← Adjust weight  
  credibility_score * 0.4 // ← Adjust weight
) * (1 + macro_boost);
```

### 4. Time Window

Change how far back to look:

```typescript
// In route.ts
const hoursAgo = 48; // Change to 24, 72, etc.
const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
```

### 5. Cache Duration

```typescript
// In route.ts
const CACHE_DURATION_MS = 30 * 60 * 1000; // Change to 60 min, etc.
```

---

## Topic Buckets (Diversity Constraint)

Articles are classified into 6 buckets:

1. **`macro_rates`**: Fed, inflation, interest rates, CPI, bonds
2. **`geopolitics_commodities`**: China, war, oil, tariffs, trade
3. **`tech_ai`**: AI, semiconductors, data centers, chips
4. **`market_indices`**: S&P 500, Nasdaq, Dow, VIX, volatility
5. **`earnings_micro`**: Earnings reports, guidance, forecasts
6. **`regulatory`**: SEC, antitrust, lawsuits, investigations

The system ensures at least **3 different buckets** are represented in the top 5.

---

## LLM Prompt Details

### System Prompt (Non-Editable Core)
```
You are a financial news curator for institutional investors.
Select TOP 5 market-wide headlines from candidates.

RULES:
- GROUNDING: Only use info from candidate articles
- DIVERSITY: Cover macro, geopolitics, tech, indices, earnings
- CITATION: Reference by article index
- NO HALLUCINATION
- Output pure JSON
```

### User Prompt (Dynamic)
Contains:
- Full candidate list with titles, sources, URLs, summaries
- Score breakdown for each candidate
- Topic classification
- Explicit instructions to prioritize Fed/rates/AI/geopolitics

---

## Handling Edge Cases

### Paywalled Sources
- **Status**: Allowed if we have `title + snippet/summary`
- System doesn't fetch full text, only uses what's in DB
- Credibility score still applies

### Missing Fields
- **`summary`**: Falls back to title only for keyword matching
- **`relevance_score`**: Defaults to 0.5
- **`source_name`**: Unknown sources get 0.5 credibility

### LLM Failure
- **Automatic fallback** to deterministic top 5
- Logs error but returns valid response
- `why_it_matters` uses template: "Key [topic] development with [X]% source credibility"

### Zero Results
- Returns empty array with message: "No recent market news available"
- HTTP 200 (not an error)

---

## Integration with Briefing Generator

To integrate into your daily briefing, update your briefing generation code:

```typescript
// In your briefing generator
import { POST as getMarketHeadlines } from "@/app/api/briefing/market-headlines/route";

async function generateBriefing(userId: string) {
  // ... existing asset news logic ...
  
  // Fetch market headlines
  const headlinesReq = new Request("http://localhost:3000/api/briefing/market-headlines", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  });
  
  const headlinesRes = await getMarketHeadlines(headlinesReq);
  const { headlines } = await headlinesRes.json();
  
  // Store in briefing
  await supabase.from("daily_briefings").insert({
    user_id: userId,
    market_headlines: headlines,
    // ... other fields
  });
}
```

---

## Testing & Debugging

### Test the API
```bash
curl -X POST http://localhost:3000/api/briefing/market-headlines \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### Check Cache
```bash
curl http://localhost:3000/api/briefing/market-headlines
# Returns cache status
```

### Debug Logs
Look for these in server console:
```
[MarketHeadlines] Fetching candidate articles...
[MarketHeadlines] Found 187 candidate articles
[MarketHeadlines] Selected top 20 candidates (scores: 0.823 to 0.645)
[MarketHeadlines] After diversity filter: 15 articles
[MarketHeadlines] Asking Gemini to select from 15 candidates...
[MarketHeadlines] Gemini selected 5 headlines
[MarketHeadlines] Returning 5 final headlines
```

---

## Performance Metrics

- **Candidate Retrieval**: ~100-200ms (Supabase query)
- **Scoring + Dedup**: ~10-20ms (in-memory)
- **LLM Selection**: ~2-4 seconds (Gemini API)
- **Total**: ~2.5-4.5 seconds (first call)
- **Cached**: ~5ms

---

## Future Enhancements

1. **Embeddings-based dedup**: Use vector similarity instead of Jaccard
2. **User preferences**: Allow users to prioritize certain topics
3. **Multi-language support**: Detect and filter by language
4. **Sentiment analysis**: Add sentiment scores to headlines
5. **Breaking news flag**: Real-time detection of major market events
6. **Historical comparison**: "Today's headlines vs. last week"

---

## Troubleshooting

### "No headlines returned"
- Check if `news_items` table has recent data (last 48h)
- Verify `is_active = true` on news items
- Check server logs for errors

### "All headlines from same topic"
- Increase diversity constraint: change `minBuckets` parameter
- Review topic classification logic in `classifyTopicBucket()`

### "Low-quality sources dominating"
- Adjust credibility weights in `SOURCE_CREDIBILITY`
- Increase weight of `credibility_score` in formula

### "LLM always falling back"
- Check Gemini API key in `.env.local`
- Review LLM logs for JSON parsing errors
- Test with fewer candidates (reduce to top 10)

---

## Source Governance Rules

As per requirements:

### Primary vs. Contextual Sources
- **Primary (Top 5)**: Displayed in UI, used as authoritative references
- **Contextual (Remaining 15)**: Used by LLM for supplemental context only

### UI Display
- Show ONLY the 5 primary headlines
- Add disclosure label: 
  > "Additional perspectives from broader market coverage may be referenced"

### LLM Instructions
- Primary sources are authoritative
- Contextual sources for background only
- No fund names/institutions unless grounded in article
- Explicit framing required for secondary info

This ensures transparency and prevents unbacked claims.
