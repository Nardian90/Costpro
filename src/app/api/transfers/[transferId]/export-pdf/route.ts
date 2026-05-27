import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseClient';
import { withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

async function exportTransferPdfHandler(
  req: NextRequest,
  session: AuthenticatedSession
) {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const transferId = parts[parts.length - 2];
    if (!transferId) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

    const supabase = createServerClient();
    const { data: t, error: fetchError } = await supabase
      .from('transfers')
      .select(`*, origin_store:stores!transfers_origin_store_id_fkey(*), destination_store:stores!transfers_destination_store_id_fkey(*), creator:profiles!transfers_created_by_profiles_fkey(full_name), items:transfer_items(*, product:products(*))`)
      .eq('id', transferId)
      .single();

    if (fetchError || !t) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

    const doc = await createPDFDocument('portrait', 'mm', 'a4');
    doc.setFontSize(20);
    doc.text('ORDEN DE TRANSFERENCIA', 14, 22);
    autoTable(doc, { startY: 85, head: [["PRODUCT", "QTY"]], body: t.items.map((i:any) => [i.product?.name, i.quantity]) });

    const pdfBuffer = doc.output('arraybuffer');
    return new Response(pdfBuffer, { headers: { 'Content-Type': 'application/pdf' } });
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}

export const GET = withTracing(withRole('manager', exportTransferPdfHandler as any), 'GET /api/transfers/[transferId]/export-pdf');
