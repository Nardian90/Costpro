/**
 * Pure function that builds an engine-ready FichaJSON from a CostSheetData template.
 *
 * CRITICAL: All shared mapping logic now lives in shared-mapping.ts.
 * This file is a thin orchestrator — any mapping/engine-row changes
 * must be made in shared-mapping.ts so they propagate to both
 * useCostSheetCalculator (client) and build-ficha (server).
 *
 * Used by: solver, simulateForVerification, useCostSheetCalculator.
 */
import { CostSheetData } from '@/types/cost-sheet';
import { FichaJSON } from './types';
import {
  createSharedParser,
  calculateAnnexesPure,
  evaluateEarlyHeader,
  buildVHSums,
  buildEngineRows,
  assembleFichaJSON,
} from './shared-mapping';

// Re-export calculateAnnexesPure for backward compatibility
export { calculateAnnexesPure } from './shared-mapping';

/**
 * Full pipeline: build engine-ready FichaJSON from a CostSheetData template.
 */
export function buildEngineFicha(template: CostSheetData): FichaJSON {
  const parser = createSharedParser();
  const calculatedAnnexes = calculateAnnexesPure(template, parser);
  const earlyHeader = evaluateEarlyHeader(template.header, calculatedAnnexes, parser);
  const vhSums = buildVHSums(template.sections);
  const engineRows = buildEngineRows(template, vhSums);
  return assembleFichaJSON(earlyHeader, calculatedAnnexes, engineRows);
}

