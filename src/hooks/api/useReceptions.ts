import { safeRandomShortId } from "@/lib/safe-random";
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { validateRPCArrayResponse } from '@/lib/rpc-validator';
import { receiptSchema, receiptItemSchema } from '@/validation/schemas';
import { withTableLogging, getCleanStoreId } from './base';
// F-21: validar tasa_cambio_recepcion antes de insertar receipt_items
import { validateReceiptItemsTasa } from '@/lib/receipt-items-validation';
// MISIÓN RECEPCIONES (2026-10-28): vista por productos
import {
  receptionProductLineSchema,
  type ReceptionProductLine,
} from '@/lib/receptions/product-lines';

export function useReceptions(storeId?: string | null, isAdmin = false) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['receptions', cleanStoreId, isAdmin],
    queryFn: async () => {
      const columns = 'id, created_at, total_cost, status, reference_doc, supplier, reception_date, store_id, user_id, payment_status, paid_amount, due_date, payment_method, paid_at';
      let query = supabase.from('receipts').select(columns);
      if (cleanStoreId) {
        query = query.eq('store_id', cleanStoreId);
      }
      // H5: paginación — limit 200 para no cargar TODAS las recepciones
      const data = await withTableLogging('select', 'receipts', () => query.order('created_at', { ascending: false }).limit(200));
      return await validateRPCArrayResponse(data, receiptSchema, 'receipts') as any;
    },
    enabled: !!cleanStoreId,
    staleTime: 30 * 1000,
  });
}

export async function prefetchReceptions(queryClient: QueryClient, storeId: string, isAdmin = false) {
  const cleanStoreId = getCleanStoreId(storeId);
  if (!cleanStoreId) return;

  return queryClient.prefetchQuery({
    queryKey: ['receptions', cleanStoreId, isAdmin],
    queryFn: async () => {
      const columns = 'id, created_at, total_cost, status, reference_doc, supplier, reception_date, store_id, user_id, payment_status, paid_amount, due_date, payment_method, paid_at';
      let query = supabase.from('receipts').select(columns);
      if (cleanStoreId) {
        query = query.eq('store_id', cleanStoreId);
      }
      // FIX-LOG-014: Use withTableLogging for consistent logging pattern
      const data = await withTableLogging('select', 'receipts', () => query.order('created_at', { ascending: false }));
      return await validateRPCArrayResponse(data, receiptSchema, 'receipts') as any;
    },
    staleTime: 30 * 1000,
  });
}

export function useReceptionDetails(receiptId?: string) {
  return useQuery({
    queryKey: ['receipt-items', receiptId],
    queryFn: async () => {
      if (!receiptId) return [];
      const columns = 'id, receipt_id, product_id, quantity, unit_cost, moneda_recepcion, tasa_cambio_recepcion, created_at, products(name, sku, image_url, public_image_url)';
      const data = await withTableLogging('select', 'receipt_items', () => supabase.from('receipt_items')
        .select(columns)
        .eq('receipt_id', receiptId));
      return await validateRPCArrayResponse(data, receiptItemSchema, 'receipt_items');
    },
    enabled: !!receiptId,
  });
}

// ════════════════════════════════════════════════════════════════════════
// MISIÓN RECEPCIONES (2026-10-28) — Pestaña "Productos" de Recepciones.
//
// Segunda perspectiva de la MISMA información: cada fila es una línea de
// producto de un documento de recepción (receipt_items ⟶ receipts ⟶ products),
// con trazabilidad completa hacia su documento de origen.
//
// Reglas de la misión aplicadas:
//  - Fuente de datos: las mismas tablas que ya usa COSTPRO (receipts +
//    receipt_items). No se crean tablas ni migraciones.
//  - Aislamiento multitienda: la política SELECT de receipt_items es
//    'authenticated' (migración 20260112), por lo que el filtro de tienda
//    se aplica explícitamente vía receipts!inner + eq('receipts.store_id')
//    — el MISMO patrón que useReceptions usa sobre receipts. RLS sigue
//    activa encima; este filtro garantiza que solo se leen líneas de la
//    tienda activa.
//  - Sin N+1: una sola consulta con joins embebidos (products + receipts).
//  - Rendimiento: tope de 1000 líneas (equivalente al limit(200) de
//    Documentos) con orden server-side por fecha del documento para que
//    un mismo documento nunca quede partido por el límite.
//  - Solo lectura: ninguna mutación de inventario ni de documentos.
// ════════════════════════════════════════════════════════════════════════

const RECEPTION_PRODUCT_LINES_LIMIT = 1000;

export function useReceptionProductLines(storeId?: string | null) {
  const cleanStoreId = getCleanStoreId(storeId);

  return useQuery({
    queryKey: ['reception-product-lines', cleanStoreId],
    queryFn: async (): Promise<ReceptionProductLine[]> => {
      if (!cleanStoreId) return [];

      const columns = [
        'id',
        'receipt_id',
        'product_id',
        'quantity',
        'unit_cost',
        'moneda_recepcion',
        'tasa_cambio_recepcion',
        'created_at',
        'products(name, sku)',
        'receipts!inner(id, reference_doc, supplier, reception_date, status, store_id, created_at)',
      ].join(', ');

      const data = await withTableLogging('select', 'receipt_items', () =>
        supabase
          .from('receipt_items')
          .select(columns)
          .eq('receipts.store_id', cleanStoreId)
          // Orden server-side: documento más reciente primero y, dentro del
          // mismo documento, líneas en orden de inserción — evita que el
          // límite parta un documento por la mitad.
          .order('created_at', { referencedTable: 'receipts', ascending: false })
          .order('created_at', { ascending: true })
          .limit(RECEPTION_PRODUCT_LINES_LIMIT)
      );

      const validated = await validateRPCArrayResponse(
        data,
        receptionProductLineSchema,
        'receipt_items+receipts+products'
      );

      // Defense-in-depth: reordenar client-side (estable, ≤1000 filas) para
      // que la UI no dependa del comportamiento del orden server-side.
      return [...(validated as ReceptionProductLine[])].sort((a, b) => {
        const dateA = new Date(a.receipts.reception_date || a.receipts.created_at || 0).getTime();
        const dateB = new Date(b.receipts.reception_date || b.receipts.created_at || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        const docA = a.receipts.created_at || '';
        const docB = b.receipts.created_at || '';
        if (docB !== docA) return docB.localeCompare(docA);
        return (a.created_at || '').localeCompare(b.created_at || '');
      });
    },
    enabled: !!cleanStoreId,
    staleTime: 30 * 1000,
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { auditService } from '@/services/audit-service';
import { useAuthStore } from '@/store';

/**
 * Edita campos de cabecera de una recepción (proveedor, nro. factura, notas).
 * No edita los ítems — el inventario ya fue afectado al recibir.
 */
export function useUpdateReception() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      receiptId: string;
      supplier?: string;
      referenceDoc?: string;
      notes?: string;
    }) => {
      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString()
      };
      if (params.supplier !== undefined) updatePayload.supplier = params.supplier;
      if (params.referenceDoc !== undefined) updatePayload.reference_doc = params.referenceDoc;
      if (params.notes !== undefined) updatePayload.notes = params.notes;

      const { data, error } = await supabase
        .from('receipts')
        .update(updatePayload)
        .eq('id', params.receiptId)
        .neq('status', 'voided') // No editar si ya está anulada
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      queryClient.invalidateQueries({ queryKey: ['receipt-items', variables.receiptId] });
      // CP-SEC-004: toda edición de cabecera de recepción deja rastro en
      // audit_logs (actor + campos cambiados + valores nuevos) — paridad
      // con la anulación (PR-3) y la creación (logReceptionCreated).
      const user = useAuthStore.getState().user;
      if (user?.id && data?.store_id) {
        const fields: string[] = [];
        const changes: Record<string, unknown> = {};
        if (variables.supplier !== undefined) {
          fields.push('supplier');
          changes.supplier = variables.supplier;
        }
        if (variables.referenceDoc !== undefined) {
          fields.push('reference_doc');
          changes.reference_doc = variables.referenceDoc;
        }
        if (variables.notes !== undefined) {
          fields.push('notes');
          changes.notes = variables.notes;
        }
        await auditService.logReceptionUpdated({
          userId: user.id,
          receiptId: variables.receiptId,
          storeId: data.store_id,
          fields,
          changes,
        });
      }
    }
  });
}

/**
 * PR-3: Anula una recepción de forma atómica via RPC.
 *
 * Para recepciones 'pending': llama a void_pending_reception que marca como
 * 'voided' + resetea pagos + marca payment_transactions como REVERSED +
 * inserta audit_logs. Preserva receipt_items (no los borra). No toca inventario.
 *
 * Para recepciones 'active': llama a reverse_receipt_v2 (PR-2) que revierte
 * stock + WAC + kardex + stock_movements + resetea pagos + marca REVERSED.
 *
 * Ya NO usa void_reception_with_reversal (RPC obsoleta sin payment reset).
 * Ya NO hace DELETE client-side de receipt_items (destruye auditoría).
 */
export function useVoidReception() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore.getState();
  return useMutation({
    mutationFn: async (params: {
      receiptId: string;
      storeId: string;
      reason?: string;
      /** Política forward-only locking: fecha efectiva (ISO). Default = NOW(). */
      operationDate?: string;
    }) => {
      // Verificar el estado actual de la recepción
      const { data: receipt, error: fetchErr } = await supabase
        .from('receipts')
        .select('status')
        .eq('id', params.receiptId)
        .single();

      if (fetchErr) throw new Error(`Error al obtener recepción: ${fetchErr.message}`);
      if (!receipt) throw new Error('Recepción no encontrada');

      if (receipt.status === 'pending') {
        // PR-3: RPC transaccional atómica. Preserva items. Resetea pagos.
        const { error } = await supabase.rpc('void_pending_reception', {
          p_receipt_id: params.receiptId,
          p_user_id: user?.id || null,
          p_reason: params.reason || 'Anulada por encargado',
          p_operation_date: params.operationDate || null,
        });

        if (error) throw error;
      } else if (receipt.status === 'active') {
        // PR-3: usar reverse_receipt_v2 (PR-2) en lugar de void_reception_with_reversal
        const { error } = await supabase.rpc('reverse_receipt_v2', {
          p_receipt_id: params.receiptId,
          p_reason: params.reason || 'Anulada por encargado',
          p_user_id: user?.id || null,
        });

        if (error) throw error;
      } else {
        throw new Error(`No se puede anular una recepción con status '${receipt.status}'`);
      }
    },
    onSuccess: async (_, variables) => {
      if (user?.id) {
        await auditService.logReceptionVoided({
          userId: user.id,
          receiptId: variables.receiptId,
          storeId: variables.storeId,
          reason: variables.reason
        });
      }
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('ERR_BACKDATED_DOCUMENT')) {
        // Toast claro para política forward-only
        // (sonner se maneja en el caller; aquí solo propagamos)
      }
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// Reception-Flow-Fix: Recepciones pendientes vs confirmadas.
//
// Problema detectado por el usuario:
//   "al terminar la recepción debe poderse confirmar o dejarse pendiente
//    y pasar a otra, mientras esté pendiente por X motivos no se refleja
//    en ningún historial, solo al confirmar es que se vuelve este proceso
//    no editable, confirmándose y reflejándose en el historial de productos"
//
// Solución:
//   1. useSavePendingReception — inserta en receipts + receipt_items con
//      status='pending'. NO actualiza stock ni crea movimientos de inventario.
//      El usuario puede guardar y volver después.
//   2. useConfirmPendingReception — cuando el usuario confirma una recepción
//      pendiente, actualiza el status a 'active' y aplica los cambios de stock
//      por cada item (stock_current += quantity). También marca la recepción
//      como no editable (status='active').
//   3. Las recepciones pendientes aparecen en el historial con badge amarillo
//      "Pendiente" y botones "Confirmar" / "Editar" / "Anular".
//   4. Las recepciones confirmadas (status='active') NO son editables — solo
//      se pueden anular o invertir (disminución).
// ════════════════════════════════════════════════════════════════════════

export interface PendingReceptionItem {
  product_id: string;
  sku?: string | null;
  quantity: number;
  unit_cost: number;
  unit_of_measure?: string | null;
  sale_price?: number | null;
  variant_id?: string | null;
  is_new?: boolean;
  update_price?: boolean;
  // FIX-P1-B: campos multi-moneda que se perdían
  moneda_recepcion?: string;
  tasa_cambio_recepcion?: number;
  price_currency?: string;
}

/**
 * MISIÓN RECEPCIONES (2026-10-27): rollback best-effort de los productos
 * creados para una recepción pendiente cuyo guardado falló. Silencioso por
 * diseño (el error original es el que se reporta), pero deja rastro en
 * consola para diagnóstico.
 */
async function rollbackCreatedProducts(ids: string[]) {
  try {
    const { error } = await supabase.from('products').delete().in('id', ids);
    if (error) console.error('Rollback de productos creados falló:', error.message);
  } catch (e) {
    console.error('Rollback de productos creados (excepción):', e);
  }
}

/**
 * Guarda una recepción como PENDIENTE.
 *
 * Inserta en `receipts` (status='pending') + `receipt_items` sin afectar
 * el inventario. El usuario puede volver después y confirmarla, editarla o
 * anularla. Las recepciones pendientes NO aparecen en el historial de
 * productos ni en movimientos de inventario — solo en el historial de
 * recepciones con badge amarillo "Pendiente".
 */
export function useSavePendingReception() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      storeId: string;
      userId: string;
      supplier: string;
      invoiceNumber: string;
      receptionDate: string; // ISO
      items: PendingReceptionItem[];
      notes?: string;
    }) => {
      // 0. Crear productos nuevos (is_new=true sin product_id) antes de insertar items
      const newItems = params.items.filter(i => i.is_new && !i.product_id);
      const existingItems = params.items.filter(i => i.product_id);

      const createdProductIds: Record<string, string> = {}; // sku -> new product_id
      // MISIÓN RECEPCIONES (2026-10-27): los productos creados en este flujo
      // se revierten si CUALQUIER paso posterior falla (antes: un fallo al
      // insertar la cabecera o las líneas dejaba productos huérfanos en el
      // catálogo — misión §4.2 "evitar productos duplicados o huérfanos").
      let createdProductIdList: string[] = [];

      if (newItems.length > 0) {
        // FIX CP-CAT-004 (auditoría 2026-10-16): la policy products_tenant_insert
        // (migración 20260827000005, sin flag) exige
        // tenant_id = current_user_tenant_id() AND store_id ∈ current_user_store_ids().
        // El insert anterior omitía tenant_id → 403 RLS y la recepción con productos
        // nuevos quedaba bloqueada. El tenant se resuelve desde la BD leyendo
        // stores.tenant_id con el JWT del usuario (mismo patrón RLS-FIX que
        // useReceptionState): la policy stores_tenant_select solo devuelve tiendas
        // del propio tenant, así que el valor queda validado contra la identidad
        // del usuario (no es dato arbitrario del cliente). Fail-closed: si la
        // tienda no es legible o tenant_id es NULL, se aborta sin INSERT.
        const { data: tenantStore, error: tenantError } = await supabase
          .from('stores')
          .select('tenant_id')
          .eq('id', params.storeId)
          .maybeSingle();

        if (tenantError || !tenantStore?.tenant_id) {
          console.error('FIX CP-CAT-004: no se pudo resolver tenant_id de la tienda', {
            storeId: params.storeId,
            hasError: !!tenantError,
            hasRow: !!tenantStore,
          });
          throw new Error(
            'No se pudo verificar la tienda activa para crear productos nuevos. ' +
            'Comprueba tu sesión y los permisos sobre la tienda, e inténtalo de nuevo.'
          );
        }
        const verifiedTenantId: string = tenantStore.tenant_id;

        const productsData = newItems.map(item => ({
          store_id: params.storeId,
          tenant_id: verifiedTenantId,
          sku: item.sku || `SKU-${Date.now()}-${safeRandomShortId()}`,
          name: item.sku || `Producto ${Date.now()}`, // Se usará temporalmente — el nombre real se setea al confirmar
          cost_price: item.unit_cost,
          price: item.sale_price || 0,
          unit_of_measure: item.unit_of_measure || 'unidad',
          is_active: true,
          is_complete: false,
          stock_current: 0,
        }));

        const { data: createdProducts, error: createErr } = await supabase
          .from('products')
          .insert(productsData)
          .select('id, sku');

        if (createErr) {
          // MISIÓN RECEPCIONES (defecto D-A/D-B): clasificar el 23505 de
          // products_sku_store_unique con un mensaje específico y accionable
          // (antes: mensaje crudo del motor).
          if (createErr.code === '23505' || /products_sku_store_unique|duplicate key/i.test(createErr.message)) {
            const dupSkus = newItems.map(i => i.sku).filter(Boolean).join(', ');
            throw new Error(
              `ERR_SKU_EXISTS: el SKU ${dupSkus ? `"${dupSkus}" ` : ''}ya existe en el catálogo de esta tienda. ` +
              'Elimina el item de la recepción y selecciona el producto existente desde el buscador.'
            );
          }
          throw new Error(`Error al crear productos nuevos: ${createErr.message}`);
        }

        for (const p of createdProducts || []) {
          if (p.sku) createdProductIds[p.sku] = p.id;
          createdProductIdList.push(p.id);
        }
      }

      // Combinar items existentes + nuevos con product_id asignado
      const allItems = [
        ...existingItems,
        ...newItems.map(item => ({
          ...item,
          product_id: createdProductIds[item.sku || ''] || '',
        })),
      ].filter(i => i.product_id); // Solo items con product_id válido

      if (allItems.length === 0) {
        throw new Error('No hay items válidos para guardar');
      }

      // F-21: validar tasa_cambio_recepcion antes de insertar receipt_items.
      // Si algún item tiene moneda != CUP y tasa <= 1.5, lanzar error claro
      // para que el usuario corrija antes de tocar la BD.
      const tasaValidation = validateReceiptItemsTasa(allItems);
      if (!tasaValidation.valid) {
        throw new Error(`F-21: ${tasaValidation.error} — ${tasaValidation.details}`);
      }

      // PR-2 C1: calcular totalCost en CUP usando la tasa real de cada item.
      // No usar || 1 (silent fallback). Si un item en moneda extranjera no tiene
      // tasa válida, fallar explícitamente — el caller debe corregir antes de guardar.
      // La validación F-21 (arriba) ya garantiza que los items FX tienen tasa > 1.5,
      // pero este cálculo es defense-in-depth y sirve también para display.
      const totalCost = allItems.reduce((s, i) => {
        if ((i.moneda_recepcion || 'CUP') === 'CUP') {
          // CUP: sin conversión (tasa efectiva = 1)
          return s + i.quantity * i.unit_cost;
        }
        // Moneda extranjera: la tasa DEBE estar definida y ser > 1.5
        // (validado por validateReceiptItemsTasa arriba, pero verificamos de nuevo
        // para no inventar un valor silenciosamente si la validación se debilita).
        if (!i.tasa_cambio_recepcion || i.tasa_cambio_recepcion <= 1.5) {
          throw new Error(
            `Tasa inválida para moneda ${i.moneda_recepcion} en item ${i.sku || '(sin sku)'}: ` +
            `se requiere tasa > 1.5, recibido ${i.tasa_cambio_recepcion ?? 'null'}`
          );
        }
        return s + i.quantity * i.unit_cost * i.tasa_cambio_recepcion;
      }, 0);

      // 1. Insertar la recepción con status='pending'
      const { data: receipt, error: receiptErr } = await supabase
        .from('receipts')
        .insert({
          store_id: params.storeId,
          user_id: params.userId,
          supplier: params.supplier || null,
          reference_doc: params.invoiceNumber || null,
          reception_date: params.receptionDate,
          total_cost: totalCost,
          status: 'pending',
          notes: params.notes || null,
        })
        .select('id')
        .single();

      if (receiptErr) {
        // MISIÓN RECEPCIONES: revertir productos creados si la cabecera falla
        // (antes quedaban huérfanos en el catálogo).
        if (createdProductIdList.length > 0) {
          await rollbackCreatedProducts(createdProductIdList);
        }
        // Defecto D-B: el 23505 de idx_receipts_store_reference_doc (factura
        // duplicada) debe reportarse como tal, no como error de SKU.
        if (receiptErr.code === '23505' || /idx_receipts_store_reference_doc|duplicate key|unique constraint/i.test(receiptErr.message)) {
          throw new Error(
            `ERR_INVOICE_DUPLICATE: el número de factura "${params.invoiceNumber}" ya existe en esta tienda. ` +
            'Cada recepción necesita un número de factura distinto.'
          );
        }
        throw new Error(`Error al guardar recepción pendiente: ${receiptErr.message}`);
      }
      if (!receipt) {
        if (createdProductIdList.length > 0) {
          await rollbackCreatedProducts(createdProductIdList);
        }
        throw new Error('No se pudo crear la recepción pendiente');
      }

      // 2. Insertar los items
      const itemsToInsert = allItems.map(item => ({
        receipt_id: receipt.id,
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        // FIX-P1-B: persistir campos multi-moneda
        moneda_recepcion: item.moneda_recepcion || 'CUP',
        tasa_cambio_recepcion: item.tasa_cambio_recepcion || 1.0,
      }));

      if (itemsToInsert.length > 0) {
        const { error: itemsErr } = await supabase
          .from('receipt_items')
          .insert(itemsToInsert);

        if (itemsErr) {
          await supabase.from('receipts').delete().eq('id', receipt.id);
          // MISIÓN RECEPCIONES: revertir también los productos creados para
          // esta recepción (antes la cabecera se borraba pero los productos
          // nuevos quedaban huérfanos en el catálogo).
          if (createdProductIdList.length > 0) {
            await rollbackCreatedProducts(createdProductIdList);
          }
          throw new Error(`Error al guardar items: ${itemsErr.message}`);
        }
      }

      return receipt.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

/**
 * M1 (Audit-Fix): Confirma una recepción pendiente usando RPC transaccional.
 *
 * Antes: hacía SELECT-then-UPDATE por cada item desde el cliente (race condition).
 * Ahora: llama a la RPC `confirm_pending_reception(receipt_id, user_id)` que:
 *   1. Bloquea la recepción con FOR UPDATE
 *   2. Por cada item, bloquea el producto con FOR UPDATE
 *   3. Calcula PMP atómicamente
 *   4. Registra stock_movement tipo 'reception_confirm'
 *   5. Marca la recepción como 'active'
 * Todo en una transacción atómica — no hay race condition posible.
 */
export function useConfirmPendingReception() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      receiptId: string;
      storeId: string;
      userId: string;
    }) => {
      const { error } = await supabase.rpc('confirm_pending_reception', {
        p_receipt_id: params.receiptId,
        p_user_id: params.userId,
      });

      if (error) throw new Error(`Error al confirmar recepción: ${error.message}`);
      return params.receiptId;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      queryClient.invalidateQueries({ queryKey: ['receipt-items', variables.receiptId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}

// ════════════════════════════════════════════════════════════════════════
// MISIÓN RECEPCIONES (2026-10-27) — Eliminar borrador de recepción.
//
// Defecto D-C: el historial solo ofrecía Anular (void_pending_reception,
// que conserva el registro como 'voided' para siempre). El usuario necesita
// ELIMINAR un borrador legítimo (status='pending', sin efectos de
// inventario) para descartar un intento fallido y comenzar de nuevo.
//
// La RPC delete_pending_reception (migración 20261027180000) ejecuta todo
// server-side de forma atómica: FOR UPDATE + guard de estado (solo
// 'pending') + autorización multitienda has_store_access_as + limpieza de
// líneas y cabecera + evento de auditoría. Las recepciones confirmadas
// (active), anuladas (voided) o revertidas (reversed) NO son eliminables —
// su rectificación es Revertir/Anular con trazabilidad.
// ════════════════════════════════════════════════════════════════════════
export function useDeletePendingReception() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      receiptId: string;
    }) => {
      const { data, error } = await supabase.rpc('delete_pending_reception', {
        p_receipt_id: params.receiptId,
      });

      if (error) {
        // Clasificar los errores de negocio esperados sin exponer detalles
        // del motor SQL al usuario.
        const msg = error.message || '';
        if (msg.includes('ERR_INVALID_STATUS')) {
          throw new Error(
            'Solo se pueden eliminar recepciones en estado Pendiente (borrador). ' +
            'Las confirmadas se revierten y las anuladas se conservan para auditoría.'
          );
        }
        if (msg.includes('ERR_UNAUTHORIZED')) {
          throw new Error('No tienes permisos para eliminar recepciones de esta tienda.');
        }
        if (msg.includes('ERR_RECEIPT_NOT_FOUND')) {
          throw new Error('La recepción no existe (¿ya fue eliminada?). Actualiza la lista.');
        }
        if (msg.includes('ERR_RECEIPT_HAS_MOVEMENTS') || msg.includes('ERR_RECEIPT_HAS_PAYMENTS')) {
          throw new Error('La recepción tiene efectos asociados; usa Revertir o Anular según corresponda.');
        }
        throw new Error(`Error al eliminar el borrador: ${msg}`);
      }
      return data;
    },
    onSuccess: (_, variables) => {
      // El borrador desaparece del listado, detalle y consultas dependientes
      // sin recargar la aplicación (misión §5.1).
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      queryClient.invalidateQueries({ queryKey: ['receipt-items', variables.receiptId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
