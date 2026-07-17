'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';

/**
 * ExchangeRatesModal — Modal reutilizable para configurar tasas de cambio
 * globales de la tienda (USD, EUR, MLC → CUP).
 *
 * Extraído del POSCartItem para reutilizarlo desde:
 *  - POS (donde se originó)
 *  - Workers > Reglas Comisión > Por producto (para que el admin vea las tasas
 *    vigentes al configurar comisiones sobre productos en USD/EUR/MLC)
 *
 * Las tasas se guardan en la tabla store_exchange_rates via /api/store-rates
 * y persisten hasta cambio manual.
 */
interface ExchangeRatesModalProps {
  open: boolean;
  onClose: () => void;
  storeId: string;
  onSaved?: (rates: Record<string, number>) => void;
}

export function ExchangeRatesModal({ open, onClose, storeId, onSaved }: ExchangeRatesModalProps) {
  const [ratesData, setRatesData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Cargar tasas actuales al abrir
  useEffect(() => {
    if (!open || !storeId) return;
    setLoading(true);
    (async () => {
      try {
        const token = useAuthStore.getState().token;
        const res = await fetch(`/api/store-rates?storeId=${storeId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          const currentRates = data.rates || {};
          setRatesData({
            USD: String(currentRates.USD || ''),
            EUR: String(currentRates.EUR || ''),
            MLC: String(currentRates.MLC || ''),
          });
        }
      } catch (e) {
        // silencioso
      } finally {
        setLoading(false);
      }
    })();
  }, [open, storeId]);

  // Escape para cerrar
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const newRates: Record<string, number> = {};
      for (const cur of ['USD', 'EUR', 'MLC']) {
        const val = parseFloat(ratesData[cur] || '0');
        if (val > 0) newRates[cur] = val;
      }
      if (Object.keys(newRates).length === 0) {
        toast.error('Ingresa al menos una tasa válida');
        setSaving(false);
        return;
      }
      const token = useAuthStore.getState().token;
      const saveRes = await fetch('/api/store-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ storeId, rates: newRates }),
      });
      if (!saveRes.ok) {
        toast.error('Error al guardar tasas');
        setSaving(false);
        return;
      }
      toast.success('Tasas actualizadas y guardadas');
      onSaved?.(newRates);
      onClose();
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="exchange-rates-modal-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-sm bg-card border border-border/50 rounded-2xl shadow-2xl p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 id="exchange-rates-modal-title" className="text-sm font-black uppercase">
            Tasas de Cambio
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">
          Se guardan en la tienda y persisten hasta el próximo cambio.
          Ej: USD=680 significa 1 USD = 680 CUP.
        </p>

        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-4">Cargando tasas...</p>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {['USD', 'EUR', 'MLC'].map(cur => (
                <div key={cur} className="flex items-center gap-2">
                  <span className="text-xs font-black w-12">{cur}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={ratesData[cur] || ''}
                    onChange={(e) => setRatesData(prev => ({ ...prev, [cur]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                    className="flex-1 bg-background border border-border/50 rounded-lg px-2 py-2 text-xs font-bold min-h-[44px]"
                    placeholder="0"
                    aria-label={`Tasa ${cur}`}
                  />
                  <span className="text-[10px] text-muted-foreground w-8">CUP</span>
                </div>
              ))}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
            >
              {saving ? 'Guardando...' : 'Guardar Tasas'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
