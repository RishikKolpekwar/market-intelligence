import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
  }

  const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
  if (!FINNHUB_API_KEY) {
    return NextResponse.json({ error: 'Missing Finnhub API key' }, { status: 500 });
  }

  try {
    const url = `https://finnhub.io/api/v1/calendar/earnings?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: 'Finnhub API error' }, { status: 502 });
    }
    const data = await res.json();
    // Finnhub returns an array of earnings, get the next one
    const earnings = data.earningsCalendar || [];
    const nextEarnings = earnings.find((e: any) => new Date(e.date) >= new Date());
    return NextResponse.json({ earningsDate: nextEarnings ? nextEarnings.date : null });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch earnings date' }, { status: 500 });
  }
}
