/**
 * Risk Classifier — Clasifica productos por nivel de riesgo
 *
 * Basado en:
 *   1. FPR (Factor de Revalorización): qué tanto subió el costo de reposición
 *   2. Margen actual: si es negativo o muy bajo
 *
 * La clasificación sube un nivel si el margen está por debajo del mínimo.
 *
 * Puro, determinístico, sin side effects.
 */

import type { RiskLevel } from './types';

export interface RiskInput {
  /** Factor de Revalorización (reposición / histórico) */
  fpr: number;
  /** Margen actual en porcentaje (ej: 0.15 = 15%) */
  current_margin_pct: number;
  /** Margen mínimo configurado (ej: 0.10 = 10%) */
  min_margin: number;
}

/**
 * Clasificar el riesgo de un producto.
 *
 * Umbrales FPR:
 *   < 1.10 → Muy Bajo (sin impacto significativo)
 *   < 1.25 → Bajo (impacto moderado)
 *   < 1.50 → Medio (impacto considerable)
 *   < 2.00 → Alto (impacto severo)
 *   ≥ 2.00 → Crítico (impacto extremo)
 *
 * Si margen < min_margin → subir un nivel
 * Si margen < 0 → subir DOS niveles (pérdida)
 */
export function classifyRisk(input: RiskInput): RiskLevel {
  const { fpr, current_margin_pct, min_margin } = input;

  // Nivel base por FPR
  let level: RiskLevel;
  if (fpr < 1.10) {
    level = 'muy_bajo';
  } else if (fpr < 1.25) {
    level = 'bajo';
  } else if (fpr < 1.50) {
    level = 'medio';
  } else if (fpr < 2.00) {
    level = 'alto';
  } else {
    level = 'critico';
  }

  // Si margen negativo → subir 2 niveles
  if (current_margin_pct < 0) {
    level = bumpLevel(level, 2);
  }
  // Si margen < mínimo → subir 1 nivel
  else if (current_margin_pct < min_margin) {
    level = bumpLevel(level, 1);
  }

  return level;
}

/**
 * Subir N niveles de riesgo (con tope en 'critico').
 */
function bumpLevel(level: RiskLevel, steps: number): RiskLevel {
  const levels: RiskLevel[] = ['muy_bajo', 'bajo', 'medio', 'alto', 'critico'];
  const currentIndex = levels.indexOf(level);
  const newIndex = Math.min(currentIndex + steps, levels.length - 1);
  return levels[newIndex];
}

/**
 * Obtener color CSS para un nivel de riesgo.
 */
export function getRiskColor(risk: RiskLevel): string {
  switch (risk) {
    case 'muy_bajo': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    case 'bajo': return 'text-green-600 bg-green-50 border-green-200';
    case 'medio': return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'alto': return 'text-orange-600 bg-orange-50 border-orange-200';
    case 'critico': return 'text-red-600 bg-red-50 border-red-200';
    default: return 'text-muted-foreground bg-muted/50';
  }
}

/**
 * Etiqueta legible para el usuario.
 */
export function getRiskLabel(risk: RiskLevel): string {
  switch (risk) {
    case 'muy_bajo': return 'Muy Bajo';
    case 'bajo': return 'Bajo';
    case 'medio': return 'Medio';
    case 'alto': return 'Alto';
    case 'critico': return 'Crítico';
    default: return 'N/A';
  }
}
