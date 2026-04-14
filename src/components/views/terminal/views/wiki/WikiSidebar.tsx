'use client';

import React from 'react';
import {
  Book,
  Hash,
  List,
  Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WikiModule } from './types';

interface WikiSidebarProps {
  activeModule: WikiModule;
  onModuleChange: (module: WikiModule) => void;
}

export const WikiSidebar: React.FC<WikiSidebarProps> = ({ activeModule, onModuleChange }) => {
  const items: { id: WikiModule; label: string; icon: any }[] = [
    { id: 'asientos', label: 'Asientos', icon: Hash },
    { id: 'cuentas', label: 'Cuentas', icon: List },
    { id: 'clasificador', label: 'Clasificador', icon: Filter },
  ];

  return (
    <>
      {/* Mobile tab bar */}
      <div className="sm:hidden wiki-mobile-tabs border-b bg-muted/30">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onModuleChange(item.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 rounded-xl transition-all min-h-[44px]",
                isActive
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-primary/5"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-xs font-black uppercase tracking-widest">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Desktop sidebar */}
      <aside className="w-16 lg:w-48 shrink-0 flex-col border-r bg-muted/30 hidden sm:flex">
        <nav className="flex-1 space-y-2 p-4">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onModuleChange(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all group",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "hover:bg-primary/5 text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0 transition-transform group-hover:scale-110", isActive && "scale-110")} />
                <span className="text-xs font-black uppercase tracking-widest hidden lg:block">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
