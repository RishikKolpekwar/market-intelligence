/**
 * Database Types - Auto-generated from Supabase schema
 * Run `npm run db:generate` to regenerate after schema changes
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
        subscriptions: {
          Row: {
          id: string;
          user_id: string;
          stripe_subscription_id: string;
          status: string;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_subscription_id: string;
          status?: string;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stripe_subscription_id?: string;
          status?: string;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          timezone: string;
          email_enabled: boolean;
          email_frequency: 'daily' | 'weekly' | 'disabled';
          preferred_send_hour: number;
          is_free_account: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          timezone?: string;
          email_enabled?: boolean;
          email_frequency?: 'daily' | 'weekly' | 'disabled';
          preferred_send_hour?: number;
          is_free_account?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          timezone?: string;
          email_enabled?: boolean;
          email_frequency?: 'daily' | 'weekly' | 'disabled';
          preferred_send_hour?: number;
          is_free_account?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      assets: {
        Row: {
          id: string;
          symbol: string;
          name: string;
          asset_type: 'stock' | 'etf' | 'crypto' | 'index';
          exchange: string | null;
          sector: string | null;
          industry: string | null;
          keywords: string[];
          current_price: number | null;
          price_change_24h: number | null;
          price_change_pct_24h: number | null;
          market_cap: number | null;
          last_price_update: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          name: string;
          asset_type: 'stock' | 'etf' | 'crypto' | 'index';
          exchange?: string | null;
          sector?: string | null;
          industry?: string | null;
          keywords?: string[];
          current_price?: number | null;
          price_change_24h?: number | null;
          price_change_pct_24h?: number | null;
          market_cap?: number | null;
          last_price_update?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          symbol?: string;
          name?: string;
          asset_type?: 'stock' | 'etf' | 'crypto' | 'index';
          exchange?: string | null;
          sector?: string | null;
          industry?: string | null;
          keywords?: string[];
          current_price?: number | null;
          price_change_24h?: number | null;
          price_change_pct_24h?: number | null;
          market_cap?: number | null;
          last_price_update?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_assets: {
        Row: {
          id: string;
          user_id: string;
          asset_id: string;
          importance_level: 'low' | 'normal' | 'high' | 'critical';
          shares_held: number | null;
          average_cost: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          asset_id: string;
          importance_level?: 'low' | 'normal' | 'high' | 'critical';
          shares_held?: number | null;
          average_cost?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          asset_id?: string;
          importance_level?: 'low' | 'normal' | 'high' | 'critical';
          shares_held?: number | null;
          average_cost?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      news_sources: {
        Row: {
          id: string;
          name: string;
          source_type: 'api' | 'rss';
          base_url: string | null;
          credibility_score: number;
          requests_per_minute: number;
          last_fetch_at: string | null;
          is_active: boolean;
          config: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          source_type: 'api' | 'rss';
          base_url?: string | null;
          credibility_score?: number;
          requests_per_minute?: number;
          last_fetch_at?: string | null;
          is_active?: boolean;
          config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          source_type?: 'api' | 'rss';
          base_url?: string | null;
          credibility_score?: number;
          requests_per_minute?: number;
          last_fetch_at?: string | null;
          is_active?: boolean;
          config?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      news_items: {
        Row: {
          id: string;
          source_id: string | null;
          source_name: string;
          external_id: string | null;
          title: string;
          summary: string | null;
          content: string | null;
          url: string;
          image_url: string | null;
          author: string | null;
          published_at: string;
          ingested_at: string;
          category: string | null;
          tags: string[];
          mentioned_symbols: string[];
          mentioned_entities: string[];
          content_hash: string;
          sentiment: 'positive' | 'negative' | 'neutral' | 'mixed' | null;
          sentiment_score: number | null;
          is_processed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_id?: string | null;
          source_name: string;
          external_id?: string | null;
          title: string;
          summary?: string | null;
          content?: string | null;
          url: string;
          image_url?: string | null;
          author?: string | null;
          published_at: string;
          ingested_at?: string;
          category?: string | null;
          tags?: string[];
          mentioned_symbols?: string[];
          mentioned_entities?: string[];
          content_hash: string;
          sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed' | null;
          sentiment_score?: number | null;
          is_processed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string | null;
          source_name?: string;
          external_id?: string | null;
          title?: string;
          summary?: string | null;
          content?: string | null;
          url?: string;
          image_url?: string | null;
          author?: string | null;
          published_at?: string;
          ingested_at?: string;
          category?: string | null;
          tags?: string[];
          mentioned_symbols?: string[];
          mentioned_entities?: string[];
          content_hash?: string;
          sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed' | null;
          sentiment_score?: number | null;
          is_processed?: boolean;
          created_at?: string;
        };
      };
      news_asset_relevance: {
        Row: {
          id: string;
          news_item_id: string;
          asset_id: string;
          match_type: 'symbol_mention' | 'keyword_match' | 'llm_inferred' | 'manual';
          relevance_score: number;
          matched_terms: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          news_item_id: string;
          asset_id: string;
          match_type: 'symbol_mention' | 'keyword_match' | 'llm_inferred' | 'manual';
          relevance_score?: number;
          matched_terms?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          news_item_id?: string;
          asset_id?: string;
          match_type?: 'symbol_mention' | 'keyword_match' | 'llm_inferred' | 'manual';
          relevance_score?: number;
          matched_terms?: string[];
          created_at?: string;
        };
      };
      email_send_log: {
        Row: {
          id: string;
          user_id: string;
          briefing_date: string;
          email_type: 'daily_briefing' | 'weekly_digest' | 'alert';
          subject: string | null;
          status: 'pending' | 'sent' | 'failed' | 'skipped';
          sent_at: string | null;
          mailersend_id: string | null;
          error_message: string | null;
          retry_count: number;
          briefing_content_hash: string | null;
          news_item_count: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          briefing_date: string;
          email_type?: 'daily_briefing' | 'weekly_digest' | 'alert';
          subject?: string | null;
          status: 'pending' | 'sent' | 'failed' | 'skipped';
          sent_at?: string | null;
          mailersend_id?: string | null;
          error_message?: string | null;
          retry_count?: number;
          briefing_content_hash?: string | null;
          news_item_count?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          briefing_date?: string;
          email_type?: 'daily_briefing' | 'weekly_digest' | 'alert';
          subject?: string | null;
          status?: 'pending' | 'sent' | 'failed' | 'skipped';
          sent_at?: string | null;
          mailersend_id?: string | null;
          error_message?: string | null;
          retry_count?: number;
          briefing_content_hash?: string | null;
          news_item_count?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      daily_briefings: {
        Row: {
          id: string;
          user_id: string;
          briefing_date: string;
          market_overview: string | null;
          asset_summaries: Json;
          notable_headlines: Json;
          full_briefing_html: string | null;
          full_briefing_text: string | null;
          total_news_items: number;
          assets_covered: number;
          llm_model: string | null;
          llm_tokens_used: number | null;
          generation_time_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          briefing_date: string;
          market_overview?: string | null;
          asset_summaries?: Json;
          notable_headlines?: Json;
          full_briefing_html?: string | null;
          full_briefing_text?: string | null;
          total_news_items?: number;
          assets_covered?: number;
          llm_model?: string | null;
          llm_tokens_used?: number | null;
          generation_time_ms?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          briefing_date?: string;
          market_overview?: string | null;
          asset_summaries?: Json;
          notable_headlines?: Json;
          full_briefing_html?: string | null;
          full_briefing_text?: string | null;
          total_news_items?: number;
          assets_covered?: number;
          llm_model?: string | null;
          llm_tokens_used?: number | null;
          generation_time_ms?: number | null;
          created_at?: string;
        };
      };
      ingestion_log: {
        Row: {
          id: string;
          source_id: string | null;
          source_name: string;
          run_type: 'scheduled' | 'manual' | 'backfill' | null;
          status: 'started' | 'completed' | 'failed';
          items_fetched: number;
          items_new: number;
          items_duplicate: number;
          items_failed: number;
          started_at: string;
          completed_at: string | null;
          duration_ms: number | null;
          error_message: string | null;
          error_details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_id?: string | null;
          source_name: string;
          run_type?: 'scheduled' | 'manual' | 'backfill' | null;
          status: 'started' | 'completed' | 'failed';
          items_fetched?: number;
          items_new?: number;
          items_duplicate?: number;
          items_failed?: number;
          started_at?: string;
          completed_at?: string | null;
          duration_ms?: number | null;
          error_message?: string | null;
          error_details?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string | null;
          source_name?: string;
          run_type?: 'scheduled' | 'manual' | 'backfill' | null;
          status?: 'started' | 'completed' | 'failed';
          items_fetched?: number;
          items_new?: number;
          items_duplicate?: number;
          items_failed?: number;
          started_at?: string;
          completed_at?: string | null;
          duration_ms?: number | null;
          error_message?: string | null;
          error_details?: Json | null;
          created_at?: string;
        };
      };
    };
    Views: {
      v_recent_asset_news: {
        Row: {
          symbol: string;
          asset_name: string;
          title: string;
          summary: string | null;
          url: string;
          source_name: string;
          published_at: string;
          relevance_score: number;
          match_type: string;
        };
      };
      v_user_portfolio_summary: {
        Row: {
          user_id: string;
          symbol: string;
          name: string;
          asset_type: string;
          current_price: number | null;
          price_change_pct_24h: number | null;
          importance_level: string;
          shares_held: number | null;
          news_count_24h: number;
        };
      };
    };
    Functions: {};
    Enums: {};
  };
}

// Convenience type aliases
export type User = Database['public']['Tables']['users']['Row'];
export type Asset = Database['public']['Tables']['assets']['Row'];
export type UserAsset = Database['public']['Tables']['user_assets']['Row'];
export type NewsSource = Database['public']['Tables']['news_sources']['Row'];
export type NewsItem = Database['public']['Tables']['news_items']['Row'];
export type NewsAssetRelevance = Database['public']['Tables']['news_asset_relevance']['Row'];
export type EmailSendLog = Database['public']['Tables']['email_send_log']['Row'];
export type DailyBriefing = Database['public']['Tables']['daily_briefings']['Row'];
export type IngestionLog = Database['public']['Tables']['ingestion_log']['Row'];

// Insert types
export type UserInsert = Database['public']['Tables']['users']['Insert'];
export type AssetInsert = Database['public']['Tables']['assets']['Insert'];
export type UserAssetInsert = Database['public']['Tables']['user_assets']['Insert'];
export type NewsItemInsert = Database['public']['Tables']['news_items']['Insert'];
export type NewsAssetRelevanceInsert = Database['public']['Tables']['news_asset_relevance']['Insert'];
export type EmailSendLogInsert = Database['public']['Tables']['email_send_log']['Insert'];
export type DailyBriefingInsert = Database['public']['Tables']['daily_briefings']['Insert'];
export type Subscription = Database['public']['Tables']['subscriptions']['Row'];
export type SubscriptionInsert = Database['public']['Tables']['subscriptions']['Insert'];
export type SubscriptionUpdate = Database['public']['Tables']['subscriptions']['Update'];

