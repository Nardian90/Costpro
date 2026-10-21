"use client";

/**
 * POSCartItemEditModal — MISIÓN EDICIÓN-CARRITO (2026-10-21)
 *
 * Modal de edición de una línea del carrito de Vender:
 *   - Precio unitario APLICADO a la operación (editable). El precio maestro
 *     del catálogo se muestra SOLO como referencia y JAMÁS se modifica desde
 *     aquí: separación explícita precio-de-operación vs precio-maestro
 *     (regla central de la misión §2.B).
 *   - Cantidad (con guard de stock equivalente al de la línea, servicios
 *     exentos; cantidades fraccionarias admitidas — sin redondeos arbitrarios).
 *   - Descuento por línea (% o fijo) con el gate de supervisor ≥15%
 *     (useDiscountAuthorization + SupervisorAuthModal + scope {pid,vid,px}),
 *     idéntico al patrón de SalesCatalogCard/Table y al que valida el RPC
 *     create_sale_v2 server-side (autoridad definitiva).
 *   - Unidad de medida / variante vía switchItemVariant (fusión FIX-P1-3).
 *   - Importe de la línea recalculado en vivo con calculateItemSubtotal
 *     (misma semántica round2 del servidor).
 *
 * En modo Vale de Salida (isValeMode) NO se ofrece precio ni descuento: el
 * VS no registra cobros — su costo lo calcula el servidor (cost_average).
 *
 * Nada se committea al store hasta pulsar «Aplicar»; si una validación
 * falla, el draft local conserva los valores anteriores de la línea.
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Pencil,
  Tag,
  Package,
  Info,
  AlertTriangle,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import {
  useCartStore,
  effectiveUnitPrice,
  round2,
  type CartItem,
} from "@/store/cart";
import {
  useDiscountAuthorization,
  DISCOUNT_SUPERVISOR_THRESHOLD,
} from "./useDiscountAuthorization";
import { SupervisorAuthModal } from "./SupervisorAuthModal";
import type { SupervisorScopeEntry } from "./supervisor-auth-store";
import { BaseModal } from "@/components/ui/BaseModal";

interface POSCartItemEditModalProps {
  item: CartItem;
  open: boolean;
  isValeMode: boolean;
  onClose: () => void;
}

type DiscountType = "percentage" | "fixed" | null;

export function POSCartItemEditModal({
  item,
  open,
  isValeMode,
  onClose,
}: POSCartItemEditModalProps) {
  const product = item.product;
  const hasVariants = !!product?.product_variants && product.product_variants.length > 0;
  const isService = product?.is_service === true;

  // ── Draft local (nada se aplica al store hasta confirmar) ──
  const [priceDraft, setPriceDraft] = useState("");
  const [qtyDraft, setQtyDraft] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>(null);
  const [discountValueDraft, setDiscountValueDraft] = useState("");
  const [variantDraft, setVariantDraft] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);
  // Línea autorizada pendiente (scope del token de supervisor)
  const [pendingScope, setPendingScope] = useState<SupervisorScopeEntry | null>(null);

  // Gate de supervisor (mismo mecanismo que SalesCatalog / POSCartDiscountModal)
  const {
    showSupervisorAuth,
    pendingDiscount,
    pendingEffectivePercent,
    checkDiscount,
    cancelAuthorization,
    confirmAuthorization,
  } = useDiscountAuthorization();
  const pendingApplyRef = useRef<null | (() => void)>(null);

  // Reset del draft cada vez que se abre el modal (o cambia la línea base)
  useEffect(() => {
    if (open) {
      setPriceDraft(String(item.price ?? 0));
      setQtyDraft(String(item.quantity ?? 1));
      setDiscountType(item.discount_type ?? null);
      setDiscountValueDraft(
        item.discount_type && item.discount_value ? String(item.discount_value) : "",
      );
      setVariantDraft(item.variant_id ?? "");
      setErrors([]);
    }
  }, [open, item.product_id, item.variant_id, item.price, item.quantity, item.discount_type, item.discount_value]);

  // ── Datos derivados del draft ──
  const targetVariant = useMemo(
    () => (variantDraft ? product?.product_variants?.find((v) => v.id === variantDraft) ?? null : null),
    [variantDraft, product],
  );

  // Precio maestro de catálogo (SOLO referencia — nunca editable aquí):
  // misma fuente que usa el servidor (product_variants.price / products.price).
  const catalogPrice = targetVariant ? targetVariant.price || 0 : product?.price || 0;

  const parsedPrice = parseFloat(priceDraft.replace(",", "."));
  const parsedQty = parseFloat(qtyDraft.replace(",", "."));
  const parsedDiscount = discountType ? parseFloat(discountValueDraft.replace(",", ".")) || 0 : 0;

  const qtyValidNumber = Number.isFinite(parsedQty) && parsedQty > 0;
  const safeQty = qtyValidNumber ? parsedQty : (item.quantity || 1);
  const priceValidNumber = Number.isFinite(parsedPrice) && parsedPrice >= 0;
  const safePrice = priceValidNumber ? parsedPrice : (item.price || 0);

  // Importe de la línea con los datos del draft (cálculo canónico del store)
  const draftLineTotal = round2(
    effectiveUnitPrice(safePrice, safeQty, discountType, parsedDiscount) * safeQty,
  );

  // Precio unitario efectivo (tras descuento de línea) — es el «price_at_sale»
  // que el servidor compara contra el catálogo (gate ≥15%).
  const effectivePrice = effectiveUnitPrice(safePrice, safeQty, discountType, parsedDiscount);

  // Desvío efectivo respecto al precio de catálogo (solo rebajas cuentan,
  // idéntico a v_line_pct del RPC create_sale_v2).
  const deviationPct =
    catalogPrice > 0 && effectivePrice < catalogPrice
      ? ((catalogPrice - effectivePrice) / catalogPrice) * 100
      : 0;

  // Tope de stock con la variante destino (consistente con updateQuantity:
  // servicios exentos; fraccionarios permitidos hasta el máximo calculado)
  const targetFactor = targetVariant?.conversion_factor || 1;
  const safeFactor = targetFactor > 0 ? targetFactor : 1;
  const maxVariantQty = isService
    ? Number.MAX_SAFE_INTEGER
    : Math.floor((product?.stock_current ?? 999999) / safeFactor);

  // ¿La variante destino corresponde a OTRA línea existente? (fusión FIX-P1-3)
  const willMerge = useMemo(() => {
    if (!open) return false;
    const targetKey = variantDraft || "";
    if (targetKey === (item.variant_id ?? "")) return false;
    return useCartStore.getState().items.some(
      (it) => it.product_id === item.product_id && (it.variant_id || null) === (variantDraft || null),
    );
  }, [open, variantDraft, item.product_id, item.variant_id]);

  const needsSupervisor = deviationPct >= DISCOUNT_SUPERVISOR_THRESHOLD;

  // ── Commit: aplica el draft al store en orden seguro ──
  const commit = () => {
    const store = useCartStore.getState();
    const targetVariantId = variantDraft || null;

    // 1) Unidad/variante (puede fusionar líneas; la línea resultante queda
    //    identificable por product_id + targetVariantId)
    if (targetVariantId !== (item.variant_id ?? null)) {
      store.switchItemVariant(item.product_id, item.variant_id, targetVariantId);
    }
    // 2) Cantidad (el store clampea por stock y recalcula subtotal)
    if (qtyValidNumber && parsedQty !== item.quantity) {
      store.updateQuantity(item.product_id, targetVariantId, parsedQty);
    }
    // 3) Precio aplicado a la operación (NUNCA toca el precio maestro)
    if (!isValeMode && priceValidNumber && round2(parsedPrice) !== round2(item.price)) {
      store.updateItemPrice(item.product_id, targetVariantId, parsedPrice);
    }
    // 4) Descuento de línea
    if (!isValeMode) {
      const currentVal = item.discount_type && item.discount_value ? item.discount_value : 0;
      if (discountType !== (item.discount_type ?? null) || parsedDiscount !== currentVal) {
        store.updateItemDiscount(item.product_id, targetVariantId, discountType, parsedDiscount);
      }
    }
    toast.success("Producto actualizado");
    onClose();
  };

  // ── Validación + Apply (con gate de supervisor si corresponde) ──
  const handleApply = () => {
    const errs: string[] = [];

    if (!qtyValidNumber) {
      errs.push("La cantidad debe ser un número mayor que 0.");
    } else if (!isService && parsedQty > maxVariantQty) {
      errs.push(
        `Stock insuficiente: máximo ${maxVariantQty} ${targetVariant?.name || product?.unit_of_measure || "uds"} con las existencias actuales (${product?.stock_current ?? 0} uds base).`,
      );
    }

    if (!isValeMode) {
      if (!priceValidNumber) {
        errs.push("El precio debe ser un número mayor o igual a 0.");
      }
      if (discountType === "percentage" && (parsedDiscount < 0 || parsedDiscount > 100)) {
        errs.push("El descuento porcentual debe estar entre 0 y 100.");
      }
      if (discountType === "fixed" && parsedDiscount < 0) {
        errs.push("El descuento fijo no puede ser negativo.");
      }
      if (discountType === "fixed" && parsedDiscount > safePrice * safeQty) {
        errs.push("El descuento fijo no puede superar el importe de la línea.");
      }
      if (errs.length === 0 && needsSupervisor) {
        // El desvío efectivo ≥15% exige autorización de supervisor (misma
        // regla que aplica create_sale_v2 server-side). El scope viaja con
        // el precio unitario efectivo autorizado.
        const scopeEntry: SupervisorScopeEntry = {
          pid: item.product_id,
          vid: variantDraft || null,
          px: effectivePrice,
        };
        const requires = checkDiscount({
          type: "percentage",
          value: Number(deviationPct.toFixed(1)),
          referenceTotal: 0,
        });
        if (requires) {
          pendingApplyRef.current = commit;
          // scopeEntry se pasa al modal vía state local para estabilidad
          setPendingScope(scopeEntry);
          return;
        }
      }
    }

    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    commit();
  };

  const handleSupervisorAuthorize = () => {
    confirmAuthorization();
    const fn = pendingApplyRef.current;
    pendingApplyRef.current = null;
    setPendingScope(null);
    fn?.();
  };

  const handleSupervisorCancel = () => {
    pendingApplyRef.current = null;
    setPendingScope(null);
    cancelAuthorization();
    // El draft se conserva: el usuario puede corregir el precio o reintentar
  };

  if (!open) return null;

  return (
    <>
      <BaseModal
        open={open}
        onOpenChange={(o) => { if (!o) onClose(); }}
        title={
          <div className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />
            <span>Editar producto</span>
          </div>
        }
        description={product?.name}
        maxWidth="sm:max-w-lg"
      >
        <div className="space-y-4 py-2">
          {/* ── Unidad de medida / variante ── */}
          {hasVariants && (
            <div className="space-y-1.5">
              <label
                htmlFor="pos-item-edit-variant"
                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"
              >
                <Package className="w-3.5 h-3.5" />
                Unidad de venta
              </label>
              <select
                id="pos-item-edit-variant"
                value={variantDraft}
                onChange={(e) => setVariantDraft(e.target.value)}
                className="w-full h-11 rounded-lg border border-border bg-background px-3 text-xs font-bold"
              >
                <option value="">Unidad base ({product?.unit_of_measure || "unidad"})</option>
                {product?.product_variants?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — {formatCurrency(v.price)} (x{v.conversion_factor})
                  </option>
                ))}
              </select>
              {willMerge && (
                <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-start gap-1.5">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  Ya existe una línea con esa unidad: ambas se fusionarán y la
                  cantidad final será la que indiques aquí.
                </p>
              )}
            </div>
          )}

          {/* ── Cantidad ── */}
          <div className="space-y-1.5">
            <label
              htmlFor="pos-item-edit-qty"
              className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
            >
              Cantidad {isService ? "(servicio — sin tope de stock)" : `(máx. ${maxVariantQty})`}
            </label>
            <input
              id="pos-item-edit-qty"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={qtyDraft}
              onChange={(e) => setQtyDraft(e.target.value)}
              className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm font-bold tabular-nums"
            />
            {!isService && (
              <p className="text-[10px] text-muted-foreground">
                Existencias actuales: {product?.stock_current ?? 0} uds base
                {targetFactor !== 1 ? ` · factor de conversión x${targetFactor}` : ""}
              </p>
            )}
          </div>

          {isValeMode ? (
            /* ── Modo Vale: sin precio ni descuento ── */
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-xs">
                El <strong>Vale de Salida no registra precios de venta</strong>:
                solo descuenta productos del inventario. El costo lo calcula el
                servidor con el costo promedio del producto.
              </p>
            </div>
          ) : (
            <>
              {/* ── Precio maestro (SOLO referencia) ── */}
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Precio de catálogo (referencia)
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    Precio maestro del producto — no se modifica desde la venta.
                  </p>
                </div>
                <span className="text-sm font-black tabular-nums">
                  {formatCurrency(catalogPrice)} {item.currency !== "CUP" && item.currency}
                </span>
              </div>

              {/* ── Precio aplicado a ESTA venta ── */}
              <div className="space-y-1.5">
                <label
                  htmlFor="pos-item-edit-price"
                  className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5"
                >
                  <Tag className="w-3.5 h-3.5" />
                  Precio de esta venta
                </label>
                <input
                  id="pos-item-edit-price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={priceDraft}
                  onChange={(e) => setPriceDraft(e.target.value)}
                  className="w-full h-11 rounded-lg border-2 border-primary/30 bg-background px-3 text-sm font-black tabular-nums focus:border-primary/60 focus:outline-none"
                />
                <p className="text-[10px] text-muted-foreground">
                  Aplica <strong>solo a esta operación</strong>: el precio
                  maestro del catálogo queda intacto para futuras ventas.
                  {deviationPct > 0 && (
                    <span className={cn(
                      "ml-1 font-bold",
                      needsSupervisor ? "text-amber-600" : "text-muted-foreground",
                    )}>
                      (Rebaja efectiva: {deviationPct.toFixed(1)}%
                      {needsSupervisor ? " — requiere autorización de supervisor" : ""})
                    </span>
                  )}
                </p>
              </div>

              {/* ── Descuento de línea ── */}
              <div className="space-y-1.5">
                <label
                  htmlFor="pos-item-edit-disc-type"
                  className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
                >
                  Descuento de línea
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    id="pos-item-edit-disc-type"
                    value={discountType ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDiscountType(v === "" ? null : (v as "percentage" | "fixed"));
                      if (!v) setDiscountValueDraft("");
                    }}
                    className="h-11 rounded-lg border border-border bg-background px-2 text-xs font-bold"
                  >
                    <option value="">Sin descuento</option>
                    <option value="percentage">Porcentaje (%)</option>
                    <option value="fixed">Fijo ({item.currency || "CUP"})</option>
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step={discountType === "percentage" ? "1" : "0.01"}
                    value={discountValueDraft}
                    onChange={(e) => setDiscountValueDraft(e.target.value)}
                    disabled={!discountType}
                    placeholder={discountType ? "Valor" : "—"}
                    className="h-11 rounded-lg border border-border bg-background px-3 text-xs font-bold tabular-nums disabled:opacity-40"
                    aria-label="Valor del descuento"
                  />
                </div>
                {discountType === "percentage" && parsedDiscount >= DISCOUNT_SUPERVISOR_THRESHOLD && (
                  <p className="text-[10px] text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Descuento ≥{DISCOUNT_SUPERVISOR_THRESHOLD}%: se pedirá autorización de supervisor.
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── Importe de la línea (vivo) ── */}
          <div className="flex items-center justify-between rounded-lg border-2 border-primary/20 bg-primary/5 px-3 py-2.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-primary">
              Importe de la línea
            </span>
            <span className="text-lg font-black tabular-nums text-primary">
              {isValeMode
                ? `×${safeQty} ${targetVariant?.name || product?.unit_of_measure || ""}`
                : formatCurrency(draftLineTotal)}
            </span>
          </div>

          {/* ── Errores de validación ── */}
          {errors.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 space-y-1">
              {errors.map((err, i) => (
                <p key={i} className="text-[10px] text-destructive font-medium flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  {err}
                </p>
              ))}
              <p className="text-[9px] text-muted-foreground">
                Los valores de la línea no se han modificado.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => { setErrors([]); onClose(); }}
            className="flex-1 h-11 rounded-xl border border-border bg-background text-xs font-black uppercase tracking-widest hover:bg-muted/50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-[0.98]"
          >
            Aplicar
          </button>
        </div>
      </BaseModal>

      {/* ── Autorización de supervisor (gate ≥15%) ── */}
      <SupervisorAuthModal
        isOpen={showSupervisorAuth}
        onClose={handleSupervisorCancel}
        onAuthorize={handleSupervisorAuthorize}
        discountPercent={pendingEffectivePercent}
        discountValue={pendingDiscount?.value || 0}
        maxAllowed={DISCOUNT_SUPERVISOR_THRESHOLD}
        discountType={pendingDiscount?.type}
        scopeEntry={pendingScope}
      />
    </>
  );
}
