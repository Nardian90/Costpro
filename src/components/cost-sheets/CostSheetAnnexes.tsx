// src/components/cost-sheets/CostSheetAnnexes.tsx
import React from 'react';

// Define types for props based on the JSON structure
type Column = {
  key: string;
  label: string;
  formula?: string;
};

type Annex = {
  id: string;
  title: string;
  columns: Column[];
  data: any[];
};

type CostSheetAnnexesProps = {
  annexes: Annex[];
};

// A helper to calculate formula-based columns
const calculateRowValue = (row: any, formula: string): number => {
    // This is a simple implementation for now. The final logic will be in the hook.
    // Example formula: "consumption_norm * price"
    const [operand1, operator, operand2] = formula.split(' ');
    if (operator === '*') {
        return (row[operand1] || 0) * (row[operand2] || 0);
    }
     if (operator === '/') {
        return (row[operand1] || 0) / (row[operand2] || 1); // Avoid division by zero
    }
    // Add more operators as needed
    return 0;
}


const CostSheetAnnexes: React.FC<CostSheetAnnexesProps> = ({ annexes }) => {
  return (
    <div className="mt-8 space-y-8">
      {annexes.map((annex) => (
        <div key={annex.id} className="page-break-before">
          <h2 className="text-lg font-bold mb-4 text-center">{annex.id} - {annex.title}</h2>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 text-white">
                <tr>
                  {annex.columns.map((col) => (
                    <th key={col.key} className="p-2 text-left font-semibold">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {annex.data.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t hover:bg-gray-50">
                    {annex.columns.map((col) => (
                      <td key={`${rowIndex}-${col.key}`} className="p-2 font-mono">
                        {col.formula
                          ? calculateRowValue(row, col.formula).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Total Row */}
                <tr className="border-t bg-gray-100 font-bold">
                    <td colSpan={annex.columns.length - 1} className="p-2 text-right">TOTAL</td>
                    <td className="p-2 font-mono">
                        {annex.data.reduce((acc, row) => {
                            const totalColumn = annex.columns.find(c => c.formula);
                            if (totalColumn) {
                                return acc + calculateRowValue(row, totalColumn.formula);
                            }
                            // If no formula, sum the last column if it's numeric
                            const lastColKey = annex.columns[annex.columns.length - 1].key;
                            return acc + (typeof row[lastColKey] === 'number' ? row[lastColKey] : 0);
                        }, 0).toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CostSheetAnnexes;
