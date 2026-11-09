<template>
  <div class="timeline-sim">
    <div class="row items-center q-gutter-sm q-mb-sm">
      <q-btn
        dense
        unelevated
        color="primary"
        text-color="dark"
        :icon="playing ? 'pause' : 'play_arrow'"
        :label="playing ? 'Pause' : 'Play'"
        @click="toggle"
      />
      <q-btn dense flat color="grey-4" icon="stop" label="Stop" @click="stop" />
      <q-toggle v-model="clickEnabled" dense color="primary" label="Metronome" />
      <div class="text-caption text-grey-5">
        {{ formatMmSs(playhead) }} / {{ formatMmSs(duration) }}
        <span v-if="activeLabel"> · {{ activeLabel }}</span>
      </div>
    </div>

    <div class="timeline-sim__track" @click="onTrackClick">
      <div
        v-for="seg in sorted"
        :key="seg.id"
        class="timeline-sim__seg"
        :class="{ 'timeline-sim__seg--active': seg.id === activeId }"
        :style="segStyle(seg)"
      >
        <span class="ellipsis">{{ seg.label }}</span>
      </div>
      <div class="timeline-sim__playhead" :style="{ left: `${playheadPct}%` }" />
    </div>

    <q-slider
      :model-value="playhead"
      :min="0"
      :max="Math.max(1, duration)"
      :step="0.1"
      color="primary"
      label
      :label-value="formatMmSs(playhead)"
      class="q-mt-sm"
      @update:model-value="seek"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { beatsPerBar, formatMmSs, sortTimeline, timelineTotalSec } from '@/models/timeline';
import { usePatternStore } from '@/stores/pattern';

const patternStore = usePatternStore();
const { pattern } = storeToRefs(patternStore);

const playing = ref(false);
const clickEnabled = ref(true);
const playhead = ref(0);
let raf = 0;
let lastTs = 0;
let audioCtx: AudioContext | null = null;
let nextBeatSec = 0;
let beatIndex = 0;

const sorted = computed(() => sortTimeline(pattern.value.song.timeline ?? []));
const duration = computed(() =>
  Math.max(
    timelineTotalSec(sorted.value, 0),
    pattern.value.lyriaMode === 'clip' ? 30 : 60,
  ),
);

const activeSeg = computed(() =>
  sorted.value.find((s) => playhead.value >= s.startSec && playhead.value < s.endSec),
);
const activeId = computed(() => activeSeg.value?.id ?? null);
const activeLabel = computed(() => activeSeg.value?.label ?? '');
const playheadPct = computed(() => (playhead.value / Math.max(0.001, duration.value)) * 100);

function segStyle(seg: { startSec: number; endSec: number; intensity: number }) {
  const left = (seg.startSec / Math.max(0.001, duration.value)) * 100;
  const width = ((seg.endSec - seg.startSec) / Math.max(0.001, duration.value)) * 100;
  const alpha = 0.25 + (seg.intensity / 10) * 0.55;
  return {
    left: `${left}%`,
    width: `${Math.max(width, 0.5)}%`,
    background: `rgba(100, 200, 255, ${alpha})`,
  };
}

function ensureAudio(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function click(accent: boolean) {
  if (!clickEnabled.value) return;
  const ctx = ensureAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1200 : 800;
  gain.gain.value = accent ? 0.08 : 0.04;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.05);
}

function scheduleClicks(nowSong: number, dt: number) {
  const bpm = pattern.value.song.bpm;
  const beatSec = 60 / Math.max(1, bpm);
  const bpb = beatsPerBar(pattern.value.song.timeSignature);
  const end = nowSong + dt;
  while (nextBeatSec <= end) {
    if (nextBeatSec >= nowSong - 0.001) {
      click(beatIndex % bpb === 0);
    }
    nextBeatSec += beatSec;
    beatIndex += 1;
  }
}

function frame(ts: number) {
  if (!playing.value) return;
  if (!lastTs) lastTs = ts;
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;
  const next = playhead.value + dt;
  if (next >= duration.value) {
    playhead.value = duration.value;
    stop();
    return;
  }
  scheduleClicks(playhead.value, dt);
  playhead.value = next;
  raf = requestAnimationFrame(frame);
}

function toggle() {
  if (playing.value) {
    playing.value = false;
    cancelAnimationFrame(raf);
    lastTs = 0;
    return;
  }
  ensureAudio().resume().catch(() => undefined);
  if (playhead.value >= duration.value) playhead.value = 0;
  const beatSec = 60 / Math.max(1, pattern.value.song.bpm);
  nextBeatSec = Math.ceil(playhead.value / beatSec - 1e-6) * beatSec;
  beatIndex = Math.round(nextBeatSec / beatSec);
  playing.value = true;
  lastTs = 0;
  raf = requestAnimationFrame(frame);
}

function stop() {
  playing.value = false;
  cancelAnimationFrame(raf);
  lastTs = 0;
  playhead.value = 0;
  nextBeatSec = 0;
  beatIndex = 0;
}

function seek(v: number | null) {
  playhead.value = Math.max(0, Number(v) || 0);
  const beatSec = 60 / Math.max(1, pattern.value.song.bpm);
  nextBeatSec = Math.ceil(playhead.value / beatSec - 1e-6) * beatSec;
  beatIndex = Math.round(nextBeatSec / beatSec);
}

function onTrackClick(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  seek(pct * duration.value);
}

watch(
  () => [pattern.value.song.bpm, pattern.value.song.timeSignature],
  () => {
    const beatSec = 60 / Math.max(1, pattern.value.song.bpm);
    nextBeatSec = Math.ceil(playhead.value / beatSec - 1e-6) * beatSec;
    beatIndex = Math.round(nextBeatSec / beatSec);
  },
);

onBeforeUnmount(() => {
  stop();
  void audioCtx?.close();
  audioCtx = null;
});
</script>

<style scoped>
.timeline-sim__track {
  position: relative;
  height: 44px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--mt-line);
  overflow: hidden;
  cursor: pointer;
}

.timeline-sim__seg {
  position: absolute;
  top: 4px;
  bottom: 4px;
  display: flex;
  align-items: center;
  padding: 0 6px;
  font-size: 11px;
  color: #e8f4ff;
  border-right: 1px solid rgba(0, 0, 0, 0.25);
  box-sizing: border-box;
}

.timeline-sim__seg--active {
  outline: 1px solid var(--q-primary);
}

.timeline-sim__playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #fff;
  pointer-events: none;
  transform: translateX(-1px);
}
</style>
