'use client';

import React, { useState, useRef } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/useCostSheetCalculator';
import CostSheetNav from './CostSheetNav';
import CostSheetInteractiveTable from './CostSheetInteractiveTable';
import CostSheetAnnexEditor from './CostSheetAnnexEditor';
import CostSheetHeaderEditor from './CostSheetHeaderEditor';
import CostSheetSignatureEditor from './CostSheetSignatureEditor';
import CostSheetPreview from './CostSheetPreview';
import CostSheetNarrative from './CostSheetNarrative';
import CostSheetWizard from './CostSheetWizard';
import { CostSheetBanner } from './CostSheetBanner';
import { CostSheetModeSwitcher } from './CostSheetModeSwitcher';
import ActionMenu from '@/components/ui/ActionMenu';
import { Eye, Edit, FileText, Trash2, Download, FileSpreadsheet } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { exportToPDF, exportToCSV } from '@/services/export-service';

const CostSheetView = () => {
  const { data, loadExample, reset } = useCostSheetStore();
  const { calculatedValues, calculatedAnnexes } = useCostSheetCalculator(data);

  const [isEditing, setIsEditing] = useState(true);
  const [viewMode, setViewMode] = useState<'expert' | 'assisted' | 'reading'>('expert');
  const [activeSection, setActiveSection] = useState('header');

  const previewRef = useRef(null);
  const exportRef = useRef(null);

  if (!data || !data.header || !data.annexes || !data.sections) {
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

  const isAnnexActive = data.annexes.some((a: any) => a.id === activeSection);

  const handleExportPDF = () => {
    const input = exportRef.current || previewRef.current;
    if (!input) {
      toast.error("No se pudo encontrar el elemento para exportar");
      return;
    }
    const fileName = data.header.name ? `Ficha de Costo - ${data.header.name}` : 'Ficha de Costo';
    exportToPDF(input, fileName);
  };

  const handleExportExcel = () => {
    const fileName = data.header.name ? `Ficha de Costo - ${data.header.name}` : 'Ficha de Costo';
    exportToCSV(data, calculatedValues, fileName);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 pb-32 pt-4">
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1024px', opacity: 0, pointerEvents: 'none' }}>
          <CostSheetPreview
            ref={exportRef}
            data={data}
            calculatedValues={calculatedValues}
            calculatedAnnexes={calculatedAnnexes}
          />
      </div>

      <CostSheetBanner />

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
             <CostSheetModeSwitcher viewMode={viewMode} setViewMode={setViewMode} />
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
