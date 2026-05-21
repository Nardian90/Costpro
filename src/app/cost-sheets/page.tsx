
'use client';

import dynamic from 'next/dynamic';
import React from 'react';

import { ViewLoadingSplash } from '@/components/ui/ViewLoadingSplash';

const CostSheetView = dynamic(
  () => import('@/components/views/terminal/views/cost_sheet/CostSheetView'),
  {
    ssr: false,
    loading: () => <ViewLoadingSplash label="Tablero Principal" showTips />,
  }
);

const NewCostSheetPage = () => {
  return <CostSheetView />;
};

export default NewCostSheetPage;
