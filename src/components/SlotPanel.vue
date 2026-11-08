<template>
  <div class="mt-knob-row">
    <q-toggle
      :model-value="slot.enabled"
      color="primary"
      :label="`${label} enabled`"
      @update:model-value="(v) => patternStore.setSlotEnabled(slotId, v)"
    />

    <template v-for="(value, key) in slot.knobs" :key="key">
      <div v-if="typeof value === 'number'">
        <div class="mt-label">{{ key }} {{ value }}</div>
        <q-slider
          :model-value="value"
          :min="0"
          :max="100"
          color="primary"
          :disable="!slot.enabled"
          label
          @update:model-value="(v) => patternStore.setSlotKnob(slotId, key, Number(v))"
        />
      </div>
      <q-input
        v-else
        :model-value="String(value)"
        filled
        dark
        dense
        :label="String(key)"
        :disable="!slot.enabled"
        @update:model-value="(v) => patternStore.setSlotKnob(slotId, key, String(v ?? ''))"
      />
    </template>

    <q-input
      :model-value="slot.notes"
      filled
      dark
      dense
      type="textarea"
      autogrow
      label="Free-text notes"
      :disable="!slot.enabled"
      @update:model-value="(v) => patternStore.setSlotNotes(slotId, String(v ?? ''))"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getSlot, type BandSlotId } from '@/models/pattern';
import { usePatternStore } from '@/stores/pattern';

const props = defineProps<{ slotId: BandSlotId }>();
const patternStore = usePatternStore();

const slot = computed(() => getSlot(patternStore.pattern, props.slotId));
const label = computed(() => props.slotId.charAt(0).toUpperCase() + props.slotId.slice(1));
</script>
