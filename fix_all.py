import os

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(content)

# 1. Fix src/app/api/reports/generate/route.ts
reports_generate = """import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseClient';
import { withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { reportsGenerateSchema } from '@/validation/api-schemas';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { COLUMN_LABELS } from '@/contracts/reports';

async function generateReportHandler(
  req: NextRequest,
  session: AuthenticatedSession
) {
  try {
    const body = await req.json();
    const validatedBody = reportsGenerateSchema.safeParse(body);

    if (!validatedBody.success) {
      return NextResponse.json({
        error: 'Datos de reporte inválidos',
        details: validatedBody.error.format()
      }, { status: 400 });
    }

    const { type, from, to, store_id, columns, name } = validatedBody.data;
    const supabase = createServerClient();

    // effectiveStoreId from params or session
    const effectiveStoreId = store_id || (session.user as any)?.activeStoreId;

    const { data: runData, error: runError } = await supabase
      .from('report_runs')
      .insert({
        report_definition_id: body.definition_id || null,
        status: 'processing',
        parameters_snapshot: body,
        executed_by: session.user.id
      })
      .select()
      .single();

    if (runError) throw runError;

    // 2. Fetch Data
    let data: any[] = [];
    const fromDate = from ? from + 'T00:00:00' : null;
    const toDate = to ? to + 'T23:59:59' : null;

    switch (type) {
      case 'sales': {
        const { data: salesData, error: salesError } = await supabase.rpc('get_transactions', {
          p_store_id: effectiveStoreId,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_limit: 10000
        });
        if (salesError) throw salesError;
        data = salesData || [];
        break;
      }

      case 'inventory': {
        const { data: invData, error: invError } = await supabase.rpc('get_paginated_products', {
          p_store_id: effectiveStoreId,
          p_limit: 10000,
          p_offset: 0,
          p_category: body.filters?.category || null
        });
        if (invError) throw invError;
        data = invData || [];
        break;
      }

      case 'profit': {
        const { data: profitData, error: profitError } = await supabase.rpc('get_profit_report', {
          p_store_id: effectiveStoreId,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_limit: 10000
        });
        if (profitError) throw profitError;
        data = profitData || [];
        break;
      }

      case 'purchases': {
        const { data: purchaseData, error: purchaseError } = await supabase.from('receipts')
          .select('*')
          .eq('store_id', effectiveStoreId)
          .gte('created_at', from || '1970-01-01')
          .lte('created_at', to || '2100-01-01')
          .order('created_at', { ascending: false })
          .limit(1000);
        if (purchaseError) throw purchaseError;
        data = purchaseData || [];
        break;
      }

      case 'daily_income': {
        const { data: incomeData, error: incomeError } = await supabase.rpc('get_daily_income_aggregated', {
          p_store_id: effectiveStoreId,
          p_date_from: fromDate,
          p_date_to: toDate
        });
        if (incomeError) throw incomeError;
        data = incomeData || [];
        break;
      }

      case 'daily_expenses': {
        const { data: expData, error: expError } = await supabase.rpc('get_daily_expenses_aggregated', {
          p_store_id: effectiveStoreId,
          p_date_from: from || null,
          p_date_to: to || null
        });
        if (expError) throw expError;
        data = expData || [];
        break;
      }

      case 'kardex': {
        const productId = body.filters?.product_id;
        if (!productId) {
          data = [];
          break;
        }
        const { data: kardexData, error: kardexError } = await supabase.rpc('get_product_stock_ledger_paginated', {
          p_product_id: productId,
          p_store_id: effectiveStoreId,
          p_limit: 1000,
          p_offset: 0
        });
        if (kardexError) throw kardexError;
        data = kardexData || [];
        break;
      }

      case 'audit': {
        const { data: auditData, error: auditError } = await supabase.rpc('get_audit_logs', {
          p_store_id: effectiveStoreId,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_limit: 10000
        });
        if (auditError) throw auditError;
        data = auditData || [];
        break;
      }

      case 'transfer': {
        const { data: transferData, error: transferError } = await supabase.rpc('get_transfers', {
          p_store_id: effectiveStoreId,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_status: null,
          p_limit: 1000
        });
        if (transferError) throw transferError;
        data = transferData || [];
        break;
      }

      case 'cash': {
        const { data: cashData, error: cashError } = await supabase.rpc('get_cash_closures', {
          p_store_id: effectiveStoreId,
          p_date_from: from || null,
          p_date_to: to || null,
          p_limit: 1000
        });
        if (cashError) throw cashError;
        data = cashData || [];
        break;
      }

      case 'cost_sheet':
        // Data already handled above
        break;

      default:
        throw new Error(`Tipo de reporte no soportado: ${type}`);
    }

    // 3. Generate PDF
    const doc = await createPDFDocument(
      body.orientation || 'portrait',
      'mm',
      body.format || 'a4'
    );

    const pageWidth = doc.internal.pageSize.getWidth();
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss");

    if (type === 'cost_sheet') {
      const costData = body.data as any;
      const calcValues = body.calculatedValues || {};
      const calcAnnexes = body.calculatedAnnexes || [];

      if (!costData) {
        throw new Error('Datos de ficha de costo requeridos para este reporte');
      }

      // --- CUSTOM COST SHEET GENERATOR ---

      // Formal Ministry Header
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("MINISTERIO DE FINANZAS Y PRECIOS", pageWidth / 2, 15, { align: "center" });
      doc.setFontSize(8);
      doc.text("FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS", pageWidth / 2, 20, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.text("PARA LA EVALUACIÓN DE PRECIOS Y TARIFAS", pageWidth / 2, 24, { align: "center" });

      // Title
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(costData.header.name?.toUpperCase() || "FICHA DE COSTO", 14, 35);

      // Metadata Grid
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("DATOS GENERALES:", 14, 42);
      doc.line(14, 43, 50, 43);

      const metadata = [
        [`No. FC: ${costData.header.code}`, `Fecha: ${costData.header.date}`],
        [`UM: ${costData.header.unit}`, `Cantidad: ${costData.header.quantity}`],
        [`Moneda: ${costData.header.currency}`, `Organismo: ${costData.header.category}`],
        [`Nivel Prod: ${costData.header.productionLevel || 'N/A'}`, `Utilización: ${costData.header.utilization || 'N/A'}`],
        [`Precio Venta: ${costData.header.salePrice || 'N/A'}`, ""]
      ];

      let yPos = 48;
      doc.setFont("helvetica", "normal");
      metadata.forEach(row => {
        doc.text(row[0], 14, yPos);
        doc.text(row[1], pageWidth / 2, yPos);
        yPos += 5;
      });

      // Main Table
      const mainHeaders = ["FILA", "CONCEPTO", "VALOR HISTÓRICO", "BASE CÁLCULO", "TOTAL"];
      const mainRows: any[] = [];

      const processRows = (rows: any[], level = 0) => {
        rows.forEach(row => {
          const calc = calcValues[row.id] || { total: 0, valorHistorico: 0, baseTotal: 0 };
          const prefix = "  ".repeat(level);

          let baseDisplay = '-';
          if (row.base_display_override) baseDisplay = row.base_display_override;
          else if (row.isPercent ?? row.is_percent) baseDisplay = `${((row.value || 0) * 100).toFixed(2)}%`;
          else if (calc.baseTotal > 0) baseDisplay = calc.baseTotal.toLocaleString('es-ES');

          mainRows.push([
            row.id,
            prefix + row.label.toUpperCase(),
            calc.valorHistorico > 0 ? calc.valorHistorico.toLocaleString('es-ES', { minimumFractionDigits: 2 }) : '--',
            baseDisplay,
            calc.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })
          ]);

          if (row.children) processRows(row.children, level + 1);
        });
      };

      costData.sections.forEach((section: any) => {
        mainRows.push([{ content: section.label.toUpperCase(), colSpan: 5, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } }]);
        processRows(section.rows);
      });

      autoTable(doc, {
        startY: yPos + 5,
        head: [mainHeaders],
        body: mainRows,
        theme: 'grid',
        headStyles: { fillColor: [40, 40, 40], textColor: 255, fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        columnStyles: {
          0: { cellWidth: 15, halign: 'center' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right', fontStyle: 'bold' }
        }
      });

      // Annexes
      let finalY = (doc as any).lastAutoTable?.finalY ?? 50 + 10;

      calcAnnexes.forEach((annex: any) => {
        if (finalY > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          finalY = 20;
        }

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(`${annex.id || ''} - ${annex.title}`.toUpperCase(), 14, finalY);

        const headers = annex.columns.map((c: any) => (c.label || c.title || c.key).toUpperCase());
        const data = annex.data.map((row: any) => annex.columns.map((col: any) => {
          const val = row[col.key];
          if (typeof val === 'number') {
              return val.toLocaleString('es-ES', {
                  minimumFractionDigits: (col.key === 'no' || col.key === 'quantity' || col.key === 'days' || col.key === 'worker_count') ? 0 : 2,
                  maximumFractionDigits: 4
              });
          }
          return val || '-';
        }));

        autoTable(doc, {
          startY: finalY + 2,
          head: [headers],
          body: data,
          theme: 'striped',
          headStyles: { fillColor: [80, 80, 80], textColor: 255, fontSize: 6 },
          styles: { fontSize: 6, cellPadding: 1 },
        });

        finalY = (doc as any).lastAutoTable?.finalY ?? 50 + 10;
      });

      // Signatures
      if (finalY > doc.internal.pageSize.getHeight() - 30) {
        doc.addPage();
        finalY = 30;
      }

      doc.setFontSize(8);
      doc.text("__________________________", 30, finalY + 15);
      doc.text("Elaborado por", 30, finalY + 20);

      doc.text("__________________________", pageWidth - 80, finalY + 15);
      doc.text("Aprobado por", pageWidth - 80, finalY + 20);

    } else {
      // --- STANDARD REPORT GENERATOR ---
      // Header
      doc.setFontSize(20);
      doc.setTextColor(40, 40, 40);
      doc.text(name || 'Reporte de Sistema', 14, 22);

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Tipo: ${type.toUpperCase()}`, 14, 30);
      doc.text(`Periodo: ${from || 'N/A'} - ${to || 'N/A'}`, 14, 35);
      doc.text(`Generado: ${timestamp}`, 14, 40);

      // Separator Line
      doc.setDrawColor(200);
      doc.line(14, 45, pageWidth - 14, 45);

      // Table
      const tableHeaders: string[] = (columns && columns.length > 0) ? columns : Object.keys(data[0] || {}).slice(0, 7);
      const tableData = data.map((row: any) => tableHeaders.map((col: string) => {
          const val = row[col];
          if (typeof val === 'object' && val !== null) return JSON.stringify(val);
          return val?.toString() || '';
      }));

      const displayHeaders = tableHeaders.map(h => (COLUMN_LABELS[h] || h).toUpperCase());

      autoTable(doc, {
        startY: 50,
        head: [displayHeaders],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { top: 50 },
        didDrawPage: (_data: any) => {
          // Footer
          const str = `Página ${doc.getNumberOfPages()}`;
          doc.setFontSize(8);
          doc.text(str, pageWidth - 30, doc.internal.pageSize.getHeight() - 10);
          doc.text('Documento generado automáticamente por CostPro', 14, doc.internal.pageSize.getHeight() - 10);
        }
      });
    }

    const pdfBuffer = doc.output('arraybuffer');

    // 4. Upload to Storage
    if (!runData?.id) {
        throw new Error('Error al crear el registro de ejecución del reporte');
    }

    const fileName = `reports/${type}/${runData.id}.pdf`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('reports')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
        // Handle bucket not found by trying to use a public one or failing gracefully
        console.error('Storage error:', uploadError);
        // Update run status to failed
        if (runData?.id) {
            await supabase
                .from('report_runs')
                .update({ status: 'failed', error_message: 'Error al subir a storage: ' + uploadError.message })
                .eq('id', runData.id);
        }

        if (uploadError.message === 'Bucket not found') {
            throw new Error('El sistema de almacenamiento de reportes no está configurado (Bucket not found). Por favor, contacte al administrador.');
        }
        throw uploadError;
    }

    const { data: urlData } = supabase.storage.from('reports').getPublicUrl(fileName);

    // 5. Update run status
    await supabase
      .from('report_runs')
      .update({
        status: 'completed',
        file_url: urlData.publicUrl,
        executed_at: new Date().toISOString()
      })
      .eq('id', runData.id);

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      run_id: runData.id
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error interno al generar reporte';
    console.error('Report generation error:', error);
    return NextResponse.json({
      error: msg
    }, { status: 500 });
  }
}

export const POST = withTracing(withRole('manager', generateReportHandler as any), 'POST /api/reports/generate');
"""

# 2. Fix src/app/api/transfers/[transferId]/export-pdf/route.ts
transfers_export = """import { NextRequest, NextResponse } from 'next/server';
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
    // Extract transferId from the URL
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const transferId = parts[parts.length - 2];

    if (!transferId) {
      return NextResponse.json({ error: 'ID de transferencia requerido' }, { status: 400 });
    }

    const supabase = createServerClient();

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

export const GET = withTracing(withRole('manager', exportTransferPdfHandler as any), 'GET /api/transfers/[transferId]/export-pdf');
"""

# 3. Fix src/components/views/terminal/views/transfers/TransferDetailsModal.tsx
transfer_details_modal = """import React, { useState } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { useTransferDetails, useConfirmTransfer, useCancelTransfer } from '@/hooks/api/useTransfers';
import { useAuthStore } from '@/store';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, Clock, Package, Building, User, Calendar, XCircle, FileDown } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import type { Transfer, TransferItem, TransferStatus } from '@/types';

interface TransferDetailsModalProps {
  transferId: string | null;
  onClose: () => void;
}

/** Devuelve el badge de estado con icono y color apropiado */
function StatusBadge({ status }: { status: TransferStatus }) {
  switch (status) {
    case 'PENDIENTE':
      return (
        <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest">
          <Clock className="w-3 h-3" /> Pendiente
        </span>
      );
    case 'CONFIRMADA':
      return (
        <span className="flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest">
          <CheckCircle2 className="w-3 h-3" /> Confirmada
        </span>
      );
    case 'CANCELADA':
      return (
        <span className="flex items-center gap-1 text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest">
          <XCircle className="w-3 h-3" /> Cancelada
        </span>
      );
    default:
      return <span className="text-xs">{status}</span>;
  }
}

export default function TransferDetailsModal({ transferId, onClose }: TransferDetailsModalProps) {
  const { user } = useAuthStore();
  const { data: transfer, isLoading, error } = useTransferDetails(transferId);
  const confirmMutation = useConfirmTransfer();
  const cancelMutation = useCancelTransfer();

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const handleConfirm = async () => {
    if (!transferId || !user) return;

    setShowConfirmDialog(false);
    const toastId = toast.loading('Confirmando transferencia y actualizando stock...');
    try {
      await confirmMutation.mutateAsync({ transferId, userId: user.id });
      toast.success('Transferencia confirmada con éxito', { id: toastId });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al confirmar la transferencia';
      toast.error(message, { id: toastId });
    }
  };

  const handleCancel = async () => {
    if (!transferId || !user) return;

    setShowCancelDialog(false);
    const toastId = toast.loading('Cancelando transferencia...');
    try {
      await cancelMutation.mutateAsync({ transferId, userId: user.id });
      toast.success('Transferencia cancelada con éxito', { id: toastId });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cancelar la transferencia';
      toast.error(message, { id: toastId });
    }
  };

  const handleExportPdf = () => {
    if (!transferId) return;
    window.open(`/api/transfers/${transferId}/export-pdf`, '_blank');
  };

  const isIncoming = transfer?.destination_store_id === user?.activeStoreId;
  const isOutgoing = transfer?.origin_store_id === user?.activeStoreId;
  const canConfirm = isIncoming && transfer?.status === 'PENDIENTE';
  const canCancel = (isOutgoing || user?.role === 'admin' || user?.role === 'manager') && transfer?.status === 'PENDIENTE';

  return (
    <>
      <BaseModal
        open={!!transferId}
        onOpenChange={(open: boolean) => !open && onClose()}
        title={
          transfer ? (
            <div className="flex justify-between items-center w-full">
              <div className="flex items-center gap-3">
                <Package className="w-6 h-6 text-primary" />
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight">Detalle de Transferencia</h3>
                  <p className="text-xs text-muted-foreground font-mono uppercase">ID: {transfer.id}</p>
                </div>
              </div>
              <StatusBadge status={transfer.status} />
            </div>
          ) : 'Cargando...'
        }
        maxWidth="sm:max-w-3xl"
        footer={
          <div className="flex flex-col sm:flex-row justify-between gap-3 w-full">
            <div className="flex gap-2 flex-wrap">
              {transfer?.status === 'PENDIENTE' && (
                <button
                  type="button"
                  onClick={() => setShowCancelDialog(true)}
                  disabled={cancelMutation.isPending}
                  className={`neu-btn px-4 py-2 text-xs font-black uppercase tracking-widest flex items-center gap-2 text-rose-500 ${!canCancel && 'opacity-50 cursor-not-allowed'}`}
                  title={!canCancel ? "No tienes permisos para cancelar esta transferencia" : ""}
                >
                  <XCircle className="w-4 h-4" />
                  Cancelar Transferencia
                </button>
              )}
              <button
                type="button"
                onClick={handleExportPdf}
                className="neu-btn px-4 py-2 text-xs font-black uppercase tracking-widest flex items-center gap-2"
              >
                <FileDown className="w-4 h-4" />
                Exportar PDF
              </button>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="neu-btn px-6 py-2.5 text-xs font-black uppercase tracking-widest"
              >
                Cerrar
              </button>
              {canConfirm && (
                <button
                  type="button"
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={confirmMutation.isPending}
                  className="neu-btn-primary px-8 py-2.5 text-xs font-black uppercase tracking-widest flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar Recepción
                </button>
              )}
            </div>
          </div>
        }
      >
        <StateRenderer
          isLoading={isLoading}
          error={error as Error}
          data={transfer ? [transfer] : null}
        >
          {([t]: Transfer[]) => (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Building className="w-4 h-4 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block text-left">Origen</p>
                      <p className="text-sm font-bold">{t.origin_store?.name}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Building className="w-4 h-4 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block text-left">Destino</p>
                      <p className="text-sm font-bold">{t.destination_store?.name}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <User className="w-4 h-4 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block text-left">Solicitante</p>
                      <p className="text-sm font-bold">{t.creator?.full_name}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Calendar className="w-4 h-4 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block text-left">Fecha de Solicitud</p>
                      <p className="text-sm font-bold">{formatDate(t.created_at)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {t.notes && (
                <div className="neu-card bg-white/2 !p-3">
                  <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1 block text-left">Notas</p>
                  <p className="text-sm italic text-muted-foreground">&ldquo;{t.notes}&rdquo;</p>
                </div>
              )}

              <div className="space-y-3 text-left">
                <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-white/5 pb-2">Lista de Productos</h4>
                <div className="space-y-2">
                  {t.items?.map((item: TransferItem) => (
                    <div key={item.id} className="neu-card bg-white/2 !p-3 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-bold">{item.product?.name}</p>
                        <p className="text-xs text-muted-foreground font-mono uppercase">SKU: {item.product?.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Cantidad</p>
                        <p className="text-lg font-black text-primary">{item.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </StateRenderer>
      </BaseModal>

      {/* Diálogo de confirmación antes de confirmar recepción */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar recepción de transferencia</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción actualizará el stock del almacén destino con los productos de la transferencia.
              La operación no se puede deshacer. ¿Deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={confirmMutation.isPending}>
              {confirmMutation.isPending ? 'Procesando...' : 'Sí, confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de confirmación antes de cancelar */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar transferencia?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción marcará la transferencia como CANCELADA. Esta operación no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelMutation.isPending} className="bg-rose-600 hover:bg-rose-700">
              {cancelMutation.isPending ? 'Cancelando...' : 'Sí, cancelar transferencia'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
"""

write_file('src/app/api/reports/generate/route.ts', reports_generate)
write_file('src/app/api/transfers/[transferId]/export-pdf/route.ts', transfers_export)
write_file('src/components/views/terminal/views/transfers/TransferDetailsModal.tsx', transfer_details_modal)

print("Final fix completed for all problematic source files.")
