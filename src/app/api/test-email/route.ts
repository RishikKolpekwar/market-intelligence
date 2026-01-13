import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBriefingEmail } from '@/lib/email/mailersend';
import { generateBriefingEmailHtml } from '@/lib/email/briefing-template';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Test endpoint to send a sample briefing email
 * Usage: POST /api/test-email with { email: "user@example.com", userId: "uuid" }
 */
export async function POST(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await request.json();
    const { email, userId } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    console.log(`[Test Email] Sending test email to ${email}`);

    // Get today's date in user's timezone (CST for you)
    const userTimezone = 'America/Chicago'; // CST timezone

    // Properly get date in user's timezone
    const todayStr = new Date().toLocaleDateString("en-US", {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    // Convert MM/DD/YYYY to YYYY-MM-DD
    const [month, day, year] = todayStr.split('/');
    const briefingDate = `${year}-${month}-${day}`;
    const today = new Date(`${briefingDate}T12:00:00.000Z`);

    console.log(`[Test Email] Using date: ${briefingDate} (timezone: ${userTimezone})`);

    // Format the date for the subject line
    const formattedDate = today.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    // Get user ID from email if not provided
    let actualUserId = userId;
    if (!actualUserId) {
      // Try to find user by email
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (userData) {
        actualUserId = userData.id;
        console.log(`[Test Email] Found user ID: ${actualUserId} for email: ${email}`);
      }
    }

    let emailHtml: string;

    if (actualUserId) {
      console.log(`[Test Email] Generating fresh briefing for ${briefingDate}...`);

      // Always generate a fresh briefing for today
      const generateUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/briefing/generate`;
      const generateResponse = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.CRON_SECRET || '',
        },
        body: JSON.stringify({
          userId: actualUserId,
          date: briefingDate,
        }),
      });

      if (!generateResponse.ok) {
        console.error('[Test Email] Failed to generate briefing');
        return NextResponse.json({ error: 'Failed to generate briefing' }, { status: 500 });
      }

      // Fetch the newly generated briefing
      const { data: newBriefing } = await supabase
        .from('daily_briefings')
        .select('*')
        .eq('user_id', actualUserId)
        .eq('briefing_date', briefingDate)
        .single();

      if (!newBriefing) {
        console.error('[Test Email] Briefing not found after generation');
        return NextResponse.json({ error: 'Briefing not found after generation' }, { status: 500 });
      }

      console.log(`[Test Email] Generated briefing with ${newBriefing.asset_summaries?.length || 0} assets`);

      const briefingDataParsed = {
        marketOverview: newBriefing.market_overview || 'Market data not available.',
        assetSummaries: newBriefing.asset_summaries || [],
        notableHeadlines: newBriefing.notable_headlines || [],
        totalNewsItems: newBriefing.total_news_items || 0,
        assetsCovered: newBriefing.assets_covered || 0,
      };

      emailHtml = generateBriefingEmailHtml(
        briefingDataParsed,
        formattedDate,
        process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        today
      );
    } else {
      console.log('[Test Email] No userId found, using sample content');
      emailHtml = generateSampleBriefingEmail(formattedDate, today);
    }

    // Send the email
    await sendBriefingEmail({
      to: email,
      toName: 'Test User',
      subject: `Market Intelligence - ${formattedDate}`,
      html: emailHtml,
    });

    console.log(`[Test Email] ✅ Test email sent successfully to ${email}`);

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${email}`,
    });

  } catch (error) {
    console.error('[Test Email] Error sending test email:', error);

    // Log detailed error information
    if (error instanceof Error) {
      console.error('[Test Email] Error message:', error.message);
      console.error('[Test Email] Error stack:', error.stack);
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : String(error)
      },
      { status: 500 }
    );
  }
}

function generateSampleBriefingEmail(formattedDate: string, briefingDate: Date): string {
  const sampleData = {
    marketOverview: 'Markets showed mixed performance today with technology stocks leading gains while energy sectors faced headwinds. The S&P 500 closed up 0.5%, driven by strong earnings reports from major tech companies.',
    assetSummaries: [
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        summary: 'Apple shares gained momentum following the announcement of new AI features in their upcoming iOS release. The company\'s strategic pivot toward artificial intelligence integration across its product ecosystem has been well-received by investors.\n\nAnalysts are watching the upcoming earnings call closely for guidance on iPhone 15 sales and services revenue growth. The stock continues to trade near all-time highs.',
        currentPrice: 185.50,
        priceChangePct24h: 1.2,
        portfolioPercentage: 40,
        week52Low: 125.0,
        week52High: 195.0,
      },
      {
        symbol: 'TSLA',
        name: 'Tesla Inc.',
        summary: 'Tesla shares dipped slightly as investors digested news about increased competition in the EV market. Reports suggest that traditional automakers are ramping up their electric vehicle production capabilities.\n\nThe company\'s Cybertruck production timeline remains a key focus for investors, with deliveries expected to begin in the coming months.',
        currentPrice: 242.80,
        priceChangePct24h: -0.8,
        portfolioPercentage: 30,
        week52Low: 150.0,
        week52High: 290.0,
      },
    ],
    notableHeadlines: [
      {
        title: 'Fed Signals Potential Rate Pause',
        source: 'Reuters',
        why_it_matters: 'Federal Reserve officials indicated they may pause rate hikes if inflation continues to moderate.',
      },
      {
        title: 'Tech Earnings Beat Expectations',
        source: 'Bloomberg',
        why_it_matters: 'Major technology companies reported stronger-than-expected Q3 earnings, driven by cloud computing growth.',
      },
      {
        title: 'Oil Prices Decline on Demand Concerns',
        source: 'Financial Times',
        why_it_matters: 'Crude oil futures fell 2% amid concerns about global economic slowdown affecting energy demand.',
      },
    ],
    totalNewsItems: 42,
    assetsCovered: 2,
  };

  return generateBriefingEmailHtml(
    sampleData,
    formattedDate,
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    briefingDate
  );
}
