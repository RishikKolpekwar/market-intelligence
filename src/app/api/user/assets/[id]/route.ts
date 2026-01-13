import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { z } from 'zod';

// Helper to get Supabase client with access token from header
function getSupabaseWithAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  let accessToken = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.replace('Bearer ', '');
  }
  if (accessToken === null) {
    return createServerClient();
  }
  return createServerClient({ accessToken });
}

// Schema for updating user asset
const updateAssetSchema = z.object({
  portfolio_percentage: z.number().min(0).max(100).optional(),
  importance_level: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  shares_held: z.number().optional().nullable(),
  average_cost: z.number().optional().nullable(),
});

// Type matching the user_assets table update fields
type UserAssetUpdate = {
  portfolio_percentage?: number;
  importance_level?: 'low' | 'normal' | 'high' | 'critical';
  shares_held?: number | null;
  average_cost?: number | null;
  notes?: string | null;
  portfolio_id?: string | null;
  updated_at?: string;
};

/**
 * DELETE /api/user/assets/[id]
 * Remove a specific user_asset entry (delete from a specific fund)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const supabase = getSupabaseWithAuth(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: userAssetId } = await context.params;

  if (!userAssetId) {
    return NextResponse.json({ error: 'user_asset id is required' }, { status: 400 });
  }

  // Delete the specific user_asset entry
  const { error } = await supabase
    .from('user_assets')
    .delete()
    .eq('id', userAssetId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * PATCH /api/user/assets/[id]
 * Update a specific user_asset entry (e.g., change allocation percentage)
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const supabase = getSupabaseWithAuth(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: userAssetId } = await context.params;

  if (!userAssetId) {
    return NextResponse.json({ error: 'user_asset id is required' }, { status: 400 });
  }

  // Parse and validate request body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = updateAssetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.format() },
      { status: 400 }
    );
  }

  // Build update object with only provided fields
  const updateData: UserAssetUpdate = {};

  if (parsed.data.portfolio_percentage !== undefined) {
    updateData.portfolio_percentage = parsed.data.portfolio_percentage;
  }
  if (parsed.data.importance_level !== undefined) {
    updateData.importance_level = parsed.data.importance_level;
  }
  if (parsed.data.shares_held !== undefined) {
    updateData.shares_held = parsed.data.shares_held;
  }
  if (parsed.data.average_cost !== undefined) {
    updateData.average_cost = parsed.data.average_cost;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  // Update the user_asset entry
  const { data: updatedAsset, error } = await supabase
    .from('user_assets')
    .update(updateData as never)
    .eq('id', userAssetId)
    .eq('user_id', user.id)
    .select(`
      id,
      portfolio_percentage,
      importance_level,
      shares_held,
      average_cost,
      assets!inner (
        id,
        symbol,
        name
      )
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, userAsset: updatedAsset });
}