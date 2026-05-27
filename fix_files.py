import os

export_pdf_content = """import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { withRole } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/tracing';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

async function exportTransferPdfHandler(
  req: Request,
  { params }: { params: { transferId: string } }
) {
  try {
    const { transferId } = params;
    const supabase = createRouteHandlerClient({ cookies });

    // 1. Fetch Transfer Details
    const { data: t, error: fetchError } = await supabase
      .from('transfers')
      .select(`
        *,
        origin_store:stores!transfers_origin_store_id_fkey(*),
        destination_store:stores!transfers_destination_store_id_fkey(*),
        creator:profiles!transfers_created_by_profiles_fkey(full_name),
        items:transfer_items(
          *,
          product:products(*)
        )
      `)
      .eq('id', transferId)
      .single();

    if (fetchError || !t) {
      return NextResponse.json({ error: 'Transferencia no encontrada' }, { status: 404 });
    }

    // 2. Generate PDF
    const doc = await createPDFDocument('portrait', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");

    // Header
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text('ORDEN DE TRANSFERENCIA', 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`ID: ${t.id}`, 14, 30);
    doc.text(`Estado: ${t.status}`, 14, 35);
    doc.text(`Fecha: ${format(new Date(t.created_at), "yyyy-MM-dd HH:mm")}`, 14, 40);
    doc.text(`Generado: ${timestamp}`, 14, 45);

    // Separator Line
    doc.setDrawColor(200);
    doc.line(14, 50, pageWidth - 14, 50);

    // Metadata Grid
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("INFORMACIÓN GENERAL", 14, 60);

    doc.setFont("helvetica", "normal");
    doc.text(`Almacén Origen: ${t.origin_store?.name || 'N/A'}`, 14, 68);
    doc.text(`Almacén Destino: ${t.destination_store?.name || 'N/A'}`, 14, 74);
    doc.text(`Solicitante: ${t.creator?.full_name || 'N/A'}`, pageWidth / 2, 68);
    doc.text(`Notas: ${t.notes || 'Sin notas'}`, pageWidth / 2, 74);

    // Table
    const tableHeaders = ["PRODUCTO", "SKU", "CANTIDAD", "COSTO UNIT.", "TOTAL"];
    const tableData = t.items.map((item: any) => [
      item.product?.name || 'N/A',
      item.product?.sku || 'N/A',
      item.quantity,
      item.unit_cost?.toLocaleString('es-ES', { minimumFractionDigits: 2 }),
      (item.quantity * (item.unit_cost || 0)).toLocaleString('es-ES', { minimumFractionDigits: 2 })
    ]);

    autoTable(doc, {
      startY: 85,
      head: [tableHeaders],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' }
      }
    });

    // Signatures
    const finalY = ((doc as any).lastAutoTable?.finalY || 85) + 30;
    doc.setFontSize(9);
    doc.text("__________________________", 30, finalY);
    doc.text("Firma de Entrega", 30, finalY + 5);

    doc.text("__________________________", pageWidth - 80, finalY);
    doc.text("Firma de Recepción", pageWidth - 80, finalY + 5);

    const pdfBuffer = doc.output('arraybuffer');

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="transferencia-${t.id}.pdf"`
      }
    });

  } catch (error: unknown) {
    console.error('Transfer export error:', error);
    return NextResponse.json({ error: 'Error al exportar PDF' }, { status: 500 });
  }
}

export const GET = withTracing(withRole('manager', exportTransferPdfHandler), 'GET /api/transfers/[transferId]/export-pdf');
"""

with open('src/app/api/transfers/[transferId]/export-pdf/route.ts', 'w') as f:
    f.write(export_pdf_content)

print("Successfully wrote export-pdf route.ts")
