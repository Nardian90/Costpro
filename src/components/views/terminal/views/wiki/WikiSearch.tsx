'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Loader2, BookOpen, FileText, Hash } from 'lucide-react';
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
  WikiModule,
  Asiento,
  AsientoLinea,
  Cuenta
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
  const [search, setSearch] = useState('');

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
    return Object.entries(data.asientos.asientos).map(([id, asiento]: [string, Asiento]) => ({
      id,
      titulo: asiento.titulo,
      descripcion: asiento.descripcion || '',
      contenido: asiento.lineas.map((l: AsientoLinea) => l.Descrip).join(' '),
      module: 'asientos' as WikiModule
    }));
  }, [data.asientos]);

  const cuentasList = useMemo(() => {
    return data.cuentas.cuentas.map((cuenta: Cuenta) => ({
      id: cuenta.codigo,
      titulo: `${cuenta.codigo} - ${cuenta.nombre}`,
      descripcion: cuenta.descripcion || '',
      module: 'cuentas' as WikiModule
    }));
  }, [data.cuentas]);

  return (
    <>
      <button type="button"
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
        <CommandInput
          placeholder="BUSCAR POR ASIENTO, USO, CONTENIDO..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList className="max-h-[400px]">
          <CommandEmpty>No se encontraron resultados.</CommandEmpty>

          <CommandGroup heading="ASIENTOS CONTABLES">
            {asientosList.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.titulo} ${item.descripcion} ${item.contenido}`}
                onSelect={() => {
                  onSelect(item.module, item.id);
                  setOpen(false);
                  setSearch('');
                }}
                className="flex flex-col items-start gap-1 py-3"
              >
                <div className="flex items-center gap-2 w-full">
                  <Hash className="h-3.5 w-3.5 text-primary opacity-70" />
                  <span className="font-bold uppercase text-[11px] tracking-tight">{item.titulo}</span>
                </div>
                {item.descripcion && (
                  <p className="text-[10px] text-muted-foreground line-clamp-1 pl-5 uppercase tracking-tighter opacity-60">
                    {item.descripcion}
                  </p>
                )}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="CUENTAS CONTABLES">
            {cuentasList.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.titulo} ${item.descripcion}`}
                onSelect={() => {
                  onSelect(item.module, item.id);
                  setOpen(false);
                  setSearch('');
                }}
                className="flex flex-col items-start gap-1 py-3"
              >
                <div className="flex items-center gap-2 w-full">
                  <BookOpen className="h-3.5 w-3.5 text-primary opacity-70" />
                  <span className="font-bold uppercase text-[11px] tracking-tight">{item.titulo}</span>
                </div>
                {item.descripcion && (
                  <p className="text-[10px] text-muted-foreground line-clamp-1 pl-5 uppercase tracking-tighter opacity-60">
                    {item.descripcion}
                  </p>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
};
