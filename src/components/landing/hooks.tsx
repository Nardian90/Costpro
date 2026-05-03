'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

/* ── Animated Counter Hook ── */
export function useAnimatedCounter(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [completed, setCompleted] = useState(false);

  const start = useCallback(() => {
    if (hasStarted) return;
    setHasStarted(true);
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(animate);
      else setCompleted(true);
    };

    requestAnimationFrame(animate);
  }, [target, duration, hasStarted]);

  return { count, hasStarted, completed, start };
}

/* ── Cookie Consent Hook ──
 *  Uses the centralized consent utility from @/lib/consent.
 *  Communicates with the global CookieConsent component via custom events:
 *    - 'cookie-consent-updated'  → fired after saving/clearing consent
 *    - 'reopen-cookie-consent'   → fired to request the banner re-open
 */
import { shouldShowConsentBanner, saveConsent, clearConsent } from '@/lib/consent';

export function useCookieConsent() {
  const [showCookieBanner, setShowCookieBanner] = useState(() => {
    if (typeof window === 'undefined') return false;
    return false; // Banner managed by global CookieConsent component in layout
  });

  useEffect(() => {
    if (shouldShowConsentBanner()) {
      const timer = setTimeout(() => setShowCookieBanner(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Listen for consent changes made by the global CookieConsent component
  useEffect(() => {
    const handleUpdated = () => setShowCookieBanner(false);
    window.addEventListener('cookie-consent-updated', handleUpdated);
    return () => window.removeEventListener('cookie-consent-updated', handleUpdated);
  }, []);

  const handleAcceptCookies = useCallback(() => {
    saveConsent({ essential: true, analytics: true, functional: true, marketing: true });
    setShowCookieBanner(false);
    window.dispatchEvent(new Event('cookie-consent-updated'));
  }, []);

  const handleRejectCookies = useCallback(() => {
    saveConsent({ essential: true, analytics: false, functional: true, marketing: false });
    setShowCookieBanner(false);
    window.dispatchEvent(new Event('cookie-consent-updated'));
  }, []);

  const handleReopenCookieSettings = useCallback(() => {
    clearConsent();
    setShowCookieBanner(true);
    window.dispatchEvent(new CustomEvent('reopen-cookie-consent'));
  }, []);

  return { showCookieBanner, handleAcceptCookies, handleRejectCookies, handleReopenCookieSettings };
}

/* ── Promo Banner Hook ── */
export function usePromoBanner() {
  const [showPromo, setShowPromo] = useState(false);

  useEffect(() => {
    const dismissed = typeof window !== 'undefined' && localStorage.getItem('costpro-promo-dismissed');
    if (!dismissed) {
      const timer = setTimeout(() => queueMicrotask(() => setShowPromo(true)), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismissPromo = useCallback(() => {
    localStorage.setItem('costpro-promo-dismissed', 'true');
    setShowPromo(false);
  }, []);

  return { showPromo, handleDismissPromo };
}

/* ── Testimonial Auto-Rotation Hook ── */
export function useTestimonialRotation(totalCount: number, intervalMs = 6000) {
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  const [testimonialProgress, setTestimonialProgress] = useState(0);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setTestimonialProgress((prev) => {
        const next = prev + 100 / (intervalMs / 100);
        return next >= 100 ? 0 : next;
      });
    }, 100);
    const rotationInterval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % totalCount);
    }, intervalMs);
    return () => { clearInterval(rotationInterval); clearInterval(progressInterval); };
  }, [totalCount, intervalMs]);

  return { currentTestimonial, setCurrentTestimonial, testimonialProgress, setTestimonialProgress };
}

/* ── Spring-based Animated Counter Component ── */
export function AnimatedStatCounter({ value, prefix, decimals, isVisible }: {
  value: number;
  prefix: string;
  decimals: number;
  isVisible: boolean;
}) {
  const spring = useSpring(0, { stiffness: 100, damping: 30, duration: 2500 });
  const display = useTransform(spring, (latest) => {
    if (decimals > 0) return latest.toFixed(decimals);
    return Math.floor(latest).toLocaleString();
  });

  useEffect(() => {
    if (isVisible) {
      spring.set(value);
    }
  }, [isVisible, value, spring]);

  return (
    <motion.span className="tabular-nums counter-glow">{prefix}<motion.span>{display}</motion.span></motion.span>
  );
}
