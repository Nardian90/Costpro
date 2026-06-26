'use client';
// src/components/cost-sheets/CostSheetSignature.tsx
import React from 'react';

import { useTranslations } from 'next-intl';
type CostSheetSignatureProps = {
  prepared_by: string;
  approved_by: string;
};

const CostSheetSignature: React.FC<CostSheetSignatureProps> = ({ prepared_by, approved_by }) => {
  const t = useTranslations('costSheet');
  return (
    <div className="mt-12 pt-8 border-t">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="text-center">
          <p className="mb-8">Elaborado por:</p>
          <div className="border-t border-gray-400 w-3/4 mx-auto"></div>
          <p className="mt-2 text-sm font-semibold">{prepared_by || '_____________________'}</p>
        </div>
        <div className="text-center">
          <p className="mb-8">Aprobado por:</p>
          <div className="border-t border-gray-400 w-3/4 mx-auto"></div>
          <p className="mt-2 text-sm font-semibold">{approved_by || '_____________________'}</p>
        </div>
      </div>
    </div>
  );
};

export default CostSheetSignature;
