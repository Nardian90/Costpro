'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  FileText,
  Calculator,
  ShoppingCart,
  Users,
  BarChart3,
  Terminal,
  HelpCircle,
  BookMarked,
  Layers,
  Cpu,
  ChevronRight,
  ChevronDown,
  GraduationCap,
  Shield,
  Zap,
  Box,
  BarChart2,
  Lightbulb,
  Database,
  type LucideIcon,
} from 'lucide-react';

interface FileEntry {
  filename: string;
  title: string;
}

interface HelpStructure {
  iso_manual: FileEntry[];
  docs: {
    tutorials: FileEntry[];
    howTo: FileEntry[];
    reference: FileEntry[];
    explanation: FileEntry[];
  };
  user_help?: boolean;
}

interface HelpSidebarProps {
  structure: HelpStructure | null;
  toc: any[];
  onSelect: (path: string) => void;
  activePath: string | undefined;
}

/**
 * Normaliza una entrada de archivo que puede venir como string u objeto.
 */
function normalizeEntry(f: unknown, fallbackDir: string): { path: string; name: string } {
  if (typeof f === 'string') {
    return {
      path: `${fallbackDir}/${f}`,
      name: f.replace(/\.md$/, '').replace(/[-_]/g, ' ')
    };
  }
  if (f && typeof f === 'object' && 'filename' in f) {
    const entry = f as FileEntry;
    return {
      path: `${fallbackDir}/${String(entry.filename || '')}`,
      name: String(entry.title || entry.filename || 'Sin título')
    };
  }
  return { path: '', name: 'Entrada inválida' };
}

function mapEntries(entries: unknown[] | undefined, fallbackDir: string): { path: string; name: string }[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((f) => normalizeEntry(f, fallbackDir))
    .filter((e) => e.path.length > 0);
}

interface Category {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  color: string;
  files: { path: string; name: string }[];
}

export default function HelpSidebar({ structure, toc, onSelect, activePath }: HelpSidebarProps) {
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    manual: true,
    costos: false,
    ventas: false,
    ipv: false,
    referencia: false,
  });

  if (!structure) return null;

  // Map entries
  const isoFiles = mapEntries(structure.iso_manual as unknown[], 'iso_manual');
  const tutorialFiles = mapEntries(structure.docs?.tutorials as unknown[], 'docs/tutorials');
  const howToFiles = mapEntries(structure.docs?.howTo as unknown[], 'docs/how-to');
  const referenceFiles = mapEntries(structure.docs?.reference as unknown[], 'docs/reference');
  const explanationFiles = mapEntries(structure.docs?.explanation as unknown[], 'docs/explanation');

  const categories: Category[] = [
    {
      id: 'manual',
      label: 'Manual de Usuario',
      icon: BookOpen,
      description: 'Introducción, primeros pasos y roles del sistema',
      color: 'from-blue-500/10 to-blue-600/5 border-blue-500/20',
      files: isoFiles
    },
    {
      id: 'costos',
      label: 'Módulo de Costos',
      icon: Calculator,
      description: 'Fichas, fórmulas, anexos y motor de cálculo',
      color: 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20',
      files: [
        ...howToFiles.filter(f => f.name.toLowerCase().includes('ficha') || f.name.toLowerCase().includes('costo')),
        ...explanationFiles.filter(f => f.name.toLowerCase().includes('motor') || f.name.toLowerCase().includes('cálculo') || f.name.toLowerCase().includes('calculo') || f.name.toLowerCase().includes('costos'))
      ]
    },
    {
      id: 'ventas',
      label: 'Ventas e Inventario',
      icon: ShoppingCart,
      description: 'Terminal POS, inventario y logística',
      color: 'from-amber-500/10 to-amber-600/5 border-amber-500/20',
      files: [
        ...tutorialFiles.filter(f => f.name.toLowerCase().includes('punto') || f.name.toLowerCase().includes('venta') || f.name.toLowerCase().includes('pos')),
        ...tutorialFiles.filter(f => f.name.toLowerCase().includes('inventario') || f.name.toLowerCase().includes('stock')),
        ...howToFiles.filter(f => f.name.toLowerCase().includes('tienda') || f.name.toLowerCase().includes('usuario') || f.name.toLowerCase().includes('admin'))
      ]
    },
    {
      id: 'ipv',
      label: 'Módulo IPV',
      icon: BarChart3,
      description: 'Índices de precios y variaciones',
      color: 'from-violet-500/10 to-violet-600/5 border-violet-500/20',
      files: explanationFiles.filter(f => f.name.toLowerCase().includes('ipv') || f.name.toLowerCase().includes('precios') || f.name.toLowerCase().includes('var'))
    },
    {
      id: 'referencia',
      label: 'Referencia Técnica',
      icon: Terminal,
      description: 'API, configuración y glosario',
      color: 'from-rose-500/10 to-rose-600/5 border-rose-500/20',
      files: referenceFiles
    }
  ];

  const toggleCategory = (id: string) => {
    setOpenCategories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Count total docs
  const totalDocs = categories.reduce((sum, cat) => sum + cat.files.length, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Stats pill */}
      <div className="px-5 pb-4">
        <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground/60">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-border/30">
            <FileText className="w-3 h-3" />
            <span>{totalDocs} documentos</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-border/30">
            <Layers className="w-3 h-3" />
            <span>{categories.length} módulos</span>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        <div className="space-y-1.5">
          {categories.map((cat) => {
            const isOpen = openCategories[cat.id] ?? false;
            const activeInCategory = cat.files.some(f => activePath === f.path);

            return (
              <div key={cat.id} className="group">
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className={cn(
                    "w-full text-left px-3 py-3 rounded-xl transition-all duration-200 flex items-center gap-3",
                    "hover:bg-accent/50",
                    isOpen && "bg-accent/30",
                    activeInCategory && "bg-primary/5 ring-1 ring-primary/15"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 border shrink-0",
                    "bg-gradient-to-br",
                    cat.color,
                    isOpen ? "shadow-sm" : "opacity-70 group-hover:opacity-100"
                  )}>
                    <cat.icon className="w-4 h-4 text-foreground/80" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold tracking-tight truncate">{cat.label}</span>
                      <span className="text-[9px] font-bold text-muted-foreground/50 bg-muted/50 px-1.5 py-0.5 rounded-md shrink-0">
                        {cat.files.length}
                      </span>
                    </div>
                    {!isOpen && (
                      <p className="text-[10px] font-medium text-muted-foreground/50 truncate mt-0.5">{cat.description}</p>
                    )}
                  </div>
                  <div className={cn(
                    "transition-transform duration-200 shrink-0",
                    isOpen ? "rotate-180" : ""
                  )}>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                  </div>
                </button>

                {/* Expanded files */}
                {isOpen && (
                  <div className="ml-4 mr-1 mt-1 mb-2 space-y-0.5 animate-in slide-in-from-top-2 duration-200">
                    {cat.description && (
                      <p className="text-[10px] font-medium text-muted-foreground/50 italic px-3 py-1.5 mb-1">{cat.description}</p>
                    )}
                    {cat.files.length === 0 ? (
                      <div className="mx-1 my-2 px-4 py-3 rounded-xl bg-muted/20 border border-dashed border-border/30 text-center">
                        <p className="text-[10px] font-bold text-muted-foreground/40 uppercase italic">Sin documentos</p>
                      </div>
                    ) : (
                      cat.files.map((file) => {
                        const isActive = activePath === file.path;
                        return (
                          <button
                            key={file.path}
                            onClick={() => onSelect(file.path)}
                            className={cn(
                              "w-full text-left px-3 py-2.5 rounded-lg text-[11px] font-medium transition-all duration-200 flex items-center gap-2.5",
                              "hover:bg-accent/40",
                              isActive
                                ? "bg-primary/8 text-primary font-bold pl-4 border-l-2 border-primary"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <FileText className={cn(
                              "w-3.5 h-3.5 shrink-0 transition-colors",
                              isActive ? "text-primary" : "text-muted-foreground/30"
                            )} />
                            <span className="truncate">{file.name}</span>
                            {isActive && (
                              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Table of Contents */}
        {toc.length > 0 && (
          <div className="mt-8 pt-6 border-t border-border/30">
            <div className="px-3 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center">
                  <Lightbulb className="w-3 h-3 text-primary" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Contenido</span>
              </div>
              <p className="text-[10px] font-medium text-muted-foreground/50">Secciones del documento actual</p>
            </div>
            <div className="space-y-1 px-1">
              {toc.map((item, idx) => (
                <a
                  key={`${item.id}-${idx}`}
                  href={`#${item.id}`}
                  className={cn(
                    "block text-[11px] font-medium transition-all duration-200 rounded-md px-3 py-1.5 hover:bg-accent/40 hover:text-foreground",
                    item.level === 1
                      ? "text-foreground font-bold pl-3"
                      : "text-muted-foreground/70 pl-7"
                  )}
                >
                  <span className="flex items-center gap-2">
                    {item.level === 1 && <div className="w-1 h-1 rounded-full bg-primary/40 shrink-0" />}
                    {item.text}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom branding */}
      <div className="px-5 py-4 border-t border-border/30 bg-gradient-to-t from-muted/20 to-transparent">
        <div className="flex items-center gap-2 text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">
          <Zap className="w-3 h-3" />
          <span>CostPro Help Engine</span>
        </div>
      </div>
    </div>
  );
}
