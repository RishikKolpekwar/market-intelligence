import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/portfolios - Get all portfolios for current user
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: portfolios, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    // If table doesn't exist, return empty array (user needs to run migration)
    if (error.code === '42P01' || error.message.includes('does not exist')) {
      console.warn('Portfolios table does not exist. Please run migration 003_portfolios.sql');
      return NextResponse.json({ portfolios: [], needsMigration: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ portfolios: portfolios || [] });
}

/**
 * POST /api/portfolios - Create a new portfolio
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('Auth check:', { user: user?.email, error: authError?.message });
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized - please log in again' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, portfolio_type, color, icon } = body;
    console.log('Creating portfolio:', { name, userId: user.id });

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Portfolio name is required' }, { status: 400 });
    }

    const { data: portfolio, error } = await (supabase
      .from('portfolios') as any)
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        portfolio_type: portfolio_type || 'investment',
        color: color || '#3B82F6',
        icon: icon || '📈',
        is_default: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Portfolio creation error:', error);
      // Check if it's a table not found error
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        return NextResponse.json({ 
          error: 'Portfolio feature not set up. Please run the database migration: supabase/migrations/003_portfolios.sql' 
        }, { status: 500 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('Portfolio created:', portfolio);
    return NextResponse.json({ portfolio });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

/**
 * DELETE /api/portfolios - Delete a portfolio (moves assets to default)
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get('id');

  if (!portfolioId) {
    return NextResponse.json({ error: 'Portfolio ID is required' }, { status: 400 });
  }

  // Check if it's the default portfolio
  const { data: portfolio } = await (supabase
    .from('portfolios') as any)
    .select('is_default')
    .eq('id', portfolioId)
    .eq('user_id', user.id)
    .single();

  if (portfolio?.is_default) {
    return NextResponse.json({ error: 'Cannot delete the default portfolio' }, { status: 400 });
  }

  // Get the default portfolio
  const { data: defaultPortfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .single();

  // Move all assets to default portfolio
  if (defaultPortfolio) {
    await (supabase
      .from('user_assets') as any)
      .update({ portfolio_id: defaultPortfolio })
      .eq('portfolio_id', portfolioId);
  }

  // Soft delete the portfolio
  const { error } = await (supabase
    .from('portfolios') as any)
    .update({ is_active: false })
    .eq('id', portfolioId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
