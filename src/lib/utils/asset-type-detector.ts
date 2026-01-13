/**
 * Detect if a symbol is a mutual fund based on common patterns
 */
export function isMutualFund(symbol: string, assetType?: string): boolean {
  // Check explicit asset type first
  if (assetType === 'Mutual Fund' || assetType === 'mutual_fund') {
    return true;
  }

  // Common mutual fund patterns:
  // - 5-letter tickers (FCNTX, VFIAX, VTSAX)
  // - Ends with X (very common for mutual funds)
  const is5Letter = symbol.length === 5;
  const endsWithX = symbol.toUpperCase().endsWith('X');

  return is5Letter && endsWithX;
}

/**
 * Generate relevant keywords for better news matching
 * Mutual funds need special keywords because news rarely mentions ticker symbols
 */
export function generateAssetKeywords(
  symbol: string,
  name: string,
  assetType?: string
): string[] {
  const keywords: string[] = [symbol];
  const isFund = isMutualFund(symbol, assetType);

  if (isFund) {
    // For mutual funds, extract and add meaningful keywords
    
    // Add full name
    keywords.push(name);
    
    // Extract fund family (e.g., "Fidelity" from "Fidelity Contrafund")
    const fundFamilyMatch = name.match(/^(Fidelity|Vanguard|T\. Rowe Price|American Funds|PIMCO|BlackRock|JPMorgan|Schwab|Franklin Templeton)/i);
    if (fundFamilyMatch) {
      keywords.push(fundFamilyMatch[1]);
      // Also add possessive form (e.g., "Fidelity's")
      keywords.push(`${fundFamilyMatch[1]}'s`);
    }
    
    // Extract fund type/strategy from name
    const strategyWords = ['Contrafund', 'Growth', 'Value', 'Index', 'Equity', 'Income', 'Bond', 'International', 'Global', 'Balanced', 'Target', 'Select'];
    for (const strategy of strategyWords) {
      if (name.toLowerCase().includes(strategy.toLowerCase())) {
        keywords.push(strategy);
      }
    }
    
    // Add common fund-related terms for better matching
    keywords.push('fund', 'mutual fund');
    
  } else {
    // For stocks, simpler keywords
    keywords.push(name);
    
    // Remove common suffixes for better matching
    const cleanName = name.replace(/\s+(Inc\.|Corp\.|Corporation|Ltd\.|LLC|Co\.)$/i, '').trim();
    if (cleanName !== name) {
      keywords.push(cleanName);
    }
  }

  // Remove duplicates and empty strings
  return [...new Set(keywords.filter(k => k && k.trim().length > 0))];
}

/**
 * Get display-appropriate metric labels for an asset
 */
export function getAssetMetrics(symbol: string, assetType?: string) {
  const isFund = isMutualFund(symbol, assetType);

  if (isFund) {
    return {
      type: 'Mutual Fund',
      showEarnings: false,
      showEvEbitda: false,
      showExpenseRatio: true,
      showAUM: true,
      priceLabel: 'NAV', // Net Asset Value instead of "Price"
      recommendedApis: ['twelveData'], // Mutual funds work best with Twelve Data
    };
  }

  return {
    type: 'Stock',
    showEarnings: true,
    showEvEbitda: true,
    showExpenseRatio: false,
    showAUM: false,
    priceLabel: 'Price',
    recommendedApis: ['finnhub', 'twelveData', 'fmp'],
  };
}
