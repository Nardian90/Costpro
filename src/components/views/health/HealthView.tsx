'use client';

import React from 'react';
import { useHealthData, HealthData } from './hooks/useHealthData';
import { HealthLayout } from './HealthLayout';
import { ViewLoadingSplash } from '@/components/ui/ViewLoadingSplash';
import { AlertCircle, RefreshCw, Wifi, WifiOff, Server, Clock, ChevronDown } from 'lucide-react';

export default function HealthView() {
  const { data, loading, error, refetch, lastRefresh, isRefreshing } = useHealthData();

  if (loading && !data) {
    return (
      <div className="h-screen w-full bg-background">
        <ViewLoadingSplash label="INTELLIGENCE HUB" showTips={false} />
      </div>
    );
  }

  if (error || !data) {
    return <ErrorScreen error={error} onRetry={refetch} />;
  }

  return <HealthLayout data={data} loading={isRefreshing} error={error} onRefresh={refetch} lastRefresh={lastRefresh} />;
}

// ─── Error Screen Component ─────────────────────────────────────────────────

function ErrorScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const [showDetails, setShowDetails] = React.useState(false);

  // Categorize error for better UX
  const isAuthError = error?.includes('No autorizado') || error?.includes('Se requiere sesión');
  const isServerError = error?.includes('500') || error?.includes('Error de configuración');
  const isNetworkError = error?.includes('fetch') || error?.includes('Failed to fetch') || error?.includes('NetworkError');

  const errorCategory = isAuthError ? 'auth' : isServerError ? 'server' : isNetworkError ? 'network' : 'unknown';

  const categoryConfig: Record<string, { title: string; description: string; color: "amber" | "destructive" }> = {
    auth: {
      title: 'Acceso Restringido',
      description: 'Se requiere una sesión activa con rol de administrador para acceder al Centro de Inteligencia. Verifique que haya iniciado sesión correctamente.',
      color: 'amber',
    },
    server: {
      title: 'Error de Configuración del Servidor',
      description: 'El servicio de autenticación no está completamente configurado. Contacte al administrador del sistema para verificar las variables de entorno.',
      color: 'destructive',
    },
    network: {
      title: 'Sin Conexión al Servidor',
      description: 'No se pudo establecer comunicación con el motor de inteligencia. Verifique su conexión a internet y que el servidor esté operando.',
      color: 'destructive',
    },
    unknown: {
      title: 'Centro de Inteligencia Desconectado',
      description: 'No se pudieron cargar los artefactos de arquitectura. Verifique que el pipeline haya generado los archivos requeridos.',
      color: 'destructive',
    },
  };

  const config = categoryConfig[errorCategory];
  const colorClasses: Record<"amber" | "destructive", string> = {
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
    destructive: 'bg-destructive/10 border-destructive/20 text-destructive',
  };

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-background p-6 sm:p-12 text-center overflow-auto">
      {/* Status Icon */}
      <div className={`w-24 h-24 sm:w-32 sm:h-32 rounded-[40px] sm:rounded-[48px] ${colorClasses[config.color].split(' ')[0]} border ${config.color === 'amber' ? 'border-amber-500/20' : 'border-destructive/20'} flex items-center justify-center mb-8 sm:mb-10 relative`}>
        <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-destructive" />
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive/20 border border-destructive/30 flex items-center justify-center">
          <WifiOff className="w-3 h-3 text-destructive" />
        </div>
      </div>

      {/* Title */}
      <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight mb-4 sm:mb-6 leading-none">
        {config.title}
      </h2>

      {/* Description */}
      <p className="text-muted-foreground text-xs sm:text-sm font-medium uppercase tracking-widest max-w-xl mb-8 sm:mb-10 leading-relaxed">
        {config.description}
      </p>

      {/* Action Buttons */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={onRetry}
          className="px-8 py-3 bg-primary text-primary-foreground font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar Conexión
        </button>
      </div>

      {/* Status Info Cards */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/20 border border-border/50 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          <Server className="w-3 h-3" />
          Motor v9.0.0
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/20 border border-border/50 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          <Clock className="w-3 h-3" />
          {new Date().toLocaleTimeString('es-CU')}
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[9px] font-bold uppercase tracking-widest ${
          errorCategory === 'network'
            ? 'bg-destructive/5 border-destructive/20 text-destructive'
            : 'bg-amber-500/5 border-amber-500/20 text-amber-500'
        }`}>
          {errorCategory === 'network' ? (
            <><WifiOff className="w-3 h-3" /> Desconectado</>
          ) : (
            <><AlertCircle className="w-3 h-3" /> Error Detectado</>
          )}
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
            <ChevronDown className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
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
