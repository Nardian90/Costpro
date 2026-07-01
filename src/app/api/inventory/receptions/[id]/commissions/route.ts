import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';

/**
 * POST /api/inventory/receptions/[id]/commissions
 *
 * Vincula un pago de comisión a una recepción para absorción de costo.
 * Crea un registro en commission_reception_links.
 *
 * FIX-GAP4: Permite al admin/manager absorber comisiones pagadas a
 * trabajadores en el costo del producto recibido.
 */

const linkCommissionSchema = z.object({
  commission_payment_id: z.string().uuid(),
  product_id: z.string().uuid().optional(),
  allocated_amount: z.number().positive(),
  distribution_method: z.enum(['quantity', 'cost_value', 'weight', 'manual']).default('cost_value'),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const pathParts = new URL(req.url).pathname.split('/');
  const receiptId = pathParts[pathParts.indexOf('receptions') + 1];

  if (!receiptId) {
    return NextResponse.json({ error: 'Receipt ID requerido' }, { status: 400 });
  }

  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden — requiere rol admin o manager' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = linkCommissionSchema.safeParse({ ...body, receipt_id: receiptId });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.format() }, { status: 400 });
  }

  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '')
    ? session.user.id : null;

  const { data, error } = await supabase
    .from('commission_reception_links')
    .insert({
      commission_payment_id: parsed.data.commission_payment_id,
      receipt_id: receiptId,
      product_id: parsed.data.product_id || null,
      allocated_amount: parsed.data.allocated_amount,
      distribution_method: parsed.data.distribution_method,
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya existe una vinculación para este producto en esta recepción' }, { status: 409 });
    }
    logger.error('DATABASE', 'LINK_COMMISSION_FAILED', { receiptId, error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info('DATABASE', 'COMMISSION_LINKED_TO_RECEIPT', { receiptId, paymentId: parsed.data.commission_payment_id });

  return NextResponse.json({ success: true, data }, { status: 201 });
}

/**
 * GET /api/inventory/receptions/[id]/commissions
 * Lista las comisiones vinculadas a una recepción.
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const pathParts = new URL(req.url).pathname.split('/');
  const receiptId = pathParts[pathParts.indexOf('receptions') + 1];

  if (!receiptId) {
    return NextResponse.json({ error: 'Receipt ID requerido' }, { status: 400 });
  }

  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const { data, error } = await supabase
    .from('commission_reception_links')
    .select(`
      id, allocated_amount, distribution_method, created_at,
      commission_payments(id, calculated_amount, final_amount, status, workers(first_name, last_name))
    `)
    .eq('receipt_id', receiptId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

/**
 * DELETE /api/inventory/receptions/[id]/commissions?link_id=X
 * Elimina una vinculación de comisión.
 */
async function deleteHandler(req: NextRequest, session: AuthenticatedSession) {
  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const linkId = new URL(req.url).searchParams.get('link_id');
  if (!linkId) return NextResponse.json({ error: 'link_id requerido' }, { status: 400 });

  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const { error } = await supabase
    .from('commission_reception_links')
    .delete()
    .eq('id', linkId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/inventory/receptions/[id]/commissions');
export const GET = withTracing(withAuth(getHandler) as any, 'GET /api/inventory/receptions/[id]/commissions');
export const DELETE = withTracing(withAuth(deleteHandler) as any, 'DELETE /api/inventory/receptions/[id]/commissions');
