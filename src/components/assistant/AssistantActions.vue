<template>
  <div class="assistant-actions q-px-sm q-pb-sm">
    <q-chip
      v-for="chip in chips"
      :key="chip.id"
      clickable
      outline
      dense
      color="primary"
      text-color="primary"
      :label="chip.label"
      @click="emit('inject', chip.prompt)"
    >
      <q-tooltip>Inject into composer — edit, then Send</q-tooltip>
    </q-chip>
  </div>
</template>

<script setup lang="ts">
import type { ASSISTANT_ACTION_CHIPS } from '@/models/assistant';

defineProps<{
  chips: typeof ASSISTANT_ACTION_CHIPS;
}>();

const emit = defineEmits<{
  inject: [prompt: string];
}>();
</script>

<style scoped>
.assistant-actions {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  max-width: 100%;
}
</style>
