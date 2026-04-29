import { produce } from 'immer';
import { CostSheetData, ScenarioId } from '@/types/cost-sheet';
export const mergeScenarioValues = (baseData: CostSheetData, scenarioId: ScenarioId): CostSheetData => {
  const scenario = baseData.scenarios?.find(s => s.id === scenarioId);
  if (!scenario) return baseData;
  return produce(baseData, (draft) => {
    if (scenario.header) draft.header = { ...draft.header, ...scenario.header };
    const values = scenario.values;
    draft.sections.forEach(section => {
      const processRows = (rows: any[]) => {
        rows.forEach(row => {
          if (values[row.id]) {
            const v = values[row.id];
            if (v.valorHistorico !== undefined) row.valorHistorico = v.valorHistorico;
            if (v.totalFormula !== undefined) row.totalFormula = v.totalFormula;
            if (v.vhFormula !== undefined) row.vhFormula = v.vhFormula;
          }
          if (row.children) processRows(row.children);
        });
      };
      processRows(section.rows);
    });
  });
};
