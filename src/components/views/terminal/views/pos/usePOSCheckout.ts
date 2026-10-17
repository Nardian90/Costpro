"use client";

import { useState, useCallback, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { useCartStore } from "@/store/cart";
import { effectiveUnitPrice } from "@/store/cart";
import { useAuthStore } from "@/store";
import { useInvertDocument } from "@/hooks/api/useDocumentActions";
import { canUndoSaleInStore } from "@/lib/roles";
import { PaymentMethod } from "@/types";
import { getSupervisorAuth, clearSupervisorAuth } from "./supervisor-auth-store";
import type { LastSale } from "./POSCart.types";
// MISIÓN-FLEX (2026-10-17): incidencias de pago — flexibilización temporal
// de validaciones (faltante/sobrepago/desglose descuadrado ya NO bloquean;
// se informan, se registran en la venta y quedan visibles en Auditoría).
import {
  computePaymentIncidents,
  buildRateDifferenceIncident,
  buildIncidentToastMessage,
  type PaymentIncident,
} from "@/lib/pos/payment-incidents";
import { auditService } from "@/services/audit-service";
import type { CartItem } from "@/store/cart";
// MISIÓN FECHA OPERATIVA (2026-10-17): fecha económica seleccionable en Vender.
// resolvePosOperationDate → ISO mediodía SOLO si la fecha elegida ≠ hoy (Habana);
// hoy/null → undefined (el servidor estampa NOW(), comportamiento canónico intacto).
import { resolvePosOperationDate, checkNotFutureOperationDate } from "@/lib/pos/operation-date";

export function usePOSCheckout() {
  const { user } = useAuthStore();
  const [showPriceWarning, setShowPriceWarning] = useState(false);
  const [lastSale, setLastSale] = useState<LastSale | null>(null);
  const [pendingCheckoutData, setPendingCheckoutData] = useState<{
    paymentMethod: PaymentMethod;
    discount: { type: "fixed" | "percentage"; value: number } | null;
  } | null>(null);
  // FIX-EXCHANGE-VALIDATION: modal custom de advertencia de tasa (no window.confirm)
  const [showRateWarning, setShowRateWarning] = useState(false);
  const [rateWarningData, setRateWarningData] = useState<{
    totalCup: number;
    totalPaidCup: number;
    diff: number;
    pctDiff: number;
    usdRate: number;
    currentRates: Record<string, number>;
  } | null>(null);

  // POS-2 MM-9: Referencia al ID del toast activo para poder dismissarlo
  // si el usuario hace otra venta antes de que expire la ventana de undo.
  const undoToastIdRef = useRef<string | number | null>(null);

  const {
    items,
    clearCart,
    getSubtotal,
    getDiscountAmount,
    getTotal,
    discount,
  } = useCartStore(
    useShallow((state) => ({
      items: state.items,
      clearCart: state.clearCart,
      getSubtotal: state.getSubtotal,
      getDiscountAmount: state.getDiscountAmount,
      getTotal: state.getTotal,
      discount: state.discount,
    })),
  );

  // FINALIZE-V2: useCreateSale (RPC V1 create_sale) eliminado del checkout
  // online — el estado de procesamiento ahora es local al hook (guard
  // anti doble-submit + UX del botón), sin depender del mutation V1.
  const [isProcessingSale, setIsProcessingSale] = useState(false);

  // POS-2 MM-9: Hook de anulación para soportar "Deshacer venta".
  const { mutateAsync: invertSale } = useInvertDocument();

  const processCheckout = useCallback(
    async (
      paymentMethod: PaymentMethod,
      checkoutDiscount?: {
        type: "fixed" | "percentage";
        value: number;
      } | null,
      // MISIÓN-FLEX: datos del modal "Descuadre de tasa" cuando el cajero
      // confirmó continuar con la diferencia (se registra como incidencia).
      checkoutOpts?: {
        rateWarning?: { totalCup: number; totalPaidCup: number } | null;
      } | null,
    ) => {
      if (!user?.activeStoreId || !user?.id) return;

      // ── MISIÓN FECHA OPERATIVA (2026-10-17): guard de fecha en cliente ──
      // La fecha seleccionada en Vender (cart store saleDate) viaja al servidor
      // SOLO cuando es distinta de hoy (Habana). Si el usuario eligió una fecha
      // futura (p.ej. reloj del navegador adelantado o edición manual), se
      // aborta ANTES de llamar al servidor — el servidor revalida igualmente
      // (checkNotFutureOperationDate en la ruta + validate_operation_date en BD).
      // El carrito NO se toca: el usuario corrige la fecha y reintenta (misión §4.4/§8).
      const saleDateSelected = useCartStore.getState().saleDate;
      const operationDateIso = resolvePosOperationDate(saleDateSelected);
      if (operationDateIso) {
        const futureCheck = checkNotFutureOperationDate(operationDateIso);
        if (!futureCheck.ok) {
          toast.error(futureCheck.error, { duration: 7000 });
          return;
        }
      }

      // FIX P1: Idempotencia — generar key ANTES de procesar, reutilizar en retries.
      // Antes: se generaba dentro de createSale con Date.now()+Math.random()
      // lo que permitía doble-submit crear 2 ventas. Ahora la key se genera
      // una sola vez por intento de checkout y se reutiliza en todos los retries.

      try {
        setIsProcessingSale(true);
        const cartState = useCartStore.getState();
        const customerId = cartState.customerId;
        const customerName = cartState.customerName;
        const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const safeCustomerId =
          customerId && validUuid.test(customerId) ? customerId : null;

        // FIX-B6 (2026-07-10): unificar conversiones usando getItemPaidCup del store
        // FIX-PAYMENT-ROWS (2026-07-10): usar getExpectedTotalCup() que considera ajustes por método.
        // Antes: getTotalCup() que ya NO resta descuento global fantasma (delegaba en getExpectedTotalCup).
        // Ahora: usar directamente getExpectedTotalCup() para consistencia con tab Pago.
        const totalAmountCup = cartState.getExpectedTotalCup();

        // MISIÓN-FLEX (2026-10-17): incidencias de pago del carrito (puras).
        // Una venta exacta → [] (payload canónico intacto). Con diferencias,
        // las incidencias viajan al RPC para registrar la venta SIN bloquear
        // al cajero, con nota automática y evento SALE_PAYMENT_INCIDENT.
        const flexIncidents: PaymentIncident[] = computePaymentIncidents({
          items,
          discount: checkoutDiscount || discount || null,
          getItemPaidCup: (i) => cartState.getItemPaidCup(i as CartItem),
        });
        // Diferencia de tasa aceptada por el cajero en el modal "Descuadre de tasa".
        if (checkoutOpts?.rateWarning
          && Math.abs(checkoutOpts.rateWarning.totalPaidCup - checkoutOpts.rateWarning.totalCup) > 0.01) {
          flexIncidents.push(buildRateDifferenceIncident(
            checkoutOpts.rateWarning.totalCup,
            checkoutOpts.rateWarning.totalPaidCup,
          ));
        }
        const hasFlexIncidents = flexIncidents.length > 0;

        // Sumas reales por método (filas de pago por item, convertidas a CUP)
        // — la fuente de lo REALMENTE recibido. Con flexibilización, los
        // métodos simples también reportan lo recibido (no el total).
        const cashRowsCup = items.reduce((s, i) => {
          // FIX-PAYMENT-ROWS: sumar todas las filas cash de payments[]
          if (i.payments && i.payments.length > 0) {
            return s + i.payments
              .filter(p => p.method === 'cash')
              .reduce((ps, p) => {
                const rate = cartState.globalRates[p.currency || 'CUP'] || (p.currency === i.currency ? (i.exchange_rate || 1) : 1);
                return ps + (p.amount || 0) * (p.currency === 'CUP' ? 1 : rate);
              }, 0);
          }
          const rate = cartState.globalRates[i.cash_currency || 'CUP'] || (i.cash_currency === i.currency ? (i.exchange_rate || 1) : 1);
          return s + (i.cash_paid || 0) * (i.cash_currency === 'CUP' ? 1 : rate);
        }, 0);
        const transferRowsCup = items.reduce((s, i) => {
          if (i.payments && i.payments.length > 0) {
            return s + i.payments
              .filter(p => p.method === 'transfer')
              .reduce((ps, p) => {
                const rate = cartState.globalRates[p.currency || 'CUP'] || (p.currency === i.currency ? (i.exchange_rate || 1) : 1);
                return ps + (p.amount || 0) * (p.currency === 'CUP' ? 1 : rate);
              }, 0);
          }
          const rate = cartState.globalRates[i.transfer_currency || 'CUP'] || (i.transfer_currency === i.currency ? (i.exchange_rate || 1) : 1);
          return s + (i.transfer_paid || 0) * (i.transfer_currency === 'CUP' ? 1 : rate);
        }, 0);
        const zelleRowsCup = items.reduce((s, i) => {
          if (i.payments && i.payments.length > 0) {
            return s + i.payments
              .filter(p => p.method === 'zelle')
              .reduce((ps, p) => {
                const rate = cartState.globalRates[p.currency || 'USD'] || cartState.globalRates['USD'] || (i.exchange_rate || 1);
                return ps + (p.amount || 0) * (p.currency === 'CUP' ? 1 : rate);
              }, 0);
          }
          const rate = cartState.globalRates[i.zelle_currency || 'USD'] || cartState.globalRates['USD'] || (i.exchange_rate || 1);
          return s + (i.zelle_paid || 0) * (i.zelle_currency === 'CUP' ? 1 : rate);
        }, 0);

        const cashAmountCup = paymentMethod === 'cash'
          ? (hasFlexIncidents ? cashRowsCup : totalAmountCup)
          : paymentMethod === 'mixed' ? cashRowsCup : 0;
        const transferAmountCup = paymentMethod === 'transfer'
          ? (hasFlexIncidents ? transferRowsCup : totalAmountCup)
          : paymentMethod === 'mixed' ? transferRowsCup : 0;
        const zelleAmountCup = paymentMethod === 'zelle'
          ? (hasFlexIncidents ? zelleRowsCup : totalAmountCup)
          : paymentMethod === 'mixed' ? zelleRowsCup : 0;

        const cashAmount = cashAmountCup;
        const transferAmount = transferAmountCup;
        const zelleAmount = zelleAmountCup;

        // MISIÓN-FLEX: la defensa anti-descuadre (antes: throw) ya NO interrumpe
        // el flujo — computePaymentIncidents documentó la diferencia (por línea
        // y global) y el servidor la valida con las mismas incidencias.

        // FINALIZE-V2: create_sale_v2 es el ÚNICO camino de venta (path V1 con
        // RPC directo create_sale eliminado — ver migración 20261005140000).
        // El checkout POS es online (fetch /api/pos/checkout); la capacidad
        // offline vive en useSalesCatalog (enqueue → replay create_sale_v2 vía
        // /api/sync/batch).
        let saleId: string;

        {
          // ── Path canónico V2: POST /api/pos/checkout (recálculo server-side + supervisor auth) ──
          // REM-INV-4A-R (RC-1): consume the supervisor authorization captured
          // by SupervisorAuthModal (bound to operator+store, short TTL).
          const supervisorAuth = getSupervisorAuth();
          const response = await fetch('/api/pos/checkout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // FIX-FASE-D (checkout V2 → 401): withAuth es fail-closed (SEC-024) y
              // SOLO acepta Bearer token. El fetch crudo jamás enviaba el header →
              // TODOS los checkouts V2 fallaban con 401. apiFetch no se usa aquí
              // porque se necesita el Response crudo para mapear errores del RPC.
              ...(useAuthStore.getState().token
                ? { Authorization: `Bearer ${useAuthStore.getState().token}` }
                : {}),
            },
            body: JSON.stringify({
              store_id: user.activeStoreId,
              seller_id: user.id,
              payment_method: paymentMethod,
              discount_type: (checkoutDiscount || discount)?.type || 'fixed',
              discount_value: getDiscountAmount(),
              applied_taxes: useCartStore.getState().appliedTaxes || [],
              tax_amount: useCartStore.getState().getTaxAmount(),
              total_amount: useCartStore.getState().getExpectedTotalCup(),
              subtotal: useCartStore.getState().getSubtotalCup(),
              cash_amount: cashAmount,
              transfer_amount: transferAmount,
              zelle_amount: zelleAmount,
              // PR-4.4I: Zelle currency + rate (USD with rate, or CUP if no Zelle)
              sale_currency: zelleAmount > 0 ? 'USD' : 'CUP',
              sale_exchange_rate: zelleAmount > 0 ? (useCartStore.getState().saleExchangeRate > 1 ? useCartStore.getState().saleExchangeRate : 680) : 1.0,
              customer_id: safeCustomerId,
              customer_name: customerName || null,
              // REM-INV-4A-R (RC-1): forward the server-issued supervisor authorization
              // (validated + signed at /api/auth/supervisor-check) when present.
              supervisor_user_id: supervisorAuth?.userId ?? null,
              supervisor_token: supervisorAuth?.token ?? null,
              // E-SEC-FINAL (D2): motivo del descuento autorizado. El RPC lo exige
              // server-side solo cuando el gate ≥15% dispara y lo persiste en la
              // auditoría asociado a la línea/operación autorizada.
              discount_reason: supervisorAuth?.reason || null,
              // MISIÓN-FLEX: incidencias de pago estructuradas. Solo se envían
              // cuando existen — la venta exacta mantiene el payload canónico
              // (compatible con RPC sin migrar, que las ignora).
              ...(hasFlexIncidents ? { payment_incidents: flexIncidents } : {}),
              // MISIÓN FECHA OPERATIVA: fecha económica elegida en Vender.
              // undefined cuando la fecha es hoy/null → NOW() del servidor
              // (ventas del día idénticas al flujo anterior: arqueo por ventana,
              // orden del ledger y timestamps reales sin cambios).
              ...(operationDateIso ? { operation_date: operationDateIso } : {}),
              idempotency_key: `sale-${crypto.randomUUID()}`,
              items: items.map((i) => ({
                product_id: i.product_id,
                variant_id: i.variant_id ?? null,
                quantity: i.quantity,
                // E-SEC (R-SEC-1): enviar el precio unitario REALMENTE cobrado
                // (tras el descuento comercial por línea). Antes se enviaba el
                // precio de catálogo crudo con el total ya descontado →
                // ERR_TOTAL_MISMATCH en toda venta con descuento por ítem. Con
                // el precio efectivo el payload es coherente y el servidor
                // valida el desvío contra el catálogo (gate >=15%).
                price: effectiveUnitPrice(i.price, i.quantity, i.discount_type, i.discount_value),
                cost: i.cost,
                cash_paid: i.cash_paid,
                transfer_paid: i.transfer_paid,
                zelle_paid: i.zelle_paid || 0,
                currency: i.currency || 'CUP',
                exchange_rate: i.exchange_rate || 1.0,
                cash_currency: i.cash_currency || 'CUP',
                transfer_currency: i.transfer_currency || 'CUP',
                zelle_currency: i.zelle_currency || 'USD',
                cash_discount_type: i.cash_discount_type || null,
                cash_discount_value: i.cash_discount_value || 0,
                cash_discount_currency: i.cash_discount_currency || 'CUP',
                transfer_discount_type: i.transfer_discount_type || null,
                transfer_discount_value: i.transfer_discount_value || 0,
                transfer_discount_currency: i.transfer_discount_currency || 'CUP',
                zelle_discount_type: i.zelle_discount_type || null,
                zelle_discount_value: i.zelle_discount_value || 0,
                zelle_discount_currency: i.zelle_discount_currency || 'USD',
              })),
            }),
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(err.error || `HTTP ${response.status}`);
          }
          const data = await response.json();
          saleId = data.transaction_id;
          // REM-INV-4A-R (RC-1): single sale per supervisor authorization.
          clearSupervisorAuth();
          // v2: customer_id is already persisted atomically — no UPDATE needed
        }

        // FINALIZE-V2: el bloque de parche customer_id (path v1) fue eliminado —
        // create_sale_v2 persiste customer_id/customer_name atómicamente.

        // POS-2 MM-9: Capturar items + saleId ANTES de clearCart
        // para poder deshacer la venta si el usuario lo pide en 30s.
        const soldItemsSnapshot = items.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id ?? null,
          quantity: i.quantity,
          price: i.price,
          cost: i.cost,
          cash_paid: i.cash_paid,
          transfer_paid: i.transfer_paid,
          unit_cost: i.cost,
          cost_at_sale: i.cost,
        }));
        const storeIdForUndo = user.activeStoreId;

        setLastSale({
          id: saleId,
          items: items.map((i) => ({
            product: { name: i.product?.name || "Producto" },
            quantity: i.quantity,
            price: i.price,
            subtotal: i.subtotal,
          })),
          subtotal: getSubtotal(),
          total: getTotal(),
          discount: discount || null,
          paymentMethod: paymentMethod as string,
          date: new Date().toISOString(),
          // POS-3b audit P0.1: incluir cliente en el success view.
          customerName: customerName || undefined,
        });
        clearCart();
        // MISIÓN-FLEX: la venta con incidencia NUNCA se presenta como
        // totalmente pagada — toast diferenciado con el detalle.
        if (hasFlexIncidents) {
          toast.warning("Venta registrada CON INCIDENCIA DE PAGO", {
            description: `${buildIncidentToastMessage(flexIncidents) || "Diferencia de pago"}. Reflejada en Inicio → OPERACIÓN → Auditoría.`,
            duration: 8000,
          });
        }
        toast.success(
          customerName
            ? `Venta a ${customerName} completada`
            : "Venta completada con éxito",
        );

        // POS-2 MM-9: Toast con acción "Deshacer" (30s).
        // Si el usuario hace clic, llamamos a useInvertDocument con los items
        // snapshotados (evita un round-trip extra al servidor).
        // W9.5 B-8 (MODELO C Nivel 1): el toast "Deshacer" solo se ofrece a
        // operadores POS (admin/manager/encargado/clerk en la tienda). La DB
        // re-valida ownership + ventana 30s + rol en void_transaction.
        if (undoToastIdRef.current !== null) {
          toast.dismiss(undoToastIdRef.current);
        }
        if (canUndoSaleInStore(user, storeIdForUndo)) {
          undoToastIdRef.current = toast("Venta registrada", {
            description: "¿Te equivocaste? Tienes 30s para deshacerla.",
            duration: 30000,
            action: {
              label: "Deshacer",
              onClick: async () => {
                try {
                  toast.loading("Deshaciendo venta...", { id: "undo-loading" });
                  await invertSale({
                    type: "sale",
                    id: saleId,
                    items: soldItemsSnapshot,
                    storeId: storeIdForUndo,
                  });
                  toast.dismiss("undo-loading");
                  setLastSale(null);
                  toast.success("Venta deshecha y stock restaurado");
                } catch (err: unknown) {
                  toast.dismiss("undo-loading");
                  const rawMsg = err instanceof Error ? err.message : "error desconocido";
                  const friendly = rawMsg.includes("ERR_UNAUTHORIZED")
                    ? "No puedes deshacer esta venta: debe ser propia, dentro de los 30s y con rol de operador POS."
                    : rawMsg;
                  toast.error(
                    "No se pudo deshacer: " + friendly,
                    { duration: 6000 },
                  );
                }
              },
            },
          });
        }
      } catch (err: unknown) {
        // FIX-B9 (2026-07-10): traducir errores crudos de Postgres/Supabase
        const rawMsg = err instanceof Error ? err.message : 'Error desconocido';
        const lowMsg = rawMsg.toLowerCase();
        let friendlyMsg = rawMsg;
        if (lowMsg.includes('err_insufficient_stock')) {
          const product = rawMsg.split(':')[1]?.trim() || 'producto';
          friendlyMsg = `Stock insuficiente: ${product}`;
        } else if (lowMsg.includes('err_payment_mismatch')) {
          friendlyMsg = 'Los pagos no cuadran con el total de la venta. Revisa el desglose.';
        } else if (lowMsg.includes('err_product_not_found')) {
          friendlyMsg = 'Un producto del carrito ya no existe. Recarga la página.';
        } else if (lowMsg.includes('err_backdated_document')) {
          friendlyMsg = 'Fecha de operación fuera de rango: no puede ser anterior al límite histórico (6 meses) ni a la secuencia operativa de la tienda. Ajusta la fecha de venta e intenta de nuevo.';
        } else if (lowMsg.includes('err_future_dated_document')) {
          friendlyMsg = 'La fecha de operación no puede ser futura. Ajusta la fecha de venta e intenta de nuevo.';
        } else if (lowMsg.includes('operation_date') && lowMsg.includes('no puede ser posterior')) {
          friendlyMsg = rawMsg;
        } else if (lowMsg.includes('unauthorized') || lowMsg.includes('rls') || lowMsg.includes('42501')) {
          friendlyMsg = 'No tienes permisos para vender en esta tienda.';
        } else if (lowMsg.includes('network') || lowMsg.includes('fetch')) {
          friendlyMsg = 'Error de conexión. Verifica tu internet e intenta de nuevo.';
        }
        toast.error(friendlyMsg);
      } finally {
        setIsProcessingSale(false);
      }
    },
    [
      user,
      invertSale,
      items,
      getSubtotal,
      getDiscountAmount,
      getTotal,
      discount,
      clearCart,
    ],
  );

  const startCheckout = useCallback(
    async (
      paymentMethod: PaymentMethod,
      checkoutDiscount?: {
        type: "fixed" | "percentage";
        value: number;
      } | null,
    ) => {
      if (isProcessingSale) return;

      // ── VALIDACIÓN DE STOCK: impedir overselling (stock negativo) ──
      // FIX-G10: multiplicar cantidad por conversion_factor de la variante
      // antes de comparar con stock_current. Vender 1 docena = 12 unidades.
      const itemsByProduct = new Map<string, { productName: string; totalQty: number; stock: number }>();
      for (const item of items) {
        const pid = item.product.id;
        const existing = itemsByProduct.get(pid) || { productName: item.product.name, totalQty: 0, stock: item.product.stock_current ?? 0 };
        // FIX-G10: convertir cantidad a unidades base usando conversion_factor
        const conversionFactor = item.variant?.conversion_factor || 1;
        existing.totalQty += item.quantity * conversionFactor;
        itemsByProduct.set(pid, existing);
      }
      const insufficientStock: string[] = [];
      for (const [pid, info] of itemsByProduct) {
        if (info.totalQty > info.stock) {
          insufficientStock.push(`${info.productName}: pedido ${info.totalQty}, stock ${info.stock}`);
        }
      }
      if (insufficientStock.length > 0) {
        toast.error(`Stock insuficiente para: ${insufficientStock.slice(0, 3).join('; ')}${insufficientStock.length > 3 ? ` (+${insufficientStock.length - 3} más)` : ''}`, { duration: 6000 });
        return;
      }

      // POS-2 MM-8 / MISIÓN 2026-10-17: el total ≤ 0 SIGUE bloqueando el
      // checkout (regla innegociable: una venta negativa jamás se aprueba).
      // getTotal() acota a 0; por eso el guard se extiende a
      // getExpectedTotalCup() (sin acotar) para detectar totales negativos
      // por recargos/descuentos corruptos: se rechaza y la INTENCIÓN queda
      // registrada en Auditoría (sale_negative_rejected, fuente cliente).
      const total = getTotal();
      const guardState = useCartStore.getState();
      const expectedTotalGuard = guardState.getExpectedTotalCup();
      if (total <= 0 || expectedTotalGuard < 0) {
        if (expectedTotalGuard < 0 || total < 0) {
          toast.error(
            `Venta con total negativo (${expectedTotalGuard.toFixed(2)} CUP) rechazada: no se aprueba ni se registra como venta. La operación quedó documentada en Auditoría.`,
            { duration: 7000 },
          );
          void auditService.logNegativeSaleAttempt({
            userId: user?.id || "",
            storeId: user?.activeStoreId || "",
            total: expectedTotalGuard < 0 ? expectedTotalGuard : total,
            itemCount: items.length,
            source: "client",
          });
          return;
        }
        toast.error("No se puede cobrar un total de 0. Agrega productos al carrito.");
        return;
      }

      // MISIÓN-FLEX (2026-10-17): flexibilización TEMPORAL de diferencias de
      // pago. Faltante, sobrepago y descuadre del desglose ya NO bloquean el
      // checkout: se informan y las incidencias viajan al RPC, que las
      // persiste (nota + payment_incidents + Auditoría). Fail-closed: si un
      // ítem USD/EUR no tiene tasa REAL (≤ 1.0) la diferencia NO es validable
      // (p. ej. carrito sin tasas hidratadas) y SE CONSERVA el bloqueo
      // canónico — no se registra una venta con matemática rota.
      const cartSt = useCartStore.getState();
      const shouldCheckBreakdown =
        paymentMethod === "mixed"
        || items.some(i => i.cash_paid > 0 || i.transfer_paid > 0 || (i.payments?.length ?? 0) > 0);
      if (shouldCheckBreakdown) {
        const effectiveItemRate = (i: typeof items[number]): number => {
          const cur = (i.currency || "CUP").toUpperCase();
          if (cur === "CUP") return 1;
          const storeRate = cartSt.globalRates[cur];
          if (storeRate && storeRate > 0) return storeRate;
          return i.exchange_rate || 1;
        };
        const unrateableItem = items.find(
          i => ["USD", "EUR"].includes((i.currency || "CUP").toUpperCase())
            && effectiveItemRate(i) <= 1.0,
        );
        if (unrateableItem) {
          const name = unrateableItem.product?.name || "Un producto";
          toast.error(`Pago mixto descuadrado en "${name}". Revisa el desglose efectivo/transferencia/Transf. Exterior.`, {
            duration: 6000,
            action: {
              label: "Ver carrito",
              onClick: () => {/* el carrito ya está visible al estar cobrando */},
            },
          });
          return;
        }

        const computedIncidents = computePaymentIncidents({
          items,
          discount,
          getItemPaidCup: (i) => cartSt.getItemPaidCup(i as CartItem),
        });
        if (computedIncidents.length > 0) {
          // NO bloquea: informa y continúa. El detalle viaja en el payload y
          // el servidor re-valida (fail-closed sin incidencias).
          const msg = buildIncidentToastMessage(computedIncidents);
          toast.warning(
            `Venta con diferencia de pago: ${msg}. Se registrará como incidencia en Auditoría.`,
            { duration: 6000 },
          );
        }
      }

      // FIX-EXCHANGE-VALIDATION (2026-07-06): validar que los pagos en múltiples
      // monedas cuadren con el total usando tasas (manuales primero, luego API).
      // Si diferencia > 2%, abrir modal custom (NO window.confirm) para:
      // 1. Mostrar detalles del descuadre
      // 2. Permitir editar tasas manualmente (se arrastran via globalRates)
      // 3. Confirmar o cancelar
      const cartState = useCartStore.getState();
      // FIX-B8 (2026-07-10): ampliar detección multi-moneda
      const hasMultiCurrency = paymentMethod === 'mixed'
        || items.some(i => i.currency && i.currency !== 'CUP')
        || items.some(i => i.zelle_paid && i.zelle_paid > 0)
        || items.some(i => i.cash_currency && i.cash_currency !== 'CUP' && i.cash_paid > 0)
        || items.some(i => i.transfer_currency && i.transfer_currency !== 'CUP' && i.transfer_paid > 0)
        || paymentMethod === 'zelle';

      if (hasMultiCurrency) {
        try {
          // FIX-GLOBAL-RATES: usar tasas manuales si existen, si no fetch API
          let usdToCupRate = cartState.globalRates['USD'] || 0;

          if (usdToCupRate === 0) {
            // Fetch tasa informal
            const rateRes = await fetch('/api/exchange-rates?currency=USD&source=elToque&days=1');
            if (rateRes.ok) {
              const rateData = await rateRes.json();
              if (rateData.rates && rateData.rates.length > 0) {
                usdToCupRate = parseFloat(rateData.rates[0].rate) || 0;
              }
            }
            // Fallback BCC
            if (usdToCupRate === 0) {
              const bccRes = await fetch('/api/exchange-rates?currency=USD&source=BCC&segment=3&days=1');
              if (bccRes.ok) {
                const bccData = await bccRes.json();
                if (bccData.rates && bccData.rates.length > 0) {
                  usdToCupRate = parseFloat(bccData.rates[0].rate) * 1.15 || 0;
                }
              }
            }
          }

          if (usdToCupRate > 0) {
            // FIX-PAYMENT-ROWS (2026-07-10): usar getExpectedTotalCup() para consistencia
            const totalCup = cartState.getExpectedTotalCup();
            // Calcular total pagado en CUP usando getItemPaidCup (que ya itera payments[])
            const totalPaidCup = items.reduce((s, i) => s + cartState.getItemPaidCup(i), 0);

            const diff = Math.abs(totalPaidCup - totalCup);
            const pctDiff = totalCup > 0 ? (diff / totalCup) * 100 : 0;

            if (pctDiff > 2) {
              // Abrir modal custom con datos del descuadre
              setRateWarningData({
                totalCup,
                totalPaidCup,
                diff,
                pctDiff,
                usdRate: usdToCupRate,
                currentRates: { ...cartState.globalRates, USD: usdToCupRate },
              });
              setShowRateWarning(true);
              // Guardar pending data para reanudar después de que el usuario decida
              setPendingCheckoutData({ paymentMethod, discount: checkoutDiscount || null });
              return; // Pausar checkout hasta que el usuario decida
            }
          }
        } catch (e) {
          // Si no se puede obtener la tasa, no bloquear la venta
          console.warn('No se pudo validar la tasa de cambio:', e);
        }
      }

      const hasUnpriced = items.some((item) => (item.price || 0) <= 0);
      if (hasUnpriced) {
        setPendingCheckoutData({
          paymentMethod,
          discount: checkoutDiscount || null,
        });
        setShowPriceWarning(true);
        return;
      }
      await processCheckout(paymentMethod, checkoutDiscount);
    },
    [isProcessingSale, items, getTotal, processCheckout, discount],
  );

  const confirmUnpricedCheckout = useCallback(async () => {
    setShowPriceWarning(false);
    if (pendingCheckoutData) {
      await processCheckout(
        pendingCheckoutData.paymentMethod,
        pendingCheckoutData.discount,
      );
      setPendingCheckoutData(null);
    }
  }, [pendingCheckoutData, processCheckout]);

  // FIX-EXCHANGE-VALIDATION: handlers del modal de advertencia de tasa
  // MISIÓN-FLEX: al confirmar el modal con diferencia, esta viaja a
  // processCheckout como incidencia 'rate_difference' (trazable en Auditoría).
  const confirmRateWarning = useCallback(async () => {
    setShowRateWarning(false);
    if (pendingCheckoutData) {
      await processCheckout(
        pendingCheckoutData.paymentMethod,
        pendingCheckoutData.discount,
        rateWarningData
          ? { rateWarning: { totalCup: rateWarningData.totalCup, totalPaidCup: rateWarningData.totalPaidCup } }
          : undefined,
      );
      setPendingCheckoutData(null);
      setRateWarningData(null);
    }
  }, [pendingCheckoutData, processCheckout, rateWarningData]);

  const cancelRateWarning = useCallback(() => {
    setShowRateWarning(false);
    setRateWarningData(null);
    setPendingCheckoutData(null);
  }, []);

  // FIX-GLOBAL-RATES: actualizar tasa manual desde el modal (se arrastra)
  const updateRateFromModal = useCallback((currency: string, rate: number) => {
    useCartStore.getState().setGlobalRate(currency, rate);
    if (rateWarningData) {
      setRateWarningData({ ...rateWarningData, currentRates: { ...rateWarningData.currentRates, [currency]: rate } });
    }
  }, [rateWarningData]);

  return {
    // Checkout
    startCheckout,
    confirmUnpricedCheckout,
    processCheckout,
    isProcessingSale,

    // Modals
    showPriceWarning,
    setShowPriceWarning,
    // FIX-EXCHANGE-VALIDATION: modal de tasa
    showRateWarning,
    rateWarningData,
    confirmRateWarning,
    cancelRateWarning,
    updateRateFromModal,

    // Sale result
    lastSale,
    setLastSale,
  };
}
