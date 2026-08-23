/**
 * telegram-publish.ts
 *
 * SHARED publish logic for Telegram product publishing.
 *
 * Used by:
 *   • /api/telegram/publish-product  (manual + automatic via auth)
 *   • /api/cron/telegram-auto-publish (Vercel cron, no auth)
 *
 * Centralizes:
 *   • Product eligibility (Vitrina rules via getProductPresentation)
 *   • Message building (buildTelegramProductMessage — same as preview)
 *   • Rotation (prefer never-published, then least-recently-published)
 *   • Telegram API call (sendPhoto with caption, fallback sendMessage)
 *   • History recording (telegram_product_posts)
 *   • Config update (last_publish_at / status / etc.)
 *
 * Critical invariant: this module NEVER shows a price or stock line that
 * Vitrina would hide. The shared getProductPresentation enforces it,
 * regardless of the per-store show_price / show_physical_units settings.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  buildTelegramProductMessage,
  type ProductPresentationInput,
  type TelegramShowPrice,
} from '@/lib/storefront/product-presentation';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// ── Types ────────────────────────────────────────────────────────

export interface PublishContext {
  storeId: string;
  publishType: 'manual' | 'automatic';
  userId?: string | null;
  /** Optional: skip the idempotency check (manual publish always skips). */
  skipIdempotency?: boolean;
  /** Optional: specific product ID to publish (manual "publish this one"). */
  productId?: string;
  /** Optional: override the store's show_price for this call (preview-style). */
  showPriceOverride?: TelegramShowPrice;
  /** Optional: override the store's show_physical_units for this call. */
  showPhysicalUnitsOverride?: boolean;
}

export interface PublishResult {
  success: boolean;
  skipped?: boolean;
  reason?: 'disabled' | 'interval' | 'no_products' | 'not_configured' | 'no_eligible';
  /** Minutes since the last publish (when reason='interval'). */
  minutesSince?: number;
  /** The store's configured interval in minutes (when reason='interval'). */
  intervalMinutes?: number;
  product?: { id: string; name: string };
  telegram_message_id?: number | null;
  chat_title?: string;
  error?: string;
  /** The exact message body that was sent (or would be sent). */
  text: string;
  /** The presentation used — for debugging / preview parity. */
  imageUrl: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────

function makeAdminClient(): SupabaseClient {
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function resolveImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${SUPABASE_URL}/storage/v1/object/public/product-images/${imageUrl}`;
}

/**
 * Fetches vitrina products for the store with all the fields
 * required by getProductPresentation.
 */
async function fetchVitrinaProducts(
  adminClient: SupabaseClient,
  storeId: string,
): Promise<ProductPresentationInput[]> {
  const { data, error } = await adminClient
    .from('products')
    .select(
      'id, name, description, sku, price, price_currency, price_visible, stock_visible, stock_current, on_promotion, unit_of_measure, image_url, public_image_url, is_active, visible_en_tienda',
    )
    .eq('store_id', storeId)
    .eq('is_active', true)
    .eq('visible_en_tienda', true)
    .order('name');

  if (error) throw error;
  return (data || []) as unknown as ProductPresentationInput[];
}

/**
 * Picks the next product to publish following rotation rules:
 *   1. Prefer never-published (random among them).
 *   2. Else, the least-recently-published.
 *   3. Else, the first product.
 */
async function pickProductForRotation(
  adminClient: SupabaseClient,
  storeId: string,
  products: ProductPresentationInput[],
  productIdOverride?: string,
): Promise<ProductPresentationInput | null> {
  if (products.length === 0) return null;

  // Explicit override (manual "publish THIS one")
  if (productIdOverride) {
    const match = products.find((p) => p.id === productIdOverride);
    if (match) return match;
    // If the override is not eligible, fall through to rotation
  }

  // 1. Never-published
  const { data: history } = await adminClient
    .from('telegram_product_posts')
    .select('product_id')
    .eq('store_id', storeId)
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(200);

  const publishedIds = new Set((history || []).map((h: any) => h.product_id));
  const neverPublished = products.filter((p) => !publishedIds.has(p.id));

  if (neverPublished.length > 0) {
    return neverPublished[Math.floor(Math.random() * neverPublished.length)];
  }

  // 2. Least-recently-published
  const { data: leastRecent } = await adminClient
    .from('telegram_product_posts')
    .select('product_id')
    .eq('store_id', storeId)
    .eq('status', 'success')
    .order('created_at', { ascending: true })
    .limit(1);

  if (leastRecent?.length) {
    const match = products.find((p) => p.id === leastRecent[0].product_id);
    if (match) return match;
  }

  // 3. First
  return products[0];
}

/**
 * Sends a message (and optional photo) to the configured Telegram chat.
 * Returns { ok, message_id, chat_title, error }.
 */
async function sendToTelegram(
  botToken: string,
  chatId: string,
  text: string,
  imageUrl: string | null,
): Promise<{
  ok: boolean;
  message_id: number | null;
  chat_title?: string;
  error?: string;
}> {
  const TG_API = `https://api.telegram.org/bot${botToken}`;

  try {
    if (imageUrl) {
      const photoResp = await fetch(`${TG_API}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: imageUrl,
          caption: text,
          parse_mode: 'Markdown',
        }),
      });
      const photoJson = await photoResp.json();
      if (photoJson.ok) {
        return {
          ok: true,
          message_id: photoJson.result?.message_id ?? null,
          chat_title: photoJson.result?.chat?.title,
        };
      }
      // Fallback to sendMessage if photo fails (e.g. image URL not reachable)
    }

    const msgResp = await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
    const msgJson = await msgResp.json();
    if (msgJson.ok) {
      return {
        ok: true,
        message_id: msgJson.result?.message_id ?? null,
        chat_title: msgJson.result?.chat?.title,
      };
    }
    return { ok: false, message_id: null, error: msgJson.description || 'Telegram error' };
  } catch (e: any) {
    return { ok: false, message_id: null, error: e.message };
  }
}

// ── Main entry point ─────────────────────────────────────────────

export async function publishProductToTelegram(
  ctx: PublishContext,
): Promise<PublishResult> {
  const adminClient = makeAdminClient();

  // 1. Load config
  const { data: config, error: configErr } = await adminClient
    .from('telegram_configs')
    .select(
      'bot_token, group_chat_id, auto_publish_enabled, auto_publish_interval_minutes, last_publish_at, show_price, show_physical_units',
    )
    .eq('store_id', ctx.storeId)
    .eq('is_active', true)
    .maybeSingle();

  if (configErr) throw configErr;
  if (!config || !config.bot_token || !config.group_chat_id) {
    return {
      success: false,
      reason: 'not_configured',
      text: '',
      imageUrl: null,
      error: 'Telegram no configurado para esta tienda',
    };
  }

  // 2. Idempotency (automatic only)
  if (ctx.publishType === 'automatic') {
    if (!config.auto_publish_enabled) {
      return { success: false, skipped: true, reason: 'disabled', text: '', imageUrl: null };
    }
    if (config.last_publish_at && !ctx.skipIdempotency) {
      const minutesSince =
        (Date.now() - new Date(config.last_publish_at).getTime()) / 60000;
      // ── Interval is now in MINUTES (migration 20260824000003) ──
      const intervalMinutes: number =
        (config as any).auto_publish_interval_minutes ?? 360;
      if (minutesSince < intervalMinutes) {
        return {
          success: false,
          skipped: true,
          reason: 'interval',
          minutesSince: Math.round(minutesSince * 100) / 100,
          intervalMinutes,
          text: '',
          imageUrl: null,
        };
      }
    }
  }

  // 3. Fetch products + filter eligible (Vitrina rules)
  const products = await fetchVitrinaProducts(adminClient, ctx.storeId);
  if (products.length === 0) {
    await adminClient
      .from('telegram_configs')
      .update({
        last_publish_at: new Date().toISOString(),
        last_publish_status: 'no_products',
        last_publish_error: null,
      })
      .eq('store_id', ctx.storeId);
    return {
      success: false,
      skipped: true,
      reason: 'no_products',
      text: '',
      imageUrl: null,
    };
  }

  // 4. Rotation
  const selected = await pickProductForRotation(
    adminClient,
    ctx.storeId,
    products,
    ctx.productId,
  );
  if (!selected) {
    return {
      success: false,
      skipped: true,
      reason: 'no_eligible',
      text: '',
      imageUrl: null,
    };
  }

  // 5. Build message (single source of truth — also used by preview)
  const showPrice: TelegramShowPrice =
    ctx.showPriceOverride ?? (config.show_price as TelegramShowPrice) ?? 'according_to_storefront';
  const showPhysicalUnits: boolean =
    ctx.showPhysicalUnitsOverride ?? (config.show_physical_units === true);

  const { text, imageUrl: rawImageUrl, presentation } = buildTelegramProductMessage(selected, {
    showPrice,
    showPhysicalUnits,
  });

  const resolvedImageUrl = resolveImageUrl(rawImageUrl);

  // 6. Send to Telegram
  const tgResult = await sendToTelegram(
    config.bot_token,
    String(config.group_chat_id),
    text,
    resolvedImageUrl,
  );

  const status = tgResult.ok ? 'success' : 'failed';
  const errorMsg = tgResult.ok ? null : tgResult.error ?? null;
  const messageId = tgResult.message_id;

  // 7. Record history
  await adminClient.from('telegram_product_posts').insert({
    store_id: ctx.storeId,
    product_id: selected.id,
    product_name: selected.name,
    product_price: presentation.price,
    product_currency: presentation.currency,
    telegram_chat_id: config.group_chat_id,
    telegram_message_id: messageId,
    status,
    error: errorMsg,
    publish_type: ctx.publishType,
    published_by: ctx.userId ?? null,
  });

  await adminClient
    .from('telegram_configs')
    .update({
      last_publish_at: new Date().toISOString(),
      last_product_id: selected.id,
      last_publish_status: status,
      last_publish_error: errorMsg,
    })
    .eq('store_id', ctx.storeId);

  if (status === 'success') {
    return {
      success: true,
      product: { id: selected.id, name: selected.name },
      telegram_message_id: messageId,
      chat_title: tgResult.chat_title,
      text,
      imageUrl: resolvedImageUrl,
    };
  }
  return {
    success: false,
    error: errorMsg ?? 'Unknown error',
    product: { id: selected.id, name: selected.name },
    text,
    imageUrl: resolvedImageUrl,
  };
}

/**
 * Builds a preview WITHOUT sending to Telegram.
 *
 * Given a product ID + the same options as publish, returns the EXACT
 * { text, imageUrl } that the publish endpoint would send.
 *
 * Used by /api/telegram/preview-product.
 */
export async function previewProductMessage(
  storeId: string,
  productId: string,
  options: { showPrice?: TelegramShowPrice; showPhysicalUnits?: boolean },
): Promise<{
  text: string;
  imageUrl: string | null;
  product: { id: string; name: string };
  presentation: ReturnType<typeof buildTelegramProductMessage>['presentation'];
}> {
  const adminClient = makeAdminClient();

  // Load product
  const { data: product, error } = await adminClient
    .from('products')
    .select(
      'id, name, description, sku, price, price_currency, price_visible, stock_visible, stock_current, on_promotion, unit_of_measure, image_url, public_image_url, is_active, visible_en_tienda, store_id',
    )
    .eq('id', productId)
    .maybeSingle();

  if (error) throw error;
  if (!product || product.store_id !== storeId) {
    throw new Error('Producto no encontrado o no pertenece a la tienda');
  }

  // If options not provided, fall back to store config
  let { showPrice, showPhysicalUnits } = options;
  if (!showPrice || !showPhysicalUnits === undefined) {
    const { data: cfg } = await adminClient
      .from('telegram_configs')
      .select('show_price, show_physical_units')
      .eq('store_id', storeId)
      .maybeSingle();
    showPrice = (showPrice || cfg?.show_price || 'according_to_storefront') as TelegramShowPrice;
    if (showPhysicalUnits === undefined) {
      showPhysicalUnits = cfg?.show_physical_units === true;
    }
  }

  const result = buildTelegramProductMessage(product as ProductPresentationInput, {
    showPrice,
    showPhysicalUnits,
  });

  return {
    text: result.text,
    imageUrl: resolveImageUrl(result.imageUrl),
    product: { id: product.id, name: product.name },
    presentation: result.presentation,
  };
}
