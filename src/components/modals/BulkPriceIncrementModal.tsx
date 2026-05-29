'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  Percent,
  DollarSign,
  TrendingUp,
  Package,
  ArrowRight,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  BarChart3,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { useAuthStore } from '@/store';
import { useBulkPriceUpdate } from '@/hooks/api/useProducts';
import { cn, formatCurrency } from '@/lib/utils';
import { type Product } from '@/types';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableFooter,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

// ── Types ────────────────────────────────────────────────────────────

type Method = 'markup' | 'fixed_increment';

type FieldSelection = {
  price: boolean;
  precio_empresa: boolean;
};

type Scope = 'all' | 'category' | 'selected';

interface BulkPriceIncrementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  categories: string[];
  selectedIds?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function calculateNewPrice(
  oldPrice: number,
  method: Method,
  value: number
): number {
  if (method === 'markup') {
    return Math.round(oldPrice * (1 + value / 100) * 100) / 100;
  }
  return Math.round((oldPrice + value) * 100) / 100;
}

function methodLabel(method: Method): string {
  return method === 'markup' ? 'Porcentaje (%)' : 'Incremento Fijo ($)';
}

function methodDescription(method: Method, value: number): string {
  if (method === 'markup') {
    return `+${value}% sobre precio actual`;
  }
  return `+${formatCurrency(value)} fijo`;
}

function fieldLabel(field: 'price' | 'precio_empresa' | 'both'): string {
  switch (field) {
    case 'price':
      return 'Precio Minorista';
    case 'precio_empresa':
      return 'Precio Empresa';
    case 'both':
      return 'Ambos precios';
  }
}

// ── Component ───────────────────────────────────────────────────────

export const BulkPriceIncrementModal: React.FC<BulkPriceIncrementModalProps> = ({
  open,
  onOpenChange,
  products,
  categories,
  selectedIds,
}) => {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId || '';

  const bulkPriceUpdate = useBulkPriceUpdate();

  // ── Local State ──────────────────────────────────────────────────
  const [method, setMethod] = useState<Method>('markup');
  const [value, setValue] = useState<string>('');
  const [fields, setFields] = useState<FieldSelection>({
    price: true,
    precio_empresa: false,
  });
  const [scope, setScope] = useState<Scope>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const numericValue = parseFloat(value) || 0;

  // ── Derived: Affected Products ─────────────────────────────────────
  const affectedProducts = useMemo(() => {
    let filtered = products;

    if (scope === 'category' && selectedCategory) {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    } else if (scope === 'selected' && selectedIds && selectedIds.length > 0) {
      filtered = filtered.filter((p) => selectedIds.includes(p.id));
    }

    return filtered;
  }, [products, scope, selectedCategory, selectedIds]);

  // Collect variant IDs from all affected products
  const variantIds = useMemo(() => {
    const ids: string[] = [];
    affectedProducts.forEach((p) => {
      p.product_variants?.forEach((v) => {
        ids.push(v.id);
      });
    });
    return ids;
  }, [affectedProducts]);

  // ── Derived: Field key for mutation ────────────────────────────────
  const fieldKey = useMemo((): 'price' | 'precio_empresa' | 'both' => {
    if (fields.price && fields.precio_empresa) return 'both';
    if (fields.precio_empresa) return 'precio_empresa';
    return 'price';
  }, [fields]);

  // ── Derived: Validation ────────────────────────────────────────────
  const hasValidInput = numericValue > 0 && (fields.price || fields.precio_empresa);
  const hasAffectedProducts = affectedProducts.length > 0;
  const canApply = hasValidInput && hasAffectedProducts;

  // ── Derived: Preview (up to 5 sample products) ─────────────────────
  const previewProducts = useMemo(() => {
    return affectedProducts.slice(0, 5);
  }, [affectedProducts]);

  // ── Derived: Summary Stats ───────────────────────────────────────
  const summary = useMemo(() => {
    if (!hasValidInput || affectedProducts.length === 0) return null;

    let totalChange = 0;
    let count = 0;

    affectedProducts.forEach((p) => {
      const basePrice = p.price;
      const newP = calculateNewPrice(basePrice, method, numericValue);
      totalChange += Math.abs(newP - basePrice);
      count++;

      if (fields.precio_empresa) {
        const ep = p.precio_empresa ?? p.price;
        const newEp = calculateNewPrice(ep, method, numericValue);
        totalChange += Math.abs(newEp - ep);
        count++;
      }
    });

    return {
      affectedCount: affectedProducts.length,
      affectedVariantCount: variantIds.length,
      averageChange: count > 0 ? totalChange / count : 0,
      methodDesc: methodDescription(method, numericValue),
      fieldDesc: fieldLabel(fieldKey),
    };
  }, [affectedProducts, variantIds, fields, fieldKey, method, numericValue, hasValidInput]);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleFieldToggle = useCallback(
    (field: 'price' | 'precio_empresa') => {
      setFields((prev) => {
        const next = { ...prev, [field]: !prev[field] };
        // At least one must be selected
        if (!next.price && !next.precio_empresa) {
          return prev;
        }
        return next;
      });
    },
    []
  );

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleReset = useCallback(() => {
    setMethod('markup');
    setValue('');
    setFields({ price: true, precio_empresa: false });
    setScope('all');
    setSelectedCategory('');
  }, []);

  const handleApply = useCallback(async () => {
    if (!canApply) return;

    const productIds = affectedProducts.map((p) => p.id);

    try {
      await bulkPriceUpdate.mutateAsync({
        productIds,
        variantIds,
        storeId,
        field: fieldKey,
        method,
        value: numericValue,
        logEntry: {
          store_id: storeId,
          field_changed: fieldKey,
          change_method: method,
          change_params: {
            value: numericValue,
            scope,
            category: scope === 'category' ? selectedCategory : null,
            product_count: affectedProducts.length,
            variant_count: variantIds.length,
          },
          affected_count: affectedProducts.length + variantIds.length,
        },
      });

      toast.success(
        `Precios actualizados: ${affectedProducts.length} producto${affectedProducts.length !== 1 ? 's' : ''}`,
        {
          description: variantIds.length > 0
            ? `Incluye ${variantIds.length} variante${variantIds.length !== 1 ? 's' : ''}`
            : undefined,
          icon: <CheckCircle2 className="w-5 h-5 text-success" />,
          duration: 5000,
        }
      );

      handleReset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Error al actualizar precios', {
        description: err?.message || 'Ocurrió un error inesperado',
        icon: <AlertTriangle className="w-5 h-5 text-danger" />,
        duration: 7000,
      });
    }
  }, [
    canApply,
    affectedProducts,
    variantIds,
    storeId,
    fieldKey,
    method,
    numericValue,
    scope,
    selectedCategory,
    bulkPriceUpdate,
    handleReset,
    onOpenChange,
  ]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      title="Incremento Masivo de Precios"
      description="Aplica ajustes de precios a múltiples productos de forma rápida"
      maxWidth="sm:max-w-2xl"
      footer={
        <div className="flex flex-col sm:flex-row w-full gap-2">
          <SecondaryButton
            label="Cancelar"
            onClick={handleClose}
            className="flex-1"
          />
          <PrimaryButton
            label={
              bulkPriceUpdate.isPending
                ? 'Aplicando...'
                : `Aplicar a ${affectedProducts.length} producto${affectedProducts.length !== 1 ? 's' : ''}`
            }
            icon={bulkPriceUpdate.isPending ? Loader2 : TrendingUp}
            onClick={handleApply}
            disabled={!canApply || bulkPriceUpdate.isPending}
            className="flex-1"
          />
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* ─── Section: Method ─────────────────────────────────────── */}
        <section>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
            <Percent className="w-3 h-3 inline-block mr-1.5 -mt-0.5" />
            Método de Incremento
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {(['markup', 'fixed_increment'] as Method[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  'flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-xs font-black uppercase tracking-widest transition-all min-h-[44px]',
                  method === m
                    ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                )}
              >
                {m === 'markup' ? (
                  <Percent className="w-3.5 h-3.5" />
                ) : (
                  <DollarSign className="w-3.5 h-3.5" />
                )}
                {methodLabel(m)}
              </button>
            ))}
          </div>
        </section>

        {/* ─── Section: Value Input ────────────────────────────────── */}
        <section>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
            <DollarSign className="w-3 h-3 inline-block mr-1.5 -mt-0.5" />
            {method === 'markup' ? 'Porcentaje de Incremento' : 'Monto Fijo a Sumar'}
          </h3>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
              {method === 'markup' ? '%' : '$'}
            </span>
            <input
              type="number"
              min="0"
              step={method === 'markup' ? '0.01' : '0.01'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0.00"
              aria-label={
                method === 'markup'
                  ? 'Porcentaje de incremento'
                  : 'Monto fijo de incremento'
              }
              className="neu-input w-full pl-8 pr-4 py-3 rounded-xl text-sm font-bold bg-muted/20 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </section>

        {/* ─── Section: Field Selection ──────────────────────────────── */}
        <section>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
            <Tag className="w-3 h-3 inline-block mr-1.5 -mt-0.5" />
            Campos a Modificar
          </h3>
          <div className="flex flex-col gap-2">
            {(
              [
                { key: 'price' as const, label: 'Precio Minorista' },
                { key: 'precio_empresa' as const, label: 'Precio Empresa' },
              ] as const
            ).map(({ key, label }) => (
              <label
                key={key}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all min-h-[44px]',
                  fields[key]
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-muted/50 border-border hover:bg-muted'
                )}
              >
                <Checkbox
                  checked={fields[key]}
                  onCheckedChange={() => handleFieldToggle(key)}
                  aria-label={`Modificar ${label}`}
                />
                <span
                  className={cn(
                    'text-xs font-black uppercase tracking-widest',
                    fields[key] ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
                {key === 'precio_empresa' && (
                  <span className="text-[10px] text-muted-foreground ml-auto normal-case tracking-normal font-normal">
                    {fields[key ? 'precio_empresa' : 'price']
                      ? '(sin precio empresa → usa precio minorista)'
                      : ''}
                  </span>
                )}
              </label>
            ))}
          </div>
        </section>

        {/* ─── Section: Scope ──────────────────────────────────────── */}
        <section>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
            <Package className="w-3 h-3 inline-block mr-1.5 -mt-0.5" />
            Alcance
          </h3>
          <div className="flex flex-col gap-2">
            {(
              [
                { key: 'all' as const, label: 'Todos los productos', sub: `${products.length} productos` },
                { key: 'category' as const, label: 'Filtrados por categoría', sub: `${categories.length} categorías` },
                ...(selectedIds && selectedIds.length > 0
                  ? [{ key: 'selected' as const, label: 'Solo seleccionados', sub: `${selectedIds.length} seleccionados` }]
                  : []),
              ] as readonly { key: Scope; label: string; sub: string }[]
            ).map(({ key, label, sub }) => (
              <button
                key={key}
                type="button"
                onClick={() => setScope(key)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all min-h-[44px]',
                  scope === key
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-muted/50 border-border hover:bg-muted'
                )}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
                    scope === key
                      ? 'border-primary'
                      : 'border-muted-foreground/40'
                  )}
                >
                  {scope === key && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      'text-xs font-black uppercase tracking-widest',
                      scope === key ? 'text-primary' : 'text-foreground'
                    )}
                  >
                    {label}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Category filter dropdown */}
          {scope === 'category' && (
            <div className="mt-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 block">
                Seleccionar Categoría
              </label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full neu-input bg-muted/20 border-border">
                  <SelectValue placeholder="Todas las categorías..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </section>

        {/* ─── Validation Messages ──────────────────────────────────── */}
        {!hasValidInput && affectedProducts.length > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-xs text-amber-600 font-semibold">
              Ingresa un valor mayor a 0 para aplicar el incremento
            </span>
          </div>
        )}

        {hasValidInput && affectedProducts.length === 0 && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-xs text-amber-600 font-semibold">
              No hay productos en el alcance seleccionado
            </span>
          </div>
        )}

        {/* ─── Section: Preview Table ──────────────────────────────── */}
        {canApply && previewProducts.length > 0 && (
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <BarChart3 className="w-3 h-3" />
              Vista Previa
              <span className="text-muted-foreground/60">
                (primeros {previewProducts.length} de {affectedProducts.length})
              </span>
            </h3>

            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-[10px] font-black uppercase tracking-widest">
                      Producto
                    </TableHead>
                    {fields.price && (
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-right">
                        Minorista Antes
                      </TableHead>
                    )}
                    {fields.price && (
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-right">
                        Minorista Nuevo
                      </TableHead>
                    )}
                    {fields.precio_empresa && (
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-right">
                        Empresa Antes
                      </TableHead>
                    )}
                    {fields.precio_empresa && (
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-right">
                        Empresa Nuevo
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewProducts.map((product) => {
                    const newPrice = calculateNewPrice(
                      product.price,
                      method,
                      numericValue
                    );
                    const oldEmpresa = product.precio_empresa ?? product.price;
                    const newEmpresa = calculateNewPrice(
                      oldEmpresa,
                      method,
                      numericValue
                    );

                    return (
                      <TableRow key={product.id}>
                        <TableCell className="font-semibold text-xs truncate max-w-[140px]">
                          {product.name}
                        </TableCell>
                        {fields.price && (
                          <TableCell className="text-right text-xs text-muted-foreground font-mono">
                            {formatCurrency(product.price)}
                          </TableCell>
                        )}
                        {fields.price && (
                          <TableCell className="text-right text-xs text-primary font-black font-mono">
                            {formatCurrency(newPrice)}
                          </TableCell>
                        )}
                        {fields.precio_empresa && (
                          <TableCell className="text-right text-xs text-muted-foreground font-mono">
                            {formatCurrency(oldEmpresa)}
                          </TableCell>
                        )}
                        {fields.precio_empresa && (
                          <TableCell className="text-right text-xs text-primary font-black font-mono">
                            {formatCurrency(newEmpresa)}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
                {fields.price && (
                  <TableFooter>
                    <TableRow className="bg-primary/5">
                      <TableCell className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Ejemplo (resumen visual)
                      </TableCell>
                      {fields.price && (
                        <TableCell className="text-right text-[10px] text-muted-foreground">
                          antes
                        </TableCell>
                      )}
                      {fields.price && (
                        <TableCell
                          colSpan={fields.precio_empresa ? 1 : 1}
                          className="text-right"
                        >
                          <span className="inline-flex items-center gap-1 text-primary font-black text-xs">
                            <ArrowRight className="w-3 h-3" />
                            después
                          </span>
                        </TableCell>
                      )}
                      {fields.precio_empresa && (
                        <TableCell className="text-right text-[10px] text-muted-foreground">
                          antes
                        </TableCell>
                      )}
                      {fields.precio_empresa && (
                        <TableCell className="text-right">
                          <span className="inline-flex items-center gap-1 text-primary font-black text-xs">
                            <ArrowRight className="w-3 h-3" />
                            después
                          </span>
                        </TableCell>
                      )}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </section>
        )}

        {/* ─── Section: Summary ──────────────────────────────────────── */}
        {summary && (
          <section>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" />
                Resumen de la Operación
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Productos Afectados
                  </div>
                  <div className="text-xl font-black text-primary">
                    {summary.affectedCount}
                  </div>
                </div>
                {summary.affectedVariantCount > 0 && (
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Variantes Afectadas
                    </div>
                    <div className="text-xl font-black text-primary">
                      {summary.affectedVariantCount}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Cambio Promedio
                  </div>
                  <div className="text-xl font-black text-primary">
                    {method === 'markup'
                      ? `+${numericValue}%`
                      : formatCurrency(summary.averageChange)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Método
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {summary.methodDesc}
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-primary/10">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Campo(s)
                </div>
                <div className="text-sm font-bold text-foreground mt-0.5">
                  {summary.fieldDesc}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ─── Total items badge ────────────────────────────────────── */}
        {affectedProducts.length > 0 && (
          <div className="flex items-center justify-center gap-2 py-1">
            <Package className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {affectedProducts.length} producto
              {affectedProducts.length !== 1 ? 's' : ''}
              {variantIds.length > 0 &&
                ` · ${variantIds.length} variante${variantIds.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        )}
      </div>
    </BaseModal>
  );
};

export default BulkPriceIncrementModal;
