import { NextRequest, NextResponse } from 'next/server';
import { getRelevantNewsForUser } from '@/lib/relevance/filter';
import { generateDailyBriefing, generateEmptyBriefing } from '@/lib/llm/briefing-generator';
import { sendBriefingEmail, getUsersDueForEmail } from '@/lib/email/sender';
import { createServerClient } from '@/lib/supabase/client';
import { BriefingInput, AssetWithNews } from '@/types/ingestion';

/**
 * Cron job for sending daily briefings
 * Schedule: Run every hour to catch users in different timezones
 * Vercel cron: 0 * * * *
 */

export const maxDuration = 300; // 5 minutes max runtime for email processing

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const startTime = Date.now();
  const currentHourUTC = new Date().getUTCHours();
  const today = new Date();

  const results = {
    usersProcessed: 0,
    emailsSent: 0,
    emailsSkipped: 0,
    emailsFailed: 0,
    errors: [] as string[],
  };

  try {
    // Get users who should receive an email this hour
    const users = await getUsersDueForEmail(currentHourUTC);
    console.log(`Found ${users.length} users due for email at hour ${currentHourUTC}`);

    for (const user of users) {
      try {
        results.usersProcessed++;

        // Get relevant news for this user's tracked assets
        const relevantNews = await getRelevantNewsForUser(user.id, 24, 20);

        // Build briefing input
        const assets: AssetWithNews[] = relevantNews.map((item) => ({
          assetId: item.assetId,
          symbol: item.assetSymbol,
          name: item.assetName,
          assetType: 'stock', // TODO: Get actual type from DB
          importanceLevel: 'normal',
          newsItems: item.news.map((n) => ({
            id: n.id,
            title: n.title,
            summary: n.summary || undefined,
            url: n.url,
            sourceName: n.sourceName,
            publishedAt: new Date(n.publishedAt),
            relevanceScore: n.relevanceScore,
            matchType: n.matchType as 'symbol_mention' | 'keyword_match' | 'llm_inferred' | 'manual',
            matchedTerms: [],
          })),
        }));

        const briefingInput: BriefingInput = {
          userId: user.id,
          userEmail: user.email,
          userName: user.full_name || undefined,
          briefingDate: today,
          timezone: user.timezone,
          assets,
        };

        let briefing;
        const totalNewsCount = assets.reduce((sum, a) => sum + a.newsItems.length, 0);

        if (totalNewsCount === 0) {
          // No news - send a minimal briefing or skip
          console.log(`No news for user ${user.id}, sending minimal briefing`);
          briefing = generateEmptyBriefing(briefingInput);
        } else {
          // Generate LLM briefing
          console.log(`Generating briefing for user ${user.id} with ${totalNewsCount} news items`);
          briefing = await generateDailyBriefing(briefingInput);
        }

        // Save the briefing to database
        await (supabase.from('daily_briefings') as any).upsert(
          {
            user_id: user.id,
            briefing_date: today.toISOString().split('T')[0],
            market_overview: briefing.marketOverview,
            asset_summaries: briefing.assetSummaries,
            notable_headlines: briefing.notableHeadlines,
            full_briefing_html: briefing.fullBriefingHtml,
            full_briefing_text: briefing.fullBriefingText,
            total_news_items: totalNewsCount,
            assets_covered: assets.length,
            llm_model: 'llmModel' in briefing ? briefing.llmModel : undefined,
            llm_tokens_used: 'tokensUsed' in briefing ? briefing.tokensUsed : undefined,
            generation_time_ms: 'generationTimeMs' in briefing ? briefing.generationTimeMs : undefined,
          },
          {
            onConflict: 'user_id,briefing_date',
          }
        );

        // Send the email
        const emailResult = await sendBriefingEmail({
          userId: user.id,
          userEmail: user.email,
          userName: user.full_name || undefined,
          briefingDate: today,
          marketOverview: briefing.marketOverview,
          assetSummaries: briefing.assetSummaries.map((a) => ({
            symbol: a.symbol,
            summary: a.summary,
            newsCount: a.newsCount,
          })),
          notableHeadlines: briefing.notableHeadlines.map((h) => ({
            title: h.title,
            url: h.url,
            source: h.source,
          })),
        });

        if (emailResult.success) {
          results.emailsSent++;
          console.log(`Email sent to ${user.email}`);
        } else {
          results.emailsFailed++;
          results.errors.push(`Failed to send to ${user.email}: ${emailResult.error}`);
        }
      } catch (error) {
        results.emailsFailed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Error processing user ${user.id}: ${errorMsg}`);
        console.error(`Error processing user ${user.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      duration_ms: Date.now() - startTime,
      hour: currentHourUTC,
      ...results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime,
        ...results,
      },
      { status: 500 }
    );
  }
}
