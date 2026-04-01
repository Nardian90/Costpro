'use client';

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { cn } from '@/lib/utils';
import { Wand2 } from 'lucide-react';

interface CostSheetAnnexToggleProps {
  annexId: string;
}

export function CostSheetAnnexToggle({ annexId }: CostSheetAnnexToggleProps) {
  const data = useCostSheetStore(state => state.data);
  const updateAnnexAdjustment = useCostSheetStore(state => state.updateAnnexAdjustment);

  const annex = data?.annexes?.find(a => a.id === annexId);
  if (!annex) return null;

  const isActive = annex.isAdjustmentActive !== false; // Default to true if undefined

  const handleToggle = (checked: boolean) => {
    updateAnnexAdjustment(annexId, annex.coefficient || 1, annex.adjustmentColumn || 'PRECIO UNITARIO', checked);
  };

  return (
    <div className="flex items-center gap-3 bg-muted/30 px-3 py-1.5 rounded-full border border-border/50">
      <div className={cn(
        "p-1 rounded-full",
        isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
      )}>
        <Wand2 className="w-3.5 h-3.5" />
      </div>
      <Label htmlFor={`toggle-${annexId}`} className="text-[10px] font-black uppercase tracking-widest cursor-pointer">
        Auto-ajuste
      </Label>
      <Switch
        id={`toggle-${annexId}`}
        checked={isActive}
        onCheckedChange={handleToggle}
        className="scale-75"
      />
    </div>
  );
}
