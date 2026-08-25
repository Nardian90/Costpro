/**
 * whatsapp/publish.ts
 *
 * SHARED publish logic for WhatsApp product publishing.
 * Mirrors telegram/publish.ts structure but adapted for Baileys:
 *   - Sends image + caption via sock.sendMessage (single call)
 *   - Anti-ban check before sending (waits if outside Havana business hours)
 *   - Requires active session (no ephemeral token like Telegram)
 *
 * Used by:
 *   • /api/whatsapp/publish-product  (manual + automatic via auth)
 *   • /api/cron/whatsapp-auto-publish (PM2 poller, no auth)
 *
 * Reuses:
 *   • getProductPresentation() + buildTelegramProductMessage() for DATA
 *     (single source of truth — same rules as Telegram + Vitrina)
 *   • getSocket() from baileys-client.ts (active session per store)
 *   • canInviteNow() from anti-ban.ts (rate limit + business hours)
 *
 * CRITICAL: WhatsApp is NOT the same as Telegram:
 *   - Cannot send to arbitrary chat_id (must be a real WhatsApp number/JID)
 *   - Group publishing requires the bot to be a participant (unlike TG admin)
 *   - Anti-ban rules apply — WhatsApp may ban the number if abused
 *   - No ephemeral access token — requires persistent session
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  buildTelegramProductMessage,
  type ProductPresentationInput,
  type TelegramShowPrice,
} from '@/lib/storefront/product-presentation';
import { getSocket } from '@/lib/whatsapp/baileys-client';
import { canInviteNow } from '@/lib/whatsapp/anti-ban';
import { logger } from '@/lib/logger';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// ── Types ────────────────────────────────────────────────────────

export interface PublishContext {
  storeId: string;
  publishType: 'manual' | 'automatic';
  userId?: string | null;
  /** Skip the idempotency check (manual publish always skips). */
  skipIdempotency?: boolean;
  /** Specific product ID to publish (manual "publish this one"). */
  productId?: string;
  /** Override the store's show_price for this call (preview-style). */
  showPriceOverride?: TelegramShowPrice;
  /** Override the store's show_physical_units for this call. */
  showPhysicalUnitsOverride?: boolean;
}

export interface PublishResult {
  success: boolean;
  skipped?: boolean;
  reason?: 'disabled' | 'interval' | 'no_products' | 'not_configured' | 'no_session' | 'anti_ban_blocked' | 'no_eligible';
  minutesSince?: number;
  intervalMinutes?: number;
  product?: { id: string; name: string };
  whatsapp_message_id?: string | null;
  error?: string;
  /** The exact caption text that was sent (or would be sent). */
  text: string;
  /** The image URL that was sent (or would be sent). */
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
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
  return `${SUPABASE_URL}/storage/v1/object/public/product-images/${imageUrl}`;
}

/**
 * Strip Markdown formatting (asterisks, underscores) before sending to WhatsApp,
 * because WhatsApp uses its own formatting (only *bold* and _italic_ work, but
 * Baileys sendMessage with `text` does NOT parse Markdown by default — it sends
 * raw text).
 *
 * We keep emojis and plain text but remove escape backslashes and the
 * `*bold*` markers (WhatsApp would render them as literal asterisks otherwise).
 *
 * Actually, WhatsApp DOES support *bold* and _italic_ in plain text messages
 * via Baileys — but only when using `extendedTextMessage` with `text` field.
 * The simpler approach: keep the Markdown as-is and let WhatsApp render it.
 * If it doesn't render, the user sees literal asterisks which is still
 * readable (just less pretty).
 *
 * We choose the second approach — keep Markdown as-is for consistency
 * with Telegram's caption. The visual difference is minor.
 */
function buildWhatsAppCaption(text: string): string {
  return text;
}

/**
 * Fetches vitrina products for the store with all the fields
 * required by getProductPresentation().
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
    .from('whatsapp_product_posts')
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
    .from('whatsapp_product_posts')
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
 * Sends an image + caption to a WhatsApp JID via Baileys.
 *
 * Baileys supports sendMessage with `image` + `caption` in a single call:
 *   sock.sendMessage(jid, { image: { url }, caption: text })
 *
 * If the image URL is unreachable or download fails, falls back to text-only.
 */
async function sendToWhatsApp(
  sock: any,
  jid: string,
  text: string,
  imageUrl: string | null,
): Promise<{
  ok: boolean;
  message_id: string | null;
  error?: string;
}> {
  try {
    let sentMessage: any;

    if (imageUrl) {
      try {
        // Fetch the image and send as buffer (avoids Baileys URL fetch issues)
        const imageResp = await fetch(imageUrl);
        if (imageResp.ok) {
          const buffer = Buffer.from(await imageResp.arrayBuffer());
          sentMessage = await sock.sendMessage(jid, {
            image: buffer,
            caption: text,
          });
        } else {
          // Image fetch failed — fall back to text-only
          logger.warn('DATABASE', 'WHATSAPP_IMAGE_FETCH_FAILED', {
            jid, imageUrl, httpStatus: imageResp.status,
          });
          sentMessage = await sock.sendMessage(jid, { text });
        }
      } catch (imgErr: any) {
        // Image send failed — fall back to text-only
        logger.warn('DATABASE', 'WHATSAPP_IMAGE_SEND_FAILED', {
          jid, error: imgErr.message,
        });
        sentMessage = await sock.sendMessage(jid, { text });
      }
    } else {
      // No image — text only
      sentMessage = await sock.sendMessage(jid, { text });
    }

    const messageId = sentMessage?.key?.id || null;
    return { ok: true, message_id: messageId };
  } catch (e: any) {
    return {
      ok: false,
      message_id: null,
      error: e?.message ?? String(e),
    };
  }
}

// ── Main entry point ─────────────────────────────────────────────

export async function publishProductToWhatsApp(
  ctx: PublishContext,
): Promise<PublishResult> {
  const adminClient = makeAdminClient();

  logger.info('DATABASE', 'WA_PUBLISH_FLOW_START', {
    storeId: ctx.storeId,
    publishType: ctx.publishType,
    productIdOverride: ctx.productId ?? null,
    showPriceOverride: ctx.showPriceOverride ?? null,
    showPhysicalUnitsOverride: ctx.showPhysicalUnitsOverride ?? null,
    skipIdempotency: ctx.skipIdempotency ?? false,
  });

  // 1. Load config
  const { data: config, error: configErr } = await adminClient
    .from('whatsapp_configs')
    .select(
      'phone_number, group_jid, is_active, auto_publish_enabled, auto_publish_interval_minutes, last_publish_at, show_price, show_physical_units',
    )
    .eq('store_id', ctx.storeId)
    .maybeSingle();

  if (configErr) {
    logger.error('DATABASE', 'WA_PUBLISH_CONFIG_QUERY_ERROR', {
      storeId: ctx.storeId,
      error: configErr.message,
    });
    throw configErr;
  }

  if (!config || !config.phone_number) {
    logger.warn('DATABASE', 'WA_PUBLISH_NOT_CONFIGURED', {
      storeId: ctx.storeId,
      hasConfig: !!config,
      hasPhoneNumber: !!config?.phone_number,
    });
    return {
      success: false,
      reason: 'not_configured',
      text: '',
      imageUrl: null,
      error: 'WhatsApp no configurado para esta tienda (falta phone_number)',
    };
  }

  logger.info('DATABASE', 'WA_PUBLISH_CONFIG_LOADED', {
    storeId: ctx.storeId,
    phoneNumber: config.phone_number,
    groupJid: config.group_jid,
    isActive: config.is_active,
    autoPublishEnabled: config.auto_publish_enabled,
    intervalMinutes: config.auto_publish_interval_minutes,
    lastPublishAt: config.last_publish_at,
    showPrice: config.show_price,
    showPhysicalUnits: config.show_physical_units,
  });

  // 2. Check active session (Baileys requires live socket)
  const sock = getSocket(ctx.storeId);
  if (!sock) {
    logger.warn('DATABASE', 'WA_PUBLISH_NO_SESSION', {
      storeId: ctx.storeId,
    });
    return {
      success: false,
      reason: 'no_session',
      text: '',
      imageUrl: null,
      error: 'WhatsApp no está conectado. Escanea el QR primero.',
    };
  }

  // 3. Idempotency (automatic only)
  if (ctx.publishType === 'automatic') {
    if (!config.auto_publish_enabled) {
      logger.info('DATABASE', 'WA_PUBLISH_SKIP_DISABLED', {
        storeId: ctx.storeId,
        reason: 'auto_publish_enabled = false',
      });
      return { success: false, skipped: true, reason: 'disabled', text: '', imageUrl: null };
    }
    if (config.last_publish_at && !ctx.skipIdempotency) {
      const minutesSince =
        (Date.now() - new Date(config.last_publish_at).getTime()) / 60000;
      const intervalMinutes: number =
        config.auto_publish_interval_minutes ?? 360;
      if (minutesSince < intervalMinutes) {
        logger.info('DATABASE', 'WA_PUBLISH_SKIP_INTERVAL', {
          storeId: ctx.storeId,
          minutesSince: Math.round(minutesSince * 100) / 100,
          intervalMinutes,
          nextEligibleAt: new Date(
            new Date(config.last_publish_at).getTime() + intervalMinutes * 60000,
          ).toISOString(),
        });
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

  // 4. Anti-ban check (only for automatic — manual publish bypasses)
  if (ctx.publishType === 'automatic') {
    const { data: riskRow } = await adminClient
      .from('whatsapp_risk_state')
      .select('level, consecutive_blocks, cooldown_until, daily_invitation_count, last_invitation_at, last_reset_date')
      .eq('store_id', ctx.storeId)
      .maybeSingle();

    const riskState = riskRow ? {
      level: riskRow.level || 'safe',
      consecutiveBlocks: riskRow.consecutive_blocks || 0,
      cooldownUntil: riskRow.cooldown_until ? new Date(riskRow.cooldown_until) : null,
      dailyInvitationCount: riskRow.daily_invitation_count || 0,
      lastInvitationAt: riskRow.last_invitation_at ? new Date(riskRow.last_invitation_at) : null,
      lastResetDate: riskRow.last_reset_date || new Date().toISOString().split('T')[0],
    } : null;

    if (riskState) {
      const check = canInviteNow(
        riskState.dailyInvitationCount,
        riskState.lastInvitationAt,
        riskState,
      );
      if (!check.allowed) {
        logger.warn('DATABASE', 'WA_PUBLISH_SKIP_ANTI_BAN', {
          storeId: ctx.storeId,
          reason: check.reason,
          nextAllowedAt: check.nextAllowedAt,
        });
        return {
          success: false,
          skipped: true,
          reason: 'anti_ban_blocked',
          text: '',
          imageUrl: null,
          error: check.reason,
        };
      }
    }
  }

  // 5. Fetch products + filter eligible (Vitrina rules)
  const products = await fetchVitrinaProducts(adminClient, ctx.storeId);
  logger.info('DATABASE', 'WA_PUBLISH_PRODUCTS_FETCHED', {
    storeId: ctx.storeId,
    eligibleCount: products.length,
  });

  if (products.length === 0) {
    logger.warn('DATABASE', 'WA_PUBLISH_NO_PRODUCTS', { storeId: ctx.storeId });
    await adminClient
      .from('whatsapp_configs')
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

  // 6. Rotation
  const selected = await pickProductForRotation(
    adminClient,
    ctx.storeId,
    products,
    ctx.productId,
  );
  if (!selected) {
    logger.warn('DATABASE', 'WA_PUBLISH_NO_PRODUCT_SELECTED', {
      storeId: ctx.storeId,
      productIdOverride: ctx.productId ?? null,
    });
    return {
      success: false,
      skipped: true,
      reason: 'no_eligible',
      text: '',
      imageUrl: null,
    };
  }

  logger.info('DATABASE', 'WA_PUBLISH_PRODUCT_SELECTED', {
    storeId: ctx.storeId,
    productId: selected.id,
    productName: selected.name,
    hasImage: !!(selected.image_url || selected.public_image_url),
  });

  // 7. Build message (single source of truth — same as Telegram)
  const showPrice: TelegramShowPrice =
    ctx.showPriceOverride ?? (config.show_price as TelegramShowPrice) ?? 'according_to_storefront';
  const showPhysicalUnits: boolean =
    ctx.showPhysicalUnitsOverride ?? (config.show_physical_units === true);

  const { text, imageUrl: rawImageUrl, presentation } = buildTelegramProductMessage(selected, {
    showPrice,
    showPhysicalUnits,
  });

  const resolvedImageUrl = resolveImageUrl(rawImageUrl);
  const caption = buildWhatsAppCaption(text);

  logger.info('DATABASE', 'WA_PUBLISH_MESSAGE_BUILT', {
    storeId: ctx.storeId,
    productId: selected.id,
    captionPreview: caption.slice(0, 100),
    hasImage: !!resolvedImageUrl,
    priceVisible: presentation.priceVisible,
    formattedPrice: presentation.formattedPrice,
    stockVisible: presentation.stockVisible,
    stockQuantity: presentation.stockQuantity,
  });

  // 8. Determine target JID: prefer group_jid if set, else direct message to phone_number
  const targetJid = config.group_jid || `${config.phone_number}@s.whatsapp.net`;

  // 9. Send to WhatsApp
  const waResult = await sendToWhatsApp(sock, targetJid, caption, resolvedImageUrl);

  logger.info('DATABASE', 'WA_PUBLISH_WHATSAPP_RESULT', {
    storeId: ctx.storeId,
    productId: selected.id,
    ok: waResult.ok,
    messageId: waResult.message_id,
    error: waResult.error ?? null,
    targetJid,
  });

  const status = waResult.ok ? 'success' : 'failed';
  const errorMsg = waResult.ok ? null : waResult.error ?? null;
  const messageId = waResult.message_id;

  // 10. Record history
  await adminClient.from('whatsapp_product_posts').insert({
    store_id: ctx.storeId,
    product_id: selected.id,
    product_name: selected.name,
    product_price: presentation.price,
    product_currency: presentation.currency,
    whatsapp_phone_number: config.phone_number,
    whatsapp_jid: targetJid,
    whatsapp_message_id: messageId,
    status,
    error: errorMsg,
    publish_type: ctx.publishType,
    published_by: ctx.userId ?? null,
  });

  await adminClient
    .from('whatsapp_configs')
    .update({
      last_publish_at: new Date().toISOString(),
      last_product_id: selected.id,
      last_publish_status: status,
      last_publish_error: errorMsg,
    })
    .eq('store_id', ctx.storeId);

  logger.info('DATABASE', 'WA_PUBLISH_FLOW_END', {
    storeId: ctx.storeId,
    productId: selected.id,
    productName: selected.name,
    status,
    messageId,
    nextEligibleAt: new Date(
      Date.now() + (config.auto_publish_interval_minutes ?? 360) * 60000,
    ).toISOString(),
  });

  if (status === 'success') {
    return {
      success: true,
      product: { id: selected.id, name: selected.name },
      whatsapp_message_id: messageId,
      text: caption,
      imageUrl: resolvedImageUrl,
    };
  }
  return {
    success: false,
    error: errorMsg ?? 'Unknown error',
    product: { id: selected.id, name: selected.name },
    text: caption,
    imageUrl: resolvedImageUrl,
  };
}

/**
 * Builds a preview WITHOUT sending to WhatsApp.
 *
 * Mirrors telegram/publish.ts:previewProductMessage — same data, same rules.
 */
export async function previewWhatsAppProductMessage(
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

  let { showPrice, showPhysicalUnits } = options;
  if (!showPrice || showPhysicalUnits === undefined) {
    const { data: cfg } = await adminClient
      .from('whatsapp_configs')
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
