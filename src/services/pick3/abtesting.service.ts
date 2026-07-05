/**
 * abtesting.service.ts — A/B Testing for Pick 3 Paywall
 *
 * SPRINT 5 — Growth Engine
 *
 * Sistema simple de A/B testing para optimizar la conversión del paywall.
 * Tests:
 *   - CTAs diferentes ('Iniciar trial' vs 'Probar 14 días gratis' vs 'Ver planes')
 *   - Precios ($19 vs $17/mes con descuento)
 *   - Trial length (14 días vs 30 días)
 *   - Social proof (con/sin testimonios)
 *
 * Asignación: hash(userId) % numVariants → consistente para el mismo usuario
 *
 * Author: CostPro Sprint 5
 */

import { logger } from '@/lib/logger';

// ============================================================================
// TIPOS
// ============================================================================

export type ExperimentId =
  | 'paywall_cta'
  | 'paywall_price'
  | 'paywall_trial_length'
  | 'paywall_social_proof';

export interface Experiment {
  id: ExperimentId;
  name: string;
  description: string;
  variants: ExperimentVariant[];
  isActive: boolean;
  startDate: string;
  endDate?: string;
}

export interface ExperimentVariant {
  id: string;
  name: string;
  weight: number; // Porcentaje 0-100
  config: Record<string, any>;
}

export interface ExperimentAssignment {
  experimentId: ExperimentId;
  variantId: string;
  variant: ExperimentVariant;
  userId: string;
  assignedAt: string;
}

// ============================================================================
// EXPERIMENTS DEFINITION
// ============================================================================

export const EXPERIMENTS: Record<ExperimentId, Experiment> = {
  paywall_cta: {
    id: 'paywall_cta',
    name: 'Paywall CTA',
    description: 'Test different CTA button texts on pricing page',
    isActive: true,
    startDate: '2026-07-05',
    variants: [
      {
        id: 'control',
        name: 'Control',
        weight: 33,
        config: { ctaText: 'Iniciar trial', ctaSubtext: '14 días gratis' },
      },
      {
        id: 'urgency',
        name: 'Urgency',
        weight: 33,
        config: { ctaText: 'Probar 14 días gratis', ctaSubtext: 'Sin tarjeta de crédito' },
      },
      {
        id: 'value',
        name: 'Value Proposition',
        weight: 34,
        config: { ctaText: 'Empezar a analizar', ctaSubtext: 'Únete a 1000+ jugadores' },
      },
    ],
  },

  paywall_price: {
    id: 'paywall_price',
    name: 'Paywall Price',
    description: 'Test price anchoring on Player tier',
    isActive: true,
    startDate: '2026-07-05',
    variants: [
      {
        id: 'control',
        name: 'Control $19',
        weight: 50,
        config: { price: 19, originalPrice: null, anchorText: null },
      },
      {
        id: 'anchored',
        name: 'Anchored $19 (was $29)',
        weight: 50,
        config: { price: 19, originalPrice: 29, anchorText: 'Oferta lanzamiento' },
      },
    ],
  },

  paywall_trial_length: {
    id: 'paywall_trial_length',
    name: 'Trial Length',
    description: 'Test 14 vs 30 days trial',
    isActive: true,
    startDate: '2026-07-05',
    variants: [
      {
        id: '14days',
        name: '14 Days',
        weight: 50,
        config: { trialDays: 14, trialText: '14 días gratis' },
      },
      {
        id: '30days',
        name: '30 Days',
        weight: 50,
        config: { trialDays: 30, trialText: '30 días gratis' },
      },
    ],
  },

  paywall_social_proof: {
    id: 'paywall_social_proof',
    name: 'Social Proof',
    description: 'Test social proof on pricing page',
    isActive: true,
    startDate: '2026-07-05',
    variants: [
      {
        id: 'no_proof',
        name: 'No Social Proof',
        weight: 50,
        config: { showTestimonials: false, showUserCount: false },
      },
      {
        id: 'with_proof',
        name: 'With Social Proof',
        weight: 50,
        config: {
          showTestimonials: true,
          showUserCount: true,
          userCount: 1247,
          testimonials: [
            { text: 'Finalmente un análisis honesto de lotería. Sin promesas falsas.', author: 'Carlos M.', tier: 'Player' },
            { text: 'El asesor IA me ayuda a no perder dinero por malas decisiones.', author: 'Ana R.', tier: 'Quant' },
            { text: 'Los 4 tests estadísticos son oro. Ahora entiendo por qué no hay edge.', author: 'Luis P.', tier: 'Player' },
          ],
        },
      },
    ],
  },
};

// ============================================================================
// SERVICE
// ============================================================================

export class ABTestingService {
  /**
   * Asigna un usuario a una variante de un experimento.
   * Usa hash determinístico para que el mismo usuario siempre vea la misma variante.
   */
  static assignUser(
    userId: string,
    experimentId: ExperimentId,
  ): ExperimentAssignment | null {
    const experiment = EXPERIMENTS[experimentId];
    if (!experiment || !experiment.isActive) {
      return null;
    }

    // Hash determinístico del userId
    const hash = this.hashUserId(userId, experimentId);
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    let cumulative = 0;
    const target = (hash % 100) * (totalWeight / 100);

    for (const variant of experiment.variants) {
      cumulative += variant.weight;
      if (target < cumulative) {
        return {
          experimentId,
          variantId: variant.id,
          variant,
          userId,
          assignedAt: new Date().toISOString(),
        };
      }
    }

    // Fallback al primer variant
    return {
      experimentId,
      variantId: experiment.variants[0].id,
      variant: experiment.variants[0],
      userId,
      assignedAt: new Date().toISOString(),
    };
  }

  /**
   * Obtiene todas las asignaciones de un usuario (para todos los experimentos activos).
   */
  static assignAllExperiments(userId: string): Record<ExperimentId, ExperimentAssignment | null> {
    const assignments: any = {};
    for (const expId of Object.keys(EXPERIMENTS) as ExperimentId[]) {
      assignments[expId] = this.assignUser(userId, expId);
    }
    return assignments;
  }

  /**
   * Hash determinístico simple (FNV-1a).
   * Asegura que el mismo userId siempre reciba la misma variante.
   */
  private static hashUserId(userId: string, experimentId: ExperimentId): number {
    const str = `${userId}:${experimentId}`;
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
  }

  /**
   * Trackea un evento de conversión (para medir qué variante convierte más).
   * En producción, esto se enviaría a PostHog o Mixpanel.
   */
  static trackConversion(
    userId: string,
    experimentId: ExperimentId,
    event: 'view' | 'click_cta' | 'start_trial' | 'convert_paid',
  ): void {
    const assignment = this.assignUser(userId, experimentId);
    if (!assignment) return;

    logger.info('PICK3', `A/B conversion: ${experimentId} | variant=${assignment.variantId} | event=${event} | user=${userId}`);

    // En producción: enviar a PostHog/Mixpanel/Amplitude
    // Por ahora, solo log
  }

  /**
   * Obtiene los resultados agregados de un experimento.
   * En producción, esto consultaría PostHog/Mixpanel.
   */
  static async getExperimentResults(experimentId: ExperimentId): Promise<{
    experimentId: ExperimentId;
    variants: Array<{
      variantId: string;
      variantName: string;
      views: number;
      ctaClicks: number;
      trialsStarted: number;
      paidConversions: number;
      conversionRate: number;
    }>;
  } | null> {
    // Stub — en producción consultaría analytics
    return {
      experimentId,
      variants: EXPERIMENTS[experimentId].variants.map(v => ({
        variantId: v.id,
        variantName: v.name,
        views: 0,
        ctaClicks: 0,
        trialsStarted: 0,
        paidConversions: 0,
        conversionRate: 0,
      })),
    };
  }
}
