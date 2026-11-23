'use client';

/**
 * ObservationsPanel — «Observaciones ejecutivas» (misión §3D).
 *
 * Estructura por observación: HECHO (cuantificado) → EVIDENCIA (fuente y
 * período) → LECTURA (interpretación, marcada como tal) → CONVIENE REVISAR.
 * Separa explícitamente hechos comprobados de interpretaciones — sin textos
 * genéricos: cada frase sale de un dato de las respuestas del RPC.
 */

import React from 'react';
import { FileSearch, Lightbulb } from 'lucide-react';
import type { ExecutiveObservation } from './useExecutiveData';

export function ObservationsPanel({ observations }: { observations: ExecutiveObservation[] }) {
  return (
    <section aria-label="Observaciones ejecutivas" data-testid="executive-observations">
      <div className="flex items-center justify-between gap-2 mb-3 px-1">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Observaciones ejecutivas
        </h2>
        <span className="text-[11px] font-bold text-muted-foreground">hecho → evidencia → lectura</span>
      </div>

      {observations.length === 0 ? (
        <div className="p-4 rounded-xl border border-border/50 bg-card">
          <p className="text-sm text-muted-foreground">
            Sin observaciones para este período: aún no hay ventas registradas en el intervalo activo.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {observations.map((o) => (
            <li
              key={o.id}
              className="p-4 rounded-xl border border-border/50 bg-card shadow-sm"
              data-testid={`executive-observation-${o.id}`}
            >
              <p className="text-sm text-foreground leading-relaxed font-medium" data-testid={`executive-observation-${o.id}-fact`}>
                {o.fact}
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
                <FileSearch className="w-3 h-3 mt-0.5 shrink-0" aria-hidden />
                <span><span className="font-black uppercase tracking-wider">Evidencia:</span> {o.evidence}</span>
              </p>
              {o.reading && (
                <p className="mt-2 text-xs leading-relaxed text-foreground/85 flex items-start gap-1.5 rounded-lg bg-muted/40 p-2.5">
                  <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" aria-hidden />
                  <span>
                    <span className="font-black uppercase tracking-wider text-[10px] text-muted-foreground block">
                      Lectura (interpretación)
                    </span>
                    {o.reading}
                  </span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
