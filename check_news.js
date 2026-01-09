const { createClient } = require('@supabase/supabase-client');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { count: newsCount } = await supabase.from('news_items').select('*', { count: 'exact', head: true });
  const { count: relevanceCount } = await supabase.from('news_asset_relevance').select('*', { count: 'exact', head: true });
  const { data: latestNews } = await supabase.from('news_items').select('title, created_at').order('created_at', { ascending: false }).limit(5);
  
  console.log('Total news items:', newsCount);
  console.log('Total relevance matches:', relevanceCount);
  console.log('Latest news:', JSON.stringify(latestNews, null, 2));
}

check();
