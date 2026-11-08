export const COST_CLIP_USD = 0.04;
export const COST_FULL_USD = 0.08;

/** Rough Flash estimate when usage metadata is missing */
export const COST_FLASH_FALLBACK_USD = 0.001;

export type LedgerKind = 'flash' | 'clip' | 'full' | 'blocked' | 'failed';

export interface LedgerEntry {
  id: string;
  ts: string;
  kind: LedgerKind;
  model: string;
  costUsd: number;
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
  entries: LedgerEntry[];
}

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function createDefaultBudget(): BudgetState {
  return {
    sessionSpentUsd: 0,
    daySpentUsd: 0,
    dayKey: todayKey(),
    sessionLimitUsd: 5,
    dayLimitUsd: 10,
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
