<template>
  <div>
    <q-tabs
      v-model="tab"
      dense
      class="text-amber-3"
      active-color="orange-8"
      indicator-color="orange-8"
      align="left"
      narrow-indicator
    >
      <q-tab name="song" label="Song" />
      <q-tab name="lyrics" label="Lyrics" />
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
          <div class="row q-col-gutter-md">
            <div class="col-6">
              <div class="mt-label">BPM {{ pattern.song.bpm }}</div>
              <q-slider v-model="pattern.song.bpm" :min="60" :max="180" color="orange-8" label />
            </div>
            <div class="col-6">
              <div class="mt-label">Energy {{ pattern.song.energy }}</div>
              <q-slider v-model="pattern.song.energy" :min="0" :max="100" color="orange-8" label />
            </div>
          </div>
          <q-select
            v-model="pattern.song.key"
            :options="MUSIC_KEYS"
            filled
            dark
            dense
            label="Key"
          />
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
          <q-toggle v-model="pattern.song.instrumental" color="orange-8" label="Instrumental only" />
        </div>
      </q-tab-panel>

      <q-tab-panel name="lyrics" class="q-pa-none">
        <LyricsEditor />
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
import { BAND_SLOT_IDS, MUSIC_KEYS } from '@/models/pattern';
import { usePatternStore } from '@/stores/pattern';
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
