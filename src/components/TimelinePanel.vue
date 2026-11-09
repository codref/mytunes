<template>
  <div class="mt-knob-row timeline-panel">
    <div class="text-caption text-grey-5">
      Timeline mode compiles
      <code>[mm:ss - mm:ss]</code>
      blocks with Intensity 1–10 (Lyria Pro guide). Section tags stay for lyrics.
    </div>

    <div class="row items-center q-gutter-sm">
      <q-btn
        outline
        dense
        color="primary"
        label="Derive from structure"
        :disable="!pattern.song.structure.length"
        @click="deriveLocal"
      />
      <q-btn
        unelevated
        dense
        color="primary"
        text-color="dark"
        label="Transpose with Gemini"
        @click="onTranspose"
      />
      <q-btn outline dense color="grey-4" label="Add segment" @click="addSegment" />
      <q-btn
        flat
        dense
        color="grey-5"
        label="Snap ends to bars"
        @click="snapAll"
      />
    </div>

    <TimelineSimulator />

    <div
      v-for="(seg, index) in segments"
      :key="seg.id"
      class="timeline-seg"
    >
      <div class="row items-center justify-between q-mb-sm">
        <div class="mt-label">Segment {{ index + 1 }}</div>
        <div class="row q-gutter-xs">
          <q-btn
            flat
            dense
            size="sm"
            icon="arrow_upward"
            :disable="index === 0"
            @click="move(index, -1)"
          />
          <q-btn
            flat
            dense
            size="sm"
            icon="arrow_downward"
            :disable="index >= segments.length - 1"
            @click="move(index, 1)"
          />
          <q-btn
            flat
            dense
            size="sm"
            color="negative"
            icon="close"
            :disable="segments.length <= 1"
            @click="remove(seg.id)"
          />
        </div>
      </div>

      <div class="band-meter-row">
        <q-input
          :model-value="formatMmSs(seg.startSec)"
          filled
          dark
          dense
          label="Start"
          hint="m:ss"
          @update:model-value="(v) => setTime(seg.id, 'startSec', String(v ?? ''))"
        />
        <q-input
          :model-value="formatMmSs(seg.endSec)"
          filled
          dark
          dense
          label="End"
          hint="m:ss"
          @update:model-value="(v) => setTime(seg.id, 'endSec', String(v ?? ''))"
        />
      </div>
      <q-input
        :model-value="seg.label"
        filled
        dark
        dense
        label="Label"
        @update:model-value="(v) => patch(seg.id, { label: String(v ?? '') })"
      />
      <q-input
        :model-value="seg.direction"
        filled
        dark
        dense
        type="textarea"
        autogrow
        label="Direction"
        hint="What happens in this window"
        @update:model-value="(v) => patch(seg.id, { direction: String(v ?? '') })"
      />
      <div>
        <div class="mt-label">
          Intensity {{ seg.intensity }}/10 ({{ intensityLabel(seg.intensity) }})
        </div>
        <q-slider
          :model-value="seg.intensity"
          :min="1"
          :max="10"
          color="primary"
          label
          @update:model-value="(v) => patch(seg.id, { intensity: Number(v) })"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useQuasar } from 'quasar';
import {
  createTimelineSegment,
  deriveTimelineFromStructure,
  intensityLabel,
  type TimelineSegment,
} from '@/models/pattern';
import {
  defaultTimelineDuration,
  formatMmSs,
  parseMmSs,
  secondsPerBar,
  snapToBar,
  sortTimeline,
} from '@/models/timeline';
import { useAssistantStore } from '@/stores/assistant';
import { usePatternStore } from '@/stores/pattern';
import TimelineSimulator from '@/components/TimelineSimulator.vue';

const $q = useQuasar();
const patternStore = usePatternStore();
const assistantStore = useAssistantStore();
const { pattern } = storeToRefs(patternStore);

const segments = computed(() => sortTimeline(pattern.value.song.timeline ?? []));

function ensureTimelineArray(): TimelineSegment[] {
  if (!pattern.value.song.timeline) pattern.value.song.timeline = [];
  return pattern.value.song.timeline;
}

function patch(id: string, partial: Partial<TimelineSegment>) {
  const list = ensureTimelineArray();
  const seg = list.find((s) => s.id === id);
  if (!seg) return;
  Object.assign(seg, partial);
  if (partial.intensity != null) seg.intensity = Math.max(1, Math.min(10, Math.round(partial.intensity)));
}

function setTime(id: string, key: 'startSec' | 'endSec', raw: string) {
  const parsed = parseMmSs(raw);
  if (parsed == null) return;
  patch(id, { [key]: parsed });
}

function deriveLocal() {
  const total = defaultTimelineDuration(pattern.value);
  pattern.value.song.timeline = deriveTimelineFromStructure(pattern.value.song, total);
  $q.notify({ type: 'positive', message: 'Timeline derived from structure' });
}

function addSegment() {
  const list = ensureTimelineArray();
  const last = sortTimeline(list).at(-1);
  const start = last?.endSec ?? 0;
  list.push(
    createTimelineSegment({
      startSec: start,
      endSec: start + 12,
      label: `Section ${list.length + 1}`,
      intensity: 4,
    }),
  );
}

function remove(id: string) {
  const list = ensureTimelineArray();
  if (list.length <= 1) return;
  pattern.value.song.timeline = list.filter((s) => s.id !== id);
}

function move(index: number, delta: number) {
  const sorted = sortTimeline(ensureTimelineArray());
  const j = index + delta;
  if (j < 0 || j >= sorted.length) return;
  const a = sorted[index]!;
  const b = sorted[j]!;
  const aStart = a.startSec;
  const aEnd = a.endSec;
  a.startSec = b.startSec;
  a.endSec = b.endSec;
  b.startSec = aStart;
  b.endSec = aEnd;
  pattern.value.song.timeline = sortTimeline(sorted);
}

function snapAll() {
  const { bpm, timeSignature } = pattern.value.song;
  const list = ensureTimelineArray();
  for (const seg of list) {
    seg.startSec = snapToBar(seg.startSec, bpm, timeSignature);
    seg.endSec = Math.max(
      seg.startSec + secondsPerBar(bpm, timeSignature),
      snapToBar(seg.endSec, bpm, timeSignature),
    );
  }
}

function onTranspose() {
  assistantStore.injectChip(
    'Read the current song configuration (genre, mood, BPM, meter, structure, duration, energy, instruments) and transpose it into a coherent timeline with timed segments, directions, and Intensity 1–10. Switch to timeline composition mode and propose the full timeline for me to Apply.',
  );
  $q.notify({
    type: 'info',
    message: 'Prompt ready in Assistant — open the drawer and Send to transpose.',
  });
}
</script>

<style scoped>
.timeline-panel {
  min-width: 0;
  max-width: 100%;
}

.timeline-seg {
  display: grid;
  gap: 0.75rem;
  border: 1px solid var(--mt-line);
  padding: 0.9rem;
  min-width: 0;
}

.band-meter-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
  min-width: 0;
}
</style>
