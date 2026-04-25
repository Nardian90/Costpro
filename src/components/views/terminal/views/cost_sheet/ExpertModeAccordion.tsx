'use client';

import React from 'react';
import { HelpCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ExpertModeAccordionProps {
  id: string;
  title: string;
  children: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  onHelp: (e: React.MouseEvent) => void;
  icon?: React.ReactNode;
  className?: string;
}

export const ExpertModeAccordion: React.FC<ExpertModeAccordionProps> = ({
  id,
  title,
  children,
  isExpanded,
  onToggle,
  onHelp,
  icon,
  className
}) => {
  return (
    <div id={`accordion-${id}`} className={cn("border border-border/50 rounded-[2rem] overflow-hidden bg-card shadow-sm transition-all duration-300", isExpanded ? "ring-1 ring-primary/20 shadow-md" : "hover:border-primary/30", className)}>
      <div
        className={cn(
          "flex items-center justify-between px-6 py-4 cursor-pointer select-none transition-colors",
          isExpanded ? "bg-primary/5" : "hover:bg-muted/50"
        )}
        onClick={onToggle}
      >
        <div className="flex items-center gap-4">
          <div className={cn(
            "p-2 rounded-xl transition-colors",
            isExpanded ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            {icon || <ChevronRight className={cn("w-5 h-5 transition-transform duration-300", isExpanded && "rotate-90")} />}
          </div>
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-foreground">
            {title}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl hover:bg-primary/10 text-primary transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onHelp(e);
            }}
          >
            <HelpCircle className="w-5 h-5" />
          </Button>
          {!icon && <ChevronRight className={cn("w-5 h-5 text-muted-foreground/30 transition-transform duration-300", isExpanded && "rotate-90")} />}
        </div>
      </div>

      <div className={cn(
        "grid transition-all duration-500 ease-in-out",
        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}>
        <div className="overflow-hidden">
          <div className="p-6 pt-2 border-t border-border/50">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
