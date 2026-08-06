/**
 * Iteración 11.5 — PII sanitizer for OpenTelemetry span attributes
 *
 * Filters sensitive data from span attributes before export.
 * Uses a blacklist of exact keys + regex patterns.
 */

const PII_BLACKLIST = new Set([
  // Personal identifiers
  'customer_name',
  'customer_id',
  'customer_email',
  'customer_phone',
  'email',
  'phone',
  'full_name',
  // Credentials
  'password',
  'token',
  'api_key',
  'secret',
  'authorization',
  'cookie',
  'access_token',
  'refresh_token',
  'session_token',
  // Financial amounts
  'total_amount',
  'cash_amount',
  'transfer_amount',
  'zelle_amount',
  'cost',
  'price',
  'cost_average',
  'declared_cash',
  'declared_vouchers',
  'system_expected_total',
  'difference',
  'final_amount',
  'calculated_amount',
  'amount_cup',
  'amount',
]);

const PII_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
];

export function sanitizeAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(attrs)) {
    const lowerKey = key.toLowerCase();

    if (PII_BLACKLIST.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    if (PII_KEY_PATTERNS.some(pattern => pattern.test(key))) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeAttributes(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === 'object' && item !== null
          ? sanitizeAttributes(item as Record<string, unknown>)
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
