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
        <q-btn-dropdown
          flat
          dense
          class="col-grow assistant-session-btn"
          menu-anchor="bottom left"
          menu-self="top left"
          @hide="sessionQuery = ''"
        >
          <template #label>
            <div class="assistant-session-label ellipsis">{{ activeTitle }}</div>
            <q-tooltip v-if="activeTitle" :delay="400">{{ activeTitle }}</q-tooltip>
          </template>
          <div class="assistant-session-search q-pa-sm" @click.stop>
            <q-input
              v-model="sessionQuery"
              dense
              dark
              filled
              clearable
              placeholder="Search chats"
              autofocus
            >
              <template #prepend>
                <q-icon name="search" size="xs" />
              </template>
            </q-input>
          </div>
          <q-list dense dark class="assistant-session-list">
            <q-item
              v-for="c in filteredConversations"
              :key="c.id"
              clickable
              v-close-popup
              :active="c.id === activeId"
              @click="assistant.selectConversation(c.id)"
            >
              <q-item-section>
                <q-item-label class="ellipsis">{{ c.title }}</q-item-label>
                <q-item-label caption>{{ formatSessionDate(c.updatedAt) }}</q-item-label>
              </q-item-section>
            </q-item>
            <q-item v-if="!filteredConversations.length">
              <q-item-section class="text-grey-5">
                {{ conversations.length ? 'No matching chats' : 'No chats yet' }}
              </q-item-section>
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
        :selected-model="selectedModel"
        :chat-models="chatModels"
        :models-loading="modelsLoading"
        :models-cached="modelsCached"
        @update:selected-model="onModelSelect"
        @send="onSend"
        @cancel="onCancel"
        @refresh-models="onRefreshModels"
      />
    </div>
  </q-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
  selectedModel,
  chatModels,
  modelsLoading,
  modelsCached,
} = storeToRefs(assistant);

const { pattern, mode } = storeToRefs(patternStore);

const sessionQuery = ref('');

const activeTitle = computed(() => activeConversation.value?.title ?? 'Assistant');
const patternChip = computed(() => `${pattern.value.name} · ${mode.value}`);

const filteredConversations = computed(() => {
  const q = sessionQuery.value.trim().toLowerCase();
  const list = conversations.value;
  if (!q) return list;
  return list.filter((c) => c.title.toLowerCase().includes(q));
});

onMounted(() => {
  void assistant.bootstrapModel();
});

function formatSessionDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.round((startOfToday.getTime() - startOfThat.getTime()) / 86_400_000);
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (dayDiff === 0) return `Today · ${time}`;
    if (dayDiff === 1) return `Yesterday · ${time}`;
    if (dayDiff > 1 && dayDiff < 7) {
      return `${d.toLocaleDateString(undefined, { weekday: 'short' })} · ${time}`;
    }
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
    });
  } catch {
    return iso;
  }
}

function onSend(): void {
  void assistant.sendMessage();
}

function onCancel(): void {
  void assistant.cancel();
}

function onModelSelect(id: string): void {
  void assistant.setSelectedModel(id);
}

function onRefreshModels(): void {
  void assistant.refreshChatModels(true);
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
  min-width: 0;
}

.assistant-session-btn {
  min-width: 0;
  max-width: 100%;
}

.assistant-session-btn :deep(.q-btn__content) {
  min-width: 0;
  width: 100%;
  justify-content: flex-start;
  flex-wrap: nowrap;
}

.assistant-session-btn :deep(.q-btn-dropdown__arrow) {
  flex-shrink: 0;
}

.assistant-session-label {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.assistant-session-search {
  min-width: 280px;
}

.assistant-session-list {
  max-height: min(60vh, 360px);
  overflow-y: auto;
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
