"use client";

/**
 * StoreRatesModal — modal compartido de actualización de tasas de cambio de
 * la tienda (fuente de verdad: store_exchange_rates vía /api/store-rates).
 *
 * MISIÓN-TASAS (2026-10-17): extraído del modal inline de POSCartItem para
 * reutilizarlo desde el diálogo de confirmación diaria de tasas
 * (RatesConfirmationModal): "Revisar o actualizar tasas" dirige aquí sin
 * perder el flujo del carrito. La lógica de guardado y re-tasado del carrito
 * se mantiene IDÉNTICA a la original (setGlobalRate + re-tasa de ítems no-CUP
 * con fila de pago por defecto, respetando payment_manual_override).
 */

import React, { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useCartStore, type CartItem } from "@/store/cart";

// FIX-G5: helper local para recalcular subtotal al re-tasar (idéntico a POSCartItem)
function recalcSubtotal(item: CartItem): number {
  const price = item.price ?? 0;
  const quantity = item.quantity ?? 0;
  const base = price * quantity;
  if (!item.discount_type || item.discount_value <= 0) return base;
  if (item.discount_type === "percentage") return base * (1 - item.discount_value / 100);
  return Math.max(0, (price - item.discount_value) * quantity);
}

interface StoreRatesModalProps {
  open: boolean;
  onClose: () => void;
  /** Se invoca tras guardar tasas nuevas (con los valores guardados). */
  onSaved?: (rates: Record<string, number>) => void;
}

const RATE_CURRENCIES = ["USD", "EUR", "MLC"] as const;

export default function StoreRatesModal({ open, onClose, onSaved }: StoreRatesModalProps) {
  const [ratesModalData, setRatesModalData] = useState<Record<string, string>>({});
  const [updatedAt, setUpdatedAt] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const ratesModalRef = useRef<HTMLDivElement>(null);

  // FIX-TASAS-MODAL: cargar tasas vigentes al abrir + focus inicial
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const { useAuthStore } = await import("@/store");
        const token = useAuthStore.getState().token;
        const user = useAuthStore.getState().user as { activeStoreId?: string } | null;
        const storeId = user?.activeStoreId;
        if (!storeId) return;
        const res = await fetch(`/api/store-rates?storeId=${storeId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setRatesModalData({
          USD: String(data.rates?.USD || ""),
          EUR: String(data.rates?.EUR || ""),
          MLC: String(data.rates?.MLC || ""),
        });
        setUpdatedAt(data.updated_at || {});
      } catch {
        // silencio: el modal abre con lo que haya en el carrito (globalRates)
        const st = useCartStore.getState().globalRates;
        setRatesModalData({
          USD: String(st.USD || ""),
          EUR: String(st.EUR || ""),
          MLC: String(st.MLC || ""),
        });
      }
    })();
    const t = setTimeout(() => ratesModalRef.current?.querySelector("input")?.focus(), 50);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open]);

  // Esc para cancelar (idéntico al modal original)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const saveRates = async () => {
    const newRates: Record<string, number> = {};
    for (const cur of RATE_CURRENCIES) {
      const val = parseFloat(ratesModalData[cur] || "0");
      if (val > 0) newRates[cur] = val;
    }
    if (Object.keys(newRates).length === 0) {
      toast.error("Ingresa al menos una tasa válida");
      return;
    }
    const { useAuthStore } = await import("@/store");
    const token = useAuthStore.getState().token;
    const user = useAuthStore.getState().user as { activeStoreId?: string } | null;
    const storeId = user?.activeStoreId;
    if (!storeId) return;

    setSaving(true);
    try {
      const saveRes = await fetch("/api/store-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ storeId, rates: newRates }),
      });
      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({ error: "" }));
        toast.error(err.error || "Error al guardar tasas");
        return;
      }

      for (const [cur, rate] of Object.entries(newRates)) {
        useCartStore.getState().setGlobalRate(cur, rate);
      }
      useCartStore.setState((state) => ({
        items: state.items.map((it) => {
          if (it.currency !== "CUP" && newRates[it.currency]) {
            const newPrice = (it.base_price_cup || it.price) / newRates[it.currency];
            const updatedItem = { ...it, exchange_rate: newRates[it.currency], price: newPrice };
            updatedItem.subtotal = recalcSubtotal(updatedItem);
            // FIX-PAYMENT-ROWS: resetear payments[] si no hay override manual
            if (!updatedItem.payment_manual_override) {
              updatedItem.payments = [{
                id: `pay_rates_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                method: "cash",
                amount: updatedItem.subtotal,
                currency: updatedItem.cash_currency || updatedItem.currency || "CUP",
                discount_type: null,
                discount_value: 0,
                discount_currency: updatedItem.cash_currency || updatedItem.currency || "CUP",
              }];
            }
            updatedItem.cash_paid = updatedItem.payments?.filter(p => p.method === "cash").reduce((s, p) => s + p.amount, 0) || 0;
            updatedItem.transfer_paid = updatedItem.payments?.filter(p => p.method === "transfer").reduce((s, p) => s + p.amount, 0) || 0;
            updatedItem.zelle_paid = updatedItem.payments?.filter(p => p.method === "zelle").reduce((s, p) => s + p.amount, 0) || 0;
            return updatedItem;
          }
          return it;
        }),
        lastUpdated: Date.now(),
      }));

      toast.success("Tasas actualizadas y guardadas");
      onSaved?.(newRates);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const fmtUpdated = (iso?: string) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString("es-CU", { dateStyle: "short", timeStyle: "short" });
    } catch { return null; }
  };

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rates-modal-title"
    >
      <div
        ref={ratesModalRef}
        className="w-full max-w-sm bg-card border border-border/50 rounded-2xl shadow-2xl p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 id="rates-modal-title" className="text-sm font-black uppercase">Tasas de Cambio</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">
          Se guardan en la tienda y persisten hasta el próximo cambio. Presiona Enter para guardar, Esc para cancelar.
        </p>
        <div className="space-y-2 mb-4">
          {RATE_CURRENCIES.map(cur => (
            <div key={cur} className="flex items-center gap-2">
              <span className="text-xs font-black w-12">{cur}</span>
              <input
                type="number"
                step="0.01"
                value={ratesModalData[cur] || ""}
                onChange={(e) => setRatesModalData(prev => ({ ...prev, [cur]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") (ratesModalRef.current?.querySelector("button:last-of-type") as HTMLButtonElement)?.click(); }}
                className="flex-1 bg-background border border-border/50 rounded-lg px-2 py-2 text-xs font-bold"
                placeholder="0"
                aria-label={`Tasa ${cur}`}
              />
              <span className="text-[10px] text-muted-foreground w-8">CUP</span>
            </div>
          ))}
        </div>
        {Object.values(updatedAt).some(Boolean) && (
          <p className="text-[9px] text-muted-foreground mb-3">
            Última actualización: {Object.entries(updatedAt).filter(([, v]) => v).map(([k, v]) => `${k}: ${fmtUpdated(v)}`).join(" · ")}
          </p>
        )}
        <button
          onClick={saveRates}
          disabled={saving}
          className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar Tasas"}
        </button>
      </div>
    </div>
  );
}
