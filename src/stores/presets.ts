import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { toIpcPayload } from '@/models/ipc';
import type { BandSlotId } from '@/models/pattern';
import {
  isSlotPreset,
  isSongPreset,
  songPresetFromPatternSong,
  type SlotPreset,
  type SongPreset,
  type StudioPreset,
} from '@/models/presets';
import { usePatternStore } from '@/stores/pattern';

export const usePresetsStore = defineStore('presets', () => {
  const presets = ref<StudioPreset[]>([]);
  const busy = ref(false);
  const lastError = ref<string | null>(null);

  const songPresets = computed(() => presets.value.filter(isSongPreset));

  function slotPresets(slotId: BandSlotId): SlotPreset[] {
    return presets.value.filter((p): p is SlotPreset => isSlotPreset(p) && p.slotId === slotId);
  }

  async function refresh(): Promise<void> {
    if (!window.mytunes) {
      presets.value = [];
      return;
    }
    busy.value = true;
    lastError.value = null;
    try {
      presets.value = await window.mytunes.listPresets();
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      busy.value = false;
    }
  }

  async function saveSongPreset(name: string): Promise<SongPreset> {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    const pattern = usePatternStore().pattern;
    const preset: SongPreset = {
      id: crypto.randomUUID(),
      kind: 'song',
      name: name.trim(),
      song: songPresetFromPatternSong(pattern.song, pattern.compositionMode),
      updatedAt: new Date().toISOString(),
    };
    const saved = (await window.mytunes.savePreset(toIpcPayload(preset))) as SongPreset;
    await refresh();
    return saved;
  }

  async function saveSlotPreset(slotId: BandSlotId, name: string): Promise<SlotPreset> {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    const pattern = usePatternStore().pattern;
    const slot = pattern.slots.find((s) => s.id === slotId);
    if (!slot) throw new Error(`Missing slot: ${slotId}`);
    const preset: SlotPreset = {
      id: crypto.randomUUID(),
      kind: 'slot',
      slotId,
      name: name.trim(),
      enabled: slot.enabled,
      knobs: { ...slot.knobs },
      notes: slot.notes,
      updatedAt: new Date().toISOString(),
      ...(slot.voices?.length
        ? { voices: structuredClone(toIpcPayload(slot.voices)) }
        : {}),
    };
    const saved = (await window.mytunes.savePreset(toIpcPayload(preset))) as SlotPreset;
    await refresh();
    return saved;
  }

  function applySongPreset(preset: SongPreset): void {
    const patternStore = usePatternStore();
    const song = patternStore.pattern.song;
    Object.assign(song, {
      genre: preset.song.genre,
      mood: preset.song.mood,
      bpm: preset.song.bpm,
      timeSignature: preset.song.timeSignature,
      key: preset.song.key,
      energy: preset.song.energy,
      structure: [...preset.song.structure],
      durationHint: preset.song.durationHint,
      instrumental: preset.song.instrumental,
      language: preset.song.language,
      soundscape: preset.song.soundscape ?? '',
      productionQuality: preset.song.productionQuality ?? '',
      timeline: structuredClone(preset.song.timeline ?? []),
      auto: preset.song.auto ? { ...preset.song.auto } : {},
    });
    if (preset.song.compositionMode === 'timeline' || preset.song.compositionMode === 'sections') {
      patternStore.pattern.compositionMode = preset.song.compositionMode;
    }
  }

  function applySlotPreset(preset: SlotPreset): void {
    const patternStore = usePatternStore();
    const slot = patternStore.pattern.slots.find((s) => s.id === preset.slotId);
    if (!slot) return;
    slot.enabled = preset.enabled;
    slot.knobs = { ...preset.knobs };
    slot.notes = preset.notes;
    if (preset.slotId === 'vocals') {
      patternStore.setVocalVoices(
        preset.voices?.length ? structuredClone(toIpcPayload(preset.voices)) : [],
      );
    }
  }

  async function removePreset(id: string): Promise<void> {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    await window.mytunes.deletePreset(id);
    await refresh();
  }

  return {
    presets,
    busy,
    lastError,
    songPresets,
    slotPresets,
    refresh,
    saveSongPreset,
    saveSlotPreset,
    applySongPreset,
    applySlotPreset,
    removePreset,
  };
});
