<template>
  <div class="budget-bar row items-center no-wrap q-gutter-xs">
    <button type="button" class="budget-chip row items-center no-wrap" aria-label="Budget details">
      <div
        class="budget-gauge"
        :class="gaugeTone"
        :style="{ '--v': vertexSessionPct, '--g': geminiSessionPct }"
        aria-hidden="true"
      />
      <div class="budget-chip__text column justify-center">
        <span class="budget-chip__primary">
          ${{ state.sessionSpentUsd.toFixed(2) }}
          <span class="budget-chip__muted">/ ${{ state.sessionLimitUsd.toFixed(2) }}</span>
        </span>
        <span class="budget-chip__secondary">
          day ${{ state.daySpentUsd.toFixed(2) }} / ${{ state.dayLimitUsd.toFixed(2) }}
        </span>
      </div>
      <q-menu anchor="bottom right" self="top right" :offset="[0, 8]" class="budget-menu">
        <div class="budget-menu__body">
          <div class="budget-menu__title">Session spend</div>
          <div class="budget-menu__row">
            <span class="budget-swatch budget-swatch--vertex" />
            <span>Vertex</span>
            <q-space />
            <span>${{ state.vertex.sessionSpentUsd.toFixed(2) }}</span>
            <span class="budget-chip__muted q-ml-sm">
              today ${{ state.vertex.daySpentUsd.toFixed(2) }}
            </span>
          </div>
          <div class="budget-menu__row">
            <span class="budget-swatch budget-swatch--gemini" />
            <span>Gemini API</span>
            <q-space />
            <span>${{ state.geminiApi.sessionSpentUsd.toFixed(2) }}</span>
            <span class="budget-chip__muted q-ml-sm">
              today ${{ state.geminiApi.daySpentUsd.toFixed(2) }}
            </span>
          </div>
          <div class="budget-menu__divider" />
          <div class="budget-menu__row">
            <span>Session</span>
            <q-space />
            <span>
              ${{ state.sessionSpentUsd.toFixed(2) }} / ${{ state.sessionLimitUsd.toFixed(2) }}
            </span>
          </div>
          <div class="budget-menu__row">
            <span>Day</span>
            <q-space />
            <span>${{ state.daySpentUsd.toFixed(2) }} / ${{ state.dayLimitUsd.toFixed(2) }}</span>
          </div>
          <div class="budget-menu__divider" />
          <div class="budget-menu__title">Routing</div>
          <div class="budget-menu__row" :class="assistantReady ? 'text-positive' : 'text-negative'">
            Asst · {{ assistant.label || 'not set' }}
          </div>
          <div class="budget-menu__row" :class="musicReady ? 'text-positive' : 'text-negative'">
            Music · {{ music.label || 'not set' }}
          </div>
        </div>
      </q-menu>
      <q-tooltip>Budget & routing details</q-tooltip>
    </button>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useBudgetStore } from '@/stores/budget';

const budget = useBudgetStore();
const {
  state,
  sessionPct,
  dayPct,
  vertexSessionPct,
  geminiSessionPct,
  assistant,
  music,
  assistantReady,
  musicReady,
} = storeToRefs(budget);

const gaugeTone = computed(() => {
  const hottest = Math.max(sessionPct.value, dayPct.value);
  if (hottest >= 100) return 'budget-gauge--hard';
  if (hottest >= 80) return 'budget-gauge--soft';
  return '';
});
</script>

<style scoped>
.budget-bar {
  min-width: 0;
  max-width: 360px;
}

.budget-chip {
  min-width: 0;
  max-width: 100%;
  gap: 0.55rem;
  margin: 0;
  padding: 0.2rem 0.45rem 0.2rem 0.35rem;
  border: 1px solid var(--mt-line);
  border-radius: 4px;
  background: rgba(18, 15, 12, 0.55);
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.budget-chip:hover,
.budget-chip:focus-visible {
  border-color: color-mix(in srgb, var(--mt-accent) 45%, var(--mt-line));
  outline: none;
}

.budget-gauge {
  --v: 0;
  --g: 0;
  position: relative;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background:
    conic-gradient(
      from -90deg,
      #7dd3a0 0 calc(var(--v) * 1%),
      #7eb6ff calc(var(--v) * 1%) calc((var(--v) + var(--g)) * 1%),
      #2a241c calc((var(--v) + var(--g)) * 1%) 100%
    );
  border: 1px solid var(--mt-line);
}

.budget-gauge::after {
  content: '';
  position: absolute;
  inset: 5px;
  border-radius: 50%;
  background: #16120e;
  border: 1px solid var(--mt-line);
}

.budget-gauge--soft {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--mt-warn) 55%, transparent);
}

.budget-gauge--hard {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--mt-danger) 65%, transparent);
}

.budget-chip__text {
  min-width: 0;
  line-height: 1.15;
}

.budget-chip__primary {
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}

.budget-chip__secondary {
  font-size: 0.68rem;
  color: var(--mt-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.budget-chip__muted {
  color: var(--mt-muted);
  font-weight: 400;
}

.budget-menu__body {
  min-width: 260px;
  padding: 0.75rem 0.85rem;
  background: var(--mt-bg-elevated);
  color: var(--mt-text);
}

.budget-menu__title {
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mt-muted);
  margin-bottom: 0.35rem;
}

.budget-menu__row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
}

.budget-menu__divider {
  height: 1px;
  margin: 0.55rem 0;
  background: var(--mt-line);
}

.budget-swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex: none;
}

.budget-swatch--vertex {
  background: #7dd3a0;
}

.budget-swatch--gemini {
  background: #7eb6ff;
}
</style>
