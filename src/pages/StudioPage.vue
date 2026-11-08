<template>
  <q-page class="studio q-pa-md">
    <div class="row q-col-gutter-md">
      <div class="col-12 col-md-8">
        <div class="mt-panel q-pa-md">
          <div class="row items-center q-mb-md q-gutter-sm">
            <q-btn-toggle
              v-model="mode"
              toggle-color="orange-8"
              :options="[
                { label: 'Clip $0.04', value: 'clip' },
                { label: 'Full $0.08', value: 'full' },
              ]"
            />
            <q-space />
            <q-btn flat dense color="grey-4" label="Reset" @click="patternStore.resetPattern()" />
            <q-btn flat dense color="grey-4" label="Save pattern" :loading="saving" @click="onSave" />
            <q-btn-dropdown flat dense color="grey-4" label="Load">
              <q-list dense dark>
                <q-item v-if="!savedPatterns.length">
                  <q-item-section>No saved patterns</q-item-section>
                </q-item>
                <q-item
                  v-for="p in savedPatterns"
                  :key="p.id"
                  clickable
                  v-close-popup
                  @click="patternStore.loadPattern(p)"
                >
                  <q-item-section>{{ p.name }}</q-item-section>
                </q-item>
              </q-list>
            </q-btn-dropdown>
            <q-btn
              color="orange-8"
              unelevated
              :loading="generating"
              :disable="hardBlocked"
              :label="generateLabel"
              @click="onGenerate"
            />
          </div>

          <q-banner v-if="!keyPresent" class="bg-red-10 text-white q-mb-md" dense>
            No backend configured. Set <code>GOOGLE_CLOUD_PROJECT</code> (Vertex) and/or
            <code>GOOGLE_API_KEY</code> in <code>.env.local</code>, then restart Electron.
          </q-banner>
          <q-banner v-else-if="hardBlocked" class="bg-red-9 text-white q-mb-md" dense>
            Budget hard limit reached. Raise limits before generating.
          </q-banner>
          <q-banner v-else-if="softWarned" class="bg-amber-9 text-black q-mb-md" dense>
            Approaching budget limit (80%+). Next {{ mode }} ≈ ${{ nextCost.toFixed(2) }}.
          </q-banner>

          <BandTabs />
        </div>
      </div>

      <div class="col-12 col-md-4">
        <AudioPlayer />
        <div class="mt-panel q-pa-md q-mt-md">
          <div class="mt-label q-mb-sm">Next call</div>
          <div class="text-h6 text-orange-5">${{ nextCost.toFixed(2) }} · {{ mode }}</div>
          <div class="text-caption text-grey-5 q-mt-xs">
            Clip = 30s preview. Full = lyria-3.5 song. Flash lyrics/refine billed separately by
            tokens.
          </div>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useQuasar } from 'quasar';
import AudioPlayer from '@/components/AudioPlayer.vue';
import BandTabs from '@/components/BandTabs.vue';
import { useBudgetStore } from '@/stores/budget';
import { useLibraryStore } from '@/stores/library';
import { usePatternStore } from '@/stores/pattern';

const $q = useQuasar();
const patternStore = usePatternStore();
const budgetStore = useBudgetStore();
const libraryStore = useLibraryStore();

const { pattern, compiledPrompt, mode } = storeToRefs(patternStore);
const { keyPresent } = storeToRefs(budgetStore);
const { savedPatterns, generating } = storeToRefs(libraryStore);

const saving = ref(false);

const nextCost = computed(() => budgetStore.nextCost(mode.value));
const gate = computed(() => budgetStore.gateFor(mode.value));
const hardBlocked = computed(() => gate.value.gate === 'hard');
const softWarned = computed(() => gate.value.gate === 'soft');
const generateLabel = computed(
  () => `Generate ${mode.value === 'clip' ? 'Clip' : 'Full'} $${nextCost.value.toFixed(2)}`,
);

onMounted(async () => {
  await Promise.all([budgetStore.refresh(), libraryStore.refresh()]);
});

async function onSave() {
  saving.value = true;
  try {
    await libraryStore.saveCurrentPattern(pattern.value);
    $q.notify({ type: 'positive', message: 'Pattern saved' });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  } finally {
    saving.value = false;
  }
}

async function onGenerate() {
  if (!window.mytunes) {
    $q.notify({
      type: 'warning',
      message: 'Run with Electron (`npm run dev:electron`) to generate music.',
    });
    return;
  }

  const check = await window.mytunes.checkBudget(nextCost.value);
  if (check.gate === 'hard') {
    $q.notify({ type: 'negative', message: 'Budget hard limit — raise limits first.' });
    return;
  }

  $q.dialog({
    title: `Confirm ${mode.value} generation`,
    message: `Cost: $${nextCost.value.toFixed(2)}\n\n${compiledPrompt.value.slice(0, 1200)}${
      compiledPrompt.value.length > 1200 ? '\n…' : ''
    }`,
    cancel: true,
    persistent: true,
    ok: { label: `Spend $${nextCost.value.toFixed(2)}`, color: 'orange-8' },
  }).onOk(() => {
    void (async () => {
      try {
        const result = await libraryStore.generateMusic({
          pattern: pattern.value,
          compiledPrompt: compiledPrompt.value,
          mode: mode.value,
        });
        budgetStore.applyBudget(result.budget);
        $q.notify({
          type: 'positive',
          message: result.reused
            ? 'Reused previous generation (no new charge)'
            : `Generated ${mode.value} for $${result.generation.costUsd.toFixed(2)}`,
        });
      } catch (e) {
        await budgetStore.refresh();
        $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
      }
    })();
  });
}
</script>

<style scoped>
.studio {
  max-width: 1400px;
  margin: 0 auto;
}
</style>
