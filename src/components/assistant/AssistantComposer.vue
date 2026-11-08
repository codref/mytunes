<template>
  <div class="assistant-composer">
    <q-input
      v-model="draft"
      dark
      filled
      dense
      autogrow
      type="textarea"
      :placeholder="placeholder"
      :disable="busy"
      class="assistant-input"
      @keydown="onKeydown"
    />
    <div class="row items-center q-gutter-sm q-mt-sm">
      <q-btn
        v-if="busy"
        flat
        dense
        color="grey-4"
        label="Stop"
        @click="emit('cancel')"
      />
      <q-space />
      <q-btn
        color="primary"
        text-color="dark"
        unelevated
        dense
        label="Send"
        :loading="busy"
        :disable="!draft.trim()"
        @click="emit('send')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  modelValue: string;
  busy: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [string];
  send: [];
  cancel: [];
}>();

const draft = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v),
});

const placeholder = 'Describe a song idea…';

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!props.busy && draft.value.trim()) emit('send');
  }
}
</script>

<style scoped>
.assistant-composer {
  flex-shrink: 0;
  border-top: 1px solid var(--mt-line);
  padding: 0.75rem;
  background: rgba(18, 15, 12, 0.85);
  max-width: 100%;
  overflow-x: hidden;
}

.assistant-input {
  max-width: 100%;
}

.assistant-input :deep(textarea) {
  max-height: 140px;
  max-width: 100%;
}
</style>
