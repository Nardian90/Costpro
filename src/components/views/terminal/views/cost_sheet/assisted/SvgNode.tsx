'use client';

import React from 'react';
import type { CostMapNode } from './types';
import { getNodeInitial } from './map-layout';

interface SvgNodeProps {
  node: CostMapNode;
  pos: { x: number; y: number };
  index: number;
  isSelected: boolean;
  isCompleted: boolean;
  isHovered: boolean;
  onSelect: (nodeId: string) => void;
  onHoverStart: (nodeId: string) => void;
  onHoverEnd: () => void;
  // Simulation props
  simActiveNodeId?: string | null;
  simVisitedNodes?: Set<string>;
  simSkippedNodes?: Set<string>;
  simDisplayValue?: string | null;
  isSimulating?: boolean;
  simValidation?: { valid: boolean; reason: string | null } | null;
}

const SvgNode: React.FC<SvgNodeProps> = ({
  node, pos, index, isSelected, isCompleted, isHovered,
  onSelect, onHoverStart, onHoverEnd,
  simActiveNodeId, simVisitedNodes, simSkippedNodes, simDisplayValue, isSimulating, simValidation,
}) => {
  const initial = getNodeInitial(node.icon);

  // ── Simulation state ──
  const isSimActive = simActiveNodeId === node.id;
  const isSimVisited = simVisitedNodes?.has(node.id) || false;
  const isSimSkipped = simSkippedNodes?.has(node.id) || false;
  // BUG FIX: Previously `simActiveNodeId !== undefined` was always true (null !== undefined).
  // Now we use the explicit `isSimulating` flag from the simulation engine.
  const hasSimulation = !!isSimulating;

  // Opacity: gray out skipped/unvisited during simulation
  const simOpacity = hasSimulation
    ? isSimActive ? 1
      : isSimVisited ? 1
        : isSimSkipped ? 0.25
          : 0.2 // Not yet reached — very dim
    : undefined; // Normal mode — no opacity override

  return (
    <g
      className="svg-node-clickable"
      style={{ cursor: 'pointer', opacity: simOpacity, transition: 'opacity 0.4s ease' }}
      onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
      onMouseEnter={() => onHoverStart(node.id)}
      onMouseLeave={onHoverEnd}
    >
      {/* Simulation: Active glow pulse */}
      {isSimActive && (
        <>
          <rect
            x={pos.x - 8} y={pos.y - 8} width={156} height={72} rx="18"
            fill={node.color} fillOpacity="0.18"
            filter="url(#node-glow)"
          >
            <animate attributeName="fillOpacity" values="0.18;0.08;0.18" dur="1.2s" repeatCount="indefinite" />
          </rect>
          <rect
            x={pos.x - 3} y={pos.y - 3} width={146} height={62} rx="14"
            fill="none" stroke={node.color} strokeWidth="2" strokeOpacity="0.6">
            <animate attributeName="strokeOpacity" values="0.6;0.2;0.6" dur="1.2s" repeatCount="indefinite" />
          </rect>
        </>
      )}

      {/* Simulation: Visited + validated — green checkmark or red error */}
      {isSimVisited && !isSimActive && simValidation?.valid && (
        <g>
          <rect
            x={pos.x - 2} y={pos.y - 2} width={144} height={60} rx="13"
            fill="none" stroke="#10b981" strokeWidth="1.5" strokeOpacity="0.5"
          />
          <circle cx={pos.x + 130} cy={pos.y + 10} r="7" fill="#10b981" fillOpacity="0.9" />
          <text x={pos.x + 130} y={pos.y + 13.5} textAnchor="middle"
            fill="white" fontSize="8" fontWeight="900"
          >
            {'\u2713'}
          </text>
        </g>
      )}
      {isSimVisited && !isSimActive && simValidation && !simValidation.valid && (
        <g>
          <rect
            x={pos.x - 2} y={pos.y - 2} width={144} height={60} rx="13"
            fill="none" stroke="#ef4444" strokeWidth="2" strokeOpacity="0.8"
          />
          <circle cx={pos.x + 130} cy={pos.y + 10} r="7" fill="#ef4444" fillOpacity="0.9">
            <animate attributeName="r" values="6;8;6" dur="1s" repeatCount="indefinite" />
          </circle>
          <text x={pos.x + 130} y={pos.y + 14} textAnchor="middle"
            fill="white" fontSize="9" fontWeight="900"
          >
            !
          </text>
        </g>
      )}
      {/* Visited but no validation result yet (fallback) */}
      {isSimVisited && !isSimActive && !simValidation && (
        <rect
          x={pos.x - 2} y={pos.y - 2} width={144} height={60} rx="13"
          fill="none" stroke={node.color} strokeWidth="1.5" strokeOpacity="0.3"
          strokeDasharray="4 2"
        />
      )}

      {/* Glow for selected (normal mode) */}
      {!hasSimulation && isSelected && (
        <rect
          x={pos.x - 4} y={pos.y - 4} width={148} height={64} rx="16"
          fill={node.color} fillOpacity="0.12" filter="url(#node-glow)"
        />
      )}

      {/* Card background — opaque base layer prevents lines bleeding through */}
      <rect
        x={pos.x} y={pos.y} width={140} height={56} rx="12"
        fill="var(--color-card, #ffffff)"
        fillOpacity="1"
      />
      {/* Colored overlay for active/completed/selected states */}
      <rect
        x={pos.x} y={pos.y} width={140} height={56} rx="12"
        fill={isSimActive ? node.color : (isCompleted && !hasSimulation) ? node.color : isSelected && !hasSimulation ? node.color : 'transparent'}
        fillOpacity={isSimActive ? 0.15 : (isCompleted && !hasSimulation) ? 0.1 : isSelected && !hasSimulation ? 0.08 : 0}
        stroke={isSimActive ? node.color : (isCompleted && !hasSimulation) ? node.color : isSelected && !hasSimulation ? node.color : 'currentColor'}
        strokeOpacity={isSimActive ? 0.9 : isSelected ? 0.8 : isHovered ? 0.4 : 0.15}
        strokeWidth={isSimActive ? 2.5 : isSelected ? 2 : 1.5}
        filter={isSelected || isHovered || isSimActive ? 'url(#node-shadow)' : undefined}
      />

      {/* Step number badge */}
      <circle
        cx={pos.x + 18} cy={pos.y + 18} r="9"
        fill={isSimActive ? node.color : (isCompleted && !hasSimulation) ? node.color : isSelected && !hasSimulation ? node.color : 'currentColor'}
        fillOpacity={isSimActive ? 0.4 : (isCompleted && !hasSimulation) ? 0.2 : isSelected && !hasSimulation ? 0.15 : 0.08}
      />
      <text
        x={pos.x + 18} y={pos.y + 21.5} textAnchor="middle"
        fill={isSimActive ? '#ffffff' : (isCompleted && !hasSimulation) ? node.color : isSelected && !hasSimulation ? node.color : 'currentColor'}
        fontSize="8" fontWeight="800" fillOpacity={isSimActive ? 1 : (isCompleted && !hasSimulation) ? 1 : 0.5}
      >
        {isSimActive ? '\u25B6' : index + 1}
      </text>

      {/* Icon initial badge */}
      <rect x={pos.x + 32} y={pos.y + 10} width={26} height={18} rx="5"
        fill={node.color} fillOpacity={isSimActive ? 0.4 : (isCompleted && !hasSimulation) ? 0.2 : 0.12}
      />
      <text x={pos.x + 45} y={pos.y + 23} textAnchor="middle"
        fill={isSimActive ? '#ffffff' : node.color} fontSize="7" fontWeight="800" letterSpacing="0.05em"
      >
        {initial}
      </text>

      {/* Short label */}
      <text
        x={pos.x + 65} y={pos.y + 23} textAnchor="start"
        fill={isSimActive ? node.color : (isCompleted && !hasSimulation) ? node.color : 'currentColor'}
        fontSize="8.5" fontWeight="700" fillOpacity={isSimActive ? 1 : (isCompleted && !hasSimulation) ? 0.9 : 0.7}
      >
        {node.shortLabel.length > 12 ? node.shortLabel.slice(0, 12) + '\u2026' : node.shortLabel}
      </text>

      {/* Description — replaced by simulation value when active */}
      {isSimActive && simDisplayValue ? (
        <text x={pos.x + 14} y={pos.y + 42} textAnchor="start"
          fill={node.color} fontSize="7" fontWeight="800" fillOpacity="0.95"
        >
          {simDisplayValue.length > 28 ? simDisplayValue.slice(0, 28) + '\u2026' : simDisplayValue}
        </text>
      ) : isSimActive && !simDisplayValue ? (
        <text x={pos.x + 14} y={pos.y + 42} textAnchor="start"
          fill={node.color} fontSize="6.5" fontWeight="600" fillOpacity="0.5"
        >
          Sin datos — saltando...
        </text>
      ) : (
        <text x={pos.x + 14} y={pos.y + 42} textAnchor="start"
          fill="currentColor" fontSize="6.5" fontWeight="500" fillOpacity="0.35"
        >
          {node.description.length > 24 ? node.description.slice(0, 24) + '\u2026' : node.description}
        </text>
      )}

      {/* Completion checkmark */}
      {isCompleted && !hasSimulation && (
        <g>
          <circle cx={pos.x + 130} cy={pos.y + 10} r="7" fill={node.color} fillOpacity="0.9" />
          <text x={pos.x + 130} y={pos.y + 13.5} textAnchor="middle"
            fill="white" fontSize="8" fontWeight="900"
          >
            {'\u2713'}
          </text>
        </g>
      )}

      {/* Simulation active: animated dot */}
      {isSimActive && (
        <g>
          <circle cx={pos.x + 130} cy={pos.y + 10} r="6" fill={node.color} fillOpacity="0.8">
            <animate attributeName="r" values="5;7;5" dur="0.8s" repeatCount="indefinite" />
          </circle>
          <circle cx={pos.x + 130} cy={pos.y + 10} r="3" fill="#ffffff" fillOpacity="0.9">
            <animate attributeName="fillOpacity" values="0.9;0.4;0.9" dur="0.6s" repeatCount="indefinite" />
          </circle>
        </g>
      )}

      {/* Simulation skipped: X marker */}
      {isSimSkipped && (
        <circle cx={pos.x + 130} cy={pos.y + 10} r="5" fill="currentColor" fillOpacity="0.1" />
      )}

      {/* Status dot (pending, normal mode) */}
      {!isCompleted && !isSelected && !hasSimulation && (
        <circle cx={pos.x + 130} cy={pos.y + 10} r="3"
          fill="currentColor" fillOpacity="0.15"
        />
      )}

      {/* Hover tooltip (normal mode only) */}
      {isHovered && !isSelected && !hasSimulation && (
        <g>
          <rect x={pos.x + 20} y={pos.y - 34} width={140} height={24} rx="6"
            fill={node.color} fillOpacity="0.92"
          />
          <text x={pos.x + 90} y={pos.y - 18} textAnchor="middle"
            fill="white" fontSize="8.5" fontWeight="700"
          >
            {node.label.length > 26 ? node.label.slice(0, 26) + '\u2026' : node.label}
          </text>
        </g>
      )}

      {/* Simulation tooltip: show value prominently */}
      {isSimActive && simDisplayValue && (
        <g>
          <rect x={pos.x + 10} y={pos.y - 30} width={150} height={22} rx="6"
            fill={node.color} fillOpacity="0.95"
          />
          <text x={pos.x + 85} y={pos.y - 15} textAnchor="middle"
            fill="white" fontSize="9" fontWeight="900"
          >
            {simDisplayValue}
          </text>
        </g>
      )}
    </g>
  );
};

export default React.memo(SvgNode);
