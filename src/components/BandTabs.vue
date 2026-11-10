<template>
  <div class="band-tabs">
    <q-tabs
      v-model="tab"
      dense
      class="text-grey-5 band-tabs__tabs"
      active-color="primary"
      indicator-color="primary"
      align="left"
      narrow-indicator
      outside-arrows
      mobile-arrows
    >
      <q-tab name="song" label="Song" />
      <q-tab name="rights" label="Rights" />
      <q-tab name="lyrics" label="Lyrics" />
      <q-tab name="coherence" label="Coherence" />
      <q-tab
        v-if="compositionMode === 'timeline'"
        name="timeline"
        label="Timeline"
      />
      <q-tab v-for="id in BAND_SLOT_IDS" :key="id" :name="id" :label="labelFor(id)" />
      <q-tab name="prompt" label="Prompt" />
    </q-tabs>

    <q-separator dark />

    <q-tab-panels v-model="tab" animated class="bg-transparent q-pt-md">
      <q-tab-panel name="song" class="q-pa-none">
        <div class="mt-knob-row">
          <PresetBar kind="song" label="Song preset" />
          <q-input v-model="pattern.name" filled dark dense label="Pattern name" />
          <q-btn-toggle
            v-model="compositionMode"
            spread
            no-caps
            dense
            toggle-color="primary"
            color="grey-9"
            text-color="grey-4"
            :options="compositionOptions"
            class="composition-toggle"
          />
          <q-input v-model="pattern.song.genre" filled dark dense label="Genre" />
          <q-input v-model="pattern.song.mood" filled dark dense label="Mood" />
          <div class="band-meter-row">
            <div>
              <div class="mt-label">BPM {{ pattern.song.bpm }}</div>
              <q-slider v-model="pattern.song.bpm" :min="60" :max="180" color="primary" label />
            </div>
            <div>
              <div class="mt-label">Energy {{ pattern.song.energy }}</div>
              <q-slider v-model="pattern.song.energy" :min="0" :max="100" color="primary" label />
            </div>
          </div>
          <div class="band-meter-row">
            <q-select
              v-model="pattern.song.timeSignature"
              :options="TIME_SIGNATURES"
              filled
              dark
              dense
              label="Time signature"
              hint="Lyric meter + feel"
            />
            <q-select
              v-model="pattern.song.key"
              :options="MUSIC_KEYS"
              filled
              dark
              dense
              label="Key"
            />
          </div>
          <q-select
            v-model="pattern.song.language"
            :options="languages"
            filled
            dark
            dense
            label="Language"
          />
          <q-input
            v-model="pattern.song.soundscape"
            filled
            dark
            dense
            label="Soundscape (optional)"
            hint="e.g. rain falling, spacious reverb, city nightlife"
          />
          <q-input
            v-model="pattern.song.productionQuality"
            filled
            dark
            dense
            label="Production quality (optional)"
            hint="e.g. clean mix, vintage recording, raw demo feel"
          />
          <div class="band-auto-field">
            <q-input
              v-model="structureText"
              class="col-grow"
              filled
              dark
              dense
              label="Structure ( -> separated)"
              :hint="
                pattern.song.auto?.structure
                  ? 'Lyria decides structure'
                  : compositionMode === 'timeline'
                    ? 'Lyric section tags (timeline labels can sync)'
                    : 'e.g. [Intro] -> [Verse 1] -> [Chorus]'
              "
              :disable="!!pattern.song.auto?.structure"
              :readonly="compositionMode === 'timeline'"
            />
            <q-toggle
              :model-value="!!pattern.song.auto?.structure"
              color="primary"
              dense
              label="Auto"
              :disable="compositionMode === 'timeline'"
              @update:model-value="setAuto('structure', $event)"
            />
          </div>
          <div class="band-auto-field">
            <q-input
              v-model="pattern.song.durationHint"
              class="col-grow"
              filled
              dark
              dense
              label="Duration hint (full mode)"
              :hint="
                pattern.song.auto?.durationHint
                  ? 'Lyria decides length'
                  : pattern.lyriaMode !== 'full'
                    ? 'Available in full mode'
                    : undefined
              "
              :disable="pattern.lyriaMode !== 'full' || !!pattern.song.auto?.durationHint"
            />
            <q-toggle
              :model-value="!!pattern.song.auto?.durationHint"
              color="primary"
              dense
              label="Auto"
              :disable="pattern.lyriaMode !== 'full'"
              @update:model-value="setAuto('durationHint', $event)"
            />
          </div>
          <q-toggle v-model="pattern.song.instrumental" color="primary" label="Instrumental only" />
        </div>
      </q-tab-panel>

      <q-tab-panel name="rights" class="q-pa-none">
        <div class="mt-knob-row">
          <q-input
            v-model="rights.composers"
            filled
            dark
            dense
            label="Composer(s)"
            hint="e.g. A. Name; B. Name"
          />
          <q-input
            v-model="rights.lyricists"
            filled
            dark
            dense
            label="Lyricist(s)"
            hint="Leave blank if same as composer"
          />
          <div class="band-meter-row">
            <q-input
              v-model="rights.copyrightHolder"
              filled
              dark
              dense
              label="Copyright holder"
            />
            <q-input
              v-model="rights.copyrightYear"
              filled
              dark
              dense
              label="Copyright year"
              mask="####"
            />
          </div>
          <q-select
            v-model="primaryLicenseSelect"
            :options="licenseSelectOptions"
            filled
            dark
            dense
            label="Primary license"
            hint="Default CC BY-SA 4.0 — applies to this creative work"
          />
          <q-input
            v-if="primaryIsCustom"
            v-model="rights.licensePrimary"
            filled
            dark
            dense
            label="Custom primary SPDX / license id"
          />
          <q-toggle v-model="dualLicense" color="primary" label="Dual license" />
          <div class="mt-label text-grey-5">{{ dualLicenseHint }}</div>
          <q-select
            v-if="dualLicense"
            v-model="secondaryLicenseSelect"
            :options="licenseSelectOptions"
            filled
            dark
            dense
            label="Secondary license"
            hint="Downstream may comply with either primary or secondary"
          />
          <q-input
            v-if="dualLicense && secondaryIsCustom"
            v-model="rights.licenseSecondary"
            filled
            dark
            dense
            label="Custom secondary SPDX / license id"
          />
          <q-btn-toggle
            v-model="rights.madeBy"
            spread
            no-caps
            dense
            toggle-color="primary"
            color="grey-9"
            text-color="grey-4"
            :options="madeByOptions"
            class="composition-toggle"
          />
          <q-input
            v-model="rights.notice"
            filled
            dark
            dense
            type="textarea"
            autogrow
            label="Notice / credit (optional)"
            hint="Extra attribution, URL, or rights notes"
          />
        </div>
      </q-tab-panel>

      <q-tab-panel name="lyrics" class="q-pa-none">
        <LyricsEditor />
      </q-tab-panel>

      <q-tab-panel name="coherence" class="q-pa-none">
        <CoherencePanel />
      </q-tab-panel>

      <q-tab-panel v-if="compositionMode === 'timeline'" name="timeline" class="q-pa-none">
        <TimelinePanel />
      </q-tab-panel>

      <q-tab-panel v-for="id in BAND_SLOT_IDS" :key="id" :name="id" class="q-pa-none">
        <SlotPanel :slot-id="id" />
      </q-tab-panel>

      <q-tab-panel name="prompt" class="q-pa-none">
        <PromptPreview />
      </q-tab-panel>
    </q-tab-panels>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import {
  CUSTOM_LICENSE_OPTION,
  isKnownSpdxLicense,
  LICENSE_SELECT_OPTIONS,
} from '@/models/licenses';
import {
  BAND_SLOT_IDS,
  deriveTimelineFromStructure,
  getCompositionMode,
  LYRIA_LANGUAGES,
  MUSIC_KEYS,
  TIME_SIGNATURES,
  type CompositionMode,
  type SongMadeBy,
} from '@/models/pattern';
import { defaultTimelineDuration, structureFromTimeline } from '@/models/timeline';
import { usePatternStore } from '@/stores/pattern';
import CoherencePanel from '@/components/CoherencePanel.vue';
import LyricsEditor from '@/components/LyricsEditor.vue';
import PresetBar from '@/components/PresetBar.vue';
import PromptPreview from '@/components/PromptPreview.vue';
import SlotPanel from '@/components/SlotPanel.vue';
import TimelinePanel from '@/components/TimelinePanel.vue';

const tab = ref('song');
const patternStore = usePatternStore();
const { pattern } = storeToRefs(patternStore);

const languages = [...LYRIA_LANGUAGES];
const licenseSelectOptions = [...LICENSE_SELECT_OPTIONS];
const dualLicenseHint =
  'When on, the work is dual-licensed — downstream may use either license.';
const madeByOptions: { label: string; value: SongMadeBy }[] = [
  { label: 'Human', value: 'human' },
  { label: 'AI', value: 'ai' },
  { label: 'Both', value: 'both' },
];

// Ensured by createDefaultPattern / normalizePatternSong (stable object ref).
const rights = computed(() => pattern.value.song.rights!);

const dualLicense = computed({
  get: () => !!rights.value.licenseSecondary.trim(),
  set: (on: boolean) => {
    if (on) {
      if (!rights.value.licenseSecondary.trim()) {
        rights.value.licenseSecondary = 'MIT';
      }
    } else {
      rights.value.licenseSecondary = '';
    }
  },
});

function licenseSelectValue(current: string): string {
  const trimmed = current.trim();
  if (!trimmed) return LICENSE_SELECT_OPTIONS[0]!;
  if (isKnownSpdxLicense(trimmed)) return trimmed;
  return CUSTOM_LICENSE_OPTION;
}

const primaryLicenseSelect = computed({
  get: () => licenseSelectValue(rights.value.licensePrimary),
  set: (v: string) => {
    if (v === CUSTOM_LICENSE_OPTION) {
      if (isKnownSpdxLicense(rights.value.licensePrimary)) {
        rights.value.licensePrimary = '';
      }
      return;
    }
    rights.value.licensePrimary = v;
  },
});

const secondaryLicenseSelect = computed({
  get: () => licenseSelectValue(rights.value.licenseSecondary || 'MIT'),
  set: (v: string) => {
    if (v === CUSTOM_LICENSE_OPTION) {
      if (isKnownSpdxLicense(rights.value.licenseSecondary)) {
        rights.value.licenseSecondary = '';
      }
      return;
    }
    rights.value.licenseSecondary = v;
  },
});

const primaryIsCustom = computed(
  () => primaryLicenseSelect.value === CUSTOM_LICENSE_OPTION,
);
const secondaryIsCustom = computed(
  () => secondaryLicenseSelect.value === CUSTOM_LICENSE_OPTION,
);

const compositionOptions = [
  { label: 'Sections', value: 'sections' },
  { label: 'Timeline', value: 'timeline' },
];

const compositionMode = computed({
  get: (): CompositionMode => getCompositionMode(pattern.value),
  set: (mode: CompositionMode) => {
    pattern.value.compositionMode = mode;
    if (mode === 'timeline') {
      const timeline = pattern.value.song.timeline ?? [];
      if (!timeline.length) {
        pattern.value.song.timeline = deriveTimelineFromStructure(
          pattern.value.song,
          defaultTimelineDuration(pattern.value),
        );
      }
      tab.value = 'timeline';
    } else if (tab.value === 'timeline') {
      tab.value = 'song';
    }
  },
});

watch(
  () => pattern.value.song.timeline,
  (timeline) => {
    if (getCompositionMode(pattern.value) !== 'timeline') return;
    if (!timeline?.length) return;
    const derived = structureFromTimeline(timeline);
    if (!derived.length) return;
    const prev = pattern.value.song.structure;
    if (
      prev.length === derived.length &&
      prev.every((tag, i) => tag === derived[i])
    ) {
      return;
    }
    pattern.value.song.structure = derived;
  },
  { deep: true },
);

watch(
  () => pattern.value.compositionMode,
  (mode) => {
    if (mode !== 'timeline' && tab.value === 'timeline') tab.value = 'song';
  },
);

const structureText = computed({
  get: () => pattern.value.song.structure.join(' -> '),
  set: (v: string) => {
    pattern.value.song.structure = v
      .split('->')
      .map((s) => s.trim())
      .filter(Boolean);
  },
});

function setAuto(key: 'structure' | 'durationHint', value: boolean) {
  if (!pattern.value.song.auto) pattern.value.song.auto = {};
  pattern.value.song.auto[key] = value;
}

function labelFor(id: string) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
</script>

<style scoped>
.band-tabs {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.band-tabs__tabs {
  max-width: 100%;
}

.band-tabs__tabs :deep(.q-tabs__content) {
  /* Arrows handle overflow; hide the native bar Quasar still mounts. */
  scrollbar-width: none;
}

.band-tabs__tabs :deep(.q-tabs__content)::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.band-tabs :deep(.q-tab-panels),
.band-tabs :deep(.q-panel) {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.band-meter-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  max-width: 100%;
  min-width: 0;
}

.band-auto-field {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  min-width: 0;
  max-width: 100%;
}

.band-auto-field .col-grow {
  flex: 1 1 auto;
  min-width: 0;
}

.band-auto-field .q-toggle {
  flex: 0 0 auto;
  margin-top: 0.35rem;
}

.mt-knob-row {
  min-width: 0;
  max-width: 100%;
}

.composition-toggle {
  width: 100%;
}
</style>
