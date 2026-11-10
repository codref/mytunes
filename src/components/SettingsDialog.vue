<template>
  <q-dialog :model-value="modelValue" persistent @update:model-value="emit('update:modelValue', $event)">
    <q-card class="settings-card mt-panel" style="min-width: 440px; max-width: 580px">
      <q-card-section class="row items-center">
        <div class="text-h6">Settings</div>
        <q-space />
        <q-btn flat dense round icon="close" v-close-popup />
      </q-card-section>

      <q-tabs
        v-model="tab"
        dense
        class="text-grey-5"
        active-color="primary"
        indicator-color="primary"
        align="left"
      >
        <q-tab name="accounts" label="Accounts" />
        <q-tab name="assistant" label="Assistant" />
        <q-tab name="music" label="Music" />
        <q-tab name="defaults" label="Defaults" />
      </q-tabs>
      <q-separator dark />

      <q-tab-panels v-model="tab" animated class="bg-transparent">
        <q-tab-panel name="accounts" class="q-gutter-md">
          <div class="text-caption text-grey-5">
            Credentials are shared. Pick which wallet Assistant and Music use on the other tabs.
          </div>
          <q-input
            v-model="apiKeyDraft"
            dark
            filled
            dense
            type="password"
            label="Gemini API key (AI Studio)"
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
            hint="Lyria needs global"
          />
          <q-input
            v-model="form.credentialsPath"
            dark
            filled
            dense
            label="Service account JSON path (optional)"
          />
        </q-tab-panel>

        <q-tab-panel name="assistant" class="q-gutter-md">
          <div class="mt-label">Backend for assistant / Flash</div>
          <q-btn-toggle
            v-model="form.assistantBackend"
            toggle-color="primary"
            spread
            :options="backendOptions"
          />
          <div class="text-caption text-grey-5">
            Lyrics, refine, and chat spend against this wallet.
          </div>

          <div class="row items-center">
            <div class="mt-label">Flash model</div>
            <q-space />
            <q-btn
              flat
              dense
              size="sm"
              icon="refresh"
              :loading="chatLoading"
              @click="refreshChatModels(true)"
            />
          </div>
          <q-select
            v-model="form.flashModel"
            :options="flashOptions"
            dark
            filled
            dense
            emit-value
            map-options
            use-input
            fill-input
            hide-selected
            input-debounce="0"
            label="Flash / chat model"
            popup-content-class="bg-dark"
            :loading="chatLoading"
            @filter="filterFlash"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps" dense>
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                  <q-item-label v-if="scope.opt.caption" caption>{{ scope.opt.caption }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
        </q-tab-panel>

        <q-tab-panel name="music" class="q-gutter-md">
          <div class="mt-label">Backend for Lyria</div>
          <q-btn-toggle
            v-model="form.musicBackend"
            toggle-color="primary"
            spread
            :options="backendOptions"
          />
          <div class="text-caption text-grey-5">
            Clip / full generation spends against this wallet (~$0.04 / ~$0.08).
          </div>

          <div class="row items-center">
            <div class="mt-label">Lyria models</div>
            <q-space />
            <q-btn
              flat
              dense
              size="sm"
              icon="refresh"
              :loading="lyriaLoading"
              @click="refreshLyriaModels(true)"
            />
          </div>
          <q-select
            v-model="form.lyriaClipModel"
            :options="clipOptions"
            dark
            filled
            dense
            emit-value
            map-options
            label="Clip model"
            hint="~30s · ~$0.04"
            popup-content-class="bg-dark"
            :loading="lyriaLoading"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps" dense>
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                  <q-item-label caption>{{ scope.opt.caption }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          <q-select
            v-model="form.lyriaFullModel"
            :options="fullOptions"
            dark
            filled
            dense
            emit-value
            map-options
            label="Full model"
            hint="Full song · ~$0.08"
            popup-content-class="bg-dark"
            :loading="lyriaLoading"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps" dense>
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                  <q-item-label caption>{{ scope.opt.caption }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
        </q-tab-panel>

        <q-tab-panel name="defaults" class="q-gutter-md">
          <div class="mt-label">Default pattern (Reset)</div>
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
              <q-select
                v-model="form.patternDefaults.language"
                :options="lyriaLanguages"
                dark
                filled
                dense
                clearable
                label="Language"
              />
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
          <div class="mt-label q-mt-md">Budget limits</div>
          <div class="text-caption text-grey-5">
            Soft warning at 80%. Hard stop at 100%. Applies to combined session/day spend.
          </div>
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input
                v-model.number="sessionLimitUsd"
                dark
                filled
                dense
                type="number"
                min="0"
                step="0.5"
                label="Session limit (USD)"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model.number="dayLimitUsd"
                dark
                filled
                dense
                type="number"
                min="0"
                step="0.5"
                label="Daily limit (USD)"
              />
            </div>
          </div>
          <div class="text-caption text-grey-5">
            Env <code>.env.local</code> remains a fallback when account fields are empty.
          </div>
        </q-tab-panel>
      </q-tab-panels>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" v-close-popup />
        <q-btn color="primary" text-color="dark" unelevated label="Save" :loading="saving" @click="onSave" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { ChatModelInfo } from '@/models/chatModels';
import {
  DEFAULT_LYRIA_CLIP_MODEL,
  DEFAULT_LYRIA_FULL_MODEL_GEMINI_API,
  type LyriaModelInfo,
} from '@/models/lyriaModels';
import { LYRIA_LANGUAGES, MUSIC_KEYS, TIME_SIGNATURES } from '@/models/pattern';
import type { AiBackendId, AppSettingsPublic, PatternDefaults } from '@/models/settings';
import { DEFAULT_FLASH_MODEL } from '@/models/settings';
import { useBudgetStore } from '@/stores/budget';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

const $q = useQuasar();
const budgetStore = useBudgetStore();
const lyriaLanguages = [...LYRIA_LANGUAGES];
const backendOptions = [
  { label: 'Vertex', value: 'vertex' as const },
  { label: 'Gemini API', value: 'gemini-api' as const },
];

const tab = ref('accounts');
const publicSettings = ref<AppSettingsPublic | null>(null);
const saving = ref(false);
const chatLoading = ref(false);
const lyriaLoading = ref(false);
const apiKeyDraft = ref('');
const clearKey = ref(false);
const chatModels = ref<ChatModelInfo[]>([]);
const lyriaModels = ref<LyriaModelInfo[]>([]);
const flashFilter = ref('');
const sessionLimitUsd = ref(5);
const dayLimitUsd = ref(10);

const form = reactive<{
  assistantBackend: AiBackendId;
  musicBackend: AiBackendId;
  vertexProject: string;
  vertexLocation: string;
  credentialsPath: string;
  flashModel: string;
  lyriaClipModel: string;
  lyriaFullModel: string;
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
  assistantBackend: 'gemini-api',
  musicBackend: 'gemini-api',
  vertexProject: '',
  vertexLocation: 'global',
  credentialsPath: '',
  flashModel: DEFAULT_FLASH_MODEL,
  lyriaClipModel: DEFAULT_LYRIA_CLIP_MODEL,
  lyriaFullModel: DEFAULT_LYRIA_FULL_MODEL_GEMINI_API,
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

function toSelectOptions(
  models: { id: string; displayName: string; description?: string }[],
  selected: string,
) {
  const list = [...models];
  if (selected && !list.some((m) => m.id === selected)) {
    list.unshift({ id: selected, displayName: selected });
  }
  return list.map((m) => ({
    label: m.displayName || m.id,
    value: m.id,
    caption: m.description || (m.displayName !== m.id ? m.id : undefined),
  }));
}

const flashOptions = computed(() => {
  const q = flashFilter.value.trim().toLowerCase();
  const models = q
    ? chatModels.value.filter(
        (m) =>
          m.id.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q),
      )
    : chatModels.value;
  return toSelectOptions(models, form.flashModel);
});

const clipOptions = computed(() =>
  toSelectOptions(
    lyriaModels.value.filter((m) => m.kind === 'clip'),
    form.lyriaClipModel,
  ),
);

const fullOptions = computed(() =>
  toSelectOptions(
    lyriaModels.value.filter((m) => m.kind === 'full'),
    form.lyriaFullModel,
  ),
);

function filterFlash(val: string, update: (fn: () => void) => void) {
  update(() => {
    flashFilter.value = val;
  });
}

async function refreshChatModels(force = false): Promise<void> {
  if (!window.mytunes) return;
  chatLoading.value = true;
  try {
    const chat = await window.mytunes.listChatModels({ force });
    chatModels.value = chat.models;
  } catch (e) {
    $q.notify({ type: 'warning', message: e instanceof Error ? e.message : String(e) });
  } finally {
    chatLoading.value = false;
  }
}

async function refreshLyriaModels(force = false): Promise<void> {
  if (!window.mytunes) return;
  lyriaLoading.value = true;
  try {
    const lyria = await window.mytunes.listLyriaModels({ force });
    lyriaModels.value = lyria.models;
  } catch (e) {
    $q.notify({ type: 'warning', message: e instanceof Error ? e.message : String(e) });
  } finally {
    lyriaLoading.value = false;
  }
}

async function load(): Promise<void> {
  if (!window.mytunes) return;
  const settings = await window.mytunes.getSettings();
  publicSettings.value = settings;
  form.assistantBackend = settings.assistantBackend;
  form.musicBackend = settings.musicBackend;
  form.vertexProject = settings.vertexProject ?? '';
  form.vertexLocation = settings.vertexLocation || 'global';
  form.credentialsPath = settings.credentialsPath ?? '';
  form.flashModel = settings.flashModel || DEFAULT_FLASH_MODEL;
  form.lyriaClipModel = settings.lyriaClipModel || DEFAULT_LYRIA_CLIP_MODEL;
  form.lyriaFullModel = settings.lyriaFullModel || DEFAULT_LYRIA_FULL_MODEL_GEMINI_API;
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
  tab.value = 'accounts';
  await budgetStore.refresh();
  sessionLimitUsd.value = budgetStore.state.sessionLimitUsd;
  dayLimitUsd.value = budgetStore.state.dayLimitUsd;
  await Promise.all([refreshChatModels(false), refreshLyriaModels(false)]);
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
      assistantBackend: form.assistantBackend,
      musicBackend: form.musicBackend,
      vertexProject: form.vertexProject.trim() || null,
      vertexLocation: form.vertexLocation.trim() || 'global',
      credentialsPath: form.credentialsPath.trim() || null,
      flashModel: form.flashModel.trim() || DEFAULT_FLASH_MODEL,
      lyriaClipModel: form.lyriaClipModel.trim() || DEFAULT_LYRIA_CLIP_MODEL,
      lyriaFullModel: form.lyriaFullModel.trim() || DEFAULT_LYRIA_FULL_MODEL_GEMINI_API,
      patternDefaults,
    };

    if (clearKey.value && !apiKeyDraft.value.trim()) {
      update.apiKey = null;
    } else if (apiKeyDraft.value.trim()) {
      update.apiKey = apiKeyDraft.value.trim();
    }

    publicSettings.value = await window.mytunes.setSettings(update);
    const nextSession =
      sessionLimitUsd.value != null && !Number.isNaN(Number(sessionLimitUsd.value))
        ? Math.max(0, Number(sessionLimitUsd.value))
        : budgetStore.state.sessionLimitUsd;
    const nextDay =
      dayLimitUsd.value != null && !Number.isNaN(Number(dayLimitUsd.value))
        ? Math.max(0, Number(dayLimitUsd.value))
        : budgetStore.state.dayLimitUsd;
    await budgetStore.setLimits(nextSession, nextDay);
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
