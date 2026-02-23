import { NextRequest, NextResponse } from 'next/server';
import { supabase as anonSupabase, getSupabaseAuthClient } from '@/lib/supabaseClient';
import { getServerSession } from "@/lib/auth";
import { calculateFicha } from '@/lib/cost-engine';
import reinicioTemplate from '@/lib/data/costpro-reinicio';
import { CostSheetDataContract } from '@/contracts/cost-sheet';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      console.error('[SaveCostSheet] No session found');
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { updateData, currentData } = await req.json();
    if (!updateData) {
      return NextResponse.json({ error: 'Faltan datos de actualización' }, { status: 400 });
    }

    // Use authenticated client for database operations
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

    // Apply updates from AI
    if (updateData.annexes) {
      updateData.annexes.forEach((update: any) => {
        const annex = (baseData.annexes || []).find((a: any) => a.id === update.id);
        if (annex) annex.data = update.data;
      });
    }
    if (updateData.header) {
      baseData.header = { ...baseData.header, ...updateData.header };
    }

    // 2. Prepare for calculation (Mapping UI -> Engine)
    const engineRows: any[] = [];
    const vhSums: Record<string, number> = {};

    const calculateVH = (rows: any[]) => {
      (rows || []).forEach(r => {
        if (r.children && r.children.length > 0) {
          calculateVH(r.children);
          vhSums[r.id] = r.children.reduce((sum: number, child: any) => {
            return sum + (vhSums[child.id] ?? child.valorHistorico ?? child.value ?? 0);
          }, 0);
        } else {
          vhSums[r.id] = r.valorHistorico ?? r.value ?? 0;
        }
      });
    };
    (baseData.sections || []).forEach(s => calculateVH(s.rows));

    const flatten = (uiRows: any[], sectionIdx: number, parentNumbering?: string, parentId: string | null = null) => {
      (uiRows || []).forEach((r, rowIdx) => {
        const currentNumbering = parentNumbering ? `${parentNumbering}.${rowIdx + 1}` : `${sectionIdx + 1}.${rowIdx + 1}`;

        let type: any = 'COST';
        if (['13', '13.1'].includes(r.id)) type = 'MARGIN';
        if (r.id === '13.2') type = 'TAX';
        if (['14', '12', '5'].includes(r.id)) type = 'TOTAL';

        let formula = r.formula || r.totalFormula;
        if (!formula && r.children && r.children.length > 0 && r.calculationMethod !== 'ValorFijo') {
          formula = 'sum(children)';
        }
        if (formula?.trim() === '=sum(children)' || formula?.trim() === 'sum(children)') {
            formula = 'sum(children)';
        }

        let formaCalculo: any = 'FIJO';
        const method = r.calculationMethod || '';
        if (['Prorrateo', 'PRORRATEO'].includes(method)) formaCalculo = 'PRORRATEO';
        if (['ANEXO', 'ANEXO_REF'].includes(method)) formaCalculo = 'ANEXO';
        if (r.is_percent) formaCalculo = 'COEFICIENTE';
        if (formula) formaCalculo = 'FORMULA';

        let baseCalculo: any = null;
        const baseRefId = r.baseDeCalculoRef || r.base_ref;
        if (baseRefId) {
          const isAnnex = (baseData.annexes || []).some(a => a.id === baseRefId) || /^[IVXLC]+$/.test(baseRefId);
          if (isAnnex) {
            baseCalculo = { type: 'ANEXO', anexoId: baseRefId };
            if (r.calculationMethod !== 'Prorrateo' && !r.formula && !r.totalFormula) {
                formaCalculo = 'IMPORTAR_ANEXO';
            }
          } else {
            baseCalculo = { type: 'FILA', classification: baseRefId };
          }
        }

        engineRows.push({
          id: r.id,
          parentId,
          classification: currentNumbering,
          label: r.label,
          type,
          formaCalculo,
          valorHistorico: vhSums[r.id] ?? r.valorHistorico ?? r.value,
          vhFormula: r.vhFormula,
          baseCalculo,
          coeficiente: r.is_percent ? (r.value ?? r.valorHistorico) : r.coeficiente,
          formula,
          fuente: r.note || r.fuente
        });

        if (r.children) flatten(r.children, sectionIdx, currentNumbering, r.id);
      });
    };
    (baseData.sections || []).forEach((s, sIdx) => flatten(s.rows, sIdx));

    const ficha: any = {
      meta: {
        ...baseData.header,
        id: baseData.header.code || 'generated',
        name: baseData.header.name || 'Ficha Generada',
        currency: baseData.header.currency || 'CUP',
        decimals: 2,
        quantity: parseFloat(String(baseData.header.quantity || 1)),
        settings: { allowFormulas: true }
      },
      anexos: (baseData.annexes || []).map(a => ({
        id: a.id,
        name: a.title,
        rows: (a.data || []).map(d => ({
          ...d,
          classification: String(d.classification || d.label || d.description || '').split(' - ')[0].trim(),
          importe: parseFloat(String(d.total || d.amount || d.depreciation_cost || d.price_total || 0))
        }))
      })),
      rows: engineRows
    };

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

    // 5. Persist in Supabase
    const exportData = {
      ...baseData,
      metadata: {
        ...baseData.metadata,
        generatedBy: 'Darian AI',
        generatedAt: new Date().toISOString(),
        calculationSnapshot: {
          header: ficha.meta,
          values: calculatedValues
        }
      }
    };

    const { data: insertedData, error: insertError } = await supabase
      .from('cost_sheets')
      .insert({
        name: baseData.header.name || 'Ficha sin nombre',
        description: baseData.metadata?.description || 'Generado por Darian AI',
        category: baseData.header.category || 'General',
        data: exportData,
        created_by: session.user.id
      })
      .select()
      .single();

    if (insertError) {
        console.error('[SaveCostSheet] Insert error:', insertError);
        throw insertError;
    }

    return NextResponse.json({
      ok: true,
      message: 'Ficha generada y guardada correctamente',
      id: insertedData.id,
      data: exportData
    });

  } catch (error: any) {
    console.error('[SaveCostSheet] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
