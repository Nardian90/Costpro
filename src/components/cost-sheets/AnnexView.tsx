
'use client';

import React, { useState } from 'react';
import { produce } from 'immer';

const annexDefinitions = {
  Anexo1: { title: 'Anexo 1: Materias Primas y Consumibles', columns: ['Clasificación', 'Código', 'Descripción', 'Referencia', 'UM', 'Norma de Consumo', 'Precio', 'Total'] },
  Anexo2: { title: 'Anexo 2: Mano de Obra', columns: ['Descripción', 'Norma de Tiempo', 'Tarifa Horaria', 'Cant. Obreros', 'Total'] },
  Anexo3: { title: 'Anexo 3: Depreciación de Activos', columns: ['Clasificación', 'Código', 'Descripción', 'Valor Compra', 'Depreciado', '%', 'Tiempo Explotación', 'Depreciación'] },
  Anexo4: { title: 'Anexo 4: Otros Gastos', columns: ['Clasificación', 'Código', 'Descripción', 'Importe'] },
  Anexo5: { title: 'Anexo 5: Dietas y Gastos de Representación', columns: ['Código Trabajador', 'Nombre', 'Gasto Diario', 'Días', 'Total'] },
};

type AnnexData = {
  [key: string]: any[];
};

interface AnnexViewProps {
  onAnnexDataChange: (data: AnnexData) => void;
}

const AnnexView: React.FC<AnnexViewProps> = ({ onAnnexDataChange }) => {
  const [annexData, setAnnexData] = useState<AnnexData>({
    Anexo1: [], Anexo2: [], Anexo3: [], Anexo4: [], Anexo5: [],
  });

  const handleAddRow = (annexId: string) => {
    const newRow = Object.fromEntries(annexDefinitions[annexId].columns.map(col => [col, '']));
    const newData = {
      ...annexData,
      [annexId]: [...annexData[annexId], newRow],
    };
    setAnnexData(newData);
    onAnnexDataChange(newData);
  };

  return (
    <div className="space-y-4">
      {Object.entries(annexDefinitions).map(([id, { title, columns }]) => (
        <div key={id} className="p-4 border rounded">
          <h3 className="text-lg font-semibold">{title}</h3>
          <table className="w-full mt-2 text-sm">
            <thead>
              <tr>
                {columns.map(col => <th key={col} className="text-left p-2 border-b">{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {annexData[id].map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map(col => (
                    <td key={col} className="p-1">
                      <input
                        type="text"
                        value={row[col] || ''}
                        onChange={(e) => {
                          const newAnnexData = produce(annexData, draft => {
                            draft[id][rowIndex][col] = e.target.value;
                            // Recalculate Total for the row
                            const currentRow = draft[id][rowIndex];
                            if (id === 'Anexo1') {
                              currentRow.Total = (parseFloat(currentRow['Norma de Consumo']) || 0) * (parseFloat(currentRow.Precio) || 0);
                            } else if (id === 'Anexo2') {
                                currentRow.Total = (parseFloat(currentRow['Norma de Tiempo']) || 0) * (parseFloat(currentRow['Tarifa Horaria']) || 0) * (parseFloat(currentRow['Cant. Obreros']) || 0);
                            } else if (id === 'Anexo5') {
                                currentRow.Total = (parseFloat(currentRow['Gasto Diario']) || 0) * (parseFloat(currentRow['Días']) || 0);
                            }
                          });
                          setAnnexData(newAnnexData);
                          onAnnexDataChange(newAnnexData);
                        }}
                        className="w-full bg-transparent border-b"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => handleAddRow(id)} className="mt-2 text-sm p-2 border rounded">
            Agregar Fila
          </button>
        </div>
      ))}
    </div>
  );
};

export default AnnexView;
