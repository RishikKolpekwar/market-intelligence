import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface DailyBriefingEmailProps {
  userName?: string;
  briefingDate: string;
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
  unsubscribeUrl?: string;
}

export const DailyBriefingEmail: React.FC<DailyBriefingEmailProps> = ({
  userName = 'Investor',
  briefingDate,
  marketOverview,
  assetSummaries,
  notableHeadlines,
  unsubscribeUrl,
}) => {
  const previewText = `Your Daily Market Briefing - ${briefingDate}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>📈 Market Intelligence</Heading>
            <Text style={dateText}>{briefingDate}</Text>
          </Section>

          <Hr style={hr} />

          {/* Greeting */}
          <Section style={section}>
            <Text style={greeting}>Good morning, {userName}</Text>
            <Text style={intro}>
              Here&apos;s what happened overnight that matters to your portfolio.
            </Text>
          </Section>

          {/* Market Overview */}
          <Section style={section}>
            <Heading as="h2" style={sectionHeading}>
              🌍 Market Overview
            </Heading>
            <Text style={paragraph}>{marketOverview}</Text>
          </Section>

          <Hr style={hr} />

          {/* Portfolio Updates */}
          {assetSummaries.length > 0 && (
            <Section style={section}>
              <Heading as="h2" style={sectionHeading}>
                📊 Your Portfolio
              </Heading>
              {assetSummaries.map((asset, index) => (
                <Section key={index} style={assetCard}>
                  <Text style={assetHeader}>
                    <span style={assetSymbol}>{asset.symbol}</span>
                    {asset.name && (
                      <span style={assetName}> - {asset.name}</span>
                    )}
                  </Text>
                  
                  {/* Price Data Row */}
                  {asset.currentPrice !== undefined && (
                    <Text style={priceRow}>
                      <span style={currentPrice}>${asset.currentPrice.toFixed(2)}</span>
                      {asset.priceChangePercent !== undefined && (
                        <span
                          style={
                            asset.priceChangePercent >= 0 ? priceChangePositive : priceChangeNegative
                          }
                        >
                          {' '}
                          {asset.priceChangePercent >= 0 ? '▲' : '▼'}{' '}
                          {Math.abs(asset.priceChangePercent).toFixed(2)}%
                          {asset.priceChange !== undefined && (
                            <span> (${Math.abs(asset.priceChange).toFixed(2)})</span>
                          )}
                        </span>
                      )}
                    </Text>
                  )}
                  
                  {/* 52-Week Range */}
                  {asset.week52Low !== undefined && asset.week52High !== undefined && (
                    <Text style={weekRangeText}>
                      52-Week Range: ${asset.week52Low.toFixed(2)} - ${asset.week52High.toFixed(2)}
                    </Text>
                  )}
                  
                  <Text style={assetSummaryText}>{asset.summary}</Text>
                  <Text style={newsCount}>{asset.newsCount} related articles</Text>
                </Section>
              ))}
            </Section>
          )}

          <Hr style={hr} />

          {/* Notable Headlines */}
          {notableHeadlines.length > 0 && (
            <Section style={section}>
              <Heading as="h2" style={sectionHeading}>
                📰 Notable Headlines
              </Heading>
              {notableHeadlines.map((headline, index) => (
                <Section key={index} style={headlineItem}>
                  <Link href={headline.url} style={headlineLink}>
                    {headline.title}
                  </Link>
                  <Text style={headlineMeta}>
                    {headline.source}
                    {headline.publishedAt && (
                      <span> • {headline.publishedAt}</span>
                    )}
                  </Text>
                  {headline.snippet && (
                    <Text style={headlineSnippet}>{headline.snippet}</Text>
                  )}
                </Section>
              ))}
            </Section>
          )}

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={disclaimer}>
              This briefing is for informational purposes only and does not constitute
              financial advice. Past performance is not indicative of future results.
            </Text>
            <Text style={footerLinks}>
              {unsubscribeUrl && (
                <Link href={unsubscribeUrl} style={footerLink}>
                  Unsubscribe
                </Link>
              )}
              {' • '}
              <Link href="#" style={footerLink}>
                Manage Preferences
              </Link>
            </Text>
            <Text style={copyright}>
              © {new Date().getFullYear()} Market Intelligence. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default DailyBriefingEmail;

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0',
  maxWidth: '600px',
};

const header = {
  padding: '20px 30px',
  textAlign: 'center' as const,
};

const logo = {
  color: '#1a1a1a',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0',
};

const dateText = {
  color: '#666666',
  fontSize: '14px',
  margin: '10px 0 0',
};

const section = {
  padding: '20px 30px',
};

const greeting = {
  color: '#1a1a1a',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0 0 10px',
};

const intro = {
  color: '#4a4a4a',
  fontSize: '15px',
  lineHeight: '1.5',
  margin: '0',
};

const sectionHeading = {
  color: '#1a1a1a',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 15px',
};

const paragraph = {
  color: '#4a4a4a',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0',
};

const assetCard = {
  backgroundColor: '#f8f9fa',
  borderRadius: '8px',
  padding: '15px',
  marginBottom: '10px',
};

const assetHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  margin: '0 0 8px',
};

const assetSymbol = {
  color: '#1a1a1a',
  fontSize: '16px',
  fontWeight: '700',
};

const assetName = {
  color: '#666666',
  fontSize: '14px',
  fontWeight: '400',
};

const priceRow = {
  margin: '8px 0',
};

const currentPrice = {
  color: '#1a1a1a',
  fontSize: '18px',
  fontWeight: '600',
};

const weekRangeText = {
  color: '#888888',
  fontSize: '12px',
  margin: '4px 0 8px',
};

const priceChangePositive = {
  color: '#10b981',
  fontSize: '14px',
  fontWeight: '600',
};

const priceChangeNegative = {
  color: '#ef4444',
  fontSize: '14px',
  fontWeight: '600',
};

const assetSummaryText = {
  color: '#4a4a4a',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0 0 8px',
};

const newsCount = {
  color: '#888888',
  fontSize: '12px',
  margin: '0',
};

const headlineItem = {
  marginBottom: '15px',
};

const headlineLink = {
  color: '#2563eb',
  fontSize: '15px',
  fontWeight: '500',
  textDecoration: 'none',
};

const headlineMeta = {
  color: '#888888',
  fontSize: '12px',
  margin: '4px 0 0',
};

const headlineSnippet = {
  color: '#666666',
  fontSize: '13px',
  lineHeight: '1.4',
  margin: '6px 0 0',
};

const headlineSource = {
  color: '#888888',
  fontSize: '12px',
  margin: '4px 0 0',
};

const hr = {
  borderColor: '#e5e7eb',
  margin: '0',
};

const footer = {
  padding: '20px 30px',
  textAlign: 'center' as const,
};

const disclaimer = {
  color: '#888888',
  fontSize: '11px',
  lineHeight: '1.5',
  margin: '0 0 15px',
};

const footerLinks = {
  color: '#888888',
  fontSize: '12px',
  margin: '0 0 10px',
};

const footerLink = {
  color: '#666666',
  textDecoration: 'underline',
};

const copyright = {
  color: '#aaaaaa',
  fontSize: '11px',
  margin: '0',
};
