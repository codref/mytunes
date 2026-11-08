<template>
  <div ref="threadEl" class="assistant-thread">
    <div v-if="!messages.length" class="assistant-empty text-caption text-grey-5">
      Describe a song idea. Knobs update as we go — soft changes apply immediately; structure,
      lyrics, and clip/full mode ask for Apply. Fine-tune, then Generate when ready.
    </div>

    <div
      v-for="msg in messages"
      :key="msg.id"
      class="assistant-msg"
      :class="msg.role === 'user' ? 'is-user' : 'is-assistant'"
    >
      <div class="assistant-bubble">
        <div v-if="msg.progress && !msg.content" class="assistant-progress">{{ msg.progress }}</div>
        <div v-if="msg.content" class="assistant-text">{{ msg.content }}</div>
        <details v-if="msg.progress && msg.content" class="assistant-progress-log">
          <summary>Working…</summary>
          <div>{{ msg.progress }}</div>
        </details>
        <div v-if="msg.error" class="assistant-error">{{ msg.error }}</div>

        <div v-if="msg.softPatches?.length" class="assistant-soft q-mt-sm">
          <div class="mt-label q-mb-xs">Applied</div>
          <div v-for="p in msg.softPatches" :key="p.id" class="assistant-soft-line">
            {{ p.label }}
          </div>
        </div>

        <div v-if="msg.hardPatches?.length" class="assistant-hard q-mt-sm">
          <div
            v-for="p in msg.hardPatches"
            :key="p.id"
            class="hard-card"
            :class="`status-${p.status}`"
          >
            <div class="text-caption">{{ p.label }}</div>
            <div v-if="p.op === 'lyrics'" class="hard-preview">{{ String(p.value).slice(0, 280) }}</div>
            <div v-else-if="p.op === 'structure'" class="hard-preview">
              {{ Array.isArray(p.value) ? (p.value as string[]).join(' → ') : '' }}
            </div>
            <div v-else class="hard-preview">{{ String(p.value) }}</div>
            <div v-if="p.status === 'pending'" class="hard-actions q-mt-xs">
              <q-btn
                dense
                unelevated
                color="primary"
                text-color="dark"
                size="sm"
                label="Apply"
                @click="emit('apply-hard', msg.id, p.id)"
              />
              <q-btn
                dense
                flat
                color="grey-4"
                size="sm"
                label="Reject"
                @click="emit('reject-hard', msg.id, p.id)"
              />
            </div>
            <div v-else class="text-caption text-grey-5 q-mt-xs">{{ p.status }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { AssistantMessage } from '@/models/assistant';

const props = defineProps<{
  messages: AssistantMessage[];
}>();

const emit = defineEmits<{
  'apply-hard': [messageId: string, patchId: string];
  'reject-hard': [messageId: string, patchId: string];
}>();

const threadEl = ref<HTMLElement | null>(null);

watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    const el = threadEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
);
</script>

<style scoped>
.assistant-thread {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.assistant-empty {
  margin: auto;
  text-align: center;
  max-width: 16rem;
  line-height: 1.45;
}

.assistant-msg {
  display: flex;
}

.assistant-msg.is-user {
  justify-content: flex-end;
}

.assistant-msg.is-assistant {
  justify-content: flex-start;
}

.assistant-bubble {
  max-width: min(92%, 100%);
  min-width: 0;
  padding: 0.55rem 0.7rem;
  border-radius: 6px;
  border: 1px solid var(--mt-line);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  font-size: 0.86rem;
  line-height: 1.4;
}

.is-user .assistant-bubble {
  background: rgba(232, 160, 69, 0.2);
  border-color: rgba(232, 160, 69, 0.45);
}

.is-assistant .assistant-bubble {
  background: rgba(26, 22, 18, 0.9);
}

.assistant-progress {
  font-style: italic;
  color: var(--mt-muted);
}

.assistant-progress-log {
  margin-top: 0.35rem;
  color: var(--mt-muted);
  font-size: 0.78rem;
}

.assistant-error {
  color: var(--mt-danger);
  margin-top: 0.25rem;
}

.assistant-hard {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
}

.hard-card {
  border: 1px solid var(--mt-line);
  border-radius: 4px;
  padding: 0.45rem 0.55rem;
  background: rgba(18, 15, 12, 0.7);
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.hard-card.status-applied {
  border-color: rgba(106, 154, 91, 0.5);
}

.hard-card.status-rejected {
  opacity: 0.55;
}

.hard-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.hard-preview {
  margin-top: 0.25rem;
  font-size: 0.78rem;
  color: var(--mt-muted);
  max-height: 6rem;
  overflow-x: hidden;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.assistant-soft {
  min-width: 0;
}

.assistant-soft-line {
  font-size: 0.78rem;
  color: var(--mt-accent-2);
  overflow-wrap: anywhere;
}
</style>
