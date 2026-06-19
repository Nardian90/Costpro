'use client';

import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { ActiveMode } from './types';
import { MODE_LABELS } from './constants';

interface ModeTabsProps {
  activeMode: ActiveMode;
  onModeChange: (mode: ActiveMode) => void;
}

const ModeTabs: React.FC<ModeTabsProps> = ({ activeMode, onModeChange }) => {
  const modes: ActiveMode[] = ['prod', 'serv', 'com'];

  const handleModeChange = useCallback(
    (mode: ActiveMode) => {
      onModeChange(mode);
    },
    [onModeChange]
  );

  return (
    <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-xl border border-border/40">
      {modes.map((mode) => {
        const isActive = activeMode === mode;
        const info = MODE_LABELS[mode];
        return (
          <button type="button"
            key={mode}
            onClick={() => handleModeChange(mode)}
            className={cn(
              'flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all duration-200 whitespace-nowrap',
              isActive
                ? 'bg-primary/10 text-primary border border-primary/30 shadow-sm'
                : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 border border-transparent'
            )}
          >
            <span className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              isActive ? 'bg-primary' : 'bg-muted-foreground/30'
            )} />
            <span className="hidden sm:inline">{info.label}</span>
            <span className="sm:hidden">{info.label.slice(0, 4)}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ModeTabs;
