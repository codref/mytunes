<template>
  <div class="mt-knob-row">
    <div class="row items-center justify-between">
      <div class="mt-label">Songwriting · {{ pattern.lyrics.source }}</div>
      <q-btn
        color="orange-8"
        unelevated
        dense
        :loading="busy"
        :disable="pattern.song.instrumental"
        label="Generate lyrics (Flash)"
        @click="onGenerate"
      />
    </div>
    <q-banner v-if="pattern.song.instrumental" dense class="bg-grey-9 text-grey-4">
      Instrumental mode is on — lyrics will not be sent to Lyria.
    </q-banner>
    <q-input
      v-model="pattern.lyrics.text"
      filled
      dark
      type="textarea"
      autogrow
      :input-style="{ minHeight: '220px', fontFamily: 'ui-monospace, monospace' }"
      label="Lyrics with [Verse] / [Chorus] / [Bridge]"
      hint="Separate lyrics from musical direction; section tags help Lyria"
      :disable="pattern.song.instrumental"
      @update:model-value="onManualEdit"
    />
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useQuasar } from 'quasar';
import { useBudgetStore } from '@/stores/budget';
import { usePatternStore } from '@/stores/pattern';

const $q = useQuasar();
const patternStore = usePatternStore();
const budgetStore = useBudgetStore();
const { pattern, busy } = storeToRefs(patternStore);

function onManualEdit() {
  pattern.value.lyrics.source = 'manual';
}

async function onGenerate() {
  try {
    const result = await patternStore.writeLyrics();
    budgetStore.applyBudget(result.budget);
    $q.notify({ type: 'positive', message: `Lyrics generated (≈$${result.costUsd.toFixed(4)})` });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  }
}
</script>
