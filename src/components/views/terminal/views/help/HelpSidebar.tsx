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
  FileText,
  ChevronDown,
  Lightbulb,
  BookOpen,
  Zap,
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
    for (const sec of structure.sections) {
      const match = sec.files.find(f => `${sec.dir}/${f.filename}` === autoExpandForPath);
      if (match) {
        setOpenCategories(prev => ({ ...prev, [sec.id]: true }));
        return;
      }
    }
    const complianceMatch = structure.compliance.files.find(f => `help/compliance/${f.filename}` === autoExpandForPath);
    if (complianceMatch) {
      setOpenCategories(prev => ({ ...prev, compliance: true }));
    }
  }, [autoExpandForPath, structure]);

  // Auto-expand TOC when headings are available (doc loaded)
  useEffect(() => {
    if (toc.length > 0) {
      setOpenCategories(prev => ({ ...prev, toc: true }));
    }
  }, [toc.length]);

  if (!structure) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="px-5 pb-4">
          <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground/60">
            <div className="px-2.5 py-1 rounded-full bg-muted/40 border border-border/30 animate-pulse">
              <span className="invisible">0 documentos</span>
            </div>
          </div>
        </div>
        <div className="flex-1 px-3 pb-6 space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="px-3 py-3 rounded-xl bg-muted/20 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-muted/30" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-24 rounded bg-muted/30" />
                  <div className="h-2 w-32 rounded bg-muted/20" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-border/30">
          <div className="h-8 rounded-xl bg-muted/20 animate-pulse" />
        </div>
      </div>
    );
  }

  // Build the category list from sections + compliance
  const allCategories = [
    ...structure.sections.map(sec => ({
      id: sec.id,
      label: sec.label,
      icon: ICON_MAP[sec.icon] || FileText,
      files: sec.files.map(f => ({
        path: `${sec.dir}/${f.filename}`,
        name: f.title,
      })),
    })),
    ...(structure.compliance.files.length > 0 ? [{
      id: 'compliance',
      label: structure.compliance.label,
      icon: ICON_MAP[structure.compliance.icon] || Shield,
      files: structure.compliance.files.map(f => ({
        path: `help/compliance/${f.filename}`,
        name: f.title,
      })),
    }] : []),
  ];

  const visibleCategories = allCategories.filter(cat => cat.files.length > 0);

  const toggleCategory = (id: string) => {
    setOpenCategories((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const totalDocs = visibleCategories.reduce((sum, cat) => sum + cat.files.length, 0);
  const tocOpen = openCategories.toc ?? false;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Stats pill */}
      <div className="px-5 pb-3 shrink-0">
        <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground/60">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-border/30">
            <FileText className="w-3 h-3" />
            <span>{totalDocs} documentos</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-border/30">
            <BookOpen className="w-3 h-3" />
            <span>{visibleCategories.length} secciones</span>
          </div>
        </div>
      </div>

      {/* ── Categories + TOC — single scrollable zone ── */}
      <div className="px-3 pb-4 space-y-1.5 flex-1 overflow-y-auto min-h-0">
        <div className="space-y-1.5">
          {/* Document categories */}
          {visibleCategories.map((cat) => {
            const isOpen = openCategories[cat.id] ?? false;
            const activeInCategory = cat.files.some((f) => activePath === f.path);
            const styles = SECTION_STYLES[cat.id] || SECTION_STYLES.referencia;
            const IconComp = cat.icon;

            return (
              <div key={cat.id} className="group">
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className={cn(
                    'w-full text-left px-3 py-3 rounded-xl transition-all duration-200 flex items-center gap-3',
                    'hover:bg-accent/50',
                    isOpen && 'bg-accent/30',
                    activeInCategory && 'bg-primary/5 ring-1 ring-primary/15',
                  )}
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 border shrink-0',
                      'bg-gradient-to-br',
                      styles.gradient,
                      isOpen ? 'shadow-sm' : 'opacity-70 group-hover:opacity-100',
                    )}
                  >
                    <IconComp className="w-4 h-4 text-foreground/80" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold tracking-tight truncate">{cat.label}</span>
                      <span className="text-[9px] font-bold text-muted-foreground/50 bg-muted/50 px-1.5 py-0.5 rounded-md shrink-0">
                        {cat.files.length}
                      </span>
                    </div>
                    {!isOpen && (
                      <p className="text-[10px] font-medium text-muted-foreground/50 truncate mt-0.5">
                        {cat.files.slice(0, 2).map(f => f.name).join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className={cn('transition-transform duration-300 shrink-0', isOpen ? 'rotate-180' : '')}>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                  </div>
                </button>

                {isOpen && (
                  <div className="ml-4 mr-1 mt-1 mb-2 space-y-0.5 animate-in slide-in-from-top-2 duration-200">
                    {cat.files.map((file) => {
                      const isActive = activePath === file.path;
                      return (
                        <button
                          key={file.path}
                          onClick={() => onSelect(file.path)}
                          className={cn(
                            'w-full text-left px-3 py-2.5 rounded-lg text-[11px] font-medium transition-all duration-200 flex items-center gap-2.5',
                            'hover:bg-accent/40',
                            isActive
                              ? 'bg-primary/8 text-primary font-bold pl-4 border-l-2 border-primary'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <FileText
                            className={cn(
                              'w-3.5 h-3.5 shrink-0 transition-colors',
                              isActive ? 'text-primary' : 'text-muted-foreground/30',
                            )}
                          />
                          <span className="truncate">{file.name}</span>
                          {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── TOC Section — collapsible, after all modules ── */}
          {toc.length > 0 && (
            <div className="group">
              <button
                onClick={() => toggleCategory('toc')}
                className={cn(
                  'w-full text-left px-3 py-3 rounded-xl transition-all duration-200 flex items-center gap-3',
                  'hover:bg-accent/50',
                  tocOpen && 'bg-accent/30 ring-1 ring-primary/10',
                )}
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 border shrink-0',
                    'bg-gradient-to-br',
                    SECTION_STYLES.toc.gradient,
                    tocOpen ? 'shadow-sm' : 'opacity-70 group-hover:opacity-100',
                  )}
                >
                  <Lightbulb className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold tracking-tight truncate text-primary">Contenido</span>
                    <span className="text-[9px] font-bold text-muted-foreground/50 bg-muted/50 px-1.5 py-0.5 rounded-md shrink-0">
                      {toc.length}
                    </span>
                  </div>
                  {!tocOpen && (
                    <p className="text-[10px] font-medium text-muted-foreground/50 truncate mt-0.5">
                      Secciones del documento actual
                    </p>
                  )}
                </div>
                <div className={cn('transition-transform duration-300 shrink-0', tocOpen ? 'rotate-180' : '')}>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                </div>
              </button>

              {tocOpen && (
                <div className="ml-4 mr-1 mt-1 mb-2 space-y-0.5 animate-in slide-in-from-top-2 duration-200">
                  {toc.map((item, idx) => {
                    const isActive = activeHeadingId === item.id;
                    return (
                      <a
                        key={`${item.id}-${idx}`}
                        href={`#${item.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          const el = document.getElementById(item.id);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        className={cn(
                          'block text-[11px] font-medium transition-all duration-200 rounded-lg px-3 py-2.5 hover:bg-accent/40 hover:text-foreground',
                          item.level === 2
                            ? 'text-foreground font-bold'
                            : 'text-muted-foreground/70 pl-7',
                          isActive
                            ? 'bg-primary/8 text-primary font-bold pl-4 border-l-2 border-primary'
                            : '',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          {item.level === 2 && !isActive && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                          )}
                          {isActive && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                          )}
                          {item.text}
                        </span>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom zone: Accessibility + Branding (always visible) ── */}
      <div className="shrink-0 bg-card/95 backdrop-blur-sm border-t border-border/40">
        {/* Accessibility link */}
        <div className="px-3 py-2">
          <button
            onClick={onSelectAccessibility}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-medium transition-all duration-200 flex items-center gap-2.5',
              'hover:bg-accent/40',
              isAccessibilityActive
                ? 'bg-primary/8 text-primary font-bold pl-4 border-l-2 border-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-current={isAccessibilityActive ? 'page' : undefined}
          >
            <Shield
              className={cn(
                'w-3.5 h-3.5 shrink-0 transition-colors',
                isAccessibilityActive ? 'text-primary' : 'text-muted-foreground/30',
              )}
            />
            <span>Accesibilidad</span>
            {isAccessibilityActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
          </button>
        </div>

        {/* Bottom branding */}
        <div className="px-5 py-3 border-t border-border/20 bg-gradient-to-t from-muted/20 to-transparent">
          <div className="flex items-center gap-2 text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">
            <Zap className="w-3 h-3" />
            <span>CostPro Help Engine</span>
          </div>
        </div>
      </div>
    </div>
  );
}
