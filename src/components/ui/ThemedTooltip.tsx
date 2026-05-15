'use client';

import React from 'react';
import { TooltipProps } from 'recharts';

export const ThemedTooltip = ({ active, payload, label, formatter }: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl p-4 min-w-[150px] animate-in fade-in zoom-in duration-200">
        {label && (
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 pb-2 border-b border-border/50">
            {label}
          </div>
        )}
        <div className="space-y-1.5">
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
                <span className="text-[11px] font-bold text-foreground">{entry.name}</span>
              </div>
              <span className="text-[11px] font-black font-mono text-primary">
                {formatter ? formatter(entry.value as number, entry.name as string, entry, index, payload) : entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};
