import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';
import { render } from '@react-email/components';
import DailyBriefingEmail from '@/emails/daily-briefing';
import { createServerClient } from '@/lib/supabase/client';
import React from 'react';

const mailersend = new MailerSend({
  apiKey: process.env.MAILERSEND_API_KEY || '',
});

const FROM_EMAIL = process.env.MAILERSEND_FROM_EMAIL || 'briefings@yourdomain.com';
const FROM_NAME = process.env.MAILERSEND_FROM_NAME || 'Market Intelligence';

interface SendBriefingEmailParams {
  userId: string;
  userEmail: string;
  userName?: string;
  briefingDate: Date;
  marketOverview: string;
  assetSummaries: {
    symbol: string;
    name?: string;
    summary: string;
    newsCount: number;
    currentPrice?: number;
    priceChange?: number;
    priceChangePercent?: number;
    week52High?: number;
    week52Low?: number;
  }[];
  notableHeadlines: {
    title: string;
    url: string;
    source: string;
    publishedAt?: string;
    snippet?: string;
  }[];
}

/**
 * Send a daily briefing email to a user
 */
export async function sendBriefingEmail(params: SendBriefingEmailParams): Promise<{
  success: boolean;
  mailersendId?: string;
  error?: string;
}> {
  const supabase = createServerClient();
  const dateKey = params.briefingDate.toISOString().split('T')[0];

  // Check for idempotency - have we already sent this email?
  const { data: existingLog } = await (supabase
    .from('email_send_log') as any)
    .select('id, status')
    .eq('user_id', params.userId)
    .eq('briefing_date', dateKey)
    .eq('email_type', 'daily_briefing')
    .single();

  if ((existingLog as any)?.status === 'sent') {
    console.log(`Email already sent for user ${params.userId} on ${dateKey}`);
    return { success: true, mailersendId: existingLog.id };
  }

  // Create or update the send log entry (pending)
  const { data: logEntry, error: logError } = await (supabase
    .from('email_send_log') as any)
    .upsert(
      {
        user_id: params.userId,
        briefing_date: dateKey,
        email_type: 'daily_briefing',
        status: 'pending',
        subject: `Daily Market Briefing - ${dateKey}`,
        news_item_count: params.assetSummaries.reduce((sum, a) => sum + a.newsCount, 0),
      },
      {
        onConflict: 'user_id,briefing_date,email_type',
      }
    )
    .select('id')
    .single();

  if (logError) {
    console.error('Error creating email log:', logError);
    return { success: false, error: logError.message };
  }

  try {
    // Render the email HTML
    const emailElement = React.createElement(DailyBriefingEmail, {
      userName: params.userName,
      briefingDate: params.briefingDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      marketOverview: params.marketOverview,
      assetSummaries: params.assetSummaries,
      notableHeadlines: params.notableHeadlines,
      unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings/unsubscribe?user=${params.userId}`,
    });
    
    const emailHtml = await render(emailElement);

    // Send via MailerSend
    const emailParams = new EmailParams()
      .setFrom(new Sender(FROM_EMAIL, FROM_NAME))
      .setTo([new Recipient(params.userEmail, params.userName)])
      .setSubject(`Daily Market Briefing - ${dateKey}`)
      .setHtml(emailHtml);

    const response = await mailersend.email.send(emailParams);

    // Update log with success
    await (supabase
      .from('email_send_log') as any)
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        mailersend_id: response.headers?.['x-message-id'] || (logEntry as any)?.id,
      })
      .eq('id', (logEntry as any)?.id);

    return {
      success: true,
      mailersendId: response.headers?.['x-message-id'] || logEntry?.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update log with failure
    await (supabase
      .from('email_send_log') as any)
      .update({
        status: 'failed',
        error_message: errorMessage,
        retry_count: (existingLog as any)?.retry_count || 0 + 1,
      })
      .eq('id', (logEntry as any)?.id);

    console.error('Error sending email:', error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send a "no news" briefing when there's nothing to report
 */
export async function sendNoNewsBriefing(
  userId: string,
  userEmail: string,
  userName: string | undefined,
  briefingDate: Date,
  trackedAssetCount: number
): Promise<{ success: boolean; error?: string }> {
  return sendBriefingEmail({
    userId,
    userEmail,
    userName,
    briefingDate,
    marketOverview:
      'Markets were relatively quiet overnight with no significant news affecting your tracked assets.',
    assetSummaries: [],
    notableHeadlines: [],
  });
}

/**
 * Get users who are due for an email at the current hour
 */
export async function getUsersDueForEmail(
  currentHourUTC: number
): Promise<
  {
    id: string;
    email: string;
    full_name: string | null;
    timezone: string;
    preferred_send_hour: number;
  }[]
> {
  const supabase = createServerClient();
  const today = new Date().toISOString().split('T')[0];

  // Get users who:
  // 1. Have email enabled
  // 2. Have daily frequency
  // 3. Prefer this hour for sending
  // 4. Haven't received today's email yet
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, full_name, timezone, preferred_send_hour')
    .eq('email_enabled', true)
    .eq('email_frequency', 'daily')
    .eq('preferred_send_hour', currentHourUTC);

  if (error || !users) {
    console.error('Error fetching users for email:', error);
    return [];
  }

  // Filter out users who already received today's email
  const { data: sentToday } = await supabase
    .from('email_send_log')
    .select('user_id')
    .eq('briefing_date', today)
    .eq('email_type', 'daily_briefing')
    .eq('status', 'sent');

  const sentUserIds = new Set((sentToday || []).map((s: { user_id: string }) => s.user_id));

  return users.filter((u: any) => !sentUserIds.has(u.id));
}
