'use client';

/**
 * EditPhysicalInventoryModal — MISIÓN CICLO DE VIDA (2026-10-27).
 *
 * Edición de los datos de un inventario en BORRADOR:
 *   · draft   → edición completa (corte, descripción, responsable, alcance,
 *               modo ciego, observaciones). El alcance define los productos
 *               incluidos; la teórica se congela al preparar.
 *   · prepared → solo campos no congelados (descripción, responsable, modo
 *               ciego, observaciones). Corte y alcance quedaron fijados por
 *               la instantánea congelada al preparar; para cambiarlos hay
 *               que eliminar el borrador y crearlo de nuevo.
 *
 * La tienda NO es editable (el documento pertenece a su tienda de origen).
 * El servidor revalida estado y permisos en la RPC update_physical_inventory.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, SquarePen, EyeOff, CalendarClock, PackageSearch, X, Lock } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { apiFetch } from '@/lib/api-fetch';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PI_SCOPE_LABELS, type PIHeader } from './pi-types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pi: PIHeader;
  onSaved: () => void;
}

const inputCls =
  'w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30';
const labelCls = 'text-[10px] font-black uppercase tracking-widest text-muted-foreground';
const frozenCls = 'w-full min-h-[44px] rounded-xl border border-border bg-muted/50 px-3 text-sm text-muted-foreground';

interface ProductOpt { id: string; name: string; sku: string | null; category: string | null; }

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export const EditPhysicalInventoryModal: React.FC<Props> = ({ open, onOpenChange, pi, onSaved }) => {
  const isDraft = pi.status === 'draft';
  const storeId = (pi as PIHeader & { store_id?: string }).store_id || '';

  const [cutoffDate, setCutoffDate] = useState(() => toLocalInput(pi.cutoff_date));
  const [description, setDescription] = useState(pi.description || '');
  const [responsible, setResponsible] = useState(pi.responsible_name || '');
  const [scopeType, setScopeType] = useState<'full' | 'category' | 'selection'>(pi.scope_type);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<ProductOpt[]>([]);
  const [blindMode, setBlindMode] = useState(pi.blind_mode);
  const [observations, setObservations] = useState(pi.observations || '');
  const [submitting, setSubmitting] = useState(false);

  // Precargar alcance existente (categorías / productos) al abrir
  useEffect(() => {
    if (!open) return;
    setCutoffDate(toLocalInput(pi.cutoff_date));
    setDescription(pi.description || '');
    setResponsible(pi.responsible_name || '');
    setScopeType(pi.scope_type);
    setBlindMode(pi.blind_mode);
    setObservations(pi.observations || '');
    setSelectedCats([]);
    setSelectedProducts([]);
    if (isDraft && pi.scope_type === 'category') {
      const cats = (pi as PIHeader & { scope_category_names?: string[] | null }).scope_category_names;
      if (cats) setSelectedCats(cats);
    }
    if (isDraft && pi.scope_type === 'selection') {
      const ids = (pi as PIHeader & { scope_products?: string[] | null }).scope_products;
      if (ids && ids.length > 0) {
        supabase
          .from('products')
          .select('id, name, sku, category')
          .in('id', ids)
          .then(({ data }: { data: ProductOpt[] | null }) => {
            if (data) setSelectedProducts(data);
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pi.id]);

  // Categorías de la tienda (products.category — texto)
  const { data: categories = [] } = useQuery({
    queryKey: ['pi-edit-categories', storeId],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('category')
        .eq('store_id', storeId)
        .not('category', 'is', null)
        .neq('category', '');
      const unique = Array.from(new Set((data || []).map((d: { category: string }) => d.category).filter(Boolean))) as string[];
      return unique.sort();
    },
    enabled: open && isDraft && !!storeId && scopeType === 'category',
    staleTime: 60_000,
  });

  // Búsqueda de productos (alcance por selección)
  const { data: foundProducts = [], isFetching: searching } = useQuery({
    queryKey: ['pi-edit-products', storeId, productSearch],
    queryFn: async () => {
      const q = productSearch.trim();
      if (q.length < 2) return [] as ProductOpt[];
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, category')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .limit(8);
      return (data || []) as ProductOpt[];
    },
    enabled: open && isDraft && !!storeId && scopeType === 'selection' && productSearch.trim().length >= 2,
    staleTime: 15_000,
  });

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!isDraft) return true; // prepared: solo textos/modo ciego, siempre enviables
    if (!cutoffDate) return false;
    if (scopeType === 'category' && selectedCats.length === 0) return false;
    if (scopeType === 'selection' && selectedProducts.length === 0) return false;
    return true;
  }, [submitting, isDraft, cutoffDate, scopeType, selectedCats, selectedProducts]);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/physical-inventory/${pi.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          cutoffDate: isDraft ? new Date(cutoffDate).toISOString() : null,
          description: description || null,
          responsibleName: responsible || null,
          scopeType: isDraft ? scopeType : null,
          categories: isDraft && scopeType === 'category' ? selectedCats : null,
          productIds: isDraft && scopeType === 'selection' ? selectedProducts.map((p) => p.id) : null,
          blindMode,
          observations: observations || null,
        }),
      });
      toast.success('Inventario actualizado');
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error('No se pudo actualizar el inventario', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <SquarePen className="h-5 w-5 text-primary" />
          Editar inventario {pi.pi_number}
        </span>
      }
      description={
        isDraft
          ? 'Modifique los datos del borrador. La existencia teórica se congelará al preparar el inventario.'
          : 'El inventario ya está preparado: la fecha de corte y el alcance quedaron congelados con la instantánea teórica.'
      }
      maxWidth="sm:max-w-2xl"
      footer={
        <div className="flex gap-2">
          <SecondaryButton className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton className="flex-1" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SquarePen className="h-4 w-4" />}
            Guardar cambios
          </PrimaryButton>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Tienda (fija) + Fecha de corte */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Tienda</label>
            <div className={frozenCls}>{pi.store?.name || '—'}</div>
            <p className="text-[10px] text-muted-foreground">La tienda del documento no puede cambiarse.</p>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls} htmlFor="pi-edit-cutoff">Fecha y hora de corte</label>
            {isDraft ? (
              <div className="relative">
                <input
                  id="pi-edit-cutoff"
                  type="datetime-local"
                  className={cn(inputCls, 'pr-9')}
                  value={cutoffDate}
                  max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  onChange={(e) => setCutoffDate(e.target.value)}
                  disabled={submitting}
                />
                <CalendarClock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            ) : (
              <div className={frozenCls}>{new Date(pi.cutoff_date).toLocaleString()}</div>
            )}
            <p className="text-[10px] text-muted-foreground">
              {isDraft
                ? 'Las existencias teóricas se calcularán a este instante.'
                : 'Congelada al preparar: elimine el borrador y créelo de nuevo si debe cambiar.'}
            </p>
          </div>
        </div>

        {/* Descripción + Responsable */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls} htmlFor="pi-edit-desc">Descripción / motivo</label>
            <input
              id="pi-edit-desc"
              className={inputCls}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls} htmlFor="pi-edit-resp">Responsable del conteo</label>
            <input
              id="pi-edit-resp"
              className={inputCls}
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              maxLength={120}
              disabled={submitting}
            />
          </div>
        </div>

        {/* Alcance */}
        <div className="space-y-2">
          <span className={labelCls}>Alcance del conteo</span>
          {isDraft ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(PI_SCOPE_LABELS) as Array<'full' | 'category' | 'selection'>).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setScopeType(t)}
                    disabled={submitting}
                    className={cn(
                      'min-h-[44px] rounded-xl border px-3 py-2 text-xs font-bold transition-colors',
                      scopeType === t
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card hover:bg-muted/50 text-muted-foreground'
                    )}
                  >
                    {PI_SCOPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Solo se incluyen productos activos del catálogo de la tienda (los servicios no tienen existencias).
              </p>
            </>
          ) : (
            <div className={cn(frozenCls, 'flex items-center gap-2')}>
              <Lock className="h-3.5 w-3.5 shrink-0" />
              {PI_SCOPE_LABELS[pi.scope_type]} — congelado al preparar
            </div>
          )}
        </div>

        {/* Selección de categorías (solo draft) */}
        {isDraft && scopeType === 'category' && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
            <span className={labelCls}>Categorías incluidas ({selectedCats.length})</span>
            {categories.length === 0 ? (
              <p className="text-xs text-muted-foreground">La tienda no tiene categorías con productos.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {categories.map((cat) => {
                  const on = selectedCats.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      disabled={submitting}
                      onClick={() => setSelectedCats(on ? selectedCats.filter((c) => c !== cat) : [...selectedCats, cat])}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                        on ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Selección de productos (solo draft) */}
        {isDraft && scopeType === 'selection' && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
            <span className={labelCls}>Productos incluidos ({selectedProducts.length})</span>
            <div className="relative">
              <PackageSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className={cn(inputCls, 'pl-9')}
                placeholder="Buscar por nombre o código (mín. 2 caracteres)…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                disabled={submitting}
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {productSearch.trim().length >= 2 && foundProducts.length > 0 && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {foundProducts
                  .filter((p) => !selectedProducts.some((s) => s.id === p.id))
                  .slice(0, 6)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50"
                      onClick={() => {
                        setSelectedProducts([...selectedProducts, p]);
                        setProductSearch('');
                      }}
                      disabled={submitting}
                    >
                      <span className="font-bold truncate">{p.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{p.sku || '—'}</span>
                    </button>
                  ))}
              </div>
            )}
            {selectedProducts.length > 0 && (
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {selectedProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                    <span className="text-xs font-bold truncate">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">{p.sku || '—'}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedProducts(selectedProducts.filter((s) => s.id !== p.id))}
                        className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Quitar ${p.name}`}
                        disabled={submitting}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modo ciego */}
        <button
          type="button"
          onClick={() => setBlindMode(!blindMode)}
          disabled={submitting}
          className={cn(
            'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
            blindMode ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50'
          )}
        >
          <div className={cn('mt-0.5 rounded-lg p-2', blindMode ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
            <EyeOff className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold">Conteo ciego</p>
            <p className="text-xs text-muted-foreground">
              Quien cuenta no verá las existencias teóricas ni las diferencias: ni en la vista, ni en la hoja PDF,
              ni en la plantilla Excel. Solo roles autorizados podrán consultarlas al conciliar.
            </p>
          </div>
          <div className={cn('mt-1 h-5 w-9 rounded-full p-0.5 transition-colors', blindMode ? 'bg-primary' : 'bg-border')}>
            <div className={cn('h-4 w-4 rounded-full bg-white transition-transform', blindMode && 'translate-x-4')} />
          </div>
        </button>

        {/* Observaciones */}
        <div className="space-y-1.5">
          <label className={labelCls} htmlFor="pi-edit-obs">Observaciones (opcional)</label>
          <textarea
            id="pi-edit-obs"
            className={cn(inputCls, 'min-h-[70px] py-2')}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            maxLength={2000}
            disabled={submitting}
          />
        </div>
      </div>
    </BaseModal>
  );
};
