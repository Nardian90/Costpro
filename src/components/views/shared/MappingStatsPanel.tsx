'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, Info, ListFilter } from 'lucide-react';
import { MappingStats } from '@/core/mapping/mapping.types';
import { cn } from '@/lib/utils';

interface Props {
  stats: MappingStats;
  className?: string;
}

export function MappingStatsPanel({ stats, className }: Props) {
  const isHealthy = stats.successRate >= 95;

  return (
    <Card className={cn("p-6 space-y-6 bg-card/50 backdrop-blur-sm border-2", isHealthy ? "border-green-500/20" : "border-yellow-500/20", className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <ListFilter className="w-4 h-4" />
            Performance del Mapeo
          </h3>
          <p className="text-xs text-muted-foreground font-medium italic">
            Visualización de eficiencia de reglas y calidad de datos.
          </p>
        </div>
        <Badge
          className={cn(
            "h-7 px-4 font-black text-[10px] uppercase tracking-widest",
            isHealthy ? "bg-green-500 text-white" : "bg-yellow-500 text-white"
          )}
        >
          {isHealthy ? 'ÓPTIMO' : 'REQUIERE AJUSTE'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <span className="text-[10px] font-black uppercase tracking-tighter opacity-70">Tasa de Éxito</span>
            <span className="text-2xl font-black">{stats.successRate.toFixed(1)}%</span>
          </div>
          <Progress value={stats.successRate} className="h-2 bg-muted/20" color={isHealthy ? 'green' : 'yellow'} />
        </div>

        <div className="flex flex-col justify-center gap-1 border-x border-border/50 px-6">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold uppercase opacity-60">Filas Procesadas</span>
            <span className="text-xs font-black">{stats.totalRows}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold uppercase opacity-60">Mapeos Exitosos</span>
            <span className="text-xs font-black text-green-500">{stats.mappedRows}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold uppercase opacity-60">Fallos Críticos</span>
            <span className="text-xs font-black text-red-500">{stats.failedRows}</span>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Columnas No Mapeadas</p>
          <div className="flex flex-wrap gap-1.5">
            {stats.unmappedColumns.length > 0 ? (
              stats.unmappedColumns.map(col => (
                <Badge key={col} variant="secondary" className="text-[9px] font-bold bg-muted/50 border-transparent">
                  {col}
                </Badge>
              ))
            ) : (
              <span className="text-[9px] font-medium italic opacity-50">Ninguna encontrada</span>
            )}
          </div>
        </div>
      </div>

      {stats.errors.length > 0 && (
        <div className="p-4 bg-destructive/5 rounded-2xl border border-destructive/20 space-y-2">
          <div className="flex items-center gap-2 text-destructive font-black text-[10px] uppercase tracking-widest">
            <AlertTriangle className="w-3 h-3" />
            Log Resumido de Errores
          </div>
          <div className="max-h-20 overflow-y-auto space-y-1 custom-scrollbar">
            {stats.errors.slice(0, 5).map((err, i) => (
              <p key={i} className="text-[9px] font-medium leading-tight opacity-80">• {err}</p>
            ))}
            {stats.errors.length > 5 && (
              <p className="text-[9px] font-bold italic opacity-50">... y {stats.errors.length - 5} errores más</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
