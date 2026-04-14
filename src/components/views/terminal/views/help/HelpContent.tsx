'use client';

import React from 'react';
import HelpSectionRenderer from './HelpSectionRenderer';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  FileText,
  Play,
  Terminal,
  HelpCircle,
  Search,
  X,
  BookOpen,
  GraduationCap,
  Wrench,
  Info,
  ArrowUp,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpContentProps {
  doc: any;
  loading: boolean;
  searchQuery: string;
  searchResults: any[];
  glossary?: Record<string, string>;
  onSelectResult: (path: string) => void;
  onClearSearch: () => void;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  iso: { icon: BookOpen, label: 'Manual de Usuario', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  tutorial: { icon: Play, label: 'Tutorial', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  'how-to': { icon: Wrench, label: 'Guía Práctica', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  reference: { icon: Terminal, label: 'Referencia Técnica', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
  explanation: { icon: Info, label: 'Concepto Técnico', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
};

function TypeIcon({ type, size = 'sm' }: { type: string; size?: 'sm' | 'md' }) {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.iso;
  const IconComp = config.icon;
  const iconSize = size === 'md' ? 'w-5 h-5' : 'w-3.5 h-3.5';

  return (
    <div className={cn(
      "rounded-lg flex items-center justify-center border",
      config.bg,
      size === 'md' ? "w-10 h-10" : "w-7 h-7"
    )}>
      <IconComp className={cn(iconSize, config.color)} />
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.iso;
  return (
    <Badge variant="outline" className={cn(
      "rounded-lg px-2.5 py-1 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 border",
      config.bg,
      config.color
    )}>
      <config.icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

export default function HelpContent({
  doc,
  loading,
  searchQuery,
  searchResults,
  glossary,
  onSelectResult,
  onClearSearch
}: HelpContentProps) {
  // ── Loading State ──
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl border-2 border-primary/20 border-t-primary animate-spin" />
          <div className="absolute inset-2 rounded-xl border-2 border-primary/10 border-b-primary/40 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        </div>
        <div className="text-center">
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground animate-pulse">Cargando documentación</h3>
          <p className="text-[10px] font-medium text-muted-foreground/40 mt-1.5">CostPro Engine v5.8</p>
        </div>
      </div>
    );
  }

  // ── Search Results ──
  if (searchQuery && searchQuery.length >= 3) {
    return (
      <div className="p-6 md:p-10 xl:p-14 space-y-8 animate-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Search className="w-4 h-4 text-primary" />
              </div>
              <h1 className="text-2xl font-black tracking-tight">Resultados de búsqueda</h1>
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Mostrando <span className="font-bold text-foreground">{searchResults.length}</span> resultado{searchResults.length !== 1 ? 's' : ''} para{' '}
              <span className="text-primary font-bold">&ldquo;{searchQuery}&rdquo;</span>
            </p>
          </div>
          <button
            onClick={onClearSearch}
            className="w-10 h-10 rounded-xl bg-secondary/50 border border-border/50 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-all shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {searchResults.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border/30 flex items-center justify-center mx-auto mb-5">
              <Search className="w-7 h-7 text-muted-foreground/30" />
            </div>
            <h3 className="text-lg font-black tracking-tight">Sin resultados</h3>
            <p className="text-sm text-muted-foreground/70 mt-2 max-w-md mx-auto leading-relaxed">
              No se encontraron coincidencias. Intenta con otros términos o navega por las categorías del manual.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {searchResults.map((result, idx) => {
              const config = TYPE_CONFIG[result.type] || TYPE_CONFIG.iso;
              return (
                <button
                  key={`${result.path}-${idx}`}
                  onClick={() => {
                    onSelectResult(result.path);
                    onClearSearch();
                  }}
                  className="group text-left p-5 rounded-xl bg-secondary/15 border border-border/40 hover:border-primary/25 hover:bg-secondary/25 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3 mb-2.5">
                    <TypeIcon type={result.type} />
                    <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest truncate">
                      {result.path}
                    </span>
                  </div>
                  <h3 className="text-base font-bold tracking-tight group-hover:text-primary transition-colors mb-1.5 flex items-center gap-2">
                    {result.title}
                    <ArrowRight className="w-3.5 h-3.5 text-primary/0 group-hover:text-primary transition-all -translate-x-1 group-hover:translate-x-0" />
                  </h3>
                  <p className="text-xs text-muted-foreground/70 line-clamp-2 leading-relaxed">
                    &ldquo;{result.excerpt}&rdquo;
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Empty / Welcome State ──
  if (!doc) {
    return (
      <div className="p-6 md:p-10 xl:p-14 flex flex-col items-center justify-center min-h-[55vh] text-center">
        {/* Hero illustration */}
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/15 flex items-center justify-center">
            <BookOpen className="w-12 h-12 text-primary/30" />
          </div>
          <div className="absolute -top-2 -right-2 w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
        </div>

        <h2 className="text-xl font-black tracking-tight mb-2">Centro de Documentación</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed mb-8">
          Selecciona una sección del menú lateral para explorar la documentación funcional y técnica de CostPro.
        </p>

        {/* Quick access cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-lg w-full">
          {[
            { icon: BookOpen, label: 'Manual', desc: 'Introducción y guía' },
            { icon: Calculator, label: 'Costos', desc: 'Fichas y fórmulas' },
            { icon: ShoppingCart, label: 'Ventas', desc: 'POS e inventario' },
            { icon: BarChart3, label: 'IPV', desc: 'Precios y variaciones' },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border/30 hover:bg-muted/50 transition-colors cursor-default">
              <item.icon className="w-4 h-4 text-muted-foreground/50" />
              <span className="text-[10px] font-bold">{item.label}</span>
              <span className="text-[9px] font-medium text-muted-foreground/40">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Document View ──
  return (
    <div className="p-6 md:p-10 xl:p-14 space-y-10 animate-in slide-in-from-bottom-4 duration-500">
      {/* Document Hero Header */}
      <div className="relative pb-10 border-b border-border/30">
        {/* Background gradient */}
        <div className="absolute inset-0 -top-6 -right-6 w-40 h-40 bg-primary/3 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col gap-5">
          {/* Metadata row */}
          <div className="flex items-center gap-3 flex-wrap">
            <TypeBadge type={doc.type} />
            <div className="h-3 w-px bg-border/50" />
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">
              <Clock className="w-3 h-3" />
              <span>Doc v5.8</span>
            </div>
            <div className="h-3 w-px bg-border/50 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">
              <GraduationCap className="w-3 h-3" />
              <span>ISO/IEC 26514</span>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl xl:text-5xl font-black tracking-tight leading-[1.1] text-foreground">
            {doc.title}
          </h1>

          {/* Description pill */}
          <p className="text-sm font-medium text-muted-foreground max-w-2xl leading-relaxed">
            {doc.type === 'iso' && 'Sección del manual oficial de usuario de CostPro. Documentación funcional certificada.'}
            {doc.type === 'tutorial' && 'Tutorial paso a paso para dominar las funcionalidades del sistema.'}
            {doc.type === 'how-to' && 'Guía práctica con instrucciones detalladas para operaciones específicas.'}
            {doc.type === 'reference' && 'Referencia técnica completa de la API y configuración del sistema.'}
            {doc.type === 'explanation' && 'Explicación en profundidad de los conceptos y arquitectura del sistema.'}
          </p>

          {/* Quick actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-muted/40 border border-border/30 hover:bg-muted/60 transition-colors"
            >
              <ArrowUp className="w-3 h-3" />
              Inicio
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <HelpSectionRenderer content={doc.content} glossary={glossary} />

      {/* Bottom navigation */}
      <div className="pt-8 flex items-center justify-between border-t border-dashed border-border/30">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
          <div className="w-1 h-1 rounded-full bg-muted-foreground/20" />
          CostPro · Documentation System · ISO/IEC 26514
        </div>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary/70 hover:text-primary transition-colors"
        >
          Volver arriba
          <ArrowUp className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
