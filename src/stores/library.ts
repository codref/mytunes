import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { patternFromGeneration, type GenerationRecord } from '@/models/generation';
import { toIpcPayload } from '@/models/ipc';
import { cleanReturnedLyrics } from '@/models/lyriaTranscript';
import type { Pattern } from '@/models/pattern';
import { createSong, type Song } from '@/models/song';
import { usePatternStore } from '@/stores/pattern';

function stablePatternJson(pattern: Pattern): string {
  return JSON.stringify(pattern);
}

export const useLibraryStore = defineStore('library', () => {
  const generations = ref<GenerationRecord[]>([]);
  const songs = ref<Song[]>([]);
  const activeSong = ref<Song | null>(null);
  const savedBaseline = ref<string | null>(null);
  const currentGeneration = ref<GenerationRecord | null>(null);
  const generating = ref(false);
  const recallWarning = ref<string | null>(null);

  const songGenerations = computed(() => {
    const songId = activeSong.value?.id;
    if (!songId) return generations.value;
    return generations.value.filter(
      (g) => g.songId === songId || (!g.songId && g.patternId === songId),
    );
  });

  const isDirty = computed(() => {
    if (!savedBaseline.value) return false;
    const patternStore = usePatternStore();
    return stablePatternJson(patternStore.pattern) !== savedBaseline.value;
  });

  function markClean(pattern: Pattern): void {
    savedBaseline.value = stablePatternJson(pattern);
  }

  async function refreshSongs(): Promise<void> {
    if (!window.mytunes) return;
    songs.value = await window.mytunes.listSongs();
  }

  async function refreshGenerations(songId?: string | null): Promise<void> {
    if (!window.mytunes) return;
    generations.value = await window.mytunes.listGenerations(
      songId ? { songId } : undefined,
    );
  }

  async function refresh(): Promise<void> {
    if (!window.mytunes) return;
    await Promise.all([
      refreshSongs(),
      refreshGenerations(activeSong.value?.id),
    ]);
  }

  async function applySong(song: Song, opts?: { restoreGeneration?: boolean }): Promise<void> {
    const patternStore = usePatternStore();
    activeSong.value = song;
    patternStore.loadPattern(toIpcPayload(song.pattern));
    markClean(song.pattern);
    await refreshGenerations(song.id);
    recallWarning.value = null;

    if (opts?.restoreGeneration === false) {
      currentGeneration.value = null;
      return;
    }

    const activeId = song.activeGenerationId;
    if (activeId) {
      const found =
        songGenerations.value.find((g) => g.id === activeId) ||
        generations.value.find((g) => g.id === activeId) ||
        null;
      currentGeneration.value = found;
    } else {
      currentGeneration.value = songGenerations.value[0] ?? null;
    }
  }

  async function openSong(id: string): Promise<Song | null> {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    const song = await window.mytunes.loadSong(id);
    if (!song) return null;
    await applySong(song);
    return song;
  }

  async function saveSong(name?: string): Promise<Song> {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    const patternStore = usePatternStore();
    const pattern = structuredClone(toIpcPayload(patternStore.pattern));
    if (name?.trim()) {
      pattern.name = name.trim();
      patternStore.pattern.name = pattern.name;
    }

    let song: Song;
    if (activeSong.value) {
      song = {
        ...activeSong.value,
        name: pattern.name,
        pattern,
      };
      const genId = currentGeneration.value?.id ?? activeSong.value.activeGenerationId;
      if (genId) song.activeGenerationId = genId;
      else delete song.activeGenerationId;
    } else {
      const partial: Partial<Song> = {
        id: pattern.id,
        name: pattern.name,
      };
      if (currentGeneration.value?.id) {
        partial.activeGenerationId = currentGeneration.value.id;
      }
      song = createSong(pattern, partial);
    }

    const saved = await window.mytunes.saveSong(toIpcPayload(song));
    activeSong.value = saved;
    markClean(saved.pattern);
    await refreshSongs();
    return saved;
  }

  async function saveSongAs(name: string): Promise<Song> {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    const patternStore = usePatternStore();
    const previousId = activeSong.value?.id ?? null;
    const pattern = structuredClone(toIpcPayload(patternStore.pattern));
    pattern.id = crypto.randomUUID();
    pattern.name = name.trim() || 'Untitled Song';
    patternStore.loadPattern(pattern);

    const song = createSong(pattern, {
      id: pattern.id,
      name: pattern.name,
    });
    let saved = await window.mytunes.saveSong(toIpcPayload(song));
    if (previousId) {
      const withCover = await window.mytunes.copySongCover(previousId, saved.id);
      if (withCover) saved = withCover;
    }
    activeSong.value = saved;
    currentGeneration.value = null;
    markClean(saved.pattern);
    await refresh();
    return saved;
  }

  async function setSongCover(jpegBase64: string): Promise<Song> {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    let songId = activeSong.value?.id;
    if (!songId) {
      const saved = await saveSong();
      songId = saved.id;
    }
    const updated = await window.mytunes.setSongCover(songId, jpegBase64);
    activeSong.value = updated;
    await refreshSongs();
    return updated;
  }

  async function clearSongCover(): Promise<Song | null> {
    if (!window.mytunes || !activeSong.value) return null;
    const updated = await window.mytunes.clearSongCover(activeSong.value.id);
    activeSong.value = updated;
    await refreshSongs();
    return updated;
  }

  async function newSong(): Promise<void> {
    const patternStore = usePatternStore();
    await patternStore.resetPattern();
    activeSong.value = null;
    currentGeneration.value = null;
    recallWarning.value = null;
    generations.value = [];
    markClean(patternStore.pattern);
    if (window.mytunes) {
      await window.mytunes.setSession({ lastSongId: null });
    }
  }

  async function deleteActiveSong(): Promise<void> {
    if (!activeSong.value || !window.mytunes) return;
    await window.mytunes.deleteSong(activeSong.value.id);
    await newSong();
    await refreshSongs();
  }

  async function updateGenerationNotes(id: string, notes: string): Promise<void> {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    const updated = await window.mytunes.patchGeneration(id, { userNotes: notes });
    if (!updated) throw new Error('Generation not found');
    const idx = generations.value.findIndex((g) => g.id === id);
    if (idx >= 0) {
      generations.value[idx] = updated;
    }
    if (currentGeneration.value?.id === id) {
      currentGeneration.value = updated;
    }
  }

  async function forkFromGeneration(g: GenerationRecord, name: string): Promise<Song> {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    const result = await window.mytunes.forkGeneration(g.id, name);
    await applySong(result.song);
    await refreshSongs();
    return result.song;
  }

  async function recallGeneration(g: GenerationRecord): Promise<void> {
    const patternStore = usePatternStore();
    const snapshot = patternFromGeneration(g);
    recallWarning.value = null;

    if (snapshot) {
      patternStore.loadPattern(snapshot);
      if (activeSong.value) {
        activeSong.value = {
          ...activeSong.value,
          pattern: toIpcPayload(snapshot),
          name: snapshot.name,
          activeGenerationId: g.id,
        };
        markClean(snapshot);
      }
    } else {
      // Legacy generation: restore what we can
      patternStore.pattern.compiledPrompt = g.compiledPrompt;
      patternStore.compiledPrompt = g.compiledPrompt;
      patternStore.pattern.lyriaMode = g.mode;
      if (g.lyricsText?.trim()) {
        patternStore.pattern.lyrics = {
          text: cleanReturnedLyrics(g.lyricsText),
          source: 'generated',
        };
      }
      recallWarning.value =
        'This version was saved before knobs were snapshotted — audio + prompt restored; knobs may be incomplete.';
    }

    currentGeneration.value = g;

    if (activeSong.value && window.mytunes) {
      const song: Song = {
        ...activeSong.value,
        activeGenerationId: g.id,
        pattern: toIpcPayload(patternStore.pattern),
        name: patternStore.pattern.name,
      };
      const saved = await window.mytunes.saveSong(toIpcPayload(song));
      activeSong.value = saved;
      if (snapshot) markClean(saved.pattern);
    }
  }

  async function generateMusic(payload: {
    pattern: Pattern;
    compiledPrompt: string;
    mode: 'clip' | 'full';
    model?: string;
    force?: boolean;
  }) {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    generating.value = true;
    try {
      const result = await window.mytunes.generateMusic(
        toIpcPayload({
          ...payload,
          songId: activeSong.value?.id ?? null,
        }),
      );
      activeSong.value = result.song;
      currentGeneration.value = result.generation;
      markClean(result.song.pattern);
      recallWarning.value = null;
      await refresh();
      return result;
    } finally {
      generating.value = false;
    }
  }

  async function restoreSession(): Promise<boolean> {
    if (!window.mytunes) return false;
    const session = await window.mytunes.getSession();
    if (!session.lastSongId) return false;
    const song = await window.mytunes.loadSong(session.lastSongId);
    if (!song) return false;
    await applySong(song);
    return true;
  }

  async function exportTune(): Promise<{ path: string; generationCount: number } | null> {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    if (isDirty.value || !activeSong.value) {
      await saveSong();
    }
    const songId = activeSong.value?.id;
    if (!songId) throw new Error('Save the song before exporting a .tune archive');
    const result = await window.mytunes.exportTune(songId);
    if (result.canceled) return null;
    await window.mytunes.revealInFolder(result.path);
    return { path: result.path, generationCount: result.generationCount };
  }

  /** Export one history take (pattern snapshot + that take’s audio) as .tune. */
  async function exportTuneGeneration(
    generationId: string,
  ): Promise<{ path: string; generationCount: number } | null> {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    const result = await window.mytunes.exportTuneGeneration(generationId);
    if (result.canceled) return null;
    await window.mytunes.revealInFolder(result.path);
    return { path: result.path, generationCount: result.generationCount };
  }

  async function importTune(): Promise<Song | null> {
    if (!window.mytunes) throw new Error('Electron bridge unavailable');
    const result = await window.mytunes.importTune();
    if (result.canceled) return null;
    await applySong(result.song);
    await refreshSongs();
    return result.song;
  }

  return {
    generations,
    songGenerations,
    songs,
    activeSong,
    currentGeneration,
    generating,
    isDirty,
    recallWarning,
    refresh,
    refreshSongs,
    openSong,
    saveSong,
    saveSongAs,
    setSongCover,
    clearSongCover,
    newSong,
    deleteActiveSong,
    recallGeneration,
    updateGenerationNotes,
    forkFromGeneration,
    generateMusic,
    restoreSession,
    exportTune,
    exportTuneGeneration,
    importTune,
    markClean,
  };
});
