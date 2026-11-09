import type { Pattern } from './pattern';

export type SoftPatchOp =
  | 'name'
  | 'song.genre'
  | 'song.mood'
  | 'song.bpm'
  | 'song.timeSignature'
  | 'song.key'
  | 'song.energy'
  | 'song.language'
  | 'song.instrumental'
  | 'song.durationHint'
  | 'song.soundscape'
  | 'song.productionQuality'
  | 'slot.enabled'
  | 'slot.knob'
  | 'slot.notes'
  | 'timeline.segment'
  | 'voice';

export interface SoftPatch {
  kind: 'soft';
  id: string;
  op: SoftPatchOp;
  path: string;
  value: unknown;
  label: string;
  /** Prior value for Undo */
  previous?: unknown;
  slotId?: string;
  knobKey?: string;
  segmentId?: string;
  voiceId?: string;
}

export type HardPatchOp = 'lyrics' | 'structure' | 'lyriaMode' | 'timeline' | 'compositionMode';

export interface HardPatch {
  kind: 'hard';
  id: string;
  op: HardPatchOp;
  value: unknown;
  label: string;
  status: 'pending' | 'applied' | 'rejected';
}

export type AssistantPatch = SoftPatch | HardPatch;

export type AssistantMessageRole = 'user' | 'assistant' | 'system';

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  content: string;
  createdAt: string;
  progress?: string;
  softPatches?: SoftPatch[];
  hardPatches?: HardPatch[];
  error?: string;
  costUsd?: number;
  model?: string;
}

export interface AssistantConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AssistantMessage[];
}

export interface AssistantChatRequest {
  conversationId: string;
  message: string;
  pattern: Pattern;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Selected chat model id (overrides settings flashModel for this turn). */
  model?: string;
}
export type AssistantEvent =
  | { type: 'progress'; conversationId: string; text: string }
  | {
      type: 'done';
      conversationId: string;
      message: string;
      patches: AssistantPatch[];
      costUsd: number;
      model: string;
    }
  | { type: 'error'; conversationId: string; message: string }
  | { type: 'cancelled'; conversationId: string };

export const ASSISTANT_ACTION_CHIPS = [
  { id: 'darker', label: 'Make it darker', prompt: 'Make the mood darker and more atmospheric.' },
  { id: 'drums', label: 'More drums', prompt: 'Increase drum complexity and presence; tighten the groove.' },
  { id: 'instrumental', label: 'Instrumental', prompt: 'Switch to instrumental only — no vocals.' },
  {
    id: 'structure',
    label: 'Suggest structure',
    prompt: 'Propose a song structure that fits the current genre and mood.',
  },
  {
    id: 'timeline',
    label: 'Build timeline',
    prompt:
      'Read the current configuration and transpose it into a coherent timeline with timed segments, directions, and Intensity 1–10. Switch to timeline mode and propose the full timeline for me to Apply.',
  },
] as const;
