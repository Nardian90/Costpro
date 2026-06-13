'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Rocket,
  Calculator,
  Package,
  Settings,
  Terminal,
  Shield,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import type { SectionEntry } from './hooks/useHelpContent';

// ── Icon registry matching the API's icon field ──
const ICON_MAP: Record<string, LucideIcon> = {
  Rocket,
  Calculator,
  Package,
  Settings,
  Terminal,
  Shield,
};

const SECTION_STYLES: Record<string, { color: string; gradient: string }> = {
  empezar:       { color: 'text-blue-600 dark:text-blue-400',   gradient: 'from-blue-500/10 to-blue-600/5 border-blue-500/20' },
  gestion:       { color: 'text-emerald-600 dark:text-emerald-400', gradient: 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20' },
  inventario:    { color: 'text-amber-600 dark:text-amber-400',  gradient: 'from-amber-500/10 to-amber-600/5 border-amber-500/20' },
  configuracion:{ color: 'text-violet-600 dark:text-violet-400', gradient: 'from-violet-500/10 to-violet-600/5 border-violet-500/20' },
  referencia:    { color: 'text-rose-600 dark:text-rose-400',     gradient: 'from-rose-500/10 to-rose-600/5 border-rose-500/20' },
  compliance:    { color: 'text-sky-600 dark:text-sky-400',       gradient: 'from-sky-500/10 to-sky-600/5 border-sky-500/20' },
  toc:           { color: 'text-primary dark:text-primary',       gradient: 'from-primary/10 to-primary/5 border-primary/20' },
};

interface HelpSidebarProps {
  structure: {
    sections: SectionEntry[];
    compliance: {
      id: string;
      label: string;
      icon: string;
      files: { filename: string; title: string }[];
    };
    user_help: boolean;
  } | null;
  toc: { id: string; level: number; text: string }[];
  onSelect: (path: string) => void;
  activePath: string | undefined;
  isAccessibilityActive: boolean;
  onSelectAccessibility: () => void;
  autoExpandForPath: string | null;
  activeHeadingId?: string;
}

export default function HelpSidebar({ structure, toc, onSelect, activePath, isAccessibilityActive, onSelectAccessibility, autoExpandForPath, activeHeadingId }: HelpSidebarProps) {
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    empezar: true,
    gestion: false,
    inventario: false,
    configuracion: false,
    referencia: false,
    compliance: false,
    toc: false,
  });

  // Auto-expand the category containing the active document
  useEffect(() => {
    if (!autoExpandForPath || !structure) return;
    let targetId: string | null = null;

    for (const sec of structure.sections) {
      if (sec.files.some(f => `${sec.dir}/${f.filename}` === autoExpandForPath)) {
        targetId = sec.id;
        break;
      }
    }

    if (!targetId && structure.compliance.files.some(f => `help/compliance/${f.filename}` === autoExpandForPath)) {
      targetId = 'compliance';
    }

    if (targetId) {
      /* eslint-disable react-hooks/set-state-in-effect */ setOpenCategories(prev => prev[targetId!] ? prev : ({ ...prev, [targetId!]: true })); /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [autoExpandForPath, structure]);

  // Auto-expand TOC when headings are available (doc loaded)
  useEffect(() => {
    if (toc.length > 0) {
      /* eslint-disable react-hooks/set-state-in-effect */ setOpenCategories(prev => prev.toc ? prev : ({ ...prev, toc: true })); /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [toc.length]);

  if (!structure) return null;

  const toggleCategory = (id: string) => {
    setOpenCategories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-col gap-1 pr-2">
      {structure.sections.map((sec) => (
        <div key={sec.id} className="mb-1">
          <button
            onClick={() => toggleCategory(sec.id)}
            className={cn(
              "w-full flex items-center justify-between p-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              openCategories[sec.id] ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            <div className="flex items-center gap-2">
              {ICON_MAP[sec.icon] && React.createElement(ICON_MAP[sec.icon], { className: "w-4 h-4" })}
              {sec.label}
            </div>
            <ChevronDown className={cn("w-3 h-3 transition-transform", openCategories[sec.id] && "rotate-180")} />
          </button>

          {openCategories[sec.id] && (
            <div className="mt-1 ml-4 border-l border-border/50 pl-2 space-y-1">
              {sec.files.map((file) => {
                const path = `${sec.dir}/${file.filename}`;
                const isActive = activePath === path;
                return (
                  <button
                    key={file.filename}
                    onClick={() => onSelect(path)}
                    className={cn(
                      "w-full text-left p-1.5 rounded-lg text-[11px] font-bold transition-all",
                      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    )}
                  >
                    {file.title}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
