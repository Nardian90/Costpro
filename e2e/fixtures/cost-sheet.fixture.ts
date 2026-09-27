/**
 * Ficha de costo mínima válida para tests del motor de cálculo.
 *
 * FIX (FASE E2E-80): el contrato del endpoint cambió — FichaJSONSchema
 * espera {meta, rows, anexos} (src/lib/cost-engine/schemas.ts), mientras
 * los fixtures/specs usaban la estructura antigua {header, sections}.
 * Payload verificado contra /api/cost-sheets/calculate (200 ok:true).
 */
export const MINIMAL_COST_SHEET = {
  meta: {
    id: 'test-ficha-001',
    name: 'Producto de Test E2E',
    currency: 'CUP',
    decimals: 2,
  },
  rows: [
    { id: 'r1', classification: 'materias-primas', type: 'COST', label: 'Material A', formaCalculo: 'FIJO', valorHistorico: 500 },
    { id: 'r2', classification: 'materias-primas', type: 'COST', label: 'Material B', formaCalculo: 'FIJO', valorHistorico: 300 },
    { id: 'r3', classification: 'mano-de-obra', type: 'COST', label: 'Mano de obra', formaCalculo: 'FIJO', valorHistorico: 200 },
  ],
  anexos: [],
};

/** Ficha con anexo para IMPORTAR_ANEXO (goal seek obsoleto: ver specs) */
export const GOAL_SEEK_SHEET = MINIMAL_COST_SHEET;
