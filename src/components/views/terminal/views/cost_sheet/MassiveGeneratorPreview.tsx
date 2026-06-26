'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MassiveResult } from './MassiveGenerator.types';

import { useTranslations } from 'next-intl';
interface MassiveGeneratorPreviewProps {
  results: MassiveResult[];
  isProcessing: boolean;
  currentIndex: number;
  isLoadingInventory: boolean;
  selectedIds: Set<string>;
  onToggleSelectAll: () => void;
  onToggleSelect: (sku: string) => void;
  onUpdateResultField: (index: number, field: keyof MassiveResult, value: string | number) => void;
}

export const MassiveGeneratorPreview: React.FC<MassiveGeneratorPreviewProps> = ({
  results,
  isProcessing,
  currentIndex,
  isLoadingInventory,
  selectedIds,
  onToggleSelectAll,
  onToggleSelect,
  onUpdateResultField,
}) => {
  const t = useTranslations('costSheet');
  return (
    <div className="rounded-2xl border border-sidebar-border/50 overflow-hidden bg-background/50 backdrop-blur-md">
      <Table>
        <TableHeader className="bg-sidebar/30">
          <TableRow className="border-sidebar-border/50 hover:bg-transparent">
            <TableHead className="w-10">
              <Checkbox
                checked={selectedIds.size === results.length && results.length > 0}
                onCheckedChange={() => onToggleSelectAll()}
              />
            </TableHead>
            <TableHead className="text-xs font-black uppercase tracking-widest h-10">SKU</TableHead>
            <TableHead className="text-xs font-black uppercase tracking-widest h-10">Producto</TableHead>
            <TableHead className="text-xs font-black uppercase tracking-widest h-10 text-right">Costo</TableHead>
            <TableHead className="text-xs font-black uppercase tracking-widest h-10 text-right">Venta</TableHead>
            <TableHead className="text-xs font-black uppercase tracking-widest h-10 text-right">Utilidad</TableHead>
            <TableHead className="text-xs font-black uppercase tracking-widest h-10 text-center">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-bold uppercase tracking-widest text-xs">
                {isLoadingInventory ? (
                  <div className="flex flex-col items-center py-4">
                    <CostProLoader size={120} text="CARGANDO" subtext="Obteniendo catálogo..." />
                  </div>
                ) : (
                  'No se ha iniciado el proceso'
                )}
              </TableCell>
            </TableRow>
          ) : (
            results.map((result, idx) => (
              <TableRow
                key={idx}
                className={cn(
                  'border-sidebar-border/50 transition-colors',
                  idx === currentIndex ? 'bg-primary/5' : 'hover:bg-sidebar/20',
                  !selectedIds.has(result.sku) && 'opacity-60'
                )}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(result.sku)}
                    onCheckedChange={() => onToggleSelect(result.sku)}
                    disabled={isProcessing}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  <input
                    className="bg-transparent border-none focus:ring-1 focus:ring-primary rounded px-1 w-full"
                    value={result.sku}
                    onChange={(e) => onUpdateResultField(idx, 'sku', e.target.value)}
                    disabled={isProcessing}
                    aria-label="SKU"
                  />
                </TableCell>
                <TableCell className="font-bold text-xs">
                  <input
                    className="bg-transparent border-none focus:ring-1 focus:ring-primary rounded px-1 w-full"
                    value={result.name}
                    onChange={(e) => onUpdateResultField(idx, 'name', e.target.value)}
                    disabled={isProcessing}
                    aria-label="Nombre del producto"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <input
                    type="number"
                    className="bg-transparent border-none focus:ring-1 focus:ring-primary rounded px-1 w-20 text-right text-xs font-bold"
                    value={result.cost}
                    onChange={(e) =>
                      onUpdateResultField(idx, 'cost', parseFloat(e.target.value) || 0)
                    }
                    disabled={isProcessing}
                    aria-label="Costo"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <input
                    type="number"
                    className="bg-transparent border-none focus:ring-1 focus:ring-primary rounded px-1 w-20 text-right text-xs font-bold text-success"
                    value={result.salePrice}
                    onChange={(e) =>
                      onUpdateResultField(idx, 'salePrice', parseFloat(e.target.value) || 0)
                    }
                    disabled={isProcessing}
                    aria-label="Precio de venta"
                  />
                </TableCell>
                <TableCell className="text-right font-bold text-xs text-primary">
                  ${result.utility.toLocaleString()}
                </TableCell>
                <TableCell className="text-center">
                  {result.status === 'processing' && (
                    <CostProLoader size={24} showText={false} showSubtext={false} className="mx-auto" />
                  )}
                  {result.status === 'completed' && <CheckCircle2 className="w-4 h-4 mx-auto text-success" />}
                  {result.status === 'error' && (
                    <div title={result.error}>
                      <AlertCircle className="w-4 h-4 mx-auto text-danger" />
                    </div>
                  )}
                  {result.status === 'pending' && (
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/30 mx-auto" />
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
