import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { GenerationRecord } from '@/models/generation';
import { toIpcPayload } from '@/models/ipc';
import type { Pattern } from '@/models/pattern';

export const useLibraryStore = defineStore('library', () => {
  const generations = ref<GenerationRecord[]>([]);
  const savedPatterns = ref<Pattern[]>([]);
  const currentGeneration = ref<GenerationRecord | null>(null);
  const generating = ref(false);

  async function refresh() {
    if (!window.mytunes) return;
    const [gens, patterns] = await Promise.all([
      window.mytunes.listGenerations(),
      window.mytunes.listPatterns(),
    ]);
    generations.value = gens;
    savedPatterns.value = patterns;
  }

  async function saveCurrentPattern(pattern: Pattern) {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    const saved = await window.mytunes.savePattern(toIpcPayload(pattern));
    await refresh();
    return saved;
  }

  async function generateMusic(payload: {
    pattern: Pattern;
    compiledPrompt: string;
    mode: 'clip' | 'full';
    force?: boolean;
  }) {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    generating.value = true;
    try {
      const result = await window.mytunes.generateMusic(toIpcPayload(payload));
      currentGeneration.value = result.generation;
      await refresh();
      return result;
    } finally {
      generating.value = false;
    }
  }

  return {
    generations,
    savedPatterns,
    currentGeneration,
    generating,
    refresh,
    saveCurrentPattern,
    generateMusic,
  };
});
