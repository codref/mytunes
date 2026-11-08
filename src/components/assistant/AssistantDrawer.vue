<template>
  <q-drawer
    :model-value="open"
    side="right"
    overlay
    bordered
    :width="380"
    class="assistant-drawer"
    @update:model-value="assistant.toggleOpen($event)"
  >
    <div class="assistant-root column full-height">
      <div class="assistant-toolbar row items-center q-px-sm q-py-sm">
        <q-btn-dropdown flat dense :label="activeTitle" class="col-grow text-left">
          <q-list dense dark style="min-width: 220px">
            <q-item
              v-for="c in conversations"
              :key="c.id"
              clickable
              v-close-popup
              :active="c.id === activeId"
              @click="assistant.selectConversation(c.id)"
            >
              <q-item-section>{{ c.title }}</q-item-section>
            </q-item>
            <q-item v-if="!conversations.length">
              <q-item-section class="text-grey-5">No chats yet</q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>
        <q-btn flat dense icon="add" @click="assistant.newChat()">
          <q-tooltip>New chat</q-tooltip>
        </q-btn>
        <q-btn flat dense icon="delete_outline" :disable="!activeId" @click="assistant.deleteActive()">
          <q-tooltip>Delete chat</q-tooltip>
        </q-btn>
        <q-btn flat dense icon="close" @click="assistant.toggleOpen(false)" />
      </div>

      <div class="assistant-context row items-center q-px-sm q-pb-sm">
        <q-chip
          dense
          outline
          color="primary"
          text-color="primary"
          class="assistant-pattern-chip"
          :label="patternChip"
        />
        <q-chip
          v-if="canUndoSoft"
          dense
          clickable
          outline
          color="grey-5"
          text-color="grey-4"
          label="Undo knobs"
          @click="assistant.undoSoft()"
        />
      </div>

      <AssistantThread
        :messages="messages"
        @apply-hard="assistant.applyHardPatch"
        @reject-hard="assistant.rejectHardPatch"
      />

      <AssistantActions :chips="assistant.actionChips" @inject="assistant.injectChip" />

      <div v-if="lastError" class="text-caption text-negative q-px-sm q-pb-xs">{{ lastError }}</div>

      <AssistantComposer
        v-model="composerDraft"
        :busy="busy"
        @send="onSend"
        @cancel="onCancel"
      />
    </div>
  </q-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import AssistantActions from '@/components/assistant/AssistantActions.vue';
import AssistantComposer from '@/components/assistant/AssistantComposer.vue';
import AssistantThread from '@/components/assistant/AssistantThread.vue';
import { useAssistantStore } from '@/stores/assistant';
import { usePatternStore } from '@/stores/pattern';

const assistant = useAssistantStore();
const patternStore = usePatternStore();

const {
  open,
  conversations,
  activeId,
  busy,
  composerDraft,
  lastError,
  messages,
  canUndoSoft,
  activeConversation,
} = storeToRefs(assistant);

const { pattern, mode } = storeToRefs(patternStore);

const activeTitle = computed(() => activeConversation.value?.title ?? 'Assistant');
const patternChip = computed(() => `${pattern.value.name} · ${mode.value}`);

function onSend(): void {
  void assistant.sendMessage();
}

function onCancel(): void {
  void assistant.cancel();
}
</script>

<style scoped>
.assistant-drawer {
  background: linear-gradient(180deg, rgba(36, 31, 25, 0.98), rgba(18, 15, 12, 0.98));
  border-left: 1px solid var(--mt-line);
}

.assistant-drawer :deep(.q-drawer__content) {
  overflow-x: hidden;
}

.assistant-root {
  height: 100%;
  min-height: 0;
  max-width: 100%;
  overflow-x: hidden;
}

.assistant-toolbar {
  flex-shrink: 0;
  border-bottom: 1px solid var(--mt-line);
  gap: 0.15rem;
  max-width: 100%;
}

.assistant-context {
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 0.35rem;
  max-width: 100%;
}

.assistant-pattern-chip {
  max-width: 100%;
}

.assistant-pattern-chip :deep(.q-chip__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  max-width: 100%;
}
</style>
