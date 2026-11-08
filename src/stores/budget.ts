import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  createDefaultBudget,
  estimateMusicCost,
  evaluateBudget,
  type BudgetState,
} from '@/models/budget';
import type { LyriaMode } from '@/models/pattern';

export const useBudgetStore = defineStore('budget', () => {
  const state = ref<BudgetState>(createDefaultBudget());
  const keyPresent = ref(false);
  const keyMasked = ref<string | null>(null);
  const backend = ref<'vertex' | 'gemini-api' | null>(null);

  const sessionPct = computed(() =>
    state.value.sessionLimitUsd
      ? Math.min(100, (state.value.sessionSpentUsd / state.value.sessionLimitUsd) * 100)
      : 0,
  );

  const dayPct = computed(() =>
    state.value.dayLimitUsd
      ? Math.min(100, (state.value.daySpentUsd / state.value.dayLimitUsd) * 100)
      : 0,
  );

  function applyBudget(next: BudgetState) {
    state.value = next;
  }

  async function refresh() {
    if (!window.mytunes) return;
    const [budget, key] = await Promise.all([
      window.mytunes.getBudget(),
      window.mytunes.getKeyStatus(),
    ]);
    state.value = budget;
    keyPresent.value = key.present;
    keyMasked.value = key.masked;
    backend.value = key.backend;
  }

  async function setLimits(sessionLimitUsd: number, dayLimitUsd: number) {
    if (!window.mytunes) return;
    state.value = await window.mytunes.setBudgetLimits({ sessionLimitUsd, dayLimitUsd });
  }

  function nextCost(mode: LyriaMode) {
    return estimateMusicCost(mode);
  }

  function gateFor(mode: LyriaMode) {
    return evaluateBudget(state.value, estimateMusicCost(mode));
  }

  return {
    state,
    keyPresent,
    keyMasked,
    backend,
    sessionPct,
    dayPct,
    applyBudget,
    refresh,
    setLimits,
    nextCost,
    gateFor,
  };
});
