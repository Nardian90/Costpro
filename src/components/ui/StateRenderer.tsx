'use client';

import React, { useCallback } from 'react';
import { CostProLoader } from './CostProLoader';
import { RefreshCw, AlertTriangle, Inbox } from 'lucide-react';
import { announce } from './AriaLiveRegion';

export interface StateRendererProps<T> {
  isLoading: boolean;
  error?: Error | null;
  data: T[] | undefined | null;
  children: (data: T[]) => React.ReactNode;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  emptyComponent?: React.ReactNode;
  isEmpty?: boolean;
  emptyMessage?: string;
  /** Callback to retry loading on error */
  onRetry?: () => void;
  /** Accessible label for the content being rendered */
  label?: string;
}

const DefaultLoadingComponent = () => (
  <div className="flex flex-col items-center justify-center py-20 w-full" role="status" aria-label="Cargando datos">
    <CostProLoader text="CARGANDO" subtext="Sincronizando Datos" showText showSubtext />
    <span className="sr-only">Cargando datos, por favor espere</span>
  </div>
);

const DefaultErrorComponent = ({ message, onRetry }: { message: string; onRetry?: () => void }) => {
  const handleRetry = useCallback(() => {
    announce('Reintentando carga de datos', 'polite');
    onRetry?.();
  }, [onRetry]);

  return (
    <div
      className="flex flex-col items-center justify-center py-20 gap-4 text-center w-full bg-destructive/5 border border-destructive/20 rounded-2xl p-8"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center" aria-hidden="true">
        <AlertTriangle className="w-6 h-6 text-destructive" />
      </div>
      <p className="font-bold text-destructive" id="error-message">Ha ocurrido un error</p>
      <p className="text-sm text-destructive/80 max-w-md" aria-describedby="error-message">
        {message || 'No se pudieron cargar los datos. Intenta nuevamente.'}
      </p>
      {onRetry && (
        <button
          onClick={handleRetry}
          className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-destructive text-destructive-foreground font-bold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all text-xs uppercase tracking-widest"
          aria-label="Reintentar carga de datos"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
      )}
    </div>
  );
};

const DefaultEmptyComponent = ({ message }: { message?: string }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4 text-center w-full bg-muted/20 border border-border rounded-2xl p-8">
    <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center" aria-hidden="true">
      <Inbox className="w-6 h-6 text-muted-foreground" />
    </div>
    <p className="font-bold text-foreground">No hay datos disponibles</p>
    <p className="text-sm text-muted-foreground">{message || 'No se encontraron registros para mostrar.'}</p>
  </div>
);

export function StateRenderer<T>({
  isLoading,
  error,
  data,
  children,
  loadingComponent,
  errorComponent,
  emptyComponent,
  isEmpty,
  emptyMessage,
  onRetry,
  label,
}: StateRendererProps<T>) {
  // Announce state changes to screen readers
  React.useEffect(() => {
    if (error) {
      announce(`Error: ${error.message || 'No se pudieron cargar los datos'}`, 'assertive');
    }
  }, [error]);

  if (isLoading) {
    return (
      <div role="status" aria-label={label || 'Cargando datos'}>
        {(loadingComponent as any) || <DefaultLoadingComponent />}
      </div>
    );
  }

  if (error) {
    if (errorComponent) return errorComponent as any;
    return <DefaultErrorComponent message={error.message} onRetry={onRetry} />;
  }

  const effectiveEmpty = isEmpty ?? (!data || data.length === 0);

  if (effectiveEmpty) {
    return (emptyComponent as any) || <DefaultEmptyComponent message={emptyMessage} />;
  }

  return <>{children(data as T[])}</>;
}
