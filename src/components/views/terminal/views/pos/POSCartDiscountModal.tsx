"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { POSCartDiscountProps } from "./POSCart.types";

export const POSCartDiscount = ({
  discount,
  setDiscount,
}: POSCartDiscountProps) => (
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
            discount?.type === "percentage"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground",
          )}
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
            discount?.type === "fixed"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground",
          )}
        >
          $
        </button>
      </div>
    </div>

    <div className="flex gap-1.5">
      {[0, 5, 10, 15].map((d) => (
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
            discount?.value === d && discount?.type === "percentage"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border",
          )}
        >
          {d === 0 ? "Sin" : `${d}%`}
        </button>
      ))}
    </div>

    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-xs">
        {discount?.type === "percentage" ? "%" : "$"}
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
        placeholder="Monto personalizado"
      />
    </div>
  </div>
);
