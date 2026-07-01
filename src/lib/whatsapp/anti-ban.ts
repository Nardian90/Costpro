/**
 * Anti-Ban System — Protege el número de WhatsApp de bloqueos.
 *
 * Límites estrictos que respetan los patrones de uso humano.
 * Cualquier señal de bloqueo dispara pausas automáticas.
 */

import { logger } from '@/lib/logger';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

export type RiskLevel = 'safe' | 'warning' | 'danger' | 'blocked';

export interface RiskState {
  level: RiskLevel;
  consecutiveBlocks: number;
  cooldownUntil: Date | null;
  dailyInvitationCount: number;
  lastInvitationAt: Date | null;
  lastResetDate: string;
}

export const LIMITS = {
  maxInvitationsPerDay: 20,
  minIntervalMinutes: 15,
  jitterMinutes: 30,
  workingHoursStart: 9,
  workingHoursEnd: 21,
  pauseAfterBlock: 24,
  maxConsecutiveBlocks: 3,
  longPauseDays: 7,
  preMessageTimeoutHours: 24,
};

export interface InviteCheckResult {
  allowed: boolean;
  reason?: string;
  nextAllowedAt?: Date;
}

export function canInviteNow(
  dailyCount: number,
  lastInvitationAt: Date | null,
  riskState: RiskState
): InviteCheckResult {
  // 1. Verificar cooldown por bloqueo
  if (riskState.cooldownUntil && riskState.cooldownUntil > new Date()) {
    return { allowed: false, reason: 'Pausa anti-banneo activa', nextAllowedAt: riskState.cooldownUntil };
  }

  // 2. Verificar límite diario
  if (dailyCount >= LIMITS.maxInvitationsPerDay) {
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    return { allowed: false, reason: 'Límite diario alcanzado', nextAllowedAt: tomorrow };
  }

  // 3. Verificar intervalo mínimo + jitter
  if (lastInvitationAt) {
    const jitter = Math.random() * LIMITS.jitterMinutes;
    const minNext = new Date(
      lastInvitationAt.getTime() + (LIMITS.minIntervalMinutes + jitter) * 60000
    );
    if (new Date() < minNext) {
      return { allowed: false, reason: 'Esperando intervalo anti-detección', nextAllowedAt: minNext };
    }
  }

  // 4. Verificar horario laboral (9 AM - 9 PM hora local)
  const hour = new Date().getHours();
  if (hour < LIMITS.workingHoursStart || hour >= LIMITS.workingHoursEnd) {
    const nextStart = new Date();
    nextStart.setHours(LIMITS.workingHoursStart, 0, 0, 0);
    if (nextStart < new Date()) nextStart.setDate(nextStart.getDate() + 1);
    return { allowed: false, reason: 'Fuera de horario laboral (9 AM - 9 PM)', nextAllowedAt: nextStart };
  }

  return { allowed: true };
}

export function handleInvitationBlock(riskState: RiskState): RiskState {
  const newConsecutive = riskState.consecutiveBlocks + 1;
  let cooldownUntil: Date | null;
  let level: RiskLevel;

  if (newConsecutive >= LIMITS.maxConsecutiveBlocks) {
    // 3 bloqueos consecutivos → pausa 7 días
    cooldownUntil = new Date(Date.now() + LIMITS.longPauseDays * 24 * 60 * 60 * 1000);
    level = 'blocked';
    logger.error('DATABASE', 'ANTI_BAN_LONG_PAUSE', {
      consecutiveBlocks: newConsecutive, cooldownDays: LIMITS.longPauseDays,
    });
  } else if (newConsecutive === 2) {
    // 2 bloqueos → pausa 48h
    cooldownUntil = new Date(Date.now() + 48 * 60 * 60 * 1000);
    level = 'danger';
    logger.warn('DATABASE', 'ANTI_BAN_DANGER', { consecutiveBlocks: newConsecutive });
  } else {
    // 1 bloqueo → pausa 24h
    cooldownUntil = new Date(Date.now() + LIMITS.pauseAfterBlock * 60 * 60 * 1000);
    level = 'warning';
    logger.warn('DATABASE', 'ANTI_BAN_WARNING', { consecutiveBlocks: newConsecutive });
  }

  return {
    ...riskState,
    level,
    consecutiveBlocks: newConsecutive,
    cooldownUntil,
  };
}

export function resetRiskIfStale(riskState: RiskState): RiskState {
  // Reset tras 7 días sin bloqueos
  if (riskState.level !== 'safe' && riskState.consecutiveBlocks > 0) {
    if (riskState.cooldownUntil && new Date() > new Date(riskState.cooldownUntil.getTime() + 7 * 24 * 60 * 60 * 1000)) {
      logger.info('DATABASE', 'ANTI_BAN_RESET', { wasLevel: riskState.level });
      return {
        ...riskState,
        level: 'safe',
        consecutiveBlocks: 0,
        cooldownUntil: null,
      };
    }
  }

  // Reset del conteo diario a medianoche
  const today = new Date().toISOString().split('T')[0];
  if (riskState.lastResetDate !== today) {
    return {
      ...riskState,
      dailyInvitationCount: 0,
      lastResetDate: today,
    };
  }

  return riskState;
}

/**
 * Carga o crea el RiskState de una tienda desde la BD.
 */
export async function getRiskState(storeId: string): Promise<RiskState> {
  const admin = getSupabaseAdminSafe();
  if (!admin) throw new Error('Admin client not available');

  const { data } = await admin
    .from('whatsapp_risk_state')
    .select('*')
    .eq('store_id', storeId)
    .single();

  if (!data) {
    // Crear estado inicial
    const initial = {
      store_id: storeId,
      level: 'safe',
      consecutive_blocks: 0,
      cooldown_until: null,
      daily_invitation_count: 0,
      last_invitation_at: null,
      last_reset_date: new Date().toISOString().split('T')[0],
    };
    const { data: created } = await admin.from('whatsapp_risk_state').insert(initial).select().single();
    return dbToRiskState(created || initial);
  }

  return dbToRiskState(data);
}

/**
 * Guarda el RiskState en la BD.
 */
export async function saveRiskState(storeId: string, state: RiskState): Promise<void> {
  const admin = getSupabaseAdminSafe();
  if (!admin) return;

  await admin.from('whatsapp_risk_state').upsert({
    store_id: storeId,
    level: state.level,
    consecutive_blocks: state.consecutiveBlocks,
    cooldown_until: state.cooldownUntil?.toISOString() || null,
    daily_invitation_count: state.dailyInvitationCount,
    last_invitation_at: state.lastInvitationAt?.toISOString() || null,
    last_reset_date: state.lastResetDate,
  }, { onConflict: 'store_id' });
}

function dbToRiskState(data: any): RiskState {
  return {
    level: data.level || 'safe',
    consecutiveBlocks: data.consecutive_blocks || 0,
    cooldownUntil: data.cooldown_until ? new Date(data.cooldown_until) : null,
    dailyInvitationCount: data.daily_invitation_count || 0,
    lastInvitationAt: data.last_invitation_at ? new Date(data.last_invitation_at) : null,
    lastResetDate: data.last_reset_date || new Date().toISOString().split('T')[0],
  };
}
