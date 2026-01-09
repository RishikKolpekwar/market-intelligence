# Market Intelligence - Daily Briefing System

A personal market intelligence product that sends daily email briefings based on tracked stocks and ETFs, synthesizing relevant news from multiple sources.

## ✨ Features

- **Auto-detect Asset Type**: Just enter a ticker symbol - we automatically detect if it's a stock, ETF, or mutual fund
- **Daily Price Metrics**: See current price, daily change %, and 52-week high/low for all your tracked assets
- **Clickable News Articles**: Headlines include source, timestamp, and direct links to full articles
- **Smart News Filtering**: Relevant news matched to your portfolio using keyword and symbol detection
- **LLM-Powered Summaries**: AI-generated briefings that synthesize multiple sources into actionable insights
- **AI News Agent**: Advanced agentic research using Gemini and Tavily to find and contextualize the most critical market updates.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DAILY CRON TRIGGER                               │
│                     (Vercel Cron - Configurable)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  News APIs    │         │   RSS Feeds     │         │  Market Data    │
│  (NewsAPI,    │         │  (MarketWatch,  │         │  (Prices via    │
│   Finnhub)    │         │   Yahoo, CNBC)  │         │   API)          │
└───────┬───────┘         └────────┬────────┘         └────────┬────────┘
        │                          │                           │
        └──────────────────────────┼───────────────────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │      NORMALIZATION          │
                    │   (Unified Article Schema)  │
                    └─────────────┬───────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │      DEDUPLICATION          │
                    │   (Content Hash + Title)    │
                    └─────────────┬───────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │   RELEVANCE FILTERING       │
                    │  (Symbol + Keyword Match)   │
                    └─────────────┬───────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │   LLM SUMMARIZATION         │
                    │  (Gemini 1.5 Flash)         │
                    └─────────────┬───────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │    EMAIL DELIVERY           │
                    │      (MailerSend)           │
                    └─────────────────────────────┘
```

## 🚀 Tech Stack

- **Frontend/Backend**: Next.js 14 (App Router) on Vercel
- **Auth & Database**: Supabase (PostgreSQL + Google OAuth)
- **Scheduled Jobs**: Vercel Cron
- **Email**: MailerSend
- **LLM**: Google Gemini 1.5 Flash
- **Data Sources**: NewsAPI, Finnhub, Tiingo, Tavily, RSS Feeds

## 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   ├── ingest/          # News ingestion cron
│   │   │   └── send-briefings/  # Email sending cron
│   │   ├── assets/
│   │   │   └── search/          # Asset search endpoint
│   │   ├── ingest/
│   │   │   ├── agent/           # AI Research endpoint
│   │   │   └── route.ts         # Manual sync endpoint
│   │   └── user/
│   │       └── assets/          # User asset management
│   ├── auth/
│   │   └── callback/            # OAuth callback
│   ├── dashboard/               # User dashboard
│   ├── login/                   # Login page
│   └── page.tsx                 # Landing page
├── emails/
│   └── daily-briefing.tsx       # Email template (React Email)
├── lib/
│   ├── email/
│   │   └── sender.ts            # Email sending logic
│   ├── ingestion/
│   │   ├── agent.ts             # AI News Agent
│   │   ├── tiingo.ts            # Tiingo client
│   │   ├── normalizer.ts        # Article normalization
│   │   ├── newsapi.ts           # NewsAPI client
│   │   ├── finnhub.ts           # Finnhub client
│   │   └── rss.ts               # RSS feed parser
│   ├── llm/
│   │   ├── gemini.ts            # Gemini helper
│   │   └── briefing-generator.ts # LLM summarization
│   ├── relevance/
│   │   └── filter.ts            # Asset-news matching
│   └── supabase/
│       └── client.ts            # Supabase clients
└── types/
    ├── database.ts              # Database types
    └── ingestion.ts             # Ingestion types
```

## 🗄️ Database Schema

The system uses 9 core tables:

| Table | Purpose |
|-------|---------|
| `users` | User profiles (extends Supabase auth) |
| `assets` | Master list of stocks/ETFs |
| `portfolios` | User-defined funds/accounts |
| `user_assets` | User watchlist (many-to-many) |
| `news_sources` | Configuration for news sources |
| `news_items` | Normalized articles from all sources |
| `news_asset_relevance` | Links between news and assets with AI Context |
| `email_send_log` | Email delivery tracking (idempotency) |
| `daily_briefings` | Generated briefing content |

## 🔧 Setup Instructions

### 1. Clone and Install

```bash
git clone https://github.com/RishikKolpekwar/market-intelligence.git
cd market-intelligence
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run all files in `supabase/migrations/`
3. Enable Google OAuth in Authentication → Providers
4. Copy your project URL and keys

### 3. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Gemini (LLM)
GEMINI_API_KEY=...

# Tavily (AI Research)
TAVILY_API_KEY=...

# Tiingo (High-quality News)
TIINGO_API_KEY=...

# MailerSend
MAILERSEND_API_KEY=mlsn...
MAILERSEND_FROM_EMAIL=briefings@yourdomain.com
MAILERSEND_FROM_NAME=Market Intelligence

# News APIs
NEWS_API_KEY=...           # Get from newsapi.org
FINNHUB_API_KEY=...        # Get from finnhub.io

# Cron Secret (generate a random string)
CRON_SECRET=your-secret-here

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Run Locally

```bash
npm run dev
```

## 📊 Data Ingestion Strategy

### News Sources

1. **AI Agent** - Deep research using Gemini's search capabilities
2. **Tiingo** - Professional market data and news
3. **NewsAPI** - Major business outlet headlines
4. **Finnhub** - Real-time ticker news
5. **RSS Feeds** - Traditional financial news feeds

## 📄 License

MIT License - see LICENSE file

---

Built with ❤️ for informed investors who want signal, not noise.
