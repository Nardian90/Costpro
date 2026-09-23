import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { z } from 'zod';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
// C2-B (FASE C): aislamiento por contrato — la biblioteca CostSheet solo
// devuelve documentos compatibles con su editor (D2/D4/D5 de C1R).
import {
  isCostSheetDocument,
  COST_SHEET_CONTRACT_FILTER,
} from '@/lib/cost-sheets/document-compatibility';

// FIX-LOG-007: Add Zod schema for cost_sheets response validation
const costSheetListItemSchema = z.object({
  id: z.string(),
  user_id: z.string().optional(),
  name: z.string().optional(),
  data: z.any().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export function useCostSheets() {
  return useQuery({
    queryKey: ['cost_sheets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_sheets')
        .select('*')
        // C2-B: exclusión server-side de la familia FC (Res.148) — la tabla es
        // un contenedor multi-formato; este hook SOLO sirve documentos terminal.
        .or(COST_SHEET_CONTRACT_FILTER.excludeFcModelOr)
        .filter(
          COST_SHEET_CONTRACT_FILTER.excludeFcFicha.column,
          COST_SHEET_CONTRACT_FILTER.excludeFcFicha.operator,
          COST_SHEET_CONTRACT_FILTER.excludeFcFicha.value
        )
        .order('created_at', { ascending: false })
        .limit(200); // H5: paginación

      if (error) throw error;

      // FIX-LOG-007: Validate response with Zod schema
      if (!Array.isArray(data)) {
        console.warn('[useCostSheets] Expected array response, got:', typeof data);
        return [];
      }
      // C2-B: guard central de compatibilidad (2ª capa; la 3ª es el Zod de setSheet)
      const validated = await validateRPCArrayResponse(data, costSheetListItemSchema, 'cost_sheets');
      return validated.filter((row: { data?: unknown }) => isCostSheetDocument(row?.data));
    },
  });
}
