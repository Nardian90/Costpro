'use client';

import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from '@/components/ui/button';
import { AlertOctagon, RefreshCw, Home, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';

function ErrorBoundaryContent({ error, onReload, onGoHome, onCopyError }: {
  error: Error;
  onReload: () => void;
  onGoHome: () => void;
  onCopyError: () => void;
}) {
  const t = useTranslations('errorBoundary');
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen p-8 bg-background"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
        <AlertOctagon className="w-10 h-10 text-red-500" aria-hidden="true" />
      </div>

      <div className="text-center space-y-4 max-w-lg">
        <h1 className="text-2xl font-bold text-foreground">
          {t('title')}
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          {t('description')}
        </p>

        {error.message && (
          <div className="bg-muted/50 rounded-lg p-4 text-left">
            <p className="text-sm font-mono text-muted-foreground break-words">
              {error.message}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mt-8 justify-center">
        <Button
          onClick={onReload}
          variant="default"
          className="gap-2"
          aria-label={t('reloadLabel')}
        >
          <RefreshCw className="w-4 h-4" />
          {t('reload')}
        </Button>
        <Button
          onClick={onGoHome}
          variant="outline"
          className="gap-2"
          aria-label={t('goHomeLabel')}
        >
          <Home className="w-4 h-4" />
          {t('goHome')}
        </Button>
        <Button
          onClick={onCopyError}
          variant="ghost"
          className="gap-2"
          aria-label={t('copyErrorLabel')}
        >
          <Copy className="w-4 h-4" />
          {t('copyError')}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground/50 mt-12">
        {t('persistWarning')}
      </p>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Global error boundary that catches runtime errors in the React component tree.
 * Provides user-friendly error UI with recovery options.
 * 
 * WCAG 2.2 — Criterio 2.5.6 (Input Modalities): Error messages are accessible.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error for monitoring (in production, send to Sentry/error tracking)
    console.error('[ErrorBoundary] Uncaught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    // FIX-INF-016: Also send to observability stack
    try {
      fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'error',
          context: 'ErrorBoundary',
          message: error?.message || String(error),
          stack: error?.stack,
        }),
      }).catch(() => { /* silently fail — don't loop */ });
    } catch { /* ignore */ }
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  handleCopyError = async () => {
    if (!this.state.error) return;
    const errorText = [
      `Error: ${this.state.error.message}`,
      `Stack: ${this.state.error.stack}`,
      `Component: ${this.state.errorInfo?.componentStack}`,
      `URL: ${window.location.href}`,
      `Time: ${new Date().toISOString()}`,
      `User Agent: ${navigator.userAgent}`,
    ].join('\n\n');
    
    try {
      await navigator.clipboard.writeText(errorText);
    } catch {
      // Fallback for older browsers
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
        <ErrorBoundaryContent
          error={this.state.error}
          onReload={this.handleReload}
          onGoHome={this.handleGoHome}
          onCopyError={this.handleCopyError}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
