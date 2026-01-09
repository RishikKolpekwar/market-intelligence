import { NextResponse } from 'next/server';
import { ingestAgenticNews } from '@/lib/ingestion/agent';
import { processAllUnprocessedNews } from '@/lib/relevance/filter';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Agentic News Research endpoint - specifically for deep-dive AI research
 * POST /api/ingest/agent
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  
  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    console.log('Starting Agentic News research...');
    
    // Run agentic research
    const agenticResult = await ingestAgenticNews();
    
    // Process relevance for newly found items
    console.log('Processing relevance for agentic news...');
    const relevanceResult = await processAllUnprocessedNews();

    return NextResponse.json({
      success: true,
      duration_ms: Date.now() - startTime,
      results: {
        agent: agenticResult,
        relevance: relevanceResult
      }
    });
  } catch (error) {
    console.error('Agentic ingest route error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
