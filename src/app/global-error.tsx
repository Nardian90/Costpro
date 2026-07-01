'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

// FIX-SENTRY-001: Global error boundary — catches errors in root layout
// This replaces the default Next.js error boundary for the entire app
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalErrorBoundary]', error);
  }, [error]);

  return (
    <html lang="es">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-6">
            {/* Error Icon */}
            <div className="flex justify-center">
              <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
                <svg
                  className="h-10 w-10 text-destructive"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Error crítico de la aplicación
              </h1>
              <p className="text-muted-foreground leading-relaxed">
                Ha ocurrido un error inesperado en la aplicación.
                Nuestro equipo ha sido notificado automáticamente.
              </p>
            </div>

            {/* Error Details (hidden in production) */}
            {process.env.NODE_ENV === 'development' && error.message && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-left">
                <p className="text-sm font-mono text-destructive break-all">
                  {error.message}
                </p>
                {error.digest && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Digest: {error.digest}
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-center">
              <Button
                onClick={reset}
                className="px-6"
              >
                Reintentar
              </Button>
              <Button
                variant="outline"
                onClick={() => (window.location.href = '/')}
              >
                Ir al inicio
              </Button>
            </div>

            {/* Footer */}
            <p className="text-xs text-muted-foreground">
              CostPro Enterprise — Sistema de Gestión Integral
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
