'use client';

import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  LifeBuoy,
  Columns,
  Sparkles,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface HelpLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  isReadingMode?: boolean;
  scrollProgress: number;
  onMainScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export default function HelpLayout({ sidebar, children, isReadingMode, scrollProgress, onMainScroll }: HelpLayoutProps) {
  return (
    <div className="flex flex-col bg-background text-foreground min-h-[calc(100vh-56px)] w-full">
      {/* ── Enterprise Header ── */}
      <header className="relative overflow-hidden border-b border-border/50 shrink-0">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-primary/3 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-center justify-between px-6 md:px-10 lg:px-14 py-5">
          <div className="flex items-center gap-4">
            <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
              <LifeBuoy className="w-5 h-5 text-primary-foreground" />
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-background" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-base font-black tracking-tight text-foreground">Centro de Ayuda</h1>
                <Badge variant="outline" className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 bg-primary/5 text-primary border-primary/20 hidden sm:inline-flex">
                  Enterprise
                </Badge>
              </div>
              <p className="text-[11px] font-medium text-muted-foreground tracking-wide mt-0.5">
                Documentación funcional y técnica de CostPro v5.8
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Scroll progress % indicator */}
            {scrollProgress > 0 && (
              <Badge variant="outline" className="text-[10px] font-black tabular-nums px-2 py-0.5 bg-primary/5 border-primary/20 text-primary">
                {Math.round(scrollProgress)}% leído
              </Badge>
            )}
            <Badge variant="outline" className="text-[9px] font-bold tracking-wider px-2.5 py-1 bg-muted/50 border-border/50 hidden md:inline-flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-warning" />
              ISO/IEC 26514
            </Badge>
          </div>
        </div>
      </header>

      {/* ── Desktop: Two-column layout ── */}
      <div className="hidden lg:flex flex-1 overflow-hidden relative">
        {/* Document Sidebar */}
        <aside className={cn(
          "w-[300px] xl:w-[320px] min-w-0 border-r border-border/30 bg-card/30 backdrop-blur-sm flex flex-col transition-all duration-500 shrink-0",
          isReadingMode ? "-ml-[320px] opacity-0 w-0 min-w-0 overflow-hidden border-r-0" : "opacity-100"
        )}>
          {/* Sidebar inner header */}
          <div className="px-5 pt-6 pb-3 shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Biblioteca</span>
            </div>
            <p className="text-[11px] font-medium text-muted-foreground">Navega por los módulos y secciones del sistema</p>
          </div>
          <div className="border-t border-border/30 mx-5 mb-2 shrink-0" />
          {sidebar}
        </aside>

        {/* Main Content Area */}
        <main data-help-scroll className="flex-1 min-w-0 overflow-y-auto scroll-smooth" onScroll={onMainScroll}>
          {/* Reading progress bar — sticky inside scroll container */}
          <div className="sticky top-0 z-20">
            <div className="h-[3px] bg-border/10 relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary/80 via-primary to-primary/60 transition-[width] duration-150 ease-out"
                style={{ width: `${scrollProgress}%`, opacity: scrollProgress > 0 ? 1 : 0 }}
              />
            </div>
          </div>
          <div className={cn(
            "mx-auto px-8 md:px-14 xl:px-20 py-10 md:py-14 animate-in fade-in duration-500 transition-all",
            isReadingMode ? "max-w-5xl py-14" : "max-w-5xl xl:max-w-6xl"
          )}>
            <div className={cn(
              "bg-card/60 backdrop-blur-md shadow-sm border border-border/40 rounded-2xl min-h-[65vh] relative transition-all",
              isReadingMode && "shadow-xl shadow-primary/5 border-primary/15 bg-card/80"
            )}>
              {children}
            </div>
          </div>

          {!isReadingMode && (
            <footer className="max-w-4xl xl:max-w-5xl mx-auto px-10 py-8 border-t border-border/30 mt-6">
              <div className="flex flex-col md:flex-row justify-between items-center gap-3">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-success/60" />
                  <span>Sistema operativo</span>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                  <span>© 2024–2026 CostPro</span>
                  <span className="text-border">·</span>
                  <span>ISO/IEC 26514</span>
                  <span className="text-border">·</span>
                  <span>Diátaxis Framework</span>
                </div>
              </div>
            </footer>
          )}
        </main>
      </div>

      {/* ── Mobile: Single column with Sheet for sidebar ── */}
      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              aria-label="Abrir índice de documentos"
              className="fixed bottom-6 right-6 z-[60] w-14 h-14 rounded-2xl shadow-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground hover:scale-105 active:scale-95 transition-all border-0"
            >
              <Columns className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 p-0 border-r border-border/30 bg-card/95 backdrop-blur-md">
            <SheetHeader className="p-5 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <SheetTitle className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Índice del Manual</SheetTitle>
                  <p className="text-[10px] font-medium text-muted-foreground mt-0.5">Secciones y módulos</p>
                </div>
              </div>
            </SheetHeader>
            <div className="h-full overflow-y-auto pb-20">
              {sidebar}
            </div>
          </SheetContent>
        </Sheet>

        <main data-help-scroll className="overflow-y-auto scroll-smooth pb-24" onScroll={onMainScroll}>
          {/* Reading progress bar — sticky inside scroll container */}
          <div className="sticky top-0 z-20">
            <div className="h-[3px] bg-border/10 relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary/80 via-primary to-primary/60 transition-[width] duration-150 ease-out"
                style={{ width: `${scrollProgress}%`, opacity: scrollProgress > 0 ? 1 : 0 }}
              />
            </div>
          </div>
          <div className="mx-auto px-4 md:px-6 py-6 animate-in fade-in duration-500">
            <div className="bg-card/60 backdrop-blur-sm shadow-sm border border-border/40 rounded-2xl min-h-[50vh] p-4 md:p-6 relative">
              {children}
            </div>
          </div>

          {!isReadingMode && (
            <footer className="max-w-3xl mx-auto px-6 py-8 border-t border-border/30 mt-6 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                <div className="w-1.5 h-1.5 rounded-full bg-success/60" />
                <span>Sistema operativo</span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">© 2024–2026 CostPro · ISO/IEC 26514</span>
            </footer>
          )}
        </main>
      </div>
    </div>
  );
}
