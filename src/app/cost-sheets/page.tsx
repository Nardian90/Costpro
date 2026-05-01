'use client';


import dynamic from 'next/dynamic';
import React from 'react';

import { Skeleton } from '@/components/ui/skeleton';

const CostSheetView = dynamic(
  () => import('@/components/views/terminal/views/cost_sheet/CostSheetView'),
  {
    ssr: false,
    loading: () => (
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
    ),
  }
);

const NewCostSheetPage = () => {
  return <CostSheetView />;
};

export default NewCostSheetPage;
