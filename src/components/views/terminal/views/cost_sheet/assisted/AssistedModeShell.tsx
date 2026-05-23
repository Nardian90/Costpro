"use client";

import React from 'react';
import { AssistedModeSidebar } from './AssistedModeSidebar';
import { InteractiveCostMap } from './InteractiveCostMap';
import { ContextualPanelManager } from './ContextualPanelManager';

interface AssistedModeShellProps {
  calculatedValues: any;
  calculatedHeader: any;
}

export const AssistedModeShell: React.FC<AssistedModeShellProps> = ({ calculatedValues, calculatedHeader }) => {
  return (
    <div className="flex h-[calc(100vh-12rem)] w-full overflow-hidden rounded-3xl border border-border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-500">
      <AssistedModeSidebar calculatedValues={calculatedValues} />
      <div className="flex-1 relative bg-muted/20">
        <InteractiveCostMap />
        <ContextualPanelManager calculatedValues={calculatedValues} calculatedHeader={calculatedHeader} />
      </div>
    </div>
  );
};
