<template>
  <div class="mt-panel q-pa-md">
    <div class="mt-label q-mb-sm">Player</div>
    <div v-if="!currentGeneration" class="text-grey-5 text-caption">
      No generation yet. Compile a prompt, then Generate Clip.
    </div>
    <template v-else>
      <div class="text-body2 q-mb-sm">
        {{ currentGeneration.patternName }} · {{ currentGeneration.mode }} ·
        ${{ currentGeneration.costUsd.toFixed(2) }}
      </div>
      <audio
        v-if="audioSrc"
        :src="audioSrc"
        controls
        class="full-width"
        style="height: 36px"
      />
      <q-expansion-item
        v-if="currentGeneration.lyricsText"
        dense
        label="Returned lyrics / structure"
        class="q-mt-sm"
      >
        <pre class="mt-prompt" style="min-height: auto; max-height: 10rem">{{
          displayLyrics
        }}</pre>
      </q-expansion-item>
    </template>

    <div v-if="generations.length" class="q-mt-md">
      <div class="mt-label q-mb-xs">History</div>
      <q-list dense dark bordered class="rounded-borders">
        <q-item
          v-for="g in generations.slice(0, 12)"
          :key="g.id"
          clickable
          :active="currentGeneration?.id === g.id"
          active-class="bg-orange-10"
          @click="select(g)"
        >
          <q-item-section>
            <q-item-label>{{ g.patternName }}</q-item-label>
            <q-item-label caption
              >{{ g.mode }} · {{ formatTime(g.createdAt) }} · ${{ g.costUsd.toFixed(2) }}</q-item-label
            >
          </q-item-section>
        </q-item>
      </q-list>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import type { GenerationRecord } from '@/models/generation';
import { useLibraryStore } from '@/stores/library';

const library = useLibraryStore();
const { generations, currentGeneration } = storeToRefs(library);

const audioSrc = computed(
  () => currentGeneration.value?.audioFileUrl || currentGeneration.value?.audioPath || '',
);

const displayLyrics = computed(() =>
  (currentGeneration.value?.lyricsText || '').replace(/\[\[.*?\]\]/g, '').trim(),
);

function select(g: GenerationRecord) {
  currentGeneration.value = g;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
</script>
