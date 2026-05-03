/**
 * Cookie consent management utility.
 * GDPR Art. 6(1)(a) — Lawful basis: consent.
 * Stores consent preferences in localStorage with timestamp.
 */

export type CookieCategory = 'essential' | 'analytics' | 'functional' | 'marketing';

export interface ConsentPreferences {
  essential: boolean;    // Always true (required for app to function)
  analytics: boolean;    // Usage tracking, performance monitoring
  functional: boolean;   // Preferences, themes, language
  marketing: boolean;    // Third-party tracking, ads
  timestamp: string;     // ISO 8601 when consent was given
  version: string;       // Consent policy version
}

const CONSENT_KEY = 'costpro_cookie_consent';
const CONSENT_VERSION = '1.0';
const CONSENT_MAX_AGE_DAYS = 365;

const DEFAULT_CONSENT: ConsentPreferences = {
  essential: true,
  analytics: false,
  functional: true,
  marketing: false,
  timestamp: new Date().toISOString(),
  version: CONSENT_VERSION,
};

/**
 * Get current consent preferences. Returns null if no consent given.
 */
export function getConsent(): ConsentPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as ConsentPreferences;

    // Check if consent is expired (> max age)
    const consentDate = new Date(parsed.timestamp);
    const now = new Date();
    const daysSinceConsent = (now.getTime() - consentDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceConsent > CONSENT_MAX_AGE_DAYS) return null;

    // Check if consent version is outdated
    if (parsed.version !== CONSENT_VERSION) return null;

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Check if user has given consent for a specific category.
 * Essential cookies are always allowed.
 */
export function hasConsent(category: CookieCategory): boolean {
  if (category === 'essential') return true;
  const consent = getConsent();
  return consent?.[category] ?? false;
}

/**
 * Save user consent preferences.
 */
export function saveConsent(preferences: Omit<ConsentPreferences, 'timestamp' | 'version'>): ConsentPreferences {
  const fullConsent: ConsentPreferences = {
    ...preferences,
    essential: true, // Can never be disabled
    timestamp: new Date().toISOString(),
    version: CONSENT_VERSION,
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(fullConsent));
  }

  return fullConsent;
}

/**
 * Withdraw all optional consent. Essential cookies remain.
 */
export function withdrawConsent(): ConsentPreferences {
  return saveConsent({
    essential: true,
    analytics: false,
    functional: true, // Theme preference is essential UX
    marketing: false,
  });
}

/**
 * Completely clear stored consent (used to re-show the banner).
 */
export function clearConsent(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CONSENT_KEY);
  }
}

/**
 * Check if consent banner should be shown.
 */
export function shouldShowConsentBanner(): boolean {
  return getConsent() === null;
}
