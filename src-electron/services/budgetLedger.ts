import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  createDefaultBudget,
  emptyBackendSpend,
  evaluateBudget,
  todayKey,
  type AiBackendId,
  type BudgetGate,
  type BudgetState,
  type LedgerEntry,
  type LedgerKind,
} from '../../src/models/budget';

function ledgerPath(): string {
  return path.join(app.getPath('userData'), 'budget-ledger.json');
}

function normalizeDay(state: BudgetState): BudgetState {
  const key = todayKey();
  if (state.dayKey !== key) {
    return {
      ...state,
      dayKey: key,
      daySpentUsd: 0,
      vertex: { ...state.vertex, daySpentUsd: 0 },
      geminiApi: { ...state.geminiApi, daySpentUsd: 0 },
    };
  }
  return state;
}

function ensureBackendBuckets(state: BudgetState): BudgetState {
  return {
    ...state,
    vertex: state.vertex ?? emptyBackendSpend(),
    geminiApi: state.geminiApi ?? emptyBackendSpend(),
  };
}

export function loadBudget(): BudgetState {
  const file = ledgerPath();
  if (!fs.existsSync(file)) {
    return createDefaultBudget();
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<BudgetState>;
    return normalizeDay(
      ensureBackendBuckets({
        ...createDefaultBudget(),
        ...raw,
        vertex: { ...emptyBackendSpend(), ...(raw.vertex ?? {}) },
        geminiApi: { ...emptyBackendSpend(), ...(raw.geminiApi ?? {}) },
      }),
    );
  } catch {
    return createDefaultBudget();
  }
}

export function saveBudget(state: BudgetState): void {
  const file = ledgerPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
}

export function getBudgetSnapshot(): BudgetState {
  return loadBudget();
}

export function setBudgetLimits(sessionLimitUsd: number, dayLimitUsd: number): BudgetState {
  const state = loadBudget();
  state.sessionLimitUsd = sessionLimitUsd;
  state.dayLimitUsd = dayLimitUsd;
  saveBudget(state);
  return state;
}

export function checkBudget(nextCost: number): {
  gate: BudgetGate;
  state: BudgetState;
  sessionAfter: number;
  dayAfter: number;
} {
  const state = loadBudget();
  const result = evaluateBudget(state, nextCost);
  return { ...result, state };
}

export function appendLedger(
  entry: Omit<LedgerEntry, 'id' | 'ts'> & { id?: string; ts?: string },
): BudgetState {
  const state = loadBudget();
  const full: LedgerEntry = {
    id: entry.id ?? crypto.randomUUID(),
    ts: entry.ts ?? new Date().toISOString(),
    kind: entry.kind,
    model: entry.model,
    costUsd: entry.costUsd,
    ok: entry.ok,
  };
  if (entry.backend) full.backend = entry.backend;
  if (entry.patternId) full.patternId = entry.patternId;
  if (entry.promptHash) full.promptHash = entry.promptHash;
  if (entry.note) full.note = entry.note;
  state.entries.unshift(full);
  state.entries = state.entries.slice(0, 500);
  if (full.ok && full.costUsd > 0) {
    state.sessionSpentUsd += full.costUsd;
    state.daySpentUsd += full.costUsd;
    if (full.backend === 'vertex') {
      state.vertex.sessionSpentUsd += full.costUsd;
      state.vertex.daySpentUsd += full.costUsd;
    } else if (full.backend === 'gemini-api') {
      state.geminiApi.sessionSpentUsd += full.costUsd;
      state.geminiApi.daySpentUsd += full.costUsd;
    }
  }
  saveBudget(state);
  return state;
}

export function findSuccessfulByHash(promptHash: string, kind: LedgerKind): LedgerEntry | undefined {
  const state = loadBudget();
  return state.entries.find((e) => e.ok && e.promptHash === promptHash && e.kind === kind);
}

export type { AiBackendId };
