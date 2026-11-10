<template>
  <q-dialog
    :model-value="modelValue"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="cover-crop-card mt-panel" style="min-width: 420px; max-width: 480px">
      <q-card-section class="row items-center">
        <div class="text-h6">Song cover</div>
        <q-space />
        <q-btn flat dense round icon="close" :disable="saving" v-close-popup />
      </q-card-section>

      <q-separator dark />

      <q-card-section class="q-gutter-md">
        <div class="text-caption text-grey-5">
          Prefer a square image. Frame with zoom and pan — we’ll save a 1:1 JPEG (1024×1024).
        </div>

        <div class="row items-center q-gutter-sm">
          <q-btn
            outline
            dense
            color="primary"
            icon="image"
            label="Choose image…"
            :disable="saving"
            @click="onPick"
          />
          <span class="text-caption text-grey-5 ellipsis" style="max-width: 220px">
            {{ imageName || 'No image selected' }}
          </span>
        </div>

        <div class="cover-crop-frame">
          <div class="cover-crop-frame__inner" :style="previewStyle" />
        </div>

        <template v-if="imageDataUrl">
          <div>
            <div class="text-caption text-grey-5">Zoom {{ zoom }}%</div>
            <q-slider v-model="zoom" :min="100" :max="200" :step="1" color="primary" :disable="saving" />
          </div>
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <div class="text-caption text-grey-5">Pan X {{ panX }}</div>
              <q-slider v-model="panX" :min="-50" :max="50" :step="1" color="primary" :disable="saving" />
            </div>
            <div class="col-6">
              <div class="text-caption text-grey-5">Pan Y {{ panY }}</div>
              <q-slider v-model="panY" :min="-50" :max="50" :step="1" color="primary" :disable="saving" />
            </div>
          </div>
        </template>
      </q-card-section>

      <q-separator dark />

      <q-card-actions align="right">
        <q-btn flat label="Cancel" :disable="saving" v-close-popup />
        <q-btn
          color="primary"
          text-color="dark"
          unelevated
          label="Apply"
          icon="crop_square"
          :loading="saving"
          :disable="!imageDataUrl"
          @click="onApply"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';

const COVER_SIZE = 1024;

const props = defineProps<{
  modelValue: boolean;
  saving?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  apply: [jpegDataUrl: string];
}>();

const $q = useQuasar();
const imageDataUrl = ref<string | null>(null);
const imagePath = ref<string | null>(null);
const zoom = ref(100);
const panX = ref(0);
const panY = ref(0);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    imageDataUrl.value = null;
    imagePath.value = null;
    zoom.value = 100;
    panX.value = 0;
    panY.value = 0;
  },
);

const imageName = computed(() => {
  if (!imagePath.value) return '';
  const parts = imagePath.value.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || imagePath.value;
});

const previewStyle = computed(() => {
  if (!imageDataUrl.value) {
    return { backgroundColor: 'rgba(255,255,255,0.06)' };
  }
  const z = zoom.value / 100;
  return {
    backgroundImage: `url(${imageDataUrl.value})`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `calc(50% + ${panX.value}%) calc(50% + ${panY.value}%)`,
    backgroundSize: `cover`,
    transform: `scale(${z})`,
    transformOrigin: 'center center',
  };
});

async function onPick(): Promise<void> {
  if (!window.mytunes) return;
  try {
    const result = await window.mytunes.pickImageFile();
    if (result.canceled) return;
    imagePath.value = result.path;
    imageDataUrl.value = result.dataUrl;
    zoom.value = 100;
    panX.value = 0;
    panY.value = 0;
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

async function onApply(): Promise<void> {
  if (!imageDataUrl.value) return;
  try {
    const dataUrl = await renderSquareJpeg(imageDataUrl.value);
    emit('apply', dataUrl);
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Cover-fit into COVER_SIZE² with zoom + pan, matching the preview framing.
 */
function renderSquareJpeg(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = COVER_SIZE;
        canvas.height = COVER_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable'));
          return;
        }

        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const z = zoom.value / 100;
        // Cover scale to fill square, then zoom
        const base = Math.max(COVER_SIZE / iw, COVER_SIZE / ih);
        const scale = base * z;
        const dw = iw * scale;
        const dh = ih * scale;
        // Pan: ±50% shifts by half of the excess
        const excessX = dw - COVER_SIZE;
        const excessY = dh - COVER_SIZE;
        const dx = (COVER_SIZE - dw) / 2 - (panX.value / 100) * (excessX / 2);
        const dy = (COVER_SIZE - dh) / 2 - (panY.value / 100) * (excessY / 2);

        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, COVER_SIZE, COVER_SIZE);
        ctx.drawImage(img, dx, dy, dw, dh);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for crop'));
    img.src = dataUrl;
  });
}
</script>

<style scoped>
.cover-crop-frame {
  width: 280px;
  height: 280px;
  margin: 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 4px;
  overflow: hidden;
  background: #0a0a12;
}

.cover-crop-frame__inner {
  width: 100%;
  height: 100%;
}
</style>
