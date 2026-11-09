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
    <div class="row items-center q-gutter-sm q-mt-sm composer-toolbar">
      <q-select
        :model-value="selectedModel"
        :options="modelOptions"
        dense
        outlined
        dark
        emit-value
        map-options
        options-dense
        :disable="busy"
        :loading="modelsLoading"
        class="composer-model"
        popup-content-class="bg-dark"
        @update:model-value="onModelChange"
      >
        <template #option="scope">
          <q-item v-bind="scope.itemProps" dense>
            <q-item-section>
              <q-item-label>{{ scope.opt.label }}</q-item-label>
              <q-item-label v-if="scope.opt.caption" caption>{{ scope.opt.caption }}</q-item-label>
            </q-item-section>
          </q-item>
        </template>
        <template #append>
          <q-btn
            flat
            dense
            round
            size="sm"
            icon="refresh"
            :disable="busy || modelsLoading"
            @click.stop="emit('refresh-models')"
          >
            <q-tooltip>{{ modelsCached ? 'Refresh model list' : 'Reload models' }}</q-tooltip>
          </q-btn>
        </template>
      </q-select>
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
import type { ChatModelInfo } from '@/models/chatModels';

const props = defineProps<{
  modelValue: string;
  busy: boolean;
  selectedModel: string;
  chatModels: ChatModelInfo[];
  modelsLoading: boolean;
  modelsCached: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [string];
  'update:selectedModel': [string];
  send: [];
  cancel: [];
  'refresh-models': [];
}>();

const draft = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v),
});

const modelOptions = computed(() => {
  const list = props.chatModels.length
    ? props.chatModels
    : [{ id: props.selectedModel, displayName: props.selectedModel }];
  return list.map((m) => ({
    label: m.displayName || m.id,
    value: m.id,
    caption: m.displayName && m.displayName !== m.id ? m.id : undefined,
  }));
});

const placeholder = 'Describe a song idea…';

function onModelChange(v: string | null) {
  if (v) emit('update:selectedModel', v);
}

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

.composer-toolbar {
  flex-wrap: wrap;
  max-width: 100%;
}

.composer-model {
  min-width: 0;
  flex: 1 1 11rem;
  max-width: min(100%, 16rem);
}
</style>
