
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

const CostSheetView = () => {
  const { data, loadExample, reset } = useCostSheetStore();
  const { calculatedValues } = useCostSheetCalculator(data);

  const [isEditing, setIsEditing] = useState(true);
  const [activeSection, setActiveSection] = useState('header'); // Default to header

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex justify-end space-x-2 mb-4">
        <Button onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? 'Preview' : 'Edit'}
        </Button>
        <Button variant="outline" onClick={loadExample}>Load Example</Button>
        <Button variant="destructive" onClick={reset}>Reset</Button>
      </div>

      {isEditing ? (
        <>
          <CostSheetNav
            sections={data.sections}
            annexes={data.annexes}
            activeSection={activeSection}
            setActiveSection={setActiveSection}
          />
          <CostSheetForm activeSection={activeSection} />
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
