<template>
  <div class="mt-knob-row coherence">
    <div class="row items-center justify-between q-col-gutter-sm">
      <div class="mt-label col-grow">Coherence · last take vs settings</div>
      <div class="row items-center q-gutter-sm">
        <q-btn
          v-if="currentGeneration?.lyricsText"
          outline
          dense
          color="primary"
          label="Re-split (Flash)"
          :loading="splitting"
          @click="onResplit"
        >
          <q-tooltip>Use Flash to separate sung lyrics from arrangement commentary</q-tooltip>
        </q-btn>
        <q-badge v-if="report.overlapScore != null" :color="overlapColor" text-color="dark">
          {{ Math.round(report.overlapScore * 100) }}% lyric overlap
        </q-badge>
      </div>
    </div>

    <div v-if="!currentGeneration" class="text-caption text-grey-5">
      Generate or recall a version to audit how Lyria’s return lines up with your knobs, structure,
      and lyric sheet.
    </div>

    <template v-else>
      <div class="text-caption text-grey-5">
        Take {{ formatTime(currentGeneration.createdAt) }} · {{ currentGeneration.mode }}
        <span v-if="currentGeneration.model"> · {{ currentGeneration.model }}</span>
      </div>

      <div class="coherence__list">
        <div
          v-for="f in report.findings"
          :key="f.id"
          class="coherence__item"
          :class="`coherence__item--${f.severity}`"
        >
          <div class="row items-start no-wrap q-gutter-sm">
            <q-badge
              class="coherence__sev"
              :color="severityColor(f.severity)"
              :text-color="f.severity === 'ok' || f.severity === 'warn' ? 'dark' : 'white'"
              :label="f.severity"
            />
            <div class="col">
              <div class="text-body2">{{ f.title }}</div>
              <div class="text-caption text-grey-5">{{ f.detail }}</div>
              <q-btn
                v-if="f.action && f.action.kind !== 'note'"
                class="q-mt-xs"
                flat
                dense
                color="primary"
                :label="f.action.label"
                :loading="busy && pendingAction === f.id"
                @click="onAction(f)"
              />
            </div>
          </div>
        </div>
      </div>

      <q-separator dark />

      <LyricDiffView
        :source-text="report.sourceLyrics"
        :returned-text="report.returnedLyrics"
        :overlap-score="report.overlapScore"
        @adopt="adoptLyrics"
      />

      <q-expansion-item
        v-if="report.arrangementNotes"
        dense
        label="Lyria arrangement notes (not lyrics)"
        class="q-mt-sm"
      >
        <pre class="mt-prompt coherence__notes">{{ report.arrangementNotes }}</pre>
      </q-expansion-item>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useQuasar } from 'quasar';
import LyricDiffView from '@/components/LyricDiffView.vue';
import {
  analyzeCoherence,
  type CoherenceFinding,
  type CoherenceSeverity,
} from '@/models/coherence';
import { useBudgetStore } from '@/stores/budget';
import { useLibraryStore } from '@/stores/library';
import { usePatternStore } from '@/stores/pattern';

const $q = useQuasar();
const library = useLibraryStore();
const patternStore = usePatternStore();
const budgetStore = useBudgetStore();
const { currentGeneration } = storeToRefs(library);
const { pattern, busy } = storeToRefs(patternStore);
const pendingAction = ref<string | null>(null);
const splitting = ref(false);

const report = computed(() => analyzeCoherence(pattern.value, currentGeneration.value));

const overlapColor = computed(() => {
  const s = report.value.overlapScore;
  if (s == null) return 'grey';
  if (s >= 0.65) return 'positive';
  if (s >= 0.35) return 'warning';
  return 'negative';
});

function severityColor(s: CoherenceSeverity): string {
  if (s === 'ok') return 'positive';
  if (s === 'info') return 'grey-7';
  if (s === 'warn') return 'warning';
  return 'negative';
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function adoptLyrics(text: string) {
  pattern.value.lyrics = { text, source: 'generated' };
  $q.notify({ type: 'positive', message: 'Adopted returned lyrics into the Lyrics tab.' });
}

async function onResplit() {
  const g = currentGeneration.value;
  if (!g?.lyricsText?.trim() || !window.mytunes) return;
  splitting.value = true;
  try {
    const result = await window.mytunes.splitLyriaTranscript({ generationId: g.id });
    budgetStore.applyBudget(result.budget);
    if (result.generation) {
      library.currentGeneration = result.generation;
      const idx = library.generations.findIndex((x) => x.id === result.generation!.id);
      if (idx >= 0) library.generations[idx] = result.generation;
    }
    $q.notify({
      type: 'positive',
      message: result.usedFlash
        ? `Transcript re-split with Flash (≈$${result.costUsd.toFixed(4)})`
        : 'Transcript cleaned with local heuristics (Flash not needed)',
    });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  } finally {
    splitting.value = false;
  }
}

async function onAction(finding: CoherenceFinding) {
  const action = finding.action;
  if (!action) return;
  pendingAction.value = finding.id;
  try {
    if (action.kind === 'adoptLyrics' && typeof action.value === 'string') {
      adoptLyrics(action.value);
    } else if (action.kind === 'setStructure' && Array.isArray(action.value)) {
      pattern.value.song.structure = action.value.map((s) => String(s));
      $q.notify({ type: 'positive', message: 'Structure updated from returned sections.' });
    } else if (action.kind === 'fixLyrics') {
      const result = await patternStore.fixLyrics();
      budgetStore.applyBudget(result.budget);
      $q.notify({
        type: 'positive',
        message: `Lyrics checked & fixed (≈$${result.costUsd.toFixed(4)})`,
      });
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  } finally {
    pendingAction.value = null;
  }
}
</script>

<style scoped>
.coherence__list {
  display: grid;
  gap: 0.55rem;
}

.coherence__item {
  border: 1px solid var(--mt-line);
  border-radius: 4px;
  padding: 0.65rem 0.75rem;
  background: #120f0c;
}

.coherence__item--bad {
  border-color: rgba(196, 75, 60, 0.55);
}

.coherence__item--warn {
  border-color: rgba(232, 160, 69, 0.45);
}

.coherence__item--ok {
  border-color: rgba(106, 154, 91, 0.4);
}

.coherence__sev {
  text-transform: uppercase;
  font-size: 0.65rem;
  margin-top: 0.15rem;
}

.coherence__notes {
  min-height: auto;
  max-height: 14rem;
  margin: 0;
}
</style>
