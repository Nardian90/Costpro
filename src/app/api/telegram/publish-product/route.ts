import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/telegram/publish-product
 *
 * Publishes a product from the store's vitrina to the configured Telegram group.
 */
async function handler(req: NextRequest, session: AuthenticatedSession) {
  const body = await req.json().catch(() => ({}));
  const { storeId, publishType = 'manual', userId } = body;

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  if (publishType === 'manual') {
    const memberships = (session.user as any).memberships || [];
    const isAdmin = (session.user as any).role === 'admin';
    if (!isAdmin && !memberships.some((m: any) => m.store_id === storeId && m.status === 'active')) {
      return NextResponse.json({ error: 'Unauthorized for this store' }, { status: 403 });
    }
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1. Get telegram config
    const { data: config } = await adminClient
      .from('telegram_configs')
      .select('bot_token, group_chat_id, auto_publish_enabled, auto_publish_interval_hours, last_publish_at')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .single();

    if (!config || !config.bot_token || !config.group_chat_id) {
      return NextResponse.json({ error: 'Telegram no configurado para esta tienda' }, { status: 404 });
    }

    // 2. Idempotency check for automatic
    if (publishType === 'automatic') {
      if (!config.auto_publish_enabled) return NextResponse.json({ skipped: true, reason: 'disabled' });
      if (config.last_publish_at) {
        const hoursSince = (Date.now() - new Date(config.last_publish_at).getTime()) / 3600000;
        if (hoursSince < config.auto_publish_interval_hours) {
          return NextResponse.json({ skipped: true, reason: 'interval', hoursSince: Math.round(hoursSince * 100) / 100 });
        }
      }
    }

    // 3. Get vitrina products (same logic as StorefrontPage)
    const { data: products } = await adminClient
      .from('products')
      .select('id, name, description, price, price_currency, image_url, unit_of_measure, stock_current, price_visible, stock_visible')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .eq('visible_en_tienda', true)
      .order('name');

    if (!products || products.length === 0) {
      await adminClient.from('telegram_configs').update({
        last_publish_at: new Date().toISOString(), last_publish_status: 'no_products', last_publish_error: null,
      }).eq('store_id', storeId);
      return NextResponse.json({ success: false, reason: 'No hay productos visibles en la vitrina' });
    }

    // 4. Resolve image URLs
    const productsWithUrls = products.map(p => ({
      ...p,
      resolved_image_url: p.image_url ? `${SUPABASE_URL}/storage/v1/object/public/product-images/${p.image_url}` : null,
    }));

    // 5. Rotation: get last 50 published product IDs
    const { data: history } = await adminClient
      .from('telegram_product_posts')
      .select('product_id')
      .eq('store_id', storeId)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(50);
    const publishedIds = new Set((history || []).map(h => h.product_id));

    // 6. Select: prefer never-published, else least-recently-published
    let selectedProduct = null;
    const neverPublished = productsWithUrls.filter(p => !publishedIds.has(p.id));
    if (neverPublished.length > 0) {
      selectedProduct = neverPublished[Math.floor(Math.random() * neverPublished.length)];
    } else {
      const { data: leastRecent } = await adminClient
        .from('telegram_product_posts')
        .select('product_id')
        .eq('store_id', storeId).eq('status', 'success')
        .order('created_at', { ascending: true }).limit(1);
      if (leastRecent?.length) {
        selectedProduct = productsWithUrls.find(p => p.id === leastRecent[0].product_id);
      }
      if (!selectedProduct) selectedProduct = productsWithUrls[0];
    }

    // 7. Build message
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

    // 8. Send to Telegram
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
          // Fallback to sendMessage
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
      else { status = 'failed'; errorMsg = telegramResult.description || 'Telegram error'; }
    } catch (e: any) { status = 'failed'; errorMsg = e.message; }

    // 9. Record history
    await adminClient.from('telegram_product_posts').insert({
      store_id: storeId, product_id: selectedProduct.id, product_name: selectedProduct.name,
      product_price: selectedProduct.price, product_currency: selectedProduct.price_currency,
      telegram_chat_id: config.group_chat_id, telegram_message_id: messageId,
      status, error: errorMsg, publish_type: publishType, published_by: userId || null,
    });
    await adminClient.from('telegram_configs').update({
      last_publish_at: new Date().toISOString(), last_product_id: selectedProduct.id,
      last_publish_status: status, last_publish_error: errorMsg,
    }).eq('store_id', storeId);

    if (status === 'success') {
      return NextResponse.json({ success: true, message: 'Producto publicado', product: { id: selectedProduct.id, name: selectedProduct.name }, telegram_message_id: messageId, chat_title: telegramResult?.result?.chat?.title });
    } else {
      return NextResponse.json({ success: false, error: errorMsg, product: { id: selectedProduct.id, name: selectedProduct.name } }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
export const POST = withAuth(handler as any);
