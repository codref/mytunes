export type LyriaMode = 'clip' | 'full';
export type BandSlotId = 'vocals' | 'drums' | 'bass' | 'guitars' | 'keys' | 'other';
export type LyricsSource = 'manual' | 'generated';

export interface BandSlot {
  id: BandSlotId;
  enabled: boolean;
  knobs: Record<string, number | string | boolean>;
  notes: string;
}

export interface PatternSong {
  genre: string;
  mood: string;
  bpm: number;
  key: string;
  energy: number;
  structure: string[];
  durationHint?: string;
  instrumental: boolean;
  language: string;
}

export interface Pattern {
  id: string;
  name: string;
  song: PatternSong;
  lyrics: { text: string; source: LyricsSource };
  slots: BandSlot[];
  compiledPrompt?: string;
  lyriaMode: LyriaMode;
}

export const BAND_SLOT_IDS: BandSlotId[] = [
  'vocals',
  'drums',
  'bass',
  'guitars',
  'keys',
  'other',
];

export const DEFAULT_STRUCTURE = [
  '[Intro]',
  '[Verse 1]',
  '[Chorus]',
  '[Verse 2]',
  '[Chorus]',
  '[Bridge]',
  '[Outro]',
];

export const MUSIC_KEYS = [
  'C major',
  'G major',
  'D major',
  'A major',
  'E major',
  'F major',
  'A minor',
  'E minor',
  'D minor',
  'B minor',
  'C minor',
  'G minor',
];

function defaultSlot(id: BandSlotId): BandSlot {
  const presets: Record<BandSlotId, BandSlot> = {
    vocals: {
      id: 'vocals',
      enabled: true,
      knobs: {
        style: 'smooth',
        range: 'mid',
        delivery: 'melodic',
        presence: 70,
      },
      notes: '',
    },
    drums: {
      id: 'drums',
      enabled: true,
      knobs: {
        groove: 'steady',
        complexity: 40,
        fills: 30,
      },
      notes: '',
    },
    bass: {
      id: 'bass',
      enabled: true,
      knobs: {
        style: 'melodic',
        syncopation: 35,
      },
      notes: '',
    },
    guitars: {
      id: 'guitars',
      enabled: true,
      knobs: {
        style: 'electric clean',
        intensity: 50,
      },
      notes: '',
    },
    keys: {
      id: 'keys',
      enabled: false,
      knobs: {
        style: 'piano',
        intensity: 40,
      },
      notes: '',
    },
    other: {
      id: 'other',
      enabled: false,
      knobs: {
        style: 'synth pads',
        intensity: 35,
      },
      notes: '',
    },
  };
  return structuredClone(presets[id]);
}

export function createDefaultPattern(partial?: Partial<Pattern>): Pattern {
  const baseSong: PatternSong = {
    genre: 'indie pop',
    mood: 'dreamy',
    bpm: 110,
    key: 'G major',
    energy: 55,
    structure: [...DEFAULT_STRUCTURE],
    durationHint: 'create a 2-minute song',
    instrumental: false,
    language: 'English',
  };

  const pattern: Pattern = {
    id: partial?.id ?? crypto.randomUUID(),
    name: partial?.name ?? 'Untitled Pattern',
    song: { ...baseSong, ...partial?.song },
    lyrics: partial?.lyrics ?? { text: '', source: 'manual' },
    slots: partial?.slots ?? BAND_SLOT_IDS.map(defaultSlot),
    lyriaMode: partial?.lyriaMode ?? 'clip',
  };
  if (partial?.compiledPrompt) {
    pattern.compiledPrompt = partial.compiledPrompt;
  }
  return pattern;
}

export function getSlot(pattern: Pattern, id: BandSlotId): BandSlot {
  const slot = pattern.slots.find((s) => s.id === id);
  if (!slot) {
    throw new Error(`Missing band slot: ${id}`);
  }
  return slot;
}
