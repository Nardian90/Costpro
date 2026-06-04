"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { POSCartDiscountProps } from "./POSCart.types";

// FIX-BPOS-010: Contextual quick-select values per discount type
const PERCENTAGE_PRESETS = [0, 5, 10, 15];
const FIXED_PRESETS = [0, 5, 10, 20];

export const POSCartDiscountModal = ({
  discount,
  setDiscount,
}: POSCartDiscountProps) => {
  const isPercentage = discount?.type === "percentage";
  const presets = isPercentage ? PERCENTAGE_PRESETS : FIXED_PRESETS;

  return (
    <div className="space-y-3 p-3 rounded-xl bg-muted/50 border border-border">
      <div className="flex justify-between items-center">
        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          Descuento
        </span>
        <div className="flex gap-1 bg-background p-0.5 rounded-lg border border-border">
          <button
            onClick={() =>
              setDiscount({
                type: "percentage",
                value: discount?.value || 0,
              })
            }
            className={cn(
              "px-2 py-0.5 rounded-lg text-xs font-black uppercase transition-all",
              isPercentage
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
            aria-pressed={isPercentage}
          >
            %
          </button>
          <button
            onClick={() =>
              setDiscount({
                type: "fixed",
                value: discount?.value || 0,
              })
            }
            className={cn(
              "px-2 py-0.5 rounded-lg text-xs font-black uppercase transition-all",
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
              onClick={() =>
                setDiscount({
                  type: discount?.type || "percentage",
                  value: d,
                })
              }
              className={cn(
                "flex-1 py-2 rounded-lg border font-black text-xs uppercase transition-all",
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

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-xs">
          {isPercentage ? "%" : "$"}
        </span>
        <input
          type="number"
          min="0"
          value={discount?.value || ""}
          onChange={(e) =>
            setDiscount({
              type: discount?.type || "percentage",
              value: parseFloat(e.target.value) || 0,
            })
          }
          aria-label="Valor del descuento"
          className="w-full pl-7 p-2 rounded-xl border border-border bg-background text-xs font-bold focus:ring-1 focus:ring-primary outline-none"
          placeholder={isPercentage ? "Ej: 10" : "Ej: 50.00"}
        />
      </div>
    </div>
  );
};
