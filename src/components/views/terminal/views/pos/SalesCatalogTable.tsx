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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Minus, Plus, Percent, DollarSign, Info, Eye, EyeOff } from 'lucide-react';
import { Product, ProductVariant, PaymentMethod } from '@/types';
import { formatCurrency, cn } from '@/lib/utils';
import { SalesCatalogRow, PAYMENT_METHODS } from './useSalesCatalog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SalesCatalogTableProps {
  products: Product[];
  getOrCreateRow: (product: Product) => SalesCatalogRow;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  onSort: (key: string) => void;
  showMixedColumns: boolean;
  handlers: {
    handleSetQuantity: (p: Product, q: number) => void;
    handleSelectVariant: (p: Product, v: ProductVariant | null) => void;
    handleSetDiscountType: (p: Product) => void;
    handleSetDiscountValue: (p: Product, v: number) => void;
    handleSetPaymentMethod: (p: Product, m: PaymentMethod) => void;
    handleSetCashPaid: (p: Product, v: number) => void;
    handleSetTransferPaid: (p: Product, v: number) => void;
  };
  hasDiscrepancy: (row: SalesCatalogRow) => boolean;
  calcSubtotal: (row: SalesCatalogRow) => number;
  onToggleVisible?: (p: Product) => void;
  togglingVisibleId?: string | null;
  isReadOnly?: boolean;
}

export function SalesCatalogTable({
  products,
  getOrCreateRow,
  sortConfig,
  onSort,
  showMixedColumns,
  handlers,
  hasDiscrepancy,
  calcSubtotal,
  onToggleVisible,
  togglingVisibleId,
  isReadOnly = false,
}: SalesCatalogTableProps) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/50 overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent border-border/50">
            <TableHead
              className="w-[25%] text-[10px] font-black uppercase tracking-widest cursor-pointer"
              onClick={() => onSort('name')}
            >
              Producto {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </TableHead>
            <TableHead className="w-[15%] text-[10px] font-black uppercase tracking-widest text-center">Variante</TableHead>
            <TableHead
              className="w-[12%] text-[10px] font-black uppercase tracking-widest text-center cursor-pointer"
              onClick={() => onSort('stock_current')}
            >
              Stock {sortConfig?.key === 'stock_current' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </TableHead>
            <TableHead className="w-[15%] text-[10px] font-black uppercase tracking-widest text-center">Cantidad</TableHead>
            <TableHead
              className="w-[12%] text-[10px] font-black uppercase tracking-widest text-right cursor-pointer"
              onClick={() => onSort('price')}
            >
              Precio {sortConfig?.key === 'price' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </TableHead>
            {showMixedColumns && (
              <TableHead className="w-[15%] text-[10px] font-black uppercase tracking-widest text-center">Pago</TableHead>
            )}
            <TableHead className="w-[6%] text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => {
            const row = getOrCreateRow(product);
            const isSelected = row.quantity > 0;
            const hasVariants = (product.product_variants?.length ?? 0) > 0;
            const discrepancy = hasDiscrepancy(row);
            const subtotal = calcSubtotal(row);

            return (
              <TableRow
                key={product.id}
                className={cn(
                  'group border-border/40 transition-colors',
                  isSelected ? 'bg-primary/5' : 'hover:bg-muted/30',
                  !product.visible_en_tienda && 'opacity-60'
                )}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    {onToggleVisible && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onToggleVisible(product)}
                        disabled={togglingVisibleId === product.id}
                        aria-label={product.visible_en_tienda ? "Ocultar" : "Mostrar"}
                      >
                        {product.visible_en_tienda ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                      </Button>
                    )}
                    <div className="flex flex-col">
                      <span className="font-bold text-sm uppercase tracking-tight leading-tight group-hover:text-primary transition-colors">
                        {product.name}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">{product.sku || 'SIN SKU'}</span>
                    </div>
                  </div>
                </TableCell>

                <TableCell className="text-center">
                  {hasVariants ? (
                    <select
                      value={row.selectedVariantId || '__base__'}
                      onChange={(e) => {
                        if (e.target.value === '__base__') {
                          handlers.handleSelectVariant(product, null);
                        } else {
                          const variant = product.product_variants?.find((v) => v.id === e.target.value);
                          handlers.handleSelectVariant(product, variant || null);
                        }
                      }}
                      disabled={isReadOnly}
                      className="bg-muted/50 border border-border/40 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/40 mx-auto appearance-none disabled:opacity-50"
                      aria-label="Variante"
                    >
                      <option value="__base__">{product.unit_of_measure || 'Base'}</option>
                      {product.product_variants?.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  ) : (
                    <Badge variant="outline" className="text-[9px] font-bold uppercase py-0 px-2 opacity-60">
                      {product.unit_of_measure || 'Unidad'}
                    </Badge>
                  )}
                </TableCell>

                <TableCell className="text-center">
                  <span className={cn(
                    'text-xs font-bold uppercase',
                    (product.stock_current ?? 0) <= (product.min_stock ?? 0) ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {product.stock_current ?? 0}
                  </span>
                </TableCell>

                <TableCell>
                  <div className={cn(
                    "flex items-center justify-center gap-1 p-1 rounded-xl border transition-all",
                    discrepancy ? "border-red-500/40 bg-red-500/5" : "border-transparent"
                  )}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg hover:bg-background"
                      onClick={() => handlers.handleSetQuantity(product, row.quantity - 1)}
                      disabled={isReadOnly || row.quantity <= 0}
                      aria-label="Menos"
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <Input
                      type="number"
                      value={row.quantity || ''}
                      onChange={(e) => handlers.handleSetQuantity(product, parseFloat(e.target.value) || 0)}
                      disabled={isReadOnly}
                      className="h-7 w-12 border-none bg-transparent text-center font-black text-xs p-0 focus-visible:ring-0 disabled:opacity-50"
                      placeholder="0"
                      aria-label="Cantidad"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg hover:bg-background"
                      onClick={() => handlers.handleSetQuantity(product, row.quantity + 1)}
                      disabled={isReadOnly}
                      aria-label="Más"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex flex-col items-end">
                    <span className="font-black text-sm text-primary tracking-tight">
                      {formatCurrency(row.price)}
                    </span>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase opacity-60">
                      Costo: {formatCurrency(row.cost)}
                    </span>
                  </div>
                </TableCell>

                {showMixedColumns && (
                  <TableCell className="text-center">
                    {!isReadOnly && isSelected ? (
                      <select
                        value={row.paymentMethod}
                        onChange={(e) => handlers.handleSetPaymentMethod(product, e.target.value as PaymentMethod)}
                        className="bg-background border border-border/40 rounded-lg px-2 py-1 text-[9px] font-black uppercase outline-none focus:ring-1 focus:ring-primary/40 appearance-none"
                        aria-label="Método pago"
                      >
                        {PAYMENT_METHODS.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    ) : (
                       <span className="text-[9px] font-bold text-muted-foreground uppercase opacity-40">—</span>
                    )}
                  </TableCell>
                )}

                <TableCell className="text-right">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-flex items-center gap-2">
                           {discrepancy && <Info className="w-4 h-4 text-red-500 animate-pulse" />}
                           <span className={cn(
                             "font-black text-xs tabular-nums",
                             isSelected ? "text-foreground" : "text-muted-foreground/30"
                           )}>
                             {formatCurrency(subtotal)}
                           </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="bg-background/95 backdrop-blur-md border-border/50 p-3 rounded-xl shadow-xl">
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between gap-4">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">Subtotal Neto</span>
                            <span className="text-xs font-black">{formatCurrency(subtotal)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">Forma de Pago</span>
                            <span className="text-[10px] font-black uppercase text-primary">
                              {PAYMENT_METHODS.find(m => m.value === row.paymentMethod)?.label || row.paymentMethod}
                            </span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
