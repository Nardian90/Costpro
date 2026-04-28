import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { produce } from 'immer';
import {
  ScenarioId,
  ScenarioColor,
  ScenarioValues,
  ScenarioRowValues,
  CostSheetData,
  CostSheetScenario
} from '@/types/cost-sheet';
import { useCostSheetStore } from './cost-sheet-store';
import { toast } from 'sonner';

interface ScenarioState {
  activeScenarioIds: ScenarioId[];
  isComparisonMode: boolean;
  activateScenario: (id: ScenarioId) => void;
  deactivateScenario: (id: ScenarioId) => void;
  setComparisonBase: (id: ScenarioId) => void;
  createScenario: (sourceId: ScenarioId, label: string) => void;
  deleteScenario: (id: ScenarioId) => void;
  renameScenario: (id: ScenarioId, label: string) => void;
  setPrimaryScenario: (id: ScenarioId) => void;
  updateRowValue: (scenarioId: ScenarioId, rowId: string, field: keyof ScenarioRowValues, value: any) => void;
  getScenarioValues: (scenarioId: ScenarioId) => ScenarioValues;
  toggleComparisonMode: (enabled?: boolean) => void;
}

export const useScenarioStore = create<ScenarioState>()(
  persist(
    (set, get) => ({
      activeScenarioIds: ['v1'],
      isComparisonMode: false,
      activateScenario: (id) => set(produce((state) => {
        if (!state.activeScenarioIds.includes(id)) {
          state.activeScenarioIds.push(id);
          if (state.activeScenarioIds.length > 1) state.isComparisonMode = true;
        }
      })),
      deactivateScenario: (id) => set(produce((state) => {
        state.activeScenarioIds = state.activeScenarioIds.filter((sid: string) => sid !== id);
        if (state.activeScenarioIds.length <= 1) state.isComparisonMode = false;
        if (state.activeScenarioIds.length === 0) { state.activeScenarioIds = ['v1']; state.isComparisonMode = false; }
      })),
      toggleComparisonMode: (enabled) => set((state) => ({
        isComparisonMode: enabled !== undefined ? enabled : !state.isComparisonMode
      })),
      setComparisonBase: (id) => {
        const { data, updateValue } = useCostSheetStore.getState();
        if (data) updateValue(['scenarioConfig', 'comparisonBaseId'], id);
      },
      createScenario: (sourceId, label) => {
        const { data, updateValue } = useCostSheetStore.getState();
        if (!data) return;
        const scenarios = data.scenarios || [];
        if (scenarios.length >= 3) { toast.error("Máximo 3 escenarios"); return; }
        let sourceValues: ScenarioValues = {};
        const sourceScenario = scenarios.find(s => s.id === sourceId);
        if (sourceScenario) sourceValues = JSON.parse(JSON.stringify(sourceScenario.values));
        const usedIds = scenarios.map(s => s.id);
        const newId = (['v1', 'v2', 'v3'] as ScenarioId[]).find(id => !usedIds.includes(id)) || 'v2';
        const colors: Record<ScenarioId, ScenarioColor> = { v1: 'blue', v2: 'violet', v3: 'amber' };
        const newScenario: CostSheetScenario = { id: newId, label, color: colors[newId], createdAt: Date.now(), values: sourceValues };
        updateValue(['scenarios'], [...scenarios, newScenario]);
        get().activateScenario(newId);
        toast.success(`Escenario "${label}" creado`);
      },
      deleteScenario: (id) => {
        const { data, updateValue } = useCostSheetStore.getState();
        if (!data || !data.scenarios) return;
        if (data.scenarioConfig?.primaryScenarioId === id) { toast.error("No se puede eliminar el principal"); return; }
        const newScenarios = data.scenarios.filter(s => s.id !== id);
        updateValue(['scenarios'], newScenarios);
        get().deactivateScenario(id);
      },
      renameScenario: (id, label) => {
        const { data, updateValue } = useCostSheetStore.getState();
        if (!data || !data.scenarios) return;
        updateValue(['scenarios'], data.scenarios.map(s => s.id === id ? { ...s, label } : s));
      },
      setPrimaryScenario: (id) => {
        const { updateValue } = useCostSheetStore.getState();
        updateValue(['scenarioConfig', 'primaryScenarioId'], id);
        toast.success("Principal actualizado");
      },
      updateRowValue: (scenarioId, rowId, field, value) => {
        const { data, updateValue } = useCostSheetStore.getState();
        if (!data || !data.scenarios) return;
        const sIndex = data.scenarios.findIndex(s => s.id === scenarioId);
        if (sIndex !== -1) updateValue(['scenarios', sIndex, 'values', rowId, field], value);
      },
      getScenarioValues: (scenarioId) => {
        const { data } = useCostSheetStore.getState();
        return data?.scenarios?.find(s => s.id === scenarioId)?.values || {};
      }
    }),
    { name: 'scenario-ui-storage', partialize: (state) => ({ activeScenarioIds: state.activeScenarioIds, isComparisonMode: state.isComparisonMode }) }
  )
);

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
