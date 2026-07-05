/**
 * pick3-growth.test.ts — Tests for Sprint 5 Growth Engine
 *
 * SPRINT-5-GROWTH (2026-07-05)
 *
 * Verifica:
 *   - Referral: tipos, helpers, generación de código
 *   - A/B Testing: asignación determinística, 4 experimentos, tracking
 *   - Programmatic SEO: página de combinación valida digits, genera metadata
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  REFERRAL_REWARDS,
  REFERRAL_EXPIRY_DAYS,
  generateReferralCode,
  isValidReferralCode,
  getReferralDaysLeft,
} from '@/services/pick3/referral.types';
import {
  ABTestingService,
  EXPERIMENTS,
  ExperimentId,
} from '@/services/pick3/abtesting.service';

describe('SPRINT-5: Growth Engine', () => {
  // =========================================================================
  // REFERRAL TYPES & HELPERS
  // =========================================================================
  describe('Referral helpers', () => {
    it('REFERRAL_REWARDS tiene recompensas para referrer y referred', () => {
      expect(REFERRAL_REWARDS.REFERRER).toBeDefined();
      expect(REFERRAL_REWARDS.REFERRED).toBeDefined();
      expect(REFERRAL_REWARDS.REFERRER.tier).toBe('player');
      expect(REFERRAL_REWARDS.REFERRED.tier).toBe('player');
      expect(REFERRAL_REWARDS.REFERRER.value_usd).toBe(19);
      expect(REFERRAL_REWARDS.REFERRED.value_usd).toBe(19);
    });

    it('REFERRAL_EXPIRY_DAYS es 90', () => {
      expect(REFERRAL_EXPIRY_DAYS).toBe(90);
    });

    it('generateReferralCode produce código alfanumérico 6-12 chars', () => {
      const code = generateReferralCode('Darian', 'abc-123-def-456');
      expect(code).toMatch(/^[A-Z0-9]{6,12}$/);
      expect(code).toContain('DARIAN');
    });

    it('generateReferralCode limpia caracteres especiales', () => {
      const code = generateReferralCode('Darian!@#$', 'abc-123');
      expect(code).toMatch(/^[A-Z0-9]+$/);
      expect(code).not.toContain('!');
      expect(code).not.toContain('@');
    });

    it('isValidReferralCode valida formato', () => {
      expect(isValidReferralCode('DARIAN1234')).toBe(true);
      expect(isValidReferralCode('ABC123')).toBe(true);
      expect(isValidReferralCode('abc')).toBe(false); // minúsculas
      expect(isValidReferralCode('ABC')).toBe(false); // muy corto
      expect(isValidReferralCode('ABCDEFGHIJKLMN')).toBe(false); // muy largo
      expect(isValidReferralCode('AB-CDEF')).toBe(false); // guion
    });

    it('getReferralDaysLeft calcula días restantes', () => {
      const future = new Date();
      future.setDate(future.getDate() + 30);
      expect(getReferralDaysLeft(future.toISOString())).toBe(30);

      const past = new Date();
      past.setDate(past.getDate() - 5);
      expect(getReferralDaysLeft(past.toISOString())).toBe(0);
    });
  });

  // =========================================================================
  // A/B TESTING
  // =========================================================================
  describe('ABTestingService', () => {
    it('tiene 4 experimentos definidos', () => {
      expect(Object.keys(EXPERIMENTS)).toHaveLength(4);
      expect(EXPERIMENTS.paywall_cta).toBeDefined();
      expect(EXPERIMENTS.paywall_price).toBeDefined();
      expect(EXPERIMENTS.paywall_trial_length).toBeDefined();
      expect(EXPERIMENTS.paywall_social_proof).toBeDefined();
    });

    it('todos los experimentos están activos', () => {
      for (const exp of Object.values(EXPERIMENTS)) {
        expect(exp.isActive).toBe(true);
      }
    });

    it('cada experimento tiene al menos 2 variantes', () => {
      for (const exp of Object.values(EXPERIMENTS)) {
        expect(exp.variants.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('los pesos de variantes suman ~100', () => {
      for (const exp of Object.values(EXPERIMENTS)) {
        const totalWeight = exp.variants.reduce((sum, v) => sum + v.weight, 0);
        expect(totalWeight).toBeGreaterThanOrEqual(99);
        expect(totalWeight).toBeLessThanOrEqual(101);
      }
    });

    it('assignUser retorna asignación válida', () => {
      const userId = 'test-user-123';
      const assignment = ABTestingService.assignUser(userId, 'paywall_cta');
      expect(assignment).not.toBeNull();
      expect(assignment!.experimentId).toBe('paywall_cta');
      expect(assignment!.userId).toBe(userId);
      expect(assignment!.variant).toBeDefined();
      expect(assignment!.variantId).toBeDefined();
    });

    it('asignación es determinística (mismo user → misma variante)', () => {
      const userId = 'test-user-deterministic-123';
      const a1 = ABTestingService.assignUser(userId, 'paywall_cta');
      const a2 = ABTestingService.assignUser(userId, 'paywall_cta');
      expect(a1).not.toBeNull();
      expect(a2).not.toBeNull();
      expect(a1!.variantId).toBe(a2!.variantId);
    });

    it('usuarios diferentes pueden tener variantes diferentes (distribución)', () => {
      // Con 100 usuarios diferentes, al menos 2 variantes deben ser asignadas
      const variantCounts: Record<string, number> = {};
      for (let i = 0; i < 100; i++) {
        const a = ABTestingService.assignUser(`user-${i}`, 'paywall_cta');
        if (a) {
          variantCounts[a.variantId] = (variantCounts[a.variantId] || 0) + 1;
        }
      }
      expect(Object.keys(variantCounts).length).toBeGreaterThanOrEqual(2);
    });

    it('assignAllExperiments retorna asignaciones para los 4 experimentos', () => {
      const assignments = ABTestingService.assignAllExperiments('test-user-456');
      expect(assignments.paywall_cta).toBeDefined();
      expect(assignments.paywall_price).toBeDefined();
      expect(assignments.paywall_trial_length).toBeDefined();
      expect(assignments.paywall_social_proof).toBeDefined();
    });

    it('trackConversion no crashea', () => {
      expect(() => {
        ABTestingService.trackConversion('user-123', 'paywall_cta', 'view');
        ABTestingService.trackConversion('user-123', 'paywall_cta', 'click_cta');
        ABTestingService.trackConversion('user-123', 'paywall_cta', 'start_trial');
        ABTestingService.trackConversion('user-123', 'paywall_cta', 'convert_paid');
      }).not.toThrow();
    });

    it('getExperimentResults retorna estructura válida', async () => {
      const results = await ABTestingService.getExperimentResults('paywall_cta');
      expect(results).not.toBeNull();
      expect(results!.experimentId).toBe('paywall_cta');
      expect(results!.variants.length).toBeGreaterThan(0);
      for (const v of results!.variants) {
        expect(typeof v.variantId).toBe('string');
        expect(typeof v.views).toBe('number');
        expect(typeof v.conversionRate).toBe('number');
      }
    });
  });

  // =========================================================================
  // PROGRAMMATIC SEO
  // =========================================================================
  describe('Programmatic SEO - Combination Page', () => {
    const pagePath = path.join(process.cwd(), 'src/app/pick3/combinacion/[digits]/page.tsx');
    const clientPath = path.join(process.cwd(), 'src/app/pick3/combinacion/[digits]/CombinationPageClient.tsx');

    it('los archivos existen', () => {
      expect(fs.existsSync(pagePath)).toBe(true);
      expect(fs.existsSync(clientPath)).toBe(true);
    });

    it('valida combinación de 3 dígitos', () => {
      const content = fs.readFileSync(pagePath, 'utf-8');
      expect(content).toContain('/^\\d{3}$/');
    });

    it('genera metadata SEO', () => {
      const content = fs.readFileSync(pagePath, 'utf-8');
      expect(content).toContain('generateMetadata');
      expect(content).toContain('title:');
      expect(content).toContain('description:');
      expect(content).toContain('canonical');
      expect(content).toContain('openGraph');
    });

    it('genera JSON-LD structured data', () => {
      const content = fs.readFileSync(pagePath, 'utf-8');
      expect(content).toContain('application/ld+json');
      expect(content).toContain('Dataset');
      expect(content).toContain('schema.org');
    });

    it('usa Pick3Storage para cargar histórico', () => {
      const content = fs.readFileSync(pagePath, 'utf-8');
      expect(content).toContain('Pick3Storage.getHistory()');
    });

    it('calcula stats: total, expected, bias, gap', () => {
      const content = fs.readFileSync(pagePath, 'utf-8');
      expect(content).toContain('totalAppearances');
      expect(content).toContain('expectedAppearances');
      expect(content).toContain('biasPercentage');
      expect(content).toContain('gapDays');
    });

    it('ejecuta tests estadísticos', () => {
      const content = fs.readFileSync(pagePath, 'utf-8');
      expect(content).toContain('runFullStatisticalTests');
    });

    it('genera static params para combinaciones populares', () => {
      const content = fs.readFileSync(pagePath, 'utf-8');
      expect(content).toContain('generateStaticParams');
      expect(content).toContain("'000'");
      expect(content).toContain("'123'");
      expect(content).toContain("'999'");
    });

    it('tiene revalidate para ISR', () => {
      const content = fs.readFileSync(pagePath, 'utf-8');
      expect(content).toContain('revalidate');
    });

    it('client component muestra stats honestas', () => {
      const content = fs.readFileSync(clientPath, 'utf-8');
      expect(content).toContain('Distribución Aleatoria Confirmada');
      expect(content).toContain('Anomalía Estadística Detectada');
      expect(content).toContain('expected value negativo');
    });

    it('client component tiene CTA a registro', () => {
      const content = fs.readFileSync(clientPath, 'utf-8');
      expect(content).toContain('Probar gratis 14 días');
      expect(content).toContain('Ver planes');
    });
  });

  // =========================================================================
  // REFERRAL SERVICE & API
  // =========================================================================
  describe('Referral Service & API', () => {
    const servicePath = path.join(process.cwd(), 'src/services/pick3/referral.service.ts');
    const apiPath = path.join(process.cwd(), 'src/app/api/pick3/referral/route.ts');

    it('los archivos existen', () => {
      expect(fs.existsSync(servicePath)).toBe(true);
      expect(fs.existsSync(apiPath)).toBe(true);
    });

    it('servicio tiene métodos requeridos', async () => {
      const service = await import('@/services/pick3/referral.service');
      expect(service.ReferralService.getOrCreateReferralCode).toBeDefined();
      expect(service.ReferralService.registerReferral).toBeDefined();
      expect(service.ReferralService.markAsConverted).toBeDefined();
      expect(service.ReferralService.applyReward).toBeDefined();
      expect(service.ReferralService.getReferralStats).toBeDefined();
      expect(service.ReferralService.getReferrals).toBeDefined();
    });

    it('API route valida sesión', () => {
      const content = fs.readFileSync(apiPath, 'utf-8');
      expect(content).toContain('getServerSession(req)');
      expect(content).toContain('No autorizado');
    });

    it('API route soporta acciones register, get_code, get_stats', () => {
      const content = fs.readFileSync(apiPath, 'utf-8');
      expect(content).toContain("case 'register'");
      expect(content).toContain("case 'get_code'");
      expect(content).toContain("case 'get_stats'");
    });

    it('API route genera referralUrl', () => {
      const content = fs.readFileSync(apiPath, 'utf-8');
      expect(content).toContain('referralUrl');
      expect(content).toContain('?ref=');
    });
  });

  // =========================================================================
  // REFERRAL PAGE COMPONENT
  // =========================================================================
  describe('ReferralPage Component', () => {
    const componentPath = path.join(process.cwd(), 'src/components/views/terminal/views/pick3/ReferralPage.tsx');

    it('el componente existe', () => {
      expect(fs.existsSync(componentPath)).toBe(true);
    });

    it('muestra código de referido', () => {
      const content = fs.readFileSync(componentPath, 'utf-8');
      expect(content).toContain('referralCode');
      expect(content).toContain('Tu código de referido');
    });

    it('tiene botón de copiar y compartir', () => {
      const content = fs.readFileSync(componentPath, 'utf-8');
      expect(content).toContain('handleCopy');
      expect(content).toContain('handleShare');
      expect(content).toContain('navigator.share');
      expect(content).toContain('navigator.clipboard');
    });

    it('muestra stats de referidos', () => {
      const content = fs.readFileSync(componentPath, 'utf-8');
      expect(content).toContain('Total referidos');
      expect(content).toContain('Convertidos');
      expect(content).toContain('Conversión');
      expect(content).toContain('Premios ganados');
    });

    it('explica cómo funciona (3 pasos)', () => {
      const content = fs.readFileSync(componentPath, 'utf-8');
      expect(content).toContain('Comparte tu enlace');
      expect(content).toContain('Tu amigo se registra');
      expect(content).toContain('Tu amigo se suscribe');
    });
  });

  // =========================================================================
  // DATABASE VERIFICATION
  // =========================================================================
  describe('Database — pick3_referrals table', () => {
    it('la tabla existe en Supabase', async () => {
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wthkddeleylijmonclxg.supabase.co';
      const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      if (!SERVICE_ROLE_KEY) {
        console.log('[SKIP] No SUPABASE_SERVICE_ROLE_KEY in env');
        return;
      }
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/pick3_referrals?select=id&limit=1`,
        {
          headers: {
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          },
        },
      );
      expect(response.status).toBe(200);
    }, 15000);
  });
});
