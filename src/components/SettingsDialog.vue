<template>
  <q-dialog :model-value="modelValue" persistent @update:model-value="emit('update:modelValue', $event)">
    <q-card class="settings-card mt-panel" style="min-width: 420px; max-width: 560px">
      <q-card-section class="row items-center">
        <div class="text-h6">Settings</div>
        <q-space />
        <q-btn flat dense round icon="close" v-close-popup />
      </q-card-section>

      <q-card-section class="q-gutter-md">
        <div class="mt-label">Backend</div>
        <q-btn-toggle
          v-model="form.backendPreference"
          toggle-color="primary"
          spread
          :options="[
            { label: 'Auto', value: 'auto' },
            { label: 'Vertex', value: 'vertex' },
            { label: 'Gemini API', value: 'gemini-api' },
          ]"
        />

        <q-input
          v-model="apiKeyDraft"
          dark
          filled
          dense
          type="password"
          label="Gemini API key"
          hint="Leave blank to keep existing. Clear with the button."
          autocomplete="off"
        >
          <template #append>
            <q-btn
              flat
              dense
              size="sm"
              label="Clear"
              :disable="!publicSettings?.hasApiKey && !apiKeyDraft"
              @click="clearApiKey"
            />
          </template>
        </q-input>
        <div v-if="publicSettings?.hasApiKey" class="text-caption text-grey-5">
          Saved key: {{ publicSettings.apiKeyMasked }}
        </div>

        <q-input
          v-model="form.vertexProject"
          dark
          filled
          dense
          label="Vertex project"
          hint="Overrides GOOGLE_CLOUD_PROJECT when set"
        />
        <q-input
          v-model="form.vertexLocation"
          dark
          filled
          dense
          label="Vertex location"
          hint="Lyria Interactions need global"
        />
        <q-input
          v-model="form.credentialsPath"
          dark
          filled
          dense
          label="Service account JSON path (optional)"
        />
        <q-input
          v-model="form.flashModel"
          dark
          filled
          dense
          label="Flash model"
          hint="Used for assistant, lyrics, and prompt refine"
        />

        <div class="mt-label q-mt-md">Default pattern (Reset)</div>
        <div class="row q-col-gutter-sm">
          <div class="col-6">
            <q-input v-model="form.patternDefaults.genre" dark filled dense label="Genre" />
          </div>
          <div class="col-6">
            <q-input v-model="form.patternDefaults.mood" dark filled dense label="Mood" />
          </div>
          <div class="col-6">
            <q-input
              v-model.number="form.patternDefaults.bpm"
              dark
              filled
              dense
              type="number"
              label="BPM"
            />
          </div>
          <div class="col-6">
            <q-select
              v-model="form.patternDefaults.timeSignature"
              dark
              filled
              dense
              clearable
              :options="TIME_SIGNATURES"
              label="Time signature"
            />
          </div>
          <div class="col-6">
            <q-select
              v-model="form.patternDefaults.key"
              dark
              filled
              dense
              clearable
              :options="MUSIC_KEYS"
              label="Key"
            />
          </div>
          <div class="col-6">
            <q-input
              v-model.number="form.patternDefaults.energy"
              dark
              filled
              dense
              type="number"
              label="Energy"
            />
          </div>
          <div class="col-6">
            <q-input v-model="form.patternDefaults.language" dark filled dense label="Language" />
          </div>
          <div class="col-12">
            <q-btn-toggle
              v-model="form.patternDefaults.lyriaMode"
              toggle-color="primary"
              dense
              :options="[
                { label: 'Clip default', value: 'clip' },
                { label: 'Full default', value: 'full' },
              ]"
            />
          </div>
        </div>

        <div class="text-caption text-grey-5">
          Budget limits stay in the header meter (gear next to spend). Env
          <code>.env.local</code> remains a fallback when fields here are empty.
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" v-close-popup />
        <q-btn color="primary" text-color="dark" unelevated label="Save" :loading="saving" @click="onSave" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { MUSIC_KEYS, TIME_SIGNATURES } from '@/models/pattern';
import type { AppSettingsPublic, BackendPreference, PatternDefaults } from '@/models/settings';
import { DEFAULT_FLASH_MODEL } from '@/models/settings';
import { useBudgetStore } from '@/stores/budget';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

const $q = useQuasar();
const budgetStore = useBudgetStore();

const publicSettings = ref<AppSettingsPublic | null>(null);
const saving = ref(false);
const apiKeyDraft = ref('');
const clearKey = ref(false);

const form = reactive<{
  backendPreference: BackendPreference;
  vertexProject: string;
  vertexLocation: string;
  credentialsPath: string;
  flashModel: string;
  patternDefaults: {
    genre: string;
    mood: string;
    bpm: number | undefined;
    timeSignature: string | undefined;
    key: string | undefined;
    energy: number | undefined;
    language: string;
    lyriaMode: PatternDefaults['lyriaMode'];
  };
}>({
  backendPreference: 'auto',
  vertexProject: '',
  vertexLocation: 'global',
  credentialsPath: '',
  flashModel: DEFAULT_FLASH_MODEL,
  patternDefaults: {
    genre: '',
    mood: '',
    bpm: undefined,
    timeSignature: undefined,
    key: undefined,
    energy: undefined,
    language: '',
    lyriaMode: 'clip',
  },
});

async function load(): Promise<void> {
  if (!window.mytunes) return;
  const settings = await window.mytunes.getSettings();
  publicSettings.value = settings;
  form.backendPreference = settings.backendPreference;
  form.vertexProject = settings.vertexProject ?? '';
  form.vertexLocation = settings.vertexLocation || 'global';
  form.credentialsPath = settings.credentialsPath ?? '';
  form.flashModel = settings.flashModel || DEFAULT_FLASH_MODEL;
  form.patternDefaults = {
    genre: settings.patternDefaults.genre ?? '',
    mood: settings.patternDefaults.mood ?? '',
    bpm: settings.patternDefaults.bpm,
    timeSignature: settings.patternDefaults.timeSignature,
    key: settings.patternDefaults.key,
    energy: settings.patternDefaults.energy,
    language: settings.patternDefaults.language ?? '',
    lyriaMode: settings.patternDefaults.lyriaMode ?? 'clip',
  };
  apiKeyDraft.value = '';
  clearKey.value = false;
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void load();
  },
);

function clearApiKey(): void {
  apiKeyDraft.value = '';
  clearKey.value = true;
}

async function onSave(): Promise<void> {
  if (!window.mytunes) {
    $q.notify({ type: 'warning', message: 'Settings require Electron.' });
    return;
  }
  saving.value = true;
  try {
    const patternDefaults: PatternDefaults = {};
    if (form.patternDefaults.genre?.trim()) patternDefaults.genre = form.patternDefaults.genre.trim();
    if (form.patternDefaults.mood?.trim()) patternDefaults.mood = form.patternDefaults.mood.trim();
    if (form.patternDefaults.bpm != null && !Number.isNaN(form.patternDefaults.bpm)) {
      patternDefaults.bpm = Number(form.patternDefaults.bpm);
    }
    if (form.patternDefaults.timeSignature) {
      patternDefaults.timeSignature = form.patternDefaults.timeSignature;
    }
    if (form.patternDefaults.key) patternDefaults.key = form.patternDefaults.key;
    if (form.patternDefaults.energy != null && !Number.isNaN(form.patternDefaults.energy)) {
      patternDefaults.energy = Number(form.patternDefaults.energy);
    }
    if (form.patternDefaults.language?.trim()) {
      patternDefaults.language = form.patternDefaults.language.trim();
    }
    if (form.patternDefaults.lyriaMode) patternDefaults.lyriaMode = form.patternDefaults.lyriaMode;

    const update: Parameters<NonNullable<typeof window.mytunes>['setSettings']>[0] = {
      backendPreference: form.backendPreference,
      vertexProject: form.vertexProject.trim() || null,
      vertexLocation: form.vertexLocation.trim() || 'global',
      credentialsPath: form.credentialsPath.trim() || null,
      flashModel: form.flashModel.trim() || DEFAULT_FLASH_MODEL,
      patternDefaults,
    };

    if (clearKey.value && !apiKeyDraft.value.trim()) {
      update.apiKey = null;
    } else if (apiKeyDraft.value.trim()) {
      update.apiKey = apiKeyDraft.value.trim();
    }

    publicSettings.value = await window.mytunes.setSettings(update);
    await budgetStore.refresh();
    $q.notify({ type: 'positive', message: 'Settings saved' });
    emit('update:modelValue', false);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.settings-card {
  background: var(--mt-bg-elevated);
  color: var(--mt-text);
}
</style>
