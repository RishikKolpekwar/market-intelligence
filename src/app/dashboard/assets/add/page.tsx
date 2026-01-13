'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange?: string;
}

function AddAssetPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const portfolioId = searchParams.get('portfolio');
  
  const [query, setQuery] = useState('');
  const [allocation, setAllocation] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedSymbol, setAddedSymbol] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [portfolioName, setPortfolioName] = useState<string | null>(null);
  const [selectedFromSearch, setSelectedFromSearch] = useState<SearchResult | null>(null);

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
            .then(({ data }: { data: { name: string } | null }) => {
              if (data) setPortfolioName(data.name);
            });
        }
      } else {
        setError('Please log in to add assets');
      }
      setIsLoading(false);
    });
  }, [portfolioId]);

  // Validate allocation
  const validateAllocation = (): boolean => {
    const allocationNum = parseFloat(allocation);
    if (isNaN(allocationNum) || allocationNum < 0 || allocationNum > 100) {
      setError('Allocation must be between 0 and 100');
      return false;
    }
    return true;
  };

  // Add asset with allocation
  const handleAdd = async (symbol: string) => {
    if (!validateAllocation()) return;
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
          symbol: symbol.toUpperCase(),
          importance_level: 'normal',
          portfolio_id: portfolioId || undefined,
          portfolio_percentage: parseFloat(allocation),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add asset');
      }

      setAddedSymbol(symbol.toUpperCase());
      setQuery('');
      setAllocation('');
      setSelectedFromSearch(null);
      
      // Redirect after a short delay
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

  // Direct ticker add
  const handleDirectAdd = async () => {
    if (!query.trim()) {
      setError('Please enter a ticker symbol');
      return;
    }
    await handleAdd(query.trim());
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

  // Select from search results
  const handleSelectFromSearch = (result: SearchResult) => {
    setSelectedFromSearch(result);
    setQuery(result.symbol);
    setSearchResults([]);
  };

  // Add from selected search result
  const handleAddFromSearch = async () => {
    if (!selectedFromSearch) return;
    await handleAdd(selectedFromSearch.symbol);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  const canAdd = query.trim() && allocation && parseFloat(allocation) >= 0 && parseFloat(allocation) <= 100;

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
              <span className="font-medium">{addedSymbol} added with {allocation}% allocation!</span>
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

        {/* Add Asset Form */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add New Asset</h2>
          
          {/* Ticker Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ticker Symbol <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value.toUpperCase());
                  setSelectedFromSearch(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g., AAPL, MSFT, SPY"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
                disabled={isAdding}
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={!query.trim() || isSearching}
                className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSearching ? '...' : 'Search'}
              </button>
            </div>
            {selectedFromSearch && (
              <p className="text-sm text-gray-500 mt-1">
                Selected: {selectedFromSearch.name}
              </p>
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mb-4 border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-48 overflow-y-auto">
              {searchResults.map((result) => (
                <button
                  key={result.symbol}
                  onClick={() => handleSelectFromSearch(result)}
                  className="w-full p-3 flex items-center justify-between hover:bg-gray-50 text-left"
                >
                  <div>
                    <div className="font-semibold text-gray-900">{result.symbol}</div>
                    <div className="text-sm text-gray-500">{result.name}</div>
                  </div>
                  <span className="text-xs text-gray-400">{result.type}</span>
                </button>
              ))}
            </div>
          )}

          {/* Allocation Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Portfolio Allocation % <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={allocation}
                onChange={(e) => setAllocation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canAdd && handleDirectAdd()}
                placeholder="15.00"
                min="0"
                max="100"
                step="0.01"
                className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={isAdding}
              />
              <span className="text-gray-600 font-medium">%</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Enter the target percentage of your portfolio for this asset (0-100).
              Total allocation can exceed 100% across all assets.
            </p>
          </div>

          {/* Add Button */}
          <button
            onClick={selectedFromSearch ? handleAddFromSearch : handleDirectAdd}
            disabled={!canAdd || isAdding}
            className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAdding ? 'Adding...' : `Add ${query || 'Asset'} to Portfolio`}
          </button>
        </div>

        {/* Popular Assets */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Popular Assets</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'SPY', 'QQQ', 'VTI', 'NVDA'].map((symbol) => (
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

export default function AddAssetPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="text-lg">Loading...</div></div>}>
      <AddAssetPageContent />
    </Suspense>
  );
}
