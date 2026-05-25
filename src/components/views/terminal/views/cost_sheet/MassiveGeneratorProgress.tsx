'use client';

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { ViewLoadingSplash } from '@/components/ui/ViewLoadingSplash';
import { MassiveResult } from './MassiveGenerator.types';

interface MassiveGeneratorProgressProps {
  mode: 'overlay' | 'inline';
  isProcessing: boolean;
  progress: number;
  currentIndex: number;
  selectedIdsSize: number;
  productsLength: number;
  results: MassiveResult[];
}

export const MassiveGeneratorProgress: React.FC<MassiveGeneratorProgressProps> = ({
  mode,
  isProcessing,
  progress,
  currentIndex,
  selectedIdsSize,
  productsLength,
  results,
}) => {
  const completedCount = results.filter((r) => r.status === 'completed').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  if (mode === 'overlay') {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] bg-card/50 backdrop-blur-xl rounded-[2.5rem] border-2 border-primary/20 animate-in zoom-in-95 duration-500 shadow-2xl">
        <ViewLoadingSplash label="PROCESANDO" showTips={false} />
        <div className="w-64 -mt-8 space-y-2">
          <Progress value={progress} className="h-2 bg-primary/10" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-center text-primary/60">
            Ficha {currentIndex + 1} de {selectedIdsSize}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
          <div className="text-xs font-black text-primary/70 tracking-[0.2em] uppercase mb-1">
            Total Productos
          </div>
          <div className="text-2xl font-black text-foreground">{productsLength}</div>
        </div>
        <div className="p-4 rounded-2xl bg-success/5 border border-success/10">
          <div className="text-xs font-black text-success/70 tracking-[0.2em] uppercase mb-1">
            Procesados
          </div>
          <div className="text-2xl font-black text-foreground">{completedCount}</div>
        </div>
        <div className="p-4 rounded-2xl bg-danger/5 border border-danger/10">
          <div className="text-xs font-black text-danger/70 tracking-[0.2em] uppercase mb-1">
            Errores
          </div>
          <div className="text-2xl font-black text-foreground">{errorCount}</div>
        </div>
      </div>

      {/* Progress Bar */}
      {isProcessing && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-black uppercase tracking-widest text-muted-foreground px-1">
            <span>Progreso General</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-3 rounded-full bg-primary/10" />
        </div>
      )}
    </>
  );
};
