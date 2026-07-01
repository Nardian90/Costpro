'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Book, Search, ChevronLeft, ChevronRight,
  Home, Hash, List, Filter, ArrowRight,
  Loader2, AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Asiento,
  Cuenta,
  ClasificadorData,
  WikiModule,
  WikiState,
  AsientosData,
  CuentasData
} from './types';
import { loadAsientos, loadCuentas, loadClasificador } from './data-loader';

// Components
import { AsientosModule } from './AsientosModule';
import { CuentasModule } from './CuentasModule';
import { ClasificadorModule } from './ClasificadorModule';
import { WikiSidebar } from './WikiSidebar';
import { WikiSearch } from './WikiSearch';
import { WikiBreadcrumbs } from './WikiBreadcrumbs';

export default function WikiView() {
  const prefersReducedMotion = useReducedMotion();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    asientos: AsientosData | null;
    cuentas: CuentasData | null;
    clasificador: ClasificadorData | null;
  }>({
    asientos: null,
    cuentas: null,
    clasificador: null
  });

  const [state, setState] = useState<WikiState>({
    activeModule: 'asientos',
    selectedId: null,
    history: [{ module: 'asientos', id: null }]
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const [asientos, cuentas, clasificador] = await Promise.all([
          loadAsientos(),
          loadCuentas(),
          loadClasificador()
        ]);
        setData({ asientos, cuentas, clasificador });
      } catch (err: any) {
        console.error('Wiki load error:', err);
        setError('Error al cargar la base de conocimientos contable.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const navigateTo = (module: WikiModule, id: string | null) => {
    setState(prev => ({
      activeModule: module,
      selectedId: id,
      history: [...prev.history, { module, id }]
    }));
  };

  const goBack = () => {
    if (state.history.length <= 1) return;
    const newHistory = [...state.history];
    newHistory.pop();
    const last = newHistory[newHistory.length - 1];
    setState({
      activeModule: last.module,
      selectedId: last.id,
      history: newHistory
    });
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background/50 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Cargando Wiki Contable...</p>
        </div>
      </div>
    );
  }

  if (error || !data.asientos || !data.cuentas || !data.clasificador) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-destructive opacity-50" />
          <h3 className="text-xl font-black uppercase tracking-tight">Error de Carga</h3>
          <p className="text-muted-foreground">{error || 'No se pudieron cargar los datos manuales.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Wiki Sidebar */}
      <WikiSidebar
        activeModule={state.activeModule}
        onModuleChange={(m) => navigateTo(m, null)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Wiki Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={goBack}
              disabled={state.history.length <= 1}
              className="rounded-full"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                <Book className="h-3 w-3" />
                Wiki Contable
              </div>
              <div className="text-[10px] font-medium opacity-50 uppercase tracking-tighter">
                {state.activeModule === 'asientos' && 'Asientos Contables'}
                {state.activeModule === 'cuentas' && 'Plan de Cuentas'}
                {state.activeModule === 'clasificador' && 'Clasificador de Cuentas'}
              </div>
            </div>
          </div>

          <WikiSearch
            data={data as any}
            onSelect={(module, id) => navigateTo(module, id)}
          />
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-10 no-scrollbar">
          <WikiBreadcrumbs
            module={state.activeModule}
            selectedId={state.selectedId}
            onNavigate={navigateTo}
          />
          <AnimatePresence mode="wait">
            <motion.div
              key={state.activeModule + (state.selectedId || '')}
              initial={{ opacity: 0, y: 10 }}
              animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? {} : { opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="mx-auto max-w-5xl"
            >
              {state.activeModule === 'asientos' && (
                <AsientosModule
                  data={data.asientos as any}
                  selectedId={state.selectedId}
                  onNavigate={navigateTo}
                />
              )}
              {state.activeModule === 'cuentas' && (
                <CuentasModule
                  data={data.cuentas as any}
                  selectedId={state.selectedId}
                  onNavigate={navigateTo}
                />
              )}
              {state.activeModule === 'clasificador' && (
                <ClasificadorModule
                  data={data.clasificador as any}
                  selectedId={state.selectedId}
                  onNavigate={navigateTo}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
