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
// INC-20261030: sesión local (sb-*-auth-token) presente → un backend de auth
// caído no debe rebotar al usuario al landing durante el reintento escalado.
import { hasCostproSession } from '@/lib/fcEntry';

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

    const forceUnauthenticated = () => {
      logger.warn('DATABASE', '[HOMEPAGE]_AUTH_CHECK_TIMEOUT,_FORCING_READY_STATE');
      useAuthStore.getState().setLoading(false);
      useAuthStore.getState().setStatus('unauthenticated');
      setIsReady(true);
      setIsAuthenticated(false);
    };

    const timer = setTimeout(() => {
      const state = useAuthStore.getState();
      if (state.loading) {
        // INC-20261030: con sesión local preservada, el check de sesión puede estar
        // reintentando contra un GoTrue caído — NO forzar 'unauthenticated' a los
        // 5s (era el rebote masivo al landing del incidente). El failsafe absoluto
        // de abajo acota el caso de un outage prolongado.
        if (hasCostproSession()) return;
        forceUnauthenticated();
      }
    }, 5000);

    // INC-20261030: failsafe absoluto — el landing nunca queda colgado más de 25s
    // esperando la resolución de la sesión, con o sin outage del backend.
    const absoluteTimer = setTimeout(() => {
      const state = useAuthStore.getState();
      if (state.loading) forceUnauthenticated();
    }, 25000);

    // Store ya resuelto al montar (remount / hidratación tardía): no esperar a
    // una notificación futura del subscribe.
    const currentState = useAuthStore.getState();
    if (!currentState.loading) {
      queueMicrotask(() => {
        setIsReady(true);
        setIsAuthenticated(!!useAuthStore.getState().user && useAuthStore.getState().status !== 'unauthenticated');
      });
    }

    return () => { clearTimeout(timer); clearTimeout(absoluteTimer); unsub(); };
  }, []);

  // PERF-AUDIT FASE 4 (2026-10-12): montaje en paralelo. Antes el contenido (landing
  // o shell) NO se montaba hasta que el splash terminaba (1.8s + 500ms fade) — la
  // descarga de su chunk JS empezaba después del splash → LCP ~3,1 s. Ahora el
  // contenido monta detrás del overlay en cuanto la sesión se resuelve, y el splash
  // (transición de marca breve, 600–800 ms extremo a extremo) se superpone y se
  // desvanece. autoDismiss=false: el desmonte del splash lo controla este componente
  // (splashDismissed) para que nunca se muestre contenido inexistente ni se oculten
  // errores; mientras !isReady, lo visible tras el fade es el estado de carga real.
  const showSplash = !splashDismissed;
  const showLogin = !isReady || !isAuthenticated;

  return (
    <div className="relative min-h-screen w-full">
      {isReady ? (
        showLogin ? (
          <Suspense fallback={
            <div className="min-h-screen w-full flex items-center justify-center bg-background">
              <ViewLoadingSplash label={t('main')} showTips={false} />
            </div>
          }>
            <LandingPage />
          </Suspense>
        ) : (
          <Suspense fallback={
            <div className="min-h-screen w-full flex items-center justify-center bg-background">
              <ViewLoadingSplash label={t('main')} showTips={false} />
            </div>
          }>
            {/* FIX-SCROLL-DESKTOP (2026-10): contenedor de altura DEFINIDA para el
                terminal. Antes CyberShell colgaba de un min-h-screen y TerminalShell
                usaba h-screen (100vh): el frame de CyberShell (p-2 + borde en ≥sm)
                excedía el viewport en 18px → scroll documental innecesario en
                escritorio. Con h-dvh fijo aquí, el shell (h-full) llena exactamente
                la caja interior del frame y el documento nunca desborda. La landing
                sigue usando min-h-screen (necesita crecer). */}
            <div className="h-dvh w-full overflow-hidden">
              <CyberShell>
                <TerminalShell />
              </CyberShell>
            </div>
          </Suspense>
        )
      ) : (
        // Estado de carga real de la sesión (visible si el splash ya se fue y la
        // autenticación aún no resuelve — p. ej. red lenta): honesto, no enmascarado.
        <div className="min-h-screen w-full flex items-center justify-center bg-background">
          <ViewLoadingSplash label={t('main')} showTips={false} />
        </div>
      )}
      {showSplash && (
        <CostProLoader fullScreen overlay autoDismiss={false} text={t('main')} subtext={t('initializing')} />
      )}
    </div>
  );
}
