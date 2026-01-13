"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

// Helper to make authenticated API calls
const fetchWithAuth = async (
  url: string,
  options: RequestInit = {},
  accessToken?: string
) => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (accessToken) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${accessToken}`;
  }

  return fetch(url, { ...options, headers });
};

interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  portfolio_type: string;
  color: string;
  icon: string;
  is_default: boolean;
  total_value: number;
  asset_count: number;
}

// Helper to render 52-week range bar
function Render52WeekBar({
  current,
  low,
  high,
}: {
  current: number | null;
  low: number | null;
  high: number | null;
}) {
  if (!current || !low || !high || high === low) {
    return <div className="text-xs text-gray-400">52W range N/A</div>;
  }

  const range = high - low;
  const position = Math.min(100, Math.max(0, ((current - low) / range) * 100));

  return (
    <div className="w-full max-w-xs">
      <div className="relative h-2 bg-gradient-to-r from-red-200 via-yellow-200 to-green-200 rounded-full overflow-hidden">
        {/* Current price marker */}
        <div
          className="absolute top-0 h-full w-1 bg-slate-900 rounded-sm shadow-sm"
          style={{ left: `calc(${position}% - 2px)` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>${low.toFixed(2)}</span>
        <span className="font-semibold text-slate-800">${current.toFixed(2)}</span>
        <span>${high.toFixed(2)}</span>
      </div>
    </div>
  );
}

// Helper to format price change
function formatPriceChange(value: number | null | undefined, isPercent: boolean = false) {
  if (value === null || value === undefined) return <span className="text-gray-400">N/A</span>;
  const sign = value >= 0 ? "+" : "-";
  const color = value > 0 ? "text-green-600" : value < 0 ? "text-red-600" : "text-gray-600";
  const formatted = isPercent 
    ? `${sign}${Math.abs(value).toFixed(2)}%` 
    : `${sign}$${Math.abs(value).toFixed(2)}`;
  return <span className={color}>{formatted}</span>;
}

function DashboardPageContent() {
  const [user, setUser] = useState<any>(null);
  const [userAssets, setUserAssets] = useState<any[]>([]);
  const [recentNewsCount, setRecentNewsCount] = useState(0);
  const [latestBriefing, setLatestBriefing] = useState<any>(null);
  const [allBriefings, setAllBriefings] = useState<any[]>([]);
  const [relevantNews, setRelevantNews] = useState<Record<string, any[]>>({});
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string | null>(null);
  const [showNewPortfolioModal, setShowNewPortfolioModal] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [isSyncingNews, setIsSyncingNews] = useState(false);
  const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [editingAsset, setEditingAsset] = useState<any>(null);
  const [editAllocation, setEditAllocation] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const accessTokenRef = useRef<string | null>(null);
  
  // Single Supabase client instance to avoid "Multiple GoTrueClient instances" warning
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null);
  if (!supabaseRef.current) {
    supabaseRef.current = createBrowserClient();
  }
  const supabase = supabaseRef.current;
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlPortfolioId = searchParams.get("portfolio");

  const loadDashboardData = useCallback(
    async (userId: string, portfolioId?: string | null) => {
      // Use the shared supabase instance

      // 1) Load user assets (optionally filtered by portfolio)
      let assetsQuery = supabase
        .from("user_assets")
        .select(
          `
          id,
          importance_level,
          shares_held,
          average_cost,
          portfolio_id,
          portfolio_percentage,
          assets!inner (
            id,
            symbol,
            name,
            asset_type,
            current_price,
            previous_close,
            price_change_24h,
            price_change_pct_24h,
            day_high,
            day_low,
            week_52_high,
            week_52_low,
            last_price_update,
            ev_ebitda,
            next_earnings_date,
            month_change,
            month_change_pct,
            year_change,
            year_change_pct
          ),
          portfolios (
            id,
            name
          )
        `
        )
        .eq("user_id", userId);

      if (portfolioId) assetsQuery = assetsQuery.eq("portfolio_id", portfolioId);

      const { data: uaData, error: uaError } = await assetsQuery;
      if (uaError) {
        console.error("assetsQuery error:", uaError);
      }

      let ua: any[] = uaData || [];

      // If "All Portfolios", aggregate duplicates
      if (!portfolioId && ua.length > 0) {
        const aggregatedMap = new Map<string, any>();
        for (const userAsset of ua) {
          const assetId = userAsset.assets?.id;
          if (!assetId) continue;
          if (aggregatedMap.has(assetId)) {
            const existing = aggregatedMap.get(assetId);
            existing.portfolio_percentage =
              (existing.portfolio_percentage || 0) + (userAsset.portfolio_percentage || 0);
          } else {
            aggregatedMap.set(assetId, { ...userAsset });
          }
        }
        ua = Array.from(aggregatedMap.values());
      }

      // Sort by portfolio_percentage descending
      ua.sort(
        (a: any, b: any) => (b.portfolio_percentage || 0) - (a.portfolio_percentage || 0)
      );

      setUserAssets(ua);

      // 2) Recent news count (24h)
      const assetIds = ua.map((row: any) => row.assets?.id).filter(Boolean);
      let newsCount = 0;

      if (assetIds.length > 0) {
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);

        const { count } = await supabase
          .from("news_asset_relevance")
          .select("id, news_items!inner(published_at)", { count: "exact", head: true })
          .in("asset_id", assetIds)
          .gte("news_items.published_at", yesterday.toISOString());

        newsCount = count || 0;
      }

      setRecentNewsCount(newsCount);

      // 3) Briefings (latest 10)
      const { data: briefings } = await supabase
        .from("daily_briefings")
        .select("id, briefing_date, total_news_items, assets_covered, market_overview")
        .eq("user_id", userId)
        .order("briefing_date", { ascending: false })
        .limit(10);

      setAllBriefings(briefings || []);
      setLatestBriefing(briefings?.[0] || null);

      // 4) Relevant news per asset
      const newsMap: Record<string, any[]> = {};

      for (const row of ua) {
        const assetId = row.assets?.id || row.asset_id;
        if (!assetId) continue;

        const { data: news } = await supabase
          .from("news_asset_relevance")
          .select(
            `
            relevance_score,
            match_type,
            matched_terms,
            news_items!inner (
              id,
              title,
              summary,
              url,
              source_name,
              published_at
            )
          `
          )
          .eq("asset_id", assetId)
          .order("published_at", { referencedTable: "news_items", ascending: false })
          .limit(5);

        newsMap[assetId] = (news || []).map((n: any) => ({
          ...n.news_items,
          relevance_score: n.relevance_score,
          match_type: n.match_type,
          matched_terms: n.matched_terms,
        }));
      }

      setRelevantNews(newsMap);
    },
    [supabase]
  );

  const loadPortfolios = useCallback(async () => {
    try {
      const res = await fetchWithAuth(
        "/api/portfolios",
        {},
        accessTokenRef.current || undefined
      );
      if (res.ok) {
        const data = await res.json();
        setPortfolios(data.portfolios || []);
      }
    } catch (err) {
      console.error("Error loading portfolios:", err);
    }
  }, []);

  const handleSyncNews = async () => {
    setIsSyncingNews(true);
    setSyncResult(null);

    try {
      // Step 1: Sync financial data (prices, 52-week, fundamentals) with FORCE flag
      console.log('🔄 Syncing financial data...');
      const syncRes = await fetchWithAuth(
        `/api/sync/all?force=true${selectedPortfolio ? `&portfolio_id=${selectedPortfolio}` : ''}`,
        { method: "POST" },
        accessTokenRef.current || undefined
      );
      const syncData = await syncRes.json().catch(() => ({}));
      
      if (syncData.ok) {
        console.log('✓ Financial data synced:', syncData.updated);
      }
      
      // Step 2: Sync news articles
      console.log('🔄 Syncing news...');
      const res = await fetchWithAuth(
        "/api/ingest",
        { method: "POST" },
        accessTokenRef.current || undefined
      );
      const data = await res.json().catch(() => ({}));

      if (data.success) {
        const totalNew =
          (data.results?.newsApi?.itemsNew || 0) +
          (data.results?.finnhub?.itemsNew || 0) +
          (data.results?.tiingo?.itemsNew || 0) +
          (data.results?.agentic?.itemsNew || 0) +
          (data.results?.rss?.reduce((sum: number, r: any) => sum + r.itemsNew, 0) || 0);
        const matches = data.results?.relevance?.matches || 0;

        const financialUpdates = syncData.ok 
          ? ` | Updated ${syncData.updated.prices} prices, ${syncData.updated.fundamentals} fundamentals`
          : '';
        
        setSyncResult(`✓ Synced ${totalNew} new articles, ${matches} matched${financialUpdates}`);
        if (user) await loadDashboardData(user.id, selectedPortfolio);
      } else {
        setSyncResult(`✗ Sync failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Sync failed:", err);
      setSyncResult("✗ Sync failed: Network error");
    } finally {
      setIsSyncingNews(false);
    }
  };

  const handleGenerateBriefing = async () => {
    setIsGeneratingBriefing(true);

    try {
      const res = await fetchWithAuth(
        "/api/briefing/generate",
        { method: "POST" },
        accessTokenRef.current || undefined
      );
      const data = await res.json().catch(() => ({}));

      if (data.success) {
        setSyncResult(
          `✓ Briefing generated with ${data.briefing?.totalNewsItems || 0} news items`
        );
        if (user) await loadDashboardData(user.id, selectedPortfolio);
      } else {
        setSyncResult(`✗ Briefing failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Briefing failed:", err);
      setSyncResult("✗ Briefing failed: Network error");
    } finally {
      setIsGeneratingBriefing(false);
    }
  };

  const handleCreatePortfolio = async () => {
    if (!newPortfolioName.trim()) return;

    try {
      const res = await fetchWithAuth(
        "/api/portfolios",
        { method: "POST", body: JSON.stringify({ name: newPortfolioName.trim() }) },
        accessTokenRef.current || undefined
      );

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.portfolio) {
        await loadPortfolios();
        setSelectedPortfolio(data.portfolio.id);
        setNewPortfolioName("");
        setShowNewPortfolioModal(false);
        setSyncResult(`✓ Created fund "${data.portfolio.name}"`);
        router.push(`/dashboard?portfolio=${data.portfolio.id}`);
      } else {
        setSyncResult(`✗ Failed to create fund: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Error creating portfolio:", err);
      setSyncResult("✗ Failed to create fund: Network error");
    }
  };

  const handleEditAllocation = (ua: any) => {
    setEditingAsset(ua);
    setEditAllocation((ua.portfolio_percentage || 0).toString());
  };

  const handleSaveAllocation = async () => {
    if (!editingAsset) return;
    const newAllocation = parseFloat(editAllocation);
    if (isNaN(newAllocation) || newAllocation < 0 || newAllocation > 100) {
      setSyncResult("✗ Allocation must be between 0 and 100");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetchWithAuth(
        `/api/user/assets/${editingAsset.id}`,
        { method: "PATCH", body: JSON.stringify({ portfolio_percentage: newAllocation }) },
        accessTokenRef.current || undefined
      );
      if (res.ok) {
        setSyncResult(`✓ Updated ${editingAsset.assets.symbol} allocation to ${newAllocation}%`);
        setEditingAsset(null);
        if (user) await loadDashboardData(user.id, selectedPortfolio);
      } else {
        const data = await res.json().catch(() => ({}));
        setSyncResult(`✗ Failed to update: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Error updating allocation:", err);
      setSyncResult("✗ Failed to update: Network error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAsset = async (ua: any) => {
    if (!confirm(`Remove ${ua.assets.symbol} from this portfolio?`)) return;
    try {
      const res = await fetchWithAuth(
        `/api/user/assets/${ua.id}`,
        { method: "DELETE" },
        accessTokenRef.current || undefined
      );
      if (res.ok) {
        setSyncResult(`✓ Removed ${ua.assets.symbol} from portfolio`);
        if (user) await loadDashboardData(user.id, selectedPortfolio);
      }
    } catch (err) {
      console.error("Error deleting asset:", err);
    }
  };

  useEffect(() => {
    // Use shared supabase instance
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) console.error("getSession error:", error);

      if (!session?.user) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      accessTokenRef.current = session.access_token;

      // portfolios
      try {
        const res = await fetchWithAuth("/api/portfolios", {}, session.access_token);
        if (res.ok) {
          const data = await res.json();
          setPortfolios(data.portfolios || []);

          if (urlPortfolioId) {
            setSelectedPortfolio(urlPortfolioId);
          } else {
            const def = data.portfolios?.find((p: Portfolio) => p.is_default);
            if (def) setSelectedPortfolio(def.id);
          }
        }
      } catch (err) {
        console.error("Error loading portfolios:", err);
      }

      await loadDashboardData(session.user.id, urlPortfolioId || null);
    });
  }, [router, loadDashboardData, urlPortfolioId, supabase]);

  useEffect(() => {
    if (user && selectedPortfolio !== null) {
      loadDashboardData(user.id, selectedPortfolio);
    }
  }, [selectedPortfolio, user, loadDashboardData]);

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold text-gray-900">📈 Market Intelligence</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user.email}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Portfolio Selector & Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Portfolio:</label>
            <select
              value={selectedPortfolio || ""}
              onChange={(e) => {
                const newPortfolioId = e.target.value || null;
                setSelectedPortfolio(newPortfolioId);

                if (newPortfolioId) router.push(`/dashboard?portfolio=${newPortfolioId}`);
                else router.push("/dashboard");
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Portfolios</option>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name} {p.is_default ? "(Default)" : ""}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowNewPortfolioModal(true)}
              className="px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              + New Fund
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSyncNews}
              disabled={isSyncingNews}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-lg transition-colors flex items-center gap-2"
            >
              {isSyncingNews ? (
                <>
                  <span className="animate-spin">⟳</span> Syncing...
                </>
              ) : (
                <>🔄 Sync News</>
              )}
            </button>

            <button
              onClick={handleGenerateBriefing}
              disabled={isGeneratingBriefing}
              className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 rounded-lg transition-colors flex items-center gap-2"
            >
              {isGeneratingBriefing ? (
                <>
                  <span className="animate-spin">⟳</span> Generating...
                </>
              ) : (
                <>✨ Generate Briefing</>
              )}
            </button>
          </div>
        </div>

        {/* Sync Result Message */}
        {syncResult && (
          <div
            className={`mb-6 p-3 rounded-lg text-sm ${
              syncResult.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {syncResult}
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="text-sm font-medium text-gray-500">Tracked Assets</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{userAssets.length}</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="text-sm font-medium text-gray-500">News (24h)</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{recentNewsCount}</div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="text-sm font-medium text-gray-500">Latest Briefing</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">
              {latestBriefing?.briefing_date || "No briefings yet"}
            </div>
          </div>
        </div>

        {/* Asset Tracking Section */}
        <div className="bg-white rounded-xl shadow-sm mb-8">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Your Tracked Assets</h2>
            {selectedPortfolio && (
              <Link
                href={`/dashboard/assets/add?portfolio=${selectedPortfolio}`}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
              >
                + Add Asset
              </Link>
            )}
          </div>

          {userAssets.length === 0 ? (
            <div className="px-6 py-12 text-center">
              {selectedPortfolio ? (
                <>
                  <p className="text-gray-500 mb-4">
                    This fund doesn&apos;t have any assets yet. Add stocks and ETFs to track them.
                  </p>
                  <Link
                    href={`/dashboard/assets/add?portfolio=${selectedPortfolio}`}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Add your first asset →
                  </Link>
                </>
              ) : (
                <p className="text-gray-500">
                  No assets across any funds. Select a specific fund to add assets.
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {userAssets.map((ua: any) => (
                <div key={ua.id} className="px-6 py-5">
                  {/* Asset Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <span className="text-lg font-bold text-blue-700">
                          {ua.assets.symbol.substring(0, 2)}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 text-lg">
                            {ua.assets.symbol}
                          </span>
                          <span className="text-sm text-gray-500">{ua.assets.name}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm">
                          <span className="text-blue-600 font-medium">
                            {(ua.portfolio_percentage || 0).toFixed(1)}% allocation
                          </span>
                          <span className="text-gray-500">
                            EV/EBITDA: {ua.assets.ev_ebitda ? ua.assets.ev_ebitda.toFixed(1) : "N/A"}
                          </span>
                          <span className="text-gray-500">
                            Earnings:{" "}
                            {ua.assets.next_earnings_date 
                              ? new Date(ua.assets.next_earnings_date).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })
                              : "N/A"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Price Info */}
                      <div className="text-right">
                        <div className="font-semibold text-gray-900 text-lg">
                          ${Number(ua.assets.current_price || 0).toFixed(2)}
                        </div>
                        <div className="text-sm">
                          {formatPriceChange(ua.assets.price_change_24h)}{" "}
                          {formatPriceChange(ua.assets.price_change_pct_24h, true)}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      {selectedPortfolio && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditAllocation(ua)}
                            className="p-2 text-gray-400 hover:text-blue-600 rounded"
                            title="Edit allocation"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteAsset(ua)}
                            className="p-2 text-gray-400 hover:text-red-600 rounded"
                            title="Remove"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 52-Week Range Bar */}
                  <div className="mt-3 pl-16">
                    <Render52WeekBar
                      current={ua.assets.current_price}
                      low={ua.assets.week_52_low}
                      high={ua.assets.week_52_high}
                    />
                  </div>

                  {/* Price Changes (1M/1Y) */}
                  <div className="mt-3 pl-16 flex gap-6 text-sm">
                    <div>
                      <span className="text-gray-500">1M: </span>
                      {formatPriceChange(ua.assets.month_change)}{" "}
                      {formatPriceChange(ua.assets.month_change_pct, true)}
                    </div>
                    <div>
                      <span className="text-gray-500">1Y: </span>
                      {formatPriceChange(ua.assets.year_change)}{" "}
                      {formatPriceChange(ua.assets.year_change_pct, true)}
                    </div>
                  </div>

                  {/* Relevant News */}
                  <div className="mt-4 pl-16">
                    <div className="font-semibold text-sm text-gray-700 mb-2">Relevant News</div>

                    {(relevantNews[ua.assets.id] || []).length === 0 ? (
                      <div className="text-xs text-gray-400">No recent news matched.</div>
                    ) : (
                      <ul className="space-y-2">
                        {relevantNews[ua.assets.id].map((news: any) => (
                          <li key={news.id} className="text-sm">
                            <a
                              href={news.url}
                              target="_blank"
                              rel="noopener"
                              className="text-blue-600 hover:underline font-medium"
                            >
                              {news.title}
                            </a>
                            <div className="text-xs text-gray-500 mt-0.5">
                              <span className="text-gray-400">
                                {news.match_type} • Score: {(news.relevance_score || 0).toFixed(2)}
                              </span>
                              <span className="mx-1">·</span>
                              <span>
                                {news.source_name} •{" "}
                                {new Date(news.published_at).toLocaleDateString()}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Briefings */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Recent Briefings</h2>
            <button
              onClick={handleGenerateBriefing}
              disabled={isGeneratingBriefing}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {isGeneratingBriefing ? "Generating..." : "+ Generate New"}
            </button>
          </div>

          <div className="px-6 py-4">
            {allBriefings.length > 0 ? (
              <div className="space-y-3">
                {allBriefings.map((briefing) => (
                  <Link
                    key={briefing.id}
                    href={`/dashboard/briefings/${briefing.briefing_date}`}
                    className="block p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium text-gray-900">
                          {new Date(briefing.briefing_date + 'T12:00:00').toLocaleDateString("en-US", {
                            weekday: "long",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                        <div className="text-sm text-gray-500">
                          {briefing.total_news_items} news items • {briefing.assets_covered} assets
                        </div>
                      </div>
                      <span className="text-blue-600 flex-shrink-0 ml-4">View →</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">
                  No briefings yet. Click &quot;Generate New&quot; or sync news first.
                </p>
                <button
                  onClick={handleGenerateBriefing}
                  disabled={isGeneratingBriefing}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-purple-400"
                >
                  {isGeneratingBriefing ? "Generating..." : "✨ Generate Your First Briefing"}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* New Portfolio Modal */}
      {showNewPortfolioModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Fund</h3>
            <p className="text-sm text-gray-600 mb-4">
              Create a new portfolio to organize your investments separately.
            </p>

            <input
              type="text"
              placeholder="Fund name (e.g., Retirement, Trading, Tech Stocks)"
              value={newPortfolioName}
              onChange={(e) => setNewPortfolioName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreatePortfolio()}
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowNewPortfolioModal(false);
                  setNewPortfolioName("");
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleCreatePortfolio}
                disabled={!newPortfolioName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
              >
                Create Fund
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Allocation Modal */}
      {editingAsset && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Edit Allocation: {editingAsset.assets.symbol}
            </h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Portfolio Allocation %
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={editAllocation}
                  onChange={(e) => setEditAllocation(e.target.value)}
                  min="0"
                  max="100"
                  step="0.01"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleSaveAllocation()}
                />
                <span className="text-gray-600 font-medium">%</span>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEditingAsset(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleSaveAllocation}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="text-lg">Loading dashboard...</div></div>}>
      <DashboardPageContent />
    </Suspense>
  );
}
