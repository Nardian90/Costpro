'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

// FIX-SENTRY-002: Route-level error boundary — captures exceptions to Sentry
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-6xl" role="img" aria-label="Error">⚠️</div>
        <h1 className="text-2xl font-bold text-foreground">Algo salió mal</h1>
        <p className="text-muted-foreground">
          {error.message || 'Ha ocurrido un error inesperado.'}
        </p>

        {/* Error Details (hidden in production) */}
        {process.env.NODE_ENV === 'development' && error.digest && (
          <p className="text-xs text-muted-foreground">
            Digest: {error.digest}
          </p>
        )}

        <div className="flex gap-3 justify-center">
          <Button onClick={reset} className="px-6">
            Reintentar
          </Button>
          <Button
            variant="outline"
            onClick={() => (window.location.href = '/')}
          >
            Ir al inicio
          </Button>
        </div>
      </div>
    </div>
  );
}
