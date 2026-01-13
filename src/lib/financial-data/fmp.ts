/**
 * Financial Modeling Prep (FMP) API Client
 * https://site.financialmodelingprep.com/developer/docs
 * For fundamentals, ratios, and earnings calendar
 */

const FMP_API_KEY = process.env.FMP_API_KEY || 'bdfWOSfvkNaOghbSPhbduP36mC5YCbtL';
// Updated to new stable endpoints (as of 2025)
const BASE_URL = 'https://financialmodelingprep.com/stable';

interface KeyMetrics {
  symbol: string;
  date: string;
  period: string;
  calendarYear: string;
  revenuePerShare: number;
  netIncomePerShare: number;
  operatingCashFlowPerShare: number;
  freeCashFlowPerShare: number;
  cashPerShare: number;
  bookValuePerShare: number;
  tangibleBookValuePerShare: number;
  shareholdersEquityPerShare: number;
  interestDebtPerShare: number;
  marketCap: number;
  enterpriseValue: number;
  peRatio: number;
  priceToSalesRatio: number;
  pocfratio: number;
  pfcfRatio: number;
  pbRatio: number;
  ptbRatio: number;
  evToSales: number;
  enterpriseValueOverEBITDA: number; // This is EV/EBITDA
  evToOperatingCashFlow: number;
  evToFreeCashFlow: number;
  earningsYield: number;
  freeCashFlowYield: number;
  debtToEquity: number;
  debtToAssets: number;
  netDebtToEBITDA: number;
  currentRatio: number;
  interestCoverage: number;
  incomeQuality: number;
  dividendYield: number;
  payoutRatio: number;
  salesGeneralAndAdministrativeToRevenue: number;
  researchAndDevelopementToRevenue: number;
  intangiblesToTotalAssets: number;
  capexToOperatingCashFlow: number;
  capexToRevenue: number;
  capexToDepreciation: number;
  stockBasedCompensationToRevenue: number;
  grahamNumber: number;
  roic: number;
  returnOnTangibleAssets: number;
  grahamNetNet: number;
  workingCapital: number;
  tangibleAssetValue: number;
  netCurrentAssetValue: number;
  investedCapital: number;
  averageReceivables: number;
  averagePayables: number;
  averageInventory: number;
  daysSalesOutstanding: number;
  daysPayablesOutstanding: number;
  daysOfInventoryOnHand: number;
  receivablesTurnover: number;
  payablesTurnover: number;
  inventoryTurnover: number;
  roe: number;
  capexPerShare: number;
}

// Alternative: Company Profile includes basic metrics on free tier
interface CompanyProfile {
  symbol: string;
  companyName: string;
  price: number;
  mktCap: number;
  beta: number;
  volAvg: number;
  lastDiv: number;
  range: string;
  changes: number;
  dcfDiff: number;
  dcf: number;
  industry: string;
  sector: string;
  country: string;
  fullTimeEmployees: string;
  ceo: string;
  website: string;
  description: string;
  ipoDate: string;
  isEtf: boolean;
  isActivelyTrading: boolean;
}

// Ratios TTM (trailing twelve months) - often available on free tier
interface RatiosTTM {
  dividendYieldTTM: number;
  peRatioTTM: number;
  pegRatioTTM: number;
  payoutRatioTTM: number;
  currentRatioTTM: number;
  quickRatioTTM: number;
  cashRatioTTM: number;
  daysOfSalesOutstandingTTM: number;
  daysOfInventoryOutstandingTTM: number;
  operatingCycleTTM: number;
  daysOfPayablesOutstandingTTM: number;
  cashConversionCycleTTM: number;
  grossProfitMarginTTM: number;
  operatingProfitMarginTTM: number;
  pretaxProfitMarginTTM: number;
  netProfitMarginTTM: number;
  effectiveTaxRateTTM: number;
  returnOnAssetsTTM: number;
  returnOnEquityTTM: number;
  returnOnCapitalEmployedTTM: number;
  netIncomePerEBTTTM: number;
  ebtPerEbitTTM: number;
  ebitPerRevenueTTM: number;
  debtRatioTTM: number;
  debtEquityRatioTTM: number;
  longTermDebtToCapitalizationTTM: number;
  totalDebtToCapitalizationTTM: number;
  interestCoverageTTM: number;
  cashFlowToDebtRatioTTM: number;
  companyEquityMultiplierTTM: number;
  receivablesTurnoverTTM: number;
  payablesTurnoverTTM: number;
  inventoryTurnoverTTM: number;
  fixedAssetTurnoverTTM: number;
  assetTurnoverTTM: number;
  operatingCashFlowPerShareTTM: number;
  freeCashFlowPerShareTTM: number;
  cashPerShareTTM: number;
  operatingCashFlowSalesRatioTTM: number;
  freeCashFlowOperatingCashFlowRatioTTM: number;
  cashFlowCoverageRatiosTTM: number;
  shortTermCoverageRatiosTTM: number;
  capitalExpenditureCoverageRatioTTM: number;
  dividendPaidAndCapexCoverageRatioTTM: number;
  priceBookValueRatioTTM: number;
  priceToBookRatioTTM: number;
  priceToSalesRatioTTM: number;
  priceEarningsRatioTTM: number;
  priceToFreeCashFlowsRatioTTM: number;
  priceToOperatingCashFlowsRatioTTM: number;
  priceCashFlowRatioTTM: number;
  priceEarningsToGrowthRatioTTM: number;
  priceSalesRatioTTM: number;
  enterpriseValueMultipleTTM: number; // This is EV/EBITDA
  priceFairValueTTM: number;
  dividendPerShareTTM: number;
}

interface EarningsCalendar {
  symbol: string;
  date: string; // Earnings date (YYYY-MM-DD)
  eps: number | null;
  epsEstimated: number | null;
  time: string; // "bmo" (before market open), "amc" (after market close), "tbd"
  revenue: number | null;
  revenueEstimated: number | null;
  fiscalDateEnding: string;
  updatedFromDate: string;
}

type EarningsReportItem = {
  symbol: string;
  date: string;        // YYYY-MM-DD
  time?: string;       // bmo/amc/tbd (if present)
};

/**
 * Get key metrics including EV/EBITDA
 * @param symbol Stock ticker
 * @param period "annual" or "quarter"
 * @param limit Number of periods to return
 */
export async function getKeyMetrics(
  symbol: string,
  period: 'annual' | 'quarter' = 'annual',
  limit: number = 1
): Promise<KeyMetrics[]> {
  // Try new stable endpoint first
  const url = `${BASE_URL}/key-metrics?symbol=${symbol}&period=${period}&limit=${limit}&apikey=${FMP_API_KEY}`;
  console.log(`[FMP] Fetching key metrics: ${url.replace(FMP_API_KEY, 'REDACTED')}`);

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.text();
    console.error(`[FMP] Key metrics error: ${response.status}`, error);
    throw new Error(`FMP API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  console.log(`[FMP] Key metrics response:`, JSON.stringify(data).substring(0, 200));

  if (data.error || data['Error Message']) {
    throw new Error(`FMP error: ${data.error || data['Error Message']}`);
  }

  return Array.isArray(data) ? data : [data];
}

/**
 * Get Ratios TTM (Trailing Twelve Months) - often available on free tier
 * This is an alternative to key-metrics for getting EV/EBITDA
 */
export async function getRatiosTTM(symbol: string): Promise<RatiosTTM | null> {
  const url = `${BASE_URL}/ratios-ttm?symbol=${symbol}&apikey=${FMP_API_KEY}`;
  console.log(`[FMP] Fetching ratios TTM: ${url.replace(FMP_API_KEY, 'REDACTED')}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.text();
      console.error(`[FMP] Ratios TTM error: ${response.status}`, error);
      return null;
    }

    const data = await response.json();
    console.log(`[FMP] Ratios TTM response:`, JSON.stringify(data).substring(0, 200));

    if (data.error || data['Error Message']) {
      console.error(`[FMP] Ratios TTM error:`, data.error || data['Error Message']);
      return null;
    }

    // Data might be an array or object
    const ratios = Array.isArray(data) ? data[0] : data;
    return ratios || null;
  } catch (error) {
    console.error(`[FMP] Ratios TTM fetch error:`, error);
    return null;
  }
}

/**
 * Get Company Profile - basic info available on free tier
 */
export async function getCompanyProfile(symbol: string): Promise<CompanyProfile | null> {
  const url = `${BASE_URL}/profile?symbol=${symbol}&apikey=${FMP_API_KEY}`;
  console.log(`[FMP] Fetching profile: ${url.replace(FMP_API_KEY, 'REDACTED')}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.text();
      console.error(`[FMP] Profile error: ${response.status}`, error);
      return null;
    }

    const data = await response.json();
    console.log(`[FMP] Profile response:`, JSON.stringify(data).substring(0, 200));

    if (data.error || data['Error Message']) {
      console.error(`[FMP] Profile error:`, data.error || data['Error Message']);
      return null;
    }

    // Data is usually an array with one item
    const profile = Array.isArray(data) ? data[0] : data;
    return profile || null;
  } catch (error) {
    console.error(`[FMP] Profile fetch error:`, error);
    return null;
  }
}

/**
 * Get earnings report for a symbol (symbol-specific endpoint)
 * This is more reliable than earnings-calendar for getting a specific company's earnings
 */
export async function getEarningsReport(symbol: string): Promise<EarningsReportItem[] | null> {
  const url = `${BASE_URL}/earnings?symbol=${symbol}&apikey=${FMP_API_KEY}`;
  console.log(`[FMP] Fetching earnings report: ${url.replace(FMP_API_KEY, "REDACTED")}`);

  const res = await fetch(url);
  const text = await res.text();

  let data: any = null;
  try { data = JSON.parse(text); } catch {}

  if (!res.ok) {
    console.error(`[FMP] Earnings report error: ${res.status}`, data ?? text);
    return null;
  }

  // FMP sometimes returns array or object; normalize
  const arr = Array.isArray(data) ? data : (data ? [data] : []);
  return arr as EarningsReportItem[];
}

/**
 * Get earnings calendar for a symbol
 * @param symbol Stock ticker
 */
export async function getEarningsCalendar(symbol: string): Promise<EarningsCalendar[]> {
  // Use date range to get more accurate results
  const from = new Date().toISOString().slice(0, 10);
  const toDate = new Date();
  toDate.setFullYear(toDate.getFullYear() + 1);
  const to = toDate.toISOString().slice(0, 10);

  const url = `${BASE_URL}/earnings-calendar?from=${from}&to=${to}&symbol=${symbol}&apikey=${FMP_API_KEY}`;
  console.log(`[FMP] Fetching earnings calendar: ${url.replace(FMP_API_KEY, "REDACTED")}`);

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.text();
    console.error(`[FMP] Earnings calendar error: ${response.status}`, error);
    throw new Error(`FMP API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  console.log(`[FMP] Earnings calendar response:`, JSON.stringify(data).substring(0, 200));

  if (data.error || data['Error Message']) {
    throw new Error(`FMP error: ${data.error || data['Error Message']}`);
  }

  return Array.isArray(data) ? data : [data];
}

/**
 * Get next earnings date for a symbol
 */
export async function getNextEarningsDate(symbol: string): Promise<string | null> {
  try {
    // 1) Preferred: symbol-specific earnings endpoint
    const report = await getEarningsReport(symbol);
    if (report && report.length > 0) {
      const now = new Date();

      const upcoming = report
        .filter(r => (r.symbol || "").toUpperCase() === symbol.toUpperCase())
        .map(r => ({ ...r, dateObj: new Date(r.date) }))
        .filter(r => !isNaN(r.dateObj.getTime()) && r.dateObj >= now)
        .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

      if (upcoming.length > 0) {
        console.log(`[FMP] Found next earnings for ${symbol} from earnings report: ${upcoming[0].date}`);
        return upcoming[0].date;
      }
    }

    // 2) Fallback: calendar with date range
    console.log(`[FMP] No upcoming earnings in report, trying calendar for ${symbol}...`);
    const calendar = await getEarningsCalendar(symbol);
    if (!calendar || calendar.length === 0) return null;

    const filtered = calendar.filter(e => e.symbol?.toUpperCase() === symbol.toUpperCase());
    if (filtered.length === 0) {
      console.warn(`[FMP] No earnings entries found for ${symbol} in calendar`);
      return null;
    }

    const now = new Date();
    const next = filtered
      .map(e => ({ ...e, dateObj: new Date(e.date) }))
      .filter(e => e.dateObj >= now)
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())[0];

    if (next) {
      console.log(`[FMP] Found next earnings for ${symbol} from calendar: ${next.date}`);
    }

    return next?.date || null;
  } catch (err) {
    console.error(`[FMP] getNextEarningsDate failed for ${symbol}:`, err);
    return null;
  }
}

/**
 * Get EV/EBITDA ratio for a symbol
 * Tries multiple endpoints in order of availability (free vs paid tiers)
 */
export async function getEvEbitda(symbol: string): Promise<number | null> {
  console.log(`[FMP] Getting EV/EBITDA for ${symbol}...`);
  
  // Strategy 1: Try ratios-ttm (often available on free tier)
  try {
    const ratios = await getRatiosTTM(symbol);
    if (ratios?.enterpriseValueMultipleTTM) {
      console.log(`[FMP] Got EV/EBITDA from ratios-ttm: ${ratios.enterpriseValueMultipleTTM}`);
      return ratios.enterpriseValueMultipleTTM;
    }
  } catch (error) {
    console.log(`[FMP] Ratios TTM failed, trying key-metrics...`);
  }

  // Strategy 2: Try key-metrics (might require paid tier)
  try {
    const metrics = await getKeyMetrics(symbol, 'quarter', 1);
    if (metrics?.[0]?.enterpriseValueOverEBITDA) {
      console.log(`[FMP] Got EV/EBITDA from key-metrics: ${metrics[0].enterpriseValueOverEBITDA}`);
      return metrics[0].enterpriseValueOverEBITDA;
    }
  } catch (error) {
    console.error(`[FMP] Key metrics also failed for ${symbol}:`, error);
  }

  console.log(`[FMP] Could not get EV/EBITDA for ${symbol} from any source`);
  return null;
}
