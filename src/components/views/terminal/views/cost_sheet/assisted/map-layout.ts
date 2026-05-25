import type { CostMapNode } from './types';

// ── Icon component mapper for SVG rendering ──
const ICON_INITIALS: Record<string, string> = {
  Building2: 'PR', Warehouse: 'AL', Users: 'OB', Wrench: 'EQ', Truck: 'OT',
  Factory: 'TA', AlertTriangle: 'GI', DollarSign: 'PV', FileCheck: 'AP',
};

export function getNodeInitial(icon: string): string {
  return ICON_INITIALS[icon] || icon.slice(0, 2).toUpperCase();
}

// ── Layout constants ──
const NODE_W = 140;
const NODE_H = 56;

export interface MapLayout {
  positions: Record<string, { x: number; y: number }>;
  phaseStartX: Record<string, number>;
  phaseGroups: Record<string, CostMapNode[]>;
  phaseOrder: string[];
  totalWidth: number;
  totalHeight: number;
  NODE_W: number;
  NODE_H: number;
}

// ── Horizontal layout (phases left-to-right, nodes staggered) ──
function computeHorizontalLayout(nodes: CostMapNode[]): MapLayout {
  const PHASE_GAP = 30;
  const NODE_GAP = 16;
  const START_X = 60;
  const CENTER_Y = 200;

  const { phaseGroups, phaseOrder, positions, phaseStartX } = groupByPhase(nodes);
  let currentX = START_X;

  for (const phaseId of phaseOrder) {
    const group = phaseGroups[phaseId] || [];
    if (group.length === 0) continue;

    phaseStartX[phaseId] = currentX;
    const phaseWidth = group.length * NODE_W + (group.length - 1) * NODE_GAP;
    const startX = currentX + (phaseWidth - NODE_W) / 2;

    group.forEach((node, i) => {
      const row = i % 2;
      const col = Math.floor(i / 2);
      const x = startX + col * (NODE_W * 2 + NODE_GAP);
      const y = CENTER_Y + (row === 0 ? -40 : 40);
      positions[node.id] = { x, y };
    });

    if (group.length === 1) {
      positions[group[0].id] = { x: currentX + (phaseWidth - NODE_W) / 2, y: CENTER_Y };
    }

    currentX += phaseWidth + PHASE_GAP;
  }

  return { positions, phaseStartX, phaseGroups, phaseOrder, totalWidth: currentX + 60, totalHeight: 400, NODE_W, NODE_H };
}

// ── Vertical layout (phases top-to-bottom, nodes stacked within each phase) ──
function computeVerticalLayout(nodes: CostMapNode[]): MapLayout {
  const NODE_GAP_Y = 14;        // gap between nodes within a phase
  const PHASE_GAP_Y = 28;       // gap between phases
  const PHASE_HEADER_H = 30;    // space for phase label above nodes
  const START_X = 40;
  const START_Y = 60;

  const { phaseGroups, phaseOrder, positions, phaseStartX } = groupByPhase(nodes);
  // Wider SVG so nodes render at similar visual size as horizontal mode.
  // Previously 220px caused ~2.3× inflation in a 500px container.
  const svgWidth = Math.max(NODE_W * 3, 400);

  let currentY = START_Y;

  for (const phaseId of phaseOrder) {
    const group = phaseGroups[phaseId] || [];
    if (group.length === 0) continue;

    const phaseStartXPos = (svgWidth - NODE_W) / 2;
    phaseStartX[phaseId] = phaseStartXPos;

    // Phase label goes at currentY, nodes start below it
    const nodesY = currentY + PHASE_HEADER_H;

    group.forEach((node, i) => {
      positions[node.id] = {
        x: phaseStartXPos,
        y: nodesY + i * (NODE_H + NODE_GAP_Y),
      };
    });

    // Advance: header + (nodeCount * nodeH + (nodeCount-1) * nodeGap) + phase gap
    const phaseHeight = PHASE_HEADER_H + group.length * NODE_H + (group.length - 1) * NODE_GAP_Y;
    currentY += phaseHeight + PHASE_GAP_Y;
  }

  return { positions, phaseStartX, phaseGroups, phaseOrder, totalWidth: svgWidth, totalHeight: currentY + 40, NODE_W, NODE_H };
}

// ── Main layout entry point ──
export function computeNodeLayout(nodes: CostMapNode[], orientation: 'horizontal' | 'vertical'): MapLayout {
  if (orientation === 'horizontal') return computeHorizontalLayout(nodes);
  return computeVerticalLayout(nodes);
}

// ── Connection paths between nodes ──
export interface ConnectionLine {
  x1: number; y1: number; x2: number; y2: number;
  type: 'h' | 'v';
}

export function computeConnections(
  nodes: CostMapNode[],
  positions: Record<string, { x: number; y: number }>,
  orientation: 'horizontal' | 'vertical',
): ConnectionLine[] {
  const nodePhase: Record<string, string> = {};
  for (const node of nodes) nodePhase[node.id] = node.phase;

  const lines: ConnectionLine[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = positions[nodes[i].id];
    const to = positions[nodes[i + 1].id];
    if (!from || !to) continue;

    const samePhase = nodePhase[nodes[i].id] === nodePhase[nodes[i + 1].id];

    if (orientation === 'horizontal' || samePhase) {
      lines.push({
        x1: from.x + NODE_W, y1: from.y + NODE_H / 2,
        x2: to.x, y2: to.y + NODE_H / 2,
        type: 'h',
      });
    } else {
      lines.push({
        x1: from.x + NODE_W / 2, y1: from.y + NODE_H,
        x2: to.x + NODE_W / 2, y2: to.y,
        type: 'v',
      });
    }
  }
  return lines;
}

// ── Compute zoom-focused transform (proper SVG transform-origin) ──
export function computeTransform(
  zoom: number, panX: number, panY: number,
  svgCenterX: number, svgCenterY: number,
): string {
  return `translate(${panX + svgCenterX * (1 - zoom)}, ${panY + svgCenterY * (1 - zoom)}) scale(${zoom})`;
}

// ── Helpers ──
function groupByPhase(nodes: CostMapNode[]) {
  const phaseGroups: Record<string, CostMapNode[]> = {};
  const positions: Record<string, { x: number; y: number }> = {};
  const phaseStartX: Record<string, number> = {};
  const phaseOrder = ['input', 'process', 'overhead', 'finance', 'output'];

  for (const node of nodes) {
    if (!phaseGroups[node.phase]) phaseGroups[node.phase] = [];
    phaseGroups[node.phase].push(node);
  }

  return { phaseGroups, phaseOrder, positions, phaseStartX };
}
