<template>
  <q-layout view="hHh LpR lFf" class="bg-transparent">
    <q-header elevated class="mt-header">
      <q-toolbar>
        <div class="mt-brand q-mr-lg">myTunes</div>
        <div class="mt-song-meta row items-center no-wrap q-mr-md">
          <div class="mt-song-meta__text ellipsis">
            <span class="mt-song-meta__title">{{ songTitle }}</span>
            <span class="text-caption text-grey-5"> · {{ versionLabel }}</span>
            <span v-if="isDirty" class="text-caption text-primary"> · unsaved</span>
          </div>
          <q-btn flat dense round icon="edit" size="sm" class="q-ml-xs" @click="onRename">
            <q-tooltip>Rename song</q-tooltip>
          </q-btn>
        </div>
        <q-space />
        <BudgetBar class="gt-xs" />
        <q-btn flat dense icon="tune" class="q-ml-sm" @click="ui.openSettings()">
          <q-tooltip>Settings</q-tooltip>
        </q-btn>
        <q-btn
          flat
          dense
          icon="chat"
          class="q-ml-xs"
          :color="assistantOpen ? 'primary' : undefined"
          @click="assistant.toggleOpen()"
        >
          <q-tooltip>Assistant</q-tooltip>
        </q-btn>
      </q-toolbar>
      <div class="q-px-md q-pb-sm lt-sm">
        <BudgetBar />
      </div>
    </q-header>

    <AssistantDrawer />

    <q-page-container>
      <router-view />
    </q-page-container>

    <SettingsDialog v-model="settingsOpen" />
  </q-layout>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useQuasar } from 'quasar';
import AssistantDrawer from '@/components/assistant/AssistantDrawer.vue';
import BudgetBar from '@/components/BudgetBar.vue';
import SettingsDialog from '@/components/SettingsDialog.vue';
import { useAssistantStore } from '@/stores/assistant';
import { useLibraryStore } from '@/stores/library';
import { usePatternStore } from '@/stores/pattern';
import { useUiStore } from '@/stores/ui';

const $q = useQuasar();
const ui = useUiStore();
const assistant = useAssistantStore();
const libraryStore = useLibraryStore();
const patternStore = usePatternStore();

const { settingsOpen } = storeToRefs(ui);
const { open: assistantOpen } = storeToRefs(assistant);
const { activeSong, isDirty, songGenerations } = storeToRefs(libraryStore);
const { pattern } = storeToRefs(patternStore);

const songTitle = computed(
  () => pattern.value.name || activeSong.value?.name || 'Untitled song',
);

const versionLabel = computed(() => {
  const n = songGenerations.value.length;
  if (n === 0) return 'No versions';
  if (n === 1) return '1 version';
  return `${n} versions`;
});

function onRename() {
  $q.dialog({
    title: 'Rename song',
    prompt: {
      model: pattern.value.name || activeSong.value?.name || 'Untitled Song',
      type: 'text',
      label: 'Song name',
    },
    cancel: true,
    persistent: true,
    ok: { label: 'Rename', color: 'primary' },
  }).onOk((name: string) => {
    const trimmed = name.trim() || 'Untitled Song';
    patternStore.pattern.name = trimmed;
    if (activeSong.value) {
      activeSong.value = { ...activeSong.value, name: trimmed };
    }
  });
}
</script>

<style scoped>
.mt-header {
  background: linear-gradient(180deg, rgba(36, 31, 25, 0.98), rgba(26, 22, 18, 0.95));
  border-bottom: 1px solid var(--mt-line);
}

.mt-song-meta {
  min-width: 0;
  max-width: min(42vw, 28rem);
}

.mt-song-meta__text {
  min-width: 0;
}

.mt-song-meta__title {
  font-size: 0.95rem;
  font-weight: 500;
}
</style>
