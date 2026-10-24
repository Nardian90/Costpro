'use client';

import React from 'react';
import { useHealthData } from './hooks/useHealthData';
import { HealthLayout } from './HealthLayout';
import { ViewLoadingSplash } from '@/components/ui/ViewLoadingSplash';
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';

export default function HealthView() {
  const {
    data,
    loading,
    error,
    refetch,
    lastRefresh,
    isRefreshing,
    refreshState,
    dataStale,
    loadGraph,
    graphData,
    graphLoading,
    graphError,
  } = useHealthData();

  // Carga inicial: sin datos todavía → splash.
  if (loading && !data) {
    return (
      <div className="h-screen w-full bg-background">
        <ViewLoadingSplash label="SALUD DEL SISTEMA" showTips={false} />
      </div>
    );
  }

  // Sin datos (reintentos agotados o carga inicial fallida) → pantalla de error con reintento.
  if (!data) {
    return <ErrorScreen error={error} onRetry={refetch} />;
  }

  // Con datos: si un refresco posterior falla, HealthLayout conserva los datos
  // anteriores y muestra el error (no se reemplaza la pantalla).
  return (
    <HealthLayout
      data={data}
      onRefresh={refetch}
      isRefreshing={isRefreshing}
      refreshState={refreshState}
      dataStale={dataStale}
      error={error}
      lastRefresh={lastRefresh}
      graphData={graphData}
      graphLoading={graphLoading}
      graphError={graphError}
      onLoadGraph={loadGraph}
    />
  );
}

// ─── Error Screen Component ─────────────────────────────────────────────────

function ErrorScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const [showDetails, setShowDetails] = React.useState(false);

  // Categorize error for better UX
  const isAuthError = error?.includes('No autorizado') || error?.includes('Se requiere sesión');
  const isServerError = error?.includes('500') || error?.includes('Error de configuración');
  const isNetworkError = error?.includes('fetch') || error?.includes('Failed to fetch') || error?.includes('NetworkError');

  const errorCategory = isAuthError ? 'auth' : isServerError ? 'server' : isNetworkError ? 'network' : 'unknown';

  const categoryConfig: Record<string, { title: string; description: string; color: 'amber' | 'destructive' }> = {
    auth: {
      title: 'Acceso Restringido',
      description:
        'Se requiere una sesión activa con rol de administrador para ver el estado del sistema. Verifique que haya iniciado sesión correctamente.',
      color: 'amber',
    },
    server: {
      title: 'Error del Servidor',
      description: 'El servidor no pudo completar la comprobación. Contacte al administrador del sistema si el problema persiste.',
      color: 'destructive',
    },
    network: {
      title: 'Sin Conexión al Servidor',
      description: 'No se pudo establecer comunicación con el servidor. Verifique su conexión a internet y que el servidor esté operando.',
      color: 'destructive',
    },
    unknown: {
      title: 'Estado No Disponible',
      description: 'No se pudieron ejecutar las comprobaciones del sistema. Use «Reintentar» cuando el servidor esté disponible.',
      color: 'destructive',
    },
  };

  const config = categoryConfig[errorCategory];
  const colorClasses: Record<'amber' | 'destructive', string> = {
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
    destructive: 'bg-destructive/10 border-destructive/20 text-destructive',
  };

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-background p-6 sm:p-12 text-center overflow-auto">
      {/* Status Icon */}
      <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-3xl border ${colorClasses[config.color].split(' ')[0]} flex items-center justify-center mb-8 relative`}>
        <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 text-destructive" />
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive/20 border border-destructive/30 flex items-center justify-center">
          <WifiOff className="w-3 h-3 text-destructive" />
        </div>
      </div>

      {/* Title */}
      <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-4 leading-none">{config.title}</h2>

      {/* Description */}
      <p className="text-muted-foreground text-xs sm:text-sm font-medium max-w-xl mb-8 leading-relaxed">{config.description}</p>

      {/* Action Buttons */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={onRetry}
          className="px-8 py-3 bg-primary text-primary-foreground font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
      </div>

      {/* Status Info Cards */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/20 border border-border/50 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          <WifiOff className="w-3 h-3" />
          Sin comprobaciones completadas
        </div>
      </div>

      {/* Technical Details (expandable) */}
      {error && (
        <div className="w-full max-w-2xl">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 mx-auto text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Detalles Técnicos
          </button>
          {showDetails && (
            <div className="mt-4 p-5 rounded-2xl bg-destructive/5 border border-destructive/10 font-mono text-[10px] text-destructive/60 overflow-auto max-h-32">
              <div className="mb-2">Categoría: {errorCategory.toUpperCase()}</div>
              <div>ERROR: {error}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
