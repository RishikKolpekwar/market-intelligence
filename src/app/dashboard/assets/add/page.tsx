'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange?: string;
}

export default function AddAssetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const portfolioId = searchParams.get('portfolio');
  
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedSymbol, setAddedSymbol] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [portfolioName, setPortfolioName] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        setAccessToken(session.access_token);
        
        // Fetch portfolio name if we have a portfolio ID
        if (portfolioId) {
          supabase
            .from('portfolios')
            .select('name')
            .eq('id', portfolioId)
            .single()
            .then(({ data }) => {
              if (data) setPortfolioName(data.name);
            });
        }
      } else {
        setError('Please log in to add assets');
      }
      setIsLoading(false);
    });
  }, [portfolioId]);

  // Direct ticker add - just type a symbol
  const handleDirectAdd = async () => {
    if (!query.trim()) return;
    if (!user || !accessToken) {
      setError('Unauthorized');
      return;
    }
    setIsAdding(true);
    setError(null);
    
    try {
      const response = await fetch('/api/user/assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          symbol: query.trim().toUpperCase(),
          importance_level: 'normal',
          portfolio_id: portfolioId || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add asset');
      }

      setAddedSymbol(query.trim().toUpperCase());
      setQuery('');
      
      // Redirect after a short delay - go back to the specific portfolio if we came from one
      setTimeout(() => {
        router.push(`/dashboard${portfolioId ? `?portfolio=${portfolioId}` : ''}`);
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add asset');
    } finally {
      setIsAdding(false);
    }
  };

  // Search for symbols
  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/assets/search?q=${encodeURIComponent(query)}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!response.ok) throw new Error('Search failed');
      
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  // Add from search results
  const handleAddFromSearch = async (result: SearchResult) => {
    if (!user || !accessToken) {
      setError('Unauthorized');
      return;
    }
    setIsAdding(true);
    setError(null);
    
    try {
      const response = await fetch('/api/user/assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          symbol: result.symbol,
          importance_level: 'normal',
          portfolio_id: portfolioId || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add asset');
      }

      setAddedSymbol(result.symbol);
      
      setTimeout(() => {
        router.push(`/dashboard${portfolioId ? `?portfolio=${portfolioId}` : ''}`);
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add asset');
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link 
              href={`/dashboard${portfolioId ? `?portfolio=${portfolioId}` : ''}`} 
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Add Asset</h1>
              {portfolioName && (
                <p className="text-sm text-gray-500">Adding to: {portfolioName}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Success Message */}
        {addedSymbol && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-green-700">
              <span className="text-xl">✓</span>
              <span className="font-medium">{addedSymbol} added to your watchlist!</span>
            </div>
            <p className="text-sm text-green-600 mt-1">Redirecting to dashboard...</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Quick Add Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Add by Ticker</h2>
          <p className="text-sm text-gray-600 mb-4">
            Enter a stock or ETF ticker symbol. We&apos;ll automatically detect the asset type.
          </p>
          
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleDirectAdd()}
              placeholder="e.g., AAPL, SPY, VFIAX"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
              disabled={isAdding}
            />
            <button
              onClick={handleDirectAdd}
              disabled={!query.trim() || isAdding}
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAdding ? 'Adding...' : 'Add'}
            </button>
          </div>
          
          <p className="text-xs text-gray-500 mt-2">
            Supported: Stocks, ETFs (SPY, QQQ, etc.), Mutual Funds (VFIAX, FXAIX, etc.)
          </p>
        </div>

        {/* Search Section */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Search by Name</h2>
          <p className="text-sm text-gray-600 mb-4">
            Don&apos;t know the ticker? Search by company or fund name.
          </p>
          
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="e.g., Apple, Vanguard Total Stock..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isSearching}
            />
            <button
              onClick={handleSearch}
              disabled={!query.trim() || isSearching}
              className="px-6 py-2 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
              {searchResults.map((result) => (
                <div
                  key={result.symbol}
                  className="p-4 flex items-center justify-between hover:bg-gray-50"
                >
                  <div>
                    <div className="font-semibold text-gray-900">{result.symbol}</div>
                    <div className="text-sm text-gray-500">{result.name}</div>
                    <div className="text-xs text-gray-400">
                      {result.type} {result.exchange && `• ${result.exchange}`}
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddFromSearch(result)}
                    disabled={isAdding}
                    className="px-4 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Popular Assets */}
        <div className="mt-6 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Popular Assets</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'SPY', 'QQQ', 'VTI', 'VOO'].map((symbol) => (
              <button
                key={symbol}
                onClick={() => setQuery(symbol)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300"
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
