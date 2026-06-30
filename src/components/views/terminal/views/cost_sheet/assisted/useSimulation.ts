'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { CostMapNode, NodeValidationResult } from './types';
import type { CostSheetData, CalculatedRowValue, CostSheetAnnex } from '@/types/cost-sheet';
import { validateSimulationNode } from './constants';

// ── Canonical row total extraction (same pattern as useCostSheetCalculator) ──
function getRowTotal(row: Record<string, any>): number {
  const val = [row.total, row.amount, row.depreciation_cost, row.price_total, row.importe]
    .find((v) => v !== undefined && v !== null);
  return typeof val === 'number' ? val : parseFloat(String(val ?? 0)) || 0;
}

function sumAnnexRows(annex: CostSheetAnnex | undefined): number {
  if (!annex?.data || annex.data.length === 0) return 0;
  return annex.data.reduce((sum: number, row: any) => sum + getRowTotal(row), 0);
}

// ── Simulation states ──
export type SimPhase = 'idle' | 'running' | 'paused' | 'complete' | 'error';

export interface SimulationState {
  phase: SimPhase;
  activeNodeId: string | null;
  visitedNodes: Set<string>;
  skippedNodes: Set<string>;
  displayValue: string | null;
  runningTotal: number;
  productName: string | null;
  nodeValidations: Record<string, NodeValidationResult>;
  errorNodeId: string | null;
  errorReason: string | null;
}

const INITIAL_STATE: SimulationState = {
  phase: 'idle',
  activeNodeId: null,
  visitedNodes: new Set(),
  skippedNodes: new Set(),
  displayValue: null,
  runningTotal: 0,
  productName: null,
  nodeValidations: {},
  errorNodeId: null,
  errorReason: null,
};

const NODE_DWELL_MS = 1800;
const SKIP_DWELL_MS = 600;
const VALIDATION_PAUSE_MS = 800;  // Extra pause after validation to show icon
const PAUSE_BEFORE_FINAL = 800;

export function useSimulation(
  nodes: CostMapNode[],
  completedNodes: Set<string>,
  data: CostSheetData | null,
  calculatedValues: Record<string, CalculatedRowValue>,
  calculatedAnnexes?: CostSheetAnnex[] | null,
) {
  const [state, setState] = useState<SimulationState>(INITIAL_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodeIndexRef = useRef(0);
  const cancelledRef = useRef(false);

  // ── Helper: find annex (prefer calculated, fallback to raw) ──
  const findAnnex = useCallback((annexId: string): CostSheetAnnex | undefined => {
    if (calculatedAnnexes && calculatedAnnexes.length > 0) {
      const found = calculatedAnnexes.find((a) => a.id === annexId);
      if (found) return found;
    }
    return (data?.annexes || []).find((a: any) => a.id === annexId);
  }, [data, calculatedAnnexes]);

  // ── Compute display value for a node ──
  const getNodeDisplayValue = useCallback((node: CostMapNode): string | null => {
    if (node.isHeader) {
      return data?.header?.name || 'Sin nombre';
    }
    if (node.annexId) {
      const annex = findAnnex(node.annexId);
      const total = sumAnnexRows(annex);
      return total > 0 ? formatNumber(total) : null;
    }
    if (node.isSection) {
      if (node.rowId === 'main') {
        const v = calculatedValues['5.1']?.total;
        return v != null && v > 0 ? formatNumber(v) : null;
      }
      if (node.rowId === 'overhead') {
        const v = calculatedValues['11.1']?.total;
        return v != null && v > 0 ? formatNumber(v) : null;
      }
      if (node.rowId === 'finance') {
        const v = calculatedValues['14.1']?.total;
        return v != null && v > 0 ? formatNumber(v) : null;
      }
    }
    if (node.isSignature) {
      return completedNodes.has(node.id) ? 'Ficha completa' : null;
    }
    return null;
  }, [data, calculatedValues, completedNodes, findAnnex]);

  // ── Compute running total ──
  const getRunningTotal = useCallback((nodeId: string): number => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return 0;

    if (node.isSection) {
      if (node.rowId === 'main') return calculatedValues['5.1']?.total || 0;
      if (node.rowId === 'overhead') return calculatedValues['11.1']?.total || 0;
      if (node.rowId === 'finance') return calculatedValues['14.1']?.total || 0;
    }

    let total = 0;
    for (const n of nodes) {
      if (n.annexId) {
        const annex = findAnnex(n.annexId);
        total += sumAnnexRows(annex);
      }
      if (n.id === nodeId) break;
    }
    return total;
  }, [nodes, calculatedValues, findAnnex]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Advance to next node (with validation) ──
  const advanceToNext = useCallback(() => {
    if (cancelledRef.current) return;

    let nextIndex = nodeIndexRef.current;
    while (nextIndex < nodes.length) {
      const node = nodes[nextIndex];
      const value = getNodeDisplayValue(node);
      const isCompleted = completedNodes.has(node.id);

      if (isCompleted && value !== null) {
        // ── Node has data: animate, then VALIDATE ──
        nodeIndexRef.current = nextIndex;
        setState(prev => ({
          ...prev,
          activeNodeId: node.id,
          displayValue: value,
          runningTotal: getRunningTotal(node.id),
          productName: prev.productName || (node.isHeader ? (data?.header?.name || null) : prev.productName),
        }));

        const isFinal = node.isSection && node.rowId === 'finance';
        const dwell = isFinal ? NODE_DWELL_MS + PAUSE_BEFORE_FINAL : NODE_DWELL_MS;

        timerRef.current = setTimeout(() => {
          if (cancelledRef.current) return;

          // ── VALIDATE this node ──
          const enrichedData = { ...data, calculatedValues };
          const validation = validateSimulationNode(node, enrichedData, calculatedValues, calculatedAnnexes);

          // Store result
          setState(prev => ({
            ...prev,
            nodeValidations: { ...prev.nodeValidations, [node.id]: validation },
            activeNodeId: null,
          }));

          if (!validation.valid) {
            // ── ERROR: stop simulation, highlight the failed node ──
            timerRef.current = setTimeout(() => {
              if (cancelledRef.current) return;
              setState(prev => {
                const newVisited = new Set(prev.visitedNodes);
                newVisited.add(node.id);
                return {
                  ...prev,
                  visitedNodes: newVisited,
                  phase: 'error',
                  activeNodeId: node.id,
                  errorNodeId: node.id,
                  errorReason: validation.reason,
                };
              });
              nodeIndexRef.current = nextIndex + 1;
            }, VALIDATION_PAUSE_MS);
            return;
          }

          // ── VALID: continue to next node ──
          timerRef.current = setTimeout(() => {
            if (cancelledRef.current) return;
            setState(prev => {
              const newVisited = new Set(prev.visitedNodes);
              newVisited.add(node.id);
              return { ...prev, visitedNodes: newVisited, activeNodeId: null };
            });
            nodeIndexRef.current = nextIndex + 1;
            advanceToNext();
          }, VALIDATION_PAUSE_MS);
        }, dwell);
        return;
      }

      // ── No data — skip this node ──
      const skipNode = () => {
        setState(prev => {
          const newSkipped = new Set(prev.skippedNodes);
          newSkipped.add(node.id);
          return { ...prev, skippedNodes: newSkipped };
        });
      };

      if (isCompleted || node.isSignature) {
        nodeIndexRef.current = nextIndex;
        setState(prev => ({
          ...prev,
          activeNodeId: node.id,
          displayValue: null,
        }));
        timerRef.current = setTimeout(() => {
          if (cancelledRef.current) {
            return;
          }
          skipNode();
          setState(prev => ({ ...prev, activeNodeId: null }));
          nodeIndexRef.current = nextIndex + 1;
          advanceToNext();
        }, SKIP_DWELL_MS);
        return;
      }

      // Not completed — skip silently
      skipNode();
      nextIndex++;
    }

    // ── All nodes passed validation — SUCCESS ──
    setState(prev => ({
      ...prev,
      phase: 'complete',
      activeNodeId: null,
    }));
  }, [nodes, completedNodes, getNodeDisplayValue, getRunningTotal, data, calculatedValues]);

  // ── Play ──
  const play = useCallback(() => {
    cancelledRef.current = false;
    clearTimer();
    nodeIndexRef.current = 0;
    setState({
      ...INITIAL_STATE,
      phase: 'running',
      productName: data?.header?.name || null,
    });
    timerRef.current = setTimeout(() => advanceToNext(), 400);
  }, [data, clearTimer, advanceToNext]);

  // ── Pause ──
  const pause = useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
    setState(prev => ({ ...prev, phase: 'paused' }));
  }, [clearTimer]);

  // ── Resume ──
  const resume = useCallback(() => {
    cancelledRef.current = false;
    setState(prev => ({ ...prev, phase: 'running' }));
    advanceToNext();
  }, [advanceToNext]);

  // ── Stop / Reset ──
  const stop = useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
    setState(INITIAL_STATE);
    nodeIndexRef.current = 0;
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearTimer();
    };
  }, [clearTimer]);

  return {
    ...state,
    play,
    pause,
    resume,
    stop,
    isSimulating: state.phase !== 'idle',
    hasErrors: state.phase === 'error',
    validCount: Object.values(state.nodeValidations).filter(v => v.valid).length,
    errorCount: Object.values(state.nodeValidations).filter(v => !v.valid).length,
  };
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(2);
}
