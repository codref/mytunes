import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useUiStore = defineStore('ui', () => {
  const settingsOpen = ref(false);

  function openSettings(): void {
    settingsOpen.value = true;
  }

  return {
    settingsOpen,
    openSettings,
  };
});
