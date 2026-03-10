'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Loader2 } from 'lucide-react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command';
import {
  AsientosData,
  CuentasData,
  ClasificadorData,
  WikiModule
} from './types';

interface WikiSearchProps {
  data: {
    asientos: AsientosData;
    cuentas: CuentasData;
    clasificador: ClasificadorData;
  };
  onSelect: (module: WikiModule, id: string) => void;
}

export const WikiSearch: React.FC<WikiSearchProps> = ({ data, onSelect }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const asientosList = useMemo(() => {
    return Object.entries(data.asientos.asientos).map(([id, asiento]) => ({
      id,
      titulo: asiento.titulo,
      module: 'asientos' as WikiModule
    }));
  }, [data.asientos]);

  const cuentasList = useMemo(() => {
    return data.cuentas.cuentas.map((cuenta) => ({
      id: cuenta.codigo,
      titulo: `${cuenta.codigo} - ${cuenta.nombre}`,
      module: 'cuentas' as WikiModule
    }));
  }, [data.cuentas]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-10 w-48 lg:w-64 rounded-xl border bg-muted/50 px-3 text-xs font-black uppercase tracking-widest text-muted-foreground hover:bg-muted transition-all"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">BUSCAR...</span>
        <kbd className="hidden lg:inline-flex h-5 items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="BUSCAR ASIENTOS, CUENTAS O CLASIFICACIÓN..." />
        <CommandList>
          <CommandEmpty>No se encontraron resultados.</CommandEmpty>

          <CommandGroup heading="ASIENTOS CONTABLES">
            {asientosList.map((item) => (
              <CommandItem
                key={item.id}
                onSelect={() => {
                  onSelect(item.module, item.id);
                  setOpen(false);
                }}
              >
                {item.titulo}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="CUENTAS CONTABLES">
            {cuentasList.map((item) => (
              <CommandItem
                key={item.id}
                onSelect={() => {
                  onSelect(item.module, item.id);
                  setOpen(false);
                }}
              >
                {item.titulo}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
};
