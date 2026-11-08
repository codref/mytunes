import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { compilePrompt } from '@/models/compilePrompt';
import { toIpcPayload } from '@/models/ipc';
import {
  createDefaultPattern,
  getSlot,
  type BandSlotId,
  type LyriaMode,
  type Pattern,
} from '@/models/pattern';

export const usePatternStore = defineStore('pattern', () => {
  const pattern = ref<Pattern>(createDefaultPattern());
  const compiledPrompt = ref('');
  const busy = ref(false);
  const lastError = ref<string | null>(null);

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
    pattern.value = structuredClone(next);
    recompileLocal();
  }

  function resetPattern() {
    pattern.value = createDefaultPattern();
    recompileLocal();
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

  return {
    pattern,
    compiledPrompt,
    busy,
    lastError,
    mode,
    recompileLocal,
    setSlotEnabled,
    setSlotKnob,
    setSlotNotes,
    loadPattern,
    resetPattern,
    refineWithFlash,
    writeLyrics,
  };
});
