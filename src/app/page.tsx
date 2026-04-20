'use client';

import { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useAuthStore } from '@/store';
import { CostProLoader } from '@/components/ui/CostProLoader';

// ── Lazy-loaded to reduce initial compilation memory ──
const CyberShell = dynamic(() => import('@/components/ui/CyberShell'), { ssr: false });
const TerminalShell = dynamic(() => import('@/components/views/TerminalShell'), { ssr: false });
const LandingPage = dynamic(() => import('./LandingPage'), { ssr: false });

/* ── Auth-aware page ── */
export default function HomePage() {
  const { user, status } = useAuthStore();
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
        console.warn('[HomePage] Auth check timeout, forcing ready state');
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

  // Dismiss inline splash once the app is ready
  useEffect(() => {
    if (isReady) {
      (window as any).__dismissSplash?.();
    }
  }, [isReady]);

  const showLogin = !isReady || !isAuthenticated;

  if (showLogin) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#020617]"><CostProLoader size={120} text="COSTPRO" subtext="Cargando..." /></div>}>
        <LandingPage />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#020617]"><CostProLoader size={120} text="COSTPRO" subtext="Cargando..." /></div>}>
      <CyberShell>
        <TerminalShell />
      </CyberShell>
    </Suspense>
  );
}
