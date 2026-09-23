/**
 * FASE C — C2-B: tests del guard central de compatibilidad documental.
 *
 * Mandato C2 §20 (Contrato):
 *   CostSheet válido  → ACCEPT
 *   FC document       → REJECT
 *   data.ficha        → REJECT
 *   data vacío        → REJECT
 *
 * Las fixtures de FC replican la estructura REAL verificada en LIVE por
 * C1/C1R: { model, ficha, header:{name}, meta2 } + category "FC Res148".
 */
import { describe, it, expect } from 'vitest';
import {
  isCostSheetDocument,
  isFCDocument,
  COST_SHEET_CONTRACT_FILTER,
  FC_MODEL_MARKER,
  FC_CATEGORY,
} from '@/lib/cost-sheets/document-compatibility';

// ── Fixtures ────────────────────────────────────────────────────────────────

const validCostSheet = {
  header: {
    code: 'FC-001', name: 'Ficha de prueba', date: '2026-09-23', quantity: 1,
    currency: 'CUP', category: 'Servicios', type: 'x', unit: 'u',
  },
  sections: [{ id: '1', label: '1.0', rows: [] }],
  annexes: [{ id: 'I', title: 'Materia Prima', columns: [], data: [] }],
  signature: { prepared_by: 'A', approved_by: 'B' },
};

// Réplica de la estructura FC real (7 filas LIVE certificadas por C1R doc 02)
const fcDocument = {
  model: FC_MODEL_MARKER,
  ficha: { id: 'local-1', meta: { producto: 'Pan' }, rows: { '2': { base: 1, nuevo: 2, desglose: [] } } },
  header: { name: 'Ficha FC' },
  meta2: { app: 'FC', deviceId: 'dev-123' },
};

const fcDocumentSinModel = { ficha: { id: 'local-2', meta: {}, rows: {} }, header: { name: 'FC sin model' } };

// ── isCostSheetDocument ─────────────────────────────────────────────────────

describe('isCostSheetDocument (C2-B — guard central de contrato)', () => {
  it('ACEPTA un documento CostSheet válido (4 pilares)', () => {
    expect(isCostSheetDocument(validCostSheet)).toBe(true);
  });

  it('ACEPTA un documento CostSheet con metadata/scenarios adicionales', () => {
    expect(isCostSheetDocument({
      ...validCostSheet,
      metadata: { calculationSnapshot: { values: {} } },
      scenarios: [],
    })).toBe(true);
  });

  it('RECHAZA un documento FC con data.model = FC_RES148_2023_V1', () => {
    expect(isCostSheetDocument(fcDocument)).toBe(false);
  });

  it('RECHAZA un documento FC aunque le falta model (por data.ficha)', () => {
    expect(isCostSheetDocument(fcDocumentSinModel)).toBe(false);
  });

  it('RECHAZA un documento con data.ficha aunque lleve pilares parciales', () => {
    expect(isCostSheetDocument({
      ...validCostSheet,
      ficha: { id: 'x' }, // señal FC inyectada
    })).toBe(false);
  });

  it('RECHAZA por category = "FC Res148" (tercera señal)', () => {
    expect(isCostSheetDocument({
      ...validCostSheet,
      category: FC_CATEGORY,
    })).toBe(false);
  });

  it('RECHAZA data vacío {} (semilla de test)', () => {
    expect(isCostSheetDocument({})).toBe(false);
  });

  it('RECHAZA null, undefined, primitivos y arrays', () => {
    expect(isCostSheetDocument(null)).toBe(false);
    expect(isCostSheetDocument(undefined)).toBe(false);
    expect(isCostSheetDocument('ficha')).toBe(false);
    expect(isCostSheetDocument(42)).toBe(false);
    expect(isCostSheetDocument([validCostSheet])).toBe(false);
  });

  it('RECHAZA documentos sin pilares completos (header/sections/annexes/signature)', () => {
    expect(isCostSheetDocument({ ...validCostSheet, signature: undefined })).toBe(false);
    expect(isCostSheetDocument({ ...validCostSheet, sections: undefined })).toBe(false);
    expect(isCostSheetDocument({ ...validCostSheet, annexes: undefined })).toBe(false);
    expect(isCostSheetDocument({ ...validCostSheet, header: undefined })).toBe(false);
    // Pilares no-objeto/no-array no cuentan
    expect(isCostSheetDocument({ ...validCostSheet, signature: 'x' })).toBe(false);
    expect(isCostSheetDocument({ ...validCostSheet, sections: 'x' })).toBe(false);
  });

  it('es determinista: mismo input → mismo output', () => {
    expect(isCostSheetDocument(fcDocument)).toBe(isCostSheetDocument(fcDocument));
    expect(isCostSheetDocument(validCostSheet)).toBe(isCostSheetDocument(validCostSheet));
  });
});

// ── isFCDocument ────────────────────────────────────────────────────────────

describe('isFCDocument (señales de la familia FC)', () => {
  it('detecta por model', () => {
    expect(isFCDocument(fcDocument)).toBe(true);
  });

  it('detecta por ficha (sin model)', () => {
    expect(isFCDocument(fcDocumentSinModel)).toBe(true);
  });

  it('detecta por meta2.app = "FC"', () => {
    expect(isFCDocument({ meta2: { app: 'FC' } })).toBe(true);
  });

  it('no marca como FC un documento terminal', () => {
    expect(isFCDocument(validCostSheet)).toBe(false);
  });

  it('no marca inputs vacíos o inválidos', () => {
    expect(isFCDocument(null)).toBe(false);
    expect(isFCDocument({})).toBe(false);
  });
});

// ── Filtro PostgREST (nivel query) ──────────────────────────────────────────

describe('COST_SHEET_CONTRACT_FILTER (exclusión server-side)', () => {
  it('el or() excluye el modelo FC y conserva filas sin model', () => {
    expect(COST_SHEET_CONTRACT_FILTER.excludeFcModelOr).toBe(
      'data->>model.is.null,data->>model.neq.FC_RES148_2023_V1'
    );
    expect(COST_SHEET_CONTRACT_FILTER.excludeFcFicha).toEqual({
      column: 'data->ficha', operator: 'is', value: null,
    });
  });
});
