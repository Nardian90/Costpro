/**
 * Data Retention Management Module
 *
 * Manages automated data retention policies for CostPro Enterprise.
 * Provides functions to check, execute, and track retention actions
 * (delete or anonymize) on different categories of stored data.
 *
 * Execution state is persisted to `data/retention-state.json`.
 *
 * @module data-retention
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ── Types ──────────────────────────────────────────────

export interface RetentionPolicy {
  id: string;
  category: string;
  description: string;
  retentionDays: number;
  action: 'delete' | 'anonymize';
  lastRun?: string;
}

export interface RetentionCheckResult {
  shouldProcess: boolean;
  daysUntilAction: number;
}

// ── Constants ──────────────────────────────────────────

const STATE_FILE_PATH = join(process.cwd(), 'data', 'retention-state.json');

export const RETENTION_POLICIES: RetentionPolicy[] = [
  {
    id: 'rp-technical-logs',
    category: 'technical_logs',
    description: 'Registros técnicos de aplicación (logs de servidor, métricas)',
    retentionDays: 365,
    action: 'delete',
  },
  {
    id: 'rp-session-data',
    category: 'session_data',
    description: 'Datos de sesión de usuario (tokens, sesiones activas)',
    retentionDays: 30,
    action: 'delete',
  },
  {
    id: 'rp-ai-interactions',
    category: 'ai_interactions',
    description: 'Interacciones con el asistente IA (historial de chat, prompts)',
    retentionDays: 365,
    action: 'anonymize',
  },
  {
    id: 'rp-inactive-accounts',
    category: 'inactive_accounts',
    description: 'Cuentas de usuario inactivas (sin actividad por más de 2 años)',
    retentionDays: 730,
    action: 'delete',
  },
];

// ── State Persistence ──────────────────────────────────

interface RetentionState {
  [policyId: string]: string; // policyId → ISO date of last execution
}

function readState(): RetentionState {
  try {
    if (!existsSync(STATE_FILE_PATH)) {
      return {};
    }
    const raw = readFileSync(STATE_FILE_PATH, 'utf-8');
    return JSON.parse(raw) as RetentionState;
  } catch {
    return {};
  }
}

function writeState(state: RetentionState): void {
  const dir = join(process.cwd(), 'data');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

// ── Public Functions ───────────────────────────────────

/**
 * Returns all defined retention policies with their current execution state.
 */
export function getRetentionPolicies(): RetentionPolicy[] {
  const state = readState();
  return RETENTION_POLICIES.map((policy) => ({
    ...policy,
    lastRun: state[policy.id] ?? undefined,
  }));
}

/**
 * Checks whether a specific retention policy should be executed now.
 *
 * @param category - The policy category to check (e.g., 'technical_logs')
 * @returns An object with `shouldProcess` (boolean) and `daysUntilAction` (number)
 */
export function checkRetentionPolicy(category: string): RetentionCheckResult {
  const policy = RETENTION_POLICIES.find((p) => p.category === category);

  if (!policy) {
    return { shouldProcess: false, daysUntilAction: -1 };
  }

  const state = readState();
  const lastRunStr = state[policy.id];
  const now = Date.now();

  if (!lastRunStr) {
    // Never executed — treat as expired
    return { shouldProcess: true, daysUntilAction: 0 };
  }

  const lastRunDate = new Date(lastRunStr).getTime();
  const elapsedMs = now - lastRunDate;
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));

  if (elapsedDays >= policy.retentionDays) {
    return { shouldProcess: true, daysUntilAction: 0 };
  }

  const daysRemaining = policy.retentionDays - elapsedDays;
  return { shouldProcess: false, daysUntilAction: daysRemaining };
}

/**
 * Marks a retention policy as executed by persisting the current timestamp.
 *
 * @param category - The policy category to mark (e.g., 'session_data')
 */
export function markPolicyExecuted(category: string): void {
  const policy = RETENTION_POLICIES.find((p) => p.category === category);

  if (!policy) {
    return;
  }

  const state = readState();
  state[policy.id] = new Date().toISOString();
  writeState(state);
}

/**
 * Returns all retention policies that should be executed now
 * (i.e., policies whose retention period has elapsed since the last execution).
 */
export function getExpiredPolicies(): RetentionPolicy[] {
  return RETENTION_POLICIES.filter((policy) => {
    const check = checkRetentionPolicy(policy.category);
    return check.shouldProcess;
  });
}
