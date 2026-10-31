'use client';

/**
 * MaterialRequestFormModal — Formulario de Solicitud de Materiales.
 *
 * MISIÓN RESOLUCIÓN 11 (2026-10-31) — Modelo SC-2-07 «Solicitud de Entrega»
 * (Res. 11/2007 MFP). El formulario captura los datos de uso obligatorio que
 * completa el SOLICITANTE (datos 1–6 del modelo); los datos 7–8 (funcionario
 * que autoriza y empleado del almacén que recibe) se registran en la
 * confirmación y los datos 7/8/9 se muestran en el detalle.
 *
 * Modos:
 *   - CREAR  → RPC create_material_request (estado inicial: borrador).
 *   - EDITAR → RPC update_material_request (SOLO borradores; la RPC lo
 *              revalida con lock FOR UPDATE — el estado es la fuente de
 *              verdad, nunca el cliente).
 *
 * Trust boundary: el cliente SOLO envía identificadores (product_id,
 * warehouse_id, production_order_id), la fecha, textos del modelo (área,
 * centro de costo, almacén textual) y cantidades. Descripción, código y UM de
 * cada producto, y nombre/código del almacén seleccionado se resuelven
 * SIEMPRE en el servidor (snapshots).
 *
 * Validaciones: UI honesta (requeridos marcados, fecha no futura, cantidades
 * > 0, sin productos duplicados) + servidor (misma validación dentro de la
 * transacción de la RPC — última barrera).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, Search, Loader2, AlertTriangle, ClipboardList, Building2,
  Warehouse, Users, FileText, Trash2, Plus,
} from 'lucide-react';
import { cn, touch } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { toast } from 'sonner';
import type {
  MaterialRequestDoc,
  MaterialRequestFormLine,
  MaterialRequestItemPayload,
} from './materialRequestsTypes';

// ────────────────────────────────────────────────────────────────────────────
// Tipos locales
// ────────────────────────────────────────────────────────────────────────────

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string | null;
  unit_of_measure: string | null;
  stock_current: number;
}

interface WarehouseOption {
  id: string;
  name: string;
  code: string | null;
}

interface ProductionOrderOption {
  id: string;
  order_number: string;
  order_type: string;
  status: string;
}

export interface MaterialRequestFormValues {
  fecha_emision: string;
  warehouse_id: string | null;
  almacen_nombre: string;
  almacen_codigo: string;
  entidad_codigo: string;
  area_nombre: string;
  area_codigo: string;
  centro_costo: string;
  production_order_id: string | null;
  notes: string;
  items: MaterialRequestItemPayload[];
}

export interface MaterialRequestFormModalProps {
  open: boolean;
  onClose: () => void;
  storeId: string | null;
  /** Nombre de la tienda activa (entidad del modelo, dato 2). */
  storeName: string | null;
  /** Documento a editar (null = creación). Solo se abre en borrador. */
  editDoc?: MaterialRequestDoc | null;
  onSaved: (result: { request_id?: string; request_number?: string; mode: 'create' | 'edit' }) => void;
}

const hoyLocal = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ────────────────────────────────────────────────────────────────────────────
// Componente
// ────────────────────────────────────────────────────────────────────────────

export function MaterialRequestFormModal({
  open,
  onClose,
  storeId,
  storeName,
  editDoc,
  onSaved,
}: MaterialRequestFormModalProps) {
  const isEdit = !!editDoc;

  // ── Datos generales del modelo (datos 1–4) ──
  const [fechaEmision, setFechaEmision] = useState<string>(hoyLocal());
  const [entidadCodigo, setEntidadCodigo] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [almacenNombre, setAlmacenNombre] = useState('');
  const [almacenCodigo, setAlmacenCodigo] = useState('');
  const [areaNombre, setAreaNombre] = useState('');
  const [areaCodigo, setAreaCodigo] = useState('');
  const [centroCosto, setCentroCosto] = useState('');
  const [productionOrderId, setProductionOrderId] = useState<string>('');
  const [notes, setNotes] = useState('');

  // ── Líneas (dato 5) ──
  const [lineas, setLineas] = useState<MaterialRequestFormLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // ── Catálogos de la tienda ──
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrderOption[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const nuevaClave = useCallback(
    () => `sm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, []);

  // Reset al (re)abrir: creación → vacío; edición → valores del documento.
  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    setIdempotencyKey(nuevaClave());
    if (editDoc) {
      setFechaEmision(editDoc.fecha_emision?.slice(0, 10) || hoyLocal());
      setEntidadCodigo(editDoc.entidad_codigo || '');
      setWarehouseId(editDoc.warehouse_id || '');
      setAlmacenNombre(editDoc.warehouse_id ? '' : editDoc.almacen_nombre);
      setAlmacenCodigo(editDoc.warehouse_id ? '' : (editDoc.almacen_codigo || ''));
      setAreaNombre(editDoc.area_nombre || '');
      setAreaCodigo(editDoc.area_codigo || '');
      setCentroCosto(editDoc.centro_costo || '');
      setProductionOrderId(editDoc.production_order_id || '');
      setNotes(editDoc.notes || '');
      setLineas((editDoc.items || []).map(it => ({
        key: it.product_id,
        product_id: it.product_id,
        name: it.descripcion,
        sku: it.sku || null,
        unidad: it.unit_of_measure || '',
        quantity: Number(it.quantity) || 0,
      })));
    } else {
      setFechaEmision(hoyLocal());
      setEntidadCodigo('');
      setWarehouseId('');
      setAlmacenNombre(storeName || '');
      setAlmacenCodigo('');
      setAreaNombre('');
      setAreaCodigo('');
      setCentroCosto('');
      setProductionOrderId('');
      setNotes('');
      setLineas([]);
    }
    setProductSearch('');
    setSearchResults([]);
  }, [open, editDoc, storeName, nuevaClave]);

  // Catálogos: almacenes activos de la tienda + OTs activas.
  useEffect(() => {
    if (!open || !storeId) return;
    let cancelled = false;
    (async () => {
      try {
        const [whRes, poRes] = await Promise.all([
          supabase
            .from('warehouses')
            .select('id, name, code')
            .eq('store_id', storeId)
            .eq('is_active', true)
            .order('is_default', { ascending: false })
            .order('name', { ascending: true }),
          supabase
            .from('production_orders')
            .select('id, order_number, order_type, status')
            .eq('store_id', storeId)
            .in('status', ['approved', 'in_progress', 'paused'])
            .order('created_at', { ascending: false })
            .limit(50),
        ]);
        if (cancelled) return;
        const whs = (whRes.data || []) as WarehouseOption[];
        setWarehouses(whs);
        setProductionOrders((poRes.data || []) as ProductionOrderOption[]);
        // Default de creación: almacén por defecto si existe; si no, el
        // nombre de la tienda (la tienda actúa como almacén único).
        if (!editDoc) {
          const def = whs.find(() => true);
          if (def) {
            setWarehouseId(def.id);
          } else {
            setAlmacenNombre(prev => (prev || storeName || ''));
          }
        }
      } catch {
        if (!cancelled) {
          setWarehouses([]);
          setProductionOrders([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, storeId, editDoc, storeName]);

  // Almacén seleccionado → nombre/código resueltos por el servidor al guardar;
  // aquí solo se muestran para confirmación visual.
  const warehouseSel = useMemo(
    () => warehouses.find(w => w.id === warehouseId) || null,
    [warehouses, warehouseId],
  );
  const almacenNombreEfectivo = warehouseSel ? warehouseSel.name : almacenNombre.trim();
  const almacenCodigoEfectivo = warehouseSel ? (warehouseSel.code || '') : almacenCodigo.trim();

  // Búsqueda de productos (misma consulta del modal de Ajustes Documentales).
  useEffect(() => {
    const term = productSearch.trim();
    if (!open || !storeId || term.length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await supabase
          .from('products')
          .select('id, name, sku, unit_of_measure, stock_current')
          .eq('store_id', storeId)
          .eq('is_active', true)
          .or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
          .limit(6);
        if (!cancelled) setSearchResults((data || []) as ProductSearchResult[]);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [productSearch, storeId, open]);

  const agregarProducto = useCallback((p: ProductSearchResult) => {
    setLineas(prev => {
      if (prev.some(l => l.product_id === p.id)) {
        toast.error('Este producto ya está en la solicitud');
        return prev;
      }
      return [
        ...prev,
        {
          key: p.id,
          product_id: p.id,
          name: p.name,
          sku: p.sku ?? null,
          unidad: p.unit_of_measure?.trim() || '',
          quantity: 1,
        },
      ];
    });
    setProductSearch('');
    setSearchResults([]);
  }, []);

  const cambiarCantidad = useCallback((key: string, cantidad: number) => {
    setLineas(prev =>
      prev.map(l => (l.key === key
        ? { ...l, quantity: Math.max(0, Number.isFinite(cantidad) ? cantidad : 0) }
        : l))
    );
  }, []);

  const eliminarLinea = useCallback((key: string) => {
    setLineas(prev => prev.filter(l => l.key !== key));
  }, []);

  // ── Validación de interfaz (el servidor revalida todo en la RPC) ──
  const errores: string[] = [];
  if (!fechaEmision) errores.push('La fecha de emisión es obligatoria (dato 1 del modelo).');
  else if (fechaEmision > hoyLocal()) errores.push('La fecha de emisión no puede ser futura.');
  if (!warehouseId && !almacenNombre.trim())
    errores.push('El almacén al que se efectúa la Solicitud es obligatorio (dato 3 del modelo).');
  if (!areaNombre.trim())
    errores.push('El área solicitante es obligatoria (dato 4 del modelo).');
  if (lineas.length === 0)
    errores.push('Añade al menos un producto solicitado (dato 5 del modelo).');
  if (lineas.some(l => !(l.quantity > 0)))
    errores.push('Todas las cantidades deben ser mayores que cero.');

  const valido = errores.length === 0;

  // ── Guardar (crear o actualizar) — el documento queda en BORRADOR ──
  const guardar = useCallback(async () => {
    if (!valido || !storeId || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        p_fecha_emision: fechaEmision,
        p_warehouse_id: warehouseId || null,
        p_almacen_nombre: warehouseId ? null : almacenNombre.trim(),
        p_almacen_codigo: warehouseId ? null : (almacenCodigo.trim() || null),
        p_entidad_codigo: entidadCodigo.trim() || null,
        p_area_nombre: areaNombre.trim(),
        p_area_codigo: areaCodigo.trim() || null,
        p_centro_costo: centroCosto.trim() || null,
        p_production_order_id: productionOrderId || null,
        p_notes: notes.trim(),
        p_items: lineas.map(l => ({ product_id: l.product_id, quantity: l.quantity })),
      };
      const { data, error } = isEdit
        ? await supabase.rpc('update_material_request', {
            p_request_id: editDoc!.id,
            ...payload,
            p_user_id: null,
          })
        : await supabase.rpc('create_material_request', {
            p_store_id: storeId,
            ...payload,
            p_idempotency_key: idempotencyKey,
            p_user_id: null,
          });
      if (error) throw error;
      onSaved({
        request_id: (data as { request_id?: string })?.request_id,
        request_number: (data as { request_number?: string })?.request_number,
        mode: isEdit ? 'edit' : 'create',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSubmitError(msg);
      // La clave de idempotencia se regenera tras un fallo (reintento seguro).
      setIdempotencyKey(nuevaClave());
    } finally {
      setSubmitting(false);
    }
  }, [
    valido, storeId, submitting, isEdit, editDoc, fechaEmision, warehouseId,
    almacenNombre, almacenCodigo, entidadCodigo, areaNombre, areaCodigo,
    centroCosto, productionOrderId, notes, lineas, idempotencyKey, onSaved, nuevaClave,
  ]);

  const Seccion = ({ icon: Icon, titulo, children }: {
    icon: React.ComponentType<{ className?: string }>;
    titulo: string;
    children: React.ReactNode;
  }) => (
    <fieldset className="rounded-xl border border-border p-3 space-y-3">
      <legend className="px-1.5 -ml-1 text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {titulo}
      </legend>
      {children}
    </fieldset>
  );

  return (
    <BaseModal
      open={open}
      onOpenChange={o => { if (!o && !submitting) onClose(); }}
      aria-label={isEdit ? 'Editar Solicitud de Materiales' : 'Nueva Solicitud de Materiales'}
      maxWidth="sm:max-w-3xl"
      title={
        <span className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" aria-hidden="true" />
          {isEdit ? 'Editar Solicitud' : 'Nueva Solicitud de Materiales'}
        </span>
      }
      description={`Modelo SC-2-07 «Solicitud de Entrega» · Res. 11/2007 MFP${storeName ? ` · ${storeName}` : ''}`}
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 w-full">
          <p className="text-[10px] text-muted-foreground font-bold text-center sm:text-left">
            Se guarda en <span className="text-warning">Borrador</span>: podrás revisarla y enviarla después.
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <SecondaryButton
              label="Cancelar"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 sm:flex-none"
            />
            <PrimaryButton
              label={submitting ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Guardar borrador')}
              onClick={guardar}
              disabled={!valido || submitting}
              className="flex-1 sm:flex-none"
            />
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        {/* ── Datos generales (datos 1–4 del modelo) ── */}
        <Seccion icon={FileText} titulo="Datos generales del modelo">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="sm-fecha" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Fecha de emisión <span className="text-destructive">*</span>
              </label>
              <input
                id="sm-fecha"
                type="date"
                value={fechaEmision}
                max={hoyLocal()}
                onChange={e => setFechaEmision(e.target.value)}
                className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Dato 1 del modelo SC-2-07.</p>
            </div>
            <div>
              <label htmlFor="sm-entidad-codigo" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Código de entidad
              </label>
              <input
                id="sm-entidad-codigo"
                value={entidadCodigo}
                onChange={e => setEntidadCodigo(e.target.value)}
                placeholder="REEUP / NIT (opcional)"
                className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Entidad: <span className="font-bold text-foreground">{storeName || '—'}</span>
                {' '}(dato 2; el código se toma de la tienda si existe).
              </p>
            </div>
          </div>
        </Seccion>

        <Seccion icon={Warehouse} titulo="Almacén al que se efectúa la Solicitud (dato 3)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {warehouses.length > 0 ? (
              <div>
                <label htmlFor="sm-almacen" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Almacén <span className="text-destructive">*</span>
                </label>
                <select
                  id="sm-almacen"
                  value={warehouseId}
                  onChange={e => setWarehouseId(e.target.value)}
                  className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)}
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}{w.code ? ` (${w.code})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Nombre y código se registran desde el almacén seleccionado.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="sm-almacen-nombre" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Nombre del almacén <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="sm-almacen-nombre"
                    value={almacenNombre}
                    onChange={e => setAlmacenNombre(e.target.value)}
                    placeholder="Almacén principal…"
                    className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)}
                  />
                </div>
                <div>
                  <label htmlFor="sm-almacen-codigo" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Código del almacén
                  </label>
                  <input
                    id="sm-almacen-codigo"
                    value={almacenCodigo}
                    onChange={e => setAlmacenCodigo(e.target.value)}
                    placeholder="Opcional"
                    className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)}
                  />
                </div>
              </>
            )}
          </div>
        </Seccion>

        <Seccion icon={Building2} titulo="Área solicitante, centro de costo y OP/OT (dato 4)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="sm-area" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Área solicitante <span className="text-destructive">*</span>
              </label>
              <input
                id="sm-area"
                value={areaNombre}
                onChange={e => setAreaNombre(e.target.value)}
                placeholder="Ej: Taller de montaje"
                className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)}
                autoFocus={!isEdit}
              />
            </div>
            <div>
              <label htmlFor="sm-area-codigo" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Código del área
              </label>
              <input
                id="sm-area-codigo"
                value={areaCodigo}
                onChange={e => setAreaCodigo(e.target.value)}
                placeholder="Opcional"
                className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)}
              />
            </div>
            <div>
              <label htmlFor="sm-centro-costo" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Centro de costo
              </label>
              <input
                id="sm-centro-costo"
                value={centroCosto}
                onChange={e => setCentroCosto(e.target.value)}
                placeholder="Opcional"
                className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)}
              />
            </div>
            <div>
              <label htmlFor="sm-ot" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Orden de Producción / Trabajo
              </label>
              <select
                id="sm-ot"
                value={productionOrderId}
                onChange={e => setProductionOrderId(e.target.value)}
                className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)}
              >
                <option value="">Sin OP/OT (carga al área/centro de costo)</option>
                {productionOrders.map(po => (
                  <option key={po.id} value={po.id}>
                    {po.order_number} · {po.order_type} ({po.status})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                A la que se cargarán los productos solicitados (dato 4).
              </p>
            </div>
          </div>
        </Seccion>

        <Seccion icon={Users} titulo="Productos solicitados (dato 5)">
          <div className="relative">
            <label htmlFor="sm-buscar-producto" className="sr-only">Buscar producto</label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <input
              id="sm-buscar-producto"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="Buscar por nombre o código (mínimo 2 letras)…"
              className={cn('w-full pl-10 pr-4 rounded-xl border border-border bg-background text-sm', touch)}
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" aria-hidden="true" />
            )}
            {searchResults.length > 0 && (
              <div className="absolute z-20 w-full mt-1 rounded-xl border border-border bg-card shadow-lg max-h-56 overflow-y-auto">
                {searchResults.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => agregarProducto(p)}
                    className="w-full text-left p-2.5 hover:bg-muted text-sm border-b border-border/30 last:border-0"
                  >
                    <span className="font-bold">{p.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {p.sku ? `Código: ${p.sku} · ` : ''}UM: {p.unit_of_measure || '—'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lineas.length > 0 ? (
            <div className="space-y-2">
              {lineas.map(l => (
                <div key={l.key} className="p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{l.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {l.sku ? `Código: ${l.sku} · ` : ''}UM: {l.unidad || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div>
                        <label htmlFor={`sm-cant-${l.key}`} className="sr-only">Cantidad de {l.name}</label>
                        <input
                          id={`sm-cant-${l.key}`}
                          type="number"
                          min="0"
                          step="any"
                          value={l.quantity}
                          onChange={e => cambiarCantidad(l.key, parseFloat(e.target.value) || 0)}
                          className={cn('w-24 px-2 py-1.5 rounded-lg border border-border bg-background font-mono font-bold text-sm text-right', touch)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => eliminarLinea(l.key)}
                        className="p-2 rounded-lg text-destructive hover:bg-destructive/10"
                        aria-label={`Quitar ${l.name} de la solicitud`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground">
                {lineas.length} producto(s) · la descripción, código y unidad de medida quedan
                registrados por el servidor al guardar.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Busca y añade los productos con sus cantidades.
            </p>
          )}
        </Seccion>

        <Seccion icon={ClipboardList} titulo="Notas (dato adicional de COSTPRO)">
          <div>
            <label htmlFor="sm-notas" className="sr-only">Notas</label>
            <textarea
              id="sm-notas"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notas internas de la solicitud (opcional)…"
              rows={2}
              className={cn('w-full px-3 rounded-xl border border-border bg-background text-sm resize-none', touch)}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              El solicitante (dato 6) queda registrado automáticamente con tu usuario al guardar.
            </p>
          </div>
        </Seccion>

        {errores.length > 0 && (
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 space-y-1">
            {errores.map((e, i) => (
              <p key={i} className="text-xs font-bold text-destructive flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" /> {e}
              </p>
            ))}
          </div>
        )}
        {submitError && (
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-xs font-bold text-destructive">No se pudo guardar la solicitud: {submitError}</p>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
