import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/cron/telegram-auto-publish
 *
 * Cron job that runs every hour. Finds stores with auto-publish enabled,
 * checks if their interval has elapsed, and publishes a product to Telegram.
 *
 * This endpoint is called by Vercel Cron (configured in vercel.json).
 * It uses the service_role key — no auth required (cron is server-side).
 */
export async function GET() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 });
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1. Find all stores with auto-publish enabled
    const { data: configs, error } = await adminClient
      .from('telegram_configs')
      .select('store_id, bot_token, group_chat_id, auto_publish_interval_hours, last_publish_at')
      .eq('is_active', true)
      .eq('auto_publish_enabled', true)
      .not('bot_token', 'is', null)
      .not('group_chat_id', 'is', null);

    if (error || !configs) {
      return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 });
    }

    const results = [];

    for (const config of configs) {
      // 2. Check if interval has elapsed (idempotency)
      if (config.last_publish_at) {
        const hoursSince = (Date.now() - new Date(config.last_publish_at).getTime()) / 3600000;
        if (hoursSince < config.auto_publish_interval_hours) {
          results.push({ storeId: config.store_id, skipped: true, reason: 'interval_not_elapsed', hoursSince: Math.round(hoursSince * 100) / 100 });
          continue;
        }
      }

      // 3. Call the publish logic (inline to avoid auth middleware)
      try {
        // Get vitrina products
        const { data: products } = await adminClient
          .from('products')
          .select('id, name, description, price, price_currency, image_url, unit_of_measure, stock_current, price_visible, stock_visible')
          .eq('store_id', config.store_id)
          .eq('is_active', true)
          .eq('visible_en_tienda', true)
          .order('name');

        if (!products || products.length === 0) {
          await adminClient.from('telegram_configs').update({
            last_publish_at: new Date().toISOString(), last_publish_status: 'no_products', last_publish_error: null,
          }).eq('store_id', config.store_id);
          results.push({ storeId: config.store_id, skipped: true, reason: 'no_products' });
          continue;
        }

        // Resolve image URLs
        const productsWithUrls = products.map(p => ({
          ...p,
          resolved_image_url: p.image_url ? `${SUPABASE_URL}/storage/v1/object/public/product-images/${p.image_url}` : null,
        }));

        // Rotation: get last 50 published
        const { data: history } = await adminClient
          .from('telegram_product_posts')
          .select('product_id')
          .eq('store_id', config.store_id)
          .eq('status', 'success')
          .order('created_at', { ascending: false })
          .limit(50);
        const publishedIds = new Set((history || []).map(h => h.product_id));

        let selectedProduct = null;
        const neverPublished = productsWithUrls.filter(p => !publishedIds.has(p.id));
        if (neverPublished.length > 0) {
          selectedProduct = neverPublished[Math.floor(Math.random() * neverPublished.length)];
        } else {
          const { data: leastRecent } = await adminClient
            .from('telegram_product_posts')
            .select('product_id')
            .eq('store_id', config.store_id).eq('status', 'success')
            .order('created_at', { ascending: true }).limit(1);
          if (leastRecent?.length) {
            selectedProduct = productsWithUrls.find(p => p.id === leastRecent[0].product_id);
          }
          if (!selectedProduct) selectedProduct = productsWithUrls[0];
        }

        // Build message
        const priceVisible = selectedProduct.price_visible !== false;
        const price = priceVisible && selectedProduct.price > 0
          ? new Intl.NumberFormat('es-CU', { minimumFractionDigits: 2 }).format(selectedProduct.price) : null;
        const currency = selectedProduct.price_currency || 'CUP';
        const stockVisible = selectedProduct.stock_visible !== false;
        const stock = stockVisible ? selectedProduct.stock_current : null;

        let text = `\u{1F6CD}\u{FE0F} *${selectedProduct.name}*\n`;
        if (selectedProduct.description) text += `\n${selectedProduct.description}\n`;
        if (price) text += `\n\u{1F4B0} *Precio:* ${price} ${currency}\n`;
        if (stock !== null && stock > 0) text += `\u{1F4E6} Disponible: ${stock} ${selectedProduct.unit_of_measure || 'uds'}\n`;
        text += `\n\u{1F449} Disponible en nuestra tienda`;

        // Send to Telegram
        const TG_API = `https://api.telegram.org/bot${config.bot_token}`;
        let telegramResult: any;
        let status = 'success';
        let errorMsg: string | null = null;
        let messageId: number | null = null;

        try {
          if (selectedProduct.resolved_image_url) {
            const photoResp = await fetch(`${TG_API}/sendPhoto`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: config.group_chat_id, photo: selectedProduct.resolved_image_url, caption: text, parse_mode: 'Markdown' }),
            });
            telegramResult = await photoResp.json();
            if (!telegramResult.ok) {
              const msgResp = await fetch(`${TG_API}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: config.group_chat_id, text, parse_mode: 'Markdown' }),
              });
              telegramResult = await msgResp.json();
            }
          } else {
            const msgResp = await fetch(`${TG_API}/sendMessage`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: config.group_chat_id, text, parse_mode: 'Markdown' }),
            });
            telegramResult = await msgResp.json();
          }
          if (telegramResult.ok) { messageId = telegramResult.result.message_id; }
          else { status = 'failed'; errorMsg = telegramResult.description; }
        } catch (e: any) { status = 'failed'; errorMsg = e.message; }

        // Record
        await adminClient.from('telegram_product_posts').insert({
          store_id: config.store_id, product_id: selectedProduct.id, product_name: selectedProduct.name,
          product_price: selectedProduct.price, product_currency: selectedProduct.price_currency,
          telegram_chat_id: config.group_chat_id, telegram_message_id: messageId,
          status, error: errorMsg, publish_type: 'automatic', published_by: null,
        });
        await adminClient.from('telegram_configs').update({
          last_publish_at: new Date().toISOString(), last_product_id: selectedProduct.id,
          last_publish_status: status, last_publish_error: errorMsg,
        }).eq('store_id', config.store_id);

        results.push({ storeId: config.store_id, status, product: selectedProduct.name, messageId });
      } catch (e: any) {
        results.push({ storeId: config.store_id, status: 'error', error: e.message });
      }
    }

    return NextResponse.json({ processed: configs.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
