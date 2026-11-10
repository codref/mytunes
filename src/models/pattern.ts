import { DEFAULT_LICENSE_PRIMARY } from './licenses';

export type LyriaMode = 'clip' | 'full';
export type CompositionMode = 'sections' | 'timeline';
export type BandSlotId = 'vocals' | 'drums' | 'bass' | 'guitars' | 'keys' | 'other';
export type LyricsSource = 'manual' | 'generated';
export type VocalGender = 'female' | 'male' | 'neutral' | '';

export const MAX_VOCAL_VOICES = 4;

/** Languages Lyria 3 officially supports for vocals. */
export const LYRIA_LANGUAGES = [
  'English',
  'German',
  'Spanish',
  'French',
  'Hindi',
  'Japanese',
  'Korean',
  'Portuguese',
] as const;

export type LyriaLanguage = (typeof LYRIA_LANGUAGES)[number];

export const VOCAL_RANGE_OPTIONS = [
  'baritone',
  'tenor',
  'alto',
  'mezzo',
  'soprano',
  'low',
  'mid',
  'high',
] as const;

export const VOCAL_GENDER_OPTIONS: VocalGender[] = ['', 'female', 'male', 'neutral'];

export const VOCAL_TIMBRE_OPTIONS = [
  'breathy',
  'soulful',
  'gravelly',
  'clear',
  'sweet',
  'raspy',
  'warm',
  'bright',
] as const;

export interface VocalVoice {
  id: string;
  name: string;
  style: string;
  range: string;
  delivery: string;
  presence: number;
  notes: string;
  gender?: VocalGender;
  timbre?: string;
}

export interface BandSlot {
  id: BandSlotId;
  enabled: boolean;
  knobs: Record<string, number | string | boolean>;
  notes: string;
  /** Vocals only: ordered roster. Absent on other slots. */
  voices?: VocalVoice[];
}

/** When true, field value is kept in the UI but omitted from Lyria/Flash prompts. */
export interface PatternSongAuto {
  durationHint?: boolean;
  structure?: boolean;
}

export interface TimelineSegment {
  id: string;
  startSec: number;
  endSec: number;
  label: string;
  direction: string;
  /** Guide-style intensity 1–10. */
  intensity: number;
}

export type SongMadeBy = 'human' | 'ai' | 'both';

/** Authorship and licensing for the creative work (not the app). */
export interface SongRights {
  composers: string;
  lyricists: string;
  copyrightHolder: string;
  copyrightYear: string;
  /** SPDX id, default CC-BY-SA-4.0. */
  licensePrimary: string;
  /** Optional second SPDX id — dual license (downstream may use either). */
  licenseSecondary: string;
  notice: string;
  madeBy: SongMadeBy;
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
  auto?: PatternSongAuto;
  /** Optional ambient / sonic environment. */
  soundscape?: string;
  /** Optional mix / recording character. */
  productionQuality?: string;
  /** Timed arrangement segments (used when compositionMode is timeline). */
  timeline?: TimelineSegment[];
  /** Composer / copyright / license (excluded from Lyria prompts). */
  rights?: SongRights;
}

export interface Pattern {
  id: string;
  name: string;
  song: PatternSong;
  lyrics: { text: string; source: LyricsSource };
  slots: BandSlot[];
  compiledPrompt?: string;
  lyriaMode: LyriaMode;
  /** sections = lyric tags; timeline = [mm:ss] intensity blocks. */
  compositionMode?: CompositionMode;
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
export const DEFAULT_COMPOSITION_MODE: CompositionMode = 'sections';

export function createDefaultSongRights(partial?: Partial<SongRights>): SongRights {
  return {
    composers: partial?.composers ?? '',
    lyricists: partial?.lyricists ?? '',
    copyrightHolder: partial?.copyrightHolder ?? '',
    copyrightYear: partial?.copyrightYear ?? String(new Date().getFullYear()),
    licensePrimary: partial?.licensePrimary ?? DEFAULT_LICENSE_PRIMARY,
    licenseSecondary: partial?.licenseSecondary ?? '',
    notice: partial?.notice ?? '',
    madeBy: partial?.madeBy ?? 'both',
  };
}

/** Fill missing rights fields. Mutates in place when `raw` is already an object. */
export function normalizeSongRights(raw: Partial<SongRights> | undefined): SongRights {
  if (!raw || typeof raw !== 'object') {
    return createDefaultSongRights();
  }
  if (typeof raw.composers !== 'string') raw.composers = '';
  if (typeof raw.lyricists !== 'string') raw.lyricists = '';
  if (typeof raw.copyrightHolder !== 'string') raw.copyrightHolder = '';
  if (typeof raw.copyrightYear !== 'string') {
    raw.copyrightYear = String(new Date().getFullYear());
  }
  if (typeof raw.licensePrimary !== 'string' || !raw.licensePrimary.trim()) {
    raw.licensePrimary = DEFAULT_LICENSE_PRIMARY;
  }
  if (typeof raw.licenseSecondary !== 'string') raw.licenseSecondary = '';
  if (typeof raw.notice !== 'string') raw.notice = '';
  if (raw.madeBy !== 'human' && raw.madeBy !== 'ai' && raw.madeBy !== 'both') {
    raw.madeBy = 'both';
  }
  return raw as SongRights;
}

export function createVocalVoice(partial?: Partial<VocalVoice>): VocalVoice {
  return {
    id: partial?.id ?? crypto.randomUUID(),
    name: partial?.name ?? 'Lead',
    style: partial?.style ?? 'smooth',
    range: partial?.range ?? 'mid',
    delivery: partial?.delivery ?? 'melodic',
    presence: partial?.presence ?? 70,
    notes: partial?.notes ?? '',
    gender: partial?.gender ?? '',
    timbre: partial?.timbre ?? '',
  };
}

export function createTimelineSegment(partial?: Partial<TimelineSegment>): TimelineSegment {
  return {
    id: partial?.id ?? crypto.randomUUID(),
    startSec: partial?.startSec ?? 0,
    endSec: partial?.endSec ?? 12,
    label: partial?.label ?? 'Intro',
    direction: partial?.direction ?? '',
    intensity: clampIntensity(partial?.intensity ?? 3),
  };
}

export function clampIntensity(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(10, Math.round(n)));
}

export function intensityLabel(n: number): string {
  const v = clampIntensity(n);
  if (v <= 2) return 'Very Low';
  if (v <= 4) return 'Low';
  if (v <= 6) return 'Medium';
  if (v <= 8) return 'Medium-High';
  return 'Very High';
}

/** Mirror legacy knobs from the first voice (assistant soft-patches). */
export function syncVocalKnobsFromLead(slot: BandSlot): void {
  if (slot.id !== 'vocals') return;
  const lead = slot.voices?.[0];
  if (!lead) return;
  slot.knobs = {
    style: lead.style,
    range: lead.range,
    delivery: lead.delivery,
    presence: lead.presence,
  };
}

/** Keep voice[0] aligned when legacy knobs change. */
export function syncLeadVoiceFromKnobs(slot: BandSlot): void {
  if (slot.id !== 'vocals') return;
  ensureVocalVoices(slot);
  const lead = slot.voices?.[0];
  if (!lead) return;
  lead.style = String(slot.knobs.style ?? lead.style);
  lead.range = String(slot.knobs.range ?? lead.range);
  lead.delivery = String(slot.knobs.delivery ?? lead.delivery);
  const presence = Number(slot.knobs.presence);
  lead.presence = Number.isFinite(presence) ? presence : lead.presence;
}

export function ensureVocalVoices(slot: BandSlot): BandSlot {
  if (slot.id !== 'vocals') return slot;
  if (!slot.voices?.length) {
    slot.voices = [
      createVocalVoice({
        name: 'Lead',
        style: String(slot.knobs.style ?? 'smooth'),
        range: String(slot.knobs.range ?? 'mid'),
        delivery: String(slot.knobs.delivery ?? 'melodic'),
        presence: Number(slot.knobs.presence ?? 70),
        notes: slot.notes ?? '',
      }),
    ];
  }
  for (const voice of slot.voices) {
    if (voice.gender === undefined) voice.gender = '';
    if (voice.timbre === undefined) voice.timbre = '';
  }
  syncVocalKnobsFromLead(slot);
  return slot;
}

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
      voices: [createVocalVoice({ name: 'Lead' })],
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
    soundscape: '',
    productionQuality: '',
    timeline: [],
    rights: createDefaultSongRights(),
  };

  const pattern: Pattern = {
    id: partial?.id ?? crypto.randomUUID(),
    name: partial?.name ?? 'Untitled Pattern',
    song: { ...baseSong, ...partial?.song },
    lyrics: partial?.lyrics ?? { text: '', source: 'manual' },
    slots: partial?.slots ?? BAND_SLOT_IDS.map(defaultSlot),
    lyriaMode: partial?.lyriaMode ?? defaults?.lyriaMode ?? 'clip',
    compositionMode: partial?.compositionMode ?? DEFAULT_COMPOSITION_MODE,
  };
  normalizePattern(pattern);
  if (partial?.compiledPrompt) {
    pattern.compiledPrompt = partial.compiledPrompt;
  }
  return pattern;
}

export function isLyriaLanguage(value: string): value is LyriaLanguage {
  return (LYRIA_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeLanguage(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return 'English';
  const exact = (LYRIA_LANGUAGES as readonly string[]).find(
    (l) => l.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exact) return exact;
  // Italian and other unsupported → English
  return 'English';
}

export function getCompositionMode(pattern: Pattern): CompositionMode {
  return pattern.compositionMode === 'timeline' ? 'timeline' : 'sections';
}

/** Strip brackets from a structure tag for timeline labels. */
export function structureLabel(tag: string): string {
  return tag.replace(/^\[|\]$/g, '').trim() || 'Section';
}

/**
 * Build a provisional timeline from structure + duration + energy.
 * Used when switching to timeline mode with an empty timeline.
 */
export function deriveTimelineFromStructure(
  song: PatternSong,
  totalSec: number,
): TimelineSegment[] {
  const labels = (song.structure.length ? song.structure : DEFAULT_STRUCTURE).map(structureLabel);
  const n = Math.max(1, labels.length);
  const span = Math.max(n * 4, totalSec);
  const slice = span / n;
  const baseIntensity = Math.max(1, Math.min(10, Math.round((song.energy / 100) * 8) + 1));
  return labels.map((label, i) => {
    const startSec = Math.round(i * slice * 10) / 10;
    const endSec = Math.round((i === n - 1 ? span : (i + 1) * slice) * 10) / 10;
    let intensity = baseIntensity;
    const lower = label.toLowerCase();
    if (/intro|outro/.test(lower)) intensity = Math.max(1, baseIntensity - 2);
    else if (/chorus|drop|finale/.test(lower)) intensity = Math.min(10, baseIntensity + 2);
    else if (/bridge|build/.test(lower)) intensity = Math.min(10, baseIntensity + 1);
    return createTimelineSegment({
      startSec,
      endSec,
      label,
      direction: '',
      intensity,
    });
  });
}

/** Fill fields missing from older saved patterns. Mutates in place; stable refs. */
export function normalizePatternSong(song: PatternSong): PatternSong {
  if (!song.timeSignature?.trim()) {
    song.timeSignature = DEFAULT_TIME_SIGNATURE;
  }
  if (!song.auto || typeof song.auto !== 'object') {
    song.auto = {};
  }
  const nextLang = normalizeLanguage(song.language);
  if (song.language !== nextLang) song.language = nextLang;
  if (song.soundscape === undefined) song.soundscape = '';
  if (song.productionQuality === undefined) song.productionQuality = '';
  // Keep a stable rights object ref — replacing it every compile retriggers the
  // deep pattern watcher (same footgun as timeline segment arrays).
  if (!song.rights || typeof song.rights !== 'object') {
    song.rights = createDefaultSongRights();
  } else {
    normalizeSongRights(song.rights);
  }
  if (!Array.isArray(song.timeline)) {
    song.timeline = [];
  } else {
    // Patch segments in place — never replace the array/objects on every compile
    // (that retriggers deep pattern watchers → infinite update loops).
    for (const seg of song.timeline) {
      if (!seg.id) seg.id = crypto.randomUUID();
      if (!Number.isFinite(seg.startSec)) seg.startSec = 0;
      if (!Number.isFinite(seg.endSec)) seg.endSec = 0;
      if (!seg.label) seg.label = 'Section';
      if (seg.direction === undefined) seg.direction = '';
      const intensity = clampIntensity(seg.intensity);
      if (seg.intensity !== intensity) seg.intensity = intensity;
    }
  }
  return song;
}

export function normalizePattern(pattern: Pattern): Pattern {
  normalizePatternSong(pattern.song);
  if (pattern.compositionMode !== 'timeline' && pattern.compositionMode !== 'sections') {
    pattern.compositionMode = DEFAULT_COMPOSITION_MODE;
  }
  for (const slot of pattern.slots) {
    if (slot.id === 'vocals') ensureVocalVoices(slot);
  }
  return pattern;
}

export function getSlot(pattern: Pattern, id: BandSlotId): BandSlot {
  const slot = pattern.slots.find((s) => s.id === id);
  if (!slot) {
    throw new Error(`Missing band slot: ${id}`);
  }
  if (id === 'vocals') ensureVocalVoices(slot);
  return slot;
}
