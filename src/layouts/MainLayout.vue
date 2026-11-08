<template>
  <q-layout view="hHh LpR lFf" class="bg-transparent">
    <q-header elevated class="mt-header">
      <q-toolbar>
        <div class="mt-brand q-mr-lg">mytunes</div>
        <div class="text-caption text-grey-5 q-mr-md hide-sm">Google Lyria studio</div>
        <q-space />
        <BudgetBar class="gt-xs" />
      </q-toolbar>
      <div class="q-px-md q-pb-sm lt-sm">
        <BudgetBar />
      </div>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import BudgetBar from '@/components/BudgetBar.vue';
</script>

<style scoped>
.mt-header {
  background: linear-gradient(180deg, rgba(36, 31, 25, 0.98), rgba(26, 22, 18, 0.95));
  border-bottom: 1px solid var(--mt-line);
}
</style>
