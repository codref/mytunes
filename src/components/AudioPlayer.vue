<template>
  <div class="mt-panel q-pa-md">
    <div class="mt-label q-mb-sm">Player</div>
    <div v-if="!currentGeneration" class="text-grey-5 text-caption">
      Generate to create a version of this song.
    </div>
    <template v-else>
      <div class="text-body2 q-mb-sm">
        {{ currentGeneration.patternName }} · {{ currentGeneration.mode }} ·
        ${{ currentGeneration.costUsd.toFixed(2) }}
      </div>
      <audio
        v-if="audioSrc"
        :key="currentGeneration.id"
        :src="audioSrc"
        controls
        class="full-width"
        style="height: 36px"
      />
      <div class="row q-gutter-sm items-center q-mt-sm">
        <q-btn
          unelevated
          dense
          color="primary"
          icon="movie"
          label="Export video"
          :loading="exportingId === currentGeneration.id"
          :disable="Boolean(exportingId)"
          @click="onExport(currentGeneration)"
        >
          <q-tooltip>Waveform MP4 + sidecar SRT</q-tooltip>
        </q-btn>
        <span v-if="exportingId === currentGeneration.id" class="text-caption text-grey-5">
          {{ exportStatus || 'Rendering waveform…' }}
        </span>
      </div>
      <div
        v-if="lastExport && lastExport.generationId === currentGeneration.id"
        class="text-caption text-grey-5 q-mt-xs"
      >
        Exported
        <span class="text-grey-4">{{ basename(lastExport.mp4Path) }}</span>
        + SRT
        <q-btn
          flat
          dense
          size="sm"
          color="primary"
          label="Reveal"
          class="q-ml-xs"
          @click="onReveal(lastExport.mp4Path)"
        />
      </div>
      <div v-if="recallWarning" class="text-caption text-amber-6 q-mt-xs">{{ recallWarning }}</div>
      <div
        v-if="currentGeneration.lyricsMismatch"
        class="text-caption text-amber-5 q-mt-xs"
      >
        Heavy lyric rewrite (overlap
        {{ Math.round((currentGeneration.lyricsMatchScore ?? 0) * 100) }}%). Light
        adaptation is OK; this take drifted far from your sheet.
      </div>
      <div v-if="currentGeneration.lyricsText" class="text-caption text-grey-5 q-mt-sm">
        Returned lyrics + diff live on the <strong>Lyrics</strong> and
        <strong>Coherence</strong> tabs.
      </div>
    </template>

    <div class="q-mt-md">
      <div class="mt-label q-mb-xs">Versions</div>
      <div v-if="!songGenerations.length" class="text-grey-5 text-caption">
        No versions yet for this song.
      </div>
      <div v-else class="mt-version-list">
        <div
          v-for="g in songGenerations.slice(0, 24)"
          :key="g.id"
          class="mt-version-item"
          :class="{
            'mt-version-item--active': currentGeneration?.id === g.id,
            'mt-version-item--expanded': expandedId === g.id,
          }"
        >
          <button
            type="button"
            class="mt-version-header"
            :disabled="recallingId === g.id || forkingId === g.id"
            @click="toggleExpand(g.id)"
          >
            <div class="mt-version-header__main">
              <div class="mt-version-title">
                {{ g.mode }} · {{ formatTime(g.createdAt) }}
              </div>
              <div class="mt-version-caption">
                ${{ g.costUsd.toFixed(2) }}
                <span v-if="!g.patternSnapshot"> · legacy</span>
                <span v-else-if="currentGeneration?.id === g.id"> · loaded</span>
              </div>
              <div v-if="notesPreview(g)" class="mt-version-notes-preview">
                {{ notesPreview(g) }}
              </div>
            </div>
            <q-icon
              :name="expandedId === g.id ? 'expand_less' : 'expand_more'"
              size="20px"
              class="mt-version-chevron"
            />
          </button>

          <div v-if="expandedId === g.id" class="mt-version-body">
            <audio
              :src="g.audioFileUrl || g.audioPath"
              controls
              class="full-width"
              style="height: 36px"
              @play="onInlinePlay"
            />

            <q-input
              v-model="draftNotes[g.id]"
              type="textarea"
              autogrow
              dense
              outlined
              dark
              class="q-mt-sm"
              label="Notes"
              placeholder="What works about this take?"
              :disable="savingNotesId === g.id"
              @blur="onNotesBlur(g)"
            />

            <div class="row q-gutter-sm q-mt-sm">
              <q-btn
                unelevated
                dense
                color="primary"
                icon="history"
                label="Restore"
                :loading="recallingId === g.id"
                :disable="forkingId === g.id || exportingId === g.id"
                @click="onRecall(g)"
              >
                <q-tooltip>Restore knobs, lyrics, prompt, and audio into the studio</q-tooltip>
              </q-btn>
              <q-btn
                outline
                dense
                color="primary"
                icon="call_split"
                label="Fork"
                :loading="forkingId === g.id"
                :disable="recallingId === g.id || exportingId === g.id"
                @click="onFork(g)"
              >
                <q-tooltip>New song thread from this take’s knobs, lyrics, and audio</q-tooltip>
              </q-btn>
              <q-btn
                outline
                dense
                color="primary"
                icon="movie"
                label="Export"
                :loading="exportingId === g.id"
                :disable="Boolean(exportingId) && exportingId !== g.id"
                @click="onExport(g)"
              >
                <q-tooltip>Waveform MP4 + sidecar SRT</q-tooltip>
              </q-btn>
            </div>
            <div
              v-if="exportingId === g.id"
              class="text-caption text-grey-5 q-mt-xs"
            >
              {{ exportStatus || 'Rendering waveform…' }}
            </div>
            <div
              v-if="lastExport && lastExport.generationId === g.id"
              class="text-caption text-grey-5 q-mt-xs"
            >
              Exported {{ basename(lastExport.mp4Path) }}
              <q-btn
                flat
                dense
                size="sm"
                color="primary"
                label="Reveal"
                class="q-ml-xs"
                @click="onReveal(lastExport.mp4Path)"
              />
            </div>
          </div>
        </div>
      </div>
      <div class="text-caption text-grey-6 q-mt-xs">
        Expand to preview and annotate. Restore loads the studio; Fork starts a new song thread.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useQuasar } from 'quasar';
import type { GenerationRecord } from '@/models/generation';
import { useLibraryStore } from '@/stores/library';

const $q = useQuasar();
const library = useLibraryStore();
const { songGenerations, currentGeneration, recallWarning } = storeToRefs(library);
const recallingId = ref<string | null>(null);
const forkingId = ref<string | null>(null);
const exportingId = ref<string | null>(null);
const exportStatus = ref('');
const lastExport = ref<{ generationId: string; mp4Path: string; srtPath: string } | null>(
  null,
);
const savingNotesId = ref<string | null>(null);
const expandedId = ref<string | null>(null);
const draftNotes = reactive<Record<string, string>>({});

const audioSrc = computed(
  () => currentGeneration.value?.audioFileUrl || currentGeneration.value?.audioPath || '',
);

let unsubExportProgress: (() => void) | null = null;

onMounted(() => {
  if (!window.mytunes) return;
  unsubExportProgress = window.mytunes.onExportVideoProgress((ev) => {
    if (exportingId.value && ev.generationId === exportingId.value) {
      const pct = ev.percent != null ? ` ${ev.percent}%` : '';
      exportStatus.value = `${ev.message}${pct}`;
    }
  });
});

onBeforeUnmount(() => {
  unsubExportProgress?.();
  unsubExportProgress = null;
});

function basename(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

watch(
  songGenerations,
  (list) => {
    for (const g of list) {
      if (!(g.id in draftNotes)) {
        draftNotes[g.id] = g.userNotes ?? '';
      }
    }
  },
  { immediate: true, deep: true },
);

function toggleExpand(id: string): void {
  expandedId.value = expandedId.value === id ? null : id;
}

function notesPreview(g: GenerationRecord): string {
  const text = (draftNotes[g.id] ?? g.userNotes ?? '').trim();
  if (!text) return '';
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

function onInlinePlay(event: Event): void {
  const playing = event.target as HTMLAudioElement;
  const root = (event.currentTarget as HTMLElement).closest('.mt-version-list');
  if (!root) return;
  root.querySelectorAll('audio').forEach((el) => {
    if (el !== playing) el.pause();
  });
}

async function onNotesBlur(g: GenerationRecord): Promise<void> {
  const next = (draftNotes[g.id] ?? '').trimEnd();
  const prev = g.userNotes ?? '';
  if (next === prev) return;
  savingNotesId.value = g.id;
  try {
    await library.updateGenerationNotes(g.id, next);
  } catch (e) {
    draftNotes[g.id] = prev;
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : String(e),
    });
  } finally {
    savingNotesId.value = null;
  }
}

async function onRecall(g: GenerationRecord): Promise<void> {
  if (recallingId.value) return;
  recallingId.value = g.id;
  try {
    await library.recallGeneration(g);
    $q.notify({
      type: 'positive',
      message: `Restored ${g.mode} · ${formatTime(g.createdAt)}`,
      timeout: 1800,
    });
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : String(e),
    });
  } finally {
    recallingId.value = null;
  }
}

function onFork(g: GenerationRecord): void {
  $q.dialog({
    title: 'Fork song thread',
    prompt: {
      model: `${g.patternName} (fork)`,
      type: 'text',
      label: 'New song name',
    },
    cancel: true,
    persistent: true,
    ok: { label: 'Fork', color: 'primary' },
  }).onOk((name: string) => {
    void (async () => {
      forkingId.value = g.id;
      try {
        const song = await library.forkFromGeneration(g, name);
        expandedId.value = null;
        $q.notify({
          type: 'positive',
          message: `Forked as ${song.name}`,
          timeout: 2200,
        });
      } catch (e) {
        $q.notify({
          type: 'negative',
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        forkingId.value = null;
      }
    })();
  });
}

async function onExport(g: GenerationRecord): Promise<void> {
  if (exportingId.value || !window.mytunes) return;
  exportingId.value = g.id;
  exportStatus.value = 'Preparing export…';
  try {
    const result = await window.mytunes.exportVideo(g.id);
    lastExport.value = {
      generationId: g.id,
      mp4Path: result.mp4Path,
      srtPath: result.srtPath,
    };
    const cuesNote =
      result.cueCount > 0 ? ` · ${result.cueCount} captions` : ' · no captions';
    $q.notify({
      type: 'positive',
      message: `Exported waveform video${cuesNote}`,
      timeout: 2800,
      actions: [
        {
          label: 'Reveal',
          color: 'white',
          handler: () => {
            void onReveal(result.mp4Path);
          },
        },
      ],
    });
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : String(e),
      timeout: 5000,
    });
  } finally {
    exportingId.value = null;
    exportStatus.value = '';
  }
}

async function onReveal(filePath: string): Promise<void> {
  if (!window.mytunes) return;
  try {
    await window.mytunes.revealInFolder(filePath);
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
</script>
