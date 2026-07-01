import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { createApiError } from '@/lib/api-errors';

async function exportTransferPdfHandler(
  req: NextRequest,
  session: AuthenticatedSession
) {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const transferId = parts[parts.length - 2];
    if (!transferId) return NextResponse.json(createApiError('BAD_REQUEST'), { status: 400 });

    // FIX-AUDIT-10: Use authenticated client (enforces RLS) instead of anon client
    const supabase = getSupabaseAuthClient(session.token);

    // FIX-SEC-M2: Fetch transfer with store-level filter at query time
    // Get user's accessible store IDs for query-level filtering
    const isAdmin = (session.user as any).role === 'admin';
    const memberships = (session.user as any).memberships || [];
    const accessibleStoreIds = memberships
      .filter((m: any) => m.status === 'active')
      .map((m: any) => m.store_id);

    let query = supabase
      .from('transfers')
      .select(`*, origin_store:stores!transfers_origin_store_id_fkey(*), destination_store:stores!transfers_destination_store_id_fkey(*), creator:profiles!transfers_created_by_profiles_fkey(full_name), items:transfer_items(*, product:products(*))`)
      .eq('id', transferId);

    // FIX-SEC-M2: Apply store_id filter at query level for non-admins
    if (!isAdmin && accessibleStoreIds.length > 0) {
      query = query.in('origin_store_id', accessibleStoreIds);
    }

    const { data: t, error: fetchError } = await query.single();

    if (fetchError || !t) return NextResponse.json(createApiError('TRANSFER_NOT_FOUND'), { status: 404 });

    // FIX-SEC-M2: Post-fetch validation for destination store (defense in depth)
    if (!isAdmin) {
      const hasAccess = accessibleStoreIds.some(
        (sid: string) => sid === t.origin_store_id || sid === t.destination_store_id
      );
      if (!hasAccess) {
        return NextResponse.json(
          createApiError('FORBIDDEN'),
          { status: 403 }
        );
      }
    }

    const doc = await createPDFDocument('portrait', 'mm', 'a4');
    doc.setFontSize(20);
    doc.text('ORDEN DE TRANSFERENCIA', 14, 22);
    autoTable(doc, { startY: 85, head: [["PRODUCT", "QTY"]], body: t.items.map((i:any) => [i.product?.name, i.quantity]) });

    const pdfBuffer = doc.output('arraybuffer');
    return new Response(pdfBuffer, { headers: { 'Content-Type': 'application/pdf' } });
  } catch (error) {
    return NextResponse.json(createApiError('INTERNAL_ERROR'), { status: 500 });
  }
}

export const GET = withTracing(withRole('manager', exportTransferPdfHandler as any), 'GET /api/transfers/[transferId]/export-pdf');
