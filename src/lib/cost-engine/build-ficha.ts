/**
 * Pure functions that build engine-ready FichaJSON from a CostSheetData template.
 *
 * CRITICAL: All shared mapping logic now lives in shared-mapping.ts.
 * This file is a thin orchestrator — any mapping/engine-row changes
 * must be made in shared-mapping.ts so they propagate to both
 * useCostSheetCalculator (client) and build-ficha (server).
 *
 * Used by: solver, simulateForVerification, useCostSheetCalculator.
 */
import type { CostSheetData } from '@/types/cost-sheet';
import type { FichaJSON } from './types';
import {
  createSharedParser,
  evaluateEarlyHeader,
  buildVHSums,
  buildEngineRows,
  assembleFichaJSON,
  calculateAnnexesPure,
} from './shared-mapping';

// Re-exports for consumers that need direct access
export { calculateAnnexesPure, evaluateEarlyHeader, buildVHSums, buildEngineRows, assembleFichaJSON } from './shared-mapping';

/**
 * Full pipeline: build engine-ready FichaJSON from a CostSheetData template.
 * Creates its own parser and calculates annexes internally.
 */
export function buildEngineFicha(template: CostSheetData): FichaJSON {
  const parser = createSharedParser();
  const calculatedAnnexes = calculateAnnexesPure(template, parser);
  const earlyHeader = evaluateEarlyHeader(template.header, calculatedAnnexes, parser);
  const vhSums = buildVHSums(template.sections);
  const engineRows = buildEngineRows(template, vhSums);
  return assembleFichaJSON(earlyHeader, calculatedAnnexes, engineRows);
}

/**
 * Like buildEngineFicha but accepts pre-calculated annexes.
 * Used by useCostSheetCalculator to avoid double annex computation.
 */
export function buildEngineFichaWithAnnexes(
  template: CostSheetData,
  calculatedAnnexes: ReturnType<typeof calculateAnnexesPure>,
): FichaJSON {
  const vhSums = buildVHSums(template.sections);
  const engineRows = buildEngineRows(template, vhSums);
  return assembleFichaJSON(template.header, calculatedAnnexes, engineRows);
}
