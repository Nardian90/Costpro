/**
 * FASE C — C2-C: semántica del vínculo documento↔fila persistida.
 *
 * persistedDocId permite distinguir CREAR de ACTUALIZAR (mandato C2 §8):
 *   - setSheet / loadExample / reset → limpian el vínculo (documento nuevo/ajeno);
 *   - setPersistedDocId(id) → lo restablece tras un guardado exitoso.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import reinicioTemplate from '@/lib/data/costpro-reinicio';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('cost-sheet-store — persistedDocId (C2-C)', () => {
  beforeEach(() => {
    useCostSheetStore.setState({ persistedDocId: null });
  });

  it('setPersistedDocId establece el id del documento persistido', () => {
    useCostSheetStore.getState().setPersistedDocId('44444444-4444-4444-8444-444444444444');
    expect(useCostSheetStore.getState().persistedDocId).toBe('44444444-4444-4444-8444-444444444444');
  });

  it('setSheet (documento nuevo/ajeno) limpia el vínculo — evita overwrite accidental', () => {
    useCostSheetStore.getState().setPersistedDocId('44444444-4444-4444-8444-444444444444');
    useCostSheetStore.getState().setSheet(clone(reinicioTemplate));
    expect(useCostSheetStore.getState().persistedDocId).toBeNull();
  });

  it('loadExample y reset también limpian el vínculo', () => {
    useCostSheetStore.getState().setPersistedDocId('44444444-4444-4444-8444-444444444444');
    useCostSheetStore.getState().loadExample();
    expect(useCostSheetStore.getState().persistedDocId).toBeNull();

    useCostSheetStore.getState().setPersistedDocId('44444444-4444-4444-8444-444444444444');
    useCostSheetStore.getState().reset();
    expect(useCostSheetStore.getState().persistedDocId).toBeNull();
  });

  it('setSheet con documento FC-format RECHAZA el cambio (guard Zod intacto)', () => {
    const dataBefore = useCostSheetStore.getState().data;
    // Estructura FC real (C1R doc 01): sin header.code/sections/signature → Zod falla
    useCostSheetStore.getState().setSheet({
      model: 'FC_RES148_2023_V1',
      ficha: { id: 'x', meta: {}, rows: {} },
      header: { name: 'FC' },
      meta2: { app: 'FC' },
    } as any);
    expect(useCostSheetStore.getState().data).toBe(dataBefore); // no se cargó
  });
});
