'use client';

import React from 'react';
import { HelpCircle, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ExpertModeAccordionProps {
  id: string;
  title: string;
  children: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  onHelp: (e: React.MouseEvent) => void;
  icon?: React.ReactNode;
  className?: string;
  completionPercent?: number;
  hasErrors?: boolean;
}

export const ExpertModeAccordion: React.FC<ExpertModeAccordionProps> = ({
  id,
  title,
  children,
  isExpanded,
  onToggle,
  onHelp,
  icon,
  className,
  completionPercent = 0,
  hasErrors = false
}) => {
  const panelId = `panel-${id}`;
  const headerId = `header-${id}`;

  return (
    <div id={`accordion-${id}`} className={cn(
      "border border-border/50 rounded-[2rem] overflow-hidden bg-card shadow-sm transition-all duration-300",
      isExpanded ? "ring-1 ring-primary/20 shadow-md" : "hover:border-primary/30",
      className
    )}>
      <button
        id={headerId}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        className={cn(
          "w-full flex items-center justify-between px-6 py-4 cursor-pointer select-none transition-colors outline-none focus-visible:bg-primary/5",
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
          <div className="flex flex-col items-start gap-1">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-foreground flex items-center gap-2">
              {title}
              {completionPercent === 100 && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              {hasErrors && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-black tracking-widest text-muted-foreground/60 mr-2">
            {completionPercent}%
          </div>
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="h-9 w-9 rounded-xl hover:bg-primary/10 text-primary transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onHelp(e);
            }}
          >
            <div role="button" tabIndex={0} aria-label="Ayuda">
                <HelpCircle className="w-5 h-5" />
            </div>
          </Button>
          {!icon && <ChevronRight className={cn("w-5 h-5 text-muted-foreground/30 transition-transform duration-300", isExpanded && "rotate-90")} />}
        </div>
      </button>

      {/* Completion Progress Bar */}
      <div className="h-1 w-full bg-muted/30 overflow-hidden">
        <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${completionPercent}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={cn(
                "h-full transition-colors duration-500",
                completionPercent < 30 ? "bg-red-500" : completionPercent < 70 ? "bg-amber-500" : "bg-green-500"
            )}
        />
      </div>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        className={cn(
            "grid transition-all duration-500 ease-in-out",
            isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="p-2 sm:p-6 pt-2 border-t border-border/50">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
