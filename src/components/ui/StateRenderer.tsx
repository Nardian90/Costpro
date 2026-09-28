'use client';

import React from 'react';
import { ViewLoadingSplash } from './ViewLoadingSplash';

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
  /** F3-B2: reintento suave (p.ej. refetch de react-query). Si no se provee,
   *  se mantiene el comportamiento histórico (recargar la página). */
  onRetry?: () => void;
}

const DefaultLoadingComponent = () => (
  <ViewLoadingSplash label="CARGANDO" showTips={false} />
);

const DefaultErrorComponent = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4 text-center w-full bg-destructive/5 border border-destructive/20 rounded-2xl p-8" /* FIX-ACC-017 */>
    <p className="font-bold text-destructive">Ha ocurrido un error</p>
    <p className="text-sm text-destructive/80">{message || 'No se pudieron cargar los datos. Intenta nuevamente.'}</p>
    <button
      onClick={() => (onRetry ? onRetry() : window.location.reload())}
      className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
    >
      Reintentar
    </button>
  </div>
);

const DefaultEmptyComponent = ({ message, action }: { message?: string; action?: { label: string; onClick: () => void } }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4 text-center w-full bg-muted/20 border border-border rounded-2xl p-8">
    <p className="font-bold text-foreground">No hay datos disponibles</p>
    <p className="text-sm text-muted-foreground">{message || 'No se encontraron registros'}</p>
    {action && (
      <button onClick={action.onClick} className="mt-3 text-sm text-primary hover:underline">
        {action.label}
      </button>
    )}
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
}: StateRendererProps<T>) {

  if (isLoading) {
    return (loadingComponent as any) || <DefaultLoadingComponent />;
  }

  if (error) {
    return (errorComponent as any) || <DefaultErrorComponent message={error.message} onRetry={onRetry} />;
  }

  const effectiveEmpty = isEmpty ?? (!data || data.length === 0);

  if (effectiveEmpty) {
    return (emptyComponent as any) || <DefaultEmptyComponent message={emptyMessage} />;
  }

  return <>{children(data as T[])}</>;
}
