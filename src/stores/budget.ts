import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  createDefaultBudget,
  estimateMusicCost,
  evaluateBudget,
  type BudgetState,
} from '@/models/budget';
import type { LyriaMode } from '@/models/pattern';
import type { PurposeBackendStatus } from '@/models/api';

export const useBudgetStore = defineStore('budget', () => {
  const state = ref<BudgetState>(createDefaultBudget());
  const assistant = ref<PurposeBackendStatus>({
    present: false,
    backend: null,
    label: null,
  });
  const music = ref<PurposeBackendStatus>({
    present: false,
    backend: null,
    label: null,
  });
  const vertexConfigured = ref(false);
  const geminiConfigured = ref(false);

  const keyPresent = computed(() => music.value.present || assistant.value.present);
  const musicReady = computed(() => music.value.present);
  const assistantReady = computed(() => assistant.value.present);

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

  const vertexSessionPct = computed(() =>
    state.value.sessionLimitUsd
      ? Math.min(100, (state.value.vertex.sessionSpentUsd / state.value.sessionLimitUsd) * 100)
      : 0,
  );

  const geminiSessionPct = computed(() =>
    state.value.sessionLimitUsd
      ? Math.min(100, (state.value.geminiApi.sessionSpentUsd / state.value.sessionLimitUsd) * 100)
      : 0,
  );

  /** Active music backend id — for Lyria model fallbacks. */
  const backend = computed(() => music.value.backend);

  function applyBudget(next: BudgetState) {
    state.value = next;
  }

  async function refresh() {
    if (!window.mytunes) return;
    const [budget, key] = await Promise.all([
      window.mytunes.getBudget(),
      window.mytunes.getKeyStatus(),
    ]);
    state.value = {
      ...createDefaultBudget(),
      ...budget,
      vertex: { ...createDefaultBudget().vertex, ...(budget.vertex ?? {}) },
      geminiApi: { ...createDefaultBudget().geminiApi, ...(budget.geminiApi ?? {}) },
    };
    assistant.value = key.assistant;
    music.value = key.music;
    vertexConfigured.value = key.vertexConfigured;
    geminiConfigured.value = key.geminiConfigured;
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
    assistant,
    music,
    keyPresent,
    musicReady,
    assistantReady,
    vertexConfigured,
    geminiConfigured,
    backend,
    sessionPct,
    dayPct,
    vertexSessionPct,
    geminiSessionPct,
    applyBudget,
    refresh,
    setLimits,
    nextCost,
    gateFor,
  };
});
