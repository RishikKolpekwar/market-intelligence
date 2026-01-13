import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBriefingEmail } from '@/lib/email/mailersend';
import { generateBriefingEmailHtml } from '@/lib/email/briefing-template';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Daily Briefing Email Cron Job
 * Runs at 5:00 PM EST every day (one hour after market close)
 * Generates briefings for all users and sends them via email
 */
export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Cron] Starting daily briefing email job...');

    // Get all active users (send emails to everyone)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, full_name, timezone');

    if (usersError) {
      console.error('[Cron] Error fetching users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    if (!users || users.length === 0) {
      console.log('[Cron] No users found');
      return NextResponse.json({ success: true, sent: 0, message: 'No users to email' });
    }

    console.log(`[Cron] Found ${users.length} users to send emails to`);

    let successCount = 0;
    let failureCount = 0;

    for (const user of users) {
      try {
        console.log(`[Cron] Processing user: ${user.email}`);

        // Get today's date in user's timezone (default to America/New_York for consistency)
        const userTimezone = user.timezone || 'America/New_York';
        const todayStr = new Date().toLocaleDateString("en-US", {
          timeZone: userTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        // Convert MM/DD/YYYY to YYYY-MM-DD
        const [month, day, year] = todayStr.split('/');
        const today = new Date(`${year}-${month}-${day}T12:00:00.000Z`);
        const briefingDate = today.toISOString().split('T')[0];

        console.log(`[Cron] Generating briefing for ${user.email} (date: ${briefingDate})`);

        // Always generate/regenerate the briefing
        const generateUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/briefing/generate`;
        const generateResponse = await fetch(generateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': process.env.CRON_SECRET || '',
          },
          body: JSON.stringify({
            userId: user.id,
            date: briefingDate,
          }),
        });

        if (!generateResponse.ok) {
          console.error(`[Cron] Failed to generate briefing for ${user.email}`);
          failureCount++;
          continue;
        }

        const generateResult = await generateResponse.json();

        // Fetch the generated briefing with all data
        const { data: briefingData } = await supabase
          .from('daily_briefings')
          .select('*')
          .eq('user_id', user.id)
          .eq('briefing_date', briefingDate)
          .single();

        if (!briefingData) {
          console.error(`[Cron] Briefing not found after generation for ${user.email}`);
          failureCount++;
          continue;
        }

        // Format the date for the subject line
        const formattedDate = today.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });

        // Parse the briefing data
        const briefingDataParsed = {
          marketOverview: briefingData.market_overview || 'Market data not available.',
          assetSummaries: briefingData.asset_summaries || [],
          notableHeadlines: briefingData.notable_headlines || [],
          totalNewsItems: briefingData.total_news_items || 0,
          assetsCovered: briefingData.assets_covered || 0,
        };

        // Generate the email HTML
        const emailHtml = generateBriefingEmailHtml(
          briefingDataParsed,
          formattedDate,
          process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
          today
        );

        // Send the email
        await sendBriefingEmail({
          to: user.email,
          toName: user.full_name || 'Investor',
          subject: `Market Intelligence - ${formattedDate}`,
          html: emailHtml,
        });

        console.log(`[Cron] ✅ Email sent successfully to ${user.email}`);
        successCount++;

      } catch (userError) {
        console.error(`[Cron] Error processing user ${user.email}:`, userError);
        failureCount++;
      }
    }

    console.log(`[Cron] Daily briefing email job complete. Success: ${successCount}, Failed: ${failureCount}`);

    return NextResponse.json({
      success: true,
      sent: successCount,
      failed: failureCount,
      total: users.length,
    });

  } catch (error) {
    console.error('[Cron] Fatal error in daily briefing email job:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
