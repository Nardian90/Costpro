'use client';

/**
 * CreatePhysicalInventoryModal — flujo guiado de creación.
 *
 * Datos generales: tienda (autorizadas según rol — nivel administrativo ve su
 * alcance; roles operativos ven sus membresías activas, ver
 * useAuthorizedStores), fecha de corte (≤ ahora), descripción, responsable,
 * alcance (catálogo / categoría / selección), modo ciego y observaciones.
 *
 * La fecha de corte NO es la fecha de creación ni la de aprobación: la RPC
 * congelará las existencias teóricas correspondientes al corte al PREPARAR.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ClipboardCheck, EyeOff, CalendarClock, PackageSearch, X, AlertTriangle, RefreshCw } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { apiFetch } from '@/lib/api-fetch';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { useAuthorizedStores } from '@/hooks/api/useAuthorizedStores';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PI_SCOPE_LABELS } from './pi-types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}

const inputCls =
  'w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30';
const labelCls = 'text-[10px] font-black uppercase tracking-widest text-muted-foreground';

interface ProductOpt { id: string; name: string; sku: string | null; category: string | null; }

export const CreatePhysicalInventoryModal: React.FC<Props> = ({ open, onOpenChange, onCreated }) => {
  const { user } = useAuthStore();

  const [storeId, setStoreId] = useState('');
  const [cutoffDate, setCutoffDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16); // datetime-local value
  });
  const [description, setDescription] = useState('');
  const [responsible, setResponsible] = useState(user?.fullName || user?.email || '');
  const [scopeType, setScopeType] = useState<'full' | 'category' | 'selection'>('full');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<ProductOpt[]>([]);
  const [blindMode, setBlindMode] = useState(false);
  const [observations, setObservations] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Tiendas autorizadas — MISIÓN PI-SUPERADMIN (2026-10-26): fuente única
  // compartida con la vista del módulo. Antes este modal construía las
  // opciones SOLO con user.memberships → el SuperAdmin de plataforma (sin
  // membresías POR DISEÑO, §6 20260826120000) veía «Sin Tiendas Autorizadas».
  // El hook distingue carga / error / ausencia legítima y consulta con el
  // token del usuario (la RLS es la barrera final).
  const {
    data: effectiveStores = [],
    isLoading: storesLoading,
    error: storesError,
    refetch: refetchStores,
  } = useAuthorizedStores();

  // Selección por defecto: la tienda activa del usuario SI está dentro de las
  // autorizadas; si no, la primera autorizada. Nunca deja un storeId fuera de
  // las opciones (evita desincronización select/estado y envíos a tiendas no
  // autorizadas — el servidor revalida de todos modos).
  useEffect(() => {
    if (!open || effectiveStores.length === 0) return;
    if (effectiveStores.some((s) => s.id === storeId)) return;
    const preferred =
      user?.activeStoreId && effectiveStores.some((s) => s.id === user.activeStoreId)
        ? user.activeStoreId
        : effectiveStores[0].id;
    setStoreId(preferred);
  }, [open, effectiveStores, storeId, user?.activeStoreId]);

  // Categorías de la tienda (products.category — texto)
  const { data: categories = [] } = useQuery({
    queryKey: ['pi-create-categories', storeId],
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
    enabled: open && !!storeId && scopeType === 'category',
    staleTime: 60_000,
  });

  // Búsqueda de productos (alcance por selección)
  const { data: foundProducts = [], isFetching: searching } = useQuery({
    queryKey: ['pi-create-products', storeId, productSearch],
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
    enabled: open && !!storeId && scopeType === 'selection' && productSearch.trim().length >= 2,
    staleTime: 15_000,
  });

  const canSubmit = useMemo(() => {
    if (!storeId || !cutoffDate) return false;
    // La tienda elegida debe estar en la lista autorizada cargada (el servidor
    // revalida membresía/nivel administrativo en withStoreAccess + RPC).
    if (!effectiveStores.some((s) => s.id === storeId)) return false;
    if (storesLoading || !!storesError) return false;
    if (scopeType === 'category' && selectedCats.length === 0) return false;
    if (scopeType === 'selection' && selectedProducts.length === 0) return false;
    return true;
  }, [storeId, cutoffDate, effectiveStores, storesLoading, storesError, scopeType, selectedCats, selectedProducts]);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const cutoffIso = new Date(cutoffDate).toISOString();
      const res = await apiFetch<{ id: string }>('/api/physical-inventory', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          cutoffDate: cutoffIso,
          description: description || null,
          responsibleName: responsible || null,
          scopeType,
          categories: scopeType === 'category' ? selectedCats : null,
          productIds: scopeType === 'selection' ? selectedProducts.map((p) => p.id) : null,
          blindMode,
          observations: observations || null,
        }),
      });
      toast.success('Inventario físico creado', { description: 'Ahora prepare el inventario para generar las líneas de conteo.' });
      onCreated(res.id);
      onOpenChange(false);
    } catch (e) {
      toast.error('No se pudo crear el inventario', { description: e instanceof Error ? e.message : undefined });
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
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Nuevo inventario físico
        </span>
      }
      description="Defina la tienda, la fecha de corte y el alcance del conteo. La existencia teórica se congelará al preparar el inventario."
      maxWidth="sm:max-w-2xl"
      footer={
        <div className="flex gap-2">
          <SecondaryButton className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton
            className="flex-1"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            Crear inventario
          </PrimaryButton>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Tienda + Fecha de corte */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls} htmlFor="pi-store">Tienda</label>
            <select
              id="pi-store"
              className={inputCls}
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              disabled={submitting || storesLoading}
            >
              {storesLoading && <option value="">Cargando tiendas…</option>}
              {storesError && <option value="">Error al cargar tiendas</option>}
              {!storesLoading && !storesError && effectiveStores.length === 0 && (
                <option value="">Sin tiendas autorizadas</option>
              )}
              {effectiveStores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {/* Estados diferenciados: un error de carga NO se presenta como
                «Sin tiendas autorizadas» (requisito misión §5.4/§6.G) */}
            {storesError ? (
              <p role="alert" className="flex items-center justify-between gap-2 text-[10px] font-bold text-destructive">
                <span className="flex min-w-0 items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span className="truncate">No se pudieron cargar las tiendas ({storesError.message}).</span>
                </span>
                <button
                  type="button"
                  onClick={() => refetchStores()}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 hover:bg-destructive/10"
                >
                  <RefreshCw className="h-3 w-3" /> Reintentar
                </button>
              </p>
            ) : !storesLoading && effectiveStores.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">
                No tiene tiendas autorizadas. Solicite acceso al administrador de su organización.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label className={labelCls} htmlFor="pi-cutoff">Fecha y hora de corte</label>
            <div className="relative">
              <input
                id="pi-cutoff"
                type="datetime-local"
                className={cn(inputCls, 'pr-9')}
                value={cutoffDate}
                max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                onChange={(e) => setCutoffDate(e.target.value)}
                disabled={submitting}
              />
              <CalendarClock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Las existencias teóricas se calcularán a este instante (no a la fecha de creación del documento).
            </p>
          </div>
        </div>

        {/* Descripción + Responsable */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls} htmlFor="pi-desc">Descripción / motivo</label>
            <input
              id="pi-desc"
              className={inputCls}
              placeholder="P. ej. Inventario trimestral de almacén"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls} htmlFor="pi-resp">Responsable del conteo</label>
            <input
              id="pi-resp"
              className={inputCls}
              placeholder="Nombre de quien dirige el conteo"
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
            Solo se incluyen productos activos del catálogo de la tienda seleccionada (los servicios no tienen existencias). Los productos sin stock también se incluyen: deben contarse (un sobrante solo se detecta contando).
          </p>
        </div>

        {/* Selección de categorías */}
        {scopeType === 'category' && (
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

        {/* Selección de productos */}
        {scopeType === 'selection' && (
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
              ni en la plantilla Excel. Solo roles autorizados (admin, manager, encargado) podrán consultarlas al conciliar.
            </p>
          </div>
          <div className={cn('mt-1 h-5 w-9 rounded-full p-0.5 transition-colors', blindMode ? 'bg-primary' : 'bg-border')}>
            <div className={cn('h-4 w-4 rounded-full bg-white transition-transform', blindMode && 'translate-x-4')} />
          </div>
        </button>

        {/* Observaciones */}
        <div className="space-y-1.5">
          <label className={labelCls} htmlFor="pi-obs">Observaciones (opcional)</label>
          <textarea
            id="pi-obs"
            className={cn(inputCls, 'min-h-[70px] py-2')}
            placeholder="Indicaciones para el equipo de conteo, restricciones, etc."
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
