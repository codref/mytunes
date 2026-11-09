<template>
  <div class="preset-bar row items-center q-gutter-sm q-mb-sm">
    <q-select
      v-model="selectedId"
      class="preset-bar__select col-grow"
      :options="options"
      emit-value
      map-options
      dense
      filled
      dark
      clearable
      :label="label"
      :disable="busy || !options.length"
      @update:model-value="onSelect"
    />
    <q-btn
      outline
      dense
      color="primary"
      label="Save"
      :loading="busy"
      @click="onSave"
    />
    <q-btn
      flat
      dense
      color="negative"
      label="Delete"
      :disable="!selectedId || busy"
      @click="onDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { BandSlotId } from '@/models/pattern';
import type { SlotPreset, SongPreset } from '@/models/presets';
import { usePresetsStore } from '@/stores/presets';

const props = defineProps<{
  kind: 'song' | 'slot';
  slotId?: BandSlotId;
  label?: string;
}>();

const $q = useQuasar();
const presetsStore = usePresetsStore();
const selectedId = ref<string | null>(null);
const busy = computed(() => presetsStore.busy);

const label = computed(() => props.label ?? (props.kind === 'song' ? 'Song preset' : 'Slot preset'));

const list = computed(() => {
  if (props.kind === 'song') return presetsStore.songPresets;
  if (!props.slotId) return [] as SlotPreset[];
  return presetsStore.slotPresets(props.slotId);
});

const options = computed(() =>
  list.value.map((p) => ({
    label: p.name,
    value: p.id,
  })),
);

watch(
  () => [props.kind, props.slotId] as const,
  () => {
    selectedId.value = null;
  },
);

onMounted(() => {
  void presetsStore.refresh().catch(() => {
    /* bridge may be unavailable in browser */
  });
});

function onSelect(id: string | null) {
  if (!id) return;
  const preset = list.value.find((p) => p.id === id);
  if (!preset) return;
  if (props.kind === 'song') {
    presetsStore.applySongPreset(preset as SongPreset);
    $q.notify({ type: 'positive', message: `Applied song preset “${preset.name}”.` });
  } else {
    presetsStore.applySlotPreset(preset as SlotPreset);
    $q.notify({ type: 'positive', message: `Applied ${props.slotId} preset “${preset.name}”.` });
  }
}

function onSave() {
  $q.dialog({
    title: 'Save preset',
    message: 'Name this preset',
    prompt: {
      model: list.value.find((p) => p.id === selectedId.value)?.name ?? '',
      type: 'text',
    },
    cancel: true,
    persistent: true,
  }).onOk((name: string) => {
    void (async () => {
      const trimmed = String(name ?? '').trim();
      if (!trimmed) {
        $q.notify({ type: 'warning', message: 'Preset name required.' });
        return;
      }
      try {
        if (props.kind === 'song') {
          const saved = await presetsStore.saveSongPreset(trimmed);
          selectedId.value = saved.id;
        } else if (props.slotId) {
          const saved = await presetsStore.saveSlotPreset(props.slotId, trimmed);
          selectedId.value = saved.id;
        }
        $q.notify({ type: 'positive', message: `Saved preset “${trimmed}”.` });
      } catch (e) {
        $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
      }
    })();
  });
}

function onDelete() {
  const id = selectedId.value;
  if (!id) return;
  const preset = list.value.find((p) => p.id === id);
  $q.dialog({
    title: 'Delete preset',
    message: `Delete “${preset?.name ?? id}”?`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void (async () => {
      try {
        await presetsStore.removePreset(id);
        selectedId.value = null;
        $q.notify({ type: 'positive', message: 'Preset deleted.' });
      } catch (e) {
        $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
      }
    })();
  });
}
</script>

<style scoped>
.preset-bar {
  min-width: 0;
  max-width: 100%;
}

.preset-bar__select {
  min-width: 0;
}
</style>
