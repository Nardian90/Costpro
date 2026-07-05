/**
 * pick3-subscription.test.ts — Tests for Sprint 4 monetization
 *
 * SPRINT-4-MONETIZATION (2026-07-05)
 *
 * Verifica:
 *   - Los 4 tiers tienen configuración correcta
 *   - Límites por tier (aiQueriesPerMonth, backtestMaxDays, etc.)
 *   - Helpers: getHigherTier, tierHasFeature, tierGte, getNextTier
 *   - Trial: TRIAL_DAYS, getTrialDaysLeft
 *   - Pricing: mensual y anual con 20% descuento
 */

import { describe, it, expect } from 'vitest';
import {
  TIERS,
  TIER_ORDER,
  TRIAL_DAYS,
  SubscriptionTier,
  getHigherTier,
  tierHasFeature,
  tierGte,
  getNextTier,
  getTrialDaysLeft,
} from '@/services/pick3/subscription.types';

describe('SPRINT-4: Subscription Types & Tiers', () => {
  describe('TIERS definition', () => {
    it('tiene 4 tiers definidos', () => {
      expect(TIERS.free).toBeDefined();
      expect(TIERS.player).toBeDefined();
      expect(TIERS.quant).toBeDefined();
      expect(TIERS.desk).toBeDefined();
      expect(TIER_ORDER).toHaveLength(4);
      expect(TIER_ORDER).toEqual(['free', 'player', 'quant', 'desk']);
    });

    it('precios correctos', () => {
      expect(TIERS.free.priceMonthly).toBe(0);
      expect(TIERS.player.priceMonthly).toBe(19);
      expect(TIERS.quant.priceMonthly).toBe(49);
      expect(TIERS.desk.priceMonthly).toBe(149);
    });

    it('precio anual con 20% descuento', () => {
      // priceYearly ≈ priceMonthly * 12 * 0.8
      expect(TIERS.player.priceYearly).toBeLessThan(TIERS.player.priceMonthly * 12);
      expect(TIERS.quant.priceYearly).toBeLessThan(TIERS.quant.priceMonthly * 12);
      expect(TIERS.desk.priceYearly).toBeLessThan(TIERS.desk.priceMonthly * 12);
    });

    it('cada tier tiene features no vacías', () => {
      for (const tierId of TIER_ORDER) {
        expect(TIERS[tierId].features.length).toBeGreaterThan(0);
      }
    });

    it('cada tier tiene CTA no vacío', () => {
      for (const tierId of TIER_ORDER) {
        expect(TIERS[tierId].cta.length).toBeGreaterThan(0);
      }
    });

    it('cada tier tiene color e icono', () => {
      for (const tierId of TIER_ORDER) {
        expect(TIERS[tierId].color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(TIERS[tierId].icon.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Tier limits', () => {
    it('Free: 3 consultas IA, 90 días backtest, 1 lotería, sin API', () => {
      const limits = TIERS.free.limits;
      expect(limits.aiQueriesPerMonth).toBe(3);
      expect(limits.backtestMaxDays).toBe(90);
      expect(limits.maxLotteries).toBe(1);
      expect(limits.apiAccess).toBe(false);
      expect(limits.regimeAlerts).toBe(false);
      expect(limits.maxUsers).toBe(1);
      expect(limits.whiteLabel).toBe(false);
    });

    it('Player: 20 consultas IA, backtest ilimitado, regime alerts', () => {
      const limits = TIERS.player.limits;
      expect(limits.aiQueriesPerMonth).toBe(20);
      expect(limits.backtestMaxDays).toBe(-1);
      expect(limits.regimeAlerts).toBe(true);
      expect(limits.apiAccess).toBe(false);
    });

    it('Quant: IA ilimitada, multi-lotería (5), API access', () => {
      const limits = TIERS.quant.limits;
      expect(limits.aiQueriesPerMonth).toBe(-1);
      expect(limits.maxLotteries).toBe(5);
      expect(limits.apiAccess).toBe(true);
      expect(limits.customModels).toBe(true);
      expect(limits.prioritySupport).toBe(true);
    });

    it('Desk: multi-usuario (10), white-label, lotería ilimitada', () => {
      const limits = TIERS.desk.limits;
      expect(limits.maxUsers).toBe(10);
      expect(limits.whiteLabel).toBe(true);
      expect(limits.maxLotteries).toBe(-1);
    });

    it('jerarquía de límites respeta tier order', () => {
      // AI queries: free (3) < player (20) < quant (-1=ilimitado) = desk (-1=ilimitado)
      expect(TIERS.free.limits.aiQueriesPerMonth).toBeLessThan(TIERS.player.limits.aiQueriesPerMonth);
      // Quant y Desk son ilimitados (-1), que representa "mayor" que cualquier número finito
      expect(TIERS.quant.limits.aiQueriesPerMonth).toBe(-1);
      expect(TIERS.desk.limits.aiQueriesPerMonth).toBe(-1);

      // API access: solo quant y desk
      expect(TIERS.free.limits.apiAccess).toBe(false);
      expect(TIERS.player.limits.apiAccess).toBe(false);
      expect(TIERS.quant.limits.apiAccess).toBe(true);
      expect(TIERS.desk.limits.apiAccess).toBe(true);

      // Multi-user: solo desk
      expect(TIERS.free.limits.maxUsers).toBe(1);
      expect(TIERS.desk.limits.maxUsers).toBe(10);

      // White-label: solo desk
      expect(TIERS.desk.limits.whiteLabel).toBe(true);
      expect(TIERS.quant.limits.whiteLabel).toBe(false);
    });
  });

  describe('getHigherTier', () => {
    it('retorna el tier mayor', () => {
      expect(getHigherTier('free', 'player')).toBe('player');
      expect(getHigherTier('player', 'free')).toBe('player');
      expect(getHigherTier('quant', 'desk')).toBe('desk');
      expect(getHigherTier('desk', 'free')).toBe('desk');
    });

    it('retorna el mismo tier si son iguales', () => {
      expect(getHigherTier('free', 'free')).toBe('free');
      expect(getHigherTier('desk', 'desk')).toBe('desk');
    });
  });

  describe('tierHasFeature', () => {
    it('Free NO tiene API access', () => {
      expect(tierHasFeature('free', 'apiAccess')).toBe(false);
    });

    it('Quant SÍ tiene API access', () => {
      expect(tierHasFeature('quant', 'apiAccess')).toBe(true);
    });

    it('Desk SÍ tiene whiteLabel', () => {
      expect(tierHasFeature('desk', 'whiteLabel')).toBe(true);
      expect(tierHasFeature('quant', 'whiteLabel')).toBe(false);
    });

    it('Player SÍ tiene regimeAlerts', () => {
      expect(tierHasFeature('player', 'regimeAlerts')).toBe(true);
      expect(tierHasFeature('free', 'regimeAlerts')).toBe(false);
    });
  });

  describe('tierGte', () => {
    it('free >= free = true', () => {
      expect(tierGte('free', 'free')).toBe(true);
    });

    it('desk >= free = true', () => {
      expect(tierGte('desk', 'free')).toBe(true);
    });

    it('free >= desk = false', () => {
      expect(tierGte('free', 'desk')).toBe(false);
    });

    it('quant >= player = true', () => {
      expect(tierGte('quant', 'player')).toBe(true);
    });

    it('player >= quant = false', () => {
      expect(tierGte('player', 'quant')).toBe(false);
    });
  });

  describe('getNextTier', () => {
    it('next de free = player', () => {
      expect(getNextTier('free')).toBe('player');
    });

    it('next de player = quant', () => {
      expect(getNextTier('player')).toBe('quant');
    });

    it('next de quant = desk', () => {
      expect(getNextTier('quant')).toBe('desk');
    });

    it('next de desk = null (no hay siguiente)', () => {
      expect(getNextTier('desk')).toBeNull();
    });
  });

  describe('TRIAL_DAYS y getTrialDaysLeft', () => {
    it('TRIAL_DAYS es 14', () => {
      expect(TRIAL_DAYS).toBe(14);
    });

    it('getTrialDaysLeft retorna días restantes', () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);
      const days = getTrialDaysLeft(future.toISOString());
      expect(days).toBe(10);
    });

    it('getTrialDaysLeft retorna 0 si expiró', () => {
      const past = new Date();
      past.setDate(past.getDate() - 5);
      const days = getTrialDaysLeft(past.toISOString());
      expect(days).toBe(0);
    });

    it('getTrialDaysLeft retorna undefined si no hay trial_end', () => {
      expect(getTrialDaysLeft(null)).toBeUndefined();
      expect(getTrialDaysLeft(undefined)).toBeUndefined();
    });
  });

  describe('Pricing consistency', () => {
    it('precios mensuales siguen la jerarquía free < player < quant < desk', () => {
      expect(TIERS.free.priceMonthly).toBeLessThan(TIERS.player.priceMonthly);
      expect(TIERS.player.priceMonthly).toBeLessThan(TIERS.quant.priceMonthly);
      expect(TIERS.quant.priceMonthly).toBeLessThan(TIERS.desk.priceMonthly);
    });

    it('precio anual = mensual * 12 * 0.8 (aprox)', () => {
      const calcYearly = (monthly: number) => Math.round(monthly * 12 * 0.8);
      expect(TIERS.player.priceYearly).toBeCloseTo(calcYearly(19), -1);
      expect(TIERS.quant.priceYearly).toBeCloseTo(calcYearly(49), -1);
      expect(TIERS.desk.priceYearly).toBeCloseTo(calcYearly(149), -1);
    });
  });

  describe('Tier targets', () => {
    it('cada tier tiene target definido', () => {
      expect(TIERS.free.target).toBeTruthy();
      expect(TIERS.player.target).toBeTruthy();
      expect(TIERS.quant.target).toBeTruthy();
      expect(TIERS.desk.target).toBeTruthy();
    });

    it('Player es el tier destacado (highlight)', () => {
      expect(TIERS.player.highlight).toBe(true);
      expect(TIERS.free.highlight).toBeUndefined();
      expect(TIERS.quant.highlight).toBeUndefined();
      expect(TIERS.desk.highlight).toBeUndefined();
    });
  });
});
