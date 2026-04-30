import { logger } from '@/lib/logger';
'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useAuthStore } from '@/store';
import { CostProLoader } from '@/components/ui/CostProLoader';

// ── Lazy-loaded to reduce initial compilation memory ──
const CyberShell = dynamic(() => import('@/components/ui/CyberShell'), { ssr: false });
const TerminalShell = dynamic(() => import('@/components/views/TerminalShell'), { ssr: false });
const LandingPage = dynamic(() => import('./LandingPage'), { ssr: false });

/* ── Auth-aware page with independent splash ── */
export default function HomePage() {
  const { user, status } = useAuthStore();
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [splashDismissed, setSplashDismissed] = useState(false);

  // Listen for splash dismiss event from CostProLoader
  useEffect(() => {
    const handleSplashDismiss = () => setSplashDismissed(true);
    window.addEventListener('costpro:skip-splash', handleSplashDismiss);
    return () => window.removeEventListener('costpro:skip-splash', handleSplashDismiss);
  }, []);

  useEffect(() => {
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
      <CostProLoader fullScreen text="Gestión Empresarial" subtext="Inicializando sistema" />
    );
  }

  const showLogin = !isReady || !isAuthenticated;

  if (showLogin) {
    return (
      <Suspense fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-background">
          <CostProLoader text="Gestión Empresarial" subtext="Cargando..." showText showSubtext />
        </div>
      }>
        <LandingPage />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <CostProLoader text="Gestión Empresarial" subtext="Cargando terminal..." showText showSubtext />
      </div>
    }>
      <CyberShell>
        <TerminalShell />
      </CyberShell>
    </Suspense>
  );
}
