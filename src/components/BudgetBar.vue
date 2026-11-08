<template>
  <div class="budget-bar row items-center q-gutter-md">
    <div class="col-grow">
      <div class="row justify-between items-center">
        <span class="mt-label">Session ${{ state.sessionSpentUsd.toFixed(2) }} / ${{ state.sessionLimitUsd.toFixed(2) }}</span>
        <span class="mt-label">Today ${{ state.daySpentUsd.toFixed(2) }} / ${{ state.dayLimitUsd.toFixed(2) }}</span>
      </div>
      <div class="mt-meter q-mt-xs">
        <span :style="{ width: Math.max(sessionPct, dayPct) + '%' }" />
      </div>
    </div>
    <div class="text-caption" :class="keyPresent ? 'text-positive' : 'text-negative'">
      {{ keyPresent ? keyMasked : 'No Vertex / API backend' }}
    </div>
    <q-btn flat dense icon="settings" size="sm" @click="openLimits">
      <q-tooltip>Budget limits</q-tooltip>
    </q-btn>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useQuasar } from 'quasar';
import { useBudgetStore } from '@/stores/budget';

const $q = useQuasar();
const budget = useBudgetStore();
const { state, sessionPct, dayPct, keyPresent, keyMasked } = storeToRefs(budget);

function openLimits() {
  $q.dialog({
    title: 'Budget limits',
    message: 'Soft warning at 80%. Hard stop at 100%.',
    prompt: {
      model: String(state.value.sessionLimitUsd),
      type: 'number',
      label: 'Session limit (USD)',
    },
    cancel: true,
    persistent: true,
  }).onOk((sessionRaw: string) => {
    const sessionLimitUsd = Number(sessionRaw) || state.value.sessionLimitUsd;
    $q.dialog({
      title: 'Daily limit',
      prompt: {
        model: String(state.value.dayLimitUsd),
        type: 'number',
        label: 'Daily limit (USD)',
      },
      cancel: true,
      persistent: true,
    }).onOk((dayRaw: string) => {
      const dayLimitUsd = Number(dayRaw) || state.value.dayLimitUsd;
      void budget.setLimits(sessionLimitUsd, dayLimitUsd);
    });
  });
}
</script>

<style scoped>
.budget-bar {
  min-width: 280px;
}
</style>
