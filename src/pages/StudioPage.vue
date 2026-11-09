<template>
  <q-page class="studio q-pa-md">
    <div class="row q-col-gutter-md studio-grid">
      <div class="col-12 col-md-8">
        <div class="mt-panel q-pa-md">
          <div class="studio-toolbar q-mb-md row items-center no-wrap">
            <div class="studio-toolbar__files row items-center">
              <q-btn flat dense color="grey-4" label="New song" @click="onNewSong" />
              <q-btn
                flat
                dense
                color="grey-4"
                :label="isDirty ? 'Save*' : 'Save'"
                :loading="saving"
                @click="onSave"
              />
              <q-btn flat dense color="grey-5" label="Save as…" :disable="saving" @click="onSaveAs" />
              <q-btn-dropdown flat dense color="grey-4" label="Open">
                <q-list dense dark style="min-width: 220px">
                  <q-item v-if="!songs.length">
                    <q-item-section>No saved songs</q-item-section>
                  </q-item>
                  <q-item
                    v-for="s in songs"
                    :key="s.id"
                    clickable
                    v-close-popup
                    :active="activeSong?.id === s.id"
                    @click="onOpen(s.id)"
                  >
                    <q-item-section>
                      <q-item-label>{{ s.name }}</q-item-label>
                      <q-item-label caption>{{ formatTime(s.updatedAt) }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-btn-dropdown>
            </div>
            <q-space />
            <q-btn-dropdown
              split
              color="primary"
              text-color="dark"
              unelevated
              no-wrap
              :loading="generating"
              :disable="hardBlocked"
              :label="generateLabel"
              content-class="bg-dark"
              @click="onGenerate"
            >
              <q-list dense dark style="min-width: 200px">
                <q-item
                  v-for="opt in modeOptions"
                  :key="opt.value"
                  clickable
                  v-close-popup
                  :active="mode === opt.value"
                  @click="mode = opt.value"
                >
                  <q-item-section>
                    <q-item-label>{{ opt.title }}</q-item-label>
                    <q-item-label caption>{{ opt.caption }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-item-label class="text-primary">{{ opt.price }}</q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-btn-dropdown>
          </div>

          <q-banner v-if="!keyPresent" class="bg-red-10 text-white q-mb-md" dense>
            <div class="row items-center">
              <div class="col">
                No backend configured. Open Settings to add a Gemini API key or Vertex project
                (or set credentials in <code>.env.local</code>).
              </div>
              <q-btn flat dense color="white" label="Settings" class="q-ml-sm" @click="ui.openSettings()" />
            </div>
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
import { useUiStore } from '@/stores/ui';

const $q = useQuasar();
const patternStore = usePatternStore();
const budgetStore = useBudgetStore();
const libraryStore = useLibraryStore();
const ui = useUiStore();

const { pattern, compiledPrompt, mode } = storeToRefs(patternStore);
const { keyPresent } = storeToRefs(budgetStore);
const { songs, activeSong, generating, isDirty } = storeToRefs(libraryStore);

const saving = ref(false);

const nextCost = computed(() => budgetStore.nextCost(mode.value));
const gate = computed(() => budgetStore.gateFor(mode.value));
const hardBlocked = computed(() => gate.value.gate === 'hard');
const softWarned = computed(() => gate.value.gate === 'soft');
const generateLabel = computed(() => {
  const title = mode.value === 'full' ? 'Full' : 'Clip';
  return `Generate ${title} · $${nextCost.value.toFixed(2)}`;
});

const modeOptions = computed(() => [
  {
    label: `Clip · $${budgetStore.nextCost('clip').toFixed(2)}`,
    value: 'clip' as const,
    title: 'Clip',
    caption: '30s preview',
    price: `$${budgetStore.nextCost('clip').toFixed(2)}`,
  },
  {
    label: `Full · $${budgetStore.nextCost('full').toFixed(2)}`,
    value: 'full' as const,
    title: 'Full',
    caption: 'Complete song',
    price: `$${budgetStore.nextCost('full').toFixed(2)}`,
  },
]);

onMounted(async () => {
  await budgetStore.refresh();
  const restored = await libraryStore.restoreSession();
  if (!restored) {
    await Promise.all([libraryStore.refreshSongs(), patternStore.bootstrapFromSettings()]);
    libraryStore.markClean(patternStore.pattern);
  } else {
    await libraryStore.refreshSongs();
  }
});

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

async function onNewSong() {
  if (isDirty.value) {
    $q.dialog({
      title: 'Discard unsaved changes?',
      message: 'Start a new song without saving the current one?',
      cancel: true,
      persistent: true,
      ok: { label: 'New song', color: 'primary' },
    }).onOk(() => {
      void libraryStore.newSong();
    });
    return;
  }
  await libraryStore.newSong();
}

async function onSave() {
  saving.value = true;
  try {
    await libraryStore.saveSong();
    $q.notify({ type: 'positive', message: 'Song saved' });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  } finally {
    saving.value = false;
  }
}

function onSaveAs() {
  $q.dialog({
    title: 'Save song as',
    prompt: {
      model: pattern.value.name || 'Untitled Song',
      type: 'text',
      label: 'Song name',
    },
    cancel: true,
    persistent: true,
    ok: { label: 'Save', color: 'primary' },
  }).onOk((name: string) => {
    void (async () => {
      saving.value = true;
      try {
        await libraryStore.saveSongAs(name);
        $q.notify({ type: 'positive', message: 'Song saved as new project' });
      } catch (e) {
        $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
      } finally {
        saving.value = false;
      }
    })();
  });
}

async function onOpen(id: string) {
  try {
    const song = await libraryStore.openSong(id);
    if (!song) {
      $q.notify({ type: 'warning', message: 'Song not found' });
      return;
    }
    $q.notify({ type: 'positive', message: `Opened ${song.name}` });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
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
    ok: { label: `Spend $${nextCost.value.toFixed(2)}`, color: 'primary' },
  }).onOk(() => {
    void (async () => {
      try {
        const result = await libraryStore.generateMusic({
          pattern: pattern.value,
          compiledPrompt: compiledPrompt.value,
          mode: mode.value,
        });
        budgetStore.applyBudget(result.budget);
        if (result.generation.lyricsMismatch) {
          $q.notify({
            type: 'warning',
            timeout: 10000,
            message:
              'Lyria heavily rewrote your lyrics (beyond a light adaptation). Audio is kept — check the returned transcript, tweak the sheet/theme, or accept this take.',
          });
        } else {
          $q.notify({
            type: 'positive',
            message: result.reused
              ? 'Reused previous version (no new charge)'
              : `Saved version · ${mode.value} · $${result.generation.costUsd.toFixed(2)}`,
          });
        }
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
  overflow-x: hidden;
}

.studio-grid {
  max-width: 100%;
}

/* Flex columns default to min-width:auto and can grow past the panel from wide toolbars/tabs. */
.studio-grid > [class*='col-'] {
  min-width: 0;
}

.studio-toolbar {
  gap: 0.75rem;
  max-width: 100%;
  min-width: 0;
}

.studio-toolbar__files {
  gap: 0.15rem;
  min-width: 0;
  flex-wrap: wrap;
}
</style>
