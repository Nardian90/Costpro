'use client';

import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { useTranslations } from 'next-intl';
import { Package, RefreshCw, Home, Copy } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface StorefrontErrorBoundaryProps {
  children: ReactNode;
  storeName?: string;
  /** Optional fallback — if provided, overrides the default error UI */
  fallback?: ReactNode;
}

interface StorefrontErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ── Error Content (i18n-aware, storefront-themed) ──────────────────

function StorefrontErrorContent({
  error,
  storeName,
  onReload,
  onGoHome,
  onCopyError,
}: {
  error: Error;
  storeName?: string;
  onReload: () => void;
  onGoHome: () => void;
  onCopyError: () => void;
}) {
  const t = useTranslations('stores.storefront');

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-stone-50 p-8"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="max-w-md w-full text-center space-y-6">
        {/* Visual icon — storefront-themed (Package icon instead of generic error) */}
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
          {storeName && (
            <p className="text-xs text-stone-400 font-medium">
              {storeName}
            </p>
          )}
        </div>

        {/* Error details (collapsible) */}
        {error.message && (
          <details className="bg-white rounded-xl border border-stone-200 p-4 text-left">
            <summary className="text-xs font-bold uppercase tracking-widest text-stone-400 cursor-pointer hover:text-stone-600 transition-colors">
              Detalles del error
            </summary>
            <p className="mt-2 text-xs font-mono text-stone-500 break-words">
              {error.message}
            </p>
          </details>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={onReload}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-black uppercase tracking-widest hover:bg-stone-800 transition-colors"
            aria-label={t('errorRetry')}
          >
            <RefreshCw className="w-4 h-4" />
            {t('errorRetry')}
          </button>
          <button
            onClick={onGoHome}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-stone-200 bg-white text-stone-600 text-xs font-black uppercase tracking-widest hover:border-stone-400 transition-colors"
            aria-label={t('errorGoBack')}
          >
            <Home className="w-4 h-4" />
            {t('errorGoBack')}
          </button>
          <button
            onClick={onCopyError}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-stone-200 bg-white text-stone-600 text-xs font-black uppercase tracking-widest hover:border-stone-400 transition-colors"
            aria-label={t('errorCopyDetails')}
          >
            <Copy className="w-4 h-4" />
            {t('errorCopyDetails')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Error Boundary Class Component ─────────────────────────────────

/**
 * Storefront-specific error boundary.
 *
 * Differences from the global ErrorBoundary:
 * - Storefront-themed visual design (Package icon, stone palette)
 * - i18n keys scoped to `stores.storefront` (not `errorBoundary`)
 * - Accepts `storeName` prop for contextual error display
 * - Lightweight — no observability /api/logs call (public storefront,
 *   no guarantee the user is authenticated)
 * - WCAG 2.2 compliant: role="alert", aria-live="assertive"
 */
export class StorefrontErrorBoundary extends Component<
  StorefrontErrorBoundaryProps,
  StorefrontErrorBoundaryState
> {
  constructor(props: StorefrontErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<StorefrontErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to console only — storefront is public, avoid sending errors
    // to /api/logs which requires authentication
    console.error('[StorefrontErrorBoundary] Uncaught error:', error);
    console.error('[StorefrontErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  handleCopyError = async () => {
    if (!this.state.error) return;
    const errorText = [
      `Error: ${this.state.error.message}`,
      `Stack: ${this.state.error.stack}`,
      `URL: ${window.location.href}`,
      `Time: ${new Date().toISOString()}`,
      `Store: ${this.props.storeName || 'Unknown'}`,
    ].join('\n\n');

    try {
      await navigator.clipboard.writeText(errorText);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = errorText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <StorefrontErrorContent
          error={this.state.error}
          storeName={this.props.storeName}
          onReload={this.handleReload}
          onGoHome={this.handleGoHome}
          onCopyError={this.handleCopyError}
        />
      );
    }

    return this.props.children;
  }
}

export default StorefrontErrorBoundary;
