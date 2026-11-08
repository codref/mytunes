import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { HardPatch, SoftPatch } from '@/models/assistant';
import { compilePrompt } from '@/models/compilePrompt';
import { toIpcPayload } from '@/models/ipc';
import {
  createDefaultPattern,
  getSlot,
  normalizePattern,
  type BandSlotId,
  type LyriaMode,
  type Pattern,
} from '@/models/pattern';

export const usePatternStore = defineStore('pattern', () => {
  const pattern = ref<Pattern>(createDefaultPattern());
  const compiledPrompt = ref('');
  const busy = ref(false);
  const lastError = ref<string | null>(null);
  const lastSoftPatches = ref<SoftPatch[]>([]);

  const mode = computed({
    get: () => pattern.value.lyriaMode,
    set: (v: LyriaMode) => {
      pattern.value.lyriaMode = v;
    },
  });

  function recompileLocal() {
    compiledPrompt.value = compilePrompt(pattern.value);
    pattern.value.compiledPrompt = compiledPrompt.value;
  }

  watch(
    pattern,
    () => {
      recompileLocal();
    },
    { deep: true, immediate: true },
  );

  function setSlotEnabled(id: BandSlotId, enabled: boolean) {
    getSlot(pattern.value, id).enabled = enabled;
  }

  function setSlotKnob(id: BandSlotId, key: string, value: number | string | boolean) {
    getSlot(pattern.value, id).knobs[key] = value;
  }

  function setSlotNotes(id: BandSlotId, notes: string) {
    getSlot(pattern.value, id).notes = notes;
  }

  function loadPattern(next: Pattern) {
    // JSON clone: callers may pass Pinia/Vue proxies (structuredClone cannot).
    pattern.value = normalizePattern(JSON.parse(JSON.stringify(next)) as Pattern);
    recompileLocal();
  }

  async function loadSettingsDefaults() {
    if (!window.mytunes) return undefined;
    try {
      return await window.mytunes.getPatternDefaults();
    } catch {
      return undefined;
    }
  }

  async function bootstrapFromSettings() {
    const defaults = await loadSettingsDefaults();
    if (!defaults || !Object.keys(defaults).length) return;
    pattern.value = createDefaultPattern(
      { id: pattern.value.id, name: pattern.value.name },
      defaults,
    );
    recompileLocal();
  }

  async function resetPattern() {
    const defaults = await loadSettingsDefaults();
    pattern.value = createDefaultPattern(undefined, defaults);
    lastSoftPatches.value = [];
    recompileLocal();
  }

  function applySoftPatch(patch: SoftPatch): void {
    const p = pattern.value;
    switch (patch.op) {
      case 'name':
        p.name = String(patch.value);
        break;
      case 'song.genre':
        p.song.genre = String(patch.value);
        break;
      case 'song.mood':
        p.song.mood = String(patch.value);
        break;
      case 'song.bpm':
        p.song.bpm = Number(patch.value);
        break;
      case 'song.timeSignature':
        p.song.timeSignature = String(patch.value);
        break;
      case 'song.key':
        p.song.key = String(patch.value);
        break;
      case 'song.energy':
        p.song.energy = Number(patch.value);
        break;
      case 'song.language':
        p.song.language = String(patch.value);
        break;
      case 'song.instrumental':
        p.song.instrumental = Boolean(patch.value);
        break;
      case 'song.durationHint':
        p.song.durationHint = String(patch.value);
        break;
      case 'slot.enabled':
        if (patch.slotId) setSlotEnabled(patch.slotId as BandSlotId, Boolean(patch.value));
        break;
      case 'slot.notes':
        if (patch.slotId) setSlotNotes(patch.slotId as BandSlotId, String(patch.value));
        break;
      case 'slot.knob':
        if (patch.slotId && patch.knobKey) {
          setSlotKnob(
            patch.slotId as BandSlotId,
            patch.knobKey,
            patch.value as number | string | boolean,
          );
        }
        break;
      default:
        break;
    }
  }

  function applySoftPatches(patches: SoftPatch[]): void {
    for (const patch of patches) {
      applySoftPatch(patch);
    }
    lastSoftPatches.value = structuredClone(patches);
  }

  function undoLastSoftPatches(): boolean {
    const patches = lastSoftPatches.value;
    if (!patches.length) return false;
    for (const patch of [...patches].reverse()) {
      if (patch.previous === undefined) continue;
      applySoftPatch({ ...patch, value: patch.previous });
    }
    lastSoftPatches.value = [];
    return true;
  }

  function applyHardPatch(patch: HardPatch): void {
    const p = pattern.value;
    if (patch.op === 'lyrics') {
      p.lyrics = { text: String(patch.value), source: 'generated' };
    } else if (patch.op === 'structure') {
      p.song.structure = Array.isArray(patch.value)
        ? (patch.value as unknown[]).map((s) => String(s))
        : [];
    } else if (patch.op === 'lyriaMode') {
      p.lyriaMode = patch.value === 'full' ? 'full' : 'clip';
    }
  }

  async function refineWithFlash() {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    busy.value = true;
    lastError.value = null;
    try {
      const result = await window.mytunes.refinePrompt(toIpcPayload(pattern.value));
      compiledPrompt.value = result.compiledPrompt;
      pattern.value.compiledPrompt = result.compiledPrompt;
      return result;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      busy.value = false;
    }
  }

  async function writeLyrics() {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    busy.value = true;
    lastError.value = null;
    try {
      const result = await window.mytunes.writeLyrics(toIpcPayload(pattern.value));
      pattern.value.lyrics = { text: result.lyrics, source: 'generated' };
      return result;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      busy.value = false;
    }
  }

  async function fixLyrics() {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    busy.value = true;
    lastError.value = null;
    try {
      const result = await window.mytunes.fixLyrics(toIpcPayload(pattern.value));
      pattern.value.lyrics = { text: result.lyrics, source: 'generated' };
      return result;
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      busy.value = false;
    }
  }

  return {
    pattern,
    compiledPrompt,
    busy,
    lastError,
    lastSoftPatches,
    mode,
    recompileLocal,
    setSlotEnabled,
    setSlotKnob,
    setSlotNotes,
    loadPattern,
    bootstrapFromSettings,
    resetPattern,
    applySoftPatches,
    undoLastSoftPatches,
    applyHardPatch,
    refineWithFlash,
    writeLyrics,
    fixLyrics,
  };
});
