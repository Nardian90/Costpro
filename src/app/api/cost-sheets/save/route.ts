import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonSupabase, getSupabaseAuthClient } from '@/lib/supabaseClient';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { calculateFicha } from '@/lib/cost-engine';
import { buildEngineFicha } from '@/lib/cost-engine/build-ficha';
import reinicioTemplate from '@/lib/data/costpro-reinicio';
import { CostSheetDataContract } from '@/contracts/cost-sheet';
import { costSheetSaveSchema, zodError } from '@/validation/api-schemas';
import { withTracing } from '@/lib/observability';
// C2-A (FASE C): cost_sheets es GLOBAL/no store-scoped (decisión D1 de C1R).
// withStoreAccess exigía un storeId que la tabla nunca registra (defensa en
// profundidad huérfana) → se sustituye por withAuth. La autorización real la
// aplica RLS (owner-manage) y el ownership explícito por created_by.
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { createApiError } from '@/lib/api-errors';
// C2-A/D3 (FASE C): el writer NUNCA convierte ni sobrescribe documentos FC —
// solo acepta como destino de UPDATE un documento CostSheet compatible.
import { isCostSheetDocument } from '@/lib/cost-sheets/document-compatibility';

export const runtime = 'nodejs';

async function saveCostSheetHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    // FIX-SEC-H4: Auth handled by withAuth middleware
    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }

    // Rate limiting after auth — use authenticated user ID instead of IP
    const clientId = session.user.id;
    const { allowed, remaining, resetAt } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 30 });

    if (!allowed) {
      return new Response(JSON.stringify(createApiError('RATE_LIMITED')), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetAt.toISOString(),
          'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
        },
      });
    }

    const rawBody = await req.json();
    const parsed = costSheetSaveSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }
    // C2-A: sin store_id (columna inexistente en cost_sheets — D1 de C1R).
    const { updateData, currentData, id: existingId, source } = parsed.data as any;

    // Use authenticated client for database operations (RLS: owner-manage)
    const supabase = getSupabaseAuthClient(session.token);

    // 1. Merge with template or current data
    let baseData: CostSheetDataContract;
    if (updateData.resetBeforeApply) {
      baseData = JSON.parse(JSON.stringify(reinicioTemplate));
    } else {
      baseData = currentData || JSON.parse(JSON.stringify(reinicioTemplate));
    }

    // Safety check for baseData
    if (!baseData || !baseData.header) {
        console.error('[SaveCostSheet] Invalid baseData or missing header');
        baseData = JSON.parse(JSON.stringify(reinicioTemplate));
    }

    // Mapping for default classifications based on Annex ID
    const defaultClassifications: Record<string, string> = {
        'I': '1.1.1',
        'II': '2.1.1',
        'III': '3.1.1',
        'IV': '3.2',
        'V': '3.7'
    };

    // Apply updates from AI with robust matching
    if (updateData.annexes && Array.isArray(updateData.annexes)) {
      updateData.annexes.forEach((update: any, updateIdx: number) => {
        const updateItems = update.data || update.items;
        if (!update || !updateItems || !Array.isArray(updateItems)) return;

        const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
        const arabicToRoman: Record<string, string> = { "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V" };

        let targetId = String(update.id || '').toUpperCase();
        if (!targetId && updateIdx < romans.length) {
            targetId = romans[updateIdx];
        } else if (arabicToRoman[targetId]) {
            targetId = arabicToRoman[targetId];
        }

        // Find the best matching annex in baseData
        const annex = (baseData.annexes || []).find((a: any, aIdx: number) =>
            a.id === targetId ||
            a.id === arabicToRoman[targetId] ||
            (romans[aIdx] === targetId) ||
            (update.title && a.title && a.title.toLowerCase().includes(update.title.toLowerCase()))
        );

        if (annex) {
            // Normalize data items to ensure keys match UI expectations
            annex.data = updateItems.map((item: any) => {
                const normalized: any = { ...item };

                // Common aliases mapping
                if (annex.id === 'I') {
                    if (item.cantidad !== undefined && normalized.consumption_norm === undefined) normalized.consumption_norm = item.cantidad;
                    if (item.costo !== undefined && normalized.price === undefined) normalized.price = item.costo;
                }
                if (annex.id === 'II') {
                    if (item.horas !== undefined && normalized.time_norm === undefined) normalized.time_norm = item.horas;
                    if (item.tarifa !== undefined && normalized.hourly_rate === undefined) normalized.hourly_rate = item.tarifa;
                    if (item.cantidad !== undefined && normalized.worker_count === undefined) normalized.worker_count = item.cantidad;
                }
                if (annex.id === 'IV') {
                    if (item.importe !== undefined && normalized.amount === undefined) normalized.amount = item.importe;
                }

                // Ensure total calculation if missing but inputs exist
                if (normalized.total === undefined || normalized.total === 0) {
                    if (annex.id === 'I' && normalized.consumption_norm && normalized.price) {
                        normalized.total = parseFloat(normalized.consumption_norm) * parseFloat(normalized.price);
                    }
                    if (annex.id === 'II' && normalized.time_norm && normalized.hourly_rate && normalized.worker_count) {
                        normalized.total = parseFloat(normalized.time_norm) * parseFloat(normalized.hourly_rate) * parseFloat(normalized.worker_count);
                    }
                }

                // Ensure classification exists and matches the required section sub-rows
                if (!normalized.classification || normalized.classification === annex.id) {
                    normalized.classification = defaultClassifications[annex.id] || annex.id;
                }

                return normalized;
            });
        }
      });
    }

    if (updateData.header) {
      baseData.header = { ...baseData.header, ...updateData.header };
    }

    // --- Scenario Support ---
    if (updateData.scenarios) {
      baseData.scenarios = updateData.scenarios;
    }
    if (updateData.scenarioConfig) {
      baseData.scenarioConfig = updateData.scenarioConfig;
    }

    // 2. Build engine-ready Ficha using the shared pipeline (DRY: avoids duplicating buildEngineFicha logic)
    const ficha: any = buildEngineFicha(baseData as any);

    // 3. Run Calculation
    let result;
    try {
        result = calculateFicha(ficha, { actor: 'ai-system' });
    } catch (calcError: any) {
        console.error('[SaveCostSheet] calculateFicha error:', calcError);
        throw new Error('Error en el motor de cálculo: ' + calcError.message);
    }

    // 4. Map back to UI values for Snapshot
    const calculatedValues: Record<string, any> = {};
    if (result && result.rows) {
        result.rows.forEach(r => {
          calculatedValues[r.id] = {
            total: r.total,
            valorHistorico: r.valorHistorico || 0,
            calculatedVH: r.calculatedVH,
            baseTotal: r.baseTotal || 0,
            baseValorHistorico: r.baseHist || 0,
            fuente: r.fuente
          };
        });
    }

    // 5. Persist in Supabase — solo columnas reales de cost_sheets
    // (id, name, description, category, data, created_by, created_at, updated_at)
    const isManual = source === 'manual';
    const exportData = {
      ...baseData,
      metadata: {
        ...baseData.metadata,
        generatedBy: isManual ? 'CostSheet Editor' : 'Darian AI',
        generatedAt: new Date().toISOString(),
        calculationSnapshot: {
          header: ficha.meta,
          values: calculatedValues
        }
      }
    };

    const documentName = baseData.header?.name || 'Ficha sin nombre';
    const documentCategory = baseData.header?.category || 'General';

    // ── C2-A (§8): distinguir CREAR de ACTUALIZAR ──
    // Actualizar solo si llegó un `id` válido. Ownership estricto:
    // created_by = session.user.id (coincide con RLS cost_sheets_owner_manage;
    // un admin NO edita ajenos — la política FOR ALL es owner-only).
    if (existingId) {
      // D3 (FASE C): verificar que el documento destino ES un documento
      // CostSheet antes de sobrescribirlo. Un documento FC (o de otra familia)
      // jamás se convierte/destruye por accidente vía este writer.
      const { data: existingRow, error: fetchError } = await supabase
        .from('cost_sheets')
        .select('data')
        .eq('id', existingId)
        .eq('created_by', session.user.id)
        .single();

      if (fetchError || !existingRow) {
        // PGRST116 = 0 filas: el documento no existe o no es del usuario (RLS/owner)
        console.error('[SaveCostSheet] Update fetch error:', fetchError);
        return NextResponse.json(
          createApiError('COST_SHEET_NOT_FOUND', 'La ficha a actualizar no existe o no te pertenece'),
          { status: 404 }
        );
      }

      if (!isCostSheetDocument(existingRow.data)) {
        return NextResponse.json(
          createApiError('COST_SHEET_NOT_COMPATIBLE', 'El documento destino no es un documento CostSheet compatible (no puede sobrescribirse desde este editor)'),
          { status: 409 }
        );
      }

      const { data: updatedData, error: updateError } = await supabase
        .from('cost_sheets')
        .update({
          name: documentName,
          description: baseData.metadata?.description || (isManual ? 'Guardado desde el editor CostSheet' : 'Generado por Darian AI'),
          category: documentCategory,
          data: exportData as any,
        })
        .eq('id', existingId)
        .eq('created_by', session.user.id)
        .select()
        .single();

      if (updateError || !updatedData) {
        // PGRST116 = 0 filas: el documento no existe o no es del usuario (RLS/owner)
        console.error('[SaveCostSheet] Update error:', updateError);
        return NextResponse.json(
          createApiError('COST_SHEET_NOT_FOUND', 'La ficha a actualizar no existe o no te pertenece'),
          { status: 404 }
        );
      }

      return NextResponse.json({
        ok: true,
        created: false,
        message: 'Ficha actualizada correctamente',
        id: updatedData.id,
        data: exportData
      });
    }

    // Crear nuevo documento (owner = usuario autenticado, §6)
    const { data: insertedData, error: insertError } = await supabase
      .from('cost_sheets')
      .insert({
        name: documentName,
        description: baseData.metadata?.description || (isManual ? 'Guardado desde el editor CostSheet' : 'Generado por Darian AI'),
        category: documentCategory,
        data: exportData as any,
        created_by: session.user.id,
      })
      .select()
      .single();

    if (insertError) {
        console.error('[SaveCostSheet] Insert error:', insertError);
        throw insertError;
    }

    return NextResponse.json({
      ok: true,
      created: true,
      message: 'Ficha guardada correctamente',
      id: insertedData.id,
      data: exportData
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[SaveCostSheet] Error:', error);
    return NextResponse.json(createApiError('INTERNAL_ERROR'), { status: 500 });
  }
}

export const POST = withTracing(
  withAuth(saveCostSheetHandler as any) as any,
  'POST /api/cost-sheets/save'
);
