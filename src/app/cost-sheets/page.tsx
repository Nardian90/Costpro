
'use client';

import React, { useState } from 'react';
import template from '@/lib/data/costpro-full.json';
import { useCostSheetCalculator } from '@/hooks/useCostSheetCalculator';
import AnnexView from '@/components/cost-sheets/AnnexView';

const CostSheetCalculatorPage = () => {
  const [annexData, setAnnexData] = useState({});
  const { sections, updateRowValue } = useCostSheetCalculator({ template, annexData });

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{template.name}</h1>

      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold mb-4">Anexos</h2>
          <AnnexView onAnnexDataChange={setAnnexData} />
        </div>

        <div>
          <h2 className="text-xl font-bold mb-4">Ficha de Costo</h2>
          <div className="space-y-4">
            {sections.map(section => (
              <div key={section.id} className="p-4 border rounded">
                <h3 className="text-lg font-semibold">{section.label}</h3>
                <table className="w-full mt-2 text-sm">
                  <thead>
                    <tr>
                      <th className="text-left p-2 border-b">Concepto</th>
                      <th className="text-right p-2 border-b">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map(row => (
                      <tr key={row.id}>
                        <td className="p-1">{row.label}</td>
                        <td className="p-1 text-right">
                          <input
                            type="number"
                            value={row.value}
                            onChange={(e) => updateRowValue(row.id, parseFloat(e.target.value) || 0)}
                            className="w-full text-right bg-transparent border-b"
                            readOnly={row.readonly || row.formula}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CostSheetCalculatorPage;
