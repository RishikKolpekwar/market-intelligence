/**
 * Script to sync all financial data for user assets
 * Run with: npx tsx scripts/sync-all-data.ts
 */

async function syncAllData() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  // Get access token from environment or prompt user
  const accessToken = process.env.SUPABASE_USER_TOKEN;

  if (!accessToken) {
    console.error('❌ Please set SUPABASE_USER_TOKEN environment variable');
    console.error('   Get your token from: localStorage.getItem("supabase.auth.token")');
    process.exit(1);
  }

  console.log('🚀 Starting data sync...\n');

  // 1. Sync prices and historical data
  console.log('📊 Syncing prices and historical data...');
  const pricesRes = await fetch(`${baseUrl}/api/sync/prices`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!pricesRes.ok) {
    console.error('❌ Prices sync failed:', await pricesRes.text());
  } else {
    const pricesData = await pricesRes.json();
    console.log('✅ Prices synced:', pricesData.message);
    if (pricesData.errors) {
      console.log('⚠️  Errors:', pricesData.errors);
    }
  }

  console.log('');

  // 2. Sync fundamentals (EV/EBITDA, earnings)
  console.log('📈 Syncing fundamentals (EV/EBITDA, earnings dates)...');
  const fundamentalsRes = await fetch(`${baseUrl}/api/sync/fundamentals`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!fundamentalsRes.ok) {
    console.error('❌ Fundamentals sync failed:', await fundamentalsRes.text());
  } else {
    const fundamentalsData = await fundamentalsRes.json();
    console.log('✅ Fundamentals synced:', fundamentalsData.message);
    if (fundamentalsData.errors) {
      console.log('⚠️  Errors:', fundamentalsData.errors);
    }
  }

  console.log('\n✨ Data sync complete!');
}

syncAllData().catch(console.error);
