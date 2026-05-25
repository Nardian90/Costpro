'use client';

import React from 'react';
import { ZoomIn, ZoomOut, Maximize2, Rows3, Columns3, Play, Pause, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SimPhase } from './useSimulation';

interface MapControlsProps {
  zoom: number;
  isZoomActive: boolean;
  orientation: 'horizontal' | 'vertical';
  simPhase: SimPhase;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onOrientationChange: (o: 'horizontal' | 'vertical') => void;
  onSimPlay: () => void;
  onSimPause: () => void;
  onSimStop: () => void;
}

const MapControls: React.FC<MapControlsProps> = ({
  zoom, isZoomActive, orientation, simPhase,
  onZoomIn, onZoomOut, onReset, onOrientationChange,
  onSimPlay, onSimPause, onSimStop,
}) => {
  const btnCls = 'w-7 h-7 rounded-lg bg-card border border-border/60 flex items-center justify-center hover:bg-primary/10 hover:border-primary/40 transition-colors';

  const isSimulating = simPhase !== 'idle';

  return (
    <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
      {/* Simulation controls — only show when simulation is active */}
      {isSimulating && (
        <>
          <button
            onClick={simPhase === 'running' ? onSimPause : simPhase === 'paused' ? onSimPlay : onSimStop}
            className={cn(btnCls, simPhase === 'running' && 'ring-1 ring-primary/40 bg-primary/5')}
            title={simPhase === 'running' ? 'Pausar simulación' : simPhase === 'paused' ? 'Reanudar simulación' : 'Detener simulación'}
          >
            {simPhase === 'running'
              ? <Pause className="w-3.5 h-3.5 text-primary" />
              : simPhase === 'paused'
                ? <Play className="w-3.5 h-3.5 text-amber-500" />
                : <Square className="w-3.5 h-3.5 text-muted-foreground" />
            }
          </button>
          <button onClick={onSimStop} className={btnCls} title="Detener simulación">
            <Square className="w-3 h-3 text-muted-foreground" />
          </button>
          {/* Divider */}
          <div className="w-px h-4 bg-border/60 mx-0.5" />
        </>
      )}

      {/* Play button — always visible when idle */}
      {!isSimulating && (
        <button
          onClick={onSimPlay}
          className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center hover:bg-primary/20 hover:border-primary/50 transition-colors"
          title="Simular proceso (ver flujo en vivo)"
        >
          <Play className="w-3.5 h-3.5 text-primary" />
        </button>
      )}

      <button onClick={onZoomIn} className={btnCls} title="Acercar">
        <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <span className="text-[10px] font-mono font-bold text-muted-foreground w-10 text-center">
        {Math.round(zoom * 100)}%
      </span>
      <button onClick={onZoomOut} className={btnCls} title="Alejar">
        <ZoomOut className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <button onClick={onReset} className={btnCls} title="Restablecer vista">
        <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <button
        onClick={() => onOrientationChange(orientation === 'horizontal' ? 'vertical' : 'horizontal')}
        className={`${btnCls} ml-0.5`}
        title={orientation === 'horizontal' ? 'Vista vertical (flujo hacia abajo)' : 'Vista horizontal (flujo lateral)'}
      >
        {orientation === 'horizontal'
          ? <Rows3 className="w-3.5 h-3.5 text-muted-foreground" />
          : <Columns3 className="w-3.5 h-3.5 text-muted-foreground" />
        }
      </button>
    </div>
  );
};

export default React.memo(MapControls);
