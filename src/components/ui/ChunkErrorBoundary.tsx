import { logger } from '@/lib/logger';
'use client';

import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

interface ChunkErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  chunkName?: string;
}

interface ChunkErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isRetrying: boolean;
  retryCount: number;
}

/**
 * Error boundary that catches Turbopack ChunkLoadError and provides retry logic.
 * Wraps lazy-loaded components to gracefully handle chunk compilation failures.
 */
export class ChunkErrorBoundary extends Component<ChunkErrorBoundaryProps, ChunkErrorBoundaryState> {
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(props: ChunkErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isRetrying: false,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ChunkErrorBoundaryState> {
    // Only catch chunk loading errors
    const isChunkError =
      error?.message?.includes('Failed to load chunk') ||
      error?.message?.includes('ChunkLoadError') ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.name === 'ChunkLoadError';

    if (isChunkError) {
      return { hasError: true, error, isRetrying: false };
    }

    // Let other errors propagate
    return {};
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.warn('DATABASE', 'CHUNK_LOAD_ERROR', {
      chunkName: this.props.chunkName,
      message: error.message,
      stack: error.stack
    });
  }

  handleRetry = () => {
    this.setState({ isRetrying: true });

    // Small delay to let Turbopack recompile
    this.retryTimeout = setTimeout(() => {
      this.setState((prev) => ({
        hasError: false,
        error: null,
        isRetrying: false,
        retryCount: prev.retryCount + 1,
      }));
    }, 800);
  };

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 gap-6">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
          </div>

          <div className="text-center space-y-2 max-w-md">
            <h3 className="text-lg font-bold text-foreground">
              Error al cargar módulo
            </h3>
            <p className="text-sm text-muted-foreground">
              {this.state.retryCount === 0
                ? 'El módulo tardó demasiado en compilarse. Esto es normal durante el desarrollo.'
                : 'El módulo sigue sin cargar. Intenta refrescar la página completa.'}
            </p>
            {this.props.chunkName && (
              <p className="text-xs text-muted-foreground/60 font-mono mt-1">
                Módulo: {this.props.chunkName}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={this.handleRetry}
              disabled={this.state.isRetrying}
              className="gap-2"
            >
              {this.state.isRetrying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Recompilando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Reintentar
                </>
              )}
            </Button>

            {this.state.retryCount >= 2 && (
              <Button
                variant="default"
                onClick={() => window.location.reload()}
                className="gap-2"
              >
                Recargar página
              </Button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * HOC to wrap a lazy-loaded component with ChunkErrorBoundary.
 * Usage: const SafeCostSheetView = withChunkRetry(lazy(() => import('./CostSheetView')), 'CostSheetView');
 */
export function withChunkRetry(
  LazyComponent: React.LazyExoticComponent<React.ComponentType<any>>,
  chunkName?: string
) {
  return function ChunkRetryingComponent(props: any) {
    return (
      <ChunkErrorBoundary chunkName={chunkName}>
        <React.Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[300px]">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <LazyComponent {...props} />
        </React.Suspense>
      </ChunkErrorBoundary>
    );
  };
}
