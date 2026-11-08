<template>
  <div class="mt-panel q-pa-md">
    <div class="mt-label q-mb-sm">Player</div>
    <div v-if="!currentGeneration" class="text-grey-5 text-caption">
      Generate to create a version of this song.
    </div>
    <template v-else>
      <div class="text-body2 q-mb-sm">
        {{ currentGeneration.patternName }} · {{ currentGeneration.mode }} ·
        ${{ currentGeneration.costUsd.toFixed(2) }}
      </div>
      <audio
        v-if="audioSrc"
        :key="currentGeneration.id"
        :src="audioSrc"
        controls
        class="full-width"
        style="height: 36px"
      />
      <div v-if="recallWarning" class="text-caption text-amber-6 q-mt-xs">{{ recallWarning }}</div>
      <div
        v-if="currentGeneration.lyricsMismatch"
        class="text-caption text-amber-5 q-mt-xs"
      >
        Heavy lyric rewrite (overlap
        {{ Math.round((currentGeneration.lyricsMatchScore ?? 0) * 100) }}%). Light
        adaptation is OK; this take drifted far from your sheet.
      </div>
      <div v-if="currentGeneration.lyricsText" class="text-caption text-grey-5 q-mt-sm">
        Returned lyrics + diff live on the <strong>Lyrics</strong> and
        <strong>Coherence</strong> tabs.
      </div>
    </template>

    <div class="q-mt-md">
      <div class="mt-label q-mb-xs">Versions</div>
      <div v-if="!songGenerations.length" class="text-grey-5 text-caption">
        No versions yet for this song.
      </div>
      <q-list v-else dense class="mt-version-list">
        <q-item
          v-for="g in songGenerations.slice(0, 24)"
          :key="g.id"
          clickable
          v-ripple
          class="mt-version-item"
          :class="{ 'mt-version-item--active': currentGeneration?.id === g.id }"
          :disable="recallingId === g.id"
          @click="onRecall(g)"
        >
          <q-item-section>
            <q-item-label>{{ g.mode }} · {{ formatTime(g.createdAt) }}</q-item-label>
            <q-item-label caption class="mt-version-caption">
              ${{ g.costUsd.toFixed(2) }}
              <span v-if="!g.patternSnapshot"> · legacy</span>
              <span v-else-if="currentGeneration?.id === g.id"> · loaded</span>
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-btn
              flat
              dense
              round
              size="sm"
              icon="history"
              :loading="recallingId === g.id"
              color="primary"
              @click.stop="onRecall(g)"
            >
              <q-tooltip>Restore knobs, lyrics, prompt, and audio</q-tooltip>
            </q-btn>
          </q-item-section>
        </q-item>
      </q-list>
      <div class="text-caption text-grey-6 q-mt-xs">
        Click a version to restore knobs, lyrics, prompt, and audio.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useQuasar } from 'quasar';
import type { GenerationRecord } from '@/models/generation';
import { useLibraryStore } from '@/stores/library';

const $q = useQuasar();
const library = useLibraryStore();
const { songGenerations, currentGeneration, recallWarning } = storeToRefs(library);
const recallingId = ref<string | null>(null);

const audioSrc = computed(
  () => currentGeneration.value?.audioFileUrl || currentGeneration.value?.audioPath || '',
);

async function onRecall(g: GenerationRecord): Promise<void> {
  if (recallingId.value) return;
  recallingId.value = g.id;
  try {
    await library.recallGeneration(g);
    $q.notify({
      type: 'positive',
      message: `Restored ${g.mode} · ${formatTime(g.createdAt)}`,
      timeout: 1800,
    });
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : String(e),
    });
  } finally {
    recallingId.value = null;
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
</script>
