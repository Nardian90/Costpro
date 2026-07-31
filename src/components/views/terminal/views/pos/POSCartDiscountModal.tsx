"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { POSCartDiscountProps } from "./POSCart.types";
import { SupervisorAuthModal } from "./SupervisorAuthModal";
import {
  useDiscountAuthorization,
  DISCOUNT_SUPERVISOR_THRESHOLD,
} from "./useDiscountAuthorization";

// FIX-BPOS-010: Contextual quick-select values per discount type
const PERCENTAGE_PRESETS = [0, 5, 10, 15, 20];
const FIXED_PRESETS = [0, 5, 10, 20, 50];

export const POSCartDiscountModal = ({
  discount,
  setDiscount,
  getTotal,
}: POSCartDiscountProps) => {
  const isPercentage = discount?.type === "percentage";
  const presets = isPercentage ? PERCENTAGE_PRESETS : FIXED_PRESETS;

  // V2.12.30: hook reutilizable para autorización de supervisor.
  // Cubre AMBOS tipos de descuento (percentage + fixed) calculando el
  // % efectivo sobre el total del carrito para descuentos fijos.
  const {
    showSupervisorAuth,
    pendingDiscount,
    pendingEffectivePercent,
    checkDiscount,
    cancelAuthorization,
    confirmAuthorization,
  } = useDiscountAuthorization();

  // V2.12.30: wrapper que verifica si el descuento requiere autorización.
  // Antes solo cubría percentage >= threshold. Ahora también cubre fixed
  // calculando el % efectivo sobre el total del carrito.
  const handleSetDiscount = (newDiscount: typeof discount) => {
    if (!newDiscount) { setDiscount(null); return; }

    const referenceTotal = getTotal ? getTotal() : 0;
    const requiresAuth = checkDiscount({
      type: newDiscount.type,
      value: newDiscount.value,
      referenceTotal,
    });

    if (requiresAuth) {
      // El modal de supervisor se abrirá (estado interno del hook).
      // El descuento se aplica solo si el supervisor autoriza.
      return;
    }

    // Si no requiere autorización, aplicar directamente
    setDiscount(newDiscount);
  };

  const handleSupervisorAuthorize = () => {
    const authorized = confirmAuthorization();
    if (authorized && pendingDiscount) {
      // Reconstruir el descuento original con el tipo/valor/moneda pendiente
      setDiscount({
        type: authorized.type as "percentage" | "fixed",
        value: authorized.value,
        currency: discount?.currency || 'CUP',
      });
    }
  };

  return (
    <div className="space-y-3 p-3 rounded-xl bg-muted/50 border border-border">
      <div className="flex justify-between items-center">
        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          Descuento
        </span>
        <div className="flex gap-1 bg-background p-0.5 rounded-lg border border-border">
          <button
            type="button"
            onClick={() =>
              handleSetDiscount({
                type: "percentage",
                value: discount?.value || 0,
              })
            }
            className={cn(
              "px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-black uppercase transition-all",
              isPercentage
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
            aria-pressed={isPercentage}
          >
            %
          </button>
          <button
            type="button"
            onClick={() =>
              handleSetDiscount({
                type: "fixed",
                value: discount?.value || 0,
              })
            }
            className={cn(
              "px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-black uppercase transition-all",
              !isPercentage
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
            aria-pressed={!isPercentage}
          >
            $
          </button>
        </div>
      </div>

      {/* FIX-BPOS-010: Quick-select buttons with contextual labels and values */}
      <div className="flex gap-1.5">
        {presets.map((d) => {
          const isActive = discount?.value === d;
          const label = d === 0
            ? "Sin"
            : isPercentage
              ? `${d}%`
              : `$${d}`;
          return (
            <button
              key={d}
              type="button"
              onClick={() =>
                handleSetDiscount({
                  type: discount?.type || "percentage",
                  value: d,
                })
              }
              className={cn(
                "flex-1 py-3 min-h-[44px] rounded-lg border font-black text-xs uppercase transition-all",
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border",
              )}
              aria-pressed={isActive}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="relative flex gap-2">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-xs">
          {isPercentage ? "%" : "$"}
        </span>
        <input
          type="number"
          min="0"
          max={isPercentage ? "100" : undefined}
          step={isPercentage ? "1" : "0.01"}
          value={discount?.value || ""}
          onChange={(e) => {
            let val = parseFloat(e.target.value) || 0;
            if (isPercentage) val = Math.min(100, Math.max(0, val));
            else val = Math.max(0, val);
            handleSetDiscount({ type: discount?.type || "percentage", value: val, currency: discount?.currency || 'CUP' });
          }}
          aria-label="Valor del descuento"
          className="flex-1 pl-7 p-2 min-h-[44px] rounded-xl border border-border bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none"
          placeholder={isPercentage ? "Ej: 10" : "Ej: 50.00"}
        />
        {/* FIX-DISCOUNT-CURRENCY (2026-07-06): selector de moneda para descuento fijo */}
        {!isPercentage && (
          <select
            value={discount?.currency || 'CUP'}
            onChange={(e) => {
              handleSetDiscount({
                type: 'fixed',
                value: discount?.value || 0,
                currency: e.target.value,
              });
            }}
            className="min-h-[44px] px-2 rounded-xl border border-border bg-background text-xs font-bold"
            aria-label="Moneda del descuento"
          >
            <option value="CUP">CUP</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="MLC">MLC</option>
          </select>
        )}
      </div>

      {/* V2.12.30: Modal de autorización de supervisor.
          Ahora cubre AMBOS tipos de descuento (percentage + fixed).
          El % mostrado es el efectivo (para fixed se calcula sobre getTotal). */}
      <SupervisorAuthModal
        isOpen={showSupervisorAuth}
        onClose={cancelAuthorization}
        onAuthorize={handleSupervisorAuthorize}
        discountPercent={pendingEffectivePercent}
        discountValue={pendingDiscount?.value || 0}
        maxAllowed={DISCOUNT_SUPERVISOR_THRESHOLD}
        discountType={pendingDiscount?.type}
      />
    </div>
  );
};
