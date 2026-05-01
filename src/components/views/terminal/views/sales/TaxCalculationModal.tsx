'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Calculator, FileDown, Receipt, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Transaction } from '@/types';
import { useTaxes } from '@/hooks/api/useTaxes';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { createPDFDocument } from '@/lib/export/lazy-pdf';

interface TaxCalculationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTransactions: Transaction[];
}

export const TaxCalculationModal = ({
  isOpen,
  onClose,
  selectedTransactions,
}: TaxCalculationModalProps) => {
  const { user } = useAuthStore();
  const { data: taxes = [] } = useTaxes(user?.activeStoreId);
  const [includeAnnex, setIncludeAnnex] = useState(true);
  const [exportMode, setExportMode] = useState<'combined' | 'separate'>('combined');

  const totalSales = selectedTransactions.reduce((acc, txn) => acc + txn.total_amount, 0);
  const activeTaxes = taxes.filter(t => t.is_active);

  const calculateTax = (base: number, tax: any) => {
    if (tax.type === 'percentage') {
      const taxableAmount = Math.max(0, base - (tax.min_exempt || 0));
      return (taxableAmount * tax.value) / 100;
    }
    return tax.value;
  };

  const handleExportPDF = async () => {
    const doc = await createPDFDocument();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(18);
    doc.text('Reporte de Cálculo de Impuestos', 14, 20);
    doc.setFontSize(10);
    doc.text(`Fecha de generación: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Usuario: ${user?.fullName || 'Admin'}`, 14, 34);
    doc.text(`Facturas seleccionadas: ${selectedTransactions.length}`, 14, 40);

    // Summary Table
    (doc as any).autoTable({
      startY: 50,
      head: [['Concepto', 'Base de Cálculo', 'Cálculo', 'Total']],
      body: [
        ['Ventas Totales (Base)', formatCurrency(totalSales), '-', formatCurrency(totalSales)],
        ...activeTaxes.map(tax => [
          tax.name,
          formatCurrency(totalSales),
          tax.type === 'percentage' ? `${tax.value}%` : 'Fijo',
          formatCurrency(calculateTax(totalSales, tax))
        ]),
        [{ content: 'Total con Impuestos', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
         formatCurrency(totalSales + activeTaxes.reduce((acc, t) => acc + calculateTax(totalSales, t), 0))]
      ],
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] }
    });

    if (exportMode === 'separate') {
      activeTaxes.forEach((tax, index) => {
        doc.addPage();
        doc.setFontSize(16);
        doc.text(`Detalle de Impuesto: ${tax.name}`, 14, 20);

        (doc as any).autoTable({
          startY: 30,
          head: [['Concepto', 'Base', 'Tasa', 'Total']],
          body: [
            ['Base Imponible', formatCurrency(totalSales), '-', formatCurrency(totalSales)],
            [tax.name, formatCurrency(totalSales), tax.type === 'percentage' ? `${tax.value}%` : 'Fijo', formatCurrency(calculateTax(totalSales, tax))],
          ],
          theme: 'grid',
          headStyles: { fillColor: [59, 130, 246] }
        });

        if (includeAnnex) {
          doc.setFontSize(12);
          doc.text('Anexo de Facturas (esta sección)', 14, (doc as any).lastAutoTable.finalY + 15);
          (doc as any).autoTable({
            startY: (doc as any).lastAutoTable.finalY + 20,
            head: [['Referencia', 'Monto']],
            body: selectedTransactions.map(t => [t.id.split('-')[0].toUpperCase(), formatCurrency(t.total_amount)]),
            theme: 'plain'
          });
        }
      });
    } else {
      if (includeAnnex) {
        doc.setFontSize(12);
        doc.text('Anexo: Detalle de Facturas', 14, (doc as any).lastAutoTable.finalY + 15);

        (doc as any).autoTable({
          startY: (doc as any).lastAutoTable.finalY + 20,
          head: [['Referencia', 'Fecha', 'Monto']],
          body: selectedTransactions.map(t => [
            t.id.split('-')[0].toUpperCase(),
            formatDate(t.created_at),
            formatCurrency(t.total_amount)
          ]),
          theme: 'plain',
          headStyles: { fillColor: [100, 116, 139] }
        });
      }
    }

    doc.save(`reporte-impuestos-${new Date().getTime()}.pdf`);
    toast.success('PDF generado con éxito');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="bg-primary p-8 text-foreground relative">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Calculator className="w-24 h-24 rotate-12" />
          </div>
          <DialogTitle className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
            <Calculator className="w-8 h-8" />
            Cálculo de Impuestos
          </DialogTitle>
          <DialogDescription className="text-white/80 font-bold uppercase text-xs tracking-widest mt-2">
             Procesando {selectedTransactions.length} facturas seleccionadas
          </DialogDescription>
        </DialogHeader>

        <div className="p-8 space-y-8 bg-card">
          {/* Main Calculation */}
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-4 border-b border-border/50">
              <span className="text-xs font-black uppercase text-muted-foreground tracking-widest">Base Imponible (Ventas)</span>
              <span className="text-xl font-black text-foreground">{formatCurrency(totalSales)}</span>
            </div>

            <div className="space-y-3">
              {activeTaxes.length > 0 ? (
                activeTaxes.map(tax => (
                  <div key={tax.id} className="flex justify-between items-center p-4 rounded-xl bg-muted/30 border border-border/50 group hover:border-primary/30 transition-all">
                    <div>
                      <div className="text-xs font-black uppercase text-primary tracking-tight">{tax.name}</div>
                      <div className="text-xs font-bold text-muted-foreground uppercase">
                        {tax.type === 'percentage' ? `${tax.value}%` : formatCurrency(tax.value)}
                        {tax.min_exempt ? ` (Mín. Exento: ${formatCurrency(tax.min_exempt)})` : ''}
                      </div>
                    </div>
                    <div className="text-base font-black text-foreground">
                      +{formatCurrency(calculateTax(totalSales, tax))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  <p className="text-xs font-bold text-amber-700 uppercase leading-tight">
                    No hay impuestos activos configurados para este cálculo.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-6 border-t-2 border-primary/20 flex justify-between items-center">
              <span className="text-sm font-black uppercase text-primary tracking-widest">Total proyectado</span>
              <span className="text-3xl font-black text-primary tracking-tighter">
                {formatCurrency(totalSales + activeTaxes.reduce((acc, t) => acc + calculateTax(totalSales, t), 0))}
              </span>
            </div>
          </div>

          {/* Export Options */}
          <div className="space-y-4 p-6 rounded-2xl border border-border bg-background/50">
            <h4 className="text-xs font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
              <FileDown className="w-3 h-3" />
              Opciones de Exportación
            </h4>

            <div className="space-y-3">
              <button
                onClick={() => setIncludeAnnex(!includeAnnex)}
                className="flex items-center gap-3 w-full text-left group"
              >
                <div className={cn(
                  "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                  includeAnnex ? "bg-primary border-primary" : "border-muted-foreground/30"
                )}>
                  {includeAnnex && <CheckCircle2 className="w-3 h-3 text-foreground" />}
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-tight">Incluir Anexo de Facturas</div>
                  <div className="text-xs font-bold text-muted-foreground uppercase">Lista detallada de números de referencia</div>
                </div>
              </button>

              <div className="pt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setExportMode('combined')}
                  className={cn(
                    "p-3 rounded-lg border text-center transition-all",
                    exportMode === 'combined' ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"
                  )}
                >
                  <div className="text-xs font-black uppercase">Conjunto</div>
                </button>
                <button
                  onClick={() => setExportMode('separate')}
                  className={cn(
                    "p-3 rounded-lg border text-center transition-all",
                    exportMode === 'separate' ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"
                  )}
                >
                  <div className="text-xs font-black uppercase">Separado</div>
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleExportPDF}
            className="w-full py-4 bg-primary text-foreground rounded-xl font-black text-sm uppercase tracking-widest shadow-xl shadow-primary/20 flex items-center justify-center gap-3 hover:scale-[1.02] transition-all active:scale-95"
          >
            <FileDown className="w-5 h-5" />
            Exportar Reporte PDF
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
