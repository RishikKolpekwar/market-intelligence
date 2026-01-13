/**
 * Script to reset all assets for a specific user
 * Usage: tsx scripts/reset-user-assets.ts <user_email>
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetUserAssets(userEmail: string) {
  console.log(`\n🔍 Looking for user: ${userEmail}`);

  // Find user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('email', userEmail)
    .single();

  if (userError || !user) {
    console.error('❌ User not found:', userError?.message);
    return;
  }

  console.log(`✓ Found user: ${user.full_name || user.email} (${user.id})`);

  // Get current assets
  const { data: currentAssets, error: assetsError } = await supabase
    .from('user_assets')
    .select(`
      id,
      assets!inner (
        symbol,
        name
      )
    `)
    .eq('user_id', user.id);

  if (assetsError) {
    console.error('❌ Error fetching assets:', assetsError.message);
    return;
  }

  console.log(`\n📊 Current assets: ${currentAssets?.length || 0}`);
  if (currentAssets && currentAssets.length > 0) {
    currentAssets.forEach((ua: any) => {
      console.log(`  - ${ua.assets?.symbol}: ${ua.assets?.name}`);
    });
  }

  // Confirm deletion
  console.log(`\n⚠️  This will DELETE all ${currentAssets?.length || 0} assets for ${userEmail}`);
  console.log('⚠️  This action CANNOT be undone!');
  console.log('\nTo proceed, set CONFIRM_DELETE=true environment variable and run again.');

  if (process.env.CONFIRM_DELETE !== 'true') {
    console.log('\n❌ Deletion cancelled (CONFIRM_DELETE not set)');
    return;
  }

  console.log('\n🗑️  Deleting assets...');

  // Delete all user assets
  const { error: deleteError } = await supabase
    .from('user_assets')
    .delete()
    .eq('user_id', user.id);

  if (deleteError) {
    console.error('❌ Error deleting assets:', deleteError.message);
    return;
  }

  console.log('✅ All assets deleted successfully!');

  // Verify deletion
  const { count } = await supabase
    .from('user_assets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  console.log(`\n✓ Verification: ${count || 0} assets remaining`);
}

// Get email from command line args
const userEmail = process.argv[2];

if (!userEmail) {
  console.error('❌ Usage: tsx scripts/reset-user-assets.ts <user_email>');
  console.error('   Example: tsx scripts/reset-user-assets.ts rishikkolpekwar@gmail.com');
  process.exit(1);
}

resetUserAssets(userEmail)
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
