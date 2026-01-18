// src/components/cost-sheets/CostSheetBody.tsx
import React from 'react';

// Define types for props based on the JSON structure
type Row = {
  id: string;
  label: string;
  // Other row properties will be used by the calculator hook
};

type Section = {
  id: string;
  label: string;
  rows: Row[];
};

type CostSheetBodyProps = {
  sections: Section[];
  calculatedValues: { [key: string]: number }; // Values computed by the hook
};

const CostSheetBody: React.FC<CostSheetBodyProps> = ({ sections, calculatedValues }) => {
  return (
    <div className="border rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 text-left font-semibold">Descripción</th>
            <th className="p-2 text-right font-semibold">Valor</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <React.Fragment key={section.id}>
              {section.rows.map((row) => (
                <tr key={row.id} className="border-t hover:bg-gray-50">
                  <td className={`p-2 ${row.id.includes('.') ? 'pl-8' : 'font-semibold'}`}>
                    {row.label}
                  </td>
                  <td className="p-2 text-right font-mono">
                    {/* Display calculated value, fallback to 0 */}
                    {calculatedValues[row.id]?.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }) ?? '0.00'}
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CostSheetBody;
