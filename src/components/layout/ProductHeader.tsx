'use client';

import React from 'react';
import Link from 'next/link';
import { LayoutGrid, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { CostProLogo } from '@/components/CostProLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { registry } from '@/core/features/registry';
import { useUIStore } from '@/store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import * as LucideIcons from 'lucide-react';

export function ProductHeader() {
  const { currentView, setCurrentView } = useUIStore();
  const features = registry.getAllFeatures();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <CostProLogo size={32} />
            <span className="font-headline font-black tracking-tighter hidden sm:block">COSTPRO</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/"
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary",
                currentView === 'occ' ? "text-primary" : "text-on-surface-variant"
              )}
            >
              Inicio
            </Link>
            {features.slice(0, 2).map((feature) => (
              <Link
                key={feature.id}
                href={feature.path}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary flex items-center gap-2",
                  currentView === feature.id ? "text-primary" : "text-on-surface-variant",
                  feature.status === 'pro-locked' && "opacity-60"
                )}
              >
                {feature.name}
                {feature.status === 'pro-locked' && <Lock className="w-3 h-3" />}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <AppLauncher />
          <ThemeToggle />
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="text-[10px] font-bold text-primary">JD</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function AppLauncher() {
  const features = registry.getAllFeatures();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-2 rounded-xl hover:bg-surface-variant transition-colors outline-none" aria-label="Aplicaciones">
          <LayoutGrid className="w-5 h-5 text-on-surface-variant" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-4 rounded-2xl bg-card border-border shadow-2xl">
        <div className="px-2 py-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-4">
          Ecosistema CostPro
        </div>
        <div className="grid grid-cols-3 gap-4">
          {features.map((feature) => {
            const Icon = (LucideIcons as any)[feature.icon] || LayoutGrid;
            return (
              <Link
                key={feature.id}
                href={feature.path}
                className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-primary/10 group transition-all"
              >
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all relative",
                  feature.status === 'pro-locked' ? "bg-surface-variant text-on-surface-variant" : "bg-primary/10 text-primary group-hover:scale-110 shadow-sm"
                )}>
                  <Icon className="w-6 h-6" />
                  {feature.status === 'pro-locked' && (
                    <div className="absolute -top-1 -right-1 bg-surface border border-border p-1 rounded-full shadow-sm">
                      <Lock className="w-2 h-2 text-on-surface-variant" />
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-tighter text-center leading-tight">
                  {feature.name}
                </span>
              </Link>
            );
          })}
        </div>
        <DropdownMenuSeparator className="my-4" />
        <div className="px-2 py-1 flex items-center justify-between">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase">Suscripción: Business</span>
          <span className="text-[10px] font-black text-primary uppercase">Mejorar Plan</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
