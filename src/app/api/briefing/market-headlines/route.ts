/**
 * Market Headlines API
 * POST /api/briefing/market-headlines
 * 
 * Returns the top 5 general market headlines using a two-stage pipeline:
 * 1. Deterministic scoring (top 20)
 * 2. LLM selection (final 5)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { selectTopCandidates, ensureDiversity, type NewsCandidate } from "@/lib/market-headlines/scorer";
import { selectFinalHeadlines, fallbackSelection } from "@/lib/market-headlines/llm-selector";

// Cache configuration
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
let cachedResult: {
  headlines: any[];
  timestamp: number;
} | null = null;

export async function POST(request: NextRequest) {
  try {
    // Check cache first
    const now = Date.now();
    if (cachedResult && (now - cachedResult.timestamp < CACHE_DURATION_MS)) {
      console.log("[MarketHeadlines] Returning cached result");
      return NextResponse.json({
        ok: true,
        headlines: cachedResult.headlines,
        cached: true,
        cacheAge: Math.floor((now - cachedResult.timestamp) / 1000)
      });
    }

    // Get user auth
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    console.log("[MarketHeadlines] Fetching candidate articles...");

    // Step 1: Retrieve candidates from last 48 hours
    // NOT restricted to user's assets - this is market-wide
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    
    const { data: newsItems, error: newsError } = await supabase
      .from("news_items")
      .select("id, title, summary, url, source_name, published_at, relevance_score")
      .gte("published_at", fortyEightHoursAgo)
      .eq("is_active", true)
      .order("published_at", { ascending: false })
      .limit(200); // Get a large pool

    if (newsError) {
      console.error("[MarketHeadlines] Database error:", newsError);
      return NextResponse.json({ ok: false, error: newsError.message }, { status: 500 });
    }

    if (!newsItems || newsItems.length === 0) {
      console.log("[MarketHeadlines] No news items found in last 48h");
      return NextResponse.json({
        ok: true,
        headlines: [],
        message: "No recent market news available"
      });
    }

    console.log(`[MarketHeadlines] Found ${newsItems.length} candidate articles`);

    // Step 2: Score and select top 20
    const candidates: NewsCandidate[] = newsItems.map(item => ({
      id: item.id,
      title: item.title,
      summary: item.summary || undefined,
      url: item.url,
      source_name: item.source_name,
      published_at: item.published_at,
      relevance_score: item.relevance_score || 0.5
    }));

    const top20 = selectTopCandidates(candidates, 20);
    console.log(`[MarketHeadlines] Selected top 20 candidates (scores: ${top20[0]?.score.toFixed(3)} to ${top20[top20.length-1]?.score.toFixed(3)})`);

    // Step 3: Ensure diversity
    const diversified = ensureDiversity(top20, 3);
    console.log(`[MarketHeadlines] After diversity filter: ${diversified.length} articles`);

    // Step 4: LLM selection (with fallback)
    let finalHeadlines = await selectFinalHeadlines(diversified);
    
    if (!finalHeadlines || finalHeadlines.length === 0) {
      console.log("[MarketHeadlines] LLM selection failed, using fallback");
      finalHeadlines = fallbackSelection(diversified);
    }

    // Format response
    const response = finalHeadlines.map(h => ({
      title: h.title,
      source: h.source,
      url: h.url,
      published_at: h.published_at,
      why_it_matters: h.why_it_matters,
      confidence: h.confidence
    }));

    // Update cache
    cachedResult = {
      headlines: response,
      timestamp: now
    };

    console.log(`[MarketHeadlines] Returning ${response.length} final headlines`);

    return NextResponse.json({
      ok: true,
      headlines: response,
      metadata: {
        candidates_reviewed: newsItems.length,
        top_scored: top20.length,
        final_selected: response.length,
        cached: false
      }
    });

  } catch (error: any) {
    console.error("[MarketHeadlines] Error:", error);
    return NextResponse.json({
      ok: false,
      error: error.message || "Internal server error"
    }, { status: 500 });
  }
}

// Optional: Add GET for debugging
export async function GET(request: NextRequest) {
  if (cachedResult) {
    const age = Math.floor((Date.now() - cachedResult.timestamp) / 1000);
    return NextResponse.json({
      cached: true,
      age_seconds: age,
      headlines: cachedResult.headlines
    });
  }
  
  return NextResponse.json({
    cached: false,
    message: "No cached headlines. Call POST to generate."
  });
}
