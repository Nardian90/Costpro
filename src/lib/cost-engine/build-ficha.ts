import { CostSheetData } from '../../types/cost-sheet';
import { FichaJSON } from './types';
import {
  calculateAnnexesShared,
  evaluateEarlyHeader,
  buildVHSums,
  buildEngineRows,
  assembleFichaJSON,
} from './shared-mapping';
import { createSharedParser } from './formula-utils';

export { calculateAnnexesPure } from './shared-mapping';

export function buildEngineFicha(template: CostSheetData): FichaJSON {
  const parser = createSharedParser();
  const calculatedAnnexes = calculateAnnexesShared(template);
  const earlyHeader = evaluateEarlyHeader(template.header, calculatedAnnexes, parser);
  const vhSums = buildVHSums(template.sections);
  const engineRows = buildEngineRows(template, vhSums);
  return assembleFichaJSON(earlyHeader, calculatedAnnexes, engineRows);
}
