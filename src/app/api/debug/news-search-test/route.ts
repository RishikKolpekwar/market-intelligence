/**
 * Debug endpoint to test news matching for funds/ETFs
 * Tests both ticker symbols AND fund names with extended time windows
 * 
 * Usage: GET /api/debug/news-search-test?days=365
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const daysBack = parseInt(searchParams.get("days") || "365");
  
  // Create a simple Supabase client for this debug endpoint
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  // Get all unique assets
  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("id, symbol, name, asset_type");
  
  if (assetsError) {
    return NextResponse.json({ error: assetsError.message }, { status: 500 });
  }

  // Calculate date cutoff
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  
  // Get all news items in the time window
  const { data: newsItems, error: newsError } = await supabase
    .from("news_items")
    .select("id, title, summary, source_name, published_at, url")
    .gte("published_at", cutoff.toISOString())
    .order("published_at", { ascending: false });
  
  if (newsError) {
    return NextResponse.json({ error: newsError.message }, { status: 500 });
  }

  console.log(`[NewsTest] Found ${newsItems?.length || 0} news items in last ${daysBack} days`);

  // Test matching for each asset
  const results: any[] = [];
  
  for (const asset of assets || []) {
    const symbol = asset.symbol?.toUpperCase() || "";
    const name = asset.name || "";
    
    // Generate search terms
    const searchTerms = generateSearchTerms(symbol, name);
    
    // Find matching news
    const matches: any[] = [];
    
    for (const news of newsItems || []) {
      const titleLower = (news.title || "").toLowerCase();
      const summaryLower = (news.summary || "").toLowerCase();
      const combinedText = `${titleLower} ${summaryLower}`;
      
      // Check each search term
      for (const term of searchTerms) {
        if (term.length >= 3 && combinedText.includes(term.toLowerCase())) {
          matches.push({
            title: news.title,
            source: news.source_name,
            published_at: news.published_at,
            url: news.url,
            matched_term: term,
          });
          break; // Only count each article once per asset
        }
      }
    }
    
    results.push({
      symbol,
      name,
      asset_type: asset.asset_type,
      search_terms: searchTerms,
      match_count: matches.length,
      sample_matches: matches.slice(0, 5), // Show top 5
    });
  }

  // Sort by match count ascending (show assets with fewest matches first)
  results.sort((a, b) => a.match_count - b.match_count);

  return NextResponse.json({
    test_params: {
      days_back: daysBack,
      cutoff_date: cutoff.toISOString(),
      total_news_items: newsItems?.length || 0,
      total_assets: assets?.length || 0,
    },
    results,
    summary: {
      assets_with_no_matches: results.filter(r => r.match_count === 0).map(r => r.symbol),
      assets_with_matches: results.filter(r => r.match_count > 0).map(r => ({
        symbol: r.symbol,
        count: r.match_count
      })),
    }
  }, { status: 200 });
}

/**
 * Generate search terms for an asset
 */
function generateSearchTerms(symbol: string, name: string): string[] {
  const terms: string[] = [];
  
  // Add symbol
  if (symbol && symbol.length >= 2) {
    terms.push(symbol);
  }
  
  // Add full name
  if (name && name.length >= 3) {
    terms.push(name);
  }
  
  // For mutual funds (typically end in X), extract fund family
  if (symbol && symbol.endsWith("X") && symbol.length === 5) {
    // Common fund families
    const fundFamilies: Record<string, string[]> = {
      "FC": ["Fidelity", "Fidelity Contrafund"],
      "FD": ["Fidelity"],
      "FS": ["Fidelity"],
      "FI": ["Fidelity"],
      "PR": ["T. Rowe Price", "T Rowe Price"],
      "VF": ["Vanguard"],
      "VI": ["Vanguard"],
      "SW": ["Schwab"],
    };
    
    const prefix = symbol.slice(0, 2);
    if (fundFamilies[prefix]) {
      terms.push(...fundFamilies[prefix]);
    }
  }
  
  // Extract meaningful words from name
  if (name) {
    const nameLower = name.toLowerCase();
    
    // Fund families to look for
    const families = [
      "fidelity", "vanguard", "schwab", "blackrock", "ishares",
      "spdr", "invesco", "state street", "t. rowe price", "t rowe price",
      "american funds", "jpmorgan", "goldman", "morgan stanley"
    ];
    
    for (const family of families) {
      if (nameLower.includes(family)) {
        terms.push(family);
      }
    }
    
    // Strategy keywords
    const strategies = [
      "growth", "value", "income", "dividend", "technology", "tech",
      "healthcare", "biotech", "energy", "financial", "real estate",
      "international", "emerging", "small cap", "large cap", "mid cap",
      "bond", "treasury", "municipal", "corporate", "index", "s&p 500",
      "nasdaq", "total market", "balanced", "target date"
    ];
    
    for (const strategy of strategies) {
      if (nameLower.includes(strategy)) {
        terms.push(strategy);
      }
    }
  }
  
  // Remove duplicates
  return [...new Set(terms)];
}
