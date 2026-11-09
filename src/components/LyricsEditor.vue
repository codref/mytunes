<template>
  <div class="mt-knob-row">
    <div class="row items-center justify-between q-col-gutter-sm">
      <div class="mt-label col-grow">Songwriting · {{ pattern.lyrics.source }}</div>
      <div class="row q-gutter-sm items-center">
        <q-btn
          outline
          dense
          color="primary"
          :loading="busy"
          :disable="pattern.song.instrumental || !pattern.lyrics.text.trim()"
          label="Check & fix"
          @click="onFix"
        >
          <q-tooltip>
            {{
              pattern.lyrics.text.trim()
                ? 'Revise for meter, tempo, structure, mood, and genre'
                : 'Add lyrics first'
            }}
          </q-tooltip>
        </q-btn>
        <q-btn
          color="primary"
          text-color="dark"
          unelevated
          dense
          :loading="busy"
          :disable="pattern.song.instrumental"
          label="Generate lyrics"
          @click="onGenerate"
        />
      </div>
    </div>
    <q-banner v-if="pattern.song.instrumental" dense class="bg-grey-9 text-grey-4">
      Instrumental mode is on — lyrics will not be sent to Lyria.
    </q-banner>
    <q-input
      v-model="pattern.lyrics.text"
      class="lyrics-input"
      filled
      dark
      type="textarea"
      autogrow
      :input-style="{ minHeight: '180px', fontFamily: 'ui-monospace, monospace' }"
      label="Lyrics with [Verse] / [Chorus] / [Bridge]"
      hint="Source lyrics + song theme go to Lyria; it may adapt wording slightly. Tag singers with [Voice: Lead] (names match the Vocals tab). Put long (stage directions) in parentheses."
      :disable="pattern.song.instrumental"
      @update:model-value="onManualEdit"
    />

    <LyricDiffView
      v-if="!pattern.song.instrumental && pendingProposal"
      class="q-mt-md"
      meta-title="Chat proposal"
      layout="unified"
      left-heading="Current"
      right-heading="Proposed"
      empty-text="No proposed lyrics."
      :clean-returned="false"
      :show-adopt="false"
      only-left-label="only in current"
      only-right-label="only in proposed"
      :source-text="pattern.lyrics.text"
      :returned-text="pendingProposal.text"
    >
      <template #actions>
        <q-btn
          dense
          unelevated
          color="primary"
          text-color="dark"
          size="sm"
          label="Apply"
          @click="onApplyProposal"
        />
        <q-btn
          dense
          flat
          color="grey-4"
          size="sm"
          label="Reject"
          @click="onRejectProposal"
        />
      </template>
    </LyricDiffView>

    <LyricDiffView
      v-if="!pattern.song.instrumental"
      :source-text="diffSource"
      :returned-text="returnedText"
      :overlap-score="overlapScore"
      @adopt="onAdopt"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useQuasar } from 'quasar';
import LyricDiffView from '@/components/LyricDiffView.vue';
import { useAssistantStore } from '@/stores/assistant';
import { useBudgetStore } from '@/stores/budget';
import { useLibraryStore } from '@/stores/library';
import { usePatternStore } from '@/stores/pattern';

const $q = useQuasar();
const patternStore = usePatternStore();
const assistantStore = useAssistantStore();
const budgetStore = useBudgetStore();
const library = useLibraryStore();
const { pattern, busy } = storeToRefs(patternStore);
const { latestPendingLyricPatch } = storeToRefs(assistantStore);
const { currentGeneration } = storeToRefs(library);

const pendingProposal = computed(() => latestPendingLyricPatch.value);

/** Prefer the sheet that was actually sent with the take. */
const diffSource = computed(() => {
  const snap = currentGeneration.value?.patternSnapshot?.lyrics?.text;
  if (snap?.trim()) return snap;
  return pattern.value.lyrics.text;
});

const returnedText = computed(() => currentGeneration.value?.lyricsText ?? '');

const overlapScore = computed(() => currentGeneration.value?.lyricsMatchScore ?? null);

function onManualEdit() {
  pattern.value.lyrics.source = 'manual';
}

function onAdopt(text: string) {
  pattern.value.lyrics = { text, source: 'generated' };
  $q.notify({ type: 'positive', message: 'Adopted returned lyrics.' });
}

function onApplyProposal() {
  const proposal = pendingProposal.value;
  if (!proposal) return;
  assistantStore.applyHardPatch(proposal.messageId, proposal.patchId);
  $q.notify({ type: 'positive', message: 'Applied lyric proposal.' });
}

function onRejectProposal() {
  const proposal = pendingProposal.value;
  if (!proposal) return;
  assistantStore.rejectHardPatch(proposal.messageId, proposal.patchId);
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

async function onFix() {
  try {
    const result = await patternStore.fixLyrics();
    budgetStore.applyBudget(result.budget);
    $q.notify({
      type: 'positive',
      message: `Lyrics checked & fixed (≈$${result.costUsd.toFixed(4)})`,
    });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  }
}
</script>

<style scoped>
.lyrics-input {
  min-width: 0;
  max-width: 100%;
}

.lyrics-input :deep(.q-field__control),
.lyrics-input :deep(.q-field__native),
.lyrics-input :deep(textarea) {
  max-width: 100%;
  overflow-x: hidden !important;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: pre-wrap;
}
</style>
