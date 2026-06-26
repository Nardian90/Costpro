'use client';

import React from 'react';
import { HelpCircle, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'framer-motion';

import { useTranslations } from 'next-intl';
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
  const t = useTranslations('costSheet');
  const prefersReducedMotion = useReducedMotion();
  const panelId = `panel-${id}`;
  const headerId = `header-${id}`;

  return (
    <div id={`accordion-${id}`} className={cn(
      "border border-border/50 rounded-[2rem] overflow-hidden bg-card shadow-sm transition-all duration-300",
      isExpanded ? "ring-1 ring-primary/20 shadow-md" : "hover:border-primary/30",
      className
    )}>
      <div
        className={cn(
          "w-full flex items-center justify-between px-6 py-4 select-none transition-colors",
          isExpanded ? "bg-primary/5" : "hover:bg-muted/50"
        )}
      >
        <button
          id={headerId}
          type="button"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          className="flex items-center gap-4 flex-1 text-left outline-none focus-visible:underline"
          onClick={onToggle}
        >
          <div className={cn(
            "p-2 rounded-xl transition-colors",
            isExpanded ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            {icon || <ChevronRight className={cn("w-5 h-5 transition-transform duration-300", isExpanded && "rotate-90")} />}
          </div>
          <div className="flex flex-col items-start gap-1">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-foreground flex items-center gap-2">
              {title}
              {completionPercent === 100 && <CheckCircle2 className="w-4 h-4 text-success" />}
              {hasErrors && <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />}
            </h3>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <div className="text-xs font-black tracking-widest text-muted-foreground/70 mr-2">
            {completionPercent}%
          </div>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-primary/10 text-primary transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            onClick={(e) => {
              e.stopPropagation();
              onHelp(e);
            }}
            aria-label={`Ayuda sobre ${title}`}
          >
            <HelpCircle className="w-5 h-5" />
          </Button>
          {!icon && (
            <button
              type="button"
              tabIndex={0}
              aria-label={`Expandir o contraer ${title}`}
              className="p-1 rounded-lg hover:bg-primary/10 transition-colors"
              onClick={onToggle}
            >
              <ChevronRight className={cn("w-5 h-5 text-muted-foreground/70 transition-transform duration-300", isExpanded && "rotate-90")} />
            </button>
          )}
        </div>
      </div>

      {/* Completion Progress Bar */}
      <div className="h-1 w-full bg-muted/30 overflow-hidden">
        <motion.div
            initial={{ width: 0 }}
            animate={prefersReducedMotion ? {} : { width: `${completionPercent}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={cn(
                "h-full transition-colors duration-500",
                completionPercent < 30 ? "bg-destructive" : completionPercent < 70 ? "bg-warning" : "bg-success"
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
