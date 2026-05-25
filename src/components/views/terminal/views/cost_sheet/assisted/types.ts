// ── Cost Map Contextual Orchestration System ──
// Enterprise-grade assisted mode replacing the linear wizard
// Based on: Res 148/2023, COGEY, ISO 9001 cost standards

export interface CostMapNode {
  id: string;
  mode: 'prod' | 'serv' | 'com';
  phase: 'input' | 'process' | 'overhead' | 'finance' | 'output';
  label: string;
  shortLabel: string;
  description: string;
  icon: string; // lucide icon name
  color: string; // hex color for SVG
  tailwindColor: string; // tailwind color class for HTML elements
  borderColor: string; // tailwind border class
  bgColor: string; // tailwind bg class
  textColor: string; // tailwind text class
  rowId?: string; // which cost section to show (main, overhead, finance)
  annexId?: string; // which annex this edits
  isHeader?: boolean;
  isSignature?: boolean;
  isSection?: boolean;
  regulatoryTip?: string;
  articleRef?: string;
}

export interface WorkflowPhase {
  id: string;
  label: string;
  sublabel: string;
  color: string; // hex color for SVG
  nodes: string[]; // node IDs in this phase
}

export type ActiveMode = 'prod' | 'serv' | 'com';

export interface SidebarMetrics {
  productName: string;
  totalCost?: number;
  salePrice?: number;
  utilityPercent: number | null;
  filledAnnexes: number;
}

// ── Validation result per node (used by simulation + audit) ──
export interface NodeValidationResult {
  valid: boolean;
  reason: string | null;
}
