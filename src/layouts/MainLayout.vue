<template>
  <q-layout view="hHh LpR lFf" class="bg-transparent">
    <q-header elevated class="mt-header">
      <q-toolbar>
        <div class="mt-brand q-mr-lg">mytunes</div>
        <div class="text-caption text-grey-5 q-mr-md hide-sm">Google Lyria studio</div>
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
import { storeToRefs } from 'pinia';
import AssistantDrawer from '@/components/assistant/AssistantDrawer.vue';
import BudgetBar from '@/components/BudgetBar.vue';
import SettingsDialog from '@/components/SettingsDialog.vue';
import { useAssistantStore } from '@/stores/assistant';
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
const assistant = useAssistantStore();
const { settingsOpen } = storeToRefs(ui);
const { open: assistantOpen } = storeToRefs(assistant);
</script>

<style scoped>
.mt-header {
  background: linear-gradient(180deg, rgba(36, 31, 25, 0.98), rgba(26, 22, 18, 0.95));
  border-bottom: 1px solid var(--mt-line);
}
</style>
