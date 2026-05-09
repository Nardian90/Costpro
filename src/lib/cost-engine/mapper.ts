import {
  CostSheetData
} from '../../types/cost-sheet';
import {
  FichaJSON
} from './types';
import { calculateAnnexesShared, buildVHSums, buildEngineRows, assembleFichaJSON } from './shared-mapping';

/**
 * Main entry point for mapping the UI-oriented CostSheetData to the Engine-oriented FichaJSON.
 */
export function mapUIToFicha(data: CostSheetData): FichaJSON {
  // 1. Calculate Annexes (resolves internal formulas and coefficients)
  const calculatedAnnexes = calculateAnnexesShared(data);

  // 2. Pre-calculate Valor Historico sums (recursive sum of children)
  const vhSums = buildVHSums(data.sections);

  // 3. Build Engine Rows (flattens hierarchy and maps calculation methods)
  const engineRows = buildEngineRows(data, vhSums);

  // 4. Assemble the final JSON structure for the engine
  return assembleFichaJSON(data.header, calculatedAnnexes, engineRows);
}

export { calculateAnnexesPure } from './shared-mapping';
