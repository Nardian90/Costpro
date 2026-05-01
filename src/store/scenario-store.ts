import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { produce } from 'immer';
import {
  ScenarioId,
  ScenarioColor,
  ScenarioValues,
  ScenarioRowValues,
  CostSheetData,
  CostSheetScenario,
  CostSheetSection,
  CostSheetRow,
  ScenarioConfig
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
  updateRowValue: (scenarioId: ScenarioId, rowId: string, field: keyof ScenarioRowValues, value: number | string | undefined) => void;
  getScenarioValues: (scenarioId: ScenarioId) => ScenarioValues;
  toggleComparisonMode: (enabled?: boolean) => void;
  initializeScenarios: () => void;
}

/**
 * Helper to find and update a row in the sections tree
 */
const findAndUpdateRow = (sections: CostSheetSection[], rowId: string, field: string, value: unknown) => {
  for (const section of sections) {
    const processRows = (rows: CostSheetRow[]): boolean => {
      for (const row of rows) {
        if (row.id === rowId) {
          row[field] = value;
          return true;
        }
        if (row.children && processRows(row.children)) return true;
      }
      return false;
    };
    if (processRows(section.rows)) return true;
  }
  return false;
};

/**
 * Helper to extract all values from sections into a ScenarioValues map
 */
const extractValuesFromSections = (sections: CostSheetSection[]): ScenarioValues => {
  const values: ScenarioValues = {};
  sections.forEach(section => {
    const processRows = (rows: CostSheetRow[]) => {
      rows.forEach(row => {
        values[row.id] = {
          valorHistorico: row.valorHistorico,
          totalFormula: row.totalFormula ?? undefined,
          vhFormula: row.vhFormula ?? undefined,
          coeficiente: row.coeficiente,
          baseDeCalculoRef: row.baseDeCalculoRef ?? undefined
        };
        if (row.children) processRows(row.children);
      });
    };
    processRows(section.rows);
  });
  return values;
};

export const useScenarioStore = create<ScenarioState>()(
  persist(
    (set, get) => ({
      activeScenarioIds: ['v1'],
      isComparisonMode: false,

      initializeScenarios: () => {
        const { data, updateValues } = useCostSheetStore.getState();
        if (!data) return;

        if (!data.scenarios || data.scenarios.length === 0) {
          const v1Values = extractValuesFromSections(data.sections);
          const v1: CostSheetScenario = {
            id: 'v1',
            label: 'Base',
            color: 'blue',
            createdAt: Date.now(),
            values: v1Values
          };

          const config: ScenarioConfig = {
            primaryScenarioId: 'v1',
            comparisonBaseId: 'v1'
          };

          updateValues([
            { path: ['scenarios'], value: [v1] },
            { path: ['scenarioConfig'], value: config }
          ]);
        }
      },

      activateScenario: (id: ScenarioId) => set(produce((state) => {
        if (!state.activeScenarioIds.includes(id)) {
          state.activeScenarioIds.push(id);
          if (state.activeScenarioIds.length > 1) state.isComparisonMode = true;
        }
      })),

      deactivateScenario: (id: ScenarioId) => set(produce((state) => {
        state.activeScenarioIds = state.activeScenarioIds.filter((sid: ScenarioId) => sid !== id);
        if (state.activeScenarioIds.length <= 1) state.isComparisonMode = false;
        if (state.activeScenarioIds.length === 0) {
          state.activeScenarioIds = ['v1'];
          state.isComparisonMode = false;
        }
      })),

      toggleComparisonMode: (enabled?: boolean) => set((state) => ({
        isComparisonMode: enabled !== undefined ? enabled : !state.isComparisonMode
      })),

      setComparisonBase: (id: ScenarioId) => {
        const { data, updateValue } = useCostSheetStore.getState();
        if (data) updateValue(['scenarioConfig', 'comparisonBaseId'], id);
      },

      createScenario: (sourceId: ScenarioId, label: string) => {
        const { data, updateValue } = useCostSheetStore.getState();
        if (!data) return;

        const scenarios = data.scenarios || [];
        if (scenarios.length >= 3) {
          toast.error("Máximo 3 escenarios permitidos");
          return;
        }

        let sourceValues: ScenarioValues = {};
        const sourceScenario = scenarios.find((s: CostSheetScenario) => s.id === sourceId);

        if (sourceScenario) {
          sourceValues = JSON.parse(JSON.stringify(sourceScenario.values));
        } else if (sourceId === 'v1') {
          // If v1 scenario doesn't exist in array, extract from sections
          sourceValues = extractValuesFromSections(data.sections);
        }

        const usedIds = scenarios.map((s: CostSheetScenario) => s.id);
        const newId = (['v1', 'v2', 'v3'] as ScenarioId[]).find(id => !usedIds.includes(id)) || 'v2';

        const colors: Record<ScenarioId, ScenarioColor> = {
          v1: 'blue',
          v2: 'violet',
          v3: 'amber'
        };

        const newScenario: CostSheetScenario = {
          id: newId,
          label,
          color: colors[newId],
          createdAt: Date.now(),
          values: sourceValues
        };

        updateValue(['scenarios'], [...scenarios, newScenario]);
        get().activateScenario(newId);
        toast.success(`Escenario "${label}" creado`);
      },

      deleteScenario: (id: ScenarioId) => {
        const { data, updateValue } = useCostSheetStore.getState();
        if (!data || !data.scenarios) return;

        if (data.scenarioConfig?.primaryScenarioId === id) {
          toast.error("No se puede eliminar el escenario principal");
          return;
        }

        const newScenarios = data.scenarios.filter((s: CostSheetScenario) => s.id !== id);
        updateValue(['scenarios'], newScenarios);
        get().deactivateScenario(id);
        toast.success("Escenario eliminado");
      },

      renameScenario: (id: ScenarioId, label: string) => {
        const { data, updateValue } = useCostSheetStore.getState();
        if (!data || !data.scenarios) return;

        const newScenarios = data.scenarios.map((s: CostSheetScenario) =>
          s.id === id ? { ...s, label } : s
        );
        updateValue(['scenarios'], newScenarios);
      },

      setPrimaryScenario: (id: ScenarioId) => {
        const { data, updateValues } = useCostSheetStore.getState();
        if (!data) return;

        const scenario = data.scenarios?.find((s: CostSheetScenario) => s.id === id);
        if (!scenario) return;

        // Apply scenario values to the root sections
        const newSections = produce(data.sections, (draftSections) => {
          const values = scenario.values;
          draftSections.forEach(section => {
            const processRows = (rows: CostSheetRow[]) => {
              rows.forEach(row => {
                if (values[row.id]) {
                  const v = values[row.id];
                  if (v.valorHistorico !== undefined) row.valorHistorico = v.valorHistorico;
                  if (v.totalFormula !== undefined) row.totalFormula = v.totalFormula;
                  if (v.vhFormula !== undefined) row.vhFormula = v.vhFormula;
                  if (v.coeficiente !== undefined) row.coeficiente = v.coeficiente;
                  if (v.baseDeCalculoRef !== undefined) row.baseDeCalculoRef = v.baseDeCalculoRef;
                }
                if (row.children) processRows(row.children);
              });
            };
            processRows(section.rows);
          });
        });

        updateValues([
          { path: ['scenarioConfig', 'primaryScenarioId'], value: id },
          { path: ['sections'], value: newSections }
        ]);

        toast.success(`Escenario "${scenario.label}" establecido como principal`);
      },

      updateRowValue: (scenarioId: ScenarioId, rowId: string, field: keyof ScenarioRowValues, value: number | string | undefined) => {
        const { data, updateValue, updateValues } = useCostSheetStore.getState();
        if (!data) return;

        // 1. Ensure scenarios array exists
        if (!data.scenarios || data.scenarios.length === 0) {
          get().initializeScenarios();
        }

        const scenarios = useCostSheetStore.getState().data?.scenarios || [];
        const sIndex = scenarios.findIndex((s: CostSheetScenario) => s.id === scenarioId);

        if (sIndex === -1) return;

        const updates: { path: (string | number)[]; value: unknown }[] = [
          { path: ['scenarios', sIndex, 'values', rowId, field], value }
        ];

        // 2. If it's the primary scenario, also update the root sections
        if (data.scenarioConfig?.primaryScenarioId === scenarioId) {
          const newSections = produce(data.sections, (draft) => {
            findAndUpdateRow(draft, rowId, field, value);
          });
          updates.push({ path: ['sections'], value: newSections });
        }

        updateValues(updates);
      },

      getScenarioValues: (scenarioId: ScenarioId) => {
        const { data } = useCostSheetStore.getState();
        return data?.scenarios?.find((s: CostSheetScenario) => s.id === scenarioId)?.values || {};
      }
    }),
    {
      name: 'scenario-ui-storage',
      partialize: (state) => ({
        activeScenarioIds: state.activeScenarioIds,
        isComparisonMode: state.isComparisonMode
      })
    }
  )
);

/**
 * Merges a scenario's values into the base cost sheet data for calculation.
 */
export const mergeScenarioValues = (baseData: CostSheetData, scenarioId: ScenarioId): CostSheetData => {
  // If the scenario matches the primary one, baseData.sections already has the correct values
  if (baseData.scenarioConfig?.primaryScenarioId === scenarioId) {
    return baseData;
  }

  const scenario = baseData.scenarios?.find((s: CostSheetScenario) => s.id === scenarioId);
  if (!scenario) return baseData;

  return produce(baseData, (draft) => {
    if (scenario.header) {
      draft.header = { ...draft.header, ...scenario.header };
    }

    const values = scenario.values;
    draft.sections.forEach(section => {
      const processRows = (rows: CostSheetRow[]) => {
        rows.forEach((row: CostSheetRow) => {
          if (values[row.id]) {
            const v = values[row.id];
            if (v.valorHistorico !== undefined) row.valorHistorico = v.valorHistorico;
            if (v.totalFormula !== undefined) row.totalFormula = v.totalFormula;
            if (v.vhFormula !== undefined) row.vhFormula = v.vhFormula;
            if (v.coeficiente !== undefined) row.coeficiente = v.coeficiente;
            if (v.baseDeCalculoRef !== undefined) row.baseDeCalculoRef = v.baseDeCalculoRef;
          }
          if (row.children) processRows(row.children);
        });
      };
      processRows(section.rows);
    });
  });
};
