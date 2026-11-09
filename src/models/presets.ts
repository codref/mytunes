import type {
  BandSlotId,
  CompositionMode,
  PatternSong,
  PatternSongAuto,
  TimelineSegment,
  VocalVoice,
} from './pattern';

export type SlotPresetPayload = {
  enabled: boolean;
  knobs: Record<string, number | string | boolean>;
  notes: string;
  voices?: VocalVoice[];
};

export type SongPresetPayload = Pick<
  PatternSong,
  | 'genre'
  | 'mood'
  | 'bpm'
  | 'timeSignature'
  | 'key'
  | 'energy'
  | 'structure'
  | 'durationHint'
  | 'instrumental'
  | 'language'
  | 'soundscape'
  | 'productionQuality'
  | 'timeline'
> & {
  auto?: PatternSongAuto;
  compositionMode?: CompositionMode;
};

export interface SlotPreset {
  id: string;
  kind: 'slot';
  slotId: BandSlotId;
  name: string;
  enabled: boolean;
  knobs: Record<string, number | string | boolean>;
  notes: string;
  voices?: VocalVoice[];
  updatedAt: string;
}

export interface SongPreset {
  id: string;
  kind: 'song';
  name: string;
  song: SongPresetPayload;
  updatedAt: string;
}

export type StudioPreset = SlotPreset | SongPreset;

export function isSlotPreset(preset: StudioPreset): preset is SlotPreset {
  return preset.kind === 'slot';
}

export function isSongPreset(preset: StudioPreset): preset is SongPreset {
  return preset.kind === 'song';
}

export function songPresetFromPatternSong(
  song: PatternSong,
  compositionMode?: CompositionMode,
): SongPresetPayload {
  const payload: SongPresetPayload = {
    genre: song.genre,
    mood: song.mood,
    bpm: song.bpm,
    timeSignature: song.timeSignature,
    key: song.key,
    energy: song.energy,
    structure: [...song.structure],
    instrumental: song.instrumental,
    language: song.language,
    soundscape: song.soundscape ?? '',
    productionQuality: song.productionQuality ?? '',
    timeline: structuredClone(song.timeline ?? []) satisfies TimelineSegment[],
    auto: song.auto ? { ...song.auto } : {},
    compositionMode: compositionMode ?? 'sections',
  };
  if (song.durationHint !== undefined) {
    payload.durationHint = song.durationHint;
  }
  return payload;
}
