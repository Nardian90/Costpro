'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface StateRendererProps<T> {
  isLoading: boolean;
  error: Error | null;
  data: T[] | undefined | null;
  children: (data: T[]) => React.ReactNode;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  emptyComponent?: React.ReactNode;
}

const DefaultLoadingComponent = () => (
  <div className="flex flex-col items-center justify-center py-20 gap-4 w-full">
    <Loader2 className="w-10 h-10 animate-spin text-primary" />
    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
      CARGANDO DATOS...
    </p>
  </div>
);

const DefaultErrorComponent = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4 text-center w-full bg-destructive/5 border border-destructive/20 rounded-2xl p-8">
    <p className="font-bold text-destructive">Ha ocurrido un error</p>
    <p className="text-sm text-destructive/80">{message || 'No se pudieron cargar los datos. Intenta nuevamente.'}</p>
  </div>
);

const DefaultEmptyComponent = () => (
  <div className="flex flex-col items-center justify-center py-20 gap-4 text-center w-full bg-muted/20 border border-border rounded-2xl p-8">
    <p className="font-bold text-foreground">No hay datos disponibles</p>
    <p className="text-sm text-muted-foreground">No se encontraron registros para mostrar.</p>
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
}: StateRendererProps<T>) {

  if (isLoading) {
    return loadingComponent || <DefaultLoadingComponent />;
  }

  if (error) {
    return errorComponent || <DefaultErrorComponent message={error.message} />;
  }

  if (!data || data.length === 0) {
    return emptyComponent || <DefaultEmptyComponent />;
  }

  return <>{children(data)}</>;
}
