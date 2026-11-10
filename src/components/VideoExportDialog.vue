<template>
  <q-dialog
    :model-value="modelValue"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="video-export-card mt-panel" style="min-width: 560px; max-width: 640px">
      <q-card-section class="row items-center">
        <div>
          <div class="text-h6">Export video</div>
          <div v-if="generationLabel" class="text-caption text-grey-5">{{ generationLabel }}</div>
        </div>
        <q-space />
        <q-btn flat dense round icon="close" :disable="exporting" v-close-popup />
      </q-card-section>

      <q-separator dark />

      <q-card-section class="video-export-body q-gutter-md">
        <div>
          <div class="mt-label q-mb-xs">Preset</div>
          <div class="row q-gutter-sm">
            <q-btn
              v-for="p in VIDEO_EXPORT_PRESETS"
              :key="p.id"
              dense
              unelevated
              :outline="presetId !== p.id"
              :color="presetId === p.id ? 'primary' : 'grey-7'"
              :text-color="presetId === p.id ? 'dark' : undefined"
              :label="p.label"
              :disable="exporting"
              @click="applyPreset(p.id)"
            >
              <q-tooltip>{{ p.caption }}</q-tooltip>
            </q-btn>
            <q-btn
              dense
              unelevated
              :outline="presetId !== 'custom'"
              :color="presetId === 'custom' ? 'primary' : 'grey-7'"
              :text-color="presetId === 'custom' ? 'dark' : undefined"
              label="Custom"
              :disable="exporting"
              @click="presetId = 'custom'"
            />
          </div>
        </div>

        <div class="row q-col-gutter-sm">
          <div class="col-4">
            <q-input
              v-model.number="form.width"
              dark
              filled
              dense
              type="number"
              label="Width"
              :disable="exporting || presetId !== 'custom'"
              @update:model-value="onCustomSize"
            />
          </div>
          <div class="col-4">
            <q-input
              v-model.number="form.height"
              dark
              filled
              dense
              type="number"
              label="Height"
              :disable="exporting || presetId !== 'custom'"
              @update:model-value="onCustomSize"
            />
          </div>
          <div class="col-4">
            <q-input
              v-model.number="form.fps"
              dark
              filled
              dense
              type="number"
              label="FPS"
              :disable="exporting || presetId !== 'custom'"
              @update:model-value="onCustomSize"
            />
          </div>
        </div>

        <div>
          <div class="mt-label q-mb-xs">Background</div>
          <q-btn-toggle
            v-model="form.background"
            dense
            spread
            toggle-color="primary"
            text-color="grey-5"
            :options="[
              { label: 'Solid', value: 'solid' },
              { label: 'Image', value: 'image' },
            ]"
            :disable="exporting"
          />
          <div v-if="form.background === 'solid'" class="row items-center q-gutter-sm q-mt-sm">
            <q-input
              :model-value="`#${form.backgroundColor}`"
              dark
              filled
              dense
              label="Color"
              class="col"
              :disable="exporting"
              @update:model-value="onBgColor"
            >
              <template #append>
                <q-icon name="colorize" class="cursor-pointer">
                  <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                    <q-color
                      :model-value="`#${form.backgroundColor}`"
                      format-model="hex"
                      @update:model-value="onBgColor"
                    />
                  </q-popup-proxy>
                </q-icon>
              </template>
            </q-input>
          </div>
          <div v-else class="q-mt-sm q-gutter-sm">
            <div class="row items-center q-gutter-sm">
              <q-btn
                outline
                dense
                color="primary"
                icon="image"
                label="Choose image…"
                :disable="exporting"
                @click="onPickImage"
              />
              <span class="text-caption text-grey-5 ellipsis" style="max-width: 280px">
                {{ imageName || 'No image selected' }}
              </span>
              <q-btn
                v-if="form.imagePath"
                flat
                dense
                round
                size="sm"
                icon="close"
                :disable="exporting"
                @click="clearImage"
              />
            </div>
            <q-btn-toggle
              v-model="form.imageFit"
              dense
              spread
              toggle-color="primary"
              text-color="grey-5"
              :options="[
                { label: 'Cover', value: 'cover' },
                { label: 'Contain', value: 'contain' },
                { label: 'Stretch', value: 'stretch' },
              ]"
              :disable="exporting || !form.imagePath"
            />
            <template v-if="form.imageFit !== 'stretch'">
              <q-slider
                v-model="form.imageZoom"
                :min="100"
                :max="200"
                :step="1"
                label
                :label-value="`Zoom ${form.imageZoom}%`"
                color="primary"
                :disable="exporting || !form.imagePath"
              />
              <div class="row q-col-gutter-sm">
                <div class="col-6">
                  <div class="text-caption text-grey-5">Pan X {{ form.imagePanX }}</div>
                  <q-slider
                    v-model="form.imagePanX"
                    :min="-50"
                    :max="50"
                    :step="1"
                    color="primary"
                    :disable="exporting || !form.imagePath"
                  />
                </div>
                <div class="col-6">
                  <div class="text-caption text-grey-5">Pan Y {{ form.imagePanY }}</div>
                  <q-slider
                    v-model="form.imagePanY"
                    :min="-50"
                    :max="50"
                    :step="1"
                    color="primary"
                    :disable="exporting || !form.imagePath"
                  />
                </div>
              </div>
            </template>
          </div>
        </div>

        <div class="video-export-preview" :style="previewFrameStyle">
          <div class="video-export-preview__inner" :style="previewInnerStyle">
            <div
              v-if="form.background === 'image' && imageDataUrl"
              class="video-export-preview__img"
              :style="previewImageStyle"
            />
            <div
              v-if="form.showWaveform"
              class="video-export-preview__wave"
              :style="previewWaveStyle"
            />
          </div>
          <div class="video-export-preview__label text-caption">
            {{ form.width }}×{{ form.height }}
          </div>
        </div>

        <div>
          <div class="row items-center q-mb-xs">
            <div class="mt-label">Waveform</div>
            <q-space />
            <q-toggle
              v-model="form.showWaveform"
              dense
              color="primary"
              label="Show"
              :disable="exporting"
            />
          </div>
          <q-btn-toggle
            v-model="form.waveformMode"
            dense
            spread
            toggle-color="primary"
            text-color="grey-5"
            :options="[
              { label: 'Centered', value: 'cline' },
              { label: 'Line', value: 'line' },
              { label: 'Bars', value: 'p2p' },
            ]"
            :disable="exporting || !form.showWaveform"
          />
          <div class="q-mt-sm">
            <div class="text-caption text-grey-5">
              Height {{ Math.round(form.waveformHeight * 100) }}%
            </div>
            <q-slider
              v-model="form.waveformHeight"
              :min="0.1"
              :max="1"
              :step="0.05"
              color="primary"
              :disable="exporting || !form.showWaveform"
            />
          </div>
          <div>
            <div class="text-caption text-grey-5">
              Opacity {{ Math.round(form.waveformOpacity * 100) }}%
            </div>
            <q-slider
              v-model="form.waveformOpacity"
              :min="0.1"
              :max="1"
              :step="0.05"
              color="primary"
              :disable="exporting || !form.showWaveform"
            />
          </div>
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input
                :model-value="`#${form.waveformColorLeft}`"
                dark
                filled
                dense
                label="Left channel"
                :disable="exporting || !form.showWaveform"
                @update:model-value="(v) => onWaveColor('left', v)"
              >
                <template #append>
                  <q-icon name="colorize" class="cursor-pointer">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-color
                        :model-value="`#${form.waveformColorLeft}`"
                        format-model="hex"
                        @update:model-value="(v) => onWaveColor('left', v)"
                      />
                    </q-popup-proxy>
                  </q-icon>
                </template>
              </q-input>
            </div>
            <div class="col-6">
              <q-input
                :model-value="`#${form.waveformColorRight}`"
                dark
                filled
                dense
                label="Right channel"
                :disable="exporting || !form.showWaveform"
                @update:model-value="(v) => onWaveColor('right', v)"
              >
                <template #append>
                  <q-icon name="colorize" class="cursor-pointer">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-color
                        :model-value="`#${form.waveformColorRight}`"
                        format-model="hex"
                        @update:model-value="(v) => onWaveColor('right', v)"
                      />
                    </q-popup-proxy>
                  </q-icon>
                </template>
              </q-input>
            </div>
          </div>
        </div>

        <q-checkbox
          v-model="form.writeSrt"
          dark
          dense
          label="Write SRT captions sidecar"
          :disable="exporting"
        />
      </q-card-section>

      <q-separator dark />

      <q-card-actions align="right">
        <q-btn flat label="Cancel" :disable="exporting" v-close-popup />
        <q-btn
          color="primary"
          text-color="dark"
          unelevated
          label="Export"
          icon="movie"
          :loading="exporting"
          :disable="form.background === 'image' && !form.imagePath"
          @click="onExport"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  DEFAULT_VIDEO_EXPORT_OPTIONS,
  VIDEO_EXPORT_PRESETS,
  matchPresetId,
  optionsFromPreset,
  type VideoExportOptions,
  type VideoExportPresetId,
} from '@/models/videoExport';

const props = defineProps<{
  modelValue: boolean;
  generationId: string | null;
  generationLabel?: string;
  exporting?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  export: [options: VideoExportOptions];
}>();

const $q = useQuasar();
const presetId = ref<VideoExportPresetId>('youtube');
const imageDataUrl = ref<string | null>(null);
const form = reactive<VideoExportOptions>({ ...DEFAULT_VIDEO_EXPORT_OPTIONS });

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    Object.assign(form, { ...DEFAULT_VIDEO_EXPORT_OPTIONS });
    presetId.value = 'youtube';
    imageDataUrl.value = null;
  },
);

const imageName = computed(() => {
  if (!form.imagePath) return '';
  const parts = form.imagePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || form.imagePath;
});

const previewFrameStyle = computed(() => {
  const maxW = 520;
  const maxH = 220;
  const aspect = form.width / Math.max(1, form.height);
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return {
    width: `${Math.round(w)}px`,
    height: `${Math.round(h)}px`,
    backgroundColor: `#${form.backgroundColor}`,
  };
});

const previewInnerStyle = computed(() => ({
  position: 'absolute' as const,
  inset: '0',
  overflow: 'hidden',
}));

const previewImageStyle = computed(() => {
  if (!imageDataUrl.value) return {};
  const zoom = form.imageZoom / 100;
  const panX = form.imagePanX;
  const panY = form.imagePanY;
  const base: Record<string, string> = {
    position: 'absolute',
    inset: '0',
    backgroundImage: `url(${imageDataUrl.value})`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
  };
  if (form.imageFit === 'stretch') {
    return { ...base, backgroundSize: '100% 100%' };
  }
  if (form.imageFit === 'contain') {
    return {
      ...base,
      backgroundSize: `${zoom * 100}%`,
      backgroundPosition: `calc(50% + ${panX}%) calc(50% + ${panY}%)`,
    };
  }
  // cover
  return {
    ...base,
    backgroundSize: `cover`,
    transform: `scale(${zoom}) translate(${panX * 0.35}%, ${panY * 0.35}%)`,
    transformOrigin: 'center center',
  };
});

const previewWaveStyle = computed(() => {
  const h = Math.round(form.waveformHeight * 100);
  return {
    position: 'absolute' as const,
    left: '0',
    right: '0',
    top: `${(100 - h) / 2}%`,
    height: `${h}%`,
    opacity: String(form.waveformOpacity * 0.85),
    background: `linear-gradient(90deg, #${form.waveformColorLeft}55, #${form.waveformColorRight}99, #${form.waveformColorLeft}55)`,
    clipPath:
      form.waveformMode === 'p2p'
        ? 'polygon(0% 50%, 4% 20%, 8% 70%, 12% 30%, 16% 80%, 20% 25%, 24% 65%, 28% 35%, 32% 75%, 36% 40%, 40% 60%, 44% 30%, 48% 70%, 52% 25%, 56% 80%, 60% 35%, 64% 65%, 68% 40%, 72% 70%, 76% 30%, 80% 75%, 84% 45%, 88% 60%, 92% 35%, 96% 55%, 100% 50%, 100% 50%, 0% 50%)'
        : 'polygon(0% 50%, 5% 42%, 10% 58%, 15% 35%, 20% 62%, 25% 40%, 30% 68%, 35% 38%, 40% 55%, 45% 45%, 50% 60%, 55% 35%, 60% 65%, 65% 42%, 70% 58%, 75% 40%, 80% 62%, 85% 48%, 90% 55%, 95% 45%, 100% 50%, 100% 52%, 95% 47%, 90% 57%, 85% 50%, 80% 64%, 75% 42%, 70% 60%, 65% 44%, 60% 67%, 55% 37%, 50% 62%, 45% 47%, 40% 57%, 35% 40%, 30% 70%, 25% 42%, 20% 64%, 15% 37%, 10% 60%, 5% 44%, 0% 52%)',
  };
});

function applyPreset(id: Exclude<VideoExportPresetId, 'custom'>): void {
  presetId.value = id;
  Object.assign(form, optionsFromPreset(id));
}

function onCustomSize(): void {
  presetId.value = matchPresetId(form.width, form.height, form.fps);
}

function stripHex(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value)
    .trim()
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '')
    .slice(0, 6);
}

function onBgColor(value: unknown): void {
  const hex = stripHex(value);
  if (hex.length === 6 || hex.length === 3) {
    form.backgroundColor = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  }
}

function onWaveColor(side: 'left' | 'right', value: unknown): void {
  const hex = stripHex(value);
  if (hex.length !== 6 && hex.length !== 3) return;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (side === 'left') form.waveformColorLeft = full;
  else form.waveformColorRight = full;
}

async function onPickImage(): Promise<void> {
  if (!window.mytunes) return;
  try {
    const result = await window.mytunes.pickImageFile();
    if (result.canceled) return;
    form.imagePath = result.path;
    form.background = 'image';
    imageDataUrl.value = result.dataUrl;
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

function clearImage(): void {
  form.imagePath = null;
  imageDataUrl.value = null;
  form.background = 'solid';
}

function onExport(): void {
  if (form.background === 'image' && !form.imagePath) {
    $q.notify({ type: 'warning', message: 'Choose a background image first' });
    return;
  }
  const payload: VideoExportOptions = {
    ...form,
    imagePath: form.background === 'image' ? (form.imagePath ?? null) : null,
  };
  emit('export', payload);
}
</script>

<style scoped>
.video-export-body {
  max-height: min(70vh, 640px);
  overflow: auto;
}

.video-export-preview {
  position: relative;
  margin: 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.video-export-preview__label {
  position: absolute;
  right: 6px;
  bottom: 4px;
  color: rgba(255, 255, 255, 0.55);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

.video-export-preview__wave {
  pointer-events: none;
}
</style>
