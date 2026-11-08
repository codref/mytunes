import type {
  AssistantConversation,
  AssistantEvent,
  AssistantChatRequest,
  AssistantPatch,
} from './assistant';
import type { BudgetState } from './budget';
import type { GenerationRecord } from './generation';
import type { Pattern } from './pattern';
import type { AppSettingsPublic, AppSettingsUpdate, PatternDefaults } from './settings';
import type { AppSession, Song } from './song';

export interface MytunesApi {
  getKeyStatus: () => Promise<{
    present: boolean;
    backend: 'vertex' | 'gemini-api' | null;
    masked: string | null;
    project: string | null;
    location: string | null;
  }>;
  getSettings: () => Promise<AppSettingsPublic>;
  setSettings: (update: AppSettingsUpdate) => Promise<AppSettingsPublic>;
  getPatternDefaults: () => Promise<PatternDefaults>;
  compilePrompt: (pattern: Pattern) => Promise<{ compiledPrompt: string }>;
  refinePrompt: (
    pattern: Pattern,
  ) => Promise<{ compiledPrompt: string; costUsd: number; model: string; budget: BudgetState }>;
  writeLyrics: (
    pattern: Pattern,
  ) => Promise<{ lyrics: string; costUsd: number; model: string; budget: BudgetState }>;
  fixLyrics: (
    pattern: Pattern,
  ) => Promise<{ lyrics: string; costUsd: number; model: string; budget: BudgetState }>;
  splitLyriaTranscript: (payload: {
    generationId?: string;
    rawText?: string;
  }) => Promise<{
    lyrics: string;
    arrangementNotes: string;
    usedFlash: boolean;
    costUsd: number;
    model: string;
    generation: GenerationRecord | null;
    budget: BudgetState;
  }>;
  generateMusic: (payload: {
    pattern: Pattern;
    compiledPrompt: string;
    mode: 'clip' | 'full';
    songId?: string | null;
    force?: boolean;
  }) => Promise<{
    reused: boolean;
    generation: GenerationRecord;
    song: Song;
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
  listGenerations: (filter?: { songId?: string }) => Promise<GenerationRecord[]>;
  listSongs: () => Promise<Song[]>;
  saveSong: (song: Song) => Promise<Song>;
  loadSong: (id: string) => Promise<Song | null>;
  deleteSong: (id: string) => Promise<{ ok: boolean }>;
  getSession: () => Promise<AppSession>;
  setSession: (update: Partial<AppSession>) => Promise<AppSession>;
  /** @deprecated Prefer songs */
  listPatterns: () => Promise<Pattern[]>;
  savePattern: (pattern: Pattern) => Promise<Pattern>;
  loadPattern: (id: string) => Promise<Pattern | null>;
  deletePattern: (id: string) => Promise<{ ok: boolean }>;
  assistantChat: (
    request: AssistantChatRequest,
  ) => Promise<{
    message: string;
    patches: AssistantPatch[];
    costUsd: number;
    model: string;
    budget: BudgetState;
  }>;
  assistantCancel: (conversationId: string) => Promise<{ ok: boolean }>;
  onAssistantEvent: (handler: (event: AssistantEvent) => void) => () => void;
  listAssistantConversations: () => Promise<AssistantConversation[]>;
  saveAssistantConversation: (conversation: AssistantConversation) => Promise<AssistantConversation>;
  loadAssistantConversation: (id: string) => Promise<AssistantConversation | null>;
  deleteAssistantConversation: (id: string) => Promise<{ ok: boolean }>;
}
