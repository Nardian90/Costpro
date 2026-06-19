'use client';

import React, { useRef, useCallback, useMemo, useEffect, useState } from 'react';
import { Factory, AlertTriangle } from 'lucide-react';
import type { CostMapNode, WorkflowPhase, NodeValidationResult } from './types';
import type { CostSheetData, CalculatedRowValue, CostSheetHeader, CostSheetAnnex } from '@/types/cost-sheet';
import { cn } from '@/lib/utils';
import { computeNodeLayout, computeConnections, computeTransform } from './map-layout';
import SvgNode from './SvgNode';
import MapControls from './MapControls';
import Confetti from './Confetti';
import { SvgDefs, SvgGrid, SvgPhaseLabels, SvgConveyor, SvgConnections } from './SvgLayer';
import { useSimulation } from './useSimulation';

interface InteractiveCostMapProps {
  nodes: CostMapNode[];
  phases: WorkflowPhase[];
  selectedNodeId: string | null;
  completedNodes: Set<string>;
  onNodeSelect: (nodeId: string) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onPanReset?: (resetFn: () => void) => void;
  orientation: 'horizontal' | 'vertical';
  onOrientationChange: (orientation: 'horizontal' | 'vertical') => void;
  // Simulation data props
  data: CostSheetData | null;
  calculatedValues: Record<string, CalculatedRowValue>;
  calculatedHeader?: Partial<CostSheetHeader>;
  calculatedAnnexes?: CostSheetAnnex[] | null;
  onSimulationResult?: (results: Record<string, NodeValidationResult>, errorNodeId: string | null) => void;
}

const InteractiveCostMap = React.memo(function InteractiveCostMap({
  nodes, phases, selectedNodeId, completedNodes, onNodeSelect,
  zoom, onZoomChange, onPanReset, orientation, onOrientationChange,
  data, calculatedValues, calculatedAnnexes, onSimulationResult,
}: InteractiveCostMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const hasDragged = useRef(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isZoomActive, setIsZoomActive] = useState(false);

  const DRAG_THRESHOLD = 4;

  // ── Simulation engine ──
  const {
    phase: simPhase,
    activeNodeId: simActiveNodeId,
    visitedNodes: simVisitedNodes,
    skippedNodes: simSkippedNodes,
    displayValue: simDisplayValue,
    productName: simProductName,
    play: simPlay,
    pause: simPause,
    resume: simResume,
    stop: simStop,
    isSimulating,
    hasErrors,
    nodeValidations: simNodeValidations,
    errorNodeId: simErrorNodeId,
    errorReason: simErrorReason,
    validCount,
    errorCount,
  } = useSimulation(nodes, completedNodes, data, calculatedValues, calculatedAnnexes);

  // ── Layout ──
  const layout = useMemo(() => computeNodeLayout(nodes, orientation), [nodes, orientation]);
  const connections = useMemo(() => computeConnections(nodes, layout.positions, orientation), [nodes, layout.positions, orientation]);
  const svgCenter = useMemo(() => ({ x: layout.totalWidth / 2, y: layout.totalHeight / 2 }), [layout]);

  // ── Completion % ──
  const completionPercent = useMemo(() => {
    if (nodes.length === 0) return 0;
    return Math.round((completedNodes.size / nodes.length) * 100);
  }, [completedNodes, nodes.length]);

  // ── Zoom: ONLY via wheel when zoom is already active ──
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!isZoomActive) return;
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      onZoomChange(Math.min(2.5, Math.max(0.3, zoom + delta)));
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = setTimeout(() => setIsZoomActive(false), 3000);
    },
    [zoom, onZoomChange, isZoomActive],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel as EventListener, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel as EventListener);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
    };
  }, [handleWheel]);

  // ── Mouse interaction: Figma/Miro/Excalidraw standard pattern ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as SVGElement).closest('.svg-node-clickable')) return;
    if (isSimulating) return; // Disable pan during simulation
    e.preventDefault();
    hasDragged.current = false;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
  }, [panOffset, isSimulating]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    if (!hasDragged.current && (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD)) {
      hasDragged.current = true;
    }
    if (hasDragged.current) {
      setPanOffset({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
    }
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    if (isPanning && !hasDragged.current && !isSimulating) {
      setIsZoomActive(prev => !prev);
    }
    setIsPanning(false);
    hasDragged.current = false;
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
  }, [isPanning, isSimulating]);

  // ── Pan reset ──
  const resetPan = useCallback(() => {
    setPanOffset({ x: 0, y: 0 });
    setIsZoomActive(false);
    onZoomChange(0.6);
  }, [onZoomChange]);
  useEffect(() => { onPanReset?.(resetPan); }, [resetPan, onPanReset]);

  // ── Transform ──
  const svgTransform = useMemo(
    () => computeTransform(zoom, panOffset.x, panOffset.y, svgCenter.x, svgCenter.y),
    [zoom, panOffset, svgCenter],
  );

  // ── Control handlers ──
  const handleZoomIn = useCallback(() => {
    setIsZoomActive(true);
    if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    wheelTimeoutRef.current = setTimeout(() => setIsZoomActive(false), 3000);
    onZoomChange(Math.min(2.5, zoom + 0.15));
  }, [zoom, onZoomChange]);

  const handleZoomOut = useCallback(() => {
    setIsZoomActive(true);
    if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    wheelTimeoutRef.current = setTimeout(() => setIsZoomActive(false), 3000);
    onZoomChange(Math.max(0.3, zoom - 0.15));
  }, [zoom, onZoomChange]);

  const handleReset = useCallback(() => {
    setPanOffset({ x: 0, y: 0 });
    setIsZoomActive(false);
    onZoomChange(0.6);
  }, [onZoomChange]);

  // ── Notify parent of simulation results (for audit sidebar) ──
  useEffect(() => {
    if ((simPhase === 'complete' || simPhase === 'error') && onSimulationResult) {
      onSimulationResult(simNodeValidations, simErrorNodeId);
    }
  }, [simPhase, simNodeValidations, simErrorNodeId, onSimulationResult]);
  const handleSimPlay = useCallback(() => {
    if (simPhase === 'paused') {
      simResume();
    } else {
      simPlay();
    }
  }, [simPhase, simPlay, simResume]);

  // Stop simulation and reset
  const handleSimStop = useCallback(() => {
    simStop();
  }, [simStop]);

  return (
    <div className="relative flex flex-col h-full">
      {/* Controls */}
      <MapControls
        zoom={zoom}
        isZoomActive={isZoomActive}
        orientation={orientation}
        simPhase={simPhase}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
        onOrientationChange={onOrientationChange}
        onSimPlay={handleSimPlay}
        onSimPause={simPause}
        onSimStop={handleSimStop}
      />

      {/* Zoom active indicator */}
      {isZoomActive && !isSimulating && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/20">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[9px] font-bold text-primary uppercase tracking-widest">
            Zoom activo
          </span>
        </div>
      )}

      {/* Simulation indicator */}
      {isSimulating && (
        <div className={cn(
          'absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2 py-1 rounded-md border',
          simPhase === 'running' ? 'bg-success/10 border-success/20' :
          simPhase === 'paused' ? 'bg-warning/10 border-warning/20' :
          simPhase === 'error' ? 'bg-rose-500/10 border-rose-500/20' :
          'bg-primary/10 border-primary/20',
        )}>
          <div className={cn(
            'w-1.5 h-1.5 rounded-full',
            simPhase === 'running' ? 'bg-success animate-pulse' :
            simPhase === 'paused' ? 'bg-warning' :
            simPhase === 'error' ? 'bg-rose-500 animate-pulse' : 'bg-primary',
          )} />
          <span className={cn(
            'text-[9px] font-bold uppercase tracking-widest',
            simPhase === 'running' ? 'text-success dark:text-emerald-400' :
            simPhase === 'paused' ? 'text-warning dark:text-amber-400' :
            simPhase === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-primary',
          )}>
            {simPhase === 'running' ? 'Auditando...' : simPhase === 'paused' ? 'Pausado' : simPhase === 'error' ? 'Error detectado' : 'Completado'}
          </span>
        </div>
      )}

      {/* Product name banner during simulation */}
      {isSimulating && simProductName && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-1.5 rounded-full bg-card border border-border/60 shadow-lg">
          <Factory className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-foreground">
            {simProductName}
          </span>
        </div>
      )}

      {/* Confetti only on SUCCESS */}
      <Confetti active={simPhase === 'complete'} />

      {/* SVG Canvas */}
      <div
        ref={containerRef}
        className={cn(
          'flex-1 overflow-hidden transition-colors duration-200',
          isPanning && !isSimulating ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp();
          setHoveredNode(null);
        }}
      >
        <svg
          viewBox={`0 0 ${layout.totalWidth} ${layout.totalHeight}`}
          className="w-full h-full select-none"
        >
          <SvgDefs orientation={orientation} />

          <g transform={svgTransform}>
            <SvgGrid layout={layout} />
            <SvgPhaseLabels nodes={nodes} phases={phases} layout={layout} orientation={orientation} />
            <SvgConveyor layout={layout} orientation={orientation} />
            <SvgConnections
              connections={connections}
              activeNodeId={simActiveNodeId}
              visitedNodes={simVisitedNodes}
              isSimulating={isSimulating}
              nodes={nodes}
            />

            {nodes.map((node, index) => {
              const pos = layout.positions[node.id];
              if (!pos) return null;
              return (
                <SvgNode
                  key={node.id}
                  node={node}
                  pos={pos}
                  index={index}
                  isSelected={selectedNodeId === node.id}
                  isCompleted={completedNodes.has(node.id)}
                  isHovered={hoveredNode === node.id}
                  onSelect={onNodeSelect}
                  onHoverStart={setHoveredNode}
                  onHoverEnd={() => setHoveredNode(null)}
                  simActiveNodeId={simActiveNodeId}
                  simVisitedNodes={simVisitedNodes}
                  simSkippedNodes={simSkippedNodes}
                  simDisplayValue={simActiveNodeId === node.id ? simDisplayValue : undefined}
                  isSimulating={isSimulating}
                  simValidation={simNodeValidations[node.id] || null}
                />
              );
            })}
          </g>
        </svg>

        {/* Empty state */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center opacity-40">
              <Factory className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Seleccione un modo para ver el mapa
              </p>
            </div>
          </div>
        )}

        {/* Simulation complete overlay — SUCCESS */}
        {simPhase === 'complete' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center animate-in fade-in zoom-in duration-500">
              <div className="text-3xl mb-2">{'\u{1F389}'}</div>
              <p className="text-sm font-black uppercase tracking-widest text-primary">
                Auditoria Completada
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {validCount}/{nodes.length} nodos validados sin errores
              </p>
            </div>
          </div>
        )}

        {/* Simulation ERROR overlay */}
        {simPhase === 'error' && simErrorNodeId && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center animate-in fade-in zoom-in duration-500">
              <div className="mx-auto w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center mb-3">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <p className="text-sm font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">
                Error Detectado
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-[260px]">
                {simErrorReason}
              </p>
              <p className="text-[9px] text-muted-foreground/60 mt-2">
                {validCount} ok / {errorCount} error — revise en el panel izquierdo
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom progress bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-border/30 bg-card/50">
        <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500 ease-out',
              simPhase === 'complete' ? 'bg-gradient-to-r from-success via-cyan-500 to-primary' :
              simPhase === 'error' ? 'bg-gradient-to-r from-rose-500 to-warning' :
              'bg-primary',
            )}
            style={{ width: `${completionPercent}%` }}
          />
        </div>
        <span className="text-[10px] font-mono font-bold text-muted-foreground whitespace-nowrap">
          {completedNodes.size}/{nodes.length} completados ({completionPercent}%)
        </span>
      </div>
    </div>
  );
});

export default InteractiveCostMap;
