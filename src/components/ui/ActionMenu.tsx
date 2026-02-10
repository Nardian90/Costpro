
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface Action {
  id: string;
  label: string;
  tooltip?: React.ReactNode;
  icon?: React.ElementType;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'success' | 'danger' | 'warning' | 'outline';
  disabled?: boolean;
  active?: boolean;
  className?: string;
  component?: React.ReactNode;
}

interface ActionMenuProps {
  actions: Action[];
  className?: string;
  sticky?: boolean;
  position?: 'top' | 'bottom';
}

const ActionMenu: React.FC<ActionMenuProps> = ({
  actions,
  className,
  sticky = true,
  position = 'top',
}) => {
  const getVariantClass = (variant?: string, active?: boolean) => {
    if (active) return 'neu-inset-sm font-bold text-primary !scale-100 shadow-none';
    switch (variant) {
      case 'primary': return 'neu-btn-primary';
      case 'success': return 'neu-btn-success';
      case 'danger': return 'neu-btn-danger';
      case 'warning': return 'bg-warning text-white shadow-lg';
      case 'outline': return 'neu-raised-sm border-primary/20 text-foreground';
      default: return 'neu-btn text-foreground';
    }
  };

  return (
    <div
      className={cn(
        'w-full z-20 transition-all duration-300',
        sticky && (position === 'top'
          ? 'sticky top-[60px] sm:top-20'
          : 'fixed bottom-0 sm:sticky sm:bottom-4 left-0 right-0 p-4 sm:p-0'
        ),
        className
      )}
    >
      <div className="neu-card !p-2 sm:!p-3 !rounded-2xl sm:!rounded-3xl shadow-2xl border-white/10 bg-background/95 backdrop-blur-md relative overflow-hidden">
        <div className="w-full overflow-x-auto flex flex-row flex-nowrap items-center gap-3 p-1 pr-12 sm:pr-1 pb-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-400/50 hover:[&::-webkit-scrollbar-thumb]:bg-gray-500/80 [&::-webkit-scrollbar-thumb]:rounded-full">
          <TooltipProvider>
            {actions.map((action) => (
              <React.Fragment key={action.id}>
                {action.component ? (
                    action.component
                ) : (
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={action.onClick}
                        disabled={action.disabled}
                        className={cn(
                          'flex items-center gap-2 px-4 py-3 min-h-[44px] text-sm sm:text-base rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 whitespace-nowrap',
                          getVariantClass(action.variant, action.active),
                          !action.active && !action.variant && 'hover:neu-raised-sm',
                          action.className
                        )}
                        aria-label={action.label}
                      >
                        {action.icon && <action.icon className="w-4 h-4 sm:w-5 sm:h-5" />}
                        <span className="font-semibold">{action.label}</span>
                      </button>
                    </TooltipTrigger>
                    {action.tooltip && (
                      <TooltipContent className="max-w-xs p-4 space-y-2 bg-popover text-popover-foreground border shadow-xl">
                        {action.tooltip}
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
              </React.Fragment>
            ))}
          </TooltipProvider>
        </div>

        {/* Scroll Indicator (Fade effect) */}
        <div className="sm:hidden absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent pointer-events-none rounded-r-2xl z-10" />
      </div>
    </div>
  );
};

export default ActionMenu;
