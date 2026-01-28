"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface AssetSummary {
  symbol: string;
  name?: string;
  summary: string;
  newsCount: number;
  newsLinks?: {
    title: string;
    url: string;
    source: string;
    publishedAt: string;
  }[];
  portfolioPercentage?: number;
  portfolioAllocations?: Array<{
    portfolioName: string;
    percentage: number;
  }>;
  evEbitda?: number | null;
  nextEarningsDate?: string | null;
  currentPrice?: number | null;
  priceChange?: number | null;
  priceChangePercent?: number | null;
  week52High?: number | null;
  week52Low?: number | null;
  priceChangeMonth?: number | null;
  priceChangePctMonth?: number | null;
  priceChangeYear?: number | null;
  priceChangePctYear?: number | null;
}

interface NotableHeadline {
  title: string;
  url: string;
  source: string;
  why_it_matters?: string;
}

interface Briefing {
  id: string;
  briefing_date: string;
  market_overview: string;
  asset_summaries: AssetSummary[];
  notable_headlines: NotableHeadline[];
  total_news_items: number;
  assets_covered: number;
  llm_model?: string;
  generation_time_ms?: number;
  created_at: string;
}

// Format currency
const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "—";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Format change with color
const formatChange = (
  value: number | null | undefined,
  isPercent: boolean = false
): JSX.Element => {
  if (value === null || value === undefined) {
    return <span className="text-slate-400">—</span>;
  }
  const colorClass = value > 0 ? "text-emerald-600" : value < 0 ? "text-red-500" : "text-slate-600";
  const sign = value >= 0 ? "+" : "-";
  const formatted = isPercent
    ? `${sign}${Math.abs(value).toFixed(2)}%`
    : `${sign}$${Math.abs(value).toFixed(2)}`;
  return <span className={`font-medium ${colorClass}`}>{formatted}</span>;
};

export default function BriefingDetailPage() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const params = useParams();
  const date = params.date as string;

  useEffect(() => {
    const supabase = createBrowserClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: briefingData, error } = await supabase
        .from("daily_briefings")
        .select("*")
        .eq("user_id", user.id)
        .eq("briefing_date", date)
        .single();

      if (error || !briefingData) {
        console.error("Error fetching briefing:", error);
        setLoading(false);
        return;
      }

      // Sort asset_summaries by portfolioPercentage descending
      const sortedBriefing = {
        ...(briefingData as any),
        asset_summaries: [...((briefingData as any)?.asset_summaries || [])].sort(
          (a: AssetSummary, b: AssetSummary) =>
            (b.portfolioPercentage || 0) - (a.portfolioPercentage || 0)
        ),
      };

      setBriefing(sortedBriefing as Briefing);
      setLoading(false);
    });
  }, [date, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading briefing...
        </div>
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-700 mb-4 inline-flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to Dashboard
          </Link>
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-8 text-center border border-white/50">
            <div className="text-4xl mb-4">📭</div>
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Briefing Not Found</h1>
            <p className="text-slate-600">No briefing exists for {date}</p>
          </div>
        </div>
      </div>
    );
  }

  const formattedDate = new Date(briefing.briefing_date + 'T12:00:00').toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-sm border-b border-white/50 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-slate-600 hover:text-slate-900 text-sm inline-flex items-center gap-1 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Dashboard
          </Link>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>{briefing.assets_covered} assets</span>
            <span>•</span>
            <span>{briefing.total_news_items} sources</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Briefing Header Card */}
        <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 rounded-2xl shadow-xl p-8 mb-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl"></div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">📈</span>
              <h1 className="text-2xl sm:text-3xl font-bold">Daily Market Briefing</h1>
            </div>
            <p className="text-blue-200 text-lg">{formattedDate}</p>
            <div className="flex flex-wrap gap-3 mt-4">
              <span className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-sm border border-white/20">
                {briefing.total_news_items} news items analyzed
              </span>
              <span className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-sm border border-white/20">
                {briefing.assets_covered} assets covered
              </span>
            </div>
          </div>
        </div>

        {/* Market Overview */}
        {briefing.market_overview && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
              🌍 Market Overview
            </h2>
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
              {briefing.market_overview}
            </p>
          </div>
        )}

        {/* Portfolio Holdings Table */}
        {briefing.asset_summaries && briefing.asset_summaries.length > 0 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                📊 Portfolio Holdings
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Ticker</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600 min-w-[140px]">Company</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Alloc %</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">EV/EBITDA</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Earnings</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">52W Low</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Price</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">52W High</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Day $</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Day %</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">1M $</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">1M %</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">1Y $</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">1Y %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {briefing.asset_summaries.map((asset, index) => (
                    <tr key={index} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 px-2 py-1 rounded text-sm">
                          {asset.symbol}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-900 truncate max-w-[140px]" title={asset.name}>
                          {asset.name || asset.symbol}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div>
                          <span className="font-semibold text-blue-600">
                            {(asset.portfolioPercentage || 0).toFixed(2)}%
                          </span>
                          {asset.portfolioAllocations && asset.portfolioAllocations.length > 1 && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {asset.portfolioAllocations.map((alloc, i) => (
                                <span key={i}>
                                  {i > 0 && ' + '}
                                  {alloc.percentage.toFixed(0)}% {alloc.portfolioName}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {asset.evEbitda !== null && asset.evEbitda !== undefined
                          ? asset.evEbitda.toFixed(1)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {asset.nextEarningsDate
                          ? new Date(asset.nextEarningsDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {formatCurrency(asset.week52Low)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {formatCurrency(asset.currentPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {formatCurrency(asset.week52High)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatChange(asset.priceChange)}</td>
                      <td className="px-4 py-3 text-right">{formatChange(asset.priceChangePercent, true)}</td>
                      <td className="px-4 py-3 text-right">{formatChange(asset.priceChangeMonth)}</td>
                      <td className="px-4 py-3 text-right">{formatChange(asset.priceChangePctMonth, true)}</td>
                      <td className="px-4 py-3 text-right">{formatChange(asset.priceChangeYear)}</td>
                      <td className="px-4 py-3 text-right">{formatChange(asset.priceChangePctYear, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Asset Analysis Sections */}
        {briefing.asset_summaries && briefing.asset_summaries.length > 0 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              📝 Asset Analysis
            </h2>
            <div className="space-y-6">
              {briefing.asset_summaries.map((asset, index) => (
                <div key={index} className="border-b border-slate-100 pb-6 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-1.5 rounded-lg text-lg">
                        {asset.symbol}
                      </span>
                      {asset.name && (
                        <span className="text-sm text-slate-500">— {asset.name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {asset.newsCount > 0 && (
                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                          {asset.newsCount} articles
                        </span>
                      )}
                      <span className="font-semibold text-blue-600">
                        {(asset.portfolioPercentage || 0).toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  {/* Contextualized Summary */}
                  <div className="bg-gradient-to-r from-slate-50 to-blue-50/30 rounded-xl p-4 mb-4 border border-slate-100">
                    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {asset.summary?.replace(/^\s*#\s*$/gm, '').trim()}
                    </p>
                  </div>

                  {/* News Links - Show first 3, expandable */}
                  {asset.newsLinks && asset.newsLinks.length > 0 && (
                    <div className="mt-3">
                      <div className="space-y-2">
                        {asset.newsLinks.slice(0, 3).map((link, linkIndex) => (
                          <a
                            key={linkIndex}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-3 p-3 rounded-lg bg-white hover:bg-blue-50 border border-slate-100 hover:border-blue-200 transition-all group"
                          >
                            <span className="text-blue-500 mt-0.5 shrink-0">→</span>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-slate-800 group-hover:text-blue-700 font-medium line-clamp-1">
                                {link.title}
                              </span>
                              <span className="text-xs text-slate-400 block mt-0.5">{link.source}</span>
                            </div>
                            <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        ))}
                      </div>

                      {/* Additional Sources - Always Visible Scrollable Box */}
                      {asset.newsLinks.length > 3 && (
                        <div className="mt-3">
                          <div className="text-xs text-slate-500 font-medium mb-2">
                            + {asset.newsLinks.length - 3} more sources for {asset.symbol}:
                          </div>
                          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2 space-y-2">
                            {asset.newsLinks.slice(3).map((link, linkIndex) => (
                              <a
                                key={linkIndex}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-3 p-3 rounded-lg bg-white hover:bg-blue-50 border border-slate-100 hover:border-blue-200 transition-all group"
                              >
                                <span className="text-blue-400 mt-0.5 shrink-0">→</span>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm text-slate-800 group-hover:text-blue-700 font-medium line-clamp-1">
                                    {link.title}
                                  </span>
                                  <span className="text-xs text-slate-400 block mt-0.5">
                                    {link.source} • {new Date(link.publishedAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notable Headlines - Macro News */}
        {briefing.notable_headlines && briefing.notable_headlines.length > 0 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              🌍 Market Headlines
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              Key macro developments affecting the broader market
            </p>
            <div className="space-y-4">
              {briefing.notable_headlines.slice(0, 5).map((headline, index) => (
                <div key={index} className="border-l-4 border-amber-400 pl-4 py-2 bg-gradient-to-r from-amber-50 to-orange-50/30 rounded-r-xl">
                  <div className="font-medium text-slate-900">
                    {headline.url && headline.url !== '#' ? (
                      <a
                        href={headline.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-600 hover:underline"
                      >
                        {headline.title}
                      </a>
                    ) : (
                      headline.title
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{headline.source}</div>
                  {headline.why_it_matters && (
                    <div className="mt-2 text-sm text-slate-600 bg-white/70 rounded px-2 py-1">
                      <span className="font-medium text-amber-700">Why it matters:</span>{' '}
                      {headline.why_it_matters}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 py-4">
          <p>
            This briefing is for informational purposes only and does not constitute financial
            advice.
          </p>
          <p className="mt-1">
            Generated at {new Date(briefing.created_at).toLocaleTimeString()}
            {briefing.generation_time_ms && ` in ${briefing.generation_time_ms}ms`}
          </p>
        </div>
      </main>
    </div>
  );
}
