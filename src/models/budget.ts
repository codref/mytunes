import type { AiBackendId } from './settings';

export type { AiBackendId };

export const COST_CLIP_USD = 0.04;
export const COST_FULL_USD = 0.08;

/** Rough Flash estimate when usage metadata is missing */
export const COST_FLASH_FALLBACK_USD = 0.001;

export type LedgerKind = 'flash' | 'clip' | 'full' | 'blocked' | 'failed';

export interface BackendSpend {
  sessionSpentUsd: number;
  daySpentUsd: number;
}

export interface LedgerEntry {
  id: string;
  ts: string;
  kind: LedgerKind;
  model: string;
  costUsd: number;
  /** Which Google wallet this charge hit */
  backend?: AiBackendId;
  patternId?: string;
  promptHash?: string;
  ok: boolean;
  note?: string;
}

export interface BudgetState {
  sessionSpentUsd: number;
  daySpentUsd: number;
  dayKey: string;
  sessionLimitUsd: number;
  dayLimitUsd: number;
  vertex: BackendSpend;
  geminiApi: BackendSpend;
  entries: LedgerEntry[];
}

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function emptyBackendSpend(): BackendSpend {
  return { sessionSpentUsd: 0, daySpentUsd: 0 };
}

export function createDefaultBudget(): BudgetState {
  return {
    sessionSpentUsd: 0,
    daySpentUsd: 0,
    dayKey: todayKey(),
    sessionLimitUsd: 5,
    dayLimitUsd: 10,
    vertex: emptyBackendSpend(),
    geminiApi: emptyBackendSpend(),
    entries: [],
  };
}

export function estimateMusicCost(mode: 'clip' | 'full'): number {
  return mode === 'clip' ? COST_CLIP_USD : COST_FULL_USD;
}

export type BudgetGate = 'ok' | 'soft' | 'hard';

export function evaluateBudget(
  state: BudgetState,
  nextCost: number,
): { gate: BudgetGate; sessionAfter: number; dayAfter: number } {
  const daySpent = state.dayKey === todayKey() ? state.daySpentUsd : 0;
  const sessionAfter = state.sessionSpentUsd + nextCost;
  const dayAfter = daySpent + nextCost;

  if (sessionAfter > state.sessionLimitUsd || dayAfter > state.dayLimitUsd) {
    return { gate: 'hard', sessionAfter, dayAfter };
  }
  if (
    sessionAfter >= state.sessionLimitUsd * 0.8 ||
    dayAfter >= state.dayLimitUsd * 0.8
  ) {
    return { gate: 'soft', sessionAfter, dayAfter };
  }
  return { gate: 'ok', sessionAfter, dayAfter };
}

export function backendSpendBucket(
  state: BudgetState,
  backend: AiBackendId,
): BackendSpend {
  return backend === 'vertex' ? state.vertex : state.geminiApi;
}
