'use client';

import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface HelpLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  header: ReactNode;
}

export default function HelpLayout({ sidebar, children, header }: HelpLayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {header}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r bg-card/30 hidden lg:flex flex-col overflow-y-auto">
          {sidebar}
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto scroll-smooth">
          <div className="max-w-4xl mx-auto px-8 md:px-12 lg:px-16 py-12 md:py-20 animate-in fade-in duration-500">
            {/* The Document "Page" feel */}
            <div className="bg-card shadow-sm border rounded-[2rem] min-h-[80vh] p-8 md:p-12 lg:p-16 relative">
               {children}
            </div>
          </div>

          {/* Footer - Minimal document style */}
          <footer className="max-w-4xl mx-auto px-8 py-12 border-t mt-20 flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
             <span>© 2024-2026 CostPro Documentación Técnica</span>
             <span>Estándar ISO/IEC 26514</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
