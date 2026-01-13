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
  const colorClass = value > 0 ? "text-emerald-600" : value < 0 ? "text-red-600" : "text-slate-600";
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading briefing...</div>
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-700 text-sm">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Briefing Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">📈</span>
            <h1 className="text-2xl font-bold text-slate-900">Daily Market Briefing</h1>
          </div>
          <p className="text-slate-600">{formattedDate}</p>
          <div className="flex gap-4 mt-3 text-sm text-slate-500">
            <span>{briefing.total_news_items} news items</span>
            <span>•</span>
            <span>{briefing.assets_covered} assets covered</span>
            {briefing.llm_model && (
              <>
                <span>•</span>
                <span>Generated by {briefing.llm_model}</span>
              </>
            )}
          </div>
        </div>

        {/* Market Overview */}
        {briefing.market_overview && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
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
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 overflow-hidden">
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
                    <tr key={index} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-slate-900">{asset.symbol}</span>
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
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              📝 Asset Analysis
            </h2>
            <div className="space-y-6">
              {briefing.asset_summaries.map((asset, index) => (
                <div key={index} className="border-b border-slate-100 pb-6 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-blue-700 text-lg">{asset.symbol}</span>
                      {asset.name && (
                        <span className="text-sm text-slate-500">— {asset.name}</span>
                      )}
                    </div>
                    {/* Portfolio Allocation Breakdown */}
                    <div className="text-right">
                      <span className="font-semibold text-blue-600">
                        {(asset.portfolioPercentage || 0).toFixed(2)}% total
                      </span>
                      {asset.portfolioAllocations && asset.portfolioAllocations.length > 1 && (
                        <div className="text-xs text-slate-500">
                          ({asset.portfolioAllocations.map((alloc, i) => (
                            <span key={i}>
                              {i > 0 && ' + '}
                              {alloc.percentage.toFixed(0)}% from {alloc.portfolioName}
                            </span>
                          ))})
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Contextualized Summary */}
                  <div className="bg-slate-50 rounded-lg p-4 mb-3">
                    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {/* Remove any stray # characters from LLM response */}
                      {asset.summary?.replace(/^\s*#\s*$/gm, '').trim()}
                    </p>
                    {/* Disclosure for contextual sources - show actual source names */}
                    {asset.newsLinks && asset.newsLinks.length > 5 && (
                      <div className="text-xs text-slate-500 mt-3 border-t border-slate-200 pt-2">
                        <span className="font-medium">Additional sources referenced: </span>
                        {asset.newsLinks.slice(5).map((link, i) => (
                          <span key={i}>
                            {i > 0 && ', '}
                            <a 
                              href={link.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {link.source}
                            </a>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* News Links */}
                  {asset.newsLinks && asset.newsLinks.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
                        Source Articles ({asset.newsCount} total)
                      </div>
                      <ul className="space-y-1.5">
                        {asset.newsLinks.slice(0, 5).map((link, linkIndex) => (
                          <li key={linkIndex} className="flex items-start gap-2">
                            <span className="text-blue-400 mt-0.5 text-xs">→</span>
                            <div className="flex-1 min-w-0">
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-700 hover:underline line-clamp-1"
                              >
                                {link.title}
                              </a>
                              <span className="text-xs text-slate-400 ml-2">{link.source}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notable Headlines - Macro News */}
        {briefing.notable_headlines && briefing.notable_headlines.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              🌍 Market Headlines
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              Key macro developments affecting the broader market
            </p>
            <div className="space-y-4">
              {briefing.notable_headlines.slice(0, 5).map((headline, index) => (
                <div key={index} className="border-l-4 border-amber-500 pl-4 py-2 bg-amber-50/50 rounded-r-lg">
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
            
            {/* Source Governance Disclosure */}
            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="text-xs text-slate-500 italic">
                <span className="font-medium">Source governance:</span> Displayed headlines represent primary sources. Additional perspectives from broader market coverage may be referenced in analysis.
              </p>
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
