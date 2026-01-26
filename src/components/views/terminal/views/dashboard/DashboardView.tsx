
'use client'

import React from 'react';
import { useDashboardView } from './useDashboardView';
import DashboardViewComponent from '@/components/views/terminal/DashboardView';
import { useUIStore } from '@/store';

export default function DashboardView() {
  const { summary, kpis, isLoading } = useDashboardView();
  const { setCurrentView } = useUIStore();

  if (isLoading) {
    return <div>Loading...</div>; // Or a skeleton loader
  }

  // The onViewInventory prop now simply changes the view in the global store
  return <DashboardViewComponent onViewInventory={() => setCurrentView('inventory')} />;
}
