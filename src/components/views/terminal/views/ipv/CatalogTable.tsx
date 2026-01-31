'use client';

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product } from '@/lib/dexie';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Search, HelpCircle, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function CatalogTable() {
  const [searchTerm, setSearchTerm] = useState('');
  const products = useLiveQuery(() => db.products.toArray());

  const filtered = products?.filter(p =>
    p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.cod.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleDelete = async (cod: string) => {
    if (confirm('¿Eliminar este producto del catálogo?')) {
      await db.products.delete(cod);
    }
  };

  const clearCatalog = async () => {
    if (confirm('¿ESTÁS SEGURO? Se borrará TODO el catálogo cargado actualmente.')) {
        await db.products.clear();
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 flex flex-col md:flex-row gap-4 bg-background/50 border-b items-center justify-between">
        <div className="relative flex-1 max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código o descripción..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="rounded-full">
                            <HelpCircle className="w-4 h-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs p-4 space-y-2">
                        <p className="font-bold text-primary">Ayuda de Columnas:</p>
                        <ul className="text-xs space-y-1 list-disc pl-4">
                            <li><strong>cod:</strong> Identificador único (EAN, SKU o ID interno).</li>
                            <li><strong>UM:</strong> Unidad de Medida (Unidades, Caja, etc).</li>
                            <li><strong>Precio:</strong> Valor unitario en centavos (ej: 26000 = $260.00).</li>
                            <li><strong>Prioridad:</strong> Del 1 al 5. El algoritmo prioriza matches con menor número.</li>
                            <li><strong>Es Paquete:</strong> Indica si contiene múltiples unidades físicas.</li>
                        </ul>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <Button
                variant="destructive"
                size="sm"
                onClick={clearCatalog}
                className="text-xs uppercase font-black tracking-widest"
            >
                Limpiar Catálogo
            </Button>
        </div>
      </div>

      {/* Mini Help Info */}
      <div className="px-4 py-2 bg-primary/5 border-l-4 border-primary mx-4 rounded-r-xl flex items-start gap-3">
        <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-bold text-primary uppercase">Tip Profesional:</span> El motor de matching utiliza la <strong>Prioridad</strong> para resolver ambigüedades.
            Si tienes varios productos con el mismo precio, asegúrate de dar mayor prioridad (número menor) al producto que más se vende por transferencia.
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky-column-1">Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>UM</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-center">Prioridad</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No hay productos en el catálogo.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.cod}>
                  <TableCell className="sticky-column-1 font-mono text-xs font-bold text-primary">{p.cod}</TableCell>
                  <TableCell className="font-medium">{p.descripcion}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase">{p.um}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-black">
                    {formatCurrency(p.precio_cents / 100)}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold border border-primary/20">
                        {p.prioridad_algoritmo}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={p.activo ? 'bg-green-500' : 'bg-red-500'}>
                        {p.activo ? 'ACTIVO' : 'INACTIVO'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(p.cod)}
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
