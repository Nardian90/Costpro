import { z } from 'zod';

export const RowSemanticTypeSchema = z.enum(['COST', 'MARGIN', 'TAX', 'TOTAL', 'INFO']);

export const FormaCalculoSchema = z.enum(['FIJO', 'IMPORTAR_ANEXO', 'ANEXO', 'PRORRATEO', 'COEFICIENTE', 'FORMULA']);

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

export const CostRowSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable().optional(),
  classification: z.string(),
  type: RowSemanticTypeSchema,
  label: z.string(),
  valorHistorico: z.number().nullable().optional(),
  formaCalculo: FormaCalculoSchema,
  baseCalculo: BaseRefSchema.nullable().optional(),
  coeficiente: z.number().nullable().optional(),
  formula: z.string().nullable().optional(),
  fuente: z.string().optional(),
});

export const AnexoRowSchema = z.object({
  classification: z.string(),
  importe: z.number(),
});

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
    createdAt: z.string().optional(),
    version: z.string().optional(),
    settings: z.object({
      maxIter: z.number().optional(),
      damping: z.number().optional(),
      allowFormulas: z.boolean().optional(),
      autoSave: z.boolean().optional(),
      maxAuditEntries: z.number().optional(),
    }).optional(),
  }),
  rows: z.array(CostRowSchema),
  anexos: z.array(AnexoSchema),
  rules: z.array(CalculationRuleSchema).optional(),
});
