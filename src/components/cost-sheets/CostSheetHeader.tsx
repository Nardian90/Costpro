// src/components/cost-sheets/CostSheetHeader.tsx
import React from 'react';

// Define the type for the header prop based on the JSON structure
type CostSheetHeaderProps = {
  header: {
    code: string;
    name: string;
    date: string;
    unit: string;
    quantity: number;
    currency: string;
    category: string;
    type: string;
  };
};

const CostSheetHeader: React.FC<CostSheetHeaderProps> = ({ header }) => {
  return (
    <div className="p-4 bg-gray-50 rounded-lg mb-6">
      <h1 className="text-xl font-bold mb-4">{header.name}</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="font-semibold">Código:</span> {header.code}
        </div>
        <div>
          <span className="font-semibold">Fecha de Elaboración:</span> {header.date}
        </div>
        <div>
          <span className="font-semibold">Unidad de Medida:</span> {header.unit}
        </div>
        <div>
          <span className="font-semibold">Cantidad:</span> {header.quantity}
        </div>
        <div>
          <span className="font-semibold">Moneda:</span> {header.currency}
        </div>
        <div>
          <span className="font-semibold">Clasificación:</span> {header.category}
        </div>
        <div>
          <span className="font-semibold">Tipo:</span> {header.type}
        </div>
      </div>
    </div>
  );
};

export default CostSheetHeader;
