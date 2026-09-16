'use client';
import { logger } from '@/lib/logger';

import { useState, useEffect, Suspense, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { ViewLoadingSplash } from '@/components/ui/ViewLoadingSplash';
import { useTranslations } from 'next-intl';
import { safeReturnTo } from '@/lib/navigation';

// ── Lazy-loaded to reduce initial compilation memory ──
const CyberShell = dynamic(() => import('@/components/ui/CyberShell'), { ssr: false });
const TerminalShell = dynamic(() => import('@/components/views/TerminalShell'), { ssr: false });
const LandingPage = dynamic(() => import('./LandingPage'), { ssr: false });

/* ── Auth-aware page with independent splash ──
 *
 * FIX-SEO (2026-07-04): Esta lógica se movió desde page.tsx a HomePageClient.tsx
 * para que page.tsx pueda ser un Server Component (sin 'use client') y Google
 * pueda indexar el contenido SEO. El <noscript> en page.tsx sirve como fallback
 * para buscadores, y este componente cliente carga la app interactiva.
 */
export default function HomePageClient() {
  const { user, status } = useAuthStore();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [splashDismissed, setSplashDismissed] = useState(false);
  const t = useTranslations('splash');

  // FC ACCESS FLOW FIX (2026-09-16): cuando la autenticación se resuelve con un
  // returnTo válido en la URL (p. ej. vuelta de Google OAuth hacia /?returnTo=%2Ffc%2F),
  // navegar a la superficie solicitada. returnTo es SOLO navegación con allowlist
  // (safeReturnTo en src/lib/navigation.ts); la autorización real sigue siendo la
  // sesión COSTPRO + RLS. Los params se limpian para evitar re-navegaciones.
  useEffect(() => {
    if (!isReady || !isAuthenticated) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const rt = safeReturnTo(sp.get('returnTo'));
      if (rt !== '/') {
        window.history.replaceState({}, '', window.location.pathname);
        router.replace(rt);
      }
    } catch {
      /* noop */
    }
  }, [isReady, isAuthenticated, router]);

  // Listen for splash dismiss event from CostProLoader
  useEffect(() => {
    const handleSplashDismiss = () => setSplashDismissed(true);
    window.addEventListener('costpro:skip-splash', handleSplashDismiss);
    return () => window.removeEventListener('costpro:skip-splash', handleSplashDismiss);
  }, []);

  useEffect(() => {
    // FIX-CSP (2026-07-13): removed DIAG console.logs — they were debug-only
    // and cluttered the console. The auth flow is now well-tested.
    const unsub = useAuthStore.subscribe((state) => {
      if (!state.loading) {
        setIsReady(true);
        setIsAuthenticated(!!state.user && state.status !== 'unauthenticated');
      }
    });

    const timer = setTimeout(() => {
      const state = useAuthStore.getState();
      if (state.loading) {
        logger.warn('DATABASE', '[HOMEPAGE]_AUTH_CHECK_TIMEOUT,_FORCING_READY_STATE')
        useAuthStore.getState().setLoading(false);
        useAuthStore.getState().setStatus('unauthenticated');
        setIsReady(true);
        setIsAuthenticated(false);
      }
    }, 5000);

    const currentState = useAuthStore.getState();
    if (!currentState.loading) {
      queueMicrotask(() => {
        setIsReady(true);
        setIsAuthenticated(!!useAuthStore.getState().user && useAuthStore.getState().status !== 'unauthenticated');
      });
    }

    return () => { clearTimeout(timer); unsub(); };
  }, []);

  // While splash is showing, render full-screen splash
  // CostProLoader handles its own auto-dismiss (first visit ~3.5s, returning ~500ms)
  if (!splashDismissed) {
    return (
      <CostProLoader fullScreen text={t('main')} subtext={t('initializing')} />
    );
  }

  const showLogin = !isReady || !isAuthenticated;

  if (showLogin) {
    return (
      <Suspense fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-background">
          <ViewLoadingSplash label={t('main')} showTips={false} />
        </div>
      }>
        <LandingPage />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <ViewLoadingSplash label={t('main')} showTips={false} />
      </div>
    }>
      <CyberShell>
        <TerminalShell />
      </CyberShell>
    </Suspense>
  );
}
