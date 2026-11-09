<template>
  <div class="mt-knob-row">
    <q-toggle
      :model-value="slot.enabled"
      color="primary"
      label="Vocals enabled"
      @update:model-value="(v) => patternStore.setSlotEnabled('vocals', v)"
    />

    <div class="text-caption text-grey-5">
      Tag lyric lines with
      <code>[Voice: {{ leadName }}]</code>
      (exact name). Untagged lines use the first voice.
    </div>

    <div
      v-for="(voice, index) in voices"
      :key="voice.id"
      class="voice-card"
      :class="{ 'voice-card--disabled': !slot.enabled }"
    >
      <div class="row items-center justify-between q-mb-sm">
        <div class="mt-label">Voice {{ index + 1 }}</div>
        <q-btn
          v-if="voices.length > 1"
          flat
          dense
          color="negative"
          icon="close"
          size="sm"
          :disable="!slot.enabled"
          @click="patternStore.removeVocalVoice(voice.id)"
        >
          <q-tooltip>Remove voice</q-tooltip>
        </q-btn>
      </div>

      <q-input
        :model-value="voice.name"
        filled
        dark
        dense
        label="Name"
        :disable="!slot.enabled"
        @update:model-value="(v) => patternStore.updateVocalVoice(voice.id, { name: String(v ?? '') })"
      />
      <q-input
        :model-value="voice.style"
        filled
        dark
        dense
        label="Style"
        :disable="!slot.enabled"
        @update:model-value="(v) => patternStore.updateVocalVoice(voice.id, { style: String(v ?? '') })"
      />
      <div class="band-meter-row">
        <q-select
          :model-value="voice.gender || ''"
          :options="genderOptions"
          filled
          dark
          dense
          label="Gender"
          emit-value
          map-options
          :disable="!slot.enabled"
          @update:model-value="
            (v) => patternStore.updateVocalVoice(voice.id, { gender: (v ?? '') as VocalGender })
          "
        />
        <q-select
          :model-value="voice.range"
          :options="rangeOptions"
          filled
          dark
          dense
          label="Range"
          :disable="!slot.enabled"
          @update:model-value="(v) => patternStore.updateVocalVoice(voice.id, { range: String(v) })"
        />
      </div>
      <div class="band-meter-row">
        <q-select
          :model-value="voice.timbre || ''"
          :options="timbreOptions"
          filled
          dark
          dense
          use-input
          hide-selected
          fill-input
          input-debounce="0"
          label="Timbre"
          :disable="!slot.enabled"
          @filter="filterTimbre"
          @update:model-value="
            (v) => patternStore.updateVocalVoice(voice.id, { timbre: String(v ?? '') })
          "
        />
        <q-input
          :model-value="voice.delivery"
          filled
          dark
          dense
          label="Delivery"
          :disable="!slot.enabled"
          @update:model-value="
            (v) => patternStore.updateVocalVoice(voice.id, { delivery: String(v ?? '') })
          "
        />
      </div>
      <div>
        <div class="mt-label">Presence {{ voice.presence }}</div>
        <q-slider
          :model-value="voice.presence"
          :min="0"
          :max="100"
          color="primary"
          :disable="!slot.enabled"
          label
          @update:model-value="
            (v) => patternStore.updateVocalVoice(voice.id, { presence: Number(v) })
          "
        />
      </div>
      <q-input
        :model-value="voice.notes"
        filled
        dark
        dense
        type="textarea"
        autogrow
        label="Voice notes"
        :disable="!slot.enabled"
        @update:model-value="(v) => patternStore.updateVocalVoice(voice.id, { notes: String(v ?? '') })"
      />
    </div>

    <q-btn
      outline
      dense
      color="primary"
      label="Add voice"
      :disable="!slot.enabled || voices.length >= maxVoices"
      @click="patternStore.addVocalVoice()"
    />

    <q-input
      :model-value="slot.notes"
      filled
      dark
      dense
      type="textarea"
      autogrow
      label="Ensemble notes"
      hint="Shared direction for all voices"
      :disable="!slot.enabled"
      @update:model-value="(v) => patternStore.setSlotNotes('vocals', String(v ?? ''))"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  getSlot,
  MAX_VOCAL_VOICES,
  VOCAL_GENDER_OPTIONS,
  VOCAL_RANGE_OPTIONS,
  VOCAL_TIMBRE_OPTIONS,
  type VocalGender,
} from '@/models/pattern';
import { usePatternStore } from '@/stores/pattern';

const patternStore = usePatternStore();
const slot = computed(() => getSlot(patternStore.pattern, 'vocals'));
const voices = computed(() => slot.value.voices ?? []);
const leadName = computed(() => voices.value[0]?.name?.trim() || 'Lead');
const maxVoices = MAX_VOCAL_VOICES;

const genderOptions = VOCAL_GENDER_OPTIONS.map((g) => ({
  label: g === '' ? 'Unspecified' : g.charAt(0).toUpperCase() + g.slice(1),
  value: g,
}));
const rangeOptions = [...VOCAL_RANGE_OPTIONS];
const timbreOptions = ref<string[]>([...VOCAL_TIMBRE_OPTIONS]);

function filterTimbre(val: string, update: (fn: () => void) => void) {
  update(() => {
    const needle = val.toLowerCase();
    timbreOptions.value = needle
      ? VOCAL_TIMBRE_OPTIONS.filter((t) => t.includes(needle))
      : [...VOCAL_TIMBRE_OPTIONS];
  });
}
</script>

<style scoped>
.voice-card {
  display: grid;
  gap: 0.85rem;
  border: 1px solid var(--mt-line);
  padding: 0.9rem;
  min-width: 0;
}

.voice-card--disabled {
  opacity: 0.55;
}

.band-meter-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
  min-width: 0;
  max-width: 100%;
}

.band-meter-row > * {
  min-width: 0;
}

.mt-knob-row {
  min-width: 0;
  max-width: 100%;
}
</style>
