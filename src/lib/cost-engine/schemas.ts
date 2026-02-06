import { z } from 'zod';

export const RowSemanticTypeSchema = z.enum(['COST', 'MARGIN', 'TAX', 'TOTAL', 'INFO']);

export const CalculationMethodSchema = z.enum(['FIJO', 'IMPORTAR_ANEXO', 'PRORRATEO', 'COEFICIENTE', 'FORMULA', 'ANEXO']);

export const BaseRefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ANEXO'), anexoId: z.string() }),
  z.object({ type: z.literal('FILA'), classification: z.string() }),
]);

export const CalculationRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  targetClassification: z.string().optional(),
  targetType: RowSemanticTypeSchema.optional(),
  condition: z.string().optional(),
  formulaOverride: z.string().optional(),
  priority: z.number(),
  enabled: z.boolean(),
});

export const CostRowSchema = z.preprocess((val: any) => {
  if (!val || typeof val !== 'object') return val;
  const migrated = { ...val };
  if ('valorHistorico' in val && !('valor_historico' in val)) migrated.valor_historico = val.valorHistorico;
  if ('formaCalculo' in val && !('calculation_method' in val)) migrated.calculation_method = val.formaCalculo;
  if ('baseCalculo' in val && !('base_calculation' in val)) migrated.base_calculation = val.baseCalculo;
  if ('vhFormula' in val && !('vh_formula' in val)) migrated.vh_formula = val.vhFormula;
  return migrated;
}, z.object({
  id: z.string(),
  parentId: z.string().nullable().optional(),
  classification: z.string(),
  type: RowSemanticTypeSchema,
  label: z.string(),
  valor_historico: z.number().nullable().optional(),
  vh_formula: z.string().nullable().optional(),
  calculation_method: CalculationMethodSchema,
  base_calculation: BaseRefSchema.nullable().optional(),
  coeficiente: z.number().nullable().optional(),
  formula: z.string().nullable().optional(),
  fuente: z.string().optional(),
}));

export const AnexoRowSchema = z.object({
  classification: z.string(),
  importe: z.number(),
}).catchall(z.any());

export const AnexoSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  rows: z.array(AnexoRowSchema),
});

export const FichaJSONSchema = z.object({
  meta: z.object({
    id: z.string(),
    name: z.string(),
    currency: z.string(),
    decimals: z.number(),
    quantity: z.number().optional(),
    createdAt: z.string().optional(),
    version: z.string().optional(),
    settings: z.object({
      maxIter: z.number().optional(),
      damping: z.number().optional(),
      allowFormulas: z.boolean().optional(),
      autoSave: z.boolean().optional(),
    }).optional(),
  }),
  rows: z.array(CostRowSchema),
  anexos: z.array(AnexoSchema),
  rules: z.array(CalculationRuleSchema).optional(),
});
