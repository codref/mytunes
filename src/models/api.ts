import type { BudgetState } from './budget';
import type { GenerationRecord } from './generation';
import type { Pattern } from './pattern';

export interface MytunesApi {
  getKeyStatus: () => Promise<{
    present: boolean;
    backend: 'vertex' | 'gemini-api' | null;
    masked: string | null;
    project: string | null;
    location: string | null;
  }>;
  compilePrompt: (pattern: Pattern) => Promise<{ compiledPrompt: string }>;
  refinePrompt: (
    pattern: Pattern,
  ) => Promise<{ compiledPrompt: string; costUsd: number; model: string; budget: BudgetState }>;
  writeLyrics: (
    pattern: Pattern,
  ) => Promise<{ lyrics: string; costUsd: number; model: string; budget: BudgetState }>;
  generateMusic: (payload: {
    pattern: Pattern;
    compiledPrompt: string;
    mode: 'clip' | 'full';
    force?: boolean;
  }) => Promise<{
    reused: boolean;
    generation: GenerationRecord;
    budget: BudgetState;
    gate?: string;
  }>;
  getBudget: () => Promise<BudgetState>;
  setBudgetLimits: (limits: {
    sessionLimitUsd: number;
    dayLimitUsd: number;
  }) => Promise<BudgetState>;
  checkBudget: (nextCost: number) => Promise<{
    gate: 'ok' | 'soft' | 'hard';
    state: BudgetState;
    sessionAfter: number;
    dayAfter: number;
  }>;
  listGenerations: () => Promise<GenerationRecord[]>;
  listPatterns: () => Promise<Pattern[]>;
  savePattern: (pattern: Pattern) => Promise<Pattern>;
  loadPattern: (id: string) => Promise<Pattern | null>;
  deletePattern: (id: string) => Promise<{ ok: boolean }>;
}
