import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendBriefingEmail } from "@/lib/email/mailersend";
import { generateBriefingEmailHtml } from "@/lib/email/briefing-template";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getBriefingDateYYYYMMDD(timeZone: string): { dateStr: string; dateObj: Date } {
  // Get calendar day in the user's timezone, then anchor at noon UTC to avoid off-by-one issues
  const mmddyyyy = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [month, day, year] = mmddyyyy.split("/");
  const dateObj = new Date(`${year}-${month}-${day}T12:00:00.000Z`);
  const dateStr = dateObj.toISOString().split("T")[0];
  return { dateStr, dateObj };
}

/**
 * Daily Briefing Email Cron Job
 * Runs via Vercel Cron
 */
export async function GET(request: NextRequest) {
  // Allow Vercel Cron OR manual Bearer testing
  const vercelCron = request.headers.get("x-vercel-cron") === "1";
  const authHeader = request.headers.get("authorization");

  if (!vercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ✅ Admin client for cron (service role)
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  try {
    console.log("[Cron] Starting daily briefing email job...");
    console.log("[Cron] supabase.from type:", typeof (supabase as any).from); // should be "function"

    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, email, full_name, timezone");

    if (usersError) {
      console.error("[Cron] Error fetching users:", usersError);
      return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }

    if (!users || users.length === 0) {
      console.log("[Cron] No users found");
      return NextResponse.json({ success: true, sent: 0, message: "No users to email" });
    }

    console.log(`[Cron] Found ${users.length} users to send emails to`);

    let successCount = 0;
    let failureCount = 0;

    for (const user of users) {
      try {
        console.log(`[Cron] Processing user: ${user.email}`);

        const userTimezone = user.timezone || "America/New_York";
        const { dateStr: briefingDate, dateObj: briefingDateObj } =
          getBriefingDateYYYYMMDD(userTimezone);

        console.log(`[Cron] Generating briefing for ${user.email} (date: ${briefingDate})`);

        const generateUrl = `${
          process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
        }/api/briefing/generate`;

        // IMPORTANT: your /api/briefing/generate should accept either:
        // - x-cron-secret OR authorization bearer. Here we send authorization bearer.
        const generateResponse = await fetch(generateUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            authorization: `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify({
            userId: user.id,
            date: briefingDate,
          }),
        });

        if (!generateResponse.ok) {
          const txt = await generateResponse.text().catch(() => "");
          console.error(`[Cron] Failed to generate briefing for ${user.email}`, txt);
          failureCount++;
          continue;
        }

        // Fetch the generated briefing with all data
        const { data: briefingData, error: briefingErr } = await supabase
          .from("daily_briefings")
          .select("*")
          .eq("user_id", user.id)
          .eq("briefing_date", briefingDate)
          .single();

        if (briefingErr) {
          console.error(`[Cron] Error fetching briefing for ${user.email}:`, briefingErr);
          failureCount++;
          continue;
        }

        if (!briefingData) {
          console.error(`[Cron] Briefing not found after generation for ${user.email}`);
          failureCount++;
          continue;
        }

        const formattedDate = new Intl.DateTimeFormat("en-US", {
          timeZone: userTimezone,
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(briefingDateObj);

        const briefingDataParsed = {
          marketOverview: briefingData.market_overview || "Market data not available.",
          assetSummaries: briefingData.asset_summaries || [],
          notableHeadlines: briefingData.notable_headlines || [],
          totalNewsItems: briefingData.total_news_items || 0,
          assetsCovered: briefingData.assets_covered || 0,
        };

        const emailHtml = generateBriefingEmailHtml(
          briefingDataParsed,
          formattedDate,
          process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
          briefingDateObj
        );

        await sendBriefingEmail({
          to: user.email,
          toName: user.full_name || "Investor",
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

    console.log(
      `[Cron] Daily briefing email job complete. Success: ${successCount}, Failed: ${failureCount}`
    );

    return NextResponse.json({
      success: true,
      sent: successCount,
      failed: failureCount,
      total: users.length,
    });
  } catch (error) {
    console.error("[Cron] Fatal error in daily briefing email job:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
