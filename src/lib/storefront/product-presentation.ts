/**
 * product-presentation.ts
 *
 * SHARED COMMERCIAL PRESENTATION LAYER — single source of truth.
 *
 * Both Vitrina (public storefront) and Telegram (manual + auto publish)
 * must agree on what commercial info is shown for a product. This module
 * encodes the rules so they cannot diverge.
 *
 * ── VITRINA RULES (extracted from src/app/tienda/[slug]/page.tsx) ──
 *
 *   Eligibility:  is_active === true && visible_en_tienda === true
 *
 *   price:        price_visible === false  →  null
 *                 otherwise                →  p.price ?? 0
 *
 *   currency:     price_currency ?? 'CUP'   (CUP / USD / EUR / MLC)
 *
 *   stock_visible (toggle):  stock_visible !== false  (defaults to true)
 *
 *   inStock:      on_promotion || stock_current > 0
 *
 *   stock_level:  only computed if  !on_promotion && stock_visible !== false && stock_current > 0
 *                 → 'low' (≤5) | 'medium' (≤20) | 'high' (>20) | null
 *
 *   unit_of_measure: ?? 'unidad'
 *
 * ── TELEGRAM LAYER ──
 *
 *   Telegram MAY publish any product Vitrina can show (eligible).
 *   Telegram MUST NOT show commercial info Vitrina has hidden.
 *
 *   show_price = 'according_to_storefront' (default, recommended)
 *              | 'show'    ← still cannot override Vitrina's price_visible=false
 *              | 'hide'    ← always hide
 *
 *   show_physical_units = false (default)
 *                       | true   ← still cannot override Vitrina's stock_visible=false
 *
 *   In other words: Telegram can be MORE restrictive than Vitrina, never LESS.
 *
 * ── INVARIANTS (enforced by getProductPresentation) ──
 *
 *   • price is null if Vitrina would hide it (price_visible === false).
 *   • price is null if price is 0, null, undefined, or NaN (Vitrina treats 0
 *     as "no price" — see formatPrice in catalog-templates/shared/utils.ts).
 *   • stockQuantity is null if stock_visible === false OR stock_current <= 0.
 *   • If Vitrina would render "Consultar" instead of a number, this module
 *     returns price=null so Telegram does the same (no line emitted).
 */

// ── Input type ────────────────────────────────────────────────────

export interface ProductPresentationInput {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  price?: number | null;
  price_currency?: string | null;
  price_visible?: boolean | null;
  stock_visible?: boolean | null;
  stock_current?: number | null;
  on_promotion?: boolean | null;
  unit_of_measure?: string | null;
  image_url?: string | null;
  public_image_url?: string | null;
  is_active?: boolean | null;
  visible_en_tienda?: boolean | null;
}

// ── Output type ───────────────────────────────────────────────────

export interface ProductPresentation {
  /** Eligible = Vitrina would display this product at all. */
  eligible: boolean;

  name: string;
  description: string | null;
  sku: string | null;

  /** Resolved image URL (first non-null of image_url / public_image_url). */
  imageUrl: string | null;

  // ── Price (Vitrina rules) ──
  /** True iff Vitrina would show a numeric price (not "Consultar"). */
  priceVisible: boolean;
  /** Numeric price, or null if Vitrina would hide / has no price. */
  price: number | null;
  /** Normalized currency code (CUP / USD / EUR / MLC). */
  currency: string;
  /** Human-readable "69,900.00 CUP" or null. */
  formattedPrice: string | null;

  // ── Stock (Vitrina rules) ──
  /** True iff Vitrina would show stock info at all. */
  stockVisible: boolean;
  /** inStock = on_promotion || stock_current > 0. */
  inStock: boolean;
  /** 'low' | 'medium' | 'high' | null — matches Vitrina's stock_level. */
  stockLevel: 'low' | 'medium' | 'high' | null;
  /** Numeric stock, or null if Vitrina would hide / 0 / negative / NaN. */
  stockQuantity: number | null;
  /** Unit of measure (defaults to 'unidad'). */
  unitOfMeasure: string;
}

// ── Constants ──────────────────────────────────────────────────────

const VALID_CURRENCIES = ['CUP', 'USD', 'EUR', 'MLC'] as const;
type ValidCurrency = (typeof VALID_CURRENCIES)[number];

const DEFAULT_CURRENCY: ValidCurrency = 'CUP';
const DEFAULT_UNIT = 'unidad';

// ── Helpers ───────────────────────────────────────────────────────

function normalizeCurrency(c: string | null | undefined): ValidCurrency {
  if (c && (VALID_CURRENCIES as readonly string[]).includes(c)) return c as ValidCurrency;
  return DEFAULT_CURRENCY;
}

function normalizeUnit(u: string | null | undefined): string {
  return u && u.trim() ? u.trim() : DEFAULT_UNIT;
}

function isPositiveNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function toBool(v: unknown, defaultValue: boolean): boolean {
  if (v === true || v === false) return v;
  if (v == null) return defaultValue;
  return defaultValue;
}

/**
 * Formats a positive number using es-CU locale with 2 decimals, then
 * appends the currency code. This matches Vitrina's visual output
 * (formatAmount + CURRENCY_STYLES label).
 *
 * Examples:
 *   formatPriceText(69900, 'CUP')  → '69,900.00 CUP'
 *   formatPriceText(35, 'USD')     → '35.00 USD'
 *   formatPriceText(null, _)       → null  (Vitrina shows "Consultar")
 */
export function formatPriceText(
  price: number | null,
  currency: string = DEFAULT_CURRENCY,
): string | null {
  if (!isPositiveNumber(price)) return null;
  const cur = normalizeCurrency(currency);
  const amount = new Intl.NumberFormat('es-CU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
  return `${amount} ${cur}`;
}

// ── Core: getProductPresentation ───────────────────────────────────

/**
 * Determines what commercial info Vitrina would show for a product.
 *
 * This is the SINGLE SOURCE OF TRUTH. Both Vitrina (when refactored) and
 * Telegram MUST consume this function so they cannot disagree.
 *
 * Pre-condition: the input should already be a row from the products table.
 * Post-condition: every field is safe to send to a public client (Telegram,
 * storefront). Sensitive data (cost_price, precio_empresa, etc.) is
 * deliberately NOT included in the input type.
 */
export function getProductPresentation(
  product: ProductPresentationInput,
): ProductPresentation {
  // ── Eligibility ──
  const isActive = toBool(product.is_active, false);
  const isVisible = toBool(product.visible_en_tienda, false);
  const eligible = isActive && isVisible;

  // ── Currency + unit (always resolved, even if hidden) ──
  const currency = normalizeCurrency(product.price_currency);
  const unitOfMeasure = normalizeUnit(product.unit_of_measure);

  // ── Price (Vitrina rule) ──
  // price_visible === false → null  (override)
  // price not a positive number → null  (Vitrina treats 0/null as "no price")
  const priceVisibleFlag = toBool(product.price_visible, true);
  const rawPrice = typeof product.price === 'number' ? product.price : null;
  const price =
    priceVisibleFlag && isPositiveNumber(rawPrice) ? (rawPrice as number) : null;
  const priceVisible = price !== null;
  const formattedPrice = formatPriceText(price, currency);

  // ── Stock ──
  const stockVisibleFlag = toBool(product.stock_visible, true);
  const onPromotion = toBool(product.on_promotion, false);
  const rawStock =
    typeof product.stock_current === 'number' ? product.stock_current : null;
  const stockQuantity =
    stockVisibleFlag && isPositiveNumber(rawStock) ? (rawStock as number) : null;

  // inStock matches Vitrina: on_promotion || stock_current > 0
  const inStock = onPromotion || (rawStock != null && rawStock > 0);

  // stock_level matches Vitrina: only if !on_promotion && stock_visible && > 0
  let stockLevel: 'low' | 'medium' | 'high' | null = null;
  if (!onPromotion && stockVisibleFlag && isPositiveNumber(rawStock)) {
    if (rawStock <= 5) stockLevel = 'low';
    else if (rawStock <= 20) stockLevel = 'medium';
    else stockLevel = 'high';
  }

  return {
    eligible,
    name: product.name ?? '',
    description: product.description ?? null,
    sku: product.sku ?? null,
    imageUrl: product.image_url || product.public_image_url || null,
    priceVisible,
    price,
    currency,
    formattedPrice,
    stockVisible: stockVisibleFlag,
    inStock,
    stockLevel,
    stockQuantity,
    unitOfMeasure,
  };
}

// ── Telegram-specific formatter ────────────────────────────────────

export type TelegramShowPrice = 'according_to_storefront' | 'show' | 'hide';

export interface TelegramMessageOptions {
  showPrice?: TelegramShowPrice;
  showPhysicalUnits?: boolean;
}

export interface TelegramMessageResult {
  /** Markdown-ready plain text (Markdown parse_mode). */
  text: string;
  /** Resolved image URL or null (used by sendPhoto vs sendMessage). */
  imageUrl: string | null;
  /** The presentation used to build the message — for debugging / preview. */
  presentation: ProductPresentation;
}

/**
 * buildTelegramProductMessage
 *
 * Builds the EXACT same message body that:
 *   • the live preview shows in TelegramConfigView
 *   • the manual publish button sends to Telegram
 *   • the automatic cron job sends to Telegram
 *
 * Critical: this function NEVER shows a price line when Vitrina would hide it,
 * regardless of `showPrice: 'show'`. The 'show' option can only OVERRIDE in
 * the restrictive direction (force hide even when Vitrina shows).
 *
 * Logic table:
 *
 *   Vitrina shows price?  showPrice        →  price line?
 *   ─────────────────────────────────────────────────────
 *   yes                   'according_to_storefront'  →  yes
 *   yes                   'show'                     →  yes
 *   yes                   'hide'                     →  no
 *   no                    'according_to_storefront'  →  no
 *   no                    'show'                     →  no  (CANNOT override)
 *   no                    'hide'                     →  no
 *
 * Same for physical units:
 *
 *   Vitrina shows stock?  showPhysicalUnits  →  units line?
 *   ──────────────────────────────────────────────────────
 *   yes                   true               →  yes (if stock > 0)
 *   yes                   false              →  no
 *   no                    true               →  no  (CANNOT override)
 *   no                    false              →  no
 */
export function buildTelegramProductMessage(
  product: ProductPresentationInput,
  options: TelegramMessageOptions = {},
): TelegramMessageResult {
  const presentation = getProductPresentation(product);

  const showPriceOpt: TelegramShowPrice = options.showPrice ?? 'according_to_storefront';
  const showUnitsOpt = options.showPhysicalUnits === true;

  // Price: respect Vitrina. 'show' can never reveal a hidden price.
  const showPriceLine =
    presentation.priceVisible &&
    presentation.formattedPrice !== null &&
    showPriceOpt !== 'hide';

  // Units: respect Vitrina. 'true' can never reveal hidden stock.
  const showUnitsLine =
    presentation.stockVisible &&
    presentation.stockQuantity !== null &&
    presentation.stockQuantity > 0 &&
    showUnitsOpt;

  // ── Build text (Markdown parse_mode) ──
  // Format follows the spec in the user's instructions:
  //
  //   🛍️ *Producto destacado*
  //
  //   *Panel Solar X*
  //
  //   Descripción real del producto.
  //
  //   💰 *69,900.00 CUP*
  //
  //   📦 *Disponibles: 12 unidades*
  //
  //   👉 Disponible en nuestra tienda

  const lines: string[] = [];

  lines.push('\u{1F6CD}\u{FE0F} *Producto destacado*');
  lines.push('');

  // Product name (escape special Markdown chars)
  lines.push(`*${escapeMarkdown(presentation.name || 'Producto')}*`);

  // Description (optional, trimmed, capped at 300 chars to fit Telegram caption limits)
  if (presentation.description && presentation.description.trim()) {
    lines.push('');
    const desc = truncate(presentation.description.trim(), 300);
    lines.push(escapeMarkdown(desc));
  }

  if (showPriceLine && presentation.formattedPrice) {
    lines.push('');
    lines.push(`\u{1F4B0} *${escapeMarkdown(presentation.formattedPrice)}*`);
  }

  if (showUnitsLine && presentation.stockQuantity !== null) {
    lines.push('');
    const unitLabel = pluralizeUnit(presentation.unitOfMeasure, presentation.stockQuantity);
    lines.push(
      `\u{1F4E6} *Disponibles: ${presentation.stockQuantity} ${escapeMarkdown(unitLabel)}*`,
    );
  }

  lines.push('');
  lines.push('\u{1F449} Disponible en nuestra tienda');

  return {
    text: lines.join('\n'),
    imageUrl: presentation.imageUrl,
    presentation,
  };
}

// ── Internal helpers (string escaping for Telegram Markdown) ──────

/**
 * Escapes characters that have special meaning in Telegram Markdown parse_mode.
 *
 * Telegram Markdown treats the following as markup:
 *   *  bold         _  italic     `  code     [text](url)
 *
 * We only escape `*` `_` `[` to avoid breaking the message.
 * (We deliberately use plain Markdown, not MarkdownV2 — that requires
 *  escaping more chars and complicates the preview.)
 */
function escapeMarkdown(s: string): string {
  return s.replace(/([*_`\[])/g, '\\$1');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '\u2026';
}

/**
 * Pluralizes a Spanish unit label for a quantity.
 *
 *   pluralizeUnit('unidad', 12) → 'unidades'
 *   pluralizeUnit('unidad', 1)  → 'unidad'
 *   pluralizeUnit('caja',    5) → 'cajas'
 *   pluralizeUnit('caja',    1) → 'caja'
 *   pluralizeUnit('litro',   3) → 'litros'
 *   pluralizeUnit('kg',      8) → 'kg'   (kg does not pluralize)
 *
 * Handles the most common Spanish pluralization rules:
 *   • words ending in 'dad' → 'dades' (unidad → unidades)
 *   • words ending in vowel or 'n' → +s (caja → cajas, botellón → botellones? no, that'són → ones)
 *   • words ending in 's' → unchanged
 *   • units like kg/g/ml/l/m/cm/mm/km → never pluralize
 *
 * Unknown units fall through unchanged — we never invent units.
 */
function pluralizeUnit(unit: string, qty: number): string {
  const u = unit.trim().toLowerCase();
  if (qty === 1) return unit;

  // Units that don't pluralize
  const NO_PLURAL = new Set(['kg', 'g', 'ml', 'l', 'm', 'cm', 'mm', 'km']);
  if (NO_PLURAL.has(u)) return unit;

  // Already plural
  if (u.endsWith('s')) return unit;

  // Words ending in 'dad' → replace final 'd' with 'des' (unidad → unidades, variedad → variedades)
  if (u.endsWith('dad')) return unit.slice(0, -1) + 'des';

  // Words ending in 'z' → 'ces' (lápiz → lápices — rare for units)
  if (u.endsWith('z')) return unit.slice(0, -1) + 'ces';

  // Words ending in 'ón' → 'ones' (botellón → botellones)
  if (u.endsWith('ón')) return unit.slice(0, -2) + 'ones';
  if (u.endsWith('on')) return unit.slice(0, -2) + 'ones';

  // Special cases
  if (u === 'litro') return 'litros';
  if (u === 'kilo') return 'kilos';

  // Default Spanish plural: add 's'
  return unit + 's';
}

// ── Validation helpers for API layers ─────────────────────────────

export const TELEGRAM_SHOW_PRICE_VALUES: readonly TelegramShowPrice[] = [
  'according_to_storefront',
  'show',
  'hide',
] as const;

export function isValidShowPrice(v: unknown): v is TelegramShowPrice {
  return typeof v === 'string' && (TELEGRAM_SHOW_PRICE_VALUES as readonly string[]).includes(v);
}
