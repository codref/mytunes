import type {
  AssistantConversation,
  AssistantEvent,
  AssistantChatRequest,
  AssistantPatch,
} from './assistant';
import type { BudgetState } from './budget';
import type { ListChatModelsResult } from './chatModels';
import type { ListLyriaModelsResult } from './lyriaModels';
import type { GenerationRecord } from './generation';
import type { Pattern } from './pattern';
import type { StudioPreset } from './presets';
import type { AppSettingsPublic, AppSettingsUpdate, PatternDefaults } from './settings';
import type { AppSession, Song } from './song';

export interface PurposeBackendStatus {
  present: boolean;
  backend: 'vertex' | 'gemini-api' | null;
  label: string | null;
}

export interface MytunesApi {
  getKeyStatus: () => Promise<{
    present: boolean;
    assistant: PurposeBackendStatus;
    music: PurposeBackendStatus;
    vertexConfigured: boolean;
    geminiConfigured: boolean;
  }>;
  getSettings: () => Promise<AppSettingsPublic>;
  setSettings: (update: AppSettingsUpdate) => Promise<AppSettingsPublic>;
  getPatternDefaults: () => Promise<PatternDefaults>;
  /** Gemini chat models for the assistant picker (disk-cached). */
  listChatModels: (opts?: { force?: boolean }) => Promise<ListChatModelsResult>;
  /** Lyria music models for clip/full generation (disk-cached). */
  listLyriaModels: (opts?: { force?: boolean }) => Promise<ListLyriaModelsResult>;
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
    /** Override Settings Lyria model for this request */
    model?: string;
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
  patchGeneration: (
    id: string,
    patch: Partial<Pick<GenerationRecord, 'userNotes'>>,
  ) => Promise<GenerationRecord | null>;
  forkGeneration: (
    generationId: string,
    name: string,
  ) => Promise<{ song: Song; generation: GenerationRecord }>;
  exportVideo: (generationId: string) => Promise<{
    mp4Path: string;
    srtPath: string;
    durationSec: number;
    cueCount: number;
  }>;
  /** Native save dialog → pack one history take as a .tune ZIP. */
  exportTuneGeneration: (
    generationId: string,
  ) => Promise<
    | { canceled: true }
    | { canceled: false; path: string; generationCount: number }
  >;
  onExportVideoProgress: (
    handler: (event: {
      generationId: string;
      percent: number | null;
      message: string;
    }) => void,
  ) => () => void;
  revealInFolder: (filePath: string) => Promise<{ ok: boolean }>;
  listSongs: () => Promise<Song[]>;
  saveSong: (song: Song) => Promise<Song>;
  loadSong: (id: string) => Promise<Song | null>;
  deleteSong: (id: string) => Promise<{ ok: boolean }>;
  /** Native save dialog → pack song + all takes into a .tune ZIP. */
  exportTune: (
    songId: string,
  ) => Promise<
    | { canceled: true }
    | { canceled: false; path: string; generationCount: number }
  >;
  /** Native open dialog → unpack .tune into library (new ids). */
  importTune: () => Promise<
    | { canceled: true }
    | { canceled: false; song: Song; generationCount: number }
  >;
  listPresets: () => Promise<StudioPreset[]>;
  savePreset: (preset: StudioPreset) => Promise<StudioPreset>;
  deletePreset: (id: string) => Promise<{ ok: boolean }>;
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
