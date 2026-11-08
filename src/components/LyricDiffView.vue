<template>
  <div class="lyric-diff">
    <div class="lyric-diff__meta row items-center q-gutter-sm q-mb-sm">
      <div class="mt-label">Compare with last take</div>
      <q-badge v-if="overlapLabel" :color="overlapColor" text-color="dark">
        {{ overlapLabel }}
      </q-badge>
      <q-space />
      <q-btn
        v-if="returnedClean"
        flat
        dense
        color="primary"
        label="Adopt returned"
        @click="emit('adopt', returnedClean)"
      />
    </div>

    <div v-if="!returnedClean" class="text-caption text-grey-5">
      Generate a take to see Lyria’s returned lyrics beside your sheet.
    </div>

    <div v-else class="lyric-diff__grid">
      <div class="lyric-diff__col">
        <div class="lyric-diff__head">Your sheet</div>
        <div class="lyric-diff__body" aria-label="Source lyrics diff">
          <div
            v-for="(row, idx) in rows"
            :key="`L-${idx}`"
            class="lyric-diff__line"
            :class="lineClass(row, 'left')"
          >
            <template v-if="row.kind === 'equal' || row.kind === 'change' || row.kind === 'remove'">
              <span
                v-for="(tok, tIdx) in tokensFor(row, 'left')"
                :key="tIdx"
                :class="{ 'mt-diff-common': tok.common }"
                >{{ tok.text }}</span
              >
            </template>
            <span v-else class="lyric-diff__empty">&nbsp;</span>
          </div>
        </div>
      </div>

      <div class="lyric-diff__col">
        <div class="lyric-diff__head">Lyria returned</div>
        <div class="lyric-diff__body" aria-label="Returned lyrics diff">
          <div
            v-for="(row, idx) in rows"
            :key="`R-${idx}`"
            class="lyric-diff__line"
            :class="lineClass(row, 'right')"
          >
            <template v-if="row.kind === 'equal' || row.kind === 'change' || row.kind === 'add'">
              <span
                v-for="(tok, tIdx) in tokensFor(row, 'right')"
                :key="tIdx"
                :class="{ 'mt-diff-common': tok.common }"
                >{{ tok.text }}</span
              >
            </template>
            <span v-else class="lyric-diff__empty">&nbsp;</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="summaryText" class="text-caption text-grey-5 q-mt-xs">{{ summaryText }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  cleanReturnedLyrics,
  diffLyricLines,
  diffSummary,
  highlightCommonWords,
  type DiffRow,
  type HighlightToken,
} from '@/models/lyricDiff';

const props = defineProps<{
  sourceText: string;
  returnedText: string;
  overlapScore?: number | null;
}>();

const emit = defineEmits<{
  adopt: [lyrics: string];
}>();

const returnedClean = computed(() => cleanReturnedLyrics(props.returnedText || ''));

const rows = computed(() =>
  returnedClean.value ? diffLyricLines(props.sourceText || '', returnedClean.value) : [],
);

const summary = computed(() => (rows.value.length ? diffSummary(rows.value) : null));

const summaryText = computed(() => {
  const s = summary.value;
  if (!s) return '';
  return `${s.equal} matching · ${s.changed} changed · ${s.onlyLeft} only in sheet · ${s.onlyRight} only in return`;
});

const overlapLabel = computed(() => {
  if (props.overlapScore == null) return '';
  return `${Math.round(props.overlapScore * 100)}% overlap`;
});

const overlapColor = computed(() => {
  const s = props.overlapScore;
  if (s == null) return 'grey';
  if (s >= 0.65) return 'positive';
  if (s >= 0.35) return 'warning';
  return 'negative';
});

function lineClass(row: DiffRow, side: 'left' | 'right'): string {
  if (row.kind === 'equal') return 'lyric-diff__line--equal';
  if (row.kind === 'change') return 'lyric-diff__line--change';
  if (row.kind === 'remove' && side === 'left') return 'lyric-diff__line--remove';
  if (row.kind === 'add' && side === 'right') return 'lyric-diff__line--add';
  return 'lyric-diff__line--gap';
}

function tokensFor(row: DiffRow, side: 'left' | 'right'): HighlightToken[] {
  if (row.kind === 'equal') {
    const line = side === 'left' ? row.left : row.right;
    return highlightCommonWords(line, line).map((t) => ({ ...t, common: true }));
  }
  if (row.kind === 'change') {
    return side === 'left'
      ? highlightCommonWords(row.left, row.right)
      : highlightCommonWords(row.right, row.left);
  }
  if (row.kind === 'remove' && side === 'left') {
    return highlightCommonWords(row.left, '');
  }
  if (row.kind === 'add' && side === 'right') {
    return highlightCommonWords(row.right, '');
  }
  return [];
}
</script>

<style scoped>
.lyric-diff__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  min-width: 0;
}

@media (max-width: 720px) {
  .lyric-diff__grid {
    grid-template-columns: 1fr;
  }
}

.lyric-diff__col {
  min-width: 0;
}

.lyric-diff__head {
  color: var(--mt-muted);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.35rem;
}

.lyric-diff__body {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.78rem;
  line-height: 1.45;
  background: #120f0c;
  border: 1px solid var(--mt-line);
  padding: 0.5rem 0.65rem;
  max-height: 16rem;
  overflow-x: hidden;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.lyric-diff__line {
  border-left: 3px solid transparent;
  padding-left: 0.4rem;
  margin: 0.05rem 0;
  min-height: 1.2em;
}

.lyric-diff__line--equal {
  border-left-color: var(--mt-ok);
  background: rgba(106, 154, 91, 0.08);
}

.lyric-diff__line--change {
  border-left-color: var(--mt-warn);
  background: rgba(232, 160, 69, 0.1);
}

.lyric-diff__line--remove {
  border-left-color: var(--mt-danger);
  background: rgba(196, 75, 60, 0.12);
}

.lyric-diff__line--add {
  border-left-color: #5b8f9a;
  background: rgba(91, 143, 154, 0.12);
}

.lyric-diff__line--gap {
  opacity: 0.35;
}

.lyric-diff__empty {
  display: inline-block;
  min-height: 1em;
}
</style>
