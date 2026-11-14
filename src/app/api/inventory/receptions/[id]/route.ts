import { isAdminLevel } from '@/lib/roles';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { z } from 'zod';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { withSecurity } from '@/lib/with-security';

/**
 * PATCH /api/inventory/receptions/[id]
 *
 * FIX R-1+R-2: Actualiza header + items de una recepción en una sola transacción.
 * Antes: 2 llamadas separadas (mutation header + RPC items) → estado parcial.
 * Ahora: una sola API route que llama al RPC update_reception_items con los datos del header.
 *
 * CP-RECEIPT-INTEGRITY-001 (2026-11-14): guard de estado para la cabecera.
 * Los campos económicos/documentales (supplier, referenceDoc, itemUpdates)
 * de una recepción NO pendiente son inmutables: solo `notes` (anotación no
 * económica) puede editarse en documentos confirmados/anulados/revertidos.
 * Antes el update directo (RLS no filtra por estado) permitía re-etiquetar
 * facturas de documentos terminados.
 *
 * Body: {
 *   supplier?: string,
 *   referenceDoc?: string,
 *   notes?: string,
 *   itemUpdates?: Array<{ id, quantity, unit_cost, deleted }>
 * }
 */

function extractIdFromUrl(req: NextRequest): string | null {
  const match = req.nextUrl?.pathname?.match(/\/api\/inventory\/receptions\/([^/]+)/);
  return match?.[1] || null;
}

async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  const id = extractIdFromUrl(req);
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  if (!isAdminLevel(session.user.role) && session.user.role !== 'manager' && session.user.role !== 'encargado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();

  // REM-COSTPRO4-CI: contrato del body con Zod (PATCH parcial de recepción;
  // itemUpdates = array de actualizaciones por ítem).
  const ReceptionPatchSchema = z.object({
    supplier: z.string().nullable().optional(),
    referenceDoc: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    itemUpdates: z.unknown().optional(),
  }).passthrough();
  const parsedBody = ReceptionPatchSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Cuerpo de solicitud inválido', details: parsedBody.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  }

  const { supplier, referenceDoc, notes, itemUpdates } = body;
  const supabase = getSupabaseForSession(session);
  const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null;

  // CP-RECEIPT-INTEGRITY-001: cargar estado ANTES de mutar. Los campos
  // económicos/documentales son inmutables salvo en 'pending'; `notes` es
  // una anotación permitida en cualquier estado.
  const economicFields: string[] = [];
  if (supplier !== undefined) economicFields.push('supplier');
  if (referenceDoc !== undefined) economicFields.push('referenceDoc');
  if (Array.isArray(itemUpdates) && itemUpdates.length > 0) economicFields.push('itemUpdates');

  if (economicFields.length > 0) {
    const { data: receiptRow, error: receiptErr } = await supabase
      .from('receipts')
      .select('status')
      .eq('id', id)
      .single();

    if (receiptErr && String(receiptErr.code || '') !== 'PGRST116') {
      return NextResponse.json({ error: `Error consultando recepción: ${receiptErr.message}` }, { status: 500 });
    }
    const status = receiptRow?.status;
    if (!status) {
      return NextResponse.json({ error: 'Recepción no encontrada' }, { status: 404 });
    }
    if (status !== 'pending') {
      return NextResponse.json({
        error: `La recepción está '${status}': sus datos económicos/documentales son inmutables (solo 'notes' es editable)`,
        code: 'ERR_NOT_EDITABLE',
        campos_bloqueados: economicFields,
        remedio: 'Use reversión/anulación controlada + recepción correctiva, o la corrección gobernada documentada.',
      }, { status: 409 });
    }
  }

  // 1. Actualizar header de la recepción
  const headerUpdate: Record<string, unknown> = {};
  if (supplier !== undefined) headerUpdate.supplier = supplier;
  if (referenceDoc !== undefined) headerUpdate.reference_doc = referenceDoc;
  if (notes !== undefined) headerUpdate.notes = notes;

  if (Object.keys(headerUpdate).length > 0) {
    const { error: headerErr } = await supabase
      .from('receipts')
      .update({ ...headerUpdate, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (headerErr) {
      return NextResponse.json({ error: `Error actualizando header: ${headerErr.message}` }, { status: 500 });
    }
  }

  // 2. Si hay item updates, llamar al RPC transaccional
  if (itemUpdates && Array.isArray(itemUpdates) && itemUpdates.length > 0) {
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('update_reception_items', {
      p_receipt_id: id,
      p_item_updates: itemUpdates,
      p_user_id: userId,
    });

    if (rpcErr) {
      const msg = rpcErr.message;
      if (msg.includes('ERR_NOT_EDITABLE')) {
        return NextResponse.json({ error: 'Solo se pueden editar recepciones pendientes', code: 'ERR_NOT_EDITABLE' }, { status: 409 });
      }
      if (msg.includes('ERR_UNAUTHORIZED')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    if (rpcResult?.failed_count > 0) {
      return NextResponse.json({
        success: true,
        warning: `${rpcResult.failed_count} items no se encontraron`,
        updated_count: rpcResult.updated_count,
        new_total: rpcResult.new_total,
      });
    }

    return NextResponse.json({
      success: true,
      updated_count: rpcResult?.updated_count,
      new_total: rpcResult?.new_total,
    });
  }

  return NextResponse.json({ success: true });
}

export const PATCH = withAuth(withSecurity(patchHandler, {
  rateLimitKey: 'receptions:patch',
  maxRequests: 20,
}));
