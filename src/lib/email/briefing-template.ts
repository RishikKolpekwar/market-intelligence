interface BriefingEmailData {
  marketOverview: string;
  assetSummaries: Array<{
    symbol: string;
    name: string;
    summary: string;
    currentPrice?: number;
    priceChangePct24h?: number;
    priceChangePercent?: number;
    portfolioPercentage?: number;
    evEbitda?: number | null;
    nextEarningsDate?: string | null;
    priceChangePctWeek?: number;
    priceChangePctMonth?: number;
    priceChangePctYear?: number;
    week52Low?: number;
    week52High?: number;
  }>;
  notableHeadlines: Array<{
    title: string;
    source: string;
    why_it_matters?: string;
    publishedAt?: string;
  }>;
  totalNewsItems: number;
  assetsCovered: number;
}

export function generateBriefingEmailHtml(
  data: BriefingEmailData,
  formattedDate: string,
  siteUrl: string,
  briefingDate?: Date
): string {
  // Generate URL date format in YYYY-MM-DD format to match database and route
  const today = briefingDate || new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const urlDate = `${year}-${month}-${day}`;

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 8px;">
          <!-- Header -->
          <tr>
            <td style="padding: 40px; text-align: center;">
              <h1 style="margin: 0 0 16px 0; font-size: 28px; font-weight: 700; color: #111827;">Market Intelligence</h1>
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #6b7280;">Your attached report is below.</p>
              <a href="${siteUrl}/dashboard/briefings/${urlDate}" style="display: inline-block; padding: 14px 28px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">View Market Briefing</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px;">
              <p style="margin: 0;">
                ${formattedDate} • ${data.totalNewsItems} news items • ${data.assetsCovered} assets covered
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
