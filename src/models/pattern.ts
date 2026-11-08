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
  /** Meter as N/D, e.g. 4/4, 3/4, 6/8. */
  timeSignature: string;
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

export const TIME_SIGNATURES = ['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'] as const;

export const DEFAULT_TIME_SIGNATURE = '4/4';

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

export interface PatternDefaultOverrides {
  genre?: string;
  mood?: string;
  bpm?: number;
  timeSignature?: string;
  key?: string;
  energy?: number;
  language?: string;
  lyriaMode?: LyriaMode;
}

export function createDefaultPattern(
  partial?: Partial<Pattern>,
  defaults?: PatternDefaultOverrides,
): Pattern {
  const baseSong: PatternSong = {
    genre: defaults?.genre ?? 'indie pop',
    mood: defaults?.mood ?? 'dreamy',
    bpm: defaults?.bpm ?? 110,
    timeSignature: defaults?.timeSignature ?? DEFAULT_TIME_SIGNATURE,
    key: defaults?.key ?? 'G major',
    energy: defaults?.energy ?? 55,
    structure: [...DEFAULT_STRUCTURE],
    durationHint: 'create a 2-minute song',
    instrumental: false,
    language: defaults?.language ?? 'English',
  };

  const pattern: Pattern = {
    id: partial?.id ?? crypto.randomUUID(),
    name: partial?.name ?? 'Untitled Pattern',
    song: { ...baseSong, ...partial?.song },
    lyrics: partial?.lyrics ?? { text: '', source: 'manual' },
    slots: partial?.slots ?? BAND_SLOT_IDS.map(defaultSlot),
    lyriaMode: partial?.lyriaMode ?? defaults?.lyriaMode ?? 'clip',
  };
  normalizePatternSong(pattern.song);
  if (partial?.compiledPrompt) {
    pattern.compiledPrompt = partial.compiledPrompt;
  }
  return pattern;
}

/** Fill fields missing from older saved patterns. */
export function normalizePatternSong(song: PatternSong): PatternSong {
  if (!song.timeSignature?.trim()) {
    song.timeSignature = DEFAULT_TIME_SIGNATURE;
  }
  return song;
}

export function normalizePattern(pattern: Pattern): Pattern {
  normalizePatternSong(pattern.song);
  return pattern;
}

export function getSlot(pattern: Pattern, id: BandSlotId): BandSlot {
  const slot = pattern.slots.find((s) => s.id === id);
  if (!slot) {
    throw new Error(`Missing band slot: ${id}`);
  }
  return slot;
}
