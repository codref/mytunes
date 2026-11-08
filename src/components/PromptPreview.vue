<template>
  <div class="mt-knob-row">
    <div class="row items-center justify-between">
      <div class="mt-label">Compiled Lyria prompt</div>
      <div class="row q-gutter-sm">
        <q-btn flat dense color="primary" label="Recompile" @click="patternStore.recompileLocal()" />
        <q-btn
          unelevated
          dense
          color="primary"
          text-color="dark"
          :loading="busy"
          label="Refine with Flash"
          @click="onRefine"
        />
      </div>
    </div>
    <div class="mt-prompt">{{ compiledPrompt }}</div>
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
const { compiledPrompt, busy } = storeToRefs(patternStore);

async function onRefine() {
  try {
    const result = await patternStore.refineWithFlash();
    budgetStore.applyBudget(result.budget);
    $q.notify({ type: 'positive', message: `Prompt refined (≈$${result.costUsd.toFixed(4)})` });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  }
}
</script>
