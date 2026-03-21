'use client';

import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Columns } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface HelpLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  header: ReactNode;
  isReadingMode?: boolean;
}

export default function HelpLayout({ sidebar, children, header, isReadingMode }: HelpLayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {header}

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Sidebar Toggle - Index drawer */}
        <div className={cn(
            "lg:hidden fixed bottom-8 right-8 z-[60] transition-transform duration-500",
            isReadingMode && "translate-y-24"
        )}>
            <Sheet>
              <SheetTrigger asChild>
                <Button size="icon" className="w-14 h-14 rounded-full shadow-2xl bg-primary text-primary-foreground hover:scale-110 active:scale-95 transition-all">
                   <Columns className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0 border-r bg-card/95 backdrop-blur-md">
                <SheetHeader className="p-6 border-b">
                   <SheetTitle className="text-xs font-black uppercase tracking-[0.3em] text-primary">Índice del Manual</SheetTitle>
                </SheetHeader>
                <div className="h-full overflow-y-auto pb-20">
                   {sidebar}
                </div>
              </SheetContent>
            </Sheet>
        </div>

        {/* Desktop Sidebar */}
        <aside className={cn(
            "w-80 border-r bg-card/30 lg:flex flex-col overflow-y-auto transition-all duration-500",
            isReadingMode ? "-ml-80 opacity-0" : "opacity-100",
            "hidden lg:flex"
        )}>
          {sidebar}
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto scroll-smooth">
          <div className={cn(
              "mx-auto px-4 md:px-12 lg:px-16 py-8 md:py-20 animate-in fade-in duration-500 transition-all",
              isReadingMode ? "max-w-6xl py-12" : "max-w-4xl"
          )}>
            {/* The Document "Page" feel */}
            <div className={cn(
                "bg-card shadow-sm border rounded-[1.5rem] md:rounded-[2rem] min-h-[80vh] p-6 md:p-12 lg:p-16 relative transition-all",
                isReadingMode && "shadow-2xl border-primary/10 bg-card/50"
            )}>
               {children}
            </div>
          </div>

          {/* Footer - Minimal document style */}
          {!isReadingMode && (
            <footer className="max-w-4xl mx-auto px-8 py-12 border-t mt-12 md:mt-20 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 text-center">
                <span>© 2024-2026 CostPro Documentación Técnica</span>
                <span>ISO/IEC 26514 • Diátaxis Framework</span>
            </footer>
          )}
        </main>
      </div>
    </div>
  );
}
