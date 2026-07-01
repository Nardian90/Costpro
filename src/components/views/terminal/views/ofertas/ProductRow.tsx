'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { OfertaItemContract } from '@/contracts/oferta';

interface ProductRowProps {
  item: OfertaItemContract;
  index: number;
  onChange: (index: number, field: keyof OfertaItemContract, value: string | number) => void;
  onRemove: (index: number) => void;
  currency: string;
  errors?: Record<string, string>;
}

export default function ProductRow({
  item,
  index,
  onChange,
  onRemove,
  currency,
  errors = {},
}: ProductRowProps) {
  const importe = item.cantidad * item.precio_unitario;
  const descError = errors[`productos.${index}.descripcion`];
  const cantError = errors[`productos.${index}.cantidad`];
  const precioError = errors[`productos.${index}.precio_unitario`];

  return (
    <div className="grid grid-cols-12 gap-2 items-end">
      <div className="col-span-2">
        <Label className="text-[10px] text-muted-foreground">Código</Label>
        <Input
          value={item.codigo}
          onChange={e => onChange(index, 'codigo', e.target.value)}
          placeholder="COD"
          className="h-8 text-xs"
        />
      </div>
      <div className="col-span-3">
        <Label className="text-[10px] text-muted-foreground">Descripción *</Label>
        <Input
          value={item.descripcion}
          onChange={e => onChange(index, 'descripcion', e.target.value)}
          placeholder="Descripción del producto"
          className={`h-8 text-xs ${descError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
          aria-invalid={!!descError}
        />
        {descError && <p className="text-[9px] text-destructive mt-0.5">{descError}</p>}
      </div>
      <div className="col-span-1">
        <Label className="text-[10px] text-muted-foreground">UM</Label>
        <Input
          value={item.um}
          onChange={e => onChange(index, 'um', e.target.value)}
          placeholder="U"
          className="h-8 text-xs text-center"
        />
      </div>
      <div className="col-span-1">
        <Label className="text-[10px] text-muted-foreground">Cant.</Label>
        <Input
          type="number"
          min={0.01}
          step="any"
          value={item.cantidad || ''}
          onChange={e => onChange(index, 'cantidad', parseFloat(e.target.value) || 0)}
          className={`h-8 text-xs text-right ${cantError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
          aria-invalid={!!cantError}
        />
        {cantError && <p className="text-[9px] text-destructive mt-0.5">{cantError}</p>}
      </div>
      <div className="col-span-2">
        <Label className="text-[10px] text-muted-foreground">Precio Unit.</Label>
        <Input
          type="number"
          min={0.01}
          step="any"
          value={item.precio_unitario || ''}
          onChange={e => onChange(index, 'precio_unitario', parseFloat(e.target.value) || 0)}
          className={`h-8 text-xs text-right ${precioError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
          aria-invalid={!!precioError}
        />
        {precioError && <p className="text-[9px] text-destructive mt-0.5">{precioError}</p>}
      </div>
      <div className="col-span-2">
        <Label className="text-[10px] text-muted-foreground">Importe</Label>
        <div className="h-8 px-2 flex items-center justify-end bg-muted/30 rounded-md text-xs font-bold text-primary">
          {importe.toLocaleString('es-CU', { minimumFractionDigits: 2 })} {currency}
        </div>
      </div>
      <div className="col-span-1 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onRemove(index)}
          className="h-8 w-8 text-destructive hover:text-destructive"
          aria-label="Eliminar producto"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
