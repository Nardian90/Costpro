
'use client';

import React, { useState, useRef } from 'react';
import jspdf from 'jspdf';
import html2canvas from 'html2canvas';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/useCostSheetCalculator';
import CostSheetNav from './CostSheetNav'; // <-- Restore navigation
import CostSheetInteractiveTable from './CostSheetInteractiveTable';
import CostSheetAnnexEditor from './CostSheetAnnexEditor';
import CostSheetHeaderEditor from './CostSheetHeaderEditor';
import CostSheetSignatureEditor from './CostSheetSignatureEditor';
import CostSheetHeader from './CostSheetHeader';
import CostSheetBody from './CostSheetBody';
import CostSheetAnnexes from './CostSheetAnnexes';
import CostSheetSignature from './CostSheetSignature';
import CostSheetPreview from './CostSheetPreview';
import CostSheetNarrative from './CostSheetNarrative';
import CostSheetWizard from './CostSheetWizard';
import ActionMenu from '@/components/ui/ActionMenu';
import { Eye, Edit, FileText, Trash2, Download, ShieldCheck, BookOpen, Wand2, Table2, FileSpreadsheet } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const CostSheetView = () => {
  const { data, loadExample, reset } = useCostSheetStore();
  const { calculatedValues, annexes, calculatedAnnexes } = useCostSheetCalculator(data);

  const [isEditing, setIsEditing] = useState(true);
  const [viewMode, setViewMode] = useState<'expert' | 'assisted' | 'reading'>('expert');
  // This state will now control which view is active in editing mode
  const [activeSection, setActiveSection] = useState('header'); // Default to header

  // **Guard against missing data during hydration**
  if (!data || !data.header || !data.annexes || !data.sections) {
    // This provides a fallback UI while the store rehydrates from localStorage
    return (
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 pb-32 pt-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 px-2">
          <div className="flex items-center gap-4">
            <Skeleton className="w-12 h-12 rounded-2xl" />
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-12 w-full mb-8" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Determine if the active section is an annex
  const isAnnexActive = data.annexes.some((a: any) => a.id === activeSection);
  const previewRef = useRef(null);
  const exportRef = useRef(null);

  const handleExportPDF = () => {
    const input = exportRef.current || previewRef.current;
    if (!input) {
      toast.error("No se pudo encontrar el elemento para exportar");
      return;
    }

    const toastId = toast.loading("Generando PDF... por favor espere.");

    // Temporarily set the theme to light for consistent PDF output
    const originalTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'light');

    html2canvas(input, {
      scale: 2, // Higher scale for better quality
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    }).then(canvas => {
      // Restore the original theme
      if (originalTheme) {
        document.documentElement.setAttribute('data-theme', originalTheme);
      }

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jspdf('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const ratio = canvasWidth / canvasHeight;
      const imgHeight = pdfWidth / ratio;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const fileName = data.header.name ? `Ficha de Costo - ${data.header.name}.pdf` : 'Ficha de Costo.pdf';
      pdf.save(fileName);
      toast.success("PDF generado con éxito", { id: toastId });
    }).catch(err => {
        console.error("PDF Export error:", err);
        toast.error("Error al generar el PDF", { id: toastId });
        if (originalTheme) {
            document.documentElement.setAttribute('data-theme', originalTheme);
        }
    });
  };

  const handleExportExcel = () => {
    try {
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "ID,Concepto,Valor Historico,Metodo,Base,Coeficiente,Total\n";

      const flatten = (rows: any[], level = 0) => {
        rows.forEach(row => {
          const calc = calculatedValues[row.id] || {};
          const label = row.label.replace(/,/g, ''); // Remove commas to avoid CSV break
          const vh = calc.valorHistorico || 0;
          const method = row.calculationMethod || (row.formula ? 'Fórmula' : 'Libre');
          const base = row.baseDeCalculoRef || '-';
          const coef = calc.coeficiente || 0;
          const total = calc.total || 0;

          csvContent += `${row.id},${"  ".repeat(level)}${label},${vh},${method},${base},${coef},${total}\n`;

          if (row.children) {
            flatten(row.children, level + 1);
          }
        });
      };

      data.sections.forEach((s: any) => {
        csvContent += `\n--- ${s.label.toUpperCase()} ---\n`;
        flatten(s.rows);
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      const fileName = data.header.name ? `Ficha de Costo - ${data.header.name}.csv` : 'Ficha de Costo.csv';
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Excel (CSV) exportado con éxito");
    } catch (error) {
      console.error("Excel Export error:", error);
      toast.error("Error al exportar a Excel");
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 pb-32 pt-4">
      {/* Hidden preview for PDF export */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1024px', opacity: 0, pointerEvents: 'none' }}>
          <CostSheetPreview
            ref={exportRef}
            data={data}
            calculatedValues={calculatedValues}
            calculatedAnnexes={calculatedAnnexes}
          />
      </div>

      {/* Top Banner/Title */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 px-2">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 rotate-3">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight leading-tight">
              Ficha de Costo
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">
              Sistema de Gestión COSTPRO
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="neu-badge !text-success !bg-success/10 border border-success/20 py-1 px-3">
            Sistema Activo
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 mb-8">
        <ActionMenu
            actions={[
            {
                id: 'toggle-mode',
                label: isEditing ? 'Ver Resultado' : 'Seguir Editando',
                icon: isEditing ? Eye : Edit,
                onClick: () => setIsEditing(!isEditing),
                variant: 'primary',
            },
            { id: 'load-example', label: 'Ejemplo', icon: FileText, onClick: loadExample, variant: 'outline' },
            { id: 'reset', label: 'Reiniciar', icon: Trash2, onClick: reset, variant: 'danger' },
            { id: 'export-excel', label: 'Excel', icon: FileSpreadsheet, onClick: handleExportExcel, variant: 'primary' },
            { id: 'export-pdf', label: 'PDF', icon: Download, onClick: handleExportPDF, variant: 'success' },
            ]}
        />

        {isEditing && (
             <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl w-fit self-center sm:self-start">
                <button
                    onClick={() => setViewMode('expert')}
                    className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all", viewMode === 'expert' ? "bg-white dark:bg-slate-800 shadow-sm text-primary" : "text-slate-500 hover:text-slate-700")}
                >
                    <Table2 className="w-4 h-4" />
                    Modo Experto
                </button>
                <button
                    onClick={() => setViewMode('assisted')}
                    className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all", viewMode === 'assisted' ? "bg-white dark:bg-slate-800 shadow-sm text-primary" : "text-slate-500 hover:text-slate-700")}
                >
                    <Wand2 className="w-4 h-4" />
                    Modo Asistido
                </button>
                <button
                    onClick={() => setViewMode('reading')}
                    className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all", viewMode === 'reading' ? "bg-white dark:bg-slate-800 shadow-sm text-primary" : "text-slate-500 hover:text-slate-700")}
                >
                    <BookOpen className="w-4 h-4" />
                    Modo Lectura
                </button>
             </div>
        )}
      </div>

      {isEditing ? (
        <div className="animate-in fade-in duration-700 space-y-6">
          {viewMode === 'expert' && (
            <>
                <CostSheetNav
                    sections={[{ id: 'header', label: 'Encabezado' }, { id: 'main', label: 'Tabla Principal' }]}
                    annexes={data.annexes}
                    activeSection={activeSection}
                    setActiveSection={setActiveSection}
                />
                <div className="mt-4">
                    {activeSection === 'header' && <CostSheetHeaderEditor />}
                    {activeSection === 'main' && (
                    <CostSheetInteractiveTable
                        sections={data.sections}
                        calculatedValues={calculatedValues}
                        annexes={data.annexes}
                    />
                    )}
                    {isAnnexActive && <CostSheetAnnexEditor activeAnnexId={activeSection} />}
                    {activeSection === 'signature' && <CostSheetSignatureEditor />}
                </div>
            </>
          )}

          {viewMode === 'assisted' && (
              <CostSheetWizard data={data} calculatedValues={calculatedValues} />
          )}

          {viewMode === 'reading' && (
               <CostSheetNarrative data={data} calculatedValues={calculatedValues} />
          )}
        </div>
      ) : (
        <div className="animate-in zoom-in-95 duration-500">
            <CostSheetPreview
                ref={previewRef}
                data={data}
                calculatedValues={calculatedValues}
                calculatedAnnexes={calculatedAnnexes}
            />
        </div>
      )}
    </div>
  );
};

export default CostSheetView;
