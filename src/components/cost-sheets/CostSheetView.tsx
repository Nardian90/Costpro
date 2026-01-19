
'use client';

import React, { useState } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/useCostSheetCalculator';
import CostSheetNav from './CostSheetNav';
import CostSheetForm from './CostSheetForm';
import CostSheetHeader from './CostSheetHeader';
import CostSheetBody from './CostSheetBody';
import CostSheetAnnexes from './CostSheetAnnexes';
import { Button } from '@/components/ui/button';
import CostSheetSignature from './CostSheetSignature';
import ActionMenu from '@/components/ui/ActionMenu';
import { Eye, Edit, FileText, Trash2, Download } from 'lucide-react';

const CostSheetView = () => {
  const { data, loadExample, reset } = useCostSheetStore();
  const { calculatedValues, calculatedAnnexes } = useCostSheetCalculator(data);

  const [isEditing, setIsEditing] = useState(true);
  const [activeSection, setActiveSection] = useState('header'); // Default to header

  return (
    <div className="max-w-7xl mx-auto p-2 sm:p-6 lg:p-8 pb-24">
      <ActionMenu
        actions={[
          {
            id: 'toggle-mode',
            label: isEditing ? 'Vista Previa' : 'Modo Edición',
            icon: isEditing ? Eye : Edit,
            onClick: () => setIsEditing(!isEditing),
            variant: 'primary',
          },
          {
            id: 'load-example',
            label: 'Cargar Ejemplo',
            icon: FileText,
            onClick: loadExample,
            variant: 'outline',
          },
          {
            id: 'reset',
            label: 'Reiniciar Todo',
            icon: Trash2,
            onClick: reset,
            variant: 'danger',
          },
          {
            id: 'export-pdf',
            label: 'Exportar PDF',
            icon: Download,
            onClick: () => window.print(),
            variant: 'success',
          },
        ]}
        className="mb-8"
      />

      {isEditing ? (
        <>
          <CostSheetNav
            sections={data.sections}
            annexes={data.annexes}
            activeSection={activeSection}
            setActiveSection={setActiveSection}
          />
          <CostSheetForm
            activeSection={activeSection}
            calculatedAnnexes={calculatedAnnexes}
            calculatedValues={calculatedValues}
          />
        </>
      ) : (
        <div className="bg-white text-gray-900 p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto">
                <CostSheetHeader header={data.header} />
                <main className="my-6">
                <CostSheetBody
                    sections={data.sections}
                    calculatedValues={calculatedValues}
                />
                <CostSheetAnnexes
                    annexes={data.annexes}
                />
                </main>
                <CostSheetSignature {...data.signature} />
            </div>
        </div>
      )}
    </div>
  );
};

export default CostSheetView;
