/**
 * Full audit of ENERVIDA's Telegram auto-publish config + history.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENERVIDA_STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  AUDIT 1: ENERVIDA telegram_configs');
  console.log('═══════════════════════════════════════════════════════════════');

  // 1. telegram_configs row for ENERVIDA
  const { data: cfg, error: cfgErr } = await client
    .from('telegram_configs')
    .select('*')
    .eq('store_id', ENERVIDA_STORE_ID)
    .maybeSingle();
  if (cfgErr) {
    console.error('DB error:', cfgErr);
    process.exit(1);
  }
  if (!cfg) {
    console.error('❌ NO telegram_configs row for ENERVIDA');
    process.exit(1);
  }
  // Don't print full token; show length + first/last 4 chars
  const maskedToken = cfg.bot_token
    ? `${cfg.bot_token.substring(0, 4)}…${cfg.bot_token.substring(cfg.bot_token.length - 4)} (len=${cfg.bot_token.length})`
    : 'NULL';

  console.log('store_id:                   ', cfg.store_id);
  console.log('is_active:                  ', cfg.is_active);
  console.log('bot_user_id:                ', cfg.bot_user_id);
  console.log('bot_username:               ', cfg.bot_username);
  console.log('bot_token (masked):         ', maskedToken);
  console.log('group_chat_id:             ', cfg.group_chat_id);
  console.log('group_title:                ', cfg.group_title);
  console.log('auto_publish_enabled:      ', cfg.auto_publish_enabled);
  console.log('auto_publish_interval_min: ', cfg.auto_publish_interval_minutes);
  console.log('last_publish_at:           ', cfg.last_publish_at);
  console.log('last_product_id:            ', cfg.last_product_id);
  console.log('last_publish_status:       ', cfg.last_publish_status);
  console.log('last_publish_error:        ', cfg.last_publish_error);
  console.log('show_price:                 ', cfg.show_price);
  console.log('show_physical_units:        ', cfg.show_physical_units);
  console.log('webhook_url:                ', cfg.webhook_url);
  console.log('webhook_secret (set):       ', !!cfg.webhook_secret);
  console.log('webhook_registered_at:      ', cfg.webhook_registered_at);

  // 2. Check if there are MULTIPLE rows for ENERVIDA (should be exactly 1)
  console.log('\n=== Check for duplicate telegram_configs rows for ENERVIDA ===');
  const { data: allRows } = await client
    .from('telegram_configs')
    .select('store_id, is_active, auto_publish_enabled, created_at')
    .eq('store_id', ENERVIDA_STORE_ID);
  console.log(`Rows found: ${allRows?.length || 0}`);
  if (allRows && allRows.length > 1) {
    console.log('⚠️ Multiple rows found:', allRows);
  } else {
    console.log('✓ Single row per store');
  }

  // 3. List ALL stores with auto_publish_enabled=true (multi-tenant view)
  console.log('\n=== All stores with auto_publish_enabled=true (any store) ===');
  const { data: autoStores } = await client
    .from('telegram_configs')
    .select('store_id, is_active, auto_publish_enabled, auto_publish_interval_minutes, last_publish_at, last_publish_status, last_publish_error')
    .eq('auto_publish_enabled', true);
  if (autoStores && autoStores.length > 0) {
    for (const s of autoStores) {
      console.log(`  store_id=${s.store_id} active=${s.is_active} interval=${s.auto_publish_interval_minutes}min last=${s.last_publish_at} status=${s.last_publish_status}`);
    }
  } else {
    console.log('  (no stores have auto_publish_enabled=true)');
  }

  // 4. Publication history
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  AUDIT 2: ENERVIDA telegram_product_posts history');
  console.log('═══════════════════════════════════════════════════════════════');
  const { data: posts, error: postsErr } = await client
    .from('telegram_product_posts')
    .select('id, product_id, product_name, status, publish_type, error, telegram_message_id, created_at')
    .eq('store_id', ENERVIDA_STORE_ID)
    .order('created_at', { ascending: false })
    .limit(20);
  if (postsErr) {
    console.error('DB error:', postsErr);
  } else {
    console.log(`Total posts: ${posts?.length || 0}`);
    if (posts && posts.length > 0) {
      for (const p of posts.slice(0, 10)) {
        console.log(`  [${p.created_at}] ${p.status} ${p.publish_type}: ${p.product_name} msg_id=${p.telegram_message_id}${p.error ? ' err=' + p.error : ''}`);
      }
    } else {
      console.log('  ⚠️ No publication history for ENERVIDA');
    }
  }

  // 5. Math check: if last_publish_at is X minutes ago, what's expected?
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  AUDIT 3: Interval math (current state)');
  console.log('═══════════════════════════════════════════════════════════════');
  if (cfg.last_publish_at) {
    const lastTime = new Date(cfg.last_publish_at).getTime();
    const now = Date.now();
    const minutesSince = (now - lastTime) / 60000;
    const interval = cfg.auto_publish_interval_minutes || 360;
    const shouldPublish = minutesSince >= interval;
    console.log(`last_publish_at:    ${cfg.last_publish_at}`);
    console.log(`now:                ${new Date(now).toISOString()}`);
    console.log(`minutesSince:       ${minutesSince.toFixed(2)}`);
    console.log(`interval (min):     ${interval}`);
    console.log(`shouldPublish now?  ${shouldPublish ? '✓ YES' : '✗ NO (idempotency skip)'}`);
    if (!shouldPublish) {
      const nextAt = lastTime + interval * 60 * 1000;
      console.log(`next eligible at:  ${new Date(nextAt).toISOString()}`);
    }
  } else {
    console.log('last_publish_at is NULL — first run should always publish');
  }

  // 6. Count eligible products
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  AUDIT 4: Eligible products for ENERVIDA vitrina');
  console.log('═══════════════════════════════════════════════════════════════');
  const { data: products, error: prodErr } = await client
    .from('products')
    .select('id, name, is_active, visible_en_tienda, price, price_visible, stock_visible, stock_current, image_url')
    .eq('store_id', ENERVIDA_STORE_ID)
    .order('name');
  if (prodErr) {
    console.error('DB error:', prodErr);
  } else {
    const all = products || [];
    const eligible = all.filter(p => p.is_active === true && p.visible_en_tienda === true);
    const withImage = eligible.filter(p => !!p.image_url);
    console.log(`Total products:           ${all.length}`);
    console.log(`Eligible (active+vitrina): ${eligible.length}`);
    console.log(`Eligible with image:       ${withImage.length}`);
    if (eligible.length === 0) {
      console.log('⚠️ NO eligible products → cron will set status=no_products');
    } else if (eligible.length > 0) {
      console.log('\nFirst 3 eligible products:');
      for (const p of eligible.slice(0, 3)) {
        console.log(`  ${p.name} (id=${p.id}) price=${p.price} price_visible=${p.price_visible} image=${!!p.image_url}`);
      }
    }
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
