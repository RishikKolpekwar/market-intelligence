"use client";
import { createBrowserClient } from '@/lib/supabase/client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

// Helper to make authenticated API calls
const fetchWithAuth = async (url: string, options: RequestInit = {}, accessToken?: string) => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  
  if (accessToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
  }
  
  return fetch(url, { ...options, headers });
};

// Helper to fetch next earnings date from Finnhub
async function fetchEarningsDate(symbol: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/earnings-date?symbol=${symbol}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.earningsDate || null;
  } catch {
    return null;
  }
}

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

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [userAssets, setUserAssets] = useState<any[]>([]);
  const [recentNewsCount, setRecentNewsCount] = useState(0);
  const [latestBriefing, setLatestBriefing] = useState<any>(null);
  const [allBriefings, setAllBriefings] = useState<any[]>([]);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [earningsDates, setEarningsDates] = useState<Record<string, string>>({});
  const [relevantNews, setRelevantNews] = useState<Record<string, any[]>>({});
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string | null>(null);
  const [showNewPortfolioModal, setShowNewPortfolioModal] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [isSyncingNews, setIsSyncingNews] = useState(false);
  const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlPortfolioId = searchParams.get('portfolio');

  const loadDashboardData = useCallback(async (userId: string, portfolioId?: string | null) => {
    const supabase = createBrowserClient();
    
    // Build query for user assets
    let assetsQuery = supabase
      .from('user_assets')
      .select(`
        id,
        importance_level,
        shares_held,
        average_cost,
        portfolio_id,
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
          last_price_update
        )
      `)
      .eq('user_id', userId);
    
    // Filter by portfolio if selected
    if (portfolioId) {
      assetsQuery = assetsQuery.eq('portfolio_id', portfolioId);
    }
    
    const { data: userAssets } = await assetsQuery;
    setUserAssets(userAssets || []);

    // Get recent news count
    const assetIds = userAssets?.map((ua: any) => ua.assets.id) || [];
    let newsCount = 0;
    if (assetIds.length > 0) {
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);
      const { count } = await supabase
        .from('news_asset_relevance')
        .select('id, news_items!inner(published_at)', { count: 'exact', head: true })
        .in('asset_id', assetIds)
        .gte('news_items.published_at', yesterday.toISOString());
      newsCount = count || 0;
    }
    setRecentNewsCount(newsCount);

    // Get all briefings (not just latest)
    const { data: briefings } = await supabase
      .from('daily_briefings')
      .select('id, briefing_date, total_news_items, assets_covered, market_overview')
      .eq('user_id', userId)
      .order('briefing_date', { ascending: false })
      .limit(10);
    setAllBriefings(briefings || []);
    setLatestBriefing(briefings?.[0] || null);

    // Calculate portfolio value
    const totalValue = (userAssets || []).reduce((sum: number, ua: any) => sum + ((ua.shares_held || 0) * (ua.assets.current_price || 0)), 0);
    setPortfolioValue(totalValue);

    // Fetch next earnings dates for each asset
    const dates: Record<string, string> = {};
    await Promise.all((userAssets || []).map(async (ua: any) => {
      const symbol = ua.assets.symbol;
      const date = await fetchEarningsDate(symbol);
      if (date) dates[symbol] = date;
    }));
    setEarningsDates(dates);

    // Fetch relevant news for each asset
    const newsMap: Record<string, any[]> = {};
    for (const ua of (userAssets || []) as any[]) {
      const assetId = ua.assets?.id || ua.asset_id;
      if (!assetId) continue;
      const { data: news } = await supabase
        .from('news_asset_relevance')
        .select(`
          relevance_summary,
          news_items!inner (id, title, summary, url, source_name, published_at)
        `)
        .eq('asset_id', assetId)
        .order('news_items(published_at)', { ascending: false })
        .limit(5);
      
      newsMap[assetId] = (news || []).map((n: any) => ({
        ...n.news_items,
        relevance_summary: n.relevance_summary
      }));
    }
    setRelevantNews(newsMap);
  }, []);

  const loadPortfolios = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/portfolios', {}, accessTokenRef.current || undefined);
      if (res.ok) {
        const data = await res.json();
        setPortfolios(data.portfolios || []);
        // Select default portfolio if none selected
        if (!selectedPortfolio && data.portfolios?.length > 0) {
          const defaultPortfolio = data.portfolios.find((p: Portfolio) => p.is_default);
          if (defaultPortfolio) {
            setSelectedPortfolio(defaultPortfolio.id);
          }
        }
      }
    } catch (err) {
      console.error('Error loading portfolios:', err);
    }
  }, [selectedPortfolio]);

  const handleSyncNews = async () => {
    setIsSyncingNews(true);
    setSyncResult(null);
    try {
      const res = await fetchWithAuth('/api/ingest', { method: 'POST' }, accessTokenRef.current || undefined);
      const data = await res.json();
      if (data.success) {
        const newsApi = data.results?.newsApi?.itemsNew || 0;
        const finnhub = data.results?.finnhub?.itemsNew || 0;
        const tiingo = data.results?.tiingo?.itemsNew || 0;
        const agentic = data.results?.agentic?.itemsNew || 0;
        const rss = data.results?.rss?.reduce((sum: number, r: any) => sum + r.itemsNew, 0) || 0;
        const matches = data.results?.relevance?.matches || 0;
        const totalNew = newsApi + finnhub + tiingo + agentic + rss;
        
        let msg = `✓ Synced ${totalNew} new articles`;
        if (agentic > 0) msg += ` (including ${agentic} from AI Research)`;
        msg += `, ${matches} matched to your assets`;
        
        setSyncResult(msg);
        // Reload dashboard data
        if (user) {
          await loadDashboardData(user.id, selectedPortfolio);
        }
      } else {
        setSyncResult(`✗ Sync failed: ${data.error}`);
      }
    } catch (err) {
      setSyncResult('✗ Sync failed: Network error');
    } finally {
      setIsSyncingNews(false);
    }
  };

  const handleGenerateBriefing = async () => {
    setIsGeneratingBriefing(true);
    try {
      const res = await fetchWithAuth('/api/briefing/generate', { method: 'POST' }, accessTokenRef.current || undefined);
      const data = await res.json();
      if (data.success) {
        setSyncResult(`✓ Briefing generated with ${data.briefing.totalNewsItems} news items`);
        // Reload briefings
        if (user) {
          await loadDashboardData(user.id, selectedPortfolio);
        }
      } else {
        setSyncResult(`✗ Briefing failed: ${data.error}`);
      }
    } catch (err) {
      setSyncResult('✗ Briefing failed: Network error');
    } finally {
      setIsGeneratingBriefing(false);
    }
  };

  const handleCreatePortfolio = async () => {
    if (!newPortfolioName.trim()) return;
    try {
      const res = await fetchWithAuth('/api/portfolios', {
        method: 'POST',
        body: JSON.stringify({ name: newPortfolioName.trim() }),
      }, accessTokenRef.current || undefined);
      const data = await res.json();
      if (res.ok && data.portfolio) {
        await loadPortfolios();
        setSelectedPortfolio(data.portfolio.id);
        setNewPortfolioName('');
        setShowNewPortfolioModal(false);
        setSyncResult(`✓ Created fund "${data.portfolio.name}"`);
      } else {
        // Show error message
        setSyncResult(`✗ Failed to create fund: ${data.error || 'Unknown error'}`);
        console.error('Portfolio creation failed:', data);
      }
    } catch (err) {
      console.error('Error creating portfolio:', err);
      setSyncResult('✗ Failed to create fund: Network error');
    }
  };

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) {
        router.replace('/login');
        return;
      }
      setUser(session.user);
      accessTokenRef.current = session.access_token;
      
      // Load portfolios with the token (need to call API directly since loadPortfolios won't have token yet)
      try {
        const res = await fetchWithAuth('/api/portfolios', {}, session.access_token);
        if (res.ok) {
          const data = await res.json();
          setPortfolios(data.portfolios || []);
          
          // Set selected portfolio from URL or leave as null (all portfolios)
          if (urlPortfolioId) {
            setSelectedPortfolio(urlPortfolioId);
          }
        }
      } catch (err) {
        console.error('Error loading portfolios:', err);
      }
      
      // Load dashboard data with URL portfolio if provided
      loadDashboardData(session.user.id, urlPortfolioId || null);
    });
  }, [router, loadDashboardData, urlPortfolioId]);

  // Reload assets when portfolio changes
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
              <Link
                href="/settings"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Settings
              </Link>
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
              value={selectedPortfolio || ''}
              onChange={(e) => {
                const newPortfolioId = e.target.value || null;
                setSelectedPortfolio(newPortfolioId);
                // Update URL to match selection
                if (newPortfolioId) {
                  router.push(`/dashboard?portfolio=${newPortfolioId}`);
                } else {
                  router.push('/dashboard');
                }
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Portfolios</option>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name} {p.is_default ? '(Default)' : ''}
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
          <div className={`mb-6 p-3 rounded-lg text-sm ${
            syncResult.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {syncResult}
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="text-sm font-medium text-gray-500">Tracked Assets</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {userAssets.length}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="text-sm font-medium text-gray-500">News (24h)</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {recentNewsCount}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="text-sm font-medium text-gray-500">Portfolio Value</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              ${portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="text-sm font-medium text-gray-500">Latest Briefing</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">
              {latestBriefing?.briefing_date || 'No briefings yet'}
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
                <div key={ua.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                        <span className="text-lg font-bold text-gray-600">
                          {ua.assets.symbol.substring(0, 2)}
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">
                          {ua.assets.symbol}
                        </div>
                        <div className="text-sm text-gray-500">{ua.assets.name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      {ua.assets.current_price && (
                        <div className="text-right">
                          <div className="font-medium text-gray-900">
                            ${ua.assets.current_price.toFixed(2)}
                          </div>
                          {ua.assets.price_change_pct_24h !== null && (
                            <div
                              className={`text-sm font-medium ${
                                ua.assets.price_change_pct_24h >= 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {ua.assets.price_change_pct_24h >= 0 ? '+' : ''}
                              {ua.assets.price_change_pct_24h.toFixed(2)}%
                              {ua.assets.price_change_24h && (
                                <span className="text-xs ml-1">
                                  ({ua.assets.price_change_24h >= 0 ? '+' : ''}${ua.assets.price_change_24h.toFixed(2)})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          ua.importance_level === 'critical'
                            ? 'bg-red-100 text-red-700'
                            : ua.importance_level === 'high'
                            ? 'bg-orange-100 text-orange-700'
                            : ua.importance_level === 'low'
                            ? 'bg-gray-100 text-gray-600'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {ua.importance_level}
                      </span>
                    </div>
                  </div>
                  
                  {/* 52-Week Range */}
                  {ua.assets.week_52_low && ua.assets.week_52_high && ua.assets.current_price && (
                    <div className="mt-3 pl-16">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>52W: ${ua.assets.week_52_low.toFixed(2)}</span>
                        <div className="flex-1 relative h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="absolute top-0 left-0 h-full bg-blue-500 rounded-full"
                            style={{
                              width: `${Math.min(100, Math.max(0, 
                                ((ua.assets.current_price - ua.assets.week_52_low) / 
                                (ua.assets.week_52_high - ua.assets.week_52_low)) * 100
                              ))}%`,
                            }}
                          />
                          <div
                            className="absolute top-0 w-1 h-full bg-gray-900"
                            style={{
                              left: `${Math.min(100, Math.max(0, 
                                ((ua.assets.current_price - ua.assets.week_52_low) / 
                                (ua.assets.week_52_high - ua.assets.week_52_low)) * 100
                              ))}%`,
                            }}
                          />
                        </div>
                        <span>${ua.assets.week_52_high.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {/* Holdings Value */}
                  {ua.shares_held && ua.assets.current_price && (
                    <div className="mt-2 pl-16 text-sm text-gray-600">
                      {ua.shares_held} shares • Value: ${(ua.shares_held * ua.assets.current_price).toFixed(2)}
                      {ua.average_cost && (
                        <span className={`ml-2 ${
                          ua.assets.current_price >= ua.average_cost ? 'text-green-600' : 'text-red-600'
                        }`}>
                          ({ua.assets.current_price >= ua.average_cost ? '+' : ''}
                          {(((ua.assets.current_price - ua.average_cost) / ua.average_cost) * 100).toFixed(2)}% vs cost)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Portfolio percentage */}
                  {portfolioValue > 0 && ua.shares_held && ua.assets.current_price && (
                    <div className="mt-1 pl-16 text-xs text-gray-500">
                      Portfolio %: {((ua.shares_held * ua.assets.current_price) / portfolioValue * 100).toFixed(2)}%
                    </div>
                  )}
                  {/* Next earnings date */}
                  {earningsDates[ua.assets.symbol] && (
                    <div className="mt-1 pl-16 text-xs text-blue-600">
                      Next Earnings: {earningsDates[ua.assets.symbol]}
                    </div>
                  )}
                  {/* Relevant news */}
                  <div className="mt-2 pl-16">
                    <div className="font-semibold text-sm text-gray-700 mb-1">Relevant News</div>
                    {(relevantNews[ua.assets.id] || []).length === 0 ? (
                      <div className="text-xs text-gray-400">No recent news matched.</div>
                    ) : (
                      <ul className="list-disc ml-4">
                        {relevantNews[ua.assets.id].map((news: any) => (
                          <li key={news.id} className="mb-2">
                            <a href={news.url} target="_blank" rel="noopener" className="text-blue-700 hover:underline block font-medium">
                              {news.title}
                            </a>
                            {news.relevance_summary && (
                              <p className="text-xs text-gray-600 italic mt-0.5 border-l-2 border-blue-100 pl-2">
                                AI Context: {news.relevance_summary}
                              </p>
                            )}
                            <span className="text-[10px] text-gray-400">{news.source_name} • {new Date(news.published_at).toLocaleDateString()}</span>
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
              {isGeneratingBriefing ? 'Generating...' : '+ Generate New'}
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
                          {new Date(briefing.briefing_date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                        <div className="text-sm text-gray-500">
                          {briefing.total_news_items} news items • {briefing.assets_covered} assets
                        </div>
                        {briefing.market_overview && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {briefing.market_overview.substring(0, 150)}...
                          </p>
                        )}
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
                  {isGeneratingBriefing ? 'Generating...' : '✨ Generate Your First Briefing'}
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
              Create a new portfolio to organize your investments separately. Each fund tracks its own assets and performance.
            </p>
            <input
              type="text"
              placeholder="Fund name (e.g., Retirement, Trading, Tech Stocks)"
              value={newPortfolioName}
              onChange={(e) => setNewPortfolioName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowNewPortfolioModal(false);
                  setNewPortfolioName('');
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
    </div>
  );
}
