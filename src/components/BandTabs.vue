<template>
  <div class="band-tabs">
    <q-tabs
      v-model="tab"
      dense
      class="text-grey-5 band-tabs__tabs"
      active-color="primary"
      indicator-color="primary"
      align="left"
      narrow-indicator
      outside-arrows
      mobile-arrows
    >
      <q-tab name="song" label="Song" />
      <q-tab name="lyrics" label="Lyrics" />
      <q-tab name="coherence" label="Coherence" />
      <q-tab v-for="id in BAND_SLOT_IDS" :key="id" :name="id" :label="labelFor(id)" />
      <q-tab name="prompt" label="Prompt" />
    </q-tabs>

    <q-separator dark />

    <q-tab-panels v-model="tab" animated class="bg-transparent q-pt-md">
      <q-tab-panel name="song" class="q-pa-none">
        <div class="mt-knob-row">
          <q-input v-model="pattern.name" filled dark dense label="Pattern name" />
          <q-input v-model="pattern.song.genre" filled dark dense label="Genre" />
          <q-input v-model="pattern.song.mood" filled dark dense label="Mood" />
          <div class="band-meter-row">
            <div>
              <div class="mt-label">BPM {{ pattern.song.bpm }}</div>
              <q-slider v-model="pattern.song.bpm" :min="60" :max="180" color="primary" label />
            </div>
            <div>
              <div class="mt-label">Energy {{ pattern.song.energy }}</div>
              <q-slider v-model="pattern.song.energy" :min="0" :max="100" color="primary" label />
            </div>
          </div>
          <div class="band-meter-row">
            <q-select
              v-model="pattern.song.timeSignature"
              :options="TIME_SIGNATURES"
              filled
              dark
              dense
              label="Time signature"
              hint="Lyric meter + feel"
            />
            <q-select
              v-model="pattern.song.key"
              :options="MUSIC_KEYS"
              filled
              dark
              dense
              label="Key"
            />
          </div>
          <q-select
            v-model="pattern.song.language"
            :options="languages"
            filled
            dark
            dense
            label="Language"
          />
          <q-input
            v-model="structureText"
            filled
            dark
            dense
            label="Structure ( -> separated)"
            hint="e.g. [Intro] -> [Verse 1] -> [Chorus]"
          />
          <q-input
            v-model="pattern.song.durationHint"
            filled
            dark
            dense
            label="Duration hint (full mode)"
            :disable="pattern.lyriaMode !== 'full'"
          />
          <q-toggle v-model="pattern.song.instrumental" color="primary" label="Instrumental only" />
        </div>
      </q-tab-panel>

      <q-tab-panel name="lyrics" class="q-pa-none">
        <LyricsEditor />
      </q-tab-panel>

      <q-tab-panel name="coherence" class="q-pa-none">
        <CoherencePanel />
      </q-tab-panel>

      <q-tab-panel v-for="id in BAND_SLOT_IDS" :key="id" :name="id" class="q-pa-none">
        <SlotPanel :slot-id="id" />
      </q-tab-panel>

      <q-tab-panel name="prompt" class="q-pa-none">
        <PromptPreview />
      </q-tab-panel>
    </q-tab-panels>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { BAND_SLOT_IDS, MUSIC_KEYS, TIME_SIGNATURES } from '@/models/pattern';
import { usePatternStore } from '@/stores/pattern';
import CoherencePanel from '@/components/CoherencePanel.vue';
import LyricsEditor from '@/components/LyricsEditor.vue';
import PromptPreview from '@/components/PromptPreview.vue';
import SlotPanel from '@/components/SlotPanel.vue';

const tab = ref('song');
const patternStore = usePatternStore();
const { pattern } = storeToRefs(patternStore);

const languages = ['English', 'French', 'Spanish', 'German', 'Italian', 'Portuguese', 'Japanese'];

const structureText = computed({
  get: () => pattern.value.song.structure.join(' -> '),
  set: (v: string) => {
    pattern.value.song.structure = v
      .split('->')
      .map((s) => s.trim())
      .filter(Boolean);
  },
});

function labelFor(id: string) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
</script>

<style scoped>
.band-tabs {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.band-tabs__tabs {
  max-width: 100%;
}

.band-tabs__tabs :deep(.q-tabs__content) {
  /* Arrows handle overflow; hide the native bar Quasar still mounts. */
  scrollbar-width: none;
}

.band-tabs__tabs :deep(.q-tabs__content)::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.band-tabs :deep(.q-tab-panels),
.band-tabs :deep(.q-panel) {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.band-meter-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  max-width: 100%;
  min-width: 0;
}

.mt-knob-row {
  min-width: 0;
  max-width: 100%;
}
</style>
