'use client';

/**
 * CP-FIN-REC-001/PR B — Diálogo de selección de período para el PDF del mayor
 * (misión §7.1). No genera el documento al pulsar el botón: PRIMERO pide las
 * fechas (ambas obligatorias, desde ≤ hasta, sin fechas inválidas ni períodos
 * fuera de los límites de la consulta) y solo «Generar PDF» dispara la
 * exportación del rango completo del servidor (no las filas visibles).
 */
import React, { useEffect, useState } from 'react';
import { FileText, Loader2, X } from 'lucide-react';

export interface ExportPeriodDialogProps {
  open: boolean;
  /** Rango actual del panel (defaults del diálogo). */
  defaultFrom: string;
  defaultTo: string;
  /** Límite superior permitido por la consulta (hoy). */
  maxTo: string;
  categoryLabel: string;
  onClose: () => void;
  onGenerate: (from: string, to: string) => void;
  busy?: boolean;
}

export function ExportPeriodDialog({
  open,
  defaultFrom,
  defaultTo,
  maxTo,
  categoryLabel,
  onClose,
  onGenerate,
  busy = false,
}: ExportPeriodDialogProps) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  useEffect(() => {
    if (open) {
      setFrom(defaultFrom);
      setTo(defaultTo);
    }
  }, [open, defaultFrom, defaultTo]);

  if (!open) return null;

  const fromInvalid = !from || from > to || from > maxTo;
  const toInvalid = !to || to < from || to > maxTo;
  const canGenerate = from && to && !fromInvalid && !toInvalid && !busy;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Seleccionar período del PDF"
      data-testid="dialog-periodo-pdf"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-black uppercase tracking-tight">Exportar movimientos a PDF</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{categoryLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted min-h-[36px] min-w-[36px]"
            aria-label="Cerrar"
            data-testid="btn-cerrar-dialogo-pdf"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Selecciona el período del informe. Se exportarán <span className="font-bold">todos los
          movimientos del servidor</span> dentro del rango (independientemente de las filas cargadas
          en pantalla), con saldo inicial, débitos, créditos y saldo final del período.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Desde fecha
            </span>
            <input
              type="date"
              value={from}
              max={maxTo}
              onChange={(e) => setFrom(e.target.value)}
              className="h-11 rounded-lg border border-border bg-background px-2.5 text-xs font-bold outline-none focus:border-primary min-h-[44px]"
              aria-label="Fecha inicial"
              data-testid="input-pdf-desde"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Hasta fecha
            </span>
            <input
              type="date"
              value={to}
              max={maxTo}
              onChange={(e) => setTo(e.target.value)}
              className="h-11 rounded-lg border border-border bg-background px-2.5 text-xs font-bold outline-none focus:border-primary min-h-[44px]"
              aria-label="Fecha final"
              data-testid="input-pdf-hasta"
            />
          </label>
        </div>

        {(fromInvalid || toInvalid) && (
          <p className="text-[11px] text-destructive font-bold" data-testid="dialog-pdf-error">
            Período inválido: la fecha inicial no puede ser posterior a la final, y ninguna puede
            superar hoy.
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-4 rounded-lg border border-border text-xs font-black uppercase tracking-wide text-muted-foreground hover:bg-muted transition-all min-h-[44px]"
            data-testid="btn-cancelar-pdf"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => canGenerate && onGenerate(from, to)}
            disabled={!canGenerate}
            className="h-11 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase tracking-wide hover:opacity-90 transition-all min-h-[44px] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-generar-pdf"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            Generar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
