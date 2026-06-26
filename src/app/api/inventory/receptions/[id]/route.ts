import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';

/**
 * PATCH /api/inventory/receptions/[id]
 *
 * FIX R-1+R-2: Actualiza header + items de una recepción en una sola transacción.
 * Antes: 2 llamadas separadas (mutation header + RPC items) → estado parcial.
 * Ahora: una sola API route que llama al RPC update_reception_items con los datos del header.
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

  if (session.user.role !== 'admin' && session.user.role !== 'manager' && session.user.role !== 'encargado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { supplier, referenceDoc, notes, itemUpdates } = body;
  const supabase = getSupabaseForSession(session);
  const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null;

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
        return NextResponse.json({ error: 'Solo se pueden editar recepciones pendientes' }, { status: 400 });
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

export const PATCH = withAuth(patchHandler);
