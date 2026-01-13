import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRelevantNewsForUser } from "@/lib/relevance/filter";
import {
  generateDailyBriefing,
  generateEmptyBriefing,
} from '@/lib/llm/briefing-generator';
import { BriefingInput, AssetWithNews } from "@/types/ingestion";

// Force Node.js runtime (not Edge)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/briefing/generate
 * Supports optional ?portfolio_id=<uuid>
 */
export async function POST(request: Request) {
  // Debug: Check if Gemini API key is present
  console.log("🔑 GEMINI_API_KEY exists?", !!process.env.GEMINI_API_KEY);
  console.log("🔑 GEMINI_API_KEY length:", process.env.GEMINI_API_KEY?.length);

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : "";

  // Check for cron secret (for scheduled jobs)
  const cronSecret = request.headers.get("x-cron-secret");
  const isCronJob = cronSecret === process.env.CRON_SECRET;

  let supabase;
  let user;

  if (isCronJob) {
    // Cron job - use service role and get userId from body
    const body = await request.json();
    const userId = body.userId;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Missing userId in cron request" },
        { status: 400 }
      );
    }

    // Use service role client to bypass RLS
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    user = { id: userId };
  } else {
    // Regular user request - require auth token
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Missing Authorization Bearer token" },
        { status: 401 }
      );
    }

    // ✅ Create a Supabase client authenticated as the user (RLS will work)
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    user = userRes?.user;

    if (userErr || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  const startTime = Date.now();

  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get("portfolio_id") || undefined;

  try {
    // AUTO-SYNC: Sync all financial data before generating briefing
    console.log('[Briefing] Auto-syncing financial data before generation...');
    try {
      // Use the internal site URL or fallback to localhost for internal API call
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const syncUrl = portfolioId
        ? `${baseUrl}/api/sync/all?portfolio_id=${portfolioId}&force=true`
        : `${baseUrl}/api/sync/all?force=true`;

      const syncRes = await fetch(syncUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (syncRes.ok) {
        const syncData = await syncRes.json();
        console.log('[Briefing] Financial sync complete:', syncData.updated);
      } else {
        console.error('[Briefing] Financial sync failed (continuing anyway):', await syncRes.text());
      }
    } catch (syncErr) {
      console.error('[Briefing] Financial sync error (continuing anyway):', syncErr);
    }

    // AUTO-SYNC NEWS: Also sync news before generating briefing
    console.log('[Briefing] Auto-syncing news before generation...');
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const ingestUrl = `${baseUrl}/api/ingest`;
      
      const ingestRes = await fetch(ingestUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (ingestRes.ok) {
        const ingestData = await ingestRes.json();
        const totalNew =
          (ingestData.results?.newsApi?.itemsNew || 0) +
          (ingestData.results?.finnhub?.itemsNew || 0) +
          (ingestData.results?.tiingo?.itemsNew || 0) +
          (ingestData.results?.agentic?.itemsNew || 0) +
          (ingestData.results?.rss?.reduce((sum: number, r: any) => sum + r.itemsNew, 0) || 0);
        const matches = ingestData.results?.relevance?.matches || 0;
        console.log(`[Briefing] News sync complete: ${totalNew} new articles, ${matches} matched to assets`);
      } else {
        console.error('[Briefing] News sync failed (continuing anyway):', await ingestRes.text());
      }
    } catch (ingestErr) {
      console.error('[Briefing] News sync error (continuing anyway):', ingestErr);
    }

    // User profile
    const { data: userProfile, error: profileErr} = await supabase
      .from("users")
      .select("email, full_name, timezone")
      .eq("id", user.id)
      .single();

    if (profileErr) {
      // not fatal—just log it
      console.error("profileErr:", profileErr);
    }

    // Get today's date in user's timezone
    const userTimezone = userProfile?.timezone || "America/New_York";
    // Create date in user's timezone by getting the ISO date string in that timezone
    const todayStr = new Date().toLocaleDateString("en-US", {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    // Convert MM/DD/YYYY to YYYY-MM-DD
    const [month, day, year] = todayStr.split('/');
    const today = new Date(`${year}-${month}-${day}T12:00:00.000Z`); // Use noon UTC to avoid timezone issues

    // ✅ Step 1: Get ALL tracked assets (regardless of news)
    let trackedQuery = supabase
      .from('user_assets')
      .select(`
        asset_id,
        portfolio_percentage,
        assets!inner(id, symbol, name, asset_type)
      `)
      .eq('user_id', user.id);
    
    if (portfolioId) {
      trackedQuery = trackedQuery.eq('portfolio_id', portfolioId);
    }
    
    const { data: trackedAssets, error: trackedError } = await trackedQuery;
    if (trackedError) {
      console.error("Error fetching tracked assets:", trackedError);
    }
    
    console.log(`[Briefing] Found ${trackedAssets?.length || 0} tracked assets`);

    // ✅ Step 2: Get relevant news (if any)
    const relevantNews = await getRelevantNewsForUser(
      user.id,
      336, // 14 days
      30,
      portfolioId,
      supabase
    );
    
    console.log(`[Briefing] Found news for ${relevantNews.length} assets`);

    // ✅ Step 3: Build map of ALL assets, including those without news
    const assetsMap = new Map<string, AssetWithNews>();
    
    // First, add ALL tracked assets (with empty news array)
    for (const ua of trackedAssets || []) {
      const asset = ua.assets as any;
      if (!assetsMap.has(asset.id)) {
        assetsMap.set(asset.id, {
          assetId: asset.id,
          symbol: asset.symbol,
          name: asset.name,
          assetType: asset.asset_type || "stock",
          importanceLevel: "normal",
          currentPrice: undefined,
          priceChange24h: undefined,
          priceChangePct24h: undefined,
          week52High: undefined,
          week52Low: undefined,
          newsItems: [], // Start with empty news - will be filled below if available
        });
      }
    }
    
    // Then, add news items to existing assets
    for (const item of relevantNews) {
      const existing = assetsMap.get(item.assetId);
      if (existing) {
        // Add news to existing asset
        const existingNewsIds = new Set(existing.newsItems.map(n => n.id));
        for (const news of item.news) {
          if (!existingNewsIds.has(news.id)) {
            existing.newsItems.push({
              id: news.id,
              title: news.title,
              summary: news.summary || undefined,
              url: news.url,
              sourceName: news.sourceName,
              publishedAt: new Date(news.publishedAt),
              relevanceScore: news.relevanceScore,
              matchType: news.matchType as "symbol_mention" | "keyword_match" | "llm_inferred" | "manual",
              matchedTerms: news.matchedTerms || [],
            });
          }
        }
      } else {
        // Asset not in tracked list but has news (shouldn't happen, but handle it)
        assetsMap.set(item.assetId, {
          assetId: item.assetId,
          symbol: item.assetSymbol,
          name: item.assetName,
          assetType: "stock",
          importanceLevel: "normal",
          currentPrice: undefined,
          priceChange24h: undefined,
          priceChangePct24h: undefined,
          week52High: undefined,
          week52Low: undefined,
          newsItems: item.news.map((n) => ({
            id: n.id,
            title: n.title,
            summary: n.summary || undefined,
            url: n.url,
            sourceName: n.sourceName,
            publishedAt: new Date(n.publishedAt),
            relevanceScore: n.relevanceScore,
            matchType: n.matchType as "symbol_mention" | "keyword_match" | "llm_inferred" | "manual",
            matchedTerms: n.matchedTerms || [],
          })),
        });
      }
    }
    
    const assets = Array.from(assetsMap.values());
    console.log(`[Briefing] Total assets in briefing: ${assets.length} (including ${assets.filter(a => a.newsItems.length === 0).length} without news)`);

    // Enrich assets with portfolio metrics and price data
    for (const asset of assets) {
      // Get price data from assets table
      const { data: assetData } = await supabase
        .from('assets')
        .select(`
          current_price, 
          previous_close, 
          price_change_24h, 
          price_change_pct_24h, 
          week_52_high, 
          week_52_low,
          month_change,
          month_change_pct,
          year_change,
          year_change_pct,
          ev_ebitda,
          next_earnings_date
        `)
        .eq('id', asset.assetId)
        .single();

      if (assetData) {
        asset.currentPrice = assetData.current_price;
        asset.priceChange24h = assetData.price_change_24h;
        asset.priceChangePct24h = assetData.price_change_pct_24h;
        asset.week52High = assetData.week_52_high;
        asset.week52Low = assetData.week_52_low;
        
        // Use synced historical and fundamental data
        asset.priceChangeMonth = assetData.month_change;
        asset.priceChangePctMonth = assetData.month_change_pct;
        asset.priceChangeYear = assetData.year_change;
        asset.priceChangePctYear = assetData.year_change_pct;
        asset.evEbitda = assetData.ev_ebitda;
        asset.nextEarningsDate = assetData.next_earnings_date;
      }

      // Get portfolio allocations across ALL portfolios (not filtered)
      const { data: userAssets } = await supabase
        .from('user_assets')
        .select(`
          portfolio_percentage,
          portfolios!inner(id, name)
        `)
        .eq('user_id', user.id)
        .eq('asset_id', asset.assetId);

      if (userAssets && userAssets.length > 0) {
        // Calculate total allocation across all portfolios
        asset.portfolioPercentage = userAssets.reduce((sum: number, ua: any) =>
          sum + (ua.portfolio_percentage || 0), 0
        );

        // Build portfolio allocations array with breakdown
        asset.portfolioAllocations = userAssets.map((ua: any) => ({
          portfolioId: ua.portfolios.id,
          portfolioName: ua.portfolios.name,
          percentage: ua.portfolio_percentage || 0,
        }));
      } else {
        asset.portfolioPercentage = 0;
        asset.portfolioAllocations = [];
      }
    }

    // Sort assets by total portfolio allocation (descending)
    assets.sort((a, b) => {
      const allocA = a.portfolioPercentage || 0;
      const allocB = b.portfolioPercentage || 0;
      if (Math.abs(allocB - allocA) > 0.001) {
        return allocB - allocA;
      }
      return a.symbol.localeCompare(b.symbol);
    });

    const totalNewsCount = assets.reduce((sum, a) => sum + a.newsItems.length, 0);

    console.log(
      `[Briefing] user=${user.id} portfolio=${portfolioId ?? "ALL"} assets=${assets.length} news=${totalNewsCount}`
    );

    // Log each asset's news count for debugging
    assets.forEach(a => {
      console.log(`[Briefing]   ${a.symbol}: ${a.newsItems.length} news items`);
    });

    const briefingInput: BriefingInput = {
      userId: user.id,
      userEmail: userProfile?.email || user.email || "",
      userName: userProfile?.full_name || undefined,
      briefingDate: today,
      timezone: userProfile?.timezone || "UTC",
      assets,
    };

    const briefing =
      totalNewsCount === 0
        ? generateEmptyBriefing(briefingInput)
        : await generateDailyBriefing(briefingInput, false, 14);

    // Save briefing
    console.log('[Briefing] Sample asset summary being saved:', briefing.assetSummaries[0]?.summary?.substring(0, 200));
    const { error: saveError } = await supabase.from("daily_briefings").upsert(
      {
        user_id: user.id,
        briefing_date: today.toISOString().split("T")[0],
        market_overview: briefing.marketOverview,
        asset_summaries: briefing.assetSummaries,
        notable_headlines: briefing.notableHeadlines,
        full_briefing_html: briefing.fullBriefingHtml,
        full_briefing_text: briefing.fullBriefingText,
        total_news_items: totalNewsCount,
        assets_covered: assets.length,
        llm_model: "llmModel" in briefing ? briefing.llmModel : undefined,
        llm_tokens_used: "tokensUsed" in briefing ? briefing.tokensUsed : undefined,
        generation_time_ms: Date.now() - startTime,
      },
      { onConflict: "user_id,briefing_date" }
    );

    if (saveError) console.error("Error saving briefing:", saveError);

    return NextResponse.json({
      success: true,
      briefing: {
        date: today.toISOString().split("T")[0],
        marketOverview: briefing.marketOverview,
        assetSummaries: briefing.assetSummaries,
        notableHeadlines: briefing.notableHeadlines,
        totalNewsItems: totalNewsCount,
        assetsCovered: assets.length,
      },
      generationTimeMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("Error generating briefing:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate briefing",
      },
      { status: 500 }
    );
  }
}
