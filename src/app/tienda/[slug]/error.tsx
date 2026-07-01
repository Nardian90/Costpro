'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Package, RefreshCw, Home } from 'lucide-react';

/**
 * Route-level error boundary for /tienda/[slug].
 *
 * Next.js automatically wraps each route segment with an error boundary.
 * This file provides a storefront-themed error UI that matches the
 * catalog's visual design instead of the generic app error page.
 *
 * Key differences from the global error.tsx:
 * - Storefront-themed icons and colors (Package, stone palette)
 * - i18n keys scoped to stores.storefront (public page, may not have auth)
 * - No error digest display (public users don't need internal details)
 * - Simpler UI focused on retry + go home
 */
export default function TiendaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('stores.storefront');

  useEffect(() => {
    // Log to console only — storefront is public, avoid authenticated API calls
    console.error('[TiendaErrorBoundary]', error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-stone-50 p-8"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
          <Package className="w-10 h-10 text-red-500" aria-hidden="true" />
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-black uppercase tracking-tighter text-stone-900">
            {t('errorTitle')}
          </h1>
          <p className="text-sm text-stone-500 leading-relaxed">
            {t('errorDescription')}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-black uppercase tracking-widest hover:bg-stone-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t('errorRetry')}
          </button>
          <button
            onClick={() => (window.location.href = '/')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-stone-200 bg-white text-stone-600 text-xs font-black uppercase tracking-widest hover:border-stone-400 transition-colors"
          >
            <Home className="w-4 h-4" />
            {t('errorGoBack')}
          </button>
        </div>
      </div>
    </div>
  );
}
