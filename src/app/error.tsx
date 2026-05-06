'use client';

import { useEffect } from 'react';

// FIX-INF-014: Custom error page for server-side rendering errors
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ErrorPage] Unhandled error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-6xl">⚠️</div>
        <h1 className="text-2xl font-bold text-foreground">Algo salió mal</h1>
        <p className="text-muted-foreground">
          {error.message || 'Ha ocurrido un error inesperado.'}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Reintentar
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="px-4 py-2 border border-border rounded-lg hover:bg-muted"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    </div>
  );
}
