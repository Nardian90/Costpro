'use client';

import React from 'react';
import { useHealthData } from './hooks/useHealthData';
import { HealthLayout } from './HealthLayout';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function HealthView() {
  const { data, loading, error, refetch } = useHealthData();

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background">
        <CostProLoader
          size={300}
          text="INTELLIGENCE HUB"
          subtext="CARGANDO ARTEFACTOS DEL SISTEMA..."
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background p-12 text-center">
        <div className="w-24 h-24 rounded-[40px] bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-8">
          <AlertCircle className="w-12 h-12 text-destructive" />
        </div>
        <h2 className="text-3xl font-black uppercase tracking-tight mb-4 leading-none">Centro de Inteligencia Desconectado</h2>
        <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest max-w-md mb-8">
          No se pudieron cargar los artefactos de arquitectura. Verifique que el pipeline v8.0 haya generado los archivos requeridos en public/ y docs/automation/.
        </p>
        <button
          onClick={() => refetch()}
          className="px-8 py-3 bg-primary text-primary-foreground font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-lg hover:scale-105 transition-all flex items-center gap-3"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar Sincronización
        </button>
        {error && (
          <div className="mt-12 p-6 rounded-3xl bg-destructive/5 border border-destructive/10 font-mono text-[10px] text-destructive/60 max-w-2xl overflow-auto">
            ERROR: {error}
          </div>
        )}
      </div>
    );
  }

  return <HealthLayout data={data} loading={loading} error={error} onRefresh={refetch} />;
}
