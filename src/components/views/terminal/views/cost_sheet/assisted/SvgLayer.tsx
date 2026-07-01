'use client';

import React from 'react';
import type { CostMapNode, WorkflowPhase } from './types';
import type { MapLayout, ConnectionLine } from './map-layout';

import { useTranslations } from 'next-intl';
// ── SVG defs (filters + gradients) ──
export function SvgDefs({ orientation }: { orientation: 'horizontal' | 'vertical' }) {
  const t = useTranslations('costSheet');
  return (
    <defs>
      <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="node-shadow" x="-10%" y="-10%" width="120%" height="130%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.08" />
      </filter>
      <linearGradient id="conveyor-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
        <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#64748b" stopOpacity="0.3" />
      </linearGradient>
      <linearGradient id="conn-grad-v" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.5" />
      </linearGradient>
    </defs>
  );
}

// ── Background grid ──
export function SvgGrid({ layout }: { layout: MapLayout }) {
  const gridVCount = Math.ceil(layout.totalWidth / 80) + 1;
  const gridHCount = Math.ceil(layout.totalHeight / 50) + 1;

  return (
    <>
      {Array.from({ length: gridVCount }).map((_, i) => (
        <line key={`vg-${i}`} x1={i * 80} y1="0" x2={i * 80} y2={layout.totalHeight}
          stroke="currentColor" strokeOpacity="0.03" strokeWidth="1"
        />
      ))}
      {Array.from({ length: gridHCount }).map((_, i) => (
        <line key={`hg-${i}`} x1="0" y1={i * 50} x2={layout.totalWidth} y2={i * 50}
          stroke="currentColor" strokeOpacity="0.03" strokeWidth="1"
        />
      ))}
    </>
  );
}

// ── Phase labels ──
export function SvgPhaseLabels({
  nodes, phases, layout, orientation,
}: {
  nodes: CostMapNode[]; phases: WorkflowPhase[];
  layout: MapLayout; orientation: 'horizontal' | 'vertical';
}) {
  return (
    <>
      {phases.filter(p => p.nodes.length > 0).map((phase) => {
        const firstNode = nodes.find(n => n.id === phase.nodes[0]);
        const lastNode = nodes.find(n => n.id === phase.nodes[phase.nodes.length - 1]);
        const firstPos = firstNode ? layout.positions[firstNode.id] : null;
        const lastPos = lastNode ? layout.positions[lastNode.id] : null;
        if (!firstPos || !lastPos) return null;

        if (orientation === 'horizontal') {
          const centerX = (firstPos.x + lastPos.x + layout.NODE_W) / 2;
          return (
            <g key={phase.id}>
              <rect x={firstPos.x - 10} y="10"
                width={lastPos.x + layout.NODE_W - firstPos.x + 20} height="28" rx="6"
                fill={phase.color} fillOpacity="0.06"
              />
              <text x={centerX} y="22" textAnchor="middle"
                fill={phase.color} fontSize="9" fontWeight="800"
                letterSpacing="0.15em" fillOpacity="0.7"
              >
                {phase.label}
              </text>
              <text x={centerX} y="34" textAnchor="middle"
                fill="currentColor" fontSize="7" fontWeight="600"
                letterSpacing="0.1em" fillOpacity="0.3"
              >
                {phase.sublabel}
              </text>
            </g>
          );
        }

        // Vertical: label above the first node of each phase, centered
        const centerX = firstPos.x + layout.NODE_W / 2;
        const labelY = firstPos.y - 14;
        return (
          <g key={phase.id}>
            <rect x={centerX - 60} y={labelY - 14} width={120} height="24" rx="6"
              fill={phase.color} fillOpacity="0.06"
            />
            <text x={centerX} y={labelY - 2} textAnchor="middle"
              fill={phase.color} fontSize="9" fontWeight="800"
              letterSpacing="0.15em" fillOpacity="0.7"
            >
              {phase.label}
            </text>
            <text x={centerX} y={labelY + 8} textAnchor="middle"
              fill="currentColor" fontSize="7" fontWeight="600"
              letterSpacing="0.1em" fillOpacity="0.3"
            >
              {phase.sublabel}
            </text>
          </g>
        );
      })}
    </>
  );
}

// ── Conveyor belt line (horizontal only — removed in vertical to avoid strike-through on cards) ──
export function SvgConveyor({ layout, orientation }: { layout: MapLayout; orientation: 'horizontal' | 'vertical' }) {
  if (orientation === 'vertical') return null;
  return (
    <rect x="40" y={200 - 1} width={layout.totalWidth - 80} height="2" rx="1"
      fill="url(#conveyor-grad)"
    />
  );
}

// ── Connection lines ──
export function SvgConnections({
  connections,
  activeNodeId,
  visitedNodes,
  isSimulating,
  nodes,
}: {
  connections: ConnectionLine[];
  activeNodeId?: string | null;
  visitedNodes?: Set<string>;
  isSimulating?: boolean;
  nodes?: CostMapNode[];
}) {
  return (
    <>
      {connections.map((line, i) => {
        // BUG FIX: Previously `i === connections.length - 1` only highlighted the last connection.
        // Connection i goes FROM nodes[i] TO nodes[i+1]. Active when target = activeNodeId.
        const targetNodeId = nodes && nodes[i + 1] ? nodes[i + 1].id : null;
        const isActive = !!isSimulating && activeNodeId != null && targetNodeId === activeNodeId;
        const hasSimulation = !!isSimulating;

        if (line.type === 'h') {
          const midX = (line.x1 + line.x2) / 2;
          return (
            <g key={`conn-${i}`}>
              <line x1={line.x1} y1={line.y1} x2={midX} y2={line.y1}
                stroke={isActive ? '#10b981' : 'currentColor'}
                strokeOpacity={isActive ? 0.6 : hasSimulation && visitedNodes ? 0.04 : 0.12}
                strokeWidth={isActive ? 2.5 : 1.5}
                strokeDasharray={isActive ? '8 4' : '6 3'}
              >
                {isActive && (
                  <animate attributeName="strokeDashoffset" from="24" to="0" dur="0.8s" repeatCount="indefinite" />
                )}
              </line>
              <line x1={midX} y1={line.y1} x2={line.x2} y2={line.y2}
                stroke={isActive ? '#10b981' : 'currentColor'}
                strokeOpacity={isActive ? 0.6 : hasSimulation && visitedNodes ? 0.04 : 0.12}
                strokeWidth={isActive ? 2.5 : 1.5}
                strokeDasharray={isActive ? '8 4' : '6 3'}
              >
                {isActive && (
                  <animate attributeName="strokeDashoffset" from="24" to="0" dur="0.8s" repeatCount="indefinite" />
                )}
              </line>
              <polygon
                points={`${line.x2 - 5},${line.y2 - 3} ${line.x2},${line.y2} ${line.x2 - 5},${line.y2 + 3}`}
                fill={isActive ? '#10b981' : 'currentColor'}
                fillOpacity={isActive ? 0.8 : 0.15}
              />
            </g>
          );
        }

        // Vertical connection — clean segmented line in gap between nodes only
        const gapLen = line.y2 - line.y1;
        const endY = line.y2;
        const startX = line.x1;
        const endX = line.x2;
        // Draw a clean line with rounded cap + bottom arrow + dot junctions
        return (
          <g key={`conn-${i}`}>
            {/* Start dot (bottom of source node) */}
            <circle cx={startX} cy={line.y1} r="2.5"
              fill={isActive ? '#10b981' : 'currentColor'}
              fillOpacity={isActive ? 0.7 : 0.18}
            />
            {/* Main line segment in the gap between nodes */}
            <line x1={startX} y1={line.y1 + 4} x2={endX} y2={endY - 6}
              stroke={isActive ? '#10b981' : 'currentColor'}
              strokeOpacity={isActive ? 0.7 : hasSimulation && visitedNodes ? 0.06 : 0.18}
              strokeWidth={isActive ? 2 : 1.5}
              strokeLinecap="round"
              strokeDasharray={isActive ? '6 4' : 'none'}
            >
              {isActive && (
                <animate attributeName="strokeDashoffset" from="20" to="0" dur="0.8s" repeatCount="indefinite" />
              )}
            </line>
            {/* End arrow pointing down */}
            <polygon
              points={`${endX - 4},${endY - 6} ${endX},${endY} ${endX + 4},${endY - 6}`}
              fill={isActive ? '#10b981' : 'currentColor'}
              fillOpacity={isActive ? 0.8 : 0.2}
            />
          </g>
        );
      })}
    </>
  );
}
