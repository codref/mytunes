<template>
  <div class="lyric-diff">
    <div class="lyric-diff__meta row items-center q-gutter-sm q-mb-sm">
      <div class="mt-label">{{ metaTitle }}</div>
      <q-badge v-if="overlapLabel" :color="overlapColor" text-color="dark">
        {{ overlapLabel }}
      </q-badge>
      <q-btn-toggle
        v-if="rightText"
        v-model="viewLayout"
        dense
        unelevated
        toggle-color="primary"
        toggle-text-color="dark"
        text-color="grey-5"
        size="sm"
        :options="layoutOptions"
      />
      <q-space />
      <slot name="actions">
        <q-btn
          v-if="showAdopt && rightText"
          flat
          dense
          color="primary"
          label="Adopt returned"
          @click="emit('adopt', rightText)"
        />
      </slot>
    </div>

    <div v-if="!rightText" class="text-caption text-grey-5">
      {{ emptyText }}
    </div>

    <div v-else-if="viewLayout === 'unified'" class="lyric-diff__unified">
      <div class="lyric-diff__body" aria-label="Unified lyrics diff">
        <template v-for="(block, idx) in unifiedBlocks" :key="`U-${idx}`">
          <div class="lyric-diff__line lyric-diff__line--row" :class="block.lineClass">
            <span class="lyric-diff__gutter" aria-hidden="true">{{ block.gutter }}</span>
            <span class="lyric-diff__content" :class="{ 'lyric-diff__content--strike': block.strike }">
              <span
                v-for="(tok, tIdx) in block.tokens"
                :key="tIdx"
                :class="{ 'mt-diff-common': tok.common }"
                >{{ tok.text }}</span
              >
              <span v-if="!block.tokens.length" class="lyric-diff__empty">&nbsp;</span>
            </span>
          </div>
        </template>
      </div>
    </div>

    <div v-else class="lyric-diff__grid">
      <div class="lyric-diff__col">
        <div class="lyric-diff__head">{{ leftHeading }}</div>
        <div class="lyric-diff__body" :aria-label="`${leftHeading} lyrics diff`">
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
        <div class="lyric-diff__head">{{ rightHeading }}</div>
        <div class="lyric-diff__body" :aria-label="`${rightHeading} lyrics diff`">
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
import { computed, ref, watch } from 'vue';
import {
  cleanReturnedLyrics,
  diffLyricLines,
  diffSummary,
  highlightCommonWords,
  type DiffRow,
  type HighlightToken,
} from '@/models/lyricDiff';

type DiffLayout = 'unified' | 'side-by-side';

type UnifiedBlock = {
  gutter: string;
  lineClass: string;
  strike: boolean;
  tokens: HighlightToken[];
};

const props = withDefaults(
  defineProps<{
    sourceText: string;
    returnedText: string;
    overlapScore?: number | null;
    metaTitle?: string;
    leftHeading?: string;
    rightHeading?: string;
    emptyText?: string;
    /** When true, run cleanReturnedLyrics on the right side (Lyria take mode). */
    cleanReturned?: boolean;
    showAdopt?: boolean;
    onlyLeftLabel?: string;
    onlyRightLabel?: string;
    layout?: DiffLayout;
  }>(),
  {
    overlapScore: null,
    metaTitle: 'Compare with last take',
    leftHeading: 'Your sheet',
    rightHeading: 'Lyria returned',
    emptyText: 'Generate a take to see Lyria’s returned lyrics beside your sheet.',
    cleanReturned: true,
    showAdopt: true,
    onlyLeftLabel: 'only in sheet',
    onlyRightLabel: 'only in return',
    layout: 'side-by-side',
  },
);

const emit = defineEmits<{
  adopt: [lyrics: string];
}>();

const viewLayout = ref<DiffLayout>(props.layout);
watch(
  () => props.layout,
  (next) => {
    viewLayout.value = next;
  },
);

const layoutOptions = [
  { label: 'Inline', value: 'unified' },
  { label: 'Side-by-side', value: 'side-by-side' },
];

const rightText = computed(() => {
  const raw = props.returnedText || '';
  if (props.cleanReturned) return cleanReturnedLyrics(raw);
  return raw;
});

const rows = computed(() =>
  rightText.value ? diffLyricLines(props.sourceText || '', rightText.value) : [],
);

const unifiedBlocks = computed((): UnifiedBlock[] => {
  const blocks: UnifiedBlock[] = [];
  for (const row of rows.value) {
    if (row.kind === 'equal') {
      blocks.push({
        gutter: ' ',
        lineClass: 'lyric-diff__line--equal',
        strike: false,
        tokens: highlightCommonWords(row.left, row.left).map((t) => ({ ...t, common: true })),
      });
    } else if (row.kind === 'remove') {
      blocks.push({
        gutter: '-',
        lineClass: 'lyric-diff__line--remove',
        strike: true,
        tokens: highlightCommonWords(row.left, ''),
      });
    } else if (row.kind === 'add') {
      blocks.push({
        gutter: '+',
        lineClass: 'lyric-diff__line--add',
        strike: false,
        tokens: highlightCommonWords(row.right, ''),
      });
    } else {
      blocks.push({
        gutter: '-',
        lineClass: 'lyric-diff__line--remove',
        strike: true,
        tokens: highlightCommonWords(row.left, row.right),
      });
      blocks.push({
        gutter: '+',
        lineClass: 'lyric-diff__line--add',
        strike: false,
        tokens: highlightCommonWords(row.right, row.left),
      });
    }
  }
  return blocks;
});

const summary = computed(() => (rows.value.length ? diffSummary(rows.value) : null));

const summaryText = computed(() => {
  const s = summary.value;
  if (!s) return '';
  return `${s.equal} matching · ${s.changed} changed · ${s.onlyLeft} ${props.onlyLeftLabel} · ${s.onlyRight} ${props.onlyRightLabel}`;
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

.lyric-diff__unified {
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
  overflow-wrap: break-word;
  word-break: normal;
}

.lyric-diff__line {
  border-left: 3px solid transparent;
  padding-left: 0.4rem;
  margin: 0.05rem 0;
  min-height: 1.2em;
}

/* Flex only for unified gutter + content — never wrap tokens as flex items. */
.lyric-diff__line--row {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
}

.lyric-diff__gutter {
  flex: 0 0 0.75rem;
  color: var(--mt-muted);
  user-select: none;
}

.lyric-diff__content {
  flex: 1 1 auto;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.lyric-diff__content--strike {
  text-decoration: line-through;
  opacity: 0.85;
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
